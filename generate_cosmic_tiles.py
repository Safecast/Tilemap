#!/usr/bin/env python3
# generate_cosmic_tiles.py
# 
# This script fetches cosmic logs from the Safecast API, processes them, 
# and generates map tiles that can be used as a layer in the web interface.
#
# Usage: python3 generate_cosmic_tiles.py

import os
import sys
import json
import time
import math
import argparse
import requests
import logging
from datetime import datetime
from PIL import Image, ImageDraw
import multiprocessing as mp

# Configure logging
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(levelname)s - %(message)s',
    handlers=[
        logging.FileHandler("cosmic_tiles.log"),
        logging.StreamHandler(sys.stdout)
    ]
)

# Constants
API_URL = "https://api.safecast.org/bgeigie_imports.json"
MEASUREMENTS_API_URL = "https://api.safecast.org/measurements.json"
TILE_SIZE = 256  # Standard web map tile size
OUTPUT_DIR = "CosmicTiles"  # Output directory for tiles
MAX_ZOOM = 14  # Maximum zoom level
MIN_ZOOM = 5   # Minimum zoom level
HEATMAP_RADIUS = 5  # Pixel radius for each point in the heatmap
POINT_RADIUS = 2  # Radius of points at highest zoom

# Color scale for different radiation levels (in CPM/µSv/h)
# Colors exactly match the Safecast scale from the provided image
RADIATION_COLORS = [
    (49, 243, 255, 180),   # Light Blue: 0.03-0.05 µSv/h
    (16, 181, 255, 180),   # Blue: 0.05-0.08 µSv/h
    (12, 92, 212, 180),    # Dark Blue: 0.08-0.12 µSv/h
    (89, 0, 170, 180),     # Purple: 0.12-0.16 µSv/h
    (197, 0, 197, 180),    # Magenta: 0.16-0.23 µSv/h
    (255, 0, 152, 180),    # Pink: 0.23-0.31 µSv/h
    (255, 0, 72, 180),     # Red-Pink: 0.31-0.43 µSv/h
    (255, 0, 0, 180),      # Red: 0.43-0.60 µSv/h
    (255, 97, 0, 180),     # Orange-Red: 0.60-0.87 µSv/h
    (255, 153, 0, 180),    # Orange: 0.87-1.31 µSv/h
    (213, 182, 33, 180),   # Yellow-Orange: 1.31-2.13 µSv/h
    (170, 210, 63, 180),   # Yellow: 2.13-3.99 µSv/h
    (99, 230, 10, 180),    # Yellow-Green: 3.99-10.09 µSv/h
    (0, 193, 0, 180),      # Top Green: > 10.09 µSv/h
]

def get_color_for_cpm(cpm):
    """Get color based on CPM (counts per minute) value using exact Safecast scale"""
    # Convert CPM to µSv/h (approximately)
    usvh = cpm * 0.0029940119760479

    if usvh < 0.05:
        return RADIATION_COLORS[0]
    elif usvh < 0.08:
        return RADIATION_COLORS[1]
    elif usvh < 0.12:
        return RADIATION_COLORS[2]
    elif usvh < 0.16:
        return RADIATION_COLORS[3]
    elif usvh < 0.23:
        return RADIATION_COLORS[4]
    elif usvh < 0.31:
        return RADIATION_COLORS[5]
    elif usvh < 0.43:
        return RADIATION_COLORS[6]
    elif usvh < 0.60:
        return RADIATION_COLORS[7]
    elif usvh < 0.87:
        return RADIATION_COLORS[8]
    elif usvh < 1.31:
        return RADIATION_COLORS[9]
    elif usvh < 2.13:
        return RADIATION_COLORS[10]
    elif usvh < 3.99:
        return RADIATION_COLORS[11]
    elif usvh < 10.09:
        return RADIATION_COLORS[12]
    else:
        return RADIATION_COLORS[13]

