'use client';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import type { AdminCommand, AdminEvent, AdminQuestion } from '@/lib/admin/contracts';
import { Moderation } from './Moderation';
import { QuestionForm } from './QuestionForm';
function QuestionCard({
  question,
  event,
  busy,
  run,
}: {
  question: AdminQuestion;
  event: AdminEvent;
  busy: boolean;
  run: (c: AdminCommand) => Promise<boolean>;
}) {
  const [editing, setEditing] = useState(false),
    [moderating, setModerating] = useState(false);
  const status = {
    draft: 'Черновик',
    open: 'Приём ответов',
    paused: 'На паузе',
    closed: 'Завершён',
  }[question.status];
  return (
    <article className="card question-card" aria-label={question.title}>
      <div className="admin-section-title">
        <span className="pill">
          {status}
          {question.active ? ' · выбран' : ''}
        </span>
        <span>{question.answerCount} ответов</span>
      </div>
      <h3>{question.title}</h3>
      <p>
        {event.audiences
          .filter((a) => question.audienceIds.includes(a.id))
          .map((a) => a.label)
          .join(', ')}{' '}
        · до {question.maxAnswers} ответов
      </p>
      {editing ? (
        <QuestionForm
          event={event}
          question={question}
          busy={busy}
          save={run}
          cancel={() => setEditing(false)}
        />
      ) : (
        <fieldset disabled={busy || event.archived} className="actions">
          <button
            className="button secondary"
            onClick={() => void run({ action: 'activate', questionId: question.id })}
          >
            Запустить вопрос
          </button>
          {question.active && question.status === 'open' && (
            <button
              className="button quiet"
              onClick={() =>
                void run({ action: 'status', questionId: question.id, status: 'paused' })
              }
            >
              Пауза
            </button>
          )}
          {question.active && ['paused', 'closed'].includes(question.status) && (
            <button
              className="button quiet"
              onClick={() =>
                void run({ action: 'status', questionId: question.id, status: 'open' })
              }
            >
              Продолжить
            </button>
          )}
          {question.status !== 'closed' && (
            <button
              className="text-button"
              onClick={() =>
                void run({ action: 'status', questionId: question.id, status: 'closed' })
              }
            >
              Завершить
            </button>
          )}
          <button className="text-button" onClick={() => setEditing(true)}>
            Изменить
          </button>
          <button
            className="text-button"
            aria-label={`Переместить выше: ${question.title}`}
            onClick={() => void run({ action: 'move', questionId: question.id, direction: 'up' })}
          >
            ↑
          </button>
          <button
            className="text-button"
            aria-label={`Переместить ниже: ${question.title}`}
            onClick={() => void run({ action: 'move', questionId: question.id, direction: 'down' })}
          >
            ↓
          </button>
          {question.answerCount === 0 && (
            <button
              className="text-button danger"
              onClick={() => {
                if (window.confirm('Удалить вопрос без ответов?'))
                  void run({ action: 'deleteQuestion', questionId: question.id });
              }}
            >
              Удалить вопрос
            </button>
          )}
        </fieldset>
      )}
      <button
        className="text-button"
        aria-expanded={moderating}
        onClick={() => setModerating((v) => !v)}
      >
        Модерация и экспорт
      </button>
      {moderating && (
        <Moderation eventId={event.id} questionId={question.id} archived={event.archived} />
      )}
    </article>
  );
}
function AudienceCard({
  audience,
  event,
  origin,
  busy,
  run,
}: {
  audience: AdminEvent['audiences'][number];
  event: AdminEvent;
  origin: string;
  busy: boolean;
  run: (c: AdminCommand) => Promise<boolean>;
}) {
  const [copied, setCopied] = useState('');
  const path = `/e/${encodeURIComponent(event.slug)}/${encodeURIComponent(audience.key)}`;
  async function copy() {
    try {
      await navigator.clipboard.writeText(`${origin}${path}`);
      setCopied('Ссылка скопирована.');
    } catch {
      setCopied('Не удалось скопировать. Выделите ссылку ниже.');
    }
  }
  return (
    <article className="card">
      <form
        className="admin-form"
        onSubmit={async (e) => {
          e.preventDefault();
          await run({
            action: 'editAudience',
            audienceId: audience.id,
            label: String(new FormData(e.currentTarget).get('label')),
          });
        }}
      >
        <fieldset disabled={busy || event.archived}>
          <label>
            Название группы
            <input name="label" required maxLength={240} defaultValue={audience.label} />
          </label>
          <button className="text-button">Сохранить название</button>
        </fieldset>
      </form>
      <p className="permalink">
        <Link href={path} target="_blank">
          {origin}
          {path}
        </Link>
      </p>
      <div className="actions">
        <button className="button secondary" onClick={() => void copy()}>
          Копировать ссылку
        </button>
        <a href={`/api/public/events/${event.slug}/${audience.key}/qr?download=1`} download>
          QR SVG
        </a>
        <a
          href={`/api/public/events/${event.slug}/${audience.key}/qr?format=png&download=1`}
          download
        >
          QR PNG
        </a>
        {!event.archived && !event.questions.some((q) => q.audienceIds.includes(audience.id)) && (
          <button
            className="text-button danger"
            disabled={busy}
            onClick={() => {
              if (window.confirm('Удалить группу без вопросов?'))
                void run({ action: 'deleteAudience', audienceId: audience.id });
            }}
          >
            Удалить группу
          </button>
        )}
      </div>
      {copied && (
        <p role="status" className="help">
          {copied}
        </p>
      )}
    </article>
  );
}
export function EventEditor({ initial, origin }: { initial: AdminEvent; origin: string }) {
  const router = useRouter();
  const [event, setEvent] = useState(initial),
    [busy, setBusy] = useState(false),
    [error, setError] = useState(''),
    [notice, setNotice] = useState('');
  async function refresh() {
    const r = await fetch(`/api/admin/events/${event.id}`, { cache: 'no-store' });
    const data = await r.json();
    if (!r.ok) {
      if (r.status === 401) {
        router.replace('/admin/login');
        router.refresh();
      }
      throw new Error(data.error || 'Не удалось обновить мероприятие.');
    }
    setEvent(data);
  }
  async function run(command: AdminCommand) {
    setBusy(true);
    setError('');
    setNotice('');
    try {
      const r = await fetch(`/api/admin/events/${event.id}/commands`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(command),
      });
      const data = await r.json();
      if (!r.ok) {
        if (r.status === 401) {
          router.replace('/admin/login');
          router.refresh();
        }
        throw new Error(data.error || 'Не удалось сохранить изменения.');
      }
      if (command.action === 'deleteEvent') {
        router.replace('/admin');
        router.refresh();
      } else if (command.action === 'duplicate') {
        router.push(`/admin/events/${data.id}`);
        router.refresh();
      } else await refresh();
      setNotice('Изменения сохранены.');
      return true;
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Нет связи. Повторите действие.');
      return false;
    } finally {
      setBusy(false);
    }
  }
  const publicEvent = event.publicAudienceKey
    ? { ...event, audiences: event.audiences.filter((a) => a.key === event.publicAudienceKey) }
    : event;
  const visibleQuestions = event.questions.filter((q) =>
    publicEvent.audiences.some((a) => q.audienceIds.includes(a.id)),
  );
  const archivedQuestions = event.questions.filter((q) => !visibleQuestions.includes(q));
  return (
    <>
      <Link className="back-link" href="/admin">
        ← Все мероприятия
      </Link>
      <section className="admin-title">
        <p className="eyebrow">{event.archived ? 'Архив мероприятия' : 'Управление опросом'}</p>
        <h1>{event.title}</h1>
        {event.rehearsal && (
          <p className="notice">
            Репетиция · все ответы помечаются как тестовые. Рабочее мероприятие не изменяется.
          </p>
        )}
        <div className="actions">
          <Link className="button" href={`/e/${event.slug}/screen`} target="_blank">
            Открыть экран проектора
          </Link>
          <button
            className="button quiet"
            disabled={busy}
            onClick={() => {
              setError('');
              void refresh().catch((e) => setError(e.message));
            }}
          >
            Обновить данные
          </button>
          <button
            className="text-button"
            disabled={busy}
            onClick={() => {
              if (
                event.archived ||
                window.confirm(
                  'Завершить вопросы и переместить мероприятие в архив? Ответы сохранятся.',
                )
              )
                void run({ action: 'archive', archived: !event.archived });
            }}
          >
            {event.archived ? 'Восстановить из архива' : 'Архивировать мероприятие'}
          </button>
          <button
            className="text-button"
            disabled={busy}
            onClick={() => {
              if (
                window.confirm(
                  `Очистить все ответы мероприятия «${event.title}»? Лимиты участников будут сброшены. Отменить это действие нельзя.`,
                )
              )
                void run({ action: 'clearAnswers', confirmTitle: event.title });
            }}
          >
            Очистить ответы
          </button>
          <button
            className="text-button"
            disabled={busy}
            onClick={() => {
              if (
                window.confirm(
                  `Удалить мероприятие «${event.title}» со всеми вопросами и ответами? Отменить это действие нельзя.`,
                )
              )
                void run({ action: 'deleteEvent', confirmTitle: event.title });
            }}
          >
            Удалить мероприятие
          </button>
        </div>
      </section>
      {error && (
        <p role="alert" className="notice error sticky-notice">
          {error}
        </p>
      )}
      {notice && (
        <p role="status" className="notice">
          {notice}
        </p>
      )}
      {event.archived && (
        <p className="notice">
          Мероприятие в архиве. Ответы сохранены. Чтобы снова проводить опрос, восстановите его и
          запустите нужный вопрос.
        </p>
      )}
      <details className="card">
        <summary>Название и копия мероприятия</summary>
        <form
          className="admin-form"
          onSubmit={async (e) => {
            e.preventDefault();
            await run({
              action: 'editEvent',
              title: String(new FormData(e.currentTarget).get('title')),
            });
          }}
        >
          <fieldset disabled={busy}>
            <label>
              Название мероприятия
              <input name="title" defaultValue={event.title} required maxLength={240} />
            </label>
            <button className="button quiet">Сохранить название</button>
          </fieldset>
        </form>
        <form
          className="admin-form"
          aria-label="Копия мероприятия"
          onSubmit={async (e) => {
            e.preventDefault();
            const form = new FormData(e.currentTarget);
            await run({
              action: 'duplicate',
              rehearsal: form.has('rehearsal'),
              title: String(form.get('title')),
              slug:
                String(form.get('slug') || '').trim() || `event-${crypto.randomUUID().slice(0, 8)}`,
            });
          }}
        >
          <fieldset disabled={busy}>
            <h3>Создать копию</h3>
            <p className="help">
              Скопируем группы и вопросы без ответов. Все вопросы будут черновиками.
            </p>
            <label>
              Название копии
              <input
                name="title"
                defaultValue={`${event.title} (копия)`}
                required
                maxLength={240}
              />
            </label>
            <label>
              Адрес копии (необязательно)
              <input name="slug" pattern="[a-z0-9][a-z0-9-]*" maxLength={64} />
            </label>
            <label className="check">
              <input type="checkbox" name="rehearsal" />
              Репетиционная копия с тестовыми ответами
            </label>
            <button className="button secondary">Создать копию мероприятия</button>
          </fieldset>
        </form>
      </details>
      <div className="admin-section-title">
        <h2>Вопросы</h2>
        <span>{event.questions.length}</span>
      </div>
      <div className="question-list">
        {visibleQuestions.map((q) => (
          <QuestionCard key={q.id} question={q} event={publicEvent} busy={busy} run={run} />
        ))}
      </div>
      {archivedQuestions.length > 0 && (
        <details className="card">
          <summary>Архивные вопросы других аудиторий ({archivedQuestions.length})</summary>
          {archivedQuestions.map((q) => (
            <QuestionCard key={q.id} question={q} event={event} busy={busy} run={run} />
          ))}
        </details>
      )}
      {!visibleQuestions.length && (
        <p className="notice">
          Добавьте первый вопрос. Он появится у участников, когда вы нажмёте «Запустить вопрос».
        </p>
      )}
      <section className="card">
        <h3>Новый вопрос</h3>
        <QuestionForm event={publicEvent} busy={busy} save={run} />
      </section>
      <div className="admin-section-title">
        <h2>Группы и приглашения</h2>
      </div>
      <div className="cards">
        {publicEvent.audiences.map((a) => (
          <AudienceCard
            key={`${a.id}-${a.label}`}
            audience={a}
            event={event}
            origin={origin}
            busy={busy}
            run={run}
          />
        ))}
      </div>
      <section className="card">
        <h3>Новая группа</h3>
        <form
          className="admin-form"
          aria-label="Новая группа"
          onSubmit={async (e) => {
            e.preventDefault();
            const formNode = e.currentTarget,
              form = new FormData(formNode);
            if (
              await run({
                action: 'addAudience',
                label: String(form.get('label')),
                key: String(form.get('key')),
              })
            )
              formNode.reset();
          }}
        >
          <fieldset disabled={busy || event.archived}>
            <div className="admin-columns">
              <label>
                Название группы
                <input name="label" required maxLength={240} placeholder="Например, работодатели" />
              </label>
              <label>
                Код группы для ссылки
                <input
                  name="key"
                  required
                  maxLength={64}
                  pattern="[a-z0-9][a-z0-9-]*"
                  placeholder="employers"
                />
              </label>
            </div>
            <button className="button secondary">Добавить группу</button>
          </fieldset>
        </form>
      </section>
    </>
  );
}
