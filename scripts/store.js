/**
 * Prakriti Bio - Reactive State Store
 *
 * The app keeps the public storefront interactive while synchronizing its
 * critical data with the real backend/database. LocalStorage remains a small
 * cache only for resilience/fallback; it is not the authoritative source.
 */

const Store = {
  _productsCache: null,
  _cartCache: null,
  _wishlistCache: null,
  _ordersCache: null,

  getAuthToken() {
    const cookieValue = document.cookie
      .split('; ')
      .find(row => row.startsWith('pb_session='));

    if (cookieValue) {
      return decodeURIComponent(cookieValue.split('=')[1]);
    }

    try {
      return localStorage.getItem('pb_auth_token');
    } catch (e) {
      return null;
    }
  },

  isAuthenticated() {
    return Boolean(this.getAuthToken());
  },

  async apiFetch(path, options = {}) {
    if (typeof fetch !== 'function') {
      throw new Error('Fetch API is unavailable in this browser');
    }

    const token = this.getAuthToken();
    const headers = {
      'Content-Type': 'application/json',
      ...(options.headers || {})
    };

    if (token) {
      headers.Authorization = `Bearer ${token}`;
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
      throw new Error(errorPayload && errorPayload.error ? errorPayload.error : 'Request failed');
    }

    const contentType = response.headers.get('content-type') || '';
    if (contentType.includes('application/json')) {
      return response.json();
    }
    return null;
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
    } catch (e) {
      // Local cache is optional; ignore write errors and proceed with runtime state.
    }
  },

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
        const fallback = this._productsCache || this.readFallback('pb_products', INITIAL_PRODUCTS || []);
        this._productsCache = fallback;
        return fallback;
      });
  },

  getProducts() {
    if (this._productsCache) {
      return this._productsCache;
    }

    const cached = this.readFallback('pb_products', INITIAL_PRODUCTS || []);
    this._productsCache = cached;

    if (typeof fetch === 'function') {
      this.refreshProducts();
    }

    return this._productsCache;
  },

  saveProducts(products) {
    this._productsCache = Array.isArray(products) ? products : [];
    this.writeFallback('pb_products', this._productsCache);
    window.dispatchEvent(new CustomEvent('pb:products_changed', { detail: this._productsCache }));
  },

  getProductById(id) {
    const products = this.getProducts();
    return products.find(p => p.id === id);
  },

  updateProductStock(productId, newStock) {
    const products = this.getProducts();
    const p = products.find(prod => prod.id === productId);
    if (p) {
      p.stock = Math.max(0, parseInt(newStock, 10));
      p.inStock = p.stock > 0;
      this.saveProducts(products);
    }
  },

  fetchCartFromServer() {
    if (!this.isAuthenticated()) return Promise.resolve(this.getCart());
    return this.apiFetch('/api/customer/cart')
      .then(items => {
        const cart = Array.isArray(items) ? items : [];
        this._cartCache = cart;
        this.writeFallback('pb_cart', cart);
        return cart;
      })
      .catch(() => this.getCart());
  },

  getCart() {
    if (this._cartCache) {
      return this._cartCache;
    }

    const cached = this.readFallback('pb_cart', []);
    this._cartCache = cached;

    if (this.isAuthenticated() && typeof fetch === 'function') {
      this.fetchCartFromServer();
    }

    return this._cartCache;
  },

  saveCart(cart) {
    this._cartCache = Array.isArray(cart) ? cart : [];
    this.writeFallback('pb_cart', this._cartCache);

    if (this.isAuthenticated()) {
      this.apiFetch('/api/customer/cart', {
        method: 'POST',
        body: JSON.stringify({ items: this._cartCache })
      }).catch(() => {});
    }

    window.dispatchEvent(new CustomEvent('pb:cart_changed', { detail: this._cartCache }));
  },

  addToCart(item) {
    // item: { productId, size, isCustom, customLiters, quantity, unitPrice, name, image }
    const cart = this.getCart();
    const existingIndex = cart.findIndex(c =>
      c.productId === item.productId &&
      c.size === item.size &&
      c.isCustom === item.isCustom &&
      (!c.isCustom || c.customLiters === item.customLiters)
    );

    if (existingIndex > -1) {
      cart[existingIndex].quantity += item.quantity;
    } else {
      cart.push({
        id: 'ci_' + Date.now() + '_' + Math.random().toString(36).substr(2, 4),
        ...item
      });
    }

    this.saveCart(cart);
  },

  updateCartQuantity(cartItemId, newQty) {
    let cart = this.getCart();
    if (newQty <= 0) {
      cart = cart.filter(item => item.id !== cartItemId);
    } else {
      const item = cart.find(i => i.id === cartItemId);
      if (item) item.quantity = newQty;
    }
    this.saveCart(cart);
  },

  removeFromCart(cartItemId) {
    const cart = this.getCart().filter(item => item.id !== cartItemId);
    this.saveCart(cart);
  },

  clearCart() {
    this.saveCart([]);
  },

  fetchWishlistFromServer() {
    if (!this.isAuthenticated()) return Promise.resolve(this.getWishlist());
    return this.apiFetch('/api/customer/favorites')
      .then(items => {
        const list = Array.isArray(items) ? items : [];
        this._wishlistCache = list;
        this.writeFallback('pb_wishlist', list);
        return list;
      })
      .catch(() => this.getWishlist());
  },

  getWishlist() {
    if (this._wishlistCache) {
      return this._wishlistCache;
    }

    const cached = this.readFallback('pb_wishlist', []);
    this._wishlistCache = cached;

    if (this.isAuthenticated() && typeof fetch === 'function') {
      this.fetchWishlistFromServer();
    }

    return this._wishlistCache;
  },

  saveWishlist(list) {
    this._wishlistCache = Array.isArray(list) ? list : [];
    this.writeFallback('pb_wishlist', this._wishlistCache);

    if (this.isAuthenticated()) {
      // Server stores favorites individually; keep a local cache and let the
      // toggle endpoint handle the source of truth for an authenticated customer.
      window.dispatchEvent(new CustomEvent('pb:wishlist_changed', { detail: this._wishlistCache }));
      return;
    }

    window.dispatchEvent(new CustomEvent('pb:wishlist_changed', { detail: this._wishlistCache }));
  },

  toggleWishlist(productId) {
    if (this.isAuthenticated()) {
      const before = this.getWishlist();
      const isNow = before.includes(productId);
      this.apiFetch('/api/customer/favorites/toggle', {
        method: 'POST',
        body: JSON.stringify({ productId })
      })
        .then(response => {
          const favoriteIds = Array.isArray(response && response.favorites) ? response.favorites : [];
          this._wishlistCache = favoriteIds;
          this.writeFallback('pb_wishlist', favoriteIds);
          window.dispatchEvent(new CustomEvent('pb:wishlist_changed', { detail: favoriteIds }));
        })
        .catch(() => {
          const list = this.getWishlist().filter(id => id !== productId);
          if (!isNow) list.push(productId);
          this.saveWishlist(list);
        });
      return !isNow;
    }

    let list = this.getWishlist();
    if (list.includes(productId)) {
      list = list.filter(id => id !== productId);
    } else {
      list.push(productId);
    }
    this.saveWishlist(list);
    return list.includes(productId);
  },

  isWishlisted(productId) {
    return this.getWishlist().includes(productId);
  },

  getCoupons() {
    const cached = this.readFallback('pb_coupons', INITIAL_COUPONS || []);
    return cached;
  },

  saveCoupons(coupons) {
    this.writeFallback('pb_coupons', coupons);
    window.dispatchEvent(new CustomEvent('pb:coupons_changed', { detail: coupons }));
  },

  fetchOrdersFromServer() {
    if (!this.isAuthenticated()) return Promise.resolve(this.getOrders());
    return this.apiFetch('/api/customer/orders')
      .then(rows => {
        const orders = Array.isArray(rows) ? rows : [];
        this._ordersCache = orders;
        this.writeFallback('pb_orders', orders);
        window.dispatchEvent(new CustomEvent('pb:orders_changed', { detail: orders }));
        return orders;
      })
      .catch(() => this.getOrders());
  },

  getOrders() {
    if (this._ordersCache) {
      return this._ordersCache;
    }

    const cached = this.readFallback('pb_orders', SAMPLE_ORDERS || []);
    this._ordersCache = cached;

    if (this.isAuthenticated() && typeof fetch === 'function') {
      this.fetchOrdersFromServer();
    }

    return this._ordersCache;
  },

  saveOrders(orders) {
    this._ordersCache = Array.isArray(orders) ? orders : [];
    this.writeFallback('pb_orders', this._ordersCache);
    window.dispatchEvent(new CustomEvent('pb:orders_changed', { detail: this._ordersCache }));
  },

  createOrder(orderData) {
    if (this.isAuthenticated()) {
      return this.apiFetch('/api/customer/orders', {
        method: 'POST',
        body: JSON.stringify(orderData)
      })
        .then(created => {
          this.clearCart();
          this.fetchOrdersFromServer();
          this.refreshProducts();
          return created;
        })
        .catch(() => {
          const fallback = this.getOrders();
          const newOrder = {
            orderId: 'PB-2026-' + Math.floor(1000 + Math.random() * 9000),
            createdDate: new Date().toISOString(),
            status: 'Order Placed',
            statusTimeline: [{
              status: 'Order Placed',
              timestamp: new Date().toLocaleString('en-IN', { dateStyle: 'medium', timeStyle: 'short' }),
              note: 'Order received and queued for confirmation'
            }],
            ...orderData
          };
          const orders = [newOrder, ...fallback];
          this.saveOrders(orders);
          this.clearCart();
          return newOrder;
        });
    }

    const orders = this.getOrders();
    const newOrder = {
      orderId: 'PB-2026-' + Math.floor(1000 + Math.random() * 9000),
      createdDate: new Date().toISOString(),
      status: 'Order Placed',
      statusTimeline: [{
        status: 'Order Placed',
        timestamp: new Date().toLocaleString('en-IN', { dateStyle: 'medium', timeStyle: 'short' }),
        note: 'Order received and queued for confirmation'
      }],
      ...orderData
    };

    orders.unshift(newOrder);
    this.saveOrders(orders);

    const products = this.getProducts();
    orderData.items.forEach(item => {
      const p = products.find(prod => prod.id === item.productId || prod.id === item.id);
      if (p) {
        p.stock = Math.max(0, p.stock - (item.quantity || 1));
        p.inStock = p.stock > 0;
      }
    });
    this.saveProducts(products);
    this.clearCart();

    return newOrder;
  },

  updateOrderStatus(orderId, newStatus, note = '', courierData = null) {
    const orders = this.getOrders();
    const order = orders.find(o => o.orderId === orderId);
    if (order) {
      order.status = newStatus;
      if (!order.statusTimeline) order.statusTimeline = [];
      order.statusTimeline.push({
        status: newStatus,
        timestamp: new Date().toLocaleString('en-IN', { dateStyle: 'medium', timeStyle: 'short' }),
        note: note || `Status updated to ${newStatus}`
      });

      if (courierData) {
        if (courierData.courierName) order.courierName = courierData.courierName;
        if (courierData.trackingNumber) order.trackingNumber = courierData.trackingNumber;
        if (courierData.trackingUrl) order.trackingUrl = courierData.trackingUrl;
      }

      this.saveOrders(orders);
    }
  },

  requestOrderAction(orderId, actionType, reason) {
    const orders = this.getOrders();
    const order = orders.find(o => o.orderId === orderId);
    if (order) {
      const statusTitle = actionType === 'cancel' ? 'Cancellation Requested' : 'Return Requested';
      order.status = statusTitle;
      order.actionRequest = {
        type: actionType,
        reason: reason,
        requestedAt: new Date().toISOString()
      };
      if (!order.statusTimeline) order.statusTimeline = [];
      order.statusTimeline.push({
        status: statusTitle,
        timestamp: new Date().toLocaleString('en-IN', { dateStyle: 'medium', timeStyle: 'short' }),
        note: `Customer requested ${actionType}: "${reason}"`
      });
      this.saveOrders(orders);
    }
  },

  getReviews() {
    const cached = this.readFallback('pb_reviews', INITIAL_REVIEWS || []);
    return cached;
  },

  addReview(review) {
    const reviews = this.getReviews();
    reviews.unshift({
      ...review,
      date: 'Just now',
      verified: true
    });
    this.writeFallback('pb_reviews', reviews);
    window.dispatchEvent(new CustomEvent('pb:reviews_changed', { detail: reviews }));
  },

  getAppliedCoupon() {
    const raw = sessionStorage.getItem('pb_applied_coupon');
    if (!raw) return null;
    try {
      return JSON.parse(raw);
    } catch (e) {
      return null;
    }
  },

  setAppliedCoupon(coupon) {
    if (coupon) {
      sessionStorage.setItem('pb_applied_coupon', JSON.stringify(coupon));
    } else {
      sessionStorage.removeItem('pb_applied_coupon');
    }
  },

  getCartSummary(targetState = 'Telangana') {
    const cart = this.getCart();
    let subtotal = 0;
    let totalItems = 0;

    cart.forEach(item => {
      subtotal += item.unitPrice * item.quantity;
      totalItems += item.quantity;
    });

    const coupon = this.getAppliedCoupon();
    let discount = 0;

    if (coupon) {
      if (coupon.discountPercent && subtotal >= (coupon.minOrder || 0)) {
        discount = (subtotal * coupon.discountPercent) / 100;
      }
    }

    let shipping = 0;
    const isAPTG = ['Telangana', 'Andhra Pradesh'].includes(targetState);

    if (coupon && coupon.freeShipping) {
      shipping = 0;
    } else if (subtotal === 0) {
      shipping = 0;
    } else if (isAPTG) {
      shipping = subtotal >= 499 ? 0 : 60;
    } else {
      shipping = subtotal >= 999 ? 0 : 120;
    }

    const total = Math.max(0, subtotal - discount + shipping);

    return {
      subtotal: Math.round(subtotal * 100) / 100,
      discount: Math.round(discount * 100) / 100,
      shipping,
      total: Math.round(total * 100) / 100,
      totalItems,
      coupon,
      isAPTG
    };
  }
};
