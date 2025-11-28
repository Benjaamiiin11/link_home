# 链接门户后端 API

基于 FastAPI 和 MySQL 的链接管理系统后端。

## 📋 功能特性

- ✅ 用户管理（创建、查询、删除）
- ✅ 链接管理（CRUD 操作）
- ✅ 分类管理
- ✅ 用户设置管理
- ✅ 访问历史记录
- ✅ 批量操作（批量更新分类、标签、分享设置、删除）
- ✅ RESTful API 设计
- ✅ 自动生成 API 文档

## 🚀 快速开始

### 1. 环境要求

- Python 3.8+
- MySQL 5.7+ 或 MySQL 8.0+

### 2. 安装依赖

```bash
cd backend
pip install -r requirements.txt
```

### 3. 配置数据库

1. 创建 MySQL 数据库：

```sql
CREATE DATABASE link_portal CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
```

2. 复制环境变量文件并配置：

```bash
cp .env.example .env
```

3. 编辑 `.env` 文件，填入数据库配置：

```env
DB_HOST=localhost
DB_PORT=3306
DB_USER=root
DB_PASSWORD=your_password
DB_NAME=link_portal
```

### 4. 运行应用

**启动服务**

```bash
# 开发模式（自动重载）
uvicorn main:app --reload --host 0.0.0.0 --port 8000

# 生产模式
uvicorn main:app --host 0.0.0.0 --port 8000
```

**更改端口号：**

如果 8000 端口被占用，可以在 `.env` 文件中设置：
```env
SERVER_PORT=8081
```

或者直接指定端口：
```bash
uvicorn main:app --reload --host 0.0.0.0 --port 8081
```

### 5. 访问 API 文档

启动成功后，访问：
- Swagger UI: http://localhost:8081/docs（如果更改了端口，请使用新端口）
- ReDoc: http://localhost:8081/redoc
- 健康检查: http://localhost:8081/health

**注意：** 如果无法访问，请确保服务已启动。

## 📚 API 接口说明

### 用户接口

- `GET /api/v1/users` - 获取所有用户
- `GET /api/v1/users/{user_id}` - 获取指定用户
- `POST /api/v1/users` - 创建新用户
- `DELETE /api/v1/users/{user_id}` - 删除用户

### 链接接口

- `GET /api/v1/users/{user_id}/links` - 获取用户的链接列表（支持分类和搜索过滤）
- `GET /api/v1/users/{user_id}/links/{link_id}` - 获取指定链接
- `POST /api/v1/users/{user_id}/links` - 创建新链接
- `PUT /api/v1/users/{user_id}/links/{link_id}` - 更新链接
- `DELETE /api/v1/users/{user_id}/links/{link_id}` - 删除链接
- `POST /api/v1/users/{user_id}/links/{link_id}/click` - 记录链接点击

### 分类接口

- `GET /api/v1/users/{user_id}/categories` - 获取用户的分类列表
- `POST /api/v1/users/{user_id}/categories` - 创建新分类
- `PUT /api/v1/users/{user_id}/categories/{category_id}` - 更新分类
- `DELETE /api/v1/users/{user_id}/categories/{category_id}` - 删除分类

### 用户设置接口

- `GET /api/v1/users/{user_id}/settings` - 获取用户设置
- `PUT /api/v1/users/{user_id}/settings` - 更新用户设置

### 访问历史接口

- `GET /api/v1/users/{user_id}/access-history` - 获取访问历史
- `POST /api/v1/users/{user_id}/access-history` - 创建访问历史记录

### 批量操作接口

- `POST /api/v1/users/{user_id}/links/batch/category` - 批量更新分类
- `POST /api/v1/users/{user_id}/links/batch/tags` - 批量更新标签
- `POST /api/v1/users/{user_id}/links/batch/share` - 批量更新分享设置
- `POST /api/v1/users/{user_id}/links/batch/delete` - 批量删除链接

## 📊 数据库结构

### users 表
- id: 主键
- name: 用户名（唯一）
- created_at: 创建时间
- updated_at: 更新时间

### links 表
- id: 主键
- user_id: 用户ID（外键）
- name: 链接名称
- url: 链接地址
- icon: 图标URL
- note: 备注
- category: 分类
- tags: 标签（JSON数组）
- is_private: 是否私有
- clicks: 点击次数
- last_access: 最后访问时间
- add_time: 添加时间
- created_at: 创建时间
- updated_at: 更新时间

### categories 表
- id: 主键
- user_id: 用户ID（外键）
- name: 分类名称
- parent: 父分类名称
- is_collapsed: 是否折叠
- created_at: 创建时间
- updated_at: 更新时间

### user_settings 表
- id: 主键
- user_id: 用户ID（外键，唯一）
- favorite_links: 收藏的链接URL列表（JSON）
- dark_mode: 深色模式
- custom_theme: 自定义主题（JSON）
- sort_by: 排序方式
- sort_order: 排序顺序
- current_view: 当前视图
- created_at: 创建时间
- updated_at: 更新时间

### access_history 表
- id: 主键
- user_id: 用户ID（外键）
- link_url: 链接URL
- link_name: 链接名称
- timestamp: 访问时间

## 🔧 开发说明

### 项目结构

```
backend/
├── main.py           # FastAPI 应用主文件
├── database.py       # 数据库连接配置
├── models.py         # SQLAlchemy 数据模型
├── schemas.py        # Pydantic 数据模式
├── crud.py           # 数据库操作函数
├── init_db.py        # 数据库初始化脚本
├── requirements.txt  # Python 依赖
├── env.example       # 环境变量示例
└── README.md         # 说明文档
```

### 添加新功能

1. 在 `models.py` 中定义数据模型
2. 在 `schemas.py` 中定义 Pydantic 模式
3. 在 `crud.py` 中实现数据库操作
4. 在 `main.py` 中添加 API 路由

## ⚠️ 注意事项

1. **CORS 配置**：当前允许所有来源，生产环境应该设置具体的域名
2. **数据库连接**：确保 MySQL 服务正在运行
3. **字符编码**：数据库使用 utf8mb4 编码以支持 emoji 等特殊字符
4. **数据备份**：定期备份数据库数据

## 📝 示例请求

### 创建用户

```bash
curl -X POST "http://localhost:8000/api/v1/users" \
  -H "Content-Type: application/json" \
  -d '{"name": "张三"}'
```

### 创建链接

```bash
curl -X POST "http://localhost:8000/api/v1/users/1/links" \
  -H "Content-Type: application/json" \
  -d '{
    "name": "GitHub",
    "url": "https://github.com",
    "icon": "https://github.com/favicon.ico",
    "note": "代码托管平台",
    "category": "开发工具",
    "tags": ["代码", "版本控制"]
  }'
```

### 获取用户的链接列表

```bash
curl "http://localhost:8000/api/v1/users/1/links?category=开发工具&search=GitHub"
```

## 🐛 故障排除

### 数据库连接失败

1. 检查 MySQL 服务是否运行
2. 检查 `.env` 文件中的数据库配置是否正确
3. 检查数据库用户是否有足够的权限

### 端口被占用

修改启动命令中的端口号：

```bash
uvicorn main:app --reload --host 0.0.0.0 --port 8001
```

## 📄 许可证

MIT License

