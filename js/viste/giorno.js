// viste/giorno.js – la pagina di un giorno, con la sua scaletta di attività.
//
// Un giorno è salvato così:
//   { id, data: "2026-11-14", titolo, note, attivita: [ … ] }
// e ogni attività così:
//   { id, ora: "09:30", titolo, luogo: { nome, lat, lon } oppure null, note, fatto: true/false,
//     tappe: [ { nome, lat, lon }, … ]   altri luoghi dopo il primo (passeggiate, giri)
//     mezzo: 'piedi' oppure 'auto'       come si percorrono le tappe }
// Un giorno può stare in una "cartella" (campo `cartella`, es. "Istanbul").

import { tutti, leggi, salva, elimina, leggiImpostazione } from '../db.js';
import { apriScheda, segnalaCampo } from '../scheda.js';
import { apriSchedaLuogo } from '../scheda-luogo.js';
import { analizzaScaletta } from '../scaletta.js';
import { linkNaviga, luoghiDi } from '../luoghi.js';
import { esc, nuovoId, oggi, formattaGiorno, toast } from '../util.js';

/** Attività in ordine di orario; quelle senza orario restano in fondo. */
export function inOrdine(attivita) {
  return [...attivita].sort((a, b) => (a.ora || '99:99').localeCompare(b.ora || '99:99'));
}

export async function mostra(main, id) {
  const [giorno, mappe] = await Promise.all([leggi('giorni', id), leggiImpostazione('mappe', 'apple')]);
  if (!giorno) {
    location.replace('#/itinerario'); // giorno inesistente (es. appena eliminato)
    return;
  }

  const ridisegna = () => mostra(main, id);
  // La freccia "indietro" riporta alla cartella del giorno, se ne ha una.
  const indietro = giorno.cartella ? `#/itinerario/${encodeURIComponent(giorno.cartella)}` : '#/itinerario';
  const attivita = inOrdine(giorno.attivita);
  const fatte = attivita.filter((voce) => voce.fatto).length;

  function rigaAttivita(voce) {
    const luoghi = luoghiDi(voce);
    const link = linkNaviga(voce, mappe);
    return `
      <li class="attivita ${voce.fatto ? 'fatta' : ''}">
        <button class="spunta" role="checkbox" aria-checked="${voce.fatto}" data-spunta="${esc(voce.id)}"
          aria-label="Fatto: ${esc(voce.titolo)}">✓</button>
        <button class="attivita-testo" data-modifica="${esc(voce.id)}">
          ${voce.ora ? `<span class="ora">${esc(voce.ora)}</span>` : ''}
          <strong>${esc(voce.titolo)}</strong>
          ${luoghi.length ? `<small>📍 ${esc(luoghi.map((luogo) => luogo.nome).join(' → '))}</small>` : ''}
          ${voce.note ? `<small>${esc(voce.note)}</small>` : ''}
        </button>
        ${link ? `<a class="tasto-naviga" href="${esc(link)}" target="_blank" rel="noopener">${luoghi.length > 1 ? 'Percorso' : 'Naviga'}</a>` : ''}
      </li>`;
  }

  main.innerHTML = `
    <section class="carta testata-giorno">
      <div>
        <h2>${esc(giorno.titolo) || 'Giorno senza titolo'}</h2>
        ${giorno.note ? `<p class="testo-libero">${esc(giorno.note)}</p>` : ''}
      </div>
      <button class="tasto-testo" id="modifica-giorno">Modifica</button>
    </section>

    <h2 class="titolo-sezione">
      <span>Scaletta</span>
      <span>${attivita.length ? `${fatte} di ${attivita.length} fatte` : ''}</span>
    </h2>
    ${attivita.length
      ? `<ol class="lista" id="scaletta">${attivita.map(rigaAttivita).join('')}</ol>`
      : '<p class="vuoto">Ancora nessuna attività.<br>Aggiungine una, oppure incolla tutta la scaletta da un testo.</p>'}

    <div class="azioni">
      <button class="tasto" id="nuova-attivita">＋ Attività</button>
      <button class="tasto secondario" id="incolla-scaletta">Incolla scaletta</button>
    </div>
    ${attivita.some((voce) => luoghiDi(voce).length > 0)
      ? `<div class="azioni"><a class="tasto secondario" href="#/mappa/${esc(giorno.id)}">🗺️ Mappa del giorno</a></div>`
      : ''}`;

  main.querySelector('#modifica-giorno').addEventListener('click', async () => {
    const esito = await apriSchedaGiorno(giorno);
    if (esito === 'eliminato') location.hash = indietro;
    else if (esito) ridisegna();
  });

  main.querySelector('#nuova-attivita').addEventListener('click', async () => {
    if (await apriSchedaAttivita(giorno)) ridisegna();
  });

  main.querySelector('#incolla-scaletta').addEventListener('click', async () => {
    const quante = await apriSchedaIncolla(giorno);
    if (!quante) return;
    toast(quante === 1 ? 'Aggiunta 1 attività' : `Aggiunte ${quante} attività`);
    ridisegna();
  });

  // Tocchi dentro la scaletta: la spunta segna fatto/da fare, il testo apre la modifica.
  main.querySelector('#scaletta')?.addEventListener('click', async (evento) => {
    const spunta = evento.target.closest('[data-spunta]');
    const testo = evento.target.closest('[data-modifica]');
    if (spunta) {
      const voce = giorno.attivita.find((candidata) => candidata.id === spunta.dataset.spunta);
      voce.fatto = !voce.fatto;
      await salva('giorni', giorno);
      ridisegna();
    } else if (testo) {
      const voce = giorno.attivita.find((candidata) => candidata.id === testo.dataset.modifica);
      if (await apriSchedaAttivita(giorno, voce)) ridisegna();
    }
  });

  // Ciò che viene restituito arriva ad app.js: il titolo per la barra in alto
  // (es. "sabato 14 novembre") e dove porta la freccia "indietro".
  return { titolo: formattaGiorno(giorno.data, { weekday: 'long', day: 'numeric', month: 'long' }), indietro };
}

