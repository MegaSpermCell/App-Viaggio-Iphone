// sw.js – il "service worker": un piccolo programma che il browser tiene in
// sottofondo, separato dalla pagina. Qui ha un solo compito: conservare sul
// telefono una copia di tutti i file dell'app, così si apre anche senza rete.
//
// ┌─────────────────────────────────────────────────────────────────────────┐
// │ DUE REGOLE quando si modifica l'app:                                      │
// │  1. cambia VERSIONE qui sotto (v1 → v2 → v3…). È il segnale che dice ai   │
// │     telefoni: "c'è una versione nuova, riscarica tutto".                  │
// │  2. se aggiungi un file all'app, aggiungilo anche all'elenco FILE.        │
// └─────────────────────────────────────────────────────────────────────────┘

const VERSIONE = 'v5';
const CACHE = `viaggio-${VERSIONE}`;

// Tutti i file che servono per funzionare offline.
const FILE = [
  './',
  'index.html',
  'manifest.webmanifest',
  'css/style.css',
  'js/app.js',
  'js/aggiornamenti.js',
  'js/backup.js',
  'js/cambi.js',
  'js/dati.js',
  'js/db.js',
  'js/luoghi.js',
  'js/mappa.js',
  'js/scaletta.js',
  'js/scheda.js',
  'js/scheda-luogo.js',
  'js/scheda-spesa.js',
  'js/tastierino.js',
  'js/trascina.js',
  'js/util.js',
  'js/viste/cambio.js',
  'js/viste/giorno.js',
  'js/viste/impostazioni.js',
  'js/viste/itinerario.js',
  'js/viste/mappa.js',
  'js/viste/spese.js',
  'icons/apple-touch-icon.png',
  'icons/icon-192.png',
  'icons/icon-512.png',
  'vendor/leaflet/leaflet.css',
  'vendor/leaflet/leaflet-src.esm.js',
];

// Le immagini della mappa ("tessere") hanno una cache a parte, che non viene
// svuotata quando l'app si aggiorna. Si tengono le ultime MAX_TESSERE viste.
const CACHE_MAPPE = 'mappe-viaggio';
const MAX_TESSERE = 600;

// 1) INSTALLAZIONE: scarica tutti i file e li mette nella cache di questa versione.
//    { cache: 'reload' } obbliga a prenderli freschi dal server, non da copie vecchie.
self.addEventListener('install', (evento) => {
  evento.waitUntil(
    caches.open(CACHE).then((cache) => cache.addAll(FILE.map((file) => new Request(file, { cache: 'reload' })))),
  );
});

// 2) ATTIVAZIONE: questa versione prende servizio. Butta via le cache delle
//    versioni precedenti e comincia subito a occuparsi delle pagine aperte.
self.addEventListener('activate', (evento) => {
  evento.waitUntil((async () => {
    for (const nome of await caches.keys()) {
      if (nome.startsWith('viaggio-') && nome !== CACHE) await caches.delete(nome);
    }
    await self.clients.claim();
  })());
});

// Una versione nuova resta "in attesa" finché l'utente non tocca "Aggiorna":
// in quel momento la pagina manda il messaggio 'attiva' (vedi js/aggiornamenti.js).
self.addEventListener('message', (evento) => {
  if (evento.data === 'attiva') self.skipWaiting();
});

// 3) RICHIESTE: ogni volta che la pagina chiede un file passa da qui.
//    Regola: prima la copia in cache (veloce e disponibile offline), poi la rete.
self.addEventListener('fetch', (evento) => {
  const richiesta = evento.request;
  const stessoSito = new URL(richiesta.url).origin === self.location.origin;

  // Tessere della mappa: quelle già viste si prendono dal telefono.
  if (new URL(richiesta.url).hostname === 'tile.openstreetmap.org') {
    evento.respondWith(tessera(richiesta));
    return;
  }

  // Le altre richieste verso altri siti (cambi, ricerca dei luoghi) vanno dritte
  // in rete: ci pensa l'app a salvarne i risultati.
  if (richiesta.method !== 'GET' || !stessoSito) return;

  evento.respondWith((async () => {
    const cache = await caches.open(CACHE);
    // ignoreSearch: "index.html?x=1" vale come "index.html"
    const copia = await cache.match(richiesta, { ignoreSearch: true });
    if (copia) return copia;

    try {
      return await fetch(richiesta);
    } catch (errore) {
      // Offline e file non in cache: se si stava aprendo una pagina, diamo l'app.
      if (richiesta.mode === 'navigate') return cache.match('index.html');
      throw errore;
    }
  })());
});

// Una tessera della mappa: dalla cache se c'è, altrimenti dalla rete (e la si conserva).
async function tessera(richiesta) {
  const cache = await caches.open(CACHE_MAPPE);
  const copia = await cache.match(richiesta);
  if (copia) return copia;

  const risposta = await fetch(richiesta);
  if (risposta.ok) {
    await cache.put(richiesta, risposta.clone());
    // Se sono troppe si eliminano le più vecchie (keys() le elenca dalla più vecchia).
    const chiavi = await cache.keys();
    for (const vecchia of chiavi.slice(0, Math.max(0, chiavi.length - MAX_TESSERE))) cache.delete(vecchia);
  }
  return risposta;
}
