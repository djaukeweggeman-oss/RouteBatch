"use client";

import { useEffect, useRef, useMemo } from 'react';
import {
    GoogleMap as GoogleMapComponent,
    useJsApiLoader,
    Marker,
    Polyline,
    InfoWindow,
} from '@react-google-maps/api';
import { useState } from 'react';
import { Address } from '@/types';

interface MapProps {
    route: Address[];
}

const MAP_CONTAINER_STYLE = {
    width: '100%',
    height: '100%',
};

// Dark-styled Google Maps theme
const MAP_OPTIONS: google.maps.MapOptions = {
    disableDefaultUI: false,
    zoomControl: true,
    streetViewControl: false,
    mapTypeControl: false,
    fullscreenControl: true,
    styles: [
        { elementType: 'geometry', stylers: [{ color: '#f5f5f5' }] },
        { elementType: 'labels.icon', stylers: [{ visibility: 'off' }] },
        { elementType: 'labels.text.fill', stylers: [{ color: '#616161' }] },
        { elementType: 'labels.text.stroke', stylers: [{ color: '#f5f5f5' }] },
        { featureType: 'road', elementType: 'geometry', stylers: [{ color: '#ffffff' }] },
        { featureType: 'road.arterial', elementType: 'labels.text.fill', stylers: [{ color: '#757575' }] },
        { featureType: 'road.highway', elementType: 'geometry', stylers: [{ color: '#dadada' }] },
        { featureType: 'road.highway', elementType: 'labels.text.fill', stylers: [{ color: '#616161' }] },
        { featureType: 'road.local', elementType: 'labels.text.fill', stylers: [{ color: '#9e9e9e' }] },
        { featureType: 'water', elementType: 'geometry', stylers: [{ color: '#c9e8f5' }] },
        { featureType: 'water', elementType: 'labels.text.fill', stylers: [{ color: '#9e9e9e' }] },
        { featureType: 'poi.park', elementType: 'geometry', stylers: [{ color: '#e5f2e5' }] },
        { featureType: 'transit', elementType: 'geometry', stylers: [{ color: '#f2f2f2' }] },
    ],
};

export default function GoogleMap({ route }: MapProps) {
    const { isLoaded, loadError } = useJsApiLoader({
        googleMapsApiKey: process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY || '',
    });

    const [selectedStop, setSelectedStop] = useState<number | null>(null);
    const mapRef = useRef<google.maps.Map | null>(null);

    const validRoute = useMemo(() => route.filter(p => p.lat && p.lng), [route]);

    const center = useMemo(() => {
        if (validRoute.length === 0) return { lat: 52.1326, lng: 5.2913 };
        const lats = validRoute.map(p => p.lat!);
        const lngs = validRoute.map(p => p.lng!);
        return {
            lat: (Math.min(...lats) + Math.max(...lats)) / 2,
            lng: (Math.min(...lngs) + Math.max(...lngs)) / 2,
        };
    }, [validRoute]);

    const polylinePath = useMemo(() =>
        validRoute.map(p => ({ lat: p.lat!, lng: p.lng! })),
        [validRoute]
    );

    // Fit bounds when map loads or route changes
    const onLoad = (map: google.maps.Map) => {
        mapRef.current = map;
        fitBounds(map);
    };

    const fitBounds = (map: google.maps.Map) => {
        if (validRoute.length === 0) return;
        const bounds = new window.google.maps.LatLngBounds();
        validRoute.forEach(p => bounds.extend({ lat: p.lat!, lng: p.lng! }));
        map.fitBounds(bounds, { top: 60, right: 60, bottom: 60, left: 60 });
    };

    useEffect(() => {
        if (mapRef.current) fitBounds(mapRef.current);
    }, [validRoute]);

    if (loadError) {
        return (
            <div className="h-full w-full flex items-center justify-center bg-red-50 rounded-xl border border-red-200">
                <div className="text-center p-6">
                    <p className="text-red-600 font-semibold">Kaart kon niet worden geladen</p>
                    <p className="text-red-400 text-sm mt-1">Controleer uw Google Maps API key</p>
                </div>
            </div>
        );
    }

    if (!isLoaded) {
        return (
            <div className="h-full w-full bg-slate-100 animate-pulse rounded-xl flex items-center justify-center">
                <p className="text-slate-400 text-sm">Kaart laden...</p>
            </div>
        );
    }

    return (
        <div className="h-full w-full rounded-xl overflow-hidden shadow-sm border border-slate-200">
            <GoogleMapComponent
                mapContainerStyle={MAP_CONTAINER_STYLE}
                center={center}
                zoom={9}
                options={MAP_OPTIONS}
                onLoad={onLoad}
            >
                {/* Route polyline */}
                {polylinePath.length > 1 && (
                    <Polyline
                        path={polylinePath}
                        options={{
                            strokeColor: '#2563eb',
                            strokeOpacity: 0.85,
                            strokeWeight: 4,
                            geodesic: true,
                        }}
                    />
                )}

                {/* Markers */}
                {validRoute.map((stop, index) => {
                    const isStart = stop.filiaalnr === 'START';
                    const isEnd = stop.filiaalnr === 'ARNHEM';
                    const label = isStart ? 'S' : isEnd ? 'E' : String(index);

                    const markerColor = isStart ? '#16a34a' : isEnd ? '#dc2626' : '#2563eb';

                    return (
                        <Marker
                            key={`${stop.filiaalnr}-${index}`}
                            position={{ lat: stop.lat!, lng: stop.lng! }}
                            label={{
                                text: label,
                                color: 'white',
                                fontWeight: 'bold',
                                fontSize: '12px',
                            }}
                            icon={{
                                path: google.maps.SymbolPath.CIRCLE,
                                scale: 16,
                                fillColor: markerColor,
                                fillOpacity: 1,
                                strokeColor: 'white',
                                strokeWeight: 2,
                            }}
                            onClick={() => setSelectedStop(selectedStop === index ? null : index)}
                        >
                            {selectedStop === index && (
                                <InfoWindow onCloseClick={() => setSelectedStop(null)}>
                                    <div style={{ fontFamily: 'Inter, sans-serif', minWidth: '180px' }}>
                                        <p style={{ fontWeight: 700, marginBottom: 4, color: '#1e293b' }}>
                                            {isStart ? '🚦 Startpunt' : isEnd ? '🏁 Eindpunt' : `Stop ${index}`}
                                        </p>
                                        {stop.formule && !isStart && !isEnd && (
                                            <p style={{ color: '#3b82f6', fontWeight: 600, fontSize: 13, marginBottom: 2 }}>
                                                {stop.formule} #{stop.filiaalnr}
                                            </p>
                                        )}
                                        <p style={{ color: '#64748b', fontSize: 13 }}>{stop.straat}</p>
                                        <p style={{ color: '#64748b', fontSize: 13 }}>{stop.postcode} {stop.plaats}</p>
                                        {stop.aantalPlaatsingen != null && stop.aantalPlaatsingen > 0 && (
                                            <p style={{ color: '#2563eb', fontSize: 12, marginTop: 6, fontWeight: 600 }}>
                                                📦 {stop.aantalPlaatsingen} plaatsingen
                                            </p>
                                        )}
                                    </div>
                                </InfoWindow>
                            )}
                        </Marker>
                    );
                })}
            </GoogleMapComponent>
        </div>
    );
}
