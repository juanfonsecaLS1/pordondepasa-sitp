import pandas as pd
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

# Filter for route 539
route_539 = routes[routes['route_short_name'] == '539']
print("Route 539 variants:")
print(route_539[['route_id', 'route_short_name', 'route_long_name']])
print()

# Get trips for route 539
trips_539 = trips[trips['route_id'].isin(route_539['route_id'])]
print(f"Total trips for route 539: {len(trips_539)}")
print()

# Get service patterns
print("Service patterns:")
service_info = trips_539.merge(calendar, on='service_id')
print(service_info[['service_id', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday']].drop_duplicates())
print()

# Get stop times for these trips
stop_times_539 = stop_times[stop_times['trip_id'].isin(trips_539['trip_id'])]
print(f"Total stop time entries: {len(stop_times_539)}")
print()

# Pick a representative stop (let's use the first stop of the route)
first_stops = stop_times_539[stop_times_539['stop_sequence'] == 1]
print(f"Trips starting from first stops: {len(first_stops)}")
print()

# Analyze one direction (Z_4628 - Engativá)
trips_engativa = trips_539[trips_539['route_id'] == 'Z_4628']
stop_times_engativa = stop_times_539[stop_times_539['trip_id'].isin(trips_engativa['trip_id'])]

# Get the first stop of this direction
first_stop_engativa = stop_times_engativa[stop_times_engativa['stop_sequence'] == 1].copy()

# Convert times to datetime for analysis
def time_to_minutes(time_str):
    """Convert HH:MM:SS to minutes since midnight"""
    parts = time_str.split(':')
    hours = int(parts[0])
    minutes = int(parts[1])
    seconds = int(parts[2])
    return hours * 60 + minutes + seconds / 60

first_stop_engativa['departure_minutes'] = first_stop_engativa['departure_time'].apply(time_to_minutes)
first_stop_engativa = first_stop_engativa.sort_values('departure_minutes')

print(f"\n539 Engativá - First stop departures:")
print(first_stop_engativa[['trip_id', 'departure_time', 'stop_id']].head(20))

# Calculate headways
if len(first_stop_engativa) > 1:
    departures_sorted = sorted(first_stop_engativa['departure_minutes'].values)
    headways = [departures_sorted[i+1] - departures_sorted[i] for i in range(len(departures_sorted)-1)]
    
    print(f"\n\nHeadway Statistics for Route 539 Engativá:")
    print(f"Number of trips: {len(first_stop_engativa)}")
    print(f"First departure: {first_stop_engativa.iloc[0]['departure_time']}")
    print(f"Last departure: {first_stop_engativa.iloc[-1]['departure_time']}")
    print(f"Average headway: {sum(headways)/len(headways):.1f} minutes")
    print(f"Min headway: {min(headways):.1f} minutes")
    print(f"Max headway: {max(headways):.1f} minutes")
    
    # Analyze by time of day
    print("\n\nHeadways by time period:")
    
    # Morning rush (6-9 AM)
    morning_trips = first_stop_engativa[(first_stop_engativa['departure_minutes'] >= 6*60) & 
                                         (first_stop_engativa['departure_minutes'] < 9*60)]
    if len(morning_trips) > 1:
        morning_deps = sorted(morning_trips['departure_minutes'].values)
        morning_headways = [morning_deps[i+1] - morning_deps[i] for i in range(len(morning_deps)-1)]
        print(f"Morning (6-9 AM): {len(morning_trips)} trips, avg headway {sum(morning_headways)/len(morning_headways):.1f} min")
    
    # Midday (9 AM - 4 PM)
    midday_trips = first_stop_engativa[(first_stop_engativa['departure_minutes'] >= 9*60) & 
                                        (first_stop_engativa['departure_minutes'] < 16*60)]
    if len(midday_trips) > 1:
        midday_deps = sorted(midday_trips['departure_minutes'].values)
        midday_headways = [midday_deps[i+1] - midday_deps[i] for i in range(len(midday_deps)-1)]
        print(f"Midday (9 AM-4 PM): {len(midday_trips)} trips, avg headway {sum(midday_headways)/len(midday_headways):.1f} min")
    
    # Evening rush (4-7 PM)
    evening_trips = first_stop_engativa[(first_stop_engativa['departure_minutes'] >= 16*60) & 
                                         (first_stop_engativa['departure_minutes'] < 19*60)]
    if len(evening_trips) > 1:
        evening_deps = sorted(evening_trips['departure_minutes'].values)
        evening_headways = [evening_deps[i+1] - evening_deps[i] for i in range(len(evening_deps)-1)]
        print(f"Evening (4-7 PM): {len(evening_trips)} trips, avg headway {sum(evening_headways)/len(evening_headways):.1f} min")
    
    # Hour-by-hour breakdown
    print("\n\nHour-by-hour frequency analysis:")
    print("Hour      | Trips | Avg Headway | Buses/Hour")
    print("-" * 50)
    
    for hour in range(4, 24):
        hour_trips = first_stop_engativa[(first_stop_engativa['departure_minutes'] >= hour*60) & 
                                          (first_stop_engativa['departure_minutes'] < (hour+1)*60)]
        if len(hour_trips) > 1:
            hour_deps = sorted(hour_trips['departure_minutes'].values)
            hour_headways = [hour_deps[i+1] - hour_deps[i] for i in range(len(hour_deps)-1)]
            avg_headway = sum(hour_headways) / len(hour_headways)
            buses_per_hour = 60 / avg_headway if avg_headway > 0 else 0
            time_label = f"{hour:02d}:00-{hour+1:02d}:00"
            print(f"{time_label:10} | {len(hour_trips):5} | {avg_headway:11.1f} | {buses_per_hour:10.1f}")
        elif len(hour_trips) == 1:
            time_label = f"{hour:02d}:00-{hour+1:02d}:00"
            print(f"{time_label:10} | {len(hour_trips):5} | {'N/A':>11} | {'N/A':>10}")
