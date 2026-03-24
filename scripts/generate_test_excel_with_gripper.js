const XLSX = require('xlsx');

function generate() {
  const rows = [];
  for (let i = 0; i < 8; i++) rows.push([]);

  // Header row at row 9
  const headers = ['ADRES', 'Merchandiser', 'FILIAALNR', 'FORMULE', 'POSTCODE', 'PLAATSNAAM', 'GRIPPERBOX', 'MERK_A', 'MERK_B', 'MERK_C'];
  rows.push(headers);

  // Rows with various JA/NEE combinations
  rows.push(['Vlamoven 7', 'Auke Weggeman', 'START01', 'TestFormule', '6814AA', 'Arnhem', '', 'JA', 'NEE', 'JA']);
  rows.push(['Stadsbrink 375', 'Auke Weggeman', '1103', 'Albert Heijn', '6708AA', 'WAGENINGEN', '', 'ja', 'Ja', 'NEE']);
  rows.push(['Molenstraat 2', 'Other Driver', '1094', 'Albert Heijn', '4000AA', 'TIEL', '', 'NEE', '', '']);
  rows.push(['Kerkstraat 10', 'Auke Weggeman', '1200', 'Lidl', '6000AA', 'ARNHEM', '', 'NEE', 'JA', 'JA']);

  const ws = XLSX.utils.aoa_to_sheet(rows);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, 'PLANNING WEEK 08');

  const outPath = 'scripts/test_upload_gripper.xlsx';
  XLSX.writeFile(wb, outPath);
  console.log('Wrote', outPath);
}

generate();
