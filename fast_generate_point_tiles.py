import argparse
import pandas as pd
import numpy as np
from PIL import Image
import os
from tqdm import tqdm, trange
from collections import OrderedDict

SAFECAST_COLOR_LEGEND = [
    (0.03, (50, 0, 100)),
    (0.05, (0, 0, 139)),
    (0.08, (0, 0, 205)),
    (0.12, (0, 100, 255)),
    (0.16, (0, 191, 255)),
    (0.23, (0, 255, 255)),
    (0.31, (173, 127, 217)),
    (0.43, (200, 0, 200)),
    (0.60, (255, 105, 180)),
    (0.87, (255, 0, 127)),
    (1.31, (255, 69, 0)),
    (2.13, (255, 165, 0)),
    (10.0, (255, 255, 0)),
    (float('inf'), (255, 255, 150))
]
CPM_TO_USVH_FACTOR = 350.0

# Estimate: 256x256x4 uint8 = 0.25MB per tile. 32GB/0.25MB = 128,000 tiles.
TILE_SIZE_BYTES = 256 * 256 * 4  # for tile_size=256
MAX_RAM_BYTES = 32 * 1024**3  # 32GB
MAX_TILES_IN_CACHE = MAX_RAM_BYTES // TILE_SIZE_BYTES

class LRUCache(OrderedDict):
    def __init__(self, capacity, tile_size, zoom, output_dir):
        super().__init__()
        self.capacity = capacity
        self.tile_size = tile_size
        self.zoom = zoom
        self.output_dir = output_dir
    def __getitem__(self, key):
        value = super().__getitem__(key)
        self.move_to_end(key)
        return value
    def __setitem__(self, key, value):
        if key in self:
            self.move_to_end(key)
        super().__setitem__(key, value)
        if len(self) > self.capacity:
            old_key, old_value = self.popitem(last=False)
            self.write_tile_to_disk(old_key, old_value)
    def write_tile_to_disk(self, tile_key, tile_buffer):
        xtile, ytile = tile_key
        tile_col_dir = os.path.join(self.output_dir, str(self.zoom), str(xtile))
        os.makedirs(tile_col_dir, exist_ok=True)
        img = Image.fromarray(tile_buffer, 'RGBA')
        img.save(os.path.join(tile_col_dir, f"{ytile}.png"))
    def flush(self):
        for tile_key, tile_buffer in tqdm(self.items(), desc="Writing remaining tiles"):
            self.write_tile_to_disk(tile_key, tile_buffer)
        self.clear()

def get_color_for_value(usvh_value):
    if usvh_value < 0: usvh_value = 0
    for threshold, color in SAFECAST_COLOR_LEGEND:
        if usvh_value <= threshold:
            return color
    return SAFECAST_COLOR_LEGEND[-1][1]

def deg_to_num(lat_deg, lon_deg, zoom):
    lat_rad = np.radians(lat_deg)
    n = 2.0 ** zoom
    xtile = ((lon_deg + 180.0) / 360.0 * n).astype(int)
    ytile = ((1.0 - np.arcsinh(np.tan(lat_rad)) / np.pi) / 2.0 * n).astype(int)
    return xtile, ytile

def get_pixel_coords_in_tile(lat, lon, tile_x, tile_y, zoom, tile_size):
    lat_rad = np.radians(lat)
    n = 2.0 ** zoom
    precise_xtile = (lon + 180.0) / 360.0 * n
    precise_ytile = (1.0 - np.arcsinh(np.tan(lat_rad)) / np.pi) / 2.0 * n
    pixel_x = ((precise_xtile - tile_x) * tile_size).astype(int)
    pixel_y = ((precise_ytile - tile_y) * tile_size).astype(int)
    return pixel_x, pixel_y

