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
                var marker = L.marker([options.position.lat(), options.position.lng()], {
                    icon: options.icon ? L.icon({
                        iconUrl: options.icon.url,
                        iconSize: [options.icon.scaledSize.width, options.icon.scaledSize.height],
                        iconAnchor: [options.icon.anchor.x, options.icon.anchor.y]
                    }) : null,
                    title: options.title
                });
                
                if (options.map) {
                    marker.addTo(options.map);
                }
                
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
