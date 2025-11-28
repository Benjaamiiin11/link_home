# 链接门户 - Link Portal

一个美观、功能丰富的个人链接管理工具，支持多用户、分类管理、标签系统等功能。

## ✨ 功能特性

- 📋 **链接管理** - 添加、编辑、删除链接
- 🏷️ **分类系统** - 支持分类和文件夹结构
- ⭐ **收藏功能** - 快速访问常用链接
- 🔍 **搜索功能** - 快速查找链接
- 🎨 **主题定制** - 深色模式、自定义主题颜色
- 👥 **多用户支持** - 每个用户独立的数据空间
- 📊 **数据统计** - 访问统计、点击统计
- 📤 **数据导出** - 支持 JSON、Excel、Markdown、HTML、CSV 格式
- 📥 **数据导入** - 支持多种格式导入
- 🏷️ **标签系统** - 灵活的标签管理
- 📱 **响应式设计** - 完美支持移动端

## 🚀 快速开始

### 方式一：纯前端模式（默认）

**方法 1：使用本地服务器（推荐）**

```bash
# Windows
start_frontend.bat

# Linux/Mac
chmod +x start_frontend.sh
./start_frontend.sh
```

然后访问：http://localhost:3000

**方法 2：直接用浏览器打开**

双击 `index.html` 文件即可（简单但可能有一些限制）

**说明：**
- 数据存储在浏览器的 localStorage 中
- 无需后端服务，开箱即用
- 使用本地服务器可以避免一些跨域问题

### 方式二：使用后端 API（推荐用于生产环境）

#### 后端设置

1. **安装依赖**
   ```bash
   cd backend
   pip install -r requirements.txt
   ```

2. **配置数据库**
   - 创建 MySQL 数据库：
     ```sql
     CREATE DATABASE link_portal CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
     ```
   - 复制环境变量文件：
     ```bash
     cp env.example .env
     ```
   - 编辑 `.env` 文件，填入数据库配置

3. **初始化数据库**
   ```bash
   python init_db.py
   ```

4. **启动后端服务**
   ```bash
   # Windows
   start.bat
   
   # Linux/Mac
   chmod +x start.sh
   ./start.sh
   
   # 或直接使用 uvicorn
   uvicorn main:app --reload --host 0.0.0.0 --port 8000
   ```

5. **访问 API 文档**
   - Swagger UI: http://localhost:8000/docs
   - ReDoc: http://localhost:8000/redoc

#### 前端连接后端

**前端入口：`index.html`**

**启动前端：**

```bash
# 使用本地服务器（推荐）
start_frontend.bat  # Windows
./start_frontend.sh  # Linux/Mac

# 然后访问 http://localhost:3000
```

**连接步骤：**

1. **启动后端服务**（见上方后端设置）
   ```bash
   cd backend
   .\start.bat  # 或 uvicorn main:app --reload --host 0.0.0.0 --port 8081
   ```

2. **启动前端服务**
   ```bash
   start_frontend.bat
   ```

3. **访问前端**
   - 打开浏览器访问：http://localhost:3000
   - 前端会自动检测后端是否可用
   - 如果后端可用，使用 API；否则使用 localStorage

**配置说明：**
- 前端端口：3000（可在启动脚本中修改）
- 后端端口：8081（可在 `backend/.env` 中配置 `SERVER_PORT`）
- API 地址：在 `script.js` 第 28 行配置 `API_BASE_URL`

**快速开始：**
- ✅ 前端已自动连接后端（无需手动配置）
- API 封装文件：`api.js`（已创建）
- API 文档：http://localhost:8081/docs（启动后端后访问）

### 部署到服务器

详细部署指南请查看 [部署指南.md](./部署指南.md)

**快速部署（GitHub Pages）：**

```bash
# 1. 初始化 Git
git init
git add .
git commit -m "Initial commit"

# 2. 推送到 GitHub
git remote add origin https://github.com/你的用户名/仓库名.git
git push -u origin main

# 3. 在 GitHub 仓库 Settings > Pages 中启用
# 4. 访问 https://你的用户名.github.io/仓库名/
```

## 📁 项目结构

```
yunmai_link_home/
├── index.html          # 主页面
├── styles.css          # 样式文件
├── script.js           # 主要逻辑
├── data.js             # 默认数据
├── README.md           # 项目说明
├── 部署指南.md         # 部署指南
├── 多用户设计方案.md    # 多用户功能设计文档
└── backend/            # 后端 API（FastAPI + MySQL）
    ├── main.py         # FastAPI 应用主文件
    ├── database.py     # 数据库连接配置
    ├── models.py        # 数据模型
    ├── schemas.py       # 数据模式
    ├── crud.py          # 数据库操作
    ├── requirements.txt # Python 依赖
    ├── init_db.py       # 数据库初始化脚本
    └── README.md        # 后端说明文档
```

## 🎯 使用说明

### 添加链接

1. 点击"添加链接"按钮
2. 填写链接信息（URL、名称、分类等）
3. 点击保存

### 快速导入

- **粘贴导入**：直接按 `Ctrl+V`（或 `Cmd+V`）粘贴 URL，自动识别并添加
- **文件导入**：在"数据管理"中选择导入文件（支持 JSON、Excel、HTML 书签）

### 多用户使用

1. 点击右上角用户按钮
2. 添加新用户或切换用户
3. 每个用户的数据完全独立

### 数据管理

- **导出数据**：在"数据管理"中选择导出格式
- **导入数据**：支持从 JSON、Excel、HTML 书签导入
- **清空数据**：清空当前用户的所有数据

## 🔧 技术栈

### 前端
- **HTML + CSS + JavaScript** - 纯前端实现
- **SheetJS** - Excel 处理库
- **Google Fonts** - Inter 字体
- **本地存储** - 使用 localStorage 存储数据（默认模式）
- **响应式设计** - 支持各种屏幕尺寸

### 后端（可选）
- **FastAPI** - 现代 Python Web 框架
- **MySQL** - 关系型数据库
- **SQLAlchemy** - ORM 框架
- **Pydantic** - 数据验证

## ⚠️ 注意事项

1. **数据存储**：数据存储在浏览器 localStorage 中
   - 清除浏览器数据会丢失所有数据
   - 不同设备/浏览器数据不共享
   - 建议定期导出数据备份

2. **浏览器兼容性**：支持现代浏览器
   - Chrome/Edge（推荐）
   - Firefox
   - Safari

3. **数据限制**：localStorage 通常有 5-10MB 限制，足够存储大量链接

## 📝 更新日志

### v1.0
- ✅ 基础链接管理功能
- ✅ 分类和标签系统
- ✅ 搜索和排序
- ✅ 主题定制
- ✅ 数据导入导出
- ✅ 多用户支持
- ✅ 访问统计
- ✅ 响应式设计

## 🤝 贡献

欢迎提交 Issue 和 Pull Request！

## 📄 许可证

MIT License

## 🙏 致谢

- [SheetJS](https://sheetjs.com/) - Excel 处理库
- [Google Fonts](https://fonts.google.com/) - Inter 字体

---

**享受你的链接管理之旅！** 🎉

