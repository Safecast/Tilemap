// leaflet-safecast.js - Native Leaflet implementation for Safecast Tilemap
// This provides a direct implementation using Leaflet and OpenStreetMap with no Google Maps dependencies

// Global variables
var map = null;
var radiationLayer = null;
var cosmicLayer = null;
var basemapLayers = {};
var overlayLayers = {};
var slideout = null;
var _hudProxy = null;
var _bvProxy = null;
var _flyToExtentProxy = null;

// Initialize the map when the document is ready
document.addEventListener('DOMContentLoaded', function() {
    console.log("Initializing Safecast with native Leaflet");
    
    // Add necessary styles
    if (!document.querySelector('link[href*="leaflet.css"]')) {
        var leafletStyles = document.createElement('link');
        leafletStyles.rel = 'stylesheet';
        leafletStyles.href = 'https://unpkg.com/leaflet@1.9.4/dist/leaflet.css';
        document.head.appendChild(leafletStyles);
    }
    
    // Load Leaflet script if not already loaded
    if (typeof L === 'undefined') {
        var leafletScript = document.createElement('script');
        leafletScript.src = 'https://unpkg.com/leaflet@1.9.4/dist/leaflet.js';
        leafletScript.onload = initMap;
        document.head.appendChild(leafletScript);
    } else {
        initMap();
    }
});

function initMap() {
    console.log("Setting up Leaflet map");
    
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
    map = L.map('map_canvas', {
        center: [defaultLat, defaultLng],
        zoom: defaultZoom,
        zoomControl: localStorage.getItem("PREF_ZOOM_BUTTONS_ENABLED") !== "false",
        attributionControl: true,
        minZoom: 2,
        maxZoom: 19,
        zoomSnap: 0.25,
        wheelPxPerZoomLevel: 120
    });
    
    // Position zoom control away from menu button
    if (map.zoomControl) {
        map.zoomControl.setPosition('bottomright');
    }
    
    // Initialize base layers
    initBasemaps();
    
    // Add Safecast radiation tile layer
    radiationLayer = L.tileLayer('http://localhost:8010/s3-tiles/t/{z}/{x}/{y}.png', {
        maxZoom: 19,
        opacity: 0.8,
        attribution: '&copy; <a href="https://safecast.org">Safecast</a>'
    }).addTo(map);
    
    // Add cosmic radiation layer if available
    cosmicLayer = L.tileLayer('http://localhost:8010/TilesOutput/{z}/{x}/{y}.png', {
        maxZoom: 14,
        opacity: 0.8,
        attribution: 'Cosmic Radiation &copy; <a href="https://safecast.org">Safecast</a>'
    });
    
    // Store available overlay layers
    overlayLayers = {
        'radiation': radiationLayer,
        'cosmic': cosmicLayer
    };
    
    // Set up events
    initMapEvents();
    
    // Set up UI components
    initUI();
    
    // Ensure menu icon is always visible
    ensureMenuVisibility();
    
    // Trigger initialization signals
    if (window._ls) {
        window._ls.gmaps = true;
        if (typeof window.FinishLoadIfPossible === 'function') {
            window.FinishLoadIfPossible();
        }
    }
    
    console.log("Leaflet map initialized");
}

function initBasemaps() {
    // Create base layer options
    basemapLayers = {
        'osm': L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
            maxZoom: 19,
            attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
        }),
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
    
    // Add the default basemap (OpenStreetMap)
    basemapLayers['osm'].addTo(map);
}

function initMapEvents() {
    // Add event listener for saving the position
    map.on('moveend', function() {
        var center = map.getCenter();
        var zoom = map.getZoom();
        
        localStorage.setItem("PREF_VISIBLE_EXTENT_Y", center.lat);
        localStorage.setItem("PREF_VISIBLE_EXTENT_X", center.lng);
        localStorage.setItem("PREF_VISIBLE_EXTENT_Z", zoom);
        
        // Notify the Safecast app of the change
        if (window.SafemapExtent && typeof window.SafemapExtent.OnChange === 'function') {
            window.SafemapExtent.OnChange(1); // 1 = DragEnd event
        }
        
        // Ensure menu is still visible after map movement
        ensureMenuVisibility();
    });
    
    // Add zoom event listener
    map.on('zoomend', function() {
        // Notify the Safecast app of the change
        if (window.SafemapExtent && typeof window.SafemapExtent.OnChange === 'function') {
            window.SafemapExtent.OnChange(0); // 0 = ZoomChanged event
        }
        
        // Ensure menu is still visible after zoom
        ensureMenuVisibility();
    });
    
    // Add right-click context menu handler
    map.on('contextmenu', function(e) {
        // Show context menu at click position
        showContextMenu(e);
    });
    
    // Add event listener to ensure menu visibility
    map.on('layeradd', ensureMenuVisibility);
    map.on('layerremove', ensureMenuVisibility);
}

