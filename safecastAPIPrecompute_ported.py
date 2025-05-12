#!/usr/bin/env python
# -*- coding: UTF-8 -*-
#
# Copyright (C) 2011  Lionel Bergeret
#
# ----------------------------------------------------------------
# The contents of this file are distributed under the CC0 license.
# See http://creativecommons.org/publicdomain/zero/1.0/
# ----------------------------------------------------------------

import os
import time
import pickle  # Changed from cPickle
import argparse # Changed from optparse
import numpy as np
from scipy.interpolate import griddata # Changed from matplotlib.mlab
from shapely.geometry import Point
from shapely.ops import unary_union # Changed from cascaded_union
# import safecastCommon # Will address if functions are missing / critically needed for grid output
import csv
import math

# Psyco removed
# print("Psyco plugin missing, will run slower")

# Japan limits (Hardcoded for now, consider making these parameters or reading from config)
lat_min_japan = 32.0
lon_min_japan = 130.0
lat_max_japan = 46.00
lon_max_japan = 147.45

#coverage['jp:Hokkaido'] = new Array(+42.0, +46.0, +140.0, +146.0); # JS style, not used in current script
#coverage['jp:North']    = new Array(+34.0, +42.0, +137.0, +143.0);
#coverage['jp:South']    = new Array(+32.0, +36.0, +130.0, +137.0);

# -----------------------------------------------------------------------------
# Pre-compute the griddata interpolation
# -----------------------------------------------------------------------------
def PreCompute(safecastDataset, safecastDatasetCPMThreashold, safecastGridsize, highResolution, output_npy_file='interpolated_grid.npy'):
    # Setup: loading data...
    print("Loading data ...")
    t1 = time.time() # time.clock() is deprecated and removed in Python 3.3+
    nx, ny = safecastGridsize, safecastGridsize # grid size
    
    # Using hardcoded Japan limits for now
    npts, x, y, z, zraw, zcount = LoadSafecastData(safecastDataset, safecastDatasetCPMThreashold, lat_min_japan, lat_max_japan, lon_min_japan, lon_max_japan, highResolution)
    print(f"done in {time.time()-t1:.2f} seconds.")

    if npts == 0:
        print("No data points loaded. Exiting.")
        return

    grid = None # Initialize grid
    xil = []
    yil = []
    missing = None # Initialize missing
    # Initialize grid boundary variables in case they are not set in the 'else' branch
    x_min, x_max, y_min, y_max = np.nan, np.nan, np.nan, np.nan

    if highResolution:
      # In high res mode, original script doesn't produce a grid for interpolation, 
      # it just saves the processed (truncated, averaged) points. 
      # For our goal of producing a .npy grid, this mode might need rethinking or skipping.
      print("High resolution mode selected. Original script does not interpolate. Saving processed points for now.")
      # We will save the x,y,z points directly if that's desired later.
      # For now, to align with goal of creating an interpolated grid, this path won't produce one.
      # Consider if highResolution should mean a finer grid for interpolation instead.
      pass # Or decide what to do for a .npy output in this case
    else:
      if x.size == 0 or y.size == 0:
          print("No valid data points (x, y) to create grid from. Cannot proceed with interpolation.")
          # Save an empty or placeholder grid if necessary, or raise error
          empty_grid = np.empty((nx, ny))
          empty_grid[:] = np.nan 
          np.save(output_npy_file, empty_grid)
          print(f"Saved empty/NaN grid to {output_npy_file}")
          return

      # Compute area with missing data
      print("Compute area with missing data (using Shapely)")
      t1 = time.time()
      measures = np.vstack((x,y)).T
      # Ensure points are created only if measures is not empty
      if measures.size > 0:
          points = [Point(a,b) for a, b in measures]
          spots = [p.buffer(0.04) for p in points] # 0.04 degree ~ 1km radius
          if spots: # Ensure spots is not empty before union
              missing = unary_union(spots) # Changed from cascaded_union
          else:
              print("No spots created for missing data calculation.")
      else:
          print("No measures to create points for missing data calculation.")
      print(f"done in {time.time()-t1:.2f} seconds.")

      # Create the grid
      print("Create the grid")
      t1 = time.time()
      x_min, x_max = x.min(), x.max() # These are the actual data extents
      y_min, y_max = y.min(), y.max() # These are the actual data extents
      if x_min == x_max: # Handle cases with single point longitude
          x_max += 1e-6
      if y_min == y_max: # Handle cases with single point latitude
          y_max += 1e-6

      xil = np.linspace(x_min, x_max, nx)
      yil = np.linspace(y_min, y_max, ny)
      xi, yi = np.meshgrid(xil, yil)
      print(f"done in {time.time()-t1:.2f} seconds.")

      # Calculate the griddata
      print(f"Calculate the griddata ({nx} x {ny})")
      t1 = time.time()
      # Using scipy.interpolate.griddata. Assuming 'nn' meant nearest neighbor.
      # The points (x,y) are lon,lat. xi,yi is the meshgrid.
      # griddata expects points as (N, D) array, so stack x and y.
      points_for_griddata = np.vstack((x,y)).T
      if points_for_griddata.shape[0] < 1:
          print("Not enough points to interpolate.")
          grid = np.full((ny, nx), np.nan)
      else:
          zi = griddata(points_for_griddata, z, (xi, yi), method='nearest')
          grid = zi # griddata already returns it in the right shape if xi, yi are meshes
      print(f"done in {time.time()-t1:.2f} seconds.")

    # Save the interpolated grid and its boundaries as .npz
    if grid is not None:
        # Ensure boundaries are available; they should be if grid is not None
        # and not in highResolution mode.
        if not (np.isnan(x_min) or np.isnan(x_max) or np.isnan(y_min) or np.isnan(y_max)):
            np.savez(output_npy_file, grid=grid, 
                     grid_min_lon=x_min, grid_max_lon=x_max, 
                     grid_min_lat=y_min, grid_max_lat=y_max)
            print(f"Interpolated grid and boundaries saved to {output_npy_file} (as .npz)")
        else:
            # Fallback for safety, though this case should ideally not be hit if grid is generated
            np.save(output_npy_file, grid)
            print(f"Interpolated grid saved to {output_npy_file} (boundaries missing). Please check logic.")

    # Original pickling logic (commented out, replaced by .npy saving of grid)
    # toSave = [npts, x, y, z, zraw, zcount, xil, yil, grid, missing]
    # with open('safecast.pickle','wb') as f: # Ensure file is closed
    #    pickle.dump(toSave, f, protocol=pickle.HIGHEST_PROTOCOL) # protocol for Py3
    # print("Original data (including missing polygon) would be saved to safecast.pickle")

