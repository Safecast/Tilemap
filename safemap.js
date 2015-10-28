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


// ========== INTERNAL STATES =============
var _cached_ext       = { baseurl:GetBaseWindowURL(), urlyxz:null, lidx:-1, cd:false, cd_y:0.0, cd_x:0.0, cd_z:0, midx:-1, mt:null };
var _lastLayerIdx     = 0;
var _disable_alpha    = false;           // hack for media request regarding layer opacity
var _cm_hidden        = true;            // state of menu visibility - cached to reduce CPU hit on map pans
var _mainMenu_hidden  = true;            // state of menu visibility - cached to reduce CPU hit on map pans
var _did_init_font_crimson_text = false; // cached init state


// ========== USER PREFS =============
var _zoom_limit_break = false;
var _no_hdpi_tiles    = false;
var _img_scaler_idx   = 1;
var _use_jp_region    = false;


// ============ LEGACY SUPPORT =============
var _bs_ready       = true; // HACK for legacy "show bitstores"
var _layerBitstores = null; // HACK for legacy "show bitstores"
var useBitmapIdx    = true; // HACK for legacy "show bitstores"
var _cached_baseURL = null; // 2015-08-22 ND: fix for legacy "show bitstores"


// ========== GOOGLE MAPS LAYERS =============
var overlayMaps          = null;
var tonerMapType         = null;
var tliteMapType         = null;
var wcolorMapType        = null;
var mapnikMapType        = null;
var pureBlackMapType     = null;
var pureWhiteMapType     = null;
var darkMapType          = null;
var grayMapType          = null;


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
    if ((new Date()).getTime() > Date.parse("2015-04-30T00:00:00Z")) return false;
    
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
    if ((new Date()).getTime() < Date.parse("2015-09-23T13:00:00Z")) 
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
    var yx  = yxz.yx != null ? yxz.yx : new google.maps.LatLng(37.316113, 140.515516);
    var z   = yxz.z  != -1   ? yxz.z  : 9;
    
    var map_options = 
    {
                            zoom: z,
                         maxZoom: (_zoom_limit_break ? 21 : 21),
                          center: yx,
                     scrollwheel: true,
                     zoomControl: true,
                      panControl: false,
                    scaleControl: true,
                  mapTypeControl: true,
               streetViewControl: true,
               navigationControl: true,
              overviewMapControl: false,
        streetViewControlOptions: { position: google.maps.ControlPosition.LEFT_BOTTOM },
              zoomControlOptions: { position: google.maps.ControlPosition.LEFT_BOTTOM },
            rotateControlOptions: { position: google.maps.ControlPosition.LEFT_BOTTOM },
        navigationControlOptions: { style: google.maps.NavigationControlStyle.DEFAULT },
           mapTypeControlOptions: {
                                     position: google.maps.ControlPosition.TOP_RIGHT,
                                        style: google.maps.MapTypeControlStyle.DROPDOWN_MENU,
                                   mapTypeIds: [google.maps.MapTypeId.ROADMAP, 
                                                google.maps.MapTypeId.SATELLITE, 
                                                google.maps.MapTypeId.HYBRID, 
                                                google.maps.MapTypeId.TERRAIN, 
                                                "gray", "dark", "toner", "tlite", "wcolor", "mapnik", "black", "white"]
                                  },
                       mapTypeId: GetDefaultBasemapOrOverrideFromQuerystring()
    };
    
    map = new google.maps.Map(document.getElementById("map_canvas"), map_options);

    InitBasemaps(); // must occur after "map" ivar is set
    InitGmapsLayers();

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
        InitMainMenu();
        (map.getStreetView()).setOptions({ zoomControlOptions: { position: google.maps.ControlPosition.LEFT_BOTTOM }, panControlOptions: { position: google.maps.ControlPosition.LEFT_BOTTOM }, enableCloseButton:true, imageDateControl:true, addressControlOptions:{ position: google.maps.ControlPosition.LEFT_BOTTOM } });
    }, 2000);
    
    setTimeout(function() {
        WhatsNewShowIfNeeded();
        //WarningShowIfNeeded();
    }, 3000);
}//initialize








function GetIsRetina() 
{ 
    return !_no_hdpi_tiles && window.devicePixelRatio > 1.5; 
}


function InitGmapsLayers()
{
    if (overlayMaps == null) overlayMaps = ClientZoomHelper.InitGmapsLayers_CreateAll();
}









function GetGmapsMapStyled_Dark()
{
    return [ {"stylers": [ { "invert_lightness": true }, { "saturation": -100 } ] },
             { "featureType": "water", "stylers": [ { "lightness": -100 } ] },
             { "elementType": "labels", "stylers": [ {  "lightness": -57  }, { "visibility": "on" } ] },
             { "featureType": "administrative", "elementType": "geometry", "stylers": [ { "lightness": -57 } ] } ];
}//GetGmapsMapStyled_Dark

function GetGmapsMapStyled_Gray() //-62 -> -9
{
    return [ { "featureType": "water", "stylers": [ { "saturation": -100 }, { "lightness": -30  } ] },
             { "stylers": [ { "saturation": -100 }, { "lightness": 50 } ] },
             { "elementType": "labels.icon", "stylers": [ { "invert_lightness": true }, { "gamma": 9.99 }, { "lightness": 79 } ] } ];
}//GetGmapsMapStyled_Dark

function NewGmapsBasemap(min_z, max_z, tile_size, is_png, alt, name, base_url)
{
    var o =
    {
        getTileUrl: function(xy, z) { var nXY = GetNormalizedCoord(xy, z); return nXY == null ? null : base_url + "/" + z + "/" + nXY.x + "/" + nXY.y + (is_png ? ".png" : ".jpg") ; },
          tileSize: new google.maps.Size(tile_size, tile_size),
           minZoom: min_z,
           maxZoom: max_z,
              name: name,
               alt: alt != null ? alt : name
    };
    
    return new google.maps.ImageMapType(o);
}//NewGmapsBasemap

function NewGmapsBasemapConst(tile_size, alt, name, tile_url) // single tile for all requests
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
}//NewGmapsBasemapConst

