# ai_tools · 配置生成器与网络工具箱

一个基于 Flask 的**网络工程师工作台**，内置 6 个独立子工具：配置生成（支持 Jinja2 单模板 / 场景一对多模板）、P2P 互联 IP 计算（IPv4/IPv6）、Excel 文本转 YAML/JSON、双 YAML 合并、IP 段拆分与存活扫描（ICMP 并发 ping）、链路拓扑可视化（vis-network）。

所有页面走**薄 View + Services/Utils 分层**的模块化架构，业务逻辑可在 Flask 之外独立调用与单测。

---

## 功能总览（6 个子页面）

首页 `http://localhost:5000/` 为卡片式导航，所有子页面均可直接复制结果或批量处理：

| 卡片 | 路由 | 能力说明 |
|---|---|---|
| 配置生成 | `/main/` | 双模式：① 单模板 (YAML + 1 份 J2) ② 场景模式 (1 份 YAML + 多 role J2)；渲染后按设备打包 ZIP 下载 |
| 互联 IP 计算 | `/main/calc` | 批量输入 P2P IPv4/IPv6 CIDR，计算对端地址、网络号、广播、子网掩码等并格式化输出 |
| 文本转 YAML/JSON | `/main/text-to-yaml` | 粘贴 Excel/表格纯文本，自动解析为对象并实时互转 YAML ↔ JSON（防抖 250ms） |
| YAML 数据块合并 | `/main/yaml-merge` | 粘贴两份 YAML，按 Top-Key 合入同一份，同时输出 YAML / JSON 两种结果 |
| IP 段扫描 | `/main/ip-scan` | 多行 CIDR 输入 → 掩码 < 24 自动拆 /24 段 → 段间 + 段内各 16 线程并发 ICMP ping → 三列 UI 展示网段与存活 IP |
| 拓扑生成 | `/main/topology` | 导入 Excel (SheetJS) 或 JSON 链路数据 → vis-network 渲染拓扑图，支持节点拖拽、布局持久化 |

---

## 技术栈

### 后端（Python）
| 层 | 组件 / 规范 |
|---|---|
| Web 框架 | **Flask 3.1.2**（Blueprint 注册在 `url_prefix='/main'`） |
| 模板引擎 | **Jinja2**（模块级 `Environment` + `FileSystemLoader` 指向 `app/main/data/`） |
| 数据格式 | **PyYAML 6.0.1**（全程 `safe_load` / `safe_dump`，`allow_unicode=True`） |
| 并发模型 | `concurrent.futures.ThreadPoolExecutor`，默认 `MAX_WORKERS = 16`（用户指定） |
| 存活探测 | 系统原生 ICMP `ping -c 1 -W 500`（macOS/Linux），准确性优先 |
| Python 版本要求 | **≥ 3.8**（使用 `from __future__ import annotations`、`ipaddress` 标准库） |

