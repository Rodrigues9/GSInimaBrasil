-- As funções de permissão saem do schema exposto pela API (ficam só para as regras de acesso).
create schema if not exists privado;
revoke all on schema privado from public;
grant usage on schema privado to authenticated;

alter function public.pode_lancar(text) set schema privado;
alter function public.acesso_web() set schema privado;
alter function public.e_admin() set schema privado;

-- Funções de gatilho não podem ser chamadas diretamente.
revoke execute on function public.preencher_autor(), public.preencher_analista() from public, anon, authenticated;
