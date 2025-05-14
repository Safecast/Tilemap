// debug-leaflet.js - Script to help debug Leaflet integration
(function() {
    // Check if Leaflet is loaded
    console.log("Debug script running");
    
    // Wait for page to load
    window.addEventListener('load', function() {
        console.log("Page loaded");
        
        // Check if Leaflet is defined
        if (typeof L === 'undefined') {
            console.error("ERROR: Leaflet (L) is not defined!");
        } else {
            console.log("SUCCESS: Leaflet is loaded correctly");
        }
        
        // Check if map is created
        setTimeout(function() {
            console.log("Checking map initialization...");
            
            if (!window.leafletMap) {
                console.error("ERROR: leafletMap not created!");
            } else {
                console.log("SUCCESS: Leaflet map created");
                console.log("Map center:", window.leafletMap.getCenter());
                console.log("Map zoom:", window.leafletMap.getZoom());
            }
            
            // Check map container
            var container = document.getElementById('map_canvas');
            if (!container) {
                console.error("ERROR: map_canvas element not found!");
            } else {
                console.log("Map container dimensions:", container.offsetWidth, "x", container.offsetHeight);
                console.log("Map container style:", window.getComputedStyle(container).display);
            }
            
            // Check Google Maps shim
            if (!window.google || !window.google.maps) {
                console.error("ERROR: Google Maps shim not created!");
            } else {
                console.log("SUCCESS: Google Maps shim created");
            }
        }, 1000);
    });
})(); 