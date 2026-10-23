# Проверки — 23.10.2026

Окружение: Linux, Node 24.19.0, npm 11.9.0. Next.js 16.4.2, React 19.3.1; точные версии всех зависимостей — package-lock.json.

| Проверка                                   | Факт                                                                                                            |
| ------------------------------------------ | --------------------------------------------------------------------------------------------------------------- |
| `npm run lint`                             | PASS, 0 ошибок и предупреждений                                                                                 |
| `npm run typecheck`                        | PASS                                                                                                            |
| `npm test`                                 | PASS, 3 unit: кириллица/NFC/ё/регистр/семантическое различие; детерминированное облако и отсутствие пересечений |
| `npm run build`                            | PASS, production standalone                                                                                     |
| `npm run test:local`                       | PASS: миграция Drizzle + повторный seed + 8 integration tests + реальный HTTP flow и перезапуск приложения      |
| `npm audit --omit=dev --audit-level=high`  | PASS, 0 vulnerabilities                                                                                         |
| PostgreSQL 17 в GitHub Actions             | PASS, CI run 39928395171: миграция, 8 integration tests и HTTP на native PostgreSQL 17                          |
| Playwright / iPhone / Android              | НЕ ПРОВЕРЕНО                                                                                                    |
| 200–300 участников, p95                    | НЕ ПРОВЕРЕНО                                                                                                    |
| Российские сети без VPN                    | НЕ ПРОВЕРЕНО: публичного сервера нет                                                                            |
| Native PostgreSQL restart / backup restore | НЕ ПРОВЕРЕНО                                                                                                    |
| Реальный GigaChat                          | НЕ ПОДКЛЮЧЕН: ключ и тарифный режим не подтверждены                                                             |

## Покрытый поток

Cookie случайного участника → строгая Zod-проверка → POST с проверкой Origin → транзакционное сохранение исходного текста и нормализованного ключа → частотные агрегаты публичного screen API. Проверены 12 одновременных повторов запроса, 8 разных ответов с лимитом 3, ledger ключей для дубликатов, разделение групп, пауза/повторное открытие, исключение скрытых ответов и уникальность активного вопроса. HTTP-проверка запускает собранный standalone-сервер, а не mock обработчиков. Проверены выдача SVG QR и перезапуск Next.js с сохранением ответа и оставшегося лимита; перезапуск самой native PostgreSQL БД ещё не проверен.

## Существенное ограничение

Локальная БД — PGlite 0.5.11 через PostgreSQL wire protocol, **только тестовый стенд**. Pool ограничен одним соединением; одновременные запросы вызываются, но реальное поведение блокировок и конкурентность native PostgreSQL этим не подтверждены. Дополнительно GitHub Actions run 39928395171 успешно проверил native PostgreSQL 17 с обычным пулом; локальная WASM-проверка больше не является единственным доказательством. Production-код подключается к PostgreSQL через pg; fallback в WASM, SQLite, файлы или RAM в runtime отсутствует.

В тестовом socket-стенде обнаружена проблема восстановления соединения после SQL constraint error вне транзакции. Проверка unique constraint теперь явно выполняет BEGIN/ROLLBACK; ограничение БД по-прежнему проверяется. Это не исправление и не доказательство поведения native PostgreSQL.

Статусы сборки и тестов не означают готовность релиза: админка, модерация через UI, CSV, GigaChat, deployment и полная репетиция ещё не реализованы.

## Поставка в GitHub

Репозиторий: https://github.com/salakal/imi-wordcloud (private). Bootstrap PR: https://github.com/salakal/imi-wordcloud/pull/1 ; успешный CI run 39927960811, head 7d08285e791352cf6db5fe8e4a9570e88698b8bb. Слит в develop: 2e60451157efe838eb48ecc9104836975dd5c05e. Main содержит только исходный README. Основной поток: https://github.com/salakal/imi-wordcloud/pull/2 ; head 648f11fba5e3b9443738141eafd7ea30ec6a4b67. Полный CI run 39928395171: success.

## Native PostgreSQL и браузеры — подтверждённые результаты

- Workflow: https://github.com/salakal/imi-wordcloud/actions/runs/39928395171 ; job 120330334488.
- lint/typecheck/unit (3), db:migrate, integration (8), production build, standalone HTTP/QR/restart, browser E2E (2), production audit: PASS.
- Chromium/Pixel 7: появление слова без F5 за 4377 мс; WebKit/iPhone 13: 3880 мс. Два измерения в CI/development-сервере не являются p95 и не подтверждают задержку из российских сетей.
- Browser E2E проверяет настоящий submit, общий экран 1920×1080, QR, отсутствие горизонтального overflow, сохранение лимита после reload и паузу. Браузерный сервер — Next.js dev, production standalone проверяется отдельно HTTP smoke; настоящий production HTTPS ещё не поднят.
- `npm audit --omit=dev --audit-level=high`: 0 vulnerabilities в production-зависимостях. `npm ci` также сообщил 9 находок dev-зависимостей (4 moderate, 5 high); они не включены в production audit и требуют отдельного разбора до релиза. Не трактовать production audit как отсутствие любых находок во всём dev-toolchain.

## Этап 3 и перенос — 23.10.2026

Текущий репозиторий https://github.com/dkakashka99-arch/imi_wordcloud. Полный CI39941087673, head bb01ac3397d31563a97e3a3b8f063fb4c69bb847: PASS lint/typecheck, 8 unit, PostgreSQL17 миграции/18 integration, build, public/admin HTTP, 6 E2E (Chromium/Pixel7, WebKit/iPhone13), production audit0. Проверены создание/проведение/архив/копия, logout, скрытие/возврат HTML как текста без исполнения, CSV download, сравнение групп/overflow; integration проверяет правила, неизменность исходников, CSV формулы и изоляцию репетиции.

Первые прогоны обнаружили ESM импорт next/headers в фикстурах; явный next/headers.js в auth/http исправил загрузку. Рабочий код и проверки не подменялись mock ради CI. Точные сведения docs/STEP_03_REPORT.md. Старые ограничения runtime-нагрузки, настоящих устройств/сетей РФ, VPS/HTTPS, backup/restore и ключа GigaChat сохраняются. Нахождения полного dev audit9 остаются отдельной задачей до релиза.
