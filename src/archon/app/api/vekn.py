import fastapi
import typing

from .. import dependencies
from ... import geo
from ... import models


router = fastapi.APIRouter(
    prefix="/api/vekn",
    default_response_class=fastapi.responses.ORJSONResponse,
    tags=["vekn"],
)


@router.get("/country", summary="List all countries")
async def api_vekn_countries() -> list[models.Country]:
    """List all countries"""
    return sorted(geo.COUNTRIES_BY_NAME.values(), key=lambda c: c.country)


@router.get("/country/{country}/city", summary="List cities of given country")
async def api_vekn_country_cities(
    country: typing.Annotated[str, fastapi.Path()]
) -> list[models.City]:
    """List cities of given country.

    Only cities **over 15k population** are listed.
    Open-source information made availaible by [Geonames](https://geonames.org).

    - **country**: The country name, field `country` of `/api/countries`
    """
    if country not in geo.CITIES_BY_COUNTRY:
        raise fastapi.HTTPException(fastapi.status.HTTP_404_NOT_FOUND)
    return sorted(geo.CITIES_BY_COUNTRY[country].values(), key=lambda c: c.unique_name)


@router.post("/claim")
async def api_vekn_claim(
    vekn: typing.Annotated[str, fastapi.Query()],
    member_uid: dependencies.MemberUidFromToken,
    op: dependencies.DbOperator,
) -> dependencies.Token:
    new_member = await op.claim_vekn(member_uid, vekn)
    if new_member is None:
        raise fastapi.HTTPException(
            fastapi.status.HTTP_403_FORBIDDEN, detail="VEKN unknown or claimed already"
        )
    access_token = dependencies.create_access_token(new_member.uid)
    return dependencies.Token(access_token=access_token, token_type="Bearer")


@router.post("/abandon")
async def api_vekn_abandon(
    member_uid: dependencies.MemberUidFromToken, op: dependencies.DbOperator
) -> dependencies.Token:
    new_member = await op.abandon_vekn(member_uid)
    if new_member is None:
        raise fastapi.HTTPException(
            fastapi.status.HTTP_404_NOT_FOUND, detail="No VEKN token"
        )
    access_token = dependencies.create_access_token(new_member.uid)
    return dependencies.Token(access_token=access_token, token_type="Bearer")


@router.get("/members")
async def api_vekn_members(
    member_uid: dependencies.MemberUidFromToken, op: dependencies.DbOperator
) -> list[models.Member]:
    return await op.get_members()


@router.get("/members/{uid}")
async def api_vekn_member(
    member_uid: dependencies.MemberUidFromToken,
    op: dependencies.DbOperator,
    uid: typing.Annotated[str, fastapi.Path()],
) -> models.Member:
    ret = await op.get_member_with_ratings(uid)
    if not ret:
        raise fastapi.HTTPException(
            fastapi.status.HTTP_404_NOT_FOUND, detail="No VEKN token"
        )
    return ret


@router.post("/members")
async def api_vekn_add_member(
    posting_member: dependencies.MemberFromToken,
    op: dependencies.DbOperator,
    member: typing.Annotated[models.Member, fastapi.Body()],
) -> models.Member:
    # TODO: check posting_member is > prince
    if member.country:
        if member.country in geo.COUNTRIES_BY_NAME:
            country = geo.COUNTRIES_BY_NAME[member.country]
            member.country = country.country
            member.country_flag = country.flag
        else:
            member.country = ""
            member.country_flag = ""
    return await op.insert_member(member)
