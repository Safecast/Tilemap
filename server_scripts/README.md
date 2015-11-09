## Server Use of the Safecast OS X Application

Abstract
========

The Safecast app for OS X was designed primarily to facilitate the export of autonomously updated Safecast map tiles.  Currently, in runs on the production server `safecast.media.mit.edu` in this role.  Also used are Lionel's Python interpolation script, the Amazon aws CLI, and Retile.

Introduction
============

The Tilemap web app presents primarily tiled map content.  This document contains information related to generating and serving the tile content to users.

Requirements
============

The use of the app to generate tiles require a machine running OS X 10.9 or later, with OS X 10.10 being strongly recommended due to fixes for spatial precision in the Accelerate framework's Lanczos scale function.  Due to the large volumes of tiles involved, it is recommended that this also be the webserver, and thus have adequate hardware and network resources.
The Safecast app can be (freely) obtained from the App Store.  Periodically, a beta version may also be running on the server, compiled as "GeigerBotOSX" to prevent collision between beta releases and publishing App Store updates.

Setup And Configuration - App
=============================

1. Install the app and launch it.
2. Because of the permissions involved in OSX, a proprietary Apple bookmark must be created within the app via user input to write files to an output path.  Thus, a manual export on a clean install is required in order to register this bookmark with the OS and save it.
 * Click Layers -> Export Layer as PNG tileset...
 * Choose the path you want tiles to be created at.  On the current server, this is `/Library/WebServer/Documents/tilemap/`
 * Change the max zoom level to 0 to make this much faster.
 * Click export.
3. Configure the LUT to improve PNG tile efficiency.
 * Click `LUT -> LUT Options -> Discretize-> 64`

Setup And Configuration - Server
================================

1. Verify the single tile you just exported is accessible via Apache or the webserver you are running.  If not, resolve the filesystem or webserver permissions issues.
2. Install a crontab job to run the app daily as an automated process.  See example at end of document.
3. Serve tiles via Apache:
 1. Configure Apache to allow CORS access for necessary client functionality, and improve caching.  See example at end.
 2. For each individual tile path, for example `/Library/WebServer/Documents/tilemap/TileExport`, create a file named `.htaccess` to specify better cache settings than the Apache defaults.  These should relate to how often the dataset is updated.  Again, example at end.
4. *OR*, serve tiles via Amazon S3:
 1. Install s3cmd and aws-cli, specifying a default region of us-east-1.
 2. Use the scripts in this repo to sync tiles to buckets.

Setup And Configuration - 512x512 Tiles
=======================================

* To significantly improve performance via less HTTP connections, 512x512 pixel map tiles are used by the Safecast Tilemap instead of 256x256 tiles.
* However, currently the app only exports standard 256x256 tiles.  Retile, available via Safecast's Github repo, is used to build the 512x512 tiles from the 256x256 tiles.
* Thus, by default those tiles you just export will never be seen.
You must either:
* Install Retile and configure a shell script you can invoke with crontab to run in assemble mode and create 512x512 pixel tiles from the exported 256x256 tiles.  This should be run after the app does.
or:
* Instead of Retile, you may also reconfigure the tilemap for 256x256 tiles by editing `safemap.js` (search for "512"), minifying it, and deploying to production.: `http://safecast.org/tilemap/safemap_minifi.js`  The non-minified `safemap.js` is available via Safecast's Github repo.

I would strongly recommend Retile until the app has native 512x512 export support, as it offers significantly superior client performance over 256x256 tiles due to the limitations of HTTP/1.x.  Further, for Amazon S3 use, costs are lowered via fewer requests.  

Setup And Configuration - Lionel's Interpolation Script
=======================================================

Unknown.
   
   
Initial Dataset Update
======================

Click Layers -> Update Safecast Data.  Wait until done.  (<1 min)

Initial Custom Layer Configuration
==================================

