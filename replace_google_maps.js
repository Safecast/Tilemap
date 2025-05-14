// replace_google_maps.js - Google Maps to Leaflet bridge for Safecast
// This creates a compatibility layer to replace Google Maps with Leaflet/OpenStreetMap
// while maintaining the original Safecast UI and functionality

// Create google namespace
window.google = window.google || {};
window.google.maps = window.google.maps || {};

// Intercept the main initialization functions
document.addEventListener('DOMContentLoaded', function() {
    console.log("Initializing Safecast with OpenStreetMap");
    
    // Force OpenStreetMap as the preferred basemap
    localStorage.setItem("PREF_BASEMAP_UIDX", 9);
    
    // Load necessary styles
    var leafletStyles = document.createElement('link');
    leafletStyles.rel = 'stylesheet';
    leafletStyles.href = 'https://unpkg.com/leaflet@1.9.4/dist/leaflet.css';
    document.head.appendChild(leafletStyles);
    
    // Load Leaflet script
    var leafletScript = document.createElement('script');
    leafletScript.src = 'https://unpkg.com/leaflet@1.9.4/dist/leaflet.js';
    leafletScript.onload = function() {
        console.log("Leaflet loaded");
        
        // Initialize the map when the document is already loaded
        if (document.readyState === 'complete' || document.readyState === 'interactive') {
            initLeafletMap();
        }
    };
    document.head.appendChild(leafletScript);
    
    // Override init functions
    window.InitGmaps = function() {
        console.log("InitGmaps called, using Leaflet instead");
        window._ls.gmaps = true;
        FinishLoadIfPossible();
    };
    
    window.LoadGmaps = function() {
        console.log("LoadGmaps called, using Leaflet instead");
        InitGmaps();
    };
});

