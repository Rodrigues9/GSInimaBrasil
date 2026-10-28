// Monta o site publicado em dist/:
// - copia as páginas e o js/
// - copia o supabase-js (versão para navegador) e o xlsx (planilhas) para dist/vendor/
// - gera dist/env.js com as variáveis NEXT_PUBLIC_* (do .env local ou das variáveis da Vercel)
const fs = require('fs');
const path = require('path');

const root = path.resolve(__dirname, '..');
const out = path.join(root, 'dist');

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

loadDotEnv();
// MODO=azure: site no Azure Static Web Apps, com login Microsoft e a API em /api (não usa as chaves do Supabase).
const azure = process.env.MODO === 'azure';
const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const key = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
if (!azure && (!url || !key)) {
  console.error('Faltam NEXT_PUBLIC_SUPABASE_URL e/ou NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY (no .env ou nas variáveis de ambiente da Vercel).');
  process.exit(1);
}

fs.rmSync(out, { recursive: true, force: true });
fs.mkdirSync(out);
['index.html', 'favicon.png', 'img', 'js'].forEach((p) => copy(p));
copy('node_modules/@supabase/supabase-js/dist/umd/supabase.js', 'vendor/supabase.js');
// Biblioteca de planilhas (só é carregada quando alguém exporta em Excel).
copy('node_modules/xlsx/dist/xlsx.full.min.js', 'vendor/xlsx.js');
fs.writeFileSync(path.join(out, 'env.js'),
  'window.ENV = ' + JSON.stringify(azure ? { MODO: 'azure' } : { SUPABASE_URL: url, SUPABASE_PUBLISHABLE_KEY: key }) + ';\n');
// Configuração do Azure Static Web Apps (login Microsoft e proteção da API).
if (azure) copy('staticwebapp.config.json');

console.log('Site gerado em dist/');
