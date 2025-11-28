from pydantic import BaseModel, HttpUrl
from typing import Optional, List
from datetime import datetime

# 用户相关
class UserBase(BaseModel):
    name: str

class UserCreate(UserBase):
    pass

class UserResponse(UserBase):
    id: int
    created_at: datetime
    updated_at: Optional[datetime]
    
    class Config:
        from_attributes = True

# 链接相关
class LinkBase(BaseModel):
    name: str
    url: str
    icon: Optional[str] = None
    note: Optional[str] = None
    category: str = "未分类"
    tags: Optional[List[str]] = None
    is_private: bool = False

class LinkCreate(LinkBase):
    pass

class LinkUpdate(BaseModel):
    name: Optional[str] = None
    url: Optional[str] = None
    icon: Optional[str] = None
    note: Optional[str] = None
    category: Optional[str] = None
    tags: Optional[List[str]] = None
    is_private: Optional[bool] = None

class LinkResponse(LinkBase):
    id: int
    user_id: int
    clicks: int
    last_access: Optional[datetime] = None
    add_time: datetime
    created_at: datetime
    updated_at: Optional[datetime] = None
    
    class Config:
        from_attributes = True

# 分类相关
class CategoryBase(BaseModel):
    name: str
    parent: Optional[str] = None
    is_collapsed: bool = False

class CategoryCreate(CategoryBase):
    pass

class CategoryResponse(CategoryBase):
    id: int
    user_id: int
    created_at: datetime
    updated_at: Optional[datetime] = None
    
    class Config:
        from_attributes = True

# 用户设置相关
class UserSettingsBase(BaseModel):
    favorite_links: Optional[List[str]] = None
    dark_mode: bool = False
    custom_theme: Optional[dict] = None
    sort_by: str = "custom"
    sort_order: str = "asc"
    current_view: str = "card"

class UserSettingsUpdate(BaseModel):
    favorite_links: Optional[List[str]] = None
    dark_mode: Optional[bool] = None
    custom_theme: Optional[dict] = None
    sort_by: Optional[str] = None
    sort_order: Optional[str] = None
    current_view: Optional[str] = None

class UserSettingsResponse(UserSettingsBase):
    id: int
    user_id: int
    created_at: datetime
    updated_at: Optional[datetime] = None
    
    class Config:
        from_attributes = True

# 访问历史相关
class AccessHistoryCreate(BaseModel):
    link_url: str
    link_name: Optional[str] = None

class AccessHistoryResponse(BaseModel):
    id: int
    user_id: int
    link_url: str
    link_name: Optional[str] = None
    timestamp: datetime
    
    class Config:
        from_attributes = True

# 批量操作
class BatchUpdateCategory(BaseModel):
    link_urls: List[str]
    category: str

class BatchUpdateTags(BaseModel):
    link_urls: List[str]
    tags: List[str]

class BatchUpdateShare(BaseModel):
    link_urls: List[str]
    is_private: bool

class BatchDelete(BaseModel):
    link_urls: List[str]

