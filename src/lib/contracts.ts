import { z } from 'zod';
export const submissionInput = z
  .object({ questionId: z.uuid(), text: z.string().min(1).max(240), idempotencyKey: z.uuid() })
  .strict();
export type Word = { text: string; count: number };
export type Question = {
  id: string;
  title: string;
  status: 'draft' | 'open' | 'paused' | 'closed';
  maxAnswers: number;
  maxLength: number;
  revision: number;
};
export type ParticipantState = {
  event: { title: string; slug: string };
  audience: { key: string; label: string };
  question: Question | null;
  remaining: number;
};
export type ScreenState = {
  title: string;
  slug: string;
  revision: string;
  audiences: {
    key: string;
    label: string;
    question: Question | null;
    words: Word[];
    answerCount: number;
    participantCount: number;
  }[];
};
