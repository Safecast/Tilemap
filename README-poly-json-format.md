<img src="http://blog.safecast.org/wp-content/uploads/2014/01/header.png?w=460&amp;h=120&amp;crop=1" alt="Safecast">

 

# polys.json

Polygon and point features displayed as annotations on the Tilemap.

## Why polys.json?

polys.json was created to allow greater customization of the map by more individuals.  Editing a JSON file is relatively easy, and the contents will be automatically formatted.

## Usage

Edit polys.json and submit a pull request.  Please test it locally first, via JSON.parse() etc.

You should be able to just copy and paste one of the existing items as a template and not have to read anything here.  But this document is provided for reference nonetheless.

## Supported Feature Types

1. Polygons
 * Unique field: `path`
 * Unique field: `ss`
2. Points (markers)
 * Unique field: `point`
 * Unique field: `icon`
 
## Note - Polygon `path`

This refers to a linestring encoded by the Google Maps API.  A polygon editor from Google which creates and edits these strings can be found [here.](https://developers.google.com/maps/documentation/utilities/polylineutility)

**ATTENTION!** Polyline encoding produces strings with backslash and double-quote characters.  These must be escaped by a preceding backslash character when you paste them into a JSON string.

## Simple Example - Point

**ATTENTION!**  This is a simplified example only.  I would reject this pull request because it does not contain a Japanese localization.

```
[
    {
        "poly_id":1,
         "author":"Bob the Christmas Llama",
            "ver":"1",
           "date":"2016-11-08T22:02:00Z",
           "desc":"Anomaly #1",
           "info":"This is an example marker for a radiological anomaly.",
           "imgs":"fo1_640x480.jpg",
           "more": [ { "k":"en", "v":["More", "http://more.info"] } ],
           "atts": [ { "k":"en", "v":["More", "http://more.info"] } ],
          "point": { "x":140.515516, "y":37.316113 },
           "icon": { "url":"emoji-trefoil-go_64x64.png", "w":32, "h":32, "zi":0 }
    }
]
```

## More Complex Example - Polygon

```
[
    { 
        "poly_id":0,
         "author": [ { "k":"en", "v":"Azby Brown"      },
                     { "k":"ja", "v":"アズビー・ブラウン" } ],
            "ver":"2",
           "date":"2016-11-08T22:02:00Z",
           "desc": [ { "k":"en", "v":"Fukushima Zone"  },
                     { "k":"ja", "v":"福島の帰還困難区域" } ],
           "info": [ { "k":"en", "v":"As of 2013-05-28, Fukushima's 帰還困難区域 (Kikan Konnan Kuiki), or &quot;Difficult to Return Area&quot;, is defined as having an annual cumulative radiation dose of 50+ mSv, and 20+ mSv after five years." },
                     { "k":"ja", "v":"2013年5月28日 - 5年を経過してもなお、年間積算放射線量が20 mSvを下回らないおそれのある、現時点で年間積算放射線量が50 mSvを超える区域。" } ],
           "imgs": [ { "k":"en", "v":["This must be the work of an enemy「stand」", "futaba_640x300.png"] },
                     { "k":"ja", "v":["これは敵の仕事でなければならない「スタンド」",      "futaba_640x300.png"] } ],
           "atts": [ { "k":"en", "v":["Wikipedia",   "http://ja.wikipedia.org/wiki/帰還困難区域"] },
                     { "k":"ja", "v":["ウィキペディア", "http://ja.wikipedia.org/wiki/帰還困難区域"] } ],
           "more": [ { "k":"en", "v":["More Info",    "http://more.info"   ] },
                     { "k":"ja", "v":["詳細",          "http://more.info"   ] },
                     { "k":"en", "v":["Another Link", "http://another.info"] },
                     { "k":"ja", "v":["別のリンク",     "http://another.info"] } ],
           "path":"gtwcFezl{YdbAmc@|a@xcBm{@d_@u@xsAoo@`@wWzKlBqd@}a@pGuh@_z@kN`@cOvu@s]dQoMj_A|JvdAkrAbvBohBvXg}C`dCcf@ppAizE`yAwdAflAdDr}B|OrV`r@bA`hA|aCub@veAt@vIeZjE{cAdm@oz@zKkSxlDrWbPjHrnBry@qd@xx@_k@hNf`@jBl`Arh@{i@lj@vI~sAf~@eOvdAfIxYvoAeArFvWnhBj`At@mjChNse@@g}@dk@ewBZuu@}PiDya@~MyKio@j_@am@_Ei}@zPmaAzVa]ni@d_@dOe|@za@~Llj@eoEjY_z@dhAgBx~@mE~cAaOx\\wIrn@b^zVst@hNuH|a@nFpo@`@lSqe@lxAqF`Vqe@yKqUtLoc@uLse@gq@yh@`DsVyVi~@j~A_@aJwWlp@yKb[jb@rX{Zza@ePy\\c{@ri@wJsLor@hk@pU_Vw~Bsi@saB|J{v@h|@os@hw@uHzVchBjsAePpAiRzy@e_@nSg`@sRyY[soBgf@iR?e^iZ_NgC`NozF`Ow{CoF_dAcAo^uHcJoFuWbAgT?w@toBeIwIaa@eAcl@nE{\\~k@dDbOcJzKhCfQyKrVhC|x@sRkDiTbOfIzx@aP|[zKxX",
             "ss": [ { "sc":"#0F0", "sw":2, "so":1, "fc":"#0F0", "fo":0.0, "zi":1 },
                     { "sc":"#000", "sw":6, "so":1, "fc":"#000", "fo":0.2, "zi":0 } ]
    }
]
```

**Note:** The above polygon example uses two styles in `ss`.  This is done in order to draw a green stroke for the polygon, with a thick black outline around it for visibility.

## Field Descriptions

* `poly_id` - INT.  A unique identifier for each feature.  `poly_id` should never be reused, as it becomes associated with a user preference for enabling/disabling the feature with that `poly_id`.  Again, this must be unique, or things will break.
* `author` - STRING, KV-ARRAY.  The author of the feature.
* `ver` - STRING.  The revision of the feature and/or metadata.
* `date` - STRING.  The ISO date (UTC) for the last revision.
* `desc` - STRING, KV-ARRAY. The title of the feature, used for both the info window and the menu.  This should be very terse, as a long title will wrap and make the menu look bad.  Use `&quot;` instead of double-quotes, and `&gt;` and `&lt;` to prevent HTML.
* `info` - STRING, KV-ARRAY. Info window content for the feature, if the user clicks on it.  This should ideally be a few sentences at most.  Do *not* escape double-quotes, use `&quot;` instead.  Use of arbitrary HTML is possible, but not recommended.  Use single quotes, rather than double, if you must use embedded HTML.
* `imgs` - STRING, KV-ARRAY, MULTIPLE, OPTIONAL. Image(s) used in the infowindow, displayed before `info`.
* `more` - KV-ARRAY, MULTIPLE, OPTIONAL. Link(s) used in the infowindow, displayed after `info`.
* `atts` - KV-ARRAY, MULTIPLE, OPTIONAL. Link(s) used in the infowindow, displayed after `more`.  Displayed under a "References" header.
* `point` - OBJECT, POINT-ONLY.  Do **not** use this with a polygon.
 * `point.y` - FLOAT. The latitude of the point feature, in decimal degrees.
 * `point.x` - FLOAT. The longitude of the point feature, in decimal degrees.
* `icon` - OBJECT, POINT-ONLY.  Do **not** use this with a polygon.
 * `icon.url` - STRING. The URL of the point feature's marker image.
 * `icon.w` - INT. The width, in pixels, of the point feature's marker image.  Remember, for retina/HDPI display images, this should be half of the image's actual width.
 * `icon.h` - INT. The height, in pixels, of the point feature's marker image.  Remember, for retina/HDPI display images, this should be half of the image's actual height.
 * `icon.zi` - INT. The z-index of the point feature's marker.
* `path` - STRING, POLYGON-ONLY.  This is the Google Maps encoded polygon string.  Do **not** use this with a point.
* `ss` - OBJECT-ARRAY, MULTIPLE, POLYGON-ONLY.  Polygon styles collection.  One polygon will be created for each style in the array. Do **not** use this with a point.
 * `ss.sc` - STRING.  Stroke color, eg, `"#FFF"`.
 * `ss.sw` - INT.  Stroke width in pixels, eg, `2`.
 * `ss.so` - FLOAT.  Stroke opacity, [0.0 - 1.0], eg, `1.0`.
 * `ss.fc` - STRING.  Fill color, eg, `"#FFF"`.
 * `ss.fo` - FLOAT.  Fill opacity, [0.0 - 1.0], eg, `1.0`.
 * `ss.zi` - INT.  The z-index of the polygon.

## Object Definitions

The format for many fields in polys.json is quite flexible, and it will autodetect if a string or array is present.

* `KV-ARRAY` - ARRAY.  An array of objects with key-value pairs (`k` and `v`).
 * `k` - STRING.  The language of the value, either `en` or `ja`.
 * `v` - STRING, ARRAY.  The value.
* `MULTIPLE` - An ARRAY can hold multiple values. (links, images, etc)

Special notes for `v` types, by field:
 
* `author`, `desc`, and `info` - Only a STRING type is supported for `v`.
* `more`, and `atts` - Only an ARRAY of two strings is supported for `v`.  The first string is the link text, and the second string is the URL.
* `imgs` - Supports either a STRING or an ARRAY.  If a STRING, it is the image URL.  If an array with two strings, the first string is the image caption, and the second string is the URL.


## Further Examples - Possible `imgs` content

Example 1 - Here, both English and Japanese versions are present, with captions.
```
           "imgs": [ { "k":"en", "v":["This must be the work of an enemy「stand」", "futaba_640x300.png"] },
                     { "k":"ja", "v":["これは敵の仕事でなければならない「スタンド」",      "futaba_640x300.png"] } ],
           // RIGHT
```

Example 2 - As above, but without captions.
```
           "imgs": [ { "k":"en", "v":"futaba_640x300.png" },
                     { "k":"ja", "v":"futaba_640x300.png" } ],
           // RIGHT
```

Example 3 - As above, but only one language.  If the user has Japanese set, it will fallback upon English when no Japanese version is present.
```
           "imgs": [ { "k":"en", "v":"futaba_640x300.png" } ],
           // WRONG
```

Example 4 - As above, but simplified with no language.
```
           "imgs": "futaba_640x300.png",
           // RIGHT
```

Example 5A - Let's take the original, and add another image.  Note that this will **not** work 100% -- a Japanese user will only see one image, but an English user will see two.  Because the script found a match for the Japanese language tag, it will not use any fallbacks.
```
           "imgs": [ { "k":"en", "v":["This must be the work of an enemy「stand」",             "futaba_640x300.png"] },
                     { "k":"ja", "v":["これは敵の仕事でなければならない「スタンド」",                  "futaba_640x300.png"] },
                     { "k":"en", "v":["&quot;It's kGeigie time!&quot; &quot;No JAM, no!&quot;", "kgeigie.jpg"       ] } ],
           // WRONG
```

Example 5B - Ok, let's fix the above.
```
           "imgs": [ { "k":"en", "v":["This must be the work of an enemy「stand」",             "futaba_640x300.png"] },
                     { "k":"ja", "v":["これは敵の仕事でなければならない「スタンド」",                  "futaba_640x300.png"] },
                     { "k":"en", "v":["&quot;It's kGeigie time!&quot; &quot;No JAM, no!&quot;", "kgeigie.jpg"       ] },
                     { "k":"ja", "v":["「それはkGeigieの時間です」 「いいえJAM、いいえ！」",           "kgeigie.jpg"       ] } ],
           // RIGHT
```

Example 6 - Thou shalt not mix kv-object and string types.
```
           "imgs": [ { "k":"en", "v":["This must be the work of an enemy「stand」", "futaba_640x300.png"] },
                     { "k":"ja", "v":["これは敵の仕事でなければならない「スタンド」",      "futaba_640x300.png"] },
                     "kgeigie.jpg"                                                                      ] } ],
           // WRONG
```