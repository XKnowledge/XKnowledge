from flask import Flask, Blueprint, send_from_directory
from flask.views import MethodView

from storage.xk_datamanager import global_data_manager
from xk_homepage import XKHomePageViewAPI
from xk_mainview import XKMainViewAPI
from flask_cors import CORS


class XKExportFileViewAPI(MethodView):

    def get(self):
        # 导出文件之前先保存文件
        global_data_manager.save_json()
        return send_from_directory(global_data_manager.root_folder, global_data_manager.file_name,
                                   as_attachment=True)


if __name__ == "__main__":
    """软件入口"""
    app = Flask(__name__, static_folder="static", template_folder="templates")

    # 允许所有域名访问，并允许凭证
    CORS(app, resources={r"/*": {"origins": "*", "allow_credentials": True}})

    blueprint = Blueprint("XKnowledge", __name__, url_prefix="/", static_folder="static",
                          template_folder="templates")
    blueprint.add_url_rule("/", view_func=XKHomePageViewAPI.as_view("XKHomePageView"))
    blueprint.add_url_rule("XKMainView", view_func=XKMainViewAPI.as_view("XKMainView"))
    blueprint.add_url_rule("XKExportFile", view_func=XKExportFileViewAPI.as_view("XKExportFile"))

    app.register_blueprint(blueprint)  # 在app中注册蓝图

    print(app.url_map)
    app.run(port=5000)
