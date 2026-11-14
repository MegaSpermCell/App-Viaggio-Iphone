// viste/itinerario.js – schermata "Itinerario": i giorni di viaggio, anche raccolti in cartelle.
//
//   #/itinerario             le cartelle (es. "Istanbul") e i giorni senza cartella
//   #/itinerario/<nome>      i giorni dentro una cartella
//
// Una cartella non è salvata a parte: esiste finché almeno un giorno ha quel
// nome nel suo campo `cartella`. Per questo non c'è nulla da creare o eliminare:
// basta scrivere il nome della cartella nella scheda del giorno.

import { tutti, salva } from '../db.js';
import { apriSchedaGiorno } from './giorno.js';
import { esc, oggi, spostaGiorno, dataDaGiorno, formattaGiorno } from '../util.js';

/** Indirizzo della pagina di una cartella (il nome va "codificato" perché può avere spazi). */
export const linkCartella = (nome) => `#/itinerario/${encodeURIComponent(nome)}`;

function cartaGiorno(giorno) {
  const data = dataDaGiorno(giorno.data);
  const fatte = giorno.attivita.filter((attivita) => attivita.fatto).length;
  const quante = giorno.attivita.length;
  const riassunto = quante === 0 ? 'Nessuna attività' : `${fatte} di ${quante} fatte`;
  return `
    <a class="carta giorno-carta ${giorno.data === oggi() ? 'oggi' : ''}" href="#/giorno/${esc(giorno.id)}">
      <span class="data-blocco">
        <small>${data.toLocaleDateString('it-IT', { weekday: 'short' })}</small>
        <strong>${data.getDate()}</strong>
        <small>${data.toLocaleDateString('it-IT', { month: 'short' })}</small>
      </span>
      <span class="riga-testo">
        <strong>${esc(giorno.titolo) || 'Giorno senza titolo'}</strong>
        <small>${riassunto}</small>
      </span>
      <span class="freccia" aria-hidden="true">›</span>
    </a>`;
}

function cartaCartella(nome, giorni) {
  const breve = { day: 'numeric', month: 'short' };
  const primo = formattaGiorno(giorni[0].data, breve);
  const ultimo = formattaGiorno(giorni.at(-1).data, breve);
  const periodo = primo === ultimo ? primo : `${primo} – ${ultimo}`;
  const quanti = giorni.length === 1 ? '1 giorno' : `${giorni.length} giorni`;
  return `
    <a class="carta giorno-carta cartella-carta ${giorni.some((giorno) => giorno.data === oggi()) ? 'oggi' : ''}" href="${esc(linkCartella(nome))}">
      <span class="data-blocco simbolo-cartella" aria-hidden="true">📁</span>
      <span class="riga-testo">
        <strong>${esc(nome)}</strong>
        <small>${esc(periodo)} · ${quanti}</small>
      </span>
      <span class="freccia" aria-hidden="true">›</span>
    </a>`;
}

export async function mostra(main, parametro) {
  const giorni = await tutti('giorni');
  giorni.sort((a, b) => a.data.localeCompare(b.data)); // dal primo all'ultimo giorno
  const cartellaAperta = parametro ? decodeURIComponent(parametro) : null;

  // Chiede i dati di un giorno nuovo e poi ci entra.
  async function aggiungiGiorno(daMostrare) {
    // Propongo il giorno dopo l'ultimo già inserito (o oggi, se è il primo).
    const ultimo = daMostrare.at(-1);
    const nuovo = await apriSchedaGiorno(null, {
      data: ultimo ? spostaGiorno(ultimo.data, 1) : oggi(),
      cartella: cartellaAperta ?? '',
    });
    if (nuovo) location.hash = `#/giorno/${nuovo.id}`;
  }

  // ---- Dentro una cartella ----
  if (cartellaAperta) {
    const dentro = giorni.filter((giorno) => giorno.cartella === cartellaAperta);
    if (dentro.length === 0) {
      location.replace('#/itinerario'); // cartella rimasta vuota: non esiste più
      return undefined;
    }

    main.innerHTML = `
      ${dentro.map(cartaGiorno).join('')}
      <button class="tasto largo" id="nuovo-giorno">＋ Aggiungi giorno</button>
      <div class="azioni"><button class="tasto secondario" id="rinomina-cartella">Rinomina cartella</button></div>`;

    main.querySelector('#nuovo-giorno').addEventListener('click', () => aggiungiGiorno(dentro));
    main.querySelector('#rinomina-cartella').addEventListener('click', async () => {
      const nuovoNome = prompt('Nuovo nome della cartella', cartellaAperta)?.trim();
      if (!nuovoNome || nuovoNome === cartellaAperta) return;
      for (const giorno of dentro) {
        giorno.cartella = nuovoNome;
        await salva('giorni', giorno);
      }
      location.replace(linkCartella(nuovoNome));
    });
    return { titolo: cartellaAperta, indietro: '#/itinerario' };
  }

  // ---- Elenco principale: cartelle e giorni sciolti, in ordine di data ----
  const cartelle = new Map(); // nome → giorni
  const voci = [];            // ciò che va in elenco: { data, html }
  for (const giorno of giorni) {
    if (!giorno.cartella) {
      voci.push({ data: giorno.data, html: cartaGiorno(giorno) });
    } else if (cartelle.has(giorno.cartella)) {
      cartelle.get(giorno.cartella).push(giorno);
    } else {
      cartelle.set(giorno.cartella, [giorno]);
    }
  }
  for (const [nome, giorniDentro] of cartelle) {
    voci.push({ data: giorniDentro[0].data, html: cartaCartella(nome, giorniDentro) });
  }
  voci.sort((a, b) => a.data.localeCompare(b.data));

  main.innerHTML = `
    ${voci.map((voce) => voce.html).join('') || '<p class="vuoto"><span class="vuoto-simbolo">🗓️</span>Ancora nessun giorno.<br>Aggiungi il primo per iniziare l’itinerario.</p>'}
    <button class="tasto largo" id="nuovo-giorno">＋ Aggiungi giorno</button>
    ${giorni.length > 0 && cartelle.size === 0 ? '<p class="nota">Per raggruppare i giorni (es. «Istanbul», «Bangkok») scrivi il nome di una cartella nella scheda del giorno.</p>' : ''}`;

  main.querySelector('#nuovo-giorno').addEventListener('click', () => aggiungiGiorno(giorni));
  return undefined;
}
