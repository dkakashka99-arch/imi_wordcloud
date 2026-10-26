import type { PoolClient } from 'pg';
import { analyzeAnswer, admissionMessage, type Analysis } from './semantic/admission';
import { database } from '@/db/client';
import { normalizeWord } from './normalize';
import { HttpError } from './http';
import type { ParticipantState, Question, ScreenState } from './contracts';
import { deterministicCategory, rejectionReason, RULE_VERSION } from './semantic/rules';

type QueryClient = Pick<PoolClient, 'query'>;
type Context = {
  event_id: string;
  rehearsal: boolean;
  title: string;
  slug: string;
  audience_id: string;
  audience_key: string;
  label: string;
};
async function context(
  slug: string,
  audience: string,
  client: QueryClient = database(),
  lockEvent = false,
): Promise<Context> {
  const result = await client.query<Context>(
    `SELECT e.id event_id,e.title,e.slug,e.rehearsal,a.id audience_id,a.key audience_key,a.label FROM events e JOIN audiences a ON a.event_id=e.id WHERE e.slug=$1 AND a.key=$2 AND (e.public_audience_key IS NULL OR e.public_audience_key=a.key) AND NOT e.archived${lockEvent ? ' FOR SHARE OF e' : ''}`,
    [slug, audience],
  );
  if (!result.rows[0]) throw new HttpError(404, 'Мероприятие или группа не найдены.');
  return result.rows[0];
}
async function activeQuestion(
  ctx: Context,
  client: QueryClient = database(),
): Promise<Question | null> {
  const r = await client.query<Question>(
    `SELECT q.id,q.title,q.status,q.max_answers "maxAnswers",q.max_length "maxLength",q.revision::integer FROM questions q JOIN question_audiences qa ON qa.question_id=q.id WHERE qa.audience_id=$1 AND qa.active`,
    [ctx.audience_id],
  );
  return r.rows[0] ?? null;
}
export async function participantState(
  slug: string,
  audience: string,
  hash: string,
): Promise<ParticipantState> {
  const ctx = await context(slug, audience);
  const question = await activeQuestion(ctx);
  const count = question
    ? await database().query(
        `SELECT count(*)::int n FROM submissions s JOIN participants p ON p.id=s.participant_id WHERE s.question_id=$1 AND p.event_id=$2 AND p.cookie_hash=$3`,
        [question.id, ctx.event_id, hash],
      )
    : null;
  return {
    event: { title: ctx.title, slug: ctx.slug, rehearsal: ctx.rehearsal },
    audience: { key: ctx.audience_key, label: ctx.label },
    question,
    remaining: question ? Math.max(0, question.maxAnswers - (count?.rows[0]?.n || 0)) : 0,
  };
}
export async function submit(
  slug: string,
  audience: string,
  hash: string,
  input: { questionId: string; text: string; idempotencyKey: string },
) {
  const key = normalizeWord(input.text);
  const rejection = rejectionReason(input.text);
  if (rejection) throw new HttpError(400, rejection);
  if (!/[\p{L}\p{N}]/u.test(key)) throw new HttpError(400, 'Напишите слово или короткую фразу.');
  // Provider calls happen before any write locks. Recheck title/revision and quotas
  // inside the transaction, so a concurrent clear/edit/delete cannot revive old work.
  const preContext = await context(slug, audience);
  const preQuestion = (
    await database().query(
      `SELECT q.title,q.semantic_revision,q.max_length,q.status,qa.active FROM questions q JOIN question_audiences qa ON qa.question_id=q.id WHERE q.id=$1 AND q.event_id=$2 AND qa.audience_id=$3`,
      [input.questionId, preContext.event_id, preContext.audience_id],
    )
  ).rows[0];
  const replay = (
    await database().query(
      'SELECT 1 FROM submission_requests sr JOIN participants p ON p.id=sr.participant_id WHERE sr.question_id=$1 AND p.event_id=$2 AND p.cookie_hash=$3 AND sr.idempotency_key=$4 AND sr.canonical_key=$5 AND sr.audience_id=$6',
      [
        input.questionId,
        preContext.event_id,
        hash,
        input.idempotencyKey,
        key,
        preContext.audience_id,
      ],
    )
  ).rowCount;
  if (!preQuestion || (!replay && (!preQuestion.active || preQuestion.status !== 'open')))
    throw new HttpError(409, 'Приём ответов приостановлен или вопрос изменился.');
  if (!replay && Array.from(key).length > preQuestion.max_length)
    throw new HttpError(400, `Не больше ${preQuestion.max_length} символов.`);
  let analysis: Analysis | null = null;
  if (!replay && process.env.GIGACHAT_ENABLED === 'true') {
    const cached = (
      await database().query(
        'SELECT verdict,canonical,family FROM answer_analysis WHERE question_id=$1 AND source=$2 AND title=$3 AND semantic_revision=$4',
        [input.questionId, key, preQuestion.title, preQuestion.semantic_revision],
      )
    ).rows[0];
    if (cached) analysis = cached;
    else {
      const candidates = (
        await database().query(
          `SELECT DISTINCT COALESCE(wa.target,a.canonical) canonical,a.family FROM answer_analysis a LEFT JOIN word_aliases wa ON wa.question_id=a.question_id AND wa.source=a.source WHERE a.question_id=$1 AND a.verdict='allow' AND a.title=$2 AND a.semantic_revision=$3 ORDER BY canonical LIMIT 150`,
          [input.questionId, preQuestion.title, preQuestion.semantic_revision],
        )
      ).rows;
      try {
        analysis = await analyzeAnswer(preQuestion.title, input.text, candidates);
      } catch {
        throw new HttpError(503, 'Не удалось проверить ответ. Попробуйте отправить ещё раз.');
      }
    }
    if (analysis && analysis.verdict !== 'allow')
      throw new HttpError(400, admissionMessage(analysis.verdict));
  } else if (!replay && process.env.NODE_ENV === 'production') {
    throw new HttpError(503, 'Проверка ответов временно недоступна. Попробуйте позже.');
  }
  const client = await database().connect();
  try {
    await client.query('BEGIN');
    const ctx = await context(slug, audience, client, true);
    // Question lock serializes state transitions, quota checks and revision increments.
    const qr = await client.query(
      `SELECT q.* FROM questions q JOIN question_audiences qa ON qa.question_id=q.id WHERE q.id=$1 AND q.event_id=$2 AND qa.audience_id=$3 FOR UPDATE OF q`,
      [input.questionId, ctx.event_id, ctx.audience_id],
    );
    const q = qr.rows[0];
    if (
      !q ||
      q.title !== preQuestion.title ||
      q.semantic_revision !== preQuestion.semantic_revision
    )
      throw new HttpError(409, 'Вопрос изменился. Обновите страницу.');
    await client.query(
      `INSERT INTO participants(event_id,cookie_hash) VALUES($1,$2) ON CONFLICT(event_id,cookie_hash) DO NOTHING`,
      [ctx.event_id, hash],
    );
    const p = await client.query(
      `SELECT id FROM participants WHERE event_id=$1 AND cookie_hash=$2 FOR UPDATE`,
      [ctx.event_id, hash],
    );
    const participant = p.rows[0].id;
    const previous = await client.query(
      `SELECT id,canonical_key,audience_id FROM submission_requests WHERE question_id=$1 AND participant_id=$2 AND idempotency_key=$3`,
      [q.id, participant, input.idempotencyKey],
    );
    let duplicate = false;
    if (previous.rows[0]) {
      if (
        previous.rows[0].canonical_key !== key ||
        previous.rows[0].audience_id !== ctx.audience_id
      )
        throw new HttpError(409, 'Ключ повтора уже использован для другого ответа.');
      duplicate = true;
    } else {
      const membership = await client.query(
        'SELECT active FROM question_audiences WHERE question_id=$1 AND audience_id=$2',
        [q.id, ctx.audience_id],
      );
      if (!membership.rows[0]?.active || q.status !== 'open')
        throw new HttpError(409, 'Приём ответов приостановлен или вопрос изменился.');
      if (Array.from(key).length > q.max_length)
        throw new HttpError(400, `Не больше ${q.max_length} символов.`);
      const existing = await client.query(
        'SELECT id FROM submissions WHERE question_id=$1 AND participant_id=$2 AND canonical_key=$3',
        [q.id, participant, key],
      );
      if (existing.rowCount) duplicate = true;
      else {
        const count = await client.query(
          'SELECT count(*)::int n FROM submissions WHERE question_id=$1 AND participant_id=$2',
          [q.id, participant],
        );
        if (count.rows[0].n >= q.max_answers)
          throw new HttpError(409, 'Вы уже отправили максимальное число ответов.');
        if (analysis) {
          const saved = await client.query(
            `INSERT INTO answer_analysis(question_id,source,title,semantic_revision,verdict,canonical,family) VALUES($1,$2,$3,$4,$5,$6,$7)
             ON CONFLICT(question_id,source) DO UPDATE SET title=EXCLUDED.title,semantic_revision=EXCLUDED.semantic_revision,verdict=EXCLUDED.verdict,canonical=EXCLUDED.canonical,family=EXCLUDED.family
             WHERE answer_analysis.title<>EXCLUDED.title OR answer_analysis.semantic_revision<>EXCLUDED.semantic_revision RETURNING canonical,family`,
            [
              q.id,
              key,
              q.title,
              q.semantic_revision,
              analysis.verdict,
              analysis.canonical,
              analysis.family,
            ],
          );
          if (!saved.rowCount) {
            const prior = (
              await client.query(
                'SELECT canonical,family FROM answer_analysis WHERE question_id=$1 AND source=$2',
                [q.id, key],
              )
            ).rows[0];
            analysis = { ...analysis, ...prior };
          }
        }
        let category = analysis?.canonical || deterministicCategory(q.title, key);
        if (category) {
          const target = await client.query(
            'SELECT target FROM word_aliases WHERE question_id=$1 AND source=$2',
            [q.id, category],
          );
          category = target.rows[0]?.target || category;
        }
        const blocked = await client.query(
          `SELECT 1 FROM stop_words sw LEFT JOIN word_aliases wa ON wa.question_id=sw.question_id AND wa.source=$2 WHERE sw.question_id=$1 AND sw.word IN($2,COALESCE(wa.target,$2),$3)`,
          [q.id, key, category],
        );
        if (blocked.rowCount)
          throw new HttpError(400, 'Этот ответ не допускается правилами вопроса.');
        const known = await client.query(
          'SELECT 1 FROM word_aliases WHERE question_id=$1 AND source=$2',
          [q.id, key],
        );
        const priorClassification = await client.query(
          'SELECT 1 FROM semantic_history WHERE question_id=$1 AND source=$2 LIMIT 1',
          [q.id, key],
        );
        if (category && category !== key && !known.rowCount && !priorClassification.rowCount) {
          // Original normalized keys and all votes remain immutable. Aliases only affect display.
          await client.query(
            'INSERT INTO word_aliases(question_id,source,target) VALUES($1,$2,$3) ON CONFLICT DO NOTHING',
            [q.id, key, category],
          );
          await client.query(
            'INSERT INTO semantic_history(question_id,source,target,method,version) VALUES($1,$2,$3,$4,$5)',
            [q.id, key, category, analysis ? 'gigachat-admission' : 'dictionary', RULE_VERSION],
          );
          await client.query(
            'INSERT INTO semantic_history(question_id,source,target,method,version) SELECT question_id,source,$3,$4,$5 FROM word_aliases WHERE question_id=$1 AND target=$2',
            [q.id, key, category, 'dictionary-flatten', RULE_VERSION],
          );
          await client.query(
            'UPDATE word_aliases SET target=$3 WHERE question_id=$1 AND target=$2',
            [q.id, key, category],
          );
        } else if (!category && !known.rowCount && !priorClassification.rowCount) {
          await client.query(
            'INSERT INTO semantic_queue(question_id,source) VALUES($1,$2) ON CONFLICT DO NOTHING',
            [q.id, key],
          );
        }
        if (analysis) {
          // Reconcile independently reviewed answers too: simultaneous requests may
          // both have seen an empty candidate snapshot before their provider call.
          await client.query(
            'INSERT INTO semantic_queue(question_id,source) VALUES($1,$2) ON CONFLICT DO NOTHING',
            [q.id, category || key],
          );
        }
        await client.query(
          `INSERT INTO submissions(event_id,question_id,audience_id,participant_id,original_text,canonical_key,idempotency_key,approved,is_demo) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9)`,
          [
            ctx.event_id,
            q.id,
            ctx.audience_id,
            participant,
            input.text,
            key,
            input.idempotencyKey,
            !q.premoderation,
            ctx.rehearsal,
          ],
        );
        // A previously unmatched word may become classifiable when a genuinely new
        // candidate arrives. Retry at most three times; repeated votes do not loop.
        await client.query(
          `UPDATE semantic_queue SET status='pending',available_at=now(),error=NULL,error_detail=NULL
           WHERE question_id=$1 AND status='review' AND error='no_equivalent' AND attempts<3
           AND (SELECT count(*) FROM submissions WHERE question_id=$1 AND canonical_key=$2)=1`,
          [q.id, key],
        );
        await client.query('UPDATE questions SET revision=revision+1 WHERE id=$1', [q.id]);
      }
    }
    if (!previous.rowCount)
      await client.query(
        'INSERT INTO submission_requests(question_id,participant_id,audience_id,idempotency_key,canonical_key) VALUES($1,$2,$3,$4,$5)',
        [q.id, participant, ctx.audience_id, input.idempotencyKey, key],
      );
    const count = await client.query(
      'SELECT count(*)::int n FROM submissions WHERE question_id=$1 AND participant_id=$2',
      [q.id, participant],
    );
    await client.query('COMMIT');
    return { accepted: true, duplicate, remaining: Math.max(0, q.max_answers - count.rows[0].n) };
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}
export async function screenState(slug: string): Promise<ScreenState> {
  const client = await database().connect();
  try {
    await client.query('BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY');
    const e = await client.query(
      'SELECT id,title,slug,rehearsal,public_audience_key FROM events WHERE slug=$1 AND NOT archived',
      [slug],
    );
    if (!e.rows[0]) throw new HttpError(404, 'Мероприятие не найдено.');
    const event = e.rows[0];
    const groups = await client.query(
      'SELECT id,key,label FROM audiences WHERE event_id=$1 AND ($2::text IS NULL OR key=$2) ORDER BY key',
      [event.id, event.public_audience_key],
    );
    const result: ScreenState = {
      title: event.title,
      slug,
      rehearsal: event.rehearsal,
      revision: '',
      audiences: [],
    };
    for (const a of groups.rows) {
      const q = await activeQuestion({ audience_id: a.id } as Context, client);
      const rows = q
        ? await client.query(
            `SELECT cloud.text,cloud.count,a.family FROM (
              SELECT COALESCE(wa.target,s.canonical_key) text,count(*)::int count FROM submissions s LEFT JOIN word_aliases wa ON wa.question_id=s.question_id AND wa.source=s.canonical_key WHERE s.question_id=$1 AND s.audience_id=$2 AND s.approved AND NOT EXISTS(SELECT 1 FROM stop_words sw WHERE sw.question_id=s.question_id AND sw.word IN(s.canonical_key,COALESCE(wa.target,s.canonical_key))) GROUP BY COALESCE(wa.target,s.canonical_key) ORDER BY count DESC,text LIMIT 80
            ) cloud LEFT JOIN LATERAL (SELECT min(family) family FROM answer_analysis WHERE question_id=$1 AND verdict='allow' AND (canonical=cloud.text OR source=cloud.text)) a ON true ORDER BY cloud.count DESC,cloud.text`,
            [q.id, a.id],
          )
        : null;
      const totals = q
        ? await client.query(
            `SELECT count(*)::int answers,count(DISTINCT s.participant_id)::int participants FROM submissions s LEFT JOIN word_aliases wa ON wa.question_id=s.question_id AND wa.source=s.canonical_key WHERE s.question_id=$1 AND s.audience_id=$2 AND s.approved AND NOT EXISTS(SELECT 1 FROM stop_words sw WHERE sw.question_id=s.question_id AND sw.word IN(s.canonical_key,COALESCE(wa.target,s.canonical_key)))`,
            [q.id, a.id],
          )
        : null;
      result.audiences.push({
        key: a.key,
        label: a.label,
        question: q,
        words: (rows?.rows || []).map(({ family, ...word }) =>
          family ? { ...word, family } : word,
        ),
        answerCount: totals?.rows[0]?.answers || 0,
        participantCount: totals?.rows[0]?.participants || 0,
        summary: q
          ? (
              await client.query(
                'SELECT CASE WHEN ai_summary_revision=revision THEN ai_summary ELSE NULL END summary FROM questions WHERE id=$1',
                [q.id],
              )
            ).rows[0]?.summary
          : null,
      });
    }
    result.revision = JSON.stringify(
      result.audiences.map((a) => [
        a.key,
        a.label,
        a.question?.id,
        a.question?.revision,
        a.question?.status,
        a.question?.title,
      ]),
    );
    await client.query('COMMIT');
    return result;
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}
