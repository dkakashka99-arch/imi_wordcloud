import { describe, it, expect, vi, afterEach } from 'vitest';
import {
  GigaClient,
  AiError,
  aiConfig,
  type AiConfig,
  type Transport,
} from '../../src/lib/ai/client';
import { prompt, responseSchema, sensitive, validateResult } from '../../src/lib/ai/validation';
import type { Snapshot } from '../../src/lib/ai/contracts';
const config: AiConfig = {
  key: 'test-only-not-a-real-key',
  scope: 'GIGACHAT_API_PERS',
  model: '',
  timeout: 1000,
  maxWords: 150,
};
const snapshot: Snapshot = {
  revision: 1,
  totalWords: 2,
  omitted: 0,
  groups: [{ group: 1, label: 'Не отправлять название' }],
  words: [
    { text: 'доход', count: 2, groups: [{ group: 1, count: 2 }] },
    { text: 'зарплата', count: 1, groups: [{ group: 1, count: 1 }] },
  ],
};
const result = {
  suggestions: [
    {
      source: ['доход', 'зарплата'],
      suggestedCanonical: 'зарплата',
      reason: 'О доходе',
      confidence: 0.8,
    },
  ],
};
afterEach(() => vi.unstubAllEnvs());
describe('GigaChat safety and transport', () => {
  it('requires explicit enablement and safe TLS', () => {
    vi.stubEnv('GIGACHAT_ENABLED', 'false');
    expect(() => aiConfig()).toThrow(AiError);
    vi.stubEnv('GIGACHAT_ENABLED', 'true');
    vi.stubEnv('GIGACHAT_AUTH_KEY', '');
    expect(() => aiConfig()).toThrow(AiError);
    vi.stubEnv('GIGACHAT_AUTH_KEY', 'test');
    vi.stubEnv('NODE_TLS_REJECT_UNAUTHORIZED', '0');
    expect(() => aiConfig()).toThrow(AiError);
  });
  it('rejects invented words, alias cycles, duplicate sources and fabricated evidence counts', () => {
    expect(validateResult('aliases', result, snapshot)).toEqual(result);
    const constrained = JSON.stringify(responseSchema('aliases', ['доход', 'зарплата']));
    expect(constrained).toContain('"enum":["доход","зарплата"]');
    expect(() =>
      validateResult(
        'aliases',
        { suggestions: [{ ...result.suggestions[0], source: ['зарплата', 'зарплата'] }] },
        snapshot,
      ),
    ).toThrow();
    expect(() =>
      validateResult(
        'aliases',
        { suggestions: [{ ...result.suggestions[0], suggestedCanonical: 'карьера' }] },
        snapshot,
      ),
    ).toThrow();
    expect(() =>
      validateResult('moderation', { suggestions: [{ word: 'выдумка', reason: 'нет' }] }, snapshot),
    ).toThrow();
    expect(() =>
      validateResult(
        'summary',
        {
          points: Array.from({ length: 3 }, () => ({
            text: 'Частый ответ',
            evidence: [{ word: 'доход', group: 1, count: 999 }],
          })),
        },
        snapshot,
      ),
    ).toThrow();
    expect(() =>
      validateResult(
        'aliases',
        { suggestions: [result.suggestions[0], result.suggestions[0]] },
        snapshot,
      ),
    ).toThrow();
    expect(sensitive('name@example.com')).toBe(true);
    expect(sensitive('+7 999 111-22-33')).toBe(true);
    expect(sensitive('команда')).toBe(false);
  });
  it('single-flights OAuth, discovers a Lite model and refreshes once on 401', async () => {
    let auth = 0,
      models = 0;
    const send: Transport = async (url, headers, body) => {
      if (url.includes('/oauth')) {
        auth++;
        expect(headers.Authorization).toBe('Basic ' + config.key);
        expect(headers.RqUID).toMatch(/^[a-f0-9-]{36}$/);
        expect(body).toBe('scope=GIGACHAT_API_PERS');
        await new Promise((r) => setTimeout(r, 5));
        return {
          status: 200,
          body: { access_token: 'synthetic-' + auth, expires_at: Date.now() + 1800000 },
        };
      }
      models++;
      if (models === 1) return { status: 401, body: {} };
      return { status: 200, body: { data: [{ id: 'GigaChat-2' }] } };
    };
    const c = new GigaClient(config, send);
    expect(await c.model()).toBe('GigaChat-2');
    expect(auth).toBe(2);
    await Promise.all([c.model(), c.model()]);
    expect(auth).toBe(2);
    let calls = 0;
    const concurrent = new GigaClient(config, async (...args) => {
      if (args[0].includes('/oauth')) calls++;
      return send(...args);
    });
    await Promise.all([concurrent.model(), concurrent.model(), concurrent.model()]);
    expect(calls).toBe(1);
  });
  it('uses native structured output and safely rejects quota, server failures, refusal and invalid JSON', async () => {
    for (const failure of [429, 500, 'json', 'refusal', 'timeout'] as const) {
      let chats = 0;
      const send: Transport = async (url, _headers, body) => {
        if (url.includes('/oauth'))
          return {
            status: 200,
            body: { access_token: 'synthetic', expires_at: Date.now() + 1800000 },
          };
        chats++;
        const b = JSON.parse(body!);
        expect(b.response_format.type).toBe('json_schema');
        expect(b.response_format.schema).toEqual(
          responseSchema(
            'aliases',
            snapshot.words.map((w) => w.text),
          ),
        );
        if (failure === 'timeout') throw new AiError('timeout');
        if (typeof failure === 'number') return { status: failure, body: {} };
        return {
          status: 200,
          body: {
            model: 'GigaChat-2',
            choices: [
              {
                message: { content: 'invalid' },
                finish_reason: failure === 'refusal' ? 'blacklist' : 'stop',
              },
            ],
          },
        };
      };
      const c = new GigaClient(config, send);
      await expect(
        c.generate(
          'GigaChat-2',
          prompt('aliases'),
          { words: snapshot.words },
          responseSchema(
            'aliases',
            snapshot.words.map((w) => w.text),
          ),
        ),
      ).rejects.toBeInstanceOf(AiError);
      expect(chats).toBe(1);
    }
  });
});
