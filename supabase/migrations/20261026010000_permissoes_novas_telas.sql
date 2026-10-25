-- Permissões no formato das telas atuais do sistema (mesmo menu do computador e do celular).
--   blocos do app: eta, ete, poco, coleta, descarga -> só { on } (corrigir, exportar e unidades não eram usados)
--   web:   exp (exportar planilhas), imp (importar), capacidades (capacidades dos poços), admin, cadastrar, excluir
--          (sai "painelVer" e "painelExp", que repetiam o exportar e não eram usados)
--   telas: inicio, etas, etaForm, pocos, etes, agua, esgoto, calibracoes, quimicos, volumes, descargas
--          (agora valem para todos os cargos; antes só para operadores)
-- Ninguém perde nem ganha acesso: quem não é operador fica com todas as telas e com "capacidades";
-- operadores mantêm o que tinham (painel -> Página Inicial; operação -> ETAs e Preencher Dados).

update public.ourinhos_usuarios set permissoes =
  (permissoes - 'telas' - 'eta' - 'ete' - 'poco' - 'coleta' - 'descarga' - 'web') || jsonb_build_object(
    'eta', jsonb_build_object('on', coalesce((permissoes -> 'eta' ->> 'on')::boolean, false)),
    'ete', jsonb_build_object('on', coalesce((permissoes -> 'ete' ->> 'on')::boolean, false)),
    'poco', jsonb_build_object('on', coalesce((permissoes -> 'poco' ->> 'on')::boolean, false)),
    'coleta', jsonb_build_object('on', coalesce((permissoes -> 'coleta' ->> 'on')::boolean, false)),
    'descarga', jsonb_build_object('on', coalesce((permissoes -> 'descarga' ->> 'on')::boolean, false)),
    'web', jsonb_build_object(
      'exp', coalesce((permissoes -> 'web' ->> 'exp')::boolean, false),
      'imp', coalesce((permissoes -> 'web' ->> 'imp')::boolean, false),
      'capacidades', papel not in ('operador_eta', 'operador_volante'),
      'admin', coalesce((permissoes -> 'web' ->> 'admin')::boolean, false),
      'cadastrar', coalesce((permissoes -> 'web' ->> 'cadastrar')::boolean, false),
      'excluir', coalesce((permissoes -> 'web' ->> 'excluir')::boolean, false)),
    'telas', case when papel in ('operador_eta', 'operador_volante') then jsonb_build_object(
        'inicio', coalesce((permissoes -> 'telas' ->> 'painel')::boolean, false),
        'etas', coalesce((permissoes -> 'telas' ->> 'operacao')::boolean, false),
        'etaForm', coalesce((permissoes -> 'telas' ->> 'operacao')::boolean, false),
        'pocos', false, 'etes', false, 'agua', false, 'esgoto', false, 'calibracoes', false, 'quimicos', false, 'volumes', false, 'descargas', false)
      else jsonb_build_object('inicio', true, 'etas', true, 'etaForm', true, 'pocos', true, 'etes', true, 'agua', true, 'esgoto', true,
        'calibracoes', true, 'quimicos', true, 'volumes', true, 'descargas', true) end);

-- Capacidades dos poços: passa a seguir a permissão "capacidades" (antes: qualquer cargo acima de operador).
drop policy "Alterar" on public.capacidades_pocos;
drop policy "Definir" on public.capacidades_pocos;
create policy "Alterar" on public.capacidades_pocos for update to authenticated using (privado.pode_web('capacidades')) with check (privado.pode_web('capacidades'));
create policy "Definir" on public.capacidades_pocos for insert to authenticated with check (privado.pode_web('capacidades'));
