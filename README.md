# electron-app

An Electron application with Vue

## Recommended IDE Setup

- [VSCode](https://code.visualstudio.com/) + [ESLint](https://marketplace.visualstudio.com/items?itemName=dbaeumer.vscode-eslint) + [Prettier](https://marketplace.visualstudio.com/items?itemName=esbenp.prettier-vscode) + [Volar](https://marketplace.visualstudio.com/items?itemName=Vue.volar)

## Project Setup

### Install

```bash
$ yarn
```

### Development
# XKnowledge

自制知识图谱

# 打包

前置步骤：安装好python3，node.js和npm

项目根目录下创建py虚拟环境，方便打包py所需依赖

```bash
python -m venv xkvenv
```

激活虚拟环境（在Windows上使用PowerShell运行 `./xkvenv/Scripts/activate`, 在Unix或MacOS上使用 `source xkvenv/bin/activate`）

```bash
xkvenv/Scripts/activate
```
```bash
source xkvenv/bin/activate
```

## 安装好python依赖

```bash
pip freeze > requirements.txt
pip install -r requirements.txt
# 或者
pip install flask
pip install flask_cors
pip install wtforms
pip install pyinstaller
```

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

# 打包指令
``` cmd
# 修改前
pyinstaller --clean -D -p xkvenv\Lib\site-packages --add-data static:static --add-data templates:templates --distpath=. --noconfirm xk_main.py
```
```cmd
pyinstaller --clean -D -p xkvenv/lib/python3.11/site-packages --add-data "backend/static:static" --add-data "backend/templates:templates" --distpath=. --noconfirm backend/xk_main.py
```

```bash
$ yarn dev
```

### Build

```bash
# For windows
$ yarn build:win

# For macOS
$ yarn build:mac

# For Linux
$ yarn build:linux
```
