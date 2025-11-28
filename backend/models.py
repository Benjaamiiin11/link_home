from sqlalchemy import Column, Integer, String, Text, DateTime, Boolean, ForeignKey, JSON
from sqlalchemy.orm import relationship
from sqlalchemy.sql import func
from database import Base

class User(Base):
    """用户表"""
    __tablename__ = "users"
    
    id = Column(Integer, primary_key=True, index=True, autoincrement=True)
    name = Column(String(100), nullable=False, unique=True, index=True)
    created_at = Column(DateTime, server_default=func.now())
    updated_at = Column(DateTime, server_default=func.now(), onupdate=func.now())
    
    # 关系
    links = relationship("Link", back_populates="user", cascade="all, delete-orphan")
    categories = relationship("Category", back_populates="user", cascade="all, delete-orphan")

class Link(Base):
    """链接表"""
    __tablename__ = "links"
    
    id = Column(Integer, primary_key=True, index=True, autoincrement=True)
    user_id = Column(Integer, ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True)
    name = Column(String(200), nullable=False)
    url = Column(String(500), nullable=False, index=True)
    icon = Column(String(500))
    note = Column(Text)
    category = Column(String(100), index=True, default="未分类")
    tags = Column(JSON)  # 存储标签数组
    is_private = Column(Boolean, default=False)  # False表示允许分享
    clicks = Column(Integer, default=0)
    last_access = Column(DateTime)
    add_time = Column(DateTime, server_default=func.now())
    created_at = Column(DateTime, server_default=func.now())
    updated_at = Column(DateTime, server_default=func.now(), onupdate=func.now())
    
    # 关系
    user = relationship("User", back_populates="links")

class Category(Base):
    """分类表（用于存储自定义分类和文件夹结构）"""
    __tablename__ = "categories"
    
    id = Column(Integer, primary_key=True, index=True, autoincrement=True)
    user_id = Column(Integer, ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True)
    name = Column(String(100), nullable=False)
    parent = Column(String(100))  # 父分类名称
    is_collapsed = Column(Boolean, default=False)
    created_at = Column(DateTime, server_default=func.now())
    updated_at = Column(DateTime, server_default=func.now(), onupdate=func.now())
    
    # 关系
    user = relationship("User", back_populates="categories")

class UserSettings(Base):
    """用户设置表"""
    __tablename__ = "user_settings"
    
    id = Column(Integer, primary_key=True, index=True, autoincrement=True)
    user_id = Column(Integer, ForeignKey("users.id", ondelete="CASCADE"), nullable=False, unique=True, index=True)
    favorite_links = Column(JSON)  # 收藏的链接URL列表
    dark_mode = Column(Boolean, default=False)
    custom_theme = Column(JSON)  # 自定义主题配置
    sort_by = Column(String(50), default="custom")
    sort_order = Column(String(10), default="asc")
    current_view = Column(String(10), default="card")
    created_at = Column(DateTime, server_default=func.now())
    updated_at = Column(DateTime, server_default=func.now(), onupdate=func.now())

class AccessHistory(Base):
    """访问历史表"""
    __tablename__ = "access_history"
    
    id = Column(Integer, primary_key=True, index=True, autoincrement=True)
    user_id = Column(Integer, ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True)
    link_url = Column(String(500), nullable=False)
    link_name = Column(String(200))
    timestamp = Column(DateTime, server_default=func.now(), index=True)

