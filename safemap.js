//
// Copyright (C) 2011  Lionel Bergeret
//
// ----------------------------------------------------------------
// The contents of this file are distributed under the CC0 license.
// See http://creativecommons.org/publicdomain/zero/1.0/
// ----------------------------------------------------------------
//
// Modifications - 2014, 2015 - Nick Dolezal

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
var _mapPolys         = null;    // retained map polygon model instance

// ========== INTERNAL STATES =============
var _cached_ext       = { baseurl:GetBaseWindowURL(), urlyxz:null, lidx:-1, cd:false, cd_y:0.0, cd_x:0.0, cd_z:0, midx:-1, mt:null };
var _lastLayerIdx     = 0;
var _disable_alpha    = false;           // hack for media request regarding layer opacity
var _cm_hidden        = true;            // state of menu visibility - cached to reduce CPU hit on map pans
var _mainMenu_hidden  = true;            // state of menu visibility - cached to reduce CPU hit on map pans
var _did_init_font_crimson_text = false; // cached init state
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
var _show_last_slice  = false;


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

function SetUseJpRegion()
{
    var jstmi      = -540;
    var tzmi       = (new Date()).getTimezoneOffset(); // JST = -540
    _use_jp_region = (jstmi - 180) <= tzmi && tzmi <= (jstmi + 180); // get +/- 3 TZs from Japan... central asia - NZ
}//SetUseJpRegion

function GetContentBaseUrl()
{
    //return "http://tilemap" + (_use_jp_region ? "jp" : "") + ".safecast.org.s3.amazonaws.com/";
    return "";
}//GetContentBaseUrl


// 2015-04-03 ND: "What's New" popup that fires once.  May also be called
//                from the about window.

function WhatsNewGetShouldShow() // 2015-08-22 ND: fix for non-Chrome date parsing
{
    if (Date.now() > Date.parse("2015-04-30T00:00:00Z")) return false;
    
    var sval = localStorage.getItem("WHATSNEW_2_0");
    var vwh  = FlyToExtent.GetClientViewSize();
    if ((sval != null && sval == "1") || vwh[0] < 424 || vwh[1] < 424) return false;
    
    localStorage.setItem("WHATSNEW_2_0", "1");
    return true;
}//WhatsNewGetShouldShow

function WhatsNewClose()
{
    var el = document.getElementById("whatsnew");
    el.innerHTML = "";
    el.style.display = "none";
}//WhatsNewClose

function WhatsNewShow(language)
{
    var el = document.getElementById("whatsnew");
    
    el.style.display = "block";
    
    if (el.innerHTML != null && el.innerHTML.length > 0) 
    {
        el.innerHTML = "";
    }//if
    
    LoadingSpinnerHelper.InjectLoadingSpinner(el, "#000", 2, 38);

    var url = GetContentBaseUrl() + "whatsnew_" + language + "_inline.html";
    var req = new XMLHttpRequest();
    req.open("GET", url, true);
    req.onreadystatechange = function()
    {   
        if (req.readyState === 4 && req.status == 200) el.innerHTML = req.response || req.responseText;
    };
    req.send(null);
}//WhatsNewShow

function WhatsNewShowIfNeeded()
{
    if (WhatsNewGetShouldShow()) WhatsNewShow("en");
}//WhatsNewShowIfNeeded

function WarningShowIfNeeded()
{
    if (Date.now() < Date.parse("2015-09-23T13:00:00Z")) 
    {
        var el = document.getElementById("warning_message");
        
        el.style.display = "block";
        
        if (el.innerHTML != null && el.innerHTML.length > 0) 
        {
            el.innerHTML = "";
        }//if
    
        LoadingSpinnerHelper.InjectLoadingSpinner(el, "#000", 2, 38);

        var url = GetContentBaseUrl() + "warning_inline.html";
        var req = new XMLHttpRequest();
        req.open("GET", url, true);
        req.onreadystatechange = function()
        {   
            if (req.readyState === 4 && req.status == 200) el.innerHTML = req.response || req.responseText;
        };
        req.send(null);
    }//if
}//WarningShowIfNeeded




// ===============================================================================================
// ============================================= INIT ============================================
// ===============================================================================================



function initialize() 
{
    if (document == null || document.body == null) return;  // real old browsers that are going to break on everything

    MenuHelperStub.Init(); // must happen before basemaps or layers are init

    _bitsProxy = new BitsProxy("layers"); // mandatory, never disable
    _bvProxy   = new BvProxy();           // mandatory, never disable
    _hudProxy  = new HudProxy();          // mandatory, never disable
    
    SetUseJpRegion();
    
    if (_bitsProxy.GetUseBitstores()) // *** bitmap index dependents ***
    {
        var showIndicesParam = QueryString_GetParamAsInt("showIndices");
        if (showIndicesParam != -1)
        {
            var rendererIdParam = QueryString_GetParamAsInt("rendererId");
            setTimeout(function() { ShowBitmapIndexVisualization(showIndicesParam == 1, rendererIdParam == -1 ? 4 : rendererIdParam); }, 500);
            return; // this is a destructive action, no need for rest of init.
        }//if
    }//if

    // ************************** GMAPS **************************
    
    var yxz = GetUserLocationFromQuerystring();
    var yx  = yxz.yx != null ? yxz.yx : new google.maps.LatLng(MenuHelper.GetVisibleExtentYPref(), MenuHelper.GetVisibleExtentXPref());
    var z   = yxz.z  != -1   ? yxz.z  : MenuHelper.GetVisibleExtentZPref();
    
    var map_options = 
    {
                            zoom: z,
                         maxZoom: 21,
                          center: yx,
                     scrollwheel: true,
                     zoomControl: MenuHelper.GetZoomButtonsEnabledPref(),
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
                                   mapTypeIds: BasemapHelper.basemaps,
                                   /*
                                   mapTypeIds: [google.maps.MapTypeId.ROADMAP, 
                                                google.maps.MapTypeId.SATELLITE, 
                                                google.maps.MapTypeId.HYBRID, 
                                                google.maps.MapTypeId.TERRAIN, 
                                                "gray", "dark", "toner", "tlite", "wcolor", "mapnik", "black", "white", "stamen_terrain"]
                                                */
                                  },
                       mapTypeId: GetDefaultBasemapOrOverrideFromQuerystring()
    };

    map = new google.maps.Map(document.getElementById("map_canvas"), map_options);

    _mapPolys  = new MapPolys(map); // must occur after "map" ivar is set
    BasemapHelper.InitBasemaps();   // must occur after "map" ivar is set
    ClientZoomHelper.InitGmapsLayers();

    TimeSliceUI.Init();
    InitDefaultRasterLayerOrOverrideFromQuerystring();

    MapExtent_OnChange(1); //fire on init for client zoom

    // arbitrarily space out some loads / init that don't need to happen right now, so as not to block on the main thread here.

    setTimeout(function() {
        InitMapExtent_OnChange();
    }, 250);

    setTimeout(function() {
        InitLogIdsFromQuerystring();
    }, 500);

    setTimeout(function() {
        RtViewer_Init();
    }, 1000);

    setTimeout(function() {
        InitShowLocationIfDefault();
    }, 1500);

    setTimeout(function() {
        InitAboutMenu(); 
        InitContextMenu(); 
        (map.getStreetView()).setOptions({ zoomControlOptions: { position: google.maps.ControlPosition.RIGHT_BOTTOM }, panControlOptions: { position: google.maps.ControlPosition.RIGHT_BOTTOM }, enableCloseButton:true, imageDateControl:true, addressControlOptions:{ position: google.maps.ControlPosition.TOP_RIGHT } });
    }, 2000);

    setTimeout(function() {
        WhatsNewShowIfNeeded();
    }, 3000);
    
    MenuHelper.Init(); // contains its own delayed loads; should be at end of initialize()
}//initialize





function GetIsRetina() 
{ 
    return !_no_hdpi_tiles && window.devicePixelRatio > 1.5; 
}//GetIsRetina








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
        google.maps.MapTypeId.ROADMAP, google.maps.MapTypeId.SATELLITE,
        google.maps.MapTypeId.HYBRID, google.maps.MapTypeId.TERRAIN,
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
    
    
    BasemapHelper.GetUrlFromTemplate = function(template, x, y, z, r, s)
    {
        var url = "" + template;
        if (x != null) url = url.replace(/{x}/g, ""+x);
        if (y != null) url = url.replace(/{y}/g, ""+y);
        if (z != null) url = url.replace(/{z}/g, ""+z);
        if (r != null) url = url.replace(/{r}/g, ""+r);
        if (s != null) url = url.replace(/{s}/g, ""+s[(z + x + y) % s.length]);

        return url;
    };

    BasemapHelper.fxGetNormalizedCoord = function(xy, z) { return GetNormalizedCoord(xy, z); };

    BasemapHelper.GetGmapsMapStyled_Dark = function()
    {
        return [ {"stylers": [ { "invert_lightness": true }, { "saturation": -100 } ] },
                 { "featureType": "water", "stylers": [ { "lightness": -100 } ] },
                 { "elementType": "labels", "stylers": [ {  "lightness": -57  }, { "visibility": "on" } ] },
                 { "featureType": "administrative", "elementType": "geometry", "stylers": [ { "lightness": -57 } ] } ];
    };

    BasemapHelper.GetGmapsMapStyled_Gray = function()
    {
        return [ { "featureType": "water", "stylers": [ { "saturation": -100 }, { "lightness": -30  } ] },
                 { "stylers": [ { "saturation": -100 }, { "lightness": 50 } ] },
                 { "elementType": "labels.icon", "stylers": [ { "invert_lightness": true }, { "gamma": 9.99 }, { "lightness": 79 } ] } ];
    };
    
    BasemapHelper.GetGmapsMapStyled_Retro = function()
    {
        return [{"featureType":"administrative","stylers":[{"visibility":"off"}]},{"featureType":"poi","stylers":[{"visibility":"simplified"}]},{"featureType":"road","elementType":"labels","stylers":[{"visibility":"simplified"}]},{"featureType":"water","stylers":[{"visibility":"simplified"}]},{"featureType":"transit","stylers":[{"visibility":"simplified"}]},{"featureType":"landscape","stylers":[{"visibility":"simplified"}]},{"featureType":"road.highway","stylers":[{"visibility":"off"}]},{"featureType":"road.local","stylers":[{"visibility":"on"}]},{"featureType":"road.highway","elementType":"geometry","stylers":[{"visibility":"on"}]},{"featureType":"water","stylers":[{"color":"#84afa3"},{"lightness":52}]},{"stylers":[{"saturation":-17},{"gamma":0.36}]},{"featureType":"transit.line","elementType":"geometry","stylers":[{"color":"#3f518c"}]}];
    };

    BasemapHelper.NewGmapsBasemap = function(min_z, max_z, tile_size, url_template, name, r, subs)
    {
        var o =
        {
            getTileUrl: function(xy, z) 
                        { 
                            var nXY = BasemapHelper.fxGetNormalizedCoord(xy, z);
                            return BasemapHelper.GetUrlFromTemplate(url_template, nXY.x, nXY.y, z, r, subs);
                        },
              tileSize: new google.maps.Size(tile_size, tile_size),
               minZoom: min_z,
               maxZoom: max_z,
                  name: name,
                   alt: name
        };
    
        return new google.maps.ImageMapType(o);
    };


    BasemapHelper.NewGmapsBasemapConst = function(tile_size, alt, name, tile_url) // single tile for all requests
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
        
        var o = { };
        
        o.b0 = BasemapHelper.NewGmapsBasemap(0, stam_z, 256, "http://{s}.tile.stamen.com/terrain/{z}/{x}/{y}{r}.png", "Stamen Terrain", stam_r, stam_subs);
        o.b1 = BasemapHelper.NewGmapsBasemap(0, stam_z, 256, "http://{s}.tile.stamen.com/toner/{z}/{x}/{y}{r}.png", "Stamen Toner", stam_r, stam_subs);
        o.b2 = BasemapHelper.NewGmapsBasemap(0, stam_z, 256, "http://{s}.tile.stamen.com/toner-lite/{z}/{x}/{y}{r}.png", "Stamen Toner Lite", stam_r, stam_subs);
        
        o.b3 = BasemapHelper.NewGmapsBasemap(0, 19, 256, "http://{s}.tile.stamen.com/watercolor/{z}/{x}/{y}.jpg", "Stamen Watercolor", null, stam_subs);
        o.b4 = BasemapHelper.NewGmapsBasemap(0, 19, 256, "http://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", "OpenStreetMap", null, osm_subs);
        
        o.b9 = BasemapHelper.NewGmapsBasemap(0, 18, 256, "https://cyberjapandata.gsi.go.jp/xyz/std/{z}/{x}/{y}.png", "GSI Japan", null, null);
        
        o.b5 = BasemapHelper.NewGmapsBasemapConst(256, "Pure Black World Tendency", "None (Black)", "http://safecast.media.mit.edu/tilemap/black.png");
        o.b6 = BasemapHelper.NewGmapsBasemapConst(256, "Pure White World Tendency", "None (White)", "http://safecast.media.mit.edu/tilemap/white.png");
        o.b7 = new google.maps.StyledMapType(BasemapHelper.GetGmapsMapStyled_Gray(), {name: "Map (Gray)"});
        o.b8 = new google.maps.StyledMapType(BasemapHelper.GetGmapsMapStyled_Dark(), {name: "Map (Dark)"});
        o.b10 = new google.maps.StyledMapType(BasemapHelper.GetGmapsMapStyled_Retro(), {name: "Map (Retro)"});
        
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















function InitAboutMenu()
{
    document.getElementById("show").addEventListener("click", togglePopup, false);
    document.getElementById("popup").addEventListener("click", togglePopup, false);
}//InitAboutMenu

function InitLogIdsFromQuerystring()
{
    var logIds = getParam("logids");
    
    if (logIds != null && logIds.length > 0)
    {
        _bvProxy.AddLogsCSV(logIds, false);
    }//if
}//InitLogIdsFromQuerystring

function GetDefaultBasemapOrOverrideFromQuerystring()
{
    var midx = QueryString_GetParamAsInt("m");
    if (midx == -1) midx = QueryString_GetParamAsInt("midx");
    if (midx == -1) midx = MenuHelper.GetBasemapUiIndexPref();

    return BasemapHelper.GetMapTypeIdForBasemapIdx(midx);
}//GetDefaultBasemapOrOverrideFromQuerystring



function InitDefaultRasterLayerOrOverrideFromQuerystring()
{
    var lidx = QueryString_GetParamAsInt("l");
    if (lidx == -1) lidx = QueryString_GetParamAsInt("lidx");
    
    if (lidx == -1)
    {
        lidx = MenuHelper.GetLayerUiIndexPref();
    }//if    
    
    LayersHelper.SetSelectedIdxAndSync(lidx);
    
    if (LayersHelper.IsIdxTimeSlice(lidx))
    {
        TimeSliceUI.SetPanelHidden(false);
    }//if    
}//InitDefaultRasterLayerOrOverrideFromQuerystring

function GetUserLocationFromQuerystring()
{
    var y = getParam("y");
    var x = getParam("x");
    var z = QueryString_GetParamAsInt("z");
    
    if (y == null) y = getParam("lat");
    if (x == null) x = getParam("lon");

    var yx = y != null && x != null && y.length > 0 && x.length > 0 ? new google.maps.LatLng(y, x) : null;
    
    return { yx:yx, z:z }
}//GetUserLocationFromQuerystring

function InitMapExtent_OnChange()
{
    if (!IsBrowserOldIE())
    {
        var events = [ "dragend", "zoom_changed", "maptypeid_changed" ];
        var cb0 = function() { MapExtent_OnChange(0); };        
        var cb1 = function() { MapExtent_OnChange(1); };
        var cb2 = function() 
        { 
            MapExtent_OnChange(2);
            var idx = BasemapHelper.GetCurrentInstanceBasemapIdx();
            MenuHelper.SetBasemapUiIndexPref(idx); 
        };
        var cbs = [ cb0, cb1, cb2 ];
        
        for (var i=0; i<events.length; i++)
        {
            google.maps.event.addListener(map, events[i], cbs[i]);
        }//for
    }//if
}//InitMapExtent_OnChange

function InitFont_CrimsonText() // free Optimus Princeps clone
{
    if (_did_init_font_crimson_text) return;
    
    var el = document.createElement("link");
    el.href = "http://fonts.googleapis.com/css?family=Crimson+Text";
    el.rel = "stylesheet";
    el.type = "text/css";
    var head = document.getElementsByTagName("head")[0];
    head.appendChild(el);
    
    _did_init_font_crimson_text = true;
}//InitFont_CrimsonText

// nb: This only checks if the location is set in the querystring.
//     The implication is that at launch time, if this is present, it
//     means a link with the lat/lon in the querystring is set.
//     This does not hold true later, as when the user does anything,
//     it will be overridden.
//     This has two use cases:
//     1. If a link was followed, don't display the location text.
//     2. If a link was followed with logids, don't autozoom.
function IsDefaultLocation()
{
    var yxz = GetUserLocationFromQuerystring();
    
    return yxz.yx == null;
}//IsDefaultLocation

// The more complete version of IsDefaultLocation().
// This accomodates the location preference.  Previously, it could be
// safely assumed that if a link with the location wasn't followed,
// it was the default location and the text should be displayed.
// However, this should not be used for the case of determining whether
// or not to autozoom to logids in the querystring.  Rather, the
// old IsDefaultLocation() should be checked for that.
function IsDefaultLocationOrPrefLocation()
{
    var d = IsDefaultLocation();

    if (d)
    {
        var yx = GetNormalizedMapCentroid();
        var z  = map.getZoom();
        
        d = z == 9 && Math.abs(yx.x - 140.515516) < 0.000001
                   && Math.abs(yx.y -  37.316113) < 0.000001;
    }//if
    
    return d;
}//IsDefaultLocationOrPrefLocation

function InitShowLocationIfDefault()
{
    if (IsDefaultLocationOrPrefLocation() && getParam("logids").length == 0 && "requestAnimationFrame" in window)
    {
        requestAnimationFrame(function() { ShowLocationText("Honshu, Japan"); });
    }//if
}//InitShowLocationIfDefault


function SetStyleFromCSS(sel, t, css)
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
}//GetStyleFromCSS


function GetCssForScaler(s)
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
}//GetCssForScaler
    

    
function ToggleScaler()
{
    _img_scaler_idx = _img_scaler_idx == 1 ? 0 : _img_scaler_idx + 1;
        
    var css = GetCssForScaler(_img_scaler_idx);
    SetStyleFromCSS(".noblur img", 1, css);
}//ToggleScaler



function ToggleTileShadow()
{
    var n;
    
    if (window.devicePixelRatio > 1.5)
    {
        n = "#map_canvas img[src^=\"http://te\"], #map_canvas img[src^=\"http://nnsa\"]";
    }
    else
    {
        n = "#map_canvas > div:first-child > div:first-child > div:first-child > div:first-child > div:first-child > div:nth-last-of-type(1)";
    }
    
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
    
    SetStyleFromCSS(n, 1, css);
}




