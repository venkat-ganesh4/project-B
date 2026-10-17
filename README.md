# Prakriti Bio — Project B

Authentic citrus bioenzyme organic cleaning products and regenerative botanical solutions. Built with high-performance Vanilla JavaScript, CSS custom properties, and native Node.js SQLite backend.

---

## 🌿 Key Features

1. **Product Catalogue & Details (Non-E-Commerce):**
   - Clean product showcase with botanical ingredient breakdowns, fermentation schedules, dilution calculators, and usage guides.
   - All shopping cart, checkout, payments, and order tracking components have been cleanly removed.
   - Replaced with direct **"Request Quote / Enquire"** and interactive product detail modals.

2. **Persistent Product Likes:**
   - Interactive heart button on product cards and modals.
   - Toggles to active red (`#E53E3E`), persists across page refreshes, and prevents duplicate likes using unique visitor fingerprint tokens (`pb_visitor_id`) stored in a database table with `UNIQUE(product_id, visitor_id)`.
   - "❤️ Liked Products" quick-filter pill in the shop catalogue.
   - Real-time likes counter badge in the header.

3. **Complete Live Admin CMS:**
   - Full WYSIWYG/field editor for every public section:
     - Announcement Banner
     - Homepage Hero (Headline, subheadline, stats, primary/secondary CTA)
     - Core Pillars
     - Process Highlights (Fermentation, filtration, zero runoff)
     - Impact Highlights & Counter Metrics
     - Our Story & Heritage
     - Fermentation Process Deep-Dive
     - Global Footer Content
   - **Zero Code Redeployment:** Changes publish instantly and automatically reflect live on the storefront via dynamic client-side hydration (`/api/content`).

4. **Dedicated Inventory Management:**
   - Accessible via the Admin Portal (`/admin` -> "Inventory & Stock" tab) or direct route `/inventory`.
   - Visual stock distribution bar chart (SVG).
   - Real-time stock counts, stock valuation in ₹, low-stock alerts, and out-of-stock badges.
   - **+Add Stock** and **−Remove Stock** modals with mandatory audit reasons (e.g., harvest batch arrival, damaged units, B2B sample dispatch).
   - Editable per-product low-stock alert thresholds.
   - Complete inventory movement audit trail history table.
   - **One-Click CSV Reports:** Download Current Inventory Status CSV and Historical Inventory Movement Logs CSV.

5. **Executive Admin Dashboard:**
   - Real-time metrics for products, inventory units, total valuation, and community likes.
   - Likes Leaderboard showing most popular botanical products.
   - Role-Based Access Control (RBAC): `super_admin`, `inventory_manager`, `content_editor`, `support_staff`.
   - Immutable Admin Audit Logs tracking every login, content edit, stock movement, and password update.

---

## 🚀 Running Locally

This application requires **Node.js 22+** (built and tested on Node.js 24) and has **zero third-party npm dependencies**.

```bash
# Clone the repository
git clone <repo-url>
cd project-B

# Start the server
node server.js
```

The server will initialize SQLite database tables automatically at `data/prakriti.db` in WAL mode and seed initial catalog and CMS content.

- **Public Storefront:** [http://localhost:3000/](http://localhost:3000/)
- **Admin CMS Portal:** [http://localhost:3000/admin](http://localhost:3000/admin)
- **Direct Inventory Portal:** [http://localhost:3000/inventory](http://localhost:3000/inventory)

---

## 🔐 Default Admin Credentials

| Role | Email | Password |
| :--- | :--- | :--- |
| **Super Admin** | `admin@prakritibio.in` | `Admin@Prakriti2026!` |
| **Inventory Manager** | `manager@prakritibio.in` | `Manager@Prakriti2026!` |
| **Staff** | `staff@prakritibio.in` | `Staff@Prakriti2026!` |

---

## 🌐 Hosting & Deployment Note (GitHub Pages vs. Render)

> **Important:** GitHub Pages is a static file host and **cannot execute Node.js backends or write to SQLite databases**. For the CMS, persistent likes, and inventory system to work in production, deploy to a platform that supports Node.js and persistent storage (such as **Render**, **Railway**, **Fly.io**, or an **Ubuntu VPS**).

Refer to the full step-by-step setup guide in [Docs/DEPLOYMENT_GUIDE.md](Docs/DEPLOYMENT_GUIDE.md).