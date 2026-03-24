"use client";

import { useEffect, useState } from 'react';
import { MapContainer, TileLayer, Marker, Popup, Polyline, useMap } from 'react-leaflet';
import 'leaflet/dist/leaflet.css';
import { Address } from '@/types';
import L from 'leaflet';

// Numbered circle icon generator
const createNumberedIcon = (number: number | string, color: string) => {
    return L.divIcon({
        className: '',
        html: `<div style="
            background-color: ${color};
            width: 30px;
            height: 30px;
            border-radius: 50%;
            color: white;
            display: flex;
            align-items: center;
            justify-content: center;
            font-weight: 700;
            font-size: 13px;
            border: 2.5px solid white;
            box-shadow: 0 2px 8px rgba(0,0,0,0.25);
            font-family: Inter, sans-serif;
        ">${number}</div>`,
        iconSize: [30, 30],
        iconAnchor: [15, 15],
        popupAnchor: [0, -18],
    });
};

interface MapProps {
    route: Address[];
}

function MapUpdater({ route }: { route: Address[] }) {
    const map = useMap();

    useEffect(() => {
        const valid = route.filter(p => p.lat && p.lng);
        if (valid.length > 0) {
            const bounds = L.latLngBounds(valid.map(p => [p.lat!, p.lng!]));
            map.fitBounds(bounds, { padding: [50, 50] });
        }
    }, [route, map]);

    return null;
}

export default function LeafletMap({ route }: MapProps) {
    const [mounted, setMounted] = useState(false);
    const [routeGeometry, setRouteGeometry] = useState<[number, number][]>([]);

    useEffect(() => {
        setMounted(true);
    }, []);

    // Restore validRoute which is needed for center and markers
    const validRoute = route.filter(p => p.lat && p.lng);

    // Effect to fetch actual road routing from OSRM
    useEffect(() => {
        const fetchRoute = async () => {
            if (validRoute.length < 2) {
                setRouteGeometry(validRoute.map(p => [p.lat!, p.lng!]));
                return;
            }

            try {
                // OSRM format: lon,lat;lon,lat;...
                const coordsString = validRoute.map(p => `${p.lng},${p.lat}`).join(';');
                const url = `https://router.project-osrm.org/route/v1/driving/${coordsString}?overview=full&geometries=geojson`;
                
                const res = await fetch(url);
                const data = await res.json();

                if (data.code === 'Ok' && data.routes && data.routes.length > 0) {
                    // GeoJSON returns [longitude, latitude], Leaflet Polyline expects [latitude, longitude]
                    const latLngs = data.routes[0].geometry.coordinates.map((c: [number, number]) => [c[1], c[0]]);
                    setRouteGeometry(latLngs);
                } else {
                    setRouteGeometry(validRoute.map(p => [p.lat!, p.lng!]));
                }
            } catch (error) {
                console.error("Failed to fetch OSRM route geometry", error);
                setRouteGeometry(validRoute.map(p => [p.lat!, p.lng!]));
            }
        };

        fetchRoute();
    }, [route]);

    if (!mounted) {
        return <div className="h-full w-full bg-slate-100 animate-pulse rounded-xl" />;
    }

    const centerPosition: [number, number] = validRoute.length > 0
        ? [validRoute[0].lat!, validRoute[0].lng!]
        : [52.1326, 5.2913];

    let stopIndex = 0;

    return (
        <div style={{ height: '100%', width: '100%', minHeight: '300px' }} className="rounded-xl overflow-hidden">
            <MapContainer
                center={centerPosition}
                zoom={9}
                scrollWheelZoom={true}
                style={{ height: '100%', width: '100%' }}
                zoomControl={true}
            >
                {/* Google Maps Satellite (Hybrid) — 100% gratis, anoniem, geen API key nodig */}
                <TileLayer
                    attribution='&copy; Google Maps'
                    url="https://mt1.google.com/vt/lyrs=y&x={x}&y={y}&z={z}"
                    maxZoom={20}
                />

                <MapUpdater route={route} />

                {/* Route polyline (Actual roads via OSRM) */}
                {routeGeometry.length > 1 && (
                    <>
                        {/* Shadow line for depth - white for satellite contrast */}
                        <Polyline
                            positions={routeGeometry}
                            color="#ffffff"
                            weight={8}
                            opacity={0.6}
                        />
                        {/* Main route line */}
                        <Polyline
                            positions={routeGeometry}
                            color="#3b82f6"
                            weight={4}
                            opacity={1}
                        />
                    </>
                )}

                {/* Markers */}
                {validRoute.map((stop, index) => {
                    const isStart = stop.filiaalnr === 'START';
                    const isEnd = stop.filiaalnr === 'ARNHEM';

                    let label: string;
                    let color: string;

                    if (isStart) {
                        label = '▶';
                        color = '#16a34a';
                    } else if (isEnd) {
                        label = '⬛';
                        color = '#dc2626';
                    } else {
                        stopIndex++;
                        label = String(stopIndex);
                        color = '#2563eb';
                    }

                    return (
                        <Marker
                            key={`${stop.filiaalnr}-${index}`}
                            position={[stop.lat!, stop.lng!]}
                            icon={createNumberedIcon(label, color)}
                        >
                            <Popup>
                                <div style={{ fontFamily: 'Inter, sans-serif', minWidth: '180px', padding: '2px 0' }}>
                                    <p style={{ fontWeight: 700, fontSize: 14, marginBottom: 4, color: '#1e293b' }}>
                                        {isStart ? '🚦 Startpunt' : isEnd ? '🏁 Eindpunt' : `Stop ${stopIndex}`}
                                    </p>
                                    {!isStart && !isEnd && (
                                        <p style={{ color: '#2563eb', fontWeight: 600, fontSize: 13, marginBottom: 2 }}>
                                            {stop.formule} #{stop.filiaalnr}
                                        </p>
                                    )}
                                    <p style={{ color: '#475569', fontSize: 13 }}>{stop.straat}</p>
                                    <p style={{ color: '#475569', fontSize: 13 }}>{stop.postcode} {stop.plaats}</p>
                                    {(stop.aantalPlaatsingen ?? 0) > 0 && (
                                        <p style={{ color: '#2563eb', fontSize: 12, marginTop: 6, fontWeight: 600 }}>
                                            📦 {stop.aantalPlaatsingen} plaatsingen
                                        </p>
                                    )}
                                </div>
                            </Popup>
                        </Marker>
                    );
                })}
            </MapContainer>
        </div>
    );
}
