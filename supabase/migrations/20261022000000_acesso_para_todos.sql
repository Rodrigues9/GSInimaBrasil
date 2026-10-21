-- Site único (app + sistema web): todo usuário ativo pode consultar os lançamentos.
-- A opção "Acesso ao sistema web" deixou de existir; quem vê cada tela no computador
-- é decidido pelas permissões de telas (permissoes -> 'telas'), controladas no próprio site.
create or replace function privado.acesso_web()
returns boolean language sql stable security definer set search_path = '' as $$
  select coalesce((
    select p.ativo from public.perfis p where p.usuario_id = auth.uid()
  ), false);
$$;
