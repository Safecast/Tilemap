// ===============================================================================================
// ========================================== MAP POLYS ==========================================
// ===============================================================================================
//
// MapPolys: Retained object containing encoded map polygon(s) and management for adding/remove from
//           a Google Maps instance.
//
// For more information, see: https://github.com/Safecast/Tilemap/blob/master/README-poly-json-format.md
//
var MapPolys = (function()
{
    function MapPolys(mapref, fxMenuInit, fxGetLangPref) 
    {
        this.encoded_polygons = new Array();
        this.groups           = new Array();
        this.polygons         = new Array();
        this.mapref           = mapref;
        this.inforef          = null;
        this.zoomlistener     = null;
        this.draglistener     = null;
        this.last_z           = -1;
        this.fxMenuInit       = fxMenuInit;
        this.fxGetLangPref    = fxGetLangPref;
    }


    MapPolys.prototype.Init = function()
    {
        this._GetJSONAsync("polys.json");
    };
    

    MapPolys.prototype.Add = function(poly_id)
    {
        var fx = function(p) { this.AttachInfoWindow(p); }.bind(this);
        this.polygons = _PolysNewPolysByAddingPoly(poly_id, this.polygons, this.encoded_polygons, this.mapref, fx);
    };


    MapPolys.prototype.Remove = function(poly_id)
    {
        this.polygons = _PolysNewPolysByRemovingPoly(poly_id, this.polygons);
    };


    MapPolys.prototype.Exists = function(poly_id)
    {
        return _PolysDoesExistPoly(poly_id, this.polygons);
    };


    MapPolys.prototype.GetEncodedPolygons = function()
    {
        return this.encoded_polygons;
    };


    MapPolys.prototype.GetGroups = function()
    {
        return this.groups;
    };


    MapPolys.prototype.GetPolygons = function()
    {
        return this.polygons;
    };


    MapPolys.prototype.AttachInfoWindow = function(poly)
    {
        google.maps.event.addListener(poly, "click", function(e) 
        {
            this._OpenRetainedInfoWindow(e, poly);
        }.bind(this));
    };


    MapPolys.prototype._OpenRetainedInfoWindow = function(e, poly)
    {
        if (this.inforef == null) this.inforef = new google.maps.InfoWindow({size: new google.maps.Size(60, 40)});
        else this.inforef.close(); 
        this.inforef.setContent(this.GetInfoWindowContentForPoly(poly));
        this.inforef.setPosition(e.latLng);
        this.inforef.open(this.mapref, poly);
    };
    
    
    MapPolys.prototype._GetCurrentVisibleExtent = function()
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


    var _GetValueForLang = function(src, lang, lang_def)
    {
        var d = new Array();

        if (src != null && (typeof src == 'string' || src instanceof String))
        {
            d.push(src);
        }//if

        if (d.length == 0 && src != null)
        {
            for (var i=0; i<src.length; i++)
            {
                if (src[i].k == lang)
                {
                    d.push(src[i].v);
                }//if
            }//for
        }//if

        if (d.length == 0 && src != null)
        {
            for (var i=0; i<src.length; i++)
            {
                if (src[i].k == lang_def)
                {
                    d.push(src[i].v);
                }//if
            }//for
        }//if

        if (d.length == 0 && src != null && src.length > 0)
        {
            d.push(src[0].v);
        }//if

        return d;
    };


    MapPolys.prototype._GetLocalizedPolyValue = function(poly, prop)
    {
        return _GetValueForLang(poly[prop], this.fxGetLangPref(), "en");
    };

    MapPolys.prototype._GetLocalizedPolyString = function(poly, prop)
    {
        var s = this._GetLocalizedPolyValue(poly, prop);
        return s.length > 0 ? s[0] : "";
    };

    MapPolys.prototype.GetLocalizedDescString = function(poly)
    {
        var ss = this._GetLocalizedPolyValue(poly, "desc");
        var s  = ss.length > 0 ? ss[0] : null;

        if (s == null)
        {
            return "";
        }//if
        else if (typeof s == 'string' || s instanceof String)
        {
            return s;
        }//else if
        else // assume array with string
        {
            return s[0];
        }//else
    };

    MapPolys.prototype.GetLocalizedDescCssString = function(poly)
    {
        var ss = this._GetLocalizedPolyValue(poly, "desc");
        var s  = ss.length > 0 ? ss[0] : null;
        
        if (s == null)
        {
            return "";
        }//if
        else if (typeof s == 'string' || s instanceof String || s.length == 1)
        {
            return "";
        }//else if
        else // assume array with string
        {
            return s[1];
        }//else
    };

    MapPolys.prototype._GetLocalizedReferencesHeader = function()
    {
        return this.fxGetLangPref() == "ja" ? "帰属" 
             : this.fxGetLangPref() == "es" ? "Referencias"
             :                                "References";
    };

    MapPolys.prototype._GetLocalizedAuthorHeader = function()
    {
        return this.fxGetLangPref() == "ja" ? "著者" 
             : this.fxGetLangPref() == "es" ? "Por"
             :                                "By";
    };
    
    MapPolys.prototype._GetLocalizedCoauthorHeader = function()
    {
        return this.fxGetLangPref() == "ja" ? "共著" 
             : this.fxGetLangPref() == "es" ? "Con"
             :                                "With";
    };
    
    MapPolys.prototype._GetLocalizedTranslatorHeader = function()
    {
        return this.fxGetLangPref() == "ja" ? "翻訳" 
             : this.fxGetLangPref() == "es" ? "TL"
             :                                "TL";
    };
    
    MapPolys.prototype._GetLocalizedFullArticleLabel = function()
    {
        return this.fxGetLangPref() == "ja" ? "全記事"
             : this.fxGetLangPref() == "es" ? "Articulo Entero"
             :                                "Full Article";
    };

    var _GetInfoWindowLinksArrayOrString = function(src, vert_padding, is_always_list)
    {
        var d = "<tr>"
              +     "<td style='padding:"+vert_padding+"px 0;'>";

        if (src.length > 1 || is_always_list)
        {
            d += "<ul style='margin:0;padding-left:20px;'>";
        }//if

        for (var i=0; i<src.length; i++)
        {
            if (src.length > 1 || is_always_list)
            {
                d += "<li>";
            }//if

            if (typeof src[i] == 'string' || src[i] instanceof String)
            {
                d += src[i];
            }
            else if (src[i].length == 1)
            {
                d += src[i][0];
            }
            else if (src[i].length > 1)
            {
                d += "<a style='color:#4272DB; font-size:12px; text-decoration:none; vertical-align:bottom;' href='"
                  +  src[i][1]
                  +  "' target='_blank'>"
                  +  src[i][0]
                  +  "</a>";
            }

            if (src.length > 1 || is_always_list)
            {
                d += "</li>";
            }//if
        }//for

        if (src.length > 1 || is_always_list)
        {
            d += "</ul>";
        }//if

        d +=    "</td>"
          +  "</tr>";

        return d;
    };


    var _GetInfoWindowImagesArrayOrString = function(src, tblw)
    {
        var c, d = "";

        for (var i=0; i<src.length; i++)
        {
            c = false;
            
            d += "<tr>"
              +     "<td style='text-align:center; padding:3px 0;'>"
              +         "<div style='display:inline-block; border:1px solid gainsboro; padding:5px 5px;'>"
              +             "<img src='";

            if (typeof src[i] == 'string' || src[i] instanceof String)
            {
                d += src[i];
            }
            else if (src[i].length == 1)
            {
                d += src[i][0];
            }
            else if (src[i].length > 1)
            {
                d += src[i][1];
                c  = true;
            }

            d += "' style='"
              +  "max-width:"+(tblw-2-10-2)+"px; "
              +  "max-height:"+Math.round((tblw-2-10-2)*0.75)+"px; "
              +  "display:block; "
              +  "margin-left:auto; margin-right:auto; "
              +  "image-rendering:auto; image-rendering:-webkit-optimize-contrast; image-rendering:optimize-contrast;";

            if (c && src[i].length > 2)
            {
                d += src[i][2];
            }//if

            d += "'>";

            if (c && src[i][0].length > 0)
            {
                d += "<div style='color:#888; text-transform:uppercase; padding-top:5px; font-size:10px;'>"
                  +  src[i][0]
                  +  "</div>";
            }//if

            d +=        "</div>"
              +     "</td>"
              +  "</tr>";
        }//for

        return d;
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
        return d.toLocaleString("en", {timeZoneName:"short"}).split(" ").pop();
    };

    var _GetDateTimeHtmlForIsoString = function(s)
    {
        var d = new Date(s);
        var gmt = _GetFormattedUtcOffsetStringForDate(d);
        var tza = _GetTzAbbrStringForDate(d);

        var h = "<span style='color:#555;'>" 
              + _GetFormattedDateStringForDate(d)
              + "</span>" 
              + "&nbsp;&nbsp;"
              + _GetFormattedTimeStringForDate(d)
              + " &nbsp;"
              + "<span style='color:#CCC;'>"
              + gmt + " (" + tza + ")</span>";

        return h;
    };


    MapPolys.prototype.GetInfoWindowContentForPoly = function(poly)
    {
        var cwhs  = _GetClientViewSize();
        var mini  = cwhs[0] <= 450;
        var tblw  = mini ? 320-30-10-50 : 320; // Google's styles seem to add 30 x-axis pixels of padding
        var mores = this._GetLocalizedPolyValue(poly, "ext_poly_more");
        var atts  = this._GetLocalizedPolyValue(poly, "ext_poly_atts");
        var imgs  = this._GetLocalizedPolyValue(poly, "ext_poly_imgs");
        var   tl  = this._GetLocalizedPolyString(poly, "ext_poly_tl");
        var  coa  = this._GetLocalizedPolyString(poly, "ext_poly_coauthor");
        var d     = "<table style='width:"+tblw+"px;border:0;border-collapse:collapse;' class='" + "FuturaFont" + "'>";

        d += "<tr>"
          +     "<td style='text-transform: uppercase; font-size:22px; text-align:center; padding-top:12px;'>" 
          +         this._GetLocalizedPolyString(poly, "ext_poly_desc")
          +     "</td>"
          +  "</tr>";

        d += "<tr>"
          +     "<td style='text-align:right; font-size:10px; color:#AAA;'>"
          +         this._GetLocalizedAuthorHeader() + " "
          +         this._GetLocalizedPolyString(poly, "ext_poly_author");

        if (coa.length > 0)
        {
            d += "<br/>" + this._GetLocalizedCoauthorHeader() + " " + coa;
        }//if

        if (tl.length > 0)
        {
            d += "<br/>" + this._GetLocalizedTranslatorHeader() + ": " + tl;
        }//if
          
        d +=    "</td>"
          +  "</tr>";

        d += _GetInfoWindowImagesArrayOrString(imgs, tblw);

        d += "<tr>"
          +     "<td style='padding-top:5px; padding-bottom:5px;'>"
          +         this._GetLocalizedPolyString(poly, "ext_poly_info")
          +     "</td>"
          +  "</tr>";

        if (mores.length > 0)
        {
            d += _GetInfoWindowLinksArrayOrString(mores, 1, false); //5
        }//if

        if (atts.length > 0)
        {
            d += "<tr style='border-top:1px solid gainsboro;'>"
              +     "<td style='padding-top:5px;'>"
              +         this._GetLocalizedReferencesHeader()
              +     "</td>"
              +  "</tr>";
          
            d += _GetInfoWindowLinksArrayOrString(atts, 1, true);
        }//if

        d += "<tr>"
          +     "<td style='text-align:center; font-size:10px; color:#AAA; padding-top:4px;'>" 
          +         _GetDateTimeHtmlForIsoString(poly.ext_poly_date)
          +     "</td>"
          +  "</tr>";

        d += "</table>";
        
        d = d.replace(/{FULL_ARTICLE}/g, this._GetLocalizedFullArticleLabel());

        return d;
    };
    
    var _GetIconScaleFactorForZ = function(z)
    {
        // For zoom levels > 7, the scale is always 100%.
        // Otherwise, it's:
        //   10% base
        // + 90% scaled value of [0% - 87.5%], linear, based on zoom level.
        
        //return z > 7 ? 1.0 : 0.1 + (1.0 - (8 - z) * 0.125) * 0.9;
        return   z > 13 ? 1.0 + (1.0 - (21 - z - 7) * 0.14285714) * 0.5
               : z >  7 ? 1.0 
               :          0.5 + (1.0 - (8 - z) * 0.125) * 0.5;
    };
    
    MapPolys.prototype._RescaleIcons = function()
    {
        var z = this.mapref.getZoom();
        var e = this._GetCurrentVisibleExtent();
        
        if (   (e.z >  7 && this.last_z >  7)
            && (e.z < 13 && this.last_z < 13)
            &&  e.z > this.last_z)
        {
            this.last_z = e.z;
            return;
        }//if
        
        
        var scale = _GetIconScaleFactorForZ(e.z);

        for (var i=0; i<this.polygons.length; i++)
        {
            if (this.polygons[i].ext_poly_icon_w != null
                && _IsPointInExtent(this.polygons[i].getPosition().lng(), this.polygons[i].getPosition().lat(), e))
            {
                var ico = this.polygons[i].getIcon();

                if (ico.scaledSize.width != this.polygons[i].ext_poly_icon_w * scale)
                {
                    ico.size       = new google.maps.Size(this.polygons[i].ext_poly_icon_w * scale, this.polygons[i].ext_poly_icon_h * scale);
                    ico.scaledSize = new google.maps.Size(this.polygons[i].ext_poly_icon_w * scale, this.polygons[i].ext_poly_icon_h * scale);
                    ico.anchor     = new google.maps.Point(this.polygons[i].ext_poly_icon_w * scale * 0.5, this.polygons[i].ext_poly_icon_h * scale * 0.5);
                
                    this.polygons[i].setIcon(ico);
                }//if
            }//if
        }//for
        
        this.last_z = e.z;
    };
    
    MapPolys.prototype._GetJSONAsync = function(url)
    {
        var cb = function(response, userData)
        {
            var success = response != null && response.length > 0;
        
            if (success)
            {
                var obj = null;
                try { obj = JSON.parse(response); }
                catch (err) { console.log("MapPolys: JSON parsing exception."); }
                
                if (obj != null)
                {
                    this.groups           = _GetGroupsFilteredByEncodedPolyUse(obj.groups, obj.polys);
                    this.encoded_polygons = obj.polys;

                    this.fxMenuInit(this.groups, this.encoded_polygons);
                    
                    this._RescaleIcons();
                    
                    var fxRefresh = function(e) { this._RescaleIcons(); }.bind(this);
                    this.zoomlistener = google.maps.event.addListener(this.mapref, "zoom_changed", fxRefresh);
                    this.draglistener = google.maps.event.addListener(this.mapref, "dragend", fxRefresh);
                }//if
                else
                {
                    success = false;
                }//else
            }//if
        
            if (!success) { console.log("MapPolys: Error getting polys from URL: %s", url); }
        }.bind(this);

        _GetAsync_HTTP(url + "?t=" + Date.now(), null, null, cb, null);
    };


    var _GetPolyRefCountByGroupId = function(gs, eps)
    {
        var ns = new Array(gs.length);

        for (var i=0; i<gs.length; i++)
        {
            ns[i] = 0;
        }//for

        for (var i=0; i<eps.length; i++)
        {
            for (var j=0; j<gs.length; j++)
            {
                if (gs[j].group_id == eps[i].group_id)
                {
                    ns[j]++;
                    break;
                }//if
            }//for
        }//for

        return ns;
    };


    // prune any dead groups that aren't being referenced so this doesn't
    // have to be checked repeatedly in the UI later.
    var _GetGroupsFilteredByEncodedPolyUse = function(gs, eps)
    {
        var ns = _GetPolyRefCountByGroupId(gs, eps);
        var d  = new Array();
        var txt = "";

        for (var i=0; i<gs.length; i++)
        {
            var hr = false;

            if (ns[i] > 0)
            {
                d.push(gs[i]);
                hr = true;
            }//if
            else
            {
                var n=0;
                
                for (var j=0; j<gs.length; j++)
                {
                    if (gs[i].group_id == gs[j].parent_id)
                    {
                        n += ns[j];
                    }//if
                }//for
                
                if (n > 0)
                {
                    d.push(gs[i]);
                    hr = true;
                }//if
            }//else
            
            if (!hr)
            {
                txt += gs[i].group_id + ", ";
            }//if
        }//for
        
        if (txt.length > 0)
        {
            console.log("MapPolys._GetGroupsFilteredByEncodedPolyUse: Purged the following unused groups: [%s]", txt);
        }//if

        return d;
    };


    var _PolysGetFirstPolyForPolyId = function(poly_id, ps)
    {
        var p = null;

        for (var i = 0; i < ps.length; i++)
        {
            if (ps[i].ext_poly_id == poly_id)
            {
                p = ps[i];
                break;
            }//if
        }//for

        return p;
    };


    var _PolysDoesExistPoly = function(poly_id, ps)
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


    var _GetZindexModifiedByDateStr = function(zi, dstr)
    {
        var  d = new Date(dstr);
        var dd = Math.round(d.getTime() / 86400000.0);
        return zi - (32768 - dd);
    };


    var _GmapsCreateMarkerFromPoint = function(ep)
    {
        var size = new google.maps.Size(ep.icon.w, ep.icon.h);
        var anch = new google.maps.Point(ep.icon.w >>> 1, ep.icon.h >>> 1);
        var icon = { url:ep.icon.url, size:size, anchor:anch };
        var   zi = _GetZindexModifiedByDateStr(ep.icon.zi, ep.date);

        icon.scaledSize = new google.maps.Size(ep.icon.w, ep.icon.h);

        var yx = new google.maps.LatLng(ep.point.y, ep.point.x);
        var m  = new google.maps.Marker();

        m.setPosition(yx);
        m.setIcon(icon);
        m.setZIndex(zi);

        m.ext_poly_id       = ep.poly_id;
        m.ext_poly_group_id = ep.group_id;
        m.ext_poly_desc     = ep.desc;
        m.ext_poly_info     = ep.info;
        m.ext_poly_atts     = ep.atts;
        m.ext_poly_more     = ep.more;
        m.ext_poly_author   = ep.author;
        m.ext_poly_coauthor = ep.coauthor;
        m.ext_poly_tl       = ep.tl;
        m.ext_poly_date     = ep.date;
        m.ext_poly_imgs     = ep.imgs;
        m.ext_poly_icon_w   = ep.icon.w;
        m.ext_poly_icon_h   = ep.icon.h;

        return m;
    };


    var _GmapsCreatePolyFromPath = function(gmaps_path, ep, s, sidx)
    {
        return new google.maps.Polygon({         paths:gmaps_path,
                                           strokeColor:s.sc,
                                          strokeWeight:s.sw,
                                         strokeOpacity:s.so,
                                             fillColor:s.fc,
                                           fillOpacity:s.fo,
                                                zIndex:s.zi,
                                           ext_poly_id:ep.poly_id,
                                     ext_poly_group_id:ep.group_id,
                                    ext_poly_style_idx:sidx,
                                         ext_poly_desc:ep.desc,
                                         ext_poly_info:ep.info,
                                         ext_poly_atts:ep.atts,
                                         ext_poly_more:ep.more,
                                       ext_poly_author:ep.author,
                                     ext_poly_coauthor:ep.coauthor,
                                           ext_poly_tl:ep.tl,
                                         ext_poly_date:ep.date,
                                         ext_poly_imgs:ep.imgs,
                                       ext_poly_extent:_GetExtentForPath(gmaps_path)
                                      });
    };


    var _PolysNewPolysByRemovingPoly = function(poly_id, ps)
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
                google.maps.event.clearInstanceListeners(ps[i]);
                ps[i].setMap(null);
            }//else if
        }//for

        return d;
    };


    var _PolysNewPolysByAddingPoly = function(poly_id, ps, eps, mapref, fxAttachInfoWindow)
    {
        var d = new Array(ps.length);

        for (var i = 0; i < ps.length; i++)
        {
            d[i] = ps[i];
        }//for

        if (!_PolysDoesExistPoly(poly_id, ps))
        {
            var nps = _GmapsCreatePolysFromEncodedPoly(poly_id, eps);

            for (var i = 0; i < nps.length; i++)
            {
                nps[i].setMap(mapref);
                fxAttachInfoWindow(nps[i]);
                d.push(nps[i]);
            }//for
        }//if

        return d;
    };


    var _PolysDoesExistPoly = function(poly_id, ps)
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


    var _GmapsCreatePolysFromEncodedPoly = function(poly_id, eps)
    {
        var d = new Array();

        for (var i = 0; i < eps.length; i++)
        {            
            if (eps[i].poly_id == poly_id && eps[i].path != null)
            {
                for (var j = 0; j < eps[i].ss.length; j++)
                {
                    var path = google.maps.geometry.encoding.decodePath(eps[i].path);
                    var poly = _GmapsCreatePolyFromPath(path, eps[i], eps[i].ss[j], j);
                    d.push(poly);
                }//for
            }//if
            else if (eps[i].poly_id == poly_id && eps[i].point != null)
            {
                var marker = _GmapsCreateMarkerFromPoint(eps[i]);
                d.push(marker);
            }//else if
        }//for

        return d;
    };


    var _GetExtentForPath = function(path)
    {
        var o = { x0:999, y0:999, x1:-999, y1:-999 };

        for (var i=0; i<path.length; i++)
        {
            if (path[i].lng() < o.x0) o.x0 = path[i].lng();
            if (path[i].lng() > o.x1) o.x1 = path[i].lng();
            if (path[i].lat() < o.y0) o.y0 = path[i].lat();
            if (path[i].lat() > o.y1) o.y1 = path[i].lat();
        }

        return o;
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

        req.onreadystatechange = function ()
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

    return MapPolys;
})();