# Checkpoint — этапы 2–3 после переноса, 23.10.2026

Текущий репозиторий: https://github.com/dkakashka99-arch/imi_wordcloud, подключение devwork. Перенос завершён; деревья восстановленных версий сверены с исходными. Старый salakal/imi-wordcloud сохранён. Карта коммитов/PR — docs/MIGRATION.md. origin — новый repo, source-salakal — старый. Локальные и API SHA отличаются; сравнивать tree. Не переносить повторно.

## Подтверждённое состояние

Этап 2: PR #1 слит в develop, merge ded479a2eaeab59b343b62b8a2477dfb0cb29e8a. CI39941081500 attempt2 SUCCESS, job120523888191, code head db18420d080c4a6c9af5864bd22125021dd99597: lint/typecheck, 6 unit, PostgreSQL17 миграции/14 integration, build, public/admin HTTP, 4 Chromium/WebKit E2E, production audit0. Attempt1 остановился на таймауте Ubuntu mirror при установке браузеров; повтор без изменений прошёл.

Этап 3: PR #2. Полный CI39941087673 SUCCESS на bb01ac3397d31563a97e3a3b8f063fb4c69bb847; документационный head bc33c8875a1da92398598c2ec24041b8b8e6b06d — CI39941760344 SUCCESS. Проверены lint/typecheck, 8 unit, PostgreSQL17/18 integration, build, public/admin HTTP, 6 Chromium/WebKit E2E, production audit0. Ограничения — docs/STEP_03_REPORT.md и TEST_REPORT.md. Явный next/headers.js устранил загрузку ESM фикстур; проверки не ослаблялись.

## Первое незавершённое действие

Этот коммит меняет только итоговую документацию. Проверить актуальную голову PR #2 и её CI через /actions/runs?head_sha=...; слить в develop с expected_head_sha после PASS, затем проверить итоговый develop CI. Если PR уже слит и develop зелёный — этапы 2–3 завершены, не повторять локальные проверки без новых изменений. По разрешению пользователя продолжать этап 4 (GigaChat). При неожиданном head/изменениях сверить live-состояние, не выполнять force push.

## Оставшиеся условия

Main — только начальный README, production-релиза нет. VPS/домен и ключ GigaChat не предоставлены, AI выключен. Не проверены физические устройства/проектор, сети РФ, нагрузка200–300/p95, native backup/restore. Полный npm ci сообщает 9 dev-toolchain audit findings (4 moderate/5 high); production audit0 не заменяет их разбор до релиза. IMI One не изменять.
