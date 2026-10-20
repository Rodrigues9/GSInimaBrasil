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

**Sem login, por enquanto**: na entrada o operador só digita o nome, que fica registrado em cada lançamento. Qualquer pessoa com o endereço do site pode ler e enviar dados; ninguém consegue apagar. Só é possível alterar uma coleta pendente (para lançar as análises) e uma descarga em andamento (para encerrar).

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

## Pontos de atenção
- **Telas do sistema web** (painel, químicos, coletas, descargas, dados, usuários) ainda mostram dados de exemplo; só o app do operador (inclusive dentro do sistema web, em "Lançamentos") usa o banco.
- **Autenticação**: ficou para depois. A biblioteca `@supabase/ssr` já está instalada para quando o login for implementado.
- **Leitura automática por foto**: ficou para uma etapa futura. O botão "Tirar foto do macromedidor" só marca que a foto foi tirada; a imagem não é enviada.
