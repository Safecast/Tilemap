# Safecast Tilemap Ubuntu Setup Guide

This guide provides step-by-step instructions for setting up the Safecast Tilemap on an Ubuntu server without requiring the OSX-specific safecast.app.

## 1. Initial Server Setup

Update your system and install required packages:

```bash
sudo apt update
sudo apt install -y python3 python3-pip python3-venv nginx wget git
```

## 2. Clone the Repository

```bash
git clone https://github.com/Safecast/Tilemap.git
cd Tilemap
```

## 3. Set Up Python Environment

```bash
python3 -m venv venv
source venv/bin/activate
pip install numpy pandas matplotlib Pillow scipy requests
```

## 4. Create Required Directories

```bash
sudo mkdir -p /var/www/html/tilemap
sudo chown -R $USER:$USER /var/www/html/tilemap
mkdir -p data
mkdir -p tiles/renderer
```

## 5. Create the Ubuntu Tile Generator Script

Create a file named `ubuntu_tile_generator.sh` in the server_scripts directory:

```bash
cat > server_scripts/ubuntu_tile_generator.sh << 'EOF'
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
export PYTHONPATH=/usr/local/lib/python3/dist-packages

PATH=$PATH:/usr/bin
PATH=$PATH:/bin
PATH=$PATH:/usr/sbin
PATH=$PATH:/usr/local/bin
export PATH

export TODAY="$(date +%F)"
export TILE_OUTPUT_DIR="/var/www/html/tilemap"
export COVERAGE_LOG="$HOME/coverage.csv"
export COVERAGE_HEADER='#ISO-8601,z=0,z=1,z=2,z=3,z=4,z=5,z=6,z=7,z=8,z=9,z=10,z=11,z=12,z=13'

# ================== 2. Download and Process Safecast Data ==================
echo "Downloading Safecast dataset..."
wget https://api.safecast.org/system/mclean.tar.gz -O ${TODAY}_measurements.tgz
tar xvfz ${TODAY}_measurements.tgz
mv mclean-out.csv ${TODAY}_measurements.csv

# ================= 3. Generate Base Tiles with Python ==================
echo "Generating base tiles with Python..."
# Make sure the Python scripts are in the current directory or specify the full path
python3 safecastAPIPrecompute.py ${TODAY}_measurements.csv -m -g 5000

# Rebuild coastlines if needed
python3 safecastCoastline.py -s safecast.pickle data/JPN_adm1.shp
cp coastline.pickle data/coastline.pickle

# Setup the precomputed data
mkdir -p tiles/renderer
cp safecast.pickle tiles/renderer/.
cp data/coastline.pickle tiles/renderer/.
cp data/waterbodies.pickle tiles/renderer/.

cd tiles/renderer/
rm -rf cached TileGriddata uncovered

# Start rendering tiles - this generates the base z=13 tiles
echo "Rendering base z=13 tiles..."
python3 prebuildtiles2.py -z 13
mv cached TileGriddata

# Create metadata.json
cd TileGriddata
echo '{' > metadata.json
echo '    "version": "1", ' >> metadata.json
echo '    "name": "Safecast Interpolation Map", ' >> metadata.json
echo '    "description": "'$(date +%Y-%m-%d)'", ' >> metadata.json
echo '    "bounds":"124.057617,24.447150,145.810547,43.357138"' >> metadata.json
echo '}' >> metadata.json

# ================= 4. Generate Additional Zoom Levels ==================
echo "Generating additional zoom levels..."
cd ../..

# Instead of using the Retile tool, we'll use a Python script to generate other zoom levels
# Create a Python script for this purpose (see ubuntu_retile.py below)
python3 ubuntu_retile.py --input_dir tiles/renderer/TileGriddata/13 --output_dir tiles/renderer/TileGriddata --generate_lower_zooms

# Generate higher zoom levels if needed
python3 ubuntu_retile.py --input_dir tiles/renderer/TileGriddata/13 --output_dir tiles/renderer/TileGriddata --generate_higher_zooms

# ================= 5. Create 512x512 Tiles ==================
echo "Creating 512x512 tiles..."
python3 ubuntu_retile.py --input_dir tiles/renderer/TileGriddata --output_dir tiles/renderer/TileGriddata512 --assemble_512

# ================= 6. Copy to Web Server Directory ==================
echo "Copying tiles to web server directory..."
mkdir -p ${TILE_OUTPUT_DIR}
cp -r tiles/renderer/TileGriddata512/* ${TILE_OUTPUT_DIR}/

# ================= 7. Clean Up ==================
echo "Cleaning up temporary files..."
rm -f ${TODAY}_measurements.tgz
rm -f ${TODAY}_measurements.csv

echo "Tile generation complete. Tiles available at ${TILE_OUTPUT_DIR}"
EOF
```

