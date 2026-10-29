-- Migração para o Azure, passo 5: regras de acesso mais rápidas, com o mesmo resultado.
-- As regras chamavam funções como privado.acesso_web() em cada linha; com "(select ...)" o banco calcula
-- uma vez por consulta (no Azure cada chamada procura a pessoa conectada pelo e-mail, o que fica caro em milhares de linhas).
-- Só mexe nas chamadas sem dependência da linha: acesso_web(), e_admin(), acima_de_operador(), pode_web('...') e auth.uid().
do $$
declare
  p record; q text; c text; troca text;
begin
  for p in select schemaname, tablename, policyname, qual, with_check from pg_policies where schemaname = 'public' loop
    q := p.qual; c := p.with_check;
    -- (?<!SELECT ) evita embrulhar duas vezes ao rodar este arquivo de novo.
    troca := '(?<!SELECT )(privado\.(acesso_web|e_admin|acima_de_operador)\(\)|privado\.pode_web\(''[a-z_]+''::text\)|auth\.uid\(\))';
    if q is not null then q := regexp_replace(q, troca, '(SELECT \1)', 'g'); end if;
    if c is not null then c := regexp_replace(c, troca, '(SELECT \1)', 'g'); end if;
    if q is distinct from p.qual or c is distinct from p.with_check then
      execute format('alter policy %I on %I.%I', p.policyname, p.schemaname, p.tablename)
        || case when q is not null then ' using (' || q || ')' else '' end
        || case when c is not null then ' with check (' || c || ')' else '' end;
      raise notice 'regra ajustada: %.%', p.tablename, p.policyname;
    end if;
  end loop;
end $$;
