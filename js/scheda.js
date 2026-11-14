// scheda.js – le "schede": finestre a tutto schermo per inserire o modificare qualcosa.
//
// Sono costruite con <dialog>, l'elemento HTML fatto apposta per le finestre:
// showModal() lo apre sopra a tutto il resto e blocca ciò che sta sotto.

import { esc } from './util.js';

/**
 * Apre una scheda e aspetta che venga chiusa.
 *
 *   titolo         testo in alto
 *   corpo          HTML del contenuto (di solito campi di un modulo)
 *   testoSalva     scritta del tasto in alto a destra; null = nessun tasto
 *   alSalvataggio  funzione chiamata quando si conferma. Riceve (campi, dialog):
 *                  `campi` contiene i valori dei campi, letti dal loro attributo name.
 *                  Se restituisce false la scheda resta aperta (c'è un errore da
 *                  correggere), altrimenti si chiude con quel valore.
 *   prepara        funzione per collegare altri pulsanti. Riceve (dialog, chiudi).
 *
 * Restituisce una Promise con il valore di chiusura; null se si è annullato.
 * Uso tipico:   const esito = await apriScheda({ … });   if (esito) ridisegna();
 */
export function apriScheda({ titolo, corpo, testoSalva = 'Salva', alSalvataggio, prepara }) {
  return new Promise((risolvi) => {
    const dialog = document.createElement('dialog');
    dialog.className = 'scheda';
    dialog.innerHTML = `
      <form>
        <header class="scheda-testa">
          <button type="button" class="tasto-testo" data-azione="annulla">Annulla</button>
          <h2>${esc(titolo)}</h2>
          ${testoSalva ? `<button type="submit" class="tasto-testo">${esc(testoSalva)}</button>` : '<span></span>'}
        </header>
        <div class="scheda-corpo">${corpo}</div>
      </form>`;
    document.body.append(dialog);

    const modulo = dialog.querySelector('form');
    let esito = null;
    const chiudi = (valore = null) => {
      esito = valore;
      dialog.close();
    };

    dialog.querySelector('[data-azione="annulla"]').addEventListener('click', () => chiudi());

    // Il tasto "Invio" della tastiera, dentro un campo di una riga, di norma invierebbe
    // il modulo. Qui preferiamo che chiuda soltanto la tastiera (e lo chiamiamo "Fine"):
    // così non si salva per sbaglio una scheda compilata a metà.
    for (const campo of dialog.querySelectorAll('input')) campo.enterKeyHint = 'done';
    modulo.addEventListener('keydown', (evento) => {
      if (evento.key === 'Enter' && evento.target.tagName === 'INPUT') {
        evento.preventDefault();
        evento.target.blur();
      }
    });

    // "submit" scatta con il tasto Salva, ma solo se i campi obbligatori sono
    // compilati (altrimenti il browser lo segnala da sé).
    modulo.addEventListener('submit', async (evento) => {
      evento.preventDefault(); // niente ricarica della pagina: gestiamo tutto noi
      const campi = Object.fromEntries(new FormData(modulo));
      const valore = alSalvataggio ? await alSalvataggio(campi, dialog) : true;
      if (valore !== false) chiudi(valore ?? true);
    });

    // "close" scatta in ogni caso di chiusura: qui si fa pulizia e si risponde a chi aspettava.
    dialog.addEventListener('close', () => {
      dialog.remove();
      risolvi(esito);
    });

    prepara?.(dialog, chiudi);
    dialog.showModal();
  });
}

/**
 * Mostra un messaggio d'errore accanto a un campo (il fumetto standard del browser)
 * e restituisce false, comodo dentro alSalvataggio:
 *     if (valore <= 0) return segnalaCampo(campo, 'Scrivi un numero maggiore di zero');
 */
export function segnalaCampo(campo, messaggio) {
  campo.setCustomValidity(messaggio);
  campo.reportValidity();
  // appena l'utente corregge, l'errore sparisce
  campo.addEventListener('input', () => campo.setCustomValidity(''), { once: true });
  return false;
}
