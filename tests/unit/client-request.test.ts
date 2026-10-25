import { afterEach, describe, expect, it, vi } from 'vitest';
import { requestJson } from '../../src/lib/client-request';

afterEach(() => {
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

function aborted(signal: AbortSignal) {
  return new Promise<never>((_, reject) => {
    signal.addEventListener('abort', () => reject(new DOMException('Aborted', 'AbortError')), {
      once: true,
    });
  });
}

describe('bounded public requests', () => {
  it('preserves the POST body and clears its deadline after success', async () => {
    vi.useFakeTimers();
    const fetch = vi
      .fn<typeof globalThis.fetch>()
      .mockResolvedValue(new Response(JSON.stringify({ accepted: true }), { status: 200 }));
    vi.stubGlobal('fetch', fetch);
    const body = JSON.stringify({ idempotencyKey: 'same-on-retry', text: 'команда' });
    const { data } = await requestJson('/submissions', { method: 'POST', body });
    expect(data).toEqual({ accepted: true });
    expect(fetch.mock.calls[0][1]).toMatchObject({ method: 'POST', body });
    expect(vi.getTimerCount()).toBe(0);
  });

  it('aborts a request that never receives headers', async () => {
    vi.useFakeTimers();
    let signal: AbortSignal;
    vi.stubGlobal(
      'fetch',
      vi.fn((_url, init: RequestInit) => {
        signal = init.signal!;
        return aborted(signal);
      }),
    );
    const pending = requestJson('/screen', {}, 1000);
    const rejection = expect(pending).rejects.toThrow('Сервер не ответил вовремя');
    await vi.advanceTimersByTimeAsync(1000);
    await rejection;
    expect(signal!.aborted).toBe(true);
    expect(vi.getTimerCount()).toBe(0);
  });

  it('also bounds a stalled JSON body after headers arrived', async () => {
    vi.useFakeTimers();
    vi.stubGlobal(
      'fetch',
      vi.fn(async (_url, init: RequestInit) => ({
        json: () => aborted(init.signal!),
      })),
    );
    const pending = requestJson('/screen', {}, 1000);
    const rejection = expect(pending).rejects.toThrow('Сервер не ответил вовремя');
    await vi.advanceTimersByTimeAsync(1000);
    await rejection;
    expect(vi.getTimerCount()).toBe(0);
  });

  it('releases a polling request when navigation aborts its parent', async () => {
    vi.useFakeTimers();
    const parent = new AbortController();
    vi.stubGlobal(
      'fetch',
      vi.fn((_url, init: RequestInit) => aborted(init.signal!)),
    );
    const pending = requestJson('/screen', { signal: parent.signal });
    const rejection = expect(pending).rejects.toMatchObject({ name: 'AbortError' });
    parent.abort();
    await rejection;
    expect(vi.getTimerCount()).toBe(0);
  });
});
