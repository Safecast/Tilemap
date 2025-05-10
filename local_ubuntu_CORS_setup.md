## CORS Setup for Safecast Tilemap (Local Ubuntu Development)

This document outlines the steps taken to resolve CORS (Cross-Origin Resource Sharing) issues when running the Safecast Tilemap project locally on an Ubuntu system, with the frontend served on `http://localhost:8010` and API requests needing to go to `https://api.safecast.org`.

**Initial Problem:**

The browser was blocking requests from `http://localhost:8010` to `https://api.safecast.org` due to CORS policy. The error message was typically:

> Access to XMLHttpRequest at 'https://api.safecast.org/bgeigie_imports/XXXXX.json' from origin 'http://localhost:8010' has been blocked by CORS policy: No 'Access-Control-Allow-Origin' header is present on the requested resource.

Or a variation indicating an invalid `Access-Control-Allow-Origin` header.

**Solution Steps:**

1.  **Proxy Server (`proxy-server.js`):**
    *   The existing `proxy-server.js` (using Express and `http-proxy-middleware`) was used to proxy requests from the local frontend to the Safecast API.
    *   A global CORS middleware was already present:
        ```javascript
        const cors = require('cors');
        // ...
        app.use(cors({
          origin: '*', // Initially permissive
          methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
          allowedHeaders: ['Content-Type', 'Authorization', 'X-Requested-With']
        }));
        ```
    *   An API proxy was set up for the `/api` path:
        ```javascript
        const { createProxyMiddleware } = require('http-proxy-middleware');
        // ...
        const apiProxyOptions = {
          target: 'https://api.safecast.org',
          changeOrigin: true,
          pathRewrite: {
            '^/api': '' // remove /api prefix
          },
          logLevel: 'debug',
          onProxyRes: function (proxyRes, req, res) {
            // This was key to fixing the API calls
            console.log(`[API Proxy onProxyRes] Original ACAO header for ${req.url}:`, proxyRes.headers['access-control-allow-origin']);
            proxyRes.headers['Access-Control-Allow-Origin'] = '*'; // Override with wildcard for local dev
            proxyRes.headers['Access-Control-Allow-Methods'] = 'GET, POST, PUT, DELETE, OPTIONS';
            console.log(`[API Proxy onProxyRes] Modified ACAO header for ${req.url}:`, proxyRes.headers['access-control-allow-origin']);
          }
        };
        const apiProxy = createProxyMiddleware(apiProxyOptions);
        app.use('/api', apiProxy);
        ```
    *   The `onProxyRes` function was added/modified to specifically set `Access-Control-Allow-Origin: *` on responses coming *from* `api.safecast.org` *through* the proxy. This tells the browser that the frontend (running on `localhost:8010`) is allowed to access the proxied data.
    *   Console logs were added to `onProxyRes` to confirm it was being triggered and what the headers were.

2.  **Identifying the Direct API Calls (`bgeigie_viewer.js`):**
    *   It was discovered that `bgeigie_viewer.js` was making direct calls to `https://api.safecast.org/...` instead of using the local `/api/...` proxy endpoint. This was bypassing the proxy server's CORS modifications.
    *   The logs in `proxy-server.js`'s `onProxyRes` function were *not* showing up for these requests, confirming they weren't going through the proxy.

3.  **Modifying `bgeigie_viewer.js`:**
    *   The `bgeigie_viewer.js` file (which was minified) was edited to replace all instances of the absolute URL `https://api.safecast.org/` with the relative path `/api/`.
    *   Example (conceptual, actual change was a string replacement in the minified code):
        *   **Before:** `var i="https://api.safecast.org/bgeigie_imports.json?..."`
        *   **After:** `var i="/api/bgeigie_imports.json?..."`
    *   This change ensures that requests initiated by `bgeigie_viewer.js` are directed to `http://localhost:8010/api/...`, thus hitting the local proxy server.

4.  **Serving Local Tiles (`proxy-server.js` and `safemap.js`):**
    *   For local tile development, `proxy-server.js` was configured to serve tiles from a local directory:
        ```javascript
        // Serve local tiles from TileGriddata
        app.use('/tiles', express.static(path.join(__dirname, 'TileGriddata')));
        ```
    *   `safemap.js` was intended to use a flag `USE_LOCAL_TILES = true;` and `LOCAL_TILE_URL = '/tiles';` (or similar) to point to this local endpoint. Since these tiles are served from the same origin as `index.html` (`http://localhost:8010`), browser CORS policies are not an issue for these specific tile requests.

**Verification Steps:**

1.  Restart the Node.js proxy server (`npm start`).
2.  Hard refresh the browser (Ctrl+Shift+R or Cmd+Shift+R).
3.  Open the browser's developer console.
4.  Load the map page (`http://localhost:8010`).
5.  Check browser console: The CORS errors related to `api.safecast.org` should be gone.
6.  Check Node.js terminal: The `[API Proxy onProxyRes]` log messages should now appear for requests like `/api/bgeigie_imports/...`, indicating they are being routed through the proxy.

**Production Considerations:**

*   **`bgeigie_viewer.js` paths:** The relative `/api/` paths are good for production as they will resolve relative to the production domain.
*   **`proxy-server.js` CORS settings:**
    *   In `onProxyRes` for the `/api` proxy, change `proxyRes.headers['Access-Control-Allow-Origin'] = '*';` to `proxyRes.headers['Access-Control-Allow-Origin'] = 'https://yourdomain.com';` (replace `yourdomain.com` with your actual domain).
    *   In the global `app.use(cors({ origin: '*' ... }));`, change `origin: '*'` to `origin: 'https://yourdomain.com'`.
*   **Tile Serving:**
    *   If tiles are served by the Node.js app, the setup is similar (same-origin).
    *   If tiles are served from a CDN (e.g., S3), the CDN must be configured with CORS headers to allow requests from `https://yourdomain.com`. `LOCAL_TILE_URL` in `safemap.js` would point to the CDN.

This setup ensures that all API requests to `api.safecast.org` are routed through the local proxy, which correctly handles the CORS headers for local development.