// cosmic_layer.js - Adds Cosmic radiation layer to the Safecast map

(function(global) {
    // Configuration
    var COSMIC_TILES_URL = 'CosmicTiles/{z}/{x}/{y}.png';
    
    // Layer properties
    var cosmicLayerProperties = {
        name: 'Cosmic Radiation',
        desc: 'Cosmic radiation data from Safecast logs',
        unit: 'N/A',
        files: COSMIC_TILES_URL,
        minzoom: 5,
        maxzoom: 14,
        opacity: 0.7,
        enabled: false,
        sublayers: [],
        metaIndex: 0,
        layerIndex: 11 // You may need to adjust this based on your existing layers
    };
    
    // Function to initialize the cosmic layer
    function initCosmicLayer() {
        console.log('Initializing Cosmic layer...');
        
        // Check if we have the required functions and objects
        if (!window.SafemapInit || !window.LayersHelper) {
            console.error('SafemapInit or LayersHelper not available');
            return false;
        }
        
        try {
            // Find the proper index for the layer
            var layerIndex = 11; // Default
            if (window.LayersHelper && window.LayersHelper.layerProperties) {
                // Find the highest index and add 1
                var highestIndex = 0;
                for (var i = 0; i < window.LayersHelper.layerProperties.length; i++) {
                    if (window.LayersHelper.layerProperties[i].layerIndex > highestIndex) {
                        highestIndex = window.LayersHelper.layerProperties[i].layerIndex;
                    }
                }
                layerIndex = highestIndex + 1;
            }
            
            // Update the layer index
            cosmicLayerProperties.layerIndex = layerIndex;
            
            // Load the layer name from tilejson if available
            loadTileJson().then(function(tileJson) {
                if (tileJson && tileJson.name) {
                    cosmicLayerProperties.name = tileJson.name;
                }
                
                // Add the layer to the layer properties array
                window.LayersHelper.layerProperties.push(cosmicLayerProperties);
                
                // Create the UI for the layer
                createLayerUI();
                
                console.log('Cosmic layer initialized with index ' + layerIndex);
            }).catch(function(error) {
                console.error('Error loading tilejson:', error);
                
                // Add the layer to the layer properties array with default name
                window.LayersHelper.layerProperties.push(cosmicLayerProperties);
                
                // Create the UI for the layer
                createLayerUI();
                
                console.log('Cosmic layer initialized with index ' + layerIndex);
            });
            
            return true;
        } catch (e) {
            console.error('Error initializing Cosmic layer:', e);
            return false;
        }
    }
    
    // Load tilejson to get layer name and other properties
    function loadTileJson() {
        return new Promise(function(resolve, reject) {
            fetch('CosmicTiles/tilejson.json')
                .then(function(response) {
                    if (!response.ok) {
                        throw new Error('Network response was not ok');
                    }
                    return response.json();
                })
                .then(function(data) {
                    resolve(data);
                })
                .catch(function(error) {
                    console.warn('Error fetching tilejson:', error);
                    resolve(null);
                });
        });
    }
    
    // Create UI elements for the cosmic layer
    function createLayerUI() {
        console.log('Creating Cosmic layer UI...');
        
        // Check if we have the required UI functions
        if (!window.MenuHelper) {
            console.error('MenuHelper not available');
            return false;
        }
        
        try {
            // Check if layer menu already exists
            if (!document.getElementById('ul_menu_layers')) {
                console.error('Layers menu not found');
                return false;
            }
            
            // Create layer UI
            window.MenuHelper.AddLayerToLayersMenu(cosmicLayerProperties.layerIndex);
            
            // Add click event handler to ensure layer selection works
            setTimeout(function() {
                var layerItem = document.querySelector('[data-layer-idx="' + cosmicLayerProperties.layerIndex + '"]');
                if (layerItem) {
                    layerItem.addEventListener('click', function() {
                        enableCosmicLayer();
                    });
                }
            }, 1000);
            
            console.log('Cosmic layer UI created');
            return true;
        } catch (e) {
            console.error('Error creating Cosmic layer UI:', e);
            return false;
        }
    }
    
    // Function to enable the cosmic layer
    function enableCosmicLayer() {
        if (!window.LayersHelper) {
            console.error('LayersHelper not available');
            return false;
        }
        
        try {
            // Select the layer in the UI
            window.MenuHelper.OptionsSetSelection('ul_menu_layers', cosmicLayerProperties.layerIndex);
            
            // Set the layer as selected in the layer system
            if (typeof window.LayersHelper.SetUILayerSelected === 'function') {
                window.LayersHelper.SetUILayerSelected(cosmicLayerProperties.layerIndex);
            } else if (typeof window.LayersHelper.SelectLayer === 'function') {
                window.LayersHelper.SelectLayer(cosmicLayerProperties.layerIndex);
            } else {
                console.error('No method to select layer found');
            }
            
            // Force refresh of the map
            if (window.map && window.map.triggerRepaint) {
                window.map.triggerRepaint();
            }
            
            console.log('Cosmic layer enabled');
            return true;
        } catch (e) {
            console.error('Error enabling Cosmic layer:', e);
            return false;
        }
    }
    
    // Check if tiles exist
    function checkTilesExist() {
        var testUrl = COSMIC_TILES_URL.replace('{z}', '5').replace('{x}', '16').replace('{y}', '10');
        
        return new Promise(function(resolve, reject) {
            var img = new Image();
            img.onload = function() {
                console.log('Cosmic tiles exist!');
                resolve(true);
            };
            img.onerror = function() {
                console.warn('Cosmic tiles not found. Run generate_cosmic_tiles.py to create them.');
                resolve(false);
            };
            img.src = testUrl;
        });
    }
    
    // Initialize when the map is ready
    function initialize() {
        console.log('Checking for Cosmic layer initialization...');

        // If SafemapInit is not available, assume this is a simplified environment
        // and do not proceed with the old integration logic.
        // index.html will handle the layer directly.
        if (typeof window.SafemapInit === 'undefined' || typeof window.LayersHelper === 'undefined' || typeof window.MenuHelper === 'undefined') {
            console.log('CosmicLayer: SafemapInit, LayersHelper, or MenuHelper not found. Assuming simplified environment. Initialization deferred to main page.');
            return; 
        }
        
        // Check if the map is ready (original logic)
        if (!window.map || !window.SafemapInit || !window.SafemapInit.IsInitComplete()) {
            console.log('Map not ready, waiting...');
            setTimeout(initialize, 1000);
            return;
        }
        
        // Check if tiles exist
        checkTilesExist().then(function(tilesExist) {
            if (tilesExist) {
                // Initialize the layer
                initCosmicLayer();
            } else {
                // Add a disabled menu item explaining the layer isn't available
                addLayerInfoMenuItem();
            }
        });
    }
    
    // Add an info menu item when the layer isn't available
    function addLayerInfoMenuItem() {
        if (!window.MenuHelper) return;
        
        var layersMenu = document.getElementById('ul_menu_layers');
        if (!layersMenu) return;
        
        var li = document.createElement('li');
        li.innerHTML = '<div style="color:#999;padding:5px 0;">Cosmic Layer (run generate_cosmic_tiles.py to create)</div>';
        layersMenu.appendChild(li);
    }
    
    // Export the public API
    global.CosmicLayer = {
        initialize: initialize,
        enable: enableCosmicLayer,
        properties: cosmicLayerProperties
    };
    
    // Initialize when the document is ready
    if (document.readyState === 'complete') {
        initialize();
    } else {
        window.addEventListener('load', initialize);
    }
    
})(window); 