"""IP段拆分与扫描服务。

扫描策略：
- 使用系统ping检测主机存活
- 掩码 >=24：直接扫描该子网所有可用IP
- 掩码 <24：拆分成多个/24段，并发扫描每段

性能参数：
- ping参数：-c 1 -W 500（500ms超时）
- 每/24段内部：16线程并发
- /24段之间：16线程并发

支持多CIDR输入：
- 输入多行文本，每行一个CIDR
- 返回合并后的结果
"""

from __future__ import annotations

import ipaddress
import subprocess
import threading
from concurrent.futures import ThreadPoolExecutor, as_completed
from typing import Any


MAX_WORKERS = 16


def _parse_cidrs(text: str) -> list[str]:
    """解析多行文本，提取有效的CIDR列表。"""
    result = []
    for line in text.strip().split('\n'):
        cidr = line.strip()
        if not cidr:
            continue
        try:
            ipaddress.ip_network(cidr, strict=False)
            result.append(cidr)
        except (ValueError, TypeError):
            continue
    return result


def split_to_24(cidr: str) -> list[str]:
    """把CIDR拆分成/24段列表。掩码>=24时返回自身。"""
    try:
        network = ipaddress.ip_network(cidr, strict=False)
    except (ValueError, TypeError):
        return []

    if network.prefixlen >= 24:
        return [str(network)]

    result: list[str] = []
    for subnet in network.subnets(new_prefix=24):
        result.append(str(subnet))
    return result


def _ping_host(ip: str) -> bool:
    """使用系统ping检测主机存活。"""
    try:
        cmd = ['ping', '-c', '1', '-W', '500', ip]
        result = subprocess.run(cmd, capture_output=True, timeout=2)
        return result.returncode == 0
    except (subprocess.CalledProcessError, subprocess.TimeoutExpired, OSError):
        return False


def scan_subnet(subnet_cidr: str) -> list[str]:
    """扫描单个子网，返回存活IP列表（已按IP排序）。"""
    try:
        network = ipaddress.ip_network(subnet_cidr, strict=False)
    except (ValueError, TypeError):
        return []

    hosts = list(network.hosts())
    if not hosts:
        return []

    alive: list[str] = []
    lock = threading.Lock()

    def check(ip_str: str) -> None:
        if _ping_host(ip_str):
            with lock:
                alive.append(ip_str)

    max_workers = min(MAX_WORKERS, len(hosts))
    with ThreadPoolExecutor(max_workers=max_workers) as executor:
        futures = {executor.submit(check, str(h)) for h in hosts}
        for _ in as_completed(futures):
            pass

    return sorted(alive, key=lambda ip: [int(o) for o in ip.split('.')])


def scan_cidr(cidr: str) -> dict[str, Any]:
    """扫描一个CIDR段，返回完整结果。"""
    subnets = split_to_24(cidr)
    if not subnets:
        return {'error': '无效的IP地址段格式'}

    network = ipaddress.ip_network(cidr, strict=False)
    result: dict[str, Any] = {
        'cidr': cidr,
        'original_prefix': network.prefixlen,
        'subnet_count': len(subnets),
        'total_alive_count': 0,
        'subnets': [],
    }

    lock = threading.Lock()

    def scan_one(subnet: str) -> dict[str, Any]:
        alive = scan_subnet(subnet)
        with lock:
            result['total_alive_count'] += len(alive)
        return {
            'subnet': subnet,
            'alive_ips': alive,
            'alive_count': len(alive),
        }

    max_workers = min(MAX_WORKERS, len(subnets))
    with ThreadPoolExecutor(max_workers=max_workers) as executor:
        futures = {executor.submit(scan_one, s): s for s in subnets}
        for future in as_completed(futures):
            subnet_result = future.result()
            result['subnets'].append(subnet_result)

    result['subnets'].sort(key=lambda x: x['subnet'])
    return result


def scan_multiple(cidrs_text: str) -> dict[str, Any]:
    """扫描多个CIDR段（支持多行输入），返回合并结果。"""
    cidrs = _parse_cidrs(cidrs_text)
    if not cidrs:
        return {'error': '未找到有效的IP地址段'}

    if len(cidrs) == 1:
        return scan_cidr(cidrs[0])

    all_subnets: list[dict[str, Any]] = []
    total_alive_count = 0

    for cidr in cidrs:
        result = scan_cidr(cidr)
        if 'error' in result:
            continue
        all_subnets.extend(result['subnets'])
        total_alive_count += result['total_alive_count']

    all_subnets.sort(key=lambda x: x['subnet'])

    return {
        'cidr': ', '.join(cidrs),
        'original_prefix': 'multi',
        'subnet_count': len(all_subnets),
        'total_alive_count': total_alive_count,
        'subnets': all_subnets,
    }
