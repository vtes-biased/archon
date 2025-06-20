import aiohttp
import asyncio
import dataclasses
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


class NoVEKN(RuntimeError):
    """Raised when VEKN is not configured or the login/password are not set."""


async def get_token(session: aiohttp.ClientSession) -> str:
    # http POST https://www.vekn.net/api/vekn/login -f username=<USER> password=<PWD>
    async with session.post(
        "https://www.vekn.net/api/vekn/login",
        data={"username": VEKN_LOGIN, "password": VEKN_PASSWORD},
    ) as response:
        try:
            result = await response.json()
            return result["data"]["auth"]
        except KeyError:
            LOG.exception("VEKN authentication failure")
            raise NoVEKN()


ADMINS = {
    "3200340",
    "3200188",
    "8180022",
    "3190007",
    "2050001",
    "1002480",
}
JUDGES = {
    "8180022": models.MemberRole.RULEMONGER,
    "3200188": models.MemberRole.RULEMONGER,
    "3190007": models.MemberRole.JUDGE,
    "4200005": models.MemberRole.RULEMONGER,
    "8530107": models.MemberRole.JUDGE,
    "2340000": models.MemberRole.JUDGE,
    "6260014": models.MemberRole.JUDGE,
    "1940030": models.MemberRole.JUDGE,
    "1003731": models.MemberRole.JUDGE,
    "1003455": models.MemberRole.RULEMONGER,
    "3200340": models.MemberRole.RULEMONGER,
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
    "1002855": models.MemberRole.JUDGEKIN,
    "3340152": models.MemberRole.JUDGEKIN,
    "5360022": models.MemberRole.JUDGE,
    "8390001": models.MemberRole.JUDGEKIN,
    "3070006": models.MemberRole.JUDGEKIN,
    "4960046": models.MemberRole.JUDGEKIN,
    "6140001": models.MemberRole.JUDGEKIN,
    "3020044": models.MemberRole.JUDGEKIN,
    "3020010": models.MemberRole.JUDGEKIN,
    "1003584": models.MemberRole.JUDGEKIN,
    "1003214": models.MemberRole.JUDGEKIN,
    "4110004": models.MemberRole.JUDGEKIN,
    "4110113": models.MemberRole.JUDGEKIN,
    "4100033": models.MemberRole.JUDGEKIN,
    "2331000": models.MemberRole.JUDGEKIN,
    "3680057": models.MemberRole.JUDGEKIN,
    "4100008": models.MemberRole.JUDGEKIN,
    "3120101": models.MemberRole.JUDGEKIN,
    "4960000": models.MemberRole.JUDGEKIN,
    "3010501": models.MemberRole.JUDGEKIN,
    "6060022": models.MemberRole.JUDGEKIN,
    "5540005": models.MemberRole.JUDGEKIN,
    "3530067": models.MemberRole.JUDGE,
}


