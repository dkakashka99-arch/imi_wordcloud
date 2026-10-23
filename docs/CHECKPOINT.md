# Checkpoint — 23.10.2026

## Подтверждённая поставка

- Приватный `salakal/imi-wordcloud`, admin/push подтверждены. Main содержит исходный README (`8b843f88119266d08465377b4bb2dee8aec5e00a`); production не опубликован.
- Шаг 0: https://github.com/salakal/imi-wordcloud/pull/1 . CI 39927960811 success; merge в develop `2e60451157efe838eb48ecc9104836975dd5c05e`.
- Шаг 1: https://github.com/salakal/imi-wordcloud/pull/2 . Проверенный implementation head `648f11fba5e3b9443738141eafd7ea30ec6a4b67`; исходное дерево a937087ba2e1855c15c04b136738f116f5c011c8 соответствует локальному source d80fafb.
- Полный native CI https://github.com/salakal/imi-wordcloud/actions/runs/39928395171 завершён success: lint/typecheck, 3 unit, миграция PostgreSQL 17, 8 integration, production build, HTTP/QR/restart приложения и 2 browser E2E. Chromium live update: 4377 мс; WebKit: 3880 мс. Детали/ограничения — TEST_REPORT.md.
- После проверенного implementation head добавляется только этот отчёт, TASKS/TEST_REPORT/CHANGELOG; код приложения и тестов не меняется. Перед финальным merge подтвердить CI актуальной головы PR #2 и expected_head_sha; не считать неизменяемым старый SHA.

## Первое незавершённое действие

Если PR #2 ещё открыт — завершить поставку после зелёной актуальной головы. Если слит — не повторять выполненные проверки и перейти к шагу 2: серверная админская авторизация/сессии, создание первого админа, CRUD мероприятий/аудиторий/вопросов, активный вопрос и архив. Выполнить проверку реального разрешённого и запрещённого доступа и E2E управления мероприятиями.

Состояние merge/новейший remote commit получать из GitHub, а не предполагать по сохранённому source commit. CLI GitHub credentials отсутствуют, поэтому для записи используются GitHub tree/commit/ref tools; update_ref только с актуальным expected_sha и без force. Локальные и remote SHA различаются; сравнивать деревья. История исходных локальных веток сохранена в ранее переданном bundle, GitHub сохраняет исходный initial commit и feature PR историю.

## Незакрытые условия релиза

VPS в России/домен ещё не предоставлены; покупок не было. GigaChat выключен, ключ отсутствует, пригодность Freemium не подтверждена и клиент ещё не реализован. Physical iPhone/Android, сети РФ без VPN, 200–300 участников/p95, restart PostgreSQL и backup/restore — не проверены. Dev-toolchain audit findings требуют разбора, production dependency audit — 0. Production release требует финального подтверждения по SPEC.md. IMI One не используется.
