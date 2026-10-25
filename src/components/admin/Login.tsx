'use client';
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
export function Login() {
  const router = useRouter();
  const [busy, setBusy] = useState(false),
    [error, setError] = useState('');
  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    setError('');
    const form = new FormData(event.currentTarget);
    try {
      const r = await fetch('/api/admin/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ login: form.get('login'), password: form.get('password') }),
      });
      const data = await r.json();
      if (!r.ok) throw new Error(data.error || 'Не удалось войти.');
      router.replace('/admin');
      router.refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Нет связи. Попробуйте ещё раз.');
      setBusy(false);
    }
  }
  return (
    <main className="shell">
      <Link href="/" className="brand">
        <b>мир</b> облако слов
      </Link>
      <section className="form-wrap">
        <p className="eyebrow">Кабинет организатора</p>
        <h1>Проведём опрос.</h1>
        <p className="lead">Войдите, чтобы создавать мероприятия и управлять вопросами.</p>
        <form onSubmit={submit} className="admin-form">
          <fieldset disabled={busy}>
            <label>
              Логин
              <input name="login" autoComplete="username" required maxLength={64} />
            </label>
            <label>
              Пароль
              <input
                type="password"
                name="password"
                autoComplete="current-password"
                required
                maxLength={256}
              />
            </label>
            <button className="button">{busy ? 'Входим…' : 'Войти'}</button>
          </fieldset>
        </form>
        {error && (
          <p className="notice error" role="alert">
            {error}
          </p>
        )}
      </section>
    </main>
  );
}
