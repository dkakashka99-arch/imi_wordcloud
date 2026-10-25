import { describe, it, expect } from 'vitest';
import { csvCell, normalizeRules } from '../../src/lib/admin/moderation';
describe('moderation input and CSV safety', () => {
  it('normalizes aliases without modifying originals and rejects chains, cycles and duplicate sources', () => {
    expect(
      normalizeRules({
        action: 'rules',
        premoderation: false,
        stopWords: [' ЁЖ ', 'ёж'],
        aliases: [{ source: ' ЗП ', target: 'Зарплата' }],
      }),
    ).toEqual({ stopWords: ['еж'], aliases: [{ source: 'зп', target: 'зарплата' }] });
    for (const aliases of [
      [
        { source: 'а', target: 'б' },
        { source: 'б', target: 'в' },
      ],
      [
        { source: 'Ё', target: 'б' },
        { source: 'е', target: 'в' },
      ],
      [{ source: 'а', target: 'а' }],
    ])
      expect(() =>
        normalizeRules({ action: 'rules', premoderation: false, stopWords: [], aliases }),
      ).toThrow();
  });
  it('quotes delimiters, newlines and quotes and neutralizes spreadsheet formulas', () => {
    expect(csvCell('a;"b\nc')).toBe('"a;""b\nc"');
    for (const s of ['=1+1', ' +1', '\t@x', '-2', '\rhello'])
      expect(csvCell(s)).toBe('"\'' + s + '"');
    expect(csvCell('<img onerror=x>')).toBe('"<img onerror=x>"');
  });
});
