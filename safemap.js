//
// Copyright (C) 2011  Lionel Bergeret
//
// ----------------------------------------------------------------
// The contents of this file are distributed under the CC0 license.
// See http://creativecommons.org/publicdomain/zero/1.0/
// ----------------------------------------------------------------
//
// Modifications - 2014, 2015, 2016 - Nick Dolezal

// safemap.js is the primary code-behind for the Safecast webmap and loads all other components
// asynchronously as needed.

// ===============================================================================================
// =========================================== GLOBALS ===========================================
// ===============================================================================================


// ========== GOOGLE MAPS OBJECTS =============
var map               = null;
var geocoder          = null;


// ========== RETAINED INSTANCES =============
var _bitsProxy        = null;    // retained proxy instance for bitmap indices
var _bvProxy          = null;    // retained proxy instance for bGeigie Log Viewer
var _hudProxy         = null;    // retained proxy instance for HUD / reticle value lookup
var _rtvm             = null;    // retained RT sensor viewer instance
var _mapPolysProxy    = null;    // retained proxy instance for map polygons
var _flyToExtentProxy = null;    // retained proxy instance for map pans/zooms/stylized text display
var _locStringsProxy  = null;    // retained proxy instance for localized UI strings
var slideout          = null;    // retained slideout menu

// ========== INTERNAL STATES =============
var _cached_ext       = { baseurl:null, urlyxz:null, lidx:-1, cd:false, cd_y:0.0, cd_x:0.0, cd_z:0, midx:-1, mt:null };
var _lastLayerIdx     = 0;
var _disable_alpha    = false;           // hack for media request regarding layer opacity
var _cm_hidden        = true;            // state of menu visibility - cached to reduce CPU hit on map pans
var _ui_layer_idx     = 0;
var _ui_menu_layers_more_visible = false;
var _ui_menu_basemap_more_visible = false;
var _system_os_ios = navigator.userAgent.match(/iPad/i) || navigator.userAgent.match(/iPhone/i);
var _last_history_push_ms = -1;
var _img_tile_shadow_idx = -1;

// ========== USER PREFS =============
var _no_hdpi_tiles    = false;
var _img_scaler_idx   = 1;
var _use_jp_region    = false;
var _use_https        = window.location.href.substring(0,5) == "https";


// ============ LEGACY SUPPORT =============
var _bs_ready       = true; // HACK for legacy "show bitstores"
var _layerBitstores = null; // HACK for legacy "show bitstores"
var useBitmapIdx    = true; // HACK for legacy "show bitstores"
var _cached_baseURL = null; // 2015-08-22 ND: fix for legacy "show bitstores"


// ========== GOOGLE MAPS LAYERS =============
var overlayMaps          = null;
var basemapMapTypes      = null;

// ============= TEST ================
var _test_client_render = false; // should be off here by default
var LOCAL_TEST_MODE     = false; // likely does *not* work anymore.








// ===============================================================================================
// ============================================= INIT ============================================
// ===============================================================================================


var SafemapInit = (function()
{
    function SafemapInit()
    {
    }


    var _InitUseJpRegion = function()
    {
        var jstmi      = -540;
        var tzmi       = (new Date()).getTimezoneOffset(); // JST = -540
        _use_jp_region = (jstmi - 180) <= tzmi && tzmi <= (jstmi + 180); // get +/- 3 TZs from Japan... central asia - NZ
    };


    var _InitAboutMenu = function()
    {
        AListId("aMenuAbout", "click", SafemapPopupHelper.ToggleAboutPopup);
        AListId("about_content", "click", SafemapPopupHelper.ToggleAboutPopup);
    };


    var _InitLogIdsFromQuerystring = function()
    {
        var logIds = SafemapUI.GetParam("logids");
    
        if (logIds != null && logIds.length > 0)
        {
            _bvProxy.AddLogsCSV(logIds, false);
        }//if
    };


    var _GetDefaultBasemapOrOverrideFromQuerystring = function()
    {
        var midx = SafemapUI.QueryString_GetParamAsInt("m");
        if (midx == -1) midx = SafemapUI.QueryString_GetParamAsInt("midx");
        if (midx == -1) midx = PrefHelper.GetBasemapUiIndexPref();

        return BasemapHelper.GetMapTypeIdForBasemapIdx(midx);
    };


    var _InitDefaultRasterLayerOrOverrideFromQuerystring = function()
    {
        var lidx = SafemapUI.QueryString_GetParamAsInt("l");
        if (lidx == -1) lidx = SafemapUI.QueryString_GetParamAsInt("lidx");

        if (lidx == -1)
        {
            lidx = PrefHelper.GetLayerUiIndexPref();
        
            // 2016-11-21 ND: Fix for proxy value being stored as pref
            if (lidx == 12) lidx = 13;
        }//if    

        LayersHelper.SetSelectedIdxAndSync(lidx);

        if (LayersHelper.IsIdxTimeSlice(lidx))
        {
            TimeSliceUI.SetPanelHidden(false);
        }//if    
    };



    // The more complete version of IsDefaultLocation().
    // This accomodates the location preference.  Previously, it could be
    // safely assumed that if a link with the location wasn't followed,
    // it was the default location and the text should be displayed.
    // However, this should not be used for the case of determining whether
    // or not to autozoom to logids in the querystring.  Rather, the
    // old IsDefaultLocation() should be checked for that.
    var _IsDefaultLocationOrPrefLocation = function()
    {
        var d = SafemapUI.IsDefaultLocation();

        if (d)
        {
            var yx = SafemapUtil.GetNormalizedMapCentroid();
            var z  = map.getZoom();
        
            d = z == 9 && Math.abs(yx.x - 140.515516) < 0.000001
                       && Math.abs(yx.y -  37.316113) < 0.000001;
        }//if

        return d;
    };


    var _InitShowLocationIfDefault = function()
    {
        if (_IsDefaultLocationOrPrefLocation() && SafemapUI.GetParam("logids").length == 0 && "requestAnimationFrame" in window)
        {
            _flyToExtentProxy.ShowLocationText("Honshu, Japan");
        }//if
    };


    var _InitContextMenu = function() 
    {
        if (SafemapUI.IsBrowserOldIE() || map == null || navigator.userAgent.match(/iPad/i) || navigator.userAgent.match(/iPhone/i)) return;

        // Original from http://justgizzmo.com/2010/12/07/google-maps-api-v3-context-menu/

        var cm = document.createElement("ul");
        cm.id = "contextMenu";
        cm.style.display = "none";
        cm.innerHTML = '<li><a href="#apiQuery" class="FuturaFont">Query Safecast API Here</a></li>'
                           + '<li class="separator"></li>'
                           + '<li><a href="#zoomIn" class="FuturaFont">Zoom In</a></li>'
                           + '<li><a href="#zoomOut" class="FuturaFont">Zoom Out</a></li>'
                           + '<li><a href="#centerHere" class="FuturaFont">Center Map Here</a></li>';
        document.getElementById("map_canvas").appendChild(cm);

        var clickLL;
        var fxClickRight = function(e)
        {
            _cm_hidden = false;
            SafemapUI.AnimateElementFadeIn(cm, -1.0, 0.166666666667);
            var mapDiv = document.getElementById("map_canvas");
            var x      = e.pixel.x;
            var y      = e.pixel.y;
            clickLL    = e.latLng;
            if (x > mapDiv.offsetWidth  - cm.offsetWidth)  x -= cm.offsetWidth;
            if (y > mapDiv.offsetHeight - cm.offsetHeight) y -= cm.offsetHeight;

            cm.style.top  = ""+y+"px";
            cm.style.left = ""+x+"px";        
        };

        google.maps.event.addListener(map, "rightclick", fxClickRight);

        var fxClickLeft = function(e)
        {
            var action = this.getAttribute("href").substr(1);
            var retVal = false;                        
            switch (action) 
            {
                case "zoomIn":
                    map.setZoom(map.getZoom() + 3);
                    map.panTo(clickLL);
                    break;
                case "zoomOut":
                    map.setZoom(map.getZoom() - 3);
                    map.panTo(clickLL);
                    break;
                case "centerHere":
                    map.panTo(clickLL);
                    break;
                case "null":
                    break;
                case "showIndices1":
                    ShowBitmapIndexVisualization(true, 4);
                    break;
                case "showIndices2":
                    ShowBitmapIndexVisualization(false, 4);
                    break;
                case "apiQuery":
                    SafemapUI.QuerySafecastApiAsync(clickLL.lat(), clickLL.lng(), map.getZoom());
                    break;
                default:
                    retVal = true;
                    break;
            }//switch

            _cm_hidden = true; 
            cm.style.display = "none";

            return retVal;
        };

        var as = cm.getElementsByTagName("a");

        for (var i=0; i<as.length; i++)
        {
            as[i].addEventListener("click", fxClickLeft, false);
            as[i].addEventListener("mouseover", function() { this.parentNode.className = "hover"; }.bind(as[i]), false);
            as[i].addEventListener("mouseout",  function() { this.parentNode.className = null;    }.bind(as[i]), false);
        }//for

        var events = [ "click" ]; //"dragstart", "zoom_changed", "maptypeid_changed"

        var hide_cb = function(e)
        {
            if (!_cm_hidden)
            { 
                _cm_hidden       = true; 
                cm.style.display = "none";
            }//if
        };

        for (var i=0; i<events.length; i++)
        {
            google.maps.event.addListener(map, events[i], hide_cb);
        }//for
    };


    // supports showing the bitmap indices, which is contained in legacy code
    // with nasty deps that i haven't had time to rewrite.
    var _ShowBitmapIndexVisualization = function(isShowAll, rendererId)
    {
        if (!_bitsProxy.GetIsReady()) // bad way of handling deps... but this is just a legacy hack anyway.
        {
            _setTimeout(function() { _ShowBitmapIndexVisualization(isShowAll, rendererId); }.bind(this), 500);
            return;
        }//if
    
        _cached_baseURL = _cached_ext.baseurl;  // 2015-08-22 ND: fix for legacy bitmap viewer support
        _layerBitstores = new Array();    
        _bitsProxy.InitLayerIds([2,3,6,8,9,16]);
        for (var i=0; i<_bitsProxy._layerBitstores.length; i++)
        {
            _layerBitstores.push(_bitsProxy._layerBitstores[i]);
        }
        if (_rtvm != null) _rtvm.RemoveAllMarkersFromMapAndPurgeData();
        SafemapUI.RequireJS("bmp_lib_min.js", false, null, null);  // ugly bad legacy feature hack, but not worth rewriting this at the moment
        SafemapUI.RequireJS("png_zlib_min.js", false, null, null);
        SafemapUI.RequireJS("gbGIS_min.js", false, null, null);
        TestDump(isShowAll, rendererId);
    };

    var _InitGMapsStyleHack = function()
    {
        var ff = "Futura,Futura-Medium,'Futura Medium','Futura ND Medium','Futura Std Medium','Futura Md BT','Century Gothic',Roboto,'Segoe UI',Helvetica,Arial,sans-serif";
        var fr = function(el_name) {
            var ds = ElGet("map_canvas").getElementsByTagName(el_name);
            if (ds == null) return;
            for (var i=0; i<ds.length; i++) 
            {
                var s = ds[i].style;
                if (s != null && s.fontFamily != null && s.fontFamily.indexOf("Roboto") > -1 && s.fontFamily.indexOf("Futura") == -1) {
                    ds[i].style.fontFamily = ff;
                }
            }
        };
        setTimeout(fr("div"), 500);
    };

    var _InjectSafariPerfFix = function() 
    {
        if (   navigator.platform != null && navigator.platform == "MacIntel" 
            && navigator.vendor   != null && navigator.vendor   == "Apple Computer, Inc."
            && (_nua("Version/8.") || _nua("Version/9.") || _nua("Version/1"))
            && !_nua("Mobile")) 
        {
            var s = ElCr("style");
            s.type = "text/css";
            s.innerHTML = "#map_canvas div { -webkit-transform:translateZ(0px); -webkit-backface-visibility:hidden; }";
            document.head.appendChild(s);
        }
    };

    var _ApplyFirefoxNoDragHack = function() 
    {
        if (!("MozUserSelect" in document.body.style)) return;
        var a = ["imgMenuSafecastIcon", "imgMenuReticle"];
        var f = function(e) { e.preventDefault(); return false; };
        for (var i=0; i<a.length; i++) { AListId(a[i],"dragstart",f); }
    };

    var _InitRtViewer = function()
    {
        if (_rtvm == null && !SafemapUI.IsBrowserOldIE() && "ArrayBuffer" in window)
        {
            var cb = function() {
                _rtvm = new RTVM(map, null);
            };
        
            SafemapUI.RequireJS(SafemapUI.GetContentBaseUrl() + "rt_viewer_min.js", true, cb, null);
        }//if
    };




    SafemapInit.Init = function()
    {
        if (document == null || document.body == null) return;  // real old browsers that are going to break on everything

        _cached_ext.baseurl = SafemapUI.GetBaseWindowURL();

        PrefHelper.MakeFx();   // must happen before MenuHelperStub.Init();
        MenuHelperStub.Init(); // must happen before basemaps or layers are init

        _bitsProxy        = new BitsProxy("layers"); // mandatory, never disable
        _bvProxy          = new BvProxy();           // mandatory, never disable
        _hudProxy         = new HudProxy();          // mandatory, never disable
        _mapPolysProxy    = new MapPolysProxy();     // mandatory, never disable
        _flyToExtentProxy = new FlyToExtentProxy();  // mandatory, never disable
        _locStringsProxy  = new LocalizedStringsProxy(); // mandatory, never disable

        _InitUseJpRegion();

        if (_bitsProxy.GetUseBitstores()) // *** bitmap index dependents ***
        {
            var showIndicesParam = SafemapUI.QueryString_GetParamAsInt("showIndices");
            if (showIndicesParam != -1)
            {
                var rendererIdParam = SafemapUI.QueryString_GetParamAsInt("rendererId");
                setTimeout(function() { _ShowBitmapIndexVisualization(showIndicesParam == 1, rendererIdParam == -1 ? 4 : rendererIdParam); }.bind(this), 500);
                return; // this is a destructive action, no need for rest of init.
            }//if
        }//if

        // ************************** GMAPS **************************

        var yxz = SafemapUI.GetUserLocationFromQuerystring();
        var yx  = yxz.yx != null ? yxz.yx : new google.maps.LatLng(PrefHelper.GetVisibleExtentYPref(), PrefHelper.GetVisibleExtentXPref());
        var z   = yxz.z  != -1   ? yxz.z  : PrefHelper.GetVisibleExtentZPref();

        var map_options = 
        {
                                zoom: z,
                             maxZoom: 21,
                              center: yx,
                         scrollwheel: true,
                         zoomControl: PrefHelper.GetZoomButtonsEnabledPref(),
                          panControl: false,
                        scaleControl: true,
                      mapTypeControl: false,
                   streetViewControl: true,
                   navigationControl: true,
                  overviewMapControl: false,
            streetViewControlOptions: { position: google.maps.ControlPosition.RIGHT_BOTTOM },
                  zoomControlOptions: { position: google.maps.ControlPosition.RIGHT_BOTTOM },
                rotateControlOptions: { position: google.maps.ControlPosition.RIGHT_BOTTOM },
            navigationControlOptions: { style: google.maps.NavigationControlStyle.DEFAULT },
               mapTypeControlOptions: {
                                         position: google.maps.ControlPosition.TOP_RIGHT,
                                            style: google.maps.MapTypeControlStyle.DROPDOWN_MENU,
                                       mapTypeIds: BasemapHelper.basemaps
                                      },
                           mapTypeId: _GetDefaultBasemapOrOverrideFromQuerystring()
        };

        map = new google.maps.Map(document.getElementById("map_canvas"), map_options);

        BasemapHelper.InitBasemaps();   // must occur after "map" ivar is set

        ClientZoomHelper.InitGmapsLayers();

        TimeSliceUI.Init();
        _InitDefaultRasterLayerOrOverrideFromQuerystring();

        SafemapExtent.OnChange(SafemapExtent.Event.ZoomChanged); //fire on init for client zoom

        // arbitrarily space out some loads / init that don't need to happen right now, so as not to block on the main thread here.

        setTimeout(function() {
            SafemapExtent.InitEvents();
            _locStringsProxy.Init();
        }, 250);

        setTimeout(function() {
            _InitLogIdsFromQuerystring();
            _InitGMapsStyleHack;
            
            var cb = function() { SafemapExtent.OnChange(SafemapExtent.Event.DragEnd); SafemapExtent.OnChange(SafemapExtent.Event.ZoomChanged); };
            _flyToExtentProxy.Init(map, cb);
        }, 500);

        setTimeout(function() {
            _InitRtViewer();

            var rp = function(gs,eps) { MenuHelper.RegisterGroupsAndPolys(gs,eps);    };
            var gl = function()       { return PrefHelper.GetEffectiveLanguagePref(); };
            var gs = function(s,cb)   { _locStringsProxy.GetMenuStrings(s, cb);       };
            _mapPolysProxy.Init(map, rp, gl, gs);
        }, 1000);

        setTimeout(function() {
            _InitShowLocationIfDefault();
        }, 1500);

        setTimeout(function() {
            _InitAboutMenu(); 
            _InitContextMenu(); 
            (map.getStreetView()).setOptions({ zoomControlOptions: { position: google.maps.ControlPosition.RIGHT_BOTTOM }, panControlOptions: { position: google.maps.ControlPosition.RIGHT_BOTTOM }, enableCloseButton:true, imageDateControl:true, addressControlOptions:{ position: google.maps.ControlPosition.TOP_RIGHT } });
        }, 2000);

        //setTimeout(function() {
        //    SafemapPopupHelper.WhatsNewShowIfNeeded();
        //}, 3000);

        MenuHelper.Init(); // contains its own delayed loads; should be at end of initialize()
        _InjectSafariPerfFix();
        _ApplyFirefoxNoDragHack();
    };

    
    return SafemapInit;
})();






// ===============================================================================================
// ======================================= BASEMAP HELPER ========================================
// ===============================================================================================
//
// BasemapHelper: 1. Initializes an array of Google Maps ImageMapTypes
//                2. Adds them to the Gmaps registry
//                3. Defines how the tile URLs are returned
//
// nb: When adding new basemaps, they must be added to:
//  1. BasemapHelper.basemaps
//  2. BasemapHelper.InitBasemaps
//  3. MenuHelperStub.GetBasemapIdxsWithUiVisibility
//  4. GetMenuStringsEn(), GetMenuStringsJa()
//  5. The end of the current menu tooltip spritesheet (thus changing the filename)
//  6. MenuHelper.InitTooltips
//
var BasemapHelper = (function()
{
    function BasemapHelper()
    {
    }
    
    BasemapHelper.basemaps =
    [
        // 2016-11-19 ND: The Google refs create a race condition in Safari due to differences
        //                in when this object is eval'd.  Replacing with strings for now,
        //                eventually this should be moved to an instanced object and set
        //                at runtime.
        //google.maps.MapTypeId.ROADMAP, google.maps.MapTypeId.SATELLITE,
        //google.maps.MapTypeId.HYBRID, google.maps.MapTypeId.TERRAIN,
        "roadmap", "satellite",
        "hybrid", "terrain",
        "gray", "dark", "toner", "tlite", "wcolor",
        "mapnik", "black", "white", "stamen_terrain", 
        "gsi_jp", "retro"
    ];
    
    BasemapHelper.GetCurrentInstanceBasemapIdx = function()
    {
        var mapType = map.getMapTypeId();
        var idx = 0;
        
        for (var i=0; i<BasemapHelper.basemaps.length; i++)
        {
            if (mapType == BasemapHelper.basemaps[i])
            {
                idx = i;
                break;
            }
        }
        
        return idx;
    };


    BasemapHelper.GetMapTypeIdForBasemapIdx = function(idx)
    {
        if (idx < 0 || idx >= BasemapHelper.basemaps.length) idx = 0;
        return BasemapHelper.basemaps[idx];
    };
    
    
    var _GetUrlFromTemplate = function(template, x, y, z, r, s)
    {
        var url = "" + template;
        if (x != null) url = url.replace(/{x}/g, ""+x);
        if (y != null) url = url.replace(/{y}/g, ""+y);
        if (z != null) url = url.replace(/{z}/g, ""+z);
        if (r != null) url = url.replace(/{r}/g, ""+r);
        if (s != null) url = url.replace(/{s}/g, ""+s[(z + x + y) % s.length]);

        return url;
    };

    var _fxGetNormalizedCoord = function(xy, z) { return SafemapUtil.GetNormalizedCoord(xy, z); };

    var _GetGmapsMapStyled_Dark = function()
    {
        return [ {"stylers": [ { "invert_lightness": true }, { "saturation": -100 } ] },
                 { "featureType": "water", "stylers": [ { "lightness": -100 } ] },
                 { "elementType": "labels", "stylers": [ {  "lightness": -57  }, { "visibility": "on" } ] },
                 { "featureType": "administrative", "elementType": "geometry", "stylers": [ { "lightness": -57 } ] } ];
    };

    var _GetGmapsMapStyled_Gray = function()
    {
        return [ { "featureType": "water", "stylers": [ { "saturation": -100 }, { "lightness": -30  } ] },
                 { "stylers": [ { "saturation": -100 }, { "lightness": 50 } ] },
                 { "elementType": "labels.icon", "stylers": [ { "invert_lightness": true }, { "gamma": 9.99 }, { "lightness": 79 } ] } ];
    };
    
    var _GetGmapsMapStyled_Retro = function()
    {
        return [{"featureType":"administrative","stylers":[{"visibility":"off"}]},{"featureType":"poi","stylers":[{"visibility":"simplified"}]},{"featureType":"road","elementType":"labels","stylers":[{"visibility":"simplified"}]},{"featureType":"water","stylers":[{"visibility":"simplified"}]},{"featureType":"transit","stylers":[{"visibility":"simplified"}]},{"featureType":"landscape","stylers":[{"visibility":"simplified"}]},{"featureType":"road.highway","stylers":[{"visibility":"off"}]},{"featureType":"road.local","stylers":[{"visibility":"on"}]},{"featureType":"road.highway","elementType":"geometry","stylers":[{"visibility":"on"}]},{"featureType":"water","stylers":[{"color":"#84afa3"},{"lightness":52}]},{"stylers":[{"saturation":-17},{"gamma":0.36}]},{"featureType":"transit.line","elementType":"geometry","stylers":[{"color":"#3f518c"}]}];
    };

    var _NewGmapsBasemap = function(min_z, max_z, tile_size, url_template, name, r, subs)
    {
        var o =
        {
            getTileUrl: function(xy, z) 
                        { 
                            var nXY = _fxGetNormalizedCoord(xy, z);
                            return _GetUrlFromTemplate(url_template, nXY.x, nXY.y, z, r, subs);
                        },
              tileSize: new google.maps.Size(tile_size, tile_size),
               minZoom: min_z,
               maxZoom: max_z,
                  name: name,
                   alt: name
        };
    
        return new google.maps.ImageMapType(o);
    };


    var _NewGmapsBasemapConst = function(tile_size, alt, name, tile_url) // single tile for all requests
    {
        var o =
        {
            getTileUrl: function(xy, z) { return tile_url; },
              tileSize: new google.maps.Size(tile_size, tile_size),
               minZoom: 0,
               maxZoom: 23,
                  name: name,
                   alt: alt != null ? alt : name
        };
    
        return new google.maps.ImageMapType(o);
    };

    BasemapHelper.InitBasemaps = function()
    {
        var stam_r = window.devicePixelRatio > 1.5 ? "@2x" : "";
        var stam_z = window.devicePixelRatio > 1.5 ?    18 : 19;
        var stam_subs = ["a", "b", "c", "d"];
        var osm_subs  = ["a", "b", "c"];
        var stam_pre  = !_use_https ? "http://{s}.tile.stamen.com" : "https://stamen-tiles-{s}.a.ssl.fastly.net";
        var o = { };


        o.b0 = _NewGmapsBasemap(0, stam_z, 256, stam_pre + "/terrain/{z}/{x}/{y}{r}.png", "Stamen Terrain", stam_r, stam_subs);
        o.b1 = _NewGmapsBasemap(0, stam_z, 256, stam_pre + "/toner/{z}/{x}/{y}{r}.png", "Stamen Toner", stam_r, stam_subs);
        o.b2 = _NewGmapsBasemap(0, stam_z, 256, stam_pre + "/toner-lite/{z}/{x}/{y}{r}.png", "Stamen Toner Lite", stam_r, stam_subs);
        
        o.b3 = _NewGmapsBasemap(0, 19, 256, stam_pre + "/watercolor/{z}/{x}/{y}.jpg", "Stamen Watercolor", null, stam_subs);
        o.b4 = _NewGmapsBasemap(0, 19, 256, "https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", "OpenStreetMap", null, osm_subs);
        
        o.b9 = _NewGmapsBasemap(0, 18, 256, "https://cyberjapandata.gsi.go.jp/xyz/std/{z}/{x}/{y}.png", "GSI Japan", null, null);

        o.b5 = _NewGmapsBasemapConst(256, "Pure Black World Tendency", "None (Black)", "data:image/gif;base64,R0lGODdhAQABAPAAAAAAAAAAACwAAAAAAQABAAACAkQBADs=");
        o.b6 = _NewGmapsBasemapConst(256, "Pure White World Tendency", "None (White)", "data:image/gif;base64,R0lGODdhAQABAPAAAP///wAAACwAAAAAAQABAAACAkQBADs=");

        o.b7 = new google.maps.StyledMapType(_GetGmapsMapStyled_Gray(), {name: "Map (Gray)"});
        o.b8 = new google.maps.StyledMapType(_GetGmapsMapStyled_Dark(), {name: "Map (Dark)"});
        o.b10 = new google.maps.StyledMapType(_GetGmapsMapStyled_Retro(), {name: "Map (Retro)"});
        
        map.mapTypes.set( "stamen_terrain", o.b0);
        map.mapTypes.set( "toner", o.b1);
        map.mapTypes.set( "tlite", o.b2);
        map.mapTypes.set("wcolor", o.b3);
        map.mapTypes.set("mapnik", o.b4);
        map.mapTypes.set( "black", o.b5);
        map.mapTypes.set( "white", o.b6);
        map.mapTypes.set(  "gray", o.b7);
        map.mapTypes.set(  "dark", o.b8);
        map.mapTypes.set("gsi_jp", o.b9);
        map.mapTypes.set( "retro", o.b10);
        
        basemapMapTypes = o;
    };
    
    return BasemapHelper;
})();








