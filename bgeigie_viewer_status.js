// bgeigie_viewer_status.js - Diagnostic script for bGeigie viewer status

(function() {
    console.log("bGeigie Viewer Status Check Tool");
    
    // Function to check and report the status of bGeigie viewer components
    function checkStatus() {
        // Create status container
        let statusContainer = document.createElement('div');
        statusContainer.style.cssText = 'position: fixed; top: 10px; left: 10px; ' + 
                                       'background: rgba(0, 0, 0, 0.8); color: white; ' + 
                                       'padding: 15px; z-index: 9999; font-family: monospace; ' +
                                       'max-width: 600px; max-height: 80vh; overflow-y: auto; ' +
                                       'border-radius: 5px; box-shadow: 0 0 10px rgba(0,0,0,0.5);';
        
        // Header
        let header = document.createElement('h3');
        header.textContent = "bGeigie Viewer Status";
        header.style.cssText = 'margin: 0 0 10px 0; padding-bottom: 5px; border-bottom: 1px solid #555;';
        statusContainer.appendChild(header);
        
        // Close button (X) in the top right
        let closeButton = document.createElement('div');
        closeButton.textContent = '×';
        closeButton.style.cssText = 'position: absolute; top: 5px; right: 10px; ' +
                                  'font-size: 20px; cursor: pointer; font-weight: bold;';
        closeButton.onclick = function() {
            document.body.removeChild(statusContainer);
        };
        statusContainer.appendChild(closeButton);
        
        // Status content
        let statusContent = document.createElement('div');
        statusContent.style.cssText = 'font-size: 14px; line-height: 1.5;';
        
        // Check browser info
        let browserInfo = document.createElement('p');
        browserInfo.innerHTML = '<strong>Browser:</strong> ' + navigator.userAgent;
        statusContent.appendChild(browserInfo);
        
        // Check if the required global objects exist
        const components = [
            { name: "BvProxy constructor", global: "BvProxy", type: "function" },
            { name: "_bvProxy instance", global: "_bvProxy", type: "object" },
            { name: "_bvProxy._bvm", global: "_bvProxy && _bvProxy._bvm", type: "object", parent: "_bvProxy" },
            { name: "BVM constructor", global: "BVM", type: "function" },
            { name: "XFM constructor", global: "XFM", type: "function" },
            { name: "WWM constructor", global: "WWM", type: "function" },
            { name: "addBGeigieLog helper", global: "addBGeigieLog", type: "function" },
            { name: "clearBGeigieLogs helper", global: "clearBGeigieLogs", type: "function" },
            { name: "bGeigieHelpers object", global: "bGeigieHelpers", type: "object" },
            { name: "SafemapInit", global: "SafemapInit", type: "object" }
        ];
        
        let componentsList = document.createElement('div');
        componentsList.innerHTML = '<strong>Component Status:</strong>';
        
        let componentsTable = document.createElement('table');
        componentsTable.style.cssText = 'width: 100%; border-collapse: collapse; margin-top: 5px;';
        componentsList.appendChild(componentsTable);
        
        // Add table header
        let thead = document.createElement('thead');
        thead.innerHTML = '<tr style="text-align: left; border-bottom: 1px solid #555;">' +
                         '<th style="padding: 5px;">Component</th>' +
                         '<th style="padding: 5px;">Status</th>' +
                         '</tr>';
        componentsTable.appendChild(thead);
        
        let tbody = document.createElement('tbody');
        componentsTable.appendChild(tbody);
        
        components.forEach(component => {
            let row = document.createElement('tr');
            row.style.cssText = 'border-bottom: 1px solid #333;';
            
            let nameCell = document.createElement('td');
            nameCell.textContent = component.name;
            nameCell.style.cssText = 'padding: 5px;';
            row.appendChild(nameCell);
            
            let statusCell = document.createElement('td');
            statusCell.style.cssText = 'padding: 5px;';
            
            // Check component
            try {
                let exists = false;
                let matches = false;
                
                if (component.parent) {
                    exists = eval(component.parent) !== undefined;
                    matches = exists && eval(component.global) !== undefined;
                } else {
                    exists = eval(component.global) !== undefined;
                    matches = exists && typeof eval(component.global) === component.type;
                }
                
                if (exists && matches) {
                    statusCell.innerHTML = '<span style="color: #8CFF66;">✓ Available</span>';
                } else if (exists) {
                    statusCell.innerHTML = '<span style="color: #FFCC66;">⚠ Wrong Type</span>';
                } else {
                    statusCell.innerHTML = '<span style="color: #FF6666;">✗ Not Found</span>';
                }
            } catch (e) {
                statusCell.innerHTML = '<span style="color: #FF6666;">✗ Not Found</span>';
            }
            
            row.appendChild(statusCell);
            tbody.appendChild(row);
        });
        
        statusContent.appendChild(componentsList);
        
        // Add BvProxy details if available
        if (window._bvProxy) {
            let bvProxyDetails = document.createElement('div');
            bvProxyDetails.innerHTML = '<strong>BvProxy Details:</strong>';
            bvProxyDetails.style.cssText = 'margin-top: 15px;';
            
            // Check if BVM is initialized
            let bvmStatus = document.createElement('p');
            if (window._bvProxy._bvm) {
                bvmStatus.innerHTML = '<span style="color: #8CFF66;">✓ BVM is initialized</span>';
                
                // Add log count if available
                if (window._bvProxy._bvm.GetLogCount) {
                    try {
                        const logCount = window._bvProxy._bvm.GetLogCount();
                        bvmStatus.innerHTML += ` - ${logCount} logs loaded`;
                    } catch (e) {
                        // Ignore errors in counting logs
                    }
                }
            } else {
                bvmStatus.innerHTML = '<span style="color: #FF6666;">✗ BVM is not initialized</span>';
            }
            bvProxyDetails.appendChild(bvmStatus);
            
            // Check transfer bar
            let transferBarStatus = document.createElement('p');
            if (document.getElementById('bv_transferBar')) {
                transferBarStatus.innerHTML = '<span style="color: #8CFF66;">✓ Transfer bar exists</span>';
            } else {
                transferBarStatus.innerHTML = '<span style="color: #FF6666;">✗ Transfer bar not found</span>';
            }
            bvProxyDetails.appendChild(transferBarStatus);
            
            statusContent.appendChild(bvProxyDetails);
        }
        
        // Add test utilities
        let testUtils = document.createElement('div');
        testUtils.style.cssText = 'margin-top: 20px; padding-top: 15px; border-top: 1px solid #555;';
        
        let testHeader = document.createElement('h4');
        testHeader.textContent = "Test Utilities";
        testHeader.style.cssText = 'margin: 0 0 10px 0;';
        testUtils.appendChild(testHeader);
        
        // Log ID input
        let logInput = document.createElement('div');
        logInput.style.cssText = 'margin-bottom: 10px;';
        
        let logInputLabel = document.createElement('label');
        logInputLabel.textContent = "Log ID: ";
        logInputLabel.style.cssText = 'display: inline-block; width: 60px;';
        logInput.appendChild(logInputLabel);
        
        let logInputField = document.createElement('input');
        logInputField.type = "text";
        logInputField.value = "67925";
        logInputField.style.cssText = 'padding: 5px; width: 80px; background: #333; color: white; border: 1px solid #555;';
        logInput.appendChild(logInputField);
        
        testUtils.appendChild(logInput);
        
        // Buttons
        let buttonsContainer = document.createElement('div');
        buttonsContainer.style.cssText = 'display: flex; gap: 10px;';
        
        let loadButton = document.createElement('button');
        loadButton.textContent = "Load Log";
        loadButton.style.cssText = 'padding: 5px 10px; background: #4CAF50; color: white; border: none; cursor: pointer;';
        loadButton.onclick = function() {
            let logId = logInputField.value.trim();
            if (!logId) return;
            
            let result;
            let message = document.createElement('p');
            
            // Try all methods
            if (typeof addBGeigieLog === 'function') {
                result = addBGeigieLog(logId);
                message.innerHTML = `<span style="color: ${result ? '#8CFF66' : '#FF6666'};">
                    ${result ? '✓' : '✗'} addBGeigieLog(${logId}): ${result ? 'SUCCESS' : 'FAILED'}
                </span>`;
            } else if (window._bvProxy && window._bvProxy.AddLogsCSV) {
                try {
                    window._bvProxy.AddLogsCSV(logId, true);
                    message.innerHTML = `<span style="color: #8CFF66;">✓ _bvProxy.AddLogsCSV(${logId}): SUCCESS</span>`;
                } catch (e) {
                    message.innerHTML = `<span style="color: #FF6666;">✗ _bvProxy.AddLogsCSV(${logId}): FAILED - ${e.message}</span>`;
                }
            } else if (window._bvProxy && window._bvProxy._bvm && window._bvProxy._bvm.AddLogsByQueryFromString) {
                try {
                    window._bvProxy._bvm.AddLogsByQueryFromString(logId);
                    message.innerHTML = `<span style="color: #8CFF66;">✓ _bvProxy._bvm.AddLogsByQueryFromString(${logId}): SUCCESS</span>`;
                } catch (e) {
                    message.innerHTML = `<span style="color: #FF6666;">✗ _bvProxy._bvm.AddLogsByQueryFromString(${logId}): FAILED - ${e.message}</span>`;
                }
            } else {
                message.innerHTML = '<span style="color: #FF6666;">✗ No method available to add log</span>';
            }
            
            // Add to log
            resultLog.appendChild(message);
            resultLog.scrollTop = resultLog.scrollHeight;
        };
        buttonsContainer.appendChild(loadButton);
        
        let clearButton = document.createElement('button');
        clearButton.textContent = "Clear Logs";
        clearButton.style.cssText = 'padding: 5px 10px; background: #f44336; color: white; border: none; cursor: pointer;';
        clearButton.onclick = function() {
            let result;
            let message = document.createElement('p');
            
            // Try all methods
            if (typeof clearBGeigieLogs === 'function') {
                result = clearBGeigieLogs();
                message.innerHTML = `<span style="color: ${result ? '#8CFF66' : '#FF6666'};">
                    ${result ? '✓' : '✗'} clearBGeigieLogs(): ${result ? 'SUCCESS' : 'FAILED'}
                </span>`;
            } else if (window._bvProxy && window._bvProxy._bvm && window._bvProxy._bvm.RemoveAllMarkersFromMapAndPurgeData) {
                try {
                    window._bvProxy._bvm.RemoveAllMarkersFromMapAndPurgeData();
                    message.innerHTML = '<span style="color: #8CFF66;">✓ _bvProxy._bvm.RemoveAllMarkersFromMapAndPurgeData(): SUCCESS</span>';
                } catch (e) {
                    message.innerHTML = `<span style="color: #FF6666;">✗ _bvProxy._bvm.RemoveAllMarkersFromMapAndPurgeData(): FAILED - ${e.message}</span>`;
                }
            } else {
                message.innerHTML = '<span style="color: #FF6666;">✗ No method available to clear logs</span>';
            }
            
            // Add to log
            resultLog.appendChild(message);
            resultLog.scrollTop = resultLog.scrollHeight;
        };
        buttonsContainer.appendChild(clearButton);
        
        let fixButton = document.createElement('button');
        fixButton.textContent = "Force Init";
        fixButton.style.cssText = 'padding: 5px 10px; background: #2196F3; color: white; border: none; cursor: pointer;';
        fixButton.onclick = function() {
            let message = document.createElement('p');
            
            // Try to force initialize BvProxy
            try {
                if (!window._bvProxy && typeof BvProxy === 'function') {
                    window._bvProxy = new BvProxy();
                    message.innerHTML = '<span style="color: #8CFF66;">✓ Created new BvProxy instance</span>';
                } else if (window._bvProxy) {
                    message.innerHTML = '<span style="color: #FFCC66;">⚠ BvProxy already exists, trying Init()</span>';
                } else {
                    message.innerHTML = '<span style="color: #FF6666;">✗ BvProxy constructor not available</span>';
                    resultLog.appendChild(message);
                    return;
                }
                
                // Try to initialize BVM
                if (window._bvProxy && !window._bvProxy._bvm && typeof window._bvProxy.Init === 'function') {
                    window._bvProxy.Init();
                    
                    // Check if BVM is now initialized
                    if (window._bvProxy._bvm) {
                        message.innerHTML += '<br><span style="color: #8CFF66;">✓ BVM initialized successfully</span>';
                    } else {
                        message.innerHTML += '<br><span style="color: #FF6666;">✗ BVM initialization failed</span>';
                    }
                } else if (window._bvProxy && window._bvProxy._bvm) {
                    message.innerHTML += '<br><span style="color: #FFCC66;">⚠ BVM already initialized</span>';
                }
                
                // Add to log
                resultLog.appendChild(message);
                
                // Update the status view after a short delay
                setTimeout(function() {
                    document.body.removeChild(statusContainer);
                    checkStatus();
                }, 500);
            } catch (e) {
                message.innerHTML = `<span style="color: #FF6666;">✗ Error during initialization: ${e.message}</span>`;
                resultLog.appendChild(message);
            }
        };
        buttonsContainer.appendChild(fixButton);
        
        let refreshButton = document.createElement('button');
        refreshButton.textContent = "Refresh";
        refreshButton.style.cssText = 'padding: 5px 10px; background: #9C27B0; color: white; border: none; cursor: pointer;';
        refreshButton.onclick = function() {
            document.body.removeChild(statusContainer);
            checkStatus();
        };
        buttonsContainer.appendChild(refreshButton);
        
        testUtils.appendChild(buttonsContainer);
        
        // Result log
        let resultLogContainer = document.createElement('div');
        resultLogContainer.style.cssText = 'margin-top: 15px;';
        
        let resultLogHeader = document.createElement('h4');
        resultLogHeader.textContent = "Operation Log";
        resultLogHeader.style.cssText = 'margin: 0 0 5px 0;';
        resultLogContainer.appendChild(resultLogHeader);
        
        let resultLog = document.createElement('div');
        resultLog.style.cssText = 'background: #222; padding: 10px; height: 100px; overflow-y: auto; font-size: 12px;';
        resultLogContainer.appendChild(resultLog);
        
        testUtils.appendChild(resultLogContainer);
        
        statusContent.appendChild(testUtils);
        
        statusContainer.appendChild(statusContent);
        document.body.appendChild(statusContainer);
    }
    
    // Add check button to the page
    function addCheckButton() {
        let button = document.createElement('button');
        button.textContent = "Check BGeigie Status";
        button.style.cssText = 'position: fixed; bottom: 50px; right: 10px; z-index: 1000; ' +
                             'padding: 8px 12px; background: #333; color: white; border: none; ' +
                             'border-radius: 4px; cursor: pointer; font-size: 14px;';
        
        button.onclick = function() {
            checkStatus();
        };
        
        document.body.appendChild(button);
        console.log("BGeigie status check button added");
    }
    
    // Initialize on page load
    if (document.readyState === 'complete') {
        addCheckButton();
    } else {
        window.addEventListener('load', addCheckButton);
    }
})(); 