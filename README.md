# Tilemap

Code and content for the current production Safecast web map, http://safecast.org/tilemap


## Abstract

The Safecast Tilemap is a single-page web application using the Google Maps API v3 to provide visualization and analysis of the Safecast dataset.  This is principally accomplished through the display of standard Web Mercator map tiles.  Other features include a bGeigie log viewer and query interface, a raster cell value lookup tool, and display of the Safecast real-time sensors.




## Overview - Files

![webmap_files.png](https://github.com/Safecast/Tilemap/raw/master/webmap_files_2048x1536.png)

Not shown in files graphic:

1. whatsnew_(lang)_inline.html - this is the content displayed for the "what's new" feature, a one-shot time-limited pop-up which may also be viewed though "About"
2. methdology.html - content which describes data processing methodology.  This is a separate HTML document opened in a new window.
3. gbGIS_min.js - remanants of legacy code from an alpha version.  This is used only for the bitmap index visualization features.




## Overview - Data Flow
![webmap_dataflow.png](https://github.com/Safecast/Tilemap/raw/master/webmap_dataflow_2048x1536.png)

Not shown in data flow graphic:

1. rt_viewer.js - chart images are currently created and hosted on gamma.tar.gz, using both api.safecast.org and rt.safecast.org as a datasource.  This process eventually should be moved to rt.safecast.org.
2. safemap.js - Lionel's Python interpolation script - this is responsible for regenerating the interpolated Safecast tiles daily, using mclean.tar.gz downloaded from api.safecast.org.  Source which has been likely modified from its repo state: https://github.com/bidouilles/safemaps




## Deployments

The references within these files are for minified versions of .js files, typically a _min suffix.  Thus, to deploy, the code here must be minified using a tool such as http://jscompress.com


Please coordinate any production or test deployments with Nick Dolezal.  Thanks!


## External Dependencies

NOTE: A required component, bitstore.js, is not included here.  That's because it already has its own Github repo: https://github.com/Safecast/bitstore.js


## Cient Requirements

IE10+, any semi-recent version of Chrome, Safari, Firefox, etc.  Please make sure to account for mobile devices, UI paradigms, and screen sizes with any changes made.


## Server Requirements

There are no particular server requirements for hosting these files, and they may be served from any HTTP server.  When testing locally, you should use a local HTTP server, rather than file://.  The reason being that almost all code and content is now loaded asynchronously and that requires HTTP.


## Domain-Specific References:
1. index.html -- has a hardcoded meta origin tag.  This is so things don't break when the QueryString gets long.
2. safemap.js -- contains hardcoded references to bitstore_min.js and png_zlib_worker_min.js.  Necessary because bitstore.js uses inlined web workers, which require absolute URLs.  You don't have to change these for testing, unless you're using a different version of bitstore.js than the server.


## Tilemap: Future Todo
1. Japanese language support
2. Per-log metadata display for the bGeigie log viewer
3. Hack-ish spatial query to find logs at a location (which the API does not support a spatial query for)
4. Addition of content from Azby
5. Addition of NNSA Washington DC data/follow-up


## Licensing

Individual licenses are displayed at the top of each .js file.  In general, most things here created by Safecast are public domain/CC0.  The Safecast logo and name are not.


## Reuse

Although this is mostly an internally-focused repository, you are welcome to re-use whatever parts are useful to you.  Attribution is always appreciated, but may not be required depending on the specific licensing for the code/content in question.

Note that thus far, only one component of the tilemap, bitstore.js, has been expressly created as a general-purpose library.  Other components are designed specifically to work with Safecast data, and will likely require modification to be used for other things.

The servers used to provide data to the tilemap have finite capacity.  If you use them in your own application, please be curteous of this.



# Technical Documentation


# Summary of Main Content Files and Scripts


## index.html

index.html is the main content page the tilemap is accessed from.  It contains the general UI/layout for the map, and coordinates loading the initial file requirements.  It also contains a number of divs used as databinds for asynchronously loaded content and scripts

In general, heavy use is made of asynchronous and deferred loads to improve initial load times.  This even applies to the images, which were found in testing to delay loading of other scripts.  Much of this is related to the nature of HTTP 1.0/1.1.


## safemap.js

safemap.js is the main "codebehind" for index.html, containing the majority of the scripts used by the tilemap.  It manages all tile content for the map, facilitates UI events, and controls asynchronous loads of other code modules.

As with index.html, the codebase relies heavily on asynchronous loading of scripts and contents.  This creates a certain degree of code complexity.

To safely handle asynchronous loads of other code modules, proxy classes are used.  Other code should only refer to these proxy classes, and never the objects they retain which may or may not be loaded.

To purely display a tile overlay, no script other than safemap.js is necessarily required.

safemap.js is always loaded.


## bitstore.js

bitstore.js was the first external script created for the tilemap.  It provides automated indexing of raster tiles, implemented in the form of myBitstore.ShouldLoadTile().  This provides a significant performance improvement, especially at higher zoom levels, as the webserver hosting the tiles has significantly greater latency when a tile request is 404 than when it is present.

bitstore.js also updates the layer's date in the UI via a callback function.

bitstore.js is always loaded.


## bgeigie_viewer.js

bgeigie_viewer.js is perhaps the single most complex component.  It is responsible for the query and display of one or more bGeigie log files, and is capable of displaying a relatively large number of point features / markers on the client.  The complexity arises from the manual marker management and data processing involved to accomplish the degree of scalability it provides.

Despite its complexity, bgeigie_viewer.js may be useful elsewhere if modified.  To the best of my knowledge, no other JavaScript library provides anything remotely near its scalability and performance, enabling large point feature datasets to be viewed without a dedicated GIS server.

bgeigie_viewer.js is loaded only on-demand.


## rt_viewer.js

rt_viewer.js is currently likely the simplest component to re-use in another map, able to be instantiated and work from a single line of code.  It displays all Safecast real-time sensors reported to it from rt.safecast.org, both online and offline, as markers on the map.  rt_viewer.js is a simplified version of beigie_viewer.js's code, rewritten to support the requirements for real-time sensors.

rt_viewer.js replaced Google Fusion Tables, which had limited symbology that showed no contextual information about a particular sensor.  rt_viewer.js displays the dose rate as a color matching the other map symbology, and indicates online or offline status with a ring around it.  It also rescales the markers at lower zoom levels such that they obscure the map (and each other) less.

Note that due to current Safecast API limitations, there is no concept of a "metasensor" consisting of multiple individual radiation sensors.  Because of this, rt_viewer.js has some particular handling that implicitly recognizes dual-sensor hardware.  For sensors sharing the exact same lat/lon (no epsilon), the maxima is used as the value for all of them.  When displaying an infowindow, a chart is shown for again, all sensors at that exact lat/lon.

rt_viewer.js is always loaded.


## hud.js

hud.js contains the query reticle, which displays the classification range and median value for a color used by a pixel in a raster map tile.

Note that any new layers added must match existing symbology, or it will need to be updated with additional lookup tables in hud_worker.js to perform this action.

hud.js works by iterating through a batch of one or more URLs representing active layer(s), retrieving the tile specified by the URL from the server, and attempting to find the nearest pixel within a search radius.  If no match is found, the next tile in the batch is attempted, and so on.  If a match is found, the RGB colors are matched to a premade lookup table to determine the value and range, with some tolerance given as RGB color matches are often not 100%.

hud.js is loaded only on-demand.




(further documentation is forthcoming)
