#!/usr/bin/env python3
import csv
import io
import orjson
import logging
import pathlib
import urllib.request
import zipfile

logger = logging.getLogger()

# Continents
# AF : Africa			geonameId=6255146
# AS : Asia			geonameId=6255147
# EU : Europe			geonameId=6255148
# NA : North America		geonameId=6255149
# OC : Oceania			geonameId=6255151
# SA : South America		geonameId=6255150
# AN : Antarctica			geonameId=6255152

# Feature classes:
# see http://www.geonames.org/export/codes.html
# A: country, state, region,...
# H: stream, lake, ...
# L: parks,area, ...
# P: city, village,...
# R: road, railroad
# S: spot, building, farm
# T: mountain,hill,rock,...
# U: undersea
# V: forest,heath,...


COUNTRYNAME_FIXES = {
    "Czechia": "Czech Republic",
    "The Netherlands": "Netherlands",
    "Russia": "Russian Federation",
}


def geonames() -> None:
    """Fetch countries and first order cities from geonames.org, save as JSON"""
    print("generating geographical data...")
    path = pathlib.Path("src/archon")
    local_filename, _headers = urllib.request.urlretrieve(
        "https://download.geonames.org/export/dump/admin1CodesASCII.txt"
    )
    buffer = io.StringIO()
    with open(local_filename) as f:
        for line in f.readlines():
            if line[:1] == "#":
                continue
            buffer.write(line)
    buffer.seek(0)
    data = list(
        csv.DictReader(
            buffer,
            delimiter="\t",
            fieldnames=[
                "code",  # ISO-3166 alpha-2 country code <dot> admin_1 - eg. "US.IN"
                "name",  # Name
                "name_ascii",  # ASCII Name
                "geoname_id",  # numerical unique ID
            ],
        )
    )
    admin_1 = {}
    for record in data:
        country, admin_code = record["code"].split(".", 1)
        admin_1.setdefault(country, {})
        admin_1[country][admin_code] = record["name"]

    local_filename, _headers = urllib.request.urlretrieve(
        "https://download.geonames.org/export/dump/admin2Codes.txt"
    )
    buffer = io.StringIO()
    with open(local_filename) as f:
        for line in f.readlines():
            if line[:1] == "#":
                continue
            buffer.write(line)
    buffer.seek(0)
    data = list(
        csv.DictReader(
            buffer,
            delimiter="\t",
            fieldnames=[
                "code",  # country alpha-2 <dot> admin_1 <dot> admin_2 - eg. "US.IN.021"
                "name",  # Name
                "name_ascii",  # ASCII Name
                "geoname_id",  # numerical unique ID
            ],
        )
    )
    admin_2 = {}
    for record in data:
        country, adm1, adm2 = record["code"].split(".", 2)
        admin_2.setdefault(country, {})
        admin_2[country].setdefault(adm1, {})
        admin_2[country][adm1][adm2] = record["name"]

    local_filename, _headers = urllib.request.urlretrieve(
        "https://download.geonames.org/export/dump/countryInfo.txt"
    )
    buffer = io.StringIO()
    with open(local_filename) as f:
        for line in f.readlines():
            if line[:1] == "#":
                continue
            buffer.write(line)
    buffer.seek(0)
    countries = list(
        csv.DictReader(
            buffer,
            delimiter="\t",
            fieldnames=[
                "iso",  # ISO-3166 alpha-2 country code
                "iso3",  # ISO-3166 alpha-3 country code
                "iso_numeric",  # ISO-3166 numeric country code
                "fips",  # FIPS 2-letters code
                "country",  # Country name
                "capital",  # Capital name
                "area",  # Area (square meters)
                "population",  # Population
                "continent",  # Continent 2-letters code (cf. top-level comment)
                "tld",  # Internet Top-Level Domain, including the dot
                "currency_code",  # ISO 4217 alpha-3 currency code
                "currency_name",  # Currency name
                "phone",  # Phone prefix
                "postal_code_format",  # Postal code fmt ('#' for digit, '@' for char)
                "postal_code_regex",  # Perl/Python regular expression
                "languages",  # list of IETF language tags
                "geoname_id",  # integer id of record in geonames database
                "neighbours",  # Neighbouring countries
                "equivalent_fips_code",  # Mainly empty
            ],
        )
    )
    for country in countries:
        try:
            country["country"] = COUNTRYNAME_FIXES.get(
                country["country"], country["country"]
            )
            country["languages"] = country["languages"].split(",")
            country.pop("neighbours", None)
            country["geoname_id"] = int(country.get("geoname_id") or 0) or None
            country.pop("population", None)
            country.pop("area", None)
            country.pop("postal_code_format", None)
            country.pop("neighbours", None)
            country.pop("equivalent_fips_code", None)
            logger.info(country)
        except (KeyError, ValueError):
            logger.exception(f"Failed to parse country: {country}")
    countries_dict = {c["iso"]: c for c in countries}
    with open(path / "geodata" / "countries.json", mode="wb") as fp:
        fp.write(orjson.dumps(countries, option=orjson.OPT_APPEND_NEWLINE))
    local_filename, _headers = urllib.request.urlretrieve(
        "https://download.geonames.org/export/dump/cities15000.zip"
    )
    z = zipfile.ZipFile(local_filename)
    cities = list(
        csv.DictReader(
            io.TextIOWrapper(z.open("cities15000.txt")),
            delimiter="\t",
            fieldnames=[
                "geoname_id",  # integer id of record in geonames database
                "name",  # name of geographical point (utf8) varchar(200)
                "ascii_name",  # name of geographical point in plain ascii characters
                "alternate_names",  # alternate ascii names automatically transliterated
                "latitude",  # latitude in decimal degrees (wgs84)
                "longitude",  # longitude in decimal degrees (wgs84)
                "feature_class",  # see http://www.geonames.org/export/codes.html
                "feature_code",  # see http://www.geonames.org/export/codes.html
                "country_code",  # ISO-3166 alpha-2 country code, 2 characters
                "cc2",  # alternate countries, comma-separated ISO alpha-2 country codes
                "admin1_code",  # fipscode (subject to change to iso code)
                "admin2_code",  # code for the second administrative division
                "admin3_code",  # code for third level administrative division
                "admin4_code",  # code for fourth level administrative division
                "population",  # integer
                "elevation",  # in meters, integer
                "dem",  # digital elevation model, srtm3 or gtopo30, integer
                "timezone",  # iana timezone id
                "modification_date",  # date of last modification in ISO format
            ],
        )
    )
    filtered_cities = []
    for city in cities:
        # ignore city subdivisions
        if city["feature_code"] in {"PPLX", "PPLA5"}:
            continue
        city["geoname_id"] = int(city["geoname_id"])
        city["latitude"] = float(city["latitude"])
        city["longitude"] = float(city["longitude"])
        city["cc2"] = city["cc2"].split(",") if city.get("cc2", None) else []
        city["country_name"] = countries_dict[city["country_code"]]["country"]
        try:
            city["admin1"] = admin_1[city["country_code"]][city["admin1_code"]]
        except KeyError:
            logger.info(
                "Unnamed admin1 level: %s",
                f"{city['country_code']}.{city['admin1_code']}",
            )
            if city["admin1_code"] == "00":
                city["admin1"] = ""
            else:
                city["admin1"] = city["admin1_code"]
        try:
            city["admin2"] = admin_2[city["country_code"]][city["admin1_code"]][
                city["admin2_code"]
            ]
        except KeyError:
            logger.info(
                "Unnamed admin2 level: %s",
                f"{city['country_code']}.{city['admin1_code']}.{city['admin2_code']}",
            )
            if city["admin2_code"] == "00":
                city["admin2"] = ""
            else:
                city["admin2"] = city["admin2_code"]
        city.pop("admin1_code", None)
        city.pop("admin2_code", None)
        city.pop("admin3_code", None)
        city.pop("admin4_code", None)
        city.pop("population", None)
        city.pop("elevation", None)
        city.pop("dem", None)
        city.pop("alternate_names", None)
        filtered_cities.append(city)
    with open(path / "geodata" / "cities.json", mode="wb") as fp:
        fp.write(orjson.dumps(filtered_cities, option=orjson.OPT_APPEND_NEWLINE))


if __name__ == "__main__":
    geonames()
