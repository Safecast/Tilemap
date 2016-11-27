// ==============================================
// Safecast Real-Time Sensor Viewer
// ==============================================
// Nick Dolezal/Safecast, 2015
// This code is released into the public domain.
// ==============================================

// =================================
// Requirements (Files):
// =================================
// 1. rt_viewer_min.js             (this file)



// =================================
// Use
// =================================
//
// 1. Prerequisites
// -------------------------------
// var map = new google.maps.Map(document.getElementById("map_canvas"), myOptions);         // or whatever.
//
// 2. Instantiate
// -------------------------------
// var rtvm = new RTVM(map, null);
//
// Instantiate will auto-initialize and start polling.





// RT Viewer - Main
// Contains all useful instances of other objects and UI event handling.
// Messy and too broad but hey.

// NOTE: In most cases, null should be passed for "dataBinds".
//       Only override this if you want to set custom styles or image/worker filepaths.

var RTVM = (function()
{
    function RTVM(map, dataBinds)
    {
        this.mapRef    = map;
        this.isMobile  = _IsPlatformMobile();
        this.mks       = null; // marker manager
        this.failures  = 0;
        this.fail_max  = (86400 * 365) / 600;
        this.last_tx   = 0;
        this.enabled   = true;
        
        this.dataBinds = dataBinds;
        
        this.zoom_to_data_extent     = false;   // whether or not to zoom to the extent of the sensor(s) after processing.
        
        if (this.dataBinds == null)
        {
            this.Init_DataBindDefaults();
        }//if
        
        this.Init();
    }
    
    
    
    // =======================================================================================================
    //                                      Mandatory Initialization
    // =======================================================================================================

    RTVM.prototype.Init = function()
    {
        this.Init_MKS();
        this.InitMarkersAsync();
        this.InitConnectionWatchdog();
    };
    
    RTVM.prototype.Init_DataBindDefaults = function()
    {
        var binds =
        {
            cssClasses:
            {
                FuturaFont:"FuturaFont"
            }
        };
        
        this.dataBinds = binds;
    };

    RTVM.prototype.Init_MKS = function()
    {
        this.mks = new RTMKS(this.mapRef, RTICO.IconStyleLg, window.devicePixelRatio, this.isMobile, this.dataBinds.cssClasses.FuturaFont);
    };
    
    RTVM.prototype.InitMarkersAsync = function()
    {
        this.GetJSONAsync("http://realtime.safecast.org/wp-content/uploads/devices.json");
    };
    
    RTVM.prototype.InitConnectionWatchdog = function()
    {
        setTimeout(function() {
            this.ConnectionWatchdog();
        }.bind(this), 10 * 60 * 1000);
    };



    // =======================================================================================================
    //                            Event handlers - abstracted download methods
    // =======================================================================================================

    // Some network failures that break the auto-refresh do not appear to raise an event,
    // so this serves as a failsafe for those cases.
    //
    RTVM.prototype.ConnectionWatchdog = function()
    {
        if ((new Date()).getTime() - this.last_tx > 20 * 60 * 1000)
        {
            console.log("RTVM.prototype.ConnectionWatchdog: >20 mins since last connection attempt, restarting connection...");
            this.InitMarkersAsync();
        }//if
        
        setTimeout(function() {
            this.ConnectionWatchdog();
        }.bind(this), 10 * 60 * 1000);
    };

    RTVM.prototype.GetJSONAsync = function(url)
    {
        // 2016-08-14 ND: Fix for not being able to disable via UI due to timer polling.
        //                This keeps timers running, but simply does a no-op.
        if (!this.enabled)
        {
            setTimeout(function() {
                this.last_tx = (new Date()).getTime();
                this.GetJSONAsync(url);
            }.bind(this), 60 * 1000);
                
            return;
        }//if
    
        var d           = new Date();
        var ss_now      = "" + (parseInt(d.getTime() * 0.001));
        var url_nocache = url + "?t=" + ss_now;
        
        var cb = function(response, userData)
        {
            var success = response != null && response.length > 0;
        
            if (success)
            {
                var obj = null;
                
                try
                {
                    obj = JSON.parse(response);
                }
                catch (err)
                {
                    console.log("RTVM: JSON parsing exception.");
                }
                
                if (obj != null)
                {
                    // 2016-08-14 ND: Recheck enabled status due to HTTP GET latency, to make sure
                    //                markers are not being added against user's preference.
                    if (this.enabled)
                    {
                        this.mks.AddSensorDataFromJson(obj);
                        this.mks.AddMarkersToMap();
                    }//if
                }//if
                else
                {
                    success = false;
                    this.failures = this.failures + 1;
                }//else
            }//if
            else
            {
                this.failures = this.failures + 1;
            }//else
        
            if (!success)
            {
                console.log("RTVM: Error getting sensors from URL: %s", url);
            }//if

            var after_ms = (success ? 60 : 600) * 1000; // 1 min normally, 10 mins on failure

            if (this.failures < this.fail_max)
            {
                setTimeout(function() {
                    this.last_tx = (new Date()).getTime();
                    this.GetJSONAsync(url);
                }.bind(this), after_ms);
            }//if
        }.bind(this);

        _GetAsync_HTTP(url_nocache, null, null, cb, null);
    };
    
    // =======================================================================================================
    //                                      Event handlers - UI
    // =======================================================================================================
    
    RTVM.prototype.ClearGmapsListeners = function()
    {
        this.mks.ClearGmapsListeners();
    };
    
    RTVM.prototype.AddGmapsListeners = function()
    {
        this.mks.AddGmapsListener_ZoomChanged(); // only needed if they are manually removed.
    };
    
    RTVM.prototype.RemoveAllMarkersFromMapAndPurgeData = function()
    {
        this.mks.RemoveAllMarkersFromMapAndPurgeData();
    };

    RTVM.prototype.SetZoomToDataExtent = function(shouldZoom)
    {
        this.zoom_to_data_extent = shouldZoom;
    };
    
    RTVM.prototype.SetNewCustomMarkerOptions = function(width, height, alpha_fill, alpha_stroke, shadow_radius, hasBearingTick)
    {
        this.mks.SetNewCustomMarkerOptions(width, height, alpha_fill, alpha_stroke, shadow_radius, hasBearingTick);
    };
    
    RTVM.prototype.SetNewMarkerType = function(iconTypeId)
    {
        this.mks.SetNewMarkerType(iconTypeId);
    };
    
    RTVM.prototype.GetMarkerCount = function()
    {
        return this.mks == null || this.mks.cpms == null ? 0 : this.mks.cpms.length;
    };

    RTVM.prototype.GetEnabled = function()
    {
        return this.enabled;
    };

    RTVM.prototype.SetEnabled = function(v)
    {
        this.enabled = v;
    };


    // =======================================================================================================
    //                                      Static/Class Methods
    // =======================================================================================================
    
    var _GetAsync_HTTP = function(url, responseType, responseHeader, fxCallback, userData)
    {
        var req = new XMLHttpRequest();
        req.open("GET", url, true);
    
        if (responseType != null)
        {
            if (responseType == "text\/plain; charset=x-user-defined")
            {
                req.overrideMimeType(responseType);
            }//if
            else
            {
                req.responseType = responseType;    //"arraybuffer", "blob", "document", "json", and "text"        
            }//else
        }//if
        
        req.onreadystatechange = function () // why was this ==== ?
        {
            if (req.readyState === 4 && req.status == 200 && req.response != null)
            {
                if (responseHeader != null)
                {
                    fxCallback(req.getResponseHeader(responseHeader), userData);
                }//if
                else
                {
                    fxCallback(req.response, userData);
                }//else
            }//if
            else if (req.readyState === 4)
            {
                // This attemps to trap Chrome's ERR_NETWORK_CHANGED
                // and other network failures which cause the updates to stop.
                console.log("RTVM _GetAsync_HTTP: req.readyState == 4, req.status == %d.  Retrying.", req.status);
                fxCallback(null, userData);
            }//else if
        };
        
        req.send(null);
    };
    
    // returns value of querystring parameter "name"
    var _GetParam = function(name) 
    {
        name        = name.replace(/[\[]/, "\\\[").replace(/[\]]/, "\\\]");
        var regexS  = "[\\?&]" + name + "=([^&#]*)";
        var regex   = new RegExp(regexS);
        var results = regex.exec(window.location.href);
    
        return results == null ? "" : results[1];
    };


    // http://stackoverflow.com/questions/11381673/detecting-a-mobile-browser
    // returns true if useragent is detected as being a mobile platform, or "mobile=1" is set in querystring.
    var _IsPlatformMobile = function()
    {
        var check   = false;
        var ovr_str = _GetParam("mobile");
    
        if (ovr_str != null && ovr_str.length > 0)
        {
            check = parseInt(ovr_str) == 1;
        }//if
        else
        {
            (function(a,b){if(/(android|bb\d+|meego).+mobile|avantgo|bada\/|blackberry|blazer|compal|elaine|fennec|hiptop|iemobile|ip(hone|od)|iris|kindle|lge |maemo|midp|mmp|mobile.+firefox|netfront|opera m(ob|in)i|palm( os)?|phone|p(ixi|re)\/|plucker|pocket|psp|series(4|6)0|symbian|treo|up\.(browser|link)|vodafone|wap|windows ce|xda|xiino/i.test(a)||/1207|6310|6590|3gso|4thp|50[1-6]i|770s|802s|a wa|abac|ac(er|oo|s\-)|ai(ko|rn)|al(av|ca|co)|amoi|an(ex|ny|yw)|aptu|ar(ch|go)|as(te|us)|attw|au(di|\-m|r |s )|avan|be(ck|ll|nq)|bi(lb|rd)|bl(ac|az)|br(e|v)w|bumb|bw\-(n|u)|c55\/|capi|ccwa|cdm\-|cell|chtm|cldc|cmd\-|co(mp|nd)|craw|da(it|ll|ng)|dbte|dc\-s|devi|dica|dmob|do(c|p)o|ds(12|\-d)|el(49|ai)|em(l2|ul)|er(ic|k0)|esl8|ez([4-7]0|os|wa|ze)|fetc|fly(\-|_)|g1 u|g560|gene|gf\-5|g\-mo|go(\.w|od)|gr(ad|un)|haie|hcit|hd\-(m|p|t)|hei\-|hi(pt|ta)|hp( i|ip)|hs\-c|ht(c(\-| |_|a|g|p|s|t)|tp)|hu(aw|tc)|i\-(20|go|ma)|i230|iac( |\-|\/)|ibro|idea|ig01|ikom|im1k|inno|ipaq|iris|ja(t|v)a|jbro|jemu|jigs|kddi|keji|kgt( |\/)|klon|kpt |kwc\-|kyo(c|k)|le(no|xi)|lg( g|\/(k|l|u)|50|54|\-[a-w])|libw|lynx|m1\-w|m3ga|m50\/|ma(te|ui|xo)|mc(01|21|ca)|m\-cr|me(rc|ri)|mi(o8|oa|ts)|mmef|mo(01|02|bi|de|do|t(\-| |o|v)|zz)|mt(50|p1|v )|mwbp|mywa|n10[0-2]|n20[2-3]|n30(0|2)|n50(0|2|5)|n7(0(0|1)|10)|ne((c|m)\-|on|tf|wf|wg|wt)|nok(6|i)|nzph|o2im|op(ti|wv)|oran|owg1|p800|pan(a|d|t)|pdxg|pg(13|\-([1-8]|c))|phil|pire|pl(ay|uc)|pn\-2|po(ck|rt|se)|prox|psio|pt\-g|qa\-a|qc(07|12|21|32|60|\-[2-7]|i\-)|qtek|r380|r600|raks|rim9|ro(ve|zo)|s55\/|sa(ge|ma|mm|ms|ny|va)|sc(01|h\-|oo|p\-)|sdk\/|se(c(\-|0|1)|47|mc|nd|ri)|sgh\-|shar|sie(\-|m)|sk\-0|sl(45|id)|sm(al|ar|b3|it|t5)|so(ft|ny)|sp(01|h\-|v\-|v )|sy(01|mb)|t2(18|50)|t6(00|10|18)|ta(gt|lk)|tcl\-|tdg\-|tel(i|m)|tim\-|t\-mo|to(pl|sh)|ts(70|m\-|m3|m5)|tx\-9|up(\.b|g1|si)|utst|v400|v750|veri|vi(rg|te)|vk(40|5[0-3]|\-v)|vm40|voda|vulc|vx(52|53|60|61|70|80|81|83|85|98)|w3c(\-| )|webc|whit|wi(g |nc|nw)|wmlb|wonu|x700|yas\-|your|zeto|zte|android|ipad|playbook|silk\-/i.test(a.substr(0,4)))check = true})(navigator.userAgent||navigator.vendor||window.opera);
    
            if (!check) check = navigator.userAgent.match(/iPad/i);
            if (!check) check = navigator.userAgent.match(/Android/i);
            if (!check) check = window.navigator.userAgent.indexOf("iPad") > 0;
            if (!check) check = window.navigator.userAgent.indexOf("Android") > 0;
        }//else
    
        return check;
    };

    return RTVM;
})();