def parse_arguments():
    parser = argparse.ArgumentParser(description='Fast generate map tiles with dots from CSV data (vectorized, LRU cache).')
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
    print(f"Fast tile generation for zoom {args.zoom} with LRU cache...")
    print(f"Input CSV: {args.input_csv}")
    print(f"Output Directory: {args.output_dir}")
    print(f"Tile Size: {args.tile_size}x{args.tile_size}, Dot Radius: {args.dot_radius}")
    print(f"Extent: Lon({args.min_lon}-{args.max_lon}), Lat({args.min_lat}-{args.max_lat})")

    # Adjust cache size for custom tile_size
    tile_bytes = args.tile_size * args.tile_size * 4
    max_tiles = MAX_RAM_BYTES // tile_bytes
    print(f"Tile buffer cache size: {max_tiles} tiles (~32GB)")
    tile_cache = LRUCache(max_tiles, args.tile_size, args.zoom, args.output_dir)

    csv_columns = ['Captured Time', 'Latitude', 'Longitude', 'Value', 'Unit']
    for chunk_df in pd.read_csv(args.input_csv, usecols=csv_columns, chunksize=args.chunk_size, low_memory=False):
        chunk_df = chunk_df[chunk_df['Unit'] == 'cpm']
        chunk_df = chunk_df[~chunk_df['Captured Time'].astype(str).str.startswith('0201-')]
        chunk_df['Latitude'] = pd.to_numeric(chunk_df['Latitude'], errors='coerce')
        chunk_df['Longitude'] = pd.to_numeric(chunk_df['Longitude'], errors='coerce')
        chunk_df['Value'] = pd.to_numeric(chunk_df['Value'], errors='coerce')
        chunk_df.dropna(subset=['Latitude', 'Longitude', 'Value'], inplace=True)
        chunk_df = chunk_df[
            (chunk_df['Longitude'] >= args.min_lon) & (chunk_df['Longitude'] <= args.max_lon) &
            (chunk_df['Latitude'] >= args.min_lat) & (chunk_df['Latitude'] <= args.max_lat)
        ]
        if chunk_df.empty:
            continue
        lat = chunk_df['Latitude'].values
        lon = chunk_df['Longitude'].values
        value_cpm = chunk_df['Value'].values
        usvh = value_cpm / CPM_TO_USVH_FACTOR
        xtile, ytile = deg_to_num(lat, lon, args.zoom)
        px, py = get_pixel_coords_in_tile(lat, lon, xtile, ytile, args.zoom, args.tile_size)
        colors = np.array([get_color_for_value(u) for u in usvh], dtype=np.uint8)
        alphas = np.full((len(px), 1), 255, dtype=np.uint8)
        rgba = np.concatenate([colors, alphas], axis=1)
        for i in trange(len(px), desc=f"Chunk rows", leave=False):
            tile_key = (int(xtile[i]), int(ytile[i]))
            if tile_key in tile_cache:
                tile_buffer = tile_cache[tile_key]
            else:
                # Try to load from disk if exists
                tile_col_dir = os.path.join(args.output_dir, str(args.zoom), str(tile_key[0]))
                tile_path = os.path.join(tile_col_dir, f"{tile_key[1]}.png")
                if os.path.exists(tile_path):
                    tile_buffer = np.array(Image.open(tile_path).convert('RGBA'))
                else:
                    tile_buffer = np.zeros((args.tile_size, args.tile_size, 4), dtype=np.uint8)
                tile_cache[tile_key] = tile_buffer
            # Draw a filled circle (dot) at (px[i], py[i])
            x0 = max(0, px[i] - args.dot_radius)
            x1 = min(args.tile_size, px[i] + args.dot_radius + 1)
            y0 = max(0, py[i] - args.dot_radius)
            y1 = min(args.tile_size, py[i] + args.dot_radius + 1)
            for xi in range(x0, x1):
                for yi in range(y0, y1):
                    if (xi - px[i])**2 + (yi - py[i])**2 <= args.dot_radius**2:
                        tile_buffer[yi, xi, :] = rgba[i]
    # Write all remaining tiles
    tile_cache.flush()
    print("Fast tile generation complete.")

if __name__ == '__main__':
    main() 