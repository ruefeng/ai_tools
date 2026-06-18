"""text to yaml / yaml merge 子页面的业务逻辑。

当前前端主要依靠 js-yaml 在浏览器侧完成 yaml ⇄ json 互转与表格文本解析。
本模块保留对应的后端能力（parse_table_text），方便未来服务端复用 / 批量处理。

对外暴露：
- parse_table_text(text) -> dict  （按行、空白分列的文本 -> 聚合后的对象
- to_yaml(obj) -> str
- to_json(obj) -> str
"""

from __future__ import annotations

import json
from typing import Any

try:
    import yaml  # type: ignore
except ImportError:  # pragma: no cover
    yaml = None


def _split_line_tokens(line: str) -> list[str]:
    return [t for t in line.strip().split() if t]


def parse_table_text(text: str) -> dict[str, Any]:
    """把 'device ip vlan\\nsiteA 10.0.0.1 10\\n...' 这样的文本解析为聚合后的 dict。"""
    lines = [line for line in (text or '').splitlines() if line.strip()]
    if not lines:
        return {}

    headers = _split_line_tokens(lines[0])
    if not headers:
        return {}
    group_key = headers[0]

    grouped: dict[str, list[dict[str, Any]]] = {}
    for line in lines[1:]:
        tokens = _split_line_tokens(line)
        if not tokens:
            continue
        item: dict[str, Any] = {}
        for idx, key in enumerate(headers):
            item[key] = tokens[idx] if idx < len(tokens) else None
        group_value = item.get(group_key)
        if group_value is None:
            continue
        grouped.setdefault(group_value, []).append(item)

    # 只出现一次的 group 拍平为对象本身，与前端保持一致
    result: dict[str, Any] = {}
    for key, items in grouped.items():
        result[key] = items[0] if len(items) == 1 else items
    return result


def to_yaml(obj: Any) -> str:
    if yaml is None:  # pragma: no cover
        raise RuntimeError('PyYAML 未安装')
    return yaml.safe_dump(obj, allow_unicode=True, sort_keys=False, default_flow_style=False)


def to_json(obj: Any) -> str:
    return json.dumps(obj, ensure_ascii=False, indent=2)
