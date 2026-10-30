import { Route, Routes } from 'react-router-dom';
import Navbar from './components/Navbar.jsx';
import LiveAlerts from './components/LiveAlerts.jsx';
import ProtectedRoute from './components/ProtectedRoute.jsx';
import Dashboard from './pages/Dashboard.jsx';
import Login from './pages/Login.jsx';
import OnCall from './pages/OnCall.jsx';
import Account from './pages/Account.jsx';
import AdminUsers from './pages/AdminUsers.jsx';
import Monitors from './pages/Monitors.jsx';
import { Forbidden, NotFound } from './pages/Errors.jsx';
import { ROLES } from './api/client.js';

export default function App() {
  return (
    <>
      <Navbar />
      <LiveAlerts />
      <main className="container">
        <Routes>
          {/* Public (anonymous) */}
          <Route path="/" element={<Dashboard />} />
          <Route path="/login" element={<Login />} />
          <Route path="/forbidden" element={<Forbidden />} />

          {/* Any logged-in staff (admin or SRE) */}
          <Route element={<ProtectedRoute roles={[ROLES.ADMIN, ROLES.SRE]} />}>
            <Route path="/on-call" element={<OnCall />} />
            <Route path="/account" element={<Account />} />
            <Route path="/monitors" element={<Monitors />} />
          </Route>

          {/* Admin only */}
          <Route element={<ProtectedRoute roles={[ROLES.ADMIN]} />}>
            <Route path="/admin/users" element={<AdminUsers />} />
          </Route>

          <Route path="*" element={<NotFound />} />
        </Routes>
      </main>
    </>
  );
}
