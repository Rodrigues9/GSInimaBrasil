-- Capacidade dos reservatórios de produtos químicos de cada poço (hipoclorito e ácido fluossilícico).
-- Definida na tela "Produtos químicos" por quem está acima de operador; o app usa para a % do estoque.
create table public.capacidades_pocos (
  ponto_id text primary key,                 -- mesmo código usado em estoque_poco (ex.: m3 = Poço Diamantes)
  ponto_nome text not null,
  hipoclorito_l numeric not null check (hipoclorito_l > 0),
  acido_fluossilicico_l numeric not null check (acido_fluossilicico_l > 0),
  atualizado_em timestamptz not null default now(),
  atualizado_por text
);

-- Quem não é operador (analista, gestores e administrador).
create or replace function privado.acima_de_operador()
returns boolean language sql stable security definer set search_path = '' as $$
  select coalesce((
    select p.ativo and p.papel not in ('operador_eta', 'operador_volante')
    from public.perfis p where p.usuario_id = auth.uid()
  ), false);
$$;
revoke execute on function privado.acima_de_operador() from public, anon;
grant execute on function privado.acima_de_operador() to authenticated;

alter table public.capacidades_pocos enable row level security;
revoke all on public.capacidades_pocos from anon;
create policy "Ver" on public.capacidades_pocos for select to authenticated using (privado.acesso_web());
create policy "Definir" on public.capacidades_pocos for insert to authenticated with check (privado.acima_de_operador());
create policy "Alterar" on public.capacidades_pocos for update to authenticated using (privado.acima_de_operador()) with check (privado.acima_de_operador());
