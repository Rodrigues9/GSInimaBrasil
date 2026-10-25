-- Novos formulários (medições de níveis dos poços, análises quinzenais das ETAs e análises mensais das ETEs),
-- descarregamentos das ETAs e dos poços numa tabela só, e nomes com o prefixo ourinhos_.

-- ---------- nomes novos ----------
alter table public.perfis rename to ourinhos_usuarios;
alter table public.operacao_eta rename to ourinhos_operacao_etas;
alter table public.coletas rename to ourinhos_coletas_campo;

-- Funções que liam os nomes antigos.
create or replace function privado.acesso_web() returns boolean language sql stable security definer set search_path to '' as $$
  select coalesce((select p.ativo from public.ourinhos_usuarios p where p.usuario_id = auth.uid()), false);
$$;
create or replace function privado.pode_lancar(bloco text) returns boolean language sql stable security definer set search_path to '' as $$
  select coalesce((
    select p.ativo and coalesce((p.permissoes -> bloco ->> 'on')::boolean, false)
    from public.ourinhos_usuarios p where p.usuario_id = auth.uid()
  ), false);
$$;
create or replace function privado.e_admin() returns boolean language sql stable security definer set search_path to '' as $$
  select coalesce((
    select p.ativo and coalesce((p.permissoes -> 'web' ->> 'admin')::boolean, false)
    from public.ourinhos_usuarios p where p.usuario_id = auth.uid()
  ), false);
$$;
create or replace function privado.pode_web(acao text) returns boolean language sql stable security definer set search_path to '' as $$
  select coalesce((
    select p.ativo and coalesce((p.permissoes -> 'web' ->> acao)::boolean, false)
    from public.ourinhos_usuarios p where p.usuario_id = auth.uid()
  ), false);
$$;
create or replace function privado.acima_de_operador() returns boolean language sql stable security definer set search_path to '' as $$
  select coalesce((
    select p.ativo and p.papel not in ('operador_eta', 'operador_volante')
    from public.ourinhos_usuarios p where p.usuario_id = auth.uid()
  ), false);
$$;
create or replace function public.operadores_eta() returns table(nome text) language sql stable security definer set search_path to '' as $$
  select distinct split_part(btrim(p.nome), ' ', 1)
  from public.ourinhos_usuarios p
  where p.papel = 'operador_eta' and p.ativo and privado.acesso_web();
$$;
create or replace function public.registrar_acesso() returns void language sql security definer set search_path to '' as $$
  update public.ourinhos_usuarios set ultimo_acesso = now() where usuario_id = auth.uid();
$$;
create or replace function public.definir_minha_foto(caminho text) returns void language plpgsql security definer set search_path to '' as $$
begin
  if caminho is not null and caminho !~ ('^' || auth.uid()::text || '/[A-Za-z0-9._-]+$') then
    raise exception 'caminho de foto inválido';
  end if;
  update public.ourinhos_usuarios set foto = caminho where usuario_id = auth.uid();
end $$;
create or replace function public.preencher_analista() returns trigger language plpgsql security definer set search_path to '' as $$
begin
  if new.status = 'concluida' and old.status <> 'concluida' then
    new.analista := coalesce((select nome from public.ourinhos_usuarios where usuario_id = auth.uid()), new.analista);
    new.concluida_em := now();
  end if;
  return new;
end $$;
create or replace function public.preencher_autor() returns trigger language plpgsql security definer set search_path to '' as $$
declare v_nome text;
begin
  select nome into v_nome from public.ourinhos_usuarios where usuario_id = auth.uid();
  new.usuario_id := auth.uid();
  if tg_table_name in ('ourinhos_coletas_campo', 'coletas') then
    new.coletor := coalesce(v_nome, new.coletor);
  else
    new.operador := coalesce(v_nome, new.operador);
  end if;
  return new;
end $$;

