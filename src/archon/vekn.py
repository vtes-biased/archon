import aiohttp
import asyncio
import datetime
import dotenv
import enum
import logging
import os
import pydantic
import typing
import urllib.parse

from . import engine
from . import geo
from . import models
from . import scoring


dotenv.load_dotenv()
VEKN_LOGIN = os.getenv("VEKN_LOGIN", "")
VEKN_PASSWORD = os.getenv("VEKN_PASSWORD", "")
SITE_URL_BASE = os.getenv("SITE_URL_BASE", "http://127.0.0.1:8000")

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


ADMINS = {
    "3200340",
    "3200188",
    "8180022",
    "3190007",
    "2050001",
    "1002480",
}
JUDGES = {
    "8180022": models.MemberRole.JUDGE,
    "3200188": models.MemberRole.JUDGE,
    "3190007": models.MemberRole.JUDGE,
    "4200005": models.MemberRole.JUDGE,
    "8530107": models.MemberRole.JUDGE,
    "2340000": models.MemberRole.JUDGE,
    "6260014": models.MemberRole.JUDGE,
    "1940030": models.MemberRole.JUDGE,
    "1003731": models.MemberRole.JUDGE,
    "1003455": models.MemberRole.JUDGE,
    "3200340": models.MemberRole.JUDGE,
    "1003030": models.MemberRole.JUDGE,
    "3070069": models.MemberRole.JUDGE,
    "4960027": models.MemberRole.JUDGE,
    "2810001": models.MemberRole.JUDGE,
    "3190133": models.MemberRole.JUDGE,
    "3190041": models.MemberRole.JUDGE,
    "8030009": models.MemberRole.JUDGE,
    "9510021": models.MemberRole.JUDGE,
    "3370036": models.MemberRole.JUDGE,
    "1000629": models.MemberRole.JUDGE,
    "1002855": models.MemberRole.ANC_JUDGE,
    "3340152": models.MemberRole.ANC_JUDGE,
    "5360022": models.MemberRole.JUDGE,
    "8390001": models.MemberRole.NEO_JUDGE,
    "3070006": models.MemberRole.ANC_JUDGE,
    "4960046": models.MemberRole.NEO_JUDGE,
    "6140001": models.MemberRole.NEO_JUDGE,
    "3020044": models.MemberRole.ANC_JUDGE,
    "3020010": models.MemberRole.NEO_JUDGE,
    "1003584": models.MemberRole.ANC_JUDGE,
    "1003214": models.MemberRole.NEO_JUDGE,
    "4110004": models.MemberRole.ANC_JUDGE,
    "4110113": models.MemberRole.ANC_JUDGE,
    "4100033": models.MemberRole.ANC_JUDGE,
    "2331000": models.MemberRole.ANC_JUDGE,
    "3680057": models.MemberRole.ANC_JUDGE,
    "4100008": models.MemberRole.NEO_JUDGE,
    "3120101": models.MemberRole.ANC_JUDGE,
    "4960000": models.MemberRole.NEO_JUDGE,
    "3010501": models.MemberRole.NEO_JUDGE,
    "6060022": models.MemberRole.ANC_JUDGE,
    "5540005": models.MemberRole.NEO_JUDGE,
    "3530067": models.MemberRole.JUDGE,
}


