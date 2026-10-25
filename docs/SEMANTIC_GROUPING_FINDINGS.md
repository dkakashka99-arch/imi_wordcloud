# Semantic grouping findings, 25 October 2026

Current behavior:
- normalizeWord handles Unicode NFC, spaces, case and ё/е. It does not lemmatize, expand abbreviations or merge meanings.
- GigaChat is called by the organizer for selected-snapshot aliases, moderation and summary. Results require organizer approval. Public submissions do not invoke GigaChat.
- Merely sending “зарплата” and “высокая зп” therefore never automatically merges them.

New isolated real-API checks used only synthetic salary/team phrases, production TLS verification and no database access:
- 40205995100 and 40206113881: current exact-word JSON-schema request returned incomplete output. The second response reported finish_reason=length despite completion_tokens=86, below configured max_tokens=1800. Increasing the token cap is not established as a fix.
- 40206279016: decoder-only experiment removed enums but retained the full application's validation. The API returned complete JSON; application rejected canonical/duplicate inconsistency. Do not remove application validation to make this pass.
- 40206405422: separate opaque-ID prompt/schema experiment returned a valid result but did not pass the expected salary abbreviation/team family grouping checks. This experiment was NOT deployed.
- Existing earlier successful synthetic smoke checks therefore do not establish reliable grouping of abbreviations.
- No production AI logic, organizer approval rules, user answers or credentials were changed during these experiments.

Possible next implementation, after availability:
1. Preserve original answers. Store editable groups and source membership; use existing alias mechanism for approved aggregation.
2. Distinguish deterministic normalization, inflection/abbreviation candidates, and semantic candidates. Same roots or high vector similarity alone must not merge opposite meanings or negations.
3. Evaluate candidates against a fixed Russian benchmark, including abbreviations, inflections, paraphrases, unrelated terms, negation and opposite qualifiers. Measure both incorrect merges and missed merges.
4. Evaluate a repaired GigaChat adapter and a text-embedding alternative on the same benchmark before choosing a provider. Yandex AI Studio documents Russian-accessible text-embedding APIs for comparing texts: https://aistudio.yandex.ru/ru/docs/ai-studio/concepts/embeddings
5. Embeddings supply vectors; clustering thresholds, negation handling, source mapping, organizer merge/split review and batch/cache scheduling remain application responsibilities.
6. No external API should be called for every participant keystroke. No new paid account, API credentials or expenses have been authorized or created.

Availability is the active incident; provider migration and automatic application of merges are not implemented or promised by this note.
