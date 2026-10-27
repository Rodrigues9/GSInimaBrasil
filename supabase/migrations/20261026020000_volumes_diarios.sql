-- Volumes diários oficiais (abas "Volumes Produzidos" e "Volumes Distribuídos" da planilha da operação).
-- tipo 'prod': ponto = código do macromedidor (e9, e4, e1, e5, m3, e0, m11, m21, m8, m7, m15).
-- tipo 'dist': ponto = área (centro, margarida, silvestre, parqueM, parque, paineiras, paineiras2, anchieta, saojoao, cohab,
--   moradas, belavista, pacaembu, novaalc) ou 'semarea' (nov e dez/2024: só o total do mês, repartido entre os dias).
-- O site usa estes valores nos dias que existem aqui; depois deles, calcula pelas leituras dos macromedidores.
create table public.ourinhos_volumes_diarios (
  data date not null,
  tipo text not null check (tipo in ('prod', 'dist')),
  ponto text not null check (char_length(ponto) <= 20),
  volume numeric not null,
  origem text not null default 'planilha' check (char_length(origem) <= 40),
  criado_em timestamptz not null default now(),
  primary key (data, tipo, ponto)
);
alter table public.ourinhos_volumes_diarios enable row level security;
revoke all on public.ourinhos_volumes_diarios from anon;
create policy "Ver" on public.ourinhos_volumes_diarios for select to authenticated using (privado.acesso_web());

-- Leituras de macromedidores de outubro/2026 (importadas da planilha) guardadas à parte até a nova importação de outubro.
create table public.ourinhos_macros_reserva_out26 (like public.ourinhos_macros including all);
alter table public.ourinhos_macros_reserva_out26 enable row level security;
revoke all on public.ourinhos_macros_reserva_out26 from anon, authenticated;
insert into public.ourinhos_macros_reserva_out26 select * from public.ourinhos_macros where criado_em >= '2026-10-01T03:00:00Z' and origem = 'planilha';
delete from public.ourinhos_macros where criado_em >= '2026-10-01T03:00:00Z' and origem = 'planilha';
