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
    function RTVM(map, dataBinds, rtType)
    {
        this.mapRef    = map;
        this.isMobile  = _IsPlatformMobile();
        this.mks       = null; // marker manager
        this.failures  = 0;
        this.fail_max  = (86400 * 365) / 600;
        this.last_tx   = 0;
        this.enabled   = true;
        this.rt_type   = rtType == null ? RTVM.RtType.SafecastRad : rtType;
        
        this.dataBinds = dataBinds;
        
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
        var rs = this.rt_type == RTVM.RtType.SafecastRad ? RTICO.RenderStyle.Dot
                                                         : RTICO.RenderStyle.Chevron;

        rs = RTICO.RenderStyle.DoubleTriangle;

        var pf = this.rt_type == RTVM.RtType.SafecastRad ? RTMKS.ParseFormat.SafecastRtRad
                                                         : RTMKS.ParseFormat.SafecastRtAir;

        this.mks = new RTMKS(this.mapRef, window.devicePixelRatio, this.isMobile, this.dataBinds.cssClasses.FuturaFont, pf, rs);
    };
    
    RTVM.prototype.InitMarkersAsync = function()
    {
        var pre = window.location.href.substring(0,5) == "https" ? "https://" : "http://";
        var url = this.rt_type == RTVM.RtType.SafecastRad ? pre + "realtime.safecast.org/wp-content/uploads/devices.json"
                                                          : pre + "realtime.safecast.org/wp-content/uploads/devices.json";
        this.GetJSONAsync(url);
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
        if (Date.now() - this.last_tx > 20 * 60 * 1000)
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
                this.last_tx = Date.now();
                this.GetJSONAsync(url);
            }.bind(this), 60 * 1000);
                
            return;
        }//if
    
        var ss_now      = "" + (parseInt(Date.now() * 0.001));
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
                    this.last_tx = Date.now();
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
        this.mks.AddGmapsListeners(); // only needed if they are manually removed.
    };
    
    RTVM.prototype.RemoveAllMarkersFromMapAndPurgeData = function()
    {
        this.mks.RemoveAllMarkersFromMapAndPurgeData();
    };
    
    RTVM.prototype.GetMarkerCount = function()
    {
        return this.mks == null || this.mks.vals == null ? 0 : this.mks.vals.length;
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
            if (!check) check = navigator.userAgent.indexOf("iPad") > 0;
            if (!check) check = navigator.userAgent.indexOf("Android") > 0;
        }//else
    
        return check;
    };


    RTVM.RtType =
    {
        SafecastRad: 0,
        SafecastAir: 1
    };


    return RTVM;
})();












// RTLUT: contains color lookup table and returns RGB colors for a numeric value.

