# Checkpoint — 23.10.2026

## Точка продолжения

Ветка `feature/01-core-flow`, на основе bootstrap `5be4f65`. Последний подтверждённый результат: production standalone собран, lint/typecheck пройдены, 3 unit и 8 integration тестов, HTTP flow (включая QR, pause и restart Next.js) успешно проверены на PGlite. `npm audit --omit=dev --audit-level=high`: 0 vulnerabilities. Подробности и ограничения — TEST_REPORT.md.

Локальные main/develop указывают на стартовый пустой commit. Ничего не опубликовано и не слито. Не считать local commit готовым PR или успешным CI. Feature 00 сохранена для истории, но перед отдельной публикацией её skeleton CI нужно адаптировать к отсутствию integration tests на том этапе; полная CI-конфигурация текущей feature 01 уже включает реальные integration/HTTP тесты.

## Первый незавершённый пункт

GitHub: подключён salakal; отдельный repo mir-wordcloud не найден. Создание repo не поддержано коннектором; CLI credentials отсутствуют; browser требует login. Нужен пустой private `salakal/mir-wordcloud`, доступный коннектору. После получения repo агент сам переносит Git-историю/код, создаёт ветки и PR и запускает подготовленные проверки на native PostgreSQL 17. Не использовать IMI One.

До репозитория этапы 0 и 1 имеют статус PARTIAL. После поставки и исправления реальных CI ошибок: browser E2E и шаг 2 (админские сессии/CRUD). Не повторять общий аудит проекта и успешно пройденные unit/build проверки без изменений кода. Native PostgreSQL concurrency, browser UI и российские сети ранее не проверялись.

## Остальные внешние условия

Российский VPS/домен ещё не предоставлены; никаких покупок не было. GigaChat выключен, ключ не предоставлен, пригодность Freemium не подтверждена; клиент GigaChat ещё не реализован. Production release требует финального подтверждения по SPEC.md.

## Восстановление

Архив поставки содержит tracked source и Git bundle всех локальных веток в `.history/mir-wordcloud.bundle`. Использовать bundle для восстановления истории, если временный checkout исчезнет. Файл bundle в самом Git не хранится. Продолжать существующие ветки, не пересоздавать реализацию. Не восстанавливать старую camelCase миграцию: актуальный baseline — `drizzle/0000_clean_changeling.sql`, нигде в production ещё не применён.
