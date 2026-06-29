# CLAUDE.md

This file gives an AI coding agent the context needed to work effectively in this repository.

## What this project is

**CopyCat Trading Dashboard** — a full-stack Telegram copy-trading system. It listens to Telegram
source channels/groups (trading signal channels), applies configurable parsing/transformation rules
to incoming messages, and forwards the transformed output to destination Telegram channels — typically
via a Telegram bot. A web dashboard manages all of this (bots, channels, rules, logs, CMS posts).

This is **not** a trading bot that places trades — it copies and reformats Telegram messages
(e.g. "buy/sell signal" posts) from one place to another. The "trading" framing comes from the
domain it's built for (forex/gold signal channels), but the app itself only does message
ingestion → rule matching → templated re-posting.

## Why the Telegram architecture is split in two

Telegram bots cannot join arbitrary channels/groups as a member/reader (especially ones they don't
own or aren't invited to). So:

- A **Telegram user session** (logged in via phone number + API ID/hash, stored as an encrypted
  Telethon `StringSession`) is used to **read** source channels.
- A **Telegram bot token** (from BotFather) is used only to **post** to destination channels, where
  the bot has been added as admin/member.

```
Telegram user session -> reads source channels
Telegram bot token    -> posts to destination channels
Dashboard             -> manages bots, channels, rules, logs, and CMS posts
```

## Tech stack

- **Backend:** FastAPI + SQLAlchemy + Telethon (async), Python 3.13
- **Frontend:** React + Vite + Tailwind CSS
- **Database:** PostgreSQL in production/Docker; SQLite fallback for local dev (`copycat_trading.db`)
- **Production infra:** Docker Compose, Caddy (TLS/reverse proxy), Nginx (serves built frontend)

## Repo layout

```
backend/
  main.py                  # FastAPI app: all REST routes, auth middleware, websocket logs,
                            #   startup/shutdown lifecycle that boots copy traders
  copy_trader_service.py   # Core engine: Telethon client per bot+channel pair, listens for new
                            #   messages, applies rules, posts to destinations, logs activity,
                            #   handles reconnects + Telegram alert notifications
  message_rules.py         # Pure logic: matches a message against a channel's copy rules
                            #   (contains / regex / regex_multiline) and renders {{var}} output
                            #   templates via string.Template
  models.py                # SQLAlchemy models (see below)
  schemas.py                # Pydantic request/response schemas
  database.py               # Engine/session setup (Postgres or SQLite fallback)
  security.py                # Auth helpers + Telegram session string encryption
  .env / .env.example / .env.prod.example   # backend config (never commit real .env)

frontend/
  src/
    pages/        # LoginPage, BotListPage, BotDetailPage, ChannelListPage, TelegramSessionPage
    components/    # Sidebar, Modal
    api.js         # API client wrapper
  vite.config.js, tailwind.config.js, nginx.conf, Dockerfile

copy_trader.py        # LEGACY standalone runner (pre-dashboard). Intentionally git-ignored —
                       # historically may contain real credentials. Superseded by
                       # backend/copy_trader_service.py, which is driven by the dashboard/DB.
docker-compose.yml          # Local dev: Postgres + backend (with reload)
docker-compose.prod.yml     # Production: Postgres + backend + frontend (nginx) + Caddy
Caddyfile                   # Reverse proxy / automatic HTTPS config
start.sh / start.bat        # Convenience scripts to run backend+frontend locally
```

## Data model (backend/models.py)

- **Bot** — a Telegram bot (api_id, api_hash, bot_token, session_name). Linked to many Channels via
  `bot_channel_association`.
- **Channel** — a source channel being monitored (`channel_handle`), with one or more:
  - **ChannelDestination** — where matched/transformed messages get posted (`destination_handle`),
    each with its own active flag and optional custom output override.
  - **TradingCopySetting** — an ordered (by `priority`) list of rules: `match_type`
    (`contains` / `regex` / `regex_multiline`), `filtered_message` (literal text or regex pattern),
    `output_message` (template with `{{var}}` placeholders).
- **ActivityLog** — per bot/channel/destination log of signal_received / signal_sent / error / info
  events, including Telegram message delay diagnostics.
- **TelegramUserSession** — the single active Telegram user login (encrypted session string, 2FA
  state, login flow fields like `phone_code_hash`).
- **ProcessedTelegramMessage** — dedupe table keyed on (bot_id, channel_id, telegram_message_id) so
  reconnects/restarts don't reprocess/repost the same message.

## Core message flow

1. `CopyTraderService` (one instance per active bot+channel pair, managed in `main.py`'s
   `active_copy_traders()` / `start_linked_copy_trader()`) holds a Telethon client built from the
   stored, decrypted user session string.
2. On a new message event in a source channel, it's checked against `ProcessedTelegramMessage` for
   dedupe, then run through `message_rules.apply_copy_settings()` against that channel's
   `TradingCopySetting` rows, in priority order.
3. The first matching rule produces a `RuleResult` (rendered output message + matched variables).
   If `COPY_TRADER_FORWARD_ALL=true` and nothing matches, the raw message can still be forwarded
   (see env vars below) — check `copy_trader_service.py` for current fallback behavior.
4. The rendered message is posted to each active `ChannelDestination` for that channel (via the
   bot's HTTP Telegram Bot API call, not Telethon), and an `ActivityLog` row + websocket broadcast
   (`/ws/bots/{bot_id}/logs`) are written so the dashboard updates live.
5. `COPY_TRADER_ALERT_BOT_TOKEN` / `COPY_TRADER_ALERT_CHAT_ID` send out-of-band alerts (e.g. session
   dropped, waiting for login) to the operator, separate from the channel-posting bots.

## Rule/template syntax (user-facing feature, see README for full examples)

- `contains`: case-insensitive substring match.
- `regex` / `regex_multiline`: Python regex against the message; named groups (`(?P<name>...)`) and
  positional groups become template variables.
- Output templates use `{{var}}` syntax, converted internally to `string.Template` `${var}` syntax
  (`message_rules.convert_handlebars`) and rendered with `safe_substitute` (missing vars won't crash
  rendering, they're left as literal `${var}`-style text if unresolved... verify against current
  behavior before relying on it).
- `{{original_message}}` is always available as a variable.

## Auth & security model

- Single shared dashboard login (`DASHBOARD_ADMIN_USERNAME` / `DASHBOARD_ADMIN_PASSWORD`), not
  multi-user. Session token is a custom bearer token (`security.py` / `main.py`
  `create_access_token` / `verify_access_token`), checked by an `http` middleware
  (`require_dashboard_auth`) guarding all `/api/*` routes.
- Telegram user session strings are encrypted at rest using `TELEGRAM_SESSION_ENCRYPTION_KEY`
  (`security.py: decrypt_text` / corresponding encrypt fn) — see
  `encrypt_existing_telegram_sessions()` migration in `main.py` for legacy plaintext rows.
- CORS is restricted via `CORS_ORIGINS` env var — must be set to real origins before any public
  deployment.

## Key environment variables (backend/.env)

| Var | Purpose |
|---|---|
| `DATABASE_URL` | Postgres connection string (falls back to SQLite if unset, see `database.py`) |
| `COPY_TRADER_AUTO_REGISTER` | whether new source channels auto-create copy traders |
| `COPY_TRADER_FORWARD_ALL` | forward unmatched messages verbatim vs. drop them |
| `COPY_TRADER_ALERT_BOT_TOKEN` / `_ALERT_CHAT_ID` | operator alert bot, separate from posting bots |
| `DASHBOARD_ADMIN_USERNAME` / `_PASSWORD` | dashboard login creds |
| `DASHBOARD_AUTH_SECRET` | signs the bearer token |
| `DASHBOARD_TOKEN_EXPIRE_SECONDS` | session length |
| `CORS_ORIGINS` | allowed frontend origins |
| `TELEGRAM_SESSION_ENCRYPTION_KEY` | encrypts the stored Telethon session string |

## Running locally

```bash
# backend
.\.venv\Scripts\python.exe -m pip install -r backend\requirements.txt
.\.venv\Scripts\python.exe -m uvicorn backend.main:app --reload   # http://127.0.0.1:8000

# frontend
cd frontend && npm install && npm run dev                          # http://127.0.0.1:5173
```

Or `docker compose up --build` for Postgres + backend together. `start.sh` / `start.bat` wrap both.

Production uses `docker-compose.prod.yml` (adds the built frontend behind nginx + Caddy for TLS).
Only ports 22/80/443 should ever be exposed publicly — never 5432/8000/5173.

## Things an agent should be careful about

- **Never commit** `backend/.env`, `backend/.env.prod`, `*.session`, `*.db`, or `*.log` files —
  several of these (`session.session`, `copycat_trading.db`, `backend_start.log`) currently exist
  in the working tree from local runs; don't read/print their contents into chat or commits.
- `copy_trader.py` at the repo root is the **legacy** pre-dashboard runner, git-ignored on purpose
  because older versions may contain hardcoded real Telegram credentials. Don't resurrect it as the
  canonical entrypoint — `backend/copy_trader_service.py` is the current implementation.
- Telegram bot tokens that were ever committed/pasted/exposed should be treated as compromised and
  rotated, per the README's security notes — don't assume any token found in history is still safe
  to reuse.
- The Telegram **user session** (not the bot token) is the single point of failure for reading
  source channels — there's only one `TelegramUserSession` row treated as "active" at a time.
- Rule matching is **first-match-wins by priority**, not "all matching rules fire" — keep that in
  mind when adding/reordering `TradingCopySetting` rows or rule logic.
- Frontend `node_modules`, `frontend/dist`, and `.venv` are present in the extracted project tree;
  treat them as build artifacts, not source to edit.
