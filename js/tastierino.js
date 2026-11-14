// tastierino.js – tastierino numerico a tasti grandi.
//
// Lo usano la scheda "nuova spesa" e il convertitore. Rispetto alla tastiera
// dell'iPhone ha due vantaggi: è sempre aperto (un tocco in meno) e non copre
// il resto dello schermo.
//
// L'importo viene tenuto come TESTO, esattamente come lo si digita ("12,5"),
// e trasformato in numero solo quando serve fare i conti.

const TASTI = ['1', '2', '3', '4', '5', '6', '7', '8', '9', ',', '0', '⌫'];
const MAX_CIFRE_INTERE = 9;
const MAX_DECIMALI = 2;

/**
 * Calcola il nuovo testo dopo la pressione di un tasto.
 *   premi('12', '5') → '125'      premi('12', ',') → '12,'      premi('12,', '⌫') → '12'
 */
export function premi(testo, tasto) {
  if (tasto === '⌫') return testo.slice(0, -1);
  if (tasto === ',') return testo.includes(',') ? testo : `${testo || '0'},`;

  const [interi, decimali] = testo.split(',');
  if (decimali !== undefined) return decimali.length < MAX_DECIMALI ? testo + tasto : testo;
  if (interi === '0') return tasto; // "0" seguito da "5" diventa "5", non "05"
  return interi.length < MAX_CIFRE_INTERE ? testo + tasto : testo;
}

/**
 * Crea un tastierino.
 *   valore    testo iniziale
 *   alCambio  funzione chiamata a ogni tasto, con il nuovo testo
 * Restituisce { elemento, imposta } : `elemento` va inserito nella pagina,
 * `imposta(testo, { daCapo })` cambia il testo da fuori; con daCapo: true il
 * prossimo numero digitato sostituisce il testo invece di accodarsi.
 */
export function creaTastierino({ valore = '', alCambio }) {
  let testo = valore;
  let daCapo = false;

  const elemento = document.createElement('div');
  elemento.className = 'tastierino';
  elemento.innerHTML = TASTI.map((tasto) => {
    const nome = tasto === '⌫' ? 'aria-label="Cancella"' : tasto === ',' ? 'aria-label="Virgola"' : '';
    return `<button type="button" data-tasto="${tasto}" ${nome}>${tasto}</button>`;
  }).join('');

  // Un solo ascoltatore per tutti i tasti: guardo quale è stato toccato.
  elemento.addEventListener('click', (evento) => {
    const tasto = evento.target.closest('button')?.dataset.tasto;
    if (!tasto) return;
    if (daCapo && tasto !== '⌫') testo = '';
    daCapo = false;
    testo = premi(testo, tasto);
    alCambio(testo);
  });

  return {
    elemento,
    imposta(nuovoTesto, { daCapo: ricomincia = false } = {}) {
      testo = nuovoTesto;
      daCapo = ricomincia;
    },
  };
}
