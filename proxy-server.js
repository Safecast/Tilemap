const express = require('express');
const { createProxyMiddleware } = require('http-proxy-middleware');
const cors = require('cors');
const path = require('path');
const util = require('util');

const app = express();

// Enable CORS for all routes
app.use(cors());

// Serve static files from the current directory
app.use(express.static(path.join(__dirname)));

// Create a proxy for Safecast API requests
app.use('/api', createProxyMiddleware({
  target: 'https://api.safecast.org',
  changeOrigin: true,
  pathRewrite: {
    '^/api': ''
  },
  onProxyRes: function(proxyRes, req, res) {
    // Add CORS headers to the proxied response
    proxyRes.headers['Access-Control-Allow-Origin'] = '*';
    proxyRes.headers['Access-Control-Allow-Methods'] = 'GET, POST, PUT, DELETE, OPTIONS';
    proxyRes.headers['Access-Control-Allow-Headers'] = 'Origin, X-Requested-With, Content-Type, Accept';
  }
}));

// Create a proxy for tt.safecast.org requests
app.use('/tt-api', createProxyMiddleware({
  target: 'https://tt.safecast.org',
  changeOrigin: true,
  pathRewrite: {
    '^/tt-api': ''
  },
  onProxyReq: (proxyReq, req, res) => {
    console.log('Realtime Sensor Request:', req.method, req.path);
  },
  onProxyRes: (proxyRes, req, res) => {
    console.log('Realtime Sensor Response:', proxyRes.statusCode, req.path);
    
    // Log response body for debugging
    if (req.path === '/devices') {
      let responseBody = '';
      proxyRes.on('data', (chunk) => {
        responseBody += chunk;
      });
      proxyRes.on('end', () => {
        console.log('Devices Response Body Length:', responseBody.length);
        console.log('Devices Response Body (truncated):', responseBody.substring(0, 100) + '...');
        
        // Log a sample RadNote device if found
        try {
          const data = JSON.parse(responseBody);
          const radnoteDevice = data.find(d => d.product && d.product.includes('radnote'));
          if (radnoteDevice) {
            console.log('Sample RadNote Device:', JSON.stringify(radnoteDevice, null, 2));
          }
        } catch (e) {
          console.error('Error parsing response:', e);
        }
      });
    }
  }
}));

// Fallback - serve index.html for any other request
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, 'index.html'));
});

const PORT = process.env.PORT || 8010;
app.listen(PORT, () => {
  console.log(`Server running on http://localhost:${PORT}`);
});
