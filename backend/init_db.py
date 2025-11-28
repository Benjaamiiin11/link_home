"""
数据库初始化脚本
用于创建数据库和表结构
"""
import pymysql
from sqlalchemy import create_engine, text
from database import settings, Base
from models import User, Link, Category, UserSettings, AccessHistory

def create_database_if_not_exists():
    """如果数据库不存在，则创建它"""
    try:
        # 连接到 MySQL 服务器（不指定数据库）
        connection = pymysql.connect(
            host=settings.DB_HOST,
            port=settings.DB_PORT,
            user=settings.DB_USER,
            password=settings.DB_PASSWORD,
            charset='utf8mb4'
        )
        
        with connection.cursor() as cursor:
            # 检查数据库是否存在
            cursor.execute(f"SHOW DATABASES LIKE '{settings.DB_NAME}'")
            result = cursor.fetchone()
            
            if not result:
                # 创建数据库
                print(f"数据库 '{settings.DB_NAME}' 不存在，正在创建...")
                cursor.execute(f"CREATE DATABASE {settings.DB_NAME} CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci")
                print(f"数据库 '{settings.DB_NAME}' 创建成功！")
            else:
                print(f"数据库 '{settings.DB_NAME}' 已存在")
        
        connection.close()
        
    except pymysql.Error as e:
        print(f"创建数据库时出错: {e}")
        raise

def init_db():
    """初始化数据库，创建所有表"""
    # 先创建数据库（如果不存在）
    create_database_if_not_exists()
    
    # 创建数据库连接URL
    DATABASE_URL = f"mysql+pymysql://{settings.DB_USER}:{settings.DB_PASSWORD}@{settings.DB_HOST}:{settings.DB_PORT}/{settings.DB_NAME}?charset=utf8mb4"
    
    # 创建数据库引擎
    engine = create_engine(
        DATABASE_URL,
        pool_pre_ping=True,
        pool_recycle=3600,
        echo=False
    )
    
    # 创建所有表
    print("正在创建数据库表...")
    Base.metadata.create_all(bind=engine)
    print("数据库表创建完成！")

if __name__ == "__main__":
    init_db()

