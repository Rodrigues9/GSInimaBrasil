-- Migração para o Azure, passo 3: liga as regras de acesso ao login Microsoft (Entra ID).
-- A API (PostgREST) recebe do site um token com o e-mail da pessoa e o coloca em request.jwt.claims.
-- Cada pessoa em ourinhos_usuarios é reconhecida pelo e-mail (ou, sem e-mail cadastrado, pelo login = parte antes do @).

-- E-mail corporativo de cada pessoa.
alter table public.ourinhos_usuarios add column if not exists email text;
create unique index if not exists ourinhos_usuarios_email_key on public.ourinhos_usuarios (lower(email));

-- E-mail de quem está conectado (vem do token do login Microsoft).
create or replace function privado.email_conectado() returns text
language sql stable set search_path = '' as $$
  select nullif(lower(coalesce(current_setting('request.jwt.claims', true), '{}')::jsonb ->> 'email'), '')
$$;

-- Cadastro da pessoa conectada: pelo e-mail ou, se ainda não tem e-mail, pelo login.
create or replace function privado.usuario_conectado() returns public.ourinhos_usuarios
language sql stable security definer set search_path = '' as $$
  select u.* from public.ourinhos_usuarios u, (select privado.email_conectado() e) c
  where c.e is not null and (lower(u.email) = c.e or (u.email is null and u.login = split_part(c.e, '@', 1)))
  order by (u.email is not null) desc
  limit 1
$$;

-- Mesmo papel do auth.uid() do Supabase: o id da pessoa conectada (usado por todas as regras de acesso).
create or replace function auth.uid() returns uuid
language sql stable security definer set search_path = '' as $$
  select (privado.usuario_conectado()).usuario_id
$$;
grant execute on function auth.uid() to anon, authenticated;
grant execute on function privado.email_conectado(), privado.usuario_conectado() to authenticated;

-- O id da pessoa só é definido no primeiro acesso (pela função registrar_acesso, dona da tabela).
create or replace function public.proteger_usuario_id() returns trigger
language plpgsql set search_path = '' as $$
begin
  if new.usuario_id is distinct from old.usuario_id
     and current_user not in ('service_role', (select r.rolname from pg_catalog.pg_class c join pg_catalog.pg_roles r on r.oid = c.relowner where c.oid = tg_relid)) then
    raise exception 'usuario_id só é definido no primeiro acesso';
  end if;
  return new;
end $$;

-- Chamado pelo site ao entrar: no primeiro acesso cria o id da pessoa e grava o e-mail; depois, só a hora do acesso.
create or replace function public.registrar_acesso() returns void
language plpgsql security definer set search_path = '' as $$
declare u public.ourinhos_usuarios; novo uuid;
begin
  u := privado.usuario_conectado();
  if u.login is null then return; end if;
  if u.usuario_id is null then
    novo := gen_random_uuid();
    insert into auth.users (id, email) values (novo, privado.email_conectado());
    update public.ourinhos_usuarios set usuario_id = novo, email = coalesce(email, privado.email_conectado()), ultimo_acesso = now() where login = u.login;
  else
    update public.ourinhos_usuarios set ultimo_acesso = now() where usuario_id = u.usuario_id;
  end if;
end $$;
grant execute on function public.registrar_acesso() to authenticated;

-- Primeiro administrador (os demais são cadastrados pelo site, em "Usuários e permissões").
insert into public.ourinhos_usuarios (login, nome, papel, ativo, email, permissoes)
values ('felipe.altafini', 'Felipe Rodrigues', 'admin', true, 'felipe.altafini@gsinima.com.br',
  '{"eta": {"on": true}, "ete": {"on": true}, "web": {"exp": true, "imp": true, "admin": true, "excluir": true, "cadastrar": true, "capacidades": true}, "poco": {"on": true}, "telas": {"agua": true, "etas": true, "etes": true, "pocos": true, "esgoto": true, "inicio": true, "etaForm": true, "volumes": true, "quimicos": true, "descargas": true, "calibracoes": true}, "coleta": {"on": true}, "descarga": {"on": true}}')
on conflict do nothing;

-- Foto de perfil: no Azure fica no próprio cadastro, como imagem embutida (JPEG de até ~90 KB).
create or replace function public.definir_minha_foto(caminho text) returns void
language plpgsql security definer set search_path = '' as $$
begin
  if caminho is not null and (caminho !~ '^data:image/jpeg;base64,[A-Za-z0-9+/=]+$' or length(caminho) > 120000) then
    raise exception 'foto inválida';
  end if;
  update public.ourinhos_usuarios set foto = caminho where usuario_id = auth.uid();
end $$;
