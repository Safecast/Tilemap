#!/usr/bin/env python3
import argparse
import pandas as pd
import math
import json

# (Safecast Color/Conversion constants - not strictly needed for query but good for reference)
SAFECAST_COLOR_LEGEND = [
    (0.03, (50, 0, 100)),    # UI: Darkest Blue/Purple
    (0.05, (0, 0, 139)),     # UI: Dark Blue
    (0.08, (0, 0, 205)),     # UI: Medium Blue
    (0.12, (0, 100, 255)),   # UI: Lighter Blue
    (0.16, (0, 191, 255)),   # UI: Sky Blue / Cyanish
    (0.23, (0, 255, 255)),   # UI: Cyan / Turquoise
    (0.31, (173, 127, 217)), # UI: Light Purple
    (0.43, (200, 0, 200)),   # UI: Magenta
    (0.60, (255, 105, 180)), # UI: Pink
    (0.87, (255, 0, 127)),   # UI: Hot Pink / Reddish-Pink
    (1.31, (255, 69, 0)),    # UI: Red-Orange
    (2.13, (255, 165, 0)),   # UI: Orange
    (10.0, (255, 255, 0)),   # UI: Yellow (covering up to ~10 µSv/h)
    (float('inf'), (255, 255, 150)) # UI: Brighter Yellow for very high (above 10 µSv/h)
]
CPM_TO_USVH_FACTOR = 350.0

def haversine(lat1, lon1, lat2, lon2):
    """
    Calculate the great circle distance in kilometers between two points 
    on the earth (specified in decimal degrees).
    """
    # convert decimal degrees to radians 
    lon1, lat1, lon2, lat2 = map(math.radians, [lon1, lat1, lon2, lat2])

    # haversine formula 
    dlon = lon2 - lon1 
    dlat = lat2 - lat1 
    a = math.sin(dlat/2)**2 + math.cos(lat1) * math.cos(lat2) * math.sin(dlon/2)**2
    c = 2 * math.asin(math.sqrt(a)) 
    r = 6371 # Radius of earth in kilometers.
    return c * r

def find_closest_point(csv_path, target_lat, target_lon, max_distance_km=0.05): # 50 meters
    """
    Finds the closest point in the CSV to the target lat/lon within a max_distance.
    Returns a dictionary with point data or None.
    """
    closest_point = None
    min_dist = float('inf')
    
    chunk_size = 100000  # Process in chunks for memory efficiency
    
    required_cols = ['Captured Time', 'Latitude', 'Longitude', 'Value', 'Unit']
    
    try:
        for chunk_df in pd.read_csv(csv_path, usecols=lambda c: c in required_cols or c.startswith('Unnamed:'), chunksize=chunk_size, low_memory=False):
            # Filter by unit and valid values early
            chunk_df = chunk_df[chunk_df['Unit'] == 'cpm']
            chunk_df['Latitude'] = pd.to_numeric(chunk_df['Latitude'], errors='coerce')
            chunk_df['Longitude'] = pd.to_numeric(chunk_df['Longitude'], errors='coerce')
            chunk_df['Value'] = pd.to_numeric(chunk_df['Value'], errors='coerce')
            chunk_df.dropna(subset=['Latitude', 'Longitude', 'Value'], inplace=True)
            chunk_df = chunk_df[chunk_df['Value'] > 0] # Ensure positive CPM

            for _, row in chunk_df.iterrows():
                lat = row['Latitude']
                lon = row['Longitude']
                
                dist = haversine(target_lat, target_lon, lat, lon)
                
                if dist < min_dist and dist <= max_distance_km:
                    min_dist = dist
                    usvh_value = row['Value'] / CPM_TO_USVH_FACTOR
                    closest_point = {
                        "latitude": lat,
                        "longitude": lon,
                        "cpm_value": row['Value'],
                        "usvh_value": usvh_value,
                        "captured_time": row['Captured Time'],
                        "distance_km": dist
                    }
        return closest_point
        
    except FileNotFoundError:
        print(json.dumps({"error": f"File not found: {csv_path}"}))
        return None
    except Exception as e:
        print(json.dumps({"error": f"Error processing CSV: {str(e)}"}))
        return None

def main():
    parser = argparse.ArgumentParser(description='Find the closest data point in a CSV to a given lat/lon.')
    parser.add_argument('--csv', required=True, help='Path to the input CSV measurements file.')
    parser.add_argument('--lat', type=float, required=True, help='Target latitude.')
    parser.add_argument('--lon', type=float, required=True, help='Target longitude.')
    # parser.add_argument('--zoom', type=int, required=False, help='Current map zoom level (for future use).') # For later
    parser.add_argument('--max_dist_km', type=float, default=0.05, help='Maximum search radius in kilometers (e.g., 0.05 for 50m).')

    args = parser.parse_args()

    point_data = find_closest_point(args.csv, args.lat, args.lon, args.max_dist_km)

    if point_data:
        print(json.dumps(point_data))
    else:
        # If no point is found, we might want to return an empty object or a specific "not found" message.
        # For now, find_closest_point prints errors if any, otherwise no output means not found within radius.
        # To ensure JSON output for "not found":
        print(json.dumps({"status": "not_found"}))


if __name__ == '__main__':
    main() 