"""
数据库迁移脚本：添加 page_subtitle 字段到 user_settings 表
"""
import pymysql
from database import settings

def migrate_add_page_subtitle():
    """添加 page_subtitle 字段到 user_settings 表"""
    try:
        # 连接到数据库
        connection = pymysql.connect(
            host=settings.DB_HOST,
            port=settings.DB_PORT,
            user=settings.DB_USER,
            password=settings.DB_PASSWORD,
            database=settings.DB_NAME,
            charset='utf8mb4'
        )
        
        with connection.cursor() as cursor:
            # 检查字段是否已存在
            cursor.execute("""
                SELECT COUNT(*) 
                FROM information_schema.COLUMNS 
                WHERE TABLE_SCHEMA = %s 
                AND TABLE_NAME = 'user_settings' 
                AND COLUMN_NAME = 'page_subtitle'
            """, (settings.DB_NAME,))
            
            result = cursor.fetchone()
            if result[0] > 0:
                print("字段 'page_subtitle' 已存在，无需添加")
                connection.close()
                return
            
            # 添加 page_subtitle 字段
            print("正在添加 page_subtitle 字段到 user_settings 表...")
            cursor.execute("""
                ALTER TABLE user_settings 
                ADD COLUMN page_subtitle VARCHAR(200) DEFAULT '快速访问常用网站' 
                AFTER page_title
            """)
            
            connection.commit()
            print("字段 'page_subtitle' 添加成功！")
        
        connection.close()
        
    except pymysql.Error as e:
        print(f"迁移失败: {e}")
        raise

if __name__ == "__main__":
    print("开始数据库迁移...")
    migrate_add_page_subtitle()
    print("迁移完成！")

