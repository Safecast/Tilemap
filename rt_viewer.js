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
// 3. Add a log by URL directly
// -------------------------------
// bvm.GetSensorsFromUrlAsync("http://realtime.safecast.org/wp-content/uploads/devices.json");


// =================================
// Optional - Data Transfer UI
// =================================
//
// To display a UI showing download progress to the user, a div with a specific ID is required.
// This div is used to inject HTML, as Google Maps does with "map_canvas" above.
// External CSS styles and an image are also required.
//
// 1. HTML Div
// -------------------------------
// <div id="bv_transferBar" class="bv_transferBarHidden"></div>
//
// 2. World Map PNG (256x256)
// -------------------------------
// By default, "world_155a_z0.png" should be in the same path.
//
// 3. CSS Styles (many)
// -------------------------------
// Required styles are as follows.
//
// #bv_transferBar { position:absolute;top:0;bottom:0;left:0;right:0;margin:auto;padding:10px 0px 20px 20px;border:0px;background-color:rgba(255, 255, 255, 0.75);font-size:80%; }
// .bv_transferBarVisible { visibility:visible;z-index:8;width:276px;height:286px;overflow:visible; }
// .bv_transferBarHidden { visibility:hidden;z-index:-9000;width:0px;height:0px;overflow:hidden; }
// .bv_FuturaFont { font-size:100%;font-family:Futura,Futura-Medium,'Futura Medium','Futura ND Medium','Futura Std Medium','Futura Md BT','Century Gothic','Segoe UI',Helvetica,Arial,sans-serif; }
// .bv_hline { overflow:hidden;text-align:center; }
// .bv_hline:before, .bv_hline:after { background-color:#000;content:"";display:inline-block;height:1px;position:relative;vertical-align:middle;width:50%; }
// .bv_hline:before { right:0.5em;margin-left:-50%; }
// .bv_hline:after { left:0.5em;margin-right:-50%; }
//
// Note the font can be anything, but should be about that size.
// That font class is also used for marker info windows.









// RT Viewer - Main
// Contains all useful instances of other objects and UI event handling.
// Messy and too broad but hey.

// NOTE: In most cases, null should be passed for "dataBinds".
//       Only override this if you want to set custom styles or image/worker filepaths.

