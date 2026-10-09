const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const { db, hashPassword, verifyPassword } = require('./db');

// In-memory rate limiter for auth endpoints
const rateLimits = new Map();
function checkRateLimit(key, maxAttempts = 10, windowMs = 15 * 60 * 1000) {
  const now = Date.now();
  const entry = rateLimits.get(key) || { count: 0, resetAt: now + windowMs };
  if (now > entry.resetAt) {
    entry.count = 1;
    entry.resetAt = now + windowMs;
  } else {
    entry.count += 1;
  }
  rateLimits.set(key, entry);
  return entry.count <= maxAttempts;
}

// Session Helpers
function createSession(userId, userType, durationDays = 30) {
  const token = crypto.randomBytes(32).toString('hex');
  const now = new Date();
  const expiresAt = new Date(now.getTime() + durationDays * 24 * 60 * 60 * 1000).toISOString();
  db.prepare(`
    INSERT INTO sessions (token, user_type, user_id, created_at, expires_at)
    VALUES (?, ?, ?, ?, ?)
  `).run(token, userType, userId, now.toISOString(), expiresAt);
  return { token, expiresAt };
}

function getSession(token) {
  if (!token) return null;
  const session = db.prepare('SELECT * FROM sessions WHERE token = ?').get(token);
  if (!session) return null;
  if (new Date(session.expires_at) < new Date()) {
    db.prepare('DELETE FROM sessions WHERE token = ?').run(token);
    return null;
  }
  return session;
}

function deleteSession(token) {
  if (token) {
    db.prepare('DELETE FROM sessions WHERE token = ?').run(token);
  }
}

// Audit Log Helper
function logAudit(adminId, adminName, action, targetType, targetId, details, result = 'SUCCESS', ip = '') {
  try {
    const id = 'audit_' + Date.now() + '_' + crypto.randomBytes(4).toString('hex');
    db.prepare(`
      INSERT INTO audit_logs (id, admin_id, admin_name, action, target_type, target_id, details, result, ip_address, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      id,
      adminId || 'unknown',
      adminName || 'Admin',
      action,
      targetType,
      targetId || '',
      typeof details === 'object' ? JSON.stringify(details) : details,
      result,
      ip,
      new Date().toISOString()
    );
  } catch (err) {
    console.error('Audit log error:', err);
  }
}

// Notification Helper
function createNotification(recipientType, recipientId, title, message, link = '') {
  try {
    const id = 'notif_' + Date.now() + '_' + crypto.randomBytes(4).toString('hex');
    db.prepare(`
      INSERT INTO notifications (id, recipient_type, recipient_id, title, message, link, is_read, created_at)
      VALUES (?, ?, ?, ?, ?, ?, 0, ?)
    `).run(id, recipientType, recipientId, title, message, link, new Date().toISOString());
  } catch (err) {
    console.error('Notification error:', err);
  }
}

// Auth extractors
function getAuthToken(req) {
  const authHeader = req.headers['authorization'];
  if (authHeader && authHeader.startsWith('Bearer ')) {
    return authHeader.substring(7).trim();
  }
  const cookieHeader = req.headers['cookie'];
  if (cookieHeader) {
    const match = cookieHeader.match(/(?:^|;\s*)pb_session=([^;]+)/);
    if (match) return decodeURIComponent(match[1]);
  }
  return null;
}

function getAuthenticatedCustomer(req) {
  const token = getAuthToken(req);
  const session = getSession(token);
  if (!session || session.user_type !== 'customer') return null;
  const customer = db.prepare('SELECT id, name, email, phone, status, addresses, created_at, last_login FROM customers WHERE id = ?').get(session.user_id);
  if (!customer || customer.status !== 'active') return null;
  return { ...customer, sessionToken: token };
}

function getAuthenticatedAdmin(req) {
  const token = getAuthToken(req);
  const session = getSession(token);
  if (!session || session.user_type !== 'admin') return null;
  const admin = db.prepare('SELECT id, name, email, role, permissions, status, avatar, created_at, last_login FROM admins WHERE id = ?').get(session.user_id);
  if (!admin || admin.status !== 'active') return null;
  try {
    admin.permissions = JSON.parse(admin.permissions || '[]');
  } catch (e) {
    admin.permissions = [];
  }
  return { ...admin, sessionToken: token };
}

function requireAdminPermission(admin, permission) {
  if (!admin) return false;
  if (admin.role === 'super_admin') return true;
  return Array.isArray(admin.permissions) && admin.permissions.includes(permission);
}

module.exports = {
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
};
