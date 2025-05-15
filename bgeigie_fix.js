// bgeigie_fix.js - Direct fix for bGeigie log viewer initialization problems

(function() {
    console.log("bGeigie direct fix loading...");
    
    // Define global namespace for bGeigie fixes to avoid conflicts
    window.bGeigieFix = window.bGeigieFix || {};
    
    // Stop any potential infinite loops in other scripts
    if (window.stopBGeigieLoops) {
        console.log("Fix already applied");
        return;
    }
    
    window.stopBGeigieLoops = true;
    
    // Disable cosmic layer function - exported globally
    window.disableCosmicLayer = function() {
        if (window.CosmicLayer) {
            console.log("Disabling CosmicLayer from global function");
            // Override the initialize function to prevent it from running
            window.CosmicLayer.initialize = function() { 
                console.log("CosmicLayer.initialize prevented");
                return false; 
            };
            window.CosmicLayer.enable = function() { 
                console.log("CosmicLayer.enable prevented");
                return false; 
            };
            
            // Disable any UI elements related to cosmic layer
            var cosmicButtons = document.querySelectorAll('[id^="menu_cosmic"]');
            if (cosmicButtons.length > 0) {
                for (var i = 0; i < cosmicButtons.length; i++) {
                    cosmicButtons[i].style.display = 'none';
                }
                console.log("Cosmic layer UI elements hidden");
            }
        }
    };
    
    // Fix BvProxy constructor issues
    function fixBvProxy() {
        // Ensure BvProxy class exists
        if (typeof BvProxy !== 'function') {
            console.error("BvProxy constructor not available!");
            return false;
        }
        
        // Create a global _bvProxy instance if it doesn't exist
        if (!window._bvProxy) {
            try {
                console.log("Creating new BvProxy instance");
                window._bvProxy = new BvProxy();
                console.log("BvProxy created successfully");
                return true;
            } catch (e) {
                console.error("Error creating BvProxy:", e);
                return false;
            }
        } else {
            console.log("BvProxy instance already exists");
            return true;
        }
    }
    
    // Fix BVM initialization issues
    function fixBvm() {
        if (!window._bvProxy) {
            console.error("Cannot fix BVM: No BvProxy instance exists");
            return false;
        }
        
        // Check if _bvm is already created
        if (window._bvProxy._bvm) {
            console.log("BVM instance already exists");
            return true;
        }
        
        // Try to create BVM from BvProxy.Init
        if (typeof window._bvProxy.Init === 'function') {
            try {
                console.log("Calling BvProxy.Init() to create BVM");
                window._bvProxy.Init();
                
                if (window._bvProxy._bvm) {
                    console.log("BVM created successfully through Init()");
                    return true;
                }
            } catch (e) {
                console.error("Error calling BvProxy.Init():", e);
            }
        }
        
        // Fallback: Create BVM directly if possible
        if (typeof BVM === 'function') {
            try {
                console.log("Creating BVM directly");
                
                // Get map reference from various sources
                var mapRef = null;
                if (window.map) {
                    mapRef = window.map;
                } else {
                    // Try to find Leaflet map instance
                    var mapElements = document.querySelectorAll('.leaflet-container');
                    if (mapElements.length > 0) {
                        // Iterate through properties to find Leaflet instance
                        for (var key in mapElements[0]) {
                            if (key.startsWith('__leaflet_instance_')) {
                                mapRef = mapElements[0][key];
                                break;
                            }
                        }
                    }
                }
                
                if (mapRef) {
                    window._bvProxy._bvm = new BVM(mapRef);
                    
                    // Ensure all BVM methods are connected to BvProxy
                    window._bvProxy.AddLogsByQueryFromString = function(logId) {
                        if (window._bvProxy._bvm) {
                            window._bvProxy._bvm.AddLogsByQueryFromString(logId);
                        }
                    };
                    
                    window._bvProxy.AddLogsCSV = function(logId) {
                        if (window._bvProxy._bvm) {
                            window._bvProxy._bvm.AddLogsByQueryFromString(logId);
                        }
                    };
                    
                    window._bvProxy.RemoveAllMarkersFromMapAndPurgeData = function() {
                        if (window._bvProxy._bvm) {
                            window._bvProxy._bvm.RemoveAllMarkersFromMapAndPurgeData();
                        }
                    };
                    
                    // Patch the GetCurrentVisibleExtent method to handle errors
                    if (window._bvProxy._bvm.mks && window._bvProxy._bvm.mks.GetCurrentVisibleExtent) {
                        var originalGetCurrentVisibleExtent = window._bvProxy._bvm.mks.GetCurrentVisibleExtent;
                        window._bvProxy._bvm.mks.GetCurrentVisibleExtent = function() {
                            try {
                                return originalGetCurrentVisibleExtent.apply(this);
                            } catch (e) {
                                console.error("Error in GetCurrentVisibleExtent:", e);
                                // Return a default extent
                                return [139.0, 35.0, 140.0, 36.0, -9e3, -9e3, 8];
                            }
                        };
                    }
                    
                    console.log("BVM created successfully through direct instantiation");
                    return true;
                } else {
                    console.error("Could not find map reference for BVM");
                }
            } catch (e) {
                console.error("Error creating BVM directly:", e);
            }
        }
        
        return false;
    }
    
    // Clears the marker icon cache to fix color issues
    function clearMarkerIconCache() {
        try {
            if (window._bvProxy && window._bvProxy._bvm && window._bvProxy._bvm.mks) {
                // Clear the icon cache array
                window._bvProxy._bvm.mks.icons = new Array();
                console.log("Marker icon cache cleared");
                return true;
            }
            return false;
        } catch (e) {
            console.error("Error clearing marker icon cache:", e);
            return false;
        }
    }
    
    // Create transfer bar if it doesn't exist (needed by BVM)
    function createTransferBar() {
        if (!document.getElementById('bv_transferBar')) {
            var transferBar = document.createElement('div');
            transferBar.id = 'bv_transferBar';
            transferBar.className = 'bv_transferBarHidden';
            transferBar.style.cssText = 'position: fixed; bottom: 0; left: 0; width: 100%; height: 20px; background-color: #f0f0f0;';
            document.body.appendChild(transferBar);
            console.log("Created missing bv_transferBar element");
            return true;
        }
        return false;
    }
    
    // Make a direct CORS request to the Safecast API
    function makeDirectApiRequest(url, callback) {
        try {
            // Use the existing proxy at port 8010
            const proxyUrl = 'http://localhost:8010/api/bgeigie_imports/' + url.split('/').pop();
            console.log("Using proxy URL:", proxyUrl);
            
            var xhr = new XMLHttpRequest();
            xhr.open('GET', proxyUrl, true);
            xhr.responseType = 'json';
            xhr.onreadystatechange = function() {
                if (xhr.readyState === 4) {
                    if (xhr.status === 200) {
                        callback(xhr.response, null);
                    } else {
                        callback(null, new Error('Request failed with status ' + xhr.status));
                    }
                }
            };
            xhr.send();
        } catch (e) {
            callback(null, e);
        }
    }
    
    // Robust global helper for adding bGeigie logs
    window.addBGeigieLog = function(logId) {
        if (!logId) {
            console.error("No log ID provided");
            return false;
        }
        
        console.log("Attempting to add bGeigie log:", logId);
        
        // Ensure BvProxy exists
        if (!window._bvProxy && !fixBvProxy()) {
            console.error("Failed to create BvProxy");
            return false;
        }
        
        // Ensure BVM exists
        if (!window._bvProxy._bvm && !fixBvm()) {
            console.error("Failed to create BVM");
            return false;
        }
        
        try {
            // First try using direct URL injection instead of the API
            var directUrl = "https://api.safecast.org/system/bgeigie_imports/" + logId + "/kml";
            
            // Try to make a direct request to the Safecast API
            makeDirectApiRequest("https://api.safecast.org/bgeigie_imports/" + logId + ".json", function(data, error) {
                if (error) {
                    console.error("Error fetching Safecast API:", error);
                    
                    // Try multiple methods to add the log as a fallback
                    if (window._bvProxy && window._bvProxy.AddLogsCSV) {
                        console.log("Using AddLogsCSV");
                        window._bvProxy.AddLogsCSV(logId);
                    } 
                    else if (window._bvProxy && window._bvProxy.AddLogsByQueryFromString) {
                        console.log("Using AddLogsByQueryFromString via BvProxy");
                        window._bvProxy.AddLogsByQueryFromString(logId);
                    }
                    else if (window._bvProxy && window._bvProxy._bvm && window._bvProxy._bvm.AddLogsByQueryFromString) {
                        console.log("Using AddLogsByQueryFromString via BVM");
                        window._bvProxy._bvm.AddLogsByQueryFromString(logId);
                    }
                } else {
                    // We have data, use it directly if possible
                    if (data && data.source && data.source.url) {
                        console.log("Got log data directly from API, using source URL:", data.source.url);
                        
                        if (window._bvProxy && window._bvProxy._bvm && window._bvProxy._bvm.GetLogFileDirectFromUrlAsync) {
                            // Use direct URL access, just like the original implementation
                            console.log("Using direct access for URL:", data.source.url);
                            window._bvProxy._bvm.GetLogFileDirectFromUrlAsync(data.source.url, logId);
                        } else {
                            // Fallback
                            window._bvProxy._bvm.GetJSONAsync("https://api.safecast.org/bgeigie_imports/" + logId + ".json");
                        }
                    } else {
                        // Fallback
                        console.log("Using fallback method");
                        window._bvProxy._bvm.AddLogsByQueryFromString(logId);
                    }
                }
            });
            
            return true;
        } catch (e) {
            console.error("Error adding log:", e);
            return false;
        }
    };
    
    // Robust global helper for clearing bGeigie logs
    window.clearBGeigieLogs = function() {
        console.log("Attempting to clear bGeigie logs");
        
        // Ensure BvProxy exists
        if (!window._bvProxy && !fixBvProxy()) {
            console.error("Failed to create BvProxy");
            return false;
        }
        
        // Ensure BVM exists
        if (!window._bvProxy._bvm && !fixBvm()) {
            console.error("Failed to create BVM");
            return false;
        }
        
        try {
            // First clear the marker icon cache
            clearMarkerIconCache();
            
            if (window._bvProxy && window._bvProxy.RemoveAllMarkersFromMapAndPurgeData) {
                console.log("Using RemoveAllMarkersFromMapAndPurgeData via BvProxy");
                window._bvProxy.RemoveAllMarkersFromMapAndPurgeData();
                return true;
            }
            else if (window._bvProxy && window._bvProxy._bvm && window._bvProxy._bvm.RemoveAllMarkersFromMapAndPurgeData) {
                console.log("Using RemoveAllMarkersFromMapAndPurgeData via BVM");
                window._bvProxy._bvm.RemoveAllMarkersFromMapAndPurgeData();
                return true;
            }
            else {
                console.error("No method available to clear logs");
                return false;
            }
        } catch (e) {
            console.error("Error clearing logs:", e);
            return false;
        }
    };
    
    // Check URL for logids parameter
    function checkUrlForLogIds() {
        try {
            // Check for normal query parameter
            const params = new URLSearchParams(window.location.search);
            const logIds = params.get('logids');
            
            if (logIds) {
                console.log("Found logIds in URL:", logIds);
                
                // Wait for BvProxy to be ready
                setTimeout(function() {
                    if (window.addBGeigieLog(logIds)) {
                        console.log("Successfully added logs from URL parameter");
                    } else {
                        console.error("Failed to add logs from URL parameter");
                    }
                }, 2000);
            }
            
            // Also check hash format like #11/37.69224/140.40356?logids=67925
            const hash = window.location.hash;
            if (hash && hash.indexOf('logids=') > -1) {
                const hashLogIds = hash.split('logids=')[1].split('&')[0];
                if (hashLogIds && hashLogIds !== logIds) {
                    console.log("Found logIds in hash:", hashLogIds);
                    
                    // Wait for BvProxy to be ready
                    setTimeout(function() {
                        if (window.addBGeigieLog(hashLogIds)) {
                            console.log("Successfully added logs from hash parameter");
                        } else {
                            console.error("Failed to add logs from hash parameter");
                        }
                    }, 2000);
                }
            }
        } catch (e) {
            console.error("Error checking URL for logIds:", e);
        }
    }
    
    // Add a test button for adding log 67925
    function addTestButton() {
        var button = document.createElement('button');
        button.textContent = 'Add Log 67925';
        button.style.cssText = 'position: fixed; bottom: 10px; right: 10px; padding: 8px 12px; ' +
                               'background: #4CAF50; color: white; border: none; ' +
                               'border-radius: 4px; z-index: 1000; cursor: pointer;';
        
        button.onclick = function() {
            if (window.addBGeigieLog('67925')) {
                button.textContent = 'Log Added!';
                setTimeout(function() {
                    button.textContent = 'Add Log 67925';
                }, 2000);
            } else {
                button.textContent = 'Failed!';
                button.style.backgroundColor = '#f44336';
                setTimeout(function() {
                    button.textContent = 'Add Log 67925';
                    button.style.backgroundColor = '#4CAF50';
                }, 2000);
            }
        };
        
        document.body.appendChild(button);
        console.log("Test button added");
    }
    
    // Function to force initialize BvProxy and BVM
    function forceInitializeBGeigieViewer() {
        console.log("Force-initializing bGeigie viewer");
        createTransferBar();
        
        if (fixBvProxy()) {
            setTimeout(function() {
                if (fixBvm()) {
                    console.log("bGeigie viewer successfully initialized");
                } else {
                    console.error("Failed to initialize BVM");
                }
            }, 500);
            return true;
        } else {
            console.error("Failed to initialize BvProxy");
            return false;
        }
    }
    
    // Add a clear cache and reload button
    function addClearCacheButton() {
        var button = document.createElement('button');
        button.textContent = 'Clear Marker Cache';
        button.style.cssText = 'position: fixed; bottom: 10px; right: 300px; padding: 8px 12px; ' +
                              'background: #FF9800; color: white; border: none; ' +
                              'border-radius: 4px; z-index: 1000; cursor: pointer;';
        
        button.onclick = function() {
            if (clearMarkerIconCache()) {
                if (window._bvProxy && window._bvProxy._bvm && window._bvProxy._bvm.mks) {
                    // Force refresh of markers
                    window._bvProxy._bvm.mks.RemoveMarkersFromMapForCurrentVisibleExtent();
                    window._bvProxy._bvm.mks.AddMarkersToMapForCurrentVisibleExtent();
                }
                button.textContent = 'Cache Cleared!';
                setTimeout(function() {
                    button.textContent = 'Clear Marker Cache';
                }, 2000);
            } else {
                button.textContent = 'Failed!';
                button.style.backgroundColor = '#f44336';
                setTimeout(function() {
                    button.textContent = 'Clear Marker Cache';
                    button.style.backgroundColor = '#FF9800';
                }, 2000);
            }
        };
        
        document.body.appendChild(button);
        console.log("Clear cache button added");
    }
    
    // Create a force init button
    function addForceInitButton() {
        var button = document.createElement('button');
        button.textContent = 'Force Init bGeigie';
        button.style.cssText = 'position: fixed; bottom: 10px; right: 150px; padding: 8px 12px; ' +
                               'background: #2196F3; color: white; border: none; ' +
                               'border-radius: 4px; z-index: 1000; cursor: pointer;';
        
        button.onclick = function() {
            if (forceInitializeBGeigieViewer()) {
                button.textContent = 'Init Successful!';
                setTimeout(function() {
                    button.textContent = 'Force Init bGeigie';
                }, 2000);
            } else {
                button.textContent = 'Init Failed!';
                button.style.backgroundColor = '#f44336';
                setTimeout(function() {
                    button.textContent = 'Force Init bGeigie';
                    button.style.backgroundColor = '#2196F3';
                }, 2000);
            }
        };
        
        document.body.appendChild(button);
        console.log("Force init button added");
    }
    
    // Explicitly stop the loops in disable_cosmic.js
    window.ensureBGeigieViewerInitialized = function() {
        console.log("Overriding ensureBGeigieViewerInitialized to prevent infinite loops");
        return true; // Always return true to prevent further calls
    };
    
    // Main initialization
    function init() {
        // Create any missing UI elements first
        createTransferBar();
        
        // Make sure the cosmic layer is disabled
        window.disableCosmicLayer();
        
        // Initialize the bGeigie viewer
        forceInitializeBGeigieViewer();
        
        // Add test buttons
        addTestButton();
        addForceInitButton();
        addClearCacheButton();
        
        // Check URL for log IDs
        checkUrlForLogIds();
        
        console.log("bGeigie fix initialization complete");
    }
    
    // Run initialization when DOM is ready
    if (document.readyState === 'complete') {
        init();
    } else {
        window.addEventListener('load', init);
    }
})(); 