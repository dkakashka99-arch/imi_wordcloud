'use client';
import Link from 'next/link';
import { useEffect, useState } from 'react';
import type { ScreenState } from '@/lib/contracts';
import { requestJson } from '@/lib/client-request';
const statusLabel = (status?: string) =>
  status === 'open'
    ? 'Приём ответов открыт'
    : status === 'paused'
      ? 'На паузе'
      : status === 'closed'
        ? 'Опрос завершён'
        : 'Опрос ещё не начался';
export function EventHome() {
  const [data, setData] = useState<ScreenState | null>(null);
  const [error, setError] = useState(false);
  useEffect(() => {
    let live = true;
    let timer: ReturnType<typeof setTimeout>;
    const controller = new AbortController();
    async function refresh() {
      try {
        const result = await requestJson<ScreenState>('/api/public/events/mir-27-oct/screen', {
          cache: 'no-store',
          signal: controller.signal,
        });
        if (!result.response.ok) throw new Error('Unavailable');
        if (live) {
          setData(result.data);
          setError(false);
        }
      } catch {
        if (live) setError(true);
      } finally {
        if (live) timer = setTimeout(refresh, 3000);
      }
    }
    void refresh();
    return () => {
      live = false;
      controller.abort();
      clearTimeout(timer);
    };
  }, []);
  return (
    <main className="shell">
      <header className="top">
        <Link className="brand" href="/">
          <b>мир</b> облако слов
        </Link>
        <nav className="home-navigation" aria-label="Навигация">
          <Link className="button quiet" href="/e/mir-27-oct/screen">
            Выбрать экран опроса
          </Link>
          <Link className="button quiet" href="/admin">
            Организаторам
          </Link>
        </nav>
      </header>
      <section className="hero">
        <p className="eyebrow">Колледж МИР · 27 октября 2026</p>
        <h1>{data?.title || 'Встреча студентов и работодателей'}</h1>
        <p className="lead">
          Выберите свою аудиторию. В каждой карточке — текущий вопрос и статус приёма ответов.
        </p>
      </section>
      {error && (
        <p role="status">
          Не удалось обновить опросы.{' '}
          {data
            ? 'Показаны последние полученные данные.'
            : 'Проверьте соединение и повторите попытку.'}
        </p>
      )}
      {!data && !error && <p role="status">Загружаем актуальные опросы…</p>}
      <section className="cards" aria-label="Опросы по аудиториям">
        {data?.audiences.map((group) => (
          <article className="card" key={group.key}>
            <p className="eyebrow">{group.label}</p>
            <p>{statusLabel(group.question?.status)}</p>
            <h2>{group.question?.title || 'Вопрос пока не выбран'}</h2>
            <div className="home-navigation">
              <Link className="button" href={`/e/mir-27-oct/${encodeURIComponent(group.key)}`}>
                {group.question?.status === 'open' ? 'Ответить на вопрос' : 'Открыть опрос'}
              </Link>
              <Link
                className="button quiet"
                href={`/e/mir-27-oct/screen?audience=${encodeURIComponent(group.key)}`}
              >
                Посмотреть облако
              </Link>
            </div>
          </article>
        ))}
      </section>
      {data && !data.audiences.length && <p>Публичные опросы пока не добавлены.</p>}
    </main>
  );
}
