// viste/spese.js – schermata "Spese": quanto resta, quanto si è speso,
// elenco giorno per giorno e tasti per aggiungere spese ed entrate.

import { tutti, leggiImpostazione } from '../db.js';
import { leggiCategorie, VALUTA_BASE } from '../dati.js';
import { apriSchedaSpesa } from '../scheda-spesa.js';
import { esc, formattaImporto, etichettaGiorno, oggi, dataDaGiorno, toast } from '../util.js';

const GIORNI_SENZA_BACKUP = 7; // dopo quanti giorni ricordare di fare il backup
const UN_GIORNO = 24 * 60 * 60 * 1000;

const sommaInEuro = (voci) => voci.reduce((totale, voce) => totale + voce.importoEur, 0);
const euro = (numero) => formattaImporto(numero, VALUTA_BASE);

export async function mostra(main) {
  const [voci, categorie, ultimoBackup] = await Promise.all([
    tutti('spese'),
    leggiCategorie(),
    leggiImpostazione('ultimoBackup', null),
  ]);

  // Dalla più recente alla più vecchia; a parità di data, prima l'ultima inserita.
  voci.sort((a, b) => b.data.localeCompare(a.data) || b.creata - a.creata);

  // Nell'archivio ci sono sia le spese sia le entrate (soldi ricevuti).
  const entrate = voci.filter((voce) => voce.tipo === 'entrata');
  const spese = voci.filter((voce) => voce.tipo !== 'entrata');
  const totaleEntrate = sommaInEuro(entrate);
  const totaleSpese = sommaInEuro(spese);

  // Raggruppo per giorno: i primi 10 caratteri della data sono "2026-11-14".
  const perGiorno = new Map();
  for (const voce of voci) {
    const giorno = voce.data.slice(0, 10);
    if (!perGiorno.has(giorno)) perGiorno.set(giorno, []);
    perGiorno.get(giorno).push(voce);
  }
  const speseDi = (giorno) => (perGiorno.get(giorno) ?? []).filter((voce) => voce.tipo !== 'entrata');

  // Media al giorno: totale diviso per i giorni passati dalla prima spesa a oggi (compresi).
  let mediaAlGiorno = 0;
  if (spese.length > 0) {
    const primoGiorno = spese.at(-1).data.slice(0, 10);
    const giorniPassati = Math.max(1, Math.round((dataDaGiorno(oggi()) - dataDaGiorno(primoGiorno)) / UN_GIORNO) + 1);
    mediaAlGiorno = totaleSpese / giorniPassati;
  }

  const categoriaPerId = new Map(categorie.map((categoria) => [categoria.id, categoria]));

  function rigaVoce(voce) {
    const eEntrata = voce.tipo === 'entrata';
    const categoria = eEntrata
      ? { nome: 'Entrata', emoji: '💰' }
      : categoriaPerId.get(voce.categoriaId) ?? { nome: 'Senza categoria', emoji: '❔' };
    const dettagli = [voce.data.slice(11), voce.nota].filter(Boolean).join(' · ');
    const inEuro = voce.valuta === VALUTA_BASE ? '' : `<small>${euro(voce.importoEur)}</small>`;
    return `
      <li>
        <button class="riga ${eEntrata ? 'entrata' : ''}" data-voce="${esc(voce.id)}">
          <span class="emoji">${esc(categoria.emoji)}</span>
          <span class="riga-testo"><strong>${esc(categoria.nome)}</strong><small>${esc(dettagli)}</small></span>
          <span class="riga-importo"><strong>${eEntrata ? '+ ' : ''}${formattaImporto(voce.importo, voce.valuta)}</strong>${inEuro}</span>
        </button>
      </li>`;
  }

  const elenco = [...perGiorno].map(([giorno, vociDelGiorno]) => `
    <h2 class="titolo-sezione">
      <span>${esc(etichettaGiorno(giorno))}</span>
      <span>${euro(sommaInEuro(speseDi(giorno)))}</span>
    </h2>
    <ul class="lista">${vociDelGiorno.map(rigaVoce).join('')}</ul>`).join('');

  // In evidenza: quanto resta (se ci sono entrate) oppure quanto si è speso finora.
  const haEntrate = entrate.length > 0;
  const disponibile = totaleEntrate - totaleSpese;
  const evidenza = haEntrate ? `
      <span class="etichetta">Disponibile</span>
      <strong class="${disponibile < 0 ? 'in-rosso' : ''}">${euro(disponibile)}</strong>
      <small>Entrate ${euro(totaleEntrate)} · Spese ${euro(totaleSpese)}</small>` : `
      <span class="etichetta">Speso in totale</span>
      <strong>${euro(totaleSpese)}</strong>
      <small>Aggiungi le entrate (es. lo stipendio) per vedere quanto ti resta.</small>`;

  // Promemoria: i dati stanno solo sul telefono, ogni tanto vanno messi al sicuro.
  const giorniDalBackup = ultimoBackup ? Math.floor((Date.now() - ultimoBackup) / UN_GIORNO) : null;
  const serveBackup = voci.length >= 5 && (giorniDalBackup === null || giorniDalBackup >= GIORNI_SENZA_BACKUP);
  const avvisoBackup = serveBackup ? `
    <p class="avviso">
      <span>${giorniDalBackup === null ? 'Non hai ancora fatto un backup.' : `Ultimo backup ${giorniDalBackup} giorni fa.`}</span>
      <a class="tasto-testo" href="#/impostazioni">Fallo ora</a>
    </p>` : '';

  main.innerHTML = `
    <section class="evidenza">
      <div class="evidenza-testo">${evidenza}</div>
      <button class="tasto-chiaro" id="nuova-entrata">＋ Entrata</button>
    </section>
    <section class="riepilogo">
      <div class="carta"><span class="etichetta">Oggi</span><strong>${euro(sommaInEuro(speseDi(oggi())))}</strong></div>
      <div class="carta"><span class="etichetta">Media al giorno</span><strong>${euro(mediaAlGiorno)}</strong></div>
    </section>
    ${avvisoBackup}
    ${elenco || '<p class="vuoto"><span class="vuoto-simbolo">🧾</span>Ancora nessuna spesa.<br>Tocca il tasto + per aggiungere la prima.</p>'}
    <button class="tasto-fluttuante" id="nuova-spesa" aria-label="Aggiungi spesa">+</button>`;

  // Apre la scheda e, se qualcosa è cambiato, avvisa e ridisegna la schermata.
  async function apri(opzioni, messaggio) {
    const esito = await apriSchedaSpesa(opzioni);
    if (!esito) return;
    toast(esito === 'eliminata' ? 'Eliminata' : messaggio(esito));
    mostra(main);
  }

  main.querySelector('#nuova-spesa').addEventListener('click', () => {
    apri({}, (salvata) => `Salvata: ${formattaImporto(salvata.importo, salvata.valuta)}`);
  });
  main.querySelector('#nuova-entrata').addEventListener('click', () => {
    apri({ tipo: 'entrata' }, (salvata) => `Aggiunti ${formattaImporto(salvata.importo, salvata.valuta)}`);
  });

  // Tocco su una riga: si apre per modificarla
  for (const riga of main.querySelectorAll('[data-voce]')) {
    riga.addEventListener('click', () => {
      const voce = voci.find((candidata) => candidata.id === riga.dataset.voce);
      apri({ spesa: voce }, () => 'Modifica salvata');
    });
  }
}
