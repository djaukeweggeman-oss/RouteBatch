import { NextRequest, NextResponse } from 'next/server';
import { Address, DayRoute } from '@/types';
import { REGIONS } from '@/lib/regions';
import { RouteOptimizer } from '@/lib/optimization';

// RouteXL API credentials - fallback hardcoded values
const ROUTEXL_USERNAME = process.env.ROUTEXL_USERNAME || 'Vrachtwagenbv';
const ROUTEXL_PASSWORD = process.env.ROUTEXL_PASSWORD || 'muhpev-0nawmu-Gaqkis';

// Helper to respect Nominatim rate limits (absolute max 1 request per second)
const delay = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

// Shared cache across API calls
const geocodeCache = new Map<string, { lat: number, lng: number }>();

async function geocodePDOK(address: string): Promise<{ lat: number, lng: number } | null> {
    if (geocodeCache.has(address)) return geocodeCache.get(address)!;
    try {
        const cleanedAddress = address.replace(/, Nederland/g, '').replace(/,/g, ' ');
        const pdokQuery = encodeURIComponent(cleanedAddress);
        const pdokUrl = `https://api.pdok.nl/bzk/locatieserver/search/v3_1/free?q=${pdokQuery}&fl=centroide_ll&rows=1`;
        const pdokRes = await fetch(pdokUrl);
        const pdokData = await pdokRes.json();
        if (pdokData?.response?.docs?.length > 0) {
            const match = pdokData.response.docs[0].centroide_ll.match(/POINT\(([\d.]+) ([\d.]+)\)/);
            if (match) {
                const coords = { lat: parseFloat(match[2]), lng: parseFloat(match[1]) };
                geocodeCache.set(address, coords);
                return coords;
            }
        }
        return null;
    } catch (e) {
        return null;
    }
}

async function geocodeNominatim(address: string): Promise<{ lat: number, lng: number } | null> {
    if (geocodeCache.has(address)) return geocodeCache.get(address)!;
    try {
        await delay(500); 
        const query = encodeURIComponent(address);
        const url = `https://nominatim.openstreetmap.org/search?format=json&q=${query}&countrycodes=nl&limit=1`;
        const res = await fetch(url, { headers: { 'User-Agent': 'VrachtwagenBV-RoutePlanner/1.0' } });
        const data = await res.json();
        
        if (data && data.length > 0) {
            const coords = { lat: parseFloat(data[0].lat), lng: parseFloat(data[0].lon) };
            geocodeCache.set(address, coords);
            return coords;
        }
        return null;
    } catch (e) {
        return null;
    }
}

async function geocodeAddress(address: string): Promise<{ lat: number, lng: number } | null> {
    const coords = await geocodePDOK(address);
    if (coords) return coords;
    return await geocodeNominatim(address);
}

