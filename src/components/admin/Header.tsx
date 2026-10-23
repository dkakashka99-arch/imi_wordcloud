'use client';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
export function AdminHeader({ login }: { login: string }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false),
    [error, setError] = useState('');
  async function logout() {
    setBusy(true);
    try {
      const r = await fetch('/api/admin/logout', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: '{}',
      });
      if (!r.ok) throw new Error('Не удалось завершить сеанс. Попробуйте ещё раз.');
      router.replace('/admin/login');
      router.refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Нет связи.');
      setBusy(false);
    }
  }
  return (
    <>
      <header className="top admin-header">
        <Link className="brand" href="/admin">
          <b>мир</b> организатор
        </Link>
        <nav className="admin-nav">
          <span>{login}</span>
          <button className="text-button" disabled={busy} onClick={() => void logout()}>
            Выйти
          </button>
        </nav>
      </header>
      {error && (
        <p role="alert" className="notice error">
          {error}
        </p>
      )}
    </>
  );
}
