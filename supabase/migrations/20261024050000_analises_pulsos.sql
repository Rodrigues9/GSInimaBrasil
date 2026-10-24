-- Análises dos poços: ajuste da bomba dosadora com o tempo entre pulsos antes e depois do ajuste (segundos).
-- O tempo único importado da planilha ("Cont. Poços") é o valor ajustado, por isso vira o "novo".
alter table public.ourinhos_analises_pocos rename column dosagem_cloro_s to pulso_cloro_novo_s;
alter table public.ourinhos_analises_pocos rename column dosagem_fluor_s to pulso_fluor_novo_s;
alter table public.ourinhos_analises_pocos
  add column pulso_cloro_anterior_s numeric check (pulso_cloro_anterior_s >= 0),
  add column pulso_fluor_anterior_s numeric check (pulso_fluor_anterior_s >= 0);

-- Análises dos poços são lançadas no bloco "Poços" do app (o Poço Esmeralda também).
update public.ourinhos_analises_pocos set grupo = 'poco' where grupo <> 'poco';