FIX_CITIES = {
    "Argentina": {"BUenos Aires": "Buenos Aires", "Buenos Aries": "Buenos Aires"},
    "Austria": {
        "Vienna (Traiskirchen)": "Vienna",
        "Wien": "Vienna",
        "Wien/Vienna": "Vienna",
    },
    "Belgium": {
        "Antwerp": "Antwerpen",
        "Bruges": "Brugge",
        "Bruxelles": "Brussels",
        "Ghent": "Gent",
        "Lige": "Liège",
        "Liege": "Liège",
    },
    "Brazil": {
        "Brasilia": "Brasília",
        "Braslia": "Brasília",
        "Campinas": "Campinas, São Paulo",
        "Campogrande": "Campina Grande",
        "GUARULHOS": "Guarulhos",
        "Itajai": "Itajaí",
        "Imperatiz": "Imperatriz",
        "Petropolis": "Petrópolis",
        "Rio de Janerio": "Rio de Janeiro",
        "Rio de janeiro": "Rio de Janeiro",
        "Santo Andre": "Santo André",
        "Sao Bernardo do Campo": "São Bernardo do Campo",
        "São Luis": "São Luís",
        "São PAulo": "São Paulo",
        "So Paulo": "São Paulo",
        "Nova Iguaçú": "Nova Iguaçu",
        " São João de Meriti": "São João de Meriti",
    },
    "Canada": {
        "Edmaonton": "Edmonton",
        "Edmonton / St. Albert": "St. Albert",
        "Edmonton / Spruce Grove": "Spruce Grove",
        "Ednomton": "Edmonton",
        "Gibbons / Edmonton": "Edmonton",
        "Hull": "Gatineau",
        "Jonquiere": "Jonquière",
        "Levis": "Lévis",
        "Montral": "Montréal",
        "Montreal": "Montréal",
        "Niagara": "Niagara Falls",
        "Qubec City": "Québec",
        "Quebec": "Québec",
        "Scarborough": "Scarborough Village",
        "St. Albert / Edmonton": "St. Albert",
        "St Catherines": "St. Catharines",
        "St. Catherines": "St. Catharines",
        "St-Eustache": "Saint-Eustache",
        "St Eustache": "Saint-Eustache",
        "St. Hubert": "Saint-Hubert",
        "St-Jean-sur-Richelieu": "Saint-Jean-sur-Richelieu",
        "St-Jerome": "Saint-Jérôme",
        "St-Lazare": "Saint-Lazare",
    },
    "Chile": {
        "Entre Juegos, Santiago": "Santiago",
        "Magic Sur, Santiago": "Santiago",
        "Quilpue": "Quilpué",
        "Santiago de Chile": "Santiago",
        "Santiago (primogénito)": "Santiago",
        "TableCat Games / Rancagua": "Rancagua",
        "Valparaiso": "Valparaíso",
        "Vina del Mar": "Viña del Mar",
    },
    "Colombia": {"Bogota": "Bogotá", "Medellin": "Medellín"},
    "Czech Republic": {
        "Hradec Kralove": "Hradec Králové",
        "Hradec Krlov": "Hradec Králové",
        "Nachod": "Náchod",
        "Plzen": "Pilsen",
        "Slany": "Slaný",
        "Trutnov, Mal Svatoovice": "Trutnov",
        "Vsetin": "Vsetín",
    },
    "Denmark": {"Aarhus": "Århus", "Arhus": "Århus"},
    "Finland": {
        "Hyvinkää": "Hyvinge",
    },
    "France": {
        "Alès ": "Alès",
        "Alès / Aix en provence": "Alès",
        "Saint Dizier": "Saint-Dizier",
    },
    "Germany": {
        "Cologne": "Köln",
        "Dsseldorf": "Düsseldorf",
        "Duesseldorf": "Düsseldorf",
        "Frankfurt": "Frankfurt am Main",
        "Gttingen": "Göttingen",
        "Hanau": "Hanau am Main",
        "Ludwigshafen": "Ludwigshafen am Rhein",
        "Marburg": "Marburg an der Lahn",
        "Moerfelden": "Mörfelden-Walldorf",
        "Seeheim": "Seeheim-Jugenheim",
        "Sttutgart": "Stuttgart",
        "Stuttgart / Ludwigsburg": "Ludwigsburg",
    },
    "Greece": {
        "Athens, Attica": "Athens",
        "Athnes": "Athens",
        "Chania": "Chaniá",
        "Thessaloniki": "Thessaloníki",
        "Thessaoniki": "Thessaloníki",
    },
    "Hungary": {
        "debrecen": "Debrecen",
        "Debrechen": "Debrecen",
        "Godollo": "Gödöllő",
        "Kecskemet": "Kecskemét",
        "Salgotarjan": "Salgótarján",
        "Salgtarjn": "Salgótarján",
        "Szekesfehervar": "Székesfehérvár",
        "Nyiregyhaza": "Nyíregyháza",
        "Veszprem": "Veszprém",
    },
    "Iceland": {"Reykjavik": "Reykjavík"},
    "Israel": {"Bat-Yam": "Bat Yam", "Tel-Aviv": "Tel Aviv"},
    "Italy": {
        "Firenze": "Florence",
        "Reggio Emilia": "Reggio nell'Emilia",
        "Torino": "Turin",
        "Milano": "Milan",
        "Genova": "Genoa",
    },
    "Japan": {"Anjo": "Anjō", "Sendai": "Sendai, Miyagi"},
    "Mexico": {
        "Ciudad de México ": "Mexico City",
        "Ciudad de México": "Mexico City",
        "Durango": "Victoria de Durango",
        "Durango, Durango": "Victoria de Durango",
        "Guadalajara, jalisco": "Guadalajara",
        "Monterey, N.L.": "Monterrey",
        "Naucalpan": "Naucalpan de Juárez",
        "Neza": "Ciudad Nezahualcoyotl",
        "Nezahualcoyotl": "Ciudad Nezahualcoyotl",
        "Puebla": "Puebla City",
        "Puebla de Zaragoza": "Puebla City",
        "Toluca de Lerdo": "Toluca",
    },
    "Netherlands": {"Rotterdan": "Rotterdam"},
    "New Zealand": {"WELLINGTON": "Wellington"},
    "Panama": {"Panama": "Panamá"},
    "Philippines": {
        "Bacolod": "Bacolod City",
        "Caloocan": "Caloocan City",
        "Dasmarinas, Cavite": "Dasmariñas",
        "Las Pias": "Las Piñas",
        "Los Banos": "Los Baños",
        "Los Baos": "Los Baños",
        "Makati": "Makati City",
        "Marikina": "Marikina City",
        "Metro Manila": "Manila",
        "Parañaque City": "Paranaque City",
        "Quezon": "Quezon City",
        "Quezon City, Metro Manila": "Quezon City",
        "Taguig City": "Taguig",
    },
    "Poland": {
        "Aleksandrow Lodzki": "Aleksandrów Łódzki",
        "Bedzin": "Będzin",
        "Bialystok": "Białystok",
        "Białstok": "Białystok",
        "Bielsko Biała": "Bielsko-Biala",
        "Bielsko-Biała": "Bielsko-Biala",
        "Bielsko-Biaa": "Bielsko-Biala",
        "Boleawiec": "Bolesławiec",
        "Bolesawiec": "Bolesławiec",
        "Cracow": "Kraków",
        "Cracov": "Kraków",
        "Czstochowa": "Częstochowa",
        "Czestochowa": "Częstochowa",
        "Jelenia Gora": "Jelenia Góra",
        "Kędzierzyn Koźle": "Kędzierzyn-Koźle",
        "Krakow": "Kraków",
        "Lodz": "Łódź",
        "Lubon": "Luboń",
        "Nowa Sol": "Nowa Sól",
        "Poznan": "Poznań",
        "Swidnik": "Świdnik",
        "Szczezin": "Szczecin",
        "Wroclaw": "Wrocław",
    },
    "Portugal": {"Lisboa": "Lisbon", "Setubal": "Setúbal", "Setbal": "Setúbal"},
    "Russian Federation": {
        "Moskow": "Moscow",
        "Saint-Petersburg": "Saint Petersburg",
        "St. Peterburg": "Saint Petersburg",
    },
    "Solvakia": {"Banska Bystrica": "Banská Bystrica", "Kosice": "Košice"},
    "Spain": {
        "Barberá del Vallés": "Barberà del Vallès",
        "Barcellona": "Barcelona",
        "Barcelona ": "Barcelona",
        "Cádiz": "Cadiz",
        "Castellón de la Plana": "Castelló de la Plana",
        "Castellón": "Castelló de la Plana",
        "Córdoba ": "Córdoba",
        "Gerona": "Girona",
        "Hospitalet de Llobregat": "L'Hospitalet de Llobregat",
        "La Coruña": "A Coruña",
        "Las Palmas": "Las Palmas de Gran Canaria",
        "Las Palmas de Gran Canarias": "Las Palmas de Gran Canaria",
        "Lucena (Córdoba)": "Lucena",
        "Masnou": "el Masnou",
        "Mollet del Vallés": "Mollet del Vallès",
        "Palma de Mallorca": "Palma",
        "Rentería": "Errenteria",
        "San Pedro de Alcántara": "San Pedro",
        "San Sebastián": "San Sebastián de los Reyes",
        "Sant Cugat del Vallés": "Sant Cugat",
        "Sant Quirze del Vallés": "Sant Quirze del Vallès",
        "Santa Coloma de Gramanet": "Santa Coloma de Gramenet",
        "Villafranca de Córdoba": "Córdoba",
        "Vitoria": "Gasteiz / Vitoria",
    },
    "Sweden": {
        "Malmo": "Malmö",
        "Örnsköldsviks": "Örnsköldsvik",
        "Stockholm ": "Stockholm",
    },
    "Switzerland": {"Geneva": "Genève", "Zurich": "Zürich"},
    "Ukraine": {"Kiev": "Kyiv"},
    "United States": {
        "ABQ": "Albuquerque",
        "Albuqueruqe": "Albuquerque",
        "Cincinnatti": "Cincinnati",
        "Cinncinati": "Cincinnati",
        "denver": "Denver",
        "Indanapolis": "Indianapolis",
        "Las vegas": "Las Vegas",
        "Los Angelas": "Los Angeles",
        "Los Angleles": "Los Angeles",
        "Mililani": "Mililani Town",
        "New York": "New York City",
        "NYC": "New York City",
        "Palm Bay, FL": "Palm Bay",
        "San Fransisco": "San Francisco",
        "St. George": "Saint George",
        "St Louis": "St. Louis",
        "St. Paul": "Saint Paul",
        "St Paul": "Saint Paul",
        "Saint peters": "Saint Peters",
        "Washington": "Washington, District of Columbia",
        "Washington, D.C.": "Washington, District of Columbia",
    },
    "United Kingdom": {
        "Burton-On-Trent": "Burton upon Trent",
        "Burton-on-Trent": "Burton upon Trent",
        "Burton-on-trent": "Burton upon Trent",
        "Burton-onTrent": "Burton upon Trent",
        "Burton on Trent": "Burton upon Trent",
        "Kings Lynn": "King's Lynn",
        "Milton keynes": "Milton Keynes",
        "Newcastle": "Newcastle upon Tyne",
        "Newcastle-Upon-Tyne": "Newcastle upon Tyne",
        "Newcastle Upon-Tyne": "Newcastle upon Tyne",
        "Newcastle Upon Tyne": "Newcastle upon Tyne",
        "Newcastle upon tyne": "Newcastle upon Tyne",
        "Newport, South Wales": "Newport, Wales",
        "Notttingham": "Nottingham",
        "Shefield": "Sheffield",
        "St. Helens": "St Helens",
        "St. Neots": "Saint Neots",
    },
}