function InitBasemaps()
{
    tonerMapType  = NewGmapsBasemap(0, 19, 256, true, null, "Stamen Toner", "http://tile.stamen.com/toner");
    tliteMapType  = NewGmapsBasemap(0, 19, 256, true, null, "Stamen Toner Lite", "http://tile.stamen.com/toner-lite");
    wcolorMapType = NewGmapsBasemap(0, 19, 256, false, null, "Stamen Watercolor", "http://tile.stamen.com/watercolor");
    mapnikMapType = NewGmapsBasemap(0, 19, 256, true,  null, "OpenStreetMap", "http://tile.openstreetmap.org");
    pureBlackMapType = NewGmapsBasemapConst(256, "Pure Black World Tendency", "None (Black)", "http://safecast.media.mit.edu/tilemap/black.png");
    pureWhiteMapType = NewGmapsBasemapConst(256, "Pure White World Tendency", "None (White)", "http://safecast.media.mit.edu/tilemap/white.png");
    grayMapType = new google.maps.StyledMapType(GetGmapsMapStyled_Gray(), {name: "Map (Gray)"});
    darkMapType = new google.maps.StyledMapType(GetGmapsMapStyled_Dark(), {name: "Map (Dark)"});
    
    map.mapTypes.set( "toner", tonerMapType);
    map.mapTypes.set( "tlite", tliteMapType);
    map.mapTypes.set("wcolor", wcolorMapType);
    map.mapTypes.set("mapnik", mapnikMapType);
    map.mapTypes.set(  "gray", grayMapType);
    map.mapTypes.set(  "dark", darkMapType);
    map.mapTypes.set( "black", pureBlackMapType);
    map.mapTypes.set( "white", pureWhiteMapType);
}//InitBasemaps



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
        _bvProxy.AddLogsCSV(logIds);
    }//if
}//InitLogIdsFromQuerystring

function GetDefaultBasemapOrOverrideFromQuerystring()
{
    var midx = QueryString_GetParamAsInt("m");
    if (midx == -1) midx = QueryString_GetParamAsInt("midx");
    if (midx == -1) midx = 0;

    return GetMapTypeIdForBasemapIdx(midx);
}//GetDefaultBasemapOrOverrideFromQuerystring


function InitDefaultRasterLayerOrOverrideFromQuerystring()
{
    var lidx = QueryString_GetParamAsInt("l");
    if (lidx == -1) lidx = QueryString_GetParamAsInt("lidx");
    
    if (lidx == -1)
    {
        SetCurrentInstanceSelectedLayerIdx(0); // set default if nothing is selected
    }//if
    
    SetCurrentInstanceSelectedLayerIdxAndSynchronizeWithInstanceMap(lidx);
}//InitDefaultRasterLayerOrOverrideFromQuerystring

function InitZoomLimitBreak()
{
    _zoom_limit_break = QueryString_IsParamEqual("b", "1") || QueryString_IsParamEqual("zlb", "1") ? 1 : _zoom_limit_break;
}//InitZoomLimitBreak

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
        var cb2 = function() { MapExtent_OnChange(2); };
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
}

function InitShowLocationIfDefault()
{
    var yxz = GetUserLocationFromQuerystring();    
    if (yxz.yx == null) requestAnimationFrame(function() { ShowLocationText("Honshu, Japan"); });
}




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



function InitMainMenu() 
{
    if (IsBrowserOldIE()) return;
    
    var clickLL;
    var menu = document.createElement("ul");
    menu.id = "mainMenu";
    menu.style.display = "none";

    menu.innerHTML = '<li id="menuToggleRetina"><a href="#toggleRetina" class="FuturaFont" title="Disabling this can make small points easier to see at the cost of resolution.">HDPI Tiles On/Off</a></li>'
                   + '<li class="separator"></li>'
                   + '<li id="menuToggleSensors"><a href="#toggleSensors" class="FuturaFont" title="Add or remove RT sensor icons.">RT Sensors On/Off</a></li>'
                   + '<li id="menuToggleScale"><a href="#toggleScale" class="FuturaFont" title="Show or hide the LUT scale in the lower-right corner.">Scale On/Off</a></li>'
                   + '<li class="separator"></li>'
                   + '<li><a href="#apiQuery" class="FuturaFont" title="Perform API query for the centroid of the visible extent.  For touch devices.  Use reticle to aim.">API Query @ Center</a></li>'
                   + '<li class="separator"></li>'
                   + '<li id="menuToggleScaler"><a href="#toggleScaler" class="FuturaFont" title="Increases sharpness at the cost of aliasing.  Bilinear or bicubic are used if disabled.">Toggle Tile Scaler</a></li>';

    document.body.appendChild(menu);

    var fxShowMenu = function(e)
    {
        _mainMenu_hidden = false;
        AnimateElementFadeIn(menu, -1.0, 0.166666666667);
        menu.style.top  = "30px";
        menu.style.left = "30px";
        document.getElementById("menuToggleSensors").firstChild.innerHTML = "<input type=checkbox" + (_rtvm != null && _rtvm.GetMarkerCount() > 0 ? " checked=checked" : "") + "> Sensor Markers";
        document.getElementById("menuToggleScale").firstChild.innerHTML = "<input type=checkbox" + (document.getElementById("imgScale").style.display != "none" ? " checked=checked" : "") + "> Map Scale";
        document.getElementById("menuToggleRetina").firstChild.innerHTML = "<input type=checkbox" + (!_no_hdpi_tiles ? " checked=checked" : "") + "> HDPI Tiles";
        document.getElementById("menuToggleRetina").style.display         = window.devicePixelRatio > 1.5 ? null : "none";
        document.getElementById("menuToggleScaler").firstChild.innerHTML = "<input type=checkbox" + (_img_scaler_idx > 0 ? " checked=checked" : "") + "> NN Tile Scaler";
    };

    document.getElementById("logo271").addEventListener("click", fxShowMenu, false);

    var fxClickLeft = function()
    {
        var action = this.getAttribute("href").substr(1);        
        var retVal = false;                        
        switch (action) 
        {
            case "toggleScaler":
                ToggleScaler();
                break;
            case "toggleSensors":
                if (_rtvm != null)
                {
                    if (_rtvm.GetMarkerCount() > 0)
                    {
                        _rtvm.RemoveAllMarkersFromMapAndPurgeData();
                        _rtvm.ClearGmapsListeners();
                    }//if
                    else
                    {
                        _rtvm.InitMarkersAsync();
                        _rtvm.AddGmapsListeners();
                    }//else
                }//if
                break;
            case "toggleScale":
                var simg = document.getElementById("imgScale");
                simg.style.display = simg.style.display == null || simg.style.display.length == 0 ? "none" : null;
                break;
            case "toggleRetina":
                _no_hdpi_tiles = !_no_hdpi_tiles;
                document.getElementById("map_canvas").style.className = _no_hdpi_tiles ? "noblur" : null;
                overlayMaps = null;
                InitGmapsLayers();
                SynchronizeInstanceSelectedLayerAndInstanceMap();
                var c = GetMapInstanceYXZ();
                ClientZoomHelper.SynchronizeLayersToZoomLevel(c.z);
                break;
            case "apiQuery":
                var yx = GetNormalizedMapCentroid();
                QuerySafecastApiAsync(yx.y, yx.x, map.getZoom());
                break;
            case "null":
                break;
            default:
                retVal = true;
                break;
        }//switch
        
        _mainMenu_hidden   = true; 
        menu.style.display = "none";
        
        return retVal;
    };

    var as = menu.getElementsByTagName("a");
    
    for (var i=0; i<as.length; i++)
    {
        as[i].addEventListener("click", fxClickLeft, false);
        as[i].addEventListener("mouseover", function() { this.parentNode.className = "hover"; }.bind(as[i]), false);
        as[i].addEventListener("mouseout",  function() { this.parentNode.className = null;    }.bind(as[i]), false);
    }

    var events = [ "click" ]; //"maptypeid_changed",  "dragstart", "zoom_changed"

    var hide_cb = function()
    {
        if (!_mainMenu_hidden)
        { 
            _mainMenu_hidden   = true; 
            menu.style.display = "none";
        }//if
    };

    for (var i=0; i<events.length; i++)
    {
        google.maps.event.addListener(map, events[i], hide_cb);
    }//for
}//InitMainMenu




