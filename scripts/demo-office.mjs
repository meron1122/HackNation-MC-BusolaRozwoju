// Fikcyjny urząd dla demo: seed backendu ma realne formacje (z logo), a demo nie może podszywać się pod instytucje.
// Zakłada „Urząd Wojewódzki w Przykładowie” bez logo i przepina na niego lokalizację wydziału demo.
// Użycie: node scripts/demo-office.mjs <email SuperAdmin> <hasło>
const [email, password] = process.argv.slice(2);
const BASE = process.env.API ?? 'http://localhost:5283/api';
let token = '';
async function api(path, method = 'GET', body) {
  const r = await fetch(`${BASE}/${path}`, { method, headers: { 'Content-Type': 'application/json', ...(token && { Authorization: `Bearer ${token}` }) }, body: body && JSON.stringify(body) });
  const t = await r.text();
  if (!r.ok) throw new Error(`${method} ${path} → ${r.status} ${t.slice(0, 200)}`);
  return t ? JSON.parse(t) : null;
}
token = (await api('auth/login', 'POST', { email, password })).token;
const NAME = 'Urząd Wojewódzki w Przykładowie';
const office = (await api('services')).find((s) => s.name === NAME) ?? await api('services', 'POST', { name: NAME, logoUrl: null });
const loc = (await api('locations')).find((l) => l.name === 'Warszawa, ul. Królewska 27');
if (loc && loc.serviceId !== office.id) await api(`locations/${loc.id}`, 'PUT', { name: 'Przykładowo, ul. Główna 1', serviceId: office.id });
const after = (await api('locations')).find((l) => l.id === loc?.id);
console.log(`OK: lokalizacja „${after?.name}” → ${after?.serviceName}`);