### 前端（原生 JS，无构建）
| 能力 | 依赖 / 方案 |
|---|---|
| DOM/交互 | 原生 JS（ES 模块风格代码，无需 npm 打包） |
| YAML ↔ JSON 互转 | [js-yaml 4.1.0](https://cdn.jsdelivr.net/npm/js-yaml@4.1.0/dist/js-yaml.min.js)（CDN） |
| Excel 导入 | [SheetJS / xlsx 0.18.5](https://cdn.jsdelivr.net/npm/xlsx@0.18.5/dist/xlsx.full.min.js)（CDN） |
| 拓扑可视化 | [vis-network](https://unpkg.com/vis-network/standalone/umd/vis-network.min.js)（CDN） |
| CSS 命名 | BEM + 组件化样式；页面级 CSS 独立文件 |

---

## 快速开始

### 1. 安装 & 启动

```bash
# 克隆
git clone https://github.com/ruefeng/ai_tools.git
cd ai_tools

# 虚拟环境
python3 -m venv .venv
source .venv/bin/activate   # macOS / Linux
# .venv\Scripts\activate    # Windows

# 依赖
pip install -r requirements.txt

# 启动（默认 http://localhost:5000）
python run.py
```

打开浏览器访问：
- 首页导航：http://localhost:5000/
- 配置生成页（默认页）：http://localhost:5000/main/

### 2. 最小功能验证

```bash
# 验证所有页面 200（项目内已通过 smoke test）
python - <<'PY'
from app import create_app
app = create_app()
with app.test_client() as c:
    for url in ['/', '/main/', '/main/calc', '/main/text-to-yaml',
                '/main/yaml-merge', '/main/topology', '/main/ip-scan', '/main/options']:
        r = c.get(url)
        print(f"{r.status_code}  {url}")
PY
```

---

## 页面路由 & API 速查

| Method | 路由 | 说明 |
|---|---|---|
| GET | `/` | 首页导航卡片（对应 `app/templates/index.html`） |
| GET | `/main/` | 配置生成器 UI |
| GET | `/main/options` | 配置页两个下拉框元数据：templates / scenarios（JSON） |
| GET | `/main/get_file_content/<name>` | 读取 single 模板示例（name + `.yaml` / `.j2`） |
| GET | `/main/get_scenario/<scenario_name>` | 加载一对多场景的 role 模板与示例 YAML |
| POST | `/main/generate_config` | 渲染配置：body `{mode, yaml_data, j2_template?, scenario_name?}` |
| POST | `/main/download_config_zip` | 同上，但返回 `application/zip` 按设备名 `.txt` 打包 |
| POST | `/main/calculated_ip` | IPv4/IPv6 批量计算：body `{ipv4_data, ipv6_data}` |
| GET | `/main/ip-scan` | IP 段扫描 UI |
| POST | `/main/scan-ip` | 执行扫描：body `{cidr: "多行文本"}` → 返回 `{subnet_count, total_alive_count, subnets:[...]}` |
| GET | `/main/text-to-yaml` | 纯前端页面 |
| GET | `/main/yaml-merge` | 纯前端页面（使用 js-yaml 浏览器端互转） |
| GET | `/main/topology` | 拓扑页面（Excel/JSON 上传解析在前端完成） |

---

## 项目结构（模块化架构）

核心原则：**View 只留路由分发**；业务逻辑抽 `services/`；文件 IO / 纯工具放 `utils/`。

```
.
├── run.py                                # 入口：create_app() + app.run(debug=True)
├── requirements.txt                      # Flask 3.1.2 + PyYAML 6.0.1
├── instance/
│   └── config.py                         # DEBUG / SECRET_KEY
├── app/
│   ├── __init__.py                       # create_app(); 注册 main_bp(url_prefix='/main')
│   ├── templates/                        # 全局模板
│   │   ├── base.html                     # banner/card-grid 通用骨架；{% block scripts %}
│   │   └── index.html                    # 首页 6 张导航卡片
│   ├── static/                           # 静态资源（前端生态统一 kebab-case）
│   │   ├── css/
│   │   │   ├── style.css                 # 全站公用（banner / card / column / 按钮 / 文本框）
│   │   │   ├── ip-scan.css               # 三列布局 + 网段列表/存活IP卡片样式
│   │   │   └── topology.css              # vis-network 画布尺寸
│   │   └── js/
│   │       ├── config-generator.js       # 配置生成：二级下拉 + 自定义浮层 + ZIP下载
│   │       ├── ip-calculator.js          # IP计算器交互
│   │       ├── ip-scan.js                # 扫描: POST /scan-ip → 三列联动(网段选→IP列)
│   │       ├── text-to-yaml.js           # 文本↔YAML↔JSON (防抖250ms)
│   │       ├── yaml-merge.js             # 双输入合并 + 双列输出
│   │       └── topology.js               # Excel解析 → vis-network 节点/边/拖拽布局
│   └── main/                             # main 蓝图包
│       ├── __init__.py                   # main_bp = Blueprint('main', __name__, template_folder='templates')
│       ├── views.py                      # ✅ 纯路由层 (145行)，无业务逻辑
│       ├── services/                     # 每个子页面一个 service (纯函数、可单测)
│       │   ├── config_generator_service.py   # 配置生成: list_scenarios / load_scenario / render_devices / parse_and_render / build_zip_bytes
│       │   ├── ip_calc_service.py            # batch_calculate / calculate_ipv4|ipv6 / format_ipv4|ipv6
│       │   ├── ip_scan_service.py            # _parse_cidrs / split_to_24 / _ping_host / scan_subnet / scan_multiple
│       │   └── ip_info_service.py            # get_requester_ip / enrich_ip_info (公网IP & GeoIP 查询)
│       ├── utils/
│       │   └── data_io.py                    # DATA_DIR / SINGLE_TEMPLATE_DIR / MULTI_TEMPLATE_DIR；read_json_file / read_yaml_file / read_single_template_file
│       ├── templates/                        # 各子页面 Jinja2 模板（snake_case）
│       │   ├── config_generator.html
│       │   ├── ip_calculator.html
│       │   ├── text_to_yaml.html
│       │   ├── yaml_merge.html
│       │   ├── ip_scan.html
│       │   └── topology.html
│       └── data/                             # 模板/场景数据（不放入 static，避免被误下载）
│           ├── scene_single_template/        # 一份 J2 + 一份 YAML 的示例模板对
│           │   ├── example1.yaml | example1.j2
│           │   └── example2.yaml | example2.j2
│           └── scene_multi_template/         # 一对多场景（每个子目录 = 一个场景）
│               ├── scene_bgp/                #   统一 scene_ 前缀，目录名即下拉选项值
│               │   ├── edgepe.yaml | edgepe.j2
│               │   ├── pe.yaml     | pe.j2
│               │   └── ucore.yaml  | ucore.j2
│               └── scene_edgepop_day1/       #   同一前缀：scene_edgepop_day1 / scene_bgp / scene_other …
│                   ├── all_edgepe_h3c.{yaml,j2}
│                   ├── all_edgepe_h3c_ztp.{yaml,j2}
│                   └── all_edgexsw_h3c.{yaml,j2}
```

---

## 命名规范（2026-07-30 起统一）

| 层级 | 约定 | 示例 |
|---|---|---|
| Python 模块 / 包 | PEP8 **snake_case**；Service 文件统一 `*_service.py` 后缀 | `config_generator_service.py`、`data_io.py` |
| `data/scene_multi_template/` 子目录 | 统一 **`scene_` 前缀**，杜绝 `scenario_` 混用 | `scene_bgp/`、`scene_edgepop_day1/` |
| Flask URL 路由 | URL 路径 **kebab-case** | `/main/text-to-yaml`、`/main/ip-scan` |
| HTML / Jinja2 模板 | snake_case（Flask/Jinja2 社区惯例）；与对应 service 前缀对齐 | `config_generator.html`、`text_to_yaml.html` |
| 静态资源（JS/CSS） | **Web 生态 kebab-case**（短横线），SEO & npm 惯例 | `config-generator.js`、`ip-scan.css`、`yaml-merge.js` |
| 模板内部 Jinja block 名 | 与 `base.html` 保持一致：`{% block scripts %}`（非 `extra_js`）| `{% block scripts %}` |

---

## 关键实现说明

### 1. IP 扫描策略（`ip_scan_service.py`）
- 掩码 ≥ 24 → 直接扫该段全部可用 IP；掩码 < 24 → 先 `split_to_24()` 拆成多个 `/24`，每段独立并发扫描
- 探测方法：系统 `ping -c 1 -W 500`，**ICMP 优先**（避免只 TCP 探测漏发现仅响应 ICMP 的主机）
- 并发：`MAX_WORKERS = 16`，每段内部 & 段之间都用该值（用户要求线程 ~16）
- 排序：返回的 `subnets[i].alive_ips` 在后端按 IP 数字序排序，前端直接 append
- 错误：无效 CIDR 后端返回 HTTP 400 + `{error: ...}`；前端使用 `AbortController` 支持超时取消

### 2. 配置生成双模式（`config_generator_service.py`）
- **single**：YAML 扁平结构若值中无 dict，自动用 `hostname`/`name` 作 top-key；否则默认顶层是 `{hostname: {...}}`
- **scenario（一对多）**：从 `scene_multi_template/<name>/` 下扫所有 role 的 YAML/J2，按 `role` 匹配置换 `tpl = role_template_objs.get(role)`；缺模板返回 400 + 缺失清单
- ZIP：每个设备一行 `## DEVICE: <safe_hostname>` + 内容，最终打成 `{scenario_name|configs}.zip`，文件名自动转义非法字符

---

## 配置文件

`instance/config.py`：

```python
class Config:
    DEBUG = True               # 生产环境必须 False
    SECRET_KEY = 'your_secret_key'   # 生产环境请替换为随机长串
```

⚠️ **注意事项**
- 默认 `SECRET_KEY` 仅用于开发，部署到公网前务必修改；
- IP 扫描依赖系统 `ping` 命令：macOS/Linux 原生可用，Windows 下需将参数改为 `ping -n 1 -w 500`；
- `/16` 等超大段（65536 主机）以当前 16 线程预计需要 10+ 分钟，如需生产级扫描建议接入 raw socket 的 Go/Rust 侧车服务。

---

## 许可证

MIT
