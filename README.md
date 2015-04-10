# Tilemap

This is the code and content for the current production Safecast web map, http://safecast.org/tilemap


## Overview

Graphical overview of files:
https://github.com/Safecast/Tilemap/blob/master/webmap_files_2048x1536.png


Graphical overview of data flow:
https://github.com/Safecast/Tilemap/blob/master/webmap_dataflow_2048x1536.png


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


## Todo

(further documentation is forthcoming)
