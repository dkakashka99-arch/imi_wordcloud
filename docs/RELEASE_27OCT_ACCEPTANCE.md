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

## Installed diagnostic release and root cause

PR #26 merged as `9aa31be6ab43994fd7e6500396522a9a160cadd0`.
Main CI [40321115415](https://github.com/dkakashka99-arch/imi_wordcloud/actions/runs/40321115415) and Infrastructure [40321115639](https://github.com/dkakashka99-arch/imi_wordcloud/actions/runs/40321115639) passed.
Production [40321782485](https://github.com/dkakashka99-arch/imi_wordcloud/actions/runs/40321782485): backup (including restore) and deploy passed; installed SHA and image verified; acceptance failed.

Word-form and translation POSTs passed this time. A later transliteration POST failed with provider `quota` on `choose-model`, 60ms, request `12e9d5a7-659e-4bbf-921c-2d36e821614e`. See `GIGACHAT_503_ROOT_CAUSE.md`. This establishes a rate-limited discovery failure, not an invalid semantic decision. Historical failures have no retained exception cause.

Synthetic event cleanup and protected digest verification ran in finally; neither reported failure. The real event was not reset or changed by acceptance. Direct SSH remains unavailable; server work uses existing pinned workflow.

## First unfinished action

Validate and publish the model-catalog cache/single-flight and bounded 429 retry correction in a separate PR. Re-run direct 25-case regression and real HTTP acceptance on installed SHA. Finish the full 60-minute 250-participant test before declaring P0 ready. Then implement Live Cloud independently behind an off-by-default flag.

P0: **NOT READY**. Live Cloud: **NOT DONE**. Physical RF networks, phone QR and actual projector remain unverified.
