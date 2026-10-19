# Ourinhos Saneamento — arquivos para hospedagem

Baixados em 19/10/2026 dos artifacts publicados no Claude.

| Pasta | Conteúdo | Origem |
|---|---|---|
| `index.html` | Página inicial com links para as duas partes | criada agora |
| `app/` | App do operador (celular) — arquivo único, autossuficiente | artifact "App Ourinhos Saneamento" |
| `sistema-web/` | Sistema web (painel, químicos, coletas, descargas, dados, usuários) — arquivo único | artifact "Sistema Ourinhos Saneamento" |
| `prototipo-fonte/` | Telas-fonte do protótipo (`.dc.html`) e `canvas.json` — referência para desenvolvimento, não precisam ir para o servidor | artifact de Design "Ourinhos Saneamento – App Operacional" |

## Como hospedar (Vercel)
O site é HTML estático, sem etapa de build. Na Vercel: **Add New → Project → importar o repositório do GitHub**, e na configuração deixar:

- **Framework Preset**: Other
- **Root Directory**: `./`
- **Build Command** e **Output Directory**: vazios (padrão)

Depois de publicado, cada envio (push) para a branch `main` atualiza o site sozinho.

Endereços do site:
- `/` — página inicial
- `/app/` — app do operador
- `/sistema-web/` — sistema web (as telas internas usam `#`, ex.: `/sistema-web/#WebQuimicos`)

Arquivos de configuração:
- `vercel.json` — endereços sem `.html`, barra no final e cabeçalhos básicos de segurança
- `.vercelignore` — deixa `prototipo-fonte/` e este LEIA-ME fora do site publicado

Só depende da internet para as fontes do Google Fonts.

## Pontos de atenção antes de ir para produção
- **Protótipo, sem back-end**: login, cadastros e registros não são gravados em lugar nenhum. Para uso real é preciso um servidor/banco de dados e autenticação de verdade.
- **Leitura automática por foto**: ficou para uma etapa futura e não está incluída. O botão "Tirar foto do macromedidor" do app só anexa a foto como registro; os valores continuam sendo digitados.