function initLeafletMap() {
    console.log("Initializing Leaflet map");
    
    // Make sure map_canvas exists
    var mapCanvas = document.getElementById('map_canvas');
    if (!mapCanvas) {
        console.error("map_canvas element not found");
        return;
    }
    
    // Get default center and zoom from localStorage or use default Fukushima location
    var defaultLat = parseFloat(localStorage.getItem("PREF_VISIBLE_EXTENT_Y")) || 37.316113;
    var defaultLng = parseFloat(localStorage.getItem("PREF_VISIBLE_EXTENT_X")) || 140.515516;
    var defaultZoom = parseInt(localStorage.getItem("PREF_VISIBLE_EXTENT_Z")) || 9;
    
    // Create the Leaflet map
    window.map = L.map('map_canvas', {
        center: [defaultLat, defaultLng],
        zoom: defaultZoom,
        zoomControl: localStorage.getItem("PREF_ZOOM_BUTTONS_ENABLED") !== "false",
        attributionControl: true,
        minZoom: 2,
        maxZoom: 19
    });
    
    // Add base OpenStreetMap layer
    var osmLayer = L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
        maxZoom: 19,
        attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
    }).addTo(window.map);
    
    // Add Safecast radiation tile layer
    var radiationLayer = L.tileLayer('http://localhost:8010/s3-tiles/t/{z}/{x}/{y}.png', {
        maxZoom: 19,
        opacity: 0.8,
        attribution: '&copy; <a href="https://safecast.org">Safecast</a>'
    }).addTo(window.map);
    
    // Store available base maps
    window.basemapMapTypes = {
        'osm': osmLayer,
        'satellite': L.tileLayer('https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}', {
            attribution: 'Imagery &copy; Esri',
            maxZoom: 19
        }),
        'terrain': L.tileLayer('https://stamen-tiles-{s}.a.ssl.fastly.net/terrain/{z}/{x}/{y}.png', {
            attribution: 'Map tiles by <a href="http://stamen.com">Stamen Design</a>',
            maxZoom: 18
        }),
        'toner': L.tileLayer('https://stamen-tiles-{s}.a.ssl.fastly.net/toner/{z}/{x}/{y}.png', {
            attribution: 'Map tiles by <a href="http://stamen.com">Stamen Design</a>',
            maxZoom: 18
        })
    };
    
    // Create layers control object
    window.overlayMaps = {
        'radiation': radiationLayer
    };
    
    // Add event listener for saving the position
    window.map.on('moveend', function() {
        var center = window.map.getCenter();
        var zoom = window.map.getZoom();
        
        localStorage.setItem("PREF_VISIBLE_EXTENT_Y", center.lat);
        localStorage.setItem("PREF_VISIBLE_EXTENT_X", center.lng);
        localStorage.setItem("PREF_VISIBLE_EXTENT_Z", zoom);
        
        // Notify the Safecast app of the change
        if (window.SafemapExtent && typeof window.SafemapExtent.OnChange === 'function') {
            window.SafemapExtent.OnChange(1); // 1 = DragEnd event
        }
    });
    
    // Add zoom event listener
    window.map.on('zoomend', function() {
        // Notify the Safecast app of the change
        if (window.SafemapExtent && typeof window.SafemapExtent.OnChange === 'function') {
            window.SafemapExtent.OnChange(0); // 0 = ZoomChanged event
        }
    });
    
    // Add Safecast controls after map loads
    window.map.whenReady(function() {
        // Show UI elements that might be hidden
        setTimeout(function() {
            var menuElement = document.getElementById('menu');
            if (menuElement) menuElement.style.display = "";
            
            var logoElement = document.getElementById('logo2');
            if (logoElement) logoElement.style.visibility = "visible";
            
            // Make sure slideout menu works
            if (window.slideout) {
                window.slideout.panel = document.querySelector('.slideout-panel');
                window.slideout.menu = document.querySelector('.slideout-menu');
            }
            
            // Remove loading spinner
            var spinner = document.getElementById('div_sc_ls_wb');
            if (spinner && spinner.parentNode) {
                spinner.parentNode.removeChild(spinner);
            }
            
            // Trigger initialization of UI components
            if (window._ls) {
                window._ls.gmaps = true;
                if (typeof FinishLoadIfPossible === 'function') {
                    FinishLoadIfPossible();
                }
            }
            
            // Make sure the scale shows up
            var scaleElement = document.getElementById('scale');
            if (scaleElement) {
                scaleElement.style.display = "block";
            }
            
            // Trigger any stored tile listeners
            triggerTileListeners();
        }, 500);
    });
    
    console.log("Leaflet map initialized");
}

function triggerTileListeners() {
    setTimeout(function() {
        if (window.google && window.google.maps && window.google.maps.event) {
            var listeners = window.google.maps._tileListeners || [];
            for (var i = 0; i < listeners.length; i++) {
                try {
                    listeners[i]();
                } catch (e) {
                    console.error("Error calling tile listener", e);
                }
            }
        }
    }, 500);
}

// Track event listeners
window.google.maps._tileListeners = [];
window.google.maps._eventListeners = {};

// Basic classes
window.google.maps.Point = function(x, y) {
    this.x = x;
    this.y = y;
};

window.google.maps.Size = function(width, height) {
    this.width = width;
    this.height = height;
};

window.google.maps.LatLng = function(lat, lng) {
    return L.latLng(lat, lng);
};

window.google.maps.LatLngBounds = function(sw, ne) {
    return L.latLngBounds(sw, ne);
};

// Map class stub
window.google.maps.Map = function(element, options) {
    if (!window.map) {
        // Store options for later initialization
        window.mapOptions = options || {};
    }
    return window.map;
};