// ===============================================================================================
// ===================================== SAFECAST DATE HELPER ====================================
// ===============================================================================================
//
// SafecastDateHelper: Misc date conversion/helper functions, especially pertaining to the
//                     time series Safecast layers, which are defined here.
//
// nb: eventually, SafecastDateHelper, ClientZoomHelper, and LayersHelper
//     should be combined into a single instanced class.
var SafecastDateHelper = (function()
{
    function SafecastDateHelper()
    {
    }
    
    var _JST_OFFSET_MS = 32400000.0; // 9 * 60 * 60 * 1000
    
    // For a date 2011-03-10T15:00:00Z, returns 20110310, or YY+MM+DD
    var _TrimIsoDateToFilenamePart = function(d)
    {
        return d.substring(0, 4) + d.substring(5, 7) + d.substring(8, 10);
    };
    
    var _GetShortIsoDate = function(d)
    {
        return d.substring(0, 10);
    };
    
    SafecastDateHelper.GetTimeSliceLayerDateRangesUTC = function()
    {
        // Format: ISO dates.  Start date is inclusive, end date is exclusive
        //     eg: end date "15:00:00Z" means < 15:00:00Z, or <= 14:59:59.999Z

        // nb: The base format is not used directly, but necessary for all others.
        //     Thus, a new mutable copy is returned.

        var ds = [ { i:13, s:"2011-03-10T15:00:00Z", e:"2011-09-10T15:00:00Z" }, 
                   { i:14, s:"2011-09-10T15:00:00Z", e:"2012-03-10T15:00:00Z" }, 
                   { i:15, s:"2012-03-10T15:00:00Z", e:"2012-09-10T15:00:00Z" }, 
                   { i:16, s:"2012-09-10T15:00:00Z", e:"2013-03-10T15:00:00Z" }, 
                   { i:17, s:"2013-03-10T15:00:00Z", e:"2013-09-10T15:00:00Z" }, 
                   { i:18, s:"2013-09-10T15:00:00Z", e:"2014-03-10T15:00:00Z" }, 
                   { i:19, s:"2014-03-10T15:00:00Z", e:"2014-09-10T15:00:00Z" }, 
                   { i:20, s:"2014-09-10T15:00:00Z", e:"2015-03-10T15:00:00Z" }, 
                   { i:21, s:"2015-03-10T15:00:00Z", e:"2015-09-10T15:00:00Z" }, 
                   { i:22, s:"2015-09-10T15:00:00Z", e:"2016-03-10T15:00:00Z" } ];
                   //{ i:23, s:"2016-03-10T15:00:00Z", e:"2016-09-10T15:00:00Z" },    // not implemeneted
                   //{ i:24, s:"2016-09-10T15:00:00Z", e:"2017-03-10T15:00:00Z" },    // not implemeneted
                   //{ i:25, s:"2017-03-10T15:00:00Z", e:"2017-09-10T15:00:00Z" },    // not implemeneted
                   //{ i:26, s:"2017-09-10T15:00:00Z", e:"2018-03-10T15:00:00Z" },    // not implemeneted
                   //{ i:27, s:"2018-03-10T15:00:00Z", e:"2018-09-10T15:00:00Z" },    // not implemeneted
                   //{ i:28, s:"2018-09-10T15:00:00Z", e:"2019-03-10T15:00:00Z" },    // not implemeneted
                   //{ i:29, s:"2019-03-10T15:00:00Z", e:"2019-09-10T15:00:00Z" },    // not implemeneted
                   //{ i:30, s:"2019-09-10T15:00:00Z", e:"2020-03-10T15:00:00Z" } ];  // not implemeneted

        return ds;
    };
    
    SafecastDateHelper.IsLayerIdxTimeSliceLayerDateRangeIdx = function(idx)
    {
        var src   = SafecastDateHelper.GetTimeSliceLayerDateRangesUTC();
        var is_ts = false;

        for (var i=0; i<src.length; i++)
        {
            if (src[i].i == idx)
            {
                is_ts = true;
                break;
            }//if
        }//for

        return is_ts;
    };
    
    var _GetIsoDateForIsoDateAndTimeIntervalMs = function(d, ti)
    {
        var d0 = new Date(d);
        var t0 = d0.getTime() + ti;
        d0.setTime(t0);
        return d0.toISOString();
    };
    
    var _GetTimeSliceLayerDateRangeForIdxUTC = function(idx)
    {
        var ds = SafecastDateHelper.GetTimeSliceLayerDateRangesUTC();
        var d  = null;

        for (var i=0; i<ds.length; i++)
        {
            if (ds[i].i == idx)
            {
                d = ds[i];
                break;
            }//if
        }//for

        if (d == null)
        {
            d = { i:0, s:"1970-01-01T00:00:00Z", e:"1970-01-01T00:00:00Z" };
        }//if

        return d;
    };
    
    // By default the dates are exclusive of the end date as noted.
    // This subtracts one second from the end dates to make them work with
    // a BETWEEN query.
    SafecastDateHelper.GetTimeSliceLayerDateRangeInclusiveForIdxUTC = function(idx)
    {
        var d  = _GetTimeSliceLayerDateRangeForIdxUTC(idx);

        d.e = _GetIsoDateForIsoDateAndTimeIntervalMs(d.e, -1000.0);

        return d;
    };
    
    // Converts { s:"2011-03-10T15:00:00Z", e:"2011-09-10T15:00:00Z" } 
    //   to "2011031020110910" for consistent filename references.
    SafecastDateHelper.GetTimeSliceDateRangesFilenames = function()
    {
        var src  = SafecastDateHelper.GetTimeSliceLayerDateRangesUTC();
        var dest = new Array();

        for (var i=0; i<src.length; i++)
        {
            var d0 = _TrimIsoDateToFilenamePart(src[i].s);
            var d1 = _TrimIsoDateToFilenamePart(src[i].e);
            
            dest.push( { i:src[i].i, d:(d0 + d1) } );
        }//for

        return dest;
    };
    
    // Converts ISO date string into JST-offset date with the end date
    // having 1 second subtracted, then truncates them into "YYYY-MM-DD"

    SafecastDateHelper.GetTimeSliceDateRangeLabelsForIdxJST = function(idx)
    {
        var d = SafecastDateHelper.GetTimeSliceLayerDateRangeInclusiveForIdxUTC(idx);

        d.s = _GetIsoDateForIsoDateAndTimeIntervalMs(d.s, _JST_OFFSET_MS);
        d.e = _GetIsoDateForIsoDateAndTimeIntervalMs(d.e, _JST_OFFSET_MS);
        d.s = _GetShortIsoDate(d.s);
        d.e = _GetShortIsoDate(d.e);

        return d;
    };
    
    return SafecastDateHelper;
})();








// ===============================================================================================
// ===================================== CLIENT ZOOM HELPER ======================================
// ===============================================================================================
//
// ClientZoomHelper: The actual interface to return raster layer tile URLs to Google Maps, this
//                   also does some tricks to scale layers on the client past their maximum zoom
//                   level.
//
// The Google Maps API accepts tiles of any size.  To facilitate client zoom, the following is done:
//
// 1. Is the zoom level past the layer's max?
// 2. If no: function normally.
// 3. If yes:
//  1. Remove the layer from the map.
//  2. Change the tile size to: NORMAL_SIZE << (CURRENT_ZOOM_LEVEL - LAYER_MAX_ZOOM_LEVEL)
//  3. Add the layer back to the map.
//  4. When constructing the URL for a tile added in this manner, make sure to set the zoom level
//     to the layer's max.
//
// Example: Normally, this is how things work for a Web Mercator tile system:
//
//              World Width or Height
// Zoom Level |   Tiles   |  Pixels   | Tile Size, px |
// -----------|-----------|-----------|---------------|
//          0 |         1 |       256 |           256 |
//          1 |         2 |       512 |           256 |
//          2 |         4 |      1024 |           256 |
//          3 |         8 |      2048 |           256 |
//          4 |        16 |      4096 |           256 |
// ... etc ...
//
// So, for a tile set with a maximum zoom level of 2, the following could be reported to Google Maps:
//
//              World Width or Height
// Zoom Level |   Tiles   |  Pixels   | Tile Size, px |
// -----------|-----------|-----------|---------------|
//          0 |         1 |       256 |           256 |
//          1 |         2 |       512 |           256 |
//    (MAX) 2 |         4 |      1024 |           256 |
//          3 |         4 |      2048 |           512 |
//          4 |         4 |      4096 |          1024 |
//
// In the Google Maps API, all tiles are HTML <img> elements wrapped in <divs>.  So regardless of
// the tile's actual size, it is scaled by the browser to the indicated size.
//
// This is of course, quite lucrative.  The native resolution for Safecast tiles is zoom level 13.
// Everything at a higher zoom level is an interpolation of that.
//
// Potentially, it is a tremendous logistical advantage to scale tiles on the client past zoom 
// level 13 rather than the server.  However, in practice it is somewhat more problematic; the
// scaling of the final RGBA output image is inferior for a number of reasons, and worse still,
// can cause crashing on relatively common iOS devices with 1GB of RAM.
//
// Thus, as partial workarounds, some scaling is still performed by the server, and CSS styles to
// force nearest neighbor scaling for the tiles on the client are used.
//
// Things that could be done to improve this in the future:
// 1. Eventually, drop support for 1GB RAM devices.
// 2. Do not discretize the LUT on the server; use full-color RGBA tiles.  Smooth RGB contours
//    scale better with bilinear/bicubic than a limited color palette.
// 3. For "points"-style tiles, do not render the shadow effect on the server.  Instead, use
//    CSS styles.  Unfortunately, this is problematic; it requires a top-tier GPU (as of 2016)
//    to not be janky, and uses a lot of additional energy to do so.  Further, recent changes to
//    Gmaps squash all layers for a tile x/y/z within a single <div>, meaning a CSS solution
//    now produces lots of artifacts.
// 4. Instead of PNGs, load the raw floating point data from the server as the native apps do,
//    and render the tile locally.  Unfortunately, the last time this was attempted, it was
//    quite slow.
//
var ClientZoomHelper = (function()
{
    function ClientZoomHelper() 
    {
    }

    var _fxGetNormalizedCoord  = function(xy, z)   { return SafemapUtil.GetNormalizedCoord(xy, z); }; // static
    var _fxShouldLoadTile      = function(l,x,y,z) { return _bitsProxy.ShouldLoadTile(l, x, y, z); };
    var _fxGetIsRetina         = function()        { return SafemapUI.GetIsRetina(); };
    var _fxGetSelectedLayerIdx = function()        { return LayersHelper.GetSelectedIdx(); };
    var _fxClearMapLayers      = function()        { map.overlayMapTypes.clear(); };
    var _fxSyncMapLayers       = function()        { LayersHelper.SyncSelectedWithMap(); };
    var _fxGetLayers           = function()        { return overlayMaps; };
    var _fxSetLayers           = function(o)       { overlayMaps = o; };
    var _fxGetTimeSliceDates   = function()        { return SafecastDateHelper.GetTimeSliceDateRangesFilenames(); }
    var _fxGetUseJpRegion      = function()        { return _use_jp_region; };
    var _fxGetUseHttps         = function()        { return _use_https; };
    
    var _GetUrlForTile512 = function(xy, z, layerId, normal_max_z, base_url, idx)
    {
        z = _GetClampedZoomLevelForIdx(idx, z);

        if (!_fxGetIsRetina() && z > 0 && z <= normal_max_z) z -= 1;

        var nXY = _fxGetNormalizedCoord(xy, z);

        if (!nXY || !_fxShouldLoadTile(layerId, nXY.x, nXY.y, z))
        {
            return null;
        }//if

        return _GetUrlFromTemplate(base_url, nXY.x, nXY.y, z);
    };
    
    
    
    var _GetUrlForTile256 = function(xy, z, layerId, normal_max_z, base_url, idx)
    {
        z       = _GetClampedZoomLevelForIdx(idx, z);
        var nXY = _fxGetNormalizedCoord(xy, z);
    
        if (!nXY || !_fxShouldLoadTile(layerId, nXY.x, nXY.y, z))
        {
            return null;
        }//if

        return _GetUrlFromTemplate(base_url, nXY.x, nXY.y, z);
    };
    
    
    
    ClientZoomHelper.SynchronizeLayersToZoomLevel = function(z)
    {
        var o       = _fxGetLayers();
        if (o == null) return;
        
        var hdpi    = _fxGetIsRetina();
        var cleared = false;        
        var idx     = _fxGetSelectedLayerIdx();
        var i, lz, lr, sz;
    
        for (i=0; i<o.length; i++)
        {
            if ((i == idx || (idx == 0 && i == 2)) && o[i] != null)
            {
                lz = o[i].ext_tile_size > 256 && !hdpi ? z - 1 : z;
                lr = o[i].ext_tile_size > 256 &&  hdpi ? 1     : 0;  // px>>=1 for 512x512 tiles on     retina displays only
                sz = -1;
        
                if (o[i].ext_actual_max_z < lz)
                {
                    sz = o[i].ext_tile_size << (lz - o[i].ext_actual_max_z);
                }//if
                else if (o[i].ext_actual_max_z     >= lz 
                      && o[i].ext_tile_size >>> lr != o[i].tileSize.width)
                {
                    sz = o[i].ext_tile_size;
                }//else if
                
                if (sz != -1)
                {
                    if (hdpi) sz >>>= lr; // rescale to retina display
                
                    if (!cleared) 
                    { 
                        _fxClearMapLayers(); // must be cleared before the first size is set
                        cleared = true; 
                    }//if
                    
                    o[i].tileSize = new google.maps.Size(sz, sz);
                }//if
            }//if        
        }//for

        if (cleared) _fxSyncMapLayers(); // must re-add to map to finally take effect
    };



    var _GetClampedZoomLevelForIdx = function(idx, z)
    {
        var o  = _fxGetLayers();
        
        var mz = o[idx].ext_actual_max_z + (o[idx].ext_tile_size > 256 && !_fxGetIsRetina() ? 1 : 0);
        var dz = o == null || z <= mz ? z : mz;        
        
        return dz;
    };
    
    
    
    // layerId is for bitstores. a proxy layerId should be used for similar secondary layers to reduce memory use.
    var _InitGmapsLayers_Create = function(idx, layerId, is_layer_id_proxy, maxz, alpha, tile_size, url)
    {
        var o = { opacity:alpha, 
             ext_layer_id:layerId, 
         ext_url_template:url,
         ext_actual_max_z:(tile_size == 512 ? maxz-1 : maxz),
            ext_tile_size:tile_size,
                  ext_idx:idx,
    ext_is_layer_id_proxy:is_layer_id_proxy };
    
        if (tile_size == 512)
        {
            o.getTileUrl = function (xy, z) { return _GetUrlForTile512(xy, z, layerId, maxz, url, idx); };
            o.tileSize   = new google.maps.Size(512, 512);
        }//if
        else
        {
            o.getTileUrl = function (xy, z) { return _GetUrlForTile256(xy, z, layerId, maxz, url, idx); };
            o.tileSize   = new google.maps.Size(256, 256);
        }//else
    
        return o;
    };
    
    var _GetUrlFromTemplate = function(template, x, y, z)
    {
        var url = "" + template;
            url = url.replace(/{x}/g, ""+x);
            url = url.replace(/{y}/g, ""+y);
            url = url.replace(/{z}/g, ""+z);
            
        return url;
    };
    

    // ==========================
    // _GetUrlTemplateForS3Bucket
    // ==========================
    //
    // _GetUrlTemplateForS3Bucket assumes all S3 buckets have the following naming convention:
    //
    // |-------------------|-----------------------------|
    // | S3 Region         | Bucket Name                 |
    // |-------------------|-----------------------------|
    // | us-east-1         | {LAYER_NAME}.safecast.org   |
    // | s3-ap-northeast-1 | {LAYER_NAME}jp.safecast.org |
    // |-------------------|-----------------------------|
    //
    // Further, each bucket should use the OSM path convention, eg: /{z}/{x}/{y}.png
    //
    // From this convention, the following URLs are constructed:
    //
    // |----------|-------------------|-----------------------------------------------------------------------------|
    // | Protocol | S3 Region         | URL Template                                                                |
    // |----------|-------------------|-----------------------------------------------------------------------------|
    // | http://  | us-east-1         | {LAYER_NAME}.safecast.org.s3.amazonaws.com/{z}/{x}/{y}.png                  |
    // | http://  | s3-ap-northeast-1 | {LAYER_NAME}jp.s3-ap-northeast-1.amazonaws.com/{z}/{x}/{y}.png              |
    // | https:// | us-east-1         | s3.amazonaws.com/{LAYER_NAME}.safecast.org/{z}/{x}/{y}.png                  |
    // | https:// | s3-ap-northeast-1 | s3-ap-northeast-1.amazonaws.com/{LAYER_NAME}jp.safecast.org/{z}/{x}/{y}.png |
    // |----------|-------------------|-----------------------------------------------------------------------------|
    //
    // Note: Once Amazon supports HTTP/2 for S3, all URLs should become HTTPS-only.
    //       However, as of 2016-12-21, S3 is still using HTTP/1.1 with no ETA for HTTP/2.
    // 
    var _GetUrlTemplateForS3Bucket = function(isJ, isS, us_bucket_prefix)
    {
        var pre    = isS ? "https://" : "http://";
        var bucket = us_bucket_prefix + (isJ ? "jp" : "") + ".safecast.org";
        var sub    = !isS ? bucket + "." : "";
        var domain = isJ ? "s3-ap-northeast-1.amazonaws.com"
                   :       "s3.amazonaws.com";
        var path   = isS ? "/" + bucket : "";
        var url    = pre + sub + domain + path + "/{z}/{x}/{y}.png";

        return url;
    };

    var _InitGmapsLayers_CreateAll = function()
    {
        var x        = new Array();
        var isJ      = _fxGetUseJpRegion();
        var isS      = _fxGetUseHttps();        
        var te512url = _GetUrlTemplateForS3Bucket(isJ, isS, "te512");
        var tg512url = _GetUrlTemplateForS3Bucket(isJ, isS, "tg512");
        var nnsa_url = _GetUrlTemplateForS3Bucket(isJ, isS, "nnsa");
        var nure_url = _GetUrlTemplateForS3Bucket(isJ, isS, "nure");
        var au_url   = _GetUrlTemplateForS3Bucket(isJ, isS, "au");
        var aist_url = _GetUrlTemplateForS3Bucket(isJ, isS, "aist");
        var te13_url = _GetUrlTemplateForS3Bucket(isJ, isS, "te20130415");
        var te14_url = _GetUrlTemplateForS3Bucket(isJ, isS, "te20140311");
        var ts       = _fxGetTimeSliceDates();

        x.push( _InitGmapsLayers_Create( 0, 2,  false, 17, 1.0, 512, te512url) );
        x.push( _InitGmapsLayers_Create( 1, 2,  false, 17, 1.0, 512, te512url) );
        x.push( _InitGmapsLayers_Create( 2, 8,  false, 15, 0.5, 512, tg512url) );

        x.push( _InitGmapsLayers_Create( 3, 3,  false, 16, 1.0, 512, nnsa_url) );
        x.push( _InitGmapsLayers_Create( 4, 6,  false, 12, 0.7, 512, nure_url) );
        x.push( _InitGmapsLayers_Create( 5, 16, false, 12, 0.7, 512, au_url) );
        x.push( _InitGmapsLayers_Create( 6, 9,  false, 12, 0.7, 512, aist_url) );
        x.push( _InitGmapsLayers_Create( 7, 9,  true,  15, 1.0, 256, "http://safecast.media.mit.edu/tilemap/TestIDW/{z}/{x}/{y}.png") );
        x.push( _InitGmapsLayers_Create( 8, 2,  true,  17, 1.0, 512, te13_url) );
        x.push( _InitGmapsLayers_Create( 9, 2,  true,  17, 1.0, 512, te14_url) );

        //   idx | Description
        // ------|-------------------
        //    10 | Add bGeigie Log...
        //    11 | None (no layer)
        //    12 | Time Slice Slider UI Toggle
        //    13 | Time Slice: 2011-03-10 - 2011-09-10
        //    14 | Time Slice: 2011-09-10 - 2012-03-10
        //    15 | Time Slice: 2012-03-10 - 2012-09-10
        //    16 | Time Slice: 2012-09-10 - 2013-03-10
        //    17 | Time Slice: 2013-03-10 - 2013-09-10
        //    18 | Time Slice: 2013-09-10 - 2014-03-10
        //    19 | Time Slice: 2014-03-10 - 2014-09-10
        //    20 | Time Slice: 2014-09-10 - 2015-03-10
        //    21 | Time Slice: 2015-03-10 - 2015-09-10
        //    22 | Time Slice: 2015-09-10 - 2016-03-10
        //    23 | Time Slice: 2016-03-10 - 2016-09-10  // not implemented
        // ...
        //    30 | Time Slice: 2019-09-10 - 2020-03-10  // not implemented

        // 10001 | Add Cosmic Logs
        // 10002 | Add Surface Logs

        x.push(null); // 10 (Add bGeigie Log...)
        x.push(null); // 11 (None (No Layer))
        x.push(null); // 12 (Time Slice Slider UI Toggle)

        for (var i=0; i<ts.length; i++)
        {
            var u = _GetUrlTemplateForS3Bucket(isJ, isS, "te" + ts[i].d);
            x.push( _InitGmapsLayers_Create(ts[i].i, 2, true, 17, 1.0, 512, u) );
        }//for

        return x;
    };
    
    ClientZoomHelper.GetLayerForIdx = function(idx, layers)
    {
        var layer = null;

        if (layers != null)
        {
            for (var i=0; i<layers.length; i++)
            {
                if (layers[i] != null && layers[i].ext_idx == idx)
                {
                    layer = layers[i];
                    break;
                }//if
            }//for
        }//if
            
        return layer;
    };    
    
    ClientZoomHelper.InitGmapsLayers = function()
    {
        var o = _fxGetLayers();
        
        if (o == null)
        {
            o = _InitGmapsLayers_CreateAll();
            _fxSetLayers(o);
        }//if
    };
    
    return ClientZoomHelper;
})();














