import argparse
import numpy as np
from PIL import Image, ImageDraw
import os
import math
from tqdm import tqdm

def num_to_deg(xtile, ytile, zoom):
    """Converts tile numbers to NW-corner latitude and longitude."""
    n = 2.0 ** zoom
    lon_deg = xtile / n * 360.0 - 180.0
    lat_rad = math.atan(math.sinh(math.pi * (1 - 2 * ytile / n)))
    lat_deg = math.degrees(lat_rad)
    return (lat_deg, lon_deg)

def deg_to_num(lat_deg, lon_deg, zoom):
    """Converts latitude and longitude to tile numbers."""
    lat_rad = math.radians(lat_deg)
    n = 2.0 ** zoom
    xtile = int((lon_deg + 180.0) / 360.0 * n)
    ytile = int((1.0 - math.asinh(math.tan(lat_rad)) / math.pi) / 2.0 * n)
    return (xtile, ytile)

def parse_arguments():
    parser = argparse.ArgumentParser(description='Generate map tiles from an NPY grid file.')
    parser.add_argument('input_npy', help='Path to the input NPY grid file.')
    parser.add_argument('output_dir', help='Directory to save the generated tiles.')
    parser.add_argument('--zoom', type=int, default=13, help='Zoom level to generate tiles for.')
    parser.add_argument('--tile_size', type=int, default=256, help='Size of the tiles in pixels (e.g., 256).')
    parser.add_argument('--grid_min_lon', type=float, required=True, help='Minimum longitude of the NPY grid.')
    parser.add_argument('--grid_max_lon', type=float, required=True, help='Maximum longitude of the NPY grid.')
    parser.add_argument('--grid_min_lat', type=float, required=True, help='Minimum latitude of the NPY grid.')
    parser.add_argument('--grid_max_lat', type=float, required=True, help='Maximum latitude of the NPY grid.')
    parser.add_argument('--nodata_val', type=float, default=np.nan, help='Value in NPY to treat as no data (becomes transparent).')
    # Add options for normalization, e.g., min/max cutoff or percentile
    parser.add_argument('--min_display_val', type=float, help='Minimum value for display normalization. Defaults to data min. Currently overridden by fixed color legend.')
    parser.add_argument('--max_display_val', type=float, help='Maximum value for display normalization. Defaults to data max. Currently overridden by fixed color legend.')

    return parser.parse_args()

# Define the Safecast-like color legend (uSv/h thresholds and RGB colors)
# Thresholds are upper bounds. Colors are (R, G, B).
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
    (float('inf'), (139, 0, 0)) # Dark Red for values > 20.0
]
# Safecast bGeigie conversion factor: CPM to uSv/h
CPM_TO_USVH_FACTOR = 350.0

def get_color_for_value(usvh_value):
    if usvh_value < 0: # Or handle as nodata / first color
        usvh_value = 0 
    for threshold, color in SAFECAST_COLOR_LEGEND:
        if usvh_value <= threshold:
            return color
    return SAFECAST_COLOR_LEGEND[-1][1] # Should be caught by float('inf')

