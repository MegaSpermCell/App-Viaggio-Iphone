// luoghi.js – trovare la posizione di un luogo.
//
// Un luogo è salvato così:  { nome: "Santa Sofia", lat: 41.0086, lon: 28.9802 }
// lat e lon sono le coordinate (latitudine e longitudine); valgono null finché
// il luogo ha solo un nome e non è ancora stato trovato sulla mappa.
//
// La posizione si può ottenere in tre modi:
//   1. cercando il nome con Nominatim, il motore di ricerca di OpenStreetMap
//   2. incollando coordinate ("41.0086, 28.9802") o un link di Google/Apple Maps
//   3. toccando la mappa (vedi scheda-luogo.js)

// ---------- Coordinate e link incollati -----------------------------------------

// Modi in cui le coordinate compaiono nei link, dal più preciso al meno preciso.
const MODELLI_LINK = [
  /!3d(-?\d+\.\d+)!4d(-?\d+\.\d+)/,                                  // Google: il segnaposto esatto
  /[?&](?:q|query|ll|sll|daddr|destination|center)=(?:loc:)?(-?\d+\.\d+)(?:,|%2C)\s*(-?\d+\.\d+)/i,
  /@(-?\d+\.\d+),(-?\d+\.\d+)/,                                      // Google: il centro della mappa
];
const SOLO_COORDINATE = /^\s*(-?\d{1,2}(?:[.,]\d+)?)\s*[,; ]\s*(-?\d{1,3}(?:[.,]\d+)?)\s*$/;

/** I link brevi di Google Maps non contengono le coordinate e non si possono leggere. */
export function eLinkBreve(testo) {
  return /maps\.app\.goo\.gl|goo\.gl\/maps/i.test(testo);
}

/**
 * Cerca delle coordinate dentro un testo incollato.
 *   "41.0086, 28.9802"                                  → { lat: 41.0086, lon: 28.9802 }
 *   "https://www.google.com/maps/place/…/@41.0,28.9,17z" → { lat: 41.0, lon: 28.9 }
 * Restituisce null se non ne trova.
 */
export function leggiCoordinate(testo) {
  let trovato = null;
  if (/^https?:\/\//i.test(testo.trim())) {
    for (const modello of MODELLI_LINK) {
      trovato = testo.match(modello);
      if (trovato) break;
    }
  } else {
    trovato = testo.match(SOLO_COORDINATE);
    // "41,0086 28,9802": la virgola qui è il separatore dei decimali
    if (trovato) trovato = [null, trovato[1].replace(',', '.'), trovato[2].replace(',', '.')];
  }
  if (!trovato) return null;

  const lat = Number(trovato[1]);
  const lon = Number(trovato[2]);
  const valide = Math.abs(lat) <= 90 && Math.abs(lon) <= 180;
  return valide ? { lat, lon } : null;
}

// ---------- Ricerca per nome (Nominatim) ----------------------------------------
//
// Nominatim è gratuito ma chiede rispetto: al massimo una richiesta al secondo,
// niente ricerche "mentre si scrive", e niente richieste ripetute per la stessa
// cosa. Per questo: si cerca solo premendo il tasto, si aspetta fra una
// richiesta e l'altra, e i risultati già ottenuti vengono ricordati.

const PAUSA_FRA_RICHIESTE = 1100; // millisecondi
const giaCercati = new Map();     // testo cercato → risultati
let ultimaRichiesta = 0;

const aspetta = (millisecondi) => new Promise((risolvi) => setTimeout(risolvi, millisecondi));

/**
 * Cerca un luogo per nome o indirizzo.
 * Restituisce un elenco (anche vuoto) di { nome, descrizione, lat, lon }.
 * Lancia un errore se manca la rete o il servizio non risponde.
 */
export async function cercaLuogo(testo) {
  const chiave = testo.trim().toLowerCase();
  if (!chiave) return [];
  if (giaCercati.has(chiave)) return giaCercati.get(chiave);
  if (!navigator.onLine) throw new Error('Per cercare un luogo serve la rete.');

  const attesa = ultimaRichiesta + PAUSA_FRA_RICHIESTE - Date.now();
  if (attesa > 0) await aspetta(attesa);
  ultimaRichiesta = Date.now();

  const indirizzo = `https://nominatim.openstreetmap.org/search?format=jsonv2&limit=5&accept-language=it&q=${encodeURIComponent(testo.trim())}`;
  let risposta;
  try {
    risposta = await fetch(indirizzo, { signal: AbortSignal.timeout(12_000) });
  } catch {
    throw new Error('La ricerca non risponde: riprova fra poco.');
  }
  if (!risposta.ok) throw new Error('La ricerca non risponde: riprova fra poco.');

  const risultati = (await risposta.json()).map((voce) => ({
    nome: voce.name || voce.display_name.split(',')[0],
    descrizione: voce.display_name,
    lat: Number(voce.lat),
    lon: Number(voce.lon),
  }));
  giaCercati.set(chiave, risultati);
  return risultati;
}

// ---------- Navigazione ---------------------------------------------------------

/** Indirizzo che apre il navigatore (Apple Maps o Google Maps) verso un luogo. */
export function linkNaviga(luogo, mappe) {
  // Con le coordinate la destinazione è precisa; altrimenti si cerca per nome.
  const destinazione = encodeURIComponent(luogo.lat != null ? `${luogo.lat},${luogo.lon}` : luogo.nome);
  return mappe === 'google'
    ? `https://www.google.com/maps/dir/?api=1&destination=${destinazione}`
    : `https://maps.apple.com/?daddr=${destinazione}`;
}
