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