function ensureMenuVisibility() {
    // Make sure the menu button stays visible
    var logoElement = document.getElementById('logo2');
    if (logoElement) {
        logoElement.style.visibility = 'visible';
        logoElement.style.opacity = '1';
        
        // Force repaint to ensure visibility
        logoElement.style.display = 'none';
        logoElement.offsetHeight; // Force reflow
        logoElement.style.display = '';
    }
}

function initUI() {
    // Show UI elements that might be hidden
    setTimeout(function() {
        var menuElement = document.getElementById('menu');
        if (menuElement) menuElement.style.display = "";
        
        var logoElement = document.getElementById('logo2');
        if (logoElement) {
            logoElement.style.visibility = "visible";
            logoElement.style.opacity = "1";
        }
        
        // Make sure the slideout menu works
        if (window.slideout) {
            window.slideout.panel = document.querySelector('.slideout-panel');
            window.slideout.menu = document.querySelector('.slideout-menu');
        }
        
        // Make sure the scale shows up
        var scaleElement = document.getElementById('scale');
        if (scaleElement) {
            scaleElement.style.display = "block";
        }
        
        // Remove loading spinner if present
        var spinner = document.getElementById('div_sc_ls_wb');
        if (spinner && spinner.parentNode) {
            spinner.parentNode.removeChild(spinner);
        }
        
        // Add legend
        setupLegend();
        
        // Add scale control
        L.control.scale({position: 'bottomleft'}).addTo(map);
        
        // Add custom layer control instead of built-in control
        // This helps avoid conflicts with the Safecast UI
        setupCustomLayerControl();
    }, 500);
}

function setupCustomLayerControl() {
    // We don't add the built-in layer control since we're using Safecast's UI
    // Instead, just ensure our layer toggles work with the UI
    
    var radiationCheck = document.getElementById('chkMenuRadiation');
    if (radiationCheck) {
        radiationCheck.checked = map.hasLayer(radiationLayer);
        radiationCheck.addEventListener('change', function() {
            if (this.checked) {
                if (!map.hasLayer(radiationLayer)) {
                    radiationLayer.addTo(map);
                }
            } else {
                if (map.hasLayer(radiationLayer)) {
                    map.removeLayer(radiationLayer);
                }
            }
        });
    }
    
    var cosmicCheck = document.getElementById('chkMenuCosmic');
    if (cosmicCheck) {
        cosmicCheck.checked = map.hasLayer(cosmicLayer);
        cosmicCheck.addEventListener('change', function() {
            if (this.checked) {
                if (!map.hasLayer(cosmicLayer)) {
                    cosmicLayer.addTo(map);
                }
            } else {
                if (map.hasLayer(cosmicLayer)) {
                    map.removeLayer(cosmicLayer);
                }
            }
        });
    }
}

function setupLegend() {
    // Create a legend control
    var legend = L.control({position: 'bottomright'});
    
    legend.onAdd = function(map) {
        var div = L.DomUtil.create('div', 'map_legend');
        div.innerHTML = '<h4>Radiation Levels</h4>';
        
        // Define colors based on original Safecast scale
        var colors = [
            {color: 'rgb(49, 243, 255)', label: '0.03-0.05 µSv/h'},
            {color: 'rgb(16, 181, 255)', label: '0.05-0.08 µSv/h'},
            {color: 'rgb(12, 92, 212)', label: '0.08-0.12 µSv/h'},
            {color: 'rgb(89, 0, 170)', label: '0.12-0.16 µSv/h'},
            {color: 'rgb(197, 0, 197)', label: '0.16-0.23 µSv/h'},
            {color: 'rgb(255, 0, 152)', label: '0.23-0.31 µSv/h'},
            {color: 'rgb(255, 0, 72)', label: '0.31-0.43 µSv/h'},
            {color: 'rgb(255, 0, 0)', label: '0.43-0.60 µSv/h'}
        ];
        
        // Add legend items
        for (var i = 0; i < colors.length; i++) {
            div.innerHTML += 
                '<div><span style="background:' + 
                colors[i].color + '; width: 20px; height: 20px; display: inline-block; margin-right: 5px;"></span>' + 
                colors[i].label + '</div>';
        }
        
        // Add close button
        var closeButton = L.DomUtil.create('div', 'legend-close');
        closeButton.innerHTML = 'X';
        closeButton.style.position = 'absolute';
        closeButton.style.top = '5px';
        closeButton.style.right = '5px';
        closeButton.style.cursor = 'pointer';
        
        closeButton.onclick = function() {
            map.removeControl(legend);
        };
        
        div.appendChild(closeButton);
        
        // Apply styling to ensure proper background
        div.style.background = 'white';
        div.style.padding = '10px';
        div.style.borderRadius = '5px';
        div.style.boxShadow = '0 0 15px rgba(0,0,0,0.2)';
        div.style.opacity = '0.9';
        div.style.maxWidth = '240px';
        
        return div;
    };
    
    // Add the legend to the map
    legend.addTo(map);
}

