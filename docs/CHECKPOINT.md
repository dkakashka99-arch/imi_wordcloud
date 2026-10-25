# Checkpoint — GigaChat готов, стабилизация CI, 23.10.2026

Репозиторий https://github.com/dkakashka99-arch/imi_wordcloud, devwork. Перенос завершён, старый salakal сохранён, карта docs/MIGRATION.md. IMI One не менять. API/local SHA различаются, сверять tree, без force push.

Этапы0–4 реализованы. PR #3 слит в develop e2aee9fb001cfd304d34539d4cf9a8cc18d9af34, tree6ebf15ce1a642781ca237c22dad7f506eafaee55 совпал с проверенным. Финальный PR CI39994992637 attempt2 SUCCESS на004235d2737bff845172ece48b427bebcae722d0:12 unit/24 native integration/8 Chromium/WebKit browser, lint/typecheck/build/HTTP/audit0. Attempt1 — только timeout установки пакетов Ubuntu. Реальный smoke39994534955 и повтор после merge39997017054 SUCCESS: OAuth/модели/GigaChat-2, все3 задачи, JSON Schema/семантика/TLS. Только синтетика, секрет агент не читал. Runtime AI выключен по умолчанию; настройка docs/GIGACHAT.md.

## Текущая работа

Develop CI39997016904 attempt1 остановился на восьмиминутном timeout установки Playwright dependencies с azure.archive.ubuntu.com, до browser-тестов; attempt2 запущен без изменения кода. Нет падений приложения. Повторяемая проблема зеркала подтверждается логами и actions/runner-images#14594. Подготовлена fix/ci-ubuntu-mirror: Ubuntu24.04, замена Azure HTTP на официальный archive.ubuntu.com HTTPS только в Ubuntu mirror lists, ограниченные APT timeouts/retries. Проверки TLS/подписей пакетов не ослаблены, все прежние тесты сохранены. Изменения только CI/документации, новый PR в develop.

## Первое незавершённое действие

Найти текущий PR fix/ci-ubuntu-mirror и его head/CI, не создавать дубли. Проверить полный CI, merge с expected_head_sha после PASS; затем сверить tree и develop CI. Если уже слит и develop зелёный — доставка этапа4 завершена, прошлые тесты/реальные API не повторять без причины. Следующий этап5 — российский VPS/домен, независимые deployment-файлы можно подготовить отдельно по разрешению.

## Оставшееся

Production нет; main начальный README. Нужны VPS в России/домен, стоимость согласовать до покупки; Actions Secret не настраивает production. Личный портфолио-проект/PERS подтверждены. Не проверены физические устройства/проектор, сети РФ, нагрузка200–300/p95, native backup/restore. Dev audit разобрать до релиза (исторически9 findings; последний npm ci PR CI сообщил4 moderate), production audit0 — отдельная проверка.

## Stage 5 — 24 October 2026

Baseline: live develop 6b7336b34a7c668eef4df5535ece68f863bdafbc; main 6a04777d8e2c073d53541e2ce318b3859ca47766.
Branch feature/05-production-infrastructure; see docs/PRODUCTION.md and STEP_05_REPORT.md.
Local lint/types/12 unit/production build passed. Container evidence must come from Infrastructure CI (no local Docker).
Next external step: owner FirstVDS session or VPS console bootstrap; choose existing free off-VPS backup target. No production deployment performed, no secrets requested in chat. Review actual PR/CI before enabling production.
