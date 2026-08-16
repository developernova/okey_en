# Personal area

The personal area lives under `/my`. It intentionally has no persistent sidebar
or bottom tab bar: Today is the only root screen and the interface presents no
navigation decision before the daily plan is complete.

## Navigation

| Entry point                   | Destination      | Purpose                                                         |
| ----------------------------- | ---------------- | --------------------------------------------------------------- |
| App root                      | Today            | The self-contained core learning cycle.                         |
| Settings icon on Today        | Settings         | Theme, reminders, programme, contacts, and data credits.        |
| “Want more?” after completion | My phrases       | Difficult or fading phrases and optional conversation practice. |
| “Want more?” after completion | Films and series | A finite catalogue of real films and series.                    |

The optional destinations remain available for the rest of a completed day,
including after reopening the app. Before completion they are not presented as
locked rewards; a neutral note says they open after today's plan. Every
secondary screen has a direct route back to Today.

There is no Progress destination until the product can show evidence of an
independently demonstrated skill rather than activity counters.

## Today

- It is the primary destination and visual center of the product.
- Nothing from Watch creates, replaces, or reorders its tasks.
- Only scheduled work here can change spaced-repetition state.
- The daily cycle has a clear end and does not continue into the catalog.

## My phrases

- Shows phrases that are currently difficult or at risk of being forgotten.
- A learner can open a contextual conversation to use a phrase naturally.
- Conversation is ungraded and does not move due dates, ease, interval, or
  repetition count.
- Viewing a phrase is not a repetition.
- Only the scheduled review inside Today can update the SRS result.

## Watch

The navigation label stays short. The page itself is titled “Films and series”.
Metadata comes from TMDB when `TMDB_API_READ_TOKEN` is configured; a curated
real-title fallback keeps local development useful without a token. TMDB is a
metadata and provider source, not a video host.

- The entry screen is a catalog, not an autoplaying player.
- A learner chooses a title, episode, or finite collection before playback.
- Scenes do not use an infinite vertical feed.
- There is no autoplay into another title or algorithmic continuation.
- A next scene is an explicit action and the current collection has a visible
  end.
- Watching, replaying, opening an explanation, or selecting a phrase does not
  affect Today or SRS.
- A phrase may be saved as a note only after an explicit action; saving it does
  not silently schedule a review.

## Data boundaries

| Event                         | May affect Today | May affect SRS | May be neutral history |
| ----------------------------- | ---------------- | -------------- | ---------------------- |
| Scheduled review result       | Yes              | Yes            | Yes                    |
| Phrase conversation practice  | No               | No             | Yes                    |
| Catalog selection             | No               | No             | Yes                    |
| Scene watched or replayed     | No               | No             | Yes                    |
| Contextual explanation opened | No               | No             | Yes                    |

Recommendation in Watch is allowed to use explicit interests and broad level
fit. It must not optimize for session length, swipe count, or compulsive
continuation.
