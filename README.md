# CopyCat Trading Dashboard

Full-stack Telegram copy-trading dashboard for managing Telegram source channels, destination channels, copy rules, CMS posts, and channel activity logs.

The dashboard is designed around a practical Telegram constraint: a Telegram user account reads source channels/groups, while a Telegram bot posts generated messages to destination channels.

## Architecture

```text
Telegram user session -> reads source channels
Telegram bot token    -> posts to destination channels
Dashboard             -> manages bots, channels, rules, logs, and CMS posts
```

The Telegram user session is required for source channels/groups where bots cannot join. The bot token is used only for posting messages to destination channels.

## Tech Stack

- Backend: FastAPI, SQLAlchemy, Telethon
- Frontend: React, Vite, Tailwind CSS
- Database: PostgreSQL with SQLite fallback for local development
- Production: Docker Compose, Caddy, Nginx, PostgreSQL

## Features

- Dashboard login authentication
- Responsive dashboard UI with collapsible desktop sidebar
- Manage Telegram posting bots
- Login Telegram user session from the dashboard
- Manage source channels and destination channels
- Link bots to channels
- Channel-level activity logs
- Telegram message delay diagnostics in activity logs
- CMS-authored posts to destination channels
- Dynamic copy rules:
  - Contains
  - Regex
  - Regex Multiline
- Output templates with variables, for example:
  - `{{price}}`
  - `{{direction}}`
  - `{{tp_number}}`
  - `{{pips}}`
  - `{{entry_range}}`
  - `{{targets}}`
  - `{{sl}}`
  - `{{original_message}}`
- Rule preview/test in the channel form

## Local Development

### Backend

Create `backend/.env`:

```env
DATABASE_URL=postgresql://copycat:copycat@localhost:5432/copycat_trading
COPY_TRADER_AUTO_REGISTER=false
COPY_TRADER_FORWARD_ALL=true
DASHBOARD_ADMIN_USERNAME=youradmin
DASHBOARD_ADMIN_PASSWORD=very_strong_password_here
DASHBOARD_AUTH_SECRET=long_random_secret_here
DASHBOARD_TOKEN_EXPIRE_SECONDS=43200
CORS_ORIGINS=http://127.0.0.1:5173,http://localhost:5173
```

Install dependencies:

```bash
.\.venv\Scripts\python.exe -m pip install -r backend\requirements.txt
```

Run backend:

```bash
.\.venv\Scripts\python.exe -m uvicorn backend.main:app --reload
```

Backend runs on:

```text
http://127.0.0.1:8000
```

### Frontend

```bash
cd frontend
npm install
npm run dev
```

Frontend runs on:

```text
http://127.0.0.1:5173
```

Open the frontend and log in with:

```text
Username: value of DASHBOARD_ADMIN_USERNAME
Password: value of DASHBOARD_ADMIN_PASSWORD
```

## Docker Development

```bash
docker compose up --build
```

This starts PostgreSQL and the backend. The local compose file is intended for development and uses backend reload.

## Telegram Setup

1. Create or add a Telegram bot through BotFather.
2. Add the bot as admin/member in the destination channel.
3. Login your Telegram user account through the dashboard:

```text
Telegram -> enter API ID, API hash, phone, code, and 2FA password if needed
```

4. Make sure the Telegram user account is joined to the source channel.
5. Add bot in dashboard.
6. Add channel in dashboard.
7. Link bot to channel.

## Copy Rule Examples

### Simple Contains Rule

Filtered Message:

```text
READY FOR THE SIGNAL
```

Output Message:

```text
AYE AYE NEW SIGNAL INCOMING
```

### Dynamic Gold Price Rule

Match Type:

```text
Regex
```

Filtered Message:

```text
GOLD BUY NOW (?P<price>[0-9]+)
```

Output Message:

```text
BUY GOLD NOW! {{price}}
```

### TP Profit Rule

Match Type:

```text
Regex
```

Filtered Message:

```text
TP(?P<tp_number>[0-9]+) HIT (?P<pips>[0-9]+)\+ PIPS PROFIT DONE
```

Output Message:

```text
DONE TP{{tp_number}} +{{pips}} PIPS
```

### Multiline XAUUSD Rule

Match Type:

```text
Regex Multiline
```

Filtered Message:

```text
XAUUSD (?P<direction>BUY|SELL): (?P<entry_range>.+?)\n\n(?P<targets>TP1:[\s\S]+?)\n\nSL: (?P<sl>[0-9]+)
```

Output Message:

```text
Do your own research!

XAUUSD {{direction}}: {{entry_range}}

{{targets}}

SL: {{sl}}
```

## Production Deployment

Production files:

```text
docker-compose.prod.yml
Caddyfile
frontend/Dockerfile
frontend/nginx.conf
backend/.env.prod.example
```

Create root `.env` on the VPS:

```env
APP_DOMAIN=yourdomain.com
ACME_EMAIL=you@example.com
POSTGRES_PASSWORD=CHANGE_ME_STRONG_PASSWORD
```

For IP-only HTTP testing, use:

```env
APP_DOMAIN=:80
ACME_EMAIL=you@example.com
POSTGRES_PASSWORD=CHANGE_ME_STRONG_PASSWORD
```

Create backend production env:

```bash
cp backend/.env.prod.example backend/.env.prod
```

Edit `backend/.env.prod`:

```env
DATABASE_URL=postgresql://copycat:CHANGE_ME_STRONG_PASSWORD@postgres:5432/copycat_trading
COPY_TRADER_AUTO_REGISTER=false
COPY_TRADER_FORWARD_ALL=true
DASHBOARD_ADMIN_USERNAME=youradmin
DASHBOARD_ADMIN_PASSWORD=very_strong_password_here
DASHBOARD_AUTH_SECRET=long_random_secret_here
DASHBOARD_TOKEN_EXPIRE_SECONDS=43200
CORS_ORIGINS=https://yourdomain.com
```

For IP-only HTTP testing on the current VPS IP, set:

```env
CORS_ORIGINS=http://76.13.221.63
```

Start production:

```bash
docker compose -f docker-compose.prod.yml up -d --build
```

Check logs:

```bash
docker compose -f docker-compose.prod.yml logs -f backend
docker compose -f docker-compose.prod.yml logs -f caddy
```

Only expose these VPS ports publicly:

```text
22
80
443
```

Do not expose:

```text
5432
8000
5173
```

## Important Security Notes

- Rotate any Telegram bot token that was committed, pasted, or exposed during development.
- Do not commit `backend/.env`, `backend/.env.prod`, session files, SQLite DB files, or logs.
- Dashboard authentication is implemented, but production must use strong `DASHBOARD_ADMIN_PASSWORD` and `DASHBOARD_AUTH_SECRET` values.
- Use a real domain with HTTPS for production.
- CORS is restricted through `CORS_ORIGINS`; set it to the real production origin before public launch.
- Back up PostgreSQL regularly.
- Consider encrypting the Telegram session string stored in the database.

## Recent Updates

- Added dashboard login and logout flow.
- Protected backend `/api/*` routes with bearer token authentication.
- Added env-based CORS allowlist.
- Added responsive UI across Login, Bots, Bot Detail, Channels, and Telegram Session pages.
- Added collapsible desktop sidebar.
- Improved channel rule display so long regex/output templates wrap instead of being cut off.
- Added Telegram message delay diagnostics to activity logs.

## Git Ignore Policy

The repository ignores:

```text
backend/.env
backend/.env.prod
*.session
*.db
*.log
.venv
node_modules
frontend/dist
copy_trader.py
```

`copy_trader.py` is the legacy local runner and should stay out of Git if it contains real Telegram credentials.
