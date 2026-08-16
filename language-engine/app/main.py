from contextlib import asynccontextmanager

from fastapi import Depends, FastAPI

from app.analyzer import analyze_video, english_pipeline
from app.models import (
    AnalyzeVideoRequest,
    RankMoviesRequest,
    RankMoviesResponse,
    VideoLanguageAnalysis,
)
from app.ranker import rank_movies
from app.security import require_service_token


@asynccontextmanager
async def lifespan(_app: FastAPI):
    # Prepare NLP before health checks pass, avoiding a cold first request.
    english_pipeline()
    yield


app = FastAPI(
    title="Catch English Language Fit Engine",
    version="0.1.0",
    docs_url="/docs",
    redoc_url=None,
    lifespan=lifespan,
)


@app.get("/health")
def health() -> dict[str, str]:
    return {"status": "ok"}


@app.post(
    "/v1/analyze/video",
    response_model=VideoLanguageAnalysis,
    dependencies=[Depends(require_service_token)],
)
def analyze_video_route(payload: AnalyzeVideoRequest) -> VideoLanguageAnalysis:
    return analyze_video(payload)


@app.post(
    "/v1/rank/movies",
    response_model=RankMoviesResponse,
    dependencies=[Depends(require_service_token)],
)
def rank_movies_route(payload: RankMoviesRequest) -> RankMoviesResponse:
    return rank_movies(payload)
