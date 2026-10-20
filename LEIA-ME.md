# Ourinhos Saneamento — app do operador e sistema web

| Pasta / arquivo | Conteúdo |
|---|---|
| `index.html` | Página inicial com links para as duas partes |
| `app/` | App do operador (celular) |
| `sistema-web/` | Sistema web (painel, químicos, coletas, descargas, dados, usuários) — inclui uma cópia do app em "Lançamentos" |
| `js/db.js` | Liga os formulários do app ao Supabase (grava e carrega os dados) |
| `scripts/build.js` | Gera o site em `dist/`, com as chaves do Supabase lidas do `.env` |
| `scripts/serve.js` | Servidor local para testar `dist/` |
| `supabase/migrations/` | Estrutura do banco (tabelas e regras de acesso), já aplicada no projeto "gsinima-app" |
| `prototipo-fonte/` | Telas-fonte do protótipo original — só referência, não vão para o site |

## Banco de dados (Supabase)
Os 8 formulários do app gravam no Supabase, e o app mostra o que já foi lançado (hoje, pendências e totais do mês), vindo do banco:

| Formulário | Tabela |
|---|---|
| Leitura de macromedidor (poços, reservatórios, ETAs) | `leituras_macromedidor` |
| Estoque de insumos do poço | `estoque_poco` |
| Calibrações da ETA | `calibracoes_eta` |
| Estoque de produtos químicos da ETA | `estoque_eta` |
| Descarregamento de produtos químicos | `descarregamentos_quimicos` |
| Visita à ETE (checklist e análises) | `visitas_ete` |
| Coleta de campo e análises | `coletas` |
| Descargas de rede | `descargas_rede` |

## Login e permissões
- Cada pessoa entra com **login e senha** (Supabase Auth). O login vira o e-mail interno `<login>@usuarios.gsinima.local`; nenhum e-mail é enviado.
- A tabela `perfis` guarda nome, login, perfil (operador, laboratório, supervisor, administrador), se a conta está ativa e as permissões no mesmo formato da tela **Usuários e permissões**: blocos do app liberados e ações no sistema web, incluindo **Acesso ao sistema web** (sem ele, a pessoa usa só o app).
- O banco aplica as regras: sem login não se lê nada; cada formulário só aceita lançamento de quem tem o bloco liberado; o nome de quem lançou é preenchido pelo próprio banco. Ninguém apaga registros.
- Na tela **Usuários e permissões**, o administrador altera perfil, blocos, ações e ativa/desativa contas.
- **Perfil**: no sistema web, o menu da conta (canto superior direito) tem Perfil (foto e troca de senha), Configurações (vazia por enquanto) e Sair (com confirmação). No app, a aba Perfil tem a troca de foto. Sem foto, aparecem as iniciais do login (ex.: felipe.altafini → FA). As fotos ficam na pasta privada `avatares` do Supabase Storage; cada pessoa só troca a própria.
- **Cadastrar usuário**: o administrador informa nome, login e cargo, sem senha. A conta fica "Aguardando 1º acesso" (perfil com `usuario_id` vazio).
- **Primeiro acesso**: a pessoa entra no app ou no sistema web com o login e a senha que quiser (mínimo 8 caracteres), confirma a senha e a conta é criada na hora pela Edge Function `primeiro-acesso` (`supabase/functions/primeiro-acesso`), já com as permissões definidas pelo administrador. Avise a pessoa logo depois do cadastro: até o primeiro acesso, quem souber o login pode criar a senha.
- **Redefinir senha** (ex.: a pessoa esqueceu): na tela "Usuários e permissões", o administrador escolhe a pessoa e clica em "Redefinir senha". A conta de Auth dela é apagada (função `primeiro-acesso`, ação `redefinir`, que confere se quem chamou é administrador) e o perfil volta a "Aguardando 1º acesso", com o mesmo login, cargo e permissões; no próximo acesso ela cria uma senha nova. Os lançamentos antigos continuam (o `usuario_id` deles fica vazio). O administrador não pode redefinir a própria senha por aqui.

