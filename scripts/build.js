// Monta o site publicado em dist/:
// - copia as páginas e o js/
// - copia o supabase-js (versão para navegador) para dist/vendor/
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
const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const key = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
if (!url || !key) {
  console.error('Faltam NEXT_PUBLIC_SUPABASE_URL e/ou NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY (no .env ou nas variáveis de ambiente da Vercel).');
  process.exit(1);
}

fs.rmSync(out, { recursive: true, force: true });
fs.mkdirSync(out);
['index.html', 'favicon.svg', 'app', 'sistema-web', 'js'].forEach((p) => copy(p));
copy('node_modules/@supabase/supabase-js/dist/umd/supabase.js', 'vendor/supabase.js');
fs.writeFileSync(path.join(out, 'env.js'),
  'window.ENV = ' + JSON.stringify({ SUPABASE_URL: url, SUPABASE_PUBLISHABLE_KEY: key }) + ';\n');

console.log('Site gerado em dist/');