// Map methods
window.google.maps.Map.prototype = {
    setZoom: function(zoom) {
        if (window.map) window.map.setZoom(zoom);
    },
    
    getZoom: function() {
        return window.map ? window.map.getZoom() : 9;
    },
    
    setCenter: function(latLng) {
        if (window.map) window.map.setView(latLng, window.map.getZoom());
    },
    
    getCenter: function() {
        return window.map ? window.map.getCenter() : L.latLng(37.316113, 140.515516);
    },
    
    getBounds: function() {
        return window.map ? window.map.getBounds() : null;
    },
    
    panTo: function(latLng) {
        if (window.map) window.map.panTo(latLng);
    },
    
    setMapTypeId: function(mapTypeId) {
        if (window.map && window.basemapMapTypes[mapTypeId]) {
            // Remove all base layers
            Object.values(window.basemapMapTypes).forEach(function(layer) {
                if (window.map.hasLayer(layer)) {
                    window.map.removeLayer(layer);
                }
            });
            
            // Add the selected base layer
            window.basemapMapTypes[mapTypeId].addTo(window.map);
        }
    },
    
    // Support for overlay types
    overlayMapTypes: {
        _layers: [],
        push: function(overlay) {
            this._layers.push(overlay);
            if (overlay.tileLayer) {
                overlay.tileLayer.addTo(window.map);
            }
        },
        getAt: function(index) {
            return this._layers[index];
        },
        setAt: function(index, value) {
            var oldLayer = this._layers[index];
            if (oldLayer && oldLayer.tileLayer) {
                window.map.removeLayer(oldLayer.tileLayer);
            }
            this._layers[index] = value;
            if (value && value.tileLayer) {
                value.tileLayer.addTo(window.map);
            }
        },
        getLength: function() {
            return this._layers.length;
        },
        clear: function() {
            for (var i = 0; i < this._layers.length; i++) {
                var layer = this._layers[i];
                if (layer && layer.tileLayer) {
                    window.map.removeLayer(layer.tileLayer);
                }
            }
            this._layers = [];
        }
    }
};

// Marker class
window.google.maps.Marker = function(options) {
    this._position = options && options.position ? options.position : null;
    this._map = options && options.map ? options.map : null;
    this._icon = options && options.icon ? options.icon : null;
    
    var markerOptions = {};
    
    if (options && options.icon) {
        if (typeof options.icon === 'string') {
            markerOptions.icon = L.icon({
                iconUrl: options.icon,
                iconSize: [25, 41],
                iconAnchor: [12, 41]
            });
        } else if (options.icon.url) {
            markerOptions.icon = L.icon({
                iconUrl: options.icon.url,
                iconSize: options.icon.size ? [options.icon.size.width, options.icon.size.height] : [25, 41],
                iconAnchor: options.icon.anchor ? [options.icon.anchor.x, options.icon.anchor.y] : [12, 41]
            });
        }
    }
    
    if (options && options.map && options.position) {
        this._leafletMarker = L.marker(options.position, markerOptions).addTo(options.map);
    }
};

window.google.maps.Marker.prototype = {
    setPosition: function(latLng) {
        this._position = latLng;
        if (this._leafletMarker) {
            this._leafletMarker.setLatLng(latLng);
        }
    },
    
    getPosition: function() {
        return this._position;
    },
    
    setMap: function(map) {
        if (this._leafletMarker) {
            if (!map) {
                this._map = null;
                this._leafletMarker.remove();
            } else {
                this._map = map;
                this._leafletMarker.addTo(map);
            }
        } else if (map && this._position) {
            this._map = map;
            this._leafletMarker = L.marker(this._position).addTo(map);
        }
    },
    
    setIcon: function(icon) {
        if (icon) {
            var leafletIcon;
            if (typeof icon === 'string') {
                leafletIcon = L.icon({
                    iconUrl: icon,
                    iconSize: [25, 41],
                    iconAnchor: [12, 41]
                });
            } else if (icon.url) {
                leafletIcon = L.icon({
                    iconUrl: icon.url,
                    iconSize: icon.size ? [icon.size.width, icon.size.height] : [25, 41],
                    iconAnchor: icon.anchor ? [icon.anchor.x, icon.anchor.y] : [12, 41]
                });
            }
            
            if (leafletIcon && this._leafletMarker) {
                this._leafletMarker.setIcon(leafletIcon);
            }
        }
    }
};

