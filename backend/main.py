from fastapi import FastAPI, Depends, HTTPException, status
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from sqlalchemy.orm import Session
from sqlalchemy.exc import SQLAlchemyError
from typing import List, Optional
import schemas
import crud
from database import get_db, engine, Base
from pydantic_settings import BaseSettings
import os
import traceback
from dotenv import load_dotenv

load_dotenv()

app = FastAPI(
    title="链接门户 API",
    description="链接管理系统的后端 API",
    version="1.0.0"
)

# 配置 CORS - 必须在所有路由之前
# 注意：如果使用 allow_credentials=True，不能使用 allow_origins=["*"]
# 必须明确指定允许的来源
app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        "http://localhost:3000",
        "http://localhost:3001",
        "http://127.0.0.1:3000",
        "http://127.0.0.1:3001",
        "http://localhost:8080",
        "http://127.0.0.1:8080",
    ],
    allow_credentials=True,
    allow_methods=["GET", "POST", "PUT", "DELETE", "OPTIONS", "PATCH"],
    allow_headers=["*"],
    expose_headers=["*"],
)

# 全局异常处理
@app.exception_handler(Exception)
async def global_exception_handler(request, exc):
    """全局异常处理，确保 CORS 头始终返回"""
    error_detail = str(exc)
    if isinstance(exc, SQLAlchemyError):
        error_detail = "数据库错误: " + str(exc)
    
    pass  # 错误已记录在响应中
    
    return JSONResponse(
        status_code=500,
        content={
            "detail": error_detail,
            "type": type(exc).__name__
        },
        headers={
            "Access-Control-Allow-Origin": request.headers.get("origin", "*"),
            "Access-Control-Allow-Credentials": "true",
        }
    )

# 初始化数据库（延迟初始化，避免启动时错误）
try:
    Base.metadata.create_all(bind=engine)
    pass
except Exception as e:
    pass  # 将在首次请求时重试

API_PREFIX = os.getenv("API_PREFIX", "/api/v1")

# ========== 用户相关接口 ==========
@app.get(API_PREFIX + "/users", response_model=List[schemas.UserResponse])
def read_users(skip: int = 0, limit: int = 100, db: Session = Depends(get_db)):
    """获取所有用户列表"""
    try:
        # 确保数据库表存在
        Base.metadata.create_all(bind=engine)
        users = crud.get_users(db, skip=skip, limit=limit)
        return users
    except Exception as e:
        pass
        raise HTTPException(status_code=500, detail=f"获取用户列表失败: {str(e)}")

@app.get(API_PREFIX + "/users/{user_id}", response_model=schemas.UserResponse)
def read_user(user_id: int, db: Session = Depends(get_db)):
    """获取指定用户信息"""
    db_user = crud.get_user(db, user_id=user_id)
    if db_user is None:
        raise HTTPException(status_code=404, detail="用户不存在")
    return db_user

@app.post(API_PREFIX + "/users", response_model=schemas.UserResponse, status_code=status.HTTP_201_CREATED)
def create_user(user: schemas.UserCreate, db: Session = Depends(get_db)):
    """创建新用户"""
    # 检查用户名是否已存在
    db_user = crud.get_user_by_name(db, name=user.name)
    if db_user:
        raise HTTPException(status_code=400, detail="用户名已存在")
    return crud.create_user(db=db, user=user)

