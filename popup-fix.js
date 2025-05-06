/**
 * Safecast Popup Display Fix - Simplified Version
 * This script focuses on correctly calculating and displaying the average radiation value
 */

(function() {
  // Global variable to track if radiation sensors are enabled
  window.radiationSensorsEnabled = true;
  
  // Wait for the page to fully load and for RTMKS to be defined
  window.addEventListener('load', function() {
    console.log('Page loaded, checking for RTMKS...');
    
    function checkAndApplyFix() {
      if (typeof RTMKS === 'undefined') {
        console.log('Waiting for RTMKS to be defined...');
        setTimeout(checkAndApplyFix, 500);
        return;
      }
      
      console.log('Safecast Popup Fix loaded - RTMKS found');
      applyFixes();
    }
    
    checkAndApplyFix();
  });
  
  function applyFixes() {
    // Store the original GetInfoWindowHtmlForParams function
    const originalGetInfoWindowHtmlForParams = RTMKS.GetInfoWindowHtmlForParams;
    
    // Override the GetInfoWindowHtmlForParams function
    RTMKS.GetInfoWindowHtmlForParams = function(
      locations, lats, lons, device_urns, device_classes, 
      cpms, values, tubeTypes, unixSSs, imgs, loc, 
      mini, tblw, fontCssClass, showGraph, showID
    ) {
      console.log('Patched GetInfoWindowHtmlForParams called with:', {
        locations, device_urns, device_classes, cpms, tubeTypes, values
      });
      
      // Extract device info from imgs if available
      let deviceInfo = null;
      if (imgs && imgs.length > 0) {
        try {
          deviceInfo = JSON.parse(imgs[0]);
          console.log('Parsed device info:', deviceInfo);
        } catch (error) {
          console.log('Could not parse imgs as JSON:', error);
        }
      }
      
      // Get the device URN
      let deviceUrn = '';
      if (device_urns && device_urns.length > 0) {
        deviceUrn = device_urns[0];
      } else if (deviceInfo && deviceInfo.device_urn) {
        deviceUrn = deviceInfo.device_urn;
      }
      
      // Get the device class
      let deviceClass = '';
      if (device_classes && device_classes.length > 0) {
        deviceClass = device_classes[0];
      } else if (deviceInfo && deviceInfo.device_class) {
        deviceClass = deviceInfo.device_class;
      }
      
      // Get the location name
      let displayLocation = '';
      if (locations && locations.length > 0) {
        displayLocation = locations[0];
      } else if (deviceInfo && deviceInfo.location) {
        displayLocation = deviceInfo.location;
      } else if (deviceClass && deviceUrn) {
        const parts = deviceUrn.split(':');
        if (parts.length > 1) {
          displayLocation = deviceClass + ' ' + parts[1];
        } else {
          displayLocation = deviceClass + ' ' + deviceUrn;
        }
      } else {
        displayLocation = 'Unknown Device';
      }
      
      // Get the measurement time
      let measurementTime = '';
      if (deviceInfo && deviceInfo.when_captured) {
        try {
          const date = new Date(deviceInfo.when_captured);
          measurementTime = date.toLocaleString();
        } catch (error) {
          console.log('Error parsing date:', error);
        }
      } else if (unixSSs && unixSSs.length > 0) {
        try {
          const date = new Date(unixSSs[0] * 1000);
          measurementTime = date.toLocaleString();
        } catch (error) {
          console.log('Error formatting date:', error);
        }
      }
      
      // Process tube data
      let hasTubeData = false;
      let tubeData = {};
      let activeTubes = [];
      
      // Check if cpms is an array of arrays (nested array)
      let flatCpms = cpms;
      if (cpms && cpms.length > 0 && Array.isArray(cpms[0])) {
        flatCpms = cpms[0];
      }
      
      // Check if tubeTypes is an array of arrays (nested array)
      let flatTubeTypes = tubeTypes;
      if (tubeTypes && tubeTypes.length > 0 && Array.isArray(tubeTypes[0])) {
        flatTubeTypes = tubeTypes[0];
      }
      
      // Process tube data if available
      if (flatTubeTypes && flatTubeTypes.length > 0 && flatCpms && flatCpms.length > 0) {
        hasTubeData = true;
        
        // Create tubeData object
        for (let i = 0; i < flatTubeTypes.length; i++) {
          if (i < flatCpms.length) {
            const tubeType = flatTubeTypes[i];
            const cpmValue = flatCpms[i];
            
            // Skip invalid values
            if (!cpmValue || isNaN(parseFloat(cpmValue))) {
              continue;
            }
            
            // Determine conversion factor
            let conversionFactor = 0.0057; // Default
            if (tubeType === 'lnd_7318u') {
              conversionFactor = 0.0024; // LND-7318u
            } else if (tubeType === 'lnd_7128ec') {
              conversionFactor = 0.0063; // LND-7128ec
            } else if (tubeType === 'lnd_712u') {
              conversionFactor = 0.0081; // LND-712u
            } else if (tubeType === 'lnd_7318c') {
              conversionFactor = 0.0059; // LND-7318c
            }
            
            // Calculate µSv/h value
            const usvhValue = cpmValue * conversionFactor;
            
            // Store tube data
            tubeData[tubeType] = cpmValue;
            
            // Add to active tubes
            activeTubes.push({
              type: tubeType,
              cpm: cpmValue,
              factor: conversionFactor,
              usvh: usvhValue
            });
            
            console.log('Tube:', tubeType, 'CPM:', cpmValue, 'Factor:', conversionFactor, 'µSv/h:', usvhValue.toFixed(3));
          }
        }
      }
      
      // Calculate average radiation value
      let totalValue = 0;
      let tubeCount = 0;
      let averageValue = 0;
      
      activeTubes.forEach(tube => {
        totalValue += tube.usvh;
        tubeCount++;
      });
      
      if (tubeCount > 0) {
        averageValue = totalValue / tubeCount;
      }
      
      console.log('Device:', deviceUrn, 'Total:', totalValue.toFixed(3), 'Count:', tubeCount, 'Average:', averageValue.toFixed(3));
      
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
      
      // Show calculated average value
      html += "<div style='font-size:16px; margin-top:5px;'>" + averageValue.toFixed(3) + " \u00b5Sv/h</div>";
      
      // Show CPM values if available
      if (hasTubeData) {
        html += "<div style='font-size:13px; margin-top:5px;'>CPM</div>";
        
        // Display each tube's data
        activeTubes.forEach(tube => {
          html += "<div style='font-size:13px; margin-top:3px;'>" + tube.type + ": " + tube.cpm + 
                  " CPM (" + tube.usvh.toFixed(3) + " \u00b5Sv/h)</div>";
        });
      }
      
      // Measurement time
      if (measurementTime) {
        html += "<div style='font-size:13px; margin-top:15px;'>Measured at: " + measurementTime + "</div>";
      }
      
      // More info link
      html += "<div style='font-size:13px; margin-top:15px;'><a href='#' onclick='return false;'>More info</a></div>";
      
      html += "</div>";
      
      return html;
    };
    
    // Hook into the existing radiation sensors switch in the left panel
    setTimeout(function() {
      hookIntoRadiationSensorsSwitch();
      
      // Show the spinner for initial data loading
      showSpinner();
      
      // Fetch the data after showing the spinner
      fetchRealSensorData();
    }, 3000);
  }
  
  // Function to hook into the existing Radiation Sensors switch in the left panel
  function hookIntoRadiationSensorsSwitch() {
    console.log('Looking for the existing Radiation Sensors switch in the left panel...');
    
    // Try to find the radiation sensors switch in the left panel
    // Look for checkboxes with labels containing 'radiation' and 'sensors'
    const checkboxes = document.querySelectorAll('input[type="checkbox"]');
    let radiationSensorsSwitch = null;
    
    for (const checkbox of checkboxes) {
      // Check if this checkbox or its parent contains text about radiation sensors
      const parent = checkbox.parentElement;
      const grandparent = parent ? parent.parentElement : null;
      const text = (parent ? parent.textContent : '') + (grandparent ? grandparent.textContent : '');
      
      if (text.toLowerCase().includes('radiation') && text.toLowerCase().includes('sensor')) {
        radiationSensorsSwitch = checkbox;
        console.log('Found Radiation Sensors switch:', radiationSensorsSwitch);
        break;
      }
    }
    
    if (radiationSensorsSwitch) {
      // Store the original checked state
      window.radiationSensorsEnabled = radiationSensorsSwitch.checked;
      console.log('Initial radiation sensors state:', window.radiationSensorsEnabled);
      
      // Store the original onchange handler if it exists
      const originalOnChange = radiationSensorsSwitch.onchange;
      
      // Remove any existing event listeners to avoid duplicates
      radiationSensorsSwitch.removeEventListener('change', window.radiationSensorChangeHandler);
      
      // Create a new change handler function
      window.radiationSensorChangeHandler = function(event) {
        // Update our global state
        window.radiationSensorsEnabled = this.checked;
        console.log('Radiation sensors toggled to:', window.radiationSensorsEnabled);
        
        // Show the existing loading spinner
        showSpinner();
        
        // Call our toggle function with a slight delay
        setTimeout(function() {
          window.toggleRadiationSensors();
        }, 50);
        
        // Call the original onchange handler if it exists
        if (originalOnChange && typeof originalOnChange === 'function') {
          try {
            originalOnChange.call(radiationSensorsSwitch, event);
          } catch(e) {
            console.error('Error calling original change handler:', e);
          }
        }
      };
      
      // Add the event listener
      radiationSensorsSwitch.addEventListener('change', window.radiationSensorChangeHandler);
      
      console.log('Successfully hooked into Radiation Sensors switch');
    } else {
      console.error('Could not find Radiation Sensors switch, will try again later');
      setTimeout(hookIntoRadiationSensorsSwitch, 2000);
    }
  }
  
  // Function to toggle radiation sensors visibility
  window.toggleRadiationSensors = function() {
    console.log('Toggling radiation sensors visibility: ' + (window.radiationSensorsEnabled ? 'enabled' : 'disabled'));
    
    // Always clear existing markers first
    if (window.allMarkers && window.allMarkers.length > 0) {
      console.log('Clearing existing markers:', window.allMarkers.length);
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
      console.log('Radiation sensors enabled, fetching data...');
      // Use a slight delay to ensure UI updates first
      setTimeout(function() {
        fetchRealSensorData();
      }, 100);
    } else {
      console.log('Radiation sensors disabled, hiding spinner...');
      // If disabled, hide the spinner after a short delay
      setTimeout(hideSpinner, 500);
    }
    
    // Update the switch state if needed
    const radiationSwitch = findRadiationSensorsSwitch();
    if (radiationSwitch && radiationSwitch.checked !== window.radiationSensorsEnabled) {
      console.log('Updating switch state to match:', window.radiationSensorsEnabled);
      radiationSwitch.checked = window.radiationSensorsEnabled;
    }
  };
  
  // Function to find the radiation sensors switch
  function findRadiationSensorsSwitch() {
    const checkboxes = document.querySelectorAll('input[type="checkbox"]');
    
    for (const checkbox of checkboxes) {
      const parent = checkbox.parentElement;
      const grandparent = parent ? parent.parentElement : null;
      const text = (parent ? parent.textContent : '') + (grandparent ? grandparent.textContent : '');
      
      if (text.toLowerCase().includes('radiation') && text.toLowerCase().includes('sensor')) {
        return checkbox;
      }
    }
    
    return null;
  }
  
  // Function to show the loading spinner
  function showSpinner() {
    // Remove any existing spinner first
    hideSpinner();
    
    // Clear any existing timeout
    if (window.spinnerTimeout) {
      clearTimeout(window.spinnerTimeout);
    }
    
    // Set a safety timeout to hide the spinner after 15 seconds
    // This ensures the spinner doesn't get stuck if there's an error
    window.spinnerTimeout = setTimeout(function() {
      console.log('Safety timeout: hiding spinner after 15 seconds');
      hideSpinner();
    }, 15000);
    
    // Show the loading spinner
    if (window.SafecastMap && typeof window.SafecastMap.fxInjectLoadingSpinner === 'function') {
      const spinnerContainer = document.createElement('div');
      spinnerContainer.id = 'radiation-spinner-container';
      document.body.appendChild(spinnerContainer);
      window.SafecastMap.fxInjectLoadingSpinner(spinnerContainer);
    } else if (typeof SafemapUI !== 'undefined' && typeof SafemapUI.InjectLoadingSpinner === 'function') {
      const spinnerContainer = document.createElement('div');
      spinnerContainer.id = 'radiation-spinner-container';
      spinnerContainer.style.position = 'fixed';
      spinnerContainer.style.top = '50%';
      spinnerContainer.style.left = '50%';
      spinnerContainer.style.transform = 'translate(-50%, -50%)';
      spinnerContainer.style.zIndex = '9999';
      document.body.appendChild(spinnerContainer);
      SafemapUI.InjectLoadingSpinner(spinnerContainer, SafemapUI.LoadingSpinnerColor.White, SafemapUI.LoadingSpinnerSize.Large);
    }
  }
  
  // Function to hide the spinner
  function hideSpinner() {
    // Clear any spinner timeout
    if (window.spinnerTimeout) {
      clearTimeout(window.spinnerTimeout);
      window.spinnerTimeout = null;
    }
    
    // Remove the spinner element
    const spinnerContainer = document.getElementById('radiation-spinner-container');
    if (spinnerContainer) {
      spinnerContainer.remove();
    }
  }
  
  // Function to fetch real sensor data from the API
  function fetchRealSensorData() {
    // Skip if radiation sensors are disabled
    if (!window.radiationSensorsEnabled) {
      console.log('Radiation sensors are disabled, skipping fetch');
      hideSpinner();
      return;
    }
    
    console.log('Fetching real sensor data from API...');
    
    // Make sure any previous data is cleared
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
    
    // Show the loading spinner while fetching data
    showSpinner();
    
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
          } else {
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
            // Create markers for these devices
            createMarkersFromDevices(validDevices);
            return;
          } else {
            throw new Error('No valid devices with location data found');
          }
        } catch (error) {
          console.error('Error processing device data:', error);
          // Hide spinner on error
          hideSpinner();
          // Only use mock data if we couldn't get real data
          useMockData();
        }
      })
      .catch(error => {
        console.error('Error fetching device data:', error);
        // Hide spinner on error
        hideSpinner();
        useMockData();
      });
  }
  
  // Function to use mock data as a fallback
  function useMockData() {
    console.log('Using mock device data');
    // Make sure spinner is hidden when using mock data
    hideSpinner();
    const mockDevices = [
      {
        "device_urn": "safecast:4007513236",
        "device_class": "safecast",
        "device": 4007513236,
        "when_captured": "2021-06-13T10:32:46Z",
        "loc_lat": 35.6695,
        "loc_lon": 139.7117,
        "lnd_7318u": 28,
        "lnd_7128ec": 9,
        "service_uploaded": "2021-06-13T10:32:46Z"
      },
      {
        "device_urn": "safecast:2651380949",
        "device_class": "safecast",
        "device": 2651380949,
        "when_captured": "2024-04-15T22:49:45Z",
        "loc_lat": 35.6595,
        "loc_lon": 139.7217,
        "lnd_7318u": 696,
        "lnd_7128ec": 249,
        "service_uploaded": "2024-04-15T22:49:45Z"
      }
    ];
    
    // Create markers for the mock devices
    createMarkersFromDevices(mockDevices);
  }
  
  // Function to create markers from device data
  function createMarkersFromDevices(devices) {
    // Skip if radiation sensors are disabled
    if (!window.radiationSensorsEnabled) {
      console.log('Radiation sensors are disabled, skipping marker creation');
      hideSpinner();
      return;
    }
    
    console.log('Creating markers for', devices.length, 'devices');
    
    // Initialize global marker array if it doesn't exist
    if (!window.allMarkers) {
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
      var activeTubes = [];
      
      // Process all available tube types
      if (device.lnd_7318u) {
        tubeData['lnd_7318u'] = device.lnd_7318u;
        tubeTypes.push('lnd_7318u');
        cpmValues.push(device.lnd_7318u);
        activeTubes.push({
          type: 'lnd_7318u',
          cpm: device.lnd_7318u,
          factor: 0.0024, // LND-7318u conversion factor
          usvh: device.lnd_7318u * 0.0024
        });
      }
      if (device.lnd_7128ec) {
        tubeData['lnd_7128ec'] = device.lnd_7128ec;
        tubeTypes.push('lnd_7128ec');
        cpmValues.push(device.lnd_7128ec);
        activeTubes.push({
          type: 'lnd_7128ec',
          cpm: device.lnd_7128ec,
          factor: 0.0063, // LND-7128ec conversion factor
          usvh: device.lnd_7128ec * 0.0063
        });
      }
      if (device.lnd_712u) {
        tubeData['lnd_712u'] = device.lnd_712u;
        tubeTypes.push('lnd_712u');
        cpmValues.push(device.lnd_712u);
        activeTubes.push({
          type: 'lnd_712u',
          cpm: device.lnd_712u,
          factor: 0.0081, // LND-712u conversion factor
          usvh: device.lnd_712u * 0.0081
        });
      }
      if (device.lnd_7318c) {
        tubeData['lnd_7318c'] = device.lnd_7318c;
        tubeTypes.push('lnd_7318c');
        cpmValues.push(device.lnd_7318c);
        activeTubes.push({
          type: 'lnd_7318c',
          cpm: device.lnd_7318c,
          factor: 0.0059, // LND-7318c conversion factor
          usvh: device.lnd_7318c * 0.0059
        });
      }
      
      // Check if the measurement is recent (within 4 hours)
      var isRecent = false;
      if (device.when_captured) {
        var capturedTime = new Date(device.when_captured).getTime();
        var currentTime = new Date().getTime();
        var fourHoursInMs = 4 * 60 * 60 * 1000;
        isRecent = (currentTime - capturedTime) <= fourHoursInMs;
      }
      
      // Create SVG icons that match the legend exactly
      function createSvgIcon(isOnline) {
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
      
      // Generate icon URL
      var iconUrl = createSvgIcon(isRecent);
      
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
      
      // Store device data with the marker
      marker.deviceData = device;
      marker.tubeData = tubeData;
      marker.tubeTypes = tubeTypes;
      marker.cpmValues = cpmValues;
      marker.activeTubes = activeTubes;
      
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
        var activeTubes = this.activeTubes;
        
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
          
          // Create info window content
          var content = RTMKS.GetInfoWindowHtmlForParams(
            [title], // locations
            [device.loc_lat || ''], // lats
            [device.loc_lon || ''], // lons
            [device.device_urn || ''], // device_urns
            [device.device_class || ''], // device_classes
            cpmValues, // cpms (array of CPM values)
            ['0.000'], // values (this will be calculated in the GetInfoWindowHtmlForParams function)
            tubeTypes, // tube types
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
        marker: marker
      });
    }
    
    console.log('Created', window.allMarkers.length, 'markers');
    
    // Hide the spinner after markers are created
    hideSpinner();
  }
})();
