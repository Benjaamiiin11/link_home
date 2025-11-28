/**
 * API 封装类
 * 用于连接后端 FastAPI 服务
 */

class LinkPortalAPI {
    constructor(baseURL = 'http://localhost:8081/api/v1') {
        this.baseURL = baseURL;
        this.currentUserId = null;
    }

    /**
     * 通用请求方法
     */
    async request(endpoint, options = {}) {
        const url = `${this.baseURL}${endpoint}`;
        const timeout = options.timeout || 3000; // 默认3秒超时
        
        const config = {
            headers: {
                'Content-Type': 'application/json',
                ...options.headers
            },
            ...options
        };

        if (config.body && typeof config.body === 'object') {
            config.body = JSON.stringify(config.body);
        }

        // 添加超时控制
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), timeout);
        config.signal = controller.signal;

        try {
            const response = await fetch(url, config);
            clearTimeout(timeoutId);
            
            // 204 No Content 响应
            if (response.status === 204) {
                return null;
            }

            if (!response.ok) {
                const error = await response.json().catch(() => ({ detail: '请求失败' }));
                throw new Error(error.detail || `HTTP ${response.status}`);
            }

            return await response.json();
        } catch (error) {
            clearTimeout(timeoutId);
            if (error.name === 'AbortError') {
                throw new Error('请求超时');
            }
            console.error('API 请求错误:', error);
            throw error;
        }
    }

    /**
     * 设置当前用户ID
     */
    setCurrentUserId(userId) {
        this.currentUserId = userId;
    }

    // ========== 用户相关 ==========

    /**
     * 获取所有用户
     */
    async getUsers() {
        return this.request('/users');
    }

    /**
     * 获取指定用户
     */
    async getUser(userId) {
        return this.request(`/users/${userId}`);
    }

    /**
     * 创建用户（注册）
     */
    async createUser(name, password) {
        return this.request('/users', {
            method: 'POST',
            body: { name, password }
        });
    }

    /**
     * 用户登录
     */
    async login(name, password) {
        return this.request('/auth/login', {
            method: 'POST',
            body: { name, password }
        });
    }

    /**
     * 删除用户
     */
    async deleteUser(userId) {
        return this.request(`/users/${userId}`, {
            method: 'DELETE'
        });
    }

    // ========== 链接相关 ==========

    /**
     * 获取用户的链接列表
     * @param {number} userId - 用户ID
     * @param {object} options - 查询选项 {category, search}
     */
    async getLinks(userId, options = {}) {
        const params = new URLSearchParams();
        if (options.category) params.append('category', options.category);
        if (options.search) params.append('search', options.search);
        
        const query = params.toString() ? `?${params.toString()}` : '';
        return this.request(`/users/${userId}/links${query}`);
    }

    /**
     * 获取指定链接
     */
    async getLink(userId, linkId) {
        return this.request(`/users/${userId}/links/${linkId}`);
    }

    /**
     * 创建链接
     */
    async createLink(userId, linkData) {
        return this.request(`/users/${userId}/links`, {
            method: 'POST',
            body: {
                name: linkData.name,
                url: linkData.url,
                icon: linkData.icon,
                note: linkData.note,
                category: linkData.category || '未分类',
                tags: linkData.tags || [],
                is_private: linkData.is_private || false
            }
        });
    }

    /**
     * 更新链接
     */
    async updateLink(userId, linkId, updates) {
        return this.request(`/users/${userId}/links/${linkId}`, {
            method: 'PUT',
            body: updates
        });
    }

    /**
     * 删除链接
     */
    async deleteLink(userId, linkId) {
        return this.request(`/users/${userId}/links/${linkId}`, {
            method: 'DELETE'
        });
    }

    /**
     * 记录链接点击
     */
    async clickLink(userId, linkId) {
        return this.request(`/users/${userId}/links/${linkId}/click`, {
            method: 'POST'
        });
    }

    // ========== 分类相关 ==========

    /**
     * 获取用户的分类列表
     */
    async getCategories(userId) {
        return this.request(`/users/${userId}/categories`);
    }

    /**
     * 创建分类
     */
    async createCategory(userId, categoryData) {
        return this.request(`/users/${userId}/categories`, {
            method: 'POST',
            body: {
                name: categoryData.name,
                parent: categoryData.parent || null,
                is_collapsed: categoryData.is_collapsed || false
            }
        });
    }

    /**
     * 更新分类
     */
    async updateCategory(userId, categoryId, name, parent = null) {
        const params = new URLSearchParams();
        params.append('name', name);
        if (parent !== null) params.append('parent', parent);
        
        return this.request(`/users/${userId}/categories/${categoryId}?${params.toString()}`, {
            method: 'PUT'
        });
    }

    /**
     * 删除分类
     */
    async deleteCategory(userId, categoryId) {
        return this.request(`/users/${userId}/categories/${categoryId}`, {
            method: 'DELETE'
        });
    }

    // ========== 用户设置相关 ==========

    /**
     * 获取用户设置
     */
    async getUserSettings(userId) {
        return this.request(`/users/${userId}/settings`);
    }

    /**
     * 更新用户设置
     */
    async updateUserSettings(userId, settings) {
        return this.request(`/users/${userId}/settings`, {
            method: 'PUT',
            body: settings
        });
    }

    // ========== 访问历史相关 ==========

    /**
     * 获取访问历史
     */
    async getAccessHistory(userId, limit = 100) {
        return this.request(`/users/${userId}/access-history?limit=${limit}`);
    }

    /**
     * 创建访问历史记录
     */
    async createAccessHistory(userId, linkUrl, linkName) {
        return this.request(`/users/${userId}/access-history`, {
            method: 'POST',
            body: {
                link_url: linkUrl,
                link_name: linkName
            }
        });
    }

    // ========== 批量操作 ==========

    /**
     * 批量更新分类
     */
    async batchUpdateCategory(userId, linkUrls, category) {
        return this.request(`/users/${userId}/links/batch/category`, {
            method: 'POST',
            body: {
                link_urls: linkUrls,
                category: category
            }
        });
    }

    /**
     * 批量更新标签
     */
    async batchUpdateTags(userId, linkUrls, tags) {
        return this.request(`/users/${userId}/links/batch/tags`, {
            method: 'POST',
            body: {
                link_urls: linkUrls,
                tags: tags
            }
        });
    }

    /**
     * 批量更新分享设置
     */
    async batchUpdateShare(userId, linkUrls, isPrivate) {
        return this.request(`/users/${userId}/links/batch/share`, {
            method: 'POST',
            body: {
                link_urls: linkUrls,
                is_private: isPrivate
            }
        });
    }

    /**
     * 批量删除链接
     */
    async batchDeleteLinks(userId, linkUrls) {
        return this.request(`/users/${userId}/links/batch/delete`, {
            method: 'POST',
            body: {
                link_urls: linkUrls
            }
        });
    }
}

// 导出 API 类（如果使用模块化）
if (typeof module !== 'undefined' && module.exports) {
    module.exports = LinkPortalAPI;
}


