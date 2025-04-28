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
            
            // Count devices with LND fields
            const lndFields = ['lnd_7318u', 'lnd_7128ec', 'lnd_712u', 'lnd_78017'];
            let devicesWithLnd = 0;
            let lndFieldCounts = {};
            
            // Initialize counts
            lndFields.forEach(field => {
              lndFieldCounts[field] = 0;
            });
            
            // Count devices with each LND field
            data.forEach(device => {
              let hasLndField = false;
              
              lndFields.forEach(field => {
                if (device[field] !== undefined) {
                  lndFieldCounts[field]++;
                  hasLndField = true;
                }
              });
              
              if (hasLndField) {
                devicesWithLnd++;
              }
            });
            
            console.log(`Found ${devicesWithLnd} devices with LND fields out of ${data.length} total devices`);
            console.log('LND field counts:', lndFieldCounts);
            
            // Find a few example devices with LND fields
            const exampleDevices = data.filter(device => {
              return lndFields.some(field => device[field] !== undefined);
            }).slice(0, 3);
            
            if (exampleDevices.length > 0) {
              console.log('Example devices with LND fields:');
              exampleDevices.forEach((device, index) => {
                const lndValues = {};
                lndFields.forEach(field => {
                  if (device[field] !== undefined) {
                    lndValues[field] = device[field];
                  }
                });
                
                console.log(`Example ${index + 1}:`, {
                  id: device.id || device.device_urn || 'unknown',
                  device_class: device.device_class || 'unknown',
                  device_urn: device.device_urn || 'not set',
                  lnd_values: lndValues
                });
              });
            }
            
            // Log specific devices we're interested in
            console.log('Looking for specific devices in the API response...');
            
            // Find safecast devices
            const safecastDevices = data.filter(device => 
              device.device_class === 'safecast' || 
              (device.device_urn && device.device_urn.startsWith('safecast:')));
            
            if (safecastDevices.length > 0) {
              console.log(`Found ${safecastDevices.length} safecast devices. First one:`, safecastDevices[0]);
            }
            
            // Find pointcast/geigiecast devices
            const pointcastDevices = data.filter(device => 
              device.device_class === 'pointcast' || 
              device.device_class === 'geigiecast' ||
              (device.device_urn && (device.device_urn.startsWith('pointcast:') || device.device_urn.startsWith('geigiecast:'))));
            
            if (pointcastDevices.length > 0) {
              console.log(`Found ${pointcastDevices.length} pointcast/geigiecast devices. First one:`, pointcastDevices[0]);
            }
            
            // Find radnote devices
            const radnoteDevices = data.filter(device => 
              device.device_class && device.device_class.includes('radnote') ||
              (device.device_urn && device.device_urn.includes('radnote')));
            
            if (radnoteDevices.length > 0) {
              console.log(`Found ${radnoteDevices.length} radnote devices. First one:`, radnoteDevices[0]);
            }
            
            // Log the first 3 devices for debugging
            for (let i = 0; i < Math.min(3, data.length); i++) {
              const device = data[i];
              console.log(`Device ${i+1} basic info:`, {
                id: device.id || device.device_urn || 'unknown',
                device_class: device.device_class || 'unknown',
                device_urn: device.device_urn || 'not set',
                lnd_7318u: device.lnd_7318u || 'not set',
                value: device.value || 'not set'
              });
              console.log(`Device ${i+1} full data:`, device);
              console.log(`Device ${i+1} radiation fields:`, {
                id: device.id || device.device_urn || 'unknown',
                device_class: device.device_class || 'unknown',
                value: device.value || 'not set',
                lnd_7318u: device.lnd_7318u || 'not set',
                body: device.body ? JSON.stringify(device.body).substring(0, 100) + '...' : 'not set'
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
