"""URL validation and SSRF protection tests."""

from __future__ import annotations

import socket

import pytest
from app.core.config import get_settings
from app.core.security import (
    UnsafeTargetError,
    assert_safe_url,
    assert_safe_url_sync,
    is_blocked_ip,
    normalize_url,
)


def test_normalize_adds_scheme_and_strips_fragment():
    assert normalize_url("example.com/path#section") == "https://example.com/path"
    assert normalize_url("  https://Example.COM  ") == "https://example.com/"


@pytest.mark.parametrize(
    "url",
    [
        "ftp://example.com/file",
        "file:///etc/passwd",
        "javascript:alert(1)",
        "data:text/html,hi",
        "https://user:pass@example.com/",
        "",
        "not a url",
    ],
)
def test_rejects_invalid_or_unsafe_urls(url):
    with pytest.raises(UnsafeTargetError):
        normalize_url(url)


@pytest.mark.parametrize(
    "ip",
    [
        "127.0.0.1",
        "10.1.2.3",
        "172.16.0.5",
        "192.168.1.10",
        "169.254.169.254",
        "100.100.100.200",
        "0.0.0.0",
        "255.255.255.255",
        "::1",
        "fe80::1",
        "fd00::1",
    ],
)
def test_private_and_metadata_addresses_are_blocked(ip):
    import ipaddress

    assert is_blocked_ip(ipaddress.ip_address(ip)) is True


def test_public_addresses_are_allowed():
    import ipaddress

    assert is_blocked_ip(ipaddress.ip_address("93.184.216.34")) is False
    assert is_blocked_ip(ipaddress.ip_address("2606:2800:220:1:248:1893:25c8:1946")) is False


@pytest.mark.asyncio
async def test_rejects_localhost_and_private_targets(monkeypatch):
    monkeypatch.setattr(get_settings(), "allow_local_targets", False)
    for url in (
        "http://localhost:8000/",
        "http://127.0.0.1/",
        "http://10.0.0.4/admin",
        "http://169.254.169.254/latest/meta-data/",
        "http://[::1]/",
        "http://metadata.google.internal/",
    ):
        with pytest.raises(UnsafeTargetError):
            await assert_safe_url(url)


@pytest.mark.asyncio
async def test_dns_resolution_to_private_address_is_blocked(monkeypatch):
    monkeypatch.setattr(get_settings(), "allow_local_targets", False)

    def fake_getaddrinfo(*_args, **_kwargs):
        return [(socket.AF_INET, socket.SOCK_STREAM, 6, "", ("10.0.0.7", 80))]

    monkeypatch.setattr("app.core.security.socket.getaddrinfo", fake_getaddrinfo)
    with pytest.raises(UnsafeTargetError, match="private"):
        await assert_safe_url("http://rebind.example.com/")


@pytest.mark.asyncio
async def test_dns_resolution_to_public_address_is_allowed(monkeypatch):
    monkeypatch.setattr(get_settings(), "allow_local_targets", False)

    def fake_getaddrinfo(*_args, **_kwargs):
        return [(socket.AF_INET, socket.SOCK_STREAM, 6, "", ("93.184.216.34", 80))]

    monkeypatch.setattr("app.core.security.socket.getaddrinfo", fake_getaddrinfo)
    assert await assert_safe_url("https://example.com") == "https://example.com/"


@pytest.mark.asyncio
async def test_explicit_local_override_allows_fixture_targets():
    assert await assert_safe_url("http://127.0.0.1:8099/", allow_private=True)


def test_sync_variant_mirrors_policy(monkeypatch):
    monkeypatch.setattr(get_settings(), "allow_local_targets", False)
    with pytest.raises(UnsafeTargetError):
        assert_safe_url_sync("http://192.168.0.1/")
    assert assert_safe_url_sync("https://93.184.216.34/").startswith("https://93.184.216.34")
