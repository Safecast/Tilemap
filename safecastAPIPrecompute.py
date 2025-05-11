import argparse
import pandas as pd
import numpy as np
from scipy.spatial import cKDTree
from tqdm import tqdm
import warnings
import os

# Suppress specific warnings if necessary (e.g., from pandas or numpy)
warnings.filterwarnings('ignore', category=FutureWarning)
warnings.filterwarnings('ignore', category=UserWarning, module='pandas')

def parse_arguments():
    parser = argparse.ArgumentParser(description='Interpolate Safecast data to a grid.')
    parser.add_argument('input_csv', help='Path to the input CSV file.')
    parser.add_argument('output_npy', help='Path to save the output NPY file.')
    parser.add_argument('--grid_dim', type=int, default=2000, help='Dimension of the grid (e.g., 2000 for a 2000x2000 grid).')
    parser.add_argument('--chunk_size', type=int, default=500, help='Size of chunks for processing the grid.')
    parser.add_argument('--world', action='store_true', help='Use world extent for coordinates. Default is Japan extent.')
    parser.add_argument('--min_lat', type=float, help='Minimum latitude for custom extent.')
    parser.add_argument('--max_lat', type=float, help='Maximum latitude for custom extent.')
    parser.add_argument('--min_lon', type=float, help='Minimum longitude for custom extent.')
    parser.add_argument('--max_lon', type=float, help='Maximum longitude for custom extent.')
    parser.add_argument('--idw_power', type=float, default=2, help='Power parameter for Inverse Distance Weighting.')
    parser.add_argument('--search_radius_deg', type=float, default=0.5, 
                        help='Search radius in degrees for finding neighbors. Adjust based on data density and grid resolution.')

    return parser.parse_args()

