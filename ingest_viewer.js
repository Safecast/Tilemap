// ==============================================
// Safecast Ingest Viewer
// ==============================================
// Nick Dolezal/Safecast, 2017
// This code is released into the public domain.
// ==============================================

// =================================
// Requirements (Files):
// =================================
// 1. ingest_viewer_min.js             (this file)



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
// var  = new IngestViewer(map);
//
// Instantiate will auto-initialize and start polling.





// Ingest Viewer - Main
// Contains all useful instances of other objects and UI event handling.
// Messy and too broad but hey.

// NOTE: In most cases, null should be passed for "dataBinds".
//       Only override this if you want to set custom styles or image/worker filepaths.

var IngestViewer = (function()
{
    function IngestViewer(map)
    {
        this.mapRef    = map;
        this.isMobile  = _IsPlatformMobile();
        this.mks       = null; // marker manager
        this.failures  = 0;
        this.fail_max  = (86400 * 365) / 600;
        this.last_tx   = 0;
        this.enabled   = true;
        this.int_up    = null;
        this.dev_test  = false;
        
        this.Init();
    }//IngestViewer
    
    
    
    // =======================================================================================================
    //                                      Mandatory Initialization
    // =======================================================================================================

    IngestViewer.prototype.Init = function()
    {
        this.Init_DevTestMode();
        this.Init_IngestMarkers();
        //this.InitMarkersAsync();

        this.SetEnabled(true);

        //this.InitConnectionWatchdog();
    };

    IngestViewer.prototype.Init_DevTestMode = function()
    {
        var dev_test_str = _GetParam("dev_test");

        if (dev_test_str != null && dev_test_str.length > 0)
        {
            this.dev_test = parseInt(dev_test_str) == 1;

            if (this.dev_test)
            {
                console.log("IngestViewer: dev_test mode temporarily set from querystring.  To return to normal (production) view, reload the page without dev_test=1 in the querystring.");
            }//if
        }//if
    };

    IngestViewer.prototype.Init_IngestMarkers = function()
    {
        //var rs = IngestIcon.RenderStyle.DoubleTriangle;

        this.mks = new IngestMarkers(this.mapRef, window.devicePixelRatio, this.isMobile, "opc_pm02_5");//, rs);
    };
    
    IngestViewer.prototype.InitMarkersAsync = function()
    {
        //var pre = window.location.href.substring(0,5) == "https" ? "https://" : "http://";
        //var url = pre + "safecast.org/tilemap/test2/ingest-test.json";
        var url = this.GetJsonUrl();
        this.GetJSONAsync(url);
    };
    
    IngestViewer.prototype.InitConnectionWatchdog = function()
    {
        setTimeout(function() {
            this.ConnectionWatchdog();
        }.bind(this), 10 * 60 * 1000);
    };

    IngestViewer.prototype.GetJsonUrl = function()
    {
        return !this.dev_test ? "https://s3-us-west-2.amazonaws.com/safecastdata-us-west-2/ingest/prd/json/view24h.json"
                              : "https://s3-us-west-2.amazonaws.com/safecastdata-us-west-2/ingest/prd/json/view24h_devtest.json";
    };


    // =======================================================================================================
    //                            Event handlers - abstracted download methods
    // =======================================================================================================

    // Some network failures that break the auto-refresh do not appear to raise an event,
    // so this serves as a failsafe for those cases.
    //
    IngestViewer.prototype.ConnectionWatchdog = function()
    {
        if (Date.now() - this.last_tx > 20 * 60 * 1000)
        {
            console.log("IngestViewer.prototype.ConnectionWatchdog: >20 mins since last connection attempt, restarting connection...");
            this.InitMarkersAsync();
        }//if
        
        setTimeout(function() {
            this.ConnectionWatchdog();
        }.bind(this), 10 * 60 * 1000);
    };

    IngestViewer.prototype.GetJSONAsync = function(url)
    {
        // 2016-08-14 ND: Fix for not being able to disable via UI due to timer polling.
        //                This keeps timers running, but simply does a no-op.
        /*
        if (!this.enabled)
        {
            setTimeout(function() {
                this.last_tx = Date.now();
                this.GetJSONAsync(url);
            }.bind(this), 60 * 1000);
                
            return;
        }//if
        */

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
                    console.log("IngestViewer: JSON parsing exception.");
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
                console.log("IngestViewer.GetJSONAsync: Error getting sensors from URL: %s", url);
            }//if

            var after_ms = (success ? 60 : 600) * 1000; // 1 min normally, 10 mins on failure

            /*
            if (this.failures < this.fail_max)
            {
                setTimeout(function() {
                    this.last_tx = Date.now();
                    this.GetJSONAsync(url);
                }.bind(this), after_ms);
            }//if
            */
        }.bind(this);

        _GetAsync_HTTP(url_nocache, null, null, cb, null);
    };
    
    // =======================================================================================================
    //                                      Event handlers - UI
    // =======================================================================================================
    
    IngestViewer.prototype.ClearGmapsListeners = function()
    {
        this.mks.ClearGmapsListeners();
    };
    
    IngestViewer.prototype.AddGmapsListeners = function()
    {
        this.mks.AddGmapsListeners(); // only needed if they are manually removed.
    };
    
    IngestViewer.prototype.RemoveAllMarkersFromMapAndPurgeData = function()
    {
        this.mks.RemoveAllMarkersFromMapAndPurgeData();
    };
    
    IngestViewer.prototype.GetMarkerCount = function()
    {
        return this.mks == null || this.mks.vals == null ? 0 : this.mks.vals.length;
    };

    IngestViewer.prototype.GetEnabled = function()
    {
        return this.enabled;
    };

    IngestViewer.prototype.SetEnabled = function(v)
    {
        if (v && this.int_up == null)
        {
            this.AddGmapsListeners();

            var fx = function()
            {
                this.InitMarkersAsync();
            }.bind(this);

            fx();

            this.int_up = setInterval(fx, 5 * 60 * 1000);
        }//if
        else if (!v && this.int_up != null)
        {
            clearInterval(this.int_up);
            this.int_up = null;
            this.RemoveAllMarkersFromMapAndPurgeData();
            this.ClearGmapsListeners();
        }//else

        this.enabled = v;
    };

    IngestViewer.prototype.GetUnit = function()
    {
        return this.mks == null ? null : this.mks.GetUnit();
    };

    IngestViewer.prototype.GetUnits = function(cb)
    {
        return this.mks == null ? null : this.mks.GetUnits(cb);
    };

    IngestViewer.prototype.SetUnit = function(unit)
    {
        if (this.mks != null) this.mks.SetUnit(unit);
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
                console.log("IngestViewer _GetAsync_HTTP: req.readyState == 4, req.status == %d.  Retrying.", req.status);
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


    return IngestViewer;
})();












// RTLUT: contains color lookup table and returns RGB colors for a numeric value.

