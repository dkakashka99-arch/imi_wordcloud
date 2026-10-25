// Bound the complete request, including JSON body transfer. A stalled request
// must release its connection and let the participant safely retry.
export async function requestJson<T = unknown>(
  url: string,
  init: RequestInit = {},
  timeoutMs = 10000,
): Promise<{ response: Response; data: T }> {
  const controller = new AbortController();
  const parent = init.signal;
  let timedOut = false;
  const cancel = () => controller.abort();
  if (parent?.aborted) cancel();
  else parent?.addEventListener('abort', cancel, { once: true });
  const timer = setTimeout(() => {
    timedOut = true;
    cancel();
  }, timeoutMs);
  try {
    const response = await fetch(url, { ...init, signal: controller.signal });
    const data: T = await response.json();
    return { response, data };
  } catch (error) {
    if (timedOut)
      throw new Error('Сервер не ответил вовремя. Проверьте связь и повторите попытку.');
    if (controller.signal.aborted) throw error;
    throw new Error('Не удалось связаться с сервером. Повторите попытку.');
  } finally {
    clearTimeout(timer);
    parent?.removeEventListener('abort', cancel);
  }
}
