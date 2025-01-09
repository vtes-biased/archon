import aiohttp
import datetime
import dotenv
import logging
import os
import typing

from . import models


dotenv.load_dotenv()
VEKN_LOGIN = os.getenv("VEKN_LOGIN", "")
VEKN_PASSWORD = os.getenv("VEKN_PASSWORD", "")

LOG = logging.getLogger()


async def get_token(session: aiohttp.ClientSession) -> str:
    async with session.post(
        "https://www.vekn.net/api/vekn/login",
        data={"username": VEKN_LOGIN, "password": VEKN_PASSWORD},
    ) as response:
        try:
            result = await response.json()
            return result["data"]["auth"]
        except KeyError:
            LOG.exception("VEKN authentication failure")
            raise


# TODO: clean this using iso codes (vekn API improvement)
COUNTRY_FIX = {
    "Czech Republic": "Czechia",
    "Netherlands": "The Netherlands",
    "Russian Federation": "Russia",
}


async def get_members_batches() -> typing.AsyncIterator[list[models.Member]]:
    prefix = "1"
    async with aiohttp.ClientSession() as session:
        token = await get_token(session)
        while prefix:
            async with session.get(
                f"https://www.vekn.net/api/vekn/registry?filter={prefix}",
                headers={"Authorization": f"Bearer {token}"},
            ) as response:
                response.raise_for_status()
                result = await response.json()
                players = result["data"]["players"]
                if players:
                    yield [
                        models.Member(
                            vekn=data["veknid"],
                            name=data["firstname"] + " " + data["lastname"],
                            country=COUNTRY_FIX.get(
                                data["countryname"], data["countryname"]
                            )
                            or "",
                            state=data["statename"] or "",
                            city=data["city"] or "",
                        )
                        for data in players
                    ]
                # if the API returns 50 players, there might be more
                # so, increment the prefix if not
                if len(players) < 50:
                    prefix = increment(prefix)
                # but go 10 by 10 otherwise (sadly the api does not return 100 entries)
                else:
                    prefix = players[-1]["veknid"][:6]


def increment(num: str) -> str:
    """Increment a numeric prefix. Used to query all members from the VEKN API.

    3012 -> 3013
    3019 -> 302
    ...
    38 -> 39
    39 -> 4
    ...
    98 -> 99
    99 -> None
    """
    while num and num[-1] == "9":
        num = num[:-1]
    if num:
        return str(int(num) + 1)
    return None


async def get_rankings() -> dict[str, models.Ranking]:
    try:
        async with aiohttp.ClientSession() as session:
            token = await get_token(session)
            async with session.get(
                f"https://www.vekn.net/api/vekn/ranking",
                headers={"Authorization": f"Bearer {token}"},
            ) as response:
                response.raise_for_status()
                result = await response.json()
                ranking = result["data"]["players"][:1000]
    except aiohttp.ClientError:
        LOG.exception("Ranking unavailable")
        ranking = []
    return {
        player["veknid"]: models.Ranking(
            constructed_onsite=int(player.pop("rtp_constructed")),
            limited_onsite=int(player.pop("rtp_limited")),
        )
        for player in ranking
    }
