-- As análises mensais das ETEs (fósforo, nitrato, nitrito, N amoniacal, N total, sulfato e sulfeto) passam a ficar em
-- ourinhos_analises_esgoto (importadas da aba "Análises ETEs"). Em ourinhos_operacao_etes ficam a vazão, o checklist
-- e as análises diárias (pH, temperatura, OD, sólidos e DQO).
update public.ourinhos_operacao_etes o
set analises = nullif((
  select coalesce(jsonb_object_agg(key, value), '{}'::jsonb) from jsonb_each(o.analises)
  where split_part(key, '-', 1) not in ('fosforo', 'nitrato', 'nitrito', 'namon', 'ntotal', 'sulfato', 'sulfeto')
), '{}'::jsonb)
where analises is not null;
update public.ourinhos_operacao_etes set analises_realizadas = analises is not null;
-- Linhas que só tinham as análises mensais ficaram vazias.
delete from public.ourinhos_operacao_etes where vazao_m3h is null and analises is null and checklist = '{}'::jsonb;
alter table public.ourinhos_operacao_etes drop column linha_planilha_analises;
