-- Migração para o Azure, passo 2: prepara o banco "ourinhos" antes de receber a estrutura do Supabase.
-- Rodar como o administrador do servidor: psql -v senha_authenticator='...' -f 2-preparar-banco.sql
-- Cria os mesmos papéis que o Supabase usa nas regras de acesso (anon, authenticated, service_role)
-- e o papel "authenticator", que a API (PostgREST) usa para conectar.
do $$ begin
  if not exists (select from pg_roles where rolname = 'anon') then create role anon nologin; end if;
  if not exists (select from pg_roles where rolname = 'authenticated') then create role authenticated nologin; end if;
  if not exists (select from pg_roles where rolname = 'service_role') then create role service_role nologin; end if;
  if not exists (select from pg_roles where rolname = 'authenticator') then create role authenticator login noinherit; end if;
end $$;
alter role authenticator password :'senha_authenticator';
grant anon, authenticated to authenticator;

-- Esquema "auth": no Supabase guarda os logins. Aqui fica só o necessário para as regras e chaves estrangeiras.
create schema if not exists auth;
grant usage on schema auth to anon, authenticated;
create table if not exists auth.users (
  id uuid primary key,
  email text,
  criado_em timestamptz not null default now()
);
-- Provisória: a versão final (login Microsoft) é criada no passo 3, depois que as tabelas existem.
create or replace function auth.uid() returns uuid language sql stable as $$ select null::uuid $$;
