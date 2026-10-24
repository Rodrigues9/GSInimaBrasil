-- Macromedidores: a tabela passa a se chamar ourinhos_macros e guarda só os dados dos medidores.
-- Cloro e flúor dos poços vão para ourinhos_analises_pocos (com o tempo de dosagem); a foto anexada sai.
alter table public.leituras_macromedidor rename to ourinhos_macros;
alter index public.leituras_macromedidor_ponto_id_criado_em_idx rename to ourinhos_macros_ponto_id_criado_em_idx;
alter index public.leituras_macromedidor_criado_em_idx rename to ourinhos_macros_criado_em_idx;

alter table public.ourinhos_macros
  drop column cloro_mg_l,
  drop column fluor_mg_l,
  drop column foto_anexada,
  -- Pontos sem medidor de vazão instantânea (só totalizador) ficam com a vazão em branco.
  alter column vazao_m3h drop not null,
  add column turno text check (turno in ('Diurno', 'Noturno')),
  add column origem text not null default 'app' check (origem in ('app', 'planilha')),
  add column linha_planilha integer;

create trigger definir_turno before insert on public.ourinhos_macros
  for each row execute function privado.definir_turno();

-- Análises dos poços: cloro e flúor (mg/L) e tempo de dosagem (segundos) de cada produto.
create table public.ourinhos_analises_pocos (
  id uuid primary key default gen_random_uuid(),
  criado_em timestamptz not null default now(),
  turno text check (turno in ('Diurno', 'Noturno')),
  ponto_id text not null check (char_length(ponto_id) <= 20),     -- mesmo código do macro (ex.: m3 = Poço Diamantes)
  ponto_nome text not null check (char_length(ponto_nome) <= 120),
  grupo text not null default 'poco' check (grupo in ('poco', 'eta')), -- bloco do app (o Poço Esmeralda fica no bloco das ETAs)
  cloro_mg_l numeric check (cloro_mg_l >= 0),
  fluor_mg_l numeric check (fluor_mg_l >= 0),
  dosagem_cloro_s numeric check (dosagem_cloro_s >= 0),
  dosagem_fluor_s numeric check (dosagem_fluor_s >= 0),
  operador text not null default 'Operador' check (char_length(operador) <= 80),
  observacao text check (char_length(observacao) <= 1000),
  usuario_id uuid references auth.users (id) on delete set null,
  origem text not null default 'app' check (origem in ('app', 'planilha')),
  linha_planilha integer,
  check (coalesce(cloro_mg_l, fluor_mg_l, dosagem_cloro_s, dosagem_fluor_s) is not null)
);
create index on public.ourinhos_analises_pocos (ponto_id, criado_em desc);
create index on public.ourinhos_analises_pocos (criado_em desc);

create trigger preencher_autor before insert on public.ourinhos_analises_pocos
  for each row execute function public.preencher_autor();
create trigger definir_turno before insert on public.ourinhos_analises_pocos
  for each row execute function privado.definir_turno();

alter table public.ourinhos_analises_pocos enable row level security;
revoke all on public.ourinhos_analises_pocos from anon;
create policy "Ver" on public.ourinhos_analises_pocos for select to authenticated
  using (privado.acesso_web() or privado.pode_lancar(case when grupo = 'eta' then 'eta' else 'poco' end));
create policy "Lançar" on public.ourinhos_analises_pocos for insert to authenticated
  with check (privado.pode_lancar(case when grupo = 'eta' then 'eta' else 'poco' end));
