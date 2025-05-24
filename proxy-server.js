const express = require('express');
const { createProxyMiddleware } = require('http-proxy-middleware');
const cors = require('cors');
const path = require('path');
const util = require('util');
const fs = require('fs');

// Global Error Handlers for Debugging
process.on('uncaughtException', (err) => {
  console.error('PROXY SERVER UNCAUGHT EXCEPTION:', err);
  // Consider if you want to exit or if logging is enough for debugging
  // process.exit(1); 
});

process.on('unhandledRejection', (reason, promise) => {
  console.error('PROXY SERVER UNHANDLED PROMISE REJECTION:', reason);
  // process.exit(1); 
});

// Listen to exit events for more clues
process.on('beforeExit', (code) => {
  console.log(`PROXY SERVER 'beforeExit' event with code: ${code}`);
});

process.on('exit', (code) => {
  console.log(`PROXY SERVER 'exit' event with code: ${code}`);
  // IMPORTANT: Only synchronous operations can be done here.
  // fs.writeFileSync('proxy_exit_log.txt', `Exited with code ${code} at ${new Date().toISOString()}\n`);
});

const app = express();

// Enable CORS for all routes with more permissive settings
app.use(cors({
  origin: '*',
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Origin', 'X-Requested-With', 'Content-Type', 'Accept', 'Authorization']
}));

// Add cache control middleware to prevent caching
app.use((req, res, next) => {
  res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate');
  res.setHeader('Pragma', 'no-cache');
  res.setHeader('Expires', '0');
  res.setHeader('Surrogate-Control', 'no-store');
  next();
});

// Serve static files from the current directory
app.use(express.static(path.join(__dirname)));

// Add a logger for the /tiles path
app.use('/tiles', (req, res, next) => {
  console.log(`[Tiles Route Logger] Attempting to serve: ${req.originalUrl}`);
  next(); // Pass control to the next middleware (express.static)
});

// Serve local tiles from TilesOutput
console.log('Serving tiles from:', path.join(__dirname, 'TilesOutput'));
app.use('/tiles', express.static(path.join(__dirname, 'TilesOutput'), {
  setHeaders: (res) => {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate');
  }
}));

// New route for last update date - MUST BE BEFORE THE GENERAL /api proxy
app.get('/api/last_update', (req, res) => {
  const dateFilePath = path.join(__dirname, 'last_update.txt');
  fs.readFile(dateFilePath, 'utf8', (err, data) => {
    try {
      let lastUpdateDate = 'N/A'; 
      if (err) {
        console.error(`[API Local] Error reading ${dateFilePath}:`, err);
        if (!res.headersSent) {
          res.json({ last_update: 'N/A (Error Reading File)' }); 
        }
        return; 
      }
      if (data && data.trim().length > 0) {
        lastUpdateDate = data.trim(); 
        console.log(`[API Local] Read date from ${dateFilePath}: ${lastUpdateDate}`);
      } else {
        console.warn(`[API Local] ${dateFilePath} was empty or contained only whitespace.`);
      }
      console.log(`[API Local] Request to /api/last_update, sending date: ${lastUpdateDate}`);
      if (!res.headersSent) {
        res.json({ last_update: lastUpdateDate });
      }
    } catch (e) {
      console.error(`[API Local] Exception in /api/last_update callback for ${dateFilePath}:`, e);
      if (!res.headersSent) {
        try {
          res.status(500).json({ error: "Internal server error processing update date" });
        } catch (resError) {
          console.error("[API Local] Error sending 500 response:", resError);
        }
      }
    }
  });
});

