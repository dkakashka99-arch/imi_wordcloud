// Only these synthetic fixtures may be logged; never read participant answers here.
import { gigaClient, AiError, semanticModelPreference } from '../src/lib/ai/client';
import { classify } from '../src/lib/semantic/classifier';
export const cases = [
  {
    name: 'abbreviations',
    question: 'Что вы ожидаете от работы?',
    words: ['зарплата', 'ЗП', 'з/п'],
    same: true,
  },
  {
    name: 'salary',
    question: 'Что вы ожидаете от работы?',
    words: ['зарплата', 'заработная плата'],
    same: true,
  },
  {
    name: 'typo',
    question: 'Что нужно улучшить на сайте?',
    words: ['навигация', 'навигацич'],
    same: true,
  },
  {
    name: 'safari',
    question: 'Что нужно проверить на сайте?',
    words: ['проверка Safari', 'проверка сафари'],
    same: true,
  },
  { name: 'word-form', question: 'Чего вы сейчас ищете?', words: ['работа', 'работы'], same: true },
  {
    name: 'opposite',
    question: 'Какая зарплата?',
    words: ['высокая зарплата', 'низкая зарплата'],
    same: false,
  },
  {
    name: 'distinct',
    question: 'Что вы ожидаете от работы?',
    words: ['стабильность', 'заработок'],
    same: false,
  },
  {
    name: 'multi-typo',
    question: 'Что нужно улучшить на сайте?',
    words: ['навигация', 'навегацыя'],
    same: true,
  },
  {
    name: 'translation',
    question: 'Что вы ожидаете от работы?',
    words: ['зарплата', 'salary', 'pay'],
    same: true,
  },
  {
    name: 'transliteration',
    question: 'Что нужно улучшить на сайте?',
    words: ['навигация', 'navigatsiya'],
    same: true,
  },
  {
    name: 'ambiguous',
    question: 'Что вы ожидаете от работы?',
    words: ['ключ', 'зарплата'],
    same: false,
  },
  {
    name: 'different-context',
    question: 'Какие слова обозначают произведения искусства?',
    words: ['работа', 'работник'],
    same: false,
  },
  {
    name: 'chrome-transliteration',
    question: 'Что нужно проверить на сайте?',
    words: ['проверка Chrome', 'проверка хром'],
    same: true,
  },
  {
    name: 'programming-context',
    question: 'Какие языки программирования поддерживать?',
    words: ['Python', 'питон'],
    same: true,
  },
];
export async function runLiveCases() {
  const client = gigaClient();
  let failures = 0;
  for (const fixture of cases) {
    try {
      const model = await client.model(semanticModelPreference());
      // All words are sources too: canonical self-match must never poison a real batch.
      const result = await classify(client, model, fixture.question, fixture.words, fixture.words);
      const root = (word: string) => result.matches.find((m) => m.source === word)?.target || word;
      const merged = new Set(fixture.words.map(root)).size === 1;
      const pass = fixture.same ? merged : result.matches.length === 0;
      if (!pass) failures++;
      console.log(
        JSON.stringify({
          event: 'semantic_live_case',
          case: fixture.name,
          model,
          pass,
          expectedSame: fixture.same,
          matches: result.matches,
          rejected: result.rejected,
        }),
      );
    } catch (e) {
      failures++;
      console.log(
        JSON.stringify({
          event: 'semantic_live_case',
          case: fixture.name,
          pass: false,
          code: e instanceof AiError ? e.code : 'processing',
          detail: e instanceof AiError ? e.detail : undefined,
        }),
      );
    }
  }
  console.log(JSON.stringify({ event: 'semantic_live_complete', cases: cases.length, failures }));
  return failures;
}
if (process.argv[1]?.endsWith('check-semantic-live.ts'))
  process.exitCode = (await runLiveCases()) ? 1 : 0;