def _member_from_vekn_data(data: dict[str, str]) -> models.Member:
    if data["countryname"]:
        country = geo.COUNTRIES_BY_ISO[data["countrycode"]]
        if data["city"]:
            city = geo.CITIES_BY_COUNTRY[country.country].get(data["city"], None)
            if not city and data.get("statename", None):
                refined_name = ", ".join([data["city"], data["statename"]])
                city = geo.CITIES_BY_COUNTRY[country.country].get(refined_name, None)
            if not city:
                fix = FIX_CITIES.get(country.country, {})
                city = geo.CITIES_BY_COUNTRY[country.country].get(
                    fix.get(data["city"], data["city"]), None
                )
            if not city:
                LOG.warning(
                    'Did not find city "%s" in %s', data["city"], country.country
                )
        else:
            city = None
    else:
        country = None
        city = None

    roles = []
    prefix = ""
    if data["veknid"] in ADMINS:
        roles.append(models.MemberRole.ADMIN)
    if data.get("coordinatorid", None):
        roles.append(models.MemberRole.NC)
        prefix = data["coordinatorid"]
    if data.get("princeid", None):
        roles.append(models.MemberRole.PRINCE)
        prefix = prefix or data["princeid"]
    judge_role = JUDGES.get(data["veknid"], None)
    if judge_role:
        roles.append(judge_role)
    # TODO maybe keep track of the sponsor/recruit relationship
    # since we're dropping prince and nc prefixes
    return models.Member(
        vekn=data["veknid"],
        name=(data["firstname"] + " " + data["lastname"]).strip(),
        country=country.country if country else "",
        country_flag=country.flag if country else "",
        city=city.unique_name if city else "",
        roles=roles,
        prefix=prefix,
    )