var RTLUT = (function()
{
    function RTLUT(min, max, lut_id, scale_type_id)
    {
        this.min = min;
        this.max = max;
        this.lut_id = lut_id != null ? lut_id : 30;
        this.scale_type_id = scale_type_id != null ? scale_type_id : 0;

        var rgb = _GetRGBsForTableID(this.lut_id);

        this.r = rgb.r;
        this.g = rgb.g;
        this.b = rgb.b;
        
        this.n = this.r.length;
        this.rdiff = 1.0 / (this.max - this.min);
        this.nsb1  = parseFloat(this.n - 1.0);
    }//LUT
    
    RTLUT.prototype.GetRgbForIdx = function(i)
    {
        return [this.r[i], this.g[i], this.b[i]];
    };

    var _ScaleNormValueLOG10 = function(x) // y-you're going to inline this, right senpai VM?
    {
        x = Math.log(x * 9.0 + 1.0) * 0.43429448190325176;
        x = Math.log(x * 9.0 + 1.0) * 0.43429448190325176;
        x = Math.log(x * 9.0 + 1.0) * 0.43429448190325176;
        x = Math.log(x * 9.0 + 1.0) * 0.43429448190325176;
        return x;
    };
    
    var _ScaleNormValueLN = function(x)
    {
        x = Math.log(x * 1.718281828459045 + 1.0);
        x = Math.log(x * 1.718281828459045 + 1.0);
        x = Math.log(x * 1.718281828459045 + 1.0);
        return x;
    };
    
    var _ScaleNormValueNasaPm25 = function(x)
    {
        // https://upload.wikimedia.org/wikipedia/commons/4/4f/483897main_Global-PM2.5-map.JPG
        if (x > 0.25) x = 0.25 + (x - 0.25) * 0.16666667; // [0...1] -> [0...0.375]
        x *= 2.66666667; // [0...0.375] -> [0...1]
        return x;
    };

    RTLUT.prototype.GetIdxForValue = function(x, rsn)
    {
        x = (x - this.min) * this.rdiff;
        if (x > 1.0) x = 1.0; else if (x < 0.0) x = 0.0;
    
        switch (this.scale_type_id)
        {
            case RTLUT.ScaleType.LOG10:
                x = _ScaleNormValueLOG10(x);
                break;
            case RTLUT.ScaleType.LN:
                x = _ScaleNormValueLN(x);
                break;
            case RTLUT.ScaleType.NasaPm25:
                x = _ScaleNormValueNasaPm25(x);
                break;
        }//switch
        
        if (x > 1.0) x = 1.0; else if (x < 0.0) x = 0.0;
        
        var i = parseInt(x * this.nsb1);
        return rsn > 0 ? (i >>> rsn) << rsn : i;
    };

    RTLUT.prototype.GetRgbForValue = function(x, rsn)
    {
        var i = this.GetIdxForValue(x, rsn);
        return [this.r[i], this.g[i], this.b[i]];
    };
    
    var _SplitRGBLUT = function(src)
    {
        var nc = src.length / 3;
        var rc = src.substring(0, nc);
        var gc = src.substring(nc, nc * 2);
        var bc = src.substring(nc * 2, nc * 3);
    
        return { rc:rc, gc:gc, bc:bc, nc:nc };
    };

    var _vhtoi_u08 = function(d,s) { for(var i=0;i<d.length; i++)d[i]=parseInt(("0x"+s.substring(i<<1,(i<<1)+2))); };

    var _GetTypedArraysForHexStringLUT = function(src)
    {
        var rgbc = _SplitRGBLUT(src);
        var n    = rgbc.nc >>> 1;
        var r    = new Uint8Array(n);
        var g    = new Uint8Array(n);
        var b    = new Uint8Array(n);
        _vhtoi_u08(r, rgbc.rc);
        _vhtoi_u08(g, rgbc.gc);
        _vhtoi_u08(b, rgbc.bc);
    
        return { r:r, g:g, b:b };
    };

    var _GetRGBsForTableID = function(table_id)
    {
        var row = null;
        var rgb = null;
        
        for (var i=0; i<RTLUT.LUTs.length; i++)
        {
            if (RTLUT.LUTs[i][0] == table_id)
            {
                row = RTLUT.LUTs[i];
                break;
            }//if
        }//for
        
        if (row != null)
        {
            rgb = _GetTypedArraysForHexStringLUT(row[13]);
        }//if
        
        return rgb;
    };

    RTLUT.LUTs = 
    [
        [30,0,"Cyan Halo","GB",1,1,1,1,1,1,0,0.0,0.0,"0108090A0C0E10101212131415161618181919191A1A1A1A191A1B1A191A1A181819181515151110090700070F171C202226282B2D2E323336373838383A3B3B3B3B3B3B3B3B393838383633302D2B2725211D170A001D273C43545A61696E787C85898F9499A1A3ABADB2B5B9BFC2C8CAD0D2D6D9DCE1E2E9EBF0F2F5F9FBFEFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFF010707080A0B0C0C0D0D0D0D0E0E0E0F0F0F0F0F0F0F0F0F0F0F0F0F0F0E0E0E0E0D0D0C0B0B0A0905040009131E242B2E383B41464A52555E60676B70767982848C90969CA0A7AAB5B8BFC3C8D0D5DDE0E9EDF3FAFFFCFBF2F0EBE7E2DDDBD4D2CCCAC5C0BBB6B4ACAAA3A09C97948986807C75706B646157534740382C2605000000000000000000000000000000000000000000000000000000000000000000000000000000000000000B19242A3539444951555960626A6D777B8085889092999CA2A6AAB4B7BFC1C8CCD0D6D9E0E2EAEFF7FBFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFF010A0C0F13171D1F26272B30363B3D46484F53595E636D707A7D878C91999EA9ADBABFC7CED4DFE4EFF4FFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFEF7F2EAE3DDD3CFC4C0B7B3AEA6A19A978C88807B77716F66645E58514B48413F37342F2A26201D120D0000000000000000000000000000000000000000000000000000000000000000000000000000000000000000080A14171F24292F333E414A4E545A5E6669737680858A91949D9FA8ACB3BABFC6CAD3D7DEE2E8EEF2FD"],
        [32,8,"Jet","MATLAB",  1,1,1,1,1,1,0,0.0,0.0,"000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000103080C0F12181C1F232A2D3033393C3F42484C4F52585C5F646A6D70737A7D8083898C8F92989C9FA2A8ACAFB4BABDC0C3CACDD0D3D9DCDFE2E8ECEFF4FAFCFDFEFEFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFEFEFEFDFCF9F3F0EDEAE4DFDCD8D2CFCCC9C3C0BDBAB3B0ADAAA49F9C98928F8C8882807F7F00000000000000000000000000000000000000000000000000000000000001040A0D1013191C1F22282C2F32383C3F444A4D50535A5D6063696C6F72787C7F848A8E90949A9DA0A3A9ACAFB2B8BCBFC2C8CCCFD4DADDE0E3EAEDF0F3F9FBFDFEFEFEFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFEFEFEFDFBF8F2EFECE9E3E0DDDAD3D0CDCAC4BFBCB8B2AFACA8A29F9C9993908D8A837F7C77716E6C68625F5C5953504D4A43403D3A342F2C28221F1C18120F0C090401000000000000000000000000000000000000000000000000000000000000000000008F8F9092989C9FA2A8ACAFB4BABDC0C3CACDD0D3D9DCDFE2E8ECEFF4FAFCFDFEFEFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFEFEFEFDFCF9F3F0EDEAE4DFDCD8D2CFCCC9C3C0BDBAB3B0ADAAA49F9C98928F8C88827F7C7973706D6A63605D5A544F4C48423F3C38322F2C2923201D1A130F0C0802010000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000"]
    ];

    RTLUT.ScaleType =
    {
        LN: 0,
        LIN: 1,
        LOG10: 2,
        NasaPm25: 3
    };

    return RTLUT;
})();





