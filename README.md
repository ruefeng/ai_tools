# AI Tools 网络工具箱

这是一个基于 Flask 的网络运维工具集合，提供配置生成、IP 地址计算、文本转 YAML、YAML 合并和链路拓扑图等功能。前端使用原生 HTML、CSS 和 JavaScript，后端负责页面路由、配置模板渲染和部分数据处理。

## 功能

- 配置生成：基于 YAML 数据和 Jinja2 模板批量生成设备配置，支持单模板和多角色场景模板。
- IP 计算：批量输入 IPv4/IPv6 地址并计算对端地址，支持表格粘贴和结果复制。
- 文本转 YAML：将按空白分列的文本转换为 YAML 格式。
- YAML 合并：按 topKey 合并两份 YAML 数据。
- 链路拓扑图：从 Excel、CSV 或粘贴表格导入链路数据，生成可交互拓扑图，支持拖动节点、保存布局和导入导出 JSON。

## 技术栈

- Python 3
- Flask 3.1.2
- Jinja2 3.1.6
- PyYAML 6.0.1
- 原生 HTML / CSS / JavaScript
- vis-network 和 xlsx 前端库，用于拓扑图与表格文件解析

## 快速开始

1. 克隆或进入项目目录。

   ```powershell
   cd C:\Users\suny\Desktop\ai_tools
   ```

2. 创建并激活虚拟环境。

   Windows PowerShell:

   ```powershell
   python -m venv venv
   .\venv\Scripts\Activate.ps1
   ```

   Windows CMD:

   ```cmd
   python -m venv venv
   venv\Scripts\activate
   ```

3. 安装依赖。

   ```bash
   pip install -r requirements.txt
   ```

4. 启动服务。

   ```bash
   python run.py
   ```

5. 打开浏览器访问：

   ```text
   http://127.0.0.1:5000/
   ```

## 页面入口

- 首页：`/`
- 配置生成：`/main/`
- IP 计算：`/main/calc`
- 文本转 YAML：`/main/text-to-yaml`
- YAML 合并：`/main/yaml-merge`
- 链路拓扑图：`/main/topology`

## 项目结构

```text
.
├── app/
│   ├── __init__.py              # Flask 应用工厂和蓝图注册
│   ├── static/
│   │   ├── css/                 # 全局样式和拓扑页样式
│   │   ├── files/               # 静态数据文件
│   │   └── js/                  # 前端交互脚本
│   ├── templates/               # 全局模板：首页和基础布局
│   └── main/
│       ├── __init__.py          # main 蓝图
│       ├── views.py             # 页面和接口路由
│       ├── data/                # YAML/Jinja2 示例与场景模板
│       ├── services/            # 配置生成、IP 计算等业务逻辑
│       ├── templates/           # main 蓝图页面模板
│       └── utils/               # 通用数据读取与辅助函数
├── instance/
│   └── config.py                # 本地 Flask 配置
├── requirements.txt             # Python 依赖
├── run.py                       # 启动入口
└── README.md
```

## 配置说明

本地配置位于 `instance/config.py`：

```python
class Config:
    DEBUG = True
    SECRET_KEY = 'your_secret_key'
```

生产环境应关闭 `DEBUG`，并使用安全的 `SECRET_KEY`。如果需要从环境变量读取配置，可以在 `instance/config.py` 中扩展。

## 开发说明

- 新增页面时，优先在 `app/main/templates/` 添加模板，在 `app/main/views.py` 注册路由。
- 后端业务逻辑应放在 `app/main/services/`，避免让路由函数承担复杂处理。
- 通用文件读取、YAML/JSON 处理等工具应放在 `app/main/utils/`。
- 新增模板示例时，将 `.yaml` 和 `.j2` 文件放到 `app/main/data/` 下对应场景目录。

## 注意事项

- 当前项目使用 Flask 开发服务器运行，生产部署时应改用 Gunicorn、Waitress 或其他 WSGI 服务器。
- 拓扑页依赖前端 CDN 加载 `vis-network` 和 `xlsx`，离线环境需要改成本地静态资源。
- 不要提交虚拟环境、缓存文件、日志文件和本地临时数据。
