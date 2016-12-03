<img src="http://blog.safecast.org/wp-content/uploads/2014/01/header.png?w=460&amp;h=120&amp;crop=1" alt="Safecast">

&nbsp; 

# polys.json

Polygon and point features displayed as annotations on the Tilemap.

&nbsp; 

## Why polys.json?

polys.json was created to allow greater customization of the map by more individuals.  Editing a JSON file is relatively easy, and the contents will be automatically formatted.

&nbsp; 

## Usage

Edit `polys.json` and submit a pull request.  Of course, before that, please verify any JSON edits via [JSONLint](http://jsonlint.com/) or similar.

You should be able to just copy and paste one of the existing items as a template and not have to read anything here.  But this document is provided for reference nonetheless.

&nbsp; 

## Overview

At a high level, `polys.json` defines the following structure:

1. Group Definions
2. Features (content)
 1. Location - Where the feature is on the map.
 2. Styles - How it should be displayed on the map.
 3. Metadata - What content should be in the infowindow when the user clicks on it.

More specifically in terms of JSON:

```
{
     "groups":[],
      "polys":[]
}
```

Thus, in the above:  

 * `groups` is an array of one or more group objects.
 * `polys` is an array of one or more feature objects.

&nbsp; 

## Groups > Summary

Group definitions are used by the UI to provide user controls in the menu for the features.  Currently, features can be controlled individually, or as a group.  Thus:

* group's `parent_id`?
 * `null`: Full menu section created.  All features set to this group's `group_id` are listed individually.
 * `INT`: Group menu item created under the parent.  No feature set to this group's `group_id` will be listed.  Instead, all features are turned on or off by clicking on the group switch.

&nbsp; 

## Groups > Example Defs  
```
"groups":
[
    {
        "group_id":0,
       "parent_id":null,
            "desc": [ { "k":"en", "v":"Areas" },
                      { "k":"ja", "v":"区域"   } ]
    },
    {
        "group_id":1,
       "parent_id":null,
            "desc": [ { "k":"en", "v":"Interest"   },
                      { "k":"ja", "v":"興味がある点" } ]
    },
    {
        "group_id":2,
       "parent_id":1,
            "desc": [ { "k":"en", "v":"Safecasting"      },
                      { "k":"ja", "v":"セーフキャスティング" } ]
    }
],
```

&nbsp; 

## Groups > Field Descriptions

* `group_id` - INT.  A unique identifier for each group.  `group_id` should never be reused, as it becomes associated with a user preference for enabling/disabling features with that `group_id`.  This must be unique, or things will break.
* `parent_id` - INT, NULL. A reference to another `group_id` that this group will be displayed as a child of in the menu. Or, set to null if the group is a root-level node that should define a section.
* `desc` - STRING, KV-ARRAY. The title of the group displayed on the menu.  This should be very terse, as a long title will wrap and make the menu look bad.  Use `&quot;` instead of double-quotes (`"`), and `&gt;` instead of `>` and `&lt;` instead of `<` to prevent HTML.

&nbsp; 

## Groups > Example Menu Created From Group Defs

Assuming the example features later in this document, the above menu defs will create the following menu:

```
AREAS
 - Fukushima Zone [ON/OFF]

INTEREST
 - Safecasting [ON/OFF]
```

&nbsp; 

## Features > Supported Feature Types

1. Polygons
 * Unique field: `path`
 * Unique field: `ss`
2. Points (markers)
 * Unique field: `point`
 * Unique field: `icon`
 
 &nbsp; 
 
## Features > Simple Example - Point

**ATTENTION!**  This is a simplified example only.  I would reject this pull request because it does not contain a Japanese localization.

```
[
    {
        "poly_id":1,
       "group_id":2,
         "author":"Bob the Christmas Llama",
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
&nbsp; 

## Features > More Complex Example - Polygon

```
[
    { 
        "poly_id":0,
       "group_id":0,
         "author": [ { "k":"en", "v":"Azby Brown"      },
                     { "k":"ja", "v":"アズビー・ブラウン" } ],
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

*Note:* The above polygon example uses two styles in `ss`.  This is done in order to draw a green stroke for the polygon, with a thick black outline around it for visibility.

&nbsp; 

## Features > Field Descriptions

* `poly_id` - INT.  A unique identifier for each feature.  `poly_id` should never be reused, as it becomes associated with a user preference for enabling/disabling the feature with that `poly_id`.  Again, this must be unique, or things will break.
* `group_id` - INT. A reference to a `group_id` defined in the `groups` section of `polys.json`.  This controls how the feature will appear to the user on the UI menu.  
* `author` - STRING, KV-ARRAY.  The author(s) of the feature or linked article.
* `coauthor` - STRING, KV-ARRAY.  The coauthor(s) of the feature or linked article, if any.  They will appear on a line below the author.
* `tl` - STRING, KV-ARRAY.  The translator(s) of the feature or linked article, if any.  They will appear on a line below the author, or coauthors if any are defined.
* `date` - STRING.  The ISO date (UTC) displayed in the info window.
 * To get this manually, enter `(new Date()).toISOString();` into your browser's console.
* `desc` - STRING, KV-ARRAY. The title of the feature, used for both the info window **and the menu**.  This should be very terse, as a long title will wrap and make the menu look bad.  Use `&quot;` instead of double-quotes (`"`), and `&gt;` instead of `>` and `&lt;` instead of `<` to prevent HTML.
* `info` - STRING, KV-ARRAY. Info window content for the feature, if the user clicks on it.  This should ideally be a few sentences at most.  Do *not* escape double-quotes (`"`), use `&quot;` instead.  Use of arbitrary HTML is possible, but not recommended.  Use single quotes, rather than double, if you must use embedded HTML.
* `imgs` - STRING, KV-ARRAY, MULTIPLE, OPTIONAL. Image(s) used in the infowindow, displayed before `info`.
* `more` - KV-ARRAY, MULTIPLE, OPTIONAL. Link(s) used in the infowindow, displayed after `info`.
* `atts` - KV-ARRAY, MULTIPLE, OPTIONAL. Link(s) used in the infowindow, displayed after `more`.  Displayed under a "References" header.
* `point` - OBJECT, **POINT-ONLY**.  Do **not** use this with a polygon.
 * `point.y` - FLOAT. The latitude of the point feature, in decimal degrees.
 * `point.x` - FLOAT. The longitude of the point feature, in decimal degrees.
* `icon` - OBJECT, **POINT-ONLY**.  Do **not** use this with a polygon.
 * `icon.url` - STRING. The URL of the point feature's marker image.
 * `icon.w` - INT. The width, in pixels, of the point feature's marker image.  Remember, for retina/HDPI display images, this should be half of the image's actual width.
 * `icon.h` - INT. The height, in pixels, of the point feature's marker image.  Remember, for retina/HDPI display images, this should be half of the image's actual height.
 * `icon.zi` - INT. The z-index of the point feature's marker.
* `path` - STRING, **POLYGON-ONLY**.  This is the Google Maps encoded polygon string.  Do **not** use this with a point.
 * A polygon editor from Google which creates and edits these strings can be found [here.](https://developers.google.com/maps/documentation/utilities/polylineutility)
 * **ATTENTION!** Polyline encoding produces strings with backslash and double-quote characters.  These must be escaped by a preceding backslash character when you paste them into a JSON string.
* `ss` - OBJECT-ARRAY, MULTIPLE, **POLYGON-ONLY**.  Polygon styles collection.  One polygon will be created for each style in the array. Do **not** use this with a point.
 * `ss.sc` - STRING.  Stroke color, eg, `"#FFF"`.
 * `ss.sw` - INT.  Stroke width in pixels, eg, `2`.
 * `ss.so` - FLOAT.  Stroke opacity, [0.0 - 1.0], eg, `1.0`.
 * `ss.fc` - STRING.  Fill color, eg, `"#FFF"`.
 * `ss.fo` - FLOAT.  Fill opacity, [0.0 - 1.0], eg, `1.0`.
 * `ss.zi` - INT.  The z-index of the polygon, eg, `0`.

&nbsp; 

## Features > Object Definitions

The format for many fields in polys.json is quite flexible, and it will autodetect if a string or array is present.

* `KV-ARRAY` - ARRAY.  An array of objects with key-value pairs (`k` and `v`).
 * `k` - STRING.  The language of the value, either `en`, `ja`, `es` or any language added in the future.
 * `v` - STRING, ARRAY.  The value.
* `MULTIPLE` - An ARRAY can hold multiple values. (links, images, etc)

Special notes for `v` types, by field:
 
* `author`, `desc`, and `info` - Only a STRING type is supported for `v`.
* `more`, and `atts` - Only an ARRAY of two strings is supported for `v`.
 * The first string is the link text, and the second string is the URL.
* `imgs` - Supports either a STRING or an ARRAY.
 * If a STRING, it is the image URL.
 * If an ARRAY with two strings, the first string is the image caption, and the second string is the URL.
 * If an ARRAY with three strings, the first string is the image caption, the second string is the URL, and the third is additional CSS style attributes.

These are shown in specific detail below.

&nbsp; 

## Features > `author` Value Types

####1. Basic
```
"author": "Azby Brown"
```

####2. Localized
```
"author": [ { "k":"en", "v":"Azby Brown"      },
            { "k":"es", "v":"Azby Brown"      },
            { "k":"ja", "v":"アズビー・ブラウン" } ]
```
*(nb: in the above example, it is safe to omit the `es` pair, as it will default to the `en` pair which has the same value.)*

&nbsp; 

## Features > `coauthor` Value Types

####1. Basic
```
"coauthor": "Yuka Hayashi, Rob Oudendijk, Mamie Lau"
```

####2. Localized
```
"coauthor": [ { "k":"en", "v":"Yuka Hayashi, Rob Oudendijk, Mamie Lau" },
              { "k":"ja", "v":"林 由佳, ロブ・オーデンダイク, マミ・ラウ"    } ]
```

&nbsp; 

## Features > `tl` Value Types

####1. Basic
```
"tl": "Kiki Tanaka"
```

####2. Localized
```
"tl": [ { "k":"en", "v":"Kiki Tanaka" },
        { "k":"ja", "v":"田中響子"     } ]
```

&nbsp; 

## Features > `desc` Value Types

####1. Basic
```
"desc": "Fukushima Zone"
```

####2. Localized
```
"desc": [ { "k":"en", "v":"Fukushima Zone"  },
          { "k":"ja", "v":"福島の帰還困難区域" } ]
```

&nbsp; 

## Features > `info` Value Types

####1. Basic
```
"info": "As of 2013-05-28..."
```

####2. Localized
```
"info": [ { "k":"en", "v":"As of 2013-05-28..."  },
          { "k":"ja", "v":"2013年5月28日..."      } ]
```

&nbsp; 

## Features > `more` Value Types

####1. Localized
```
"more": [ { "k":"en", "v":["More Info", "http://more.info" ] },
          { "k":"ja", "v":["詳細",       "http://more.info" ] },
```

&nbsp; 

## Features > `atts` Value Types

####1. Localized
```
"atts": [ { "k":"en", "v":["Wikipedia",   "http://ja.wikipedia.org/wiki/帰還困難区域"] },
          { "k":"ja", "v":["ウィキペディア", "http://ja.wikipedia.org/wiki/帰還困難区域"] } ]
```

&nbsp; 

## Features > `imgs` Value Types

The `imgs` field is the most flexible and complex, supporting several different value formats, and allowing for multiple images.

####1. Basic
```
"imgs": "world.png"
```

####2. Localized
```
"imgs": [ { "k":"en", "v":"world_en.png" },
          { "k":"ja", "v":"world_ja.png" } ]
```

####3. Localized, With Caption
```
"imgs": [ { "k":"en", "v":["The World",  "world_en.png"] },
          { "k":"ja", "v":["ザ・ワールド", "world_ja.png"] } ]
```

####4. Localized, With Caption and Custom CSS Attributes
```
"imgs": [ { "k":"en", "v":["The World",  "world_en.png", "filter:brightness(1.5);"] },
          { "k":"ja", "v":["ザ・ワールド", "world_ja.png", "filter:brightness(1.5);"] } ]
```

*Note:* While a caption must be specified to use custom CSS attributes, leaving the caption as an empty string (`""`) allows for the use of custom CSS attributes and in effect, no caption.

&nbsp; 

## Externally-Defined Localized Strings

When displaying the infowindow, some of the strings come from an external file, `localized_strings.json` as follows:

Description         | `localized_strings.json` Key | Example Value (English)     | Example Value (Japanese)|
--------------------|------------------------------|-----------------------------|-------------------------|
"atts" header       | `INFOWINDOW_REFERENCES`      | "References"                | "帰属"                   |
"author" prepend    | `INFOWINDOW_AUTHOR_BY`       | "By"                        | "著者"                   |
"coauthor" prepend  | `INFOWINDOW_COAUTHOR_BY`     | "With"                      | "共著"                   |
"tl" prepend        | `INFOWINDOW_TL_BY`           | "TL"                        | "翻訳"                   |
Regex'd link text\* | `INFOWINDOW_FULL_ARTICLE`    | "Full Article"              | "全記事"                  |
Regex'd info text\* | `INFOWINDOW_TL_NA`           | "[Translation Unavailable]" | "[翻訳はまだ利用できません]" |


\* See "String Substitution" below for more information.

&nbsp; 

## String Substitution

When displaying the infowindow, any of the below strings appearing in any of the metadata will be replaced by a value from `localized_strings.json` as follows:

String           | `localized_strings.json` Key | Example Value (English)     | Example Value (Japanese) |
-----------------|------------------------------|-----------------------------|--------------------------|
`{FULL_ARTICLE}` | `INFOWINDOW_FULL_ARTICLE`    | "Full Article"              | "全記事"                  |
`{TL_NA}`        | `INFOWINDOW_TL_NA`           | "[Translation Unavailable]" | "[翻訳はまだ利用できません]" |

&nbsp; 

### String Substitution > `{TL_NA}` Details

* Problem: What if there isn't a translation available for the user's language?
* Ideally: show the user a "translation not available" message.
* Bad: Duplicating the English `info` text and prepending a "translation not available" message for every language --  inefficient and time-consuming to maintain.
* Solution: the tag `{TL_NA}` allows this to be handled automatically.
* `{TL_NA}` is replaced by a localized "translation not available" message if both:
 1. The user's language is **not** specified by an `info` key-value pair, and
 2. The `info` node must specify a language, and cannot simply be a string.
* `{TL_NA}` is removed instead if either:
 1. The user's language is specified by an `info` key-value pair, or 
 2. The `info` node does not specify a language, and is simply a string.
* It is recommended to put `{TL_NA}` at the beginning of the `info` value string.

&nbsp; 

### String Substitution > `{TL_NA}` Details > Example 1
```
"info": [ { "k":"en", "v":"{TL_NA}Back in December of 2012..." },
          { "k":"ja", "v":"{TL_NA}2012年12月..."                } ],
```
The output text for the user's language setting is as follows:

* **`en`**: "Back in December of 2012..."  
* **`ja`**: "2012年12月..."  
* **`es`**: "[Traducción no Disponible] Back in December of 2012..."

&nbsp; 

### String Substitution > `{TL_NA}` Details > Example 2
```
"info":"{TL_NA}Back in December of 2012...",
```
The output text for the user's language setting is as follows:

* **`en`**: "Back in December of 2012..."  
* **`ja`**: "Back in December of 2012..."  
* **`es`**: "Back in December of 2012..."  

&nbsp; 

### String Substitution > `{TL_NA}` Details > Example 3
```
"info": [ { "k":"ja", "v":"{TL_NA}2012年12月..." } ],
```
The output text for the user's language setting is as follows:

* **`en`**: "[Translation Unavailable] 2012年12月..."  
* **`ja`**: "2012年12月..."  
* **`es`**: "[Traducción no Disponible] 2012年12月..."

&nbsp; 
&nbsp; 
&nbsp; 
&nbsp; 
&nbsp; 
&nbsp; 

## Appendix: Basic JSON Errors

A common mistake in editing JSON is to use trailing commas.  This is bad and breaks parsing the entire JSON object.
```
     { "a":1, "b":2, }   // <-- wrong
     { "a":1, "b":2  }   // <-- right
```

```
     [ { "k":"en", "v":"1" },
       { "k":"ja", "v":"1" }, ]   // <-- wrong
       
     [ { "k":"en", "v":"1" },
       { "k":"ja", "v":"1" }  ]   // <-- right
```

At the same time, don't forget to use commas.
```
     [ { "k":"en", "v":"1" }
       { "k":"ja", "v":"1" }  ]   // <-- wrong
       
     [ { "k":"en", "v":"1" },
       { "k":"ja", "v":"1" }  ]   // <-- right
```
