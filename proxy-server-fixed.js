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
    
    // Only process /devices endpoint
    if (req.path === '/devices') {
      const originalBody = [];
      
      proxyRes.on('data', (chunk) => {
        originalBody.push(chunk);
      });
      
      proxyRes.on('end', () => {
        const bodyString = Buffer.concat(originalBody).toString('utf8');
        
        try {
          // Parse the original response
          const data = JSON.parse(bodyString);
          
          // Log headers and first device for debugging
          console.log('DEBUG - Original API response headers:', util.inspect(proxyRes.headers, { depth: null }));
          console.log('DEBUG - Original API response body:', bodyString.substring(0, 500) + '...');
          
          if (Array.isArray(data) && data.length > 0) {
            console.log('DEBUG - First device full structure:', JSON.stringify(data[0], null, 2));
            
            // Pass through the original response without transformation
            res.end(bodyString);
          } else {
            // Pass through the original response for non-array data
            res.end(bodyString);
          }
        } catch (error) {
          console.error('Error processing response:', error);
          // Pass through the original response in case of error
          res.end(bodyString);
        }
      });
    }
  }
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
