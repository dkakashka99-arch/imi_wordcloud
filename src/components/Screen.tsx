'use client';
import { useEffect, useState } from 'react';
import Image from 'next/image';
import type { ScreenState } from '@/lib/contracts';
import { WordCloud } from './WordCloud';
import { requestJson } from '@/lib/client-request';
export function Screen({ slug, origin }: { slug: string; origin: string }) {
  const [data, setData] = useState<ScreenState | null>(null),
    [selected, setSelected] = useState('student'),
    [compare, setCompare] = useState(false),
    [second, setSecond] = useState(''),
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
        {data && data.audiences.length > 1 && (
          <button className="button" aria-pressed={compare} onClick={() => setCompare((v) => !v)}>
            Сравнить группы
          </button>
        )}
      </header>
      {data?.rehearsal && <p className="notice">РЕПЕТИЦИЯ · тестовые ответы</p>}
      <p className="eyebrow" style={{ color: '#b7c9b3', marginTop: 40 }}>
        {data?.title || 'Подключение к мероприятию'}
      </p>
      <h1>{group?.question?.title || 'Готовимся к началу'}</h1>
      {compare && data && group ? (
        <>
          <label>
            Вторая группа{' '}
            <select
              value={
                data.audiences.some((a) => a.key === second && a.key !== group.key)
                  ? second
                  : data.audiences.find((a) => a.key !== group.key)?.key
              }
              onChange={(e) => setSecond(e.target.value)}
            >
              {data.audiences
                .filter((a) => a.key !== group.key)
                .map((a) => (
                  <option key={a.key} value={a.key}>
                    {a.label}
                  </option>
                ))}
            </select>
          </label>
          <div className="comparison-grid">
            {[
              group,
              data.audiences.find((a) => a.key === second && a.key !== group.key) ||
                data.audiences.find((a) => a.key !== group.key),
            ]
              .filter((a) => !!a)
              .map((a) => (
                <section key={a.key}>
                  <h2>{a.label}</h2>
                  <h3>{a.question?.title || 'Вопрос не выбран'}</h3>
                  <WordCloud words={a.words} />
                  <p>
                    {a.answerCount} ответов · ≈{a.participantCount} участников по ID браузера
                  </p>
                  <p className="screen-link">
                    {origin}/e/{slug}/{a.key}
                  </p>
                  <Image
                    unoptimized
                    src={`/api/public/events/${encodeURIComponent(slug)}/${encodeURIComponent(a.key)}/qr`}
                    width={120}
                    height={120}
                    alt={`QR-код для группы: ${a.label}`}
                  />
                </section>
              ))}
          </div>
          <p className="help">
            Сравниваются количества ответов, а не доли всех присутствующих. У групп могут быть
            разные вопросы и число участников.
          </p>
        </>
      ) : (
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
      )}
      {group?.summary && (
        <section className="ai-summary">
          <h2>Итоги · одобрено организатором</h2>
          <ul>
            {group.summary.points.map((point, index) => (
              <li key={index}>{point.text}</li>
            ))}
          </ul>
          <p className="help">
            Подготовлено GigaChat по снимку ответов. При новых ответах резюме скрывается до
            повторного анализа.
          </p>
        </section>
      )}
      {error && (
        <p className="notice" role="status">
          Связь прервалась. Показываем последние полученные данные.
        </p>
      )}
    </main>
  );
}
