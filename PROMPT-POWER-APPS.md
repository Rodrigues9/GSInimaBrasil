# Prompts para recriar o sistema no Copilot do Power Apps

Como usar:
1. Abra https://make.powerapps.com, no seu **ambiente de desenvolvedor** (canto superior direito).
2. Na página inicial, na caixa **"Vamos criar um aplicativo"** (ou em **Plan designer / Designer de planos**), cole o **Prompt 1** inteiro.
3. Revise as tabelas que o Copilot propuser e clique em **Criar** (ou **Salvar e continuar**).
4. Depois que o app abrir no editor, use os **Prompts 2 a 7** no painel do Copilot, **um de cada vez**, esperando ele terminar cada um.

Observações:
- O Copilot do Power Apps monta telas com os controles dele. O resultado fica **parecido** com o nosso, mas não idêntico. Ele não reproduz exatamente o nosso desenho, os gráficos personalizados ou as regras mais complexas. Esse é justamente um dos pontos para a comparação.
- Os prompts pedem **dados fictícios** para testar.
- Se o Copilot avisar que o texto é longo demais, use o **Prompt 1 curto** no lugar do Prompt 1.

---

## Prompt 1 (estrutura geral: cole primeiro)

```
Crie um aplicativo chamado "Ourinhos Saneamento – Operação Inteligente" para uma empresa de saneamento (água e esgoto) da cidade de Ourinhos-SP. O app deve funcionar no celular e no computador (layout responsivo), todo em português do Brasil, com dados fictícios para teste.

PÚBLICO E PERFIS
Usuários com os cargos: Operador de ETA, Operador Volante, Analista de Laboratório, Supervisor, Coordenador, Gerente, Diretor e Administrador. Operadores usam principalmente o celular para lançar dados em campo; gestores usam o computador para ver painéis.

TABELAS (Dataverse)
1. Macromedidores (leituras): data e hora, ponto (escolha), grupo (ETA, Poço, Reservatório), vazão (m³/h), totalizador (m³), volume do dia (m³), operador, observação.
2. Pontos de medição: código, nome, grupo. Exemplos: Captação ETA 1, Captação ETA 2, Retrolavagem ETA 1, Retrolavagem ETA 2, R2 > Centro, R2 > Parque Minas Gerais, R2 > Paineiras, R2 > Anchieta, Poço Diamantes, Poço Esmeralda, Poço Moradas, Poço Nova Alcântara, Poço Pacaembu, Poço São João, Poço Ville de France, REL Paineiras, Saída RAP Paineiras 2, RAP Cohab, Recalque Vila Margarida, R3 > São Silvestre, REL Parque Minas Gerais, REL Anchieta.
3. Análises dos poços: data e hora, poço, cloro (mg/L), flúor (mg/L), pulso de cloro e de flúor (s), operador.
4. Medições de nível dos poços: data, poço, nível estático (m), nível dinâmico (m).
5. Operação das ETEs: data e hora, ETE (Choso Misato, Moradas, Moradas Clube, Pacaembu, Trianon, Ville de France), vazão (m³/h), checklist, análises (pH, OD, DQO bruto/tratado, sólidos, temperatura), operador.
6. Calibrações do laboratório: data, turno, leituras dos padrões (cloro, pH 4/7/10, turbidez 10/20/100/800, condutividade), operador.
7. Análises quinzenais da água: data, água bruta e tratada (turbidez, cor, pH, ferro, manganês, alcalinidade, dureza, cloro livre e total, fluoreto, alumínio).
8. Estoque de químicos: data, local (ETA ou poço), produto (PAC, ácido fluossilícico, hipoclorito, sal), quantidade (L ou kg).
9. Descarregamentos de químicos: data, produto, quantidade, unidade, local.
10. Coletas de campo: data da coleta, endereço, bairro, sistema, cloro, flúor, pH, cor, turbidez, coliformes totais e termotolerantes (Ausente/Presente), status (pendente/concluída), coletor, analista.
11. Descargas de rede: data, endereço, bairro, sistema, diâmetro (mm), início, fim, volume (m³), status.
12. Volumes diários: data, tipo (produzido/distribuído), ponto ou área, volume (m³).
13. Usuários e permissões: nome, login, cargo, ativo, telas liberadas, blocos do app liberados.

TELAS
No celular (app do operador): tela inicial "Olá, [nome]" com as tarefas do dia e botões grandes para cada bloco de lançamento: Macromedidores, Poços (análises e níveis), ETEs, Coletas de campo, Descargas de rede e Químicos. Cada formulário com campos grandes, validação e botão "Salvar".
No computador (Painel de Gestão), com menu lateral recolhível: Página Inicial; Operações (ETAs, Poços, ETEs); Qualidade (Água, Esgoto, Calibrações); Químicos; Volumes (Visão geral, Descargas de rede); no rodapé do menu: Importar e exportar, Usuários e permissões.

REGRAS
- Cloro: 0,2 a 2,0 mg/L. Flúor: 0,6 a 0,8 mg/L. pH: 6 a 9. Fora da faixa, destacar em vermelho.
- Volume do dia de um macromedidor = totalizador atual − totalizador da leitura anterior.
- Outorga mensal dos poços (m³/mês): Diamantes 60.000, Esmeralda 92.400, Moradas 60.000, Nova Alcântara 24.000, Pacaembu 31.200, São João 131.400, Ville de France 84.000. Alertar quando a projeção do mês passar de 100%.
- Alertar quando um poço operar mais de 20 horas por dia (volume do dia ÷ vazão média).
- Operadores só veem os blocos liberados para eles.

VISUAL
Fundo cinza-azulado claro (#EEF3F7), cartões brancos com cantos bem arredondados, títulos azul-marinho (#0A2E5C), botões azuis (#0057A8), fonte Inter. Gráficos com as cores #005e83 (principal) e #3ab0c8 (secundária), linhas suaves sem marcadores.

Gere dados fictícios realistas dos últimos 3 meses para todas as tabelas.
```

