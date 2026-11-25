import { app, initDb } from '../server/index.mjs';

let initPromise = null;

export default async function handler(req, res) {
  if (!initPromise) {
    initPromise = initDb().catch((err) => {
      initPromise = null;
      throw err;
    });
  }
  try {
    await initPromise;
  } catch (err) {
    console.error('DuaSaku Vercel initDb failed:', err);
    if (!res.headersSent) {
      res.statusCode = 500;
      res.setHeader('Content-Type', 'application/json');
      res.end(JSON.stringify({ error: 'Inisialisasi server gagal.' }));
    }
    return;
  }
  return app(req, res);
}
