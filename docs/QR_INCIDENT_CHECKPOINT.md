# QR availability incident checkpoint — 25 October 2026

## Current state
Incident OPEN: recurring Safari LTE timeout reported by owner. Do not claim the phone issue resolved or ask owner more operator / Wi-Fi / screenshot questions. Available probes did not reproduce the reported intermittent failure.

Application release 6245b7abf9fa91e369f088fafe2f42c5bc2b393e is deployed on https://imi-cloudpoll.ru (Production 40203381788 and idempotent callback 40203564397). It fixes omitted cloud words and bounds participant/projector fetch+JSON processing with abort/timeout. Main CI and Infrastructure passed. Preserve user events, rehearsal-25-oct and all responses.

## Actions this continuation
- Fresh root SSH diagnosis 40204664805: healthy app/PG, restarts=0, load 0.04, RAM 703/3812 MiB, swap 0, 50GB free. No OOM, conntrack pressure, listener overflow/drop or active Fail2ban. 443 allowed. One 502 at app replacement (14:44:52 UTC), cannot explain reported ten-minute outages.
- Controlled runtime Nginx change 40205216749 at 15:04:46 UTC: enable HTTP/2 and ssl_buffer_size 4k. nginx -t passed; graceful reload only, no application restart. Root-owned rollback backup /root/imi-nginx-before-transport-tuning.conf.
- Independent check 40205291483: HTTP/2 negotiated on three local requests, HTTP200. No pending send bytes or retransmission timers at snapshot. Initial immediate post-reload test negotiated HTTP1.1 on old worker; follow-up confirmed HTTP2.
- Source equivalent + evidence merged develop in PR16, commit 5d1a5aaac5a6ff01bacc8ce3d6349002ff57c987. Do not deploy app unnecessarily merely to install this already-active Nginx change.
- Public mobile WebKit and Chromium regression after transport: 40205621640 SUCCESS, participant submit -> real DB/cloud -> home.
- Sustained observation 40204720350 SUCCESS: public HTTPS 300/300 HTTP200 from 14:58:29 to 15:27:22 UTC, no curl errors, max 4.689s; local app+TLS 300/300 HTTP200 over25 minutes, max0.063196s. Both artifacts retained7 days. Public observation spans before/after Nginx change.
- 55/55 additional HTTPS requests through Globalping probes on MTS (Novosibirsk), Vimpelcom (Moscow), Rostelecom (Kostroma/Yekaterinburg), 15:12:12–15:24:02 UTC. TLS verified55/55, max433ms. Network AS membership does not establish these are the owner's LTE path.
- Evidence summary: docs/evidence/qr-availability-2026-10-25.json. No secrets, IP-identifiable user traces or response content persisted there.

## GigaChat question
User explicitly asked why salary/high-salary abbreviations are not merged and about provider alternatives. Explained existing organizer approval semantics. New synthetic actual-VPS tests exposed unreliability: original exact-string schema returned incomplete LENGTH (86completion tokens despite max1800) twice; decoder enum-removal completed JSON but failed canonical validator; opaque-ID experiment completed/validated but missed expected groupings. All experiments are test-only on ops branch; no production AI changes or user data changes. See docs/SEMANTIC_GROUPING_FINDINGS.md, runs40205995100,40206113881,40206279016,40206405422. Do not loosen validation or claim all grouping works. No external API purchases/credentials authorized.

## First unfinished action
The exact repeated user timeout remains unproven. Monitor owner feedback after transport mitigation and investigate new evidence without blaming operator/DNS or claiming probes equal LTE proof. Runtime has no measured outages in29-minute external /25-minute local observations. If user reports another outage, correlate actual timestamps, TLS/TCP evidence and provider path rather than repeating broad audits or restarting services blindly.
