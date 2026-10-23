# Checkpoint — перенос и CI этапов 2–3, 23.10.2026

Текущий репозиторий https://github.com/dkakashka99-arch/imi_wordcloud, подключение devwork. Доступ восстановлен после установки GitHub App (installation174444890). Старый salakal/imi-wordcloud сохранён. Детали и карта коммитов: docs/MIGRATION.md. origin указывает на новый repo, source-salakal — на старый. Локальные и remote commit SHA отличаются; сравнивать деревья. Не переносить код повторно.

Исходная ветка 3: remote e291f4a6365a72ddf552bc0b80c977edc4466db1, локально 449c7d3; tree e71e278738bfede7ad2b71bf254fce1494276a3f проверено. Все рабочие ветки восстановлены. Новый main — только README, production-релиза нет.

Этап 2: новый PR #1, head b31eccedd9e8840776f8e6ec25ab942d21af8e05, base develop09c6a35395126e87036cd2f3827c381b05cce90d. CI39940693442 стартовал, PostgreSQL container/checkout/setup-node PASS, зависимости устанавливаются. Старые billing/403 больше не блокируют работу. До merge дождаться всех проверок актуального head, исправить реальные ошибки, не ослаблять тесты.

Этап 3 уже реализован: docs/STEP_03_REPORT.md. Локально PASS lint/typecheck/build, 8 unit, 18 integration PGlite и public/admin HTTP. Эти независимые результаты не повторять без изменений. Browser/native gate теперь выполняется в новом GitHub. Следующие действия: отдельный PR этапа 3, проверить CI обоих этапов, последовательно слить 2 → 3 в develop после PASS. Точные результаты, PR/SHA/run записать в checkpoint и TASKS. Не объявлять DONE до гейта.

VPS/домен и ключ GigaChat не предоставлены. Production не публиковался, AI выключен. Физические устройства/сети РФ, нагрузка200–300, native backup/restore не проверены. Main и IMI One не изменять. Этап 4 отдельно после завершения текущих проверок.
