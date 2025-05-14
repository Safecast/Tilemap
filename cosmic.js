// cosmic.js - Loader for Safecast Cosmic Log Files
// Loads all cosmic log files from the Safecast API and displays them like bGeigie logs

(function(global) {
    // Configurable: API endpoint for cosmic logs
    var COSMIC_API = '/api/bgeigie_imports.json?subtype=Cosmic&order=created_at+desc&per_page=50';
    
    // Queue for logs that need to be processed
    var logQueue = [];
    var processingQueue = false;
    var waitingForViewer = false;
    var maxViewerWaitTime = 60000; // 60 seconds max wait time
    
    // Store loaded log data for later processing if needed
    var loadedLogData = [];
    
    // Progress UI elements
    var progressPopup = null;
    var progressBar = null;
    var statusText = null;
    var totalLogs = 0;
    var processedLogs = 0;
    
    // Create and show progress popup
    function createProgressPopup() {
        // Remove existing popup if any
        removeProgressPopup();
        
        // Create popup container
        progressPopup = document.createElement('div');
        progressPopup.id = 'cosmic-progress-popup';
        progressPopup.style.position = 'fixed';
        progressPopup.style.top = '50%';
        progressPopup.style.left = '50%';
        progressPopup.style.transform = 'translate(-50%, -50%)';
        progressPopup.style.backgroundColor = 'rgba(0, 0, 0, 0.8)';
        progressPopup.style.color = 'white';
        progressPopup.style.padding = '20px';
        progressPopup.style.borderRadius = '10px';
        progressPopup.style.zIndex = '10000';
        progressPopup.style.minWidth = '300px';
        progressPopup.style.textAlign = 'center';
        progressPopup.style.fontFamily = 'Arial, sans-serif';
        
        // Create title
        var title = document.createElement('h3');
        title.textContent = 'Loading Cosmic Logs';
        title.style.margin = '0 0 15px 0';
        progressPopup.appendChild(title);
        
        // Create status text
        statusText = document.createElement('div');
        statusText.textContent = 'Fetching logs...';
        statusText.style.marginBottom = '15px';
        progressPopup.appendChild(statusText);
        
        // Create progress bar container
        var progressContainer = document.createElement('div');
        progressContainer.style.width = '100%';
        progressContainer.style.backgroundColor = '#444';
        progressContainer.style.borderRadius = '5px';
        progressContainer.style.overflow = 'hidden';
        
        // Create progress bar
        progressBar = document.createElement('div');
        progressBar.style.width = '0%';
        progressBar.style.height = '20px';
        progressBar.style.backgroundColor = '#4CAF50';
        progressBar.style.transition = 'width 0.3s';
        progressContainer.appendChild(progressBar);
        progressPopup.appendChild(progressContainer);
        
        // Create log count text
        var logCountText = document.createElement('div');
        logCountText.id = 'cosmic-log-count';
        logCountText.textContent = '0 / 0 logs';
        logCountText.style.marginTop = '10px';
        logCountText.style.fontSize = '12px';
        progressPopup.appendChild(logCountText);
        
        // Optional: Create close button
        var closeButton = document.createElement('button');
        closeButton.textContent = 'Cancel';
        closeButton.style.marginTop = '15px';
        closeButton.style.padding = '5px 10px';
        closeButton.style.backgroundColor = '#f44336';
        closeButton.style.color = 'white';
        closeButton.style.border = 'none';
        closeButton.style.borderRadius = '3px';
        closeButton.style.cursor = 'pointer';
        closeButton.onclick = function() {
            if (confirm('Cancel loading Cosmic logs?')) {
                logQueue = []; // Clear queue
                removeProgressPopup();
            }
        };
        progressPopup.appendChild(closeButton);
        
        // Add to document
        document.body.appendChild(progressPopup);
    }
    
    // Update progress display
    function updateProgressDisplay(current, total, status) {
        if (!progressPopup) return;
        
        // Update progress bar
        if (progressBar) {
            const percent = total > 0 ? Math.round((current / total) * 100) : 0;
            progressBar.style.width = percent + '%';
        }
        
        // Update status text
        if (statusText && status) {
            statusText.textContent = status;
        }
        
        // Update log count
        const logCountEl = document.getElementById('cosmic-log-count');
        if (logCountEl) {
            logCountEl.textContent = current + ' / ' + total + ' logs';
        }
    }
    
    // Remove progress popup
    function removeProgressPopup() {
        if (progressPopup && progressPopup.parentNode) {
            progressPopup.parentNode.removeChild(progressPopup);
        }
        progressPopup = null;
        progressBar = null;
        statusText = null;
    }
    
    // Checks if bGeigie viewer is initialized
    function isViewerInitialized() {
        try {
            return (
                window._bvProxy && 
                window._bvProxy._bvm !== null && 
                window._bvProxy._bvm !== undefined &&
                typeof window._bvProxy._bvm.AddLogsByQueryFromString === 'function'
            );
        } catch (e) {
            console.error('Error checking viewer initialization:', e);
            return false;
        }
    }
    
    // Show the bGeigie transfer bar if available
    function showTransferBar(visible) {
        try {
            if (window._bvProxy && window._bvProxy._bvm && typeof window._bvProxy._bvm.TransferBar_SetHidden === 'function') {
                window._bvProxy._bvm.TransferBar_SetHidden(!visible);
            }
        } catch (e) {
            console.log('Could not set transfer bar visibility:', e.message);
        }
    }
    
    // Force initialization of RTMKS if possible
    function forceInitializeRTMKS() {
        console.log('Attempting to force initialize RTMKS...');
        
        // If RTMKS is already defined, no need to proceed
        if (typeof window.RTMKS !== 'undefined') {
            console.log('RTMKS is already defined.');
            return true;
        }
        
        try {
            // Check if rt_viewer_fix.js is loaded
            if (typeof window.RTVMFix === 'function') {
                console.log('RTVMFix found, initializing...');
                // Initialize RTVM with the map
                new RTVMFix(window.map);
                return true;
            }
            
            // Check if rt_viewer_min.js is loaded
            if (typeof window.RTVM === 'function') {
                console.log('RTVM found, initializing...');
                if (!window.rtvm) {
                    window.rtvm = new RTVM(window.map);
                }
                return true;
            }
            
            // Try to load rt_viewer_fix.js dynamically
            console.log('Attempting to load rt_viewer_fix.js...');
            var script = document.createElement('script');
            script.src = 'rt_viewer_fix.js?' + Date.now(); // Cache busting
            document.head.appendChild(script);
            
            // Since script loading is async, return false
            return false;
        } catch (e) {
            console.error('Error initializing RTMKS:', e);
            return false;
        }
    }
    
    // Process the loaded log data directly
    function processLoadedLogs() {
        console.log('Processing loaded logs directly...');
        
        // Reduce the number of logs to process if there are many
        var maxLogsToProcess = 100;
        var logsToProcess = loadedLogData.length > maxLogsToProcess ? 
                          loadedLogData.slice(0, maxLogsToProcess) : 
                          loadedLogData;
        
        if (logsToProcess.length > maxLogsToProcess) {
            console.log(`Too many logs (${loadedLogData.length}), limiting to ${maxLogsToProcess}`);
            updateProgressDisplay(0, maxLogsToProcess, `Processing ${maxLogsToProcess} of ${loadedLogData.length} logs...`);
        }
        
        // Show standard popup for bGeigie logs if available
        if (typeof SafemapUI !== 'undefined' && 
            typeof SafemapUI.ShowAddLogResultsPanel === 'function') {
            SafemapUI.ShowAddLogResultsPanel(logsToProcess.length);
        }
        
        // Create a visualization for logs if the map is available
        if (window.map) {
            console.log('Visualizing logs directly on the map...');
            
            // Create markers directly on the map
            var markers = [];
            var processedPoints = 0;
            var validPoints = 0;
            var mockCoordinates = [];
            
            // Generate a spread of mock coordinates for cosmic logs without real coordinates
            // This will create a visual representation of the logs even when no GPS data exists
            function generateMockCoordinates(count) {
                if (mockCoordinates.length > 0) return mockCoordinates;
                
                // Get the current map center for reference
                var center = window.map.getCenter();
                var baseLat = center ? center.lat() : 35.0;
                var baseLng = center ? center.lng() : 135.0;
                
                // Create a cloud of points around the center
                for (var i = 0; i < count; i++) {
                    // Use a spiral pattern for more interesting distribution
                    var angle = 0.3 * i;
                    var radius = 0.05 * Math.sqrt(i);  // Gradually increasing radius
                    
                    var lat = baseLat + radius * Math.cos(angle);
                    var lng = baseLng + radius * Math.sin(angle);
                    
                    mockCoordinates.push({
                        lat: lat,
                        lng: lng,
                        isMock: true
                    });
                }
                
                return mockCoordinates;
            }
            
            // Create a marker clustering utility if available (for handling many markers)
            var markerCluster = null;
            if (window.MarkerClusterer) {
                markerCluster = new MarkerClusterer(window.map, [], {
                    imagePath: 'https://developers.google.com/maps/documentation/javascript/examples/markerclusterer/m'
                });
            }
            
            // Create a batch processor for the logs
            function processBatch(startIdx, batchSize) {
                var endIdx = Math.min(startIdx + batchSize, logsToProcess.length);
                var processedInBatch = 0;
                var batchMarkers = [];
                
                for (var i = startIdx; i < endIdx; i++) {
                    var logItem = logsToProcess[i];
                    try {
                        // Extract coordinates from the log text (NMEA format)
                        var coordinates = extractCoordinatesFromLog(logItem.logText);
                        
                        if (coordinates.length > 0) {
                            // Limit the number of markers per log to avoid overwhelming the map
                            var maxPointsPerLog = 100;
                            var pointsToUse = coordinates.length > maxPointsPerLog ? 
                                            coordinates.slice(0, maxPointsPerLog) : 
                                            coordinates;
                                            
                            pointsToUse.forEach(function(coord) {
                                if (isValidCoordinate(coord.lat, coord.lng)) {
                                    // Create a marker
                                    var marker = new google.maps.Marker({
                                        position: coord,
                                        map: markerCluster ? null : window.map, // Don't add to map if using cluster
                                        icon: {
                                            path: google.maps.SymbolPath.CIRCLE,
                                            scale: 3,
                                            fillColor: "#3366cc",
                                            fillOpacity: 0.8,
                                            strokeWeight: 1,
                                            strokeColor: "#000000"
                                        },
                                        title: 'Cosmic Log: ' + (logItem.metadata.name || 'Unknown')
                                    });
                                    
                                    // Add click event for info window
                                    marker.addListener('click', function() {
                                        var infoContent = '<div style="width:250px;">' +
                                            '<h3 style="margin:4px 0;">Cosmic Log</h3>' +
                                            '<p style="margin:4px 0;"><b>Name:</b> ' + (logItem.metadata.name || 'Unknown') + '</p>' +
                                            '<p style="margin:4px 0;"><b>Date:</b> ' + (logItem.metadata.created_at || 'Unknown') + '</p>' +
                                            '<p style="margin:4px 0;"><b>Location:</b> ' + coord.lat.toFixed(6) + ', ' + coord.lng.toFixed(6) + '</p>' +
                                            '</div>';
                                            
                                        var infoWindow = new google.maps.InfoWindow({
                                            content: infoContent
                                        });
                                        
                                        infoWindow.open(window.map, marker);
                                    });
                                    
                                    // Add to arrays
                                    markers.push(marker);
                                    batchMarkers.push(marker);
                                    validPoints++;
                                }
                            });
                            
                            processedPoints += coordinates.length;
                            console.log(`Log ${i+1}: Processed ${coordinates.length} points, added ${pointsToUse.length} markers`);
                        } else {
                            console.log(`Log ${i+1} has no valid coordinates`);
                            
                            // Use a mock coordinate if available
                            if (logItem.metadata && logItem.metadata.name) {
                                // Generate mock coordinates if needed
                                var mocks = generateMockCoordinates(logsToProcess.length);
                                
                                if (i < mocks.length) {
                                    var mockCoord = mocks[i];
                                    
                                    // Create a marker with special styling for mock location
                                    var mockMarker = new google.maps.Marker({
                                        position: mockCoord,
                                        map: markerCluster ? null : window.map,
                                        icon: {
                                            path: google.maps.SymbolPath.CIRCLE,
                                            scale: 3,
                                            fillColor: "#cc6633",  // Different color for mock data
                                            fillOpacity: 0.6,
                                            strokeWeight: 1,
                                            strokeColor: "#000000"
                                        },
                                        title: 'Cosmic Log (estimated location): ' + (logItem.metadata.name || 'Unknown')
                                    });
                                    
                                    // Add click event with mockup notice
                                    mockMarker.addListener('click', function() {
                                        var infoContent = '<div style="width:250px;">' +
                                            '<h3 style="margin:4px 0;">Cosmic Log</h3>' +
                                            '<p style="margin:4px 0;"><b>Name:</b> ' + (logItem.metadata.name || 'Unknown') + '</p>' +
                                            '<p style="margin:4px 0;"><b>Date:</b> ' + (logItem.metadata.created_at || 'Unknown') + '</p>' +
                                            '<p style="margin:4px 0;color:#cc6633;"><b>Note:</b> Estimated location (no GPS data)</p>' +
                                            '</div>';
                                            
                                        var infoWindow = new google.maps.InfoWindow({
                                            content: infoContent
                                        });
                                        
                                        infoWindow.open(window.map, mockMarker);
                                    });
                                    
                                    // Add to arrays
                                    markers.push(mockMarker);
                                    batchMarkers.push(mockMarker);
                                    validPoints++;
                                }
                            }
                        }
                        
                        processedInBatch++;
                        
                    } catch (e) {
                        console.error(`Error processing log ${i+1}:`, e);
                    }
                }
                
                // Add markers to cluster if we're using clustering
                if (markerCluster && batchMarkers.length > 0) {
                    markerCluster.addMarkers(batchMarkers);
                }
                
                // Update progress
                updateProgressDisplay(endIdx, logsToProcess.length, 
                    `Processed ${endIdx} logs with ${validPoints} markers created`);
                
                // Process next batch or finish
                if (endIdx < logsToProcess.length) {
                    setTimeout(function() {
                        processBatch(endIdx, batchSize);
                    }, 100);
                } else {
                    console.log(`Finished processing ${logsToProcess.length} logs, created ${markers.length} markers from ${processedPoints} points`);
                    
                    // Try to center the map on the markers if we have any
                    if (markers.length > 0) {
                        fitMapToMarkers(markers);
                    }
                    
                    // Show completion message
                    updateProgressDisplay(logsToProcess.length, logsToProcess.length, 
                        `Completed: ${markers.length} markers from ${logsToProcess.length} logs`);
                }
            }
            
            // Start processing in batches
            processBatch(0, 5);
            
            // Store created markers in a global variable for later access
            window.cosmicMarkers = markers;
            
            return true;
        } else {
            console.error('Map not available for direct visualization');
            return false;
        }
    }
    
    // Validate coordinate
    function isValidCoordinate(lat, lng) {
        return lat && lng && 
               !isNaN(lat) && !isNaN(lng) && 
               lat >= -90 && lat <= 90 && 
               lng >= -180 && lng <= 180;
    }
    
    // Fit map to markers
    function fitMapToMarkers(markers) {
        if (!window.map || !markers || markers.length === 0) return;
        
        try {
            var bounds = new google.maps.LatLngBounds();
            
            // Add each marker position to the bounds
            for (var i = 0; i < markers.length; i++) {
                bounds.extend(markers[i].getPosition());
            }
            
            // Fit the map to the bounds
            window.map.fitBounds(bounds);
            
            // Adjust zoom if too close
            var listener = google.maps.event.addListenerOnce(window.map, 'idle', function() {
                if (window.map.getZoom() > 12) {
                    window.map.setZoom(12);
                }
            });
            
            console.log('Map view adjusted to fit markers');
        } catch (e) {
            console.error('Error fitting map to markers:', e);
        }
    }
    
    // Extract coordinates from log text
    function extractCoordinatesFromLog(logText) {
        var coordinates = [];
        
        // Debug: Display sample of the log content to troubleshoot
        var shortSample = logText.substring(0, 300);
        console.log('Log sample:', shortSample);
        
        // Check if there's any content
        if (!logText || logText.trim().length === 0) {
            console.log('Empty log content');
            return coordinates;
        }
        
        // Split the log into lines
        var lines = logText.split('\n');
        console.log('Log has', lines.length, 'lines');
        
        // Try multiple log formats
        if (lines.length > 0) {
            var foundFormat = false;
            
            // Check if this is a bGeigie log format
            var hasBGeigieHeader = lines[0].indexOf('#BGEIGIE') > -1 || 
                                   logText.indexOf('#BGEIGIE') > -1;
            
            if (hasBGeigieHeader) {
                console.log('Found bGeigie format');
                foundFormat = true;
                
                // bGeigie log format
                for (var i = 0; i < lines.length; i++) {
                    var line = lines[i];
                    // Skip comments and empty lines
                    if (line.trim().length === 0 || line.startsWith('#')) continue;
                    
                    // Parse bGeigie log line format
                    var parts = line.split(',');
                    if (parts.length >= 7) {
                        // bGeigie format has lat/lon in fields 7 and 8
                        var lat = parseFloat(parts[6]);
                        var lon = parseFloat(parts[7]);
                        
                        if (!isNaN(lat) && !isNaN(lon) && isValidCoordinate(lat, lon)) {
                            coordinates.push({ lat: lat, lng: lon });
                        }
                    }
                }
            }
            
            // NMEA GPS format (e.g., $GPGGA, $GPRMC)
            var hasNMEA = logText.indexOf('$GP') > -1;
            if (hasNMEA) {
                console.log('Found NMEA format');
                foundFormat = true;
                
                for (var i = 0; i < lines.length; i++) {
                    var line = lines[i];
                    // Look for NMEA sentences
                    if (line.indexOf('$GPGGA') > -1 || line.indexOf('$GPRMC') > -1) {
                        var parts = line.split(',');
                        if (parts.length >= 6) {
                            var lat, lon;
                            if (line.indexOf('$GPGGA') > -1 && parts.length >= 5) {
                                // Parse GPGGA format
                                lat = parseNmeaLatitude(parts[2], parts[3]);
                                lon = parseNmeaLongitude(parts[4], parts[5]);
                            } else if (line.indexOf('$GPRMC') > -1 && parts.length >= 6) {
                                // Parse GPRMC format
                                lat = parseNmeaLatitude(parts[3], parts[4]);
                                lon = parseNmeaLongitude(parts[5], parts[6]);
                            }
                            
                            if (lat && lon && !isNaN(lat) && !isNaN(lon) && isValidCoordinate(lat, lon)) {
                                coordinates.push({ lat: lat, lng: lon });
                            }
                        }
                    }
                }
            }
            
            // Look for Safecast-specific custom log formats
            var hasSafecastFormat = logText.indexOf('SafecastLog') > -1 || 
                                   logText.indexOf('Safecast') > -1;
                                   
            if (hasSafecastFormat) {
                console.log('Found Safecast format');
                foundFormat = true;
                
                // Try to extract from Safecast JSON format in metadata
                try {
                    // Look for JSON-like content
                    var jsonStart = logText.indexOf('{');
                    var jsonEnd = logText.lastIndexOf('}') + 1;
                    
                    if (jsonStart > -1 && jsonEnd > jsonStart) {
                        var jsonString = logText.substring(jsonStart, jsonEnd);
                        var data = JSON.parse(jsonString);
                        
                        // Check for coordinates in the parsed JSON
                        if (data.latitude && data.longitude) {
                            var lat = parseFloat(data.latitude);
                            var lon = parseFloat(data.longitude);
                            
                            if (!isNaN(lat) && !isNaN(lon) && isValidCoordinate(lat, lon)) {
                                coordinates.push({ lat: lat, lng: lon });
                            }
                        }
                    }
                } catch (e) {
                    console.log('Error parsing JSON in log:', e.message);
                }
            }
            
            // Direct coordinate extraction as a fallback
            if (!foundFormat || coordinates.length === 0) {
                console.log('Trying direct coordinate extraction');
                
                // Regular expression to find coordinates in various formats
                // This can find patterns like "lat: 35.123, lon: 139.456" or "35.123, 139.456"
                var coordRegex = /[-+]?\d+\.\d+\s*,\s*[-+]?\d+\.\d+/g;
                var latLonRegex = /lat[^:]*:\s*([-+]?\d+\.\d+)[^:]*lon[^:]*:\s*([-+]?\d+\.\d+)/gi;
                
                // Try direct regex matching for coordinate pairs
                var match;
                while ((match = coordRegex.exec(logText)) !== null) {
                    var coords = match[0].split(',');
                    if (coords.length === 2) {
                        var lat = parseFloat(coords[0].trim());
                        var lon = parseFloat(coords[1].trim());
                        
                        if (!isNaN(lat) && !isNaN(lon) && isValidCoordinate(lat, lon)) {
                            coordinates.push({ lat: lat, lng: lon });
                        }
                    }
                }
                
                // Try lat/lon labeled format
                while ((match = latLonRegex.exec(logText)) !== null) {
                    if (match.length >= 3) {
                        var lat = parseFloat(match[1].trim());
                        var lon = parseFloat(match[2].trim());
                        
                        if (!isNaN(lat) && !isNaN(lon) && isValidCoordinate(lat, lon)) {
                            coordinates.push({ lat: lat, lng: lon });
                        }
                    }
                }
                
                // Try parsing comma-separated values as a last resort
                if (coordinates.length === 0) {
                    for (var i = 0; i < lines.length; i++) {
                        var line = lines[i].trim();
                        if (line.length > 0 && !line.startsWith('#') && line.indexOf(',') > -1) {
                            var parts = line.split(',');
                            
                            // Try various column combinations
                            for (var j = 0; j < parts.length - 1; j++) {
                                var lat = parseFloat(parts[j]);
                                var lon = parseFloat(parts[j+1]);
                                
                                if (!isNaN(lat) && !isNaN(lon) && isValidCoordinate(lat, lon)) {
                                    coordinates.push({ lat: lat, lng: lon });
                                    break; // Found a valid pair in this line
                                }
                            }
                        }
                    }
                }
            }
        }
        
        // Debug info
        console.log('Found', coordinates.length, 'coordinates in log');
        if (coordinates.length > 0) {
            console.log('First coordinate:', coordinates[0]);
        }
        
        return coordinates;
    }
    
    // Parse NMEA latitude
    function parseNmeaLatitude(lat, dir) {
        if (!lat || lat.length < 4) return null;
        var degrees = parseFloat(lat.substring(0, 2));
        var minutes = parseFloat(lat.substring(2));
        var result = degrees + (minutes / 60.0);
        if (dir === 'S') result = -result;
        return result;
    }
    
    // Parse NMEA longitude
    function parseNmeaLongitude(lon, dir) {
        if (!lon || lon.length < 5) return null;
        var degrees = parseFloat(lon.substring(0, 3));
        var minutes = parseFloat(lon.substring(3));
        var result = degrees + (minutes / 60.0);
        if (dir === 'W') result = -result;
        return result;
    }
    
    // Processes the log queue
    function processLogQueue() {
        if (processingQueue || logQueue.length === 0) return;
        
        processingQueue = true;
        console.log(`Processing log queue. Items: ${logQueue.length}`);
        
        // Update status
        updateProgressDisplay(processedLogs, totalLogs, 'Processing logs...');
        
        // Check if bGeigie viewer is ready
        if (!isViewerInitialized()) {
            if (!waitingForViewer) {
                waitingForViewer = true;
                console.log('bGeigie viewer not initialized yet. Waiting...');
                updateProgressDisplay(processedLogs, totalLogs, 'Waiting for map viewer to initialize...');
                
                // Attempt to force initialize RTMKS
                var rtmksInitialized = forceInitializeRTMKS();
                
                // Start a timer to check for viewer initialization
                var waitStart = Date.now();
                var checkInterval = setInterval(function() {
                    // Try again to initialize RTMKS each time
                    if (!rtmksInitialized) {
                        rtmksInitialized = forceInitializeRTMKS();
                    }
                    
                    // Double-check initialization status each time
                    var viewerReady = isViewerInitialized();
                    
                    if (viewerReady) {
                        clearInterval(checkInterval);
                        waitingForViewer = false;
                        processingQueue = false;
                        console.log('bGeigie viewer initialized. Processing queue...');
                        updateProgressDisplay(processedLogs, totalLogs, 'Map viewer ready, processing logs...');
                        try {
                            showTransferBar(true);
                        } catch (e) {
                            console.error('Error showing transfer bar:', e);
                        }
                        processLogQueue();
                    } else if (Date.now() - waitStart > maxViewerWaitTime) {
                        clearInterval(checkInterval);
                        waitingForViewer = false;
                        processingQueue = false;
                        console.error('Timed out waiting for bGeigie viewer to initialize');
                        
                        // If we have log data, try to process it directly
                        if (loadedLogData.length > 0) {
                            console.log(`Attempting to process ${loadedLogData.length} logs using fallback method...`);
                            updateProgressDisplay(processedLogs, totalLogs, 'Trying direct processing method...');
                            
                            // Try direct processing when RTMKS is not available
                            try {
                                processLoadedLogs();
                                processedLogs = loadedLogData.length;
                                
                                setTimeout(function() {
                                    updateProgressDisplay(processedLogs, totalLogs, 'All logs processed (using fallback method)');
                                    // Close popup after a delay
                                    setTimeout(function() {
                                        removeProgressPopup();
                                        try {
                                            showTransferBar(false);
                                        } catch (e) {
                                            console.error('Error hiding transfer bar:', e);
                                        }
                                    }, 2000);
                                }, 1000);
                            } catch (e) {
                                console.error('Error in fallback processing:', e);
                                updateProgressDisplay(processedLogs, totalLogs, 'Error processing logs: ' + e.message);
                                setTimeout(removeProgressPopup, 3000);
                            }
                        } else {
                            updateProgressDisplay(0, 0, 'No logs to process or error loading data');
                            setTimeout(removeProgressPopup, 3000);
                        }
                    }
                }, 1000);
            }
            return;
        }
        
        // Process one log at a time
        var item = logQueue.shift();
        if (item) {
            try {
                console.log(`Processing log ${item.index+1}/${item.total}, ID: ${item.metadata.id}`);
                processedLogs++;
                updateProgressDisplay(processedLogs, totalLogs, 'Processing log ' + processedLogs + ' of ' + totalLogs);
                showTransferBar(true);
                
                window._bvProxy._bvm.AddLogsByQueryFromString(item.logText);
                console.log(`Processed log ${item.index+1}/${item.total} successfully`);
                
                // If this is the last item, finish up
                if (logQueue.length === 0 && processedLogs >= totalLogs) {
                    console.log('All logs processed successfully');
                    updateProgressDisplay(processedLogs, totalLogs, 'All logs processed successfully!');
                    
                    // Close popup after a delay
                    setTimeout(function() {
                        removeProgressPopup();
                        showTransferBar(false);
                    }, 2000);
                }
                
                // Small delay between adding logs to prevent UI freezing
                setTimeout(function() {
                    processingQueue = false;
                    processLogQueue();
                }, 250);
            } catch (e) {
                console.error('Error processing log:', e);
                processedLogs++;
                updateProgressDisplay(processedLogs, totalLogs, 'Error processing log: ' + e.message);
                processingQueue = false;
                // Continue with next log even if there's an error
                processLogQueue();
            }
        } else {
            processingQueue = false;
            showTransferBar(false);
        }
    }

    // Utility to fetch JSON from API
    function fetchJson(url) {
        return fetch(url).then(function(res) {
            if (!res.ok) throw new Error('Network error ' + res.status);
            
            // First get the response as text so we can sanitize it if needed
            return res.text().then(function(text) {
                try {
                    // Try to parse the text as JSON
                    return JSON.parse(text);
                } catch (e) {
                    console.error('JSON parse error, attempting to clean the response', e);
                    
                    // Attempt to clean the JSON response
                    try {
                        // Check if the text starts with a "[" to ensure it's trying to be an array
                        if (text.trim().startsWith('[')) {
                            // Find the start and end of the JSON array
                            const startIndex = text.indexOf('[');
                            const endIndex = text.lastIndexOf(']') + 1;
                            
                            if (startIndex !== -1 && endIndex > startIndex) {
                                // Extract the JSON array
                                let jsonText = text.substring(startIndex, endIndex);
                                
                                // Clean the JSON text - remove invalid characters and fix common issues
                                jsonText = jsonText
                                    .replace(/[^\x20-\x7E]/g, '') // Remove non-printable ASCII
                                    .replace(/\\u0000/g, '') // Remove null bytes
                                    .replace(/[\r\n]+/g, '') // Remove newlines
                                    .replace(/,\s*}/g, '}') // Fix trailing commas in objects
                                    .replace(/,\s*\]/g, ']'); // Fix trailing commas in arrays
                                
                                // Try to parse the cleaned JSON
                                return JSON.parse(jsonText);
                            }
                        }
                        
                        // If we get here, cleaning failed
                        throw new Error('Could not clean or parse JSON response');
                    } catch (cleanError) {
                        console.error('Failed to clean and parse JSON:', cleanError);
                        throw new Error('Invalid API response: ' + cleanError.message);
                    }
                }
            });
        });
    }

    // Utility to fetch a log file as text
    function fetchLogFile(url) {
        // For external URLs, use as is. For API URLs, proxy through our API endpoint
        if (url && url.startsWith('http')) {
            // External URL, use directly
        return fetch(url).then(function(res) {
            if (!res.ok) throw new Error('Log fetch error ' + res.status);
            return res.text();
        });
        } else {
            // API URL, add proxy prefix
            return fetch('/api' + url).then(function(res) {
                if (!res.ok) throw new Error('Log fetch error ' + res.status);
                return res.text();
            });
        }
    }

    // Main loader: fetch all pages
    function loadCosmicLogs(progressCallback) {
        // Reset counters and data
        totalLogs = 0;
        processedLogs = 0;
        loadedLogData = [];
        
        // Create progress popup
        createProgressPopup();
        
        // Clear the queue before starting a new load
        logQueue = [];
        
        // Try to force initialize RTMKS before we start
        forceInitializeRTMKS();
        
        var perPage = 20;
        var allImports = [];
        var page = 1;
        function fetchPage() {
            var url = '/api/bgeigie_imports.json?subtype=Cosmic&order=created_at+desc&per_page=' + perPage + '&page=' + page;
            console.log('Fetching cosmic logs from:', url);
            updateProgressDisplay(0, 0, 'Fetching cosmic logs page ' + page + '...');
            
            fetchJson(url).then(function(imports) {
                if (!imports || !Array.isArray(imports)) {
                    console.error('Unexpected cosmic log API response format:', imports);
                    updateProgressDisplay(0, 0, 'Error: Invalid API response format');
                    return;
                }
                
                console.log('Received cosmic logs, count:', imports.length);
                
                if (imports.length === 0) {
                    // No more results, start loading logs
                    var total = allImports.length;
                    totalLogs = total;
                    var loaded = 0;
                    if (total === 0) {
                        console.log('No cosmic logs found.');
                        updateProgressDisplay(0, 0, 'No cosmic logs found');
                        if (progressCallback) progressCallback(0, 0);
                        
                        // Close popup after a delay
                        setTimeout(removeProgressPopup, 3000);
                        return;
                    }
                    
                    console.log(`Found ${total} cosmic logs, starting to load them...`);
                    updateProgressDisplay(0, total, `Found ${total} cosmic logs, loading...`);
                    
                    // Try again to initialize RTMKS
                    forceInitializeRTMKS();
                    
                    // Only use approved logs
                    var approvedImports = allImports.filter(function(imp) {
                        return imp.approved === true;
                    });
                    
                    if (approvedImports.length < allImports.length) {
                        console.log(`Filtered ${allImports.length - approvedImports.length} unapproved logs, using ${approvedImports.length} approved logs`);
                        allImports = approvedImports;
                        totalLogs = allImports.length;
                    }
                    
                    // Start a loading indicator if there are many logs
                    if (totalLogs > 10) {
                        // No need for an alert since we have the progress popup now
                        console.log(`Loading ${totalLogs} cosmic logs. This may take some time.`);
                    }
                    
                    allImports.forEach(function(imp, idx) {
                        var logUrl = imp.source && imp.source.url;
                        if (!logUrl) {
                            console.warn('No log file URL for import', imp);
                            loaded++;
                            if (progressCallback) progressCallback(loaded, totalLogs);
                            return;
                        }
                        
                        console.log(`Loading cosmic log ${idx+1}/${totalLogs}: ${logUrl}`);
                        updateProgressDisplay(loaded, totalLogs, `Loading log file ${idx+1}/${totalLogs}...`);
                        
                        fetchLogFile(logUrl).then(function(logText) {
                            console.log(`Received log file ${idx+1}/${totalLogs}, length: ${logText.length} bytes`);
                            
                            // Store loaded log data
                            loadedLogData.push({
                                logText: logText,
                                metadata: imp,
                                index: idx,
                                total: totalLogs
                            });
                            
                            // Add to queue instead of processing immediately
                            logQueue.push({
                                logText: logText, 
                                metadata: imp,
                                index: idx,
                                total: totalLogs
                            });
                            
                            // Start processing the queue if not already processing
                            processLogQueue();
                            
                            // Report progress
                            if (progressCallback) progressCallback(loaded + 1, totalLogs);
                            
                        }).catch(function(e) {
                            console.error('Failed to fetch log file:', logUrl, e);
                            updateProgressDisplay(loaded, totalLogs, `Error fetching log ${idx+1}: ${e.message}`);
                            // Report progress even for failed logs
                            if (progressCallback) progressCallback(loaded + 1, totalLogs);
                        }).finally(function() {
                            loaded++;
                        });
                    });
                    return;
                }
                
                allImports = allImports.concat(imports);
                page++;
                console.log(`Fetched ${imports.length} cosmic logs (page ${page-1}), continuing...`);
                updateProgressDisplay(0, allImports.length, `Found ${allImports.length} logs, fetching page ${page}...`);
                fetchPage();
            }).catch(function(e) {
                console.error('Failed to fetch cosmic logs:', e);
                updateProgressDisplay(0, 0, 'Error fetching cosmic logs: ' + e.message);
                // Alert user about the error
                alert('Failed to fetch cosmic logs: ' + e.message);
                
                // Close popup after a delay
                setTimeout(removeProgressPopup, 5000);
            });
        }
        
        console.log('Starting to fetch cosmic logs...');
        updateProgressDisplay(0, 0, 'Starting to fetch cosmic logs...');
        fetchPage();
    }

    // Expose loader to global scope
    global.CosmicLogLoader = {
        load: loadCosmicLogs
    };

})(window);
