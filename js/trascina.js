// trascina.js – trascinare un elemento su un altro con il dito, come le icone
// delle app sull'iPhone: si tiene premuto un attimo, l'elemento "si stacca",
// lo si porta sopra un bersaglio e si rilascia.
//
// I browser hanno un trascinamento già pronto, ma sui telefoni non funziona
// bene: qui lo costruiamo con gli eventi del "puntatore" (dito o mouse).

const ATTESA = 350;      // millisecondi da tenere premuto prima che parta
const TOLLERANZA = 10;   // se intanto il dito si sposta più di così, è uno scorrimento
const BORDO = 70;        // vicino ai bordi dell'elenco, l'elenco scorre da solo

/**
 * Attiva il trascinamento dentro `contenitore`.
 *   trascinabili  selettore CSS degli elementi che si possono trascinare
 *   bersagli      selettore CSS degli elementi su cui si può rilasciare
 *   alRilascio    funzione chiamata con (elementoTrascinato, bersaglio)
 */
export function attivaTrascinamento(contenitore, { trascinabili, bersagli, alRilascio }) {
  let timer = null;
  let partenza = null;        // dove il dito ha toccato lo schermo
  let origine = null;         // l'elemento che si sta trascinando (null = nessuno)
  let copia = null;           // la sua copia che segue il dito
  let bersaglio = null;       // il bersaglio sotto il dito in questo momento
  let appenaRilasciato = false;

  function inizia(elemento, x, y) {
    origine = elemento;
    const riquadro = elemento.getBoundingClientRect();
    copia = elemento.cloneNode(true);
    copia.classList.add('copia-trascinata');
    copia.style.width = `${riquadro.width}px`;
    copia.style.left = `${riquadro.left}px`;
    copia.style.top = `${riquadro.top}px`;
    // quanto dista il dito dall'angolo dell'elemento: serve a non farlo "saltare"
    copia.dataset.dx = x - riquadro.left;
    copia.dataset.dy = y - riquadro.top;
    document.body.append(copia);
    origine.classList.add('in-trascinamento');
    document.body.classList.add('trascinando');
  }

  function muovi(evento) {
    if (!origine) {
      // Non è ancora partito: se il dito si muove vuol dire che si sta scorrendo l'elenco.
      const spostamento = Math.hypot(evento.clientX - partenza.x, evento.clientY - partenza.y);
      if (spostamento > TOLLERANZA) clearTimeout(timer);
      return;
    }
    copia.style.left = `${evento.clientX - copia.dataset.dx}px`;
    copia.style.top = `${evento.clientY - copia.dataset.dy}px`;

    // Cosa c'è sotto il dito? (La copia è "trasparente" ai tocchi, vedi il CSS.)
    const sotto = document.elementFromPoint(evento.clientX, evento.clientY)?.closest(bersagli) ?? null;
    const nuovo = sotto === origine ? null : sotto;
    if (nuovo !== bersaglio) {
      bersaglio?.classList.remove('bersaglio');
      nuovo?.classList.add('bersaglio');
      bersaglio = nuovo;
    }

    // Vicino al bordo alto o basso l'elenco scorre, per raggiungere ciò che non si vede.
    const area = contenitore.closest('#vista')?.getBoundingClientRect();
    if (area) {
      if (evento.clientY < area.top + BORDO) contenitore.closest('#vista').scrollBy(0, -12);
      else if (evento.clientY > area.bottom - BORDO) contenitore.closest('#vista').scrollBy(0, 12);
    }
  }

  function finisci(evento) {
    clearTimeout(timer);
    window.removeEventListener('pointermove', muovi);
    window.removeEventListener('pointerup', finisci);
    window.removeEventListener('pointercancel', finisci);
    if (!origine) return;

    const trascinato = origine;
    const scelto = evento.type === 'pointerup' ? bersaglio : null; // "cancel" = gesto interrotto
    copia.remove();
    trascinato.classList.remove('in-trascinamento');
    bersaglio?.classList.remove('bersaglio');
    document.body.classList.remove('trascinando');
    origine = null;
    copia = null;
    bersaglio = null;

    // Subito dopo il rilascio il browser manda anche un "click": va ignorato,
    // altrimenti si aprirebbe il giorno appena trascinato.
    appenaRilasciato = true;
    setTimeout(() => { appenaRilasciato = false; }, 50);

    if (scelto) alRilascio(trascinato, scelto);
  }

  contenitore.addEventListener('pointerdown', (evento) => {
    const elemento = evento.target.closest(trascinabili);
    if (!elemento || evento.button > 0) return;
    partenza = { x: evento.clientX, y: evento.clientY };
    clearTimeout(timer);
    timer = setTimeout(() => inizia(elemento, partenza.x, partenza.y), ATTESA);
    window.addEventListener('pointermove', muovi);
    window.addEventListener('pointerup', finisci);
    window.addEventListener('pointercancel', finisci);
  });

  // Mentre si trascina la pagina non deve scorrere sotto il dito.
  contenitore.addEventListener('touchmove', (evento) => {
    if (origine) evento.preventDefault();
  }, { passive: false });

  // { capture: true } = questo ascoltatore arriva prima di tutti gli altri.
  contenitore.addEventListener('click', (evento) => {
    if (!appenaRilasciato) return;
    evento.preventDefault();
    evento.stopPropagation();
  }, { capture: true });

  // Tenendo premuto, niente menu del browser né trascinamento "di serie" dei link.
  contenitore.addEventListener('contextmenu', (evento) => {
    if (evento.target.closest(trascinabili)) evento.preventDefault();
  });
  contenitore.addEventListener('dragstart', (evento) => evento.preventDefault());
}
