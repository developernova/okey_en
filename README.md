# Okey English

Telegram-native English learning through real video, contextual phrases, and FSRS.

## Local setup

1. Copy `.env.example` to `.env.local` and fill in PostgreSQL, OpenRouter, and admin credentials.
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

The importer is idempotent for a YouTube video. It downloads English subtitles, splits long transcripts, asks OpenRouter for strict structured output, verifies every phrase against the transcript, and stores the result.

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

OpenRouter assigns CEFR A1–C2 to every extracted phrase. After each import,
the course range is recalculated automatically from all active phrases in that
course.

The admin route is intentionally synchronous for the first vertical slice. Before bulk imports, move the same service behind a durable worker/queue; the `ingestion_jobs` table already provides the state model.

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
- inspecting the latest ingestion runs, model names, and errors.

Playlist preview uses the official YouTube Data API v3 through `googleapis`. Add an API key with YouTube Data API v3 enabled to `.env.local`:

```dotenv
YOUTUBE_API_KEY=replace-with-a-restricted-google-api-key
```

The admin reads every playlist item in pages of 50, then sends selected videos through the existing episode importer strictly one at a time with a 1.5-second pause between requests. One failure does not roll back earlier successes.

Hiding an episode remains the normal reversible action. Permanent deletion is available as a separate destructive action and removes the episode's plans, subtitles, phrases, cards, review logs, interview requests, and ingestion history in one transaction.

## Learning APIs

- `GET /api/daily-plan?episodeId=<uuid>` provisions episode cards and returns due reviews plus up to 15 new cards.
- `GET /api/today` creates or restores today's three-step plan. `POST /api/daily-plan/items` completes `watch`, `review`, or `retell` idempotently.
- `POST /api/reviews` accepts an idempotent card rating with `eventId`, `cardId`, `rating`, and `answeredAt`.
- `GET /api/progress/comprehension?episodeId=<uuid>` returns frequency-weighted vocabulary coverage.
- `POST /api/interview` starts or advances the three-question video interview. Conversation state is signed and returned to the client; message content is not stored in PostgreSQL.
- `GET` and `PUT /api/reminders` restore and update the current user's daily reminder time.

A completed daily plan advances the user's program to the next ready episode. The completed plan keeps its original episode, so reopening the app on the same local date still shows the finished day; the next episode starts with the following day's plan.

The interview uses `deepseek/deepseek-v4-flash` by default. PostgreSQL stores only request timestamps and request kind for the 10 requests/minute and 30 user messages/day limits. Before production, set a monthly spending cap for the OpenRouter API key in the OpenRouter dashboard; this is an account-side safety control and cannot be enforced reliably by the application process.

Voice answers are best-effort. Supported Telegram clients can record an answer and send it to the OpenRouter transcription endpoint using the same `OPENROUTER_API_KEY` as the interview. `OPENROUTER_TRANSCRIPTION_MODEL` defaults to `openai/whisper-large-v3`; any OpenRouter model with transcription output can be configured. Text input remains available at all times.

In Telegram, the client automatically sends raw `Telegram.WebApp.initData` with every learner API request. The server verifies its HMAC signature and 24-hour freshness using `TELEGRAM_BOT_TOKEN`, then creates or restores the matching row in `users`. In production, requests without valid `initData` fail closed. Browser development continues to use `DEV_USER_ID` or the `x-user-id` header when no `initData` is available.

## Telegram reminders

For browser-only development, add these values to `.env.local`. `TELEGRAM_BOT_TOKEN` becomes required when authenticating real Mini App requests and is also used for reminders:

```dotenv
TELEGRAM_BOT_TOKEN=123456:bot-token
DEV_TELEGRAM_CHAT_ID=123456789
REMINDER_CRON_SECRET=replace-with-a-random-secret-of-at-least-16-characters
# Optional until there is a public HTTPS TMA URL:
TELEGRAM_WEB_APP_URL=https://example.com
```

The development user must have opened the bot and sent `/start`; Telegram bots cannot initiate a conversation before that. `DEV_TELEGRAM_CHAT_ID` is copied to the development user when reminder settings are saved.

Run the dispatcher every minute. It compares the current minute in each user's timezone, skips a completed day, and records a daily idempotency claim before sending:

```bash
npm run reminders:send
```

Alternatively, schedule `POST /api/admin/reminders/send` every minute with `x-cron-secret: $REMINDER_CRON_SECRET`. A failed Telegram request releases its claim so a later invocation can retry. For deployment, use a platform cron or durable scheduler; the Next.js process does not contain an in-process timer.

## Quality checks

```bash
npm run typecheck
npm run lint
npm test
npm run build
```
