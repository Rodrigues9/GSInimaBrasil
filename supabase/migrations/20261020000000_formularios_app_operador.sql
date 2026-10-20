-- Tabelas dos formulários do app do operador (sem autenticação por enquanto).
-- Já aplicada no projeto Supabase "gsinima-app".

create table public.leituras_macromedidor (
  id uuid primary key default gen_random_uuid(),
  criado_em timestamptz not null default now(),
  ponto_id text not null check (char_length(ponto_id) <= 20),
  ponto_nome text not null check (char_length(ponto_nome) <= 120),
  grupo text not null check (grupo in ('poco', 'eta')),
  vazao_m3h numeric not null check (vazao_m3h >= 0),
  totalizador_m3 numeric not null check (totalizador_m3 > 0),
  volume_m3 numeric,
  cloro_mg_l numeric check (cloro_mg_l >= 0),
  fluor_mg_l numeric check (fluor_mg_l >= 0),
  foto_anexada boolean not null default false,
  operador text not null default 'Operador' check (char_length(operador) <= 80)
);
create index on public.leituras_macromedidor (ponto_id, criado_em desc);
create index on public.leituras_macromedidor (criado_em desc);

create table public.estoque_poco (
  id uuid primary key default gen_random_uuid(),
  criado_em timestamptz not null default now(),
  ponto_id text not null check (char_length(ponto_id) <= 20),
  ponto_nome text not null check (char_length(ponto_nome) <= 120),
  hipoclorito_l numeric check (hipoclorito_l >= 0),
  acido_fluossilicico_l numeric check (acido_fluossilicico_l >= 0),
  operador text not null default 'Operador' check (char_length(operador) <= 80)
);
create index on public.estoque_poco (ponto_id, criado_em desc);

create table public.calibracoes_eta (
  id uuid primary key default gen_random_uuid(),
  criado_em timestamptz not null default now(),
  leituras jsonb not null check (jsonb_typeof(leituras) = 'object'),
  operador text not null default 'Operador' check (char_length(operador) <= 80)
);
create index on public.calibracoes_eta (criado_em desc);

create table public.estoque_eta (
  id uuid primary key default gen_random_uuid(),
  criado_em timestamptz not null default now(),
  niveis_l jsonb not null check (jsonb_typeof(niveis_l) = 'object'),
  operador text not null default 'Operador' check (char_length(operador) <= 80)
);
create index on public.estoque_eta (criado_em desc);

create table public.descarregamentos_quimicos (
  id uuid primary key default gen_random_uuid(),
  criado_em timestamptz not null default now(),
  produto text not null check (produto in ('PAC', 'Flúor', 'Sal')),
  eta text not null check (eta in ('ETA 1', 'ETA 2')),
  quantidade_kg numeric not null check (quantidade_kg > 0),
  operador text not null default 'Operador' check (char_length(operador) <= 80)
);
create index on public.descarregamentos_quimicos (criado_em desc);

create table public.visitas_ete (
  id uuid primary key default gen_random_uuid(),
  criado_em timestamptz not null default now(),
  ete text not null check (char_length(ete) <= 80),
  vazao_m3h numeric not null check (vazao_m3h >= 0),
  checklist jsonb not null check (jsonb_typeof(checklist) = 'object'),
  observacoes jsonb not null default '{}'::jsonb check (jsonb_typeof(observacoes) = 'object'),
  analises_realizadas boolean not null,
  analises jsonb check (analises is null or jsonb_typeof(analises) = 'object'),
  operador text not null default 'Operador' check (char_length(operador) <= 80)
);
create index on public.visitas_ete (criado_em desc);

create table public.coletas (
  id uuid primary key default gen_random_uuid(),
  coletada_em timestamptz not null default now(),
  endereco text not null check (char_length(endereco) <= 160),
  bairro text not null check (char_length(bairro) <= 120),
  sistema text not null check (sistema in ('eta', 'sj', 'mor', 'pac')),
  cloro_mg_l numeric not null check (cloro_mg_l >= 0),
  observacao text check (char_length(observacao) <= 1000),
  fluor_mg_l numeric check (fluor_mg_l >= 0),
  ph numeric check (ph between 0 and 14),
  cor_uh numeric check (cor_uh >= 0),
  turbidez_ut numeric check (turbidez_ut >= 0),
  coliformes_totais text check (coliformes_totais in ('A', 'P')),
  coliformes_termotolerantes text check (coliformes_termotolerantes in ('A', 'P')),
  status text not null default 'pendente' check (status in ('pendente', 'concluida')),
  coletor text not null default 'Operador' check (char_length(coletor) <= 80),
  analista text check (char_length(analista) <= 80),
  concluida_em timestamptz
);
create index on public.coletas (status, coletada_em desc);
create index on public.coletas (concluida_em desc);

create table public.descargas_rede (
  id uuid primary key default gen_random_uuid(),
  criado_em timestamptz not null default now(),
  endereco text not null check (char_length(endereco) <= 160),
  bairro text not null check (char_length(bairro) <= 120),
  sistema text not null check (sistema in ('eta', 'sj', 'mor', 'pac')),
  dn_mm integer not null check (dn_mm > 0),
  inicio_em timestamptz not null,
  fim_em timestamptz check (fim_em is null or fim_em > inicio_em),
  volume_m3 numeric check (volume_m3 >= 0),
  observacao text check (char_length(observacao) <= 1000),
  status text not null default 'andamento' check (status in ('andamento', 'concluida')),
  operador text not null default 'Operador' check (char_length(operador) <= 80)
);
create index on public.descargas_rede (status, inicio_em desc);

-- Acesso: sem login, qualquer pessoa lê e envia; ninguém apaga.
do $$
declare t text;
begin
  foreach t in array array['leituras_macromedidor','estoque_poco','calibracoes_eta','estoque_eta',
                           'descarregamentos_quimicos','visitas_ete','coletas','descargas_rede']
  loop
    execute format('alter table public.%I enable row level security', t);
    execute format('grant select, insert on public.%I to anon, authenticated', t);
    execute format('create policy "Leitura pública" on public.%I for select to anon, authenticated using (true)', t);
    execute format('create policy "Envio público" on public.%I for insert to anon, authenticated with check (true)', t);
  end loop;
end $$;

-- Edições só onde o app precisa: concluir análises de coleta pendente e encerrar descarga em andamento.
grant update on public.coletas, public.descargas_rede to anon, authenticated;
create policy "Concluir análises de coleta pendente" on public.coletas
  for update to anon, authenticated using (status = 'pendente') with check (true);
create policy "Encerrar descarga em andamento" on public.descargas_rede
  for update to anon, authenticated using (status = 'andamento') with check (true);
