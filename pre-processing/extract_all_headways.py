import pandas as pd
import json
import zipfile
import os

# Path to GTFS zip file
GTFS_ZIP_PATH = os.path.join('..', 'GTFS-2025-10-28.zip')

print("Loading GTFS data from zip file...")
with zipfile.ZipFile(GTFS_ZIP_PATH) as z:
    with z.open('routes.txt') as f:
        routes = pd.read_csv(f)
    with z.open('trips.txt') as f:
        trips = pd.read_csv(f)
    with z.open('stop_times.txt') as f:
        stop_times = pd.read_csv(f)
    with z.open('calendar.txt') as f:
        calendar = pd.read_csv(f)

# Get weekday service IDs (Monday-Friday)
weekday_services = calendar[
    (calendar['monday'] == 1) & 
    (calendar['tuesday'] == 1) & 
    (calendar['wednesday'] == 1) & 
    (calendar['thursday'] == 1) & 
    (calendar['friday'] == 1)
]['service_id'].unique()

print(f"Found {len(weekday_services)} weekday service patterns")
print(f"Processing {len(routes)} routes...")

def time_to_minutes(time_str):
    """Convert HH:MM:SS to minutes since midnight"""
    parts = time_str.split(':')
    hours = int(parts[0])
    minutes = int(parts[1])
    seconds = int(parts[2])
    return hours * 60 + minutes + seconds / 60

def calculate_route_headways(route_id, route_trips, all_stop_times):
    """Calculate headway statistics for a single route"""
    
    # Get weekday trips only
    weekday_trips = route_trips[route_trips['service_id'].isin(weekday_services)]
    
    if len(weekday_trips) == 0:
        return None
    
    # Get stop times for these trips
    trip_stop_times = all_stop_times[all_stop_times['trip_id'].isin(weekday_trips['trip_id'])]
    
    # Get first stop departures (stop_sequence == 1)
    first_stops = trip_stop_times[trip_stop_times['stop_sequence'] == 1].copy()
    
    if len(first_stops) < 2:
        return None
    
    # Convert times to minutes
    first_stops['departure_minutes'] = first_stops['departure_time'].apply(time_to_minutes)
    first_stops = first_stops.sort_values('departure_minutes')
    
    # Calculate overall statistics
    departures = sorted(first_stops['departure_minutes'].values)
    headways = [departures[i+1] - departures[i] for i in range(len(departures)-1)]
    
    # Filter out 0-minute headways (overlapping service patterns)
    headways_filtered = [h for h in headways if h > 0]
    
    if len(headways_filtered) == 0:
        return None
    
    stats = {
        'num_trips': len(first_stops),
        'first_departure': first_stops.iloc[0]['departure_time'],
        'last_departure': first_stops.iloc[-1]['departure_time'],
        'avg_headway_minutes': round(sum(headways_filtered) / len(headways_filtered), 1),
        'min_headway_minutes': round(min(headways_filtered), 1),
        'max_headway_minutes': round(max(headways_filtered), 1)
    }
    
    # Calculate hourly profile
    hourly_profile = []
    for hour in range(4, 24):  # 4 AM to midnight
        hour_trips = first_stops[
            (first_stops['departure_minutes'] >= hour * 60) & 
            (first_stops['departure_minutes'] < (hour + 1) * 60)
        ]
        
        if len(hour_trips) > 1:
            hour_deps = sorted(hour_trips['departure_minutes'].values)
            hour_headways = [hour_deps[i+1] - hour_deps[i] for i in range(len(hour_deps)-1)]
            hour_headways_filtered = [h for h in hour_headways if h > 0]
            
            if len(hour_headways_filtered) > 0:
                avg_headway = sum(hour_headways_filtered) / len(hour_headways_filtered)
                buses_per_hour = round(60 / avg_headway, 1) if avg_headway > 0 else 0
                
                hourly_profile.append({
                    'hour': hour,
                    'trips': len(hour_trips),
                    'avg_headway_minutes': round(avg_headway, 1),
                    'buses_per_hour': buses_per_hour
                })
            else:
                # Hour has trips but no valid headways (single trip or all zero headways)
                hourly_profile.append({
                    'hour': hour,
                    'trips': len(hour_trips),
                    'avg_headway_minutes': 0,
                    'buses_per_hour': 0
                })
        else:
            # No trips or only one trip in this hour - add zero data
            hourly_profile.append({
                'hour': hour,
                'trips': len(hour_trips),
                'avg_headway_minutes': 0,
                'buses_per_hour': 0
            })
    
    stats['hourly_profile'] = hourly_profile
    
    return stats

# Process all routes
route_frequency_data = {}
processed = 0
skipped = 0

for idx, route in routes.iterrows():
    route_id = route['route_id']
    route_short_name = route['route_short_name']
    route_long_name = route['route_long_name']
    
    # Get trips for this route
    route_trips = trips[trips['route_id'] == route_id]
    
    if len(route_trips) == 0:
        skipped += 1
        continue
    
    # Calculate headways
    headway_data = calculate_route_headways(route_id, route_trips, stop_times)
    
    if headway_data is None:
        skipped += 1
        continue
    
    route_frequency_data[route_id] = {
        'route_id': route_id,
        'route_short_name': route_short_name,
        'route_long_name': route_long_name,
        'route_color': route['route_color'],
        'route_text_color': route['route_text_color'],
        **headway_data
    }
    
    processed += 1
    if processed % 50 == 0:
        print(f"Processed {processed} routes...")

print(f"\nCompleted!")
print(f"Successfully processed: {processed} routes")
print(f"Skipped (no valid data): {skipped} routes")

# Save to JSON file
output_file = '../gtfs-app/public/routes_data/route_frequencies.json'
with open(output_file, 'w', encoding='utf-8') as f:
    json.dump(route_frequency_data, f, ensure_ascii=False, indent=2)

print(f"\nSaved frequency data to: {output_file}")

# Print some sample statistics
print("\n=== Sample Routes ===")
sample_count = 0
for route_id, data in route_frequency_data.items():
    if sample_count >= 5:
        break
    print(f"\n{data['route_short_name']} - {data['route_long_name']}")
    print(f"  Trips: {data['num_trips']}")
    print(f"  Service hours: {data['first_departure']} - {data['last_departure']}")
    print(f"  Avg headway: {data['avg_headway_minutes']} min")
    print(f"  Peak frequency: {max([h['buses_per_hour'] for h in data['hourly_profile']])} buses/hour")
    sample_count += 1
