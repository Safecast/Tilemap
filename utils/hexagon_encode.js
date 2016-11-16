// ===============================================================================================
// ======================================== HEXAGON ENCODE =======================================
// ===============================================================================================
//
// HexagonEncode is a code snippet to convert an array of google.maps.LatLng into an encoded polygon.
// This is used by the Tilemap; see MapPolys in safemap.js.
//
//
//
// ==================================
//               Use
// ==================================
//
// 1. HexagonEncode.EncodePaths(paths);
//    * paths is an array of google.maps.LatLng
// 2. Copy/paste the results into MapPolys in safemap.js as needed.
//
// Note: This requires the Google Maps Javascript API to be loaded.
//       Typically, the code below is pasted into a browser console on a page where the API is loaded.
//      
//
//
// ==================================
// About Google Maps Polygon Encoding
// ==================================
//
// Note that Google Maps also offers an encoded polygon format which is somewhat more efficient.
// However, it requires additional library loads, totalling more code and additional HTTP requests.
//
// To convert a Google Maps encoded polygon to an array of google.maps.LatLng, use the following:
// google.maps.geometry.encoding.decodePath()
//
// To convert a hex-encoded polygon by this code into a Google Maps encoded polygon, decode it into
// an array of google.maps.LatLngs via HexagonDecode, below.  Then, use the following:
// google.maps.geometry.encoding.encodePath()
//
// (nb: the en/decodePath function requires the optional Google Maps geometry library to be loaded)
//
//
//
// ==================================
//     Special Application Notes
// ==================================
//
// Google offers a polygon/polyline drawing webapp here: 
// 
// https://developers.google.com/maps/documentation/utilities/polylineutility
//
// To encode the output of this utility in Chrome, do the following:
//
// 1. Click in the "encoded polyline" text box.
// 2. Hit Option-Command-J or Ctrl-Shift-J to bring up the console.
// 3. Change the console target frame from "top" to "polylineutility...." by clicking on the drop-down
//    select that has the text "top".
// 4. Paste the HexagonEncode code below into the console and hit enter.
// 5. Create the paths object by pasting this into the console:
//    var paths = google.maps.geometry.encoding.decodePath(document.GetElementById("encodedPolyline"));
// 6. As shown above, invoke via:
//    HexagonEncode.EncodePaths(paths);
// 7. Copy the output (including the full extent and precisions) for use in safemaps.js.
// 8. Backing up the Google Maps encoded polyline is also highly recommended.
//




    var HexagonEncode = (function()
    {
        function HexagonEncode() 
        {
        }
                
        HexagonEncode.GetMinMax = function(path)
        {
            var o = { x0:999, y0:999, x1:-999, y1:-999 };
            
            for (var i=0; i<path.length; i++)
            {
                if (path[i].lng() < o.x0) o.x0 = path[i].lng();
                if (path[i].lng() > o.x1) o.x1 = path[i].lng();
                if (path[i].lat() < o.y0) o.y0 = path[i].lat();
                if (path[i].lat() > o.y1) o.y1 = path[i].lat();
            }
        
            console.log("HexagonEncode.GetMinMax: y0 = %1.6f, y1=%1.6f, x0=%1.6f, x1=%1.6f", o.y0, o.y1, o.x0, o.x1);
        
            return o;
        };
    
        HexagonEncode.GetPrecisionForMinMax = function(min, max, max_diff)
        {
            var p = 2 - 1;
            var diff = 0;

            while (diff < max_diff)
            {
                p++;
                diff = Math.round((max - min) * Math.pow(10, p));
            }//while
        
            console.log("HexagonEncode.GetPrecisionForMinMax: For min=%1.6f, max=%1.6f, max_diff=%d ... diff=%d, p=%d", min, max, max_diff, Math.round(diff/10.0), p-1);
        
            return p - 1;
        };
        
        HexagonEncode.GetHexStringForUint16 = function(x)
        {
            var h = x < 0x0010 ? "000" + x.toString(16) 
                  : x < 0x0100 ?  "00" + x.toString(16) 
                  : x < 0x1000 ?   "0" + x.toString(16) 
                  :                      x.toString(16);

            return h;
        };
        
        HexagonEncode.GetHexStringForLocs = function(paths, x0, x1, y0, y1, xp, yp)
        {
            var xs = "";
            var ys = "";
    
            for (var i=0; i<paths.length; i++)
            {
                var xd = parseInt(Math.round((paths[i].lng() - x0) * Math.pow(10.0, xp) ));
                var yd = parseInt(Math.round((paths[i].lat() - y0) * Math.pow(10.0, yp) ));

                xs += HexagonEncode.GetHexStringForUint16(xd);
                ys += HexagonEncode.GetHexStringForUint16(yd);
            }//for
            
            xs = xs.toUpperCase();
            ys = ys.toUpperCase();
        
            console.log("HexagonEncode.GetHexStringForLocs:\n %s \n \n %s \n", xs, ys);
            
            var ext = { x0:x0, y0:y0, x1:x1, y1:y1 };
            var pr  = { x:xp, y:yp };
        
            return { xs:xs, ys:ys, ext:ext, pr:pr };
        };
    
        HexagonEncode.EncodePaths = function(paths)
        {
            var mms = HexagonEncode.GetMinMax(paths);
            var xp  = HexagonEncode.GetPrecisionForMinMax(mms.x0, mms.x1, 65535);
            var yp  = HexagonEncode.GetPrecisionForMinMax(mms.y0, mms.y1, 65535);
            var o   = HexagonEncode.GetHexStringForLocs(path, mms.x0, mms.x1, mms.y0, mms.y1, xp, yp);
        
            return o;
        };
        
        return HexagonEncode;
    })();







    var HexagonDecode = (function()
    {
        function HexagonDecode() 
        {
        }
        
        HexagonDecode.DecodeXYVal = function(i,s,o,p)
        {
            return parseFloat(parseInt("0x"+s.substring(i<<2,(i<<2)+4)))/Math.pow(10,p)+o;
        };
        
        HexagonDecode.DecodePath = function(o)
        {
            var ps = new Array(o.xs.length>>>2);
        
            for (var i=0; i<o.xs.length>>>2; i++) 
            { 
                ps[i] = new google.maps.LatLng(HexagonDecode.DecodeXYVal(i,o.ys,o.ext.y0,o.pr.y), HexagonDecode.DecodeXYVal(i,o.xs,o.ext.x0,o.pr.x)); 
            }//for
        
            return ps;
        };
        
        return HexagonDecode;
    })();















