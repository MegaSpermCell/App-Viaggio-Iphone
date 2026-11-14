// scheda-spesa.js – la scheda per aggiungere o modificare una spesa o un'entrata.
//
// Spese ed entrate stanno nello stesso archivio ("spese") e si distinguono dal
// campo `tipo`: 'entrata' per i soldi ricevuti (stipendio, rimborsi…), mentre le
// spese non hanno il campo o hanno 'spesa'. Un'entrata non ha categoria.
//
// Nuova spesa in pochi tocchi:
//   1. si digita l'importo sul tastierino (la valuta proposta è l'ultima usata)
//   2. si tocca la categoria → la spesa viene salvata subito
// Data e ora sono quelle del momento. Nota e cambio di valuta sono facoltativi.
//
// In modifica la scheda è la stessa, ma toccare una categoria la seleziona
// soltanto: si conferma con "Salva", e compaiono data/ora ed "Elimina".

import { apriScheda } from './scheda.js';
import { creaTastierino } from './tastierino.js';
import { salva, elimina, leggiImpostazione, salvaImpostazione } from './db.js';
import { leggiValute, leggiCategorie, VALUTA_BASE } from './dati.js';
import { caricaCambi, tasso } from './cambi.js';
import { esc, nuovoId, leggiNumero, numeroInTesto, formattaImporto, adessoLocale } from './util.js';

/**
 * Apre la scheda.
 *   spesa            la spesa (o entrata) da modificare; se manca se ne crea una nuova
 *   tipo             'spesa' oppure 'entrata', per una voce nuova
 *   importo, valuta  valori già pronti per una spesa nuova (li passa il convertitore)
 * Restituisce una Promise: la spesa salvata, 'eliminata', oppure null se si è annullato.
 */
