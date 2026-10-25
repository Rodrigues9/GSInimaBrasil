# GS Inima Tech — app do operador e sistema web num só site

| Pasta / arquivo | Conteúdo |
|---|---|
| `index.html` | Site único: entrada (login), app do operador e telas do sistema (painel, químicos, coletas, descargas, Operação ETAs, Operação ETEs, dados, usuários). O layout muda pelo tamanho da tela |
| `js/db.js` | Liga os formulários do app ao Supabase (grava e carrega os dados) |
| `scripts/build.js` | Gera o site em `dist/`, com as chaves do Supabase lidas do `.env`; copia o supabase-js e o xlsx (SheetJS, instalado do CDN oficial) para `dist/vendor/` |
| `scripts/serve.js` | Servidor local para testar `dist/` |
| `supabase/migrations/` | Estrutura do banco (tabelas e regras de acesso), já aplicada no projeto "gsinima-app" |
| `prototipo-fonte/` | Telas-fonte do protótipo original — só referência, não vão para o site |

## Banco de dados (Supabase)
Os formulários do app gravam no Supabase, e o app mostra o que já foi lançado (hoje, pendências e totais do mês), vindo do banco:

| Formulário | Tabela |
|---|---|
| Leitura de macromedidor (poços, reservatórios, ETAs) | `ourinhos_macros` — vazão, totalizador e volume; nos medidores que mostram m³ ÷ 10 (Poço Diamantes, Poço Nova Alcântara e os 2 reservatórios da Nova Alcântara) o operador digita o visor e o banco guarda x10 |
| Análises dos Poços (item próprio no bloco Poços) | `ourinhos_analises_pocos` — cloro e flúor (mg/L) e, só quando a bomba dosadora foi ajustada, o tempo entre pulsos antes e depois (`pulso_cloro_anterior_s`/`pulso_cloro_novo_s`, idem flúor, em segundos) |
| Medições de Níveis (bloco Poços, mensal, sem pendência) | `ourinhos_medicoes_pocos` — nível estático e dinâmico (m) de cada poço; um registro por poço medido. Histórico de 2025 e 2026 importado da aba "Medição Poços" (0 = não medido, fica vazio) |
| Volumes (computador) | tela `WebVolumes`: produzidos (captações das ETAs e poços) e distribuídos (áreas, mesma composição das abas "Volumes Produzidos/Distribuídos" da planilha), calculados de `ourinhos_macros.volume_m3` |
| Estoque de insumos do poço | `ourinhos_estoque_quimicos` com `local = poco` — hipoclorito e ácido fluossilícico (L) por poço |
| Calibrações da ETA | `ourinhos_calibracoes` |
| Estoque de produtos químicos da ETA | `ourinhos_estoque_quimicos` com `local = eta` — níveis por reservatório em `niveis_l` (PAC ETA 1 R1–R3, PAC ETA 2 R1–R2, flúor ETA 1 R1–R4, flúor ETA 2, sacos de sal); zero = tanque vazio |
| Análises Quinzenais (bloco ETAs, sem pendência) | `ourinhos_analises_agua` — água bruta (turbidez, cor, pH, ferro, manganês, alcalinidade, dureza) e tratada (os mesmos + cloro livre e total, fluoreto e alumínio), uma coluna por parâmetro |
| Descarregamento de produtos químicos (ETAs e poços) | `ourinhos_descarregamentos` — `local` eta ou poco; ETAs em kg (`ponto_id` ETA 1/ETA 2), poços em litros (código do poço, `lote_id` junta os destinos da mesma carga) |
| ETEs: Checklist e Análises Diárias (app) | `ourinhos_operacao_etes` — Checklist: vazão (m³/h), itens e observações, de cada ETE todo dia. Análises Diárias: linha só com `analises` (pH, temperatura, OD, sólidos, DQO bruto/tratado/padrão) de uma ETE por dia, que já vem sugerida pelo dia da semana (seg. Ville de France, ter. Choso Misato, qua. Moradas, qui. Moradas Clube, sex. Pacaembu, sáb. Trianon; domingo não tem). Tela `WebOperacaoEtes` no computador |
| ETEs: Análises Mensais (app, sem pendência) | `ourinhos_analises_esgoto` — fósforo, nitrato, nitrito, N amoniacal, N total, sulfato e sulfeto (mg/L) do esgoto bruto (-b) e tratado (-t) em `analises`; acima do limite de quantificação fica ">LQ". Importadas da aba "Análises ETEs" |
| Coletas de Campo: Distribuição | `ourinhos_coletas_campo` — coletas na rede; sistemas ETA, São João, Moradas, Bela Vista, Pacaembu e Nova Alcântara (`sistema`: eta, sj, mor, bv, pac, na) |
| Coletas de Campo: Tratamento | `ourinhos_coletas_tratamento` — ETA 1 e ETA 2 (quartas e domingos) e poços (domingos): cloro e flúor obrigatórios; turbidez, cor, pH e coliformes podem ser completados depois (status pendente → concluída). Sem lançamento depois do dia programado, fica "Atrasado" |
| Descargas de rede | `descargas_rede` |
| Operação ETAs (computador) | `ourinhos_operacao_etas` — ETA Pardo I ou II, horário, até 3 operadores (primeiro nome das contas "Operador de ETA", função `operadores_eta()`), medições por etapa em `dados` (captacao, bruta, pac, coagulada, decantada, filtrada, tratada) e observações |
| Capacidades dos poços (computador, Produtos químicos) | `capacidades_pocos` — capacidade de hipoclorito e ácido por poço e se o flúor é diluído 50%; a visão `ourinhos_estoque_quimicos_real` dá o volume real de ácido (metade nos poços diluídos) para consumo e exportação |

