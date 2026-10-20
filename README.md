# ZOps (MERN)

ZOps is an uptime monitoring system built on **MongoDB, Express, React and Node**. It will ping registered
applications, show real-time uptime on a public dashboard, and email on-call SREs when something goes down.

## Roles

| Role | Account? | Can do |
|---|---|---|
| **Anonymous** | No | View the public status dashboard (`/`) |
| **SRE** | Yes (created by an admin) | Log in, on-call area, receives downtime email alerts (later phase) |
| **Admin** | Yes | Everything an SRE can, plus manage users and (later) the inventory of monitored apps |

There is no public sign-up. The first admin is created with a seed script; after that, admins add users.

Open http://localhost:5173, click **Staff login**, and sign in with the admin from step 4.

## Authentication design

- Passwords hashed with **bcrypt** (cost 12); never returned by the API.
- On login the API issues a **JWT** stored in an **httpOnly cookie** (not readable by JavaScript, so safe from XSS
  token theft). `Secure` is set in production. A `Bearer` header is also accepted for scripts/tools.
- `requireAuth` verifies the token and re-loads the user, so disabling a user takes effect immediately.
- `requireRole('admin')` guards admin routes; the React `ProtectedRoute` mirrors this in the UI.
- Login is rate-limited (10 attempts / 15 min / IP) and returns the same error for unknown email or wrong password.
- Safety rules: you can't delete yourself, and the last active admin can't be demoted, disabled or deleted.


## Roadmap

1. ✅ Bootstrap + authentication / RBAC
2. Inventory: admins register applications (URL, method, interval, expected status)
3. Monitoring worker: scheduled pings, store check results, compute uptime %
4. Real-time public dashboard (Socket.IO)
5. Email alerts to on-call SREs on down/recovery (Nodemailer)