-- ---------- descarregamentos (ETAs e poços) ----------
drop table public.descarregamentos_quimicos, public.descarregamentos_pocos; -- estavam vazias
create table public.ourinhos_descarregamentos (
  id uuid primary key default gen_random_uuid(),
  criado_em timestamptz not null default now(),
  turno text check (turno in ('Diurno', 'Noturno')),
  local text not null check (local in ('eta', 'poco')),
  lote_id uuid,                                                        -- poços: a mesma carga dividida entre destinos
  produto text not null check (char_length(produto) <= 60),
  ponto_id text not null check (char_length(ponto_id) <= 20),          -- 'ETA 1' / 'ETA 2' ou o código do poço (ex.: m3)
  ponto_nome text not null check (char_length(ponto_nome) <= 120),
  quantidade numeric not null check (quantidade > 0),
  unidade text not null check (unidade in ('kg', 'L')),                -- ETAs em kg, poços em litros
  operador text not null default 'Operador' check (char_length(operador) <= 80),
  usuario_id uuid references auth.users (id) on delete set null
);
create index on public.ourinhos_descarregamentos (local, ponto_id, criado_em desc);
create index on public.ourinhos_descarregamentos (criado_em desc);
create index on public.ourinhos_descarregamentos (usuario_id);

-- ---------- medições de níveis dos poços (mensal) ----------
create table public.ourinhos_medicoes_pocos (
  id uuid primary key default gen_random_uuid(),
  criado_em timestamptz not null default now(),
  turno text check (turno in ('Diurno', 'Noturno')),
  ponto_id text not null check (char_length(ponto_id) <= 20),
  ponto_nome text not null check (char_length(ponto_nome) <= 120),
  nivel_estatico_m numeric check (nivel_estatico_m >= 0),
  nivel_dinamico_m numeric check (nivel_dinamico_m >= 0),
  observacao text check (char_length(observacao) <= 1000),
  operador text not null default 'Operador' check (char_length(operador) <= 80),
  usuario_id uuid references auth.users (id) on delete set null,
  origem text not null default 'app' check (origem in ('app', 'planilha')),
  linha_planilha integer,
  check (coalesce(nivel_estatico_m, nivel_dinamico_m) is not null)
);
create index on public.ourinhos_medicoes_pocos (ponto_id, criado_em desc);
create index on public.ourinhos_medicoes_pocos (criado_em desc);
create index on public.ourinhos_medicoes_pocos (usuario_id);

-- ---------- análises quinzenais das ETAs (água bruta e tratada) ----------
create table public.ourinhos_analises_agua (
  id uuid primary key default gen_random_uuid(),
  criado_em timestamptz not null default now(),
  turno text check (turno in ('Diurno', 'Noturno')),
  bruta_turbidez_ntu numeric check (bruta_turbidez_ntu >= 0),
  bruta_cor_ptco numeric check (bruta_cor_ptco >= 0),
  bruta_ph numeric check (bruta_ph between 0 and 14),
  bruta_ferro_mg_l numeric check (bruta_ferro_mg_l >= 0),
  bruta_manganes_mg_l numeric check (bruta_manganes_mg_l >= 0),
  bruta_alcalinidade_mg_l numeric check (bruta_alcalinidade_mg_l >= 0),
  bruta_dureza_mg_l numeric check (bruta_dureza_mg_l >= 0),
  tratada_turbidez_ntu numeric check (tratada_turbidez_ntu >= 0),
  tratada_cor_ptco numeric check (tratada_cor_ptco >= 0),
  tratada_ph numeric check (tratada_ph between 0 and 14),
  tratada_cloro_livre_mg_l numeric check (tratada_cloro_livre_mg_l >= 0),
  tratada_cloro_total_mg_l numeric check (tratada_cloro_total_mg_l >= 0),
  tratada_fluoreto_mg_l numeric check (tratada_fluoreto_mg_l >= 0),
  tratada_ferro_mg_l numeric check (tratada_ferro_mg_l >= 0),
  tratada_manganes_mg_l numeric check (tratada_manganes_mg_l >= 0),
  tratada_aluminio_mg_l numeric check (tratada_aluminio_mg_l >= 0),
  tratada_alcalinidade_mg_l numeric check (tratada_alcalinidade_mg_l >= 0),
  tratada_dureza_mg_l numeric check (tratada_dureza_mg_l >= 0),
  observacao text check (char_length(observacao) <= 1000),
  operador text not null default 'Operador' check (char_length(operador) <= 80),
  usuario_id uuid references auth.users (id) on delete set null,
  origem text not null default 'app' check (origem in ('app', 'planilha')),
  linha_planilha integer
);
create index on public.ourinhos_analises_agua (criado_em desc);
create index on public.ourinhos_analises_agua (usuario_id);