## Site único: celular x computador
- Um só endereço. Tela menor que **1024 px** = celular; 1024 px ou mais (tablet deitado, computador) = computador.
- "Operador" abaixo = Operador Volante ou Operador de ETA.
- **Operador no celular**: o app de sempre, em tela cheia, sem barra inferior; o cartão **Painel** (ainda vazio) fica logo abaixo de "O que temos para hoje?".
- **Operador no computador**: por enquanto só **Início** (o painel, com outro nome no menu) e **Operação ETAs**, conforme marcado em **Usuários e permissões → No computador**. As demais telas voltam para o operador depois.
- **Outros cargos no computador**: todas as telas, como antes.
- **Menu lateral (computador)**: Página Inicial; Operações (ETAs, Poços, ETEs); Qualidade (Água = Coleta de campo, Esgoto, Calibrações); Químicos; Volumes (Visão geral, Descargas de rede). No rodapé: Importar e exportar, Usuários e permissões e Versão Aplicativo. Os grupos abrem e fecham na setinha; o grupo some se a pessoa não pode abrir nenhuma tela dele. Poços e Esgoto ainda são páginas "Em breve".
- **Período dos gráficos** (Volumes, Operação ETEs e Calibrações): um único botão no canto superior direito, com **Mês** (meses do ano escolhido; o atual destacado), **Ano** (de 2024 até o ano atual, que entra sozinho a cada virada) e **datas de início e fim**. Mês e Ano aplicam na hora. O último período escolhido fica guardado **na conta de cada pessoa** (`ourinhos_usuarios.preferencias`, gravado pela função `salvar_preferencia`) e volta igual em qualquer aparelho, até a pessoa mudar. Sem escolha, começa no mês atual.
- **Volumes → Visão geral**: o gráfico agrupa sozinho (ano: por mês; mês: por dia; datas: por dia até 59 dias, por mês a partir de 60); a tabela de baixo mostra sempre todos os meses do ano do período escolhido (ex.: março de 2025 → os 12 meses de 2025).
- **Exportar** (ao lado do período, em Volumes, Operação ETEs e Calibrações): baixa na hora uma planilha .xlsx com os lançamentos da tela no período escolhido (Volumes: leituras dos macromedidores; ETEs: operação e análises mensais; Calibrações: as calibrações).
- **Celular**: as telas do sistema são as mesmas do computador. O **Painel de Gestão** tem o mesmo menu (Página Inicial; Operações; Qualidade; Químicos; Volumes; e, em Administração, Importar e exportar e Usuários e permissões). Os cards do topo das telas ficam 2 por linha.
- **Página Inicial** (`WebDashboard`): resumo dos últimos lançamentos de ETAs, Poços, ETEs, Químicos e Volumes, com "Destaques" no topo e uma "Leitura do Painel" em cada bloco (alertas, avisos e sugestões gerados por regras: faixas de cloro/flúor/pH, análises atrasadas, calibração do dia, chuva, eficiência de DQO abaixo de 60%, autonomia de químicos, horas de operação acima de 20 h/dia, projeção da outorga do mês e produção do último dia completo comparada aos 7 dias anteriores).
- **Químicos** (`WebQuimicos`): cards PAC, Hipoclorito de Sódio, Ácido Fluossilícico e Sal em kg (filtro Todos/ETAs/Poços), gráfico de consumo e estoque do insumo escolhido e autonomia por ponto. Densidades: PAC 1,25; hipoclorito 1,20; ácido 1,20 kg/L; sal 25 kg/saco. Consumo = quedas do estoque entre leituras nos últimos 30 dias, ignorando abastecimentos e valores lançados errados (mediana de 3 leituras nos reservatórios das ETAs e quedas acima de 4x a mediana). Sal: estoque de 31.300 kg contado em 01/09/2026 após o turno diurno (lançamento das 18:08), menos os sacos usados depois × 25 kg, mais os descarregamentos de sal (constante QUIM.salBase no index.html; numa nova contagem, troque a data e o valor).
- **ETAs (painel)** (`WebEtas`): vazão, turbidez, PAC, água tratada, captação e lavagens a partir do formulário (`ourinhos_operacao_etas`), com a **chuva diária de Ourinhos** buscada na hora do serviço gratuito **Open-Meteo** (sem cadastro; estimativa por satélite/modelo para as coordenadas da cidade). O formulário continua em `WebOperacaoEta`, pelo botão **Preencher dados** no canto superior direito.
- **Poços (painel)** (`WebPocos`): cloro e flúor (médias e gráfico com faixas 0,2–2,0 e 0,6–0,8), desenho do poço com a última medição de nível, histórico de níveis por mês (mês sem medição = média entre a anterior e a seguinte, marcado como média), volume produzido e **outorga** proporcional ao período (m³/mês: Diamantes 60.000, Esmeralda 92.400, Moradas 60.000, Nova Alcântara 24.000, Pacaembu 31.200, São João 131.400, Ville de France 84.000). **Média de Operação Horária**: volume do dia ÷ vazão instantânea de referência (média das vazões lidas sem zeros e dentro de ±25% da mediana; Diamantes fixo em 100 m³/h), limitado a 24 h por dia, mostrada em horas inteiras com a legenda "Valor aproximado"; alerta acima de 20 h/dia. Cloro e flúor ficam no mesmo gráfico, só com as análises reais (dia sem análise fica em branco), com o máximo e o mínimo do período marcados no gráfico. Histórico de níveis: uma coluna por mês do Nível Estático ao Dinâmico (a altura é o rebaixamento); mês sem medição usa a média entre a anterior e a seguinte, com a coluna vazada e tracejada.
- **ETEs (painel)**: cards Vazão Média (em Todas, a soma das médias de cada ETE), DQO Bruto Médio, DQO Tratado Médio e Eficiência Média de Remoção de DQO. No gráfico de DQO, a área entre o bruto e o tratado é a DQO removida e a eficiência aparece no balão. A tabela mostra só as análises.
- **Gráficos de linha**: sem marcadores (o ponto aparece ao passar o mouse); nomes de parâmetros com iniciais maiúsculas.
- **Cores dos gráficos**: #005e83 (principal, maiores valores) e #3ab0c8 (secundária).
- **Versão Aplicativo** (só administrador, só no computador): item no rodapé do menu lateral que abre o app do celular dentro de uma moldura de celular no centro da tela, com o menu ao lado. O app é desenhado com 412 pontos de largura (celular Android 20:9 comum) e reduzido para caber, mostrando o mesmo tanto de tela que um celular real. É o app de verdade (mesma conta): serve para testar e também para lançamentos reais.
- **Status "Atrasado"** (vermelho, continua em Pendentes): Análises Quinzenais (mais de 15 dias), Análises Mensais (mais de um mês sem análise em alguma ETE; a ETE Pacaembu, paralisada, não conta) e Medições de Níveis (mais de um mês), Estoque dos poços (mais de 4 dias) e coletas de tratamento.
- **Outros cargos no celular**: uma tela inicial com atalhos para cada tela do sistema (que se ajustam à largura do celular) e, mais abaixo, **Fazer um lançamento** (abre o app).
- **Sessão**: continua aberta ao fechar a aba ou o navegador. Só é encerrada depois de **1 hora sem atividade** (clique, toque, tecla ou rolagem), em qualquer aparelho e cargo, voltando direto para a tela de entrada (sem aviso). O campo de login começa sempre em branco.