## 6. Create the Ubuntu Retile Python Script

Create a file named `ubuntu_retile.py` in the root directory:

```bash
cat > ubuntu_retile.py << 'EOF'
#!/usr/bin/env python3

import os
import sys
import argparse
from PIL import Image
import math
import shutil

def ensure_dir(directory):
    """Make sure the directory exists, create if it doesn't"""
    if not os.path.exists(directory):
        os.makedirs(directory)

def generate_lower_zooms(input_dir, output_dir, current_zoom=13):
    """Generate lower zoom levels from a higher zoom level"""
    print(f"Generating lower zoom levels from z={current_zoom}")
    
    # Start from the current zoom and work down to zoom level 0
    for zoom in range(current_zoom - 1, -1, -1):
        print(f"Generating zoom level {zoom}")
        
        # Create output directory for this zoom level
        zoom_dir = os.path.join(output_dir, str(zoom))
        ensure_dir(zoom_dir)
        
        # Get all x directories from the higher zoom level
        higher_zoom_dir = os.path.join(output_dir, str(zoom + 1))
        if not os.path.exists(higher_zoom_dir):
            print(f"Error: Higher zoom level directory {higher_zoom_dir} does not exist")
            continue
            
        # Process each x directory
        for x_dir in os.listdir(higher_zoom_dir):
            x_path = os.path.join(higher_zoom_dir, x_dir)
            if not os.path.isdir(x_path):
                continue
                
            # Calculate the new x coordinate for this zoom level
            x = int(x_dir)
            new_x = x // 2
            
            # Create the new x directory
            new_x_dir = os.path.join(zoom_dir, str(new_x))
            ensure_dir(new_x_dir)
            
            # Process each y file in this x directory
            for y_file in os.listdir(x_path):
                if not y_file.endswith('.png'):
                    continue
                    
                y = int(y_file.split('.')[0])
                new_y = y // 2
                
                # Determine which quadrant this tile belongs to
                quadrant = (x % 2) + 2 * (y % 2)  # 0=top-left, 1=top-right, 2=bottom-left, 3=bottom-right
                
                # If this is the first tile for this new coordinate, create a new image
                new_tile_path = os.path.join(new_x_dir, f"{new_y}.png")
                if not os.path.exists(new_tile_path):
                    new_img = Image.new('RGBA', (256, 256), (0, 0, 0, 0))
                    new_img.save(new_tile_path)
                
                # Open the existing tile and the current higher zoom tile
                try:
                    new_img = Image.open(new_tile_path)
                    current_img = Image.open(os.path.join(x_path, y_file))
                    
                    # Resize the current image to fit in a quadrant
                    current_img = current_img.resize((128, 128), Image.LANCZOS)
                    
                    # Paste into the correct quadrant
                    if quadrant == 0:  # top-left
                        new_img.paste(current_img, (0, 0))
                    elif quadrant == 1:  # top-right
                        new_img.paste(current_img, (128, 0))
                    elif quadrant == 2:  # bottom-left
                        new_img.paste(current_img, (0, 128))
                    else:  # bottom-right
                        new_img.paste(current_img, (128, 128))
                    
                    new_img.save(new_tile_path)
                except Exception as e:
                    print(f"Error processing tile {x_path}/{y_file}: {e}")

def generate_higher_zooms(input_dir, output_dir, current_zoom=13, target_zoom=15):
    """Generate higher zoom levels from a lower zoom level using interpolation"""
    print(f"Generating higher zoom levels from z={current_zoom} to z={target_zoom}")
    
    # Start from the current zoom and work up to the target zoom level
    for zoom in range(current_zoom + 1, target_zoom + 1):
        print(f"Generating zoom level {zoom}")
        
        # Create output directory for this zoom level
        zoom_dir = os.path.join(output_dir, str(zoom))
        ensure_dir(zoom_dir)
        
        # Get all x directories from the lower zoom level
        lower_zoom_dir = os.path.join(output_dir, str(zoom - 1))
        if not os.path.exists(lower_zoom_dir):
            print(f"Error: Lower zoom level directory {lower_zoom_dir} does not exist")
            continue
            
        # Process each x directory
        for x_dir in os.listdir(lower_zoom_dir):
            x_path = os.path.join(lower_zoom_dir, x_dir)
            if not os.path.isdir(x_path):
                continue
                
            # Calculate the new x coordinates for this zoom level
            x = int(x_dir)
            new_x1 = x * 2
            new_x2 = x * 2 + 1
            
            # Create the new x directories
            new_x1_dir = os.path.join(zoom_dir, str(new_x1))
            new_x2_dir = os.path.join(zoom_dir, str(new_x2))
            ensure_dir(new_x1_dir)
            ensure_dir(new_x2_dir)
            
            # Process each y file in this x directory
            for y_file in os.listdir(x_path):
                if not y_file.endswith('.png'):
                    continue
                    
                y = int(y_file.split('.')[0])
                new_y1 = y * 2
                new_y2 = y * 2 + 1
                
                try:
                    # Open the source tile
                    src_img = Image.open(os.path.join(x_path, y_file))
                    
                    # Resize to 2x size using LANCZOS for better quality
                    big_img = src_img.resize((512, 512), Image.LANCZOS)
                    
                    # Split into 4 tiles
                    top_left = big_img.crop((0, 0, 256, 256))
                    top_right = big_img.crop((256, 0, 512, 256))
                    bottom_left = big_img.crop((0, 256, 256, 512))
                    bottom_right = big_img.crop((256, 256, 512, 512))
                    
                    # Save the new tiles
                    top_left.save(os.path.join(new_x1_dir, f"{new_y1}.png"))
                    top_right.save(os.path.join(new_x2_dir, f"{new_y1}.png"))
                    bottom_left.save(os.path.join(new_x1_dir, f"{new_y2}.png"))
                    bottom_right.save(os.path.join(new_x2_dir, f"{new_y2}.png"))
                    
                except Exception as e:
                    print(f"Error processing tile {x_path}/{y_file}: {e}")

def assemble_512_tiles(input_dir, output_dir):
    """Create 512x512 tiles by combining four 256x256 tiles"""
    print("Creating 512x512 tiles from 256x256 tiles")
    
    # Process each zoom level
    for zoom_dir in os.listdir(input_dir):
        zoom_path = os.path.join(input_dir, zoom_dir)
        if not os.path.isdir(zoom_path) or not zoom_dir.isdigit():
            continue
            
        zoom = zoom_dir
        print(f"Processing zoom level {zoom}")
        
        # Create output directory for this zoom level
        output_zoom_dir = os.path.join(output_dir, zoom)
        ensure_dir(output_zoom_dir)
        
        # Process each x directory
        for x_dir in os.listdir(zoom_path):
            x_path = os.path.join(zoom_path, x_dir)
            if not os.path.isdir(x_path) or not x_dir.isdigit():
                continue
                
            x = int(x_dir)
            output_x_dir = os.path.join(output_zoom_dir, str(x // 2))
            ensure_dir(output_x_dir)
            
            # Group tiles by their 512x512 parent
            tile_groups = {}
            for y_file in os.listdir(x_path):
                if not y_file.endswith('.png'):
                    continue
                    
                y = int(y_file.split('.')[0])
                parent_y = y // 2
                
                # Determine position in parent tile
                quadrant = (x % 2) + 2 * (y % 2)  # 0=top-left, 1=top-right, 2=bottom-left, 3=bottom-right
                
                if parent_y not in tile_groups:
                    tile_groups[parent_y] = [None, None, None, None]  # [top-left, top-right, bottom-left, bottom-right]
                
                tile_groups[parent_y][quadrant] = os.path.join(x_path, y_file)
            
            # Create 512x512 tiles from each group
            for parent_y, tiles in tile_groups.items():
                # Skip if we don't have all 4 quadrants
                if None in tiles:
                    continue
                    
                try:
                    # Create a new 512x512 image
                    new_img = Image.new('RGBA', (512, 512), (0, 0, 0, 0))
                    
                    # Open and paste each quadrant
                    top_left = Image.open(tiles[0])
                    top_right = Image.open(tiles[1])
                    bottom_left = Image.open(tiles[2])
                    bottom_right = Image.open(tiles[3])
                    
                    new_img.paste(top_left, (0, 0))
                    new_img.paste(top_right, (256, 0))
                    new_img.paste(bottom_left, (0, 256))
                    new_img.paste(bottom_right, (256, 256))
                    
                    # Save the new 512x512 tile
                    new_img.save(os.path.join(output_x_dir, f"{parent_y}.png"))
                    
                except Exception as e:
                    print(f"Error creating 512x512 tile for z={zoom}, x={x//2}, y={parent_y}: {e}")

def main():
    parser = argparse.ArgumentParser(description='Generate and process map tiles for Safecast')
    parser.add_argument('--input_dir', required=True, help='Input directory containing tiles')
    parser.add_argument('--output_dir', required=True, help='Output directory for processed tiles')
    parser.add_argument('--generate_lower_zooms', action='store_true', help='Generate lower zoom levels from z=13')
    parser.add_argument('--generate_higher_zooms', action='store_true', help='Generate higher zoom levels from z=13')
    parser.add_argument('--assemble_512', action='store_true', help='Create 512x512 tiles from 256x256 tiles')
    
    args = parser.parse_args()
    
    if args.generate_lower_zooms:
        generate_lower_zooms(args.input_dir, args.output_dir)
    
    if args.generate_higher_zooms:
        generate_higher_zooms(args.input_dir, args.output_dir)
    
    if args.assemble_512:
        assemble_512_tiles(args.input_dir, args.output_dir)

if __name__ == "__main__":
    main()
EOF
```

