const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { db, hashPassword, verifyPassword } = require('./db');
const {
  checkRateLimit,
  createSession,
  getSession,
  deleteSession,
  logAudit,
  createNotification,
  getAuthToken,
  getAuthenticatedCustomer,
  getAuthenticatedAdmin,
  requireAdminPermission
} = require('./auth');

// Helper to format JSON response
function sendJson(res, data, statusCode = 200, headers = {}) {
  res.writeHead(statusCode, {
    'Content-Type': 'application/json; charset=utf-8',
    'Cache-Control': 'no-store, no-cache, must-revalidate',
    ...headers
  });
  res.end(JSON.stringify(data));
}

function sendError(res, message, statusCode = 400, details = null) {
  sendJson(res, { error: message, details }, statusCode);
}

// Parse request body helper
function parseBody(req) {
  return new Promise((resolve, reject) => {
    let body = '';
    req.on('data', chunk => {
      body += chunk.toString();
      if (body.length > 10 * 1024 * 1024) { // 10MB limit
        reject(new Error('Payload too large'));
      }
    });
    req.on('end', () => {
      if (!body) return resolve({});
      try {
        resolve(JSON.parse(body));
      } catch (err) {
        resolve({ rawBody: body });
      }
    });
    req.on('error', reject);
  });
}

// Format product for client output (parse JSON strings)
function formatProduct(p) {
  if (!p) return null;
  return {
    ...p,
    inStock: Boolean(p.in_stock),
    variants: typeof p.variants === 'string' ? JSON.parse(p.variants || '[]') : p.variants,
    ingredients: typeof p.ingredients === 'string' ? JSON.parse(p.ingredients || '[]') : p.ingredients,
    usageGuide: typeof p.usage_guide === 'string' ? JSON.parse(p.usage_guide || '[]') : p.usage_guide,
    environmentalFacts: typeof p.environmental_facts === 'string' ? JSON.parse(p.environmental_facts || '[]') : p.environmental_facts,
    basePrice: p.base_price,
    baseSize: p.base_size,
    categoryLabel: p.category_label,
    reviewCount: p.review_count,
    customPricePerLiter: p.custom_price_per_liter,
    minCustomLiters: p.min_custom_liters,
    displayOrder: p.display_order
  };
}

// Format order for client output
function formatOrder(o) {
  if (!o) return null;
  return {
    ...o,
    address: typeof o.address === 'string' ? JSON.parse(o.address || '{}') : o.address,
    items: typeof o.items === 'string' ? JSON.parse(o.items || '[]') : o.items,
    statusTimeline: typeof o.status_timeline === 'string' ? JSON.parse(o.status_timeline || '[]') : o.status_timeline,
    actionRequest: o.action_request ? (typeof o.action_request === 'string' ? JSON.parse(o.action_request) : o.action_request) : null,
    orderId: o.order_id,
    customerName: o.customer_name,
    couponCode: o.coupon_code,
    deliveryFee: o.delivery_fee,
    paymentMethod: o.payment_method,
    paymentStatus: o.payment_status,
    courierName: o.courier_name,
    trackingNumber: o.tracking_number,
    trackingUrl: o.tracking_url,
    createdDate: o.created_at,
    updatedDate: o.updated_at
  };
}

