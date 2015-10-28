//importScripts("png_zlib_worker_min.js");
//importScripts("zlib.js", "png_worker.js");

self.hudq = null;

self.onmessage = function(e)
{
    if (e.data.op == "INIT")
    {
        hudq = new HUDQ(self.postSuccess, self.postFailure, 15);
    }//if
    else if (e.data.op == "QUERY")
    {
        self.hudq.GetValueAsyncCached_PNG_URL_Canvas(e.data.url, e.data.x, e.data.y, e.data.z, e.data.px, e.data.py, e.data.batchId, e.data.userData);
    }//if
    else if (e.data.op == "PROCESS")
    {
        var rgba08 = new Uint8Array(e.data.rgba);
        self.hudq.cache.AddBufferDistinct(e.data.url, rgba08, e.data.w, e.data.h, e.data.w * 4, e.data.x, e.data.y, e.data.z);
        self.hudq.GetValueAsyncCached_PNG_URL_Canvas(e.data.url, e.data.x, e.data.y, e.data.z, e.data.px, e.data.py, e.data.batchId, e.data.userData);
    }//else if
};

self.postFailure = function(batchId)
{
    self.postMessage( {op:"QUERY", fail:true, mid:0, min:0, max:0, batchId:batchId } );
};

self.postSuccess = function(mid, min, max, batchId)
{
    self.postMessage( {op:"QUERY", fail:false, mid:mid, min:min, max:max, batchId:batchId } );
};



