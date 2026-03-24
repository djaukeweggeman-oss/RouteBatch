"use client";

import React, { useState, useCallback } from 'react';
import { Upload, FileSpreadsheet, AlertCircle, CheckCircle2, Loader2 } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Address } from '@/types';

interface UploadZoneProps {
    onUploadComplete: (data: { addresses: Address[], drivers: string[] }) => void;
}

export function UploadZone({ onUploadComplete }: UploadZoneProps) {
    const [isDragging, setIsDragging] = useState(false);
    const [isLoading, setIsLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);

    const handleDrag = useCallback((e: React.DragEvent) => {
        e.preventDefault();
        e.stopPropagation();
        if (e.type === 'dragenter' || e.type === 'dragover') {
            setIsDragging(true);
        } else if (e.type === 'dragleave') {
            setIsDragging(false);
        }
    }, []);

    const processFile = async (file: File) => {
        if (!file.name.endsWith('.xlsx')) {
            setError('Alleen .xlsx bestanden zijn toegestaan.');
            return;
        }

        setIsLoading(true);
        setError(null);

        const formData = new FormData();
        formData.append('file', file);

        try {
            const response = await fetch('/api/upload', {
                method: 'POST',
                body: formData,
            });

            const data = await response.json();

            if (!response.ok) {
                throw new Error(data.error || 'Er is een fout opgetreden bij het uploaden.');
            }

            onUploadComplete(data);
        } catch (err: any) {
            console.error('Upload error:', err);
            setError(err.message);
        } finally {
            setIsLoading(false);
            setIsDragging(false);
        }
    };

    const handleDrop = useCallback((e: React.DragEvent) => {
        e.preventDefault();
        e.stopPropagation();
        setIsDragging(false);

        if (e.dataTransfer.files && e.dataTransfer.files[0]) {
            processFile(e.dataTransfer.files[0]);
        }
    }, []);

    const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        if (e.target.files && e.target.files[0]) {
            processFile(e.target.files[0]);
        }
    };

    return (
        <div className="w-full">
            <div
                onDragEnter={handleDrag}
                onDragLeave={handleDrag}
                onDragOver={handleDrag}
                onDrop={handleDrop}
                className={cn(
                    "relative border-2 border-dashed rounded-xl p-10 text-center transition-all duration-200 ease-in-out cursor-pointer",
                    isDragging
                        ? "border-primary bg-blue-50/50 scale-[1.02]"
                        : "border-gray-200 hover:border-primary/50 hover:bg-gray-50",
                    isLoading && "pointer-events-none opacity-50"
                )}
            >
                <input
                    type="file"
                    className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
                    onChange={handleChange}
                    accept=".xlsx"
                    disabled={isLoading}
                />

                <div className="flex flex-col items-center gap-4">
                    <div className={cn(
                        "p-4 rounded-full transition-colors",
                        isDragging ? "bg-primary/10 text-primary" : "bg-gray-100 text-gray-500"
                    )}>
                        {isLoading ? (
                            <Loader2 className="w-8 h-8 animate-spin text-primary" />
                        ) : (
                            <Upload className="w-8 h-8" />
                        )}
                    </div>

                    <div className="space-y-1">
                        <h3 className="font-semibold text-lg">
                            {isLoading ? 'Bestand verwerken...' : 'Upload Planning'}
                        </h3>
                        <p className="text-sm text-muted-foreground">
                            Sleep je Excel bestand hier of klik om te bladeren
                        </p>
                    </div>

                    {!isLoading && (
                        <div className="flex items-center gap-2 text-xs text-muted-foreground bg-gray-50 px-3 py-1 rounded-full border border-gray-100">
                            <FileSpreadsheet className="w-3 h-3" />
                            <span>Alleen .xlsx bestanden</span>
                        </div>
                    )}
                </div>
            </div>

            {error && (
                <div className="mt-4 p-4 bg-red-50 text-red-600 rounded-lg flex items-center gap-3 animate-in fade-in slide-in-from-top-2">
                    <AlertCircle className="w-5 h-5 shrink-0" />
                    <p className="text-sm font-medium">{error}</p>
                </div>
            )}
        </div>
    );
}
