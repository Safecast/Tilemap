import argparse
import pandas as pd
from PIL import Image, ImageDraw
import os
import math
from tqdm import tqdm
from collections import defaultdict

# --- Coordinate Conversion Functions (from prebuildtiles2.py) ---
def num_to_deg(xtile, ytile, zoom):
    n = 2.0 ** zoom
    lon_deg = xtile / n * 360.0 - 180.0
    lat_rad = math.atan(math.sinh(math.pi * (1 - 2 * ytile / n)))
    lat_deg = math.degrees(lat_rad)
    return (lat_deg, lon_deg)

def deg_to_num(lat_deg, lon_deg, zoom):
    lat_rad = math.radians(lat_deg)
    n = 2.0 ** zoom
    xtile = int((lon_deg + 180.0) / 360.0 * n)
    ytile = int((1.0 - math.asinh(math.tan(lat_rad)) / math.pi) / 2.0 * n)
    return (xtile, ytile)

# --- Color Legend and Conversion Factor (from prebuildtiles2.py) ---
SAFECAST_COLOR_LEGEND = [
    (0.03, (75, 0, 130)),    # Indigo/Dark Purple
    (0.05, (0, 0, 139)),     # Dark Blue
    (0.075, (0, 0, 205)),    # Medium Blue
    (0.1, (0, 100, 255)),    # Lighter Blue / Dodger Blue
    (0.15, (0, 191, 255)),   # Deep Sky Blue / Cyanish
    (0.25, (0, 255, 255)),   # Cyan
    (0.5, (0, 128, 0)),     # Dark Green
    (1.0, (255, 255, 0)),   # Yellow
    (5.0, (255, 165, 0)),   # Orange
    (20.0, (255, 0, 0)),    # Red
    (float('inf'), (139, 0, 0)) # Dark Red
]
CPM_TO_USVH_FACTOR = 350.0

def get_color_for_value(usvh_value):
    if usvh_value < 0: usvh_value = 0
    for threshold, color in SAFECAST_COLOR_LEGEND:
        if usvh_value <= threshold:
            return color
    return SAFECAST_COLOR_LEGEND[-1][1]

def get_pixel_coords_in_tile(lat, lon, tile_x, tile_y, zoom, tile_size):
    """Converts lat/lon to pixel coordinates (x,y) within a given tile."""
    lat_rad = math.radians(lat)
    n = 2.0 ** zoom
    
    # Calculate the precise fractional tile number
    precise_xtile = (lon + 180.0) / 360.0 * n
    precise_ytile = (1.0 - math.asinh(math.tan(lat_rad)) / math.pi) / 2.0 * n
    
    # Pixel x coordinate within the tile
    pixel_x = int((precise_xtile - tile_x) * tile_size)
    # Pixel y coordinate within the tile
    pixel_y = int((precise_ytile - tile_y) * tile_size)
    
    return pixel_x, pixel_y

def parse_arguments():
    parser = argparse.ArgumentParser(description='Generate map tiles with dots from CSV data.')
    parser.add_argument('input_csv', help='Path to the input CSV measurements file.')
    parser.add_argument('output_dir', help='Directory to save the generated tiles.')
    parser.add_argument('--zoom', type=int, required=True, help='Zoom level to generate tiles for.')
    parser.add_argument('--tile_size', type=int, default=256, help='Size of the tiles in pixels.')
    parser.add_argument('--dot_radius', type=int, default=1, help='Radius of the dots in pixels.')
    
    parser.add_argument('--min_lon', type=float, required=True, help='Minimum longitude of the extent to tile.')
    parser.add_argument('--max_lon', type=float, required=True, help='Maximum longitude of the extent to tile.')
    parser.add_argument('--min_lat', type=float, required=True, help='Minimum latitude of the extent to tile.')
    parser.add_argument('--max_lat', type=float, required=True, help='Maximum latitude of the extent to tile.')
    
    parser.add_argument('--chunk_size', type=int, default=100000, help='Number of rows to read from CSV at a time.')
    return parser.parse_args()

