import { describe, expect, it } from 'vitest';
import { deterministicCategory, rejectionReason } from '../../src/lib/semantic/rules';
import { validateMatches } from '../../src/lib/semantic/worker';
describe('automatic semantic safety', () => {
  const question = 'Что вы ожидаете от будущей работы?';
  it('groups salary and remote variants without changing unrelated concepts', () => {
    for (const word of ['ЗП', 'з/п', 'зарплата', 'заработная плата', 'оплата труда'])
      expect(deterministicCategory(question, word)).toBe('зарплата');
    for (const word of ['удалёнка', 'работа из дома', 'дистанционная работа'])
      expect(deterministicCategory(question, word)).toBe('удаленная работа');
    for (const word of ['отпуск', 'карьера', 'обучение', 'стабильность'])
      expect(deterministicCategory(question, word)).toBeNull();
    expect(deterministicCategory('Какие слова вы знаете?', 'ЗП')).toBeNull();
  });
  it('rejects injection, contacts, profanity obfuscation and multiple thoughts', () => {
    for (const word of [
      '<script>alert(1)</script>',
      '79991234567',
      'a@b.ru',
      'х у й',
      'зарплата и график',
    ])
      expect(rejectionReason(word)).not.toBeNull();
    for (const word of ['страхование', 'обучение', 'отпуск', 'дружный коллектив'])
      expect(rejectionReason(word)).toBeNull();
  });
  it('rejects hallucinations, duplicate sources and alias chains', () => {
    const pair = { source: 'зп', target: 'зарплата', relation: 'abbreviation' };
    expect(validateMatches({ matches: [pair] }, ['зп'], ['зарплата'])).toEqual([pair]);
    expect(() => validateMatches({ matches: [pair] }, ['зп'], ['отпуск'])).toThrow();
    expect(() => validateMatches({ matches: [pair, pair] }, ['зп'], ['зарплата'])).toThrow();
    expect(() =>
      validateMatches(
        { matches: [pair, { source: 'зарплата', target: 'деньги', relation: 'synonym' }] },
        ['зп', 'зарплата'],
        ['зарплата', 'деньги'],
      ),
    ).toThrow();
  });
});
