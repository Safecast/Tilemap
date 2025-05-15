// safemap_compat.js - Compatibility layer for Leaflet implementation

(function() {
    console.log("SafeMap compatibility layer loaded");
    
    // Flag to prevent multiple initialization and infinite recursion
    var _elementConnectionsApplied = false;
    
    // Create UI elements required by safemap.js if not already present
    function createRequiredUIElements() {
        // Create missing UL elements required for layer handling
        var requiredUls = [
            { id: 'ul_menu_layers', class: 'ul_menu' },
            { id: 'ul_menu_basemap', class: 'ul_menu' },
            { id: 'ul_menu_logs', class: 'ul_menu' }
        ];
        
        var created = false;
        
        requiredUls.forEach(function(item) {
            if (!document.getElementById(item.id)) {
                var ul = document.createElement('ul');
                ul.id = item.id;
                ul.className = item.class;
                ul.style.display = 'none'; // Hide these elements since we're using a different UI
                document.body.appendChild(ul);
                created = true;
            }
        });
        
        // Add the progress bar for log loading if it doesn't exist
        if (!document.getElementById('bv_transferBar')) {
            var transferBar = document.createElement('div');
            transferBar.id = 'bv_transferBar';
            transferBar.className = 'bv_transferBarHidden';
            transferBar.style.cssText = 'position: fixed; bottom: 0; left: 0; width: 100%; height: 20px; background-color: #f0f0f0; display: none;';
            document.body.appendChild(transferBar);
            created = true;
        }
        
        // Create required AList global for safemap.js
        if (typeof window.AList === 'undefined') {
            window.AList = function() {
                return {
                    isString: function(s) { return typeof s === 'string'; },
                    isArray: function(a) { return Array.isArray(a); },
                    isEqual: function(a, b) { return a === b; },
                    isFunction: function(f) { return typeof f === 'function'; }
                };
            };
            created = true;
        }
        
        // Fix aList function from safemap.js that uses document.getElementById which can return null
        if (typeof window.aList !== 'function') {
            window.aList = function(el) {
                if (typeof el === 'string') {
                    el = document.getElementById(el);
                }
                // Protection against null elements
                if (!el) {
                    console.warn("aList called with null/missing element");
                    return [];
                }
                var res = [];
                for (var i = 0; i < el.childNodes.length; i++) {
                    if (el.childNodes[i].nodeName.toLowerCase() === 'li') {
                        res.push(el.childNodes[i]);
                    }
                }
                return res;
            };
            
            // Also fix aListId which depends on aList
            window.aListId = function(el) {
                return window.aList(el);
            };
            
            created = true;
        }
        
        // Create necessary menu items for ul_menu_logs
        var ulMenuLogs = document.getElementById('ul_menu_logs');
        if (ulMenuLogs && ulMenuLogs.children.length === 0) {
            // Create the necessary li elements with IDs that match the expected ones
            var items = [
                { id: 'menu_logs_0', text: 'Search...' },
                { id: 'menu_logs_1', text: 'View Current Logs' },
                { id: 'menu_logs_2', text: 'Remove All' },
                { id: 'menu_logs_3', text: 'Options' }
            ];
            
            items.forEach(function(item) {
                if (!document.getElementById(item.id)) {
                    var li = document.createElement('li');
                    li.id = item.id;
                    li.textContent = item.text;
                    ulMenuLogs.appendChild(li);
                    created = true;
                }
            });
        }
        
        if (created) {
            console.log("Created missing UI elements for safemap.js compatibility");
        }
    }
    
    // Fix global null reference errors in safemap.js 
    function fixSafemapGlobals() {
        // Fix overlayMaps null reference in safemap.js
        if (typeof window.overlayMaps === 'undefined') {
            window.overlayMaps = {
                layer_ids: [],
                _url_templates: {},
                GetUrlTemplateForLayerId: function() { return ""; }
            };
            console.log("Created overlayMaps compatibility object");
        }
        
        // Patch any functions that don't handle null values properly
        if (window.HudProxy && typeof window.HudProxy.prototype.MakeSelectors === 'function') {
            var originalMakeSelectors = window.HudProxy.prototype.MakeSelectors;
            window.HudProxy.prototype.MakeSelectors = function() {
                try {
                    return originalMakeSelectors.apply(this, arguments);
                } catch (e) {
                    console.error("Error in patched MakeSelectors:", e);
                    return {};
                }
            };
        }
        
        // Patch the BindEventsUI function to handle errors
        if (window.BindEventsUI) {
            var originalBindEventsUI = window.BindEventsUI;
            window.BindEventsUI = function(t, r) {
                try {
                    return originalBindEventsUI(t, r);
                } catch (e) {
                    console.error("Error in patched BindEventsUI:", e);
                    return false;
                }
            };
        }
    }
    
    // Fix SafemapInit to work with Leaflet map
    function fixSafemapInit() {
        // Wait for SafemapInit to be available
        if (typeof SafemapInit === 'undefined') {
            setTimeout(fixSafemapInit, 100);
            return;
        }
        
        // Store the original Init method
        const originalInit = SafemapInit.Init;
        
        // Override the Init method with our patched version
        SafemapInit.Init = function(map) {
            // Store map reference globally
            window.map = map;
            
            // Create required UI elements before calling original init
            createRequiredUIElements();
            
            // Fix common global null reference errors
            fixSafemapGlobals();
            
            try {
                // Patch BindEventsUI to handle null elements
                if (typeof SafemapInit.BindEventsUI === 'function') {
                    var originalBindEventsUI = SafemapInit.BindEventsUI;
                    SafemapInit.BindEventsUI = function(t, r) {
                        try {
                            return originalBindEventsUI(t, r);
                        } catch (e) {
                            console.error("Error in patched BindEventsUI:", e);
                            return false;
                        }
                    };
                }
                
                // Call the original Init method
                originalInit.call(SafemapInit, map);
                console.log("SafemapInit.Init patched successfully");
            } catch (e) {
                console.error("Error in patched SafemapInit.Init:", e);
                
                // Try to create a basic compatibility layer
                if (typeof BvProxy === 'function' && !window._bvProxy) {
                    try {
                        window._bvProxy = new BvProxy();
                        console.log("Created BvProxy as fallback");
                    } catch (e2) {
                        console.error("Error creating BvProxy:", e2);
                    }
                }
            }
            
            // Connect UI elements in sidebar with their counterparts in the hidden UL elements
            // But only if we haven't already done so
            if (!_elementConnectionsApplied) {
                connectUIElements();
            }
        };
    }
    
    // Connect the visible UI elements in the sidebar with the hidden UL elements
    function connectUIElements() {
        // Guard against infinite recursion by setting a flag
        if (_elementConnectionsApplied) {
            console.log("UI element connections already applied, skipping");
            return;
        }
        
        _elementConnectionsApplied = true;
        console.log("Connecting UI elements...");
        
        // Connect the "Search..." item in sidebar to the menu_logs_0 li element
        var sidebarSearchItem = document.querySelector('#bgeigie-content .layer-item#menu_logs_0');
        var menuLogsSearch = document.getElementById('menu_logs_0');
        
        if (sidebarSearchItem && menuLogsSearch) {
            // Remove any existing event listeners
            var newSidebarSearchItem = sidebarSearchItem.cloneNode(true);
            sidebarSearchItem.parentNode.replaceChild(newSidebarSearchItem, sidebarSearchItem);
            sidebarSearchItem = newSidebarSearchItem;
            
            sidebarSearchItem.addEventListener('click', function(e) {
                e.preventDefault();
                e.stopPropagation();
                
                // Use the bgeigie_helpers implementation if available
                if (window.bGeigieHelpers && typeof window.bGeigieHelpers.addHelperInterface === 'function') {
                    window.bGeigieHelpers.addHelperInterface();
                    return;
                }
                
                // Fall back to simpler approach
                var event = new MouseEvent('click', {
                    bubbles: true,
                    cancelable: true,
                    view: window
                });
                menuLogsSearch.dispatchEvent(event);
            });
        }
        
        // Connect the "Remove All" item in sidebar
        var sidebarRemoveItem = document.querySelector('#bgeigie-content .layer-item#menu_logs_2');
        var menuLogsRemove = document.getElementById('menu_logs_2');
        
        if (sidebarRemoveItem && menuLogsRemove) {
            // Remove any existing event listeners
            var newSidebarRemoveItem = sidebarRemoveItem.cloneNode(true);
            sidebarRemoveItem.parentNode.replaceChild(newSidebarRemoveItem, sidebarRemoveItem);
            sidebarRemoveItem = newSidebarRemoveItem;
            
            sidebarRemoveItem.addEventListener('click', function(e) {
                e.preventDefault();
                e.stopPropagation();
                
                // Use the clearBGeigieLogs function directly if available
                if (typeof window.clearBGeigieLogs === 'function') {
                    window.clearBGeigieLogs();
                    return;
                }
                
                // Fall back to original behavior
                var event = new MouseEvent('click', {
                    bubbles: true,
                    cancelable: true,
                    view: window
                });
                menuLogsRemove.dispatchEvent(event);
            });
        }
        
        // Connect the "Options" item in sidebar
        var sidebarOptionsItem = document.querySelector('#bgeigie-content .layer-item#menu_logs_3');
        var menuLogsOptions = document.getElementById('menu_logs_3');
        
        if (sidebarOptionsItem && menuLogsOptions) {
            // Remove any existing event listeners
            var newSidebarOptionsItem = sidebarOptionsItem.cloneNode(true);
            sidebarOptionsItem.parentNode.replaceChild(newSidebarOptionsItem, sidebarOptionsItem);
            sidebarOptionsItem = newSidebarOptionsItem;
            
            sidebarOptionsItem.addEventListener('click', function(e) {
                e.preventDefault();
                e.stopPropagation();
                
                var event = new MouseEvent('click', {
                    bubbles: true,
                    cancelable: true,
                    view: window
                });
                menuLogsOptions.dispatchEvent(event);
            });
        }
        
        console.log("UI element connections applied");
    }
    
    // Create global helper functions for compatibility 
    if (typeof ElCr !== 'function') {
        window.ElCr = function(n) { 
            return document.createElement(n); 
        };
    }
    
    if (typeof ElGet !== 'function') {
        window.ElGet = function(id) { 
            return document.getElementById(id); 
        };
    }
    
    // Fix global safemap.js references immediately
    fixSafemapGlobals();
    
    // Fix the compatibility layer
    fixSafemapInit();
    
    // Initialize when the page loads
    function init() {
        createRequiredUIElements();
    }
    
    if (document.readyState === 'complete') {
        init();
    } else {
        window.addEventListener('load', init);
    }
})(); 