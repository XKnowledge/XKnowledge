import os

from flask import render_template, request, redirect, url_for, jsonify
from flask.views import MethodView
from wtforms import Form, StringField, IntegerField
from wtforms.validators import length

from storage.xk_datamanager import global_data_manager
from storage.xk_json import JsonFileHandler


class XKFileForm(Form):
    file_path = StringField(validators=[length(min=0, max=20, message="error")])
    node_list_length = IntegerField()
    node_list = StringField(validators=[length(min=0, max=20, message="error")])


class XKHomePageViewAPI(MethodView):
    """ 这个类相当于一个session，每一个session在内存中保有一个数据管理器 """

    def get(self):
        folder_path = "data"
        files_and_folders = os.listdir(folder_path)
        # todo 未来支持创建文件夹
        files = [file for file in files_and_folders if os.path.isfile(os.path.join(folder_path, file))]

        return render_template("xk_homepage.html", files=files)

    def post(self):
        form = request.form
        loads_json = JsonFileHandler.loads_json

        file_name = form.get('fileName')
        operation_type = form.get('operationType')
        if file_name is not None:
            # 复用了file_name
            file_name = loads_json(file_name)

        if operation_type == 'openFile':
            # 如果是打开文件，文件名就是全名
            global_data_manager.set_file_name(file_name)
            global_data_manager.open_file()

        if operation_type == 'createFile':
            # 如果是创建文件，文件名要加后缀
            global_data_manager.set_file_name("{0}.json".format(file_name))
            global_data_manager.create_file()

        if operation_type == 'deleteFile':
            # 如果是打开文件，文件名就是全名
            global_data_manager.set_file_name(file_name)
            global_data_manager.delete_file()

        if 'file' in request.files:
            file = request.files['file']
            if file.filename != '':
                if file:
                    file_path = os.path.join(global_data_manager.root_folder, file.filename)
                    file.save(file_path)
            return redirect(url_for("XKnowledge.XKHomePageView"))

        return jsonify("ok")
