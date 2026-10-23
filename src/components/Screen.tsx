'use client';
import { useEffect, useState } from 'react';
import Image from 'next/image';
import type { ScreenState } from '@/lib/contracts';
import { WordCloud } from './WordCloud';
export function Screen({ slug, origin }: { slug: string; origin: string }) {
  const [data, setData] = useState<ScreenState | null>(null),
    [selected, setSelected] = useState('student'),
    [error, setError] = useState(false);
  useEffect(() => {
    let live = true;
    let timer: ReturnType<typeof setTimeout>;
    let failures = 0;
    async function refresh() {
      try {
        const r = await fetch(`/api/public/events/${encodeURIComponent(slug)}/screen`, {
          cache: 'no-store',
        });
        if (!r.ok) throw new Error('offline');
        const next: ScreenState = await r.json();
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
    };
  }, [slug]);
  const group = data?.audiences.find((a) => a.key === selected) || data?.audiences[0];
  return (
    <main className="screen">
      <header className="top">
        <span className="brand">мир · облако слов</span>
        <div className="flex gap-3 flex-wrap">
          {data?.audiences.map((a) => (
            <button
              key={a.key}
              className="button"
              aria-pressed={group?.key === a.key}
              onClick={() => setSelected(a.key)}
            >
              {a.label}
            </button>
          ))}
          <button
            className="button"
            onClick={() => {
              void document.documentElement.requestFullscreen?.().catch(() => setError(true));
            }}
          >
            Полный экран
          </button>
        </div>
      </header>
      <p className="eyebrow" style={{ color: '#b7c9b3', marginTop: 40 }}>
        {data?.title || 'Подключение к мероприятию'}
      </p>
      <h1>{group?.question?.title || 'Готовимся к началу'}</h1>
      <section className="screen-grid">
        <div>
          <WordCloud words={group?.words || []} />
          <p>
            {group?.answerCount || 0} ответов · ≈{group?.participantCount || 0} участников по ID
            браузера
          </p>
        </div>
        <aside>
          {group && (
            <div className="qr">
              <Image
                unoptimized
                src={`/api/public/events/${encodeURIComponent(slug)}/${encodeURIComponent(group.key)}/qr`}
                width={176}
                height={176}
                alt={`QR-код для группы: ${group.label}`}
                style={{ width: '100%', height: '100%' }}
              />
            </div>
          )}
          <p className="screen-link">
            {origin}/e/{slug}/{group?.key || ''}
          </p>
          <p>
            Отсканируйте код
            <br />и отправьте свой ответ
          </p>
          {group?.question?.status !== 'open' && (
            <p className="notice">Приём ответов ещё не открыт или приостановлен</p>
          )}
        </aside>
      </section>
      {error && (
        <p className="notice" role="status">
          Связь прервалась. Показываем последние полученные данные.
        </p>
      )}
    </main>
  );
}
