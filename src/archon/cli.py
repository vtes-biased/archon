#!/usr/bin/env python3
import asyncio
import logging
import os
import typer
import typing

from . import db
from . import models
from . import vekn


app = typer.Typer()
LOG = logging.getLogger()


async def async_reset_db(keep_members) -> None:
    async with db.POOL:
        await db.reset(keep_members)
        await db.init()


@app.command()
def reset_db(
    confirm: typing.Annotated[bool, typer.Option(prompt=True)],
    keep_members: typing.Annotated[bool, typer.Option(prompt=True)],
) -> None:
    """⚠️  Reset the database ⚠️  Removes all data"""
    if confirm:
        asyncio.run(async_reset_db(keep_members))


async def async_list() -> None:
    await db.POOL.open()
    async with db.operator() as op:
        tournaments = await op.get_tournaments()
        for tournament in tournaments:
            print(tournament)
    await db.POOL.close()


@app.command()
def list() -> None:
    """List tournaments"""
    asyncio.run(async_list())


async def get_members() -> None:
    async with db.POOL:
        async with db.operator(autocommit=True) as op:
            prefixes_map = {}  # prefix owners
            count = 0
            async for members in vekn.get_members_batches():
                # note insert members modifies the passed members list
                # after this call, all members have the right DB uid and data
                async with op.conn.transaction():
                    await op.insert_members(members)
                for member in members:
                    if member.prefix and len(member.prefix) == 3:
                        prefixes_map[member.prefix] = member.uid
                    count += 1
                    if not count % 100:
                        print(f" {count}", end="\r", flush=True)
                del members
            print("Set sponsors...")
            for prefix, uid in prefixes_map.items():
                async with op.conn.transaction():
                    await op.set_sponsor_on_prefix(prefix, uid)
            del prefixes_map
            print(f"\rDone, {count} members synced")


@app.command()
def sync_members() -> None:
    """Update members from the vekn.net website"""
    asyncio.run(get_members())


async def get_events() -> None:
    async with db.POOL:
        async with db.operator(autocommit=True) as op:
            members = await op.get_members_vekn_dict()
            count = 0
            async for event in vekn.get_events_parallel(members):
                async with op.conn.transaction():
                    await op.upsert_vekn_tournament(event)
                del event
                count += 1
                if not count % 10:
                    print(f" {count}", end="\r", flush=True)
            print(f"\rDone, {count} events synced")


@app.command()
def sync_events() -> None:
    """Update historical tournaments from the vekn.net website"""
    asyncio.run(get_events())


async def db_purge() -> tuple[int, int]:
    async with db.POOL:
        async with db.operator() as op:
            events_count = await op.purge_tournament_events()
            tournaments_count = await op.close_old_tournaments()
            return events_count, tournaments_count


@app.command()
def purge() -> None:
    """Purge deprecated historical data and close old tournaments"""
    events_count, tournaments_count = asyncio.run(db_purge())
    print(f"{events_count} event record", f"{'s' if events_count != 1 else ''} deleted")
    print(
        f"{tournaments_count} tournament{'s' if tournaments_count != 1 else ''} closed"
    )


async def async_add_client(name: str) -> tuple[str, str]:
    async with db.POOL:
        async with db.operator() as op:
            client_id = await op.create_client(models.Client(name))
            client_secret = await op.reset_client_secret(client_id)
            return client_id, client_secret


@app.command()
def add_client(name: typing.Annotated[str, typer.Option(prompt=True)]) -> None:
    """Add an authorized client to the platform"""
    client_id, client_secret = asyncio.run(async_add_client(name))
    print("Store the secret safely: if lost, it cannot be retrieved.")
    print(f'CLIENT_ID="{client_id}"')
    print(f'CLIENT_SECRET="{client_secret}"')


async def async_recompute_ratings() -> None:
    async with db.POOL:
        async with db.operator(autocommit=True) as op:
            await op.recompute_all_ratings()


@app.command()
def recompute_ratings() -> None:
    """Recompute all tournament ratings"""
    asyncio.run(async_recompute_ratings())


async def async_push_vekn() -> None:
    """Push Archon-created members and tournaments to vekn.net."""
    async with db.POOL:
        async with db.operator(autocommit=True) as op:
            # First: push members created by Archon
            # Get the ceiling: any Archon-created VEKN must be below this
            ceiling = await op.get_next_vekn()
            print(f"Next VEKN to be assigned: {ceiling}")
            print(f"Checking for Archon-created members in range [1000000, {ceiling})")

            # Get potential Archon members from our DB
            potential_members = await op.get_potential_archon_members(ceiling)
            print(f"Found {len(potential_members)} potential members in DB")

            if potential_members:
                # Query vekn.net to see which already exist
                print("Querying vekn.net for existing members...")
                existing_on_vekn = await vekn.get_existing_vekns_in_range(ceiling)
                print(f"Found {len(existing_on_vekn)} members already on vekn.net")

                # Filter to only members that don't exist on vekn.net
                members_to_push = [
                    m for m in potential_members if m.vekn not in existing_on_vekn
                ]
                print(f"Members to push: {len(members_to_push)}")

                for member in members_to_push:
                    try:
                        await vekn.create_member(member)
                        print(f"Pushed member {member.name} (VEKN: {member.vekn})")
                    except Exception as e:
                        print(f"Failed to push member {member.name}: {e}")

            # Second: push tournaments finished in Archon but not submitted to VEKN
            tournaments_to_push = await op.get_tournaments_to_push()
            print(f"Found {len(tournaments_to_push)} tournaments to push to VEKN")

            for tournament in tournaments_to_push:
                try:
                    # Need organizer VEKN to create event
                    if not tournament.judges:
                        print(f"Tournament {tournament.name} has no judges, skipping")
                        continue
                    organizer_vekn = tournament.judges[0].vekn
                    if not organizer_vekn:
                        print(
                            f"Tournament {tournament.name} organizer has no VEKN, "
                            "skipping"
                        )
                        continue
                    # Check all players have VEKN (required for archon upload)
                    players_without_vekn = [
                        p.name for p in tournament.players.values() if not p.vekn
                    ]
                    if players_without_vekn:
                        print(
                            f"Tournament {tournament.name} has players without VEKN: "
                            f"{players_without_vekn}, skipping"
                        )
                        continue

                    rounds = len(tournament.rounds)
                    # Create event on vekn.net if not already
                    if not tournament.extra.get("vekn_id"):
                        await vekn.upload_tournament(tournament, rounds, organizer_vekn)
                        print(
                            f"Created VEKN event {tournament.extra.get('vekn_id')} "
                            f"for {tournament.name}"
                        )
                    # Upload results
                    await vekn.upload_tournament_result(tournament)
                    print(f"Pushed tournament results: {tournament.name}")
                    # Save the updated tournament (vekn_id and vekn_submitted flags)
                    async with op.conn.transaction():
                        await op.update_tournament(tournament)
                except Exception as e:
                    print(f"Failed to push tournament {tournament.name}: {e}")


@app.command()
def push_vekn() -> None:
    """Push Archon-created members and tournaments to vekn.net"""
    asyncio.run(async_push_vekn())


if __name__ == "__main__":
    handler = logging.StreamHandler()
    LOG.addHandler(handler)
    if os.getenv("DEBUG"):
        LOG.setLevel(logging.DEBUG)
        handler.setLevel(logging.DEBUG)
    else:
        LOG.setLevel(logging.INFO)
        handler.setLevel(logging.INFO)
    app()
