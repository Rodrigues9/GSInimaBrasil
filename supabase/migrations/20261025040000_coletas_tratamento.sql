-- Coletas de Campo passam a ter Tratamento (ETA 1, ETA 2 e poços) e Distribuição (a coleta de rede de antes).
-- Distribuição ganha os sistemas Bela Vista (bv) e Nova Alcântara (na). Calibrações ganham observação.

alter table public.ourinhos_coletas_campo drop constraint coletas_sistema_check;
alter table public.ourinhos_coletas_campo add constraint coletas_sistema_check check (sistema in ('eta', 'sj', 'mor', 'bv', 'pac', 'na'));

alter table public.ourinhos_calibracoes add column observacao text check (char_length(observacao) <= 1000);

-- Tratamento: cloro e flúor na coleta (obrigatórios); o restante pode ser lançado depois (coliformes saem no dia seguinte).
create table public.ourinhos_coletas_tratamento (
  id uuid primary key default gen_random_uuid(),
  criado_em timestamptz not null default now(),
  turno text check (turno in ('Diurno', 'Noturno')),
  ponto_id text not null check (char_length(ponto_id) <= 20),          -- 'eta1', 'eta2' ou o código do poço (ex.: m3)
  ponto_nome text not null check (char_length(ponto_nome) <= 120),
  cloro_mg_l numeric not null check (cloro_mg_l >= 0),
  fluor_mg_l numeric not null check (fluor_mg_l >= 0),
  turbidez_ntu numeric check (turbidez_ntu >= 0),
  cor_ptco numeric check (cor_ptco >= 0),
  ph numeric check (ph between 0 and 14),
  coliformes_totais text check (coliformes_totais in ('A', 'P')),
  coliformes_termotolerantes text check (coliformes_termotolerantes in ('A', 'P')),
  observacao text check (char_length(observacao) <= 1000),
  status text not null default 'pendente' check (status in ('pendente', 'concluida')),
  operador text not null default 'Operador' check (char_length(operador) <= 80),
  analista text check (char_length(analista) <= 80),
  concluida_em timestamptz,
  usuario_id uuid references auth.users (id) on delete set null
);
create index on public.ourinhos_coletas_tratamento (ponto_id, criado_em desc);
create index on public.ourinhos_coletas_tratamento (criado_em desc);
create index on public.ourinhos_coletas_tratamento (usuario_id);

create trigger preencher_autor before insert on public.ourinhos_coletas_tratamento for each row execute function public.preencher_autor();
create trigger definir_turno before insert on public.ourinhos_coletas_tratamento for each row execute function privado.definir_turno();
create trigger preencher_analista before update on public.ourinhos_coletas_tratamento for each row execute function public.preencher_analista();

alter table public.ourinhos_coletas_tratamento enable row level security;
revoke all on public.ourinhos_coletas_tratamento from anon;
create policy "Ver" on public.ourinhos_coletas_tratamento for select to authenticated using (privado.acesso_web() or privado.pode_lancar('coleta'));
create policy "Lançar" on public.ourinhos_coletas_tratamento for insert to authenticated with check (privado.pode_lancar('coleta'));
create policy "Completar análises pendentes" on public.ourinhos_coletas_tratamento for update to authenticated
  using (status = 'pendente' and privado.pode_lancar('coleta')) with check (privado.pode_lancar('coleta'));
