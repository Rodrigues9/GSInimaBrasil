// Ponte entre o site e o banco no Azure.
// O Static Web Apps só deixa chegar aqui quem entrou com a conta Microsoft (rota /api/* exige "authenticated")
// e informa quem é no cabeçalho x-ms-client-principal. Esta função repassa a consulta ao PostgREST com um
// token curto, assinado com o segredo que só ela e o PostgREST conhecem, contendo o e-mail da pessoa.
// No banco, as regras de acesso usam esse e-mail (auth.uid()), do mesmo jeito que faziam no Supabase.
const { app } = require('@azure/functions');
const crypto = require('crypto');

const POSTGREST_URL = (process.env.POSTGREST_URL || '').replace(/\/$/, '');
const SEGREDO = process.env.JWT_SEGREDO || '';
// Cabeçalhos que o supabase-js usa e que o PostgREST entende.
const IDA = ['accept', 'content-type', 'prefer', 'range', 'range-unit', 'accept-profile', 'content-profile'];
const VOLTA = ['content-type', 'content-range', 'preference-applied', 'location'];

const b64url = (b) => Buffer.from(b).toString('base64').replace(/=+$/, '').replace(/\+/g, '-').replace(/\//g, '_');
function token(email, id) {
  const agora = Math.floor(Date.now() / 1000);
  const corpo = b64url(JSON.stringify({ alg: 'HS256', typ: 'JWT' })) + '.' +
    b64url(JSON.stringify({ role: 'authenticated', email, sub: id, iat: agora, exp: agora + 300 }));
  return corpo + '.' + b64url(crypto.createHmac('sha256', SEGREDO).update(corpo).digest());
}

app.http('rest', {
  route: 'rest/v1/{*caminho}',
  methods: ['GET', 'HEAD', 'POST', 'PATCH', 'PUT', 'DELETE'],
  authLevel: 'anonymous',
  handler: async (req) => {
    if (!POSTGREST_URL || !SEGREDO) return { status: 500, jsonBody: { message: 'API não configurada' } };
    let pessoa = null;
    try { pessoa = JSON.parse(Buffer.from(req.headers.get('x-ms-client-principal') || '', 'base64').toString('utf8')); } catch (e) { /* sem login */ }
    const email = pessoa && String(pessoa.userDetails || '').toLowerCase();
    if (!email || !(pessoa.userRoles || []).includes('authenticated')) return { status: 401, jsonBody: { message: 'entre com a conta Microsoft' } };

    const url = new URL(req.url);
    const destino = POSTGREST_URL + '/' + (req.params.caminho || '') + url.search;
    const cab = { authorization: 'Bearer ' + token(email, pessoa.userId) };
    IDA.forEach((h) => { const v = req.headers.get(h); if (v) cab[h] = v; });
    const temCorpo = !['GET', 'HEAD'].includes(req.method);
    const r = await fetch(destino, { method: req.method, headers: cab, body: temCorpo ? Buffer.from(await req.arrayBuffer()) : undefined });

    const volta = {};
    VOLTA.forEach((h) => { const v = r.headers.get(h); if (v) volta[h] = v; });
    return { status: r.status, headers: volta, body: req.method === 'HEAD' ? undefined : Buffer.from(await r.arrayBuffer()) };
  }
});