async def get_members_batches() -> typing.AsyncIterator[list[models.Member]]:
    # a few players have a number starting with zero, so start there
    prefix = "00"
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
                LOG.warning("prefix: %s — %s", prefix, len(players))
                if players:
                    yield [_member_from_vekn_data(data) for data in players]
                # if < 100 players we got them all, just increment the prefix directly
                if len(players) < 100:
                    prefix = increment(prefix)
                # the API returns 100 players max, there might be more
                else:
                    LOG.warning("Last ID: %s", players[-1]["veknid"])
                    prefix = players[-1]["veknid"][:5]
                    if players[-1]["veknid"][-2:] == "99":
                        prefix = increment(prefix)
                # VEKN api will return an empty list on a single-char prefix
                # make sure 59 -> 60 and not 6
                if prefix and len(prefix) < 2:
                    prefix += "0"
                # VEKN api will (wrongly) return an empty list on a "99" prefix
                # because it adds one then pads... careful with the end condition
                if prefix and prefix == "9" * len(prefix) and len(prefix) < 7:
                    prefix += "0"


async def get_events(
    members: list[models.Member],
) -> typing.AsyncIterator[models.Tournament]:
    members = {m.vekn: m for m in members}
    async with aiohttp.ClientSession() as session:
        token = await get_token(session)
        # parallelize by batches of 10
        for num in range(0, 1400):
            tasks = []
            async with asyncio.TaskGroup() as tg:
                for digit in range(1, 10):
                    tasks.append(
                        tg.create_task(
                            get_event(session, token, 10 * num + digit, members)
                        )
                    )
            for digit, task in enumerate(tasks, 1):
                if not task.done() | task.cancelled():
                    continue
                exc = task.exception()
                if exc:
                    LOG.exception("Failed to retrieve event %s", 10 * num + digit)
                    continue
                res = task.result()
                if res:
                    yield res


