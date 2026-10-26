import Link from 'next/link';
export default function Home() {
  return (
    <main className="shell">
      <header className="top">
        <Link className="brand" href="/">
          <b>мир</b> облако слов
        </Link>
        <nav className="home-navigation" aria-label="Навигация">
          <Link className="button quiet" href="/e/mir-27-oct/screen">
            Экран мероприятия
          </Link>
          <Link className="button quiet" href="/admin">
            Организаторам
          </Link>
        </nav>
      </header>
      <section className="hero">
        <p className="eyebrow">Колледж МИР · 27 октября 2026</p>
        <h1>
          Разные ожидания.
          <br />
          Общее будущее.
        </h1>
        <p className="lead">
          Что важно студентам в будущей работе? Поделитесь своим мнением — и увидите, как
          складывается общая картина.
        </p>
      </section>
      <section className="cards">
        <article className="card">
          <p className="eyebrow">01 · Студентам</p>
          <h2>Какую работу вы ждёте?</h2>
          <p>Расскажите о том, что для вас важно в будущей работе.</p>
          <Link className="button" href="/e/mir-27-oct/student">
            Ответить на вопрос →
          </Link>
        </article>
      </section>
    </main>
  );
}
