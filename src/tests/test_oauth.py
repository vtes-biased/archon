import asyncio
import os

import fastapi
import jwt
import pytest

os.environ.setdefault("MAIL_USERNAME", "test")
os.environ.setdefault("MAIL_PASSWORD", "test")
os.environ.setdefault("MAIL_PORT", "25")
os.environ.setdefault("MAIL_SERVER", "localhost")
os.environ.setdefault("MAIL_FROM", "test@example.com")
os.environ.setdefault("MAIL_FROM_NAME", "Archon Test")

from archon import models
from archon.app import dependencies
from archon.app.html import website


@pytest.fixture(autouse=True)
def oauth_token_secret(monkeypatch):
    monkeypatch.setattr(dependencies, "TOKEN_SECRET", "x" * 32)
    dependencies.EXPECTED_AUTH_TOKENS.clear()
    yield
    dependencies.EXPECTED_AUTH_TOKENS.clear()


class MemberOp:
    def __init__(self, member: models.Member):
        self.member = member

    async def get_member(self, member_uid, cls=models.Member):
        assert member_uid == self.member.uid
        return self.member


class ClientOp:
    def __init__(self, valid: bool):
        self.valid = valid
        self.calls = []

    async def check_client_secret(self, client_id, client_secret):
        self.calls.append((client_id, client_secret))
        return self.valid


def test_oauth_token_exchange_checks_redirect_uri():
    client_id = "client-id"
    redirect_uri = "https://client.example/callback"
    member = models.Member(
        name="Test User",
        uid="member-id",
        authorized_clients={client_id: {"authorized_at": "2026-05-30T00:00:00Z"}},
    )
    code = dependencies.create_authorization_code(client_id, member.uid, redirect_uri)

    token = asyncio.run(
        website.html_auth_oauth_token(
            "authorization_code", code, redirect_uri, client_id, MemberOp(member)
        )
    )

    payload = jwt.decode(
        token.access_token,
        "x" * 32,
        algorithms=[dependencies.JWT_ALGORITHM],
    )
    assert token.token_type == "Bearer"
    assert payload["sub"] == member.uid
    assert dependencies.EXPECTED_AUTH_TOKENS == set()


def test_oauth_token_exchange_rejects_redirect_uri_mismatch():
    code = dependencies.create_authorization_code(
        "client-id", "member-id", "https://client.example/callback"
    )

    with pytest.raises(fastapi.HTTPException) as exc_info:
        dependencies.check_authorization_code(
            "client-id", code, "https://other.example/callback"
        )

    assert exc_info.value.status_code == 403


def test_client_login_accepts_form_credentials_without_basic_auth():
    op = ClientOp(valid=True)

    client_id = asyncio.run(
        dependencies.client_login(
            op,
            basic=None,
            client_id="client-id",
            client_secret="client-secret",
        )
    )

    assert dependencies.basic_scheme.auto_error is False
    assert client_id == "client-id"
    assert op.calls == [("client-id", "client-secret")]


def test_client_login_rejects_missing_credentials_before_db_lookup():
    op = ClientOp(valid=True)

    with pytest.raises(fastapi.HTTPException) as exc_info:
        asyncio.run(dependencies.client_login(op, basic=None))

    assert exc_info.value.status_code == 401
    assert op.calls == []
