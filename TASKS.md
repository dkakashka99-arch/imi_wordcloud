# Состояние разработки — 23.10.2026

| Этап                        | Статус                    | Проверенный результат / остаток                                                                                                                                                                            |
| --------------------------- | ------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 0 — Bootstrap               | DONE                      | Отдельный проект, Next.js/Drizzle, main/develop/feature, CI. Прежний PR #1 в salakal сохранён                                                                                                              |
| 1 — Телефон → БД → проектор | DONE                      | PostgreSQL17, миграции/8 integration, 3 unit, HTTP/QR/restart, Chromium/WebKit. Прежний PR #2 в salakal сохранён                                                                                           |
| 2 — Управление              | DONE                      | Новый PR #1 слит в develop (ded479a). CI39941081500 attempt2 SUCCESS: 6 unit/14 integration/4 browser, build/HTTP/audit                                                                                    |
| 3 — Модерация               | DONE                      | PR #2 слит в develop08aa19b. CI39987056531 PASS: 8 unit/18 integration/6 browser, build/HTTP/audit0                                                                                                        |
| 4 — GigaChat                | VERIFIED / доставка PR #3 | Все3 реальные задачи GigaChat-2 PASS (smoke39994534955), OAuth/TLS/schema. CI39993783572 PASS:12 unit/24 integration/8 browser. Последние исправления проходят текущий CI до merge; docs/STEP_04_REPORT.md |
| 5 — Российский VPS          | BLOCKED / TODO            | Нужны сервер и домен; затем Docker/Nginx/HTTPS, backup и rollback                                                                                                                                          |
| 6 — Репетиция               | TODO                      | 200–300 участников, p95/ошибки, физические телефоны/проектор, сети РФ без VPN, restore                                                                                                                     |
| 7 — Release                 | TODO                      | Проверка заказчиком, release gate, main/tag и production                                                                                                                                                   |

## Внешние условия

1. DONE: доступ devwork восстановлен, код/ветки/локальная история перенесены в dkakashka99-arch/imi_wordcloud. Карта SHA/прежних PR — docs/MIGRATION.md. Биллинг salakal для дальнейшей разработки не требуется.
2. Нужен отдельный VPS в России и домен/субдомен; стоимость согласовать до покупки. IMI One не использовать.
3. Ключ добавлен в Actions Secret GIGACHAT_AUTH_KEY. OAuth/список моделей подтверждены. Личный портфолио-проект, scope PERS. Для production нужен отдельный серверный секрет; runtime AI пока выключен.

Границы проверок: TEST_REPORT.md и docs/STEP_04_REPORT.md. Production URL отсутствует. Первое действие продолжения: docs/CHECKPOINT.md. После доставки этапа4 следующий — российский VPS/HTTPS. До релиза остаётся разбор9 dev-toolchain audit findings; production audit0 подтверждён отдельно.
