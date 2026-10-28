export default function App() {
  return (
    <main className="page-shell">
      <section className="intro-panel" aria-labelledby="page-title">
        <p className="eyebrow">PROJECT FOUNDATION</p>
        <h1 id="page-title">CodeSync</h1>
        <p className="lead">
          A real-time collaborative code editor, built one verified milestone at a time.
        </p>
        <div className="status-row" role="status">
          <span className="status-dot" aria-hidden="true" />
          <span>Repository scaffold ready. Collaboration UI is not connected yet.</span>
        </div>
        <p className="supporting-copy">
          The next client milestone will connect authentication, a shared Yjs document,
          Hocuspocus, and Monaco. This page is only the React/Vite foundation.
        </p>
      </section>
    </main>
  );
}