var IngestLUT = (function()
{
    function IngestLUT(min, max, lut_id, scale_type_id)
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
    
    IngestLUT.prototype.GetRgbForIdx = function(i)
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

    IngestLUT.prototype.GetIdxForValue = function(x, rsn)
    {
        x = (x - this.min) * this.rdiff;
        if (x > 1.0) x = 1.0; else if (x < 0.0) x = 0.0;
    
        switch (this.scale_type_id)
        {
            case IngestLUT.ScaleType.LOG10:
                x = _ScaleNormValueLOG10(x);
                break;
            case IngestLUT.ScaleType.LN:
                x = _ScaleNormValueLN(x);
                break;
            case IngestLUT.ScaleType.NasaPm25:
                x = _ScaleNormValueNasaPm25(x);
                break;
        }//switch
        
        if (x > 1.0) x = 1.0; else if (x < 0.0) x = 0.0;
        
        var i = parseInt(x * this.nsb1);
        return rsn > 0 ? (i >>> rsn) << rsn : i;
    };

    IngestLUT.prototype.GetRgbForValue = function(x, rsn)
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
        
        for (var i=0; i<IngestLUT.LUTs.length; i++)
        {
            if (IngestLUT.LUTs[i][0] == table_id)
            {
                row = IngestLUT.LUTs[i];
                break;
            }//if
        }//for
        
        if (row != null)
        {
            rgb = _GetTypedArraysForHexStringLUT(row[13]);
        }//if
        
        return rgb;
    };

    IngestLUT.LUTs = 
    [
        [13,14,"Cherenkov","GB",1,1,1,1,1,1,0,0.0,0.0,"0000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000003060A0D1114181B1F2226292D3034373B3E4245494C4F53565A5D6164686B6F7276797D8084878B8E9295999A9C9EA0A2A4A5A7A9ABADAFB1B2B4B6B8BABCBEBFC1C3C5C7C9CBCCCED0D2D4D6D8D9DBDDDFE1E3E5E6E8EAECEEF0F2F3F5F7F9FBFDFD0001030507090B0D0F11121416181A1C1E2022232527292B2D2F31333436383A3C3E4042444547494B4D4F51535556585A5C5E6062646667696B6D6F71737577797B7D7F81838587898B8D8F91939597999A9B9D9E9FA1A2A3A5A6A7A9AAABADAEAFB1B2B3B5B6B7B9BABBBDBEBFC1C2C3C5C6C7C9CACCCDCED0D1D2D4D5D6D8D9DADCDDDEE0E1E2E4E5E6E8E9EAECEDEEF0F1F2F4F5F6F8F9FAFCFDFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFF66686B6E717477797C7F8285888A8D909396999B9EA1A4A7AAACAFB2B5B8BBBDC0C3C6C9CCCED1D4D7DADDDFE2E5E8EBEEF0F3F6F9FCFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFF"],
        [20,5,"Blue Red Blended","FLIR",1,1,1,1,1,1,0,0.0,0.0,"0D0D0D0C0C0C0C0C0C0C0C0C0B0B0B0B0B0C0C0D0D0D0D0D0D0D0E0E0E0E0E0E0E0F0F10101010101111121313141415151516161718181818191A1C1D1E1F202021222324252627292A2B2C2E2F303133343637393A3B3D3E4042444647484A4C4F51535557595B5D5F61636567696B6D6F727577797C7E80828486898C8E9092959698999C9EA1A3A5A8AAADAFB1B3B5B7BABCBEC0C2C4C7C9CBCDCFD1D3D5D6D9DADCDDDFE1E2E4E6E7E9EAEBEDEEEFF0F1F1F2F3F3F4F5F6F7F7F8F8F8F8F8F7F7F6F6F5F5F5F4F4F4F3F3F2F2F2F1F0EEEDECEBE9E7E6E5E4E2E1DFDDDCDBDAD8D7D6D4D3D1CFCDCAC8C6C4C2C0BEBCBAB8B6B3B1AFADAAA8A6A3A2A09E3F3F404143444647494B4C4E4F5153545657595B5D5F61636567696B6D6F71737577797B7C7D7F80828486888A8C8E90929597999C9EA0A2A4A7A9ABADAFB1B3B5B7B9BBBDBFC1C3C5C7C9CBCDCED0D1D3D4D6D7D9DBDCDDDFE0E1E3E4E5E6E7E8E8E9E9EAEAEAEBEBECEDEDEEEEEEEFEFEFEFEEEEEDEDECECEBEBEAE9E9E8E7E7E6E6E5E5E3E2E1DFDEDCDBD9D8D7D5D4D2D0CFCFCDCBC8C7C5C3C0BEBCBAB8B5B3B1AFADABA9A6A4A2A19E9B9794928F8D8B89878583807E7C7A77757371706E6C6A68666462605E5C5A58565452504E4D4C4A484745444341403F3D3C3B3938373635333231302F2E2D2C2C2B29282726252423222120201F1E1E1D1D1D1DE1E2E3E4E5E7E9EAEBEDEEF0F1F3F4F5F6F7F7F8F9F9FAFAFAFAFBFBFCFCFCFDFDFDFDFDFDFDFCFCFBFAFAF9F8F7F6F6F5F4F4F3F2F1EFEEEDEBEAE8E7E4E2E1E0DDDCDAD9D7D6D4D1CFCDCBC9C7C4C2C0BDBAB7B5B3B1AEACA9A6A4A29F9C9A979593918F8C8A8783817F7D7B797674716F6C6A68666462605E5C5A575553504E4C4B494846454342403E3D3C3A3837353331302E2D2B2A28272625242321201F1E1D1C1B1A19181716151413121211111010100F0E0E0D0D0C0C0B0B0B0A0A0A0A0A090909080808080707070606060607070707070706060606070707070707070707070708080807070707070808080808080808080808090909090A0A0A"],
        [30,0,"Cyan Halo","GB",1,1,1,1,1,1,0,0.0,0.0,"0108090A0C0E10101212131415161618181919191A1A1A1A191A1B1A191A1A181819181515151110090700070F171C202226282B2D2E323336373838383A3B3B3B3B3B3B3B3B393838383633302D2B2725211D170A001D273C43545A61696E787C85898F9499A1A3ABADB2B5B9BFC2C8CAD0D2D6D9DCE1E2E9EBF0F2F5F9FBFEFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFF010707080A0B0C0C0D0D0D0D0E0E0E0F0F0F0F0F0F0F0F0F0F0F0F0F0F0E0E0E0E0D0D0C0B0B0A0905040009131E242B2E383B41464A52555E60676B70767982848C90969CA0A7AAB5B8BFC3C8D0D5DDE0E9EDF3FAFFFCFBF2F0EBE7E2DDDBD4D2CCCAC5C0BBB6B4ACAAA3A09C97948986807C75706B646157534740382C2605000000000000000000000000000000000000000000000000000000000000000000000000000000000000000B19242A3539444951555960626A6D777B8085889092999CA2A6AAB4B7BFC1C8CCD0D6D9E0E2EAEFF7FBFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFF010A0C0F13171D1F26272B30363B3D46484F53595E636D707A7D878C91999EA9ADBABFC7CED4DFE4EFF4FFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFEF7F2EAE3DDD3CFC4C0B7B3AEA6A19A978C88807B77716F66645E58514B48413F37342F2A26201D120D0000000000000000000000000000000000000000000000000000000000000000000000000000000000000000080A14171F24292F333E414A4E545A5E6669737680858A91949D9FA8ACB3BABFC6CAD3D7DEE2E8EEF2FD"],
        [32,8,"Jet","MATLAB",  1,1,1,1,1,1,0,0.0,0.0,"000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000103080C0F12181C1F232A2D3033393C3F42484C4F52585C5F646A6D70737A7D8083898C8F92989C9FA2A8ACAFB4BABDC0C3CACDD0D3D9DCDFE2E8ECEFF4FAFCFDFEFEFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFEFEFEFDFCF9F3F0EDEAE4DFDCD8D2CFCCC9C3C0BDBAB3B0ADAAA49F9C98928F8C8882807F7F00000000000000000000000000000000000000000000000000000000000001040A0D1013191C1F22282C2F32383C3F444A4D50535A5D6063696C6F72787C7F848A8E90949A9DA0A3A9ACAFB2B8BCBFC2C8CCCFD4DADDE0E3EAEDF0F3F9FBFDFEFEFEFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFEFEFEFDFBF8F2EFECE9E3E0DDDAD3D0CDCAC4BFBCB8B2AFACA8A29F9C9993908D8A837F7C77716E6C68625F5C5953504D4A43403D3A342F2C28221F1C18120F0C090401000000000000000000000000000000000000000000000000000000000000000000008F8F9092989C9FA2A8ACAFB4BABDC0C3CACDD0D3D9DCDFE2E8ECEFF4FAFCFDFEFEFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFEFEFEFDFCF9F3F0EDEAE4DFDCD8D2CFCCC9C3C0BDBAB3B0ADAAA49F9C98928F8C88827F7C7973706D6A63605D5A544F4C48423F3C38322F2C2923201D1A130F0C0802010000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000"],
        [34,16,"Glowbow","FLIR",1,1,1,1,1,1,0,0.0,0.0,"00000306090C0F1315181B1E2225282C303336393B3E4144474B4F53585D6266696C6F7376797C808386898D909396999DA1A4A6A9ADB1B4B7BABCBFC2C6C9CBCBCCCDCFCFD0D0D0D1D2D3D3D4D6D7D7D8D9DADADADCDDDEDFE0E1E1E1E2E4E5E5E6E6E7E8E9EAECECECEDEDEEEFF0F1F2F3F4F4F5F5F5F7F8F9F9FAFAFBFCFCFCFCFCFDFDFCFCFCFCFCFCFCFCFCFDFDFDFDFDFDFDFDFDFDFDFCFCFCFCFCFCFCFCFCFCFCFDFDFDFDFDFDFDFDFDFDFDFDFCFCFCFCFCFCFCFCFDFDFDFDFDFDFDFCFCFCFCFDFDFDFDFDFDFDFCFCFCFCFDFDFDFDFDFDFCFCFCFCFCFCFCFCFDFDFDFCFCFCFCFDFDFCFCFCFCFCFDFDFDFDFDFDFDFDFDFDFDFDFDFDFDFDFCFCFCFCFDFE00000001010101010101020304040404040506060607080808080809090A0A0B0B0C0C0D0D0D0D0E0F0F0F0F0F0F10111111111112131414141414151515161718191A1C1D1E1E1E2021222324262728292B2C2C2C2E2F30313334353637393A3A3B3C3D3E404143434445454748494A4B4D4E4E4F51535353545657595A5A5B5E60626466686A6C6E7072747677797C7F80828486888A8C8D9092949597999B9D9EA1A3A5A7AAACADAFB1B3B5B7B9BBBDBFC0C2C4C7C9CACCCED1D3D5D7D9DADADADBDCDCDDDEDEDFDFDFDFE0E1E2E3E4E4E5E5E5E5E7E7E7E9EAEAEAEAECEDEDEDEEEFEFF0F0F1F1F1F2F3F4F4F5F5F5F6F7F7F8F9F9FAFAFBFCFDFDFEFEFE00000000000000020203030304040506070708090B0B0B0B0B0C0E0E0E0F111313131314141415171717181818191A1B1C1D1E1E1E1F2020202021222224252523222221212020201F1E1D1D1C1C1B1B1A19181818171615141414131312111111100E0E0E0D0C0C0C0C0B0B0A090806060606060504030303010000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000105080C1013171C2124272C3034373B4043464A4E53585D6063676B6F74787C7F83868A8E93979A9EA2A7ABAFB4B8BCBFC2C7CBCFD3D7DBDFE4E8ECEFF2F7FBFE"]
    ];

    IngestLUT.ScaleType =
    {
        LN: 0,
        LIN: 1,
        LOG10: 2,
        NasaPm25: 3
    };

    return IngestLUT;
})();





// ICO: Renders marker icon to ivar "this.url" as base64 png.
//      Can be retained in cache as rendering pngs is slow.
//      This is completely ignorant of retina displays.