## Rodar no computador
Precisa do Node.js e do arquivo `.env` (não vai para o GitHub) com:

```
NEXT_PUBLIC_SUPABASE_URL=...
NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=...
```

Depois:

```
npm install
npm run dev
```

e abra http://localhost:3000.

## Publicar na Vercel
O `vercel.json` já define o build (`npm run build`) e a pasta publicada (`dist`). Antes do primeiro deploy, em **Settings → Environment Variables** do projeto na Vercel, cadastre as mesmas duas variáveis do `.env` (`NEXT_PUBLIC_SUPABASE_URL` e `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`). Sem elas, o build para com um aviso.

Depois disso, cada envio (push) para a branch `main` atualiza o site sozinho.

Endereços do site:
- `/` — página inicial
- `/app/` — app do operador
- `/sistema-web/` — sistema web (as telas internas usam `#`, ex.: `/sistema-web/#WebQuimicos`)

## Backup semanal do banco
O plano gratuito do Supabase não faz backup. O GitHub faz um por semana (`.github/workflows/backup-semanal.yml`): toda **segunda-feira às 3h** (Brasília) ele gera uma cópia completa do banco (papéis, estrutura e dados, incluindo perfis e logins), **criptografa com a senha de backup** e guarda por **90 dias** (cerca de 13 cópias). O repositório é público, por isso a cópia nunca fica legível sem a senha.

Não entra no backup: as fotos de perfil (Storage) e as Edge Functions (o código delas já está em `supabase/functions/`).

### Configurar (uma vez)
1. Supabase → projeto **gsinima-app** → botão **Connect** → aba **Session pooler** → copie o endereço (começa com `postgresql://postgres.taotqeecsyuxozmnpoig:`). Troque `[YOUR-PASSWORD]` pela senha do banco. Se não lembrar, crie outra em **Database → Settings → Reset database password** (o app e o site não usam essa senha).
2. GitHub → repositório → **Settings → Secrets and variables → Actions → New repository secret**:
   - `SUPABASE_DB_URL`: o endereço do passo 1;
   - `BACKUP_SENHA`: uma senha forte, com pelo menos 12 caracteres. **Guarde-a num lugar seguro**: sem ela, o backup não abre.
3. GitHub → **Actions → Backup semanal do banco → Run workflow** para rodar a primeira vez e conferir.

Atenção: em repositório público, o GitHub desliga agendamentos depois de 60 dias sem nenhuma alteração no repositório (ele avisa por e-mail; basta reativar em Actions).

### Baixar e abrir um backup
GitHub → **Actions → Backup semanal do banco** → escolha uma execução → **Artifacts** → baixe o arquivo. Descompacte o `.zip` e, num terminal com `gpg` (vem com o Git para Windows):

```
gpg --decrypt backup-gsinima-AAAA-MM-DD.tar.gz.gpg > backup.tar.gz
tar -xzf backup.tar.gz
```

Isso gera a pasta `backup/` com `roles.sql`, `schema.sql` e `data.sql`.

### Restaurar (num projeto novo do Supabase)
Com o `psql` instalado (PostgreSQL 17) e o endereço "Session pooler" do projeto novo:

```
psql --single-transaction --variable ON_ERROR_STOP=1 --file backup/roles.sql --file backup/schema.sql --command "SET session_replication_role = replica" --file backup/data.sql --dbname "ENDERECO_DO_PROJETO_NOVO"
```

Depois, publique de novo a Edge Function `primeiro-acesso`, crie a pasta `avatares` no Storage e troque as chaves `NEXT_PUBLIC_SUPABASE_*` no `.env` e na Vercel. O guia oficial está em https://supabase.com/docs/guides/platform/migrating-within-supabase/backup-restore

## Pontos de atenção
- **Telas do sistema web** (painel, químicos, coletas, descargas, dados) ainda mostram dados de exemplo; só o app do operador e a tela de usuários usam o banco.
- **Leitura automática por foto**: ficou para uma etapa futura. O botão "Tirar foto do macromedidor" só marca que a foto foi tirada; a imagem não é enviada.
