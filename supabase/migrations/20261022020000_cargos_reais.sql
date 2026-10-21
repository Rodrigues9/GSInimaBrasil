-- Cargos reais da empresa (substituem operador / lab / super):
-- operador_volante, operador_eta, analista (Analista de Laboratório), supervisor, coordenador, admin.
alter table public.perfis drop constraint perfis_papel_check;

-- Contas existentes: operador com o bloco das ETAs vira Operador de ETA; os demais operadores, Operador Volante.
update public.perfis set papel = case
  when papel = 'operador' and coalesce((permissoes -> 'eta' ->> 'on')::boolean, false) then 'operador_eta'
  when papel = 'operador' then 'operador_volante'
  when papel = 'lab' then 'analista'
  when papel = 'super' then 'supervisor'
  else papel end
where papel in ('operador', 'lab', 'super');

alter table public.perfis add constraint perfis_papel_check
  check (papel in ('operador_volante', 'operador_eta', 'analista', 'supervisor', 'coordenador', 'admin'));

-- Nomes para o campo "Operador" dos formulários das ETAs: primeiro nome de cada conta ativa
-- com o cargo Operador de ETA (inclui quem ainda não fez o primeiro acesso).
create or replace function public.operadores_eta()
returns table (nome text) language sql stable security definer set search_path = '' as $$
  select distinct split_part(btrim(p.nome), ' ', 1)
  from public.perfis p
  where p.papel = 'operador_eta' and p.ativo and privado.acesso_web();
$$;
revoke execute on function public.operadores_eta() from public, anon;
grant execute on function public.operadores_eta() to authenticated;
