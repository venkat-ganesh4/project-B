/**
 * Prakriti Bio - Dedicated Admin Management & CMS Application
 * Powers Dashboard Analytics, Complete Site Content CMS,
 * Inventory Management, Product Catalogue, Blog CMS, Likes Analytics,
 * and Role-Based Access Control.
 */

const AdminApp = {
  currentTab: 'dashboard',
  currentAdmin: null,
  activeCmsSection: 'announcement_banner',
  inventoryFilter: 'all',
  cachedInventory: null,

  async init() {
    this.bindEvents();
    
    // Check if URL has specific hash or query
    const hash = window.location.hash.replace('#', '') || 'dashboard';
    this.currentTab = hash;

    // Check if session exists
    const admin = await Store.verifyAdminSession();
    if (admin) {
      this.currentAdmin = admin;
      this.showPortal();
    } else {
      this.showLogin();
    }
  },

  bindEvents() {
    window.addEventListener('hashchange', () => {
      const hash = window.location.hash.replace('#', '') || 'dashboard';
      if (this.currentAdmin) {
        this.switchTab(hash);
      }
    });

    window.addEventListener('pb:admin_login', (e) => {
      this.currentAdmin = e.detail;
      this.showPortal();
    });

    window.addEventListener('pb:admin_logout', () => {
      this.currentAdmin = null;
      this.showLogin();
    });
  },

  toast(message, type = 'success') {
    const container = document.getElementById('admin-toast-container');
    if (!container) return;

    const el = document.createElement('div');
    el.className = `admin-toast toast-${type}`;
    el.style.cssText = `
      background: ${type === 'danger' ? '#C62828' : (type === 'warning' ? '#B76E00' : '#1B3529')};
      color: #FFFFFF;
      padding: 12px 20px;
      border-radius: 6px;
      box-shadow: 0 4px 16px rgba(0,0,0,0.15);
      font-size: 0.875rem;
      margin-bottom: 8px;
      display: flex;
      align-items: center;
      gap: 10px;
      transition: all 0.3s ease;
    `;
    el.innerHTML = `<span>${message}</span>`;
    container.appendChild(el);

    setTimeout(() => {
      el.style.opacity = '0';
      setTimeout(() => el.remove(), 300);
    }, 3500);
  },

  // -------------------------------------------------------------
  // VIEW SWITCHING (LOGIN VS PORTAL)
  // -------------------------------------------------------------
  showLogin() {
    const loginView = document.getElementById('admin-login-view');
    const portalView = document.getElementById('admin-portal-view');
    if (loginView) loginView.style.display = 'flex';
    if (portalView) portalView.style.display = 'none';
  },

  showPortal() {
    const loginView = document.getElementById('admin-login-view');
    const portalView = document.getElementById('admin-portal-view');
    if (loginView) loginView.style.display = 'none';
    if (portalView) portalView.style.display = 'flex';

    // Update user info in topbar
    if (this.currentAdmin) {
      const nameEl = document.getElementById('admin-user-name');
      const roleEl = document.getElementById('admin-user-role');
      const avatarEl = document.getElementById('admin-user-avatar');
      if (nameEl) nameEl.textContent = this.currentAdmin.name;
      if (roleEl) roleEl.textContent = this.currentAdmin.role === 'super_admin' ? 'Super Admin' : (this.currentAdmin.role === 'admin' ? 'Content Admin' : 'Staff');
      if (avatarEl) avatarEl.textContent = (this.currentAdmin.name || 'A').charAt(0).toUpperCase();

      // Show/hide RBAC tab based on role
      const teamNav = document.querySelector('[data-tab="admins"]');
      if (teamNav) {
        teamNav.style.display = this.currentAdmin.role === 'super_admin' ? 'flex' : 'none';
      }
    }

    this.switchTab(this.currentTab || 'dashboard');
  },

  async handleLogin(e) {
    e.preventDefault();
    const form = e.target;
    const email = form.email.value.trim();
    const password = form.password.value;
    const errorEl = document.getElementById('admin-login-error');
    if (errorEl) errorEl.style.display = 'none';

    try {
      await Store.adminLogin(email, password);
      this.toast(`Welcome back, ${email}`);
    } catch (err) {
      if (errorEl) {
        errorEl.textContent = err.message || 'Invalid administrator credentials';
        errorEl.style.display = 'block';
      }
    }
  },

  async handleLogout() {
    await Store.adminLogout();
    this.toast('Logged out successfully', 'info');
  },

  switchTab(tabName) {
    this.currentTab = tabName;
    window.location.hash = `#${tabName}`;

    // Update sidebar navigation active state
    document.querySelectorAll('.admin-nav-item').forEach(el => {
      if (el.dataset.tab === tabName) {
        el.classList.add('active');
      } else {
        el.classList.remove('active');
      }
    });

    // Hide all view panes
    document.querySelectorAll('.admin-tab-pane').forEach(el => {
      el.style.display = 'none';
    });

    // Show target view pane
    const target = document.getElementById(`pane-${tabName}`);
    if (target) {
      target.style.display = 'block';
    } else {
      const fallback = document.getElementById('pane-dashboard');
      if (fallback) fallback.style.display = 'block';
    }

    // Update topbar title
    const titleMap = {
      dashboard: 'Operations & Performance Dashboard',
      cms: 'Complete Site Content CMS',
      inventory: 'Inventory & Stock Management',
      products: 'Product Catalogue Manager',
      journal: 'Science & Journal Articles CMS',
      likes: 'Customer Likes & Community Engagement',
      admins: 'Team Members & Role-Based Access Control',
      audit: 'Administrator Activity & Audit Stream',
      hosting: 'Hosting Architecture & Deployment Guide'
    };
    const titleEl = document.getElementById('admin-topbar-title');
    if (titleEl) titleEl.textContent = titleMap[tabName] || 'Admin Console';

    // Call tab-specific loader
    if (tabName === 'dashboard') this.loadDashboard();
    else if (tabName === 'cms') this.loadCms();
    else if (tabName === 'inventory') this.loadInventory();
    else if (tabName === 'products') this.loadProducts();
    else if (tabName === 'journal') this.loadJournal();
    else if (tabName === 'likes') this.loadLikes();
    else if (tabName === 'admins') this.loadAdmins();
    else if (tabName === 'audit') this.loadAudit();
  },

  // -------------------------------------------------------------
  // TAB 1: DASHBOARD ANALYTICS
  // -------------------------------------------------------------
  async loadDashboard() {
    try {
      const stats = await Store.getAdminDashboardStats();
      if (!stats) return;

      // Update stat counters
      document.getElementById('stat-total-products').textContent = stats.products.total;
      document.getElementById('stat-active-products').textContent = `${stats.products.published} published / ${stats.products.draft} draft`;

      document.getElementById('stat-total-units').textContent = (stats.inventory.totalUnits || 0).toLocaleString();
      document.getElementById('stat-inventory-val').textContent = `₹${(stats.inventory.totalValuation || 0).toLocaleString('en-IN')}`;

      document.getElementById('stat-low-stock').textContent = stats.inventory.lowStock;
      document.getElementById('stat-out-of-stock').textContent = stats.inventory.outOfStock;

      document.getElementById('stat-total-likes').textContent = stats.likes.totalLikes.toLocaleString();
      document.getElementById('stat-articles-count').textContent = stats.journal.published;

      // Render Top Liked Products Leaderboard
      const leaderboardBody = document.getElementById('dashboard-likes-leaderboard');
      if (leaderboardBody && Array.isArray(stats.likes.topLikedProducts)) {
        const maxLikes = Math.max(1, ...stats.likes.topLikedProducts.map(p => p.likes_count || 0));
        leaderboardBody.innerHTML = stats.likes.topLikedProducts.map((p, idx) => {
          const pct = Math.round(((p.likes_count || 0) / maxLikes) * 100);
          return `
            <div style="margin-bottom: 14px;">
              <div style="display: flex; justify-content: space-between; font-size: 0.875rem; margin-bottom: 4px;">
                <span><strong>#${idx + 1}</strong> ${p.name} <span style="font-size: 0.75rem; color: var(--color-text-subtle);">(${p.category_label})</span></span>
                <span style="font-weight: 700; color: #E53E3E;">❤️ ${p.likes_count || 0} likes</span>
              </div>
              <div style="background: var(--color-sand-200); height: 8px; border-radius: 4px; overflow: hidden;">
                <div style="background: #E53E3E; width: ${pct}%; height: 100%; border-radius: 4px;"></div>
              </div>
            </div>
          `;
        }).join('');
      }

      // Render Recent Activity Logs
      const activityBody = document.getElementById('dashboard-recent-activity');
      if (activityBody && Array.isArray(stats.recentActivity)) {
        activityBody.innerHTML = stats.recentActivity.map(act => `
          <div style="display: flex; gap: 12px; font-size: 0.8125rem; padding: 10px 0; border-bottom: 1px solid var(--color-sand-200);">
            <div style="color: var(--color-moss-800); font-weight: 600; min-width: 130px;">
              ${new Date(act.created_at).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' })}, ${new Date(act.created_at).toLocaleDateString('en-IN', { month: 'short', day: 'numeric' })}
            </div>
            <div style="flex: 1;">
              <strong>${act.admin_name}</strong>: <span style="background: var(--color-sand-200); padding: 1px 6px; border-radius: 3px; font-family: monospace; font-size: 0.75rem;">${act.action}</span>
              <span style="color: var(--color-text-muted); margin-left: 6px;">${typeof act.details === 'string' ? act.details.slice(0, 60) : ''}</span>
            </div>
            <span class="badge ${act.result === 'SUCCESS' ? 'badge-stock' : 'badge-out'}" style="font-size: 0.6875rem;">${act.result}</span>
          </div>
        `).join('');
      }
    } catch (err) {
      console.error('Failed to load dashboard:', err);
    }
  },

  // -------------------------------------------------------------
  // TAB 2: SITE CONTENT CMS
  // -------------------------------------------------------------
  async loadCms() {
    try {
      const allContent = await Store.getAdminContent();
      this.renderCmsSection(this.activeCmsSection, allContent[this.activeCmsSection] ? allContent[this.activeCmsSection].data : null);
    } catch (err) {
      console.error('Failed to load CMS content:', err);
    }
  },

  switchCmsSection(sectionKey) {
    this.activeCmsSection = sectionKey;
    document.querySelectorAll('.cms-section-btn').forEach(btn => {
      if (btn.dataset.section === sectionKey) {
        btn.classList.add('active');
      } else {
        btn.classList.remove('active');
      }
    });

    const all = Store.getAllContent();
    const secData = all && all[sectionKey] ? all[sectionKey] : (all && all[sectionKey] && all[sectionKey].data ? all[sectionKey].data : null);
    this.renderCmsSection(sectionKey, secData);
  },

  renderCmsSection(sectionKey, data) {
    const container = document.getElementById('cms-editor-container');
    if (!container) return;

    if (!data) {
      data = Store.getContent(sectionKey, {});
    }

    let formHtml = '';

    if (sectionKey === 'announcement_banner') {
      const d = data || {};
      formHtml = `
        <div class="admin-card">
          <div class="admin-card-header">
            <div>
              <h3>Top Announcement Bar Banner</h3>
              <p style="font-size: 0.8125rem; color: var(--color-text-muted);">Displayed across the top of all public pages.</p>
            </div>
            <label style="display: flex; align-items: center; gap: 8px; font-size: 0.875rem; font-weight: 600; cursor: pointer;">
              <input type="checkbox" id="cms-banner-enabled" ${d.enabled !== false ? 'checked' : ''} style="accent-color: var(--color-moss-800);" />
              Show Banner
            </label>
          </div>

          <div class="cms-input-group">
            <label class="cms-input-label">Badge Label</label>
            <input type="text" id="cms-banner-badge" class="form-input" value="${d.badge || ''}" placeholder="e.g. Regional Direct Dispatch" />
          </div>

          <div class="cms-input-group">
            <label class="cms-input-label">Announcement Message</label>
            <input type="text" id="cms-banner-text" class="form-input" value="${d.text || ''}" placeholder="Banner text" />
          </div>

          <div class="cms-input-group">
            <label class="cms-input-label">Link URL (Optional)</label>
            <input type="text" id="cms-banner-link" class="form-input" value="${d.link || '#contact'}" placeholder="#contact" />
          </div>

          <button class="btn btn-primary" onclick="AdminApp.saveCmsAnnouncement()">Save Announcement Banner</button>
        </div>
      `;
    } else if (sectionKey === 'homepage_hero') {
      const d = data || {};
      formHtml = `
        <div class="admin-card">
          <div class="admin-card-header">
            <div>
              <h3>Homepage Hero Section</h3>
              <p style="font-size: 0.8125rem; color: var(--color-text-muted);">Main value proposition displayed when visitors land on the website.</p>
            </div>
          </div>

          <div class="cms-input-group">
            <label class="cms-input-label">Eyebrow Tag</label>
            <input type="text" id="cms-hero-tag" class="form-input" value="${d.tag || ''}" placeholder="e.g. 90-Day Natural Fermentation" />
          </div>

          <div class="cms-input-group">
            <label class="cms-input-label">Hero Main Headline</label>
            <input type="text" id="cms-hero-title" class="form-input" value="${d.title || ''}" placeholder="Headline text" />
          </div>

          <div class="cms-input-group">
            <label class="cms-input-label">Lead Description Paragraph</label>
            <textarea id="cms-hero-desc" class="form-input" rows="3">${d.description || ''}</textarea>
          </div>

          <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 16px;">
            <div class="cms-input-group">
              <label class="cms-input-label">Primary Button Text</label>
              <input type="text" id="cms-hero-cta1-text" class="form-input" value="${d.ctaPrimaryText || 'Explore Product Catalogue'}" />
            </div>
            <div class="cms-input-group">
              <label class="cms-input-label">Primary Button Link</label>
              <input type="text" id="cms-hero-cta1-link" class="form-input" value="${d.ctaPrimaryLink || '#shop'}" />
            </div>
          </div>

          <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 16px;">
            <div class="cms-input-group">
              <label class="cms-input-label">Secondary Button Text</label>
              <input type="text" id="cms-hero-cta2-text" class="form-input" value="${d.ctaSecondaryText || 'Our 90-Day Process'}" />
            </div>
            <div class="cms-input-group">
              <label class="cms-input-label">Secondary Button Link</label>
              <input type="text" id="cms-hero-cta2-link" class="form-input" value="${d.ctaSecondaryLink || '#process'}" />
            </div>
          </div>

          <div class="cms-input-group">
            <label class="cms-input-label">Trust Badge Text</label>
            <input type="text" id="cms-hero-badge" class="form-input" value="${d.badge || ''}" placeholder="e.g. Zero Synthetics • 100% Plant & Enzyme Active" />
          </div>

          <button class="btn btn-primary" onclick="AdminApp.saveCmsHero()">Save Hero Changes</button>
        </div>
      `;
    } else if (sectionKey === 'homepage_pillars') {
      const items = Array.isArray(data) ? data : [];
      formHtml = `
        <div class="admin-card">
          <div class="admin-card-header">
            <div>
              <h3>What Makes Us Different (3 Value Pillars)</h3>
              <p style="font-size: 0.8125rem; color: var(--color-text-muted);">Core differentiators highlighting fermentation, circular waste, and eco safety.</p>
            </div>
          </div>

          <div id="cms-pillars-list">
            ${items.map((item, idx) => `
              <div class="admin-card" style="margin-bottom: 16px; background: var(--color-sand-50);">
                <span class="badge badge-terracotta" style="margin-bottom: 8px;">Pillar ${idx + 1}</span>
                <div class="cms-input-group">
                  <label class="cms-input-label">Tag</label>
                  <input type="text" class="form-input pillar-tag" value="${item.tag || ''}" />
                </div>
                <div class="cms-input-group">
                  <label class="cms-input-label">Title</label>
                  <input type="text" class="form-input pillar-title" value="${item.title || ''}" />
                </div>
                <div class="cms-input-group">
                  <label class="cms-input-label">Description</label>
                  <textarea class="form-input pillar-desc" rows="2">${item.description || ''}</textarea>
                </div>
              </div>
            `).join('')}
          </div>

          <button class="btn btn-primary" onclick="AdminApp.saveCmsPillars()">Save Pillars Content</button>
        </div>
      `;
    } else if (sectionKey === 'about_story') {
      const d = data || {};
      const paras = Array.isArray(d.paragraphs) ? d.paragraphs : [];
      formHtml = `
        <div class="admin-card">
          <div class="admin-card-header">
            <div>
              <h3>Our Story & Mission (About Page)</h3>
              <p style="font-size: 0.8125rem; color: var(--color-text-muted);">Public story of founders, local AP/Telangana waste sourcing, and vision.</p>
            </div>
          </div>

          <div class="cms-input-group">
            <label class="cms-input-label">Main Heading</label>
            <input type="text" id="cms-story-heading" class="form-input" value="${d.heading || ''}" />
          </div>

          <div class="cms-input-group">
            <label class="cms-input-label">Subheading</label>
            <input type="text" id="cms-story-subheading" class="form-input" value="${d.subheading || ''}" />
          </div>

          <div class="cms-input-group">
            <label class="cms-input-label">Opening Lead Paragraph</label>
            <textarea id="cms-story-lead" class="form-input" rows="3">${d.lead || ''}</textarea>
          </div>

          <div class="cms-input-group">
            <label class="cms-input-label">Core Mission Statement</label>
            <textarea id="cms-story-mission" class="form-input" rows="2">${d.mission || ''}</textarea>
          </div>

          <div class="cms-input-group">
            <label class="cms-input-label">Body Paragraphs (One per line)</label>
            <textarea id="cms-story-paras" class="form-input" rows="6">${paras.join('\n\n')}</textarea>
            <p class="cms-input-help">Separate distinct paragraphs with a blank line.</p>
          </div>

          <button class="btn btn-primary" onclick="AdminApp.saveCmsStory()">Save About Story Content</button>
        </div>
      `;
    } else if (sectionKey === 'about_process') {
      const d = data || {};
      const stages = Array.isArray(d.stages) ? d.stages : [];
      formHtml = `
        <div class="admin-card">
          <div class="admin-card-header">
            <div>
              <h3>Our 90-Day Process Page</h3>
              <p style="font-size: 0.8125rem; color: var(--color-text-muted);">Educational breakdown of cold fermentation stages.</p>
            </div>
          </div>

          <div class="cms-input-group">
            <label class="cms-input-label">Heading</label>
            <input type="text" id="cms-process-heading" class="form-input" value="${d.heading || ''}" />
          </div>

          <div class="cms-input-group">
            <label class="cms-input-label">Subheading / Intro</label>
            <input type="text" id="cms-process-subheading" class="form-input" value="${d.subheading || ''}" />
          </div>

          <div id="cms-process-stages">
            ${stages.map((stg, idx) => `
              <div class="admin-card" style="margin-bottom: 14px; background: var(--color-sand-50);">
                <div class="cms-input-group">
                  <label class="cms-input-label">Stage Title</label>
                  <input type="text" class="form-input stage-title" value="${stg.stage || ''}" />
                </div>
                <div class="cms-input-group">
                  <label class="cms-input-label">Stage Details</label>
                  <textarea class="form-input stage-detail" rows="2">${stg.detail || ''}</textarea>
                </div>
              </div>
            `).join('')}
          </div>

          <button class="btn btn-primary" onclick="AdminApp.saveCmsProcess()">Save Process Stages</button>
        </div>
      `;
    } else if (sectionKey === 'footer_content') {
      const d = data || {};
      formHtml = `
        <div class="admin-card">
          <div class="admin-card-header">
            <div>
              <h3>Footer & Contact Transparency</h3>
              <p style="font-size: 0.8125rem; color: var(--color-text-muted);">Organization contact details, regional operating hours, and copyright notice.</p>
            </div>
          </div>

          <div class="cms-input-group">
            <label class="cms-input-label">Brand Tagline</label>
            <textarea id="cms-footer-tagline" class="form-input" rows="2">${d.brandTagline || ''}</textarea>
          </div>

          <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 16px;">
            <div class="cms-input-group">
              <label class="cms-input-label">Contact Telephone</label>
              <input type="text" id="cms-footer-phone" class="form-input" value="${d.phone || ''}" />
            </div>
            <div class="cms-input-group">
              <label class="cms-input-label">Support Email</label>
              <input type="email" id="cms-footer-email" class="form-input" value="${d.email || ''}" />
            </div>
          </div>

          <div class="cms-input-group">
            <label class="cms-input-label">Facility / Production Address</label>
            <input type="text" id="cms-footer-address" class="form-input" value="${d.address || ''}" />
          </div>

          <div class="cms-input-group">
            <label class="cms-input-label">Operating Hours</label>
            <input type="text" id="cms-footer-hours" class="form-input" value="${d.operatingHours || ''}" />
          </div>

          <div class="cms-input-group">
            <label class="cms-input-label">Copyright Notice</label>
            <input type="text" id="cms-footer-copy" class="form-input" value="${d.copyright || ''}" />
          </div>

          <button class="btn btn-primary" onclick="AdminApp.saveCmsFooter()">Save Footer Details</button>
        </div>
      `;
    } else {
      // Generic JSON editor fallback
      formHtml = `
        <div class="admin-card">
          <h3>${sectionKey}</h3>
          <textarea id="cms-generic-json" class="form-input" rows="12" style="font-family: monospace; font-size: 0.875rem;">${JSON.stringify(data, null, 2)}</textarea>
          <div style="margin-top: 16px;">
            <button class="btn btn-primary" onclick="AdminApp.saveCmsGeneric('${sectionKey}')">Save Changes</button>
          </div>
        </div>
      `;
    }

    container.innerHTML = formHtml;
  },

  async saveCmsAnnouncement() {
    const payload = {
      enabled: document.getElementById('cms-banner-enabled').checked,
      badge: document.getElementById('cms-banner-badge').value.trim(),
      text: document.getElementById('cms-banner-text').value.trim(),
      link: document.getElementById('cms-banner-link').value.trim()
    };
    await Store.saveAdminContent('announcement_banner', payload);
    this.toast('Announcement banner updated in live website');
  },

  async saveCmsHero() {
    const payload = {
      tag: document.getElementById('cms-hero-tag').value.trim(),
      title: document.getElementById('cms-hero-title').value.trim(),
      description: document.getElementById('cms-hero-desc').value.trim(),
      ctaPrimaryText: document.getElementById('cms-hero-cta1-text').value.trim(),
      ctaPrimaryLink: document.getElementById('cms-hero-cta1-link').value.trim(),
      ctaSecondaryText: document.getElementById('cms-hero-cta2-text').value.trim(),
      ctaSecondaryLink: document.getElementById('cms-hero-cta2-link').value.trim(),
      badge: document.getElementById('cms-hero-badge').value.trim(),
      bgImage: 'assets/images/hero.jpg'
    };
    await Store.saveAdminContent('homepage_hero', payload);
    this.toast('Hero section updated on live website');
  },

  async saveCmsPillars() {
    const items = [];
    const tags = document.querySelectorAll('.pillar-tag');
    const titles = document.querySelectorAll('.pillar-title');
    const descs = document.querySelectorAll('.pillar-desc');

    for (let i = 0; i < titles.length; i++) {
      items.push({
        tag: tags[i] ? tags[i].value.trim() : '',
        title: titles[i] ? titles[i].value.trim() : '',
        description: descs[i] ? descs[i].value.trim() : ''
      });
    }

    await Store.saveAdminContent('homepage_pillars', items);
    this.toast('Homepage pillars updated');
  },

  async saveCmsStory() {
    const rawParas = document.getElementById('cms-story-paras').value;
    const paras = rawParas.split('\n\n').map(p => p.trim()).filter(Boolean);

    const payload = {
      heading: document.getElementById('cms-story-heading').value.trim(),
      subheading: document.getElementById('cms-story-subheading').value.trim(),
      lead: document.getElementById('cms-story-lead').value.trim(),
      mission: document.getElementById('cms-story-mission').value.trim(),
      paragraphs: paras
    };

    await Store.saveAdminContent('about_story', payload);
    this.toast('About Story content saved');
  },

  async saveCmsProcess() {
    const stages = [];
    const titles = document.querySelectorAll('.stage-title');
    const details = document.querySelectorAll('.stage-detail');

    for (let i = 0; i < titles.length; i++) {
      stages.push({
        stage: titles[i].value.trim(),
        detail: details[i].value.trim()
      });
    }

    const payload = {
      heading: document.getElementById('cms-process-heading').value.trim(),
      subheading: document.getElementById('cms-process-subheading').value.trim(),
      stages
    };

    await Store.saveAdminContent('about_process', payload);
    this.toast('Our Process page content saved');
  },

  async saveCmsFooter() {
    const payload = {
      brandTagline: document.getElementById('cms-footer-tagline').value.trim(),
      phone: document.getElementById('cms-footer-phone').value.trim(),
      email: document.getElementById('cms-footer-email').value.trim(),
      address: document.getElementById('cms-footer-address').value.trim(),
      operatingHours: document.getElementById('cms-footer-hours').value.trim(),
      copyright: document.getElementById('cms-footer-copy').value.trim()
    };
    await Store.saveAdminContent('footer_content', payload);
    this.toast('Footer details saved');
  },

  async saveCmsGeneric(sectionKey) {
    try {
      const raw = document.getElementById('cms-generic-json').value;
      const parsed = JSON.parse(raw);
      await Store.saveAdminContent(sectionKey, parsed);
      this.toast(`${sectionKey} updated successfully`);
    } catch (e) {
      this.toast('Invalid JSON syntax: ' + e.message, 'danger');
    }
  },

  // -------------------------------------------------------------
  // TAB 3: DEDICATED INVENTORY MANAGEMENT
  // -------------------------------------------------------------
  async loadInventory() {
    try {
      const summary = await Store.getInventorySummary();
      this.cachedInventory = summary;

      // Update KPI cards
      document.getElementById('inv-total-units').textContent = (summary.totalUnits || 0).toLocaleString();
      document.getElementById('inv-total-valuation').textContent = `₹${(summary.totalValuation || 0).toLocaleString('en-IN')}`;
      document.getElementById('inv-low-count').textContent = summary.lowStockCount || 0;
      document.getElementById('inv-out-count').textContent = summary.outOfStockCount || 0;
      document.getElementById('inv-healthy-count').textContent = summary.healthyCount || 0;

      // Draw SVG Stock Level Chart
      this.renderStockChart(summary.products);

      // Render Products Inventory Table
      this.renderInventoryTable();

      // Render Stock Movement History Log
      this.loadInventoryLogs();
    } catch (err) {
      console.error('Failed to load inventory:', err);
    }
  },

  setInventoryFilter(filterType) {
    this.inventoryFilter = filterType;
    document.querySelectorAll('.inv-filter-btn').forEach(btn => {
      if (btn.dataset.filter === filterType) {
        btn.classList.add('active');
      } else {
        btn.classList.remove('active');
      }
    });
    this.renderInventoryTable();
  },

  renderStockChart(products) {
    const container = document.getElementById('inventory-chart-canvas');
    if (!container || !Array.isArray(products) || products.length === 0) return;

    const maxStock = Math.max(120, ...products.map(p => p.stock));
    const chartHeight = 220;
    const barWidth = 44;
    const gap = 24;
    const totalWidth = products.length * (barWidth + gap) + 60;

    let barsSvg = '';
    products.forEach((p, i) => {
      const x = 50 + i * (barWidth + gap);
      const h = Math.round((p.stock / maxStock) * (chartHeight - 60));
      const y = chartHeight - 30 - h;
      const isLow = p.stock <= (p.lowStockThreshold || 20);
      const isOut = p.stock === 0;
      const fillColor = isOut ? '#C62828' : (isLow ? '#B76E00' : '#2E7D32');

      barsSvg += `
        <rect x="${x}" y="${y}" width="${barWidth}" height="${h}" fill="${fillColor}" rx="4">
          <title>${p.name}: ${p.stock} units</title>
        </rect>
        <text x="${x + barWidth / 2}" y="${y - 8}" font-size="11" font-weight="700" fill="${fillColor}" text-anchor="middle">${p.stock}</text>
        <text x="${x + barWidth / 2}" y="${chartHeight - 12}" font-size="10" fill="var(--color-moss-900)" text-anchor="middle">${p.name.slice(0, 8)}..</text>
      `;
    });

    const thresholdY = chartHeight - 30 - Math.round((20 / maxStock) * (chartHeight - 60));

    container.innerHTML = `
      <svg width="100%" height="${chartHeight}" viewBox="0 0 ${Math.max(600, totalWidth)} ${chartHeight}" style="overflow: visible;">
        <!-- Base line -->
        <line x1="40" y1="${chartHeight - 30}" x2="${totalWidth}" y2="${chartHeight - 30}" stroke="var(--color-border)" stroke-width="1.5" />
        
        <!-- Threshold Alert Reference Line (20 units default) -->
        <line x1="40" y1="${thresholdY}" x2="${totalWidth}" y2="${thresholdY}" stroke="#B76E00" stroke-width="1.5" stroke-dasharray="4,4" />
        <text x="35" y="${thresholdY + 4}" font-size="10" font-weight="600" fill="#B76E00" text-anchor="end">Alert (20)</text>

        ${barsSvg}
      </svg>
    `;
  },

  renderInventoryTable() {
    const tbody = document.getElementById('inventory-table-body');
    if (!tbody || !this.cachedInventory) return;

    let list = this.cachedInventory.products || [];

    if (this.inventoryFilter === 'low') {
      list = list.filter(p => p.stock <= (p.lowStockThreshold || 20) && p.stock > 0);
    } else if (this.inventoryFilter === 'out') {
      list = list.filter(p => p.stock === 0);
    }

    if (list.length === 0) {
      tbody.innerHTML = `<tr><td colspan="7" style="text-align: center; color: var(--color-text-subtle); padding: 24px;">No products match the selected filter.</td></tr>`;
      return;
    }

    tbody.innerHTML = list.map(p => {
      const isLow = p.stock <= (p.lowStockThreshold || 20) && p.stock > 0;
      const isOut = p.stock === 0;
      const statusBadge = isOut ? '<span class="badge-outofstock">Out of Stock</span>' : (isLow ? '<span class="badge-lowstock">Low Stock</span>' : '<span class="badge-healthy">Healthy</span>');
      const valuation = Math.round((p.stock * p.basePrice) * 100) / 100;

      return `
        <tr>
          <td>
            <div style="display: flex; align-items: center; gap: 10px;">
              <img src="${p.image}" alt="${p.name}" style="width: 38px; height: 38px; object-fit: cover; border-radius: 4px;" />
              <div>
                <strong style="color: var(--color-moss-900);">${p.name}</strong>
                <div style="font-size: 0.75rem; color: var(--color-text-subtle);">${p.categoryLabel || p.category}</div>
              </div>
            </div>
          </td>
          <td>
            <span style="font-size: 1.15rem; font-weight: 700; color: ${isOut ? 'var(--color-danger)' : (isLow ? 'var(--color-warning)' : 'var(--color-moss-900)')};">
              ${p.stock}
            </span>
            <span style="font-size: 0.75rem; color: var(--color-text-muted);">units</span>
          </td>
          <td>${statusBadge}</td>
          <td>
            ₹${p.basePrice}
            <div style="font-size: 0.75rem; color: var(--color-text-subtle);">${p.baseSize}</div>
          </td>
          <td><strong>₹${valuation.toLocaleString('en-IN')}</strong></td>
          <td>
            <span style="font-weight: 600;">${p.lowStockThreshold || 20}</span>
            <button class="btn btn-sm btn-secondary" style="padding: 2px 6px; font-size: 0.6875rem; margin-left: 6px;" onclick="AdminApp.openThresholdModal('${p.id}', ${p.lowStockThreshold || 20})">Edit</button>
          </td>
          <td>
            <div style="display: flex; gap: 6px;">
              <button class="btn btn-sm btn-primary" onclick="AdminApp.openStockAdjustModal('${p.id}', 'add')">+ Stock</button>
              <button class="btn btn-sm btn-secondary" onclick="AdminApp.openStockAdjustModal('${p.id}', 'remove')">− Remove</button>
              <button class="btn btn-sm btn-secondary" onclick="AdminApp.openStockAdjustModal('${p.id}', 'set')">Adjust</button>
            </div>
          </td>
        </tr>
      `;
    }).join('');
  },

  async loadInventoryLogs() {
    const tbody = document.getElementById('inventory-logs-table-body');
    if (!tbody) return;

    try {
      const logs = await Store.getInventoryLogs();
      if (!Array.isArray(logs) || logs.length === 0) {
        tbody.innerHTML = `<tr><td colspan="7" style="text-align: center; color: var(--color-text-subtle); padding: 20px;">No inventory movements recorded yet.</td></tr>`;
        return;
      }

      tbody.innerHTML = logs.map(l => {
        const isPos = l.change_amount > 0;
        const changeDisplay = isPos ? `+${l.change_amount}` : `${l.change_amount}`;
        const changeColor = isPos ? 'var(--color-success)' : 'var(--color-danger)';

        return `
          <tr>
            <td style="white-space: nowrap; font-size: 0.8125rem;">${new Date(l.created_at).toLocaleString('en-IN', { dateStyle: 'short', timeStyle: 'short' })}</td>
            <td><strong>${l.product_name || l.product_id}</strong></td>
            <td><strong style="color: ${changeColor}; font-size: 0.9375rem;">${changeDisplay}</strong></td>
            <td>${l.previous_stock} → <strong>${l.new_stock}</strong></td>
            <td><span style="font-size: 0.8125rem; color: var(--color-text-muted);">${l.reason}</span></td>
            <td><span style="font-size: 0.75rem; background: var(--color-sand-200); padding: 2px 6px; border-radius: 3px;">${l.admin_name || 'System'}</span></td>
          </tr>
        `;
      }).join('');
    } catch (err) {
      console.error('Failed to load inventory logs:', err);
    }
  },

  openStockAdjustModal(productId, defaultAction = 'add') {
    const p = this.cachedInventory ? this.cachedInventory.products.find(item => item.id === productId) : null;
    if (!p) return;

    const modal = document.getElementById('stock-adjust-modal');
    if (!modal) return;

    document.getElementById('modal-stock-prod-id').value = productId;
    document.getElementById('modal-stock-prod-title').textContent = `${p.name} (Current: ${p.stock} units)`;
    document.getElementById('modal-stock-action').value = defaultAction;
    document.getElementById('modal-stock-amount').value = '';
    document.getElementById('modal-stock-reason').value = defaultAction === 'add' ? 'Fresh Batch Fermentation' : 'Sample Distribution';
    document.getElementById('modal-stock-notes').value = '';

    modal.classList.add('open');
  },

  closeStockAdjustModal() {
    const modal = document.getElementById('stock-adjust-modal');
    if (modal) modal.classList.remove('open');
  },

  async handleStockAdjustSubmit(e) {
    e.preventDefault();
    const prodId = document.getElementById('modal-stock-prod-id').value;
    const action = document.getElementById('modal-stock-action').value;
    const amount = parseInt(document.getElementById('modal-stock-amount').value, 10);
    const reason = document.getElementById('modal-stock-reason').value.trim();
    const notes = document.getElementById('modal-stock-notes').value.trim();

    if (isNaN(amount) || amount < 0) {
      alert('Please enter a valid stock quantity');
      return;
    }

    try {
      await Store.adjustInventory(prodId, action, amount, reason, notes);
      this.closeStockAdjustModal();
      this.toast(`Stock updated successfully`);
      this.loadInventory();
    } catch (err) {
      alert('Stock adjustment failed: ' + err.message);
    }
  },

  openThresholdModal(productId, currentVal) {
    const modal = document.getElementById('threshold-modal');
    if (!modal) return;
    document.getElementById('modal-threshold-prod-id').value = productId;
    document.getElementById('modal-threshold-val').value = currentVal || 20;
    modal.classList.add('open');
  },

  closeThresholdModal() {
    const modal = document.getElementById('threshold-modal');
    if (modal) modal.classList.remove('open');
  },

  async handleThresholdSubmit(e) {
    e.preventDefault();
    const prodId = document.getElementById('modal-threshold-prod-id').value;
    const val = parseInt(document.getElementById('modal-threshold-val').value, 10);
    try {
      await Store.updateInventoryThreshold(prodId, val);
      this.closeThresholdModal();
      this.toast('Low stock threshold updated');
      this.loadInventory();
    } catch (err) {
      alert('Failed to update threshold: ' + err.message);
    }
  },

  // -------------------------------------------------------------
  // TAB 4: PRODUCT CATALOGUE MANAGEMENT
  // -------------------------------------------------------------
  async loadProducts() {
    const tbody = document.getElementById('admin-products-catalog-tbody');
    if (!tbody) return;

    try {
      const rows = await Store.apiFetch('/api/admin/products');
      tbody.innerHTML = rows.map(p => `
        <tr>
          <td>
            <div style="display: flex; align-items: center; gap: 10px;">
              <img src="${p.image}" alt="${p.name}" style="width: 40px; height: 40px; object-fit: cover; border-radius: 4px;" />
              <div>
                <strong>${p.name}</strong>
                <div style="font-size: 0.75rem; color: var(--color-text-subtle);">${p.categoryLabel}</div>
              </div>
            </div>
          </td>
          <td>₹${p.basePrice} (${p.baseSize})</td>
          <td><strong>${p.stock}</strong> units</td>
          <td><span style="color: #E53E3E; font-weight: 700;">❤️ ${p.likesCount || 0}</span></td>
          <td><span class="badge ${p.status === 'published' ? 'badge-stock' : 'badge-out'}">${p.status}</span></td>
          <td>
            <div style="display: flex; gap: 6px;">
              <button class="btn btn-sm btn-secondary" onclick="AdminApp.openEditProductModal('${p.id}')">Edit</button>
              <button class="btn btn-sm btn-secondary" style="color: var(--color-danger);" onclick="AdminApp.deleteProduct('${p.id}', '${p.name.replace(/'/g, "\\'")}')">Delete</button>
            </div>
          </td>
        </tr>
      `).join('');
    } catch (err) {
      console.error('Failed to load products:', err);
    }
  },

  openAddProductModal() {
    const modal = document.getElementById('product-edit-modal');
    if (!modal) return;
    document.getElementById('modal-prod-edit-title').textContent = 'Add New Product to Catalogue';
    document.getElementById('prod-form-id').value = '';
    document.getElementById('prod-form-name').value = '';
    document.getElementById('prod-form-category').value = 'concentrate';
    document.getElementById('prod-form-catlabel').value = 'Bioenzyme Concentrate';
    document.getElementById('prod-form-badge').value = 'Plant Powered';
    document.getElementById('prod-form-price').value = '249';
    document.getElementById('prod-form-size').value = '500 ml';
    document.getElementById('prod-form-stock').value = '50';
    document.getElementById('prod-form-threshold').value = '20';
    document.getElementById('prod-form-image').value = 'assets/images/bioenzyme.jpg';
    document.getElementById('prod-form-desc').value = '';
    document.getElementById('prod-form-status').value = 'published';
    modal.classList.add('open');
  },

  async openEditProductModal(productId) {
    const p = Store.getProductById(productId);
    if (!p) return;

    const modal = document.getElementById('product-edit-modal');
    if (!modal) return;

    document.getElementById('modal-prod-edit-title').textContent = `Edit Product: ${p.name}`;
    document.getElementById('prod-form-id').value = p.id;
    document.getElementById('prod-form-name').value = p.name;
    document.getElementById('prod-form-category').value = p.category;
    document.getElementById('prod-form-catlabel').value = p.categoryLabel;
    document.getElementById('prod-form-badge').value = p.badge || '';
    document.getElementById('prod-form-price').value = p.basePrice;
    document.getElementById('prod-form-size').value = p.baseSize;
    document.getElementById('prod-form-stock').value = p.stock;
    document.getElementById('prod-form-threshold').value = p.lowStockThreshold || 20;
    document.getElementById('prod-form-image').value = p.image;
    document.getElementById('prod-form-desc').value = p.shortDescription || '';
    document.getElementById('prod-form-status').value = p.status || 'published';

    modal.classList.add('open');
  },

  closeProductEditModal() {
    const modal = document.getElementById('product-edit-modal');
    if (modal) modal.classList.remove('open');
  },

  async handleProductFormSubmit(e) {
    e.preventDefault();
    const id = document.getElementById('prod-form-id').value.trim();
    const payload = {
      id: id || undefined,
      isNew: !id,
      name: document.getElementById('prod-form-name').value.trim(),
      category: document.getElementById('prod-form-category').value.trim(),
      categoryLabel: document.getElementById('prod-form-catlabel').value.trim(),
      badge: document.getElementById('prod-form-badge').value.trim(),
      basePrice: Number(document.getElementById('prod-form-price').value),
      baseSize: document.getElementById('prod-form-size').value.trim(),
      stock: parseInt(document.getElementById('prod-form-stock').value, 10),
      lowStockThreshold: parseInt(document.getElementById('prod-form-threshold').value, 10),
      image: document.getElementById('prod-form-image').value.trim(),
      shortDescription: document.getElementById('prod-form-desc').value.trim(),
      status: document.getElementById('prod-form-status').value
    };

    try {
      await Store.saveAdminProduct(payload);
      this.closeProductEditModal();
      this.toast(`Product "${payload.name}" saved successfully`);
      this.loadProducts();
    } catch (err) {
      alert('Error saving product: ' + err.message);
    }
  },

  async deleteProduct(productId, name) {
    if (!confirm(`Are you sure you want to delete "${name}" from the product catalogue?`)) return;
    try {
      await Store.deleteAdminProduct(productId);
      this.toast(`Product "${name}" deleted`);
      this.loadProducts();
    } catch (err) {
      alert('Failed to delete product: ' + err.message);
    }
  },

  // -------------------------------------------------------------
  // TAB 5: JOURNAL CMS
  // -------------------------------------------------------------
  async loadJournal() {
    const tbody = document.getElementById('admin-journal-tbody');
    if (!tbody) return;
    try {
      const rows = await Store.getAdminArticles();
      tbody.innerHTML = rows.map(art => `
        <tr>
          <td><strong>${art.title}</strong></td>
          <td>${art.author}</td>
          <td><span class="section-tag">${art.tag}</span></td>
          <td>${art.read_time}</td>
          <td><span class="badge ${art.status === 'published' ? 'badge-stock' : 'badge-out'}">${art.status}</span></td>
          <td>
            <div style="display: flex; gap: 6px;">
              <button class="btn btn-sm btn-secondary" onclick="AdminApp.openEditArticleModal('${art.id}')">Edit</button>
              <button class="btn btn-sm btn-secondary" style="color: var(--color-danger);" onclick="AdminApp.deleteArticle('${art.id}')">Delete</button>
            </div>
          </td>
        </tr>
      `).join('');
    } catch (err) {
      console.error('Failed to load journal:', err);
    }
  },

  openAddArticleModal() {
    const modal = document.getElementById('article-edit-modal');
    if (!modal) return;
    document.getElementById('art-form-id').value = '';
    document.getElementById('art-form-title').value = '';
    document.getElementById('art-form-slug').value = '';
    document.getElementById('art-form-author').value = this.currentAdmin ? this.currentAdmin.name : 'Dr. K. Srinivas';
    document.getElementById('art-form-tag').value = 'Bioenzyme Science';
    document.getElementById('art-form-readtime').value = '4 min read';
    document.getElementById('art-form-excerpt').value = '';
    document.getElementById('art-form-content').value = '';
    document.getElementById('art-form-status').value = 'published';
    modal.classList.add('open');
  },

  async openEditArticleModal(id) {
    try {
      const art = await Store.apiFetch(`/api/journal/${id}`);
      const modal = document.getElementById('article-edit-modal');
      if (!modal || !art) return;

      document.getElementById('art-form-id').value = art.id;
      document.getElementById('art-form-title').value = art.title;
      document.getElementById('art-form-slug').value = art.slug;
      document.getElementById('art-form-author').value = art.author;
      document.getElementById('art-form-tag').value = art.tag;
      document.getElementById('art-form-readtime').value = art.read_time;
      document.getElementById('art-form-excerpt').value = art.excerpt;
      document.getElementById('art-form-content').value = art.content;
      document.getElementById('art-form-status').value = art.status;
      modal.classList.add('open');
    } catch (err) {
      alert('Failed to load article details: ' + err.message);
    }
  },

  closeArticleEditModal() {
    const modal = document.getElementById('article-edit-modal');
    if (modal) modal.classList.remove('open');
  },

  async handleArticleFormSubmit(e) {
    e.preventDefault();
    const id = document.getElementById('art-form-id').value.trim();
    const payload = {
      id: id || undefined,
      title: document.getElementById('art-form-title').value.trim(),
      slug: document.getElementById('art-form-slug').value.trim(),
      author: document.getElementById('art-form-author').value.trim(),
      tag: document.getElementById('art-form-tag').value.trim(),
      readTime: document.getElementById('art-form-readtime').value.trim(),
      excerpt: document.getElementById('art-form-excerpt').value.trim(),
      content: document.getElementById('art-form-content').value.trim(),
      status: document.getElementById('art-form-status').value
    };

    try {
      await Store.saveAdminArticle(payload);
      this.closeArticleEditModal();
      this.toast(`Article saved`);
      this.loadJournal();
    } catch (err) {
      alert('Failed to save article: ' + err.message);
    }
  },

  async deleteArticle(id) {
    if (!confirm('Are you sure you want to delete this article?')) return;
    try {
      await Store.deleteAdminArticle(id);
      this.toast('Article deleted');
      this.loadJournal();
    } catch (err) {
      alert('Delete failed: ' + err.message);
    }
  },

  // -------------------------------------------------------------
  // TAB 6: LIKES & COMMUNITY ENGAGEMENT
  // -------------------------------------------------------------
  async loadLikes() {
    try {
      const stats = await Store.getAdminDashboardStats();
      const listEl = document.getElementById('likes-full-leaderboard');
      if (listEl && stats && stats.likes && Array.isArray(stats.likes.topLikedProducts)) {
        listEl.innerHTML = stats.likes.topLikedProducts.map(p => `
          <div style="display: flex; align-items: center; justify-content: space-between; padding: 12px; background: #fff; border: 1px solid var(--color-border); border-radius: var(--radius-xs); margin-bottom: 8px;">
            <div style="display: flex; align-items: center; gap: 10px;">
              <span style="font-size: 1.25rem;">❤️</span>
              <div>
                <strong>${p.name}</strong>
                <div style="font-size: 0.75rem; color: var(--color-text-subtle);">${p.category_label}</div>
              </div>
            </div>
            <div style="text-align: right;">
              <span style="font-size: 1.15rem; font-weight: 700; color: #E53E3E;">${p.likes_count || 0}</span>
              <div style="font-size: 0.75rem; color: var(--color-text-subtle);">Verified visitor likes</div>
            </div>
          </div>
        `).join('');
      }

      // Load customer enquiries
      const enqs = await Store.getAdminEnquiries();
      const enqTbody = document.getElementById('admin-enquiries-tbody');
      if (enqTbody && Array.isArray(enqs)) {
        enqTbody.innerHTML = enqs.map(e => `
          <tr>
            <td>${new Date(e.created_at).toLocaleDateString('en-IN', { month: 'short', day: 'numeric' })}</td>
            <td><strong>${e.name}</strong><br><span style="font-size: 0.75rem; color: var(--color-text-subtle);">${e.email} • ${e.phone}</span></td>
            <td><span class="badge ${e.type === 'b2b_bulk' ? 'badge-terracotta' : 'badge-stock'}">${e.type === 'b2b_bulk' ? 'B2B Bulk' : 'Contact'}</span></td>
            <td><span style="font-size: 0.8125rem;">${(e.message || '').slice(0, 50)}...</span></td>
            <td><span class="badge ${e.status === 'New' ? 'badge-out' : 'badge-stock'}">${e.status}</span></td>
            <td>
              <select class="form-select" style="font-size: 0.75rem; padding: 4px;" onchange="AdminApp.updateEnquiryStatus('${e.id}', this.value)">
                <option value="New" ${e.status === 'New' ? 'selected' : ''}>New</option>
                <option value="Contacted" ${e.status === 'Contacted' ? 'selected' : ''}>Contacted</option>
                <option value="Converted" ${e.status === 'Converted' ? 'selected' : ''}>Converted</option>
                <option value="Closed" ${e.status === 'Closed' ? 'selected' : ''}>Closed</option>
              </select>
            </td>
          </tr>
        `).join('');
      }
    } catch (err) {
      console.error('Failed to load likes and enquiries:', err);
    }
  },

  async updateEnquiryStatus(id, newStatus) {
    try {
      await Store.updateAdminEnquiry(id, newStatus);
      this.toast(`Enquiry status changed to ${newStatus}`);
    } catch (err) {
      alert('Failed to update enquiry: ' + err.message);
    }
  },

  // -------------------------------------------------------------
  // TAB 7: TEAM & RBAC
  // -------------------------------------------------------------
  async loadAdmins() {
    const tbody = document.getElementById('admin-team-tbody');
    if (!tbody) return;
    try {
      const admins = await Store.getAdminUsers();
      tbody.innerHTML = admins.map(a => `
        <tr>
          <td>
            <strong>${a.name}</strong>
            <div style="font-size: 0.75rem; color: var(--color-text-subtle);">${a.email}</div>
          </td>
          <td><span class="badge badge-terracotta">${a.role}</span></td>
          <td>
            <div style="display: flex; flex-wrap: wrap; gap: 4px;">
              ${(a.permissions || []).map(p => `<span style="font-size: 0.6875rem; background: var(--color-sand-200); padding: 1px 5px; border-radius: 3px;">${p}</span>`).join('')}
            </div>
          </td>
          <td><span class="badge ${a.status === 'active' ? 'badge-stock' : 'badge-out'}">${a.status}</span></td>
          <td><span style="font-size: 0.75rem;">${a.last_login ? new Date(a.last_login).toLocaleDateString('en-IN') : 'Never'}</span></td>
          <td>
            ${a.role !== 'super_admin' ? `
              <button class="btn btn-sm btn-secondary" onclick="AdminApp.toggleAdminStatus('${a.id}', '${a.status === 'active' ? 'deactivated' : 'active'}')">
                ${a.status === 'active' ? 'Deactivate' : 'Activate'}
              </button>
            ` : '<span style="font-size: 0.75rem; color: var(--color-text-subtle);">Protected</span>'}
          </td>
        </tr>
      `).join('');
    } catch (err) {
      console.error('Failed to load team:', err);
    }
  },

  openAddAdminModal() {
    const modal = document.getElementById('admin-user-modal');
    if (modal) modal.classList.add('open');
  },

  closeAddAdminModal() {
    const modal = document.getElementById('admin-user-modal');
    if (modal) modal.classList.remove('open');
  },

  async handleAdminUserSubmit(e) {
    e.preventDefault();
    const permissions = [];
    document.querySelectorAll('.admin-perm-checkbox:checked').forEach(cb => {
      permissions.push(cb.value);
    });

    const payload = {
      name: document.getElementById('user-form-name').value.trim(),
      email: document.getElementById('user-form-email').value.trim(),
      password: document.getElementById('user-form-password').value,
      role: document.getElementById('user-form-role').value,
      permissions
    };

    try {
      await Store.createAdminUser(payload);
      this.closeAddAdminModal();
      this.toast(`Admin user created`);
      this.loadAdmins();
    } catch (err) {
      alert('Error creating administrator: ' + err.message);
    }
  },

  async toggleAdminStatus(id, newStatus) {
    try {
      await Store.updateAdminUser(id, { status: newStatus });
      this.toast(`Admin status updated to ${newStatus}`);
      this.loadAdmins();
    } catch (err) {
      alert('Failed: ' + err.message);
    }
  },

  // -------------------------------------------------------------
  // TAB 8: AUDIT LOGS
  // -------------------------------------------------------------
  async loadAudit() {
    const tbody = document.getElementById('admin-audit-tbody');
    if (!tbody) return;
    try {
      const logs = await Store.getAdminAuditLogs();
      tbody.innerHTML = logs.map(l => `
        <tr>
          <td style="white-space: nowrap; font-size: 0.8125rem;">${new Date(l.created_at).toLocaleString('en-IN', { dateStyle: 'short', timeStyle: 'short' })}</td>
          <td><strong>${l.admin_name}</strong></td>
          <td><span style="font-family: monospace; font-size: 0.75rem; background: var(--color-sand-200); padding: 2px 6px; border-radius: 3px;">${l.action}</span></td>
          <td><span style="font-size: 0.75rem; color: var(--color-text-subtle);">${l.target_type}: ${l.target_id || ''}</span></td>
          <td><span style="font-size: 0.8125rem; color: var(--color-text-muted);">${typeof l.details === 'string' ? l.details.slice(0, 70) : ''}</span></td>
          <td><span class="badge ${l.result === 'SUCCESS' ? 'badge-stock' : 'badge-out'}">${l.result}</span></td>
        </tr>
      `).join('');
    } catch (err) {
      console.error('Failed to load audit logs:', err);
    }
  }
};

window.addEventListener('DOMContentLoaded', () => {
  AdminApp.init();
});
