import json
from typing import Union


class JsonFileHandler:
    def __init__(self, file_path: str):
        self.file_path = file_path

    def reader(self):
        # 加载该文件对象，转换为python类型的数据
        with open(self.file_path, mode="r", encoding='utf-8') as f:
            return json.load(f)

    def writer(self, data: Union[str, dict]):
        # 将json写入文件
        with open(self.file_path, mode="w", encoding='utf-8') as f:
            json.dump(data, f)

    @staticmethod
    def package_json(json_data: Union[str, dict], title: str):
        json_data["categories"] = [{"name": i} for i in list(set([i["category"] for i in json_data["data"]]))]
        json_data["title"] = title
        return json_data

    @staticmethod
    def loads_json(json_data: str):
        return json.loads(json_data)
