"""main 蓝图的路由层。

本文件只应包含：
- Flask 路由装饰器与视图函数
- 对 request / jsonify / render_template 的使用
- 必要的 HTTP 状态处理

所有业务逻辑在 `main.services` 中，通用工具在 `main.utils`。
"""

from flask import render_template, request, jsonify, make_response
from . import main_bp

from .services.config_generator_service import (
    list_template_names,
    list_scenarios,
    load_scenario,
    parse_and_render,
    build_zip_bytes,
)
from .services.ip_calc_service import batch_calculate
from .services.ip_scan_service import scan_cidr, scan_multiple
from .services.ip_info_service import get_requester_ip, enrich_ip_info
from .utils.data_io import read_single_template_file


# ---------------------------------------------------------------------------
# 配置生成器（config_generator.html）
# ---------------------------------------------------------------------------
@main_bp.route('/')
def show_generator():
    return render_template('config_generator.html')


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
# IP扫描（ip_scan.html）
# ---------------------------------------------------------------------------
@main_bp.route('/ip-scan')
def show_ip_scan():
    return render_template('ip_scan.html')


@main_bp.route('/scan-ip', methods=['POST'])
def scan_ip():
    data = request.get_json() or {}
    cidr = data.get('cidr', '') or ''
    if not cidr:
        return jsonify(error='请输入IP地址段'), 400
    result = scan_multiple(cidr)
    if 'error' in result:
        return jsonify(result), 400
    return jsonify(result)


# ---------------------------------------------------------------------------
# 拓扑（topology.html）
# ---------------------------------------------------------------------------
@main_bp.route('/topology')
def show_topology():
    return render_template('topology.html')


# ---------------------------------------------------------------------------
# IP信息（ip_info.html）：展示访问者的公网IP & 地理位置/ASN
#   - GET /main/ip-info             -> 页面
#   - GET /main/api/my-ip           -> JSON API，可直接 curl
#   - GET /main/api/my-ip/plain     -> 纯文本 IP，一行
# ---------------------------------------------------------------------------
@main_bp.route('/ip-info')
def show_ip_info():
    return render_template('ip_info.html')


@main_bp.route('/api/my-ip', methods=['GET'])
def api_my_ip():
    client_ip = get_requester_ip(request)
    info = enrich_ip_info(client_ip)
    return jsonify(info)


@main_bp.route('/api/my-ip/plain', methods=['GET'])
def api_my_ip_plain():
    client_ip = get_requester_ip(request) or ''
    resp = make_response(client_ip + '\n')
    resp.headers['Content-Type'] = 'text/plain; charset=utf-8'
    resp.headers['Cache-Control'] = 'no-store'
    return resp