FIX_CITIES = {
    "Argentina": {"BUenos Aires": "Buenos Aires", "Buenos Aries": "Buenos Aires"},
    "Australia": {
        "Blacktown": "Sydney",
        "Castle Hill": "Sydney",
        "Hobart (Rosny)": "Hobart",
        "Hobart, Tasmania": "Hobart",
        "Penrith": "Sydney",
        "Queanbeyan": "Canberra",
        "Ravenhall": "Melbourne",
        "Sydney (Inner City)": "Sydney",
        "Tenambit": "Maitland",
    },
    "Austria": {
        "Danube city (Vienna)": "Vienna",
        "Marchtrenk": "Linz",
        "Thalheim": "Linz",
        "Traiskirchen": "Vienna",
        "Vienna (Traiskirchen)": "Vienna",
        "Wien": "Vienna",
        "Wien/Vienna": "Vienna",
    },
    "Belarus": {
        "Gomel": "Homyel",
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
        "Canoas / Porto Alegre": "Canoas",
        "GUARULHOS": "Guarulhos",
        "Itajai": "Itajaí",
        "Imperatiz": "Imperatriz",
        "Nova Iguaçú": "Nova Iguaçu",
        "Olaria": "Rio de Janeiro",
        "Petropolis": "Petrópolis",
        "Rio De Janerio": "Rio de Janeiro",
        "Rio de Janerio": "Rio de Janeiro",
        "Rio de janeiro": "Rio de Janeiro",
        "Santo Andre": "Santo André",
        "Sao Bernardo do Campo": "São Bernardo do Campo",
        "São Luis": "São Luís",
        "São PAulo": "São Paulo",
        "So Paulo": "São Paulo",
        "Taguatinga": "Brasília",
        "Vitória / Vila Velha / Grande Vitória": "Vitória",
        "Vitria": "Vitória",
    },
    "Canada": {
        "Edmaonton": "Edmonton",
        "Edmonton / St. Albert": "St. Albert",
        "Edmonton / Spruce Grove": "Spruce Grove",
        "Ednomton": "Edmonton",
        "Gibbons / Edmonton": "Edmonton",
        "Hull": "Gatineau",
        "Jonquiere": "Saguenay",
        "Jonquière": "Saguenay",
        "Levis": "Lévis",
        "Marie Ville": "Montréal",
        "Marieville": "Montréal",
        "Montral": "Montréal",
        "Montreal": "Montréal",
        "Niagara": "Niagara Falls",
        "Qubec City": "Québec",
        "Qubec": "Québec",
        "Quebec": "Québec",
        "Scarborough": "Scarborough Village",
        "St. Albert / Edmonton": "St. Albert",
        "St Catharines": "Sainte-Catherine, Quebec, Montérégie",
        "St Catherines": "Sainte-Catherine, Quebec, Montérégie",
        "St. Catherines": "Sainte-Catherine, Quebec, Montérégie",
        "St-Eustache": "Saint-Eustache",
        "St Eustache": "Saint-Eustache",
        "St. Hubert": "Longueuil",
        "Saint-Hubert": "Longueuil",
        "St-Jean-sur-Richelieu": "Saint-Jean-sur-Richelieu",
        "St-Jerome": "Saint-Jérôme",
        "St-Lazare": "Saint-Lazare",
    },
    "Chile": {
        "Concepcin": "Concepción",
        "Concepcion": "Concepción",
        "Entre Juegos, Santiago": "Santiago",
        "Magic Sur, Santiago": "Santiago",
        "Maip": "Santiago",
        "Quilpue": "Quilpué",
        "Santiago de Chile": "Santiago",
        "Santiago (primogénito)": "Santiago",
        "TableCat Games / Rancagua": "Rancagua",
        "Valparaiso": "Valparaíso",
        "Vina del Mar": "Viña del Mar",
    },
    "Colombia": {"Bogata": "Bogotá", "Bogota": "Bogotá", "Medellin": "Medellín"},
    "Czech Republic": {
        "Brmo": "Brno",
        "Hradec Kralove": "Hradec Králové",
        "Hradec Krlov": "Hradec Králové",
        "Nachod": "Náchod",
        "Plzen": "Pilsen",
        "Praha": "Prague",
        "Slany": "Slaný",
        "Trutnov, Mal Svatoovice": "Trutnov",
        "Vsetin": "Vsetín",
        "Zlin": "Zlín",
    },
    "Denmark": {"Aarhus": "Århus", "Arhus": "Århus"},
    "Finland": {
        "Hyvinkää": "Hyvinge",
        "Kuusankoski": "Kouvola",
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
        "Madgeburg": "Magdeburg",
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
        "Erdőkertes": "Budapest",
        "Godollo": "Gödöllő",
        "Kaposvar": "Kaposvár",
        "Kecskemet": "Kecskemét",
        "Kismaros": "Budapest",
        "Nyiregyhaza": "Nyíregyháza",
        "Pecs": "Pécs",
        "Salgotarjan": "Salgótarján",
        "Salgtarjn": "Salgótarján",
        "Szekesfehervar": "Székesfehérvár",
        "Szkesfehrvr": "Székesfehérvár",
        "Trnok": "Budapest",
        "Veszprem": "Veszprém",
        "Veszprm": "Veszprém",
    },
    "Iceland": {"Reykjavik": "Reykjavík", "Reykjaví­k": "Reykjavík"},
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
        "Distrito Federal": "Mexico City",
        "Durango": "Victoria de Durango",
        "Durango, Durango": "Victoria de Durango",
        "Guadalajara, jalisco": "Guadalajara",
        "Monterey, N.L.": "Monterrey",
        "Naucalpan": "Naucalpan de Juárez",
        "Neza": "Ciudad Nezahualcoyotl",
        "Nezahualcoyotl": "Ciudad Nezahualcoyotl",
        "Nezahualcóyotl": "Ciudad Nezahualcoyotl",
        "Puebla": "Puebla, Puebla",
        "Puebla de Zaragoza": "Puebla, Puebla",
        "Queretaro": "Santiago de Querétaro",
        "Toluca de Lerdo": "Toluca",
        "Toluca De Lerdo": "Toluca",
    },
    "Netherlands": {
        "Houten": "Utrecht",
        "Krommenie": "Zaanstad",
        "Rotterdan": "Rotterdam",
    },
    "New Zealand": {"WELLINGTON": "Wellington", "Plamerston North": "Palmerston North"},
    "Norway": {"Fjellhamar": "Oslo"},
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
        "Quezon city": "Quezon City",
        "Quezon City, Metro Manila": "Quezon City",
        "Taguig City": "Taguig",
        "Tondo, Manila": "Manila",
    },
    "Poland": {
        "Aleksandrow Lodzki": "Aleksandrów Łódzki",
        "Andrespol": "Łódź",
        "Bedzin": "Będzin",
        "Bialystok": "Białystok",
        "Białstok": "Białystok",
        "Bielsko Biaa": "Bielsko-Biala",
        "Bielsko Biała": "Bielsko-Biala",
        "Bielsko-Biała": "Bielsko-Biala",
        "Bielsko-Biaa": "Bielsko-Biala",
        "Boleawiec": "Bolesławiec",
        "Bolesawiec": "Bolesławiec",
        "Cracow": "Kraków",
        "Cracov": "Kraków",
        "Czstochowa": "Częstochowa",
        "Czestochowa": "Częstochowa",
        "Hajnowka": "Hajnówka",
        "Jelenia Gora": "Jelenia Góra",
        "Kędzierzyn Koźle": "Kędzierzyn-Koźle",
        "Krakw": "Kraków",
        "Krakow": "Kraków",
        "Kraszew": "Łódź",
        "Lodz": "Łódź",
        "Lubon": "Luboń",
        "Nowa Sol": "Nowa Sól",
        "Poznan": "Poznań",
        "Swidnik": "Świdnik",
        "Szczezin": "Szczecin",
        "Toru": "Toruń",
        "Torun": "Toruń",
        "Wroclaw": "Wrocław",
    },
    "Portugal": {"Lisboa": "Lisbon", "Setubal": "Setúbal", "Setbal": "Setúbal"},
    "Russian Federation": {
        "Moskow": "Moscow",
        "Saint-Petersburg": "Saint Petersburg",
        "St. Peterburg": "Saint Petersburg",
    },
    "Slovakia": {
        "Banska Bystrica": "Banská Bystrica",
        "Godollo": "Gödöllő",
        "Kosice": "Košice",
    },
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
        "Madirid": "Madrid",
        "Masnou": "El Masnou",
        "Mollet del Vallés": "Mollet del Vallès",
        "Palma de Mallorca": "Palma",
        "Rentería": "Errenteria",
        "San Pedro de Alcántara": "Marbella",
        "San Sebastián": "San Sebastián de los Reyes",
        "Sant Cugat del Vallés": "Sant Cugat",
        "Sant Quirze del Vallés": "Sant Quirze del Vallès",
        "Santa Coloma de Gramanet": "Santa Coloma de Gramenet",
        "Sóller": "Palma",
        "Villafranca de Córdoba": "Córdoba",
        "Vitoria": "Gasteiz / Vitoria",
        "Vitoria-Gasteiz": "Gasteiz / Vitoria",
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
        "Ealing": "London",
        "Flint, Wales": "Liverpool",
        "Kings Lynn": "King's Lynn",
        "Milton keynes": "Milton Keynes",
        "Newcastle": "Newcastle upon Tyne",
        "Newcastle-Upon-Tyne": "Newcastle upon Tyne",
        "Newcastle Upon-Tyne": "Newcastle upon Tyne",
        "Newcastle Upon Tyne": "Newcastle upon Tyne",
        "Newcastle upon tyne": "Newcastle upon Tyne",
        "Newport, South Wales": "Newport, Wales",
        "Northhampton": "Northampton",
        "Notttingham": "Nottingham",
        "Rochester, Kent": "Rochester",
        "Shefield": "Sheffield",
        "St. Albans": "St Albans",
        "St. Andrews": "Saint Andrews",
        "St. Helens": "St Helens",
        "St. Neots": "Saint Neots",
    },
}


