import { mkdirSync } from 'node:fs';
import { resolve } from 'node:path';
import express from 'express';
import { createApp } from './app.ts';
import { createProviders } from './providers.ts';
import { Store } from './store.ts';

const root = resolve(import.meta.dirname, '..');
const host = process.env.HOST || '127.0.0.1', port = Number(process.env.PORT || 4173);
if (!['127.0.0.1', 'localhost', '::1'].includes(host)) throw new Error('This first release is local-only. Keep HOST on a loopback address.');
mkdirSync(resolve(root, 'data'), { recursive: true });
const store = new Store(resolve(root, 'data', 'baatpakki.sqlite'));
const app = createApp(store, createProviders(() => {
  try { process.loadEnvFile(resolve(root, '.env')); } catch { /* Environment variables also work without a local file. */ }
  return { gnani: process.env.GNANI_API_KEY || '' };
}));
app.use((_req, res, next) => { res.set({ 'X-Content-Type-Options': 'nosniff', 'Referrer-Policy': 'same-origin', 'X-Frame-Options': 'DENY' }); next(); });
if (process.argv.includes('--production')) {
  app.use(express.static(resolve(root, 'dist')));
  app.get('/{*splat}', (_req, res) => res.sendFile(resolve(root, 'dist', 'index.html')));
} else {
  const { createServer } = await import('vite');
  const vite = await createServer({ root, server: { middlewareMode: true, fs: { deny: ['**/.env', '**/.env.*', '**/.git/**', '**/data/**', '**/artifacts/**', '**/*.{crt,pem,key}'] } }, appType: 'spa' });
  app.use(vite.middlewares);
}
const server = app.listen(port, host, () => console.log(`BaatPakki is ready at http://${host}:${port}`));
function shutdown() { server.close(() => { store.close(); process.exit(0); }); }
process.on('SIGINT', shutdown); process.on('SIGTERM', shutdown);