## Prompt 1 curto (use só se o anterior for longo demais)

```
Crie um app responsivo (celular e computador), em português, chamado "Ourinhos Saneamento – Operação Inteligente", para operação de água e esgoto. Tabelas: leituras de macromedidores (ponto, vazão m³/h, totalizador, volume do dia), análises de cloro e flúor dos poços, níveis estático e dinâmico dos poços, operação das ETEs (vazão e análises de pH, OD e DQO), calibrações do laboratório, análises quinzenais da água bruta e tratada, estoque e descarregamentos de químicos (PAC, flúor, hipoclorito, sal), coletas de campo com coliformes, descargas de rede, volumes diários produzidos e distribuídos, e usuários com cargos e permissões. No celular: formulários grandes de lançamento para operadores. No computador: painéis com menu lateral (Página Inicial, ETAs, Poços, ETEs, Água, Esgoto, Calibrações, Químicos, Volumes, Descargas de rede, Usuários e permissões). Faixas: cloro 0,2–2,0 mg/L, flúor 0,6–0,8 mg/L, pH 6–9; destaque em vermelho fora da faixa. Cores: fundo #EEF3F7, títulos #0A2E5C, botões #0057A8, gráficos #005e83 e #3ab0c8. Gere dados fictícios dos últimos 3 meses.
```

---

## Prompt 2: Página Inicial (no painel do Copilot, com o app aberto)

```
Crie a tela "Página Inicial" do Painel de Gestão: no topo a data de hoje e o título "Página Inicial", com o subtítulo "Resumo dos últimos lançamentos de cada área" e os botões "Atualizar" e "Exportar dados". Logo abaixo, um cartão "Destaques" com borda laranja à esquerda listando o que pede atenção (análises fora da faixa, poços acima da outorga, poços operando mais de 20 h por dia). Depois, uma grade de cartões (ETAs, Poços, ETEs, Químicos, Volumes), cada um com o título, a data do último lançamento, um link "Ver painel ›", 3 ou 4 indicadores em caixas cinza-claro (rótulo pequeno, número grande em negrito, legenda) e uma área "Leitura do Painel" com frases curtas de alerta, aviso ou sugestão.
```

