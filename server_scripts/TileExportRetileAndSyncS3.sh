#!/bin/bash

# ================== 1. Set Paths ==================

export PYTHONPATH=/usr/local/lib/python2.7/site-packages

PATH=$PATH:/usr/bin
PATH=$PATH:/bin
PATH=$PATH:/usr/sbin
PATH=$PATH:/usr/local/bin
PATH=$PATH:/Users/safecast/Safecast/Retile/app/
export PATH

# ================== 2. Update and Create Base 256x256 Tiles ==================

/Applications/GeigerBotOSX.app/Contents/MacOS/GeigerBotOSX -autorun -p2 -cust -perfectIdx -allsubs -subdirs0 -z17

# ================== 3. Create 512x512 Tiles from 256x256 Tiles ==================

Retile /Library/WebServer/Documents/tilemap/TileExport/17 /Library/WebServer/Documents/tilemap/TileExport512 -Assemble
Retile /Library/WebServer/Documents/tilemap/TileExport/16 /Library/WebServer/Documents/tilemap/TileExport512 -Assemble
Retile /Library/WebServer/Documents/tilemap/TileExport/15 /Library/WebServer/Documents/tilemap/TileExport512 -Assemble
Retile /Library/WebServer/Documents/tilemap/TileExport/14 /Library/WebServer/Documents/tilemap/TileExport512 -Assemble
Retile /Library/WebServer/Documents/tilemap/TileExport/13 /Library/WebServer/Documents/tilemap/TileExport512 -Assemble
Retile /Library/WebServer/Documents/tilemap/TileExport/12 /Library/WebServer/Documents/tilemap/TileExport512 -Assemble
Retile /Library/WebServer/Documents/tilemap/TileExport/11 /Library/WebServer/Documents/tilemap/TileExport512 -Assemble
Retile /Library/WebServer/Documents/tilemap/TileExport/10 /Library/WebServer/Documents/tilemap/TileExport512 -Assemble
Retile /Library/WebServer/Documents/tilemap/TileExport/9 /Library/WebServer/Documents/tilemap/TileExport512 -Assemble
Retile /Library/WebServer/Documents/tilemap/TileExport/8 /Library/WebServer/Documents/tilemap/TileExport512 -Assemble
Retile /Library/WebServer/Documents/tilemap/TileExport/7 /Library/WebServer/Documents/tilemap/TileExport512 -Assemble
Retile /Library/WebServer/Documents/tilemap/TileExport/6 /Library/WebServer/Documents/tilemap/TileExport512 -Assemble
Retile /Library/WebServer/Documents/tilemap/TileExport/5 /Library/WebServer/Documents/tilemap/TileExport512 -Assemble
Retile /Library/WebServer/Documents/tilemap/TileExport/4 /Library/WebServer/Documents/tilemap/TileExport512 -Assemble
Retile /Library/WebServer/Documents/tilemap/TileExport/3 /Library/WebServer/Documents/tilemap/TileExport512 -Assemble
Retile /Library/WebServer/Documents/tilemap/TileExport/2 /Library/WebServer/Documents/tilemap/TileExport512 -Assemble
Retile /Library/WebServer/Documents/tilemap/TileExport/1 /Library/WebServer/Documents/tilemap/TileExport512 -Assemble

# ================== 4. Amazon S3 - Sync .us Region ==================

cd /Library/WebServer/Documents/tilemap/TileExport512
s3cmd sync 1 s3://te512.safecast.org --acl-public --add-header="Cache-Control:max-age=7200"
s3cmd sync 2 s3://te512.safecast.org --acl-public --add-header="Cache-Control:max-age=7200"
s3cmd sync 3 s3://te512.safecast.org --acl-public --add-header="Cache-Control:max-age=7200"
s3cmd sync 4 s3://te512.safecast.org --acl-public --add-header="Cache-Control:max-age=7200"
s3cmd sync 5 s3://te512.safecast.org --acl-public --add-header="Cache-Control:max-age=7200"
s3cmd sync 6 s3://te512.safecast.org --acl-public --add-header="Cache-Control:max-age=7200"
s3cmd sync 7 s3://te512.safecast.org --acl-public --add-header="Cache-Control:max-age=7200"
s3cmd sync 8 s3://te512.safecast.org --acl-public --add-header="Cache-Control:max-age=7200"
s3cmd sync 9 s3://te512.safecast.org --acl-public --add-header="Cache-Control:max-age=7200"
s3cmd sync 10 s3://te512.safecast.org --acl-public --add-header="Cache-Control:max-age=7200"
s3cmd sync 11 s3://te512.safecast.org --acl-public --add-header="Cache-Control:max-age=7200"
s3cmd sync 12 s3://te512.safecast.org --acl-public --add-header="Cache-Control:max-age=7200"
time s3cmd sync 13 s3://te512.safecast.org --acl-public --add-header="Cache-Control:max-age=7200"
time s3cmd sync 14 s3://te512.safecast.org --acl-public --add-header="Cache-Control:max-age=7200"
time s3cmd sync 15 s3://te512.safecast.org --acl-public --add-header="Cache-Control:max-age=7200"
time s3cmd sync 16 s3://te512.safecast.org --acl-public --add-header="Cache-Control:max-age=7200"

# ================== 5. Amazon S3 - Force Update z=0 For Date on Client ==================
touch ./0/0/0.png
s3cmd put --recursive 0 s3://te512.safecast.org --acl-public


# ================== 8. Amazon S3 - Sync .us Region -> .jp Region ==================

time aws s3 sync s3://te512.safecast.org s3://te512jp.safecast.org --source-region us-east-1 --region ap-northeast-1 --acl public-read --delete

s3cmd put --recursive 0 s3://te512jp.safecast.org --acl-public --region=ap-northeast-1













