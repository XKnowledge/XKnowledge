from flask import Flask
from flask_cors import CORS
from source.xk_mainview import MainBlueprint

if __name__ == "__main__":
    """软件入口"""
    app = Flask(__name__, static_folder="static", template_folder="templates")
    CORS(app)  # 启用 CORS
    app.register_blueprint(MainBlueprint.creator_blueprint())  # 在app中注册蓝图
    print(app.url_map)
    app.run(debug=True)  # 以debug模式运行应用