var SafemapExtent = (function()
{
    function SafemapExtent() 
    {
    }


    SafemapExtent.InitEvents = function()
    {
        if (SafemapUI.IsBrowserOldIE()) return;

        var events = [ "dragend", "zoom_changed", "maptypeid_changed" ];
        var cb0 = function(e) { SafemapExtent.OnChange(SafemapExtent.Event.DragEnd);     };        
        var cb1 = function(e) { SafemapExtent.OnChange(SafemapExtent.Event.ZoomChanged); };
        var cb2 = function(e) 
        { 
            SafemapExtent.OnChange(SafemapExtent.Event.MapTypeIdChanged);
            var idx = BasemapHelper.GetCurrentInstanceBasemapIdx();
            PrefHelper.SetBasemapUiIndexPref(idx); 
        };
        var cbs = [ cb0, cb1, cb2 ];

        for (var i=0; i<events.length; i++)
        {
            google.maps.event.addListener(map, events[i], cbs[i]);
        }//for
    };


    SafemapExtent.OnChange = function(eventId)
    {
        var q = _cached_ext;
    
        var initLoad = q.mt == null;
    
        // if just panning, use a cooldown to prevent too frequent of updates.
        if (!initLoad && eventId == SafemapExtent.Event.DragEnd)
        {
            if (q.cd) { return; }

            _SetUpdatePanCooldown();
            return;
        }//if

        var updateBasemap = initLoad || eventId == SafemapExtent.Event.MapTypeIdChanged;
        var updateLatLon  = initLoad || eventId  < 2 || eventId == SafemapExtent.Event.CooldownEnd;
        var updateZ       = initLoad || eventId == SafemapExtent.Event.ZoomChanged;
        var updateLayers  = initLoad || eventId == SafemapExtent.Event.LayersChanged;
        var c             = null;
    
        if (updateLayers)
        {
            q.lidx = LayersHelper.GetSelectedIdx();
        }//if

        if (q.midx == -1) q.midx = BasemapHelper.GetCurrentInstanceBasemapIdx();

        if (updateBasemap) // either init load, or basemap was changed
        {
            q.midx = BasemapHelper.GetCurrentInstanceBasemapIdx();
            q.mt   = BasemapHelper.GetMapTypeIdForBasemapIdx(q.midx);
            _disable_alpha = q.midx == 10 || q.midx == 11; // pure black / white
    
            // sync the raster tile overlay alpha with the determination made above
                 if ( _disable_alpha && overlayMaps[4].opacity != 1.0) LayersHelper.SetAlphaDisabled(true);
            else if (!_disable_alpha && overlayMaps[4].opacity == 1.0) LayersHelper.SetAlphaDisabled(false);
        
            if (!initLoad && map.overlayMapTypes.getLength() > 0) LayersHelper.SyncSelectedWithMap(); // reload overlay if basemap changes
        }//if
    
    
        if (updateZ || updateLayers || updateBasemap) // zoom_changed
        {
            c = SafemapUtil.GetMapInstanceYXZ();
            ClientZoomHelper.SynchronizeLayersToZoomLevel(c.z);
        }//if
    
    
        // *** HACK *** For pure black/white tiles (eg, no base "map"), there is an exception
        //              to setting the alpha of certain layers.
        //
        //              For the interpolated layer (id=2), the alpha should be set to 0.5 if 
        //              viewing a combination of the data and interpolated layers. (id=0)
        //
        //              Unfortunately, the layer constructor will not accept a lambda function
        //              for this, or any pointer equivalent, and thus must be set directly.
        //
        if (updateBasemap || updateLayers) // not sure if right
        {
            if (q.lidx == 0 && overlayMaps[2].opacity == 1.0)
            {
                overlayMaps[2].opacity = 0.5;
                LayersHelper.SyncSelectedWithMap();
            }//if
            else if (q.lidx == 2 && _disable_alpha && overlayMaps[2].opacity != 1.0)
            {
                overlayMaps[2].opacity = 1.0;
                LayersHelper.SyncSelectedWithMap();
            }//if
        }//if
        
        if (updateLatLon || updateZ)
        {
            if (c == null) c = SafemapUtil.GetMapInstanceYXZ();
            q.urlyxz = q.baseurl + ("?y=" + c.y) + ("&x=" + c.x) + ("&z=" + c.z);
        }//if
    
        var url = _GetMapQueryStringUrl(true); // 2015-03-30 ND: false -> true so all logids are present, must test performance

        if (!initLoad) _DispatchHistoryPushState(url);
        //history.pushState(null, null, url);
    };


    var _DispatchHistoryPushState = function(url)
    {
        var ms = Date.now();
        _last_history_push_ms = ms;
    
        setTimeout(function() 
        {
            if (ms == _last_history_push_ms)
            {
                history.pushState(null, null, url);
                var c = SafemapUtil.GetNormalizedMapCentroid();
                PrefHelper.SetVisibleExtentXPref(c.x);
                PrefHelper.SetVisibleExtentYPref(c.y);
                PrefHelper.SetVisibleExtentZPref(map.getZoom());
            }//if
        }.bind(this), _system_os_ios ? 1000 : 250);
    };


    var _SetUpdatePanCooldown = function()
    {
        var q  = _cached_ext;
        q.cd   = true;
        q.cd_y = map.getCenter().lat();
        q.cd_x = map.getCenter().lng();
        q.cd_z = map.getZoom();

        var end_cooldown = function()
        {
            q.cd = false;

            if (   q.cd_y == map.getCenter().lat()
                && q.cd_x == map.getCenter().lng() // no more updates?
                && q.cd_z == map.getZoom())
            {
                SafemapExtent.OnChange(SafemapExtent.Event.CooldownEnd);
            }//if
            else if (q.cd_z == map.getZoom()) // abort if z changed, will force ll refresh anyway.
            {
                _SetUpdatePanCooldown();
            }//else
        }.bind(this);

        setTimeout(end_cooldown, 250);
    };


    var _GetMapQueryStringUrl = function(isFull)
    {
        var logs = _bvProxy._bvm == null ? null 
                 : isFull ? _bvProxy.GetAllLogIdsEncoded() 
                 : _bvProxy.GetLogIdsEncoded();
        var q    = _cached_ext;
        var url  = q.urlyxz;

        // 2016-11-21 ND: Fix for issue with user prefs where the default layer
        //                could not be specified to users who had changed their
        //                default.
        url += "&l=" + q.lidx;
        url += "&m=" + q.midx;

        //if (q.lidx > 0)        url += "&l=" + q.lidx;
        //if (q.midx > 0)        url += "&m=" + q.midx;
        if (logs != null && logs.length > 0) url += "&logids=" + logs;

        return url;
    };


    //  -1: ???
    //   0: dragend event
    //   1: zoom_changed event
    //   2: maptypeid_changed event (update midx)
    // 100: layers were changed by user. (update lidx)
    // 200: remove logs was clicked. (update logids)
    // 300: cooldown end
    SafemapExtent.Event =
    {
                 DragEnd: 0,
             ZoomChanged: 1,
        MapTypeIdChanged: 2,
           LayersChanged: 100,
         RemoveLogsClick: 200,
             CooldownEnd: 300
    };


    return SafemapExtent;
})();














// ===============================================================================================
// ======================================== LAYERS HELPER ========================================
// ===============================================================================================
//
// LayersHelper: Misc functions for managing raster layers, including a few "virtual" raster layers
//               that invoke other functionality.
//
var LayersHelper = (function()
{
    function LayersHelper() 
    {
    }

    var _SetLastLayerIdx  = function(idx) { _lastLayerIdx = idx;  };
    var _GetLastLayerIdx  = function()    { return _lastLayerIdx; };
    var _GetRenderTest    = function()    { return _test_client_render; };
    var _GmapsSetAt       = function(i,o) { map.overlayMapTypes.setAt(i, o); };
    var _GmapsNewLayer    = function(o)   { return new google.maps.ImageMapType(o); };
    var _GmapsClearLayers = function()    { map.overlayMapTypes.clear(); };
    var _GetOverlayMaps   = function()    { return overlayMaps; };
    var _HudSetLayers     = function(ar)  { _hudProxy.SetLayers(ar); };
    var _HudUpdate        = function()    { _hudProxy.Update(); };
    var _SetTsPanelHidden = function(h)   { TimeSliceUI.SetPanelHidden(h); };
    LayersHelper.ShowAddLogPanel  = function()    { _bvProxy.ShowAddLogsPanel(); };
    LayersHelper.AddLogsCosmic    = function()    { _bvProxy.AddLogsCSV("cosmic", true); };
    var _AddLogsSurface   = function()    { _bvProxy.AddLogsCSV("surface", true); };
    var _InitBitsLegacy   = function()    { _bitsProxy.LegacyInitForSelection(); };
    var _MapExtentChanged = function(i)   { SafemapExtent.OnChange(i); };
    var _FlyToExtentByIdx = function(idx) { _flyToExtentProxy.GoToPresetLocationIdIfNeeded(idx); };
    var _GetTsSliderIdx   = function()    { return TimeSliceUI.GetSliderIdx();    };
    var _SetTsSliderIdx   = function(idx) { return TimeSliceUI.SetSliderIdx(idx); };
    var _GetIsLayerIdxTS  = function(idx) { return SafecastDateHelper.IsLayerIdxTimeSliceLayerDateRangeIdx(idx) };
    var _GetUiLayerIdx    = function()    { return _ui_layer_idx; };
    var _SetUiLayerIdx    = function(idx) { _ui_layer_idx = idx;  };
    var _SetMenuIdxPref   = function(idx) { PrefHelper.SetLayerUiIndexPref(idx); };
    var _MenuGetListId    = function()    { return "ul_menu_layers"; };
    var _MenuClearSelect  = function(u)   { MenuHelper.OptionsClearSelection(u);  };
    var _MenuSetSelect    = function(u,i) { MenuHelper.OptionsSetSelection(u, i); };

    LayersHelper.LAYER_IDX_ADD_LOG         = 10;
    LayersHelper.LAYER_IDX_NULL            = 11;
    LayersHelper.LAYER_IDX_TS_UI_PROXY     = 12;
    LayersHelper.LAYER_IDX_ADD_LOG_COSMIC  = 10001;
    LayersHelper.LAYER_IDX_ADD_LOG_SURFACE = 10002;

    LayersHelper.IsIdxNull = function(idx)
    {
        return idx == LayersHelper.LAYER_IDX_NULL;
    };

    LayersHelper.IsIdxAddLogOrPreset = function(idx)
    {
        return idx == LayersHelper.LAYER_IDX_ADD_LOG
            || idx == LayersHelper.LAYER_IDX_ADD_LOG_COSMIC
            || idx == LayersHelper.LAYER_IDX_ADD_LOG_SURFACE;
    };

    LayersHelper.IsIdxAddLogCosmic = function(idx)
    {
        return idx == LayersHelper.LAYER_IDX_ADD_LOG_COSMIC;
    };

    LayersHelper.IsIdxAddLogSurface = function(idx)
    {
        return idx == LayersHelper.LAYER_IDX_ADD_LOG_SURFACE;
    };

    LayersHelper.IsIdxAddLog = function(idx)
    {
        return idx == LayersHelper.LAYER_IDX_ADD_LOG;
    };

    LayersHelper.IsIdxTimeSliceUiProxy = function(idx)
    {
        return idx == LayersHelper.LAYER_IDX_TS_UI_PROXY;
    };

    LayersHelper.IsIdxTimeSlice = function (idx)
    {
        return _GetIsLayerIdxTS(idx);
    };

    LayersHelper.GetSelectedDdlIdx = function()
    {
        return _GetUiLayerIdx();
    };

    LayersHelper.GetSelectedIdx = function()
    {
        var idx = LayersHelper.GetSelectedDdlIdx();
        
        if (LayersHelper.IsIdxTimeSliceUiProxy(idx))
        {
            idx = _GetTsSliderIdx();
        }//if
        
        return idx;
    };

    LayersHelper.SetSelectedIdx = function(idx)
    {
        if (LayersHelper.IsIdxTimeSlice(idx))
        {
            var ddl_idx = LayersHelper.GetSelectedDdlIdx();
            
            if (!LayersHelper.IsIdxTimeSliceUiProxy(ddl_idx))
            {
                _SetTsSliderIdx(idx);
            
                idx = LayersHelper.LAYER_IDX_TS_UI_PROXY;
            }//if
            else
            {
                _SetMenuIdxPref(LayersHelper.GetSelectedIdx());
                return;
            }//else
        }//if

        if (idx != null)
        {
            _SetUiLayerIdx(idx);
            // 2016-11-21 ND: Don't store idx as a pref, it is wrong for the TS layers.            
            _SetMenuIdxPref(LayersHelper.GetSelectedIdx());
            _MenuClearSelect(_MenuGetListId());
            _MenuSetSelect(_MenuGetListId(), idx);
        }//if
    };

    LayersHelper.SetSelectedIdxAndSync = function(idx)
    {
        LayersHelper.SetSelectedIdx(idx);
        LayersHelper.SyncSelectedWithMap();
    };

    LayersHelper.SyncSelectedWithMap = function()
    {
        var idx = LayersHelper.GetSelectedIdx();
        LayersHelper.ClearAndAddToMapByIdx(idx);
    };

    LayersHelper.ClearAndAddToMapByIdx = function(idx)
    {
        LayersHelper.RemoveAllFromMap();

        if (!LayersHelper.IsIdxNull(idx))
        {
            if (idx == 0 && !_GetRenderTest()) 
            {
                LayersHelper.AddToMapByIdxs([2, 0]); // standard hack for points + interpolation default layer
            }//if
            else 
            {
                LayersHelper.AddToMapByIdx(idx);
            }//else
        }//if

        _SetLastLayerIdx(idx);
    };

    LayersHelper.AddToMapByIdx = function(idx)
    {
        LayersHelper.AddToMapByIdxs([idx]);
    };

    LayersHelper.AddToMapByIdxs = function(idxs)
    {
        var hud_layers = new Array();
        var omaps      = _GetOverlayMaps();

        for (var i=0; i<idxs.length; i++)
        {
            var gmaps_layer = _GmapsNewLayer(omaps[idxs[i]]);

            _GmapsSetAt(i, gmaps_layer);

            hud_layers.push({     urlTemplate: omaps[idxs[i]].ext_url_template, 
                              bitstoreLayerId: omaps[idxs[i]].ext_layer_id });
        }//for

        _HudSetLayers(hud_layers);
    };
    
    LayersHelper.RemoveAllFromMap = function()
    {
        _GmapsClearLayers();
        _HudSetLayers(new Array());
    };
    
    LayersHelper.SetAlphaDisabled = function(isDisabled)
    {
        overlayMaps[1].opacity = isDisabled ? 1.0 : 0.5;
        overlayMaps[2].opacity = isDisabled ? 1.0 : 0.5;
        overlayMaps[4].opacity = isDisabled ? 1.0 : 0.7;
        overlayMaps[5].opacity = isDisabled ? 1.0 : 0.7;
        overlayMaps[6].opacity = isDisabled ? 1.0 : 0.7;
    };

    LayersHelper.UiLayers_OnChange = function()
    {
        var  newIdx = LayersHelper.GetSelectedIdx();
        var lastIdx = _GetLastLayerIdx();
        var  isDone = false;

        if (newIdx == lastIdx) return;

        if (LayersHelper.IsIdxAddLog(newIdx))
        {
            LayersHelper.SetSelectedIdx(lastIdx);
            LayersHelper.ShowAddLogPanel();
            isDone = true;
        }//if
        else if (LayersHelper.IsIdxAddLogCosmic(newIdx))
        {
            newIdx = LayersHelper.LAYER_IDX_NULL;
            LayersHelper.SetSelectedIdx(newIdx);
            LayersHelper.AddLogsCosmic();
        }//else if
        else if (LayersHelper.IsIdxAddLogSurface(newIdx))
        {
            newIdx = LayersHelper.LAYER_IDX_NULL;
            LayersHelper.SetSelectedIdx(newIdx);
            _AddLogsSurface();
        }//else if

        if (!isDone)
        {
            if (   !LayersHelper.IsIdxTimeSliceUiProxy(newIdx)
                && !LayersHelper.IsIdxTimeSlice(newIdx))
            {
                _SetTsPanelHidden(true);
            }//if
            else
            {
                _SetTsPanelHidden(false);
            }//else

            // 2015-02-12 ND: don't init bitstores for other layers until needed.
            _InitBitsLegacy();
        
            LayersHelper.SyncSelectedWithMap();
        
            _MapExtentChanged(100); // force URL update
        
            if (!LayersHelper.IsIdxNull(newIdx))
            {    
                _FlyToExtentByIdx(newIdx);
                _HudUpdate();
            }//if
        }//if
    };

    return LayersHelper;
})();






// ===============================================================================================
// ======================================= MAP POLYS PROXY =======================================
// ===============================================================================================
//
// MapPolysProxy: Retained interface for asynchronous loading and use of map_polys.js, which
//                provides JSON-based polygon / marker annotation feature management.
//
var MapPolysProxy = (function()
{
    function MapPolysProxy()
    {
        this._mapPolys = null;
    }

    MapPolysProxy.prototype._IsReady = function()
    {
        return this._mapPolys != null;
    };

    MapPolysProxy.prototype.Init = function(mapref, fxMenuInit, fxGetLangPref, fxGetLangStrings)
    {
        if (this._IsReady()) return;

        this._LoadAsync(mapref, fxMenuInit, fxGetLangPref, fxGetLangStrings);
    };

    MapPolysProxy.prototype.GetEncodedPolygons = function()
    {
        return this._IsReady() ? this._mapPolys.GetEncodedPolygons() : new Array();
    };

    MapPolysProxy.prototype.GetGroups = function()
    {
        return this._IsReady() ? this._mapPolys.GetGroups() : new Array();
    };

    MapPolysProxy.prototype.GetPolygons = function()
    {
        return this._IsReady() ? this._mapPolys.GetPolygons() : new Array();
    };

    MapPolysProxy.prototype._LoadAsync = function(mapref, fxMenuInit, fxGetLangPref, fxGetLangStrings)
    {
        var cb = function()
        {
            this._mapPolys = new MapPolys(mapref, fxMenuInit, fxGetLangPref, fxGetLangStrings);
            this._mapPolys.Init();
        }.bind(this);

        SafemapUI.RequireJS(MapPolysProxy.src, true, cb, null);
    };

    MapPolysProxy.prototype.Add = function(poly_id)
    {
        if (this._IsReady()) this._mapPolys.Add(poly_id);
    };

    MapPolysProxy.prototype.Remove = function(poly_id)
    {
        if (this._IsReady()) this._mapPolys.Remove(poly_id);
    };

    MapPolysProxy.prototype.Exists = function(poly_id)
    {
        return this._IsReady() ? this._mapPolys.Exists(poly_id) : false;
    };

    MapPolysProxy.prototype.GetLocalizedPolyValue = function(poly, prop)
    {
        return this._IsReady() ? this._mapPolys._GetLocalizedPolyValue(poly, prop) : new Array();
    };

    MapPolysProxy.prototype.GetLocalizedPolyString = function(poly, prop)
    {
        return this._IsReady() ? this._mapPolys._GetLocalizedPolyString(poly, prop) : "";
    };

    MapPolysProxy.src = "map_polys_min.js";

    return MapPolysProxy;
})();





// ===============================================================================================
// ===================================== FLY TO EXTENT PROXY =====================================
// ===============================================================================================
//
// FlyToExtentProxy: Retained interface for asynchronous loading and use of fly_to_extent.js,
//                   which provides panning/zoom to a map location and the display of stylized
//                   location name text to the user after doing so.
//
var FlyToExtentProxy = (function()
{
    function FlyToExtentProxy()
    {
        this._flyToExtent = null;
    }

    FlyToExtentProxy.prototype._IsReady = function()
    {
        return this._flyToExtent != null;
    };

    FlyToExtentProxy.prototype.Init = function(mapref, fxUpdateMapExtent)
    {
        if (this._IsReady()) return;

        this._LoadAsync(mapref, fxUpdateMapExtent);
    };

    FlyToExtentProxy.prototype._LoadAsync = function(mapref, fxUpdateMapExtent)
    {
        var cb = function()
        {
            this._flyToExtent = new FlyToExtent(mapref, fxUpdateMapExtent);
        }.bind(this);

        SafemapUI.RequireJS(FlyToExtentProxy.src, true, cb, null);
    };

    FlyToExtentProxy.prototype.GoToPresetLocationIdIfNeeded = function(locId)
    {
        if (this._IsReady()) this._flyToExtent.GoToPresetLocationIdIfNeeded(locId);
    };

    FlyToExtentProxy.prototype.GoToLocationWithTextIfNeeded = function(x0, y0, x1, y1, z_min, z_max, loc_text)
    {
        if (this._IsReady()) this._flyToExtent.GoToLocationWithTextIfNeeded(x0, y0, x1, y1, z_min, z_max, loc_text);
    };

    FlyToExtentProxy.prototype.ShowLocationText = function(txt)
    {
        if (this._IsReady()) this._flyToExtent.ShowLocationText(txt);
    };

    FlyToExtentProxy.src = "fly_to_extent_min.js";

    return FlyToExtentProxy;
})();









// ===============================================================================================
// ========================================= SAFEMAP UI ==========================================
// ===============================================================================================