@app.delete(API_PREFIX + "/users/{user_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_user(user_id: int, db: Session = Depends(get_db)):
    """删除用户"""
    db_user = crud.delete_user(db, user_id=user_id)
    if db_user is None:
        raise HTTPException(status_code=404, detail="用户不存在")
    return None

# ========== 链接相关接口 ==========
@app.get(API_PREFIX + "/users/{user_id}/links", response_model=List[schemas.LinkResponse])
def read_links(
    user_id: int,
    skip: int = 0,
    limit: int = 1000,
    category: Optional[str] = None,
    search: Optional[str] = None,
    db: Session = Depends(get_db)
):
    """获取用户的链接列表"""
    # 验证用户存在
    if not crud.get_user(db, user_id):
        raise HTTPException(status_code=404, detail="用户不存在")
    
    links = crud.get_links(db, user_id=user_id, skip=skip, limit=limit, category=category, search=search)
    return links

@app.get(API_PREFIX + "/users/{user_id}/links/{link_id}", response_model=schemas.LinkResponse)
def read_link(user_id: int, link_id: int, db: Session = Depends(get_db)):
    """获取指定链接"""
    db_link = crud.get_link(db, link_id=link_id, user_id=user_id)
    if db_link is None:
        raise HTTPException(status_code=404, detail="链接不存在")
    return db_link

@app.post(API_PREFIX + "/users/{user_id}/links", response_model=schemas.LinkResponse, status_code=status.HTTP_201_CREATED)
def create_link(user_id: int, link: schemas.LinkCreate, db: Session = Depends(get_db)):
    """创建新链接"""
    # 验证用户存在
    if not crud.get_user(db, user_id):
        raise HTTPException(status_code=404, detail="用户不存在")
    
    # 检查URL是否已存在
    existing_link = crud.get_link_by_url(db, url=link.url, user_id=user_id)
    if existing_link:
        raise HTTPException(status_code=400, detail="该链接已存在")
    
    return crud.create_link(db=db, link=link, user_id=user_id)

@app.put(API_PREFIX + "/users/{user_id}/links/{link_id}", response_model=schemas.LinkResponse)
def update_link(user_id: int, link_id: int, link: schemas.LinkUpdate, db: Session = Depends(get_db)):
    """更新链接"""
    db_link = crud.update_link(db, link_id=link_id, user_id=user_id, link_update=link)
    if db_link is None:
        raise HTTPException(status_code=404, detail="链接不存在")
    return db_link

@app.delete(API_PREFIX + "/users/{user_id}/links/{link_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_link(user_id: int, link_id: int, db: Session = Depends(get_db)):
    """删除链接"""
    db_link = crud.delete_link(db, link_id=link_id, user_id=user_id)
    if db_link is None:
        raise HTTPException(status_code=404, detail="链接不存在")
    return None

@app.post(API_PREFIX + "/users/{user_id}/links/{link_id}/click")
def click_link(user_id: int, link_id: int, db: Session = Depends(get_db)):
    """记录链接点击"""
    db_link = crud.increment_link_clicks(db, link_id=link_id, user_id=user_id)
    if db_link is None:
        raise HTTPException(status_code=404, detail="链接不存在")
    return {"message": "点击已记录", "clicks": db_link.clicks}

# ========== 分类相关接口 ==========
@app.get(API_PREFIX + "/users/{user_id}/categories", response_model=List[schemas.CategoryResponse])
def read_categories(user_id: int, db: Session = Depends(get_db)):
    """获取用户的分类列表"""
    if not crud.get_user(db, user_id):
        raise HTTPException(status_code=404, detail="用户不存在")
    
    categories = crud.get_categories(db, user_id=user_id)
    return categories

@app.post(API_PREFIX + "/users/{user_id}/categories", response_model=schemas.CategoryResponse, status_code=status.HTTP_201_CREATED)
def create_category(user_id: int, category: schemas.CategoryCreate, db: Session = Depends(get_db)):
    """创建新分类"""
    if not crud.get_user(db, user_id):
        raise HTTPException(status_code=404, detail="用户不存在")
    
    return crud.create_category(db=db, category=category, user_id=user_id)

@app.put(API_PREFIX + "/users/{user_id}/categories/{category_id}", response_model=schemas.CategoryResponse)
def update_category(user_id: int, category_id: int, name: str, parent: Optional[str] = None, db: Session = Depends(get_db)):
    """更新分类"""
    db_category = crud.update_category(db, category_id=category_id, user_id=user_id, name=name, parent=parent)
    if db_category is None:
        raise HTTPException(status_code=404, detail="分类不存在")
    return db_category

@app.delete(API_PREFIX + "/users/{user_id}/categories/{category_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_category(user_id: int, category_id: int, db: Session = Depends(get_db)):
    """删除分类"""
    db_category = crud.delete_category(db, category_id=category_id, user_id=user_id)
    if db_category is None:
        raise HTTPException(status_code=404, detail="分类不存在")
    return None

# ========== 用户设置相关接口 ==========
@app.get(API_PREFIX + "/users/{user_id}/settings", response_model=schemas.UserSettingsResponse)
def read_user_settings(user_id: int, db: Session = Depends(get_db)):
    """获取用户设置"""
    if not crud.get_user(db, user_id):
        raise HTTPException(status_code=404, detail="用户不存在")
    
    return crud.get_user_settings(db, user_id=user_id)

@app.put(API_PREFIX + "/users/{user_id}/settings", response_model=schemas.UserSettingsResponse)
def update_user_settings(user_id: int, settings: schemas.UserSettingsUpdate, db: Session = Depends(get_db)):
    """更新用户设置"""
    if not crud.get_user(db, user_id):
        raise HTTPException(status_code=404, detail="用户不存在")
    
    return crud.update_user_settings(db, user_id=user_id, settings_update=settings)

# ========== 访问历史相关接口 ==========
@app.post(API_PREFIX + "/users/{user_id}/access-history", response_model=schemas.AccessHistoryResponse, status_code=status.HTTP_201_CREATED)
def create_access_history(user_id: int, history: schemas.AccessHistoryCreate, db: Session = Depends(get_db)):
    """创建访问历史记录"""
    if not crud.get_user(db, user_id):
        raise HTTPException(status_code=404, detail="用户不存在")
    
    return crud.create_access_history(db, user_id=user_id, history=history)

@app.get(API_PREFIX + "/users/{user_id}/access-history", response_model=List[schemas.AccessHistoryResponse])
def read_access_history(user_id: int, limit: int = 100, db: Session = Depends(get_db)):
    """获取访问历史"""
    if not crud.get_user(db, user_id):
        raise HTTPException(status_code=404, detail="用户不存在")
    
    return crud.get_access_history(db, user_id=user_id, limit=limit)

# ========== 批量操作接口 ==========
@app.post(API_PREFIX + "/users/{user_id}/links/batch/category")
def batch_update_category(user_id: int, batch: schemas.BatchUpdateCategory, db: Session = Depends(get_db)):
    """批量更新分类"""
    if not crud.get_user(db, user_id):
        raise HTTPException(status_code=404, detail="用户不存在")
    
    updated = crud.batch_update_category(db, user_id=user_id, link_urls=batch.link_urls, category=batch.category)
    return {"message": f"已更新 {updated} 个链接的分类"}

@app.post(API_PREFIX + "/users/{user_id}/links/batch/tags")
def batch_update_tags(user_id: int, batch: schemas.BatchUpdateTags, db: Session = Depends(get_db)):
    """批量更新标签"""
    if not crud.get_user(db, user_id):
        raise HTTPException(status_code=404, detail="用户不存在")
    
    updated = crud.batch_update_tags(db, user_id=user_id, link_urls=batch.link_urls, tags=batch.tags)
    return {"message": f"已更新 {updated} 个链接的标签"}

@app.post(API_PREFIX + "/users/{user_id}/links/batch/share")
def batch_update_share(user_id: int, batch: schemas.BatchUpdateShare, db: Session = Depends(get_db)):
    """批量更新分享设置"""
    if not crud.get_user(db, user_id):
        raise HTTPException(status_code=404, detail="用户不存在")
    
    updated = crud.batch_update_share(db, user_id=user_id, link_urls=batch.link_urls, is_private=batch.is_private)
    return {"message": f"已更新 {updated} 个链接的分享设置"}

@app.post(API_PREFIX + "/users/{user_id}/links/batch/delete")
def batch_delete_links(user_id: int, batch: schemas.BatchDelete, db: Session = Depends(get_db)):
    """批量删除链接"""
    if not crud.get_user(db, user_id):
        raise HTTPException(status_code=404, detail="用户不存在")
    
    deleted = crud.batch_delete_links(db, user_id=user_id, link_urls=batch.link_urls)
    return {"message": f"已删除 {deleted} 个链接"}

# ========== 健康检查 ==========
@app.get("/health")
def health_check():
    """健康检查"""
    try:
        # 测试数据库连接
        db = next(get_db())
        db.execute("SELECT 1")
        db.close()
        return {
            "status": "ok",
            "message": "API is running",
            "database": "connected"
        }
    except Exception as e:
        return {
            "status": "error",
            "message": "API is running but database connection failed",
            "error": str(e)
        }

@app.get("/")
def root():
    """根路径"""
    return {
        "message": "链接门户 API",
        "version": "1.0.0",
        "docs": "/docs",
        "health": "/health"
    }

