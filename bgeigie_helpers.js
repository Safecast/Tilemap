// bgeigie_helpers.js - Helper functions for working with bGeigie logs

(function() {
    console.log("bGeigie helper functions loaded");
    
    // Add a helper button to the UI for easier testing
    function addHelperInterface() {
        // Remove existing helper if it exists
        var existingHelper = document.getElementById('bgeigie-helper');
        if (existingHelper) {
            document.body.removeChild(existingHelper);
        }
        
        // Create a floating helper container
        var helperContainer = document.createElement('div');
        helperContainer.id = 'bgeigie-helper';
        helperContainer.style.cssText = 'position: fixed; top: 50%; left: 50%; transform: translate(-50%, -50%); ' + 
                                        'background: white; padding: 20px; border-radius: 4px; ' +
                                        'box-shadow: 0 4px 15px rgba(0,0,0,0.3); z-index: 2000; ' + 
                                        'font-family: Arial, sans-serif; font-size: 14px; width: 400px; max-width: 90vw;';
        
        // Create close button (X) in the top right
        var closeX = document.createElement('div');
        closeX.textContent = '×';
        closeX.style.cssText = 'position: absolute; top: 10px; right: 15px; font-size: 20px; cursor: pointer; color: #666;';
        closeX.onclick = function() {
            document.body.removeChild(helperContainer);
        };
        helperContainer.appendChild(closeX);
        
        // Create header
        var header = document.createElement('div');
        header.textContent = 'bGeigie Logs';
        header.style.cssText = 'font-weight: bold; font-size: 16px; text-align: center; margin-bottom: 15px; ' +
                               'padding-bottom: 10px; border-bottom: 1px solid #ccc;';
        helperContainer.appendChild(header);
        
        // Create description
        var description = document.createElement('div');
        description.innerHTML = 'A bGeigie log contains the original data points upon which the Safecast map tiles are based.<br><br>' +
                               'This offers additional information and greater resolution, but is limited to a smaller subset of data.';
        description.style.cssText = 'margin-bottom: 15px; line-height: 1.4;';
        helperContainer.appendChild(description);
        
        // Create instructions
        var instructions = document.createElement('div');
        instructions.innerHTML = 'To Add: Enter the ID of a <a href="#" style="color: #006699;">log</a>. Click "Search".';
        instructions.style.cssText = 'margin-bottom: 15px; font-weight: bold;';
        helperContainer.appendChild(instructions);
        
        // Create form section
        var formSection = document.createElement('div');
        formSection.style.cssText = 'margin-bottom: 15px;';
        
        // Create search type dropdown and input field (on same line)
        var searchTypeRow = document.createElement('div');
        searchTypeRow.style.cssText = 'display: flex; margin-bottom: 10px;';
        
        var searchTypeSelect = document.createElement('select');
        searchTypeSelect.style.cssText = 'padding: 5px; margin-right: 5px; width: 100px;';
        var searchTypeOptions = ['Log IDs', 'User ID', 'Text Query'];
        searchTypeOptions.forEach(function(option) {
            var opt = document.createElement('option');
            opt.value = option.toLowerCase().replace(' ', '_');
            opt.textContent = option;
            searchTypeSelect.appendChild(opt);
        });
        searchTypeRow.appendChild(searchTypeSelect);
        
        var searchInput = document.createElement('input');
        searchInput.type = 'text';
        searchInput.id = 'bgeigie-helper-input';
        searchInput.placeholder = 'Enter bGeigie Log ID(s)';
        searchInput.style.cssText = 'flex: 1; padding: 5px;';
        searchTypeRow.appendChild(searchInput);
        
        formSection.appendChild(searchTypeRow);
        
        // Create date range row (two date inputs side by side)
        var dateRow = document.createElement('div');
        dateRow.style.cssText = 'display: flex; justify-content: space-between; margin-bottom: 10px;';
        
        var startDateInput = document.createElement('input');
        startDateInput.type = 'text';
        startDateInput.placeholder = 'mm / dd / yyyy';
        startDateInput.style.cssText = 'width: 48%; padding: 5px;';
        dateRow.appendChild(startDateInput);
        
        var endDateInput = document.createElement('input');
        endDateInput.type = 'text';
        endDateInput.placeholder = 'mm / dd / yyyy';
        endDateInput.style.cssText = 'width: 48%; padding: 5px;';
        dateRow.appendChild(endDateInput);
        
        formSection.appendChild(dateRow);
        
        // Create status and subtype dropdowns row
        var filtersRow = document.createElement('div');
        filtersRow.style.cssText = 'display: flex; justify-content: space-between; margin-bottom: 10px;';
        
        var statusSelect = document.createElement('select');
        statusSelect.style.cssText = 'width: 48%; padding: 5px;';
        var statusOption = document.createElement('option');
        statusOption.textContent = 'All Status Types';
        statusSelect.appendChild(statusOption);
        filtersRow.appendChild(statusSelect);
        
        var subtypeSelect = document.createElement('select');
        subtypeSelect.style.cssText = 'width: 48%; padding: 5px;';
        var subtypeOption = document.createElement('option');
        subtypeOption.textContent = 'All Subtypes';
        subtypeSelect.appendChild(subtypeOption);
        filtersRow.appendChild(subtypeSelect);
        
        formSection.appendChild(filtersRow);
        
        // Create options and remove all buttons row
        var optionsRow = document.createElement('div');
        optionsRow.style.cssText = 'display: flex; justify-content: space-between; margin-bottom: 15px;';
        
        var optionsButton = document.createElement('button');
        optionsButton.textContent = 'Options...';
        optionsButton.style.cssText = 'width: 48%; padding: 5px;';
        optionsRow.appendChild(optionsButton);
        
        var removeAllButton = document.createElement('button');
        removeAllButton.textContent = 'Remove All';
        removeAllButton.style.cssText = 'width: 48%; padding: 5px;';
        removeAllButton.onclick = function() {
            if (typeof clearBGeigieLogs === 'function') {
                clearBGeigieLogs();
                updateStatus('All logs cleared');
            } else if (window._bvProxy && window._bvProxy._bvm && window._bvProxy._bvm.RemoveAllMarkersFromMapAndPurgeData) {
                window._bvProxy._bvm.RemoveAllMarkersFromMapAndPurgeData();
                updateStatus('All logs cleared');
            } else {
                updateStatus('Error: Could not clear logs - BVM not initialized', true);
            }
        };
        optionsRow.appendChild(removeAllButton);
        
        formSection.appendChild(optionsRow);
        
        // Create divider
        var divider = document.createElement('hr');
        divider.style.cssText = 'border: none; border-top: 1px solid #ccc; margin-bottom: 15px;';
        formSection.appendChild(divider);
        
        // Create search button (centered)
        var searchButtonWrapper = document.createElement('div');
        searchButtonWrapper.style.cssText = 'text-align: center;';
        
        var searchButton = document.createElement('button');
        searchButton.textContent = 'Search';
        searchButton.style.cssText = 'padding: 5px 20px;';
        searchButton.onclick = function() {
            var logId = document.getElementById('bgeigie-helper-input').value.trim();
            if (logId) {
                console.log('Adding bGeigie log:', logId);
                
                // Try all possible methods to add the log
                var added = false;
                
                // Method 1: Using the global helper function
                if (typeof addBGeigieLog === 'function') {
                    try {
                        addBGeigieLog(logId);
                        added = true;
                        console.log('Log added using addBGeigieLog function');
                    } catch (e) {
                        console.error('Error using addBGeigieLog:', e);
                    }
                }
                
                // Method 2: Using _bvProxy directly
                if (!added && window._bvProxy) {
                    try {
                        if (typeof window._bvProxy.AddLogsCSV === 'function') {
                            window._bvProxy.AddLogsCSV(logId, true);
                            added = true;
                            console.log('Log added using _bvProxy.AddLogsCSV');
                        } else if (window._bvProxy._bvm && typeof window._bvProxy._bvm.AddLogsByQueryFromString === 'function') {
                            window._bvProxy._bvm.AddLogsByQueryFromString(logId);
                            added = true;
                            console.log('Log added using _bvProxy._bvm.AddLogsByQueryFromString');
                        }
                    } catch (e) {
                        console.error('Error using _bvProxy methods:', e);
                    }
                }
                
                // Method 3: Last resort - Try to initialize _bvProxy if needed
                if (!added && !window._bvProxy && typeof BvProxy !== 'undefined') {
                    try {
                        console.log('Initializing BvProxy...');
                        window._bvProxy = new BvProxy();
                        if (window._bvProxy) {
                            window._bvProxy.AddLogsCSV(logId, true);
                            added = true;
                            console.log('Log added after initializing _bvProxy');
                        }
                    } catch (e) {
                        console.error('Error initializing BvProxy:', e);
                    }
                }
                
                if (added) {
                    updateStatus('Added log: ' + logId);
                    
                    // Close the dialog after successful add
                    setTimeout(function() {
                        if (helperContainer.parentNode) {
                            document.body.removeChild(helperContainer);
                        }
                    }, 1500);
                } else {
                    updateStatus('Error: Could not add log - BVM not initialized', true);
                    console.error('BvProxy status:', window._bvProxy ? 'Initialized' : 'Not initialized');
                    if (window._bvProxy) {
                        console.error('BVM status:', window._bvProxy._bvm ? 'Initialized' : 'Not initialized');
                    }
                }
            } else {
                updateStatus('Please enter a log ID');
            }
        };
        searchButtonWrapper.appendChild(searchButton);
        
        formSection.appendChild(searchButtonWrapper);
        
        helperContainer.appendChild(formSection);
        
        // Create status display (hidden by default)
        var status = document.createElement('div');
        status.id = 'bgeigie-helper-status';
        status.style.cssText = 'margin-top: 10px; font-size: 12px; color: #666; text-align: center; padding: 5px; display: none;';
        status.textContent = '';
        helperContainer.appendChild(status);
        
        // Add example logs (optional, hidden by default)
        var exampleSection = document.createElement('div');
        exampleSection.style.cssText = 'margin-top: 10px; border-top: 1px dashed #ccc; padding-top: 10px; display: none;';
        
        var exampleTitle = document.createElement('div');
        exampleTitle.textContent = 'Example Logs:';
        exampleTitle.style.cssText = 'margin-bottom: 5px; font-size: 12px; font-weight: bold;';
        exampleSection.appendChild(exampleTitle);
        
        var exampleLogs = [
            { id: "29", label: "Log 29 (March 2011)" },
            { id: "46", label: "Log 46 (Japan)" },
            { id: "100", label: "Log 100" },
            { id: "21584", label: "Log 21584 (More data)" },
            { id: "67925", label: "Log 67925 (User requested)" }
        ];
        
        exampleLogs.forEach(function(example) {
            var exampleLink = document.createElement('a');
            exampleLink.href = '#';
            exampleLink.textContent = example.label;
            exampleLink.style.cssText = 'display: block; margin-bottom: 3px; color: #006699; font-size: 12px;';
            exampleLink.onclick = function(e) {
                e.preventDefault();
                
                // Try all possible methods to add the log
                var added = false;
                
                if (typeof addBGeigieLog === 'function') {
                    try {
                        addBGeigieLog(example.id);
                        added = true;
                    } catch (e) {
                        console.error('Error using addBGeigieLog for example:', e);
                    }
                }
                
                if (!added && window._bvProxy) {
                    try {
                        if (typeof window._bvProxy.AddLogsCSV === 'function') {
                            window._bvProxy.AddLogsCSV(example.id, true);
                            added = true;
                        } else if (window._bvProxy._bvm && typeof window._bvProxy._bvm.AddLogsByQueryFromString === 'function') {
                            window._bvProxy._bvm.AddLogsByQueryFromString(example.id);
                            added = true;
                        }
                    } catch (e) {
                        console.error('Error using _bvProxy methods for example:', e);
                    }
                }
                
                if (added) {
                    updateStatus('Added example log: ' + example.id);
                    
                    // Close the dialog after successful add
                    setTimeout(function() {
                        if (helperContainer.parentNode) {
                            document.body.removeChild(helperContainer);
                        }
                    }, 1500);
                } else {
                    updateStatus('Error: Could not add log - BVM not initialized', true);
                }
            };
            exampleSection.appendChild(exampleLink);
        });
        
        // Add a "Show Examples" link
        var showExamplesLink = document.createElement('a');
        showExamplesLink.href = '#';
        showExamplesLink.textContent = 'Show Examples';
        showExamplesLink.style.cssText = 'margin-top: 10px; font-size: 11px; color: #999; text-align: center; display: block;';
        showExamplesLink.onclick = function(e) {
            e.preventDefault();
            if (exampleSection.style.display === 'none') {
                exampleSection.style.display = 'block';
                showExamplesLink.textContent = 'Hide Examples';
            } else {
                exampleSection.style.display = 'none';
                showExamplesLink.textContent = 'Show Examples';
            }
        };
        helperContainer.appendChild(showExamplesLink);
        
        helperContainer.appendChild(exampleSection);
        
        // Add to document
        document.body.appendChild(helperContainer);
        
        // Focus the input field
        setTimeout(function() {
            searchInput.focus();
        }, 100);
        
        console.log('bGeigie helper interface added');
    }
    
    // Update status message
    function updateStatus(message, isError) {
        var status = document.getElementById('bgeigie-helper-status');
        if (status) {
            status.textContent = message;
            status.style.display = 'block';
            status.style.color = isError ? '#d9534f' : '#666';
            
            // Hide the status after 3 seconds
            setTimeout(function() {
                status.style.display = 'none';
            }, 3000);
        }
    }
    
    // Connect the helper to the "Search..." button in the sidebar
    function connectToSearchButton() {
        var searchButton = document.getElementById('menu_logs_0');
        if (searchButton) {
            console.log('Found Search button, attaching event listener');
            searchButton.addEventListener('click', function(e) {
                e.preventDefault();
                e.stopPropagation();
                addHelperInterface();
            });
            console.log('Connected bGeigie helper to Search button');
        } else {
            console.log('Search button not found, will try again later');
            setTimeout(connectToSearchButton, 1000);
        }
    }
    
    // Manual initialization function
    function ensureBGeigieInitialized() {
        console.log('Ensuring bGeigie viewer is initialized');
        
        // Check if _bvProxy is already initialized
        if (!window._bvProxy && typeof BvProxy !== 'undefined') {
            try {
                console.log('Creating new BvProxy instance');
                window._bvProxy = new BvProxy();
            } catch (e) {
                console.error('Error creating BvProxy:', e);
            }
        }
        
        return !!window._bvProxy;
    }
    
    // Add globals for easier debugging and use from console
    window.bGeigieHelpers = {
        addHelperInterface: addHelperInterface,
        updateStatus: updateStatus,
        ensureBGeigieInitialized: ensureBGeigieInitialized,
        
        // Direct log adders
        addLog: function(logId) {
            if (!ensureBGeigieInitialized()) {
                console.error('Could not initialize bGeigie viewer');
                return false;
            }
            
            try {
                if (window._bvProxy.AddLogsCSV) {
                    window._bvProxy.AddLogsCSV(logId, true);
                    return true;
                } else if (window._bvProxy._bvm && window._bvProxy._bvm.AddLogsByQueryFromString) {
                    window._bvProxy._bvm.AddLogsByQueryFromString(logId);
                    return true;
                }
            } catch (e) {
                console.error('Error adding log:', e);
                return false;
            }
            
            return false;
        },
        
        clearLogs: function() {
            if (!window._bvProxy || !window._bvProxy._bvm) {
                return false;
            }
            
            try {
                window._bvProxy._bvm.RemoveAllMarkersFromMapAndPurgeData();
                return true;
            } catch (e) {
                console.error('Error clearing logs:', e);
                return false;
            }
        },
        
        // Example logs that are known to work
        exampleLogs: [
            "29",   // Early log from March 2011
            "46",   // Early log from Japan
            "100",  // Another early log
            "21584", // Later log with more data
            "67925"  // User requested log
        ],
        
        // Add example log
        addExampleLog: function(index) {
            if (index >= 0 && index < this.exampleLogs.length) {
                return this.addLog(this.exampleLogs[index]);
            }
            return false;
        }
    };
    
    // Initialize by connecting to the search button instead of showing immediately
    console.log('Initializing bGeigie helpers...');
    ensureBGeigieInitialized();
    
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', connectToSearchButton);
    } else {
        connectToSearchButton();
    }
})(); 