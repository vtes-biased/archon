import dataclasses
import fastapi
import orjson
import typing

from .. import dependencies
from ... import geo
from ... import models
from ... import vekn as vekn_net

router = fastapi.APIRouter(
    prefix="/api/vekn",
    default_response_class=fastapi.responses.ORJSONResponse,
    tags=["vekn"],
)

M = models.Member | models.PersonWithRatings | models.Person | models.PublicPerson


@router.get("/country", summary="List all countries")
async def api_vekn_countries() -> list[models.Country]:
    return sorted(geo.COUNTRIES_BY_NAME.values(), key=lambda c: c.country)


@router.get("/country/{country}/city", summary="List cities of given country")
async def api_vekn_country_cities(
    country: typing.Annotated[str, fastapi.Path()],
) -> list[models.City]:
    """
    Only cities **over 15k population** are listed.
    Open-source information made availaible by [Geonames](https://geonames.org).

    - **country**: The country name, field `country` of `/api/countries`
    """
    if country not in geo.CITIES_BY_COUNTRY:
        raise fastapi.HTTPException(fastapi.status.HTTP_404_NOT_FOUND)
    return sorted(geo.CITIES_BY_COUNTRY[country].values(), key=lambda c: c.unique_name)


@router.post("/claim", summary="Claim a VEKN ID")
async def api_vekn_claim(
    param: typing.Annotated[models.VeknParameter, fastapi.Body()],
    member_uid: dependencies.MemberUidFromToken,
    op: dependencies.DbOperator,
) -> dependencies.Token:
    """This gets you a new token - the token used to do the query is disabled"""
    new_member = await op.claim_vekn(member_uid, param.vekn)
    if new_member is None:
        raise fastapi.HTTPException(
            fastapi.status.HTTP_403_FORBIDDEN, detail="VEKN unknown or claimed already"
        )
    access_token = dependencies.create_access_token(new_member.uid)
    return dependencies.Token(access_token=access_token, token_type="Bearer")


@router.post("/abandon", summary="Abandon your VEKN ID")
async def api_vekn_abandon(
    member_uid: dependencies.MemberUidFromToken, op: dependencies.DbOperator
) -> dependencies.Token:
    """This gets you a new token - the token used to do the query is disabled"""
    new_member = await op.abandon_vekn(member_uid)
    if new_member is None:
        raise fastapi.HTTPException(
            fastapi.status.HTTP_404_NOT_FOUND, detail="No VEKN token"
        )
    access_token = dependencies.create_access_token(new_member.uid)
    return dependencies.Token(access_token=access_token, token_type="Bearer")


async def _json_l(
    it: typing.AsyncGenerator[any, None],
) -> typing.AsyncGenerator[str, None]:
    async for obj in it:
        yield orjson.dumps(
            obj, option=orjson.OPT_NON_STR_KEYS | orjson.OPT_APPEND_NEWLINE
        )


class JSONLResponse(fastapi.responses.ORJSONResponse):
    media_type = "application/jsonl"


@router.get(
    "/members",
    response_class=JSONLResponse,
    response_model=models.Person,
    summary="Get all members",
)
async def api_vekn_members(
    member: dependencies.PersonFromToken, op: dependencies.DbOperator
) -> fastapi.Response:
    """
    - If you're a VEKN member, you get the whole list in a streaming response,
      as [JSON Lines](https://jsonlines.org): `Content-Type: application/jsonl`
    - If you're not, you get only the public officials (Princes and NCs) as normal JSON:
      `Content-Type: application/json`
    """
    if member.vekn:
        return fastapi.responses.StreamingResponse(
            _json_l(op.get_members_gen()), media_type="application/jsonl"
        )
    else:
        return fastapi.responses.ORJSONResponse(
            await op.get_externally_visible_members(member)
        )


def _filter_member_data(user: models.Person, target: models.Member) -> M:
    data = dataclasses.asdict(target)
    if user.uid == target.uid:
        return target
    if not user.vekn:
        return models.PublicPerson(**data)
    if dependencies.check_can_contact(user, target):
        return target
    return models.PersonWithRatings(**data)


@router.get("/members/{uid}", summary="Get a member")
async def api_vekn_member(
    member: dependencies.PersonFromToken,
    op: dependencies.DbOperator,
    uid: typing.Annotated[str, fastapi.Path()],
) -> M:
    """
    Depending on your role and relationship to the member,
    you get access to more or less information.
    """
    return _filter_member_data(member, await op.get_member(uid))


@router.post("/members", summary="Add a member")
async def api_vekn_add_member(
    posting_member: dependencies.PersonFromToken,
    op: dependencies.DbOperator,
    member: typing.Annotated[models.Member, fastapi.Body()],
) -> M:
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
    ret = await op.insert_member(member)
    return _filter_member_data(posting_member, ret)


@router.post("/members/password", summary="Change your password")
async def api_vekn_set_member_password(
    member: dependencies.MemberFromToken,
    op: dependencies.DbOperator,
    password: typing.Annotated[models.PasswordParameter, fastapi.Body()],
) -> models.Member:
    dependencies.set_member_password(member, password.password)
    return await op.update_member(member)


@router.post("/members/unlink_discord", summary="Unlink your Discord account")
async def api_vekn_unlink_discord(
    member: dependencies.MemberFromToken,
    op: dependencies.DbOperator,
) -> models.Member:
    member.discord = None
    return await op.update_member(member)


