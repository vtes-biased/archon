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


async def db_purge() -> int:
    async with db.POOL:
        async with db.operator() as op:
            return await op.purge_tournament_events()


@app.command()
def purge() -> None:
    """Purge deprecated historical data"""
    count = asyncio.run(db_purge())
    print(f"{count} record{'s' if count > 1 else ''} deleted")


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
