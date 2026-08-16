"""生产环境 WSGI 入口，供 gunicorn / uwsgi 等 WSGI server 加载。

用法（典型）：
    gunicorn -w 4 -b 127.0.0.1:8000 wsgi:app

注意：
  - 与开发入口 run.py 解耦：此文件 **不包含 debug=True**，避免生产误开启 debugger。
  - create_app 内部会读取 instance/config.py；如果文件缺失，Flask 会抛出
    `ModuleNotFoundError: No module named 'instance.config'`，请先复制一份
    instance/config.example.py（如果有）或新建 instance/config.py 最小版：
        class Config:
            SECRET_KEY = '请改成随机字符串'
"""

from app import create_app

app = create_app()

if __name__ == '__main__':
    # 仅用于快速本地冒烟：python wsgi.py
    # 生产请用 gunicorn
    app.run(host='127.0.0.1', port=8000, debug=False)