// ======== INIT: CONTEXT MENU ==========

function InitContextMenu() 
{
    if (IsBrowserOldIE() || map == null) return;
    
    if (navigator.userAgent.match(/iPad/i) || navigator.userAgent.match(/iPhone/i)) return;

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
        AnimateElementFadeIn(cm, -1.0, 0.166666666667);
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

    var fxClickLeft = function()
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
                    QuerySafecastApiAsync(clickLL.lat(), clickLL.lng(), map.getZoom());
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
    }

    var events = [ "click" ]; //"dragstart", "zoom_changed", "maptypeid_changed"

    var hide_cb = function()
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
}//contextMenuInitialize

function GetFormattedSafecastApiQuerystring(lat, lon, dist, start_date_iso, end_date_iso)
{
    var url = "https://api.safecast.org/en-US/measurements?utf8=%E2%9C%93"
            + "&latitude=" + lat.toFixed(6)
            + "&longitude="+ lon.toFixed(6)
            + "&distance=" + Math.ceil(dist)
            + "&captured_after="  + encodeURIComponent(start_date_iso)
            + "&captured_before=" + encodeURIComponent(end_date_iso)
            + "&since=&until=&commit=Filter";

    return url;
}//GetFormattedSafecastApiQuerystring

function QuerySafecastApiAsync(lat, lon, z)
{
    var start_date_iso, end_date_iso;
    var dist = M_LatPxZ(lat, 1+1<<Math.max(z-13.0,0.0), z);
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
    
    var url = GetFormattedSafecastApiQuerystring(lat, lon, dist, start_date_iso, end_date_iso);

    window.open(url);
}//QuerySafecastApiAsync

// returns meters per pixel for a given EPSG:3857 Web Mercator zoom level, for the
// given latitude and number of pixels.
function M_LatPxZ(lat, px, z) 
{
    return (Math.cos(lat*Math.PI/180.0)*2.0*Math.PI*6378137.0/(256.0*Math.pow(2.0,z)))*px; 
}//M_LatPxZ






// ===============================================================================================
// ======================================= EVENT HANDLERS ========================================
// ===============================================================================================
function togglePopup() // "about" dialog
{
    var popup  = document.getElementById("popup");
    var mapdiv = document.getElementById("map_canvas");
    var bmul   = 3.0;
    
    if (popup.style != null && popup.style.display == "none")
    {
        GetAboutContentAsync();
        AnimateElementBlur(mapdiv, 0.0, 0.1333333333*bmul, 0.0, 4.0*bmul);
        AnimateElementFadeIn(document.getElementById("popup"), -1.0, 0.033333333333);
    }//if
    else
    {
        setTimeout(function() { popup.innerHTML = ""; }, 500);
        AnimateElementBlur(mapdiv, 4.0*bmul, -0.1333333333*bmul, 0.0, 4.0*bmul);
        AnimateElementFadeOut(document.getElementById("popup"), 1.0, -0.033333333333);
    }//else
}//togglePopup

function GetAboutContentAsync()
{
    var el = document.getElementById("popup");
    if (el.innerHTML != null && el.innerHTML.length > 0) return;
    LoadingSpinnerHelper.InjectLoadingSpinner(el, "#000", 2, 38);

    var url = GetContentBaseUrl() + "about_inline.html";
    var req = new XMLHttpRequest();
    req.open("GET", url, true);
    req.onreadystatechange = function()
    {   
        if (req.readyState === 4 && req.status == 200) el.innerHTML = req.response || req.responseText;
    };
    req.send(null);
}//GetAboutContentAsync




//  -1: ???
//   0: dragend event
//   1: zoom_changed event
//   2: maptypeid_changed event (update midx)
// 100: layers were changed by user. (update lidx)
// 200: remove logs was clicked. (update logids)
// 300: cooldown end

function MapExtent_SetUpdatePanCooldown()
{
    var q = _cached_ext;
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
            MapExtent_OnChange(300);
        }//if
        else if (q.cd_z == map.getZoom()) // abort if z changed, will force ll refresh anyway.
        {
            MapExtent_SetUpdatePanCooldown();
        }//else
    };
    setTimeout(end_cooldown, 250);
}//MapExtent_SetUpdatePanCooldown


function GetMapQueryStringUrl(isFull)
{
    var logs = _bvProxy._bvm == null ? null 
             : isFull ? _bvProxy.GetAllLogIdsEncoded() 
             : _bvProxy.GetLogIdsEncoded();
    
    var q = _cached_ext;
    
    var url = q.urlyxz;
    
    if (q.lidx > 0)        url += "&l=" + q.lidx;
    if (q.midx > 0)        url += "&m=" + q.midx;
    if (logs != null && logs.length > 0) url += "&logids=" + logs;
    
    return url;
}//GetMapQueryStringUrl



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
    
    SafecastDateHelper.JST_OFFSET_MS = 32400000.0; // 9 * 60 * 60 * 1000
    
    // For a date 2011-03-10T15:00:00Z, returns 20110310, or YY+MM+DD
    SafecastDateHelper.TrimIsoDateToFilenamePart = function(d)
    {
        return d.substring(0, 4) + d.substring(5, 7) + d.substring(8, 10);
    };
    
    SafecastDateHelper.GetShortIsoDate = function(d)
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
    
    SafecastDateHelper.GetIsoDateForIsoDateAndTimeIntervalMs = function(d, ti)
    {
        var d0 = new Date(d);
        var t0 = d0.getTime() + ti;
        d0.setTime(t0);
        return d0.toISOString();
    };
    
    SafecastDateHelper.GetTimeSliceLayerDateRangeForIdxUTC = function(idx)
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
        var d  = SafecastDateHelper.GetTimeSliceLayerDateRangeForIdxUTC(idx);

        d.e = SafecastDateHelper.GetIsoDateForIsoDateAndTimeIntervalMs(d.e, -1000.0);

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
            var d0 = SafecastDateHelper.TrimIsoDateToFilenamePart(src[i].s);
            var d1 = SafecastDateHelper.TrimIsoDateToFilenamePart(src[i].e);
            
            dest.push( { i:src[i].i, d:(d0 + d1) } );
        }//for

        return dest;
    };
    
    // Converts ISO date string into JST-offset date with the end date
    // having 1 second subtracted, then truncates them into "YYYY-MM-DD"

    SafecastDateHelper.GetTimeSliceDateRangeLabelsForIdxJST = function(idx)
    {
        var d = SafecastDateHelper.GetTimeSliceLayerDateRangeInclusiveForIdxUTC(idx);

        d.s = SafecastDateHelper.GetIsoDateForIsoDateAndTimeIntervalMs(d.s, SafecastDateHelper.JST_OFFSET_MS);
        d.e = SafecastDateHelper.GetIsoDateForIsoDateAndTimeIntervalMs(d.e, SafecastDateHelper.JST_OFFSET_MS);
        d.s = SafecastDateHelper.GetShortIsoDate(d.s);
        d.e = SafecastDateHelper.GetShortIsoDate(d.e);

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
var ClientZoomHelper = (function()
{
    function ClientZoomHelper() 
    {
    }

    ClientZoomHelper.fxGetNormalizedCoord  = function(xy, z)   { return GetNormalizedCoord(xy, z); }; // static
    ClientZoomHelper.fxShouldLoadTile      = function(l,x,y,z) { return _bitsProxy.ShouldLoadTile(l, x, y, z); };
    ClientZoomHelper.fxGetIsRetina         = function()        { return GetIsRetina(); };
    ClientZoomHelper.fxGetSelectedLayerIdx = function()        { return LayersHelper.GetSelectedIdx(); };
    ClientZoomHelper.fxClearMapLayers      = function()        { map.overlayMapTypes.clear(); };
    ClientZoomHelper.fxSyncMapLayers       = function()        { LayersHelper.SyncSelectedWithMap(); };
    ClientZoomHelper.fxGetLayers           = function()        { return overlayMaps; };
    ClientZoomHelper.fxSetLayers           = function(o)       { overlayMaps = o; };
    ClientZoomHelper.fxGetTimeSliceDates   = function()        { return SafecastDateHelper.GetTimeSliceDateRangesFilenames(); }
    ClientZoomHelper.fxGetUseJpRegion      = function()        { return _use_jp_region; };
    
    ClientZoomHelper.GetUrlForTile512 = function(xy, z, layerId, normal_max_z, base_url, idx)
    {
        z = ClientZoomHelper.GetClampedZoomLevelForIdx(idx, z);

        if (!ClientZoomHelper.fxGetIsRetina() && z > 0 && z <= normal_max_z) z -= 1;

        var nXY = ClientZoomHelper.fxGetNormalizedCoord(xy, z);

        if (!nXY || !ClientZoomHelper.fxShouldLoadTile(layerId, nXY.x, nXY.y, z))
        {
            return null;
        }//if

        return ClientZoomHelper.GetUrlFromTemplate(base_url, nXY.x, nXY.y, z);
    };
    
    
    
    ClientZoomHelper.GetUrlForTile256 = function(xy, z, layerId, normal_max_z, base_url, idx)
    {
        z       = ClientZoomHelper.GetClampedZoomLevelForIdx(idx, z);
        var nXY = ClientZoomHelper.fxGetNormalizedCoord(xy, z);
    
        if (!nXY || !ClientZoomHelper.fxShouldLoadTile(layerId, nXY.x, nXY.y, z))
        {
            return null;
        }//if

        return ClientZoomHelper.GetUrlFromTemplate(base_url, nXY.x, nXY.y, z);
    };
    
    
    
    ClientZoomHelper.SynchronizeLayersToZoomLevel = function(z)
    {
        var o       = ClientZoomHelper.fxGetLayers();
        if (o == null) return;
        
        var hdpi    = ClientZoomHelper.fxGetIsRetina();
        var cleared = false;        
        var idx     = ClientZoomHelper.fxGetSelectedLayerIdx();
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
                        ClientZoomHelper.fxClearMapLayers(); // must be cleared before the first size is set
                        cleared = true; 
                    }//if
                    
                    o[i].tileSize = new google.maps.Size(sz, sz);
                }//if
            }//if        
        }//for

        if (cleared) ClientZoomHelper.fxSyncMapLayers(); // must re-add to map to finally take effect
    };



    ClientZoomHelper.GetClampedZoomLevelForIdx = function(idx, z)
    {
        var o  = ClientZoomHelper.fxGetLayers();
        
        var mz = o[idx].ext_actual_max_z + (o[idx].ext_tile_size > 256 && !ClientZoomHelper.fxGetIsRetina() ? 1 : 0);
        var dz = o == null || z <= mz ? z : mz;        
        
        return dz;
    };
    
    
    
    // layerId is for bitstores. a proxy layerId should be used for similar secondary layers to reduce memory use.
    ClientZoomHelper.InitGmapsLayers_Create = function(idx, layerId, is_layer_id_proxy, maxz, alpha, tile_size, url)
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
            o.getTileUrl = function (xy, z) { return ClientZoomHelper.GetUrlForTile512(xy, z, layerId, maxz, url, idx); };
            o.tileSize   = new google.maps.Size(512, 512);
        }//if
        else
        {
            o.getTileUrl = function (xy, z) { return ClientZoomHelper.GetUrlForTile256(xy, z, layerId, maxz, url, idx); };
            o.tileSize   = new google.maps.Size(256, 256);
        }//else
    
        return o;
    };
    
    ClientZoomHelper.GetUrlFromTemplate = function(template, x, y, z)
    {
        var url = "" + template;
            url = url.replace(/{x}/g, ""+x);
            url = url.replace(/{y}/g, ""+y);
            url = url.replace(/{z}/g, ""+z);
            
        return url;
    };
    

    

    ClientZoomHelper.InitGmapsLayers_CreateAll = function()
    {
        var x = new Array();
        
        var isJ = ClientZoomHelper.fxGetUseJpRegion();
        
        var te512url = isJ ? "http://te512jp.safecast.org.s3-ap-northeast-1.amazonaws.com/{z}/{x}/{y}.png"
                           : "http://te512.safecast.org.s3.amazonaws.com/{z}/{x}/{y}.png";
        
        var tg512url = isJ ? "http://tg512jp.safecast.org.s3-ap-northeast-1.amazonaws.com/{z}/{x}/{y}.png"
                           : "http://tg512.safecast.org.s3.amazonaws.com/{z}/{x}/{y}.png";

        var nnsa_url = isJ ? "http://nnsajp.safecast.org.s3-ap-northeast-1.amazonaws.com/{z}/{x}/{y}.png"
                           : "http://nnsa.safecast.org.s3.amazonaws.com/{z}/{x}/{y}.png";

        var nure_url = isJ ? "http://nurejp.safecast.org.s3-ap-northeast-1.amazonaws.com/{z}/{x}/{y}.png"
                           : "http://nure.safecast.org.s3.amazonaws.com/{z}/{x}/{y}.png";

        var au_url   = isJ ? "http://aujp.safecast.org.s3-ap-northeast-1.amazonaws.com/{z}/{x}/{y}.png"
                           : "http://au.safecast.org.s3.amazonaws.com/{z}/{x}/{y}.png";

        var aist_url = isJ ? "http://aistjp.safecast.org.s3-ap-northeast-1.amazonaws.com/{z}/{x}/{y}.png"
                           : "http://aist.safecast.org.s3.amazonaws.com/{z}/{x}/{y}.png";

        var te13_url = isJ ? "http://te20130415jp.safecast.org.s3-ap-northeast-1.amazonaws.com/{z}/{x}/{y}.png"
                           : "http://te20130415.safecast.org.s3.amazonaws.com/{z}/{x}/{y}.png";

        var te14_url = isJ ? "http://te20140311jp.safecast.org.s3-ap-northeast-1.amazonaws.com/{z}/{x}/{y}.png"
                           : "http://te20140311.safecast.org.s3.amazonaws.com/{z}/{x}/{y}.png";
        
        var ts = ClientZoomHelper.fxGetTimeSliceDates();

        x.push( ClientZoomHelper.InitGmapsLayers_Create( 0, 2,  false, 17, 1.0, 512, te512url) );
        x.push( ClientZoomHelper.InitGmapsLayers_Create( 1, 2,  false, 17, 1.0, 512, te512url) );
        x.push( ClientZoomHelper.InitGmapsLayers_Create( 2, 8,  false, 15, 0.5, 512, tg512url) );
        
        x.push( ClientZoomHelper.InitGmapsLayers_Create( 3, 3,  false, 16, 1.0, 512, nnsa_url) );
        x.push( ClientZoomHelper.InitGmapsLayers_Create( 4, 6,  false, 12, 0.7, 512, nure_url) );
        x.push( ClientZoomHelper.InitGmapsLayers_Create( 5, 16, false, 12, 0.7, 512, au_url) );
        x.push( ClientZoomHelper.InitGmapsLayers_Create( 6, 9,  false, 12, 0.7, 512, aist_url) );
        x.push( ClientZoomHelper.InitGmapsLayers_Create( 7, 9,  true,  15, 1.0, 256, "http://safecast.media.mit.edu/tilemap/TestIDW/{z}/{x}/{y}.png") );
        x.push( ClientZoomHelper.InitGmapsLayers_Create( 8, 2,  true,  17, 1.0, 512, te13_url) );
        x.push( ClientZoomHelper.InitGmapsLayers_Create( 9, 2,  true,  17, 1.0, 512, te14_url) );
        
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
        
        x.push(null);
        x.push(null);
        x.push(null);
        
        for (var i=0; i<ts.length; i++)
        {
            var u = "http://te" + ts[i].d + (isJ ? "jp.safecast.org.s3-ap-northeast-1.amazonaws.com/{z}/{x}/{y}.png"
                                                 : ".safecast.org.s3.amazonaws.com/{z}/{x}/{y}.png");
                                                            
            x.push( ClientZoomHelper.InitGmapsLayers_Create(ts[i].i, 2, true, 17, 1.0, 512, u) );
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
        var o = ClientZoomHelper.fxGetLayers();
        
        if (o == null)
        {
            o = ClientZoomHelper.InitGmapsLayers_CreateAll();
            ClientZoomHelper.fxSetLayers(o);
        }//if
    };
    
    return ClientZoomHelper;
})();



function MapExtent_OnChange(eventId)
{
    var q = _cached_ext;
    
    var initLoad = q.mt == null;
    
    // if just panning, use a cooldown to prevent too frequent of updates.
    if (!initLoad && eventId == 0)
    {
        if (q.cd) { return; }

        MapExtent_SetUpdatePanCooldown();
        return;
    }//if

    var updateBasemap = initLoad || eventId == 2;
    var updateLatLon  = initLoad || eventId  < 2 || eventId == 300;
    var updateZ       = initLoad || eventId == 1;
    var updateLayers  = initLoad || eventId == 100;
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
        c = GetMapInstanceYXZ();
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
        if (c == null) c = GetMapInstanceYXZ();
        q.urlyxz = q.baseurl + ("?y=" + c.y) + ("&x=" + c.x) + ("&z=" + c.z);
    }//if
    
    var url = GetMapQueryStringUrl(true); // 2015-03-30 ND: false -> true so all logids are present, must test performance

    if (!initLoad) MapExtent_DispatchHistoryPushState(url);
    //history.pushState(null, null, url);
}//MapExtent_OnChange

function MapExtent_DispatchHistoryPushState(url)
{
    var ms = Date.now();
    _last_history_push_ms = ms;
    
    setTimeout(function() 
    {
        if (ms == _last_history_push_ms)
        {
            history.pushState(null, null, url);
            var c = GetNormalizedMapCentroid();
            MenuHelper.SetVisibleExtentXPref(c.x);
            MenuHelper.SetVisibleExtentYPref(c.y);
            MenuHelper.SetVisibleExtentZPref(map.getZoom());
        }//if
    }, _system_os_ios ? 1000 : 250);
}





function codeAddress() 
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
}//codeAddress
















// ===============================================================================================
// ===================================== GOOGLE MAPS UTILITY =====================================
// ===============================================================================================

// Google function.  Handles 180th meridian spans which result in invalid tile references otherwise.
// Despite the name, xy is EPSG:3857 tile x/y.
function GetNormalizedCoord(xy, z) 
{
    var w = 1 << z;
    var x = xy.x < 0 || xy.x >= w ? (xy.x % w + w) % w : xy.x;
    return { x:x, y:xy.y };
}//GetNormalizedCoord

// Returns lat/lon centroid of visible extent, correcting for Google's invalid coordinate system refs on 180th meridian spans.
function GetNormalizedMapCentroid()
{
    var c = map.getCenter();
    var y = c.lat();
    var x = c.lng();
    
    if (x > 180.0 || x < -180.0) x = x % 360.0 == x % 180.0 ? x % 180.0 : (x > 0.0 ? -1.0 : 1.0) * 180.0 + (x % 180.0); // thanks Google
    
    return { y:y, x:x };
}


