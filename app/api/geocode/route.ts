import { NextRequest, NextResponse } from 'next/server';

// Module-level geocode cache (persists across requests in same server process)
const geocodeCache = new Map<string, { lat: number; lng: number }>();

function withTimeout<T>(promise: Promise<T>, ms: number): Promise<T | null> {
    return Promise.race([
        promise,
        new Promise<null>(resolve => setTimeout(() => resolve(null), ms))
    ]) as Promise<T | null>;
}

async function geocodePDOK(address: string): Promise<{ lat: number; lng: number } | null> {
    try {
        const cleaned = address.replace(/, Nederland/g, '').replace(/,/g, ' ');
        const url = `https://api.pdok.nl/bzk/locatieserver/search/v3_1/free?q=${encodeURIComponent(cleaned)}&fl=centroide_ll&rows=1`;
        const res = await fetch(url);
        const data = await res.json();
        if (data?.response?.docs?.length > 0) {
            const match = data.response.docs[0].centroide_ll.match(/POINT\(([\d.]+) ([\d.]+)\)/);
            if (match) return { lat: parseFloat(match[2]), lng: parseFloat(match[1]) };
        }
    } catch { /* ignore */ }
    return null;
}

async function geocodePhoton(address: string): Promise<{ lat: number; lng: number } | null> {
    try {
        const cleaned = address.replace(/, Nederland/g, '');
        const url = `https://photon.komoot.io/api/?q=${encodeURIComponent(cleaned)}&limit=1&lat=52.1&lon=5.3&lang=nl`;
        const res = await fetch(url);
        const data = await res.json();
        if (data?.features?.length > 0) {
            const [lng, lat] = data.features[0].geometry.coordinates;
            return { lat, lng };
        }
    } catch { /* ignore */ }
    return null;
}

async function geocodeNominatim(address: string): Promise<{ lat: number; lng: number } | null> {
    try {
        const url = `https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(address)}&countrycodes=nl&limit=1`;
        const res = await fetch(url, { headers: { 'User-Agent': 'VrachtwagenBV-RoutePlanner/1.0' } });
        const data = await res.json();
        if (data?.length > 0) return { lat: parseFloat(data[0].lat), lng: parseFloat(data[0].lon) };
    } catch { /* ignore */ }
    return null;
}

async function geocodeAddress(address: string): Promise<{ lat: number; lng: number } | null> {
    if (geocodeCache.has(address)) return geocodeCache.get(address)!;

    // Race PDOK vs Photon using Promise.any — resolves on first NON-null result
    // Promise.any ignores rejections unless ALL reject (unlike Promise.race)
    const toNonNull = (p: Promise<{ lat: number; lng: number } | null>) =>
        p.then(r => { if (!r) throw new Error('no result'); return r; });

    const coords = await Promise.any([
        withTimeout(toNonNull(geocodePDOK(address)), 3000),
        withTimeout(toNonNull(geocodePhoton(address)), 3000),
    ]).catch(() => null);

    if (coords) {
        geocodeCache.set(address, coords);
        return coords;
    }

    // Last resort: Nominatim (only if both PDOK and Photon failed)
    const nominatim = await withTimeout(geocodeNominatim(address), 4000);
    if (nominatim) geocodeCache.set(address, nominatim);
    return nominatim;
}

export async function POST(req: NextRequest) {
    try {
        const body = await req.json();
        const addresses: string[] = body.addresses || [];

        // Deduplicate
        const unique = [...new Set(addresses)];

        // Geocode in batches of 20 to avoid overwhelming APIs
        const BATCH = 20;
        const result: Record<string, { lat: number; lng: number } | null> = {};

        for (let i = 0; i < unique.length; i += BATCH) {
            const batch = unique.slice(i, i + BATCH);
            const entries = await Promise.all(batch.map(async (addr) => {
                const coords = await geocodeAddress(addr);
                return [addr, coords] as [string, { lat: number; lng: number } | null];
            }));
            for (const [addr, coords] of entries) {
                result[addr] = coords;
            }
        }

        return NextResponse.json({ coords: result });
    } catch (e: any) {
        return NextResponse.json({ error: e.message }, { status: 500 });
    }
}
