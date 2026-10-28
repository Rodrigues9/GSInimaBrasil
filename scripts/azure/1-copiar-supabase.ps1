# Migração para o Azure, passo 1: baixa uma cópia do banco do Supabase (estrutura e dados) para o seu computador.
# A senha do banco do Supabase é digitada por você quando o pg_dump pedir (ela não fica salva em lugar nenhum).
# A cópia fica em %USERPROFILE%\.ourinhos-azure\supabase.dump (fora do projeto).
$ErrorActionPreference = 'Stop'
$pgDump = 'C:\Program Files\PostgreSQL\17\bin\pg_dump.exe'
$pasta = Join-Path $env:USERPROFILE '.ourinhos-azure'
New-Item -ItemType Directory -Force $pasta | Out-Null
$saida = Join-Path $pasta 'supabase.dump'

Write-Host ''
Write-Host 'Copiando o banco do Supabase. Quando aparecer "Password:", digite a senha do banco do Supabase e tecle Enter.' -ForegroundColor Cyan
Write-Host '(Os caracteres não aparecem enquanto você digita; isso é normal.)' -ForegroundColor DarkGray
Write-Host ''
& $pgDump --host aws-0-us-east-1.pooler.supabase.com --port 5432 --username postgres.taotqeecsyuxozmnpoig --dbname postgres `
  --schema public --schema privado --format custom --no-owner --no-subscriptions --no-publications --file $saida --password
if ($LASTEXITCODE -ne 0) { Write-Host 'A cópia falhou. Confira a senha e tente de novo.' -ForegroundColor Red; exit 1 }
Write-Host ''
Write-Host ('Pronto! Cópia salva em ' + $saida + ' (' + [math]::Round((Get-Item $saida).Length / 1KB) + ' KB).') -ForegroundColor Green
Write-Host 'Pode avisar o Claude.' -ForegroundColor Green