def _member_from_vekn_data(data: dict[str, str]) -> models.Member:
    if data["countryname"]:
        country = geo.COUNTRIES_BY_ISO[data["countrycode"]]
        if data["city"]:
            data_city = data["city"].strip()
            city = geo.CITIES_BY_COUNTRY[country.country].get(data_city, None)
            if not city and data.get("statename", None):
                refined_name = ", ".join([data_city, data["statename"]])
                city = geo.CITIES_BY_COUNTRY[country.country].get(refined_name, None)
            if not city:
                fix = FIX_CITIES.get(country.country, {})
                city = geo.CITIES_BY_COUNTRY[country.country].get(
                    fix.get(data_city, data_city), None
                )
            if not city:
                LOG.info('Did not find city "%s" in %s', data_city, country.country)
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
            # http GET "https://www.vekn.net/api/vekn/registry"
            # "Authorization: Bearer <TOKEN>"
            # filter=<PREFIX>
            async with session.get(
                f"https://www.vekn.net/api/vekn/registry?filter={prefix}",
                headers={"Authorization": f"Bearer {token}"},
            ) as response:
                response.raise_for_status()
                result = await response.json()
                players = result["data"]["players"]
                LOG.debug("prefix: %s — %s", prefix, len(players))
                if players:
                    yield [_member_from_vekn_data(data) for data in players]
                # if < 100 players we got them all, just increment the prefix directly
                if len(players) < 100:
                    prefix = increment(prefix)
                # the API returns 100 players max, there might be more
                else:
                    LOG.debug("Last ID: %s", players[-1]["veknid"])
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
                del players
                del result