function showContextMenu(e) {
    // Create context menu if it doesn't exist
    var contextMenu = document.getElementById('contextMenu');
    if (!contextMenu) {
        contextMenu = document.createElement('ul');
        contextMenu.id = 'contextMenu';
        contextMenu.style.display = 'none';
        contextMenu.innerHTML = '<li><a href="#apiQuery" class="FuturaFont">Query Safecast API Here</a></li>'
                            + '<li class="separator"></li>'
                            + '<li><a href="#zoomIn" class="FuturaFont">Zoom In</a></li>'
                            + '<li><a href="#zoomOut" class="FuturaFont">Zoom Out</a></li>'
                            + '<li><a href="#centerHere" class="FuturaFont">Center Map Here</a></li>';
        document.getElementById('map_canvas').appendChild(contextMenu);
        
        // Apply styles to make sure context menu looks good
        contextMenu.style.background = 'white';
        contextMenu.style.border = '1px solid #ccc';
        contextMenu.style.borderRadius = '4px';
        contextMenu.style.padding = '5px 0';
        contextMenu.style.position = 'absolute';
        contextMenu.style.zIndex = '1002';
        contextMenu.style.boxShadow = '0 2px 5px rgba(0,0,0,0.3)';
        
        // Add event listeners for menu items
        var links = contextMenu.getElementsByTagName('a');
        for (var i = 0; i < links.length; i++) {
            links[i].addEventListener('click', handleContextMenuAction);
            links[i].style.textDecoration = 'none';
            links[i].style.color = '#333';
            links[i].style.display = 'block';
            links[i].style.padding = '5px 10px';
            
            links[i].parentNode.style.listStyle = 'none';
            links[i].parentNode.style.cursor = 'pointer';
            
            links[i].parentNode.addEventListener('mouseover', function() {
                this.style.backgroundColor = '#f0f0f0';
            });
            
            links[i].parentNode.addEventListener('mouseout', function() {
                this.style.backgroundColor = '';
            });
        }
        
        // Style separator
        var separator = contextMenu.querySelector('.separator');
        if (separator) {
            separator.style.borderTop = '1px solid #ccc';
            separator.style.margin = '5px 0';
            separator.style.padding = '0';
        }
    }
    
    // Store click position
    contextMenu._latlng = e.latlng;
    
    // Position and show menu
    var x = e.containerPoint.x;
    var y = e.containerPoint.y;
    
    // Adjust position if too close to edge
    var mapDiv = document.getElementById('map_canvas');
    if (x > mapDiv.offsetWidth - contextMenu.offsetWidth) {
        x -= contextMenu.offsetWidth;
    }
    if (y > mapDiv.offsetHeight - contextMenu.offsetHeight) {
        y -= contextMenu.offsetHeight;
    }
    
    contextMenu.style.left = x + 'px';
    contextMenu.style.top = y + 'px';
    contextMenu.style.display = 'block';
    
    // Add click handler to close menu when clicking elsewhere
    setTimeout(function() {
        document.addEventListener('click', hideContextMenu);
    }, 0);
    
    // Ensure menu is still visible
    ensureMenuVisibility();
}

function hideContextMenu() {
    var contextMenu = document.getElementById('contextMenu');
    if (contextMenu) {
        contextMenu.style.display = 'none';
    }
    document.removeEventListener('click', hideContextMenu);
}

function handleContextMenuAction(e) {
    e.preventDefault();
    
    var contextMenu = document.getElementById('contextMenu');
    var action = this.getAttribute('href').substr(1);
    var latlng = contextMenu._latlng;
    
    switch (action) {
        case 'zoomIn':
            map.setZoom(map.getZoom() + 3);
            map.panTo(latlng);
            break;
        case 'zoomOut':
            map.setZoom(map.getZoom() - 3);
            map.panTo(latlng);
            break;
        case 'centerHere':
            map.panTo(latlng);
            break;
        case 'apiQuery':
            if (window.SafemapUI && typeof window.SafemapUI.QuerySafecastApiAsync === 'function') {
                window.SafemapUI.QuerySafecastApiAsync(latlng.lat, latlng.lng, map.getZoom());
            }
            break;
    }
    
    hideContextMenu();
    ensureMenuVisibility();
    return false;
}

