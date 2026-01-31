import json

# Load the stops data
with open('../gtfs-app/public/routes_data/stops_with_routes.json', 'r', encoding='utf-8') as f:
    stops = json.load(f)

# Analyze stop codes vs stop ids
codes = [s['stop_code'] for s in stops if s['stop_code']]
stop_ids = [s['stop_id'] for s in stops]

print(f'Total stops: {len(stops)}')
print(f'Stops with non-empty codes: {len(codes)}')
print(f'Stops with empty codes: {sum(1 for s in stops if not s["stop_code"])}')
print(f'Unique stop codes: {len(set(codes))}')
print(f'Unique stop IDs: {len(set(stop_ids))}')
print(f'\nStop IDs are unique: {len(stop_ids) == len(set(stop_ids))}')
print(f'Stop codes are unique (among non-empty): {len(codes) == len(set(codes))}')

# Check examples of stop_id vs stop_code
print(f'\nExamples:')
for i in range(min(5, len(stops))):
    print(f"  ID: {stops[i]['stop_id']:20} | Code: {stops[i]['stop_code']:10} | Name: {stops[i]['stop_name']}")

# Look for cable stops
cable_stops = [s for s in stops if 'cable' in s['stop_id'].lower()]
if cable_stops:
    print(f'\nCable/special stops ({len(cable_stops)}):')
    for s in cable_stops[:5]:
        print(f"  ID: {s['stop_id']:20} | Code: '{s['stop_code']}' | Name: {s['stop_name']}")
