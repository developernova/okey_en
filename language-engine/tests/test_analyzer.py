from app.analyzer import analyze_video
from app.models import AnalyzeVideoRequest, TranscriptSegment


def test_analyzer_returns_explainable_language_fit() -> None:
    result = analyze_video(
        AnalyzeVideoRequest(
            learner_level="B1",
            known_lemmas=["family", "talk", "weather", "travel"],
            segments=[
                TranscriptSegment(
                    text="The family talks about the weather.",
                    offset_ms=0,
                    duration_ms=3_000,
                ),
                TranscriptSegment(
                    text="They travel after lunch.",
                    offset_ms=4_000,
                    duration_ms=2_000,
                ),
            ],
        )
    )

    assert result.total_words == 10
    assert result.lexical_coverage >= 0.8
    assert result.speech_rate_wpm == 100.0
    assert result.suggested_level in {"A2", "B1", "B2", "C1"}
    assert 0 <= result.fit_score <= 1
    assert len(result.reasons_ru) == 3


def test_analyzer_does_not_claim_unknown_content_is_known() -> None:
    result = analyze_video(
        AnalyzeVideoRequest(
            learner_level="A2",
            known_lemmas=[],
            segments=[
                TranscriptSegment(
                    text="Photosynthesis transforms electromagnetic radiation.",
                    offset_ms=0,
                    duration_ms=2_000,
                )
            ],
        )
    )

    assert result.lexical_coverage == 0
    assert result.unknown_density == 1
