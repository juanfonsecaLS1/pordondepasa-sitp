import pandas as pd
import zipfile
import json
import os

# Paths
GTFS_ZIP_PATH = os.path.join('..', 'GTFS-2025-10-28.zip')
OUTPUT_DIR = os.path.join('..', 'gtfs-app', 'public', 'routes_data')

def load_gtfs_stops_data(zip_path):
    """Load GTFS data related to stops and routes."""
    print(f"Loading GTFS data from {zip_path}...")
    with zipfile.ZipFile(zip_path) as z:
        # Check files
        filenames = z.namelist()
        print(f"Files in zip: {filenames}")
        
        required_files = ['stops.txt', 'stop_times.txt', 'trips.txt', 'routes.txt']
        for required in required_files:
            if required not in filenames:
                print(f"Error: {required} not found!")
                return None
        
        # Load necessary files
        with z.open('stops.txt') as f:
            stops = pd.read_csv(f)
        
        with z.open('stop_times.txt') as f:
            stop_times = pd.read_csv(f)
            
        with z.open('trips.txt') as f:
            trips = pd.read_csv(f)
            
        with z.open('routes.txt') as f:
            routes = pd.read_csv(f)
            
    return stops, stop_times, trips, routes

def process_stops_data(stops, stop_times, trips, routes):
    """Process stop data to create a mapping of stops to routes."""
    print("Processing stops data...")
    
    # Create output directory if it doesn't exist
    if not os.path.exists(OUTPUT_DIR):
        os.makedirs(OUTPUT_DIR)
        print(f"Created directory {OUTPUT_DIR}")
    
    # Link stop_times -> trips -> routes
    # stop_times has: trip_id, stop_id
    # trips has: trip_id, route_id
    # routes has: route_id, route_short_name, route_long_name, etc.
    
    print(f"Total stops: {len(stops)}")
    print(f"Total stop_times entries: {len(stop_times)}")
    print(f"Total trips: {len(trips)}")
    print(f"Total routes: {len(routes)}")
    
    # Merge stop_times with trips to get route_id for each stop
    print("Merging stop_times with trips...")
    stop_trips = pd.merge(
        stop_times[['trip_id', 'stop_id']].drop_duplicates(),
        trips[['trip_id', 'route_id']],
        on='trip_id'
    )
    
    # Get unique stop_id and route_id combinations
    print("Getting unique stop-route combinations...")
    stop_routes = stop_trips[['stop_id', 'route_id']].drop_duplicates()
    
    # Merge with route details
    print("Merging with route details...")
    stop_routes_detailed = pd.merge(stop_routes, routes, on='route_id')
    
    # Merge with stop details (coordinates, name)
    print("Merging with stop details...")
    stop_routes_detailed = pd.merge(stop_routes_detailed, stops, on='stop_id')
    
    # Group by stop to get all routes serving each stop
    print("Grouping routes by stop...")
    stops_with_routes = []
    
    for stop_id, group in stop_routes_detailed.groupby('stop_id'):
        first_row = group.iloc[0]
        
        # Get list of routes serving this stop
        routes_list = []
        for _, row in group.iterrows():
            route_info = {
                'route_id': str(row['route_id']),
                'route_short_name': str(row['route_short_name']),
                'route_long_name': str(row['route_long_name']) if pd.notna(row['route_long_name']) else "",
                'route_color': f"{row['route_color']}" if pd.notna(row['route_color']) else "000000",
                'route_text_color': f"{row['route_text_color']}" if pd.notna(row['route_text_color']) else "FFFFFF"
            }
            routes_list.append(route_info)
        
        stop_info = {
            'stop_id': str(stop_id),
            'stop_name': str(first_row['stop_name']) if pd.notna(first_row['stop_name']) else "",
            'stop_lat': float(first_row['stop_lat']),
            'stop_lon': float(first_row['stop_lon']),
            'stop_code': str(first_row['stop_code']) if 'stop_code' in first_row and pd.notna(first_row['stop_code']) else "",
            'routes': routes_list,
            'route_count': len(routes_list)
        }
        stops_with_routes.append(stop_info)
    
    # Sort by stop_id for easier lookup
    stops_with_routes.sort(key=lambda x: x['stop_id'])
    
    # Save stops data with routes
    stops_file_path = os.path.join(OUTPUT_DIR, 'stops_with_routes.json')
    with open(stops_file_path, 'w', encoding='utf-8') as f:
        json.dump(stops_with_routes, f, ensure_ascii=False, indent=2)
    
    print(f"Saved {len(stops_with_routes)} stops with route information to {stops_file_path}")
    
    # Create a GeoJSON version for mapping purposes
    features = []
    for stop in stops_with_routes:
        feature = {
            "type": "Feature",
            "id": stop['stop_id'],
            "properties": {
                'stop_id': stop['stop_id'],
                'stop_name': stop['stop_name'],
                'stop_code': stop['stop_code'],
                'route_count': stop['route_count'],
                'route_ids': [r['route_id'] for r in stop['routes']],
                'route_names': [r['route_short_name'] for r in stop['routes']]
            },
            "geometry": {
                "type": "Point",
                "coordinates": [stop['stop_lon'], stop['stop_lat']]
            }
        }
        features.append(feature)
    
    geojson = {
        "type": "FeatureCollection",
        "features": features
    }
    
    geojson_file_path = os.path.join(OUTPUT_DIR, 'stops.geojson')
    with open(geojson_file_path, 'w', encoding='utf-8') as f:
        json.dump(geojson, f, ensure_ascii=False, indent=2)
    
    print(f"Saved stops GeoJSON to {geojson_file_path}")
    
    # Create a reverse index: route_id -> list of stop_ids
    print("Creating route-to-stops index...")
    route_stops = {}
    for stop in stops_with_routes:
        for route in stop['routes']:
            route_id = route['route_id']
            if route_id not in route_stops:
                route_stops[route_id] = {
                    'route_id': route_id,
                    'route_short_name': route['route_short_name'],
                    'route_long_name': route['route_long_name'],
                    'stop_ids': []
                }
            route_stops[route_id]['stop_ids'].append(stop['stop_id'])
    
    # Convert to list and sort
    route_stops_list = list(route_stops.values())
    route_stops_list.sort(key=lambda x: x['route_id'])
    
    route_stops_file_path = os.path.join(OUTPUT_DIR, 'routes_to_stops.json')
    with open(route_stops_file_path, 'w', encoding='utf-8') as f:
        json.dump(route_stops_list, f, ensure_ascii=False, indent=2)
    
    print(f"Saved route-to-stops mapping to {route_stops_file_path}")
    
    # Print some statistics
    print("\n=== Statistics ===")
    print(f"Total unique stops: {len(stops_with_routes)}")
    print(f"Total unique routes: {len(route_stops)}")
    avg_routes_per_stop = sum(s['route_count'] for s in stops_with_routes) / len(stops_with_routes)
    print(f"Average routes per stop: {avg_routes_per_stop:.2f}")
    max_routes_stop = max(stops_with_routes, key=lambda x: x['route_count'])
    print(f"Stop with most routes: {max_routes_stop['stop_name']} ({max_routes_stop['route_count']} routes)")

def main():
    if not os.path.exists(GTFS_ZIP_PATH):
        print(f"File not found: {GTFS_ZIP_PATH}")
        return

    data = load_gtfs_stops_data(GTFS_ZIP_PATH)
    if not data:
        return
        
    stops, stop_times, trips, routes = data
    process_stops_data(stops, stop_times, trips, routes)

if __name__ == "__main__":
    main()
