'use client';

import { useState, useMemo } from 'react';
import dynamic from 'next/dynamic';
import { UploadZone } from '@/components/UploadZone';
import { Address, BatchRouteResult } from '@/types';
import { Truck, AlertTriangle, MapPin, ChevronDown, ChevronUp, PackageOpen, CheckSquare, ShieldCheck, XCircle, Loader2 } from 'lucide-react';
import { RouteList } from '@/components/RouteList';
import { BOX_ADDRESSES } from '@/lib/regions';

const LeafletMap = dynamic(() => import('@/components/LeafletMap'), {
    ssr: false,
    loading: () => <div className="h-[400px] w-full bg-slate-100 animate-pulse rounded-xl" />
});

interface ValidationResult {
    status: 'ok' | 'missing' | 'checking';
    expected: number;
    generated: number;
    missingRoutes: { terr: string; merchandiser: string }[];
}

export default function Home() {
    const [step, setStep] = useState<1 | 2 | 3 | 4>(1);
    const [isProcessing, setIsProcessing] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [progress, setProgress] = useState({ current: 0, total: 0 });
    const [batchResults, setBatchResults] = useState<BatchRouteResult[]>([]);
    const [expandedResultId, setExpandedResultId] = useState<string | null>(null);
    const [validationResult, setValidationResult] = useState<ValidationResult | null>(null);

    const [allAddresses, setAllAddresses] = useState<Address[]>([]);
    const [availableBoxes, setAvailableBoxes] = useState<string[]>([]);
    const [selectedBoxes, setSelectedBoxes] = useState<string[]>([]);

    const handleUploadComplete = (data: { addresses: Address[], drivers: string[] }) => {
        try {
            setError(null);
            setAllAddresses(data.addresses);
            const uniqueBoxes = new Set<string>();
            data.addresses.forEach(addr => {
                const boxName = (addr.boxName || '').trim();
                uniqueBoxes.add(boxName ? boxName : 'Onbekend');
            });
            const boxList = Array.from(uniqueBoxes).sort();
            setAvailableBoxes(boxList);
            setSelectedBoxes(boxList.length === 1 ? [boxList[0]] : []);
            setStep(2);
        } catch (err: any) {
            setError(err.message || 'Fout bij het verwerken van de excel');
        }
    };

    const toggleBox = (box: string) => {
        setSelectedBoxes(prev =>
            prev.includes(box) ? prev.filter(b => b !== box) : [...prev, box]
        );
    };

    const selectAll = () => {
        setSelectedBoxes(availableBoxes.length === selectedBoxes.length ? [] : [...availableBoxes]);
    };

    const runValidationAgent = (jobs: { terr: string; merchandiser: string; boxName: string }[], results: BatchRouteResult[]) => {
        setValidationResult({ status: 'checking', expected: jobs.length, generated: results.length, missingRoutes: [] });
        const missing = jobs.filter(job =>
            !results.some(r => r.terr === job.terr && r.merchandiser === job.merchandiser && r.boxName === job.boxName)
        ).map(j => ({ terr: j.terr, merchandiser: j.merchandiser }));

        setValidationResult({
            status: missing.length === 0 ? 'ok' : 'missing',
            expected: jobs.length,
            generated: results.length,
            missingRoutes: missing
        });
    };

    const startGeneration = async () => {
        if (selectedBoxes.length === 0) {
            setError("Selecteer minimaal één Box om door te gaan.");
            return;
        }
        try {
            setError(null);
            setValidationResult(null);
            setStep(3); // Brief loading while geocoding
            setIsProcessing(true);
            setBatchResults([]); // Clear previous results so streaming starts fresh
            setProgress({ current: 0, total: 0 });

            const filteredAddresses = allAddresses.filter(addr => {
                const boxN = addr.boxName ? addr.boxName.trim() : 'Onbekend';
                return selectedBoxes.includes(boxN);
            });

            const groups: { [key: string]: Address[] } = {};
            for (const addr of filteredAddresses) {
                const terrKey = addr.terr ? String(addr.terr).trim() : 'Onbekend';
                const merchaKey = addr.merchandiser ? String(addr.merchandiser).trim() : 'Onbekend';
                const boxKey = addr.boxName ? String(addr.boxName).trim() : 'Onbekend';
                const groupKey = `${terrKey}|${merchaKey}|${boxKey}`;
                if (!groups[groupKey]) groups[groupKey] = [];
                groups[groupKey].push(addr);
            }

            const jobs = Object.entries(groups).map(([key, addrs]) => {
                const [terr, merchandiser, boxName] = key.split('|');
                return { terr, merchandiser, boxName, addresses: addrs };
            });

            const cachedResults = batchResults.filter(r => selectedBoxes.includes(r.boxName));
            const jobsToProcess = jobs.filter(job =>
                !cachedResults.some(r => r.terr === job.terr && r.merchandiser === job.merchandiser && r.boxName === job.boxName)
            );

            // PRE-GEOCODE: batch geocode all unique addresses in one shot
            // This avoids redundant geocoding across parallel jobs
            const uniqueAddrs = Array.from(new Set(filteredAddresses
                .filter(a => !a.lat || !a.lng)
                .map(a => a.volledigAdres)
            ));

            let coordMap: Record<string, { lat: number; lng: number } | null> = {};
            if (uniqueAddrs.length > 0) {
                try {
                    const geoRes = await fetch('/api/geocode', {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({ addresses: uniqueAddrs })
                    });
                    if (geoRes.ok) {
                        const geoData = await geoRes.json();
                        coordMap = geoData.coords || {};
                    }
                } catch (e) {
                    console.warn('Pre-geocoding failed, falling back to per-job geocoding', e);
                }
            }

            // Attach pre-geocoded coords to all addresses
            const enrichedAddresses = filteredAddresses.map(addr => {
                if (addr.lat && addr.lng) return addr;
                const coords = coordMap[addr.volledigAdres];
                return coords ? { ...addr, ...coords } : addr;
            });

            // Re-group with enriched addresses
            const enrichedGroups: { [key: string]: Address[] } = {};
            for (const addr of enrichedAddresses) {
                const terrKey = addr.terr ? String(addr.terr).trim() : 'Onbekend';
                const merchaKey = addr.merchandiser ? String(addr.merchandiser).trim() : 'Onbekend';
                const boxKey = addr.boxName ? String(addr.boxName).trim() : 'Onbekend';
                const groupKey = `${terrKey}|${merchaKey}|${boxKey}`;
                if (!enrichedGroups[groupKey]) enrichedGroups[groupKey] = [];
                enrichedGroups[groupKey].push(addr);
            }

            const enrichedJobs = jobsToProcess.map(job => ({
                ...job,
                addresses: enrichedGroups[`${job.terr}|${job.merchandiser}|${job.boxName}`] || job.addresses
            }));

            setProgress({ current: 0, total: enrichedJobs.length });

            // Switch to step 4 NOW so routes stream in live
            setBatchResults([...cachedResults]);
            setStep(4);

            const BATCH_SIZE = 12;
            const newResults: BatchRouteResult[] = [];
            let completedCount = 0;

            const failedJobs: typeof enrichedJobs = [];

            const processJob = async (job: typeof enrichedJobs[0]): Promise<BatchRouteResult | null> => {
                try {
                    const payload: any = { startRegion: 'ARNHEM', addresses: job.addresses };
                    if (job.boxName !== 'Onbekend') {
                        const exactAddress = BOX_ADDRESSES[job.boxName] || `${job.boxName}, Nederland`;
                        payload.customStartPoint = { name: job.boxName, address: exactAddress };
                    }
                    const res = await fetch('/api/optimize', {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify(payload)
                    });
                    if (!res.ok) return null;
                    const resultData = await res.json();
                    let totalDistKm = 0, totalDurMin = 0, totalPlaats = 0;
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
                    return { terr: job.terr, merchandiser: job.merchandiser, boxName: job.boxName, stops: allStops, totalDistanceKm: totalDistKm, totalDurationMin: totalDurMin, totalPlaatsingen: totalPlaats };
                } catch {
                    return null;
                }
            };

            for (let i = 0; i < enrichedJobs.length; i += BATCH_SIZE) {
                const batch = enrichedJobs.slice(i, i + BATCH_SIZE);

                // Each job streams its result immediately when done
                await Promise.all(batch.map(async (job, j) => {
                    const r = await processJob(job);
                    if (r) {
                        newResults.push(r);
                        // Stream result into UI immediately
                        setBatchResults(prev => [...prev, r]);
                    } else {
                        failedJobs.push(batch[j]);
                    }
                    completedCount++;
                    setProgress({ current: completedCount, total: enrichedJobs.length });
                }));
            }

            // RETRY failed jobs one by one
            for (const job of failedJobs) {
                try {
                    const payload: any = { startRegion: 'ARNHEM', addresses: job.addresses };
                    if (job.boxName !== 'Onbekend') {
                        const exactAddress = BOX_ADDRESSES[job.boxName] || `${job.boxName}, Nederland`;
                        payload.customStartPoint = { name: job.boxName, address: exactAddress };
                    }
                    const res = await fetch('/api/optimize', {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify(payload)
                    });
                    if (res.ok) {
                        const resultData = await res.json();
                        let totalDistKm = 0, totalDurMin = 0, totalPlaats = 0;
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
                        newResults.push({ terr: job.terr, merchandiser: job.merchandiser, boxName: job.boxName, stops: allStops, totalDistanceKm: totalDistKm, totalDurationMin: totalDurMin, totalPlaatsingen: totalPlaats });
                    }
                } catch { /* skip if retry also fails */ }
            }

            const allResults = [...cachedResults, ...newResults];
            allResults.sort((a, b) => b.totalDistanceKm - a.totalDistanceKm);
            setBatchResults(allResults);
            runValidationAgent(jobs, allResults);
            setStep(4);
        } catch (err: any) {
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
        setValidationResult(null);
    };

    const backToBoxSelection = () => {
        setExpandedResultId(null);
        setStep(2);
        setProgress({ current: 0, total: 0 });
        setError(null);
    };

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

                </div>

                {error && (
                    <div className="bg-red-50 border-l-4 border-red-500 p-4 rounded-xl shadow-sm animate-in fade-in slide-in-from-top-2">
                        <p className="text-sm font-medium text-red-700">{error}</p>
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
                        <div className="p-6 md:p-8 space-y-4">
                            {/* Select All button */}
                            <div className="flex items-center justify-between">
                                <span className="text-sm text-slate-500 font-medium">{selectedBoxes.length} van {availableBoxes.length} geselecteerd</span>
                                <button
                                    onClick={selectAll}
                                    className="inline-flex items-center gap-2 px-4 py-2 bg-slate-100 hover:bg-blue-50 hover:text-blue-700 text-slate-600 rounded-xl font-semibold text-sm transition-all border border-slate-200 hover:border-blue-200"
                                >
                                    <CheckSquare className="w-4 h-4" />
                                    {selectedBoxes.length === availableBoxes.length ? 'Deselecteer alles' : 'Selecteer alles'}
                                </button>
                            </div>

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
                        <div className="flex items-center justify-center gap-3 mb-4">
                            <Loader2 className="w-6 h-6 text-blue-600 animate-spin" />
                            <h2 className="text-2xl font-bold">Routes berekenen...</h2>
                        </div>
                        <div className="w-full bg-slate-100 rounded-full h-4 mb-4 overflow-hidden border border-slate-200">
                            <div
                                className="bg-blue-600 h-4 rounded-full transition-all duration-500 ease-out"
                                style={{ width: `${progress.total > 0 ? (progress.current / progress.total) * 100 : 0}%` }}
                            />
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
                            <div className="flex-1 min-w-0">
                                <div className="flex items-center gap-3">
                                    <h2 className="text-2xl font-bold text-slate-800">Route Overzicht</h2>
                                    {isProcessing && <Loader2 className="w-5 h-5 text-blue-500 animate-spin shrink-0" />}
                                </div>
                                <p className="text-slate-500 text-sm mt-1">
                                    {isProcessing
                                        ? `${batchResults.length} van ${progress.total} routes geladen...`
                                        : `${batchResults.length} routes gegenereerd voor ${selectedBoxes.join(', ')}`
                                    }
                                </p>
                                {isProcessing && progress.total > 0 && (
                                    <div className="mt-2 w-full bg-slate-100 rounded-full h-1.5 overflow-hidden">
                                        <div
                                            className="bg-blue-500 h-1.5 rounded-full transition-all duration-300 ease-out"
                                            style={{ width: `${(progress.current / progress.total) * 100}%` }}
                                        />
                                    </div>
                                )}
                            </div>
                            <div className="flex gap-3 ml-4 shrink-0">
                                <button onClick={backToBoxSelection} className="px-5 py-2.5 bg-blue-100 hover:bg-blue-200 text-blue-700 font-semibold rounded-xl transition-colors">
                                    Kies andere box
                                </button>
                                <button onClick={reset} className="px-5 py-2.5 bg-slate-100 hover:bg-slate-200 text-slate-700 font-semibold rounded-xl transition-colors">
                                    Nieuwe Upload
                                </button>
                            </div>
                        </div>


                        {/* Validation Agent Banner */}
                        {validationResult && (
                            <div className={`rounded-2xl border p-4 flex items-start gap-4 animate-in fade-in duration-300 ${
                                validationResult.status === 'checking' ? 'bg-blue-50 border-blue-200' :
                                validationResult.status === 'ok' ? 'bg-emerald-50 border-emerald-200' :
                                'bg-amber-50 border-amber-200'
                            }`}>
                                <div className="shrink-0 mt-0.5">
                                    {validationResult.status === 'checking' && <Loader2 className="w-5 h-5 text-blue-600 animate-spin" />}
                                    {validationResult.status === 'ok' && <ShieldCheck className="w-5 h-5 text-emerald-600" />}
                                    {validationResult.status === 'missing' && <XCircle className="w-5 h-5 text-amber-600" />}
                                </div>
                                <div className="flex-1">
                                    <p className={`font-bold text-sm ${
                                        validationResult.status === 'checking' ? 'text-blue-700' :
                                        validationResult.status === 'ok' ? 'text-emerald-700' :
                                        'text-amber-700'
                                    }`}>
                                        {validationResult.status === 'checking' && 'Validatie-agent controleert routes...'}
                                        {validationResult.status === 'ok' && `✓ Alle ${validationResult.expected} verwachte routes zijn succesvol gegenereerd.`}
                                        {validationResult.status === 'missing' && `⚠ ${validationResult.missingRoutes.length} route(s) ontbreken (${validationResult.generated}/${validationResult.expected} gegenereerd)`}
                                    </p>
                                    {validationResult.status === 'missing' && validationResult.missingRoutes.length > 0 && (
                                        <ul className="mt-2 space-y-1">
                                            {validationResult.missingRoutes.map((r, i) => (
                                                <li key={i} className="text-amber-600 text-xs font-medium">
                                                    • TERR {r.terr} – {r.merchandiser}
                                                </li>
                                            ))}
                                        </ul>
                                    )}
                                </div>
                            </div>
                        )}

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
                                        const realStops = res.stops.filter((s) => s.filiaalnr !== 'START' && s.filiaalnr !== 'ARNHEM').length;

                                        return (
                                            <div key={`${boxName}-${idx}`} className={`bg-white rounded-2xl shadow-md border-l-4 transition-all duration-300 ${isOutlier ? 'border-amber-500 hover:shadow-amber-100' : 'border-blue-500 hover:shadow-blue-100'} overflow-hidden`}>
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
                                                            <span className="w-2 h-2 rounded-full bg-slate-300" />
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
