"""URL validation and SSRF protection.

Every outbound request made by the testing engine goes through
``assert_safe_url`` before it is sent, and redirects are re-validated hop by
hop. The checks reject:

* non HTTP(S) schemes,
* loopback, private, link-local, reserved, multicast and CGNAT addresses,
* cloud metadata endpoints,
* hostnames that resolve to any of the above (DNS rebinding is limited by
  re-resolving on every hop and refusing redirects that change host).
"""

from __future__ import annotations

import asyncio
import ipaddress
import re
import socket
from urllib.parse import urlsplit, urlunsplit

from app.core.config import get_settings

ALLOWED_SCHEMES = {"http", "https"}
MAX_URL_LENGTH = 2048

BLOCKED_HOSTNAMES = {
    "localhost",
    "localhost.localdomain",
    "ip6-localhost",
    "ip6-loopback",
    "metadata",
    "metadata.google.internal",
    "instance-data",
}

CLOUD_METADATA_IPS = frozenset(
    {
        "169.254.169.254",  # AWS / GCP / Azure / OpenStack
        "169.254.170.2",  # AWS ECS task metadata
        "100.100.100.200",  # Alibaba Cloud
        "fd00:ec2::254",  # AWS IPv6 metadata
    }
)

_BLOCKED_NETWORKS = tuple(
    ipaddress.ip_network(net)
    for net in (
        "0.0.0.0/8",
        "10.0.0.0/8",
        "100.64.0.0/10",
        "127.0.0.0/8",
        "169.254.0.0/16",
        "172.16.0.0/12",
        "192.0.0.0/24",
        "192.0.2.0/24",
        "192.168.0.0/16",
        "198.18.0.0/15",
        "198.51.100.0/24",
        "203.0.113.0/24",
        "224.0.0.0/4",
        "240.0.0.0/4",
        "255.255.255.255/32",
        "::/128",
        "::1/128",
        "64:ff9b::/96",
        "fc00::/7",
        "fe80::/10",
        "ff00::/8",
        "2001:db8::/32",
    )
)


class UnsafeTargetError(ValueError):
    """Raised when a URL points at a target TestPilot refuses to test."""


def _is_ip_literal(host: str) -> bool:
    try:
        ipaddress.ip_address(host.split("%")[0])
    except ValueError:
        return False
    return True


def normalize_url(raw: str) -> str:
    """Trim whitespace, add a scheme when missing and strip fragments."""
    value = (raw or "").strip()
    if not value:
        raise UnsafeTargetError("A website URL is required.")
    if "://" not in value:
        value = f"https://{value}"
    if len(value) > MAX_URL_LENGTH:
        raise UnsafeTargetError("The URL is too long.")
    parts = urlsplit(value)
    scheme = parts.scheme.lower()
    if scheme not in ALLOWED_SCHEMES:
        raise UnsafeTargetError(
            f"The scheme '{parts.scheme or '(none)'}' is not allowed; use http or https."
        )
    if not parts.hostname:
        raise UnsafeTargetError("The URL must include a hostname.")
    if parts.username or parts.password:
        raise UnsafeTargetError("URLs containing credentials are not allowed.")
    try:
        port = parts.port
    except ValueError as exc:
        raise UnsafeTargetError("The URL contains an invalid port.") from exc
    if port is not None and not (1 <= port <= 65535):
        raise UnsafeTargetError("The port is out of range.")
    hostname = parts.hostname
    if not re.fullmatch(r"[a-z0-9._-]+", hostname) and not _is_ip_literal(hostname):
        raise UnsafeTargetError(f"'{hostname}' is not a valid hostname.")
    netloc = hostname.lower()
    if ":" in netloc:  # IPv6 literal
        netloc = f"[{netloc}]"
    if port is not None:
        netloc = f"{netloc}:{port}"
    path = parts.path or "/"
    return urlunsplit((scheme, netloc, path, parts.query, ""))


def is_blocked_ip(ip: ipaddress.IPv4Address | ipaddress.IPv6Address) -> bool:
    """Return True when an address must never be contacted."""
    if str(ip) in CLOUD_METADATA_IPS:
        return True
    mapped = getattr(ip, "ipv4_mapped", None)
    if mapped is not None:
        return is_blocked_ip(mapped)
    if (
        ip.is_private
        or ip.is_loopback
        or ip.is_link_local
        or ip.is_reserved
        or ip.is_multicast
        or ip.is_unspecified
    ):
        return True
    if not ip.is_global:
        return True
    return any(ip in network for network in _BLOCKED_NETWORKS)


def _resolve(host: str, port: int) -> list[str]:
    try:
        infos = socket.getaddrinfo(host, port, type=socket.SOCK_STREAM)
    except socket.gaierror as exc:  # pragma: no cover - platform dependent
        raise UnsafeTargetError(f"Could not resolve hostname '{host}'.") from exc
    addresses = {info[4][0] for info in infos}
    if not addresses:
        raise UnsafeTargetError(f"Could not resolve hostname '{host}'.")
    return sorted(addresses)


async def assert_safe_url(raw: str, *, allow_private: bool | None = None) -> str:
    """Validate a URL against the SSRF policy and return its normalized form.

    Raises :class:`UnsafeTargetError` for anything that must not be tested.
    """
    settings = get_settings()
    allow = settings.allow_local_targets if allow_private is None else allow_private
    url = normalize_url(raw)
    parts = urlsplit(url)
    host = (parts.hostname or "").strip("[]").lower()
    port = parts.port or (443 if parts.scheme == "https" else 80)

    if host in BLOCKED_HOSTNAMES or host.endswith(".localhost"):
        if not allow:
            raise UnsafeTargetError(
                f"'{host}' is a local hostname; testing local or private networks is blocked."
            )
        return url

    try:
        literal_ip = ipaddress.ip_address(host.split("%")[0])
    except ValueError:
        literal_ip = None

    if literal_ip is not None:
        if not allow and is_blocked_ip(literal_ip):
            raise UnsafeTargetError(
                f"'{host}' is a private, loopback or reserved address; testing it is blocked."
            )
        return url

    if allow:
        return url

    addresses = await asyncio.to_thread(_resolve, host, port)
    for address in addresses:
        ip = ipaddress.ip_address(address.split("%")[0])
        if is_blocked_ip(ip):
            raise UnsafeTargetError(
                f"'{host}' resolves to a private or reserved address ({address}); "
                "testing it is blocked."
            )
    return url


def assert_safe_url_sync(raw: str, *, allow_private: bool | None = None) -> str:
    """Synchronous wrapper used by sync code paths (report exports)."""
    settings = get_settings()
    allow = settings.allow_local_targets if allow_private is None else allow_private
    url = normalize_url(raw)
    if allow:
        return url
    host = (urlsplit(url).hostname or "").strip("[]").lower()
    if host in BLOCKED_HOSTNAMES or host.endswith(".localhost"):
        raise UnsafeTargetError(f"'{host}' is a local hostname and is blocked.")
    try:
        literal_ip = ipaddress.ip_address(host.split("%")[0])
    except ValueError:
        literal_ip = None
    if literal_ip is not None:
        if is_blocked_ip(literal_ip):
            raise UnsafeTargetError(f"'{host}' is a private or reserved address.")
        return url
    port = urlsplit(url).port or (443 if url.startswith("https") else 80)
    for address in _resolve(host, port):
        if is_blocked_ip(ipaddress.ip_address(address.split("%")[0])):
            raise UnsafeTargetError(
                f"'{host}' resolves to a private or reserved address ({address})."
            )
    return url
