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
    member_uid: dependencies.MemberUidFromToken, op: dependencies.DbOperator
) -> list[models.Member]:
    return await op.get_members()


@router.get("/members/{uid}")
async def api_vekn_member(
    member_uid: dependencies.MemberUidFromToken,
    op: dependencies.DbOperator,
    uid: typing.Annotated[str, fastapi.Path()],
) -> models.Member:
    ret = await op.get_member(uid)
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
    if member.country and member.city:
        member.city = geo.CITIES_BY_COUNTRY[member.country].get(member.city, "")
    else:
        member.city = ""
    return await op.insert_member(member)


def _check_can_change_role(
    member: models.Member, target: models.Member, role: models.MemberRole
) -> None:
    initiator_roles = set(member.roles)
    match role:
        case (
            models.MemberRole.ADMIN
            | models.MemberRole.JUDGE
            | models.MemberRole.ANC_JUDGE
            | models.MemberRole.NEO_JUDGE
            | models.MemberRole.ETHICS
            | models.MemberRole.NC
            | models.MemberRole.PTC
        ):
            if models.MemberRole.ADMIN not in initiator_roles:
                raise fastapi.HTTPException(fastapi.status.HTTP_403_FORBIDDEN)
        case models.MemberRole.PRINCE:
            if models.MemberRole.ADMIN in initiator_roles:
                return
            elif (
                models.MemberRole.NC in initiator_roles
                and member.country == target.country
            ):
                return
            else:
                raise fastapi.HTTPException(fastapi.status.HTTP_403_FORBIDDEN)
        case models.MemberRole.PLAYTESTER:
            if models.MemberRole.ADMIN in initiator_roles:
                return
            elif models.MemberRole.PTC in initiator_roles:
                return
            else:
                raise fastapi.HTTPException(fastapi.status.HTTP_403_FORBIDDEN)


def _check_organizer(member: models.Member) -> None:
    if not set(member.roles) & {
        models.MemberRole.ADMIN,
        models.MemberRole.NC,
        models.MemberRole.PRINCE,
    }:
        raise fastapi.HTTPException(fastapi.status.HTTP_403_FORBIDDEN)


def _check_can_change_info(member: models.Member, target: models.Member):
    # one can always modify oneself
    if member.uid == target.uid:
        return
    member_roles = set(member.roles)
    # admin can modify anything
    if models.MemberRole.ADMIN in member_roles:
        return
    target_roles = set(target.roles)
    # noone except admins can modify admin and NC
    if target_roles & {models.MemberRole.ADMIN, models.MemberRole.NC}:
        raise fastapi.HTTPException(fastapi.status.HTTP_403_FORBIDDEN)
    # only their NC can modify a Prince, PTC or Ethics Committee member
    if target_roles & {
        models.MemberRole.PRINCE,
        models.MemberRole.PTC,
        models.MemberRole.ETHICS,
    }:
        if models.MemberRole.NC in member_roles and member.country == target.country:
            return
        raise fastapi.HTTPException(fastapi.status.HTTP_403_FORBIDDEN)
    # NC, PTC and Ethic Committee members can modify anyone else
    # Note we do not country limit: NCs need to be able to change players country
    # PTC might need it if language or coordinator make the fields list at some point
    # Ethics Comittee member might need it for data protection or something
    if member_roles & {
        models.MemberRole.NC,
        models.MemberRole.PTC,
        models.MemberRole.ETHICS,
    }:
        return
    # Otherwise, only a Prince from the same country can modify the info
    if member.country == target.country and models.MemberRole.PRINCE in member_roles:
        return
    raise fastapi.HTTPException(fastapi.status.HTTP_403_FORBIDDEN)


def _check_can_sanction(member: models.Member):
    member_roles = set(member.roles)
    if member_roles & {
        models.MemberRole.ADMIN,
        models.MemberRole.JUDGE,
        models.MemberRole.ETHICS,
    }:
        return
    raise fastapi.HTTPException(fastapi.status.HTTP_403_FORBIDDEN)


def _check_can_change_vekn(member: models.Member, target: models.Member):
    if member.uid == target.uid:
        return
    member_roles = set(member.roles)
    if models.MemberRole.ADMIN in member_roles:
        return
    if models.MemberRole.NC in member_roles and member.country == target.country:
        return
    raise fastapi.HTTPException(fastapi.status.HTTP_403_FORBIDDEN)


