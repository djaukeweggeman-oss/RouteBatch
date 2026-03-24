import { Address } from '@/types';
import { REGIONS } from './regions';

export class RouteOptimizer {

    // Helper to respect Nominatim rate limits (absolute max 1 request per second)
    private static async delay(ms: number) {
        return new Promise(resolve => setTimeout(resolve, ms));
    }

    static async geocodeAddress(address: string): Promise<{ lat: number, lng: number } | null> {
        try {
            // Use PDOK first because it's native Dutch and handles precise queries without rate limit issues
            const pdokQuery = encodeURIComponent(address.replace(', Nederland', ''));
            const pdokUrl = `https://api.pdok.nl/bzk/locatieserver/search/v3_1/free?q=${pdokQuery}&fl=centroide_ll&rows=1`;
            const pdokRes = await fetch(pdokUrl);
            const pdokData = await pdokRes.json();

            if (pdokData?.response?.docs?.length > 0) {
                const match = pdokData.response.docs[0].centroide_ll.match(/POINT\(([\d.]+) ([\d.]+)\)/);
                if (match) {
                    return { lat: parseFloat(match[2]), lng: parseFloat(match[1]) };
                }
            }

            // Fallback to Nominatim (OpenStreetMap) - Free, but requires User-Agent and rate limiting
            const query = encodeURIComponent(address);
            const url = `https://nominatim.openstreetmap.org/search?format=json&q=${query}&countrycodes=nl&limit=1`;

            const res = await fetch(url, {
                headers: {
                    'User-Agent': 'VrachtwagenBV-RoutePlanner/1.0'
                }
            });

            const data = await res.json();

            if (data && data.length > 0) {
                return {
                    lat: parseFloat(data[0].lat),
                    lng: parseFloat(data[0].lon)
                };
            }
            return null;
        } catch (error) {
            console.error("Geocoding error:", error);
            return null;
        }
    }

