// scheda-luogo.js – la scheda per mettere un luogo sulla mappa.
//
// Tre modi, tutti nella stessa scheda:
//   • scrivere un nome o un indirizzo e toccare "Cerca"
//   • incollare coordinate o un link di Google Maps nello stesso campo
//   • toccare direttamente la mappa

import { apriScheda } from './scheda.js';
import { creaMappa, segnaposto } from './mappa.js';
import { cercaLuogo, leggiCoordinate, eLinkBreve } from './luoghi.js';
import { esc } from './util.js';

/**
 * Apre la scheda. `luogo` è quello attuale ({ nome, lat, lon }) oppure null.
 * Restituisce il luogo scelto { nome, lat, lon }, oppure null se si è annullato.
 */
export function apriSchedaLuogo(luogo = null) {
  // La posizione scelta finora; null finché non se ne sceglie una.
  let posizione = luogo?.lat != null ? { lat: luogo.lat, lon: luogo.lon } : null;
  let nomeTrovato = ''; // il nome proposto dalla ricerca, usato se il campo resta vuoto

  return apriScheda({
    titolo: 'Posizione del luogo',
    testoSalva: 'Usa',
    corpo: `
      <div class="cerca-luogo">
        <input class="campo" type="text" name="ricerca" autocomplete="off" aria-label="Nome, indirizzo, coordinate o link"
          placeholder="Nome, indirizzo o link di Google Maps" value="${esc(luogo?.nome)}">
        <button type="button" class="tasto" data-azione="cerca">Cerca</button>
      </div>
      <p class="nota" id="messaggio-luogo">Cerca un posto, incolla coordinate o un link, oppure tocca la mappa.</p>
      <ul class="lista" id="risultati-luogo" hidden></ul>
      <div class="mappa" id="mappa-luogo"></div>`,

    async prepara(dialog) {
      const trova = (selettore) => dialog.querySelector(selettore);
      const campo = trova('[name="ricerca"]');
      const messaggio = trova('#messaggio-luogo');
      const risultati = trova('#risultati-luogo');

      // La mappa va creata quando la scheda è già visibile, altrimenti non sa quanto è grande.
      await new Promise((risolvi) => requestAnimationFrame(risolvi));
      const { L, mappa } = await creaMappa(trova('#mappa-luogo'));
      dialog.addEventListener('close', () => mappa.remove());
      let puntina = null;

      // Sposta la puntina (creandola la prima volta) e, se richiesto, ci porta la mappa.
      function scegli(lat, lon, { centra = true } = {}) {
        posizione = { lat, lon };
        if (puntina) puntina.setLatLng([lat, lon]);
        else puntina = L.marker([lat, lon], { icon: segnaposto(L, '📍', 'var(--accento)') }).addTo(mappa);
        if (centra) mappa.setView([lat, lon], Math.max(mappa.getZoom(), 15));
      }

      if (posizione) scegli(posizione.lat, posizione.lon);
      mappa.on('click', (evento) => {
        scegli(evento.latlng.lat, evento.latlng.lng, { centra: false });
        messaggio.textContent = 'Posizione scelta toccando la mappa.';
      });

      async function cerca() {
        const testo = campo.value.trim();
        risultati.hidden = true;
        if (!testo) return;

        // 1) Il testo contiene già delle coordinate?
        const coordinate = leggiCoordinate(testo);
        if (coordinate) {
          scegli(coordinate.lat, coordinate.lon);
          messaggio.textContent = 'Posizione letta dal testo incollato. Ora puoi scrivere il nome del luogo.';
          campo.value = '';
          campo.placeholder = 'Nome del luogo (facoltativo)';
          return;
        }
        if (eLinkBreve(testo)) {
          messaggio.textContent = 'I link brevi di Google Maps non contengono la posizione. Apri il link, copia l’indirizzo lungo dalla barra del browser, oppure cerca il nome.';
          return;
        }

        // 2) Altrimenti si cerca il nome.
        messaggio.textContent = 'Sto cercando…';
        try {
          const trovati = await cercaLuogo(testo);
          if (trovati.length === 0) {
            messaggio.textContent = 'Nessun risultato. Prova ad aggiungere la città, oppure tocca la mappa.';
            return;
          }
          messaggio.textContent = 'Scegli il risultato giusto:';
          risultati.hidden = false;
          risultati.innerHTML = trovati.map((voce, indice) => `
            <li><button type="button" class="riga" data-risultato="${indice}">
              <span class="riga-testo a-capo"><strong>${esc(voce.nome)}</strong><small>${esc(voce.descrizione)}</small></span>
            </button></li>`).join('');
          for (const riga of risultati.querySelectorAll('[data-risultato]')) {
            riga.addEventListener('click', () => {
              const scelto = trovati[Number(riga.dataset.risultato)];
              scegli(scelto.lat, scelto.lon);
              nomeTrovato = scelto.nome;
              risultati.hidden = true;
              messaggio.textContent = `Trovato: ${scelto.descrizione}`;
            });
          }
        } catch (errore) {
          messaggio.textContent = errore.message;
        }
      }

      trova('[data-azione="cerca"]').addEventListener('click', cerca);
      // Nel campo di ricerca il tasto "Invio" avvia la ricerca.
      campo.enterKeyHint = 'search';
      campo.addEventListener('keydown', (evento) => {
        if (evento.key === 'Enter') cerca();
      });
    },

    alSalvataggio(campi, dialog) {
      if (!posizione) {
        dialog.querySelector('#messaggio-luogo').textContent = 'Prima scegli una posizione: cerca un posto o tocca la mappa.';
        return false;
      }
      const nome = campi.ricerca.trim() || nomeTrovato || luogo?.nome || 'Punto sulla mappa';
      return { nome, lat: posizione.lat, lon: posizione.lon };
    },
  });
}
