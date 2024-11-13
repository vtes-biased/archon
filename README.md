# archon

Tournament management

## Development install

This project uses [npm](https://docs.npmjs.com), that you can install with [nvm](https://github.com/nvm-sh/nvm).
It also uses [Python](https://docs.python.org/3/) on the backend side, so install Python version >= `3.11`.

Finally, you'll need [GNU Make](https://www.gnu.org/software/make/manual/make.html) for simple targets and processes defined in a [Makefile](Makefile).
Four options if you are on Windows:

- Use [Chocolatey](https://chocolatey.org) as package manager and `choco install make`
- Use the [Windows Subsystem for Linux (WSL)](https://learn.microsoft.com/en-us/windows/wsl/) feature
- Just install the [GNU make binary for Windows](https://gnuwin32.sourceforge.net/packages/make.htm)
- Don't use `make` at all. The [Makefile](Makefile) is just a shortcut, you can open it and copy/paste the commands in your Powershell.

```bash
nvm install node
nvm use node
python -m virtualenv .venv
source .venv/bin/activate
make update
```

We are using a couple of very standard tools and frameworks, that `make update` will install and update for you:

- [Typescript](https://www.typescriptlang.org/docs/) our frontend language

- [Bootstrap](https://getbootstrap.com/docs) and its [icons](https://icons.getbootstrap.com), for basic styling & responsiveness 

- [Parcel](https://parceljs.org/docs/) as our build framework for frontend

- [FastAPI](https://fastapi.tiangolo.com/learn/) as our backend server framework,
  with [Jinja2](https://jinja.palletsprojects.com/en/stable/) for HTML templating,
  and its [i18n extension](https://jinja.palletsprojects.com/en/stable/extensions/#i18n-extension) for potential future translations

- [PostgreSQL](https://www.postgresql.org/docs/current/index.html) for database,
  with [psycopg3](https://www.psycopg.org/psycopg3/docs/) as our library to instrument it

- [AIOHTTP](https://docs.aiohttp.org) for web queries

- [Black](https://black.readthedocs.io/en/stable/) and [Ruff](https://docs.astral.sh/ruff/) for python formatting and linting, respectively

- [Twine](https://twine.readthedocs.io/en/stable/) to publish our Python package to the public [PYPI](https://pypi.org) repository.

- [PM2](https://pm2.keymetrics.io/docs/usage/quick-start/) to run our hot reload development services (front & back)

- [Geonames](https://www.geonames.org) for countries and cities names and IDs

- [Typer](https://typer.tiangolo.com) for the [`archon` Command-Line Interface (CLI)](#cli)

## Make targets

- `make geodata` downlad and refresh the geographical data in [geodata](src/archon/geodata)
- `make test` runs the tests, formatting and linting checks
- `make serve` runs a dev server with watchers for auto-reload when changes are made to the source files
- `make clean` cleans the repository from all transient build files
- `make build` builds the python package
- `make release` creates and pushes a git tag for this version and publishes the package on [PYPI](https://pypi.org)

## CLI

The `archon` CLI gives access to useful DB-related commands when developing in local.

```bash
> archon --help

 Usage: archon [OPTIONS] COMMAND [ARGS]...
╭─ Options ───────────────────────────────────────────────────────────────────────────────────────────────────────╮
│ --install-completion          Install completion for the current shell.                                         │
│ --show-completion             Show completion for the current shell, to copy it or customize the installation.  │
│ --help                        Show this message and exit.                                                       │
╰─────────────────────────────────────────────────────────────────────────────────────────────────────────────────╯
╭─ Commands ──────────────────────────────────────────────────────────────────────────────────────────────────────╮
│ list                                                                                                            │
│ reset-db                                                                                                        │
│ sync-members                                                                                                    │
╰─────────────────────────────────────────────────────────────────────────────────────────────────────────────────╯
```

## Development database

You need a running [PostgreSQL](https://www.postgresql.org/docs/current/index.html) server, with an `archon` superuser,
an `archondb` database owned by that superuser, with no password.
You can use the `DB_USER` and `DB_PWD` environment variables to use other values. The database name is not configurable.

## Development server

Simply use `make serve` to run the front and back services.
They constantly watch your files and rebuild the project automatically when there is any change.
Use `pm2 logs` to keep an eye on what's going on and `pm2 kill` to stop the services.
You can also use `pm2 ps` to check if the services are up and running.
For more, see the [PM2 documentation](https://pm2.keymetrics.io/docs/usage/quick-start/).
