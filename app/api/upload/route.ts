import { NextRequest, NextResponse } from 'next/server';
import { processExcel } from '@/lib/excel';

export async function POST(req: NextRequest) {
    try {
        const formData = await req.formData();
        const file = formData.get('file') as File;

        if (!file) {
            return NextResponse.json(
                { error: 'Geen bestand geüpload' },
                { status: 400 }
            );
        }

        if (!file.name.endsWith('.xlsx')) {
            return NextResponse.json(
                { error: 'Alleen .xlsx bestanden worden geaccepteerd' },
                { status: 400 }
            );
        }

        const arrayBuffer = await file.arrayBuffer();
        const result = await processExcel(arrayBuffer);
        
        // Log to server console
        console.log('[UPLOAD] File processed successfully:', {
            addressCount: result.addresses.length,
            driverCount: result.drivers.length,
        });
        
        return NextResponse.json(result);

    } catch (error: any) {
        const errorMsg = error.message || 'Interne server fout bij verwerken bestand';
        console.error('[UPLOAD] Processing error:', errorMsg);
        
        // Send full detailed error to client
        return NextResponse.json(
            { error: errorMsg, details: error.toString() },
            { status: 500 }
        );
    }
}