// ======== INIT: CONTEXT MENU ==========

function InitContextMenu() 
{
    if (IsBrowserOldIE() || map == null) return;

    // Original from http://justgizzmo.com/2010/12/07/google-maps-api-v3-context-menu/
    
    var cm = document.createElement("ul");
    cm.id = "contextMenu";
    cm.style.display = "none";
    cm.innerHTML = '<li><a href="#apiQuery" class="FuturaFont">Query Safecast API Here</a></li>'
                       + '<li class="separator"></li>'
                       + '<li><a href="#zoomIn" class="FuturaFont">Zoom In</a></li>'
                       + '<li><a href="#zoomOut" class="FuturaFont">Zoom Out</a></li>'
                       + '<li><a href="#centerHere" class="FuturaFont">Center Map Here</a></li>'
                       + '<li class="separator"></li>'
                       + '<li><a href="#zoomLimitBreak" class="FuturaFont">Zoom Limit Break</a></li>';
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
                case 'zoomIn':
                    map.setZoom(map.getZoom() + 3);
                    map.panTo(clickLL);
                    break;
                case 'zoomOut':
                    map.setZoom(map.getZoom() - 3);
                    map.panTo(clickLL);
                    break;
                case 'centerHere':
                    map.panTo(clickLL);
                    break;
                case 'null':
                    break;
                case 'showIndices1':
                    ShowBitmapIndexVisualization(true, 4);
                    break;
                case 'showIndices2':
                    ShowBitmapIndexVisualization(false, 4);
                    break;
                case 'zoomLimitBreak':
                    ApplyAndSetZoomLimitBreakIfNeeded();
                    break;
                case 'apiQuery':
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

function ApplyAndSetZoomLimitBreakIfNeeded()
{
    if (_zoom_limit_break) return;
    
    _zoom_limit_break = true;
    var oldIdx  = GetCurrentInstanceBasemapIdx();
    map.maxZoom = 21;
    map.setMapTypeId(null);
    map.setMapTypeId(GetMapTypeIdForBasemapIdx(oldIdx));
}

function QuerySafecastApiAsync(lat, lon, z)
{
    var url = 'https://api.safecast.org/en-US/measurements?utf8=%E2%9C%93&latitude=';
    url += RoundToD(lat,6)+'&longitude='+RoundToD(lon,6);
    url += '&distance='+Math.ceil(M_LatPxZ(lat, 1+1<<Math.max(z-13.0,0.0), z));
    url += '&captured_after=11%2F03%2F2011+00%3A00%3A00';
    url += '&captured_before='+GetDTQS()+'&since=&until=&commit=Filter';
    window.open(url);
}

// returns max days in month, used for "wrapping" to the next month by GetDTQS()
function GetMaxDDForMM(mm) { return mm == 2 ? 28 : mm == 4 || mm == 6 || mm == 8 || mm == 9 || mm == 11 ? 30 : 31; }

// returns string for the end date of an API query, which is the current day + 1.  this
// is done as a sanity check against bad date values in the database.  the API only accepts
// some non-standard date format.
function GetDTQS()
{
    var d  = new Date();
    var dd = (d.getUTCDate()+2);  // offset by 1 due to zero-based index, then offset by another 1 for sanity filter
    var mm = (d.getUTCMonth()+1); // offset by 1 due to zero-based index
    var yy = d.getUTCFullYear();
    
    if (GetMaxDDForMM(mm) < dd) // prevent +1 day from returning an invalid date
    {
        dd = 1;
        yy = mm == 12 ? yy + 1 : yy;
        mm = mm != 12 ? mm + 1 : 1;
    }//if
    
    return ""+ dd + "%2F" + mm + "%2F" + yy + "+00%3A00%3A00";
}//GetDTQS

// returns double-precision floating point value x rounded to d base-10 decimal places
function RoundToD(x,d) { return Math.round(x*Math.pow(10.0,d))/Math.pow(10.0,d); }

// returns meters per pixel for a given EPSG:3857 Web Mercator zoom level, for the
// given latitude and number of pixels.
function M_LatPxZ(lat,px,z) { return (Math.cos(lat*Math.PI/180.0)*2.0*Math.PI*6378137.0/(256.0*Math.pow(2.0,z)))*px; }






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




function Layers_OnChange() 
{
    var newIdx = GetCurrentInstanceSelectedLayerIdx();
    
    if (newIdx == _lastLayerIdx) return;

    if (IsLayerIdxAddLog(newIdx))
    {
        SetCurrentInstanceSelectedLayerIdx(_lastLayerIdx);
        ApplyAndSetZoomLimitBreakIfNeeded();
        _bvProxy.ShowAddLogsPanel();
    }//if
    else
    {    
        // 2015-02-12 ND: don't init bitstores for other layers until needed.
        _bitsProxy.LegacyInitForSelection();
        
        SynchronizeInstanceSelectedLayerAndInstanceMap();
        
        MapExtent_OnChange(100); // force URL update
        
        if (!IsLayerIdxNull(newIdx))
        {    
            FlyToExtent.GoToPresetLocationIdIfNeeded(newIdx);
        }//if
    }//else
}//Layers_OnChange()


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
}


