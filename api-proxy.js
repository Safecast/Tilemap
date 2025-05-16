/**
 * api-proxy.js - Simple Express-based proxy for Safecast API
 * 
 * This proxy forwards requests to api.safecast.org and handles CORS issues.
 * It's designed to be used with the Safecast Map for bGeigie log testing.
 * 
 * To use:
 * 1. Install required packages: npm install express cors axios
 * 2. Run: node api-proxy.js
 * 3. Access the proxy via http://localhost:8010/api/path/to/resource
 */

const express = require('express');
const cors = require('cors');
const axios = require('axios');
const app = express();
const port = 8010;

// Enable CORS for all routes
app.use(cors());

// Proxy routes to api.safecast.org
app.use('/api', async (req, res) => {
    try {
        const apiUrl = `https://api.safecast.org${req.url}`;
        console.log(`Proxying request to: ${apiUrl}`);
        
        const response = await axios({
            method: req.method,
            url: apiUrl,
            data: req.body,
            headers: {
                'Content-Type': 'application/json',
                'Accept': 'application/json'
            },
            responseType: 'stream'
        });
        
        // Set headers from the API response
        Object.keys(response.headers).forEach(header => {
            res.setHeader(header, response.headers[header]);
        });
        
        // Stream the response to the client
        response.data.pipe(res);
    } catch (error) {
        console.error('Proxy error:', error.message);
        
        if (error.response) {
            res.status(error.response.status).send(error.response.data);
        } else {
            res.status(500).send({ error: 'An error occurred while processing your request' });
        }
    }
});

// Proxy routes specifically for tile servers
app.use('/tiles', async (req, res) => {
    try {
        const tileUrl = `https://map.safecast.org/tiles${req.url}`;
        console.log(`Proxying tile request to: ${tileUrl}`);
        
        const response = await axios({
            method: req.method,
            url: tileUrl,
            responseType: 'stream'
        });
        
        // Set headers from the tile server response
        Object.keys(response.headers).forEach(header => {
            res.setHeader(header, response.headers[header]);
        });
        
        // Stream the response to the client
        response.data.pipe(res);
    } catch (error) {
        console.error('Tile proxy error:', error.message);
        res.status(500).send('Error fetching tile');
    }
});

// Simple endpoint to check if the server is running
app.get('/', (req, res) => {
    res.send('Safecast API Proxy Server is running. Use /api/* to access api.safecast.org');
});

// Start the server
app.listen(port, () => {
    console.log(`Safecast API Proxy Server running at http://localhost:${port}`);
    console.log(`Use http://localhost:${port}/api/* to access api.safecast.org resources`);
});
