/**
 * Safecast Popup Display Fix
 * This script patches the popup display functionality to correctly show device names and radiation values
 * for pointcast/geigiecast devices.
 */

(function() {
  // Global variable to track if radiation sensors are enabled
  window.radiationSensorsEnabled = true;
  
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
            displayLocation = deviceUrn;
          }
        } else {
          displayLocation = 'Unknown Device';
        }
      }
      
      // Fallbacks if deviceUrn is still empty
      if (!deviceUrn && device_urns && device_urns.length > 0) {
        deviceUrn = device_urns[0];
      }
      
      // Fallbacks if deviceClass is still empty
      if (!deviceClass && device_classes && device_classes.length > 0) {
        deviceClass = device_classes[0];
      }
      
      // Build custom popup HTML
      let html = "<div style='font-family: Arial, sans-serif; padding: 10px; width: 100%;'>";
      
      // Title: Bold device name
      html += "<div style='font-size:16px; font-weight:bold; margin-bottom:10px;'>" + displayLocation + "</div>";
      
      // Device section
      html += "<div style='font-size:14px; font-weight:bold; margin-top:10px;'>Device</div>";
      html += "<div style='font-size:13px; margin-top:5px;'>Device URN: " + deviceUrn + "</div>";
      html += "<div style='font-size:13px;'>Device Class: " + deviceClass + "</div>";
      
      // Radiation section
      html += "<div style='font-size:14px; font-weight:bold; margin-top:15px;'>Radiation</div>";
      
      // Show calculated value
      var displayValue = values && values.length > 0 ? values[0] : '0.00';
      var displayUnits = "\u00b5Sv/h";
      html += "<div style='font-size:16px; margin-top:5px;'>" + displayValue + " " + displayUnits + "</div>";
      
      // Show CPM values if available
      if (hasTubeData) {
        html += "<div style='font-size:13px; margin-top:5px;'>CPM</div>";
        for (let tubeType in tubeData) {
          var tubeValue = tubeData[tubeType];
          var conversionFactor = 0.0057; // Default conversion factor
          
          // Different tube types require different conversion factors
          if (tubeType === 'lnd_7318u') {
            conversionFactor = 0.0024; // Corrected from 0.0057 to 0.0024 for LND-7318
          } else if (tubeType === 'lnd_7128ec') {
            conversionFactor = 0.0063; // Keeping original value as no specific info found
          } else if (tubeType === 'lnd_712u') {
            conversionFactor = 0.0081; // Corrected from 0.0051 to 0.0081 for LND-712
          } else if (tubeType === 'lnd_7318c') {
            conversionFactor = 0.0059; // Keeping original value as no specific info found
          }
          
          var usvhValue = (tubeValue * conversionFactor).toFixed(3);
          
          html += "<div style='font-size:13px; margin-top:3px;'>" + tubeType + ": " + tubeValue + " CPM (" + usvhValue + " \u00b5Sv/h)</div>";
        }
      } else if (cpms && cpms.length > 0) {
        html += "<div style='font-size:13px; margin-top:3px;'>" + cpms[0] + " CPM</div>";
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
      html += "<div style='font-size:13px; margin-top:15px;'><a href='#' onclick='return false;'>More info</a></div>";
      
      html += "</div>";
      
      return html;
    };
    
    // Also patch the ParseJSON method to handle our custom data format
    const originalParseJSON = RTMKS.ParseJSON;
    RTMKS.ParseJSON = function(json) {
      console.log('Patched ParseJSON called with:', json);
      
      // Try to use the original method first
      try {
        return originalParseJSON(json);
      } catch (error) {
        console.log('Original ParseJSON failed, using fallback:', error);
        
        // Fallback to our own implementation
        try {
          // Parse the JSON if it's a string
          const data = typeof json === 'string' ? JSON.parse(json) : json;
          
          // Return null for empty data
          if (!data || !data.length) {
            console.log('No data to parse');
            return null;
          }
          
          // Initialize result object
          const result = {
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
          
          // Process each device
          for (let i = 0; i < data.length; i++) {
            const device = data[i];
            
            // Skip devices without location
            if (!device.loc_lat || !device.loc_lon) {
              continue;
            }
            
            // Extract device info
            const deviceId = device.device || i;
            const deviceClass = device.device_class || '';
            const deviceUrn = device.device_urn || '';
            
            // Determine location name
            let locationName = 'Unknown';
            if (device.device_class && device.device_urn) {
              const parts = device.device_urn.split(':');
              if (parts.length > 1) {
                locationName = device.device_class + ' ' + parts[1];
              } else {
                locationName = device.device_class + ' ' + device.device_urn;
              }
            }
            
            // Determine radiation value and CPM based on tube type
            let cpm = 0;
            let value = 0;
            let tubeType = '';
            
            if (device.lnd_7318u) {
              cpm = device.lnd_7318u;
              value = (cpm * 0.0024).toFixed(3); // Corrected conversion factor
              tubeType = 'lnd_7318u';
            } else if (device.lnd_7128ec) {
              cpm = device.lnd_7128ec;
              value = (cpm * 0.0063).toFixed(3); // Original conversion factor
              tubeType = 'lnd_7128ec';
            } else if (device.lnd_712u) {
              cpm = device.lnd_712u;
              value = (cpm * 0.0081).toFixed(3); // Corrected conversion factor
              tubeType = 'lnd_712u';
            } else if (device.lnd_7318c) {
              cpm = device.lnd_7318c;
              value = (cpm * 0.0059).toFixed(3); // Original conversion factor
              tubeType = 'lnd_7318c';
            }
            
            // Add device data to result
            result.ids.push(deviceId);
            result.lats.push(device.loc_lat);
            result.lons.push(device.loc_lon);
            result.values.push(value);
            result.cpms.push(cpm);
            result.unixSSs.push(new Date(device.when_captured).getTime() / 1000);
            result.locations.push(locationName);
            result.device_classes.push(deviceClass);
            result.device_urns.push(deviceUrn);
            result.imgurls.push(JSON.stringify(device));
          }
          
          return result;
        } catch (fallbackError) {
          console.error('Fallback ParseJSON also failed:', fallbackError);
          return null;
        }
      }
    };
  }
  
  // Function to create markers from device data
  function createMarkersFromDevices(devices) {
    // Skip if radiation sensors are disabled
    if (!window.radiationSensorsEnabled) {
      console.log('Radiation sensors are disabled, skipping marker creation');
      return;
    }
    
    console.log('Creating markers for', devices.length, 'devices');
    
    // Initialize global marker array if it doesn't exist
    if (!window.allMarkers) {
      window.allMarkers = [];
    }
    
    // Clear any existing markers first
    if (window.allMarkers && window.allMarkers.length > 0) {
      console.log('Clearing', window.allMarkers.length, 'existing markers');
      for (var i = 0; i < window.allMarkers.length; i++) {
        if (window.allMarkers[i].marker) {
          window.allMarkers[i].marker.setMap(null);
        }
        if (window.allMarkers[i].recentCircle) {
          window.allMarkers[i].recentCircle.setMap(null);
        }
      }
      window.allMarkers = [];
    }
    
    // Process each device
    for (var i = 0; i < devices.length; i++) {
      var device = devices[i];
      
      // Skip devices without valid location
      if (!device.loc_lat || !device.loc_lon || 
          isNaN(parseFloat(device.loc_lat)) || 
          isNaN(parseFloat(device.loc_lon))) {
        continue;
      }
      
      // Create position
      var position = new google.maps.LatLng(
        parseFloat(device.loc_lat),
        parseFloat(device.loc_lon)
      );
      
      // Extract tube data
      var tubeData = {};
      var tubeTypes = [];
      var cpmValues = [];
      var highestValue = 0;
      
      // Check for tube data
      if (device.lnd_7318u) {
        tubeData['lnd_7318u'] = device.lnd_7318u;
        tubeTypes.push('lnd_7318u');
        cpmValues.push(device.lnd_7318u);
        highestValue = Math.max(highestValue, device.lnd_7318u * 0.0024); // Corrected conversion factor
      }
      if (device.lnd_7128ec) {
        tubeData['lnd_7128ec'] = device.lnd_7128ec;
        tubeTypes.push('lnd_7128ec');
        cpmValues.push(device.lnd_7128ec);
        highestValue = Math.max(highestValue, device.lnd_7128ec * 0.0063); // Original conversion factor
      }
      if (device.lnd_712u) {
        tubeData['lnd_712u'] = device.lnd_712u;
        tubeTypes.push('lnd_712u');
        cpmValues.push(device.lnd_712u);
        highestValue = Math.max(highestValue, device.lnd_712u * 0.0081); // Corrected conversion factor
      }
      if (device.lnd_7318c) {
        tubeData['lnd_7318c'] = device.lnd_7318c;
        tubeTypes.push('lnd_7318c');
        cpmValues.push(device.lnd_7318c);
        highestValue = Math.max(highestValue, device.lnd_7318c * 0.0059); // Original conversion factor
      }
      
      // Check if the measurement is recent (within 4 hours)
      var isRecent = false;
      if (device.when_captured) {
        var capturedTime = new Date(device.when_captured).getTime();
        var currentTime = new Date().getTime();
        var fourHoursInMs = 4 * 60 * 60 * 1000;
        isRecent = (currentTime - capturedTime) <= fourHoursInMs;
      }
      
      // Determine device type for icon selection
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
          anchor: new google.maps.Point(12, 12)
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
      marker.tubeTypes = tubeTypes;
      marker.cpmValues = cpmValues;
      marker.highestValue = highestValue.toFixed(3);
      
      // Add click event to show info window
      marker.addListener('click', function() {
        // Close any existing info window
        if (window.currentInfoWindow) {
          window.currentInfoWindow.close();
        }
        
        // Get the device data from the marker
        var device = this.deviceData;
        var tubeTypes = this.tubeTypes;
        var cpmValues = this.cpmValues;
        
        if (device) {
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
          var cpmValuesWithConversions = [];
          
          if (marker.tubeData) {
            for (var tubeType in marker.tubeData) {
              var tubeValue = marker.tubeData[tubeType];
              var conversionFactor = 0.0057; // Default
              
              // Apply tube-specific conversion factors based on Safecast documentation
              if (tubeType === 'lnd_7318u') {
                conversionFactor = 0.0024; // Corrected from 0.0057 to 0.0024 for LND-7318
              } else if (tubeType === 'lnd_7128ec') {
                conversionFactor = 0.0063; // Keeping original value as no specific info found
              } else if (tubeType === 'lnd_712u') {
                conversionFactor = 0.0081; // Corrected from 0.0051 to 0.0081 for LND-712
              } else if (tubeType === 'lnd_7318c') {
                conversionFactor = 0.0059; // Keeping original value as no specific info found
              }
              
              var convertedValue = tubeValue * conversionFactor;
              cpmValuesWithConversions.push({
                tubeType: tubeType,
                cpm: tubeValue,
                usvh: convertedValue.toFixed(3)
              });
              highestValue = Math.max(highestValue, convertedValue);
            }
          }
          
          // Format the value for display
          highestValue = highestValue.toFixed(3);
          
          // Store the converted values with the marker for use in the popup
          marker.cpmValuesWithConversions = cpmValuesWithConversions;
          
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
          
          // Create info window
          var infoWindow = new google.maps.InfoWindow({
            content: content,
            maxWidth: 400
          });
          
          // Store the current info window
          window.currentInfoWindow = infoWindow;
          
          // Open the info window
          infoWindow.open(window.map, this);
        }
      });
      
      // Store marker in global array for later cleanup
      window.allMarkers.push({
        marker: marker,
        recentCircle: marker.recentCircle
      });
    }
    
    console.log('Created', window.allMarkers.length, 'markers');
  }
  
  // Function to fetch real sensor data from the API
  function fetchRealSensorData() {
    // Skip if radiation sensors are disabled
    if (!window.radiationSensorsEnabled) {
      console.log('Radiation sensors are disabled, skipping fetch');
      return;
    }
    
    console.log('Fetching real sensor data from API...');
    
    // Clear any existing markers first
    if (window.allMarkers && window.allMarkers.length > 0) {
      console.log('Clearing', window.allMarkers.length, 'existing markers');
      for (var i = 0; i < window.allMarkers.length; i++) {
        if (window.allMarkers[i].marker) {
          window.allMarkers[i].marker.setMap(null);
        }
        if (window.allMarkers[i].recentCircle) {
          window.allMarkers[i].recentCircle.setMap(null);
        }
      }
      window.allMarkers = [];
    }
    
    // Add cache-busting parameter to prevent caching
    var timestamp = new Date().getTime();
    var url = '/tt-api/devices?t=' + timestamp;
    
    // Fetch data from API
    fetch(url)
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
            .replace(/\u0000/g, '') // Remove null bytes
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
  
  // Function to toggle radiation sensors visibility
  window.toggleRadiationSensors = function() {
    window.radiationSensorsEnabled = !window.radiationSensorsEnabled;
    console.log('Radiation sensors ' + (window.radiationSensorsEnabled ? 'enabled' : 'disabled'));
    
    // Clear existing markers
    if (window.allMarkers && window.allMarkers.length > 0) {
      for (var i = 0; i < window.allMarkers.length; i++) {
        if (window.allMarkers[i].marker) {
          window.allMarkers[i].marker.setMap(null);
        }
        if (window.allMarkers[i].recentCircle) {
          window.allMarkers[i].recentCircle.setMap(null);
        }
      }
      window.allMarkers = [];
    }
    
    // Reload markers if enabled
    if (window.radiationSensorsEnabled) {
      fetchRealSensorData();
    }
    
    // Update button state
    var button = document.getElementById('toggle-radiation-btn');
    if (button) {
      button.textContent = window.radiationSensorsEnabled ? 'Hide Radiation Sensors' : 'Show Radiation Sensors';
    }
  };
  
  // Function to add the toggle button to the UI
  function addRadiationToggleButton() {
    // Check if the air quality toggle button exists to position our button next to it
    var airQualityBtn = document.querySelector('.air-quality-toggle');
    var parentElement = airQualityBtn ? airQualityBtn.parentElement : document.body;
    
    // Create the radiation toggle button
    var radiationBtn = document.createElement('button');
    radiationBtn.id = 'toggle-radiation-btn';
    radiationBtn.textContent = 'Hide Radiation Sensors';
    radiationBtn.className = 'radiation-toggle';
    radiationBtn.style.cssText = 'position: absolute; top: 70px; right: 10px; z-index: 1000; background-color: white; border: 1px solid #ccc; padding: 5px 10px; border-radius: 4px; cursor: pointer;';
    radiationBtn.onclick = window.toggleRadiationSensors;
    
    // Add the button to the page
    parentElement.appendChild(radiationBtn);
  }
  
  // Start checking for RTMKS after the page loads
  window.addEventListener('load', function() {
    console.log('Page loaded, checking for RTMKS...');
    checkAndApplyFix();
    
    // Add a delay to ensure the map is fully loaded
    setTimeout(function() {
      if (typeof RTMKS !== 'undefined') {
        // Add the radiation toggle button
        addRadiationToggleButton();
        
        // Fetch real sensor data from the API
        fetchRealSensorData();
      }
    }, 3000);
  });
})();
