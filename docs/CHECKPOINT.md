# Checkpoint — 23.10.2026

## Подтверждённое состояние

- Отдельный приватный репозиторий: `salakal/imi-wordcloud`, права admin/push подтверждены.
- Исходный пользовательский main `8b843f88119266d08465377b4bb2dee8aec5e00a` сохранён. Main не используется для разработки/публикации без release gate.
- Bootstrap перенесён через GitHub API без CLI credentials. Точное содержимое соответствует локальному a24bc7e; remote commit `7d08285e791352cf6db5fe8e4a9570e88698b8bb`.
- PR #1: https://github.com/salakal/imi-wordcloud/pull/1 . CI run 39927960811 завершён success. Merge в develop: `2e60451157efe838eb48ecc9104836975dd5c05e`.
- Основной поток локально: lint/typecheck/build, 3 unit, 8 integration и HTTP/QR/restart Next.js на PGlite прошли. Эти проверки не повторять без причин. Native PostgreSQL/browser gate — следующий незавершённый пункт.
- Добавлены Playwright-проекты WebKit/iPhone 13 и Chromium/Pixel 7, плюс экран 1920×1080: живое появление ответа без F5, QR, сохранение лимита после reload и пауза. Это эмуляция браузера/viewport, не физические телефоны и не тест сетей РФ.

## Следующее действие

Перенести текущий feature/01-core-flow отдельным коммитом через GitHub tree/commit API на основе develop, открыть PR и пройти native PostgreSQL 17 + browser CI. Фиксировать реальные ошибки и исправлять, не ослаблять проверки. После зелёной актуальной головы PR — merge в develop и обновление отчёта фактическими результатами.

Из-за отсутствия CLI GitHub credentials локальные source commits и remote API commits имеют разные SHA. Не выдавать один за другой. Сопоставлять содержимое деревьев и пользоваться актуальными remote head SHA для update_ref с expected_sha и merge с expected_head_sha. Локальная исходная история сохранена в ранее переданном bundle; в репозитории сохраняется пользовательский initial commit и новая история feature PR. Force push main/develop запрещён.

## Дальнейшие этапы и внешние условия

Следующий функциональный этап: шаг 2 — админские сессии/CRUD, затем модерация/экспорт, GigaChat и российский deployment. VPS/домен не предоставлены; покупок не было. GigaChat выключен, ключ не предоставлен, пригодность Freemium не подтверждена, клиент ещё не реализован. Production release требует финального подтверждения по SPEC.md. IMI One не используется.
