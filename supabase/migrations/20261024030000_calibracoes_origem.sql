-- Origem de cada calibração: lançada pelo app ou importada da planilha (com a linha de origem),
-- para dar para conferir ou desfazer só a importação.
alter table public.ourinhos_calibracoes
  add column origem text not null default 'app' check (origem in ('app', 'planilha')),
  add column linha_planilha integer;
