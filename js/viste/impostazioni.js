// viste/impostazioni.js – schermata "Impostazioni": valute e cambi, categorie,
// tipo di mappa, backup dei dati e aggiornamento dell'app.

import { leggiImpostazione, salvaImpostazione, datiProtetti } from '../db.js';
import { leggiValute, salvaValute, leggiCategorie, salvaCategorie, VALUTA_BASE } from '../dati.js';
import { caricaCambi, tasso, aggiornaCambi, impostaCambioManuale, descriviAggiornamento } from '../cambi.js';
import { preparaBackup, preparaCsv, consegnaFile, segnaBackupFatto, leggiBackup, ripristinaBackup } from '../backup.js';
import { controllaAggiornamenti, reinstallaFile, versioneApp } from '../aggiornamenti.js';
import { apriScheda, segnalaCampo } from '../scheda.js';
import { esc, nuovoId, bandiera, nomeValuta, formattaNumero, leggiNumero, numeroInTesto, toast } from '../util.js';

// I file da esportare vengono preparati quando la schermata si disegna, non al
// tocco del pulsante. Motivo: su iPhone il foglio "Condividi" si apre solo se
// viene chiamato subito dopo il tocco, senza attese in mezzo.
let filePronti = { backup: null, csv: null };

export async function mostra(main) {
  const [valute, categorie, cambi, mappe, ultimoBackup, protetti, versione] = await Promise.all([
    leggiValute(),
    leggiCategorie(),
    caricaCambi(),
    leggiImpostazione('mappe', 'apple'),
    leggiImpostazione('ultimoBackup', null),
    datiProtetti(),
    versioneApp(),
  ]);
  filePronti = { backup: await preparaBackup(), csv: await preparaCsv() };

  const ridisegna = () => {
    if (main.dataset.vista === 'impostazioni') mostra(main);
  };

  function rigaValuta(valuta) {
    const valore = tasso(cambi, valuta);
    let dettaglio = `1 € = ${valore ? formattaNumero(valore, 4) : '?'} ${valuta}`;
    if (valuta === VALUTA_BASE) dettaglio = 'valuta di base: i totali sono in euro';
    else if (cambi.manuali[valuta]) dettaglio += ' · manuale';
    else if (!valore) dettaglio = 'cambio mancante: tocca per impostarlo';

    const contenuto = `
      <span class="bandiera">${bandiera(valuta)}</span>
      <span class="riga-testo"><strong>${esc(valuta)} · ${esc(nomeValuta(valuta))}</strong><small>${esc(dettaglio)}</small></span>`;
    // L'euro non si tocca; le altre righe aprono la scheda della valuta.
    return valuta === VALUTA_BASE
      ? `<li><div class="riga">${contenuto}</div></li>`
      : `<li><button class="riga" data-valuta="${esc(valuta)}">${contenuto}<span class="freccia" aria-hidden="true">›</span></button></li>`;
  }

  const rigaCategoria = (categoria) => `
    <li><button class="riga" data-categoria="${esc(categoria.id)}">
      <span class="emoji">${esc(categoria.emoji)}</span>
      <span class="riga-testo"><strong>${esc(categoria.nome)}</strong></span>
      <span class="freccia" aria-hidden="true">›</span>
    </button></li>`;

  const quandoBackup = ultimoBackup
    ? `Ultimo backup: ${new Date(ultimoBackup).toLocaleDateString('it-IT', { day: 'numeric', month: 'long', year: 'numeric' })}.`
    : 'Non hai ancora fatto un backup.';
  const protezione = protetti
    ? 'I dati sono salvati su questo telefono in modo protetto.'
    : 'I dati sono salvati su questo telefono. Aggiungi l’app alla schermata Home perché restino al sicuro.';

  main.innerHTML = `
    <h2 class="titolo-sezione">Valute e cambi</h2>
    <ul class="lista">${valute.map(rigaValuta).join('')}</ul>
    <p class="nota">${esc(descriviAggiornamento(cambi))}</p>
    <div class="azioni">
      <button class="tasto secondario" id="aggiorna-cambi">Aggiorna cambi</button>
      <button class="tasto secondario" id="aggiungi-valuta">＋ Valuta</button>
    </div>

    <h2 class="titolo-sezione">Categorie di spesa</h2>
    <ul class="lista">${categorie.map(rigaCategoria).join('')}</ul>
    <div class="azioni"><button class="tasto secondario" id="aggiungi-categoria">＋ Categoria</button></div>

    <h2 class="titolo-sezione">Il tasto «Naviga» apre</h2>
    <div class="pillole" role="group" aria-label="App per la navigazione">
      <button data-mappe="apple" aria-pressed="${mappe === 'apple'}">Apple Maps</button>
      <button data-mappe="google" aria-pressed="${mappe === 'google'}">Google Maps</button>
    </div>

    <h2 class="titolo-sezione">Backup dei dati</h2>
    <div class="colonna">
      <button class="tasto largo" id="esporta-backup">Esporta backup (JSON)</button>
      <button class="tasto secondario largo" id="esporta-csv">Esporta spese (CSV)</button>
      <label class="tasto secondario largo">Importa backup…
        <input class="solo-lettori" type="file" id="importa-backup" accept=".json,application/json">
      </label>
    </div>
    <p class="nota">${esc(quandoBackup)} ${esc(protezione)}</p>

    <h2 class="titolo-sezione">App</h2>
    <div class="colonna">
      <button class="tasto secondario largo" id="controlla-aggiornamenti">Controlla aggiornamenti</button>
    </div>
    <p class="nota">Viaggio, versione ${esc(versione)}.</p>`;

  const trova = (selettore) => main.querySelector(selettore);

  // ---- Valute e cambi ----

  for (const riga of main.querySelectorAll('[data-valuta]')) {
    riga.addEventListener('click', async () => {
      if (await apriSchedaValuta(riga.dataset.valuta, valute, cambi)) ridisegna();
    });
  }

  trova('#aggiorna-cambi').addEventListener('click', async (evento) => {
    evento.currentTarget.disabled = true; // evita richieste doppie mentre si aspetta
    const riuscito = await aggiornaCambi();
    toast(riuscito ? 'Cambi aggiornati' : 'Non riesco ad aggiornare: sei offline?');
    ridisegna();
  });

  trova('#aggiungi-valuta').addEventListener('click', async () => {
    const codice = await apriSchedaNuovaValuta(valute);
    if (!codice) return;
    ridisegna();
    // Valuta senza cambio online: si apre subito la sua scheda per scriverlo a mano.
    if (!tasso(cambi, codice)) {
      if (await apriSchedaValuta(codice, valute, cambi)) ridisegna();
    }
  });

  // ---- Categorie ----

  for (const riga of main.querySelectorAll('[data-categoria]')) {
    riga.addEventListener('click', async () => {
      const categoria = categorie.find((candidata) => candidata.id === riga.dataset.categoria);
      if (await apriSchedaCategoria(categoria, categorie)) ridisegna();
    });
  }
  trova('#aggiungi-categoria').addEventListener('click', async () => {
    if (await apriSchedaCategoria(null, categorie)) ridisegna();
  });

  // ---- Mappe ----

  for (const tasto of main.querySelectorAll('[data-mappe]')) {
    tasto.addEventListener('click', async () => {
      await salvaImpostazione('mappe', tasto.dataset.mappe);
      ridisegna();
    });
  }

  // ---- Backup ----

  trova('#esporta-backup').addEventListener('click', async () => {
    const consegnato = await consegnaFile(filePronti.backup);
    if (!consegnato) return;
    await segnaBackupFatto();
    toast('Backup esportato');
    ridisegna();
  });

  trova('#esporta-csv').addEventListener('click', () => consegnaFile(filePronti.csv));

  // "change" scatta quando l'utente ha scelto un file.
  trova('#importa-backup').addEventListener('change', async (evento) => {
    const file = evento.target.files[0];
    if (!file) return;
    try {
      const dati = await leggiBackup(file);
      const domanda = `Il backup contiene ${dati.spese.length} spese e ${dati.giorni.length} giorni.\n`
        + 'Importandolo, i dati che ora sono su questo telefono verranno sostituiti. Continuare?';
      if (confirm(domanda)) {
        await ripristinaBackup(dati);
        toast('Backup importato');
      }
    } catch (errore) {
      alert(errore.message);
    }
    ridisegna();
  });

  // ---- App ----

  trova('#controlla-aggiornamenti').addEventListener('click', async () => {
    const messaggi = {
      nuova: 'Nuova versione trovata: tocca «Aggiorna» in alto',
      aggiornata: 'Hai già l’ultima versione',
      offline: 'Sei offline: riprova quando c’è rete',
      'non-disponibile': 'Aggiornamenti non disponibili in questo browser',
    };
    const esito = await controllaAggiornamenti();
    if (esito !== 'bloccata') {
      toast(messaggi[esito]);
      return;
    }
    // Online c'è una versione nuova ma il telefono non riesce a prenderla nel modo normale.
    const domanda = 'C’è una versione nuova, ma l’aggiornamento automatico non parte.\n'
      + 'Vuoi scaricare di nuovo i file dell’app? I tuoi dati non vengono toccati.';
    if (confirm(domanda)) reinstallaFile();
  });
}

