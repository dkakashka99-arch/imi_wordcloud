import { expect, it } from 'vitest';
import { AiError } from '../../src/lib/ai/client';
import { semanticContract, classify } from '../../src/lib/semantic/classifier';
it('reproduces legacy self matches without poisoning valid mappings or inventing IDs', () => {
  const c = semanticContract(
    ['навигацич', 'стабильность', 'ошибкка'],
    ['навигация', 'стабильность', 'ошибка'],
  );
  const good = { source: c.sources[0].id, target: c.candidates[0].id, relation: 'spelling' };
  const result = c.decode({
    matches: [
      good,
      { source: c.sources[1].id, target: c.candidates[1].id, relation: 'synonym' },
      { source: c.sources[2].id, target: 'invented', relation: 'spelling' },
    ],
  });
  expect(result.matches).toEqual([
    { source: 'навигацич', target: 'навигация', relation: 'spelling' },
  ]);
  expect(result.rejected).toEqual({ SELF_MATCH: 1, UNKNOWN_ID: 1 });
  expect(result.affected).toEqual(['ошибкка']);
  expect(semanticContract(['other', 'навигацич'], ['навигация']).sources[1].id).toBe(
    c.sources[0].id,
  );
});
it('rejects cycles, chains and conflicting targets but retains independent correct pairs', () => {
  const c = semanticContract(['a', 'b', 'c', 'd'], ['a', 'b', 'c', 'd', 'e']);
  const m = (source: number, target: number) => ({
    source: c.sources[source].id,
    target: c.candidates[target].id,
    relation: 'synonym',
  });
  expect(c.decode({ matches: [m(0, 1), m(1, 0), m(2, 4)] }).matches).toEqual([
    { source: 'b', target: 'a', relation: 'synonym' },
    { source: 'c', target: 'e', relation: 'synonym' },
  ]);
  expect(c.decode({ matches: [m(0, 1), m(1, 2), m(3, 4)] }).matches).toEqual([
    { source: 'd', target: 'e', relation: 'synonym' },
  ]);
  expect(c.decode({ matches: [m(0, 1), m(0, 2), m(3, 4)] }).matches).toEqual([
    { source: 'd', target: 'e', relation: 'synonym' },
  ]);
});
function confirmed(input: unknown, equivalent = true) {
  const data = input as { pairs: { id: string }[] };
  return {
    model: 'fixture',
    usage: null,
    result: {
      decisions: data.pairs.map((p) => ({
        id: p.id,
        reason: 'Краткое смысловое обоснование',
        equivalent,
      })),
    },
  };
}
it('requires an independent boolean verdict for the exact proposed pair', async () => {
  const c = semanticContract(['a'], ['b']);
  let call = 0;
  const ai = {
    model: async () => 'fixture',
    generate: async () => ({
      model: 'fixture',
      usage: null,
      result:
        call++ === 0
          ? {
              matches: [
                { source: c.sources[0].id, target: c.candidates[0].id, relation: 'synonym' },
              ],
            }
          : { decisions: [{ id: 'invented', reason: 'Unknown pair', equivalent: true }] },
    }),
  };
  expect((await classify(ai, 'fixture', 'question', ['a'], ['b'])).matches).toEqual([]);
});
it('honors explicit negative judgments without requiring empty mapping arrays', async () => {
  const c = semanticContract(['стабильность'], ['заработок']);
  let call = 0;
  const ai = {
    model: async () => 'fixture',
    generate: async (_m: string, _p: string, input: unknown) =>
      call++ === 0
        ? {
            model: 'fixture',
            usage: null,
            result: {
              matches: [
                { source: c.sources[0].id, target: c.candidates[0].id, relation: 'synonym' },
              ],
            },
          }
        : confirmed(input, false),
  };
  const result = await classify(ai, 'fixture', 'Что важно?', ['стабильность'], ['заработок']);
  expect(result.matches).toEqual([]);
  expect(result.affected).toEqual([]);
});
it('recovers identity-only output and verifies the focused pair independently', async () => {
  const words = ['навигация', 'навигацич'];
  const c = semanticContract(words, words);
  let call = 0;
  const ai = {
    model: async () => 'fixture',
    generate: async (_m: string, _p: string, input: unknown) => {
      call++;
      if (call === 1)
        return {
          model: 'fixture',
          usage: null,
          result: {
            matches: c.sources.map((s) => ({ source: s.id, target: s.id, relation: 'synonym' })),
          },
        };
      if (call === 3) return confirmed(input);
      return {
        model: 'fixture',
        usage: null,
        result: {
          matches: [{ source: c.sources[1].id, target: c.candidates[0].id, relation: 'spelling' }],
        },
      };
    },
  };
  expect((await classify(ai, 'fixture', 'Что улучшить?', words, words)).matches).toEqual([
    { source: 'навигацич', target: 'навигация', relation: 'spelling' },
  ]);
  expect(call).toBe(3);
});
it('keeps other verified pairs when one focused source returns an empty generation', async () => {
  const words = ['канон', 'вариант', 'отдельно'];
  const c = semanticContract(words, words);
  let call = 0;
  const ai = {
    model: async () => 'fixture',
    generate: async (_m: string, _p: string, input: unknown) => {
      call++;
      if (call === 1)
        return {
          model: 'fixture',
          usage: null,
          result: {
            matches: c.sources.map((s) => ({ source: s.id, target: s.id, relation: 'synonym' })),
          },
        };
      if (call === 3) throw new AiError('empty_generation', 'CONTENT_EMPTY');
      if (call === 4) return confirmed(input);
      return {
        model: 'fixture',
        usage: null,
        result: {
          matches: [{ source: c.sources[1].id, target: c.candidates[0].id, relation: 'synonym' }],
        },
      };
    },
  };
  const result = await classify(ai, 'fixture', 'Вопрос', words, words);
  expect(result.matches).toEqual([{ source: 'вариант', target: 'канон', relation: 'synonym' }]);
  expect(result.affected).toContain('отдельно');
});
it('recovers an omitted source without discarding an already correct proposal', async () => {
  const words = ['канон', 'вариант', 'другой вариант'];
  const c = semanticContract(words, words);
  let call = 0;
  const ai = {
    model: async () => 'fixture',
    generate: async (_m: string, _p: string, input: unknown) => {
      call++;
      if (call === 3) return confirmed(input);
      const index = call === 1 ? 1 : 2;
      return {
        model: 'fixture',
        usage: null,
        result: {
          matches: [
            { source: c.sources[index].id, target: c.candidates[0].id, relation: 'synonym' },
          ],
        },
      };
    },
  };
  const result = await classify(ai, 'fixture', 'Вопрос', words, words);
  expect(result.matches).toHaveLength(2);
  expect(result.matches.every((m) => m.target === 'канон')).toBe(true);
  expect(call).toBe(3);
});
