# QR / recurring availability incident, 25 October 2026

Status: OPEN. User reports repeated approximately ten-minute periods of Safari LTE timeouts. Do not declare fixed based on isolated HTTP 200 or hosted browser tests.

Production application release: 6245b7abf9fa91e369f088fafe2f42c5bc2b393e.
Deployment 40203381788 completed 14:44:59 UTC; the app replacement caused one logged 502 at 14:44:52 UTC. The replacement lasted approximately one second and cannot explain repeated ten-minute unavailability.
Post-deployment public WebKit/Chromium form submission + cloud rendering regression 40203416033 passed.

Fresh diagnosis 40204664805 at 14:57 UTC:
- app and PostgreSQL healthy, restarts=0; 703 MiB system memory used of 3812 MiB, zero swap used, load 0.04; disk 12% full.
- no kernel OOM / conntrack-full / link-change events during prior 45 minutes; no listener overflow/drop; conntrack 194/65536.
- Fail2ban inactive and no f2b firewall chains. Ports 80/443 allowed.
- 1987 successful HTTP requests, one deployment 502 among latest 2000 completed requests. No slow completed application responses. This cannot exclude failures before HTTP or connections still in flight.

Controlled transport mitigation at 15:04 UTC (40205216749):
- Ubuntu Nginx supports HTTP/2. Enabled listen 443 ssl http2 and ssl_buffer_size 4k, validated nginx -t, graceful reload only.
- Kept TLS verification, versions, credentials, database, DNS and application unchanged.
- Initial immediate local probe still negotiated HTTP/1.1 during graceful worker handover. Follow-up 40205291483 independently negotiated HTTP/2 on three requests, each HTTP 200.
- Follow-up socket summary: one established HTTPS connection, zero queued send bytes, zero retransmission timers.
- This is a mitigation experiment, NOT a confirmed root cause or verified fix of the LTE incident.
- Root-owned config backup /root/imi-nginx-before-transport-tuning.conf. Roll back by restoring it, nginx -t and systemctl reload nginx.

Observation workflow 40204720350 independently probes public HTTPS and local application/TLS every 10 seconds for at least 25 minutes. Read both resulting artifacts before summarizing findings. Observation crosses the transport change. It does not represent the user's mobile network.

Keep rehearsal-25-oct, user-created events and all user responses. Do not retry production load tests against these events. User requested no further phone/operator troubleshooting questions.

GigaChat currently only analyzes an organizer-selected snapshot and proposes aliases/moderation/summary. Organizer must approve alias groups; participant input never directly calls AI. Automatic semantic grouping would require a separate explicit behavior change, not merely a provider swap.

First unfinished action: assess observation evidence and Russian network probes, investigate recurring timeout until verified. Transport configuration in this PR mirrors the deployed experiment; merging it must not be described as proving the incident resolved.