export async function POST(req: NextRequest) {
    try {
        const body = await req.json();
        const startRegion: keyof typeof REGIONS = body.startRegion;
        const addresses: Address[] = body.addresses || [];

        const customStartPoint: { name: string, address: string, lat?: number, lng?: number } | undefined = body.customStartPoint;
        let startPoint = REGIONS[startRegion] || REGIONS.ARNHEM;

        if (customStartPoint) {
            if (!customStartPoint.lat || !customStartPoint.lng) {
                const coords = await geocodeAddress(customStartPoint.address);
                if (coords) {
                    startPoint = {
                        name: customStartPoint.name,
                        address: customStartPoint.address,
                        lat: coords.lat,
                        lng: coords.lng
                    };
                }
            } else {
                startPoint = {
                    ...customStartPoint,
                    address: customStartPoint.address,
                    lat: customStartPoint.lat!,
                    lng: customStartPoint.lng!
                };
            }
        }

        // PHASE 1: Try PDOK in parallel for maximum blazing speed
        const validAddresses: Address[] = [];
        const missingAddresses: Address[] = [];

        await Promise.all(addresses.map(async (addr) => {
            if (addr.lat && addr.lng) {
                validAddresses.push(addr);
                return;
            }
            const coords = await geocodePDOK(addr.volledigAdres);
            if (coords) {
                validAddresses.push({ ...addr, ...coords });
            } else {
                missingAddresses.push(addr);
            }
        }));

        // PHASE 2: Fallback to Nominatim sequentially for the remaining addresses
        for (const addr of missingAddresses) {
            const coords = await geocodeNominatim(addr.volledigAdres);
            if (coords) {
                validAddresses.push({ ...addr, ...coords });
            } else {
                console.warn('Kon adres niet vinden in Nominatim fallback:', addr.volledigAdres);
            }
        }

        if (validAddresses.length === 0) {
            return NextResponse.json({
                stops: [{ filiaalnr: 'START', straat: startPoint.address, volledigAdres: startPoint.address, formule: 'START', merchandiser: 'SYSTEM', postcode: '', plaats: startPoint.name, lat: startPoint.lat, lng: startPoint.lng }],
                totalDistance: 0,
                totalDuration: 0
            });
        }

        // ⭐ CRITICAL: Check for multi-day BEFORE calling RouteXL
        const hasDayInfo = addresses.some(a => !!a.bezoekdag);

        if (hasDayInfo) {
            // 🗓️ MULTI-DAY PATH: Optimize per day individually to avoid "too many locations" error
            console.log('📅 Multi-day route detected. Processing per day...');

            // Group addresses by bezoekdag
            const dayMap: Record<string, Address[]> = {};
            for (const a of validAddresses) {
                const day = (a.bezoekdag || 'Onbekend').toString();
                if (!dayMap[day]) dayMap[day] = [];
                dayMap[day].push(a);
            }

            const dayResults: DayRoute[] = [];

            for (const [day, addrs] of Object.entries(dayMap)) {
                console.log(`📅 Processing day: ${day} with ${addrs.length} addresses`);
                
                const unique = addrs;
                console.log(`✅ For ${day}: ${unique.length} addresses`);

                // Call RouteOptimizer for this day's addresses
                let optimized;
                try {
                    optimized = await RouteOptimizer.optimizeRoute(startRegion, unique, { username: ROUTEXL_USERNAME, password: ROUTEXL_PASSWORD }, startPoint);
                    console.log(`🗺️ Route optimized for ${day}: ${optimized.stops?.length} stops`);
                } catch (e) {
                    console.error('Route optimization failed for day', day, e);
                    // fallback: return the unique list as stops with zero totals
                    const totalPlaat = unique.reduce((s, a) => s + (a.aantalPlaatsingen || 0), 0);
                    dayResults.push({
                        bezoekdag: day,
                        stops: unique,
                        totalDistanceKm: 0,
                        totalDurationMin: 0,
                        totalPlaatsingen: totalPlaat
                    });
                    continue;
                }

                const totalPlaatsingen = (optimized.stops || []).reduce((s, a) => s + (a.aantalPlaatsingen || 0), 0);
                dayResults.push({
                    bezoekdag: day,
                    stops: optimized.stops,
                    totalDistanceKm: Math.round((optimized.totalDistance || 0) / 1000),
                    totalDurationMin: Math.round((optimized.totalDuration || 0) / 60),
                    totalPlaatsingen
                });
            }

            return NextResponse.json({ days: dayResults });
        }

        // 🚗 SINGLE-DAY PATH: Original behavior - one big route
        console.log('🚗 Single-day route. Making one optimized route...');

        const unique = validAddresses;
        
        try {
            const optimized = await RouteOptimizer.optimizeRoute(startRegion, unique, { username: ROUTEXL_USERNAME, password: ROUTEXL_PASSWORD }, startPoint);
            return NextResponse.json({
                stops: optimized.stops,
                totalDistance: optimized.totalDistance,
                totalDuration: optimized.totalDuration
            });
        } catch (e: any) {
            console.error('Single-day route optimization failed', e);
            const totalPlaat = unique.reduce((s, a) => s + (a.aantalPlaatsingen || 0), 0);
            return NextResponse.json({
                stops: unique,
                totalDistance: 0,
                totalDuration: 0,
                error: e.message || 'Optimization failed'
            });
        }

    } catch (e: any) {
        console.error('Optimize API error', e);
        return NextResponse.json({ error: e.message || 'Interne server fout' }, { status: 500 });
    }
}
