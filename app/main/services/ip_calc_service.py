"""IP 计算器子页面的业务逻辑。

对外暴露：
- format_ipv4(ip_str)
- format_ipv6(ip_str)
- calculate_ipv4(cidr) -> (other_ip, 'success' | error_msg)
- calculate_ipv6(cidr) -> (other_ip, 'success' | error_msg)
- batch_calculate(ipv4_text, ipv6_text) -> 供路由返回 JSON 使用的 dict
"""

from __future__ import annotations

import ipaddress
from typing import Optional


def _split_ip_prefix(cidr: str) -> tuple[str, Optional[str]]:
    if '/' in str(cidr):
        ip_part, _, prefix = str(cidr).partition('/')
        return ip_part.strip(), prefix.strip() or None
    return str(cidr).strip(), None


def format_ipv4(ip_str: str) -> str:
    """标准化 IPv4 字符串（保留掩码）。非有效输入原样返回。"""
    if not ip_str:
        return ip_str
    try:
        ip = ipaddress.ip_address(_split_ip_prefix(ip_str)[0])
        prefix = _split_ip_prefix(ip_str)[1]
        return str(ip) + ('/' + prefix if prefix else '')
    except (ValueError, TypeError):
        return str(ip_str)


def format_ipv6(ip_str: str) -> str:
    """标准化 IPv6 字符串（小写、压缩、保留掩码）。非有效输入原样返回。"""
    if not ip_str:
        return ip_str
    try:
        ip = ipaddress.ip_address(_split_ip_prefix(ip_str)[0])
        prefix = _split_ip_prefix(ip_str)[1]
        return str(ip).lower() + ('/' + prefix if prefix else '')
    except (ValueError, TypeError):
        return str(ip_str)


def calculate_ipv4(cidr: str) -> tuple[Optional[str], str]:
    """对 /30 或 /31 的网段计算另一端 IP。返回 (other_ip, 'success') 或 (None, error_msg)。"""
    try:
        net = ipaddress.ip_network(cidr, strict=False)
        if net.prefixlen not in (30, 31):
            return None, '掩码必须是 /30 或 /31'
        all_hosts = list(net.hosts())
        input_ip = ipaddress.ip_address(_split_ip_prefix(cidr)[0])
        if input_ip == all_hosts[0]:
            return str(all_hosts[1]) + '/' + str(net.prefixlen), 'success'
        if input_ip == all_hosts[1]:
            return str(all_hosts[0]) + '/' + str(net.prefixlen), 'success'
        return None, '输入的IP地址不在网段内'
    except (ValueError, ipaddress.AddressValueError, TypeError):
        return None, '无效的IPV4地址格式'


def calculate_ipv6(cidr: str) -> tuple[Optional[str], str]:
    """对 /126 或 /127 的网段计算另一端 IP。返回 (other_ip, 'success') 或 (None, error_msg)。"""
    try:
        net = ipaddress.ip_network(cidr, strict=False)
        if net.prefixlen not in (126, 127):
            return None, '掩码必须是 /126 或 /127。'
        all_hosts = list(net.hosts())
        input_ip = ipaddress.ip_address(_split_ip_prefix(cidr)[0])
        try:
            input_index = all_hosts.index(input_ip)
        except ValueError:
            return None, '输入的IP地址不在该子网内。'
        other_host = all_hosts[1 - input_index]
        return str(other_host).lower() + '/' + str(net.prefixlen), 'success'
    except (ValueError, ipaddress.AddressValueError, TypeError):
        return None, '无效的IPV6地址'


def batch_calculate(ipv4_text: str, ipv6_text: str) -> dict:
    """对多行输入分别计算 IPv4/IPv6。返回路由可直接 jsonify 的 dict。

    - ipv4_text / ipv6_text：来自前端 textarea 的原始多行文本
    """
    ipv4_list = [line.strip() for line in (ipv4_text or '').splitlines() if line.strip()]
    ipv6_list = [line.strip() for line in (ipv6_text or '').splitlines() if line.strip()]

    ipv4_results: list[str] = []
    ipv6_results: list[str] = []
    formatted_ipv4_input: list[str] = []
    formatted_ipv6_input: list[str] = []

    for cidr in ipv4_list:
        formatted_ipv4_input.append(format_ipv4(cidr))
        other_ip, status = calculate_ipv4(cidr)
        ipv4_results.append(other_ip if status == 'success' else '错误: {0}'.format(other_ip))

    for cidr in ipv6_list:
        formatted_ipv6_input.append(format_ipv6(cidr))
        other_ip, status = calculate_ipv6(cidr)
        ipv6_results.append(other_ip if status == 'success' else '错误: {0}'.format(other_ip))

    return {
        'ipv4_results_text': "\n".join(ipv4_results),
        'ipv6_results_text': "\n".join(ipv6_results),
        'formatted_ipv4_input': "\n".join(formatted_ipv4_input),
        'formatted_ipv6_input': "\n".join(formatted_ipv6_input),
        'ipv4_results_array': ipv4_results,
        'ipv6_results_array': ipv6_results,
        'formatted_ipv4_array': formatted_ipv4_input,
        'formatted_ipv6_array': formatted_ipv6_input,
    }
