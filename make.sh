
python -m venv new_venv
  # source new_venv/bin/activate  # 在Linux或Mac上
./new_venv/Scripts/activate  # 在Windows上

pip freeze > requirements.txt
pip install -r requirements.txt #仅仅安装必要的包

# 在开发模式下运行应用
#npm run start

# 为当前平台创建未打包的应用程序
#npm run pack

# 为当前平台创建可分发的安装程序
npm run dist # 打包完后完整应用包在dist目录下


#复制data目录
cp -r data dist/XKnowledge*