def lat_lon_to_tile(lat, lon, zoom):
    """Convert latitude, longitude to tile coordinates at given zoom level"""
    lat_rad = math.radians(lat)
    n = 2.0 ** zoom
    xtile = int((lon + 180.0) / 360.0 * n)
    ytile = int((1.0 - math.log(math.tan(lat_rad) + (1 / math.cos(lat_rad))) / math.pi) / 2.0 * n)
    return (xtile, ytile)

def tile_to_pixel(xtile, ytile, zoom, lat, lon):
    """Convert tile coordinates to pixel coordinates within the tile"""
    n = 2.0 ** zoom
    lat_rad = math.radians(lat)
    x_pixel = int(TILE_SIZE * (((lon + 180.0) / 360.0 * n) - xtile))
    y_pixel = int(TILE_SIZE * (((1.0 - math.log(math.tan(lat_rad) + (1 / math.cos(lat_rad))) / math.pi) / 2.0 * n) - ytile))
    return (x_pixel, y_pixel)

def fetch_cosmic_logs(page=1, per_page=20, max_retries=3, retry_delay=5):
    """Fetch cosmic logs from the Safecast API with retries"""
    params = {
        'subtype': 'Cosmic',
        'order': 'created_at desc',
        'per_page': per_page,
        'page': page
    }
    
    retries = 0
    while retries <= max_retries:
        try:
            logging.info(f"Requesting: {API_URL} with params: {params} (attempt {retries+1}/{max_retries+1})")
            response = requests.get(API_URL, params=params, timeout=30)
            response.raise_for_status()
            
            # Log response headers to help with debugging
            if page == 1:
                headers = response.headers
                logging.info(f"Response headers: Content-Type: {headers.get('Content-Type', 'unknown')}, "
                             f"Content-Length: {headers.get('Content-Length', 'unknown')}")
            
            logs = response.json()
            logging.info(f"Retrieved {len(logs)} logs from page {page}")
            
            return logs
        except requests.exceptions.RequestException as e:
            retries += 1
            logging.error(f"Error fetching cosmic logs (attempt {retries}/{max_retries+1}): {e}")
            
            if retries <= max_retries:
                # Use an exponential backoff strategy
                sleep_time = retry_delay * (2 ** (retries - 1))
                logging.info(f"Retrying in {sleep_time} seconds...")
                time.sleep(sleep_time)
            else:
                logging.error(f"Failed to fetch logs after {max_retries+1} attempts")
                return []

def fetch_cosmic_measurements(page=1, per_page=100):
    """Fetch cosmic measurements from the Safecast API"""
    params = {
        'unit': 'cpm',
        'order': 'created_at desc',
        'per_page': per_page,
        'page': page,
    }
    
    try:
        response = requests.get(MEASUREMENTS_API_URL, params=params)
        response.raise_for_status()
        return response.json()
    except requests.exceptions.RequestException as e:
        logging.error(f"Error fetching cosmic measurements: {e}")
        return []

def count_total_cosmic_logs():
    """Count the total number of cosmic logs available"""
    try:
        # Make a request to the first page to check header information
        response = requests.head(API_URL + "?subtype=Cosmic&approved=true")
        
        # Try to get total count from headers if available
        if 'X-Total' in response.headers:
            return int(response.headers['X-Total'])
        
        # If not in headers, we need to count manually by paginating
        all_logs = []
        page = 1
        per_page = 100
        
        while True:
            logging.info(f"Fetching cosmic logs page {page} to count total...")
            params = {
                'subtype': 'Cosmic',
                'per_page': per_page,
                'page': page,
                'approved': 'true'
            }
            
            response = requests.get(API_URL, params=params)
            response.raise_for_status()
            logs = response.json()
            
            if not logs:
                break
                
            all_logs.extend(logs)
            
            if len(logs) < per_page:
                break
                
            page += 1
            
        return len(all_logs)
    except Exception as e:
        logging.error(f"Error counting cosmic logs: {e}")
        return 0

def fetch_log_file(url):
    """Fetch a log file from the given URL"""
    try:
        response = requests.get(url)
        response.raise_for_status()
        return response.text
    except requests.exceptions.RequestException as e:
        logging.error(f"Error fetching log file {url}: {e}")
        return None