// Gets the map centroid lat/lon/z.  Truncates to max rez of pixel for shortest string length possible.
// Slightly errors on the side of being too precise as it does not handle lat-dependent changes or lon diffs.
function GetMapInstanceYXZ()
{
    var c = GetNormalizedMapCentroid();
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
}//GetMapInstanceYXZ





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
    
    //LayersHelper.GetLayerDdl      = function ()   { return document.getElementById("layers"); };
    LayersHelper.SetLastLayerIdx  = function(idx) { _lastLayerIdx = idx; };
    LayersHelper.GetLastLayerIdx  = function()    { return _lastLayerIdx; };
    LayersHelper.GetRenderTest    = function()    { return _test_client_render; };
    LayersHelper.GmapsSetAt       = function(i,o) { map.overlayMapTypes.setAt(i, o); };
    LayersHelper.GmapsNewLayer    = function(o)   { return new google.maps.ImageMapType(o); };
    LayersHelper.GmapsClearLayers = function()    { map.overlayMapTypes.clear(); };
    LayersHelper.GetOverlayMaps   = function()    { return overlayMaps; };
    LayersHelper.HudSetLayers     = function(ar)  { _hudProxy.SetLayers(ar); };
    LayersHelper.HudUpdate        = function()    { _hudProxy.Update(); };
    LayersHelper.SetTsPanelHidden = function(h)   { TimeSliceUI.SetPanelHidden(h); };
    LayersHelper.ShowAddLogPanel  = function()    { _bvProxy.ShowAddLogsPanel(); };
    LayersHelper.AddLogsCosmic    = function()    { _bvProxy.AddLogsCSV("cosmic", true); };
    LayersHelper.AddLogsSurface   = function()    { _bvProxy.AddLogsCSV("surface", true); };
    LayersHelper.InitBitsLegacy   = function()    { _bitsProxy.LegacyInitForSelection(); };
    LayersHelper.MapExtentChanged = function(i)   { MapExtent_OnChange(i); };
    LayersHelper.FlyToExtentByIdx = function(idx) { FlyToExtent.GoToPresetLocationIdIfNeeded(idx); };
    LayersHelper.GetTsSliderIdx   = function()    { return TimeSliceUI.GetSliderIdx();    };
    LayersHelper.SetTsSliderIdx   = function(idx) { return TimeSliceUI.SetSliderIdx(idx); };
    LayersHelper.GetShowLastSlice = function()    { return _show_last_slice; };
    LayersHelper.GetIsLayerIdxTS  = function(idx) { return SafecastDateHelper.IsLayerIdxTimeSliceLayerDateRangeIdx(idx) };

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
        return LayersHelper.GetIsLayerIdxTS(idx);
    };
    
    /*
    LayersHelper.GetMaxIdx = function() // unused
    {
        var el = LayersHelper.GetLayerDdl();
        return el.length > 1 ? el.length - 1 : 0;
    };
    */
    
    LayersHelper.GetSelectedDdlIdx = function()
    {
        /*
        var el  = LayersHelper.GetLayerDdl();
        var idx = parseInt(el.options[el.selectedIndex].value);
        */
        //var idx = MenuOptionsGetSelectedValue("ul_menu_layers");
        
        var idx = _ui_layer_idx;
        
        return idx;
    };
    
    LayersHelper.GetSelectedIdx = function()
    {
        var idx = LayersHelper.GetSelectedDdlIdx();
        
        if (LayersHelper.IsIdxTimeSliceUiProxy(idx))
        {
            idx = LayersHelper.GetTsSliderIdx();
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
                LayersHelper.SetTsSliderIdx(idx);
            
                idx = LayersHelper.LAYER_IDX_TS_UI_PROXY;
            }//if
            else
            {
                return;
            }//else
        }//if
    
        if (idx != null)
        {
            _ui_layer_idx = idx;
            
            MenuHelper.SetLayerUiIndexPref(idx);
            MenuHelper.OptionsClearSelection("ul_menu_layers");
            MenuHelper.OptionsSetSelection("ul_menu_layers", idx);
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
            if (idx == 0 && !LayersHelper.GetRenderTest()) 
            {
                LayersHelper.AddToMapByIdxs([2, 0]); // standard hack for points + interpolation default layer
            }//if
            else if (LayersHelper.IsIdxTimeSlice(idx) && LayersHelper.GetShowLastSlice())
            {
                var last_idx = idx - 1; // potentially bad
                
                if (LayersHelper.IsIdxTimeSlice(last_idx))
                {
                    LayersHelper.AddToMapByIdxs([last_idx, idx]);
                }//if
                else
                {
                    LayersHelper.AddToMapByIdx(idx);
                }//else
            }//else if
            else 
            {
                LayersHelper.AddToMapByIdx(idx);
            }//else
        }//if
    
        LayersHelper.SetLastLayerIdx(idx);
    };
    
    LayersHelper.AddToMapByIdx = function(idx)
    {
        LayersHelper.AddToMapByIdxs([idx]);
    };
    
    LayersHelper.AddToMapByIdxs = function(idxs)
    {
        var hud_layers = new Array();
        var omaps      = LayersHelper.GetOverlayMaps();

        for (var i=0; i<idxs.length; i++)
        {
            var gmaps_layer = LayersHelper.GmapsNewLayer(omaps[idxs[i]]);
            
            //console.log("LayersHelper.AddToMapByIdxs: Added idx=%d to map", idxs[i]);
            
            LayersHelper.GmapsSetAt(i, gmaps_layer);
        
            hud_layers.push({     urlTemplate: omaps[idxs[i]].ext_url_template, 
                              bitstoreLayerId: omaps[idxs[i]].ext_layer_id });
        }//for
    
        LayersHelper.HudSetLayers(hud_layers);
    };
    
    LayersHelper.RemoveAllFromMap = function()
    {
        LayersHelper.GmapsClearLayers();
        LayersHelper.HudSetLayers(new Array());
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
        var lastIdx = LayersHelper.GetLastLayerIdx();
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
            LayersHelper.AddLogsSurface();
        }//else if
        
        if (!isDone)
        {
            if (   !LayersHelper.IsIdxTimeSliceUiProxy(newIdx)
                && !LayersHelper.IsIdxTimeSlice(newIdx))
            {
                LayersHelper.SetTsPanelHidden(true);
            }//if
            else
            {
                LayersHelper.SetTsPanelHidden(false);
            }//else
        
            // 2015-02-12 ND: don't init bitstores for other layers until needed.
            LayersHelper.InitBitsLegacy();
        
            LayersHelper.SyncSelectedWithMap();
        
            LayersHelper.MapExtentChanged(100); // force URL update
        
            if (!LayersHelper.IsIdxNull(newIdx))
            {    
                LayersHelper.FlyToExtentByIdx(newIdx);
                LayersHelper.HudUpdate();
            }//if
        }//if
    };
    
    return LayersHelper;
})();








// ===============================================================================================
// ========================================== MAP POLYS ==========================================
// ===============================================================================================
//
// MapPolys: Retained object containing encoded map polygon(s) and management for adding/remove from
//           a Google Maps instance.
//
// Encoded Poly Format:
// =====================
// { 
//     poly_id:0,
//     desc:"帰還困難区域 (Fukushima Zone) by Azby, v2",
//     xs:"70...",
//     ys:"33...",
//     ext: { x0:140.68406, y0:37.35023, x1:141.03888, y1:37.62742 },
//     pr: { x:5, y:5 },
//     ss: [ { sc:"#0F0", sw:2, so:1, fc:"#0F0", fo:0.0, zi:1 },
//           { sc:"#000", sw:6, so:1, fc:"#000", fo:0.2, zi:0 } ]
// } 
//
// poly_id: A unique identifier for the polygon that can be used programmatically.
//    desc: An internal description only (not user-facing) to improve maintainability.
//      xs: An encoded string of the x-coordinates of the vertices.
//      ys: An encoded string of the y-coordinates of the vertices.
//     ext: The extent of the polygon.
//      pr: The precision of each encoded axis string, in decimal degree fractional digits.
//      ss: One or more styles for Google Maps.  An output polygon is created for each style.
//          sc: Stroke color
//          sw: Stroke width
//          so: Stroke opacity
//          fc: Fill color
//          fo: Fill opacity
//          zi: z-Index
//
// For more information, including a utility to encode a polygon, see "hexagon_encode.js" in the
// Tilemap Github repo.
//
var MapPolys = (function()
{
    function MapPolys(mapref) 
    {
        this.polygons = new Array();
        this.mapref   = mapref;
    }

    MapPolys.prototype.Add = function(poly_id)
    {
        this.polygons = MapPolys._PolysNewPolysByAddingPoly(poly_id, this.polygons, MapPolys._encoded_polygons, this.mapref);
    };

    MapPolys.prototype.Remove = function(poly_id)
    {
        this.polygons = MapPolys._PolysNewPolysByRemovingPoly(poly_id, this.polygons);
    };

    MapPolys.prototype.Exists = function(poly_id)
    {
        return MapPolys._PolysDoesExistPoly(poly_id, this.polygons);
    };



    MapPolys._DecodeXYVal = function(i,s,o,p)
    {
        return parseFloat(parseInt("0x"+s.substring(i<<2,(i<<2)+4)))/Math.pow(10,p)+o;
    };

    MapPolys._GmapsCreatePathsFromEncodedXYs = function(xs, ys, x0, y0, xp, yp)
    {
        var ps = new Array(xs.length>>>2);

        for (var i=0; i<xs.length>>>2; i++) 
        { 
            ps[i] = new google.maps.LatLng(MapPolys._DecodeXYVal(i,ys,y0,yp), MapPolys._DecodeXYVal(i,xs,x0,xp)); 
        }//for

        return ps;
    };


    MapPolys._GmapsCreatePolyFromPaths = function(gmaps_paths, ep, s, sidx)
    {
        return new google.maps.Polygon({         paths:gmaps_paths,
                                           strokeColor:s.sc,
                                          strokeWeight:s.sw,
                                         strokeOpacity:s.so,
                                             fillColor:s.fc,
                                           fillOpacity:s.fo,
                                                zIndex:s.zi,
                                           ext_poly_id:ep.poly_id,
                                    ext_poly_style_idx:sidx,
                                         ext_poly_desc:ep.desc,
                                       ext_poly_extent:{ x0:ep.ext.x0, y0:ep.ext.y0, x1:ep.ext.x1, y1:ep.ext.y1 }
                                      });
    };

    MapPolys._PolysNewPolysByRemovingPoly = function(poly_id, ps)
    {
        var d = new Array();

        for (var i = 0; i < ps.length; i++)
        {
            if (ps[i].ext_poly_id != poly_id)
            {
                d.push(ps[i]);
            }//if
            else if (ps[i].getMap() != null)
            {
                ps[i].setMap(null);
            }//else if
        }//for

        return d;
    };

    MapPolys._PolysNewPolysByAddingPoly = function(poly_id, ps, eps, mapref)
    {
        var d = new Array(ps.length);
        
        for (var i = 0; i < ps.length; i++)
        {
            d[i] = ps[i];
        }//for
        
        if (!MapPolys._PolysDoesExistPoly(poly_id, ps))
        {
            var nps = MapPolys._GmapsCreatePolysFromEncodedPoly(poly_id, eps);
            
            for (var i = 0; i < nps.length; i++)
            {
                nps[i].setMap(mapref);
                d.push(nps[i]);
            }//for
        }//if

        return d;
    };

    MapPolys._PolysDoesExistPoly = function(poly_id, ps)
    {
        var e = false;
        
        for (var i = 0; i < ps.length; i++)
        {
            if (ps[i].ext_poly_id == poly_id)
            {
                e = true;
                break;
            }//if
        }//for
        
        return e;
    };

    MapPolys._GmapsCreatePolysFromEncodedPoly = function(poly_id, eps)
    {
        var d = new Array();

        for (var i = 0; i < eps.length; i++)
        {            
            if (eps[i].poly_id == poly_id)
            {
                for (var j = 0; j < eps[i].ss.length; j++)
                {
                    var paths = MapPolys._GmapsCreatePathsFromEncodedXYs(eps[i].xs, eps[i].ys, eps[i].ext.x0, eps[i].ext.y0, eps[i].pr.x, eps[i].pr.y);
                    var poly  = MapPolys._GmapsCreatePolyFromPaths(paths, eps[i], eps[i].ss[j], j);
                    d.push(poly);
                }//for
            }//if
        }//for

        return d;
    };

    MapPolys._encoded_polygons =
    [   
        { 
            poly_id:0,
               desc:"帰還困難区域 (Fukushima Zone) by Azby, v2",
                 xs:"70FD73446CF76AF465A7659664C8672166986A486A3766CB65A861A25D4655D454384BE746CE412D3C59346F32F532D32AA42638258C252622432175169815860E8C10E513A511910D7A10280F7C0B88072C057F05A20416000008B70B210F05168819F31A4819581C5D1F3E2323274A292B27282AFB2A1B371E3ACE3B023B693C6A3D163B243E7E3F193EA13E9040F9417243DB4544478C49F64C934E0D52025212539E546B523553F3550658C859845CBC5B53634F69796CF7703F70DA776C787F79B47BB77DCB7F78868287B789AA8A9A89A988A88920894289DD8A558A338A33832883D483F7838F80BF7FBD7EEF7DCB7C5178B2790878067468729970FC",
                 ys:"33652F322D0330CA30E533ED3579354237713A0C3B023C043DEE3ED63E17434D49E553C9563B63F0684C67F966EA63B95F286163614862FB67496B016C476ABD6A27667D62E061EB61B55F1B5C64571458175773526751ED4B554B3A4A454A444781477348924ABF4B8C498649E648C8474A44A2439F41713EBA3D143881348430342E572B5D29DF28EA26BB23B2226B1CD41B631C301B551C301F541F0320801A8A1B3B1824166214C8129A147711CD12A70FE2115213FC133D0F680BE30A65051F04F601480000013A014803BC03BC057105B5156D1F3923892581263327BE2912292E29D12BF22EC430A2304F310130BC31893144327E33D3332F34403372",
                ext: { x0:140.68406, y0:37.35023, x1:141.03888, y1:37.62742 },
                 pr: { x:5, y:5 },
                 ss: [ { sc:"#0F0", sw:2, so:1, fc:"#0F0", fo:0.0, zi:1 },
                       { sc:"#000", sw:6, so:1, fc:"#000", fo:0.2, zi:0 } ]
        } 
    ];

    return MapPolys;
})();

// HexagonEncode is an encoder function for the polygons used by MapPolys.
// While the Google Maps polygon encoding is somewhat more efficient, it requires
// additional resource loads.
//
// This should not be uncommented, as it will never be used by the Tilemap, but
// rather is a tool 















function GetDogeTileForXY(x, y)
{
    return GetContentBaseUrl() + (x % 2 == 0 || y % 2 == 0 ? "dogetile2.png" : "dogetile_cyanhalo.png");
}

// supports showing the bitmap indices, which is contained in legacy code
// with nasty deps that i haven't had time to rewrite.
function ShowBitmapIndexVisualization(isShowAll, rendererId)
{
    if (!_bitsProxy.GetIsReady()) // bad way of handling deps... but this is just a legacy hack anyway.
    {
        setTimeout(function() { ShowBitmapIndexVisualization(isShowAll, rendererId); }, 500);
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
    RequireJS("bmp_lib_min.js", false, null, null);  // ugly bad legacy feature hack, but not worth rewriting this at the moment
    RequireJS("png_zlib_min.js", false, null, null);
    RequireJS("gbGIS_min.js", false, null, null);
    TestDump(isShowAll, rendererId);
}//ShowBitmapIndexVisualization





// ===============================================================================================
// =========================================== UTILITY ===========================================
// ===============================================================================================

// 2015-02-25 ND: New function for async script loads.
function NewRequireJS(url, fxCallback, userData)
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
}

