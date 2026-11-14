// scaletta.js – trasforma un testo incollato in un elenco di attività.
//
// Una riga = un'attività. Sono facoltativi l'orario all'inizio e il luogo
// dopo una chiocciola. Esempi di righe capite:
//
//     9:00 Colazione
//     10.30 - Santa Sofia @ Sultanahmet
//     13h Pranzo al Gran Bazar
//     Passeggiata sul Bosforo
//     16:00 Giro dei templi @ Wat Pho > Wat Arun > Grand Palace     (più tappe)
//
// Vengono ignorati i trattini o i numeri da elenco puntato ("- ", "• ", "1. ").

// Orario a inizio riga: "9:00", "09.30", "13h", "13h30", con eventuale trattino dopo.
//   gruppo 1 = ore, gruppo 2 o 3 = minuti, gruppo 4 = il resto della riga
const ORARIO = /^(\d{1,2})(?:[:.](\d{2})|h(\d{2})?)\s*[-–—]?\s*(.*)$/i;

export function analizzaScaletta(testo) {
  const attivita = [];

  for (const rigaGrezza of testo.split('\n')) {
    // Tolgo spazi e simboli da elenco: "- ", "• ", "* ", "1. ", "2) "
    let riga = rigaGrezza.trim().replace(/^[-•*–]\s+/, '').replace(/^\d{1,2}[.)]\s+/, '');
    if (!riga) continue;

    let ora = '';
    const trovato = riga.match(ORARIO);
    if (trovato) {
      const ore = Number(trovato[1]);
      const minuti = Number(trovato[2] ?? trovato[3] ?? 0);
      if (ore < 24 && minuti < 60) {
        ora = `${String(ore).padStart(2, '0')}:${String(minuti).padStart(2, '0')}`;
        riga = trovato[4];
      }
    }

    // Il luogo è ciò che segue " @". (Serve lo spazio prima: così un indirizzo
    // email dentro il titolo non viene scambiato per un luogo.)
    const [titolo, ...resto] = riga.split(/\s@\s*/);
    // Più luoghi separati da ">" (o dalla freccia "→") sono le tappe di un percorso.
    const nomi = resto.join(' ').split(/\s*(?:>|→)\s*/).map((nome) => nome.trim()).filter(Boolean);
    if (!titolo.trim() && nomi.length === 0) continue;

    // lat e lon (le coordinate) restano vuote: le riempirà la ricerca sulla mappa
    const luoghi = nomi.map((nome) => ({ nome, lat: null, lon: null }));
    attivita.push({
      ora,
      titolo: titolo.trim() || nomi[0],
      luogo: luoghi[0] ?? null,
      tappe: luoghi.slice(1),
    });
  }

  return attivita;
}