def extract_coordinates_and_cpm(log_text):
    """Extract GPS coordinates and CPM values from a log file"""
    data_points = []
    
    if not log_text:
        return data_points
    
    lines = log_text.split('\n')
    
    # Try to detect the log format
    # 1. Check for bGeigie format (most common for Safecast)
    if any('#BGEIGIE' in line for line in lines[:10]):
        for line in lines:
            if line.startswith('#'):
                continue
                
            parts = line.strip().split(',')
            if len(parts) >= 9:  # Most bGeigie formats have at least 9 columns
                try:
                    # bGeigie format - typically lat is field 7, lon is field 8, CPM is field 3
                    lat = float(parts[6])
                    lon = float(parts[7])
                    
                    # Try to get CPM value - could be in different fields depending on log format
                    cpm = None
                    if len(parts) > 3 and parts[3].strip() and parts[3].strip().isdigit():
                        cpm = int(parts[3])
                    elif len(parts) > 2 and parts[2].strip() and parts[2].strip().isdigit():
                        cpm = int(parts[2])
                    
                    # Use default CPM if not found
                    if cpm is None:
                        cpm = 50  # Default value
                    
                    # Validate coordinates
                    if -90 <= lat <= 90 and -180 <= lon <= 180:
                        data_points.append((lat, lon, cpm))
                except (ValueError, IndexError):
                    pass
    
    # 2. Check for NMEA GPS format
    elif any('$GP' in line for line in lines[:20]):
        lat, lon = None, None
        cpm = 50  # Default value
        
        for line in lines:
            # Try to extract position
            if '$GPGGA' in line or '$GPRMC' in line:
                parts = line.split(',')
                try:
                    if '$GPGGA' in line and len(parts) >= 6:
                        # Parse GPGGA format
                        lat_str, lat_dir = parts[2], parts[3]
                        lon_str, lon_dir = parts[4], parts[5]
                        
                        if lat_str and lon_str:
                            lat = float(lat_str[:2]) + float(lat_str[2:]) / 60.0
                            lon = float(lon_str[:3]) + float(lon_str[3:]) / 60.0
                            
                            if lat_dir == 'S':
                                lat = -lat
                            if lon_dir == 'W':
                                lon = -lon
                    
                    elif '$GPRMC' in line and len(parts) >= 7:
                        # Parse GPRMC format
                        lat_str, lat_dir = parts[3], parts[4]
                        lon_str, lon_dir = parts[5], parts[6]
                        
                        if lat_str and lon_str:
                            lat = float(lat_str[:2]) + float(lat_str[2:]) / 60.0
                            lon = float(lon_str[:3]) + float(lon_str[3:]) / 60.0
                            
                            if lat_dir == 'S':
                                lat = -lat
                            if lon_dir == 'W':
                                lon = -lon
                except (ValueError, IndexError):
                    pass
            
            # Try to extract CPM from lines that might contain it
            elif 'CPM' in line or 'cpm' in line:
                try:
                    # Try to extract digits after "CPM" or "cpm"
                    import re
                    cpm_match = re.search(r'(?:CPM|cpm)[^\d]*(\d+)', line)
                    if cpm_match:
                        cpm = int(cpm_match.group(1))
                except (ValueError, IndexError):
                    pass
            
            # If we have valid coordinates, add them with the current CPM
            if lat is not None and lon is not None:
                if -90 <= lat <= 90 and -180 <= lon <= 180:
                    data_points.append((lat, lon, cpm))
                    # Reset for next point
                    lat, lon = None, None
    
    # 3. Generic CSV format as a fallback
    else:
        for line in lines:
            if line.strip() and ',' in line and not line.startswith('#'):
                parts = line.strip().split(',')
                # Try different column combinations for lat/lon
                for i in range(len(parts) - 1):
                    try:
                        lat = float(parts[i])
                        lon = float(parts[i+1])
                        
                        # Try to find CPM in the same line
                        cpm = 50  # Default value
                        for j in range(len(parts)):
                            if j != i and j != i+1:  # Skip lat/lon fields
                                try:
                                    val = float(parts[j])
                                    if 10 <= val <= 1000:  # Likely a CPM value
                                        cpm = int(val)
                                        break
                                except (ValueError, IndexError):
                                    pass
                        
                        if -90 <= lat <= 90 and -180 <= lon <= 180:
                            data_points.append((lat, lon, cpm))
                            break  # Found coordinates in this line
                    except ValueError:
                        pass
    
    return data_points

