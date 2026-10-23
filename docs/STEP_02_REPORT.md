# Шаг 2 — реализация и проверка

Ветка: feature/02-admin-events. Основа — remote develop 0668508f090eca7e767a30d6849ffc0f299238cb (шаги 0–1, PR #1/#2). IMI One и main не меняются.

## Реализовано

Серверная авторизация с scrypt (OWASP 32 MiB profile), PostgreSQL-сессии на 12 часов, HttpOnly/Secure/SameSite=Strict, проверка в каждом admin API и странице, Origin/JSON/Zod, атомарный limiter в БД. Пароль и raw token не выдаются клиенту и не логируются. Администратор создаётся отдельной командой, пароль — stdin/секретный файл; seed стандартного администратора не создаёт.

Мероприятия: создание, переименование, копирование шаблона без ответов, архив и восстановление. Группы с постоянными кодами и редактируемыми названиями. Вопросы: произвольное количество, несколько групп, порядок, лимиты, draft/open/paused/closed и текущий вопрос без нового QR. Ссылки и локальные QR SVG/PNG. Вопросы с ответами не удаляются; уже ответившие группы не отцепляются; лимит нельзя снизить ниже уже принятых ответов.

Транзакции admin получают event lock и затем ordered question locks; submit получает shared event lock перед question lock. Архив и смена вопроса не теряют принятые ответы и не принимают поздние записи в старый вопрос. На клиенте архив убирает ввод, смена вопроса очищает старый черновик.

## Подтверждённые локальные проверки (23.10.2026)

- `npm run lint`: PASS, без ошибок/предупреждений.
- `npm run typecheck`: PASS.
- `npm test`: PASS, 6 unit tests.
- `npm run build`: PASS, чистый production standalone.
- `npm run test:local`: PASS, миграция и 14 integration tests на PGlite + два HTTP-сценария на собранном standalone.
- HTTP: реальная команда создания админа с stdin, неверный пароль, cookie flags, защищённый GET/POST, Origin, CRUD, PNG signature, logout и повтор старого cookie; прежний public flow и restart приложения.

Локальная БД PGlite — ограниченный тестовый стенд. Настоящая конкуренция PostgreSQL 17 и Playwright Chromium/WebKit выполняются в GitHub CI перед merge. Browser-тест нового этапа: login → create → groups → question → open → answer → pause/resume → switch without QR → close → archive → duplicate → restore → logout; плюс отсутствие overflow и очистка старого черновика. Не считать browser-тест пройденным до результата CI.

## Исправлено во время проверки

1. Stale/пустой генерируемый Next prefetch-hints.json после инкрементальной сборки мешал запуску standalone. Чистая сборка дала валидный manifest и рабочий HTTP; build helper теперь очищает только .next.
2. Чтение stdin bootstrap-командой заменено с открытия /dev/stdin на потребление потока: stdin дочернего Node-процесса является pipe/socket. Реальный bootstrap с паролем через stdin теперь проверяется HTTP-harness.

## Не входит в завершение этапа

Модерация/CSV/репетиция — шаг 3; GigaChat — шаг 4 (секрет и подходящие условия ещё отсутствуют); VPS/домен/HTTPS и физические сети РФ — шаги 5–6. Реального production URL и production-администратора ещё нет. Audit production зависимостей ранее был 0; известных dev-toolchain находок этот этап не исправляет, их нужно разобрать до релиза.
