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
it('requires independent confirmation and prevents the verifier adding unproposed pairs', async () => {
  const c = semanticContract(['a', 'b'], ['c', 'd']);
  let calls = 0;
  const ai = {
    model: async () => 'test',
    generate: async () => ({
      result: {
        matches:
          calls++ === 0
            ? [{ source: c.sources[0].id, target: c.candidates[0].id, relation: 'synonym' }]
            : [{ source: c.sources[1].id, target: c.candidates[1].id, relation: 'synonym' }],
      },
      usage: null,
      model: 'test',
    }),
  };
  expect((await classify(ai, 'test', 'question', ['a', 'b'], ['c', 'd'])).matches).toEqual([]);
});
it('recovers identity-only model output with a focused pass and independently verifies it', async () => {
  const contract = semanticContract(['навигация', 'навигацич'], ['навигация', 'навигацич']);
  let calls = 0;
  const ai = {
    model: async () => 'fixture',
    generate: async (_model: string, _prompt: string, input: unknown) => {
      calls++;
      if (calls === 1)
        return {
          model: 'fixture',
          usage: null,
          result: {
            matches: contract.sources.map((s) => ({
              source: s.id,
              target: s.id,
              relation: 'synonym',
            })),
          },
        };
      const data = input as { proposals?: { source: string; target: string; relation: string }[] };
      return {
        model: 'fixture',
        usage: null,
        result: {
          matches: data.proposals?.map(({ source, target, relation }) => ({
            source,
            target,
            relation,
          })) || [
            {
              source: contract.sources[1].id,
              target: contract.candidates[0].id,
              relation: 'spelling',
            },
          ],
        },
      };
    },
  };
  expect(
    (
      await classify(
        ai,
        'fixture',
        'Что улучшить?',
        ['навигация', 'навигацич'],
        ['навигация', 'навигацич'],
      )
    ).matches,
  ).toEqual([{ source: 'навигацич', target: 'навигация', relation: 'spelling' }]);
  expect(calls).toBe(3);
});
it('supports an explicit negative decision without treating it as malformed model output', () => {
  const c = semanticContract(['стабильность'], ['заработок']);
  expect(JSON.stringify(c.schema)).toContain('"none"');
  const decoded = c.decode({
    matches: [{ source: c.sources[0].id, target: 'none', relation: 'synonym' }],
  });
  expect(decoded.matches).toEqual([]);
  expect(decoded.affected).toEqual([]);
  expect(decoded.rejected).toEqual({ NO_EQUIVALENT: 1 });
});
it('retains an independently verified match when a different focused source returns an empty generation', async () => {
  const words = ['канон', 'вариант', 'отдельно'];
  const c = semanticContract(words, words);
  let call = 0;
  const ai = {
    model: async () => 'fixture',
    generate: async (_model: string, _prompt: string, input: unknown) => {
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
      const data = input as { proposals?: { source: string; target: string; relation: string }[] };
      return {
        model: 'fixture',
        usage: null,
        result: {
          matches: data.proposals?.map(({ source, target, relation }) => ({
            source,
            target,
            relation,
          })) || [{ source: c.sources[1].id, target: c.candidates[0].id, relation: 'synonym' }],
        },
      };
    },
  };
  const result = await classify(ai, 'fixture', 'Вопрос', words, words);
  expect(result.matches).toEqual([{ source: 'вариант', target: 'канон', relation: 'synonym' }]);
  expect(result.affected).toContain('отдельно');
});
