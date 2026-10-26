'use client';
import { useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import type { EventListItem } from '@/lib/admin/contracts';
export function Dashboard({ events }: { events: EventListItem[] }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false),
    [error, setError] = useState(''),
    [archive, setArchive] = useState(false);
  async function create(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    setError('');
    const form = new FormData(event.currentTarget);
    try {
      const r = await fetch('/api/admin/events', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          title: form.get('title'),
          slug: String(form.get('slug') || '').trim() || `event-${crypto.randomUUID().slice(0, 8)}`,
        }),
      });
      const data = await r.json();
      if (!r.ok) throw new Error(data.error);
      router.push(`/admin/events/${data.id}`);
      router.refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Не удалось создать мероприятие.');
      setBusy(false);
    }
  }
  return (
    <>
      <section className="admin-title">
        <p className="eyebrow">Ваши опросы</p>
        <h1>Мероприятия</h1>
        <p className="lead">Создайте опрос, выберите вопрос и пригласите участников по QR-коду.</p>
      </section>
      <section className="card">
        <h2>Новое мероприятие</h2>
        <form className="admin-form" onSubmit={create}>
          <fieldset disabled={busy}>
            <div className="admin-columns">
              <label>
                Название мероприятия
                <input
                  name="title"
                  required
                  maxLength={240}
                  placeholder="Например, встреча студентов и работодателей"
                />
              </label>
              <label>
                Адрес мероприятия (необязательно)
                <input
                  name="slug"
                  maxLength={64}
                  pattern="[a-z0-9][a-z0-9-]*"
                  placeholder="vstrecha-27"
                />
              </label>
            </div>
            <p className="help">
              Адрес состоит из латинских букв, цифр и дефисов. После создания он останется
              постоянным.
            </p>
            <button className="button">{busy ? 'Создаём…' : 'Создать мероприятие'}</button>
          </fieldset>
        </form>
        {error && (
          <p role="alert" className="notice error">
            {error}
          </p>
        )}
      </section>
      <div className="admin-section-title">
        <h2>Сохранённые мероприятия</h2>
        <label className="check">
          <input type="checkbox" checked={archive} onChange={(e) => setArchive(e.target.checked)} />
          Показать архив
        </label>
      </div>
      <div className="cards">
        {events
          .filter((e) => archive || !e.archived)
          .map((e) => (
            <article className="card" key={e.id}>
              <p className="eyebrow">
                {e.archived
                  ? 'В архиве'
                  : new Date(e.createdAt).toLocaleDateString('ru-RU', {
                      timeZone: 'Europe/Samara',
                    })}
              </p>
              <h2>
                <Link href={`/admin/events/${e.id}`}>{e.title}</Link>
              </h2>
              <p>
                {e.questionCount} вопросов · {e.answerCount} ответов
              </p>
              <Link className="button secondary" href={`/admin/events/${e.id}`}>
                Открыть мероприятие →
              </Link>
            </article>
          ))}
      </div>
      {!events.some((e) => archive || !e.archived) && (
        <p className="notice">Пока нет мероприятий. Создайте первое с помощью формы выше.</p>
      )}
    </>
  );
}