// RTLUT: contains color lookup table and returns RGB colors for a numeric value.
var RTLUT = (function()
{
    function RTLUT(min, max)
    {
        this.min = min;
        this.max = max;
        this.r = new Uint8Array([1,8,9,10,12,14,16,16,18,18,19,20,21,22,22,24,24,25,25,25,26,26,26,26,25,26,27,26,25,26,26,24,24,25,24,21,21,21,17,16,9,7,0,7,15,23,28,32,34,38,40,43,45,
                                 46,50,51,54,55,56,56,56,58,59,59,59,59,59,59,59,59,57,56,56,56,54,51,48,45,43,39,37,33,29,23,10,0,29,39,60,67,84,90,97,105,110,120,124,133,137,143,148,
                                 153,161,163,171,173,178,181,185,191,194,200,202,208,210,214,217,220,225,226,233,235,240,242,245,249,251,254,255,255,255,255,255,255,255,255,255,255,255,
                                 255,255,255,255,255,255,255,255,255,255,255,255,255,255,255,255,255,255,255,255,255,255,255,255,255,255,255,255,255,255,255,255,255,255,255,255,255,255,
                                 255,255,255,255,255,255,255,255,255,255,255,255,255,255,255,255,255,255,255,255,255,255,255,255,255,255,255,255,255,255,255,255,255,255,255,255,255,255,
                                 255,255,255,255,255,255,255,255,255,255,255,255,255,255,255,255,255,255,255,255,255,255,255,255,255,255,255,255,255,255,255,255,255,255,255,255,255,255,
                                 255,255,255]);
        this.g = new Uint8Array([1,7,7,8,10,11,12,12,13,13,13,13,14,14,14,15,15,15,15,15,15,15,15,15,15,15,15,15,15,14,14,14,14,13,13,12,11,11,10,9,5,4,0,9,19,30,36,43,46,56,59,65,70,74,
                                 82,85,94,96,103,107,112,118,121,130,132,140,144,150,156,160,167,170,181,184,191,195,200,208,213,221,224,233,237,243,250,255,252,251,242,240,235,231,226,
                                 221,219,212,210,204,202,197,192,187,182,180,172,170,163,160,156,151,148,137,134,128,124,117,112,107,100,97,87,83,71,64,56,44,38,5,0,0,0,0,0,0,0,0,0,0,0,
                                 0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,11,25,36,42,53,57,68,73,81,85,89,96,98,106,109,119,123,128,133,136,144,146,153,156,162,
                                 166,170,180,183,191,193,200,204,208,214,217,224,226,234,239,247,251,255,255,255,255,255,255,255,255,255,255,255,255,255,255,255,255,255,255,255,255,255,
                                 255,255,255,255,255,255,255,255,255,255,255,255,255,255,255,255,255,255,255,255,255,255]);
        this.b = new Uint8Array([1,10,12,15,19,23,29,31,38,39,43,48,54,59,61,70,72,79,83,89,94,99,109,112,122,125,135,140,145,153,158,169,173,186,191,199,206,212,223,228,239,244,255,255,
                                 255,255,255,255,255,255,255,255,255,255,255,255,255,255,255,255,255,255,255,255,255,255,255,255,255,255,255,255,255,255,255,255,255,255,255,255,255,255,
                                 255,255,255,255,255,255,255,255,255,255,255,255,255,255,255,255,255,255,255,255,255,255,255,255,255,255,255,255,255,255,255,255,255,255,255,255,255,255,
                                 255,255,255,255,255,255,255,255,254,247,242,234,227,221,211,207,196,192,183,179,174,166,161,154,151,140,136,128,123,119,113,111,102,100,94,88,81,75,72,65,
                                 63,55,52,47,42,38,32,29,18,13,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,8,10,20,23,31,36,41,47,51,62,65,74,
                                 78,84,90,94,102,105,115,118,128,133,138,145,148,157,159,168,172,179,186,191,198,202,211,215,222,226,232,238,242,253]);
        this.n = this.r.length;
        this.rdiff = 1.0 / (this.max - this.min);
        this.nsb1  = parseFloat(this.n - 1.0);
    }//LUT
    
    RTLUT.prototype.GetRgbForIdx = function(i)
    {
        return [this.r[i], this.g[i], this.b[i]];
    };
    
    RTLUT.prototype.GetIdxForValue = function(x, rsn)
    {
        x = (x - this.min) * this.rdiff;
        if (x > 1.0) x = 1.0; else if (x < 0.0) x = 0.0;
        x = Math.log(x * 9.0 + 1.0) * 0.43429448190325176;
        x = Math.log(x * 9.0 + 1.0) * 0.43429448190325176;
        x = Math.log(x * 9.0 + 1.0) * 0.43429448190325176;
        x = Math.log(x * 9.0 + 1.0) * 0.43429448190325176;
        
        var i = parseInt(x * this.nsb1);
        return rsn > 0 ? (i >> rsn) << rsn : i;
    };
    
    RTLUT.prototype.GetRgbForValue = function(x, rsn)
    {
        var i = this.GetIdxForValue(x, rsn);
        return [this.r[i], this.g[i], this.b[i]];
    };
    
    return RTLUT;
})();