// ---------- Schede ------------------------------------------------------------

/**
 * Scheda per creare o modificare un giorno. La usa anche la schermata Itinerario.
 * Restituisce il giorno salvato, 'eliminato', oppure null se si è annullato.
 */
export async function apriSchedaGiorno(giorno = null, proposta = {}) {
  // I nomi delle cartelle già usate, da suggerire mentre si scrive.
  const cartelle = [...new Set((await tutti('giorni')).map((altro) => altro.cartella).filter(Boolean))].sort();

  return apriScheda({
    titolo: giorno ? 'Modifica giorno' : 'Nuovo giorno',
    corpo: `
      <label class="campo-etichetta">Data
        <input class="campo" type="date" name="data" required value="${esc(giorno?.data ?? proposta.data ?? oggi())}">
      </label>
      <label class="campo-etichetta">Titolo
        <input class="campo" type="text" name="titolo" autocomplete="off" placeholder="es. Arrivo a Istanbul" value="${esc(giorno?.titolo)}">
      </label>
      <label class="campo-etichetta">Cartella (facoltativa)
        <input class="campo" type="text" name="cartella" list="cartelle-esistenti" autocomplete="off"
          placeholder="es. Istanbul" value="${esc(giorno?.cartella ?? proposta.cartella)}">
        <datalist id="cartelle-esistenti">${cartelle.map((nome) => `<option value="${esc(nome)}">`).join('')}</datalist>
      </label>
      ${cartelle.length ? `
        <div class="pillole a-capo" id="scelta-cartella">
          ${cartelle.map((nome) => `<button type="button" data-cartella="${esc(nome)}">📁 ${esc(nome)}</button>`).join('')}
        </div>` : ''}
      <label class="campo-etichetta">Note
        <textarea class="campo" name="note" placeholder="Voli, prenotazioni, cose da ricordare…">${esc(giorno?.note)}</textarea>
      </label>
      ${giorno ? '<button type="button" class="tasto pericolo largo" data-azione="elimina">Elimina giorno</button>' : ''}`,

    prepara(dialog, chiudi) {
      // Toccando una cartella esistente il suo nome finisce nel campo.
      for (const tasto of dialog.querySelectorAll('[data-cartella]')) {
        tasto.addEventListener('click', () => {
          dialog.querySelector('[name="cartella"]').value = tasto.dataset.cartella;
        });
      }

      dialog.querySelector('[data-azione="elimina"]')?.addEventListener('click', async () => {
        if (!confirm('Eliminare questo giorno e tutta la sua scaletta?')) return;
        await elimina('giorni', giorno.id);
        chiudi('eliminato');
      });
    },

    async alSalvataggio(campi) {
      const daSalvare = {
        id: giorno?.id ?? nuovoId(),
        data: campi.data,
        titolo: campi.titolo.trim(),
        cartella: campi.cartella.trim(),
        note: campi.note.trim(),
        attivita: giorno?.attivita ?? [],
      };
      await salva('giorni', daSalvare);
      return daSalvare;
    },
  });
}

