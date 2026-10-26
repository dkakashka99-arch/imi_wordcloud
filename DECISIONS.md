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

23.10.2026: фактическое имя отдельного GitHub-репозитория — salakal/imi-wordcloud, создано владельцем. Это замена предпочтительного имени mir-wordcloud из ТЗ; архитектура и продукт не меняются. CLI аутентификация отсутствует, поэтому агент поставляет проверенные деревья через GitHub tree/commit API с сохранением исходного main-коммита и отдельными PR. У исходных локальных и remote коммитов разные SHA, что явно фиксируется в checkpoint.

Шаг 2: как предписано ТЗ, self-hosted пароль/scrypt и серверная PostgreSQL-сессия без OAuth/CDN/внешнего identity provider. Применён профиль OWASP N=32768, r=8, p=3 (32 MiB), эквивалентный минимальному уровню защиты, maxmem 64 MiB. Источники: https://cheatsheetseries.owasp.org/cheatsheets/Password_Storage_Cheat_Sheet.html и https://nextjs.org/docs/app/guides/authentication . Сессии проверяются в каждой серверной странице и каждом admin API; cookie не считается достаточным доказательством авторизации без БД.

Все admin-изменения блокируют событие и затем вопросы в едином порядке; submit сначала получает shared-lock события. Архив/переключение вопроса не допускают принятия ответов в уже закрытое состояние. Копирование переносит структуру без участников/ответов, удаление вопросов с данными запрещено.

При локальной инкрементальной сборке однажды обнаружен пустой Next prefetch-hints.json, из-за которого standalone не отвечал. Чистая сборка восстановила валидный manifest и HTTP flow; build helper теперь всегда удаляет только генерируемый .next перед сборкой. Framework файлы/артефакты вручную не исправлялись.

CI больше не дублирует feature push и pull_request: feature проверяется в PR, develop/main — после push. Есть ограничение времени job (20 минут) и установки браузеров (8 минут); сами проверки не сокращены.
