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
    // Add mock device data with different tube types
    const mockDevices = [
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
    
    // Create markers for these mock devices
    createMarkersFromDevices(mockDevices);
    
    // Fix 1: Patch the GetInfoWindowHtmlForParams function
    if (typeof RTMKS.GetInfoWindowHtmlForParams === 'function') {
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
            console.log('Successfully parsed device info:', deviceInfo);
            
            if (deviceInfo) {
              // Set device info
              deviceUrn = deviceInfo.device_urn || '';
              deviceClass = deviceInfo.device_class || '';
              
              // Set display location
              if (locations && locations.length > 0 && locations[0] !== 'Unknown') {
                displayLocation = locations[0];
              } else if (deviceInfo.device_class && deviceInfo.device_urn) {
                const deviceNumber = deviceInfo.device_urn.split(':')[1] || '';
                if (deviceNumber) {
                  displayLocation = deviceInfo.device_class + ' ' + deviceNumber;
                } else {
                  displayLocation = deviceInfo.device_class;
                }
              }
              
              // Get tube data and determine radiation value based on tube type
              if (deviceInfo.lnd_7318u !== undefined) {
                cpm = deviceInfo.lnd_7318u;
                value = (cpm * 0.0057).toFixed(3); // Standard conversion factor
                tubeType = 'lnd_7318u';
                tubeData[tubeType] = cpm;
                hasTubeData = true;
              } else if (deviceInfo.lnd_7128ec !== undefined) {
                cpm = deviceInfo.lnd_7128ec;
                value = (cpm * 0.0063).toFixed(3); // Different conversion factor
                tubeType = 'lnd_7128ec';
                tubeData[tubeType] = cpm;
                hasTubeData = true;
              } else if (deviceInfo.lnd_712u !== undefined) {
                cpm = deviceInfo.lnd_712u;
                value = (cpm * 0.0051).toFixed(3); // Different conversion factor
                tubeType = 'lnd_712u';
                tubeData[tubeType] = cpm;
                hasTubeData = true;
              } else if (deviceInfo.lnd_7318c !== undefined) {
                cpm = deviceInfo.lnd_7318c;
                value = (cpm * 0.0059).toFixed(3); // Different conversion factor
                tubeType = 'lnd_7318c';
                tubeData[tubeType] = cpm;
                hasTubeData = true;
              }
              
              // Format measurement time
              if (deviceInfo.when_captured) {
                try {
                  const captureDate = new Date(deviceInfo.when_captured);
                  if (!isNaN(captureDate.getTime())) {
                    measurementTime = captureDate.toLocaleString();
                  }
                } catch (e) {
                  console.log('Error parsing date');
                }
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
            displayLocation = ids && ids.length > 0 ? 'Device ' + ids[0] : 'Unknown Device';
          }
        }
        
        // If we don't have a device URN or class from JSON, try to get it from the parameters
        if (!deviceUrn && device_urns && device_urns.length > 0) {
          deviceUrn = device_urns[0];
        }
        
        if (!deviceClass && device_classes && device_classes.length > 0) {
          deviceClass = device_classes[0];
        }
        
        // If we have a value from tube data, update the values array
        if (hasTubeData && values && values.length > 0) {
          values[0] = value;
        }
        
        // Build custom popup HTML
        let html = "<div style='font-family: Arial, sans-serif; padding: 10px; width: 100%;'>";
        
        // Title: Bold device name
        html += "<div style='font-size:16px; font-weight:bold; margin-bottom:10px;'>" + displayLocation + "</div>";
        
        // Device section
        html += "<div style='font-size:14px; font-weight:bold; margin-top:10px;'>Device</div>";
        html += "<div style='font-size:13px; margin-top:5px;'>Device URN: " + deviceUrn + "</div>";
        html += "<div style='font-size:13px;'>Device Class: " + deviceClass + "</div>";
        
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
          
          if (cpm > 0) {
            html += "<div style='font-size:13px; margin-top:3px;'>" + cpm + " CPM</div>";
          }
        }
        
        // Add measurement time if available
        if (measurementTime) {
          html += "<div style='font-size:13px; margin-top:15px;'>Measured at: " + measurementTime + "</div>";
        } else if (unixSSs && unixSSs.length > 0) {
          try {
            var timestamp = new Date(parseInt(unixSSs[0]) * 1000);
            if (!isNaN(timestamp.getTime())) {
              html += "<div style='font-size:13px; margin-top:15px;'>Measured at: " + timestamp.toLocaleString() + "</div>";
            }
          } catch (e) {
            console.log('Error parsing timestamp');
          }
        }
        
        // More info link
        html += "<div style='font-size:13px; margin-top:15px; text-align:center;'><a href='#' style='color:#0066cc; text-decoration:none;'>\u8a73\u7d30 \u00b7 more info</a></div>";
        html += "</div>";
        
        return html;
      };
      
      console.log('GetInfoWindowHtmlForParams patched successfully');
    } else {
      console.error('GetInfoWindowHtmlForParams not found');
    }
    
    // Fix 2: Patch the ParseJSON function in RTMKS if it exists
    if (typeof RTMKS !== 'undefined' && typeof RTMKS.ParseJSON === 'function') {
      const originalParseJSON = RTMKS.ParseJSON;
      
      RTMKS.ParseJSON = function(obj) {
        console.log('Patched RTMKS.ParseJSON called');
        
        // Call the original function
        const result = originalParseJSON(obj);
        
        // Process the result to fix geigiecast devices
        if (result && result.rts && Array.isArray(result.rts)) {
          console.log('Processing ParseJSON results for geigiecast devices');
          
          for (let i = 0; i < result.rts.length; i++) {
            if (result.rts[i].device_class === 'geigiecast' || result.rts[i].device_class === 'pointcast') {
              console.log('Found geigiecast device:', result.rts[i].device_urn || result.rts[i].id);
              
              // Set location
              if (result.rts[i].device_class && result.rts[i].device_urn) {
                const deviceNumber = result.rts[i].device_urn.split(':')[1] || '';
                if (deviceNumber) {
                  result.rts[i].location = result.rts[i].device_class + ' ' + deviceNumber;
                  console.log('Set location to:', result.rts[i].location);
                }
              }
              
              // Process radiation value based on tube type with specific conversion factors
              if (result.rts[i].lnd_7318u !== undefined) {
                const radiationValue = parseFloat(result.rts[i].lnd_7318u) * 0.0057; // Standard conversion factor
                result.rts[i].value = radiationValue.toFixed(3);
                result.rts[i].dres = radiationValue;
                console.log('Set radiation value for lnd_7318u to:', result.rts[i].value);
              } else if (result.rts[i].lnd_7128ec !== undefined) {
                const radiationValue = parseFloat(result.rts[i].lnd_7128ec) * 0.0063; // Different conversion factor
                result.rts[i].value = radiationValue.toFixed(3);
                result.rts[i].dres = radiationValue;
                console.log('Set radiation value for lnd_7128ec to:', result.rts[i].value);
              } else if (result.rts[i].lnd_712u !== undefined) {
                const radiationValue = parseFloat(result.rts[i].lnd_712u) * 0.0051; // Different conversion factor
                result.rts[i].value = radiationValue.toFixed(3);
                result.rts[i].dres = radiationValue;
                console.log('Set radiation value for lnd_712u to:', result.rts[i].value);
              } else if (result.rts[i].lnd_7318c !== undefined) {
                const radiationValue = parseFloat(result.rts[i].lnd_7318c) * 0.0059; // Different conversion factor
                result.rts[i].value = radiationValue.toFixed(3);
                result.rts[i].dres = radiationValue;
                console.log('Set radiation value for lnd_7318c to:', result.rts[i].value);
              }
            }
          }
        }
        
        return result;
      };
      
      console.log('RTMKS.ParseJSON patched successfully');
    } else {
      console.log('RTMKS.ParseJSON not found or not patchable');
    }
    
    console.log('Safecast Popup Fix applied successfully');
  }
  
  // Function to create markers from device data
  function createMarkersFromDevices(devices) {
    if (!window.map || !devices || !devices.length) {
      console.error('Cannot create markers: map or devices missing');
      return;
    }
    
    console.log('Creating markers for', devices.length, 'devices');
    
    // Create markers for each device
    for (var i = 0; i < devices.length; i++) {
      var device = devices[i];
      
      // Skip devices without location
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
      
      // Create SVG icons that match the legend
      function createSvgIcon(innerCircleColor, outerCircleColor, dotColor) {
        // Create SVG icon similar to the legend
        var svg = `
          <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24">
            <circle cx="12" cy="12" r="11" fill="${outerCircleColor}" stroke="black" stroke-width="1"/>
            <circle cx="12" cy="12" r="8" fill="${innerCircleColor}" stroke="black" stroke-width="1"/>
            <circle cx="12" cy="12" r="3" fill="${dotColor}" stroke="black" stroke-width="0.5"/>
          </svg>
        `;
        return 'data:image/svg+xml;charset=UTF-8,' + encodeURIComponent(svg);
      }
      
      // Match the icons in the legend
      if (deviceType === 'pointcast') {
        // Pointcast: Green outer, white inner, purple dot (like the offline icon in legend)
        iconUrl = createSvgIcon('#FFFFFF', '#00FF00', '#800080');
      } else if (deviceType === 'bgeigie') {
        // bGeigie: Green outer, white inner, green dot
        iconUrl = createSvgIcon('#FFFFFF', '#00FF00', '#00FF00');
      } else if (deviceType === 'geigiecast') {
        // GeigieCast: Green outer, white inner, blue dot
        iconUrl = createSvgIcon('#FFFFFF', '#00FF00', '#0000FF');
      } else {
        // Default: Green outer, white inner, green dot (like the online icon in legend)
        iconUrl = createSvgIcon('#FFFFFF', '#00FF00', '#00FF00');
      }
      
      // Create marker with custom icon
      var marker = new google.maps.Marker({
        position: position,
        map: window.map,
        title: device.device_class + ' ' + (device.device_urn ? device.device_urn.split(':')[1] : device.device),
        icon: {
          url: iconUrl,
          size: new google.maps.Size(iconSize, iconSize),
          origin: new google.maps.Point(0, 0),
          anchor: new google.maps.Point(iconSize/2, iconSize/2)
        }
      });
      
      // If the measurement is recent, add a green circle overlay
      if (isRecent) {
        var recentCircle = new google.maps.Circle({
          strokeColor: '#00FF00',
          strokeOpacity: 0.8,
          strokeWeight: 2,
          fillColor: '#00FF00',
          fillOpacity: 0.1,
          map: window.map,
          center: position,
          radius: 100 // 100 meters radius
        });
        
        // Store the circle with the marker for reference
        marker.recentCircle = recentCircle;
      }
      
      // Store device data with the marker
      marker.deviceData = device;
      marker.tubeData = tubeData;
      marker.totalCpm = totalCpm;
      marker.highestValue = highestValue;
      
      // Add click event to show info window
      (function(marker) {
        google.maps.event.addListener(marker, 'click', function() {
          var device = marker.deviceData;
          
          // Create info window content
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
          
          // Create info window content
          var content = RTMKS.GetInfoWindowHtmlForParams(
            [title], // locations
            [device.loc_lat || ''], // lats
            [device.loc_lon || ''], // lons
            [device.device_urn || ''], // device_urns
            [device.device_class || ''], // device_classes
            [cpmValues], // cpms (array of CPM values)
            [marker.highestValue], // values (converted to µSv/h)
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
    }
    
    console.log('Created markers for devices');
  }
  
  // Function to fetch real sensor data from the API
  function fetchRealSensorData() {
    console.log('Fetching real sensor data from API...');
    
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
            
            // Don't use mock devices if we have real ones
            return;
          } else {
            throw new Error('No valid devices with location data found');
          }
        } catch (error) {
          console.error('Error processing device data:', error);
          // Continue to fallback
        }
        
        // Fall back to mock data
        console.log('Falling back to mock device data');
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
        
        // Create markers for the mock devices
        createMarkersFromDevices(mockDevices);
      })
      .catch(error => {
        console.error('Error fetching device data:', error);
        
        console.log('Falling back to mock device data due to fetch error');
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
        
        // Create markers for the mock devices
        createMarkersFromDevices(mockDevices);
      });
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
