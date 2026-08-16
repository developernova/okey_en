# Movie language intelligence

The film catalog should help a learner choose something they can enjoy in
English. It must not turn uncertain model knowledge into a confident CEFR
label or turn viewing activity into learning progress.

## Source boundaries

- TMDB supplies title metadata, images, genres, release data, and external IDs.
- Kinopoisk API Unofficial supplies external platform links when available.
- OpenAI produces the current preliminary difficulty estimate from TMDB
  metadata: the recognized title, description, genres, year, and media type.
- An approved subtitle source or an administrator-supplied subtitle file will
  supply stronger English language evidence in a later version.
- OpenAI is not a source for availability, plot facts, or subtitle text.

Provider links and language analysis are independent. A title may have links
without a language profile, or a language profile without a provider link.

## What may be shown

A current metadata-based language profile may include:

- a broad CEFR fit;
- a short explanation of why the title may feel easier or harder;
- two or three likely difficulty factors;
- internal confidence and analysis provenance.

It is always presented as a preliminary estimate. It must not claim measured
vocabulary coverage, subtitle statistics, exact speech pace, or a specific
accent unless those were established from real language evidence.

Do not claim accent clarity, pronunciation difficulty, or audio quality from
subtitles alone. Those require an audio sample or manual editorial evidence.

## Pipeline

1. Import English-language candidates from TMDB.
2. Ask the text model for a structured preliminary estimate from the supplied
   metadata.
3. Store the result with model, prompt version, metadata hash, and confidence.
4. Reuse the stored result until the metadata, model, or prompt changes.
5. Later, resolve the title to a verified English subtitle edition.
6. Calculate deterministic subtitle statistics and lexeme frequencies.
7. Replace or augment the metadata estimate with a subtitle-grounded profile.

The first request may analyze uncached titles in one batch. Subsequent catalog
views reuse the stored profiles, keeping cost and latency bounded.

## Personalization

Store title lexemes and their frequencies separately from the model summary.
Personal vocabulary coverage can then be calculated against the learner's
known lexemes without another model request. Recommendations should use level
fit, explicit interests, and availability. They must not use watch time,
scrolling, or session length.

Watching a title, opening a provider link, or reading its language profile is
neutral activity. None of these actions updates Today or spaced repetition.

## Python ranking boundary

Before the final AI choice, the finite TMDB candidate pool passes through the
Python Language Fit Engine. It removes recent titles and duplicates, weighs
CEFR fit above engagement, matches interests with TF-IDF, and reduces repeated
near-identical recommendations. The model then receives that bounded ranking
and writes the final short explanations.

This component does not generate an endless feed and does not change Today or
spaced repetition. It only makes the optional daily film selection more varied,
level-appropriate, and explainable.

## MVP order

1. Keep real provider links from Kinopoisk and an honest TMDB fallback.
2. Add cached structured AI estimates from TMDB metadata and label them as
   preliminary.
3. Add administrator review for low-confidence or popular titles.
4. Add automatic subtitle statistics and learner vocabulary coverage.
5. Replace preliminary estimates with subtitle-grounded profiles when those
   are available.
6. Decide whether a series profile represents an episode, season, or reviewed
   sample before claiming subtitle-grounded precision.
