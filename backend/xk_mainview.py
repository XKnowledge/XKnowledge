from flask import render_template, request, redirect, url_for, jsonify
from flask.views import MethodView
from wtforms import Form, StringField, IntegerField
from wtforms.validators import length

from storage.xk_json import JsonFileHandler
from storage.xk_datamanager import global_data_manager


class MainForm(Form):
    id = StringField(validators=[length(min=0, max=20, message="error")])
    node_list_length = IntegerField()
    node_list = StringField(validators=[length(min=0, max=20, message="error")])


class XKMainViewAPI(MethodView):
    """ 这个类相当于一个session，每一个session在内存中保有一个数据管理器 """

    def get(self):
        global_data_manager.package()
        print(global_data_manager.get_json())
        json_data = global_data_manager.get_json()
        # return render_template("xk_mainview.html", json_data=global_data_manager.get_json())
        return jsonify(json_data)

    def post(self):
        form = request.form
        loads_json = JsonFileHandler.loads_json

        if form.get('saveData') is not None:
            global_data_manager.save_json()
            return redirect(url_for("XKnowledge.XKMainView"))

        if form.get('reloadData') is not None:
            global_data_manager.reload()

        node_list = form.get('highlightNode')
        if node_list is not None:
            global_data_manager.highlight_node = loads_json(node_list)
            print(global_data_manager.highlight_node)

        link = form.get('highlightLink')
        if link is not None:
            global_data_manager.highlight_link = loads_json(link)
            print(global_data_manager.highlight_link)

        create_node = form.get('createNode')
        if create_node is not None:
            new_node = loads_json(create_node)
            new_node["symbolSize"] = 50
            new_link = None if len(global_data_manager.highlight_node) != 1 else {
                "source": global_data_manager.highlight_node[0],
                "target": new_node["name"],
                "name": ""
            }
            global_data_manager.add_node(new_node, new_link)

        create_link = form.get('createEdge')
        if create_link is not None:
            new_link = loads_json(create_link)
            new_link["source"] = global_data_manager.highlight_node[0]
            new_link["target"] = global_data_manager.highlight_node[1]
            global_data_manager.add_link(new_link)

        if form.get('deleteNode') is not None:
            for node_name in global_data_manager.highlight_node:
                global_data_manager.delete_node(node_name)

        if form.get('deleteLink') is not None:
            source = global_data_manager.highlight_link["data"]["source"]
            target = global_data_manager.highlight_link["data"]["target"]
            global_data_manager.delete_link(source, target)

        if form.get('undo') is not None:
            global_data_manager.undo()

        if form.get('redo') is not None:
            global_data_manager.redo()

        global_data_manager.package()
        return jsonify(global_data_manager.get_json())