// Note: This is now mainly just a wrapper for NewRequireJS and RequireJS_LocalOnly.
//       It is only actually used for sync script loads which are deprecated in modern browsers.
//       Sync loads are only used by ShowBitmapIndexVisualization() and this can be cleaned up
//       when that code gets refactored.
// http://stackoverflow.com/questions/950087/how-to-include-a-javascript-file-in-another-javascript-file
function RequireJS(url, isAsync, fxCallback, userData)
{
    if (LOCAL_TEST_MODE) return RequireJS_LocalOnly(url, fxCallback, userData);
    else if (isAsync)    return NewRequireJS(url, fxCallback, userData);

    var ajax = new XMLHttpRequest();    
    ajax.open( 'GET', url, isAsync ); // <-- false = synchronous on main thread
    ajax.onreadystatechange = function ()
    {   
        if (ajax.readyState === 4) 
        {
            switch( ajax.status) 
            {
                case 200:
                    var script = ajax.response || ajax.responseText;
                    var el = document.createElement('script');
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
    };//.bind(this);
    ajax.send(null);
}//RequireJS

function RequireJS_LocalOnly(url, fxCallback, userData) // not sure if this works anymore
{
    document.write('<script src="' + url + '" type="text/javascript"></script>');
    if (fxCallback != null) fxCallback(userData);
}//RequireJS_LocalOnly

// this is actually not a very good way to toggle visibility/display, and
// anything using it should eventually be updated to not do so.
function SwapClassToHideElId(elementid, classHidden, classVisible, isHidden)
{
    var el = document.getElementById(elementid);
    if       (el != null &&  isHidden && el.className == classVisible) el.className = classHidden;
    else if  (el != null && !isHidden && el.className == classHidden)  el.className = classVisible;
}

function QueryString_GetParamAsInt(paramName) // -1 if string was null
{
    var sp = getParam(paramName);
    return sp != null && sp.length > 0 ? parseInt(sp) : -1;
}

function QueryString_IsParamEqual(paramName, compareValue)
{
    var retVal = false;
    
    if (paramName != null)
    {
        var p  = getParam(paramName);
        retVal = p != null && p.length > 0 && p == compareValue;
    }//if
    
    return retVal;
}//QueryString_IsParamEqual

function getParam(name) 
{
    name        = name.replace(/[\[]/, "\\\[").replace(/[\]]/, "\\\]");
    var regexS  = "[\\?&]" + name + "=([^&#]*)";
    var regex   = new RegExp(regexS);
    var results = regex.exec(window.location.href);
    
    return results == null ? "" : results[1];
}//getParam

function IsBrowserOldIE() 
{
    var ua   = window.navigator.userAgent;
    var msie = ua.indexOf("MSIE"); // IE11: "Trident/"
    return msie <= 0 ? false : parseInt(ua.substring(msie + 5, ua.indexOf(".", msie)), 10) < 10;
}//IsBrowserOldIE()
                                 
function GetBaseWindowURL()
{
    return window.location.href.indexOf("?") > -1 ? window.location.href.substr(0, window.location.href.indexOf("?")) : window.location.href;
}//GetBaseWindowURL
                                 
function GetURLWithRemovedTrailingPathIfNeededFromURL(url)
{
    return url.indexOf("/") == url.length - 1 ? url.substr(0, url.length) : url;
}//GetURLWithRemovedTrailingPathIfNeededFromURL







// ===============================================================================================
// ======================================= RT SENSOR VIEWER ======================================
// ===============================================================================================

function RtViewer_Init()
{
    if (_rtvm == null && !IsBrowserOldIE() && "ArrayBuffer" in window)
    {
        var cb = function() {
            _rtvm = new RTVM(map, null);
        };
        
        RequireJS(GetContentBaseUrl() + "rt_viewer_min.js", true, cb, null);
    }//if
}//RtViewer_Init


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
        this.use_bitstores   = BitsProxy.CheckRequirements();
        this.ddlLayersId     = ddlLayersId;
        this.ddlLayers       = document.getElementById(ddlLayersId);
        this.extent_u32      = "ArrayBuffer" in window ? new Uint32Array([0,0,0,0,21,0]) : null; // <- must be 21.
        
        if (this.use_bitstores) this.LoadAsync();
    }
    
    BitsProxy.prototype.fxGetLayerForIdx = function(idx) { return ClientZoomHelper.GetLayerForIdx(idx, overlayMaps); };
    
    // 2015-08-31 ND: reduce function call and enum overhead when loading tiles
    BitsProxy.prototype.CacheAddTileWHZ = function(layerId, px, z)
    {
        if (   this._cached_tilewh        == null
            || this._cached_tilewh.length  < layerId + 1)
        {
            this._cached_tilewh = BitsProxy.vcopy_vfill_sset_u16(this._cached_tilewh, 0xFFFF, layerId, px, 32);
            this._cached_maxz   = BitsProxy.vcopy_vfill_sset_u16(this._cached_maxz,   0xFFFF, layerId, z,  32);
        }//if
        else if (this._cached_tilewh[layerId] == 0xFFFF)
        {
            this._cached_tilewh[layerId] = px;
            this._cached_maxz[layerId]   = z;
        }//if
    };
    
    BitsProxy.prototype.LoadAsync = function()
    {
        var cb = function()
        {
            this.Init();
        }.bind(this);
    
        RequireJS(BitsProxy.relsrc, true, cb, null);
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
        var idx = BitsProxy.GetSelectedLayerIdx();
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
        var isJ = BitsProxy.GetUseJpRegion();
        var url = isJ ? "http://te512jp.safecast.org.s3-ap-northeast-1.amazonaws.com/{z}/{x}/{y}.png"
                      : "http://te512.safecast.org.s3.amazonaws.com/{z}/{x}/{y}.png";        

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
        var isJ = BitsProxy.GetUseJpRegion();
        var url = isJ ? "http://tg512jp.safecast.org.s3-ap-northeast-1.amazonaws.com/{z}/{x}/{y}.png"
                      : "http://tg512.safecast.org.s3.amazonaws.com/{z}/{x}/{y}.png";        

        var opts8 = new LBITSOptions({ lldim:1, ll:1, multi:1, maxz:5, multi:0, url0:BitsProxy.pngsrc, url1:BitsProxy.bitsrc, w:512, h:512 });
        var dcb8  = function(dstr)
        {
            document.getElementById("menu_layers_2_date_label").innerHTML = dstr;
        }.bind(this);
    
        this._layerBitstores.push(new LBITS(8, 2, 14, url, 3, 1, opts8, dcb8));
    };

    BitsProxy.prototype.Init_LayerId03 = function()
    {
        var isJ = BitsProxy.GetUseJpRegion();
        var url = isJ ? "http://nnsajp.safecast.org.s3-ap-northeast-1.amazonaws.com/{z}/{x}/{y}.png"
                      : "http://nnsa.safecast.org.s3.amazonaws.com/{z}/{x}/{y}.png";

        var opts3 = new LBITSOptions({ lldim:1, ll:1, unshd:1, alpha:255, multi:0, url0:BitsProxy.pngsrc, url1:BitsProxy.bitsrc, w:512, h:512 });
        this._layerBitstores.push(new LBITS(3, 5, 15, url, 28, 12, opts3, null));
        // this._layerBitstores.push(new LBITS(3, 2, 15, url, 3, 1, opts3, null));
        // wat? nnsa.safecast.org.s3.amazonaws.com/6/56.65625/24.625.png?d=17026:1 GET http://nnsa.safecast.org.s3.amazonaws.com/6/56.65625/24.625.png?d=17026 403 (Forbidden)
    };

    BitsProxy.prototype.Init_LayerId06 = function()
    {
        var isJ = BitsProxy.GetUseJpRegion();
        var url = isJ ? "http://nurejp.safecast.org.s3-ap-northeast-1.amazonaws.com/{z}/{x}/{y}.png"
                      : "http://nure.safecast.org.s3.amazonaws.com/{z}/{x}/{y}.png";
        
        var opts6 = new LBITSOptions({ lldim:1, ll:1, multi:0, url0:BitsProxy.pngsrc, url1:BitsProxy.bitsrc, w:512, h:512 });
        this._layerBitstores.push(new LBITS(6, 1, 11, url, 0, 0, opts6, null));
    };
    
    BitsProxy.prototype.Init_LayerId09 = function()
    {
        var isJ = BitsProxy.GetUseJpRegion();
        var url = isJ ? "http://aistjp.safecast.org.s3-ap-northeast-1.amazonaws.com/{z}/{x}/{y}.png"
                      : "http://aist.safecast.org.s3.amazonaws.com/{z}/{x}/{y}.png";

        var opts9 = new LBITSOptions({ lldim:1, ll:1, multi:0, url0:BitsProxy.pngsrc, url1:BitsProxy.bitsrc, w:512, h:512 });
        this._layerBitstores.push(new LBITS(9, 2, 11, url, 3, 1, opts9, null));
    };

    BitsProxy.prototype.Init_LayerId16 = function()
    {
        var isJ = BitsProxy.GetUseJpRegion();
        var url = isJ ? "http://aujp.safecast.org.s3-ap-northeast-1.amazonaws.com/{z}/{x}/{y}.png"
                      : "http://au.safecast.org.s3.amazonaws.com/{z}/{x}/{y}.png";
        
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
    
    BitsProxy.prototype.StatusReport = function()
    {
        var txt = "\n";
        txt += "============= BitsProxy Status Report ==============\n";
        txt += "         Ready: " + (this._bs_ready ? "[Yes]" : " [NO]") + "\n";
        txt += "     Bitstores: " + (this._layerBitstores == null ? "<NULL>" : "" + this._layerBitstores.length) + "\n";
        txt += "Loads approved: " + this._debug_loads + "\n";
        txt += "Loads rejected: " + this._debug_noloads + "\n";
        
        if (this._layerBitstores == null) 
        {
            txt += "=============      END OF REPORT      ==============\n";
            console.log(txt);
            return;
        }//if
        
        
        txt += "=============      Bitstore List      ==============\n";
        
        for (var i=0; i<this._layerBitstores.length; i++)
        {
            var bs = this._layerBitstores[i];
        
            if (bs != null)
            {
                txt += "LBS[" + i + "]: layerId=" + bs.layerId + ", ";
                txt += "bitstores=" + (bs.bitstores == null ? "<NULL>" : bs.bitstores.length) + ", ";
                txt += "ready=" + (bs.isReady ? "Y" : "N") + ", ";
                
                var dc = 0;
                
                for (var j=0; j<bs.bitstores.length; j++)
                {
                    var bits = bs.bitstores[j];
                    
                    dc += bits.GetDataCount();
                }//for
                
                txt += "dataCount=" + dc;
                txt += ", extent=(" + bs.extent[0].toLocaleString();
                txt += " ~~ "       + bs.extent[1].toLocaleString();
                txt += ") ("        + bs.extent[2].toLocaleString();
                txt += " ~~ "       + bs.extent[3].toLocaleString();
                txt += ")";
                txt += "\n";
                
                if (bs.layerId != -9000)
                {
                    for (var j=0; j<bs.bitstores.length; j++)
                    {
                        var bits  = bs.bitstores[j];
                        var src   = null;
                        var src_n = 0;
                        
                        
                        if (bits != null && bits.data != null)
                        {
                            src = bits.GetNewPlanar8FromBitmap(1, 0);
                            
                            for (var k=0; k<src.length; k++)
                            {
                                if (src[k] != 0) src_n++;
                            }//for
                        }//if
                        
                        
                        txt += " +-- ";
                        txt += "(" + bits.x + ", " + bits.y + ") @ " + bits.z;
                        txt += ", dc=" + bits.GetDataCount();
                        txt += ", ready=" + (bits.isReady ? "Y" : "N");
                        txt += ", data.length=" + (bits.data != null ? bits.data.length : "<NULL>");
                        txt += ", src_n=" + src_n;
                        
                        txt += ", extent=(" + bits.extent[0].toLocaleString();
                        txt += " ~~ "       + bits.extent[1].toLocaleString();
                        txt += ") ("        + bits.extent[2].toLocaleString();
                        txt += " ~~ "       + bits.extent[3].toLocaleString();
                        txt += ")\n";
                        
                        if (bits.data != null && src != null)
                        {
                            var x, y, src_idx, dest_idx;
                            var imgpre = "   +- ";
                            //var src    = bits.GetNewPlanar8FromBitmap(1, 0);
                            var src_w  = bits.img_width;
                            var src_h  = bits.img_height;
                        
                            var w_rsn  = 2;
                            var h_rsn  = 4;
                            var dest_w = src_w >>> w_rsn;
                            var dest_h = src_h >>> h_rsn;
                        
                            var dest   = new Uint8Array(dest_w * dest_h);
                        
                            for (y = 0; y < src_h; y++)
                            {
                                for (x = 0; x < src_w; x++)
                                {
                                    src_idx = y * src_w + x;
                                    
                                    if (src[src_idx] != 0)
                                    {
                                        dest_idx = (y >>> h_rsn) * dest_w + (x >>> w_rsn)
                                        dest[dest_idx] = 1;
                                    }//if
                                }//for x
                            }//for y
                            
                            var imgdiv = imgpre + "[";
                            for (x = 0; x < dest_w; x++) { imgdiv += "="; }//for
                            imgdiv += "]\n";
                            txt += imgdiv;
                            
                            for (y = 0; y < dest_h; y++)
                            {
                                txt += imgpre + "[";
                                
                                for (x = 0; x < dest_w; x++)
                                {
                                    dest_idx = y * dest_w + x;
                                    
                                    txt += dest[dest_idx] != 0 ? "█" : " ";
                                }//for x
                                
                                txt += "]\n";
                            }//for y
                            
                            txt += imgdiv;
                            
                        }//if (bits.data != null)

                    }//for (j/bits)
                }//if (bitstores n < 10)
            }//if (LBITS IS NOT NULL)
            else
            {
                txt += "LBS[" + i + "]: <NULL>\n"; 
            }//else
        }//for
        
        txt += "=============      END OF REPORT      ==============\n";
        
        console.log(txt);
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
        
        //var wh    = this.GetTileWidthHeightForLayer(layerId);
        //var max_z = this.GetBaseMaxZForLayer(layerId);
        
        // *** HACK ***
        if (BitsProxy.GetIsRetina() && z == max_z)
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
            
    BitsProxy.vfill = function(x,d,n) { for(var i=0;i<n;i++)d[i]=x; };
    BitsProxy.vcopy = function(d,od,s,os,n) { d.subarray(od,od+n).set(s.subarray(os,os+n)); };
    
    BitsProxy.vcopy_vfill_sset_u16 = function(src, fill, idx, val, n_pad)
    {
        var dest = new Uint16Array(idx + n_pad);
        BitsProxy.vfill(fill, dest, dest.length);
        if (src != null) BitsProxy.vcopy(dest, 0, src, 0, src.length);
        dest[idx] = val;
        return dest;
    };
    
    BitsProxy.GetIsRetina                 = function()     { return GetIsRetina(); };
    BitsProxy.GetQueryString_IsParamEqual = function(p, v) { return QueryString_IsParamEqual(p, v); };
    BitsProxy.GetIsBrowserOldIE           = function()     { return IsBrowserOldIE(); };
    BitsProxy.GetSelectedLayerIdx         = function()     { return LayersHelper.GetSelectedIdx(); };
    BitsProxy.GetUseJpRegion              = function()     { return _use_jp_region; };
    BitsProxy.GetContentBaseUrl           = function()     { return GetContentBaseUrl(); };
    
    BitsProxy.relsrc = BitsProxy.GetContentBaseUrl() + "bitstore_min.js";
    BitsProxy.bitsrc = "http://safecast.org/tilemap/bitstore_min.js";
    BitsProxy.pngsrc = "http://safecast.org/tilemap/png_zlib_worker_min.js";
    
    BitsProxy.CheckRequirements = function()
    {
        return !BitsProxy.GetQueryString_IsParamEqual("noIndices", "1") && !BitsProxy.GetIsBrowserOldIE() && "ArrayBuffer" in window && "bind" in Function.prototype;
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
            LoadingSpinnerHelper.InjectLoadingSpinner(el, "#FFF", 2, 144);
        
            var cb = function()
            {
                this._hud = new HUD(map, el);
                this._hud.SetFxCheckBitstores(function(layerId, x, y, z) { return _bitsProxy.ShouldLoadTile(layerId, x, y, z); }.bind(this));
                
                this._hud.SetFxCheckSize(function(layerId) { return _bitsProxy.GetTileWidthHeightForLayer(layerId); }.bind(this));
                this._hud.SetFxCheckMaxZ(function(layerId) { return _bitsProxy.GetBaseMaxZForLayer(layerId); }.bind(this));
                
                if (this.last_hud_layers != null) this._hud.SetLayers(this.last_hud_layers);
                
                fxCallback(userData);
            }.bind(this);

            RequireJS(GetContentBaseUrl() + "hud_min.js", true, cb, null);
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
    
    HudProxy.elGet    = function(id)         { return document.getElementById(id); };
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
        this._noreqs = !BvProxy.CheckRequirements();
        
        this.fxSwapClassToHideElId  = function(elementid, classHidden, classVisible, isHidden) { SwapClassToHideElId(elementid, classHidden, classVisible, isHidden); }.bind(this);
        this.fxRequireJS            = function(url, isAsync, fxCallback, userData) { RequireJS(url, isAsync, fxCallback, userData); }.bind(this);
        this.fxInjectLoadingSpinner = function(el, color, str_w, size_px) { LoadingSpinnerHelper.InjectLoadingSpinner(el, color, str_w, size_px); }.bind(this);
        this.fxUpdateMapExtent      = function() { MapExtent_OnChange(200); }.bind(this);
        this.fxIsDefaultLocation    = function() { return IsDefaultLocation(); }.bind(this);
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
        
            this.fxRequireJS(GetContentBaseUrl() + "bgeigie_viewer_min.js", true, cb, null);
        }//else
    };
    
    
    BvProxy.prototype.BindEventsUI = function()
    {
        if (this._noreqs) return;
        
        var i = document.getElementById("bv_bvImgPreview");
        if (i.src == null || i.src.length == 0) i.src = GetContentBaseUrl() + "bgpreview_118x211.png";
    
        BvProxy.aListId("bv_btnDoneX", "click", function() { this.btnDoneOnClick(); }.bind(this) );
        BvProxy.aListId("bv_btnOptions", "click", function() { this.UI_ShowAdvPanel(); }.bind(this) );
        BvProxy.aListId("bv_btnRemoveAll", "click", function() { this.btnRemoveLogsOnClick(); }.bind(this) );
        BvProxy.aListId("bv_btnSearch", "click", function() { this.btnAddLogsOnClick(); }.bind(this) );
        BvProxy.aListId("bv_ddlQueryType", "change", function() { this.UI_ddlQueryType_OnSelectedIndexChanged(); }.bind(this) );
        
        BvProxy.aListId("bv_btnAdvDoneX", "click", function() { this.UI_btnAdvDoneOnClick(); }.bind(this) );
        BvProxy.aListId("bv_btnAdvDone", "click", function() { this.UI_btnAdvDoneOnClick(); }.bind(this) );
        BvProxy.aListId("bv_ddlMarkerType", "change", function() { this.UI_ddlMarkerType_OnSelectedIndexChanged(); }.bind(this) );
        
        var mcb = function() { this.UI_MarkerCustomOnChange(); }.bind(this);
        
        BvProxy.aListId("bv_tbMarkerShadowRadius", "change", mcb);
        BvProxy.aListId("bv_tbMarkerStrokeAlpha", "change", mcb);
        BvProxy.aListId("bv_tbMarkerFillAlpha", "change", mcb);
        BvProxy.aListId("bv_chkMarkerBearing", "change", mcb);
        BvProxy.aListId("bv_tbMarkerSize", "change", mcb);
        BvProxy.aListId("bv_tbParallelism", "change", function() { this.UI_ParallelismOnChange(); }.bind(this) );
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
        var csv         = BvProxy.elVal("bv_tbLogIDs");
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
        return BvProxy.ddlVal("bv_ddlSubtype");
    };

    BvProxy.prototype.UI_GetStatusTypeParamIfPresent = function()
    {
        return BvProxy.ddlVal("bv_ddlStatusType");
    };
    
    BvProxy.prototype.UI_GetStartDateParamIfPresent = function()
    {
        return BvProxy.GetApiDateTimeParam(BvProxy.elVal("bv_tbStartDate"), true);
    };
    
    BvProxy.prototype.UI_GetEndDateParamIfPresent = function()
    {
        return BvProxy.GetApiDateTimeParam(BvProxy.elVal("bv_tbEndDate"), false);
    };
    
    BvProxy.prototype.UI_GetQueryType = function()
    {
        return BvProxy.ddlIdx("bv_ddlQueryType");
    };
    
    //BvProxy.prototype.UI_GetMaxPages = function()
    //{
    //    return parseInt(BvProxy.ddlVal("bv_ddlMaxPages"));
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
        if (parseInt(BvProxy.elVal("bv_tbParallelism")) == 1)
        {
            BvProxy.elSetVal("bv_tbParallelism", navigator.hardwareConcurrency != null ? navigator.hardwareConcurrency : 4); 
        }//if
    };

    BvProxy.prototype.UI_UpdateTbPlaceholderText = function()
    {
        var tb = BvProxy.elGet("bv_tbLogIDs");
        var qt = this.UI_GetQueryType();
        tb.placeholder = qt == 0 ? "Enter bGeigie Log ID(s)" : qt == 1 ? "Enter User ID" : "Enter Search Text";
    };





    BvProxy.prototype.UI_ShowAdvPanel = function()
    {
        this.UI_SetDefaultParallelism();
        BvProxy.setCls("bv_bvPanelQuery", "bv_bvPanelVisible");
    };
    
    BvProxy.prototype.UI_btnAdvDoneOnClick = function() 
    {
        BvProxy.setCls("bv_bvPanelQuery", "bv_bvPanelHidden");
    };

    BvProxy.prototype.UI_ddlQueryType_OnSelectedIndexChanged = function()
    {
        var d = this.UI_GetQueryType() == 0;
        BvProxy.elDis("bv_tbStartDate", d);
        BvProxy.elDis("bv_tbEndDate", d);
        BvProxy.elDis("bv_ddlStatusType", d);
        //BvProxy.elDis("bv_ddlMaxPages", d);
        BvProxy.elDis("bv_ddlSubtype", d);
        this.UI_UpdateTbPlaceholderText();
    };

    BvProxy.prototype.UI_ddlMarkerType_OnSelectedIndexChanged = function()
    {
        var i = BvProxy.ddlIdx("bv_ddlMarkerType");
        if (i != 5) this.ChangeMarkerType(i);
        else this.UI_MarkerCustomOnChange();
        var d = i != 5;
        BvProxy.elDis("bv_tbMarkerSize", d);
        BvProxy.elDis("bv_chkMarkerBearing", d);
        BvProxy.elDis("bv_tbMarkerFillAlpha", d);
        BvProxy.elDis("bv_tbMarkerStrokeAlpha", d);
        BvProxy.elDis("bv_tbMarkerShadowRadius", d);
        BvProxy.trHide("bv_trMarkerSize", d);
        BvProxy.trHide("bv_trMarkerBearing", d);
        BvProxy.trHide("bv_trMarkerFillAlpha", d);
        BvProxy.trHide("bv_trMarkerStrokeAlpha", d);
        BvProxy.trHide("bv_trMarkerShadowRadius", d);
    };

    BvProxy.prototype.UI_MarkerCustomOnChange = function()
    {
        var sz = parseInt(BvProxy.elVal("bv_tbMarkerSize"));
        var cb = BvProxy.elGet("bv_chkMarkerBearing").checked;
        var fa = parseFloat(BvProxy.elVal("bv_tbMarkerFillAlpha"));
        var sa = parseFloat(BvProxy.elVal("bv_tbMarkerStrokeAlpha"));
        var sr = parseFloat(BvProxy.elVal("bv_tbMarkerShadowRadius"));
        
        this.SetNewCustomMarkerOptions(sz, sz, fa*0.01, sa*0.01, sr, cb);    
    };

    BvProxy.prototype.UI_ParallelismOnChange = function()
    {
        var p = parseInt(BvProxy.elVal("bv_tbParallelism")); 
        this.SetParallelism(p);
    };
    
    BvProxy.prototype.ShowRequirementsError = function()
    {
        alert("Error: Your browser does not meet the requirements necessary to use this feature.  Chrome 41+ is recommended.");
    };
    
    BvProxy.prototype.GetUiContentAsync = function(fxCallback, userData) // do not call directly!
    {
        var el = BvProxy.elGet("bv_bvPanel");
        if (el != null) 
        {
            if (fxCallback != null) fxCallback(userData); 
            return; 
        }//if
        
        var url = GetContentBaseUrl() + "bgeigie_viewer_inline.html";
        var req = new XMLHttpRequest();
        req.open("GET", url, true);
        req.onreadystatechange = function()
        {   
            if (req.readyState === 4 && req.status == 200)
            {
                el = document.createElement("div");
                el.innerHTML = req.response || req.responseText;
                document.body.appendChild(el);
                
                var e2 = BvProxy.elGet("bv_loading");
                if (e2 != null) document.body.removeChild(e2);
                
                this.BindEventsUI();
                
                if (fxCallback != null) fxCallback(userData);
            }//if
        }.bind(this);
        req.send(null);
    };
    
    BvProxy.prototype.GetUiContentStylesAsync = function(fxCallback, userData)
    {
        var el = BvProxy.elGet("bv_bvPanel");
        if (el != null) 
        {
            if (fxCallback != null) fxCallback(userData); 
            return; 
        }//if
        
        var e2 = document.createElement("div");
        e2.id = "bv_loading";
        e2.style.cssText = "position:absolute;display:block;top:0;bottom:0;left:0;right:0;width:144px;height:144px;margin:auto;";
        this.fxInjectLoadingSpinner(e2, "#FFF", 2, 144);
        document.body.appendChild(e2);

        var url = GetContentBaseUrl() + "bgeigie_viewer_inline.css";
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
    
    BvProxy.GetApiDateTimeParam = function(rfc_date, isStartDate) 
    {
        if (rfc_date == null || rfc_date.length == 0) return "";

        return (isStartDate ? "&uploaded_after=" : "&uploaded_before=") + BvProxy.GetApiDateTimeForRFCDate(rfc_date, isStartDate);
    };
    
    BvProxy.GetApiDateTimeForRFCDate = function(rfc_date, isMidnight)
    {
        rfc_date = new Date(rfc_date).toISOString();
    
        var yy = rfc_date.substring(0, 0+4);
        var mm = rfc_date.substring(5, 5+2);
        var dd = rfc_date.substring(8, 8+2);
        
        // 2016-03-26 ND: weird date format doesn't seem needed anymore, going with ISO dates
        //return mm + "%2F" + dd + "%2F" + yy + "+" + (isMidnight ? "00%3A00%3A00" : "23%3A59%3A59");
        return yy + "-" + mm + "-" + dd + "T" + (isMidnight ? "00%3A00%3A00" : "23%3A59%3A59") + "Z";
    };
    
    BvProxy.CheckRequirements = function()
    {
        var meets_req = !BvProxy.IsBrowserOldIE() && ("bind" in Function.prototype) && ("ArrayBuffer" in window);
        return meets_req;
    };

    BvProxy.IsBrowserOldIE = function() 
    {
        var ua   = window.navigator.userAgent;
        var msie = ua.indexOf("MSIE "); // IE11: "Trident/"
        return msie <= 0 ? false : parseInt(ua.substring(msie + 5, ua.indexOf(".", msie)), 10) < 10;
    };

    BvProxy.elGet    = function(id)         { return document.getElementById(id); };
    BvProxy.setCls   = function(id, c)      { BvProxy.elGet(id).className = c; };
    BvProxy.trHide   = function(id, isHide) { BvProxy.elGet(id).style.display = isHide ? "none" : "table-row"; };
    BvProxy.elDis    = function(id, isDis)  { BvProxy.elGet(id).disabled = isDis; };
    BvProxy.elVal    = function(id)         { return BvProxy.elGet(id).value; };
    BvProxy.elSetVal = function(id,v)       { BvProxy.elGet(id).value = v; };
    BvProxy.ddlIdx   = function(id)         { return BvProxy.elGet(id).selectedIndex; };
    BvProxy.ddlVal   = function(id)         { var a=BvProxy.elGet(id); return a.options[a.selectedIndex].value; };
    BvProxy.classGet = function(c)          { return document.getElementsByClassName(c); };
    BvProxy.tagGet   = function(t)          { return document.getElementsByTagName(t); };
    
    BvProxy.aList    = function(el,ev,fx) { el.addEventListener(ev, fx, false); };
    BvProxy.aListId  = function(id,ev,fx) { BvProxy.aList(BvProxy.elGet(id), ev, fx); }


    return BvProxy;
})();










