# CopyCat Trading Bot Dashboard

## Setup Instructions

### Backend Setup

1. Install backend dependencies:
```bash
cd backend
pip install -r requirements.txt
```

2. Create `.env` file in the backend folder:
```
DATABASE_URL=postgresql://user:password@localhost:5432/copycat_trading
```

3. Install PostgreSQL and create the database:
```bash
createdb copycat_trading
```

4. Run the backend server:
```bash
python main.py
```

The API will be available at `http://localhost:8000`

### Frontend Setup

1. Install frontend dependencies:
```bash
cd frontend
npm install
```

2. Run the development server:
```bash
npm run dev
```

The dashboard will be available at `http://localhost:5173`

## API Endpoints

### Bots
- `GET /api/bots` - List all bots
- `POST /api/bots` - Create new bot
- `GET /api/bots/{bot_id}` - Get bot details
- `PUT /api/bots/{bot_id}` - Update bot
- `DELETE /api/bots/{bot_id}` - Delete bot
- `PATCH /api/bots/{bot_id}/toggle` - Toggle bot active/inactive

### Channels
- `GET /api/channels` - List all channels
- `POST /api/channels` - Create new channel
- `GET /api/channels/{channel_id}` - Get channel details
- `PUT /api/channels/{channel_id}` - Update channel
- `DELETE /api/channels/{channel_id}` - Delete channel

### Bot-Channel Linking
- `POST /api/bots/{bot_id}/channels/{channel_id}` - Link bot to channel
- `DELETE /api/bots/{bot_id}/channels/{channel_id}` - Unlink bot from channel

### Activity Logs
- `GET /api/bots/{bot_id}/logs` - Get bot logs
- `GET /api/bots/{bot_id}/logs/export` - Export logs to CSV
- `POST /api/bots/{bot_id}/logs` - Add activity log
- `POST /api/bots/{bot_id}/notify-log` - Notify WebSocket clients

### WebSocket
- `WS /ws/bots/{bot_id}/logs` - Real-time log updates

## Features

✅ Add new bots with configuration  
✅ Add new channels  
✅ Link bots to channels  
✅ View bot details and activity logs  
✅ Real-time log updates via WebSocket  
✅ Export logs to CSV  
✅ Enable/disable bot toggle  
✅ Edit bot/channel settings  
✅ Delete bots/channels  