var SafemapUI = (function()
{
    function SafemapUI()
    {
    }

    SafemapUI.AnimateElementFadeIn = function(el, opacity, stride, fxCallback)
    {  
        opacity = opacity < 0.0 ? 0.0 : opacity + stride > 1.0 ? 1.0 : opacity + stride;  
        el.style.opacity = opacity;
        if (opacity == 0.0) { if (el.style.display != null && el.style.display == "none") el.style.display = null; if (el.style.visibility != null && el.style.visibility == "hidden") el.style.visibility = "visible"; }
        if (opacity  < 1.0) requestAnimationFrame(function() { SafemapUI.AnimateElementFadeIn(el, opacity, stride, fxCallback) }.bind(this));
        else if (opacity == 1.0 && fxCallback != null) fxCallback();
    };

    SafemapUI.InjectLoadingSpinner = function(el, color, size)
    {
        var div = document.createElement("div");
        
        div.className = "loading-spinner" 
                      + (color != null && color == SafemapUI.LoadingSpinnerColor.White ? " white"      : "") 
                      + (size  != null && size  == SafemapUI.LoadingSpinnerSize.Large  ? " bigspinner" : "");

        while (el.firstChild) 
        {
            el.removeChild(el.firstChild);
        }//while

        el.appendChild(div); // don't contaminate styles of parent element
    };


    var _SetStyleFromCSS = function(sel, t, css)
    {
        var d = false;

        for (var i=0; i<document.styleSheets.length; i++)
        {
            var r = document.styleSheets[i].href == null ? (document.styleSheets[i].cssRules || document.styleSheets[i].rules || new Array()) : new Array();

            for (var n in r)
            {
                if (r[n].type == t && r[n].selectorText == sel)
                {
                    r[n].style.cssText = css;
                    d = true;
                    break;
                }//if
            }//for

            if (d) break;
        }//for
    };

    var _GetCssForScaler = function(s)
    {
        var ir = "image-rendering:";
        var a = new Array();

        a.push([1, ir+"optimizeSpeed;"]);
        a.push([1, ir+"-moz-crisp-edges;"]);
        a.push([1, ir+"-o-crisp-edges;"]);
        a.push([1, ir+"-webkit-optimize-contrast;"]);
        a.push([1, ir+"optimize-contrast;"]);
        a.push([1, ir+"crisp-edges;"]);
        a.push([1, ir+"pixelated;"]);
        a.push([1, "-ms-interpolation-mode:nearest-neighbor;"]);

        var d = "";

        for (var i=0; i<a.length; i++)
        {
            if (a[i][0] <= s) d += a[i][1] + " \n ";
        }//for

        return d;
    };

    SafemapUI.ToggleScaler = function()
    {
        _img_scaler_idx = _img_scaler_idx == 1 ? 0 : _img_scaler_idx + 1;
        
        var css = _GetCssForScaler(_img_scaler_idx);
        _SetStyleFromCSS(".noblur img", 1, css);
    };

    SafemapUI.ToggleTileShadow = function()
    {
        var n;
    
        if (window.devicePixelRatio > 1.5)
        {
            var pre = window.location.href.substring(0,5) != "https" ? "http://"
                    : !_use_jp_region ? "https://s3.amazonaws.com/"
                    : "https://s3-ap-northeast-1.amazonaws.com/";
                
            n = "#map_canvas img[src^=\"" + pre + "te\"], #map_canvas img[src^=\"" + pre + "nnsa\"]";
        }//if
        else
        {
            n = "#map_canvas > div:first-child > div:first-child > div:first-child > div:first-child > div:first-child > div:nth-last-of-type(1)";
        }//else

        if (_img_tile_shadow_idx == -1)
        {
            var s = document.createElement("style");
            s.type = "text/css";
            s.innerHTML =   n + "\n"
                        + "{" + "\n"
                        + "}" + "\n";
            document.head.appendChild(s);
            _img_tile_shadow_idx = 0;
            LayersHelper.SyncSelectedWithMap(); // hack to force layers to match known heirarchy, only seems to be needed once(?)
        }//if

        _img_tile_shadow_idx = _img_tile_shadow_idx == 1 ? 0 : _img_tile_shadow_idx + 1;

        var css;

        if (_img_tile_shadow_idx == 1)
        {
            css = "    " + "-webkit-filter: drop-shadow(2px 2px 2px #000);" + " \n "
                + "    " + "filter: drop-shadow(2px 2px 2px #000);"         + " \n ";        
        }//if
        else
        {
            css = "";
        }//else

        _SetStyleFromCSS(n, 1, css);
    };


    SafemapUI.GetIsRetina = function() 
    { 
        return !_no_hdpi_tiles && window.devicePixelRatio > 1.5; 
    };


    SafemapUI.GetContentBaseUrl = function()
    {
        //return "http://tilemap" + (_use_jp_region ? "jp" : "") + ".safecast.org.s3.amazonaws.com/";
        return "";
    };


    // nb: This only checks if the location is set in the querystring.
    //     The implication is that at launch time, if this is present, it
    //     means a link with the lat/lon in the querystring is set.
    //     This does not hold true later, as when the user does anything,
    //     it will be overridden.
    //     This has two use cases:
    //     1. If a link was followed, don't display the location text.
    //     2. If a link was followed with logids, don't autozoom.
    SafemapUI.IsDefaultLocation = function()
    {
        var yxz = SafemapUI.GetUserLocationFromQuerystring();
        return yxz.yx == null;
    };


    SafemapUI.GetUserLocationFromQuerystring = function()
    {
        var y = SafemapUI.GetParam("y");
        var x = SafemapUI.GetParam("x");
        var z = SafemapUI.QueryString_GetParamAsInt("z");

        if (y == null) y = SafemapUI.GetParam("lat");
        if (x == null) x = SafemapUI.GetParam("lon");

        var yx = y != null && x != null && y.length > 0 && x.length > 0 ? new google.maps.LatLng(y, x) : null;

        return { yx:yx, z:z }
    };


    // returns meters per pixel for a given EPSG:3857 Web Mercator zoom level, for the
    // given latitude and number of pixels.
    var _M_LatPxZ = function(lat, px, z) 
    {
        return (Math.cos(lat*Math.PI/180.0)*2.0*Math.PI*6378137.0/(256.0*Math.pow(2.0,z)))*px; 
    };


    var _GetFormattedSafecastApiQuerystring = function(lat, lon, dist, start_date_iso, end_date_iso)
    {
        var url = "https://api.safecast.org/en-US/measurements?utf8=%E2%9C%93"
                + "&latitude=" + lat.toFixed(6)
                + "&longitude="+ lon.toFixed(6)
                + "&distance=" + Math.ceil(dist)
                + "&captured_after="  + encodeURIComponent(start_date_iso)
                + "&captured_before=" + encodeURIComponent(end_date_iso)
                + "&since=&until=&commit=Filter";
        return url;
    };


    SafemapUI.QuerySafecastApiAsync = function(lat, lon, z)
    {
        var start_date_iso, end_date_iso;
        var dist = _M_LatPxZ(lat, 1+1<<Math.max(z-13.0,0.0), z);
        var idx  = LayersHelper.GetSelectedIdx();

        if (LayersHelper.IsIdxTimeSlice(idx))
        {
            var ds = SafecastDateHelper.GetTimeSliceLayerDateRangeInclusiveForIdxUTC(idx);
        
            start_date_iso = ds.s;
              end_date_iso = ds.e;
        }//if
        else
        {
            start_date_iso = "2011-03-10T00:00:00Z";

            var d1 = new Date();
            var t1 = d1.getTime();
            t1 += 24.0 * 60.0 * 60.0 * 1000.0; // pad by one day
            d1.setTime(t1);

            end_date_iso = d1.toISOString();
        }//else

        var url = _GetFormattedSafecastApiQuerystring(lat, lon, dist, start_date_iso, end_date_iso);

        window.open(url);
    };


    SafemapUI.GeocodeAddress = function() 
    {
        if (geocoder == null) geocoder = new google.maps.Geocoder();

        var cb = function (results, status) 
        {
            if (status == google.maps.GeocoderStatus.OK) 
            {
                map.setCenter(results[0].geometry.location);
                var marker = new google.maps.Marker({ map: map, position: results[0].geometry.location });
            }//if
        };

        geocoder.geocode({ "address": document.getElementById("address").value, "region": "jp" }, cb);
    };



    // 2015-02-25 ND: New function for async script loads.
    var _RequireJS_New = function(url, fxCallback, userData)
    {
        url     += "?t=" + Date.now();
        var el   = document.createElement("script");
        el.async = true;
        el.type  = "text/javascript";

        var cb = function (e)
        {
            if (fxCallback!=null) fxCallback(userData);
            el.removeEventListener("load", cb);
        }.bind(this);

        el.addEventListener("load", cb, false);
        el.src   = url;
        var head = document.getElementsByTagName("head")[0];
        head.appendChild(el);
    };

    var _RequireJS_LocalOnly = function(url, fxCallback, userData) // not sure if this works anymore
    {
        document.write('<script src="' + url + '" type="text/javascript"></script>');
        if (fxCallback != null) fxCallback(userData);
    };

    // Note: This is now mainly just a wrapper for RequireJS_New and RequireJS_LocalOnly.
    //       It is only actually used for sync script loads which are deprecated in modern browsers.
    //       Sync loads are only used by ShowBitmapIndexVisualization() and this can be cleaned up
    //       when that code gets refactored.
    // http://stackoverflow.com/questions/950087/how-to-include-a-javascript-file-in-another-javascript-file
    SafemapUI.RequireJS = function(url, isAsync, fxCallback, userData)
    {
        if (LOCAL_TEST_MODE) return _RequireJS_LocalOnly(url, fxCallback, userData);
        else if (isAsync)    return _RequireJS_New(url, fxCallback, userData);

        var ajax = new XMLHttpRequest();    
        ajax.open("GET", url, isAsync); // <-- false = synchronous on main thread
        ajax.onreadystatechange = function()
        {   
            if (ajax.readyState === 4) 
            {
                switch( ajax.status) 
                {
                    case 200:
                        var script = ajax.response || ajax.responseText;
                        var el = document.createElement("script");
                        el.innerHTML = script;
                        el.async = false;
                        document.head.appendChild(el);
                        if (fxCallback != null) fxCallback(userData);
                        break;
                    default:
                        console.log("ERROR: script not loaded: ", url);
                        break;
                }//switch
            }//if
        }.bind(this);
        ajax.send(null);
    };


    SafemapUI.QueryString_GetParamAsInt = function(paramName) // -1 if string was null
    {
        var sp = SafemapUI.GetParam(paramName);
        return sp != null && sp.length > 0 ? parseInt(sp) : -1;
    };

    SafemapUI.QueryString_IsParamEqual = function(paramName, compareValue)
    {
        var retVal = false;
    
        if (paramName != null)
        {
            var p  = SafemapUI.GetParam(paramName);
            retVal = p != null && p.length > 0 && p == compareValue;
        }//if
    
        return retVal;
    };

    SafemapUI.GetParam = function(name) 
    {
        name        = name.replace(/[\[]/, "\\\[").replace(/[\]]/, "\\\]");
        var regexS  = "[\\?&]" + name + "=([^&#]*)";
        var regex   = new RegExp(regexS);
        var results = regex.exec(window.location.href);
    
        return results == null ? "" : results[1];
    };

    SafemapUI.IsBrowserOldIE = function() 
    {
        var ua   = window.navigator.userAgent;
        var msie = ua.indexOf("MSIE"); // IE11: "Trident/"
        return msie <= 0 ? false : parseInt(ua.substring(msie + 5, ua.indexOf(".", msie)), 10) < 10;
    };

    SafemapUI.GetBaseWindowURL = function()
    {
        return window.location.href.indexOf("?") > -1 ? window.location.href.substr(0, window.location.href.indexOf("?")) : window.location.href;
    };
    
    SafemapUI.LoadingSpinnerColor = 
    {
        Black:0,
        White:1
    };
    
    SafemapUI.LoadingSpinnerSize = 
    {
        Medium:0,
        Large:1
    };

    return SafemapUI;
})();



// ===============================================================================================
// ===================================== GOOGLE MAPS UTILITY =====================================
// ===============================================================================================


var SafemapUtil = (function()
{
    function SafemapUtil()
    {
    }

    // Google function.  Handles 180th meridian spans which result in invalid tile references otherwise.
    // Despite the name, xy is EPSG:3857 tile x/y.
    SafemapUtil.GetNormalizedCoord = function(xy, z) 
    {
        var w = 1 << z;
        var x = xy.x < 0 || xy.x >= w ? (xy.x % w + w) % w : xy.x;
        return { x:x, y:xy.y };
    };


    // Returns lat/lon centroid of visible extent, correcting for Google's invalid coordinate system refs on 180th meridian spans.
    SafemapUtil.GetNormalizedMapCentroid = function()
    {
        var c = map.getCenter();
        var y = c.lat();
        var x = c.lng();
    
        if (x > 180.0 || x < -180.0) x = x % 360.0 == x % 180.0 ? x % 180.0 : (x > 0.0 ? -1.0 : 1.0) * 180.0 + (x % 180.0); // thanks Google
    
        return { y:y, x:x };
    };
    
    // Gets the map centroid lat/lon/z.  Truncates to max rez of pixel for shortest string length possible.
    // Slightly errors on the side of being too precise as it does not handle lat-dependent changes or lon diffs.
    SafemapUtil.GetMapInstanceYXZ = function()
    {
        var c = SafemapUtil.GetNormalizedMapCentroid();
        var y = c.y;
        var x = c.x;
        var z = map.getZoom();
        var rm; // truncate using round/fdiv. toFixed also does this but zero pads, which is bad here.
    
             if (z >= 19) { rm = 1000000.0; } // 6 fractional digits
        else if (z >= 16) { rm = 100000.0; }  // 5 ... etc
        else if (z >= 13) { rm = 10000.0; }
        else if (z >=  9) { rm = 1000.0; }
        else if (z >=  6) { rm = 100.0; }
        else if (z >=  3) { rm = 10.0; }
        else              { rm = 1.0; }

        y *= rm;
        x *= rm;
        y = Math.round(y);
        x = Math.round(x);
        y /= rm;
        x /= rm;

        // i just can't bring myself to delete this.
    
        //  z   m/px @ lat0  lonDD@lat45       latDD
        //  0  156,543.0340     1.0             1.0
        //  1   78,271.5170                     0.1
        //  2   39,135.7585     0.1
        //  3   19,567.8792
        //  4    9,783.9396     
        //  5    4,891.9698     0.01
        //  6    2,445.9849
        //  7    1,222.9925
        //  8      611.4962     0.001
        //  9      305.7481
        // 10      152.8741
        // 11       76.4370
        // 12       38.2185     0.0001
        // 13       19.1093
        // 14        9.5546
        // 15        4.7773     0.00001
        // 16        2.3887
        // 17        1.1943
        // 18        0.5972     0.000001
        // 19        0.2986
        // 20        0.1493
        // 21        0.0746

        // 1.0      =111,320.0    m
        // 0.1      = 11,132.0    m
        // 0.01     =  1,113.2    m
        // 0.001    =    111.32   m
        // 0.0001   =     11.132  m
        // 0.00001  =      1.1132 m
        // 0.000001 =      0.1132 m

        // 1.0      = 78,710.0     m
        // 0.1      =  7,871.0     m
        // 0.01     =    787.1     m
        // 0.001    =     78.71    m
        // 0.0001   =      7.871   m
        // 0.00001  =      0.7871  m
        // 0.000001 =      0.07871 m
    
        return { y:y, x:x, z:z };
    };
    
    return SafemapUtil;
})();


















// ===============================================================================================
// ======================================== BITMAP INDICES =======================================
// ===============================================================================================

// These depend on bitstore.js being loaded.

var BitsProxy = (function()
{
    function BitsProxy(ddlLayersId) // "layers"
    {
        this._debug_loads    = 0;
        this._debug_noloads  = 0;
        this._cached_tilewh  = null;
        this._cached_maxz    = null;
        this._layerBitstores = null;
        this._bs_ready       = false;
        this.use_bitstores   = _CheckRequirements();
        this.ddlLayersId     = ddlLayersId;
        this.ddlLayers       = document.getElementById(ddlLayersId);
        this.extent_u32      = "ArrayBuffer" in window ? new Uint32Array([0,0,0,0,21,0]) : null; // <- must be 21.
        
        if (this.use_bitstores) this.LoadAsync();
    }
    
    BitsProxy.prototype.fxGetLayerForIdx = function(idx) { return ClientZoomHelper.GetLayerForIdx(idx, overlayMaps); };

    var _GetUrlTemplateForLayerId = function(layer_id)
    {
        var d = null;

        for (var i=0; i<overlayMaps.length; i++)
        {
            if (    overlayMaps[i].ext_layer_id == layer_id
                && !overlayMaps[i].ext_is_layer_id_proxy)
            {
                d = overlayMaps[i].ext_url_template;
                break;
            }//if
        }//for

        return d;
    };

    // 2015-08-31 ND: reduce function call and enum overhead when loading tiles
    BitsProxy.prototype.CacheAddTileWHZ = function(layerId, px, z)
    {
        if (   this._cached_tilewh        == null
            || this._cached_tilewh.length  < layerId + 1)
        {
            this._cached_tilewh = _vcopy_vfill_sset_u16(this._cached_tilewh, 0xFFFF, layerId, px, 32);
            this._cached_maxz   = _vcopy_vfill_sset_u16(this._cached_maxz,   0xFFFF, layerId, z,  32);
        }//if
        else if (this._cached_tilewh[layerId] == 0xFFFF)
        {
            this._cached_tilewh[layerId] = px;
            this._cached_maxz[layerId]   = z;
        }//if
    };
    
    BitsProxy.prototype.LoadAsync = function()
    {
        var cb = function() { this.Init(); }.bind(this);
        SafemapUI.RequireJS(BitsProxy.relsrc, true, cb, null);
    };
    
    BitsProxy.prototype.GetUseBitstores = function()
    {
        return this.use_bitstores;
    };
    
    BitsProxy.prototype.GetIsReady = function()
    {
        return this._bs_ready;
    };
    
    BitsProxy.prototype.LegacyInitForSelection = function()
    {
        var idx = _GetSelectedLayerIdx();
        if (idx <= 2 || idx >= 8) return;
        
        var layer = this.fxGetLayerForIdx(idx);
        
        var layerId = layer != null ? layer.ext_layer_id : -1;
        
        if (layerId == -1) return;
        
        /*
        var layerId = idx == 3 ? 3 // todo: define these more formally somewhere.
                    : idx == 4 ? 6
                    : idx == 5 ? 16
                    : idx == 6 ? 9
                    : idx == 7 ? 9
                    :            2;
        */
        
        // idx | layerId | desc
        // ----|---------|------
        //   0 |  2      | sc p+i   always loaded
        //   1 |  2      | sc p     always loaded
        //   2 |  8      | sc i     always loaded
        //   3 |  3      | nnsa
        //   4 |  6      | nure
        //   5 | 16      | au
        //   6 |  9      | aist
        //   7 |  9      | test_idw
        //   8 |  2      | historical 13    always loaded
        //   9 |  2      | historical 14    always loaded
        //  10 |         | add proxy
        //  11 |         | NULL
        //  12 |         | time slice proxy
        //  13 |  2      | time slice min   always loaded
        //  22 |  2      | time slice max   always loaded

        this.InitForLayerIdIfNeeded(layerId);
    };
    
    BitsProxy.prototype.InitLayerIds = function(layerIds)
    {
        if (layerIds == null || layerIds.length == 0) return;
        
        for (var i=0; i<layerIds.length; i++)
        {
            this.InitForLayerIdIfNeeded(layerIds[i]);
        }//for
    };
    
    BitsProxy.prototype.Init = function()
    {
        if (this._layerBitstores != null) return;
        
        this._layerBitstores = new Array();
        
        this.InitForLayerIdIfNeeded(2); // always load these -- must update date in UI
        this.InitForLayerIdIfNeeded(8);
        
        this.LegacyInitForSelection();

        this._bs_ready = true;
    };

    BitsProxy.prototype.Init_LayerId02 = function()
    {
        var url   = _GetUrlTemplateForLayerId(2);
        var opts2 = new LBITSOptions({ lldim:1, ll:1, unshd:1, alpha:255, multi:0, maxz:3, url0:BitsProxy.pngsrc, url1:BitsProxy.bitsrc, w:512, h:512 });
        var dcb2  = function(dstr)
        {
            document.getElementById("menu_layers_0_date_label").innerHTML = dstr;
            document.getElementById("menu_layers_1_date_label").innerHTML = dstr;
        }.bind(this);
    
        this._layerBitstores.push(new LBITS(2, 0, 16, url, 0, 0, opts2, dcb2));
    };

    BitsProxy.prototype.Init_LayerId08 = function()
    {
        var url   = _GetUrlTemplateForLayerId(8);
        var opts8 = new LBITSOptions({ lldim:1, ll:1, multi:1, maxz:5, multi:0, url0:BitsProxy.pngsrc, url1:BitsProxy.bitsrc, w:512, h:512 });
        var dcb8  = function(dstr)
        {
            document.getElementById("menu_layers_2_date_label").innerHTML = dstr;
        }.bind(this);
    
        this._layerBitstores.push(new LBITS(8, 2, 14, url, 3, 1, opts8, dcb8));
    };

    BitsProxy.prototype.Init_LayerId03 = function()
    {
        var url   = _GetUrlTemplateForLayerId(3);
        var opts3 = new LBITSOptions({ lldim:1, ll:1, unshd:1, alpha:255, multi:0, url0:BitsProxy.pngsrc, url1:BitsProxy.bitsrc, w:512, h:512 });
        this._layerBitstores.push(new LBITS(3, 5, 15, url, 28, 12, opts3, null));
    };

    BitsProxy.prototype.Init_LayerId06 = function()
    {
        var url   = _GetUrlTemplateForLayerId(6);        
        var opts6 = new LBITSOptions({ lldim:1, ll:1, multi:0, url0:BitsProxy.pngsrc, url1:BitsProxy.bitsrc, w:512, h:512 });
        this._layerBitstores.push(new LBITS(6, 1, 11, url, 0, 0, opts6, null));
    };
    
    BitsProxy.prototype.Init_LayerId09 = function()
    {
        var url   = _GetUrlTemplateForLayerId(9);
        var opts9 = new LBITSOptions({ lldim:1, ll:1, multi:0, url0:BitsProxy.pngsrc, url1:BitsProxy.bitsrc, w:512, h:512 });
        this._layerBitstores.push(new LBITS(9, 2, 11, url, 3, 1, opts9, null));
    };

    BitsProxy.prototype.Init_LayerId16 = function()
    {
        var url    = _GetUrlTemplateForLayerId(16);        
        var opts16 = new LBITSOptions({ lldim:1, ll:1, multi:0, url0:BitsProxy.pngsrc, url1:BitsProxy.bitsrc, w:512, h:512 });
        this._layerBitstores.push(new LBITS(16, 2, 11, url, 3, 2, opts16, null));
    };

    BitsProxy.prototype.InitForLayerIdIfNeeded = function(layerId)
    {
        if (this._layerBitstores == null) return;
    
        var hasLayer = false;
    
        for (var i=0; i<this._layerBitstores.length; i++)
        {
            if (this._layerBitstores[i].layerId == layerId)
            {
                hasLayer = true;
                break;
            }//if
        }//for
    
        if (!hasLayer)
        {
                 if (layerId ==  2) this.Init_LayerId02();
            else if (layerId ==  8) this.Init_LayerId08();
            else if (layerId ==  3) this.Init_LayerId03();
            else if (layerId ==  6) this.Init_LayerId06();
            else if (layerId ==  9) this.Init_LayerId09();
            else if (layerId == 16) this.Init_LayerId16();
        }//if
    };
    
    BitsProxy.prototype.StatusReport = function() {
        var txt = "\n============= BitsProxy Status Report ==============\n" + "         Ready: " + (this._bs_ready ? "[Yes]" : " [NO]") + "\n" + "     Bitstores: " + (this._layerBitstores == null ? "<NULL>" : "" + this._layerBitstores.length) + "\n" + "Loads approved: " + this._debug_loads + "\n" + "Loads rejected: " + this._debug_noloads + "\n";
        if (this._layerBitstores == null)  { txt += "=============      END OF REPORT      ==============\n"; console.log(txt); return; }
        txt += "=============      Bitstore List      ==============\n";
        for (var i=0; i<this._layerBitstores.length; i++) {
            var bs = this._layerBitstores[i];
            if (bs != null) {
                txt += "LBS[" + i + "]: layerId=" + bs.layerId + ", " + "bitstores=" + (bs.bitstores == null ? "<NULL>" : bs.bitstores.length) + ", " + "ready=" + (bs.isReady ? "Y" : "N") + ", ";
                var dc = 0;
                for (var j=0; j<bs.bitstores.length; j++) { var bits = bs.bitstores[j]; dc += bits.GetDataCount(); }
                txt += "dataCount=" + dc + ", extent=(" + bs.extent[0].toLocaleString() + " ~~ " + bs.extent[1].toLocaleString() + ") (" + bs.extent[2].toLocaleString() + " ~~ " + bs.extent[3].toLocaleString() + ")\n";
                if (bs.layerId != -9000) {
                    for (var j=0; j<bs.bitstores.length; j++) {
                        var src = null, src_n = 0, bits = bs.bitstores[j];
                        if (bits != null && bits.data != null) { src = bits.GetNewPlanar8FromBitmap(1, 0); for (var k=0; k<src.length; k++) { if (src[k] != 0) src_n++; } }
                        txt += " +-- (" + bits.x + ", " + bits.y + ") @ " + bits.z + ", dc=" + bits.GetDataCount() + ", ready=" + (bits.isReady ? "Y" : "N") + ", data.length=" + (bits.data != null ? bits.data.length : "<NULL>") +  ", src_n=" + src_n + ", extent=(" + bits.extent[0].toLocaleString() + " ~~ " + bits.extent[1].toLocaleString() + ") (" + bits.extent[2].toLocaleString() + " ~~ " + bits.extent[3].toLocaleString() + ")\n";
                        if (bits.data != null && src != null) {
                            var x, y, src_idx, dest_idx, w_rsn=2, h_rsn=4, imgpre="   +- ", src_w = bits.img_width, src_h = bits.img_height;
                            var dest_w = src_w >>> w_rsn, dest_h = src_h >>> h_rsn;
                            var dest = new Uint8Array(dest_w * dest_h);
                            for (y = 0; y < src_h; y++) { for (x = 0; x < src_w; x++) { src_idx = y * src_w + x; if (src[src_idx] != 0) { dest_idx = (y >>> h_rsn) * dest_w + (x >>> w_rsn); dest[dest_idx] = 1; } } }
                            var imgdiv = imgpre + "[";
                            for (x = 0; x < dest_w; x++) { imgdiv += "="; }
                            imgdiv += "]\n";
                            txt += imgdiv;
                            for (y = 0; y < dest_h; y++) { txt += imgpre + "["; for (x = 0; x < dest_w; x++) { dest_idx = y * dest_w + x; txt += dest[dest_idx] != 0 ? "█" : " "; } txt += "]\n"; }
                            txt += imgdiv;
                        }//if (bits.data != null)
                    }//for (j/bits)
                }//if (bitstores n < 10)
            }//if (LBITS IS NOT NULL)
            else { txt += "LBS[" + i + "]: <NULL>\n"; }//else
        }//for
        txt += "=============      END OF REPORT      ==============\n"; console.log(txt);
    };

    BitsProxy.prototype.ShouldLoadTile = function(layerId, x, y, z)
    {
        if (!this._bs_ready || this._layerBitstores == null || this._layerBitstores.length == 0) 
        {
            this._debug_loads++;
            return true;
        }
    
        var retVal = true;
        var wh;
        var max_z;
        
        // 2015-08-31 ND: reduce function and enum overhead by caching tile width/height and max z for each layer.
        if (this._cached_tilewh == null || this._cached_tilewh.length < layerId + 1 || this._cached_tilewh[layerId] == 0xFFFF)
        {
            var whs = this.GetTileWidthHeightForLayer(layerId);
            wh      = whs.w;
            max_z   = this.GetBaseMaxZForLayer(layerId);
            
            this.CacheAddTileWHZ(layerId, wh, max_z);
        }//if
        else
        {
            wh    = this._cached_tilewh[layerId];
            max_z = this._cached_maxz[layerId];
        }//else
                
        // *** HACK ***
        if (_GetIsRetina() && z == max_z)
        {
            z--;
            x>>>=1;
            y>>>=1;
        }//if
        
        BitsProxy.SetExtentVector(this.extent_u32, x, y, z, wh, wh);
        
        for (var i=0; i<this._layerBitstores.length; i++)
        {
            var bs = this._layerBitstores[i];
        
            if (bs != null && bs.layerId == layerId && !bs.ShouldLoadTile(layerId, x, y, z, this.extent_u32))
            {
                retVal = false;
                break;
            }//if
        }//for
        
        if (retVal) this._debug_loads++;
        else        this._debug_noloads++; 
    
        return retVal;
    };
    
    
    BitsProxy.prototype.GetBitstoreForLayer = function(layerId)
    {
        var bs = null;
        
        if (this._bs_ready && this._layerBitstores != null)
        {
            for (var i=0; i<this._layerBitstores.length; i++)
            {
                var _bs = this._layerBitstores[i];
        
                if (_bs != null && _bs.layerId == layerId)
                {
                    bs = _bs;
                    break;
                }//if
            }//for
        }//if
        
        return bs;
    };
    
    BitsProxy.prototype.GetTileWidthHeightForLayer = function(layerId)
    {
        var bs = this.GetBitstoreForLayer(layerId);
        return bs == null ? { w:256, h:256 } : { w:bs.img_width, h:bs.img_height };
    };
    
    BitsProxy.prototype.GetBaseMaxZForLayer = function(layerId)
    {
        var bs = this.GetBitstoreForLayer(layerId);
        return bs == null ? 23 : bs.maxZ;
    };
    
    // This just reprojects Web Mercator tile x/y to pixel x/y at zoom level 23,
    // with the annoying Uint32Array hackery needed to support zoom level 23 coords 
    // without FP magnitude errors.
    BitsProxy.SetExtentVector = function(v, x, y, z, w, h)
    {
        v[5]   = z;
        v[0]   = x * w;
        v[1]   = y * h;
        v[5]   = v[4] - v[5];
        v[2]   = w;
        v[3]   = h;
        v[2] <<= v[5];
        v[3] <<= v[5];
        v[2] -= 1;
        v[3] -= 1;
        v[0] <<= v[5];
        v[1] <<= v[5];
        v[5]   = z;
        v[2]  += v[0];
        v[3]  += v[1];
    };
            
    var _vfill = function(x,d,n) { for(var i=0;i<n;i++)d[i]=x; };
    var _vcopy = function(d,od,s,os,n) { d.subarray(od,od+n).set(s.subarray(os,os+n)); };
    
    var _vcopy_vfill_sset_u16 = function(src, fill, idx, val, n_pad)
    {
        var dest = new Uint16Array(idx + n_pad);
        _vfill(fill, dest, dest.length);
        if (src != null) _vcopy(dest, 0, src, 0, src.length);
        dest[idx] = val;
        return dest;
    };
    
    var _GetIsRetina                 = function()     { return SafemapUI.GetIsRetina(); };
    var _GetQueryString_IsParamEqual = function(p, v) { return SafemapUI.QueryString_IsParamEqual(p, v); };
    var _GetIsBrowserOldIE           = function()     { return SafemapUI.IsBrowserOldIE(); };
    var _GetSelectedLayerIdx         = function()     { return LayersHelper.GetSelectedIdx(); };
    var _GetUseJpRegion              = function()     { return _use_jp_region; };
    var _GetContentBaseUrl           = function()     { return SafemapUI.GetContentBaseUrl(); };
    var _GetUseHttps                 = function()     { return _use_https; };
    
    BitsProxy.relsrc = _GetContentBaseUrl() + "bitstore_min.js";
    BitsProxy.bitsrc = (_GetUseHttps() ? "https://" : "http://") + "safecast.org/tilemap/bitstore_min.js";
    BitsProxy.pngsrc = (_GetUseHttps() ? "https://" : "http://") + "safecast.org/tilemap/png_zlib_worker_min.js";
    
    var _CheckRequirements = function()
    {
        return !_GetQueryString_IsParamEqual("noIndices", "1") && !_GetIsBrowserOldIE() && "ArrayBuffer" in window && "bind" in Function.prototype;
    };
    
    return BitsProxy;
})();



