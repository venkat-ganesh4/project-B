/**
 * Prakriti Bio - Main Application Logic & Router
 */

const App = {
  activeRoute: "home",
  activeCategory: "all",
  activeSort: "featured",
  selectedProduct: null,
  selectedVariantIndex: 0,
  isCustomQty: false,
  customLitersValue: 5,
  pdpQuantity: 1,

  init() {
    this.bindEvents();
    this.handleRoute();
    this.updateCartBadge();
    this.updateWishlistBadge();

    // Listen for storage events
    window.addEventListener("pb:cart_changed", () => {
      this.updateCartBadge();
      this.renderCartDrawer();
      if (this.activeRoute === "checkout") this.renderCheckoutSummary();
    });

    window.addEventListener("pb:wishlist_changed", () => {
      this.updateWishlistBadge();
      if (this.activeRoute === "home" || this.activeRoute === "shop") {
        this.renderCatalog();
      }
    });

    window.addEventListener("pb:products_changed", () => {
      this.renderCatalog();
      this.renderAdminProducts();
      this.updateAdminStats();
    });

    window.addEventListener("pb:orders_changed", () => {
      this.renderAdminOrders();
      this.updateAdminStats();
    });
  },

  bindEvents() {
    // Navigation routing
    window.addEventListener("hashchange", () => this.handleRoute());

    // Search bar triggers
    document.querySelectorAll("[data-action='open-search']").forEach(el => {
      el.addEventListener("click", () => this.openSearch());
    });

    // Cart drawer triggers
    document.querySelectorAll("[data-action='open-cart']").forEach(el => {
      el.addEventListener("click", () => this.openCartDrawer());
    });

    document.querySelectorAll("[data-action='close-cart']").forEach(el => {
      el.addEventListener("click", () => this.closeCartDrawer());
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
        this.closeCartDrawer();
      }
    });
  },

  handleRoute() {
    const hash = window.location.hash.replace("#", "") || "home";
    const parts = hash.split("/");
    const mainRoute = parts[0];

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
      document.getElementById("view-home").style.display = "block";
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
    } else if (mainRoute === "checkout") {
      this.initCheckoutView();
    } else if (mainRoute === "tracking") {
      this.initTrackingView(parts[1] || "");
    } else if (mainRoute === "admin") {
      this.initAdminView();
    } else if (mainRoute === "journal") {
      this.renderFullJournal();
    }
  },

  // Toast Notifications
  toast(message, type = "success") {
    const container = document.getElementById("toast-container");
    if (!container) return;

    const toastEl = document.createElement("div");
    toastEl.className = `toast toast-${type}`;
    toastEl.innerHTML = `
      <div class="toast-message">${message}</div>
    `;

    container.appendChild(toastEl);

    setTimeout(() => {
      toastEl.style.opacity = "0";
      toastEl.style.transition = "opacity 0.3s ease";
      setTimeout(() => toastEl.remove(), 300);
    }, 3500);
  },

  // Badge Updates
  updateCartBadge() {
    const cart = Store.getCart();
    const totalCount = cart.reduce((sum, item) => sum + item.quantity, 0);
    document.querySelectorAll(".cart-count-badge").forEach(badge => {
      badge.textContent = totalCount;
      badge.style.display = totalCount > 0 ? "flex" : "none";
    });
  },

  updateWishlistBadge() {
    const wishlist = Store.getWishlist();
    document.querySelectorAll(".wishlist-count-badge").forEach(badge => {
      badge.textContent = wishlist.length;
      badge.style.display = wishlist.length > 0 ? "flex" : "none";
    });
  },

  // Home Page Products Rendering
  renderHomeProducts() {
    const container = document.getElementById("home-featured-grid");
    if (!container) return;

    const products = Store.getProducts().slice(0, 3);
    container.innerHTML = products.map(p => this.createProductCardHtml(p)).join("");
  },

  renderHomeJournal() {
    const container = document.getElementById("home-journal-grid");
    if (!container) return;

    container.innerHTML = INITIAL_JOURNAL.slice(0, 3).map(art => `
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

  // Catalog & Shop Logic
  renderCatalog() {
    const container = document.getElementById("catalog-products-grid");
    if (!container) return;

    let products = Store.getProducts();

    // Category Filter
    if (this.activeCategory !== "all") {
      products = products.filter(p => p.category === this.activeCategory);
    }

    // Sort Logic
    if (this.activeSort === "price-low") {
      products.sort((a, b) => a.basePrice - b.basePrice);
    } else if (this.activeSort === "price-high") {
      products.sort((a, b) => b.basePrice - a.basePrice);
    } else if (this.activeSort === "rating") {
      products.sort((a, b) => b.rating - a.rating);
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
    const isWish = Store.isWishlisted(product.id);
    const primaryVariant = product.variants ? product.variants[0] : { size: product.baseSize, price: product.basePrice };

    return `
      <div class="product-card" data-product-id="${product.id}">
        <div class="product-card-media" onclick="App.openPdpModal('${product.id}')">
          <img src="${product.image}" alt="${product.name}" class="product-card-img" loading="lazy" />
          ${product.badge ? `<div class="product-badge-overlay"><span class="badge badge-terracotta">${product.badge}</span></div>` : ""}
          <button class="product-wishlist-btn ${isWish ? "active" : ""}" 
                  onclick="event.stopPropagation(); App.toggleWishlist('${product.id}')"
                  aria-label="Save to wishlist" title="Save to wishlist">
            <svg class="icon icon-sm" viewBox="0 0 24 24" ${isWish ? 'style="fill: var(--color-terracotta-600); stroke: var(--color-terracotta-600);"' : ""}>
              <path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z"></path>
            </svg>
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
              <button class="btn btn-primary btn-sm" onclick="App.quickAddToCart('${product.id}')">
                <svg class="icon icon-sm" viewBox="0 0 24 24"><circle cx="9" cy="21" r="1"></circle><circle cx="20" cy="21" r="1"></circle><path d="M1 1h4l2.68 13.39a2 2 0 0 0 2 1.61h9.72a2 2 0 0 0 2-1.61L23 6H6"></path></svg>
                Add
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

  quickAddToCart(productId) {
    const product = Store.getProductById(productId);
    if (!product) return;

    const card = document.querySelector(`.product-card[data-product-id="${productId}"]`);
    const variantIdx = card && card.dataset.selectedVariantIndex ? parseInt(card.dataset.selectedVariantIndex, 10) : 0;
    const variant = product.variants ? product.variants[variantIdx] : { size: product.baseSize, price: product.basePrice };

    Store.addToCart({
      productId: product.id,
      name: product.name,
      image: product.image,
      size: variant.size,
      isCustom: false,
      quantity: 1,
      unitPrice: variant.price
    });

    this.toast(`Added <strong>${product.name}</strong> (${variant.size}) to cart`);
  },

  toggleWishlist(productId) {
    const isNow = Store.toggleWishlist(productId);
    const product = Store.getProductById(productId);
    const title = product ? product.name : "Product";
    if (isNow) {
      this.toast(`Saved <strong>${title}</strong> to wishlist`);
    } else {
      this.toast(`Removed from wishlist`, "info");
    }
  },

  // PDP Modal Logic (Supports Size variants AND Custom Liters)
  openPdpModal(productId) {
    const product = Store.getProductById(productId);
    if (!product) return;

    this.selectedProduct = product;
    this.selectedVariantIndex = 0;
    this.isCustomQty = false;
    this.customLitersValue = product.minCustomLiters || 5;
    this.pdpQuantity = 1;

    const modal = document.getElementById("pdp-modal");
    if (!modal) return;

    // Render PDP inside modal
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

    const isWish = Store.isWishlisted(p.id);
    const curVariant = p.variants ? p.variants[this.selectedVariantIndex] : { size: p.baseSize, price: p.basePrice };
    const currentPrice = this.isCustomQty ? (this.customLitersValue * p.customPricePerLiter) : curVariant.price;

    container.innerHTML = `
      <div class="modal-pdp-grid">
        <div class="modal-pdp-media">
          <img src="${p.image}" alt="${p.name}" class="modal-pdp-img" />
          ${p.badge ? `<div class="product-badge-overlay"><span class="badge badge-terracotta">${p.badge}</span></div>` : ""}
        </div>

        <div class="modal-pdp-info">
          <div class="product-category-meta">
            <span>${p.categoryLabel}</span>
            <span class="badge ${p.inStock ? "badge-stock" : "badge-out"}">${p.inStock ? "In Stock & Freshly Fermented" : "Out of Stock"}</span>
          </div>

          <h2 class="pdp-title">${p.name}</h2>

          <div class="pdp-meta-row">
            <div class="product-rating-inline">
              <svg class="star-icon" viewBox="0 0 24 24"><polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"></polygon></svg>
              <strong>${p.rating}</strong>
              <span style="color: var(--color-text-subtle);">(${p.reviewCount} verified reviews)</span>
            </div>
            <span style="color: var(--color-text-subtle); font-size: 0.8125rem;">Handcrafted in AP & Telangana</span>
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
              <span>Select Quantity / Package Size:</span>
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

            <!-- Custom Quantity Input Box (PRD Section 16 & 23) -->
            <div class="custom-qty-box ${this.isCustomQty ? "visible" : ""}">
              <div class="custom-qty-flex">
                <label for="custom-liters-input" style="font-size: 0.875rem; font-weight: 600; color: var(--color-moss-900);">
                  Enter Liters:
                </label>
                <input type="number" id="custom-liters-input" class="custom-qty-input" 
                       min="${p.minCustomLiters || 5}" max="500" value="${this.customLitersValue}" 
                       oninput="App.updateCustomLiters(this.value)" />
                <span style="font-size: 0.8125rem; color: var(--color-text-muted);">
                  (Min ${p.minCustomLiters || 5}L for organization / bulk rate @ ₹${p.customPricePerLiter}/L)
                </span>
              </div>
            </div>
          </div>

          <!-- PDP Actions Row -->
          <div class="pdp-actions-row">
            <div class="qty-stepper">
              <button class="qty-stepper-btn" onclick="App.stepPdpQty(-1)">−</button>
              <span class="qty-stepper-val" id="pdp-qty-display">${this.pdpQuantity}</span>
              <button class="qty-stepper-btn" onclick="App.stepPdpQty(1)">+</button>
            </div>

            <button class="btn btn-primary btn-lg" style="flex-grow: 1;" onclick="App.addPdpToCart()">
              <svg class="icon" viewBox="0 0 24 24"><circle cx="9" cy="21" r="1"></circle><circle cx="20" cy="21" r="1"></circle><path d="M1 1h4l2.68 13.39a2 2 0 0 0 2 1.61h9.72a2 2 0 0 0 2-1.61L23 6H6"></path></svg>
              Add to Cart
            </button>

            <button class="btn btn-secondary btn-lg" onclick="App.buyPdpNow()">
              Buy Now
            </button>
          </div>

          <!-- Product Details Tabs -->
          <div class="pdp-tabs-nav">
            <button class="pdp-tab-btn active" onclick="App.switchPdpTab(this, 'tab-ingredients')">Ingredients</button>
            <button class="pdp-tab-btn" onclick="App.switchPdpTab(this, 'tab-usage')">How to Use</button>
            <button class="pdp-tab-btn" onclick="App.switchPdpTab(this, 'tab-safety')">Safety & Storage</button>
            <button class="pdp-tab-btn" onclick="App.switchPdpTab(this, 'tab-impact')">Eco Facts</button>
            <button class="pdp-tab-btn" onclick="App.switchPdpTab(this, 'tab-reviews')">Verified Reviews</button>
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

          <div id="tab-usage" class="pdp-tab-pane">
            <p style="margin-bottom: 12px; font-weight: 500; color: var(--color-moss-900);">Recommended Dilution & Surface Ratios:</p>
            <table class="ingredient-table">
              ${(p.usageGuide || []).map(u => `
                <tr>
                  <td style="width: 35%;"><strong>${u.surface}</strong><br><span class="badge badge-moss">${u.ratio}</span></td>
                  <td>${u.steps}</td>
                </tr>
              `).join("")}
            </table>
          </div>

          <div id="tab-safety" class="pdp-tab-pane">
            <p style="margin-bottom: 10px;">${p.safetyInfo}</p>
            <div style="background: var(--color-sand-100); padding: 12px; border-radius: var(--radius-xs); border: 1px solid var(--color-border); font-size: 0.8125rem;">
              <strong>Storage Guidelines:</strong> Store in an amber or opaque container at ambient room temperature (18°C–32°C). Mild sediment at the base is active mother enzyme and is completely normal.
            </div>
          </div>

          <div id="tab-impact" class="pdp-tab-pane">
            <ul style="padding-left: 18px; display: flex; flex-direction: column; gap: 8px;">
              ${(p.environmentalFacts || []).map(f => `<li>${f}</li>`).join("")}
            </ul>
          </div>

          <div id="tab-reviews" class="pdp-tab-pane">
            <div style="margin-bottom: 20px;">
              <h4 style="font-size: 1rem; color: var(--color-moss-900); margin-bottom: 8px;">Write a Verified Customer Review</h4>
              <form onsubmit="App.handleReviewSubmit(event, '${p.id}')" style="display: flex; flex-direction: column; gap: 10px; background: var(--color-sand-50); padding: 14px; border: 1px solid var(--color-border); border-radius: var(--radius-xs);">
                <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 10px;">
                  <input type="text" name="reviewerName" class="form-input" placeholder="Your Name" required />
                  <input type="text" name="reviewerLocation" class="form-input" placeholder="City (e.g. Hyderabad, AP)" required />
                </div>
                <div style="display: flex; gap: 10px; align-items: center;">
                  <span style="font-size: 0.8125rem; font-weight: 600;">Rating:</span>
                  <select name="rating" class="form-select" style="width: auto; padding: 4px 8px;">
                    <option value="5">5 Stars - Outstanding</option>
                    <option value="4">4 Stars - Very Good</option>
                    <option value="3">3 Stars - Good</option>
                  </select>
                </div>
                <input type="text" name="reviewTitle" class="form-input" placeholder="Headline / Summary" required />
                <textarea name="reviewContent" class="form-textarea" rows="2" placeholder="Share your experience with cleaning performance, fragrance, or dilution..." required></textarea>
                <button type="submit" class="btn btn-primary btn-sm" style="align-self: flex-start;">Submit Review</button>
              </form>
            </div>

            <div id="pdp-reviews-list" style="display: flex; flex-direction: column; gap: 14px;">
              ${Store.getReviews().filter(r => r.productId === p.id).map(r => `
                <div style="padding-bottom: 12px; border-bottom: 1px solid var(--color-border);">
                  <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 4px;">
                    <div style="display: flex; align-items: center; gap: 8px;">
                      <strong>${r.author}</strong>
                      <span class="badge badge-stock" style="font-size: 0.65rem;">Verified Purchase</span>
                    </div>
                    <span style="font-size: 0.75rem; color: var(--color-text-subtle);">${r.location || r.date}</span>
                  </div>
                  <div style="color: #D97706; font-size: 0.8125rem; margin-bottom: 4px;">★★★★★</div>
                  <h5 style="font-size: 0.875rem; font-weight: 600; color: var(--color-moss-900); margin-bottom: 4px;">${r.title}</h5>
                  <p style="font-size: 0.8125rem; color: var(--color-text-muted);">${r.content}</p>
                </div>
              `).join("")}
            </div>
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
    let liters = parseInt(val, 10);
    if (isNaN(liters) || liters < (p.minCustomLiters || 5)) {
      liters = p.minCustomLiters || 5;
    }
    this.customLitersValue = liters;

    const priceText = document.getElementById("pdp-price-text");
    const unitText = document.getElementById("pdp-size-unit-text");
    if (priceText && unitText) {
      priceText.textContent = `₹${liters * p.customPricePerLiter}`;
      unitText.textContent = `(${liters} Liters @ ₹${p.customPricePerLiter}/L)`;
    }
  },

  stepPdpQty(delta) {
    this.pdpQuantity = Math.max(1, this.pdpQuantity + delta);
    const display = document.getElementById("pdp-qty-display");
    if (display) display.textContent = this.pdpQuantity;
  },

  switchPdpTab(btnEl, tabId) {
    btnEl.closest(".modal-pdp-info").querySelectorAll(".pdp-tab-btn").forEach(b => b.classList.remove("active"));
    btnEl.closest(".modal-pdp-info").querySelectorAll(".pdp-tab-pane").forEach(p => p.classList.remove("active"));

    btnEl.classList.add("active");
    const target = document.getElementById(tabId);
    if (target) target.classList.add("active");
  },

  addPdpToCart() {
    const p = this.selectedProduct;
    if (!p) return;

    if (this.isCustomQty) {
      Store.addToCart({
        productId: p.id,
        name: p.name,
        image: p.image,
        size: `${this.customLitersValue} Liters (Custom Bulk)`,
        isCustom: true,
        customLiters: this.customLitersValue,
        quantity: this.pdpQuantity,
        unitPrice: this.customLitersValue * p.customPricePerLiter
      });
      this.toast(`Added ${this.pdpQuantity}x <strong>${p.name}</strong> (${this.customLitersValue}L Custom) to cart`);
    } else {
      const v = p.variants ? p.variants[this.selectedVariantIndex] : { size: p.baseSize, price: p.basePrice };
      Store.addToCart({
        productId: p.id,
        name: p.name,
        image: p.image,
        size: v.size,
        isCustom: false,
        quantity: this.pdpQuantity,
        unitPrice: v.price
      });
      this.toast(`Added ${this.pdpQuantity}x <strong>${p.name}</strong> (${v.size}) to cart`);
    }

    this.closePdpModal();
    this.openCartDrawer();
  },

  buyPdpNow() {
    this.addPdpToCart();
    window.location.hash = "#checkout";
  },

  handleReviewSubmit(e, productId) {
    e.preventDefault();
    const form = e.target;
    const author = form.reviewerName.value.trim();
    const location = form.reviewerLocation.value.trim();
    const rating = parseInt(form.rating.value, 10);
    const title = form.reviewTitle.value.trim();
    const content = form.reviewContent.value.trim();

    Store.addReview({
      productId,
      author,
      location,
      rating,
      title,
      content
    });

    this.toast("Thank you! Your verified review has been published.");
    this.renderPdpContent();
  },

  // Cart Drawer Logic
  openCartDrawer() {
    const drawerBackdrop = document.getElementById("cart-drawer-backdrop");
    if (!drawerBackdrop) return;
    this.renderCartDrawer();
    drawerBackdrop.classList.add("open");
    document.body.style.overflow = "hidden";
  },

  closeCartDrawer() {
    const drawerBackdrop = document.getElementById("cart-drawer-backdrop");
    if (drawerBackdrop) drawerBackdrop.classList.remove("open");
    document.body.style.overflow = "";
  },

  renderCartDrawer() {
    const container = document.getElementById("cart-drawer-items");
    const summaryContainer = document.getElementById("cart-drawer-summary");
    if (!container || !summaryContainer) return;

    const cart = Store.getCart();

    if (cart.length === 0) {
      container.innerHTML = `
        <div style="text-align: center; padding: 48px 20px; color: var(--color-text-muted);">
          <svg class="icon icon-lg" viewBox="0 0 24 24" style="margin: 0 auto 12px; stroke: var(--color-text-subtle);"><circle cx="9" cy="21" r="1"></circle><circle cx="20" cy="21" r="1"></circle><path d="M1 1h4l2.68 13.39a2 2 0 0 0 2 1.61h9.72a2 2 0 0 0 2-1.61L23 6H6"></path></svg>
          <h4 style="font-family: var(--font-serif); font-size: 1.25rem; color: var(--color-moss-900); margin-bottom: 6px;">Your Cart is Empty</h4>
          <p style="font-size: 0.875rem; margin-bottom: 20px;">Explore our pure citrus ferments and plant-based essentials.</p>
          <a href="#shop" class="btn btn-primary btn-sm" onclick="App.closeCartDrawer()">Explore Catalog</a>
        </div>
      `;
      summaryContainer.innerHTML = "";
      return;
    }

    container.innerHTML = cart.map(item => `
      <div class="cart-item">
        <img src="${item.image}" alt="${item.name}" class="cart-item-thumb" />
        <div class="cart-item-info">
          <h4 class="cart-item-title">${item.name}</h4>
          <div class="cart-item-size">${item.size}</div>
          <div class="cart-item-controls">
            <div class="qty-stepper" style="border-radius: var(--radius-xs);">
              <button class="qty-stepper-btn" style="width: 28px; height: 30px;" onclick="Store.updateCartQuantity('${item.id}', ${item.quantity - 1})">−</button>
              <span class="qty-stepper-val" style="width: 30px; font-size: 0.8125rem;">${item.quantity}</span>
              <button class="qty-stepper-btn" style="width: 28px; height: 30px;" onclick="Store.updateCartQuantity('${item.id}', ${item.quantity + 1})">+</button>
            </div>
            <span class="cart-item-price">₹${item.unitPrice * item.quantity}</span>
            <button class="cart-remove-btn" onclick="Store.removeFromCart('${item.id}')">Remove</button>
          </div>
        </div>
      </div>
    `).join("");

    const summary = Store.getCartSummary();

    summaryContainer.innerHTML = `
      <div class="coupon-row">
        <input type="text" id="cart-coupon-input" class="coupon-input" placeholder="Promo code (e.g. FIRSTBIO10)" value="${summary.coupon ? summary.coupon.code : ""}" />
        <button class="btn btn-secondary btn-sm" onclick="App.applyCartCoupon()">Apply</button>
      </div>
      ${summary.coupon ? `
        <div style="font-size: 0.75rem; color: var(--color-success); margin-bottom: 10px; display: flex; justify-content: space-between;">
          <span>Applied: <strong>${summary.coupon.code}</strong> (${summary.coupon.description})</span>
          <button style="color: var(--color-danger); text-decoration: underline;" onclick="App.removeCoupon()">Remove</button>
        </div>
      ` : ""}
      <div class="cart-summary-line">
        <span>Subtotal</span>
        <span>₹${summary.subtotal}</span>
      </div>
      ${summary.discount > 0 ? `
        <div class="cart-summary-line" style="color: var(--color-success);">
          <span>Discount</span>
          <span>−₹${summary.discount}</span>
        </div>
      ` : ""}
      <div class="cart-summary-line">
        <span>Estimated Delivery (AP & Telangana)</span>
        <span>${summary.shipping === 0 ? '<strong style="color: var(--color-success);">FREE</strong>' : '₹' + summary.shipping}</span>
      </div>
      <div class="cart-total-line">
        <span>Total Payable</span>
        <span>₹${summary.total}</span>
      </div>
      <a href="#checkout" class="btn btn-primary btn-lg" style="width: 100%; text-align: center;" onclick="App.closeCartDrawer()">
        Proceed to Checkout
      </a>
      <p style="font-size: 0.6875rem; color: var(--color-text-subtle); text-align: center; margin-top: 10px;">
        100% Recyclable Packaging | Free delivery across AP & Telangana on orders above ₹499
      </p>
    `;
  },

  applyCartCoupon() {
    const input = document.getElementById("cart-coupon-input") || document.getElementById("checkout-coupon-input");
    if (!input) return;
    const code = input.value.trim().toUpperCase();

    const coupons = Store.getCoupons();
    const coupon = coupons.find(c => c.code === code && c.active);

    if (!coupon) {
      this.toast("Invalid or expired coupon code", "warning");
      return;
    }

    const cart = Store.getCart();
    let subtotal = cart.reduce((s, i) => s + (i.unitPrice * i.quantity), 0);

    if (coupon.minOrder && subtotal < coupon.minOrder) {
      this.toast(`Minimum order value of ₹${coupon.minOrder} required for ${coupon.code}`, "warning");
      return;
    }

    Store.setAppliedCoupon(coupon);
    this.toast(`Coupon <strong>${coupon.code}</strong> applied successfully!`);
    this.renderCartDrawer();
    if (this.activeRoute === "checkout") this.renderCheckoutSummary();
  },

  removeCoupon() {
    Store.setAppliedCoupon(null);
    this.toast("Coupon removed", "info");
    this.renderCartDrawer();
    if (this.activeRoute === "checkout") this.renderCheckoutSummary();
  },

  // Checkout View
  initCheckoutView() {
    const cart = Store.getCart();
    if (cart.length === 0) {
      window.location.hash = "#shop";
      this.toast("Your cart is empty. Please select products to continue.", "info");
      return;
    }
    this.renderCheckoutSummary();
  },

  renderCheckoutSummary() {
    const container = document.getElementById("checkout-items-summary");
    const totalsContainer = document.getElementById("checkout-totals-summary");
    if (!container || !totalsContainer) return;

    const cart = Store.getCart();
    const targetState = document.getElementById("checkout-state") ? document.getElementById("checkout-state").value : "Telangana";
    const summary = Store.getCartSummary(targetState);

    container.innerHTML = cart.map(item => `
      <div style="display: flex; justify-content: space-between; align-items: center; padding-bottom: 12px; margin-bottom: 12px; border-bottom: 1px solid var(--color-border);">
        <div style="display: flex; gap: 12px; align-items: center;">
          <img src="${item.image}" alt="${item.name}" style="width: 44px; height: 44px; object-fit: cover; border-radius: var(--radius-xs);" />
          <div>
            <h5 style="font-size: 0.875rem; font-weight: 600; color: var(--color-moss-900);">${item.name}</h5>
            <span style="font-size: 0.75rem; color: var(--color-text-subtle);">${item.size} × ${item.quantity}</span>
          </div>
        </div>
        <span style="font-weight: 700; font-size: 0.9375rem;">₹${item.unitPrice * item.quantity}</span>
      </div>
    `).join("");

    totalsContainer.innerHTML = `
      <div class="coupon-row" style="margin-bottom: 16px;">
        <input type="text" id="checkout-coupon-input" class="coupon-input" placeholder="Promo code" value="${summary.coupon ? summary.coupon.code : ""}" />
        <button type="button" class="btn btn-secondary btn-sm" onclick="App.applyCartCoupon()">Apply</button>
      </div>
      <div class="cart-summary-line">
        <span>Items Subtotal</span>
        <span>₹${summary.subtotal}</span>
      </div>
      ${summary.discount > 0 ? `
        <div class="cart-summary-line" style="color: var(--color-success);">
          <span>Coupon Discount</span>
          <span>−₹${summary.discount}</span>
        </div>
      ` : ""}
      <div class="cart-summary-line">
        <span>Delivery to ${targetState}</span>
        <span>${summary.shipping === 0 ? '<strong style="color: var(--color-success);">FREE</strong>' : '₹' + summary.shipping}</span>
      </div>
      <div class="cart-total-line">
        <span>Total Amount</span>
        <span>₹${summary.total}</span>
      </div>
    `;
  },

  handleCheckoutSubmit(e) {
    e.preventDefault();
    const form = e.target;
    const cart = Store.getCart();

    if (cart.length === 0) {
      this.toast("Cart is empty", "warning");
      return;
    }

    const state = form.state.value;
    const summary = Store.getCartSummary(state);

    const orderData = {
      customerName: form.fullName.value.trim(),
      phone: form.phone.value.trim(),
      email: form.email.value.trim(),
      address: {
        flat: form.addressLine1.value.trim(),
        street: form.addressLine2.value.trim() || "",
        city: form.city.value.trim(),
        district: form.district ? form.district.value.trim() : "",
        state: state,
        pincode: form.pincode.value.trim()
      },
      deliveryNotes: form.deliveryNotes ? form.deliveryNotes.value.trim() : "",
      items: cart,
      subtotal: summary.subtotal,
      discount: summary.discount,
      couponCode: summary.coupon ? summary.coupon.code : null,
      deliveryFee: summary.shipping,
      total: summary.total,
      paymentMethod: form.paymentMethod.value,
      paymentStatus: form.paymentMethod.value === "COD" ? "Pending (Cash on Delivery)" : "Paid via UPI/Card"
    };

    const newOrder = Store.createOrder(orderData);
    Store.clearCart();
    Store.setAppliedCoupon(null);

    this.toast(`Order placed successfully! Order ID: ${newOrder.orderId}`);
    window.location.hash = `#tracking/${newOrder.orderId}`;
  },

  // Live Order Tracking View
  initTrackingView(orderId) {
    const container = document.getElementById("tracking-content-area");
    if (!container) return;

    const orders = Store.getOrders();
    const activeOrder = orderId ? orders.find(o => o.orderId.toLowerCase() === orderId.toLowerCase()) : orders[0];

    if (!activeOrder) {
      container.innerHTML = `
        <div class="tracking-container" style="text-align: center;">
          <h3 style="font-family: var(--font-serif); font-size: 1.5rem; color: var(--color-moss-900); margin-bottom: 12px;">Track Your Delivery</h3>
          <p style="font-size: 0.9375rem; color: var(--color-text-muted); margin-bottom: 24px;">
            Enter your Prakriti Bio Order ID (e.g. <code>PB-2026-8941</code>) to track dispatch status across Telangana & Andhra Pradesh.
          </p>
          <div style="display: flex; gap: 8px; max-width: 400px; margin: 0 auto;">
            <input type="text" id="manual-track-input" class="form-input" placeholder="e.g. PB-2026-8941" />
            <button class="btn btn-primary btn-sm" onclick="App.searchOrderManual()">Track</button>
          </div>
        </div>
      `;
      return;
    }

    const stages = ["Order Placed", "Confirmed", "Packed", "Shipped", "Delivered"];
    const currentIdx = stages.indexOf(activeOrder.status);

    container.innerHTML = `
      <div class="tracking-container">
        <div style="display: flex; justify-content: space-between; align-items: flex-start; margin-bottom: 24px; padding-bottom: 20px; border-bottom: 1px solid var(--color-border); flex-wrap: wrap; gap: 12px;">
          <div>
            <span class="section-tag">Order Tracking</span>
            <h2 style="font-family: var(--font-serif); font-size: 1.75rem; color: var(--color-moss-900); margin: 6px 0;">Order #${activeOrder.orderId}</h2>
            <p style="font-size: 0.8125rem; color: var(--color-text-subtle);">Placed on ${new Date(activeOrder.createdDate).toLocaleDateString("en-IN", { dateStyle: "long" })}</p>
          </div>
          <div style="text-align: right;">
            <span class="badge badge-stock" style="font-size: 0.875rem; padding: 6px 12px;">${activeOrder.status}</span>
            <div style="font-size: 0.8125rem; color: var(--color-text-muted); margin-top: 6px;">Payment: <strong>${activeOrder.paymentMethod}</strong></div>
          </div>
        </div>

        ${activeOrder.courierName ? `
          <div style="background: var(--color-sand-100); border: 1px solid var(--color-border); border-radius: var(--radius-xs); padding: 16px; margin-bottom: 28px; display: flex; justify-content: space-between; align-items: center; flex-wrap: gap: 12px;">
            <div>
              <span style="font-size: 0.75rem; text-transform: uppercase; color: var(--color-text-subtle); font-weight: 700;">Courier Service</span>
              <h4 style="font-size: 1rem; color: var(--color-moss-900); margin: 2px 0;">${activeOrder.courierName}</h4>
              <p style="font-size: 0.8125rem; color: var(--color-text-muted);">AWB / Docket: <code>${activeOrder.trackingNumber || "Assigned"}</code></p>
            </div>
            ${activeOrder.trackingUrl ? `
              <a href="${activeOrder.trackingUrl}" target="_blank" rel="noopener noreferrer" class="btn btn-outline-accent btn-sm">
                Open External Tracker ↗
              </a>
            ` : ""}
          </div>
        ` : ""}

        <!-- Order Timeline -->
        <h4 style="font-family: var(--font-serif); font-size: 1.15rem; color: var(--color-moss-900); margin-bottom: 16px;">Shipment Milestones</h4>
        <div class="timeline">
          ${(activeOrder.statusTimeline || []).map((step, idx) => `
            <div class="timeline-step completed">
              <div class="timeline-dot"></div>
              <div class="timeline-content">
                <h4>${step.status}</h4>
                <p>${step.note}</p>
                <div class="timeline-time">${step.timestamp}</div>
              </div>
            </div>
          `).join("")}
        </div>

        <!-- Ordered Items Summary & Receipt Button -->
        <div style="margin-top: 32px; padding-top: 24px; border-top: 1px solid var(--color-border);">
          <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 16px;">
            <h4 style="font-family: var(--font-serif); font-size: 1.15rem; color: var(--color-moss-900);">Order Items (${activeOrder.items.length})</h4>
            <button class="btn btn-secondary btn-sm" onclick="App.printInvoice('${activeOrder.orderId}')">
              <svg class="icon icon-sm" viewBox="0 0 24 24"><polyline points="6 9 6 2 18 2 18 9"></polyline><path d="M6 18H4a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2"></path><rect x="6" y="14" width="12" height="8"></rect></svg>
              View Printable Invoice
            </button>
          </div>

          <div style="background: var(--color-sand-50); border: 1px solid var(--color-border); border-radius: var(--radius-xs); padding: 16px; margin-bottom: 24px;">
            ${activeOrder.items.map(item => `
              <div style="display: flex; justify-content: space-between; padding: 6px 0; font-size: 0.875rem;">
                <span>${item.name} (${item.size}) × ${item.quantity}</span>
                <span style="font-weight: 600;">₹${item.unitPrice * item.quantity}</span>
              </div>
            `).join("")}
            <div style="display: flex; justify-content: space-between; padding-top: 8px; margin-top: 8px; border-top: 1px solid var(--color-border); font-weight: 700; font-size: 1rem; color: var(--color-moss-900);">
              <span>Total Paid</span>
              <span>₹${activeOrder.total}</span>
            </div>
          </div>

          <!-- Cancellation or Return Request -->
          <div style="background: #fff; border: 1px dashed var(--color-border-dark); border-radius: var(--radius-xs); padding: 16px;">
            <h5 style="font-size: 0.875rem; font-weight: 700; color: var(--color-moss-900); margin-bottom: 4px;">Need to Modify or Return?</h5>
            <p style="font-size: 0.8125rem; color: var(--color-text-muted); margin-bottom: 12px;">
              Per our verified policy, orders can be cancelled prior to dispatch, or returned within 7 days of delivery for damaged or defective bottles.
            </p>
            <div style="display: flex; gap: 10px;">
              <button class="btn btn-secondary btn-sm" onclick="App.openOrderActionModal('${activeOrder.orderId}', 'cancel')">Request Cancellation</button>
              <button class="btn btn-secondary btn-sm" onclick="App.openOrderActionModal('${activeOrder.orderId}', 'return')">Request Return / Refund</button>
            </div>
          </div>
        </div>
      </div>
    `;
  },

  searchOrderManual() {
    const input = document.getElementById("manual-track-input");
    if (input && input.value.trim()) {
      window.location.hash = `#tracking/${input.value.trim().toUpperCase()}`;
    }
  },

  openOrderActionModal(orderId, actionType) {
    const reason = prompt(`Please enter the reason for your ${actionType} request for Order #${orderId}:`);
    if (reason && reason.trim()) {
      Store.requestOrderAction(orderId, actionType, reason.trim());
      this.toast(`Your ${actionType} request has been submitted to customer operations.`);
      this.initTrackingView(orderId);
    }
  },

  printInvoice(orderId) {
    const orders = Store.getOrders();
    const order = orders.find(o => o.orderId === orderId);
    if (!order) return;

    const printWin = window.open("", "_blank");
    printWin.document.write(`
      <!DOCTYPE html>
      <html>
      <head>
        <title>Invoice - ${order.orderId} - Prakriti Bio</title>
        <style>
          body { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif; padding: 40px; color: #1C2621; }
          .header { display: flex; justify-content: space-between; border-bottom: 2px solid #1B3529; padding-bottom: 20px; margin-bottom: 20px; }
          h1 { margin: 0; color: #1B3529; font-size: 24px; }
          table { width: 100%; border-collapse: collapse; margin: 20px 0; }
          th, td { border: 1px solid #E5E1D8; padding: 10px; text-align: left; font-size: 14px; }
          th { background: #F7F5F0; }
          .totals { margin-left: auto; width: 300px; }
          .totals td { border: none; padding: 6px 0; }
        </style>
      </head>
      <body>
        <div class="header">
          <div>
            <h1>Prakriti Bio</h1>
            <p style="font-size: 13px; margin: 4px 0;">Pure Bioenzyme Cleaners from Repurposed Citrus Peels</p>
            <p style="font-size: 12px; color: #56675E;">Telangana & Andhra Pradesh, India</p>
          </div>
          <div style="text-align: right;">
            <h2>TAX INVOICE</h2>
            <p style="margin: 2px 0;"><strong>Invoice #:</strong> ${order.orderId}</p>
            <p style="margin: 2px 0;"><strong>Date:</strong> ${new Date(order.createdDate).toLocaleDateString("en-IN")}</p>
          </div>
        </div>

        <div style="display: flex; justify-content: space-between; margin-bottom: 20px; font-size: 14px;">
          <div>
            <strong>Billed & Delivered To:</strong><br>
            ${order.customerName}<br>
            ${order.address.flat}, ${order.address.street}<br>
            ${order.address.city}, ${order.address.state} - ${order.address.pincode}<br>
            Phone: ${order.phone}
          </div>
          <div style="text-align: right;">
            <strong>Payment Info:</strong><br>
            Method: ${order.paymentMethod}<br>
            Status: ${order.paymentStatus}
          </div>
        </div>

        <table>
          <thead>
            <tr>
              <th>Item Description</th>
              <th>Variant</th>
              <th>Qty</th>
              <th>Unit Price</th>
              <th>Amount</th>
            </tr>
          </thead>
          <tbody>
            ${order.items.map(item => `
              <tr>
                <td>${item.name}</td>
                <td>${item.size}</td>
                <td>${item.quantity}</td>
                <td>₹${item.unitPrice}</td>
                <td>₹${item.unitPrice * item.quantity}</td>
              </tr>
            `).join("")}
          </tbody>
        </table>

        <table class="totals">
          <tr>
            <td>Subtotal:</td>
            <td style="text-align: right;">₹${order.subtotal}</td>
          </tr>
          ${order.discount ? `
            <tr>
              <td>Discount:</td>
              <td style="text-align: right;">−₹${order.discount}</td>
            </tr>
          ` : ""}
          <tr>
            <td>Shipping Fee:</td>
            <td style="text-align: right;">${order.deliveryFee === 0 ? "FREE" : "₹" + order.deliveryFee}</td>
          </tr>
          <tr style="font-weight: bold; font-size: 16px; border-top: 1px solid #1B3529;">
            <td>Total:</td>
            <td style="text-align: right;">₹${order.total}</td>
          </tr>
        </table>

        <div style="margin-top: 40px; font-size: 12px; color: #7E9086; text-align: center; border-top: 1px solid #E5E1D8; padding-top: 16px;">
          Thank you for choosing pure, bio-responsible cleaning and keeping Andhra Pradesh & Telangana waterways safe.
        </div>
      </body>
      </html>
    `);
    printWin.document.close();
    printWin.focus();
    setTimeout(() => printWin.print(), 250);
  },

  // Admin Portal Logic (PRD Sections 32-35)
  initAdminView() {
    this.updateAdminStats();
    this.renderAdminOrders();
    this.renderAdminProducts();
    this.renderAdminCoupons();
  },

  updateAdminStats() {
    const orders = Store.getOrders();
    const products = Store.getProducts();

    const totalSales = orders.reduce((sum, o) => sum + (o.total || 0), 0);
    const lowStock = products.filter(p => p.stock < 20).length;

    const salesEl = document.getElementById("admin-stat-sales");
    const ordersEl = document.getElementById("admin-stat-orders");
    const productsEl = document.getElementById("admin-stat-products");
    const lowStockEl = document.getElementById("admin-stat-lowstock");

    if (salesEl) salesEl.textContent = `₹${Math.round(totalSales).toLocaleString("en-IN")}`;
    if (ordersEl) ordersEl.textContent = orders.length;
    if (productsEl) productsEl.textContent = products.length;
    if (lowStockEl) lowStockEl.textContent = lowStock;
  },

  switchAdminTab(tabName) {
    document.querySelectorAll(".admin-tab").forEach(t => t.classList.remove("active"));
    document.querySelectorAll(".admin-tab-pane").forEach(p => p.style.display = "none");

    const targetTab = document.querySelector(`.admin-tab[data-tab="${tabName}"]`);
    const targetPane = document.getElementById(`admin-pane-${tabName}`);

    if (targetTab) targetTab.classList.add("active");
    if (targetPane) targetPane.style.display = "block";
  },

  renderAdminOrders() {
    const container = document.getElementById("admin-orders-table-body");
    if (!container) return;

    const orders = Store.getOrders();

    container.innerHTML = orders.map(o => `
      <tr>
        <td><strong>#${o.orderId}</strong></td>
        <td>
          ${o.customerName}<br>
          <span style="font-size: 0.75rem; color: var(--color-text-subtle);">${o.address.city}, ${o.address.state}</span>
        </td>
        <td>${o.items.length} items (₹${o.total})</td>
        <td>
          <select class="form-select" style="padding: 4px 8px; font-size: 0.8125rem;" onchange="App.handleAdminStatusChange('${o.orderId}', this.value)">
            <option value="Order Placed" ${o.status === "Order Placed" ? "selected" : ""}>Order Placed</option>
            <option value="Confirmed" ${o.status === "Confirmed" ? "selected" : ""}>Confirmed</option>
            <option value="Packed" ${o.status === "Packed" ? "selected" : ""}>Packed</option>
            <option value="Shipped" ${o.status === "Shipped" ? "selected" : ""}>Shipped</option>
            <option value="Out for Delivery" ${o.status === "Out for Delivery" ? "selected" : ""}>Out for Delivery</option>
            <option value="Delivered" ${o.status === "Delivered" ? "selected" : ""}>Delivered</option>
            <option value="Cancelled" ${o.status === "Cancelled" ? "selected" : ""}>Cancelled</option>
          </select>
        </td>
        <td>
          <button class="btn btn-secondary btn-sm" onclick="App.openAdminCourierModal('${o.orderId}')">
            ${o.courierName ? o.courierName : "Assign Logistics"}
          </button>
        </td>
        <td>
          <a href="#tracking/${o.orderId}" class="btn btn-outline-accent btn-sm">Inspect</a>
        </td>
      </tr>
    `).join("");
  },

  handleAdminStatusChange(orderId, newStatus) {
    Store.updateOrderStatus(orderId, newStatus, `Operations updated status to ${newStatus}`);
    this.toast(`Order #${orderId} marked as <strong>${newStatus}</strong>`);
  },

  openAdminCourierModal(orderId) {
    const courierName = prompt("Enter Logistics / Courier Service name (e.g. AP-TG Express / Delhivery):", "AP-TG Express");
    if (!courierName) return;
    const trackingNum = prompt("Enter Tracking Docket Number / AWB:", "APTG-" + Math.floor(1000000 + Math.random() * 9000000));
    if (!trackingNum) return;

    Store.updateOrderStatus(orderId, "Shipped", "Dispatched with assigned logistics", {
      courierName: courierName.trim(),
      trackingNumber: trackingNum.trim(),
      trackingUrl: `https://tracking.example.in/track/${trackingNum.trim()}`
    });

    this.toast(`Logistics assigned for Order #${orderId}`);
    this.renderAdminOrders();
  },

  renderAdminProducts() {
    const container = document.getElementById("admin-products-table-body");
    if (!container) return;

    const products = Store.getProducts();

    container.innerHTML = products.map(p => `
      <tr>
        <td style="display: flex; align-items: center; gap: 10px;">
          <img src="${p.image}" alt="${p.name}" style="width: 36px; height: 36px; object-fit: cover; border-radius: var(--radius-xs);" />
          <div>
            <strong>${p.name}</strong><br>
            <span style="font-size: 0.75rem; color: var(--color-text-subtle);">${p.categoryLabel}</span>
          </div>
        </td>
        <td>₹${p.basePrice} (${p.baseSize})</td>
        <td>
          <input type="number" class="form-input" style="width: 80px; padding: 4px 8px;" value="${p.stock}" 
                 onchange="Store.updateProductStock('${p.id}', this.value)" />
        </td>
        <td>
          <span class="badge ${p.inStock ? "badge-stock" : "badge-out"}">${p.inStock ? "Active" : "Depleted"}</span>
        </td>
        <td>
          <button class="btn btn-secondary btn-sm" onclick="App.openPdpModal('${p.id}')">View</button>
        </td>
      </tr>
    `).join("");
  },

  renderAdminCoupons() {
    const container = document.getElementById("admin-coupons-table-body");
    if (!container) return;

    const coupons = Store.getCoupons();

    container.innerHTML = coupons.map(c => `
      <tr>
        <td><strong>${c.code}</strong></td>
        <td>${c.freeShipping ? "Free Delivery" : c.discountPercent + "% Off"}</td>
        <td>₹${c.minOrder || 0}</td>
        <td>${c.description}</td>
        <td>
          <span class="badge ${c.active ? "badge-stock" : "badge-out"}">${c.active ? "Active" : "Disabled"}</span>
        </td>
      </tr>
    `).join("");
  },

  handleCreateCoupon(e) {
    e.preventDefault();
    const form = e.target;
    const code = form.code.value.trim().toUpperCase();
    const discountPercent = parseInt(form.discountPercent.value, 10) || 0;
    const minOrder = parseInt(form.minOrder.value, 10) || 0;
    const description = form.description.value.trim();

    const coupons = Store.getCoupons();
    coupons.push({
      code,
      discountPercent,
      freeShipping: discountPercent === 0,
      minOrder,
      description,
      active: true
    });

    Store.saveCoupons(coupons);
    this.toast(`Created new promo coupon: <strong>${code}</strong>`);
    form.reset();
    this.renderAdminCoupons();
  },

  // Journal View
  renderFullJournal() {
    const container = document.getElementById("full-journal-grid");
    if (!container) return;

    container.innerHTML = INITIAL_JOURNAL.map(art => `
      <article class="pillar-card" style="background: #fff; cursor: pointer;" onclick="App.openArticleModal('${art.id}')">
        <span class="section-tag">${art.tag}</span>
        <h3 style="font-family: var(--font-serif); font-size: 1.35rem; color: var(--color-moss-900); margin: 8px 0;">${art.title}</h3>
        <p style="font-size: 0.9rem; color: var(--color-text-muted); line-height: 1.6; margin-bottom: 16px;">${art.excerpt}</p>
        <div style="font-size: 0.8125rem; color: var(--color-text-subtle); display: flex; justify-content: space-between; border-top: 1px solid var(--color-border); padding-top: 12px;">
          <span>By ${art.author}</span>
          <span>${art.readTime}</span>
        </div>
      </article>
    `).join("");
  },

  openArticleModal(artId) {
    const art = INITIAL_JOURNAL.find(a => a.id === artId);
    if (!art) return;

    const modal = document.getElementById("article-modal");
    const titleEl = document.getElementById("article-modal-title");
    const metaEl = document.getElementById("article-modal-meta");
    const bodyEl = document.getElementById("article-modal-body");

    if (modal && titleEl && metaEl && bodyEl) {
      titleEl.textContent = art.title;
      metaEl.innerHTML = `<span>By ${art.author}</span> • <span>${art.date}</span> • <span class="badge badge-moss">${art.tag}</span>`;
      bodyEl.innerHTML = art.content;
      modal.classList.add("open");
      document.body.style.overflow = "hidden";
    }
  },

  closeArticleModal() {
    const modal = document.getElementById("article-modal");
    if (modal) modal.classList.remove("open");
    document.body.style.overflow = "";
  },

  // Global Instant Search
  openSearch() {
    const modal = document.getElementById("search-modal");
    if (!modal) return;
    modal.style.display = "block";
    const input = document.getElementById("global-search-input");
    if (input) {
      input.value = "";
      input.focus();
      this.handleSearchInput("");
    }
  },

  closeSearch() {
    const modal = document.getElementById("search-modal");
    if (modal) modal.style.display = "none";
  },

  handleSearchInput(query) {
    const q = query.trim().toLowerCase();
    const resultsContainer = document.getElementById("search-results-list");
    if (!resultsContainer) return;

    if (!q) {
      resultsContainer.innerHTML = `
        <div style="font-size: 0.8125rem; color: var(--color-text-subtle); padding: 8px 10px;">
          Popular searches: <em>bioenzyme, grease, floor cleaner, soapnut, dilution, jaggery ratio</em>
        </div>
      `;
      return;
    }

    const products = Store.getProducts().filter(p => 
      p.name.toLowerCase().includes(q) || 
      p.shortDescription.toLowerCase().includes(q) ||
      (p.ingredients && p.ingredients.some(i => i.name.toLowerCase().includes(q) || i.detail.toLowerCase().includes(q)))
    );

    const articles = INITIAL_JOURNAL.filter(a => 
      a.title.toLowerCase().includes(q) || a.excerpt.toLowerCase().includes(q)
    );

    if (products.length === 0 && articles.length === 0) {
      resultsContainer.innerHTML = `
        <div style="padding: 24px; text-align: center; color: var(--color-text-muted);">
          No matches found for "${query}". Try searching for 'bioenzyme', 'dishwash', or 'dilution'.
        </div>
      `;
      return;
    }

    let html = "";
    if (products.length > 0) {
      html += `<div style="font-size: 0.75rem; text-transform: uppercase; font-weight: 700; color: var(--color-text-subtle); padding: 6px 10px;">Products (${products.length})</div>`;
      html += products.map(p => `
        <div class="search-result-item" onclick="App.closeSearch(); App.openPdpModal('${p.id}')">
          <img src="${p.image}" alt="${p.name}" class="search-result-thumb" />
          <div>
            <h4 style="font-size: 0.9375rem; font-weight: 600; color: var(--color-moss-900);">${p.name}</h4>
            <span style="font-size: 0.75rem; color: var(--color-text-muted);">₹${p.basePrice} (${p.baseSize}) • ${p.categoryLabel}</span>
          </div>
        </div>
      `).join("");
    }

    if (articles.length > 0) {
      html += `<div style="font-size: 0.75rem; text-transform: uppercase; font-weight: 700; color: var(--color-text-subtle); padding: 10px 10px 4px;">Journal & Guides (${articles.length})</div>`;
      html += articles.map(a => `
        <div class="search-result-item" onclick="App.closeSearch(); App.openArticleModal('${a.id}')">
          <div>
            <h4 style="font-size: 0.9375rem; font-weight: 600; color: var(--color-moss-900);">${a.title}</h4>
            <span style="font-size: 0.75rem; color: var(--color-text-muted);">${a.tag} • ${a.readTime}</span>
          </div>
        </div>
      `).join("");
    }

    resultsContainer.innerHTML = html;
  },

  // Contact Form & Bulk Quotes
  handleContactSubmit(e) {
    e.preventDefault();
    this.toast("Thank you! Your enquiry has been received. Our team in Hyderabad will contact you shortly.");
    e.target.reset();
  },

  handleBulkQuoteSubmit(e) {
    e.preventDefault();
    const form = e.target;
    const org = form.orgName.value;
    const qty = form.liters.value;
    this.toast(`Quotation request for ${qty}L for ${org} submitted. An institutional coordinator will reach out within 4 hours.`);
    form.reset();
  }
};

// Auto-run on DOM ready
document.addEventListener("DOMContentLoaded", () => App.init());
