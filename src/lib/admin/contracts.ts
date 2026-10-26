import { z } from 'zod';
const title = z.string().trim().min(1).max(240);
const key = z
  .string()
  .regex(/^[a-z0-9][a-z0-9-]{0,63}$/u)
  .refine((s) => s !== 'screen', 'Это имя зарезервировано.');
export const createEventInput = z.object({ title, slug: key }).strict();
export const loginInput = z
  .object({ login: z.string().trim().min(1).max(64), password: z.string().min(1).max(256) })
  .strict();
export const questionFields = {
  title,
  audienceIds: z.array(z.uuid()).min(1),
  maxAnswers: z.number().int().min(1).max(10),
  maxLength: z.number().int().min(1).max(120),
};
export const commandInput = z.discriminatedUnion('action', [
  z.object({ action: z.literal('deleteEvent'), confirmTitle: title }).strict(),
  z.object({ action: z.literal('clearAnswers'), confirmTitle: title }).strict(),
  z.object({ action: z.literal('editEvent'), title }).strict(),
  z.object({ action: z.literal('archive'), archived: z.boolean() }).strict(),
  z
    .object({
      action: z.literal('duplicate'),
      rehearsal: z.boolean().optional(),
      ...createEventInput.shape,
    })
    .strict(),
  z.object({ action: z.literal('addAudience'), key, label: title }).strict(),
  z.object({ action: z.literal('editAudience'), audienceId: z.uuid(), label: title }).strict(),
  z.object({ action: z.literal('deleteAudience'), audienceId: z.uuid() }).strict(),
  z.object({ action: z.literal('addQuestion'), ...questionFields }).strict(),
  z.object({ action: z.literal('editQuestion'), questionId: z.uuid(), ...questionFields }).strict(),
  z.object({ action: z.literal('deleteQuestion'), questionId: z.uuid() }).strict(),
  z.object({ action: z.literal('activate'), questionId: z.uuid() }).strict(),
  z
    .object({
      action: z.literal('status'),
      questionId: z.uuid(),
      status: z.enum(['draft', 'open', 'paused', 'closed']),
    })
    .strict(),
  z
    .object({ action: z.literal('move'), questionId: z.uuid(), direction: z.enum(['up', 'down']) })
    .strict(),
]);
export type AdminCommand = z.infer<typeof commandInput>;
export type AdminQuestion = {
  id: string;
  title: string;
  status: 'draft' | 'open' | 'paused' | 'closed';
  maxAnswers: number;
  maxLength: number;
  position: number;
  audienceIds: string[];
  active: boolean;
  answerCount: number;
};
export type AdminEvent = {
  publicAudienceKey?: string | null;
  id: string;
  slug: string;
  title: string;
  archived: boolean;
  rehearsal: boolean;
  createdAt: string;
  audiences: { id: string; key: string; label: string }[];
  questions: AdminQuestion[];
};
export type EventListItem = {
  id: string;
  slug: string;
  title: string;
  archived: boolean;
  rehearsal: boolean;
  createdAt: string;
  questionCount: number;
  answerCount: number;
};
