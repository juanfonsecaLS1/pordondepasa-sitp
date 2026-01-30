import json
import os
import sys
import random

OUTPUT_DIR = os.path.join('..', 'gtfs-viewer', 'public', 'routes_data')

def validate():
    print(f"Validating data in {OUTPUT_DIR}...")
    
    if not os.path.exists(OUTPUT_DIR):
        print("Directory does not exist!")
        sys.exit(1)
        
    files = [f for f in os.listdir(OUTPUT_DIR) if f.endswith('.json')]
    
    if not files:
        print("No JSON files found in directory")
        sys.exit(1)
        
    print(f"Found {len(files)} route files.")
    
    # Pick a random file
    file_to_check = random.choice(files)
    file_path = os.path.join(OUTPUT_DIR, file_to_check)
    
    print(f"Validating random file: {file_to_check}")
    
    try:
        with open(file_path, 'r') as f:
            data = json.load(f)
            
        if data['type'] != 'FeatureCollection':
            print("Error: Not a FeatureCollection")
            sys.exit(1)
            
        features = data['features']
        print(f"Found {len(features)} features in this route.")
        
        if len(features) == 0:
            print("Warning: No features found in this route (might be valid if empty route)")
        else:
            # Check first feature properties
            first = features[0]
            props = first['properties']
            geom = first['geometry']
            
            print("First feature properties:", props)
            print("First feature geometry type:", geom['type'])
            
            if 'route_id' not in props:
                print("Error: route_id missing in properties")
                sys.exit(1)
                
            if geom['type'] != 'LineString' and geom['type'] != 'MultiLineString':
                print(f"Error: Unexpected geometry type {geom['type']}")
                sys.exit(1)
            
        print("Validation successful!")
        
    except Exception as e:
        print(f"Validation failed with error: {e}")
        sys.exit(1)

if __name__ == "__main__":
    validate()