@router.post("/members/{uid}/add_role", summary="Add a role to the member")
async def api_vekn_member_add_role(
    member: dependencies.PersonFromToken,
    op: dependencies.DbOperator,
    uid: typing.Annotated[str, fastapi.Path()],
    param: typing.Annotated[models.RoleParameter, fastapi.Body()],
) -> M:
    """Only Admins and NCs (for their country members) can do that"""
    target = await op.get_member(uid, True)
    dependencies.check_can_change_role(member, target, param.role)
    target.roles = list(set(target.roles) | {param.role})
    return _filter_member_data(member, await op.update_member(target))


@router.post("/members/{uid}/remove_role", summary="Remove a role")
async def api_vekn_member_remove_role(
    member: dependencies.PersonFromToken,
    op: dependencies.DbOperator,
    uid: typing.Annotated[str, fastapi.Path()],
    param: typing.Annotated[models.RoleParameter, fastapi.Body()],
) -> M:
    """Only Admins and NCs (for their country members) can do that"""
    target = await op.get_member(uid, True)
    dependencies.check_can_change_role(member, target, param.role)
    target.roles = list(set(target.roles) - {param.role})
    return _filter_member_data(member, await op.update_member(target))


@router.post(
    "/members/{uid}/sponsor", summary="Sponsor a person to VEKN (attributes a VEKN ID)"
)
async def api_vekn_member_sponsor(
    member: dependencies.PersonFromToken,
    op: dependencies.DbOperator,
    uid: typing.Annotated[str, fastapi.Path()],
) -> M:
    """Only Princes, Admins and NCs can do that"""
    dependencies.check_organizer(member)
    target = await op.get_member(uid, True)
    target.sponsor = member.uid
    ret = await op.update_member_new_vekn(target)
    await vekn_net.create_member(ret)
    return _filter_member_data(member, ret)


@router.post("/members/{uid}/vekn", summary="Assign an existing VEKN ID to a member")
async def api_vekn_member_assign_vekn(
    member: dependencies.PersonFromToken,
    op: dependencies.DbOperator,
    uid: typing.Annotated[str, fastapi.Path()],
    param: typing.Annotated[models.VeknParameter, fastapi.Body()],
) -> M:
    """Only Admins and NCs (for their country members) can do that"""
    target = await op.get_member(uid, True)
    dependencies.check_can_change_vekn(member, target)
    target.sponsor = member.uid
    ret = await op.claim_vekn(target.uid, param.vekn)
    if not ret:
        raise fastapi.HTTPException(fastapi.status.HTTP_400_BAD_REQUEST)
    return _filter_member_data(member, ret)


@router.delete("/members/{uid}/vekn", summary="Remove a VEKN ID from a member")
async def api_vekn_member_delete_vekn(
    member: dependencies.PersonFromToken,
    op: dependencies.DbOperator,
    uid: typing.Annotated[str, fastapi.Path()],
) -> M:
    """Only Admins and NCs (for their country members) can do that"""
    target = await op.get_member(uid, True)
    dependencies.check_can_change_vekn(member, target)
    ret = await op.abandon_vekn(target.uid)
    if not ret:
        raise fastapi.HTTPException(fastapi.status.HTTP_400_BAD_REQUEST)
    return _filter_member_data(member, ret)


@router.post("/members/{uid}/info", summary="Change a member's contact information")
async def api_vekn_member_info(
    member: dependencies.PersonFromToken,
    op: dependencies.DbOperator,
    uid: typing.Annotated[str, fastapi.Path()],
    info: typing.Annotated[models.MemberInfo, fastapi.Body()],
) -> M:
    target = await op.get_member(uid, True)
    dependencies.check_can_change_info(member, target)
    for field in dataclasses.fields(info):
        value = getattr(info, field.name)
        if value is None:
            continue
        setattr(target, field.name, value)
    return _filter_member_data(member, await op.update_member(target))


@router.post("/members/{uid}/sanction", summary="Sanction a member")
async def api_vekn_member_sanction(
    member: dependencies.PersonFromToken,
    op: dependencies.DbOperator,
    uid: typing.Annotated[str, fastapi.Path()],
    sanction: typing.Annotated[models.RegisteredSanction, fastapi.Body()],
) -> M:
    """Only Judges and Ethics Committee members can do that"""
    dependencies.check_can_sanction(member)
    sanction.judge = member
    target = await op.get_member(uid, True)
    if sanction.tournament:
        # for now, tournament sanctions should be delivered through tournament events
        raise fastapi.HTTPException(fastapi.status.HTTP_400_BAD_REQUEST)
    target.sanctions.append(sanction)
    return _filter_member_data(member, await op.update_member(target))


@router.delete("/members/{uid}/sanction/{sanction_uid}", summary="Remove a sanction")
async def api_vekn_member_sanction_delete(
    member: dependencies.PersonFromToken,
    op: dependencies.DbOperator,
    uid: typing.Annotated[str, fastapi.Path()],
    sanction_uid: typing.Annotated[str, fastapi.Path()],
) -> M:
    """Only Judges and Ethics Committee members can do that"""
    dependencies.check_can_sanction(member)
    target = await op.get_member(uid, True)
    if not any(s.uid == sanction_uid for s in target.sanctions):
        raise fastapi.HTTPException(fastapi.status.HTTP_404_NOT_FOUND)
    target.sanctions = [s for s in target.sanctions if s.uid != sanction_uid]
    return _filter_member_data(member, await op.update_member(target))