// ICO: Renders marker icon to ivar "this.url" as base64 png.
//      Can be retained in cache as rendering pngs is slow.
//      This is completely ignorant of retina displays.

var RTICO = (function()
{
    function RTICO(width, height, deg, lutidx, lutidx2, red0, green0, blue0, red1, green1, blue1, red2, green2, blue2, alpha_fill, alpha_stroke, shadow_radius, render_style)
    {
        this.width   = width;
        this.height  = height;
        this.deg     = deg;
        this.lutidx  = lutidx;
        this.lutidx2 = lutidx2;
        this.red0    = red0;
        this.green0  = green0;
        this.blue0   = blue0;
        this.alpha0  = alpha_fill;
        this.alpha1  = alpha_stroke;
        this.shd_r   = shadow_radius;
        this.red1    = red1;
        this.green1  = green1;
        this.blue1   = blue1;
        this.red2    = red2;
        this.green2  = green2;
        this.blue2   = blue2;
        this.rstyle  = render_style;
        
        this.url    = null;
        
        this.Render();
    }//RTICO


    var _RenderStatusCircle = function(ctx, ox, oy, outer_r, r, g, b, a, scale, is_online)
    {
        var c_green = "rgba(" + r + ", " + g + ", " + b + ", " + a + ")";

        if (!is_online)
        {
            var min_angle = 0.0;
            var max_angle = 2.0 * Math.PI;
            var steps     = 6.0;
            var step_size = (max_angle - min_angle) / steps;
            
            for (var i=0; i<steps; i++)
            {
                var start_angle = parseFloat(i) * step_size;
                var   end_angle = start_angle   + step_size * 0.75;
                
                ctx.beginPath(); // stroke thick black outline
                    ctx.arc(ox, oy, outer_r, start_angle, end_angle);
                    ctx.strokeStyle = "rgba(0,0,0," + a + ")";
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
                ctx.strokeStyle = "rgba(0,0,0," + a + ")";
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
    };


    RTICO.prototype.Render = function()
    {
        if (this.rstyle == RTICO.RenderStyle.Dot)
        {
            this.RenderDot();
        }//if
        else if (this.rstyle == RTICO.RenderStyle.Chevron)
        {
            this.RenderChevron();
        }//else if
        else
        {
            this.RenderDoubleTriangle();
        }//else
    };


    RTICO.prototype.RenderDot = function()
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
        
        // ------------------------ inner dot -------------------------------

        ctx.beginPath(); // fill with variable color
            ctx.arc(ox, oy, inner_r, 0, 2 * Math.PI);
            ctx.fillStyle = c_fill;
        ctx.fill();

        ctx.beginPath(); // stroke black outline
            ctx.arc(ox, oy, inner_r, 0, 2 * Math.PI);
            ctx.strokeStyle = "rgba(0,0,0," + this.alpha0 + ")";
            ctx.lineWidth   = w_px > 12 ? 1.5 * scale : 0.75 * scale;
        ctx.stroke();
        
        _RenderStatusCircle(ctx, ox, oy, outer_r, this.red1, this.green1, this.blue1, this.alpha1, scale, this.red1 == 0);
        
        this.url = c.toDataURL("image/png");
    };


    RTICO.prototype.RenderChevron = function()
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
        
        _RenderStatusCircle(ctx, ox, oy, outer_r, this.red1, this.green1, this.blue1, this.alpha1, scale, this.red1 == 0);
        

        // ---------------------- chevron ----------------------------
        
        oy  = Math.max(0, h_add) >> 1;
        oy += 4.0 * scale;
        
        var length   = w_px - 4.0 * scale * 2.0;
        var degrees0 = 180.0 - 30.0;
        var degrees1 = 180.0 + 30.0;
        var dx,dy,x0,y0,x1,y1;
    
        // not sure why deg - 90 is needed...
        degrees0 = (degrees0 - 90.0) * 0.01745329251994329576923690768489; // ->rad
        degrees1 = (degrees1 - 90.0) * 0.01745329251994329576923690768489; // ->rad

        dx = Math.cos(degrees0) * length;
        dy = Math.sin(degrees0) * length;
        x0 = ox + dx;
        y0 = oy + dy;
        dx = Math.cos(degrees1) * length;
        dy = Math.sin(degrees1) * length;
        x1 = ox + dx;
        y1 = oy + dy;
        
        ctx.beginPath();
            ctx.strokeStyle = "rgba(0,0,0," + this.alpha0 + ")";
            ctx.lineWidth   = scale * 8.0 * 0.75;
            ctx.moveTo(x0, y0);                     // bottom-right corner
            ctx.lineTo(ox, oy + scale * 4.0 * 0.5); // top-center
            ctx.lineTo(x1, y1);                     // bottom-left corner
        ctx.stroke();

        var linediff = ((scale * 8.0 * 0.75) - (scale * 8.0 * 0.5)) * 0.5;

        // inner filled color chevron
        ctx.beginPath();
            ctx.strokeStyle = c_fill;
            ctx.lineWidth   = scale * 8.0 * 0.5;
            ctx.moveTo(x0 - linediff, y0 - linediff); // bottom-right corner
            ctx.lineTo(ox, oy + scale * 4.0 * 0.5);   // top-center
            ctx.lineTo(x1 + linediff, y1 - linediff); // bottom-left corner
        ctx.stroke();

        this.url = c.toDataURL("image/png");
    };


    RTICO.prototype.RenderDoubleTriangle = function()
    {
        var c     = document.createElement("canvas");
        var w_add = (this.shd_r - (this.width  >> 1)) * 2;
        var h_add = (this.shd_r - (this.height >> 1)) * 2;
        var w_px  = this.width  + Math.max(0, w_add);
        var h_px  = this.height + Math.max(0, h_add); // ignore, shd_r is always 0 here.
        c.width   = w_px;
        c.height  = h_px;
        var ctx   = c.getContext("2d");
        var r     = ((this.width < this.height ? this.width : this.height) >> 1) - 1; // radius
        var ox    = w_px >> 1; // offset to center
        var oy    = h_px >> 1;
        
        if (r <= 0) r = 1;

        var scale = w_px / 20.0;

        var outer_r = r - 1.0 * scale;        // buffer for antialiasing
        if (scale > 1.0) outer_r -= scale; // wtf
        
        var inner_r = outer_r - 4.0 * scale;  // 4px diff is ultimately about 1 visual pixel spacing
        
        if (w_px <= 12) inner_r = outer_r - 3.0 * scale;
        
        var c_fill  = "rgba(" + this.red0 + ", " + this.green0 + ", " + this.blue0 + ", " + this.alpha0 + ")";
        var c_fill2 = "rgba(" + this.red2 + ", " + this.green2 + ", " + this.blue2 + ", " + this.alpha0 + ")";
        
        _RenderStatusCircle(ctx, ox, oy, outer_r, this.red1, this.green1, this.blue1, this.alpha1, scale, this.red1 == 0);
        
        // ---------------------- triangles ----------------------------
        
        oy  = Math.max(0, h_add) >> 1;
        oy += 4.0 * scale;
        
        var length   = w_px - 4.0 * scale * 1.5;
        var degrees0 = 180.0 - 30.0;
        var degrees1 = 180.0 + 30.0;
        var dx,dy,x0,y0,x1,y1;
    
        degrees0 = (degrees0 - 90.0) * 0.01745329251994329576923690768489; // ->rad
        degrees1 = (degrees1 - 90.0) * 0.01745329251994329576923690768489; // ->rad
    
        var linediff = ((scale * 8.0 * 0.75) - (scale * 8.0 * 0.5)) * 0.5;
    
        dx = Math.cos(degrees0) * length;
        dy = Math.sin(degrees0) * length;
        x0 = ox + dx;
        y0 = oy + dy;
        dx = Math.cos(degrees1) * length;
        dy = Math.sin(degrees1) * length;
        x1 = ox + dx;
        y1 = oy + dy;
        
        var y0_2 = y0 + 1.0 * scale; // asymmetric offset of bottom triangle, moving it down a bit
        var y1_2 = y1 + 1.0 * scale;
        var oy_2 = oy + 1.0 * scale;
        
        var tri_h = y0 - (oy + scale * 4.0 * 0.5);
        
        oy -= tri_h * 0.5; // draw the top triangle first for layering purposes
        y0 -= tri_h * 0.5;
        y1 -= tri_h * 0.5;

        ctx.beginPath();
            ctx.strokeStyle = "rgba(0,0,0," + this.alpha0 + ")";
            ctx.lineWidth   = Math.max(1.5 * scale, 1.5);
            ctx.moveTo(x0, y0);                     // bottom-right corner
            ctx.lineTo(ox, oy + scale * 4.0 * 0.5); // top-center
            ctx.lineTo(x1, y1);                     // bottom-left corner
            ctx.closePath();
        ctx.stroke();

        // inner filled color chevron
        ctx.beginPath();
            ctx.fillStyle = c_fill;
            ctx.moveTo(x0, y0);                      // bottom-right corner
            ctx.lineTo(ox, oy + scale * 4.0 * 0.5);  // top-center
            ctx.lineTo(x1, y1);                      // bottom-left corner
        ctx.fill();

        ctx.beginPath();
            ctx.strokeStyle = "rgba(0,0,0," + this.alpha0 + ")";
            ctx.lineWidth   = Math.max(1.5 * scale, 1.5);
            ctx.moveTo(x0, y0_2);                     // bottom-right corner
            ctx.lineTo(ox, oy_2 + scale * 4.0 * 0.5); // top-center
            ctx.lineTo(x1, y1_2);                     // bottom-left corner
            ctx.closePath();
        ctx.stroke();

        // inner filled color chevron
        ctx.beginPath();
            ctx.fillStyle = c_fill2;
            ctx.moveTo(x0, y0_2);                     // bottom-right corner
            ctx.lineTo(ox, oy_2 + scale * 4.0 * 0.5); // top-center
            ctx.lineTo(x1, y1_2);                     // bottom-left corner
        ctx.fill();

        this.url = c.toDataURL("image/png");
        
        var img = document.createElement("img");
        
        this.deg = Math.random() * 180.0;
        
        img.onload = function()
        {
            ctx.clearRect(0,0,c.width,c.height);
            ctx.save();
            ctx.translate(c.width/2, c.height/2);
            ctx.rotate(this.deg*Math.PI/180);
            ctx.drawImage(img,-img.width/2,-img.width/2);
            
            this.url = c.toDataURL("image/png");
            
            ctx.restore();
        }.bind(this);
        
        img.src = this.url;
    };


    RTICO.RenderStyle =
    {
        Dot: 0,
        Chevron: 1,
        DoubleTriangle: 2
    };

    return RTICO;
})();



