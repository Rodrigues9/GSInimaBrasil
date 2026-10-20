-- Foto de perfil: arquivo no Storage (pasta privada "avatares"), caminho guardado em perfis.foto.
-- Cada pessoa só troca a própria foto; qualquer pessoa logada pode ver as fotos.

alter table public.perfis add column foto text check (foto is null or char_length(foto) <= 200);

-- A pessoa define (ou tira) a própria foto sem ter permissão de editar o perfil.
create or replace function public.definir_minha_foto(caminho text)
returns void language plpgsql volatile security definer set search_path = '' as $$
begin
  if caminho is not null and caminho !~ ('^' || auth.uid()::text || '/[A-Za-z0-9._-]+$') then
    raise exception 'caminho de foto inválido';
  end if;
  update public.perfis set foto = caminho where usuario_id = auth.uid();
end $$;
revoke execute on function public.definir_minha_foto(text) from public, anon;
grant execute on function public.definir_minha_foto(text) to authenticated;

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('avatares', 'avatares', false, 1048576, array['image/jpeg', 'image/png', 'image/webp']);

create policy "Fotos: ver (logado)" on storage.objects
  for select to authenticated using (bucket_id = 'avatares');
create policy "Fotos: enviar a própria" on storage.objects
  for insert to authenticated with check (bucket_id = 'avatares' and (storage.foldername(name))[1] = auth.uid()::text);
create policy "Fotos: apagar a própria" on storage.objects
  for delete to authenticated using (bucket_id = 'avatares' and (storage.foldername(name))[1] = auth.uid()::text);