/** Scheda per creare o modificare un'attività del giorno. */
function apriSchedaAttivita(giorno, voce = null) {
  // La posizione sulla mappa scelta dentro questa scheda (se l'utente ne sceglie una).
  let posizioneScelta = null;
  const testoTastoPosizione = (luogo) => (luogo?.lat != null ? '📍 Posizione impostata · cambia' : '📍 Scegli la posizione sulla mappa');

  // Le tappe successive al primo luogo e il modo di spostarsi. Lavoro su una copia:
  // se si annulla la scheda, l'attività resta com'era.
  const tappe = structuredClone(voce?.tappe ?? []);
  let mezzo = voce?.mezzo ?? 'piedi';

  return apriScheda({
    titolo: voce ? 'Modifica attività' : 'Nuova attività',
    corpo: `
      <label class="campo-etichetta">Titolo
        <input class="campo" type="text" name="titolo" required autocomplete="off" placeholder="es. Visita alla cantina" value="${esc(voce?.titolo)}">
      </label>
      <label class="campo-etichetta">Orario (facoltativo)
        <input class="campo" type="time" name="ora" value="${esc(voce?.ora)}">
      </label>
      <label class="campo-etichetta">Luogo (facoltativo)
        <input class="campo" type="text" name="luogo" autocomplete="off" placeholder="Nome o indirizzo" value="${esc(voce?.luogo?.nome)}">
      </label>
      <button type="button" class="tasto secondario largo" data-azione="posizione">${testoTastoPosizione(voce?.luogo)}</button>

      <div class="campo-etichetta">Altre tappe (per passeggiate e giri)
        <ul class="lista" id="elenco-tappe" hidden></ul>
        <button type="button" class="tasto secondario largo" data-azione="aggiungi-tappa">＋ Aggiungi tappa</button>
        <div class="pillole" id="scelta-mezzo" role="group" aria-label="Come ti sposti" hidden>
          <button type="button" data-mezzo="piedi">🚶 A piedi</button>
          <button type="button" data-mezzo="auto">🚗 In auto</button>
        </div>
      </div>

      <label class="campo-etichetta">Note
        <textarea class="campo" name="note">${esc(voce?.note)}</textarea>
      </label>
      ${voce ? '<button type="button" class="tasto pericolo largo" data-azione="elimina">Elimina attività</button>' : ''}`,

    prepara(dialog, chiudi) {
      // Apre la scheda con la mappa; al ritorno ricorda la posizione e aggiorna il nome.
      const tastoPosizione = dialog.querySelector('[data-azione="posizione"]');
      tastoPosizione.addEventListener('click', async () => {
        const campoLuogo = dialog.querySelector('[name="luogo"]');
        const partenza = posizioneScelta ?? voce?.luogo ?? null;
        const scelto = await apriSchedaLuogo({
          nome: campoLuogo.value.trim(),
          lat: partenza?.lat ?? null,
          lon: partenza?.lon ?? null,
        });
        if (!scelto) return;
        posizioneScelta = scelto;
        campoLuogo.value = scelto.nome;
        tastoPosizione.textContent = testoTastoPosizione(scelto);
      });

      // ---- Tappe ----
      const elencoTappe = dialog.querySelector('#elenco-tappe');
      const sceltaMezzo = dialog.querySelector('#scelta-mezzo');

      // Ridisegna l'elenco delle tappe. Si richiama dopo ogni aggiunta, modifica o rimozione.
      function disegnaTappe() {
        elencoTappe.hidden = tappe.length === 0;
        sceltaMezzo.hidden = tappe.length === 0;
        elencoTappe.innerHTML = tappe.map((tappa, indice) => `
          <li class="riga-tappa">
            <button type="button" class="riga" data-tappa="${indice}">
              <span class="numero-tappa">${indice + 2}</span>
              <span class="riga-testo"><strong>${esc(tappa.nome)}</strong><small>${tappa.lat != null ? 'posizione impostata' : 'senza posizione: tocca per sceglierla'}</small></span>
            </button>
            <button type="button" class="tasto-testo" data-togli="${indice}" aria-label="Togli ${esc(tappa.nome)}">✕</button>
          </li>`).join('');
        for (const tasto of sceltaMezzo.querySelectorAll('[data-mezzo]')) {
          tasto.setAttribute('aria-pressed', tasto.dataset.mezzo === mezzo);
        }
      }

      dialog.querySelector('[data-azione="aggiungi-tappa"]').addEventListener('click', async () => {
        const nuova = await apriSchedaLuogo();
        if (!nuova) return;
        tappe.push(nuova);
        disegnaTappe();
      });

      elencoTappe.addEventListener('click', async (evento) => {
        const togli = evento.target.closest('[data-togli]');
        const riga = evento.target.closest('[data-tappa]');
        if (togli) {
          tappe.splice(Number(togli.dataset.togli), 1);
        } else if (riga) {
          const indice = Number(riga.dataset.tappa);
          const modificata = await apriSchedaLuogo(tappe[indice]);
          if (modificata) tappe[indice] = modificata;
        }
        disegnaTappe();
      });

      for (const tasto of sceltaMezzo.querySelectorAll('[data-mezzo]')) {
        tasto.addEventListener('click', () => {
          mezzo = tasto.dataset.mezzo;
          disegnaTappe();
        });
      }
      disegnaTappe();

      dialog.querySelector('[data-azione="elimina"]')?.addEventListener('click', async () => {
        if (!confirm('Eliminare questa attività?')) return;
        giorno.attivita = giorno.attivita.filter((candidata) => candidata.id !== voce.id);
        await salva('giorni', giorno);
        chiudi(true);
      });
    },

    async alSalvataggio(campi) {
      const nomeLuogo = campi.luogo.trim();
      // Quali coordinate tenere:
      //  - quelle scelte ora sulla mappa, se ce ne sono;
      //  - altrimenti quelle già salvate, ma solo se il nome non è cambiato
      //    (se scrivo un altro posto, le vecchie coordinate sarebbero sbagliate).
      let luogo = null;
      if (posizioneScelta) {
        luogo = { ...posizioneScelta, nome: nomeLuogo || posizioneScelta.nome };
      } else if (nomeLuogo) {
        luogo = voce?.luogo?.nome === nomeLuogo ? voce.luogo : { nome: nomeLuogo, lat: null, lon: null };
      }

      const daSalvare = {
        id: voce?.id ?? nuovoId(),
        ora: campi.ora,
        titolo: campi.titolo.trim(),
        luogo,
        tappe,
        mezzo,
        note: campi.note.trim(),
        fatto: voce?.fatto ?? false,
      };
      if (voce) giorno.attivita[giorno.attivita.indexOf(voce)] = daSalvare; // sostituisce
      else giorno.attivita.push(daSalvare);                                 // aggiunge
      await salva('giorni', giorno);
      return true;
    },
  });
}