## 7. Make the Scripts Executable

```bash
chmod +x server_scripts/ubuntu_tile_generator.sh
chmod +x ubuntu_retile.py
```

## 8. Configure Nginx to Serve the Tiles

Create a new Nginx configuration file:

```bash
sudo tee /etc/nginx/sites-available/safecast << 'EOF'
server {
    listen 80;
    server_name your_server_domain_or_ip;

    location / {
        root /var/www/html;
        index index.html;
    }

    location /tilemap/ {
        alias /var/www/html/tilemap/;
        add_header Access-Control-Allow-Origin "*";
        expires 4h;
    }
}
EOF
```

Enable the site and restart Nginx:

```bash
sudo ln -s /etc/nginx/sites-available/safecast /etc/nginx/sites-enabled/
sudo systemctl restart nginx
```

## 9. Update Frontend Configuration

Modify the `safemap.js` file to point to your server instead of S3:

```bash
# Find all instances of S3 URLs and replace them with your server URL
sed -i 's|http://te512.safecast.org.s3.amazonaws.com|http://your_server_domain_or_ip/tilemap|g' safemap.js
sed -i 's|http://te512jp.safecast.org.s3-ap-northeast-1.amazonaws.com|http://your_server_domain_or_ip/tilemap|g' safemap.js
sed -i 's|http://tg512.safecast.org.s3.amazonaws.com|http://your_server_domain_or_ip/tilemap|g' safemap.js
sed -i 's|http://tg512jp.safecast.org.s3-ap-northeast-1.amazonaws.com|http://your_server_domain_or_ip/tilemap|g' safemap.js
```

