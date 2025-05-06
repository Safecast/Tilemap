const express = require('express');
const { createProxyMiddleware } = require('http-proxy-middleware');
const cors = require('cors');
const path = require('path');

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
    let responseBody = '';
    const originalWrite = res.write;
    const originalEnd = res.end;

    // Capture the response body
    res.write = function(chunk) {
      responseBody += chunk.toString('utf8');
      return originalWrite.apply(res, arguments);
    };

    res.end = function(chunk) {
      if (chunk) {
        responseBody += chunk.toString('utf8');
      }

      // Only for devices endpoint
      if (req.path === '/devices') {
        try {
          const data = JSON.parse(responseBody);
          console.log('Realtime Sensor Response:', proxyRes.statusCode, req.path);
          
          // Log timestamp information for a few devices
          if (Array.isArray(data)) {
            console.log(`Found ${data.length} devices in response`);
            
            // Log the first 3 devices for debugging
            for (let i = 0; i < Math.min(3, data.length); i++) {
              const device = data[i];
              console.log(`Device ${i+1} timestamp info:`, {
                id: device.id || device.device_urn || 'unknown',
                device_class: device.device_class || 'unknown',
                when_captured: device.when_captured || 'not set',
                updated: device.updated || 'not set',
                unix_ms: device.unix_ms || 'not set',
                created_at: device.created_at || 'not set'
              });
            }
          }
        } catch (e) {
          console.log('Error parsing response:', e.message);
        }
      }

      originalEnd.apply(res, arguments);
    };

    proxyRes.on('end', () => {
      // Processing done
    });
  },
}));

// Fallback - serve index.html for any other request
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, 'index.html'));
});

// Start the server
const PORT = 8010;
app.listen(PORT, () => {
  console.log(`Server running on http://localhost:${PORT}`);
});
