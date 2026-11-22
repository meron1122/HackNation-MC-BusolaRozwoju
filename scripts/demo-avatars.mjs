// Użycie: node scripts/demo-avatars.mjs [plik kont demo]
import { readFile } from 'node:fs/promises';

const accountsFile = process.argv[2] ?? 'demo-accounts.local.txt';
const api = new URL(process.env.API ?? 'http://localhost:5283/api');
if (!['localhost', '127.0.0.1', '[::1]'].includes(api.hostname)) {
  throw new Error('Skrypt obsługuje wyłącznie lokalne API demo.');
}

const portraits = new Map([
  ['anna.kowalczyk@busola.test', 'magdalena-lis'],
  ['magdalena.lis@busola.test', 'anna-kowalczyk'],
  ['katarzyna.nowak@busola.test', 'kasia-nowak'],
  ['piotr.zielinski@busola.test', 'piotr-zielinski'],
  ['jan.bak@busola.test', 'jan-bak'],
  ['tomasz.wrona@busola.test', 'tomasz-wrona'],
]);
const accounts = (await readFile(accountsFile, 'utf8')).split(/\r?\n/)
  .map((line) => line.match(/^[^:]+: (\S+) \/ (\S+)/))
  .filter((account) => account && portraits.has(account[1]));
if (!accounts.length) throw new Error('W podanym pliku nie ma kont z ilustracjami demo.');

const base = api.href.replace(/\/$/, '');
const failed = [];
for (const [, email, password] of accounts) {
  const portrait = portraits.get(email);
  try {
    const png = await readFile(new URL(`demo-avatars/${portrait}.png`, import.meta.url));
    const login = await fetch(`${base}/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      redirect: 'error',
      body: JSON.stringify({ email, password }),
    });
    if (!login.ok) throw new Error(`logowanie HTTP ${login.status}`);
    const { token } = await login.json();
    if (!token) throw new Error('logowanie wymaga dodatkowego potwierdzenia');

    const form = new FormData();
    form.append('file', new Blob([png], { type: 'image/png' }), `${portrait}.png`);
    const upload = await fetch(`${base}/account/avatar`, {
      method: 'PUT',
      headers: { Authorization: `Bearer ${token}` },
      redirect: 'error',
      body: form,
    });
    if (!upload.ok) throw new Error(`wgrywanie HTTP ${upload.status}`);
    console.log(`Wgrano awatar: ${email}`);
  } catch (error) {
    failed.push(email);
    console.error(`${email}: ${error.message}`);
  }
}
if (failed.length) process.exitCode = 1;
