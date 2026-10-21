# GS Inima Tech — app do operador e sistema web num só site

| Pasta / arquivo | Conteúdo |
|---|---|
| `index.html` | Site único: entrada (login), app do operador e telas do sistema (painel, químicos, coletas, descargas, Operação ETA, dados, usuários). O layout muda pelo tamanho da tela |
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
| Operação ETA (computador) | `operacao_eta` — ETA Pardo I ou II, horário, até 3 operadores (primeiro nome das contas "Operador de ETA", função `operadores_eta()`), medições por etapa em `dados` (captacao, bruta, pac, coagulada, decantada, filtrada, tratada) e observações |

## Site único: celular x computador
- Um só endereço. Tela menor que **1024 px** = celular; 1024 px ou mais (tablet deitado, computador) = computador.
- "Operador" abaixo = Operador Volante ou Operador de ETA.
- **Operador no celular**: o app de sempre, em tela cheia, sem barra inferior; o cartão **Painel** (ainda vazio) fica logo abaixo de "O que temos para hoje?".
- **Operador no computador**: por enquanto só **Início** (o painel, com outro nome no menu) e **Operação ETA**, conforme marcado em **Usuários e permissões → No computador**. As demais telas voltam para o operador depois.
- **Outros cargos no computador**: todas as telas, como antes.
- **Outros cargos no celular**: uma tela inicial com atalhos para cada tela do sistema (que se ajustam à largura do celular) e, mais abaixo, **Fazer um lançamento** (abre o app).
- **Sessão**: continua aberta ao fechar a aba ou o navegador. Só é encerrada depois de **1 hora sem atividade** (clique, toque, tecla ou rolagem), em qualquer aparelho e cargo. O campo de login começa sempre em branco.

## Login e permissões
- Cada pessoa entra com **login e senha** (Supabase Auth). O login vira o e-mail interno `<login>@usuarios.gsinima.local`; nenhum e-mail é enviado.
- A tabela `perfis` guarda nome, login, cargo (Operador Volante, Operador de ETA, Analista de Laboratório, Supervisor, Coordenador, Administrador), se a conta está ativa e as permissões no mesmo formato da tela **Usuários e permissões**: blocos do app liberados, ações no computador e, para operadores, as **telas no computador** (`permissoes.telas`: painel e operacao).
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
- `/` — entrada única (as telas internas usam `#`, ex.: `/#WebQuimicos`)

## Pontos de atenção
- **Telas do sistema web** (painel, químicos, coletas, descargas, dados, usuários) ainda mostram dados de exemplo; só o app do operador usa o banco.
- **Autenticação**: ficou para depois. A biblioteca `@supabase/ssr` já está instalada para quando o login for implementado.
- **Leitura automática por foto**: ficou para uma etapa futura. O botão "Tirar foto do macromedidor" só marca que a foto foi tirada; a imagem não é enviada.
