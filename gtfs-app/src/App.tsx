import { useState, useEffect, useMemo, useRef, useCallback } from 'react';
import maplibregl from 'maplibre-gl';
import 'maplibre-gl/dist/maplibre-gl.css';
import './App.css';
import { sanitizeRouteId } from './utils';
import { useDebounce } from './hooks';
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

function App() {
    const [routes, setRoutes] = useState<RouteMeta[]>([]);
    const [filter, setFilter] = useState('');
    const [selectedRouteIds, setSelectedRouteIds] = useState<Set<string>>(new Set());

    const [isAllServicesExpanded, setIsAllServicesExpanded] = useState<boolean>(false);
    const [markerLocation, setMarkerLocation] = useState<{ lng: number, lat: number } | null>(null);
    const [sidebarHoveredId, setSidebarHoveredId] = useState<string | null>(null);

    const [theme, setTheme] = useState<Theme>(() => {
        const saved = localStorage.getItem('theme');
        return (saved === 'light' || saved === 'dark') ? saved : 'light';
    });
    const [lang, setLang] = useState<Language>(() => {
        const saved = localStorage.getItem('language');
        return (saved === 'es' || saved === 'en') ? saved : 'es';
    });

    const [isLoading, setIsLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [showAbout, setShowAbout] = useState(false);
    const [showInstructions, setShowInstructions] = useState(true);
    const [showToast, setShowToast] = useState(false);

    const debouncedFilter = useDebounce(filter, 300);

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

    // Map Style Update
    useEffect(() => {
        if (!map.current) return;
        const styleUrl = MAP_STYLES[theme];
        map.current.setStyle(styleUrl);
    }, [theme]);

    const addRouteLayers = () => {
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
                'line-color': ['get', 'route_color'],
                'line-width': 2,
                'line-opacity': 0.3
            }
        });

        updatePaintProperties();
    };

    const updatePaintProperties = useCallback(() => {
        if (!map.current || !map.current.getLayer('routes-layer')) return;

        const selectedIds = Array.from(selectedRouteIdsRef.current);
        const hasSelection = selectedIds.length > 0;
        const hasHover = isHoveringRef.current;
        const hasMarker = isMarkerActiveRef.current;
        const sidebarHoverId = sidebarHoveredIdRef.current;
        const isFocused = hasMarker || hasSelection || hasHover;

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

        const widthExpression: any = [
            'case',
            ['boolean', ['feature-state', 'hover'], false], 4,
            ['in', ['get', 'route_id'], ['literal', selectedIds]], 4,
            2
        ];
        map.current.setPaintProperty('routes-layer', 'line-width', widthExpression);

        if (hasSelection) {
            const selectedMeta = routesRef.current.filter(r => selectedRouteIdsRef.current.has(r.route_id));
            const uniqueShortNames = Array.from(new Set(selectedMeta.map(r => r.route_short_name)));
            const matchExpression: any = ['match', ['get', 'route_id']];

            selectedMeta.forEach(route => {
                const colorIndex = uniqueShortNames.indexOf(route.route_short_name);
                const color = SELECTION_COLORS[colorIndex % SELECTION_COLORS.length];
                matchExpression.push(route.route_id);
                matchExpression.push(color);
            });
            matchExpression.push(['get', 'route_color']);
            map.current.setPaintProperty('routes-layer', 'line-color', matchExpression);
        } else {
            map.current.setPaintProperty('routes-layer', 'line-color', ['get', 'route_color']);
        }

        const sortExpression: any = [
            'case',
            ['==', ['get', 'route_id'], sidebarHoverId || ''], 1000,
            ['boolean', ['feature-state', 'hover'], false], 900,
            ['in', ['get', 'route_id'], ['literal', selectedIds]], 500,
            0
        ];
        map.current.setLayoutProperty('routes-layer', 'line-sort-key', sortExpression);
    }, []);

    useEffect(() => {
        selectedRouteIdsRef.current = selectedRouteIds;
        updatePaintProperties();
    }, [selectedRouteIds]);

    useEffect(() => {
        sidebarHoveredIdRef.current = sidebarHoveredId;
        updatePaintProperties();
    }, [sidebarHoveredId]);

    useEffect(() => {
        isMarkerActiveRef.current = !!markerLocation;
        if (markerLocation) {
            setIsAllServicesExpanded(false);
            if (!markerRef.current) {
                if (map.current) {
                    markerRef.current = new maplibregl.Marker()
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
    }, [markerLocation]);

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

            // Collapse instructions on any selection
            if (newSelection.size > 0) {
                setShowInstructions(false);
            }

            // Show toast if no routes found
            if (newSelection.size === 0) {
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
        setMarkerLocation(null);
        setSidebarHoveredId(null);
        // Collapse instructions when user selects a route
        setShowInstructions(false);
        // Logic for Sidebar Selection:
        // Always collapse "All Services" to focus on "Selected Routes" section which will appear
        setIsAllServicesExpanded(false);

        if (selectedRouteIds.has(routeId) && selectedRouteIds.size === 1) {
            setSelectedRouteIds(new Set());
        } else {
            setSelectedRouteIds(new Set([routeId]));
        }
    };

    const clearSelection = () => {
        setMarkerLocation(null);
        setSidebarHoveredId(null);
        setSelectedRouteIds(new Set());
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

    const selectedRoutesList = useMemo(() => {
        return routes
            .filter(r => selectedRouteIds.has(r.route_id))
            .sort((a, b) =>
                a.route_short_name.localeCompare(b.route_short_name, undefined, { numeric: true, sensitivity: 'base' })
            );
    }, [routes, selectedRouteIds]);

    const uniqueSelectedShortNames = useMemo(() => {
        return Array.from(new Set(selectedRoutesList.map(r => r.route_short_name)));
    }, [selectedRoutesList]);

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
                onMouseEnter={() => setSidebarHoveredId(route.route_id)}
                onMouseLeave={() => setSidebarHoveredId(null)}
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

    return (
        <div className="app-container">
            <div className="sidebar">
                <div className="sidebar-header">
                    <img src={`${import.meta.env.BASE_URL}PDP_logo.png`} alt="¿Por Dónde Pasa?" className="logo" />
                </div>
                <div className="instructions-section">
                    <div
                        className="instructions-header"
                        onClick={() => setShowInstructions(!showInstructions)}
                        role="button"
                        tabIndex={0}
                        onKeyDown={(e) => {
                            if (e.key === 'Enter' || e.key === ' ') {
                                e.preventDefault();
                                setShowInstructions(!showInstructions);
                            }
                        }}
                        aria-expanded={showInstructions}
                    >
                        <h3>{t.introduction}</h3>
                        <span>{showInstructions ? '▲' : '▼'}</span>
                    </div>
                    {showInstructions && (
                        <div className="instructions-content">
                            <p className="instructions-narrative" dangerouslySetInnerHTML={{
                                __html: t.narrative.replace(/^['\u00bf]([^'\u00bf?]+)[?']/, "<em>'$1?'</em>")
                            }} />
                            <p className="instructions-label"><strong>{t.howToUseLabel}</strong></p>
                            <ul className="instructions-list">
                                <li>{t.instruction1}</li>
                                <li>{t.instruction2}</li>
                                <li>{t.instruction3}</li>
                            </ul>
                        </div>
                    )}
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

                {/* Section: All Services */}
                <div
                    className="section-header"
                    onClick={() => {
                        setIsAllServicesExpanded(!isAllServicesExpanded);
                        setShowInstructions(false);
                    }}
                    role="button"
                    tabIndex={0}
                    onKeyDown={(e) => {
                        if (e.key === 'Enter' || e.key === ' ') {
                            e.preventDefault();
                            setIsAllServicesExpanded(!isAllServicesExpanded);
                            setShowInstructions(false);
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

                {/* Controls Container */}
                <div style={{ position: 'absolute', top: '20px', right: '60px', zIndex: 1000, display: 'flex', gap: '10px' }}>
                    <button
                        className="theme-button"
                        style={{ position: 'static' }}
                        onClick={() => setLang(lang === 'es' ? 'en' : 'es')}
                        aria-label={`Switch to ${lang === 'es' ? 'English' : 'Spanish'}`}
                    >
                        {t.langLabel}
                    </button>
                    <button
                        className="theme-button"
                        style={{ position: 'static' }}
                        onClick={() => setTheme(theme === 'light' ? 'dark' : 'light')}
                        aria-label={theme === 'light' ? 'Switch to dark mode' : 'Switch to light mode'}
                    >
                        {theme === 'light' ? '🌙' : '☀️'}
                    </button>
                </div>

                {/* Toast Notification */}
                {showToast && (
                    <div className="toast-notification">
                        {t.noRoutesAtLocation}
                    </div>
                )}

                {/* Dynamic Legend */}
                {selectedRouteIds.size > 0 && (
                    <div className="map-legend">
                        <div className="legend-title">{t.legendTitle}</div>
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
                                <p>{t.aboutDescription}</p>
                                <p><strong dangerouslySetInnerHTML={{
                                    __html: t.aboutCreator.replace(/\[([^\]]+)\]\(([^)]+)\)/g, '<a href="$2" target="_blank" rel="noopener noreferrer">$1</a>')
                                }} /></p>
                                <div className="modal-links">
                                    <a
                                        href="https://github.com/juanfonsecaLS1/gtfs-app"
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
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}

export default App;