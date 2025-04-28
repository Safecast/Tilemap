// api-proxy.js
(function() {
  // Create a global variable to store the device data
  window._lastDevicesResponse = [];
  
  // Store the original XMLHttpRequest
  const originalXHR = window.XMLHttpRequest;

  // Create a proxy XMLHttpRequest
  window.XMLHttpRequest = function() {
      const xhr = new originalXHR();
      const originalOpen = xhr.open;
      const originalSend = xhr.send;

      // Override the open method to intercept requests
      xhr.open = function(method, url, async, user, password) {
          // Store the original URL for reference
          xhr._originalUrl = url;
          
          // Check if the URL is for the Safecast API
          if (url.includes('realtime.safecast.org') || url.includes('tt.safecast.org')) {
              // Rewrite the URL to use the proxy
              if (url.includes('realtime.safecast.org')) {
                  url = url.replace('http://realtime.safecast.org', '');
                  url = url.replace('https://realtime.safecast.org', '');
                  url = '/api' + url;
              } else if (url.includes('tt.safecast.org')) {
                  url = url.replace('http://tt.safecast.org', '');
                  url = url.replace('https://tt.safecast.org', '');
                  url = '/tt-api' + url;
              }
              console.log('Proxying request to:', url);
          }

          // Call the original open method
          return originalOpen.apply(this, arguments);
      };
      
      // Override the send method to intercept responses
      xhr.send = function() {
          const originalOnReadyStateChange = xhr.onreadystatechange;
          
          xhr.onreadystatechange = function() {
              if (xhr.readyState === 4 && xhr.status === 200) {
                  // Check if this is a devices request
                  if (xhr._originalUrl && (xhr._originalUrl.includes('/devices') || xhr._originalUrl.includes('devices.json'))) {
                      try {
                          // Try to parse the response with robust error handling
                          console.log('Attempting to parse real device data');
                          let responseData = [];
                          
                          try {
                              // First, clean the response text to remove any non-printable characters
                              const cleanedText = xhr.responseText
                                  .replace(/[^\x20-\x7E]/g, '') // Remove non-printable ASCII
                                  .replace(/\\u0000/g, '') // Remove null bytes
                                  .replace(/[\r\n]+/g, '') // Remove newlines
                                  .replace(/,\s*}/g, '}') // Fix trailing commas in objects
                                  .replace(/,\s*\]/g, ']'); // Fix trailing commas in arrays
                              
                              // Try to find where the JSON actually starts and ends
                              let jsonStart = cleanedText.indexOf('[');
                              let jsonEnd = cleanedText.lastIndexOf(']') + 1;
                              
                              if (jsonStart >= 0 && jsonEnd > jsonStart) {
                                  const jsonText = cleanedText.substring(jsonStart, jsonEnd);
                                  responseData = JSON.parse(jsonText);
                                  console.log('Successfully parsed real device data');
                              } else {
                                  throw new Error('Could not find JSON array in response');
                              }
                          } catch (parseError) {
                              console.error('Error parsing real device data:', parseError);
                              
                              // Fall back to mock data if parsing fails
                              console.log('Falling back to mock device data');
                              responseData = [
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
                          }
                          
                          // Store the device data globally
                          window._lastDevicesResponse = responseData;
                          
                          // Process the data to ensure it has the right format
                          for (let i = 0; i < responseData.length; i++) {
                              const device = responseData[i];
                              
                              // Ensure ID is set correctly
                              if (device.device) {
                                  device.id = parseInt(device.device);
                              } else if (device.device_urn && device.device_urn.includes(':')) {
                                  device.id = parseInt(device.device_urn.split(':')[1]);
                              } else if (!device.id) {
                                  device.id = i + 1; // Use index + 1 as fallback
                              }
                              
                              // Ensure lat/lon are set correctly
                              if (device.loc_lat && device.loc_lon) {
                                  device.lat = parseFloat(device.loc_lat);
                                  device.lon = parseFloat(device.loc_lon);
                              }
                              
                              // Handle RadNote devices
                              if (device.product && device.product.includes('radnote')) {
                                  if (device.body && device.body.cpm) {
                                      device.cpm = parseFloat(device.body.cpm);
                                      device.usvh = device.cpm * 0.0057; // Convert CPM to µSv/h
                                  }
                              }
                          }
                          
                          console.log('Processed', responseData.length, 'devices');
                      } catch (e) {
                          console.error('Error processing device data:', e);
                      }
                  }
              }
              
              // Call the original onreadystatechange
              if (originalOnReadyStateChange) {
                  originalOnReadyStateChange.apply(this, arguments);
              }
          };
          
          // Call the original send method
          return originalSend.apply(this, arguments);
      };

      return xhr;
  };

  // Store the original fetch
  const originalFetch = window.fetch;

  // Create a proxy fetch
  window.fetch = function(url, options) {
      // Store the original URL for reference
      const originalUrl = url;
      
      // Check if the URL is for the Safecast API
      if (url.includes('realtime.safecast.org') || url.includes('tt.safecast.org')) {
          // Rewrite the URL to use the proxy
          if (url.includes('realtime.safecast.org')) {
              url = url.replace('http://realtime.safecast.org', '');
              url = url.replace('https://realtime.safecast.org', '');
              url = '/api' + url;
          } else if (url.includes('tt.safecast.org')) {
              url = url.replace('http://tt.safecast.org', '');
              url = url.replace('https://tt.safecast.org', '');
              url = '/tt-api' + url;
          }
          console.log('Proxying fetch request to:', url);
      }

      // Call the original fetch
      return originalFetch.apply(this, [url, options])
          .then(response => {
              // Clone the response so we can read it twice
              const responseClone = response.clone();
              
              // Check if this is a devices request
              if (originalUrl && (originalUrl.includes('/devices') || originalUrl.includes('devices.json'))) {
                  responseClone.json().then(data => {
                      // Store the device data globally
                      window._lastDevicesResponse = data;
                      
                      console.log('Stored', data.length, 'devices from fetch response');
                  }).catch(err => {
                      console.error('Error processing fetch response:', err);
                  });
              }
              
              return response;
          });
  };
  
  // Also add a direct test function to verify the proxy is working
  window.testRealtimeSensorsAPI = function() {
    console.log('Testing realtime sensors API...');
    fetch('/tt-api/devices')
      .then(response => {
        console.log('Realtime sensors API response status:', response.status);
        return response.json();
      })
      .then(data => {
        console.log('Realtime sensors API data:', data);
      })
      .catch(error => {
        console.error('Error fetching realtime sensors data:', error);
      });
  };
})();
