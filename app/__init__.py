from flask import Flask, render_template

def create_app():
    app = Flask(__name__)
    app.config.from_object('instance.config.Config')

    @app.route('/')
    def index():
        return render_template('index.html')

    from .main import main_bp
    app.register_blueprint(main_bp, url_prefix='/main')

    return app
