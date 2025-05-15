// disable_cosmic.js - Script to disable cosmic layer and ensure bGeigie viewer works

(function() {
    console.log("Cosmic layer disabler loaded");
    
    // Check if we should exit early due to the fix already being applied
    if (window.stopBGeigieLoops) {
        console.log("Cosmic disabler exiting early due to fix already applied");
        return;
    }
    
    // Function to disable the cosmic layer completely
    function disableCosmicLayer() {
        // If CosmicLayer exists, modify its functions to prevent initialization
        if (window.CosmicLayer) {
            console.log("Disabling CosmicLayer...");
            
            // Override the initialize function to prevent it from running
            window.CosmicLayer.initialize = function() {
                console.log("CosmicLayer initialization prevented");
                return false;
            };
            
            // Also disable the enable function
            window.CosmicLayer.enable = function() {
                console.log("CosmicLayer enable prevented");
                return false;
            };
            
            console.log("CosmicLayer disabled successfully");
        }
        
        // If CosmicLogLoader exists, prevent it from loading logs
        if (window.CosmicLogLoader) {
            console.log("Disabling CosmicLogLoader...");
            
            window.CosmicLogLoader.load = function() {
                console.log("CosmicLogLoader.load prevented");
                return false;
            };
            
            console.log("CosmicLogLoader disabled successfully");
        }
        
        // Disable any cosmic layer UI elements
        try {
            // Find any UI elements related to cosmic layer
            var cosmicLayerItem = document.querySelector('.layer-item[data-layer="cosmic"]');
            if (cosmicLayerItem) {
                cosmicLayerItem.style.opacity = "0.5";
                cosmicLayerItem.style.cursor = "not-allowed";
                cosmicLayerItem.title = "Cosmic layer temporarily disabled";
                
                // Override click handler
                cosmicLayerItem.addEventListener('click', function(e) {
                    e.preventDefault();
                    e.stopPropagation();
                    console.log("Cosmic layer selection prevented");
                    alert("The cosmic layer has been temporarily disabled to focus on bGeigie log viewer.");
                    return false;
                }, true);
                
                console.log("Cosmic layer UI element disabled");
            }
        } catch (e) {
            console.error("Error disabling cosmic layer UI:", e);
        }
    }
    
    // Function to ensure the bGeigie viewer is initialized - limited to max retries
    var initRetryCount = 0;
    var maxRetries = 3;
    
    function ensureBGeigieViewerInitialized() {
        // Return early if we've exceeded retry count
        if (initRetryCount >= maxRetries || window.stopBGeigieLoops) {
            console.log("Exiting initialization loop - fix script should take over");
            return true;
        }
        
        initRetryCount++;
        console.log("Checking bGeigie viewer status... (attempt " + initRetryCount + "/" + maxRetries + ")");
        
        // Check if we already have an initialized bGeigie viewer
        if (window._bvProxy && window._bvProxy._bvm) {
            console.log("bGeigie viewer already initialized");
            return true;
        }
        
        try {
            console.log("Attempting to initialize bGeigie viewer");
            
            // Make sure BvProxy exists
            if (typeof BvProxy !== 'undefined' && !window._bvProxy) {
                window._bvProxy = new BvProxy();
                console.log("BvProxy initialized");
                return true;
            } else {
                console.log("Waiting for BvProxy to be available");
                // Last retry - the fix script should have taken over by now
                if (initRetryCount < maxRetries) {
                    setTimeout(ensureBGeigieViewerInitialized, 500);
                }
                return false;
            }
        } catch (e) {
            console.error("Error initializing bGeigie viewer:", e);
            return false;
        }
    }
    
    // Run both functions on load
    function init() {
        disableCosmicLayer();
        
        // Initialize viewer with retry limit
        ensureBGeigieViewerInitialized();
        
        // Add helper functions to global scope for convenience
        // but only if they don't already exist (don't override bgeigie_fix.js functions)
        if (typeof window.addBGeigieLog !== 'function') {
            window.addBGeigieLog = function(logId) {
                if (window._bvProxy && window._bvProxy._bvm) {
                    window._bvProxy._bvm.AddLogsByQueryFromString(logId);
                    return true;
                }
                return false;
            };
        }
        
        if (typeof window.clearBGeigieLogs !== 'function') {
            window.clearBGeigieLogs = function() {
                if (window._bvProxy && window._bvProxy._bvm) {
                    window._bvProxy._bvm.RemoveAllMarkersFromMapAndPurgeData();
                    return true;
                }
                return false;
            };
        }
    }
    
    // Run initialization either immediately or on load
    if (document.readyState === 'complete') {
        init();
    } else {
        window.addEventListener('load', init);
    }
})(); 