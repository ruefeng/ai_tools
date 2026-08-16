from flask import Flask, render_template
from werkzeug.middleware.proxy_fix import ProxyFix


def create_app():
    app = Flask(__name__)
    app.config.from_object('instance.config.Config')

    # 反向代理支持：Nginx 会设置 X-Forwarded-For / X-Forwarded-Proto 等头。
    # 信任层数从配置读取（TRUSTED_PROXY_HOPS=1 表示前面有一层 Nginx）；
    # 设为 0 时不启用 ProxyFix（直接暴露端口的场景）。
    proxy_hops = app.config.get('TRUSTED_PROXY_HOPS', 1)
    if proxy_hops and int(proxy_hops) > 0:
        app.wsgi_app = ProxyFix(
            app.wsgi_app,
            x_for=int(proxy_hops),
            x_proto=int(proxy_hops),
            x_host=int(proxy_hops),
            x_prefix=1,
        )

    @app.after_request
    def _security_headers(resp):
        resp.headers.setdefault('X-Content-Type-Options', 'nosniff')
        resp.headers.setdefault('X-Frame-Options', 'SAMEORIGIN')
        resp.headers.setdefault('Referrer-Policy', 'strict-origin-when-cross-origin')
        return resp

    @app.route('/')
    def index():
        return render_template('index.html')

    from .main import main_bp
    app.register_blueprint(main_bp, url_prefix='/main')

    return app