-- ---------- análises mensais das ETEs (esgoto bruto e tratado) ----------
create table public.ourinhos_analises_esgoto (
  id uuid primary key default gen_random_uuid(),
  criado_em timestamptz not null default now(),
  turno text check (turno in ('Diurno', 'Noturno')),
  ete text not null check (char_length(ete) <= 120),
  -- 'fosforo','nitrato','nitrito','namon','ntotal','sulfato','sulfeto' com -b (bruto) e -t (tratado), em mg/L;
  -- acima do limite de quantificação fica o texto ">LQ"
  analises jsonb not null check (jsonb_typeof(analises) = 'object'),
  observacao text check (char_length(observacao) <= 1000),
  operador text not null default 'Operador' check (char_length(operador) <= 80),
  usuario_id uuid references auth.users (id) on delete set null,
  origem text not null default 'app' check (origem in ('app', 'planilha')),
  linha_planilha integer
);
create index on public.ourinhos_analises_esgoto (ete, criado_em desc);
create index on public.ourinhos_analises_esgoto (criado_em desc);
create index on public.ourinhos_analises_esgoto (usuario_id);

-- ---------- autor, turno e acesso ----------
create trigger preencher_autor before insert on public.ourinhos_descarregamentos for each row execute function public.preencher_autor();
create trigger definir_turno before insert on public.ourinhos_descarregamentos for each row execute function privado.definir_turno();
create trigger preencher_autor before insert on public.ourinhos_medicoes_pocos for each row execute function public.preencher_autor();
create trigger definir_turno before insert on public.ourinhos_medicoes_pocos for each row execute function privado.definir_turno();
create trigger preencher_autor before insert on public.ourinhos_analises_agua for each row execute function public.preencher_autor();
create trigger definir_turno before insert on public.ourinhos_analises_agua for each row execute function privado.definir_turno();
create trigger preencher_autor before insert on public.ourinhos_analises_esgoto for each row execute function public.preencher_autor();
create trigger definir_turno before insert on public.ourinhos_analises_esgoto for each row execute function privado.definir_turno();

alter table public.ourinhos_descarregamentos enable row level security;
alter table public.ourinhos_medicoes_pocos enable row level security;
alter table public.ourinhos_analises_agua enable row level security;
alter table public.ourinhos_analises_esgoto enable row level security;
revoke all on public.ourinhos_descarregamentos, public.ourinhos_medicoes_pocos, public.ourinhos_analises_agua, public.ourinhos_analises_esgoto from anon;
create policy "Ver" on public.ourinhos_descarregamentos for select to authenticated using (privado.acesso_web() or privado.pode_lancar(local));
create policy "Lançar" on public.ourinhos_descarregamentos for insert to authenticated with check (privado.pode_lancar(local));
create policy "Ver" on public.ourinhos_medicoes_pocos for select to authenticated using (privado.acesso_web() or privado.pode_lancar('poco'));
create policy "Lançar" on public.ourinhos_medicoes_pocos for insert to authenticated with check (privado.pode_lancar('poco'));
create policy "Ver" on public.ourinhos_analises_agua for select to authenticated using (privado.acesso_web() or privado.pode_lancar('eta'));
create policy "Lançar" on public.ourinhos_analises_agua for insert to authenticated with check (privado.pode_lancar('eta'));
create policy "Ver" on public.ourinhos_analises_esgoto for select to authenticated using (privado.acesso_web() or privado.pode_lancar('ete'));
create policy "Lançar" on public.ourinhos_analises_esgoto for insert to authenticated with check (privado.pode_lancar('ete'));

-- ---------- ponte temporária ----------
-- O site publicado ainda usa os nomes antigos até a nova versão entrar no ar; estas visões saem logo depois.
create view public.perfis with (security_invoker = true) as select * from public.ourinhos_usuarios;
create view public.operacao_eta with (security_invoker = true) as select * from public.ourinhos_operacao_etas;
create view public.coletas with (security_invoker = true) as select * from public.ourinhos_coletas_campo;
revoke all on public.perfis, public.operacao_eta, public.coletas from anon;
grant select, insert, update on public.perfis, public.operacao_eta, public.coletas to authenticated;
