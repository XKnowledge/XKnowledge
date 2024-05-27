# XKnowledge

自制知识图谱

# 打包

# 前置步骤：安装好python3，nodejs和npm

# 项目根目录下创建py虚拟环境，方便打包py所需依赖

```bash
python -m venv venv
```

# 激活虚拟环境（在Windows上使用 `.\venv\Scripts\activate`, 在Unix或MacOS上使用 `source venv/bin/activate`）

```bash
.\venv\Scripts\activate
```

## 安装好python依赖

！！！确保本地能运行python xk_main.py 并且localhost:5000启动正常


# 安装electron相关包

```bash
npm install --save-dev electron electron-packager electron-builder
```

# 运行打包脚本，在根目录cmd窗口执行sh进入到sh

```bash
sh make.sh
```

# icon库

https://www.iconfont.cn/collections/detail?spm=a313x.search_index.0.da5a778a4.726b3a81W2DMri&cid=7077