// ---------- Schede ------------------------------------------------------------

/** Scheda di una valuta: cambio manuale, ritorno al cambio online, rimozione. */
function apriSchedaValuta(valuta, valute, cambi) {
  const online = cambi.tassi[valuta] ?? null;
  const manuale = cambi.manuali[valuta] ?? null;
  const attuale = manuale ?? online;

  return apriScheda({
    titolo: `${bandiera(valuta)} ${valuta}`,
    corpo: `
      <label class="campo-etichetta">Quanti ${esc(valuta)} per 1 euro
        <input class="campo" name="cambio" inputmode="decimal" autocomplete="off" required
          value="${attuale ? numeroInTesto(attuale, 4) : ''}" placeholder="es. 1,95">
      </label>
      <p class="nota">${online
        ? `Cambio online: 1 € = ${formattaNumero(online, 4)} ${esc(valuta)}. Se scrivi un valore diverso (per esempio quello della tua banca), l’app userà il tuo finché non torni al cambio online.`
        : 'Per questa valuta non c’è un cambio online: va scritto a mano.'}</p>
      ${manuale && online ? '<button type="button" class="tasto secondario largo" data-azione="online">Torna al cambio online</button>' : ''}
      <button type="button" class="tasto pericolo largo" data-azione="rimuovi">Togli ${esc(valuta)} dall’elenco</button>`,

    prepara(dialog, chiudi) {
      dialog.querySelector('[data-azione="online"]')?.addEventListener('click', async () => {
        await impostaCambioManuale(valuta, null);
        chiudi(true);
      });
      dialog.querySelector('[data-azione="rimuovi"]').addEventListener('click', async () => {
        if (!confirm(`Togliere ${valuta} dall’elenco? Le spese già inserite in ${valuta} restano.`)) return;
        await salvaValute(valute.filter((codice) => codice !== valuta));
        chiudi(true);
      });
    },

    async alSalvataggio(campi, dialog) {
      const valore = leggiNumero(campi.cambio);
      if (valore <= 0) return segnalaCampo(dialog.querySelector('[name="cambio"]'), 'Scrivi un numero maggiore di zero');
      // Se il valore è uguale a quello online non serve tenerlo come "manuale".
      const ugualeOnline = online && numeroInTesto(online, 4) === numeroInTesto(valore, 4);
      await impostaCambioManuale(valuta, ugualeOnline ? null : valore);
      return true;
    },
  });
}

