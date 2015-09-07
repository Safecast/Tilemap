// ==============================================
// Safecast HUD / Query Reticle for PNG Tiles
// ==============================================
// Nick Dolezal/Safecast, 2015
// This code is released into the public domain.
// ==============================================

// 
// 2015-08-31 ND: Support 512x512 tiles.
// 2015-04-05 ND: Make the init detect on HUD.prototype.ChangeLayers use a boolean flag instead,
//                to fix bug where it kept activating upon layer change when it shouldn't.

// =========
// HUDCanvas
// =========
//
// Performs the image decode and color -> value translation in combination with hud_worker.js.
// This class was implemented due to issues with png.js not being particularly robust, meaning
// the PNG decode takes place on the main thread.
//
var HUDCanvas = (function()
{
    function HUDCanvas(fxCallbackSuccess, fxCallbackFailure, canvasModeId)
    {
        this.bad_urls          = new Array();
        this.cache             = new HUDCanvas.BufferCache(8);
        this.canvasModeId      = canvasModeId;
        this.fxCallbackSuccess = fxCallbackSuccess; // param: url, x, y, z, px, py, batchId, userData, rgba, width, height
        this.fxCallbackFailure = fxCallbackFailure; // param: url, x, y, z, px, py, batchId, userData,
    };
    
    HUDCanvas.prototype.GetAsyncPngFromCanvasByMode = function(url, x, y, z, px, py, batchId, userData)
    {
        if (this.IsBadUrl(url))
        {
            this.fxCallbackFailure(url, x, y, z, px, py, batchId, userData);
            return;
        }//if
        
        var cache_buf = this.cache.GetBuffer(url);
        
        if (cache_buf != null)
        {
            this.fxCallbackSuccess(url, x, y, z, px, py, batchId, userData, cache_buf.rgba, cache_buf.w, cache_buf.h);
        }//if
        else
        {
            var cb = function(url, x, y, z, px, py, batchId, userData, rgba, width, height)
            {
                this.cache.AddBufferDistinct(url, rgba, width, height, width*4, x, y, z);
                this.fxCallbackSuccess(url, x, y, z, px, py, batchId, userData, rgba, width, height);
            }.bind(this);
            
            if (this.canvasModeId == HUDCanvas.ModeXml)
            {
                this.GetAsync_PNG_URL_CanvasXmlHttpRequest(url, x, y, z, px, py, batchId, userData, cb);
            }//if
            else
            {
                this.GetAsyncNewRGBA8888_FromPNG_ImgURL_Canvas(url, x, y, z, px, py, batchId, userData, cb);
            }//else
        }//else
    };
    
    HUDCanvas.prototype.GetAsyncNewRGBA8888_FromPNG_ImgURL_Canvas = function(url, x, y, z, px, py, batchId, userData, fxCallback)
    {
        var img = new Image();
        var cvs = document.createElement("canvas");
        var ctx = cvs.getContext("2d");
        
        // 2015-08-31 ND: Check for 1x1 px null.png tile, instead of just 0x0
        
        img.onerror = function() { this.fxCallbackFailure(url, x, y, z, px, py, batchId, userData); }.bind(this);
        img.onload  = function() 
        {
            if (     ("naturalWidth" in img  && img.naturalWidth <= 1)
                || (!("naturalWidth" in img) && img.width <= 1))
            {
                this.fxCallbackFailure(url, x, y, z, px, py, batchId, userData);
                return;
            }//if
            
            cvs.width  = img.width;
            cvs.height = img.height;
            ctx.drawImage(img, 0, 0);
            var buf = ctx.getImageData(0, 0, cvs.width, cvs.height);
            fxCallback(url, x, y, z, px, py, batchId, userData, buf.data, img.width, img.height);
        }.bind(this);
        
        img.crossOrigin = "Anonymous";
        img.src = url;
    };
    
    HUDCanvas.prototype.GetAsync_PNG_URL_CanvasXmlHttpRequest = function(url, x, y, z, px, py, batchId, userData, fxCallback)
    {
        var getCallback = function(url, x, y, z, px, py, batchId, userData, response)
        {
            if (response != null)
            {
                this.GetAsyncNewRGBA8888_FromPNG_Blob_Canvas(url, x, y, z, px, py, batchId, userData, response, fxCallback);
            }//if
            else
            {
                this.fxCallbackFailure(url, x, y, z, px, py, batchId, userData);
                if (this.bad_urls.length < 1024) this.bad_urls.push(url);
            }//else
        }.bind(this);

        this.GetAsync_HTTP(url, x, y, z, px, py, batchId, userData, "blob", getCallback, userData);
    };
    
    HUDCanvas.prototype.GetAsync_HTTP = function(url, x, y, z, px, py, batchId, userData, responseType, fxCallback)
    {    
        var req = new XMLHttpRequest();
        req.open("GET", url, true);
        if (responseType != null) req.responseType = responseType;

        req.onreadystatechange = function()
        {
            if (req.readyState === 4 && req.status == 200 && req.response != null)
            {
                fxCallback(url, x, y, z, px, py, batchId, userData, req.response);
            }//if
            else if (req.readyState === 4)
            {
                fxCallback(url, x, y, z, px, py, batchId, userData, null);
                console.log("HUDCanvas.GetAsync_HTTP: error %d getting url:[%s].", req.status, url);
            }//else
        }.bind(this);

        req.send(null);
    };
    
    HUDCanvas.prototype.GetAsyncNewRGBA8888_FromPNG_Blob_Canvas = function(url, x, y, z, px, py, batchId, userData, srcBlob, fxCallback)
    {
        var img = new Image();
        var cvs = document.createElement("canvas");
        var ctx = cvs.getContext("2d");
        
        img.onload = function() 
        {                
            cvs.width  = img.width;
            cvs.height = img.height;
            
            ctx.drawImage(img, 0, 0);
            
            var buf = ctx.getImageData(0, 0, cvs.width, cvs.height);
            
            window.URL.revokeObjectURL(img.src);
            
            fxCallback(url, x, y, z, px, py, batchId, userData, buf.data, img.width, img.height);
        }.bind(this);
        
        img.src = window.URL.createObjectURL(srcBlob);
    };
    
    HUDCanvas.prototype.IsBadUrl = function(url)
    {
        var is_bad = false;
        for (var i=0; i<this.bad_urls.length; i++)
        {
            if (this.bad_urls[i] == url)
            {
                is_bad = true;
                break;
            }//if
        }//for
        return is_bad;
    };
    
    HUDCanvas.prototype.ClearBufferCache = function()
    {
        this.cache.Clear();
    };
    
    HUDCanvas.ModeXml    = 0; // slower, I think
    HUDCanvas.ModeImg    = 1; // current default
    HUDCanvas.ModeWorker = 2; // uses png.js in the worker.  this has issues.

    
    HUDCanvas.BufferCache = (function()
    {
        function BufferCache(n)
        {
            this.n       = n;
            this.idx     = 0;
            this.softmax = 0;
            this.cache   = new Array(n);
        }

        BufferCache.prototype.AddBufferDistinct = function(url, rgba, w, h, rb, x, y, z)
        {
            var exists = false;

            for (var i=0; i<this.softmax; i++)
            {
                if (this.cache[i].url == url)
                {
                    exists = true;
                    break;
                }//if
            }//for
        
            if (!exists) this.AddBuffer(url, rgba, w, h, rb, x, y, z);
        };

        BufferCache.prototype.AddBuffer = function(url, rgba, w, h, rb, x, y, z)
        {
            this.cache[this.idx] = new BufferCache.Item(url, rgba, w, h, rb, x, y, z);
            this.idx++;
            if (this.softmax <  this.n) this.softmax++;
            if (this.idx     >= this.n) this.idx = 0;
        };

        BufferCache.prototype.GetBuffer = function(url)
        {
            var item = null;

            for (var i=0; i<this.softmax; i++)
            {
                if (this.cache[i].url == url)
                {
                    item = this.cache[i];
                    break;
                }//if
            }//for

            return item;
        };

        BufferCache.prototype.Clear = function()
        {
            this.idx     = 0;
            this.softmax = 0;
            this.cache   = new Array(this.n);
        };

        BufferCache.Item = (function()
        {
            function Item(url, rgba, w, h, rb, x, y, z)
            {
                this.url  = url;
                this.rgba = rgba;
                this.w    = w;
                this.h    = h;
                this.rb   = rb;
                this.x    = x;
                this.y    = y;
                this.z    = z;
            }

            return Item;
        })(); // -- item --

        return BufferCache;
    })(); // -- buffercache --
    
    
    return HUDCanvas;
})();


