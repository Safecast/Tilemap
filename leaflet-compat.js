/**
 * Leaflet compatibility layer for Google Maps API
 * This provides stubs for Google Maps API functions used by the Safecast code
 */

// Only define google if it's not already defined
if (typeof google === 'undefined') {
    window.google = {
        maps: {
            // Control positions
            ControlPosition: {
                RIGHT_BOTTOM: 'bottomright',
                TOP_RIGHT: 'topright'
            },
            
            // Map type control styles
            MapTypeControlStyle: {
                DEFAULT: 'default',
                DROPDOWN_MENU: 'dropdown'
            },
            
            // Navigation control styles
            NavigationControlStyle: {
                DEFAULT: 0,
                ANDROID: 2,
                SMALL: 3,
                ZOOM_PAN: 4,
                ZOOM_PAN_HORIZONTAL: 5,
                ZOOM_PAN_VERTICAL: 6,
                ZOOM_ONLY: 7
            },
            
            // Map types
            MapTypeId: {
                ROADMAP: 'roadmap',
                SATELLITE: 'satellite',
                HYBRID: 'hybrid',
                TERRAIN: 'terrain'
            },
            
            // Geocoder status
            GeocoderStatus: {
                OK: 'OK',
                ZERO_RESULTS: 'ZERO_RESULTS',
                OVER_QUERY_LIMIT: 'OVER_QUERY_LIMIT',
                REQUEST_DENIED: 'REQUEST_DENIED',
                INVALID_REQUEST: 'INVALID_REQUEST',
                UNKNOWN_ERROR: 'UNKNOWN_ERROR'
            },
            
            // Event namespace
            event: {
                addListener: function(instance, eventName, handler) {
                    if (instance.on) {
                        instance.on(eventName, handler);
                    }
                },
                clearInstanceListeners: function(instance) {
                    if (instance.off) {
                        instance.off();
                    }
                }
            },
            
            // Stub for LatLng
            LatLng: function(lat, lng) {
                return L.latLng(lat, lng);
            },
            
            // Stub for Size
            Size: function(width, height) {
                return { width: width, height: height };
            },
            
            // Stub for Point
            Point: function(x, y) {
                return { x: x, y: y };
            },
            
            // Stub for Map
            Map: function(element, options) {
                // Create a Leaflet map
                var map = L.map(element, {
                    zoom: options.zoom,
                    center: [options.center.lat(), options.center.lng()],
                    zoomControl: false, // We'll add this manually
                    attributionControl: false
                });

                // Add default tile layer
                L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
                    attribution: '© OpenStreetMap contributors',
                    maxZoom: 21
                }).addTo(map);

                // Add zoom control if enabled
                if (options.zoomControl !== false) {
                    L.control.zoom({
                        position: options.zoomControlOptions?.position || 'topright'
                    }).addTo(map);
                }


                // Add methods expected by the Google Maps API
                map.getCenter = function() {
                    var center = this.getCenter();
                    return new google.maps.LatLng(center.lat, center.lng);
                };

                map.getZoom = function() {
                    return this.getZoom();
                };

                map.setCenter = function(latLng) {
                    if (latLng && typeof latLng.lat === 'function') {
                        this.setView([latLng.lat(), latLng.lng()], this.getZoom());
                    } else if (latLng && typeof latLng.lat === 'number') {
                        this.setView([latLng.lat, latLng.lng], this.getZoom());
                    }
                };

                map.setZoom = function(zoom) {
                    this.setZoom(zoom);
                };

                // Add street view control if enabled
                if (options.streetViewControl) {
                    // This is a placeholder - Leaflet doesn't have street view
                    // but we'll add a button that shows coordinates
                    var streetViewControl = L.control({position: 'bottomright'});
                    streetViewControl.onAdd = function() {
                        var div = L.DomUtil.create('div', 'leaflet-bar leaflet-control');
                        div.innerHTML = '<a href="#" title="Street View">SV</a>';
                        return div;
                    };
                    streetViewControl.addTo(map);
                }


                return map;
            },
            
            // Stub for Marker
            Marker: function(options) {
                console.log("Marker created with options:", options);
                if (!options) {
                    console.warn("Marker called without options, using default empty object.");
                    options = {};
                }

                // Default position
                var lat = 0, lng = 0;
                if (options.position) {
                    if (typeof options.position.lat === 'function') {
                        lat = options.position.lat();
                        lng = options.position.lng();
                    } else {
                        lat = options.position.lat;
                        lng = options.position.lng;
                    }
                } else {
                    console.warn("Marker created without a valid position, using (0,0)");
                }

                // Determine radiation level and color (Safecast legend)
                let usvh = 0, cpm = 0, markerColor = '#31f3ff';
                if (options.data) {
                    if (typeof options.data.usvh === 'number') usvh = options.data.usvh;
                    if (typeof options.data.cpm === 'number') cpm = options.data.cpm;
                    // Safecast color legend
                    if (usvh >= 2.13) markerColor = '#ffa500'; // orange
                    else if (usvh >= 1.31) markerColor = '#ff4500'; // orange-red
                    else if (usvh >= 0.87) markerColor = '#ff007f'; // pink
                    else if (usvh >= 0.60) markerColor = '#ff69b4'; // hot pink
                    else if (usvh >= 0.43) markerColor = '#c800c8'; // purple
                    else if (usvh >= 0.31) markerColor = '#ad7fd9'; // light purple
                    else if (usvh >= 0.23) markerColor = '#00ffff'; // cyan
                    else if (usvh >= 0.16) markerColor = '#00bfff'; // deep sky blue
                    else if (usvh >= 0.12) markerColor = '#0064ff'; // blue
                    else if (usvh >= 0.08) markerColor = '#0000cd'; // medium blue
                    else if (usvh >= 0.05) markerColor = '#00008b'; // dark blue
                    else if (usvh >= 0.03) markerColor = '#320064'; // indigo
                    else markerColor = '#31f3ff'; // very light blue
                }

                // Create custom spot icon
                const icon = L.divIcon({
                    html: `<div style="background-color: ${markerColor}; width: 14px; height: 14px; border-radius: 50%; border: 2px solid #fff; box-shadow: 0 0 2px #0006;"></div>`,
                    className: '',
                    iconSize: [18, 18],
                    iconAnchor: [9, 9]
                });

                var marker = L.marker([lat, lng], { icon: icon, title: options.title });

                // Add popup with data
                if (options.data) {
                    marker.bindPopup(
                        `<b>μSv/h:</b> ${usvh.toFixed(3)}<br><b>CPM:</b> ${cpm}`
                    );
                }

                if (options.map) {
                    marker.addTo(options.map);
                }

                // Add Google Maps API compatibility methods
                marker.setPosition = function(latLng) {
                    if (latLng && typeof latLng.lat === 'function') {
                        this.setLatLng([latLng.lat(), latLng.lng()]);
                    } else if (latLng && typeof latLng.lat === 'number') {
                        this.setLatLng([latLng.lat, latLng.lng]);
                    }
                };
                marker.getPosition = function() {
                    var pos = this.getLatLng();
                    return {
                        lat: function() { return pos.lat; },
                        lng: function() { return pos.lng; }
                    };
                };
                marker.setZIndex = function(z) {
                    this.setZIndexOffset(z);
                };
                marker.setMap = function(map) {
                    if (map) {
                        this.addTo(map);
                    } else {
                        this.remove();
                    }
                };
                marker.setIcon = function(icon) {
                    console.log("setIcon called with:", icon);
                    if (icon && icon.url) {
                        // Convert Google icon object to Leaflet icon
                        const opts = {
                            iconUrl: icon.url,
                            iconSize: icon.size ? [icon.size.width, icon.size.height] : [20, 20],
                            iconAnchor: icon.anchor ? [icon.anchor.x, icon.anchor.y] : [10, 10]
                        };
                        this.setIcon(L.icon(opts));
                    } else {
                        // Fallback to a visible default icon
                        this.setIcon(L.divIcon({
                            html: `<div style="background-color: #31f3ff; width: 14px; height: 14px; border-radius: 50%; border: 2px solid #fff; box-shadow: 0 0 2px #0006;"></div>`,
                            className: '',
                            iconSize: [18, 18],
                            iconAnchor: [9, 9]
                        }));
                    }
                };
                marker.getIcon = function() {
                    // Not strictly needed, but for compatibility
                    return this.options.icon;
                };

                return marker;
            },
            
            // Stub for InfoWindow
            InfoWindow: function(options) {
                return L.popup({
                    maxWidth: options.maxWidth || 300,
                    closeButton: true,
                    autoClose: false
                });
            },
            
            // Stub for Geocoder
            Geocoder: function() {
                return {
                    geocode: function(request, callback) {
                        // Implement geocoding using Leaflet's Nominatim
                        fetch(`https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(request.address)}`)
                            .then(response => response.json())
                            .then(data => {
                                if (data && data.length > 0) {
                                    callback([{
                                        geometry: {
                                            location: new google.maps.LatLng(
                                                parseFloat(data[0].lat),
                                                parseFloat(data[0].lon)
                                            )
                                        }
                                    }], google.maps.GeocoderStatus.OK);
                                } else {
                                    callback([], google.maps.GeocoderStatus.ZERO_RESULTS);
                                }
                            })
                            .catch(() => {
                                callback([], google.maps.GeocoderStatus.ERROR);
                            });
                    }
                };
            }
        }
    };
}

// Add a function to initialize the map with Leaflet
function initLeafletMap(elementId, options) {
    // Create a Leaflet map
    var map = L.map(elementId, {
        zoom: options.zoom,
        center: [options.center.lat(), options.center.lng()],
        zoomControl: options.zoomControl,
        attributionControl: true
    });
    
    // Add default tile layer
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
        attribution: '© OpenStreetMap contributors'
    }).addTo(map);
    
    return map;
}
