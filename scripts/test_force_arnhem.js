// Simuleert de filter + append logica om Arnhem altijd als laatste stop te forceren
const arnhemRegion = { name: 'Arnhem', address: 'Vlamoven 7, Arnhem', lat: 51.9866, lng: 5.9525 };

function ensureArnhemLast(optimizedOrder) {
  const arnhemAddress = {
    filiaalnr: 'ARNHEM',
    formule: 'ARNHEM',
    straat: arnhemRegion.address,
    postcode: '',
    plaats: arnhemRegion.name,
    volledigAdres: arnhemRegion.address,
    merchandiser: 'SYSTEM',
    lat: arnhemRegion.lat,
    lng: arnhemRegion.lng
  };

  const filtered = optimizedOrder.filter(s => {
    if (!s) return false;
    if (s.filiaalnr === 'ARNHEM') return false;
    if (s.plaats && s.plaats.toLowerCase() === arnhemRegion.name.toLowerCase()) return false;
    if (s.lat && s.lng) {
      if (Math.abs(s.lat - arnhemRegion.lat) < 0.0005 && Math.abs(s.lng - arnhemRegion.lng) < 0.0005) return false;
    }
    return true;
  });

  filtered.push(arnhemAddress);
  return filtered;
}

// Testcases
const cases = [
  {
    name: 'No Arnhem present',
    input: [
      { filiaalnr: '100', plaats: 'Nijmegen', lat: 51.842, lng: 5.852 },
      { filiaalnr: '101', plaats: 'Ede', lat: 52.042, lng: 5.666 }
    ]
  },
  {
    name: 'Arnhem present earlier',
    input: [
      { filiaalnr: '100', plaats: 'Nijmegen', lat: 51.842, lng: 5.852 },
      { filiaalnr: 'ARNHEM', plaats: 'Arnhem', lat: 51.9866, lng: 5.9525 },
      { filiaalnr: '101', plaats: 'Ede', lat: 52.042, lng: 5.666 }
    ]
  },
  {
    name: 'Close coords but different filiaalnr',
    input: [
      { filiaalnr: '100', plaats: 'Somewhere', lat: 51.9866, lng: 5.9525 },
      { filiaalnr: '101', plaats: 'Ede', lat: 52.042, lng: 5.666 }
    ]
  }
];

for (const c of cases) {
  console.log('---', c.name, '---');
  const out = ensureArnhemLast(c.input);
  out.forEach((s, i) => console.log(i + 1, s.filiaalnr, s.plaats, s.lat, s.lng));
}