// API proxy middleware options
const apiProxyOptions = {
  target: 'https://api.safecast.org',
  changeOrigin: true,
  pathRewrite: {
    '^/api': '' // remove /api prefix
  },
  logLevel: 'debug',
  onProxyRes: function (proxyRes, req, res) {
    console.log(`[API Proxy onProxyRes] Original ACAO header for ${req.url}:`, proxyRes.headers['access-control-allow-origin']);
    proxyRes.headers['Access-Control-Allow-Origin'] = '*'; // Override with wildcard
    proxyRes.headers['Access-Control-Allow-Methods'] = 'GET, POST, PUT, DELETE, OPTIONS';
    console.log(`[API Proxy onProxyRes] Modified ACAO header for ${req.url}:`, proxyRes.headers['access-control-allow-origin']);
    // You might want to add other headers like Access-Control-Allow-Headers if needed
  },
  onError: function(err, req, res, target) {
    console.error(`[API Proxy Error] Proxy error for ${req.method} ${req.url} to ${target}:`, err);
    if (res && !res.headersSent) {
      res.writeHead(500, {
        'Content-Type': 'text/plain'
      });
      res.end('Proxy error occurred while connecting to API.');
    }
  }
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
    // Temporarily comment out all logic here to see if it stabilizes the server
    // If the original response from tt.safecast.org is valid GeoJSON,
    // no cleaning should be necessary for the client.
    console.log(`[ttApiProxy onProxyRes] Passing through response for ${req.url} (status: ${proxyRes.statusCode}) without modification.`);
    // Ensure original headers that allow CORS are still respected or re-added if necessary
    // For example, if the origin tt.safecast.org sends appropriate CORS headers, they might pass through.
    // If not, you might need to add:
    proxyRes.headers['Access-Control-Allow-Origin'] = '*';
    proxyRes.headers['Access-Control-Allow-Methods'] = 'GET, POST, PUT, DELETE, OPTIONS'; // Adding this back just in case

    /*
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
    */
  },
  onError: function(err, req, res, target) {
    console.error(`[ttApiProxy Error] Proxy error for ${req.method} ${req.url} to ${target}:`, err);
    if (res && !res.headersSent) {
      res.writeHead(500, {
        'Content-Type': 'text/plain'
      });
      res.end('Proxy error occurred while connecting to Realtime API.');
    }
  }
});

// Create a proxy for the S3 tile server
const s3TileProxy = createProxyMiddleware({
  target: 'https://s3-us-west-2.amazonaws.com/safecast-tiles',
  changeOrigin: true,
  pathRewrite: {
    '^/s3-tiles': '' // remove /s3-tiles prefix
  },
  logLevel: 'debug',
  secure: false, // Skip certificate validation
  onProxyReq: (proxyReq, req, res) => {
    // Log the request URL
    console.log('S3 Tile Request:', req.method, req.url);
  },
  onError: function(err, req, res, target) {
    console.error(`[S3 Tile Proxy Error] Proxy error for ${req.method} ${req.url} to ${target}:`, err);
    if (res && !res.headersSent) {
      res.writeHead(500, {
        'Content-Type': 'text/plain'
      });
      res.end('Proxy error occurred while connecting to S3 Tiles.');
    }
  }
});

// Mount the proxies
app.use('/api', apiProxy);
app.use('/tt-api', ttApiProxy);
app.use('/s3-tiles', s3TileProxy);

// New API proxy middleware options for realtime.safecast.org
const rtApiProxyOptions = {
  target: 'https://realtime.safecast.org/', // Target the realtime server
  changeOrigin: true,
  secure: true,
  pathRewrite: { '^/rt-api': '' }, // remove /rt-api prefix
  logLevel: 'debug',
  onProxyRes: function (proxyRes, req, res) {
    // console.log(`[API Proxy - realtime.safecast.org] Original headers for ${req.url}:`, JSON.stringify(proxyRes.headers));
    proxyRes.headers['Access-Control-Allow-Origin'] = '*';
    proxyRes.headers['Access-Control-Allow-Methods'] = 'GET, POST, PUT, DELETE, OPTIONS';
    proxyRes.headers['Access-Control-Allow-Headers'] = 'Origin, X-Requested-With, Content-Type, Accept';
    // console.log(`[API Proxy - realtime.safecast.org] Modified headers for ${req.url}:`, JSON.stringify(proxyRes.headers));
  },
  onError: function(err, req, res, target) {
    console.error(`[rtApiProxy Error] Proxy error for ${req.method} ${req.url} to ${target}:`, err);
    if (res && !res.headersSent) {
      res.writeHead(500, {
        'Content-Type': 'text/plain'
      });
      res.end('Proxy error occurred while connecting to rt-api.');
    }
  }
};
const rtApiProxy = createProxyMiddleware(rtApiProxyOptions);
app.use('/rt-api', rtApiProxy); // Use /rt-api for these requests

// Fallback - serve index.html for any other request
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, 'index.html'));
});

const PORT = process.env.PORT || 8010;
app.listen(PORT, () => {
  console.log(`Server running on http://localhost:${PORT}`);
});
