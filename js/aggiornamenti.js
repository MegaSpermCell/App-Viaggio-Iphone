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
    // updateViaCache: 'none' = quando si cerca una versione nuova, sw.js va sempre
    // chiesto al server e mai preso da una copia tenuta dal browser.
    registrazione = await navigator.serviceWorker.register('sw.js', { updateViaCache: 'none' });
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
 * Restituisce 'nuova', 'aggiornata', 'offline', 'non-disponibile' oppure
 * 'bloccata': online c'è una versione diversa ma il telefono non la scarica.
 */
export async function controllaAggiornamenti() {
  if (!registrazione) return 'non-disponibile';
  if (!navigator.onLine) return 'offline';
  try {
    await registrazione.update();
  } catch {
    return 'offline';
  }
  if (registrazione.installing || registrazione.waiting) return 'nuova';

  // Seconda verifica, indipendente: leggo sw.js direttamente dal server e
  // confronto la sua versione con quella installata.
  try {
    const risposta = await fetch(`sw.js?controllo=${Date.now()}`, { cache: 'no-store' });
    const versioneOnline = (await risposta.text()).match(/const VERSIONE = '([^']+)'/)?.[1];
    if (versioneOnline && versioneOnline !== (await versioneApp())) return 'bloccata';
  } catch {
    // se questa verifica non riesce ci si fida della prima
  }
  return 'aggiornata';
}

/**
 * Ultima risorsa quando l'aggiornamento normale non parte: toglie il service
 * worker e le copie dei file dell'app, poi ricarica tutto dal server.
 * I dati (spese, itinerario, impostazioni) NON vengono toccati: stanno in
 * IndexedDB, che è un'altra cosa rispetto alla cache dei file.
 */
export async function reinstallaFile() {
  await registrazione?.unregister();
  for (const nome of await caches.keys()) {
    if (nome.startsWith('viaggio-')) await caches.delete(nome);
  }
  location.reload();
}

/** Versione installata, letta dal nome della cache creata da sw.js (es. "viaggio-v3" → "v3"). */
export async function versioneApp() {
  if (!('caches' in window)) return '—';
  const nomi = await caches.keys();
  const cache = nomi.find((nome) => nome.startsWith('viaggio-'));
  return cache ? cache.replace('viaggio-', '') : '—';
}
