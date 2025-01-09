#!/usr/bin/env python3
import aiohttp
import asyncio
import typer
import typing

from . import db
from . import models
from . import vekn


app = typer.Typer()


@app.command()
def reset_db(
    confirm: typing.Annotated[bool, typer.Option(prompt=True)],
    keep_members: typing.Annotated[bool, typer.Option(prompt=True)],
):
    """⚠️  Reset the database ⚠️  Removes all data"""
    if confirm:
        db.reset(keep_members)


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
            async for members in vekn.get_members_batches():
                for member in members:
                    member.ranking = rankings.get(member.vekn, models.Ranking())
                await op.insert_members(members)


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


if __name__ == "__main__":
    app()
