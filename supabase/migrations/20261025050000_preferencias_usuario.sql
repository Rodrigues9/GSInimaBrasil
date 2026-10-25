-- Preferências de cada pessoa no sistema web (por enquanto, o último período escolhido em cada tela com gráficos).
-- Ficam na conta, então valem em qualquer aparelho e continuam depois de sair e entrar de novo.

alter table public.ourinhos_usuarios add column preferencias jsonb not null default '{}'::jsonb
  check (jsonb_typeof(preferencias) = 'object' and pg_column_size(preferencias) <= 8192);

-- Grava uma preferência da própria pessoa (chave curta, valor pequeno). Ninguém altera a de outra pessoa.
create or replace function public.salvar_preferencia(chave text, valor jsonb)
returns void
language plpgsql
security definer
set search_path to ''
as $$
begin
  if chave is null or chave !~ '^[A-Za-z0-9_.-]{1,60}$' then
    raise exception 'chave de preferência inválida';
  end if;
  if valor is not null and pg_column_size(valor) > 1024 then
    raise exception 'preferência grande demais';
  end if;
  update public.ourinhos_usuarios
     set preferencias = case when valor is null then preferencias - chave else preferencias || jsonb_build_object(chave, valor) end
   where usuario_id = auth.uid();
end $$;

revoke all on function public.salvar_preferencia(text, jsonb) from public, anon;
grant execute on function public.salvar_preferencia(text, jsonb) to authenticated;