    static async optimizeRoute(startRegion: keyof typeof REGIONS, addresses: Address[], credentials?: { username: string, password: string }, customStartPoint?: { name: string, address: string, lat: number, lng: number }): Promise<{ stops: Address[], totalDistance: number, totalDuration: number }> {
        const startPoint = customStartPoint || REGIONS[startRegion] || REGIONS.ARNHEM;

        // 1. Geocode all addresses with RATE LIMITING
        // Nominatim strictly forbids bulk unrestricted scraping. We must throttle.
        const geocodedAddresses: Address[] = [];
        const validAddresses: Address[] = [];

        // Add Start Point First to the list we want to route
        // But we keep it separate for the OSRM call structure

        console.log("Start geocoding...");

        for (const addr of addresses) {
            if (addr.lat && addr.lng) {
                validAddresses.push(addr);
            } else {
                // Wait 1.1 seconds between requests to be safe and respectful
                await this.delay(1100);
                const coords = await this.geocodeAddress(addr.volledigAdres);
                if (coords) {
                    validAddresses.push({ ...addr, ...coords });
                } else {
                    console.warn(`Kon adres niet vinden: ${addr.volledigAdres}`);
                }
            }
        }

        if (validAddresses.length === 0) {
            // Fallback if nothing found: return only the START point
            return {
                stops: [
                    { filiaalnr: 'START', straat: startPoint.address, volledigAdres: startPoint.address, formule: 'START', merchandiser: 'SYSTEM', postcode: '', plaats: startPoint.name, lat: startPoint.lat, lng: startPoint.lng }
                ],
                totalDistance: 0,
                totalDuration: 0
            };
        }

        // 2. Prepare RouteXL locations array
        // RouteXL expects an array of objects: name, lat, lng
        // The first location is the start point if not specified otherwise
        const locations = [
            {
                name: "START_DEPOT",
                lat: startPoint.lat,
                lng: startPoint.lng,
                restrictions: {
                    ready: 0,
                    due: 999
                }
            },
            ...validAddresses.map((addr, index) => ({
                name: `STOP_${index}`, // Uniquely identify each stop by its true index
                lat: addr.lat!,
                lng: addr.lng!,
                restrictions: {
                    ready: 0,
                    due: 999
                }
            }))
        ];

        // 3. Call RouteXL API
        const username = credentials?.username || process.env.ROUTEXL_USERNAME || process.env.NEXT_PUBLIC_ROUTEXL_USERNAME;
        const password = credentials?.password || process.env.ROUTEXL_PASSWORD || process.env.NEXT_PUBLIC_ROUTEXL_PASSWORD;

        if (!username || !password) {
            throw new Error("RouteXL inloggegevens ontbreken. Stel ROUTEXL_USERNAME en ROUTEXL_PASSWORD in in .env.local.");
        }

        const auth = btoa(`${username}:${password}`);

        try {
            // Fail fast (2 seconds max) so OSRM Trip Fallback can engage instantly
            const controller = new AbortController();
            
            const fetchPromise = fetch('https://api.routexl.com/tour', {
                method: 'POST',
                headers: {
                    'Authorization': `Basic ${auth}`,
                    'Content-Type': 'application/x-www-form-urlencoded'
                },
                body: `locations=${encodeURIComponent(JSON.stringify(locations))}`,
                signal: controller.signal
            });

            const timeoutPromise = new Promise<Response>((_, reject) => {
                setTimeout(() => {
                    controller.abort();
                    reject(new Error("RouteXL Connection Timeout (Fast OSRM Fallback Triggered)"));
                }, 1500); // 1.5 seconds hard cutoff
            });

            const res = await Promise.race([fetchPromise, timeoutPromise]);

            if (!res.ok) {
                const errorText = await res.text();
                console.error("RouteXL Error Body:", errorText);
                if (res.status === 401) throw new Error("RouteXL inloggegevens onjuist.");
                if (res.status === 429) throw new Error("RouteXL limiet bereikt (max 20 stops gratis).");
                throw new Error(`RouteXL API Fout: ${res.statusText}`);
            }

            const data = await res.json();
            
            if (!data.route) {
                console.error("No route object in response", data);
                throw new Error("Geen route ontvangen van RouteXL.");
            }

            const optimizedOrder: Address[] = [];
            let totalDistanceKm = 0;
            let totalDurationMin = 0;

            const routeKeys = Object.keys(data.route).sort((a, b) => parseInt(a) - parseInt(b));

            routeKeys.forEach((key) => {
                const stop = data.route[key];

                if (stop.name === "START_DEPOT") {
                    optimizedOrder.push({
                        filiaalnr: 'START',
                        formule: 'START',
                        straat: startPoint.address,
                        postcode: '',
                        plaats: startPoint.name,
                        volledigAdres: startPoint.address,
                        merchandiser: 'SYSTEM',
                        lat: startPoint.lat,
                        lng: startPoint.lng
                    });
                } else {
                    // Match the precise index from "STOP_{index}"
                    const nameMatch = stop.name.match(/STOP_(\d+)/);
                    let match: Address | null = null;
                    
                    if (nameMatch) {
                        const originalIndex = parseInt(nameMatch[1], 10);
                        match = validAddresses[originalIndex];
                    }

                    // Fallback to coordinate matching if name matching completely fails somehow
                    if (!match) {
                        match = validAddresses.find(a =>
                            Math.abs(a.lat! - parseFloat(stop.lat)) < 0.001 &&
                            Math.abs(a.lng! - parseFloat(stop.lng)) < 0.001
                        ) || null;
                    }

                    if (match) {
                        optimizedOrder.push(match);
                    } else {
                        console.warn(`Could not match stop back to address: ${stop.name} (${stop.lat}, ${stop.lng})`);
                    }
                }

                if (stop.distance) totalDistanceKm = parseFloat(stop.distance); 
                if (stop.arrival) totalDurationMin = parseFloat(stop.arrival); 
            });

            console.log(`Optimized Route: ${optimizedOrder.length} stops`); // DEBUG

            // Ensure the startPoint is always the final stop (round trip)
            const endAddress: Address = {
                filiaalnr: 'START',
                formule: 'EINDE',
                straat: startPoint.address,
                postcode: '',
                plaats: startPoint.name,
                volledigAdres: startPoint.address,
                merchandiser: 'SYSTEM',
                lat: startPoint.lat,
                lng: startPoint.lng
            };

            const filtered = optimizedOrder.filter(s => !!s);
            filtered.push(endAddress);

            return {
                stops: filtered,
                totalDistance: totalDistanceKm * 1000, // Convert km to meters
                totalDuration: totalDurationMin * 60  // Convert minutes to seconds
            };

        } catch (e: any) {
            console.error("RouteXL API failed or unreachable. Falling back to OSRM Trip API...", e);
            
            // OSRM Trip API Fallback
            try {
                const points = [startPoint, ...validAddresses];
                const coordsString = points.map(p => `${p.lng},${p.lat}`).join(';');
                // Trip API solves TSP. source=first keeps startPoint fixed.
                const url = `https://router.project-osrm.org/trip/v1/driving/${coordsString}?roundtrip=true&source=first&overview=false`;
                
                const osrmRes = await fetch(url);
                if (!osrmRes.ok) throw new Error("OSRM API failed");
                const osrmData = await osrmRes.json();
                
                if (osrmData.code !== 'Ok' || !osrmData.trips || !osrmData.trips.length) {
                    throw new Error("No route from OSRM");
                }
                
                const trip = osrmData.trips[0];
                const wpts = osrmData.waypoints;
                
                // Sort addresses by OSRM waypoint index
                const sortedAddresses: Address[] = [];
                // first stop is start point
                sortedAddresses.push({
                    filiaalnr: 'START', formule: 'START', straat: startPoint.address,
                    postcode: '', plaats: startPoint.name, volledigAdres: startPoint.address,
                    merchandiser: 'SYSTEM', lat: startPoint.lat, lng: startPoint.lng
                });
                
                // Add original_index because OSRM array order matches input order
                const wptsWithOriginal = wpts.map((w: any, index: number) => ({ ...w, original_index: index }));
                
                // order remaining validAddresses based on waypoint_index
                const orderedIndexes = wptsWithOriginal.sort((a: any, b: any) => a.waypoint_index - b.waypoint_index);
                for (const w of orderedIndexes) {
                    // w.original_index is the index from the points array
                    if (w.original_index === 0) continue; // skip startPoint
                    const addrIdx = w.original_index - 1;
                    if (validAddresses[addrIdx]) {
                        sortedAddresses.push(validAddresses[addrIdx]);
                    }
                }
                
                // End with Start Point (Round-trip to box)
                sortedAddresses.push({
                    filiaalnr: 'START', formule: 'EINDE', straat: startPoint.address,
                    postcode: '', plaats: startPoint.name, volledigAdres: startPoint.address,
                    merchandiser: 'SYSTEM', lat: startPoint.lat, lng: startPoint.lng
                });
                
                return {
                    stops: sortedAddresses,
                    totalDistance: trip.distance,
                    totalDuration: trip.duration
                };
            } catch (osrmError) {
                console.error("OSRM Fallback also failed", osrmError);
                throw e; // throw original RouteXL error
            }
        }
    }
}