// ICO: Renders marker icon to ivar "this.url" as base64 png.
//      Can be retained in cache as rendering pngs is slow.
//      This is completely ignorant of retina displays.
var RTICO = (function()
{
    function RTICO(width, height, deg, showBearingTick, lutidx, red0, green0, blue0, red1, green1, blue1, alpha_fill, alpha_stroke, shadow_radius)
    {
        this.width  = width;
        this.height = height;
        this.deg    = deg;
        this.btick  = showBearingTick;
        this.lutidx = lutidx;
        this.red0   = red0;
        this.green0 = green0;
        this.blue0  = blue0;
        this.alpha0 = alpha_fill;
        this.alpha1 = alpha_stroke;
        this.shd_r  = shadow_radius;
        this.red1   = red1;
        this.green1 = green1;
        this.blue1  = blue1;
        
        this.url    = null;
        
        this.Render();
    }//RTICO
    
    RTICO.prototype.Render = function()
    {
        var c     = document.createElement("canvas");
        var w_add = (this.shd_r - (this.width  >> 1)) * 2;
        var h_add = (this.shd_r - (this.height >> 1)) * 2;
        var w_px  = this.width  + Math.max(0, w_add);
        var h_px  = this.height + Math.max(0, h_add); // ignore, shd_r is always 0 here.
        c.width  = w_px;
        c.height = h_px;
        var ctx  = c.getContext("2d");
        var r    = ((this.width < this.height ? this.width : this.height) >> 1) - 1; // radius
        var ox   = w_px >> 1; // offset to center
        var oy   = h_px >> 1;
        
        if (r <= 0) r = 1;

        var scale   = w_px / 20.0;

        var outer_r = r - 1.0 * scale;        // buffer for antialiasing
        if (scale > 1.0) outer_r -= scale; // wtf
        
        var inner_r = outer_r - 4.0 * scale;  // 4px diff is ultimately about 1 visual pixel spacing
        
        if (w_px <= 12) inner_r = outer_r - 3.0 * scale;
        
        var c_fill  = "rgba(" + this.red0 + ", " + this.green0 + ", " + this.blue0 + ", " + this.alpha0 + ")";
        var c_green = "rgba(" + this.red1 + ", " + this.green1 + ", " + this.blue1 + ", " + this.alpha1 + ")";
        
        var a1 = this.alpha1;
        
        // ------------------------ inner dot -------------------------------
        
        //if (w_px > 12)
        //{
        ctx.beginPath(); // fill with variable color
            ctx.arc(ox, oy, inner_r, 0, 2 * Math.PI);
            ctx.fillStyle = c_fill;
        ctx.fill();

        ctx.beginPath(); // stroke black outline
            ctx.arc(ox, oy, inner_r, 0, 2 * Math.PI);
            ctx.strokeStyle = "rgba(0,0,0," + this.alpha0 + ")";
            ctx.lineWidth   = w_px > 12 ? 1.5 * scale : 0.75 * scale;
        ctx.stroke();

        if (this.red1 > 0)
        {
            var min_angle = 0.0;
            var max_angle = 2.0 * Math.PI;
            var steps     = 6.0;
            var step_size = (max_angle - min_angle) / steps;
            
            for (var i=0; i<steps; i++)
            {
                var start_angle = parseFloat(i) * step_size;
                var end_angle   = start_angle + step_size * 0.75;
                
                ctx.beginPath(); // stroke thick black outline
                    ctx.arc(ox, oy, outer_r, start_angle, end_angle);
                    ctx.strokeStyle = "rgba(0,0,0," + a1 + ")";
                    ctx.lineWidth   = Math.max(3.5 * scale, 3.5);
                ctx.stroke();
        
                ctx.beginPath(); // stroke thinner green inner arc
                    ctx.arc(ox, oy, outer_r, start_angle, end_angle);
                    ctx.strokeStyle = c_green;
                    ctx.lineWidth   = Math.max(1.5 * scale, 1.5);
                ctx.stroke();
        
                // By default, looks a bit dark due to antialiasing with black,
                // so stroke green 2x more at decreasing widths.
        
                ctx.beginPath(); // repeat green stroke
                    ctx.arc(ox, oy, outer_r, start_angle, end_angle);
                    ctx.strokeStyle = c_green;
                    ctx.lineWidth   = Math.max(1.0 * scale, 1.0);
                ctx.stroke();
        
                
                ctx.beginPath(); // repeat green stroke
                    ctx.arc(ox, oy, outer_r, start_angle, end_angle);
                    ctx.strokeStyle = c_green;
                    ctx.lineWidth   = Math.max(0.5 * scale, 0.5);
                ctx.stroke();
            }//for
        }//if
        else
        {
            // ------------------------ outer ring -------------------------------
            ctx.beginPath(); // stroke thick black outline
                ctx.arc(ox, oy, outer_r, 0, 2 * Math.PI);
                ctx.strokeStyle = "rgba(0,0,0," + a1 + ")";
                ctx.lineWidth   = Math.max(3.5 * scale, 3.5);
            ctx.stroke();
        
            ctx.beginPath(); // stroke thinner green inner arc
                ctx.arc(ox, oy, outer_r, 0, 2 * Math.PI);
                ctx.strokeStyle = c_green;
                ctx.lineWidth   = Math.max(1.5 * scale, 1.5);
            ctx.stroke();
        
            // By default, looks a bit dark due to antialiasing with black,
            // so stroke green 2x more at decreasing widths.
        
            ctx.beginPath(); // repeat green stroke
                ctx.arc(ox, oy, outer_r, 0, 2 * Math.PI);
                ctx.strokeStyle = c_green;
                ctx.lineWidth   = Math.max(1.0 * scale, 1.0);
            ctx.stroke();
        

            ctx.beginPath(); // repeat green stroke
                ctx.arc(ox, oy, outer_r, 0, 2 * Math.PI);
                ctx.strokeStyle = c_green;
                ctx.lineWidth   = Math.max(0.5 * scale, 0.5);
            ctx.stroke();
        }//else
        
        this.url = c.toDataURL("image/png");
    };
    
    RTICO.GetIconOptionsForIconStyle = function(iconStyle)
    {
        var p;
        
        switch (iconStyle)
        {
            case RTICO.IconStyleSm:
                p = [ 7, 7, 0.75, 0.75, 0.0, false];
                break;
            case RTICO.IconStyleMdB:
                p = [ 10, 10, 0.75, 0.75, 0.0, true];
                break;
            case RTICO.IconStyleLgB:
                p = [ 16, 16, 0.75, 0.75, 0.0, true];
                break;
            case RTICO.IconStyleLg:
                p = [ 16, 16, 0.75, 0.75, 0.0, false];
                break;
            case RTICO.IconStyleMd:
                p = [ 10, 10, 0.75, 0.75, 0.0, false];
                break;
            default:
                p = [ 10, 10, 0.75, 0.75, 0.0, true];
                break;
        }//switch
        
        return { width:p[0], height:p[1], fill_alpha:p[2], stroke_alpha:p[3], shadow_radius:p[4], show_bearing_tick:p[5] };
    };
    
    RTICO.IconStyleSm     = 0;
    RTICO.IconStyleMdB    = 1;
    RTICO.IconStyleMd     = 2;
    RTICO.IconStyleLgB    = 3;
    RTICO.IconStyleLg     = 4;
    RTICO.IconStyleCustom = 5;
    
    return RTICO;
})();