function GetMapQueryStringUrl(isFull)
{
    var logs = _bvProxy._bvm == null ? null 
             : isFull ? _bvProxy.GetAllLogIdsEncoded() 
             : _bvProxy.GetLogIdsEncoded();
    
    var q = _cached_ext;
    
    var url = q.urlyxz;
    
    if (q.lidx > 0)        url += "&l=" + q.lidx;
    //if (_zoom_limit_break) url += "&b=1";
    if (q.midx > 0)        url += "&m=" + q.midx;
    if (logs != null && logs.length > 0) url += "&logids=" + logs;
    
    return url;
}

var ClientZoomHelper = (function()
{
    function ClientZoomHelper() 
    {
    }
    
    ClientZoomHelper.fxGetNormalizedCoord  = function(xy, z)   { return GetNormalizedCoord(xy, z); }; // static
    ClientZoomHelper.fxShouldLoadTile      = function(l,x,y,z) { return _bitsProxy.ShouldLoadTile(l, x, y, z); };
    ClientZoomHelper.fxGetIsRetina         = function()        { return GetIsRetina(); };
    ClientZoomHelper.fxGetSelectedLayerIdx = function()        { return GetCurrentInstanceSelectedLayerIdx(); };
    ClientZoomHelper.fxClearMapLayers      = function()        { map.overlayMapTypes.clear(); };
    ClientZoomHelper.fxSyncMapLayers       = function()        { SynchronizeInstanceSelectedLayerAndInstanceMap(); };
    ClientZoomHelper.fxGetLayers           = function()        { return overlayMaps; };
    
    
    ClientZoomHelper.GetUrlForTile512 = function(xy, z, layerId, normal_max_z, base_url, idx)
    {
        z = ClientZoomHelper.GetClampedZoomLevelForIdx(idx, z);
    
        if (!ClientZoomHelper.fxGetIsRetina() && z > 0 && z < normal_max_z) z -= 1;
    
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
            if (i == idx || (idx == 0 && i == 2))
            {
                lz = o[i].ext_tile_size > 256 && !hdpi && z < o[i].ext_actual_max_z ? z - 1 : z;  //  z--   for 512x512 tiles on non-retina displays only
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
        var dz = o == null || z <= o[idx].ext_actual_max_z ? z : o[idx].ext_actual_max_z;        
        return dz;
    };
    
    
    
    // layerId is for bitstores. a proxy layerId should be used for similar secondary layers to reduce memory use.
    ClientZoomHelper.InitGmapsLayers_Create = function(idx, layerId, maxz, alpha, tile_size, url)
    {
        var o = { opacity:alpha, 
             ext_layer_id:layerId, 
         //ext_url_template:url+(tile_size == 512 && url.indexOf("safecast.media.mit.edu") > -1 ? "512" : "") + "/{z}/{x}/{y}.png",
         ext_url_template:url,
         ext_actual_max_z:(tile_size == 512 ? maxz-1 : maxz),
            ext_tile_size:tile_size,
                  ext_idx:idx};
    
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
       // var zs = 0;//-1;
        
        //var te512url = "http://te512" + (_use_jp_region ? "jp" : "") + ".safecast.org.s3.amazonaws.com/{z}/{x}/{y}.png";
        //var tg512url = "http://tg512" + (_use_jp_region ? "jp" : "") + ".safecast.org.s3.amazonaws.com/{z}/{x}/{y}.png";
        
        var te512url = _use_jp_region ? "http://te512jp.safecast.org.s3-ap-northeast-1.amazonaws.com/{z}/{x}/{y}.png"
                                      : "http://te512.safecast.org.s3.amazonaws.com/{z}/{x}/{y}.png";
        
        var tg512url = _use_jp_region ? "http://tg512jp.safecast.org.s3-ap-northeast-1.amazonaws.com/{z}/{x}/{y}.png"
                                      : "http://tg512.safecast.org.s3.amazonaws.com/{z}/{x}/{y}.png";

        var nnsa_url = _use_jp_region ? "http://nnsajp.safecast.org.s3-ap-northeast-1.amazonaws.com/{z}/{x}/{y}.png"
                                      : "http://nnsa.safecast.org.s3.amazonaws.com/{z}/{x}/{y}.png";

        var nure_url = _use_jp_region ? "http://nurejp.safecast.org.s3-ap-northeast-1.amazonaws.com/{z}/{x}/{y}.png"
                                      : "http://nure.safecast.org.s3.amazonaws.com/{z}/{x}/{y}.png";

        var au_url   = _use_jp_region ? "http://aujp.safecast.org.s3-ap-northeast-1.amazonaws.com/{z}/{x}/{y}.png"
                                      : "http://au.safecast.org.s3.amazonaws.com/{z}/{x}/{y}.png";

        var aist_url = _use_jp_region ? "http://aistjp.safecast.org.s3-ap-northeast-1.amazonaws.com/{z}/{x}/{y}.png"
                                      : "http://aist.safecast.org.s3.amazonaws.com/{z}/{x}/{y}.png";

        var te13_url = _use_jp_region ? "http://te20130415jp.safecast.org.s3-ap-northeast-1.amazonaws.com/{z}/{x}/{y}.png"
                                      : "http://te20130415.safecast.org.s3.amazonaws.com/{z}/{x}/{y}.png";

        var te14_url = _use_jp_region ? "http://te20140311jp.safecast.org.s3-ap-northeast-1.amazonaws.com/{z}/{x}/{y}.png"
                                      : "http://te20140311.safecast.org.s3.amazonaws.com/{z}/{x}/{y}.png";

        //var te512url = is_jp ? "http://te512jp.safecast.org.s3.amazonaws.com" : "http://safecast.media.mit.edu/tilemap/TileExport";
        //var tg512url = is_jp ? "http://tg512jp.safecast.org.s3.amazonaws.com" : "http://safecast.media.mit.edu/tilemap/TileGriddata";
        
        //x.push( ClientZoomHelper.InitGmapsLayers_Create( 0, 2,  17+zs, 1.0, 512, "http://safecast.media.mit.edu/tilemap/TileExport") );
        //x.push( ClientZoomHelper.InitGmapsLayers_Create( 1, 2,  17+zs, 0.8, 512, "http://safecast.media.mit.edu/tilemap/TileExport") );
        x.push( ClientZoomHelper.InitGmapsLayers_Create( 0, 2,  17, 1.0, 512, te512url) );
        x.push( ClientZoomHelper.InitGmapsLayers_Create( 1, 2,  17, 1.0, 512, te512url) );
        //x.push( ClientZoomHelper.InitGmapsLayers_Create( 2, 8,  15+zs, 0.5, 512, "http://safecast.media.mit.edu/tilemap/TileGriddata") );
        x.push( ClientZoomHelper.InitGmapsLayers_Create( 2, 8,  15, 0.5, 512, tg512url) );
        
        x.push( ClientZoomHelper.InitGmapsLayers_Create( 3, 3,  16, 1.0, 512, nnsa_url) );
        x.push( ClientZoomHelper.InitGmapsLayers_Create( 4, 6,  12, 0.7, 512, nure_url) );
        x.push( ClientZoomHelper.InitGmapsLayers_Create( 5, 16, 12, 0.7, 512, au_url) );
        x.push( ClientZoomHelper.InitGmapsLayers_Create( 6, 9,  12, 0.7, 512, aist_url) );
        x.push( ClientZoomHelper.InitGmapsLayers_Create( 7, 9,  15, 1.0, 256, "http://safecast.media.mit.edu/tilemap/TestIDW/{z}/{x}/{y}.png") );
        x.push( ClientZoomHelper.InitGmapsLayers_Create( 8, 2,  17, 1.0, 512, te13_url) );
        x.push( ClientZoomHelper.InitGmapsLayers_Create( 9, 2,  17, 1.0, 512, te14_url) );

        /*
        x.push( ClientZoomHelper.InitGmapsLayers_Create( 3, 3,  16+zs, 1.0, 256, "http://safecast.media.mit.edu/tilemap/TileExportNNSA/{z}/{x}/{y}.png") );
        x.push( ClientZoomHelper.InitGmapsLayers_Create( 4, 6,  12+zs, 0.7, 256, "http://safecast.media.mit.edu/tilemap/TileExportNURE/{z}/{x}/{y}.png") );
        x.push( ClientZoomHelper.InitGmapsLayers_Create( 5, 16, 12+zs, 0.7, 256, "http://safecast.media.mit.edu/tilemap/TileExportAU/{z}/{x}/{y}.png") );
        x.push( ClientZoomHelper.InitGmapsLayers_Create( 6, 9,  12+zs, 0.7, 256, "http://safecast.media.mit.edu/tilemap/TileExportAIST/{z}/{x}/{y}.png") );
        x.push( ClientZoomHelper.InitGmapsLayers_Create( 7, 9,  15+zs, 1.0, 256, "http://safecast.media.mit.edu/tilemap/TestIDW/{z}/{x}/{y}.png") );
        x.push( ClientZoomHelper.InitGmapsLayers_Create( 8, 2,  17+zs, 1.0, 512, "http://safecast.media.mit.edu/tilemap/tiles20130415sc512/{z}/{x}/{y}.png") );
        x.push( ClientZoomHelper.InitGmapsLayers_Create( 9, 2,  17+zs, 1.0, 512, "http://safecast.media.mit.edu/tilemap/tiles20140311sc512/{z}/{x}/{y}.png") );
        */
        return x;
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
        q.lidx = GetCurrentInstanceSelectedLayerIdx();
    }//if

    if (q.midx == -1) q.midx = GetCurrentInstanceBasemapIdx();

    if (updateBasemap) // either init load, or basemap was changed
    {
        q.midx = GetCurrentInstanceBasemapIdx();
        q.mt   = GetMapTypeIdForBasemapIdx(q.midx);
        _disable_alpha = q.midx == 10 || q.midx == 11; // pure black / white
    
        // sync the raster tile overlay alpha with the determination made above
             if ( _disable_alpha && overlayMaps[4].opacity != 1.0) SetLayersAlphaDisabled(true);
        else if (!_disable_alpha && overlayMaps[4].opacity == 1.0) SetLayersAlphaDisabled(false);
        
        if (!initLoad && map.overlayMapTypes.getLength() > 0) SynchronizeInstanceSelectedLayerAndInstanceMap(); // reload overlay if basemap changes
    }//if
    
    
    
    if (updateZ || updateLayers || updateBasemap) // zoom_changed
    {
        //console.log("MapExtent_OnChange: Applying zoom hack...");
        c = GetMapInstanceYXZ();
        ClientZoomHelper.SynchronizeLayersToZoomLevel(c.z);
        //ApplyZoomHack(c.z);
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
            SynchronizeInstanceSelectedLayerAndInstanceMap();
        }//if
        else if (q.lidx == 2 && _disable_alpha && overlayMaps[2].opacity != 1.0)
        {
            overlayMaps[2].opacity = 1.0;
            SynchronizeInstanceSelectedLayerAndInstanceMap();
        }//if
    }//if
        
    if (updateLatLon || updateZ)
    {
        if (c == null) c = GetMapInstanceYXZ();
        q.urlyxz = q.baseurl + ("?y=" + c.y) + ("&x=" + c.x) + ("&z=" + c.z);
    }//if
    
    var url = GetMapQueryStringUrl(true); // 2015-03-30 ND: false -> true so all logids are present, must test performance

    if (!initLoad)
    history.pushState(null, null, url);
}//MapExtent_OnChange

function SetLayersAlphaDisabled(isDisabled)
{
    overlayMaps[1].opacity = isDisabled ? 1.0 : 0.5;
    overlayMaps[2].opacity = isDisabled ? 1.0 : 0.5;
    overlayMaps[4].opacity = isDisabled ? 1.0 : 0.7;
    overlayMaps[5].opacity = isDisabled ? 1.0 : 0.7;
    overlayMaps[6].opacity = isDisabled ? 1.0 : 0.7;
}//SetLayersAlphaDisabled


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

function GetCurrentInstanceBasemapIdx()
{
    var mapType = map.getMapTypeId();
    var idx     = 0;

    switch (mapType)
    {
         case google.maps.MapTypeId.ROADMAP:
              idx = 0;
              break;
         case google.maps.MapTypeId.SATELLITE:
              idx = 1;
              break;
         case google.maps.MapTypeId.HYBRID:
              idx = 2;
              break;
         case google.maps.MapTypeId.TERRAIN:
              idx = 3;
              break;
         case "gray":
              idx = 4;
              break;
         case "dark":
              idx = 5;
              break;
         case "toner":
              idx = 6;
              break;
         case "tlite":
              idx = 7;
              break;
         case "wcolor":
              idx = 8;
              break;
         case "mapnik":
              idx = 9;
              break;
         case "black":
              idx = 10;
              break;
         case "white":
              idx = 11;
              break;
         default:
              idx = 0;
              break;
    }//switch

    return idx;
}//GetCurrentInstanceBasemapIdx

function GetMapTypeIdForBasemapIdx(idx)
{
    var mapType = null;

    switch (idx)
    {
         case 0:
              mapType = google.maps.MapTypeId.ROADMAP;
              break;
         case 1:
              mapType = google.maps.MapTypeId.SATELLITE;
              break;
         case 2:
              mapType = google.maps.MapTypeId.HYBRID;
              break;
         case 3:
              mapType = google.maps.MapTypeId.TERRAIN;
              break;
         case 4:
              mapType = "gray";
              break;
         case 5:
              mapType = "dark";
              break;
         case 6:
              mapType = "toner";
              break;
         case 7:
              mapType = "tlite";
              break;
         case 8:
              mapType = "wcolor";
              break;
         case 9:
              mapType = "mapnik";
              break;
         case 10:
              mapType = "black";
              break;
         case 11:
              mapType = "white";
              break;
         default:
              mapType = google.maps.MapTypeId.ROADMAP;
              break;
    }//switch

    return mapType;
}//GetMapTypeIdForBasemapIdx

function IsLayerIdxNull(idx)
{
    return idx == 11;
}

function IsLayerIdxAddLog(idx)
{
    return idx == 10;
}

function GetCurrentInstanceMaxLayerIdx()
{
    return document.getElementById("layers").length > 1 ? document.getElementById("layers").length - 1 : 0;
}

function GetCurrentInstanceSelectedLayerIdx()
{
    //return document.getElementById("layers").selectedIndex;
    var el = document.getElementById("layers");
    return parseInt(el.options[el.selectedIndex].value);
}

function SetCurrentInstanceSelectedLayerIdx(idx)
{
    if (   idx != null)
        //&& idx  > 0
        //&& idx <= GetCurrentInstanceMaxLayerIdx())
    {
        //document.getElementById("layers").selectedIndex = idx;
        var el = document.getElementById("layers");
        for (var i=0; i<el.options.length; i++)
        {
            var o = el.options[i];
            
            if (o.value == idx)
            {
                el.selectedIndex = i;
                break;
            }//if
        }//for
    }//if
}//SetCurrentInstanceSelectedLayerIdx

function SetCurrentInstanceSelectedLayerIdxAndSynchronizeWithInstanceMap(idx)
{
    SetCurrentInstanceSelectedLayerIdx(idx);
    SynchronizeInstanceSelectedLayerAndInstanceMap();
}


function RemoveAllRasterLayersFromInstanceMap()
{
    map.overlayMapTypes.clear();
    _hudProxy.SetLayers(new Array());
}

function RasterLayer_DataBind_Gmaps(idxs)
{
    var hud_layers = new Array();

    for (var i=0; i<idxs.length; i++)
    {
        var gmaps_layer = new google.maps.ImageMapType(overlayMaps[idxs[i]]);
        map.overlayMapTypes.setAt(i, gmaps_layer);
        
        hud_layers.push({     urlTemplate: overlayMaps[idxs[i]].ext_url_template, 
                          bitstoreLayerId: overlayMaps[idxs[i]].ext_layer_id });
    }//for
    
    _hudProxy.SetLayers(hud_layers);
}//RasterLayer_DataBind_Gmaps

function AddRasterLayerToInstanceMapByIdx(idx)
{
    RasterLayer_DataBind_Gmaps([idx]);
}


function AddSingleRasterLayerToInstanceMapByIdx(idx)
{
    RemoveAllRasterLayersFromInstanceMap();

    if (!IsLayerIdxNull(idx))
    {
        if (idx == 0 && !_test_client_render) RasterLayer_DataBind_Gmaps([2, 0]);
        else AddRasterLayerToInstanceMapByIdx(idx);
    }//if
    
    _lastLayerIdx = idx;
}//AddSingleRasterLayerToInstanceMapByIdx


function SynchronizeInstanceSelectedLayerAndInstanceMap()
{
    AddSingleRasterLayerToInstanceMapByIdx(GetCurrentInstanceSelectedLayerIdx());
}

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
    var d    = new Date();
    url     += "?t=" + d.getTime();
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
        //var idx = this.ddlLayers.selectedIndex;
        var idx = GetCurrentInstanceSelectedLayerIdx();
        if (idx <= 2 || idx >= 7) return;
        
        var layerId = idx == 3 ? 3 // todo: define these more formally somewhere.
                    : idx == 4 ? 6
                    : idx == 5 ? 16
                    : idx == 6 ? 9  : 9;
        
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
        //var url   = "http://safecast.media.mit.edu/tilemap/TileExport512/{z}/{x}/{y}.png";
        
        var url = _use_jp_region ? "http://te512jp.safecast.org.s3-ap-northeast-1.amazonaws.com/{z}/{x}/{y}.png"
                                 : "http://te512.safecast.org.s3.amazonaws.com/{z}/{x}/{y}.png";        

        var opts2 = new LBITSOptions({ lldim:1, ll:1, unshd:1, alpha:255, multi:0, maxz:4, url0:BitsProxy.pngsrc, url1:BitsProxy.bitsrc, w:512, h:512 });
        var dcb2  = function(dstr)
        {
            if (this.ddlLayers != null)
            {
                for (var i=0; i<this.ddlLayers.options.length; i++)
                {
                    var o = this.ddlLayers.options[i];
            
                    if (o.value == 0 || o.value == 1)
                    {
                        o.text += " " + dstr;
                    }//if
                }//for
            }//if
        }.bind(this);
    
        this._layerBitstores.push(new LBITS(2, 0, 16, url, 0, 0, opts2, dcb2));
    };

    BitsProxy.prototype.Init_LayerId08 = function()
    {
        //var url   = "http://safecast.media.mit.edu/tilemap/TileGriddata512/{z}/{x}/{y}.png";
        
        var url = _use_jp_region ? "http://tg512jp.safecast.org.s3-ap-northeast-1.amazonaws.com/{z}/{x}/{y}.png"
                                 : "http://tg512.safecast.org.s3.amazonaws.com/{z}/{x}/{y}.png";        

        var opts8 = new LBITSOptions({ lldim:1, ll:1, multi:1, maxz:5, multi:0, url0:BitsProxy.pngsrc, url1:BitsProxy.bitsrc, w:512, h:512 });
        var dcb8  = function(dstr)
        {
            if (this.ddlLayers != null)
            {
                for (var i=0; i<this.ddlLayers.options.length; i++) 
                {
                    var o = this.ddlLayers.options[i];
            
                    if (o.value == 2)
                    {
                        o.text += " " + dstr;
                        break;
                    }//if
                }//for
            }//if
        }.bind(this);
    
        this._layerBitstores.push(new LBITS(8, 2, 14, url, 3, 1, opts8, dcb8));
    };

    BitsProxy.prototype.Init_LayerId03 = function()
    {
        //var url   = "http://safecast.media.mit.edu/tilemap/TileExportNNSA/{z}/{x}/{y}.png";
        var url = _use_jp_region ? "http://nnsajp.safecast.org.s3-ap-northeast-1.amazonaws.com/{z}/{x}/{y}.png"
                                 : "http://nnsa.safecast.org.s3.amazonaws.com/{z}/{x}/{y}.png";

        var opts3 = new LBITSOptions({ lldim:1, ll:1, unshd:1, alpha:255, multi:0, url0:BitsProxy.pngsrc, url1:BitsProxy.bitsrc, w:512, h:512 });
        this._layerBitstores.push(new LBITS(3, 1, 16, url, 1, 0, opts3, null));
    };

    BitsProxy.prototype.Init_LayerId06 = function()
    {
        //var url   = "http://safecast.media.mit.edu/tilemap/TileExportNURE/{z}/{x}/{y}.png";
        var url = _use_jp_region ? "http://nurejp.safecast.org.s3-ap-northeast-1.amazonaws.com/{z}/{x}/{y}.png"
                                 : "http://nure.safecast.org.s3.amazonaws.com/{z}/{x}/{y}.png";
        
        var opts6 = new LBITSOptions({ lldim:1, ll:1, multi:0, url0:BitsProxy.pngsrc, url1:BitsProxy.bitsrc, w:512, h:512 });
        this._layerBitstores.push(new LBITS(6, 1, 12, url, 0, 0, opts6, null));
    };
    
    BitsProxy.prototype.Init_LayerId09 = function()
    {
        //var url   = "http://safecast.media.mit.edu/tilemap/TileExportAIST/{z}/{x}/{y}.png";
        var url = _use_jp_region ? "http://aistjp.safecast.org.s3-ap-northeast-1.amazonaws.com/{z}/{x}/{y}.png"
                                 : "http://aist.safecast.org.s3.amazonaws.com/{z}/{x}/{y}.png";

        var opts9 = new LBITSOptions({ lldim:1, ll:1, multi:0, url0:BitsProxy.pngsrc, url1:BitsProxy.bitsrc, w:512, h:512 });
        this._layerBitstores.push(new LBITS(9, 1, 12, url, 1, 0, opts9, null));
    };

    BitsProxy.prototype.Init_LayerId16 = function()
    {
        //var url    = "http://safecast.media.mit.edu/tilemap/TileExportAU/{z}/{x}/{y}.png";
        var url = _use_jp_region ? "http://aujp.safecast.org.s3-ap-northeast-1.amazonaws.com/{z}/{x}/{y}.png"
                                 : "http://au.safecast.org.s3.amazonaws.com/{z}/{x}/{y}.png";
        
        var opts16 = new LBITSOptions({ lldim:1, ll:1, multi:0, url0:BitsProxy.pngsrc, url1:BitsProxy.bitsrc, w:512, h:512 });
        this._layerBitstores.push(new LBITS(16, 1, 12, url, 1, 1, opts16, null));
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
        if (GetIsRetina() && z == max_z)
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
        
    BitsProxy.relsrc = GetContentBaseUrl() + "bitstore_min.js";
    BitsProxy.bitsrc = "http://safecast.org/tilemap/bitstore_min.js";
    BitsProxy.pngsrc = "http://safecast.org/tilemap/png_zlib_worker_min.js";
    
    BitsProxy.CheckRequirements = function()
    {
        return !QueryString_IsParamEqual("noIndices", "1") && !IsBrowserOldIE() && "ArrayBuffer" in window && "bind" in Function.prototype;
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

    BvProxy.prototype.AddLogsCSV = function(csv)
    {
        if (this._noreqs) return this.ShowRequirementsError();
    
        var cb = function(userData) { this._bvm.SetZoomToLogExtent(false); this._bvm.AddLogsByQueryFromString(userData); }.bind(this);
        this.ExecuteWithAsyncLoadIfNeeded(cb, csv);
    };

    BvProxy.prototype.btnAddLogsOnClick = function()
    {
        var csv         = BvProxy.elVal("bv_tbLogIDs");
        var queryTypeId = this.UI_GetQueryType();
        var params      = this.UI_GetExtraQueryStringParams();
        var pageLimit   = this.UI_GetMaxPages();
    
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
    
    BvProxy.prototype.UI_GetMaxPages = function()
    {
        return parseInt(BvProxy.ddlVal("bv_ddlMaxPages"));
    };
    
    BvProxy.prototype.UI_GetExtraQueryStringParams = function()
    {
        return this.UI_GetQueryType() == 0 ? "" 
               : this.UI_GetStartDateParamIfPresent() 
               + this.UI_GetEndDateParamIfPresent() 
               + this.UI_GetStatusTypeParamIfPresent(); 
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
        BvProxy.elDis("bv_ddlMaxPages", d);
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
        var yy = rfc_date.substring(0, 0+4);
        var mm = rfc_date.substring(5, 5+2);
        var dd = rfc_date.substring(8, 8+2);
        
        return mm + "%2F" + dd + "%2F" + yy + "+" + (isMidnight ? "00%3A00%3A00" : "23%3A59%3A59");
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
    FlyToExtent.fxUpdateMapExtent  = function() { MapExtent_OnChange(0); MapExtent_OnChange(1); };
    
    FlyToExtent.GoToPresetLocationIdIfNeeded = function(locId)
    {
        var p = null;
        
        switch(locId)
        {
            case 0: // ahhh
            case 8: // i'm
            case 9: // falling
            case 1: // through
                p = [-163.0, -78.1, 178.0, 63.5, 17, "Earth"];
                break;
            case 2:
                p = [124.047, 24.309, 146.433, 46.116, 15, "Japan"];
                break;
            case 3:
                p = [138.785, 35.143, 141.125, 38.234, 16, "Honshu, Japan"];
                break;
            case 4:
                p = [-168.08, 24.712, -53.337, 71.301, 12, "North America"];
                break;
            case 5:
                p = [112.81, -43.07, 154.29, -9.85, 12, "Australia"];
                break;
            case 6:
                p = [124.047, 24.309, 146.433, 46.116, 12, "Japan"];
                break;
            case 7:
                p = [129.76, 31.21, 144.47, 45.47, 15, "Japan"];
                break;
        }//switch
    
        if (p != null) FlyToExtent.GoToLocationWithTextIfNeeded(p[0], p[1], p[2], p[3], p[4], p[5])
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
    
    FlyToExtent.GoToLocationWithTextIfNeeded = function(x0, y0, x1, y1, z, txt)
    {
    // first, don't bother if the user is already looking at it.
    
    var vis        = FlyToExtent.GetCurrentVisibleExtent();
    var already_in = true;//vis[6] <= z; // past max zoom level isn't in, at all.
    
    if (already_in)
    {
        already_in = FlyToExtent.IsIntersectingExtents(vis, [x0, y0, x1, y1]);
        
        if (!already_in && vis[4] != -9000.0) // handle 180th meridian spans
        {
            already_in = FlyToExtent.IsIntersectingExtents([vis[4], vis[1], vis[5], vis[3]], [x0, y0, x1, y1]);
        }//if
    }//if
    
    if (already_in) return;

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

function ShowLocationText(txt)
{
    InitFont_CrimsonText();
    
    var el = document.createElement("div");
    
    var map_w = (window.outerWidth || window.innerWidth || document.getElementById("map_canvas").offsetWidth) - 60.0;
    
    if (map_w * window.devicePixelRatio < 400) return;
    
    var scale = map_w < 1200 && map_w != 0 ? map_w / 1200.0 : 1.0;
    
    var el_width = Math.floor(1200.0 * scale);
    var el_height = Math.floor(144.0 * scale);
    var el2_fontsize = Math.floor(96.0 * scale);
    var el2_str_w = 2.0 * scale;
    
    var el3_top = el2_fontsize + Math.ceil(5.0 * scale); //122; // DkS2 style = 27.0 * scale
    var el3_width = Math.floor(el_width * 0.9383); //1126;
    var el3_height = Math.ceil(3.0 * scale);
    
    el.id = "location_text";
    var es = el.style;
    es.pointerEvents = "none";
    es.position = "absolute"; // rel position: DkS2 style; abs position: DkS1 style
    es.display = "block";
    es.top = "0px";
    es.bottom = "0px";
    es.left = "0px";
    es.right = "0px";
    es.width = el_width.toFixed(0) + "px";
    es.height = el_height.toFixed(0) + "px";
    es.margin = "auto";
    es.textAlign = "center";
    es.opacity = 0.0;
    
    var el2 = document.createElement("div");
    var es2 = el2.style;
    es2.fontFamily = "Crimson Text";
    es2.fontSize = el2_fontsize.toFixed(0) + "px";
    es2.textAlign = "center";
    es2.verticalAlign = "middle";
    es2.textShadow = "0px 0px 1px #000";
    es2.color = "#FFF";
    es2["-webkit-text-fill-color"] = "#FFF";
    es2["-webkit-text-stroke-color"] = "#000";
    es2["-webkit-text-stroke-width"] = el2_str_w.toFixed(1) + "px";
    es2.zIndex = "1";
    es2.position = "absolute";
    es2.left = "0px";
    es2.right = "0px";
    es2.margin = "auto";
    el2.innerHTML = txt;
    el.appendChild(el2);
    
    var el3 = document.createElement("hr");
    var es3 = el3.style;
    es3.height = el3_height.toFixed(0) + "px";
    es3.width = el3_width.toFixed(0) + "px";
    es3.position = "absolute";
    es3.top = el3_top.toFixed(0) + "px";
    es3.left = "0px";
    es3.right = "0px";
    es3.margin = "auto";
    es3.border = "1px solid #000";
    es3.backgroundColor = "#FFF";
    es3.zIndex = "0";
    el.appendChild(el3);
    
    document.body.appendChild(el);
    
    var cbFade = function()
    {
        setTimeout(function() {
            AnimateElementFadeOut(el, 1.0, -0.033333333333 * 2.0);
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
    //setTimeout(function() {
        AnimateElementFadeIn(el, 0.0, 0.033333333333 * 10.0, cbFade);
    //}, 250);
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


var LoadingSpinnerHelper = (function()
{
    function LoadingSpinnerHelper() 
    {
    }
        
    LoadingSpinnerHelper.DoesStyleExist = function(src, t)
    {
        var d = false;
    
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


