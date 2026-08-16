"""查询请求者公网 IP 及地理位置信息。

本模块职责（保持 service 层纯函数、不依赖 Flask request）：
  - get_requester_ip(flask_request) -> str
      优先从常见反向代理头（X-Forwarded-For / X-Real-IP 等）中剥离出真实公网 IP，
      当没有这些头时回退到 request.remote_addr。
  - enrich_ip_info(ip) -> dict
      用第三方公开 GeoIP / WHOIS API（ip-api.com、ipwho.is 等）查询国家/地区/ASN/ISP。
      查询失败时返回不含 geo 字段的降级结果，保证 API 永远可用。

注意：
  - enrich_ip_info 依赖外网可达。内网部署且无外网时，返回的 geo 字段为空字典。
  - 本地 / 环回 / 私有地址不做 enrich，直接标注 type = "private"。
"""

from __future__ import annotations

import ipaddress
import json
from typing import Any
from urllib import error, request as _request

_GEO_PROVIDERS = (
    # 免费、无需 key、JSON 响应快；国内访问也 OK
    ('https://ipwho.is/{ip}', 2.5),
    ('http://ip-api.com/json/{ip}?fields=status,country,countryCode,region,regionName,city,zip,lat,lon,timezone,isp,org,as,query,message', 2.0),
)


def _is_private_ip(ip: str) -> bool:
    try:
        addr = ipaddress.ip_address(ip)
    except (ValueError, TypeError):
        return False
    return (
        addr.is_private
        or addr.is_loopback
        or addr.is_link_local
        or addr.is_multicast
        or addr.is_unspecified
        or addr.is_reserved
    )


def get_requester_ip(flask_request) -> str:
    """从 Flask request 对象中提取真实客户端公网 IP。

    注意：X-Forwarded-For 可能包含多个 IP（a, b, c），第一个通常是最接近真实客户端的。
    这里要小心：不要轻易信任最前面的 IP（可能被伪造），但对"展示给用户自己看"足够用。
    """
    # 优先级由高到低的常见头
    headers_order = (
        'X-Forwarded-For',
        'X-Real-IP',
        'CF-Connecting-IP',
        'X-Client-IP',
        'X-Cluster-Client-IP',
        'Forwarded-For',
        'Forwarded',
    )
    for h in headers_order:
        raw = flask_request.headers.get(h)
        if not raw:
            continue
        if h.lower() == 'forwarded':
            # RFC7239: Forwarded: for=1.2.3.4; proto=https
            for part in raw.split(','):
                part = part.strip()
                if part.lower().startswith('for='):
                    val = part[4:].strip().strip('"').strip('[]')
                    if val:
                        return val
            continue
        # 取第一个非空 IP
        for token in raw.split(','):
            token = token.strip()
            if token:
                return token
    # 兜底：直接连接方 IP
    return flask_request.remote_addr or ''


def _fetch_json(url: str, timeout: float) -> dict[str, Any] | None:
    try:
        req = _request.Request(url, headers={'Accept': 'application/json', 'User-Agent': 'ai-tools-ip-info/1.0'})
        with _request.urlopen(req, timeout=timeout) as resp:
            body = resp.read()
        if not body:
            return None
        return json.loads(body.decode('utf-8', errors='ignore'))
    except (error.URLError, error.HTTPError, TimeoutError, ValueError, OSError):
        return None


def _normalize_geo(data: dict[str, Any] | None) -> dict[str, Any]:
    """统一不同提供商字段。返回空 dict 表示没拿到 geo 信息。"""
    if not data:
        return {}
    out: dict[str, Any] = {}

    # ipwho.is 字段
    if 'success' in data and data.get('success') is False:
        return {}
    ip = (
        data.get('ip')
        or data.get('query')
        or data.get('address')
        or ''
    )
    if ip:
        out['ip'] = str(ip)
    out['country'] = data.get('country') or data.get('country_name') or ''
    out['country_code'] = data.get('country_code') or data.get('countryCode') or ''
    out['region'] = data.get('region') or data.get('region_name') or data.get('regionName') or ''
    out['city'] = data.get('city') or ''
    out['postal'] = data.get('postal') or data.get('zip') or ''
    out['latitude'] = data.get('latitude') if data.get('latitude') is not None else data.get('lat')
    out['longitude'] = data.get('longitude') if data.get('longitude') is not None else data.get('lon')
    out['timezone'] = data.get('timezone') or data.get('time_zone', {}).get('id') if isinstance(data.get('time_zone'), dict) else data.get('timezone') or ''
    out['isp'] = data.get('isp') or data.get('connection', {}).get('isp') if isinstance(data.get('connection'), dict) else data.get('isp') or ''
    out['org'] = data.get('org') or data.get('connection', {}).get('org') if isinstance(data.get('connection'), dict) else data.get('org') or ''
    asn_raw = data.get('as') or data.get('connection', {}).get('asn') if isinstance(data.get('connection'), dict) else ''
    if asn_raw:
        asn_str = str(asn_raw)
        if asn_str.lower().startswith('as'):
            try:
                out['asn'] = int(asn_str[2:].split()[0])
            except (ValueError, TypeError):
                out['asn_raw'] = asn_str
        else:
            try:
                out['asn'] = int(asn_str)
            except (ValueError, TypeError):
                out['asn_raw'] = asn_str
        as_desc = data.get('as')
        if isinstance(as_desc, str) and ' ' in as_desc:
            out['asn_description'] = as_desc.split(' ', 1)[1]

    # 去空值，减少噪音
    return {k: v for k, v in out.items() if v not in (None, '', [], {})}


def enrich_ip_info(ip: str) -> dict[str, Any]:
    """返回 {ip, type, geo: {...}}。geo 可能为空 dict。"""
    result: dict[str, Any] = {'ip': ip or ''}
    if not ip:
        result['type'] = 'unknown'
        result['geo'] = {}
        return result

    if _is_private_ip(ip):
        try:
            addr = ipaddress.ip_address(ip)
            if addr.is_loopback:
                result['type'] = 'loopback'
            elif addr.is_link_local:
                result['type'] = 'link_local'
            elif addr.is_multicast:
                result['type'] = 'multicast'
            else:
                result['type'] = 'private'
        except (ValueError, TypeError):
            result['type'] = 'private'
        result['geo'] = {}
        return result

    result['type'] = 'public'

    for url_tpl, timeout in _GEO_PROVIDERS:
        try:
            url = url_tpl.format(ip=ip)
        except (KeyError, IndexError):
            continue
        data = _fetch_json(url, timeout)
        geo = _normalize_geo(data)
        if geo:
            result['geo'] = geo
            # 记录哪个 provider 返回了有效结果（方便排查）
            try:
                result['provider'] = url.split('/')[2]
            except (IndexError, AttributeError):
                pass
            return result

    result['geo'] = {}
    return result
