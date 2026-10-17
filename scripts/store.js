/**
 * Prakriti Bio - Unified Reactive State Store
 * Grounded in authentic database persistence, persistent visitor likes,
 * live dynamic CMS content hydration, and complete admin API integration.
 */

const Store = {
  _productsCache: null,
  _contentCache: null,
  _likesCache: { userLikes: [], counts: {} },
  _adminCache: null,

  // 1. Persistent Unique Visitor ID (for likes without duplicate voting)
  getVisitorId() {
    let vid = null;
    try {
      vid = localStorage.getItem('pb_visitor_id');
      if (!vid) {
        vid = 'v_' + Date.now().toString(36) + '_' + Math.random().toString(36).substring(2, 9);
        localStorage.setItem('pb_visitor_id', vid);
      }
    } catch (e) {
      vid = 'v_guest_' + Date.now();
    }
    return vid;
  },

  // 2. Auth Tokens (Customer and Admin)
  getAdminAuthToken() {
    const cookieValue = document.cookie
      .split('; ')
      .find(row => row.startsWith('pb_admin_session='));

    if (cookieValue) {
      return decodeURIComponent(cookieValue.split('=')[1]);
    }

    try {
      return localStorage.getItem('pb_admin_token');
    } catch (e) {
      return null;
    }
  },

  isAdminAuthenticated() {
    return Boolean(this.getAdminAuthToken());
  },

  // 3. Centralized API Fetcher
  async apiFetch(path, options = {}) {
    if (typeof fetch !== 'function') {
      throw new Error('Fetch API is unavailable in this browser');
    }

    const adminToken = this.getAdminAuthToken();
    const visitorId = this.getVisitorId();

    const headers = {
      'Content-Type': 'application/json',
      'X-Visitor-Id': visitorId,
      ...(options.headers || {})
    };

    if (adminToken && !headers.Authorization) {
      headers.Authorization = `Bearer ${adminToken}`;
    }

    const response = await fetch(path, {
      credentials: 'same-origin',
      ...options,
      headers,
      body: options.body || undefined
    });

    if (!response.ok) {
      let errorPayload = null;
      try {
        errorPayload = await response.json();
      } catch (e) {}
      throw new Error(errorPayload && errorPayload.error ? errorPayload.error : `Request failed with status ${response.status}`);
    }

    const contentType = response.headers.get('content-type') || '';
    if (contentType.includes('application/json')) {
      return response.json();
    }
    return response.text();
  },

  readFallback(key, fallbackValue) {
    try {
      const raw = localStorage.getItem(key);
      if (!raw) return fallbackValue;
      return JSON.parse(raw);
    } catch (e) {
      return fallbackValue;
    }
  },

  writeFallback(key, value) {
    try {
      localStorage.setItem(key, JSON.stringify(value));
    } catch (e) {}
  },

  // -------------------------------------------------------------
  // PRODUCTS CATALOGUE
  // -------------------------------------------------------------
  refreshProducts() {
    return this.apiFetch('/api/products')
      .then(rows => {
        if (!Array.isArray(rows)) return this.getProducts();
        this._productsCache = rows;
        this.writeFallback('pb_products', rows);
        window.dispatchEvent(new CustomEvent('pb:products_changed', { detail: rows }));
        return rows;
      })
      .catch(() => {
        const fallback = this._productsCache || this.readFallback('pb_products', typeof INITIAL_PRODUCTS !== 'undefined' ? INITIAL_PRODUCTS : []);
        this._productsCache = fallback;
        return fallback;
      });
  },

  getProducts() {
    if (this._productsCache) {
      return this._productsCache;
    }
    const cached = this.readFallback('pb_products', typeof INITIAL_PRODUCTS !== 'undefined' ? INITIAL_PRODUCTS : []);
    this._productsCache = cached;

    if (typeof fetch === 'function') {
      this.refreshProducts();
    }
    return this._productsCache;
  },

  getProductById(id) {
    const products = this.getProducts();
    return products.find(p => p.id === id);
  },

  // -------------------------------------------------------------
  // PRODUCT LIKES (PERSISTENT & DUPLICATE-PROTECTED)
  // -------------------------------------------------------------
  fetchLikes() {
    const visitorId = this.getVisitorId();
    return this.apiFetch(`/api/products/likes?visitorId=${encodeURIComponent(visitorId)}`)
      .then(data => {
        if (data && typeof data === 'object') {
          this._likesCache = {
            userLikes: Array.isArray(data.userLikes) ? data.userLikes : [],
            counts: data.counts || {}
          };
          this.writeFallback('pb_likes_cache', this._likesCache);
          window.dispatchEvent(new CustomEvent('pb:likes_changed', { detail: this._likesCache }));
        }
        return this._likesCache;
      })
      .catch(() => {
        this._likesCache = this.readFallback('pb_likes_cache', { userLikes: [], counts: {} });
        return this._likesCache;
      });
  },

  isLiked(productId) {
    if (!this._likesCache || !Array.isArray(this._likesCache.userLikes)) {
      this._likesCache = this.readFallback('pb_likes_cache', { userLikes: [], counts: {} });
    }
    return this._likesCache.userLikes.includes(productId);
  },

  getLikeCount(productId) {
    if (this._likesCache && this._likesCache.counts && this._likesCache.counts[productId] !== undefined) {
      return this._likesCache.counts[productId];
    }
    const prod = this.getProductById(productId);
    return prod ? (prod.likesCount || 0) : 0;
  },

  getUserLikes() {
    if (!this._likesCache || !Array.isArray(this._likesCache.userLikes)) {
      this._likesCache = this.readFallback('pb_likes_cache', { userLikes: [], counts: {} });
    }
    return this._likesCache.userLikes;
  },

  async toggleLike(productId) {
    const visitorId = this.getVisitorId();
    const wasLiked = this.isLiked(productId);
    const currentCount = this.getLikeCount(productId);

    // 1. Optimistic UI update
    if (wasLiked) {
      this._likesCache.userLikes = this._likesCache.userLikes.filter(id => id !== productId);
      this._likesCache.counts[productId] = Math.max(0, currentCount - 1);
    } else {
      if (!this._likesCache.userLikes.includes(productId)) {
        this._likesCache.userLikes.push(productId);
      }
      this._likesCache.counts[productId] = currentCount + 1;
    }

    // Update in products cache as well
    if (this._productsCache) {
      const p = this._productsCache.find(item => item.id === productId);
      if (p) p.likesCount = this._likesCache.counts[productId];
    }

    this.writeFallback('pb_likes_cache', this._likesCache);
    window.dispatchEvent(new CustomEvent('pb:likes_changed', { detail: this._likesCache }));

    // 2. Call backend
    try {
      const response = await this.apiFetch(`/api/products/${productId}/like`, {
        method: 'POST',
        body: JSON.stringify({ visitorId })
      });

      if (response && response.success) {
        this._likesCache.counts[productId] = response.likesCount;
        if (response.liked && !this._likesCache.userLikes.includes(productId)) {
          this._likesCache.userLikes.push(productId);
        } else if (!response.liked) {
          this._likesCache.userLikes = this._likesCache.userLikes.filter(id => id !== productId);
        }
        if (this._productsCache) {
          const p = this._productsCache.find(item => item.id === productId);
          if (p) p.likesCount = response.likesCount;
        }
        this.writeFallback('pb_likes_cache', this._likesCache);
        window.dispatchEvent(new CustomEvent('pb:likes_changed', { detail: this._likesCache }));
        return response;
      }
    } catch (err) {
      console.error('Like toggle failed on server, keeping optimistic state:', err);
    }

    return { liked: !wasLiked, likesCount: this._likesCache.counts[productId] };
  },

  // -------------------------------------------------------------
  // DYNAMIC SITE CONTENT CMS
  // -------------------------------------------------------------
  fetchContent() {
    return this.apiFetch('/api/content')
      .then(content => {
        if (content && typeof content === 'object') {
          this._contentCache = content;
          this.writeFallback('pb_content', content);
          window.dispatchEvent(new CustomEvent('pb:content_changed', { detail: content }));
        }
        return this._contentCache;
      })
      .catch(() => {
        const fallback = this._contentCache || this.readFallback('pb_content', {});
        this._contentCache = fallback;
        return fallback;
      });
  },

  getContent(sectionKey, fallback = null) {
    if (this._contentCache && this._contentCache[sectionKey] !== undefined) {
      return this._contentCache[sectionKey];
    }
    const cached = this.readFallback('pb_content', {});
    if (cached[sectionKey] !== undefined) {
      return cached[sectionKey];
    }
    return fallback;
  },

  getAllContent() {
    if (this._contentCache) return this._contentCache;
    return this.readFallback('pb_content', {});
  },

  // -------------------------------------------------------------
  // ADMIN AUTHENTICATION & PORTAL ACTIONS
  // -------------------------------------------------------------
  async adminLogin(email, password) {
    const res = await this.apiFetch('/api/admin/auth/login', {
      method: 'POST',
      body: JSON.stringify({ email, password })
    });
    if (res && res.token) {
      try {
        localStorage.setItem('pb_admin_token', res.token);
        localStorage.setItem('pb_admin_profile', JSON.stringify(res.admin));
      } catch (e) {}
      this._adminCache = res.admin;
      window.dispatchEvent(new CustomEvent('pb:admin_login', { detail: res.admin }));
    }
    return res;
  },

  async adminLogout() {
    try {
      await this.apiFetch('/api/admin/auth/logout', { method: 'POST' });
    } catch (e) {}
    try {
      localStorage.removeItem('pb_admin_token');
      localStorage.removeItem('pb_admin_profile');
    } catch (e) {}
    this._adminCache = null;
    window.dispatchEvent(new CustomEvent('pb:admin_logout'));
  },

  getAdminProfile() {
    if (this._adminCache) return this._adminCache;
    try {
      const raw = localStorage.getItem('pb_admin_profile');
      if (raw) return JSON.parse(raw);
    } catch (e) {}
    return null;
  },

  async verifyAdminSession() {
    if (!this.isAdminAuthenticated()) return null;
    try {
      const admin = await this.apiFetch('/api/admin/auth/me');
      if (admin && admin.id) {
        this._adminCache = admin;
        localStorage.setItem('pb_admin_profile', JSON.stringify(admin));
        return admin;
      }
    } catch (e) {
      this.adminLogout();
    }
    return null;
  },

  // -------------------------------------------------------------
  // ADMIN API CALLS
  // -------------------------------------------------------------
  getAdminDashboardStats() {
    return this.apiFetch('/api/admin/dashboard/stats');
  },

  getAdminContent() {
    return this.apiFetch('/api/admin/content');
  },

  saveAdminContent(sectionKey, data) {
    return this.apiFetch(`/api/admin/content/${encodeURIComponent(sectionKey)}`, {
      method: 'PUT',
      body: JSON.stringify({ data })
    }).then(res => {
      if (this._contentCache) {
        this._contentCache[sectionKey] = data;
      }
      this.writeFallback('pb_content', this._contentCache);
      window.dispatchEvent(new CustomEvent('pb:content_changed', { detail: this._contentCache }));
      return res;
    });
  },

  getInventorySummary() {
    return this.apiFetch('/api/admin/inventory/summary');
  },

  adjustInventory(productId, action, amount, reason, notes = '') {
    return this.apiFetch('/api/admin/inventory/adjust', {
      method: 'POST',
      body: JSON.stringify({ productId, action, amount, reason, notes })
    }).then(res => {
      this.refreshProducts();
      return res;
    });
  },

  updateInventoryThreshold(productId, threshold) {
    return this.apiFetch(`/api/admin/inventory/${encodeURIComponent(productId)}/threshold`, {
      method: 'PUT',
      body: JSON.stringify({ threshold })
    }).then(res => {
      this.refreshProducts();
      return res;
    });
  },

  getInventoryLogs(filter = {}) {
    const params = new URLSearchParams(filter).toString();
    return this.apiFetch(`/api/admin/inventory/logs${params ? '?' + params : ''}`);
  },

  saveAdminProduct(productData) {
    const isNew = !productData.id || productData.isNew;
    const url = isNew ? '/api/admin/products' : `/api/admin/products/${encodeURIComponent(productData.id)}`;
    const method = isNew ? 'POST' : 'PUT';

    return this.apiFetch(url, {
      method,
      body: JSON.stringify(productData)
    }).then(res => {
      this.refreshProducts();
      return res;
    });
  },

  deleteAdminProduct(productId) {
    return this.apiFetch(`/api/admin/products/${encodeURIComponent(productId)}`, {
      method: 'DELETE'
    }).then(res => {
      this.refreshProducts();
      return res;
    });
  },

  getAdminArticles() {
    return this.apiFetch('/api/admin/journal');
  },

  saveAdminArticle(articleData) {
    const isNew = !articleData.id;
    const url = isNew ? '/api/admin/journal' : `/api/admin/journal/${encodeURIComponent(articleData.id)}`;
    const method = isNew ? 'POST' : 'PUT';

    return this.apiFetch(url, {
      method,
      body: JSON.stringify(articleData)
    });
  },

  deleteAdminArticle(id) {
    return this.apiFetch(`/api/admin/journal/${encodeURIComponent(id)}`, {
      method: 'DELETE'
    });
  },

  getAdminEnquiries(filter = {}) {
    const params = new URLSearchParams(filter).toString();
    return this.apiFetch(`/api/admin/enquiries${params ? '?' + params : ''}`);
  },

  updateAdminEnquiry(id, status, assignedAdmin, internalNotes, followUpDate) {
    return this.apiFetch(`/api/admin/enquiries/${encodeURIComponent(id)}`, {
      method: 'PUT',
      body: JSON.stringify({ status, assignedAdmin, internalNotes, followUpDate })
    });
  },

  getAdminAuditLogs(filter = {}) {
    const params = new URLSearchParams(filter).toString();
    return this.apiFetch(`/api/admin/audit-logs${params ? '?' + params : ''}`);
  },

  getAdminUsers() {
    return this.apiFetch('/api/admin/admins');
  },

  createAdminUser(userData) {
    return this.apiFetch('/api/admin/admins', {
      method: 'POST',
      body: JSON.stringify(userData)
    });
  },

  updateAdminUser(id, userData) {
    return this.apiFetch(`/api/admin/admins/${encodeURIComponent(id)}`, {
      method: 'PUT',
      body: JSON.stringify(userData)
    });
  },

  getAdminMedia() {
    return this.apiFetch('/api/admin/media');
  },

  uploadMedia(base64Data, filename, contentType = 'image/jpeg') {
    return this.apiFetch('/api/admin/upload', {
      method: 'POST',
      body: JSON.stringify({ base64Data, filename, contentType })
    });
  }
};
