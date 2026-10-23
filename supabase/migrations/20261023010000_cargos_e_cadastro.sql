-- Cargos em 4 grupos (Operador, Analista, Gestor, Administrador). O "papel" guarda o cargo de fato:
--   Operador: operador_eta, operador_volante | Analista: analista | Gestor: supervisor, coordenador, gerente, diretor | admin
-- e as novas permissões "Cadastrar usuário" (web.cadastrar) e "Excluir usuário" (web.excluir).
alter table public.perfis drop constraint perfis_papel_check;
alter table public.perfis add constraint perfis_papel_check
  check (papel in ('operador_eta', 'operador_volante', 'analista', 'supervisor', 'coordenador', 'gerente', 'diretor', 'admin'));

-- Quem já gerencia usuários continua podendo cadastrar e excluir.
update public.perfis
set permissoes = jsonb_set(permissoes, '{web}', coalesce(permissoes -> 'web', '{}'::jsonb) || '{"cadastrar": true, "excluir": true}'::jsonb)
where coalesce((permissoes -> 'web' ->> 'admin')::boolean, false);

-- Permissão do sistema (web.<acao>) de quem está logado.
create or replace function privado.pode_web(acao text)
returns boolean language sql stable security definer set search_path = '' as $$
  select coalesce((
    select p.ativo and coalesce((p.permissoes -> 'web' ->> acao)::boolean, false)
    from public.perfis p where p.usuario_id = auth.uid()
  ), false);
$$;
revoke execute on function privado.pode_web(text) from public, anon;
grant execute on function privado.pode_web(text) to authenticated;

-- Ver a lista de usuários: a própria conta, ou quem gerencia, cadastra ou exclui usuários.
drop policy "Ver o próprio perfil ou, se admin, todos" on public.perfis;
create policy "Ver o próprio perfil ou, com permissão, todos" on public.perfis for select to authenticated
  using (usuario_id = auth.uid() or privado.e_admin() or privado.pode_web('cadastrar') or privado.pode_web('excluir'));

-- Cadastrar: quem gerencia usuários, ou quem tem "Cadastrar usuário" (este só cadastra contas comuns,
-- sem cargo de administrador e sem permissões de gerenciar, cadastrar ou excluir usuários).
drop policy "Admin cadastra perfis" on public.perfis;
create policy "Cadastrar perfis" on public.perfis for insert to authenticated
  with check (
    usuario_id is null and (
      privado.e_admin() or (
        privado.pode_web('cadastrar') and papel <> 'admin'
        and not coalesce((permissoes -> 'web' ->> 'admin')::boolean, false)
        and not coalesce((permissoes -> 'web' ->> 'cadastrar')::boolean, false)
        and not coalesce((permissoes -> 'web' ->> 'excluir')::boolean, false)
      )
    )
  );

-- Telas no computador: agora só aparece o que estiver marcado. Operadores que ainda não tinham
-- essa escolha gravada continuam com Início e Operação ETA.
update public.perfis
set permissoes = permissoes || '{"telas": {"painel": true, "operacao": true}}'::jsonb
where papel in ('operador_eta', 'operador_volante') and not (permissoes ? 'telas');
