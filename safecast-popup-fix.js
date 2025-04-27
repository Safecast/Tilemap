/**
 * Safecast Popup Fix
 * This script patches the rt_viewer.js functionality to correctly display
 * device names and radiation values in the popup.
 */

(function() {
    // Wait for the page to load
    window.addEventListener('load', function() {
        console.log('Safecast Popup Fix loaded');
        
        // Check if RTMKS exists
        if (typeof RTMKS === 'undefined') {
            console.error('RTMKS not found, cannot apply popup fix');
            return;
        }
        
        // Store the original GetInfoWindowHtmlForParams function
        const originalGetInfoWindowHtmlForParams = RTMKS.GetInfoWindowHtmlForParams;
        
        // Override the GetInfoWindowHtmlForParams function
        RTMKS.GetInfoWindowHtmlForParams = function(
            locations, ids, device_urns, device_classes, 
            values, unixSSs, imgs, loc, 
            mini, tblw, fontCssClass, showGraph, showID
        ) {
            console.log('Patched GetInfoWindowHtmlForParams called');
            
            // Log the inputs for debugging
            console.log('Popup inputs:', {
                locations: locations,
                ids: ids,
                device_urns: device_urns,
                device_classes: device_classes,
                values: values,
                imgs: imgs
            });
            
            // Create a better display location
            let displayLocation = '';
            
            // Try to parse device info from imgs
            try {
                const deviceInfo = imgs[0] ? JSON.parse(imgs[0]) : null;
                console.log('Parsed device info:', deviceInfo);
                
                if (deviceInfo && deviceInfo.location) {
                    displayLocation = deviceInfo.location;
                    console.log('Using location from deviceInfo:', displayLocation);
                }
            } catch (e) {
                console.error('Error parsing device info:', e);
            }
            
            // If we couldn't get a location from the device info, try other methods
            if (!displayLocation) {
                if (device_classes[0] && device_urns[0]) {
                    const deviceNumber = device_urns[0].split(':')[1] || '';
                    displayLocation = device_classes[0] + (deviceNumber ? (' ' + deviceNumber) : '');
                    console.log('Created display location from device_class and device_urn:', displayLocation);
                } else if (locations[0] && locations[0] !== 'Unknown') {
                    displayLocation = locations[0];
                    console.log('Using location from locations array:', displayLocation);
                } else if (device_classes[0]) {
                    displayLocation = device_classes[0];
                    console.log('Using device_class as location:', displayLocation);
                } else {
                    // Force a better name if we're still showing "Device 10030"
                    if (ids[0] === 10030) {
                        displayLocation = 'Geigiecast Device';
                        console.log('Forcing better name for Device 10030');
                    } else {
                        displayLocation = ids[0] ? 'Device ' + ids[0] : 'Unknown Device';
                        console.log('Using fallback device ID as location:', displayLocation);
                    }
                }
            }
            
            // Call the original function
            return originalGetInfoWindowHtmlForParams(
                [displayLocation], ids, device_urns, device_classes,
                values, unixSSs, imgs, displayLocation,
                mini, tblw, fontCssClass, showGraph, showID
            );
        };
        
        console.log('Safecast Popup Fix applied successfully');
    });
})();
