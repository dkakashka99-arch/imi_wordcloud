'use client';
import Link from 'next/link';
import { useEffect, useRef, useState } from 'react';
import type { ParticipantState } from '@/lib/contracts';
export function Participant({ slug, audience }: { slug: string; audience: string }) {
  const [data, setData] = useState<ParticipantState | null>(null),
    [text, setText] = useState(''),
    [error, setError] = useState(''),
    [notice, setNotice] = useState(''),
    [sending, setSending] = useState(false);
  const mutationVersion = useRef(0);
  const currentQuestion = useRef<string | null>(null);
  const pending = useRef<{ text: string; questionId: string; idempotencyKey: string } | null>(null);
  const endpoint = `/api/public/events/${encodeURIComponent(slug)}/${encodeURIComponent(audience)}`;
  useEffect(() => {
    let live = true;
    let timer: ReturnType<typeof setTimeout>;
    let failures = 0;
    async function refresh() {
      const version = mutationVersion.current;
      try {
        const response = await fetch(endpoint, { cache: 'no-store' });
        const result = await response.json();
        if (!response.ok) {
          if (live && response.status === 404) {
            setData(null);
            currentQuestion.current = null;
            setText('');
            setNotice('');
          }
          throw new Error(result.error || 'Не удалось загрузить вопрос.');
        }
        if (live && version === mutationVersion.current) {
          const nextQuestion = result.question?.id ?? null;
          if (currentQuestion.current !== nextQuestion) {
            currentQuestion.current = nextQuestion;
            setText('');
            setNotice('');
            pending.current = null;
          }
          setData(result);
          setError('');
        }
        failures = 0;
      } catch (e) {
        failures++;
        if (live) setError(e instanceof Error ? e.message : 'Нет связи.');
      } finally {
        if (live) timer = setTimeout(refresh, Math.min(30000, 8000 * 2 ** failures));
      }
    }
    void refresh();
    return () => {
      live = false;
      clearTimeout(timer);
    };
  }, [endpoint]);
  async function send(event: React.FormEvent) {
    event.preventDefault();
    if (!data?.question || sending) return;
    setSending(true);
    mutationVersion.current++;
    setError('');
    setNotice('');
    if (
      !pending.current ||
      pending.current.text !== text ||
      pending.current.questionId !== data.question.id
    )
      pending.current = { text, questionId: data.question.id, idempotencyKey: crypto.randomUUID() };
    try {
      const response = await fetch(`${endpoint}/submissions`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(pending.current),
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || 'Не удалось отправить ответ.');
      mutationVersion.current++;
      setData((previous) =>
        previous && previous.question?.id === data.question?.id
          ? { ...previous, remaining: result.remaining }
          : previous,
      );
      setNotice(result.duplicate ? 'Такой ответ уже учтён.' : 'Ответ принят. Спасибо!');
      setText('');
      pending.current = null;
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Нет связи. Попробуйте ещё раз.');
    } finally {
      setSending(false);
    }
  }
  const status = data?.question?.status;
  return (
    <main className="shell">
      <header className="top">
        <Link className="brand" href="/">
          <b>мир</b> облако слов
        </Link>
        {data && <span className="pill">{data.audience.label}</span>}
      </header>
      <section className="form-wrap">
        <p className="eyebrow">{data?.event.title || 'Подключаемся к мероприятию'}</p>
        <h1>{data?.question?.title || 'Ждём начала опроса'}</h1>
        {status === 'open' ? (
          <>
            <p className="lead">
              Одно слово или короткая фраза. Осталось ответов: {data?.remaining}.
            </p>
            <form onSubmit={send} className="form-row">
              <input
                aria-label="Ваш ответ"
                placeholder="Что для вас важно?"
                maxLength={data?.question?.maxLength}
                value={text}
                onChange={(e) => setText(e.target.value)}
                disabled={sending || !data?.remaining}
                required
              />
              <button className="button" disabled={sending || !text.trim() || !data?.remaining}>
                {sending ? 'Отправляем…' : 'Отправить →'}
              </button>
            </form>
          </>
        ) : (
          <p className="notice">
            {status === 'paused'
              ? 'Опрос на паузе. Организатор скоро продолжит.'
              : status === 'closed'
                ? 'Спасибо за участие! Приём ответов завершён.'
                : 'Организатор ещё не открыл вопрос.'}
          </p>
        )}
        {notice && (
          <p role="status" className="notice">
            {notice}
          </p>
        )}
        {error && (
          <p role="alert" className="notice error">
            {error}
          </p>
        )}
        <p className="footer">
          Без регистрации и ФИО. Чтобы соблюдать лимит ответов, используем случайный идентификатор в
          cookie этого браузера.
        </p>
      </section>
    </main>
  );
}