var IngestIcon = (function()
{
    function IngestIcon(width, height, deg, val_rgba, online_rgba, min_rgba, max_rgba, render_style)//, fxCallback)
    {
        this.width       = width;
        this.height      = height;
        this.deg         = deg;
        this.val_rgba    = val_rgba;
        this.online_rgba = online_rgba;
        this.shd_r       = 0.0; // unsupported, but must be 0.0 for legacy calcs
        this.min_rgba    = min_rgba;
        this.max_rgba    = max_rgba;
        this.rstyle      = render_style;
        this.last_use    = Date.now();
        this.url         = null;
        
        //this.Render(fxCallback);
    }//IngestIcon

    IngestIcon.prototype.IsStale = function()
    {
        return Date.now() - this.last_use > 30.0 * 60.0 * 1000.0;
    };

    IngestIcon.prototype.UpdateLastUse = function()
    {
        this.last_use = Date.now();
    };

    var _ceq_rgba = function(a, b) 
    { 
        return (a==null && b==null) || (a!=null && b!=null && a.r==b.r && a.g==b.g && a.b==b.b && a.a==b.a);
    };

    IngestIcon.prototype.CompareToParams = function(width, height, deg, val_rgba, online_rgba, min_rgba, max_rgba, render_style)
    {
        return this.width  == width
            && this.height == height
            && this.deg    == deg
            && _ceq_rgba(this.val_rgba,    val_rgba)
            && _ceq_rgba(this.online_rgba, online_rgba)
            && _ceq_rgba(this.min_rgba,    min_rgba)
            && _ceq_rgba(this.max_rgba,    max_rgba)
            && this.rstyle == render_style;
    };


    IngestIcon.prototype.RenderComplete = function(fxCallback)
    {
        if (fxCallback != null)
        {
            fxCallback(this.url);
        }//if
    };


    var _RenderStatusCircle = function(ctx, ox, oy, outer_r, rgba, scale, is_online)
    {
        var c_green = "rgba(" + rgba.r + ", " + rgba.g + ", " + rgba.b + ", " + rgba.a + ")";

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
                    ctx.strokeStyle = "rgba(0,0,0," + rgba.a + ")";
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
                ctx.strokeStyle = "rgba(0,0,0," + rgba.a + ")";
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


    IngestIcon.prototype.Render = function(fxCallback)
    {
        if (this.rstyle == IngestIcon.RenderStyle.Dot)
        {
            this.RenderDot();
            this.RenderComplete(fxCallback);
            /*
            setTimeout(function() {
                this.RenderComplete(fxCallback);
            }.bind(this), 1);
            */
        }//if
        else if (this.rstyle == IngestIcon.RenderStyle.Chevron)
        {
            this.RenderChevron();
            this.RenderComplete(fxCallback);
            /*
            setTimeout(function() {
                this.RenderComplete(fxCallback);
            }.bind(this), 1);
            */
        }//else if
        else
        {
            this.RenderDoubleTriangle(fxCallback);
        }//else
    };


    IngestIcon.prototype.RenderDot = function()
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
        
        //var c_fill  = "rgba(" + this.val_rgba.r + ", " + this.val_rgba.g + ", " + this.val_rgba.b + ", " + this.val_rgba.a + ")";
        var c_fill = _make_css_rgba(this.val_rgba);
        
        // ------------------------ inner dot -------------------------------

        ctx.beginPath(); // fill with variable color
            ctx.arc(ox, oy, inner_r, 0, 2 * Math.PI);
            ctx.fillStyle = c_fill;
        ctx.fill();

        ctx.beginPath(); // stroke black outline
            ctx.arc(ox, oy, inner_r, 0, 2 * Math.PI);
            //ctx.strokeStyle = "rgba(0,0,0," + this.val_rgba.a + ")";
            ctx.strokeStyle = "rgba(0,0,0," + _get_effective_alpha(this.val_rgba) + ")";
            ctx.lineWidth   = w_px > 12 ? 1.5 * scale : 0.75 * scale;
        ctx.stroke();
        
        _RenderStatusCircle(ctx, ox, oy, outer_r, this.online_rgba, scale, this.online_rgba.r == 0);
        
        this.url = c.toDataURL("image/png");
    };


    IngestIcon.prototype.RenderChevron = function()
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
        
        //var c_fill  = "rgba(" + this.val_rgba.r + ", " + this.val_rgba.g + ", " + this.val_rgba.b + ", " + this.val_rgba.a + ")";
        var c_fill = _make_css_rgba(this.val_rgba);
        
        _RenderStatusCircle(ctx, ox, oy, outer_r, this.online_rgba, scale, this.online_rgba.r == 0);
        

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
            //ctx.strokeStyle = "rgba(0,0,0," + this.val_rgba.a + ")";
            ctx.strokeStyle = "rgba(0,0,0," + _get_effective_alpha(this.val_rgba) + ")";
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

    var _make_css_rgba = function(rgba)
    {
        if (rgba == null) return "rgba(0,0,0,0)";
        
        return  "rgba(" + (rgba.r == null ? "0" : rgba.r.toFixed(0))
                + ", "  + (rgba.g == null ? "0" : rgba.g.toFixed(0))
                + ", "  + (rgba.b == null ? "0" : rgba.b.toFixed(0))
                + ", "  + (rgba.a == null 
                        || rgba.r == null 
                        || rgba.g == null 
                        || rgba.b == null ? "0" : rgba.a.toFixed(2))
                + ")";
    };

    var _get_effective_alpha = function(rgba)
    {
        if (rgba == null) return 0.0;
        //return rgba.a == null ? 0.0 : rgba.a; // this for rendering empty triangle outlines
        return rgba.r == null || rgba.g == null || rgba.b == null || rgba.a == null ? 0.0 : rgba.a;
    };

    IngestIcon.prototype.RenderDoubleTriangle = function(fxCallback)
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

        var c_fill     = _make_css_rgba(this.val_rgba);
        var c_fill_min = _make_css_rgba(this.min_rgba);
        var c_fill_max = _make_css_rgba(this.max_rgba);
        
        //console.log("IngestIcon.RenderDoubleTriangle: c_fill    =[%s]", c_fill);
        //console.log("IngestIcon.RenderDoubleTriangle: c_fill_min=[%s]", c_fill_min);
        //console.log("IngestIcon.RenderDoubleTriangle: c_fill_max=[%s]", c_fill_max);

        _RenderStatusCircle(ctx, ox, oy, outer_r, this.online_rgba, scale, this.online_rgba.r == 0);
        
        // ---------------------- triangles ----------------------------
        
        oy  = Math.max(0, h_add) >> 1;
        oy += 4.0 * scale;
        
        var length   = w_px - 4.0 * scale * 2.0; // scale * 1.5 = best for double triangle, scale * 2.0 = best for triple
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
            ctx.strokeStyle = "rgba(0,0,0," + _get_effective_alpha(this.max_rgba) + ")";
            ctx.lineWidth   = Math.max(1.5 * scale, 1.5);
            ctx.moveTo(x0, y0);                     // bottom-right corner
            ctx.lineTo(ox, oy + scale * 4.0 * 0.5); // top-center
            ctx.lineTo(x1, y1);                     // bottom-left corner
            ctx.closePath();
        ctx.stroke();

        // inner filled color chevron
        ctx.beginPath();
            ctx.fillStyle = c_fill_max;
            ctx.moveTo(x0, y0);                      // bottom-right corner
            ctx.lineTo(ox, oy + scale * 4.0 * 0.5);  // top-center
            ctx.lineTo(x1, y1);                      // bottom-left corner
        ctx.fill();
        
        
        
        
        oy += tri_h * 1.0;
        y0 += tri_h * 1.0;
        y1 += tri_h * 1.0;
        
        ctx.beginPath();
            ctx.strokeStyle = "rgba(0,0,0," + _get_effective_alpha(this.min_rgba) + ")";
            ctx.lineWidth   = Math.max(1.5 * scale, 1.5);
            ctx.moveTo(x0, y0);                     // bottom-right corner
            ctx.lineTo(ox, oy + scale * 4.0 * 0.5); // top-center
            ctx.lineTo(x1, y1);                     // bottom-left corner
            ctx.closePath();
        ctx.stroke();

        // inner filled color chevron
        ctx.beginPath();
            ctx.fillStyle = c_fill_min;
            ctx.moveTo(x0, y0);                      // bottom-right corner
            ctx.lineTo(ox, oy + scale * 4.0 * 0.5);  // top-center
            ctx.lineTo(x1, y1);                      // bottom-left corner
        ctx.fill();
        
        
        
        

        ctx.beginPath();
            ctx.strokeStyle = "rgba(0,0,0," + _get_effective_alpha(this.val_rgba) + ")";
            ctx.lineWidth   = Math.max(1.5 * scale, 1.5);
            ctx.moveTo(x0, y0_2);                     // bottom-right corner
            ctx.lineTo(ox, oy_2 + scale * 4.0 * 0.5); // top-center
            ctx.lineTo(x1, y1_2);                     // bottom-left corner
            ctx.closePath();
        ctx.stroke();

        // inner filled color chevron
        ctx.beginPath();
            ctx.fillStyle = c_fill;
            ctx.moveTo(x0, y0_2);                     // bottom-right corner
            ctx.lineTo(ox, oy_2 + scale * 4.0 * 0.5); // top-center
            ctx.lineTo(x1, y1_2);                     // bottom-left corner
        ctx.fill();

        this.url = c.toDataURL("image/png");
        
        var img = document.createElement("img");
        
        img.onload = function()
        {
            ctx.clearRect(0,0,c.width,c.height);
            ctx.save();
            ctx.translate(c.width/2, c.height/2);
            ctx.rotate(this.deg*Math.PI/180);
            ctx.drawImage(img,-img.width/2,-img.width/2);
            
            this.url = c.toDataURL("image/png");
            
            ctx.restore();

            this.RenderComplete(fxCallback);
        }.bind(this);
        
        img.src = this.url;
    };


    IngestIcon.RenderStyle =
    {
        Dot: 0,
        Chevron: 1,
        DoubleTriangle: 2
    };

    return IngestIcon;
})();


































































// IngestMarkers: Marker manager

