# Claude Code Guidelines

## Style
- Keep answers short and token-efficient
- Prefer compact code and minimal changes
- Check assumptions in project code or web docs
- Challenge instructions when needed
- No congratulations, no validation, no thanks

## Architecture

Archon is an event-driven VTES tournament system.

### Key Patterns
- JSONB storage (no migrations)
- Offline-first (browser = Source of Truth)
- Async psycopg3 + FastAPI
- Events are idempotent and replayable

### Entry Points
- `src/archon/app/main.py` - FastAPI + lifespan
- `src/archon/engine.py` - Event processing (server-side)
- `src/archon/db.py` - Async PostgreSQL
- `src/archon/cli.py` - Typer CLI
- `src/archon/models.py` - Pydantic + JSONB

### Frontend
- Parcel bundles `src/front/` → `src/archon/static/`
- `src/front/tournament/engine.ts` - Tournament state management
- `src/front/tournament/local_engine.ts` - Offline event application
- `src/front/offline.ts` - IndexedDB persistence

### Events
- Defined in `src/archon/events.py` (Python) and `src/front/events.ts` (TypeScript)
- All events are idempotent and replayable

### Auth
- Discord OAuth + email/JWT
- Roles: judges vs players

### Database
- Tables: members, tournaments, events
- JSONB fields, unique indexes on discord_id/email/vekn

### Dev
- `make serve` runs PM2 (backend + frontend watch)
- `npm run front` - Parcel watch
- `npm run back` - uvicorn with reload

### Deploy
- Ansible + vault
- VEKN sync on startup (skipped in debug)
