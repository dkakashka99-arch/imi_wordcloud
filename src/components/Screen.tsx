'use client';
import { useEffect, useState } from 'react';
import Image from 'next/image';
import Link from 'next/link';
import type { ScreenState } from '@/lib/contracts';
import { WordCloud } from './WordCloud';
import { requestJson } from '@/lib/client-request';
export function Screen({ slug, audience }: { slug: string; origin: string; audience?: string }) {
  const [selected, setSelected] = useState(audience || '');
  const [data, setData] = useState<ScreenState | null>(null),
    [error, setError] = useState(false);
  useEffect(() => {
    let live = true;
    let timer: ReturnType<typeof setTimeout>;
    let failures = 0;
    const controller = new AbortController();
    async function refresh() {
      try {
        const { response: r, data: next } = await requestJson<ScreenState>(
          `/api/public/events/${encodeURIComponent(slug)}/screen`,
          { cache: 'no-store', signal: controller.signal },
        );
        if (!r.ok) throw new Error('offline');
        if (live) {
          setData((previous) =>
            previous?.revision === next.revision && previous.title === next.title ? previous : next,
          );
          setError(false);
        }
        failures = 0;
      } catch {
        failures++;
        if (live) setError(true);
      } finally {
        if (live) timer = setTimeout(refresh, Math.min(30000, 2000 * 2 ** failures));
      }
    }
    void refresh();
    return () => {
      live = false;
      clearTimeout(timer);
      controller.abort();
    };
  }, [slug]);
  const group =
    data?.audiences.find((a) => a.key === selected) ||
    (data?.audiences.length === 1 ? data.audiences[0] : undefined);
  const choose = (key: string) => {
    setSelected(key);
    const url = new URL(window.location.href);
    if (key) url.searchParams.set('audience', key);
    else url.searchParams.delete('audience');
    window.history.replaceState(null, '', url);
  };
  if (data && !group)
    return (
      <main className="shell">
        <Link href="/">← На главную</Link>
        <h1>Выберите экран опроса</h1>
        <p>{data.title}</p>
        <p>Выберите аудиторию: на экране появятся её текущий вопрос, облако и QR-код.</p>
        <section className="cards">
          {data.audiences.map((a) => (
            <article className="card" key={a.key}>
              <h2>{a.label}</h2>
              <p>{a.question?.title || 'Вопрос пока не выбран'}</p>
              <button className="button" onClick={() => choose(a.key)}>
                Открыть экран
              </button>
            </article>
          ))}
        </section>
      </main>
    );
  const status = group?.question?.status;
  return (
    <main className="screen">
      <nav className="home-navigation" aria-label="Навигация экрана">
        <Link href="/">← На главную</Link>
        {data && data.audiences.length > 1 && (
          <button className="button quiet" onClick={() => choose('')}>
            Сменить аудиторию · {group?.label}
          </button>
        )}
      </nav>
      <header className="top">
        <span className="brand">
          мир <span className="brand-divider">/</span> диалог о будущем
        </span>
        <div className="screen-tools">
          <span className={`live-status ${status === 'open' ? 'is-open' : ''}`}>
            <i />
            {status === 'open'
              ? 'идёт опрос'
              : status === 'closed'
                ? 'опрос завершён'
                : 'ожидаем продолжения'}
          </span>
          <button
            className="fullscreen-control"
            aria-label="Полный экран"
            onClick={() => {
              void document.documentElement.requestFullscreen?.().catch(() => {});
            }}
          >
            ⛶
          </button>
        </div>
      </header>
      <div className="screen-question">
        <p className="eyebrow">
          {data?.title || 'Подключение к мероприятию'}
          {data?.rehearsal ? ' · репетиция' : ''}
        </p>
        <h1>{group?.question?.title || 'Готовимся к началу'}</h1>
      </div>
      <section className="screen-grid">
        <WordCloud key={group?.question?.id} words={group?.words || []} />
        <aside className="join-panel">
          <div className="qr">
            <Image
              unoptimized
              src={`/api/public/events/${encodeURIComponent(slug)}/${encodeURIComponent(group?.key || 'student')}/qr`}
              width={240}
              height={240}
              alt={`QR-код для группы: ${group?.label || 'Студенты'}`}
            />
          </div>
          <h2>
            Сканируйте
            <br />и отвечайте
          </h2>

          <div className="answer-stat">
            <strong>{group?.answerCount || 0}</strong>
            <span>ответов получено</span>
          </div>
        </aside>
      </section>
      {group?.summary && (
        <section className="ai-summary">
          <h2>Итоги · одобрено организатором</h2>
          <ul>
            {group.summary.points.map((point, index) => (
              <li key={index}>{point.text}</li>
            ))}
          </ul>
        </section>
      )}
      {error && (
        <p className="screen-footer" role="status">
          Восстанавливаем связь · последние данные сохранены
        </p>
      )}
    </main>
  );
}