async def get_event(
    session: aiohttp.ClientSession, token: str, num: int, members: list[models.Member]
) -> models.Tournament:
    async with session.get(
        f"https://www.vekn.net/api/vekn/event/{num}",
        headers={"Authorization": f"Bearer {token}"},
    ) as response:
        response.raise_for_status()
        result = await response.json()
        data = result["data"]["events"]
        if not data:
            LOG.warning("No data for event #%s: %s", num, result)
            return
        data = data[0]
        if data["players"]:
            LOG.debug("Event #%s: %s", num, data)
            return _tournament_from_vekn_data(data, members)


def _tournament_from_vekn_data(
    data: any, members: dict[str, models.Member]
) -> models.Tournament:
    try:
        fmt, rank = TOURNAMENT_TYPE_TO_FORMAT_RANK[int(data["eventtype_id"])]
    except KeyError:
        LOG.warning(
            "Error in event #%s - invalid event type: %s",
            data["event_id"],
            data["eventtype_id"],
        )
        fmt, rank = models.TournamentFormat.Limited, models.TournamentRank.BASIC
    if data["venue_country"] and data["venue_country"] in geo.COUNTRIES_BY_ISO:
        country = geo.COUNTRIES_BY_ISO[data["venue_country"]].country
    else:
        country = None
    start = " ".join([data["event_startdate"], data["event_starttime"]])
    try:
        start = datetime.datetime.fromisoformat(start)
    except ValueError:
        LOG.warning("Error in event #%s - invalid start: %s", data["event_id"], start)
        start = datetime.datetime.fromisoformat(data["event_startdate"])
    finish = " ".join([data["event_enddate"], data["event_endtime"]])
    try:
        finish = datetime.datetime.fromisoformat(finish)
    except ValueError:
        LOG.warning("Error in event #%s - invalid finish: %s", data["event_id"], finish)
        finish = datetime.datetime.fromisoformat(data["event_enddate"])
    if data["rounds"]:
        rounds = min(1, int(data["rounds"][0]))
    else:
        rounds = 1
    ret = models.Tournament(
        extra={"vekn_id": data["event_id"]},
        name=data["event_name"],
        format=fmt,
        start=start,
        finish=finish,
        timezone="UTC",
        rank=rank,
        country=country,
        venue=data["venue_name"] or "",
        online=bool(int(data["event_isonline"])),
        state=models.TournamentState.FINISHED,
        decklist_required=False,
        proxies=bool(rank == models.TournamentRank.BASIC),
    )
    for idx, pdata in enumerate(data["players"], 1):
        member = members.get(pdata["veknid"])
        if not member:
            continue
        try:
            result = scoring.Score(
                gw=int(pdata["gw"]) + (1 if pdata["pos"] == "1" else 0),
                vp=float(pdata["vp"]) + float(pdata["vpf"]),
                tp=int(pdata["tp"]),
            )
        except pydantic.ValidationError:
            LOG.warning(
                "Error in event #%s - invalid player result: %s",
                data["event_id"],
                pdata,
            )
            result = scoring.Score()
        player_rounds = rounds
        if pdata["dq"] != "0" or pdata["wd"] != "0":
            player_rounds = 0
        elif int(pdata["pos"]) < 6:
            player_rounds += 1
        ret.players[pdata["veknid"]] = models.Player(
            name=member.name,
            vekn=member.vekn,
            uid=member.uid,
            country=member.country,
            country_flag=member.country_flag,
            city=member.city,
            roles=member.roles,
            sponsor=member.sponsor,
            state=models.PlayerState.FINISHED,
            rounds_played=player_rounds,
            result=result,
            toss=int(pdata["tie"]),
        )
        if pdata["pos"] == "1":
            ret.winner = member.uid
        if pdata["dq"] != "0":
            ret.players[pdata["veknid"]].barriers.append(models.Barrier.DISQUALIFIED)
    return ret


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
        # keep the leading zeros
        return num[:-1] + str(int(num[-1]) + 1)
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


