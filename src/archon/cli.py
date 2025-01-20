#!/usr/bin/env python3
import asyncio
import typer
import typing

from . import db
from . import models
from . import vekn


app = typer.Typer()


async def async_reset_db(keep_members):
    async with db.POOL:
        await db.reset(keep_members)
        await db.init()


@app.command()
def reset_db(
    confirm: typing.Annotated[bool, typer.Option(prompt=True)],
    keep_members: typing.Annotated[bool, typer.Option(prompt=True)],
):
    """⚠️  Reset the database ⚠️  Removes all data"""
    if confirm:
        asyncio.run(async_reset_db(keep_members))


async def async_list() -> list[models.Tournament]:
    await db.POOL.open()
    async with db.operator() as op:
        tournaments = await op.get_tournaments()
        for tournament in tournaments:
            print(tournament)
    await db.POOL.close()


@app.command()
def list():
    """List tournaments"""
    asyncio.run(async_list())


async def get_members() -> None:
    async with db.POOL:
        async with db.operator() as op:
            rankings = await vekn.get_rankings()
            prefixes_map = {}  # prefix owners
            async for members in vekn.get_members_batches():
                for member in members:
                    member.ranking = rankings.get(member.vekn, models.Ranking())
                # note insert members modifies the passed members list
                # after this call, all members have the right DB uid and data
                await op.insert_members(members)
                for member in members:
                    if member.prefix and len(member.prefix) == 3:
                        if member.prefix in prefixes_map:
                            assert prefixes_map[member.prefix].vekn == member.vekn
                        prefixes_map[member.prefix] = member
            for prefix, owner in prefixes_map.items():
                await op.set_sponsor_on_prefix(prefix, owner.uid)


@app.command()
def sync_members():
    """Update members from the vekn.net website"""
    asyncio.run(get_members())


async def db_purge() -> int:
    async with db.POOL:
        async with db.operator() as op:
            return await op.purge_tournament_events()


@app.command()
def purge():
    """Purge deprecated historical data"""
    count = asyncio.run(db_purge())
    print(f"{count} record{'s' if count > 1 else ''} deleted")


async def async_add_client(name: str):
    async with db.POOL:
        async with db.operator() as op:
            client_id = await op.create_client(models.Client(name))
            client_secret = await op.reset_client_secret(client_id)
            return client_id, client_secret


@app.command()
def add_client(name: typing.Annotated[str, typer.Option(prompt=True)]):
    """Add an authorized client to the platform"""
    client_id, client_secret = asyncio.run(async_add_client(name))
    print("Store the secret safely: if lost, it cannot be retrieved.")
    print(f'CLIENT_ID="{client_id}"')
    print(f'CLIENT_SECRET="{client_secret}"')


async def async_recompute_ratings():
    async with db.POOL:
        async with db.operator() as op:
            await op.recompute_all_ratings()


@app.command()
def recompute_ratings():
    """Recompute all tournament ratings"""
    asyncio.run(async_recompute_ratings())


if __name__ == "__main__":
    app()