def main():
    args = parse_arguments()

    print(f"Starting point tile generation for zoom {args.zoom}...")
    print(f"Input CSV: {args.input_csv}")
    print(f"Output Directory: {args.output_dir}")
    print(f"Tile Size: {args.tile_size}x{args.tile_size}, Dot Radius: {args.dot_radius}")
    print(f"Extent: Lon({args.min_lon}-{args.max_lon}), Lat({args.min_lat}-{args.max_lat})")

    points_by_tile = defaultdict(list)
    total_rows_processed = 0

    print("Processing CSV and grouping points by tile...")
    try:
        for chunk_df in pd.read_csv(args.input_csv, usecols=['Captured Time', 'Latitude', 'Longitude', 'Value', 'Unit'], chunksize=args.chunk_size, low_memory=False):
            total_rows_processed += len(chunk_df)
            # Filter by unit
            chunk_df = chunk_df[chunk_df['Unit'] == 'cpm']
            # Filter by valid date (simple check for now, can be improved)
            chunk_df = chunk_df[~chunk_df['Captured Time'].astype(str).str.startswith('0201-')]
            
            # Convert to numeric, coercing errors to NaN
            chunk_df['Latitude'] = pd.to_numeric(chunk_df['Latitude'], errors='coerce')
            chunk_df['Longitude'] = pd.to_numeric(chunk_df['Longitude'], errors='coerce')
            chunk_df['Value'] = pd.to_numeric(chunk_df['Value'], errors='coerce')
            
            # Drop rows with NaN lat/lon/value after conversion or if unit was not cpm
            chunk_df.dropna(subset=['Latitude', 'Longitude', 'Value'], inplace=True)
            
            # Filter by geographic extent
            chunk_df = chunk_df[
                (chunk_df['Longitude'] >= args.min_lon) & (chunk_df['Longitude'] <= args.max_lon) &
                (chunk_df['Latitude'] >= args.min_lat) & (chunk_df['Latitude'] <= args.max_lat)
            ]

            if chunk_df.empty:
                print(f"Processed {total_rows_processed} rows, no valid data in this chunk for the specified extent.")
                continue

            for _, row in tqdm(chunk_df.iterrows(), total=len(chunk_df), desc=f"Chunk (Total: {total_rows_processed})", leave=False):
                lat, lon, value_cpm = row['Latitude'], row['Longitude'], row['Value']
                if value_cpm <= 0: continue # Skip non-positive CPM

                usvh_value = value_cpm / CPM_TO_USVH_FACTOR
                
                xtile, ytile = deg_to_num(lat, lon, args.zoom)
                points_by_tile[(xtile, ytile)].append({'lat': lat, 'lon': lon, 'usvh': usvh_value})
            print(f"Processed {total_rows_processed} rows. Points in memory: {sum(len(pts) for pts in points_by_tile.values())}")

    except FileNotFoundError:
        print(f"Error: Input CSV file not found at {args.input_csv}")
        return
    except Exception as e:
        print(f"Error processing CSV: {e}")
        return

    if not points_by_tile:
        print("No points found for the specified extent and zoom level after processing CSV.")
        return
        
    print(f"Finished processing CSV. Found points in {len(points_by_tile)} unique tiles.")

    # Determine tile range from the data itself or args
    all_xtiles = [k[0] for k in points_by_tile.keys()]
    all_ytiles = [k[1] for k in points_by_tile.keys()]
    
    # Use specified extent to define tile range, ensuring we cover it
    min_xtile_extent, min_ytile_extent = deg_to_num(args.max_lat, args.min_lon, args.zoom)
    max_xtile_extent, max_ytile_extent = deg_to_num(args.min_lat, args.max_lon, args.zoom)

    # Iterate over the tile range defined by the provided extent arguments
    # This ensures tiles are created even if they end up empty but are within the requested view
    print(f"Generating tiles for range X({min_xtile_extent} to {max_xtile_extent}), Y({min_ytile_extent} to {max_ytile_extent})")

    for xtile in tqdm(range(min_xtile_extent, max_xtile_extent + 1), desc="Generating Tiles X"):
        tile_col_dir = os.path.join(args.output_dir, str(args.zoom), str(xtile))
        os.makedirs(tile_col_dir, exist_ok=True)
        for ytile in range(min_ytile_extent, max_ytile_extent + 1):
            tile_image = Image.new('RGBA', (args.tile_size, args.tile_size), (0, 0, 0, 0))
            draw = ImageDraw.Draw(tile_image)
            
            tile_key = (xtile, ytile)
            if tile_key in points_by_tile:
                for point_data in points_by_tile[tile_key]:
                    px, py = get_pixel_coords_in_tile(point_data['lat'], point_data['lon'], xtile, ytile, args.zoom, args.tile_size)
                    color = get_color_for_value(point_data['usvh'])
                    
                    # Define bounding box for the ellipse
                    x1 = px - args.dot_radius
                    y1 = py - args.dot_radius
                    x2 = px + args.dot_radius
                    y2 = py + args.dot_radius
                    draw.ellipse([x1, y1, x2, y2], fill=color, outline=None) # Use outline=color for bordered dots

            tile_path = os.path.join(tile_col_dir, f"{ytile}.png")
            try:
                tile_image.save(tile_path)
            except Exception as e:
                print(f"Error saving tile {tile_path}: {e}")
    
    print("Point tile generation process completed.")

if __name__ == '__main__':
    main() 