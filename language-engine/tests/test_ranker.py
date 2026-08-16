from app.models import MovieCandidate, RankMoviesRequest
from app.ranker import rank_movies


def movie(
    identifier: str,
    level: str,
    rating: float,
    overview: str = "A family talks about everyday life.",
) -> MovieCandidate:
    return MovieCandidate(
        id=identifier,
        title=identifier,
        overview=overview,
        media_type="movie" if identifier.startswith("movie") else "tv",
        learning_level=level,
        rating=rating,
        genres=["comedy"],
        language_summary="Everyday conversational English",
    )


def test_ranker_deduplicates_and_excludes_recent_titles() -> None:
    result = rank_movies(
        RankMoviesRequest(
            learner_level="B1",
            candidates=[
                movie("movie-1", "B1", 7.0),
                movie("movie-1", "B1", 8.0),
                movie("movie-2", "C1", 9.0),
                movie("tv-3", "B1", 7.5),
            ],
            recent_ids=["movie-2"],
            limit=3,
        )
    )

    identifiers = [item.id for item in result.items]
    assert identifiers == ["movie-1", "tv-3"]
    assert len(identifiers) == len(set(identifiers))


def test_ranker_prefers_level_fit_over_popularity() -> None:
    result = rank_movies(
        RankMoviesRequest(
            learner_level="A2",
            candidates=[
                movie("movie-easy", "A2", 7.0),
                movie("movie-hard", "C1", 10.0),
            ],
            limit=2,
        )
    )

    assert result.items[0].id == "movie-easy"