// MKS: Marker manager

var RTMKS = (function()
{
    function RTMKS(mapRef, pxScale, isMobile, fontCssClass, parse_format, render_style)
    {
        // Typed arrays, these hold the parsed log data.
        this.raws    = null;    // CPM value of point
        this.vals    = null;
        this.ids     = null;    // Original LogIDs of points.
        this.times   = null;    // Datetime of marker, seconds since 1970-01-01.
        this.onmaps  = null;    // 1=is a marker currently on map.  0=not on map.
        this.lons    = null;    // X coordinate.  EPSG:3857 pixel X/Y @ zoom level 21.
        this.lats    = null;    // Y coordinate.  EPSG:3857 pixel X/Y @ zoom level 21.
        this.locstxt = null;
        this.imgtxt  = null;
        this.linktxt = null;
        this.m_idxs  = null;
        
        this.isMobile = isMobile; // Disables some caching and renders less markers per pass.
        
        this.fontCssClass = fontCssClass;
        this.parse_format = parse_format;
        this.render_style = render_style;
        
        this.pxScale  = pxScale == null || pxScale < 1.0 ? 1.0 : pxScale;
        this.width    = 20;             // Marker icon width, in non-retina pixels
        this.height   = 20;             // Marker icon height, in non-retina pixels
        this.alpha0   = 1.0;            // Marker icon fill alpha, [0.0 - 1.0]
        this.alpha1   = 1.0;            // Maker icon stroke alpha, [0.0 - 1.0]
        this.shd_r    = 0.0;            // Marker icon shadow radius, pixels.
        this.icons    = new Array();
        
        this.lut_rsn  = 2;                       // 256 >> 128 >> 64 colors
                                                 // The LUT gets the RGB values for a value.
        this.lut      = new RTLUT(this.parse_format == RTMKS.ParseFormat.SafecastRtRad ?  0.030 :  0.0, 
                                  this.parse_format == RTMKS.ParseFormat.SafecastRtRad ? 65.535 : 80.0, 
                                  this.parse_format == RTMKS.ParseFormat.SafecastRtRad ? 30     : 32,
                                  this.parse_format == RTMKS.ParseFormat.SafecastRtRad ? RTLUT.ScaleType.LOG10 
                                                                                       : RTLUT.ScaleType.LN); 

        this.mapref  = mapRef;
        this.inforef = null;
        
        this.zoomlistener = null;
        this.draglistener = null;
        
        this.create_ss = (Date.now() * 0.001)>>>0;
        
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
        
        this.AddGmapsListeners();
    }//RTMKS
    
    
    RTMKS.prototype._GetCurrentVisibleExtent = function()
    {
        var e = {};
        var b = this.mapref.getBounds();
        e.x0  = b.getSouthWest().lng();
        e.y0  = b.getSouthWest().lat();
        e.x1  = b.getNorthEast().lng();
        e.y1  = b.getNorthEast().lat();
        e.z   = this.mapref.getZoom();
        
        if (e.x0 > e.x1) // 180th meridian handling -- need to split into second extent
        {                // but, y-coordinates stay the same, so only need two more x-coordinates.
            e.ex1 = e.x1;
            e.x1  =  180.0;
            e.ex0 = -180.0;
        }//if
        else
        {
            e.ex0 = -9000.0;
            e.ex1 = -9000.0;
        }//else
        
        return e;
    };


    var _IsIntersectingExtents = function(e0, e1)
    {
        return !(e0.x1 < e1.x0 || e0.x0 > e1.x1 || e0.y1 < e1.y0 || e0.y0 > e1.y1);
    };
    
    var _IsPointInExtent = function(x, y, e)
    {
        return !(y < e.y0
             ||  y > e.y1
             || (x < e.x0 && (e.ex0 == -9000.0 || x < e.ex0))
             || (x > e.x1 && (e.ex1 == -9000.0 || x > e.ex1)));
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

    RTMKS.prototype.PurgeData = function()
    {
        this.vals    = null;
        this.raws    = null;
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
    
    RTMKS.prototype.ClearGmapsListeners = function()
    {
        if (this.zoomlistener != null)
        {
            google.maps.event.removeListener(this.zoomlistener);
            this.zoomlistener = null;
        }//if
        
        if (this.draglistener != null)
        {
            google.maps.event.removeListener(this.draglistener);
            this.draglistener = null;
        }//if
    };
    
    RTMKS.prototype.AddGmapsListeners = function()
    {
        if (this.mapref == null) return;
        
        var fxRefresh = function(e) { this.RescaleIcons(); }.bind(this);
        
        if (this.zoomlistener == null)
        {
            this.zoomlistener = google.maps.event.addListener(this.mapref, "zoom_changed", fxRefresh);
        }//if
        
        if (this.draglistener == null)
        {
            this.draglistener = google.maps.event.addListener(this.mapref, "dragend", fxRefresh);
        }//if
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
        var e     = this._GetCurrentVisibleExtent();
        var scale = _GetIconScaleFactorForZ(e.z);

        for (var i=0; i<this.markers.length; i++)
        {
            var lat = this.lats[this.markers[i].ext_id];
            var lon = this.lons[this.markers[i].ext_id];
        
            if (   lat != this.markers[i].getPosition().lat()
                || lon != this.markers[i].getPosition().lng())
            {
                this.markers[i].setPosition(new google.maps.LatLng(lat, lon));
            }//if
            
            if (_IsPointInExtent(lon, lat, e))
            {
                var ico     = this.markers[i].getIcon();
                var val     = this.vals[this.markers[i].ext_id];
                var offline = this.IsSensorOffline(this.markers[i].ext_id);
                var lutidx  = this.lut.GetIdxForValue(val, this.lut_rsn);

                if (ico.scaledSize.width != this.width * scale
                    || offline != this.markers[i].ext_offline
                    ||  lutidx != this.markers[i].ext_lut_idx)
                {
                    ico.size       = new google.maps.Size(this.width * scale, this.height * scale);
                    ico.scaledSize = new google.maps.Size(this.width * scale, this.height * scale);
                    ico.anchor     = new google.maps.Point(this.width * scale * 0.5, this.height * scale * 0.5);
                    ico.url        = this.GetIconCached(lutidx, offline, this.width, this.height, this.pxScale * scale);
                
                    this.markers[i].setIcon(ico);
                    this.markers[i].setZIndex(_GetMarkerZIndexForAttributes(lutidx, offline));
                    this.markers[i].ext_offline = offline;
                    this.markers[i].ext_lut_idx = lutidx;
                }//if
            }//if
        }//for
    };


    RTMKS.prototype.RescaleIcons = function()
    {
        if (this.mapref == null || this.markers.length == 0) return;
        
        var z = this.mapref.getZoom();
        
        if (z > 7 && this.last_z > 7
            && z > this.last_z) // 2016-12-01 ND: for lazy extent-based updates
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
                var val = this.vals[i];
                var idx = this.lut.GetIdxForValue(val, this.lut_rsn);
                
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
                &&  this.icons[i].shd_r  == this.shd_r
                &&  this.icons[i].rstyle == this.render_style)
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
            
            var lutidx2 = lutidx >>> 1;
            var r2 = this.lut.r[lutidx2];
            var g2 = this.lut.g[lutidx2];
            var b2 = this.lut.b[lutidx2];
            var deg = -1;
            
            var ico = new RTICO(w_px, h_px, deg, lutidx, lutidx2, r0, g0, b0, r1, g1, b1, r2, g2, b2, a0, a1, this.shd_r, this.render_style);
            //var ico = new RTICO(w_px, h_px, -1, false, lutidx, r0, g0, b0, r1, g1, b1, a0, a1, this.shd_r, this.render_style);
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
        var nowSS       = (Date.now() / 1000.0) >>> 0;
        var o           = _ParseJSON(obj, this.parse_format);

        if (!_ArrayCompare(o.ids, this.ids))
        {
            need_reload = true;
        }//if

        if (need_reload)
        {
            this.create_ss = nowSS;
            this.RemoveAllMarkersFromMapAndPurgeData();
            this.AddData(o.vals, o.raws, o.ids, o.times, o.lons, o.lats, o.locstxt, o.imgtxt, o.linktxt);
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
        
            if (!_ArrayCompare(o.vals, this.vals))
            {
                need_icons = true;
                this.vals  = o.vals;
                this.raws  = o.raws; // assume CPMs will change only if DREs change
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
        var vals    = new Array();
        var raws    = new Array();
        
        // Build an Array of all sensors at that lat/lon, as the API
        // does not have sensor grouping.  The only singular value
        // used is the location name.
        
        for (var i=0; i<this.vals.length; i++)
        {
            if (   this.lats[i] == this.lats[idx]
                && this.lons[i] == this.lons[idx])
            {
                imgs.push(this.imgtxt[i]);
                urls.push(this.linktxt[i]);
                ids.push(this.ids[i]);
                times.push(this.times[i]);
                vals.push(this.vals[i].toFixed(2));
                
                if (this.parse_format == RTMKS.ParseFormat.SafecastRtRad)
                {
                    raws.push(this.raws[i]);
                }//if
            }//if
        }//for
        
        var val_unit = this.parse_format == RTMKS.ParseFormat.SafecastRtRad ? ("\u00B5" + "Sv/h") : "PM2.5";
        var raw_unit = this.parse_format == RTMKS.ParseFormat.SafecastRtRad ? "CPM" : null;
                 
        return _GetInfoWindowHtmlForParams(this.locstxt[idx], imgs, ids, times, urls, vals, raws, val_unit, raw_unit, fontcss);
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

    
    RTMKS.prototype.AddData = function(newvals, newraws, newids, newtimes, newlons, newlats, newlocstxt, newimgtxt, newlinktxt)
    {
        if (newvals == null || newvals.length < 2) return;

        if (this.parse_format == RTMKS.ParseFormat.SafecastRtRad)
        {
            this.raws    = _vcombine_f32(this.raws,    newraws);
        }//if

        this.vals    = _vcombine_f32(this.vals,    newvals);
        this.ids     = _vcombine_s32(this.ids,     newids);
        this.times   = _vcombine_u32(this.times,   newtimes);
        this.lons    = _vcombine_f64(this.lons,    newlons);
        this.lats    = _vcombine_f64(this.lats,    newlats);
        this.onmaps  = _vcombine_u08(this.onmaps,  new Uint8Array(newvals.length));
        this.locstxt = _acombine_any(this.locstxt, newlocstxt);
        this.imgtxt  = _acombine_any(this.imgtxt,  newimgtxt);
        this.linktxt = _acombine_any(this.linktxt, newlinktxt);
        
        console.log("MKS.AddData: Added %d items, new total = %d.", newvals.length, this.vals.length);
    };

    
    // Contarary to the function name, the JSON String must already be parsed
    // via JSON.parse, and converted to an Array of JSON Objects.
    var _ParseJSON = function(obj, parse_format)
    {
        for (var i=0; i<obj.length; i++) // numeric cast for sort
        {
            obj[i].id      = parseInt(obj[i].id);
            obj[i].unix_ms = Date.parse(obj[i].updated);
        }//if

        var thr     = Date.now() - 3600.0 * 1000.0;
        var rts     = _SortJSONLtThr(obj, "id", "unix_ms", thr);
        var n       = rts.length;
        
        var lats    = new Float64Array(n);
        var lons    = new Float64Array(n);
        var raws    = parse_format == RTMKS.ParseFormat.SafecastRtRad ? new Float32Array(n) : null;
        var vals    = new Float32Array(n);
        var ids     = new Int32Array(n);
        var times   = new Uint32Array(n);
        var locstxt = new Array(n);
        var imgtxt  = new Array(n);
        var linktxt = new Array(n);
        
        var pre = window.location.href.substring(0,5) == "https" ? "https://" : "http://";
        
        for (var i=0; i<n; i++)
        {
            ids[i]  = parseInt(rts[i].id);
            lats[i] = parseFloat(rts[i].lat);
            lons[i] = parseFloat(rts[i].lon);

            if (parse_format == RTMKS.ParseFormat.SafecastRtRad)
            {
                raws[i] = parseFloat(rts[i].cpm);
                vals[i] = parseFloat(rts[i].usvh);
                //imgtxt[i]  = "http://107.161.164.166/plots_new/out/" + ids[i] + "_640x400.png";

                imgtxt[i]  = pre + "realtime.safecast.org/plots_new/out/" + ids[i] + "_640x400.png";
            }//if
            else
            {
                vals[i] = parseFloat(rts[i].pm25);
                imgtxt[i] = rts[i].chart_url;
            }//else

            var unixMS = rts[i].updated != null ? Date.parse(rts[i].updated) : 0.0;
            times[i]   = unixMS == null ? 0.0 : parseInt(unixMS / 1000.0);
            locstxt[i] = rts[i].location;
            linktxt[i] = rts[i].article_url;
        }//for
        
        return { vals:vals, raws:raws, ids:ids, times:times, lons:lons, lats:lats, locstxt:locstxt, imgtxt:imgtxt, linktxt:linktxt };
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
        var nowSS  = Date.now() / 1000.0;
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
        
        trs.push(["sec",           1, "秒"]);
        trs.push(["min",          60, "分"]);
        trs.push(["hour",       3600, "時間"]);
        trs.push(["day",       86400, "日"]);
        trs.push(["week",    7*86400, "週間"]);
        trs.push(["month",  28*86400, "ヶ月"]);
        trs.push(["year",  365*86400, "年"]);
        
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

    var _GetInfoWindowHtmlForParams = function(loc, imgurls, ids, unixSSs, linkurls, vals, raws, val_unit, raw_unit, fontCssClass)        
    {
        var nowSS = (Date.now() / 1000.0) >>> 0;
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
            html += "<span"
                 +  (raws != null ? "title='" + raws[i] + " " + raw_unit + "'" : "")
                 +  ">"
                 +  (!mini ? "<span style='padding-left:55px;'>" : "")
                 +  "<span style='font-size:14px;'>"
                 +  vals[i]
                 +  "</span>"
                 +  "<span style='font-weight:lighter; font-size:12px;'>"
                 +  " " + val_unit
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

    var _vcombine_f64 = function(a,b) { if(a==null)return b;if(b==null)return a;var d=new Float64Array(a.length+b.length);d.set(a);d.set(b,a.length);return d; }
    var _vcombine_f32 = function(a,b) { if(a==null)return b;if(b==null)return a;var d=new Float32Array(a.length+b.length);d.set(a);d.set(b,a.length);return d; }
    var _vcombine_u32 = function(a,b) { if(a==null)return b;if(b==null)return a;var d=new  Uint32Array(a.length+b.length);d.set(a);d.set(b,a.length);return d; }
    var _vcombine_s32 = function(a,b) { if(a==null)return b;if(b==null)return a;var d=new   Int32Array(a.length+b.length);d.set(a);d.set(b,a.length);return d; }
    var _vcombine_u08 = function(a,b) { if(a==null)return b;if(b==null)return a;var d=new   Uint8Array(a.length+b.length);d.set(a);d.set(b,a.length);return d; }
    var _acombine_any = function(d,s) { if(d==null)return s;if(s==null)return d;for(var i=0;i<s.length;i++)d.push(s[i]);return d; }

    var _vfill    = function(x,d,o,n) { var i,m=(o+n)-((o+n)%4);for(i=o;i<m;i+=4){d[i]=x;d[i+1]=x;d[i+2]=x;d[i+3]=x;}for(i=m;i<m+n%4;i++)d[i]=x; };

    RTMKS.ParseFormat =
    {
        SafecastRtRad: 0,
        SafecastRtAir: 1
    };

    return RTMKS;
})();