export async function apriSchedaSpesa({ spesa = null, tipo = 'spesa', importo = '', valuta = null } = {}) {
  const [valute, categorie, cambi, ultimaValuta] = await Promise.all([
    leggiValute(),
    leggiCategorie(),
    caricaCambi(),
    leggiImpostazione('ultimaValuta', VALUTA_BASE),
  ]);
  const inModifica = spesa !== null;
  const eEntrata = (spesa?.tipo ?? tipo) === 'entrata';

  // Lo "stato" raccoglie ciò che l'utente sta scegliendo nella scheda.
  const stato = {
    testo: inModifica ? numeroInTesto(spesa.importo) : importo, // l'importo come viene digitato
    valuta: spesa?.valuta ?? valuta ?? ultimaValuta,
    categoriaId: spesa?.categoriaId ?? null,
  };

  // Se la spesa usa una valuta tolta dall'elenco, la mostro comunque.
  const valuteMostrate = valute.includes(stato.valuta) ? valute : [stato.valuta, ...valute];

  let scheda = null; // l'elemento <dialog>, disponibile da quando la scheda si apre
  const trova = (selettore) => scheda.querySelector(selettore);

  // Quale cambio usare: se modifico una spesa senza cambiarne la valuta tengo
  // il cambio di quel giorno, altrimenti prendo quello attuale.
  function cambioDaUsare() {
    if (inModifica && stato.valuta === spesa.valuta) return spesa.cambio;
    return tasso(cambi, stato.valuta);
  }

  // Aggiorna lo schermo in base allo stato. Si richiama dopo ogni tocco.
  function disegna() {
    trova('#importo-testo').textContent = stato.testo || '0';
    trova('#importo-sigla').textContent = stato.valuta;

    const cambio = cambioDaUsare();
    let inEuro = '';
    if (!cambio) {
      inEuro = `Manca il cambio di ${stato.valuta}: impostalo nelle Impostazioni`;
    } else if (stato.valuta !== VALUTA_BASE) {
      inEuro = `≈ ${formattaImporto(leggiNumero(stato.testo) / cambio, VALUTA_BASE)}`;
    }
    trova('#importo-eur').textContent = inEuro;

    // aria-pressed="true" segna il tasto scelto (il CSS lo colora)
    for (const tasto of scheda.querySelectorAll('[data-valuta]')) {
      tasto.setAttribute('aria-pressed', tasto.dataset.valuta === stato.valuta);
    }
    for (const tasto of scheda.querySelectorAll('[data-categoria]')) {
      tasto.setAttribute('aria-pressed', tasto.dataset.categoria === stato.categoriaId);
    }
  }

  // La riga di testo sopra le categorie: di norma un suggerimento, in rosso se manca qualcosa.
  let SUGGERIMENTO = inModifica ? 'Categoria' : 'Tocca una categoria per salvare';
  if (eEntrata) SUGGERIMENTO = 'Soldi ricevuti: si aggiungono a quanto hai a disposizione';

  function togliSegnalazione() {
    const suggerimento = trova('#suggerimento');
    suggerimento.textContent = SUGGERIMENTO;
    suggerimento.classList.remove('errore');
  }

  // Segnala che manca qualcosa: messaggio in rosso e importo che "si scuote".
  function segnala(messaggio) {
    const suggerimento = trova('#suggerimento');
    suggerimento.textContent = messaggio;
    suggerimento.classList.add('errore');

    const importoGrande = trova('#importo');
    importoGrande.classList.remove('scuoti');
    void importoGrande.offsetWidth; // costringe il browser a far ripartire l'animazione
    importoGrande.classList.add('scuoti');
  }

  // Controlla i dati e salva. Restituisce la spesa salvata, oppure null se manca qualcosa.
  async function salvaSpesa() {
    const numero = leggiNumero(stato.testo);
    const cambio = cambioDaUsare();

    let errore = null;
    if (numero <= 0) errore = 'Scrivi prima l’importo';
    else if (!cambio) errore = `Manca il cambio di ${stato.valuta}`;
    else if (!eEntrata && !stato.categoriaId) errore = 'Scegli una categoria';
    if (errore) {
      segnala(errore);
      return null;
    }

    const daSalvare = {
      id: spesa?.id ?? nuovoId(),
      tipo: eEntrata ? 'entrata' : 'spesa',
      importo: numero,
      valuta: stato.valuta,
      cambio,                       // unità di valuta per 1 €, al momento della spesa
      importoEur: numero / cambio,  // salvato: così i totali non cambiano quando cambia il tasso
      categoriaId: eEntrata ? null : stato.categoriaId,
      nota: trova('[name="nota"]').value.trim(),
      data: trova('[name="data"]')?.value || spesa?.data || adessoLocale(),
      creata: spesa?.creata ?? Date.now(),
    };
    await salva('spese', daSalvare);
    await salvaImpostazione('ultimaValuta', stato.valuta); // la prossima volta sarà già scelta
    return daSalvare;
  }

  const corpo = `
    <div>
      <div class="importo-grande" id="importo"><span id="importo-testo">0</span><span class="sigla" id="importo-sigla"></span></div>
      <p class="importo-eur" id="importo-eur"></p>
    </div>
    <div class="pillole" role="group" aria-label="Valuta">
      ${valuteMostrate.map((codice) => `<button type="button" data-valuta="${esc(codice)}">${esc(codice)}</button>`).join('')}
    </div>
    <input class="campo" type="text" name="nota" placeholder="${eEntrata ? 'Nota (es. Stipendio di novembre)' : 'Nota (facoltativa)'}" aria-label="Nota"
      autocomplete="off" value="${esc(spesa?.nota)}">
    ${inModifica ? `
      <label class="campo-etichetta">Data e ora
        <input class="campo" type="datetime-local" name="data" required value="${esc(spesa.data)}">
      </label>` : ''}
    <div id="posto-tastierino"></div>
    <p class="suggerimento" id="suggerimento">${SUGGERIMENTO}</p>
    ${eEntrata ? '' : `
      <div class="griglia-categorie">
        ${categorie.map((categoria) => `
          <button type="button" data-categoria="${esc(categoria.id)}">
            <span class="emoji">${esc(categoria.emoji)}</span>${esc(categoria.nome)}
          </button>`).join('')}
      </div>`}
    ${eEntrata && !inModifica ? '<button type="button" class="tasto largo" data-azione="aggiungi-entrata">Aggiungi al budget</button>' : ''}
    ${inModifica ? `<button type="button" class="tasto pericolo largo" data-azione="elimina">Elimina ${eEntrata ? 'entrata' : 'spesa'}</button>` : ''}`;

  return apriScheda({
    titolo: `${inModifica ? 'Modifica' : 'Nuova'} ${eEntrata ? 'entrata' : 'spesa'}`,
    corpo,
    testoSalva: inModifica ? 'Salva' : null,

    // Collega i pulsanti della scheda appena creata.
    prepara(dialog, chiudi) {
      scheda = dialog;

      const tastierino = creaTastierino({
        valore: stato.testo,
        alCambio(testo) {
          stato.testo = testo;
          togliSegnalazione();
          disegna();
        },
      });
      trova('#posto-tastierino').append(tastierino.elemento);

      for (const tasto of scheda.querySelectorAll('[data-valuta]')) {
        tasto.addEventListener('click', () => {
          stato.valuta = tasto.dataset.valuta;
          togliSegnalazione();
          disegna();
        });
      }

      for (const tasto of scheda.querySelectorAll('[data-categoria]')) {
        tasto.addEventListener('click', async () => {
          stato.categoriaId = tasto.dataset.categoria;
          disegna();
          if (inModifica) return; // in modifica si conferma con "Salva"

          // Spesa nuova: toccare la categoria salva subito.
          const salvata = await salvaSpesa();
          if (salvata) {
            chiudi(salvata);
          } else {
            stato.categoriaId = null; // non salvata: nessuna categoria resta evidenziata
            disegna();
          }
        });
      }

      // Entrata nuova: non ci sono categorie da toccare, si salva con questo tasto.
      trova('[data-azione="aggiungi-entrata"]')?.addEventListener('click', async () => {
        const salvata = await salvaSpesa();
        if (salvata) chiudi(salvata);
      });

      trova('[data-azione="elimina"]')?.addEventListener('click', async () => {
        if (!confirm(`Eliminare questa ${eEntrata ? 'entrata' : 'spesa'}?`)) return;
        await elimina('spese', spesa.id);
        chiudi('eliminata');
      });

      disegna();
    },

    // Chiamata dal tasto "Salva", che c'è solo in modifica. false = la scheda resta aperta.
    async alSalvataggio() {
      return (await salvaSpesa()) ?? false;
    },
  });
}
