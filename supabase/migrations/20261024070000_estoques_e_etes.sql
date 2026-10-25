-- Estoques de produtos químicos das ETAs e dos poços numa tabela só, e a operação das ETEs (controle diário,
-- checklist e análises) numa tabela só. As tabelas antigas estavam vazias e saem.
drop view if exists public.estoque_poco_real;
drop table if exists public.estoque_eta, public.estoque_poco, public.visitas_ete;

-- ---------- estoques ----------
create table public.ourinhos_estoque_quimicos (
  id uuid primary key default gen_random_uuid(),
  criado_em timestamptz not null default now(),
  turno text check (turno in ('Diurno', 'Noturno')),
  local text not null check (local in ('eta', 'poco')),
  ponto_id text not null check (char_length(ponto_id) <= 20),          -- 'eta' ou o código do poço (ex.: m3)
  ponto_nome text not null check (char_length(ponto_nome) <= 120),
  -- ETAs: litros de cada reservatório ('pac1-R1' ... 'flu2-R1') e sacos de sal usados no turno ('sal_sacos_usados')
  niveis_l jsonb check (niveis_l is null or jsonb_typeof(niveis_l) = 'object'),
  -- poços: litros nos reservatórios
  hipoclorito_l numeric check (hipoclorito_l >= 0),
  acido_fluossilicico_l numeric check (acido_fluossilicico_l >= 0),
  operador text not null default 'Operador' check (char_length(operador) <= 80),
  usuario_id uuid references auth.users (id) on delete set null,
  origem text not null default 'app' check (origem in ('app', 'planilha')),
  linha_planilha integer,
  check ((local = 'eta' and niveis_l is not null) or (local = 'poco' and coalesce(hipoclorito_l, acido_fluossilicico_l) is not null))
);
create index on public.ourinhos_estoque_quimicos (local, ponto_id, criado_em desc);
create index on public.ourinhos_estoque_quimicos (criado_em desc);
create index on public.ourinhos_estoque_quimicos (usuario_id);

-- Com o volume real de ácido nos poços (metade quando o flúor do poço é diluído 50%).
create view public.ourinhos_estoque_quimicos_real with (security_invoker = true) as
select e.id, e.criado_em, e.turno, e.local, e.ponto_id, e.ponto_nome, e.niveis_l, e.hipoclorito_l, e.acido_fluossilicico_l,
       case when e.local = 'poco' then coalesce(c.fluor_diluido, false) end as fluor_diluido,
       case when e.local <> 'poco' then null
            when coalesce(c.fluor_diluido, false) then round(e.acido_fluossilicico_l / 2, 2)
            else e.acido_fluossilicico_l end as acido_fluossilicico_real_l,
       e.operador, e.usuario_id, e.origem, e.linha_planilha
from public.ourinhos_estoque_quimicos e
left join public.capacidades_pocos c on c.ponto_id = e.ponto_id;
revoke all on public.ourinhos_estoque_quimicos_real from anon;
grant select on public.ourinhos_estoque_quimicos_real to authenticated;

-- ---------- operação das ETEs ----------
create table public.ourinhos_operacao_etes (
  id uuid primary key default gen_random_uuid(),
  criado_em timestamptz not null default now(),
  turno text check (turno in ('Diurno', 'Noturno')),
  ete text not null check (char_length(ete) <= 120),
  vazao_m3h numeric check (vazao_m3h >= 0),
  checklist jsonb not null default '{}'::jsonb,
  observacoes jsonb not null default '{}'::jsonb,
  analises_realizadas boolean not null default false,
  -- 'ph-b','ph-t','temp-b','temp-t','od-b','od-t','sol-b','sol-t','dqo-p','dqo-b','dqo-t' e as completas
  -- ('fosforo','nitrato','nitrito','namon','ntotal','sulfato','sulfeto' com -b/-t); ">LQ" fica como texto
  analises jsonb,
  operador text not null default 'Operador' check (char_length(operador) <= 80),
  usuario_id uuid references auth.users (id) on delete set null,
  origem text not null default 'app' check (origem in ('app', 'planilha')),
  linha_planilha integer,
  linha_planilha_analises integer
);
create index on public.ourinhos_operacao_etes (ete, criado_em desc);
create index on public.ourinhos_operacao_etes (criado_em desc);
create index on public.ourinhos_operacao_etes (usuario_id);

-- ---------- autor, turno e acesso ----------
create trigger preencher_autor before insert on public.ourinhos_estoque_quimicos for each row execute function public.preencher_autor();
create trigger definir_turno before insert on public.ourinhos_estoque_quimicos for each row execute function privado.definir_turno();
create trigger preencher_autor before insert on public.ourinhos_operacao_etes for each row execute function public.preencher_autor();
create trigger definir_turno before insert on public.ourinhos_operacao_etes for each row execute function privado.definir_turno();

alter table public.ourinhos_estoque_quimicos enable row level security;
alter table public.ourinhos_operacao_etes enable row level security;
revoke all on public.ourinhos_estoque_quimicos, public.ourinhos_operacao_etes from anon;
create policy "Ver" on public.ourinhos_estoque_quimicos for select to authenticated using (privado.acesso_web() or privado.pode_lancar(local));
create policy "Lançar" on public.ourinhos_estoque_quimicos for insert to authenticated with check (privado.pode_lancar(local));
create policy "Ver" on public.ourinhos_operacao_etes for select to authenticated using (privado.acesso_web() or privado.pode_lancar('ete'));
create policy "Lançar" on public.ourinhos_operacao_etes for insert to authenticated with check (privado.pode_lancar('ete'));
