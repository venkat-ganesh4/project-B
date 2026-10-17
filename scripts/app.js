/**
 * Prakriti Bio - Main Application Logic & Public Storefront Router
 * Complete E-Commerce Features Removed (No Cart/Checkout/Orders)
 * Persistent Product Likes, Live CMS Content Hydration,
 * Interactive Product Catalog & Details Modal.
 */

const App = {
  activeRoute: "home",
  activeCategory: "all",
  activeSort: "featured",
  selectedProduct: null,
  selectedVariantIndex: 0,
  isCustomQty: false,
  customLitersValue: 5,

  init() {
    this.bindEvents();
    this.handleRoute();

    // Initial data synchronization with backend
    Store.fetchContent().then(() => this.hydrateCmsContent());
    Store.fetchLikes().then(() => this.updateLikesBadge());
    Store.refreshProducts().then(() => {
      this.renderHomeProducts();
      this.renderCatalog();
    });

    // Reactive event listeners
    window.addEventListener("pb:likes_changed", () => {
      this.updateLikesBadge();
      this.renderHomeProducts();
      this.renderCatalog();
      if (this.selectedProduct) {
        this.renderPdpContent();
      }
    });

    window.addEventListener("pb:content_changed", () => {
      this.hydrateCmsContent();
    });

    window.addEventListener("pb:products_changed", () => {
      this.renderHomeProducts();
      this.renderCatalog();
    });
  },

  bindEvents() {
    // Navigation routing
    window.addEventListener("hashchange", () => this.handleRoute());

    // Search bar triggers
    document.querySelectorAll("[data-action='open-search']").forEach(el => {
      el.addEventListener("click", () => this.openSearch());
    });

    // Close PDP Modal
    const pdpModal = document.getElementById("pdp-modal");
    if (pdpModal) {
      pdpModal.addEventListener("click", (e) => {
        if (e.target === pdpModal || e.target.closest("[data-action='close-pdp']")) {
          this.closePdpModal();
        }
      });
    }

    // Close Search Modal
    const searchModal = document.getElementById("search-modal");
    if (searchModal) {
      searchModal.addEventListener("click", (e) => {
        if (e.target === searchModal || e.target.closest("[data-action='close-search']")) {
          this.closeSearch();
        }
      });
    }

    // Instant search input listener
    const searchInput = document.getElementById("global-search-input");
    if (searchInput) {
      searchInput.addEventListener("input", (e) => this.handleSearchInput(e.target.value));
    }

    // ESC key closes modals
    window.addEventListener("keydown", (e) => {
      if (e.key === "Escape") {
        this.closePdpModal();
        this.closeSearch();
      }
    });
  },

  handleRoute() {
    const hash = window.location.hash.replace("#", "") || "home";
    const parts = hash.split("/");
    const mainRoute = parts[0];

    // If navigating to admin or checkout or tracking
    if (mainRoute === "admin") {
      window.location.href = "/admin";
      return;
    }

    if (mainRoute === "checkout" || mainRoute === "tracking") {
      window.location.hash = "#shop";
      return;
    }

    this.activeRoute = mainRoute;

    // Update active nav links
    document.querySelectorAll(".nav-link").forEach(link => {
      const target = link.getAttribute("href") ? link.getAttribute("href").replace("#", "") : "";
      if (target === mainRoute || (target === "shop" && mainRoute === "product")) {
        link.classList.add("active");
      } else {
        link.classList.remove("active");
      }
    });

    // Show appropriate view
    document.querySelectorAll(".page-view").forEach(view => {
      view.style.display = "none";
    });

    const targetView = document.getElementById("view-" + mainRoute);
    if (targetView) {
      targetView.style.display = "block";
    } else {
      const homeView = document.getElementById("view-home");
      if (homeView) homeView.style.display = "block";
    }

    window.scrollTo({ top: 0, behavior: "smooth" });

    // Route-specific initializers
    if (mainRoute === "home") {
      this.renderHomeProducts();
      this.renderHomeJournal();
    } else if (mainRoute === "shop") {
      this.renderCatalog();
    } else if (mainRoute === "product" && parts[1]) {
      this.openPdpModal(parts[1]);
    } else if (mainRoute === "journal") {
      this.renderFullJournal();
    }
  },

  // -------------------------------------------------------------
  // DYNAMIC CMS CONTENT HYDRATION (LIVE REFLECTION WITHOUT REDEPLOY)
  // -------------------------------------------------------------
  hydrateCmsContent() {
    const all = Store.getAllContent();
    if (!all || typeof all !== 'object') return;

    // 1. Announcement Bar
    const ann = all.announcement_banner;
    const annBar = document.getElementById('announcement-bar-container');
    if (ann && annBar) {
      if (ann.enabled === false) {
        annBar.style.display = 'none';
      } else {
        annBar.style.display = 'flex';
        const badgeEl = document.getElementById('announcement-badge-text');
        const textEl = document.getElementById('announcement-message-text');
        if (badgeEl && ann.badge) badgeEl.textContent = ann.badge;
        if (textEl && ann.text) textEl.textContent = ann.text;
      }
    }

    // 2. Homepage Hero
    const hero = all.homepage_hero;
    if (hero) {
      const tagEl = document.getElementById('hero-eyebrow-text');
      const titleEl = document.getElementById('hero-title-text');
      const leadEl = document.getElementById('hero-lead-text');
      const cta1 = document.getElementById('hero-cta-primary');
      const cta2 = document.getElementById('hero-cta-secondary');
      const badgeEl = document.getElementById('hero-badge-text');

      if (tagEl && hero.tag) tagEl.textContent = hero.tag;
      if (titleEl && hero.title) titleEl.textContent = hero.title;
      if (leadEl && hero.description) leadEl.textContent = hero.description;
      if (cta1 && hero.ctaPrimaryText) {
        cta1.textContent = hero.ctaPrimaryText;
        if (hero.ctaPrimaryLink) cta1.setAttribute('href', hero.ctaPrimaryLink);
      }
      if (cta2 && hero.ctaSecondaryText) {
        cta2.textContent = hero.ctaSecondaryText;
        if (hero.ctaSecondaryLink) cta2.setAttribute('href', hero.ctaSecondaryLink);
      }
      if (badgeEl && hero.badge) badgeEl.textContent = hero.badge;
    }

    // 3. Difference Pillars
    const pillars = all.homepage_pillars;
    const pillarsContainer = document.getElementById('home-pillars-grid');
    if (pillars && pillarsContainer && Array.isArray(pillars) && pillars.length > 0) {
      pillarsContainer.innerHTML = pillars.map(pil => `
        <div class="pillar-card">
          <span class="section-tag" style="margin-bottom: 8px;">${pil.tag || 'Natural'}</span>
          <h3 class="pillar-title" style="margin-top: 6px;">${pil.title}</h3>
          <p class="pillar-desc">${pil.description}</p>
        </div>
      `).join('');
    }

    // 4. About Story Page
    const story = all.about_story;
    if (story) {
      const headEl = document.getElementById('story-heading-text');
      const subEl = document.getElementById('story-subheading-text');
      const leadEl = document.getElementById('story-lead-text');
      const missionEl = document.getElementById('story-mission-text');
      const parasEl = document.getElementById('story-paragraphs-container');

      if (headEl && story.heading) headEl.textContent = story.heading;
      if (subEl && story.subheading) subEl.textContent = story.subheading;
      if (leadEl && story.lead) leadEl.textContent = story.lead;
      if (missionEl && story.mission) missionEl.textContent = story.mission;

      if (parasEl && Array.isArray(story.paragraphs) && story.paragraphs.length > 0) {
        parasEl.innerHTML = story.paragraphs.map(p => `
          <p style="font-size: 0.9375rem; color: var(--color-text-muted); line-height: 1.7; margin-bottom: 16px;">
            ${p}
          </p>
        `).join('');
      }
    }

    // 5. Process Page
    const proc = all.about_process;
    if (proc) {
      const pHead = document.getElementById('process-page-heading');
      const pSub = document.getElementById('process-page-subheading');
      const pStages = document.getElementById('process-stages-container');

      if (pHead && proc.heading) pHead.textContent = proc.heading;
      if (pSub && proc.subheading) pSub.textContent = proc.subheading;

      if (pStages && Array.isArray(proc.stages) && proc.stages.length > 0) {
        pStages.innerHTML = proc.stages.map(stg => `
          <div style="background: var(--color-sand-50); padding: 18px; border: 1px solid var(--color-border); border-radius: var(--radius-xs); margin-bottom: 14px;">
            <h5 style="color: var(--color-moss-900); font-weight: 700; font-size: 1rem; margin-bottom: 6px;">${stg.stage}</h5>
            <p style="font-size: 0.875rem; color: var(--color-text-muted); line-height: 1.6; margin: 0;">${stg.detail}</p>
          </div>
        `).join('');
      }
    }

    // 6. Footer Content
    const footer = all.footer_content;
    if (footer) {
      const tagEl = document.getElementById('footer-brand-tagline');
      const phoneEl = document.getElementById('footer-phone-text');
      const emailEl = document.getElementById('footer-email-text');
      const addrEl = document.getElementById('footer-address-text');
      const copyEl = document.getElementById('footer-copyright-text');

      if (tagEl && footer.brandTagline) tagEl.textContent = footer.brandTagline;
      if (phoneEl && footer.phone) phoneEl.textContent = footer.phone;
      if (emailEl && footer.email) emailEl.textContent = footer.email;
      if (addrEl && footer.address) addrEl.textContent = footer.address;
      if (copyEl && footer.copyright) copyEl.textContent = footer.copyright;
    }
  },

  // -------------------------------------------------------------
  // TOAST NOTIFICATIONS
  // -------------------------------------------------------------
  toast(message, type = "success") {
    const container = document.getElementById("toast-container");
    if (!container) return;

    const toastEl = document.createElement("div");
    toastEl.className = `toast toast-${type}`;
    toastEl.innerHTML = `<div class="toast-message">${message}</div>`;

    container.appendChild(toastEl);

    setTimeout(() => {
      toastEl.style.opacity = "0";
      toastEl.style.transition = "opacity 0.3s ease";
      setTimeout(() => toastEl.remove(), 300);
    }, 3500);
  },

  // -------------------------------------------------------------
  // PRODUCT LIKES & WISHLIST BADGES
  // -------------------------------------------------------------
  updateLikesBadge() {
    const userLikes = Store.getUserLikes();
    const count = userLikes.length;
    document.querySelectorAll(".likes-count-badge").forEach(badge => {
      badge.textContent = count;
      badge.style.display = count > 0 ? "flex" : "none";
    });
  },

  async toggleProductLike(productId) {
    const product = Store.getProductById(productId);
    const title = product ? product.name : "Product";

    const res = await Store.toggleLike(productId);
    if (res && res.liked) {
      this.toast(`❤️ Added <strong>${title}</strong> to your liked list!`);
    } else {
      this.toast(`Removed <strong>${title}</strong> from liked list`, "info");
    }
  },

  showLikedProducts() {
    window.location.hash = "#shop";
    this.setCatalogCategory("likes");
  },

  // -------------------------------------------------------------
  // HOME PAGE PRODUCTS RENDERING
  // -------------------------------------------------------------
  renderHomeProducts() {
    const container = document.getElementById("home-featured-grid");
    if (!container) return;

    const products = Store.getProducts().slice(0, 3);
    container.innerHTML = products.map(p => this.createProductCardHtml(p)).join("");
  },

  renderHomeJournal() {
    const container = document.getElementById("home-journal-grid");
    if (!container) return;

    const articles = (typeof INITIAL_JOURNAL !== 'undefined' ? INITIAL_JOURNAL : []).slice(0, 3);
    container.innerHTML = articles.map(art => `
      <article class="pillar-card" style="background: #fff; cursor: pointer;" onclick="App.openArticleModal('${art.id}')">
        <span class="section-tag">${art.tag}</span>
        <h3 style="font-family: var(--font-serif); font-size: 1.25rem; color: var(--color-moss-900); margin: 8px 0;">${art.title}</h3>
        <p style="font-size: 0.875rem; color: var(--color-text-muted); line-height: 1.5; margin-bottom: 12px;">${art.excerpt}</p>
        <div style="font-size: 0.75rem; color: var(--color-text-subtle); display: flex; justify-content: space-between;">
          <span>${art.author}</span>
          <span>${art.readTime}</span>
        </div>
      </article>
    `).join("");
  },

  // -------------------------------------------------------------
  // CATALOG & SHOP RENDERING
  // -------------------------------------------------------------
  renderCatalog() {
    const container = document.getElementById("catalog-products-grid");
    if (!container) return;

    let products = Store.getProducts();

    // Category / Likes Filter
    if (this.activeCategory === "likes") {
      const userLikes = Store.getUserLikes();
      products = products.filter(p => userLikes.includes(p.id));
    } else if (this.activeCategory !== "all") {
      products = products.filter(p => p.category === this.activeCategory);
    }

    // Sort Logic
    if (this.activeSort === "price-low") {
      products.sort((a, b) => a.basePrice - b.basePrice);
    } else if (this.activeSort === "price-high") {
      products.sort((a, b) => b.basePrice - a.basePrice);
    } else if (this.activeSort === "rating") {
      products.sort((a, b) => b.rating - a.rating);
    } else if (this.activeSort === "likes") {
      products.sort((a, b) => Store.getLikeCount(b.id) - Store.getLikeCount(a.id));
    }

    if (products.length === 0) {
      if (this.activeCategory === "likes") {
        container.innerHTML = `
          <div style="grid-column: 1 / -1; text-align: center; padding: 48px 24px; background: #fff; border: 1px solid var(--color-border); border-radius: var(--radius-sm);">
            <div style="font-size: 2.5rem; margin-bottom: 12px;">❤️</div>
            <h3 style="font-family: var(--font-serif); color: var(--color-moss-900); margin-bottom: 8px;">No Liked Products Yet</h3>
            <p style="color: var(--color-text-muted); max-width: 440px; margin: 0 auto 20px; font-size: 0.9375rem;">
              Click the heart icon on any bioenzyme cleaner to save it here for quick reference anytime.
            </p>
            <button class="btn btn-primary" onclick="App.setCatalogCategory('all')">View All Products</button>
          </div>
        `;
      } else {
        container.innerHTML = `<div style="grid-column: 1 / -1; text-align: center; padding: 40px; color: var(--color-text-muted);">No products found in this category.</div>`;
      }
      return;
    }

    container.innerHTML = products.map(p => this.createProductCardHtml(p)).join("");
  },

  setCatalogCategory(cat) {
    this.activeCategory = cat;
    document.querySelectorAll(".filter-pill").forEach(pill => {
      if (pill.dataset.category === cat) {
        pill.classList.add("active");
      } else {
        pill.classList.remove("active");
      }
    });
    this.renderCatalog();
  },

  setCatalogSort(sortVal) {
    this.activeSort = sortVal;
    this.renderCatalog();
  },

  createProductCardHtml(product) {
    const isLiked = Store.isLiked(product.id);
    const likeCount = Store.getLikeCount(product.id);
    const primaryVariant = product.variants ? product.variants[0] : { size: product.baseSize, price: product.basePrice };

    return `
      <div class="product-card" data-product-id="${product.id}">
        <div class="product-card-media" onclick="App.openPdpModal('${product.id}')">
          <img src="${product.image}" alt="${product.name}" class="product-card-img" loading="lazy" />
          ${product.badge ? `<div class="product-badge-overlay"><span class="badge badge-terracotta">${product.badge}</span></div>` : ""}
          
          <!-- Heart Like Button with Instant Persistence -->
          <button class="product-wishlist-btn ${isLiked ? "active" : ""}" 
                  onclick="event.stopPropagation(); App.toggleProductLike('${product.id}')"
                  aria-label="Like ${product.name}" title="Like this product">
            <svg class="icon icon-sm" viewBox="0 0 24 24" ${isLiked ? 'style="fill: #E53E3E; stroke: #E53E3E;"' : ""}>
              <path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z"></path>
            </svg>
            <span class="product-card-like-num" style="font-size: 0.75rem; font-weight: 700; color: ${isLiked ? '#E53E3E' : 'inherit'}; margin-left: 2px;">
              ${likeCount}
            </span>
          </button>
        </div>

        <div class="product-card-body">
          <div class="product-category-meta">
            <span>${product.categoryLabel}</span>
            <div class="product-rating-inline">
              <svg class="star-icon" viewBox="0 0 24 24"><polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"></polygon></svg>
              <span>${product.rating}</span>
            </div>
          </div>

          <h3 class="product-card-title" onclick="App.openPdpModal('${product.id}')">${product.name}</h3>
          <p class="product-card-excerpt">${product.shortDescription}</p>

          <div class="product-variant-selector-mini">
            <div class="size-pills-row">
              ${(product.variants || []).slice(0, 3).map((v, idx) => `
                <span class="size-pill-option ${idx === 0 ? "selected" : ""}" 
                      onclick="App.selectCardVariant(this, '${product.id}', ${idx}, ${v.price})">
                  ${v.size}
                </span>
              `).join("")}
              ${product.variants && product.variants.length > 3 ? `<span class="size-pill-option" onclick="App.openPdpModal('${product.id}')">+More</span>` : ""}
            </div>

            <div class="product-pricing-footer">
              <div class="product-price-label">
                <span class="price-main card-price-val-${product.id}">₹${primaryVariant.price}</span>
                <span class="price-sub">${primaryVariant.size}</span>
              </div>

              <!-- Sleek View Details Button (Replaces Cart Purchase) -->
              <button class="btn btn-primary btn-sm" onclick="App.openPdpModal('${product.id}')">
                View Details →
              </button>
            </div>
          </div>
        </div>
      </div>
    `;
  },

  selectCardVariant(el, productId, variantIndex, price) {
    const card = el.closest(".product-card");
    card.querySelectorAll(".size-pill-option").forEach(pill => pill.classList.remove("selected"));
    el.classList.add("selected");

    const priceLabel = card.querySelector(`.card-price-val-${productId}`);
    if (priceLabel) priceLabel.textContent = `₹${price}`;

    card.dataset.selectedVariantIndex = variantIndex;
  },

  // -------------------------------------------------------------
  // PRODUCT DETAILS MODAL (PDP)
  // -------------------------------------------------------------
  openPdpModal(productId) {
    const product = Store.getProductById(productId);
    if (!product) return;

    this.selectedProduct = product;
    this.selectedVariantIndex = 0;
    this.isCustomQty = false;
    this.customLitersValue = product.minCustomLiters || 5;

    const modal = document.getElementById("pdp-modal");
    if (!modal) return;

    this.renderPdpContent();
    modal.classList.add("open");
    document.body.style.overflow = "hidden";
  },

  closePdpModal() {
    const modal = document.getElementById("pdp-modal");
    if (modal) modal.classList.remove("open");
    document.body.style.overflow = "";
    if (this.activeRoute === "product") {
      window.location.hash = "#shop";
    }
  },

  renderPdpContent() {
    const p = this.selectedProduct;
    if (!p) return;

    const container = document.getElementById("pdp-modal-body");
    if (!container) return;

    const isLiked = Store.isLiked(p.id);
    const likeCount = Store.getLikeCount(p.id);
    const curVariant = p.variants ? p.variants[this.selectedVariantIndex] : { size: p.baseSize, price: p.basePrice };
    const currentPrice = this.isCustomQty ? (this.customLitersValue * p.customPricePerLiter) : curVariant.price;

    container.innerHTML = `
      <div class="modal-pdp-grid">
        <div class="modal-pdp-media">
          <img src="${p.image}" alt="${p.name}" class="modal-pdp-img" />
          ${p.badge ? `<div class="product-badge-overlay"><span class="badge badge-terracotta">${p.badge}</span></div>` : ""}
        </div>

        <div class="modal-pdp-info">
          <div class="product-category-meta" style="display: flex; justify-content: space-between; align-items: center;">
            <span>${p.categoryLabel}</span>
            <span class="badge ${p.inStock ? "badge-stock" : "badge-out"}">${p.inStock ? "Active Ferment Batch" : "Fresh Batch Brewing"}</span>
          </div>

          <h2 class="pdp-title" style="margin-top: 8px;">${p.name}</h2>

          <div class="pdp-meta-row" style="display: flex; align-items: center; justify-content: space-between; margin-bottom: 16px;">
            <div class="product-rating-inline">
              <svg class="star-icon" viewBox="0 0 24 24"><polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"></polygon></svg>
              <strong>${p.rating}</strong>
              <span style="color: var(--color-text-subtle);">(${p.reviewCount} reviews)</span>
            </div>

            <!-- Heart Like Button in PDP Header -->
            <button class="btn btn-sm btn-secondary ${isLiked ? 'active' : ''}" 
                    style="display: flex; align-items: center; gap: 6px; padding: 6px 12px; cursor: pointer; ${isLiked ? 'color: #E53E3E; border-color: #E53E3E;' : ''}"
                    onclick="App.toggleProductLike('${p.id}')">
              <svg class="icon icon-sm" viewBox="0 0 24 24" ${isLiked ? 'style="fill: #E53E3E; stroke: #E53E3E;"' : ''}>
                <path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z"></path>
              </svg>
              <strong>${isLiked ? 'Liked' : 'Like'}</strong>
              <span>(${likeCount})</span>
            </button>
          </div>

          <div class="pdp-price-display">
            <span class="pdp-current-price" id="pdp-price-text">₹${currentPrice}</span>
            <span style="color: var(--color-text-muted); font-size: 0.875rem;" id="pdp-size-unit-text">
              ${this.isCustomQty ? `(${this.customLitersValue} Liters @ ₹${p.customPricePerLiter}/L)` : `per ${curVariant.size}`}
            </span>
          </div>

          <!-- Size Variant Selector -->
          <div class="pdp-variant-block">
            <div class="variant-label-title">
              <span>Standard Volume Packages:</span>
              <span style="font-weight: 400; color: var(--color-text-subtle);">${this.isCustomQty ? 'Custom Volume' : curVariant.size}</span>
            </div>
            <div class="variant-buttons-list">
              ${(p.variants || []).map((v, idx) => `
                <button class="variant-btn-chip ${!this.isCustomQty && this.selectedVariantIndex === idx ? "active" : ""}"
                        onclick="App.selectPdpVariant(${idx})">
                  ${v.size}
                </button>
              `).join("")}
              ${p.customPricePerLiter ? `
                <button class="variant-btn-chip ${this.isCustomQty ? "active" : ""}"
                        onclick="App.toggleCustomQty(true)" style="border-style: dashed;">
                  Custom Liters (Bulk)
                </button>
              ` : ""}
            </div>

            <!-- Custom Quantity Input Box -->
            <div class="custom-qty-box ${this.isCustomQty ? "visible" : ""}">
              <div class="custom-qty-flex">
                <label for="custom-liters-input" style="font-size: 0.875rem; font-weight: 600; color: var(--color-moss-900);">
                  Enter Liters:
                </label>
                <input type="number" id="custom-liters-input" class="custom-qty-input" 
                       min="${p.minCustomLiters || 5}" max="500" value="${this.customLitersValue}" 
                       oninput="App.updateCustomLiters(this.value)" />
                <span style="font-size: 0.8125rem; color: var(--color-text-muted);">
                  (Min ${p.minCustomLiters || 5}L bulk rate @ ₹${p.customPricePerLiter}/L for apartments & hotels)
                </span>
              </div>
            </div>
          </div>

          <!-- Direct Inquiry CTA (Replaces Cart Checkout) -->
          <div style="display: flex; gap: 12px; margin-top: 24px;">
            <button class="btn btn-primary btn-lg" style="flex: 1;" onclick="App.enquireProduct('${p.name}')">
              Enquire / Request Quote →
            </button>
          </div>

          <!-- Product Details Tabs -->
          <div class="pdp-tabs-nav" style="margin-top: 24px;">
            <button class="pdp-tab-btn active" onclick="App.switchPdpTab(this, 'tab-ingredients')">Ingredients</button>
            <button class="pdp-tab-btn" onclick="App.switchPdpTab(this, 'tab-usage')">How to Use</button>
            <button class="pdp-tab-btn" onclick="App.switchPdpTab(this, 'tab-safety')">Safety & Storage</button>
            <button class="pdp-tab-btn" onclick="App.switchPdpTab(this, 'tab-impact')">Eco Facts</button>
          </div>

          <div id="tab-ingredients" class="pdp-tab-pane active">
            <p style="margin-bottom: 12px; font-weight: 500; color: var(--color-moss-900);">100% Full Disclosure Formulation:</p>
            <table class="ingredient-table">
              ${(p.ingredients || []).map(ing => `
                <tr>
                  <td style="width: 35%;"><strong>${ing.name}</strong><br><span style="font-size: 0.75rem; color: var(--color-text-subtle);">${ing.role}</span></td>
                  <td>${ing.detail}</td>
                </tr>
              `).join("")}
            </table>
          </div>

          <div id="tab-usage" class="pdp-tab-pane" style="display: none;">
            <p style="margin-bottom: 12px; font-weight: 500; color: var(--color-moss-900);">Recommended Dilution Ratios:</p>
            <div style="display: flex; flex-direction: column; gap: 10px;">
              ${(p.usageGuide || []).map(u => `
                <div style="background: var(--color-sand-50); padding: 12px; border: 1px solid var(--color-border); border-radius: var(--radius-xs);">
                  <strong>${u.surface}</strong>: <span style="color: var(--color-terracotta-600); font-weight: 600;">${u.ratio}</span>
                  <p style="font-size: 0.8125rem; color: var(--color-text-muted); margin-top: 4px;">${u.steps}</p>
                </div>
              `).join("")}
            </div>
          </div>

          <div id="tab-safety" class="pdp-tab-pane" style="display: none;">
            <p style="font-size: 0.875rem; color: var(--color-text-muted); line-height: 1.6;">
              ${p.safetyInfo || "Safe for daily household use around pets and children. Non-corrosive, non-caustic formula."}
            </p>
          </div>

          <div id="tab-impact" class="pdp-tab-pane" style="display: none;">
            <ul style="padding-left: 20px; font-size: 0.875rem; color: var(--color-text-muted); line-height: 1.7;">
              ${(p.environmentalFacts || []).map(fact => `<li>${fact}</li>`).join("")}
            </ul>
          </div>
        </div>
      </div>
    `;
  },

  selectPdpVariant(idx) {
    this.selectedVariantIndex = idx;
    this.isCustomQty = false;
    this.renderPdpContent();
  },

  toggleCustomQty(enable) {
    this.isCustomQty = enable;
    this.renderPdpContent();
  },

  updateCustomLiters(val) {
    const p = this.selectedProduct;
    const num = Math.max(p.minCustomLiters || 5, parseInt(val, 10) || (p.minCustomLiters || 5));
    this.customLitersValue = num;

    const priceText = document.getElementById("pdp-price-text");
    const sizeText = document.getElementById("pdp-size-unit-text");
    if (priceText && p) {
      priceText.textContent = `₹${num * p.customPricePerLiter}`;
    }
    if (sizeText && p) {
      sizeText.textContent = `(${num} Liters @ ₹${p.customPricePerLiter}/L)`;
    }
  },

  switchPdpTab(btn, targetTabId) {
    const parent = btn.closest(".modal-pdp-info");
    parent.querySelectorAll(".pdp-tab-btn").forEach(b => b.classList.remove("active"));
    btn.classList.add("active");

    parent.querySelectorAll(".pdp-tab-pane").forEach(pane => pane.style.display = "none");
    const target = document.getElementById(targetTabId);
    if (target) target.style.display = "block";
  },

  enquireProduct(productName) {
    this.closePdpModal();
    window.location.hash = "#contact";
    setTimeout(() => {
      const msgInput = document.getElementById("contact-message-input");
      if (msgInput) {
        msgInput.value = `Hello Prakriti Bio team, I would like to enquire about ordering ${productName}.`;
        msgInput.focus();
      }
    }, 400);
  },

  // -------------------------------------------------------------
  // GLOBAL SEARCH
  // -------------------------------------------------------------
  openSearch() {
    const modal = document.getElementById("search-modal");
    if (!modal) return;
    modal.classList.add("open");
    const input = document.getElementById("global-search-input");
    if (input) {
      input.value = "";
      input.focus();
    }
    this.handleSearchInput("");
  },

  closeSearch() {
    const modal = document.getElementById("search-modal");
    if (modal) modal.classList.remove("open");
  },

  handleSearchInput(query) {
    const container = document.getElementById("search-results-list");
    if (!container) return;

    const term = query.toLowerCase().trim();
    const products = Store.getProducts();

    if (!term) {
      container.innerHTML = `
        <div style="padding: 16px; color: var(--color-text-subtle); font-size: 0.875rem;">
          Type to search all bioenzyme products, guides, and dilution protocols...
        </div>
      `;
      return;
    }

    const matches = products.filter(p =>
      p.name.toLowerCase().includes(term) ||
      p.categoryLabel.toLowerCase().includes(term) ||
      p.shortDescription.toLowerCase().includes(term)
    );

    if (matches.length === 0) {
      container.innerHTML = `
        <div style="padding: 16px; color: var(--color-text-subtle); font-size: 0.875rem;">
          No bioenzyme products found matching "<strong>${query}</strong>".
        </div>
      `;
      return;
    }

    container.innerHTML = matches.map(p => `
      <div class="search-result-item" onclick="App.closeSearch(); App.openPdpModal('${p.id}')">
        <img src="${p.image}" alt="${p.name}" style="width: 44px; height: 44px; object-fit: cover; border-radius: 4px;" />
        <div style="flex: 1;">
          <strong style="color: var(--color-moss-900); font-size: 0.9375rem;">${p.name}</strong>
          <div style="font-size: 0.75rem; color: var(--color-text-subtle);">${p.categoryLabel} • ₹${p.basePrice} (${p.baseSize})</div>
        </div>
        <span style="font-size: 0.8125rem; color: #E53E3E; font-weight: 600;">❤️ ${Store.getLikeCount(p.id)}</span>
      </div>
    `).join("");
  },

  // -------------------------------------------------------------
  // JOURNAL READER MODAL
  // -------------------------------------------------------------
  openArticleModal(articleId) {
    const articles = typeof INITIAL_JOURNAL !== 'undefined' ? INITIAL_JOURNAL : [];
    const art = articles.find(a => a.id === articleId);
    if (!art) return;

    const modal = document.getElementById("article-modal");
    if (!modal) return;

    document.getElementById("article-modal-title").textContent = art.title;
    document.getElementById("article-modal-meta").textContent = `By ${art.author} • ${art.date} • ${art.readTime} • ${art.tag}`;
    document.getElementById("article-modal-body").innerHTML = art.content;

    modal.classList.add("open");
    document.body.style.overflow = "hidden";
  },

  closeArticleModal() {
    const modal = document.getElementById("article-modal");
    if (modal) modal.classList.remove("open");
    document.body.style.overflow = "";
  },

  renderFullJournal() {
    const container = document.getElementById("journal-articles-grid");
    if (!container) return;
    const articles = typeof INITIAL_JOURNAL !== 'undefined' ? INITIAL_JOURNAL : [];
    container.innerHTML = articles.map(art => `
      <article class="pillar-card" style="background: #fff; cursor: pointer;" onclick="App.openArticleModal('${art.id}')">
        <span class="section-tag">${art.tag}</span>
        <h3 style="font-family: var(--font-serif); font-size: 1.35rem; color: var(--color-moss-900); margin: 8px 0;">${art.title}</h3>
        <p style="font-size: 0.875rem; color: var(--color-text-muted); line-height: 1.5; margin-bottom: 12px;">${art.excerpt}</p>
        <div style="font-size: 0.75rem; color: var(--color-text-subtle); display: flex; justify-content: space-between;">
          <span>${art.author}</span>
          <span>${art.readTime}</span>
        </div>
      </article>
    `).join("");
  },

  // -------------------------------------------------------------
  // CONTACT & ENQUIRIES HANDLER
  // -------------------------------------------------------------
  async handleContactSubmit(e) {
    e.preventDefault();
    const form = e.target;
    const payload = {
      name: form.name.value.trim(),
      email: form.email.value.trim(),
      phone: form.phone.value.trim(),
      organization: form.organization ? form.organization.value.trim() : "",
      location: form.location ? form.location.value.trim() : "AP / Telangana",
      type: form.type ? form.type.value : "contact",
      message: form.message.value.trim()
    };

    try {
      const res = await Store.apiFetch('/api/enquiries', {
        method: 'POST',
        body: JSON.stringify(payload)
      });
      form.reset();
      this.toast("Thank you! Your enquiry has been received. Our team will contact you shortly.");
    } catch (err) {
      alert("Failed to submit enquiry: " + err.message);
    }
  }
};

window.addEventListener("DOMContentLoaded", () => {
  App.init();
});
