/**
 * simple-proxy.js - A minimal proxy server for Safecast API
 *
 * This proxy forwards all requests to api.safecast.org and handles CORS
 * To run: node simple-proxy.js
 * Access at: http://localhost:8010/api/...
 */

const express = require("express");
const cors = require("cors");
const axios = require("axios");
const app = express();
const port = 8010;

// Enable CORS for all routes
app.use(cors());

// Log all requests
app.use((req, res, next) => {
  console.log(`${new Date().toISOString()} - ${req.method} ${req.url}`);
  next();
});

// Proxy all requests to api.safecast.org
app.use("/api", async (req, res) => {
  try {
    const apiUrl = `https://api.safecast.org${req.url}`;
    console.log(`Proxying request to: ${apiUrl}`);

    const response = await axios({
      method: req.method,
      url: apiUrl,
      data: req.body,
      headers: {
        // Forward only necessary headers
        Accept: req.headers.accept,
        "Content-Type": req.headers["content-type"],
      },
      responseType: "stream",
    });

    // Forward the response status and headers
    res.status(response.status);
    Object.keys(response.headers).forEach((key) => {
      res.setHeader(key, response.headers[key]);
    });

    // Stream the response data
    response.data.pipe(res);
  } catch (error) {
    console.error(`Proxy error: ${error.message}`);

    // Handle axios error responses
    if (error.response) {
      res.status(error.response.status).send({
        error: `Proxy received error ${error.response.status} from API`,
        message: error.message,
      });
    } else {
      res.status(500).send({
        error: "Proxy server error",
        message: error.message,
      });
    }
  }
});

// Serve static files for testing
app.use(express.static("."));

// Start the server
app.listen(port, () => {
  console.log(`Simple proxy server running at http://localhost:${port}`);
  console.log(
    `To access Safecast API: http://localhost:${port}/api/bgeigie_imports/67925.json`,
  );
});
