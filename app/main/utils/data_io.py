"""数据读写工具：读取 `app/main/data/` 目录下的 yaml/json 文件。"""

from __future__ import annotations

import json
import os
from typing import Any

try:
    import yaml  # type: ignore
except ImportError:  # pragma: no cover - PyYAML 是项目依赖，这里只是容错
    yaml = None


DATA_DIR = os.path.join(os.path.dirname(os.path.dirname(__file__)), 'data')
SINGLE_TEMPLATE_DIR = os.path.join(DATA_DIR, 'scene_single_template')
MULTI_TEMPLATE_DIR = os.path.join(DATA_DIR, 'scene_multi_template')


def _read_text(path: str) -> str:
    """读取文本文件，不存在或读取失败返回空串。"""
    if not path or not os.path.exists(path):
        return ''
    try:
        with open(path, 'r', encoding='utf-8') as f:
            return f.read()
    except OSError:
        return ''


def read_json_file(filename: str) -> Any:
    """从 `data/` 目录读取 JSON 文件内容；失败返回 None。"""
    path = os.path.join(DATA_DIR, filename)
    text = _read_text(path)
    if not text:
        return None
    try:
        return json.loads(text)
    except (TypeError, ValueError):
        return None


def read_yaml_file(filename: str) -> Any:
    """从 `data/` 目录读取 YAML 文件内容；失败返回 None。"""
    if yaml is None:  # pragma: no cover
        return None
    path = os.path.join(DATA_DIR, filename)
    text = _read_text(path)
    if not text:
        return None
    try:
        return yaml.safe_load(text)
    except (TypeError, ValueError):
        return None


def read_single_template_file(filename: str) -> str:
    """从 `scene_single_template/` 读取文件内容（通常用于示例 YAML/J2）。"""
    return _read_text(os.path.join(SINGLE_TEMPLATE_DIR, filename))


def read_file_under_data(relative_path: str) -> str:
    """读取 `data/` 下相对路径的文件内容。"""
    return _read_text(os.path.join(DATA_DIR, relative_path))
