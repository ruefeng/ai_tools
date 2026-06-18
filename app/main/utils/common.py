"""通用小工具：类型安全的基本数据处理。"""

from __future__ import annotations

import datetime
from typing import Any


def safe_float(value: Any, default: float = 0.0) -> float:
    """把任意值安全转为 float，失败返回 default。"""
    if value is None or value == '':
        return float(default)
    try:
        if isinstance(value, bool):
            return float(default)
        return float(value)
    except (TypeError, ValueError):
        return float(default)


def safe_int(value: Any, default: int = 0) -> int:
    """把任意值安全转为 int，失败返回 default。"""
    if value is None or value == '':
        return int(default)
    try:
        if isinstance(value, bool):
            return int(default)
        if isinstance(value, float):
            return int(value)
        return int(value)
    except (TypeError, ValueError):
        return int(default)


def parse_date(date_text: Any) -> datetime.date | None:
    """把 'YYYY-MM-DD' 或 datetime 解析为 date。"""
    if date_text is None or date_text == '':
        return None
    if isinstance(date_text, datetime.datetime):
        return date_text.date()
    if isinstance(date_text, datetime.date):
        return date_text
    try:
        return datetime.datetime.strptime(str(date_text), '%Y-%m-%d').date()
    except (TypeError, ValueError):
        return None


def format_date(value: Any) -> str:
    """把各种日期型输入格式化为 'YYYY-MM-DD'。"""
    if value is None or value == '':
        return ''
    if isinstance(value, datetime.datetime):
        return value.strftime('%Y-%m-%d')
    if isinstance(value, datetime.date):
        return value.strftime('%Y-%m-%d')
    return str(value)


def parse_date_range(start_text: Any, end_text: Any) -> tuple[datetime.date | None, datetime.date | None]:
    """统一解析日期区间。"""
    return parse_date(start_text), parse_date(end_text)
