-- Redefinir senha: o administrador apaga a conta de Auth da pessoa (função "primeiro-acesso",
-- ação "redefinir") e o perfil volta a "Aguardando 1º acesso", sem perder login, cargo e permissões.
-- Para isso, apagar a conta não pode mais apagar o perfil: o vínculo passa a ficar vazio.

alter table public.perfis drop constraint perfis_id_fkey;
alter table public.perfis add constraint perfis_usuario_id_fkey
  foreign key (usuario_id) references auth.users (id) on delete set null;