var IngestMarkers = (function()
{
    function IngestMarkers(mapRef, pxScale, isMobile, selected_unit)//, render_style)
    {
        this.selected_unit = selected_unit;
        this.json    = null;
        
        this.isMobile = isMobile; // Disables some caching and renders less markers per pass.
        
        //this.render_style = render_style;
        
        this.pxScale  = pxScale == null || pxScale < 1.0 ? 1.0 : pxScale;
        //this.width    = 40;             // Marker icon width, in non-retina pixels
        //this.height   = 40;             // Marker icon height, in non-retina pixels
        this.alpha0   = 1.0;            // Marker icon fill alpha, [0.0 - 1.0]
        this.alpha1   = 1.0;            // Maker icon stroke alpha, [0.0 - 1.0]
        this.shd_r    = 0.0;            // Marker icon shadow radius, pixels.
        this.icons    = new Array();
        
        this.lut_rsn  = 2;                       // 256 >> 128 >> 64 colors
                                                 // The LUT gets the RGB values for a value.
        this.pmx_lut  = new IngestLUT(  0.00,  80.000, 20, IngestLUT.ScaleType.LN); //32  // NASA PM map = max 80
        this.rad_lut  = new IngestLUT(  0.03,  65.535, 30, IngestLUT.ScaleType.LOG10);
        this.tmp_lut  = new IngestLUT(-10.00,  60.000, 34, IngestLUT.ScaleType.LIN);
        this.rhp_lut  = new IngestLUT(  0.00, 200.000, 13, IngestLUT.ScaleType.LIN);

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
        this.last_z  = 0;

        this.ext_queue = new Array();

        this.last_icon_purge = Date.now();
        
        this.AddGmapsListeners();
    }//IngestMarkers

    IngestMarkers.prototype.GetUnits = function(cb)
    {
        var fx = function()
        {
            cb(this._GetUnits());
        }.bind(this);

        if (this.json != null)
        {
            fx();
        }//if
        else
        {
            this.ext_queue.push(fx);
        }//else
    };

    IngestMarkers.prototype._ProcessExtQueue = function()
    {
        for (var i=0; i<this.ext_queue.length; i++)
        {
            this.ext_queue[i]();
        }//for

        this.ext_queue = new Array();
    };

    IngestMarkers.prototype._GetCurrentVisibleExtent = function()
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

    

    IngestMarkers.prototype.PurgeData = function()
    {
        this.json  = null;
        this.icons = new Array();
    };

    IngestMarkers.prototype.RemoveAllMarkersFromMapAndPurgeData = function()
    {
        this.RemoveAllMarkersFromMap();
        this.PurgeData();
    };

    IngestMarkers.prototype.RemoveAllMarkersFromMap = function()
    {
        for (var i=0; i<this.markers.length; i++)
        {
            google.maps.event.clearInstanceListeners(this.markers[i]);
            this.markers[i].setMap(null);
        }//for
        
        this.markers = new Array();
    };
    
    IngestMarkers.prototype.ClearGmapsListeners = function()
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
    
    IngestMarkers.prototype.AddGmapsListeners = function()
    {
        if (this.mapref == null) return;
        
        var fxRefresh = function(e) { this.RescaleIcons(); this.PurgeStaleIconCache(); }.bind(this);
        
        if (this.zoomlistener == null)
        {
            this.zoomlistener = google.maps.event.addListener(this.mapref, "zoom_changed", fxRefresh);
        }//if
        
        if (this.draglistener == null)
        {
            //this.draglistener = google.maps.event.addListener(this.mapref, "dragend", fxRefresh);
        }//if
    };



    IngestMarkers.prototype.UpdateIconsForMarkers = function()
    {
        this.RemoveAllMarkersFromMap();
        this.AddMarkersToMap();
    };


    IngestMarkers.prototype.RescaleIcons = function()
    {
        if (this.mapref == null || this.markers.length == 0) return;
        
        var z = this.mapref.getZoom();
        
        if (   7 < z && z < 13
            && 7 < this.last_z && this.last_z < 13
            && z > this.last_z) // 2016-12-01 ND: for lazy extent-based updates
        {
            this.last_z = z;
            return;
        }//if
        
        this.UpdateIconsForMarkers();
        this.last_z = z;
    };

    IngestMarkers.prototype.PurgeStaleIconCache = function()
    {
        if (Date.now() - this.last_icon_purge > 30.0 * 60.0 * 1000.0)
        {
            var d = new Array();
            var debug0 = this.icons.length;

            for (var i=0; i<this.icons.length; i++)
            {
                if (!this.icons[i].IsStale())
                {
                    d.push(this.icons[i]);
                }//if
            }//if

            this.icons           = d;
            this.last_icon_purge = Date.now();

            if (debug0 != this.icons.length)
            {
                console.log("IngestMarkers.PurgeStaleIconCache: %d -> %d icons (-%d stale)", debug0, this.icons.length, debug0 - this.icons.length);
            }//if
        }//if
    };


    IngestMarkers.prototype.UpdateIconsForData = function()
    {
        if (this.mapref == null || this.markers.length == 0) return;
        
        this.UpdateIconsForMarkers();
    };


    IngestMarkers.prototype.IsSensorOffline = function(idx)
    {
        return _GetIsOfflineForAllUnitsHourly(this.json[idx].data, this.create_ss);
        //return _GetIsLatestValueNullForAnyUnitHourly(this.json[idx].data);
    };

    IngestMarkers.prototype.SetUnit = function(unit)
    {
        var exists = false;

        if (this.json != null)
        {
            var units  = this._GetUnits();
            
            for (var i=0; i<units.length; i++)
            {
                if (units[i].unit == unit)
                {
                    exists = true;
                    break;
                }//if
            }//for
        }//if

        if (exists || this.json == null)
        {
            this.selected_unit = unit;

            if (this.json != null)
            {
                this.RefreshSensorDataFromJson(this.json, true);
            }//if
        }//if
    };

    IngestMarkers.prototype.GetUnit = function()
    {
        return this.selected_unit;
    };

    IngestMarkers.prototype._GetUnits = function()
    {
        return _GetDistinctUnitList(this.json);
    };

    /*
[
  {
    "lat": 46.554728888885,
    "lon": 15.635604858398,
    "data": [
      {
        "unit": "pms_pm10_0",
        "ui_display_unit": "Plantower PM 10.0 \u03bcg\/m\u00b3",
        "ui_display_category_id": 2,
        "time_series": [
          {
            "start_date": "2017-02-16T00:00:00Z",
            "end_date": "2017-03-17T03:16:46Z",
            "start_epoch_timepart": 17213,
            "end_epoch_timepart": 17242,
            "ss_per_epoch_timepart": 86400,
            "is_offline": true,
            "max": 149,
            "min": 1,
            "value_newest": 2,
            "values": [
              149,
    */

    var _GetDistinctUnitList = function(json)
    {
        var units = new Array();

        for (var i=0; i<json.length; i++)
        {
            for (var j=0; j<json[i].data.length; j++)
            {
                var exists = false;

                for (var k=0; k<units.length; k++)
                {
                    if (units[k].unit == json[i].data[j].unit)
                    {
                        units[k].n++;
                        exists = true;
                        break;
                    }//if
                }//for

                if (!exists)
                {
                    units.push( {                     unit : json[i].data[j].unit,  
                                     ui_display_unit_parts : json[i].data[j].ui_display_unit_parts,  
                                    ui_display_category_id : json[i].data[j].ui_display_category_id,
                                                         n : 0 } );
                }//if
            }//for
        }//for

        // hack: fix the count as it will be doubled from hour + day time series
        for (var i=0; i<units.length; i++)
        {
            units[i].n >>>= 1;
        }//for

        units = _SortByUnit(units);

        return units;
    };


    var _GetUnitsAndTimeSeriesList = function(data_node)
    {
        var d = new Array();

        for (var i=0; i<data_node.length; i++)
        {
            for (var j=0; j<data_node[i].time_series.length; j++)
            {
                d.push( {                   unit : data_node[i].unit, 
                           ui_display_unit_parts : data_node[i].ui_display_unit_parts, 
                          ui_display_category_id : data_node[i].ui_display_category_id, 
                            start_epoch_timepart : data_node[i].time_series[j].start_epoch_timepart,
                              end_epoch_timepart : data_node[i].time_series[j].end_epoch_timepart,
                           ss_per_epoch_timepart : data_node[i].time_series[j].ss_per_epoch_timepart } );
            }//for
        }//for

        return d;
    };

    var _GetUnitNodeForUnit = function(data_node, unit)
    {
        var d = null;

        for (var i=0; i<data_node.length; i++)
        {
            if (data_node[i].unit == unit)
            {
                d = data_node[i];
            }//if
        }//for

        return d;
    };

    var _GetUiDisplayUnitAndCategoryIdForUnit = function(data_node, unit)
    {
        var u = _GetUnitNodeForUnit(data_node, unit);
        return u == null ? null : { ui_display_unit_parts:u.ui_display_unit_parts, ui_display_category_id:u.ui_display_category_id };
    };

    var _GetTimeSeriesNodeForUnit = function(data_node, unit, ss_per_epoch_timepart)
    {
        var d = null;

        for (var i=0; i<data_node.length; i++)
        {
            if (data_node[i].unit == unit)
            {
                for (var j=0; j<data_node[i].time_series.length; j++)
                {
                    if (data_node[i].time_series[j].ss_per_epoch_timepart == ss_per_epoch_timepart)
                    {
                        d = data_node[i].time_series[j];
                        break;
                    }//if
                }//for
            }//if
        }//for

        return d;
    };

    var _GetTimeSeriesDataForUnit = function(data_node, unit, ss_per_epoch_timepart)
    {
        var d = _GetTimeSeriesNodeForUnit(data_node, unit, ss_per_epoch_timepart);
        return d == null ? null : d.values;
    };




    var _GetLastTwoNonNullValuesFromArray = function(s)
    {
        if (s == null) return { a:null, b:null };

        var d0 = null;
        var d1 = null;
        var f  = false;

        for (var i=s.length-1; i>=0; i--)
        {
            if (s[i] != null)
            {
                if (!f)
                {
                    d0 = s[i];
                    f  = true;
                }//if
                else
                {
                    d1 = s[i];
                    break;
                }//else
            }//if
        }//for

        return { a:d0, b:d1 };
    };


    var _GetChangeRateNormalizedFromArray = function(s)
    {
        var v = _GetLastTwoNonNullValuesFromArray(s);

        return v.a == null || v.b       == null ?  0.0 
             : v.a ==  0.0 && v.b - v.a  <  0.0 ? -1.0 
             : v.a ==  0.0 && v.b - v.a  >  0.0 ?  1.0 
             : v.a ==  0.0 && v.b       ==  0.0 ?  0.0
             :                                     (v.b - v.a) / v.a;
    };



    var _GetIsOfflineForAllUnitsHourly = function(data_node, compare_ss)
    {
        var d = true;
        var t = 120.0 * 60.0 * 1000.0;
        var m = compare_ss * 1000.0;

        for (var i=0; i<data_node.length; i++)
        {
            for (var j=0; j<data_node[i].time_series.length; j++)
            {
                if (    data_node[i].time_series[j].ss_per_epoch_timepart == 3600
                    &&  (data_node[i].time_series[j].values[data_node[i].time_series[j].values.length - 1] != null
                     ||  data_node[i].time_series[j].values[data_node[i].time_series[j].values.length - 2] != null))
                    //&& (!data_node[i].time_series[j].is_offline
                    //    || m - Date.parse(data_node[i].time_series[j].end_date) > t))
                {
                    d = false;
                    break;
                }//if
            }//for
        }//for

        return d;
    };




    var _GetLatestValueForUnitHourly = function(data_node, unit)
    {
        var n = _GetTimeSeriesNodeForUnit(data_node, unit, 3600);
        return n != null ? n.value_newest : null;
    };


    var _GetMaxValueForUnitHourly = function(data_node, unit)
    {
        var n = _GetTimeSeriesNodeForUnit(data_node, unit, 3600);
        return n != null ? n.max : null;
    };


    var _GetMinValueForUnitHourly = function(data_node, unit)
    {
        var n = _GetTimeSeriesNodeForUnit(data_node, unit, 3600);
        return n != null ? n.min : null;
    };


    var _GetChangeRateForUnitHourly = function(data_node, unit)
    {
        var vs = _GetTimeSeriesDataForUnit(data_node, unit, 3600);
        return _GetChangeRateNormalizedFromArray(vs);
    };

    var _GetMaxValueForUnitDaily = function(data_node, unit)
    {
        var n = _GetTimeSeriesNodeForUnit(data_node, unit, 86400);
        return n != null ? n.max : null;
    };

    var _GetMinValueForUnitDaily = function(data_node, unit)
    {
        var n = _GetTimeSeriesNodeForUnit(data_node, unit, 86400);
        return n != null ? n.min : null;
    };

    var _GetMaxValueForUnitHourlyDaily = function(data_node, unit)
    {
        var m0 = _GetMaxValueForUnitHourly(data_node, unit);
        var m1 = _GetMaxValueForUnitDaily(data_node, unit);

        return m0 == null && m1 == null ? null
             : m0 == null && m1 != null ? m1
             : m0 != null && m1 == null ? m0
             : Math.max(m0, m1);
    };

    var _GetMinValueForUnitHourlyDaily = function(data_node, unit)
    {
        var m0 = _GetMinValueForUnitHourly(data_node, unit);
        var m1 = _GetMinValueForUnitDaily(data_node, unit);

        return m0 == null && m1 == null ? null
             : m0 == null && m1 != null ? m1
             : m0 != null && m1 == null ? m0
             : Math.min(m0, m1);
    };

    // translate normalized rate of change [-1 ... +1] to degrees [0 ... 180], rounded to nearest 5 degrees
    var _GetDegForNormRate = function(r)
    {
        var d = 90.0 - r * 90.0;
        // | rate |   deg  |    desc    |    arrow    |
        // | -----|--------|------------|-------------|
        // |  1.0 |    0.0 |        inc |          up |
        // |  0.0 |   90.0 |       same |       right |
        // | -1.0 |  180.0 |        dec |        down |
        d = Math.min(d, 180.0);
        d = Math.max(d,   0.0);
        d = Math.round(d/5.0)*5.0;  // round to nearest x degree "tick"
        d = d == 0 ? 360 : d;       // degrees=0 causes problems with rendering
        return d;
    };

    var _HasUnitHourly = function(data_node, unit)
    {
        var n = _GetTimeSeriesNodeForUnit(data_node, unit, 86400);
        return n != null;
    };

    IngestMarkers.prototype.GetDerivedValuesFromJsonForUnitHourly = function(json, json_idx, unit)
    {
        var  ut = _GetUnitChartProp(this.selected_unit, "unit_type", 1);
        var val = _GetLatestValueForUnitHourly(json[json_idx].data, unit);
        var min = _GetMinValueForUnitHourly(json[json_idx].data, unit);
        var max = _GetMaxValueForUnitHourly(json[json_idx].data, unit);
        var deg = _GetDegForNormRate(_GetChangeRateForUnitHourly(json[json_idx].data, unit));
        var off = _GetIsOfflineForAllUnitsHourly(json[json_idx].data, this.create_ss);

        var lut_idx_val = val == null ? null : this.GetIdxFromLutForUnitType(val, ut, this.lut_rsn);
        var lut_idx_min = min == null ? null : this.GetIdxFromLutForUnitType(min, ut, this.lut_rsn);
        var lut_idx_max = max == null ? null : this.GetIdxFromLutForUnitType(max, ut, this.lut_rsn);

        return { deg:deg, is_offline:off, lut_idx_val:lut_idx_val, lut_idx_min:lut_idx_min, lut_idx_max:lut_idx_max };
    };


    IngestMarkers.prototype.AddMarkersToMap = function()
    {
        if (this.json == null) return;
        
        for (var i=0; i<this.json.length; i++)
        {
            var lat = this.json[i].lat;
            var lon = this.json[i].lon;
            var o   = null;

            if (_HasUnitHourly(this.json[i].data, this.selected_unit))
            {
                o = this.GetDerivedValuesFromJsonForUnitHourly(this.json, i, this.selected_unit);
            }//if
            else
            {
                var subs = _GetSubUnitsForUnit(this.selected_unit);

                if (subs != null)
                {
                    for (var j=0; j<subs.length; j++)
                    {
                        if (_HasUnitHourly(this.json[i].data, subs[j]))
                        {
                            console.log("Found sub unit %s for %s", subs[j], this.selected_unit);

                            o = this.GetDerivedValuesFromJsonForUnitHourly(this.json, i, subs[j]);

                            break;
                        }//if
                    }//for
                }//if
            }//else

            if (o == null)
            {
                //o = this.GetDerivedValuesFromJsonForUnitHourly(this.json, i, this.selected_unit); // make structs for empty marker
            }//if

            if (o != null) // don't show empty markers
            {
                this.AddMarker(i, lat, lon, o.lut_idx_val, o.is_offline, o.lut_idx_min, o.lut_idx_max, o.deg);
            }//if
        }//for
        //this.RescaleIcons();
    };

    
    IngestMarkers.prototype.AddMarker = function(marker_id, lat, lon, lutidx, offline, lutidx_min, lutidx_max, deg)
    {    
        var e      = this._GetCurrentVisibleExtent();
        var scale  = _GetIconScaleFactorForZ(e.z);
        var marker = new google.maps.Marker();

        var w      = _GetIconWidthForUnit(this.selected_unit); // this.width
        var h      = w; // this.height

        var yx = new google.maps.LatLng(lat, lon);
        var zi = _GetMarkerZIndexForAttributes(lutidx, offline);

        marker.setPosition(yx);
        marker.setZIndex(zi);
        
        marker.ext_id          = marker_id;
        marker.ext_lut_idx     = lutidx;
        marker.ext_lut_idx_min = lutidx_min;
        marker.ext_lut_idx_max = lutidx_max;
        marker.ext_deg         = deg;
        marker.ext_offline     = offline;

        marker.setMap(this.mapref);

        //var url = this.GetIconCached(lutidx, offline, w, h, this.pxScale * scale, lutidx_min, lutidx_max, deg, marker);

        this.GetIconCached(lutidx, offline, w, h, this.pxScale * scale, lutidx_min, lutidx_max, deg, marker);

        // on slower devices, async rendering the marker will be slower and cause a default balloon icon to temporarily appear
        // thus, if the icon wasn't immediately rendered/cached in the above step, supply a blank icon instead of the balloon
        if (marker.getIcon() == null)
        {
            this.SetScaledIconForMarkerFromUrl(marker, "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAgAAAAICAYAAADED76LAAAAEUlEQVR42mNgYGBgYhjxgAkAAxIABRlD9+oAAAAASUVORK5CYII=");
        }//if

        this.AttachInfoWindow(marker);
        this.markers.push(marker);
    };


    IngestMarkers.prototype.GetIconCached = function(lutidx, offline, width, height, pxScale, lutidx_min, lutidx_max, deg, marker)
    {
        var url      = null;
        var w_px     = _roundx(width  * pxScale, 1);
        var h_px     = _roundx(height * pxScale, 1);

        var alpha    = offline ? 0.7 : 1.0;
        var val_rgba = this.GetRgbaForLutIdxAlpha(lutidx, alpha);
        var con_rgba = _make_rgba(offline ? 220 :   0,
                                  offline ? 220 : 255,
                                  offline ? 220 :   0,
                                  alpha);
        var min_rgba = this.GetRgbaForLutIdxAlpha(lutidx_min, alpha);
        var max_rgba = this.GetRgbaForLutIdxAlpha(lutidx_max, alpha);

        var rstyle   = _GetIconRenderStyleForUnit(this.selected_unit);

        var cached   = false;
        
        var cb = function(url)
        {
            this.SetScaledIconForMarkerFromUrl(marker, url);

            if (!cached)
            {
                var does_exist = false;

                for (var i=0; i<this.icons.length; i++)
                {
                    if (this.icons[i].CompareToParams(w_px, h_px, deg, val_rgba, con_rgba, min_rgba, max_rgba, rstyle)) // this.render_style
                    {
                        does_exist = true;
                        break;
                    }//if
                }//for

                if (!does_exist)
                {
                    this.icons.push(ico);
                }//if
            }//if
        }.bind(this);

        for (var i=0; i<this.icons.length; i++)
        {
            if (this.icons[i].CompareToParams(w_px, h_px, deg, val_rgba, con_rgba, min_rgba, max_rgba, rstyle)) // this.render_style
            {
                this.icons[i].UpdateLastUse();
                url = this.icons[i].url;
                cached = true;
                break;
            }//if
        }//for
        
        if (url == null)
        {            
            var ico = new IngestIcon(w_px, h_px, deg, val_rgba, con_rgba, min_rgba, max_rgba, rstyle); // this.render_style, cb
            ico.Render(cb);
        }//if
        else
        {
            cb(url);
        }//else
    };

    IngestMarkers.prototype.SetScaledIconForMarkerFromUrl = function(marker, url)
    {
        if (marker == null)
        {
            console.log("IngestMarkers.prototype.SetScaledIconForMarkerFromUrl: [ERR]: marker is NULL!");
            return;
        }//if

        if (marker.getMap() == null)
        {
            console.log("IngestMarkers.prototype.SetScaledIconForMarkerFromUrl: [ERR]: marker.getMap() is NULL!");
            return;
        }//if

        if (url == null)
        {
            console.log("IngestMarkers.prototype.SetScaledIconForMarkerFromUrl: [ERR]: url is NULL!");
            return;
        }//if

        if (marker.getIcon() != null && marker.getIcon().url == url)
        {
            console.log("IngestMarkers.prototype.SetScaledIconForMarkerFromUrl: [ERR]: url is same!");
            return;
        }//if

        var e     = this._GetCurrentVisibleExtent();
        var scale = _GetIconScaleFactorForZ(e.z);
        var ico   = marker.getIcon();

        if (ico == null) ico = { };
        
        var w          = _GetIconWidthForUnit(this.selected_unit);
        var h          = w;
        
        ico.size       = new google.maps.Size(_roundx(w * scale, 1), _roundx(h * scale, 1));  // this.width, this.height
        ico.scaledSize = new google.maps.Size(_roundx(w * scale, 1), _roundx(h * scale, 1));
        ico.anchor     = new google.maps.Point(w * scale * 0.5, h * scale * 0.5);
        ico.url        = url;
 
        marker.setIcon(ico);
    };
    
    // This is the primary function that should be called from any data fetch.
    //
    IngestMarkers.prototype.RefreshSensorDataFromJson = function(obj, force_reload)
    {
        var need_reload = false;
        var need_icons  = false;
        var nowSS       = (Date.now() / 1000.0) >>> 0;
        //var o           = _ParseJSON(obj, this.parse_format);

        need_reload = true || force_reload;
        need_icons  = true;

        if (need_reload)
        {
            this.create_ss = nowSS;
            this.RemoveAllMarkersFromMapAndPurgeData();
            //this.AddData(obj);
            this.json = obj;
            console.log("IngestMarkers.AddData: Added %d JSON locations.", this.json.length);

            if (force_reload)
            {
                this.AddMarkersToMap();
            }//if
        }//if
        else
        {            
            if (need_icons)
            {
                this.UpdateIconsForData();
            }//if
        }//else

        if (this.ext_queue.length > 0)
        {
            this._ProcessExtQueue();
        }//if
    };
    
    IngestMarkers.prototype.AttachInfoWindow = function(marker)
    {
        google.maps.event.addListener(marker, "click", function() 
        {
            this.OpenRetainedInfoWindow(marker);
        }.bind(this));
    };

    var _Pad2 = function(x)
    {
        return x < 10 ? "0"+x : ""+x;
    };

    var _GetFormattedTimeStringForDate = function(d)
    {
        return _Pad2(d.getHours()) + ":" + _Pad2(d.getMinutes());
    };

    var _GetFormattedDateStringForDate = function(d)
    {
        return d.getFullYear()  + "-" + _Pad2(d.getMonth()+1) + "-" + _Pad2(d.getDate());
    };

    var _GetFormattedUtcOffsetStringForDate = function(d)
    {
        return "UTC" + (d.getTimezoneOffset() > 0 ? "─" : "+") + _Pad2(Math.abs(d.getTimezoneOffset()/60));
    };
    
    var _GetTzAbbrStringForDate = function(d)
    {
        var tz = d.toLocaleString("en", {timeZoneName:"short"}).split(" ").pop();

        // fix for JST resolving to "GMT-9" with the short tz specification.
        if (tz.length > 3 && tz.indexOf("GMT") > -1)
        {
            var tzl = d.toString().split("(")[1].slice(0, -1);
            if (tzl.length < tz.length) tz = tzl;
        }//if

        return tz;
    };

    var _GetDateTimeStringForDate = function(d)
    {
        var gmt = _GetFormattedUtcOffsetStringForDate(d);
        var tza = _GetTzAbbrStringForDate(d);

        var h = _GetFormattedDateStringForDate(d)
              + " "
              + _GetFormattedTimeStringForDate(d)
              + " "
              + gmt + " (" + tza + ")";

        return h;
    };

   var _GetDateTimeHtmlForDate = function(d)
    {
        var gmt = _GetFormattedUtcOffsetStringForDate(d);
        var tza = _GetTzAbbrStringForDate(d);

        var h = "<span style='color:#555;'>" 
              + _GetFormattedDateStringForDate(d)
              + "</span>" 
              + "&nbsp;&nbsp;"
              + "<span style='color:#000;'>"
              + _GetFormattedTimeStringForDate(d)
              + "</span>" 
              + " &nbsp;"
              + "<span style='color:#CCC;'>"
              + gmt + " (" + tza + ")</span>";

        return h;
    };


    IngestMarkers.prototype.CheckCanCreateCombinedChartForMarker = function(units, ss_per_epoch_timepart)
    {
        var d = false;

        for (var i=0; i<units.length; i++)
        {
        }//for

        return d;
    };


    IngestMarkers.prototype.CreateCombinedChartForMarker = function(marker, units, ss_per_epoch_timepart, el, width, height, is_inv)
    {
        var idx  = marker.ext_id;
        var data = new google.visualization.DataTable();
        var min = 1 << 30;
        var max = 0 - min;
        var ticks = null;

        data.addColumn("number", "Date");

        var units_vs = new Array(units.length);

        for (var i=0; i<units.length; i++)
        {
            var unit = units[i];

            var uc = _GetUiDisplayUnitAndCategoryIdForUnit(this.json[idx].data, unit);
            data.addColumn("number", uc.unit);

            var ts  = _GetTimeSeriesNodeForUnit(this.json[idx].data, unit, ss_per_epoch_timepart);
            var _min = _GetMinValueForUnitHourlyDaily(this.json[idx].data, unit);
            var _max = _GetMaxValueForUnitHourlyDaily(this.json[idx].data, unit);
            var vs  = ts.values;

            if (i == 0)
            {
                ticks = new Array(vs.length);
            }//if

            _min = Math.min(_min, min);
            _max = Math.max(_max, max);

            units_vs[i] = vs;
        }//for

        for (var i=0; i<units_vs[0].length; i++)
        {
            var row = new Array(units_vs.length + 1);

            var d  = 0 - (units_vs[0].length - 1 - i);

            row.push(d);

            for (var j=0; j<units_vs.length; j++)
            {
                row.push(units_vs[j][i]);
            }//for

            data.addRow(row);
        }//for



        var options = 
        {
            chart: 
            {
                   title: null,
                subtitle: null,
            },
            tooltip: 
            {
                   isHtml: true,
                textStyle: 
                {
                        bold: false,
                    fontName: "Helvetica,Arial,sans-serif",
                    fontSize: 8
                }
            },
            /*
            legend: 
            {
                position: "none"
            },
            */
            hAxis: 
            {
                ticks: ticks,
                title: (ss_per_epoch_timepart == 3600 ? "Last 24 Hours" : "Last 30 Days")
            },
            vAxis: 
            { 
                viewWindowMode: "explicit",
                    viewWindow: 
                    {
                        max: max,
                        min: min
                    }
            },
            lineWidth: 3,
                width: width,
               height: height
        };


        var chart = new google.visualization.LineChart(el);

        chart.draw(data, options);
    };





    IngestMarkers.prototype.CreateChartForMarker = function(marker, unit, ss_per_epoch_timepart, el, width, height, is_inv)
    {
        var idx = marker.ext_id;
        var ts  = _GetTimeSeriesNodeForUnit(this.json[idx].data, unit, ss_per_epoch_timepart);

        if (ts == null) return;

        var vs     = ts.values;
        var props  = _GetUnitChartProps(unit);
        var is_rad = _IsUnitRad(unit);
        var is_air = _IsUnitAir(unit);
        var uc     = _GetUiDisplayUnitAndCategoryIdForUnit(this.json[idx].data, unit);
        var data   = new google.visualization.DataTable();
        var ticks  = new Array(vs.length);
        var last_d = -1;

        data.addColumn("number", "Date");
        data.addColumn("number", uc.unit);
        data.addColumn({type: "string", role: "tooltip", "p": {"html": true}});

        for (var i=0; i<vs.length; i++)
        {
            var d  = 0 - (vs.length - 1 - i);
            var dd = new Date(ts.start_epoch_timepart * ts.ss_per_epoch_timepart * 1000.0 + i * ts.ss_per_epoch_timepart * 1000.0);

            var tt = "<span style='font-family:Helvetica,Arial,sans-serif !important; font-weight:normal; font-size:10px;'>"
                   +    _GetDateTimeHtmlForDate(dd) 
                   +    "<br/>" 
                   +    "<span style='color:#000 !important;'>"
                   +        (uc.ui_display_unit_parts.si == null ? "" : uc.ui_display_unit_parts.si)
                   +        ": "
                   +        "<span style='font-weight:bold;'>"
                   +            (vs[i] != null ? vs[i].toFixed(is_rad || is_air ? 2 : 1) : "")
                   +        "</span>"
                   +    "</span>"
                   + "</span>";

            data.addRow([d, vs[i], tt]);

            ticks[i] = { v:d, f:(i % 2 == 0 ? "" + d : "") };

            if (vs[i] != null)
            { 
                last_d = d; 
            }//if
        };

        var min = _GetMinValueForUnitHourlyDaily(this.json[idx].data, unit);
        var max = _GetMaxValueForUnitHourlyDaily(this.json[idx].data, unit);

        var is_gradient_stroke = is_air || is_rad || unit == "env_temp" || unit == "env_humid";

        var options = 
        {
            chart: 
            {
                   title: null,
                subtitle: null,
            },
            tooltip: 
            {
                   isHtml: true,
                textStyle: 
                {
                        bold: false,
                    fontName: "Helvetica,Arial,sans-serif",
                    fontSize: 8
                }
            },
            legend: 
            {
                position: "none"
            },
            hAxis: 
            {
                ticks: ticks,
                title: (ss_per_epoch_timepart == 3600 ? "Last 24 Hours" : "Last 30 Days")
                //title: (ss_per_epoch_timepart == 3600 ? "過去24時間 · Last 24 Hours" : "過去30日間 · Last 30 Days")
            },
            vAxis: 
            { 
                viewWindowMode: "explicit",
                    viewWindow: 
                    {
                        max: max,
                        min: min
                    }
            },
            lineWidth: 3,       /*(is_gradient_stroke ? 3 : 2),*/
                width: width,
               height: height   /*(ss_per_epoch_timepart == 3600 ? 200 : 100)*/
        };


        if (is_inv)
        {
            options.backgroundColor      = {  fill: "#000" };
            options.hAxis.titleTextStyle = { color: "#FFF" };
            options.hAxis.textStyle      = { color: "#FFF" };
            options.hAxis.gridlines      = { color: "#333" };
            options.hAxis.baselineColor  =          "#999";
            options.vAxis.titleTextStyle = { color: "#FFF" };
            options.vAxis.textStyle      = { color: "#FFF" };
            options.vAxis.gridlines      = { color: "#333" };
            options.vAxis.baselineColor  =          "#999";
            options.annotations          = { textStyle: { 
                                             color: "#FFF" } };
        }//if


        if (props.unit_type == 1)
        {
            options.vAxis.format = "0.00";
        }//if

        if (   (props.pad_min || props.def_min) != null
            && (props.pad_min || props.def_min)  < min)
        {
            options.vAxis.viewWindow.min = props.pad_min || props.def_min;
            options.vAxis.baseline       = props.pad_min || props.def_min;
        }//if

        if (   (props.pad_max || props.def_max) != null
            && (props.pad_max || props.def_max)  > max)
        {
            options.vAxis.viewWindow.max = props.pad_max || props.def_max;
        }//if

        var local_min = ss_per_epoch_timepart == 3600 ? _GetMinValueForUnitHourly(this.json[idx].data, unit) 
                                                      :  _GetMinValueForUnitDaily(this.json[idx].data, unit);
        var local_max = ss_per_epoch_timepart == 3600 ? _GetMaxValueForUnitHourly(this.json[idx].data, unit) 
                                                      :  _GetMaxValueForUnitDaily(this.json[idx].data, unit);

        var is_rescale     = false;
        var is_anomaly_err = false;

        if (   props.thr_max != null && local_max > props.thr_max
            || props.thr_min != null && local_min < props.thr_min)
        {
            is_anomaly_err = true;
            is_rescale     = true;
        }//if
        else if (   (props.def_max != null && local_max > props.def_max)
                 || (props.def_min != null && local_min < props.def_min))
        {
            is_rescale = true;
        }//else if

        if (is_rescale)
        {
            options.vAxis.baselineColor = "#F00";
            options.vAxis.baseline      = props.def_max || props.pad_max || props.thr_max;
        }//if

        if (is_anomaly_err)
        {
            options.vAxis.titleTextStyle = { color: "#F00" };
            options.vAxis.textStyle      = { color: "#F00" };
        }//if

        if (last_d < -1)
        {
            is_anomaly_err               = true;
            options.hAxis.baseline       = last_d;
            options.hAxis.baselineColor  =          "#F00";
            options.hAxis.titleTextStyle = { color: "#F00" };
            options.hAxis.textStyle      = { color: "#F00" };
        }//if


        if (is_anomaly_err)
        {
            options.chartArea = 
            {
                backgroundColor: 
                { 
                           fill: (!is_inv ? "#FEE" : "#400"), 
                         stroke: "#F00",
                    strokeWidth: 2 
                }
            };

            if (is_inv)
            {
                options.vAxis.gridlines = { color: "#111" };
                options.hAxis.gridlines = { color: "#111" };
            }//if
        }//if

        
        var chart = new google.visualization.LineChart(el);

        if (is_gradient_stroke && local_min != local_max)
        {
            google.visualization.events.addOneTimeListener(chart, "ready", function () {
                this.AddChartGradient(chart, local_min, local_max, unit);
            }.bind(this));
        }//if
        else if (is_gradient_stroke && local_min != null) // some kind of SVG gradient rendering bug?
        {
            var rgb = this.GetRgbFromLutForUnitType(local_min, props.unit_type, 0);
            options.series = { 0: { color: _RgbToHex(rgb) } };
        }//else

        chart.draw(data, options);
    };


    var _CreateGradient = function(svg, properties)
    {
        var svgNS = svg.namespaceURI;
        var grad  = document.createElementNS(svgNS, "linearGradient");
        grad.setAttribute("id", properties.id);

        ["x1","y1","x2","y2"].forEach(function(name)
        {
            if (properties.hasOwnProperty(name)) 
            {
                grad.setAttribute(name, properties[name]);
            }//if
        });

        for (var i = 0; i < properties.stops.length; i++) 
        {
            var attrs = properties.stops[i];
            var stop  = document.createElementNS(svgNS, "stop");

            for (var attr in attrs) 
            {
                if (attrs.hasOwnProperty(attr)) stop.setAttribute(attr, attrs[attr]);
            }//for

            grad.appendChild(stop);
        }//for

        var defs = svg.querySelector("defs") ||
            svg.insertBefore(document.createElementNS(svgNS, "defs"), svg.firstChild);

        return defs.appendChild(grad);
    };


    var _RgbToHex = function (rgb)
    {
        return "#" + (rgb[0] < 0x10 ? "0" : "") + rgb[0].toString(16) 
                   + (rgb[1] < 0x10 ? "0" : "") + rgb[1].toString(16) 
                   + (rgb[2] < 0x10 ? "0" : "") + rgb[2].toString(16);
    };

    IngestMarkers.prototype.GetIdxFromLutForUnitType = function(val, unit_type, rsn)
    {
        return unit_type == 1 ? this.rad_lut.GetIdxForValue(val, rsn)
             : unit_type == 2 ? this.pmx_lut.GetIdxForValue(val, rsn)
             : unit_type == 3 ? this.tmp_lut.GetIdxForValue(val, rsn)
             :                  this.rhp_lut.GetIdxForValue(val, rsn);
    };

    IngestMarkers.prototype.GetRgbFromLutForUnitType = function(val, unit_type, rsn)
    {
        return unit_type == 1 ? this.rad_lut.GetRgbForValue(val, rsn)
             : unit_type == 2 ? this.pmx_lut.GetRgbForValue(val, rsn)
             : unit_type == 3 ? this.tmp_lut.GetRgbForValue(val, rsn)
             :                  this.rhp_lut.GetRgbForValue(val, rsn);
    };

    IngestMarkers.prototype.GetRgbFromLutForIdxUnitType = function(idx, unit_type, rsn)
    {
        return unit_type == 1 ? this.rad_lut.GetRgbForIdx(idx, rsn)
             : unit_type == 2 ? this.pmx_lut.GetRgbForIdx(idx, rsn)
             : unit_type == 3 ? this.tmp_lut.GetRgbForIdx(idx, rsn)
             :                  this.rhp_lut.GetRgbForIdx(idx, rsn);
    };

    var _make_rgba = function(r, g, b, a) { return { r:r, g:g, b:b, a:a }; };

    IngestMarkers.prototype.GetRgbaForLutIdxAlpha = function(lutidx, a)
    {
        var d = null;

        if (lutidx == null)
        {
            d = _make_rgba(null, null, null, a);
        }//if
        else
        {
            var rgb = this.GetRgbFromLutForIdxUnitType(lutidx, _GetUnitChartProp(this.selected_unit, "unit_type", 1), this.rsn);
            d = _make_rgba(rgb[0], rgb[1], rgb[2], a);
        } //else

        return d;

        /*
        return lutidx == null ? _make_rgba(null, null, null, a)
                              : _make_rgba(this.lut.r[lutidx], this.lut.g[lutidx], this.lut.b[lutidx], a);
        */
    };


    IngestMarkers.prototype.MakeGradientStops = function(min, max, stops, unit)
    {
        var d   = new Array();
        var val = max;
        var inc = (max - min) / stops;
        var ut  = _GetUnitChartProp(unit, "unit_type");

        for (var i=0; i<stops; i++)
        {
            var rgb = this.GetRgbFromLutForUnitType(val, ut, 0);
            var hex = _RgbToHex(rgb);
            var off = (parseFloat(i) / (parseFloat(stops) - 1.0) * 100.0) + "%";
            d.push( { offset:off, "stop-color":hex } );
            val -= inc;
        }//for

        return d;
    };

    var _GetChartGradientName = function(unit, min, max)
    {
        return "chartGradient_" + unit + "_" + parseInt(min*1000) + "_" + parseInt(max*1000);
    };

    // Based on: http://stackoverflow.com/questions/33949913/how-to-create-color-gradient-on-google-visualization-line-chart
    IngestMarkers.prototype.AddChartGradient = function(chart, min, max, unit)
    {
        var chartDiv = chart.getContainer();
        var svg      = chartDiv.getElementsByTagName("svg")[0];
        var stops    = this.MakeGradientStops(min, max, 64, unit);

        var properties = 
        {
               id: _GetChartGradientName(unit, min, max),
               x1: "0%",
               y1: "0%",
               x2: "0%",
               y2: "100%",
            stops: stops
        };
    
        _CreateGradient(svg, properties);

        var chartPath = svg.getElementsByTagName("path")[0];  //0 path corresponds to legend path //1

        if (chartPath != null)
        {
            //chartPath.setAttribute("stroke", "url(#chartGradient_" + unit + "_" + parseInt(min*1000) + "_" + parseInt(max*1000) + ")");
            chartPath.setAttribute("stroke", "url(#" + _GetChartGradientName(unit, min, max) + ")");            
        }//if
        else
        {
            console.log("IngestMarkers.AddChartGradient: [WARN] Could not find SVG path, stroke not set to gradient.");
        }//else
    };

    var _GetIconWidthForUnit = function(unit)
    {
        return _GetIconWidthForUnitType(_GetUnitChartProp(unit, "unit_type", 1));
    };

    var _GetIconRenderStyleForUnit = function(unit)
    {
        return _GetIconRenderStyleForUnitType(_GetUnitChartProp(unit, "unit_type", 1));
    };

    var _GetIconWidthForUnitType = function(unit_type)
    {
        var s = _GetUnitTypeProps(unit_type);
        return s.icon_w;
    };

    var _GetIconRenderStyleForUnitType = function(unit_type)
    {
        var s = _GetUnitTypeProps(unit_type);
        return s.icon_rstyle;
    };

    var _GetUnitTypeProps = function(unit_type)
    {
        var d = null;

        for (var i=0; i<_unit_type_props.length; i++)
        {
            if (_unit_type_props[i].unit_type == unit_type)
            {
                d = _unit_type_props[i];
                break;
            }//if
        }//for

        return d;
    };

    var _unit_type_props = [ { unit_type:1, icon_w:20, icon_h:20, icon_rstyle:IngestIcon.RenderStyle.Dot            },
                             { unit_type:2, icon_w:40, icon_h:40, icon_rstyle:IngestIcon.RenderStyle.DoubleTriangle },
                             { unit_type:3, icon_w:20, icon_h:20, icon_rstyle:IngestIcon.RenderStyle.Chevron        },
                             { unit_type:4, icon_w:20, icon_h:20, icon_rstyle:IngestIcon.RenderStyle.Chevron        },
                             { unit_type:5, icon_w:20, icon_h:20, icon_rstyle:IngestIcon.RenderStyle.Chevron        } ];

    var _unit_chart_props = [//{ unit:"lnd_7318",   unit_type:1, unit_group:1, sort: 7, def_min:  0.03, def_max:  1.00, pad_min: -0.05, pad_max:  1.05, thr_min:null, thr_max: 10.00 },
                             { unit:"lnd_7318u",  unit_type:1, unit_group:1, sort: 8, def_min:  0.03, def_max:  1.00, pad_min: -0.05, pad_max:  1.05, thr_min:null, thr_max: 10.00 },
                             { unit:"lnd_7318c",  unit_type:1, unit_group:1, sort: 9, def_min:  0.03, def_max:  1.00, pad_min: -0.05, pad_max:  1.05, thr_min:null, thr_max: 10.00 },
                             //{ unit:"lnd_7128",   unit_type:1, unit_group:1, sort:10, def_min:  0.03, def_max:  1.00, pad_min: -0.05, pad_max:  1.05, thr_min:null, thr_max: 10.00 },
                             { unit:"lnd_7128ec", unit_type:1, unit_group:1, sort:11, def_min:  0.03, def_max:  1.00, pad_min: -0.05, pad_max:  1.05, thr_min:null, thr_max: 10.00 },
                             //{ unit:"lnd_712",    unit_type:1, unit_group:1, sort:12, def_min:  0.03, def_max:  1.00, pad_min: -0.05, pad_max:  1.05, thr_min:null, thr_max: 10.00 },
                             { unit:"lnd_712u",   unit_type:1, unit_group:1, sort:13, def_min:  0.03, def_max:  1.00, pad_min: -0.05, pad_max:  1.05, thr_min:null, thr_max: 10.00 },
                             //{ unit:"lnd_712c",   unit_type:1, unit_group:1, sort:14, def_min:  0.03, def_max:  1.00, pad_min: -0.05, pad_max:  1.05, thr_min:null, thr_max: 10.00 },
                             //{ unit:"lnd_78017",  unit_type:1, unit_group:1, sort:15, def_min:  0.03, def_max:  1.00, pad_min: -0.05, pad_max:  1.05, thr_min:null, thr_max: 10.00 },
                             //{ unit:"lnd_78017u", unit_type:1, unit_group:1, sort:16, def_min:  0.03, def_max:  1.00, pad_min: -0.05, pad_max:  1.05, thr_min:null, thr_max: 10.00 },
                             //{ unit:"lnd_78017c", unit_type:1, unit_group:1, sort:17, def_min:  0.03, def_max:  1.00, pad_min: -0.05, pad_max:  1.05, thr_min:null, thr_max: 10.00 },
                             { unit:"lnd_78017w", unit_type:1, unit_group:1, sort:18, def_min:  0.03, def_max:  1.00, pad_min: -0.05, pad_max:  1.05, thr_min:null, thr_max: 10.00 },
                             { unit:"opc_pm01_0", unit_type:2, unit_group:2, sort: 1, def_min:  0.00, def_max: 80.00, pad_min: -5.00, pad_max: 85.00, thr_min:null, thr_max:300.00 },
                             { unit:"opc_pm02_5", unit_type:2, unit_group:2, sort: 2, def_min:  0.00, def_max: 80.00, pad_min: -5.00, pad_max: 85.00, thr_min:null, thr_max:300.00 },
                             { unit:"opc_pm10_0", unit_type:2, unit_group:2, sort: 3, def_min:  0.00, def_max: 80.00, pad_min: -5.00, pad_max: 85.00, thr_min:null, thr_max:300.00 },
                             { unit:"pms_pm01_0", unit_type:2, unit_group:3, sort: 4, def_min:  0.00, def_max: 80.00, pad_min: -5.00, pad_max: 85.00, thr_min:null, thr_max:300.00 },
                             { unit:"pms_pm02_5", unit_type:2, unit_group:3, sort: 5, def_min:  0.00, def_max: 80.00, pad_min: -5.00, pad_max: 85.00, thr_min:null, thr_max:300.00 },
                             { unit:"pms_pm10_0", unit_type:2, unit_group:3, sort: 6, def_min:  0.00, def_max: 80.00, pad_min: -5.00, pad_max: 85.00, thr_min:null, thr_max:300.00 },
                             { unit:"env_temp",   unit_type:3, unit_group:4, sort:19, def_min:-20.00, def_max:100.00, pad_min:-25.00, pad_max:105.00, thr_min:null, thr_max:  null },
                             { unit:"env_humid",  unit_type:4, unit_group:4, sort:20, def_min:  0.00, def_max:100.00, pad_min: -5.00, pad_max:105.00, thr_min:null, thr_max:  null },
                             { unit:"env_press",  unit_type:5, unit_group:4, sort:21, def_min:  null, def_max:  null, pad_min:  null, pad_max:  null, thr_min:null, thr_max:  null }];

    var _unit_substitutes = [{ unit:"opc_pm01_0", subs:["pms_pm01_0", "opc_pm02_5", "pms_pm02_5", "opc_pm10_0", "pms_pm10_0"] },
                             { unit:"opc_pm02_5", subs:["pms_pm02_5", "opc_pm01_0", "pms_pm01_0", "opc_pm10_0", "pms_pm10_0"] },
                             { unit:"opc_pm10_0", subs:["pms_pm10_0", "opc_pm02_5", "pms_pm02_5", "opc_pm01_0", "pms_pm01_0"] },
                             { unit:"pms_pm02_5", subs:["opc_pm02_5", "pms_pm01_0", "opc_pm01_0", "pms_pm10_0", "opc_pm10_0"] },
                             { unit:"pms_pm01_0", subs:["opc_pm01_0", "pms_pm02_5", "opc_pm02_5", "pms_pm10_0", "opc_pm10_0"] },
                             { unit:"pms_pm10_0", subs:["opc_pm10_0", "pms_pm02_5", "opc_pm02_5", "pms_pm01_0", "opc_pm01_0"] },
                             { unit:"lnd_7318u",  subs:["lnd_712u",   "lnd_7318c",  "lnd_7128ec", "lnd_78017w"] },
                             { unit:"lnd_712u",   subs:["lnd_7318u",  "lnd_7318c",  "lnd_7128ec", "lnd_78017w"] },
                             { unit:"lnd_7318c",  subs:["lnd_7128ec", "lnd_7318u",  "lnd_712u",   "lnd_78017w"] },
                             { unit:"lnd_7128ec", subs:["lnd_7318c",  "lnd_7318u",  "lnd_712u",   "lnd_78017w"] },
                             { unit:"lnd_78017w", subs:["lnd_7128ec", "lnd_7318c",  "lnd_712u",   "lnd_7318u" ] }];

    var _GetSubUnitsForUnit = function(unit)
    {
        var d = null;

        for (var i=0; i<_unit_substitutes.length; i++)
        {
            if (_unit_substitutes[i].unit == unit)
            {
                d = _unit_substitutes[i].subs;
                break;
            }//if
        }//for

        return d;
    };


    var _GetUnitChartProps = function(unit)
    {
        var d = null;

        for (var i=0; i<_unit_chart_props.length; i++)
        {
            if (_unit_chart_props[i].unit == unit)
            {
                d = _unit_chart_props[i];
            }//if
        }//for

        if (d == null)
        {
            d = { unit:null, unit_type:null, unit_group:null, sort:null, def_min:null, def_max:null, pad_min:null, pad_max:null, thr_min:null, thr_max:null };
        }//if

        return d;
    };

    var _GetUnitChartProp = function(unit, prop, def)
    {
        var s = _GetUnitChartProps(unit);
        var d = s != null ? s[prop] : null;
        return d == null && def != null ? def : d;
    };

    var _IsUnitRad = function(unit)
    {
        return _GetUnitChartProp(unit, "unit_type", 0) == 1;
    };

    var _IsUnitAir = function(unit)
    {
        return _GetUnitChartProp(unit, "unit_type", 0) == 2;
    };


    var _GetSortOrdinalForUnit = function(unit)
    {
        return _GetUnitChartProp(unit, "sort", 255);
    };    

    var _SortByUnitAndTimepart = function(src)
    {
        src = src.sort(function(a, b) 
        {
            var ao = _GetSortOrdinalForUnit(a["unit"]);
            var bo = _GetSortOrdinalForUnit(b["unit"]);
            var as = a["ss_per_epoch_timepart"];
            var bs = b["ss_per_epoch_timepart"];
            return   ao > bo ?  1
                   : ao < bo ? -1 
                   : as > bs ?  1
                   : as < bs ? -1
                   : 0;
        });
        
        return src;
    };

    var _SortByUnit = function(src)
    {
        src = src.sort(function(a, b) 
        {
            var ao = _GetSortOrdinalForUnit(a["unit"]);
            var bo = _GetSortOrdinalForUnit(b["unit"]);
            return   ao > bo ?  1
                   : ao < bo ? -1 
                   : 0;
        });
        
        return src;
    };


    //http://tt.safecast.org/device-log/2017-03-3768313999.json
    var _GetTtDeviceLogUrl = function(device_id)
    {
        return "http://tt.safecast.org/device-log/" + (new Date()).getFullYear() + "-" + _Pad2((new Date()).getMonth() + 1) + "-" + device_id + ".json";
    };

    //http://tt.safecast.org/check/3768313999
    var _GetTtDeviceChkUrl = function(device_id)
    {
        return "http://tt.safecast.org/check/" + device_id;
    };

    //http://tt.safecast.org/device/2565454211
    var _GetTtDeviceLnkUrl = function(device_id)
    {
        return "http://tt.safecast.org/device/" + device_id;
    };

    var _GetNbspPaddingDigits = function(n)
    {
        var d = "";

        for (var i=0; i<n; i++)
        {
            d += "&nbsp;";
        }//for

        return d;
    };

    var _AddDeviceListToContainerForJsonIdx = function(json, idx, container)
    {
        if (json[idx].device_ids != null)
        {
            var maxlen          = -1;
            var a_html          = "' target='_blank' style='color:rgb(66,114,219); text-decoration:none;'>";
            var d01             = document.createElement("div");
            var ul              = document.createElement("ul");
            d01.innerHTML       = "Devices";
            ul.style.fontFamily = "Courier,'Courier New',monospace";

            for (var i=0; i<json[idx].device_ids.length; i++)
            {
                maxlen = Math.max(json[idx].device_ids[i].toString().length, maxlen);
            }//for

            for (var i=0; i<json[idx].device_ids.length; i++)
            {
                var li = document.createElement("li");

                li.innerHTML = (json[idx].device_ids[i].toString().length >= maxlen ? "" : _GetNbspPaddingDigits(maxlen - json[idx].device_ids[i].toString().length))
                             + "<a href='" + _GetTtDeviceLnkUrl(json[idx].device_ids[i]) + a_html
                             +      json[idx].device_ids[i]
                             + "</a> "
                             + "<a href='" + _GetTtDeviceChkUrl(json[idx].device_ids[i]) + a_html
                             +      "chk"
                             + "</a> "
                             + "<a href='" + _GetTtDeviceLogUrl(json[idx].device_ids[i]) + a_html
                             +      "log"
                             + "</a>";

                ul.appendChild(li);
            }//for

            container.appendChild(d01);
            container.appendChild(ul);
        }//if
    };

    
    IngestMarkers.prototype.OpenRetainedInfoWindow = function(marker)
    {
        if (this.inforef == null) 
        {
            this.inforef = new google.maps.InfoWindow({size: new google.maps.Size(320, 220)});
        }//if
        else
        {
            this.inforef.close();
        }//else
        
        var idx       = marker.ext_id;
        var uts       = _GetUnitsAndTimeSeriesList(this.json[idx].data);
        uts           = _SortByUnitAndTimepart(uts);
        var queue     = new Array(uts.length);
        var last_unit = "";
        var is_mini   = _GetClientViewSize().w <= 700;//450;
        var img_w     = is_mini ? 320-30-10-50 : 300; // 320 // Google's styles seem to add 30 x-axis pixels of padding
        var img_h     = 100;
        var is_inv    = this.mapref.getDiv().classList.contains("kuro");
        var container = document.createElement("div");

        if (!is_mini)
        {
            container.style.width = (img_w * 2 + 16) + "px";
        }//if


        for (var i=0; i<uts.length; i++)
        {
            if (uts[i].unit != last_unit)
            {
                var t  = document.createElement("div");
                var up = uts[i].ui_display_unit_parts;

                t.innerHTML = (   up.ch    == null ? "" : up.ch + " ")
                            + (   up.si    == null ? "" : up.si      )
                            + (   up.mfr   == null 
                               && up.model == null ? "" : "<span class='menu-section-list-tag' style='font-size:8px !important;'>"
                                                          + (up.mfr   == null ? "" : up.mfr   + " ")
                                                          + (up.model == null ? "" : up.model      )
                                                          + "</span>");
                t.style.paddingBottom = "2px";
                last_unit             = uts[i].unit;
                
                container.appendChild(t);
            }//if

            var el            = document.createElement("div");
            el.style.width    = img_w + "px";
            el.style.height   = img_h + "px";
            el.innerHTML      = "&nbsp;";
            el.style.overflow = "hidden";

            if (!is_mini)
            {
                el.style.display = "inline-block";

                if (uts[i].ss_per_epoch_timepart > 3600)
                {
                    el.style.float = "right";
                }//if
            }//if

            queue[queue.length - 1 - i] = 
            {
                marker: marker, 
                  unit: uts[i].unit,
                    ss: uts[i].ss_per_epoch_timepart,
                    el: el,
                     w: img_w,
                     h: img_h, 
                   inv: is_inv,
                 combo: false
            };

            container.appendChild(el);
        }//for

        _AddDeviceListToContainerForJsonIdx(this.json, idx, container);


        var units = ["opc_pm01_0", "opc_pm02_5", "opc_pm10_0", "pms_pm01_0", "pms_pm02_5", "pms_pm10_0"];

        //this.CreateCombinedChartForMarker(marker, units, ss_per_epoch_timepart, el, width, height, is_inv)


        setTimeout(function() {
            this.ProcessChartQueue(queue);
        }.bind(this), 17);

        this.inforef.setContent(container);
        this.inforef.open(this.mapref, marker);
    };

    IngestMarkers.prototype.ProcessChartQueue = function(queue)
    {
        if (queue.length == 0) return;

        var o = queue.pop();

        this.CreateChartForMarker(o.marker, o.unit, o.ss, o.el, o.w, o.h, o.inv);

        setTimeout(function() {
            this.ProcessChartQueue(queue);
        }.bind(this), 17);
    };
    

    IngestMarkers.prototype.AddSensorDataFromJson = function(obj)
    {
        this.RefreshSensorDataFromJson(obj);
    };

    
    /*
    IngestMarkers.prototype.AddData = function(json)
    {
        this.json = json;
        console.log("IngestMarkers.AddData: Added %d JSON locations.", json.length);
    };
    */

    // 2017-09-24 ND: +256 to layer over realtime.safecast.org
    var _GetMarkerZIndexForAttributes = function(lutidx, offline)
    {
        return (lutidx != null ? lutidx : -5000) + (offline ? -1000 : 0) + 256;
    };
    
    var _GetIconScaleFactorForZ = function(z)
    {
        // For zoom levels > 7 and < 15, the scale is always 100%.
        // Otherwise, it's:
        //   10% base
        // + 90% scaled value of [0% - 87.5%], linear, based on zoom level.
        
        return   z > 13 ? 1.0 + (1.0 - (21 - z - 7) * 0.14285714) * 0.5
               : z >  7 ? 1.0 
               : 0.1 + (1.0 - (8 - z) * 0.125) * 0.9;
    };
    

    
    var _GetClientViewSize = function()
    {
        var _w = window,
            _d = document,
            _e = _d.documentElement,
            _g = _d.getElementsByTagName("body")[0],
            vw = _w.innerWidth || _e.clientWidth || _g.clientWidth,
            vh = _w.innerHeight|| _e.clientHeight|| _g.clientHeight;
        
        return { w:vw, h:vh };
    };

    var _vcombine_f64 = function(a,b) { if(a==null)return b;if(b==null)return a;var d=new Float64Array(a.length+b.length);d.set(a);d.set(b,a.length);return d; }
    var _vcombine_f32 = function(a,b) { if(a==null)return b;if(b==null)return a;var d=new Float32Array(a.length+b.length);d.set(a);d.set(b,a.length);return d; }
    var _vcombine_u32 = function(a,b) { if(a==null)return b;if(b==null)return a;var d=new  Uint32Array(a.length+b.length);d.set(a);d.set(b,a.length);return d; }
    var _vcombine_s32 = function(a,b) { if(a==null)return b;if(b==null)return a;var d=new   Int32Array(a.length+b.length);d.set(a);d.set(b,a.length);return d; }
    var _vcombine_u08 = function(a,b) { if(a==null)return b;if(b==null)return a;var d=new   Uint8Array(a.length+b.length);d.set(a);d.set(b,a.length);return d; }
    var _acombine_any = function(d,s) { if(d==null)return s;if(s==null)return d;for(var i=0;i<s.length;i++)d.push(s[i]);return d; }

    var _vfill  = function(x,d,o,n) { var i,m=(o+n)-((o+n)%4);for(i=o;i<m;i+=4){d[i]=x;d[i+1]=x;d[i+2]=x;d[i+3]=x;}for(i=m;i<m+n%4;i++)d[i]=x; };
    var _roundx = function(x,d)     { var p=Math.pow(10,d);return Math.round(x*p)/p; }


    return IngestMarkers;
})();