// MKS: Marker manager
var RTMKS = (function()
{
    function RTMKS(mapRef, iconType, pxScale, isMobile, fontCssClass)
    {
        // Typed arrays, these hold the parsed log data.
        this.cpms    = null;    // CPM value of point
        this.dres    = null;
        this.ids     = null;    // Original LogIDs of points.
        this.times   = null;    // Datetime of marker, seconds since 1970-01-01.
        this.onmaps  = null;    // 1=is a marker currently on map.  0=not on map.
        this.lons    = null;    // X coordinate.  EPSG:3857 pixel X/Y @ zoom level 21.
        this.lats    = null;    // Y coordinate.  EPSG:3857 pixel X/Y @ zoom level 21.
        this.locstxt = null;
        this.imgtxt  = null;
        this.linktxt = null;
        
        this.isMobile = isMobile; // Disables some caching and renders less markers per pass.
        
        this.fontCssClass = fontCssClass;
        
        this.mkType   = iconType;       // Predefined marker templates.
        this.pxScale  = pxScale == null || pxScale < 1.0 ? 1.0 : pxScale;
        this.width    = 20;             // Marker icon width, in non-retina pixels
        this.height   = 20;             // Marker icon height, in non-retina pixels
        this.alpha0   = 1.0;           // Marker icon fill alpha, [0.0 - 1.0]
        this.alpha1   = 1.0;           // Maker icon stroke alpha, [0.0 - 1.0]
        this.shd_r    = 0.0;            // Marker icon shadow radius, pixels.
        this.icons    = new Array();
        
        this.lut_rsn  = 2;                       // 256 >> 128 >> 64 colors
        this.lut      = new RTLUT(0.03, 65.535); // The LUT gets the RGB values for a value.

        this.mapref  = mapRef;
        this.inforef = null;
        
        this.zoomlistener = null;
        
        var d = new Date();
        
        this.create_ss = (d.getTime() * 0.001)>>>0;
        
        // Note: Extent vec values are: x0, y0, x1, y1, ex0, ex1, z
        // 
        // For lat/lon (EPSG:4326) these are aka:
        //  x0: min_lon
        //  y0: min_lat
        //  x1: max_lon
        //  y1: max_lat
        // ex0: *if* the extent spans the 180th meridian, this contains the second extent's min_lon
        // ex1: *if* the extent spans the 180th meridian, this contains the second extent's max_lon
        //   z: zoom level
        //
        // (For EPSG:3857, these are later translated to pixel x/y coordinates at zoom level 21.)
        //
        // If no 180th meridian span is present, this is indicated with:
        //      EPSG:4326: -9000.0
        //      EPSG:3857:  0xFFFFFFFF (aka UINT32_MAX in C)
        
        this.markers = new Array(); // Markers currently on map.
        this.mk_ex   = new Float64Array([9000.0, 9000.0, -9000.0, -9000.0]); // x0, y0, x1, y1 - EPSG:4326 only.
        this.last_z  = 0;
        
        this.AddGmapsListener_ZoomChanged();
    }//RTMKS
    
    RTMKS.prototype.SetNewCustomMarkerOptions = function(width, height, alpha_fill, alpha_stroke, shadow_radius, hasBearingTick)
    {
        if (this.icons.length > 0) this.icons = new Array();
        
        this.RemoveAllMarkersFromMap();
        
        this.mkType = RTICO.IconStyleCustom;
        this.width  = width;
        this.height = height;
        this.alpha0 = alpha_fill;
        this.alpha1 = alpha_stroke;
        this.shd_r  = shadow_radius;
        
        this.AddMarkersToMap();
    };
    
    RTMKS.prototype.SetNewMarkerType = function(markerType)
    {
        if (markerType != this.mkType)
        {
            if (this.icons.length > 0) this.icons = new Array();
            this.mkType = markerType;
            this.RemoveAllMarkersFromMap();
            this.ApplyMarkerType();
            this.AddMarkersToMap();
        }//if
    };
    
    RTMKS.prototype.ApplyMarkerType = function()
    {
        var p = RTICO.GetIconOptionsForIconStyle(this.mkType);
        
        this.width  = p.width;
        this.height = p.height;
        this.alpha0 = p.fill_alpha;
        this.alpha1 = p.stroke_alpha;
        this.shd_r  = p.shadow_radius;
    };
    
    RTMKS.prototype.UpdateMarkerExtent = function(x0, y0, x1, y1)
    {
        this.mk_ex[0] = Math.min(this.mk_ex[0], x0);
        this.mk_ex[1] = Math.min(this.mk_ex[1], y0);
        this.mk_ex[2] = Math.max(this.mk_ex[2], x1);
        this.mk_ex[3] = Math.max(this.mk_ex[3], y1);
    };
    
    RTMKS.prototype.IsMarkerExtentValid = function()
    {
        return this.mk_ex[0] >= -180.0 && this.mk_ex[0] <= 180.0 && this.mk_ex[1] >= -90.0 && this.mk_ex[1] <= 90.0
            && this.mk_ex[2] >= -180.0 && this.mk_ex[2] <= 180.0 && this.mk_ex[3] >= -90.0 && this.mk_ex[3] <= 90.0;
    };
    
    /*
    RTMKS.prototype.ApplyMapVisibleExtentForMarkers = function()    
    {
        if (!this.IsMarkerExtentValid())
        {
            return;
        }//if
        
        var r = _GetRegionForExtentAndClientView_EPSG4326(this.mk_ex[0], this.mk_ex[1], this.mk_ex[2], this.mk_ex[3]);
        this.mapref.panTo(r[0]);
        this.mapref.setZoom(r[1]);
    };
    */

    RTMKS.prototype.PurgeData = function()
    {
        this.dres    = null;
        this.cpms    = null;
        this.ids     = null;
        this.times   = null;
        this.locstxt = null;
        this.onmaps  = null;
        this.lons    = null;
        this.lats    = null;
        this.imgtxt  = null;
        this.linktxt = null;
        this.mk_ex   = new Float64Array([9000.0, 9000.0, -9000.0, -9000.0]);
    };

    RTMKS.prototype.RemoveAllMarkersFromMapAndPurgeData = function()
    {
        this.RemoveAllMarkersFromMap();
        this.PurgeData();
    };

    RTMKS.prototype.RemoveAllMarkersFromMap = function()
    {
        for (var i=0; i<this.markers.length; i++)
        {
            google.maps.event.clearInstanceListeners(this.markers[i]);
            this.markers[i].setMap(null);
        }//for
        
        if (this.onmaps != null)
        {
            _vfill(0, this.onmaps, 0, this.onmaps.length);
        }//if
        
        this.markers = new Array();
    };

    RTMKS.prototype.RecycleMarker = function(marker)
    {
        google.maps.event.clearInstanceListeners(marker);
        marker.setMap(null);
        marker.setIcon(null);
    };
    
    RTMKS.prototype.ClearGmapsListeners = function()
    {
        if (this.zoomlistener == null) return;
        
        google.maps.event.removeListener(this.zoomlistener);
        this.zoomlistener = null;
    };
    
    RTMKS.prototype.AddGmapsListener_ZoomChanged = function()
    {
        if (this.mapref == null || this.zoomlistener != null) return;
        
        var fxRefresh = function(e) { this.RescaleIcons(); }.bind(this);
        
        this.zoomlistener = google.maps.event.addListener(this.mapref, "zoom_changed", fxRefresh);
    };
    
    // Synchronizes marker icons with marker data.  This assumes that 
    // indices are consistent between passes.
    // 
    // Note this only handles:
    // 1. Scaling icons for current zoom level
    // 2. Data change: DRE
    // 3. Data change: Offline status
    // 4. Position change: lat/lon
    //
    RTMKS.prototype.UpdateIconsForMarkers = function()
    {
        var z     = this.mapref.getZoom();
        var scale = _GetIconScaleFactorForZ(z);

        for (var i=0; i<this.markers.length; i++)
        {
            var ico     = this.markers[i].getIcon();
            var dre     = this.dres[this.markers[i].ext_id];
            var offline = this.IsSensorOffline(this.markers[i].ext_id);
            var lutidx  = this.lut.GetIdxForValue(dre, this.lut_rsn);
            var zindex  = _GetMarkerZIndexForAttributes(lutidx, offline);
            var lat     = this.lats[this.markers[i].ext_id];
            var lon     = this.lons[this.markers[i].ext_id];
            
            if (   lat != this.markers[i].getPosition().lat()
                || lon != this.markers[i].getPosition().lng())
            {
                this.markers[i].setPosition(new google.maps.LatLng(lat, lon));
            }//if

            if (ico.scaledSize.width != this.width * scale
                || offline != this.markers[i].ext_offline
                ||  lutidx != this.markers[i].ext_lut_idx)
            {
                ico.size       = new google.maps.Size(this.width * scale, this.height * scale);
                ico.scaledSize = new google.maps.Size(this.width * scale, this.height * scale);
                ico.anchor     = new google.maps.Point(this.width * scale * 0.5, this.height * scale * 0.5);
                ico.url        = this.GetIconCached(lutidx, offline, this.width, this.height, this.pxScale * scale);
                
                this.markers[i].setIcon(ico);
                this.markers[i].setZIndex(zindex);
                this.markers[i].ext_offline = offline;
                this.markers[i].ext_lut_idx = lutidx;
            }//if
        }//for
    };


    RTMKS.prototype.RescaleIcons = function()
    {
        if (this.mapref == null || this.markers.length == 0) return;
        
        var z = this.mapref.getZoom();
        
        if (z > 7 && this.last_z > 7)
        {
            this.last_z = z;
            return;
        }//if
        
        this.UpdateIconsForMarkers();
        this.last_z = z;
    };


    RTMKS.prototype.UpdateIconsForData = function()
    {
        if (this.mapref == null || this.markers.length == 0) return;
        
        this.UpdateIconsForMarkers();
    };


    RTMKS.prototype.IsSensorOffline = function(idx)
    {
        return this.create_ss - this.times[idx] > 3600;
    };
    
    RTMKS.prototype.AddMarkersToMap = function()
    {
        if (this.lats == null) return;
        
        for (var i=0; i<this.lats.length; i++)
        {
            if (this.onmaps[i] == 0)
            {
                this.onmaps[i] = 1;
                
                var lat = this.lats[i];
                var lon = this.lons[i];
                var dre = this.dres[i];
                var idx = this.lut.GetIdxForValue(dre, this.lut_rsn);
                
                this.AddMarker(i, lat, lon, idx, this.IsSensorOffline(i));
            }//if
        }//for
        
        this.RescaleIcons(); // todo: integrate with addmarker
    };
    
    RTMKS.prototype.AddMarker = function(marker_id, lat, lon, lutidx, offline)
    {    
        var icon_url = this.GetIconCached(lutidx, offline, this.width, this.height, this.pxScale);
        var w_add    = (this.shd_r - (this.width  >> 1)) * 2;
        var h_add    = (this.shd_r - (this.height >> 1)) * 2;
        var w_pt     = this.width  + Math.max(0, w_add);
        var h_pt     = this.height + Math.max(0, h_add);

        var size = new google.maps.Size(w_pt, h_pt);
        var anch = new google.maps.Point(w_pt >> 1, h_pt >> 1);
        var icon = { url:icon_url, size:size, anchor:anch };
                   
        icon.scaledSize = new google.maps.Size(w_pt, h_pt);
        
        var yx     = new google.maps.LatLng(lat, lon);
        var marker = new google.maps.Marker();
        var zindex = _GetMarkerZIndexForAttributes(lutidx, offline);
        
        marker.setPosition(yx);
        marker.setIcon(icon);
        marker.setZIndex(zindex);
        marker.ext_id = marker_id;
        marker.ext_lut_idx = lutidx;
        marker.ext_offline = offline;
        marker.setMap(this.mapref);
        
        this.AttachInfoWindow(marker);
        this.markers.push(marker);
    };

    RTMKS.prototype.GetIconCached = function(lutidx, offline, width, height, pxScale)
    {
        var url  = null;       
        var w_px = width  * pxScale;
        var h_px = height * pxScale;
        
        var r1 = offline ? 220 :   0;
        var g1 = offline ? 220 : 255;
        var b1 = offline ? 220 :   0;
        var a0 = offline ? 0.7 : 1.0;
        var a1 = offline ? 0.7 : 1.0;
        
        for (var i=0; i<this.icons.length; i++)
        {
            if (    this.icons[i].lutidx == lutidx 
                &&  this.icons[i].red1   == r1
                &&  this.icons[i].green1 == g1
                &&  this.icons[i].blue1  == b1
                &&  this.icons[i].width  == w_px
                &&  this.icons[i].height == h_px
                &&  this.icons[i].alpha0 == a0
                &&  this.icons[i].alpha1 == a1
                &&  this.icons[i].shd_r  == this.shd_r)
            {
                url = this.icons[i].url;
                break;
            }//if
        }//for
        
        if (url == null)
        {
            var r0 = this.lut.r[lutidx];
            var g0 = this.lut.g[lutidx];
            var b0 = this.lut.b[lutidx];
            
            var ico = new RTICO(w_px, h_px, -1, false, lutidx, r0, g0, b0, r1, g1, b1, a0, a1, this.shd_r);
            this.icons.push(ico);
            url = ico.url;
        }//if
        
        return url;
    };
    
    // This is the primary function that should be called from any data fetch.
    //
    RTMKS.prototype.RefreshSensorDataFromJson = function(obj)
    {
        var need_reload = false;
        var need_icons  = false;
        var nowSS       = (new Date().getTime() / 1000.0) >>> 0;
        var o           = _ParseJSON(obj);

        if (!_ArrayCompare(o.ids, this.ids))
        {
            need_reload = true;
        }//if

        if (need_reload)
        {
            this.create_ss = nowSS;
            this.RemoveAllMarkersFromMapAndPurgeData();
            this.AddData(o.dres, o.cpms, o.ids, o.times, o.lons, o.lats, o.locstxt, o.imgtxt, o.linktxt);
        }//if
        else
        {
            if (   !_ArrayCompareAbsThr(o.lons, this.lons, 0.00001)
                || !_ArrayCompareAbsThr(o.lats, this.lats, 0.00001))
            {
                // nb: epsilon used in case of future devices with active GPS, so minor positional
                //     error doesn't constantly cause flickering of icons.
                need_icons = true;
                this.lats  = o.lats;
                this.lons  = o.lons;
            }//if
        
            if (!_ArrayCompare(o.dres, this.dres))
            {
                need_icons = true;
                this.dres  = o.dres;
                this.cpms  = o.cpms; // assume CPMs will change only if DREs change
            }//if

            if (!_ArrayCompare(o.times, this.times))
            {
                need_icons     = true;
                this.times     = o.times; // update the times even if the offline status didn't change.
                this.create_ss = nowSS;
            }//if
            
            // don't bother checking for changes, just reassign pointers
            this.locstxt = o.locstxt;
            this.imgtxt  = o.imgtxt;
            this.linktxt = o.linktxt;
            
            if (need_icons)
            {
                this.UpdateIconsForData();
            }//if
        }//else
    };
    
    // someday, "id" will be a unique autoincrement ID, but for now it's the same as the index.
    RTMKS.prototype.GetIdxForMarkerId = function(marker_id)
    {
        return marker_id;
    };

    RTMKS.prototype.GetInfoWindowContentForId = function(marker_id)
    {
        var idx = this.GetIdxForMarkerId(marker_id);
        
        if (this.ids == null || idx < 0 || idx > this.ids.length) return "";
        
        var fontcss = null;
        var imgs    = new Array();
        var ids     = new Array();
        var times   = new Array();
        var urls    = new Array();
        var dres    = new Array();
        var cpms    = new Array();
        
        // Build an Array of all sensors at that lat/lon, as the API
        // does not have sensor grouping.  The only singular value
        // used is the location name.
        
        for (var i=0; i<this.cpms.length; i++)
        {
            if (   this.lats[i] == this.lats[idx]
                && this.lons[i] == this.lons[idx])
            {
                imgs.push(this.imgtxt[i]);
                urls.push(this.linktxt[i]);
                ids.push(this.ids[i]);
                times.push(this.times[i]);
                dres.push(this.dres[i].toFixed(2));
                cpms.push(this.cpms[i]);
            }//if
        }//for
                 
        return _GetInfoWindowHtmlForParams(this.locstxt[idx], imgs, ids, times, urls, dres, cpms, fontcss);
    };
    
    RTMKS.prototype.AttachInfoWindow = function(marker)
    {
        google.maps.event.addListener(marker, "click", function() 
        {
            this.OpenRetainedInfoWindow(marker);
        }.bind(this));
    };
    
    RTMKS.prototype.OpenRetainedInfoWindow = function(marker)
    {
        if (this.inforef == null) 
        {
            this.inforef = new google.maps.InfoWindow({size: new google.maps.Size(320, 220)});
        }//if
        else
        {
            this.inforef.close();
        }//else
        
        this.inforef.setContent(this.GetInfoWindowContentForId(marker.ext_id));
        this.inforef.open(this.mapref, marker);
    };
    
    // Sorts JSON array by a less-than-threshold comparison, then ascending by value.
    //
    // This is used by the code to sort the sensors such that offline sensors are at
    // the end of the array, while online sensors are sorted by id.
    //
    var _SortJSONLtThr = function(src, prop, prop_thr, thr)
    {
        src = src.sort(function(a, b) 
        {
            var a_thr = a[prop_thr] < thr;
            var b_thr = b[prop_thr] < thr;
            
            if ((a_thr && b_thr) || (!a_thr && !b_thr))
            {
                return a[prop] > b[prop] ?  1 
                     : a[prop] < b[prop] ? -1 : 0;
            }//if
            else
            {
                return a_thr ? 1 : -1;
            }//else
        });
        
        return src;
    };

    var _ArrayCompareAbsThr = function(src0, src1, thr)
    {
        var is_eq = (src0 != null && src1 != null && src0.length == src1.length) || (src0 == null && src1 == null);
        
        if (is_eq && src0 != null && src1 != null)
        {
            for (var i=0; i<src0.length; i++)
            {
                if (Math.abs(src0[i] - src1[i]) > thr)
                {
                    is_eq = false;
                    break;
                }//if
            }//for
        }//if
        
        return is_eq;
    };

    var _ArrayCompare = function(src0, src1)
    {
        var is_eq = (src0 != null && src1 != null && src0.length == src1.length) || (src0 == null && src1 == null);
        
        if (is_eq && src0 != null && src1 != null)
        {
            for (var i=0; i<src0.length; i++)
            {
                if (src0[i] != src1[i])
                {
                    is_eq = false;
                    break;
                }//if
            }//for
        }//if
        
        return is_eq;
    };
    

    RTMKS.prototype.AddSensorDataFromJson = function(obj)
    {
        this.RefreshSensorDataFromJson(obj);
    };

    
    RTMKS.prototype.AddData = function(newdres, newcpms, newids, newtimes, newlons, newlats, newlocstxt, newimgtxt, newlinktxt)
    {
        if (newcpms == null || newcpms.length < 2) return;

        this.cpms    = _vcombine_f32(this.cpms,    newcpms);
        this.dres    = _vcombine_f32(this.dres,    newdres);
        this.ids     = _vcombine_s32(this.ids,     newids);
        this.times   = _vcombine_u32(this.times,   newtimes);
        this.lons    = _vcombine_f64(this.lons,    newlons);
        this.lats    = _vcombine_f64(this.lats,    newlats);
        this.onmaps  = _vcombine_u08(this.onmaps,  new Uint8Array(newcpms.length));
        this.locstxt = _acombine_any(this.locstxt, newlocstxt);
        this.imgtxt  = _acombine_any(this.imgtxt,  newimgtxt);
        this.linktxt = _acombine_any(this.linktxt, newlinktxt);
        
        console.log("MKS.AddData: Added %d items, new total = %d.", newcpms.length, this.cpms.length);
    };

    
    // Contarary to the function name, the JSON String must already be parsed
    // via JSON.parse, and converted to an Array of JSON Objects.
    var _ParseJSON = function(obj)
    {
        for (var i=0; i<obj.length; i++) // numeric cast for sort
        {
            obj[i].id      = parseInt(obj[i].id);
            obj[i].unix_ms = Date.parse(obj[i].updated);
        }//if
        
        var thr     = (new Date().getTime()) - 3600.0 * 1000.0;
        var rts     = _SortJSONLtThr(obj, "id", "unix_ms", thr);
        var n       = rts.length;
        
        var lats    = new Float64Array(n);
        var lons    = new Float64Array(n);
        var cpms    = new Float32Array(n);
        var dres    = new Float32Array(n);
        var ids     = new Int32Array(n);
        var times   = new Uint32Array(n);
        var locstxt = new Array(n);
        var imgtxt  = new Array(n);
        var linktxt = new Array(n);
        
        for (var i=0; i<n; i++)
        {
            lats[i] = parseFloat(rts[i].lat);
            lons[i] = parseFloat(rts[i].lon);
            cpms[i] = parseFloat(rts[i].cpm);
            dres[i] = parseFloat(rts[i].usvh);
            ids[i]  = parseInt(rts[i].id);
            
            var unixMS = rts[i].updated != null ? Date.parse(rts[i].updated) : 0.0;
            times[i]   = unixMS == null ? 0.0 : parseInt(unixMS / 1000.0);
            locstxt[i] = rts[i].location;
            //imgtxt[i] = rts[i].chart_url;            
            imgtxt[i]  = "http://107.161.164.166/plots_new/out/" + ids[i] + "_640x400.png";
            //imgtxt[i]  = "http://realtime.safecast.org/plots_new/out/" + ids[i] + "_640x400.png";
            linktxt[i] = rts[i].article_url;
        }//for
        
        return { dres:dres, cpms:cpms, ids:ids, times:times, lons:lons, lats:lats, locstxt:locstxt, imgtxt:imgtxt, linktxt:linktxt };
    };
    
    var _GetMarkerZIndexForAttributes = function(lutidx, offline)
    {
        return lutidx + (offline ? -1000 : 0);
    };
    
    var _GetIconScaleFactorForZ = function(z)
    {
        // For zoom levels > 7, the scale is always 100%.
        // Otherwise, it's:
        //   10% base
        // + 90% scaled value of [0% - 87.5%], linear, based on zoom level.
        
        return z > 7 ? 1.0 : 0.1 + (1.0 - (8 - z) * 0.125) * 0.9;
    };
    
    var _GetElapsedTimeText = function(unixSS)
    {
        unixSS = parseFloat(unixSS);
        var nowSS  = new Date().getTime() / 1000.0;
        var diffSS = nowSS - unixSS;
        var dest   = null;
        var trs    = new Array();
        
        // Don't show negative time if there are clock sync issues.
        // This clamps to a minimum value, but it might be better
        // to display an error instead.
        if (diffSS < 1.0)
        {
            diffSS = 1.0;
        }//if
        
        trs.push(["sec",    1, "秒"]);
        trs.push(["min",   60, "分"]);
        trs.push(["hour",   3600, "時間"]);
        trs.push(["day",   86400, "日"]);
        trs.push(["week",  86400*  7, "週間"]);
        trs.push(["month", 86400* 28, "ヶ月"]);
        trs.push(["year",  86400*365, "年"]);
        
        for (var i=0; i<trs.length - 1; i++)
        {
            if (diffSS < trs[i+1][1]
                && Math.round(diffSS / trs[i][1]) * trs[i][1] < trs[i+1][1]) // above is probably redundant
            {
                dest = { value:trs[i][1], text:trs[i][0], jptext:trs[i][2] };
                break;
            }//if
        }//for
        
        if (dest == null)
        {
            dest = { value:trs[trs.length-1][1], text:trs[trs.length-1][0], jptext:trs[trs.length-1][2] };
        }//if
        
        dest.value = Math.round(diffSS / dest.value);

        if (dest.value > 1.0 && dest.text != "sec" && dest.text != "min")
        {
            dest.text += "s";
        }//if

        return dest;
    };

    var _GetInfoWindowHtmlForParams = function(loc, imgurls, ids, unixSSs, linkurls, dres, cpms, fontCssClass)        
    {
        var nowSS = (new Date().getTime() / 1000.0) >>> 0;
        var cwhs  = _GetClientViewSize();
        var mini  = cwhs[0] <= 450;
        var tblw  = mini ? 320-30-10-50 : 320; // Google's styles seem to add 30 x-axis pixels of padding
        var w_pt  = 320;
        var h_pt  = 200;
        var html  = "";
        var jpago = "前";
        
        // nb: everything not a graph gets a left margin / padding of 15px
        //     to match the visual center of the graph (because right-side Google padding)
        //     don't do this in mini mode since no graph is displayed.
    
        html += "<table style='"
             +  "width:" + tblw + "px; border:0px; padding:0px;"
             +  (!mini ? "margin-right:15px;" : "")
             +  "margin-left:23px;"
             +  "border-spacing:0px; border-collapse:collapse;"
             +  "'"
             +  (fontCssClass != null ? " class='" + fontCssClass + "'" : "")
             +  ">";

        // Title: Location

        html += "<tr>";
        html += "<td colspan=2 style='text-align:center; font-size:16px;'>";
        html += (!mini ? "<span style='padding-left:15px;'>" : "")
             +  loc 
             +  (!mini ? "</span>" : "");
        html += "</td>";
        html += "</tr>";
        
        for (var i=0; i<ids.length; i++)
        {
            var elapsedtxt = _GetElapsedTimeText(unixSSs[i]);
            
            if (mini)
            {
                // Subtitle: Sensor ID (if not showing graph)
                
                html += "<tr>";
                html += "<td colspan=2 style='padding:10px 1px 1px 1px;'>";
                html += "<table style="
                     +  "'"
                     +  "width:" + tblw + "px; border:0px; padding:0px; border-spacing:0px; border-collapse:collapse;"
                     +  "'"
                     +  (fontCssClass != null ? " class='" + fontCssClass + "'" : "")
                     +  ">"
                     +  "<tr>"
                     +  "<td colspan='2' style='padding:0px; text-align:center;'>"
                     +  "<div style='font-size:14px; left:0; right:0;' class='sc_hline'>"
                     +  "ID " + ids[i]
                     +  "</div>"
                     +  "</td>"
                     +  "</tr>"
                     +  "</table>";
                html += "</td>";
                html += "</tr>";
            }//if
            
            // Detail: DRE
            
            html += "<tr>";
            
            html += "<td style='text-align:center; padding-top:10px; width:" + (tblw >>> 1) + "px;'>";
            html += "<span title='" + cpms[i] + " CPM'>"
                 +  (!mini ? "<span style='padding-left:55px;'>" : "")
                 +  "<span style='font-size:14px;'>"
                 +  dres[i]
                 +  "</span>"
                 +  "<span style='font-weight:lighter; font-size:12px;'>"
                 +  " \u00B5" + "Sv/h"
                 +  "</span>"
                 +  (!mini ? "</span>" : "");
            html += "</span>";
            html += "</td>";
            
            // Detail: Last Updated
            
            var d     = new Date(parseFloat(unixSSs[i]) * 1000.0);
            var sdate = d.toISOString().substring( 0, 10);
            var stime = d.toISOString().substring(11, 16);
            
            html += "<td style='text-align:center; padding-top:10px; width:" + (tblw >>> 1) + "px;'>";
            html += "<span title='" + sdate + " " + stime + " UTC'>"
                 +  (!mini ? "<span style='padding-right:40px;'>" : "")
                 +  "<span style='font-size:14px;'>"
                 +  elapsedtxt.value
                 +  "</span>"
                 +  "<span style='font-weight:lighter; font-size:12px;'>"
                 +  " " + elapsedtxt.jptext + jpago
                 +  "</span>"
                 +  (!mini ? "</span>" : "")
                 +  "</span>";
            html += "</td>";
            
            html += "</tr>";
            
            // Detail: Last Updated Subtitle
            
            html += "<tr>";
            html += "<td style='text-align:center; width:" + (tblw >>> 1) + "px;'>";
            html += "&nbsp;";
            html += "</td>";
            html += "<td style='text-align:center; vertical-align:top; width:" + (tblw >>> 1) + "px;'>";
            html += "<span style='vertical-align:top;' title='" + sdate + " " + stime + " UTC'>"
                 +  (!mini ? "<span style='padding-right:40px; vertical-align:top;'>" : "")
                 +  "<span style='font-weight:lighter; font-size:10px; vertical-align:top;'>"
                 +  " " + elapsedtxt.text + " ago"
                 +  "</span>"
                 +  (!mini ? "</span>" : "")
                 +  "</span>";
            html += "</td>";
            
            html += "</tr>";
            
            // Detail: Chart
            
            if (!mini)
            {
                html += "<tr>";
                html += "<td colspan=2 style='text-align:center;'>";
                html += "<img style='image-rendering:auto;image-rendering:-webkit-optimize-contrast;image-rendering:optimize-contrast;'"
                     +  " width='"  + w_pt + "'"
                     +  " height='" + h_pt + "'" 
                     +  " border=0"
                     +  " src='" + imgurls[i] + "?t=" + nowSS + "'/>";
                html += "</td>";
                html += "</tr>";
            }//if
            
            // Detail: External Link
            
            html += "<tr"
                 +  (i < ids.length - 1 ? " style='border-bottom:1px solid gainsboro;'" : "")
                 +  ">";

            html += "<td colspan=2 style='line-height:20px;'>";
            html += "<a style='color:rgb(66,114,219); font-size:12px; text-decoration:none; vertical-align:bottom;'"
                 +  " href='" + linkurls[i] + "' target=_blank>"
                 +  "詳細 · more info"
                 +  "</a>";
            html += "</td>";

            html += "</tr>";
        }//for

        html += "</table>";

        return html;
    };
    
    // based on the client's screen size and extent, find the center and zoom level
    // to pass to Google Maps to pan the view.
    /*
    var _GetRegionForExtentAndClientView_EPSG4326 = function(x0, y0, x1, y1)
    {
        var vwh = _GetClientViewSize();
        return _GetRegionForExtentAndScreenSize_EPSG4326(x0, y0, x1, y1, vwh[0], vwh[1]);
    };
    */
    
    /*
    var _GetRegionForExtentAndScreenSize_EPSG4326 = function(x0, y0, x1, y1, vw, vh)
    {
        var yx0 = new google.maps.LatLng(y0+(y1-y0)*0.5, x0+(x1-x0)*0.5);
        var dz  = 3;
                
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
    
        if (256 << dz < vw) dz++; // don't repeat world on x-axis
    
        return [yx0, dz];
    };
    */
    
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
    
    /*
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
    */
    
    var _vcombine_f64 = function(a,b) { if(a==null)return b;if(b==null)return a;var d=new Float64Array(a.length+b.length);d.set(a);d.set(b,a.length);return d; }
    var _vcombine_f32 = function(a,b) { if(a==null)return b;if(b==null)return a;var d=new Float32Array(a.length+b.length);d.set(a);d.set(b,a.length);return d; }
    var _vcombine_u32 = function(a,b) { if(a==null)return b;if(b==null)return a;var d=new  Uint32Array(a.length+b.length);d.set(a);d.set(b,a.length);return d; }
    var _vcombine_s32 = function(a,b) { if(a==null)return b;if(b==null)return a;var d=new   Int32Array(a.length+b.length);d.set(a);d.set(b,a.length);return d; }
    //var _vcombine_u16 = function(a,b) { if(a==null)return b;if(b==null)return a;var d=new  Uint16Array(a.length+b.length);d.set(a);d.set(b,a.length);return d; }
    //var _vcombine_s16 = function(a,b) { if(a==null)return b;if(b==null)return a;var d=new   Int16Array(a.length+b.length);d.set(a);d.set(b,a.length);return d; }
    var _vcombine_u08 = function(a,b) { if(a==null)return b;if(b==null)return a;var d=new   Uint8Array(a.length+b.length);d.set(a);d.set(b,a.length);return d; }
    //var _vcombine_s08 = function(a,b) { if(a==null)return b;if(b==null)return a;var d=new    Int8Array(a.length+b.length);d.set(a);d.set(b,a.length);return d; }
    var _acombine_any = function(d,s) { if(d==null)return s;if(s==null)return d;for(var i=0;i<s.length;i++)d.push(s[i]);return d; }
    
    /*
    var _vcopy_f64 = function(d,od,s,os,n) { d.subarray(od,od+n).set(s.subarray(os,os+n)); };
    var _vcopy_f32 = function(d,od,s,os,n) { d.subarray(od,od+n).set(s.subarray(os,os+n)); };
    var _vcopy_u32 = function(d,od,s,os,n) { d.subarray(od,od+n).set(s.subarray(os,os+n)); };
    var _vcopy_s32 = function(d,od,s,os,n) { d.subarray(od,od+n).set(s.subarray(os,os+n)); };
    var _vcopy_u16 = function(d,od,s,os,n) { d.subarray(od,od+n).set(s.subarray(os,os+n)); };
    var _vcopy_s16 = function(d,od,s,os,n) { d.subarray(od,od+n).set(s.subarray(os,os+n)); };
    var _vcopy_u08 = function(d,od,s,os,n) { d.subarray(od,od+n).set(s.subarray(os,os+n)); };
    var _vcopy_s08 = function(d,od,s,os,n) { d.subarray(od,od+n).set(s.subarray(os,os+n)); };
    */
    
    /*
    var _vcopy_convert = function(d,od,s,os,n) { for(var i=od;i<od+n;i++)d[i]=s[os++]; };
    */
    
    /*
    // id[x]s are used as indices into [s]rc and written to [d]est.
    RTMKS.vindex_f32 = function(s,x,d,n) { var i,m=n-(n%4);for(i=0;i<m;i+=4){d[i]=s[parseInt(x[i])];d[i+1]=s[parseInt(x[i+1])];d[i+2]=s[parseInt(x[i+2])];d[i+3]=s[parseInt(x[i+3])];}for(i=m;i<m+n%4;i++)d[i]=s[parseInt(x[i])]; };
    RTMKS.vindex_u32 = function(s,x,d,n) { var i,m=n-(n%4);for(i=0;i<m;i+=4){d[i]=s[x[i]];d[i+1]=s[x[i+1]];d[i+2]=s[x[i+2]];d[i+3]=s[x[i+3]];}for(i=m;i<m+n%4;i++)d[i]=s[x[i]]; };
    
    RTMKS.vsmul    = function(s,x,d,n) { var i,m=n-(n%4);for(i=0;i<m;i+=4){d[i]=s[i]*x;d[i+1]=s[i+1]*x;d[i+2]=s[i+2]*x;d[i+3]=s[i+3]*x;}for(i=m;i<m+n%4;i++)d[i]=s[i]*x; };
    */
    var _vfill    = function(x,d,o,n) { var i,m=(o+n)-((o+n)%4);for(i=o;i<m;i+=4){d[i]=x;d[i+1]=x;d[i+2]=x;d[i+3]=x;}for(i=m;i<m+n%4;i++)d[i]=x; };

    return RTMKS;
})();