// ROUTE DISPATCHER
async function handleApiRequest(req, res, pathname, query) {
  const method = req.method.toUpperCase();
  const clientIp = req.socket.remoteAddress || '';

  // -------------------------------------------------------------
  // 1. PUBLIC PRODUCT CATALOG
  // -------------------------------------------------------------
  if (pathname === '/api/products' && method === 'GET') {
    let sql = "SELECT * FROM products WHERE status = 'published'";
    const params = [];

    if (query.category && query.category !== 'all') {
      sql += ' AND category = ?';
      params.push(query.category);
    }
    if (query.inStock === 'true' || query.inStock === '1') {
      sql += ' AND stock > 0';
    }
    if (query.minPrice) {
      sql += ' AND base_price >= ?';
      params.push(Number(query.minPrice));
    }
    if (query.maxPrice) {
      sql += ' AND base_price <= ?';
      params.push(Number(query.maxPrice));
    }
    if (query.search) {
      sql += ' AND (name LIKE ? OR short_description LIKE ? OR category LIKE ?)';
      const term = `%${query.search}%`;
      params.push(term, term, term);
    }

    if (query.sort === 'price-low') {
      sql += ' ORDER BY base_price ASC';
    } else if (query.sort === 'price-high') {
      sql += ' ORDER BY base_price DESC';
    } else if (query.sort === 'rating') {
      sql += ' ORDER BY rating DESC';
    } else if (query.sort === 'newest') {
      sql += ' ORDER BY created_at DESC';
    } else {
      sql += ' ORDER BY display_order ASC, created_at ASC';
    }

    const rows = db.prepare(sql).all(...params);
    return sendJson(res, rows.map(formatProduct));
  }

  if (pathname.startsWith('/api/products/') && method === 'GET') {
    const id = pathname.replace('/api/products/', '');
    const p = db.prepare('SELECT * FROM products WHERE id = ?').get(id);
    if (!p) return sendError(res, 'Product not found', 404);
    return sendJson(res, formatProduct(p));
  }

  // -------------------------------------------------------------
  // 2. PUBLIC JOURNAL
  // -------------------------------------------------------------
  if (pathname === '/api/journal' && method === 'GET') {
    const rows = db.prepare("SELECT * FROM journal WHERE status = 'published' ORDER BY created_at DESC").all();
    return sendJson(res, rows);
  }

  if (pathname.startsWith('/api/journal/') && method === 'GET') {
    const idOrSlug = pathname.replace('/api/journal/', '');
    const row = db.prepare('SELECT * FROM journal WHERE id = ? OR slug = ?').get(idOrSlug, idOrSlug);
    if (!row) return sendError(res, 'Article not found', 404);
    return sendJson(res, row);
  }

  // -------------------------------------------------------------
  // 3. REVIEWS
  // -------------------------------------------------------------
  if (pathname === '/api/reviews' && method === 'GET') {
    let sql = "SELECT * FROM reviews WHERE status = 'approved'";
    const params = [];
    if (query.productId) {
      sql += ' AND product_id = ?';
      params.push(query.productId);
    }
    sql += ' ORDER BY created_at DESC';
    return sendJson(res, db.prepare(sql).all(...params));
  }

  if (pathname === '/api/reviews' && method === 'POST') {
    const body = await parseBody(req);
    const { productId, author, location, rating, title, content } = body;
    if (!productId || !author || !rating || !title || !content) {
      return sendError(res, 'All review fields are required');
    }
    const customer = getAuthenticatedCustomer(req);
    const id = 'rev_' + Date.now() + '_' + crypto.randomBytes(3).toString('hex');
    db.prepare(`
      INSERT INTO reviews (id, product_id, customer_id, author, location, rating, title, content, verified, status, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, 1, 'approved', ?)
    `).run(
      id,
      productId,
      customer ? customer.id : null,
      author.trim(),
      (location || 'Andhra Pradesh & Telangana').trim(),
      Math.min(5, Math.max(1, parseInt(rating, 10))),
      title.trim(),
      content.trim(),
      new Date().toISOString()
    );

    // Update product rating and review count
    const stats = db.prepare("SELECT AVG(rating) as avgRating, COUNT(*) as count FROM reviews WHERE product_id = ? AND status = 'approved'").get(productId);
    if (stats) {
      db.prepare('UPDATE products SET rating = ?, review_count = ? WHERE id = ?')
        .run(Math.round((stats.avgRating || 5) * 10) / 10, stats.count || 0, productId);
    }

    return sendJson(res, { success: true, message: 'Review published' }, 201);
  }

  // -------------------------------------------------------------
  // 4. ENQUIRIES / CONTACT & B2B BULK
  // -------------------------------------------------------------
  if (pathname === '/api/enquiries' && method === 'POST') {
    const body = await parseBody(req);
    const { name, email, phone, organization, location, type, estimatedLiters, application, message } = body;
    if (!name || !email || !phone) {
      return sendError(res, 'Name, email and phone number are required');
    }

    const id = 'enq_' + Date.now() + '_' + crypto.randomBytes(3).toString('hex');
    const now = new Date().toISOString();
    db.prepare(`
      INSERT INTO enquiries (id, name, email, phone, organization, location, type, estimated_liters, application, message, status, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'New', ?, ?)
    `).run(
      id,
      name.trim(),
      email.trim(),
      phone.trim(),
      (organization || '').trim(),
      (location || 'AP / Telangana').trim(),
      type === 'b2b_bulk' ? 'b2b_bulk' : 'contact',
      estimatedLiters || '',
      application || '',
      (message || '').trim(),
      now,
      now
    );

    createNotification(
      'admin',
      'all_admins',
      type === 'b2b_bulk' ? 'New Institutional B2B Quote' : 'New Customer Contact Enquiry',
      `From ${name} (${organization || email}): "${(message || 'Bulk quote request').slice(0, 60)}..."`,
      '#enquiries'
    );

    return sendJson(res, { success: true, message: 'Enquiry received. Our team will contact you shortly.' }, 201);
  }

  // -------------------------------------------------------------
  // 5. COUPON VALIDATION
  // -------------------------------------------------------------
  if (pathname === '/api/coupons/validate' && method === 'POST') {
    const body = await parseBody(req);
    const code = (body.code || '').trim().toUpperCase();
    const cartSubtotal = Number(body.subtotal) || 0;

    const coupon = db.prepare('SELECT * FROM coupons WHERE code = ? AND active = 1').get(code);
    if (!coupon) {
      return sendError(res, 'Invalid or inactive coupon code');
    }

    const now = new Date();
    if (coupon.start_date && new Date(coupon.start_date) > now) {
      return sendError(res, 'Coupon is not yet active');
    }
    if (coupon.expiry_date && new Date(coupon.expiry_date) < now) {
      return sendError(res, 'Coupon has expired');
    }
    if (coupon.usage_limit && coupon.times_used >= coupon.usage_limit) {
      return sendError(res, 'Coupon usage limit has been reached');
    }
    if (coupon.min_order && cartSubtotal < coupon.min_order) {
      return sendError(res, `Minimum order value of ₹${coupon.min_order} required for coupon ${coupon.code}`);
    }

    let discountAmount = 0;
    if (coupon.discount_percent > 0) {
      discountAmount = (cartSubtotal * coupon.discount_percent) / 100;
      if (coupon.max_discount && discountAmount > coupon.max_discount) {
        discountAmount = coupon.max_discount;
      }
    } else if (coupon.discount_fixed > 0) {
      discountAmount = Math.min(cartSubtotal, coupon.discount_fixed);
    }

    return sendJson(res, {
      valid: true,
      code: coupon.code,
      discountPercent: coupon.discount_percent,
      discountAmount: Math.round(discountAmount * 100) / 100,
      freeShipping: Boolean(coupon.free_shipping),
      description: coupon.description
    });
  }

  // -------------------------------------------------------------
  // 6. CUSTOMER AUTHENTICATION
  // -------------------------------------------------------------
  if (pathname === '/api/auth/register' && method === 'POST') {
    if (!checkRateLimit(`reg_${clientIp}`, 10)) {
      return sendError(res, 'Too many registration requests. Please wait a few minutes.', 429);
    }

    const body = await parseBody(req);
    const { name, email, phone, password } = body;
    if (!name || !email || !password) {
      return sendError(res, 'Name, email and password are required');
    }
    if (password.length < 6) {
      return sendError(res, 'Password must be at least 6 characters long');
    }

    const cleanEmail = email.trim().toLowerCase();
    const existing = db.prepare('SELECT id FROM customers WHERE email = ?').get(cleanEmail);
    if (existing) {
      return sendError(res, 'An account with this email address already exists');
    }

    const { hash, salt } = hashPassword(password);
    const customerId = 'cust_' + Date.now() + '_' + crypto.randomBytes(3).toString('hex');
    const now = new Date().toISOString();

    db.prepare(`
      INSERT INTO customers (id, name, email, phone, password_hash, salt, status, addresses, created_at, last_login)
      VALUES (?, ?, ?, ?, ?, ?, 'active', '[]', ?, ?)
    `).run(customerId, name.trim(), cleanEmail, (phone || '').trim(), hash, salt, now, now);

    const { token, expiresAt } = createSession(customerId, 'customer', 30);

    createNotification('admin', 'all_admins', 'New Customer Registered', `Customer ${name} (${cleanEmail}) joined.`);

    const cookieVal = `pb_session=${encodeURIComponent(token)}; Path=/; HttpOnly; SameSite=Strict; Max-Age=${30 * 24 * 60 * 60}`;
    return sendJson(res, {
      success: true,
      token,
      customer: {
        id: customerId,
        name: name.trim(),
        email: cleanEmail,
        phone: (phone || '').trim(),
        addresses: []
      }
    }, 201, { 'Set-Cookie': cookieVal });
  }

  if (pathname === '/api/auth/login' && method === 'POST') {
    const body = await parseBody(req);
    const { email, password } = body;
    if (!email || !password) {
      return sendError(res, 'Email and password are required');
    }

    const cleanEmail = email.trim().toLowerCase();
    if (!checkRateLimit(`log_${cleanEmail}_${clientIp}`, 10)) {
      return sendError(res, 'Too many failed login attempts. Please wait 15 minutes before trying again.', 429);
    }

    const customer = db.prepare('SELECT * FROM customers WHERE email = ?').get(cleanEmail);
    if (!customer) {
      return sendError(res, 'Invalid email or password', 401);
    }

    if (customer.status === 'deactivated') {
      return sendError(res, 'This customer account is deactivated. Please contact customer support.', 403);
    }

    const isValid = verifyPassword(password, customer.password_hash, customer.salt);
    if (!isValid) {
      return sendError(res, 'Invalid email or password', 401);
    }

    const now = new Date().toISOString();
    db.prepare('UPDATE customers SET last_login = ? WHERE id = ?').run(now, customer.id);

    const { token } = createSession(customer.id, 'customer', 30);
    const cookieVal = `pb_session=${encodeURIComponent(token)}; Path=/; HttpOnly; SameSite=Strict; Max-Age=${30 * 24 * 60 * 60}`;

    let parsedAddresses = [];
    try { parsedAddresses = JSON.parse(customer.addresses || '[]'); } catch (e) {}

    return sendJson(res, {
      success: true,
      token,
      customer: {
        id: customer.id,
        name: customer.name,
        email: customer.email,
        phone: customer.phone,
        status: customer.status,
        addresses: parsedAddresses
      }
    }, 200, { 'Set-Cookie': cookieVal });
  }

  if (pathname === '/api/auth/logout' && method === 'POST') {
    const token = getAuthToken(req);
    deleteSession(token);
    const clearCookie = 'pb_session=; Path=/; HttpOnly; SameSite=Strict; Max-Age=0';
    return sendJson(res, { success: true }, 200, { 'Set-Cookie': clearCookie });
  }

  if (pathname === '/api/auth/me' && method === 'GET') {
    const customer = getAuthenticatedCustomer(req);
    if (!customer) {
      return sendError(res, 'Unauthenticated', 401);
    }
    let parsedAddresses = [];
    try { parsedAddresses = JSON.parse(customer.addresses || '[]'); } catch (e) {}
    return sendJson(res, {
      id: customer.id,
      name: customer.name,
      email: customer.email,
      phone: customer.phone,
      status: customer.status,
      addresses: parsedAddresses,
      createdAt: customer.created_at
    });
  }

  // -------------------------------------------------------------
  // 7. CUSTOMER ACCOUNT & PROFILE
  // -------------------------------------------------------------
  if (pathname === '/api/customer/profile' && method === 'PUT') {
    const customer = getAuthenticatedCustomer(req);
    if (!customer) return sendError(res, 'Unauthorized', 401);

    const body = await parseBody(req);
    const { name, phone, currentPassword, newPassword } = body;

    if (name) customer.name = name.trim();
    if (phone !== undefined) customer.phone = phone.trim();

    if (newPassword) {
      if (!currentPassword) return sendError(res, 'Current password is required to set new password');
      const fullRecord = db.prepare('SELECT password_hash, salt FROM customers WHERE id = ?').get(customer.id);
      if (!verifyPassword(currentPassword, fullRecord.password_hash, fullRecord.salt)) {
        return sendError(res, 'Current password verification failed');
      }
      if (newPassword.length < 6) {
        return sendError(res, 'New password must be at least 6 characters');
      }
      const updated = hashPassword(newPassword);
      db.prepare('UPDATE customers SET password_hash = ?, salt = ? WHERE id = ?').run(updated.hash, updated.salt, customer.id);
    }

    db.prepare('UPDATE customers SET name = ?, phone = ? WHERE id = ?').run(customer.name, customer.phone, customer.id);
    return sendJson(res, { success: true, message: 'Profile updated' });
  }

  // Addresses
  if (pathname === '/api/customer/addresses' && method === 'GET') {
    const customer = getAuthenticatedCustomer(req);
    if (!customer) return sendError(res, 'Unauthorized', 401);
    let addresses = [];
    try { addresses = JSON.parse(customer.addresses || '[]'); } catch (e) {}
    return sendJson(res, addresses);
  }

  if (pathname === '/api/customer/addresses' && method === 'POST') {
    const customer = getAuthenticatedCustomer(req);
    if (!customer) return sendError(res, 'Unauthorized', 401);

    const body = await parseBody(req);
    let addresses = [];
    try { addresses = JSON.parse(customer.addresses || '[]'); } catch (e) {}

    const addressId = body.id || 'addr_' + Date.now();
    const newAddr = {
      id: addressId,
      fullName: body.fullName || customer.name,
      phone: body.phone || customer.phone,
      flat: body.flat || '',
      street: body.street || '',
      city: body.city || '',
      district: body.district || '',
      state: body.state || 'Telangana',
      pincode: body.pincode || '',
      isDefault: Boolean(body.isDefault)
    };

    if (newAddr.isDefault) {
      addresses.forEach(a => a.isDefault = false);
    }

    const idx = addresses.findIndex(a => a.id === addressId);
    if (idx >= 0) {
      addresses[idx] = newAddr;
    } else {
      addresses.push(newAddr);
    }

    db.prepare('UPDATE customers SET addresses = ? WHERE id = ?').run(JSON.stringify(addresses), customer.id);
    return sendJson(res, addresses);
  }

  if (pathname.startsWith('/api/customer/addresses/') && method === 'DELETE') {
    const customer = getAuthenticatedCustomer(req);
    if (!customer) return sendError(res, 'Unauthorized', 401);

    const addrId = pathname.replace('/api/customer/addresses/', '');
    let addresses = [];
    try { addresses = JSON.parse(customer.addresses || '[]'); } catch (e) {}
    addresses = addresses.filter(a => a.id !== addrId);
    db.prepare('UPDATE customers SET addresses = ? WHERE id = ?').run(JSON.stringify(addresses), customer.id);
    return sendJson(res, addresses);
  }

  // Favorites
  if (pathname === '/api/customer/favorites' && method === 'GET') {
    const customer = getAuthenticatedCustomer(req);
    if (!customer) return sendJson(res, []);
    const favs = db.prepare('SELECT product_id FROM favorites WHERE customer_id = ?').all(customer.id);
    return sendJson(res, favs.map(f => f.product_id));
  }

  if (pathname === '/api/customer/favorites/toggle' && method === 'POST') {
    const customer = getAuthenticatedCustomer(req);
    if (!customer) return sendError(res, 'Please log in to save favorites to your account', 401);

    const body = await parseBody(req);
    const productId = body.productId;
    if (!productId) return sendError(res, 'Product ID required');

    const existing = db.prepare('SELECT * FROM favorites WHERE customer_id = ? AND product_id = ?').get(customer.id, productId);
    let isFavorite = false;

    if (existing) {
      db.prepare('DELETE FROM favorites WHERE customer_id = ? AND product_id = ?').run(customer.id, productId);
      isFavorite = false;
    } else {
      db.prepare('INSERT INTO favorites (customer_id, product_id, created_at) VALUES (?, ?, ?)')
        .run(customer.id, productId, new Date().toISOString());
      isFavorite = true;
    }

    const allFavs = db.prepare('SELECT product_id FROM favorites WHERE customer_id = ?').all(customer.id);
    return sendJson(res, { isFavorite, favorites: allFavs.map(f => f.product_id) });
  }

  // Cart
  if (pathname === '/api/customer/cart' && method === 'GET') {
    const customer = getAuthenticatedCustomer(req);
    if (!customer) return sendJson(res, []);
    const row = db.prepare('SELECT items FROM carts WHERE customer_id = ?').get(customer.id);
    if (!row) return sendJson(res, []);
    try { return sendJson(res, JSON.parse(row.items || '[]')); } catch (e) { return sendJson(res, []); }
  }

  if (pathname === '/api/customer/cart' && method === 'POST') {
    const customer = getAuthenticatedCustomer(req);
    if (!customer) return sendJson(res, { saved: false });
    const body = await parseBody(req);
    const items = Array.isArray(body.items) ? body.items : [];
    db.prepare(`
      INSERT INTO carts (customer_id, items, updated_at) VALUES (?, ?, ?)
      ON CONFLICT(customer_id) DO UPDATE SET items = excluded.items, updated_at = excluded.updated_at
    `).run(customer.id, JSON.stringify(items), new Date().toISOString());
    return sendJson(res, { saved: true });
  }

  // -------------------------------------------------------------
  // 8. CUSTOMER ORDERS & CHECKOUT
  // -------------------------------------------------------------
  if (pathname === '/api/customer/orders' && method === 'POST') {
    const customer = getAuthenticatedCustomer(req);
    if (!customer) {
      return sendError(res, 'Authentication required for checkout', 401);
    }

    const body = await parseBody(req);
    const { items, address, paymentMethod, couponCode, deliveryNotes, idempotencyKey } = body;

    if (!items || !Array.isArray(items) || items.length === 0) {
      return sendError(res, 'Your cart is empty');
    }
    if (!address || !address.flat || !address.city || !address.pincode) {
      return sendError(res, 'Complete delivery address is required');
    }

    // Idempotency check to prevent duplicate submissions
    if (idempotencyKey) {
      const dup = db.prepare('SELECT * FROM orders WHERE idempotency_key = ?').get(idempotencyKey);
      if (dup) {
        return sendJson(res, formatOrder(dup));
      }
    }

    // Server-side calculation & stock validation
    let serverSubtotal = 0;
    const orderItems = [];

    for (const item of items) {
      const prodId = item.productId || item.id;
      const product = db.prepare('SELECT * FROM products WHERE id = ?').get(prodId);
      if (!product) {
        return sendError(res, `Product "${item.name}" is no longer available`);
      }
      if (product.stock < item.quantity) {
        return sendError(res, `Insufficient stock for "${product.name}". Available: ${product.stock}, requested: ${item.quantity}`);
      }

      let unitPrice = product.base_price;
      if (item.isCustom) {
        unitPrice = (product.custom_price_per_liter || 360) * (item.customLiters || 5);
      } else {
        const variants = JSON.parse(product.variants || '[]');
        const matched = variants.find(v => v.size === item.size);
        if (matched) unitPrice = matched.price;
      }

      const itemTotal = unitPrice * item.quantity;
      serverSubtotal += itemTotal;

      orderItems.push({
        id: prodId,
        productId: prodId,
        name: product.name,
        size: item.size,
        isCustom: Boolean(item.isCustom),
        customLiters: item.customLiters || null,
        quantity: item.quantity,
        unitPrice: unitPrice,
        image: product.image
      });
    }

    // Server coupon discount calculation
    let serverDiscount = 0;
    let appliedCoupon = null;
    if (couponCode) {
      const cp = db.prepare('SELECT * FROM coupons WHERE code = ? AND active = 1').get(couponCode.toUpperCase());
      if (cp && (!cp.min_order || serverSubtotal >= cp.min_order)) {
        appliedCoupon = cp;
        if (cp.discount_percent > 0) {
          serverDiscount = (serverSubtotal * cp.discount_percent) / 100;
          if (cp.max_discount && serverDiscount > cp.max_discount) serverDiscount = cp.max_discount;
        } else if (cp.discount_fixed > 0) {
          serverDiscount = Math.min(serverSubtotal, cp.discount_fixed);
        }
      }
    }

    // Delivery calculation
    const isAPTG = ['Telangana', 'Andhra Pradesh'].includes(address.state);
    let deliveryFee = 0;
    if (appliedCoupon && appliedCoupon.free_shipping) {
      deliveryFee = 0;
    } else if (isAPTG) {
      deliveryFee = serverSubtotal >= 499 ? 0 : 60;
    } else {
      deliveryFee = serverSubtotal >= 999 ? 0 : 120;
    }

    const finalTotal = Math.max(0, Math.round((serverSubtotal - serverDiscount + deliveryFee) * 100) / 100);

    // Generate Unique Order ID
    const orderId = 'PB-2026-' + Math.floor(1000 + Math.random() * 9000);
    const now = new Date().toISOString();

    const initialTimeline = [
      {
        status: 'Order Placed',
        timestamp: new Date().toLocaleString('en-IN', { dateStyle: 'medium', timeStyle: 'short' }),
        note: 'Order confirmed and registered in production system'
      }
    ];

    // Deduct stock for each product in transaction
    for (const item of orderItems) {
      const current = db.prepare('SELECT stock FROM products WHERE id = ?').get(item.productId);
      const newStock = Math.max(0, current.stock - item.quantity);
      db.prepare('UPDATE products SET stock = ?, in_stock = ? WHERE id = ?').run(newStock, newStock > 0 ? 1 : 0, item.productId);

      db.prepare(`
        INSERT INTO inventory_logs (id, product_id, change_amount, previous_stock, new_stock, reason, reference_id, admin_name, created_at)
        VALUES (?, ?, ?, ?, ?, 'order_deduction', ?, 'CUSTOMER_CHECKOUT', ?)
      `).run(
        'inv_' + Date.now() + '_' + crypto.randomBytes(3).toString('hex'),
        item.productId,
        -item.quantity,
        current.stock,
        newStock,
        orderId,
        now
      );
    }

    // Insert Order
    db.prepare(`
      INSERT INTO orders (
        order_id, customer_id, customer_name, email, phone, address, delivery_notes,
        items, subtotal, discount, coupon_code, delivery_fee, total, payment_method,
        payment_status, status, status_timeline, idempotency_key, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'Order Placed', ?, ?, ?, ?)
    `).run(
      orderId,
      customer.id,
      customer.name,
      customer.email,
      customer.phone || address.phone,
      JSON.stringify(address),
      deliveryNotes || '',
      JSON.stringify(orderItems),
      Math.round(serverSubtotal * 100) / 100,
      Math.round(serverDiscount * 100) / 100,
      appliedCoupon ? appliedCoupon.code : null,
      deliveryFee,
      finalTotal,
      paymentMethod || 'Online UPI',
      paymentMethod === 'COD' ? 'Pending (Cash on Delivery)' : 'Paid via UPI/Card',
      JSON.stringify(initialTimeline),
      idempotencyKey || null,
      now,
      now
    );

    // Record Coupon usage if applied
    if (appliedCoupon) {
      db.prepare('UPDATE coupons SET times_used = times_used + 1 WHERE id = ?').run(appliedCoupon.id);
      db.prepare(`
        INSERT INTO coupon_usages (id, coupon_code, customer_id, order_id, created_at)
        VALUES (?, ?, ?, ?, ?)
      `).run('cpu_' + Date.now(), appliedCoupon.code, customer.id, orderId, now);
    }

    // Clear cart in backend
    db.prepare('DELETE FROM carts WHERE customer_id = ?').run(customer.id);

    // Create notifications
    createNotification('customer', customer.id, `Order Placed (#${orderId})`, `Your order for ₹${finalTotal} has been received.`, `#tracking/${orderId}`);
    createNotification('admin', 'all_admins', `New Order #${orderId}`, `₹${finalTotal} from ${customer.name} (${address.city}, ${address.state})`, `#orders`);

    const createdOrder = db.prepare('SELECT * FROM orders WHERE order_id = ?').get(orderId);
    return sendJson(res, formatOrder(createdOrder), 201);
  }

  // Customer order history
  if (pathname === '/api/customer/orders' && method === 'GET') {
    const customer = getAuthenticatedCustomer(req);
    if (!customer) return sendError(res, 'Unauthorized', 401);
    const rows = db.prepare('SELECT * FROM orders WHERE customer_id = ? ORDER BY created_at DESC').all(customer.id);
    return sendJson(res, rows.map(formatOrder));
  }

  if (pathname.startsWith('/api/customer/orders/') && !pathname.endsWith('/action') && method === 'GET') {
    const orderId = pathname.replace('/api/customer/orders/', '');
    const customer = getAuthenticatedCustomer(req);
    // Allow tracking by ID even if guest with order ID, but if customer is logged in check ownership or let public track by ID
    const order = db.prepare('SELECT * FROM orders WHERE order_id = ?').get(orderId);
    if (!order) return sendError(res, 'Order not found', 404);
    if (customer && order.customer_id && order.customer_id !== customer.id) {
      return sendError(res, 'Unauthorized order access', 403);
    }
    return sendJson(res, formatOrder(order));
  }

  if (pathname.endsWith('/action') && pathname.startsWith('/api/customer/orders/') && method === 'POST') {
    const orderId = pathname.replace('/api/customer/orders/', '').replace('/action', '');
    const customer = getAuthenticatedCustomer(req);
    if (!customer) return sendError(res, 'Unauthorized', 401);

    const order = db.prepare('SELECT * FROM orders WHERE order_id = ? AND customer_id = ?').get(orderId, customer.id);
    if (!order) return sendError(res, 'Order not found', 404);

    const body = await parseBody(req);
    const { actionType, reason } = body;
    if (!actionType || !reason) return sendError(res, 'Action type and reason required');

    const newStatus = actionType === 'cancel' ? 'Cancellation Requested' : 'Return Requested';
    let timeline = [];
    try { timeline = JSON.parse(order.status_timeline || '[]'); } catch (e) {}

    timeline.push({
      status: newStatus,
      timestamp: new Date().toLocaleString('en-IN', { dateStyle: 'medium', timeStyle: 'short' }),
      note: `Customer requested ${actionType}: "${reason.trim()}"`
    });

    const actionData = {
      type: actionType,
      reason: reason.trim(),
      requestedAt: new Date().toISOString()
    };

    db.prepare(`
      UPDATE orders SET status = ?, status_timeline = ?, action_request = ?, updated_at = ?
      WHERE order_id = ?
    `).run(newStatus, JSON.stringify(timeline), JSON.stringify(actionData), new Date().toISOString(), orderId);

    createNotification('admin', 'all_admins', `Order #${orderId} ${newStatus}`, `Reason: ${reason.trim()}`, '#orders');

    return sendJson(res, { success: true, status: newStatus });
  }

  // Notifications
  if (pathname === '/api/customer/notifications' && method === 'GET') {
    const customer = getAuthenticatedCustomer(req);
    if (!customer) return sendJson(res, []);
    const notifs = db.prepare("SELECT * FROM notifications WHERE recipient_type = 'customer' AND recipient_id = ? ORDER BY created_at DESC LIMIT 20").all(customer.id);
    return sendJson(res, notifs);
  }

  if (pathname === '/api/customer/notifications/mark-read' && method === 'POST') {
    const customer = getAuthenticatedCustomer(req);
    if (customer) {
      db.prepare("UPDATE notifications SET is_read = 1 WHERE recipient_type = 'customer' AND recipient_id = ?").run(customer.id);
    }
    return sendJson(res, { success: true });
  }

  // -------------------------------------------------------------
  // 9. ADMIN AUTHENTICATION
  // -------------------------------------------------------------
  if (pathname === '/api/admin/auth/login' && method === 'POST') {
    const body = await parseBody(req);
    const { email, password } = body;
    if (!email || !password) return sendError(res, 'Email and password required');

    const cleanEmail = email.trim().toLowerCase();
    if (!checkRateLimit(`admin_log_${cleanEmail}_${clientIp}`, 8)) {
      logAudit(null, cleanEmail, 'ADMIN_LOGIN', 'admin_auth', cleanEmail, 'Rate limit triggered', 'FAILED', clientIp);
      return sendError(res, 'Too many login attempts. Access temporarily locked for 15 minutes.', 429);
    }

    const admin = db.prepare('SELECT * FROM admins WHERE email = ?').get(cleanEmail);
    if (!admin) {
      logAudit(null, cleanEmail, 'ADMIN_LOGIN', 'admin_auth', cleanEmail, 'Invalid credentials', 'FAILED', clientIp);
      return sendError(res, 'Invalid administrator credentials', 401);
    }

    if (admin.status !== 'active') {
      logAudit(admin.id, admin.name, 'ADMIN_LOGIN', 'admin_auth', admin.id, 'Deactivated account attempt', 'FAILED', clientIp);
      return sendError(res, 'Your administrator account has been deactivated.', 403);
    }

    const isValid = verifyPassword(password, admin.password_hash, admin.salt);
    if (!isValid) {
      logAudit(admin.id, admin.name, 'ADMIN_LOGIN', 'admin_auth', admin.id, 'Wrong password', 'FAILED', clientIp);
      return sendError(res, 'Invalid administrator credentials', 401);
    }

    const now = new Date().toISOString();
    db.prepare('UPDATE admins SET last_login = ? WHERE id = ?').run(now, admin.id);

    const { token } = createSession(admin.id, 'admin', 1); // 24-hour admin session
    const cookieVal = `pb_admin_session=${encodeURIComponent(token)}; Path=/; HttpOnly; SameSite=Strict; Max-Age=${24 * 60 * 60}`;

    logAudit(admin.id, admin.name, 'ADMIN_LOGIN', 'admin_auth', admin.id, 'Admin logged in successfully', 'SUCCESS', clientIp);

    let permissions = [];
    try { permissions = JSON.parse(admin.permissions || '[]'); } catch (e) {}

    return sendJson(res, {
      success: true,
      token,
      admin: {
        id: admin.id,
        name: admin.name,
        email: admin.email,
        role: admin.role,
        permissions,
        status: admin.status,
        avatar: admin.avatar
      }
    }, 200, { 'Set-Cookie': cookieVal });
  }

  if (pathname === '/api/admin/auth/logout' && method === 'POST') {
    const admin = getAuthenticatedAdmin(req);
    const token = getAuthToken(req);
    if (admin) {
      logAudit(admin.id, admin.name, 'ADMIN_LOGOUT', 'admin_auth', admin.id, 'Logged out', 'SUCCESS', clientIp);
    }
    deleteSession(token);
    const clearCookie = 'pb_admin_session=; Path=/; HttpOnly; SameSite=Strict; Max-Age=0';
    return sendJson(res, { success: true }, 200, { 'Set-Cookie': clearCookie });
  }

  if (pathname === '/api/admin/auth/me' && method === 'GET') {
    const admin = getAuthenticatedAdmin(req);
    if (!admin) return sendError(res, 'Admin unauthenticated', 401);
    return sendJson(res, admin);
  }

  if (pathname === '/api/admin/profile' && method === 'PUT') {
    const admin = getAuthenticatedAdmin(req);
    if (!admin) return sendError(res, 'Admin unauthorized', 401);

    const body = await parseBody(req);
    const { name, avatar, currentPassword, newPassword } = body;

    if (name) admin.name = name.trim();
    if (avatar !== undefined) admin.avatar = avatar;

    if (newPassword) {
      if (!currentPassword) return sendError(res, 'Current password required');
      const fullRecord = db.prepare('SELECT password_hash, salt FROM admins WHERE id = ?').get(admin.id);
      if (!verifyPassword(currentPassword, fullRecord.password_hash, fullRecord.salt)) {
        return sendError(res, 'Current password verification failed');
      }
      if (newPassword.length < 8) {
        return sendError(res, 'New password must be at least 8 characters');
      }
      const updated = hashPassword(newPassword);
      db.prepare('UPDATE admins SET password_hash = ?, salt = ? WHERE id = ?').run(updated.hash, updated.salt, admin.id);
      logAudit(admin.id, admin.name, 'PASSWORD_CHANGE', 'admin', admin.id, 'Password changed', 'SUCCESS', clientIp);
    }

    db.prepare('UPDATE admins SET name = ?, avatar = ? WHERE id = ?').run(admin.name, admin.avatar || null, admin.id);
    return sendJson(res, { success: true, message: 'Admin profile updated' });
  }

  // -------------------------------------------------------------
  // 10. ADMIN DASHBOARD STATS
  // -------------------------------------------------------------
  if (pathname === '/api/admin/dashboard/stats' && method === 'GET') {
    const admin = getAuthenticatedAdmin(req);
    if (!admin) return sendError(res, 'Unauthorized', 401);

    const totalOrders = db.prepare('SELECT COUNT(*) as count FROM orders').get().count;
    const todayStr = new Date().toISOString().slice(0, 10);
    const todayOrders = db.prepare("SELECT COUNT(*) as count FROM orders WHERE created_at LIKE ?").get(`${todayStr}%`).count;
    const pendingOrders = db.prepare("SELECT COUNT(*) as count FROM orders WHERE status IN ('Order Placed', 'Confirmed')").get().count;
    const totalSalesRow = db.prepare("SELECT SUM(total) as sumSales FROM orders WHERE status NOT IN ('Cancelled')").get();
    const totalSales = totalSalesRow.sumSales || 0;

    const totalCustomers = db.prepare('SELECT COUNT(*) as count FROM customers').get().count;
    const activeCustomers = db.prepare("SELECT COUNT(*) as count FROM customers WHERE status = 'active'").get().count;
    const deactivatedCustomers = totalCustomers - activeCustomers;

    const totalProducts = db.prepare("SELECT COUNT(*) as count FROM products WHERE status != 'archived'").get().count;
    const lowStock = db.prepare("SELECT COUNT(*) as count FROM products WHERE stock < 20 AND status != 'archived'").get().count;
    const outOfStock = db.prepare("SELECT COUNT(*) as count FROM products WHERE stock = 0 AND status != 'archived'").get().count;

    const pendingEnquiries = db.prepare("SELECT COUNT(*) as count FROM enquiries WHERE status = 'New'").get().count;

    const recentOrders = db.prepare('SELECT * FROM orders ORDER BY created_at DESC LIMIT 5').all().map(formatOrder);
    const recentActivity = db.prepare('SELECT * FROM audit_logs ORDER BY created_at DESC LIMIT 6').all();
    const recentEnquiries = db.prepare('SELECT * FROM enquiries ORDER BY created_at DESC LIMIT 5').all();

    return sendJson(res, {
      totalSales,
      totalOrders,
      todayOrders,
      pendingOrders,
      totalCustomers,
      activeCustomers,
      deactivatedCustomers,
      totalProducts,
      lowStock,
      outOfStock,
      pendingEnquiries,
      recentOrders,
      recentActivity,
      recentEnquiries
    });
  }

  // -------------------------------------------------------------
  // 11. ADMIN ORDER MANAGEMENT
  // -------------------------------------------------------------
  if (pathname === '/api/admin/orders' && method === 'GET') {
    const admin = getAuthenticatedAdmin(req);
    if (!admin || !requireAdminPermission(admin, 'orders')) return sendError(res, 'Forbidden: Orders permission required', 403);

    let sql = 'SELECT * FROM orders WHERE 1=1';
    const params = [];

    if (query.status && query.status !== 'all') {
      sql += ' AND status = ?';
      params.push(query.status);
    }
    if (query.search) {
      sql += ' AND (order_id LIKE ? OR customer_name LIKE ? OR email LIKE ? OR phone LIKE ?)';
      const term = `%${query.search}%`;
      params.push(term, term, term, term);
    }

    sql += ' ORDER BY created_at DESC';
    const rows = db.prepare(sql).all(...params);
    return sendJson(res, rows.map(formatOrder));
  }

  if (pathname.startsWith('/api/admin/orders/') && pathname.endsWith('/status') && method === 'PUT') {
    const admin = getAuthenticatedAdmin(req);
    if (!admin || !requireAdminPermission(admin, 'orders')) return sendError(res, 'Forbidden: Orders permission required', 403);

    const orderId = pathname.replace('/api/admin/orders/', '').replace('/status', '');
    const order = db.prepare('SELECT * FROM orders WHERE order_id = ?').get(orderId);
    if (!order) return sendError(res, 'Order not found', 404);

    const body = await parseBody(req);
    const { status, note, courierName, trackingNumber, trackingUrl } = body;
    if (!status) return sendError(res, 'Status required');

    let timeline = [];
    try { timeline = JSON.parse(order.status_timeline || '[]'); } catch (e) {}

    timeline.push({
      status,
      timestamp: new Date().toLocaleString('en-IN', { dateStyle: 'medium', timeStyle: 'short' }),
      note: note || `Status updated to ${status} by ${admin.name}`
    });

    const now = new Date().toISOString();
    let paymentStatus = order.payment_status;
    if (status === 'Delivered' && order.payment_method === 'COD') {
      paymentStatus = 'Paid (Collected on Delivery)';
    } else if (status === 'Refunded') {
      paymentStatus = 'Refunded';
    }

    // If order was newly cancelled or refunded, restore stock!
    if (['Cancelled', 'Refunded'].includes(status) && !['Cancelled', 'Refunded'].includes(order.status)) {
      let items = [];
      try { items = JSON.parse(order.items || '[]'); } catch (e) {}
      for (const item of items) {
        const prod = db.prepare('SELECT stock FROM products WHERE id = ?').get(item.productId || item.id);
        if (prod) {
          const restoredStock = prod.stock + item.quantity;
          db.prepare('UPDATE products SET stock = ?, in_stock = 1 WHERE id = ?').run(restoredStock, item.productId || item.id);
          db.prepare(`
            INSERT INTO inventory_logs (id, product_id, change_amount, previous_stock, new_stock, reason, reference_id, admin_name, created_at)
            VALUES (?, ?, ?, ?, ?, 'order_cancellation_restored', ?, ?, ?)
          `).run(
            'inv_rest_' + Date.now() + '_' + crypto.randomBytes(3).toString('hex'),
            item.productId || item.id,
            item.quantity,
            prod.stock,
            restoredStock,
            orderId,
            admin.name,
            now
          );
        }
      }
    }

    db.prepare(`
      UPDATE orders SET
        status = ?,
        payment_status = ?,
        courier_name = COALESCE(?, courier_name),
        tracking_number = COALESCE(?, tracking_number),
        tracking_url = COALESCE(?, tracking_url),
        status_timeline = ?,
        updated_at = ?
      WHERE order_id = ?
    `).run(
      status,
      paymentStatus,
      courierName || null,
      trackingNumber || null,
      trackingUrl || null,
      JSON.stringify(timeline),
      now,
      orderId
    );

    logAudit(
      admin.id,
      admin.name,
      'ORDER_STATUS_UPDATE',
      'order',
      orderId,
      { previousStatus: order.status, newStatus: status, courierName, trackingNumber },
      'SUCCESS',
      clientIp
    );

    if (order.customer_id) {
      createNotification(
        'customer',
        order.customer_id,
        `Order #${orderId} ${status}`,
        note || `Your order status has changed to ${status}`,
        `#tracking/${orderId}`
      );
    }

    const updated = db.prepare('SELECT * FROM orders WHERE order_id = ?').get(orderId);
    return sendJson(res, formatOrder(updated));
  }

  // -------------------------------------------------------------
  // 12. ADMIN PRODUCT & INVENTORY MANAGEMENT
  // -------------------------------------------------------------
  if (pathname === '/api/admin/products' && method === 'GET') {
    const admin = getAuthenticatedAdmin(req);
    if (!admin || (!requireAdminPermission(admin, 'products') && !requireAdminPermission(admin, 'inventory'))) {
      return sendError(res, 'Forbidden: Products permission required', 403);
    }

    const rows = db.prepare('SELECT * FROM products ORDER BY display_order ASC, created_at DESC').all();
    return sendJson(res, rows.map(formatProduct));
  }

  if (pathname === '/api/admin/products' && method === 'POST') {
    const admin = getAuthenticatedAdmin(req);
    if (!admin || !requireAdminPermission(admin, 'products')) return sendError(res, 'Forbidden: Products permission required', 403);

    const body = await parseBody(req);
    const {
      id, name, category, categoryLabel, badge, shortDescription, image,
      basePrice, baseSize, stock, variants, customPricePerLiter, minCustomLiters,
      ingredients, usageGuide, safetyInfo, environmentalFacts, status
    } = body;

    if (!name || !category || !basePrice) {
      return sendError(res, 'Product name, category, and base price are required');
    }

    const prodId = (id || name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '') || ('prod_' + Date.now())).trim();
    const existing = db.prepare('SELECT id FROM products WHERE id = ?').get(prodId);
    if (existing) return sendError(res, 'A product with this ID or slug already exists');

    const now = new Date().toISOString();
    const numStock = parseInt(stock, 10) || 0;

    db.prepare(`
      INSERT INTO products (
        id, name, category, category_label, badge, rating, review_count, short_description,
        image, base_price, base_size, stock, in_stock, variants, custom_price_per_liter,
        min_custom_liters, ingredients, usage_guide, safety_info, environmental_facts,
        status, display_order, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, 5.0, 0, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 99, ?, ?)
    `).run(
      prodId,
      name.trim(),
      category.trim(),
      (categoryLabel || category).trim(),
      badge || '',
      shortDescription || '',
      image || 'assets/images/hero.jpg',
      Number(basePrice),
      baseSize || '500 ml',
      numStock,
      numStock > 0 ? 1 : 0,
      JSON.stringify(variants || [{ size: baseSize || '500 ml', price: Number(basePrice), inStock: numStock > 0 }]),
      customPricePerLiter ? Number(customPricePerLiter) : null,
      minCustomLiters ? parseInt(minCustomLiters, 10) : null,
      JSON.stringify(ingredients || []),
      JSON.stringify(usageGuide || []),
      safetyInfo || '',
      JSON.stringify(environmentalFacts || []),
      status || 'published',
      now,
      now
    );

    logAudit(admin.id, admin.name, 'PRODUCT_CREATE', 'product', prodId, { name, basePrice, stock }, 'SUCCESS', clientIp);

    const created = db.prepare('SELECT * FROM products WHERE id = ?').get(prodId);
    return sendJson(res, formatProduct(created), 201);
  }

  if (pathname.startsWith('/api/admin/products/') && !pathname.endsWith('/stock') && method === 'PUT') {
    const admin = getAuthenticatedAdmin(req);
    if (!admin || !requireAdminPermission(admin, 'products')) return sendError(res, 'Forbidden: Products permission required', 403);

    const prodId = pathname.replace('/api/admin/products/', '');
    const current = db.prepare('SELECT * FROM products WHERE id = ?').get(prodId);
    if (!current) return sendError(res, 'Product not found', 404);

    const body = await parseBody(req);
    const now = new Date().toISOString();

    const name = body.name !== undefined ? body.name.trim() : current.name;
    const category = body.category !== undefined ? body.category.trim() : current.category;
    const categoryLabel = body.categoryLabel !== undefined ? body.categoryLabel.trim() : current.category_label;
    const badge = body.badge !== undefined ? body.badge : current.badge;
    const shortDesc = body.shortDescription !== undefined ? body.shortDescription : current.short_description;
    const image = body.image !== undefined ? body.image : current.image;
    const basePrice = body.basePrice !== undefined ? Number(body.basePrice) : current.base_price;
    const baseSize = body.baseSize !== undefined ? body.baseSize : current.base_size;
    const status = body.status !== undefined ? body.status : current.status;
    const variants = body.variants !== undefined ? JSON.stringify(body.variants) : current.variants;
    const customPerLiter = body.customPricePerLiter !== undefined ? (body.customPricePerLiter ? Number(body.customPricePerLiter) : null) : current.custom_price_per_liter;
    const minCustom = body.minCustomLiters !== undefined ? (body.minCustomLiters ? parseInt(body.minCustomLiters, 10) : null) : current.min_custom_liters;
    const ingredients = body.ingredients !== undefined ? JSON.stringify(body.ingredients) : current.ingredients;
    const usageGuide = body.usageGuide !== undefined ? JSON.stringify(body.usageGuide) : current.usage_guide;
    const safetyInfo = body.safetyInfo !== undefined ? body.safetyInfo : current.safety_info;
    const envFacts = body.environmentalFacts !== undefined ? JSON.stringify(body.environmentalFacts) : current.environmental_facts;

    db.prepare(`
      UPDATE products SET
        name = ?, category = ?, category_label = ?, badge = ?, short_description = ?,
        image = ?, base_price = ?, base_size = ?, status = ?, variants = ?,
        custom_price_per_liter = ?, min_custom_liters = ?, ingredients = ?,
        usage_guide = ?, safety_info = ?, environmental_facts = ?, updated_at = ?
      WHERE id = ?
    `).run(
      name, category, categoryLabel, badge, shortDesc, image, basePrice, baseSize, status,
      variants, customPerLiter, minCustom, ingredients, usageGuide, safetyInfo, envFacts,
      now, prodId
    );

    logAudit(
      admin.id,
      admin.name,
      'PRODUCT_UPDATE',
      'product',
      prodId,
      { before: { price: current.base_price, name: current.name, status: current.status }, after: { price: basePrice, name, status } },
      'SUCCESS',
      clientIp
    );

    const updated = db.prepare('SELECT * FROM products WHERE id = ?').get(prodId);
    return sendJson(res, formatProduct(updated));
  }

  // Stock Adjustment
  if (pathname.startsWith('/api/admin/products/') && pathname.endsWith('/stock') && method === 'PUT') {
    const admin = getAuthenticatedAdmin(req);
    if (!admin || !requireAdminPermission(admin, 'inventory')) return sendError(res, 'Forbidden: Inventory permission required', 403);

    const prodId = pathname.replace('/api/admin/products/', '').replace('/stock', '');
    const current = db.prepare('SELECT * FROM products WHERE id = ?').get(prodId);
    if (!current) return sendError(res, 'Product not found', 404);

    const body = await parseBody(req);
    const newStock = Math.max(0, parseInt(body.stock, 10));
    const reason = (body.reason || 'manual_adjustment').trim();
    const change = newStock - current.stock;
    const now = new Date().toISOString();

    db.prepare('UPDATE products SET stock = ?, in_stock = ?, updated_at = ? WHERE id = ?')
      .run(newStock, newStock > 0 ? 1 : 0, now, prodId);

    db.prepare(`
      INSERT INTO inventory_logs (id, product_id, change_amount, previous_stock, new_stock, reason, reference_id, admin_name, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      'inv_' + Date.now() + '_' + crypto.randomBytes(3).toString('hex'),
      prodId,
      change,
      current.stock,
      newStock,
      reason,
      admin.id,
      admin.name,
      now
    );

    logAudit(
      admin.id,
      admin.name,
      'STOCK_ADJUSTMENT',
      'product',
      prodId,
      { previousStock: current.stock, newStock, change, reason },
      'SUCCESS',
      clientIp
    );

    if (newStock < 20) {
      createNotification('admin', 'all_admins', 'Low Stock Alert', `Product "${current.name}" stock is at ${newStock} units.`, '#products');
    }

    const updated = db.prepare('SELECT * FROM products WHERE id = ?').get(prodId);
    return sendJson(res, formatProduct(updated));
  }

  // Inventory logs
  if (pathname === '/api/admin/inventory/logs' && method === 'GET') {
    const admin = getAuthenticatedAdmin(req);
    if (!admin || !requireAdminPermission(admin, 'inventory')) return sendError(res, 'Forbidden: Inventory permission required', 403);

    const logs = db.prepare(`
      SELECT il.*, p.name as product_name
      FROM inventory_logs il
      LEFT JOIN products p ON il.product_id = p.id
      ORDER BY il.created_at DESC LIMIT 100
    `).all();
    return sendJson(res, logs);
  }

  // -------------------------------------------------------------
  // 13. ADMIN CUSTOMER MANAGEMENT
  // -------------------------------------------------------------
  if (pathname === '/api/admin/customers' && method === 'GET') {
    const admin = getAuthenticatedAdmin(req);
    if (!admin || !requireAdminPermission(admin, 'customers')) return sendError(res, 'Forbidden: Customers permission required', 403);

    let sql = `
      SELECT c.id, c.name, c.email, c.phone, c.status, c.created_at, c.last_login,
        COUNT(o.order_id) as total_orders,
        COALESCE(SUM(o.total), 0) as total_spent
      FROM customers c
      LEFT JOIN orders o ON c.id = o.customer_id AND o.status != 'Cancelled'
      WHERE 1=1
    `;
    const params = [];

    if (query.status && query.status !== 'all') {
      sql += ' AND c.status = ?';
      params.push(query.status);
    }
    if (query.search) {
      sql += ' AND (c.name LIKE ? OR c.email LIKE ? OR c.phone LIKE ?)';
      const term = `%${query.search}%`;
      params.push(term, term, term);
    }

    sql += ' GROUP BY c.id ORDER BY c.created_at DESC';
    const rows = db.prepare(sql).all(...params);
    return sendJson(res, rows);
  }

  if (pathname.startsWith('/api/admin/customers/') && pathname.endsWith('/status') && method === 'PUT') {
    const admin = getAuthenticatedAdmin(req);
    if (!admin || !requireAdminPermission(admin, 'customers')) return sendError(res, 'Forbidden: Customers permission required', 403);

    const custId = pathname.replace('/api/admin/customers/', '').replace('/status', '');
    const current = db.prepare('SELECT * FROM customers WHERE id = ?').get(custId);
    if (!current) return sendError(res, 'Customer not found', 404);

    const body = await parseBody(req);
    const newStatus = body.status === 'deactivated' ? 'deactivated' : 'active';

    db.prepare('UPDATE customers SET status = ? WHERE id = ?').run(newStatus, custId);

    // If deactivated, kill any active customer sessions
    if (newStatus === 'deactivated') {
      db.prepare("DELETE FROM sessions WHERE user_type = 'customer' AND user_id = ?").run(custId);
    }

    logAudit(
      admin.id,
      admin.name,
      'CUSTOMER_STATUS_CHANGE',
      'customer',
      custId,
      { previousStatus: current.status, newStatus, customerEmail: current.email },
      'SUCCESS',
      clientIp
    );

    return sendJson(res, { success: true, status: newStatus });
  }

  // -------------------------------------------------------------
  // 14. ADMIN JOURNAL CMS
  // -------------------------------------------------------------
  if (pathname === '/api/admin/journal' && method === 'GET') {
    const admin = getAuthenticatedAdmin(req);
    if (!admin || !requireAdminPermission(admin, 'journal')) return sendError(res, 'Forbidden: Journal permission required', 403);
    const rows = db.prepare('SELECT * FROM journal ORDER BY created_at DESC').all();
    return sendJson(res, rows);
  }

  if (pathname === '/api/admin/journal' && method === 'POST') {
    const admin = getAuthenticatedAdmin(req);
    if (!admin || !requireAdminPermission(admin, 'journal')) return sendError(res, 'Forbidden: Journal permission required', 403);

    const body = await parseBody(req);
    const { title, slug, author, readTime, tag, excerpt, content, coverImage, status, seoTitle, seoDescription } = body;
    if (!title || !content) return sendError(res, 'Title and content are required');

    const cleanSlug = (slug || title.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '')).trim();
    const id = 'art_' + Date.now();
    const now = new Date().toISOString();

    db.prepare(`
      INSERT INTO journal (id, title, slug, date, author, read_time, tag, excerpt, content, cover_image, status, seo_title, seo_description, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      id,
      title.trim(),
      cleanSlug,
      new Date().toLocaleDateString('en-IN', { month: 'long', year: 'numeric' }),
      (author || admin.name).trim(),
      readTime || '4 min read',
      tag || 'Bioenzyme Science',
      excerpt || '',
      content,
      coverImage || 'assets/images/hero.jpg',
      status || 'published',
      seoTitle || title,
      seoDescription || excerpt,
      now,
      now
    );

    logAudit(admin.id, admin.name, 'JOURNAL_CREATE', 'journal', id, { title, slug: cleanSlug }, 'SUCCESS', clientIp);
    return sendJson(res, { success: true, id }, 201);
  }

  if (pathname.startsWith('/api/admin/journal/') && method === 'PUT') {
    const admin = getAuthenticatedAdmin(req);
    if (!admin || !requireAdminPermission(admin, 'journal')) return sendError(res, 'Forbidden: Journal permission required', 403);

    const id = pathname.replace('/api/admin/journal/', '');
    const current = db.prepare('SELECT * FROM journal WHERE id = ?').get(id);
    if (!current) return sendError(res, 'Article not found', 404);

    const body = await parseBody(req);
    const now = new Date().toISOString();

    db.prepare(`
      UPDATE journal SET
        title = COALESCE(?, title),
        slug = COALESCE(?, slug),
        author = COALESCE(?, author),
        read_time = COALESCE(?, read_time),
        tag = COALESCE(?, tag),
        excerpt = COALESCE(?, excerpt),
        content = COALESCE(?, content),
        cover_image = COALESCE(?, cover_image),
        status = COALESCE(?, status),
        seo_title = COALESCE(?, seo_title),
        seo_description = COALESCE(?, seo_description),
        updated_at = ?
      WHERE id = ?
    `).run(
      body.title, body.slug, body.author, body.readTime, body.tag, body.excerpt,
      body.content, body.coverImage, body.status, body.seoTitle, body.seoDescription,
      now, id
    );

    logAudit(admin.id, admin.name, 'JOURNAL_UPDATE', 'journal', id, { title: body.title || current.title }, 'SUCCESS', clientIp);
    return sendJson(res, { success: true });
  }

  if (pathname.startsWith('/api/admin/journal/') && method === 'DELETE') {
    const admin = getAuthenticatedAdmin(req);
    if (!admin || !requireAdminPermission(admin, 'journal')) return sendError(res, 'Forbidden: Journal permission required', 403);

    const id = pathname.replace('/api/admin/journal/', '');
    db.prepare('DELETE FROM journal WHERE id = ?').run(id);
    logAudit(admin.id, admin.name, 'JOURNAL_DELETE', 'journal', id, {}, 'SUCCESS', clientIp);
    return sendJson(res, { success: true });
  }

  // -------------------------------------------------------------
  // 15. ADMIN COUPONS & PROMOTIONS
  // -------------------------------------------------------------
  if (pathname === '/api/admin/coupons' && method === 'GET') {
    const admin = getAuthenticatedAdmin(req);
    if (!admin || !requireAdminPermission(admin, 'coupons')) return sendError(res, 'Forbidden: Coupons permission required', 403);
    const rows = db.prepare('SELECT * FROM coupons ORDER BY active DESC, id ASC').all();
    return sendJson(res, rows);
  }

  if (pathname === '/api/admin/coupons' && method === 'POST') {
    const admin = getAuthenticatedAdmin(req);
    if (!admin || !requireAdminPermission(admin, 'coupons')) return sendError(res, 'Forbidden: Coupons permission required', 403);

    const body = await parseBody(req);
    const { code, discountPercent, discountFixed, freeShipping, minOrder, maxDiscount, usageLimit, description } = body;
    if (!code || !description) return sendError(res, 'Coupon code and description required');

    const cleanCode = code.trim().toUpperCase();
    const existing = db.prepare('SELECT id FROM coupons WHERE code = ?').get(cleanCode);
    if (existing) return sendError(res, 'Coupon code already exists');

    const id = 'cp_' + Date.now();
    db.prepare(`
      INSERT INTO coupons (id, code, discount_percent, discount_fixed, free_shipping, min_order, max_discount, usage_limit, description, active)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 1)
    `).run(
      id,
      cleanCode,
      parseInt(discountPercent, 10) || 0,
      Number(discountFixed) || 0,
      freeShipping ? 1 : 0,
      Number(minOrder) || 0,
      maxDiscount ? Number(maxDiscount) : null,
      usageLimit ? parseInt(usageLimit, 10) : null,
      description.trim()
    );

    logAudit(admin.id, admin.name, 'COUPON_CREATE', 'coupon', cleanCode, { code: cleanCode, discountPercent }, 'SUCCESS', clientIp);
    return sendJson(res, { success: true, id }, 201);
  }

  if (pathname.startsWith('/api/admin/coupons/') && method === 'PUT') {
    const admin = getAuthenticatedAdmin(req);
    if (!admin || !requireAdminPermission(admin, 'coupons')) return sendError(res, 'Forbidden: Coupons permission required', 403);

    const id = pathname.replace('/api/admin/coupons/', '');
    const body = await parseBody(req);

    if (body.active !== undefined) {
      db.prepare('UPDATE coupons SET active = ? WHERE id = ?').run(body.active ? 1 : 0, id);
    }
    logAudit(admin.id, admin.name, 'COUPON_UPDATE', 'coupon', id, body, 'SUCCESS', clientIp);
    return sendJson(res, { success: true });
  }

  if (pathname.startsWith('/api/admin/coupons/') && method === 'DELETE') {
    const admin = getAuthenticatedAdmin(req);
    if (!admin || !requireAdminPermission(admin, 'coupons')) return sendError(res, 'Forbidden: Coupons permission required', 403);

    const id = pathname.replace('/api/admin/coupons/', '');
    db.prepare('DELETE FROM coupons WHERE id = ?').run(id);
    logAudit(admin.id, admin.name, 'COUPON_DELETE', 'coupon', id, {}, 'SUCCESS', clientIp);
    return sendJson(res, { success: true });
  }

  // -------------------------------------------------------------
  // 16. ADMIN ENQUIRIES / LEADS
  // -------------------------------------------------------------
  if (pathname === '/api/admin/enquiries' && method === 'GET') {
    const admin = getAuthenticatedAdmin(req);
    if (!admin || !requireAdminPermission(admin, 'enquiries')) return sendError(res, 'Forbidden: Enquiries permission required', 403);

    let sql = 'SELECT * FROM enquiries WHERE 1=1';
    const params = [];
    if (query.type && query.type !== 'all') {
      sql += ' AND type = ?';
      params.push(query.type);
    }
    if (query.status && query.status !== 'all') {
      sql += ' AND status = ?';
      params.push(query.status);
    }
    sql += ' ORDER BY created_at DESC';
    return sendJson(res, db.prepare(sql).all(...params));
  }

  if (pathname.startsWith('/api/admin/enquiries/') && method === 'PUT') {
    const admin = getAuthenticatedAdmin(req);
    if (!admin || !requireAdminPermission(admin, 'enquiries')) return sendError(res, 'Forbidden: Enquiries permission required', 403);

    const id = pathname.replace('/api/admin/enquiries/', '');
    const current = db.prepare('SELECT * FROM enquiries WHERE id = ?').get(id);
    if (!current) return sendError(res, 'Enquiry not found', 404);

    const body = await parseBody(req);
    const now = new Date().toISOString();

    db.prepare(`
      UPDATE enquiries SET
        status = COALESCE(?, status),
        assigned_admin = COALESCE(?, assigned_admin),
        internal_notes = COALESCE(?, internal_notes),
        follow_up_date = COALESCE(?, follow_up_date),
        updated_at = ?
      WHERE id = ?
    `).run(body.status, body.assignedAdmin, body.internalNotes, body.followUpDate, now, id);

    logAudit(admin.id, admin.name, 'ENQUIRY_UPDATE', 'enquiry', id, { status: body.status || current.status }, 'SUCCESS', clientIp);
    return sendJson(res, { success: true });
  }

  // -------------------------------------------------------------
  // 17. ADMIN AUDIT LOGS
  // -------------------------------------------------------------
  if (pathname === '/api/admin/audit-logs' && method === 'GET') {
    const admin = getAuthenticatedAdmin(req);
    if (!admin || !requireAdminPermission(admin, 'audit_log')) return sendError(res, 'Forbidden: Audit log permission required', 403);

    let sql = 'SELECT * FROM audit_logs WHERE 1=1';
    const params = [];
    if (query.targetType) {
      sql += ' AND target_type = ?';
      params.push(query.targetType);
    }
    if (query.search) {
      sql += ' AND (action LIKE ? OR admin_name LIKE ? OR details LIKE ?)';
      const term = `%${query.search}%`;
      params.push(term, term, term);
    }
    sql += ' ORDER BY created_at DESC LIMIT 200';
    return sendJson(res, db.prepare(sql).all(...params));
  }

  // -------------------------------------------------------------
  // 18. ADMIN TEAM MANAGEMENT (Super Admin Only)
  // -------------------------------------------------------------
  if (pathname === '/api/admin/admins' && method === 'GET') {
    const admin = getAuthenticatedAdmin(req);
    if (!admin || admin.role !== 'super_admin') return sendError(res, 'Forbidden: Super Admin access required', 403);

    const rows = db.prepare('SELECT id, name, email, role, permissions, status, created_at, last_login FROM admins ORDER BY created_at ASC').all();
    const formatted = rows.map(r => {
      let perms = [];
      try { perms = JSON.parse(r.permissions || '[]'); } catch (e) {}
      return { ...r, permissions: perms };
    });
    return sendJson(res, formatted);
  }

  if (pathname === '/api/admin/admins' && method === 'POST') {
    const admin = getAuthenticatedAdmin(req);
    if (!admin || admin.role !== 'super_admin') return sendError(res, 'Forbidden: Super Admin access required', 403);

    const body = await parseBody(req);
    const { name, email, password, role, permissions } = body;
    if (!name || !email || !password) return sendError(res, 'Name, email and password required');

    const cleanEmail = email.trim().toLowerCase();
    const existing = db.prepare('SELECT id FROM admins WHERE email = ?').get(cleanEmail);
    if (existing) return sendError(res, 'An admin account with this email already exists');

    const { hash, salt } = hashPassword(password);
    const id = 'admin_' + Date.now();
    const now = new Date().toISOString();

    db.prepare(`
      INSERT INTO admins (id, name, email, password_hash, salt, role, permissions, status, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, 'active', ?)
    `).run(
      id,
      name.trim(),
      cleanEmail,
      hash,
      salt,
      role || 'admin',
      JSON.stringify(permissions || ['orders', 'inventory']),
      now
    );

    logAudit(admin.id, admin.name, 'ADMIN_USER_CREATE', 'admin', id, { email: cleanEmail, role }, 'SUCCESS', clientIp);
    return sendJson(res, { success: true, id }, 201);
  }

  if (pathname.startsWith('/api/admin/admins/') && method === 'PUT') {
    const admin = getAuthenticatedAdmin(req);
    if (!admin || admin.role !== 'super_admin') return sendError(res, 'Forbidden: Super Admin access required', 403);

    const targetId = pathname.replace('/api/admin/admins/', '');
    const target = db.prepare('SELECT * FROM admins WHERE id = ?').get(targetId);
    if (!target) return sendError(res, 'Admin not found', 404);

    const body = await parseBody(req);

    // Prevent deactivating self if super admin
    if (target.id === admin.id && body.status === 'deactivated') {
      return sendError(res, 'You cannot deactivate your own current Super Admin account');
    }

    if (body.role) target.role = body.role;
    if (body.status) target.status = body.status;
    if (body.permissions) target.permissions = JSON.stringify(body.permissions);

    if (body.password) {
      const updated = hashPassword(body.password);
      db.prepare('UPDATE admins SET password_hash = ?, salt = ? WHERE id = ?').run(updated.hash, updated.salt, targetId);
    }

    db.prepare('UPDATE admins SET role = ?, permissions = ?, status = ? WHERE id = ?')
      .run(target.role, target.permissions, target.status, targetId);

    // If deactivated, kill sessions
    if (target.status === 'deactivated') {
      db.prepare("DELETE FROM sessions WHERE user_type = 'admin' AND user_id = ?").run(targetId);
    }

    logAudit(admin.id, admin.name, 'ADMIN_USER_UPDATE', 'admin', targetId, body, 'SUCCESS', clientIp);
    return sendJson(res, { success: true });
  }

  // -------------------------------------------------------------
  // 19. ADMIN MEDIA UPLOAD
  // -------------------------------------------------------------
  if (pathname === '/api/admin/upload' && method === 'POST') {
    const admin = getAuthenticatedAdmin(req);
    if (!admin) return sendError(res, 'Unauthorized', 401);

    const body = await parseBody(req);
    const { base64Data, filename, contentType } = body;
    if (!base64Data || !filename) return sendError(res, 'base64Data and filename required');

    const ext = path.extname(filename).toLowerCase() || '.jpg';
    if (!['.jpg', '.jpeg', '.png', '.webp', '.svg'].includes(ext)) {
      return sendError(res, 'Invalid image format. Allowed: JPG, PNG, WEBP, SVG');
    }

    const cleanName = 'media_' + Date.now() + '_' + filename.replace(/[^a-zA-Z0-9.-]/g, '_');
    const uploadsDir = path.join(__dirname, '..', 'assets', 'images');
    if (!fs.existsSync(uploadsDir)) fs.mkdirSync(uploadsDir, { recursive: true });

    const filePath = path.join(uploadsDir, cleanName);
    const buffer = Buffer.from(base64Data.replace(/^data:image\/\w+;base64,/, ''), 'base64');
    fs.writeFileSync(filePath, buffer);

    const publicUrl = `assets/images/${cleanName}`;
    logAudit(admin.id, admin.name, 'MEDIA_UPLOAD', 'media', cleanName, { filename, publicUrl }, 'SUCCESS', clientIp);

    return sendJson(res, { success: true, url: publicUrl, filename: cleanName });
  }

  // -------------------------------------------------------------
  // 20. ADMIN REPORTS & CSV EXPORT
  // -------------------------------------------------------------
  if (pathname.startsWith('/api/admin/reports/export/') && method === 'GET') {
    const admin = getAuthenticatedAdmin(req);
    if (!admin || !requireAdminPermission(admin, 'reports')) return sendError(res, 'Forbidden: Reports permission required', 403);

    const type = pathname.replace('/api/admin/reports/export/', '');
    let csv = '';
    let filename = `prakriti_${type}_${Date.now()}.csv`;

    if (type === 'orders') {
      const orders = db.prepare('SELECT * FROM orders ORDER BY created_at DESC').all();
      csv = 'Order ID,Customer Name,Email,Phone,City,State,Total,Status,Payment Method,Payment Status,Date\n';
      orders.forEach(o => {
        let addr = {};
        try { addr = JSON.parse(o.address || '{}'); } catch (e) {}
        csv += `"${o.order_id}","${o.customer_name}","${o.email}","${o.phone}","${addr.city || ''}","${addr.state || ''}",${o.total},"${o.status}","${o.payment_method}","${o.payment_status}","${o.created_at}"\n`;
      });
    } else if (type === 'products') {
      const products = db.prepare('SELECT * FROM products ORDER BY name ASC').all();
      csv = 'ID,Name,Category,Base Price,Stock,Status,Rating,Reviews\n';
      products.forEach(p => {
        csv += `"${p.id}","${p.name}","${p.category}",${p.base_price},${p.stock},"${p.status}",${p.rating},${p.review_count}\n`;
      });
    } else if (type === 'inventory') {
      const logs = db.prepare(`
        SELECT il.*, p.name as product_name
        FROM inventory_logs il
        LEFT JOIN products p ON il.product_id = p.id
        ORDER BY il.created_at DESC
      `).all();
      csv = 'Date,Product ID,Product Name,Change,Previous Stock,New Stock,Reason,Admin\n';
      logs.forEach(l => {
        csv += `"${l.created_at}","${l.product_id}","${l.product_name || ''}",${l.change_amount},${l.previous_stock},${l.new_stock},"${l.reason}","${l.admin_name || ''}"\n`;
      });
    } else if (type === 'customers') {
      const customers = db.prepare(`
        SELECT c.*, COUNT(o.order_id) as total_orders, COALESCE(SUM(o.total), 0) as total_spent
        FROM customers c
        LEFT JOIN orders o ON c.id = o.customer_id
        GROUP BY c.id
      `).all();
      csv = 'ID,Name,Email,Phone,Status,Total Orders,Total Spent,Created At,Last Login\n';
      customers.forEach(c => {
        csv += `"${c.id}","${c.name}","${c.email}","${c.phone || ''}","${c.status}",${c.total_orders},${c.total_spent},"${c.created_at}","${c.last_login || ''}"\n`;
      });
    } else if (type === 'enquiries') {
      const enquiries = db.prepare('SELECT * FROM enquiries ORDER BY created_at DESC').all();
      csv = 'ID,Name,Email,Phone,Organization,Location,Type,Status,Assigned Admin,Date\n';
      enquiries.forEach(e => {
        csv += `"${e.id}","${e.name}","${e.email}","${e.phone}","${e.organization || ''}","${e.location}","${e.type}","${e.status}","${e.assigned_admin || ''}","${e.created_at}"\n`;
      });
    } else {
      return sendError(res, 'Unknown report export type', 404);
    }

    res.writeHead(200, {
      'Content-Type': 'text/csv; charset=utf-8',
      'Content-Disposition': `attachment; filename="${filename}"`
    });
    return res.end(csv);
  }

  // -------------------------------------------------------------
  // 21. ADMIN NOTIFICATIONS
  // -------------------------------------------------------------
  if (pathname === '/api/admin/notifications' && method === 'GET') {
    const admin = getAuthenticatedAdmin(req);
    if (!admin) return sendError(res, 'Unauthorized', 401);
    const notifs = db.prepare("SELECT * FROM notifications WHERE recipient_type = 'admin' ORDER BY created_at DESC LIMIT 30").all();
    return sendJson(res, notifs);
  }

  if (pathname === '/api/admin/notifications/mark-read' && method === 'POST') {
    const admin = getAuthenticatedAdmin(req);
    if (admin) {
      db.prepare("UPDATE notifications SET is_read = 1 WHERE recipient_type = 'admin'").run();
    }
    return sendJson(res, { success: true });
  }

  // -------------------------------------------------------------
  // 22. ADMIN GLOBAL SEARCH
  // -------------------------------------------------------------
  if (pathname === '/api/admin/search' && method === 'GET') {
    const admin = getAuthenticatedAdmin(req);
    if (!admin) return sendError(res, 'Unauthorized', 401);

    const q = (query.q || '').trim();
    if (!q) return sendJson(res, { orders: [], customers: [], products: [], enquiries: [] });

    const term = `%${q}%`;
    const orders = db.prepare('SELECT order_id, customer_name, total, status, created_at FROM orders WHERE order_id LIKE ? OR customer_name LIKE ? OR email LIKE ? LIMIT 5').all(term, term, term);
    const customers = db.prepare('SELECT id, name, email, phone, status FROM customers WHERE name LIKE ? OR email LIKE ? OR phone LIKE ? LIMIT 5').all(term, term, term);
    const products = db.prepare('SELECT id, name, base_price, stock, status FROM products WHERE name LIKE ? OR category LIKE ? LIMIT 5').all(term, term);
    const enquiries = db.prepare('SELECT id, name, email, organization, type, status FROM enquiries WHERE name LIKE ? OR organization LIKE ? OR email LIKE ? LIMIT 5').all(term, term, term);

    return sendJson(res, { orders, customers, products, enquiries });
  }

  // 404 for unknown /api/ route
  return sendError(res, `API route not found: ${method} ${pathname}`, 404);
}

module.exports = {
  handleApiRequest
};
