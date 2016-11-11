#!/bin/bash

# =============================== 0. Secure clean exit ========================
function clean_up
{
	echo -ne "\n!\n"
	echo -ne "! Ctrl+C or other exit....\n"
	echo -ne "!\n"
	exit 4
}
trap clean_up SIGHUP SIGINT SIGTERM

# =============================== 1. Set Environment ==========================

export PYTHONPATH=/usr/local/lib/python2.7/site-packages

PATH=$PATH:/usr/bin
PATH=$PATH:/bin
PATH=$PATH:/usr/sbin
PATH=$PATH:/usr/local/bin
PATH=$PATH:/Users/safecast/Safecast/Retile/app/
export PATH

export SQLITE_DB='/Users/safecast/Library/Containers/com.ndolezal.GeigerBotOSX/Data/Documents/safecast-2014-03-11.sqlite'
export TODAY="$(date +%F)"
export COVERAGE_LOG='/Users/safecast/coverage.csv'
export COVERAGE_HEADER='#ISO-8601,z=0,z=1,z=2,z=3,z=4,z=5,z=6,z=7,z=8,z=9,z=10,z=11,z=12,z=13'

# ================== 2. Update and Create Base 256x256 Tiles ==================

/Applications/GeigerBotOSX.app/Contents/MacOS/GeigerBotOSX -autorun -p2 -cust -perfectIdx -allsubs -subdirs0 -z17

# ==================== 3. Update WMTS Date on 256x256 Tiles ====================

cd /Library/WebServer/Documents/tilemap/TileExport

cat <<EOJ >metadata.json
{
    "version": "1",
    "name": "Safecast Point Map",
    "description": "${TODAY}",
    "bounds":"-180.0,-85.05,180.0,85.05"
}
EOJ

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

# ======================= and log data coverage ================================
SQL='SELECT GROUP_CONCAT(C) FROM (SELECT SUM(DataCount) AS C FROM Tiles GROUP BY TileLevel ORDER BY TileLevel);'

# start with a header, if ${COVERAGE_LOG} does NOT exist
[ -e "${COVERAGE_LOG}" ] || echo ${COVERAGE_HEADER} >${COVERAGE_LOG}
# insert a record for today's data
( echo -ne "${TODAY},";	echo  ${SQL} |sqlite3 "file://${SQLITE_DB}?mode=ro" ) >>${COVERAGE_LOG}

# prettyprint today's data
echo
echo "Current coverage data by zoom level:"
( head -n1 ${COVERAGE_LOG}; tail -n1 ${COVERAGE_LOG} ) |column -s, -t
echo

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
if test $(find ${SQLITE_DB} -mmin -1440)
then
    touch ./0/0/0.png
fi
aws s3 sync 0 s3://te512.safecast.org/0 --acl public-read --delete --cache-control "max-age=60"


# ======================= 7. Amazon S3 - Sync .jp Region =======================

aws s3 sync 1 s3://te512jp.safecast.org/1 --acl public-read --delete --cache-control "max-age=7200" --region ap-northeast-1
aws s3 sync 2 s3://te512jp.safecast.org/2 --acl public-read --delete --cache-control "max-age=7200" --region ap-northeast-1
aws s3 sync 3 s3://te512jp.safecast.org/3 --acl public-read --delete --cache-control "max-age=7200" --region ap-northeast-1
aws s3 sync 4 s3://te512jp.safecast.org/4 --acl public-read --delete --cache-control "max-age=7200" --region ap-northeast-1
aws s3 sync 5 s3://te512jp.safecast.org/5 --acl public-read --delete --cache-control "max-age=7200" --region ap-northeast-1
aws s3 sync 6 s3://te512jp.safecast.org/6 --acl public-read --delete --cache-control "max-age=7200" --region ap-northeast-1
aws s3 sync 7 s3://te512jp.safecast.org/7 --acl public-read --delete --cache-control "max-age=7200" --region ap-northeast-1
aws s3 sync 8 s3://te512jp.safecast.org/8 --acl public-read --delete --cache-control "max-age=7200" --region ap-northeast-1
aws s3 sync 9 s3://te512jp.safecast.org/9 --acl public-read --delete --cache-control "max-age=7200" --region ap-northeast-1
aws s3 sync 10 s3://te512jp.safecast.org/10 --acl public-read --delete --cache-control "max-age=7200" --region ap-northeast-1
aws s3 sync 11 s3://te512jp.safecast.org/11 --acl public-read --delete --cache-control "max-age=7200" --region ap-northeast-1
aws s3 sync 12 s3://te512jp.safecast.org/12 --acl public-read --delete --cache-control "max-age=7200" --region ap-northeast-1
time aws s3 sync 13 s3://te512jp.safecast.org/13 --acl public-read --delete --cache-control "max-age=7200" --region ap-northeast-1
time aws s3 sync 14 s3://te512jp.safecast.org/14 --acl public-read --delete --cache-control "max-age=7200" --region ap-northeast-1
time aws s3 sync 15 s3://te512jp.safecast.org/15 --acl public-read --delete --cache-control "max-age=7200" --region ap-northeast-1
time aws s3 sync 16 s3://te512jp.safecast.org/16 --acl public-read --delete --cache-control "max-age=7200" --region ap-northeast-1

aws s3 sync 0 s3://te512jp.safecast.org/0 --acl public-read --delete --cache-control "max-age=60" --region ap-northeast-1

