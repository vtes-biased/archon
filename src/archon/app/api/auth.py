import fastapi
import typing

from .. import dependencies

router = fastapi.APIRouter(
    prefix="/api/auth",
    default_response_class=fastapi.responses.ORJSONResponse,
    tags=["oauth"],
)


@router.post(
    "/token",
    summary="Use the authorization code to get a bearer token to use the API.",
    response_class=fastapi.responses.ORJSONResponse,
    tags=["oauth"],
)
async def api_auth_token(
    grant_type: typing.Annotated[str, fastapi.Form()],
    code: typing.Annotated[str, fastapi.Form()],
    client_uid: dependencies.ClientLogin,
    op: dependencies.DbOperator,
):
    if grant_type != "authorization_code":
        raise fastapi.HTTPException(status_code=403)
    member_uid = dependencies.check_authorization_code(op, client_uid, code)
    access_token = dependencies.create_access_token(member_uid)
    return dependencies.Token(access_token=access_token, token_type="Bearer")