def fetch_all_logs(max_logs=None, max_pages=30):
    """Fetch all cosmic logs from multiple pages, handles pagination properly"""
    all_logs = []
    page = 1
    per_page = 20  # Set to match the known working API parameter
    consecutive_failures = 0
    max_consecutive_failures = 3
    
    while page <= max_pages:
        # Add a delay between requests to reduce server load
        if page > 1:
            time.sleep(2)  # Wait 2 seconds between requests
            
        # Fetch logs from current page
        logs = fetch_cosmic_logs(page, per_page)
        
        if not logs:
            consecutive_failures += 1
            logging.warning(f"No logs found on page {page}, consecutive failures: {consecutive_failures}")
            
            # If we've had too many consecutive failures, stop
            if consecutive_failures >= max_consecutive_failures:
                logging.info(f"Too many consecutive failures ({consecutive_failures}), stopping")
                break
                
            # Try the next page anyway
            page += 1
            continue
        
        # Reset failure counter on success
        consecutive_failures = 0
        
        # Add logs to our collection
        all_logs.extend(logs)
        logging.info(f"Added {len(logs)} logs from page {page}, total logs so far: {len(all_logs)}")
        
        # If we've reached the maximum number of logs to process, stop
        if max_logs and len(all_logs) >= max_logs:
            logging.info(f"Reached maximum log count ({max_logs}), stopping fetch")
            all_logs = all_logs[:max_logs]
            break
        
        # Go to next page
        page += 1
        
        # If we got fewer logs than requested per page, we're at the last page
        if len(logs) < per_page:
            logging.info(f"Got fewer logs than requested per page, assuming we're at the last page")
            break
    
    logging.info(f"Completed log collection, got {len(all_logs)} total logs")
    return all_logs

def process_cosmic_logs(max_logs=None, max_pages=30):
    """Fetch and process all cosmic logs"""
    all_data_points = []
    
    # Fetch all logs with proper pagination
    all_logs = fetch_all_logs(max_logs, max_pages)
    
    processed_logs = 0
    logging.info(f"Processing {len(all_logs)} logs")
    
    for i, log in enumerate(all_logs):
        if 'source' in log and log.get('source', {}).get('url'):
            log_url = log['source']['url']
            log_id = log.get('id', 'unknown')
            
            logging.info(f"Processing log {i+1}/{len(all_logs)}: ID: {log_id}, URL: {log_url}")
            
            log_text = fetch_log_file(log_url)
            if log_text:
                data_points = extract_coordinates_and_cpm(log_text)
                all_data_points.extend(data_points)
                logging.info(f"Extracted {len(data_points)} data points from log {log_id}")
            else:
                logging.warning(f"Could not fetch log {log_id}: {log_url}")
        else:
            logging.warning(f"Log {i+1} has no source URL")
        
        processed_logs += 1
        
        # Log progress after every 10 logs
        if processed_logs % 10 == 0:
            logging.info(f"Progress: {processed_logs}/{len(all_logs)} logs processed, {len(all_data_points)} data points collected")
    
    logging.info(f"Processed {processed_logs} logs, extracted {len(all_data_points)} data points")
    
    # Update last_update.txt with current date
    today = datetime.now().strftime('%Y-%m-%d')
    with open('last_update.txt', 'w') as f:
        f.write(today + '\n')
    
    return all_data_points, processed_logs

def create_tile_directories(zoom, x):
    """Create the necessary directories for a tile"""
    tile_dir = os.path.join(OUTPUT_DIR, str(zoom), str(x))
    os.makedirs(tile_dir, exist_ok=True)
    return tile_dir

