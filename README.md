# MIR WordCloud

Самостоятельный сервис живых опросов колледжа МИР. Next.js App Router, React, TypeScript, Tailwind, PostgreSQL и Drizzle. Все ресурсы браузера обслуживаются локально. IMI One не используется.

## Разработка

Node.js 24. `npm ci`, скопировать `.env.example` в `.env`, задать отдельную PostgreSQL БД. Для команд использовать `node --env-file=.env node_modules/tsx/dist/cli.mjs scripts/migrate.ts` и затем `scripts/seed.ts`. `npm run dev`.

Проверки: `npm run lint`, `npm run typecheck`, `npm test`, `npm run test:integration`, `npm run build`. Integration требует выделенную тестовую БД, никогда не production.

Статус реализации и блокеры — в TASKS.md. Публичного deployment пока нет. Лицензия не выбрана заказчиком; права не передаются автоматически.
