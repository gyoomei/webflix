const http = require('http');
const https = require('https');
const fs = require('fs');
const path = require('path');

const PORT = 8080;
const UPSTREAM = 'http://43.156.122.76:8080';

const server = http.createServer((req, res) => {
  // CORS headers
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') { res.writeHead(204); res.end(); return; }

  // Serve index.html for root
  if (req.url === '/' || req.url === '/index.html') {
    res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
    fs.createReadStream(path.join(__dirname, 'index.html')).pipe(res);
    return;
  }

  // Proxy /api/* to upstream
  if (req.url.startsWith('/api/') || req.url.startsWith('/static/')) {
    const upstreamUrl = UPSTREAM + req.url;
    const mod = new URL(upstreamUrl).protocol === 'https:' ? https : http;
    const proxyReq = mod.get(upstreamUrl, { timeout: 30000 }, (proxyRes) => {
      res.writeHead(proxyRes.statusCode, {
        ...proxyRes.headers,
        'Access-Control-Allow-Origin': '*',
      });
      proxyRes.pipe(res);
    });
    proxyReq.on('error', (e) => { res.writeHead(502); res.end(JSON.stringify({ error: e.message })); });
    proxyReq.on('timeout', () => { proxyReq.destroy(); res.writeHead(504); res.end('Timeout'); });
    return;
  }

  // Proxy movie/series detail pages (SSR)
  if (/^\/(movie|series)\//.test(req.url)) {
    const upstreamUrl = UPSTREAM + req.url;
    const mod = new URL(upstreamUrl).protocol === 'https:' ? https : http;
    const proxyReq = mod.get(upstreamUrl, { timeout: 30000 }, (proxyRes) => {
      let body = '';
      proxyRes.on('data', c => body += c);
      proxyRes.on('end', () => {
        // Rewrite upstream references to local proxy
        body = body.replace(/http:\/\/43\.156\.122\.76:8080/g, '');
        res.writeHead(proxyRes.statusCode, {
          'Content-Type': proxyRes.headers['content-type'] || 'text/html',
          'Access-Control-Allow-Origin': '*',
        });
        res.end(body);
      });
    });
    proxyReq.on('error', (e) => { res.writeHead(502); res.end(JSON.stringify({ error: e.message })); });
    return;
  }

  // Fallback: serve static from upstream
  const upstreamUrl = UPSTREAM + req.url;
  const mod = new URL(upstreamUrl).protocol === 'https:' ? https : http;
  const proxyReq = mod.get(upstreamUrl, { timeout: 15000 }, (proxyRes) => {
    res.writeHead(proxyRes.statusCode, {
      ...proxyRes.headers,
      'Access-Control-Allow-Origin': '*',
    });
    proxyRes.pipe(res);
  });
  proxyReq.on('error', () => { res.writeHead(404); res.end('Not Found'); });
});

server.listen(PORT, '0.0.0.0', () => {
  console.log(`WEBFLIX proxy running on http://0.0.0.0:${PORT}`);
  console.log(`Upstream: ${UPSTREAM}`);
});
