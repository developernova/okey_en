from typing import Literal

from pydantic import BaseModel, Field, field_validator

LearningLevel = Literal["A2", "B1", "B2", "C1"]


class TranscriptSegment(BaseModel):
    text: str = Field(min_length=1, max_length=2_000)
    offset_ms: int = Field(ge=0)
    duration_ms: int = Field(ge=0, le=600_000)


class AnalyzeVideoRequest(BaseModel):
    learner_level: LearningLevel
    known_lemmas: list[str] = Field(default_factory=list, max_length=30_000)
    segments: list[TranscriptSegment] = Field(min_length=1, max_length=5_000)

    @field_validator("known_lemmas")
    @classmethod
    def normalize_known_lemmas(cls, values: list[str]) -> list[str]:
        normalized = {value.strip().casefold() for value in values if value.strip()}
        return sorted(normalized)


class VideoLanguageAnalysis(BaseModel):
    lexical_coverage: float = Field(ge=0, le=1)
    unknown_density: float = Field(ge=0, le=1)
    speech_rate_wpm: float = Field(ge=0)
    average_utterance_words: float = Field(ge=0)
    lexical_diversity: float = Field(ge=0, le=1)
    total_words: int = Field(ge=0)
    unique_lemmas: int = Field(ge=0)
    suggested_level: LearningLevel
    fit_score: float = Field(ge=0, le=1)
    reasons_ru: list[str] = Field(min_length=2, max_length=4)
    analysis_version: Literal["language-fit-v1"] = "language-fit-v1"


class MovieCandidate(BaseModel):
    id: str = Field(min_length=1, max_length=64)
    title: str = Field(min_length=1, max_length=300)
    overview: str = Field(default="", max_length=5_000)
    media_type: Literal["movie", "tv"]
    learning_level: LearningLevel
    rating: float = Field(default=0, ge=0, le=10)
    genres: list[str] = Field(default_factory=list, max_length=20)
    language_summary: str = Field(default="", max_length=500)


class RankMoviesRequest(BaseModel):
    learner_level: LearningLevel
    candidates: list[MovieCandidate] = Field(min_length=1, max_length=100)
    preference_text: str = Field(default="", max_length=2_000)
    recent_ids: list[str] = Field(default_factory=list, max_length=500)
    limit: int = Field(default=12, ge=1, le=30)


class RankedMovie(BaseModel):
    id: str
    score: float = Field(ge=0, le=1)
    reasons_ru: list[str] = Field(min_length=1, max_length=3)


class RankMoviesResponse(BaseModel):
    items: list[RankedMovie]
    ranking_version: Literal["content-fit-v1"] = "content-fit-v1"
