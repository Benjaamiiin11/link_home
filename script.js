// 全局变量
let allLinks = [];
let filteredLinks = [];
let currentCategory = '全部';
let draggedElement = null;
let draggedIndex = null;
let editingLinkIndex = null; // 正在编辑的链接索引（在allLinks中）
let customCategories = []; // 自定义分类列表（即使没有链接使用也会显示）
let categoryFolders = new Map(); // 分类文件夹结构 {categoryName: {parent: 'parentName', children: [], collapsed: false}}
let currentView = 'card'; // 当前视图模式：'card' 或 'list'
let batchMode = false; // 批量操作模式
let selectedLinks = new Set(); // 选中的链接URL集合
let sortBy = 'custom'; // 排序方式：'custom'(自定义), 'name'(名称), 'category'(分类), 'time'(时间)
let sortOrder = 'asc'; // 排序顺序：'asc'(升序), 'desc'(降序)
let favoriteLinks = new Set(); // 收藏的链接URL集合
let darkMode = false; // 深色模式
let allTags = new Set(); // 所有标签集合
let currentTagFilter = null; // 当前标签过滤
let customTheme = null; // 自定义主题 {primaryColor, gradientStart, gradientEnd}
let accessHistory = []; // 访问历史 [{url, name, timestamp}]

// 多用户管理
let users = []; // 已登录的用户列表 [{id, name, createdAt}] - 只包含已登录过的用户
let currentUserId = null; // 当前用户ID

// API 配置
// 自动根据当前访问的域名构建 API 地址
function getAPIBaseURL() {
    const hostname = window.location.hostname;
    // 如果访问的是 localhost 或 127.0.0.1，使用 localhost:8081
    // 否则使用相同的 hostname，端口为 8081
    if (hostname === 'localhost' || hostname === '127.0.0.1') {
        return 'http://localhost:8081/api/v1';
    } else {
        return `http://${hostname}:8081/api/v1`;
    }
}
const API_BASE_URL = getAPIBaseURL();
let api = null; // API 实例
let useBackendAPI = false; // 是否使用后端 API（自动检测）

// 初始化 API（快速失败，1秒超时）
async function initAPI() {
    if (typeof LinkPortalAPI !== 'undefined') {
        try {
            api = new LinkPortalAPI(); // 使用自动检测的 baseURL
            // 快速测试连接（1秒超时）
            try {
                const controller = new AbortController();
                const timeoutId = setTimeout(() => controller.abort(), 1000);
                
                const response = await fetch(`${API_BASE_URL}/users`, {
                    signal: controller.signal
                });
                clearTimeout(timeoutId);
                
                if (response.ok) {
                    useBackendAPI = true;
                    console.log('已连接到后端 API');
                } else {
                    useBackendAPI = false;
                    console.log('后端 API 响应异常，使用 localStorage');
                }
            } catch (error) {
                useBackendAPI = false;
                if (error.name === 'AbortError') {
                    console.log('后端 API 连接超时，使用 localStorage');
                } else {
                    console.log('后端 API 不可用，使用 localStorage:', error.message);
                }
            }
        } catch (e) {
            console.error('API 初始化失败:', e);
            useBackendAPI = false;
        }
    } else {
        useBackendAPI = false;
        console.log('API 类未定义，使用 localStorage');
    }
}

// 初始化
document.addEventListener('DOMContentLoaded', async () => {
    // 显示加载状态
    const loadingIndicator = document.getElementById('loadingIndicator');
    if (loadingIndicator) {
        loadingIndicator.style.display = 'flex';
    }
    
    try {
        // 初始化 API（快速失败）
        await initAPI();
        
        // 初始化用户系统（必须在最前面，因为后续加载需要使用用户前缀）
        await initializeUserSystem();
        
        // 并行加载不相互依赖的数据
        await Promise.all([
            loadLinksOrder(),
        loadCustomCategories(),
        loadFavoriteLinks(),
        loadAccessHistory()
    ]);
    
    // 同步加载（依赖前面的数据或不需要异步）
    loadCategoryFolders();
    loadDarkMode();
    loadAllTags();
    loadCustomTheme();
    loadPageTitle(); // 加载页面标题
        
        // 确保数据已加载（数据应该从数据库或 localStorage 加载）
        if (!allLinks || allLinks.length === 0) {
            console.warn('allLinks 为空，数据可能尚未加载');
        }
        
        // 渲染和设置
        initializeCategories();
        setupViewToggle(); // 先设置视图切换，再渲染
        renderLinks();
        setupSearch();
        setupDragAndDrop();
        setupModal();
        setupBatchMode();
        setupUserManagement(); // 设置用户管理
        setupSort();
        loadSortSettings();
        setupThemeToggle();
        setupThemeColor();
        setupKeyboardShortcuts();
        setupTagClick();
        setupQuickAdd();
        setupShareLinks();
        setupAccessHistory();
        setupPasteImport(); // 设置粘贴导入
        showContextMenu = setupContextMenu(); // 设置右键菜单
        setupTitleEdit(); // 设置标题编辑
    } catch (error) {
        console.error('初始化失败:', error);
    } finally {
        // 隐藏加载状态
        if (loadingIndicator) {
            loadingIndicator.style.display = 'none';
        }
    }
});

// 初始化分类（支持文件夹系统）
function initializeCategories() {
    const categoriesContainer = document.getElementById('categories');
    
    // 清空容器（保留收藏按钮）
    const favoriteBtn = document.getElementById('favoriteFilterBtn');
    categoriesContainer.innerHTML = '';
    if (favoriteBtn) {
        categoriesContainer.appendChild(favoriteBtn);
    }
    
    // 合并链接中的分类和自定义分类
    const linkCategories = new Set(allLinks.map(link => link.category));
    const allCategoriesSet = new Set([...linkCategories, ...customCategories]);
    const allCategories = Array.from(allCategoriesSet);
    
    // 构建分类树结构
    const categoryTree = buildCategoryTree(allCategories);
    
    // 添加收藏按钮（如果还没有）
    if (!favoriteBtn) {
        const favBtn = document.createElement('button');
        favBtn.className = 'category-btn favorite-filter';
        favBtn.id = 'favoriteFilterBtn';
        favBtn.dataset.category = '收藏';
        favBtn.innerHTML = `
            <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor" stroke="currentColor" stroke-width="2">
                <path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z"></path>
            </svg>
            收藏
        `;
        categoriesContainer.appendChild(favBtn);
    }
    
    // 添加"全部"按钮
    const allBtn = document.createElement('button');
    allBtn.className = `category-btn ${currentCategory === '全部' ? 'active' : ''}`;
    allBtn.dataset.category = '全部';
    allBtn.textContent = '全部';
    categoriesContainer.appendChild(allBtn);
    
    // 渲染分类树
    renderCategoryTree(categoryTree, categoriesContainer);
    
    // 绑定分类点击事件（包括收藏按钮和全部按钮）
    categoriesContainer.querySelectorAll('.category-btn').forEach(btn => {
        btn.addEventListener('click', (e) => {
            // 如果点击的是文件夹展开/折叠按钮，不切换分类
            if (e.target.closest('.folder-toggle')) {
                return;
            }
            currentCategory = btn.dataset.category;
            currentTagFilter = null; // 清除标签过滤
            document.querySelectorAll('.category-btn').forEach(b => b.classList.remove('active'));
            document.querySelectorAll('.tag-filter-btn').forEach(b => b.classList.remove('active'));
            btn.classList.add('active');
            filterLinks();
        });
    });
    
    // 添加标签过滤按钮
    updateTagFilters();
    
    // 更新分类列表（用于输入提示）
    updateCategoryList();
}

// 构建分类树结构
function buildCategoryTree(categories) {
    const tree = [];
    const categoryMap = new Map();
    
    // 初始化所有分类
    categories.forEach(cat => {
        const folderInfo = categoryFolders.get(cat) || { parent: null, children: [], collapsed: false };
        categoryMap.set(cat, {
            name: cat,
            parent: folderInfo.parent,
            children: [],
            collapsed: folderInfo.collapsed || false,
            linkCount: allLinks.filter(link => link.category === cat).length
        });
    });
    
    // 建立父子关系
    categoryMap.forEach((cat, name) => {
        if (cat.parent && categoryMap.has(cat.parent)) {
            categoryMap.get(cat.parent).children.push(cat);
        } else {
            tree.push(cat);
        }
    });
    
    // 排序：文件夹在前，按名称排序
    const sortCategories = (cats) => {
        return cats.sort((a, b) => {
            if (a.children.length > 0 && b.children.length === 0) return -1;
            if (a.children.length === 0 && b.children.length > 0) return 1;
            return a.name.localeCompare(b.name, 'zh-CN');
        });
    };
    
    const sortTree = (node) => {
        if (node.children.length > 0) {
            node.children = sortCategories(node.children);
            node.children.forEach(sortTree);
        }
    };
    
    tree.forEach(sortTree);
    return sortCategories(tree);
}

// 渲染分类树
function renderCategoryTree(tree, container) {
    const renderNode = (node, level = 0, parentContainer = container) => {
        const hasChildren = node.children && node.children.length > 0;
        const isFolder = hasChildren;
        
        const btn = document.createElement('button');
        btn.className = `category-btn ${currentCategory === node.name ? 'active' : ''}`;
        if (isFolder) {
            btn.classList.add('category-folder');
        }
        btn.dataset.category = node.name;
        btn.style.paddingLeft = `${12 + level * 20}px`;
        
        let html = '';
        if (isFolder) {
            html += `<span class="folder-toggle" data-category="${node.name}">
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" class="folder-icon ${node.collapsed ? 'collapsed' : ''}">
                    <polyline points="9 18 15 12 9 6"></polyline>
                </svg>
            </span>`;
            html += `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" class="folder-icon-svg">
                <path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"></path>
            </svg>`;
        }
        html += `<span class="category-name">${node.name}</span>`;
        if (node.linkCount > 0) {
            html += `<span class="category-count">${node.linkCount}</span>`;
        }
        
        btn.innerHTML = html;
        parentContainer.appendChild(btn);
        
        // 绑定文件夹展开/折叠
        if (isFolder) {
            const toggle = btn.querySelector('.folder-toggle');
            toggle.addEventListener('click', (e) => {
                e.stopPropagation();
                node.collapsed = !node.collapsed;
                const icon = toggle.querySelector('.folder-icon');
                icon.classList.toggle('collapsed', node.collapsed);
                
                // 更新categoryFolders
                if (!categoryFolders.has(node.name)) {
                    categoryFolders.set(node.name, { parent: node.parent, children: [], collapsed: node.collapsed });
                } else {
                    categoryFolders.get(node.name).collapsed = node.collapsed;
                }
                saveCategoryFolders();
                
                // 显示/隐藏子分类
                const childrenContainer = btn.nextElementSibling;
                if (childrenContainer && childrenContainer.classList.contains('category-children')) {
                    childrenContainer.style.display = node.collapsed ? 'none' : 'block';
                } else if (!node.collapsed) {
                    // 创建子分类容器
                    const childrenDiv = document.createElement('div');
                    childrenDiv.className = 'category-children';
                    childrenDiv.style.display = 'block';
                    node.children.forEach(child => renderNode(child, level + 1, childrenDiv));
                    btn.parentNode.insertBefore(childrenDiv, btn.nextSibling);
                }
            });
            
            // 如果未折叠，渲染子分类
            if (!node.collapsed) {
                const childrenDiv = document.createElement('div');
                childrenDiv.className = 'category-children';
                node.children.forEach(child => renderNode(child, level + 1, childrenDiv));
                parentContainer.appendChild(childrenDiv);
            }
        }
    };
    
    tree.forEach(node => renderNode(node));
}

// 保存分类文件夹结构
function saveCategoryFolders() {
    try {
        const foldersData = {};
        categoryFolders.forEach((value, key) => {
            foldersData[key] = value;
        });
        localStorage.setItem(getUserStorageKey('categoryFolders'), JSON.stringify(foldersData));
    } catch (e) {
        console.error('保存分类文件夹失败:', e);
    }
}

// 加载分类文件夹结构
function loadCategoryFolders() {
    try {
        const saved = localStorage.getItem(getUserStorageKey('categoryFolders'));
        if (saved) {
            const foldersData = JSON.parse(saved);
            categoryFolders = new Map(Object.entries(foldersData));
        }
    } catch (e) {
        console.error('加载分类文件夹失败:', e);
        categoryFolders = new Map();
    }
}

// 设置搜索功能
function setupSearch() {
    const searchInput = document.getElementById('searchInput');
    let searchTimeout;
    
    searchInput.addEventListener('input', (e) => {
        clearTimeout(searchTimeout);
        searchTimeout = setTimeout(() => {
            filterLinks(e.target.value);
        }, 300);
    });
}

// 过滤链接
function filterLinks(searchTerm = '') {
    const searchLower = searchTerm.toLowerCase().trim();
    
    filteredLinks = allLinks.filter(link => {
        // 收藏过滤
        if (currentCategory === '收藏') {
            if (!favoriteLinks.has(link.url)) {
                return false;
            }
        } else {
            // 普通分类过滤
            const matchCategory = currentCategory === '全部' || link.category === currentCategory;
            if (!matchCategory) {
                return false;
            }
        }
        
        // 标签过滤
        if (currentTagFilter) {
            if (!link.tags || !Array.isArray(link.tags) || !link.tags.includes(currentTagFilter)) {
                return false;
            }
        }
        
        // 搜索过滤（包括标签）
        const matchSearch = !searchLower || 
            link.name.toLowerCase().includes(searchLower) ||
            link.note.toLowerCase().includes(searchLower) ||
            link.url.toLowerCase().includes(searchLower) ||
            (link.tags && link.tags.some(tag => tag.toLowerCase().includes(searchLower)));
        
        return matchSearch;
    });
    
    // 应用排序
    applySort();
    
    renderLinks();
}

// 应用排序
function applySort() {
    if (sortBy === 'custom') {
        // 自定义排序：保持原有顺序（拖拽后的顺序）
        return;
    }
    
    filteredLinks.sort((a, b) => {
        let comparison = 0;
        
        switch (sortBy) {
            case 'name':
                comparison = a.name.localeCompare(b.name, 'zh-CN');
                break;
            case 'category':
                comparison = (a.category || '未分类').localeCompare(b.category || '未分类', 'zh-CN');
                if (comparison === 0) {
                    // 分类相同时，按名称排序
                    comparison = a.name.localeCompare(b.name, 'zh-CN');
                }
                break;
            case 'time':
                // 使用添加时间（如果有）或使用索引作为时间
                const timeA = a.addTime || (allLinks.indexOf(a) * 1000);
                const timeB = b.addTime || (allLinks.indexOf(b) * 1000);
                comparison = timeA - timeB;
                break;
            case 'favorite':
                // 收藏优先，然后按名称排序
                const aFavorite = favoriteLinks.has(a.url);
                const bFavorite = favoriteLinks.has(b.url);
                if (aFavorite !== bFavorite) {
                    comparison = aFavorite ? -1 : 1;
                } else {
                    comparison = a.name.localeCompare(b.name, 'zh-CN');
                }
                break;
            case 'clicks':
                // 按访问次数排序
                const aClicks = a.clicks || a.clickCount || 0;
                const bClicks = b.clicks || b.clickCount || 0;
                comparison = aClicks - bClicks;
                break;
            case 'lastAccess':
                // 按最后访问时间排序
                const aLastAccess = a.lastAccess || a.lastAccessTime || 0;
                const bLastAccess = b.lastAccess || b.lastAccessTime || 0;
                comparison = aLastAccess - bLastAccess;
                break;
        }
        
        return sortOrder === 'asc' ? comparison : -comparison;
    });
}

// 渲染链接（根据当前视图模式）
function renderLinks() {
    if (currentView === 'card') {
        renderCardView();
    } else {
        renderListView();
    }
}

// 渲染卡片视图
function renderCardView() {
    const linksGrid = document.getElementById('linksGrid');
    const linksList = document.getElementById('linksList');
    const emptyState = document.getElementById('emptyState');
    
    // 隐藏列表视图
    if (linksList) linksList.style.display = 'none';
    
    if (filteredLinks.length === 0) {
        if (linksGrid) linksGrid.style.display = 'none';
        if (emptyState) emptyState.style.display = 'block';
        return;
    }
    
    if (linksGrid) linksGrid.style.display = 'grid';
    if (emptyState) emptyState.style.display = 'none';
    
    linksGrid.innerHTML = filteredLinks.map((link, index) => {
        const firstLetter = link.name.charAt(0).toUpperCase();
        const iconHtml = link.icon 
            ? `<img src="${link.icon}" alt="${link.name}" class="link-icon" 
                    onerror="this.style.display='none'; this.nextElementSibling.style.display='flex';">
                 <div class="icon-placeholder" style="display: none;">${firstLetter}</div>`
            : `<div class="icon-placeholder">${firstLetter}</div>`;
        
        // 找到在allLinks中的索引
        const allLinksIndex = allLinks.findIndex(l => l.url === link.url);
        
        const isSelected = selectedLinks.has(link.url);
        return `
            <div class="link-card ${isSelected ? 'selected' : ''}" 
                 data-url="${link.url}" 
                 data-index="${index}"
                 data-all-index="${allLinksIndex}"
                 draggable="${!batchMode}"
                 style="animation-delay: ${index * 0.05}s">
                <div class="favorite-container">
                    <button class="favorite-btn ${favoriteLinks.has(link.url) ? 'active' : ''}" 
                            data-url="${link.url}"
                            title="${favoriteLinks.has(link.url) ? '取消收藏' : '收藏'}">
                        <svg width="18" height="18" viewBox="0 0 24 24" fill="${favoriteLinks.has(link.url) ? 'currentColor' : 'none'}" stroke="currentColor" stroke-width="2">
                            <path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z"></path>
                        </svg>
                    </button>
                    ${(link.clicks || link.clickCount) ? `
                    <div class="view-count-display" title="访问次数：${link.clicks || link.clickCount || 0}">
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                            <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"></path>
                            <circle cx="12" cy="12" r="3"></circle>
                        </svg>
                        <span>${link.clicks || link.clickCount || 0}</span>
                    </div>
                    ` : ''}
                </div>
                ${batchMode ? `
                <div class="batch-checkbox">
                    <input type="checkbox" class="link-checkbox" data-url="${link.url}" ${isSelected ? 'checked' : ''}>
                </div>
                ` : ''}
                <div class="card-actions">
                    <button class="card-action-btn edit-btn" 
                            data-all-index="${allLinksIndex}"
                            title="编辑">
                        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                            <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"></path>
                            <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"></path>
                        </svg>
                    </button>
                    <button class="card-action-btn delete-btn" 
                            data-all-index="${allLinksIndex}"
                            data-link-name="${link.name}"
                            title="删除">
                        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                            <polyline points="3 6 5 6 21 6"></polyline>
                            <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path>
                        </svg>
                    </button>
                </div>
                ${iconHtml}
                <div class="link-name">${link.name}</div>
                ${link.note ? `<div class="link-note">${link.note}</div>` : ''}
                ${link.tags && link.tags.length > 0 ? `
                <div class="link-tags">
                    ${link.tags.map(tag => `<span class="tag-badge" data-tag="${tag}">${tag}</span>`).join('')}
                </div>
                ` : ''}
                ${link.private ? `<div class="link-private-badge" title="此链接不会出现在分享列表中">
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                        <rect x="3" y="11" width="18" height="11" rx="2" ry="2"></rect>
                        <path d="M7 11V7a5 5 0 0 1 10 0v4"></path>
                    </svg>
                    <span>私有</span>
                </div>` : ''}
                <div class="link-url">${getDomain(link.url)}</div>
            </div>
        `;
    }).join('');
    
    // 绑定批量选择复选框
    if (batchMode) {
        linksGrid.querySelectorAll('.link-checkbox').forEach(checkbox => {
            checkbox.addEventListener('change', (e) => {
                const url = checkbox.dataset.url;
                if (checkbox.checked) {
                    selectedLinks.add(url);
                } else {
                    selectedLinks.delete(url);
                }
                updateBatchToolbar();
                updateCardSelection();
            });
        });
    }
    
    // 绑定收藏按钮（使用捕获阶段，确保优先处理）
    linksGrid.querySelectorAll('.favorite-btn').forEach(btn => {
        btn.addEventListener('click', (e) => {
            e.stopPropagation();
            e.preventDefault();
            const url = btn.dataset.url;
            toggleFavorite(url);
        }, true); // 使用捕获阶段
    });
    
    // 绑定点击事件和拖拽事件
    linksGrid.querySelectorAll('.link-card').forEach(card => {
        let dragStartTime = 0;
        let hasMoved = false;
        let isDragging = false;
        
        // 点击跳转（需要检查是否在拖拽中）
        card.addEventListener('mousedown', (e) => {
            // 如果点击的是操作按钮，不触发拖拽
            if (e.target.closest('.card-actions')) {
                return;
            }
            dragStartTime = Date.now();
            hasMoved = false;
            isDragging = false;
        });
        
        card.addEventListener('mousemove', (e) => {
            if (dragStartTime > 0 && !isDragging) {
                // 检查是否移动了足够的距离
                const moveDistance = Math.abs(e.movementX) + Math.abs(e.movementY);
                if (moveDistance > 5) {
                    hasMoved = true;
                }
            }
        });
        
        // 监听拖拽开始，标记为正在拖拽
        card.addEventListener('dragstart', () => {
            isDragging = true;
        });
        
        card.addEventListener('click', (e) => {
            // 如果点击的是操作按钮、复选框或收藏按钮，不触发跳转
            if (e.target.closest('.card-actions') || 
                e.target.closest('.batch-checkbox') || 
                e.target.closest('.favorite-btn')) {
                return;
            }
            // 批量模式下，点击卡片切换选择状态
            if (batchMode) {
                const checkbox = card.querySelector('.link-checkbox');
                if (checkbox) {
                    checkbox.checked = !checkbox.checked;
                    checkbox.dispatchEvent(new Event('change'));
                }
                return;
            }
            // 如果正在拖拽，不触发点击跳转
            if (isDragging) {
                isDragging = false;
                return;
            }
            // 如果拖拽时间很短且没有移动，则认为是点击
            const clickDuration = Date.now() - dragStartTime;
            if (!hasMoved && clickDuration < 200) {
                const url = card.dataset.url;
                recordLinkAccess(url);
                window.open(url, '_blank');
            }
            dragStartTime = 0;
            hasMoved = false;
        });
        
        // 添加键盘支持
        card.setAttribute('tabindex', '0');
        card.addEventListener('keypress', (e) => {
            if (e.key === 'Enter' || e.key === ' ') {
                e.preventDefault();
                const url = card.dataset.url;
                recordLinkAccess(url);
                window.open(url, '_blank');
            }
        });
    });
    
    
    // 绑定编辑和删除按钮
    linksGrid.querySelectorAll('.edit-btn').forEach(btn => {
        btn.addEventListener('click', (e) => {
            e.stopPropagation();
            const index = parseInt(btn.dataset.allIndex);
            openEditModal(index);
        });
    });
    
    linksGrid.querySelectorAll('.delete-btn').forEach(btn => {
        btn.addEventListener('click', (e) => {
            e.stopPropagation();
            const index = parseInt(btn.dataset.allIndex);
            const linkName = btn.dataset.linkName;
            openDeleteModal(index, linkName);
        });
    });
    
    // 重新设置拖拽功能
    setupDragAndDrop();
}

