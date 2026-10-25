# Production acceptance — 25 October 2026

Рабочий адрес: https://imi-cloudpoll.ru/ . Проект imi_wordcloud, IMI One не изменялся. VPS FirstVDS212.109.196.228, Ubuntu24.04,2CPU/4GB/60GB. Проверенный release: `84ff46af7e25b88277cd05a1f8f2e4ee0042cb06`.

## Результаты с доказательствами

| Проверка | Результат и ссылка |
|---|---|
| Production CI | [40190336171](https://github.com/dkakashka99-arch/imi_wordcloud/actions/runs/40190336171): lint, TypeScript, production build,12unit/24integration/8browser tests |
| Docker/DB/load/restore CI | [40190336160](https://github.com/dkakashka99-arch/imi_wordcloud/actions/runs/40190336160): PostgreSQL17, Compose,300synthetic answers, restart, encrypted backup/restore |
| Автоматический main→VPS | [40190469864](https://github.com/dkakashka99-arch/imi_wordcloud/actions/runs/40190469864), повторный callback [40190660467](https://github.com/dkakashka99-arch/imi_wordcloud/actions/runs/40190660467): PASS; повтор активного SHA сохраняет previous-release |
| HTTPS | Let's Encrypt issued25Oct2026, expires23Jan2027; HTTP→HTTPS, certbot.timer+reloadhook. Renewal dry-run PASS [40187401932](https://github.com/dkakashka99-arch/imi_wordcloud/actions/runs/40187401932) |
| Реальный GigaChat на VPS | [40190027945](https://github.com/dkakashka99-arch/imi_wordcloud/actions/runs/40190027945): OAuth/models/GigaChat-2; aliases,moderation,summary PASS, TLS verified, только синтетика |
| Публичный HTTPS /300участников | [40189807615](https://github.com/dkakashka99-arch/imi_wordcloud/actions/runs/40189807615):300/300успешных POST,300в PostgreSQL и облаке; общий burst4.4s,p95≈4.1s; auth,CSRF,securecookie,QR |
| Полная перезагрузка VPS | [40190469406](https://github.com/dkakashka99-arch/imi_wordcloud/actions/runs/40190469406): изменился boot_id; SSH/HTTPS/оба healthy-контейнера восстановились; сохранённый через публичный API ответ пережил релиз и reboot |
| Внешняя копия и восстановление | [40190209164](https://github.com/dkakashka99-arch/imi_wordcloud/actions/runs/40190209164) и оба Production runs: pg_dump,restic encryption/check,byte comparison,actual pg_restore on networkless PostgreSQL17; encrypted artifact retained14days |
| Функции организатора на публичном сайте | [40195804173](https://github.com/dkakashka99-arch/imi_wordcloud/actions/runs/40195804173): создание мероприятия/вопроса, запуск/пауза, премодерация/одобрение ответа, алиасзп→зарплата с проверкой облака, экспортCSV,QRPNG, архив/восстановление/копия, logout/sessionrevocation,401/403, отсутствие password_hash в HTML |
| Публичные секретные пути | .env и ops/app.env404, APIадминистратора без сессии401; PostgreSQLне опубликован, app только127.0.0.1:3000; снаружи22/80/443 |

Синтетические мероприятия, ответы и временная учётная запись удалены адресно после проверок. Настоящее мероприятие не получило тестовых ответов.

## Что установлено

Docker/Compose, nonroot Next.js standalone, PostgreSQL volume, host Nginx, Certbot, firewall, rotating Docker/journald/Nginx logs, deploy SSH with pinned host identity. Сборка использует тот же Dockerfile на VPS: передача больших образов через SSH оказалась медленной, небольшой архив точного SHA прошёл успешно. Секреты остаются вне build context. Для optional runner build есть DEPLOY_BUILD_ON_VPS=false.

Деплой: PR→develop→PRmain→CI+Infrastructure→encrypted offsite backup with actual restore→pinned SSH→safe migrations→healthchecks→public HTTPS. Ошибка нового приложения возвращает previousimage, PostgreSQL volume сохраняется. Миграции должны оставаться backward-compatible; автоматический downgrade/restore поверх production запрещён. PRODUCTION_ENABLED=falseприостанавливает автодеплой. Public PR не получает production secrets и не запускается на VPS/selfhosted runner.

Резервные копии: ежедневно03:15Самара, перед обновлениями, вручную через Actions;14days. Инструкция: [PRODUCTION_BACKUP.md](PRODUCTION_BACKUP.md). Сохраните исходный нормализованный deploy privatekey отдельно: он необходим для расшифровки старых копий, в том числе после ротации ключа. GitHub quota/failure блокирует обновление. Платное хранилище не заказывалось.

GigaChat: PERS и личное некоммерческое применение подтверждены владельцем; credentials server-only,20s timeout, TLS верифицируется. Устранено склеивание PEMграниц нормализацией каждого сертификата через openssl x509. AI вызывается организатором, изменения применяются вручную после проверки. Отправка ответов и обновление облака независимы от AI.

## Мероприятие27октября

Создано событие `mir-27-oct`. Два независимых вопроса из JSONданных, оба **на паузе**:
- Студенты: «что вы ожидаете от будущей работы?» — https://imi-cloudpoll.ru/e/mir-27-oct/student
- Работодатели: «какие навыки вы считаете наиболее важными для будущих сотрудников?» — https://imi-cloudpoll.ru/e/mir-27-oct/employer
- Экран проектора: https://imi-cloudpoll.ru/e/mir-27-oct/screen

Вход организатора: https://imi-cloudpoll.ru/admin , login `teacher`. Пароль в `/opt/imi-wordcloud/shared/organizer-password`, mode600. Получить в собственном SSHклиенте, сохранить в passwordmanager; не публиковать/не пересылать в чат. Перед встречей открыть нужные вопросы из панели. Все активные организаторы доверенные администраторы колледжа с доступом ко всем мероприятиям.

## Оставшиеся действия владельца и ограничения

1. Проверить сайт через российские мобильную/WiFiсети **без VPN**, отсканировать оба QR с физического телефона, проверить проектор. Проверки из GitHub и московского VPS не заменяют этот тест.
2. Получить пароль teacher в собственном SSHсеансе. Проверить личный SSHключ/восстановление доступа, затем интерактивно сменить исходный rootпароль. Root/password recovery не отключался при недоступной VMmanager.
3. В GitHub Settings проверить защиту main/develop и main-only policy для environmentproduction. Connector не имеет административных инструментов для этой настройки. Workflowguards main/CI уже включены; production accesstrusted-only.
4. Сохранить исходный deploy privatekey для восстановления копий; проверить backup Actions на следующий день и выгрузить отдельную копию после мероприятия. GitHubArtifacts14days не являются бессрочным архивом или immutableхранилищем.
5. Основной HTTPSадрес — безwww. DNSwwwсмотрит на VPS, отдельныйwwwсертификат не выпускался. DNSне менялся повторно.

Полное закрытие требования «безVPN» возможно после проверки владельцем из российских сетей. Платные услуги/тарифы не менялись.
