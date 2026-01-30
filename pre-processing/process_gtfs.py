import pandas as pd
import zipfile
import json
import os
from shapely.geometry import LineString, mapping

# Paths
GTFS_ZIP_PATH = os.path.join('..', 'GTFS-2025-10-28.zip')
OUTPUT_DIR = os.path.join('..', 'gtfs-app', 'public', 'routes_data')

def load_gtfs_data(zip_path):
    print(f"Loading GTFS data from {zip_path}...")
    with zipfile.ZipFile(zip_path) as z:
        # Check files
        filenames = z.namelist()
        print(f"Files in zip: {filenames}")
        
        if 'shapes.txt' not in filenames:
            print("Error: shapes.txt not found!")
            return None
        
        # Load necessary files
        with z.open('routes.txt') as f:
            routes = pd.read_csv(f)
        
        with z.open('trips.txt') as f:
            trips = pd.read_csv(f)
            
        with z.open('shapes.txt') as f:
            shapes = pd.read_csv(f)
            
    return routes, trips, shapes

def process_data(routes, trips, shapes):
    print("Processing data...")
    
    # Create output directory
    if not os.path.exists(OUTPUT_DIR):
        os.makedirs(OUTPUT_DIR)
        print(f"Created directory {OUTPUT_DIR}")

    # We want to map route -> shape(s).
    # trips.txt links route_id to shape_id.
    
    # Get unique shape_ids per route
    route_shapes = trips[['route_id', 'shape_id']].drop_duplicates()
    
    # Sort by sequence first
    shapes = shapes.sort_values(['shape_id', 'shape_pt_sequence'])
    
    # Group by shape_id and create list of points
    shapes_grouped = shapes.groupby('shape_id')[['shape_pt_lon', 'shape_pt_lat']].apply(
        lambda x: x.values.tolist()
    ).reset_index(name='coords')
    
    # Merge with route info
    merged = pd.merge(route_shapes, shapes_grouped, on='shape_id')
    
    # Merge with route details (names, colors)
    final_data = pd.merge(merged, routes, on='route_id')
    
    # Group by route_id to handle multiple shapes per route
    route_index = []
    all_features = []
    
    for route_id, group in final_data.groupby('route_id'):
        features = []
        
        # Get metadata from the first row of the group
        first_row = group.iloc[0]
        route_meta = {
            'route_id': str(first_row['route_id']),
            'route_short_name': str(first_row['route_short_name']),
            'route_long_name': str(first_row['route_long_name']) if pd.notna(first_row['route_long_name']) else "",
            'route_color': f"{first_row['route_color']}" if pd.notna(first_row['route_color']) else "000000",
            'route_text_color': f"{first_row['route_text_color']}" if pd.notna(first_row['route_text_color']) else "FFFFFF"
        }
        route_index.append(route_meta)
        
        for _, row in group.iterrows():
            coords = row['coords']
            if len(coords) < 2:
                continue
                
            line = LineString(coords)
            
            properties = {
                'route_id': row['route_id'],
                'route_short_name': row['route_short_name'],
                'route_long_name': row['route_long_name'] if pd.notna(row['route_long_name']) else "",
                'route_color': f"#{row['route_color']}" if pd.notna(row['route_color']) else "#000000",
                'route_text_color': f"#{row['route_text_color']}" if pd.notna(row['route_text_color']) else "#FFFFFF",
                'shape_id': row['shape_id']
            }
            
            feature = {
                "type": "Feature",
                "id": row['shape_id'], # Important for maplibre feature state
                "properties": properties,
                "geometry": mapping(line)
            }
            features.append(feature)
            all_features.append(feature)
            
        geojson = {
            "type": "FeatureCollection",
            "features": features
        }
        
        # Save individual file
        # Safe filename
        safe_route_id = "".join([c for c in str(route_id) if c.isalnum() or c in ('-', '_')])
        file_path = os.path.join(OUTPUT_DIR, f"{safe_route_id}.json")
        
        with open(file_path, 'w') as f:
            json.dump(geojson, f)

    # Save index file
    with open(os.path.join(OUTPUT_DIR, 'routes_index.json'), 'w') as f:
        json.dump(route_index, f)

    # Save ALL routes file
    all_geojson = {
        "type": "FeatureCollection",
        "features": all_features
    }
    with open(os.path.join(OUTPUT_DIR, 'all_routes.geojson'), 'w') as f:
        json.dump(all_geojson, f)
        
    print(f"Saved {len(final_data['route_id'].unique())} route files to {OUTPUT_DIR}")
    print(f"Saved all_routes.geojson with {len(all_features)} features")
    print(f"Saved index to {os.path.join(OUTPUT_DIR, 'routes_index.json')}")

def main():
    if not os.path.exists(GTFS_ZIP_PATH):
        print(f"File not found: {GTFS_ZIP_PATH}")
        return

    data = load_gtfs_data(GTFS_ZIP_PATH)
    if not data:
        return
        
    routes, trips, shapes = data
    process_data(routes, trips, shapes)

if __name__ == "__main__":
    main()
