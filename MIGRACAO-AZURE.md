# Migração para o Azure

Objetivo: levar o site e o app do operador para dentro da Microsoft (Azure da empresa) **sem mudar as telas, os formulários e os painéis**.

A versão atual (Vercel + Supabase) fica guardada no GitHub: branch `site-aberto` e tag `versao-site-aberto-2026-10-28`. O projeto Supabase e o Vercel **não são apagados** até a virada final ser aprovada.

## Como ficou (montado em 28/10/2026)

Grupo de recursos `rg-ourinhos-saneamento` (assinatura de teste do Felipe, tenant GS Inima Brasil).

| Parte | Hoje (Supabase) | No Azure |
|---|---|---|
| Site | Vercel | **Azure Static Web Apps** `swa-ourinhos-saneamento` (gratuito): https://green-cliff-075ff460f.1.azurestaticapps.net |
| Login | Usuário e senha do Supabase | **Conta Microsoft**, pelo login embutido do Static Web Apps (`/.auth/login/aad`). Quem não está em "Usuários e permissões" não vê dados |
| Ponte site ↔ API | — | Função `api/` (Azure Functions do próprio Static Web Apps): só aceita quem entrou e repassa ao PostgREST com um token curto (5 min) com o e-mail da pessoa |
| API do banco | PostgREST do Supabase | **PostgREST** no Container Apps `api-ourinhos` (Brazil South): aceita só tokens assinados pela ponte |
| Banco | Supabase (PostgreSQL 17) | **Azure Database for PostgreSQL** `psql-ourinhos-saneamento`, banco `ourinhos` (Brazil South, B1ms): **só a estrutura**, sem dados, mais o administrador |
| Quem é quem | `auth.uid()` do Supabase | `auth.uid()` lê o e-mail do token e acha a pessoa em `ourinhos_usuarios` (coluna `email` ou login = parte antes do @); `registrar_acesso` liga a conta no primeiro acesso |
| Foto do usuário | Supabase Storage | No próprio cadastro (imagem JPEG embutida) |
| Primeiro acesso / senha | Função `primeiro-acesso` | Não precisa mais: a senha é a da conta Microsoft |

Proteção: só os dados ficam fechados (como hoje). A página abre, mas nada aparece sem login da empresa.

Senhas e segredos ficam só no computador do Felipe (`%USERPROFILE%\.ourinhos-azure\segredos.json`) e nas configurações do Azure, nunca no GitHub.

Publicar o site: **automático**. Cada envio para a branch `azure` no GitHub roda a rotina "Publicar site no Azure" (.github/workflows/azure-site.yml), que monta a versão Azure e publica no Static Web Apps. O token de implantação fica guardado no segredo `AZURE_STATIC_WEB_APPS_API_TOKEN` do GitHub. Publicação manual (reserva): `MODO=azure node scripts/build.js` e `npx @azure/static-web-apps-cli deploy ./dist --api-location ./api --api-language node --api-version 20 --env production`.

O registro próprio do app no Entra ID (para limitar o login só à empresa, no plano Standard) depende do TI: a conta do Felipe não pode registrar aplicativos.

## O que muda para quem usa
- A tela de entrada passa a ter o botão **Entrar com a conta Microsoft** no lugar de usuário e senha.
- O resto (menus, telas, gráficos, formulários do celular) fica igual.
- Cadastro de pessoas: o TI cria a conta Microsoft; no site, "Usuários e permissões" continua definindo cargo e telas (ligado pelo e-mail).

## Etapas
1. Instalar o Azure CLI e entrar na conta Azure (o Felipe entra; ninguém digita a senha dele).
2. Criar o grupo de recursos `rg-ourinhos-saneamento` em Brazil South.
3. Criar o banco PostgreSQL e copiar estrutura e dados do Supabase.
4. Trocar `auth.uid()` do Supabase por uma função que lê o login Microsoft (as regras de acesso continuam as mesmas).
5. Publicar o PostgREST no Container Apps, validando os tokens do Entra ID.
6. Registrar o app no Entra ID (pode precisar de permissão do TI) e trocar o login do site.
7. Publicar o site no Static Web Apps e testar no computador e no celular.
8. Aprovação do TI → assinatura paga → virada final (Supabase e Vercel ficam desligados, mas guardados).

## Custos estimados (confirmar na calculadora do Azure)
- Static Web Apps: gratuito.
- PostgreSQL Flexible Server B1ms: incluso no gratuito de 12 meses em contas novas; depois, cerca de US$ 15–25/mês.
- Container Apps: a cota gratuita mensal costuma cobrir o uso.

## Versão de teste para o TI: sem marcas e com dados fictícios (29/10/2026)

- **Sem logos**: no build `MODO=azure`, `scripts/azure/ficticio.js` troca o logo animado da entrada, os logos do menu e o ícone da aba por um quadro "LOGO" do mesmo tamanho. O código original (e o site da Vercel) continua com os logos.
- **Nomes**: os locais (ETAs, poços, ETEs, macromedidores, bairros) têm os nomes reais; só o nome da empresa (GS Inima, Ourinhos Saneamento) vira genérico, e as pessoas dos dados são inventadas.
- **Dados fictícios de 2025** no banco do Azure: `node scripts/azure/4-dados-ficticios.js 2025-01-01 2025-12-31 > dados.sql` e `psql -f dados.sql` (apaga os lançamentos e grava um ano inventado; pessoas inventadas; mantém o administrador). Nada vem do Supabase.
- Os painéis abrem no mês atual: para ver os dados, escolha **Ano → 2025** no seletor de período. A Página Inicial mostra só os últimos lançamentos, por isso fica vazia.

## Pendências registradas (para depois)

- **Endereços limpos (29/10/2026)**: trocar `.../#WebDashboard` por `.../inicio`, `.../#WebVolumes` por `.../volumes` etc., só na versão Azure (o Static Web Apps já tem o `navigationFallback`). Links antigos com `#` devem continuar funcionando e redirecionar.
- **Domínio próprio (29/10/2026)**: trocar `green-cliff-075ff460f.1.azurestaticapps.net` (endereço provisório do Azure) por um endereço da empresa, ex. `sistema.ourinhossaneamento.com.br`. Depende do TI cadastrar o registro no DNS; o plano gratuito inclui o HTTPS.