## Login e permissões
- Cada pessoa entra com **login e senha** (Supabase Auth). O login vira o e-mail interno `<login>@usuarios.gsinima.local`; nenhum e-mail é enviado.
- A tabela `ourinhos_usuarios` guarda nome, login, cargo em 4 grupos — Operador (Operador de ETA, Operador Volante), Analista (Analista de Laboratório), Gestor (Supervisor, Coordenador, Gerente, Diretor) e Administrador —, se a conta está ativa e as permissões no mesmo formato da tela **Usuários e permissões**: blocos do app liberados, ações no computador e, para operadores, as **telas no computador** (`permissoes.telas`: painel e operacao).
- Toda conta nova começa **sem permissões**; quem administra marca uma a uma. "Gerenciar permissões" (web.admin), "Cadastrar usuário" (web.cadastrar) e "Excluir usuário" (web.excluir) são separados; quem só cadastra não pode criar administradores.
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

## Backup semanal do banco
O plano gratuito do Supabase não faz backup. O GitHub faz um por semana (`.github/workflows/backup-semanal.yml`): toda **segunda-feira às 3h** (Brasília) ele gera uma cópia completa do banco (papéis, estrutura e dados, incluindo perfis e logins), **criptografa com a senha de backup** e guarda por **90 dias** (cerca de 13 cópias). O repositório é público, por isso a cópia nunca fica legível sem a senha.

