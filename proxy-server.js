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

// API proxy middleware options
const apiProxyOptions = {
  target: 'https://api.safecast.org',
  changeOrigin: true,
  pathRewrite: {
    '^/api': '' // remove /api prefix
  },
  logLevel: 'debug'
};

// Create the proxy middleware for Safecast API
const apiProxy = createProxyMiddleware(apiProxyOptions);

// Create a proxy for the tt.safecast.org endpoint
const ttApiProxy = createProxyMiddleware({
  target: 'https://tt.safecast.org',
  changeOrigin: true,
  pathRewrite: {
    '^/tt-api': '' // remove /tt-api prefix
  },
  logLevel: 'debug',
  onProxyReq: (proxyReq, req, res) => {
    // Log the request URL
    console.log('Realtime Sensor Request:', req.method, req.url);
  },
  onProxyRes: (proxyRes, req, res) => {
    // Handle the response from the tt.safecast.org endpoint
    if (req.url.includes('/devices')) {
      const _end = res.end;
      let body = '';
      
      // Override the end method to intercept the response
      res.end = function (chunk) {
        if (chunk) {
          body += chunk;
        }
        
        // Log the original response body for debugging
        console.log('DEBUG - Original API response body:', body.substring(0, 500) + '...');
        
        // Clean the response body to ensure valid JSON
        try {
          // Find the start and end of the JSON array
          const startIndex = body.indexOf('[');
          const endIndex = body.lastIndexOf(']') + 1;
          
          if (startIndex !== -1 && endIndex !== -1 && endIndex > startIndex) {
            // Extract the JSON array
            let jsonText = body.substring(startIndex, endIndex);
            
            // Clean the JSON text
            jsonText = jsonText
              .replace(/[^\x20-\x7E]/g, '') // Remove non-printable ASCII
              .replace(/\\u0000/g, '') // Remove null bytes
              .replace(/[\r\n]+/g, '') // Remove newlines
              .replace(/,\s*}/g, '}') // Fix trailing commas in objects
              .replace(/,\s*\]/g, ']'); // Fix trailing commas in arrays
            
            // Try to parse the JSON to validate it
            const parsedJson = JSON.parse(jsonText);
            
            // If we get here, the JSON is valid, so replace the body with the cleaned JSON
            console.log('DEBUG - Successfully cleaned JSON. First device:', parsedJson[0]);
            console.log('DEBUG - Total devices:', parsedJson.length);
            
            // Call the original end method with the cleaned JSON
            _end.call(res, jsonText);
            return;
          }
        } catch (e) {
          console.error('DEBUG - Error cleaning JSON:', e);
          // Continue with the original body if cleaning fails
        }
        
        // Call the original end method with the original body
        _end.call(res, body);
      };
    }
  }
});

// Create a proxy for the S3 tile server
const s3TileProxy = createProxyMiddleware({
  target: 'https://te512jp.safecast.org.s3-ap-northeast-1.amazonaws.com',
  changeOrigin: true,
  pathRewrite: {
    '^/s3-tiles': '' // remove /s3-tiles prefix
  },
  logLevel: 'debug',
  secure: true,
  onProxyReq: (proxyReq, req, res) => {
    // Log the request URL
    console.log('S3 Tile Request:', req.method, req.url);
  }
});

// Mount the proxies
app.use('/api', apiProxy);
app.use('/tt-api', ttApiProxy);
app.use('/s3-tiles', s3TileProxy);

// Fallback - serve index.html for any other request
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, 'index.html'));
});

const PORT = process.env.PORT || 8010;
app.listen(PORT, () => {
  console.log(`Server running on http://localhost:${PORT}`);
});