async def get_events_parallel(
    members: dict[str, models.Person],
) -> typing.AsyncIterator[models.Tournament]:
    async with aiohttp.ClientSession() as session:
        token = await get_token(session)
        # parallelize by batches of 10
        for num in range(0, 1400):
            tasks = []
            async with asyncio.TaskGroup() as tg:
                for digit in range(0, 10):
                    event_id = 10 * num + digit
                    # skip zero
                    if not event_id:
                        continue
                    tasks.append(
                        tg.create_task(get_event(session, token, event_id, members))
                    )
            for digit, task in enumerate(tasks, 1):
                if not task.done() | task.cancelled():
                    continue
                exc = task.exception()
                if exc:
                    LOG.exception("Failed to retrieve event %s", event_id)
                    continue
                res = task.result()
                if res:
                    yield res
            del tasks


async def get_events_serial(
    members: dict[str, models.Person],
) -> typing.AsyncIterator[models.Tournament]:
    async with aiohttp.ClientSession() as session:
        token = await get_token(session)
        for event_id in range(1, 14000):
            res = await get_event(session, token, event_id, members)
            if res:
                yield res


async def get_event(
    session: aiohttp.ClientSession,
    token: str,
    num: int,
    members: dict[str, models.Person],
) -> models.Tournament | None:
    data = None
    # http GET "https://www.vekn.net/api/vekn/event/<NUM>"
    # "Authorization: Bearer <TOKEN>"
    async with session.get(
        f"https://www.vekn.net/api/vekn/event/{num}",
        headers={"Authorization": f"Bearer {token}"},
    ) as response:
        response.raise_for_status()
        result = await response.json()
        data = result["data"]["events"]
    if not data:
        LOG.info("No data for event #%s: %s", num, result)
        return
    data = data[0]
    ret = None
    if data["players"]:
        LOG.debug("Event #%s: %s", num, data)
        venue_data = {}
        if data["venue_id"]:
            venue_data = await get_venue(session, token, data["venue_id"])
        ret = _tournament_from_vekn_data(data, members, venue_data)
    elif (
        datetime.datetime.fromisoformat(data["event_startdate"]).date()
        > datetime.date.today()
    ):
        LOG.info("Incoming Event #%s: %s", num, data)
        venue_data = {}
        if data["venue_id"]:
            venue_data = await get_venue(session, token, data["venue_id"])
        ret = _tournament_from_vekn_data(data, members, venue_data)
    del data
    del result
    return ret


