# Admission HTTP 503: confirmed provider rate limit during model discovery

26 October 2026, Europe/Samara. Scope: imi_wordcloud only.

## Evidence

Installed diagnostic release `9aa31be6ab43994fd7e6500396522a9a160cadd0`, Production [40321782485](https://github.com/dkakashka99-arch/imi_wordcloud/actions/runs/40321782485), acceptance job `121569485533`.

- SSH workflow checked current-release and container image at that SHA; restarts=0, OOM=false.
- All word-form POSTs and all translation POSTs returned 200 in this run.
- A later transliteration POST returned 503 with request ID `12e9d5a7-659e-4bbf-921c-2d36e821614e`.
- The same request's sanitized application log: `providerErrorCode=quota`, `stage=choose-model`, `elapsedMs=60`, `candidateCount=1`, HTTP 503.
- `quota` is the client's mapping of provider HTTP 429. The failure occurs while discovering/validating the selected model, before admission generation or database write. The admitted phrase is not the cause established by this trace.

The client called `GET /models` for every new analysis. It cached OAuth, but neither cached the validated catalog nor shared concurrent discovery. Explicit 429 immediately escaped into the generic admission 503 catch. A direct model test may pass while a longer HTTP sequence accumulates redundant discovery calls. The current trace confirms this failure class; the old releases discarded the exception, so their individual failures cannot retrospectively be proven to have the same cause.

## Minimal correction

- Cache a successfully validated model catalog for five minutes per configured client; share in-flight discovery. Continue checking requested model membership, refresh on TTL, never cache errors. Config signature changes already create a separate client.
- For explicit HTTP 429 only, retry at most twice with 500ms/1500ms backoff within the operation deadline. Persistent quota errors remain errors; ambiguous timeout/network/5xx generation is not automatically retried.
- Pass the remaining deadline to transport. Empty-content retry shares the original generation deadline. No infinite retry or increased provider timeout.
- Keep schema/normalization validation, safety checks, public fail-closed behavior and submission idempotency unchanged.

## Verification gates

Unit regression: 250 concurrent discoveries plus successive answers use one catalog request; TTL expiry refreshes; unavailable model stays rejected; failed discovery is retried only by a later call; transient 429 recovers; persistent 429 is bounded. Native PostgreSQL/browser CI and final deployed HTTP/60-minute acceptance remain required.

Production acceptance now also invokes the existing 25-case direct admission suite. Word-form/translation direct calls use candidates read from the same synthetic question, followed by real POSTs with request IDs and timings. This distinguishes empty/populated candidate context and direct/HTTP execution.

Status: correction prepared; **do not mark 503 resolved until final installed-SHA acceptance succeeds**.

## Second production trace: shared account concurrency

Production [40324405627](https://github.com/dkakashka99-arch/imi_wordcloud/actions/runs/40324405627), installed `5ea52356cad43563812f247d81dbbf16a450cc25`:

- Direct admission regression passed 25/25.
- HTTP word-form cases passed, as did the initial translation POSTs.
- The direct translation control then failed with `AiError(quota)` in `GigaClient.generate`, despite the cached catalog and bounded retries. No application POST failed in that run before this independent direct control stopped the chain.
- Official provider documentation explicitly describes 429 when concurrent requests exceed the client allowance; by default individuals have one simultaneous stream: https://developers.sber.ru/docs/ru/gigachat/api/errors-description (checked 26 October 2026).
- Admission requests had no shared budget with the background worker or tools. The worker/organizer lock `(714021,4)` coordinated only those background operations. Different processes and HTTP calls could still use the same account concurrently. Thus catalog caching alone is insufficient.

Follow-up correction: serialize provider transport requests locally and coordinate sessions across application, worker and trusted tools using a separate PostgreSQL advisory lock `(714021,5)`. No schema migration. No question/submission transaction is held during provider I/O. Use a dedicated one-connection pool per process and bound queue/transport waiting by the original request deadline; destroy failed sessions to release uncertain locks. Preserve cached model discovery and bounded explicit 429 retry for external account users that cannot participate in this lock.

Regression: separate database client pools must never overlap their synthetic network work, even after an injected failure; late/expired local waiters cannot jump the queue or leak the lock. Native PostgreSQL CI is authoritative for session-lock behavior; the WASM single-backend test contour skips that cross-session test explicitly.
