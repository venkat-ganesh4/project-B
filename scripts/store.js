/**
 * Prakriti Bio - Reactive State & LocalStorage Store
 */

const Store = {
  getProducts() {
    const raw = localStorage.getItem("pb_products");
    if (!raw) {
      localStorage.setItem("pb_products", JSON.stringify(INITIAL_PRODUCTS));
      return INITIAL_PRODUCTS;
    }
    try {
      return JSON.parse(raw);
    } catch (e) {
      return INITIAL_PRODUCTS;
    }
  },

  saveProducts(products) {
    localStorage.setItem("pb_products", JSON.stringify(products));
    window.dispatchEvent(new CustomEvent("pb:products_changed", { detail: products }));
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

  getCart() {
    const raw = localStorage.getItem("pb_cart");
    if (!raw) return [];
    try {
      return JSON.parse(raw);
    } catch (e) {
      return [];
    }
  },

  saveCart(cart) {
    localStorage.setItem("pb_cart", JSON.stringify(cart));
    window.dispatchEvent(new CustomEvent("pb:cart_changed", { detail: cart }));
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
        id: "ci_" + Date.now() + "_" + Math.random().toString(36).substr(2, 4),
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

  getWishlist() {
    const raw = localStorage.getItem("pb_wishlist");
    if (!raw) return [];
    try {
      return JSON.parse(raw);
    } catch (e) {
      return [];
    }
  },

  saveWishlist(list) {
    localStorage.setItem("pb_wishlist", JSON.stringify(list));
    window.dispatchEvent(new CustomEvent("pb:wishlist_changed", { detail: list }));
  },

  toggleWishlist(productId) {
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
    const raw = localStorage.getItem("pb_coupons");
    if (!raw) {
      localStorage.setItem("pb_coupons", JSON.stringify(INITIAL_COUPONS));
      return INITIAL_COUPONS;
    }
    try {
      return JSON.parse(raw);
    } catch (e) {
      return INITIAL_COUPONS;
    }
  },

  saveCoupons(coupons) {
    localStorage.setItem("pb_coupons", JSON.stringify(coupons));
    window.dispatchEvent(new CustomEvent("pb:coupons_changed", { detail: coupons }));
  },

  getOrders() {
    const raw = localStorage.getItem("pb_orders");
    if (!raw) {
      localStorage.setItem("pb_orders", JSON.stringify(SAMPLE_ORDERS));
      return SAMPLE_ORDERS;
    }
    try {
      return JSON.parse(raw);
    } catch (e) {
      return SAMPLE_ORDERS;
    }
  },

  saveOrders(orders) {
    localStorage.setItem("pb_orders", JSON.stringify(orders));
    window.dispatchEvent(new CustomEvent("pb:orders_changed", { detail: orders }));
  },

  createOrder(orderData) {
    const orders = this.getOrders();
    const newOrder = {
      orderId: "PB-2026-" + Math.floor(1000 + Math.random() * 9000),
      createdDate: new Date().toISOString(),
      status: "Order Placed",
      statusTimeline: [
        {
          status: "Order Placed",
          timestamp: new Date().toLocaleString("en-IN", { dateStyle: "medium", timeStyle: "short" }),
          note: "Order received and queued for confirmation"
        }
      ],
      ...orderData
    };

    orders.unshift(newOrder);
    this.saveOrders(orders);

    // Deduct stock from products
    const products = this.getProducts();
    orderData.items.forEach(item => {
      const p = products.find(prod => prod.id === item.productId || prod.id === item.id);
      if (p) {
        p.stock = Math.max(0, p.stock - (item.quantity || 1));
        p.inStock = p.stock > 0;
      }
    });
    this.saveProducts(products);

    return newOrder;
  },

  updateOrderStatus(orderId, newStatus, note = "", courierData = null) {
    const orders = this.getOrders();
    const order = orders.find(o => o.orderId === orderId);
    if (order) {
      order.status = newStatus;
      if (!order.statusTimeline) order.statusTimeline = [];
      order.statusTimeline.push({
        status: newStatus,
        timestamp: new Date().toLocaleString("en-IN", { dateStyle: "medium", timeStyle: "short" }),
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
      const statusTitle = actionType === "cancel" ? "Cancellation Requested" : "Return Requested";
      order.status = statusTitle;
      order.actionRequest = {
        type: actionType,
        reason: reason,
        requestedAt: new Date().toISOString()
      };
      if (!order.statusTimeline) order.statusTimeline = [];
      order.statusTimeline.push({
        status: statusTitle,
        timestamp: new Date().toLocaleString("en-IN", { dateStyle: "medium", timeStyle: "short" }),
        note: `Customer requested ${actionType}: "${reason}"`
      });
      this.saveOrders(orders);
    }
  },

  getReviews() {
    const raw = localStorage.getItem("pb_reviews");
    if (!raw) {
      localStorage.setItem("pb_reviews", JSON.stringify(INITIAL_REVIEWS));
      return INITIAL_REVIEWS;
    }
    try {
      return JSON.parse(raw);
    } catch (e) {
      return INITIAL_REVIEWS;
    }
  },

  addReview(review) {
    const reviews = this.getReviews();
    reviews.unshift({
      ...review,
      date: "Just now",
      verified: true
    });
    localStorage.setItem("pb_reviews", JSON.stringify(reviews));
    window.dispatchEvent(new CustomEvent("pb:reviews_changed", { detail: reviews }));
  },

  // Applied Coupon in current checkout session
  getAppliedCoupon() {
    const raw = sessionStorage.getItem("pb_applied_coupon");
    if (!raw) return null;
    try {
      return JSON.parse(raw);
    } catch (e) {
      return null;
    }
  },

  setAppliedCoupon(coupon) {
    if (coupon) {
      sessionStorage.setItem("pb_applied_coupon", JSON.stringify(coupon));
    } else {
      sessionStorage.removeItem("pb_applied_coupon");
    }
  },

  // Calculate cart financial summary
  getCartSummary(targetState = "Telangana") {
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

    // Shipping rules (PRD Section 20):
    // Initial delivery region: AP + Telangana
    // Free delivery in AP & TG for orders >= ₹499 or if coupon applies free shipping
    let shipping = 0;
    const isAPTG = ["Telangana", "Andhra Pradesh"].includes(targetState);

    if (coupon && coupon.freeShipping) {
      shipping = 0;
    } else if (subtotal === 0) {
      shipping = 0;
    } else if (isAPTG) {
      shipping = subtotal >= 499 ? 0 : 60;
    } else {
      // Other states
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
