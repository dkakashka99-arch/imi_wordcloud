# Automatic semantic cloud rework — 25 October 2026

Implementation branch: feature/automatic-semantic-cloud, based on develop 5d1a5aa.
Production is NOT yet validated for this rework. Existing real event/data retained.

Implemented:

- Career-context deterministic equivalence rules for salary, remote work and team variants. Immutable original/normalized submission records; display aliases preserve every accepted vote. One short thought per submission; no splitting into hidden extra votes.
- Transactional durable deduplicated semantic_queue. Node instrumentation starts one sequential worker; shared PostgreSQL advisory lock coordinates with organizer AI. Batch of up to 12 unknown variants, existing candidate labels only, exact schema/referential checks, independent conservative verification, no model confidence threshold. No DB transaction is held during provider requests. Network/quota/TLS errors retain pending records with bounded backoff and persisted error code.
- semantic_history records dictionary/model/manual changes and model/rule version. Organizer can undo aliases and retry failed/review queue. Audited dictionary overrides are not silently reinstalled. Unknown/ambiguous meanings remain separate.
- Configurable public_audience_key. Migration configures mir-27-oct as student-only without deleting historical employer data. Old public employer links redirect to the student form; disallowed public audience API fails meaningfully. One projector QR and no compare/role navigation. Historical questions remain in organizer archive disclosure.
- Graphite-blue projector, dedicated QR space, local system fonts, measured natural glyph widths, bounded sorted top-36 layout with collision checks, no table fallback or stretched glyphs; all source categories/votes remain stored. Mobile form, status/poll recovery and reduced-motion styling.
- Synchronous rejection for obvious contacts/HTML/profanity/repeated spam/multiple thoughts; existing legacy HTML/PII still covered by moderation/export regression tests.

Verification on this branch:

- lint/typecheck: PASS.
- unit: 20 PASS.
- integration: 25 PASS, 1 existing native-concurrency test skipped in PostgreSQL WASM; native PostgreSQL remains a CI gate.
- build: PASS.
- HTTP: PASS cookie/POST/aggregate/idempotency/Origin/JSON/QR/pause/restart/admin auth/export controls.
- integration salary5 + remote3 + independent concepts: PASS without moderator interaction.
- injected provider quota failure then verified retry: PASS; accepted count and history retained. This is a fixture, not proof of live GigaChat.
- Browser executables could not be downloaded in the local environment (truncated archive). Added real Playwright acceptance test for independent sessions, five salary variants and collision/overflow/screenshots at 1366,1920,2560,3840 and mobile390; CI must pass before delivery.
- Production deploy/SHA, live unknown-variant classification, actual QR decode, 60-minute/200–300-participant soak: NOT YET VERIFIED.
- Physical Russian no-VPN iPhone/Android networks: not available to the agent.

Availability evidence reviewed: previous observation workflow 40204720350 had 300/300 external HTTP200 samples (max4.689083s) and 300/300 local app/TLS HTTP200 samples (max0.063196s). This did not reproduce the reported incident and is not a confirmed root cause or a 60-minute new-release soak.

Next action: complete CI browser checks, inspect screenshots, fix findings, merge only through required checks, backup/restore gate and normal production workflow; then validate the actual release and run the outstanding acceptance window. No main push, bypass, database reset or claimed full readiness.
