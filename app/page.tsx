'use client';

import { useState, useMemo } from 'react';
import dynamic from 'next/dynamic';
import { UploadZone } from '@/components/UploadZone';
import { Address, BatchRouteResult } from '@/types';
import { Truck, AlertTriangle, MapPin, ChevronDown, ChevronUp, PackageOpen } from 'lucide-react';
import { RouteList } from '@/components/RouteList';
import { BOX_ADDRESSES } from '@/lib/regions';

const LeafletMap = dynamic(() => import('@/components/LeafletMap'), {
    ssr: false,
    loading: () => <div className="h-[400px] w-full bg-slate-100 animate-pulse rounded-xl" />
});

export default function Home() {
    // State 
    const [step, setStep] = useState<1 | 2 | 3 | 4>(1); // 1: Upload, 2: Select Box, 3: Processing, 4: Results
    const [isProcessing, setIsProcessing] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [progress, setProgress] = useState({ current: 0, total: 0 });
    const [batchResults, setBatchResults] = useState<BatchRouteResult[]>([]);
    const [expandedResultId, setExpandedResultId] = useState<string | null>(null);

    // Data from excel
    const [allAddresses, setAllAddresses] = useState<Address[]>([]);
    const [availableBoxes, setAvailableBoxes] = useState<string[]>([]);
    const [selectedBoxes, setSelectedBoxes] = useState<string[]>([]);

    const handleUploadComplete = (data: { addresses: Address[], drivers: string[] }) => {
        try {
            setError(null);
            setAllAddresses(data.addresses);

            // Extract unique boxes
            const uniqueBoxes = new Set<string>();
            data.addresses.forEach(addr => {
                if (addr.boxName) uniqueBoxes.add(addr.boxName.trim());
            });

            const boxList = Array.from(uniqueBoxes).filter(Boolean).sort();
            
            if (boxList.length === 0) {
                // If no box names found, just make a fallback "Onbekend"
                setAvailableBoxes(['Onbekend']);
                setSelectedBoxes(['Onbekend']);
            } else {
                setAvailableBoxes(boxList);
                setSelectedBoxes([]); // Let user choose
            }
            
            setStep(2);
        } catch (err: any) {
            console.error(err);
            setError(err.message || 'Fout bij het verwerken van de excel');
        }
    };

    const toggleBox = (box: string) => {
        setSelectedBoxes(prev => 
            prev.includes(box) ? prev.filter(b => b !== box) : [...prev, box]
        );
    };

    const startGeneration = async () => {
        if (selectedBoxes.length === 0) {
            setError("Selecteer minimaal één Box om door te gaan.");
            return;
        }

        try {
            setError(null);
            setStep(3);
            setIsProcessing(true);

            // Filter addresses for selected boxes
            // If the box is "Onbekend", we keep addresses that have no boxName or match "Onbekend"
            const filteredAddresses = allAddresses.filter(addr => {
                const boxN = addr.boxName ? addr.boxName.trim() : 'Onbekend';
                return selectedBoxes.includes(boxN);
            });

            // Group by TERR and then by driver
            const groups: { [key: string]: Address[] } = {};
            for (const addr of filteredAddresses) {
                const terrKey = addr.terr ? String(addr.terr).trim() : 'Onbekend';
                const merchaKey = addr.merchandiser ? String(addr.merchandiser).trim() : 'Onbekend';
                const boxKey = addr.boxName ? String(addr.boxName).trim() : 'Onbekend';
                const groupKey = `${terrKey}|${merchaKey}|${boxKey}`;
                if (!groups[groupKey]) {
                    groups[groupKey] = [];
                }
                groups[groupKey].push(addr);
            }

            const jobs = Object.entries(groups).map(([key, addrs]) => {
                const [terr, merchandiser, boxName] = key.split('|');
                return { terr, merchandiser, boxName, addresses: addrs };
            });

            setProgress({ current: 0, total: jobs.length });

            const results: BatchRouteResult[] = [];
            
            // Keep previously generated results for the boxes that are STILL selected
            const cachedResults = batchResults.filter(r => selectedBoxes.includes(r.boxName));
            results.push(...cachedResults);

            const jobsToProcess = jobs.filter(job => 
                !cachedResults.some(r => r.terr === job.terr && r.merchandiser === job.merchandiser && r.boxName === job.boxName)
            );

            setProgress({ current: 0, total: jobsToProcess.length });

            // Process sequentially. Parallelizing OSRM Trip API causes 10+ sec throttling queues per request!
            // With Sequential + PDOK, each job resolves lightning fast (~200ms per route)
            for (let i = 0; i < jobsToProcess.length; i++) {
                const job = jobsToProcess[i];
                try {
                    console.log(`Processing job ${i + 1}/${jobsToProcess.length}: TERR ${job.terr}, Driver ${job.merchandiser}, Box ${job.boxName}`);
                    
                    const payload: any = { 
                        startRegion: 'ARNHEM', // fallback
                        addresses: job.addresses 
                    };

                    if (job.boxName !== 'Onbekend') {
                        const exactAddress = BOX_ADDRESSES[job.boxName] || `${job.boxName}, Nederland`;
                        payload.customStartPoint = {
                            name: job.boxName,
                            address: exactAddress
                        };
                    }

                    const res = await fetch('/api/optimize', {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify(payload)
                    });

                    if (!res.ok) {
                        const errText = await res.text();
                        console.error(`Route optimalisatie faalde voor TERR ${job.terr}:`, errText);
                        continue;
                    }

                    const resultData = await res.json();
                    
                    let totalDistKm = 0;
                    let totalDurMin = 0;
                    let totalPlaats = 0;
                    let allStops: Address[] = [];

                    if (resultData.days) {
                        for (const day of resultData.days) {
                            totalDistKm += day.totalDistanceKm || 0;
                            totalDurMin += day.totalDurationMin || 0;
                            totalPlaats += day.totalPlaatsingen || 0;
                            allStops = allStops.concat(day.stops);
                        }
                    } else {
                        totalDistKm = Math.round((resultData.totalDistance || 0) / 1000);
                        totalDurMin = Math.round((resultData.totalDuration || 0) / 60);
                        totalPlaats = (resultData.stops || []).reduce((sum: number, s: Address) => sum + (s.aantalPlaatsingen || 0), 0);
                        allStops = resultData.stops || [];
                    }

                    results.push({
                        terr: job.terr,
                        merchandiser: job.merchandiser,
                        boxName: job.boxName,
                        stops: allStops,
                        totalDistanceKm: totalDistKm,
                        totalDurationMin: totalDurMin,
                        totalPlaatsingen: totalPlaats,
                    });
                } catch (err) {
                    console.error("Job error:", err);
                } finally {
                    setProgress(prev => ({ ...prev, current: i + 1 }));
                }
            }
            results.sort((a, b) => b.totalDistanceKm - a.totalDistanceKm);

            setBatchResults(results);
            setStep(4);
        } catch (err: any) {
            console.error(err);
            setError(err.message || 'Fout bij het verwerken van de generatie');
            setStep(2);
        } finally {
            setIsProcessing(false);
        }
    };

    const reset = () => {
        setBatchResults([]);
        setExpandedResultId(null);
        setSelectedBoxes([]);
        setAllAddresses([]);
        setStep(1);
        setError(null);
        setProgress({ current: 0, total: 0 });
    };

    const backToBoxSelection = () => {
        // We NO LONGER clear batchResults, so we can reuse them if the same box is still toggled on!
        setExpandedResultId(null);
        setStep(2);
        setProgress({ current: 0, total: 0 });
        setError(null);
    };

    // Calculate outliers
    const { medianDistance, outlierThreshold } = useMemo(() => {
        if (batchResults.length === 0) return { medianDistance: 0, outlierThreshold: 0 };
        const dists = batchResults.map(r => r.totalDistanceKm).sort((a, b) => a - b);
        const mid = Math.floor(dists.length / 2);
        const median = dists.length % 2 !== 0 ? dists[mid] : (dists[mid - 1] + dists[mid]) / 2;
        return { medianDistance: median, outlierThreshold: Math.max(median * 1.5, 50) };
    }, [batchResults]);

    return (
        <main className="min-h-screen bg-slate-50 p-4 md:p-8 font-sans text-slate-900 flex flex-col items-center">
            <div className="w-full max-w-6xl space-y-8">

                {/* Header */}
                <div className="text-center space-y-2 py-8">
                    <div className="inline-flex items-center justify-center p-3 bg-blue-600 rounded-2xl shadow-lg shadow-blue-200 mb-4 transition-transform hover:scale-105 duration-300">
                        <Truck className="w-8 h-8 text-white" />
                    </div>
                    <h1 className="text-4xl md:text-5xl font-extrabold tracking-tight text-slate-900">
                        Route<span className="text-blue-600">Batch</span>
                    </h1>
                    <p className="text-lg text-slate-500 max-w-2xl mx-auto">
                        Automatische controleer- en optimalisatietool voor planningen per TERR (box).
                    </p>
                </div>

                {/* Error Message */}
                {error && (
                    <div className="bg-red-50 border-l-4 border-red-500 p-4 rounded-xl shadow-sm animate-in fade-in slide-in-from-top-2">
                        <div className="flex">
                            <div className="ml-3">
                                <p className="text-sm font-medium text-red-700">{error}</p>
                            </div>
                        </div>
                    </div>
                )}

                {/* Step 1: Upload */}
                {step === 1 && (
                    <div className="max-w-2xl mx-auto bg-white rounded-3xl shadow-xl p-1 pointer-events-auto transition-all hover:shadow-2xl">
                        <UploadZone onUploadComplete={handleUploadComplete} />
                    </div>
                )}

                {/* Step 2: Select Box */}
                {step === 2 && (
                    <div className="max-w-2xl mx-auto bg-white rounded-3xl shadow-xl overflow-hidden animate-in zoom-in-95 duration-300 border border-slate-100">
                        <div className="bg-gradient-to-r from-blue-600 to-blue-700 p-6 text-white text-center">
                            <PackageOpen className="w-10 h-10 mx-auto text-blue-100 mb-2 opacity-90" />
                            <h2 className="text-2xl font-bold">Selecteer Box(en)</h2>
                            <p className="text-blue-100 opacity-90 text-sm mt-1">
                                Geef aan voor welke locatie(s) je de routes wilt berekenen.<br/>
                                De gekozen box is direct het <strong className="text-white">Startpunt</strong> voor de planners.
                            </p>
                        </div>
                        <div className="p-6 md:p-8 space-y-6">
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 max-h-[400px] overflow-y-auto pr-2">
                                {availableBoxes.map(box => {
                                    const isSelected = selectedBoxes.includes(box);
                                    return (
                                        <button
                                            key={box}
                                            onClick={() => toggleBox(box)}
                                            className={`text-left flex items-start p-4 rounded-2xl border-2 transition-all ${isSelected ? 'border-blue-600 bg-blue-50/50 shadow-md shadow-blue-100/50' : 'border-slate-200 hover:border-blue-300 hover:bg-slate-50'}`}
                                        >
                                            <div className="flex-1">
                                                <h3 className={`font-bold text-lg ${isSelected ? 'text-blue-700' : 'text-slate-700'}`}>{box === 'Onbekend' ? 'Overige ritten (geen box)' : box}</h3>
                                            </div>
                                            <div className={`mt-0.5 shrink-0 w-6 h-6 rounded-full border-2 flex items-center justify-center transition-colors ${isSelected ? 'bg-blue-600 border-blue-600' : 'border-slate-300 bg-white'}`}>
                                                {isSelected && <svg className="w-3.5 h-3.5 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}><path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" /></svg>}
                                            </div>
                                        </button>
                                    );
                                })}
                            </div>

                            <div className="pt-2 border-t border-slate-100 flex gap-4">
                                <button onClick={reset} className="px-6 py-4 text-slate-500 font-bold hover:text-slate-700 transition-colors">
                                    ← Terug
                                </button>
                                <button
                                    onClick={startGeneration}
                                    disabled={selectedBoxes.length === 0}
                                    className="flex-1 py-4 bg-blue-600 hover:bg-blue-700 disabled:bg-slate-300 disabled:cursor-not-allowed text-white rounded-xl font-bold text-lg shadow-lg hover:shadow-xl transition-all transform hover:-translate-y-0.5 disabled:hover:translate-y-0 flex items-center justify-center gap-2"
                                >
                                    Start Routegeneratie
                                </button>
                            </div>
                        </div>
                    </div>
                )}

                {/* Step 3: Processing Progress */}
                {step === 3 && (
                    <div className="max-w-xl mx-auto bg-white rounded-3xl shadow-xl p-8 text-center animate-in zoom-in-95 duration-300">
                        <h2 className="text-2xl font-bold mb-4">Routes berekenen...</h2>
                        <div className="w-full bg-slate-100 rounded-full h-4 mb-4 overflow-hidden border border-slate-200">
                            <div 
                                className="bg-blue-600 h-4 rounded-full transition-all duration-500 ease-out" 
                                style={{ width: `${progress.total > 0 ? (progress.current / progress.total) * 100 : 0}%` }}
                            ></div>
                        </div>
                        <p className="text-slate-500 font-medium">
                            {progress.current} van de {progress.total} ritten verwerkt
                        </p>
                    </div>
                )}

                {/* Step 4: Results */}
                {step === 4 && (
                    <div className="space-y-6 animate-in fade-in slide-in-from-bottom-4 duration-500">
                        <div className="flex justify-between items-center bg-white p-4 md:p-6 rounded-2xl shadow-sm border border-slate-200">
                            <div>
                                <h2 className="text-2xl font-bold text-slate-800">Route Overzicht</h2>
                                <p className="text-slate-500 text-sm mt-1">{batchResults.length} routes gegenereerd voor {selectedBoxes.join(', ')}</p>
                            </div>
                            <div className="flex gap-3">
                                <button onClick={backToBoxSelection} className="px-5 py-2.5 bg-blue-100 hover:bg-blue-200 text-blue-700 font-semibold rounded-xl transition-colors">
                                    Kies andere box
                                </button>
                                <button onClick={reset} className="px-5 py-2.5 bg-slate-100 hover:bg-slate-200 text-slate-700 font-semibold rounded-xl transition-colors">
                                    Nieuwe Upload
                                </button>
                            </div>
                        </div>
                        
                        {batchResults.length > 0 && Object.entries(
                            batchResults.reduce((acc, res) => {
                                const box = res.boxName || 'Onbekend';
                                if (!acc[box]) acc[box] = [];
                                acc[box].push(res);
                                return acc;
                            }, {} as Record<string, BatchRouteResult[]>)
                        ).map(([boxName, routes]) => (
                            <div key={boxName} className="mb-10 animate-in fade-in slide-in-from-bottom-2">
                                <h3 className="text-xl font-extrabold bg-blue-50 text-blue-900 border border-blue-100 px-5 py-3 rounded-xl mb-4 shadow-sm inline-flex items-center gap-2">
                                    <PackageOpen className="w-5 h-5" />
                                    {boxName === 'Onbekend' ? 'Overige Ritten' : boxName}
                                </h3>
                                <div className="space-y-6">
                                    {routes.map((res, idx) => {
                                        const isOutlier = res.totalDistanceKm > outlierThreshold;
                                        const isExpanded = expandedResultId === `${res.terr}-${res.merchandiser}`;
                                        
                                        // Real stops count without start/end duplicates
                                        const realStops = res.stops.filter((s) => s.filiaalnr !== 'START' && s.filiaalnr !== 'ARNHEM').length;

                                        return (
                                            <div key={`${boxName}-${idx}`} className={`bg-white rounded-2xl shadow-md border-l-4 transition-all duration-300 ${isOutlier ? 'border-amber-500 hover:shadow-amber-100' : 'border-blue-500 hover:shadow-blue-100'} overflow-hidden`}>
                                                
                                                {/* Card Header (always visible) */}
                                                <div 
                                                    onClick={() => setExpandedResultId(isExpanded ? null : `${res.terr}-${res.merchandiser}`)}
                                                    className="p-4 md:p-6 cursor-pointer flex flex-col md:flex-row items-start md:items-center justify-between gap-4 group"
                                                >
                                                    <div className="flex-1">
                                                        <div className="flex items-center gap-3 mb-1">
                                                            <h3 className="text-xl font-bold text-slate-800">
                                                                {String(res.terr).toUpperCase().startsWith('TERR') ? res.terr : `TERR ${res.terr}`}
                                                            </h3>
                                                            {isOutlier && (
                                                                <span className="inline-flex items-center gap-1.5 px-3 py-1 bg-amber-100 text-amber-800 text-xs font-bold rounded-full uppercase tracking-wide">
                                                                    <AlertTriangle className="w-3.5 h-3.5" />
                                                                    Uitschieter
                                                                </span>
                                                            )}
                                                        </div>
                                                        <p className="text-slate-600 font-medium flex items-center gap-2">
                                                            <span className="w-2 h-2 rounded-full bg-slate-300"></span>
                                                            {res.merchandiser}
                                                        </p>
                                                    </div>

                                                    <div className="flex flex-wrap md:flex-nowrap gap-4 md:gap-8 items-center w-full md:w-auto">
                                                        <div className="text-left md:text-right">
                                                            <p className="text-xs text-slate-400 font-bold uppercase tracking-wider mb-0.5">Stops</p>
                                                            <p className="text-xl font-bold text-slate-700">{realStops}</p>
                                                        </div>
                                                        <div className="text-left md:text-right">
                                                            <p className="text-xs text-slate-400 font-bold uppercase tracking-wider mb-0.5">Plaatsingen</p>
                                                            <p className="text-xl font-bold text-slate-700">{res.totalPlaatsingen}</p>
                                                        </div>
                                                        <div className="text-left md:text-right">
                                                            <p className="text-xs text-slate-400 font-bold uppercase tracking-wider mb-0.5">Tijd</p>
                                                            <p className="text-xl font-bold text-slate-700">{Math.round(res.totalDurationMin / 60)}u {res.totalDurationMin % 60}m</p>
                                                        </div>
                                                        <div className="text-left md:text-right">
                                                            <p className={`text-xs font-bold uppercase tracking-wider mb-0.5 ${isOutlier ? 'text-amber-500' : 'text-slate-400'}`}>Afstand</p>
                                                            <p className={`text-xl font-black ${isOutlier ? 'text-amber-600' : 'text-slate-800'}`}>{res.totalDistanceKm} km</p>
                                                        </div>
                                                        <div className="pl-4 border-l border-slate-100 md:block hidden text-slate-400 group-hover:text-blue-600 transition-colors">
                                                            {isExpanded ? <ChevronUp className="w-6 h-6" /> : <ChevronDown className="w-6 h-6" />}
                                                        </div>
                                                    </div>
                                                </div>

                                                {/* Expanded Details */}
                                                {isExpanded && (
                                                    <div className="border-t border-slate-100 bg-slate-50/50 p-4 md:p-6 animate-in slide-in-from-top-2 duration-300 grid grid-cols-1 lg:grid-cols-3 gap-6">
                                                        <div className="lg:col-span-1">
                                                            <RouteList route={res.stops} />
                                                        </div>
                                                        <div className="lg:col-span-2 min-h-[400px]">
                                                            <div className="h-full bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden relative">
                                                                <LeafletMap route={res.stops} />
                                                                <div className="absolute bottom-4 right-4 z-[400]">
                                                                    <a href={`https://www.google.com/maps/dir/${res.stops.map(s => encodeURIComponent(s.volledigAdres)).join('/')}`} target="_blank" rel="noopener noreferrer" className="bg-white/90 backdrop-blur text-blue-600 px-4 py-2 rounded-lg font-bold shadow-lg hover:bg-blue-600 hover:text-white transition-all flex items-center gap-2 text-sm">
                                                                        <MapPin className="w-4 h-4" /> Open in Google Maps
                                                                    </a>
                                                                </div>
                                                            </div>
                                                        </div>
                                                    </div>
                                                )}
                                            </div>
                                        );
                                    })}
                                </div>
                            </div>
                        ))}
                    </div>
                )}
            </div>
        </main>
    );
}
