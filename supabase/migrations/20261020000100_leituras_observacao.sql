-- Observação opcional da leitura de macromedidor.
alter table public.leituras_macromedidor
  add column observacao text check (char_length(observacao) <= 1000);
