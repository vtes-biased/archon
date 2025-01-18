import importlib
import orjson

from . import models


COUNTRIES_BY_NAME = {}
COUNTRIES_BY_ISO = {}
CITIES_BY_GEONAME_ID = {}
CITIES_BY_COUNTRY = {}


with importlib.resources.path("archon", "geodata") as geodata:
    with importlib.resources.as_file(geodata / "countries.json") as countries:
        COUNTRIES_BY_NAME = {
            d["country"]: models.Country(**d)
            for d in orjson.loads(countries.read_bytes())
        }
        COUNTRIES_BY_ISO = {c.iso: c for c in COUNTRIES_BY_NAME.values()}

    with importlib.resources.as_file(geodata / "cities.json") as cities:
        CITIES_BY_COUNTRY = {
            country: {name: models.City(**data) for name, data in cities.items()}
            for country, cities in orjson.loads(cities.read_bytes()).items()
        }
        CITIES_BY_GEONAME_ID = {
            c.geoname_id: c
            for cities in CITIES_BY_COUNTRY.values()
            for c in cities.values()
        }
