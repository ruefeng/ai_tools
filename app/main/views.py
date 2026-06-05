import yaml
from jinja2 import Environment, FileSystemLoader
from flask import render_template, request, jsonify
from . import main_bp
import os

#IP计算模块导入
import ipaddress


DATA_DIR = os.path.join(os.path.dirname(__file__), 'data')

@main_bp.route('/')
def show_generator():
    files = []
    if os.path.exists(DATA_DIR):
        for filename in os.listdir(DATA_DIR):
            if filename.endswith('.yaml'):
                files.append(os.path.splitext(filename)[0])
    return render_template('generator.html', files=files)

@main_bp.route('/get_file_content/<filename>')
def get_file_content(filename):
    yaml_path = os.path.join(DATA_DIR, f'{filename}.yaml')
    j2_path = os.path.join(DATA_DIR, f'{filename}.j2')
    
    yaml_content = ""
    j2_content = ""
    
    if os.path.exists(yaml_path):
        with open(yaml_path, 'r', encoding='utf-8') as f:
            yaml_content = f.read()
    
    if os.path.exists(j2_path):
        with open(j2_path, 'r', encoding='utf-8') as f:
            j2_content = f.read()

    return jsonify(yaml_content=yaml_content, j2_content=j2_content)

@main_bp.route('/generate_config', methods=['POST'])
def generate_config():
    data = request.get_json()
    yaml_data_str = data.get('yaml_data', '')
    j2_template_str = data.get('j2_template', '')

    try:
        yaml_data = yaml.safe_load(yaml_data_str)
        if yaml_data is None:
            yaml_data = {}
        
        # 保持函数纯粹：直接使用 YAML 数据渲染
        # 数据格式由各前端页面自己处理
        template_context = {}
        
        if isinstance(yaml_data, dict):
            template_context.update(yaml_data)
        
        env = Environment(loader=FileSystemLoader(os.path.dirname(__file__)))
        template = env.from_string(j2_template_str)
        rendered_config = template.render(**template_context)

        return jsonify(
            status='success', 
            rendered_config=rendered_config, 
            received_json=data
        )
    except yaml.YAMLError as e:
        return jsonify(
            status='error', 
            message=f'YAML解析错误: {str(e)}', 
            received_json=data
        ), 400
    except Exception as e:
        return jsonify(
            status='error', 
            message=f'渲染错误: {str(e)}', 
            received_json=data
        ), 400

@main_bp.route('/calc')
def show_calc():
    # files = []
    # if os.path.exists(DATA_DIR):
    #     for filename in os.listdir(DATA_DIR):
    #         if filename.endswith('.yaml'):
    #             files.append(os.path.splitext(filename)[0])
    # return render_template('ip_calculator.html', files=files)
    return render_template('ip_calculator.html')


@main_bp.route('/text-to-yaml')
def show_text_to_yaml():
    return render_template('text_to_yaml.html')


@main_bp.route('/yaml-merge')
def show_yaml_merge():
    return render_template('yaml_merge.html')


@main_bp.route('/topology')
def show_topology():
    return render_template('topology.html')


@main_bp.route('/ucore-pe')
def show_ucore_pe():
    files = []
    if os.path.exists(DATA_DIR):
        for filename in os.listdir(DATA_DIR):
            if filename.endswith('.j2'):
                files.append(filename)
    return render_template('ucore_pe.html', files=files)


@main_bp.route('/get_j2_template/<filename>')
def get_j2_template(filename):
    j2_path = os.path.join(DATA_DIR, filename)
    j2_content = ""
    
    if os.path.exists(j2_path):
        with open(j2_path, 'r', encoding='utf-8') as f:
            j2_content = f.read()
    
    return jsonify(j2_content=j2_content)