def main():
    args = parse_arguments()

    print(f"Starting Safecast API precomputation...")
    print(f"Input CSV: {args.input_csv}")
    print(f"Output NPY: {args.output_npy}")
    print(f"Grid Dimensions: {args.grid_dim}x{args.grid_dim}")
    print(f"Chunk Size: {args.chunk_size}x{args.chunk_size}")
    print(f"World Extent: {args.world}")
    if args.min_lat and args.max_lat and args.min_lon and args.max_lon:
        print(f"Custom Extent: Lat({args.min_lat}, {args.max_lat}), Lon({args.min_lon}, {args.max_lon})")
    print(f"IDW Power: {args.idw_power}")
    print(f"Search Radius (degrees): {args.search_radius_deg}")
    
    # Placeholder for CSV reading and processing
    print("Reading and processing CSV...")
    try:
        # Define columns to read
        columns_to_read = ['Captured Time', 'Latitude', 'Longitude', 'Value', 'Unit']
        df = pd.read_csv(args.input_csv, usecols=columns_to_read, low_memory=True)
        print(f"Successfully read {len(df)} rows from {args.input_csv}")

        # Data Cleaning and Filtering
        # 1. Handle 'Captured Time' - convert to datetime, errors to NaT
        df['Captured Time'] = pd.to_datetime(df['Captured Time'], errors='coerce')
        original_rows = len(df)
        df.dropna(subset=['Captured Time'], inplace=True)
        if original_rows - len(df) > 0:
            print(f"Filtered out {original_rows - len(df)} rows with invalid 'Captured Time'.")

        # 2. Convert Latitude, Longitude, Value to numeric, coercing errors
        for col in ['Latitude', 'Longitude', 'Value']:
            df[col] = pd.to_numeric(df[col], errors='coerce')
        
        original_rows = len(df)
        df.dropna(subset=['Latitude', 'Longitude', 'Value'], inplace=True)
        if original_rows - len(df) > 0:
            print(f"Filtered out {original_rows - len(df)} rows with non-numeric lat/lon/value.")

        # 3. Filter by valid Latitude and Longitude ranges
        original_rows = len(df)
        df = df[(df['Latitude'] >= -90) & (df['Latitude'] <= 90) & \
                  (df['Longitude'] >= -180) & (df['Longitude'] <= 180)]
        if original_rows - len(df) > 0:
            print(f"Filtered out {original_rows - len(df)} rows with out-of-range lat/lon.")

        # 4. Filter by Unit (optional, consider making this a parameter if other units are relevant)
        original_rows = len(df)
        df = df[df['Unit'].str.lower() == 'cpm']
        if original_rows - len(df) > 0:
            print(f"Filtered out {original_rows - len(df)} rows with units other than 'cpm'.")

        # 5. Filter out non-positive radiation values if they are not meaningful
        original_rows = len(df)
        df = df[df['Value'] > 0]
        if original_rows - len(df) > 0:
            print(f"Filtered out {original_rows - len(df)} rows with non-positive 'Value'.")

        if df.empty:
            print("No valid data remaining after filtering. Exiting.")
            return

        print(f"{len(df)} valid data points remaining for interpolation.")
        points = df[['Longitude', 'Latitude']].values
        values = df['Value'].values

    except FileNotFoundError:
        print(f"Error: Input CSV file not found at {args.input_csv}")
        return
    except Exception as e:
        print(f"Error reading or processing CSV: {e}")
        return
    
    # Placeholder for grid generation and interpolation
    print("Generating grid and performing interpolation...")

    # Define extent for interpolation
    if args.world:
        min_lon, max_lon = -180, 180
        min_lat, max_lat = -90, 90
    elif args.min_lat is not None and args.max_lat is not None and \
         args.min_lon is not None and args.max_lon is not None:
        min_lon, max_lon = args.min_lon, args.max_lon
        min_lat, max_lat = args.min_lat, args.max_lat
    else: # Default to Japan extent if no specific extent is given
        min_lon, max_lon = 122, 154 
        min_lat, max_lat = 20, 46
        print(f"Using default extent for Japan: Lon({min_lon}, {max_lon}), Lat({min_lat}, {max_lat})")

    # Create grid coordinates
    xi = np.linspace(min_lon, max_lon, args.grid_dim)
    yi = np.linspace(min_lat, max_lat, args.grid_dim)
    grid_x, grid_y = np.meshgrid(xi, yi)

    # Build KDTree for efficient neighbor search
    print("Building KDTree...")
    kdtree = cKDTree(points)
    print("KDTree built.")

    grid_z = np.full((args.grid_dim, args.grid_dim), np.nan) # Initialize with NaNs
    num_chunks = (args.grid_dim + args.chunk_size - 1) // args.chunk_size

    print(f"Starting interpolation in {num_chunks*num_chunks} chunks...")
    cells_processed_total = 0
    for r_chunk in tqdm(range(num_chunks), desc="Grid Rows"):
        r_start = r_chunk * args.chunk_size
        r_end = min((r_chunk + 1) * args.chunk_size, args.grid_dim)
        for c_chunk in tqdm(range(num_chunks), desc="Grid Cols", leave=False):
            c_start = c_chunk * args.chunk_size
            c_end = min((c_chunk + 1) * args.chunk_size, args.grid_dim)
            # print(f"Processing chunk: Row {r_chunk+1}/{num_chunks}, Col {c_chunk+1}/{num_chunks}. Grid cells: R[{r_start}:{r_end}], C[{c_start}:{c_end}]") # Optional: very verbose

            chunk_grid_x = grid_x[r_start:r_end, c_start:c_end]
            chunk_grid_y = grid_y[r_start:r_end, c_start:c_end]
            
            cells_in_chunk = chunk_grid_x.shape[0] * chunk_grid_x.shape[1]
            cells_processed_in_chunk = 0

            # Iterate over each cell in the chunk
            for i in range(chunk_grid_x.shape[0]):
                for j in range(chunk_grid_x.shape[1]):
                    current_point = np.array([chunk_grid_x[i,j], chunk_grid_y[i,j]])
                    
                    # Find neighbors within search_radius_deg
                    indices = kdtree.query_ball_point(current_point, r=args.search_radius_deg)
                    
                    if len(indices) > 0:
                        neighbor_points = points[indices]
                        neighbor_values = values[indices]
                        distances = np.sqrt(np.sum((neighbor_points - current_point)**2, axis=1))

                        # IDW calculation
                        if 0 in distances: # If a data point is exactly at the grid cell
                            grid_z[r_start+i, c_start+j] = neighbor_values[distances == 0][0]
                        else:
                            weights = 1.0 / (distances ** args.idw_power)
                            weighted_sum = np.sum(weights * neighbor_values)
                            sum_of_weights = np.sum(weights)
                            if sum_of_weights > 0:
                                grid_z[r_start+i, c_start+j] = weighted_sum / sum_of_weights
                            # else: remains NaN if all weights are zero (should not happen with positive distances)
                    # else: grid_z remains NaN if no neighbors found
                    cells_processed_in_chunk += 1
                    cells_processed_total += 1
                    if cells_processed_total % 10000 == 0: # Print progress every 10,000 cells
                        print(f"  Processed {cells_processed_total} / {args.grid_dim*args.grid_dim} total grid cells...")
            
            # print(f"  Finished chunk: R[{r_start}:{r_end}], C[{c_start}:{c_end}]. Processed {cells_processed_in_chunk} cells in this chunk.") # Optional: very verbose

    print("Interpolation finished.")

    # Placeholder for saving the NPY file
    print(f"Saving interpolated grid to {args.output_npy}...")
    try:
        output_dir = os.path.dirname(args.output_npy)
        if output_dir and not os.path.exists(output_dir):
            os.makedirs(output_dir)
            print(f"Created output directory: {output_dir}")
        np.save(args.output_npy, grid_z)
        print(f"Successfully saved grid to {args.output_npy}")
    except Exception as e:
        print(f"Error saving NPY file: {e}")
        return

    print("Safecast API precomputation finished.")

if __name__ == '__main__':
    main() 