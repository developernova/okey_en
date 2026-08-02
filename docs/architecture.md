# Architecture

## Boundaries

```text
app/api/*                    HTTP transport only
server/content/*             YouTube and direct OpenAI ingestion
server/admin/*               content catalogue administration
server/daily-plan/*          daily progress and episode advancement
server/reminders/*           reminder preference and Telegram delivery
server/srs/*                 FSRS scheduling and return-day policy
server/progress/*            Comprehension metric
server/auth/*                Request identity boundary
db/*                         PostgreSQL schema and connection
```

Route handlers validate input, resolve identity, call one application service, and serialize the result. They do not contain scheduling, prompt, or SQL policy.

## Content ingestion

```text
YouTube URL
  → youtube-transcript
  → normalized timestamped segments
  → bounded transcript chunks
  → OpenAI strict JSON schema
  → transcript verification + confidence filter + deduplication
  → transactional upsert
```

The admin playlist flow uses the official YouTube Data API v3 through `googleapis` for public playlist metadata, ordering, thumbnails, duration, and caption status. It follows `nextPageToken` and reads every item in pages of up to 50. It does not bypass the canonical importer: each selected item runs strictly sequentially, with a 1.5-second pause between videos, through transcript retrieval, direct OpenAI extraction, transcript verification, and the same transactional upsert.

Re-importing an episode updates canonical content while preserving phrase IDs whenever the normalized phrase is unchanged. Existing user cards and review logs therefore remain valid. Removed phrases become inactive instead of being deleted.

## Content administration

`/admin` authenticates against `ADMIN_API_SECRET` once and uses a signed, expiring HttpOnly cookie for subsequent same-origin admin requests. Course and episode visibility is independent from ingestion state: `is_active` controls publication, while `ingestion_status` describes pipeline health. Reversible publication is the default action. An explicit hard-delete path transactionally clears dependent plans and progress pointers before database cascades remove episode-owned learning history.

## Authentication

Telegram Mini App requests keep their existing signed `initData` path. Native iOS and macOS clients use a server-mediated OIDC authorization-code flow with two separate PKCE boundaries: the server owns Telegram's verifier, while the app owns a handoff verifier bound to the login attempt. Telegram redirects to an HTTPS backend callback; the backend returns only a one-minute, single-use code through the fixed `catchenglish://auth` scheme. Provider authorization codes and identity tokens never enter the custom URL.

The callback validates state, RS256 signature through Telegram's JWKS, issuer, audience, expiry, and nonce before linking the stable OIDC subject to the existing Telegram user ID. Native sessions use random opaque credentials stored only as SHA-256 hashes. Access tokens last 15 minutes, refresh tokens rotate on every use, reuse revokes the full session, and an absolute one-year expiry bounds refresh rolling. A valid `Authorization: Bearer` header takes precedence over Mini App credentials and an invalid bearer token never falls back to another identity path. Native login starts consume atomic PostgreSQL fixed-window buckets for the stable device UUID and a global safety cap in the same transaction that creates the attempt. Refresh rotation claims user then session buckets, after token validity checks but before consumption, in its existing transaction; daily caps are 300 per user and 120 per session. The protected minute cron cleans expired attempts, access tokens, and buckets, but deletes refresh-token hashes only through the session cascade at absolute expiry.

## SRS

The UI's three answers map to FSRS as follows:

- `again` → `Rating.Again`
- `hard` → `Rating.Hard`
- `good` → `Rating.Good`
- `known` → `Rating.Easy` and suspend the card from future queues

Every review updates `user_cards` and appends an immutable `review_logs` row in one transaction.

The daily queue is a product policy layered above FSRS:

- 0–1 day gap: normal due queue and up to 8 new cards;
- 2–13 day gap: at most 25 urgent reviews, new cards paused;
- 14+ days: the same cap with `soft_restart` mode.

Unshown overdue cards keep their original due dates. Their FSRS history is never fabricated or silently rewritten.

## Comprehension

Coverage is frequency weighted:

```text
known token occurrences / all token occurrences
```

A lexeme counts as verified known when it is explicitly known with confidence ≥ 0.8 or its FSRS card has retrievability ≥ 0.8. Before enough individual evidence exists, the placement level contributes a probabilistic CEFR prior instead of marking every lower-level word as known. The displayed percentage is lexical coverage, not a claim about listening comprehension. The current tokenizer boundary is intentionally isolated in `server/content/text.ts`; replace it with a production English lemmatizer before calculating public-facing percentages over a large catalogue.

## Daily plan and progression

The first request on a user's local date creates one plan with `watch`, `review`, and `retell` items. Item completion is idempotent and stored server-side, so reloads and retries do not lose progress. Completing all three items marks the plan complete and advances `user_program_progress` to the next ready episode in sequence. The finished plan stays attached to its original episode for the rest of that date.

## Reminders

Reminder time is stored on the user and interpreted in the user's IANA timezone. An external scheduler invokes the dispatcher every minute. Before calling Telegram, it creates a unique `(user_id, delivery_date)` delivery claim; this prevents duplicate sends across concurrent workers. Completed daily plans are skipped, and failed sends remove the claim for retry.

## Deliberate next boundaries

1. Real-device Telegram QA covers Mini App launch, microphone permissions, and reminder deep links.
2. A durable worker consumes `ingestion_jobs` for bulk content.
3. Oxford 3000 import populates `lexemes` and initial `user_lexemes`.