def generate_tile(zoom, x, y, data_points):
    """Generate a single tile image for the given coordinates with radiation color coding"""
    tile_path = os.path.join(OUTPUT_DIR, str(zoom), str(x), f"{y}.png")
    
    # Skip if the tile already exists
    if os.path.exists(tile_path):
        return
        
    # Create a transparent tile
    img = Image.new('RGBA', (TILE_SIZE, TILE_SIZE), (0, 0, 0, 0))
    draw = ImageDraw.Draw(img)
    
    # Draw points on the tile
    for lat, lon, cpm in data_points:
        try:
            xtile, ytile = lat_lon_to_tile(lat, lon, zoom)
            
            # Skip if point is not in this tile
            if xtile != x or ytile != y:
                continue
                
            # Get pixel coordinates within the tile
            px, py = tile_to_pixel(xtile, ytile, zoom, lat, lon)
            
            # Get color based on radiation level
            color = get_color_for_cpm(cpm)
            
            # Draw the point with appropriate style based on zoom level
            if zoom >= MAX_ZOOM - 2:
                # At high zoom levels, draw small dots
                draw.ellipse(
                    [px-POINT_RADIUS, py-POINT_RADIUS, px+POINT_RADIUS, py+POINT_RADIUS],
                    fill=color
                )
            else:
                # At lower zoom levels, draw heat map style points with alpha blending
                radius = max(1, HEATMAP_RADIUS - (MAX_ZOOM - zoom))
                draw.ellipse(
                    [px-radius, py-radius, px+radius, py+radius],
                    fill=color
                )
        except Exception as e:
            logging.error(f"Error drawing point {lat},{lon} at zoom {zoom}: {e}")
    
    # Only save non-empty tiles
    if any(img.getdata()):
        # Create directory if needed
        create_tile_directories(zoom, x)
        img.save(tile_path, 'PNG')

def get_tile_bounds(points, zoom):
    """Get the tile coordinate bounds for all points at the given zoom level"""
    if not points:
        return []
        
    tiles = set()
    for lat, lon in points:
        try:
            xtile, ytile = lat_lon_to_tile(lat, lon, zoom)
            tiles.add((xtile, ytile))
        except Exception as e:
            logging.error(f"Error calculating tile for {lat},{lon} at zoom {zoom}: {e}")
            
    return list(tiles)

def worker_generate_tiles(args):
    """Worker function for parallel tile generation"""
    zoom, x, y, data_points = args
    generate_tile(zoom, x, y, data_points)

