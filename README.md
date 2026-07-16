# Okey English

Telegram-native English learning through real video, contextual phrases, and FSRS.

## Local setup

1. Copy `.env.example` to `.env.local` and fill in PostgreSQL, OpenAI, voice-only OpenRouter, and admin credentials.
2. Generate and apply the database migration:

```bash
npm run db:generate
npm run db:migrate
```

3. Create a development user in PostgreSQL and put its UUID into `DEV_USER_ID`.
4. Start the application:

```bash
npm run dev
```

## Import an episode

The importer is idempotent for a YouTube video. It downloads English subtitles, splits long transcripts, asks OpenAI for strict structured output, verifies every phrase against the transcript, and stores the result.

```bash
curl -X POST http://localhost:3000/api/admin/episodes/import \
  -H 'Content-Type: application/json' \
  -H 'x-admin-secret: replace-with-your-secret' \
  -d '{
    "youtubeUrl": "https://www.youtube.com/watch?v=VIDEO_ID",
    "title": "Episode title",
    "program": {
      "slug": "easy-english",
      "title": "Easy English"
    },
    "sequenceNumber": 1,
    "maxPhrases": 15
  }'
```

OpenAI assigns CEFR A1–C2 to every extracted phrase. After each import,
the course range is recalculated automatically from all active phrases in that
course.

The single-episode admin route is synchronous. Playlist imports use the database-backed background queue and continue after the admin page is closed.

## Content admin

Open `/admin` and sign in with `ADMIN_API_SECRET`. The browser submits the secret once and receives an eight-hour HttpOnly, SameSite session cookie; the secret is not stored in local or session storage.

The admin MVP supports:

- catalogue totals and recent episode status;
- creating and editing courses, descriptions, and slugs; CEFR ranges are derived automatically from imported phrases;
- publishing or hiding a course without deleting learner progress;
- importing a YouTube episode into an existing course;
- previewing a public YouTube playlist, selecting videos, and importing them sequentially with per-video progress;
- editing an episode title and sequence number;
- publishing or hiding an individual episode independently of ingestion status;
- permanently deleting an episode and all episode-owned learning data after an explicit two-step confirmation;
- viewing the stored transcript with search and clickable timecodes, extracted phrases, the embedded video, and episode-specific ingestion history;
- inspecting the latest ingestion runs, retry state, model names, token usage, USD cost, and errors.

Playlist preview uses the official YouTube Data API v3 through `googleapis`. Add an API key with YouTube Data API v3 enabled to `.env.local`:

```dotenv
YOUTUBE_API_KEY=replace-with-a-restricted-google-api-key
```

The admin reads every playlist item in pages of 50, deduplicates videos, and queues at most 500 items per batch. The worker imports strictly one at a time with a 1.5-second pause. Temporary YouTube failures use bounded retries; a CAPTCHA, 429, or provider-wide 5xx pauses the remaining queue instead of burning the batch. OpenAI completion tokens are capped, and token usage is persisted after every completed transcript chunk. The displayed USD value is an estimate at the standard `gpt-5.4-mini` list price; eligible shared-data traffic can be charged at zero within OpenAI's daily allowance.

Hiding an episode remains the normal reversible action. Permanent deletion is available as a separate destructive action and removes the episode's plans, subtitles, phrases, cards, review logs, interview requests, and ingestion history in one transaction.

## Learning APIs

- `GET /api/daily-plan?episodeId=<uuid>` provisions episode cards and returns due reviews plus up to 15 new cards.
- `GET /api/today` creates or restores today's three-step plan. `POST /api/daily-plan/items` completes `watch`, `review`, or `retell` idempotently.
- `POST /api/reviews` accepts an idempotent card rating with `eventId`, `cardId`, `rating`, and `answeredAt`.
- `GET /api/progress/comprehension?episodeId=<uuid>` returns frequency-weighted vocabulary coverage.
- `POST /api/interview` starts or advances the three-question video interview. The current workday's conversation is restored from PostgreSQL and replaced when a new daily plan starts.
- `GET` and `PUT /api/reminders` restore and update the current user's daily reminder time.

A completed daily plan advances the user's program to the next ready episode. The completed plan keeps its original episode, so reopening the app on the same local date still shows the finished day; the next episode starts with the following day's plan.

Text generation for imports and interviews goes directly to OpenAI and uses `gpt-5.4-mini` by default through `OPENAI_TEXT_MODEL`. The selected OpenAI project can participate in complimentary daily usage when project data sharing is enabled and the account remains eligible; usage beyond OpenAI's allowance is billed normally. The interview rate-limit ledger stores request timestamps and request kind for the 10 requests/minute and 30 user messages/day limits; the separate daily interview session stores only the current workday's chat.

Voice answers are best-effort and remain on a separate private path. Supported Telegram clients can record an answer and send it only to the OpenRouter transcription endpoint using `OPENROUTER_API_KEY`. `OPENROUTER_TRANSCRIPTION_MODEL` defaults to `openai/whisper-large-v3`; any OpenRouter model with transcription output can be configured. The resulting transcript is then treated like a typed answer. Text input remains available at all times.

In Telegram, the client automatically sends raw `Telegram.WebApp.initData` and the device's IANA timezone with every learner API request. The server verifies the init-data HMAC signature and 24-hour freshness using `TELEGRAM_BOT_TOKEN`, validates the timezone, then creates or restores the matching row in `users`. The verified WebApp profile fields (name, username, language, Premium and messaging/menu flags, and photo URL when Telegram provides it) are refreshed on every authenticated request; raw `initData` is never stored. In production, requests without valid `initData` fail closed. Browser development continues to use `DEV_USER_ID` or the `x-user-id` header when no `initData` is available.

## Telegram reminders

For browser-only development, add these values to `.env.local`. `TELEGRAM_BOT_TOKEN` becomes required when authenticating real Mini App requests and is also used for reminders:

```dotenv
TELEGRAM_BOT_TOKEN=123456:bot-token
REMINDER_CRON_SECRET=replace-with-a-random-secret-of-at-least-16-characters
# Optional until there is a public HTTPS TMA URL:
TELEGRAM_WEB_APP_URL=https://example.com
```

Telegram bots cannot initiate a conversation before a user has opened the bot and sent `/start`. Reminder settings never modify the Telegram identity stored for a user.

Run the dispatcher every minute. It checks a grace window in each user's timezone, skips a completed day, and takes an atomic daily delivery lease before sending:

```bash
npm run reminders:send
```

Alternatively, schedule `POST /api/admin/reminders/send` every minute with `x-cron-secret: $REMINDER_CRON_SECRET`. Failed Telegram requests retain their delivery record and retry with bounded backoff; parallel cron calls cannot send the same reminder twice. The same tick wakes the database-backed playlist import queue after a deploy or process restart. For deployment, use a platform cron or durable scheduler; the Next.js process does not rely on an in-process timer for recovery.

## Quality checks

```bash
npm run typecheck
npm run lint
npm test
npm run build
```
