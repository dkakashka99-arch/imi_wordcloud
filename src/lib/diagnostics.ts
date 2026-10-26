import { AsyncLocalStorage } from 'node:async_hooks';
import { randomUUID } from 'node:crypto';
import { AiError } from './ai/client';

const requests = new AsyncLocalStorage<{ traceId: string; stage: string }>();
export function withRequestTrace<T>(run: () => T) {
  return requests.run({ traceId: randomUUID(), stage: 'read-question' }, run);
}
export function requestTraceId() {
  return requests.getStore()?.traceId;
}
export function diagnosticStage(
  stage: 'read-question' | 'cache' | 'choose-model' | 'generate' | 'validate' | 'save',
) {
  const context = requests.getStore();
  if (context) context.stage = stage;
}
// Never stringify exceptions: Zod issues, provider messages and SQL may contain input.
const codes = new Set([
  'disabled',
  'unsafe_tls',
  'missing_key',
  'configuration',
  'tls',
  'network',
  'timeout',
  'invalid_response',
  'authorization',
  'access',
  'quota',
  'unavailable',
  'request_rejected',
  'model_unavailable',
  'safety_or_incomplete',
  'empty_generation',
]);
const details = new Set([
  'HTTP_BODY_LIMIT',
  'HTTP_BODY_JSON',
  'OAUTH_ENVELOPE',
  'MODEL_ENVELOPE',
  'CHAT_ENVELOPE',
  'LENGTH',
  'REFUSAL_OR_OTHER',
  'CONTENT_EMPTY',
  'CONTENT_JSON',
  'PROVIDER_QUEUE_DEADLINE',
  'RESULT_SCHEMA',
  'NORMALIZED_OUTPUT',
]);
export function safeFailure(error: unknown) {
  return {
    providerErrorCode:
      error instanceof AiError && codes.has(error.code) ? error.code : 'internal_exception',
    providerErrorDetail:
      error instanceof AiError && error.detail && details.has(error.detail)
        ? error.detail
        : undefined,
  };
}
export function logAdmissionFailure(error: unknown, elapsedMs: number, candidateCount: number) {
  console.error(
    JSON.stringify({
      event: 'participant_admission_failure',
      operation: 'participant.admission',
      traceId: requestTraceId(),
      stage: requests.getStore()?.stage,
      status: 'provider_error',
      ...safeFailure(error),
      elapsedMs,
      candidateCount,
      requestOutcome: 503,
    }),
  );
}