// InfoWindow class
window.google.maps.InfoWindow = function(options) {
    this._content = options && options.content ? options.content : '';
    this._leafletPopup = L.popup();
    if (options && options.content) {
        this._leafletPopup.setContent(options.content);
    }
};

window.google.maps.InfoWindow.prototype = {
    setContent: function(content) {
        this._content = content;
        this._leafletPopup.setContent(content);
    },
    
    open: function(map, marker) {
        if (marker && marker._leafletMarker) {
            marker._leafletMarker.bindPopup(this._content).openPopup();
        } else if (map) {
            this._leafletPopup.setContent(this._content);
            this._leafletPopup.openOn(map);
        }
    },
    
    close: function() {
        if (this._leafletPopup._map) {
            this._leafletPopup._map.closePopup(this._leafletPopup);
        }
    }
};

// Event handling
window.google.maps.event = {
    addListener: function(instance, eventName, handler) {
        if (eventName === 'tilesloaded' && instance === window.map) {
            window.google.maps._tileListeners.push(handler);
            // Call the handler soon if map is already loaded
            if (window.map && window.map._loaded) {
                setTimeout(handler, 500);
            }
            return { remove: function() {} };
        } else if (instance === window.map) {
            // Map events
            var leafletEvent = eventName;
            switch(eventName) {
                case 'bounds_changed': leafletEvent = 'moveend'; break;
                case 'center_changed': leafletEvent = 'move'; break;
                case 'zoom_changed': leafletEvent = 'zoomend'; break;
                case 'dragend': leafletEvent = 'dragend'; break;
                case 'click': leafletEvent = 'click'; break;
                case 'rightclick': leafletEvent = 'contextmenu'; break;
            }
            
            var listener = window.map.on(leafletEvent, handler);
            var id = Math.random().toString(36).substr(2, 9);
            window.google.maps._eventListeners[id] = { instance: instance, leafletEvent: leafletEvent, handler: handler, listener: listener };
            
            return { remove: function() { 
                window.google.maps.event.removeListener(id);
            }};
        } else if (instance && instance._leafletMarker) {
            // Marker events
            var leafletEvent = eventName;
            switch(eventName) {
                case 'click': leafletEvent = 'click'; break;
                case 'dragend': leafletEvent = 'dragend'; break;
                case 'position_changed': return { remove: function() {} }; // Not directly supported
            }
            
            var listener = instance._leafletMarker.on(leafletEvent, handler);
            var id = Math.random().toString(36).substr(2, 9);
            window.google.maps._eventListeners[id] = { instance: instance, leafletEvent: leafletEvent, handler: handler, listener: listener };
            
            return { remove: function() { 
                window.google.maps.event.removeListener(id);
            }};
        }
        
        return { remove: function() {} };
    },
    
    addListenerOnce: function(instance, eventName, handler) {
        if (eventName === 'tilesloaded' && instance === window.map) {
            if (window.map && window.map._loaded) {
                setTimeout(handler, 500);
            } else {
                var wrapperHandler = function() {
                    handler();
                    if (window.google.maps._tileListeners) {
                        var index = window.google.maps._tileListeners.indexOf(wrapperHandler);
                        if (index !== -1) {
                            window.google.maps._tileListeners.splice(index, 1);
                        }
                    }
                };
                window.google.maps._tileListeners.push(wrapperHandler);
            }
            return { remove: function() {} };
        }
        
        return this.addListener(instance, eventName, function onceHandler() {
            handler();
            window.google.maps.event.removeListener(onceHandler);
        });
    },
    
    clearListeners: function(instance, eventName) {
        if (instance === window.map && eventName === 'tilesloaded') {
            window.google.maps._tileListeners = [];
        }
        
        // Remove all listeners for this instance and event
        for (var id in window.google.maps._eventListeners) {
            var listenerData = window.google.maps._eventListeners[id];
            if (listenerData.instance === instance) {
                if (!eventName || listenerData.leafletEvent === eventName) {
                    if (listenerData.instance === window.map) {
                        window.map.off(listenerData.leafletEvent, listenerData.handler);
                    } else if (listenerData.instance._leafletMarker) {
                        listenerData.instance._leafletMarker.off(listenerData.leafletEvent, listenerData.handler);
                    }
                    delete window.google.maps._eventListeners[id];
                }
            }
        }
    },
    
    removeListener: function(id) {
        var listenerData = window.google.maps._eventListeners[id];
        if (listenerData) {
            if (listenerData.instance === window.map) {
                window.map.off(listenerData.leafletEvent, listenerData.handler);
            } else if (listenerData.instance._leafletMarker) {
                listenerData.instance._leafletMarker.off(listenerData.leafletEvent, listenerData.handler);
            }
            delete window.google.maps._eventListeners[id];
        }
    }
};

