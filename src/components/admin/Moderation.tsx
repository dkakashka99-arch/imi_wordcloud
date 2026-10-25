'use client';
import { useEffect, useState } from 'react';
import type { ModerationState, ModerationCommand } from '@/lib/admin/moderation';
import { AiPanel } from './AiPanel';
export function Moderation({
  eventId,
  questionId,
  archived,
}: {
  eventId: string;
  questionId: string;
  archived: boolean;
}) {
  const [data, setData] = useState<ModerationState | null>(null),
    [error, setError] = useState(''),
    [busy, setBusy] = useState(false),
    [page, setPage] = useState(0),
    [notice, setNotice] = useState('');
  const path = `/api/admin/events/${eventId}/questions/${questionId}`;
  async function load() {
    const r = await fetch(`${path}/moderation?page=${page}`, { cache: 'no-store' });
    const d = await r.json();
    if (!r.ok) throw new Error(d.error || 'Не удалось получить ответы.');
    setData(d);
  }
  useEffect(() => {
    let live = true;
    void fetch(`${path}/moderation?page=${page}`, { cache: 'no-store' })
      .then(async (r) => {
        const d = await r.json();
        if (!r.ok) throw new Error(d.error || 'Не удалось получить ответы.');
        if (live) {
          setData(d);
          setError('');
        }
      })
      .catch((e) => {
        if (live) setError(e.message);
      });
    return () => {
      live = false;
    };
  }, [path, page]);
  async function run(cmd: ModerationCommand) {
    setBusy(true);
    setError('');
    setNotice('');
    try {
      const r = await fetch(`${path}/moderation`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(cmd),
      });
      const d = await r.json();
      if (!r.ok) throw new Error(d.error || 'Не удалось сохранить.');
      await load();
      setNotice('Сохранено. Экран проектора обновится автоматически.');
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Нет связи.');
    } finally {
      setBusy(false);
    }
  }
  return (
    <section className="moderation-panel">
      <AiPanel eventId={eventId} questionId={questionId} archived={archived} />
      {error && (
        <p className="notice error" role="alert">
          {error}
        </p>
      )}
      {notice && (
        <p className="notice" role="status">
          {notice}
        </p>
      )}
      <div className="actions">
        <a href={`${path}/export?mode=raw`} download>
          CSV: все исходные ответы
        </a>
        <a href={`${path}/export?mode=aggregate`} download>
          CSV: частоты на экране
        </a>
        <button
          className="text-button"
          disabled={busy}
          onClick={() => {
            setError('');
            void load().catch((e) => setError(e.message));
          }}
        >
          Обновить ответы
        </button>
      </div>
      {data && (
        <>
          <form
            className="admin-form"
            key={JSON.stringify([data.premoderation, data.stopWords, data.aliases])}
            onSubmit={(e) => {
              e.preventDefault();
              const f = new FormData(e.currentTarget);
              const lines = String(f.get('aliases') || '')
                .split('\n')
                .filter((x) => x.trim());
              if (lines.some((x) => x.split('→').length !== 2)) {
                setError('Алиасы: одна строка «исходное → итоговое», без кавычек.');
                return;
              }
              void run({
                action: 'rules',
                premoderation: f.has('premoderation'),
                stopWords: String(f.get('stops') || '')
                  .split('\n')
                  .map((x) => x.trim())
                  .filter(Boolean),
                aliases: lines.map((x) => {
                  const [source, target] = x.split('→');
                  return { source: source.trim(), target: target.trim() };
                }),
              });
            }}
          >
            <fieldset disabled={busy || archived}>
              <label className="check">
                <input type="checkbox" name="premoderation" defaultChecked={data.premoderation} />
                Новые ответы показывать только после одобрения
              </label>
              <p className="help">
                Уже опубликованные ответы остаются видимыми. Скрыть их можно ниже.
              </p>
              <label>
                Стоп-лист: одно слово или фраза на строку
                <textarea name="stops" rows={4} defaultValue={data.stopWords.join('\n')} />
              </label>
              <label>
                Алиасы: исходное → итоговое
                <textarea
                  name="aliases"
                  rows={5}
                  placeholder={'зп → зарплата\nоплата → зарплата'}
                  defaultValue={data.aliases.map((a) => `${a.source} → ${a.target}`).join('\n')}
                />
              </label>
              <p className="help">
                Алиас меняет группировку, исходный ответ сохраняется. Цепочки и циклы не
                допускаются. Стоп-лист скрывает совпадающие ответы и запрещает новые.
              </p>
              <button className="button secondary">Сохранить правила</button>
            </fieldset>
          </form>
          <h4>Ответы: {data.total}</h4>
          <p className="help">
            «Одобрен» означает разрешение модератора. Стоп-лист имеет приоритет.
          </p>
          {!data.submissions.length && <p>На этой странице пока нет ответов.</p>}
          <ul className="moderation-list">
            {data.submissions.map((s) => (
              <li key={s.id}>
                <div>
                  <strong>{s.originalText}</strong>
                  <p className="help">
                    {s.audience} · {s.approved ? 'Одобрен' : 'Скрыт / ждёт одобрения'}
                    {s.isDemo ? ' · Репетиция' : ''}
                  </p>
                </div>
                <button
                  className="button quiet"
                  disabled={busy || archived}
                  onClick={() =>
                    void run({ action: 'visibility', submissionId: s.id, approved: !s.approved })
                  }
                >
                  {s.approved ? 'Скрыть' : 'Одобрить / вернуть'}
                </button>
              </li>
            ))}
          </ul>
          <div className="actions">
            <button
              className="text-button"
              disabled={busy || page === 0}
              onClick={() => setPage((p) => p - 1)}
            >
              Назад
            </button>
            <span>Страница {page + 1}</span>
            <button
              className="text-button"
              disabled={busy || (page + 1) * 100 >= data.total}
              onClick={() => setPage((p) => p + 1)}
            >
              Далее
            </button>
          </div>
        </>
      )}
      {!data && !error && <p role="status">Загрузка ответов…</p>}
    </section>
  );
}
