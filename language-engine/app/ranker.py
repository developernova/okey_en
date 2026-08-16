from collections import Counter

import numpy as np
from sklearn.feature_extraction.text import TfidfVectorizer
from sklearn.metrics.pairwise import cosine_similarity

from app.models import (
    LearningLevel,
    MovieCandidate,
    RankedMovie,
    RankMoviesRequest,
    RankMoviesResponse,
)

LEVEL_INDEX: dict[LearningLevel, int] = {"A2": 0, "B1": 1, "B2": 2, "C1": 3}


def _level_fit(candidate: LearningLevel, learner: LearningLevel) -> float:
    distance = LEVEL_INDEX[candidate] - LEVEL_INDEX[learner]
    if distance == 0:
        return 1.0
    if distance == -1:
        return 0.9
    if distance < -1:
        return 0.65
    if distance == 1:
        return 0.45
    return 0.2


def _document(candidate: MovieCandidate) -> str:
    return " ".join(
        [
            candidate.title,
            candidate.overview,
            " ".join(candidate.genres),
            candidate.language_summary,
        ]
    ).strip()


def _deduplicated(candidates: list[MovieCandidate]) -> list[MovieCandidate]:
    by_id: dict[str, MovieCandidate] = {}
    for candidate in candidates:
        stored = by_id.get(candidate.id)
        if stored is None or candidate.rating > stored.rating:
            by_id[candidate.id] = candidate
    return list(by_id.values())


def _semantic_matrices(
    candidates: list[MovieCandidate], preference_text: str
) -> tuple[np.ndarray, np.ndarray]:
    documents = [_document(candidate) for candidate in candidates]
    preference = preference_text.strip()
    try:
        matrix = TfidfVectorizer(
            stop_words="english", ngram_range=(1, 2), max_features=5_000
        ).fit_transform([*documents, preference or "general conversation"])
        candidate_matrix = matrix[:-1]
        preference_scores = (
            cosine_similarity(candidate_matrix, matrix[-1]).reshape(-1)
            if preference
            else np.zeros(len(candidates))
        )
        similarities = cosine_similarity(candidate_matrix)
        return preference_scores, similarities
    except ValueError:
        return np.zeros(len(candidates)), np.eye(len(candidates))


def rank_movies(payload: RankMoviesRequest) -> RankMoviesResponse:
    recent = set(payload.recent_ids)
    unique = _deduplicated(payload.candidates)
    fresh = [candidate for candidate in unique if candidate.id not in recent]
    candidates = fresh if fresh else unique
    preference_scores, similarities = _semantic_matrices(
        candidates, payload.preference_text
    )

    base_scores: list[float] = []
    for index, candidate in enumerate(candidates):
        score = (
            _level_fit(candidate.learning_level, payload.learner_level) * 0.68
            + min(candidate.rating / 10, 1) * 0.17
            + float(preference_scores[index]) * 0.15
        )
        base_scores.append(score)

    selected: list[int] = []
    media_counts: Counter[str] = Counter()
    remaining = set(range(len(candidates)))
    limit = min(payload.limit, len(candidates))
    while remaining and len(selected) < limit:

        def adjusted_score(index: int) -> tuple[float, str]:
            similarity_penalty = (
                max(float(similarities[index, chosen]) for chosen in selected)
                if selected
                else 0.0
            )
            media_penalty = media_counts[candidates[index].media_type] * 0.025
            adjusted = base_scores[index] - similarity_penalty * 0.16 - media_penalty
            return adjusted, candidates[index].id

        best = max(remaining, key=adjusted_score)
        selected.append(best)
        remaining.remove(best)
        media_counts[candidates[best].media_type] += 1

    items: list[RankedMovie] = []
    for index in selected:
        candidate = candidates[index]
        reasons = [
            (
                f"Сложность английского соответствует уровню {payload.learner_level}"
                if candidate.learning_level == payload.learner_level
                else f"Английский оценён как {candidate.learning_level}"
            )
        ]
        if preference_scores[index] >= 0.08:
            reasons.append("Тематика близка выбранному контексту")
        if candidate.rating >= 7:
            reasons.append("Высокая зрительская оценка")
        items.append(
            RankedMovie(
                id=candidate.id,
                score=round(max(0.0, min(1.0, base_scores[index])), 4),
                reasons_ru=reasons[:3],
            )
        )

    return RankMoviesResponse(items=items)
