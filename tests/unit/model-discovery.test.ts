import { afterEach, expect, it, vi } from 'vitest';
import { GigaClient, AiError, type Transport } from '../../src/lib/ai/client';
const config = {
  key: 'synthetic',
  scope: 'GIGACHAT_API_PERS',
  model: '',
  timeout: 20000,
  maxWords: 150,
};
const token = () => ({
  status: 200,
  body: { access_token: 'synthetic', expires_at: Date.now() + 1800000 },
});
afterEach(() => vi.useRealTimers());
it('discovers once for concurrent and successive answers, refreshes after five minutes and still validates model selection', async () => {
  vi.useFakeTimers();
  let models = 0;
  const send: Transport = async (url) => {
    if (url.includes('/oauth')) return token();
    models++;
    return { status: 200, body: { data: [{ id: 'GigaChat-2-Pro' }] } };
  };
  const client = new GigaClient(config, send);
  await Promise.all(Array.from({ length: 250 }, () => client.model('GigaChat-2-Pro')));
  expect(models).toBe(1);
  for (let i = 0; i < 20; i++) await client.model('GigaChat-2-Pro');
  expect(models).toBe(1);
  await expect(client.model('not-available')).rejects.toMatchObject({ code: 'model_unavailable' });
  await vi.advanceTimersByTimeAsync(300001);
  await client.model('GigaChat-2-Pro');
  expect(models).toBe(2);
});
it('recovers a rejected discovery from explicit 429 with bounded retry', async () => {
  vi.useFakeTimers();
  let calls = 0;
  const client = new GigaClient(config, async (url) => {
    if (url.includes('/oauth')) return token();
    calls++;
    return calls < 3
      ? { status: 429, body: null }
      : { status: 200, body: { data: [{ id: 'GigaChat-2-Pro' }] } };
  });
  const result = client.model('GigaChat-2-Pro');
  await vi.runAllTimersAsync();
  expect(await result).toBe('GigaChat-2-Pro');
  expect(calls).toBe(3);
});
it('does not cache a failed catalog or retry ambiguous provider failure', async () => {
  let calls = 0;
  const client = new GigaClient(config, async (url) => {
    if (url.includes('/oauth')) return token();
    calls++;
    if (calls === 1) throw new AiError('network');
    return { status: 200, body: { data: [{ id: 'GigaChat-2-Pro' }] } };
  });
  await expect(client.model('GigaChat-2-Pro')).rejects.toMatchObject({ code: 'network' });
  expect(calls).toBe(1);
  expect(await client.model('GigaChat-2-Pro')).toBe('GigaChat-2-Pro');
  expect(calls).toBe(2);
});
it('bounds persistent quota failures and never treats them as valid decisions', async () => {
  vi.useFakeTimers();
  let calls = 0;
  const client = new GigaClient(config, async (url) => {
    if (url.includes('/oauth')) return token();
    calls++;
    return { status: 429, body: null };
  });
  const result = expect(client.model()).rejects.toMatchObject({ code: 'quota' });
  await vi.runAllTimersAsync();
  await result;
  expect(calls).toBe(3);
});
it('does not extend the deadline when repeated quota responses exhaust the remaining retry budget', async () => {
  vi.useFakeTimers();
  const started = Date.now();
  let models = 0;
  const client = new GigaClient(config, async (url) => {
    if (url.includes('/oauth')) return token();
    models++;
    if (models === 1) vi.setSystemTime(started + 19000);
    return { status: 429, body: null };
  });
  const result = expect(client.model()).rejects.toMatchObject({ code: 'quota' });
  await vi.runAllTimersAsync();
  await result;
  expect(models).toBe(2);
  expect(Date.now() - started).toBeLessThan(20000);
});
