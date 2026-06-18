"""main 蓝图的路由层。

本文件只应包含：
- Flask 路由装饰器与视图函数
- 对 request / jsonify / render_template 的使用
- 必要的 HTTP 状态处理

所有业务逻辑在 `main.services` 中，通用工具在 `main.utils`。
"""

from flask import render_template, request, jsonify, make_response
from . import main_bp

from .services.generator_service import (
    list_template_names,
    list_scenarios,
    load_scenario,
    parse_and_render,
    build_zip_bytes,
)
from .services.ip_calc_service import batch_calculate
from .utils.data_io import read_single_template_file


# ---------------------------------------------------------------------------
# 配置生成器（generator.html）
# ---------------------------------------------------------------------------
@main_bp.route('/')
def show_generator():
    return render_template('generator.html')


@main_bp.route('/options')
def get_options():
    """两个下拉框（模板名、场景名）使用的元数据。"""
    return jsonify({
        'templates': list_template_names(),
        'scenarios': list_scenarios(),
    })


@main_bp.route('/get_file_content/<filename>')
def get_file_content(filename):
    """示例 yaml 与 j2 内容。"""
    return jsonify(
        yaml_content=read_single_template_file(filename + '.yaml'),
        j2_content=read_single_template_file(filename + '.j2'),
    )


@main_bp.route('/get_scenario/<scenario_name>')
def get_scenario(scenario_name):
    cfg = load_scenario(scenario_name)
    if cfg is None:
        return jsonify(status='error', message='场景不存在或解析失败'), 404
    return jsonify({
        'name': cfg.get('name', scenario_name),
        'example_yaml': cfg.get('example_yaml', ''),
        'role_templates': cfg.get('role_templates', {}),
        'role_template_info': cfg.get('role_template_info', {}),
    })


@main_bp.route('/generate_config', methods=['POST'])
def generate_config():
    data = request.get_json() or {}
    ok, payload, status = parse_and_render(data)
    if not ok:
        return jsonify(**payload), status
    return jsonify(status='success', **payload)


@main_bp.route('/download_config_zip', methods=['POST'])
def download_config_zip():
    data = request.get_json() or {}
    ok, payload, status = parse_and_render(data)
    if not ok:
        return jsonify(**payload), status

    zip_bytes = build_zip_bytes(payload.get('device_configs') or [])
    archive_name = (payload.get('scenario_name') or 'configs')
    response = make_response(zip_bytes)
    response.headers['Content-Type'] = 'application/zip'
    response.headers['Content-Disposition'] = 'attachment; filename="{0}.zip"'.format(archive_name)
    return response


# ---------------------------------------------------------------------------
# IP 计算器（ip_calculator.html）
# ---------------------------------------------------------------------------
@main_bp.route('/calc')
def show_calc():
    return render_template('ip_calculator.html')


@main_bp.route('/calculated_ip', methods=['POST'])
def calculated_ip():
    data = request.get_json() or {}
    result = batch_calculate(
        data.get('ipv4_data', '') or '',
        data.get('ipv6_data', '') or '',
    )
    return jsonify(result)


# ---------------------------------------------------------------------------
# text-to-yaml / yaml-merge（纯前端，后端仅提供页面）
# ---------------------------------------------------------------------------
@main_bp.route('/text-to-yaml')
def show_text_to_yaml():
    return render_template('text_to_yaml.html')


@main_bp.route('/yaml-merge')
def show_yaml_merge():
    return render_template('yaml_merge.html')


# ---------------------------------------------------------------------------
# 拓扑（topology.html）
# ---------------------------------------------------------------------------
@main_bp.route('/topology')
def show_topology():
    return render_template('topology.html')
