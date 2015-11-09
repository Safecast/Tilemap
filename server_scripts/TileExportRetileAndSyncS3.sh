#!/bin/bash

# =============================== 1. Set Paths ================================

export PYTHONPATH=/usr/local/lib/python2.7/site-packages

PATH=$PATH:/usr/bin
PATH=$PATH:/bin
PATH=$PATH:/usr/sbin
PATH=$PATH:/usr/local/bin
PATH=$PATH:/Users/safecast/Safecast/Retile/app/
export PATH


# ================== 2. Update and Create Base 256x256 Tiles ==================

/Applications/GeigerBotOSX.app/Contents/MacOS/GeigerBotOSX -autorun -p2 -cust -perfectIdx -allsubs -subdirs0 -z17

# ==================== 3. Update WMTS Date on 256x256 Tiles ====================

cd /Library/WebServer/Documents/tilemap/TileExport
echo '{' > metadata.json
echo '    "version": "1", ' >> metadata.json
echo '    "name": "Safecast Point Map", ' >> metadata.json
echo '    "description": "'$(date +%Y-%m-%d)'", ' >> metadata.json
echo '    "bounds":"-180.0,-85.05,180.0,85.05"' >> metadata.json
echo '}' >> metadata.json

# ================= 4. Create 512x512 Tiles from 256x256 Tiles =================

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

# ======================= 5. Amazon S3 - Sync .us Region =======================

cd /Library/WebServer/Documents/tilemap/TileExport512

aws s3 sync 1 s3://te512.safecast.org/1 --acl public-read --delete --cache-control "max-age=7200"
aws s3 sync 2 s3://te512.safecast.org/2 --acl public-read --delete --cache-control "max-age=7200"
aws s3 sync 3 s3://te512.safecast.org/3 --acl public-read --delete --cache-control "max-age=7200"
aws s3 sync 4 s3://te512.safecast.org/4 --acl public-read --delete --cache-control "max-age=7200"
aws s3 sync 5 s3://te512.safecast.org/5 --acl public-read --delete --cache-control "max-age=7200"
aws s3 sync 6 s3://te512.safecast.org/6 --acl public-read --delete --cache-control "max-age=7200"
aws s3 sync 7 s3://te512.safecast.org/7 --acl public-read --delete --cache-control "max-age=7200"
aws s3 sync 8 s3://te512.safecast.org/8 --acl public-read --delete --cache-control "max-age=7200"
aws s3 sync 9 s3://te512.safecast.org/9 --acl public-read --delete --cache-control "max-age=7200"
aws s3 sync 10 s3://te512.safecast.org/10 --acl public-read --delete --cache-control "max-age=7200"
aws s3 sync 11 s3://te512.safecast.org/11 --acl public-read --delete --cache-control "max-age=7200"
aws s3 sync 12 s3://te512.safecast.org/12 --acl public-read --delete --cache-control "max-age=7200"
time aws s3 sync 13 s3://te512.safecast.org/13 --acl public-read --delete --cache-control "max-age=7200"
time aws s3 sync 14 s3://te512.safecast.org/14 --acl public-read --delete --cache-control "max-age=7200"
time aws s3 sync 15 s3://te512.safecast.org/15 --acl public-read --delete --cache-control "max-age=7200"
time aws s3 sync 16 s3://te512.safecast.org/16 --acl public-read --delete --cache-control "max-age=7200"

# ============= 6. Amazon S3 - Force Update z=0 For Date on Client =============
touch ./0/0/0.png
aws s3 sync 0 s3://te512.safecast.org/0 --acl public-read --delete --cache-control "max-age=60"


# ================ 7. Amazon S3 - Sync .us Region -> .jp Region ================

time aws s3 sync s3://te512.safecast.org s3://te512jp.safecast.org --source-region us-east-1 --region ap-northeast-1 --acl public-read --delete --cache-control "max-age=7200"

aws s3 sync 0 s3://te512jp.safecast.org/0 --acl public-read --delete --cache-control "max-age=60" --region ap-northeast-1












