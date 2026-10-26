// Run on the existing trusted VPS with its configured provider; never print credentials.
import assert from 'node:assert/strict';
import { analyzeAnswer } from '../src/lib/semantic/admission';
if (!process.argv.includes('--live')) throw new Error('Live provider call requires --live');
const question = 'Что вы ожидаете от будущей работы?';
const candidates = [
  { canonical: 'хороший коллектив', family: 'коллектив' },
  { canonical: 'зарплата', family: 'доход' },
  { canonical: 'высокая зарплата', family: 'доход' },
];
const cases: { text: string; verdict: string; canonical?: string; family?: string }[] = [
  ...[
    'свободное время',
    'перспективы',
    'уважение',
    'красивые женщины',
    'комфорт',
    'дружба',
    'счастье',
    'смысл',
    'независимость',
    'путешествия',
    'отсутствие стресса',
    'кайф',
  ].map((text) => ({ text, verdict: 'allow' })),
  { text: 'баланс работы и жизни', verdict: 'allow' },
  { text: 'работа, которая нравится', verdict: 'allow' },
  { text: 'страхование', verdict: 'allow' },
  { text: 'обучение', verdict: 'allow' },
  { text: 'зарплата, коллектив, карьера', verdict: 'multiple' },
  { text: 'опыт, денег', verdict: 'multiple' },
  { text: 'зарплата и график', verdict: 'multiple' },
  { text: 'секс', verdict: 'unsafe' },
  { text: 'титьки', verdict: 'unsafe' },
  {
    text: 'хорошый колектив',
    verdict: 'allow',
    canonical: 'хороший коллектив',
    family: 'коллектив',
  },
  { text: 'good team', verdict: 'allow', canonical: 'хороший коллектив', family: 'коллектив' },
  { text: 'salary', verdict: 'allow', canonical: 'зарплата', family: 'доход' },
  { text: 'высокая зп', verdict: 'allow', canonical: 'высокая зарплата', family: 'доход' },
];
for (const [index, c] of cases.entries()) {
  const result = await analyzeAnswer(question, c.text, candidates);
  assert.equal(result.verdict, c.verdict, `Case ${index}: verdict`);
  if (c.canonical) assert.equal(result.canonical, c.canonical, `Case ${index}: canonical`);
  if (c.family) assert.equal(result.family, c.family, `Case ${index}: family`);
  console.log(`admission case ${index + 1}/${cases.length}: PASS`);
}
