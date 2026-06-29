# frontend/CLAUDE.md

Frontend-specific context. See root `CLAUDE.md` for full-project architecture first.

## Stack

React + Vite + Tailwind CSS + `react-router-dom` + `axios`. No state management library —
state lives in `App.jsx` (bots list, auth/user) and is passed down, plus local `useState` in pages.

## File responsibilities

| File | Responsibility |
|---|---|
| `src/App.jsx` | Top-level auth check (token in localStorage → `authApi.me()`), routing, holds `bots` list and refreshes it, renders `Sidebar` + routed pages |
| `src/api.js` | Single `axios` instance (`apiClient`) with auth interceptor (attaches Bearer token, clears token + redirects-equivalent on 401). All API calls (`authApi`, `botApi`, etc.) are grouped here — add new endpoints here, not ad-hoc `axios` calls in components |
| `src/pages/LoginPage.jsx` | Dashboard login form |
| `src/pages/BotListPage.jsx` | List/create/delete bots |
| `src/pages/BotDetailPage.jsx` | Bot detail: linked channels, activity logs (websocket-fed), rule preview |
| `src/pages/ChannelListPage.jsx` | List/create/edit channels, destinations, and `TradingCopySetting` rules |
| `src/pages/TelegramSessionPage.jsx` | Telegram user login flow (phone → code → optional 2FA password) |
| `src/components/Sidebar.jsx` | Collapsible desktop nav |
| `src/components/Modal.jsx` | Generic modal wrapper used across pages |

## Conventions

- Auth token key in localStorage: `copycat_dashboard_token` (see `api.js`). Don't introduce a
  second storage mechanism for it.
- API base URL: `VITE_API_BASE` env var, defaults to `/api` (works behind the dev proxy / nginx
  in prod — check `vite.config.js` / `nginx.conf` before changing this).
- New API calls go in `src/api.js` as a named export grouped by resource (`botApi`, `channelApi`,
  etc.), not inline `fetch`/`axios` in components.
- Live activity logs use a WebSocket (`/ws/bots/{bot_id}/logs`) — see how `BotDetailPage.jsx`
  currently wires it up before adding another websocket consumer elsewhere.
- Styling is Tailwind utility classes directly in JSX — no CSS modules / styled-components.

## Don't

- Don't touch `node_modules/` or `dist/` — both are build artifacts (gitignored), not source.
- Don't add a new HTTP client library — `axios` via `api.js` is the established pattern.
- Don't add Redux/Zustand/etc. without it being explicitly requested — current state approach
  (lift to `App.jsx`, props down) is intentional for this app's size.
