import { normalizeWord } from '../normalize';

export const RULE_VERSION = 'career-equivalence-v1';
const families: [string, string[]][] = [
  [
    'зарплата',
    [
      'зп',
      'з/п',
      'з.п.',
      'зарплата',
      'заработная плата',
      'оплата труда',
      'высокий заработок',
      'большая зарплата',
      'достойный доход',
    ],
  ],
  ['удаленная работа', ['удаленка', 'удаленная работа', 'дистанционная работа', 'работа из дома']],
  ['хороший коллектив', ['коллектив', 'хороший коллектив', 'хорошая команда', 'дружные коллеги']],
];
export function deterministicCategory(question: string, input: string): string | null {
  // Scope the dictionary to career questions; do not equate these phrases in arbitrary polls.
  if (!/работ|труд|карьер|работодател|сотрудник|професси/iu.test(question)) return null;
  const key = normalizeWord(input).replace(/[.!?,;:]+$/u, '');
  return families.find(([, aliases]) => aliases.includes(key))?.[0] ?? null;
}

export function rejectionReason(text: string): string | null {
  const normalized = normalizeWord(text);
  if (/[<>]|https?:|www\.|@/iu.test(text)) return 'Не добавляйте ссылки, HTML или контакты.';
  if (/(?:\d[\s()+.-]*){7,}/u.test(text))
    return 'Не указывайте телефон или другие персональные номера.';
  if (/^[А-ЯЁ][а-яё]+\s+[А-ЯЁ][а-яё]+(?:\s+[А-ЯЁ][а-яё]+)?$/u.test(text.trim()))
    return 'Ответ должен быть без ФИО.';
  const compact = normalized
    .replace(/[^\p{L}]/gu, '')
    .replace(/[aа]/g, 'а')
    .replace(/[eе]/g, 'е')
    .replace(/[oо]/g, 'о')
    .replace(/[xх]/g, 'х');
  if (/(?:хуй|хуя|пизд|бляд|блять|ебат|ебан|сука)/u.test(compact))
    return 'Пожалуйста, ответьте без оскорблений и брани.';
  if (/(.)\1{6,}/u.test(normalized)) return 'Уберите повторяющиеся символы.';
  if (/\s(?:и|или)\s|[\n]/iu.test(text))
    return 'Напишите одну мысль за отправку. Например: «зарплата».';
  return null;
}
