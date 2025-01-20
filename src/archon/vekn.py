import aiohttp
import dotenv
import logging
import os
import typing

from . import geo
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
        name=data["firstname"] + " " + data["lastname"],
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
                if players:
                    yield [_member_from_vekn_data(data) for data in players]
                # if some players we got them all, just increment the prefix directly
                if len(players) < 50:
                    prefix = increment(prefix)
                # if the API returns 50 players max, there might be more
                # we must increment slowly 10 by 10.
                else:
                    prefix = players[-1]["veknid"][:6]
                # VEKN api will return an empty list on a single-char prefix
                # make sure 59 -> 60 and not 6
                if prefix and len(prefix) < 2:
                    prefix += "0"


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