def generate_legend():
    """Generate a legend image for the radiation color scale"""
    legend_width = 200
    legend_height = 400
    box_height = 25
    margin = 10
    text_height = 20
    
    # Create the legend image
    legend = Image.new('RGBA', (legend_width, legend_height), (255, 255, 255, 220))
    draw = ImageDraw.Draw(legend)
    
    # Try to load a font, use default if not available
    try:
        from PIL import ImageFont
        font = ImageFont.truetype("Arial", 12)
    except (ImportError, IOError):
        font = None
    
    # Draw legend title
    title = "Radiation (µSv/h)"
    draw.text((margin, margin), title, font=font, fill=(0, 0, 0, 255))
    
    # Draw color boxes and labels
    y = margin + text_height + 10
    labels = [
        "0.03-0.05 µSv/h",
        "0.05-0.08 µSv/h",
        "0.08-0.12 µSv/h",
        "0.12-0.16 µSv/h",
        "0.16-0.23 µSv/h", 
        "0.23-0.31 µSv/h",
        "0.31-0.43 µSv/h",
        "0.43-0.60 µSv/h",
        "0.60-0.87 µSv/h",
        "0.87-1.31 µSv/h",
        "1.31-2.13 µSv/h",
        "2.13-3.99 µSv/h",
        "3.99-10.09 µSv/h",
        "> 10.09 µSv/h"
    ]
    
    for i, color in enumerate(RADIATION_COLORS):
        # Draw color box
        draw.rectangle(
            [(margin, y), (margin + 30, y + box_height)], 
            fill=color
        )
        
        # Draw label
        draw.text(
            (margin + 40, y + (box_height - text_height) // 2), 
            labels[i], 
            font=font, 
            fill=(0, 0, 0, 255)
        )
        
        y += box_height + 5
    
    # Save the legend
    legend_path = os.path.join(OUTPUT_DIR, "legend.png")
    legend.save(legend_path, "PNG")
    logging.info(f"Generated legend at {legend_path}")

def generate_all_tiles(data_points, processed_logs):
    """Generate tiles for all coordinates at all zoom levels"""
    if not data_points:
        logging.warning("No data points to generate tiles from")
        return
        
    # Create the main output directory
    os.makedirs(OUTPUT_DIR, exist_ok=True)
    
    # Generate tilejson metadata with log count
    generate_tilejson(processed_logs)
    
    # Generate legend
    generate_legend()
        
    # Process each zoom level
    for zoom in range(MIN_ZOOM, MAX_ZOOM + 1):
        logging.info(f"Generating tiles for zoom level {zoom}...")
        
        # Get tile bounds for this zoom level
        tile_bounds = get_tile_bounds([(lat, lon) for lat, lon, _ in data_points], zoom)
        logging.info(f"Need to generate {len(tile_bounds)} tiles for zoom level {zoom}")
        
        # Prepare arguments for parallel processing
        args_list = [(zoom, x, y, data_points) for x, y in tile_bounds]
        
        # Use multiprocessing to generate tiles in parallel
        with mp.Pool(processes=mp.cpu_count()) as pool:
            pool.map(worker_generate_tiles, args_list)
            
        logging.info(f"Completed tiles for zoom level {zoom}")
    
    logging.info("Tile generation complete")

def generate_tilejson(log_count=None):
    """Generate a tilejson file for the tile set"""
    # Get current date for layer name
    today = datetime.now().strftime('%Y-%m-%d')
    
    # Create layer name with log count if available
    if log_count:
        layer_name = f"Safecast Cosmic ({today}, {log_count} logs)"
    else:
        layer_name = f"Safecast Cosmic ({today})"
    
    logging.info(f"Creating tilejson with layer name: {layer_name}")
    
    tilejson = {
        "tilejson": "2.2.0",
        "name": layer_name,
        "description": "Cosmic radiation data from Safecast",
        "version": "1.0.0",
        "attribution": "\u00a9 Safecast",
        "scheme": "xyz",
        "tiles": [
            "CosmicTiles/{z}/{x}/{y}.png"
        ],
        "minzoom": MIN_ZOOM,
        "maxzoom": MAX_ZOOM,
        "bounds": [-180, -85.0511, 180, 85.0511],
        "center": [0, 0, 0]
    }
    
    with open(os.path.join(OUTPUT_DIR, 'tilejson.json'), 'w') as f:
        json.dump(tilejson, f, indent=2)

def main():
    parser = argparse.ArgumentParser(description='Generate map tiles from Safecast cosmic logs')
    parser.add_argument('--force', action='store_true', help='Force regeneration of all tiles')
    parser.add_argument('--max-logs', type=int, help='Maximum number of logs to process (optional, processes all available logs by default)')
    parser.add_argument('--max-pages', type=int, default=30, help='Maximum number of pages to fetch from the API (default: 30)')
    args = parser.parse_args()
    
    if args.force and os.path.exists(OUTPUT_DIR):
        import shutil
        logging.info(f"Removing existing tiles directory: {OUTPUT_DIR}")
        shutil.rmtree(OUTPUT_DIR)
    
    start_time = time.time()
    logging.info("Starting cosmic tile generation")
    
    # Process cosmic logs to get coordinates
    data_points, processed_logs = process_cosmic_logs(args.max_logs, args.max_pages)
    
    # Generate tiles
    generate_all_tiles(data_points, processed_logs)
    
    elapsed_time = time.time() - start_time
    logging.info(f"Tile generation completed in {elapsed_time:.2f} seconds")
    logging.info(f"Summary: Processed {processed_logs} logs, extracted {len(data_points)} data points, created tiles for zoom levels {MIN_ZOOM}-{MAX_ZOOM}")

if __name__ == "__main__":
    main() 