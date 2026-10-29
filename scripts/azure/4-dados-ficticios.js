// Migração para o Azure, passo 4 (teste para o TI): grava no banco "ourinhos" do Azure um ano de dados FICTÍCIOS.
// Uso: node scripts/azure/4-dados-ficticios.js 2025-01-01 2025-12-31 > %USERPROFILE%\.ourinhos-azure\dados.sql
//      e depois psql -f com o administrador do servidor.
// Apaga antes os lançamentos existentes (o banco do Azure só tem estrutura e o administrador).
// Os nomes reais (pontos, ETEs, bairros) viram os fictícios de ficticio.js; as pessoas já são inventadas.
const { gerar } = require('./dados-ficticios');
const { ficticio } = require('./ficticio');

const [ini, fim] = process.argv.slice(2);
if (!/^\d{4}-\d{2}-\d{2}$/.test(ini || '') || !/^\d{4}-\d{2}-\d{2}$/.test(fim || '')) {
  console.error('Informe o período: node scripts/azure/4-dados-ficticios.js 2025-01-01 2025-12-31');
  process.exit(1);
}
const t = JSON.parse(ficticio(JSON.stringify(gerar(ini, fim)).replace(/Av\. Jacinto Ferreira de Sá/g, 'Av. das Palmeiras')));
// Valores aceitos pelas regras do banco: origem (app/planilha), grupo dos macromedidores (eta/poco) e código do sistema.
const SISTEMA = { 'ETAs': 'eta', 'Mirante': 'sj', 'Cascata': 'mor' };
Object.keys(t).forEach((n) => (t[n] || []).forEach((l) => {
  if ('origem' in l) l.origem = 'planilha';
  if (n === 'ourinhos_macros' && l.grupo !== 'eta') l.grupo = 'poco';
  if (n === 'ourinhos_descarregamentos' && !l.ponto_id) { l.ponto_id = 'ETA 1'; l.ponto_nome = 'ETA 1'; }
  if ((n === 'ourinhos_coletas_campo' || n === 'descargas_rede') && l.sistema) l.sistema = l.sistema === 'ETAs' ? 'eta' : SISTEMA[l.bairro] || 'sj';
}));
// Usuários fictícios: sem conta ligada (usuario_id fica vazio até um primeiro acesso), sem o usuário de demonstração.
t.ourinhos_usuarios = t.ourinhos_usuarios.filter((u) => u.login !== 'demonstracao').map((u) => Object.assign(u, { usuario_id: null, criado_por: null }));

const TABELAS = ['capacidades_pocos', 'ourinhos_usuarios', 'ourinhos_macros', 'ourinhos_analises_pocos', 'ourinhos_medicoes_pocos', 'ourinhos_operacao_etes',
  'ourinhos_analises_esgoto', 'ourinhos_calibracoes', 'ourinhos_analises_agua', 'ourinhos_estoque_quimicos', 'ourinhos_descarregamentos',
  'ourinhos_coletas_campo', 'descargas_rede'];
const out = ['\\set ON_ERROR_STOP on', 'begin;',
  // Limpa os lançamentos (mantém o administrador e quem já entrou com a conta Microsoft).
  ...TABELAS.filter((n) => n !== 'ourinhos_usuarios').map((n) => 'delete from public.' + n + ';'),
  "delete from public.ourinhos_usuarios where usuario_id is null and coalesce(papel, '') <> 'admin';"];
for (const nome of TABELAS) {
  const linhas = t[nome] || [];
  for (let i = 0; i < linhas.length; i += 2000) {
    const lote = JSON.stringify(linhas.slice(i, i + 2000));
    out.push('insert into public.' + nome + ' select * from json_populate_recordset(null::public.' + nome + ', $json$' + lote + '$json$)' +
      (nome === 'ourinhos_usuarios' ? ' on conflict do nothing' : '') + ';');
  }
}
out.push('commit;');
TABELAS.forEach((n) => out.push("select '" + n + "' as tabela, count(*) from public." + n + ';'));
process.stdout.write(out.join('\n') + '\n');
