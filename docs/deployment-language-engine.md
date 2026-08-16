# Deploying the Python Language Fit Engine

The language engine is intentionally a separate stateless service. It does not
connect to PostgreSQL and it does not receive Telegram credentials, OpenAI
keys, or browser cookies. The Next.js server sends only the transcript and
language data required for one calculation.

## Safe rollout

1. Build and start `language-engine/Dockerfile` as a private service.
2. Generate one random secret of at least 16 characters and set it as
   `LANGUAGE_ENGINE_TOKEN` on both services.
3. Verify `GET /health` returns `{"status":"ok"}`.
4. Set `LANGUAGE_ENGINE_URL` on the Next.js service to the Python service's
   internal URL, for example `http://language-engine:8000`.
5. Restart only the Next.js service.

This order avoids downtime. Before step 4, the application keeps using its
existing TypeScript logic. After step 4, a failed connection or invalid Python
response is ignored after a short timeout and the application uses the same
fallback.

## Same Docker host

For a host-based Next.js process, the provided compose file publishes the
engine only on loopback:

```bash
LANGUAGE_ENGINE_TOKEN=replace-with-at-least-16-characters \
  docker compose -f compose.language-engine.yaml up -d --build
```

Use `http://127.0.0.1:8000` as `LANGUAGE_ENGINE_URL`. The port is not reachable
from the public network.

If both services belong to the same Compose or platform network, do not publish
the port. Use `expose: ["8000"]` and the internal URL
`http://language-engine:8000` instead.

## Separate container platform

Deploy `language-engine/Dockerfile` as a second service and use its private
service address. If the platform cannot provide private networking, use HTTPS
and keep the token secret. Only `/health` is unauthenticated; `/v1/analyze/video`
and `/v1/rank/movies` require `Authorization: Bearer <token>`.

One worker is deliberate: the spaCy pipeline and TF-IDF calculations are small,
while multiple workers duplicate the NLP model in memory. Scale horizontally
only after measuring real traffic. The service is stateless, so additional
replicas require no migration or shared disk.

## Independent checks

```bash
docker build -t catch-english-language-engine ./language-engine
docker run --rm -p 127.0.0.1:8000:8000 \
  -e LANGUAGE_ENGINE_TOKEN=replace-with-at-least-16-characters \
  catch-english-language-engine
curl http://127.0.0.1:8000/health
```

The Python service introduces no database migration. Deployment of the main
application remains unchanged.
