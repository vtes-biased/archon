# Claude Code Guidelines

Be concise. Minimal changes. Challenge assumptions. No praise/thanks. Use Context7 MCP for docs.

## Context7 Library IDs

- FastAPI: `/websites/fastapi_tiangolo`
- Pydantic: `/llmstxt/pydantic_dev_llms-full_txt`
- psycopg3: `/websites/psycopg_psycopg3`
- Typer: `/fastapi/typer`
- Parcel: `/parcel-bundler/website`

## Archon Architecture

Event-driven VTES tournament system. JSONB storage (no migrations), offline-first (browser=SoT), async psycopg3+FastAPI.

Entry points: `src/archon/app/main.py` (FastAPI), `src/archon/engine.py` (events), `src/archon/db.py` (PostgreSQL), `src/archon/cli.py` (Typer), `src/archon/models.py` (Pydantic+JSONB).

Events (`src/archon/events.py`): idempotent/replayable. VEKN sync on startup (skipped in debug). Frontend: Parcel→`src/archon/static/`. Dev: `make serve`. Deploy: Ansible+vault. Auth: Discord OAuth + email/JWT, judges vs players. DB: members/tournaments/events tables, JSONB fields, unique indexes on discord_id/email/vekn.
