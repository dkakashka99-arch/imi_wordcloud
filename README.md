# MIR WordCloud

Самостоятельный сервис живых опросов колледжа МИР. Next.js App Router, React, TypeScript, Tailwind, PostgreSQL и Drizzle. Все ресурсы браузера обслуживаются локально. IMI One не используется.

## Разработка

Node.js 24. `npm ci`, скопировать `.env.example` в `.env`, задать отдельную PostgreSQL БД. Миграция: `node --env-file=.env --import tsx scripts/migrate.ts`; затем аналогично `scripts/seed.ts`. `npm run dev`. Seed повторно не перезаписывает мероприятие и не удаляет ответы.

Локальный тестовый стенд без системного PostgreSQL: `npm run build` → `npm run test:local`. Он создаёт одноразовую БД PGlite (PostgreSQL WASM), применяет настоящую миграцию, проверяет сервис и HTTP. Это не production и не подтверждение поведения многопроцессного PostgreSQL.

Проверки: `npm run lint`, `npm run typecheck`, `npm test`, `npm run test:integration`, `npm run build`. Integration требует выделенную тестовую БД, никогда не production.

Статус реализации и блокеры — в TASKS.md. Публичного deployment пока нет. Лицензия не выбрана заказчиком; права не передаются автоматически.

## Организаторам

Кабинет — `/admin`, вход — `/admin/login`. Первого администратора создаёт оператор отдельно от seed; безопасная процедура и инструкция проведения опроса: [docs/ADMIN.md](docs/ADMIN.md). Production-сервер ещё не предоставлен; встроенных production-учётных данных нет.
