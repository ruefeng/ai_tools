"""Flask 实例配置。

所有配置项均支持通过环境变量覆盖，部署到云主机时推荐做法：
    export SECRET_KEY="$(python3 -c 'import secrets;print(secrets.token_hex(32))')"
    export FLASK_DEBUG=0
    export TRUSTED_PROXY_HOPS=1
"""

import os
import secrets


def _env_bool(key: str, default: bool) -> bool:
    val = os.environ.get(key)
    if val is None:
        return default
    return val.strip().lower() in ('1', 'true', 'yes', 'on')


class Config:
    # 生产环境必须通过环境变量 SECRET_KEY 覆盖；未设置时自动生成随机 key（重启后 session 失效，但不会崩溃）
    SECRET_KEY = os.environ.get('SECRET_KEY') or secrets.token_hex(32)

    # 开发时通过 FLASK_DEBUG=1 开启；生产默认 False
    DEBUG = _env_bool('FLASK_DEBUG', False)

    # JSON 响应中中文不转义
    JSON_AS_ASCII = False

    # 反向代理层数（Nginx 一般为 1）；设为 0 表示不启用 ProxyFix
    TRUSTED_PROXY_HOPS = int(os.environ.get('TRUSTED_PROXY_HOPS', '1'))

    # 请求体大小上限（拓扑 Excel 导入需要足够大）
    MAX_CONTENT_LENGTH = int(os.environ.get('MAX_CONTENT_LENGTH', str(20 * 1024 * 1024)))
