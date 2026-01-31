import { BOGOTA_BOUNDS } from './constants';

export interface LocationParams {
    lat: number;
    lng: number;
    routes?: string[];
}

/**
 * Validate if coordinates are within Bogotá bounds
 */
export function isWithinBogotaBounds(lat: number, lng: number): boolean {
    const [[minLng, minLat], [maxLng, maxLat]] = BOGOTA_BOUNDS;
    return lat >= minLat && lat <= maxLat && lng >= minLng && lng <= maxLng;
}

/**
 * Parse location parameters from URL
 */
export function parseLocationFromURL(): LocationParams | null {
    const params = new URLSearchParams(window.location.search);
    const latStr = params.get('lat');
    const lngStr = params.get('lng');

    if (!latStr || !lngStr) {
        return null;
    }

    const lat = parseFloat(latStr);
    const lng = parseFloat(lngStr);

    if (isNaN(lat) || isNaN(lng)) {
        return null;
    }

    if (!isWithinBogotaBounds(lat, lng)) {
        return null;
    }

    const routesStr = params.get('routes');
    const routes = routesStr ? routesStr.split(',').filter(r => r.trim()) : undefined;

    return { lat, lng, routes };
}

/**
 * Generate shareable URL with current location and routes
 */
export function generateShareURL(lat: number, lng: number, routes?: string[]): string {
    const url = new URL(window.location.href);
    url.searchParams.set('lat', lat.toFixed(6));
    url.searchParams.set('lng', lng.toFixed(6));

    if (routes && routes.length > 0) {
        url.searchParams.set('routes', routes.join(','));
    } else {
        url.searchParams.delete('routes');
    }

    return url.toString();
}

/**
 * Copy text to clipboard
 */
export async function copyToClipboard(text: string): Promise<boolean> {
    try {
        await navigator.clipboard.writeText(text);
        return true;
    } catch (err) {
        // Fallback for older browsers
        try {
            const textArea = document.createElement('textarea');
            textArea.value = text;
            textArea.style.position = 'fixed';
            textArea.style.left = '-999999px';
            document.body.appendChild(textArea);
            textArea.focus();
            textArea.select();
            const successful = document.execCommand('copy');
            document.body.removeChild(textArea);
            return successful;
        } catch (fallbackErr) {
            return false;
        }
    }
}
