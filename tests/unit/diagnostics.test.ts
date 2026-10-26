import { describe, it, expect, vi } from 'vitest';
import { AiError } from '../../src/lib/ai/client';
import {
  withRequestTrace,
  requestTraceId,
  diagnosticStage,
  logAdmissionFailure,
  safeFailure,
} from '../../src/lib/diagnostics';

describe('payload-free admission diagnostics', () => {
  it('does not leak arbitrary errors or provider detail', () => {
    expect(JSON.stringify(safeFailure(new Error('secret input')))).not.toContain('secret');
    expect(safeFailure(new AiError('bad secret', 'payload'))).toEqual({
      providerErrorCode: 'internal_exception',
      providerErrorDetail: undefined,
    });
    expect(safeFailure(new AiError('invalid_response', 'RESULT_SCHEMA'))).toEqual({
      providerErrorCode: 'invalid_response',
      providerErrorDetail: 'RESULT_SCHEMA',
    });
  });
  it('keeps concurrent request ids and stages isolated', async () => {
    const log = vi.spyOn(console, 'error').mockImplementation(() => {});
    try {
      const ids = await Promise.all(
        ['generate', 'validate'].map((stage) =>
          withRequestTrace(async () => {
            const id = requestTraceId();
            diagnosticStage(stage as 'generate' | 'validate');
            await Promise.resolve();
            logAdmissionFailure(new AiError('timeout'), 20, 3);
            return id;
          }),
        ),
      );
      expect(ids[0]).not.toBe(ids[1]);
      expect(log.mock.calls.map(([line]) => JSON.parse(line).stage)).toEqual([
        'generate',
        'validate',
      ]);
      expect(requestTraceId()).toBeUndefined();
    } finally {
      log.mockRestore();
    }
  });
});
