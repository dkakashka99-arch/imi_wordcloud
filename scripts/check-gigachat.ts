import { aiConfig, gigaClient, AiError } from '../src/lib/ai/client';
import { prompt, responseSchema, validateResult } from '../src/lib/ai/validation';
import { resultSchemas, type Snapshot, type TaskKind } from '../src/lib/ai/contracts';
// Synthetic fixture only: no database, participant data, credentials or model text in output.
const snapshot: Snapshot = {
  revision: 0,
  totalWords: 3,
  omitted: 0,
  groups: [{ group: 1, label: 'Тестовая группа' }],
  words: [
    { text: 'зарплата', count: 3, groups: [{ group: 1, count: 3 }] },
    { text: 'высокая зарплата', count: 2, groups: [{ group: 1, count: 2 }] },
    { text: 'команда', count: 1, groups: [{ group: 1, count: 1 }] },
  ],
};
let phase = 'configuration';
let model: string | undefined;
let kind: TaskKind | undefined;
try {
  aiConfig();
  const client = gigaClient();
  phase = 'oauth_and_models';
  model = await client.model();
  for (kind of ['aliases', 'moderation', 'summary'] as const) {
    phase = 'structured_chat';
    const response = await client.generate(
      model,
      prompt(kind),
      { words: snapshot.words },
      responseSchema(
        kind,
        snapshot.words.map((w) => w.text),
      ),
    );
    phase = 'semantic_validation';
    const parsed = resultSchemas[kind].safeParse(response.result);
    if (!parsed.success)
      console.log(
        JSON.stringify({
          schemaIssues: parsed.error.issues.map((i) => ({
            code: i.code,
            path: i.path.filter(
              (p) =>
                typeof p === 'number' ||
                ['suggestions', 'source', 'suggestedCanonical', 'reason', 'confidence'].includes(
                  String(p),
                ),
            ),
          })),
        }),
      );
    validateResult(kind, response.result, snapshot);
    console.log(
      JSON.stringify({
        status: 'PASS',
        kind,
        oauth: true,
        models: true,
        structuredChat: true,
        model,
        usage: response.usage,
        tlsVerified: true,
        syntheticOnly: true,
      }),
    );
  }
} catch (e) {
  console.error(
    JSON.stringify({
      status: 'FAIL',
      phase,
      kind,
      model,
      code: e instanceof AiError ? e.code : 'unavailable',
      detail: e instanceof AiError ? e.detail : undefined,
    }),
  );
  process.exitCode = 1;
}
