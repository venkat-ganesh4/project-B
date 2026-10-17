# Prakriti Bio — Production Deployment & Hosting Guide

## 1. Why GitHub Pages Cannot Host This Application

GitHub Pages is strictly a **static web server**. It serves pre-compiled HTML, CSS, client-side JavaScript, and image assets directly from a repository branch.

### Limitations of GitHub Pages for Prakriti Bio:
1. **No Backend Runtime:** GitHub Pages does not execute Node.js, Python, or any server processes. It cannot run `server.js` or handle dynamic HTTP API requests (`/api/*`).
2. **No Persistent Database:** Dynamic features such as Product Likes, CMS content updates, inventory tracking, audit logs, and admin authentication require writing to SQLite (`data/prakriti.db`). GitHub Pages is a read-only filesystem with no disk write capability.
3. **No Secure Authentication:** Secure password hashing (PBKDF2/SHA-512), HTTP-only session cookies, and Role-Based Access Control (RBAC) require a backend server to prevent credentials and tokens from being exposed to client browsers.
4. **No Server-Side File Uploads:** Uploading banners, product photography, or blog featured images via the Admin Media Library requires handling multipart file streams and saving them to disk.

---

## 2. Recommended Hosting Solutions

Because the backend uses Node.js 22+ with native `node:sqlite` in WAL mode, the application has **zero external npm dependencies** and runs out-of-the-box. It only requires a Node.js runtime and a **persistent volume** to persist the SQLite database across restarts and deployments.

| Platform | Recommended Plan | Persistent Storage | Cost Estimate | Best For |
| :--- | :--- | :--- | :--- | :--- |
| **Render** *(Recommended)* | Web Service (Starter) | Persistent Disk (`/var/data` or `./data`) | ~$7/month | Easiest setup, automatic SSL, zero maintenance |
| **Railway** | Node.js Service | Railway Volume mount to `/app/data` | ~$5/month (usage-based) | Quick GitHub integration, fast builds |
| **Fly.io** | Single Fly Machine | Fly Volume (`flyctl volumes create`) | Free tier / ~$3/mo | Global edge routing, ultra-fast response |
| **Hetzner / DigitalOcean VPS** | Ubuntu 24.04 VPS + Caddy | Native SSD | ~$4–$6/month | Complete control, highest performance |

---

## 3. Step-by-Step Deployment on Render (Recommended)

Render is the simplest way to deploy a Node.js + SQLite project with zero DevOps overhead.

### Step 1: Push Repository to GitHub
Ensure all code, styles, assets, and backend scripts are committed to your GitHub repository:
```bash
git add .
git commit -m "Configure Prakriti Bio with CMS, likes, and inventory backend"
git push origin main
```

### Step 2: Create a Web Service on Render
1. Log in to [Render.com](https://render.com) and click **New +** -> **Web Service**.
2. Connect your GitHub repository (`project-B`).
3. Fill in the service configuration:
   - **Name:** `prakriti-bio`
   - **Region:** Singapore (`ap-southeast-1`) or Frankfurt (choose closest to your audience).
   - **Branch:** `main`
   - **Runtime:** `Node`
   - **Node Version:** `22` or `24`
   - **Build Command:** *(Leave empty or `npm install`)*
   - **Start Command:** `node server.js`

### Step 3: Attach Persistent Disk (Critical for SQLite)
1. In the Render Dashboard for your service, go to **Disks** in the left navigation.
2. Click **Add Disk**:
   - **Name:** `prakriti-data`
   - **Mount Path:** `/opt/render/project/src/data`
   - **Size:** `1 GB` (sufficient for millions of likes, inventory logs, and CMS edits).
3. Click **Save**.

### Step 4: Configure Environment Variables
In the **Environment** tab on Render, add:
- `PORT`: `10000` (or leave default; `server.js` listens on `process.env.PORT || 3000`)
- `NODE_ENV`: `production`

### Step 5: Verify Deployment
Once the deployment finishes, Render provides an HTTPS URL (e.g., `https://prakriti-bio.onrender.com`):
- Storefront: `https://prakriti-bio.onrender.com/`
- Admin Portal: `https://prakriti-bio.onrender.com/admin`
- Default Admin: `admin@prakritibio.in` / `Admin@Prakriti2026!`

---

## 4. Step-by-Step Deployment on Railway

1. Sign up on [Railway.app](https://railway.app).
2. Click **New Project** -> **Deploy from GitHub repo**.
3. Select `project-B`.
4. Go to **Settings** -> **Deploy**:
   - **Start Command:** `node server.js`
5. Go to **Volumes** -> Click **Add Volume**:
   - **Mount Path:** `/app/data`
6. Click **Generate Domain** in the Networking section to get your custom HTTPS URL.

---

## 5. Self-Hosted VPS Deployment (Ubuntu 24.04 + systemd + Caddy)

For an enterprise or low-cost self-hosted setup ($4/month):

1. **Install Node.js 24:**
   ```bash
   curl -fsSL https://deb.nodesource.com/setup_24.x | sudo -E bash -
   sudo apt-get install -y nodejs git caddy
   ```

2. **Clone & Setup Directory:**
   ```bash
   cd /var/www
   git clone <YOUR_GIT_REPO_URL> prakriti-bio
   cd prakriti-bio
   ```

3. **Configure systemd service (`/etc/systemd/system/prakriti.service`):**
   ```ini
   [Unit]
   Description=Prakriti Bio Server
   After=network.target

   [Service]
   Type=simple
   User=www-data
   WorkingDirectory=/var/www/prakriti-bio
   ExecStart=/usr/bin/node server.js
   Restart=on-failure
   Environment=NODE_ENV=production PORT=3000

   [Install]
   WantedBy=multi-user.target
   ```
   Enable and start:
   ```bash
   sudo chown -R www-data:www-data /var/www/prakriti-bio
   sudo systemctl daemon-reload
   sudo systemctl enable --now prakriti
   ```

4. **Configure Caddy reverse proxy (`/etc/caddy/Caddyfile`):**
   ```caddy
   yourdomain.com {
       reverse_proxy 127.0.0.1:3000
   }
   ```
   Restart Caddy:
   ```bash
   sudo systemctl restart caddy
   ```
   Caddy automatically provisions and renews Let's Encrypt SSL certificates.

---

## 6. Architecture & Security Checklist

- [x] **Zero Dependencies:** Pure Node.js standard libraries (`http`, `node:sqlite`, `crypto`, `fs`, `path`).
- [x] **Database:** SQLite in WAL (Write-Ahead Logging) mode with foreign keys enabled.
- [x] **Authentication:** PBKDF2 with unique cryptographic salt per user (100,000 iterations), constant-time verification against timing attacks.
- [x] **Rate Limiting:** IP-based sliding window rate limiter protects public like endpoints and admin login attempts.
- [x] **Audit Trail:** Every content publish, stock adjustment, threshold change, and team credential modification is logged with IP address and timestamp.
