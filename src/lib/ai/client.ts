import {
  configuredProviderLock,
  serializedTransport,
  ProviderQueueTimeout,
} from './provider-budget';
import { randomUUID } from 'node:crypto';
import { readFileSync } from 'node:fs';
import https from 'node:https';
import { rootCertificates } from 'node:tls';
import { z } from 'zod';
export class AiError extends Error {
  constructor(
    public code: string,
    public detail?: string,
  ) {
    super(code);
  }
}
export type AiConfig = {
  key: string;
  scope: string;
  model: string;
  timeout: number;
  maxWords: number;
  caFile?: string;
};
export function aiConfig(): AiConfig {
  if (process.env.GIGACHAT_ENABLED !== 'true') throw new AiError('disabled');
  if (process.env.NODE_TLS_REJECT_UNAUTHORIZED === '0') throw new AiError('unsafe_tls');
  let key = process.env.GIGACHAT_AUTH_KEY?.trim() || '';
  if (!key && process.env.GIGACHAT_AUTH_KEY_FILE) {
    try {
      key = readFileSync(process.env.GIGACHAT_AUTH_KEY_FILE, 'utf8').trim();
    } catch {
      throw new AiError('missing_key');
    }
  }
  if (!key) throw new AiError('missing_key');
  const scope = process.env.GIGACHAT_SCOPE || 'GIGACHAT_API_PERS';
  if (!['GIGACHAT_API_PERS', 'GIGACHAT_API_B2B', 'GIGACHAT_API_CORP'].includes(scope))
    throw new AiError('configuration');
  const timeout = Number(process.env.GIGACHAT_TIMEOUT_MS || 20000),
    maxWords = Number(process.env.GIGACHAT_MAX_INPUT_WORDS || 150);
  if (
    !Number.isInteger(timeout) ||
    timeout < 1000 ||
    timeout > 60000 ||
    !Number.isInteger(maxWords) ||
    maxWords < 1 ||
    maxWords > 300
  )
    throw new AiError('configuration');
  return {
    key,
    scope,
    model: process.env.GIGACHAT_MODEL?.trim() || '',
    timeout,
    maxWords,
    caFile: process.env.GIGACHAT_CA_BUNDLE || undefined,
  };
}
// Independent from organizer AI: the automatic classifier uses the model that
// passed the contextual positive/negative regression suite with this API family.
export function semanticModelPreference() {
  return process.env.GIGACHAT_SEMANTIC_MODEL?.trim() || 'GigaChat-2-Pro';
}
export function availability() {
  try {
    aiConfig();
    return {
      available: true,
      explanation:
        'Слова и частоты отправляются в GigaChat. Проверьте список: исключите имена и другие персональные сведения.',
    };
  } catch {
    return {
      available: false,
      explanation: 'ИИ временно недоступен. Организатор может продолжать опрос и ручную модерацию.',
    };
  }
}
type Reply = { status: number; body: unknown };
export type Transport = (
  url: string,
  headers: Record<string, string>,
  body: string | undefined,
  config: AiConfig,
) => Promise<Reply>;
// Hosts are fixed by the client; redirects are never followed. Trust is scoped to these requests.
export const transport: Transport = (url, headers, body, config) =>
  new Promise((resolve, reject) => {
    let ca: string[] | undefined;
    try {
      if (config.caFile) ca = [...rootCertificates, readFileSync(config.caFile, 'utf8')];
    } catch {
      reject(new AiError('tls'));
      return;
    }
    const req = https.request(
      url,
      { method: body === undefined ? 'GET' : 'POST', headers, ca, rejectUnauthorized: true },
      (res) => {
        const parts: Buffer[] = [];
        let size = 0;
        res.on('data', (part: Buffer) => {
          if ((res.statusCode || 0) < 200 || (res.statusCode || 0) >= 300) return;
          size += part.length;
          if (size > 262144) {
            req.destroy();
            reject(new AiError('invalid_response', 'HTTP_BODY_LIMIT'));
          } else parts.push(part);
        });
        res.on('end', () => {
          clearTimeout(timer);
          if ((res.statusCode || 0) < 200 || (res.statusCode || 0) >= 300) {
            resolve({ status: res.statusCode || 0, body: null });
            return;
          }
          let data: unknown;
          try {
            data = JSON.parse(Buffer.concat(parts).toString('utf8'));
          } catch {
            reject(new AiError('invalid_response', 'HTTP_BODY_JSON'));
            return;
          }
          resolve({ status: res.statusCode || 0, body: data });
        });
        res.on('error', () => {
          clearTimeout(timer);
          reject(new AiError('network'));
        });
      },
    );
    const timer = setTimeout(() => req.destroy(new AiError('timeout')), config.timeout);
    req.on('error', (e) => {
      clearTimeout(timer);
      const code = 'code' in e ? String(e.code) : '';
      reject(
        e instanceof AiError
          ? e
          : new AiError(
              /CERT|TLS|SSL|VERIFY/.test(code) ? 'tls' : 'network',
              /^[A-Z0-9_]+$/.test(code) ? code : undefined,
            ),
      );
    });
    if (body !== undefined) req.write(body);
    req.end();
  });
