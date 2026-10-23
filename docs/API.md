# Контракты API

Все live endpoints: Cache-Control: no-store. Публичные результаты — только одобренные агрегаты, без оригиналов, cookie ID и IP.

- GET /api/health — процесс. GET /api/ready — подключение и схема БД.
- GET /api/public/events/:slug/:audience — актуальный вопрос, лимит, оставшиеся ответы; устанавливает HttpOnly cookie участника.
- POST /api/public/events/:slug/:audience/submissions — {questionId, text, idempotencyKey}, обязательный Origin. Идемпотентность в пределах вопроса/участника; нельзя использовать ключ для другого текста.
- GET /api/public/events/:slug/screen — аудитории, вопросы, агрегаты, revision; без сырых ответов. Экран запрашивает каждые 2 секунды, после ошибок увеличивает интервал и сохраняет последнее состояние.

Следующие этапы (ещё не реализованы): admin login/logout; server sessions; CRUD events/questions/audiences; activation/status; aliases/rules; CSV; AI jobs/suggestions/summary approval. Изменяющие admin endpoints проверяют сессию и Origin. Публичный URL не является защитой admin endpoints.
