// aggiornamenti.js – registra il service worker e gestisce le nuove versioni.
//
// Il service worker (sw.js) tiene una copia dell'app sul telefono: per questo
// funziona offline. Quando su GitHub arriva una versione nuova, il browser la
// scarica in secondo piano e la tiene "in attesa". Qui mostriamo l'avviso
// "Nuova versione disponibile": toccando "Aggiorna" la versione nuova prende
// il posto della vecchia e la pagina si ricarica.

let registrazione = null;
let aggiornamentoRichiesto = false;

export async function registraServiceWorker() {
  if (!('serviceWorker' in navigator)) return; // browser molto vecchio: l'app va, ma solo online

  try {
    registrazione = await navigator.serviceWorker.register('sw.js');
  } catch (errore) {
    console.warn('Service worker non registrato:', errore);
    return;
  }

  // C'è già una versione nuova in attesa (scaricata durante un uso precedente)?
  if (registrazione.waiting && navigator.serviceWorker.controller) mostraAvviso();

  // Una versione nuova viene trovata mentre l'app è aperta.
  registrazione.addEventListener('updatefound', () => {
    const nuovo = registrazione.installing;
    nuovo?.addEventListener('statechange', () => {
      // "controller" esiste solo se c'era già una versione attiva: alla prima
      // installazione non c'è nulla da aggiornare, quindi niente avviso.
      if (nuovo.state === 'installed' && navigator.serviceWorker.controller) mostraAvviso();
    });
  });

  // La versione nuova ha preso il controllo: si ricarica per usarla.
  navigator.serviceWorker.addEventListener('controllerchange', () => {
    if (aggiornamentoRichiesto) location.reload();
  });

  // Un'app sulla schermata Home resta aperta per giorni: ogni volta che torna
  // in primo piano controlliamo se c'è una versione nuova.
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible' && navigator.onLine) {
      registrazione.update().catch(() => {});
    }
  });
}

function mostraAvviso() {
  const avviso = document.getElementById('avviso-aggiornamento');
  avviso.hidden = false;
  avviso.querySelector('button').onclick = () => {
    aggiornamentoRichiesto = true;
    // Dice al service worker in attesa di attivarsi subito (vedi "message" in sw.js).
    registrazione.waiting?.postMessage('attiva');
  };
}

/**
 * Controllo manuale (pulsante nelle Impostazioni).
 * Restituisce 'nuova', 'aggiornata', 'offline' oppure 'non-disponibile'.
 */
export async function controllaAggiornamenti() {
  if (!registrazione) return 'non-disponibile';
  if (!navigator.onLine) return 'offline';
  try {
    await registrazione.update();
  } catch {
    return 'offline';
  }
  return registrazione.installing || registrazione.waiting ? 'nuova' : 'aggiornata';
}

/** Versione installata, letta dal nome della cache creata da sw.js (es. "viaggio-v3" → "v3"). */
export async function versioneApp() {
  if (!('caches' in window)) return '—';
  const nomi = await caches.keys();
  const cache = nomi.find((nome) => nome.startsWith('viaggio-'));
  return cache ? cache.replace('viaggio-', '') : '—';
}
