"""开发模式启动入口。

生产环境请使用 gunicorn + wsgi:app，不要使用本文件。
环境变量（可选）：
    HOST         监听地址，默认 127.0.0.1
    PORT         监听端口，默认 5000
    FLASK_DEBUG  设为 1 开启 debug，默认 0（关闭）
"""

import os

from app import create_app

app = create_app()

if __name__ == '__main__':
    host = os.environ.get('HOST', '127.0.0.1')
    port = int(os.environ.get('PORT', '5000'))
    debug = os.environ.get('FLASK_DEBUG', '0').strip().lower() in ('1', 'true', 'yes', 'on')
    app.run(host=host, port=port, debug=debug)
