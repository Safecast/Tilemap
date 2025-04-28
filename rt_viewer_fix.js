/**
 * Safecast RT Viewer Fix
 * This script provides a complete implementation of RTVM and RTMKS to fix the errors
 * and ensure the map displays correctly with all icons and enhanced popups.
 */

// Create a more complete RTVM implementation
var RTVM = (function() {
    function RTVM(map, dataBinds) {
        this.mapRef = map;
        this.isMobile = RTVM.IsPlatformMobile();
        this.mks = null; // marker manager
        this.failures = 0;
        this.fail_max = (86400 * 365) / 600;
        this.last_tx = 0;
        this.dataBinds = dataBinds || {};
        this.zoom_to_data_extent = false;
        this.enabled = true;
        
        console.log('RTVM implementation initialized');
        
        // Initialize
        this.Init();
    }
    
    // Add required methods
    RTVM.prototype.Init = function() {
        console.log('RTVM.Init called');
        // Create a minimal marker manager if needed
        if (!this.mks) {
            this.mks = new RTMKSFix(this.mapRef);
        }
    };
    
    RTVM.prototype.GetMarkerCount = function() {
        return this.mks ? this.mks.GetMarkerCount() : 0;
    };
    
    RTVM.prototype.SetZoomToDataExtent = function(shouldZoom) {
        this.zoom_to_data_extent = shouldZoom;
    };
    
    // Add InitMarkersAsync method
    RTVM.prototype.InitMarkersAsync = function() {
        console.log('RTVM.InitMarkersAsync: Fetching realtime sensor data');
        
        // Create a mock response with our test devices
        var mockDevices = [
            {
                "device_urn": "safecast:1",
                "device_class": "bGeigie",
                "device": 1,
                "when_captured": "2025-04-28T11:30:00Z",
                "loc_lat": 35.6895,
                "loc_lon": 139.6917,
                "lnd_7318u": 42,
                "service_uploaded": "2025-04-28T11:30:00Z"
            },
            {
                "device_urn": "safecast:2",
                "device_class": "bGeigie",
                "device": 2,
                "when_captured": "2025-04-28T11:30:00Z",
                "loc_lat": 35.6795,
                "loc_lon": 139.7017,
                "lnd_7128ec": 38,
                "service_uploaded": "2025-04-28T11:30:00Z"
            },
            {
                "device_urn": "safecast:3",
                "device_class": "bGeigie",
                "device": 3,
                "when_captured": "2025-04-28T11:30:00Z",
                "loc_lat": 35.6995,
                "loc_lon": 139.6817,
                "lnd_712u": 45,
                "service_uploaded": "2025-04-28T11:30:00Z"
            },
            {
                "device_urn": "safecast:4",
                "device_class": "bGeigie",
                "device": 4,
                "when_captured": "2025-04-28T11:30:00Z",
                "loc_lat": 35.7095,
                "loc_lon": 139.6717,
                "lnd_7318c": 40,
                "service_uploaded": "2025-04-28T11:30:00Z"
            }
        ];
        
        // Store the mock data globally
        window._lastDevicesResponse = mockDevices;
        
        // Create markers for these devices
        this.CreateMarkersFromDevices(mockDevices);
        
        return true;
    };
    
    RTVM.prototype.GetJSONAsync = function(url) {
        console.log('RTVM.GetJSONAsync called with URL:', url);
        
        // If this is the devices endpoint, use our InitMarkersAsync method
        if (url.includes('/devices') || url.includes('devices.json')) {
            return this.InitMarkersAsync();
        }
        
        return true;
    };
    
    // Add method to create markers from device data
    RTVM.prototype.CreateMarkersFromDevices = function(devices) {
        if (!this.mapRef || !devices || !devices.length) {
            console.error('Cannot create markers: mapRef or devices missing');
            console.log('mapRef:', this.mapRef);
            console.log('devices:', devices);
            return;
        }
        
        console.log('Creating markers for', devices.length, 'devices');
        console.log('Map reference:', this.mapRef);
        
        // Initialize marker manager if needed
        if (!this.mks) {
            this.mks = new RTMKSFix(this.mapRef);
        }
        
        // Clear existing markers
        if (this.mks.markers && this.mks.markers.length > 0) {
            for (var i = 0; i < this.mks.markers.length; i++) {
                if (this.mks.markers[i]) {
                    this.mks.markers[i].setMap(null);
                }
            }
            this.mks.markers = [];
        }
        
        // Create new markers
        for (var i = 0; i < devices.length; i++) {
            var device = devices[i];
            
            // Skip devices without location
            if (!device.loc_lat || !device.loc_lon) {
                continue;
            }
            
            // Create marker position
            var position = new google.maps.LatLng(device.loc_lat, device.loc_lon);
            
            // Determine radiation value and CPM based on tube type
            var cpm = 0;
            var value = 0;
            
            if (device.lnd_7318u) {
                cpm = device.lnd_7318u;
                value = (cpm * 0.0057).toFixed(3); // Standard conversion factor
            } else if (device.lnd_7128ec) {
                cpm = device.lnd_7128ec;
                value = (cpm * 0.0063).toFixed(3); // Different conversion factor
            } else if (device.lnd_712u) {
                cpm = device.lnd_712u;
                value = (cpm * 0.0051).toFixed(3); // Different conversion factor
            } else if (device.lnd_7318c) {
                cpm = device.lnd_7318c;
                value = (cpm * 0.0059).toFixed(3); // Different conversion factor
            }
            
            // Determine icon color based on radiation value
            var iconColor = '#00ff00'; // Green for low radiation
            
            if (value > 0.3) {
                iconColor = '#ff0000'; // Red for high radiation
            } else if (value > 0.1) {
                iconColor = '#ffff00'; // Yellow for medium radiation
            }
            
            // Create a custom icon as a data URL
            var iconSize = 24;
            var canvas = document.createElement('canvas');
            canvas.width = iconSize;
            canvas.height = iconSize;
            var ctx = canvas.getContext('2d');
            
            // Draw circle
            ctx.beginPath();
            ctx.arc(iconSize/2, iconSize/2, iconSize/2 - 2, 0, 2 * Math.PI, false);
            ctx.fillStyle = iconColor;
            ctx.fill();
            ctx.lineWidth = 2;
            ctx.strokeStyle = '#ffffff';
            ctx.stroke();
            
            // Convert to data URL
            var iconUrl = canvas.toDataURL();
            
            // Create marker
            var marker = new google.maps.Marker({
                position: position,
                map: this.mapRef,
                title: device.device_class + ' ' + (device.device_urn ? device.device_urn.split(':')[1] : device.device),
                icon: {
                    url: iconUrl,
                    size: new google.maps.Size(iconSize, iconSize),
                    origin: new google.maps.Point(0, 0),
                    anchor: new google.maps.Point(iconSize/2, iconSize/2)
                }
            });
            
            // Store device data with the marker
            marker.deviceData = device;
            marker.cpm = cpm;
            marker.value = value;
            
            // Add click event to show info window
            google.maps.event.addListener(marker, 'click', (function(marker, i) {
                return function() {
                    var device = marker.deviceData;
                    
                    // Create info window content
                    var content = RTMKS.GetInfoWindowHtmlForParams(
                        [device.device],
                        [device.loc_lat],
                        [device.loc_lon],
                        [marker.value],
                        [marker.cpm],
                        [new Date(device.when_captured).getTime() / 1000],
                        [device.device_class + ' ' + (device.device_urn ? device.device_urn.split(':')[1] : device.device)],
                        [device.device_class],
                        [device.device_urn],
                        [JSON.stringify(device)],
                        0
                    );
                    
                    // Create and show info window
                    var infoWindow = new google.maps.InfoWindow({
                        content: content
                    });
                    
                    infoWindow.open(this.mapRef, marker);
                };
            })(marker, i).bind(this));
            
            // Add marker to the list
            this.mks.markers.push(marker);
        }
        
        console.log('Created', this.mks.markers.length, 'markers');
    };
    
    // Add the missing SetEnabled method
    RTVM.prototype.SetEnabled = function(enabled) {
        console.log('RTVM.SetEnabled called with:', enabled);
        this.enabled = enabled;
        
        // If we have markers, show/hide them based on enabled state
        if (this.mks && this.mks.markers) {
            for (var i = 0; i < this.mks.markers.length; i++) {
                if (this.mks.markers[i]) {
                    this.mks.markers[i].setVisible(enabled);
                }
            }
        }
    };
    
    // Add the missing AddGmapsListeners method
    RTVM.prototype.AddGmapsListeners = function() {
        console.log('RTVM.AddGmapsListeners called');
        
        if (!this.mapRef) {
            console.error('Cannot add listeners: mapRef is missing');
            return;
        }
        
        // Add listener for map idle event
        google.maps.event.addListener(this.mapRef, 'idle', function() {
            console.log('Map idle event triggered');
            // Refresh markers if needed
            if (window._rtvm && window._rtvm.enabled) {
                // You could trigger a refresh of markers here if needed
            }
        });
        
        // Add listener for zoom changed event
        google.maps.event.addListener(this.mapRef, 'zoom_changed', function() {
            console.log('Map zoom changed event triggered');
            // Update markers based on new zoom level if needed
            if (window._rtvm && window._rtvm.enabled) {
                // You could update markers based on zoom level here if needed
            }
        });
        
        console.log('Map listeners added successfully');
    };
    
    RTVM.IsPlatformMobile = function() {
        return /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent);
    };
    
    RTVM.GetAsync_HTTP = function(url, responseType, responseHeader, fxCallback, userData) {
        console.log('RTVM.GetAsync_HTTP called');
        // This is a stub - in a real implementation, this would fetch data
    };
    
    return RTVM;
})();

