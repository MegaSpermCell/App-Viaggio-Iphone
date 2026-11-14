// viste/itinerario.js – schermata "Itinerario": l'elenco dei giorni di viaggio.

import { tutti } from '../db.js';
import { apriSchedaGiorno } from './giorno.js';
import { esc, oggi, spostaGiorno, dataDaGiorno } from '../util.js';

export async function mostra(main) {
  const giorni = await tutti('giorni');
  giorni.sort((a, b) => a.data.localeCompare(b.data)); // dal primo all'ultimo giorno

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

  main.innerHTML = `
    ${giorni.map(cartaGiorno).join('') || '<p class="vuoto">Ancora nessun giorno.<br>Aggiungi il primo per iniziare l’itinerario.</p>'}
    <button class="tasto largo" id="nuovo-giorno">＋ Aggiungi giorno</button>`;

  main.querySelector('#nuovo-giorno').addEventListener('click', async () => {
    // Propongo il giorno dopo l'ultimo già inserito (o oggi, se è il primo).
    const ultimo = giorni.at(-1);
    const dataProposta = ultimo ? spostaGiorno(ultimo.data, 1) : oggi();
    const nuovo = await apriSchedaGiorno(null, dataProposta);
    if (nuovo) location.hash = `#/giorno/${nuovo.id}`; // si entra subito nel giorno creato
  });
}