var RTVM = (function()
{
    function RTVM(map, dataBinds)
    {
        this.mapRef   = map;
        this.isMobile = RTVM.IsPlatformMobile();
        this.mks      = null; // marker manager
        
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
    };
    
    RTVM.prototype.Init_DataBindDefaults = function()
    {
        var binds =
        {
            elementIds:
            {
            },
            cssClasses:
            {
                bv_FuturaFont:"bv_FuturaFont"
            },
            urls:
            {
                world_155a_z0:"world_155a_z0.png"
            }
        };
        
        this.dataBinds = binds;
    };

    RTVM.prototype.Init_MKS = function()
    {
        this.mks = new RTMKS(this.mapRef, RTICO.IconStyleLg, window.devicePixelRatio, this.isMobile, this.dataBinds.cssClasses.bv_FuturaFont);
    };
    
    RTVM.prototype.InitMarkersAsync = function()
    {
        var d       = new Date();
        var ss_now  = "" + (parseInt(d.getTime() * 0.001));
        this.GetJSONAsync("http://realtime.safecast.org/wp-content/uploads/devices.json?t=" + ss_now);
    };



    // =======================================================================================================
    //                            Event handlers - abstracted download methods
    // =======================================================================================================

    RTVM.prototype.GetJSONAsync = function(url)
    {
        var cb = function(response, userData)
        {
            console.log("RTVM: Got response.");
            
            var success = response != null && response.length > 0;
        
            if (success)
            {
                var obj = JSON.parse(response);
                
                console.log("RTVM: Parsed obj.");
                
                if (obj != null)
                {
                    console.log("RTVM: Calling data fx...");
                
                    this.mks.AddSensorDataFromJson(obj);
                    
                    setTimeout(function() {
                        this.mks.AddMarkersToMap();
                    }.bind(this), 1000);
                }//if
                else
                {
                    success = false;
                }//else
            }//if
        
            if (!success)
            {
                console.log("RTVM: Error getting sensors from URL: %s", url);
            }//if
        }.bind(this);
        
        RTVM.GetAsync_HTTP(url, null, null, cb, null);
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
    


    // =======================================================================================================
    //                                      Static/Class Methods
    // =======================================================================================================
    
    RTVM.GetAsync_HTTP = function(url, responseType, responseHeader, fxCallback, userData)
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
        };
        
        req.send(null);
    };
    
    // returns value of querystring parameter "name"
    RTVM.GetParam = function(name) 
    {
        name        = name.replace(/[\[]/, "\\\[").replace(/[\]]/, "\\\]");
        var regexS  = "[\\?&]" + name + "=([^&#]*)";
        var regex   = new RegExp(regexS);
        var results = regex.exec(window.location.href);
    
        return results == null ? "" : results[1];
    };


    // http://stackoverflow.com/questions/11381673/detecting-a-mobile-browser
    // returns true if useragent is detected as being a mobile platform, or "mobile=1" is set in querystring.
    RTVM.IsPlatformMobile = function()
    {
        var check   = false;
        var ovr_str = RTVM.GetParam("mobile");
    
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
    
    RTVM.ChangeVisibilityForElementByIdByReplacingClass = function(elementid, classHidden, classVisible, isHidden)
    {
        var el = document.getElementById(elementid);
        if       (el != null &&  isHidden && el.className == classVisible) el.className = classHidden;
        else if  (el != null && !isHidden && el.className == classHidden)  el.className = classVisible;
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
        
        }
        
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
        //this.isRetina = isRetina;       // Enables @2x marker icon resolution.
        this.pxScale  = pxScale == null || pxScale < 1.0 ? 1.0 : pxScale;
        this.width    = 20;             // Marker icon width, in non-retina pixels
        this.height   = 20;             // Marker icon height, in non-retina pixels
        this.alpha0   = 1.0;           // Marker icon fill alpha, [0.0 - 1.0]
        this.alpha1   = 1.0;           // Maker icon stroke alpha, [0.0 - 1.0]
        this.shd_r    = 0.0;            // Marker icon shadow radius, pixels.
        this.icons    = new Array();
        
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
        
        //this.ApplyMarkerType(); // must fire on init
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
    
    RTMKS.prototype.ApplyMapVisibleExtentForMarkers = function()    
    {
        if (!this.IsMarkerExtentValid())
        {
            return;
        }//if
        
        var r = MKS.GetRegionForExtentAndClientView_EPSG4326(this.mk_ex[0], this.mk_ex[1], this.mk_ex[2], this.mk_ex[3]);
        this.mapref.panTo(r[0]);
        this.mapref.setZoom(r[1]);
    };

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
            //this.onmaps[m_idxs[i]] = 0;
        }//for
        
        RTMKS.vfill(0, this.onmaps, 0, this.onmaps.length);
        
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
        
        var fxRefresh = function() { this.RescaleIcons(); }.bind(this);
        
        this.zoomlistener = google.maps.event.addListener(this.mapref, "zoom_changed", fxRefresh);
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
        
        var scale = RTMKS.GetIconScaleFactorForZ(z);
        
        for (var i=0; i<this.markers.length; i++)
        {
            var ico = this.markers[i].getIcon();
            
            if (ico.scaledSize.width != this.width * scale)
            {
                ico.size       = new google.maps.Size(this.width * scale, this.height * scale);
                ico.scaledSize = new google.maps.Size(this.width * scale, this.height * scale);
                ico.anchor     = new google.maps.Point(this.width * scale * 0.5, this.height * scale * 0.5);
                var offline    = this.create_ss - this.times[this.markers[i].ext_id] > 3600;
                ico.url        = this.GetIconCached(this.markers[i].getZIndex(), offline, this.width, this.height, this.pxScale * scale);
                
                this.markers[i].setIcon(ico);
            }//if
        }//for
        
        this.last_z = z;
    };
    
    RTMKS.prototype.IsSensorOffline = function(idx)
    {
        //var d = new Date();
        return this.create_ss - this.times[idx] > 3600;
    };
    
    RTMKS.prototype.AddMarkersToMap = function()
    {
        if (this.lats == null) return;
        
        var rsn     = 2;
        
        for (var i=0; i<this.lats.length; i++)
        {
            if (this.onmaps[i] == 0)
            {
                this.onmaps[i] = 1;
                
                var lat = this.lats[i];
                var lon = this.lons[i];
                var dre = this.dres[i];
                
                for (var j=0; j<this.lats.length; j++)
                {
                    if (   lat == this.lats[j]
                        && lon == this.lons[j]
                        && dre  < this.dres[j])
                    {
                        dre = this.dres[j];
                    }//if
                }//for
                
                var lutidx = this.lut.GetIdxForValue(dre, rsn);
                
                this.AddMarker(i, lat, lon, lutidx, this.IsSensorOffline(i));
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
        
        marker.setPosition(yx);
        marker.setIcon(icon);
        marker.setZIndex(lutidx + (offline ? -1000 : 0));
        marker.ext_id = marker_id;
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
    
    // someday, "id" will be a unique autoincrement ID, but for now it's the same as the index.
    RTMKS.prototype.GetIdxForMarkerId = function(marker_id)
    {
        return marker_id;
    };


    RTMKS.prototype.GetInfoWindowContentForId = function(marker_id)
    {
        var i = this.GetIdxForMarkerId(marker_id);
        
        if (this.cpms == null || i < 0 || i > this.cpms.length) return "";
        
        var url = this.imgtxt[i];
        
        var unixMS = parseFloat(this.times[i]) * 1000.0;        
        var d     = new Date(unixMS);
        var sdate = d.toISOString().substring( 0, 10);
        var stime = d.toISOString().substring(11, 16);
        var sdre  = RTMKS.GetStringWithTwoFractionalDigits(this.dres[i]);
        
        var imgurls = new Array();
        
        for (var j=0; j<this.cpms.length; j++)
        {
            if (   this.lats[j] == this.lats[i]
                && this.lons[j] == this.lons[i])
            {
                imgurls.push(this.imgtxt[j]);
            }//if
        }//for
                 
        return RTMKS.GetInfoWindowHtmlForParams(sdre, this.times[i], this.cpms[i], sdate, stime, this.ids[i], this.locstxt[i], imgurls, this.linktxt[i], null);
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
        if (this.inforef == null) this.inforef = new google.maps.InfoWindow({size: new google.maps.Size(320, 220)});
        else this.inforef.close(); 
        this.inforef.setContent(this.GetInfoWindowContentForId(marker.ext_id));
        this.inforef.open(this.mapref, marker);
    };


    // [{"id":"106","lat":"37.442836","lon":"-122.128094","location":"USA, California, Palo Alto, Triple El (2)","updated":"2015-02-18T01:46:26Z","usvh":"0.124","cpm":"15","chart_url":"http:\/\/rt.safecast.org\/plots\/106_small.png","chart_width":480,"chart_height":200},

    RTMKS.prototype.AddSensorDataFromJson = function(obj)
    {
        var rts = obj;
        var n   = rts.length;
        
        var d       = new Date();
        var ss_now  = "" + (parseInt(d.getTime() * 0.001));
        
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
            times[i] = unixMS == null ? 0.0 : parseInt(unixMS * 0.001);    
            
            locstxt[i] = rts[i].location;
            //imgtxt[i] = rts[i].chart_url;
            imgtxt[i] = "http://gamma.tar.bz/nGeigies/" + ids[i] + "_640x400.png?t=" + ss_now;
            
            if (cpms[i] >= (dres[i] / 334.0) * 0.9 && cpms[i] <= (dres[i] / 334.0) * 1.1)
            {
                dres[i] = cpms[i] / 350.0;
            }//if
            
            linktxt[i] = rts[i].article_url;
        }//for
        
        this.AddData(dres, cpms, ids, times, lons, lats, locstxt, imgtxt, linktxt);
    };

    
    RTMKS.prototype.AddData = function(newdres, newcpms, newids, newtimes, newlons, newlats, newlocstxt, newimgtxt, newlinktxt)
    {
        if (newcpms == null || newcpms.length < 2) return;

        this.cpms    = RTMKS.vcombine_f32(this.cpms,    newcpms);
        this.dres    = RTMKS.vcombine_f32(this.dres,    newdres);
        this.ids     = RTMKS.vcombine_s32(this.ids,     newids);
        this.times   = RTMKS.vcombine_u32(this.times,   newtimes);
        this.lons    = RTMKS.vcombine_f64(this.lons,    newlons);
        this.lats    = RTMKS.vcombine_f64(this.lats,    newlats);
        this.onmaps  = RTMKS.vcombine_u08(this.onmaps,  new Uint8Array(newcpms.length));
        this.locstxt = RTMKS.acombine_any(this.locstxt, newlocstxt);
        this.imgtxt  = RTMKS.acombine_any(this.imgtxt,  newimgtxt);
        this.linktxt = RTMKS.acombine_any(this.linktxt, newlinktxt);
        
        console.log("MKS.AddData: Added %d items, new total = %d.", newcpms.length, this.cpms.length);
    };
    
    RTMKS.GetIconScaleFactorForZ = function(z)
    {
        return z > 7 ? 1.0 : 0.1 + (1.0 - (8 - z) * 0.125) * 0.9;
    };
    
    RTMKS.GetInfoWindowHtmlForParams = function(dre, unixSS, cpm, date, time, id, loc, imgurls, linkurl, fontCssClass)
    {   
        var html = "<table style='width:320px;border:0px;padding:0px;border-spacing:0px;border-collapse:collapse;' "
               + (fontCssClass != null ? "class='" + fontCssClass + "' " : "") 
               + "<tr><td style='text-align:center;font-size:14px;'>" + loc + "</td></tr>";
               
        if (unixSS < (new Date()).getTime() * 0.001 - 30.0 * 24.0 * 60.0 * 60.0)
        {
            html += "<tr><td>&nbsp;</td></tr>";
        
            html += "<tr><td style='text-align:center;'>"
                  + dre + " \u00B5" + "Sv/h"
                  + " (Last Updated: "
                  + date 
                  + ")"
                  + "</td></tr>";
        }//if
               
        for (var i=0; i<imgurls.length; i++)
        {
            html += "<tr><td style='text-align:center;'><img style='image-rendering:auto;image-rendering:-webkit-optimize-contrast;image-rendering:optimize-contrast;' width='320' height='200' border=0 src='" + imgurls[i] + "'/></td></tr>";
        }//for
               
        html += "<tr><td style='line-height:20px;'><a style='color:rgb(66,114,219);font-size:12px;text-decoration:none;' href='" + linkurl + "' target=_blank>more info</a></td></tr>"
               + "</table>";

        return html;
    };
    
    RTMKS.GetStringWithTwoFractionalDigits = function(x) // this is a terrible implementation
    {
        var sx = "" + RTMKS.RoundToD(x, 2);
             if (sx.length == 3 && x < 10.0) sx += "0";    //  9.0
        else if (sx.length == 1 && x < 10.0) sx += ".00";  //  9
        else if (sx.length == 4 && x >= 10.0 && x < 100.0) sx += "0";    // 99.9
        else if (sx.length == 2 && x >= 10.0 && x < 100.0) sx += ".00";  // 99
        return sx;
    };
    
    // based on the client's screen size and extent, find the center and zoom level
    // to pass to Google Maps to pan the view.
    RTMKS.GetRegionForExtentAndClientView_EPSG4326 = function(x0, y0, x1, y1)
    {
        var vwh = RTMKS.GetClientViewSize();
        return RTMKS.GetRegionForExtentAndScreenSize_EPSG4326(x0, y0, x1, y1, vwh[0], vwh[1]);
    };
    
    RTMKS.GetRegionForExtentAndScreenSize_EPSG4326 = function(x0, y0, x1, y1, vw, vh)
    {
        var yx0 = new google.maps.LatLng(y0+(y1-y0)*0.5, x0+(x1-x0)*0.5);
        var dz  = 3;
                
        for (var z = 20; z >= 0; z--)
        {
            var mxy0 = RTMKS.LatLonToXYZ_EPSG3857(y1, x0, z);
            var mxy1 = RTMKS.LatLonToXYZ_EPSG3857(y0, x1, z);
                    
            if (Math.abs(mxy1[0] - mxy0[0]) < vw && Math.abs(mxy1[1] - mxy0[1]) < vh)
            {
                dz = z;
                break;
            }//if
        }//for
    
        if (256 << dz < vw) dz++; // don't repeat world on x-axis
    
        return [yx0, dz];
    };
    
    RTMKS.GetClientViewSize = function()
    {
        var _w = window,
            _d = document,
            _e = _d.documentElement,
            _g = _d.getElementsByTagName("body")[0],
            vw = _w.innerWidth || _e.clientWidth || _g.clientWidth,
            vh = _w.innerHeight|| _e.clientHeight|| _g.clientHeight;
        
        return [vw, vh];
    };
    
    RTMKS.LatLonToXYZ_EPSG3857 = function(lat, lon, z)
    {
        var x  = (lon + 180.0) * 0.002777778;
        var s  = Math.sin(lat * 0.0174532925199);
        var y  = 0.5 - Math.log((1.0 + s) / (1.0 - s)) * 0.0795774715459;
        var w  = 256 << z;
        var px = parseInt(x * w + 0.5);
        var py = parseInt(y * w + 0.5);
        return [px, py];
    };
    
    RTMKS.vcombine_f64 = function(a,b) { if(a==null)return b;if(b==null)return a;var d=new Float64Array(a.length+b.length);d.set(a);d.set(b,a.length);return d; }
    RTMKS.vcombine_f32 = function(a,b) { if(a==null)return b;if(b==null)return a;var d=new Float32Array(a.length+b.length);d.set(a);d.set(b,a.length);return d; }
    RTMKS.vcombine_u32 = function(a,b) { if(a==null)return b;if(b==null)return a;var d=new  Uint32Array(a.length+b.length);d.set(a);d.set(b,a.length);return d; }
    RTMKS.vcombine_s32 = function(a,b) { if(a==null)return b;if(b==null)return a;var d=new   Int32Array(a.length+b.length);d.set(a);d.set(b,a.length);return d; }
    RTMKS.vcombine_u16 = function(a,b) { if(a==null)return b;if(b==null)return a;var d=new  Uint16Array(a.length+b.length);d.set(a);d.set(b,a.length);return d; }
    RTMKS.vcombine_s16 = function(a,b) { if(a==null)return b;if(b==null)return a;var d=new   Int16Array(a.length+b.length);d.set(a);d.set(b,a.length);return d; }
    RTMKS.vcombine_u08 = function(a,b) { if(a==null)return b;if(b==null)return a;var d=new   Uint8Array(a.length+b.length);d.set(a);d.set(b,a.length);return d; }
    RTMKS.vcombine_s08 = function(a,b) { if(a==null)return b;if(b==null)return a;var d=new    Int8Array(a.length+b.length);d.set(a);d.set(b,a.length);return d; }
    RTMKS.acombine_any = function(d,s) { if(d==null)return s;if(s==null)return d;for(var i=0;i<s.length;i++)d.push(s[i]);return d; }
    
    RTMKS.vcopy_f64 = function(d,od,s,os,n) { d.subarray(od,od+n).set(s.subarray(os,os+n)); };
    RTMKS.vcopy_f32 = function(d,od,s,os,n) { d.subarray(od,od+n).set(s.subarray(os,os+n)); };
    RTMKS.vcopy_u32 = function(d,od,s,os,n) { d.subarray(od,od+n).set(s.subarray(os,os+n)); };
    RTMKS.vcopy_s32 = function(d,od,s,os,n) { d.subarray(od,od+n).set(s.subarray(os,os+n)); };
    RTMKS.vcopy_u16 = function(d,od,s,os,n) { d.subarray(od,od+n).set(s.subarray(os,os+n)); };
    RTMKS.vcopy_s16 = function(d,od,s,os,n) { d.subarray(od,od+n).set(s.subarray(os,os+n)); };
    RTMKS.vcopy_u08 = function(d,od,s,os,n) { d.subarray(od,od+n).set(s.subarray(os,os+n)); };
    RTMKS.vcopy_s08 = function(d,od,s,os,n) { d.subarray(od,od+n).set(s.subarray(os,os+n)); };
    
    RTMKS.vcopy_convert = function(d,od,s,os,n) { for(var i=od;i<od+n;i++)d[i]=s[os++]; };

    // id[x]s are used as indices into [s]rc and written to [d]est.
    RTMKS.vindex_f32 = function(s,x,d,n) { var i,m=n-(n%4);for(i=0;i<m;i+=4){d[i]=s[parseInt(x[i])];d[i+1]=s[parseInt(x[i+1])];d[i+2]=s[parseInt(x[i+2])];d[i+3]=s[parseInt(x[i+3])];}for(i=m;i<m+n%4;i++)d[i]=s[parseInt(x[i])]; };
    RTMKS.vindex_u32 = function(s,x,d,n) { var i,m=n-(n%4);for(i=0;i<m;i+=4){d[i]=s[x[i]];d[i+1]=s[x[i+1]];d[i+2]=s[x[i+2]];d[i+3]=s[x[i+3]];}for(i=m;i<m+n%4;i++)d[i]=s[x[i]]; };
    
    RTMKS.vsmul    = function(s,x,d,n) { var i,m=n-(n%4);for(i=0;i<m;i+=4){d[i]=s[i]*x;d[i+1]=s[i+1]*x;d[i+2]=s[i+2]*x;d[i+3]=s[i+3]*x;}for(i=m;i<m+n%4;i++)d[i]=s[i]*x; };
    RTMKS.vfill    = function(x,d,o,n) { var i,m=(o+n)-((o+n)%4);for(i=o;i<m;i+=4){d[i]=x;d[i+1]=x;d[i+2]=x;d[i+3]=x;}for(i=m;i<m+n%4;i++)d[i]=x; };
    RTMKS.RoundToD = function(x,d)     { return Math.round(x*Math.pow(10.0,d))/Math.pow(10.0,d); };

    return RTMKS;
})();