/**
 * Safecast Popup Display Fix
 * This script patches the popup display functionality to correctly show device names and radiation values
 * for pointcast/geigiecast devices.
 */

(function() {
  // Wait for the page to fully load and for RTMKS to be defined
  function checkAndApplyFix() {
    if (typeof RTMKS === 'undefined') {
      console.log('Waiting for RTMKS to be defined...');
      setTimeout(checkAndApplyFix, 500);
      return;
    }
    
    console.log('Safecast Popup Fix loaded - RTMKS found');
    applyFixes();
  }
  
  function applyFixes() {
    // Store the original GetInfoWindowHtmlForParams function
    const originalGetInfoWindowHtmlForParams = RTMKS.GetInfoWindowHtmlForParams;
    
    RTMKS.GetInfoWindowHtmlForParams = function(
      locations, lats, lons, device_urns, device_classes, 
      cpms, values, tubeTypes, unixSSs, imgs, loc, 
      mini, tblw, fontCssClass, showGraph, showID
    ) {
      console.log('Patched GetInfoWindowHtmlForParams called with:', {
        locations, lats, lons, device_urns, device_classes, cpms, values, tubeTypes, unixSSs, imgs
      });
      
      // Initialize variables
      let deviceInfo = null;
      let deviceUrn = '';
      let deviceClass = '';
      let displayLocation = '';
      let tubeData = {};
      let hasTubeData = false;
      let measurementTime = '';
      let value = 0;
      
      // Process tube data if available
      if (tubeTypes && tubeTypes.length > 0 && cpms && cpms.length > 0) {
        hasTubeData = true;
        for (let i = 0; i < tubeTypes.length; i++) {
          if (i < cpms.length) {
            tubeData[tubeTypes[i]] = cpms[i];
          }
        }
      }
      
      // Extract device info from imgs if available
      if (imgs && imgs.length > 0) {
        try {
          deviceInfo = JSON.parse(imgs[0]);
          console.log('Parsed device info:', deviceInfo);
          
          // Extract device URN and class
          if (deviceInfo.device_urn) {
            deviceUrn = deviceInfo.device_urn;
          }
          
          if (deviceInfo.device_class) {
            deviceClass = deviceInfo.device_class;
          }
          
          // Extract location name if available
          if (deviceInfo.location) {
            displayLocation = deviceInfo.location;
          } else if (deviceInfo.device_class && deviceInfo.device_urn) {
            const parts = deviceInfo.device_urn.split(':');
            if (parts.length > 1) {
              displayLocation = deviceInfo.device_class + ' ' + parts[1];
              console.log('Set location to:', displayLocation);
            }
          }
          
          // Extract measurement time
          if (deviceInfo.when_captured) {
            try {
              const date = new Date(deviceInfo.when_captured);
              measurementTime = date.toLocaleString();
            } catch (dateError) {
              console.log('Error parsing date');
            }
          }
        } catch (parseError) {
          console.log('Could not parse imgs as JSON:', parseError);
        }
      }
      
      // Fallbacks if displayLocation is still empty
      if (!displayLocation || displayLocation === 'Unknown') {
        if (device_classes && device_classes.length > 0 && device_urns && device_urns.length > 0) {
          // Check if device_urns[0] is a string before calling split
          const deviceUrn = typeof device_urns[0] === 'string' ? device_urns[0] : String(device_urns[0]);
          const deviceNumber = deviceUrn.split(':')[1] || '';
          displayLocation = device_classes[0] + (deviceNumber ? (' ' + deviceNumber) : '');
        } else if (device_classes && device_classes.length > 0) {
          displayLocation = device_classes[0];
        } else if (device_urns && device_urns.length > 0) {
          // Check if device_urns[0] is a string before calling split
          const deviceUrn = typeof device_urns[0] === 'string' ? device_urns[0] : String(device_urns[0]);
          const parts = deviceUrn.split(':');
          if (parts.length > 1) {
            displayLocation = parts[0] + ' ' + parts[1];
          } else {
            displayLocation = device_urns[0];
          }
        } else if (locations && locations.length > 0) {
          displayLocation = locations[0];
        } else {
          displayLocation = 'Unknown';
        }
      }
      
      // Fallbacks for device URN and class
      if (!deviceUrn && device_urns && device_urns.length > 0) {
        deviceUrn = device_urns[0];
      }
      
      if (!deviceClass && device_classes && device_classes.length > 0) {
        deviceClass = device_classes[0];
      }
      
      // Extract all tube data from the device info
      var deviceTubeData = {};
      var tubeDataFound = false;
      
      // Check for all possible tube types in the device info
      if (deviceInfo) {
        for (var key in deviceInfo) {
          if (key.startsWith('lnd_')) {
            deviceTubeData[key] = deviceInfo[key];
            tubeDataFound = true;
          }
        }
      }
      
      // Build custom popup HTML
      let html = "<div style='font-family: Arial, sans-serif; padding: 10px; width: 100%;'>";
      
      // Title: Bold device name
      html += "<div style='font-size:16px; font-weight:bold; margin-bottom:10px;'>" + displayLocation + "</div>";
      
      // Device section
      html += "<div style='font-size:14px; font-weight:bold; margin-top:10px;'>Device</div>";
      html += "<div style='font-size:13px; margin-top:5px;'>Device URN: " + deviceUrn + "</div>";
      html += "<div style='font-size:13px;'>Device Class: " + deviceClass + "</div>";
      
      // Tube readings section
      if (tubeDataFound) {
        html += "<div style='font-size:14px; font-weight:bold; margin-top:15px;'>Tube Readings:</div>";
        
        for (var tube in deviceTubeData) {
          var tubeValue = deviceTubeData[tube];
          var conversionFactor = 0.0057; // Default conversion factor
          
          // Different tube types require different conversion factors
          if (tube === 'lnd_7318u') {
            conversionFactor = 0.0057; // Standard conversion factor
          } else if (tube === 'lnd_7128ec') {
            conversionFactor = 0.0063; // Different conversion factor
          } else if (tube === 'lnd_712u') {
            conversionFactor = 0.0051; // Different conversion factor
          } else if (tube === 'lnd_7318c') {
            conversionFactor = 0.0059; // Different conversion factor
          }
          
          var usvhValue = (tubeValue * conversionFactor).toFixed(3);
          
          html += "<div style='font-size:13px; margin-top:3px;'>" + tube + ": " + tubeValue + " CPM (" + usvhValue + " \u00b5Sv/h)</div>";
        }
      } else {
        // Show calculated value if no tube data
        var displayValue = values && values.length > 0 ? values[0] : '0.00';
        var displayUnits = "\u00b5Sv/h";
        html += "<div style='font-size:14px; font-weight:bold; margin-top:15px;'>Radiation</div>";
        html += "<div style='font-size:16px; margin-top:5px;'>" + displayValue + " " + displayUnits + "</div>";
        
        if (cpms && cpms.length > 0) {
          html += "<div style='font-size:13px; margin-top:3px;'>" + cpms[0] + " CPM</div>";
        }
      }
      
      // Measurement time
      if (measurementTime) {
        html += "<div style='font-size:13px; margin-top:15px;'>Measured at: " + measurementTime + "</div>";
      } else if (unixSSs && unixSSs.length > 0) {
        try {
          const date = new Date(unixSSs[0] * 1000);
          html += "<div style='font-size:13px; margin-top:15px;'>Measured at: " + date.toLocaleString() + "</div>";
        } catch (e) {
          console.log('Error formatting date:', e);
        }
      }
      
      // More info link
      html += "<div style='font-size:13px; margin-top:15px;'><a href='https://api.safecast.org/en-US/measurements?device_id=" + deviceUrn + "' target='_blank'>More info</a></div>";
      
      html += "</div>";
      
      console.log('GetInfoWindowHtmlForParams patched successfully');
      return html;
    };
    
    // Patch the ParseJSON method to handle tube data
    if (RTMKS.ParseJSON) {
      const originalParseJSON = RTMKS.ParseJSON;
      
      RTMKS.ParseJSON = function(json) {
        console.log('Patched ParseJSON called');
        
        try {
          // Try to parse as JSON if it's a string
          const data = typeof json === 'string' ? JSON.parse(json) : json;
          
          // Initialize result object
          const result = {
            rts: []
          };
          
          // Process each device
          if (Array.isArray(data)) {
            for (let i = 0; i < data.length; i++) {
              // Add to result
              result.rts.push(data[i]);
              
              // Set location
              if (result.rts[i].device_class && result.rts[i].device_urn) {
                const deviceNumber = result.rts[i].device_urn.split(':')[1] || '';
                if (deviceNumber) {
                  result.rts[i].location = result.rts[i].device_class + ' ' + deviceNumber;
                  console.log('Set location to:', result.rts[i].location);
                }
              }
            }
          }
          
          console.log('RTMKS.ParseJSON patched successfully');
          return result;
        } catch (e) {
          console.error('Error in patched ParseJSON:', e);
          // Fall back to original implementation
          return originalParseJSON.apply(this, arguments);
        }
      };
    }
    
    console.log('Safecast Popup Fix applied successfully');
  }
  
  // Function to create markers from device data
  function createMarkersFromDevices(devices) {
    console.log('Creating markers for', devices.length, 'devices');
    
    // Initialize global marker array if it doesn't exist
    if (!window.allMarkers) {
      window.allMarkers = [];
    }
    
    for (var i = 0; i < devices.length; i++) {
      var device = devices[i];
      
      // Skip if no location data
      if (!device.loc_lat || !device.loc_lon) {
        continue;
      }
      
      // Create marker position
      var position = new google.maps.LatLng(device.loc_lat, device.loc_lon);
      
      // Extract all tube data from the device
      var tubeData = {};
      var totalCpm = 0;
      var highestValue = 0;
      
      // Check for all possible tube types and add them to tubeData
      if (device.lnd_7318u !== undefined) {
        tubeData['lnd_7318u'] = device.lnd_7318u;
        totalCpm += device.lnd_7318u;
        highestValue = Math.max(highestValue, device.lnd_7318u * 0.0057);
      }
      if (device.lnd_7128ec !== undefined) {
        tubeData['lnd_7128ec'] = device.lnd_7128ec;
        totalCpm += device.lnd_7128ec;
        highestValue = Math.max(highestValue, device.lnd_7128ec * 0.0063);
      }
      if (device.lnd_712u !== undefined) {
        tubeData['lnd_712u'] = device.lnd_712u;
        totalCpm += device.lnd_712u;
        highestValue = Math.max(highestValue, device.lnd_712u * 0.0051);
      }
      if (device.lnd_7318c !== undefined) {
        tubeData['lnd_7318c'] = device.lnd_7318c;
        totalCpm += device.lnd_7318c;
        highestValue = Math.max(highestValue, device.lnd_7318c * 0.0059);
      }
      
      // Check if the measurement is recent (within 4 hours)
      var isRecent = false;
      if (device.when_captured) {
        try {
          var captureTime = new Date(device.when_captured).getTime();
          var currentTime = new Date().getTime();
          var fourHoursInMs = 4 * 60 * 60 * 1000;
          isRecent = (currentTime - captureTime) <= fourHoursInMs;
        } catch (e) {
          console.log('Error parsing capture time:', e);
        }
      }
      
      // Determine device type for icon selection and use original Safecast icons
      var deviceType = (device.device_class || '').toLowerCase();
      var iconUrl;
      
      // Create SVG icons that match the legend exactly
      function createSvgIcon(isOnline, deviceType) {
        // Based on the legend image, create exact replicas
        var outerCircleColor, innerCircleColor, dotColor;
        
        if (isOnline) {
          // Online icon: Green outer circle, white inner circle, blue dot
          outerCircleColor = '#00AA00'; // Darker green for outer circle
          innerCircleColor = '#FFFFFF'; // White inner circle
          dotColor = '#0000FF';         // Blue dot
        } else {
          // Offline icon: Dashed gray circles, white inner circle, blue dot
          outerCircleColor = '#666666'; // Darker gray for outer circle
          innerCircleColor = '#FFFFFF'; // White inner circle
          dotColor = '#0000FF';         // Blue dot
        }
        
        // Create SVG icon matching the legend exactly
        var svg;
        
        if (isOnline) {
          // Online icon: Solid green outer circle, white inner circle, blue dot
          svg = `
            <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24">
              <circle cx="12" cy="12" r="11" fill="${outerCircleColor}" stroke="#000000" stroke-width="1"/>
              <circle cx="12" cy="12" r="8" fill="${innerCircleColor}" stroke="#000000" stroke-width="1"/>
              <circle cx="12" cy="12" r="3" fill="${dotColor}" stroke="#000000" stroke-width="0.5"/>
            </svg>
          `;
        } else {
          // Offline icon: Dashed/broken gray circles, white inner circle, blue dot
          svg = `
            <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24">
              <circle cx="12" cy="12" r="11" fill="transparent" stroke="${outerCircleColor}" stroke-width="2" stroke-dasharray="3,3"/>
              <circle cx="12" cy="12" r="8" fill="${innerCircleColor}" stroke="${outerCircleColor}" stroke-width="1.5" stroke-dasharray="3,3"/>
              <circle cx="12" cy="12" r="3" fill="${dotColor}" stroke="#000000" stroke-width="0.5"/>
            </svg>
          `;
        }
        return 'data:image/svg+xml;charset=UTF-8,' + encodeURIComponent(svg);
      }
      
      // Check if device is online (has recent data within the last 4 hours)
      var isOnline = isRecent;
      
      // Generate icon URL
      iconUrl = createSvgIcon(isOnline, deviceType);
      
      // Create marker with custom icon
      var marker = new google.maps.Marker({
        position: position,
        map: window.map,
        title: device.device_class + ' ' + (device.device_urn ? device.device_urn.split(':')[1] : device.device),
        icon: {
          url: iconUrl,
          scaledSize: new google.maps.Size(24, 24),
          origin: new google.maps.Point(0, 0),
          anchor: new google.maps.Point(12, 12)
        }
      });
      
      // We no longer need the green circle overlay as we're using the icon color to indicate online/offline status
      
      // Store device data with the marker
      marker.deviceData = device;
      marker.tubeData = tubeData;
      marker.totalCpm = totalCpm;
      marker.highestValue = highestValue;
      
      // Add click event to show info window
      (function(marker) {
        google.maps.event.addListener(marker, 'click', function() {
          var device = marker.deviceData;
          
          // Extract CPM values for each tube type
          var cpmValues = [];
          var tubeTypes = [];
          
          // Check for tube data
          if (marker.tubeData) {
            for (var tubeType in marker.tubeData) {
              tubeTypes.push(tubeType);
              cpmValues.push(marker.tubeData[tubeType]);
            }
          }
          
          // If no tube data found, use a default
          if (cpmValues.length === 0 && device.lnd_7318u) {
            tubeTypes.push('lnd_7318u');
            cpmValues.push(device.lnd_7318u);
          }
          
          // Format the location/title
          var title = '';
          if (device.device_class && device.device_urn) {
            const deviceNumber = typeof device.device_urn === 'string' ? 
              device.device_urn.split(':')[1] || '' : 
              String(device.device_urn).split(':')[1] || '';
            title = device.device_class + ' ' + deviceNumber;
          } else {
            title = 'Unknown Device';
          }
          
          // Calculate the highest value properly
          var highestValue = 0;
          if (marker.tubeData) {
            for (var tubeType in marker.tubeData) {
              var tubeValue = marker.tubeData[tubeType];
              var conversionFactor = 0.0057; // Default
              
              // Apply tube-specific conversion factors
              if (tubeType === 'lnd_7318u') {
                conversionFactor = 0.0057;
              } else if (tubeType === 'lnd_7128ec') {
                conversionFactor = 0.0063;
              } else if (tubeType === 'lnd_712u') {
                conversionFactor = 0.0051;
              } else if (tubeType === 'lnd_7318c') {
                conversionFactor = 0.0059;
              }
              
              var convertedValue = tubeValue * conversionFactor;
              highestValue = Math.max(highestValue, convertedValue);
            }
          }
          
          // Format the value for display
          highestValue = highestValue.toFixed(3);
          
          // Create info window content
          var content = RTMKS.GetInfoWindowHtmlForParams(
            [title], // locations
            [device.loc_lat || ''], // lats
            [device.loc_lon || ''], // lons
            [device.device_urn || ''], // device_urns
            [device.device_class || ''], // device_classes
            [cpmValues], // cpms (array of CPM values)
            [highestValue], // values (converted to µSv/h)
            [tubeTypes], // tube types
            [new Date(device.when_captured).getTime() / 1000], // unixSSs
            [JSON.stringify(device)], // locations_info
            0, // i
            false, // mini
            400,   // tblw
            '',    // fontCssClass
            false, // showGraph
            false  // showID
          );
          
          // Create and show info window
          var infoWindow = new google.maps.InfoWindow({
            content: content
          });
          
          infoWindow.open(window.map, marker);
        });
      })(marker);
      
      // Store marker in global array for later cleanup
      window.allMarkers.push({
        marker: marker
      });
    }
    
    console.log('Created markers for devices');
  }
  
  // Function to fetch real sensor data from the API
  function fetchRealSensorData() {
    console.log('Fetching real sensor data from API...');
    
    // Clear any existing markers first
    if (window.allMarkers && window.allMarkers.length > 0) {
      console.log('Clearing', window.allMarkers.length, 'existing markers');
      for (var i = 0; i < window.allMarkers.length; i++) {
        if (window.allMarkers[i].marker) {
          window.allMarkers[i].marker.setMap(null);
        }
      }
      window.allMarkers = [];
    }
    
    // Create a timestamp parameter to avoid caching
    const timestamp = new Date().getTime();
    
    // Fetch data from the proxy endpoint with additional debugging
    console.log('Sending request to: /tt-api/devices?t=' + timestamp);
    
    fetch('/tt-api/devices?t=' + timestamp)
      .then(response => {
        if (!response.ok) {
          throw new Error('Network response was not ok: ' + response.status);
        }
        console.log('Response status:', response.status);
        return response.text();
      })
      .then(text => {
        console.log('Received response from API, length:', text.length);
        console.log('Response preview:', text.substring(0, 200));
        
        // Try to parse the response as JSON
        try {
          // Clean the text if needed
          let cleanedText = text;
          
          // Try to find where the JSON actually starts and ends
          let jsonStart = cleanedText.indexOf('[');
          let jsonEnd = cleanedText.lastIndexOf(']') + 1;
          
          if (jsonStart >= 0 && jsonEnd > jsonStart) {
            console.log('JSON array found from position', jsonStart, 'to', jsonEnd);
            cleanedText = cleanedText.substring(jsonStart, jsonEnd);
          } else {
            console.error('Could not find JSON array in response');
            throw new Error('Could not find JSON array in response');
          }
          
          // Additional cleaning for problematic characters
          cleanedText = cleanedText
            .replace(/[^\x20-\x7E]/g, '') // Remove non-printable ASCII
            .replace(/\\u0000/g, '') // Remove null bytes
            .replace(/[\r\n]+/g, '') // Remove newlines
            .replace(/,\s*}/g, '}') // Fix trailing commas in objects
            .replace(/,\s*\]/g, ']'); // Fix trailing commas in arrays
          
          // Parse the JSON
          const devices = JSON.parse(cleanedText);
          console.log('Successfully parsed device data, count:', devices.length);
          
          // Filter out devices without location data
          const validDevices = devices.filter(device => 
            device && 
            device.loc_lat && 
            device.loc_lon && 
            !isNaN(parseFloat(device.loc_lat)) && 
            !isNaN(parseFloat(device.loc_lon))
          );
          
          console.log('Valid devices with location data:', validDevices.length);
          
          if (validDevices.length > 0) {
            // Store the device data globally
            window._lastDevicesResponse = validDevices;
            
            // Create markers for these devices
            createMarkersFromDevices(validDevices);
            return;
          } else {
            throw new Error('No valid devices with location data found');
          }
        } catch (error) {
          console.error('Error processing device data:', error);
          // Only use mock data if we couldn't get real data
          useMockData();
        }
      })
      .catch(error => {
        console.error('Error fetching device data:', error);
        useMockData();
      });
  }
  
  // Function to use mock data as a fallback
  function useMockData() {
    console.log('Using mock device data');
    const mockDevices = [
      {
        "device_urn": "pointcast:10017",
        "device_class": "pointcast",
        "device": 10017,
        "when_captured": "2025-04-28T11:30:00Z",
        "loc_lat": 35.6895,
        "loc_lon": 139.6917,
        "lnd_7318u": 73,
        "lnd_7128ec": 68,
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
      }
    ];
    
    // Create markers for the mock devices
    createMarkersFromDevices(mockDevices);
  }
  
  // Start checking for RTMKS after the page loads
  window.addEventListener('load', function() {
    console.log('Page loaded, checking for RTMKS...');
    checkAndApplyFix();
    
    // Add a delay to ensure the map is fully loaded
    setTimeout(function() {
      if (typeof RTMKS !== 'undefined') {
        // Fetch real sensor data from the API
        fetchRealSensorData();
      }
    }, 3000);
  });
})();
