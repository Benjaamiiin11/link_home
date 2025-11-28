from sqlalchemy.orm import Session
from sqlalchemy import and_, or_
from typing import List, Optional
from models import User, Link, Category, UserSettings, AccessHistory
import schemas
import bcrypt

# ========== 用户相关 ==========
def get_user(db: Session, user_id: int):
    return db.query(User).filter(User.id == user_id).first()

def get_user_by_name(db: Session, name: str):
    return db.query(User).filter(User.name == name).first()

def get_users(db: Session, skip: int = 0, limit: int = 100):
    return db.query(User).offset(skip).limit(limit).all()

def create_user(db: Session, user: schemas.UserCreate):
    # 密码为必填，进行哈希处理
    password_hash = bcrypt.hashpw(user.password.encode('utf-8'), bcrypt.gensalt()).decode('utf-8')
    
    db_user = User(name=user.name, password_hash=password_hash)
    db.add(db_user)
    db.commit()
    db.refresh(db_user)
    # 创建默认设置
    create_user_settings(db, db_user.id)
    return db_user

def verify_password(plain_password: str, hashed_password: str) -> bool:
    """验证密码"""
    if not hashed_password:
        return False
    try:
        return bcrypt.checkpw(plain_password.encode('utf-8'), hashed_password.encode('utf-8'))
    except Exception:
        return False

def authenticate_user(db: Session, name: str, password: str):
    """验证用户登录"""
    user = get_user_by_name(db, name)
    if not user:
        return None
    if not user.password_hash:
        return None  # 旧用户没有密码，需要设置密码
    if verify_password(password, user.password_hash):
        return user
    return None

def delete_user(db: Session, user_id: int):
    db_user = get_user(db, user_id)
    if db_user:
        db.delete(db_user)
        db.commit()
    return db_user

# ========== 链接相关 ==========
def get_link(db: Session, link_id: int, user_id: int):
    return db.query(Link).filter(and_(Link.id == link_id, Link.user_id == user_id)).first()

def get_links(db: Session, user_id: int, skip: int = 0, limit: int = 1000, category: Optional[str] = None, search: Optional[str] = None):
    query = db.query(Link).filter(Link.user_id == user_id)
    
    if category and category != "全部":
        query = query.filter(Link.category == category)
    
    if search:
        query = query.filter(
            or_(
                Link.name.contains(search),
                Link.url.contains(search),
                Link.note.contains(search)
            )
        )
    
    return query.offset(skip).limit(limit).all()

def get_link_by_url(db: Session, url: str, user_id: int):
    return db.query(Link).filter(and_(Link.url == url, Link.user_id == user_id)).first()

def create_link(db: Session, link: schemas.LinkCreate, user_id: int):
    db_link = Link(
        user_id=user_id,
        name=link.name,
        url=link.url,
        icon=link.icon,
        note=link.note,
        category=link.category,
        tags=link.tags,
        is_private=link.is_private
    )
    db.add(db_link)
    db.commit()
    db.refresh(db_link)
    return db_link

def update_link(db: Session, link_id: int, user_id: int, link_update: schemas.LinkUpdate):
    db_link = get_link(db, link_id, user_id)
    if not db_link:
        return None
    
    update_data = link_update.dict(exclude_unset=True)
    for field, value in update_data.items():
        setattr(db_link, field, value)
    
    db.commit()
    db.refresh(db_link)
    return db_link

def delete_link(db: Session, link_id: int, user_id: int):
    db_link = get_link(db, link_id, user_id)
    if db_link:
        db.delete(db_link)
        db.commit()
    return db_link

def increment_link_clicks(db: Session, link_id: int, user_id: int):
    db_link = get_link(db, link_id, user_id)
    if db_link:
        db_link.clicks += 1
        from datetime import datetime
        db_link.last_access = datetime.now()
        db.commit()
        db.refresh(db_link)
    return db_link

# ========== 分类相关 ==========
def get_categories(db: Session, user_id: int):
    return db.query(Category).filter(Category.user_id == user_id).all()

def get_category(db: Session, category_id: int, user_id: int):
    return db.query(Category).filter(and_(Category.id == category_id, Category.user_id == user_id)).first()

def create_category(db: Session, category: schemas.CategoryCreate, user_id: int):
    db_category = Category(
        user_id=user_id,
        name=category.name,
        parent=category.parent,
        is_collapsed=category.is_collapsed
    )
    db.add(db_category)
    db.commit()
    db.refresh(db_category)
    return db_category

def update_category(db: Session, category_id: int, user_id: int, name: str, parent: Optional[str] = None):
    db_category = get_category(db, category_id, user_id)
    if not db_category:
        return None
    
    db_category.name = name
    if parent is not None:
        db_category.parent = parent
    db.commit()
    db.refresh(db_category)
    return db_category

def delete_category(db: Session, category_id: int, user_id: int):
    db_category = get_category(db, category_id, user_id)
    if db_category:
        db.delete(db_category)
        db.commit()
    return db_category

# ========== 用户设置相关 ==========
def get_user_settings(db: Session, user_id: int):
    settings = db.query(UserSettings).filter(UserSettings.user_id == user_id).first()
    if not settings:
        return create_user_settings(db, user_id)
    return settings

def create_user_settings(db: Session, user_id: int):
    db_settings = UserSettings(user_id=user_id)
    db.add(db_settings)
    db.commit()
    db.refresh(db_settings)
    return db_settings

def update_user_settings(db: Session, user_id: int, settings_update: schemas.UserSettingsUpdate):
    db_settings = get_user_settings(db, user_id)
    if not db_settings:
        db_settings = create_user_settings(db, user_id)
    
    update_data = settings_update.dict(exclude_unset=True)
    for field, value in update_data.items():
        setattr(db_settings, field, value)
    
    db.commit()
    db.refresh(db_settings)
    return db_settings

# ========== 访问历史相关 ==========
def create_access_history(db: Session, user_id: int, history: schemas.AccessHistoryCreate):
    db_history = AccessHistory(
        user_id=user_id,
        link_url=history.link_url,
        link_name=history.link_name
    )
    db.add(db_history)
    db.commit()
    db.refresh(db_history)
    return db_history

def get_access_history(db: Session, user_id: int, limit: int = 100):
    return db.query(AccessHistory).filter(AccessHistory.user_id == user_id).order_by(AccessHistory.timestamp.desc()).limit(limit).all()

# ========== 批量操作 ==========
def batch_update_category(db: Session, user_id: int, link_urls: List[str], category: str):
    updated = db.query(Link).filter(
        and_(Link.user_id == user_id, Link.url.in_(link_urls))
    ).update({"category": category}, synchronize_session=False)
    db.commit()
    return updated

def batch_update_tags(db: Session, user_id: int, link_urls: List[str], tags: List[str]):
    updated = db.query(Link).filter(
        and_(Link.user_id == user_id, Link.url.in_(link_urls))
    ).update({"tags": tags}, synchronize_session=False)
    db.commit()
    return updated

def batch_update_share(db: Session, user_id: int, link_urls: List[str], is_private: bool):
    updated = db.query(Link).filter(
        and_(Link.user_id == user_id, Link.url.in_(link_urls))
    ).update({"is_private": is_private}, synchronize_session=False)
    db.commit()
    return updated

def batch_delete_links(db: Session, user_id: int, link_urls: List[str]):
    deleted = db.query(Link).filter(
        and_(Link.user_id == user_id, Link.url.in_(link_urls))
    ).delete(synchronize_session=False)
    db.commit()
    return deleted

