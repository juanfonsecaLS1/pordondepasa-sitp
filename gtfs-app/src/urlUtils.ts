/**
 * Parse stop code from URL
 */
export function parseStopFromURL(): string | null {
    const params = new URLSearchParams(window.location.search);
    const stopCode = params.get('stop');
    return stopCode ? stopCode.trim() : null;
}

/**
 * Update URL with stop code
 */
export function updateURLWithStop(stopCode: string): void {
    const url = new URL(window.location.href);
    // Normalize to uppercase for consistency
    url.searchParams.set('stop', stopCode.toUpperCase());
    window.history.pushState({}, '', url.toString());
}

/**
 * Clear stop parameter from URL
 */
export function clearStopFromURL(): void {
    const url = new URL(window.location.href);
    url.searchParams.delete('stop');
    window.history.pushState({}, '', url.toString());
}
