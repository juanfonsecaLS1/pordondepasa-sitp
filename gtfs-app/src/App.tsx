import { useState, useEffect, useMemo, useRef, useCallback } from 'react';
import maplibregl from 'maplibre-gl';
import 'maplibre-gl/dist/maplibre-gl.css';
import './App.css';
import { sanitizeRouteId } from './utils';
import { useDebounce } from './hooks';
import { parseStopFromURL, updateURLWithStop, clearStopFromURL } from './urlUtils';
import { Chart as ChartJS, CategoryScale, LinearScale, BarElement, Title, Tooltip, Legend } from 'chart.js';
import { Bar } from 'react-chartjs-2';

ChartJS.register(CategoryScale, LinearScale, BarElement, Title, Tooltip, Legend);
import {
    BOGOTA_BOUNDS,
    BOGOTA_CENTER,
    DEFAULT_ZOOM,
    MIN_ZOOM,
    BUFFER_PIXELS,
    SELECTION_COLORS,
    MAP_STYLES,
    TRANSLATIONS,
    type Language,
    type Theme
} from './constants';

// Types
interface RouteMeta {
    route_id: string;
    route_short_name: string;
    route_long_name: string;
    route_color: string;
    route_text_color: string;
}

interface Stop {
    stop_id: string;
    stop_name: string;
    stop_code: string;
    stop_lat: number;
    stop_lon: number;
    routes: RouteMeta[];
    route_count: number;
}

interface HourlyFrequency {
    hour: number;
    trips: number;
    avg_headway_minutes: number;
    buses_per_hour: number;
}

interface RouteFrequency {
    route_id: string;
    route_short_name: string;
    route_long_name: string;
    route_color: string;
    route_text_color: string;
    num_trips: number;
    first_departure: string;
    last_departure: string;
    avg_headway_minutes: number;
    min_headway_minutes: number;
    max_headway_minutes: number;
    hourly_profile: HourlyFrequency[];
}

