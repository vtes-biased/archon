#!/usr/bin/env python3
import aiohttp
import asyncio
import dotenv
import logging
import os
import typer

from . import db
from . import models

dotenv.load_dotenv()
VEKN_LOGIN = os.getenv("VEKN_LOGIN", "")
VEKN_PASSWORD = os.getenv("VEKN_PASSWORD", "")

logger = logging.getLogger()

app = typer.Typer()


@app.command()
def reset_db():
    db.reset()


async def async_list() -> list[models.Tournament]:
    await db.POOL.open()
    async with db.operator() as op:
        tournaments = await op.get_tournaments()
        for tournament in tournaments:
            print(tournament)
    await db.POOL.close()


@app.command()
def list():
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
                                country=data["countryname"] or None,
                                state=data["statename"] or None,
                                city=data["city"] or None,
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
    asyncio.run(get_members())


if __name__ == "__main__":
    app()
