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

Publicar o site: `MODO=azure node scripts/build.js` e depois `npx @azure/static-web-apps-cli deploy ./dist --api-location ./api --api-language node --api-version 20 --env production` (com o token de implantação do Static Web Apps em `SWA_CLI_DEPLOYMENT_TOKEN`).

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