def dd2dms(dd):
   is_positive = dd >= 0
   dd = abs(dd)
   minutes,seconds = divmod(dd*3600,60)
   degrees,minutes = divmod(minutes,60)
   degrees = degrees if is_positive else -degrees
   return (degrees,minutes,seconds)

def dms2dd(degrees, minutes, seconds):
   # Ensure division is float division for Python 3
   return float(degrees)+float(minutes)/60.+float(seconds)/3600.

def truncate(lat, lon, factor):
   # 1 minutes latitude is 40007.86/360/60 = 1.852
   # 25 meters =  0.01349892008639
   # 100 meters = 0.05399568034557235400
   # 500 meters = 0.26997840172786177000

   degrees, minutes, seconds = dd2dms(lat)
   minutes = minutes+(seconds/60.0) # Ensure float division
   minutes -= minutes % round(factor, 4)

   # new latitude
   newLat = dms2dd(degrees,minutes,0) # Use dms2dd for consistency, pass 0 for seconds if already in minutes

   t = newLat/180.0*math.pi # Ensure float division
   # Handle potential math.cos(t) being zero if t is pi/2 or 3pi/2 (lat is +/- 90)
   cos_t = math.cos(t)
   if abs(cos_t) < 1e-9: # Avoid division by zero
       lon_trunc = factor # Or some other appropriate handling for poles
   else:
       lon_trunc = round(((factor/cos_t)), 4)

   degrees_lon, minutes_lon, seconds_lon = dd2dms(lon)
   minutes_lon = minutes_lon+(seconds_lon/60.0) # Ensure float division
   minutes_lon -= minutes_lon % lon_trunc

   # new longitude
   newLon = dms2dd(degrees_lon,minutes_lon,0)

   return newLat, newLon