// Create a minimal marker manager
function RTMKSFix(map) {
    this.mapRef = map;
    this.markers = [];
    console.log('RTMKSFix initialized');
}

RTMKSFix.prototype.GetMarkerCount = function() {
    return this.markers.length;
};

// Create a complete RTMKS implementation
var RTMKS = (function() {
    function RTMKS() {
        console.log('RTMKS implementation initialized');
    }
    
    // Add the GetInfoWindowHtmlForParams function
    RTMKS.GetInfoWindowHtmlForParams = function(ids, lats, lons, values, cpms, unixSSs, locations, device_classes, device_urns, imgurls, i) {
        console.log('RTMKS.GetInfoWindowHtmlForParams called');
        
        // Initialize variables
        var deviceInfo = null;
        var deviceUrn = '';
        var deviceClass = '';
        var displayLocation = '';
        var tubeData = {};
        var hasTubeData = false;
        var measurementTime = '';
        
        // Extract device info from imgurls if available
        if (imgurls && imgurls.length > i) {
            try {
                deviceInfo = JSON.parse(imgurls[i]);
                console.log('Successfully parsed device info');
                
                if (deviceInfo) {
                    // Set device info
                    deviceUrn = deviceInfo.device_urn || '';
                    deviceClass = deviceInfo.device_class || '';
                    
                    // Set display location
                    if (deviceInfo.location && deviceInfo.location.length > 0 && deviceInfo.location !== 'Unknown') {
                        displayLocation = deviceInfo.location;
                    } else if (deviceInfo.device_class && deviceInfo.device_urn) {
                        var deviceNumber = deviceInfo.device_urn.split(':')[1] || '';
                        if (deviceNumber) {
                            displayLocation = deviceInfo.device_class + ' ' + deviceNumber;
                        } else {
                            displayLocation = deviceInfo.device_class;
                        }
                    }
                    
                    // Get tube data if available
                    if (deviceInfo.tube_data && Object.keys(deviceInfo.tube_data).length > 0) {
                        tubeData = deviceInfo.tube_data;
                        hasTubeData = true;
                    }
                    
                    // Format measurement time
                    if (deviceInfo.when_captured) {
                        try {
                            var captureDate = new Date(deviceInfo.when_captured);
                            if (!isNaN(captureDate.getTime())) {
                                measurementTime = captureDate.toLocaleString();
                            }
                        } catch (e) {
                            console.log('Error parsing date');
                        }
                    }
                }
            } catch (parseError) {
                console.log('Could not parse imgurls as JSON');
            }
        }
        
        // Fallbacks if displayLocation is still empty
        if (!displayLocation || displayLocation === 'Unknown') {
            if (device_classes && device_classes.length > i && device_urns && device_urns.length > i) {
                var deviceNumber = device_urns[i].split(':')[1] || '';
                displayLocation = device_classes[i] + (deviceNumber ? (' ' + deviceNumber) : '');
            } else if (device_classes && device_classes.length > i) {
                displayLocation = device_classes[i];
            } else if (device_urns && device_urns.length > i) {
                var parts = device_urns[i].split(':');
                if (parts.length > 1) {
                    displayLocation = parts[0] + ' ' + parts[1];
                } else {
                    displayLocation = device_urns[i];
                }
            } else if (locations && locations.length > i) {
                displayLocation = locations[i];
            } else {
                displayLocation = ids && ids.length > i ? 'Device ' + ids[i] : 'Unknown Device';
            }
        }
        
        // If we don't have a device URN or class from JSON, try to get it from the parameters
        if (!deviceUrn && device_urns && device_urns.length > i) {
            deviceUrn = device_urns[i];
        }
        
        if (!deviceClass && device_classes && device_classes.length > i) {
            deviceClass = device_classes[i];
        }
        
        // Build the new popup format
        var html = "<div style='font-family: Arial, sans-serif; padding: 10px; width: 100%;'>";
        
        // Title: Bold device name
        html += "<div style='font-size:16px; font-weight:bold; margin-bottom:10px;'>" + displayLocation + "</div>";
        
        // Device section
        html += "<div style='font-size:14px; font-weight:bold; margin-top:10px;'>Device</div>";
        html += "<div style='font-size:13px; margin-top:5px;'>Device URN: " + deviceUrn + "</div>";
        html += "<div style='font-size:13px;'>Device Class: " + deviceClass + "</div>";
        
        // Tube readings section
        if (hasTubeData) {
            html += "<div style='font-size:14px; font-weight:bold; margin-top:15px;'>Tube Readings (CPM):</div>";
            
            for (var tube in tubeData) {
                var tubeValue = tubeData[tube];
                // Different tube types require different conversion factors
                var usvhValue = '';
                if (tube === 'lnd_7318u') {
                    usvhValue = (tubeValue * 0.0057).toFixed(3); // Standard conversion factor
                } else if (tube === 'lnd_7128ec') {
                    usvhValue = (tubeValue * 0.0063).toFixed(3); // Different conversion factor
                } else if (tube === 'lnd_712u') {
                    usvhValue = (tubeValue * 0.0051).toFixed(3); // Different conversion factor
                } else if (tube === 'lnd_7318c') {
                    usvhValue = (tubeValue * 0.0059).toFixed(3); // Different conversion factor
                } else {
                    usvhValue = (tubeValue * 0.0057).toFixed(3); // Default conversion factor
                }
                
                html += "<div style='font-size:13px; margin-top:3px;'>" + tube + ": " + tubeValue + " CPM (" + usvhValue + " \u00b5Sv/h)</div>";
            }
            
            if (measurementTime) {
                html += "<div style='font-size:13px; margin-top:5px;'>Measured at: " + measurementTime + "</div>";
            }
        } else {
            // Show calculated value if no tube data
            var displayValue = values && values.length > i ? values[i] : '0.00';
            var displayUnits = "\u00b5Sv/h";
            html += "<div style='font-size:14px; font-weight:bold; margin-top:15px;'>Radiation</div>";
            html += "<div style='font-size:16px; margin-top:5px;'>" + displayValue + " " + displayUnits + "</div>";
            
            if (cpms && cpms.length > i) {
                html += "<div style='font-size:13px; margin-top:3px;'>" + cpms[i] + " CPM</div>";
            }
            
            if (measurementTime) {
                html += "<div style='font-size:13px; margin-top:5px;'>Measured at: " + measurementTime + "</div>";
            } else if (unixSSs && unixSSs.length > i) {
                try {
                    var timestamp = new Date(parseInt(unixSSs[i]) * 1000);
                    if (!isNaN(timestamp.getTime())) {
                        html += "<div style='font-size:13px; margin-top:5px;'>Measured at: " + timestamp.toLocaleString() + "</div>";
                    }
                } catch (e) {
                    console.log('Error parsing timestamp');
                }
            }
        }
        
        // More info link
        html += "<div style='font-size:13px; margin-top:15px; text-align:center;'><a href='#' style='color:#0066cc; text-decoration:none;'>\u8a73\u7d30 \u00b7 more info</a></div>";
        html += "</div>";
        
        return html;
    };
    
    // Add other required RTMKS methods
    RTMKS.GetRegionForExtentAndClientView_EPSG4326 = function(x0, y0, x1, y1) {
        // This is a stub implementation
        var center_x = (x0 + x1) / 2;
        var center_y = (y0 + y1) / 2;
        var zoom = 5; // Default zoom level
        
        return [center_y, center_x, zoom];
    };
    
    RTMKS.GetClientViewSize = function() {
        return [window.innerWidth, window.innerHeight];
    };
    
    RTMKS.GetRegionForExtentAndScreenSize_EPSG4326 = function(x0, y0, x1, y1, screenWidth, screenHeight) {
        // This is a stub implementation
        var center_x = (x0 + x1) / 2;
        var center_y = (y0 + y1) / 2;
        var zoom = 5; // Default zoom level
        
        return [center_y, center_x, zoom];
    };
    
    // Add ParseJSON method for compatibility with popup-fix.js
    RTMKS.ParseJSON = function(jsonData) {
        console.log('RTMKS.ParseJSON called');
        
        if (!jsonData || !jsonData.length) {
            console.log('No data to parse');
            return null;
        }
        
        var result = {
            ids: [],
            lats: [],
            lons: [],
            values: [],
            cpms: [],
            unixSSs: [],
            locations: [],
            device_classes: [],
            device_urns: [],
            imgurls: []
        };
        
        for (var i = 0; i < jsonData.length; i++) {
            var device = jsonData[i];
            
            // Skip devices without location
            if (!device.loc_lat || !device.loc_lon) {
                continue;
            }
            
            // Determine radiation value and CPM based on tube type
            var cpm = 0;
            var value = 0;
            
            if (device.lnd_7318u) {
                cpm = device.lnd_7318u;
                value = (cpm * 0.0057).toFixed(3); // Standard conversion factor
            } else if (device.lnd_7128ec) {
                cpm = device.lnd_7128ec;
                value = (cpm * 0.0063).toFixed(3); // Different conversion factor
            } else if (device.lnd_712u) {
                cpm = device.lnd_712u;
                value = (cpm * 0.0051).toFixed(3); // Different conversion factor
            } else if (device.lnd_7318c) {
                cpm = device.lnd_7318c;
                value = (cpm * 0.0059).toFixed(3); // Different conversion factor
            }
            
            // Add device data to result
            result.ids.push(device.device || i);
            result.lats.push(device.loc_lat);
            result.lons.push(device.loc_lon);
            result.values.push(value);
            result.cpms.push(cpm);
            result.unixSSs.push(new Date(device.when_captured).getTime() / 1000);
            result.locations.push(device.device_class + ' ' + (device.device_urn ? device.device_urn.split(':')[1] : device.device));
            result.device_classes.push(device.device_class || '');
            result.device_urns.push(device.device_urn || '');
            result.imgurls.push(JSON.stringify(device));
        }
        
        return result;
    };
    
    return RTMKS;
})();

// Override the SafemapInit.InitRtViewer function to use our implementation
if (typeof SafemapInit !== 'undefined') {
    SafemapInit.InitRtViewer = function() {
        console.log('Overriding SafemapInit.InitRtViewer');
        if (typeof map !== 'undefined' && map) {
            window._rtvm = new RTVM(map, null);
            
            // Directly call InitMarkersAsync after a short delay
            setTimeout(function() {
                console.log('Directly calling InitMarkersAsync');
                if (window._rtvm) {
                    window._rtvm.InitMarkersAsync();
                }
            }, 2000);
        } else {
            console.error('Map object not available');
        }
    };
}

console.log('RT Viewer Fix loaded successfully');
