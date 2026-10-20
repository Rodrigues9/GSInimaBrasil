-- Cadastro de usuário sem senha: o administrador cria o perfil (login, nome, cargo, permissões)
-- e a própria pessoa define a senha no primeiro acesso (função "primeiro-acesso").
-- Perfil com usuario_id vazio = aguardando primeiro acesso.

alter table public.perfis rename column id to usuario_id;
alter table public.perfis drop constraint perfis_pkey;
alter table public.perfis alter column usuario_id drop not null;
alter table public.perfis add constraint perfis_usuario_id_key unique (usuario_id);
alter table public.perfis add column id uuid not null default gen_random_uuid() primary key;
alter table public.perfis add column criado_por uuid references auth.users (id) on delete set null;

-- Funções de permissão passam a procurar pelo usuario_id.
create or replace function privado.pode_lancar(bloco text)
returns boolean language sql stable security definer set search_path = '' as $$
  select coalesce((
    select p.ativo and coalesce((p.permissoes -> bloco ->> 'on')::boolean, false)
    from public.perfis p where p.usuario_id = auth.uid()
  ), false);
$$;

create or replace function privado.acesso_web()
returns boolean language sql stable security definer set search_path = '' as $$
  select coalesce((
    select p.ativo and coalesce((p.permissoes -> 'web' ->> 'acesso')::boolean, false)
    from public.perfis p where p.usuario_id = auth.uid()
  ), false);
$$;

create or replace function privado.e_admin()
returns boolean language sql stable security definer set search_path = '' as $$
  select coalesce((
    select p.ativo and coalesce((p.permissoes -> 'web' ->> 'admin')::boolean, false)
    from public.perfis p where p.usuario_id = auth.uid()
  ), false);
$$;

create or replace function public.registrar_acesso()
returns void language sql volatile security definer set search_path = '' as $$
  update public.perfis set ultimo_acesso = now() where usuario_id = auth.uid();
$$;

create or replace function public.preencher_autor()
returns trigger language plpgsql security definer set search_path = '' as $$
declare v_nome text;
begin
  select nome into v_nome from public.perfis where usuario_id = auth.uid();
  new.usuario_id := auth.uid();
  if tg_table_name = 'coletas' then
    new.coletor := coalesce(v_nome, new.coletor);
  else
    new.operador := coalesce(v_nome, new.operador);
  end if;
  return new;
end $$;

create or replace function public.preencher_analista()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if new.status = 'concluida' and old.status <> 'concluida' then
    new.analista := coalesce((select nome from public.perfis where usuario_id = auth.uid()), new.analista);
    new.concluida_em := now();
  end if;
  return new;
end $$;

revoke execute on function public.preencher_autor(), public.preencher_analista() from public, anon, authenticated;

-- Admin cadastra perfis (sempre sem conta ligada; a conta nasce no primeiro acesso).
grant insert on public.perfis to authenticated;
create policy "Admin cadastra perfis" on public.perfis
  for insert to authenticated
  with check (privado.e_admin() and usuario_id is null);

-- O admin não pode ligar/desligar a conta de Auth de um perfil pela tela.
-- security invoker: current_user é quem fez a requisição (authenticated, service_role...).
create or replace function public.proteger_usuario_id()
returns trigger language plpgsql security invoker set search_path = '' as $$
begin
  if new.usuario_id is distinct from old.usuario_id and current_user not in ('service_role', 'postgres', 'supabase_admin') then
    raise exception 'usuario_id só é definido no primeiro acesso';
  end if;
  return new;
end $$;
revoke execute on function public.proteger_usuario_id() from public, anon, authenticated;
create trigger proteger_usuario_id before update on public.perfis
  for each row execute function public.proteger_usuario_id();

create or replace function public.preencher_criado_por()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  new.criado_por := auth.uid();
  return new;
end $$;
revoke execute on function public.preencher_criado_por() from public, anon, authenticated;
create trigger preencher_criado_por before insert on public.perfis
  for each row execute function public.preencher_criado_por();
