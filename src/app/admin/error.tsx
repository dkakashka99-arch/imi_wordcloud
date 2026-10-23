'use client';
export default function AdminError({ reset }: { reset: () => void }) {
  return (
    <main className="shell">
      <section className="form-wrap">
        <h1>Не удалось открыть кабинет</h1>
        <p className="lead">
          Проверьте соединение и попробуйте ещё раз. Если ошибка повторится, обратитесь к
          администратору сервиса.
        </p>
        <button className="button" onClick={reset}>
          Повторить
        </button>
      </section>
    </main>
  );
}
