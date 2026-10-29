import { useAuth } from '../context/AuthContext.jsx';

// Placeholder for the SRE area (alerts, incidents) built in later phases.
export default function OnCall() {
  const { user } = useAuth();
  return (
    <section>
      <h1>Welcome, {user.name}</h1>
      <div className="card">
        <h2>On-call</h2>
        <p className="muted">
          Downtime alerts will be emailed to <strong>{user.email}</strong> once monitoring and alerting are added.
        </p>
      </div>
    </section>
  );
}