class TournamentType(enum.IntEnum):
    DEMO = 1
    STANDARD_CONSTRUCTED = 2
    LIMITED = 3
    MINI_QUALIFIER = 4
    CONTINENTAL_QUALIFIER = 5
    CONTINENTAL_CHAMPIONSHIP = 6
    NATIONAL_QUALIFIER = 7
    NATIONAL_CHAMPIONSHIP = 8
    STORYLINE = 9
    LAUNCH_EVENT = 10
    BUILD_YOUR_OWN_STORYLINE = 11
    UNSANCTIONED_TOURNAMENT = 12
    LIMITED_NATIONAL_CHAMPIONSHIP = 13
    LIMITED_CONTINENTAL_CHAMPIONSHIP = 14


TOURNAMENT_TYPE_TO_FORMAT_RANK = {
    TournamentType.DEMO: (models.TournamentFormat.Limited, models.TournamentRank.BASIC),
    TournamentType.STANDARD_CONSTRUCTED: (
        models.TournamentFormat.Standard,
        models.TournamentRank.BASIC,
    ),
    TournamentType.LIMITED: (
        models.TournamentFormat.Limited,
        models.TournamentRank.BASIC,
    ),
    TournamentType.MINI_QUALIFIER: (
        models.TournamentFormat.Standard,
        models.TournamentRank.BASIC,
    ),
    TournamentType.CONTINENTAL_QUALIFIER: (
        models.TournamentFormat.Standard,
        models.TournamentRank.GP,
    ),
    TournamentType.CONTINENTAL_CHAMPIONSHIP: (
        models.TournamentFormat.Standard,
        models.TournamentRank.CC,
    ),
    TournamentType.NATIONAL_QUALIFIER: (
        models.TournamentFormat.Standard,
        models.TournamentRank.BASIC,
    ),
    TournamentType.NATIONAL_CHAMPIONSHIP: (
        models.TournamentFormat.Standard,
        models.TournamentRank.NC,
    ),
    TournamentType.STORYLINE: (
        models.TournamentFormat.Limited,
        models.TournamentRank.BASIC,
    ),
    TournamentType.LAUNCH_EVENT: (
        models.TournamentFormat.Limited,
        models.TournamentRank.BASIC,
    ),
    TournamentType.BUILD_YOUR_OWN_STORYLINE: (
        models.TournamentFormat.Limited,
        models.TournamentRank.BASIC,
    ),
    TournamentType.UNSANCTIONED_TOURNAMENT: (
        models.TournamentFormat.Limited,
        models.TournamentRank.BASIC,
    ),
    TournamentType.LIMITED_NATIONAL_CHAMPIONSHIP: (
        models.TournamentFormat.Limited,
        models.TournamentRank.BASIC,
    ),
    TournamentType.LIMITED_CONTINENTAL_CHAMPIONSHIP: (
        models.TournamentFormat.Limited,
        models.TournamentRank.BASIC,
    ),
}


