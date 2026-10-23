# Checkpoint — перенос и CI этапов 2–3, 23.10.2026

Текущий репозиторий https://github.com/dkakashka99-arch/imi_wordcloud, подключение devwork. Доступ восстановлен после установки GitHub App (installation174444890). Старый salakal/imi-wordcloud сохранён. Детали и карта коммитов: docs/MIGRATION.md. origin указывает на новый repo, source-salakal — на старый. Локальные и remote commit SHA отличаются; сравнивать деревья. Не переносить код повторно.

Исходная ветка 3: remote e291f4a6365a72ddf552bc0b80c977edc4466db1, локально 449c7d3; tree e71e278738bfede7ad2b71bf254fce1494276a3f проверено. После переноса исправлен импорт next/headers.js; локальный 8b8af6d соответствует remote bb01ac3397d31563a97e3a3b8f063fb4c69bb847. Все рабочие ветки восстановлены. Новый main — только README, production-релиза нет.

Этап 2: новый PR #1, текущий code head db18420d080c4a6c9af5864bd22125021dd99597. CI39941081500: lint/typecheck, 6 unit, PostgreSQL17 миграции/14 integration/build/HTTP PASS; установка браузеров ещё выполнялась при записи. Первый CI39940693442 обнаружил ошибку ESM импорта next/headers в fixtures; исправление next/headers.js проверено локально командой playwright test --list и полным CI этапа3. До merge PR #1 нужен его отдельный успешный CI, не отменять здоровый job.

Этап 3: PR #2, CI39941087673 SUCCESS на bb01ac3397d31563a97e3a3b8f063fb4c69bb847, job120372400517: lint/typecheck, 8 unit, PostgreSQL17/18 integration, build, public/admin HTTP, 6 browser E2E Chromium/WebKit, production audit0. Подробности docs/STEP_03_REPORT.md. Никакого повторного локального прогона без новых изменений; новый documentation-only commit требует CI актуальной головы PR, ожидается отдельно.

Следующее действие: проверить live-состояние PR #1/#2 и последние workflow runs через /actions/runs?head_sha=... (не только PR-filter helper). Если ещё открыты — завершить гейт и слить последовательно 2 → 3 в develop с expected_head_sha после PASS. Если уже слиты — проверить итоговый develop CI, этапы2–3 технически завершены; следующий этап4 по отдельному разрешению пользователя. Сверять HEAD/tree перед исправлениями; локальная история и remote отличаются. Не переносить повторно, не делать force push.

VPS/домен и ключ GigaChat не предоставлены. Production не публиковался, AI выключен. Физические устройства/сети РФ, нагрузка200–300, native backup/restore не проверены. Main и IMI One не изменять. Этап 4 отдельно после завершения текущих проверок.
