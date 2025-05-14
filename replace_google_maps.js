// replace_google_maps.js - Simple Google Maps to Leaflet bridge
// This creates a minimal shim to replace Google Maps with Leaflet/OpenStreetMap

// Create google namespace
window.google = window.google || {};
window.google.maps = window.google.maps || {};

// Fix for loading spinner and initialization
document.addEventListener('DOMContentLoaded', function() {
    // Set OpenStreetMap preference
    localStorage.setItem("PREF_BASEMAP_UIDX", 9);
    
    // Initialize quickly
    if (window._ls) {
        window._ls.gmaps = true;
        if (typeof FinishLoadIfPossible === 'function') {
            FinishLoadIfPossible();
        }
    }
});

// Initialize map when this script loads
function initLeafletMap() {
    console.log("Initializing Leaflet map");
    
    // Make sure map_canvas exists
    var mapCanvas = document.getElementById('map_canvas');
    if (!mapCanvas) {
        console.error("map_canvas element not found");
        return;
    }
    
    // Create the map
    window.map = L.map('map_canvas', {
        center: [37.316113, 140.515516],
        zoom: 9,
        zoomControl: true
    });
    
    // Add OpenStreetMap tiles
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
        maxZoom: 19,
        attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
    }).addTo(window.map);
    
    // Add event listener for saving the position
    window.map.on('moveend', function() {
        var center = window.map.getCenter();
        var zoom = window.map.getZoom();
        
        localStorage.setItem("PREF_VISIBLE_EXTENT_Y", center.lat);
        localStorage.setItem("PREF_VISIBLE_EXTENT_X", center.lng);
        localStorage.setItem("PREF_VISIBLE_EXTENT_Z", zoom);
        
        if (window.SafemapExtent && typeof window.SafemapExtent.OnChange === 'function') {
            window.SafemapExtent.OnChange(0);
        }
    });
    
    // Remove loading spinner if it exists
    setTimeout(function() {
        var spinner = document.getElementById('div_sc_ls_wb');
        if (spinner && spinner.parentNode) {
            spinner.parentNode.removeChild(spinner);
        }
    }, 1000);
    
    console.log("Leaflet map created");
    
    // Trigger tilesloaded event for any listeners
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
    }, 1500);
}

// Initialize immediately if possible
if (document.readyState === 'complete' || document.readyState === 'interactive') {
    setTimeout(initLeafletMap, 100);
} else {
    // Wait for the DOM to be ready
    document.addEventListener('DOMContentLoaded', function() {
        setTimeout(initLeafletMap, 100);
    });
}

// Map class stub
window.google.maps.Map = function(element, options) {
    if (!window.map && element) {
        initLeafletMap();
    }
    return window.map;
};

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

// Basic map methods
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
        return window.map ? window.map.getCenter() : null;
    },
    
    getBounds: function() {
        return window.map ? window.map.getBounds() : null;
    },
    
    panTo: function(latLng) {
        if (window.map) window.map.panTo(latLng);
    },
    
    setMapTypeId: function() {
        // Just use OpenStreetMap
    },
    
    overlayMapTypes: {
        push: function() {},
        getAt: function() { return null; },
        setAt: function() {},
        getLength: function() { return 0; },
        clear: function() {}
    }
};

// Marker class
window.google.maps.Marker = function(options) {
    this._position = options && options.position ? options.position : null;
    this._map = options && options.map ? options.map : null;
    this._icon = options && options.icon ? options.icon : null;
    
    if (options && options.map && options.position) {
        this._leafletMarker = L.marker(options.position).addTo(options.map);
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
    }
};

// InfoWindow class
window.google.maps.InfoWindow = function(options) {
    this._content = options && options.content ? options.content : '';
    this._leafletPopup = L.popup();
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

// Track tile loading event listeners
window.google.maps._tileListeners = [];

// Event handling
window.google.maps.event = {
    addListener: function(instance, eventName, handler) {
        if (eventName === 'tilesloaded' && instance === window.map) {
            window.google.maps._tileListeners.push(handler);
            // Call the handler soon if map is already loaded
            if (window.map) {
                setTimeout(handler, 500);
            }
        }
        return { remove: function() {} };
    },
    
    addListenerOnce: function(instance, eventName, handler) {
        if (eventName === 'tilesloaded' && instance === window.map) {
            if (window.map) {
                setTimeout(handler, 500);
            } else {
                window.google.maps._tileListeners.push(handler);
            }
        }
        return { remove: function() {} };
    },
    
    clearListeners: function() {
        window.google.maps._tileListeners = [];
    },
    
    removeListener: function() {}
};

// Constants
window.google.maps.MapTypeId = {
    ROADMAP: 'roadmap',
    SATELLITE: 'satellite',
    HYBRID: 'hybrid',
    TERRAIN: 'terrain'
};

// ImageMapType for tile layers
window.google.maps.ImageMapType = function(options) {
    this.getTileUrl = options.getTileUrl;
    this.tileSize = options.tileSize;
    this.name = options.name || '';
    this.alt = options.alt || '';
    this.minZoom = options.minZoom || 0;
    this.maxZoom = options.maxZoom || 18;
    
    // Copy any ext_* properties
    for (var key in options) {
        if (key.startsWith('ext_')) {
            this[key] = options[key];
        }
    }
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

console.log("Google Maps to Leaflet bridge initialized"); 