// 渲染列表视图
function renderListView() {
    const linksGrid = document.getElementById('linksGrid');
    const linksList = document.getElementById('linksList');
    const emptyState = document.getElementById('emptyState');
    
    // 隐藏卡片视图
    if (linksGrid) linksGrid.style.display = 'none';
    
    if (filteredLinks.length === 0) {
        if (linksList) linksList.style.display = 'none';
        if (emptyState) emptyState.style.display = 'block';
        return;
    }
    
    if (linksList) linksList.style.display = 'block';
    if (emptyState) emptyState.style.display = 'none';
    
    // 创建表格结构
    linksList.innerHTML = `
        <div class="list-table-container">
            <table class="links-table">
                <thead>
                    <tr>
                        ${batchMode ? '<th class="col-checkbox"><input type="checkbox" id="selectAllCheckbox" title="全选"></th>' : ''}
                        <th class="col-favorite">收藏</th>
                        <th class="col-icon">图标</th>
                        <th class="col-name">名称</th>
                        <th class="col-url">网址</th>
                        <th class="col-category">分类</th>
                        <th class="col-tags">标签</th>
                        <th class="col-stats">访问统计</th>
                        <th class="col-note">备注</th>
                        <th class="col-actions">操作</th>
                    </tr>
                </thead>
                <tbody>
                    ${filteredLinks.map((link, index) => {
                        const firstLetter = link.name.charAt(0).toUpperCase();
                        const allLinksIndex = allLinks.findIndex(l => l.url === link.url);
                        const iconHtml = link.icon 
                            ? `<img src="${link.icon}" alt="${link.name}" class="list-icon" 
                                    onerror="this.style.display='none'; this.nextElementSibling.style.display='flex';">
                                 <div class="list-icon-placeholder" style="display: none;">${firstLetter}</div>`
                            : `<div class="list-icon-placeholder">${firstLetter}</div>`;
                        
                        const isSelected = selectedLinks.has(link.url);
                        const isFavorite = favoriteLinks.has(link.url);
                        return `
                            <tr class="link-row ${isSelected ? 'selected' : ''}" data-url="${link.url}" data-all-index="${allLinksIndex}">
                                ${batchMode ? `
                                <td class="col-checkbox">
                                    <input type="checkbox" class="link-checkbox" data-url="${link.url}" ${isSelected ? 'checked' : ''}>
                                </td>
                                ` : ''}
                                <td class="col-favorite">
                                    <button class="favorite-btn ${isFavorite ? 'active' : ''}" 
                                            data-url="${link.url}"
                                            title="${isFavorite ? '取消收藏' : '收藏'}">
                                        <svg width="16" height="16" viewBox="0 0 24 24" fill="${isFavorite ? 'currentColor' : 'none'}" stroke="currentColor" stroke-width="2">
                                            <path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z"></path>
                                        </svg>
                                    </button>
                                </td>
                                <td class="col-icon">
                                    ${iconHtml}
                                </td>
                                <td class="col-name">
                                    <div class="list-link-name">${link.name}</div>
                                </td>
                                <td class="col-url">
                                    <a href="${link.url}" target="_blank" class="list-link-url" title="${link.url}">
                                        ${getDomain(link.url)}
                                    </a>
                                </td>
                                <td class="col-category">
                                    <span class="list-category-badge">${link.category || '未分类'}</span>
                                </td>
                                <td class="col-tags">
                                    ${link.tags && link.tags.length > 0 ? 
                                        link.tags.map(tag => `<span class="tag-badge" data-tag="${tag}">${tag}</span>`).join('') 
                                        : '-'}
                                </td>
                                <td class="col-stats">
                                    ${(link.clicks || link.clickCount) ? `<span class="stat-item" title="访问次数">👁 ${link.clicks || link.clickCount || 0}</span>` : '<span class="stat-item">-</span>'}
                                    ${(link.lastAccess || link.lastAccessTime) ? `<span class="stat-item" title="最后访问：${formatAccessTime(link.lastAccess || link.lastAccessTime)}">🕐 ${formatRelativeTime(link.lastAccess || link.lastAccessTime)}</span>` : ''}
                                </td>
                                <td class="col-note">
                                    <div class="list-note">${link.note || '-'}</div>
                                    ${link.private ? `<div class="link-private-badge" title="此链接不会出现在分享列表中">
                                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                                            <rect x="3" y="11" width="18" height="11" rx="2" ry="2"></rect>
                                            <path d="M7 11V7a5 5 0 0 1 10 0v4"></path>
                                        </svg>
                                    </div>` : ''}
                                </td>
                                <td class="col-actions">
                                    <div class="list-actions">
                                        <button class="list-action-btn edit-btn" 
                                                data-all-index="${allLinksIndex}"
                                                title="编辑">
                                            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                                                <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"></path>
                                                <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"></path>
                                            </svg>
                                        </button>
                                        <button class="list-action-btn delete-btn" 
                                                data-all-index="${allLinksIndex}"
                                                data-link-name="${link.name}"
                                                title="删除">
                                            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                                                <polyline points="3 6 5 6 21 6"></polyline>
                                                <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path>
                                            </svg>
                                        </button>
                                    </div>
                                </td>
                            </tr>
                        `;
                    }).join('')}
                </tbody>
            </table>
        </div>
    `;
    
    // 绑定列表视图的事件
    
    linksList.querySelectorAll('.edit-btn').forEach(btn => {
        btn.addEventListener('click', (e) => {
            e.stopPropagation();
            const index = parseInt(btn.dataset.allIndex);
            openEditModal(index);
        });
    });
    
    linksList.querySelectorAll('.delete-btn').forEach(btn => {
        btn.addEventListener('click', (e) => {
            e.stopPropagation();
            const index = parseInt(btn.dataset.allIndex);
            const linkName = btn.dataset.linkName;
            openDeleteModal(index, linkName);
        });
    });
    
    // 绑定列表视图的批量选择
    if (batchMode) {
        linksList.querySelectorAll('.link-checkbox').forEach(checkbox => {
            checkbox.addEventListener('change', (e) => {
                const url = checkbox.dataset.url;
                if (checkbox.checked) {
                    selectedLinks.add(url);
                } else {
                    selectedLinks.delete(url);
                }
                updateBatchToolbar();
                updateListSelection();
            });
        });
        
        // 全选复选框
        const selectAllCheckbox = linksList.querySelector('#selectAllCheckbox');
        if (selectAllCheckbox) {
            selectAllCheckbox.addEventListener('change', (e) => {
                const checked = e.target.checked;
                linksList.querySelectorAll('.link-checkbox').forEach(checkbox => {
                    checkbox.checked = checked;
                    const url = checkbox.dataset.url;
                    if (checked) {
                        selectedLinks.add(url);
                    } else {
                        selectedLinks.delete(url);
                    }
                });
                updateBatchToolbar();
            });
        }
    }
    
    // 绑定列表视图的收藏按钮
    linksList.querySelectorAll('.favorite-btn').forEach(btn => {
        btn.addEventListener('click', (e) => {
            e.stopPropagation();
            const url = btn.dataset.url;
            toggleFavorite(url);
        });
    });
    
    // 行点击跳转
    linksList.querySelectorAll('.link-row').forEach(row => {
        // 右键菜单
        row.addEventListener('contextmenu', (e) => {
            if (batchMode) return; // 批量模式下不显示右键菜单
            const allIndex = parseInt(row.dataset.allIndex);
            if (allIndex !== -1 && showContextMenu) {
                const link = allLinks[allIndex];
                showContextMenu(link, allIndex, e);
            }
        });
        
        row.addEventListener('click', (e) => {
            // 如果点击的是操作按钮、链接或复选框，不触发行跳转
            if (e.target.closest('.list-actions') || e.target.closest('a') || e.target.closest('.col-checkbox')) {
                return;
            }
            // 批量模式下，点击行切换选择状态
            if (batchMode) {
                const checkbox = row.querySelector('.link-checkbox');
                if (checkbox) {
                    checkbox.checked = !checkbox.checked;
                    checkbox.dispatchEvent(new Event('change'));
                }
                return;
            }
            const url = row.dataset.url;
            recordLinkAccess(url);
            window.open(url, '_blank');
        });
        
        // 悬停效果
        row.addEventListener('mouseenter', () => {
            row.style.backgroundColor = 'rgba(99, 102, 241, 0.05)';
        });
        row.addEventListener('mouseleave', () => {
            row.style.backgroundColor = '';
        });
    });
}

// 设置视图切换
function setupViewToggle() {
    const cardViewBtn = document.getElementById('cardViewBtn');
    const listViewBtn = document.getElementById('listViewBtn');
    
    // 从本地存储加载视图偏好
    const savedView = localStorage.getItem('preferredView');
    if (savedView === 'list' || savedView === 'card') {
        currentView = savedView;
    }
    
    // 初始化视图
    updateViewToggle();
    
    if (cardViewBtn) {
        cardViewBtn.addEventListener('click', () => {
            currentView = 'card';
            localStorage.setItem('preferredView', 'card');
            updateViewToggle();
            renderLinks();
        });
    }
    
    if (listViewBtn) {
        listViewBtn.addEventListener('click', () => {
            currentView = 'list';
            localStorage.setItem('preferredView', 'list');
            updateViewToggle();
            renderLinks();
        });
    }
}

// 更新视图切换按钮状态
function updateViewToggle() {
    const cardViewBtn = document.getElementById('cardViewBtn');
    const listViewBtn = document.getElementById('listViewBtn');
    
    if (cardViewBtn && listViewBtn) {
        if (currentView === 'card') {
            cardViewBtn.classList.add('active');
            listViewBtn.classList.remove('active');
        } else {
            cardViewBtn.classList.remove('active');
            listViewBtn.classList.add('active');
        }
    }
}

// 获取域名
function getDomain(url) {
    try {
        const urlObj = new URL(url);
        return urlObj.hostname.replace('www.', '');
    } catch (e) {
        return url;
    }
}

// 获取网站favicon URL
function getFaviconUrl(url) {
    try {
        const urlObj = new URL(url);
        const domain = urlObj.hostname;
        // 使用Google的favicon服务
        return `https://www.google.com/s2/favicons?domain=${domain}&sz=64`;
    } catch (e) {
        return '';
    }
}

