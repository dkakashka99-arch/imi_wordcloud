# 27 October release — active checkpoint

Updated 26 October 2026, Europe/Samara. Task: uploaded IMI WordCloud acceptance/503/live-cloud specification. IMI One excluded.

## Verified starting state

- main: `66edb1e285a217a19d14128b49e789ee99ed9526` (PR #25).
- Production run [40314195180](https://github.com/dkakashka99-arch/imi_wordcloud/actions/runs/40314195180): backup/deploy success, acceptance failure. Installed SHA verified by that job, image matches main, restarts=0, OOM=false at that time. This is historical evidence, not a new live SSH inventory.
- Acceptance failed on `POST word-form`, 503 rather than 200. Existing catch discards the exception; exact cause is **unconfirmed**.
- Public `/api/ready` HEAD returned 200 from this workspace. This does not prove submission readiness.
- GitHub connector can read/write repository and read Actions logs; direct SSH credentials are not available in this workspace. Use existing pinned SSH production workflow.

## Diagnostic release: PR #26

- Preserve admission policy, provider, schema enforcement, TLS and fail-closed behavior.
- Add per-request UUID response header and fixed diagnostic codes for model/generation/schema/normalized-output failures. No raw texts, prompts, exceptions, tokens or cookies in logs.
- Acceptance no longer reads live texts into a model or updates the real event queue under a dry-run name.
- Protect real-event rows and metadata with a consistent read-only digest (including queue error_detail, moderation, history, analysis).
- Delete only the synthetic event created by this invocation; require matching UUID/slug and rehearsal flag before cleanup. Always verify protected digest after cleanup, even on failure.
- Increase semantic test HTTP deadline from 15s to the participant's 70s budget. Provider timeout is unchanged; this is deadline consistency, **not a root-cause fix**.
- On acceptance failure collect only allowlisted diagnostic JSON, never raw container log output.

Local validation: lint, typecheck, 38 unit tests, production build passed. Isolated PostgreSQL-WASM integration: 35 passed, one native-concurrency test skipped; HTTP flow passed (including restart, idempotency, Origin and QR). Native PostgreSQL/browser results must come from CI; do not substitute these local checks for production acceptance.

## First unfinished action

Finish PR #26 CI/Infrastructure on its final head, review and merge through normal workflow. Obtain a real failing POST trace on installed diagnostic SHA, read its safe provider code/stage, then choose the smallest evidence-based fix. Do not claim the 503 fixed before final production acceptance.

P0: **NOT READY**. Live Cloud: **NOT DONE**. Do not start unrelated UI changes before P0 evidence.

Production data was not directly modified in this session. Only isolated local fixtures have been created/cleaned so far. No production synthetic test has been launched from this workspace. Physical RF networks, phone QR and actual projector remain unverified.