// ===
// HUD
// ===
//
// Main class for the query reticle.  Updates a "view" div and dispatches tile value lookups
// to HUDCanvas.
//
var HUD = (function()
{
    function HUD(map, div)
    {
        this.mapRef        = map;
        this.div           = div;
        this._div_opacity  = 0.0;
        this.ready         = false;
        this.busy          = false;
        this.cooldown_time = 0;
        this.hib_cooldown  = 0;
        this.lblTarget     = null;
        this.lblTarget4    = null;
        
        this.lblTarget5    = null;
        this.lblTarget8    = null;
        this.lblTarget9    = null;
        
        this.cvsReticle    = null;
        this.last          = { slat:"", slon:"", msg:"", alpha:1.0, px:-1, py:-1 };
        this.queue         = new Array();
        this.queueBatchId  = 0;
        this.worker        = null;
        this.enable_loc    = false;
        this.layers        = new HUD.Layers(null, null);
        this.gmaps_cc_ls   = null;
        this.tile_size     = 256;
        this.hud_canvas    = null;
        this.decoder       = HUD.DecodeCanvas; // this shouldn't be changed
        this.reticleTypeId = HUD.ReticleType_P90_GreenQuad;
        
        this.did_init_view = false; // 2015-04-05 ND: fix for change layers -> forced visible bug
        this.is_hibernate  = false;
        
        if (this.decoder == HUD.DecodeCanvas)
        {
            this.InitHudCanvas();
        }//if
        
        this.InitWorker();
        this.InjectHtmlDiv();
        this.AddGmapsListeners();
    }
    
    HUD.prototype.ToggleHibernate = function()
    {
        var d  = new Date();
        var ms = d.getTime();
        if (ms - this.hib_cooldown < 500.0) return;
        this.hib_cooldown = ms;
    
        if (this.is_hibernate)
        {
            this.MapExtent_OnChange();
            this.is_hibernate = false;
            this.AddGmapsListeners();
            this.AnimateFadeInOrOut(true);
        }//if
        else
        {
            this.is_hibernate = true;
            this.RemoveGmapsListeners();
            this.queue = new Array();
            this.hud_canvas.ClearBufferCache();
            this.AnimateFadeInOrOut(false);
        }//else
    };
    
    HUD.prototype.AnimateFadeInOrOut = function(isIn)
    {
        if (    (isIn && this._div_opacity < 1.0)
            || (!isIn && this._div_opacity > 0.0))
        {
            this._div_opacity += isIn ? 0.05 : -0.05;
            
            requestAnimationFrame(function() {
                this.div.style.opacity = this._div_opacity;
                
                var b = !isIn ? 0 : (10.0 - Math.log(this._div_opacity * 9.0 + 1.0) * 0.43429448190325176 * 10.0).toFixed(1);
                var b2 = !isIn ? parseInt(90.0 + Math.log(this._div_opacity * 9.0 + 1.0) * 0.43429448190325176 * 10.0) : 90.0 + parseInt(this._div_opacity * 10.0);
                var s = "blur("+b+"px) brightness("+b2+"%)";
                this.div.style["-webkit-filter"] = s;
                this.div.style["-moz-filter"] = s;
                this.div.style["-o-filter"] = s;
                this.div.style["-ms-filter"] = s;
                this.div.style.filter = s;
                
                this.AnimateFadeInOrOut(isIn);
            }.bind(this));
        }//if
        else // end cleanup
        {
            requestAnimationFrame(function() {
                this.div.style["-webkit-filter"] = null;
                this.div.style["-moz-filter"] = null;
                this.div.style["-o-filter"] = null;
                this.div.style["-ms-filter"] = null;
                this.div.style.filter = null;
                this._div_opacity = isIn ? 1.0 : 0.0;
                this.div.style.opacity = this._div_opacity;
            }.bind(this));
        }//else
    };
    
    
    HUD.prototype.InitHudCanvas = function()
    {
        var cb_s = function(url, x, y, z, px, py, batchId, userData, rgba, width, height)
        {
            var temp_buf = new Uint8Array(rgba.length); // retain original in cache
            HUD.vcopy_u08(temp_buf, 0, rgba, 0, rgba.length);
            this.worker.postMessage({ op:"PROCESS", url:url, x:x, y:y, z:z, px:px, py:py, batchId:batchId, userData:userData, w:width, h:height, rgba:temp_buf.buffer }, [temp_buf.buffer]);
        }.bind(this);
        
        var cb_e = function(url, x, y, z, px, py, batchId, userData, rgba, width, height)
        {
            this.ReportFailure(batchId);
        }.bind(this);
        
        this.hud_canvas = new HUDCanvas(cb_s, cb_e, HUDCanvas.ModeImg);
    };

    HUD.prototype.InitWorker = function()
    {
        this.worker = new Worker("hud_worker_min.js");
        this.AddWorkerCallback(this.worker);
        this.worker.postMessage({ op:"INIT" });
    };

    HUD.prototype.AddWorkerCallback = function(worker)
    {
        worker.onerror = function(e)
        {
            var errline = e != null && e.lineno   != null ? e.lineno   : "<NULL>";
            var errfile = e != null && e.filename != null ? e.filename : "<NULL>";
            var errmsg  = e != null && e.message  != null ? e.message  : "<NULL>";
            console.log("HUD: ERROR from worker: Line " + errline + " in " + errfile + ": " + errmsg);
        }.bind(this);

        worker.onmessage = function(e)
        {
            if (e == null || e.data == null || e.data.op == null)
            {
                console.log("HUD: Message from worker: unknown.");
            }//if
            else if (e.data.op == "QUERY")
            {
                if (!e.data.fail)
                {
                    this.ReportSuccess(e.data.mid, e.data.min, e.data.max, e.data.batchId);
                }
                else
                {
                    this.ReportFailure(e.data.batchId);
                }
            }//else if
            else
            {
                console.log("HUD: Message from worker: unknown. op:[%s]", e.data.op);
            }
        }.bind(this);
    };

    HUD.prototype.ReportSuccess = function(mid, min, max, batchId)
    {        
        var hasBatch = this.QueueHasBatchId(batchId);
        var updateUI = false;

        if (hasBatch) this.QueueCancelBatchId(batchId);

        var txt = mid.toFixed(2) 
                + "<span style='font-size:11px;vertical-align:top;'><br/>"
                + "\u00B1 "
                + (max - mid == 0.0 ? "MAX" : (max - mid).toFixed(2))
                + " \u00B5" + "Sv/h"
                + "</span>";

        this.UpdateTarget(txt);
        this.SetAlpha(1.0);
        this.busy = false;
    };

    HUD.prototype.ReportFailure = function(batchId)
    {        
        if (this.QueueHasBatchId(batchId))
        {
            this.QueueProcessNext();
        }
        else
        {
            this.busy = false;
            this.SetNoTarget();
        }    
    };
    
    HUD.prototype.SetNoTarget = function()
    {
        this.UpdateTarget("NO TARGET");
        this.SetAlpha(0.7);
    };
    
    HUD.prototype.QueueHasBatchId = function(batchId)
    {
        var exists = false;

        for (var i=0; i<this.queue.length; i++)
        {
            if (this.queue[i].batchId == batchId)
            {
                exists = true;
                break;
            }//if
        }//for

        return exists;
    };
    
    HUD.prototype.QueueCancelBatchId = function(batchId)
    {
        var new_queue = new Array();

        for (var i=0; i<this.queue.length; i++)
        {
            if (this.queue[i].batchId != batchId)
            {
                new_queue.push(this.queue[i]);
            }//if
        }//for

        this.queue = new_queue;
    };


    

    HUD.prototype.ChangeReticle = function(reticleTypeId)
    {
        var sx = window.devicePixelRatio / 2.0; // original was retina scale
        
        if (this.cvsReticle == null) 
        {
            this.cvsReticle = document.createElement("canvas");
            this.cvsReticle.width  = 62.0 * sx;
            this.cvsReticle.height = 62.0 * sx;
            this.cvsReticle.style.cssText = "display:block;margin-left:auto; margin-right:auto; width:31px; height:31px; padding-bottom:5px;";
            
            this.div.appendChild(this.cvsReticle);
        }//if
        
        var ctx  = this.cvsReticle.getContext("2d");
        
        var ox = this.cvsReticle.width  / 2.0;
        var oy = this.cvsReticle.height / 2.0;
        var w  = this.cvsReticle.width;
        var h  = this.cvsReticle.height;
        
        ctx.clearRect(0,0,w,h);
        
        var sw = 1.0 * sx;
        
        var line_rgb = reticleTypeId == HUD.ReticleType_P90_USG       ? "rgb(255, 0,   0)" 
                     : reticleTypeId == HUD.ReticleType_P90_GreenQuad ? "rgb(0,   255, 0)"
                     : reticleTypeId == HUD.ReticleType_ACOG_Red      ? "rgb(255, 0,   0)"
                     : reticleTypeId == HUD.ReticleType_ACOG_Amber    ? "rgb(255, 194, 0)"
                     :                                                  "rgb(0,   255, 0)";

        if (   reticleTypeId == HUD.ReticleType_ACOG_Red
            || reticleTypeId == HUD.ReticleType_ACOG_Amber
            || reticleTypeId == HUD.ReticleType_ACOG_Green)
        {
            var length        = w;
            var length_factor = 1.0;
            var degrees0      = 180.0 - 30.0;
            var degrees1      = 180.0 + 30.0;
            var dx,dy,x0,y0,x1,y1;
    
            // not sure why deg - 90 is needed...
            degrees0 = (degrees0 - 90.0) * 0.01745329251994329576923690768489; // ->rad
            degrees1 = (degrees1 - 90.0) * 0.01745329251994329576923690768489; // ->rad

            dx = Math.cos(degrees0) * length * length_factor;
            dy = Math.sin(degrees0) * length * length_factor;
            x0 = ox + dx;
            y0 = oy + dy;
            dx = Math.cos(degrees1) * length * length_factor;
            dy = Math.sin(degrees1) * length * length_factor;
            x1 = ox + dx;
            y1 = oy + dy;
        
            ctx.beginPath(); // "\"
                ctx.strokeStyle = line_rgb;
                ctx.lineWidth   = sw * 8.0;
                ctx.moveTo(x0, y0);
                ctx.lineTo(ox, oy + sw * 4.0);
                ctx.lineTo(x1, y1);
            ctx.stroke();
        }//if
        
        if (reticleTypeId == HUD.ReticleType_P90_USG)
        {
            ctx.beginPath(); // B
                ctx.arc(ox, oy, 0.5 * sx, 0, 2 * Math.PI);
                ctx.lineWidth = 1.0 * sw;
                ctx.strokeStyle = "rgb(0,0,0)";
            ctx.stroke();
        }//if

        if (reticleTypeId == HUD.ReticleType_P90_GreenQuad)
        {
            ctx.beginPath(); // up
                ctx.strokeStyle = line_rgb;
                ctx.lineWidth   = sw * 2.0;
                ctx.moveTo(ox, 3.0 * sw);
                ctx.lineTo(ox, oy - 3.0 * sw * 2.0);
            ctx.stroke();
        }//if
        
        if (   reticleTypeId == HUD.ReticleType_P90_GreenQuad
            || reticleTypeId == HUD.ReticleType_P90_USG)
        {
            ctx.beginPath(); // down
                ctx.strokeStyle = line_rgb;
                ctx.lineWidth   = sw * 2.0;
                ctx.moveTo(ox, h - 3.0 * sw);
                ctx.lineTo(ox, oy + 3.0 * sw * 2.0);
            ctx.stroke();
        
            ctx.beginPath(); // left
                ctx.strokeStyle = line_rgb;
                ctx.lineWidth   = sw * 2.0;
                ctx.moveTo(3.0 * sw, oy);
                ctx.lineTo(ox - 3.0 * sw * 2.0, oy);
            ctx.stroke();
        
            ctx.beginPath(); // right
                ctx.strokeStyle = line_rgb;
                ctx.lineWidth   = sw * 2.0;
                ctx.moveTo(w - 3.0 * sw, oy);
                ctx.lineTo(ox + 3.0 * sw * 2.0, oy);
            ctx.stroke();
        
            ctx.beginPath(); // B
                ctx.arc(ox, oy, 6.0 * sx, 0, 2 * Math.PI);
                ctx.lineWidth = 3.0 * sw;
                ctx.strokeStyle = "rgb(0,0,0)";
            ctx.stroke();

            ctx.beginPath(); // A
                ctx.arc(ox, oy, 29.0 * sx, 0, 2 * Math.PI);
                ctx.lineWidth = 3.0 * sx;
                ctx.strokeStyle = "rgb(0,0,0)";
            ctx.stroke();
        }//if
    };

    // test function, only HUD.ReticleType_P90_GreenQuad is in active use.
    HUD.prototype.NextReticleType = function()
    {
        this.reticleTypeId = this.reticleTypeId == HUD.ReticleType_P90_USG       ? HUD.ReticleType_P90_GreenQuad
                           : this.reticleTypeId == HUD.ReticleType_P90_GreenQuad ? HUD.ReticleType_ACOG_Red
                           : this.reticleTypeId == HUD.ReticleType_ACOG_Red      ? HUD.ReticleType_ACOG_Amber
                           : this.reticleTypeId == HUD.ReticleType_ACOG_Amber    ? HUD.ReticleType_ACOG_Green
                           :                                                       HUD.ReticleType_P90_USG;
        
        this.ChangeReticle(this.reticleTypeId);
    };
    
    HUD.prototype.InjectHtmlDiv = function()
    {
        var divtxt = "position:absolute;top:0;bottom:0;left:0;right:0;margin:auto;width:170px;height:86px;z-index:2;"
                   + "padding-top:55px;text-align:center;"
                   + "overflow-x:hidden;overflow-y:hidden;"
                   + "font-size:18px;font-family: Futura,Futura-Medium,'Futura Medium','Futura ND Medium','Futura Std Medium','Futura Md BT','Century Gothic','Segoe UI',Helvetica,Arial,sans-serif;"
                   + "pointer-events:none;opacity:0.0;";
                   
                   
        if (navigator.vendor != null && navigator.vendor == "Apple Computer, Inc."
            && "WebkitAppearance" in document.documentElement.style) // safari not chrome.
        {
            divtxt += "text-rendering:optimizeSpeed;font-kerning:none;font-feature-settings:'kern' 0;-webkit-font-feature-settings:'kern' 0;"; 
        }//if
        else if ("MozAppearance" in document.documentElement.style)
        {
            divtxt += "letter-spacing:0px;text-rendering:optimizeSpeed;font-kerning:none;font-feature-settings:'kern' 0;-moz-font-feature-settings:'kern' 0;"; // only works on ff win, not ff osx
        }//else if
        else
        {
            divtxt += "letter-spacing:0px;";
        }//else

        this.div.innerHTML = "";
        this.div.style.cssText = divtxt;
        
        this.ChangeReticle(this.reticleTypeId);

        var etc    = "display:block;margin-left:auto;margin-right:auto;text-align:center;";
        var abscss = "position:absolute;top:91;left:0;right:0;margin-bottom:auto;z-index:-1;";
        var str_bl = "color:#000;";
        var str_gr = "color:#0F0;";

        this.lblTarget = document.createElement("div");

        this.lblTarget4 = document.createElement("div");
        this.lblTarget5 = document.createElement("div");
        this.lblTarget8 = document.createElement("div");
        this.lblTarget9 = document.createElement("div");
            
        var shd = "text-shadow:0px 0px 4px #000;";
            
        this.lblTarget.style.cssText  = shd + etc + str_gr;
            
        // +---+---+---+
        // | 7 | 4 | 6 |
        // +---+---+---+
        // | 9 | T | 8 |            
        // +---+---+---+
        // | 3 | 5 | 2 |
        // +---+---+---+
            
        abscss = "position:absolute;top:92px;left:0px;right:0px;z-index:-1;"; // (0, +1)
        shd = "text-shadow:-1px 0px 4px #000;";
        this.lblTarget5.style.cssText = shd + etc + str_bl + abscss;
        abscss = "position:absolute;top:90px;left:0px;right:0px;z-index:-1;"; // (0, -1)
        shd = "text-shadow:1px 0px 4px #000;";
        this.lblTarget4.style.cssText = shd + etc + str_bl + abscss;
        abscss = "position:absolute;top:91px;left:1px;right:0px;z-index:-1;"; // (+1, 0)
        shd = "text-shadow:0px 1px 4px #000;";
        this.lblTarget8.style.cssText = shd + etc + str_bl + abscss;
        abscss = "position:absolute;top:91px;left:0px;right:1px;z-index:-1;"; // (-1, 0)
        shd = "text-shadow:0px -1px 4px #000;";
        this.lblTarget9.style.cssText = shd + etc + str_bl + abscss;

        this.div.appendChild(this.lblTarget);
        if (this.lblTarget4 != null) this.div.appendChild(this.lblTarget4);        
        if (this.lblTarget5 != null) this.div.appendChild(this.lblTarget5);
        if (this.lblTarget8 != null) this.div.appendChild(this.lblTarget8);
        if (this.lblTarget9 != null) this.div.appendChild(this.lblTarget9);

        this.ready = true;
    };

    HUD.prototype.UpdateLatLon = function(lat, lon)
    {
        var slat = lat.toFixed(4);
        var slon = lon.toFixed(4);
        
        if (this.last.slat != slat || this.last.slon != slon)
        {
            this.lblTarget.innerHTML =  this.last.msg + "<br/>" + this.last.slat + ", " + this.last.slon;            
            this.last.slat = slat;
            this.last.slon = slon;
        }//if
    };

    HUD.prototype.UpdateTarget = function(txt)
    {
        if (this.last.msg != txt)
        {
            requestAnimationFrame(function() { 
                this.lblTarget.innerHTML = this.enable_loc ? txt + "<br/>" + this.last.slat + ", " + this.last.slon : txt;
                if (this.lblTarget4 != null) this.lblTarget4.innerHTML = this.lblTarget.innerHTML;
                if (this.lblTarget5 != null) this.lblTarget5.innerHTML = this.lblTarget.innerHTML;
                if (this.lblTarget8 != null) this.lblTarget8.innerHTML = this.lblTarget.innerHTML;
                if (this.lblTarget9 != null) this.lblTarget9.innerHTML = this.lblTarget.innerHTML;

                this.last.msg = txt;
            }.bind(this));
        }//if
    };

    HUD.prototype.SetAlpha = function(a)
    {
        if (a != this.last.alpha)
        {
            requestAnimationFrame(function() { 
                this.lblTarget.style.opacity = a;
                this.last.alpha = a;
            }.bind(this));
        }//if
    };

    HUD.prototype.AddGmapsListeners = function()
    {
        var fxRefresh = function() 
        {
            if (this.ready)
            {
                this.MapExtent_OnChange();
            }//if
        }.bind(this);

        if (this.gmaps_cc_ls == null) this.gmaps_cc_ls = google.maps.event.addListener(this.mapRef, "center_changed", fxRefresh);
    };
    
    HUD.prototype.RemoveGmapsListeners = function()
    {
        if (this.gmaps_cc_ls != null)
        {
            google.maps.event.removeListener(this.gmaps_cc_ls);
            this.gmaps_cc_ls = null;
        }
    };

    HUD.prototype.SetLayers = function(newLayers)
    {
        var old_layers_n = this.layers.layers.length;
    
        this.layers.Clear();
        this.SetNoTarget();

        for (var i=0; i<newLayers.length; i++)
        {
            this.layers.Add(newLayers[i].urlTemplate, newLayers[i].bitstoreLayerId);
        }//for
        
        // 2015-04-05 ND: fix for layer change -> forced visible bug
        if (!this.did_init_view)
        {
            this.did_init_view = true;
            this.MapExtent_OnChange();
            this.AnimateFadeInOrOut(true);
        }//if
    };

    HUD.prototype.SetFxCheckBitstores = function(fxCheckBitstores)
    {
        this.layers.fxCheckBitstores = fxCheckBitstores;
    };
    
    HUD.prototype.SetFxCheckSize = function(fxCheckSize)
    {
        this.layers.fxCheckSize = fxCheckSize;
    };
    
    HUD.prototype.SetFxCheckMaxZ = function(fxCheckMaxZ)
    {
        this.layers.fxCheckMaxZ = fxCheckMaxZ;
    };

    HUD.prototype.GetCentroidForVisibleExtent = function()
    {
        var loc = this.mapRef.getCenter();
        var lat = loc.lat();
        var lon = loc.lng();

        var z   = this.mapRef.getZoom();
        if (lon > 180.0 || lon < -180.0) { lon = lon % 360.0 == lon % 180.0 ? lon % 180.0 : (lon > 0.0 ? -1.0 : 1.0) * 180.0 + (lon % 180.0); } // thanks google

        return { lat:lat, lon:lon, z:z };
    };

    HUD.prototype.GetCentroidXyzForVisibleExtent = function()
    {
        var llz = this.GetCentroidForVisibleExtent();
        llz.lat = HUD.ClampLatToMercPlane(llz.lat);
        var rxy = HUD.LatLonWidthToXYZ_EPSG3857(llz.lat, llz.lon, this.tile_size, llz.z);

        return { x:rxy.x, y:rxy.y, z:llz.z };
    };

    HUD.prototype.MapExtent_OnChange = function()
    {
        var d  = new Date();
        var ms = d.getTime();
        if (ms - this.cooldown_time < 16.666667) return;
        this.cooldown_time = ms;

        var llz = this.GetCentroidForVisibleExtent();
        if (this.enable_loc) this.UpdateLatLon(llz.lat, llz.lon);
        
        if (this.busy) return;
        
        var xyz = this.GetCentroidXyzForVisibleExtent();
        var px  = xyz.x % this.tile_size;
        var py  = xyz.y % this.tile_size;

        if (px != this.last.px || py != this.last.py)
        {
            this.busy    = true;
            this.last.px = px;
            this.last.py = py;

            var tx   = parseInt(xyz.x / this.tile_size);
            var ty   = parseInt(xyz.y / this.tile_size);
            var qbid = this.queueBatchId++;
            var adds = false;

            for (var i=0; i<this.layers.layers.length; i++)
            {
                var tc  = this.layers.TranslateCoordsForIdx(i, tx, ty, xyz.z, xyz.x, xyz.y, this.tile_size, window.devicePixelRatio > 1.5);
                var url = this.layers.GetUrl(i, tc.x, tc.y, tc.z);
                
                if (url != null)
                {
                    this.QueueAdd(qbid, url, tc.x, tc.y, tc.z, tc.px, tc.py, null);
                    adds = true;
                }//if
            }//for
            
            if (!adds)
            {
                this.busy = false;
                this.SetNoTarget();
            }//if
            
            this.QueueProcessNext();
        }//if
    };


    HUD.prototype.QueueProcessNext = function()
    {
        if (this.queue.length == 0) return;
        var task = this.queue.pop();
        
        if (this.decoder == HUD.DecodeWorker)
        {
            this.worker.postMessage({ op:"QUERY", url:task.url, x:task.x, y:task.y, z:task.z, px:task.px, py:task.py, batchId:task.batchId, userData:task.userData });
        }//if
        else
        {
            this.hud_canvas.GetAsyncPngFromCanvasByMode(task.url, task.x, task.y, task.z, task.px, task.py, task.batchId, task.userData)
        }//else
    };

    HUD.prototype.QueueAdd = function(batchId, url, x, y, z, px, py, userData)
    {
        this.queue.push({ batchId:batchId, url:url, x:x, y:y, z:z, px:px, py:py, userData:userData });
    };
    
    HUD.ClampLatToMercPlane = function(lat) { return lat > 85.05112878 ? 85.05112878 : lat < -85.05112878 ? -85.05112878 : lat; };

    HUD.LatLonWidthToXYZ_EPSG3857 = function(lat, lon, width, z)
    {
        var x  = (lon + 180.0) * 0.002777778;
        var s  = Math.sin(lat * 0.0174532925199);
        var y  = 0.5 - Math.log((1.0 + s) / (1.0 - s)) * 0.0795774715459;
        var w  = width << z;
        var px = parseInt(x * w + 0.5);
        var py = parseInt(y * w + 0.5);
        return { "x":px, "y":py };
    };
    
    HUD.vcopy_u08 = function(d,od,s,os,n) { d.subarray(od,od+n).set(s.subarray(os,os+n)); };

    HUD.DecodeWorker = 0;
    HUD.DecodeCanvas = 1;
    
    HUD.ReticleType_P90_USG       = 0;
    HUD.ReticleType_P90_GreenQuad = 1;
    HUD.ReticleType_ACOG_Red      = 2;
    HUD.ReticleType_ACOG_Amber    = 3;
    HUD.ReticleType_ACOG_Green    = 4;

    HUD.Layers = (function()
    {
        function Layers(fxCheckBitstores, fxCheckSize, fxCheckMaxZ)
        {
            this.fxCheckBitstores = fxCheckBitstores;
            this.fxCheckSize      = fxCheckSize;
            this.fxCheckMaxZ      = fxCheckMaxZ;
            this.layers           = new Array();
        }

        Layers.prototype.GetUrl = function(idx, x, y, z)
        {
            var url = null;

            if (   this.fxCheckBitstores == null 
                || this.layers[idx].bitstoreLayerId < 0
                || this.fxCheckBitstores(this.layers[idx].bitstoreLayerId, x, y, z))
            {
                url = this.layers[idx].GetUrl(x, y, z);
            }//if

            return url;
        };
        
        // 2015-08-31 ND: enable multi tile resolution. This uses 256x256 tile internal coordinates,
        //                and translates to whatever tile resolution the layer uses.
        Layers.prototype.TranslateCoordsForIdx = function(idx, x, y, z, px, py, tile_size, isRetina)
        {
            var layer = this.layers[idx];
            var r     = { x:x, y:y, z:z, px:px, py:py, tile_size:tile_size };
            
            // todo: fix this to work on cases other than 256x256 -> 512x512
            // note: this assumes (for retina displays with 512x512 tiles) cheating to max_z+1 using 256x256 tiles
            if (layer.width > r.tile_size)
            {
                if (r.z > 0)
                {
                    r.x >>= 1;
                    r.y >>= 1;
                    r.z  -= 1;

                    r.px = r.px % 2 == 0 ? r.px : r.tile_size + r.px;
                    r.py = r.py % 2 == 0 ? r.py : r.tile_size + r.py;
                    
                    r.tile_size = layer.width;
                }//if
                else
                {
                    r.px <<= 1;
                    r.py <<= 1;
                }//else
            }//if
            
            return r;
        };
        
        Layers.prototype.TranslateCoordsForBitstoreLayerId = function(bitstoreLayerId, x, y, z, px, py, tile_size, isRetina)
        {
            var idx = this.GetLayerIdxForBitstoreLayerId(bitstoreLayerId);
            return this.TranslateCoordsForIdx(idx, x, y, z, px, py, tile_size, isRetina);
        };

        Layers.prototype.Add = function(urlTemplate, bitstoreLayerId)
        {
            var px    = 256;
            var max_z = 23;
            
            if (bitstoreLayerId != null)
            {
                if (this.fxCheckSize != null)
                {
                    var wh = this.fxCheckSize(bitstoreLayerId);
                    px = wh.w;
                }//if
                if (this.fxCheckMaxZ != null)
                {
                    max_z = this.fxCheckMaxZ(bitstoreLayerId);
                }//if
            }//if
            
            this.layers.push(new Layers.Layer(urlTemplate, bitstoreLayerId, px, max_z));
        };

        Layers.prototype.Clear = function()
        {
            this.layers = new Array();
        };

        Layers.Layer = (function()
        {
            function Layer(urlTemplate, bitstoreLayerId, px, max_z)
            {
                this.urlTemplate     = urlTemplate;
                this.bitstoreLayerId = bitstoreLayerId;
                this.tile_size       = px;
                this.max_z           = max_z;
            }

            Layer.prototype.GetUrl = function(x, y, z)
            {
                var template = this.urlTemplate;
                template = template.replace(/{x}/g, ""+x);
                template = template.replace(/{y}/g, ""+y);
                template = template.replace(/{z}/g, ""+z);   
                return template;
            };
        
            return Layer;
        })(); // -- HUD.Layers.Layer --

        return Layers;
    })(); // -- HUD.Layers --

    return HUD;
})(); // -- HUD --