// ===============================================================================================
// ========================================== HUD RETICLE ========================================
// ===============================================================================================

// HudProxy contains the HUD class instance, and wraps it safely for async on-demand loads.
// It implictly depends on an image icon with the element id "hud_btnToggle".
var HudProxy = (function()
{
    function HudProxy() 
    {
        this._hud = null;
        this._btnToggleStateOn = false;
        this._noreqs = !HudProxy.CheckRequirements();
        this.last_hud_layers = null;
        
        if (!this._noreqs)
        {
            this.BindEventsUI();
        }//if
    }
    
    HudProxy.prototype.Update = function()
    {
        if (this._hud != null && this._btnToggleStateOn)
        {
            this._hud.last.px = -1;
            this._hud.last.py = -1;
            this._hud.MapExtent_OnChange();
        }//if
    };
    
    HudProxy.prototype.Enable = function()
    {
        if (this._hud == null || !this._btnToggleStateOn)
        {
            this.btnToggleOnClick();
        }//if
    };
    
    HudProxy.prototype.ExecuteWithAsyncLoadIfNeeded = function(fxCallback, userData)
    {
        if (this._hud != null)
        {
            fxCallback(userData);
        }//if
        else
        {
            var el = document.getElementById("hud_canvas");
            el.style.cssText = "position:absolute;display:block;top:0;bottom:0;left:0;right:0;width:144px;height:144px;margin:auto;";
            SafemapUI.InjectLoadingSpinner(el, SafemapUI.LoadingSpinnerColor.White, SafemapUI.LoadingSpinnerSize.Large);
        
            var cb = function()
            {
                this._hud = new HUD(map, el);
                this._hud.SetFxCheckBitstores(function(layerId, x, y, z) { return _bitsProxy.ShouldLoadTile(layerId, x, y, z); }.bind(this));
                
                this._hud.SetFxCheckSize(function(layerId) { return _bitsProxy.GetTileWidthHeightForLayer(layerId); }.bind(this));
                this._hud.SetFxCheckMaxZ(function(layerId) { return _bitsProxy.GetBaseMaxZForLayer(layerId); }.bind(this));
                
                if (this.last_hud_layers != null) this._hud.SetLayers(this.last_hud_layers);
                
                fxCallback(userData);
            }.bind(this);

            SafemapUI.RequireJS(SafemapUI.GetContentBaseUrl() + "hud_min.js", true, cb, null);
        }//else
    };
    
    HudProxy.prototype.SetLayers = function(newLayers)
    {
        if (this._hud != null)
        {
            this._hud.SetLayers(newLayers);
        }//if
        
        this.last_hud_layers = newLayers;
    };
    
    HudProxy.prototype.BindEventsUI = function()
    {
        HudProxy.aListId("hud_btnToggle", "click", function() { this.btnToggleOnClick(); }.bind(this) );
    };
    
    HudProxy.prototype.btnToggleOnClick = function()
    {
        var was_null = this._hud == null;
    
        var cb = function() 
        {
            if (!was_null)
            {
                this._hud.ToggleHibernate();
            }//if
        }.bind(this);
        
        this.ExecuteWithAsyncLoadIfNeeded(cb, null);

        this._btnToggleStateOn = !this._btnToggleStateOn;
    };
    
    HudProxy.elGet    = function(id)       { return document.getElementById(id); };
    HudProxy.aList    = function(el,ev,fx) { el.addEventListener(ev, fx, false); };
    HudProxy.aListId  = function(id,ev,fx) { HudProxy.aList(HudProxy.elGet(id), ev, fx); }

    HudProxy.CheckRequirements = function()
    {
        return "bind" in Function.prototype && "ArrayBuffer" in window;
    };

    return HudProxy;
})();







// BvProxy contains the bGeigie Log Viewer class instance, and wraps it safely for async on-demand loads.
// It has dependencies on styles and elements which are loaded on-demand from separate .html/.css files.
// Note the URLs for those includes are hardcoded and inline.
var BvProxy = (function()
{
    function BvProxy() 
    {
        this._bvm = null;
        this._noreqs = !_CheckRequirements();
        
        this.fxSwapClassToHideElId  = function(elementid, classHidden, classVisible, isHidden) 
        { 
            // this is actually not a very good way to toggle visibility/display, and
            // anything using it should eventually be updated to not do so.
            var el = document.getElementById(elementid);
            if       (el != null &&  isHidden && el.className == classVisible) el.className = classHidden;
            else if  (el != null && !isHidden && el.className == classHidden)  el.className = classVisible;
        }.bind(this);
        this.fxRequireJS            = function(url, isAsync, fxCallback, userData) { SafemapUI.RequireJS(url, isAsync, fxCallback, userData); }.bind(this);
        this.fxInjectLoadingSpinner = function(el) { SafemapUI.InjectLoadingSpinner(el, SafemapUI.LoadingSpinnerColor.White, SafemapUI.LoadingSpinnerSize.Large); }.bind(this);
        this.fxUpdateMapExtent      = function() { SafemapExtent.OnChange(SafemapExtent.Event.RemoveLogsClick); }.bind(this);
        this.fxIsDefaultLocation    = function() { return SafemapUI.IsDefaultLocation();  }.bind(this);
    }
    
    BvProxy.prototype.ExecuteWithAsyncLoadIfNeeded = function(fxCallback, userData)
    {
        if (this._bvm != null)
        {
            fxCallback(userData);
        }//if
        else
        {
            var cb = function()
            {
                if (this._bvm == null)
                {
                    this._bvm = new BVM(map, null);
                }//if
                
                this.GetUiContentStylesAsync(fxCallback, userData);
            }.bind(this);
        
            this.fxRequireJS(SafemapUI.GetContentBaseUrl() + "bgeigie_viewer_min.js", true, cb, null);
        }//else
    };
    
    
    BvProxy.prototype.BindEventsUI = function()
    {
        if (this._noreqs) return;
        
        var i = document.getElementById("bv_bvImgPreview");
        if (i.src == null || i.src.length == 0) i.src = SafemapUI.GetContentBaseUrl() + "bgpreview_118x211.png";
    
        _aListId("bv_btnDoneX", "click", function() { this.btnDoneOnClick(); }.bind(this) );
        _aListId("bv_btnOptions", "click", function() { this.UI_ShowAdvPanel(); }.bind(this) );
        _aListId("bv_btnRemoveAll", "click", function() { this.btnRemoveLogsOnClick(); }.bind(this) );
        _aListId("bv_btnSearch", "click", function() { this.btnAddLogsOnClick(); }.bind(this) );
        _aListId("bv_ddlQueryType", "change", function() { this.UI_ddlQueryType_OnSelectedIndexChanged(); }.bind(this) );
        
        _aListId("bv_btnAdvDoneX", "click", function() { this.UI_btnAdvDoneOnClick(); }.bind(this) );
        _aListId("bv_btnAdvDone", "click", function() { this.UI_btnAdvDoneOnClick(); }.bind(this) );
        _aListId("bv_ddlMarkerType", "change", function() { this.UI_ddlMarkerType_OnSelectedIndexChanged(); }.bind(this) );
        
        var mcb = function() { this.UI_MarkerCustomOnChange(); }.bind(this);
        
        _aListId("bv_tbMarkerShadowRadius", "change", mcb);
        _aListId("bv_tbMarkerStrokeAlpha", "change", mcb);
        _aListId("bv_tbMarkerFillAlpha", "change", mcb);
        _aListId("bv_chkMarkerBearing", "change", mcb);
        _aListId("bv_tbMarkerSize", "change", mcb);
        _aListId("bv_tbParallelism", "change", function() { this.UI_ParallelismOnChange(); }.bind(this) );
    };
    
    // === codebehind pasta ===
        
    BvProxy.prototype.GetLogIdsEncoded = function()
    {
        // don't force an async load for this, only return if it's already loaded.
        return this._bvm == null ? null : this._bvm.GetLogIdsEncoded();
    };
    
    BvProxy.prototype.GetAllLogIdsEncoded = function()
    {
        // don't force an async load for this, only return if it's already loaded.
        return this._bvm == null ? null : this._bvm.GetAllLogIdsEncoded();
    };
    
    BvProxy.prototype.GetLogCount = function()
    {
        // don't force an async load for this, only return if it's already loaded.
        return this._bvm == null ? 0 : this._bvm.GetLogCount();
    };
    
    BvProxy.prototype.SetParallelism = function(p)
    {
        var cb = function() { this._bvm.SetParallelism(p); }.bind(this);
        this.ExecuteWithAsyncLoadIfNeeded(cb, null);
    };

    BvProxy.prototype.SetNewCustomMarkerOptions = function(width, height, alpha_fill, alpha_stroke, shadow_radius, hasBearingTick)
    {
        var cb = function() 
        {
            this._bvm.SetNewCustomMarkerOptions(width, height, alpha_fill, alpha_stroke, shadow_radius, hasBearingTick); 
        }.bind(this);
        
        this.ExecuteWithAsyncLoadIfNeeded(cb, null);
    };

    BvProxy.prototype.ChangeMarkerType = function(markerType)
    {
        var cb = function() { this._bvm.SetNewMarkerType(markerType); }.bind(this);
        this.ExecuteWithAsyncLoadIfNeeded(cb, null);
    };

    BvProxy.prototype.ShowAddLogsPanel = function()
    {
        if (this._noreqs) return this.ShowRequirementsError();
            
        var cb = function() { this.fxSwapClassToHideElId("bv_bvPanel", "bv_bvPanelHidden", "bv_bvPanelVisible", false);  }.bind(this);
        this.ExecuteWithAsyncLoadIfNeeded(cb, null);
    };

    BvProxy.prototype.btnDoneOnClick = function()
    {
        var cb = function() { this.fxSwapClassToHideElId("bv_bvPanel", "bv_bvPanelHidden", "bv_bvPanelVisible", true); }.bind(this);
        this.ExecuteWithAsyncLoadIfNeeded(cb, null);
    };
    
    BvProxy.prototype.btnRemoveLogsOnClick = function()
    {
        var cb = function() { this._bvm.RemoveAllMarkersFromMapAndPurgeData(); this.fxUpdateMapExtent(); }.bind(this);
        this.ExecuteWithAsyncLoadIfNeeded(cb, null);
    };

    BvProxy.prototype.AddLogsCSV = function(csv, auto_zoom)
    {
        if (this._noreqs) return this.ShowRequirementsError();
    
        var cb = function(userData) 
        {
            this._bvm.SetZoomToLogExtent(auto_zoom || this.fxIsDefaultLocation()); 
            this._bvm.AddLogsByQueryFromString(userData); 
        }.bind(this);
        this.ExecuteWithAsyncLoadIfNeeded(cb, csv);
    };

    BvProxy.prototype.btnAddLogsOnClick = function()
    {
        var csv         = _elVal("bv_tbLogIDs");
        var queryTypeId = this.UI_GetQueryType();
        var params      = this.UI_GetExtraQueryStringParams();
        var pageLimit   = 320;//this.UI_GetMaxPages();
    
        if (   (   csv == null ||    csv.length == 0)
            && (params == null || params.length == 0)
            && pageLimit > 1)
        {
            return;
        }//if
    
        var cb = function(userData)
        {
            this.fxSwapClassToHideElId("bv_bvPanel", "bv_bvPanelHidden", "bv_bvPanelVisible", true);
            this._bvm.SetZoomToLogExtent(true);
            this._bvm.AddLogsFromQueryTextWithOptions(userData[0], userData[1], userData[2], userData[3]);
        }.bind(this);
    
        this.ExecuteWithAsyncLoadIfNeeded(cb, [csv, queryTypeId, params, pageLimit]);
    };


    // *** UI Binds ****
    
    BvProxy.prototype.UI_GetSubtypeParamIfPresent = function()
    {
        return _ddlVal("bv_ddlSubtype");
    };

    BvProxy.prototype.UI_GetStatusTypeParamIfPresent = function()
    {
        return _ddlVal("bv_ddlStatusType");
    };
    
    BvProxy.prototype.UI_GetStartDateParamIfPresent = function()
    {
        return _GetApiDateTimeParam(_elVal("bv_tbStartDate"), true);
    };
    
    BvProxy.prototype.UI_GetEndDateParamIfPresent = function()
    {
        return _GetApiDateTimeParam(_elVal("bv_tbEndDate"), false);
    };
    
    BvProxy.prototype.UI_GetQueryType = function()
    {
        return _ddlIdx("bv_ddlQueryType");
    };
    
    //BvProxy.prototype.UI_GetMaxPages = function()
    //{
    //    return parseInt(_ddlVal("bv_ddlMaxPages"));
    //};
    
    BvProxy.prototype.UI_GetExtraQueryStringParams = function()
    {
        return  (this.UI_GetQueryType() == 0 ? "" : this.UI_GetStartDateParamIfPresent())
               + this.UI_GetEndDateParamIfPresent() 
               + this.UI_GetStatusTypeParamIfPresent()
               + this.UI_GetSubtypeParamIfPresent();
    };
        
    BvProxy.prototype.UI_SetDefaultParallelism = function()
    {
        if (parseInt(_elVal("bv_tbParallelism")) == 1)
        {
            _elSetVal("bv_tbParallelism", navigator.hardwareConcurrency != null ? navigator.hardwareConcurrency : 4); 
        }//if
    };

    BvProxy.prototype.UI_UpdateTbPlaceholderText = function()
    {
        var tb = _elGet("bv_tbLogIDs");
        var qt = this.UI_GetQueryType();
        tb.placeholder = qt == 0 ? "Enter bGeigie Log ID(s)" : qt == 1 ? "Enter User ID" : "Enter Search Text";
    };





    BvProxy.prototype.UI_ShowAdvPanel = function()
    {
        this.UI_SetDefaultParallelism();
        _setCls("bv_bvPanelQuery", "bv_bvPanelVisible");
    };
    
    BvProxy.prototype.UI_btnAdvDoneOnClick = function() 
    {
        _setCls("bv_bvPanelQuery", "bv_bvPanelHidden");
    };

    BvProxy.prototype.UI_ddlQueryType_OnSelectedIndexChanged = function()
    {
        var d = this.UI_GetQueryType() == 0;
        _elDis("bv_tbStartDate", d);
        _elDis("bv_tbEndDate", d);
        _elDis("bv_ddlStatusType", d);
        //_elDis("bv_ddlMaxPages", d);
        _elDis("bv_ddlSubtype", d);
        this.UI_UpdateTbPlaceholderText();
    };

    BvProxy.prototype.UI_ddlMarkerType_OnSelectedIndexChanged = function()
    {
        var i = _ddlIdx("bv_ddlMarkerType");
        if (i != 5) this.ChangeMarkerType(i);
        else this.UI_MarkerCustomOnChange();
        var d = i != 5;
        _elDis("bv_tbMarkerSize", d);
        _elDis("bv_chkMarkerBearing", d);
        _elDis("bv_tbMarkerFillAlpha", d);
        _elDis("bv_tbMarkerStrokeAlpha", d);
        _elDis("bv_tbMarkerShadowRadius", d);
        _trHide("bv_trMarkerSize", d);
        _trHide("bv_trMarkerBearing", d);
        _trHide("bv_trMarkerFillAlpha", d);
        _trHide("bv_trMarkerStrokeAlpha", d);
        _trHide("bv_trMarkerShadowRadius", d);
    };

    BvProxy.prototype.UI_MarkerCustomOnChange = function()
    {
        var sz = parseInt(_elVal("bv_tbMarkerSize"));
        var cb = _elGet("bv_chkMarkerBearing").checked;
        var fa = parseFloat(_elVal("bv_tbMarkerFillAlpha"));
        var sa = parseFloat(_elVal("bv_tbMarkerStrokeAlpha"));
        var sr = parseFloat(_elVal("bv_tbMarkerShadowRadius"));
        
        this.SetNewCustomMarkerOptions(sz, sz, fa*0.01, sa*0.01, sr, cb);    
    };

    BvProxy.prototype.UI_ParallelismOnChange = function()
    {
        var p = parseInt(_elVal("bv_tbParallelism")); 
        this.SetParallelism(p);
    };
    
    BvProxy.prototype.ShowRequirementsError = function()
    {
        alert("Error: Your browser does not meet the requirements necessary to use this feature.  Chrome 41+ is recommended.");
    };
    
    BvProxy.prototype.GetUiContentAsync = function(fxCallback, userData) // do not call directly!
    {
        var el = _elGet("bv_bvPanel");
        if (el != null) 
        {
            if (fxCallback != null) fxCallback(userData); 
            return; 
        }//if
        
        var url = SafemapUI.GetContentBaseUrl() + "bgeigie_viewer_inline.html";
        var req = new XMLHttpRequest();
        req.open("GET", url, true);
        req.onreadystatechange = function()
        {   
            if (req.readyState === 4 && req.status == 200)
            {
                el = document.createElement("div");
                el.innerHTML = req.response || req.responseText;
                document.body.appendChild(el);
                
                var e2 = _elGet("bv_loading");
                if (e2 != null) document.body.removeChild(e2);
                
                this.BindEventsUI();
                
                if (fxCallback != null) fxCallback(userData);
            }//if
        }.bind(this);
        req.send(null);
    };
    
    BvProxy.prototype.GetUiContentStylesAsync = function(fxCallback, userData)
    {
        var el = _elGet("bv_bvPanel");
        if (el != null) 
        {
            if (fxCallback != null) fxCallback(userData); 
            return; 
        }//if
        
        var e2 = document.createElement("div");
        e2.id = "bv_loading";
        e2.style.cssText = "position:absolute;display:block;top:0;bottom:0;left:0;right:0;width:144px;height:144px;margin:auto;";
        this.fxInjectLoadingSpinner(e2);//, "#FFF", 2, 144);
        document.body.appendChild(e2);

        var url = SafemapUI.GetContentBaseUrl() + "bgeigie_viewer_inline.css";
        var req = new XMLHttpRequest();
        req.open("GET", url, true);
        req.onreadystatechange = function()
        {   
            if (req.readyState === 4 && req.status == 200)
            {
                el = document.createElement("style");
                el.type = "text/css";
                el.innerHTML = req.response || req.responseText;
                document.getElementsByTagName("head")[0].appendChild(el);
                
                this.GetUiContentAsync(fxCallback, userData);
            }//if
        }.bind(this);
        req.send(null);
    };
    
    // === static/class ===
    
    var _GetApiDateTimeParam = function(rfc_date, isStartDate) 
    {
        if (rfc_date == null || rfc_date.length == 0) return "";

        return (isStartDate ? "&uploaded_after=" : "&uploaded_before=") + _GetApiDateTimeForRFCDate(rfc_date, isStartDate);
    };
    
    var _GetApiDateTimeForRFCDate = function(rfc_date, isMidnight)
    {
        rfc_date = new Date(rfc_date).toISOString();
    
        var yy = rfc_date.substring(0, 0+4);
        var mm = rfc_date.substring(5, 5+2);
        var dd = rfc_date.substring(8, 8+2);
        
        // 2016-03-26 ND: weird date format doesn't seem needed anymore, going with ISO dates
        //return mm + "%2F" + dd + "%2F" + yy + "+" + (isMidnight ? "00%3A00%3A00" : "23%3A59%3A59");
        return yy + "-" + mm + "-" + dd + "T" + (isMidnight ? "00%3A00%3A00" : "23%3A59%3A59") + "Z";
    };
    
    var _CheckRequirements = function()
    {
        var meets_req = !_IsBrowserOldIE() && ("bind" in Function.prototype) && ("ArrayBuffer" in window);
        return meets_req;
    };

    var _IsBrowserOldIE = function() 
    {
        var ua   = window.navigator.userAgent;
        var msie = ua.indexOf("MSIE "); // IE11: "Trident/"
        return msie <= 0 ? false : parseInt(ua.substring(msie + 5, ua.indexOf(".", msie)), 10) < 10;
    };

    var _elGet    = function(id)         { return document.getElementById(id); };
    var _setCls   = function(id, c)      { _elGet(id).className = c; };
    var _trHide   = function(id, isHide) { _elGet(id).style.display = isHide ? "none" : "table-row"; };
    var _elDis    = function(id, isDis)  { _elGet(id).disabled = isDis; };
    var _elVal    = function(id)         { return _elGet(id).value; };
    var _elSetVal = function(id,v)       { _elGet(id).value = v; };
    var _ddlIdx   = function(id)         { return _elGet(id).selectedIndex; };
    var _ddlVal   = function(id)         { var a=_elGet(id); return a.options[a.selectedIndex].value; };    
    var _aList    = function(el,ev,fx)   { el.addEventListener(ev, fx, false); };
    var _aListId  = function(id,ev,fx)   { _aList(_elGet(id), ev, fx); }

    return BvProxy;
})();





// ===============================================================================================
// ===================================== SAFEMAP POPUP HELPER ====================================
// ===============================================================================================







