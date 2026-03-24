"use client";

import React from 'react';
import { REGIONS } from '@/lib/regions';
import { MapPin } from 'lucide-react';

interface ConfigPanelProps {
    selectedRegion: keyof typeof REGIONS;
    onRegionChange: (region: keyof typeof REGIONS) => void;
    disabled?: boolean;
}

export function ConfigPanel({ selectedRegion, onRegionChange, disabled }: ConfigPanelProps) {
    return (
        <div className="bg-white p-6 rounded-xl border border-border shadow-sm mb-6">
            <div className="flex items-center gap-2 mb-4">
                <MapPin className="text-primary w-5 h-5" />
                <h2 className="font-semibold">Startpunt Configuratie</h2>
            </div>

            <div className="grid sm:grid-cols-2 gap-4">
                {Object.entries(REGIONS).map(([key, value]) => (
                    <button
                        key={key}
                        onClick={() => onRegionChange(key as keyof typeof REGIONS)}
                        disabled={disabled}
                        className={`
              relative p-4 rounded-lg border-2 text-left transition-all
              ${selectedRegion === key
                                ? 'border-primary bg-primary/5 ring-1 ring-primary'
                                : 'border-muted hover:border-primary/50'
                            }
              ${disabled ? 'opacity-50 cursor-not-allowed' : ''}
            `}
                    >
                        <div className="font-semibold text-lg">{value.name}</div>
                        <div className="text-sm text-muted-foreground">{value.address}</div>

                        {selectedRegion === key && (
                            <div className="absolute top-4 right-4 text-primary">
                                <div className="w-3 h-3 bg-primary rounded-full ring-4 ring-primary/20" />
                            </div>
                        )}
                    </button>
                ))}
            </div>
        </div>
    );
}
