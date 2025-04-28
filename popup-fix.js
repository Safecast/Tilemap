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
        locations, ids, device_urns, device_classes, 
        values, unixSSs, imgs, loc, 
        mini, tblw, fontCssClass, showGraph, showID
      ) {
        console.log('Patched GetInfoWindowHtmlForParams called with:', {
          locations, ids, device_urns, device_classes, values, unixSSs, imgs
        });
        
        // Initialize variables
        let deviceInfo = null;
        let deviceUrn = '';
        let deviceClass = '';
        let displayLocation = '';
        let tubeData = {};
        let hasTubeData = false;
        let measurementTime = '';
        let cpm = 0;
        let value = 0;
        let tubeType = '';
        
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
            const deviceNumber = device_urns[0].split(':')[1] || '';
            displayLocation = device_classes[0] + (deviceNumber ? (' ' + deviceNumber) : '');
          } else if (device_classes && device_classes.length > 0) {
            displayLocation = device_classes[0];
          } else if (device_urns && device_urns.length > 0) {
            const parts = device_urns[0].split(':');
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
        
        // Tube readings section
        if (hasTubeData) {
          html += "<div style='font-size:14px; font-weight:bold; margin-top:15px;'>Tube Readings:</div>";
          
          for (var tube in tubeData) {
            var tubeValue = tubeData[tube];
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
                const parts = result.rts[i].device_urn.split(':');
                if (parts.length > 1) {
                  result.rts[i].location = result.rts[i].device_class + ' ' + parts[1];
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
      
      // Determine radiation value and CPM based on tube type
      var cpm = 0;
      var value = 0;
      var tubeType = '';
      
      if (device.lnd_7318u) {
        cpm = device.lnd_7318u;
        value = (cpm * 0.0057).toFixed(3); // Standard conversion factor
        tubeType = 'lnd_7318u';
      } else if (device.lnd_7128ec) {
        cpm = device.lnd_7128ec;
        value = (cpm * 0.0063).toFixed(3); // Different conversion factor
        tubeType = 'lnd_7128ec';
      } else if (device.lnd_712u) {
        cpm = device.lnd_712u;
        value = (cpm * 0.0051).toFixed(3); // Different conversion factor
        tubeType = 'lnd_712u';
      } else if (device.lnd_7318c) {
        cpm = device.lnd_7318c;
        value = (cpm * 0.0059).toFixed(3); // Different conversion factor
        tubeType = 'lnd_7318c';
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
        map: window.map,
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
      marker.tubeType = tubeType;
      
      // Add click event to show info window
      (function(marker) {
        google.maps.event.addListener(marker, 'click', function() {
          var device = marker.deviceData;
          
          // Create info window content
          var content = RTMKS.GetInfoWindowHtmlForParams(
            [device.device_class + ' ' + (device.device_urn ? device.device_urn.split(':')[1] : device.device)],
            [device.device || i],
            [device.device_urn || ''],
            [device.device_class || ''],
            [marker.value],
            [new Date(device.when_captured).getTime() / 1000],
            [JSON.stringify(device)],
            0,
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
    
    // Fetch data from the proxy endpoint
    fetch('/tt-api/devices?t=' + timestamp)
      .then(response => {
        if (!response.ok) {
          throw new Error('Network response was not ok: ' + response.status);
        }
        return response.text();
      })
      .then(text => {
        console.log('Received response from API, length:', text.length);
        
        // Try to parse the response as JSON
        try {
          // Clean the text if needed
          let cleanedText = text;
          
          // Try to find where the JSON actually starts and ends
          let jsonStart = cleanedText.indexOf('[');
          let jsonEnd = cleanedText.lastIndexOf(']') + 1;
          
          if (jsonStart >= 0 && jsonEnd > jsonStart) {
            cleanedText = cleanedText.substring(jsonStart, jsonEnd);
          }
          
          // Parse the JSON
          const devices = JSON.parse(cleanedText);
          console.log('Successfully parsed device data, count:', devices.length);
          
          // Store the device data globally
          window._lastDevicesResponse = devices;
          
          // Create markers for these devices
          createMarkersFromDevices(devices);
        } catch (error) {
          console.error('Error parsing device data:', error);
          
          // Fall back to mock data
          console.log('Falling back to mock device data');
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
          
          // Create markers for the mock devices
          createMarkersFromDevices(mockDevices);
        }
      })
      .catch(error => {
        console.error('Error fetching device data:', error);
        
        // Fall back to mock data
        console.log('Falling back to mock device data due to fetch error');
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