def main():
    args = parse_arguments()

    print(f"Starting tile generation for zoom {args.zoom}...")
    print(f"Input NPY: {args.input_npy}")
    print(f"Output Directory: {args.output_dir}")
    print(f"Tile Size: {args.tile_size}x{args.tile_size}")
    print(f"Grid Extent: Lon({args.grid_min_lon}, {args.grid_max_lon}), Lat({args.grid_min_lat}, {args.grid_max_lat})")
    print(f"NOTE: Using fixed Safecast-like color legend. --min_display_val and --max_display_val are currently not used for color scaling.")

    # 1. Load the NPY grid
    print(f"Loading NPY grid from {args.input_npy}...")
    try:
        grid_data = np.load(args.input_npy)
        print(f"Grid loaded. Shape: {grid_data.shape}")
    except Exception as e:
        print(f"Error loading NPY file: {e}")
        return

    # Make sure output directory for the zoom level exists
    zoom_output_dir = os.path.join(args.output_dir, str(args.zoom))
    # os.makedirs(zoom_output_dir, exist_ok=True) # Will be created per tile column

    # 2. Determine normalization parameters - THIS SECTION IS NOW BYPASSED FOR COLORING
    # print("Determining normalization parameters...")
    # valid_data = grid_data[~np.isnan(grid_data) if np.isnan(args.nodata_val) else grid_data != args.nodata_val]
    
    # if args.min_display_val is not None:
    #     min_val = args.min_display_val
    # elif len(valid_data) > 0:
    #     min_val = np.min(valid_data)
    # else:
    #     min_val = 0 # Default if no valid data or all nodata

    # if args.max_display_val is not None:
    #     max_val = args.max_display_val
    # elif len(valid_data) > 0:
    #     max_val = np.max(valid_data)
    # else:
    #     max_val = 1 # Default if no valid data or all nodata, avoid division by zero with min_val=0

    # if max_val == min_val: # Avoid division by zero if all valid data is the same
    #     max_val = min_val + 1e-6 # Add a tiny epsilon, or handle as single color
    #     if max_val == min_val: # if min_val was also 0, then max_val might still be 0
    #          max_val = 1.0

    # print(f"Normalization range (for reference, not used for coloring): {min_val} to {max_val}")
    
    # 3. Calculate the range of tiles that cover the grid_data extent for the given zoom
    print("Calculating tile range for the given extent...")
    xtile_min, ytile_min = deg_to_num(args.grid_max_lat, args.grid_min_lon, args.zoom) # NW corner for min tile index
    xtile_max, ytile_max = deg_to_num(args.grid_min_lat, args.grid_max_lon, args.zoom) # SE corner for max tile index

    # Ensure ytile_max is greater than ytile_min, as y tile numbers increase downwards
    # The deg_to_num for ytile_min uses grid_max_lat (top) and for ytile_max uses grid_min_lat (bottom)
    
    print(f"Tile range: X({xtile_min} to {xtile_max}), Y({ytile_min} to {ytile_max})")

    # 4. Loop through tiles, extract data, normalize, create image, save
    print("Starting tile generation loop...")
    grid_rows, grid_cols = grid_data.shape
    lon_px_res = (args.grid_max_lon - args.grid_min_lon) / grid_cols
    lat_px_res = (args.grid_max_lat - args.grid_min_lat) / grid_rows

    if lon_px_res <= 0 or lat_px_res <= 0:
        print("Error: Pixel resolution is zero or negative. Check grid extent arguments.")
        return

    total_tiles = (xtile_max - xtile_min + 1) * (ytile_max - ytile_min + 1)
    progress_bar = tqdm(total=total_tiles, desc="Generating Tiles")

    for xtile in range(xtile_min, xtile_max + 1):
        # Create directory for current x tile column
        tile_col_dir = os.path.join(args.output_dir, str(args.zoom), str(xtile))
        os.makedirs(tile_col_dir, exist_ok=True)

        for ytile in range(ytile_min, ytile_max + 1):
            # Get NW and SE corners of the tile in degrees
            tile_nw_lat, tile_nw_lon = num_to_deg(xtile, ytile, args.zoom)
            tile_se_lat, tile_se_lon = num_to_deg(xtile + 1, ytile + 1, args.zoom)

            # Convert tile geographic bounds to pixel coordinates in the NPY grid
            # Ensure pixel coordinates are within grid bounds [0, grid_cols-1] and [0, grid_rows-1]
            # Note: grid y-axis is inverted compared to latitude
            
            # Calculate pixel coordinates (top-left of the region to extract)
            x_start_px = int(math.floor((tile_nw_lon - args.grid_min_lon) / lon_px_res))
            y_start_px = int(math.floor((args.grid_max_lat - tile_nw_lat) / lat_px_res))
            
            # Calculate pixel coordinates (bottom-right of the region to extract)
            x_end_px = int(math.ceil((tile_se_lon - args.grid_min_lon) / lon_px_res))
            y_end_px = int(math.ceil((args.grid_max_lat - tile_se_lat) / lat_px_res))

            tile_image = None

            # Check if tile is at least partially within the grid data extent
            if x_start_px < grid_cols and x_end_px > 0 and \
               y_start_px < grid_rows and y_end_px > 0:

                # Clamp pixel coordinates to be within the grid dimensions
                clamped_x_start = max(0, x_start_px)
                clamped_y_start = max(0, y_start_px)
                clamped_x_end = min(grid_cols, x_end_px)
                clamped_y_end = min(grid_rows, y_end_px)

                if clamped_x_start < clamped_x_end and clamped_y_start < clamped_y_end:
                    # Extract the data for the tile
                    tile_data_slice = grid_data[clamped_y_start:clamped_y_end, clamped_x_start:clamped_x_end]

                    if tile_data_slice.size > 0:
                        # Normalize the slice
                        # Handle nodata_val (NaN or specific value)
                        is_nodata_nan = np.isnan(args.nodata_val)
                        mask = np.isnan(tile_data_slice) if is_nodata_nan else (tile_data_slice == args.nodata_val)
                        
                        # normalized_slice = np.zeros_like(tile_data_slice, dtype=np.uint8) # Not needed for color
                        # valid_slice_data = tile_data_slice[~mask] # Done per pixel effectively
                        
                        # if valid_slice_data.size > 0:
                        #     # Apply normalization: (value - min_val) / (max_val - min_val) * 255
                        #     # Ensure max_val - min_val is not zero (handled earlier)
                        #     temp_normalized = (valid_slice_data - min_val) / (max_val - min_val) * 255.0
                        #     normalized_slice[~mask] = np.clip(temp_normalized, 0, 255).astype(np.uint8)
                        
                        # Create an RGBA image to handle transparency for nodata
                        img_array_rgba = np.zeros((tile_data_slice.shape[0], tile_data_slice.shape[1], 4), dtype=np.uint8)
                        
                        # Iterate over pixels to apply color based on uSv/h
                        for r in range(tile_data_slice.shape[0]):
                            for c in range(tile_data_slice.shape[1]):
                                if mask[r, c]:
                                    img_array_rgba[r, c, 3] = 0  # Transparent for nodata
                                else:
                                    cpm_value = tile_data_slice[r, c]
                                    usvh_value = cpm_value / CPM_TO_USVH_FACTOR
                                    color = get_color_for_value(usvh_value)
                                    img_array_rgba[r, c, 0] = color[0]  # R
                                    img_array_rgba[r, c, 1] = color[1]  # G
                                    img_array_rgba[r, c, 2] = color[2]  # B
                                    img_array_rgba[r, c, 3] = 255      # Opaque

                        # Create PIL image from numpy array
                        extracted_img = Image.fromarray(img_array_rgba, 'RGBA')
                        
                        # We need to create a full-sized transparent tile and then paste the extracted data
                        # This handles cases where the tile is only partially covered by data.
                        tile_image = Image.new('RGBA', (args.tile_size, args.tile_size), (0,0,0,0)) # Fully transparent
                        
                        # Calculate where to paste the extracted_img onto the full tile_image
                        # This requires mapping the geographic extent of extracted_img to pixel offsets on the tile_image
                        
                        # For now, let's resize the extracted part to the full tile size if it has data
                        # This is simpler but might not be perfectly georeferenced if partial
                        resized_extracted = extracted_img.resize((args.tile_size, args.tile_size), Image.Resampling.NEAREST)
                        tile_image.paste(resized_extracted, (0,0))

            if tile_image is None: # If tile was completely outside data or resulted in no valid data
                tile_image = Image.new('RGBA', (args.tile_size, args.tile_size), (0,0,0,0)) # Fully transparent tile

            # Save the tile
            tile_path = os.path.join(tile_col_dir, f"{ytile}.png")
            try:
                tile_image.save(tile_path)
            except Exception as e:
                print(f"Error saving tile {tile_path}: {e}")
            
            progress_bar.update(1)
    
    progress_bar.close()
    print("Tile generation loop finished.")

    print("Tile generation process completed.")


if __name__ == '__main__':
    main() 