// HUDLUT: This was originally going to be a worker class, but that was rewritten.
//         It is present here as it was used to generate the data the worker uses
//         for matching colors to values.  This shouldn't be removed.

/*
var HUDLUT = (function()
{
    function HUDLUT(min, max)
    {
        this.min = min;
        this.max = max;
        this.r = null;
        this.g = null;
        this.b = null;
        this.n = this.r.length;
        this.rdiff = 1.0 / (this.max - this.min);
        this.nsb1  = parseFloat(this.n - 1.0);
        
        
        this.cache_r = new Array();
        this.cache_g = new Array();
        this.cache_b = new Array();
        this.cache_i = new Array();
        
        this.Discretize(64);
        
        this.Test();
    }//LUT
    
    HUDLUT.prototype.Test = function()
    {
        var vs = new Float64Array(this.n);
        
        for (var i=0; i<this.n; i++)
        {
            vs[i] = this.GetValueForIdx(i);
        }//for
        
        var last_r = -9000;
        var last_g = -9000;
        var last_b = -9000;
        
        var d_r = new Array();
        var d_g = new Array();
        var d_b = new Array();
        var d_v = new Array();
        
        var vs16 = new Uint16Array(vs.length);
        
        for (var i=0; i<vs.length; i++)
        {
            vs16[i] = vs[i] * 1000.0;
        }
        
        for (var i=0; i<this.n; i++)
        {
            if (this.r[i] != last_r || this.g[i] != last_g || this.b[i] != last_b)
            {
                d_r.push(this.r[i]);
                d_g.push(this.g[i]);
                d_b.push(this.b[i]);
                d_v.push(vs16[i]);
                
                last_r = this.r[i];
                last_g = this.g[i];
                last_b = this.b[i];
            }//if
        }
        
        var sr = "";
        var sg = "";
        var sb = "";
        var sv = "";
        
        for (var i=0; i<d_r.length; i++)
        {
            sv += d_v[i] < 0x0010 ? "000" + d_v[i].toString(16) 
                : d_v[i] < 0x0100 ?  "00" + d_v[i].toString(16) 
                : d_v[i] < 0x1000 ?   "0" + d_v[i].toString(16) 
                :                           d_v[i].toString(16);
                
            sr += (d_r[i] < 0x10 ? "0" : "") + d_r[i].toString(16);
            sg += (d_g[i] < 0x10 ? "0" : "") + d_g[i].toString(16);
            sb += (d_b[i] < 0x10 ? "0" : "") + d_b[i].toString(16);
        }
        
        console.log("sr = '%s';", sr);
        console.log("sg = '%s';", sg);
        console.log("sb = '%s';", sb);
        console.log("sv = '%s';", sv);


        
        var si = "";
        
        for (var i=0; i<d_r.length; i++)
        {
            //sr += d_r[i] + ",";
            //sg += d_g[i] + ",";
            //sb += d_b[i] + ",";
            //sv += d_v[i].toFixed(2) + ",";
            si += "[" + i + "] " + d_v[i] + ", (" + d_r[i] + ", " + d_g[i] + ", " + d_b[i] + ")\n";
        }
        
        console.log(si);
    };
    
    
    
    
    HUDLUT.prototype.Cache_GetIdx_RGB888 = function(r,g,b)
    {
        var idx = -1;
        
        for (var i=0; i<this.cache_r.length; i++)
        {
            if (this.cache_r[i] == r && this.cache_g[i] == g && this.cache_b[i] == b)
            {
                idx = this.cache_i[i];
                break;
            }//if
        }//for
        
        return idx;
    };
    
    HUDLUT.prototype.Cache_AddIdx_RGB888 = function(r,g,b,i)
    {
        this.cache_r.push(r);
        this.cache_g.push(g);
        this.cache_b.push(b);
        this.cache_i.push(i);
    };

    
    
    HUDLUT.prototype.GetColorForIdx_RGB888 = function(i)
    {
        return [this.r[i], this.g[i], this.b[i]];
    };
    
    HUDLUT.prototype.GetIdxForValue = function(x, rsn)
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
    
    HUDLUT.prototype.GetColorForValue_RGB888 = function(x, rsn)
    {
        var i = this.GetIdxForValue(x, rsn);
        return [this.r[i], this.g[i], this.b[i]];
    };
    
    HUDLUT.prototype.FindFirstIdx_RGB888 = function(r, g, b)
    {
        var idx = -1;
        
        for (var i=0; i<this.r.length; i++)
        {
            if (this.r[i] == r && this.g[i] == g && this.b[i] == b)
            {
                idx = i;
                break;
            }//if
        }//for
        return idx;
    };
    
    HUDLUT.prototype.FindNextColorIdxAfterIdx = function(idx)
    {
        if (idx < 0) return -1;
        
        var nidx= -1;
        
        var r = this.r[idx];
        var g = this.g[idx];
        var b = this.b[idx];
        
        for (var i=idx+1; i<this.r.length; i++)
        {
            if (this.r[i] != r || this.g[i] != g || this.b[i] != b)
            {
                nidx = i;
                break;
            }//if
        }//for
        return nidx;
    };
    
    HUDLUT.prototype.GetMedianIdxForColor_RGB888 = function(r, g, b)
    {
        var idx0 = this.FindFirstIdx_RGB888(r,g,b);
        var idx1 = this.FindNextColorIdxAfterIdx(idx0);
        
        return idx0 == idx1 || idx1 == -1 ? idx0 : parseInt((idx0+idx1-1.0)*0.5);
    };

    
    HUDLUT.prototype.GetMedianValueForColor_RGB888 = function(r, g, b)
    {
        var idx = this.GetMedianIdxForColor_RGB888(r,g,b);
        if (idx == -1) idx = this.Cache_GetIdx_RGB888(r,g,b);        
        if (idx == -1) idx = this.FindNearestColorIdx_RGB888(r,g,b);
        
        return this.GetValueForIdx(idx);
    };
    
    HUDLUT.prototype.FindNearestColorIdx_RGB888 = function(r, g, b)
    {
        var    n = 256;
        var dest = new Float64Array(n);
        
        HUDLUT.vspythag3d(r, g, b, this.r, this.g, this.b, dest);
        
        var iv = HUDLUT.sviminv(dest);
        
        if (iv.idx != -1)
        {
            this.Cache_AddIdx_RGB888(r, g, b, iv.idx);
        }//if
                    
        return iv.idx;
    };
    
    
    HUDLUT.prototype.GetValueForIdx = function(idx)
    {
        if (idx == -1)
        {
            console.log("HUDLUT.GetValueForIdx: ERR: Color not found in LUT.");
            return 0.0;
        }//if
    
        var base   = 10.0;
        var target = 4;
        var invbs1 = 1.0 / (base - 1.0);
        var x      = parseFloat(idx)/parseFloat(this.r.length);
        
        for (var i=0; i<target; i++)
        {
            x  = Math.pow(base, x) - 1.0;
            x *= invbs1;
        }//for
        
        x *= (this.max - this.min);
        x += (this.min);
        
        return x;
    };
    
    HUDLUT.prototype.Discretize = function(steps)
    {
        var minVal = 0;
        var maxVal = this.r.length;
        var curStart = minVal;
        var stride = this.r.length / steps;
        if (stride < 1) stride = 1;
        var curEnd = curStart + stride <= maxVal ? curStart + stride : maxVal;
    
        var f_mean;
    
        while (curStart <= maxVal)
        {
            f_mean = HUDLUT.meanv(this.r, curStart, curEnd - curStart);
            f_mean = Math.round(f_mean); if (f_mean > 255.0) f_mean = 255.0;
            HUDLUT.vfill(f_mean,  this.r, curStart, curEnd - curStart);
        
            f_mean = HUDLUT.meanv(this.g, curStart, curEnd - curStart);
            f_mean = Math.round(f_mean); if (f_mean > 255.0) f_mean = 255.0;
            HUDLUT.vfill(f_mean,  this.g, curStart, curEnd - curStart);

            f_mean = HUDLUT.meanv(this.b, curStart, curEnd - curStart);
            f_mean = Math.round(f_mean); if (f_mean > 255.0) f_mean = 255.0;
            HUDLUT.vfill(f_mean,  this.b, curStart, curEnd - curStart);

            curStart += stride;
            curEnd    = curStart + stride <= maxVal ? curStart + stride : maxVal;
        }//while
    };
    
    HUDLUT.sviminv = function(src)
    {
        var idx = -1;
        var val = 9999999.0
        
        for (var i=0; i<src.length; i++)
        {
            if (src[i] < val)
            {
                val = src[i];
                idx = i;
            }//if
        }//for
        
        return { idx:idx, val:val };
    };
    
    HUDLUT.vspythag3d = function(x, y, z, xs, ys, zs, dest)
    {
        var dx,dy,dz;
        for (var i=0; i<xs.length; i++)
        {
            dx = (xs[i] - x);
            dy = (ys[i] - y);
            dz = (zs[i] - z);
            dest[i] = Math.sqrt(dx*dx + dy*dy + dz*dz);
        }//for
    };
    
    HUDLUT.meanv = function(s,o,n) { var m=0.0;for(var i=o;i<o+n;i++)m+=s[i];return m/n; };
    HUDLUT.vsmul = function(s,x,d,n) { var i,m=n-(n%4);for(i=0;i<m;i+=4){d[i]=s[i]*x;d[i+1]=s[i+1]*x;d[i+2]=s[i+2]*x;d[i+3]=s[i+3]*x;}for(i=m;i<m+n%4;i++)d[i]=s[i]*x; };
    HUDLUT.vfill = function(x,d,o,n) { var i,m=(o+n)-((o+n)%4);for(i=o;i<m;i+=4){d[i]=x;d[i+1]=x;d[i+2]=x;d[i+3]=x;}for(i=m;i<m+n%4;i++)d[i]=x; };
    
    return HUDLUT;
})();
*/

