// ===============================================================================================
// ======================================== FLY-TO-EXTENT ========================================
// ===============================================================================================

// FlyToExtent: static class container to keep function clutter out of global space / make maintenance
// easier.

var FlyToExtent = (function()
{
    function FlyToExtent() 
    {
    }
    
    //FlyToExtent.MapRef             = window.map;
    FlyToExtent.fxShowLocationText = function(txt) { ShowLocationText(txt); };
    FlyToExtent.fxUpdateMapExtent  = function()    { MapExtent_OnChange(0); MapExtent_OnChange(1); };
    
    FlyToExtent.GoToPresetLocationIdIfNeeded = function(locId)
    {
        var p = null;
        
        switch(locId)
        {
            case 0: // ahhh
            case 8: // i'm
            case 9: // falling
            case 1: // through
                p = [-163.0, -78.1, 178.0, 85.05, 0, 17, "Earth"];
                break;
            case 2:
                p = [124.047, 24.309, 146.433, 46.116, 5, 15, "Japan"];
                break;
            case 3:
                p = [138.785, 35.143, 141.125, 38.234, 6, 16, "Honshu, Japan"];
                break;
            case 4:
                p = [-168.08, 24.712, -53.337, 71.301, 1, 12, "North America"];
                break;
            case 5:
                p = [112.81, -43.07, 154.29, -9.85, 2, 12, "Australia"];
                break;
            case 6:
                p = [124.047, 24.309, 146.433, 46.116, 5, 12, "Japan"];
                break;
            case 7:
                p = [129.76, 31.21, 144.47, 45.47, 5, 15, "Japan"];
                break;
        }//switch
    
        if (p != null) FlyToExtent.GoToLocationWithTextIfNeeded(p[0], p[1], p[2], p[3], p[4], p[5], p[6])
    };
    
    FlyToExtent.GetCurrentVisibleExtent = function()
    {
        var b   = map.getBounds();
        var y0  = b.getSouthWest().lat();
        var x0  = b.getSouthWest().lng();
        var y1  = b.getNorthEast().lat();
        var x1  = b.getNorthEast().lng();
        var z   = map.getZoom();
        var ex0 = -9000.0;
        var ex1 = -9000.0;
        
        if (x0 > x1) // 180th meridian handling -- need to split into second extent
        {            // but, y-coordinates stay the same, so only need two more x-coordinates.
            ex1 = x1;
            x1  =  180.0;
            ex0 = -180.0;
        }//if
        
        return [x0, y0, x1, y1, ex0, ex1, z];
    };
    
    FlyToExtent.IsIntersectingExtents = function(ex0, ex1)
    {
        return !(ex0[2] < ex1[0] || ex0[0] > ex1[2] || ex0[3] < ex1[1] || ex0[1] > ex1[3]);
    };
    
    FlyToExtent.GoToLocationWithTextIfNeeded = function(x0, y0, x1, y1, min_z, z, txt)
    {
    // first, don't bother if the user is already looking at it.
    
    var vis        = FlyToExtent.GetCurrentVisibleExtent();
    var already_in = true;//vis[6] <= z; // past max zoom level isn't in, at all.
    
    if (already_in)
    {
        already_in = vis[6] >= min_z; // past min zoom level of layer
    }//if
    
    if (already_in)
    {
        already_in = FlyToExtent.IsIntersectingExtents(vis, [x0, y0, x1, y1]);
        
        if (!already_in && vis[4] != -9000.0) // handle 180th meridian spans
        {
            already_in = FlyToExtent.IsIntersectingExtents([vis[4], vis[1], vis[5], vis[3]], [x0, y0, x1, y1]);
        }//if
    }//if
    
    if (already_in || !("requestAnimationFrame" in window)) return;

    // but if they aren't looking at it, then fly to it.

    var yxz   = FlyToExtent.GetRegionForExtentAndClientView_EPSG4326(x0, y0, x1, y1);
    var stops = new Array();
    var zoom_out_dest = yxz[1] > 4 ? 4 : yxz[1];
    
    // 1. zoom way out.  maybe should be proportional to the distance?
    if (vis[6] > zoom_out_dest)
    {
        for (var dz = vis[6] - 1; dz >= zoom_out_dest; dz--)
        {
            stops.push( { x:null, y:null, z:dz, t:50 } );
        }//for
    }//if
    else if (vis[6] < zoom_out_dest) // or maybe zoom in (less likely)
    {
        stops.push( { x:null, y:null, z:zoom_out_dest, t:50 } );
    }//else if
        
    // 2. pan to the new centroid, but first reproject
    var src_c    = FlyToExtent.GetNormalizedMapCentroid(); // you'd think the fucking framework would do this
    var dest_lat = yxz[0].lat();
    var dest_lon = yxz[0].lng();    
    var src_mxy  = FlyToExtent.LatLonToXYZ_EPSG3857(src_c.y, src_c.x, zoom_out_dest);
    var dest_mxy = FlyToExtent.LatLonToXYZ_EPSG3857(dest_lat, dest_lon, zoom_out_dest);
    var src_x    = src_mxy[0];
    var src_y    = src_mxy[1];
    var dest_x   = dest_mxy[0];
    var dest_y   = dest_mxy[1];
    var yd       = dest_y > src_y ? dest_y - src_y : src_y - dest_y;
    var xd       = dest_x > src_x ? dest_x - src_x : src_x - dest_x;
    
    var is_180_span = false; // span 180th meridian if shorter.  this reverses everything.
    var m180_w      = 256 << zoom_out_dest;
    var m180_x0     = src_x < dest_x ?  src_x : dest_x;
    var m180_x1     = src_x < dest_x ? dest_x :  src_x;
    var m180_d      = m180_x0 + (m180_w - m180_x1);
    
    if (m180_d < xd)
    {
        xd = m180_d;
        is_180_span = true;
    }//if
    
    var maxd     = yd > xd ? yd : xd;
    var x_stride = xd / maxd;
    var y_stride = yd / maxd;

    if (dest_x < src_x && !is_180_span) x_stride = 0.0 - x_stride;
    if (dest_x > src_x &&  is_180_span) x_stride = 0.0 - x_stride;
    if (dest_y < src_y) y_stride = 0.0 - y_stride;
       
    // this results in normal 1px moves for one axis, and fractional movement for another.
    // note if/when the API ever allows for showing non-integral zoom levels, this will need to be normalized accordingly.
    
    var px_skip = maxd > 50 ? 50 : 1; // 1px at a time is slow.
    
    x_stride *= px_skip;
    y_stride *= px_skip;
    
    var did_reach_dest = false;
    var xlt, ylt, next_x, next_y;
    var rel_x = 0.0;
    var rel_y = 0.0;
    var int_x = 0.0;
    var int_y = 0.0;
    var net_x = src_x;
    var net_y = src_y;
    
    for (var i=0; i<maxd; i+=px_skip)
    {
        next_x = parseInt(rel_x - int_x + x_stride); // accumulate fracs
        next_y = parseInt(rel_y - int_y + y_stride);
        
        if (!is_180_span) xlt = x_stride > 0.0 ? src_x + next_x < dest_x : src_x + next_x > dest_x;
        else              xlt = x_stride > 0.0 ? src_x + next_x > dest_x : src_x + next_x < dest_x;
        
        ylt = y_stride > 0.0 ? src_y + next_y < dest_y : src_y + next_y > dest_y;
        
        if ((next_x != 0 || next_y != 0) && !did_reach_dest)
        {
            if (!xlt || !ylt)
            {
                did_reach_dest = true;
                next_x = dest_x - net_x;
                next_y = dest_y - net_y;
            }
        
            stops.push( { x:next_x, y:next_y, z:null, t:1 } );
            
            
            net_x += next_x;
            net_y += next_y;
        }//if
        
        rel_x += x_stride;
        rel_y += y_stride;
        int_x = Math.floor(rel_x);
        int_y = Math.floor(rel_y);
    }//for
    
    if (!did_reach_dest && px_skip != 1.0 && (net_x != dest_x || net_y != dest_y)) // correct final point
    {
        stops.push( { x:(dest_x-net_x), y:(dest_y-net_y), z:null, t:1 } );
    }//if
    
    // 3. now finally zoom in
    if (zoom_out_dest < yxz[1])
    {
        for (var dz = zoom_out_dest + 1; dz <= yxz[1]; dz++)
        {
            stops.push( { x:null, y:null, z:dz, t:50 } );
        }//for
    }//if
    
    FlyToExtent.ProcessFlyToStops(stops, txt, 0);
    };
    
    
    FlyToExtent.ProcessFlyToStops = function(stops, txt, start_idx)
    {
        if (start_idx == stops.length)  // end of flight
        {
            setTimeout(function() 
            {
                FlyToExtent.fxShowLocationText(txt);
                FlyToExtent.fxUpdateMapExtent();
            }, 500);
        
            return;
        }//if
    
        var stop = stops[start_idx];
    
        if (stop.z != null && start_idx > 0 && stops[start_idx-1].x != null) // short delay at end of panning for animation lag
        {
            setTimeout(function() 
            {
                requestAnimationFrame(function() 
                {
                    map.setZoom(stop.z);
                    if (stop.x != null) map.panBy(stop.x, stop.y);
                    setTimeout(function() { FlyToExtent.ProcessFlyToStops(stops, txt, start_idx+1); }, stop.t);
                });
            }, 100);
        }//if
        else if (stop.z != null)
        {
            requestAnimationFrame(function() 
            {
                map.setZoom(stop.z);
                if (stop.x != null) map.panBy(stop.x, stop.y); // shouldn't happen at the moment
                setTimeout(function() { FlyToExtent.ProcessFlyToStops(stops, txt, start_idx+1); }, stop.t);
            });
        }//if
        else
        {   
            requestAnimationFrame(function() { map.panBy(stop.x, stop.y); FlyToExtent.ProcessFlyToStops(stops, txt, start_idx+1); });
        }//else
    };
    
    
    FlyToExtent.GetRegionForExtentAndClientView_EPSG4326 = function(x0, y0, x1, y1)
    {
        var vwh = FlyToExtent.GetClientViewSize();
        return FlyToExtent.GetRegionForExtentAndScreenSize_EPSG4326(x0, y0, x1, y1, vwh[0], vwh[1]);
    };

    FlyToExtent.GetCentroidForLatLonRegion = function(x0, y0, x1, y1)
    {
        var mxy0 = FlyToExtent.LatLonToXYZ_EPSG3857(y1, x0, 21);
        var mxy1 = FlyToExtent.LatLonToXYZ_EPSG3857(y0, x1, 21);
        var mx0 = mxy0[0];
        var my0 = mxy0[1];
        var mx1 = mxy1[0];
        var my1 = mxy1[1];
        var mcx = parseInt(mx0 + (mx1 - mx0) * 0.5);
        var mcy = parseInt(my0 + (my1 - my0) * 0.5);
        var ll = FlyToExtent.XYZtoLatLon_EPSG3857(mcx, mcy, 21);
        return ll;
    };
    
    FlyToExtent.GetRegionForExtentAndScreenSize_EPSG4326 = function(x0, y0, x1, y1, vw, vh)
    {
        var ll  = FlyToExtent.GetCentroidForLatLonRegion(x0, y0, x1, y1);
        var yx0 = new google.maps.LatLng(ll[0], ll[1]);
        var dz  = 3;
        
        vw *= 1.1; // add some overscan
        vh *= 1.1;

        for (var z = 20; z >= 0; z--)
        {
            var mxy0 = FlyToExtent.LatLonToXYZ_EPSG3857(y1, x0, z);
            var mxy1 = FlyToExtent.LatLonToXYZ_EPSG3857(y0, x1, z);

            if (Math.abs(mxy1[0] - mxy0[0]) < vw && Math.abs(mxy1[1] - mxy0[1]) < vh)
            {
                dz = z;
                break;
            }//if
        }//for
    
        return [yx0, dz];
    };
    
    FlyToExtent.GetClientViewSize = function()
    {
        var _w = window,
            _d = document,
            _e = _d.documentElement,
            _g = _d.getElementsByTagName("body")[0],
            vw = _w.innerWidth || _e.clientWidth || _g.clientWidth,
            vh = _w.innerHeight|| _e.clientHeight|| _g.clientHeight;
        
        return [vw, vh];
    };
    
    FlyToExtent.ClampLatToMercPlane = function(lat) { return lat > 85.05112878 ? 85.05112878 : lat < -85.05112878 ? -85.05112878 : lat; };
    
    FlyToExtent.LatLonToXYZ_EPSG3857 = function(lat, lon, z)
    {
        var x  = (lon + 180.0) * 0.002777778;
        var s  = Math.sin(lat * 0.0174532925199);
        var y  = 0.5 - Math.log((1.0 + s) / (1.0 - s)) * 0.0795774715459;
        var w  = 256 << z;
        var px = parseInt(x * w + 0.5);
        var py = parseInt(y * w + 0.5);
        return [px, py];
    };

    FlyToExtent.XYZtoLatLon_EPSG3857 = function(x, y, z)
    {
        var w = 256 << z;
        var r = 1.0  / w;
        x = x * r - 0.5;
        y = 0.5 - y * r;
        var lat = 90.0 - 360.0 * Math.atan(Math.exp(-y * 6.283185307179586476925286766559)) * 0.31830988618379067153776752674503;
        var lon = 360.0 * x;
        return [lat, lon];
    };
    
    FlyToExtent.GetNormalizedMapCentroid = function()
    {
        var centroid = map.getCenter();
        var clat = FlyToExtent.ClampLatToMercPlane(centroid.lat()); // valid here because only being used to convert to EPSG:3857
        var clon = centroid.lng();
    
        if (clon > 180.0 || clon < -180.0) clon = clon % 360.0 == clon % 180.0 ? clon % 180.0 : (clon > 0.0 ? -1.0 : 1.0) * 180.0 + (clon % 180.0); // thanks Google
    
        return { y:clat, x:clon };
    };
    
    return FlyToExtent;
})();



