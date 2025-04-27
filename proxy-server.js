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
      let responseBody = [];
      proxyRes.on('data', function (chunk) {
        responseBody.push(chunk);
      });
      proxyRes.on('end', function () {
        try {
          responseBody = Buffer.concat(responseBody).toString();
          console.log('DEBUG - Original API response headers:', proxyRes.headers);
          console.log('DEBUG - Original API response body:', responseBody.substring(0, 500) + (responseBody.length > 500 ? '...' : ''));
          
          const data = JSON.parse(responseBody);
          if (Array.isArray(data) && data.length > 0) {
            console.log('DEBUG - First device full structure:', JSON.stringify(data[0], null, 2));
            
            // Check for required popup fields
            const sampleDevice = data[0];
            console.log('DEBUG - Popup relevant fields:', {
              device_urn: sampleDevice.device_urn,
              device_class: sampleDevice.device_class,
              location: sampleDevice.location,
              value: sampleDevice.value,
              dres: sampleDevice.dres
            });
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