// 2015-04-03 ND: "What's New" popup that fires once.  May also be called
//                from the about window.
var SafemapPopupHelper = (function()
{
    function SafemapPopupHelper()
    {
    }
    
    // The "animate" functions use requestAnimationFrame, so timing is not
    // guaranteed.  Ideally, it's 60 FPS, or 16.666667ms.
    var _AnimateElementBlur = function(el, blur, stride, min_blur, max_blur)
    {  
        blur = stride >= 0.0 && blur + stride > max_blur ? max_blur 
             : stride  < 0.0 && blur + stride < min_blur ? min_blur 
             : blur + stride;
    
        var b = blur == 0.0 ? null : "blur(" + blur.toFixed(2) + "px)";
        el.style["-webkit-filter"] = b;
        el.style["-moz-filter"] = b;
        el.style["-o-filter"] = b;
        el.style["-ms-filter"] = b;
        el.style.filter = b;
    
        if ((stride >= 0 && blur < max_blur) || (stride < 0.0 && blur > min_blur)) 
            requestAnimationFrame(function() { _AnimateElementBlur(el, blur, stride, min_blur, max_blur) }.bind(this));
    };

    var _AnimateElementFadeOut = function(el, opacity, stride)
    {  
        opacity = opacity + stride < 0.0 ? 0.0 : opacity + stride > 1.0 ? 1.0 : opacity + stride;  
        el.style.opacity = opacity;
        if (opacity == 0.0) { el.style.display = "none"; }
        if (opacity  > 0.0) requestAnimationFrame(function() { _AnimateElementFadeOut(el, opacity, stride) }.bind(this));
    };

    var _GetAboutContentAsync = function()
    {
        var el = document.getElementById("about_content");
        if (el.innerHTML != null && el.innerHTML.length > 0) return;
        SafemapUI.InjectLoadingSpinner(el, SafemapUI.LoadingSpinnerColor.Black, SafemapUI.LoadingSpinnerSize.Medium);

        var url = SafemapUI.GetContentBaseUrl() + "about_inline.html";
        var req = new XMLHttpRequest();
        req.open("GET", url, true);
        req.onreadystatechange = function()
        {   
            if (req.readyState === 4 && req.status == 200) el.innerHTML = req.response || req.responseText;
        };
        req.send(null);
    };
    
    SafemapPopupHelper.ToggleAboutPopup = function() // "about" dialog
    {
        var popup  = document.getElementById("about_content");
        var mapdiv = document.getElementById("map_canvas");
        var bmul   = 3.0;
    
        if (popup.style != null && popup.style.display == "none")
        {
            _GetAboutContentAsync();
            _AnimateElementBlur(mapdiv, 0.0, 0.1333333333*bmul, 0.0, 4.0*bmul);
            SafemapUI.AnimateElementFadeIn(document.getElementById("about_content"), -1.0, 0.033333333333);
        }//if
        else
        {
            setTimeout(function() { popup.innerHTML = ""; }, 500);
            _AnimateElementBlur(mapdiv, 4.0*bmul, -0.1333333333*bmul, 0.0, 4.0*bmul);
            _AnimateElementFadeOut(document.getElementById("about_content"), 1.0, -0.033333333333);
        }//else
    };
    
    var _GetClientViewSize = function()
    {
        var _w = window,
            _d = document,
            _e = _d.documentElement,
            _g = _d.getElementsByTagName("body")[0],
            vw = _w.innerWidth || _e.clientWidth || _g.clientWidth,
            vh = _w.innerHeight|| _e.clientHeight|| _g.clientHeight;

        return [vw, vh];
    };

    var _WhatsNewGetShouldShow = function() // 2015-08-22 ND: fix for non-Chrome date parsing
    {
        if (Date.now() > Date.parse("2015-04-30T00:00:00Z")) return false;
    
        var sval = localStorage.getItem("WHATSNEW_2_0");
        var vwh  = _GetClientViewSize();
        if ((sval != null && sval == "1") || vwh[0] < 424 || vwh[1] < 424) return false;
    
        localStorage.setItem("WHATSNEW_2_0", "1");
        return true;
    };

    SafemapPopupHelper.WhatsNewClose = function()
    {
        var el = document.getElementById("whatsnew");
        el.innerHTML = "";
        el.style.display = "none";
    };

    SafemapPopupHelper.WhatsNewShow = function(language)
    {
        var el = document.getElementById("whatsnew");
    
        el.style.display = "block";
    
        if (el.innerHTML != null && el.innerHTML.length > 0) 
        {
            el.innerHTML = "";
        }//if
    
        //LoadingSpinnerHelper.InjectLoadingSpinner(el, "#000", 2, 38);
        SafemapUI.InjectLoadingSpinner(el, SafemapUI.LoadingSpinnerColor.Black, SafemapUI.LoadingSpinnerSize.Medium);

        var url = SafemapUI.GetContentBaseUrl() + "whatsnew_" + language + "_inline.html";
        var req = new XMLHttpRequest();
        req.open("GET", url, true);
        req.onreadystatechange = function()
        {   
            if (req.readyState === 4 && req.status == 200) el.innerHTML = req.response || req.responseText;
        };
        req.send(null);
    };

    SafemapPopupHelper.WhatsNewShowIfNeeded = function()
    {
        if (_WhatsNewGetShouldShow()) SafemapPopupHelper.WhatsNewShow("en");
    };

    var _WarningShowIfNeeded = function()
    {
        if (Date.now() < Date.parse("2015-09-23T13:00:00Z")) 
        {
            var el = document.getElementById("warning_message");
        
            el.style.display = "block";
        
            if (el.innerHTML != null && el.innerHTML.length > 0) 
            {
                el.innerHTML = "";
            }//if
    
            //LoadingSpinnerHelper.InjectLoadingSpinner(el, "#000", 2, 38);
            SafemapUI.InjectLoadingSpinner(el, SafemapUI.LoadingSpinnerColor.Black, SafemapUI.LoadingSpinnerSize.Medium);

            var url = SafemapUI.GetContentBaseUrl() + "warning_inline.html";
            var req = new XMLHttpRequest();
            req.open("GET", url, true);
            req.onreadystatechange = function()
            {   
                if (req.readyState === 4 && req.status == 200) el.innerHTML = req.response || req.responseText;
            };
            req.send(null);
        }//if
    };
    
    return SafemapPopupHelper;
})();






// ===============================================================================================
// ======================================== TIMESLICE UI =========================================
// ===============================================================================================
//
// TimeSliceUI: Minor UI helper functions to support the time slice (aka "time slider", aka "snapshots") 
//              UI window which allows the user to select 6-month slices of the Safecast dataset.
//
var TimeSliceUI = (function()
{
    function TimeSliceUI() 
    {
    }

    var _GetPanelDiv       = function()    { return document.getElementById("tsPanel"); };
    var _GetSliderEl       = function()    { return document.getElementById("tsSlider"); };
    var _GetStartDateEl    = function()    { return document.getElementById("tsStartDate"); };
    var _GetEndDateEl      = function()    { return document.getElementById("tsEndDate"); };
    var _SetLayerAndSync   = function(idx) { LayersHelper.SetSelectedIdxAndSync(idx); };
    var _BitsLegacyInit    = function()    { _bitsProxy.LegacyInitForSelection(); };
    var _SyncLayerWithMap  = function()    { LayersHelper.SyncSelectedWithMap(); };
    var _MapExtentOnChange = function(i)   { SafemapExtent.OnChange(i); };
    var _UpdateHud         = function()    { _hudProxy.Update(); };
    var _GetLabelsForIdx   = function(idx) { return SafecastDateHelper.GetTimeSliceDateRangeLabelsForIdxJST(idx); };
    var _GetTimeSliceIdxs  = function()    { return SafecastDateHelper.GetTimeSliceLayerDateRangesUTC() };

    TimeSliceUI.SetPanelHidden = function(isHidden)
    {
        var el = _GetPanelDiv();
        el.style.display = isHidden ? "none" : "block";
    };

    // nb: This approach has the following flaws:
    //
    // 1. It assumes the static date array is ordered chronologically, with equal intervals.
    // 2. It assumes the time slice layers' indices are contiguous, without gaps.
    //
    // If either of these assumptions is untrue, then InitSliderRange() must also construct a
    // lookup table, mapping contiguous slider indices to the underlying layer indices.
    //
    // unused
    /*
    TimeSliceUI.InitSliderRange = function()
    {
        var s = _GetSliderEl();
        var o = _GetTimeSliceIdxs();

        var min =  65535;
        var max = -65535;

        for (var i=0; i<o.length; i++)
        {
            min = Math.min(o[i].i, min);
            max = Math.max(o[i].i, max);
        }//for
        
        s.min = min;
        s.max = max;
    };
    */
    
    TimeSliceUI.SetSliderIdx = function(idx)
    {
        var s = _GetSliderEl();
        s.value = idx;
    };
    
    TimeSliceUI.GetSliderIdx = function()
    {
        var s = _GetSliderEl();
        var i = parseInt(s.value);
        return i;
    };
    
    var _SetSliderIdxToDefault = function()
    {
        TimeSliceUI.SetSliderIdx(13);
    };
    
    TimeSliceUI.Init = function()
    {
        _SetSliderIdxToDefault();
    };
    
    TimeSliceUI.tsSlider_OnChange = function()
    {    
        var s   = _GetSliderEl();
        var idx = parseInt(s.value);
        var ds  = _GetLabelsForIdx(idx);
        
        _GetStartDateEl().innerHTML = ds.s;
        _GetEndDateEl().innerHTML   = ds.e;
                
        _SetLayerAndSync(idx);
        
        _BitsLegacyInit();
        _SyncLayerWithMap();
        _MapExtentOnChange(100);     // force URL update
        _UpdateHud();
    };
    
    return TimeSliceUI;
})();















// ================================================================================================
// ==================================== LOCALIZED STRINGS PROXY ===================================
// ================================================================================================
//
// nb: For the MENU_LAYERS_*_DATE_LABEL, null and the empty string ("") indicate two different things.
//     * null indicates there is no date label at all for the layer
//     * ""   indicates a dynamic label, set elsewhere.  This is used for the dynamic date display in
//            the Safecast layers.
//
var LocalizedStringsProxy = (function()
{
    function LocalizedStringsProxy() 
    {
        this._queue = new Array();
        this._localized_strings = null;

        this._GetStringsForLangOrLocale = function(l)
        {
            var d = null;
            for (var i=0; i<this._localized_strings.length; i++)
            {
                if (   this._localized_strings[i].locale == l
                    || this._localized_strings[i].lang   == l)
                {
                    d = this._localized_strings[i];
                    break;
                }
            }
            return d;
        };
    }

    LocalizedStringsProxy.prototype.Init = function()
    {
        var cb = function(o) { this._localized_strings = o; this._ProcessQueue(); }.bind(this);
        _LocalizedStringsProxy_GetJSONAsync("localized_strings.json", cb);
    };

    LocalizedStringsProxy.prototype.GetMenuStrings = function(s, cb) { this._GetStringsOrEnqueue(s, cb); };

    LocalizedStringsProxy.prototype._ProcessQueue = function()
    {
        for (var i=0; i<this._queue.length; i++)
        {
            this._queue[i]();
        }//for

        this._queue = new Array();
    };

    LocalizedStringsProxy.prototype._GetStringsOrEnqueue = function(l, cb)
    {
        var fx = function()
        {
            var s = this._GetStringsForLangOrLocale(l);
            if (s == null) s = this._GetStringsForLangOrLocale("en");
            cb(s);
        }.bind(this);

        if (this._localized_strings != null) { fx(); }
        else { this._queue.push(fx); }
    };
    
    var _LocalizedStringsProxy_GetJSONAsync = function(url, cb) {
        var jsoncb = function(response) {
            if (response != null && response.length > 0) {
                var obj = null;
                try { obj = JSON.parse(response); }
                catch (err) { console.log("LocalizedStringsProxy: JSON parsing exception."); }
                if (obj != null) { cb(obj); }
            }//if
            else { console.log("LocalizedStringsProxy: Error getting polys from URL: %s", url); }
        };
        var req = new XMLHttpRequest();
        req.open("GET", url + "?t=" + Date.now(), true);
        req.onreadystatechange = function() { if (req.readyState === 4 && req.status == 200) { jsoncb(req.response); } };
        req.send(null);
    };

    return LocalizedStringsProxy;
})();








// ===============================================================================================
// ========================================= PREF HELPER =========================================
// ===============================================================================================
//
var PrefHelper = (function()
{
    function PrefHelper()
    {
    }

    var _GetPrefStr = function(key, def)
    {
        var s = localStorage.getItem(key);
        return s == null ? def : s;
    };

    var _SetPrefStr = function(key, val)
    {
        localStorage.setItem(key, val);
    };

    var _GetPrefBln = function(key, def)
    {
        var s = localStorage.getItem(key);
        return s == null ? def : s == "1";
    };

    var _SetPrefBln = function(key, val)
    {
        localStorage.setItem(key, val ? "1" : "0");
    };

    var _GetPrefInt = function(key, def)
    {
        var s = localStorage.getItem(key);
        return s == null ? def : parseInt(s);
    };

    var _SetPrefInt = function(key, val)
    {
        localStorage.setItem(key, ""+val);
    };

    var _GetPrefF64 = function(key, def)
    {
        var s = localStorage.getItem(key);
        return s == null ? def : parseFloat(s);
    };

    var _SetPrefF64 = function(key, val)
    {
        localStorage.setItem(key, ""+val);
    };

    PrefHelper.UnderscoresToCamelCase = function(src)
    {
        var d = "";
        var p = src.split("_");

        for (var i=0; i<p.length; i++)
        {
            d += p[i].substring(0,1).toUpperCase() + p[i].substring(1, p[i].length).toLowerCase();
        }//for

        return d;
    };

    PrefHelper.MakeFx = function()
    {
        var  d = !_nua("mobile") && !_nua("iPhone") && !_nua("iPad") && !_nua("Android");
        var gp = function(t,k,d) { return t == 0 ? function() { return _GetPrefBln(k, d); }
                                        : t == 1 ? function() { return _GetPrefInt(k, d); }
                                        : t == 2 ? function() { return _GetPrefF64(k, d); }
                                        :          function() { return _GetPrefStr(k, d); }; };
        var sp = function(t,k) { return t == 0 ? function(s) { return _SetPrefBln(k, s); }
                                      : t == 1 ? function(s) { return _SetPrefInt(k, s); }
                                      : t == 2 ? function(s) { return _SetPrefF64(k, s); }
                                      :          function(s) { return _SetPrefStr(k, s); }; };
        var o = [["RETICLE_ENABLED",  0,0], ["ZOOM_BUTTONS_ENABLED",0,1], ["SCALE_ENABLED",   0,1], ["HDPI_ENABLED",     0,1], 
                 ["NN_SCALER_ENABLED",0,1], ["TILE_SHADOW_ENABLED", 0,0], ["EXPANDED_LAYERS", 0,1], ["EXPANDED_LOGS",    0,1], 
                 ["EXPANDED_REALTIME",0,1], ["EXPANDED_AREAS",      0,1], ["EXPANDED_BASEMAP",0,0], ["EXPANDED_ADVANCED",0,0],
                 ["LAYER_UI_INDEX",   1,0], ["BASEMAP_UI_INDEX",    1,0], ["LAYERS_MORE",     0,0], ["BASEMAP_MORE",     0,0], 
                 ["MENU_OPEN",        0,0], ["TOOLTIPS_ENABLED",    0,d], 
                 ["LANGUAGE",         3,null],
                 ["VISIBLE_EXTENT_X",2,140.515516], ["VISIBLE_EXTENT_Y",2,37.316113], ["VISIBLE_EXTENT_Z",1,9]];
        for (var i=0; i<o.length; i++)
        {
            var fn0 = PrefHelper.UnderscoresToCamelCase(o[i][0]);
            PrefHelper["Get" + fn0 + "Pref"] = gp(o[i][1], "PREF_" + o[i][0], o[i][1] != 0 ? o[i][2] : o[i][2] != 0);
            PrefHelper["Set" + fn0 + "Pref"] = sp(o[i][1], "PREF_" + o[i][0]);
        }//for
    };

    PrefHelper.GetAreaGroupXEnabledPref = function(x)   { return _GetPrefBln("PREF_AREA_GROUP_"+x+"_ENABLED",    true); };
    PrefHelper.SetAreaGroupXEnabledPref = function(x,s) {        _SetPrefBln("PREF_AREA_GROUP_"+x+"_ENABLED",    s);    };
    PrefHelper.GetAreaXEnabledPref      = function(x)   { return _GetPrefBln("PREF_AREA_"      +x+"_ENABLED",    true); };
    PrefHelper.SetAreaXEnabledPref      = function(x,s) {        _SetPrefBln("PREF_AREA_"      +x+"_ENABLED",    s);    };
    PrefHelper.GetExpandedXPref         = function(x)   { return _GetPrefBln("PREF_EXPANDED_"  +x.toUpperCase(), true); };
    PrefHelper.SetExpandedXPref         = function(x,s) {        _SetPrefBln("PREF_EXPANDED_"  +x.toUpperCase(), s);    };

    PrefHelper.GetEffectiveLanguagePref = function()
    {
        var s = PrefHelper.GetLanguagePref();

        if (s == null)
        {
            s = (new Date()).getTimezoneOffset() == -540 ? "ja" : "en"; // JST
            PrefHelper.SetLanguagePref(s); // 2016-09-20 ND: Fix for travelling issue
        }//if

        return s;
    };

    return PrefHelper;
})();






// ===============================================================================================
// ======================================== SLIDEOUT MENU ========================================
// ===============================================================================================
//
// Rewrite of https://github.com/Mango/slideout/blob/master/dist/slideout.js
//
// As most of the functionality went unused, it was possible to condense the portions that were into much less code.
// It has it also been inlined into this file, saving an additional HTTP request.
//
var Slideout = (function()
{
    var html   = window.document.documentElement;

    function Slideout(options) 
    {
        options = options || {};
  
        this._currentOffsetX = 0;
        this._opened         = false;
  
        this.panel = options.panel;
        this.menu  = options.menu;

        if (this.panel.className.search("slideout-panel") === -1) { this.panel.className += " slideout-panel"; }
        if (this.menu.className.search("slideout-menu")   === -1) { this.menu.className  += " slideout-menu";  }

        this._fx           = options.fx || "ease";
        this._duration     = parseInt(options.duration, 10) || 300;
        this._translateTo  = parseInt(options.padding, 10) || 256;
        this._orientation  = options.side === "right" ? -1 : 1;
        this._translateTo *= this._orientation;
    }


    Slideout.prototype.open = function() 
    {
        var self = this;

        if (html.className.search("slideout-open") === -1) 
        { 
            html.className += " slideout-open"; 
        }//if

        this._setTransition();
        this._translateXTo(this._translateTo);
        this._opened = true;

        setTimeout(function() 
        {
            self.panel.style.transition = "";
            self.panel.style["-webkit-transition"] = "";
        }, this._duration + 50);

        return this;
    };


    Slideout.prototype._setTransition = function() 
    {
        var t = "transform " + this._duration + "ms " + this._fx;

        this.panel.style["-webkit-transition"] = "-webkit-" + t;
        this.panel.style.transition = t;

        return this;
    };


    Slideout.prototype._translateXTo = function(translateX) 
    {
        var t = "translateX(" + translateX + "px)";

        this._currentOffsetX = translateX;

        this.panel.style["-webkit-transform"] = t;
        this.panel.style.transform = t;

        return this;
    };


    Slideout.prototype.close = function() 
    {
        var self = this;

        if (!this.isOpen()) 
        {
            return this;
        }//if

        this._setTransition();
        this._translateXTo(0);
        this._opened = false;

        setTimeout(function() {
            html.className = html.className.replace(/ slideout-open/, "");
            self.panel.style.transition = "";
            self.panel.style["-webkit-transition"] = "";
            self.panel.style["-webkit-transform"] = "";
            self.panel.style.transform = "";
        }, this._duration + 50);
        
        return this;
    };


    Slideout.prototype.toggle = function() 
    {
        return this.isOpen() ? this.close() : this.open();
    };


    Slideout.prototype.isOpen = function() 
    {
        return this._opened;
    };


    return Slideout;
})();








