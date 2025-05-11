import numpy as np
import os

file_path = "TileGriddata/interpolated_grid_japan.npy"

if not os.path.exists(file_path):
    print(f"Error: File not found at {file_path}")
else:
    try:
        grid = np.load(file_path)
        print(f"Loaded grid with shape: {grid.shape}")

        nan_mask = np.isnan(grid)
        all_nan = np.all(nan_mask)
        print(f"Are all values NaN? {all_nan}")

        non_nan_values = grid[~nan_mask]
        num_non_nan_cells = non_nan_values.size
        print(f"Number of non-NaN cells: {num_non_nan_cells}")
        
        total_cells = grid.size
        if total_cells > 0:
            print(f"Percentage of non-NaN cells: {(num_non_nan_cells / total_cells) * 100:.2f}%")

        if num_non_nan_cells > 0:
            print(f"Min non-NaN value: {np.min(non_nan_values)}")
            print(f"Max non-NaN value: {np.max(non_nan_values)}")
            print(f"Mean non-NaN value: {np.mean(non_nan_values)}")
            print(f"Median non-NaN value: {np.median(non_nan_values)}")

            # Find coordinates of first few non-NaN values
            non_nan_indices = np.argwhere(~nan_mask)
            print(f"\nFirst few (up to 5) non-NaN cell coordinates (row, col):")
            for i in range(min(5, len(non_nan_indices))):
                r, c = non_nan_indices[i]
                print(f"  ({r}, {c}), value: {grid[r, c]}")

                # Show a small slice around the first non-NaN value found
                if i == 0:
                    print(f"\nSlice of grid around first non-NaN value at ({r}, {c}):")
                    r_start = max(0, r - 2)
                    r_end = min(grid.shape[0], r + 3)
                    c_start = max(0, c - 2)
                    c_end = min(grid.shape[1], c + 3)
                    print(grid[r_start:r_end, c_start:c_end])
        else:
            print("No non-NaN data found in the grid.")
            
    except Exception as e:
        print(f"Error processing file: {e}")
