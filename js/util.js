// util.js – piccole funzioni di aiuto usate in tutta l'app.

// ---------- Testo e identificativi ----------------------------------------

/**
 * Rende innocuo un testo scritto dall'utente prima di metterlo dentro l'HTML.
 * Senza questo, una nota come "<b>ciao" verrebbe letta come codice HTML.
 */
export function esc(testo) {
  const sostituti = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };
  return String(testo ?? '').replace(/[&<>"']/g, (carattere) => sostituti[carattere]);
}

/** Crea un identificativo unico per una nuova spesa, un giorno, un'attività… */
export function nuovoId() {
  return crypto.randomUUID();
}

// ---------- Numeri e valute -----------------------------------------------

/** 12.5 → "12,50" e 3750.7 → "3.750,70" (stile italiano). */
export function formattaNumero(numero, decimali = 2) {
  return numero.toLocaleString('it-IT', {
    minimumFractionDigits: decimali,
    maximumFractionDigits: decimali,
    useGrouping: 'always', // il punto delle migliaia anche sui numeri di quattro cifre
  });
}

/**
 * 12.5 e "NZD" → "12,50 NZD"; con "EUR" → "12,50 €".
 * Per le valute straniere si usa sempre il codice di tre lettere: è più chiaro
 * dei simboli (il "$" potrebbe essere neozelandese, americano, australiano…).
 */
export function formattaImporto(numero, valuta) {
  return `${formattaNumero(numero)} ${valuta === 'EUR' ? '€' : valuta}`;
}

/** "12,5" (o "12.5") → 12.5. Se il testo non è un numero restituisce 0. */
export function leggiNumero(testo) {
  const numero = parseFloat(String(testo).trim().replace(',', '.'));
  return Number.isFinite(numero) ? numero : 0;
}

/** 12.5 → "12,5": il contrario di leggiNumero, per rimettere un numero nel tastierino. */
export function numeroInTesto(numero, decimali = 2) {
  return String(Number(numero.toFixed(decimali))).replace('.', ',');
}

/**
 * Bandierina di una valuta. Le prime due lettere del codice sono quasi sempre
 * la sigla del paese (NZD → NZ): ogni lettera diventa un "simbolo regionale"
 * e due simboli vicini vengono disegnati dal telefono come una bandiera.
 */
export function bandiera(valuta) {
  const PRIMO_SIMBOLO = 0x1f1e6; // il simbolo regionale della lettera A
  return [...valuta.slice(0, 2).toUpperCase()]
    .map((lettera) => String.fromCodePoint(PRIMO_SIMBOLO + lettera.charCodeAt(0) - 65))
    .join('');
}

const nomiValute = new Intl.DisplayNames(['it'], { type: 'currency' });

/** "NZD" → "dollaro neozelandese". Se il codice è sconosciuto restituisce il codice. */
export function nomeValuta(codice) {
  try {
    return nomiValute.of(codice);
  } catch {
    return codice;
  }
}

// ---------- Date ------------------------------------------------------------
//
// In viaggio si cambia fuso orario. Per questo l'app salva data e ora "come le
// leggi sull'orologio" nel posto in cui ti trovi, in forma di testo:
//     giorno:        "2026-11-14"
//     giorno e ora:  "2026-11-14T09:30"
// Così una cena pagata alle 21 a Istanbul resta alle 21 di quel giorno anche
// quando la riguardi dalla Nuova Zelanda. Scritte in questo modo, inoltre, le
// date si mettono in ordine semplicemente in ordine alfabetico.

const dueCifre = (numero) => String(numero).padStart(2, '0');

/** Giorno in forma "2026-11-14", secondo l'orologio del telefono. */
export function giornoLocale(data = new Date()) {
  return `${data.getFullYear()}-${dueCifre(data.getMonth() + 1)}-${dueCifre(data.getDate())}`;
}

/** Giorno e ora in forma "2026-11-14T09:30", secondo l'orologio del telefono. */
export function adessoLocale() {
  const ora = new Date();
  return `${giornoLocale(ora)}T${dueCifre(ora.getHours())}:${dueCifre(ora.getMinutes())}`;
}

export const oggi = () => giornoLocale();

/** "2026-11-14" → oggetto Date. (new Date("2026-11-14") sbaglierebbe giorno in certi fusi orari.) */
export function dataDaGiorno(giorno) {
  const [anno, mese, numero] = giorno.split('-').map(Number);
  return new Date(anno, mese - 1, numero);
}

/** Sposta un giorno avanti o indietro: ("2026-11-14", 1) → "2026-11-15". */
export function spostaGiorno(giorno, quanti) {
  const data = dataDaGiorno(giorno);
  data.setDate(data.getDate() + quanti);
  return giornoLocale(data);
}

/** "2026-11-14" → "sab 14 nov". Con altre opzioni cambia il formato. */
export function formattaGiorno(giorno, opzioni = { weekday: 'short', day: 'numeric', month: 'short' }) {
  return dataDaGiorno(giorno).toLocaleDateString('it-IT', opzioni);
}

/** Come formattaGiorno, ma scrive "Oggi" e "Ieri" quando è il caso. */
export function etichettaGiorno(giorno) {
  if (giorno === oggi()) return 'Oggi';
  if (giorno === spostaGiorno(oggi(), -1)) return 'Ieri';
  return formattaGiorno(giorno);
}

// ---------- Messaggi --------------------------------------------------------

let timerToast;

/** Mostra per qualche secondo un breve messaggio in alto (es. "Spesa salvata"). */
export function toast(messaggio) {
  const elemento = document.getElementById('toast');
  elemento.textContent = messaggio;
  elemento.classList.add('visibile');
  clearTimeout(timerToast);
  timerToast = setTimeout(() => elemento.classList.remove('visibile'), 2600);
}
