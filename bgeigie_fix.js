// bgeigie_fix.js - Compatibility layer for bGeigie viewer with Leaflet

(function() {
    console.log("bGeigie Leaflet compatibility layer loading...");
    
    // Global namespace for our fixes
    window.bGeigieFix = window.bGeigieFix || {};
    
    // Prevent multiple initialization
    if (window.bGeigieFixApplied) {
        console.log("bGeigie fix already applied");
        return;
    }
    window.bGeigieFixApplied = true;
    
    // Stop potential infinite loops in other scripts
    window.stopBGeigieLoops = true;
    
    // Create transfer bar needed by BVM if it doesn't exist
    function createTransferBar() {
        if (!document.getElementById('bv_transferBar')) {
            var transferBar = document.createElement('div');
            transferBar.id = 'bv_transferBar';
            transferBar.className = 'bv_transferBarHidden';
            transferBar.style.cssText = 'position: fixed; bottom: 0; left: 0; width: 100%; height: 20px; background-color: #f0f0f0; display: none;';
            document.body.appendChild(transferBar);
            console.log("Created missing bv_transferBar element");
        }
    }

    // Initialize compatibility layer between Leaflet and Google Maps API
    function setupLeafletGoogleCompatibility() {
        // Get reference to Leaflet map
        const map = window.map;
        if (!map) {
            console.error("Leaflet map not found! Cannot set up compatibility layer.");
                return false; 
        }
        
        console.log("Setting up Leaflet-Google Maps compatibility layer");
        
        // Create a wrapper for the Leaflet map to provide Google Maps compatibility
        // IMPORTANT: This doesn't modify the original map object, just creates a wrapper
        const mapWrapper = {
            _leafletMap: map, // Keep reference to the original Leaflet map
            
            // Methods that provide Google Maps API compatibility
            getBounds: function() {
                const bounds = this._leafletMap.getBounds();
                return {
                    getSouthWest: function() {
                        return {
                            lat: function() { return bounds.getSouth(); },
                            lng: function() { return bounds.getWest(); }
                        };
                    },
                    getNorthEast: function() {
                        return {
                            lat: function() { return bounds.getNorth(); },
                            lng: function() { return bounds.getEast(); }
                        };
                    }
                };
            },
            getZoom: function() { 
                return this._leafletMap.getZoom(); 
            },
            panTo: function(latLng) { 
                this._leafletMap.panTo([latLng.lat(), latLng.lng()]); 
            },
            setZoom: function(zoom) { 
                this._leafletMap.setZoom(zoom); 
            },
            getStreetView: function() {
                return {
                    getVisible: function() { return false; },
                    getPosition: function() { return null; }
                };
            },
            // Fix getDiv method to properly handle both behaviors
            getDiv: function() {
                const mapDiv = document.getElementById('map_canvas');
                if (!mapDiv) {
                    console.warn('Map div not found, returning dummy element');
                    return {
                        clientWidth: 800,
                        clientHeight: 600
                    };
                }
                
                // Add clientWidth and clientHeight properties to the div element
                mapDiv.clientWidth = mapDiv.clientWidth || mapDiv.offsetWidth || 800;
                mapDiv.clientHeight = mapDiv.clientHeight || mapDiv.offsetHeight || 600;
                
                return mapDiv;
            }
        };
        
        // Add Google Maps event compatibility without modifying global objects
        // This keeps our Google Maps compatibility isolated to just the bGeigie viewer
        if (!window._bgeigie_google_compat) {
            window._bgeigie_google_compat = {
                maps: {
                    event: {
                        addListener: function(instance, eventName, handler) {
                            const en = eventName.toLowerCase();
                            if (en === 'idle') {
                                map.on('moveend', handler);
                            } else if (instance && typeof instance.on === 'function') {
                                instance.on(en, handler);
                            }
                            return {
                                remove: function() {
                                    if (instance && typeof instance.off === 'function') {
                                        instance.off(en, handler);
                                    }
                                }
                            };
                        },
                        clearInstanceListeners: function() {}
                    },
                    LatLng: function(lat, lng) {
                        return {
                            lat: function() { return lat !== undefined ? lat : 0; },
                            lng: function() { return lng !== undefined ? lng : 0; },
                            equals: function(other) { 
                                return other && this.lat() === other.lat() && this.lng() === other.lng(); 
                            },
                            toJSON: function() {
                                return { lat: this.lat(), lng: this.lng() };
                            },
                            toString: function() {
                                return this.lat() + "," + this.lng();
                            }
                        };
                    },
                    Marker: function(options) {
                        // Fix: Add null check for options parameter
                        options = options || {};
                        
                        // Fix: Ensure position exists and has valid lat/lng methods
                        if (!options.position) {
                            options.position = {
                                lat: function() { return 0; },
                                lng: function() { return 0; }
                            };
                            console.warn("Creating marker with default position (0,0)");
                        }
                        
                        // Create color-coded marker based on radiation level
                        let markerColor = '#0000ff'; // Default blue
                        let radiationLevel = 0;
                        
                        // Extract radiation data from options if available
                        if (options.data) {
                            // Get radiation value in μSv/h
                            if (typeof options.data.usvh === 'number') {
                                radiationLevel = options.data.usvh;
                            } else if (typeof options.data.radiation === 'number') {
                                radiationLevel = options.data.radiation;
                            } else if (typeof options.data.value === 'number') {
                                radiationLevel = options.data.value;
                            } else if (typeof options.data.cpm === 'number') {
                                // Convert CPM to μSv/h using Safecast conversion factor
                                radiationLevel = options.data.cpm / 334;
                            } else if (typeof options.data.CPM === 'number') {
                                radiationLevel = options.data.CPM / 334;
                            } else if (options.data.Z !== undefined) {
                                radiationLevel = options.data.Z;
                            }
                            
                            // Set color based on radiation level (using Safecast color scale)
                            if (radiationLevel >= 0.6) {
                                markerColor = '#ff0000'; // Red for high levels
                            } else if (radiationLevel >= 0.31) {
                                markerColor = '#ff00ff'; // Purple for medium-high levels
                            } else if (radiationLevel >= 0.16) {
                                markerColor = '#9600c8'; // Purple for medium levels
                            } else if (radiationLevel >= 0.08) {
                                markerColor = '#0000ff'; // Blue for medium-low levels
                            } else if (radiationLevel >= 0.05) {
                                markerColor = '#00b7ff'; // Light blue for low levels
                            } else {
                                markerColor = '#31f3ff'; // Very light blue for very low levels
                            }
                        }
                        
                        // Create Leaflet marker with custom icon
                        const icon = L.divIcon({
                            html: `<div style="
                                background-color: ${markerColor};
                                width: 8px;
                                height: 8px;
                                border-radius: 50%;
                                box-shadow: 0 0 2px rgba(0,0,0,0.3);
                            "></div>`,
                            className: '',
                            iconSize: [8, 8],
                            iconAnchor: [4, 4]
                        });
                        
                        const marker = L.marker([options.position.lat(), options.position.lng()], {
                            icon: icon
                        });
                        
                        // Create popup content if data is available
                        if (options.data) {
                            const data = options.data;
                            const usvh = typeof data.usvh === 'number' ? data.usvh : 
                                    (typeof data.radiation === 'number' ? data.radiation : 
                                    (typeof data.value === 'number' ? data.value : 0));
                            
                            const cpm = typeof data.cpm === 'number' ? data.cpm : Math.round(usvh * 334);
                            const logCpm = typeof data.logCpm === 'number' ? data.logCpm : cpm;
                            const logCps = typeof data.logCps === 'number' ? data.logCps : Math.round(logCpm / 60);
                            const altitude = typeof data.altitude === 'number' ? data.altitude : 
                                          (typeof data.alt === 'number' ? data.alt : null);
                            const heading = typeof data.heading === 'number' ? data.heading : null;
                            const timestamp = data.timestamp || data.time || new Date().toISOString();
                            
                            // Format date for display
                            let dateStr = "";
                            try {
                                const date = new Date(timestamp);
                                dateStr = `${date.getFullYear()}-${String(date.getMonth()+1).padStart(2,'0')}-${String(date.getDate()).padStart(2,'0')} ${String(date.getHours()).padStart(2,'0')}:${String(date.getMinutes()).padStart(2,'0')}:${String(date.getSeconds()).padStart(2,'0')} UTC`;
            } catch (e) {
                                dateStr = timestamp;
                            }
                            
                            // Create popup content
                            const popupContent = `
                                <div style="text-align: center; font-family: Arial, sans-serif; min-width: 120px; line-height: 1.4;">
                                    <div>${usvh.toFixed(2)} μSv/h</div>
                                    <div>${cpm} CPM</div>
                                    <div>${logCpm} Log CPM</div>
                                    <div>${logCps} Log CPS</div>
                                    ${altitude !== null ? `<div>${altitude} m alt</div>` : ''}
                                    ${heading !== null ? `<div>${heading}° heading</div>` : ''}
                                    <div>${dateStr}</div>
                                </div>
                            `;
                            
                            marker.bindPopup(popupContent, {
                                closeButton: true,
                                offset: [0, 0]
                            });
                        }
                        
                        // Add original icon if explicitly requested
                        if (options.icon && options.icon.url && options.useOriginalIcon) {
                            const iconOptions = {
                                iconUrl: options.icon.url,
                                iconSize: [options.icon.size ? options.icon.size.width : 20, options.icon.size ? options.icon.size.height : 20],
                                iconAnchor: [options.icon.anchor ? options.icon.anchor.x : 10, options.icon.anchor ? options.icon.anchor.y : 10]
                            };
                            marker.setIcon(L.icon(iconOptions));
                        }
                        
                        marker.setZIndexOffset(options.zIndex || 0);
                        
                        // Add Google Maps compatibility methods
                        marker.setMap = function(m) {
                            if (m === null) {
                                this.remove();
        } else {
                                this.addTo(map);
                            }
                        };
                        
                        marker.setPosition = function(pos) {
                            if (!pos) return;
                            this.setLatLng([pos.lat(), pos.lng()]);
                        };
                        
                        // Override setIcon to support Google Maps Icon objects without recursion
                        (function() {
                            const originalSetIcon = marker.setIcon.bind(marker);
                            marker.setIcon = function(icon) {
                                if (icon && icon.url) {
                                    const opts = {
                                        iconUrl: icon.url,
                                        iconSize: [icon.size.width, icon.size.height],
                                        iconAnchor: [icon.anchor.x, icon.anchor.y]
                                    };
                                    originalSetIcon(L.icon(opts));
                                } else {
                                    originalSetIcon(icon);
                                }
                            };
                        })();
                        
                        marker.setZIndex = function(z) {
                            this.setZIndexOffset(z || 0);
                        };
                        
                        return marker;
                    },
                    InfoWindow: function(options) {
                        options = options || {};
                        
                        const popup = L.popup(options);
                        
                        // Add Google Maps compatibility methods
                        popup.setContent = function(content) {
                            if (content === undefined || content === null) {
                                content = '';
                            }
                            L.Popup.prototype.setContent.call(this, content);
                        };
                        
                        popup.open = function(map, marker) {
                            if (marker) {
                                marker.bindPopup(this).openPopup();
                            } else if (map) {
                                this.openOn(map);
                            }
                        };
                        
                        popup.close = function() {
                            map.closePopup(this);
                        };
                        
                        return popup;
                    },
                    Size: function(width, height) {
                        return { 
                            width: width || 0, 
                            height: height || 0,
                            equals: function(other) { return other && this.width === other.width && this.height === other.height; }
                        };
                    },
                    Point: function(x, y) {
                        return { 
                            x: x || 0, 
                            y: y || 0,
                            equals: function(other) { return other && this.x === other.x && this.y === other.y; }
                        };
                    }
                }
            };
        }
        
        // Use our isolated Google Maps compatibility object instead of polluting the global namespace
        mapWrapper.google = window._bgeigie_google_compat;
        
        return mapWrapper;
    }
    
    // Fix layer selection to allow Safecast layer to be toggled
    function fixLayerSelection() {
        // Access layer control elements
        const layerItems = document.querySelectorAll('.layer-item');
        if (!layerItems || layerItems.length === 0) {
            console.warn("Layer items not found, can't fix layer selection");
            return;
        }
        
        // Get reference to the map and available layers
        const map = window.map;
        if (!map) {
            console.warn("Can't fix layer selection, map not found");
            return;
        }
        
        // Find radiation layer (Safecast layer)
        let radiationLayer = null;
        if (window.radiationLayer) {
            radiationLayer = window.radiationLayer;
        } else if (window.safecastLayer) {
            radiationLayer = window.safecastLayer;
        } else {
            // Try to find it among the map's layers
            map.eachLayer(function(layer) {
                if (layer._url && layer._url.includes('tiles/t/')) {
                    radiationLayer = layer;
                }
            });
        }
        
        if (!radiationLayer) {
            console.warn("Safecast radiation layer not found, can't fix layer selection");
            return;
        }
        
        console.log("Setting up layer selection fix");
        
        // Override layer selection click handlers
        layerItems.forEach(function(layer) {
            // Remove existing click handlers by cloning the element
            const newLayer = layer.cloneNode(true);
            layer.parentNode.replaceChild(newLayer, layer);
            
            newLayer.addEventListener('click', function() {
                // Remove selected class from all layers
                layerItems.forEach(function(l) {
                    l.classList.remove('selected');
                });
                
                // Add selected class to clicked layer
                this.classList.add('selected');
                
                // Handle layer selection
                const layerName = this.textContent.trim();
                const layerType = this.getAttribute('data-layer') || '';
                
                if (layerName.includes('None') || layerType === 'none') {
                    // Hide all data layers
                    if (map.hasLayer(radiationLayer)) {
                        map.removeLayer(radiationLayer);
                    }
                    console.log("Turned off Safecast layer");
                } else if ((layerName.includes('Safecast') && !layerName.includes('Snapshots') && 
                         !layerName.includes('Cosmic') && !layerName.includes('Points')) || 
                        layerType === 'safecast') {
                    // Show the radiation layer
                    if (!map.hasLayer(radiationLayer)) {
                        map.addLayer(radiationLayer);
                    }
                    console.log("Turned on Safecast layer");
                }
            });
        });
    }

    // Initialize BvProxy and BVM with our map wrapper
    function initializeBGeigieViewer() {
        console.log("Initializing bGeigie viewer compatibility");
        
        // Create required elements
        createTransferBar();
        
        // Set up compatibility with Google Maps API
        setupLeafletGoogleCompatibility();
        
        // Fix: Save a reference to the original Google objects
        const originalGoogle = window.google;
        
        // Create a Google Maps API compatibility object
        // This approach prevents polluting the global namespace while still providing
        // the required API for the bGeigie viewer
        window.google = {
            maps: window._bgeigie_google_compat.maps
        };
        
        // Get the map wrapper
        const mapWrapper = setupLeafletGoogleCompatibility();
        
        // Create BVM instance using the Leaflet-Google Maps compatibility layer
        try {
            console.log("Creating BVM instance");
            const BVM = window.BVM;
            if (!BVM) {
                console.error("BVM class not found! Cannot initialize bGeigie viewer.");
                return false;
            }
            
            // Use the existing _bvProxy if available or create a new one
            if (!window._bvProxy) {
                if (typeof BvProxy === 'function') {
                    window._bvProxy = new BvProxy();
                    console.log("Created new BvProxy instance");
                } else {
                    console.error("BvProxy class not found! Cannot initialize bGeigie viewer.");
                    return false;
                }
            }
            
            // Initialize _bvProxy with the BVM instance
            if (!window._bvProxy._bvm) {
                window._bvProxy._bvm = new BVM(mapWrapper);
                console.log("Created new BVM instance");
                
                // Provide methods for BvProxy
                window._bvProxy.RemoveAllMarkersFromMapAndPurgeData = function() {
                    if (window._bvProxy._bvm) {
                        window._bvProxy._bvm.RemoveAllMarkersFromMapAndPurgeData();
                    }
                };
                
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
                    
                window._bvProxy.Init = function() {
                    console.log("BvProxy.Init called - already initialized");
                };
            }
            
            // Fix layer selection to allow Safecast layer toggling
            fixLayerSelection();
            
                    return true;
        } catch (error) {
            console.error("Error initializing bGeigie viewer:", error);
            return false;
        } finally {
            // Restore original Google object if it existed
            if (originalGoogle) {
                window.google = originalGoogle;
            }
        }
    }
    
    // Disable cosmic layer if it exists (known to cause problems)
    function disableCosmicLayer() {
        if (window.CosmicLayer) {
            console.log("Disabling CosmicLayer");
            // Override the initialize function to prevent it from running
            window.CosmicLayer.initialize = function() { 
                console.log("CosmicLayer.initialize prevented");
                return false; 
            };
            window.CosmicLayer.enable = function() { 
                console.log("CosmicLayer.enable prevented");
                return false; 
            };
            
            // Hide UI elements related to cosmic layer
            var cosmicButtons = document.querySelectorAll('[id^="menu_cosmic"]');
            if (cosmicButtons.length > 0) {
                for (var i = 0; i < cosmicButtons.length; i++) {
                    cosmicButtons[i].style.display = 'none';
                }
                console.log("Cosmic layer UI elements hidden");
            }
        }
    }
    
    // Initialize fixes and features
    function init() {
        // Ensure map exists
        if (!window.map) {
            console.error("Leaflet map not found, waiting 1 second to retry...");
            
            // Retry after a delay to allow map initialization
            setTimeout(init, 1000);
            return;
        }
        
        console.log("Map found, initializing bGeigie viewer");
        initializeBGeigieViewer();
        
        // Load logs specified via URL parameter
        checkUrlForLogIds();
        
        // Disable cosmic layer if present
        disableCosmicLayer();
        
        // Check if the API proxy is running on startup
        setTimeout(checkApiProxyStatus, 2000);
    }

    // Initialize when window is loaded
    if (document.readyState === 'complete') {
        init();
    } else {
        window.addEventListener('load', init);
    }
})(); 