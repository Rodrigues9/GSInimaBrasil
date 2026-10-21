-- Operação ETA: lançamento horário da operação (por enquanto só a ETA Pardo I), feito pelo computador.
-- As medições ficam em "dados" (jsonb), agrupadas por etapa: bruta, coagulada, decantada, filtrada e tratada.
create table public.operacao_eta (
  id uuid primary key default gen_random_uuid(),
  criado_em timestamptz not null default now(),
  usuario_id uuid references auth.users (id) on delete set null,
  operador text,                                   -- quem lançou (preenchido pelo banco)
  eta text not null check (eta in ('pardo1', 'pardo2')),
  horario time not null,
  operadores text[] not null default '{}',         -- operadores do turno (até 3)
  dados jsonb not null default '{}'::jsonb,
  observacao text,
  constraint operacao_eta_operadores check (cardinality(operadores) between 1 and 3)
);
create index operacao_eta_criado_em on public.operacao_eta (criado_em desc);

create trigger preencher_autor before insert on public.operacao_eta
  for each row execute function public.preencher_autor();

alter table public.operacao_eta enable row level security;
revoke all on public.operacao_eta from anon;

-- Qualquer usuário ativo vê e lança; ninguém altera nem apaga.
create policy "Ver" on public.operacao_eta for select to authenticated using (privado.acesso_web());
create policy "Lançar" on public.operacao_eta for insert to authenticated with check (privado.acesso_web());
