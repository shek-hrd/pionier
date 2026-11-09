const express = require('express');
const fetch = require('node-fetch');
const path = require('path');
const fs = require('fs');

const app = express();
const PORT = process.env.PORT || 8080;
const UPSTREAM = 'https://api.pionex.com';

// Read the HTML file
const HTML = fs.readFileSync(path.join(__dirname, 'index.html'), 'utf8');

// CORS headers for API responses
const corsHeaders = {
  'access-control-allow-origin': '*',
  'access-control-allow-headers': 'PIONEX-KEY,PIONEX-SIGNATURE,Content-Type',
  'access-control-allow-methods': 'GET,POST,DELETE,OPTIONS',
};

// Proxy /api/* requests to Pionex
app.all('/api/*', async (req, res) => {
  const h = new Headers();
  for (const k of ['pionex-key', 'pionex-signature', 'content-type']) {
    const v = req.headers[k];
    if (v) h.set(k, v);
  }
  
  const init = { method: req.method, headers: h };
  if (req.method !== 'GET' && req.method !== 'HEAD') {
    init.body = JSON.stringify(req.body);
  }
  
  try {
    const upstreamUrl = UPSTREAM + req.originalUrl;
    const r = await fetch(upstreamUrl, init);
    const tx = await r.text();
    
    let out = tx;
    try { JSON.parse(tx); } catch (e) {
      out = JSON.stringify({ 
        result: false, 
        code: 'HTTP_' + r.status, 
        message: tx.slice(0, 200),
        upstream: { 
          server: r.headers.get('server'), 
          retryAfter: r.headers.get('retry-after'), 
          cfRay: r.headers.get('cf-ray') 
        } 
      });
    }
    
    res.set({
      ...corsHeaders,
      'content-type': 'application/json',
      'cache-control': 'no-store'
    });
    res.status(r.status).send(out);
  } catch (e) {
    res.set({ ...corsHeaders, 'content-type': 'application/json', 'cache-control': 'no-store' });
    res.status(502).json({ result: false, code: 'RELAY_UPSTREAM_FAIL', message: String(e) });
  }
});

// Handle OPTIONS for CORS preflight
app.options('/api/*', (req, res) => {
  res.set(corsHeaders).status(204).send();
});

// Diagnostics endpoint
app.get('/diag', async (req, res) => {
  if (req.query.ping) {
    return res.json({ ok: true, status: 200, ping: true });
  }
  
  const t = Date.now();
  let ip = '?';
  try { 
    const trace = await fetch('https://www.cloudflare.com/cdn-cgi/trace');
    const text = await trace.text();
    ip = (text.match(/ip=(.*)/) || [])[1] || '?'; 
  } catch (e) {}
  
  try {
    const r = await fetch(UPSTREAM + '/api/v1/market/bookTickers?symbol=BTC_USDT_PERP');
    const tx = await r.text();
    res.json({ 
      ok: r.ok, 
      status: r.status, 
      ms: Date.now() - t, 
      ip, 
      server: r.headers.get('server'), 
      head: tx.slice(0, 100) 
    });
  } catch (e) {
    res.json({ ok: false, status: 0, ip, error: String(e) });
  }
});

// Serve the main HTML app
app.get('/', (req, res) => {
  res.set({ 'content-type': 'text/html;charset=utf-8', 'cache-control': 'no-store' });
  res.send(HTML);
});

// Health check endpoint
app.get('/health', (req, res) => {
  res.json({ status: 'ok' });
});

app.listen(PORT, '0.0.0.0', () => {
  console.log(`Pionex Grid running on port ${PORT}`);
});