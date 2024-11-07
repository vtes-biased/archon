#!/usr/bin/env python3
import asyncio
import typer

from . import db
from . import models


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


if __name__ == "__main__":
    app()
