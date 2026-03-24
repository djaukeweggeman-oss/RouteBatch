import { processExcel } from './lib/excel';
import * as fs from 'fs';

async function main() {
    const buffer = fs.readFileSync('test.xlsx');
    const result = await processExcel(buffer.buffer as ArrayBuffer);
    const raphael = result.addresses.filter(a => a.merchandiser.includes('Raphael'));
    console.log(JSON.stringify(raphael.slice(0, 5), null, 2));
}

main().catch(console.error);
