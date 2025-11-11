import fastapi
import logging
import typing

from .. import dependencies
from ... import models

LOG = logging.getLogger()
router = fastapi.APIRouter(
    prefix="/api/admin",
    default_response_class=fastapi.responses.ORJSONResponse,
    tags=["admin"],
)


@router.get("/clients", summary="List all client apps")
async def api_admin_clients(
    member: dependencies.PersonFromToken,
    op: dependencies.DbOperator,
) -> list[models.Client]:
    """List all client apps (admin only)"""
    if models.MemberRole.ADMIN not in member.roles:
        raise fastapi.HTTPException(fastapi.status.HTTP_403_FORBIDDEN)
    return await op.get_all_clients()


@router.post("/clients", summary="Create a new client app")
async def api_admin_clients_post(
    data: typing.Annotated[models.Client, fastapi.Body()],
    member: dependencies.PersonFromToken,
    op: dependencies.DbOperator,
) -> dict[str, str]:
    """Create a new client app (admin only)"""
    if models.MemberRole.ADMIN not in member.roles:
        raise fastapi.HTTPException(fastapi.status.HTTP_403_FORBIDDEN)
    client_id = await op.create_client(data)
    client_secret = await op.reset_client_secret(client_id)
    return {"client_id": client_id, "client_secret": client_secret}


@router.post("/clients/{client_id}/reset-secret", summary="Reset a client secret")
async def api_admin_clients_reset_secret(
    client_id: typing.Annotated[str, fastapi.Path()],
    member: dependencies.PersonFromToken,
    op: dependencies.DbOperator,
) -> dict[str, str]:
    """Reset a client secret (admin only)"""
    if models.MemberRole.ADMIN not in member.roles:
        raise fastapi.HTTPException(fastapi.status.HTTP_403_FORBIDDEN)
    client_secret = await op.reset_client_secret(client_id)
    return {"client_secret": client_secret}

