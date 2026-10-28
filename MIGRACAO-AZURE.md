# Migração para o Azure

Objetivo: levar o site e o app do operador para dentro da Microsoft (Azure da empresa) **sem mudar as telas, os formulários e os painéis**.

A versão atual (Vercel + Supabase) fica guardada no GitHub: branch `site-aberto` e tag `versao-site-aberto-2026-10-28`. O projeto Supabase e o Vercel **não são apagados** até a virada final ser aprovada.

## Como fica

| Parte | Hoje | No Azure |
|---|---|---|
| Site (telas, gráficos, formulários) | Vercel | **Azure Static Web Apps** (plano gratuito), com o mesmo código |
| Login | Usuário e senha do Supabase | **Conta Microsoft da empresa** (Entra ID), com as regras de segurança do TI |
| Banco de dados | Supabase (PostgreSQL, ~20 MB) | **Azure Database for PostgreSQL – Flexible Server** (Brazil South), com as mesmas tabelas, funções e regras de acesso |
| Ligação site ↔ banco | API do Supabase (PostgREST) | **PostgREST no Azure Container Apps**, que aceita o login Microsoft. Assim o site continua fazendo as consultas do mesmo jeito |
| Foto do usuário | Supabase Storage | Gravada no próprio banco |
| Primeiro acesso / senha | Função `primeiro-acesso` | Não precisa mais: a senha é a da conta Microsoft |

Proteção: só os dados ficam fechados (como hoje). A página abre, mas nada aparece sem login da empresa.

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