Currently, the Safecast Tilemap uses bitstore.js to provide client-side indexing of map tiles.  There is a rather nasty performance hit, particulary in Apache on OSX, for requesting a tile that is not present in the filesystem.
However, the map tiles created by the app are not normally suitable for this, as they use a NODATA fill operation to make them easier to see at the cost of losing the original spatial information.
As a workaround, the custom layer must be configured so that the NODATA fill operation does not confuse the bitmap indexing being used by the client.  To accomplish this, the actual spatial source data will have an alpha channel value of 255, and the interpolated fill an alpha value not exceeding 254.

Click Layers -> Configure Custom Layer:

1. Primary layer:
 * Layer: Safecast uSv/h
 * PreFx: None
 * PostFx: None
 * Alpha: 100% (slider at right)
2. Sublayer 1:
 * Layer: Safecast uSv/h
 * PreFx: Smart Resize 3x3
 * PostFx: Shadow Halo 5x5
 * Alpha: 95% (slider almost to right)
3. Sublayer 2: None
4. Sublayer 3: None

Before closing the custom layer dialog, hover the mouse pointer over the alpha sliders for the primary and first sublayer.  Verify that the tooltip for the primary layer shows 100% - opaque and the sublayer ~95%.
If this is not done, it will not cause a fatal error, but it will degrade both client and server performance somewhat.

Initial Full Tileset Creaton
============================

Note: This takes ~1 hour.
This is necessary because the automated job as configured only exports the tiles which have changed since the last update.

1. Click `Layer -> Custom Layer` to select the layer you just configured.
2. Click `Layer -> Export PNG Tileset From Layer`.
3. Change the maximum zoom level to 17.
4. Choose a suitable output path, eg: `/Library/Webserver/Documents/tilemap/`
4. Click "Export" and wait until it is complete.
5. If using 512x512 tiles, you'll want to run Retile now.

httpd.conf Customizations (non-S3)
==================================

eg: `/etc/apache2/httpd.conf`

Note this must be done with SU permissions.  In OSX, the command to obtain
those is `sudo su`; by itself, `sudo` alone will often and randomly fail.

Under the appropriate main path section:

```
Header set Access-Control-Allow-Origin "*"
# 2015-05-10 ND: expiration rules for better caching
ExpiresActive On
ExpiresByType image/png "access plus 4 hours"
ExpiresByType image/jpeg "access plus 4 hours"
ExpiresByType text/html "access plus 4 hours"
ExpiresByType text/css "access plus 4 hours"
ExpiresByType text/javascript "access plus 4 hours"
ExpiresByType application/javascript "access plus 4 hours"
# 2015-05-11 ND: new redirect for null tiles
FallbackResource /tilemap/null.png
```
     
Note that here, "null.png" is a 1x1 pixel transparent PNG file.

.htaccess For a Tile Path Root (non-S3)
=======================================

eg: `/Library/WebServer/documents/tilemap/TileExport/.htaccess`

```
     ExpiresActive On
     ExpiresByType image/png "modification plus 24 hours"
```

Amazon S3 Configuration
=======================

1. Create a bucket on `us-east-1` (.va.us):
 * `s3cmd mb s3://te512.safecast.org`
2. Create a bucket on `ap-northeast-1` (.jp) with "jp" suffixed to the prefix of the previous name:
 * `s3cmd mb s3://te512jp.safecast.org --region=ap-northeast-1`
3. Apply CORS to each region's bucket. (s3_cors.xml at end of this document)
 * `s3cmd setcors s3_cors.xml s3://te512.safecast.org`
 * `s3cmd setcors s3_cors.xml s3://te512jp.safecast.org --region=ap-northeast-1 `
4. Sync/upload to the .us bucket:
 * `cd /Library/WebServer/Documents/tilemap/TileExport512`
 * Using s3cmd:
 * `s3cmd sync 1 s3://te512.safecast.org --acl-public --add-header="Cache-Control:max-age=7200"`
 * Or, using the aws CLI:
 * `aws s3 sync 12 s3://te512.safecast.org/12 --acl public-read --delete --cache-control "max-age=7200"``
 * (repeat for all zoom levels)
5. Synchronize the buckets remotely between regions:
 * `aws s3 sync s3://te512.safecast.org s3://te512jp.safecast.org --source-region us-east-1 --region ap-northeast-1 --acl public-read --delete --cache-control "max-age=7200"`
 * (a remote server sync is used here for performance; a local sync to the ap-northeast-1 region will also work, but will be slower)
