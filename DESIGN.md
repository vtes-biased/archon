# Archon - VTES Tournament Management System

## Overview

Archon is a tournament management system for Vampire: The Eternal Struggle (VTES), built as a FastAPI backend with TypeScript frontend. It manages the complete tournament lifecycle and integrates with the VEKN (Vampire Elder Kindred Network) ecosystem.

## Architecture

```
┌─────────────────┐    ┌─────────────────┐    ┌─────────────────┐
│   Frontend      │    │   Backend       │    │   Database      │
│   (TypeScript)  │◄──►│   (FastAPI)     │◄──►│   (PostgreSQL)  │
│   Bootstrap UI  │    │   Python 3.11+  │    │   JSONB Store   │
└─────────────────┘    └─────────────────┘    └─────────────────┘
```

### Technology Stack

**Backend:** FastAPI, PostgreSQL with JSONB, psycopg3, Pydantic, Jinja2, Uvicorn  
**Frontend:** TypeScript, Bootstrap 5, Parcel, Luxon, QR Scanner  
**Infrastructure:** Ansible, Nginx, Systemd (production), PM2 (development)

#### Technology Stack

We are using a couple of very standard tools and frameworks, that `make update` will install and update for you:

- [Typescript](https://www.typescriptlang.org/docs/) our frontend language

- [Bootstrap 5](https://getbootstrap.com/docs) and its [icons](https://icons.getbootstrap.com), for basic styling & responsiveness 

- [Parcel](https://parceljs.org/docs/) as our build framework for frontend

- [Luxon](https://moment.github.io/luxon/) for date and time handling

- [QR Scanner](https://github.com/nimiq/qr-scanner) for QR code scanning functionality

- [FastAPI](https://fastapi.tiangolo.com/learn/) as our backend server framework,
  with [Jinja2](https://jinja.palletsprojects.com/en/stable/) for HTML templating,
  and [pyJWT](https://pyjwt.readthedocs.io/en/stable/) for generating [OAuth 2.0](https://oauth.net/2/) [JWT (RFC 7519)](https://datatracker.ietf.org/doc/html/rfc7519) tokens.

- [Uvicorn](https://www.uvicorn.org/) as the ASGI server for running FastAPI

- [PostgreSQL](https://www.postgresql.org/docs/current/index.html) >= 15 for database,
  with [psycopg 3](https://www.psycopg.org/psycopg3/docs/) as our library to instrument it,
  relying on JSONB fields to provide flexibility while avoiding classic migrations.

- [AIOHTTP](https://docs.aiohttp.org) for web queries

- [Black](https://black.readthedocs.io/en/stable/) and [Ruff](https://docs.astral.sh/ruff/) for python formatting and linting, respectively

- [Twine](https://twine.readthedocs.io/en/stable/) to publish our Python package to the public [PYPI](https://pypi.org) repository.

- [PM2](https://pm2.keymetrics.io/docs/usage/quick-start/) to run our hot reload development services (front & back)

- [Geonames](https://www.geonames.org) for countries and cities names and IDs

- [Typer](https://typer.tiangolo.com) for the [`archon` Command-Line Interface (CLI)](#cli)

- [Ansible](https://docs.ansible.com/) for infrastructure automation and deployment

- [Nginx](https://nginx.org/en/docs/) as reverse proxy in production

- [Systemd](https://systemd.io/) for process management in production

## Core Components

### Data Models (`models.py`)
Pydantic dataclasses modeling the VTES domain: `Member`, `Tournament`, `League`, `Player`, `Sanction`. Uses JSONB for flexible schema with built-in field validators for data migration.

### Tournament Engine (`engine.py`)
Event-driven architecture handling the complete tournament lifecycle. Events are idempotent and include registration, rounds, results, sanctions, and finals. Integrates with KRCG seating algorithms and implements official VTES scoring rules.

### Database Layer (`db.py`)
Async PostgreSQL abstraction with connection pooling, JSONB storage, and optimized indexing. Key tables: `members`, `tournaments`, `tournament_events`, `leagues`. Complete audit trail for all tournament actions.

### API Layer
RESTful endpoints for tournaments, leagues, and member management. OpenAPI documentation, Discord/email authentication, role-based access control, and comprehensive error handling.

### Frontend Architecture
TypeScript modules with Bootstrap UI. Base utilities, page-specific modules, and shared components. Responsive design with client-side member data caching via IndexedDB.

### Build System
Parcel for frontend bundling with TypeScript/SCSS support. setuptools for Python packaging with automatic versioning from Git tags.

## Key Design Decisions

### Event-Driven Architecture
All tournament actions are recorded as immutable events, providing complete audit trails and enabling state reconstruction. Events are idempotent and can be safely replayed.

### JSONB Storage
PostgreSQL JSONB provides flexible schema evolution without traditional migrations. Field validators handle data migration automatically.

### Independent Rating System
Implements official VEKN rating calculations locally rather than syncing from VEKN, ensuring consistency and performance.

### Multiple Authentication Methods
Discord OAuth and email/password authentication, with role-based access control for different user types.

### Offline Mode and Source of Truth (SoT)
While it is desirable to have a clear unique source of truth (SoT) for a tournament state, it has also deemed important to be able to use this website in offline mode. Therefore, offline mode is activated _while online_ and changes the source of truth (SoT) from the remote server to the local browser instance. This locks the remote server instance, so no one else can interact with the server anymore.

Features deactivated in offline mode:
- Self registration for players
- Self check-in for players
- Score reporting for players

Offline mode can be deactivated by any judge, so there are two "ways" out of it:
- Upload back online from the local instance that had been designated Source of Truth (SoT)
- Revert back to online from any other device and drop all changes from local Source of Truth (SoT)

### Journal and State Management
To facilitate reconciliation and avoid concurrency issues between multiple clients, the tournament state is maintained and computed by the SoT. All instances (any browser, device, etc.) maintains a journal of events. These events have unique IDs.

In offline mode (being the SoT), a client would simply:
- Record the events as they happen.
- TODO: an offline mode orchestrator matching the server tournament orchestrator.
- Upon returning online, send the updated state with all events.

Online clients can simply rebuild their whole interface any time they get a tournament state update after sending an event.

In the future, this event-oriented design will allow clients to use SSE for live updates more easily.

## Security

**Authentication:** Discord OAuth and email/password with JWT tokens and role-based access control.  
**Data Protection:** Pydantic validation, parameterized queries, proper output encoding, and session-based CSRF protection.

## Deployment

**Infrastructure:** Ubuntu Server, Nginx (reverse proxy), PostgreSQL 16, Systemd (process management)  
**Automation:** Ansible playbooks for provisioning, environment variables for configuration, Ansible Vault for secrets  
**Database:** Idempotent schema creation (no migration system)

The project comes with a Linux [Ansible](https://docs.ansible.com) install. You need a valid ssh access to the server with a sudoer to run the ansible playbooks.

The secrets are ciphered with [Ansible Vault](https://docs.ansible.com/ansible/latest/vault_guide/index.html), the vault key is stored as a Github secret. You need to set this value as is in a `.vault-password` file at the project root to use vault locally.

To add a secret value, cipher it with `ansible-vault`:

```sh
ansible-vault encrypt_string [SECRET]
```

If the server has just been reinstalled, update [apt](https://en.wikipedia.org/wiki/APT_(software)) and install the required packages:

```sh
ansible-playbook ansible/setup.yml
```

To re-install (or update) the archon service, just run:

```sh
ansible-playbook ansible/archon.yml
```

## Integration Points

**VEKN Integration:** Member synchronization, tournament result submission, independent rating calculations using official VEKN rules  
**External Services:** Discord OAuth, SMTP email authentication, KRCG card database, VDB deck builder support

## Development

**Local Development:** `uvicorn archon.app.main:app --reload` (backend), `npm run front` (frontend)  
**Testing:** Limited unit tests for scoring system, Black formatting and Ruff linting  
**Code Quality:** Full TypeScript coverage, Python linting with Ruff, comprehensive documentation

### Development Environment Setup

This project uses [npm](https://docs.npmjs.com), that you can install with [nvm](https://github.com/nvm-sh/nvm).
It also uses [Python](https://docs.python.org/3/) on the backend side, so install Python version >= `3.11`.
Do not forget to install the required certifi certificates for Python (follow the installer instructions).

Finally, you'll need [GNU Make](https://www.gnu.org/software/make/manual/make.html) 
for simple targets and processes defined in a [Makefile](Makefile).

### Development Database

You need a running [PostgreSQL](https://www.postgresql.org/docs/current/index.html) server, with an `archon` superuser,
an `archondb` database owned by that superuser, with no password.
You can use the `DB_USER` and `DB_PWD` environment variables to use other values. The database name is hardcoded as `archondb`.

### Development Server

Make sure you have set up all the required environment settings.
Simply use `make serve` to run the front and back services.
They constantly watch your files and rebuild the project automatically when there is any change.
Use `pm2 logs` to keep an eye on what's going on and `pm2 kill` to stop the services.
You can also use `pm2 ps` to check if the services are up and running.
For more, see the [PM2 documentation](https://pm2.keymetrics.io/docs/usage/quick-start/).

### Bootstrapping

To bootstrap the app with a full VEKN sync, you need to run it once out of debug mode:

```
PYTHONOPTIMIZE=1 make serve
```

Alternatively, you can run the necessary sync from the command line directly:

```
archon sync-members
archon sync-events
archon recompute-ratings
```