// ===============================================================================================
// ================================= TEMPORARY UI TEXT / IMAGES ==================================
// ===============================================================================================

function GetLocationText_Container(w_px, h_px)
{
    var e           = document.createElement("div");
    var s           = e.style;
    
    e.id            = "location_text";
    s.pointerEvents = "none";
    s.position      = "absolute"; // rel position: DkS2 style; abs position: DkS1 style
    s.display       = "block";
    s.top           = "0px";
    s.bottom        = "0px";
    s.left          = "0px";
    s.right         = "0px";
    s.width         = w_px.toFixed(0) + "px";
    s.height        = h_px.toFixed(0) + "px";
    s.margin        = "auto";
    s.textAlign     = "center";
    s.opacity       = "0.0";
    //s.transition    = "0.25s opacity";    // 2016-08-11 ND: Test for CSS3 animation

    return e;
}

function GetLocationText_Text(txt, font_size, stroke_width, is_webkit)
{
    var e = document.createElement("div");
    var s = e.style;

    s.fontFamily    = "'Crimson Text'";
    s.fontSize      = font_size.toFixed(0) + "px";
    s.textAlign     = "center";
    s.verticalAlign = "middle";
    s.color         = "#FFF";
    s.zIndex        = "1";
    s.position      = "absolute";
    s.left          = "0px";
    s.right         = "0px";
    s.margin        = "auto";

    if (is_webkit)
    {
        s["-webkit-text-fill-color"]   = "#FFF";
        s["-webkit-text-stroke-color"] = "#000";
        s["-webkit-text-stroke-width"] = stroke_width.toFixed(1) + "px";
        s.textShadow                   = "0px 0px 1px #000";
    }//if
    else
    {
        s.textShadow = "0px 0px 2px #000";
    }//else

    e.innerHTML = txt;
    
    return e;
}

function GetLocationText_Hr(w_px, h_px, t_px)
{
    var e = document.createElement("hr");
    var s = e.style;
    
    s.position        = "absolute";
    s.width           = w_px.toFixed(0) + "px";
    s.height          = h_px.toFixed(0) + "px";
    s.top             = t_px.toFixed(0) + "px";
    s.left            = "0px";
    s.right           = "0px";
    s.margin          = "auto";
    s.border          = "1px solid #000";
    s.zIndex          = "0";
    s.backgroundColor = "#FFF";

    return e;
}

function GetLocationText_TextShadowLabel(txt, font_size, ox, oy, sx, sy, sr)
{
    var e = GetLocationText_Text(txt, font_size, 0, false);
    var s = e.style;

    s.color      = "#000";
    s.zIndex     = "0";
    s.top        = oy.toFixed(0) + "px";
    s.textShadow = sx.toFixed(0) + "px" + " "
                 + sy.toFixed(0) + "px" + " "
                 + sr.toFixed(0) + "px" + " #000";
    if (ox > 0)
    {
        s.left   = ox.toFixed(0) + "px";
    }//if
    else if (ox < 0)
    {
        ox      *= -1.0;
        s.right  = ox.toFixed(0) + "px";
    }//else if

    return e;
}

function ShowLocationText(txt)
{
    InitFont_CrimsonText();

    var map_w = (window.outerWidth || window.innerWidth || document.getElementById("map_canvas").offsetWidth) - 60.0;

    if (map_w * window.devicePixelRatio < 400) { return; }

    var is_webkit    = "WebkitAppearance" in document.documentElement.style;

    var scale        = map_w < 1200 && map_w != 0 ? map_w / 1200.0 : 1.0;

    var el_width     = Math.floor(1200.0 * scale);
    var el_height    = Math.floor(144.0 * scale);
    var el2_fontsize = Math.floor(96.0 * scale);
    var el2_str_w    = 2.0 * scale;
    var el3_top      = el2_fontsize + Math.ceil(5.0 * scale); //122; // DkS2 style = 27.0 * scale

    if (!is_webkit) el3_top += 2.0 * scale; // 2016-08-11 ND: outset border means need to shift 1px down

    var el3_width  = Math.floor(el_width * 0.9383); //1126;
    var el3_height = Math.ceil(3.0 * scale);
    var el         = GetLocationText_Container(el_width, el_height);
    var el2        = GetLocationText_Text(txt, el2_fontsize, el2_str_w, is_webkit);
    var el3        = GetLocationText_Hr(el3_width, el3_height, el3_top);

    el.appendChild(el2);
    el.appendChild(el3);

    if (!is_webkit)
    {
        var el_t4 = GetLocationText_TextShadowLabel(txt, el2_fontsize,  0, -2,  1,  0, 0);
        var el_t5 = GetLocationText_TextShadowLabel(txt, el2_fontsize,  0,  2, -1,  0, 0);
        var el_t8 = GetLocationText_TextShadowLabel(txt, el2_fontsize,  2,  0,  0,  1, 0);
        var el_t9 = GetLocationText_TextShadowLabel(txt, el2_fontsize, -2,  0,  0, -1, 0);

        el.appendChild(el_t4);
        el.appendChild(el_t5);
        el.appendChild(el_t8);
        el.appendChild(el_t9);
    }//if

    document.body.appendChild(el);

    var cbFade = function()
    {
        setTimeout(function() {
            el.style.opacity = "0.0";
        }, 2000);
        
        setTimeout(function() {
            document.body.removeChild(el);
        }, 4000);
    };
    
    /*
    var audio = document.createElement("audio");
    audio.src = "newarea.mp3";
    audio.addEventListener("ended", function() 
    {
        document.body.removeChild(audio);
    }, false);
    
    document.body.appendChild(audio);
    
    audio.play();
    */
    
    // test for full CSS3 animation
    /*
    setTimeout(function() {
        el.style.opacity = "1.0";
        setTimeout(cbFade, 250 + 18);
    }, 17);
    */
    
    setTimeout(function() {
        el.className += " dkstextfade";
        
        setTimeout(function() {
            document.body.removeChild(el);
        }, 4000);
    }, 17);
}//ShowLocationText

// The "animate" functions use requestAnimationFrame, so timing is not
// guaranteed.  Ideally, it's 60 FPS, or 16.666667ms.
function AnimateElementBlur(el, blur, stride, min_blur, max_blur)
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
        requestAnimationFrame(function() { AnimateElementBlur(el, blur, stride, min_blur, max_blur) });
}

function AnimateElementFadeIn(el, opacity, stride, fxCallback)
{  
    opacity = opacity < 0.0 ? 0.0 : opacity + stride > 1.0 ? 1.0 : opacity + stride;  
    el.style.opacity = opacity;
    if (opacity == 0.0) { if (el.style.display != null && el.style.display == "none") el.style.display = null; if (el.style.visibility != null && el.style.visibility == "hidden") el.style.visibility = "visible"; }
    if (opacity  < 1.0) requestAnimationFrame(function() { AnimateElementFadeIn(el, opacity, stride, fxCallback) });
    else if (opacity == 1.0 && fxCallback != null) fxCallback();
}

function AnimateElementFadeOut(el, opacity, stride)
{  
    opacity = opacity + stride < 0.0 ? 0.0 : opacity + stride > 1.0 ? 1.0 : opacity + stride;  
    el.style.opacity = opacity;
    if (opacity == 0.0) { el.style.display = "none"; }
    if (opacity  > 0.0) requestAnimationFrame(function() { AnimateElementFadeOut(el, opacity, stride) });
}