// ===============================================================================================
// ========================================= MENU HELPER =========================================
// ===============================================================================================
//
// Inits, formatting, event binds/handlers, prefs, etc for the slideout menu.
//
// MenuHelper differs from MenuHelperStub in that what is defined here will not break anything else
// if it takes some time to load or initialize.  The menu will not be visible to the user until this
// completes.
//
var MenuHelper = (function()
{
    function MenuHelper()
    {
    }


    var _RebindGroupLabels = function(gs)
    {
        for (var i=0; i<gs.length; i++)
        {
            var el = gs[i].parent_id == null ? ElGet("lblMenuAreaGroups" + gs[i].group_id + "Title")
                                             : ElGet("menu_area_groups_" + gs[i].group_id + "_label");
            if (el != null)
            {
                el.innerHTML = _mapPolysProxy.GetLocalizedPolyString(gs[i], "desc");
            }//if
        }//for
    };


    var _RebindPolyLabels = function(eps)
    {
        for (var i=0; i<eps.length; i++)
        {
            var span0 = ElGet("menu_areas_" + eps[i].poly_id + "_label");
            
            if (span0 != null)
            {
                span0.innerHTML = _mapPolysProxy.GetLocalizedPolyString(eps[i], "desc");
            }//if
        }//for
    };


    var _GetDynamicAreaSectionIds = function()
    {
        var gs = _mapPolysProxy.GetGroups();
        var  d = new Array();

        for (var i=0; i<gs.length; i++)
        {
            if (gs[i].parent_id == null)
            {
                var base_name    = "area_groups_" + gs[i].group_id;
                var cc_base_name = PrefHelper.UnderscoresToCamelCase(base_name);
                d.push("sectionMenu" + cc_base_name);
            }//if
        }//for

        return d;
    };


    var _CreateSection = function(base_name, label_txt, insert_before_node_id, is_layer_pseudochild)
    {
        var sec = ElCr("section");
        var h3  = ElCr("h3");
        var span = ElCr("span");
        var div = ElCr("div");
        var ul = ElCr("ul");

        var cc_base_name = PrefHelper.UnderscoresToCamelCase(base_name);

        sec.className = "menu-section";
        sec.id = "sectionMenu" + cc_base_name;
        h3.className = "menu-section-title";
        span.className = "btn_accordion";
        span.id = "lblMenu" + cc_base_name + "Title";
        span.innerHTML = label_txt;
        div.className = "div_accordion";
        ul.className = "menu-section-list";
        ul.id = "ul_menu_" + base_name;
        
        // hack because of some weird bug in Chrome that drops GPU compositing
        sec.style["-webkit-transform"] = "translateZ(0px)";
        sec.style.transform = "translateZ(0px)";

        sec.appendChild(h3);
        h3.appendChild(span);
        sec.appendChild(div);
        div.appendChild(ul);

        var muh_ibn = ElGet(insert_before_node_id);

        muh_ibn.parentNode.insertBefore(sec, muh_ibn);
        
        // <init expand>
        /*
        span.setAttribute("value", "" + base_name);
        span.addEventListener("click", function()
        {
            var el = 
            var v = this.getAttribute("value");
            PrefHelper.SetExpandedXPref(v, !this.classList.contains("active"));
        }.bind(span), false);
        
        if (PrefHelper.GetExpandedXPref(base_name))
        {
            span.classList.toggle("active");
            span.parentElement.nextElementSibling.classList.toggle("show");
        }//if
        */
        // </init expand>
        
        _InitExpandWithBaseName("lblMenu" + cc_base_name + "Title", base_name, PrefHelper.GetExpandedXPref, PrefHelper.SetExpandedXPref);

        if (is_layer_pseudochild)
        {
            _InitLayers_ApplyVisibilityStylesToSectionsById(["sectionMenu" + cc_base_name]);
        }//if
    };


    var _CreateItemWithSwitch = function(base_name, div_value, label_txt, ul_id, is_checked, fx_chk_changed)
    {
        var ul = ElGet(ul_id);

        if (ul_id == null)
        {
            console.log("MenuHelper._CreateItemWithSwitch: bad ul_id=[%s], aborted.", ul_id);
            return;
        }//if

        var base_name_cc = PrefHelper.UnderscoresToCamelCase(base_name);

        var li   = ElCr("li");
        var div0 = ElCr("div");
        var span0 = ElCr("span");
        var div1 = ElCr("div");
        var chk = ElCr("input");
        var div2 = ElCr("div");
        var div3 = ElCr("div");

        div0.id = "menu_" + base_name;
        div0.className = "menu-prefs-chk-item";
        div0.setAttribute("value", "" + div_value);
        span0.id = "menu_" + base_name + "_label";
        span0.innerHTML = label_txt;
        chk.id = "chkMenu" + base_name_cc;
        chk.type = "checkbox";
        chk.className = "ios-switch scgreen bigswitch";
        chk.checked = is_checked;

        li.appendChild(div0);
        div0.appendChild(span0);
        div0.appendChild(div1);
        div1.appendChild(chk);
        div1.appendChild(div2);
        div2.appendChild(div3);
        ul.appendChild(li);

        div0.addEventListener("click", function() 
        {
            var v = parseInt(this.getAttribute("value"));
            fx_chk_changed(v); 
        }.bind(div0), false);
    };


    var _RegisterGroupAsSection = function(group)
    {
        var base_name = "area_groups_" + group.group_id;
        var txt = _mapPolysProxy.GetLocalizedPolyString(group, "desc");

        _CreateSection(base_name, txt, "muh_insert_before_menu_layers_node", true);
    };


    var _RegisterGroupAsItem = function(group, ul_id)
    {
        var base_name = "area_groups_" + group.group_id;
        var txt = _mapPolysProxy.GetLocalizedPolyString(group, "desc");
        var is_enabled = PrefHelper.GetAreaGroupXEnabledPref(group.group_id);

        var cb = function(gid)
        {
            var s = PrefHelper.GetAreaGroupXEnabledPref(gid);

            ElGet("chkMenuAreaGroups" + gid).checked = !s;

            PrefHelper.SetAreaGroupXEnabledPref(gid, !s);

            var eps = _mapPolysProxy.GetEncodedPolygons();
            var p2s = new Array();

            for (var i=0; i<eps.length; i++)
            {
                if (eps[i].group_id == gid
                    && (   ( s &&  _mapPolysProxy.Exists(eps[i].poly_id))
                        || (!s && !_mapPolysProxy.Exists(eps[i].poly_id)))
                   )
                {
                    p2s.push(eps[i].poly_id);
                }//if
            }//for

            for (var i=0; i<p2s.length; i++)
            {
                if (s)
                {
                    _mapPolysProxy.Remove(p2s[i]);
                    PrefHelper.SetAreaXEnabledPref(p2s[i], !s);
                }//if
                else
                {
                    _mapPolysProxy.Add(p2s[i]);
                    PrefHelper.SetAreaXEnabledPref(p2s[i], !s);
                }//else
            }//for
        };

        _CreateItemWithSwitch(base_name, group.group_id, txt, ul_id, is_enabled, cb);

        if (is_enabled)
        {
            var _eps = _mapPolysProxy.GetEncodedPolygons();

            for (var i=0; i<_eps.length; i++)
            {
                if (_eps[i].group_id == group.group_id)
                {
                    _mapPolysProxy.Add(_eps[i].poly_id);
                }//if
            }//for
        }//if
    };


    var _RegisterPolyAsItem = function(ep, ul_id)
    {
        var base_name = "areas_" + ep.poly_id;
        var txt = _mapPolysProxy.GetLocalizedPolyString(ep, "desc");
        var is_enabled = PrefHelper.GetAreaXEnabledPref(ep.poly_id);

        var cb = function(pid)
        {
            var s = _mapPolysProxy.Exists(pid);

            if (s)
            {
                _mapPolysProxy.Remove(pid);
            }//if
            else
            {
                _mapPolysProxy.Add(pid);
            }//else

            ElGet("chkMenuAreas" + pid).checked = !s;

            PrefHelper.SetAreaXEnabledPref(pid, !s);

            var ps = _mapPolysProxy.GetPolygons();
            var ex = null;
            var tx = null;
            var minz;

            for (var i=0; i<ps.length; i++)
            {
                if (ps[i].ext_poly_id == pid)
                {
                    tx = _mapPolysProxy.GetLocalizedPolyValue(ps[i], "ext_poly_desc")[0];
                    ex = ps[i].ext_poly_extent != null ? ps[i].ext_poly_extent 
                                                       : { x0:ps[i].getPosition().lng() - 0.01, 
                                                           y0:ps[i].getPosition().lat() - 0.01,
                                                           x1:ps[i].getPosition().lng() + 0.01, 
                                                           y1:ps[i].getPosition().lat() + 0.01 };
                    minz = ps[i].ext_poly_extent != null ? 8 : 10;
                    break;
                }//if
            }//for

            if (ex != null)
            {
                _flyToExtentProxy.GoToLocationWithTextIfNeeded(ex.x0, ex.y0, ex.x1, ex.y1, minz, 21, tx);
            }//if
        };

        _CreateItemWithSwitch(base_name, ep.poly_id, txt, ul_id, is_enabled, cb);

        if (is_enabled)
        {
            _mapPolysProxy.Add(ep.poly_id);
        }//if
    };


    var _RegisterGroups = function(gs)
    {
        // 1. Create all root-level nodes (without parents)

        for (var i=0; i<gs.length; i++)
        {
            if (gs[i].parent_id == null)
            {
                _RegisterGroupAsSection(gs[i]);
            }//if
        }//for

        // 2. Create the rest.  Not recursive at this time.

        for (var i=0; i<gs.length; i++)
        {
            if (gs[i].parent_id != null)
            {
                _RegisterGroupAsItem(gs[i], "ul_menu_" + "area_groups_" + gs[i].parent_id);
            }//if
        }//for
    };


    var _RegisterPolys = function(eps)
    {
        for (var i=0; i<eps.length; i++)
        {
            var ul_id = "ul_menu_" + "area_groups_" + eps[i].group_id;
            var ul = ElGet(ul_id);

            // assuming groups are registered first, ul will be null if the group
            // is an aggregate item, thus the poly menu item will not be bound
            // individually (as intended)

            if (ul != null)
            {
                _RegisterPolyAsItem(eps[i], ul_id);
            }//if
        }//for
    };


    MenuHelper.RegisterGroupsAndPolys = function(gs, eps)
    {
        _RegisterGroups(gs);
        _RegisterPolys(eps);
    };
    
    // should only be called after safemap.js is loaded
    //MenuHelper.InitLoadAsync = function()
    MenuHelper.Init = function()
    {
        slideout = new Slideout({
            "panel": document.getElementById("panel"),
            "menu": document.getElementById("menu"),
            "padding": 256,
            "tolerance": 70
        });

        _InitLanguage();
        _InitEvents();
        //_InitTooltips();

        setTimeout(function() {
            MenuHelper.SyncBasemap();
            _InitLayers_ApplyVisibilityStyles();
            _InitBasemap_ApplyVisibilityStyles();
            ElGet("menu").style.removeProperty("display");
        }, 50);

        setTimeout(function() {
            ElGet("menu-header").style.backgroundImage = "url('schoriz_362x44.png')";
        }, 200);

        setTimeout(_InitReticleFromPref, 250);
        setTimeout(_InitAdvancedSection, 500);

        ElGet("logo2").style.visibility = "visible";
            
        if (PrefHelper.GetMenuOpenPref() && !slideout.isOpen())
        {
            setTimeout(function() {
                _OpenAnimationHack();
                slideout.toggle();
            }, 501);
        }//if
    };


    var _InitExpandWithBaseName = function(el_id, base_name, fxGet, fxSet)
    {
        var el = ElGet(el_id);

        el.addEventListener("click", function()
        {
            fxSet(base_name, !el.classList.contains("active")); // this event is wired before the one that toggles the state onclick
            el.classList.toggle("active");
            el.parentElement.nextElementSibling.classList.toggle("show");
        }, false);

        if (fxGet(base_name))
        {
            el.classList.toggle("active");
            el.parentElement.nextElementSibling.classList.toggle("show");
        }//if
    };


    var _InitExpand = function(el_id, fxGet, fxSet)
    {
        var el = ElGet(el_id);

        el.addEventListener("click", function()
        {
            fxSet(!el.classList.contains("active")); // this event is wired before the one that toggles the state onclick
        }, false);

        if (fxGet())
        {
            el.classList.toggle("active");
            el.parentElement.nextElementSibling.classList.toggle("show");
        }//if
    };


    var _GetTooltipsRefs = function()
    {
        // Static defs in index.html don't work with dynamically created menu items,
        // and load unncessary things on mobile.  So this is done here.

        // NOTE: when maintaining the spritesheet, there are three "sections" that the
        // code takes advantages of:
        // 1. Static defs
        // 2. Raster layers
        // 3. Basemaps
        // Therefore, to add something that isn't a raster layer or a basemap, you must
        // enlarge the spritesheet canvas by 256px in height, then create a 256px space
        // after the current static def images by shifting sections 2 and 3 down by 256px.

        var s = [ { n:"reticle",      x0:32,  y0:85,
                                      x1:288, y1:85 },
                  { n:"scale",        x0:0,   y0:256,
                                      x1:256, y1:256 },
                  { n:"zoom_buttons", x0:64,  y0:640,
                                      x1:320, y1:640 },
                  { n:"hdpi",         x0:32,  y0:832,
                                      x1:288, y1:832 },
                  { n:"nnscaler",     x0:64,  y0:1152,
                                      x1:320, y1:1152 },
                  { n:"tile_shadow",  x0:32,  y0:1344,
                                      x1:288, y1:1344 },
                  { n:"apiquery",     x0:32,  y0:1600,
                                      x1:256, y1:1636 },
                  { n:"realtime_0",   x0:32,  y0:1856,
                                      x1:288, y1:1856 },
                  { n:"logs_0",       x0:0,   y0:2076,
                                      x1:288, y1:2112 },
                  { n:"logs_2",       x0:32,  y0:2368,
                                      x1:288, y1:2368 },
                  { n:"logs_3",       x0:32,  y0:2624,
                                      x1:288, y1:2624 },
                  { n:"logs_1",       x0:32,  y0:2880,
                                      x1:288, y1:2880 } ];
                  //{ n:"areas_0",      x0:32,  y0:3136,
                  //                    x1:288, y1:3136 } ];

        for (var i=0; i<s.length; i++)
        {
            s[i].need_create = false; // flag the static defs in index.html as already created
        }//for

        var sl = [0,1,2,12,8,9,3,4,5,6];
        var sb = [0,1,2,3,4,5,6,7,8,9,10,11,12,13,14];
        var y  = 3136 + 256; // <-- reuses last y-value from the static section
    
        // fill in rest of element name refs / positions for layers and basemaps
        // dynamically instead of hardcoding everything.
    
        for (var i=0; i<sl.length; i++)
        {
            s.push({n:("layers_" + sl[i]), need_create:true, x0:32, y0:y, x1:288, y1:y});
            y += 256;
        }//for
    
        for (var i=0; i<sb.length; i++)
        {
            s.push({n:("basemap_" + sb[i]), need_create:true, x0:32, y0:y, x1:288, y1:y});
            y += 256;
        }//for
        
        return s;
    };


    var _GetTooltipsParentRefs = function()
    {
        // static index.html-defined elements that should have event listeners added for the tooltips
        return ["hud_btnToggle", "menu_realtime_0", "menu_scale", "menu_zoom_buttons", "menu_hdpi", "menu_nnscaler", "menu_tile_shadow", "menu_logs_0", "menu_logs_1", "menu_logs_2", "menu_logs_3", "menu_apiquery"];
    };


    var _InitTooltips = function()
    {
        var s  = _GetTooltipsRefs();
        var sp = _GetTooltipsParentRefs();

        for (var i=0; i<sp.length; i++)
        {
            ElGet(sp[i]).parentElement.className += " tooltip";
        }//for
    
        // note: layers and basemap elements are not present in index.html, meaning
        // some additional work is required before the tooltip images can be set.
    
        for (var i=0; i<s.length; i++)
        {
            if (s[i].need_create)
            {
                var el = ElGet("menu_" + s[i].n);
                el.parentElement.className += " tooltip";
        
                var s0 = ElCr("span");
                s0.className += " tooltiptext-bottom";
        
                var d0 = ElCr("div");
                d0.style.position = "relative";
        
                var e0 = ElCr("span");
                e0.id = "menu_tooltip_" + s[i].n + "_off";
                e0.className += " tooltiptext-off";
        
                var e1 = ElCr("span");
                e1.id = "menu_tooltip_" + s[i].n + "_on";
                e1.className += " tooltiptext-on";
        
                d0.appendChild(e0);
                d0.appendChild(e1);
                s0.appendChild(d0);
                el.parentElement.appendChild(s0);
            }//if
        }//for
        
        // apply positioning hacks
        
        for (var i=0; i<s.length; i++)
        {
            if (s[i].n == "layers_0" || s[i].n == "layers_1" || s[i].n == "layers_8" || s[i].n == "layers_9"
                || s[i].n.indexOf("basemap_") > -1)
            {
                s[i].y1 -= 15;
            }//if
            else if (s[i].n == "layers_12")
            {
                s[i].y0 -= 15;
            }//else if
            else if (s[i].n == "layers_3")
            {
                s[i].y1 -= 8;
            }//else if
        }//for
    
        // now, set the styles/spritesheet URL for all the elements with a tooltip
    
        var ss = "menu_tooltips_512x9728.png";
    
        for (var i=0; i<s.length; i++)
        {
            var o = s[i];
            var e0 = ElGet("menu_tooltip_" + o.n + "_off");
            var e1 = ElGet("menu_tooltip_" + o.n + "_on");
            e0.style.background = "url(" + ss + ") -" + o.x0 + "px -" + o.y0 + "px";
            e1.style.background = "url(" + ss + ") -" + o.x1 + "px -" + o.y1 + "px";
        }//for
    };
    
    
    var _DisableTooltips = function()
    {
        var s  = _GetTooltipsRefs();
        var sp = _GetTooltipsParentRefs();

        for (var i=0; i<sp.length; i++)
        {
            ElGet(sp[i]).parentElement.className = ElGet(sp[i]).parentElement.className.replace(/tooltip/, "");
        }//for

        for (var i=0; i<s.length; i++)
        {
            var o = s[i];
            ElGet("menu_tooltip_" + o.n + "_off").style.removeProperty("background");
            ElGet("menu_tooltip_" + o.n + "_on").style.removeProperty("background");
        }//for

        for (var i=0; i<s.length; i++)
        {
            if (s[i].need_create)
            {
                var el = ElGet("menu_" + s[i].n);
                el.parentElement.className = el.parentElement.className.replace(/tooltip/, "");
                var sps = el.parentElement.getElementsByTagName("span");
                var sp = null;
                for (var j=0; j<sps.length; j++)
                {
                    if (   sps[j].className.indexOf("tooltiptext-bottom") > -1
                        || sps[j].className.indexOf("tooltiptext-top")    > -1)
                    {
                        sp = sps[j];
                        break;
                    }//if
                }//for
                
                if (sp != null)
                {
                    el.parentElement.removeChild(sp);
                }//if
            }//if
        }//for
    };
    

    // binds misc UI events, can be init immediately
    var _InitEvents = function()
    {
        document.querySelector(".js-slideout-toggle").addEventListener("click", function(e) 
        {
            PrefHelper.SetMenuOpenPref(!slideout.isOpen());
        
            if (slideout.isOpen()) 
            {
                MenuHelper.CloseAnimationHack();
                slideout.toggle();
            }//if
            else
            {
                _OpenAnimationHack();
                setTimeout(function() {
                    slideout.toggle();
                }, 17);
            }//else
        }, false);

        // document.querySelector(".menu").addEventListener("click", function(e) { if (e.target.nodeName === "A") { MenuHelper.CloseAnimationHack(); slideout.close(); } }, false);

        if (!_nua("mobile") && !_nua("iPhone") && !_nua("iPad") && !_nua("Android"))
        {
            AListId("hud_btnToggle", "mouseover", function() 
            {
                var s = ElGet("imgMenuReticle").style;
                s.opacity           = "1.0";
                s.filter            = "url(#sc_colorize)"; 
                s["-webkit-filter"] = "url(#sc_colorize)"; 
            });

            AListId("hud_btnToggle", "mouseout",  function() 
            {
                var s = ElGet("imgMenuReticle").style;
                s.removeProperty("opacity");
                s.removeProperty("filter");
                s.removeProperty("-webkit-filter");
            });
        }//if

        // nb: InitExpand must go before the general btn_accordion wireup.
        _InitExpand("lblMenuLayersTitle",   PrefHelper.GetExpandedLayersPref,   PrefHelper.SetExpandedLayersPref);
        _InitExpand("lblMenuLogsTitle",     PrefHelper.GetExpandedLogsPref,     PrefHelper.SetExpandedLogsPref);
        _InitExpand("lblMenuRealtimeTitle", PrefHelper.GetExpandedRealtimePref, PrefHelper.SetExpandedRealtimePref);
        _InitExpand("lblMenuBasemapTitle",  PrefHelper.GetExpandedBasemapPref,  PrefHelper.SetExpandedBasemapPref);
        _InitExpand("lblMenuAdvancedTitle", PrefHelper.GetExpandedAdvancedPref, PrefHelper.SetExpandedAdvancedPref);

        var acc = document.getElementsByClassName("btn_accordion");

        for (var i = 0; i < acc.length; i++) 
        {
            acc[i].addEventListener("click", function(e)
            {
                this.classList.toggle("active");
                this.parentElement.nextElementSibling.classList.toggle("show");
            }, false);
        }//for
    };


    // requires safemap.js load
    var _InitAdvancedSection = function()
    {            
        if (window.devicePixelRatio < 1.5) 
        {
            ElGet("menu_hdpi").parentElement.style.display = "none";
        }//if
        else if (!PrefHelper.GetHdpiEnabledPref())
        {
            // todo: move to layer init(?)
            _no_hdpi_tiles = true;
            overlayMaps = null;
            ClientZoomHelper.InitGmapsLayers();
            LayersHelper.SyncSelectedWithMap();
            ClientZoomHelper.SynchronizeLayersToZoomLevel(SafemapUtil.GetMapInstanceYXZ().z);
        }//else
        ElGet("chkMenuHdpi").checked = !_no_hdpi_tiles;
        ElGet("menu_hdpi").addEventListener("click", function()
        {
            _no_hdpi_tiles = !_no_hdpi_tiles;
            overlayMaps = null;
            ClientZoomHelper.InitGmapsLayers();
            LayersHelper.SyncSelectedWithMap();
            ClientZoomHelper.SynchronizeLayersToZoomLevel(SafemapUtil.GetMapInstanceYXZ().z);
            ElGet("chkMenuHdpi").checked = !_no_hdpi_tiles;
            PrefHelper.SetHdpiEnabledPref(!_no_hdpi_tiles);
        }, false);


        var fxScaleVis = function(v)
        {
            if (v)
            { 
                ElGet("scale").style.removeProperty("display");
                ElGet("scale").style.backgroundImage = "url('scales64_240x854.png')";
            }//if
            else
            {
                ElGet("scale").style.display = "none"; 
                ElGet("scale").style.removeProperty("background-image");
            }//else
        };
        if (PrefHelper.GetScaleEnabledPref())
        {
            setTimeout(function() {
                fxScaleVis(true);
            }, 250);
        }//if
        ElGet("chkMenuScale").checked = PrefHelper.GetScaleEnabledPref();
        ElGet("menu_scale").addEventListener("click", function()
        {
            var v = ElGet("scale").style.display != "none";
            fxScaleVis(!v);
            ElGet("chkMenuScale").checked = !v;
            PrefHelper.SetScaleEnabledPref(!v);
        }, false);


        if (   (!PrefHelper.GetNnScalerEnabledPref() && _img_scaler_idx  > 0)
            || ( PrefHelper.GetNnScalerEnabledPref() && _img_scaler_idx == 0))
        {
            SafemapUI.ToggleScaler();
        }//if
        ElGet("chkMenuNnScaler").checked = _img_scaler_idx > 0;
        ElGet("menu_nnscaler").addEventListener("click", function()
        {
            SafemapUI.ToggleScaler();
            ElGet("chkMenuNnScaler").checked = _img_scaler_idx > 0;
            PrefHelper.SetNnScalerEnabledPref(_img_scaler_idx > 0);
        }, false);


        ElGet("chkMenuRealtime0").checked = true;
        ElGet("menu_realtime_0").addEventListener("click", function()
        {
            var e = false;
            if (_rtvm != null && _rtvm.GetMarkerCount() > 0)
            {
                _rtvm.RemoveAllMarkersFromMapAndPurgeData();
                _rtvm.ClearGmapsListeners();
                _rtvm.SetEnabled(false);
            }//if
            else if (_rtvm != null)
            {
                _rtvm.InitMarkersAsync();
                _rtvm.AddGmapsListeners();
                _rtvm.SetEnabled(true);
                e = true;
            }//else
            ElGet("chkMenuRealtime0").checked = e;
        }, false);


        ElGet("chkMenuZoomButtons").checked = map.zoomControl;
        ElGet("menu_zoom_buttons").addEventListener("click", function()
        {
            var s = !map.zoomControl;
            map.setOptions({zoomControl:s});
            ElGet("chkMenuZoomButtons").checked = s;
            PrefHelper.SetZoomButtonsEnabledPref(s);
        }, false);


        if (PrefHelper.GetTileShadowEnabledPref())
        {
            SafemapUI.ToggleTileShadow();
        }//if
        ElGet("chkMenuTileShadow").checked = _img_tile_shadow_idx > 0;
        ElGet("menu_tile_shadow").addEventListener("click", function()
        {
            SafemapUI.ToggleTileShadow();
            ElGet("chkMenuTileShadow").checked = _img_tile_shadow_idx > 0;
            PrefHelper.SetTileShadowEnabledPref(_img_tile_shadow_idx > 0);
        }, false);


        if (_nua("mobile") || _nua("iPhone") || _nua("iPad") || _nua("Android"))
        {
            ElGet("menu_tooltips").parentElement.style.display = "none";
        }//if
        else
        {
            if (PrefHelper.GetTooltipsEnabledPref())
            {
                _InitTooltips();
            }//if
            ElGet("chkMenuTooltips").checked = PrefHelper.GetTooltipsEnabledPref();
            ElGet("menu_tooltips").addEventListener("click", function()
            {
                var te = PrefHelper.GetTooltipsEnabledPref();

                if (te)
                {
                    _DisableTooltips();
                }//if
                else
                {
                    _InitTooltips();
                }//else

                ElGet("chkMenuTooltips").checked = !te;
                PrefHelper.SetTooltipsEnabledPref(!te);
            }, false);
        }//else


        ElGet("menu_apiquery").addEventListener("click", function()
        {
            var yx = SafemapUtil.GetNormalizedMapCentroid();
            SafemapUI.QuerySafecastApiAsync(yx.y, yx.x, map.getZoom());
        }, false);
    };

    // requires binds for layers and basemaps 
    var _InitLabelsFromStrings = function(s)
    {
        ElGet("address").placeholder             = s.MENU_ADDRESS_PLACEHOLDER;
        ElGet("lblMenuToggleReticle").innerHTML  = s.MENU_TOGGLE_RETICLE_LABEL;
        ElGet("lblMenuLayersTitle").innerHTML    = s.MENU_LAYERS_TITLE;
        ElGet("lblMenuLayersMore").innerHTML     = s.MENU_LAYERS_MORE_LABEL;
        ElGet("lblMenuBasemapMore").innerHTML    = s.MENU_LAYERS_MORE_LABEL;
        ElGet("lblMenuLogsTitle").innerHTML      = s.MENU_LOGS_TITLE;
        ElGet("aMenuDonate").innerHTML           = s.MENU_DONATE_LABEL;
        ElGet("aMenuBlog").innerHTML             = s.MENU_BLOG_LABEL;
        ElGet("aMenuAbout").innerHTML            = s.MENU_ABOUT_LABEL;
        ElGet("lblMenuBasemapTitle").innerHTML   = s.MENU_BASEMAP_TITLE;
        ElGet("lblMenuAdvancedTitle").innerHTML  = s.MENU_ADVANCED_TITLE;
        ElGet("lblMenuHdpi").innerHTML           = s.MENU_HDPI_LABEL;
        ElGet("lblMenuScale").innerHTML          = s.MENU_SCALE_LABEL;
        ElGet("lblMenuNnScaler").innerHTML       = s.MENU_NN_SCALER_LABEL;
        ElGet("lblMenuZoomButtons").innerHTML    = s.MENU_ZOOM_BUTTONS_LABEL;
        ElGet("lblMenuTileShadow").innerHTML     = s.MENU_TILE_SHADOW_LABEL;
        ElGet("lblMenuTooltips").innerHTML       = s.MENU_TOOLTIPS_LABEL;
        ElGet("lblMenuApiQuery").innerHTML       = s.MENU_API_QUERY_CENTER_LABEL;
        ElGet("lblMenuRealtimeTitle").innerHTML  = s.MENU_REALTIME_TITLE;
        ElGet("menu_realtime_0_label").innerHTML = s.MENU_REALTIME_0_LABEL;
        
        if (PrefHelper.GetEffectiveLanguagePref() != "ja")
        {
            ElGet("tsPanelContentTitle").innerHTML      = s.SNAPSHOTS_CONTENT_TITLE;
            ElGet("tsPanelStartDateSubLabel").innerHTML = s.SNAPSHOTS_START_DATE_SUBTITLE;
            ElGet("tsPanelEndDateSubLabel").innerHTML   = s.SNAPSHOTS_END_DATE_SUBTITLE;
        }//if

        // layers    
        var a = MenuHelperStub.GetLayerIdxs_All();

        for (var i=0; i<a.length; i++)
        {
            ElGet("menu_layers_"+a[i]+"_label").innerHTML = s["MENU_LAYERS_"+a[i]+"_LABEL"];
            
            var dls =     s["MENU_LAYERS_"+a[i]+"_DATE_LABEL"];
            var dle = ElGet("menu_layers_"+a[i]+"_date_label");

            if (dls != null)
            {
                if (dls.length > 0) dle.innerHTML = dls;
            }//if
            else
            {
                dle.style.display = "none";
            }//else
        }//for

        // basemaps
        var b = MenuHelperStub.GetBasemapIdxs_All();

        for (var i=0; i<b.length; i++)
        {
            ElGet("menu_basemap_"+b[i]).innerHTML = s["MENU_BASEMAP_"+b[i]+"_LABEL"];
        }//for

        // logs
        var c = MenuHelperStub.GetLogIdxs_All();

        for (var i=0; i<c.length; i++)
        {
            ElGet("menu_logs_"+c[i]).innerHTML = s["MENU_LOGS_"+c[i]+"_LABEL"];
        }//for
        
        // areas
        _RebindPolyLabels(_mapPolysProxy.GetEncodedPolygons());
        _RebindGroupLabels(_mapPolysProxy.GetGroups());
    };


    var _InitBasemap_ApplyVisibilityStyles = function()
    {
        var a = MenuHelperStub.GetBasemapIdxs_NotAlways();

        for (var i=0; i<a.length; i++)
        {
            var el = ElGet("menu_basemap_" + a[i]);

            var ps = el.parentElement.style;
            ps.transition = "0.6s ease-in-out";

            if (!_ui_menu_basemap_more_visible && el.className != null && el.className.indexOf("menu_option_selected") == -1)
            {
                ps.maxHeight  = "0";
                ps.opacity    = "0";
                ps.overflow   = "hidden";
            }//if
        }//for
    };


    var _InitLayers_ApplyVisibilityStylesToSectionsById = function(sb)
    {
        for (var i=0; i<sb.length; i++)
        {
            var xs = ElGet(sb[i]).style;
            xs.transition = "0.6s ease-in-out";
            
            if (!_ui_menu_layers_more_visible)
            {
                xs.overflow  = "hidden";
                xs.maxHeight = "0";
                xs.opacity   = "0";
                xs.display   = "none";
            }//if
            else
            {
                xs.maxHeight = "65535px";
                xs.opacity   = "1";
            }//else
        }//for
    };

    // requires binds for layers
    var _InitLayers_ApplyVisibilityStyles = function()
    {
        var a = MenuHelperStub.GetLayerIdxs_NotAlways();

        for (var i=0; i<a.length; i++)
        {
            var el = ElGet("menu_layers_" + a[i]);

            var ps = el.parentElement.style;
            ps.transition = "0.6s ease-in-out";

            if (!_ui_menu_layers_more_visible && el.className != null && el.className.indexOf("menu_option_selected") == -1)
            {
                ps.maxHeight  = "0";
                ps.opacity    = "0";
                ps.overflow   = "hidden";
            }//if
        }//for
        
        if (_ui_menu_layers_more_visible)
        {
            var b = MenuHelperStub.GetLayerIdxs_Hidden();
            
            for (var i=0; i<b.length; i++)
            {
                var el = ElGet("menu_layers_" + b[i]);
                var ps = el.parentElement.style;
                ps.maxHeight  = "0";
                ps.opacity    = "0";
                ps.overflow   = "hidden";
            }//for
        }//if
        
        var sb = ["sectionMenuLogs", "sectionMenuRealtime"];//, "sectionMenuAreas"];

        _InitLayers_ApplyVisibilityStylesToSectionsById(sb);
    };

    // nb: this is disabled as resizing the GMaps content area breaks GMaps due to an internal bug
    var _OpenAnimationHack = function()
    {
        //ElGet("map_canvas").style.right = "0";
        ElGet("menu").style.removeProperty("display");
        //setTimeout(function() {
        //    ElGet("map_canvas").style.right = null;
        //}, 318);
    };

    // For some reason only the CSS3 open animation works when overriding slideout.js using
    // CSS styles.  At -256 x-shift there is no animation, but there is at -255 x-shift.
    // However -255 -> -256 doesn't work because it restarts the entire animation, so this
    // hack moves it to -255, then hides it, waits, moves it to -256 without animation, then
    // restores the original styles.
    MenuHelper.CloseAnimationHack = function()
    {
        ElGet("menu").style.transition = "0.3s";
        ElGet("menu").style["-webkit-transition"] = "0.3s";
        ElGet("menu").style.transform = "translateX(" + -255 + "px)";
        ElGet("scale").style.transform      = "translateX(0px)";
        ElGet("tsPanel").style.transform    = "translateX(0px)";

        setTimeout(function() {
            ElGet("menu").style.removeProperty("transition");
            ElGet("menu").style.removeProperty("-webkit-transition");
            ElGet("menu").style.display = "none";

            setTimeout(function() {
                ElGet("menu").style.removeProperty("transform");
                //ElGet("menu").style.removeProperty("display");
                ElGet("scale").style.removeProperty("transform");
                ElGet("tsPanel").style.removeProperty("transform");
            },300);
        }, 250);
    };
    
    
    MenuHelper.MoreBasemap_OnClick = function()
    {
        var a = MenuHelperStub.GetBasemapIdxs_Normal();
        
        _ui_menu_basemap_more_visible = !_ui_menu_basemap_more_visible;
        
        for (var i=0; i<a.length; i++)
        {
            var el = ElGet("menu_basemap_" + a[i]);
            var vis = _ui_menu_basemap_more_visible || (el.className != null && el.className.indexOf("menu_option_selected") > -1);
            el.parentElement.style.maxHeight = vis ? "65535px" : "0";
            el.parentElement.style.opacity   = vis ? "1"       : "0";
            el.parentElement.style.overflow  = vis ? "visible" : "hidden";
        }//for
        
        ElGet("chkMenuBasemapMore").checked = _ui_menu_basemap_more_visible;
        PrefHelper.SetBasemapMorePref(_ui_menu_basemap_more_visible);
    };


    MenuHelper.MoreLayers_OnClick = function()
    {
        var a = MenuHelperStub.GetLayerIdxs_Normal();

        _ui_menu_layers_more_visible = !_ui_menu_layers_more_visible;

        for (var i=0; i<a.length; i++)
        {
            var el = ElGet("menu_layers_" + a[i]);
            var vis = _ui_menu_layers_more_visible || (el.className != null && el.className.indexOf("menu_option_selected") > -1);
            el.parentElement.style.maxHeight = vis ? "65535px" : "0";
            el.parentElement.style.opacity   = vis ? "1"       : "0";
            el.parentElement.style.overflow  = vis ? "visible" : "hidden";
        }//for

        ElGet("chkMenuLayersMore").checked = _ui_menu_layers_more_visible;
        PrefHelper.SetLayersMorePref(_ui_menu_layers_more_visible);

        var sb = ["sectionMenuLogs", "sectionMenuRealtime"];//, "sectionMenuAreas"];
        var asb = _GetDynamicAreaSectionIds();
        for (var i=0; i<asb.length; i++)
        {
            sb.push(asb[i]);
        }//for

        var fxToggleLogStyles = function()
        {
            for (var i=0; i<sb.length; i++)
            {
                var el = ElGet(sb[i]);
                var vis = _ui_menu_layers_more_visible;
                el.style.maxHeight = vis ? "65535px" : "0";
                el.style.opacity   = vis ? "1"       : "0";
            }//for
        };

        var fxToggleLogVis = function()
        {
            if (_ui_menu_layers_more_visible)
            {
                for (var i=0; i<sb.length; i++)
                {
                    ElGet(sb[i]).style.removeProperty("display");
                    ElGet(sb[i]).style.removeProperty("overflow");
                }//for
            }//if
            else
            {
                for (var i=0; i<sb.length; i++)
                {
                    ElGet(sb[i]).style.display  = "none";
                    ElGet(sb[i]).style.overflow = "hidden";
                }//for
            }//else
        };

        if (_ui_menu_layers_more_visible)
        {
            fxToggleLogVis();
            setTimeout(fxToggleLogStyles, 18);
        }//if
        else
        {
            fxToggleLogStyles();
            setTimeout(fxToggleLogVis, 618);
        }//else
    };


    MenuHelper.ddlLanguage_OnChange = function()
    {
        var d = ElGet("ddlLanguage");
        var s = d.options[d.selectedIndex].value;
        PrefHelper.SetLanguagePref(s);
        _SetLanguage(s);

        var cb = function(ms) { alert(ms.MENU_LANGUAGE_CHANGE_TEXT); };
        _locStringsProxy.GetMenuStrings(s, cb);
    };


    var _SetLanguage = function(s)
    {
        var cb = function(ms) { _InitLabelsFromStrings(ms); };
        _locStringsProxy.GetMenuStrings(s, cb);
    };


    var _InitLanguage = function()
    {
        var s = PrefHelper.GetEffectiveLanguagePref();

        _SetLanguage(s);

        var d = ElGet("ddlLanguage");
        for (var i=0; i<d.options.length; i++)
        {
            if (d.options[i].value == s)
            {
                d.selectedIndex = i;
                break;
            }//if
        }//for
    };


    MenuHelper.Hud_btnToggle_Click = function()
    {
        var hud_on = _hudProxy._hud == null || !_hudProxy._btnToggleStateOn;
        ElGet("chkMenuToggleReticle").checked = hud_on;
        PrefHelper.SetReticleEnabledPref(hud_on);
    };


    var _InitReticleFromPref = function()
    {
        if (PrefHelper.GetReticleEnabledPref())
        {
            _hudProxy.Enable();
            ElGet("chkMenuToggleReticle").checked = true;
        }//if
    };


    MenuHelper.OptionsClearSelection = function(ul_id)
    {
        var ul = ElGet(ul_id);
        var ns = ul.children;
    
        for (var i=0; i<ns.length; i++)
        {
            var el = ns[i].firstChild;

            if (el.className != null && el.className.length > 0)
            {
                el.className = el.className.replace(/ menu_option_selected/, "");
                el.className = el.className.replace(/menu_option_selected/, "");
            }//if
        }//for
    };


    MenuHelper.OptionsGetSelectedValue = function(ul_id)
    {
        var ul = ElGet(ul_id);
        var ns = ul.children;
        var idx = -1;

        for (var i=0; i<ns.length; i++)
        {
            var el = ns[i].firstChild;
        
            if (el.className != null && el.className.indexOf("menu_option_selected") >= 0)
            {
                idx = parseInt(el.getAttribute("value"));
                break;
            }//if
        }//for

        return idx;
    };


    MenuHelper.OptionsSetSelection = function(ul_id, value)
    {
        var ul = ElGet(ul_id);
        var ns = ul.children;

        for (var i=0; i<ns.length; i++)
        {
            var el = ns[i].firstChild;

            if (el.getAttribute("value")!= null && parseInt(el.getAttribute("value")) == value)
            {
                el.className = (el.className != null ? el.className + " " : "") + "menu_option_selected";
                break;
            }//if
        }//for
    };


    MenuHelper.SyncBasemap = function()
    {
        var idx = BasemapHelper.GetCurrentInstanceBasemapIdx();

        MenuHelper.OptionsClearSelection("ul_menu_basemap");
        MenuHelper.OptionsSetSelection("ul_menu_basemap", idx);
    };


    return MenuHelper;
})();








