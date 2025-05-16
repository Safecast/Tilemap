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
            
            // Create test panel if not already present
            if (!document.getElementById('bgeigie-test-container')) {
                createTestPanel();
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
    
    // Create a floating test panel similar to bgeigie_test.html
    function createTestPanel() {
        console.log("Creating bGeigie test panel...");
        
        // Check if the panel already exists
        if (document.getElementById('bgeigie-test-container')) {
            console.log("bGeigie test panel already exists");
            return;
        }
        
        // Create container
        const container = document.createElement('div');
        container.id = 'bgeigie-test-container';
        container.style.cssText = `
            position: fixed;
            top: 10px;
            right: 10px;
            background: white;
            padding: 10px;
            border-radius: 4px;
            box-shadow: 0 2px 10px rgba(0,0,0,0.2);
            z-index: 1500;
            font-family: Arial, sans-serif;
            font-size: 14px;
            max-width: 300px;
            display: none;
        `;
        
        // Create toggle button that stays visible
        const toggleButton = document.createElement('button');
        toggleButton.id = 'bgeigie-test-toggle';
        toggleButton.textContent = 'bGeigie Test';
        toggleButton.style.cssText = `
            position: fixed;
            bottom: 10px;
            right: 10px;
            background: #6ca6bd;
            color: white;
            padding: 8px 12px;
            border: none;
            border-radius: 4px;
            font-family: Arial, sans-serif;
            font-size: 14px;
            font-weight: bold;
            cursor: pointer;
            z-index: 1600;
            box-shadow: 0 2px 5px rgba(0,0,0,0.2);
        `;
        
        // Create close button
        const closeButton = document.createElement('button');
        closeButton.textContent = '×';
        closeButton.style.cssText = `
            position: absolute;
            top: 5px;
            right: 5px;
            background: none;
            border: none;
            font-size: 18px;
            cursor: pointer;
            color: #999;
        `;
        
        // Create title
        const title = document.createElement('h3');
        title.textContent = 'bGeigie Log Tester';
        title.style.cssText = 'margin-top: 0; margin-bottom: 10px; font-size: 16px;';
        
        // Create input container
        const inputContainer = document.createElement('div');
        inputContainer.style.cssText = 'display: flex; margin-bottom: 10px;';
        
        // Create label
        const label = document.createElement('label');
        label.textContent = 'Log ID:';
        label.htmlFor = 'bgeigie-test-logid';
        label.style.cssText = 'margin-right: 10px; line-height: 28px;';
        
        // Create input
        const input = document.createElement('input');
        input.type = 'text';
        input.id = 'bgeigie-test-logid';
        input.value = '67908';
        input.style.cssText = 'flex: 1; padding: 5px; border: 1px solid #ccc; border-radius: 3px;';
        
        // Add label and input to container
        inputContainer.appendChild(label);
        inputContainer.appendChild(input);
        
        // Create button container
        const buttonContainer = document.createElement('div');
        buttonContainer.style.cssText = 'display: flex; flex-wrap: wrap; gap: 5px; margin-bottom: 10px;';
        
        // Create load button
        const loadButton = document.createElement('button');
        loadButton.id = 'bgeigie-test-load';
        loadButton.textContent = 'Load Log';
        loadButton.style.cssText = `
            padding: 5px 10px;
            background: #6ca6bd;
            color: white;
            border: none;
            border-radius: 3px;
            cursor: pointer;
        `;
        
        // Create clear button
        const clearButton = document.createElement('button');
        clearButton.id = 'bgeigie-test-clear';
        clearButton.textContent = 'Clear Logs';
        clearButton.style.cssText = `
            padding: 5px 10px;
            background: #999;
            color: white;
            border: none;
            border-radius: 3px;
            cursor: pointer;
        `;
        
        // Create sample data button
        const sampleButton = document.createElement('button');
        sampleButton.id = 'bgeigie-test-sample';
        sampleButton.textContent = 'Sample Data';
        sampleButton.style.cssText = `
            padding: 5px 10px;
            background: #6ca6bd;
            color: white;
            border: none;
            border-radius: 3px;
            cursor: pointer;
        `;
        
        // Create proxy check button
        const proxyButton = document.createElement('button');
        proxyButton.id = 'bgeigie-test-proxy';
        proxyButton.textContent = 'Check Proxy';
        proxyButton.style.cssText = `
            padding: 5px 10px;
            background: #6ca6bd;
            color: white;
            border: none;
            border-radius: 3px;
            cursor: pointer;
        `;
        
        // Add buttons to container
        buttonContainer.appendChild(loadButton);
        buttonContainer.appendChild(clearButton);
        buttonContainer.appendChild(sampleButton);
        buttonContainer.appendChild(proxyButton);
        
        // Create status container
        const statusContainer = document.createElement('div');
        statusContainer.id = 'bgeigie-test-status';
        statusContainer.style.cssText = `
            max-height: 120px;
            overflow-y: auto;
            border: 1px solid #eee;
            padding: 5px;
            background: #f9f9f9;
            border-radius: 3px;
            font-size: 12px;
        `;
        
        // Add all elements to container
        container.appendChild(closeButton);
        container.appendChild(title);
        container.appendChild(inputContainer);
        container.appendChild(buttonContainer);
        container.appendChild(statusContainer);
        
        // Add container and toggle button to body
        document.body.appendChild(container);
        document.body.appendChild(toggleButton);
        
        // Add toggle functionality
        toggleButton.addEventListener('click', function() {
            const panel = document.getElementById('bgeigie-test-container');
            if (panel.style.display === 'none') {
                panel.style.display = 'block';
                logTestStatus('Test panel opened', 'info');
                // Check proxy status when the panel is opened
                checkApiProxyStatus();
            } else {
                panel.style.display = 'none';
            }
        });
        
        // Add close functionality
        closeButton.addEventListener('click', function() {
            container.style.display = 'none';
        });
        
        // Add functionality to the load button
        document.getElementById('bgeigie-test-load').addEventListener('click', function() {
            const logId = document.getElementById('bgeigie-test-logid').value.trim();
            if (logId) {
                logTestStatus('Loading log ID: ' + logId);
                loadLogData(logId);
                    } else {
                logTestStatus('Please enter a log ID', 'error');
            }
        });
        
        // Add functionality to the clear button
        document.getElementById('bgeigie-test-clear').addEventListener('click', function() {
            logTestStatus('Clearing all logs');
            if (window._bvProxy && window._bvProxy._bvm) {
                window._bvProxy.RemoveAllMarkersFromMapAndPurgeData();
                setTimeout(() => {
                    logTestStatus('Logs cleared successfully', 'success');
                }, 500);
            } else {
                logTestStatus('bGeigie viewer not initialized', 'error');
            }
        });
        
        // Add functionality to the sample data button
        document.getElementById('bgeigie-test-sample').addEventListener('click', function() {
            logTestStatus('Loading sample bGeigie data...');
            loadSampleData();
        });
        
        // Add functionality to the proxy check button
        document.getElementById('bgeigie-test-proxy').addEventListener('click', function() {
            checkApiProxyStatus();
        });
        
        console.log("bGeigie test panel created");
    }
    
    // Log messages to the test panel status area
    function logTestStatus(message, type) {
        // Get status element or create it if it doesn't exist
        const status = document.getElementById('bgeigie-test-status');
        if (!status) return;
        
        // Create a new entry
        const entry = document.createElement('div');
        
        // Apply styling based on type
        entry.style.cssText = 'margin-bottom: 3px; padding: 2px 4px; border-radius: 2px;';
        
        if (type === 'success') {
            entry.style.backgroundColor = '#d4edda';
            entry.style.color = '#155724';
        } else if (type === 'error') {
            entry.style.backgroundColor = '#f8d7da';
            entry.style.color = '#721c24';
        } else if (type === 'info') {
            entry.style.backgroundColor = '#d1ecf1';
            entry.style.color = '#0c5460';
        } else {
            entry.style.backgroundColor = '#f8f9fa';
            entry.style.color = '#383d41';
        }
        
        // Add a timestamp
        const now = new Date();
        const timestamp = `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}:${String(now.getSeconds()).padStart(2, '0')}`;
        
        // Create content
        entry.textContent = `[${timestamp}] ${message}`;
        
        // Add to status
        status.appendChild(entry);
        status.scrollTop = status.scrollHeight;
        
        // Also log to console
        console.log(`[bGeigie ${type || 'log'}] ${message}`);
    }
    
    // Function to check if the API proxy is running
    function checkApiProxyStatus() {
        const proxyUrls = [
            'http://localhost:8010/api/bgeigie_imports/29.json',
            'http://127.0.0.1:8010/api/bgeigie_imports/29.json'
        ];
        
        logTestStatus('Checking API proxy status...', 'info');
        
        let proxyRunning = false;
        let checkedCount = 0;
        
        proxyUrls.forEach((url, index) => {
            fetch(url, { method: 'HEAD', mode: 'no-cors' })
                .then(() => {
                    if (!proxyRunning) {
                        proxyRunning = true;
                        logTestStatus(`API proxy detected at ${url}`, 'success');
                    }
                })
                .catch(() => {
                    logTestStatus(`API proxy not detected at ${url}`, 'error');
                })
                .finally(() => {
                    checkedCount++;
                    if (checkedCount === proxyUrls.length && !proxyRunning) {
                        logTestStatus('No API proxy detected. Please start the proxy server with: npm run proxy', 'error');
                    }
                });
        });
    }
    
    // Load sample data for testing
    function loadSampleData() {
        if (!window._bvProxy || !window._bvProxy._bvm) {
            logTestStatus('bGeigie viewer not initialized', 'error');
            return;
        }
        
        logTestStatus('Loading sample bGeigie log data...', 'info');
        
        // Sample data points (simulated radiation readings) in the Tokyo area
        const centerLat = 35.71976;
        const centerLng = 139.70592;
        const sampleData = [];
        
        // Generate 200 random points around the center
        for (let i = 0; i < 200; i++) {
            // Random offset within approximately 1km
            const latOffset = (Math.random() - 0.5) * 0.02;
            const lngOffset = (Math.random() - 0.5) * 0.02;
            
            // Random radiation between 0.05 and 0.25 μSv/h
            const radiation = 0.05 + Math.random() * 0.2;
            const cpm = Math.round(radiation * 334); // Convert to CPM
            
            sampleData.push({
                latitude: centerLat + latOffset,
                longitude: centerLng + lngOffset,
                radiation: radiation,
                cpm: cpm,
                altitude: 100 + Math.round(Math.random() * 800),
                heading: Math.round(Math.random() * 360),
                timestamp: new Date().toISOString()
            });
        }
        
        logTestStatus(`Created ${sampleData.length} sample data points`, 'success');
        
        // Clear existing data
                window._bvProxy.RemoveAllMarkersFromMapAndPurgeData();
        
        // Add the markers manually
        if (window._bvProxy._bvm.mks) {
            // Start radiation range tracking
            let minRadiation = 9999;
            let maxRadiation = 0;
            
            logTestStatus(`Creating markers from ${sampleData.length} data points`, 'info');
            
            // Get access to our LatLng constructor
            const LatLng = window._bgeigie_google_compat.maps.LatLng;
            const Marker = window._bgeigie_google_compat.maps.Marker;
            
            // Add each data point as a marker
            for (let i = 0; i < sampleData.length; i++) {
                const point = sampleData[i];
                
                // Track radiation range
                if (point.radiation < minRadiation) minRadiation = point.radiation;
                if (point.radiation > maxRadiation) maxRadiation = point.radiation;
                
                // Create a Google Maps compatible position
                const position = new LatLng(point.latitude, point.longitude);
                
                // Create marker data object
                const markerData = {
                    usvh: point.radiation,
                    cpm: point.cpm,
                    logCpm: point.cpm,
                    logCps: Math.round(point.cpm / 60),
                    altitude: point.altitude,
                    heading: point.heading,
                    timestamp: point.timestamp
                };
                
                // Create a marker directly
                const markerOptions = {
                    position: position,
                    data: markerData
                };
                
                // Create and add the marker
                const marker = new Marker(markerOptions);
                marker.setMap(window._bvProxy._bvm.mapref);
            }
            
            logTestStatus(`Created ${sampleData.length} markers with radiation data`, 'success');
            logTestStatus(`Radiation range: ${minRadiation.toFixed(3)} - ${maxRadiation.toFixed(3)} μSv/h`, 'info');
            
            // Center the map on the data points
            window.map.setView([centerLat, centerLng], 14);
        } else {
            logTestStatus('Could not access marker system', 'error');
        }
    }
    
    // Make a direct API request to load log data
    function loadLogData(logId) {
        if (!window._bvProxy || !window._bvProxy._bvm) {
            logTestStatus('bGeigie viewer not initialized', 'error');
            return;
        }
        
        logTestStatus(`Starting advanced load for log ID: ${logId}...`, 'info');
        
        // First try the regular method
        window._bvProxy.AddLogsByQueryFromString(logId);
        
        // Then try an alternative approach with the proxy
        try {
            // Determine the API server URL - try multiple possible proxy configurations
            const proxyUrls = [
                `http://localhost:8010/api/bgeigie_imports/${logId}.json`,  // Proxy on port 8010
                `http://127.0.0.1:8010/api/bgeigie_imports/${logId}.json`,  // Using IP instead of localhost on port 8010
                `https://api.safecast.org/bgeigie_imports/${logId}.json`    // Direct access (may fail due to CORS)
            ];
            
            // Use a more robust proxy detection
            function tryNextUrl(index) {
                if (index >= proxyUrls.length) {
                    logTestStatus(`All API endpoints failed, falling back to standard method`, 'error');
                    return;
                }
                
                const currentUrl = proxyUrls[index];
                logTestStatus(`Trying endpoint ${index+1}/${proxyUrls.length}: ${currentUrl}`, 'info');
                
                fetch(currentUrl)
                    .then(response => {
                        if (!response.ok) {
                            throw new Error(`Network response error: ${response.status}`);
                        }
                        return response.json();
                    })
                    .then(data => {
                        logTestStatus(`Log data received from ${currentUrl}`, 'success');
                        
                        // If we have source URL, use it directly
                        if (data && data.source && data.source.url) {
                            const sourceUrl = data.source.url;
                            logTestStatus(`Found source URL: ${sourceUrl}`, 'info');
                            
                            // Try both direct loading methods
                            if (typeof window._bvProxy._bvm.GetLogFileDirectFromUrlAsync === 'function') {
                                logTestStatus(`Using GetLogFileDirectFromUrlAsync method`, 'info');
                                // Add a callback to provide visual feedback
                                const loadCallback = function() {
                                    logTestStatus(`Log ${logId} data loaded successfully`, 'success');
                                };
                                window._bvProxy._bvm.GetLogFileDirectFromUrlAsync(sourceUrl, logId, loadCallback);
                            } else if (typeof window._bvProxy._bvm.GetJSONAsync === 'function') {
                                logTestStatus(`Using GetJSONAsync method`, 'info');
                                window._bvProxy._bvm.GetJSONAsync(currentUrl);
                            }
                        } else {
                            logTestStatus(`Log data missing source URL`, 'error');
                        }
                    })
                    .catch(error => {
                        logTestStatus(`Error with ${currentUrl}: ${error.message}`, 'error');
                        // Try the next URL in the list
                        tryNextUrl(index + 1);
                    });
            }
            
            // Start with the first URL
            tryNextUrl(0);
            
        } catch (e) {
            logTestStatus(`Error in API request: ${e.message}`, 'error');
        }
    }
    
    // Check for log IDs in URL
    function checkUrlForLogIds() {
        const url = new URL(window.location.href);
        const logId = url.searchParams.get('log');
        
        if (logId) {
            console.log("Found log ID in URL:", logId);
            // Wait for initialization before loading
            setTimeout(function() {
                if (window._bvProxy && window._bvProxy._bvm) {
                    window._bvProxy.AddLogsByQueryFromString(logId);
                }
            }, 1500);
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