// ===============================================================================================
// ==================================== LOADING SPINNER HELPER ===================================
// ===============================================================================================
//
// LoadingSpinnerHelper: Uses CSS3 animation to show a fullscreen loading spinner to the user.
// nb: Does not work with Firefox because Mozilla unironically believes CSS styles are a security risk.
//     Firefox users get a spinning square instead.
//
//
var LoadingSpinnerHelper = (function()
{
    function LoadingSpinnerHelper() 
    {
    }
        
    LoadingSpinnerHelper.DoesStyleExist = function(src, t)
    {
        var d = false;

        if ("MozAppearance" in document.documentElement.style) return d; // 2016-02-01 ND: workaround for Firefox bug

        for (var i=0; i<document.styleSheets.length; i++)
        {
            var r = document.styleSheets[i].cssRules || document.styleSheets[i].rules || new Array();

            for (var n in r)
            {
                if (r[n].type == t && r[n].name == src)
                {
                    d = true;
                    break;
                }//if
            }//for

            if (d) break;
        }//for
    
        return d;
    };

    LoadingSpinnerHelper.InjectLoadingSpinnerStyleIfNeeded = function()
    {
        if (LoadingSpinnerHelper.DoesStyleExist("animation-ls-rotate", window.CSSRule.KEYFRAMES_RULE)) return;
    
        var kfn = "keyframes animation-ls-rotate { 100% { ";
        var trr = "transform: rotate(360deg); } }" + " \n ";
    
        var css = "@-webkit-" + kfn + "-webkit-" + trr
                + "@-moz-"    + kfn + "-moz-"    + trr
                + "@-o-"      + kfn + "-o-"      + trr
                + "@"         + kfn              + trr;
    
        var els       = document.createElement("style");
        els.type      = "text/css";
        els.innerHTML = css;
        document.getElementsByTagName("head")[0].appendChild(els);
    };

    LoadingSpinnerHelper.GetHexC = function(s,i)
    {
        return parseInt("0x" + (s!=null&&s.length==4 ? s.substring(i+1,i+2)+s.substring(i+1,i+2) : s!=null&&s.length==7?s.substring(i*2+1,i*2+3) : "0") );
    };

    LoadingSpinnerHelper.HexColorToRGBA = function(src, a)
    {
        return "rgba(" + LoadingSpinnerHelper.GetHexC(src,0) + ", " + LoadingSpinnerHelper.GetHexC(src,1) + ", " + LoadingSpinnerHelper.GetHexC(src,2) + ", " + a + ")";
    };
    
    LoadingSpinnerHelper.InjectLoadingSpinner = function(el, color, str_w, px_size)
    {
        if (color == null) color = "#000";
        if (str_w == null) str_w = "2";
        var wh = px_size == null ? 38 : parseInt(px_size);
    
        if (px_size > 18) px_size -= 16; // correct for CSS-SVG diffs
        str_w += 6;                      // correct for CSS-SVG diffs

        var c0 = LoadingSpinnerHelper.HexColorToRGBA(color, 0.5);
        var c1 = LoadingSpinnerHelper.HexColorToRGBA(color, 1.0);

        LoadingSpinnerHelper.InjectLoadingSpinnerStyleIfNeeded();

        var anim = "animation: animation-ls-rotate 1000ms linear infinite;";
        var bdr  = "border-radius: 999px;";

        var css =  "position:absolute;top:0;bottom:0;left:0;right:0;display:block;margin:auto;"
                     + "vertical-align:middle;text-align:center;pointer-events:none;"
                     + "width:" + wh + "px;"
                     + "height:"+ wh + "px;"
                     + "border: " + str_w + "px"
                     + " solid "  + c0 + ";"
                     + "border-left-color: " + c1 + ";"
                     + "-webkit-" + bdr
                     +    "-moz-" + bdr
                     +            + bdr
                     + "-webkit-" + anim
                     +    "-moz-" + anim
                     +      "-o-" + anim
                     +              anim;
        
        var div = document.createElement("div");
        div.style.cssText = css;

        while (el.firstChild) 
        {
            el.removeChild(el.firstChild);
        }//while

        el.appendChild(div); // don't contaminate styles of parent element
    };
    
    return LoadingSpinnerHelper;
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

    TimeSliceUI.GetPanelDiv       = function()    { return document.getElementById("tsPanel"); };
    TimeSliceUI.GetSliderEl       = function()    { return document.getElementById("tsSlider"); };
    TimeSliceUI.GetStartDateEl    = function()    { return document.getElementById("tsStartDate"); };
    TimeSliceUI.GetEndDateEl      = function()    { return document.getElementById("tsEndDate"); };
    TimeSliceUI.SetLayerAndSync   = function(idx) { LayersHelper.SetSelectedIdxAndSync(idx); };
    TimeSliceUI.BitsLegacyInit    = function()    { _bitsProxy.LegacyInitForSelection(); };
    TimeSliceUI.SyncLayerWithMap  = function()    { LayersHelper.SyncSelectedWithMap(); };
    TimeSliceUI.MapExtentOnChange = function(i)   { MapExtent_OnChange(i); };
    TimeSliceUI.EnableHud         = function()    { _hudProxy.Enable(); };
    TimeSliceUI.UpdateHud         = function()    { _hudProxy.Update(); };
    TimeSliceUI.GetLabelsForIdx   = function(idx) { return SafecastDateHelper.GetTimeSliceDateRangeLabelsForIdxJST(idx); };
    TimeSliceUI.GetTimeSliceIdxs  = function()    { return SafecastDateHelper.GetTimeSliceLayerDateRangesUTC() };

    TimeSliceUI.SetPanelHidden = function(isHidden)
    {
        var el = TimeSliceUI.GetPanelDiv();
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
    TimeSliceUI.InitSliderRange = function()
    {
        var s = TimeSliceUI.GetSliderEl();
        var o = TimeSliceUI.GetTimeSliceIdxs();

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

    TimeSliceUI.SetSliderIdx = function(idx)
    {
        var s = TimeSliceUI.GetSliderEl();
        s.value = idx;
    };
    
    TimeSliceUI.GetSliderIdx = function()
    {
        var s = TimeSliceUI.GetSliderEl();
        var i = parseInt(s.value);
        return i;
    };
    
    TimeSliceUI.SetSliderIdxToDefault = function()
    {
        TimeSliceUI.SetSliderIdx(13);
    };
    
    TimeSliceUI.Init = function()
    {
        TimeSliceUI.SetSliderIdxToDefault();
    };
    
    TimeSliceUI.tsSlider_OnChange = function()
    {    
        var s   = TimeSliceUI.GetSliderEl();
        var idx = parseInt(s.value);
        var ds  = TimeSliceUI.GetLabelsForIdx(idx);
        
        TimeSliceUI.GetStartDateEl().innerHTML = ds.s;
        TimeSliceUI.GetEndDateEl().innerHTML   = ds.e;
                
        TimeSliceUI.SetLayerAndSync(idx);
        
        TimeSliceUI.BitsLegacyInit();
        TimeSliceUI.SyncLayerWithMap();
        TimeSliceUI.MapExtentOnChange(100);     // force URL update
        TimeSliceUI.UpdateHud();
    };
    
    return TimeSliceUI;
})();






// ===============================================================================================
// ==================================== LOCALIZED MENU STRINGS ===================================
// ===============================================================================================
//
// GetMenuStringsEn(), GetMenuStringsJa() contain the translations for the menu items, and in a sane
// world, they would be in their own file.  But HTTP/1.1.
//
// nb: For the MENU_LAYERS_*_DATE_LABEL, null and the empty string ("") indicate two different things.
//     * null indicates there is no date label at all for the layer
//     * ""   indicates a dynamic label, set elsewhere.  This is used for the dynamic date display in
//            the Safecast layers.
//
function GetMenuStringsEn()
{
    var s = 
    {
        MENU_ADDRESS_PLACEHOLDER:"Find Address",
        MENU_TOGGLE_RETICLE_LABEL:"Crosshair",
        MENU_LAYERS_TITLE:"Layers",
        MENU_DONATE_LABEL:"Donate",
        MENU_BLOG_LABEL:"News",
        MENU_ABOUT_LABEL:"About this map",
        MENU_ADVANCED_TITLE:"Advanced",
        MENU_HDPI_LABEL:"High Res Tiles",
        MENU_SCALE_LABEL:"Map Scale",
        MENU_NN_SCALER_LABEL:"NN Tile Scaler",
        MENU_ZOOM_BUTTONS_LABEL:"Zoom Buttons",
        MENU_TILE_SHADOW_LABEL:"Tile Shadow",
        MENU_API_QUERY_CENTER_LABEL:"Query API @ Center",
        MENU_LAYERS_11_LABEL:"None",
        MENU_LAYERS_11_DATE_LABEL:null,
        MENU_LAYERS_0_LABEL:"Safecast",
        MENU_LAYERS_0_DATE_LABEL:"",
        MENU_LAYERS_1_LABEL:"&nbsp;&nbsp;Points",
        MENU_LAYERS_1_DATE_LABEL:"",
        MENU_LAYERS_2_LABEL:"&nbsp;&nbsp;Interpolation",
        MENU_LAYERS_2_DATE_LABEL:"",
        MENU_LAYERS_12_LABEL:"Safecast Snapshots...",
        MENU_LAYERS_12_DATE_LABEL:null,
        MENU_LAYERS_8_LABEL:"Safecast Points",
        MENU_LAYERS_8_DATE_LABEL:"2013-04-15",
        MENU_LAYERS_9_LABEL:"Safecast Points",
        MENU_LAYERS_9_DATE_LABEL:"2014-03-11",
        MENU_LAYERS_3_LABEL:"NNSA Japan",
        MENU_LAYERS_3_DATE_LABEL:"2011-06-30",
        MENU_LAYERS_4_LABEL:"USGS/GSC NURE",
        MENU_LAYERS_4_DATE_LABEL:"1980",
        MENU_LAYERS_5_LABEL:"Geoscience Australia",
        MENU_LAYERS_5_DATE_LABEL:"2010",
        MENU_LAYERS_6_LABEL:"AIST/GSJ Natural Bkg",
        MENU_LAYERS_6_DATE_LABEL:null,
        MENU_LAYERS_10_LABEL:"Add bGeigie Log...",
        MENU_LAYERS_10_DATE_LABEL:null,
        MENU_LAYERS_10001_LABEL:"Add Cosmic Logs...",
        MENU_LAYERS_10001_DATE_LABEL:null,
        MENU_LAYERS_MORE_LABEL:"List All",
        MENU_BASEMAP_TITLE:"Basemap",
        MENU_BASEMAP_0_LABEL:"Map",
        MENU_BASEMAP_1_LABEL:"Satellite",
        MENU_BASEMAP_2_LABEL:"Satellite (Labeled)",
        MENU_BASEMAP_3_LABEL:"Terrain",
        MENU_BASEMAP_4_LABEL:"Map (Gray)",
        MENU_BASEMAP_5_LABEL:"Map (Dark)",
        MENU_BASEMAP_6_LABEL:"Stamen Toner",
        MENU_BASEMAP_7_LABEL:"Stamen Toner Light",
        MENU_BASEMAP_8_LABEL:"Stamen Watercolor",
        MENU_BASEMAP_9_LABEL:"OpenStreetMap",
        MENU_BASEMAP_10_LABEL:"None (Black)",
        MENU_BASEMAP_11_LABEL:"None (White)",
        MENU_BASEMAP_12_LABEL:"Stamen Terrain",
        MENU_BASEMAP_13_LABEL:"GSI Japan",
        MENU_BASEMAP_14_LABEL:"Map (Retro)",
        MENU_LOGS_TITLE:"bGeigie Logs",
        MENU_LOGS_0_LABEL:"Search...",
        MENU_LOGS_1_LABEL:"Add Cosmic Logs",
        MENU_LOGS_2_LABEL:"Remove All",
        MENU_LOGS_3_LABEL:"Options",
        MENU_REALTIME_TITLE:"Realtime",
        MENU_REALTIME_0_LABEL:"Radiation Sensors",
        MENU_AREAS_TITLE:"Areas",
        MENU_AREAS_0_LABEL:"Fukushima Zone",
        MENU_LANGUAGE_CHANGE_TEXT:"Note: The new language setting will not be applied to the Google Maps labels until this page is reloaded."
    };
    
    return s;
}

function GetMenuStringsJa()
{
    var s = 
    {
        MENU_ADDRESS_PLACEHOLDER:"住所検索",
        MENU_TOGGLE_RETICLE_LABEL:"クロスヘア",
        MENU_LAYERS_TITLE:"レイヤ",
        MENU_DONATE_LABEL:"SAFECASTへの支援",
        MENU_BLOG_LABEL:"ニュース",
        MENU_ABOUT_LABEL:"このマップについて",
        MENU_ADVANCED_TITLE:"詳細",
        MENU_HDPI_LABEL:"高解像度のタイル",
        MENU_SCALE_LABEL:"地図データの規模",
        MENU_NN_SCALER_LABEL:"最近傍補間タイルのスケーラー",
        MENU_ZOOM_BUTTONS_LABEL:"ズームボタン",
        MENU_TILE_SHADOW_LABEL:"レイヤーの影",
        MENU_API_QUERY_CENTER_LABEL:"（地図の中心に）APIクエリの実行",
        MENU_LAYERS_11_LABEL:"なし",
        MENU_LAYERS_11_DATE_LABEL:null,
        MENU_LAYERS_0_LABEL:"Safecast",
        MENU_LAYERS_0_DATE_LABEL:"",
        MENU_LAYERS_1_LABEL:"&nbsp;&nbsp;ポイント",
        MENU_LAYERS_1_DATE_LABEL:"",
        MENU_LAYERS_2_LABEL:"&nbsp;&nbsp;空間的補間",
        MENU_LAYERS_2_DATE_LABEL:"",
        MENU_LAYERS_12_LABEL:"Safecast スナップショット",
        MENU_LAYERS_12_DATE_LABEL:null,
        MENU_LAYERS_8_LABEL:"Safecast ポイント",
        MENU_LAYERS_8_DATE_LABEL:"2013-04-15",
        MENU_LAYERS_9_LABEL:"Safecast ポイント",
        MENU_LAYERS_9_DATE_LABEL:"2014-03-11",
        MENU_LAYERS_3_LABEL:"NNSA 日本",
        MENU_LAYERS_3_DATE_LABEL:"2011-06-30",
        MENU_LAYERS_4_LABEL:"USGS/GSC NURE",
        MENU_LAYERS_4_DATE_LABEL:"1980",
        MENU_LAYERS_5_LABEL:"Geoscience Australia",
        MENU_LAYERS_5_DATE_LABEL:"2010",
        MENU_LAYERS_6_LABEL:"産総研/GSJ 自然放射能",
        MENU_LAYERS_6_DATE_LABEL:null,
        MENU_LAYERS_10_LABEL:"bGeigieログファイルを追加します",
        MENU_LAYERS_10_DATE_LABEL:null,
        MENU_LAYERS_10001_LABEL:"宇宙放射線のログファイルを追加します",
        MENU_LAYERS_10001_DATE_LABEL:null,
        MENU_LAYERS_MORE_LABEL:"全てのリスト",
        MENU_BASEMAP_TITLE:"基礎地図",
        MENU_BASEMAP_0_LABEL:"地図",
        MENU_BASEMAP_1_LABEL:"航空写真",
        MENU_BASEMAP_2_LABEL:"ラベル付きの航空写真",
        MENU_BASEMAP_3_LABEL:"地形",
        MENU_BASEMAP_4_LABEL:"地図（グレー）",
        MENU_BASEMAP_5_LABEL:"地図（黒）",
        MENU_BASEMAP_6_LABEL:"Stamen Toner",
        MENU_BASEMAP_7_LABEL:"Stamen Toner Light",
        MENU_BASEMAP_8_LABEL:"Stamen Watercolor",
        MENU_BASEMAP_9_LABEL:"OpenStreetMap",
        MENU_BASEMAP_10_LABEL:"なし（黒）",
        MENU_BASEMAP_11_LABEL:"なし（白）",
        MENU_BASEMAP_12_LABEL:"Stamen Terrain",
        MENU_BASEMAP_13_LABEL:"国土地理院（日本）",
        MENU_BASEMAP_14_LABEL:"地図（レトロ）",
        MENU_LOGS_TITLE:"bGeigieログ",
        MENU_LOGS_0_LABEL:"検索",
        MENU_LOGS_1_LABEL:"宇宙放射線のログ追加",
        MENU_LOGS_2_LABEL:"全削除",
        MENU_LOGS_3_LABEL:"オプション",
        MENU_REALTIME_TITLE:"リアルタイム",
        MENU_REALTIME_0_LABEL:"放射線センサー",
        MENU_AREAS_TITLE:"区域",
        MENU_AREAS_0_LABEL:"福島の帰還困難区域",
        MENU_LANGUAGE_CHANGE_TEXT:"注記：このページがリロードされるまで、新しい言語設定は、Googleマップのラベルには適用されません。"
    };
    
    return s;
}

/* // dump strings
var en = GetMenuStringsEn();
var ja = GetMenuStringsJa();
var d = "\n";
for (var k in en) { d += k + "|" + en[k] + "|" + ja[k] + "\n"; }
console.log(d);
*/


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

    //var prefix = (function prefix() 
    //{
    //    var regex = /^(Webkit|Khtml|Moz|ms|O)(?=[A-Z])/;
    //    var styleDeclaration = doc.getElementsByTagName("script")[0].style;
    //    for (var prop in styleDeclaration) 
    //    {
    //        if (regex.test(prop)) 
    //        {
    //            return "-" + prop.match(regex)[0].toLowerCase() + "-";
    //        }
    //    }
        
        // Nothing found so far? Webkit does not enumerate over the CSS properties of the style object.
        // However (prop in style) returns the correct value, so we'll have to test for
        // the precence of a specific property
        
    //    if ("WebkitOpacity" in styleDeclaration) { return "-webkit-"; }
    //    if ("KhtmlOpacity"  in styleDeclaration) { return "-khtml-";  }
    //    
    //    return "";
    //}());
    
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
        //var t = prefix + "transform " + this._duration + "ms " + this._fx;
        var t = "transform " + this._duration + "ms " + this._fx;

        //this.panel.style[prefix + "transition"] = t;
        this.panel.style["-webkit-transition"] = "-webkit-" + t;
        this.panel.style.transition = t;

        return this;
    };


    Slideout.prototype._translateXTo = function(translateX) 
    {
        var t = "translateX(" + translateX + "px)";

        this._currentOffsetX = translateX;

        //this.panel.style[prefix + "transform"] = t;
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
            //self.panel.style[prefix + "transform"] = "";
            self.panel.style["-webkit-transform"] = "";
            self.panel.style.transform = "";
            self.emit("close");
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

        MenuHelper.InitLanguage();
        MenuHelper.InitEvents();
        MenuHelper.InitTooltips();

        setTimeout(function() {
            MenuHelper.SyncBasemap();
            MenuHelper.InitLayers_ApplyVisibilityStyles();
            MenuHelper.InitBasemap_ApplyVisibilityStyles();
            ElGet("menu").style.removeProperty("display");
        }, 50);

        setTimeout(function() {
            ElGet("menu-header").style.backgroundImage = "url('schoriz_362x44.png')";
        }, 200);

        setTimeout(MenuHelper.InitReticleFromPref, 250);
        setTimeout(MenuHelper.InitAdvancedSection, 500);

        ElGet("logo2").style.visibility = "visible";
            
        if (MenuHelper.GetMenuOpenPref() && !slideout.isOpen())
        {
            setTimeout(function() {
                MenuHelper.OpenAnimationHack();
                slideout.toggle();
            }, 501);
        }//if
    };


    MenuHelper.InitTooltips = function()
    {
        if (_nua("mobile") || _nua("iPhone") || _nua("iPad") || _nua("Android"))
        {
            return; // no tooltips on mobile.
        }//if
        
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
                                      x1:288, y1:2880 },
                  { n:"areas_0",      x0:32,  y0:3136,
                                      x1:288, y1:3136 } ];

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
    
        // now, set the style for the element that should trigger the "event"
    
        var sp = ["hud_btnToggle", "menu_realtime_0", "menu_areas_0", "menu_scale", "menu_zoom_buttons", "menu_hdpi", "menu_nnscaler", "menu_tile_shadow", "menu_logs_0", "menu_logs_1", "menu_logs_2", "menu_logs_3", "menu_apiquery"];
            
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

    // binds misc UI events, can be init immediately
    MenuHelper.InitEvents = function()
    {
        document.querySelector(".js-slideout-toggle").addEventListener("click", function(e) 
        {
            MenuHelper.SetMenuOpenPref(!slideout.isOpen());
        
            if (slideout.isOpen()) 
            {
                MenuHelper.CloseAnimationHack();
                slideout.toggle();
            }
            else
            {
                MenuHelper.OpenAnimationHack();
                setTimeout(function() {
                    slideout.toggle();
                }, 17);
            }
            
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
    MenuHelper.InitAdvancedSection = function()
    {            
        if (window.devicePixelRatio < 1.5) 
        {
            ElGet("menu_hdpi").parentElement.style.display = "none";
        }//if
        else if (!MenuHelper.GetHdpiEnabledPref())
        {
            // todo: move to layer init(?)
            _no_hdpi_tiles = true;
            overlayMaps = null;
            ClientZoomHelper.InitGmapsLayers();
            LayersHelper.SyncSelectedWithMap();
            ClientZoomHelper.SynchronizeLayersToZoomLevel(GetMapInstanceYXZ().z);
        }//else
        ElGet("chkMenuHdpi").checked = !_no_hdpi_tiles;
        ElGet("menu_hdpi").addEventListener("click", function()
        {
            _no_hdpi_tiles = !_no_hdpi_tiles;
            overlayMaps = null;
            ClientZoomHelper.InitGmapsLayers();
            LayersHelper.SyncSelectedWithMap();
            ClientZoomHelper.SynchronizeLayersToZoomLevel(GetMapInstanceYXZ().z);
            ElGet("chkMenuHdpi").checked = !_no_hdpi_tiles;
            MenuHelper.SetHdpiEnabledPref(!_no_hdpi_tiles);
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
        if (MenuHelper.GetScaleEnabledPref())
        {
            setTimeout(function() {
                fxScaleVis(true);
            }, 250);
        }//if
        ElGet("chkMenuScale").checked = ElGet("scale").style.display != "none";
        ElGet("menu_scale").addEventListener("click", function()
        {
            var v = ElGet("scale").style.display != "none";
            fxScaleVis(!v);
            ElGet("chkMenuScale").checked = !v;
            MenuHelper.SetScaleEnabledPref(!v);
        }, false);


        if (   (!MenuHelper.GetNnScalerEnabledPref() && _img_scaler_idx  > 0)
            || ( MenuHelper.GetNnScalerEnabledPref() && _img_scaler_idx == 0))
        {
            ToggleScaler();
        }//if
        ElGet("chkMenuNnScaler").checked = _img_scaler_idx > 0;
        ElGet("menu_nnscaler").addEventListener("click", function()
        {
            ToggleScaler();
            ElGet("chkMenuNnScaler").checked = _img_scaler_idx > 0;
            MenuHelper.SetNnScalerEnabledPref(_img_scaler_idx > 0);
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


        if (MenuHelper.GetArea0EnabledPref())
        {
            _mapPolys.Add(0);
        }//if
        ElGet("chkMenuAreas0").checked = _mapPolys.Exists(0);
        ElGet("menu_areas_0").addEventListener("click", function()
        {
            var s = _mapPolys.Exists(0);
            if (s)
            {
                _mapPolys.Remove(0);
            }//if
            else
            {
                _mapPolys.Add(0);
            }//else
            ElGet("chkMenuAreas0").checked = !s;
            MenuHelper.SetArea0EnabledPref(!s);
        }, false);


        ElGet("chkMenuZoomButtons").checked = map.zoomControl;
        ElGet("menu_zoom_buttons").addEventListener("click", function()
        {
            var s = !map.zoomControl;
            map.setOptions({zoomControl:s});
            ElGet("chkMenuZoomButtons").checked = s;
            MenuHelper.SetZoomButtonsEnabledPref(s);
        }, false);


        if (MenuHelper.GetTileShadowEnabledPref())
        {
            ToggleTileShadow();
        }//if
        ElGet("chkMenuTileShadow").checked = _img_tile_shadow_idx > 0;
        ElGet("menu_tile_shadow").addEventListener("click", function()
        {
            ToggleTileShadow();
            ElGet("chkMenuTileShadow").checked = _img_tile_shadow_idx > 0;
            MenuHelper.SetTileShadowEnabledPref(_img_tile_shadow_idx > 0);
        }, false);


        ElGet("menu_apiquery").addEventListener("click", function()
        {
            var yx = GetNormalizedMapCentroid();
            QuerySafecastApiAsync(yx.y, yx.x, map.getZoom());
        }, false);
    };

    // requires binds for layers and basemaps 
    MenuHelper.InitLabelsFromStrings = function(s)
    {
        ElGet("address").placeholder             = s.MENU_ADDRESS_PLACEHOLDER;
        ElGet("lblMenuToggleReticle").innerHTML  = s.MENU_TOGGLE_RETICLE_LABEL;
        ElGet("lblMenuLayersTitle").innerHTML    = s.MENU_LAYERS_TITLE;
        ElGet("lblMenuLayersMore").innerHTML     = s.MENU_LAYERS_MORE_LABEL;
        ElGet("lblMenuBasemapMore").innerHTML    = s.MENU_LAYERS_MORE_LABEL;
        ElGet("lblMenuLogsTitle").innerHTML      = s.MENU_LOGS_TITLE;
        ElGet("aMenuDonate").innerHTML           = s.MENU_DONATE_LABEL;
        ElGet("aMenuBlog").innerHTML             = s.MENU_BLOG_LABEL;
        ElGet("show").innerHTML                  = s.MENU_ABOUT_LABEL;
        ElGet("lblMenuBasemapTitle").innerHTML   = s.MENU_BASEMAP_TITLE;
        ElGet("lblMenuAdvancedTitle").innerHTML  = s.MENU_ADVANCED_TITLE;
        ElGet("lblMenuHdpi").innerHTML           = s.MENU_HDPI_LABEL;
        ElGet("lblMenuScale").innerHTML          = s.MENU_SCALE_LABEL;
        ElGet("lblMenuNnScaler").innerHTML       = s.MENU_NN_SCALER_LABEL;
        ElGet("lblMenuZoomButtons").innerHTML    = s.MENU_ZOOM_BUTTONS_LABEL;
        ElGet("lblMenuTileShadow").innerHTML     = s.MENU_TILE_SHADOW_LABEL;
        ElGet("menu_apiquery").innerHTML         = s.MENU_API_QUERY_CENTER_LABEL;
        ElGet("lblMenuRealtimeTitle").innerHTML  = s.MENU_REALTIME_TITLE;
        ElGet("menu_realtime_0_label").innerHTML = s.MENU_REALTIME_0_LABEL;
        ElGet("lblMenuAreasTitle").innerHTML     = s.MENU_AREAS_TITLE;
        ElGet("menu_areas_0_label").innerHTML    = s.MENU_AREAS_0_LABEL;

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
    };
    
    
    MenuHelper.InitBasemap_ApplyVisibilityStyles = function()
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


    // requires binds for layers
    MenuHelper.InitLayers_ApplyVisibilityStyles = function()
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
        
        var sb = ["sectionMenuLogs", "sectionMenuRealtime", "sectionMenuAreas"];
        
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
                xs.maxHeight = "1024px";
                xs.opacity   = "1";
            }//else
        }//for
    };

    // nb: this is disabled as resizing the GMaps content area breaks GMaps due to an internal bug
    MenuHelper.OpenAnimationHack = function()
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
            el.parentElement.style.maxHeight = vis ? "500px"   : "0";
            el.parentElement.style.opacity   = vis ? "1"       : "0";
            el.parentElement.style.overflow  = vis ? "visible" : "hidden";
        }//for
        
        ElGet("chkMenuBasemapMore").checked = _ui_menu_basemap_more_visible;
        MenuHelper.SetBasemapMorePref(_ui_menu_basemap_more_visible);

    };


    MenuHelper.MoreLayers_OnClick = function()
    {
        var a = MenuHelperStub.GetLayerIdxs_Normal();

        _ui_menu_layers_more_visible = !_ui_menu_layers_more_visible;

        for (var i=0; i<a.length; i++)
        {
            var el = ElGet("menu_layers_" + a[i]);
            var vis = _ui_menu_layers_more_visible || (el.className != null && el.className.indexOf("menu_option_selected") > -1);
            el.parentElement.style.maxHeight = vis ? "500px"   : "0";
            el.parentElement.style.opacity   = vis ? "1"       : "0";
            el.parentElement.style.overflow  = vis ? "visible" : "hidden";
        }//for

        ElGet("chkMenuLayersMore").checked = _ui_menu_layers_more_visible;
        MenuHelper.SetLayersMorePref(_ui_menu_layers_more_visible);

        var sb = ["sectionMenuLogs", "sectionMenuRealtime", "sectionMenuAreas"];

        var fxToggleLogStyles = function()
        {
            for (var i=0; i<sb.length; i++)
            {
                var el = ElGet(sb[i]);
                var vis = _ui_menu_layers_more_visible;
                el.style.maxHeight = vis ? "1024px" : "0";
                el.style.opacity   = vis ? "1"      : "0";
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
        MenuHelper.SetLanguage(s);
        MenuHelper.SetLanguagePref(s);

        var ms = MenuHelper.GetStringsForLanguage(s);
        alert(ms.MENU_LANGUAGE_CHANGE_TEXT);
    };


    MenuHelper.SetLanguage = function(s)
    {
        MenuHelper.InitLabelsFromStrings(MenuHelper.GetStringsForLanguage(s));
    };


    MenuHelper.GetStringsForLanguage = function(s)
    {
        return s == "en" ? GetMenuStringsEn() : GetMenuStringsJa();
    };


    MenuHelper.GetEffectiveLanguagePref = function()
    {
        var s = MenuHelper.GetLanguagePref();

        if (s == null)
        {
            s = (new Date()).getTimezoneOffset() == -540 ? "ja" : "en"; // JST
            // 2016-09-20 ND: Fix for travelling issue
            MenuHelper.SetLanguagePref(s);
        }//if

        return s;
    };


    MenuHelper.GetLanguagePref = function()
    {
        return localStorage.getItem("PREF_LANGUAGE");
    };


    MenuHelper.SetLanguagePref = function(s)
    {
        localStorage.setItem("PREF_LANGUAGE", s);
    };


    MenuHelper.InitLanguage = function()
    {
        var s = MenuHelper.GetEffectiveLanguagePref();

        MenuHelper.SetLanguage(s);

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
        MenuHelper.SetReticleEnabledPref(hud_on);
    };
    
    
    MenuHelper.GetPrefBln = function(key, def)
    {
        var s = localStorage.getItem(key);
        return s == null ? def : s == "1";
    };
    
    MenuHelper.SetPrefBln = function(key, val)
    {
        localStorage.setItem(key, val ? "1" : "0");
    };
    
    MenuHelper.GetPrefInt = function(key, def)
    {
        var s = localStorage.getItem(key);
        return s == null ? def : parseInt(s);
    };
    
    MenuHelper.SetPrefInt = function(key, val)
    {
        localStorage.setItem(key, ""+val);
    };
    
    MenuHelper.GetPrefF64 = function(key, def)
    {
        var s = localStorage.getItem(key);
        return s == null ? def : parseFloat(s);
    };
    
    MenuHelper.SetPrefF64 = function(key, val)
    {
        localStorage.setItem(key, ""+val);
    };

    MenuHelper.GetArea0EnabledPref       = function()  { return MenuHelper.GetPrefBln("PREF_AREA_0_ENABLED",       true);  };
    MenuHelper.SetArea0EnabledPref       = function(s) {        MenuHelper.SetPrefBln("PREF_AREA_0_ENABLED",       s);     };
    MenuHelper.GetReticleEnabledPref     = function()  { return MenuHelper.GetPrefBln("PREF_RETICLE_ENABLED",      false); };
    MenuHelper.SetReticleEnabledPref     = function(s) {        MenuHelper.SetPrefBln("PREF_RETICLE_ENABLED",      s);     };
    MenuHelper.GetZoomButtonsEnabledPref = function()  { return MenuHelper.GetPrefBln("PREF_ZOOM_BUTTONS_ENABLED", true);  };
    MenuHelper.SetZoomButtonsEnabledPref = function(s) {        MenuHelper.SetPrefBln("PREF_ZOOM_BUTTONS_ENABLED", s);     };
    MenuHelper.GetScaleEnabledPref       = function()  { return MenuHelper.GetPrefBln("PREF_SCALE_ENABLED",        true);  };
    MenuHelper.SetScaleEnabledPref       = function(s) {        MenuHelper.SetPrefBln("PREF_SCALE_ENABLED",        s);     };
    MenuHelper.GetHdpiEnabledPref        = function()  { return MenuHelper.GetPrefBln("PREF_HDPI_ENABLED",         true);  };
    MenuHelper.SetHdpiEnabledPref        = function(s) {        MenuHelper.SetPrefBln("PREF_HDPI_ENABLED",         s);     };
    MenuHelper.GetNnScalerEnabledPref    = function()  { return MenuHelper.GetPrefBln("PREF_NN_SCALER_ENABLED",    true);  };
    MenuHelper.SetNnScalerEnabledPref    = function(s) {        MenuHelper.SetPrefBln("PREF_NN_SCALER_ENABLED",    s);     };
    MenuHelper.GetTileShadowEnabledPref  = function()  { return MenuHelper.GetPrefBln("PREF_TILE_SHADOW_ENABLED",  false); };
    MenuHelper.SetTileShadowEnabledPref  = function(s) {        MenuHelper.SetPrefBln("PREF_TILE_SHADOW_ENABLED",  s);     };
    MenuHelper.GetExpandedLayersPref     = function()  { return MenuHelper.GetPrefBln("PREF_EXPANDED_LAYERS",      true);  };
    MenuHelper.SetExpandedLayersPref     = function(s) {        MenuHelper.SetPrefBln("PREF_EXPANDED_LAYERS",      s);     };
    MenuHelper.GetExpandedLogsPref       = function()  { return MenuHelper.GetPrefBln("PREF_EXPANDED_LOGS",        true);  };
    MenuHelper.SetExpandedLogsPref       = function(s) {        MenuHelper.SetPrefBln("PREF_EXPANDED_LOGS",        s);     };
    MenuHelper.GetExpandedRealtimePref   = function()  { return MenuHelper.GetPrefBln("PREF_EXPANDED_REALTIME",    true);  };
    MenuHelper.SetExpandedRealtimePref   = function(s) {        MenuHelper.SetPrefBln("PREF_EXPANDED_REALTIME",    s);     };
    MenuHelper.GetExpandedAreasPref      = function()  { return MenuHelper.GetPrefBln("PREF_EXPANDED_AREAS",       true);  };
    MenuHelper.SetExpandedAreasPref      = function(s) {        MenuHelper.SetPrefBln("PREF_EXPANDED_AREAS",       s);     };
    MenuHelper.GetExpandedBasemapPref    = function()  { return MenuHelper.GetPrefBln("PREF_EXPANDED_BASEMAP",     false); };
    MenuHelper.SetExpandedBasemapPref    = function(s) {        MenuHelper.SetPrefBln("PREF_EXPANDED_BASEMAP",     s);     };
    MenuHelper.GetExpandedAdvancedPref   = function()  { return MenuHelper.GetPrefBln("PREF_EXPANDED_ADVANCED",    false); };
    MenuHelper.SetExpandedAdvancedPref   = function(s) {        MenuHelper.SetPrefBln("PREF_EXPANDED_ADVANCED",    s);     };    
    MenuHelper.GetLayerUiIndexPref       = function()  { return MenuHelper.GetPrefInt("PREF_LAYER_UI_INDEX",       0);     };
    MenuHelper.SetLayerUiIndexPref       = function(s) {        MenuHelper.SetPrefInt("PREF_LAYER_UI_INDEX",       s);     };
    MenuHelper.GetBasemapUiIndexPref     = function()  { return MenuHelper.GetPrefInt("PREF_BASEMAP_UI_INDEX",     0);     };
    MenuHelper.SetBasemapUiIndexPref     = function(s) {        MenuHelper.SetPrefInt("PREF_BASEMAP_UI_INDEX",     s);     };
    MenuHelper.GetLayersMorePref         = function()  { return MenuHelper.GetPrefBln("PREF_LAYERS_MORE",          false); };
    MenuHelper.SetLayersMorePref         = function(s) {        MenuHelper.SetPrefBln("PREF_LAYERS_MORE",          s);     };
    MenuHelper.GetBasemapMorePref        = function()  { return MenuHelper.GetPrefBln("PREF_BASEMAP_MORE",         false); };
    MenuHelper.SetBasemapMorePref        = function(s) {        MenuHelper.SetPrefBln("PREF_BASEMAP_MORE",         s);     };
    MenuHelper.GetMenuOpenPref           = function()  { return MenuHelper.GetPrefBln("PREF_MENU_OPEN",            false); };
    MenuHelper.SetMenuOpenPref           = function(s) {        MenuHelper.SetPrefBln("PREF_MENU_OPEN",            s);     };
    MenuHelper.GetVisibleExtentXPref     = function()  { return MenuHelper.GetPrefF64("PREF_VISIBLE_EXTENT_X",     140.515516); };
    MenuHelper.SetVisibleExtentXPref     = function(s) {        MenuHelper.SetPrefF64("PREF_VISIBLE_EXTENT_X",       s);        };
    MenuHelper.GetVisibleExtentYPref     = function()  { return MenuHelper.GetPrefF64("PREF_VISIBLE_EXTENT_Y",      37.316113); };
    MenuHelper.SetVisibleExtentYPref     = function(s) {        MenuHelper.SetPrefF64("PREF_VISIBLE_EXTENT_Y",       s);        };
    MenuHelper.GetVisibleExtentZPref     = function()  { return MenuHelper.GetPrefInt("PREF_VISIBLE_EXTENT_Z",       9);        };
    MenuHelper.SetVisibleExtentZPref     = function(s) {        MenuHelper.SetPrefInt("PREF_VISIBLE_EXTENT_Z",       s);        };

    MenuHelper.InitReticleFromPref = function()
    {
        if (MenuHelper.GetReticleEnabledPref())
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
        MenuHelperStub.InitLayers_BindLayers();
        MenuHelperStub.InitBasemap_BindBasemap();
        MenuHelperStub.InitLogs_BindEvents();
        MenuHelperStub.InitMenu_MobileNoHoverHack();
    };

    // todo: move to MenuHelper
    MenuHelperStub.InitMenu_MobileNoHoverHack = function()
    {
        if (!_nua("mobile") && !_nua("iPhone") && !_nua("iPad") && !_nua("Android")) return;
        var s = ElCr("style");
        s.type = "text/css";
        s.innerHTML = ".menu-section-list a:hover,.menu-section-list div:hover,.menu-section-list span:hover,.menu-section-title a:hover,.menu-section-title div:hover,.menu-section-title span:hover,#ddlLanguage:focus,#ddlLanguage:hover { color:#737373; }";
        document.head.appendChild(s);
    };


    // todo: move to MenuHelper
    MenuHelperStub.InitLogs_BindEvents = function()
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
            MenuHelper.SetLayerUiIndexPref(11);
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


    MenuHelperStub.BindMore = function(ul_name, li_id, div_id, s0_id, chk_id, chk_checked, cb)
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


    MenuHelperStub.InitBasemap_BindMore = function()
    {
        var cb = function() { MenuHelper.MoreBasemap_OnClick(); };
        MenuHelperStub.BindMore("ul_menu_basemap", "li_menu_morebasemap", "lnkMenuBasemapMore", "lblMenuBasemapMore", "chkMenuBasemapMore", _ui_menu_basemap_more_visible, cb);
    };


    MenuHelperStub.InitLayers_BindMore = function()
    {
        var cb = function() { MenuHelper.MoreLayers_OnClick(); };
        MenuHelperStub.BindMore("ul_menu_layers", "li_menu_morelayers", "lnkMenuLayersMore", "lblMenuLayersMore", "chkMenuLayersMore", _ui_menu_layers_more_visible, cb);
    };


    // todo: move to MenuHelper
    MenuHelperStub.InitExpand = function(el_id, fxGet, fxSet)
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


    MenuHelperStub.InitLayers_BindLayers = function()
    {
        _ui_menu_layers_more_visible  = MenuHelper.GetLayersMorePref();
        _ui_menu_basemap_more_visible = MenuHelper.GetBasemapMorePref();
    
        MenuHelperStub.InitLayers_BindMore();
        MenuHelperStub.InitBasemap_BindMore();

        var ids = MenuHelperStub.GetLayerIdxs_All();

        var cb = function(idx)
        {
            MenuHelper.OptionsClearSelection("ul_menu_layers");
            MenuHelper.OptionsSetSelection("ul_menu_layers", idx);
            _ui_layer_idx = idx;
            MenuHelper.SetLayerUiIndexPref(idx);
            LayersHelper.UiLayers_OnChange();
        };

        MenuHelperStub.BindOptions("ul_menu_layers", "menu_layers_", ids, cb);
        MenuHelperStub.BindOptionLabelsToDivs("menu_layers_", ids);

        MenuHelperStub.InitExpand("lblMenuLayersTitle",   MenuHelper.GetExpandedLayersPref,   MenuHelper.SetExpandedLayersPref);
        MenuHelperStub.InitExpand("lblMenuLogsTitle",     MenuHelper.GetExpandedLogsPref,     MenuHelper.SetExpandedLogsPref);
        MenuHelperStub.InitExpand("lblMenuRealtimeTitle", MenuHelper.GetExpandedRealtimePref, MenuHelper.SetExpandedRealtimePref);
        MenuHelperStub.InitExpand("lblMenuAreasTitle",    MenuHelper.GetExpandedAreasPref,    MenuHelper.SetExpandedAreasPref);
        MenuHelperStub.InitExpand("lblMenuBasemapTitle",  MenuHelper.GetExpandedBasemapPref,  MenuHelper.SetExpandedBasemapPref);
        MenuHelperStub.InitExpand("lblMenuAdvancedTitle", MenuHelper.GetExpandedAdvancedPref, MenuHelper.SetExpandedAdvancedPref);
    };


    MenuHelperStub.InitBasemap_BindBasemap = function()
    {
        var ids = MenuHelperStub.GetBasemapIdxs_All();

        var cb = function(idx)
        {
            map.setMapTypeId(BasemapHelper.GetMapTypeIdForBasemapIdx(idx));
            MenuHelper.SyncBasemap();
        };

        MenuHelperStub.BindOptions("ul_menu_basemap", "menu_basemap_", ids, cb);
    };


    MenuHelperStub.BindOptionLabelsToDivs = function(div_id_prefix, div_ids)
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


    MenuHelperStub.BindOptions = function(ul_id, div_id_prefix, div_ids, fx_callback)
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

    MenuHelperStub.GetLogIdxsWithUiVisibility = function()
    {
        var d = new Array();
        for (var i=0; i<=3; i++)
        {
            d.push({ i:i, v:MenuHelperStub.UiVisibility.Normal });
        }//for
        return d;
    };

    MenuHelperStub.GetBasemapIdxsWithUiVisibility = function()
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

    MenuHelperStub.GetLayerIdxsWithUiVisibility = function()
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

    MenuHelperStub.GetGenericIdxs_WhereVisibilityIn = function(s, v)
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

    MenuHelperStub.GetBasemapIdxs_WhereVisibilityIn = function(v)
    {
        var s = MenuHelperStub.GetBasemapIdxsWithUiVisibility();
        return MenuHelperStub.GetGenericIdxs_WhereVisibilityIn(s, v);
    };

    MenuHelperStub.GetLogIdxs_WhereVisibilityIn = function(v)
    {
        var s = MenuHelperStub.GetLogIdxsWithUiVisibility();
        return MenuHelperStub.GetGenericIdxs_WhereVisibilityIn(s, v);
    };

    MenuHelperStub.GetLayerIdxs_WhereVisibilityIn = function(v)
    {
        var s = MenuHelperStub.GetLayerIdxsWithUiVisibility();
        return MenuHelperStub.GetGenericIdxs_WhereVisibilityIn(s, v);
    };

    MenuHelperStub.GetLayerIdxs_All = function()
    {
        var v = [MenuHelperStub.UiVisibility.Hidden, MenuHelperStub.UiVisibility.Normal, MenuHelperStub.UiVisibility.Always];
        return MenuHelperStub.GetLayerIdxs_WhereVisibilityIn(v);
    };

    MenuHelperStub.GetLayerIdxs_NotHidden = function()
    {
        var v = [MenuHelperStub.UiVisibility.Normal, MenuHelperStub.UiVisibility.Always];
        return MenuHelperStub.GetLayerIdxs_WhereVisibilityIn(v);
    };
    
    MenuHelperStub.GetLayerIdxs_Hidden = function()
    {
        var v = [MenuHelperStub.UiVisibility.Hidden];
        return MenuHelperStub.GetLayerIdxs_WhereVisibilityIn(v);
    };

    MenuHelperStub.GetLayerIdxs_NotAlways = function()
    {
        var v = [MenuHelperStub.UiVisibility.Hidden, MenuHelperStub.UiVisibility.Normal];
        return MenuHelperStub.GetLayerIdxs_WhereVisibilityIn(v);
    };

    MenuHelperStub.GetLayerIdxs_Normal = function()
    {
        var v = [MenuHelperStub.UiVisibility.Normal];
        return MenuHelperStub.GetLayerIdxs_WhereVisibilityIn(v);
    };

    MenuHelperStub.GetBasemapIdxs_All = function()
    {
        var v = [MenuHelperStub.UiVisibility.Hidden, MenuHelperStub.UiVisibility.Normal, MenuHelperStub.UiVisibility.Always];
        return MenuHelperStub.GetBasemapIdxs_WhereVisibilityIn(v);
    };
    
    MenuHelperStub.GetBasemapIdxs_NotHidden = function()
    {
        var v = [MenuHelperStub.UiVisibility.Normal, MenuHelperStub.UiVisibility.Always];
        return MenuHelperStub.GetBasemapIdxs_WhereVisibilityIn(v);
    };

    MenuHelperStub.GetBasemapIdxs_NotAlways = function()
    {
        var v = [MenuHelperStub.UiVisibility.Hidden, MenuHelperStub.UiVisibility.Normal];
        return MenuHelperStub.GetBasemapIdxs_WhereVisibilityIn(v);
    };

    MenuHelperStub.GetBasemapIdxs_Normal = function()
    {
        var v = [MenuHelperStub.UiVisibility.Normal];
        return MenuHelperStub.GetBasemapIdxs_WhereVisibilityIn(v);
    };

    MenuHelperStub.GetLogIdxs_All = function()
    {
        var v = [MenuHelperStub.UiVisibility.Hidden, MenuHelperStub.UiVisibility.Normal, MenuHelperStub.UiVisibility.Always];
        return MenuHelperStub.GetLogIdxs_WhereVisibilityIn(v);
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

