// ===============================================================================================
// ======================================= MENU HELPER STUB ======================================
// ===============================================================================================
//
// MenuHelperStub contains essential inits for the slideout menu, without which other code will break.
// (nb: this is not true in all cases, and some can be moved to MenuHelper.  todo.)
// 
//
var MenuHelperStub = (function()
{
    function MenuHelperStub()
    {
    }

    MenuHelperStub.Init = function()
    {
        _InitLayers_BindLayers();
        _InitBasemap_BindBasemap();
        _InitLogs_BindEvents();
        _InitMenu_MobileNoHoverHack();
    };

    // todo: move to MenuHelper
    var _InitMenu_MobileNoHoverHack = function()
    {
        if (!_nua("mobile") && !_nua("iPhone") && !_nua("iPad") && !_nua("Android")) return;
        var s = ElCr("style");
        s.type = "text/css";
        s.innerHTML = ".menu-section-list a:hover,.menu-section-list div:hover,.menu-section-list span:hover,.menu-section-title a:hover,.menu-section-title div:hover,.menu-section-title span:hover,#ddlLanguage:focus,#ddlLanguage:hover { color:#737373; }";
        document.head.appendChild(s);
    };


    // todo: move to MenuHelper
    var _InitLogs_BindEvents = function()
    {
        ElGet("menu_logs_0").addEventListener("click", function()
        {
            LayersHelper.ShowAddLogPanel();
        }, false);

        ElGet("menu_logs_1").addEventListener("click", function()
        {
            MenuHelper.OptionsClearSelection("ul_menu_layers");
            MenuHelper.OptionsSetSelection("ul_menu_layers", 11);
            _ui_layer_idx = 11;
            PrefHelper.SetLayerUiIndexPref(11);
            LayersHelper.UiLayers_OnChange();
            LayersHelper.AddLogsCosmic();
        }, false);

        ElGet("menu_logs_2").addEventListener("click", function()
        {
            if (_bvProxy.GetLogCount() > 0) 
            {
                _bvProxy.btnRemoveLogsOnClick();
            }
        }, false);

        ElGet("menu_logs_3").addEventListener("click", function()
        {
            if (_bvProxy.GetLogCount() > 0) 
            { 
                LayersHelper.ShowAddLogPanel(); 

                setTimeout(function() { 
                    _bvProxy.UI_ShowAdvPanel(); 
                }, 100); 
            }
        }, false);
    };


    var _BindMore = function(ul_name, li_id, div_id, s0_id, chk_id, chk_checked, cb)
    {
        var ul = ElGet(ul_name);
        var li = ElCr("li"), div = ElCr("div"), s0 = ElCr("span"), d0 = ElCr("div");
        var c  = ElCr("input"), cd0 = ElCr("div"), cd1 = ElCr("div");

        ul.style.marginTop = "0px";

        li.id = li_id;

        div.id           = div_id;
        div.style.height = "22px";
        div.style.width  = "200px";
        div.className    = "menu-prefs-chk-item";

        s0.id               = s0_id;
        s0.style.marginLeft = "auto";
        s0.style.fontSize   = "14px";

        d0.style.marginLeft = "10px";

        c.id        = chk_id;
        c.type      = "checkbox";
        c.className = "ios-switch scgreen";
        c.checked   = chk_checked;

        AList(div, "click", cb);

        cd0.appendChild(cd1);
         d0.appendChild(c);
         d0.appendChild(cd0);
        div.appendChild(s0);
        div.appendChild(d0);
         li.appendChild(div);
         ul.appendChild(li);
    };


    var _InitBasemap_BindMore = function()
    {
        var cb = function() { MenuHelper.MoreBasemap_OnClick(); };
        _BindMore("ul_menu_basemap", "li_menu_morebasemap", "lnkMenuBasemapMore", "lblMenuBasemapMore", "chkMenuBasemapMore", _ui_menu_basemap_more_visible, cb);
    };


    var _InitLayers_BindMore = function()
    {
        var cb = function() { MenuHelper.MoreLayers_OnClick(); };
        _BindMore("ul_menu_layers", "li_menu_morelayers", "lnkMenuLayersMore", "lblMenuLayersMore", "chkMenuLayersMore", _ui_menu_layers_more_visible, cb);
    };


    var _InitLayers_BindLayers = function()
    {
        _ui_menu_layers_more_visible  = PrefHelper.GetLayersMorePref();
        _ui_menu_basemap_more_visible = PrefHelper.GetBasemapMorePref();
    
        _InitLayers_BindMore();
        _InitBasemap_BindMore();

        var ids = MenuHelperStub.GetLayerIdxs_All();

        var cb = function(idx)
        {
            MenuHelper.OptionsClearSelection("ul_menu_layers");
            MenuHelper.OptionsSetSelection("ul_menu_layers", idx);
            _ui_layer_idx = idx;
            PrefHelper.SetLayerUiIndexPref(idx);
            LayersHelper.UiLayers_OnChange();
        };

        _BindOptions("ul_menu_layers", "menu_layers_", ids, cb);
        _BindOptionLabelsToDivs("menu_layers_", ids);
    };


    var _InitBasemap_BindBasemap = function()
    {
        var ids = MenuHelperStub.GetBasemapIdxs_All();

        var cb = function(idx)
        {
            map.setMapTypeId(BasemapHelper.GetMapTypeIdForBasemapIdx(idx));
            MenuHelper.SyncBasemap();
        };

        _BindOptions("ul_menu_basemap", "menu_basemap_", ids, cb);
    };


    var _BindOptionLabelsToDivs = function(div_id_prefix, div_ids)
    {
        for (var i=0; i<div_ids.length; i++)
        {
            var el_name = div_id_prefix + div_ids[i];
            var div = ElGet(el_name);
            var s_label = ElCr("span");
            var s_date = ElCr("span");

            div.className = (div.className != null ? div.className + " " : "") + "menu-section-list-tag-container";

            s_date.className = "menu-section-list-tag";
            s_date.id = el_name + "_date_label";
            s_label.id = el_name + "_label";

            div.appendChild(s_label);
            div.appendChild(s_date);
        }//for
    };


    var _BindOptions = function(ul_id, div_id_prefix, div_ids, fx_callback)
    {
        var ul = ElGet(ul_id);

        for (var i=0; i<div_ids.length; i++)
        {
            var l = ElCr("li");
            var d = ElCr("div");

            ul.appendChild(l);
            l.appendChild(d);
            d.id = div_id_prefix + div_ids[i];
            d.setAttribute("value", "" + div_ids[i]);
            d.addEventListener("click", function() { fx_callback(parseInt(this.getAttribute("value"))); }.bind(d), false);
        }//for
    };

    // ***** DEFS *****
    // These are used by MenuHelper, even when setting labels.
    // They are consolidated to be defined here in one location.

    var _GetLogIdxsWithUiVisibility = function()
    {
        var d = new Array();
        for (var i=0; i<=3; i++)
        {
            d.push({ i:i, v:MenuHelperStub.UiVisibility.Normal });
        }//for
        return d;
    };

    var _GetBasemapIdxsWithUiVisibility = function()
    {
        var d = 
        [ 
            { i: 0, v:MenuHelperStub.UiVisibility.Always },
            { i: 1, v:MenuHelperStub.UiVisibility.Normal },
            { i: 2, v:MenuHelperStub.UiVisibility.Always },
            { i: 3, v:MenuHelperStub.UiVisibility.Always },
            { i: 4, v:MenuHelperStub.UiVisibility.Always },
            { i: 5, v:MenuHelperStub.UiVisibility.Normal },
            { i:14, v:MenuHelperStub.UiVisibility.Normal },
            { i: 6, v:MenuHelperStub.UiVisibility.Normal },
            { i: 7, v:MenuHelperStub.UiVisibility.Normal },
            { i: 8, v:MenuHelperStub.UiVisibility.Normal },
            { i:12, v:MenuHelperStub.UiVisibility.Normal },
            { i: 9, v:MenuHelperStub.UiVisibility.Normal },
            { i:13, v:MenuHelperStub.UiVisibility.Normal },
            { i:10, v:MenuHelperStub.UiVisibility.Normal },
            { i:11, v:MenuHelperStub.UiVisibility.Normal }
        ];
        
        return d;
    };

    var _GetLayerIdxsWithUiVisibility = function()
    {
        var d = 
        [ 
            { i:   11, v:MenuHelperStub.UiVisibility.Normal },
            { i:    0, v:MenuHelperStub.UiVisibility.Always },
            { i:    1, v:MenuHelperStub.UiVisibility.Normal },
            { i:    2, v:MenuHelperStub.UiVisibility.Normal },
            { i:   12, v:MenuHelperStub.UiVisibility.Always },
            { i:    8, v:MenuHelperStub.UiVisibility.Normal },
            { i:    9, v:MenuHelperStub.UiVisibility.Normal },
            { i:    3, v:MenuHelperStub.UiVisibility.Normal },
            { i:    4, v:MenuHelperStub.UiVisibility.Normal },
            { i:    5, v:MenuHelperStub.UiVisibility.Normal },
            { i:    6, v:MenuHelperStub.UiVisibility.Normal },
            { i:   10, v:MenuHelperStub.UiVisibility.Hidden },
            { i:10001, v:MenuHelperStub.UiVisibility.Hidden }
        ];

        return d;
    };

    var _GetGenericIdxs_WhereVisibilityIn = function(s, v)
    {
        var d = new Array();
        var j, m;

        for (var i=0; i<s.length; i++)
        {
            m = false;

            for (j=0; j<v.length; j++)
            {
                if (s[i].v == v[j])
                {
                    m = true;
                    break;
                }//if
            }//for

            if (m) { d.push(s[i].i); }
        }//for

        return d;
    };

    var _GetBasemapIdxs_WhereVisibilityIn = function(v)
    {
        var s = _GetBasemapIdxsWithUiVisibility();
        return _GetGenericIdxs_WhereVisibilityIn(s, v);
    };

    var _GetLogIdxs_WhereVisibilityIn = function(v)
    {
        var s = _GetLogIdxsWithUiVisibility();
        return _GetGenericIdxs_WhereVisibilityIn(s, v);
    };

    var _GetLayerIdxs_WhereVisibilityIn = function(v)
    {
        var s = _GetLayerIdxsWithUiVisibility();
        return _GetGenericIdxs_WhereVisibilityIn(s, v);
    };

    MenuHelperStub.GetLayerIdxs_All = function()
    {
        var v = [MenuHelperStub.UiVisibility.Hidden, MenuHelperStub.UiVisibility.Normal, MenuHelperStub.UiVisibility.Always];
        return _GetLayerIdxs_WhereVisibilityIn(v);
    };

    MenuHelperStub.GetLayerIdxs_NotHidden = function()
    {
        var v = [MenuHelperStub.UiVisibility.Normal, MenuHelperStub.UiVisibility.Always];
        return _GetLayerIdxs_WhereVisibilityIn(v);
    };
    
    MenuHelperStub.GetLayerIdxs_Hidden = function()
    {
        var v = [MenuHelperStub.UiVisibility.Hidden];
        return _GetLayerIdxs_WhereVisibilityIn(v);
    };

    MenuHelperStub.GetLayerIdxs_NotAlways = function()
    {
        var v = [MenuHelperStub.UiVisibility.Hidden, MenuHelperStub.UiVisibility.Normal];
        return _GetLayerIdxs_WhereVisibilityIn(v);
    };

    MenuHelperStub.GetLayerIdxs_Normal = function()
    {
        var v = [MenuHelperStub.UiVisibility.Normal];
        return _GetLayerIdxs_WhereVisibilityIn(v);
    };

    MenuHelperStub.GetBasemapIdxs_All = function()
    {
        var v = [MenuHelperStub.UiVisibility.Hidden, MenuHelperStub.UiVisibility.Normal, MenuHelperStub.UiVisibility.Always];
        return _GetBasemapIdxs_WhereVisibilityIn(v);
    };
    
    MenuHelperStub.GetBasemapIdxs_NotHidden = function()
    {
        var v = [MenuHelperStub.UiVisibility.Normal, MenuHelperStub.UiVisibility.Always];
        return _GetBasemapIdxs_WhereVisibilityIn(v);
    };

    MenuHelperStub.GetBasemapIdxs_NotAlways = function()
    {
        var v = [MenuHelperStub.UiVisibility.Hidden, MenuHelperStub.UiVisibility.Normal];
        return _GetBasemapIdxs_WhereVisibilityIn(v);
    };

    MenuHelperStub.GetBasemapIdxs_Normal = function()
    {
        var v = [MenuHelperStub.UiVisibility.Normal];
        return _GetBasemapIdxs_WhereVisibilityIn(v);
    };

    MenuHelperStub.GetLogIdxs_All = function()
    {
        var v = [MenuHelperStub.UiVisibility.Hidden, MenuHelperStub.UiVisibility.Normal, MenuHelperStub.UiVisibility.Always];
        return _GetLogIdxs_WhereVisibilityIn(v);
    };

    MenuHelperStub.UiVisibility =
    {
          Null: 0,
        Hidden: 1,
        Normal: 2,
        Always: 3
    };

    return MenuHelperStub;
})();

















