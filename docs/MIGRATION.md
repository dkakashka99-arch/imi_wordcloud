# Перенос GitHub — 23.10.2026

Текущий репозиторий: https://github.com/dkakashka99-arch/imi_wordcloud (public, создан пользователем).
Исходный: https://github.com/salakal/imi-wordcloud (private, сохранён).

После установки GitHub App для devwork запись подтверждена. Через GitHub API восстановлены все локальные коммиты разработки и связи родителей, включая merge. При восстановлении меняются SHA коммитов и техническое время их создания; содержимое каждой версии сверено по исходному SHA дерева. Начальный пустой локальный коммит заменён инициализационным README нового репозитория. main пока содержит только этот README; production-релиза нет.

Старые PR: bootstrap https://github.com/salakal/imi-wordcloud/pull/1, core https://github.com/salakal/imi-wordcloud/pull/2, admin https://github.com/salakal/imi-wordcloud/pull/3. Их обсуждения/проверки сохраняются в исходном репозитории, не выдаются за новые PR. Разработка и новые проверки продолжаются только в новом.

| Локальный исходный commit                | Восстановленный commit                   |
| ---------------------------------------- | ---------------------------------------- |
| ff254e14ab8503969d38ce6033d9928494a33877 | 6a04777d8e2c073d53541e2ce318b3859ca47766 |
| 5be4f652aa6b620a3a766b1122cc012be6a7fe72 | 20ae0432a48662de83c5d6144b1460f5be96e655 |
| 6dcefbead391ea1bebfff993589db275548f4a35 | a2225081688c2bf1f2c68fcbe75fd483c931af5a |
| a24bc7e50d09f80ffcec3432de77e83e746e1fa6 | 117bdbf6924aae86b26f7959ce032e98f2114640 |
| 5a105aae70f3c1d3683bc5585d7968fb99cc0ae6 | 48194ef96b61086a7eb4d0d434f06641d143cc11 |
| d80fafba8eaf72677adceaa32417cd03f898d553 | 6c9e6c34c891e3bd7e2d4701093fe1dfda93010b |
| 2249ac9d2f0ad63f78aa0960925d0fe9761c3817 | 09c6a35395126e87036cd2f3827c381b05cce90d |
| 223c406920e265f9effffbbbc139d26a61d1290d | 17b21be00eb36135aea5e1f450636a082313df58 |
| 5152104be0fe0cc3687c22c172371bba41899434 | 76b8989e1acab562427d22584b3a5db180bc028e |
| 08f2ccd238353bcfbe1fe886838f6772c0655aa3 | b31eccedd9e8840776f8e6ec25ab942d21af8e05 |
| 449c7d32f27ce40ae789f3dcfa1a4b193dd1b25c | e291f4a6365a72ddf552bc0b80c977edc4466db1 |

Ветки main/develop/feature/00-bootstrap/feature/01-core-flow/feature/02-admin-events/feature/03-moderation-display созданы. Этап 2 проходит проверки в новом PR #1. Исходная ветка этапа 3 сохранена без изменений дерева: e71e278738bfede7ad2b71bf254fce1494276a3f. CI и последующие исправления фиксируются отдельными коммитами.
