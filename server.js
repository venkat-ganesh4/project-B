const http = require('http');
const fs = require('fs');
const path = require('path');
const url = require('url');
const { handleApiRequest } = require('./backend/routes');

const PORT = process.env.PORT || 3000;

const MIME_TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'application/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.png': 'image/png',
  '.webp': 'image/webp',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon',
  '.txt': 'text/plain; charset=utf-8',
  '.xml': 'application/xml; charset=utf-8',
  '.woff2': 'font/woff2',
  '.csv': 'text/csv; charset=utf-8'
};

const server = http.createServer(async (req, res) => {
  // CORS & Security Headers
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-Frame-Options', 'SAMEORIGIN');
  res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');

  const parsedUrl = url.parse(req.url, true);
  const pathname = decodeURI(parsedUrl.pathname);

  // 1. API Route Handling
  if (pathname.startsWith('/api/')) {
    try {
      return await handleApiRequest(req, res, pathname, parsedUrl.query);
    } catch (err) {
      console.error('API Error:', err);
      res.writeHead(500, { 'Content-Type': 'application/json' });
      return res.end(JSON.stringify({ error: 'Internal Server Error', message: err.message }));
    }
  }

  // 2. Admin Route Shorthand
  if (pathname === '/admin' || pathname === '/admin/') {
    const adminPath = path.join(__dirname, 'admin.html');
    if (fs.existsSync(adminPath)) {
      res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
      return res.end(fs.readFileSync(adminPath));
    }
    res.writeHead(302, { 'Location': '/#admin' });
    return res.end();
  }

  // 3. Static File Serving
  let reqPath = pathname;
  if (reqPath === '/' || reqPath === '') reqPath = '/index.html';

  // Prevent directory traversal attacks
  const safePath = path.normalize(reqPath).replace(/^(\.\.[\/\\])+/, '');
  const filePath = path.join(__dirname, safePath);

  fs.stat(filePath, (err, stats) => {
    if (err || !stats.isFile()) {
      // If file not found, return 404
      res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
      return res.end('404 Not Found');
    }

    const ext = path.extname(filePath).toLowerCase();
    const contentType = MIME_TYPES[ext] || 'application/octet-stream';

    // Stream the file with proper content type
    res.writeHead(200, { 'Content-Type': contentType });
    fs.createReadStream(filePath).pipe(res);
  });
});

server.listen(PORT, () => {
  console.log(`=================================================`);
  console.log(` Prakriti Bio Server running at: http://localhost:${PORT}`);
  console.log(` Public Storefront: http://localhost:${PORT}/`);
  console.log(` Admin Portal:      http://localhost:${PORT}/admin`);
  console.log(` API Health Check:  http://localhost:${PORT}/api/products`);
  console.log(`=================================================`);
});