function App() {
    const [routes, setRoutes] = useState<RouteMeta[]>([]);
    const [stops, setStops] = useState<Stop[]>([]);
    const [frequencies, setFrequencies] = useState<Record<string, RouteFrequency>>({});
    const [filter, setFilter] = useState('');
    const [stopSearch, setStopSearch] = useState('');
    const [selectedRouteIds, setSelectedRouteIds] = useState<Set<string>>(new Set());
    const [, setSelectedStop] = useState<Stop | null>(null);
    const [hoveredFrequencyRoute, setHoveredFrequencyRoute] = useState<string | null>(null);

    const [isAllServicesExpanded, setIsAllServicesExpanded] = useState<boolean>(false);
    const [isRoutesByStopsExpanded, setIsRoutesByStopsExpanded] = useState<boolean>(false);
    const [markerLocation, setMarkerLocation] = useState<{ lng: number, lat: number } | null>(null);
    const [sidebarHoveredId, setSidebarHoveredId] = useState<string | null>(null);

    const [isMobilePanelOpen, setIsMobilePanelOpen] = useState(false);

    const [theme, setTheme] = useState<Theme>(() => {
        const saved = localStorage.getItem('theme');
        return (saved === 'light' || saved === 'dark') ? saved : 'dark';
    });
    const [lang, setLang] = useState<Language>(() => {
        const saved = localStorage.getItem('language');
        return (saved === 'es' || saved === 'en') ? saved : 'es';
    });

    const [isLoading, setIsLoading] = useState(true);
    const [stopsLoading, setStopsLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [showAbout, setShowAbout] = useState(true);
    const [showToast, setShowToast] = useState(false);
    const [toastMessage, setToastMessage] = useState('');
    const [urlLoaded, setUrlLoaded] = useState(false);

    const debouncedFilter = useDebounce(filter, 300);
    const debouncedStopSearch = useDebounce(stopSearch, 300);

    const mapContainer = useRef<HTMLDivElement>(null);
    const map = useRef<maplibregl.Map | null>(null);
    const hoveredStateIds = useRef<Set<string | number>>(new Set());
    const markerRef = useRef<maplibregl.Marker | null>(null);

    // Refs
    const isHoveringRef = useRef<boolean>(false);
    const selectedRouteIdsRef = useRef<Set<string>>(new Set());
    const isMarkerActiveRef = useRef<boolean>(false);
    const sidebarHoveredIdRef = useRef<string | null>(null);
    const routesRef = useRef<RouteMeta[]>([]);
    const themeRef = useRef<'light' | 'dark'>('light');

    const t = TRANSLATIONS[lang];

    useEffect(() => { routesRef.current = routes; }, [routes]);
    useEffect(() => { themeRef.current = theme; }, [theme]);

    // Persist theme and language preferences
    useEffect(() => {
        localStorage.setItem('theme', theme);
        document.documentElement.setAttribute('data-theme', theme);
    }, [theme]);

    useEffect(() => {
        localStorage.setItem('language', lang);
    }, [lang]);

    const resetMapHover = useCallback(() => {
        if (!map.current) return;
        hoveredStateIds.current.forEach(id => {
            map.current?.setFeatureState({ source: 'all-routes', id: id }, { hover: false });
        });
        hoveredStateIds.current.clear();
        isHoveringRef.current = false;
    }, []);

    const updatePaintProperties = useCallback(() => {
        if (!map.current || !map.current.getLayer('routes-layer')) return;

        const selectedIds = Array.from(selectedRouteIdsRef.current);
        const hasSelection = selectedIds.length > 0;
        const hasHover = isHoveringRef.current;
        const hasMarker = isMarkerActiveRef.current;
        const sidebarHoverId = sidebarHoveredIdRef.current;
        const isFocused = hasMarker || hasSelection || hasHover;

        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        let opacityExpression: any;
        if (sidebarHoverId) {
            opacityExpression = [
                'case',
                ['==', ['get', 'route_id'], sidebarHoverId], 1.0,
                ['in', ['get', 'route_id'], ['literal', selectedIds]], 0.1,
                0.0
            ];
        } else {
            opacityExpression = [
                'case',
                ['boolean', ['feature-state', 'hover'], false], 0.7,
                ['in', ['get', 'route_id'], ['literal', selectedIds]], 0.7,
                isFocused ? 0.0 : 0.3
            ];
        }
        map.current.setPaintProperty('routes-layer', 'line-opacity', opacityExpression);

        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const widthExpression: any = [
            'case',
            ['boolean', ['feature-state', 'hover'], false], 4,
            ['in', ['get', 'route_id'], ['literal', selectedIds]], 4,
            2
        ];
        map.current.setPaintProperty('routes-layer', 'line-width', widthExpression);

        if (hasSelection) {
            const selectedMeta = routesRef.current.filter(r => selectedRouteIdsRef.current.has(r.route_id));
            // Sort to match the order used in sidebar and legend
            const sortedUniqueShortNames = Array.from(
                new Set(
                    selectedMeta
                        .map(r => r.route_short_name)
                        .sort((a, b) => a.localeCompare(b, undefined, { numeric: true, sensitivity: 'base' }))
                )
            );
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            const matchExpression: any = ['match', ['get', 'route_id']];

            selectedMeta.forEach(route => {
                const colorIndex = sortedUniqueShortNames.indexOf(route.route_short_name);
                const color = SELECTION_COLORS[colorIndex % SELECTION_COLORS.length];
                matchExpression.push(route.route_id);
                matchExpression.push(color);
            });
            matchExpression.push('#1e90ff');
            map.current.setPaintProperty('routes-layer', 'line-color', matchExpression);
        } else {
            map.current.setPaintProperty('routes-layer', 'line-color', '#1e90ff');
        }

        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const sortExpression: any = [
            'case',
            ['==', ['get', 'route_id'], sidebarHoverId || ''], 1000,
            ['in', ['get', 'route_id'], ['literal', selectedIds]], 500,
            0
        ];
        map.current.setLayoutProperty('routes-layer', 'line-sort-key', sortExpression);
    }, []);

    const addRouteLayers = useCallback(() => {
        if (!map.current) return;
        if (map.current.getSource('all-routes')) return;

        map.current.addSource('all-routes', {
            type: 'geojson',
            data: `${import.meta.env.BASE_URL}routes_data/all_routes.geojson`,
            promoteId: 'shape_id'
        });
        map.current.addLayer({
            id: 'routes-layer',
            type: 'line',
            source: 'all-routes',
            layout: {
                'line-join': 'round',
                'line-cap': 'round',
                'line-sort-key': 0
            },
            paint: {
                'line-color': '#1e90ff',
                'line-width': 2,
                'line-opacity': 0.3
            }
        });

        updatePaintProperties();
    }, [updatePaintProperties]);

    // Map Style Update
    useEffect(() => {
        if (!map.current) return;
        const styleUrl = MAP_STYLES[theme];
        map.current.setStyle(styleUrl);

        // Re-add route layers when style changes
        map.current.once('style.load', () => {
            addRouteLayers();
        });
    }, [theme, addRouteLayers]);

    useEffect(() => {
        selectedRouteIdsRef.current = selectedRouteIds;
        updatePaintProperties();
    }, [selectedRouteIds, updatePaintProperties]);

    useEffect(() => {
        sidebarHoveredIdRef.current = sidebarHoveredId;
        updatePaintProperties();
    }, [sidebarHoveredId, updatePaintProperties]);

    useEffect(() => {
        isMarkerActiveRef.current = !!markerLocation;
        if (markerLocation) {
            setIsAllServicesExpanded(false);
            if (!markerRef.current) {
                if (map.current) {
                    // Create a custom marker element using an img tag for better quality
                    const el = document.createElement('div');
                    el.className = 'custom-marker';
                    el.style.width = '40px';
                    el.style.height = '48px';
                    el.style.cursor = 'pointer';

                    const img = document.createElement('img');
                    img.src = `${import.meta.env.BASE_URL}map_marker.png`;
                    img.style.width = '100%';
                    img.style.height = '100%';
                    img.style.objectFit = 'contain';
                    img.style.imageRendering = 'high-quality';
                    el.appendChild(img);

                    markerRef.current = new maplibregl.Marker({ element: el, anchor: 'bottom' })
                        .setLngLat(markerLocation)
                        .addTo(map.current);
                }
            } else {
                markerRef.current.setLngLat(markerLocation);
            }
        } else {
            if (markerRef.current) {
                markerRef.current.remove();
                markerRef.current = null;
            }
        }
        updatePaintProperties();
    }, [markerLocation, updatePaintProperties]);

    // Load stop from URL parameters on initial load
    useEffect(() => {
        if (urlLoaded || !map.current || stops.length === 0) return;

        const stopCode = parseStopFromURL();
        if (!stopCode) return;

        // Find stop by code (case-insensitive)
        const stop = stops.find(s => s.stop_code.toUpperCase() === stopCode.toUpperCase());
        if (!stop) {
            console.warn(`Stop with code ${stopCode} not found`);
            setUrlLoaded(true);
            return;
        }

        // Wait for map to be fully loaded
        const loadFromURL = () => {
            if (!map.current || !map.current.getLayer('routes-layer')) return;

            // Set selected stop
            setSelectedStop(stop);
            setMarkerLocation({ lng: stop.stop_lon, lat: stop.stop_lat });

            // Select routes from stop
            const routeIds = new Set(stop.routes.map(r => r.route_id));
            setSelectedRouteIds(routeIds);

            // Zoom to stop location
            map.current.flyTo({
                center: [stop.stop_lon, stop.stop_lat],
                zoom: 15,
                duration: 1500
            });

            // Close about modal if opened from URL
            setShowAbout(false);
            setUrlLoaded(true);
        };

        // Check if map is ready
        if (map.current.isStyleLoaded() && map.current.getLayer('routes-layer')) {
            loadFromURL();
        } else {
            // Wait for style to load
            map.current.once('idle', loadFromURL);
        }
    }, [stops, urlLoaded]);

    useEffect(() => {
        if (map.current) return;
        if (!mapContainer.current) return;

        map.current = new maplibregl.Map({
            container: mapContainer.current,
            style: MAP_STYLES[theme],
            center: BOGOTA_CENTER,
            zoom: DEFAULT_ZOOM,
            minZoom: MIN_ZOOM,
            maxBounds: BOGOTA_BOUNDS
        });

        map.current.addControl(new maplibregl.NavigationControl(), 'top-right');

        map.current.on('style.load', () => {
            addRouteLayers();
        });

        map.current.on('click', (e) => {
            if (!map.current) return;

            // Clear stop selection and URL when clicking on map
            setSelectedStop(null);
            clearStopFromURL();

            setMarkerLocation(e.lngLat);
            const point = e.point;
            const bbox: [maplibregl.PointLike, maplibregl.PointLike] = [
                [point.x - BUFFER_PIXELS, point.y - BUFFER_PIXELS],
                [point.x + BUFFER_PIXELS, point.y + BUFFER_PIXELS]
            ];
            const features = map.current.queryRenderedFeatures(bbox, { layers: ['routes-layer'] });
            const newSelection = new Set<string>();
            features.forEach(f => {
                const rid = f.properties.route_id;
                if (rid) newSelection.add(rid);
            });
            setSelectedRouteIds(newSelection);

            // Open mobile panel if route selected
            if (newSelection.size > 0 && window.innerWidth <= 768) {
                setIsMobilePanelOpen(true);
            }

            // Show toast if no routes found
            if (newSelection.size === 0) {
                setToastMessage(t.noRoutesAtLocation);
                setShowToast(true);
                // Auto-dismiss after 3 seconds and clear marker
                setTimeout(() => {
                    setShowToast(false);
                    setMarkerLocation(null);
                }, 3000);
            }
        });

        map.current.on('mousemove', (e) => {
            if (!map.current || !map.current.getLayer('routes-layer')) return;
            const point = e.point;
            const bbox: [maplibregl.PointLike, maplibregl.PointLike] = [
                [point.x - BUFFER_PIXELS, point.y - BUFFER_PIXELS],
                [point.x + BUFFER_PIXELS, point.y + BUFFER_PIXELS]
            ];
            let features = map.current.queryRenderedFeatures(bbox, { layers: ['routes-layer'] });
            if (isMarkerActiveRef.current) {
                features = features.filter(f => selectedRouteIdsRef.current.has(f.properties.route_id));
            }
            const foundIds = new Set<string | number>();
            features.forEach(f => { if (f.id !== undefined) foundIds.add(f.id); });

            hoveredStateIds.current.forEach(id => {
                if (!foundIds.has(id)) map.current?.setFeatureState({ source: 'all-routes', id: id }, { hover: false });
            });
            foundIds.forEach(id => {
                if (!hoveredStateIds.current.has(id)) map.current?.setFeatureState({ source: 'all-routes', id: id }, { hover: true });
            });
            hoveredStateIds.current = foundIds;
            const isHovering = foundIds.size > 0;
            if (isHovering !== isHoveringRef.current) {
                isHoveringRef.current = isHovering;
                updatePaintProperties();
            }
        });

        map.current.on('mouseleave', () => {
            if (!map.current) return;
            hoveredStateIds.current.forEach(id => {
                map.current?.setFeatureState({ source: 'all-routes', id: id }, { hover: false });
            });
            hoveredStateIds.current.clear();
            isHoveringRef.current = false;
            updatePaintProperties();
        });
    }, []);

    useEffect(() => {
        setIsLoading(true);
        setError(null);
        fetch(`${import.meta.env.BASE_URL}routes_data/routes_index.json`)
            .then(res => {
                if (!res.ok) throw new Error('Failed to fetch routes');
                return res.json();
            })
            .then(data => {
                setRoutes(data);
                setIsLoading(false);
            })
            .catch(err => {
                console.error("Failed to load routes index", err);
                setError(t.error);
                setIsLoading(false);
            });
    }, [t.error]);

    // Load stops data
    useEffect(() => {
        setStopsLoading(true);
        fetch(`${import.meta.env.BASE_URL}routes_data/stops_with_routes.json`)
            .then(res => {
                if (!res.ok) throw new Error('Failed to fetch stops');
                return res.json();
            })
            .then(data => {
                setStops(data);
                setStopsLoading(false);
            })
            .catch(err => {
                console.error("Failed to load stops", err);
                setStopsLoading(false);
            });
    }, []);

    // Load frequency data
    useEffect(() => {
        fetch(`${import.meta.env.BASE_URL}routes_data/route_frequencies.json`)
            .then(res => {
                if (!res.ok) throw new Error('Failed to fetch frequencies');
                return res.json();
            })
            .then(data => {
                setFrequencies(data);
            })
            .catch(err => {
                console.error("Failed to load frequencies", err);
            });
    }, []);

    // Zoom logic
    useEffect(() => {
        if (!map.current || markerLocation) return;
        if (selectedRouteIds.size === 1) {
            const routeId = Array.from(selectedRouteIds)[0];
            const safeId = sanitizeRouteId(routeId);
            fetch(`${import.meta.env.BASE_URL}routes_data/${safeId}.json`)
                .then(res => res.json())
                .then(data => {
                    if (map.current && data.features.length > 0) {
                        const bounds = new maplibregl.LngLatBounds();
                        // eslint-disable-next-line @typescript-eslint/no-explicit-any
                        data.features.forEach((feature: any) => {
                            if (feature.geometry.type === 'LineString') {
                                feature.geometry.coordinates.forEach((coord: [number, number]) => { bounds.extend(coord); });
                            }
                        });
                        if (!bounds.isEmpty()) map.current.fitBounds(bounds, { padding: 50 });
                    }
                });
        }
    }, [selectedRouteIds, markerLocation]);

    const handleSidebarSelect = (routeId: string) => {
        resetMapHover();
        setMarkerLocation(null);
        setSidebarHoveredId(null);
        setSelectedStop(null);
        clearStopFromURL();

        // Logic for Sidebar Selection:
        // Always collapse "All Services" to focus on "Selected Routes" section which will appear
        setIsAllServicesExpanded(false);

        if (selectedRouteIds.has(routeId) && selectedRouteIds.size === 1) {
            setSelectedRouteIds(new Set());
            // Clear frequency panel when deselecting the last route
            setHoveredFrequencyRoute(null);
        } else {
            setSelectedRouteIds(new Set([routeId]));
        }
    };

    const clearSelection = () => {
        resetMapHover();
        setMarkerLocation(null);
        setSidebarHoveredId(null);
        setSelectedRouteIds(new Set());
        setSelectedStop(null);
        clearStopFromURL();
        setHoveredFrequencyRoute(null);
    };

    const handleStopSelect = (stop: Stop) => {
        resetMapHover();
        setSelectedStop(stop);
        setMarkerLocation({ lng: stop.stop_lon, lat: stop.stop_lat });

        // Select routes from stop
        const routeIds = new Set(stop.routes.map(r => r.route_id));
        setSelectedRouteIds(routeIds);

        // Update URL
        updateURLWithStop(stop.stop_code);

        // Fly to stop location
        if (map.current) {
            map.current.flyTo({
                center: [stop.stop_lon, stop.stop_lat],
                zoom: 15,
                duration: 1000
            });
        }

        // Collapse Routes by Stops section
        setIsRoutesByStopsExpanded(false);
        setIsAllServicesExpanded(false);
    };



    const filteredRoutes = useMemo(() => {
        const search = debouncedFilter.toLowerCase();
        return routes
            .filter(r =>
                r.route_short_name.toLowerCase().includes(search) ||
                r.route_long_name.toLowerCase().includes(search) ||
                r.route_id.toLowerCase().includes(search)
            )
            .sort((a, b) =>
                a.route_short_name.localeCompare(b.route_short_name, undefined, { numeric: true, sensitivity: 'base' })
            );
    }, [routes, debouncedFilter]);

    const filteredStops = useMemo(() => {
        const search = debouncedStopSearch.trim().toUpperCase();
        if (!search) return [];

        // Case-insensitive matches on stop_code
        return stops
            .filter(s => s.stop_code.toUpperCase().includes(search))
            .slice(0, 10); // Limit to 10 results for autocomplete
    }, [stops, debouncedStopSearch]);

    const selectedRoutesList = useMemo(() => {
        return routes
            .filter(r => selectedRouteIds.has(r.route_id))
            .sort((a, b) =>
                a.route_short_name.localeCompare(b.route_short_name, undefined, { numeric: true, sensitivity: 'base' })
            );
    }, [routes, selectedRouteIds]);

    // Sorted unique short names - used for consistent color assignment across map, sidebar, and legend
    const uniqueSelectedShortNames = useMemo(() => {
        return Array.from(new Set(selectedRoutesList.map(r => r.route_short_name)));
    }, [selectedRoutesList]);

    // Determine which route to show frequency for: Hover takes precedence, then single selection
    const activeFrequencyRouteId = hoveredFrequencyRoute || (selectedRouteIds.size === 1 ? Array.from(selectedRouteIds)[0] : null);

    const renderRouteItem = (route: RouteMeta, isCompact: boolean, showDot: boolean = true) => {
        const isSelected = selectedRouteIds.has(route.route_id);

        let displayColor = route.route_color.startsWith('#') ? route.route_color : `#${route.route_color}`;

        // If actively selected (sidebar OR marker), use group color
        if (isSelected) {
            const colorIndex = uniqueSelectedShortNames.indexOf(route.route_short_name);
            if (colorIndex !== -1) {
                displayColor = SELECTION_COLORS[colorIndex % SELECTION_COLORS.length];
            }
        }

        return (
            <li
                key={route.route_id}
                className={`route-item ${isSelected ? 'selected' : ''} ${isCompact ? 'compact' : ''}`}
                onClick={() => handleSidebarSelect(route.route_id)}
                onMouseEnter={() => {
                    setSidebarHoveredId(route.route_id);
                    // Show frequency panel only if route is selected
                    if (isSelected) {
                        setHoveredFrequencyRoute(route.route_id);
                    }
                }}
                onMouseLeave={() => {
                    setSidebarHoveredId(null);
                    setHoveredFrequencyRoute(null);
                }}
                onKeyDown={(e) => {
                    if (e.key === 'Enter' || e.key === ' ') {
                        e.preventDefault();
                        handleSidebarSelect(route.route_id);
                    }
                }}
                role="button"
                tabIndex={0}
                aria-label={`${route.route_short_name} - ${route.route_long_name}`}
            >
                <div className="route-name">
                    {isCompact ? (
                        <span style={{ fontSize: '0.85rem' }}>
                            <b style={{ marginRight: '6px' }}>{route.route_short_name}</b>
                            -
                            <span style={{ marginLeft: '6px', color: 'var(--text-secondary)' }}>{route.route_long_name}</span>
                        </span>
                    ) : (
                        <b>{route.route_short_name}</b>
                    )}

                    {showDot && (
                        <span
                            className="color-dot"
                            style={{ backgroundColor: displayColor }}
                        />
                    )}
                </div>
                {!isCompact && <div className="route-desc">{route.route_long_name}</div>}
            </li>
        );
    };

    const toggleMobilePanel = useCallback(() => {
        setIsMobilePanelOpen((prev) => {
            const next = !prev;
            if (!next) {
                setIsRoutesByStopsExpanded(false);
                setIsAllServicesExpanded(false);
            }
            return next;
        });
    }, []);

    return (
        <div className="app-container">
            <img
                src={`${import.meta.env.BASE_URL}PDP_logo_mobile.png`}
                alt="¿Por Dónde Pasa?"
                className="mobile-logo"
            />

            <div className={`sidebar ${isMobilePanelOpen ? 'mobile-open' : ''}`}>
                <div
                    className="mobile-drag-handle"
                    onClick={toggleMobilePanel}
                    onTouchEnd={(e) => {
                        e.preventDefault();
                        toggleMobilePanel();
                    }}
                    role="button"
                    aria-label="Toggle menu"
                >
                    <div className="handle-bar" />
                </div>

                <div className="sidebar-header">
                    <img src={`${import.meta.env.BASE_URL}PDP_logo.png`} alt="¿Por Dónde Pasa?" className="logo" />
                </div>

                {/* Section: Selected Routes (Conditional on Selection Existence) */}
                {selectedRoutesList.length > 0 && (
                    <>
                        <div className="section-header" style={{ cursor: 'default', background: '#f0f7ff', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                            <h3 style={{ color: '#333' }}>{t.selectedRoutes} ({selectedRoutesList.length})</h3>
                            <button
                                className="clear-button-inline"
                                onClick={clearSelection}
                                aria-label={t.clearSelection}
                            >
                                {t.clearSelection}
                            </button>
                        </div>
                        <ul className="route-list" style={{ flex: 1, overflowY: 'auto' }}>
                            {selectedRoutesList.map((r) => renderRouteItem(r, true, true))}
                        </ul>
                    </>
                )}

                {/* Section: Routes by Stops */}
                <div
                    className="section-header"
                    onClick={() => {
                        const next = !isRoutesByStopsExpanded;
                        setIsRoutesByStopsExpanded(next);
                        if (next) {
                            setIsMobilePanelOpen(true);
                        }
                    }}
                    role="button"
                    tabIndex={0}
                    onKeyDown={(e) => {
                        if (e.key === 'Enter' || e.key === ' ') {
                            e.preventDefault();
                            const next = !isRoutesByStopsExpanded;
                            setIsRoutesByStopsExpanded(next);
                            if (next) {
                                setIsMobilePanelOpen(true);
                            }
                        }
                    }}
                    aria-expanded={isRoutesByStopsExpanded}
                    aria-label={`${t.routesByStops} section`}
                >
                    <h3>{t.routesByStops}</h3>
                    <span>{isRoutesByStopsExpanded ? '▲' : '▼'}</span>
                </div>
                {isRoutesByStopsExpanded && (
                    <>
                        <div className="search-container">
                            <input
                                type="text"
                                className="search-input"
                                placeholder={t.stopSearchPlaceholder}
                                value={stopSearch}
                                onChange={(e) => setStopSearch(e.target.value)}
                                onClick={(e) => e.stopPropagation()}
                                aria-label={t.stopSearchPlaceholder}
                            />
                        </div>
                        {stopsLoading ? (
                            <div className="loading-container">
                                <div className="loading-spinner" />
                                <span>{t.loading}</span>
                            </div>
                        ) : stopSearch.trim() && filteredStops.length > 0 ? (
                            <ul className="route-list" style={{ maxHeight: '200px', overflowY: 'auto' }}>
                                {filteredStops.map(stop => (
                                    <li
                                        key={stop.stop_id}
                                        className="route-item"
                                        onClick={() => handleStopSelect(stop)}
                                        onKeyDown={(e) => {
                                            if (e.key === 'Enter' || e.key === ' ') {
                                                e.preventDefault();
                                                handleStopSelect(stop);
                                            }
                                        }}
                                        role="button"
                                        tabIndex={0}
                                        aria-label={`Stop ${stop.stop_code} - ${stop.stop_name}`}
                                        style={{ cursor: 'pointer' }}
                                    >
                                        <div className="route-name">
                                            <b>{stop.stop_code}</b>
                                        </div>
                                        <div className="route-desc" style={{ fontSize: '0.85rem' }}>
                                            {stop.stop_name} ({stop.route_count} {t.routes})
                                        </div>
                                    </li>
                                ))}
                            </ul>
                        ) : stopSearch.trim() ? (
                            <div className="empty-state">{t.noStopsFound}</div>
                        ) : (
                            <div className="empty-state" style={{ fontSize: '0.9rem', padding: '10px' }}>
                                {t.stopSearchHint}
                            </div>
                        )}
                    </>
                )}

                {/* Section: All Services */}
                <div
                    className="section-header"
                    onClick={() => {
                        const next = !isAllServicesExpanded;
                        setIsAllServicesExpanded(next);
                        if (next) {
                            setIsMobilePanelOpen(true);
                        }
                    }}
                    role="button"
                    tabIndex={0}
                    onKeyDown={(e) => {
                        if (e.key === 'Enter' || e.key === ' ') {
                            e.preventDefault();
                            const next = !isAllServicesExpanded;
                            setIsAllServicesExpanded(next);
                            if (next) {
                                setIsMobilePanelOpen(true);
                            }
                        }
                    }}
                    aria-expanded={isAllServicesExpanded}
                    aria-label={`${t.allServices} section`}
                >
                    <h3>{t.allServices} ({filteredRoutes.length})</h3>
                    <span>{isAllServicesExpanded ? '▲' : '▼'}</span>
                </div>
                {isAllServicesExpanded && (
                    <>
                        <div className="search-container">
                            <input
                                type="text"
                                className="search-input"
                                placeholder={t.searchPlaceholder}
                                value={filter}
                                onChange={(e) => setFilter(e.target.value)}
                                onClick={(e) => e.stopPropagation()}
                                aria-label={t.searchPlaceholder}
                            />
                        </div>
                        {isLoading ? (
                            <div className="loading-container">
                                <div className="loading-spinner" />
                                <span>{t.loading}</span>
                            </div>
                        ) : error ? (
                            <div className="error-container">
                                <div className="error-message">{error}</div>
                            </div>
                        ) : filteredRoutes.length === 0 ? (
                            <div className="empty-state">{t.noResults}</div>
                        ) : (
                            <ul className="route-list">
                                {filteredRoutes.map(r => renderRouteItem(r, true, false))}
                            </ul>
                        )}
                    </>
                )}

                {/* About Button at Bottom */}
                <div className="sidebar-footer">
                    <button
                        className="about-button"
                        onClick={() => setShowAbout(true)}
                        aria-label={t.aboutButton}
                    >
                        {t.aboutButton}
                    </button>
                </div>
            </div>

            <div className="map-wrapper" style={{ position: 'relative', flex: 1 }}>
                <div className="map-container" ref={mapContainer} />

                {/* Mobile About Button (Below Logo) */}
                <button
                    className="floating-about-btn mobile-left-position"
                    onClick={() => setShowAbout(true)}
                    aria-label={t.aboutButton}
                >
                    ?
                </button>

                {/* Controls Container */}
                <div className="map-controls-group">
                    <button
                        className="theme-button"
                        onClick={() => setLang(lang === 'es' ? 'en' : 'es')}
                        aria-label={`Switch to ${lang === 'es' ? 'English' : 'Spanish'}`}
                    >
                        {lang === 'es' ? 'EN' : 'ES'}
                    </button>
                    <button
                        className="theme-button"
                        onClick={() => setTheme(theme === 'light' ? 'dark' : 'light')}
                        aria-label={theme === 'light' ? 'Switch to dark mode' : 'Switch to light mode'}
                    >
                        {theme === 'light' ? '🌙' : '☀️'}
                    </button>
                </div>

                {/* Toast Notification */}
                {showToast && (
                    <div className="toast-notification">
                        {toastMessage || t.noRoutesAtLocation}
                    </div>
                )}

                {/* Dynamic Legend */}
                {selectedRouteIds.size > 0 && (
                    <div className="map-legend">
                        <div className="legend-title">{t.legendTitle}</div>
                        <div className="legend-items">
                            {uniqueSelectedShortNames.map((code, idx) => (
                                <div key={code} className="legend-item">
                                    <span
                                        className="legend-color"
                                        style={{ backgroundColor: SELECTION_COLORS[idx % SELECTION_COLORS.length] }}
                                    />
                                    <span>{code}</span>
                                </div>
                            ))}
                        </div>
                    </div>
                )}

                {/* Frequency Panel */}
                {activeFrequencyRouteId && frequencies[activeFrequencyRouteId] && (
                    <div className="frequency-panel">
                        {(() => {
                            const freq = frequencies[activeFrequencyRouteId];

                            // Check if route has valid frequency data
                            if (!freq.hourly_profile || freq.hourly_profile.length === 0) {
                                return null;
                            }

                            // Prepare data for Chart.js
                            const chartData = {
                                labels: freq.hourly_profile.map(h => h.hour.toString()),
                                datasets: [
                                    {
                                        data: freq.hourly_profile.map(h => h.buses_per_hour),
                                        backgroundColor: 'rgba(0, 191, 255, 0.7)', // deepskyblue2
                                        borderWidth: 0,
                                        borderRadius: 2,
                                    }
                                ]
                            };

                            const chartOptions = {
                                responsive: true,
                                maintainAspectRatio: false,
                                plugins: {
                                    legend: {
                                        display: false
                                    },
                                    tooltip: {
                                        callbacks: {
                                            // eslint-disable-next-line @typescript-eslint/no-explicit-any
                                            label: (context: any) => {
                                                return `${context.parsed.y.toFixed(1)} buses/hr`;
                                            }
                                        }
                                    }
                                },
                                scales: {
                                    x: {
                                        grid: {
                                            display: false
                                        },
                                        ticks: {
                                            // eslint-disable-next-line @typescript-eslint/no-explicit-any
                                            callback: function (_value: any, index: number) {
                                                const hour = freq.hourly_profile[index]?.hour;
                                                return hour && hour % 4 === 0 ? hour : '';
                                            },
                                            color: theme === 'dark' ? '#9ca3af' : '#6b7280',
                                            font: {
                                                size: 11
                                            }
                                        }
                                    },
                                    y: {
                                        beginAtZero: true,
                                        grid: {
                                            color: theme === 'dark' ? 'rgba(255,255,255,0.1)' : 'rgba(0,0,0,0.1)'
                                        },
                                        ticks: {
                                            color: theme === 'dark' ? '#9ca3af' : '#6b7280',
                                            font: {
                                                size: 11
                                            },
                                            maxTicksLimit: 6
                                        },
                                        afterFit: (scaleInstance: any) => { // eslint-disable-line @typescript-eslint/no-explicit-any
                                            scaleInstance.width = 35;
                                        }
                                    }
                                }
                            };

                            return (
                                <>
                                    <div className="frequency-panel-header">
                                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'start' }}>
                                            <div>
                                                <div className="frequency-panel-title">
                                                    {freq.route_short_name} - {freq.route_long_name}
                                                </div>
                                                <div className="frequency-panel-subtitle">
                                                    {freq.first_departure.slice(0, 5)} - {freq.last_departure.slice(0, 5)}
                                                </div>
                                            </div>
                                            <button
                                                className="frequency-close-btn"
                                                onClick={(e) => {
                                                    e.stopPropagation();
                                                    setHoveredFrequencyRoute(null);
                                                    if (selectedRouteIds.size === 1) {
                                                        setSelectedRouteIds(new Set());
                                                        setMarkerLocation(null);
                                                        clearStopFromURL();
                                                    }
                                                }}
                                                aria-label="Close details"
                                            >
                                                ×
                                            </button>
                                        </div>
                                    </div>

                                    <div className="frequency-stats">
                                        <div className="frequency-stat">
                                            <div className="frequency-stat-label">{t.avgFrequency}</div>
                                            <div className="frequency-stat-value">
                                                {freq.avg_headway_minutes.toFixed(1)}
                                                <span className="frequency-stat-unit"> min</span>
                                            </div>
                                        </div>
                                        <div className="frequency-stat">
                                            <div className="frequency-stat-label">{t.dailyTrips}</div>
                                            <div className="frequency-stat-value">
                                                {freq.num_trips}
                                            </div>
                                        </div>
                                    </div>

                                    <div className="frequency-chart">
                                        <div className="frequency-chart-title">{t.busesPerHour}</div>
                                        <div className="frequency-chart-canvas">
                                            <Bar data={chartData} options={chartOptions} />
                                        </div>
                                    </div>

                                    <div className="frequency-note">
                                        <span className="frequency-note-italic">{t.frequencyNote}</span>
                                    </div>
                                </>
                            );
                        })()}
                    </div>
                )}
            </div>

            {/* About Modal */}
            {showAbout && (
                <div className="modal-overlay" onClick={() => setShowAbout(false)}>
                    <div className="modal-content" onClick={(e) => e.stopPropagation()}>
                        <div className="modal-header">
                            <h2>{t.aboutTitle}</h2>
                            <button
                                className="modal-close"
                                onClick={() => setShowAbout(false)}
                                aria-label={t.closeButton}
                            >
                                ×
                            </button>
                        </div>
                        <div className="modal-body">
                            <div className="modal-logo-column">
                                <img src={`${import.meta.env.BASE_URL}PDP_logo.png`} alt="¿Por Dónde Pasa?" className="modal-logo" />
                            </div>
                            <div className="modal-text-column">
                                <p className="instructions-narrative" dangerouslySetInnerHTML={{
                                    __html: t.narrative.replace(/^['¿]([^'¿?]+)[?']/, "<em>'$1?'</em>")
                                }} />
                                <p>{t.aboutDescription}</p>
                                <p className="instructions-label"><strong>{t.howToUseLabel}</strong></p>
                                <ul className="instructions-list">
                                    <li>{t.instruction1}</li>
                                    <li>{t.instruction2}</li>
                                    <li>{t.instruction3}</li>
                                </ul>
                                <p><strong dangerouslySetInnerHTML={{
                                    __html: t.aboutCreator.replace(/\[([^\]]+)\]\(([^)]+)\)/g, '<a href="$2" target="_blank" rel="noopener noreferrer">$1</a>')
                                }} /></p>
                                <p className="about-metadata">
                                    {t.aboutLicense} • {t.aboutYear}
                                </p>
                                <div className="modal-links">
                                    <a
                                        href="https://github.com/juanfonsecaLS1/pordondepasa-sitp"
                                        target="_blank"
                                        rel="noopener noreferrer"
                                        className="github-link"
                                        aria-label="View on GitHub"
                                    >
                                        <svg height="24" width="24" viewBox="0 0 16 16" fill="currentColor">
                                            <path d="M8 0C3.58 0 0 3.58 0 8c0 3.54 2.29 6.53 5.47 7.59.4.07.55-.17.55-.38 0-.19-.01-.82-.01-1.49-2.01.37-2.53-.49-2.69-.94-.09-.23-.48-.94-.82-1.13-.28-.15-.68-.52-.01-.53.63-.01 1.08.58 1.23.82.72 1.21 1.87.87 2.33.66.07-.52.28-.87.51-1.07-1.78-.2-3.64-.89-3.64-3.95 0-.87.31-1.59.82-2.15-.08-.2-.36-1.02.08-2.12 0 0 .67-.21 2.2.82.64-.18 1.32-.27 2-.27.68 0 1.36.09 2 .27 1.53-1.04 2.2-.82 2.2-.82.44 1.1.16 1.92.08 2.12.51.56.82 1.27.82 2.15 0 3.07-1.87 3.75-3.65 3.95.29.25.54.73.54 1.48 0 1.07-.01 1.93-.01 2.2 0 .21.15.46.55.38A8.013 8.013 0 0016 8c0-4.42-3.58-8-8-8z" />
                                        </svg>
                                    </a>
                                </div>
                            </div>
                        </div>
                        <div className="modal-footer">
                            <span className="modal-footer-link" dangerouslySetInnerHTML={{
                                __html: t.githubIssues.replace(/\[([^\]]+)\]\(([^)]+)\)/, '<a href="$2" target="_blank" rel="noopener noreferrer">$1</a>')
                            }} />
                            <div className="modal-controls">
                                <button
                                    className="modal-control-button"
                                    onClick={() => setLang(lang === 'es' ? 'en' : 'es')}
                                    aria-label={`Switch to ${lang === 'es' ? 'English' : 'Spanish'}`}
                                >
                                    {t.langLabel}
                                </button>
                                <button
                                    className="modal-control-button"
                                    onClick={() => setTheme(theme === 'light' ? 'dark' : 'light')}
                                    aria-label={theme === 'light' ? 'Switch to dark mode' : 'Switch to light mode'}
                                >
                                    {theme === 'light' ? '🌙' : '☀️'}
                                </button>
                            </div>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}

export default App;