# Решения

2026-10-23: Node 24 LTS; Next/React и пакеты зафиксированы lockfile по npm registry. Минимальная версия Node Next.js — 20.9: https://nextjs.org/docs/app/getting-started/installation

Hosting Sites не используется: его Workers несовместимы с обязательными Next.js Node runtime, PostgreSQL TCP и российским VPS. Сохраняем стек ТЗ и Docker standalone.

Счётчик revision хранится у вопроса. При записи блокируем строку вопроса и участника в транзакции: строгие лимиты, запрет записи при паузе и атомарное изменение ревизии. Активность задаётся связью вопроса с аудиторией; partial unique index ограничивает один активный вопрос.

GigaChat выключен по умолчанию. Freemium разрешён только для личного некоммерческого применения; пригодность для колледжа нельзя считать подтверждённой только из-за отсутствия оплаты. Один поток физлица требует общей блокировки PostgreSQL. Модель выбирается только после GET /v1/models и проверки квоты.

Официальные источники, проверены 2026-10-23:

- https://developers.sber.ru/docs/ru/gigachat/api/reference/rest/gigachat-api
- https://developers.sber.ru/docs/ru/gigachat/limitations
- https://developers.sber.ru/docs/ru/gigachat/tariffs/individual-tariffs
- https://developers.sber.ru/docs/ru/policies/gigachat-agreement/individuals

Локальные проверки используют PGlite Socket, потому что Docker и системный PostgreSQL недоступны, а apt не может сменить uid в данном окружении. Это только devDependency и тестовый helper, production остаётся на отдельном PostgreSQL. Официальная документация: https://pglite.dev/docs/pglite-socket . Ограничения multiplexer не позволяют считать этот тест заменой native concurrency/load теста.

До первого deployment baseline миграции пересоздана с явными snake_case именами колонок: SQL слоя данных и схема Drizzle должны совпадать. Ни одна production БД старую миграцию не применяла. Submission requests хранят ключи успешных повторов отдельно от submissions, включая запросы с уже принятым каноническим словом.