Não entra no backup: as fotos de perfil (Storage) e as Edge Functions (o código delas já está em `supabase/functions/`).

### Configurar (uma vez)
1. Supabase → projeto **gsinima-app** → botão **Connect** → aba **Session pooler** → copie o endereço (começa com `postgresql://postgres.taotqeecsyuxozmnpoig:`). Troque `[YOUR-PASSWORD]` pela senha do banco. Se não lembrar, crie outra em **Database → Settings → Reset database password** (o app e o site não usam essa senha).
2. GitHub → repositório → **Settings → Secrets and variables → Actions → New repository secret**:
   - `SUPABASE_DB_URL`: o endereço do passo 1;
   - `BACKUP_SENHA`: uma senha forte, com pelo menos 12 caracteres. **Guarde-a num lugar seguro**: sem ela, o backup não abre.
3. GitHub → **Actions → Backup semanal do banco → Run workflow** para rodar a primeira vez e conferir.

**Agendamento desligado por enquanto** (período de teste, sem os segredos cadastrados): o backup só roda pelo botão **Run workflow**. Para religar, tire o `#` das linhas `schedule` e `cron` no arquivo do workflow.

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
- **Telas do sistema web** (painel, químicos, coletas, descargas) ainda mostram dados de exemplo. Já usam o banco: o app do operador, a Operação ETAs, Operação ETEs, Usuários e permissões e a **exportação** (Importar e exportar → Exportar: cada conjunto vira uma aba do Excel ou um arquivo CSV com `;` e vírgula decimal).
- **Importação** ainda não funciona: o botão de enviar planilha está desativado de propósito.
- **Leitura automática por foto**: ficou para uma etapa futura. O botão "Tirar foto do macromedidor" só marca que a foto foi tirada; a imagem não é enviada.
