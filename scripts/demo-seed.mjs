// Dane demo (fikcyjne osoby) przez API. Użycie: node scripts/demo-seed.mjs <email SuperAdmin> <hasło> [plik_wynikowy]
// Zakłada lokalizację, wydział, przełożoną, HR i zespół; konta dostają hasła tymczasowe zapisane do pliku (nie commitować).
import { writeFileSync } from 'node:fs';
const [email, password, out = 'demo-accounts.local.txt'] = process.argv.slice(2);
const BASE = process.env.API ?? 'http://localhost:5283/api';
let token = '';
async function api(path, method = 'GET', body) {
  const r = await fetch(`${BASE}/${path}`, { method, headers: { 'Content-Type': 'application/json', ...(token && { Authorization: `Bearer ${token}` }) }, body: body && JSON.stringify(body) });
  const t = await r.text();
  if (!r.ok) throw new Error(`${method} ${path} → ${r.status} ${t.slice(0, 300)}`);
  return t ? JSON.parse(t) : null;
}
token = (await api('auth/login', 'POST', { email, password })).token;
const services = await api('services');
const service = services[0];
const loc = (await api('locations')).find((l) => l.name === 'Warszawa, ul. Królewska 27') ?? await api('locations', 'POST', { name: 'Warszawa, ul. Królewska 27', serviceId: service.id });
const dep = (await api('departments')).find((d) => d.name === 'Wydział Zarządzania Kryzysowego') ?? await api('departments', 'POST', { name: 'Wydział Zarządzania Kryzysowego', locationId: loc.id });
const existing = (await api('employees?pageSize=200')).items ?? await api('employees?pageSize=200');
const lines = ['Konta demo (tylko lokalnie, nie commitować)'];
async function person(p) {
  const found = (Array.isArray(existing) ? existing : []).find((e) => e.email === p.email);
  if (found) return found;
  const res = await api('employees', 'POST', { departmentId: dep.id, subjectToFirstEvaluation: false, ...p });
  lines.push(`${p.firstName} ${p.lastName}: ${p.email} / ${res.temporaryPassword} (${p.role ?? 'Employee'})`);
  writeFileSync(out, lines.join('\n') + '\n', { mode: 0o600 });
  return res.employee;
}
const anna = await person({ firstName: 'Anna', lastName: 'Kowalczyk', email: 'anna.kowalczyk@busola.test', dateOfBirth: '1982-04-12', hireDate: '2012-03-01', role: 'Supervisor' });
const hr = await person({ firstName: 'Magdalena', lastName: 'Lis', email: 'magdalena.lis@busola.test', dateOfBirth: '1988-09-03', hireDate: '2016-06-01', role: 'Hr' });
await person({ firstName: 'Katarzyna', lastName: 'Nowak', email: 'katarzyna.nowak@busola.test', dateOfBirth: '1993-02-17', hireDate: '2024-11-25', supervisorId: anna.id });
await person({ firstName: 'Piotr', lastName: 'Zieliński', email: 'piotr.zielinski@busola.test', dateOfBirth: '1990-07-22', hireDate: '2019-05-10', supervisorId: anna.id });
await person({ firstName: 'Ewa', lastName: 'Sowa', email: 'ewa.sowa@busola.test', dateOfBirth: '1987-01-30', hireDate: '2021-03-15', supervisorId: anna.id });
await person({ firstName: 'Jan', lastName: 'Bąk', email: 'jan.bak@busola.test', dateOfBirth: '1999-10-05', hireDate: '2026-11-02', supervisorId: anna.id, subjectToFirstEvaluation: true });
const users = await api('users');
const roleFor = { [hr.id]: ['Hr'] }; // Employee i Supervisor wynikają z danych pracownika
for (const u of users) if (roleFor[u.employeeId]) await api(`users/${u.id}/roles`, 'PUT', { roles: roleFor[u.employeeId] });
writeFileSync(out, lines.join('\n') + '\n', { mode: 0o600 });
console.log(`OK: ${lines.length - 1} nowych kont, zapisano do ${out}`);