@router.post("/members/{uid}/add_role")
async def api_vekn_member_add_role(
    member: dependencies.MemberFromToken,
    op: dependencies.DbOperator,
    uid: typing.Annotated[str, fastapi.Path()],
    param: typing.Annotated[models.RoleParameter, fastapi.Body()],
) -> models.Member:
    target = await op.get_member(uid, True)
    _check_can_change_role(member, target, param.role)
    target.roles = list(set(target.roles) | {param.role})
    return await op.update_member(target)


@router.post("/members/{uid}/remove_role")
async def api_vekn_member_remove_role(
    member: dependencies.MemberFromToken,
    op: dependencies.DbOperator,
    uid: typing.Annotated[str, fastapi.Path()],
    param: typing.Annotated[models.RoleParameter, fastapi.Body()],
) -> models.Member:
    target = await op.get_member(uid, True)
    _check_can_change_role(member, target, param.role)
    target.roles = list(set(target.roles) - {param.role})
    return await op.update_member(target)


@router.post("/members/{uid}/sponsor")
async def api_vekn_member_sponsor(
    member: dependencies.MemberFromToken,
    op: dependencies.DbOperator,
    uid: typing.Annotated[str, fastapi.Path()],
) -> models.Member:
    _check_organizer(member)
    target = await op.get_member(uid, True)
    target.sponsor = member.uid
    return await op.update_member_new_vekn(target)


@router.post("/members/{uid}/vekn")
async def api_vekn_member_assign_vekn(
    member: dependencies.MemberFromToken,
    op: dependencies.DbOperator,
    uid: typing.Annotated[str, fastapi.Path()],
    param: typing.Annotated[models.VeknParameter, fastapi.Body()],
) -> models.Member:
    target = await op.get_member(uid, True)
    _check_can_change_vekn(member, target)
    target.sponsor = member.uid
    return await op.claim_vekn(target.uid, param.vekn)


@router.delete("/members/{uid}/vekn")
async def api_vekn_member_delete_vekn(
    member: dependencies.MemberFromToken,
    op: dependencies.DbOperator,
    uid: typing.Annotated[str, fastapi.Path()],
) -> models.Member:
    target = await op.get_member(uid, True)
    _check_can_change_vekn(member, target)
    return await op.abandon_vekn(target.uid)


@router.post("/members/{uid}/info")
async def api_vekn_member_info(
    member: dependencies.MemberFromToken,
    op: dependencies.DbOperator,
    uid: typing.Annotated[str, fastapi.Path()],
    info: typing.Annotated[models.MemberInfo, fastapi.Body()],
) -> models.Member:
    target = await op.get_member(uid, True)
    _check_can_change_info(member, target)
    for field in dataclasses.fields(info):
        value = getattr(info, field.name)
        if value is None:
            continue
        setattr(target, field.name, value)
    return await op.update_member(target)


@router.post("/members/{uid}/sanction")
async def api_vekn_member_sanction(
    member: dependencies.MemberFromToken,
    op: dependencies.DbOperator,
    uid: typing.Annotated[str, fastapi.Path()],
    sanction: typing.Annotated[models.RegisteredSanction, fastapi.Body()],
) -> models.Member:
    _check_can_sanction(member)
    sanction.judge_uid = member.uid
    target = await op.get_member(uid, True)
    if sanction.tournament:
        # for now, tournament sanctions should be delivered through tournament events
        raise fastapi.HTTPException(fastapi.status.HTTP_400_BAD_REQUEST)
    target.sanctions.append(sanction)
    return await op.update_member(target)


@router.delete("/members/{uid}/sanction/{sanction_uid}")
async def api_vekn_member_sanction_delete(
    member: dependencies.MemberFromToken,
    op: dependencies.DbOperator,
    uid: typing.Annotated[str, fastapi.Path()],
    sanction_uid: typing.Annotated[str, fastapi.Path()],
) -> models.Member:
    _check_can_sanction(member)
    target = await op.get_member(uid, True)
    if not any(s.uid == sanction_uid for s in target.sanctions):
        raise fastapi.HTTPException(fastapi.status.HTTP_404_NOT_FOUND)
    target.sanctions = [s for s in target.sanctions if s.uid != sanction_uid]
    return await op.update_member(target)
