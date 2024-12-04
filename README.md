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
  its [i18n extension](https://jinja.palletsprojects.com/en/stable/extensions/#i18n-extension) for potential future translations,
  and [pyJWT](https://pyjwt.readthedocs.io/en/stable/) for generating [OAuth 2.0](https://oauth.net/2/) [JWT (RFC 7519)](https://datatracker.ietf.org/doc/html/rfc7519) tokens.

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
│ purge                                                                                                           │
│ reset-db                                                                                                        │
│ sync-members                                                                                                    │
╰─────────────────────────────────────────────────────────────────────────────────────────────────────────────────╯
```

## Development database

You need a running [PostgreSQL](https://www.postgresql.org/docs/current/index.html) server, with an `archon` superuser,
an `archondb` database owned by that superuser, with no password.
You can use the `DB_USER` and `DB_PWD` environment variables to use other values. The database name is not configurable.

## Development server

Use `openssl` to generate a secure token secret for signing our [JWT]() access tokens.

```bash
openssl rand -hex 32
```

Set this value for the `TOKEN_SECRET` environment variable, for example in a `.env` file at the repository's root.

```bash
export TOKEN_SECRET="[The generated secret string]"
```

Simply use `make serve` to run the front and back services.
They constantly watch your files and rebuild the project automatically when there is any change.
Use `pm2 logs` to keep an eye on what's going on and `pm2 kill` to stop the services.
You can also use `pm2 ps` to check if the services are up and running.
For more, see the [PM2 documentation](https://pm2.keymetrics.io/docs/usage/quick-start/).

## Design 

### Offline mode and Source of Truth (SoT)

While it is desirable to have a clear unique source of truth (SoT) for a tournament state, it has also deemed important
to be able to use this website in offline mode. Therefore, offline mode is activated _while online_ and changes the
source of truth (SoT) from the remote server to the local browser instance. This locks the remote server instance,
so noone else can interact with the server anymore.

Features deactivated in offline mode:

- Self registration for players
- Self check-in for players
- Score reporting for players
- Dynamic seating computation

Offline mode can be deactivated by any judge, so there are two "ways" out of it:

- Upload back online from the local instance that had been designated Source of Truth (SoT)
- Revert back to online from any other device and drop all changes from local Source of Truth (SoT)

### Journal and state

To facilitate reconciliation and avoid concurrency issues between multiple clients, the tournament state is maintained
and computed by the SoT. All instances (any browser, device, etc.) maintains a journal of events.
These events have unique IDs. On active interactions, an instance will:

- Send the event to the server, together with the last recorded event ID on the instance
- Receive an updated tournament state, together with a list of events since the last recorded event ID
- replay the listed events to modify the interface

In offline mode (being the SoT), it will simply:

- Play the events as they arrive
- Upon returning online, sent the updated state with all events 

Online clients can either:

- Simply rebuild their whole interface any time they get a tournament state update after sending an event
- Apply all returned events in order to their interface to avoid a global reload

In the future, this design will allow clients to use websockets for live updates very easily.

### Events list

#### Register

Neither VEKN nor UID is mandatory. To register a new player who has no VEKN account, provide a new UUID4.
If you do not provide one, a new UUID4 will be generated and an account created for that person.

```json
{
    "type": "Register",
    "name": "John Doe",
    "vekn": "12300001",
    "player_uid": "24AAC87E-DE63-46DF-9784-AB06B2F37A24",
    "country": "France",
    "city": "Paris"
}
```

#### OpenCheckin

Check a player in, signaling they are present and ready to play the next round.
You should perform the check-in just before the round starts to limit the number of players
who do not show up to their table.

```json
{
    "type": "OpenCheckin"
}
```

#### AppointJudge

Judges have permission to send all events, simple players are limited.
The UID must match a VEKN member UID.

```json
{
    "type": "AppointJudge",
    "judge_uid": "238CD960-7E54-4A38-A676-8288A5700FC8"
}
```

#### AppointJudge

Remove a judge.

```json
{
    "type": "RemoveJudge",
    "judge_uid": "238CD960-7E54-4A38-A676-8288A5700FC8"
}
```

#### CheckIn

Mark a player as ready to play. Players can self-check-in. 

```json
{
    "type": "CheckIn",
    "player_uid": "238CD960-7E54-4A38-A676-8288A5700FC8"
}
```

#### RoundStart

Start the next round. The provided seating must list players UID forming the tables.
Each UID must match a VEKN member UID.

```json
{
    "type": "RoundStart",
    "seating": [
        ["238CD960-7E54-4A38-A676-8288A5700FC8",
        "796CD3CE-BC2B-4505-B448-1C2D42E9F140",
        "80E9FD37-AD8C-40AA-A42D-138065530F10",
        "586616DC-3FEA-4DAF-A222-1E77A2CBD809",
        "8F28E4C2-1953-473E-A1C5-C281957072D1"
        ],[
        "BD570AA9-B70C-43CA-AD05-3B4C7DADC28C",
        "AB6F75B3-ED60-45CA-BDFF-1BF8DD5F02C4",
        "1CB1E9A7-576B-4065-8A9C-F7920AAF977D",
        "8907BE41-91A7-4395-AF91-54D94C489A36"
        ]
    ]
}
```


#### RoundAlter

Change a round's seating. Note recorded VPs, if any, stay assigned to the player even if they move.

```json
{
    "type": "RoundAlter",
    "round": 1,
    "seating": [
        ["238CD960-7E54-4A38-A676-8288A5700FC8",
        "796CD3CE-BC2B-4505-B448-1C2D42E9F140",
        "80E9FD37-AD8C-40AA-A42D-138065530F10",
        "586616DC-3FEA-4DAF-A222-1E77A2CBD809",
        "8F28E4C2-1953-473E-A1C5-C281957072D1"
        ],[
        "BD570AA9-B70C-43CA-AD05-3B4C7DADC28C",
        "AB6F75B3-ED60-45CA-BDFF-1BF8DD5F02C4",
        "1CB1E9A7-576B-4065-8A9C-F7920AAF977D",
        "8907BE41-91A7-4395-AF91-54D94C489A36"
        ]
    ]
}
```

#### RoundFinish

Finish the current round.

```json
{
    "type": "RoundFinish"
}
```

#### SetResult

Set a player's result. Players can set their and their table result for the current round.
Only VPs are provided, the GW and TP computations are done by the engine.

```json
{
    "type": "SetResult",
    "player_uid": "238CD960-7E54-4A38-A676-8288A5700FC8",
    "round": 1,
    "vps": 2.5
}
```

#### Drop

Drop a player from the tournament. A player can drop by themselves.
A Judge can drop a player if they note they have juse left.
To **disqualify** a player, use the [Sanction](#sanction) event.

```json
{
    "type": "Drop",
    "player_uid": "238CD960-7E54-4A38-A676-8288A5700FC8"
}
```

#### Sanction

Sanction (punish) a player.
The sanction levels are: `CAUTION`, `WARNING` and `DISQUALIFICATION`.
Cautions are just informative. Warnings are recorded (accessible to organizers, even in future events).
Disqualifications are recorded and remove the player from the tournament.

Sanction also have an optional category, one of:

- `DECK_PROBLEM`
- `PROCEDURAL_ERRORS`
- `CARD_DRAWING`
- `MARKED_CARDS`
- `SLOW_PLAY`
- `UNSPORTSMANLIKE_CONDUCT`
- `CHEATING`

```json
{
    "type": "Sanction",
    "level": "WARNING",
    "player_uid": "238CD960-7E54-4A38-A676-8288A5700FC8",
    "comment": "Free comment",
    "category": "PROCEDURAL_ERRORS"
}
```
    
#### Unsanction

Remove all sanctions of given level for a player.

```json
{
    "type": "Unsanction",
    "level": "WARNING",
    "player_uid": "238CD960-7E54-4A38-A676-8288A5700FC8"
}
```

#### Override
Judges can validated an odd table score.
For example, if they disqualify a player but do not award VPs to their predator,
the final table score will not appear valid until it's overriden.

Rounds and tables are counted starting from 1.

```json
{
    "type": "Override",
    "round": 1,
    "table": 1,
    "comment": "Free form comment"
}
```

#### SeedFinals

A finals is "seeded" first before players elect their seat in seed order.

```json
{
    "type": "SeedFinals",
    "seeds": ["238CD960-7E54-4A38-A676-8288A5700FC8",
        "796CD3CE-BC2B-4505-B448-1C2D42E9F140",
        "80E9FD37-AD8C-40AA-A42D-138065530F10",
        "586616DC-3FEA-4DAF-A222-1E77A2CBD809",
        "8F28E4C2-1953-473E-A1C5-C281957072D1"
    ]
}
```
        
#### SeatFinals

Note what seating position finalists have elected.

```json
{
    "type": "SeatFinals",
    "seating": ["238CD960-7E54-4A38-A676-8288A5700FC8",
        "796CD3CE-BC2B-4505-B448-1C2D42E9F140",
        "80E9FD37-AD8C-40AA-A42D-138065530F10",
        "586616DC-3FEA-4DAF-A222-1E77A2CBD809",
        "8F28E4C2-1953-473E-A1C5-C281957072D1"
    ]
}
```

#### Finish

Finish the tournament. This closes up the tournament. The winner, if finals results have been recorded,
is automatically computed.

```json
{
    "type": "Finish",
}
```
