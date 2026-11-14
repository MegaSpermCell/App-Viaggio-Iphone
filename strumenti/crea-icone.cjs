// crea-icone.cjs – trasforma icons/icona.svg nelle icone PNG che servono alla PWA.
//
// NON fa parte dell'app: serve solo a chi sviluppa, e solo se si cambia il disegno.
// Uso (dal computer, con Node e Playwright installati):
//     node strumenti/crea-icone.cjs

const fs = require('node:fs');
const path = require('node:path');
const { chromium } = require('playwright');

const CARTELLA = path.join(__dirname, '..', 'icons');
const ICONE = [
  { file: 'apple-touch-icon.png', lato: 180 }, // schermata Home dell'iPhone
  { file: 'icon-192.png', lato: 192 },         // manifest (Android, scheda del browser)
  { file: 'icon-512.png', lato: 512 },         // manifest (schermata di avvio)
];

(async () => {
  const svg = fs.readFileSync(path.join(CARTELLA, 'icona.svg'), 'utf8');
  const browser = await chromium.launch();
  for (const { file, lato } of ICONE) {
    const pagina = await browser.newPage({ viewport: { width: lato, height: lato } });
    await pagina.setContent(`<style>html,body{margin:0}svg{display:block;width:${lato}px;height:${lato}px}</style>${svg}`);
    await pagina.screenshot({ path: path.join(CARTELLA, file) });
    await pagina.close();
    console.log('creata', file);
  }
  await browser.close();
})();
