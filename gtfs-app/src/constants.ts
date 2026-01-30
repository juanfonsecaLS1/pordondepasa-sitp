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
        introduction: "Introducción",
        howToUseLabel: "¿Cómo usar?",
        instruction1: "Pasa el cursor sobre el mapa para explorar rutas",
        instruction2: "Haz clic en el mapa para ver qué rutas pasan por una ubicación. Usa el panel lateral para explorar las rutas seleccionadas.",
        instruction3: "Busca rutas específicas en la sección 'Todos los servicios'",
        narrative: "'¿Por dónde pasa?' es una pregunta común para quienes usan los buses en Bogotá. Esta herramienta fue creada para tratar de responder esa pregunta.",
        aboutButton: "Acerca de",
        aboutTitle: "Acerca de esta aplicación",
        aboutDescription: "Esta aplicación permite explorar de manera interactiva las rutas del SITP de Bogotá, Colombia, de forma simple e intuitiva (¡ojalá!) para que ciudadanos y visitantes logremos entender mejor el sistema de transporte público.",
        aboutCreator: "Creado por Juan Fonseca con ayuda de Gemini, usando datos del sistema [TRANSMILENIO](https://datosabiertos-transmilenio.hub.arcgis.com/)",
        githubRepo: "GitHub: [github.com/juanfonsecaLS1/gtfs-app](https://github.com/juanfonsecaLS1/pordondepasa-sitp)",
        githubIssues: "Reportar un problema: [Issues](https://github.com/juanfonsecaLS1/pordondepasa-sitp/issues)",
        closeButton: "Cerrar",
        noRoutesAtLocation: "No se encontraron rutas en esta ubicación"
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
        introduction: "Introduction",
        howToUseLabel: "How to use?",
        instruction1: "Hover over the map to explore routes",
        instruction2: "Click the map to see which routes pass through a location. Use the sidebar to explore selected routes.",
        instruction3: "Search for specific routes in the 'All Services' section",
        narrative: "'Where does it go?' is a common question for bus users in Bogotá. This tool was created as an attempt to answer that question.",
        aboutButton: "About",
        aboutTitle: "About this Application",
        aboutDescription: "This application allows users to interactively explore the routes of the SITP in Bogotá, Colombia, in a simple and intuitive way (hopefully!) so that citizens and visitors can better understand the public transport system.",
        aboutCreator: "Created by Juan Fonseca with the help of Gemini, using data from the [TRANSMILENIO system](https://datosabiertos-transmilenio.hub.arcgis.com/)",
        githubRepo: "GitHub: [github.com/juanfonsecaLS1/gtfs-app](https://github.com/juanfonsecaLS1/pordondepasa-sitp)",
        githubIssues: "Report an issue: [Issues](https://github.com/juanfonsecaLS1/pordondepasa-sitp/issues)",
        closeButton: "Close",
        noRoutesAtLocation: "No routes found at this location"
    }
} as const;

export type Language = keyof typeof TRANSLATIONS;
export type Theme = keyof typeof MAP_STYLES;
