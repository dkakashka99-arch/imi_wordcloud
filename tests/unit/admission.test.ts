import { describe, it, expect, vi } from 'vitest';
import { analyzeAnswer, admissionMessage } from '../../src/lib/semantic/admission';
describe('AI admission boundary', () => {
  it('passes question, original phrase and existing families and normalizes output', async () => {
    const generate = vi
      .fn()
      .mockResolvedValue({
        result: { verdict: 'allow', canonical: '  Хороший коллектив ', family: ' Коллеги ' },
      });
    const result = await analyzeAnswer(
      'Что важно?',
      'good team',
      [{ canonical: 'хороший коллектив', family: 'коллеги' }],
      { model: vi.fn().mockResolvedValue('test'), generate },
    );
    expect(result).toEqual({ verdict: 'allow', canonical: 'хороший коллектив', family: 'коллеги' });
    expect(generate.mock.calls[0][2]).toEqual({
      question: 'Что важно?',
      text: 'good team',
      candidates: [{ canonical: 'хороший коллектив', family: 'коллеги' }],
    });
  });
  it('rejects malformed or unsafe normalized output instead of publishing it', async () => {
    for (const result of [
      { verdict: 'allow' },
      { verdict: 'allow', canonical: 'https://bad.test', family: 'тема' },
    ]) {
      await expect(
        analyzeAnswer('Вопрос', 'слово', [], {
          model: vi.fn().mockResolvedValue('test'),
          generate: vi.fn().mockResolvedValue({ result }),
        }),
      ).rejects.toThrow();
    }
  });
  it('preserves list and safety verdicts and explains rejection without quoting content', async () => {
    for (const verdict of ['multiple', 'unsafe', 'irrelevant'] as const) {
      const result = await analyzeAnswer('Вопрос', 'данные', [], {
        model: vi.fn().mockResolvedValue('test'),
        generate: vi
          .fn()
          .mockResolvedValue({ result: { verdict, canonical: 'ответ', family: 'тема' } }),
      });
      expect(result.verdict).toBe(verdict);
      expect(admissionMessage(verdict)).not.toContain('данные');
    }
  });
});
