// viste/cambio.js – schermata "Cambio": convertitore fra tutte le tue valute.
//
// Scrivi un importo in una valuta e vedi subito quanto vale in tutte le altre.
// Tocca un'altra riga per scrivere in quella valuta. Funziona anche offline,
// con gli ultimi cambi scaricati.

import { leggiImpostazione } from '../db.js';
import { leggiValute, VALUTA_BASE } from '../dati.js';
import { caricaCambi, converti, aggiornaCambi, descriviAggiornamento } from '../cambi.js';
import { creaTastierino } from '../tastierino.js';
import { apriSchedaSpesa } from '../scheda-spesa.js';
import { esc, bandiera, nomeValuta, formattaNumero, leggiNumero, numeroInTesto, toast } from '../util.js';

// Ciò che è stato digitato resta in memoria finché l'app è aperta: così
// passando a un'altra schermata e tornando qui si ritrova il conto di prima.
const stato = {
  valuta: null, // la valuta in cui si sta scrivendo
  testo: '',    // l'importo come viene digitato, es. "12,5"
};

export async function mostra(main) {
  const [valute, cambi, ultimaValuta] = await Promise.all([
    leggiValute(),
    caricaCambi(),
    leggiImpostazione('ultimaValuta', VALUTA_BASE),
  ]);

  // Alla prima apertura si parte dall'ultima valuta usata per una spesa.
  if (!valute.includes(stato.valuta)) {
    stato.valuta = valute.includes(ultimaValuta) ? ultimaValuta : valute[0];
    stato.testo = '';
  }

  main.innerHTML = `
    <div class="convertitore">
      <div class="righe-valute" id="righe-valute"></div>
      <p class="nota">${esc(descriviAggiornamento(cambi))}</p>
      <div class="azioni">
        <button class="tasto secondario" id="aggiorna-cambi">Aggiorna cambi</button>
        <button class="tasto secondario" id="come-spesa">Salva come spesa</button>
      </div>
      <div id="posto-tastierino"></div>
    </div>`;

  const righe = main.querySelector('#righe-valute');

  // Disegna una riga per valuta. Si richiama a ogni tasto premuto.
  function disegnaRighe() {
    const importo = leggiNumero(stato.testo);

    righe.innerHTML = valute.map((valuta) => {
      const attiva = valuta === stato.valuta;
      const convertito = converti(importo, stato.valuta, valuta, cambi);
      const unitario = converti(1, stato.valuta, valuta, cambi);

      // A destra: l'importo. Nella riga attiva è il testo così come lo si sta scrivendo.
      let cifra = '—';
      if (attiva) cifra = stato.testo || '0';
      else if (convertito !== null) cifra = formattaNumero(convertito);

      // Sotto: il cambio unitario, es. "1 NZD = 0,5006 EUR"
      let dettaglio = `1 ${stato.valuta} = ${unitario === null ? '?' : formattaNumero(unitario, 4)} ${valuta}`;
      if (attiva) dettaglio = 'stai scrivendo qui';
      else if (unitario === null) dettaglio = 'cambio mancante: vedi Impostazioni';
      if (cambi.manuali[valuta]) dettaglio += ' · manuale';

      return `
        <button class="riga riga-valuta" data-valuta="${esc(valuta)}" aria-pressed="${attiva}">
          <span class="bandiera">${bandiera(valuta)}</span>
          <span class="riga-testo"><strong>${esc(valuta)}</strong><small>${esc(nomeValuta(valuta))}</small></span>
          <span class="riga-importo"><strong>${esc(cifra)}</strong><small>${esc(dettaglio)}</small></span>
        </button>`;
    }).join('');
  }

  const tastierino = creaTastierino({
    valore: stato.testo,
    alCambio(testo) {
      stato.testo = testo;
      disegnaRighe();
    },
  });
  main.querySelector('#posto-tastierino').append(tastierino.elemento);

  // Tocco su un'altra riga: quella diventa la valuta in cui si scrive, e si riparte
  // dal valore che mostrava. Il primo numero digitato poi lo sostituisce.
  righe.addEventListener('click', (evento) => {
    const valuta = evento.target.closest('[data-valuta]')?.dataset.valuta;
    if (!valuta || valuta === stato.valuta) return;
    const convertito = converti(leggiNumero(stato.testo), stato.valuta, valuta, cambi);
    stato.valuta = valuta;
    stato.testo = convertito ? numeroInTesto(convertito) : '';
    tastierino.imposta(stato.testo, { daCapo: true });
    disegnaRighe();
  });

  main.querySelector('#aggiorna-cambi').addEventListener('click', async (evento) => {
    evento.currentTarget.disabled = true; // evita richieste doppie mentre si aspetta
    const riuscito = await aggiornaCambi();
    toast(riuscito ? 'Cambi aggiornati' : 'Non riesco ad aggiornare: sei offline?');
    // Ridisegno solo se nel frattempo non si è passati a un'altra schermata
    if (main.dataset.vista === 'cambio') mostra(main);
  });

  // Porta l'importo scritto qui dentro una nuova spesa (resta da scegliere la categoria).
  main.querySelector('#come-spesa').addEventListener('click', async () => {
    const salvata = await apriSchedaSpesa({ importo: stato.testo, valuta: stato.valuta });
    if (salvata) toast('Spesa salvata');
  });

  disegnaRighe();
}
