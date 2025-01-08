#!/usr/bin/env python3
import aiohttp
import asyncio
import dotenv
import logging
import os
import typer
import typing

from . import db
from . import models

dotenv.load_dotenv()
VEKN_LOGIN = os.getenv("VEKN_LOGIN", "")
VEKN_PASSWORD = os.getenv("VEKN_PASSWORD", "")

logger = logging.getLogger()

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


async def get_vekn_token() -> str:
    async with aiohttp.ClientSession() as session:
        async with session.post(
            "https://www.vekn.net/api/vekn/login",
            data={"username": VEKN_LOGIN, "password": VEKN_PASSWORD},
        ) as response:
            try:
                result = await response.json()
                return result["data"]["auth"]
            except KeyError:
                logger.exception("VEKN authentication failure")


def increment(num: str) -> str:
    while num and num[-1] == "9":
        num = num[:-1]
    if num:
        return str(int(num) + 1)
    return None


async def get_members() -> None:
    token = await get_vekn_token()
    prefix = "1"
    async with aiohttp.ClientSession() as session, db.POOL:
        while prefix:
            async with (
                session.get(
                    f"https://www.vekn.net/api/vekn/registry?filter={prefix}",
                    headers={"Authorization": f"Bearer {token}"},
                ) as response,
                db.operator() as op,
            ):
                result = await response.json()
                players = result["data"]["players"]
                if players:
                    await op.insert_members(
                        [
                            models.Member(
                                vekn=data["veknid"],
                                name=data["firstname"] + " " + data["lastname"],
                                country=data["countryname"] or "",
                                state=data["statename"] or "",
                                city=data["city"] or "",
                            )
                            for data in players
                        ]
                    )
                if len(players) < 50:
                    prefix = increment(prefix)
                else:
                    prefix = players[-1]["veknid"][:6]


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
