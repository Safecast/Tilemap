# Safecast Tilemap - Local Development Setup

This guide explains how to set up and run the Safecast Tilemap project locally for development purposes.

## Prerequisites

Before you begin, make sure you have the following installed:

- [Node.js](https://nodejs.org/) (v14 or later recommended)
- [npm](https://www.npmjs.com/) (comes with Node.js)
- [Python 3](https://www.python.org/downloads/)

## Installation

1. Clone the repository or download the source code
2. Navigate to the project directory
3. Install the required npm packages:

```bash
npm install
```

This will install the necessary dependencies, including Express and http-proxy-middleware.

## Running the Application Locally

The Safecast Tilemap application requires two servers to run locally:

1. A static file server to serve the HTML, CSS, and JavaScript files
2. A proxy server to handle API requests to Safecast endpoints

### Step 1: Start the Static File Server

Open a terminal window in the project directory and run:

```bash
python3 -m http.server 8000
```

This starts a simple HTTP server on port 8000 that serves the static files from the current directory.

### Step 2: Start the Proxy Server

Open another terminal window in the project directory and run:

```bash
node proxy-server.js
```

This starts the proxy server on port 8010 that handles API requests to:
- Safecast API (api.safecast.org)
- Realtime sensor data (tt.safecast.org)
- Tile server (S3 bucket)

### Step 3: Access the Application

Open your web browser and navigate to:

```
http://localhost:8000
```

The Safecast Tilemap should now be running locally with full functionality.

## Proxy Server Details

The proxy server (proxy-server.js) handles the following routes:

- `/api/*` → Proxies to `https://api.safecast.org`
- `/tt-api/*` → Proxies to `https://tt.safecast.org`
- `/s3-tiles/*` → Proxies to `https://te512jp.safecast.org.s3-ap-northeast-1.amazonaws.com`

This allows the frontend to make API calls without running into CORS issues.

## Development Workflow

1. Make changes to the JavaScript files
2. Refresh your browser to see the changes
3. For changes to the proxy server, restart the Node.js server

## Troubleshooting

- If you see CORS errors in the browser console, make sure the proxy server is running
- If the map doesn't load, check the browser console for errors related to the tile server
- If real-time sensors don't appear, check the console for errors related to the tt.safecast.org API

## Additional Resources

- [Safecast API Documentation](https://api.safecast.org/en-US/swagger_doc)
- [Google Maps JavaScript API Documentation](https://developers.google.com/maps/documentation/javascript)