// Constants
window.google.maps.MapTypeId = {
    ROADMAP: 'osm',
    SATELLITE: 'satellite',
    HYBRID: 'satellite', // Just use satellite for hybrid
    TERRAIN: 'terrain'
};

// ImageMapType for tile layers
window.google.maps.ImageMapType = function(options) {
    this.name = options.name || '';
    this.alt = options.alt || '';
    this.minZoom = options.minZoom || 0;
    this.maxZoom = options.maxZoom || 18;
    this.getTileUrl = options.getTileUrl;
    this.tileSize = options.tileSize;
    
    // Copy any ext_* properties
    for (var key in options) {
        if (key.startsWith('ext_')) {
            this[key] = options[key];
        }
    }
    
    // Create Leaflet tile layer
    this.tileLayer = L.tileLayer('', {
        minZoom: this.minZoom,
        maxZoom: this.maxZoom,
        tileSize: this.tileSize ? this.tileSize.width : 256,
        opacity: 0.8,
        attribution: 'Safecast'
    });
    
    // Override the createTile method to use getTileUrl
    var self = this;
    this.tileLayer.createTile = function(coords) {
        var tile = document.createElement('img');
        tile.src = self.getTileUrl(coords);
        tile.alt = '';
        return tile;
    };
};

// MVCArray for layer management
window.google.maps.MVCArray = function() {
    this._array = [];
};

window.google.maps.MVCArray.prototype = {
    clear: function() {
        this._array = [];
    },
    
    getLength: function() {
        return this._array.length;
    },
    
    getAt: function(index) {
        return this._array[index];
    },
    
    setAt: function(index, value) {
        this._array[index] = value;
    },
    
    push: function(value) {
        this._array.push(value);
    }
};

// Geocoder (simple stub)
window.google.maps.Geocoder = function() {};
window.google.maps.Geocoder.prototype.geocode = function(request, callback) {
    // Use Nominatim API for geocoding
    var apiUrl = "https://nominatim.openstreetmap.org/search?format=json&limit=1&q=";
    
    if (request.address) {
        var xhr = new XMLHttpRequest();
        xhr.open('GET', apiUrl + encodeURIComponent(request.address), true);
        xhr.setRequestHeader('Accept', 'application/json');
        
        xhr.onload = function() {
            if (xhr.status === 200) {
                var response = JSON.parse(xhr.responseText);
                if (response && response.length > 0) {
                    var result = [{
                        geometry: {
                            location: L.latLng(response[0].lat, response[0].lon)
                        },
                        formatted_address: response[0].display_name
                    }];
                    callback(result, 'OK');
                } else {
                    callback([], 'ZERO_RESULTS');
                }
            } else {
                callback([], 'ERROR');
            }
        };
        
        xhr.onerror = function() {
            callback([], 'ERROR');
        };
        
        xhr.send();
    } else {
        callback([], 'INVALID_REQUEST');
    }
};

console.log("Google Maps to Leaflet bridge initialized"); 