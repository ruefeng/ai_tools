"""配置生成器子页面的业务逻辑。

对外暴露的核心接口：
- list_template_names()
- list_scenarios()
- load_scenario(name)
- parse_and_render(data)
- build_zip_bytes(device_configs, archive_name)

所有函数都是纯逻辑，不依赖 Flask 的 request/response，便于在 views 之外调用与测试。
"""

from __future__ import annotations

import io
import os
import zipfile
from typing import Any

try:
    import yaml  # type: ignore
except ImportError:  # pragma: no cover
    yaml = None

from jinja2 import Environment, FileSystemLoader

from ..utils import data_io as _data_io


# 模块级 Jinja2 环境：以 data 目录为根，便于在任何 .j2 上做 include/继承。
_env = Environment(loader=FileSystemLoader(_data_io.DATA_DIR))


# ---------------------------------------------------------------------------
# 列表 / 元数据
# ---------------------------------------------------------------------------
def list_template_names() -> list[str]:
    """列出 single 模板可用项（`scene_single_template/<name>.yaml` + `<name>.j2`）。"""
    if not os.path.exists(_data_io.SINGLE_TEMPLATE_DIR):
        return []
    names: set[str] = set()
    for filename in os.listdir(_data_io.SINGLE_TEMPLATE_DIR):
        base, ext = os.path.splitext(filename)
        if ext not in ('.yaml', '.j2'):
            continue
        if not base.startswith('example'):
            continue
        if (os.path.exists(os.path.join(_data_io.SINGLE_TEMPLATE_DIR, base + '.yaml')) and
                os.path.exists(os.path.join(_data_io.SINGLE_TEMPLATE_DIR, base + '.j2'))):
            names.add(base)
    return sorted(names)


def list_scenarios() -> list[str]:
    """列出场景子目录（scene_multi_template/<name>/）。"""
    if not os.path.exists(_data_io.MULTI_TEMPLATE_DIR):
        return []
    try:
        entries = os.listdir(_data_io.MULTI_TEMPLATE_DIR)
    except OSError:
        return []
    scenarios: list[str] = []
    for entry in entries:
        full_path = os.path.join(_data_io.MULTI_TEMPLATE_DIR, entry)
        if os.path.isdir(full_path) and not entry.startswith('.'):
            scenarios.append(entry)
    return sorted(scenarios)


# ---------------------------------------------------------------------------
# 场景加载
# ---------------------------------------------------------------------------
def load_scenario(scenario_name: str) -> dict[str, Any] | None:
    """读取一个场景目录下所有 yaml+j2，生成前端可消费的字典。

    返回失败返回 None；成功返回：
      { 'name': str,
        'role_templates': {role: role_name_in_j2},
        'role_template_info': {role: {template_name, template_exists}},
        'example_yaml': str,
        '_scenario_dir': str (内部用于渲染时查 j2 文件路径) }
    """
    if not scenario_name:
        return None
    scene_dir = os.path.join(_data_io.MULTI_TEMPLATE_DIR, scenario_name)
    if not os.path.isdir(scene_dir):
        return None

    role_names: set[str] = set()
    for filename in os.listdir(scene_dir):
        base, ext = os.path.splitext(filename)
        if ext in ('.yaml', '.j2'):
            role_names.add(base)

    if not role_names:
        return None

    role_templates: dict[str, str] = {}
    role_template_info: dict[str, dict[str, Any]] = {}
    example_data: dict[str, Any] = {}

    for role in sorted(role_names):
        j2_path = os.path.join(scene_dir, role + '.j2')
        exists = os.path.exists(j2_path)
        role_template_info[role] = {
            'template_name': role,
            'template_exists': exists,
        }
        if exists:
            role_templates[role] = role

        yaml_path = os.path.join(scene_dir, role + '.yaml')
        if yaml is not None and os.path.exists(yaml_path):
            try:
                with open(yaml_path, 'r', encoding='utf-8') as f:
                    parsed = yaml.safe_load(f)
            except OSError:
                parsed = None
            if isinstance(parsed, dict):
                # 扁平单设备 dict：按 hostname 聚合
                if not any(isinstance(v, dict) for v in parsed.values()):
                    host = parsed.get('hostname') or role
                    parsed.setdefault('role', role)
                    example_data[host] = parsed
                else:
                    try:
                        example_data.update(parsed)
                    except (TypeError, ValueError):
                        pass

    example_yaml_text = ''
    if yaml is not None and example_data:
        try:
            example_yaml_text = yaml.safe_dump(
                example_data, allow_unicode=True, sort_keys=False, default_flow_style=False
            )
        except yaml.YAMLError:
            example_yaml_text = ''

    return {
        'name': scenario_name,
        'role_templates': role_templates,
        'role_template_info': role_template_info,
        'example_yaml': example_yaml_text,
        '_scenario_dir': scene_dir,
    }


# ---------------------------------------------------------------------------
# 渲染
# ---------------------------------------------------------------------------
def _is_failed_device_config(cfg: dict[str, Any]) -> bool:
    content = (cfg.get('config') or '').strip()
    return content.startswith('# ERROR')


