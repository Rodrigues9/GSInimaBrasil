-- Descarregamento de produtos químicos nos poços: uma entrega pode ser dividida entre vários poços.
-- Cada linha é um destino (produto, quantidade, poço); as linhas registradas juntas têm o mesmo lote_id.

create table public.descarregamentos_pocos (
  id uuid primary key default gen_random_uuid(),
  criado_em timestamptz not null default now(),
  lote_id uuid not null,
  produto text not null check (produto in ('Hipoclorito de sódio', 'Ácido fluossilícico')),
  quantidade_l numeric not null check (quantidade_l > 0 and quantidade_l <= 100000),
  ponto_id text not null check (char_length(ponto_id) <= 20),
  ponto_nome text not null check (char_length(ponto_nome) <= 120),
  operador text not null default 'Operador' check (char_length(operador) <= 80),
  usuario_id uuid references auth.users (id) on delete set null
);
create index on public.descarregamentos_pocos (criado_em desc);
create index on public.descarregamentos_pocos (lote_id);

alter table public.descarregamentos_pocos enable row level security;
revoke all on public.descarregamentos_pocos from anon;
grant select, insert on public.descarregamentos_pocos to authenticated;

create trigger preencher_autor before insert on public.descarregamentos_pocos
  for each row execute function public.preencher_autor();

create policy "Ver" on public.descarregamentos_pocos for select to authenticated
  using (privado.acesso_web() or privado.pode_lancar('poco'));
create policy "Lançar" on public.descarregamentos_pocos for insert to authenticated
  with check (privado.pode_lancar('poco'));
