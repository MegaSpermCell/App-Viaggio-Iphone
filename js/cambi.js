// cambi.js – tassi di cambio e conversioni fra valute.
//
// Un "tasso" qui significa sempre: quante unità di quella valuta servono per
// comprare 1 euro. Esempio: tasso NZD = 2 vuol dire 1 € = 2 NZD.
//
// I tassi arrivano da Frankfurter, un servizio gratuito e senza registrazione.
// Vengono salvati sul telefono, quindi il convertitore funziona anche offline
// con gli ultimi valori scaricati. Dalle Impostazioni puoi anche scrivere un
// tasso a mano (per esempio quello che ti applica davvero la banca): il tasso
// manuale vince su quello scaricato finché non lo togli.

import { leggiImpostazione, salvaImpostazione } from './db.js';
import { VALUTA_BASE } from './dati.js';
import { giornoLocale, oggi } from './util.js';

// Valori di partenza, usati solo finché l'app non riesce a scaricarli da sé.
const DATA_CAMBI_INIZIALI = '13 novembre 2026';
const CAMBI_INIZIALI = {
  tassi: { EUR: 1, NZD: 1.9978, THB: 37.483, TRY: 55.6667, USD: 1.1052 },
  manuali: {},       // tassi scritti a mano, es. { TRY: 56.2 }
  aggiornato: null,  // momento dell'ultimo download riuscito (null = mai)
};

// Dove scaricare i tassi. Se il primo indirizzo non risponde si prova il secondo.
// `leggi` trasforma la risposta nel formato che usiamo noi: { NZD: 1.99, THB: 37.5, … }
const FONTI = [
  {
    url: 'https://api.frankfurter.dev/v2/rates?base=EUR',
    // risposta: [ { "quote": "NZD", "rate": 1.9969, … }, … ]
    leggi: (risposta) => Object.fromEntries(risposta.map((riga) => [riga.quote, riga.rate])),
  },
  {
    url: 'https://api.frankfurter.dev/v1/latest?base=EUR',
    // risposta: { "rates": { "NZD": 1.9978, … } }
    leggi: (risposta) => risposta.rates,
  },
];

const SEI_ORE = 6 * 60 * 60 * 1000; // in millisecondi

/** I cambi salvati sul telefono (o quelli di partenza, la prima volta). */
export function caricaCambi() {
  return leggiImpostazione('cambi', structuredClone(CAMBI_INIZIALI));
}

/** Tasso di una valuta: quello manuale se c'è, altrimenti quello scaricato. null se manca. */
export function tasso(cambi, valuta) {
  if (valuta === VALUTA_BASE) return 1;
  return cambi.manuali[valuta] ?? cambi.tassi[valuta] ?? null;
}

/**
 * Converte un importo da una valuta a un'altra passando per l'euro.
 * Restituisce null se manca il tasso di una delle due valute.
 */
export function converti(importo, da, a, cambi) {
  const tassoDa = tasso(cambi, da);
  const tassoA = tasso(cambi, a);
  if (!tassoDa || !tassoA) return null;
  return (importo / tassoDa) * tassoA;
}

/** Scarica i tassi aggiornati. Restituisce true se ci è riuscita. */
export async function aggiornaCambi() {
  if (!navigator.onLine) return false; // senza rete è inutile provare

  for (const fonte of FONTI) {
    try {
      // Se il servizio non risponde entro 10 secondi lasciamo perdere
      const risposta = await fetch(fonte.url, { signal: AbortSignal.timeout(10_000) });
      if (!risposta.ok) continue;
      const tassi = fonte.leggi(await risposta.json());
      if (!(tassi?.USD > 0)) continue; // controllo minimo: la risposta ha senso?

      const cambi = await caricaCambi();
      cambi.tassi = { ...tassi, [VALUTA_BASE]: 1 };
      cambi.aggiornato = Date.now();
      await salvaImpostazione('cambi', cambi);
      return true;
    } catch {
      // rete assente o risposta illeggibile: si passa alla fonte successiva
    }
  }
  return false;
}

/** Aggiorna i tassi solo se quelli salvati hanno più di sei ore. */
export async function aggiornaSeVecchi() {
  const cambi = await caricaCambi();
  const sonoRecenti = cambi.aggiornato && Date.now() - cambi.aggiornato < SEI_ORE;
  return sonoRecenti ? false : aggiornaCambi();
}

/** Imposta un tasso a mano. Con valore null si torna al tasso scaricato. */
export async function impostaCambioManuale(valuta, valore) {
  const cambi = await caricaCambi();
  if (valore) cambi.manuali[valuta] = valore;
  else delete cambi.manuali[valuta];
  await salvaImpostazione('cambi', cambi);
}

/** Frase che dice quanto sono recenti i cambi, es. "Cambi aggiornati oggi alle 14:32." */
export function descriviAggiornamento(cambi) {
  if (!cambi.aggiornato) {
    return `Cambi indicativi del ${DATA_CAMBI_INIZIALI}: si aggiorneranno appena c'è rete.`;
  }
  const quando = new Date(cambi.aggiornato);
  const giorno = giornoLocale(quando) === oggi()
    ? 'oggi'
    : `il ${quando.toLocaleDateString('it-IT', { day: 'numeric', month: 'long' })}`;
  const ora = quando.toLocaleTimeString('it-IT', { hour: '2-digit', minute: '2-digit' });
  return `Cambi aggiornati ${giorno} alle ${ora}.`;
}
