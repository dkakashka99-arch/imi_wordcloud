import { z } from 'zod';
export const taskKind = z.enum(['aliases', 'moderation', 'summary']);
export type TaskKind = z.infer<typeof taskKind>;
const phrase = z.string().min(1).max(400);
export const aliasResult = z
  .object({
    suggestions: z
      .array(
        z
          .object({
            source: z.array(z.string().min(1).max(120)).min(2).max(10),
            suggestedCanonical: z.string().min(1).max(120),
            reason: phrase,
            confidence: z.number().min(0).max(1),
          })
          .strict(),
      )
      .max(30),
  })
  .strict();
export const moderationResult = z
  .object({
    suggestions: z
      .array(z.object({ word: z.string().min(1).max(120), reason: phrase }).strict())
      .max(30),
  })
  .strict();
export const summaryResult = z
  .object({
    points: z
      .array(
        z
          .object({
            text: phrase,
            evidence: z
              .array(
                z
                  .object({
                    word: z.string().min(1).max(120),
                    group: z.number().int().min(1),
                    count: z.number().int().positive(),
                  })
                  .strict(),
              )
              .min(1)
              .max(5),
          })
          .strict(),
      )
      .min(3)
      .max(5),
  })
  .strict();
export const resultSchemas = {
  aliases: aliasResult,
  moderation: moderationResult,
  summary: summaryResult,
};
export type AiResult =
  z.infer<typeof aliasResult> | z.infer<typeof moderationResult> | z.infer<typeof summaryResult>;
export type AiWord = { text: string; count: number; groups: { group: number; count: number }[] };
export type Snapshot = {
  revision: number;
  words: AiWord[];
  groups: { group: number; label: string }[];
  omitted: number;
  totalWords: number;
};
export type AiJob = {
  id: string;
  kind: TaskKind;
  model: string;
  status: 'running' | 'completed' | 'failed' | 'discarded';
  revision: number;
  reviewRevision: number;
  snapshot: Snapshot;
  result: AiResult | null;
  decisions: Record<string, 'accepted' | 'rejected'>;
  usage: { prompt_tokens?: number; completion_tokens?: number; total_tokens?: number } | null;
  error: string | null;
  createdAt: string;
  finishedAt: string | null;
};
export const aiCommand = z.discriminatedUnion('action', [
  z
    .object({
      action: z.literal('start'),
      kind: taskKind,
      words: z.array(z.string().min(1).max(120)).min(1).max(300),
      consent: z.literal(true),
    })
    .strict(),
  z
    .object({
      action: z.literal('decision'),
      jobId: z.uuid(),
      index: z.number().int().min(0).max(29),
      accept: z.boolean(),
    })
    .strict(),
  z.object({ action: z.literal('publish'), jobId: z.uuid() }).strict(),
  z.object({ action: z.literal('discard'), jobId: z.uuid() }).strict(),
  z.object({ action: z.literal('unpublish') }).strict(),
]);
export type AiCommand = z.infer<typeof aiCommand>;
export type AiState = {
  available: boolean;
  explanation: string;
  snapshot: Snapshot;
  jobs: AiJob[];
  published: boolean;
  totalTokens: number;
};
