# Safecast Cosmic Tiles

This module adds support for visualizing cosmic radiation data from Safecast logs as a map layer.

## Overview

The cosmic visualization works in two steps:
1. A Python script processes cosmic logs and generates map tiles
2. A JavaScript file adds the tiles as a layer in the Safecast map

## Requirements

- Python 3.6+
- PIL (Python Imaging Library) / Pillow
- Requests

Install the required Python packages:

```bash
pip install pillow requests
```

## Generating Tiles

To generate the tiles, run the Python script:

```bash
python generate_cosmic_tiles.py
```

This will:
1. Fetch all cosmic log files from the Safecast API
2. Extract GPS coordinates from the log files
3. Process the coordinates into map tiles
4. Save the tiles in the `CosmicTiles` directory

### Options

- `--force`: Force regeneration of all tiles (removes existing tiles first)

Example:
```bash
python generate_cosmic_tiles.py --force
```

## Tile Structure

The tiles are generated in a standard web map tile structure:

```
CosmicTiles/
  tilejson.json
  5/
    16/
      10.png
      11.png
      ...
    17/
      ...
  6/
    ...
  ...
  14/
    ...
```

Where:
- The first level is the zoom level (5-14)
- The second level is the X tile coordinate
- The filenames are the Y tile coordinates

## Layer Integration

The cosmic layer integrates automatically with the Safecast map interface through `cosmic_layer.js`. Once the tiles are generated, refresh the map and the layer will appear in the layers menu.

## Customization

You can customize the appearance of the cosmic layer by modifying constants in the Python script:

```python
# In generate_cosmic_tiles.py
COSMIC_COLOR = (50, 50, 255, 180)  # Blue with alpha
HEATMAP_RADIUS = 5  # Pixel radius for each point in the heatmap
```

## Troubleshooting

1. **No tiles are generated**: Make sure the script has access to the Safecast API

2. **Layer doesn't appear**: Check the console for errors and verify that the tiles were generated

3. **Processing is slow**: The script can take a long time if there are many cosmic logs. Use a machine with more CPU cores for faster processing, as it uses multiprocessing.

## Log Format Support

The script supports multiple log formats:
- bGeigie format (primary format for Safecast)
- NMEA GPS format (GPGGA and GPRMC sentences)
- Generic CSV formats (as a fallback) 