// Geocoding function
function geocodeAddress(address, callback) {
    // Use Nominatim API for geocoding
    var apiUrl = "https://nominatim.openstreetmap.org/search?format=json&limit=1&q=";
    
    var xhr = new XMLHttpRequest();
    xhr.open('GET', apiUrl + encodeURIComponent(address), true);
    xhr.setRequestHeader('Accept', 'application/json');
    
    xhr.onload = function() {
        if (xhr.status === 200) {
            var response = JSON.parse(xhr.responseText);
            if (response && response.length > 0) {
                var result = {
                    latlng: L.latLng(response[0].lat, response[0].lon),
                    address: response[0].display_name
                };
                callback(result, true);
            } else {
                callback(null, false);
            }
        } else {
            callback(null, false);
        }
    };
    
    xhr.onerror = function() {
        callback(null, false);
    };
    
    xhr.send();
}

// Functions to be called from the original Safecast code
window.SafecastMap = {
    // Function to change basemap
    setMapType: function(mapTypeId) {
        if (basemapLayers[mapTypeId]) {
            // Remove all base layers
            Object.keys(basemapLayers).forEach(function(key) {
                if (map.hasLayer(basemapLayers[key])) {
                    map.removeLayer(basemapLayers[key]);
                }
            });
            
            // Add the selected base layer
            basemapLayers[mapTypeId].addTo(map);
            
            // Ensure menu is still visible
            ensureMenuVisibility();
        }
    },
    
    // Function to handle geocoding
    geocodeAddress: function(address) {
        geocodeAddress(address, function(result, success) {
            if (success) {
                map.setView(result.latlng, 15);
                // Optionally show a popup
                L.popup()
                    .setLatLng(result.latlng)
                    .setContent('<div>' + result.address + '</div>')
                    .openOn(map);
                
                // Ensure menu is still visible
                ensureMenuVisibility();
            } else {
                alert('Address not found');
            }
        });
    },
    
    // Function to set radiation layer visibility
    setRadiationLayerVisible: function(visible) {
        if (visible) {
            if (!map.hasLayer(radiationLayer)) {
                radiationLayer.addTo(map);
            }
        } else {
            if (map.hasLayer(radiationLayer)) {
                map.removeLayer(radiationLayer);
            }
        }
        // Ensure menu is still visible
        ensureMenuVisibility();
    },
    
    // Function to set cosmic layer visibility
    setCosmicLayerVisible: function(visible) {
        if (visible) {
            if (!map.hasLayer(cosmicLayer)) {
                cosmicLayer.addTo(map);
            }
        } else {
            if (map.hasLayer(cosmicLayer)) {
                map.removeLayer(cosmicLayer);
            }
        }
        // Ensure menu is still visible
        ensureMenuVisibility();
    },
    
    // Add the crosshair functionality
    toggleCrosshair: function(enabled) {
        // Create a crosshair element if it doesn't exist
        var crosshair = document.getElementById('map-crosshair');
        
        if (!crosshair && enabled) {
            // Create the crosshair element
            crosshair = document.createElement('div');
            crosshair.id = 'map-crosshair';
            crosshair.style.position = 'absolute';
            crosshair.style.top = '50%';
            crosshair.style.left = '50%';
            crosshair.style.width = '20px';
            crosshair.style.height = '20px';
            crosshair.style.marginLeft = '-10px';
            crosshair.style.marginTop = '-10px';
            crosshair.style.zIndex = '1000';
            crosshair.style.pointerEvents = 'none';
            
            // Create a simple crosshair using CSS
            crosshair.innerHTML = '<div style="position:absolute;top:9px;left:0;width:20px;height:2px;background-color:rgba(255,0,0,0.7);"></div>' +
                                 '<div style="position:absolute;top:0;left:9px;width:2px;height:20px;background-color:rgba(255,0,0,0.7);"></div>';
            
            document.getElementById('map_canvas').appendChild(crosshair);
        } else if (crosshair && !enabled) {
            // Remove the crosshair element
            crosshair.parentNode.removeChild(crosshair);
        }
        
        // Store preference in localStorage
        localStorage.setItem('PREF_CROSSHAIR_ENABLED', enabled ? 'true' : 'false');
        
        // Update the UI checkbox
        var checkbox = document.getElementById('chkMenuToggleReticle');
        if (checkbox) {
            checkbox.checked = enabled;
        }
    }
}; 