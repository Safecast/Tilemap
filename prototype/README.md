Prototypes
----------

Miscellaneous prototypes that should not be considered production code.

These files may or may not have any direct relevance to the Tilemap, and are mostly archived here to place them under version control.

No support is given for these files, nor is their continued functionality or maintenance guaranteed.  No documentation beyond this will be created for these files.

It is recommended that if these files are used at all, they should be used for reference only.  Even so, please note they do not consitute an offical reference or recommendations by Safecast.  Furthermore, as the very nature of a prototype is to become obsolete and no longer be updated, it is the responsibility of the reader to verify the information in them is up-to-date.

#### `testparse2.html`

Development version of the bGeigie Viewer, modified to support showing an elevation profile for a single log file.

This feature was removed in the production version, but is still useful on rare occasions for drive forensics.

#### `satoru_safecast_upload.html`

Pure JavaScript implementation of code to parse non-Safecast log files in a very specific format and submit them one point at a time to the Safecast API.

While this code worked and served its purpose, it should generally not be used as-is.  Instead, a bGeigie log file should be synthesized such that it can be human-reviewed.

An example of this superior log file synthesis approach can be found can be found in the Safecast Drive apps for iOS and Android.

#### `best_devicefu.html`

In-progress prototype of grid summary view for ingest devices, auto-updating from the ingest server's device stats JSON feed.

#### `/flags/`

SVG country flags, from [here.](https://github.com/lipis/flag-icon-css)  Used by `best_devicefu.html` due to Windows' lack of support for Emoji flags.