6. Force update the index tile used by bitstore.js so the client's date display is updated correctly:
 * `touch ./0/0/0.png`
 * Using s3cmd:
 * `s3cmd put --recursive 0 s3://te512.safecast.org --acl-public`
 * `s3cmd put --recursive 0 s3://te512jp.safecast.org --acl-public --region=ap-northeast-1`
 * Or, using the aws CLI:
 * `aws s3 cp 0 s3://te512.safecast.org/0 --acl public-read --recursive`
 * `aws s3 cp 0 s3://te512jp.safecast.org/0 --acl public-read --recursive --region ap-northeast-1`

Now, tiles will be available at:

* `http://te512.safecast.org.s3.amazonaws.com/{z}/{x}/{y}.png`
* `http://te512jp.safecast.org.s3-ap-northeast-1.amazonaws.com/{z}/{x}/{y}.png`

Notes:

* Specifying `--acl-public` (s3cmd) or `--acl public-read` (aws) must be done in every put/cp/sync command.
* aws-cli is multithreaded and significantly faster than s3cmd, but synchronizes using the local file's modified date, rather than md5sum as s3cmd does.
* If using aws to sync local files remotely, note that the syntax is different from s3cmd and the initial path specified must be appended to the remote bucket.

Example Command-Line For Running App
====================================

More info on command line parameters can be obtained by running the app from a terminal with -help.

```
/Applications/GeigerBotOSX.app/Contents/MacOS/GeigerBotOSX -autorun -p2 -cust -perfectIdx -allsubs -subdirs0 -z17 >> /Users/safecast/tilemap.log 2>&1
```

bulktar.sh Script
=================

A useful shell script for creating a TAR archive of map tiles, as the normal command will fail due to the number of tiles.  This also excludes the Apple metadata file bloat.  After creating it, run chmod 777 (or whatever) to make it executable.  Note that your current path should be the root level of an individual set of tiles, eg: `/Library/WebServer/documents/tilemap/TileExport`

```
#!/bin/sh
set COPYFILE_DISABLE=1
COPYFILE_DISABLE=1; export COPYFILE_DISABLE
find . -name '*.png' -print | tar -zcf bulk.tar.gz --files-from -
unset COPYFILE_DISABLE; export COPYFILE_DISABLE
```

Full Production Crontab (2015-10-31)
====================================

```
0 6 * * * /Users/safecast/Safecast/safemaps/autobuild.sh >> /Users/safecast/safemap.log 2>&1
30 01 * * * /Users/safecast/Safecast/TileExportRetileAndSyncS3.sh >> /Users/safecast/tilemap.log 2>&1
*/3 * * * * /Users/safecast/Safecast/Databot/processMail.sh
*/3 * * * * /Users/safecast/Safecast/Databot-JP/processMail.sh
1 * * * * /Library/WebServer/Documents/radangel/update.sh >> /Library/WebServer/Documents/radangel/radangel.log 2>&1
```

Amazon S3 CORS File (s3_cors.xml)
=================================
```
<?xml version="1.0" encoding="UTF-8"?>
<CORSConfiguration xmlns="http://s3.amazonaws.com/doc/2006-03-01/">
    <CORSRule>
        <AllowedOrigin>*</AllowedOrigin>
        <AllowedMethod>GET</AllowedMethod>
        <AllowedHeader>Authorization</AllowedHeader>
    </CORSRule>
</CORSConfiguration>
```

Contingency Planning
====================
Currently, the tiles are sync'd to Amazon S3 buckets, which provides a high degree of availability in the event safecast.media.mit.edu goes down.  However, for the server itself, only partial backups are currently made via crashplan.
