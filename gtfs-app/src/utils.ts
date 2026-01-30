export function sanitizeRouteId(routeId: string): string {
    return routeId.replace(/[^a-zA-Z0-9\-_]/g, '');
}
