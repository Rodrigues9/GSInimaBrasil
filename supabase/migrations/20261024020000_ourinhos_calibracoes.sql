-- Calibrações de equipamentos: a tabela passa a se chamar ourinhos_calibracoes e ganha a coluna turno.
-- Regras de acesso, gatilho de autor e índices acompanham a tabela no rename.
alter table public.calibracoes_eta rename to ourinhos_calibracoes;

alter table public.ourinhos_calibracoes
  add column turno text check (turno in ('Diurno', 'Noturno'));

-- Turno pelo horário de Brasília: das 7h às 19h é Diurno; das 19h às 7h, Noturno.
-- Só preenche quando não vem informado (a importação das planilhas traz o turno pronto).
create or replace function privado.definir_turno()
returns trigger language plpgsql set search_path = '' as $$
declare h int;
begin
  if new.turno is null then
    h := extract(hour from (coalesce(new.criado_em, now()) at time zone 'America/Sao_Paulo'));
    new.turno := case when h >= 7 and h < 19 then 'Diurno' else 'Noturno' end;
  end if;
  return new;
end $$;
revoke execute on function privado.definir_turno() from public, anon, authenticated;

create trigger definir_turno before insert on public.ourinhos_calibracoes
  for each row execute function privado.definir_turno();

-- Lançamentos que já existiam
update public.ourinhos_calibracoes set turno = case
  when extract(hour from (criado_em at time zone 'America/Sao_Paulo')) between 7 and 18 then 'Diurno' else 'Noturno' end
where turno is null;
