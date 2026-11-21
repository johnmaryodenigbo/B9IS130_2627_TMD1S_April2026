import { useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { publicApi } from '../api/client.js';

// The visitor confirms with a button click (not on page load), so link scanners in mail
// systems can't confirm or unsubscribe anyone by just opening the link.
function TokenAction({ title, intro, buttonText, action, renderDone }) {
  const [params] = useSearchParams();
  const token = params.get('token');
  const [state, setState] = useState({ status: 'idle' });

  const run = async () => {
    setState({ status: 'working' });
    try {
      setState({ status: 'done', result: await action(token) });
    } catch (err) {
      setState({ status: 'error', message: err.message });
    }
  };

  return (
    <section className="card narrow">
      <h1>{title}</h1>
      {!token ? (
        <p className="error">This link is missing its token. Please use the link from the email.</p>
      ) : state.status === 'done' ? (
        renderDone(state.result)
      ) : (
        <>
          <p>{intro}</p>
          {state.status === 'error' && <p className="error">{state.message}</p>}
          <button className="btn" disabled={state.status === 'working'} onClick={run}>
            {state.status === 'working' ? 'Please wait…' : buttonText}
          </button>
        </>
      )}
      <p className="muted small section-gap"><Link to="/">Back to the status page</Link></p>
    </section>
  );
}

export function ConfirmSubscription() {
  return (
    <TokenAction
      title="Confirm status updates"
      intro="Click to start receiving outage emails."
      buttonText="Confirm subscription"
      action={publicApi.confirmSubscription}
      renderDone={(r) => (
        <p className="success">
          Subscribed! {r.email} will get emails about {r.all ? 'all services' : r.monitors.join(', ')}.
        </p>
      )}
    />
  );
}

export function Unsubscribe() {
  return (
    <TokenAction
      title="Unsubscribe"
      intro="Stop receiving ZOps status emails?"
      buttonText="Unsubscribe"
      action={publicApi.unsubscribe}
      renderDone={(r) => <p className="success">Done. {r.email} won't get any more status emails.</p>}
    />
  );
}
