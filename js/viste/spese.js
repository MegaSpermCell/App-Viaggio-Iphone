// viste/spese.js – schermata "Spese": totali, elenco giorno per giorno e tasto "+".

import { tutti, leggiImpostazione } from '../db.js';
import { leggiCategorie, VALUTA_BASE } from '../dati.js';
import { apriSchedaSpesa } from '../scheda-spesa.js';
import { esc, formattaImporto, etichettaGiorno, oggi, toast } from '../util.js';

const GIORNI_SENZA_BACKUP = 7; // dopo quanti giorni ricordare di fare il backup
const UN_GIORNO = 24 * 60 * 60 * 1000;

const sommaInEuro = (spese) => spese.reduce((totale, spesa) => totale + spesa.importoEur, 0);

export async function mostra(main) {
  const [spese, categorie, ultimoBackup] = await Promise.all([
    tutti('spese'),
    leggiCategorie(),
    leggiImpostazione('ultimoBackup', null),
  ]);

  // Dalla più recente alla più vecchia; a parità di data, prima l'ultima inserita.
  spese.sort((a, b) => b.data.localeCompare(a.data) || b.creata - a.creata);

  // Raggruppo per giorno: i primi 10 caratteri della data sono "2026-11-14".
  const perGiorno = new Map();
  for (const spesa of spese) {
    const giorno = spesa.data.slice(0, 10);
    if (!perGiorno.has(giorno)) perGiorno.set(giorno, []);
    perGiorno.get(giorno).push(spesa);
  }

  const categoriaPerId = new Map(categorie.map((categoria) => [categoria.id, categoria]));

  function rigaSpesa(spesa) {
    const categoria = categoriaPerId.get(spesa.categoriaId) ?? { nome: 'Senza categoria', emoji: '❔' };
    const dettagli = [spesa.data.slice(11), spesa.nota].filter(Boolean).join(' · ');
    const inEuro = spesa.valuta === VALUTA_BASE ? '' : `<small>${formattaImporto(spesa.importoEur, VALUTA_BASE)}</small>`;
    return `
      <li>
        <button class="riga" data-spesa="${esc(spesa.id)}">
          <span class="emoji">${esc(categoria.emoji)}</span>
          <span class="riga-testo"><strong>${esc(categoria.nome)}</strong><small>${esc(dettagli)}</small></span>
          <span class="riga-importo"><strong>${formattaImporto(spesa.importo, spesa.valuta)}</strong>${inEuro}</span>
        </button>
      </li>`;
  }

  const elenco = [...perGiorno].map(([giorno, speseDelGiorno]) => `
    <h2 class="titolo-sezione">
      <span>${esc(etichettaGiorno(giorno))}</span>
      <span>${formattaImporto(sommaInEuro(speseDelGiorno), VALUTA_BASE)}</span>
    </h2>
    <ul class="lista">${speseDelGiorno.map(rigaSpesa).join('')}</ul>`).join('');

  // Promemoria: i dati stanno solo sul telefono, ogni tanto vanno messi al sicuro.
  const giorniDalBackup = ultimoBackup ? Math.floor((Date.now() - ultimoBackup) / UN_GIORNO) : null;
  const serveBackup = spese.length >= 5 && (giorniDalBackup === null || giorniDalBackup >= GIORNI_SENZA_BACKUP);
  const avvisoBackup = serveBackup ? `
    <p class="avviso">
      <span>${giorniDalBackup === null ? 'Non hai ancora fatto un backup.' : `Ultimo backup ${giorniDalBackup} giorni fa.`}</span>
      <a class="tasto-testo" href="#/impostazioni">Fallo ora</a>
    </p>` : '';

  main.innerHTML = `
    <section class="riepilogo">
      <div class="carta"><span class="etichetta">Oggi</span><strong>${formattaImporto(sommaInEuro(perGiorno.get(oggi()) ?? []), VALUTA_BASE)}</strong></div>
      <div class="carta"><span class="etichetta">Totale viaggio</span><strong>${formattaImporto(sommaInEuro(spese), VALUTA_BASE)}</strong></div>
    </section>
    ${avvisoBackup}
    ${elenco || '<p class="vuoto">Ancora nessuna spesa.<br>Tocca il tasto + per aggiungere la prima.</p>'}
    <button class="tasto-fluttuante" id="nuova-spesa" aria-label="Aggiungi spesa">+</button>`;

  // Nuova spesa
  main.querySelector('#nuova-spesa').addEventListener('click', async () => {
    const salvata = await apriSchedaSpesa();
    if (!salvata) return;
    toast(`Salvata: ${formattaImporto(salvata.importo, salvata.valuta)}`);
    mostra(main); // ridisegna la schermata con la spesa nuova
  });

  // Tocco su una spesa: si apre per modificarla
  for (const riga of main.querySelectorAll('[data-spesa]')) {
    riga.addEventListener('click', async () => {
      const spesa = spese.find((candidata) => candidata.id === riga.dataset.spesa);
      const esito = await apriSchedaSpesa({ spesa });
      if (!esito) return;
      toast(esito === 'eliminata' ? 'Spesa eliminata' : 'Spesa modificata');
      mostra(main);
    });
  }
}
