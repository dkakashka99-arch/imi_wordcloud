# AI admission and cosmetic cleanup — 26 October 2026

Branch: `feature/ai-admission-and-clean-ui`, based on main `dfb18f6` (PR22 already merged).

## Implemented

- Removed requested public footers, participant cookie explanation, projector slogans and routine update message. Connection error remains visible only on failure.
- Moved screen/organizer navigation to header buttons with wrapping on mobile.
- Server-side AI admission before storing a new answer: one coherent thought versus enumeration, profanity/sexual/inappropriate content, relevance, spelling, translation, canonical meaning and semantic family. Ordinary punctuation/conjunctions are not automatically rejected.
- Accepted analysis cached per question, normalized input, title and semantic revision. AI calls precede write locks; transaction rechecks question state, quotas and semantic revision. Provider failure or disabled AI in production rejects new writes without charging an answer. Successful idempotent replay remains available.
- Existing equivalence worker reconciles canonical terms, including concurrent admissions with stale candidate snapshots. Distinct related concepts keep different labels/counts and share family colors/placement centers. No vote counts are transferred between merely related concepts.
- Authenticated, Origin-checked `deleteEvent` and `clearAnswers` commands, title confirmation, UI confirmations, redirect after deletion. Clear removes participants/quota history, semantic queue/history/aliases, analysis, stop rules and AI jobs/summaries, preserving event/questions and incrementing semantic revision against in-flight work.
- Additive migration `0008_answer_analysis`; does not delete live data.

## Local verification

- Lint, TypeScript and production build pass.
- Unit tests cover strict admission output/unsafe generated values and family proximity; integration tests cover admission→database→screen with a mocked provider, rejection without quota use, fail-closed behavior, clear and cascading deletion. Existing suites preserved.
- HTTP harness uses precomputed analysis fixtures against the real production build; verifies write, replay, family aggregates, QR, restart persistence and admin authentication. Additional disabled-provider production check verifies 503 for new answers and successful safe replay.
- Native PostgreSQL concurrency, GitHub CI and real provider checks remain release gates. Local integration uses PGlite single connection (one existing native-only concurrency test skipped).
- Browser validation remains pending: Playwright Chromium download failed with truncated ZIP. Do not claim mobile visual QA completed.

## Remaining delivery (not performed)

1. User explicitly approved publishing the prepared changes on 26 October 2026 (message: «разрешаю»). Approval is resolved; do not request it again. Retried `git push -u origin feature/ai-admission-and-clean-ui` failed with `fatal: could not read Username for https://github.com: No such device or address`. Verified remote branch does not exist. GitHub connector account/repository reads consistently return `Unknown tool`. Plugin reports installed/enabled and Allow all actions, but actual account access is unavailable. First unfinished action: restore GitHub authentication for dkakashka99-arch/imi_wordcloud, then push application commit 50a34ee and this checkpoint. No deployment/live cleanup occurred.
2. Open PR via normal develop/main project flow; run CI/Infrastructure and review actual current head. No deployment or live event mutation occurred.
3. Run `node --import tsx scripts/check-admission-live.ts --live` on the existing trusted VPS using its configured provider. It tests legitimate compound phrases, enumerations, 18+ examples, typos/translations and family separation. No local GigaChat credential is available. Confirm latency under expected event traffic; synchronous admission makes provider availability part of submission availability. Do not represent fixture tests as model-quality evidence.
4. After successful release checks, deploy through existing backed-up production workflow and verify public URL/commit.
5. User explicitly authorized deleting all existing events except the student/employer meeting and clearing its answers. First inspect `node --import tsx scripts/prepare-event.ts --keep mir-27-oct` on the VPS; verify the preserved title is the requested meeting. With backup and correct event, execute the same command with `--apply`. It clears kept answers, deletes the captured other events, then verifies exactly one event with zero answers. This script is explicit, never run by migrations/deploy by default. Existing authorization to cleanup persists; no need to request it again.
6. Verify the actual public question and empty cloud, event list, real provider positive/negative flow, mobile header, and projector appearance. Remove any disposable test events/answers.
