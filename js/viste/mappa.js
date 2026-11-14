// viste/mappa.js – schermata "Mappa": i luoghi dell'itinerario su una mappa.
//
//   #/mappa            tutti i giorni, un colore per giorno
//   #/mappa/<id>       un giorno solo
// I luoghi di ogni giorno sono numerati nell'ordine della scaletta e uniti da una linea.

import { tutti, salva, leggiImpostazione } from '../db.js';
import { creaMappa, chiudiMappa, segnaposto, coloreGiorno } from '../mappa.js';
import { cercaLuogo, linkNaviga, luoghiDi } from '../luoghi.js';
import { inOrdine } from './giorno.js';
import { esc, formattaGiorno, toast } from '../util.js';

let mappaAperta = null;

/** Chiamata da app.js quando si lascia la schermata: libera la memoria della mappa. */
export function chiudi() {
  if (mappaAperta) chiudiMappa(mappaAperta);
  mappaAperta = null;
}

export async function mostra(main, idGiorno) {
  chiudi();
  const [giorni, mappe] = await Promise.all([tutti('giorni'), leggiImpostazione('mappe', 'apple')]);
  giorni.sort((a, b) => a.data.localeCompare(b.data));
  const giornoScelto = giorni.find((giorno) => giorno.id === idGiorno) ?? null;

  // Raccolgo le attività che hanno un luogo, giorno per giorno.
  const gruppi = [];          // un gruppo per giorno: { giorno, colore, punti: [...] }
  const senzaPosizione = [];  // attività con il nome di un luogo ma senza coordinate
  giorni.forEach((giorno, indice) => {
    if (giornoScelto && giorno !== giornoScelto) return;
    // Un "punto" per ogni luogo: un'attività con tre tappe dà tre punti.
    const luoghi = inOrdine(giorno.attivita).flatMap((voce) => luoghiDi(voce).map((luogo) => ({ voce, luogo })));
    const punti = luoghi.filter((punto) => punto.luogo.lat != null);
    senzaPosizione.push(...luoghi.filter((punto) => punto.luogo.lat == null).map((punto) => ({ giorno, luogo: punto.luogo })));
    if (punti.length > 0) gruppi.push({ giorno, colore: coloreGiorno(indice), punti });
  });
  const quantiPunti = gruppi.reduce((totale, gruppo) => totale + gruppo.punti.length, 0);

  // Filtro per giorno: sono normali link, quindi a ridisegnare ci pensa app.js.
  const filtro = `
    <nav class="filtro-giorni" aria-label="Giorno da mostrare">
      <a href="#/mappa" ${giornoScelto ? '' : 'aria-current="true"'}>Tutti</a>
      ${giorni.map((giorno) => `
        <a href="#/mappa/${esc(giorno.id)}" ${giorno === giornoScelto ? 'aria-current="true"' : ''}>
          ${esc(formattaGiorno(giorno.data, { day: 'numeric', month: 'short' }))}
        </a>`).join('')}
    </nav>`;

  if (quantiPunti === 0 && senzaPosizione.length === 0) {
    main.innerHTML = `
      ${giorni.length > 0 ? filtro : ''}
      <p class="vuoto"><span class="vuoto-simbolo">🗺️</span>Qui compariranno i luoghi del viaggio.<br>
      Aggiungi un luogo a un’attività dell’<a href="#/itinerario">Itinerario</a>.</p>`;
    return giornoScelto ? `Mappa · ${formattaGiorno(giornoScelto.data, { day: 'numeric', month: 'short' })}` : undefined;
  }

  const avviso = senzaPosizione.length > 0 ? `
    <p class="avviso">
      <span>${senzaPosizione.length === 1 ? '1 luogo non ha ancora una posizione.' : `${senzaPosizione.length} luoghi non hanno ancora una posizione.`}</span>
      <button class="tasto-testo" id="trova-posizioni">Trovali</button>
    </p>` : '';

  main.innerHTML = `${filtro}${avviso}<div class="mappa" id="mappa-viaggio"></div>`;

  // ---- Disegno della mappa ----
  const { L, mappa } = await creaMappa(main.querySelector('#mappa-viaggio'));
  mappaAperta = mappa;
  const tuttiIPunti = [];

  for (const { giorno, colore, punti } of gruppi) {
    const percorso = punti.map((punto) => [punto.luogo.lat, punto.luogo.lon]);
    tuttiIPunti.push(...percorso);
    if (percorso.length > 1) L.polyline(percorso, { color: colore, weight: 3, opacity: 0.7, dashArray: '6 6' }).addTo(mappa);

    punti.forEach(({ voce, luogo }, indice) => {
      const quando = [formattaGiorno(giorno.data), voce.ora].filter(Boolean).join(' · ');
      const quantiLuoghi = luoghiDi(voce).length;
      L.marker([luogo.lat, luogo.lon], { icon: segnaposto(L, indice + 1, colore), title: voce.titolo })
        .addTo(mappa)
        .bindPopup(`
          <strong>${indice + 1}. ${esc(voce.titolo)}</strong><br>
          ${esc(quando)}<br>
          📍 ${esc(luogo.nome)}<br>
          <a class="popup-naviga" href="${esc(linkNaviga(quantiLuoghi > 1 ? voce : { luogo }, mappe))}" target="_blank" rel="noopener">${quantiLuoghi > 1 ? 'Percorso' : 'Naviga'}</a>
          · <a class="popup-naviga" href="#/giorno/${esc(giorno.id)}">Apri il giorno</a>`);
    });
  }
  // Inquadra tutti i punti, senza avvicinarsi troppo se sono pochi o vicini.
  if (tuttiIPunti.length > 0) mappa.fitBounds(L.latLngBounds(tuttiIPunti), { padding: [40, 40], maxZoom: 15 });

  // ---- "Trovali": cerca la posizione dei luoghi che hanno solo il nome ----
  main.querySelector('#trova-posizioni')?.addEventListener('click', async (evento) => {
    const tasto = evento.currentTarget;
    tasto.disabled = true;
    let trovati = 0;
    try {
      for (const [indice, { giorno, luogo }] of senzaPosizione.entries()) {
        tasto.textContent = `${indice + 1} di ${senzaPosizione.length}…`;
        const [primo] = await cercaLuogo(luogo.nome); // una richiesta al secondo: ci pensa cercaLuogo
        if (!primo) continue;
        luogo.lat = primo.lat;
        luogo.lon = primo.lon;
        await salva('giorni', giorno);
        trovati += 1;
      }
      toast(trovati === senzaPosizione.length
        ? 'Posizioni trovate: controlla che siano giuste'
        : `Trovati ${trovati} luoghi su ${senzaPosizione.length}: gli altri vanno messi a mano`);
    } catch (errore) {
      toast(errore.message);
    }
    if (main.dataset.vista === 'mappa') mostra(main, idGiorno);
  });

  return giornoScelto ? `Mappa · ${formattaGiorno(giornoScelto.data, { day: 'numeric', month: 'short' })}` : undefined;
}
