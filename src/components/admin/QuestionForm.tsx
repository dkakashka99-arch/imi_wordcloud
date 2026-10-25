'use client';
import type { AdminCommand, AdminEvent, AdminQuestion } from '@/lib/admin/contracts';
export function QuestionForm({
  event,
  question,
  busy,
  save,
  cancel,
}: {
  event: AdminEvent;
  question?: AdminQuestion;
  busy: boolean;
  save: (command: AdminCommand) => Promise<boolean>;
  cancel?: () => void;
}) {
  async function submit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const node = e.currentTarget,
      form = new FormData(node);
    const fields = {
      title: String(form.get('title')),
      audienceIds: form.getAll('audienceIds').map(String),
      maxAnswers: Number(form.get('maxAnswers')),
      maxLength: Number(form.get('maxLength')),
    };
    const ok = await save(
      question
        ? { action: 'editQuestion', questionId: question.id, ...fields }
        : { action: 'addQuestion', ...fields },
    );
    if (ok) {
      if (cancel) cancel();
      else node.reset();
    }
  }
  return (
    <form
      className="admin-form"
      aria-label={question ? 'Редактирование вопроса' : 'Новый вопрос'}
      onSubmit={submit}
    >
      <fieldset disabled={busy || event.archived}>
        <label>
          Текст вопроса
          <input
            name="title"
            required
            maxLength={240}
            defaultValue={question?.title}
            placeholder="Что вы хотите узнать у участников?"
          />
        </label>
        <fieldset className="audience-choice">
          <legend>Кому задаём вопрос</legend>
          {event.audiences.map((a, i) => (
            <label className="check" key={a.id}>
              <input
                type="checkbox"
                name="audienceIds"
                value={a.id}
                defaultChecked={question ? question.audienceIds.includes(a.id) : i === 0}
              />
              {a.label}
            </label>
          ))}
        </fieldset>
        <div className="admin-columns">
          <label>
            Лимит ответов на участника
            <input
              name="maxAnswers"
              type="number"
              min={1}
              max={10}
              defaultValue={question?.maxAnswers || 3}
              required
            />
          </label>
          <label>
            Длина ответа, символов
            <input
              name="maxLength"
              type="number"
              min={1}
              max={120}
              defaultValue={question?.maxLength || 60}
              required
            />
          </label>
        </div>
        <div className="actions">
          <button className="button">{question ? 'Сохранить вопрос' : 'Добавить вопрос'}</button>
          {cancel && (
            <button className="text-button" type="button" onClick={cancel}>
              Отменить
            </button>
          )}
        </div>
      </fieldset>
    </form>
  );
}
