# 配置生成器与网络工具集

这是一个基于 Flask 的配置生成器和网络工具集，提供了配置生成、IP 计算、文本转 YAML 等功能。

## 功能特性

- **配置生成器**：基于 YAML 数据和 Jinja2 模板生成配置文件
- **IP 计算器**：支持 IPv4 和 IPv6 地址计算
- **文本转 YAML**：将文本转换为 YAML 格式
- **YAML 合并**：合并多个 YAML 文件（开发中）

## 技术栈

- **后端**：Python 3.14, Flask 3.1.2
- **前端**：HTML, CSS, JavaScript
- **模板引擎**：Jinja2
- **数据格式**：YAML

## 安装步骤

1. **克隆项目**

   ```bash
   git clone <项目地址>
   cd <项目目录>
   ```

2. **创建虚拟环境**

   ```bash
   python3 -m venv .venv
   ```

3. **激活虚拟环境**

   - macOS/Linux:
     ```bash
     source .venv/bin/activate
     ```
   - Windows:
     ```bash
     .venv\Scripts\activate
     ```

4. **安装依赖**

   ```bash
   pip install -r requirements.txt
   ```

## 运行项目

```bash
python run.py
```

项目将在 `http://localhost:5000` 上运行。

## 项目结构

```
.
├── app/                    # 应用主目录
│   ├── auth/               # 认证模块（未使用）
│   ├── main/               # 主要功能模块
│   │   ├── data/           # 数据文件目录
│   │   ├── templates/      # 模板文件目录
│   │   ├── __init__.py     # 模块初始化文件
│   │   └── views.py        # 视图函数
│   ├── static/             # 静态文件目录
│   │   ├── css/            # CSS 文件
│   │   └── js/             # JavaScript 文件
│   ├── templates/          # 全局模板文件
│   └── __init__.py         # 应用初始化文件
├── instance/               # 配置文件目录
│   └── config.py           # 配置文件
├── requirements.txt        # 依赖项文件
├── run.py                  # 应用入口文件
└── README.md               # 项目文档
```

## 使用指南

### 配置生成器

1. 访问 `http://localhost:5000/main`
2. 选择或输入 YAML 数据和 Jinja2 模板
3. 点击 "生成配置" 按钮
4. 查看生成的配置结果

### IP 计算器

1. 访问 `http://localhost:5000/main/calc`
2. 输入 IPv4 或 IPv6 地址（支持批量输入）
3. 点击 "计算" 按钮
4. 查看计算结果

### 文本转 YAML

1. 访问 `http://localhost:5000/main/text-to-yaml`
2. 输入文本内容
3. 点击 "转换" 按钮
4. 查看转换后的 YAML 格式

## 配置说明

配置文件位于 `instance/config.py`，包含以下配置项：

- `DEBUG`：调试模式开关
- `SECRET_KEY`：Flask 应用密钥

## 注意事项

- 本项目目前处于开发阶段，部分功能可能尚未完全实现
- 请不要在生产环境中使用默认的 `SECRET_KEY`
- 确保在生产环境中设置 `DEBUG = False`

## 贡献

欢迎提交 Issue 和 Pull Request 来改进这个项目。

## 许可证

本项目采用 MIT 许可证。
