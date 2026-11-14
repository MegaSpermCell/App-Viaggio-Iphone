// app.js – il punto di partenza dell'app.
//
// Fa tre cose:
//   1. decide quale schermata mostrare guardando l'indirizzo (la parte dopo "#")
//   2. avvia il service worker, che fa funzionare l'app offline
//   3. tiene aggiornati i cambi quando c'è rete

import { chiediPersistenza } from './db.js';
import { aggiornaSeVecchi } from './cambi.js';
import { registraServiceWorker } from './aggiornamenti.js';
import * as spese from './viste/spese.js';
import * as cambio from './viste/cambio.js';
import * as itinerario from './viste/itinerario.js';
import * as giorno from './viste/giorno.js';
import * as mappa from './viste/mappa.js';
import * as impostazioni from './viste/impostazioni.js';

// Le "rotte": a ogni indirizzo corrisponde una schermata.
//   #/spese   #/cambio   #/itinerario   #/giorno/<id>   #/mappa   #/mappa/<id>   #/impostazioni
// Ogni schermata ("vista") è un file in js/viste/ con una funzione mostra().
// Per aggiungerne una: crea il file, importalo qui sopra e aggiungi una riga qui.
const ROTTE = {
  spese: { titolo: 'Spese', vista: spese },
  cambio: { titolo: 'Cambio valuta', vista: cambio },
  itinerario: { titolo: 'Itinerario', vista: itinerario },
  // "scheda" dice quale tasto della barra in basso evidenziare, "indietro" dove porta la freccia
  giorno: { titolo: 'Giorno', vista: giorno, scheda: 'itinerario', indietro: '#/itinerario' },
  mappa: { titolo: 'Mappa', vista: mappa },
  impostazioni: { titolo: 'Impostazioni', vista: impostazioni },
};
const ROTTA_INIZIALE = 'spese';

const contenitore = document.getElementById('vista');
const titolo = document.getElementById('titolo');
const frecciaIndietro = document.getElementById('indietro');

/** Legge l'indirizzo: "#/giorno/abc" → { nome: 'giorno', parametro: 'abc' }. */
function rottaCorrente() {
  const [nome, parametro] = location.hash.replace('#/', '').split('/');
  return { nome: ROTTE[nome] ? nome : ROTTA_INIZIALE, parametro };
}

let paginaPrecedente = null;

/**
 * Riporta tutto all'inizio: lo scorrimento della schermata e anche quello
 * dell'intera pagina, che su iPhone a volte resta spostata verso l'alto
 * (dopo uno scorrimento "a elastico" o dopo la chiusura della tastiera).
 */
function rimettiInAlto() {
  contenitore.scrollTop = 0;
  window.scrollTo(0, 0);
}

/** Disegna la schermata che corrisponde all'indirizzo attuale. */
async function mostraVista() {
  const { nome, parametro } = rottaCorrente();
  const rotta = ROTTE[nome];

  // Barra in alto
  frecciaIndietro.hidden = !rotta.indietro;
  if (rotta.indietro) frecciaIndietro.href = rotta.indietro;

  // Barra in basso: evidenzia la schermata attiva
  for (const link of document.querySelectorAll('.barra-bassa a')) {
    if (link.dataset.scheda === (rotta.scheda ?? nome)) link.setAttribute('aria-current', 'page');
    else link.removeAttribute('aria-current');
  }

  // Cambiando schermata: quella di prima fa pulizia (la mappa libera la memoria),
  // si riparte dall'alto e il contenuto nuovo compare con una dissolvenza.
  const precedente = contenitore.dataset.vista;
  if (precedente !== nome) {
    ROTTE[precedente]?.vista.chiudi?.();
    contenitore.scrollTop = 0;
    contenitore.classList.remove('entra');
    void contenitore.offsetWidth; // fa ripartire l'animazione
    contenitore.classList.add('entra');
  }
  contenitore.dataset.vista = nome; // serve anche al CSS

  // È cambiata la pagina (anche restando nella stessa schermata, per esempio
  // uscendo da una cartella)? Allora si riparte dall'alto: senza questo la pagina
  // nuova comparirebbe già scorsa di quanto lo era quella di prima.
  const pagina = `${nome}/${parametro ?? ''}`;
  const paginaCambiata = pagina !== paginaPrecedente;
  paginaPrecedente = pagina;
  if (paginaCambiata) rimettiInAlto();

  try {
    // La vista può restituire un titolo suo (un testo) oppure { titolo, indietro }
    // per decidere anche dove porta la freccia "indietro".
    const esito = await rotta.vista.mostra(contenitore, parametro);
    const scelte = typeof esito === 'string' ? { titolo: esito } : esito ?? {};
    titolo.textContent = scelte.titolo ?? rotta.titolo;
    if (scelte.indietro) {
      frecciaIndietro.hidden = false;
      frecciaIndietro.href = scelte.indietro;
    }
    if (paginaCambiata) rimettiInAlto(); // di nuovo, ora che il contenuto nuovo è al suo posto
  } catch (errore) {
    console.error(errore);
    contenitore.innerHTML = '<p class="vuoto">Qualcosa è andato storto.<br>Chiudi e riapri l’app.</p>';
  }
}

/** Scarica i cambi se quelli salvati sono vecchi; se è aperto il convertitore lo ridisegna. */
async function controllaCambi() {
  const aggiornati = await aggiornaSeVecchi();
  if (aggiornati && rottaCorrente().nome === 'cambio') mostraVista();
}

// ---------- Avvio --------------------------------------------------------------

// "hashchange" scatta ogni volta che cambia la parte dopo "#" dell'indirizzo:
// toccando un link della barra in basso, o con il gesto "indietro".
window.addEventListener('hashchange', mostraVista);
mostraVista();

chiediPersistenza();      // chiede al telefono di non cancellare mai i dati
registraServiceWorker();  // funzionamento offline e aggiornamenti
controllaCambi();

// Quando si chiude la tastiera (nessun campo ha più il "fuoco"), iOS può lasciare
// la pagina spostata verso l'alto: la rimettiamo a posto.
document.addEventListener('focusout', () => {
  setTimeout(() => {
    const staScrivendo = ['INPUT', 'TEXTAREA', 'SELECT'].includes(document.activeElement?.tagName);
    if (!staScrivendo) window.scrollTo(0, 0);
  }, 100);
});

// Un'app sulla schermata Home resta aperta in sottofondo anche per giorni:
// quando torna in primo piano ricontrolliamo i cambi.
document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'visible') controllaCambi();
});
