// Map Configuration
export const BOGOTA_BOUNDS: [[number, number], [number, number]] = [
    [-74.45, 4.2], // Southwest
    [-73.7, 4.9]   // Northeast
];

export const BOGOTA_CENTER: [number, number] = [-74.0721, 4.7110];
export const DEFAULT_ZOOM = 11;
export const MIN_ZOOM = 10;
export const BUFFER_PIXELS = 5;

// Color Configuration
export const SELECTION_COLORS = [
    '#e41a1c', '#377eb8', '#4daf4a', '#984ea3', '#ff7f00', '#ffff33', '#a65628', '#f781bf', '#999999'
] as const;

// Map Styles
export const MAP_STYLES = {
    light: 'https://basemaps.cartocdn.com/gl/positron-gl-style/style.json',
    dark: 'https://basemaps.cartocdn.com/gl/dark-matter-gl-style/style.json'
} as const;

// Translations
export const TRANSLATIONS = {
    es: {
        title: "¿Por dónde pasa?",
        allServices: "Todos los servicios",
        selectedRoutes: "Rutas seleccionadas",
        searchPlaceholder: "Buscar rutas...",
        noRoutesFound: "No se encontraron rutas aquí.",
        clearSelection: "Borrar selección",
        legendTitle: "Rutas",
        lightMode: "Modo Claro ☀️",
        darkMode: "Modo Oscuro 🌙",
        langLabel: "EN",
        loading: "Cargando...",
        error: "Error al cargar los datos",
        noResults: "No se encontraron rutas",
        howToUse: "Cómo usar",
        instruction1: "Haz clic en el mapa para ver qué rutas pasan por ese punto",
        instruction2: "Selecciona rutas de la lista para verlas en el mapa",
        instruction3: "Usa la búsqueda para encontrar rutas específicas",
        aboutButton: "Acerca de",
        aboutTitle: "Acerca de esta aplicación",
        aboutDescription: "Esta aplicación fue creada para visualizar las rutas del sistema de transporte público TRANSMILENIO de Bogotá, Colombia. Permite a los usuarios explorar de manera interactiva las rutas disponibles y entender mejor la cobertura del sistema.",
        aboutCreator: "Desarrollado con React, MapLibre GL y datos GTFS del sistema TRANSMILENIO.",
        aboutPurpose: "El propósito es proporcionar una herramienta simple e intuitiva para que ciudadanos y visitantes puedan planificar sus viajes y entender el sistema de transporte público.",
        closeButton: "Cerrar"
    },
    en: {
        title: "Where does it go?",
        allServices: "All Services",
        selectedRoutes: "Selected Routes",
        searchPlaceholder: "Search routes...",
        noRoutesFound: "No routes found here.",
        clearSelection: "Clear Selection",
        legendTitle: "Routes",
        lightMode: "Light Mode ☀️",
        darkMode: "Dark Mode 🌙",
        langLabel: "ES",
        loading: "Loading...",
        error: "Error loading data",
        noResults: "No routes found",
        howToUse: "How to Use",
        instruction1: "Click on the map to see which routes pass through that point",
        instruction2: "Select routes from the list to view them on the map",
        instruction3: "Use the search to find specific routes",
        aboutButton: "About",
        aboutTitle: "About this Application",
        aboutDescription: "This application was created to visualize the routes of the TRANSMILENIO public transport system in Bogotá, Colombia. It allows users to interactively explore available routes and better understand the system's coverage.",
        aboutCreator: "Developed with React, MapLibre GL, and GTFS data from the TRANSMILENIO system.",
        aboutPurpose: "The purpose is to provide a simple and intuitive tool for citizens and visitors to plan their trips and understand the public transport system.",
        closeButton: "Close"
    }
} as const;

export type Language = keyof typeof TRANSLATIONS;
export type Theme = keyof typeof MAP_STYLES;
