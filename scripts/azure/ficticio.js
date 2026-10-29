// Versão Azure (teste para o TI): sem marcas.
// Aplicado pelo build (MODO=azure) nos arquivos de dist/; o código original continua com os logos e o nome da empresa.
// - logos (animado da entrada, do menu aberto e recolhido, favicon) viram um quadro "LOGO" do mesmo tamanho;
// - o nome da empresa vira um nome genérico; os nomes dos locais (ETAs, poços, ETEs, macromedidores) são os reais.
const zlib = require('zlib');

// Nome real -> nome genérico. Os mais longos primeiro.
const NOMES = [
  ['GS Inima Tech', 'Sistema Operacional'], ['GS Inima TECH', 'Sistema Operacional'], ['GS Inima', 'Empresa Modelo'],
  ['Ourinhos Saneamento', 'Saneamento Modelo'],
  // pessoas nos dados de exemplo das telas (quando ainda não há lançamentos)
  ["'Felipe Rodrigues'", "'Bruno Lima'"], ["'Felipe'", "'Bruno'"]
];
// Mesmo texto escrito com acentos em \u00xx (como fica dentro dos modelos das telas no index.html).
const escapado = (t) => t.replace(/[^\x00-\x7f]/g, (c) => '\\u' + c.charCodeAt(0).toString(16).padStart(4, '0'));
// Só troca a palavra inteira (não mexe em nomes de funções como "chuvaOurinhos").
const reEsc = (t) => t.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const LETRA = 'A-Za-z0-9_\\u00C0-\\u00FF';
const trocar = (s, real, novo) => s.replace(new RegExp('(?<![' + LETRA + '])' + reEsc(real) + '(?![' + LETRA + '])', 'g'), () => novo);
const ficticio = (txt) => NOMES.reduce((s, [real, novo]) => trocar(trocar(s, real, novo), escapado(real), escapado(novo)), txt);

// Quadro "LOGO" no lugar das imagens (aspas escapadas, porque fica dentro dos modelos das telas).
const quadro = (w, h, fonte) => '<div role=\\"img\\" aria-label=\\"LOGO\\" style=\\"width: ' + w + 'px; height: ' + h + 'px; max-width: 100%; box-sizing: border-box; border: 2px dashed #9AA8B8; border-radius: 12px; display: flex; align-items: center; justify-content: center; font-family: \'Inter\', sans-serif; font-weight: 800; font-size: ' + fonte + 'px; letter-spacing: 3px; color: #52627A\\">LOGO</div>';

function semLogos(html) {
  // Logo animado da tela de entrada (um <svg class="gt-logo"> com imagens embutidas).
  const ini = html.indexOf('<svg class=\\"gt-logo\\"');
  if (ini >= 0) {
    let pos = ini + 4, nivel = 1;
    while (nivel > 0) {
      const ab = html.indexOf('<svg', pos), f1 = html.indexOf('</svg>', pos), f2 = html.indexOf('<\\/svg>', pos);
      const fe = Math.min(f1 < 0 ? Infinity : f1, f2 < 0 ? Infinity : f2);
      if (fe === Infinity) throw new Error('logo animado sem fechamento');
      if (ab >= 0 && ab < fe) { nivel++; pos = ab + 4; } else { nivel--; pos = fe + (fe === f2 ? 7 : 6); }
    }
    html = html.slice(0, ini) + quadro(300, 88, 30) + html.slice(pos);
  }
  // Logos do menu lateral (aberto 162 x 50, recolhido 50 x 50).
  html = html.replace(/<img src=\\"\/img\/logo-menu\.png\\"[^>]*\/>/g, quadro(162, 50, 18))
    .replace(/<img src=\\"\/img\/logo-menu-recolhido\.png\\"[^>]*\/>/g, quadro(50, 50, 10));
  if (/logo-menu|gt-logo\\"/.test(html.replace(/\.gt-logo[^{]*\{/g, ''))) throw new Error('sobrou logo no index.html');
  return html;
}

// Ícone da aba: quadrado cinza neutro (PNG 32 x 32 gerado aqui, sem a marca).
function faviconNeutro() {
  const T = 32, linhas = [];
  for (let y = 0; y < T; y++) {
    const l = Buffer.alloc(1 + T * 3); // filtro 0 + RGB
    for (let x = 0; x < T; x++) {
      const borda = x < 2 || y < 2 || x > T - 3 || y > T - 3;
      const c = borda ? [0x52, 0x62, 0x7A] : [0xEE, 0xF3, 0xF7];
      l.set(c, 1 + x * 3);
    }
    linhas.push(l);
  }
  const crc = (b) => { let c = ~0; for (const v of b) { c ^= v; for (let k = 0; k < 8; k++) c = (c >>> 1) ^ (0xEDB88320 & -(c & 1)); } return ~c >>> 0; };
  const pedaco = (tipo, dados) => {
    const t = Buffer.concat([Buffer.from(tipo), dados]), len = Buffer.alloc(4), c = Buffer.alloc(4);
    len.writeUInt32BE(dados.length); c.writeUInt32BE(crc(t));
    return Buffer.concat([len, t, c]);
  };
  const ihdr = Buffer.alloc(13); ihdr.writeUInt32BE(T, 0); ihdr.writeUInt32BE(T, 4); ihdr[8] = 8; ihdr[9] = 2;
  return Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), pedaco('IHDR', ihdr), pedaco('IDAT', zlib.deflateSync(Buffer.concat(linhas))), pedaco('IEND', Buffer.alloc(0))]);
}

module.exports = { NOMES, ficticio, semLogos, faviconNeutro };
