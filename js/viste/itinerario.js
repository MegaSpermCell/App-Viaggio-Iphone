// viste/itinerario.js – schermata "Itinerario": i giorni di viaggio, anche raccolti in cartelle.
//
//   #/itinerario             le cartelle (es. "Istanbul") e i giorni senza cartella
//   #/itinerario/<nome>      i giorni dentro una cartella
//
// Una cartella non è salvata a parte: esiste finché almeno un giorno ha quel
// nome nel suo campo `cartella`. Per questo non c'è nulla da creare o eliminare.
//
// Le cartelle si fanno come sull'iPhone con le app: si tiene premuto un giorno e
// lo si trascina su un altro giorno (nasce una cartella) o su una cartella (ci
// entra). Dentro una cartella, lo si trascina sul riquadro in alto per toglierlo.

import { tutti, salva } from '../db.js';
import { apriSchedaGiorno } from './giorno.js';
import { attivaTrascinamento } from '../trascina.js';
import { esc, oggi, spostaGiorno, dataDaGiorno, formattaGiorno, toast } from '../util.js';

/** Indirizzo della pagina di una cartella (il nome va "codificato" perché può avere spazi). */
export const linkCartella = (nome) => `#/itinerario/${encodeURIComponent(nome)}`;

function cartaGiorno(giorno) {
  const data = dataDaGiorno(giorno.data);
  const fatte = giorno.attivita.filter((attivita) => attivita.fatto).length;
  const quante = giorno.attivita.length;
  const riassunto = quante === 0 ? 'Nessuna attività' : `${fatte} di ${quante} fatte`;
  return `
    <a class="carta giorno-carta ${giorno.data === oggi() ? 'oggi' : ''}" href="#/giorno/${esc(giorno.id)}" data-giorno="${esc(giorno.id)}" draggable="false">
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
    <a class="carta giorno-carta cartella-carta ${giorni.some((giorno) => giorno.data === oggi()) ? 'oggi' : ''}" href="${esc(linkCartella(nome))}" data-cartella="${esc(nome)}" draggable="false">
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
      <div id="elenco-giorni">
        <p class="zona-rilascio" id="fuori-cartella">Tieni premuto un giorno e trascinalo qui per toglierlo dalla cartella</p>
        ${dentro.map(cartaGiorno).join('')}
      </div>
      <button class="tasto largo" id="nuovo-giorno">＋ Aggiungi giorno</button>
      <div class="azioni"><button class="tasto secondario" id="rinomina-cartella">Rinomina cartella</button></div>`;

    // Giorno trascinato sul riquadro in alto: esce dalla cartella.
    attivaTrascinamento(main.querySelector('#elenco-giorni'), {
      trascinabili: '[data-giorno]',
      bersagli: '#fuori-cartella',
      async alRilascio(elemento) {
        const giorno = giorni.find((candidato) => candidato.id === elemento.dataset.giorno);
        giorno.cartella = '';
        await salva('giorni', giorno);
        toast('Giorno tolto dalla cartella');
        mostra(main, parametro);
      },
    });

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
    <div id="elenco-giorni">
      ${voci.map((voce) => voce.html).join('') || '<p class="vuoto"><span class="vuoto-simbolo">🗓️</span>Ancora nessun giorno.<br>Aggiungi il primo per iniziare l’itinerario.</p>'}
    </div>
    <button class="tasto largo" id="nuovo-giorno">＋ Aggiungi giorno</button>
    ${giorni.length > 1 ? '<p class="nota">Per fare una cartella (es. «Istanbul») tieni premuto un giorno e trascinalo sopra un altro giorno o sopra una cartella.</p>' : ''}`;

  // Giorno trascinato su una cartella: ci entra. Su un altro giorno: nasce una cartella.
  attivaTrascinamento(main.querySelector('#elenco-giorni'), {
    trascinabili: '[data-giorno]',
    bersagli: '[data-giorno], [data-cartella]',
    async alRilascio(elemento, bersaglio) {
      const trascinato = giorni.find((giorno) => giorno.id === elemento.dataset.giorno);
      const altro = giorni.find((giorno) => giorno.id === bersaglio.dataset.giorno);

      let nome = bersaglio.dataset.cartella;
      if (altro) {
        nome = prompt('Nome della nuova cartella (es. Istanbul)')?.trim();
        if (!nome) return; // annullato
        altro.cartella = nome;
        await salva('giorni', altro);
      }
      trascinato.cartella = nome;
      await salva('giorni', trascinato);
      toast(altro ? `Cartella «${nome}» creata` : `Spostato in «${nome}»`);
      mostra(main, parametro);
    },
  });

  main.querySelector('#nuovo-giorno').addEventListener('click', () => aggiungiGiorno(giorni));
  return undefined;
}