/** Scheda per incollare una scaletta scritta altrove. Restituisce quante attività ha aggiunto. */
function apriSchedaIncolla(giorno) {
  return apriScheda({
    titolo: 'Incolla scaletta',
    testoSalva: 'Aggiungi',
    corpo: `
      <p class="nota">Una riga per attività. L’orario all’inizio e il luogo dopo la chiocciola sono facoltativi. Per una passeggiata, separa le tappe con &gt;</p>
      <pre class="esempio">9:00 Colazione
10:30 Santa Sofia @ Sultanahmet
13h Pranzo al Gran Bazar
Passeggiata sul Bosforo
16:00 Giro @ Galata &gt; Karaköy &gt; Eminönü</pre>
      <textarea class="campo alto" name="testo" required aria-label="Testo della scaletta" placeholder="Incolla o scrivi qui"></textarea>`,

    async alSalvataggio(campi, dialog) {
      const nuove = analizzaScaletta(campi.testo);
      if (nuove.length === 0) {
        return segnalaCampo(dialog.querySelector('[name="testo"]'), 'Non ho trovato nessuna attività');
      }
      for (const nuova of nuove) {
        giorno.attivita.push({ id: nuovoId(), note: '', fatto: false, ...nuova });
      }
      await salva('giorni', giorno);
      return nuove.length;
    },
  });
}
