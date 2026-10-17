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
      if (body.length > 15 * 1024 * 1024) { // 15MB limit for media
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
    likesCount: p.likes_count || 0,
    lowStockThreshold: p.low_stock_threshold !== undefined ? p.low_stock_threshold : 20,
    customPricePerLiter: p.custom_price_per_liter,
    minCustomLiters: p.min_custom_liters,
    displayOrder: p.display_order
  };
}

// Admin Auth & RBAC Check Helper
function checkAdminAuth(req, res, requiredPermission = null) {
  const admin = getAuthenticatedAdmin(req);
  if (!admin) {
    sendError(res, 'Unauthorized administrator access', 401);
    return null;
  }
  if (requiredPermission && !requireAdminPermission(admin, requiredPermission)) {
    sendError(res, `Forbidden: '${requiredPermission}' permission required`, 403);
    return null;
  }
  return admin;
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
    } else if (query.sort === 'likes') {
      sql += ' ORDER BY likes_count DESC, rating DESC';
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

  if (pathname.startsWith('/api/products/') && pathname !== '/api/products/likes' && !pathname.endsWith('/like') && method === 'GET') {
    const id = pathname.replace('/api/products/', '');
    const p = db.prepare('SELECT * FROM products WHERE id = ?').get(id);
    if (!p) return sendError(res, 'Product not found', 404);
    return sendJson(res, formatProduct(p));
  }

  // -------------------------------------------------------------
  // 2. PRODUCT LIKES (PERSISTENT, NO DUPLICATES, IMMEDIATE TOGGLE)
  // -------------------------------------------------------------
  if (pathname.startsWith('/api/products/') && pathname.endsWith('/like') && method === 'POST') {
    const productId = pathname.replace('/api/products/', '').replace('/like', '');
    const product = db.prepare('SELECT id, name, likes_count FROM products WHERE id = ?').get(productId);
    if (!product) return sendError(res, 'Product not found', 404);

    const body = await parseBody(req);
    const visitorId = (body.visitorId || req.headers['x-visitor-id'] || '').trim();
    if (!visitorId) {
      return sendError(res, 'Visitor identifier required for liking', 400);
    }

    const existingLike = db.prepare('SELECT id FROM product_likes WHERE product_id = ? AND visitor_id = ?').get(productId, visitorId);
    let liked = false;
    let newCount = product.likes_count || 0;

    if (existingLike) {
      // Remove like (unlike)
      db.prepare('DELETE FROM product_likes WHERE id = ?').run(existingLike.id);
      newCount = Math.max(0, newCount - 1);
      db.prepare('UPDATE products SET likes_count = ? WHERE id = ?').run(newCount, productId);
      liked = false;
    } else {
      // Add like
      const likeId = 'like_' + Date.now() + '_' + crypto.randomBytes(3).toString('hex');
      db.prepare('INSERT INTO product_likes (id, product_id, visitor_id, created_at) VALUES (?, ?, ?, ?)').run(
        likeId, productId, visitorId, new Date().toISOString()
      );
      newCount += 1;
      db.prepare('UPDATE products SET likes_count = ? WHERE id = ?').run(newCount, productId);
      liked = true;
    }

    return sendJson(res, {
      success: true,
      productId,
      liked,
      likesCount: newCount,
      likes_count: newCount
    });
  }

  if (pathname === '/api/products/likes' && method === 'GET') {
    const visitorId = (query.visitorId || req.headers['x-visitor-id'] || '').trim();
    let userLikes = [];
    if (visitorId) {
      const rows = db.prepare('SELECT product_id FROM product_likes WHERE visitor_id = ?').all(visitorId);
      userLikes = rows.map(r => r.product_id);
    }

    const countsRows = db.prepare('SELECT id, likes_count FROM products').all();
    const counts = {};
    countsRows.forEach(r => {
      counts[r.id] = r.likes_count || 0;
    });

    return sendJson(res, {
      userLikes,
      liked_product_ids: userLikes,
      counts
    });
  }

  // -------------------------------------------------------------
  // 3. PUBLIC SITE CONTENT (DYNAMIC CMS DATA)
  // -------------------------------------------------------------
  if (pathname === '/api/content' && method === 'GET') {
    const rows = db.prepare('SELECT section_key, content_data, updated_at FROM site_content').all();
    const content = {};
    rows.forEach(r => {
      try {
        content[r.section_key] = JSON.parse(r.content_data);
      } catch (e) {
        content[r.section_key] = r.content_data;
      }
    });
    return sendJson(res, content);
  }

  if (pathname.startsWith('/api/content/') && method === 'GET') {
    const key = pathname.replace('/api/content/', '');
    const row = db.prepare('SELECT section_key, content_data, updated_at FROM site_content WHERE section_key = ?').get(key);
    if (!row) return sendError(res, 'Content section not found', 404);
    let parsed = null;
    try { parsed = JSON.parse(row.content_data); } catch (e) { parsed = row.content_data; }
    return sendJson(res, { sectionKey: row.section_key, data: parsed, updatedAt: row.updated_at });
  }

  // -------------------------------------------------------------
  // 4. PUBLIC JOURNAL & SCIENCE
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
  // 5. PUBLIC REVIEWS
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
    const id = 'rev_' + Date.now() + '_' + crypto.randomBytes(3).toString('hex');
    db.prepare(`
      INSERT INTO reviews (id, product_id, author, location, rating, title, content, verified, status, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, 1, 'approved', ?)
    `).run(
      id,
      productId,
      author.trim(),
      (location || 'AP & Telangana').trim(),
      Math.min(5, Math.max(1, parseInt(rating, 10))),
      title.trim(),
      content.trim(),
      new Date().toISOString()
    );

    const stats = db.prepare("SELECT AVG(rating) as avgRating, COUNT(*) as count FROM reviews WHERE product_id = ? AND status = 'approved'").get(productId);
    if (stats) {
      db.prepare('UPDATE products SET rating = ?, review_count = ? WHERE id = ?')
        .run(Math.round((stats.avgRating || 5) * 10) / 10, stats.count || 0, productId);
    }

    return sendJson(res, { success: true, message: 'Review published' }, 201);
  }

  // -------------------------------------------------------------
  // 6. ENQUIRIES / CONTACT & B2B BULK
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
      type === 'b2b_bulk' ? 'New Institutional B2B Quote Request' : 'New Customer Contact Enquiry',
      `From ${name} (${organization || email}): "${(message || 'Enquiry request').slice(0, 60)}..."`,
      '#enquiries'
    );

    return sendJson(res, { success: true, message: 'Thank you! Our team will contact you shortly.' }, 201);
  }

  // -------------------------------------------------------------
  // 7. ADMIN AUTHENTICATION
  // -------------------------------------------------------------
  if (pathname === '/api/admin/auth/login' && method === 'POST') {
    const body = await parseBody(req);
    const { email, password } = body;
    if (!email || !password) return sendError(res, 'Email and password required');

    const cleanEmail = email.trim().toLowerCase();
    if (!checkRateLimit(`admin_log_${cleanEmail}_${clientIp}`, 10)) {
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

    const { token } = createSession(admin.id, 'admin', 7); // 7-day session
    const cookieVal = `pb_admin_session=${encodeURIComponent(token)}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${7 * 24 * 60 * 60}`;

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
    const token = getAuthToken(req, 'admin');
    if (admin) {
      logAudit(admin.id, admin.name, 'ADMIN_LOGOUT', 'admin_auth', admin.id, 'Logged out', 'SUCCESS', clientIp);
    }
    deleteSession(token);
    const clearCookie = 'pb_admin_session=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0';
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
  // 8. ADMIN DASHBOARD STATS (ANALYTICS: PRODUCTS, CMS, LIKES, INVENTORY, ACTIVITY)
  // -------------------------------------------------------------
  if (pathname === '/api/admin/dashboard/stats' && method === 'GET') {
    const admin = getAuthenticatedAdmin(req);
    if (!admin) return sendError(res, 'Unauthorized', 401);

    // Products
    const totalProducts = db.prepare("SELECT COUNT(*) as count FROM products WHERE status != 'archived'").get().count;
    const publishedProducts = db.prepare("SELECT COUNT(*) as count FROM products WHERE status = 'published'").get().count;
    const draftProducts = totalProducts - publishedProducts;

    // Blog / Journal
    const totalArticles = db.prepare("SELECT COUNT(*) as count FROM journal").get().count;
    const publishedArticles = db.prepare("SELECT COUNT(*) as count FROM journal WHERE status = 'published'").get().count;

    // Content CMS
    const totalSections = db.prepare("SELECT COUNT(*) as count FROM site_content").get().count;
    const lastContentUpdate = db.prepare("SELECT updated_at, updated_by FROM site_content ORDER BY updated_at DESC LIMIT 1").get();

    // Likes & Engagement
    const totalLikesRow = db.prepare("SELECT SUM(likes_count) as totalLikes FROM products").get();
    const totalLikes = totalLikesRow.totalLikes || 0;
    const topLikedProducts = db.prepare("SELECT id, name, category_label, likes_count, rating FROM products ORDER BY likes_count DESC LIMIT 5").all();
    const recentLikes = db.prepare(`
      SELECT pl.created_at, pl.visitor_id, p.name as product_name
      FROM product_likes pl
      JOIN products p ON pl.product_id = p.id
      ORDER BY pl.created_at DESC LIMIT 6
    `).all();

    // Inventory
    const stockRow = db.prepare("SELECT SUM(stock) as totalUnits, SUM(stock * base_price) as totalValuation FROM products WHERE status != 'archived'").get();
    const totalUnits = stockRow.totalUnits || 0;
    const totalValuation = Math.round((stockRow.totalValuation || 0) * 100) / 100;
    const lowStock = db.prepare("SELECT COUNT(*) as count FROM products WHERE stock <= low_stock_threshold AND status != 'archived'").get().count;
    const outOfStock = db.prepare("SELECT COUNT(*) as count FROM products WHERE stock = 0 AND status != 'archived'").get().count;
    const healthyStock = totalProducts - lowStock;

    // Enquiries
    const totalEnquiries = db.prepare("SELECT COUNT(*) as count FROM enquiries").get().count;
    const newEnquiries = db.prepare("SELECT COUNT(*) as count FROM enquiries WHERE status = 'New'").get().count;
    const b2bEnquiries = db.prepare("SELECT COUNT(*) as count FROM enquiries WHERE type = 'b2b_bulk'").get().count;

    // Recent activity & enquiries
    const recentActivity = db.prepare('SELECT * FROM audit_logs ORDER BY created_at DESC LIMIT 8').all();
    const recentEnquiries = db.prepare('SELECT * FROM enquiries ORDER BY created_at DESC LIMIT 5').all();

    return sendJson(res, {
      products: {
        total: totalProducts,
        published: publishedProducts,
        draft: draftProducts
      },
      journal: {
        total: totalArticles,
        published: publishedArticles
      },
      cms: {
        totalSections,
        lastUpdate: lastContentUpdate ? lastContentUpdate.updated_at : null,
        updatedBy: lastContentUpdate ? lastContentUpdate.updated_by : null
      },
      likes: {
        totalLikes,
        topLikedProducts,
        recentLikes
      },
      inventory: {
        totalUnits,
        totalValuation,
        lowStock,
        outOfStock,
        healthyStock
      },
      enquiries: {
        total: totalEnquiries,
        new: newEnquiries,
        b2b: b2bEnquiries
      },
      recentActivity,
      recentEnquiries
    });
  }

  // -------------------------------------------------------------
  // 9. COMPLETE CMS MANAGEMENT (SITE CONTENT)
  // -------------------------------------------------------------
  if (pathname === '/api/admin/content' && method === 'GET') {
    const admin = checkAdminAuth(req, res, 'cms_content');
    if (!admin) return;

    const rows = db.prepare('SELECT section_key, content_data, updated_at, updated_by FROM site_content ORDER BY section_key ASC').all();
    const result = {};
    rows.forEach(r => {
      let parsed = null;
      try { parsed = JSON.parse(r.content_data); } catch (e) { parsed = r.content_data; }
      result[r.section_key] = {
        data: parsed,
        updatedAt: r.updated_at,
        updatedBy: r.updated_by
      };
    });
    return sendJson(res, result);
  }

  if (pathname.startsWith('/api/admin/content/') && method === 'PUT') {
    const admin = checkAdminAuth(req, res, 'cms_content');
    if (!admin) return;

    const sectionKey = pathname.replace('/api/admin/content/', '').trim();
    if (!sectionKey) return sendError(res, 'Section key required');

    const body = await parseBody(req);
    const contentData = body.data !== undefined ? body.data : body;
    const now = new Date().toISOString();

    db.prepare(`
      INSERT INTO site_content (section_key, content_data, updated_at, updated_by)
      VALUES (?, ?, ?, ?)
      ON CONFLICT(section_key) DO UPDATE SET
        content_data = excluded.content_data,
        updated_at = excluded.updated_at,
        updated_by = excluded.updated_by
    `).run(sectionKey, JSON.stringify(contentData), now, admin.name);

    logAudit(
      admin.id,
      admin.name,
      'CMS_CONTENT_UPDATE',
      'site_content',
      sectionKey,
      { sectionKey, summary: `Updated ${sectionKey}` },
      'SUCCESS',
      clientIp
    );

    return sendJson(res, {
      success: true,
      sectionKey,
      updatedAt: now,
      updatedBy: admin.name
    });
  }

  // -------------------------------------------------------------
  // 10. DEDICATED INVENTORY MANAGEMENT & ANALYTICS
  // -------------------------------------------------------------
  if (pathname === '/api/admin/inventory/summary' && method === 'GET') {
    const admin = checkAdminAuth(req, res, 'inventory');
    if (!admin) return;

    const products = db.prepare('SELECT * FROM products ORDER BY stock ASC, name ASC').all().map(formatProduct);
    const totalUnits = products.reduce((acc, p) => acc + (p.stock || 0), 0);
    const totalValuation = Math.round(products.reduce((acc, p) => acc + ((p.stock || 0) * (p.basePrice || 0)), 0) * 100) / 100;
    const lowStockCount = products.filter(p => p.stock <= (p.lowStockThreshold || 20)).length;
    const outOfStockCount = products.filter(p => p.stock === 0).length;
    const healthyCount = products.length - lowStockCount;

    // Category breakdown
    const categories = {};
    products.forEach(p => {
      const cat = p.categoryLabel || p.category;
      if (!categories[cat]) categories[cat] = { count: 0, units: 0, valuation: 0 };
      categories[cat].count += 1;
      categories[cat].units += (p.stock || 0);
      categories[cat].valuation += ((p.stock || 0) * (p.basePrice || 0));
    });

    const recentMovements = db.prepare(`
      SELECT il.*, p.name as product_name
      FROM inventory_logs il
      LEFT JOIN products p ON il.product_id = p.id
      ORDER BY il.created_at DESC LIMIT 15
    `).all();

    return sendJson(res, {
      totalUnits,
      totalValuation,
      lowStockCount,
      outOfStockCount,
      healthyCount,
      categories,
      products,
      recentMovements
    });
  }

  if (pathname === '/api/admin/inventory/adjust' && method === 'POST') {
    const admin = checkAdminAuth(req, res, 'inventory');
    if (!admin) return;

    const body = await parseBody(req);
    const { productId, action, amount, reason, notes } = body;

    if (!productId || !action) {
      return sendError(res, 'Product ID and adjustment action are required');
    }

    const current = db.prepare('SELECT * FROM products WHERE id = ?').get(productId);
    if (!current) return sendError(res, 'Product not found', 404);

    const changeAmount = parseInt(amount, 10);
    if (isNaN(changeAmount) || changeAmount < 0) {
      return sendError(res, 'A valid non-negative amount is required');
    }

    let newStock = current.stock;
    let netChange = 0;

    if (action === 'add') {
      newStock += changeAmount;
      netChange = changeAmount;
    } else if (action === 'remove') {
      newStock = Math.max(0, newStock - changeAmount);
      netChange = -changeAmount;
    } else if (action === 'set') {
      netChange = changeAmount - current.stock;
      newStock = changeAmount;
    } else {
      return sendError(res, "Invalid action. Use 'add', 'remove', or 'set'");
    }

    const now = new Date().toISOString();
    db.prepare('UPDATE products SET stock = ?, in_stock = ?, updated_at = ? WHERE id = ?')
      .run(newStock, newStock > 0 ? 1 : 0, now, productId);

    const logReason = (reason || (action === 'add' ? 'Stock Restock' : (action === 'remove' ? 'Stock Write-off / Sample' : 'Manual Audit Count'))).trim();
    const finalReason = notes ? `${logReason} (${notes.trim()})` : logReason;

    const logId = 'inv_' + Date.now() + '_' + crypto.randomBytes(3).toString('hex');
    db.prepare(`
      INSERT INTO inventory_logs (id, product_id, change_amount, previous_stock, new_stock, reason, reference_id, admin_name, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      logId,
      productId,
      netChange,
      current.stock,
      newStock,
      finalReason,
      admin.id,
      admin.name,
      now
    );

    logAudit(
      admin.id,
      admin.name,
      'INVENTORY_ADJUSTMENT',
      'inventory',
      productId,
      { product: current.name, action, amount: changeAmount, previousStock: current.stock, newStock, reason: finalReason },
      'SUCCESS',
      clientIp
    );

    // Alert if below threshold
    const threshold = current.low_stock_threshold || 20;
    if (newStock <= threshold) {
      createNotification('admin', 'all_admins', 'Low Stock Alert', `Product "${current.name}" is low on stock (${newStock} units left).`, '#inventory');
    }

    const updated = db.prepare('SELECT * FROM products WHERE id = ?').get(productId);
    return sendJson(res, {
      success: true,
      product: formatProduct(updated),
      log: {
        id: logId,
        changeAmount: netChange,
        previousStock: current.stock,
        newStock,
        reason: finalReason,
        adminName: admin.name,
        createdAt: now
      }
    });
  }

  if (pathname.startsWith('/api/admin/inventory/') && pathname.endsWith('/threshold') && method === 'PUT') {
    const admin = checkAdminAuth(req, res, 'inventory');
    if (!admin) return;

    const prodId = pathname.replace('/api/admin/inventory/', '').replace('/threshold', '');
    const current = db.prepare('SELECT * FROM products WHERE id = ?').get(prodId);
    if (!current) return sendError(res, 'Product not found', 404);

    const body = await parseBody(req);
    const threshold = Math.max(1, parseInt(body.threshold, 10) || 20);

    db.prepare('UPDATE products SET low_stock_threshold = ?, updated_at = ? WHERE id = ?')
      .run(threshold, new Date().toISOString(), prodId);

    logAudit(admin.id, admin.name, 'STOCK_THRESHOLD_UPDATE', 'inventory', prodId, { product: current.name, threshold }, 'SUCCESS', clientIp);
    return sendJson(res, { success: true, lowStockThreshold: threshold });
  }

  if (pathname === '/api/admin/inventory/logs' && method === 'GET') {
    const admin = checkAdminAuth(req, res, 'inventory');
    if (!admin) return;

    let sql = `
      SELECT il.*, p.name as product_name
      FROM inventory_logs il
      LEFT JOIN products p ON il.product_id = p.id
      WHERE 1=1
    `;
    const params = [];
    if (query.productId) {
      sql += ' AND il.product_id = ?';
      params.push(query.productId);
    }
    if (query.search) {
      sql += ' AND (p.name LIKE ? OR il.reason LIKE ? OR il.admin_name LIKE ?)';
      const term = `%${query.search}%`;
      params.push(term, term, term);
    }
    sql += ' ORDER BY il.created_at DESC LIMIT 150';

    const logs = db.prepare(sql).all(...params);
    return sendJson(res, logs);
  }

  // -------------------------------------------------------------
  // 11. INVENTORY CSV EXPORT
  // -------------------------------------------------------------
  if (pathname === '/api/admin/inventory/export' && method === 'GET') {
    const admin = checkAdminAuth(req, res, 'inventory');
    if (!admin) return;

    const products = db.prepare('SELECT * FROM products ORDER BY name ASC').all();
    let csv = 'Product ID,Product Name,Category,Base Price (INR),Stock Units,Threshold,Valuation (INR),Status,Rating,Likes\n';
    products.forEach(p => {
      const val = (p.stock || 0) * (p.base_price || 0);
      csv += `"${p.id}","${p.name.replace(/"/g, '""')}","${p.category_label || p.category}",${p.base_price},${p.stock},${p.low_stock_threshold || 20},${val},"${p.status}",${p.rating},${p.likes_count || 0}\n`;
    });

    const filename = `prakriti_inventory_status_${Date.now()}.csv`;
    res.writeHead(200, {
      'Content-Type': 'text/csv; charset=utf-8',
      'Content-Disposition': `attachment; filename="${filename}"`
    });
    return res.end(csv);
  }

  if (pathname === '/api/admin/inventory/logs/export' && method === 'GET') {
    const admin = checkAdminAuth(req, res, 'inventory');
    if (!admin) return;

    const logs = db.prepare(`
      SELECT il.*, p.name as product_name
      FROM inventory_logs il
      LEFT JOIN products p ON il.product_id = p.id
      ORDER BY il.created_at DESC LIMIT 500
    `).all();

    let csv = 'Timestamp,Product ID,Product Name,Change Units,Previous Stock,New Stock,Reason,Admin User\n';
    logs.forEach(l => {
      csv += `"${l.created_at}","${l.product_id}","${(l.product_name || '').replace(/"/g, '""')}",${l.change_amount},${l.previous_stock},${l.new_stock},"${(l.reason || '').replace(/"/g, '""')}","${l.admin_name || ''}"\n`;
    });

    const filename = `prakriti_inventory_history_${Date.now()}.csv`;
    res.writeHead(200, {
      'Content-Type': 'text/csv; charset=utf-8',
      'Content-Disposition': `attachment; filename="${filename}"`
    });
    return res.end(csv);
  }

  // -------------------------------------------------------------
  // 12. ADMIN PRODUCT MANAGEMENT (CATALOGUE CRUD)
  // -------------------------------------------------------------
  if (pathname === '/api/admin/products' && method === 'GET') {
    const admin = checkAdminAuth(req, res);
    if (!admin) return;
    if (!requireAdminPermission(admin, 'products') && !requireAdminPermission(admin, 'inventory')) {
      return sendError(res, 'Forbidden: Products permission required', 403);
    }

    const rows = db.prepare('SELECT * FROM products ORDER BY display_order ASC, created_at DESC').all();
    return sendJson(res, rows.map(formatProduct));
  }

  if (pathname === '/api/admin/products' && method === 'POST') {
    const admin = checkAdminAuth(req, res, 'products');
    if (!admin) return;

    const body = await parseBody(req);
    const {
      id, name, category, categoryLabel, badge, shortDescription, image,
      basePrice, baseSize, stock, variants, customPricePerLiter, minCustomLiters,
      ingredients, usageGuide, safetyInfo, environmentalFacts, status, lowStockThreshold
    } = body;

    if (!name || !category || !basePrice) {
      return sendError(res, 'Product name, category, and base price are required');
    }

    const prodId = (id || name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '') || ('prod_' + Date.now())).trim();
    const existing = db.prepare('SELECT id FROM products WHERE id = ?').get(prodId);
    if (existing) return sendError(res, 'A product with this ID or slug already exists');

    const now = new Date().toISOString();
    const numStock = parseInt(stock, 10) || 0;
    const threshold = parseInt(lowStockThreshold, 10) || 20;

    db.prepare(`
      INSERT INTO products (
        id, name, category, category_label, badge, rating, review_count, short_description,
        image, base_price, base_size, stock, in_stock, variants, custom_price_per_liter,
        min_custom_liters, ingredients, usage_guide, safety_info, environmental_facts,
        status, display_order, likes_count, low_stock_threshold, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, 5.0, 0, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 99, 0, ?, ?, ?)
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
      threshold,
      now,
      now
    );

    // Initial stock log
    if (numStock > 0) {
      db.prepare(`
        INSERT INTO inventory_logs (id, product_id, change_amount, previous_stock, new_stock, reason, reference_id, admin_name, created_at)
        VALUES (?, ?, ?, 0, ?, 'initial_creation', ?, ?, ?)
      `).run(
        'inv_' + Date.now() + '_' + crypto.randomBytes(3).toString('hex'),
        prodId,
        numStock,
        numStock,
        admin.id,
        admin.name,
        now
      );
    }

    logAudit(admin.id, admin.name, 'PRODUCT_CREATE', 'product', prodId, { name, basePrice, stock: numStock }, 'SUCCESS', clientIp);

    const created = db.prepare('SELECT * FROM products WHERE id = ?').get(prodId);
    return sendJson(res, formatProduct(created), 201);
  }

  if (pathname.startsWith('/api/admin/products/') && !pathname.endsWith('/stock') && method === 'PUT') {
    const admin = checkAdminAuth(req, res, 'products');
    if (!admin) return;

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
    const threshold = body.lowStockThreshold !== undefined ? parseInt(body.lowStockThreshold, 10) : current.low_stock_threshold;

    db.prepare(`
      UPDATE products SET
        name = ?, category = ?, category_label = ?, badge = ?, short_description = ?,
        image = ?, base_price = ?, base_size = ?, status = ?, variants = ?,
        custom_price_per_liter = ?, min_custom_liters = ?, ingredients = ?,
        usage_guide = ?, safety_info = ?, environmental_facts = ?, low_stock_threshold = ?, updated_at = ?
      WHERE id = ?
    `).run(
      name, category, categoryLabel, badge, shortDesc, image, basePrice, baseSize, status,
      variants, customPerLiter, minCustom, ingredients, usageGuide, safetyInfo, envFacts, threshold,
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

  if (pathname.startsWith('/api/admin/products/') && method === 'DELETE') {
    const admin = checkAdminAuth(req, res, 'products');
    if (!admin) return;

    const prodId = pathname.replace('/api/admin/products/', '');
    const current = db.prepare('SELECT * FROM products WHERE id = ?').get(prodId);
    if (!current) return sendError(res, 'Product not found', 404);

    db.prepare('DELETE FROM products WHERE id = ?').run(prodId);
    db.prepare('DELETE FROM product_likes WHERE product_id = ?').run(prodId);

    logAudit(admin.id, admin.name, 'PRODUCT_DELETE', 'product', prodId, { name: current.name }, 'SUCCESS', clientIp);
    return sendJson(res, { success: true, message: 'Product deleted' });
  }

  // -------------------------------------------------------------
  // 13. ADMIN JOURNAL CMS
  // -------------------------------------------------------------
  if (pathname === '/api/admin/journal' && method === 'GET') {
    const admin = checkAdminAuth(req, res, 'journal');
    if (!admin) return;
    const rows = db.prepare('SELECT * FROM journal ORDER BY created_at DESC').all();
    return sendJson(res, rows);
  }

  if (pathname === '/api/admin/journal' && method === 'POST') {
    const admin = checkAdminAuth(req, res, 'journal');
    if (!admin) return;

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
    const admin = checkAdminAuth(req, res, 'journal');
    if (!admin) return;

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
    const admin = checkAdminAuth(req, res, 'journal');
    if (!admin) return;

    const id = pathname.replace('/api/admin/journal/', '');
    db.prepare('DELETE FROM journal WHERE id = ?').run(id);
    logAudit(admin.id, admin.name, 'JOURNAL_DELETE', 'journal', id, {}, 'SUCCESS', clientIp);
    return sendJson(res, { success: true });
  }

  // -------------------------------------------------------------
  // 14. ADMIN ENQUIRIES / LEADS
  // -------------------------------------------------------------
  if (pathname === '/api/admin/enquiries' && method === 'GET') {
    const admin = checkAdminAuth(req, res, 'enquiries');
    if (!admin) return;

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
    const admin = checkAdminAuth(req, res, 'enquiries');
    if (!admin) return;

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
  // 15. ADMIN AUDIT LOGS
  // -------------------------------------------------------------
  if (pathname === '/api/admin/audit-logs' && method === 'GET') {
    const admin = checkAdminAuth(req, res, 'audit_log');
    if (!admin) return;

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
    sql += ' ORDER BY created_at DESC LIMIT 250';
    return sendJson(res, db.prepare(sql).all(...params));
  }

  // -------------------------------------------------------------
  // 16. ADMIN TEAM MANAGEMENT (SUPER ADMIN ONLY)
  // -------------------------------------------------------------
  if (pathname === '/api/admin/admins' && method === 'GET') {
    const admin = checkAdminAuth(req, res);
    if (!admin) return;
    if (admin.role !== 'super_admin') return sendError(res, 'Forbidden: Super Admin access required', 403);

    const rows = db.prepare('SELECT id, name, email, role, permissions, status, created_at, last_login FROM admins ORDER BY created_at ASC').all();
    const formatted = rows.map(r => {
      let perms = [];
      try { perms = JSON.parse(r.permissions || '[]'); } catch (e) {}
      return { ...r, permissions: perms };
    });
    return sendJson(res, formatted);
  }

  if (pathname === '/api/admin/admins' && method === 'POST') {
    const admin = checkAdminAuth(req, res);
    if (!admin) return;
    if (admin.role !== 'super_admin') return sendError(res, 'Forbidden: Super Admin access required', 403);

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
      JSON.stringify(permissions || ['inventory', 'cms_content', 'products']),
      now
    );

    logAudit(admin.id, admin.name, 'ADMIN_USER_CREATE', 'admin', id, { email: cleanEmail, role }, 'SUCCESS', clientIp);
    return sendJson(res, { success: true, id }, 201);
  }

  if (pathname.startsWith('/api/admin/admins/') && method === 'PUT') {
    const admin = checkAdminAuth(req, res);
    if (!admin) return;
    if (admin.role !== 'super_admin') return sendError(res, 'Forbidden: Super Admin access required', 403);

    const targetId = pathname.replace('/api/admin/admins/', '');
    const target = db.prepare('SELECT * FROM admins WHERE id = ?').get(targetId);
    if (!target) return sendError(res, 'Admin not found', 404);

    const body = await parseBody(req);

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

    if (target.status === 'deactivated') {
      db.prepare("DELETE FROM sessions WHERE user_type = 'admin' AND user_id = ?").run(targetId);
    }

    logAudit(admin.id, admin.name, 'ADMIN_USER_UPDATE', 'admin', targetId, body, 'SUCCESS', clientIp);
    return sendJson(res, { success: true });
  }

  // -------------------------------------------------------------
  // 17. ADMIN MEDIA MANAGEMENT & UPLOAD
  // -------------------------------------------------------------
  if (pathname === '/api/admin/media' && method === 'GET') {
    const admin = getAuthenticatedAdmin(req);
    if (!admin) return sendError(res, 'Unauthorized', 401);

    const rows = db.prepare('SELECT * FROM media_library ORDER BY created_at DESC').all();
    return sendJson(res, rows);
  }

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
    const mediaId = 'med_' + Date.now();

    db.prepare(`
      INSERT INTO media_library (id, filename, url, file_size, mime_type, uploaded_by, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `).run(
      mediaId,
      cleanName,
      publicUrl,
      buffer.length,
      contentType || 'image/jpeg',
      admin.name,
      new Date().toISOString()
    );

    logAudit(admin.id, admin.name, 'MEDIA_UPLOAD', 'media', cleanName, { filename, publicUrl }, 'SUCCESS', clientIp);

    return sendJson(res, { success: true, url: publicUrl, filename: cleanName, id: mediaId });
  }

  // -------------------------------------------------------------
  // 18. ADMIN NOTIFICATIONS
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
  // 19. ADMIN GLOBAL SEARCH
  // -------------------------------------------------------------
  if (pathname === '/api/admin/search' && method === 'GET') {
    const admin = getAuthenticatedAdmin(req);
    if (!admin) return sendError(res, 'Unauthorized', 401);

    const q = (query.q || '').trim();
    if (!q) return sendJson(res, { products: [], enquiries: [], journal: [] });

    const term = `%${q}%`;
    const products = db.prepare('SELECT id, name, base_price, stock, likes_count, status FROM products WHERE name LIKE ? OR category LIKE ? LIMIT 6').all(term, term);
    const enquiries = db.prepare('SELECT id, name, email, organization, type, status FROM enquiries WHERE name LIKE ? OR organization LIKE ? OR email LIKE ? LIMIT 6').all(term, term, term);
    const journal = db.prepare('SELECT id, title, slug, tag, status FROM journal WHERE title LIKE ? OR excerpt LIKE ? LIMIT 6').all(term, term);

    return sendJson(res, { products, enquiries, journal });
  }

  // 404 for unknown /api/ route
  return sendError(res, `API route not found: ${method} ${pathname}`, 404);
}

module.exports = {
  handleApiRequest
};