var HUDQ = (function()
{
    function HUDQ(fxCallbackSuccess, fxCallbackFailure, ret_r)
    {
        this.fxCallbackSuccess = fxCallbackSuccess;
        this.fxCallbackFailure = fxCallbackFailure;
        this.lionel_lut   = new LionelHUDLUT(LionelHUDLUT.DecoderLionel);
        this.gb64_lut     = new LionelHUDLUT(LionelHUDLUT.DecoderGB64);
        this.ret_r        = ret_r;
        this.debug        = { hits:0, misses:0 };
        this.bad_urls     = new Array();
        this.cache        = new HUDQ.BufferCache(2);
    }

    HUDQ.prototype.GetValueIfCached = function(url, x, y, z, ret_mpx, ret_mpy, batchId, userData)
    {
        var retVal = false;
        var o = this.cache.GetBuffer(url);

        if (o != null && o.url == url)
        {
            this.FindNearestValue_RGBA8888(o.rgba, o.w, o.h, o.rb, o.x, o.y, o.z, ret_mpx, ret_mpy, url, batchId, userData);
            this.debug.hits++;
            retVal = true;
        }//if
        else
        {
            this.debug.misses++;
        }//else

        return retVal;
    };
    
    HUDQ.prototype.GetValueAsync_PNG_URL_PNGJS = function(url, x, y, z, ret_mpx, ret_mpy, batchId, userData)
    {
        var getCallback = function(response, userData)
        {
            var rgba   = HUDQ.GetNewRGBA8888_FromPNG_PNGJS(response);
            var width  = Math.round(Math.sqrt(rgba.length >>> 2));
            var height = width;
            
            if (width != 256 || height != 256)
            {
                console.log("HUDQ.GetValueAsync_PNG_URL_PNGJS: [WARN] w/h were %d, expected 256 or 512", width);
            }//if
            
            this.FindNearestValue_RGBA8888(rgba, width, height, width<<2, x, y, z, ret_mpx, ret_mpy, url, batchId, userData);
        }.bind(this);

        this.GetAsync_HTTP(url, "arraybuffer", getCallback, userData, batchId);
    };
    
    HUDQ.GetNewRGBA8888_FromPNG_PNGJS = function(srcArrayBuffer)
    {
        var buf  = new Uint8Array(srcArrayBuffer);
        var png  = new PNG(buf);
        
        if (png == null) console.log("HUDQ.GetNewRGBA8888_FromPNG_PNGJS: [WARN] new PNG(buf) == null!");
        
        var rgba = png.decode();
        
        if (rgba == null) console.log("HUDQ.GetNewRGBA8888_FromPNG_PNGJS: [WARN] rgba == null!");

        return rgba;
    };

    HUDQ.prototype.GetValueAsyncCached_PNG_URL_Canvas = function(url, x, y, z, ret_mpx, ret_mpy, batchId, userData)
    {
        var  wasCached = this.GetValueIfCached(url, x, y, z, ret_mpx, ret_mpy, batchId, userData);
        if (!wasCached)
        {
            if (!this.IsBadUrl(url)) this.GetValueAsync_PNG_URL_PNGJS(url, x, y, z, ret_mpx, ret_mpy, batchId, userData);
            else this.fxCallbackFailure(batchId);
        }//if
    };

    HUDQ.prototype.IsBadUrl = function(url)
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

    HUDQ.prototype.FindNearestValue_RGBA8888 = function(src, w, h, rb, tile_x, tile_y, tile_z, ret_mpx, ret_mpy, url, batchId, userData)
    {
        var idx = this.FindNearestIdx_RGBA8888(src, w, h, rb, tile_x, tile_y, tile_z, ret_mpx, ret_mpy, url);
        var nt  = idx == -1;

        if (idx > -1)
        {
            var val;

            if (url.indexOf("Griddata") > -1 || url.indexOf("tg512") > -1) // ugly hack
            {
                val = this.lionel_lut.GetValuesForColor_RGB888(src[idx], src[idx+1], src[idx+2]);
            }//if
            else
            {
                val = this.gb64_lut.GetValuesForColor_RGB888(src[idx], src[idx+1], src[idx+2]);
            }//else

            nt = val.min == 0.0 && val.max < 0.0;
            
            if (nt)
            {
                console.log("HUDQ.FindNearestValue: Color loookup failed for RGB(%d, %d, %d)", src[idx], src[idx+1], src[idx+2]);
            }//if

            if (!nt) this.fxCallbackSuccess(val.median, val.min, val.max, batchId);
        }//if

        if (nt) this.fxCallbackFailure(batchId);
    };

    HUDQ.prototype.GetAsync_HTTP = function(url, responseType, fxCallback, userData, batchId)
    {    
        var req = new XMLHttpRequest();
        req.open("GET", url, true);
        if (responseType != null) req.responseType = responseType;

        req.onreadystatechange = function()
        {
            if (req.readyState === 4 && req.status == 200 && req.response != null)
            {
                fxCallback(req.response, userData);
            }//if
            else if (req.readyState === 4)
            {
                this.fxCallbackFailure(batchId);
                if (this.bad_urls.length < 1024) this.bad_urls.push(url);
                console.log("HUDQ.GetAsync_HTTP: error %d getting url:[%s].", req.status, url);
            }//else
        }.bind(this);

        req.send(null);
    };

    HUDQ.GetDirectIdx_RGBA8888 = function(src, w, h, rb, ox, oy, athr)
    {
        var idx = -1;

        if (       src[oy * rb + (ox<<2) + 3] >= athr
            && (   src[oy * rb + (ox<<2) + 0] != 0 
                || src[oy * rb + (ox<<2) + 1] != 0
                || src[oy * rb + (ox<<2) + 2] != 0))
        {
            idx = oy * rb + (ox<<2);
        }//if

        return idx;
    };

    HUDQ.FindNearestIdx_HaloNN_RGBA8888 = function(src, w, h, rb, ox, oy, search_r, athr)
    {
        var y,x,y_rb,idx = -1;
        var y0 = oy > search_r     ? oy - search_r : 0;
        var y1 = oy + search_r < h ? oy + search_r : h-1;
        var x0 = ox > search_r     ? ox - search_r : 0;
        var x1 = ox + search_r < w ? ox + search_r : w-1;

        x0 *= 4;
        x1 *= 4;
        x0 += 3; // optimize for alpha
        x1 += 3;

        y = y0; // first row

        if (y != oy)
        {
            y_rb = y * rb;

            for (x=x0; x<=x1; x+=4)
            {
                if (src[y_rb + x] >= athr
                    && (src[y_rb+x-3] != 0 || src[y_rb+x-2] != 0 || src[y_rb+x-1] != 0))
                {
                    idx = y_rb + x - 3;
                    break;
                }//if
            }//for
        }//if

        if (idx == -1 && y1 != oy && y1 != y0)
        {
            y    = y1;      // last row
            y_rb = y * rb;
            for (x=x0; x<=x1; x+=4)
            {
                if (src[y_rb + x] >= athr
                    && (src[y_rb+x-3] != 0 || src[y_rb+x-2] != 0 || src[y_rb+x-1] != 0))
                {
                    idx = y_rb + x - 3;
                    break;
                }//if
            }//for
        }//if

        if (idx == -1) // the less efficient column search
        {
            if (y0 < h-1) y0++;
            if (y1 >   0) y1--; // already did these
            for (y=y0; y<=y1; y++)
            {
                y_rb = y * rb;

                if (src[y_rb + x0] >= athr
                    && (src[y_rb+x0-3] != 0 || src[y_rb+x0-2] != 0 || src[y_rb+x0-1] != 0))
                {
                    idx = y_rb + x0 - 3;
                    break;
                }//if
                else if (src[y_rb + x1] >= athr
                        && (src[y_rb+x1-3] != 0 || src[y_rb+x1-2] != 0 || src[y_rb+x1-1] != 0))
                {
                    idx = y_rb + x1 - 3;
                    break;
                }//if
            }//for
        }//if

        return idx;
    };

    HUDQ.FindNearestIdx_NN_RGBA8888 = function(src, w, h, rb, ox, oy, search_r, athr)
    {
        var y,x,y_rb,idx = -1;
        var y0 = oy > search_r     ? oy - search_r : 0;
        var y1 = oy + search_r < h ? oy + search_r : h-1;
        var x0 = ox > search_r     ? ox - search_r : 0;
        var x1 = ox + search_r < w ? ox + search_r : w-1;

        x0 *= 4;
        x1 *= 4;
        x0 += 3; // optimize for alpha test
        x1 += 3;

        for (y=y0; y<=y1; y++)
        {
            y_rb = y * rb;

            for (x=x0; x<=x1; x+=4)
            {
                if (src[y_rb + x] >= athr
                    && (src[y_rb+x-3] != 0 || src[y_rb+x-2] != 0 || src[y_rb+x-1] != 0))
                {
                    idx = y_rb + x - 3;
                    break;
                }//if
            }//for
        }//for

        return idx;
    };

    HUDQ.FindNearestIdx_SearchNN_RGBA8888 = function(src, w, h, rb, ox, oy, max_r, athr)
    {
        var idx = HUDQ.GetDirectIdx_RGBA8888(src, w, h, rb, ox, oy, athr);

        if (idx == -1) idx = HUDQ.FindNearestIdx_NN_RGBA8888(src, w, h, rb, ox, oy, 1, athr);

        if (idx == -1 && max_r > 1)
        {
            for (var i=2; i<=max_r; i++)
            {
                idx = HUDQ.FindNearestIdx_HaloNN_RGBA8888(src, w, h, rb, ox, oy, i, athr);
                
                if (idx != -1) break;
            }//for
        }//if

        return idx;
    };
    
    HUDQ.prototype.FindNearestIdx_RGBA8888 = function(src, w, h, rb, tile_x, tile_y, tile_z, ret_mpx, ret_mpy, url)
    {
        var o   = null;
        var idx = -1;
        var c   = 0;
        var iv  = null;
        var vs  = { xs:null, ys:null, is:null };
        var ds  = null;
        var sr  = 1;
        var at  = url.indexOf("TestIDW") > -1 ? 1 : url.indexOf("tiles20130415sc") > -1 || url.indexOf("tiles20140311sc") > -1 || url.indexOf("te20130415") > -1 || url.indexOf("te20140311") > -1 ? 254 : 255; // HACK, fix on server later.

        ret_mpx = ret_mpx % w; // offset to tile origin
        ret_mpy = ret_mpy % h;

        idx = HUDQ.FindNearestIdx_SearchNN_RGBA8888(src, w, h, rb, ret_mpx, ret_mpy, sr, at);

        /*
        // nb: disabled pythagoreas search, too big for multilayer(?)
        if (idx == -1 && sr < this.ret_r)
        {
            var need_decomp = o == null || o.url == null || o.url != url || o.xs == null || o.ys == null || o.is == null || o.ds == null;
        
            c = need_decomp ? HUDQ.CountOpaquePixels_RGBA8888(src, w, h, rb) : o.xs.length;
            
            if (c > 0) // no direct match.  decompose and distance find.
            {
                if (need_decomp)
                {
                    vs = HUDQ.DecomposeCmprsTile_RGBA8888(src, c, w, h, rb); // rip only opaque pixels out
                    ds = new Float64Array(c);
                }//if
                else
                {
                    vs = { xs:o.xs, ys:o.ys, is:o.is };
                    ds = o.ds;
                }//else
                
                iv  = HUDQ.vspythag(ret_mpx, ret_mpy, vs.xs, vs.ys, ds, sr); // calc dist
                idx = iv.val <= this.ret_r * this.ret_r ? vs.is[iv.idx] : -1; // get original tile pixel index of min dist                
            }//if
        }//if
        */

        if (idx != -1) this.cache.AddBufferDistinct(url, src, w, h, rb, tile_x, tile_y, tile_z);

        //if (idx == -1) console.log("HUDQ: No data found.  Total opaque count: %d.  w:%d, h:%d, rb:%d", HUDQ.CountOpaquePixels_RGBA8888(src, w, h, rb, at), w, h, rb);

        return idx;
    };

    HUDQ.CountOpaquePixels_RGBA8888 = function(src, w, h, rb, athr)
    {
        var x,y,y_rb,c=0;
        for (y=0; y<h; y++)
        {
            y_rb = y*rb;
            for (x=3; x<(w<<2); x+=4)
            {
                if (src[y_rb+x] >= athr) c++;
            }//for
        }//for
        return c;
    };

    HUDQ.DecomposeCmprsTile_RGBA8888 = function(src, c, w, h, rb, athr)
    {
        var is = new Uint32Array(c);
        var xs = new Uint32Array(c);
        var ys = new Uint32Array(c);
        var x,y,y_rb,idx=0;

        for (y=0; y<h; y++)
        {
            y_rb = y*rb;

            for (x=3; x<(w<<2); x+=4)
            {
                if (src[y_rb+x] >= athr
                    && (src[y_rb+x-3] != 0 || src[y_rb+x-2] != 0 || src[y_rb+x-1] != 0))
                {
                    xs[idx] = (x-3)>>>2;
                    ys[idx] = y;
                    is[idx] = y_rb+x-3;
                    idx++;
                }//if
            }//for
        }//for

        return { xs:xs, ys:ys, is:is };
    };

    HUDQ.vspythag = function(x, y, xs, ys, dest, already_searched)
    {
        var dx, dy, thr = (already_searched + 1) * (already_searched + 1);
        var min_i = -1, min_v = 9999999;
        for (var i=0; i<xs.length; i++)
        {
            dx = xs[i] - x;
            dy = ys[i] - y;
            dx = dx*dx + dy*dy;
            
            dest[i] = dx;
            
            if (dx <= min_v)
            {
                min_i = i;
                min_v = dx;

                if (dx <= thr) break;
            }//if
        }//for

        return { idx:min_i, val:min_v };
    };

    HUDQ.BufferCache = (function()
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

    return HUDQ;
})(); // -- hudq --


var LionelHUDLUT = (function()
{
    function LionelHUDLUT(decoderId)
    {
        this.r = null;
        this.g = null;
        this.b = null;
        this.z = null;
        this.rgbx = null;
        this.cache     = { idx:0, n:2048, rgbx:new Uint32Array(2048), i:new Uint32Array(2048) };
        this.bad_cache = { idx:0, n:2048, rgbx:new Uint32Array(2048), i:new Uint32Array(2048) };
        this._rgbxab = new ArrayBuffer(4);
        this._rgbx08 = new Uint8Array(this._rgbxab);
        this._rgbx32 = new Uint32Array(this._rgbxab);
        this.debug = { hits:0, misses:0 };
        this.decoderId = decoderId;
        this.InitLutWithDecoder(decoderId);
    }
    
    LionelHUDLUT.prototype.SetDecoderId = function(decoderId)
    {
        if (this.decoderId != decoderId)
        {
            this.decoderId     = decoderId;
            this.cache.idx     = 0;
            this.bad_cache.idx = 0;
            this.InitLutWithDecoder(decoderId);
        }//if
    };
    
    LionelHUDLUT.prototype.BadCache_GetIdx_RGB888 = function(r,g,b)
    {
        var idx = -1;
        this._rgbx08[3] = r;
        this._rgbx08[2] = g;
        this._rgbx08[1] = b;
        
        for (var i=0; i<this.bad_cache.idx; i++)
        {
            if (this.bad_cache.rgbx[i] == this._rgbx32[0])
            {
                idx = this.bad_cache.i[i];
                break;
            }//if
        }//for
        
        return idx;
    };
    
    LionelHUDLUT.prototype.BadCache_AddIdx_RGB888 = function(r,g,b,i)
    {
        if (this.bad_cache.idx >= this.bad_cache.n) return;
        this._rgbx08[3] = r;
        this._rgbx08[2] = g;
        this._rgbx08[1] = b;
        this.bad_cache.rgbx[this.bad_cache.idx] = this._rgbx32[0];
        this.bad_cache.i[this.bad_cache.idx] = i;
        this.bad_cache.idx++;
    };
    
    LionelHUDLUT.prototype.Cache_GetIdx_RGB888 = function(r,g,b)
    {
        var idx = -1;
        this._rgbx08[3] = r;
        this._rgbx08[2] = g;
        this._rgbx08[1] = b;
        for (var i=0; i<this.cache.idx; i++)
        {
            if (this.cache.rgbx[i] == this._rgbx32[0])
            {
                idx = this.cache.i[i];
                break;
            }//if
        }//for
        return idx;
    };
    
    LionelHUDLUT.prototype.Cache_AddIdx_RGB888 = function(r,g,b,i)
    {
        if (this.cache.idx >= this.cache.n) return;
        this._rgbx08[3] = r;
        this._rgbx08[2] = g;
        this._rgbx08[1] = b;
        this.cache.rgbx[this.cache.idx] = this._rgbx32[0];
        this.cache.i[this.cache.idx] = i;
        this.cache.idx++;
    };
    
    
    LionelHUDLUT.prototype.GetValuesForColor_RGB888 = function(r, g, b)
    {
        var iv  = null;
        var idx = this.GetIdxForColor_RGB888(r, g, b);

        if (idx != -1) this.debug.hits++;

        if (idx == -1) 
        {
            idx = this.Cache_GetIdx_RGB888(r, g, b);

            if (idx == -1)
            {
                idx = this.BadCache_GetIdx_RGB888(r, g, b);
                if (idx != -1) iv = { idx:idx, val:1001 };
            }//if

            if (idx == -1)
            {
                iv = this.FindNearestColorIdx_RGB888(r, g, b);
                idx = iv.idx;
            }//if

            this.debug.misses++;
        }//if

        var min = -1;
        var max = -1;
        var mid = -1;

        if (idx != -1)
        {
            min = this.z[idx];
            max = idx < this.z.length - 1 ? this.z[idx+1] : min;
            mid = (min + max) * 0.5;
            
            if (iv != null && iv.dist > 1000)
            {
                min = 0.0;
                max = mid * -2.0;
            }//if
        }//if

        return { median:mid, min:min, max:max };
    };

    LionelHUDLUT.prototype.GetIdxForColor_RGB888 = function(r, g, b)
    {
        var idx = -1;

        this._rgbx08[3] = r;
        this._rgbx08[2] = g;
        this._rgbx08[1] = b;

        for (var i=0; i<this.rgbx.length; i++)
        {
            if (this.rgbx[i] == this._rgbx32[0])
            {
                idx = i;
                break;
            }//if
        }//for

        return idx;
    };

    LionelHUDLUT.prototype.FindNearestColorIdx_RGB888 = function(r, g, b)
    {
        var    n = this.r.length;
        var dest = new Float64Array(n);
        var  idx = -1;
        var   iv = LionelHUDLUT.vspythag3d(r, g, b, this.r, this.g, this.b, dest);
        
        if (iv.val < 1000)
        {
            this.Cache_AddIdx_RGB888(r, g, b, iv.idx);
        }//if
        else
        {
            this.BadCache_AddIdx_RGB888(r, g, b, iv.idx);
        }//else

        idx = iv.idx;

        return { idx:idx, dist:iv.val };
    };
    
    LionelHUDLUT.prototype.GetEncodedStrings_GB64 = function()
    {
        var sr = "070f1316191a1a19181306192730373a3b3a362c1f144b6c869cb0c1d1deeefaffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffff";
        var sg = "060b0d0e0f0f0f0e0d0a0520394e64788ea3bcd3eafceddccbb9a6947e684c24000000000000000000000327465c72879aafc5d8edfeffffffffffffffffffff";
        var sb = "0a1a2a3d5168839cbbd9f8fffffffffffffffffffffffffffffffffffffffffff4d9bca48b75604936230800000000000000000000051c324b627c93aac2dbf1";
        var sz = "001e00220027002c00310036003c00420049004f0056005e0066006e00770080008a009500a000ac00b800c600d400e400f401060118012c014201590173018e"
               + "01ab01cb01ee0214023e026b029e02d50312035603a203f7045704c3053f05cc066f072d080c09130a4f0bcf0da70ff712eb16cb1c0523562e0c3eb15aa48ed1";
        var  n = sr.length >>> 1;

        return { r:sr, g:sg, b:sb, z:sz, n:n };
    };
    
    LionelHUDLUT.prototype.GetEncodedStrings_Lionel = function()
    {
        var sr = "01190D38381F568AADC8DAEDFBFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFF"
               + "FFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFF"
               + "FFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFF"
               + "FFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFF"
               + "FFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFF"
               + "FFFFFFFFFFFFFFFFFF";
        var sg = "010F1069AAEAE9C9A9886C4B220000000000000000000000000000000000091B27343B464E54585F61696C75797E8285888E9194999B9EA2A4A7A9AFB4B5B8BD"
               + "BFC0C3C6C9CBCCCED0D3D5D7D8DADDE0E1E3E6E8EBECEEF0F3F6F7F9FAFBFCFDFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFF"
               + "FFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFF"
               + "FFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFF"
               + "FFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFF"
               + "FFFFFFFFFFFFFFFFFF";
        var sb = "017CFFFFFFFFFFFFFFFFFFFFFFEFD2BAA6978174665B4D433931281F140800000000000000000000000000000000000000000000000000000000000000000000"
               + "00000000000000000000000000000000000000000000000000000000000000000002040608090B0E101314151617191B1D1E202122232425262728292A2B2C2D"
               + "2E2F303132333536383A3C3E3F40414344454648494A4B4C4D4E4F505152535455565758595A5B5C5D5E5F606162636465666768696A6B6C6D6E6F7071727374"
               + "75767778797A7B7C7D7E7F808182838485868788898A8B8C8D8E8F909192939495969798999A9B9C9D9E9FA0A1A2A3A4A5A6A7A8A9AAABACADAEAFB0B1B2B3B4"
               + "B5B6B7B8B9BABBBCBDBEBFC0C1C2C3C4C5C6C7C8C9CACBCCCDCECFD0D1D2D3D4D5D6D7D8D9DADBDCDDDEDFE0E1E2E3E4E5E6E7E8E9EAEBECEDEEEFF0F1F2F3F4"
               + "F5F6F7F8F9FAFBFCFD";
        var sz = "001E003E005E007E009E00BE00DE00FE011E013E015E017E019E01BE01DE01FE021E023E025E027E029E02BE02DE02FE031E033E035E037E039E03BE03DE03FE"
               + "041E043E045E047E049E04BE04DE04FE051E053E055E057E059E05BE05DE05FE061E063E065E067E069E06BE06DE06FE071E073E075E077E079E07BE07DD07FD"
               + "081E083E085E087E089E08BE08DE08FE091E093E095E097E099E09BE09DE09FE0A3E0A5E0A7E0A9E0ABE0ADE0AFE0B1E0B3E0B5E0B7E0B9E0BBE0BDE0BFE0C1E"
               + "0C3E0C5E0C7E0C9E0CBE0CFE0D3E0D5E0D7E0D9E0DBE0DDE0E1E0E3E0E5E0E7E0E9E0EBE0EDE0EFE0F1E0F3E0F5E0F7E0F9E0FBE0FDE0FFE101E103E105E107E"
               + "109E10BE10DE10FE113E115E117E119E11BE11DE11FE121E127E12BE12FE131E133E135E137E139E13BE13DE141E145E147E14BE14FE151E153E157E159E15BE"
               + "15FE161E165E167E16BE16DE171E177E17BE17FE181E185E187E189E18BE18FE191E193E19BE1A1E1A9E1ABE1ADE1B1E1B3E1B5E1B7E1B9E1BBE1BFE1C1E1C9E"
               + "1D1E1DBE1DDE1DFE1E3E1E5E1E7E1EBE1EDE1F1E1F3E1F7D1FBD201E207E20FE215E21BE221E229E22FE235E23BE23FE245E24BE24FE255E25BE267E275E283E"
               + "287E28DE291E297E29BE2A1E2A5E2ABE2AFE2C7E2E1E2E7E2EDE2F3E2F9E2FFE305E30BE313E319E327E337E347E357E361E36BE373E37DE387E393E39DE3A7E"
               + "3B3E3BDE3C9E3D5E3DFE3EBE3FDE40FE421E433E445E453E461E471E47FE48DE49DE4ADE4C9E4E5E503E523E531E53FE54FE55DE56DE57BE58BE59BE5ABE5D1E"
               + "5F9E621E64BE663E67DE697E6B3E6CDE6E9E707E73BE771E7A9E7E5E80FD839D865D891D8BFD8EFD921D953D987D9BFD9F7DA31DA8BDAEDDB51DBB9DBE3DC0BD"
               + "C35DC5FDC8BDCB7DCE3DD13DD41DD71DDA1D";
        var n  = sr.length >>> 1; // 329

        return { r:sr, g:sg, b:sb, z:sz, n:n };
    };

    LionelHUDLUT.prototype.InitLutWithDecoder = function(decoderId)
    {
        var s = decoderId == LionelHUDLUT.DecoderGB64 ? this.GetEncodedStrings_GB64() : this.GetEncodedStrings_Lionel();

        this.r = new Uint8Array(s.n);
        this.g = new Uint8Array(s.n);
        this.b = new Uint8Array(s.n);
        this.z = new Float32Array(s.n);
        this.rgbx = new Uint32Array(s.n);
        
        LionelHUDLUT.vhtoi_u08(this.r, s.r);
        LionelHUDLUT.vhtoi_u08(this.g, s.g);
        LionelHUDLUT.vhtoi_u08(this.b, s.b);
        LionelHUDLUT.vhtoi_u16(this.z, s.z);
        LionelHUDLUT.vsmul(this.z, 0.001, this.z, s.n);

        for (var i=0; i<s.n; i++)
        {
            this._rgbx08[3] = this.r[i];
            this._rgbx08[2] = this.g[i];
            this._rgbx08[1] = this.b[i];
            this.rgbx[i]   = this._rgbx32[0];
        }//for
    };

    LionelHUDLUT.sviminv = function(src)
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
    
    LionelHUDLUT.vspythag3d = function(x, y, z, xs, ys, zs, dest)
    {
        var dx,dy,dz;
        var min_i = -1, min_v = 9999999;
        for (var i=0; i<xs.length; i++)
        {
            dx = (xs[i] - x);
            dy = (ys[i] - y);
            dz = (zs[i] - z);
            dx = dx*dx + dy*dy + dz*dz;
            dest[i] = dx;
            
            if (dx < min_v)
            {
                min_i = i;
                min_v = dx;

                if (dx <= 1) break;
            }//if
        }//for

        return { idx:min_i, val:min_v };
    };

    LionelHUDLUT.vhtoi_u08 = function(d,s) { for(var i=0;i<d.length; i++)d[i]=parseInt(("0x"+s.substring(i<<1,(i<<1)+2))); };
    LionelHUDLUT.vhtoi_u16 = function(d,s) { for(var i=0;i<d.length; i++)d[i]=parseInt(("0x"+s.substring(i<<2,(i<<2)+4))); };
    LionelHUDLUT.vsmul     = function(s,x,d,n) { var i,m=n-(n%4);for(i=0;i<m;i+=4){d[i]=s[i]*x;d[i+1]=s[i+1]*x;d[i+2]=s[i+2]*x;d[i+3]=s[i+3]*x;}for(i=m;i<m+n%4;i++)d[i]=s[i]*x; };

    LionelHUDLUT.DecoderGB64   = 0;
    LionelHUDLUT.DecoderLionel = 1;

    return LionelHUDLUT;
})();