// 获取网站信息（标题、描述、图标）- 使用Open Graph
async function fetchWebsiteInfo(url) {
    try {
        const urlObj = new URL(url);
        const domain = urlObj.hostname;
        
        const info = {
            icon: getFaviconUrl(url),
            title: null,
            description: null
        };
        
        // 尝试使用CORS代理获取Open Graph数据
        // 注意：由于CORS限制，需要使用代理服务
        // 实际项目中建议使用自己的后端API
        try {
            const proxyUrl = `https://api.allorigins.win/get?url=${encodeURIComponent(url)}`;
            const controller = new AbortController();
            const timeoutId = setTimeout(() => controller.abort(), 10000); // 10秒超时
            
            const response = await fetch(proxyUrl, {
                signal: controller.signal
            });
            
            clearTimeout(timeoutId);
            
            if (response.ok) {
                const data = await response.json();
                const html = data.contents || '';
                
                // 解析Open Graph标签
                const ogTitleMatch = html.match(/<meta\s+property=["']og:title["']\s+content=["']([^"']+)["']/i) ||
                                    html.match(/<meta\s+content=["']([^"']+)["']\s+property=["']og:title["']/i);
                const ogDescMatch = html.match(/<meta\s+property=["']og:description["']\s+content=["']([^"']+)["']/i) ||
                                   html.match(/<meta\s+content=["']([^"']+)["']\s+property=["']og:description["']/i);
                const ogImageMatch = html.match(/<meta\s+property=["']og:image["']\s+content=["']([^"']+)["']/i) ||
                                    html.match(/<meta\s+content=["']([^"']+)["']\s+property=["']og:image["']/i);
                
                // 如果没有Open Graph，尝试获取普通meta标签
                const titleMatch = html.match(/<title[^>]*>([^<]+)<\/title>/i);
                const descMatch = html.match(/<meta\s+name=["']description["']\s+content=["']([^"']+)["']/i) ||
                                  html.match(/<meta\s+content=["']([^"']+)["']\s+name=["']description["']/i);
                
                if (ogTitleMatch || titleMatch) {
                    info.title = (ogTitleMatch ? ogTitleMatch[1] : titleMatch[1]).trim();
                }
                
                if (ogDescMatch || descMatch) {
                    info.description = (ogDescMatch ? ogDescMatch[1] : descMatch[1]).trim();
                }
                
                if (ogImageMatch) {
                    info.icon = ogImageMatch[1].trim();
                }
            }
        } catch (fetchError) {
            // 如果获取失败，只返回基本信息
        }
        
        return info;
    } catch (e) {
        console.error('获取网站信息失败:', e);
        return {
            icon: getFaviconUrl(url),
            title: null,
            description: null
        };
    }
}

// 自动填充链接信息（增强版，支持Open Graph）
async function autoFillLinkInfo() {
    const urlInput = document.getElementById('linkUrl');
    const nameInput = document.getElementById('linkName');
    const iconInput = document.getElementById('linkIcon');
    const noteInput = document.getElementById('linkNote');
    
    if (!urlInput || !urlInput.value.trim()) {
        return;
    }
    
    const url = urlInput.value.trim();
    
    // 验证URL
    try {
        new URL(url);
    } catch (e) {
        return; // URL无效
    }
    
    // 显示加载提示
    const iconLabel = iconInput ? iconInput.previousElementSibling : null;
    const noteLabel = noteInput ? noteInput.previousElementSibling : null;
    
    if (iconLabel) {
        const originalIconText = iconLabel.textContent;
        iconLabel.textContent = '图标URL（正在自动获取...）';
        setTimeout(() => {
            iconLabel.textContent = originalIconText;
        }, 3000);
    }
    
    if (noteLabel) {
        const originalNoteText = noteLabel.textContent;
        noteLabel.textContent = '备注（正在自动获取描述...）';
        setTimeout(() => {
            noteLabel.textContent = originalNoteText;
        }, 3000);
    }
    
    // 异步获取网站信息
    try {
        const websiteInfo = await fetchWebsiteInfo(url);
        
        // 如果名称为空，使用获取的标题或域名
        if (!nameInput.value.trim()) {
            nameInput.value = websiteInfo.title || getDomain(url);
        }
        
        // 如果图标为空，使用获取的图标
        if (!iconInput.value.trim()) {
            iconInput.value = websiteInfo.icon || getFaviconUrl(url);
        }
        
        // 如果备注为空，使用获取的描述
        if (!noteInput.value.trim() && websiteInfo.description) {
            noteInput.value = websiteInfo.description;
        }
    } catch (error) {
        console.error('获取网站信息失败:', error);
        // 如果获取失败，使用默认值
        if (!nameInput.value.trim()) {
            nameInput.value = getDomain(url);
        }
        if (!iconInput.value.trim()) {
            iconInput.value = getFaviconUrl(url);
        }
    }
}

// 导出所有数据为JSON（包含链接和分类）
function exportAllData() {
    const exportData = {
        version: '1.0',
        exportDate: new Date().toISOString(),
        links: allLinks,
        customCategories: customCategories,
        metadata: {
            totalLinks: allLinks.length,
            totalCategories: [...new Set(allLinks.map(link => link.category)), ...customCategories].length
        }
    };
    
    const dataStr = JSON.stringify(exportData, null, 2);
    const dataBlob = new Blob([dataStr], { type: 'application/json' });
    const url = URL.createObjectURL(dataBlob);
    const link = document.createElement('a');
    link.href = url;
    const dateStr = new Date().toISOString().split('T')[0];
    link.download = `links-backup-${dateStr}.json`;
    link.click();
    URL.revokeObjectURL(url);
    
    // 显示成功提示
    showNotification('数据导出成功！', 'success');
}

// 导出所有数据为Excel
function exportToExcel() {
    try {
        // 检查SheetJS库是否加载
        if (typeof XLSX === 'undefined') {
            showNotification('Excel导出功能需要加载SheetJS库，请刷新页面重试', 'error');
            return;
        }
        
        // 创建工作簿
        const wb = XLSX.utils.book_new();
        
        // 创建链接数据表
        const linksData = allLinks.map(link => ({
            '名称': link.name,
            '网址': link.url,
            '图标URL': link.icon || '',
            '备注': link.note || '',
            '分类': link.category || '未分类'
        }));
        
        const ws = XLSX.utils.json_to_sheet(linksData);
        
        // 设置列宽
        const colWidths = [
            { wch: 20 }, // 名称
            { wch: 40 }, // 网址
            { wch: 40 }, // 图标URL
            { wch: 30 }, // 备注
            { wch: 15 }  // 分类
        ];
        ws['!cols'] = colWidths;
        
        // 添加工作表
        XLSX.utils.book_append_sheet(wb, ws, '链接列表');
        
        // 如果有自定义分类，创建分类表
        if (customCategories.length > 0) {
            const categoriesData = customCategories.map(cat => ({
                '分类名称': cat
            }));
            const wsCategories = XLSX.utils.json_to_sheet(categoriesData);
            wsCategories['!cols'] = [{ wch: 20 }];
            XLSX.utils.book_append_sheet(wb, wsCategories, '自定义分类');
        }
        
        // 导出文件
        const dateStr = new Date().toISOString().split('T')[0];
        XLSX.writeFile(wb, `links-backup-${dateStr}.xlsx`);
        
        showNotification('Excel导出成功！', 'success');
    } catch (error) {
        console.error('Excel导出失败:', error);
        showNotification('Excel导出失败：' + error.message, 'error');
    }
}

// 导出为Markdown格式
function exportToMarkdown() {
    let markdown = '# 我的链接收藏\n\n';
    markdown += `> 导出时间：${new Date().toLocaleString('zh-CN')}\n`;
    markdown += `> 链接总数：${allLinks.length}\n\n`;
    
    // 按分类分组
    const linksByCategory = {};
    allLinks.forEach(link => {
        const category = link.category || '未分类';
        if (!linksByCategory[category]) {
            linksByCategory[category] = [];
        }
        linksByCategory[category].push(link);
    });
    
    // 按分类输出
    Object.keys(linksByCategory).sort().forEach(category => {
        markdown += `## ${category}\n\n`;
        linksByCategory[category].forEach(link => {
            const tags = link.tags && link.tags.length > 0 ? ` [${link.tags.join(', ')}]` : '';
            const note = link.note ? ` - ${link.note}` : '';
            markdown += `- [${link.name}](${link.url})${tags}${note}\n`;
        });
        markdown += '\n';
    });
    
    // 下载文件
    const dataBlob = new Blob([markdown], { type: 'text/markdown;charset=utf-8' });
    const url = URL.createObjectURL(dataBlob);
    const link = document.createElement('a');
    link.href = url;
    const dateStr = new Date().toISOString().split('T')[0];
    link.download = `links-${dateStr}.md`;
    link.click();
    URL.revokeObjectURL(url);
    
    showNotification('Markdown导出成功！', 'success');
}

// 导出为HTML书签文件
function exportToHtmlBookmark() {
    let html = `<!DOCTYPE NETSCAPE-Bookmark-file-1>
<!-- This is an automatically generated file.
     It will be read and overwritten.
     DO NOT EDIT! -->
<META HTTP-EQUIV="Content-Type" CONTENT="text/html; charset=UTF-8">
<TITLE>书签</TITLE>
<H1>书签</H1>
<DL><P>
`;
    
    // 按分类分组
    const linksByCategory = {};
    allLinks.forEach(link => {
        const category = link.category || '未分类';
        if (!linksByCategory[category]) {
            linksByCategory[category] = [];
        }
        linksByCategory[category].push(link);
    });
    
    // 按分类输出
    Object.keys(linksByCategory).sort().forEach(category => {
        html += `    <DT><H3 ADD_DATE="${Math.floor(Date.now() / 1000)}">${category}</H3>\n`;
        html += `    <DL><P>\n`;
        linksByCategory[category].forEach(link => {
            const addDate = link.addTime ? Math.floor(link.addTime / 1000) : Math.floor(Date.now() / 1000);
            html += `        <DT><A HREF="${link.url}" ADD_DATE="${addDate}">${link.name}</A>\n`;
        });
        html += `    </DL><P>\n`;
    });
    
    html += `</DL><P>`;
    
    // 下载文件
    const dataBlob = new Blob([html], { type: 'text/html;charset=utf-8' });
    const url = URL.createObjectURL(dataBlob);
    const link = document.createElement('a');
    link.href = url;
    const dateStr = new Date().toISOString().split('T')[0];
    link.download = `bookmarks-${dateStr}.html`;
    link.click();
    URL.revokeObjectURL(url);
    
    showNotification('HTML书签导出成功！', 'success');
}

// 导出为CSV格式
function exportToCSV() {
    // CSV头部
    let csv = '名称,网址,图标URL,备注,分类,标签,访问次数,最后访问时间\n';
    
    // 添加链接数据
    allLinks.forEach(link => {
        const name = `"${(link.name || '').replace(/"/g, '""')}"`;
        const url = `"${(link.url || '').replace(/"/g, '""')}"`;
        const icon = `"${(link.icon || '').replace(/"/g, '""')}"`;
        const note = `"${(link.note || '').replace(/"/g, '""')}"`;
        const category = `"${(link.category || '未分类').replace(/"/g, '""')}"`;
        const tags = `"${(link.tags && link.tags.length > 0 ? link.tags.join(',') : '').replace(/"/g, '""')}"`;
        const clicks = link.clicks || link.clickCount || 0;
        const lastAccess = link.lastAccess || link.lastAccessTime || '';
        
        csv += `${name},${url},${icon},${note},${category},${tags},${clicks},${lastAccess}\n`;
    });
    
    // 下载文件
    const dataBlob = new Blob(['\ufeff' + csv], { type: 'text/csv;charset=utf-8' }); // 添加BOM以支持Excel正确显示中文
    const url = URL.createObjectURL(dataBlob);
    const link = document.createElement('a');
    link.href = url;
    const dateStr = new Date().toISOString().split('T')[0];
    link.download = `links-${dateStr}.csv`;
    link.click();
    URL.revokeObjectURL(url);
    
    showNotification('CSV导出成功！', 'success');
}

// 检测重复链接
function checkDuplicateLinks() {
    if (allLinks.length === 0) {
        showNotification('没有链接需要检测', 'info');
        return;
    }
    
    showNotification('正在检测重复链接...', 'info');
    
    // 标准化URL（用于比较）
    const normalizeUrl = (url) => {
        try {
            const urlObj = new URL(url);
            // 移除协议、www、末尾斜杠等
            let normalized = urlObj.hostname.replace(/^www\./i, '') + urlObj.pathname + urlObj.search;
            normalized = normalized.replace(/\/$/, ''); // 移除末尾斜杠
            return normalized.toLowerCase();
        } catch (e) {
            return url.toLowerCase();
        }
    };
    
    // 检测重复
    const urlMap = new Map(); // normalizedUrl -> [link1, link2, ...]
    const duplicates = [];
    
    allLinks.forEach((link, index) => {
        const normalized = normalizeUrl(link.url);
        if (!urlMap.has(normalized)) {
            urlMap.set(normalized, []);
        }
        urlMap.get(normalized).push({ link, index });
    });
    
    // 找出重复的URL
    urlMap.forEach((links, normalized) => {
        if (links.length > 1) {
            duplicates.push({
                normalized,
                links: links
            });
        }
    });
    
    if (duplicates.length === 0) {
        showNotification('未发现重复链接！', 'success');
        return;
    }
    
    // 显示重复链接列表
    showDuplicateLinksModal(duplicates);
}

// 显示重复链接模态框
function showDuplicateLinksModal(duplicates) {
    // 创建模态框
    const modal = document.createElement('div');
    modal.className = 'modal-overlay';
    modal.style.display = 'flex';
    modal.innerHTML = `
        <div class="modal-content modal-large">
            <div class="modal-header">
                <h2>发现 ${duplicates.length} 组重复链接</h2>
                <button class="modal-close" id="closeDuplicateModal">
                    <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                        <line x1="18" y1="6" x2="6" y2="18"></line>
                        <line x1="6" y1="6" x2="18" y2="18"></line>
                    </svg>
                </button>
            </div>
            <div class="modal-body">
                <p style="margin-bottom: 20px; color: var(--text-secondary);">
                    检测到重复的链接，您可以选择合并它们。系统会保留第一个链接的信息，合并其他链接的标签和访问统计。
                </p>
                <div class="duplicates-list" style="max-height: 60vh; overflow-y: auto;">
                    ${duplicates.map((group, groupIndex) => `
                        <div class="duplicate-group" style="margin-bottom: 24px; padding: 16px; background: var(--bg-color); border-radius: 12px; border: 2px solid var(--border-color);">
                            <div style="display: flex; align-items: center; justify-content: space-between; margin-bottom: 12px;">
                                <h3 style="font-size: 1rem; font-weight: 600; color: var(--text-primary);">
                                    重复组 ${groupIndex + 1} (${group.links.length} 个链接)
                                </h3>
                                <button class="action-primary-btn merge-group-btn" data-group-index="${groupIndex}" style="padding: 6px 16px; font-size: 0.9rem;">
                                    合并此组
                                </button>
                            </div>
                            <div class="duplicate-links">
                                ${group.links.map((item, itemIndex) => {
                                    const link = item.link;
                                    const isFirst = itemIndex === 0;
                                    return `
                                        <div class="duplicate-link-item ${isFirst ? 'primary' : ''}" style="display: flex; align-items: center; gap: 12px; padding: 12px; background: ${isFirst ? 'rgba(99, 102, 241, 0.1)' : 'var(--card-bg)'}; border-radius: 8px; margin-bottom: 8px; border: 2px solid ${isFirst ? 'var(--primary-color)' : 'var(--border-color)'};">
                                            <input type="radio" name="keep-${groupIndex}" value="${item.index}" ${isFirst ? 'checked' : ''} style="flex-shrink: 0;">
                                            <div style="width: 32px; height: 32px; border-radius: 6px; overflow: hidden; flex-shrink: 0;">
                                                ${link.icon ? `<img src="${link.icon}" alt="${link.name}" style="width: 100%; height: 100%; object-fit: cover;" onerror="this.style.display='none'; this.nextElementSibling.style.display='flex';">
                                                <div style="display: none; width: 100%; height: 100%; background: linear-gradient(135deg, var(--primary-color), #8b5cf6); color: white; align-items: center; justify-content: center; font-weight: 600;">${link.name.charAt(0).toUpperCase()}</div>` : 
                                                `<div style="width: 100%; height: 100%; background: linear-gradient(135deg, var(--primary-color), #8b5cf6); color: white; display: flex; align-items: center; justify-content: center; font-weight: 600;">${link.name.charAt(0).toUpperCase()}</div>`}
                                            </div>
                                            <div style="flex: 1; min-width: 0;">
                                                <div style="font-weight: 600; color: var(--text-primary); margin-bottom: 4px;">${link.name}</div>
                                                <div style="font-size: 0.85rem; color: var(--text-secondary); word-break: break-all;">${link.url}</div>
                                                <div style="font-size: 0.8rem; color: var(--text-tertiary); margin-top: 4px;">
                                                    ${link.category || '未分类'} | 
                                                    访问 ${link.clicks || link.clickCount || 0} 次 | 
                                                    ${link.tags && link.tags.length > 0 ? `标签: ${link.tags.join(', ')}` : '无标签'}
                                                </div>
                                            </div>
                                            ${isFirst ? '<span style="background: var(--primary-color); color: white; padding: 4px 8px; border-radius: 4px; font-size: 0.75rem; font-weight: 600;">保留</span>' : ''}
                                        </div>
                                    `;
                                }).join('')}
                            </div>
                        </div>
                    `).join('')}
                </div>
                <div style="margin-top: 20px; padding-top: 20px; border-top: 1px solid var(--border-color); display: flex; gap: 12px; justify-content: flex-end;">
                    <button class="btn-cancel" id="cancelDuplicateBtn">取消</button>
                    <button class="btn-submit" id="mergeAllDuplicatesBtn">合并所有重复链接</button>
                </div>
            </div>
        </div>
    `;
    
    document.body.appendChild(modal);
    
    // 关闭按钮
    const closeBtn = modal.querySelector('#closeDuplicateModal');
    const cancelBtn = modal.querySelector('#cancelDuplicateBtn');
    const closeModal = () => {
        document.body.removeChild(modal);
    };
    
    closeBtn.addEventListener('click', closeModal);
    cancelBtn.addEventListener('click', closeModal);
    modal.addEventListener('click', (e) => {
        if (e.target === modal) {
            closeModal();
        }
    });
    
    // 合并单个组
    modal.querySelectorAll('.merge-group-btn').forEach(btn => {
        btn.addEventListener('click', () => {
            const groupIndex = parseInt(btn.dataset.groupIndex);
            const group = duplicates[groupIndex];
            const keepRadio = modal.querySelector(`input[name="keep-${groupIndex}"]:checked`);
            const keepIndex = parseInt(keepRadio.value);
            
            mergeDuplicateGroup(group, keepIndex);
            closeModal();
            showNotification('重复链接已合并', 'success');
        });
    });
    
    // 合并所有
    const mergeAllBtn = modal.querySelector('#mergeAllDuplicatesBtn');
    mergeAllBtn.addEventListener('click', () => {
        if (!confirm(`确定要合并所有 ${duplicates.length} 组重复链接吗？`)) {
            return;
        }
        
        duplicates.forEach((group, groupIndex) => {
            const keepRadio = modal.querySelector(`input[name="keep-${groupIndex}"]:checked`);
            if (keepRadio) {
                const keepIndex = parseInt(keepRadio.value);
                mergeDuplicateGroup(group, keepIndex);
            }
        });
        
        closeModal();
        showNotification(`已合并所有重复链接`, 'success');
    });
}

// 合并重复链接组
function mergeDuplicateGroup(group, keepIndex) {
    const keepItem = group.links.find(item => item.index === keepIndex);
    if (!keepItem) return;
    
    const keepLink = keepItem.link;
    const linksToRemove = group.links.filter(item => item.index !== keepIndex);
    
    // 合并标签
    const allTags = new Set(keepLink.tags || []);
    linksToRemove.forEach(item => {
        if (item.link.tags) {
            item.link.tags.forEach(tag => allTags.add(tag));
        }
    });
    if (allTags.size > 0) {
        keepLink.tags = Array.from(allTags);
    }
    
    // 合并访问统计
    let totalClicks = keepLink.clicks || keepLink.clickCount || 0;
    let latestAccess = keepLink.lastAccess || keepLink.lastAccessTime || 0;
    
    linksToRemove.forEach(item => {
        const link = item.link;
        totalClicks += (link.clicks || link.clickCount || 0);
        const access = link.lastAccess || link.lastAccessTime || 0;
        if (access > latestAccess) {
            latestAccess = access;
        }
    });
    
    keepLink.clicks = totalClicks;
    keepLink.lastAccess = latestAccess;
    
    // 删除重复的链接（从后往前删除，避免索引变化）
    const indicesToRemove = linksToRemove.map(item => item.index).sort((a, b) => b - a);
    indicesToRemove.forEach(index => {
        allLinks.splice(index, 1);
    });
    
    // 保存
    saveLinksOrder();
    updateAllTags();
    updateTagFilters();
    initializeCategories();
    filterLinks(document.getElementById('searchInput').value);
}

// 导出数据功能（可选，用于备份）- 保持向后兼容
function exportLinks() {
    exportAllData();
}

// 导入所有数据（支持JSON和Excel）
function importAllData(file) {
    const fileName = file.name.toLowerCase();
    const isExcel = fileName.endsWith('.xlsx') || fileName.endsWith('.xls');
    
    if (isExcel) {
        importFromExcel(file);
    } else {
        importFromJSON(file);
    }
}

// 从JSON文件导入
function importFromJSON(file) {
    const reader = new FileReader();
    reader.onload = (e) => {
        try {
            const imported = JSON.parse(e.target.result);
            
            // 支持新格式（包含版本信息）
            if (imported.version && imported.links) {
                allLinks = imported.links;
                if (imported.customCategories) {
                    customCategories = imported.customCategories;
                    saveCustomCategories();
                }
                showNotification('数据导入成功！', 'success');
            }
            // 支持旧格式（纯数组）
            else if (Array.isArray(imported)) {
                allLinks = imported;
                showNotification('链接导入成功！', 'success');
            }
            else {
                throw new Error('不支持的文件格式');
            }
            
            // 保存到本地存储
            saveLinksOrder();
            
            // 更新UI
            initializeCategories();
            renderLinks();
            updateDataInfo();
            
        } catch (error) {
            console.error('导入失败:', error);
            showNotification('导入失败：文件格式错误 - ' + error.message, 'error');
        }
    };
        reader.readAsText(file);
}

// 从文本文件导入（追加模式）
function importFromText(file) {
    const reader = new FileReader();
    reader.onload = (e) => {
        importFromTextString(e.target.result);
    };
    reader.readAsText(file);
}

// 从文本字符串导入链接（追加模式）
function importFromTextString(text) {
    if (!text || !text.trim()) {
        showNotification('文本内容为空', 'error');
        return;
    }
    
    const lines = text.split(/\r?\n/).map(line => line.trim()).filter(line => line);
    const importedLinks = [];
    let skippedCount = 0;
    
    lines.forEach((line, index) => {
        // 尝试解析不同格式
        let url = null;
        let name = null;
        
        // 格式1: 纯URL
        try {
            new URL(line);
            url = line;
        } catch (e) {
            // 格式2: Markdown链接 [name](url)
            const mdMatch = line.match(/\[([^\]]+)\]\(([^)]+)\)/);
            if (mdMatch) {
                name = mdMatch[1];
                url = mdMatch[2];
            }
            // 格式3: CSV格式 name,url 或 url,name
            else if (line.includes(',')) {
                const parts = line.split(',').map(p => p.trim());
                if (parts.length >= 2) {
                    // 尝试判断哪个是URL
                    try {
                        new URL(parts[0]);
                        url = parts[0];
                        name = parts[1] || getDomain(url);
                    } catch (e1) {
                        try {
                            new URL(parts[1]);
                            url = parts[1];
                            name = parts[0] || getDomain(url);
                        } catch (e2) {
                            // 都不是URL，跳过
                        }
                    }
                }
            }
            // 格式4: 带协议的URL（可能没有https://）
            else if (line.match(/^[a-zA-Z][a-zA-Z\d+\-.]*:/)) {
                url = line;
            }
            // 格式5: 域名（尝试添加https://）
            else if (line.match(/^[a-zA-Z0-9][a-zA-Z0-9-]{0,61}[a-zA-Z0-9]?\.([a-zA-Z]{2,})/)) {
                url = 'https://' + line;
            }
        }
        
        if (url) {
            try {
                // 验证URL
                new URL(url);
                
                // 检查是否已存在
                const existingLink = allLinks.find(link => link.url === url);
                if (existingLink) {
                    skippedCount++;
                    return;
                }
                
                // 如果没有名称，使用域名
                if (!name) {
                    name = getDomain(url);
                }
                
                // 创建链接对象
                const newLink = {
                    name: name,
                    url: url,
                    icon: getFaviconUrl(url),
                    category: '未分类',
                    addTime: Date.now()
                };
                
                importedLinks.push(newLink);
            } catch (e) {
                skippedCount++;
            }
        } else {
            skippedCount++;
        }
    });
    
    if (importedLinks.length === 0) {
        showNotification(`未找到有效的链接（跳过了 ${skippedCount} 行）`, 'info');
        return;
    }
    
    // 添加到链接列表
    allLinks.push(...importedLinks);
    
    // 保存到本地存储
    saveLinksOrder();
    
    // 更新UI
    initializeCategories();
    updateAllTags();
    updateTagFilters();
    filterLinks(document.getElementById('searchInput').value);
    
    showNotification(`成功导入 ${importedLinks.length} 个链接${skippedCount > 0 ? `，跳过了 ${skippedCount} 行` : ''}`, 'success');
}

// 从Excel文件导入
function importFromExcel(file) {
    try {
        // 检查SheetJS库是否加载
        if (typeof XLSX === 'undefined') {
            showNotification('Excel导入功能需要加载SheetJS库，请刷新页面重试', 'error');
            return;
        }
        
        const reader = new FileReader();
        reader.onload = (e) => {
            try {
                const data = new Uint8Array(e.target.result);
                const workbook = XLSX.read(data, { type: 'array' });
                
                // 读取链接列表工作表
                let linksSheet = workbook.Sheets['链接列表'];
                if (!linksSheet) {
                    // 如果没有找到"链接列表"，使用第一个工作表
                    const firstSheetName = workbook.SheetNames[0];
                    linksSheet = workbook.Sheets[firstSheetName];
                }
                
                if (!linksSheet) {
                    throw new Error('Excel文件中没有找到数据表');
                }
                
                // 转换为JSON
                const linksData = XLSX.utils.sheet_to_json(linksSheet);
                
                // 转换为链接对象格式
                allLinks = linksData.map(row => ({
                    name: row['名称'] || row['name'] || '',
                    url: row['网址'] || row['url'] || '',
                    icon: row['图标URL'] || row['icon'] || row['图标'] || undefined,
                    note: row['备注'] || row['note'] || row['description'] || undefined,
                    category: row['分类'] || row['category'] || '未分类'
                })).filter(link => link.name && link.url); // 过滤掉无效数据
                
                // 读取自定义分类工作表（如果存在）
                const categoriesSheet = workbook.Sheets['自定义分类'];
                if (categoriesSheet) {
                    const categoriesData = XLSX.utils.sheet_to_json(categoriesSheet);
                    customCategories = categoriesData.map(row => 
                        row['分类名称'] || row['category'] || row['name']
                    ).filter(cat => cat);
                    saveCustomCategories();
                }
                
                if (allLinks.length === 0) {
                    throw new Error('Excel文件中没有有效的链接数据');
                }
                
                // 保存到本地存储
                saveLinksOrder();
                
                // 更新UI
                initializeCategories();
                renderLinks();
                updateDataInfo();
                
                showNotification(`成功导入 ${allLinks.length} 个链接！`, 'success');
                
            } catch (error) {
                console.error('Excel导入失败:', error);
                showNotification('Excel导入失败：' + error.message, 'error');
            }
        };
        reader.readAsArrayBuffer(file);
    } catch (error) {
        console.error('读取Excel文件失败:', error);
        showNotification('读取Excel文件失败：' + error.message, 'error');
    }
}

// 导入数据功能（可选，用于恢复）- 保持向后兼容
function importLinks(file) {
    importAllData(file);
}

// 设置拖拽功能
function setupDragAndDrop() {
    const linksGrid = document.getElementById('linksGrid');
    const cards = linksGrid.querySelectorAll('.link-card');
    
    cards.forEach((card, index) => {
        card.addEventListener('dragstart', handleDragStart);
        card.addEventListener('dragend', handleDragEnd);
        card.addEventListener('dragover', handleDragOver);
        card.addEventListener('dragenter', handleDragEnter);
        card.addEventListener('dragleave', handleDragLeave);
        card.addEventListener('drop', handleDrop);
    });
}

// 拖拽开始
function handleDragStart(e) {
    draggedElement = this;
    draggedIndex = parseInt(this.dataset.index);
    this.classList.add('dragging');
    e.dataTransfer.effectAllowed = 'move';
    e.dataTransfer.setData('text/html', this.innerHTML);
    
    // 设置拖拽图像（使用半透明的卡片）
    const dragImage = this.cloneNode(true);
    dragImage.style.position = 'absolute';
    dragImage.style.top = '-9999px';
    dragImage.style.opacity = '0.6';
    dragImage.style.transform = 'rotate(3deg)';
    dragImage.style.pointerEvents = 'none';
    dragImage.style.zIndex = '10000';
    document.body.appendChild(dragImage);
    
    const rect = this.getBoundingClientRect();
    e.dataTransfer.setDragImage(dragImage, rect.width / 2, rect.height / 2);
    
    // 延迟移除，确保拖拽图像已设置
    setTimeout(() => {
        if (document.body.contains(dragImage)) {
            document.body.removeChild(dragImage);
        }
    }, 0);
}

// 拖拽结束
function handleDragEnd(e) {
    this.classList.remove('dragging');
    
    // 移除所有拖拽相关的样式
    document.querySelectorAll('.link-card').forEach(card => {
        card.classList.remove('drag-over');
    });
    
    draggedElement = null;
    draggedIndex = null;
}

// 拖拽悬停
function handleDragOver(e) {
    if (e.preventDefault) {
        e.preventDefault();
    }
    e.dataTransfer.dropEffect = 'move';
    return false;
}

// 拖拽进入
function handleDragEnter(e) {
    e.preventDefault();
    if (this !== draggedElement && !this.classList.contains('drag-over')) {
        this.classList.add('drag-over');
    }
}

// 拖拽离开
function handleDragLeave(e) {
    // 检查是否真的离开了元素（而不是进入子元素）
    const rect = this.getBoundingClientRect();
    const x = e.clientX;
    const y = e.clientY;
    
    if (x < rect.left || x > rect.right || y < rect.top || y > rect.bottom) {
        this.classList.remove('drag-over');
    }
}

// 放置
function handleDrop(e) {
    if (e.stopPropagation) {
        e.stopPropagation();
    }
    
    if (draggedElement !== this) {
        const dropIndex = parseInt(this.dataset.index);
        
        // 重新排列 filteredLinks
        const draggedLink = filteredLinks[draggedIndex];
        filteredLinks.splice(draggedIndex, 1);
        filteredLinks.splice(dropIndex, 0, draggedLink);
        
        // 如果当前是自定义排序，同步更新 allLinks
        // 如果当前显示的是全部链接且没有搜索，直接同步
        const searchInput = document.getElementById('searchInput');
        const isFullView = currentCategory === '全部' && (!searchInput || searchInput.value.trim() === '');
        
        if (isFullView && sortBy === 'custom') {
            allLinks = [...filteredLinks];
        } else if (sortBy === 'custom') {
            // 在筛选状态下，更新 allLinks 中这两个链接的相对位置
            const draggedUrl = draggedLink.url;
            const dropUrl = filteredLinks[dropIndex].url;
            
            const draggedIndexInAll = allLinks.findIndex(link => link.url === draggedUrl);
            const dropIndexInAll = allLinks.findIndex(link => link.url === dropUrl);
            
            if (draggedIndexInAll !== -1 && dropIndexInAll !== -1 && draggedIndexInAll !== dropIndexInAll) {
                const linkToMove = allLinks[draggedIndexInAll];
                allLinks.splice(draggedIndexInAll, 1);
                
                // 计算新的插入位置
                // 删除元素后，如果目标位置在被删除元素之后，索引需要减1
                let insertIndex = dropIndexInAll;
                if (draggedIndexInAll < dropIndexInAll) {
                    insertIndex = dropIndexInAll - 1;
                }
                // 插入到目标位置之后
                allLinks.splice(insertIndex + 1, 0, linkToMove);
            }
        }
        
        // 保存顺序
        saveLinksOrder();
        
        // 重新渲染
        renderLinks();
    }
    
    this.classList.remove('drag-over');
    return false;
}

// 保存链接顺序到本地存储
function saveLinksOrder() {
    try {
        if (!allLinks || allLinks.length === 0) {
            console.warn('allLinks 为空，跳过保存');
            return;
        }
        
        // 保存 URL 的顺序数组
        const order = allLinks.map(link => link.url);
        localStorage.setItem(getUserStorageKey('linksOrder'), JSON.stringify(order));
        
        // 同时保存完整数据（包含可能的自定义修改）
        localStorage.setItem(getUserStorageKey('linksData'), JSON.stringify(allLinks));
    } catch (e) {
        console.error('保存链接顺序失败:', e);
    }
}

// 从本地存储或后端加载链接顺序
async function loadLinksOrder() {
    if (useBackendAPI && api && currentUserId) {
        try {
            const links = await api.getLinks(currentUserId);
            allLinks = links.map(link => ({
                name: link.name,
                url: link.url,
                icon: link.icon,
                note: link.note,
                category: link.category || '未分类',
                tags: link.tags || [],
                private: link.is_private,
                clicks: link.clicks || 0,
                lastAccess: link.last_access ? new Date(link.last_access).getTime() : null,
                addTime: link.add_time ? new Date(link.add_time).getTime() : Date.now(),
                id: link.id // 保存后端返回的 ID
            }));
            
            // 尝试从 localStorage 加载保存的顺序
            try {
                const savedOrder = localStorage.getItem(getUserStorageKey('linksOrder'));
                if (savedOrder) {
                    const parsedOrder = JSON.parse(savedOrder);
                    if (Array.isArray(parsedOrder) && parsedOrder.length > 0) {
                        // 按照保存的顺序重新排列
                        const orderedLinks = [];
                        const linkMap = new Map(allLinks.map(link => [link.url, link]));
                        
                        // 先按保存的顺序添加链接
                        parsedOrder.forEach(url => {
                            if (linkMap.has(url)) {
                                orderedLinks.push(linkMap.get(url));
                            }
                        });
                        
                        // 添加新链接（后端有但顺序中没有的）
                        allLinks.forEach(link => {
                            if (!parsedOrder.includes(link.url)) {
                                orderedLinks.push(link);
                            }
                        });
                        
                        allLinks = orderedLinks;
                    }
                }
            } catch (orderError) {
                console.warn('加载保存的顺序失败，使用后端顺序:', orderError);
            }
            
            // 保存当前顺序到 localStorage（确保同步）
            saveLinksOrder();
            
            filteredLinks = [...allLinks];
            return;
        } catch (error) {
            console.error('从后端加载链接失败，切换到 localStorage:', error);
            useBackendAPI = false;
        }
    }
    
    // 使用 localStorage（原有逻辑）
    try {
        const savedData = localStorage.getItem(getUserStorageKey('linksData'));
        const savedOrder = localStorage.getItem(getUserStorageKey('linksOrder'));
        
        // 检查是否已经保存过数据（包括空数组）
        const hasSavedData = savedData !== null;
        
        if (hasSavedData) {
            // 如果有保存的数据（包括空数组），使用保存的数据
            if (savedData && savedOrder) {
                const parsedData = JSON.parse(savedData);
                const parsedOrder = JSON.parse(savedOrder);
                
                // 检查数据是否有效
                if (Array.isArray(parsedData) && Array.isArray(parsedOrder)) {
                    if (parsedData.length > 0) {
                        // 按照保存的顺序重新排列
                        const orderedLinks = [];
                        const dataMap = new Map(parsedData.map(link => [link.url, link]));
                        
                        parsedOrder.forEach(url => {
                            if (dataMap.has(url)) {
                                orderedLinks.push(dataMap.get(url));
                            }
                        });
                        
                        // 添加新链接（如果有）
                        parsedData.forEach(link => {
                            if (!parsedOrder.includes(link.url)) {
                                orderedLinks.push(link);
                            }
                        });
                        
                        allLinks = orderedLinks;
                    } else {
                        // 空数组，表示用户清空了数据
                        allLinks = [];
                    }
                } else {
                    // 如果保存的数据无效，使用空数组
                    console.warn('保存的数据无效，使用空数组');
                    allLinks = [];
                }
            } else if (savedData) {
                // 只有数据没有顺序
                const parsedData = JSON.parse(savedData);
                if (Array.isArray(parsedData)) {
                    allLinks = parsedData;
                } else {
                    allLinks = [];
                }
            } else {
                // 只有顺序没有数据
                allLinks = [];
            }
        } else {
            // 如果没有保存的数据，使用空数组（数据应该从数据库加载）
            allLinks = [];
        }
        
        filteredLinks = [...allLinks];
    } catch (e) {
        console.error('加载链接顺序失败:', e);
        allLinks = [];
        filteredLinks = [];
    }
}

// 重置链接顺序（清除本地存储）
function resetLinksOrder() {
    localStorage.removeItem(getUserStorageKey('linksOrder'));
    localStorage.removeItem(getUserStorageKey('linksData'));
    // 重新从数据库或 localStorage 加载
    loadLinksOrder().then(() => {
        renderLinks();
    });
}

// 设置模态框
function setupModal() {
    const addBtn = document.getElementById('addLinkBtn');
    const manageCategoriesBtn = document.getElementById('manageCategoriesBtn');
    const linkModal = document.getElementById('linkModal');
    const deleteModal = document.getElementById('deleteModal');
    const categoryManageModal = document.getElementById('categoryManageModal');
    const renameCategoryModal = document.getElementById('renameCategoryModal');
    const deleteCategoryModal = document.getElementById('deleteCategoryModal');
    const closeModal = document.getElementById('closeModal');
    const closeDeleteModal = document.getElementById('closeDeleteModal');
    const closeCategoryModal = document.getElementById('closeCategoryModal');
    const closeRenameCategoryModal = document.getElementById('closeRenameCategoryModal');
    const closeDeleteCategoryModal = document.getElementById('closeDeleteCategoryModal');
    const cancelBtn = document.getElementById('cancelBtn');
    const cancelDeleteBtn = document.getElementById('cancelDeleteBtn');
    const cancelRenameBtn = document.getElementById('cancelRenameBtn');
    const cancelDeleteCategoryBtn = document.getElementById('cancelDeleteCategoryBtn');
    const linkForm = document.getElementById('linkForm');
    const renameCategoryForm = document.getElementById('renameCategoryForm');
    const confirmDeleteBtn = document.getElementById('confirmDeleteBtn');
    const confirmDeleteCategoryBtn = document.getElementById('confirmDeleteCategoryBtn');
    
    // 打开添加模态框
    addBtn.addEventListener('click', () => {
        openAddModal();
    });
    
    // 打开分类管理模态框
    manageCategoriesBtn.addEventListener('click', () => {
        openCategoryManageModal();
    });
    
    // 打开数据管理模态框
    const manageDataBtn = document.getElementById('manageDataBtn');
    if (manageDataBtn) {
        manageDataBtn.addEventListener('click', () => {
            openDataManageModal();
        });
    }
    
    // 添加分类按钮
    const addCategoryBtn = document.getElementById('addCategoryBtn');
    if (addCategoryBtn) {
        addCategoryBtn.addEventListener('click', () => {
            openAddCategoryModal();
        });
    }
    
    // 数据管理相关按钮
    const exportJsonBtn = document.getElementById('exportJsonBtn');
    const exportExcelBtn = document.getElementById('exportExcelBtn');
    const importFileInput = document.getElementById('importFileInput');
    const resetDataBtn = document.getElementById('resetDataBtn');
    const clearDataBtn = document.getElementById('clearDataBtn');
    const closeDataModal = document.getElementById('closeDataModal');
    
    if (exportJsonBtn) {
        exportJsonBtn.addEventListener('click', exportAllData);
    }
    
    if (exportExcelBtn) {
        exportExcelBtn.addEventListener('click', exportToExcel);
    }
    
    // 检测所有链接按钮
    // 检测重复链接按钮
    const checkDuplicatesBtn = document.getElementById('checkDuplicatesBtn');
    if (checkDuplicatesBtn) {
        checkDuplicatesBtn.addEventListener('click', () => {
            checkDuplicateLinks();
        });
    }
    
    if (importFileInput) {
        importFileInput.addEventListener('change', (e) => {
            if (e.target.files.length > 0) {
                const file = e.target.files[0];
                const fileName = file.name.toLowerCase();
                
                // 根据文件扩展名选择导入方式
                if (fileName.endsWith('.json')) {
                    if (confirm('导入数据将覆盖当前所有数据，确定要继续吗？')) {
                        importAllData(file);
                    }
                } else if (fileName.endsWith('.xlsx') || fileName.endsWith('.xls')) {
                    if (confirm('导入数据将覆盖当前所有数据，确定要继续吗？')) {
                        importAllData(file);
                    }
                } else if (fileName.endsWith('.txt') || fileName.endsWith('.csv') || fileName.endsWith('.md')) {
                    // 文本格式导入，追加而不是覆盖
                    importFromText(file);
                } else {
                    alert('不支持的文件格式');
                }
                
                e.target.value = ''; // 重置文件输入
            }
        });
    }
    
    // 文本导入按钮
    const importTextBtn = document.getElementById('importTextBtn');
    if (importTextBtn) {
        importTextBtn.addEventListener('click', () => {
            const text = prompt('请输入链接列表（每行一个URL，或使用逗号分隔）：');
            if (text && text.trim()) {
                importFromTextString(text);
            }
        });
    }
    
    if (resetDataBtn) {
        resetDataBtn.addEventListener('click', () => {
            if (confirm('确定要重置为默认数据吗？当前所有数据将被清除！')) {
                resetToDefaultData();
                closeDataManageModal();
            }
        });
    }
    
    if (clearDataBtn) {
        clearDataBtn.addEventListener('click', () => {
            if (confirm('确定要清空所有数据吗？此操作无法撤销！')) {
                clearAllData();
                closeDataManageModal();
            }
        });
    }
    
    if (closeDataModal) {
        closeDataModal.addEventListener('click', closeDataManageModal);
    }
    
    // 保存页面标题按钮
    const savePageTitleBtn = document.getElementById('savePageTitleBtn');
    if (savePageTitleBtn) {
        savePageTitleBtn.addEventListener('click', async () => {
            const pageTitleInput = document.getElementById('pageTitleInput');
            if (pageTitleInput) {
                const newTitle = pageTitleInput.value.trim();
                if (newTitle) {
                    await savePageTitle(newTitle);
                    showNotification('页面标题已更新', 'success');
                } else {
                    showNotification('页面标题不能为空', 'error');
                }
            }
        });
    }
    
    // 点击背景关闭
    const dataManageModal = document.getElementById('dataManageModal');
    if (dataManageModal) {
        dataManageModal.addEventListener('click', (e) => {
            if (e.target === dataManageModal) {
                closeDataManageModal();
            }
        });
    }
    
    // 关闭模态框
    closeModal.addEventListener('click', closeLinkModal);
    closeDeleteModal.addEventListener('click', closeDeleteModalFunc);
    closeCategoryModal.addEventListener('click', closeCategoryManageModal);
    closeRenameCategoryModal.addEventListener('click', closeRenameCategoryModalFunc);
    closeDeleteCategoryModal.addEventListener('click', closeDeleteCategoryModalFunc);
    cancelBtn.addEventListener('click', closeLinkModal);
    cancelDeleteBtn.addEventListener('click', closeDeleteModalFunc);
    cancelRenameBtn.addEventListener('click', closeRenameCategoryModalFunc);
    cancelDeleteCategoryBtn.addEventListener('click', closeDeleteCategoryModalFunc);
    
    // 点击背景关闭
    linkModal.addEventListener('click', (e) => {
        if (e.target === linkModal) {
            closeLinkModal();
        }
    });
    
    deleteModal.addEventListener('click', (e) => {
        if (e.target === deleteModal) {
            closeDeleteModalFunc();
        }
    });
    
    categoryManageModal.addEventListener('click', (e) => {
        if (e.target === categoryManageModal) {
            closeCategoryManageModal();
        }
    });
    
    renameCategoryModal.addEventListener('click', (e) => {
        if (e.target === renameCategoryModal) {
            closeRenameCategoryModalFunc();
        }
    });
    
    deleteCategoryModal.addEventListener('click', (e) => {
        if (e.target === deleteCategoryModal) {
            closeDeleteCategoryModalFunc();
        }
    });
    
    // 批量设置分享模态框相关
    const batchShareModal = document.getElementById('batchShareModal');
    const closeBatchShareModal = document.getElementById('closeBatchShareModal');
    const cancelBatchShareBtn = document.getElementById('cancelBatchShareBtn');
    const batchShareForm = document.getElementById('batchShareForm');
    
    if (closeBatchShareModal) {
        closeBatchShareModal.addEventListener('click', closeBatchShareModalFunc);
    }
    
    if (cancelBatchShareBtn) {
        cancelBatchShareBtn.addEventListener('click', closeBatchShareModalFunc);
    }
    
    if (batchShareModal) {
        batchShareModal.addEventListener('click', (e) => {
            if (e.target === batchShareModal) {
                closeBatchShareModalFunc();
            }
        });
    }
    
    if (batchShareForm) {
        batchShareForm.addEventListener('submit', (e) => {
            e.preventDefault();
            batchSetShare();
        });
    }
    
    // 表单提交
    // URL输入框失去焦点时自动获取图标和名称
    const linkUrlInput = document.getElementById('linkUrl');
    if (linkUrlInput) {
        linkUrlInput.addEventListener('blur', () => {
            autoFillLinkInfo();
        });
    }
    
    linkForm.addEventListener('submit', (e) => {
        e.preventDefault();
        saveLink();
    });
    
    renameCategoryForm.addEventListener('submit', (e) => {
        e.preventDefault();
        saveRenameCategory();
    });
    
    // 确认删除
    confirmDeleteBtn.addEventListener('click', () => {
        const index = parseInt(confirmDeleteBtn.dataset.deleteIndex);
        deleteLink(index);
        closeDeleteModalFunc();
    });
    
    confirmDeleteCategoryBtn.addEventListener('click', () => {
        const categoryName = confirmDeleteCategoryBtn.dataset.categoryName;
        const mergeTo = document.getElementById('mergeToCategory').value;
        deleteCategory(categoryName, mergeTo);
        closeDeleteCategoryModalFunc();
        closeCategoryManageModal();
    });
    
    // 更新分类列表
    updateCategoryList();
}

// 打开添加模态框
function openAddModal() {
    editingLinkIndex = null;
    document.getElementById('modalTitle').textContent = '添加链接';
    document.getElementById('linkForm').reset();
    document.getElementById('linkModal').style.display = 'flex';
    document.getElementById('linkName').focus();
}

// 打开编辑模态框
function openEditModal(index) {
    editingLinkIndex = index;
    const link = allLinks[index];
    
    document.getElementById('modalTitle').textContent = '编辑链接';
    document.getElementById('linkName').value = link.name || '';
    document.getElementById('linkUrl').value = link.url || '';
    document.getElementById('linkIcon').value = link.icon || '';
    document.getElementById('linkNote').value = link.note || '';
    document.getElementById('linkCategory').value = link.category || '';
    document.getElementById('linkTags').value = (link.tags && Array.isArray(link.tags)) ? link.tags.join(', ') : '';
    
    document.getElementById('linkModal').style.display = 'flex';
    document.getElementById('linkName').focus();
}

// 打开删除确认模态框
function openDeleteModal(index, linkName) {
    document.getElementById('deleteLinkName').textContent = linkName;
    const confirmDeleteBtn = document.getElementById('confirmDeleteBtn');
    confirmDeleteBtn.dataset.deleteIndex = index;
    document.getElementById('deleteModal').style.display = 'flex';
}

// 关闭链接模态框
function closeLinkModal() {
    document.getElementById('linkModal').style.display = 'none';
    editingLinkIndex = null;
}

// 关闭删除模态框
function closeDeleteModalFunc() {
    document.getElementById('deleteModal').style.display = 'none';
}

// 保存链接
async function saveLink() {
    const name = document.getElementById('linkName').value.trim();
    const url = document.getElementById('linkUrl').value.trim();
    let icon = document.getElementById('linkIcon').value.trim();
    const note = document.getElementById('linkNote').value.trim();
    const category = document.getElementById('linkCategory').value.trim() || '未分类';
    const tagsInput = document.getElementById('linkTags').value.trim();
    const isPrivate = !document.getElementById('linkPrivate').checked; // 不共享为true
    
    if (!name || !url) {
        alert('请填写名称和网址');
        return;
    }
    
    // 验证URL格式
    try {
        new URL(url);
    } catch (e) {
        alert('请输入有效的网址（需要包含 http:// 或 https://）');
        return;
    }
    
    // 如果图标为空，自动获取
    if (!icon) {
        icon = getFaviconUrl(url);
    }
    
    // 解析标签（支持逗号和空格分隔）
    const tags = tagsInput ? tagsInput.split(/[,\s]+/).map(t => t.trim()).filter(t => t) : [];
    
    const linkData = {
        name,
        url,
        icon: icon || undefined,
        note: note || undefined,
        category,
        tags: tags.length > 0 ? tags : undefined,
        is_private: isPrivate || undefined
    };
    
    if (useBackendAPI && api && currentUserId) {
        try {
            if (editingLinkIndex !== null && allLinks[editingLinkIndex].id) {
                // 编辑模式
                await api.updateLink(currentUserId, allLinks[editingLinkIndex].id, linkData);
                showNotification('链接已更新', 'success');
            } else {
                // 添加模式
                const createdLink = await api.createLink(currentUserId, linkData);
                showNotification('链接已添加', 'success');
            }
            // 重新加载链接列表
            await loadLinksOrder();
            // 更新标签
            updateAllTags();
            updateTagFilters();
            // 更新分类
            initializeCategories();
            // 重新渲染
            filterLinks(document.getElementById('searchInput').value);
            // 关闭模态框
            closeLinkModal();
            return;
        } catch (error) {
            console.error('保存链接失败:', error);
            const errorMsg = error.message || error.toString() || '未知错误';
            console.error('错误详情:', errorMsg);
            showNotification('保存失败: ' + errorMsg, 'error');
            // 不要立即回退，让用户知道是API错误
            // 如果连续失败，可以考虑回退
        }
    }
    
    // 使用 localStorage（原有逻辑）
    const localLinkData = {
        ...linkData,
        private: linkData.is_private,
        clicks: editingLinkIndex !== null ? (allLinks[editingLinkIndex].clicks || 0) : 0,
        lastAccess: editingLinkIndex !== null ? (allLinks[editingLinkIndex].lastAccess || null) : null,
        addTime: editingLinkIndex !== null ? (allLinks[editingLinkIndex].addTime || Date.now()) : Date.now()
    };
    
    if (editingLinkIndex !== null) {
        // 编辑模式
        allLinks[editingLinkIndex] = localLinkData;
    } else {
        // 添加模式
        allLinks.push(localLinkData);
    }
    
    // 保存到本地存储
    saveLinksOrder();
    
    // 更新标签
    updateAllTags();
    updateTagFilters();
    
    // 更新分类
    initializeCategories();
    
    // 重新渲染
    filterLinks(document.getElementById('searchInput').value);
    
    // 关闭模态框
    closeLinkModal();
}

// 删除链接
async function deleteLink(index) {
    if (index < 0 || index >= allLinks.length) return;
    
    const link = allLinks[index];
    
    if (useBackendAPI && api && currentUserId && link.id) {
        try {
            await api.deleteLink(currentUserId, link.id);
            showNotification('链接已删除', 'success');
            // 重新加载链接列表
            await loadLinksOrder();
            initializeCategories();
            filterLinks(document.getElementById('searchInput').value);
            return;
        } catch (error) {
            console.error('删除链接失败:', error);
            showNotification('删除失败: ' + (error.message || '未知错误'), 'error');
            useBackendAPI = false;
        }
    }
    
    // 使用 localStorage（原有逻辑）
    allLinks.splice(index, 1);
    saveLinksOrder();
    initializeCategories();
    filterLinks(document.getElementById('searchInput').value);
}

// 更新分类列表（用于输入提示）
function updateCategoryList() {
    const categoryDatalist = document.getElementById('categoryDatalist');
    if (categoryDatalist) {
        // 合并链接中的分类和自定义分类
        const linkCategories = new Set(allLinks.map(link => link.category));
        const allCategories = [...new Set([...linkCategories, ...customCategories])];
        categoryDatalist.innerHTML = allCategories.map(cat => `<option value="${cat}">`).join('');
    }
}

// 打开分类管理模态框
function openCategoryManageModal() {
    renderCategoryList();
    document.getElementById('categoryManageModal').style.display = 'flex';
}

// 关闭分类管理模态框
function closeCategoryManageModal() {
    document.getElementById('categoryManageModal').style.display = 'none';
}

// 渲染分类列表
function renderCategoryList() {
    const categoryListContainer = document.getElementById('categoryManageList');
    
    if (!categoryListContainer) {
        console.error('找不到分类列表容器');
        return;
    }
    
    // 统计每个分类的链接数量
    const categoryStats = {};
    allLinks.forEach(link => {
        const category = link.category || '未分类';
        categoryStats[category] = (categoryStats[category] || 0) + 1;
    });
    
    // 合并自定义分类（即使没有链接使用）
    customCategories.forEach(category => {
        if (!categoryStats[category]) {
            categoryStats[category] = 0;
        }
    });
    
    // 按链接数量排序
    const sortedCategories = Object.entries(categoryStats)
        .sort((a, b) => b[1] - a[1]);
    
    if (sortedCategories.length === 0) {
        categoryListContainer.innerHTML = '<p style="text-align: center; color: var(--text-secondary); padding: 40px;">暂无分类</p>';
        return;
    }
    
    categoryListContainer.innerHTML = sortedCategories.map(([category, count]) => `
        <div class="category-item">
            <div class="category-info">
                <div class="category-name">${category}</div>
                <div class="category-count">${count} 个链接</div>
            </div>
            <div class="category-actions">
                <button class="category-action-btn rename-btn" data-category="${category}">重命名</button>
                <button class="category-action-btn delete-btn" data-category="${category}" data-count="${count}">删除</button>
            </div>
        </div>
    `).join('');
    
    // 绑定按钮事件
    categoryListContainer.querySelectorAll('.rename-btn').forEach(btn => {
        btn.addEventListener('click', () => {
            const category = btn.dataset.category;
            openRenameCategoryModal(category);
        });
    });
    
    categoryListContainer.querySelectorAll('.delete-btn').forEach(btn => {
        btn.addEventListener('click', () => {
            const category = btn.dataset.category;
            const count = parseInt(btn.dataset.count);
            openDeleteCategoryModal(category, count);
        });
    });
}

// 打开添加分类模态框
function openAddCategoryModal() {
    document.getElementById('categoryModalTitle').textContent = '添加分类';
    document.getElementById('newCategoryName').value = '';
    document.getElementById('renameCategoryForm').dataset.oldCategory = '';
    
    // 更新父分类选择器
    updateCategoryParentSelect();
    document.getElementById('categoryParent').value = '';
    document.getElementById('categoryParent').style.display = 'block';
    document.getElementById('categoryParent').previousElementSibling.style.display = 'block';
    document.getElementById('categoryParent').nextElementSibling.style.display = 'block';
    
    document.getElementById('renameCategoryModal').style.display = 'flex';
    document.getElementById('newCategoryName').focus();
}

// 打开重命名分类模态框
function openRenameCategoryModal(categoryName) {
    document.getElementById('categoryModalTitle').textContent = '重命名分类';
    document.getElementById('newCategoryName').value = categoryName;
    document.getElementById('renameCategoryForm').dataset.oldCategory = categoryName;
    
    // 更新父分类选择器
    updateCategoryParentSelect(categoryName);
    const folderInfo = categoryFolders.get(categoryName);
    const parentSelect = document.getElementById('categoryParent');
    if (folderInfo && folderInfo.parent) {
        parentSelect.value = folderInfo.parent;
    } else {
        parentSelect.value = '';
    }
    parentSelect.style.display = 'block';
    parentSelect.previousElementSibling.style.display = 'block';
    parentSelect.nextElementSibling.style.display = 'block';
    
    document.getElementById('renameCategoryModal').style.display = 'flex';
    document.getElementById('newCategoryName').focus();
    document.getElementById('newCategoryName').select();
}

// 更新父分类选择器
function updateCategoryParentSelect(excludeCategory = null) {
    const parentSelect = document.getElementById('categoryParent');
    if (!parentSelect) return;
    
    // 获取所有分类
    const linkCategories = new Set(allLinks.map(link => link.category));
    const allCategoriesSet = new Set([...linkCategories, ...customCategories]);
    const categories = Array.from(allCategoriesSet).filter(cat => cat !== excludeCategory && cat !== '未分类');
    
    // 清空并重新填充
    parentSelect.innerHTML = '<option value="">无（顶级分类）</option>';
    categories.forEach(category => {
        const option = document.createElement('option');
        option.value = category;
        option.textContent = category;
        parentSelect.appendChild(option);
    });
}

// 关闭重命名分类模态框
function closeRenameCategoryModalFunc() {
    document.getElementById('renameCategoryModal').style.display = 'none';
}

// 保存重命名/添加分类
function saveRenameCategory() {
    const oldCategory = document.getElementById('renameCategoryForm').dataset.oldCategory;
    const newCategory = document.getElementById('newCategoryName').value.trim();
    const parentCategory = document.getElementById('categoryParent') ? document.getElementById('categoryParent').value.trim() : '';
    
    if (!newCategory) {
        alert('请输入分类名称');
        return;
    }
    
    // 如果是添加模式（oldCategory为空）
    if (!oldCategory) {
        // 检查分类名是否已存在
        const existingCategories = [...new Set(allLinks.map(link => link.category))];
        if (existingCategories.includes(newCategory) || customCategories.includes(newCategory)) {
            alert(`分类 "${newCategory}" 已存在`);
            return;
        }
        
        // 添加到自定义分类列表
        customCategories.push(newCategory);
        saveCustomCategories();
        
        // 如果有父分类，保存文件夹结构
        if (parentCategory) {
            if (!categoryFolders.has(newCategory)) {
                categoryFolders.set(newCategory, { parent: parentCategory, children: [], collapsed: false });
            } else {
                categoryFolders.get(newCategory).parent = parentCategory;
            }
            
            // 更新父分类的children列表
            if (!categoryFolders.has(parentCategory)) {
                categoryFolders.set(parentCategory, { parent: null, children: [newCategory], collapsed: false });
            } else {
                if (!categoryFolders.get(parentCategory).children.includes(newCategory)) {
                    categoryFolders.get(parentCategory).children.push(newCategory);
                }
            }
            saveCategoryFolders();
        }
        
        // 保存到本地存储
        saveLinksOrder();
        
        // 更新UI
        initializeCategories();
        updateAllTags();
        updateTagFilters();
        closeRenameCategoryModalFunc();
        renderCategoryList(); // 刷新分类列表
        showNotification(`分类 "${newCategory}" 已添加${parentCategory ? `（在"${parentCategory}"文件夹下）` : ''}`, 'success');
        return;
    }
    
    // 重命名模式 - 更新父分类信息
    const oldFolderInfo = categoryFolders.get(oldCategory);
    const oldParent = oldFolderInfo ? oldFolderInfo.parent : null;
    
    // 如果父分类有变化
    if (parentCategory !== oldParent) {
        if (parentCategory) {
            // 设置新父分类
            if (!categoryFolders.has(oldCategory)) {
                categoryFolders.set(oldCategory, { parent: parentCategory, children: [], collapsed: false });
            } else {
                // 从旧父分类的children中移除
                if (oldParent && categoryFolders.has(oldParent)) {
                    const oldParentChildren = categoryFolders.get(oldParent).children;
                    const index = oldParentChildren.indexOf(oldCategory);
                    if (index > -1) {
                        oldParentChildren.splice(index, 1);
                    }
                }
                categoryFolders.get(oldCategory).parent = parentCategory;
            }
            
            // 更新新父分类的children列表
            if (!categoryFolders.has(parentCategory)) {
                categoryFolders.set(parentCategory, { parent: null, children: [oldCategory], collapsed: false });
            } else {
                if (!categoryFolders.get(parentCategory).children.includes(oldCategory)) {
                    categoryFolders.get(parentCategory).children.push(oldCategory);
                }
            }
        } else {
            // 移除父分类
            if (oldFolderInfo && oldParent) {
                if (categoryFolders.has(oldParent)) {
                    const oldParentChildren = categoryFolders.get(oldParent).children;
                    const index = oldParentChildren.indexOf(oldCategory);
                    if (index > -1) {
                        oldParentChildren.splice(index, 1);
                    }
                }
                categoryFolders.get(oldCategory).parent = null;
            }
        }
        saveCategoryFolders();
    }
    
    if (oldCategory === newCategory) {
        closeRenameCategoryModalFunc();
        return;
    }
    
    // 检查新分类名是否已存在
    const existingCategories = [...new Set(allLinks.map(link => link.category))];
    if (existingCategories.includes(newCategory) && oldCategory !== newCategory) {
        if (!confirm(`分类 "${newCategory}" 已存在，是否将 "${oldCategory}" 合并到 "${newCategory}"？`)) {
            return;
        }
    }
    
    // 更新所有使用该分类的链接
    allLinks.forEach(link => {
        if (link.category === oldCategory) {
            link.category = newCategory;
        }
    });
    
    // 更新自定义分类列表
    const customIndex = customCategories.indexOf(oldCategory);
    if (customIndex !== -1) {
        customCategories[customIndex] = newCategory;
        saveCustomCategories();
    } else if (!allLinks.some(link => link.category === oldCategory)) {
        // 如果旧分类没有链接使用，且不在自定义列表中，说明是纯自定义分类
        // 这种情况不应该发生，但为了安全起见还是处理一下
    }
    
    // 如果新分类不在自定义列表中，且没有链接使用，添加到自定义列表
    if (!allLinks.some(link => link.category === newCategory) && !customCategories.includes(newCategory)) {
        customCategories.push(newCategory);
        saveCustomCategories();
    }
    
    // 如果当前选中的分类是被重命名的分类，更新选中状态
    if (currentCategory === oldCategory) {
        currentCategory = newCategory;
    }
    
    // 保存到本地存储
    saveLinksOrder();
    
    // 更新UI
    initializeCategories();
    updateAllTags();
    updateTagFilters();
    renderLinks();
    closeRenameCategoryModalFunc();
    renderCategoryList(); // 刷新分类列表
    showNotification(`分类 "${oldCategory}" 已重命名为 "${newCategory}"`, 'success');
}

// 打开删除分类模态框
function openDeleteCategoryModal(categoryName, count) {
    document.getElementById('deleteCategoryName').textContent = categoryName;
    document.getElementById('deleteCategoryCount').textContent = count;
    document.getElementById('confirmDeleteCategoryBtn').dataset.categoryName = categoryName;
    
    // 更新合并目标下拉列表
    const mergeSelect = document.getElementById('mergeToCategory');
    const existingCategories = [...new Set(allLinks.map(link => link.category))].filter(cat => cat !== categoryName);
    mergeSelect.innerHTML = '<option value="未分类">未分类</option>' + 
        existingCategories.map(cat => `<option value="${cat}">${cat}</option>`).join('');
    
    document.getElementById('deleteCategoryModal').style.display = 'flex';
}

// 关闭删除分类模态框
function closeDeleteCategoryModalFunc() {
    document.getElementById('deleteCategoryModal').style.display = 'none';
}

// 删除分类
function deleteCategory(categoryName, mergeTo) {
    // 将所有使用该分类的链接更新为合并目标分类
    allLinks.forEach(link => {
        if (link.category === categoryName) {
            link.category = mergeTo;
        }
    });
    
    // 从自定义分类列表中移除
    customCategories = customCategories.filter(cat => cat !== categoryName);
    saveCustomCategories();
    
    // 如果当前选中的分类是被删除的分类，切换到合并目标分类
    if (currentCategory === categoryName) {
        currentCategory = mergeTo;
    }
    
    // 保存到本地存储
    saveLinksOrder();
    
    // 更新UI
    initializeCategories();
    updateAllTags();
    updateTagFilters();
    renderLinks();
    renderCategoryList(); // 刷新分类列表
    showNotification(`分类 "${categoryName}" 已删除，链接已合并到 "${mergeTo}"`, 'success');
}

// 保存自定义分类列表
function saveCustomCategories() {
    try {
        localStorage.setItem(getUserStorageKey('customCategories'), JSON.stringify(customCategories));
    } catch (e) {
        console.error('保存自定义分类失败:', e);
    }
}

// 加载自定义分类列表
async function loadCustomCategories() {
    if (useBackendAPI && api && currentUserId) {
        try {
            const categories = await api.getCategories(currentUserId);
            customCategories = categories.map(cat => cat.name);
            return;
        } catch (error) {
            console.error('从后端加载分类失败，切换到 localStorage:', error);
            useBackendAPI = false;
        }
    }
    
    // 使用 localStorage（原有逻辑）
    try {
        const saved = localStorage.getItem(getUserStorageKey('customCategories'));
        if (saved) {
            customCategories = JSON.parse(saved);
        }
    } catch (e) {
        console.error('加载自定义分类失败:', e);
        customCategories = [];
    }
}

// 打开数据管理模态框
function openDataManageModal() {
    updateDataInfo();
    // 加载当前页面标题到输入框
    const pageTitleInput = document.getElementById('pageTitleInput');
    if (pageTitleInput) {
        const titleElement = document.querySelector('.header-left .title');
        if (titleElement) {
            pageTitleInput.value = titleElement.textContent || '我的链接门户';
        }
    }
    document.getElementById('dataManageModal').style.display = 'flex';
}

// 关闭数据管理模态框
function closeDataManageModal() {
    document.getElementById('dataManageModal').style.display = 'none';
}

// 更新数据信息
function updateDataInfo() {
    // 更新基本数据信息
    const linksCount = allLinks.length;
    const categoriesCount = [...new Set(allLinks.map(link => link.category)), ...customCategories].length;
    
    // 计算数据大小
    const dataSize = new Blob([JSON.stringify(allLinks), JSON.stringify(customCategories)]).size;
    const dataSizeKB = (dataSize / 1024).toFixed(2);
    
    document.getElementById('linksCount').textContent = linksCount;
    document.getElementById('categoriesCount').textContent = categoriesCount;
    document.getElementById('dataSize').textContent = `${dataSizeKB} KB`;
    
    // 更新统计信息
    updateStatsInfo();
}

// 更新统计信息
function updateStatsInfo() {
    // 总访问次数
    const totalClicks = allLinks.reduce((sum, link) => sum + (link.clicks || link.clickCount || 0), 0);
    const totalClicksEl = document.getElementById('totalClicks');
    if (totalClicksEl) {
        totalClicksEl.textContent = totalClicks;
    }
    
    // 收藏链接数
    const favoriteCount = favoriteLinks.size;
    const favoriteCountEl = document.getElementById('favoriteCount');
    if (favoriteCountEl) {
        favoriteCountEl.textContent = favoriteCount;
    }
    
    
    // 标签数量
    const tagsCount = allTags.size;
    const tagsCountEl = document.getElementById('tagsCount');
    if (tagsCountEl) {
        tagsCountEl.textContent = tagsCount;
    }
    
    // 最常用链接（按访问次数排序）
    const topLinksList = document.getElementById('topLinksList');
    if (topLinksList) {
        const topLinks = [...allLinks]
            .filter(link => (link.clicks || link.clickCount || 0) > 0)
            .sort((a, b) => (b.clicks || b.clickCount || 0) - (a.clicks || a.clickCount || 0))
            .slice(0, 5);
        
        if (topLinks.length === 0) {
            topLinksList.innerHTML = '<p style="color: var(--text-secondary); text-align: center; padding: 20px;">暂无访问记录</p>';
        } else {
            topLinksList.innerHTML = topLinks.map((link, index) => `
                <div class="top-link-item" style="display: flex; align-items: center; gap: 12px; padding: 12px; background: var(--bg-color); border-radius: 8px; margin-bottom: 8px; cursor: pointer;" data-url="${link.url}">
                    <div class="top-link-rank" style="width: 24px; height: 24px; background: var(--primary-color); color: white; border-radius: 50%; display: flex; align-items: center; justify-content: center; font-weight: 600; font-size: 0.85rem; flex-shrink: 0;">${index + 1}</div>
                    <div class="top-link-icon" style="width: 32px; height: 32px; border-radius: 6px; overflow: hidden; flex-shrink: 0;">
                        ${link.icon ? `<img src="${link.icon}" alt="${link.name}" style="width: 100%; height: 100%; object-fit: cover;" onerror="this.style.display='none'; this.nextElementSibling.style.display='flex';">
                        <div style="display: none; width: 100%; height: 100%; background: linear-gradient(135deg, var(--primary-color), #8b5cf6); color: white; align-items: center; justify-content: center; font-weight: 600;">${link.name.charAt(0).toUpperCase()}</div>` : 
                        `<div style="width: 100%; height: 100%; background: linear-gradient(135deg, var(--primary-color), #8b5cf6); color: white; display: flex; align-items: center; justify-content: center; font-weight: 600;">${link.name.charAt(0).toUpperCase()}</div>`}
                    </div>
                    <div class="top-link-info" style="flex: 1; min-width: 0;">
                        <div class="top-link-name" style="font-weight: 600; color: var(--text-primary); margin-bottom: 4px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis;">${link.name}</div>
                        <div class="top-link-stats" style="font-size: 0.85rem; color: var(--text-secondary);">访问 ${link.clicks || link.clickCount || 0} 次</div>
                    </div>
                </div>
            `).join('');
            
            // 绑定点击事件
            topLinksList.querySelectorAll('.top-link-item').forEach(item => {
                item.addEventListener('click', () => {
                    const url = item.dataset.url;
                    recordLinkAccess(url);
                    window.open(url, '_blank');
                });
            });
        }
    }
    
    // 分类分布
    const categoryStatsList = document.getElementById('categoryStatsList');
    if (categoryStatsList) {
        const categoryStats = {};
        allLinks.forEach(link => {
            const category = link.category || '未分类';
            categoryStats[category] = (categoryStats[category] || 0) + 1;
        });
        
        const sortedCategories = Object.entries(categoryStats)
            .sort((a, b) => b[1] - a[1])
            .slice(0, 10);
        
        if (sortedCategories.length === 0) {
            categoryStatsList.innerHTML = '<p style="color: var(--text-secondary); text-align: center; padding: 20px;">暂无分类数据</p>';
        } else {
            const maxCount = sortedCategories[0][1];
            categoryStatsList.innerHTML = sortedCategories.map(([category, count]) => {
                const percentage = (count / allLinks.length * 100).toFixed(1);
                return `
                    <div class="category-stat-item" style="margin-bottom: 12px;">
                        <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 6px;">
                            <span style="font-weight: 500; color: var(--text-primary);">${category}</span>
                            <span style="font-size: 0.9rem; color: var(--text-secondary);">${count} (${percentage}%)</span>
                        </div>
                        <div style="width: 100%; height: 8px; background: var(--bg-color); border-radius: 4px; overflow: hidden;">
                            <div style="width: ${(count / maxCount * 100)}%; height: 100%; background: linear-gradient(90deg, var(--primary-color), #8b5cf6); border-radius: 4px; transition: width 0.3s ease;"></div>
                        </div>
                    </div>
                `;
            }).join('');
        }
    }
}

// 重置为默认数据（清空所有数据）
function resetToDefaultData() {
    allLinks = [];
    filteredLinks = [];
    customCategories = [];
    
    localStorage.removeItem(getUserStorageKey('linksOrder'));
    localStorage.removeItem(getUserStorageKey('linksData'));
    localStorage.removeItem(getUserStorageKey('customCategories'));
    
    // 如果使用后端API，也需要清空数据库数据
    if (useBackendAPI && api && currentUserId) {
        // 这里可以添加清空数据库的逻辑，或者提示用户
    }
    
    initializeCategories();
    renderLinks();
    updateDataInfo();
    showNotification('已重置数据', 'success');
}

// 清空所有数据
function clearAllData() {
    allLinks = [];
    filteredLinks = [];
    customCategories = [];
    favoriteLinks = new Set();
    accessHistory = [];
    allTags = new Set();
    categoryFolders = new Map();
    
    // 保存空数据到localStorage（而不是删除键，这样刷新后不会恢复默认数据）
    localStorage.setItem(getUserStorageKey('linksOrder'), JSON.stringify([]));
    localStorage.setItem(getUserStorageKey('linksData'), JSON.stringify([]));
    localStorage.setItem(getUserStorageKey('customCategories'), JSON.stringify([]));
    localStorage.setItem(getUserStorageKey('favoriteLinks'), JSON.stringify([]));
    localStorage.setItem(getUserStorageKey('accessHistory'), JSON.stringify([]));
    localStorage.setItem(getUserStorageKey('allTags'), JSON.stringify([]));
    localStorage.setItem(getUserStorageKey('categoryFolders'), JSON.stringify({}));
    
    initializeCategories();
    renderLinks();
    updateDataInfo();
    showNotification('所有数据已清空', 'success');
}

// ==================== 用户管理功能 ====================

// 获取用户数据存储键名
function getUserStorageKey(key) {
    if (!currentUserId) {
        console.error('currentUserId 未设置');
        return key;
    }
    return `user_${currentUserId}_${key}`;
}

// 初始化用户系统
async function initializeUserSystem() {
    // 从 localStorage 加载已登录过的用户列表（不获取所有用户）
    const savedUsers = localStorage.getItem('users');
    if (savedUsers) {
        try {
            users = JSON.parse(savedUsers);
        } catch (e) {
            console.error('加载用户列表失败:', e);
            users = [];
        }
    }
    
    // 加载当前用户ID
    const savedCurrentUserId = localStorage.getItem('currentUserId');
    let targetUser = null;
    
    // 优先使用保存的用户ID
    if (savedCurrentUserId) {
        targetUser = users.find(u => u.id === savedCurrentUserId);
    }
    
    // 如果没有保存的用户ID，但用户列表中有用户，使用第一个用户（如admin）
    if (!targetUser && users.length > 0) {
        targetUser = users[0];
    }
    
    if (targetUser) {
        // 有用户可用，直接进入
        currentUserId = targetUser.id;
        if (useBackendAPI && api) {
            api.setCurrentUserId(currentUserId);
        }
        saveCurrentUserId(); // 保存当前用户ID
        // 迁移旧数据到当前用户（如果存在旧数据且当前用户没有数据）
        migrateOldData();
        // 更新用户界面
        updateUserUI();
    } else {
        // 完全没有用户，显示登录弹窗
        if (useBackendAPI && api) {
            setTimeout(() => {
                if (window.openLoginModal) {
                    window.openLoginModal();
                }
            }, 500);
        } else {
            // localStorage 模式：创建默认用户
            const defaultUser = {
                id: 'user_' + Date.now(),
                name: '默认用户',
                createdAt: new Date().toISOString()
            };
            users = [defaultUser];
            saveUsers();
            currentUserId = users[0].id;
            saveCurrentUserId();
            migrateOldData();
            updateUserUI();
        }
    }
}

// 迁移旧数据到当前用户
function migrateOldData() {
    const oldLinksData = localStorage.getItem('linksData');
    const userLinksData = localStorage.getItem(getUserStorageKey('linksData'));
    
    // 如果存在旧数据且当前用户没有数据，则迁移
    if (oldLinksData && !userLinksData) {
        const oldKeys = ['linksData', 'linksOrder', 'customCategories', 'favoriteLinks', 
                        'accessHistory', 'allTags', 'categoryFolders'];
        
        oldKeys.forEach(key => {
            const oldValue = localStorage.getItem(key);
            if (oldValue) {
                localStorage.setItem(getUserStorageKey(key), oldValue);
                localStorage.removeItem(key); // 删除旧数据
            }
        });
        
        showNotification('已迁移旧数据到当前用户', 'success');
    }
}

// 保存用户列表
function saveUsers() {
    localStorage.setItem('users', JSON.stringify(users));
}

// 保存当前用户ID
function saveCurrentUserId() {
    localStorage.setItem('currentUserId', currentUserId);
}

// 添加用户
async function addUser(name, password) {
    if (!name || name.trim() === '') {
        showNotification('用户名不能为空', 'error');
        return false;
    }
    
    if (!password || password.length < 6) {
        showNotification('密码长度至少为6位', 'error');
        return false;
    }
    
    // 检查用户名是否已存在
    if (users.find(u => u.name === name.trim())) {
        showNotification('用户名已存在', 'error');
        return false;
    }
    
    if (useBackendAPI && api) {
        try {
            const newUser = await api.createUser(name.trim(), password);
            users.push(newUser);
            saveUsers();
            renderUserList();
            showNotification(`用户 "${name}" 已添加`, 'success');
            return true;
        } catch (error) {
            console.error('创建用户失败:', error);
            showNotification('创建用户失败: ' + (error.message || '未知错误'), 'error');
            return false;
        }
    }
    
    // 使用 localStorage（原有逻辑，但密码无法存储）
    const newUser = {
        id: 'user_' + Date.now(),
        name: name.trim(),
        createdAt: new Date().toISOString()
    };
    
    users.push(newUser);
    saveUsers();
    renderUserList();
    showNotification(`用户 "${name}" 已添加（注意：localStorage 模式不支持密码）`, 'success');
    return true;
}

// 用户登录
async function loginUser(name, password) {
    if (!name || !password) {
        showNotification('请输入用户名和密码', 'error');
        return false;
    }
    
    if (useBackendAPI && api) {
        try {
            const result = await api.login(name, password);
            if (result.success && result.user) {
                // 检查用户是否已在已登录用户列表中
                let user = users.find(u => u.id === result.user.id || u.name === result.user.name);
                if (!user) {
                    // 只有登录成功后，才将用户添加到已登录用户列表
                    users.push(result.user);
                    saveUsers();
                }
                currentUserId = result.user.id;
                api.setCurrentUserId(currentUserId);
                saveCurrentUserId();
                updateUserUI();
                showNotification('登录成功', 'success');
                return true;
            } else {
                showNotification(result.message || '登录失败', 'error');
                return false;
            }
        } catch (error) {
            console.error('登录失败:', error);
            showNotification('登录失败: ' + (error.message || '未知错误'), 'error');
            return false;
        }
    } else {
        showNotification('后端API不可用，无法登录', 'error');
        return false;
    }
}

// 用户注册
async function registerUser(name, password) {
    if (!name || !name.trim()) {
        showNotification('用户名不能为空', 'error');
        return false;
    }
    
    if (!password || password.length < 6) {
        showNotification('密码长度至少为6位', 'error');
        return false;
    }
    
    if (useBackendAPI && api) {
        try {
            const newUser = await api.createUser(name.trim(), password);
            users.push(newUser);
            saveUsers();
            renderUserList();
            showNotification('注册成功，请登录', 'success');
            return true;
        } catch (error) {
            console.error('注册失败:', error);
            showNotification('注册失败: ' + (error.message || '未知错误'), 'error');
            return false;
        }
    } else {
        showNotification('后端API不可用，无法注册', 'error');
        return false;
    }
}

// 删除用户（全局函数，供HTML调用）
window.deleteUser = async function(userId, event) {
    // 阻止事件冒泡
    if (event) {
        event.preventDefault();
        event.stopPropagation();
    }
    
    
    if (users.length <= 1) {
        showNotification('至少需要保留一个用户', 'error');
        return;
    }
    
    // 确保userId类型正确（后端API需要数字）
    const userIdNum = typeof userId === 'string' ? parseInt(userId, 10) : userId;
    
    // 使用原始userId查找用户（因为users数组中的id可能是字符串或数字）
    const user = users.find(u => {
        const uId = typeof u.id === 'string' ? parseInt(u.id, 10) : u.id;
        return uId === userIdNum || u.id === userId || u.id === userIdNum;
    });
    
    if (!user) {
        console.error('未找到用户:', userId);
        showNotification('未找到要删除的用户', 'error');
        return;
    }
    
    if (!confirm(`确定要删除用户 "${user.name}" 吗？此操作将删除该用户的所有数据，且无法恢复！`)) {
        return;
    }
    
    if (useBackendAPI && api) {
        try {
            await api.deleteUser(userIdNum);
            
            // 从用户列表中删除（使用多种ID匹配方式）
            users = users.filter(u => {
                const uId = typeof u.id === 'string' ? parseInt(u.id, 10) : u.id;
                return uId !== userIdNum && u.id !== userId && u.id !== userIdNum;
            });
            
            // 如果删除的是当前用户，切换到第一个用户
            const currentUserIdNum = typeof currentUserId === 'string' ? parseInt(currentUserId, 10) : currentUserId;
            if (currentUserIdNum === userIdNum || currentUserId === userId || currentUserId === userIdNum) {
                if (users.length > 0) {
                    currentUserId = users[0].id;
                    api.setCurrentUserId(currentUserId);
                    await switchUser(currentUserId);
                }
            }
            
            // 重新加载用户列表（从后端获取最新数据）
            try {
                const updatedUsers = await api.getUsers();
                if (updatedUsers && updatedUsers.length > 0) {
                    users = updatedUsers;
                }
            } catch (e) {
                console.error('重新加载用户列表失败:', e);
            }
            
            renderUserList();
            updateUserUI();
            showNotification(`用户 "${user.name}" 已删除`, 'success');
            return;
        } catch (error) {
            console.error('删除用户失败:', error);
            console.error('错误详情:', error.message, error);
            showNotification('删除用户失败: ' + (error.message || '未知错误'), 'error');
            // 不要立即回退，让用户知道是API错误
        }
    }
    
    // 使用 localStorage（原有逻辑）
    // 删除用户数据
    const userKeys = ['linksData', 'linksOrder', 'customCategories', 'favoriteLinks', 
                     'accessHistory', 'allTags', 'categoryFolders'];
    userKeys.forEach(key => {
        localStorage.removeItem(`user_${userId}_${key}`);
        localStorage.removeItem(`user_${userIdNum}_${key}`);
    });
    
    // 从用户列表中删除（使用多种ID匹配方式）
    const beforeCount = users.length;
    users = users.filter(u => {
        const uId = typeof u.id === 'string' ? parseInt(u.id, 10) : u.id;
        return uId !== userIdNum && u.id !== userId && u.id !== userIdNum;
    });
    saveUsers();
    
    // 如果删除的是当前用户，切换到第一个用户
    const currentUserIdNum = typeof currentUserId === 'string' ? parseInt(currentUserId, 10) : currentUserId;
    if (currentUserIdNum === userIdNum || currentUserId === userId || currentUserId === userIdNum) {
        if (users.length > 0) {
            currentUserId = users[0].id;
            saveCurrentUserId();
            await switchUser(currentUserId);
        }
    }
    
    renderUserList();
    updateUserUI();
    showNotification(`用户 "${user.name}" 已删除`, 'success');
};

// 切换用户（全局函数，供HTML调用）
window.switchUser = async function(userId, event) {
    // 阻止事件冒泡
    if (event) {
        event.preventDefault();
        event.stopPropagation();
    }
    
    if (currentUserId === userId) return;
    
    // 保存当前用户数据
    if (!useBackendAPI) {
        await saveAllUserData();
    }
    
    // 切换用户
    currentUserId = userId;
    if (useBackendAPI && api) {
        api.setCurrentUserId(currentUserId);
    } else {
        saveCurrentUserId();
    }
    
    // 重新加载数据
    await loadAllUserData();
    
    // 更新UI
    updateUserUI();
    renderUserList();
    
    showNotification(`已切换到用户 "${users.find(u => u.id === userId)?.name}"`, 'success');
};

// 保存所有用户数据
async function saveAllUserData() {
    saveLinksOrder();
    saveCustomCategories();
    saveCategoryFolders();
    await saveFavoriteLinks();
    saveAllTags();
    saveAccessHistory();
}

// 加载所有用户数据
async function loadAllUserData() {
    await loadLinksOrder();
    await loadCustomCategories();
    loadCategoryFolders();
    await loadFavoriteLinks();
    loadAllTags();
    await loadAccessHistory();
    await loadPageTitle(); // 加载页面标题
    
    // 重新初始化
    initializeCategories();
    renderLinks();
    updateDataInfo();
}

// 更新用户界面
function updateUserUI() {
    const currentUser = users.find(u => u.id === currentUserId);
    const userNameEl = document.getElementById('currentUserName');
    if (userNameEl && currentUser) {
        userNameEl.textContent = currentUser.name;
    }
}

// 渲染用户列表
function renderUserList() {
    const userListEl = document.getElementById('userList');
    if (!userListEl) return;
    
    userListEl.innerHTML = users.map(user => {
        const isActive = user.id === currentUserId;
        const avatar = user.name.charAt(0).toUpperCase();
        const createdAt = new Date(user.createdAt).toLocaleDateString('zh-CN');
        
        return `
            <div class="user-item ${isActive ? 'active' : ''}">
                <div class="user-info">
                    <div class="user-avatar">${avatar}</div>
                    <div class="user-details">
                        <div class="user-name">${user.name}</div>
                        <div class="user-meta">创建于 ${createdAt}</div>
                    </div>
                </div>
                <div class="user-actions">
                    ${!isActive ? `
                        <button class="user-action-btn" onclick="switchUser('${user.id}', event)">切换</button>
                    ` : ''}
                    ${users.length > 1 ? `
                        <button class="user-action-btn delete-btn" onclick="deleteUser('${user.id}', event)">删除</button>
                    ` : ''}
                </div>
            </div>
        `;
    }).join('');
}

// 设置用户管理
function setupUserManagement() {
    const userSwitchBtn = document.getElementById('userSwitchBtn');
    const userManageModal = document.getElementById('userManageModal');
    const addUserModal = document.getElementById('addUserModal');
    const closeUserManageModal = document.getElementById('closeUserManageModal');
    const closeAddUserModal = document.getElementById('closeAddUserModal');
    const showAddUserModalBtn = document.getElementById('showAddUserModalBtn');
    const addUserForm = document.getElementById('addUserForm');
    const cancelAddUser = document.getElementById('cancelAddUser');
    const loginModal = document.getElementById('loginModal');
    const registerModal = document.getElementById('registerModal');
    const closeLoginModal = document.getElementById('closeLoginModal');
    const closeRegisterModal = document.getElementById('closeRegisterModal');
    const loginForm = document.getElementById('loginForm');
    const registerForm = document.getElementById('registerForm');
    const cancelLogin = document.getElementById('cancelLogin');
    const cancelRegister = document.getElementById('cancelRegister');
    const showRegisterLink = document.getElementById('showRegisterLink');
    const showLoginLink = document.getElementById('showLoginLink');
    const showRegisterFromLoginBtn = document.getElementById('showRegisterFromLoginBtn');
    
    // 打开用户管理模态框
    if (userSwitchBtn) {
        userSwitchBtn.addEventListener('click', () => {
            renderUserList();
            if (userManageModal) {
                userManageModal.style.display = 'flex';
            }
        });
    }
    
    // 打开添加用户模态框 - 改为打开登录弹窗
    if (showAddUserModalBtn) {
        showAddUserModalBtn.addEventListener('click', () => {
            if (userManageModal) {
                userManageModal.style.display = 'none';
            }
            // 打开登录弹窗而不是添加用户弹窗
            openLoginModal();
        });
    }
    
    // 关闭用户管理模态框
    if (closeUserManageModal) {
        closeUserManageModal.addEventListener('click', () => {
            if (userManageModal) {
                userManageModal.style.display = 'none';
            }
        });
    }
    
    // 关闭添加用户模态框
    if (closeAddUserModal) {
        closeAddUserModal.addEventListener('click', () => {
            if (addUserModal) {
                addUserModal.style.display = 'none';
            }
        });
    }
    
    if (cancelAddUser) {
        cancelAddUser.addEventListener('click', (e) => {
            e.preventDefault();
            e.stopPropagation();
            if (addUserForm) {
                addUserForm.reset();
            }
            if (addUserModal) {
                addUserModal.style.display = 'none';
            }
        });
    }
    
    // 添加用户表单
    if (addUserForm) {
        addUserForm.addEventListener('submit', async (e) => {
            e.preventDefault();
            const nameInput = document.getElementById('newUserName');
            const passwordInput = document.getElementById('newUserPassword');
            const passwordConfirmInput = document.getElementById('newUserPasswordConfirm');
            
            if (nameInput && passwordInput && passwordConfirmInput) {
                if (passwordInput.value !== passwordConfirmInput.value) {
                    showNotification('两次输入的密码不一致', 'error');
                    return;
                }
                
                if (await addUser(nameInput.value, passwordInput.value)) {
                    addUserForm.reset();
                    if (addUserModal) {
                        addUserModal.style.display = 'none';
                    }
                    // 重新显示用户管理弹窗
                    if (userManageModal) {
                        userManageModal.style.display = 'flex';
                        renderUserList();
                    }
                }
            }
        });
    }
    
    // 打开登录模态框（全局函数）
    window.openLoginModal = function() {
        const loginModal = document.getElementById('loginModal');
        if (loginModal) {
            loginModal.style.display = 'flex';
        }
    };
    
    // 打开注册模态框（全局函数）
    window.openRegisterModal = function() {
        const registerModal = document.getElementById('registerModal');
        if (registerModal) {
            registerModal.style.display = 'flex';
        }
    };
    
    // 为了向后兼容，在函数内部也定义局部变量
    const openLoginModal = window.openLoginModal;
    const openRegisterModal = window.openRegisterModal;
    
    // 关闭模态框的通用函数
    function closeModal(modal) {
        if (modal) {
            modal.style.display = 'none';
        }
    }
    
    // 关闭登录模态框
    if (closeLoginModal) {
        closeLoginModal.addEventListener('click', () => closeModal(loginModal));
    }
    
    // 关闭注册模态框
    if (closeRegisterModal) {
        closeRegisterModal.addEventListener('click', () => closeModal(registerModal));
    }
    
    // 取消按钮
    if (cancelLogin) {
        cancelLogin.addEventListener('click', () => {
            if (loginForm) {
                loginForm.reset();
            }
            closeModal(loginModal);
        });
    }
    
    if (cancelRegister) {
        cancelRegister.addEventListener('click', () => {
            if (registerForm) {
                registerForm.reset();
            }
            closeModal(registerModal);
        });
    }
    
    // 显示注册链接
    if (showRegisterLink) {
        showRegisterLink.addEventListener('click', (e) => {
            e.preventDefault();
            closeModal(loginModal);
            openRegisterModal();
        });
    }
    
    // 显示登录链接
    if (showLoginLink) {
        showLoginLink.addEventListener('click', (e) => {
            e.preventDefault();
            closeModal(registerModal);
            openLoginModal();
        });
    }
    
    // 从登录弹窗打开注册弹窗（添加新用户按钮）
    if (showRegisterFromLoginBtn) {
        showRegisterFromLoginBtn.addEventListener('click', (e) => {
            e.preventDefault();
            closeModal(loginModal);
            openRegisterModal();
        });
    }
    
    // 登录表单
    if (loginForm) {
        loginForm.addEventListener('submit', async (e) => {
            e.preventDefault();
            const nameInput = document.getElementById('loginUserName');
            const passwordInput = document.getElementById('loginPassword');
            if (nameInput && passwordInput) {
                if (await loginUser(nameInput.value, passwordInput.value)) {
                    loginForm.reset();
                    closeModal(loginModal);
                    // 重新加载数据
                    await loadAllUserData();
                    renderLinks();
                }
            }
        });
    }
    
    // 注册表单
    if (registerForm) {
        registerForm.addEventListener('submit', async (e) => {
            e.preventDefault();
            const nameInput = document.getElementById('registerUserName');
            const passwordInput = document.getElementById('registerPassword');
            const passwordConfirmInput = document.getElementById('registerPasswordConfirm');
            
            if (nameInput && passwordInput && passwordConfirmInput) {
                if (passwordInput.value !== passwordConfirmInput.value) {
                    showNotification('两次输入的密码不一致', 'error');
                    return;
                }
                
                if (await registerUser(nameInput.value, passwordInput.value)) {
                    registerForm.reset();
                    closeModal(registerModal);
                    openLoginModal();
                }
            }
        });
    }
    
    // 点击背景关闭
    [userManageModal, addUserModal, loginModal, registerModal].forEach(modal => {
        if (modal) {
            modal.addEventListener('click', (e) => {
                if (e.target === modal) {
                    closeModal(modal);
                }
            });
            
            // 阻止模态框内容区域的点击事件冒泡
            const modalContent = modal.querySelector('.modal-content');
            if (modalContent) {
                modalContent.addEventListener('click', (e) => {
                    e.stopPropagation();
                });
            }
        }
    });
    
    // 如果使用后端API且没有当前用户，显示登录弹窗
    if (useBackendAPI && api && !currentUserId) {
        setTimeout(() => {
            if (window.openLoginModal) {
                window.openLoginModal();
            }
        }, 500);
    }
}

// 显示通知
function showNotification(message, type = 'info') {
    // 创建通知元素
    const notification = document.createElement('div');
    notification.className = `notification notification-${type}`;
    notification.textContent = message;
    
    // 添加到页面
    document.body.appendChild(notification);
    
    // 显示动画
    setTimeout(() => {
        notification.classList.add('show');
    }, 10);
    
    // 自动移除
    setTimeout(() => {
        notification.classList.remove('show');
        setTimeout(() => {
            document.body.removeChild(notification);
        }, 300);
    }, 3000);
}

// 设置批量操作模式
function setupBatchMode() {
    const batchModeBtn = document.getElementById('batchModeBtn');
    const batchToolbar = document.getElementById('batchToolbar');
    const cancelBatchBtn = document.getElementById('cancelBatchBtn');
    const selectAllBtn = document.getElementById('selectAllBtn');
    const selectNoneBtn = document.getElementById('selectNoneBtn');
    const batchDeleteBtn = document.getElementById('batchDeleteBtn');
    const batchChangeCategoryBtn = document.getElementById('batchChangeCategoryBtn');
    const batchExportBtn = document.getElementById('batchExportBtn');
    const batchCategoryModal = document.getElementById('batchCategoryModal');
    const batchCategoryForm = document.getElementById('batchCategoryForm');
    const closeBatchCategoryModal = document.getElementById('closeBatchCategoryModal');
    const cancelBatchCategoryBtn = document.getElementById('cancelBatchCategoryBtn');
    
    // 切换批量模式
    if (batchModeBtn) {
        batchModeBtn.addEventListener('click', () => {
            toggleBatchMode();
        });
    }
    
    // 取消批量模式
    if (cancelBatchBtn) {
        cancelBatchBtn.addEventListener('click', () => {
            exitBatchMode();
        });
    }
    
    // 全选
    if (selectAllBtn) {
        selectAllBtn.addEventListener('click', () => {
            selectAllLinks();
        });
    }
    
    // 取消全选
    if (selectNoneBtn) {
        selectNoneBtn.addEventListener('click', () => {
            selectNoneLinks();
        });
    }
    
    // 批量删除
    if (batchDeleteBtn) {
        batchDeleteBtn.addEventListener('click', () => {
            batchDeleteLinks();
        });
    }
    
    // 批量修改分类
    if (batchChangeCategoryBtn) {
        batchChangeCategoryBtn.addEventListener('click', () => {
            openBatchCategoryModal();
        });
    }
    
    // 批量修改标签
    const batchChangeTagsBtn = document.getElementById('batchChangeTagsBtn');
    if (batchChangeTagsBtn) {
        batchChangeTagsBtn.addEventListener('click', () => {
            openBatchTagsModal();
        });
    }
    
    // 批量设置分享
    const batchSetShareBtn = document.getElementById('batchSetShareBtn');
    if (batchSetShareBtn) {
        batchSetShareBtn.addEventListener('click', () => {
            openBatchShareModal();
        });
    }
    
    // 导出选中
    if (batchExportBtn) {
        batchExportBtn.addEventListener('click', () => {
            exportSelectedLinks();
        });
    }
    
    // 批量修改分类表单
    if (batchCategoryForm) {
        batchCategoryForm.addEventListener('submit', (e) => {
            e.preventDefault();
            batchChangeCategory();
        });
    }
    
    if (closeBatchCategoryModal) {
        closeBatchCategoryModal.addEventListener('click', closeBatchCategoryModalFunc);
    }
    
    if (cancelBatchCategoryBtn) {
        cancelBatchCategoryBtn.addEventListener('click', closeBatchCategoryModalFunc);
    }
    
    if (batchCategoryModal) {
        batchCategoryModal.addEventListener('click', (e) => {
            if (e.target === batchCategoryModal) {
                closeBatchCategoryModalFunc();
            }
        });
    }
    
    // 批量修改标签表单
    const batchTagsForm = document.getElementById('batchTagsForm');
    const closeBatchTagsModal = document.getElementById('closeBatchTagsModal');
    const cancelBatchTagsBtn = document.getElementById('cancelBatchTagsBtn');
    const batchTagsModal = document.getElementById('batchTagsModal');
    
    if (batchTagsForm) {
        batchTagsForm.addEventListener('submit', (e) => {
            e.preventDefault();
            batchChangeTags();
        });
    }
    
    if (closeBatchTagsModal) {
        closeBatchTagsModal.addEventListener('click', closeBatchTagsModalFunc);
    }
    
    if (cancelBatchTagsBtn) {
        cancelBatchTagsBtn.addEventListener('click', closeBatchTagsModalFunc);
    }
    
    if (batchTagsModal) {
        batchTagsModal.addEventListener('click', (e) => {
            if (e.target === batchTagsModal) {
                closeBatchTagsModalFunc();
            }
        });
    }
}

// 切换批量模式
function toggleBatchMode() {
    batchMode = !batchMode;
    selectedLinks.clear();
    
    if (batchMode) {
        document.getElementById('batchModeBtn').classList.add('active');
        document.getElementById('batchToolbar').style.display = 'flex';
        updateBatchToolbar();
    } else {
        exitBatchMode();
    }
    
    renderLinks();
}

// 退出批量模式
function exitBatchMode() {
    batchMode = false;
    selectedLinks.clear();
    document.getElementById('batchModeBtn').classList.remove('active');
    document.getElementById('batchToolbar').style.display = 'none';
    renderLinks();
}

// 更新批量操作工具栏
function updateBatchToolbar() {
    const count = selectedLinks.size;
    document.getElementById('selectedCount').textContent = count;
    
    // 根据选中数量启用/禁用按钮
    const hasSelection = count > 0;
    document.getElementById('batchDeleteBtn').disabled = !hasSelection;
    document.getElementById('batchChangeCategoryBtn').disabled = !hasSelection;
    document.getElementById('batchChangeTagsBtn').disabled = !hasSelection;
    const batchSetShareBtn = document.getElementById('batchSetShareBtn');
    if (batchSetShareBtn) batchSetShareBtn.disabled = !hasSelection;
    document.getElementById('batchExportBtn').disabled = !hasSelection;
    const batchCheckBtn = document.getElementById('batchCheckBtn');
    if (batchCheckBtn) batchCheckBtn.disabled = !hasSelection;
}

// 更新卡片选择状态
function updateCardSelection() {
    document.querySelectorAll('.link-card').forEach(card => {
        const url = card.dataset.url;
        if (selectedLinks.has(url)) {
            card.classList.add('selected');
        } else {
            card.classList.remove('selected');
        }
    });
}

// 更新列表选择状态
function updateListSelection() {
    document.querySelectorAll('.link-row').forEach(row => {
        const url = row.dataset.url;
        if (selectedLinks.has(url)) {
            row.classList.add('selected');
        } else {
            row.classList.remove('selected');
        }
    });
}

// 全选链接
function selectAllLinks() {
    filteredLinks.forEach(link => {
        selectedLinks.add(link.url);
    });
    updateCheckboxes();
    updateBatchToolbar();
    updateCardSelection();
    updateListSelection();
}

// 取消全选
function selectNoneLinks() {
    selectedLinks.clear();
    updateCheckboxes();
    updateBatchToolbar();
    updateCardSelection();
    updateListSelection();
}

// 更新所有复选框状态
function updateCheckboxes() {
    document.querySelectorAll('.link-checkbox').forEach(checkbox => {
        const url = checkbox.dataset.url;
        checkbox.checked = selectedLinks.has(url);
    });
    
    // 更新全选复选框
    const selectAllCheckbox = document.getElementById('selectAllCheckbox');
    if (selectAllCheckbox) {
        const allSelected = filteredLinks.length > 0 && 
            filteredLinks.every(link => selectedLinks.has(link.url));
        selectAllCheckbox.checked = allSelected;
    }
}

// 批量删除链接
function batchDeleteLinks() {
    const count = selectedLinks.size;
    if (count === 0) {
        showNotification('请先选择要删除的链接', 'error');
        return;
    }
    
    if (confirm(`确定要删除选中的 ${count} 个链接吗？此操作无法撤销！`)) {
        // 从后往前删除，避免索引问题
        const urlsToDelete = Array.from(selectedLinks);
        urlsToDelete.forEach(url => {
            const index = allLinks.findIndex(link => link.url === url);
            if (index !== -1) {
                allLinks.splice(index, 1);
            }
        });
        
        selectedLinks.clear();
        saveLinksOrder();
        initializeCategories();
        filterLinks(document.getElementById('searchInput').value);
        exitBatchMode();
        showNotification(`已删除 ${count} 个链接`, 'success');
    }
}

// 打开批量修改分类模态框
function openBatchCategoryModal() {
    const count = selectedLinks.size;
    if (count === 0) {
        showNotification('请先选择要修改的链接', 'error');
        return;
    }
    
    // 更新分类下拉列表
    const select = document.getElementById('batchCategorySelect');
    const categories = [...new Set(allLinks.map(link => link.category)), ...customCategories];
    select.innerHTML = '<option value="未分类">未分类</option>' + 
        categories.map(cat => `<option value="${cat}">${cat}</option>`).join('');
    
    document.getElementById('batchCategoryModal').style.display = 'flex';
}

// 关闭批量修改分类模态框
function closeBatchCategoryModalFunc() {
    document.getElementById('batchCategoryModal').style.display = 'none';
}

// 批量修改分类
function batchChangeCategory() {
    const newCategory = document.getElementById('batchCategorySelect').value;
    const count = selectedLinks.size;
    
    if (count === 0) {
        showNotification('请先选择要修改的链接', 'error');
        return;
    }
    
    // 更新选中链接的分类
    selectedLinks.forEach(url => {
        const link = allLinks.find(l => l.url === url);
        if (link) {
            link.category = newCategory;
        }
    });
    
    selectedLinks.clear();
    saveLinksOrder();
    initializeCategories();
    filterLinks(document.getElementById('searchInput').value);
    closeBatchCategoryModalFunc();
    exitBatchMode();
    showNotification(`已更新 ${count} 个链接的分类`, 'success');
}

// 打开批量修改标签模态框
function openBatchTagsModal() {
    const count = selectedLinks.size;
    if (count === 0) {
        showNotification('请先选择要修改的链接', 'error');
        return;
    }
    
    // 清空输入框
    document.getElementById('batchTagsInput').value = '';
    
    document.getElementById('batchTagsModal').style.display = 'flex';
}

// 关闭批量修改标签模态框
function closeBatchTagsModalFunc() {
    document.getElementById('batchTagsModal').style.display = 'none';
}

// 打开批量设置分享模态框
function openBatchShareModal() {
    const count = selectedLinks.size;
    if (count === 0) {
        showNotification('请先选择要设置的链接', 'error');
        return;
    }
    
    // 重置表单
    document.getElementById('batchShareForm').reset();
    document.querySelector('input[name="shareSetting"][value="allow"]').checked = true;
    
    document.getElementById('batchShareModal').style.display = 'flex';
}

// 关闭批量设置分享模态框
function closeBatchShareModalFunc() {
    document.getElementById('batchShareModal').style.display = 'none';
}

// 批量设置分享
function batchSetShare() {
    const count = selectedLinks.size;
    if (count === 0) {
        showNotification('请先选择要设置的链接', 'error');
        return;
    }
    
    const shareSetting = document.querySelector('input[name="shareSetting"]:checked').value;
    const isPrivate = shareSetting === 'private';
    
    // 更新选中的链接
    selectedLinks.forEach(url => {
        const link = allLinks.find(l => l.url === url);
        if (link) {
            if (isPrivate) {
                link.private = true;
            } else {
                // 允许分享时，删除private属性
                delete link.private;
            }
        }
    });
    
    selectedLinks.clear();
    saveLinksOrder();
    filterLinks(document.getElementById('searchInput').value);
    closeBatchShareModalFunc();
    exitBatchMode();
    showNotification(`已更新 ${count} 个链接的分享设置`, 'success');
}

// 关闭批量修改标签模态框
function closeBatchTagsModalFunc() {
    document.getElementById('batchTagsModal').style.display = 'none';
}

// 批量修改标签
function batchChangeTags() {
    const tagsInput = document.getElementById('batchTagsInput').value.trim();
    const count = selectedLinks.size;
    
    if (count === 0) {
        showNotification('请先选择要修改的链接', 'error');
        return;
    }
    
    // 解析标签（支持逗号和空格分隔）
    const tags = tagsInput ? tagsInput.split(/[,\s]+/).map(t => t.trim()).filter(t => t) : [];
    
    // 更新选中链接的标签
    selectedLinks.forEach(url => {
        const link = allLinks.find(l => l.url === url);
        if (link) {
            if (tags.length > 0) {
                link.tags = tags;
            } else {
                // 如果标签为空，删除tags字段
                delete link.tags;
            }
        }
    });
    
    selectedLinks.clear();
    saveLinksOrder();
    updateAllTags();
    updateTagFilters();
    filterLinks(document.getElementById('searchInput').value);
    closeBatchTagsModalFunc();
    exitBatchMode();
    showNotification(`已更新 ${count} 个链接的标签`, 'success');
}

// 导出选中的链接
function exportSelectedLinks() {
    const count = selectedLinks.size;
    if (count === 0) {
        showNotification('请先选择要导出的链接', 'error');
        return;
    }
    
    const selectedLinksData = allLinks.filter(link => selectedLinks.has(link.url));
    const exportData = {
        version: '1.0',
        exportDate: new Date().toISOString(),
        links: selectedLinksData,
        metadata: {
            totalLinks: selectedLinksData.length,
            note: '部分导出'
        }
    };
    
    const dataStr = JSON.stringify(exportData, null, 2);
    const dataBlob = new Blob([dataStr], { type: 'application/json' });
    const url = URL.createObjectURL(dataBlob);
    const link = document.createElement('a');
    link.href = url;
    const dateStr = new Date().toISOString().split('T')[0];
    link.download = `links-selected-${dateStr}.json`;
    link.click();
    URL.revokeObjectURL(url);
    
    showNotification(`已导出 ${count} 个链接`, 'success');
}

// 设置排序功能
function setupSort() {
    const sortSelect = document.getElementById('sortSelect');
    const sortOrderBtn = document.getElementById('sortOrderBtn');
    const sortOrderIcon = document.getElementById('sortOrderIcon');
    
    if (sortSelect) {
        sortSelect.value = sortBy;
        sortSelect.addEventListener('change', (e) => {
            sortBy = e.target.value;
            saveSortSettings();
            filterLinks(document.getElementById('searchInput').value);
        });
    }
    
    if (sortOrderBtn) {
        updateSortOrderIcon();
        sortOrderBtn.addEventListener('click', () => {
            sortOrder = sortOrder === 'asc' ? 'desc' : 'asc';
            saveSortSettings();
            updateSortOrderIcon();
            filterLinks(document.getElementById('searchInput').value);
        });
    }
}

// 更新排序顺序图标
function updateSortOrderIcon() {
    const sortOrderIcon = document.getElementById('sortOrderIcon');
    if (sortOrderIcon) {
        if (sortOrder === 'asc') {
            sortOrderIcon.innerHTML = '<polyline points="18 15 12 9 6 15"></polyline>';
        } else {
            sortOrderIcon.innerHTML = '<polyline points="6 9 12 15 18 9"></polyline>';
        }
    }
}

// 保存排序设置
function saveSortSettings() {
    localStorage.setItem('linkSortBy', sortBy);
    localStorage.setItem('linkSortOrder', sortOrder);
}

// 加载排序设置
function loadSortSettings() {
    const savedSortBy = localStorage.getItem('linkSortBy');
    const savedSortOrder = localStorage.getItem('linkSortOrder');
    
    if (savedSortBy) {
        sortBy = savedSortBy;
        const sortSelect = document.getElementById('sortSelect');
        if (sortSelect) {
            sortSelect.value = sortBy;
        }
    }
    
    if (savedSortOrder) {
        sortOrder = savedSortOrder;
    }
    
    updateSortOrderIcon();
    
    // 如果当前不是自定义排序，应用排序
    if (sortBy !== 'custom') {
        applySort();
        renderLinks();
    }
}

// 切换收藏状态
async function toggleFavorite(url) {
    if (favoriteLinks.has(url)) {
        favoriteLinks.delete(url);
    } else {
        favoriteLinks.add(url);
    }
    await saveFavoriteLinks();
    renderLinks();
}

// 保存收藏链接
async function saveFavoriteLinks() {
    // 保存到 localStorage
    localStorage.setItem(getUserStorageKey('favoriteLinks'), JSON.stringify(Array.from(favoriteLinks)));
    
    // 如果使用后端 API，同时保存到数据库
    if (useBackendAPI && api && currentUserId) {
        try {
            await api.updateUserSettings(currentUserId, {
                favorite_links: Array.from(favoriteLinks)
            });
        } catch (error) {
            console.error('保存收藏链接到数据库失败:', error);
            // 不抛出错误，因为 localStorage 已经保存了
        }
    }
}

// 加载收藏链接
async function loadFavoriteLinks() {
    if (useBackendAPI && api && currentUserId) {
        try {
            const settings = await api.getUserSettings(currentUserId);
            favoriteLinks = new Set(settings.favorite_links || []);
            return;
        } catch (error) {
            console.error('从后端加载收藏链接失败，切换到 localStorage:', error);
            useBackendAPI = false;
        }
    }
    
    // 使用 localStorage（原有逻辑）
    const saved = localStorage.getItem(getUserStorageKey('favoriteLinks'));
    if (saved) {
        try {
            favoriteLinks = new Set(JSON.parse(saved));
        } catch (e) {
            console.error('加载收藏链接失败:', e);
            favoriteLinks = new Set();
        }
    }
}

// 加载页面标题
async function loadPageTitle() {
    let pageTitle = '我的链接门户';
    let pageSubtitle = '快速访问常用网站';
    
    if (useBackendAPI && api && currentUserId) {
        try {
            const settings = await api.getUserSettings(currentUserId);
            if (settings.page_title) {
                pageTitle = settings.page_title;
            }
            if (settings.page_subtitle) {
                pageSubtitle = settings.page_subtitle;
            }
        } catch (error) {
            console.error('从后端加载页面标题失败，使用 localStorage:', error);
        }
    }
    
    // 使用 localStorage（原有逻辑）
    const savedTitle = localStorage.getItem(getUserStorageKey('pageTitle'));
    if (savedTitle) {
        try {
            pageTitle = JSON.parse(savedTitle);
        } catch (e) {
            console.error('加载页面标题失败:', e);
        }
    }
    
    const savedSubtitle = localStorage.getItem(getUserStorageKey('pageSubtitle'));
    if (savedSubtitle) {
        try {
            pageSubtitle = JSON.parse(savedSubtitle);
        } catch (e) {
            console.error('加载副标题失败:', e);
        }
    }
    
    // 更新页面标题和副标题
    updatePageTitle(pageTitle);
    updatePageSubtitle(pageSubtitle);
}

// 更新页面副标题显示
function updatePageSubtitle(subtitle) {
    const subtitleElement = document.querySelector('.header-left .subtitle');
    if (subtitleElement) {
        subtitleElement.textContent = subtitle;
    }
}

// 保存页面标题
async function savePageTitle(title) {
    if (!title || title.trim() === '') {
        title = '我的链接门户';
    }
    
    // 保存到 localStorage
    localStorage.setItem(getUserStorageKey('pageTitle'), JSON.stringify(title));
    
    // 保存到后端
    if (useBackendAPI && api && currentUserId) {
        try {
            await api.updateUserSettings(currentUserId, {
                page_title: title
            });
        } catch (error) {
            console.error('保存页面标题到数据库失败:', error);
            // 不抛出错误，因为 localStorage 已经保存了
        }
    }
    
    // 更新页面标题
    updatePageTitle(title);
}

// 更新页面标题显示
function updatePageTitle(title) {
    // 更新 HTML title 标签
    document.title = `${title} - Link Portal`;
    
    // 更新页面上的 h1 标题
    const titleElement = document.querySelector('.header-left .title');
    if (titleElement) {
        titleElement.textContent = title;
    }
}

// 设置标题编辑功能
function setupTitleEdit() {
    const titleEditBtn = document.getElementById('titleEditBtn');
    const titleElement = document.querySelector('.header-left .title');
    
    if (!titleEditBtn || !titleElement) return;
    
    titleEditBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        editTitleInline();
    });
    
    // 设置副标题编辑功能
    const subtitleEditBtn = document.getElementById('subtitleEditBtn');
    const subtitleElement = document.querySelector('.header-left .subtitle');
    
    if (subtitleEditBtn && subtitleElement) {
        subtitleEditBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            editSubtitleInline();
        });
    }
}

// 内联编辑标题
function editTitleInline() {
    const titleElement = document.querySelector('.header-left .title');
    if (!titleElement) return;
    
    const currentTitle = titleElement.textContent;
    const titleWrapper = titleElement.parentElement;
    
    // 创建输入框
    const input = document.createElement('input');
    input.type = 'text';
    input.value = currentTitle;
    input.className = 'title-edit-input';
    // 检测是否为深色模式
    const isDarkMode = document.body.classList.contains('dark-mode');
    const bgColor = isDarkMode ? 'var(--card-bg)' : 'rgba(255, 255, 255, 0.2)';
    const borderColor = isDarkMode ? 'var(--primary-color)' : 'rgba(255, 255, 255, 0.5)';
    const textColor = isDarkMode ? 'var(--text-primary)' : 'white';
    
    input.style.cssText = `
        font-size: 3rem;
        font-weight: 700;
        background: ${bgColor};
        backdrop-filter: blur(10px);
        border: 2px solid ${borderColor};
        border-radius: 8px;
        padding: 8px 16px;
        color: ${textColor};
        text-align: center;
        width: 100%;
        max-width: 600px;
        outline: none;
        text-shadow: 0 2px 10px rgba(0, 0, 0, 0.2);
        font-family: inherit;
    `;
    
    // 替换标题为输入框
    titleElement.style.display = 'none';
    titleWrapper.insertBefore(input, titleElement);
    input.focus();
    input.select();
    
    // 保存函数
    const saveTitle = async () => {
        const newTitle = input.value.trim();
        if (newTitle && newTitle !== currentTitle) {
            await savePageTitle(newTitle);
            showNotification('页面标题已更新', 'success');
        }
        // 恢复标题显示
        titleElement.textContent = newTitle || currentTitle;
        titleElement.style.display = '';
        input.remove();
    };
    
    // 取消函数
    const cancelEdit = () => {
        titleElement.style.display = '';
        input.remove();
    };
    
    // 回车保存
    input.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') {
            e.preventDefault();
            saveTitle();
        } else if (e.key === 'Escape') {
            e.preventDefault();
            cancelEdit();
        }
    });
    
    // 失去焦点时保存
    input.addEventListener('blur', () => {
        saveTitle();
    });
}

// 内联编辑副标题
function editSubtitleInline() {
    const subtitleElement = document.querySelector('.header-left .subtitle');
    if (!subtitleElement) return;
    
    const currentSubtitle = subtitleElement.textContent;
    const subtitleWrapper = subtitleElement.parentElement;
    
    // 创建输入框
    const input = document.createElement('input');
    input.type = 'text';
    input.value = currentSubtitle;
    input.className = 'subtitle-edit-input';
    
    // 检测是否为深色模式
    const isDarkMode = document.body.classList.contains('dark-mode');
    const bgColor = isDarkMode ? 'var(--card-bg)' : 'rgba(255, 255, 255, 0.2)';
    const borderColor = isDarkMode ? 'var(--primary-color)' : 'rgba(255, 255, 255, 0.5)';
    const textColor = isDarkMode ? 'var(--text-primary)' : 'white';
    
    input.style.cssText = `
        font-size: 1.2rem;
        font-weight: 300;
        background: ${bgColor};
        backdrop-filter: blur(10px);
        border: 2px solid ${borderColor};
        border-radius: 8px;
        padding: 6px 12px;
        color: ${textColor};
        text-align: center;
        width: 100%;
        max-width: 400px;
        outline: none;
        opacity: 0.9;
        font-family: inherit;
    `;
    
    // 替换副标题为输入框
    subtitleElement.style.display = 'none';
    subtitleWrapper.insertBefore(input, subtitleElement);
    input.focus();
    input.select();
    
    // 保存函数
    const saveSubtitle = () => {
        const newSubtitle = input.value.trim();
        // 保存到 localStorage
        localStorage.setItem(getUserStorageKey('pageSubtitle'), JSON.stringify(newSubtitle || currentSubtitle));
        
        // 保存到后端
        if (useBackendAPI && api && currentUserId) {
            try {
                api.updateUserSettings(currentUserId, {
                    page_subtitle: newSubtitle || currentSubtitle
                }).catch(err => console.error('保存副标题失败:', err));
            } catch (error) {
                console.error('保存副标题到数据库失败:', error);
            }
        }
        
        // 恢复副标题显示
        subtitleElement.textContent = newSubtitle || currentSubtitle;
        subtitleElement.style.display = '';
        input.remove();
        
        if (newSubtitle && newSubtitle !== currentSubtitle) {
            showNotification('副标题已更新', 'success');
        }
    };
    
    // 取消函数
    const cancelEdit = () => {
        subtitleElement.style.display = '';
        input.remove();
    };
    
    // 回车保存
    input.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') {
            e.preventDefault();
            saveSubtitle();
        } else if (e.key === 'Escape') {
            e.preventDefault();
            cancelEdit();
        }
    });
    
    // 失去焦点时保存
    input.addEventListener('blur', () => {
        saveSubtitle();
    });
}

// 设置主题切换
function setupThemeToggle() {
    const themeToggleBtn = document.getElementById('themeToggleBtn');
    if (themeToggleBtn) {
        themeToggleBtn.addEventListener('click', () => {
            toggleDarkMode();
        });
    }
    updateThemeIcon();
}

// 切换深色模式
function toggleDarkMode() {
    darkMode = !darkMode;
    saveDarkMode();
    applyDarkMode();
    updateThemeIcon();
}

// 应用深色模式
function applyDarkMode() {
    if (darkMode) {
        document.documentElement.classList.add('dark-mode');
    } else {
        document.documentElement.classList.remove('dark-mode');
    }
}

// 更新主题图标
function updateThemeIcon() {
    const themeIcon = document.getElementById('themeIcon');
    if (themeIcon) {
        if (darkMode) {
            // 月亮图标（深色模式）
            themeIcon.innerHTML = `
                <path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"></path>
            `;
        } else {
            // 太阳图标（浅色模式）
            themeIcon.innerHTML = `
                <circle cx="12" cy="12" r="5"></circle>
                <line x1="12" y1="1" x2="12" y2="3"></line>
                <line x1="12" y1="21" x2="12" y2="23"></line>
                <line x1="4.22" y1="4.22" x2="5.64" y2="5.64"></line>
                <line x1="18.36" y1="18.36" x2="19.78" y2="19.78"></line>
                <line x1="1" y1="12" x2="3" y2="12"></line>
                <line x1="21" y1="12" x2="23" y2="12"></line>
                <line x1="4.22" y1="19.78" x2="5.64" y2="18.36"></line>
                <line x1="18.36" y1="5.64" x2="19.78" y2="4.22"></line>
            `;
        }
    }
}

// 保存深色模式设置
function saveDarkMode() {
    localStorage.setItem('darkMode', darkMode ? 'true' : 'false');
}

// 加载深色模式设置
function loadDarkMode() {
    const saved = localStorage.getItem('darkMode');
    if (saved === 'true') {
        darkMode = true;
    } else {
        // 检查系统偏好
        if (window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches) {
            darkMode = true;
        }
    }
    applyDarkMode();
}

// 设置自定义主题颜色
function setupThemeColor() {
    const themeColorBtn = document.getElementById('themeColorBtn');
    const themeColorModal = document.getElementById('themeColorModal');
    const closeThemeColorModal = document.getElementById('closeThemeColorModal');
    const applyThemeBtn = document.getElementById('applyThemeBtn');
    const resetThemeBtn = document.getElementById('resetThemeBtn');
    
    if (themeColorBtn) {
        themeColorBtn.addEventListener('click', () => {
            openThemeColorModal();
        });
    }
    
    if (closeThemeColorModal) {
        closeThemeColorModal.addEventListener('click', closeThemeColorModalFunc);
    }
    
    if (themeColorModal) {
        themeColorModal.addEventListener('click', (e) => {
            if (e.target === themeColorModal) {
                closeThemeColorModalFunc();
            }
        });
    }
    
    // 预设主题
    document.querySelectorAll('.preset-theme').forEach(btn => {
        btn.addEventListener('click', () => {
            const theme = btn.dataset.theme;
            applyPresetTheme(theme);
        });
    });
    
    // 重置主题
    if (resetThemeBtn) {
        resetThemeBtn.addEventListener('click', () => {
            resetTheme();
        });
    }
    
    // 实时应用自定义颜色（选择后自动应用）
    const customPrimaryColor = document.getElementById('customPrimaryColor');
    const customGradientStart = document.getElementById('customGradientStart');
    const customGradientEnd = document.getElementById('customGradientEnd');
    
    if (customPrimaryColor) {
        customPrimaryColor.addEventListener('change', applyCustomThemeOnChange);
    }
    if (customGradientStart) {
        customGradientStart.addEventListener('change', applyCustomThemeOnChange);
    }
    if (customGradientEnd) {
        customGradientEnd.addEventListener('change', applyCustomThemeOnChange);
    }
}

// 打开主题颜色模态框
function openThemeColorModal() {
    // 加载当前主题设置
    if (customTheme) {
        document.getElementById('customPrimaryColor').value = customTheme.primaryColor || '#6366f1';
        document.getElementById('customGradientStart').value = customTheme.gradientStart || '#667eea';
        document.getElementById('customGradientEnd').value = customTheme.gradientEnd || '#764ba2';
    }
    document.getElementById('themeColorModal').style.display = 'flex';
}

// 关闭主题颜色模态框
function closeThemeColorModalFunc() {
    document.getElementById('themeColorModal').style.display = 'none';
}

// 应用预设主题
function applyPresetTheme(themeName) {
    const themes = {
        default: {
            primaryColor: '#6366f1',
            gradientStart: '#667eea',
            gradientEnd: '#764ba2'
        },
        blue: {
            primaryColor: '#3b82f6',
            gradientStart: '#3b82f6',
            gradientEnd: '#1e40af'
        },
        green: {
            primaryColor: '#10b981',
            gradientStart: '#10b981',
            gradientEnd: '#059669'
        },
        red: {
            primaryColor: '#ef4444',
            gradientStart: '#ef4444',
            gradientEnd: '#dc2626'
        },
        orange: {
            primaryColor: '#f59e0b',
            gradientStart: '#f59e0b',
            gradientEnd: '#d97706'
        },
        purple: {
            primaryColor: '#8b5cf6',
            gradientStart: '#8b5cf6',
            gradientEnd: '#7c3aed'
        }
    };
    
    const theme = themes[themeName];
    if (theme) {
        customTheme = { ...theme };
        saveCustomTheme();
        applyThemeColors();
        closeThemeColorModalFunc();
        showNotification(`已应用${themeName}主题`, 'success');
    }
}

// 自定义颜色改变时自动应用
function applyCustomThemeOnChange() {
    const customPrimaryColor = document.getElementById('customPrimaryColor');
    const customGradientStart = document.getElementById('customGradientStart');
    const customGradientEnd = document.getElementById('customGradientEnd');
    
    if (!customPrimaryColor || !customGradientStart || !customGradientEnd) {
        return;
    }
    
    const primaryColor = customPrimaryColor.value.trim();
    const gradientStart = customGradientStart.value.trim();
    const gradientEnd = customGradientEnd.value.trim();
    
    if (!primaryColor || !gradientStart || !gradientEnd) {
        return;
    }
    
    // 验证颜色格式
    const colorRegex = /^#([A-Fa-f0-9]{6}|[A-Fa-f0-9]{3})$/;
    if (!colorRegex.test(primaryColor) || !colorRegex.test(gradientStart) || !colorRegex.test(gradientEnd)) {
        return;
    }
    
    customTheme = {
        primaryColor,
        gradientStart,
        gradientEnd
    };
    
    saveCustomTheme();
    applyThemeColors();
    // 使用防抖，避免频繁通知
    clearTimeout(window.themeChangeTimeout);
    window.themeChangeTimeout = setTimeout(() => {
        showNotification('主题已自动应用', 'success');
    }, 500);
}

// 应用主题颜色
function applyThemeColors() {
    if (customTheme) {
        document.documentElement.style.setProperty('--primary-color', customTheme.primaryColor);
        document.documentElement.style.setProperty('--primary-hover', adjustBrightness(customTheme.primaryColor, -10));
        document.body.style.background = `linear-gradient(135deg, ${customTheme.gradientStart} 0%, ${customTheme.gradientEnd} 100%)`;
        document.body.style.backgroundAttachment = 'fixed';
        document.body.style.backgroundSize = 'cover';
    } else {
        // 重置为默认
        document.documentElement.style.removeProperty('--primary-color');
        document.documentElement.style.removeProperty('--primary-hover');
        document.body.style.background = 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)';
        document.body.style.backgroundAttachment = 'fixed';
        document.body.style.backgroundSize = 'cover';
    }
}

// 重置主题
function resetTheme() {
    customTheme = null;
    saveCustomTheme();
    applyThemeColors();
    document.getElementById('customPrimaryColor').value = '#6366f1';
    document.getElementById('customGradientStart').value = '#667eea';
    document.getElementById('customGradientEnd').value = '#764ba2';
    showNotification('已重置为默认主题', 'success');
}

// 调整颜色亮度
function adjustBrightness(color, percent) {
    const num = parseInt(color.replace('#', ''), 16);
    const amt = Math.round(2.55 * percent);
    const R = Math.min(255, Math.max(0, (num >> 16) + amt));
    const G = Math.min(255, Math.max(0, ((num >> 8) & 0x00FF) + amt));
    const B = Math.min(255, Math.max(0, (num & 0x0000FF) + amt));
    return '#' + (0x1000000 + R * 0x10000 + G * 0x100 + B).toString(16).slice(1);
}

// 保存自定义主题
function saveCustomTheme() {
    if (customTheme) {
        localStorage.setItem('customTheme', JSON.stringify(customTheme));
    } else {
        localStorage.removeItem('customTheme');
    }
}

// 加载自定义主题
function loadCustomTheme() {
    const saved = localStorage.getItem('customTheme');
    if (saved) {
        try {
            customTheme = JSON.parse(saved);
            applyThemeColors();
        } catch (e) {
            console.error('加载自定义主题失败:', e);
            customTheme = null;
        }
    }
}

// 设置键盘快捷键
function setupKeyboardShortcuts() {
    document.addEventListener('keydown', (e) => {
        // 忽略在输入框中的快捷键
        if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA' || e.target.isContentEditable) {
            // 允许 Ctrl/Cmd + A (全选文本)
            if ((e.ctrlKey || e.metaKey) && e.key === 'a') {
                return;
            }
            // 允许 Ctrl/Cmd + C/V/X (复制/粘贴/剪切)
            if ((e.ctrlKey || e.metaKey) && ['c', 'v', 'x'].includes(e.key.toLowerCase())) {
                return;
            }
            // 其他情况阻止快捷键
            return;
        }
        
        // Ctrl/Cmd + K: 聚焦搜索框
        if ((e.ctrlKey || e.metaKey) && e.key === 'k') {
            e.preventDefault();
            const searchInput = document.getElementById('searchInput');
            if (searchInput) {
                searchInput.focus();
                searchInput.select();
            }
            return;
        }
        
        // Ctrl/Cmd + N: 添加新链接
        if ((e.ctrlKey || e.metaKey) && e.key === 'n') {
            e.preventDefault();
            openAddModal();
            return;
        }
        
        // Ctrl/Cmd + B: 切换批量模式
        if ((e.ctrlKey || e.metaKey) && e.key === 'b') {
            e.preventDefault();
            toggleBatchMode();
            return;
        }
        
        // Ctrl/Cmd + D: 切换深色模式
        if ((e.ctrlKey || e.metaKey) && e.key === 'd') {
            e.preventDefault();
            toggleDarkMode();
            return;
        }
        
        // Esc: 关闭模态框或退出批量模式
        if (e.key === 'Escape') {
            // 关闭所有打开的模态框
            const modals = document.querySelectorAll('.modal-overlay');
            let modalClosed = false;
            modals.forEach(modal => {
                if (modal.style.display === 'flex') {
                    modal.style.display = 'none';
                    modalClosed = true;
                }
            });
            
            // 如果批量模式开启，退出批量模式
            if (!modalClosed && batchMode) {
                exitBatchMode();
            }
            return;
        }
        
        // Ctrl/Cmd + F: 聚焦搜索框（备用）
        if ((e.ctrlKey || e.metaKey) && e.key === 'f') {
            e.preventDefault();
            const searchInput = document.getElementById('searchInput');
            if (searchInput) {
                searchInput.focus();
                searchInput.select();
            }
            return;
        }
        
        // Ctrl/Cmd + E: 导出数据
        if ((e.ctrlKey || e.metaKey) && e.key === 'e') {
            e.preventDefault();
            openDataManageModal();
            return;
        }
        
        // Ctrl/Cmd + G: 切换视图（卡片/列表）
        if ((e.ctrlKey || e.metaKey) && e.key === 'g') {
            e.preventDefault();
            if (currentView === 'card') {
                document.getElementById('listViewBtn')?.click();
            } else {
                document.getElementById('cardViewBtn')?.click();
            }
            return;
        }
        
        // 数字键 1-9: 切换到对应分类（如果存在）
        if (e.key >= '1' && e.key <= '9' && !e.ctrlKey && !e.metaKey && !e.altKey && !e.shiftKey) {
            const categoryIndex = parseInt(e.key) - 1;
            const categoryButtons = document.querySelectorAll('.category-btn');
            if (categoryButtons[categoryIndex]) {
                categoryButtons[categoryIndex].click();
            }
            return;
        }
    });
    
    // 显示快捷键提示（可选：在帮助菜单或工具提示中）
    showKeyboardShortcutsHelp();
}

// 设置右键菜单
function setupContextMenu() {
    const contextMenu = document.getElementById('contextMenu');
    let currentLink = null;
    let currentLinkIndex = null;
    
    // 点击其他地方隐藏菜单
    document.addEventListener('click', (e) => {
        if (!contextMenu.contains(e.target)) {
            contextMenu.style.display = 'none';
        }
    });
    
    // 右键菜单项功能
    const contextOpenLink = document.getElementById('contextOpenLink');
    const contextCopyLink = document.getElementById('contextCopyLink');
    const contextCopyMarkdown = document.getElementById('contextCopyMarkdown');
    const contextEditLink = document.getElementById('contextEditLink');
    const contextToggleFavorite = document.getElementById('contextToggleFavorite');
    const contextDeleteLink = document.getElementById('contextDeleteLink');
    const contextFavoriteText = document.getElementById('contextFavoriteText');
    
    if (contextOpenLink) {
        contextOpenLink.addEventListener('click', () => {
            if (currentLink) {
                recordLinkAccess(currentLink.url);
                window.open(currentLink.url, '_blank');
                contextMenu.style.display = 'none';
            }
        });
    }
    
    if (contextCopyLink) {
        contextCopyLink.addEventListener('click', async () => {
            if (currentLink) {
                try {
                    await navigator.clipboard.writeText(currentLink.url);
                    showNotification('链接已复制到剪贴板', 'success');
                    contextMenu.style.display = 'none';
                } catch (err) {
                    // 降级方案
                    const textarea = document.createElement('textarea');
                    textarea.value = currentLink.url;
                    document.body.appendChild(textarea);
                    textarea.select();
                    document.execCommand('copy');
                    document.body.removeChild(textarea);
                    showNotification('链接已复制到剪贴板', 'success');
                    contextMenu.style.display = 'none';
                }
            }
        });
    }
    
    if (contextCopyMarkdown) {
        contextCopyMarkdown.addEventListener('click', async () => {
            if (currentLink) {
                const markdown = `[${currentLink.name}](${currentLink.url})`;
                try {
                    await navigator.clipboard.writeText(markdown);
                    showNotification('Markdown格式已复制', 'success');
                    contextMenu.style.display = 'none';
                } catch (err) {
                    const textarea = document.createElement('textarea');
                    textarea.value = markdown;
                    document.body.appendChild(textarea);
                    textarea.select();
                    document.execCommand('copy');
                    document.body.removeChild(textarea);
                    showNotification('Markdown格式已复制', 'success');
                    contextMenu.style.display = 'none';
                }
            }
        });
    }
    
    if (contextEditLink) {
        contextEditLink.addEventListener('click', () => {
            if (currentLinkIndex !== null) {
                openEditModal(currentLinkIndex);
                contextMenu.style.display = 'none';
            }
        });
    }
    
    if (contextToggleFavorite) {
        contextToggleFavorite.addEventListener('click', () => {
            if (currentLink) {
                toggleFavorite(currentLink.url);
                contextMenu.style.display = 'none';
            }
        });
    }
    
    if (contextDeleteLink) {
        contextDeleteLink.addEventListener('click', () => {
            if (currentLinkIndex !== null) {
                openDeleteModal(currentLinkIndex, currentLink.name);
                contextMenu.style.display = 'none';
            }
        });
    }
    
    // 返回显示菜单的函数
    return (link, linkIndex, event) => {
        event.preventDefault();
        event.stopPropagation();
        
        currentLink = link;
        currentLinkIndex = linkIndex;
        
        // 更新收藏按钮文本
        if (contextFavoriteText) {
            contextFavoriteText.textContent = favoriteLinks.has(link.url) ? '取消收藏' : '收藏';
        }
        
        // 显示菜单
        contextMenu.style.display = 'block';
        
        // 计算菜单位置
        const x = event.clientX;
        const y = event.clientY;
        const menuWidth = contextMenu.offsetWidth;
        const menuHeight = contextMenu.offsetHeight;
        const windowWidth = window.innerWidth;
        const windowHeight = window.innerHeight;
        
        let left = x;
        let top = y;
        
        // 如果菜单超出右边界，向左调整
        if (x + menuWidth > windowWidth) {
            left = windowWidth - menuWidth - 10;
        }
        
        // 如果菜单超出下边界，向上调整
        if (y + menuHeight > windowHeight) {
            top = windowHeight - menuHeight - 10;
        }
        
        contextMenu.style.left = `${left}px`;
        contextMenu.style.top = `${top}px`;
    };
}

// 全局右键菜单显示函数
let showContextMenu = null;

// 显示快捷键帮助（可以通过帮助按钮触发）
function showKeyboardShortcutsHelp() {
    // 可以创建一个帮助模态框，这里先不实现
    // 用户可以通过 Ctrl+? 或帮助按钮查看
}

// 添加快捷键帮助到控制台（用于调试）

// 记录链接访问
async function recordLinkAccess(url) {
    const link = allLinks.find(l => l.url === url);
    if (link) {
        // 增加访问次数（统一使用clicks字段）
        link.clicks = (link.clicks || 0) + 1;
        // 更新最后访问时间（统一使用lastAccess字段）
        link.lastAccess = Date.now();
        
        // 兼容旧字段名
        if (link.clickCount !== undefined) {
            link.clicks = link.clickCount;
            delete link.clickCount;
        }
        if (link.lastAccessTime !== undefined) {
            link.lastAccess = link.lastAccessTime;
            delete link.lastAccessTime;
        }
        
        // 如果使用后端 API，更新链接的点击次数
        if (useBackendAPI && api && currentUserId && link.id) {
            try {
                await api.clickLink(currentUserId, link.id);
            } catch (error) {
                console.error('记录链接点击失败:', error);
            }
        }
        
        // 添加到访问历史
        await addToAccessHistory(url, link.name);
        
        // 保存到本地存储
        saveLinksOrder();
    }
}

// 添加到访问历史
async function addToAccessHistory(url, name) {
    // 移除已存在的相同URL记录
    accessHistory = accessHistory.filter(h => h.url !== url);
    
    // 添加到开头
    const historyItem = {
        url: url,
        name: name,
        timestamp: Date.now()
    };
    accessHistory.unshift(historyItem);
    
    // 限制历史记录数量（最多100条）
    if (accessHistory.length > 100) {
        accessHistory = accessHistory.slice(0, 100);
    }
    
    // 如果使用后端 API，保存到数据库
    if (useBackendAPI && api && currentUserId) {
        try {
            await api.createAccessHistory(currentUserId, url, name);
        } catch (error) {
            console.error('保存访问历史到数据库失败:', error);
            // 不抛出错误，因为 localStorage 已经保存了
        }
    }
    
    // 保存到 localStorage
    saveAccessHistory();
}

// 设置访问历史功能
function setupAccessHistory() {
    // 在头部添加历史记录按钮（如果还没有）
    const headerActions = document.querySelector('.header-actions');
    if (headerActions && !document.getElementById('accessHistoryBtn')) {
        const historyBtn = document.createElement('button');
        historyBtn.id = 'accessHistoryBtn';
        historyBtn.className = 'history-btn';
        historyBtn.title = '访问历史';
        historyBtn.innerHTML = `
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <circle cx="12" cy="12" r="10"></circle>
                <polyline points="12 6 12 12 16 14"></polyline>
            </svg>
            历史
        `;
        historyBtn.addEventListener('click', showAccessHistory);
        headerActions.insertBefore(historyBtn, headerActions.firstChild);
    }
}

// 显示访问历史
function showAccessHistory() {
    // 创建历史记录模态框
    const modal = document.createElement('div');
    modal.className = 'modal-overlay';
    modal.id = 'accessHistoryModal';
    
    const historyList = accessHistory.length > 0 
        ? accessHistory.map((item, index) => {
            const link = allLinks.find(l => l.url === item.url);
            const firstLetter = item.name.charAt(0).toUpperCase();
            return `
                <div class="history-item" data-url="${item.url}" data-index="${index}">
                    <div class="history-icon">
                        ${link && link.icon 
                            ? `<img src="${link.icon}" alt="${item.name}" onerror="this.style.display='none'; this.nextElementSibling.style.display='flex';">
                               <div class="icon-placeholder" style="display: none;">${firstLetter}</div>`
                            : `<div class="icon-placeholder">${firstLetter}</div>`
                        }
                    </div>
                    <div class="history-info">
                        <div class="history-name">${item.name}</div>
                        <div class="history-url">${getDomain(item.url)}</div>
                        <div class="history-time">${formatRelativeTime(item.timestamp)}</div>
                    </div>
                    <div class="history-actions">
                        <button class="history-action-btn" data-url="${item.url}" title="打开链接">
                            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                                <path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"></path>
                                <polyline points="15 3 21 3 21 9"></polyline>
                                <line x1="10" y1="14" x2="21" y2="3"></line>
                            </svg>
                        </button>
                        <button class="history-action-btn delete-history-btn" data-index="${index}" title="删除记录">
                            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                                <polyline points="3 6 5 6 21 6"></polyline>
                                <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path>
                            </svg>
                        </button>
                    </div>
                </div>
            `;
        }).join('')
        : '<div class="empty-history">暂无访问历史</div>';
    
    modal.innerHTML = `
        <div class="modal-content modal-large">
            <div class="modal-header">
                <h2>访问历史</h2>
                <div class="history-header-actions">
                    <button class="btn-cancel" id="clearHistoryBtn">清空历史</button>
                    <button class="modal-close" id="closeHistoryModal">
                        <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                            <line x1="18" y1="6" x2="6" y2="18"></line>
                            <line x1="6" y1="6" x2="18" y2="18"></line>
                        </svg>
                    </button>
                </div>
            </div>
            <div class="modal-body">
                <div class="history-list">
                    ${historyList}
                </div>
            </div>
        </div>
    `;
    
    document.body.appendChild(modal);
    modal.style.display = 'flex';
    
    // 关闭按钮
    modal.querySelector('#closeHistoryModal').addEventListener('click', () => {
        document.body.removeChild(modal);
    });
    
    modal.addEventListener('click', (e) => {
        if (e.target === modal) {
            document.body.removeChild(modal);
        }
    });
    
    // 清空历史
    modal.querySelector('#clearHistoryBtn').addEventListener('click', () => {
        if (confirm('确定要清空所有访问历史吗？')) {
            accessHistory = [];
            saveAccessHistory();
            document.body.removeChild(modal);
            showNotification('访问历史已清空', 'success');
        }
    });
    
    // 打开链接
    modal.querySelectorAll('.history-action-btn:not(.delete-history-btn)').forEach(btn => {
        btn.addEventListener('click', (e) => {
            e.stopPropagation();
            const url = btn.dataset.url;
            window.open(url, '_blank');
            // 更新访问时间
            const item = accessHistory.find(h => h.url === url);
            if (item) {
                item.timestamp = Date.now();
                // 重新排序
                accessHistory.sort((a, b) => b.timestamp - a.timestamp);
                saveAccessHistory();
            }
        });
    });
    
    // 删除历史记录
    modal.querySelectorAll('.delete-history-btn').forEach(btn => {
        btn.addEventListener('click', (e) => {
            e.stopPropagation();
            const index = parseInt(btn.dataset.index);
            accessHistory.splice(index, 1);
            saveAccessHistory();
            // 重新显示
            document.body.removeChild(modal);
            showAccessHistory();
            showNotification('已删除历史记录', 'success');
        });
    });
    
    // 点击历史项打开链接
    modal.querySelectorAll('.history-item').forEach(item => {
        item.addEventListener('click', (e) => {
            if (!e.target.closest('.history-actions')) {
                const url = item.dataset.url;
                window.open(url, '_blank');
            }
        });
    });
}

// 保存访问历史（主要用于 localStorage，数据库保存由 addToAccessHistory 完成）
function saveAccessHistory() {
    localStorage.setItem(getUserStorageKey('accessHistory'), JSON.stringify(accessHistory));
    // 注意：数据库的访问历史是通过 addToAccessHistory 中的 createAccessHistory API 保存的
    // 这里只保存到 localStorage，因为访问历史是追加式的，不需要同步整个数组
}

// 加载访问历史
async function loadAccessHistory() {
    if (useBackendAPI && api && currentUserId) {
        try {
            const history = await api.getAccessHistory(currentUserId, 100);
            accessHistory = history.map(h => ({
                url: h.link_url,
                name: h.link_name,
                timestamp: new Date(h.timestamp).getTime()
            }));
            return;
        } catch (error) {
            console.error('从后端加载访问历史失败，切换到 localStorage:', error);
            useBackendAPI = false;
        }
    }
    
    // 使用 localStorage（原有逻辑）
    const saved = localStorage.getItem(getUserStorageKey('accessHistory'));
    if (saved) {
        try {
            accessHistory = JSON.parse(saved);
        } catch (e) {
            console.error('加载访问历史失败:', e);
            accessHistory = [];
        }
    }
}

// 格式化访问时间
function formatAccessTime(timestamp) {
    const date = new Date(timestamp);
    return date.toLocaleString('zh-CN', {
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
        hour: '2-digit',
        minute: '2-digit'
    });
}

// 格式化相对时间
function formatRelativeTime(timestamp) {
    const now = Date.now();
    const diff = now - timestamp;
    const seconds = Math.floor(diff / 1000);
    const minutes = Math.floor(seconds / 60);
    const hours = Math.floor(minutes / 60);
    const days = Math.floor(hours / 24);
    
    if (days > 0) {
        return `${days}天前`;
    } else if (hours > 0) {
        return `${hours}小时前`;
    } else if (minutes > 0) {
        return `${minutes}分钟前`;
    } else {
        return '刚刚';
    }
}

// 更新所有标签
function updateAllTags() {
    // 确保 allTags 已初始化
    if (!allTags) {
        allTags = new Set();
    }
    
    allTags.clear();
    allLinks.forEach(link => {
        if (link.tags && Array.isArray(link.tags)) {
            link.tags.forEach(tag => allTags.add(tag));
        }
    });
    saveAllTags();
}

// 保存所有标签
function saveAllTags() {
    // 确保 allTags 已初始化
    if (!allTags) {
        allTags = new Set();
    }
    localStorage.setItem(getUserStorageKey('allTags'), JSON.stringify(Array.from(allTags)));
}

// 加载所有标签
function loadAllTags() {
    // 确保 allTags 已初始化
    if (!allTags) {
        allTags = new Set();
    }
    
    const saved = localStorage.getItem(getUserStorageKey('allTags'));
    if (saved) {
        try {
            const parsedTags = JSON.parse(saved);
            allTags = new Set(parsedTags);
        } catch (e) {
            console.error('加载标签失败:', e);
            allTags = new Set();
        }
    }
    // 从现有链接中提取标签
    updateAllTags();
}

// 更新标签过滤按钮
function updateTagFilters() {
    const categoriesContainer = document.getElementById('categories');
    // 移除旧的标签过滤按钮
    document.querySelectorAll('.tag-filter-btn').forEach(btn => btn.remove());
    
    // 添加标签过滤按钮
    if (allTags.size > 0) {
        const tagsArray = Array.from(allTags).sort();
        tagsArray.forEach(tag => {
            const btn = document.createElement('button');
            btn.className = 'category-btn tag-filter-btn';
            btn.dataset.tag = tag;
            btn.textContent = `#${tag}`;
            btn.title = `过滤标签：${tag}`;
            btn.addEventListener('click', () => {
                currentTagFilter = tag;
                document.querySelectorAll('.category-btn').forEach(b => b.classList.remove('active'));
                document.querySelectorAll('.tag-filter-btn').forEach(b => b.classList.remove('active'));
                btn.classList.add('active');
                filterLinks();
            });
            categoriesContainer.appendChild(btn);
        });
    }
}

// 链接检测功能已移除

// 绑定标签点击事件（用于过滤）
function setupTagClick() {
    document.addEventListener('click', (e) => {
        if (e.target.classList.contains('tag-badge')) {
            const tag = e.target.dataset.tag;
            if (tag) {
                // 找到对应的标签过滤按钮并点击
                const tagBtn = document.querySelector(`.tag-filter-btn[data-tag="${tag}"]`);
                if (tagBtn) {
                    tagBtn.click();
                } else {
                    // 如果按钮不存在，创建并点击
                    currentTagFilter = tag;
                    updateTagFilters();
                    const newTagBtn = document.querySelector(`.tag-filter-btn[data-tag="${tag}"]`);
                    if (newTagBtn) {
                        newTagBtn.click();
                    }
                }
            }
        }
    });
}

// 设置快速添加功能
function setupQuickAdd() {
    const quickAddBtn = document.getElementById('quickAddBtn');
    const quickAddMenu = document.getElementById('quickAddMenu');
    const quickAddFromClipboard = document.getElementById('quickAddFromClipboard');
    const quickAddCurrentPage = document.getElementById('quickAddCurrentPage');
    const quickImportBookmarks = document.getElementById('quickImportBookmarks');
    const bookmarkFileInput = document.getElementById('bookmarkFileInput');
    
    // 切换快速添加菜单
    if (quickAddBtn && quickAddMenu) {
        quickAddBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            const isVisible = quickAddMenu.style.display === 'block';
            quickAddMenu.style.display = isVisible ? 'none' : 'block';
        });
        
        // 点击外部关闭菜单
        document.addEventListener('click', (e) => {
            if (!quickAddBtn.contains(e.target) && !quickAddMenu.contains(e.target)) {
                quickAddMenu.style.display = 'none';
            }
        });
    }
    
    // 从剪贴板添加
    if (quickAddFromClipboard) {
        quickAddFromClipboard.addEventListener('click', async () => {
            try {
                const text = await navigator.clipboard.readText();
                if (text) {
                    // 检测是否是URL
                    try {
                        new URL(text);
                        // 是URL，打开添加模态框并填充
                        openAddModal();
                        document.getElementById('linkUrl').value = text;
                        // 尝试从URL提取名称
                        const domain = getDomain(text);
                        document.getElementById('linkName').value = domain;
                        quickAddMenu.style.display = 'none';
                        showNotification('已从剪贴板读取URL', 'success');
                    } catch (e) {
                        // 不是URL，提示用户
                        showNotification('剪贴板内容不是有效的URL', 'error');
                    }
                } else {
                    showNotification('剪贴板为空', 'error');
                }
            } catch (err) {
                console.error('读取剪贴板失败:', err);
                showNotification('无法读取剪贴板，请手动粘贴', 'error');
            }
        });
    }
    
    // 添加当前页面
    if (quickAddCurrentPage) {
        quickAddCurrentPage.addEventListener('click', () => {
            // 获取当前页面信息（如果是在iframe中，可能无法获取）
            try {
                const url = window.location.href;
                const title = document.title;
                
                // 检查是否在iframe中
                if (window.self === window.top) {
                    // 不在iframe中，可以获取当前页面
                    openAddModal();
                    document.getElementById('linkUrl').value = url;
                    document.getElementById('linkName').value = title || getDomain(url);
                    quickAddMenu.style.display = 'none';
                    showNotification('已填充当前页面信息', 'success');
                } else {
                    // 在iframe中，提示用户手动输入
                    openAddModal();
                    quickAddMenu.style.display = 'none';
                    showNotification('请手动输入当前页面URL', 'info');
                }
            } catch (err) {
                console.error('获取当前页面信息失败:', err);
                openAddModal();
                quickAddMenu.style.display = 'none';
            }
        });
    }
    
    // 导入浏览器书签
    if (quickImportBookmarks && bookmarkFileInput) {
        quickImportBookmarks.addEventListener('click', () => {
            bookmarkFileInput.click();
        });
        
        bookmarkFileInput.addEventListener('change', (e) => {
            const file = e.target.files[0];
            if (file) {
                importBookmarksFromFile(file);
                bookmarkFileInput.value = ''; // 重置文件输入
            }
        });
    }
}

// 设置粘贴导入功能
function setupPasteImport() {
    // 监听全局粘贴事件
    document.addEventListener('paste', async (e) => {
        // 如果焦点在输入框或文本域中，不处理（让用户正常粘贴）
        const activeElement = document.activeElement;
        if (activeElement && (
            activeElement.tagName === 'INPUT' || 
            activeElement.tagName === 'TEXTAREA' ||
            activeElement.isContentEditable
        )) {
            return;
        }
        
        try {
            // 获取粘贴的文本
            const text = (e.clipboardData || window.clipboardData).getData('text');
            
            if (!text || !text.trim()) {
                return;
            }
            
            // 检查是否是URL
            let url = text.trim();
            let finalUrl = url;
            
            // 尝试解析URL
            try {
                // 先尝试直接解析（可能已经包含协议）
                try {
                    new URL(url);
                    finalUrl = url; // 已经是完整URL
                } catch (e) {
                    // 如果没有协议，尝试添加https://
                    if (!url.match(/^[a-zA-Z][a-zA-Z\d+\-.]*:/)) {
                        finalUrl = 'https://' + url;
                        new URL(finalUrl); // 验证添加协议后的URL
                    } else {
                        // 有协议但格式不对，忽略
                        return;
                    }
                }
                
                // 检查是否已存在（检查原始URL和最终URL）
                const existingLink = allLinks.find(link => 
                    link.url === finalUrl || 
                    link.url === url ||
                    link.url === text.trim()
                );
                if (existingLink) {
                    showNotification(`链接已存在: ${existingLink.name}`, 'info');
                    return;
                }
                
                // 提取域名作为默认名称
                const domain = getDomain(finalUrl);
                
                // 创建新链接
                const newLink = {
                    name: domain,
                    url: finalUrl,
                    category: '未分类',
                    addTime: Date.now()
                };
                
                // 添加到链接列表
                allLinks.push(newLink);
                saveLinksOrder();
                
                // 更新分类
                initializeCategories();
                
                // 重新渲染
                filterLinks(document.getElementById('searchInput').value);
                
                showNotification(`已导入链接: ${domain}`, 'success');
                
                // 打开编辑模态框让用户完善信息
                const newIndex = allLinks.findIndex(link => link.url === finalUrl);
                if (newIndex !== -1) {
                    // 延迟一下，让用户看到通知
                    setTimeout(() => {
                        openEditModal(newIndex);
                    }, 500);
                }
            } catch (err) {
                // 不是有效的URL，忽略
                return;
            }
        } catch (err) {
            console.error('处理粘贴导入时出错:', err);
        }
    });
}

// 二维码功能已移除

// 设置分享链接功能
function setupShareLinks() {
    const shareLinksBtn = document.getElementById('shareLinksBtn');
    
    if (shareLinksBtn) {
        shareLinksBtn.addEventListener('click', () => {
            showShareModal();
        });
    }
}

// 显示分享模态框
function showShareModal() {
    // 创建分享选项模态框
    const modal = document.createElement('div');
    modal.className = 'modal-overlay';
    modal.id = 'shareModal';
    modal.innerHTML = `
        <div class="modal-content modal-medium">
            <div class="modal-header">
                <h2>分享链接</h2>
                <button class="modal-close" id="closeShareModal">
                    <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                        <line x1="18" y1="6" x2="6" y2="18"></line>
                        <line x1="6" y1="6" x2="18" y2="18"></line>
                    </svg>
                </button>
            </div>
            <div class="modal-body">
                <div class="share-options">
                    <div class="share-option">
                        <h3>生成分享页面</h3>
                        <p>生成一个独立的HTML页面，包含所有链接，可以分享给他人</p>
                        <button class="btn-submit" id="generateSharePageBtn">生成分享页面</button>
                    </div>
                    <div class="share-option">
                        <h3>复制链接列表</h3>
                        <p>复制所有链接的文本格式列表到剪贴板</p>
                        <button class="btn-submit" id="copyLinksListBtn">复制列表</button>
                    </div>
                    <div class="share-option">
                        <h3>导出为Markdown</h3>
                        <p>导出为Markdown格式，便于在文档中使用</p>
                        <button class="btn-submit" id="exportMarkdownBtn">导出Markdown</button>
                    </div>
                </div>
            </div>
        </div>
    `;
    
    document.body.appendChild(modal);
    modal.style.display = 'flex';
    
    // 关闭按钮
    modal.querySelector('#closeShareModal').addEventListener('click', () => {
        document.body.removeChild(modal);
    });
    
    modal.addEventListener('click', (e) => {
        if (e.target === modal) {
            document.body.removeChild(modal);
        }
    });
    
    // 生成分享页面
    modal.querySelector('#generateSharePageBtn').addEventListener('click', () => {
        generateSharePage();
        document.body.removeChild(modal);
    });
    
    // 复制链接列表
    modal.querySelector('#copyLinksListBtn').addEventListener('click', () => {
        copyLinksList();
        document.body.removeChild(modal);
    });
    
    // 导出Markdown
    modal.querySelector('#exportMarkdownBtn').addEventListener('click', () => {
        exportMarkdown();
        document.body.removeChild(modal);
    });
}

// 生成分享页面
function generateSharePage() {
    const html = `<!DOCTYPE html>
<html lang="zh-CN">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>我的链接分享</title>
    <style>
        * { margin: 0; padding: 0; box-sizing: border-box; }
        body {
            font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif;
            background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
            min-height: 100vh;
            padding: 40px 20px;
        }
        .container {
            max-width: 1200px;
            margin: 0 auto;
        }
        .header {
            text-align: center;
            color: white;
            margin-bottom: 40px;
        }
        .header h1 {
            font-size: 2.5rem;
            margin-bottom: 10px;
        }
        .header p {
            font-size: 1.1rem;
            opacity: 0.9;
        }
        .links-grid {
            display: grid;
            grid-template-columns: repeat(auto-fill, minmax(200px, 1fr));
            gap: 20px;
            margin-top: 30px;
        }
        .link-card {
            background: white;
            border-radius: 12px;
            padding: 20px;
            text-align: center;
            transition: transform 0.2s, box-shadow 0.2s;
            text-decoration: none;
            color: inherit;
            display: block;
        }
        .link-card:hover {
            transform: translateY(-4px);
            box-shadow: 0 10px 30px rgba(0, 0, 0, 0.2);
        }
        .link-icon {
            width: 48px;
            height: 48px;
            border-radius: 8px;
            margin: 0 auto 12px;
            object-fit: cover;
        }
        .icon-placeholder {
            width: 48px;
            height: 48px;
            border-radius: 8px;
            background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
            color: white;
            display: flex;
            align-items: center;
            justify-content: center;
            font-size: 24px;
            font-weight: 600;
            margin: 0 auto 12px;
        }
        .link-name {
            font-size: 1.1rem;
            font-weight: 600;
            color: #1e293b;
            margin-bottom: 8px;
        }
        .link-note {
            font-size: 0.9rem;
            color: #64748b;
            margin-bottom: 8px;
        }
        .link-url {
            font-size: 0.85rem;
            color: #94a3b8;
            word-break: break-all;
        }
        .category-section {
            margin-bottom: 40px;
        }
        .category-title {
            color: white;
            font-size: 1.5rem;
            margin-bottom: 20px;
            padding-bottom: 10px;
            border-bottom: 2px solid rgba(255, 255, 255, 0.3);
        }
        @media (max-width: 768px) {
            .links-grid {
                grid-template-columns: repeat(auto-fill, minmax(150px, 1fr));
                gap: 15px;
            }
            .header h1 {
                font-size: 2rem;
            }
        }
    </style>
</head>
<body>
    <div class="container">
        <div class="header">
            <h1>我的链接分享</h1>
            <p>共 ${allLinks.length} 个链接</p>
        </div>
        ${generateSharePageContent()}
    </div>
</body>
</html>`;
    
    // 下载HTML文件
    const blob = new Blob([html], { type: 'text/html' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `links-share-${Date.now()}.html`;
    a.click();
    URL.revokeObjectURL(url);
    
    showNotification('分享页面已生成', 'success');
}

// 生成分享页面内容
function generateSharePageContent() {
    // 按分类分组，只包含允许分享的链接
    const linksByCategory = {};
    allLinks.forEach(link => {
        // 跳过私有链接（private为true的链接）
        if (link.private) {
            return;
        }
        const category = link.category || '未分类';
        if (!linksByCategory[category]) {
            linksByCategory[category] = [];
        }
        linksByCategory[category].push(link);
    });
    
    let html = '';
    Object.keys(linksByCategory).sort().forEach(category => {
        html += `<div class="category-section">
            <h2 class="category-title">${category}</h2>
            <div class="links-grid">`;
        
        linksByCategory[category].forEach(link => {
            const firstLetter = link.name.charAt(0).toUpperCase();
            const iconHtml = link.icon 
                ? `<img src="${link.icon}" alt="${link.name}" class="link-icon" onerror="this.style.display='none'; this.nextElementSibling.style.display='flex';">
                   <div class="icon-placeholder" style="display: none;">${firstLetter}</div>`
                : `<div class="icon-placeholder">${firstLetter}</div>`;
            
            html += `<a href="${link.url}" target="_blank" class="link-card">
                ${iconHtml}
                <div class="link-name">${link.name}</div>
                ${link.note ? `<div class="link-note">${link.note}</div>` : ''}
                <div class="link-url">${getDomain(link.url)}</div>
            </a>`;
        });
        
        html += `</div></div>`;
    });
    
    return html;
}

// 复制链接列表
async function copyLinksList() {
    let text = '我的链接列表\n\n';
    
    // 按分类分组，只包含允许分享的链接
    const linksByCategory = {};
    allLinks.forEach(link => {
        // 跳过私有链接（private为true的链接）
        if (link.private) {
            return;
        }
        const category = link.category || '未分类';
        if (!linksByCategory[category]) {
            linksByCategory[category] = [];
        }
        linksByCategory[category].push(link);
    });
    
    Object.keys(linksByCategory).sort().forEach(category => {
        text += `【${category}】\n`;
        linksByCategory[category].forEach(link => {
            text += `- ${link.name}: ${link.url}\n`;
            if (link.note) {
                text += `  备注: ${link.note}\n`;
            }
        });
        text += '\n';
    });
    
    try {
        await navigator.clipboard.writeText(text);
        showNotification('链接列表已复制到剪贴板', 'success');
    } catch (err) {
        console.error('复制失败:', err);
        showNotification('复制失败，请手动复制', 'error');
    }
}

// 导出为Markdown
function exportMarkdown() {
    let markdown = '# 我的链接列表\n\n';
    
    // 按分类分组，只包含允许分享的链接
    const linksByCategory = {};
    allLinks.forEach(link => {
        // 跳过私有链接（private为true的链接）
        if (link.private) {
            return;
        }
        const category = link.category || '未分类';
        if (!linksByCategory[category]) {
            linksByCategory[category] = [];
        }
        linksByCategory[category].push(link);
    });
    
    Object.keys(linksByCategory).sort().forEach(category => {
        markdown += `## ${category}\n\n`;
        linksByCategory[category].forEach(link => {
            markdown += `- [${link.name}](${link.url})`;
            if (link.note) {
                markdown += ` - ${link.note}`;
            }
            markdown += '\n';
        });
        markdown += '\n';
    });
    
    // 下载Markdown文件
    const blob = new Blob([markdown], { type: 'text/markdown' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `links-${Date.now()}.md`;
    a.click();
    URL.revokeObjectURL(url);
    
    showNotification('Markdown文件已导出', 'success');
}

// 从书签文件导入
function importBookmarksFromFile(file) {
    const reader = new FileReader();
    
    reader.onload = (e) => {
        try {
            const html = e.target.result;
            const parser = new DOMParser();
            const doc = parser.parseFromString(html, 'text/html');
            
            // 查找所有书签链接
            const links = doc.querySelectorAll('a[href]');
            const importedLinks = [];
            
            links.forEach(link => {
                const url = link.getAttribute('href');
                const name = link.textContent.trim() || getDomain(url);
                const addDate = link.getAttribute('add_date');
                
                // 验证URL
                try {
                    new URL(url);
                    importedLinks.push({
                        name: name,
                        url: url,
                        category: '未分类',
                        addTime: addDate ? parseInt(addDate) * 1000 : Date.now()
                    });
                } catch (err) {
                    // 无效URL，跳过
                }
            });
            
            if (importedLinks.length === 0) {
                showNotification('未找到有效的书签链接', 'error');
                return;
            }
            
            // 询问用户是否导入
            if (confirm(`找到 ${importedLinks.length} 个书签，是否全部导入？`)) {
                // 添加到allLinks
                importedLinks.forEach(link => {
                    // 检查是否已存在（通过URL）
                    const exists = allLinks.some(l => l.url === link.url);
                    if (!exists) {
                        allLinks.push(link);
                    }
                });
                
                saveLinksOrder();
                initializeCategories();
                updateAllTags();
                updateTagFilters();
                filterLinks(document.getElementById('searchInput').value);
                showNotification(`成功导入 ${importedLinks.length} 个书签`, 'success');
                quickAddMenu.style.display = 'none';
            }
        } catch (err) {
            console.error('解析书签文件失败:', err);
            showNotification('书签文件格式错误', 'error');
        }
    };
    
    reader.onerror = () => {
        showNotification('读取文件失败', 'error');
    };
    
    reader.readAsText(file);
}

// 将函数暴露到全局（用于控制台调试）
window.exportLinks = exportLinks;
window.importLinks = importLinks;
window.resetLinksOrder = resetLinksOrder;
window.exportAllData = exportAllData;

