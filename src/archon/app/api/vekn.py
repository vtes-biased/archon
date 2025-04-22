import dataclasses
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
    country: typing.Annotated[str, fastapi.Path()],
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
    param: typing.Annotated[models.VeknParameter, fastapi.Body()],
    member_uid: dependencies.MemberUidFromToken,
    op: dependencies.DbOperator,
) -> dependencies.Token:
    new_member = await op.claim_vekn(member_uid, param.vekn)
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
    member: dependencies.PersonFromToken, op: dependencies.DbOperator
) -> list[models.Person]:
    if member.vekn:
        return await op.get_members()
    else:
        return await op.get_externally_visible_members(member)


@router.get("/members/{uid}")
async def api_vekn_member(
    member: dependencies.PersonFromToken,
    op: dependencies.DbOperator,
    uid: typing.Annotated[str, fastapi.Path()],
) -> models.Member:
    ret = await op.get_member(uid)
    if member.uid != uid and not member.vekn:
        dependencies.check_can_contact(member, ret)
    if not ret:
        raise fastapi.HTTPException(
            fastapi.status.HTTP_404_NOT_FOUND, detail="No VEKN token"
        )
    return ret


@router.post("/members")
async def api_vekn_add_member(
    posting_member: dependencies.PersonFromToken,
    op: dependencies.DbOperator,
    member: typing.Annotated[models.Member, fastapi.Body()],
) -> models.Member:
    dependencies.check_organizer(posting_member)
    if member.country:
        if member.country in geo.COUNTRIES_BY_NAME:
            country = geo.COUNTRIES_BY_NAME[member.country]
            member.country = country.country
            member.country_flag = country.flag
        else:
            member.country = ""
            member.country_flag = ""
    city = None
    if member.country and member.city:
        city = geo.CITIES_BY_COUNTRY[member.country].get(member.city, None)
    if city:
        member.city = city.unique_name
    else:
        member.city = ""
    return await op.insert_member(member)


@router.post("/members/password")
async def api_vekn_set_member_password(
    member: dependencies.MemberFromToken,
    op: dependencies.DbOperator,
    password: typing.Annotated[models.PasswordParameter, fastapi.Body()],
) -> models.Member:
    dependencies.set_member_password(member, password.password)
    return await op.update_member(member)


@router.post("/members/unlink_discord")
async def api_vekn_unlink_discord(
    member: dependencies.MemberFromToken,
    op: dependencies.DbOperator,
) -> models.Member:
    member.discord = None
    return await op.update_member(member)


@router.post("/members/{uid}/add_role")
async def api_vekn_member_add_role(
    member: dependencies.PersonFromToken,
    op: dependencies.DbOperator,
    uid: typing.Annotated[str, fastapi.Path()],
    param: typing.Annotated[models.RoleParameter, fastapi.Body()],
) -> models.Member:
    target = await op.get_member(uid, True)
    dependencies.check_can_change_role(member, target, param.role)
    target.roles = list(set(target.roles) | {param.role})
    return await op.update_member(target)


@router.post("/members/{uid}/remove_role")
async def api_vekn_member_remove_role(
    member: dependencies.PersonFromToken,
    op: dependencies.DbOperator,
    uid: typing.Annotated[str, fastapi.Path()],
    param: typing.Annotated[models.RoleParameter, fastapi.Body()],
) -> models.Member:
    target = await op.get_member(uid, True)
    dependencies.check_can_change_role(member, target, param.role)
    target.roles = list(set(target.roles) - {param.role})
    return await op.update_member(target)


@router.post("/members/{uid}/sponsor")
async def api_vekn_member_sponsor(
    member: dependencies.PersonFromToken,
    op: dependencies.DbOperator,
    uid: typing.Annotated[str, fastapi.Path()],
) -> models.Member:
    dependencies.check_organizer(member)
    target = await op.get_member(uid, True)
    target.sponsor = member.uid
    return await op.update_member_new_vekn(target)


@router.post("/members/{uid}/vekn")
async def api_vekn_member_assign_vekn(
    member: dependencies.PersonFromToken,
    op: dependencies.DbOperator,
    uid: typing.Annotated[str, fastapi.Path()],
    param: typing.Annotated[models.VeknParameter, fastapi.Body()],
) -> models.Member:
    target = await op.get_member(uid, True)
    dependencies.check_can_change_vekn(member, target)
    target.sponsor = member.uid
    return await op.claim_vekn(target.uid, param.vekn)


@router.delete("/members/{uid}/vekn")
async def api_vekn_member_delete_vekn(
    member: dependencies.PersonFromToken,
    op: dependencies.DbOperator,
    uid: typing.Annotated[str, fastapi.Path()],
) -> models.Member:
    target = await op.get_member(uid, True)
    dependencies.check_can_change_vekn(member, target)
    return await op.abandon_vekn(target.uid)


@router.post("/members/{uid}/info")
async def api_vekn_member_info(
    member: dependencies.PersonFromToken,
    op: dependencies.DbOperator,
    uid: typing.Annotated[str, fastapi.Path()],
    info: typing.Annotated[models.MemberInfo, fastapi.Body()],
) -> models.Member:
    target = await op.get_member(uid, True)
    dependencies.check_can_change_info(member, target)
    for field in dataclasses.fields(info):
        value = getattr(info, field.name)
        if value is None:
            continue
        setattr(target, field.name, value)
    return await op.update_member(target)


@router.post("/members/{uid}/sanction")
async def api_vekn_member_sanction(
    member: dependencies.PersonFromToken,
    op: dependencies.DbOperator,
    uid: typing.Annotated[str, fastapi.Path()],
    sanction: typing.Annotated[models.RegisteredSanction, fastapi.Body()],
) -> models.Member:
    dependencies.check_can_sanction(member)
    sanction.judge_uid = member.uid
    target = await op.get_member(uid, True)
    if sanction.tournament:
        # for now, tournament sanctions should be delivered through tournament events
        raise fastapi.HTTPException(fastapi.status.HTTP_400_BAD_REQUEST)
    target.sanctions.append(sanction)
    return await op.update_member(target)


@router.delete("/members/{uid}/sanction/{sanction_uid}")
async def api_vekn_member_sanction_delete(
    member: dependencies.PersonFromToken,
    op: dependencies.DbOperator,
    uid: typing.Annotated[str, fastapi.Path()],
    sanction_uid: typing.Annotated[str, fastapi.Path()],
) -> models.Member:
    dependencies.check_can_sanction(member)
    target = await op.get_member(uid, True)
    if not any(s.uid == sanction_uid for s in target.sanctions):
        raise fastapi.HTTPException(fastapi.status.HTTP_404_NOT_FOUND)
    target.sanctions = [s for s in target.sanctions if s.uid != sanction_uid]
    return await op.update_member(target)