/** Scheda per aggiungere una valuta. Restituisce il codice aggiunto (es. "USD"). */
function apriSchedaNuovaValuta(valute) {
  return apriScheda({
    titolo: 'Nuova valuta',
    testoSalva: 'Aggiungi',
    corpo: `
      <label class="campo-etichetta">Codice della valuta (3 lettere)
        <input class="campo" name="codice" required maxlength="3" autocomplete="off" autocorrect="off"
          autocapitalize="characters" placeholder="es. USD">
      </label>
      <p class="nota">Esempi: USD dollaro americano, AUD dollaro australiano, AED dirham degli Emirati, SGD dollaro di Singapore, GBP sterlina.</p>`,

    async alSalvataggio(campi, dialog) {
      const codice = campi.codice.trim().toUpperCase();
      const campo = dialog.querySelector('[name="codice"]');
      if (!/^[A-Z]{3}$/.test(codice)) return segnalaCampo(campo, 'Servono esattamente 3 lettere, es. USD');
      if (valute.includes(codice)) return segnalaCampo(campo, `${codice} è già nell’elenco`);
      valute.push(codice);
      await salvaValute(valute);
      return codice;
    },
  });
}

/** Scheda per creare o modificare una categoria di spesa. */
function apriSchedaCategoria(categoria, categorie) {
  return apriScheda({
    titolo: categoria ? 'Modifica categoria' : 'Nuova categoria',
    corpo: `
      <label class="campo-etichetta">Nome
        <input class="campo" type="text" name="nome" required autocomplete="off" value="${esc(categoria?.nome)}" placeholder="es. Regali">
      </label>
      <label class="campo-etichetta">Simbolo (un’emoji)
        <input class="campo" type="text" name="emoji" autocomplete="off" value="${esc(categoria?.emoji ?? '🏷️')}">
      </label>
      ${categoria ? '<button type="button" class="tasto pericolo largo" data-azione="elimina">Elimina categoria</button>' : ''}`,

    prepara(dialog, chiudi) {
      dialog.querySelector('[data-azione="elimina"]')?.addEventListener('click', async () => {
        if (categorie.length === 1) return alert('Deve restare almeno una categoria.');
        if (!confirm(`Eliminare «${categoria.nome}»? Le spese già inserite restano, ma risulteranno «Senza categoria».`)) return;
        await salvaCategorie(categorie.filter((candidata) => candidata.id !== categoria.id));
        chiudi(true);
      });
    },

    async alSalvataggio(campi) {
      const nuova = {
        ...categoria, // in modifica conserva l'id e gli altri dati della categoria
        id: categoria?.id ?? nuovoId(),
        nome: campi.nome.trim(),
        emoji: campi.emoji.trim() || '🏷️',
      };
      if (categoria) categorie[categorie.indexOf(categoria)] = nuova;
      else categorie.push(nuova);
      await salvaCategorie(categorie);
      return true;
    },
  });
}
