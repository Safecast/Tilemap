// ===============================================================================================
// ======================================== FLY-TO-EXTENT ========================================
// ===============================================================================================

// FlyToExtent: Performs a "fly to" animation for a designated location using the Google Maps API,
//              then displays the name of the location in a large centered screen label breifly.
//              Will not "fly" to the location if it's already in view.
//
var FlyToExtent = (function()
{
    function FlyToExtent(mapref, fxUpdateMapExtent) 
    {
        this._locationText     = new LocationText();
        this.mapref            = mapref;
        this.fxUpdateMapExtent = fxUpdateMapExtent;
        this._inFlight         = false;
    }

    //FlyToExtent.MapRef             = window.map;
    //FlyToExtent.fxShowLocationText = function(txt) { ShowLocationText(txt); };
    //FlyToExtent.fxUpdateMapExtent  = function()    { MapExtent_OnChange(0); MapExtent_OnChange(1); };
    
    //FlyToExtent.GoToPresetLocationIdIfNeeded(idx); };

    FlyToExtent.prototype.ShowLocationText = function(txt)
    {
        this._locationText.ShowLocationText(txt);
    };

    FlyToExtent.prototype.GoToPresetLocationIdIfNeeded = function(locId)
    {
        var p = _GetExtentForLocId(locId);    
        if (p != null) this.GoToLocationWithTextIfNeeded(p[0], p[1], p[2], p[3], p[4], p[5], p[6])
    };

    FlyToExtent.prototype.GetNormalizedMapCentroid = function()
    {
        var centroid = this.mapref.getCenter();
        var clat = _ClampLatToMercPlane(centroid.lat()); // valid here because only being used to convert to EPSG:3857
        var clon = centroid.lng();
    
        if (clon > 180.0 || clon < -180.0) clon = clon % 360.0 == clon % 180.0 ? clon % 180.0 : (clon > 0.0 ? -1.0 : 1.0) * 180.0 + (clon % 180.0); // thanks Google
    
        return { y:clat, x:clon };
    };

    FlyToExtent.prototype.GetCurrentVisibleExtent = function()
    {
        var b   = this.mapref.getBounds();
        var y0  = b.getSouthWest().lat();
        var x0  = b.getSouthWest().lng();
        var y1  = b.getNorthEast().lat();
        var x1  = b.getNorthEast().lng();
        var z   = this.mapref.getZoom();
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

    FlyToExtent.prototype.GoToLocationWithTextIfNeeded = function(x0, y0, x1, y1, min_z, z, txt)
    {
        // first, don't bother if the user is already looking at it.
        var vis        = this.GetCurrentVisibleExtent();
        var already_in = true;//vis[6] <= z; // past max zoom level isn't in, at all.
    
        if (already_in)
        {
            already_in = vis[6] >= min_z; // past min zoom level of layer
        }//if
    
        if (already_in)
        {
            already_in = _IsIntersectingExtents(vis, [x0, y0, x1, y1]);

            if (!already_in && vis[4] != -9000.0) // handle 180th meridian spans
            {
                already_in = _IsIntersectingExtents([vis[4], vis[1], vis[5], vis[3]], [x0, y0, x1, y1]);
            }//if
        }//if
    
        if (already_in || this._inFlight || !("requestAnimationFrame" in window)) return;

        // but if they aren't looking at it, then fly to it.
        this._inFlight = true;

        var yxz   = _GetRegionForExtentAndClientView_EPSG4326(x0, y0, x1, y1);
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
        var src_c    = this.GetNormalizedMapCentroid(); // you'd think the fucking framework would do this
        var dest_lat = yxz[0].lat();
        var dest_lon = yxz[0].lng();    
        var src_mxy  = _LatLonToXYZ_EPSG3857(src_c.y, src_c.x, zoom_out_dest);
        var dest_mxy = _LatLonToXYZ_EPSG3857(dest_lat, dest_lon, zoom_out_dest);
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



        var lat = y0 + (y1 - y0) * 0.5;
        var lon = x0 + (x1 - x0) * 0.5;
        var  sm = x1 - x0 < 1.0 && y1 - y0 < 1.0;
    
        // 3. now finally zoom in
        if (zoom_out_dest < yxz[1])
        {
            for (var dz = zoom_out_dest + 1; dz <= yxz[1]; dz++)
            {
                stops.push( { x:null, y:null, z:dz, t:50 } );
                if (sm) stops.push( { x:lon,  y:lat,  z:-1, t:1  } ); // 2016-11-23 ND: correct centroid during zoom, or it will be wrong for small dests.
            }//for
        }//if
        
        //console.log("FlyToExtent: Flight plan for lat=%1.6f, lon=%1.6f or (%d, %d) - (%d, %d):", lat, lon, src_x, src_y, dest_x, dest_y);
        //console.log(stops);
    
        this.ProcessFlyToStops(stops, txt, 0, lat, lon);
    };


    FlyToExtent.prototype.ProcessFlyToStops = function(stops, txt, start_idx, lat, lon)
    {
        if (start_idx == stops.length)  // end of flight
        {
            setTimeout(function() // fix for weird fractional zoom level bug in Gmaps
            {
                map.panBy(1,1);
            }.bind(this), 100);
        
            setTimeout(function() 
            {
                if (txt != null && txt.length > 0)
                {
                    this.ShowLocationText(txt);
                }//if

                this.fxUpdateMapExtent();
                this._inFlight = false;
            }.bind(this), 500);

            return;
        }//if
    
        var stop = stops[start_idx];
    
        if (stop.z != null && stop.z >=0 && start_idx > 0 && stops[start_idx-1].x != null) // short delay at end of panning for animation lag
        {
            setTimeout(function() 
            {
                requestAnimationFrame(function() 
                {
                    this.mapref.setZoom(stop.z);
                    if (stop.x != null) this.mapref.panBy(stop.x, stop.y);
                    setTimeout(function() { this.ProcessFlyToStops(stops, txt, start_idx+1, lat, lon); }.bind(this), stop.t);
                }.bind(this));
            }.bind(this), 100);
        }//if
        else if (stop.z != null && stop.z >= 0)
        {
            requestAnimationFrame(function() 
            {
                this.mapref.setZoom(stop.z);
                if (stop.x != null) this.mapref.panBy(stop.x, stop.y); // shouldn't happen at the moment
                setTimeout(function() { this.ProcessFlyToStops(stops, txt, start_idx+1, lat, lon); }.bind(this), stop.t);
            }.bind(this));
        }//if
        else if (stop.z != null && stop.z == -1)
        {
            requestAnimationFrame(function() { this.mapref.panTo(new google.maps.LatLng(stop.y, stop.x)); this.ProcessFlyToStops(stops, txt, start_idx+1, lat, lon); }.bind(this));
        }//else if
        else
        {   
            requestAnimationFrame(function() { this.mapref.panBy(stop.x, stop.y); this.ProcessFlyToStops(stops, txt, start_idx+1, lat, lon); }.bind(this));
        }//else
    };
    
    
    
    var _GetExtentForLocId = function(locId)
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
    
        return p;
    };
    

    

    
    var _IsIntersectingExtents = function(ex0, ex1)
    {
        return !(ex0[2] < ex1[0] || ex0[0] > ex1[2] || ex0[3] < ex1[1] || ex0[1] > ex1[3]);
    };
    

    
    
    var _GetRegionForExtentAndClientView_EPSG4326 = function(x0, y0, x1, y1)
    {
        var vwh = _GetClientViewSize();
        return _GetRegionForExtentAndScreenSize_EPSG4326(x0, y0, x1, y1, vwh[0], vwh[1]);
    };

    var _GetCentroidForLatLonRegion = function(x0, y0, x1, y1)
    {
        var mxy0 = _LatLonToXYZ_EPSG3857(y1, x0, 21);
        var mxy1 = _LatLonToXYZ_EPSG3857(y0, x1, 21);
        var mx0 = mxy0[0];
        var my0 = mxy0[1];
        var mx1 = mxy1[0];
        var my1 = mxy1[1];
        var mcx = parseInt(mx0 + (mx1 - mx0) * 0.5);
        var mcy = parseInt(my0 + (my1 - my0) * 0.5);
        var ll = _XYZtoLatLon_EPSG3857(mcx, mcy, 21);
        return ll;
    };
    
    var _GetRegionForExtentAndScreenSize_EPSG4326 = function(x0, y0, x1, y1, vw, vh)
    {
        var ll  = _GetCentroidForLatLonRegion(x0, y0, x1, y1);
        var yx0 = new google.maps.LatLng(ll[0], ll[1]);
        var dz  = 3;
        
        vw *= 1.1; // add some overscan
        vh *= 1.1;

        for (var z = 20; z >= 0; z--)
        {
            var mxy0 = _LatLonToXYZ_EPSG3857(y1, x0, z);
            var mxy1 = _LatLonToXYZ_EPSG3857(y0, x1, z);

            if (Math.abs(mxy1[0] - mxy0[0]) < vw && Math.abs(mxy1[1] - mxy0[1]) < vh)
            {
                dz = z;
                break;
            }//if
        }//for
    
        return [yx0, dz];
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
    
    var _ClampLatToMercPlane = function(lat) { return lat > 85.05112878 ? 85.05112878 : lat < -85.05112878 ? -85.05112878 : lat; };
    
    var _LatLonToXYZ_EPSG3857 = function(lat, lon, z)
    {
        var x  = (lon + 180.0) * 0.002777778;
        var s  = Math.sin(lat * 0.0174532925199);
        var y  = 0.5 - Math.log((1.0 + s) / (1.0 - s)) * 0.0795774715459;
        var w  = 256 << z;
        var px = parseInt(x * w + 0.5);
        var py = parseInt(y * w + 0.5);
        return [px, py];
    };

    var _XYZtoLatLon_EPSG3857 = function(x, y, z)
    {
        var w = 256 << z;
        var r = 1.0  / w;
        x = x * r - 0.5;
        y = 0.5 - y * r;
        var lat = 90.0 - 360.0 * Math.atan(Math.exp(-y * 6.283185307179586476925286766559)) * 0.31830988618379067153776752674503;
        var lon = 360.0 * x;
        return [lat, lon];
    };
    

    
    return FlyToExtent;
})();











// ===============================================================================================
// ======================================== LOCATION TEXT ========================================
// ===============================================================================================

// LocationText: Displays a large, styled, centered text string to user briefly.
//               Instanced to determined whether its font dependency has been loaded or not yet.
//
// NOTE: Now uses CSS3 animations, the following must already be present before this is used:
// 
// <style type="text/css">
// /* Animation for location text pop-ups */
// 
// .dkstextfade {
//  -webkit-animation: dkstextani 2.5s linear 1;
//     -moz-animation: dkstextani 2.5s linear 1;
//      -ms-animation: dkstextani 2.5s linear 1;
//       -o-animation: dkstextani 2.5s linear 1;
//          animation: dkstextani 2.5s linear 1;
// }
// 
// @keyframes dkstextani {
//    0% { opacity:0; }
//   10% { opacity:1; }
//   90% { opacity:1; } 
//  100% { opacity:0; } }
// @-moz-keyframes dkstextani {
//    0% { opacity:0; }
//   10% { opacity:1; }
//   90% { opacity:1; } 
//  100% { opacity:0; } }
// @-webkit-keyframes "dkstextani" {
//    0% { opacity:0; }
//   10% { opacity:1; }
//   90% { opacity:1; } 
//  100% { opacity:0; } }
// @-ms-keyframes dkstextani {
//    0% { opacity:0; }
//   10% { opacity:1; }
//   90% { opacity:1; } 
//  100% { opacity:0; } }
// @-o-keyframes "dkstextani" {
//    0% { opacity:0; }
//   10% { opacity:1; }
//   90% { opacity:1; } 
//  100% { opacity:0; } }
// </style>
var LocationText = (function()
{
    function LocationText() 
    {
        this._did_init_font_crimson_text = false;
        this.InitFont_CrimsonText();
    }

    LocationText.prototype.InitFont_CrimsonText = function() // free Optimus Princeps clone
    {
        if (this._did_init_font_crimson_text) return;

        var el = document.createElement("link");
        var pre = window.location.href.substring(0,5) == "https" ? "https://" : "http://";
        el.href = pre + "fonts.googleapis.com/css?family=Crimson+Text";
        el.rel = "stylesheet";
        el.type = "text/css";
        var head = document.getElementsByTagName("head")[0];
        head.appendChild(el);

        this._did_init_font_crimson_text = true;
    }//InitFont_CrimsonText


    var _GetText_Container = function(w_px, h_px)
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
    };

    var _GetText_Text = function(txt, font_size, stroke_width, is_webkit)
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
    };

    var _GetText_Hr = function(w_px, h_px, t_px)
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
    };

    var _GetText_TextShadowLabel = function(txt, font_size, ox, oy, sx, sy, sr)
    {
        var e = _GetText_Text(txt, font_size, 0, false);
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
    };

    LocationText.prototype.ShowLocationText = function(txt)
    {
        if (!this._did_init_font_crimson_text) return;

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
        var el         = _GetText_Container(el_width, el_height);
        var el2        = _GetText_Text(txt, el2_fontsize, el2_str_w, is_webkit);
        var el3        = _GetText_Hr(el3_width, el3_height, el3_top);

        el.appendChild(el2);
        el.appendChild(el3);

        if (!is_webkit)
        {
            var el_t4 = _GetText_TextShadowLabel(txt, el2_fontsize,  0, -2,  1,  0, 0);
            var el_t5 = _GetText_TextShadowLabel(txt, el2_fontsize,  0,  2, -1,  0, 0);
            var el_t8 = _GetText_TextShadowLabel(txt, el2_fontsize,  2,  0,  0,  1, 0);
            var el_t9 = _GetText_TextShadowLabel(txt, el2_fontsize, -2,  0,  0, -1, 0);

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
    };




    
    return LocationText;
})();

































