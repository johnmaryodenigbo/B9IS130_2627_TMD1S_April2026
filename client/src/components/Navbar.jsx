import { Link, NavLink, useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext.jsx';
import { ROLES } from '../api/client.js';

export default function Navbar() {
  const { user, logout } = useAuth();
  const navigate = useNavigate();

  const handleLogout = async () => {
    await logout();
    navigate('/');
  };

  return (
    <header className="navbar">
      <Link to="/" className="brand">● ZOps</Link>
      <nav>
        <NavLink to="/" end>Status</NavLink>
        {user && <NavLink to="/on-call">On-call</NavLink>}
        {user?.role === ROLES.ADMIN && <NavLink to="/admin/users">Users</NavLink>}
        {user && <NavLink to="/account">Account</NavLink>}
      </nav>
      <div className="nav-user">
        {user ? (
          <>
            <span className="muted">{user.name}</span>
            <span className={`badge badge-${user.role}`}>{user.role}</span>
            <button className="btn btn-ghost" onClick={handleLogout}>Log out</button>
          </>
        ) : (
          <Link to="/login" className="btn">Staff login</Link>
        )}
      </div>
    </header>
  );
}