async def upload_tournament(tournament: models.Tournament, rounds: int) -> None:
    type = TournamentType.UNSANCTIONED_TOURNAMENT
    match (tournament.format, tournament.rank):
        case (models.TournamentFormat.Draft, _):
            TournamentType.LIMITED
        case (models.TournamentFormat.Limited, _):
            TournamentType.LIMITED
        case (
            models.TournamentFormat.Standard,
            models.TournamentRank.BASIC,
        ):
            type = TournamentType.STANDARD_CONSTRUCTED
        case (
            models.TournamentFormat.Standard,
            models.TournamentRank.NC,
        ):
            type = TournamentType.NATIONAL_CHAMPIONSHIP
        case (
            models.TournamentFormat.Standard,
            models.TournamentRank.GP,
        ):
            type = TournamentType.CONTINENTAL_QUALIFIER
        case (
            models.TournamentFormat.Standard,
            models.TournamentRank.CC,
        ):
            type = TournamentType.CONTINENTAL_CHAMPIONSHIP
    start = tournament.start.astimezone(tz=datetime.timezone.utc)
    if tournament.finish:
        finish = tournament.finish.astimezone(tz=datetime.timezone.utc)
    else:
        finish = start + datetime.timedelta(hours=6)
    try:
        async with aiohttp.ClientSession() as session:
            token = await get_token(session)
            data = aiohttp.FormData(
                {
                    "name": tournament.name[:120],
                    "type": type,
                    "venueid": 0 if tournament.online else 3800,
                    "online": int(tournament.online),
                    "startdate": start.date().isoformat(),
                    "starttime": f"{start:%H:%M}",
                    "enddate": finish.date().isoformat(),
                    "endtime": f"{finish:%H:%M}",
                    "timelimit": "2h",
                    "rounds": rounds,
                    "final": True,
                    "multideck": tournament.multideck,
                    "proxies": tournament.proxies,
                    "website": urllib.parse.urljoin(
                        SITE_URL_BASE, f"/tournament/{tournament.uid}/display.html"
                    ),
                    "description": tournament.description[:1000],
                }
            )
            event_id = None
            async with session.post(
                "https://www.vekn.net/api/vekn/event",
                headers={"Authorization": f"Bearer {token}"},
                data=data,
            ) as response:
                response.raise_for_status()
                result = await response.json()
                LOG.warning("VEKN answered: %s", result)
                if result["data"]["code"] != 200:
                    raise RuntimeError(
                        f"VEKN error: {result["data"].get("message", "Unknown error")}"
                    )
                event_id = result["data"]["id"]
                tournament.extra["vekn_id"] = event_id
    except aiohttp.ClientError:
        LOG.exception("VEKN Upload failed")
        raise


async def upload_tournament_result(
    tournament: models.Tournament, token: str | None = None
) -> None:
    try:
        async with aiohttp.ClientSession() as session:
            if not token:
                token = await get_token(session)
            async with session.post(
                f"https://www.vekn.net/api/vekn/archon/{tournament.extra["vekn_id"]}",
                headers={"Authorization": f"Bearer {token}"},
                data=aiohttp.FormData({"archondata": to_archondata(tournament)}),
            ) as response:
                response.raise_for_status()
                result = await response.json()
                LOG.warning("VEKN Archon answered: %s", result)
                if result["data"]["code"] != 200:
                    raise RuntimeError(
                        f"VEKN error: {result["data"].get("message", "Unknown error")}"
                    )
                tournament.extra["vekn_submitted"] = True
    except aiohttp.ClientError:
        LOG.exception("VEKN Upload failed")
        raise


def to_archondata(tournament: models.Tournament) -> str:
    ret = f"{len(tournament.rounds)}¤"
    if tournament.state != models.TournamentState.FINISHED or not tournament.rounds:
        raise ValueError("Invalid tournament")
    ratings = engine.ratings(tournament)
    finals_table = {s.player_uid: s for s in tournament.rounds[-1].tables[0].seating}
    for rank, player in engine.standings(tournament):
        first, last = (
            player.name.split(" ", 1) if " " in player.name else (player.name, "")
        )
        if player.uid in finals_table:
            final_vp = finals_table[player.uid].result.vp
        else:
            final_vp = 0
        ret += (
            f"{rank}§{first}§{last}§{player.city}§{player.vekn}§{player.result.gw}§{player.result.vp}§{final_vp}"
            f"§{player.result.tp}§{player.toss}§{ratings[player.uid].rating_points}§"
        )
    return ret
