// Monta o site publicado em dist/:
// - copia as páginas e o js/
// - copia o supabase-js (versão para navegador) e o xlsx (planilhas) para dist/vendor/
// - gera dist/env.js com as variáveis NEXT_PUBLIC_* (do .env local ou das variáveis da Vercel)
// MODO=azure: site no Azure Static Web Apps, com login Microsoft e a API em /api (não usa as chaves do Supabase).
// MODO=demo: versão do Power Apps, sem banco e com dados fictícios (js/demo.js), em powerapps/dist/,
//            com endereços relativos (o Power Apps serve o site dentro de uma pasta própria).
const fs = require('fs');
const path = require('path');

const root = path.resolve(__dirname, '..');
loadDotEnv();
const modo = process.env.MODO || '';
const azure = modo === 'azure', demo = modo === 'demo';
const out = demo ? path.join(root, 'powerapps', 'dist') : path.join(root, 'dist');

function loadDotEnv() {
  const file = path.join(root, '.env');
  if (!fs.existsSync(file)) return;
  for (const line of fs.readFileSync(file, 'utf8').split(/\r?\n/)) {
    const m = /^\s*([A-Z0-9_]+)\s*=\s*(.*?)\s*$/.exec(line);
    if (m && process.env[m[1]] === undefined) process.env[m[1]] = m[2].replace(/^["']|["']$/g, '');
  }
}

function copy(from, to) {
  const src = path.join(root, from);
  const dst = path.join(out, to || from);
  fs.cpSync(src, dst, { recursive: true });
}

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const key = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
if (!azure && !demo && (!url || !key)) {
  console.error('Faltam NEXT_PUBLIC_SUPABASE_URL e/ou NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY (no .env ou nas variáveis de ambiente da Vercel).');
  process.exit(1);
}

fs.rmSync(out, { recursive: true, force: true });
fs.mkdirSync(out, { recursive: true });
['index.html', 'favicon.png', 'img', 'js'].forEach((p) => copy(p));
copy('node_modules/@supabase/supabase-js/dist/umd/supabase.js', 'vendor/supabase.js');
// Biblioteca de planilhas (só é carregada quando alguém exporta em Excel).
copy('node_modules/xlsx/dist/xlsx.full.min.js', 'vendor/xlsx.js');
fs.writeFileSync(path.join(out, 'env.js'),
  'window.ENV = ' + JSON.stringify(azure ? { MODO: 'azure' } : demo ? { MODO: 'demo' } : { SUPABASE_URL: url, SUPABASE_PUBLISHABLE_KEY: key }) + ';\n');
// Configuração do Azure Static Web Apps (login Microsoft e proteção da API).
if (azure) copy('staticwebapp.config.json');
if (demo) {
  // Endereços relativos ("/img/x.png" -> "img/x.png") e o gerador de dados fictícios antes do db.js.
  const relativo = (txt) => txt.replace(/(["'])\/(img|js|vendor)\//g, '$1$2/').replace(/(["'])\/(env\.js|favicon\.png)/g, '$1$2');
  const html = path.join(out, 'index.html');
  let s = relativo(fs.readFileSync(html, 'utf8'));
  s = s.replace('<script src="js/db.js"></script>', '<script src="js/demo.js"></script>\n<script src="js/db.js"></script>');
  if (!s.includes('js/demo.js')) { console.error('Não achei onde incluir o js/demo.js no index.html.'); process.exit(1); }
  fs.writeFileSync(html, s);
  const db = path.join(out, 'js', 'db.js');
  fs.writeFileSync(db, relativo(fs.readFileSync(db, 'utf8')));
} else {
  fs.rmSync(path.join(out, 'js', 'demo.js'), { force: true });
}

console.log('Site gerado em ' + path.relative(root, out) + '/');