def calculate_ipv4(cidr):
    try:
        net = ipaddress.ip_network(cidr,strict = False)
        if net.prefixlen not in [30,31]:
            return None
        all_hosts = list(net.hosts())
        input_ip = ipaddress.ip_address(cidr.split('/')[0])
        if input_ip == all_hosts[0]:
            return str(all_hosts[1]) + '/' + cidr.split('/')[1],"success"
        elif input_ip == all_hosts[0]:
            return str(all_hosts[1]) + '/' + cidr.split('/')[1],"success"
        else:
            return None,"输入的IP地址不在网段内"
    except (ValueError, ipaddress.AddressValueError):
        return None,"无效的IPV4地址格式"

def calculate_ipv6(cidr):
    try:
        net = ipaddress.ip_network(cidr, strict=False)
        if net.prefixlen not in [126, 127]:
                return None, "掩码必须是 /126 或 /127。"
        all_hosts = list(net.hosts())
        input_ip = ipaddress.ip_address(cidr.split('/')[0])
        try:
            input_index = all_hosts.index(input_ip)
        except ValueError:
            return None, "输入的IP地址不在该子网内。"
        other_host = all_hosts[1 - input_index]
        # 返回压缩并小写的IPv6地址
        return str(other_host).lower() + '/'+ str(net.prefixlen),"success"
    except(ValueError, ipaddress.AddressValueError):
        return None, "无效的IPV6地址"

def format_ipv4(ip_str):
    """格式化IPv4地址"""
    try:
        ip = ipaddress.ip_address(ip_str.split('/')[0])
        prefix = ip_str.split('/')[1] if '/' in ip_str else ''
        return str(ip) + ('/' + prefix if prefix else '')
    except:
        return ip_str

def format_ipv6(ip_str):
    """格式化IPv6地址：压缩并转小写"""
    try:
        ip = ipaddress.ip_address(ip_str.split('/')[0])
        prefix = ip_str.split('/')[1] if '/' in ip_str else ''
        return str(ip).lower() + ('/' + prefix if prefix else '')
    except:
        return ip_str

@main_bp.route('/calculated_ip', methods=['POST'])
def calculated_ip():
    data = request.get_json()
    ipv4_data_str = data.get('ipv4_data', '')
    ipv6_data_str = data.get('ipv6_data', '')

    ipv4_list = [line.strip() for line in ipv4_data_str.splitlines() if line.strip()]
    ipv6_list = [line.strip() for line in ipv6_data_str.splitlines() if line.strip()]

    ipv4_results = []
    ipv6_results = []
    
    # 格式化后的输入数据
    formatted_ipv4_input = []
    formatted_ipv6_input = []

    # 处理 IPv4 数据
    for cidr in ipv4_list:
        formatted_ipv4_input.append(format_ipv4(cidr))
        other_ip, status = calculate_ipv4(cidr)
        if status == "success":
            ipv4_results.append(other_ip)
        else:
            ipv4_results.append(f"错误: {status}")

    # 处理 IPv6 数据
    for cidr in ipv6_list:
        formatted_ipv6_input.append(format_ipv6(cidr))
        other_ip, status = calculate_ipv6(cidr)
        if status == "success":
            ipv6_results.append(other_ip)
        else:
            ipv6_results.append(f"错误: {status}")

    ipv4_output_text = "\n".join(ipv4_results)
    ipv6_output_text = "\n".join(ipv6_results)
    
    # 格式化后的输入文本
    formatted_ipv4_input_text = "\n".join(formatted_ipv4_input)
    formatted_ipv6_input_text = "\n".join(formatted_ipv6_input)

    return jsonify({
        "ipv4_results_text": ipv4_output_text,
        "ipv6_results_text": ipv6_output_text,
        "formatted_ipv4_input": formatted_ipv4_input_text,
        "formatted_ipv6_input": formatted_ipv6_input_text,
        # 返回数组格式用于表格展示
        "ipv4_results_array": ipv4_results,
        "ipv6_results_array": ipv6_results,
        "formatted_ipv4_array": formatted_ipv4_input,
        "formatted_ipv6_array": formatted_ipv6_input
    })