async def get_venue(
    session: aiohttp.ClientSession, token: str, venue_id: str
) -> dict[str, str]:
    data = None
    # http GET "https://www.vekn.net/api/vekn/venue/<ID>"
    # "Authorization: Bearer <TOKEN>"
    async with session.get(
        f"https://www.vekn.net/api/vekn/venue/{venue_id}",
        headers={"Authorization": f"Bearer {token}"},
    ) as response:
        response.raise_for_status()
        result = await response.json()
    data = result["data"]["venues"]
    if not data:
        LOG.warning("No data for venue #%s: %s", venue_id, result)
        return {}
    data = data[0]
    if not data:
        LOG.warning("No data for venue #%s: %s", venue_id, result)
        return {}
    return data


def _tournament_from_vekn_data(
    data: any, members: dict[str, models.Person], venue_data: dict[str, str]
) -> models.Tournament:
    try:
        fmt, rank = TOURNAMENT_TYPE_TO_FORMAT_RANK[int(data["eventtype_id"])]
    except KeyError:
        LOG.warning(
            "Error in event #%s - unknown event type: %s",
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
        LOG.info("Error in event #%s - invalid start: %s", data["event_id"], start)
        start = datetime.datetime.fromisoformat(data["event_startdate"])
    finish = " ".join([data["event_enddate"], data["event_endtime"]])
    try:
        finish = datetime.datetime.fromisoformat(finish)
    except ValueError:
        LOG.info("Error in event #%s - invalid finish: %s", data["event_id"], finish)
        finish = datetime.datetime.fromisoformat(data["event_enddate"])
    if data["rounds"]:
        rounds = min(1, int(data["rounds"][0]))
    else:
        rounds = 1
    judges = []
    person = members.get(data["organizer_veknid"])
    if person:
        judges = [models.PublicPerson(**dataclasses.asdict(person))]
    address = venue_data.get("address") or ""
    if address and venue_data.get("city"):
        address += f", {venue_data['city']}"
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
        address=address,
        venue_url=venue_data.get("website") or "",
        online=bool(int(data["event_isonline"])),
        state=models.TournamentState.FINISHED,
        decklist_required=False,
        proxies=bool(rank == models.TournamentRank.BASIC),
        judges=judges,
    )
    if not data["players"]:
        ret.state = models.TournamentState.REGISTRATION
        return ret
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
        # mark 1 round played for DQ, not 0
        # because no-shows are simply not listed in the vekn.net archon
        # in VEKN archon, DQ or WD only happens if at least a round was played
        # so the player counts in the participants count
        # this matters for the ratings of finalists
        if pdata["dq"] != "0" or pdata["wd"] != "0":
            player_rounds = 1
        elif int(pdata["pos"]) < 6:
            player_rounds += 1
            # seeds matter for standings
            ret.finals_seeds.append(member.uid)
        ret.players[member.uid] = models.Player(
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
            ret.players[member.uid].barriers.append(models.Barrier.DISQUALIFIED)
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


async def get_rankings() -> dict[str, dict[models.RankingCategoy, int]]:
    """Unused now, kept for reference."""
    try:
        async with aiohttp.ClientSession() as session:
            token = await get_token(session)
            # http GET "https://www.vekn.net/api/vekn/ranking"
            # "Authorization: Bearer <TOKEN>"
            async with session.get(
                "https://www.vekn.net/api/vekn/ranking",
                headers={"Authorization": f"Bearer {token}"},
            ) as response:
                response.raise_for_status()
                result = await response.json()
                ranking = result["data"]["players"][:1000]
                del result
    except aiohttp.ClientError:
        LOG.exception("Ranking unavailable")
        ranking = []
    return {
        player["veknid"]: {
            models.RankingCategoy.CONSTRUCTED_ONSITE: int(
                player.pop("rtp_constructed")
            ),
            models.RankingCategoy.LIMITED_ONSITE: int(player.pop("rtp_limited")),
        }
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
    GRAND_PRIX = 15


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
    TournamentType.GRAND_PRIX: (
        models.TournamentFormat.Standard,
        models.TournamentRank.GP,
    ),
}


async def upload_tournament(
    tournament: models.Tournament, rounds: int, user_vekn: str
) -> None:
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
        finish = start + datetime.timedelta(minutes=1)
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
            # http POST https://www.vekn.net/api/vekn/event
            # "Authorization: Bearer <TOKEN>"
            # "Vekn-Id: <USER_VEKN>"
            # -f name=<NAME> type=<TYPE> <...>
            async with session.post(
                "https://www.vekn.net/api/vekn/event",
                headers={"Authorization": f"Bearer {token}", "Vekn-Id": user_vekn},
                data=data,
            ) as response:
                response.raise_for_status()
                result = await response.json()
                LOG.info("VEKN answered: %s", result)
                if result["data"]["code"] != 200:
                    raise RuntimeError(
                        f"VEKN error: {result['data'].get('message', 'Unknown error')}"
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
            # http POST https://www.vekn.net/api/vekn/archon
            # "Authorization: Bearer <TOKEN>"
            # -f archondata=<ARCHON_STRING>
            async with session.post(
                f"https://www.vekn.net/api/vekn/archon/{tournament.extra['vekn_id']}",
                headers={"Authorization": f"Bearer {token}"},
                data=aiohttp.FormData({"archondata": to_archondata(tournament)}),
            ) as response:
                response.raise_for_status()
                result = await response.json()
                LOG.info("VEKN Archon answered: %s", result)
                if result["data"]["code"] != 200:
                    raise RuntimeError(
                        f"VEKN error: {result['data'].get('message', 'Unknown error')}"
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


async def create_member(member: models.Member) -> None:
    try:
        first, last = member.name.split(" ", 1)
    except ValueError:
        first = member.name
        last = "N/A"
    async with aiohttp.ClientSession() as session:
        token = await get_token(session)
        async with session.post(
            "https://www.vekn.net/api/vekn/registry",
            headers={"Authorization": f"Bearer {token}"},
            params={
                "veknid": member.vekn,
                "firstname": first,
                "lastname": last,
                "email": member.email or f"{first}@example.com",
                "country": member.country,
                "state": "",
                "city": member.city or "N/A",
            },
        ) as response:
            response.raise_for_status()
            result = await response.json()
            result = result["data"]
            if result["code"] != 200:
                raise RuntimeError(f"Failed to create member on vekn.net: {result}")