## 10. Run the Tile Generator

```bash
cd /path/to/Tilemap
./server_scripts/ubuntu_tile_generator.sh
```

## 11. Set Up a Cron Job for Regular Updates

```bash
crontab -e
```

Add the following line to update tiles daily at 1:30 AM:

```
30 1 * * * cd /path/to/Tilemap && ./server_scripts/ubuntu_tile_generator.sh >> /path/to/Tilemap/tilemap.log 2>&1
```

## 12. Verify Installation

1. Check if the tiles are being generated correctly:

```bash
ls -la /var/www/html/tilemap/
```

2. Open a web browser and navigate to:

```
http://your_server_domain_or_ip/
```

## Troubleshooting

### Missing Python Dependencies

If you encounter missing Python dependencies, install them:

```bash
pip install [package_name]
```

### Permission Issues

If you encounter permission issues:

```bash
sudo chown -R $USER:$USER /var/www/html/tilemap
chmod -R 755 /var/www/html/tilemap
```

### Nginx Configuration

If Nginx isn't serving the files correctly:

```bash
sudo nginx -t  # Test configuration
sudo systemctl restart nginx
```

### Log Files

Check the log files for errors:

```bash
tail -f /path/to/Tilemap/tilemap.log
sudo tail -f /var/log/nginx/error.log
```

## Notes on Real-time Data

The real-time sensor data display is handled by the `rt_viewer.js` component, which is loaded by default. This component fetches data from:

- `rt.safecast.org` for the list of devices
- `107.161.164.166` for chart images

No additional configuration is needed for the real-time data display as it's handled client-side and doesn't depend on the tile generation process.
