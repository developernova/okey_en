from functools import lru_cache

import spacy
from spacy.language import Language

from app.models import AnalyzeVideoRequest, LearningLevel, VideoLanguageAnalysis

ASSUMED_FUNCTION_WORDS = {
    "a",
    "about",
    "after",
    "again",
    "all",
    "am",
    "an",
    "and",
    "any",
    "are",
    "as",
    "at",
    "be",
    "because",
    "been",
    "before",
    "but",
    "by",
    "can",
    "could",
    "did",
    "do",
    "does",
    "for",
    "from",
    "had",
    "has",
    "have",
    "he",
    "her",
    "him",
    "his",
    "how",
    "i",
    "if",
    "in",
    "into",
    "is",
    "it",
    "its",
    "just",
    "me",
    "more",
    "my",
    "no",
    "not",
    "of",
    "on",
    "one",
    "or",
    "our",
    "out",
    "she",
    "so",
    "some",
    "than",
    "that",
    "the",
    "their",
    "them",
    "then",
    "there",
    "they",
    "this",
    "to",
    "up",
    "us",
    "was",
    "we",
    "were",
    "what",
    "when",
    "where",
    "which",
    "who",
    "why",
    "will",
    "with",
    "would",
    "you",
    "your",
}

LEVEL_INDEX: dict[LearningLevel, int] = {"A2": 0, "B1": 1, "B2": 2, "C1": 3}
SPEECH_RATE_TARGET = {"A2": 105.0, "B1": 130.0, "B2": 155.0, "C1": 180.0}
UTTERANCE_TARGET = {"A2": 6.0, "B1": 8.0, "B2": 11.0, "C1": 14.0}


@lru_cache(maxsize=1)
def english_pipeline() -> Language:
    pipeline = spacy.blank("en")
    pipeline.add_pipe("sentencizer")
    pipeline.add_pipe("lemmatizer", config={"mode": "lookup"})
    pipeline.initialize()
    return pipeline


def _bounded(value: float) -> float:
    return max(0.0, min(1.0, value))


def _mean_segmental_diversity(lemmas: list[str], window_size: int = 50) -> float:
    if not lemmas:
        return 0.0
    windows = [
        lemmas[index : index + window_size]
        for index in range(0, len(lemmas), window_size)
    ]
    return sum(len(set(window)) / len(window) for window in windows) / len(windows)


def _material_level(
    speech_rate: float, average_utterance: float, lexical_diversity: float
) -> LearningLevel:
    points = 0
    if speech_rate >= 115:
        points += 1
    if speech_rate >= 145:
        points += 1
    if speech_rate >= 175:
        points += 1
    if average_utterance >= 7:
        points += 1
    if average_utterance >= 10:
        points += 1
    if average_utterance >= 14:
        points += 1
    if lexical_diversity >= 0.72:
        points += 1
    if lexical_diversity >= 0.82:
        points += 1

    if points <= 1:
        return "A2"
    if points <= 3:
        return "B1"
    if points <= 5:
        return "B2"
    return "C1"


def _coverage_fit(coverage: float) -> float:
    if 0.75 <= coverage <= 0.88:
        return 1.0
    if coverage < 0.75:
        return _bounded(coverage / 0.75)
    return _bounded(1.0 - (coverage - 0.88) * 2.5)


def analyze_video(payload: AnalyzeVideoRequest) -> VideoLanguageAnalysis:
    pipeline = english_pipeline()
    known = set(payload.known_lemmas) | ASSUMED_FUNCTION_WORDS
    lemmas: list[str] = []
    utterance_lengths: list[int] = []

    for document in pipeline.pipe(
        (segment.text for segment in payload.segments), batch_size=64
    ):
        utterance_words = 0
        for token in document:
            if not token.is_alpha:
                continue
            lemma = (token.lemma_ or token.lower_).casefold().strip()
            if not lemma:
                continue
            lemmas.append(lemma)
            utterance_words += 1
        if utterance_words:
            utterance_lengths.append(utterance_words)

    total_words = len(lemmas)
    unique_lemmas = len(set(lemmas))
    known_words = sum(1 for lemma in lemmas if lemma in known)
    coverage = known_words / total_words if total_words else 0.0
    average_utterance = (
        sum(utterance_lengths) / len(utterance_lengths) if utterance_lengths else 0.0
    )
    lexical_diversity = _mean_segmental_diversity(lemmas)

    first_offset = min(segment.offset_ms for segment in payload.segments)
    final_offset = max(
        segment.offset_ms + segment.duration_ms for segment in payload.segments
    )
    duration_minutes = max((final_offset - first_offset) / 60_000, 1 / 60)
    speech_rate = total_words / duration_minutes
    suggested_level = _material_level(speech_rate, average_utterance, lexical_diversity)

    speed_fit = _bounded(
        1.15 - speech_rate / (SPEECH_RATE_TARGET[payload.learner_level] * 1.35)
    )
    utterance_fit = _bounded(
        1.2 - average_utterance / (UTTERANCE_TARGET[payload.learner_level] * 1.5)
    )
    level_distance = abs(
        LEVEL_INDEX[payload.learner_level] - LEVEL_INDEX[suggested_level]
    )
    level_fit = _bounded(1.0 - level_distance * 0.3)
    fit_score = _bounded(
        _coverage_fit(coverage) * 0.5
        + speed_fit * 0.2
        + utterance_fit * 0.15
        + level_fit * 0.15
    )

    coverage_percent = round(coverage * 100)
    reasons = [f"Около {coverage_percent}% слов уже знакомы"]
    if speech_rate <= SPEECH_RATE_TARGET[payload.learner_level]:
        reasons.append("Скорость речи комфортна для текущего уровня")
    else:
        reasons.append("Скорость речи выше комфортной для текущего уровня")
    if average_utterance <= UTTERANCE_TARGET[payload.learner_level]:
        reasons.append("Реплики в среднем короткие")
    else:
        reasons.append("Встречаются длинные реплики")

    return VideoLanguageAnalysis(
        lexical_coverage=round(coverage, 4),
        unknown_density=round(1 - coverage, 4),
        speech_rate_wpm=round(speech_rate, 1),
        average_utterance_words=round(average_utterance, 1),
        lexical_diversity=round(lexical_diversity, 4),
        total_words=total_words,
        unique_lemmas=unique_lemmas,
        suggested_level=suggested_level,
        fit_score=round(fit_score, 4),
        reasons_ru=reasons,
    )
