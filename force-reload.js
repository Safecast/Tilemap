// force-reload.js - Forces a complete cache reload and removes Google Maps scripts
(function() {
    console.log("Checking for Google Maps scripts...");
    
    // Find any Google Maps scripts
    var scripts = document.getElementsByTagName('script');
    for (var i = 0; i < scripts.length; i++) {
        var src = scripts[i].src || '';
        if (src.indexOf('googleapis.com/maps') !== -1) {
            console.log("Found Google Maps script:", src);
            scripts[i].parentNode.removeChild(scripts[i]);
            console.log("Removed Google Maps script");
            i--; // Adjust index after removal
        }
    }
    
    // Clear localStorage cache
    console.log("Clearing localStorage cache...");
    localStorage.clear();
    
    // Set OpenStreetMap preference
    localStorage.setItem("PREF_BASEMAP_UIDX", 9); // 9 for OpenStreetMap
    
    // Create timestamp for cache busting
    var timestamp = new Date().getTime();
    
    // Reload the page with cache busting parameter
    setTimeout(function() {
        console.log("Reloading page with cache busting...");
        window.location.href = window.location.pathname + "?nocache=" + timestamp;
    }, 500);
})(); 