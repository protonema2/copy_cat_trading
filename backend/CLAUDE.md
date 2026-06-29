# backend/CLAUDE.md

Backend-specific context. See root `CLAUDE.md` for full-project architecture first.

## File responsibilities (read the one you need, not all of them)

| File | Responsibility |
|---|---|
| `main.py` | All FastAPI routes, auth middleware, startup/shutdown lifecycle, websocket log streaming, bot/channel CRUD, Telegram login flow endpoints |
| `copy_trader_service.py` | The running engine: one `CopyTraderService` per active bot+channel, Telethon listener, reconnect logic, alert notifications, posting to destinations |
| `message_rules.py` | Pure functions only — rule matching (contains/regex/regex_multiline) and `{{var}}` → output template rendering. No DB or network calls. Safe to unit test in isolation. |
| `models.py` | SQLAlchemy models — Bot, Channel, ChannelDestination, TradingCopySetting, ActivityLog, TelegramUserSession, ProcessedTelegramMessage |
| `schemas.py` | Pydantic request/response models, mirrors `models.py` roughly 1:1 |
| `database.py` | Engine/session setup; auto-falls back to SQLite (`copycat_trading.db`) if `DATABASE_URL` is unset or unreachable |
| `security.py` | Bearer token create/verify, Telegram session string encrypt/decrypt |

## Conventions

- Route handlers in `main.py` follow REST-ish pattern: `/api/bots`, `/api/channels`,
  `/api/channels/{id}/logs`, `/api/bots/{id}/channels/{id}` for linking. Follow the existing
  naming when adding new endpoints.
- All `/api/*` routes are gated by the `require_dashboard_auth` middleware — no per-route
  `Depends(auth)` boilerplate needed, it's global.
- DB session is injected via `Depends(get_db)` from `database.py`.
- `copy_trader_service.py` reads config from `os.getenv(...)` directly rather than a settings
  object — match that pattern rather than introducing pydantic Settings unless asked to refactor.
- Rule logic (`message_rules.py`) is intentionally framework-free — keep it that way so it stays
  unit-testable without spinning up Telethon/DB.

## When debugging the copy-trading pipeline

Trace in this order, and only open the files actually relevant to where the issue is:
1. Is the Telegram user session active? (`TelegramUserSession`, `/api/telegram-session/status`)
2. Is the `CopyTraderService` for that bot+channel running? (`active_copy_traders()` in `main.py`)
3. Is the incoming message being deduped incorrectly? (`ProcessedTelegramMessage` checks in
   `copy_trader_service.py`)
4. Is a `TradingCopySetting` rule matching as expected? Test it via `POST /api/rules/preview`
   before editing `message_rules.py` — it's the fastest feedback loop, no need to restart any
   listener.
5. Is the destination post failing? Check `ActivityLog` rows with `log_type="error"`.

## Don't

- Don't read or print `backend/.env`, `backend/.env.prod`, `*.session`, or `*.db` files into chat —
  they may contain live credentials.
- Don't resurrect `copy_trader.py` (repo root, legacy/gitignored) as a fix target.
- Don't add new dependencies without checking `requirements.txt` for an existing one first
  (e.g. it already pins `telethon`, `cryptography`, `sqlalchemy`).
