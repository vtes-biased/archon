# archon

Tournament management

> 📋 For detailed architecture and design information, see [DESIGN.md](DESIGN.md)
> 📝 For version history and changes, see [CHANGELOG.md](CHANGELOG.md)

## Quick Start

For detailed development setup instructions, see [DESIGN.md](DESIGN.md).

### Basic Installation

```bash
nvm install node
nvm use node
python -m virtualenv .venv
source .venv/bin/activate
make update
```

### Windows Users

Four options for Windows users:

- Use [Chocolatey](https://chocolatey.org) as package manager and `choco install make`
- Use the [Windows Subsystem for Linux (WSL)](https://learn.microsoft.com/en-us/windows/wsl/) feature
- Just install the [GNU make binary for Windows](https://gnuwin32.sourceforge.net/packages/make.htm)
- Don't use `make` at all. The [Makefile](Makefile) is just a shortcut, 
  you can open it and copy/paste the commands in your Powershell.

### Using Homebrew on OSX

You can use [Homebrew](https://brew.sh/) on Linux or OSX to install Python and its dependencies.
Don't forget to update the CA certificates from time to time.

```bash
brew reinstall ca-certificates openssl
```

### Tools & Frameworks

We are using standard tools and frameworks that `make update` will install and update for you. See [DESIGN.md](DESIGN.md) for detailed technology stack information.

## Make targets

- `make geodata` download and refresh the geographical data in [geodata](src/archon/geodata)
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
│ reset-db            ⚠️  Reset the database ⚠️ Removes all data                                                   │
│ list                List tournaments                                                                            │
│ sync-members        Update members from the vekn.net website                                                    │
│ sync-events         Update historical tournaments from the vekn.net website                                     │
│ purge               Purge deprecated historical data                                                            │
│ add-client          Add an authorized client to the platform                                                    │
│ recompute-ratings   Recompute all tournament ratings                                                            │
╰─────────────────────────────────────────────────────────────────────────────────────────────────────────────────╯
```


## Settings

This software requires some environment settings for multiple functionalities:

### VEKN credentials

Used to collect the VEKN members list, and publish events and their result.

```bash
export VEKN_LOGIN="<vekn_login>"
export VEKN_PASSWORD="<vekn_password>"
```

### VEKN API

For now, this app uses the [VEKN API](https://bitbucket.org/vekn/vekn-api/src/master/) 
to declare and report events. There is an [online documentation](https://www.vekn.net/API/readme.txt).

```bash
export VEKN_PUSH="<vekn_push_token>"
```

### Site configuration

Base URL for the application (used for generating links in emails and API responses):

```bash
export SITE_URL_BASE="http://127.0.0.1:8000"
```

### Discord credentials

Used for the Discord social login. You need to register a
[Discord Application](https://discord.com/developers/applications).

```bash
export DISCORD_CLIENT_ID="<discord_client_id>"
export DISCORD_CLIENT_SECRET="<discord_client_secret>"
```

### Application secrets

Secrets for various security features.
Make sure you use different secure random secrets for different environments.

```bash
export SESSION_KEY="<sign_session_cookie>"
export TOKEN_SECRET="<sign_access_token>"
export HASH_KEY="<hash_user_passwords>"
```

You can use `openssl` to generate each of these secrets:

```bash
openssl rand -hex 32
```

### Email (SMTP) parameters

Used to send the "password reset" email necessary for the basic email login feature.
Note that if you're using GMail, you probably need to generate an
[Application Password](https://myaccount.google.com/apppasswords) for this application.

```bash
export MAIL_SERVER="smtp.gmail.com"
export MAIL_PORT="587"
export MAIL_USERNAME="codex.of.the.damned@gmail.com"
export MAIL_PASSWORD="<app_password>"
export MAIL_FROM="codex.of.the.damned@gmail.com"
export MAIL_FROM_NAME="Archon"
```

## Deployment

For deployment information, see [DESIGN.md](DESIGN.md).

## API Reference

For detailed architecture and design information including offline mode, event-driven architecture, and state management, see [DESIGN.md](DESIGN.md).

### Tournament States

Tournaments progress through the following states:

- **PLANNED**: Initial state. Registration is closed. Only judges can register players.
- **REGISTRATION**: Registration is open. Players can self-register and judges can register players.
- **WAITING**: Check-in is open. Players must check in to play the next round. They can still self-register.
- **PLAYING**: A round is in progress. Judges can add/remove players to the round. Players can self-register for next one.
- **FINALS**: The finals round is in progress.
- **FINISHED**: Tournament is complete.

**State transitions:**
- PLANNED → (OpenRegistration) → REGISTRATION
- REGISTRATION → (CloseRegistration) → PLANNED
- REGISTRATION → (OpenCheckin) → WAITING
- WAITING → (CancelCheckin) → REGISTRATION
- WAITING → (RoundStart) → PLAYING
- PLAYING → (RoundFinish/RoundFinish) → REGISTRATION

### Tournament Events

#### OpenRegistration

Opens player registration. Players can then self-register to the tournament.
Only judges can open registration. Only works from PLANNED state.

```json
{
    "type": "OPEN_REGISTRATION"
}
```

#### CloseRegistration

Closes player registration. Puts the tournament back in PLANNED state.
Players can no longer self-register, but judges can still register players manually.
Only judges can close registration. Only works from REGISTRATION state.

```json
{
    "type": "CLOSE_REGISTRATION"
}
```

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

Allows to check players in, signaling they are present and ready to play.
You should open the check-in just before the round starts to limit
the number of players who do not show up to their table.

```json
{
    "type": "OPEN_CHECKIN"
}
```

#### CancelCheckin

Cancel the check-in. Use it if you opened the check-in too early.
Puts the tournament back in the REGISTRATION state.

```json
{
    "type": "CANCEL_CHECKIN"
}
```


#### CheckIn

Mark a player as ready to play. Players can self-check-in. 

```json
{
    "type": "CHECK_IN"
    "player_uid": "238CD960-7E54-4A38-A676-8288A5700FC8"
}
```

#### CheckEveryoneIn

When running registrations in situ, or after first round.
It will not check-in players who have dropped (FINISHED state)
or have an active barrier (missing deck, having been disqualified, etc.).

```json
{
    "type": "CHECK_EVERYONE_IN"
}
```

#### CheckOut

Move a player back to registration.

```json
{
    "type": "CHECK_OUT",
    "player_uid": "238CD960-7E54-4A38-A676-8288A5700FC8"
}
```

#### RoundStart

Start the next round. The provided seating must list players UID forming the tables.
Each UID must match a VEKN member UID.

```json
{
    "type": "ROUND_START",
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
    "type": "ROUND_ALTER",
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
    "type": "ROUND_FINISH"
}
```

#### RoundCancel

Cancel the current round. All results for this round are discarded.

```json
{
    "type": "RoundCancel"
}
```

#### SetResult

Set a player's result. Players can set their and their table result for the current round.
Only VPs are provided, the GW and TP computations are done by the engine.

```json
{
    "type": "SET_RESULT",
    "player_uid": "238CD960-7E54-4A38-A676-8288A5700FC8",
    "round": 1,
    "vps": 2.5
}
```

#### SetDeck

Set a player's deck list. Players can set their own decklist, each round if it is a multideck tournament.
Accepts plain text decklist (any usual format) or decklists URL (VDB, Amaranth, VTESDecks).

```json
{
    "type": "SET_DECK",
    "player_uid": "238CD960-7E54-4A38-A676-8288A5700FC8",
    "deck": "https://vdb.im/decks/11906"
}
```

The `round` parameter is facultative and can only be used by a Judge for corrective action in multideck tournaments.

```json
{
    "type": "SET_DECK",
    "player_uid": "238CD960-7E54-4A38-A676-8288A5700FC8",
    "round": 1,
    "deck": "https://vdb.im/decks/11906"
}
```

#### Drop

Drop a player from the tournament. A player can drop by themselves.
A Judge can drop a player if they note they have juse left.
To **disqualify** a player, use the [Sanction](#sanction) event.

```json
{
    "type": "DROP",
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
    "type": "SANCTION",
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
    "type": "UNSANCTION",
    "level": "WARNING",
    "player_uid": "238CD960-7E54-4A38-A676-8288A5700FC8"
}
```

#### Override
Judges can validate an odd table score.
For example, if they disqualify a player but do not award VPs to their predator,
the final table score will not appear valid until it's overridden.

Rounds and tables are counted starting from 1.

```json
{
    "type": "OVERRIDE",
    "round": 1,
    "table": 1,
    "comment": "Free form comment"
}
```

#### Unoverride

Remove an override for a table score.

```json
{
    "type": "Unoverride",
    "round": 1,
    "table": 1
}
```

#### SeedFinals

A finals is "seeded" first before players elect their seat in seed order.

```json
{
    "type": "SEED_FINALS",
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
    "type": "SEAT_FINALS",
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
    "type": "FINISH_TOURNAMENT",
}
```
