'use client';
import { useEffect, useState } from 'react';
import type { AiCommand, AiJob, AiState, TaskKind } from '@/lib/ai/contracts';
const labels: Record<TaskKind, string> = {
  aliases: 'Найти похожие ответы',
  moderation: 'Помочь с модерацией',
  summary: 'Подвести итоги',
};
function Job({
  job,
  revision,
  busy,
  run,
}: {
  job: AiJob;
  revision: number;
  busy: boolean;
  run: (c: AiCommand) => Promise<void>;
}) {
  const stale = job.reviewRevision !== revision;
  const suggestions = job.result && 'suggestions' in job.result ? job.result.suggestions : [];
  return (
    <article className="card ai-job">
      <h4>{labels[job.kind]}</h4>
      <p className="help">
        {job.model} · {job.snapshot.words.length} слов ·{' '}
        {new Date(job.createdAt).toLocaleString('ru-RU', { timeZone: 'Europe/Samara' })} (Самара)
        {job.usage?.total_tokens !== undefined ? ` · ${job.usage.total_tokens} токенов` : ''}
      </p>
      {job.status === 'running' && (
        <p role="status">Анализ выполняется. Обновите список через несколько секунд.</p>
      )}
      {job.status === 'failed' && (
        <p className="notice">
          ИИ временно недоступен. Анализ не завершён ({job.error || 'unavailable'}). Опрос работает.
        </p>
      )}
      {job.status === 'discarded' && <p>Результат отклонён.</p>}
      {job.status === 'completed' && (
        <>
          {stale && (
            <p className="notice">
              После анализа данные изменились. Для применения нужен новый анализ.
            </p>
          )}
          {!suggestions.length && job.kind !== 'summary' && <p>Предложений нет.</p>}
          {suggestions.map((s, index) => (
            <div key={index} className="ai-suggestion">
              <p>{'source' in s ? `${s.source.join(', ')} → ${s.suggestedCanonical}` : s.word}</p>
              <p>{s.reason}</p>
              {'confidence' in s && (
                <p className="help">
                  Оценка модели: {Math.round(s.confidence * 100)}%. Это не объективная вероятность.
                </p>
              )}
              <div className="actions">
                {job.decisions[String(index)] ? (
                  <span>
                    {job.decisions[String(index)] === 'accepted' ? 'Принято' : 'Отклонено'}
                  </span>
                ) : (
                  <>
                    <button
                      className="button quiet"
                      disabled={busy || stale}
                      onClick={() =>
                        void run({ action: 'decision', jobId: job.id, index, accept: true })
                      }
                    >
                      {job.kind === 'aliases' ? 'Применить алиас' : 'Скрыть эти ответы'}
                    </button>
                    <button
                      className="text-button"
                      disabled={busy || stale}
                      onClick={() =>
                        void run({ action: 'decision', jobId: job.id, index, accept: false })
                      }
                    >
                      Отклонить
                    </button>
                  </>
                )}
              </div>
            </div>
          ))}
          {job.result && 'points' in job.result && (
            <>
              <ol>
                {job.result.points.map((p, i) => (
                  <li key={i}>
                    <p>{p.text}</p>
                    <p className="help">
                      Основание:{' '}
                      {p.evidence
                        .map(
                          (e) =>
                            `${job.snapshot.groups.find((g) => g.group === e.group)?.label || e.group}: ${e.word} — ${e.count}`,
                        )
                        .join('; ')}
                    </p>
                  </li>
                ))}
              </ol>
              <button
                className="button secondary"
                disabled={busy || stale}
                onClick={() => void run({ action: 'publish', jobId: job.id })}
              >
                Одобрить и показать резюме на проекторе
              </button>
            </>
          )}
          <button
            className="text-button"
            disabled={busy}
            onClick={() => void run({ action: 'discard', jobId: job.id })}
          >
            Отклонить весь результат
          </button>
        </>
      )}
    </article>
  );
}
export function AiPanel({
  eventId,
  questionId,
  archived,
}: {
  eventId: string;
  questionId: string;
  archived: boolean;
}) {
  const [kind, setKind] = useState<TaskKind>('aliases'),
    [data, setData] = useState<AiState | null>(null),
    [error, setError] = useState(''),
    [busy, setBusy] = useState(false),
    [words, setWords] = useState<string[]>([]),
    [consent, setConsent] = useState(false);
  const path = `/api/admin/events/${eventId}/questions/${questionId}/ai`;
  async function load() {
    const r = await fetch(`${path}?kind=${kind}`, { cache: 'no-store' });
    const d = await r.json();
    if (!r.ok) throw new Error(d.error || 'Не удалось получить AI-задания.');
    setData(d);
    setWords(d.snapshot.words.map((w: { text: string }) => w.text));
    setConsent(false);
  }
  useEffect(() => {
    let live = true;
    void fetch(`${path}?kind=${kind}`, { cache: 'no-store' })
      .then(async (r) => {
        const d = await r.json();
        if (!r.ok) throw new Error(d.error || 'Не удалось получить AI-задания.');
        if (live) {
          setData(d);
          setWords(d.snapshot.words.map((w: { text: string }) => w.text));
          setConsent(false);
          setError('');
        }
      })
      .catch((e) => {
        if (live) setError(e.message);
      });
    return () => {
      live = false;
    };
  }, [path, kind]);
  async function run(cmd: AiCommand) {
    setBusy(true);
    setError('');
    try {
      const r = await fetch(path, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(cmd),
      });
      const d = await r.json();
      if (!r.ok) throw new Error(d.error || 'Не удалось выполнить AI-действие.');
      await load();
    } catch (e) {
      setError(
        e instanceof Error ? e.message : 'Нет связи. Обновите список: задание могло сохраниться.',
      );
    } finally {
      setBusy(false);
    }
  }
  return (
    <section className="moderation-panel" aria-label="GigaChat помощник">
      <h4>GigaChat · помощник организатора</h4>
      {error && (
        <p role="alert" className="notice error">
          {error}
        </p>
      )}
      {data ? (
        <>
          <p className="help">{data.explanation}</p>
          <p>Расход по вопросу: {data.totalTokens} токенов по сохранённым ответам API.</p>
          <fieldset disabled={busy || archived}>
            <label>
              Вид AI-анализа{' '}
              <select
                value={kind}
                onChange={(e) => {
                  setKind(e.target.value as TaskKind);
                  setData(null);
                }}
              >
                {Object.entries(labels).map(([key, label]) => (
                  <option key={key} value={key}>
                    {label}
                  </option>
                ))}
              </select>
            </label>
            <details>
              <summary>Проверить слова перед отправкой ({words.length})</summary>
              <p className="help">
                Снимите отметки с имён и других персональных сведений. Передаются только выбранные
                слова, частоты и номера групп. Названия групп и идентификаторы участников не
                передаются. Автоматически исключено или за пределами пакета: {data.snapshot.omitted}
                .
              </p>
              <div className="ai-words">
                {data.snapshot.words.map((w) => (
                  <label className="check" key={w.text}>
                    <input
                      type="checkbox"
                      checked={words.includes(w.text)}
                      onChange={(e) =>
                        setWords((prev) =>
                          e.target.checked ? [...prev, w.text] : prev.filter((v) => v !== w.text),
                        )
                      }
                    />
                    {w.text} ({w.count})
                  </label>
                ))}
              </div>
            </details>
            <label className="check">
              <input
                type="checkbox"
                checked={consent}
                onChange={(e) => setConsent(e.target.checked)}
              />
              Я проверил список, убрал персональные сведения и разрешаю отправить выбранные слова в
              GigaChat
            </label>
            <button
              className="button secondary"
              disabled={!data.available || !words.length || !consent}
              onClick={() => void run({ action: 'start', kind, words, consent: true })}
            >
              {busy ? 'Анализ…' : labels[kind]}
            </button>
          </fieldset>
          <div className="actions">
            <button
              className="text-button"
              disabled={busy}
              onClick={() => {
                setError('');
                void load().catch((e) => setError(e.message));
              }}
            >
              Обновить AI-задания
            </button>
            {data.published && (
              <button
                className="text-button"
                disabled={busy || archived}
                onClick={() => void run({ action: 'unpublish' })}
              >
                Убрать AI-резюме с проектора
              </button>
            )}
          </div>
          {data.jobs.map((job) => (
            <Job
              key={job.id}
              job={job}
              revision={data.snapshot.revision}
              busy={busy || archived}
              run={run}
            />
          ))}
        </>
      ) : (
        !error && <p role="status">Загрузка AI-помощника…</p>
      )}
    </section>
  );
}
