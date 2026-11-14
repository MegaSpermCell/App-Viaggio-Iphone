// mappa.js – tutto ciò che serve per disegnare una mappa.
//
// Usa Leaflet, una libreria libera per le mappe, copiata nella cartella
// vendor/ così funziona anche offline. Le immagini della mappa ("tessere")
// arrivano da OpenStreetMap: quelle già viste restano salvate sul telefono
// (se ne occupa sw.js), quindi le zone guardate con la rete si rivedono anche senza.

let leaflet = null;

/** Carica Leaflet solo la prima volta che serve una mappa: l'app parte più leggera. */
export async function caricaLeaflet() {
  leaflet ??= await import('../vendor/leaflet/leaflet-src.esm.js');
  return leaflet;
}

/** Crea una mappa dentro `elemento` e la restituisce insieme a Leaflet. */
export async function creaMappa(elemento, { centro = [20, 60], zoom = 2 } = {}) {
  const L = await caricaLeaflet();
  const mappa = L.map(elemento, { zoomControl: false }).setView(centro, zoom);
  L.control.zoom({ position: 'bottomright' }).addTo(mappa);
  L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', {
    maxZoom: 19,
    crossOrigin: true, // permette al service worker di salvare le tessere per l'uso offline
    attribution: '© <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener">OpenStreetMap</a>',
  }).addTo(mappa);
  // Se il riquadro cambia misura dopo la creazione (succede mentre una scheda si
  // apre), la mappa va avvisata, altrimenti una parte resta grigia.
  const timer = setTimeout(() => mappa.invalidateSize(), 300);
  mappa.on('unload', () => clearTimeout(timer)); // mappa chiusa prima: non serve più
  return { L, mappa };
}

/** Chiude una mappa: ferma i movimenti in corso e libera la memoria. */
export function chiudiMappa(mappa) {
  mappa.stop(); // senza questo, un'animazione rimasta a metà darebbe errore
  mappa.remove();
}

/** Un segnaposto rotondo colorato, con dentro un numero o un simbolo. */
export function segnaposto(L, testo, colore) {
  return L.divIcon({
    className: 'segnaposto',
    html: `<span style="background:${colore}">${testo}</span>`,
    iconSize: [32, 32],
    iconAnchor: [16, 16],
    popupAnchor: [0, -14],
  });
}

// Un colore per ogni giorno; dopo l'ultimo si ricomincia dal primo.
const COLORI = ['#7b2242', '#1f6fb2', '#2c7a4b', '#c2571a', '#6b4fa3', '#0f7f86'];
export const coloreGiorno = (indice) => COLORI[indice % COLORI.length];
