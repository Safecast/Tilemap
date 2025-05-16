# Safecast bGeigie Log Viewer Implementation

This document describes the implementation and fixes for the bGeigie log viewer component in the Safecast map.

## Background

The bGeigie log viewer allows users to view original data points from bGeigie logs, which contain the raw data upon which the Safecast map tiles are based. This provides additional information and greater resolution for specific data collection runs.

The data displayed on the map comes from the Safecast API at `api.safecast.org`.

## Implementation Components

The bGeigie log viewer functionality is implemented across several files:

1. **bgeigie_viewer.js** - Core implementation of the bGeigie log viewer
2. **bgeigie_fix.js** - Direct fixes for initialization issues
3. **bgeigie_helpers.js** - Helper functions and UI for working with bGeigie logs
4. **disable_cosmic.js** - Script to disable cosmic layer that interferes with bGeigie viewer
5. **safemap_compat.js** - Compatibility layer for Leaflet implementation
6. **bgeigie_viewer_status.js** - Diagnostic tool for checking bGeigie viewer status

## Fix for bGeigie Viewer Initialization

The main issue with the bGeigie viewer was that it wasn't being properly initialized. The fix addresses several problems:

1. **Cosmic Layer Interference** - The cosmic layer was interfering with the bGeigie viewer initialization. We've disabled it in `disable_cosmic.js`.

2. **Initialization Sequence** - The `bgeigie_fix.js` script forces proper initialization of the BvProxy and BVM components.

3. **Global Helper Functions** - Added global helper functions (`addBGeigieLog` and `clearBGeigieLogs`) for easier debugging and usage.

4. **URL Parameter Detection** - Added support for loading logs via URL parameters (`logids`).

5. **Test UI** - Added buttons and UI elements for testing log loading.

## Using the bGeigie Viewer

To use the bGeigie viewer:

1. Open the Safecast map (`index.html`).
2. Click on "BGEIGIE LOGS" in the sidebar.
3. Click "Search..." to open the search dialog.
4. Enter a log ID (e.g., 67925) and click "Load Log".

Alternatively, you can use the "Check BGeigie Status" button in the bottom right corner to access the diagnostic tool, which provides:

- Component status information
- Test utilities for loading logs
- Initialization forcing

## Testing with Specific Log IDs

You can test the functionality with these known working log IDs:

- **29** - Early log from March 2011
- **46** - Early log from Japan 
- **67925** - Log requested by the user

You can also load logs directly via URL parameter, like:
```
index.html?logids=67925
```

Or in the URL hash format:
```
index.html#11/37.69224/140.40356?logids=67925
```

## Troubleshooting

If the bGeigie viewer isn't working:

1. Use the diagnostic tool ("Check BGeigie Status" button) to check component status.
2. Use the "Force Init" button to attempt initialization.
3. Check browser console for error messages.
4. Ensure all scripts are loaded in the correct order in the HTML.

## Proxy Server for API Access

If you encounter CORS issues when accessing the Safecast API, use the included proxy server:

1. Install dependencies: `npm install`
2. Start the proxy: `npm run proxy`
3. Access the API via: `http://localhost:8010/api/*`

## Test Page

A dedicated test page (`bgeigie_test.html`) is included for isolated testing of the bGeigie log viewer functionality. 