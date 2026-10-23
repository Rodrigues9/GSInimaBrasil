-- Flúor diluído: em alguns poços o ácido fluossilícico é diluído 50% com água. O operador continua lançando
-- o volume total do reservatório; para consumo, gráficos e exportação vale a metade (volume real de produto).
alter table public.capacidades_pocos
  alter column hipoclorito_l drop not null,
  alter column acido_fluossilicico_l drop not null,
  add column fluor_diluido boolean not null default false;

-- Estoque dos poços com o volume real de ácido fluossilícico (metade quando o flúor do poço é diluído).
-- security_invoker: quem consulta só vê o que as regras de acesso de estoque_poco já permitem.
create view public.estoque_poco_real with (security_invoker = true) as
select e.id, e.criado_em, e.ponto_id, e.ponto_nome, e.hipoclorito_l, e.acido_fluossilicico_l,
       coalesce(c.fluor_diluido, false) as fluor_diluido,
       case when coalesce(c.fluor_diluido, false) then round(e.acido_fluossilicico_l / 2, 2) else e.acido_fluossilicico_l end as acido_fluossilicico_real_l,
       e.operador, e.usuario_id
from public.estoque_poco e
left join public.capacidades_pocos c on c.ponto_id = e.ponto_id;

revoke all on public.estoque_poco_real from anon;
grant select on public.estoque_poco_real to authenticated;
