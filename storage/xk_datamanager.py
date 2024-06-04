import os
from copy import deepcopy

from storage.xk_json import JsonFileHandler


# todo 对于Node、Link都可以封装成类，类的成员函数中实现add/delete/undo/redo，未来重构的时候可以考虑这种架构，但是现在先不重构
# todo 或者历史记录管理器也可以抽象成一个类
# links和link是严格区分的，link只在绝对单连接的时候使用

class XKDataManager:
    """ 在内存中做数据管理，调用底层的handler """

    def __init__(self):
        self.json_handler = None  # 保留一个json处理器
        # todo root_folder未来可以做成参数可修改的形式
        self.root_folder = os.path.abspath("data")  # 软件对应的根文件夹
        if not os.path.isdir(self.root_folder):
            os.makedirs(self.root_folder)
        self.file_path = None  # json对应的文件路径
        self.json_data = None  # 储存在内存中的json数据
        self.json_data_old = None  # 储存直至上次未保存的json
        self.file_name = None  # 储存图的文件名称
        self.title = None  # 储存图的标题
        self.highlight_node = []  # 记录高亮节点
        self.highlight_link = None  # 记录高亮边
        self.history = []  # 记录历史操作
        self.history_sequence_number = -1  # HSN：历史操作对应的目前的位置

    def reset(self):
        self.highlight_node = []
        self.highlight_link = None
        self.history = []
        self.history_sequence_number = -1

    def set_root_folder(self, folder_path):
        self.root_folder = os.path.abspath(folder_path)
        if not os.path.isdir(self.root_folder):
            os.makedirs(self.root_folder)

    def set_file_name(self, file_name: str):
        self.file_name = file_name
        if file_name[-3:] == ".xk":
            self.title = file_name[:-3]

    def open_file(self):
        # 重新打开一个新的文件
        self.reset()
        self.file_path = os.path.abspath(os.path.join(self.root_folder, self.file_name))
        if os.path.isfile(self.file_path):
            self.json_handler = JsonFileHandler(self.file_path)
            self.json_data = self.json_handler.reader()
            # 为重做做准备
            self.json_data_old = deepcopy(self.json_data)
        else:
            raise FileNotFoundError

    def create_file(self):
        # 新建一个文件
        self.reset()
        self.file_path = os.path.abspath(os.path.join(self.root_folder, self.file_name))
        self.json_handler = JsonFileHandler(self.file_path)
        self.json_data = {"data": [{
            "name": "中心主题",
            "des": "",
            "symbolSize": 50,
            "category": "类型1"
        }], "links": []}
        self.package()
        self.json_data_old = deepcopy(self.json_data)
        self.json_handler.writer(self.json_data)

    def delete_file(self):
        # 删除一个文件
        # 删除文件
        self.file_path = os.path.abspath(os.path.join(self.root_folder, self.file_name))
        if os.path.exists(self.file_path):
            os.remove(self.file_path)
            self.reset()
            self.file_path = None
            self.json_handler = None
            self.json_data = None
            self.json_data_old = None
        else:
            raise FileNotFoundError

    def package(self):
        if self.json_handler is not None:
            if self.title is None:
                raise FileNotFoundError
            if self.json_data is not None:
                self.json_data = self.json_handler.package_json(self.json_data, self.title)

    def reload(self):
        # 不保存的还原
        self.json_data = deepcopy(self.json_data_old)
        self.reset()

    def get_json(self):
        return self.json_data

    def save_json(self):
        self.json_handler.writer(self.json_data)
        self.json_data_old = deepcopy(self.json_data)

    def add_node(self, new_node, new_link=None, need_history=True):
        # 增加节点，但是节点可以带着边，所以要把边传入
        self.json_data["data"].append(new_node)
        node_json = {"addNode": {"data": new_node}}
        if new_link is not None:
            self.json_data["links"].append(new_link)
            node_json["addNode"]["link"] = new_link
        if need_history:
            self.add_history(node_json)

    def add_link(self, new_link, need_history=True):
        self.json_data["links"].append(new_link)
        if need_history:
            self.add_history({"addLink": new_link})

    def delete_node(self, name, need_history=True):
        # 为什么一定要用pos和下标进行删除，而不是直接遍历json_data["data"]和json_data["links"]？
        # 因为在遍历的时候修改遍历数组是python的大忌
        # 为什么放心name一定在json_data中，因为前端必须选中再删除，这样节点名称一定就在json数据中
        delete_json = {"links": []}
        pos = 0
        while self.json_data["data"][pos]["name"] != name:
            pos += 1
        delete_json["data"] = deepcopy(self.json_data["data"][pos])
        del self.json_data["data"][pos]

        pos = 0
        length = len(self.json_data["links"])
        while pos < length:
            if self.json_data["links"][pos]["source"] == name or self.json_data["links"][pos]["target"] == name:
                delete_json["links"].append(deepcopy(self.json_data["links"][pos]))
                del self.json_data["links"][pos]
                pos -= 1
                length -= 1
            pos += 1
        if need_history:
            self.add_history({"deleteNode": delete_json})

    def delete_link(self, source, target, need_history=True):
        delete_json = []
        pos = 0
        length = len(self.json_data["links"])
        while pos < length:
            if self.json_data["links"][pos]["source"] == source and self.json_data["links"][pos]["target"] == target:
                delete_json.append(deepcopy(self.json_data["links"][pos]))
                del self.json_data["links"][pos]
                pos -= 1
                length -= 1
            pos += 1
        if need_history:
            self.add_history({"deleteLink": delete_json})

    def add_history(self, operation):
        # 针对多时间线，就会丢弃其余时间线
        # 比如：
        # 时间线一开始为：A->B->C->D->E，总共有A到E，5个操作
        # 用户回退到操作C，history sequence number(HSN)指向C
        # 用户在这个基础上有进行新的操作，从C分出了一个新的时间线：
        # A->B->C->D->E
        #       |
        #        ->D1->E1
        # 这个时候会抛弃D和E，变为：
        # A->B->C->D1->E1
        self.history = self.history[:min(self.history_sequence_number + 1, len(self.history))]
        self.history_sequence_number += 1
        self.history.append(operation)

    def undo(self):
        # 撤销操作
        # HSN向时间线反方向移1个，所有的操作就是反向操作
        if self.history_sequence_number > -1:
            current_operation = self.history[self.history_sequence_number]
            self.history_sequence_number -= 1
            if "addNode" in current_operation:
                # 增加节点的反向是删除节点
                self.delete_node(current_operation["addNode"]["data"]["name"], need_history=False)
            elif "addLink" in current_operation:
                # 增加连接的反向是删除连接
                self.delete_link(current_operation["addLink"]["source"],
                                 current_operation["addLink"]["target"], need_history=False)
            elif "deleteNode" in current_operation:
                # 删除的节点是增加节点，并且把当时删除的连接增加回去
                # 一个被删除的节点可能会有多个连接
                self.add_node(current_operation["deleteNode"]["data"], need_history=False)
                for link in current_operation["deleteNode"]["links"]:
                    self.add_link(link, need_history=False)
            elif "deleteLink" in current_operation:
                # 两个节点之间可以有多条边
                for link in current_operation["deleteLink"]:
                    self.add_link(link, need_history=False)

    def redo(self):
        # 反撤销操作
        # HSN向时间线正方向移1个，所有操作都是正向操作
        if self.history_sequence_number + 1 < len(self.history):
            self.history_sequence_number += 1
            current_operation = self.history[self.history_sequence_number]
            if "addNode" in current_operation:
                link = current_operation["addNode"]["link"] if "link" in current_operation["addNode"] else None
                self.add_node(current_operation["addNode"]["data"], new_link=link, need_history=False)
            elif "addLink" in current_operation:
                self.add_link(current_operation["addLink"], need_history=False)
            elif "deleteNode" in current_operation:
                self.delete_node(current_operation["deleteNode"]["data"]["name"], need_history=False)
            elif "deleteLink" in current_operation:
                self.delete_link(current_operation["deleteLink"][0]["source"],
                                 current_operation["deleteLink"][0]["target"], need_history=False)


global_data_manager = XKDataManager()