## Prompt 3: Poços

```
Crie a tela "Poços": um seletor de período (mês, ano ou datas) no canto superior direito e um seletor de poço. Mostre indicadores de cloro médio, flúor médio, volume produzido no período e porcentagem da outorga. Um gráfico de linhas com cloro e flúor por dia e faixas de referência (cloro 0,2–2,0; flúor 0,6–0,8), um gráfico de colunas com o volume produzido por dia e a linha da outorga proporcional, e um histórico mensal de nível estático e dinâmico. Mostre a média de horas de operação por dia com a legenda "Valor aproximado".
```

## Prompt 4: Volumes

```
Crie a tela "Volumes – Visão geral" com três abas: Produzidos, Distribuídos e Produzidos x Distribuídos. Produzidos: soma das captações das ETAs e dos poços (sem retrolavagens). Distribuídos: soma por área (Centro, Vila Margarida, São Silvestre, Parque, Parque Minas Gerais, Paineiras, Paineiras 2, Anchieta, São João, Cohab, Moradas, Bela Vista, Pacaembu, Nova Alcântara), agrupadas em "Sistema ETAs" e "Sistemas dos poços". Mostre 4 indicadores (total, % ETAs, % poços, retrolavagens), um gráfico de colunas empilhadas por dia ou por mês nas cores #005e83 e #3ab0c8, uma lista de participação de cada ponto com barras horizontais e uma tabela "Por mês" com os 12 meses do ano.
```

## Prompt 5: ETEs e Esgoto

```
Crie a tela "ETEs" com um seletor de ETE e de período: vazão média por dia em gráfico de linhas, checklist do dia (feito ou pendente) e a eficiência de remoção de DQO = (DQO bruto − DQO tratado) ÷ DQO bruto, com alerta abaixo de 60%. Crie também a tela "Esgoto" com as análises mensais (nitrogênio amoniacal e total, fósforo, nitrato, nitrito, sulfato e sulfeto, bruto e tratado) em tabela, por ETE.
```

## Prompt 6: Químicos e formulários do celular

```
Crie a tela "Químicos" mostrando o estoque atual de cada produto nas ETAs (PAC, ácido fluossilícico, sal) e em cada poço (hipoclorito e ácido), com autonomia estimada em dias pelo consumo médio, e a lista de descarregamentos. Crie também, para o celular, os formulários de lançamento: Macromedidor (escolher o ponto, digitar vazão e totalizador, calcular o volume do dia automaticamente), Análise do poço (cloro, flúor e pulsos), Nível do poço, Operação da ETE (vazão, checklist e análises), Coleta de campo (endereço, bairro, cloro, flúor) e Descarga de rede (endereço, diâmetro, início, fim, volume). Botões grandes, campos numéricos com teclado numérico, e mensagem de confirmação antes de salvar.
```

## Prompt 7: Usuários e permissões

```
Crie a tela "Usuários e permissões" (só para Administrador): lista de usuários com nome, login, cargo, situação (ativo ou inativo) e último acesso. Ao selecionar um usuário, mostrar três blocos: "Lançamentos no App" (ETA, Poço, ETE, Coleta, Descarga, com interruptores), "Telas do Sistema" (Página Inicial, ETAs, Operação ETA, Poços, ETEs, Água, Esgoto, Calibrações, Químicos, Volumes, Descargas, com interruptores) e "Ações" (Exportar, Importar, Capacidades dos poços, Administrar, Cadastrar, Excluir). Botão "Aplicar Padrão do Cargo" e botão "Salvar".
```
