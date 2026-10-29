import { Link } from 'react-router-dom';

export function Forbidden() {
  return (
    <section className="card narrow center">
      <h1>403</h1>
      <p>You don't have permission to view this page.</p>
      <Link to="/">Back to status</Link>
    </section>
  );
}

export function NotFound() {
  return (
    <section className="card narrow center">
      <h1>404</h1>
      <p>Page not found.</p>
      <Link to="/">Back to status</Link>
    </section>
  );
}