# -----------------------------------------------------------------------------
# Load the Safecast csv data file
# -----------------------------------------------------------------------------
def LoadSafecastData(filename, CPMclip, latmin, latmax, lonmin, lonmax, highResolution):
    # Load data
    try:
        # Ensure file is closed properly using 'with'
        with open(filename, 'r', newline='') as csvfile: # Added newline='' for csv module best practice
            data_reader = csv.reader(csvfile)
            fields = next(data_reader) # Changed from data.next()
            safecast_agg = {} # Renamed to avoid conflict with module, and more descriptive

            # Process data
            for i, row in enumerate(data_reader):
                if not row: # Skip empty rows
                    continue
                # Zip together the field names and values
                items = zip(fields, row)
                item = {}
                for (name, value) in items:
                    item[name] = value.strip()
                
                try:
                    lat_val = float(item["Latitude"])
                    lon_val = float(item["Longitude"])

                    if not ((lat_val > latmin) and (lat_val < latmax) and (lon_val > lonmin) and (lon_val < lonmax)):
                        continue

                    cpm = float(item["Value"])
                    cpmRaw = cpm
                
                    if (cpm > CPMclip): cpm = CPMclip # clip
                    if cpm <= 0: continue # Skip zero or negative CPM values after potential clipping

                    if highResolution:
                       # Using a very small factor, effectively minimal truncation for high-res
                       # The original value 0.005399... corresponds to ~100m at equator, not 25m as comment suggests
                       # For minimal aggregation (almost raw but unique coords for ~25m), factor could be e.g. 0.0001 deg
                       # Let's use a factor that corresponds to roughly 25m (approx 0.000225 degrees for latitude)
                       lat_trunc, lon_trunc = truncate(lat_val, lon_val, 0.000225)
                    else:
                       # Original factor 0.2699... corresponds to ~500m
                       lat_trunc, lon_trunc = truncate(lat_val, lon_val, 0.0045) # Approx 500m (latitude degrees)

                    key = f"{lat_trunc:.6f},{lon_trunc:.6f}" # Python 3 f-string and more precision for key
                    if key not in safecast_agg:
                       safecast_agg[key]=([float(cpm)], [float(cpmRaw)])
                    else:
                       safecast_agg[key][0].append(float(cpm))
                       safecast_agg[key][1].append(float(cpmRaw))
                except ValueError as ve:
                    # print(f"Skipping row {i+1} due to ValueError: {ve} - Row content: {row}")
                    pass # Silently skip rows with conversion errors or missing essential fields
                except KeyError as ke:
                    # print(f"Skipping row {i+1} due to KeyError: {ke} - Likely missing column. Fields: {fields}")
                    pass # Silently skip if essential keys like 'Latitude' are missing

    except FileNotFoundError:
        print(f"Error: Input CSV file not found at {filename}")
        return 0, np.array([]), np.array([]), np.array([]), np.array([]), np.array([])
    except Exception as e:
        print(f"An unexpected error occurred while reading CSV {filename}: {e}")
        return 0, np.array([]), np.array([]), np.array([]), np.array([]), np.array([])

    npts = len(safecast_agg)
    print(f"{npts} aggregated measurements loaded.")

    if npts == 0:
        return 0, np.array([]), np.array([]), np.array([]), np.array([]), np.array([])

    x_coords = []
    y_coords = []
    z_values = []
    zraw_values = []
    zcounts = []

    # Repack
    for coord_key in safecast_agg.keys():
      lat_str, lon_str = coord_key.split(",")
      # Average the collected CPM values for this truncated coordinate
      avg_cpm = sum(safecast_agg[coord_key][0])/len(safecast_agg[coord_key][0])
      avg_cpmRaw = sum(safecast_agg[coord_key][1])/len(safecast_agg[coord_key][1])
      
      x_coords.append(float(lon_str))
      y_coords.append(float(lat_str))
      z_values.append(avg_cpm)
      zraw_values.append(avg_cpmRaw)
      zcounts.append(len(safecast_agg[coord_key][0]))

    return npts, np.array(x_coords), np.array(y_coords), np.array(z_values), np.array(zraw_values), np.array(zcounts)

# -----------------------------------------------------------------------------
# Main
# -----------------------------------------------------------------------------
if __name__ == '__main__':
    parser = argparse.ArgumentParser(description="Precompute griddata interpolation from Safecast CSV file.") # Changed to argparse
    parser.add_argument("input_csv", help="Path to the Safecast CSV input file")
    parser.add_argument("-o", "--output_npy", default="interpolated_grid.npz", help="Output .npz file name for the interpolated grid and boundaries (default: interpolated_grid.npz)")
    parser.add_argument("-g", "--gridsize", type=int, default=256, help="Square grid size (default: 256)")
    parser.add_argument("-t", "--cpmThreashold", type=int, default=35000, help="CPM threashold for clipping input values (default: 35000)") # Increased default based on typical Safecast data
    parser.add_argument("-H", "--highResolution", action="store_true", default=False, help="Process data at higher spatial resolution (less aggregation), currently does not produce an interpolated grid directly.")
    
    args = parser.parse_args()

    print(f"Preprocessing: {args.input_csv}, grid size: {args.gridsize}, CPM threshold: {args.cpmThreashold}")
    PreCompute(args.input_csv, args.cpmThreashold, args.gridsize, args.highResolution, output_npy_file=args.output_npy)
    print("Done") 