const tokenSchema = z.object({
  access_token: z.string().min(1),
  expires_at: z.number().positive(),
});
const modelsSchema = z.object({ data: z.array(z.object({ id: z.string() })) });
const chatSchema = z.object({
  model: z.string(),
  choices: z
    .array(
      z.object({
        message: z.object({ content: z.string().max(100000) }),
        finish_reason: z.string().optional(),
      }),
    )
    .min(1),
  usage: z
    .object({
      prompt_tokens: z.number().int().nonnegative().optional(),
      completion_tokens: z.number().int().nonnegative().optional(),
      total_tokens: z.number().int().nonnegative().optional(),
    })
    .optional(),
});
export class GigaClient {
  private token: { value: string; expires: number } | undefined;
  private refreshing: Promise<string> | undefined;
  private catalog: { ids: string[]; expires: number } | undefined;
  private discovering: Promise<string[]> | undefined;
  constructor(
    private config: AiConfig,
    private send: Transport = transport,
  ) {}
  private async auth(force = false): Promise<string> {
    if (!force && this.token && this.token.expires > Date.now() + 60000) return this.token.value;
    if (this.refreshing) return this.refreshing;
    this.refreshing = (async () => {
      // OAuth is safe to retry; chat generation is not retried after ambiguous server errors.
      const deadline = Date.now() + this.config.timeout;
      for (let attempt = 0; attempt < 2; attempt++) {
        const r = await this.send(
          'https://ngw.devices.sberbank.ru:9443/api/v2/oauth',
          {
            Authorization: `Basic ${this.config.key}`,
            RqUID: randomUUID(),
            'Content-Type': 'application/x-www-form-urlencoded',
            Accept: 'application/json',
          },
          new URLSearchParams({ scope: this.config.scope }).toString(),
          { ...this.config, timeout: this.remaining(deadline) },
        );
        if ((r.status === 429 || r.status >= 500) && attempt === 0) {
          await new Promise((r) => setTimeout(r, 250));
          continue;
        }
        this.checkStatus(r.status);
        const t = tokenSchema.safeParse(r.body);
        if (!t.success || t.data.expires_at <= Date.now() + 60000)
          throw new AiError('invalid_response', 'OAUTH_ENVELOPE');
        this.token = { value: t.data.access_token, expires: t.data.expires_at };
        return t.data.access_token;
      }
      throw new AiError('unavailable');
    })();
    try {
      return await this.refreshing;
    } finally {
      this.refreshing = undefined;
    }
  }
  private checkStatus(status: number) {
    if (status >= 200 && status < 300) return;
    throw new AiError(
      status === 401
        ? 'authorization'
        : status === 403
          ? 'access'
          : status === 429
            ? 'quota'
            : status >= 500
              ? 'unavailable'
              : 'request_rejected',
    );
  }
  private remaining(deadline: number) {
    const remaining = deadline - Date.now();
    if (remaining <= 0) throw new AiError('timeout');
    return remaining;
  }
  private async api(path: string, body?: unknown, deadline = Date.now() + this.config.timeout) {
    let token = await this.auth();
    let refreshed = false,
      quotaRetries = 0;
    for (;;) {
      const r = await this.send(
        'https://api.giga.chat/v1/' + path,
        {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
          Accept: 'application/json',
        },
        body === undefined ? undefined : JSON.stringify(body),
        { ...this.config, timeout: this.remaining(deadline) },
      );
      if (r.status === 401 && !refreshed) {
        refreshed = true;
        if (this.token?.value === token) this.token = undefined;
        token = await this.auth();
        continue;
      }
      // An explicit 429 rejects generation: unlike an ambiguous timeout/5xx,
      // retrying it cannot publish or repeat an already accepted model result.
      if (r.status === 429 && quotaRetries < 2) {
        const delay = [500, 1500][quotaRetries++];
        if (this.remaining(deadline) > delay) {
          await new Promise((resolve) => setTimeout(resolve, delay));
          continue;
        }
      }
      this.checkStatus(r.status);
      return r.body;
    }
  }
  private async modelIds(): Promise<string[]> {
    if (this.catalog && this.catalog.expires > Date.now()) return this.catalog.ids;
    if (this.discovering) return this.discovering;
    this.discovering = (async () => {
      const r = modelsSchema.safeParse(await this.api('models'));
      if (!r.success) throw new AiError('invalid_response', 'MODEL_ENVELOPE');
      const ids = r.data.data.map((m) => m.id);
      this.catalog = { ids, expires: Date.now() + 300000 };
      return ids;
    })();
    try {
      return await this.discovering;
    } finally {
      this.discovering = undefined;
    }
  }
  async model(requested?: string) {
    const ids = await this.modelIds();
    const selected =
      requested || this.config.model || ['GigaChat-2', 'GigaChat'].find((m) => ids.includes(m));
    if (!selected || !ids.includes(selected)) throw new AiError('model_unavailable');
    return selected;
  }
  async generate(
    model: string,
    system: string,
    data: unknown,
    schema: unknown,
    retryEmpty = true,
    deadline = Date.now() + this.config.timeout,
  ): Promise<{
    result: unknown;
    usage: { prompt_tokens?: number; completion_tokens?: number; total_tokens?: number } | null;
    model: string;
  }> {
    const body = await this.api(
      'chat/completions',
      {
        model,
        messages: [
          { role: 'system', content: system },
          { role: 'user', content: JSON.stringify(data) },
        ],
        temperature: 0.0001,
        max_tokens: 1800,
        stream: false,
        response_format: { type: 'json_schema', schema, strict: true },
      },
      deadline,
    );
    const r = chatSchema.safeParse(body);
    if (!r.success) throw new AiError('invalid_response', 'CHAT_ENVELOPE');
    if (r.data.choices[0].finish_reason && r.data.choices[0].finish_reason !== 'stop')
      throw new AiError(
        'safety_or_incomplete',
        r.data.choices[0].finish_reason === 'length' ? 'LENGTH' : 'REFUSAL_OR_OTHER',
      );
    const content = r.data.choices[0].message.content;
    if (!content.trim()) {
      if (retryEmpty) return this.generate(model, system, data, schema, false, deadline);
      throw new AiError('empty_generation', 'CONTENT_EMPTY');
    }
    let result: unknown;
    try {
      result = JSON.parse(content);
    } catch {
      throw new AiError('invalid_response', 'CONTENT_JSON');
    }
    return { result, usage: r.data.usage ?? null, model: r.data.model };
  }
}
let cached: { signature: string; client: GigaClient } | undefined;
export function gigaClient() {
  const c = aiConfig();
  const signature = JSON.stringify(c);
  if (!cached || cached.signature !== signature) {
    const send = serializedTransport(transport, configuredProviderLock());
    const budgeted: Transport = async (...args) => {
      try {
        return await send(...args);
      } catch (error) {
        if (error instanceof ProviderQueueTimeout)
          throw new AiError('timeout', 'PROVIDER_QUEUE_DEADLINE');
        throw error;
      }
    };
    cached = { signature, client: new GigaClient(c, budgeted) };
  }
  return cached.client;
}
