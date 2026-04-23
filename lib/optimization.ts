import { Address } from '@/types';
import { REGIONS } from './regions';

// Haversine distance between two coordinates (km)
function haversine(lat1: number, lng1: number, lat2: number, lng2: number): number {
    const R = 6371;
    const dLat = (lat2 - lat1) * Math.PI / 180;
    const dLng = (lng2 - lng1) * Math.PI / 180;
    const a = Math.sin(dLat / 2) ** 2 +
        Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) * Math.sin(dLng / 2) ** 2;
    return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

// Nearest-neighbor TSP heuristic — O(n²), instant for typical route sizes
function nearestNeighborSort(
    start: { lat: number; lng: number },
    points: Address[]
): Address[] {
    const remaining = [...points];
    const ordered: Address[] = [];
    let current = start;

    while (remaining.length > 0) {
        let nearestIdx = 0;
        let nearestDist = Infinity;
        for (let i = 0; i < remaining.length; i++) {
            const dist = haversine(current.lat, current.lng, remaining[i].lat!, remaining[i].lng!);
            if (dist < nearestDist) {
                nearestDist = dist;
                nearestIdx = i;
            }
        }
        ordered.push(remaining[nearestIdx]);
        current = { lat: remaining[nearestIdx].lat!, lng: remaining[nearestIdx].lng! };
        remaining.splice(nearestIdx, 1);
    }

    return ordered;
}

export class RouteOptimizer {

    static async optimizeRoute(
        startRegion: keyof typeof REGIONS,
        addresses: Address[],
        _credentials?: { username: string; password: string },
        customStartPoint?: { name: string; address: string; lat: number; lng: number }
    ): Promise<{ stops: Address[]; totalDistance: number; totalDuration: number }> {

        const startPoint = customStartPoint || REGIONS[startRegion] || REGIONS.ARNHEM;

        // Filter to only addresses that have coordinates
        const validAddresses = addresses.filter(a => a.lat && a.lng);

        if (validAddresses.length === 0) {
            return {
                stops: [{
                    filiaalnr: 'START', formule: 'START', straat: startPoint.address,
                    postcode: '', plaats: startPoint.name, volledigAdres: startPoint.address,
                    merchandiser: 'SYSTEM', lat: startPoint.lat, lng: startPoint.lng
                }],
                totalDistance: 0,
                totalDuration: 0
            };
        }

        // Step 1: Sort addresses using nearest-neighbor heuristic (instant, no API needed)
        const sorted = nearestNeighborSort(startPoint, validAddresses);

        // Step 2: Build full stop list with start/end
        const startStop: Address = {
            filiaalnr: 'START', formule: 'START', straat: startPoint.address,
            postcode: '', plaats: startPoint.name, volledigAdres: startPoint.address,
            merchandiser: 'SYSTEM', lat: startPoint.lat, lng: startPoint.lng
        };
        const endStop: Address = {
            filiaalnr: 'START', formule: 'EINDE', straat: startPoint.address,
            postcode: '', plaats: startPoint.name, volledigAdres: startPoint.address,
            merchandiser: 'SYSTEM', lat: startPoint.lat, lng: startPoint.lng
        };

        const allStops = [startStop, ...sorted, endStop];

        // Step 3: Call OSRM Route API (NOT Trip) to get real driving distance & duration
        // Route API is much faster than Trip API — it just calculates distance for given order
        try {
            const coordsString = allStops
                .map(s => `${s.lng},${s.lat}`)
                .join(';');

            const url = `https://router.project-osrm.org/route/v1/driving/${coordsString}?overview=false&steps=false`;
            const res = await fetch(url, { signal: AbortSignal.timeout ? AbortSignal.timeout(5000) : undefined });

            if (res.ok) {
                const data = await res.json();
                if (data.code === 'Ok' && data.routes?.length > 0) {
                    return {
                        stops: allStops,
                        totalDistance: data.routes[0].distance,
                        totalDuration: data.routes[0].duration
                    };
                }
            }
        } catch (e) {
            console.warn('OSRM Route API failed, using haversine estimate:', e);
        }

        // Fallback: estimate distance/duration from haversine if OSRM fails
        let totalDistanceKm = 0;
        for (let i = 0; i < allStops.length - 1; i++) {
            totalDistanceKm += haversine(
                allStops[i].lat!, allStops[i].lng!,
                allStops[i + 1].lat!, allStops[i + 1].lng!
            );
        }
        // Assume avg 50 km/h for driving time estimate
        const totalDurationSec = (totalDistanceKm / 50) * 3600;

        return {
            stops: allStops,
            totalDistance: totalDistanceKm * 1000,
            totalDuration: totalDurationSec
        };
    }
}
