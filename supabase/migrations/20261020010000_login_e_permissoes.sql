-- Login e permissões: só usuários com conta ativa leem e lançam, cada um nos blocos liberados.
-- Já aplicada no projeto Supabase "gsinima-app".
--
-- O login (ex.: felipe.altafini) vira o e-mail interno <login>@usuarios.gsinima.local no Supabase Auth.
-- As contas são criadas pelo administrador (não há cadastro público).

create table public.perfis (
  id uuid primary key references auth.users (id) on delete cascade,
  login text not null unique check (login ~ '^[a-z0-9._-]{3,40}$'),
  nome text not null check (char_length(nome) between 1 and 80),
  papel text not null default 'operador' check (papel in ('operador', 'lab', 'super', 'admin')),
  ativo boolean not null default true,
  -- Mesmo formato da tela "Usuários e permissões":
  -- { eta|ete|poco|coleta|descarga: { on, corrigir, exportar, units: { nome: bool } },
  --   web: { acesso, painelVer, painelExp, imp, exp, admin } }
  permissoes jsonb not null check (jsonb_typeof(permissoes) = 'object'),
  ultimo_acesso timestamptz,
  criado_em timestamptz not null default now()
);

-- ---------- funções de permissão (usadas nas regras de acesso) ----------
create or replace function public.pode_lancar(bloco text)
returns boolean language sql stable security definer set search_path = '' as $$
  select coalesce((
    select p.ativo and coalesce((p.permissoes -> bloco ->> 'on')::boolean, false)
    from public.perfis p where p.id = auth.uid()
  ), false);
$$;

create or replace function public.acesso_web()
returns boolean language sql stable security definer set search_path = '' as $$
  select coalesce((
    select p.ativo and coalesce((p.permissoes -> 'web' ->> 'acesso')::boolean, false)
    from public.perfis p where p.id = auth.uid()
  ), false);
$$;

create or replace function public.e_admin()
returns boolean language sql stable security definer set search_path = '' as $$
  select coalesce((
    select p.ativo and coalesce((p.permissoes -> 'web' ->> 'admin')::boolean, false)
    from public.perfis p where p.id = auth.uid()
  ), false);
$$;

-- Marca o último acesso do próprio usuário (sem dar permissão de editar o perfil).
create or replace function public.registrar_acesso()
returns void language sql volatile security definer set search_path = '' as $$
  update public.perfis set ultimo_acesso = now() where id = auth.uid();
$$;

revoke execute on function public.pode_lancar(text), public.acesso_web(), public.e_admin(), public.registrar_acesso() from public, anon;
grant execute on function public.pode_lancar(text), public.acesso_web(), public.e_admin(), public.registrar_acesso() to authenticated;

-- ---------- perfis ----------
alter table public.perfis enable row level security;
grant select, update on public.perfis to authenticated;
create policy "Ver o próprio perfil ou, se admin, todos" on public.perfis
  for select to authenticated using (id = auth.uid() or public.e_admin());
create policy "Admin edita perfis" on public.perfis
  for update to authenticated using (public.e_admin()) with check (public.e_admin());

-- ---------- quem lançou: preenchido pelo banco, não pelo navegador ----------
create or replace function public.preencher_autor()
returns trigger language plpgsql security definer set search_path = '' as $$
declare v_nome text;
begin
  select nome into v_nome from public.perfis where id = auth.uid();
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
    new.analista := coalesce((select nome from public.perfis where id = auth.uid()), new.analista);
    new.concluida_em := now();
  end if;
  return new;
end $$;

-- ---------- tabelas dos formulários ----------
do $$
declare
  t text;
  pol record;
begin
  foreach t in array array['leituras_macromedidor','estoque_poco','calibracoes_eta','estoque_eta',
                           'descarregamentos_quimicos','visitas_ete','coletas','descargas_rede']
  loop
    execute format('alter table public.%I add column usuario_id uuid references auth.users (id) on delete set null', t);
    execute format('create trigger preencher_autor before insert on public.%I for each row execute function public.preencher_autor()', t);
    -- Sem login, nada.
    execute format('revoke all on public.%I from anon', t);
    for pol in select policyname from pg_policies where schemaname = 'public' and tablename = t loop
      execute format('drop policy %I on public.%I', pol.policyname, t);
    end loop;
  end loop;
end $$;

create trigger preencher_analista before update on public.coletas
  for each row execute function public.preencher_analista();

-- Quem tem acesso ao sistema web vê tudo; no app, cada um vê os blocos liberados.
-- Lançar exige o bloco liberado.
create policy "Ver" on public.leituras_macromedidor for select to authenticated
  using (public.acesso_web() or public.pode_lancar(case when grupo = 'eta' then 'eta' else 'poco' end));
create policy "Lançar" on public.leituras_macromedidor for insert to authenticated
  with check (public.pode_lancar(case when grupo = 'eta' then 'eta' else 'poco' end));

create policy "Ver" on public.estoque_poco for select to authenticated using (public.acesso_web() or public.pode_lancar('poco'));
create policy "Lançar" on public.estoque_poco for insert to authenticated with check (public.pode_lancar('poco'));

create policy "Ver" on public.calibracoes_eta for select to authenticated using (public.acesso_web() or public.pode_lancar('eta'));
create policy "Lançar" on public.calibracoes_eta for insert to authenticated with check (public.pode_lancar('eta'));

create policy "Ver" on public.estoque_eta for select to authenticated using (public.acesso_web() or public.pode_lancar('eta'));
create policy "Lançar" on public.estoque_eta for insert to authenticated with check (public.pode_lancar('eta'));

create policy "Ver" on public.descarregamentos_quimicos for select to authenticated using (public.acesso_web() or public.pode_lancar('eta'));
create policy "Lançar" on public.descarregamentos_quimicos for insert to authenticated with check (public.pode_lancar('eta'));

create policy "Ver" on public.visitas_ete for select to authenticated using (public.acesso_web() or public.pode_lancar('ete'));
create policy "Lançar" on public.visitas_ete for insert to authenticated with check (public.pode_lancar('ete'));

create policy "Ver" on public.coletas for select to authenticated using (public.acesso_web() or public.pode_lancar('coleta'));
create policy "Lançar" on public.coletas for insert to authenticated with check (public.pode_lancar('coleta'));
create policy "Concluir análises de coleta pendente" on public.coletas for update to authenticated
  using (status = 'pendente' and public.pode_lancar('coleta')) with check (public.pode_lancar('coleta'));

create policy "Ver" on public.descargas_rede for select to authenticated using (public.acesso_web() or public.pode_lancar('descarga'));
create policy "Lançar" on public.descargas_rede for insert to authenticated with check (public.pode_lancar('descarga'));
create policy "Encerrar descarga em andamento" on public.descargas_rede for update to authenticated
  using (status = 'andamento' and public.pode_lancar('descarga')) with check (public.pode_lancar('descarga'));
