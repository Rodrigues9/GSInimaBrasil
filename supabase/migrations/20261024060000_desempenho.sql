-- Ajustes de desempenho apontados pelo Supabase (Advisors):
-- 1) índice na coluna usuario_id (autor) de cada tabela de lançamentos e em perfis.criado_por;
-- 2) a regra de leitura de perfis calcula auth.uid() uma vez por consulta, não uma vez por linha.
create index if not exists coletas_usuario_id_idx on public.coletas (usuario_id);
create index if not exists descargas_rede_usuario_id_idx on public.descargas_rede (usuario_id);
create index if not exists descarregamentos_pocos_usuario_id_idx on public.descarregamentos_pocos (usuario_id);
create index if not exists descarregamentos_quimicos_usuario_id_idx on public.descarregamentos_quimicos (usuario_id);
create index if not exists estoque_eta_usuario_id_idx on public.estoque_eta (usuario_id);
create index if not exists estoque_poco_usuario_id_idx on public.estoque_poco (usuario_id);
create index if not exists operacao_eta_usuario_id_idx on public.operacao_eta (usuario_id);
create index if not exists ourinhos_analises_pocos_usuario_id_idx on public.ourinhos_analises_pocos (usuario_id);
create index if not exists ourinhos_calibracoes_usuario_id_idx on public.ourinhos_calibracoes (usuario_id);
create index if not exists ourinhos_macros_usuario_id_idx on public.ourinhos_macros (usuario_id);
create index if not exists visitas_ete_usuario_id_idx on public.visitas_ete (usuario_id);
create index if not exists perfis_criado_por_idx on public.perfis (criado_por);

alter policy "Ver o próprio perfil ou, com permissão, todos" on public.perfis
  using ((usuario_id = (select auth.uid())) or privado.e_admin() or privado.pode_web('cadastrar') or privado.pode_web('excluir'));