def render_devices(yaml_data: Any,
                   template_str: str | None = None,
                   scenario_cfg: dict[str, Any] | None = None
                   ) -> tuple[str, list[dict[str, Any]], list[tuple[str, str]]]:
    """按设备逐个渲染配置。

    返回 (all_text: str, device_configs: list[dict], missing_templates: list[(role, j2_name)])
    """
    if not isinstance(yaml_data, dict):
        yaml_data = {}

    missing_templates: list[tuple[str, str]] = []
    is_scenario_mode = scenario_cfg is not None
    scenario_dir = scenario_cfg.get('_scenario_dir') if scenario_cfg else None

    # 场景模式：预先根据 role 到对应的 j2 文件内容
    role_template_objs: dict[str, Any] = {}
    if is_scenario_mode and scenario_dir:
        for role, tpl_name in (scenario_cfg.get('role_templates') or {}).items():
            tpl_path = os.path.join(scenario_dir, tpl_name + '.j2')
            try:
                with open(tpl_path, 'r', encoding='utf-8') as f:
                    content = f.read()
            except OSError:
                missing_templates.append((role, tpl_name))
                continue
            role_template_objs[role] = _env.from_string(content)

    single_template_obj = None
    if not is_scenario_mode and template_str:
        single_template_obj = _env.from_string(template_str)

    # 顶层结构：默认 `hostname -> {...}`；若值中没有 dict，则视为单个扁平设备
    has_device_level = any(isinstance(v, dict) for v in yaml_data.values())
    if not has_device_level and yaml_data:
        hostname = yaml_data.get('hostname') or yaml_data.get('name') or 'device'
        device_items: list[tuple[str, Any]] = [(str(hostname), yaml_data)]
    else:
        device_items = list(yaml_data.items())

    device_configs: list[dict[str, Any]] = []
    blocks: list[str] = []
    for hostname, config in device_items:
        header = "## ==================================\n## DEVICE: {0}\n## ==================================\n".format(hostname)
        role = config.get('role') if isinstance(config, dict) else None
        tpl = role_template_objs.get(role) if is_scenario_mode else single_template_obj

        if tpl is None:
            if is_scenario_mode:
                msg = "# ERROR: 未为 role='{0}' 的设备 '{1}' 配置模板\n".format(role, hostname)
            else:
                msg = "# ERROR: 没有可用的模板\n"
            blocks.append(header + msg)
            device_configs.append({'hostname': hostname, 'role': role, 'config': msg})
            continue

        context: dict[str, Any] = {'hostname': hostname, 'devices': yaml_data, 'all_devices': yaml_data}
        if isinstance(config, dict):
            context.update(config)
        else:
            context['data'] = config

        rendered = tpl.render(**context)
        blocks.append(header + rendered + "\n")
        device_configs.append({'hostname': hostname, 'role': role, 'config': rendered})

    return "\n".join(blocks), device_configs, missing_templates


# ---------------------------------------------------------------------------
# 两个 POST 路由共用的 "解析 + 渲染"流程
# ---------------------------------------------------------------------------
def parse_and_render(data: dict[str, Any]) -> tuple[bool, dict[str, Any], int]:
    """解析请求体并执行渲染。

    返回 (ok: bool, payload: dict, http_status: int)。
    payload 中始终含 `status`/`message` 或成功时的 `rendered_config`、`device_configs` 等。
    """
    mode = data.get('mode', 'single')
    yaml_data_str = data.get('yaml_data', '') or ''
    j2_template_str = data.get('j2_template', '') or ''
    scenario_name = data.get('scenario_name', '') or ''

    parsed = None
    if yaml_data_str and yaml is not None:
        try:
            parsed = yaml.safe_load(yaml_data_str)
        except yaml.YAMLError as e:
            return False, {'status': 'error', 'message': 'YAML 解析错误: {0}'.format(e)}, 400

    scenario_cfg: dict[str, Any] | None = None
    template_str: str | None = None

    if mode == 'scenario':
        if not scenario_name:
            return False, {'status': 'error', 'message': '场景模式下必须提供 scenario_name'}, 400
        scenario_cfg = load_scenario(scenario_name)
        if scenario_cfg is None:
            return False, {'status': 'error',
                            'message': '加载场景 {0} 失败'.format(scenario_name)}, 400
    else:
        if not j2_template_str.strip():
            return False, {'status': 'error', 'message': '请先选择或填写 J2 模板'}, 400
        template_str = j2_template_str

    try:
        all_text, device_configs, missing = render_devices(
            parsed, template_str=template_str, scenario_cfg=scenario_cfg
        )
    except Exception as e:  # noqa: BLE001 - 任何模板异常都直接回显给前端
        return False, {'status': 'error', 'message': '渲染错误: {0}'.format(e)}, 400

    failed = [cfg for cfg in device_configs if _is_failed_device_config(cfg)]
    if missing or failed:
        parts: list[str] = []
        if missing:
            parts.append('场景中缺少模板文件: ' +
                         ', '.join('role={0}→{1}.j2'.format(r, n) for r, n in missing))
        if failed:
            parts.append('以下设备未能匹配模板: ' +
                         ', '.join("{0}(role={1})".format(c['hostname'], c.get('role'))
                                   for c in failed))
        return False, {
            'status': 'error',
            'message': '；'.join(parts),
            'rendered_config': all_text,
            'device_configs': device_configs,
        }, 400

    return True, {
        'rendered_config': all_text,
        'device_configs': device_configs,
        'scenario_name': scenario_name if mode == 'scenario' else None,
    }, 200


# ---------------------------------------------------------------------------
# ZIP 打包
# ---------------------------------------------------------------------------
def build_zip_bytes(device_configs: list[dict[str, Any]]) -> bytes:
    """把每个设备的 config 写为 `<safe_hostname>.txt`，打 zip 返回 bytes。"""
    configs = device_configs or []
    buffer = io.BytesIO()
    with zipfile.ZipFile(buffer, 'w', zipfile.ZIP_DEFLATED) as zf:
        for item in configs:
            hostname = item.get('hostname') or 'unknown'
            safe_name = "".join(c if (c.isalnum() or c in "-_.") else '_'
                                 for c in str(hostname)) or 'device'
            zf.writestr(safe_name + '.txt', item.get('config', ''))
    buffer.seek(0)
    return buffer.getvalue()
