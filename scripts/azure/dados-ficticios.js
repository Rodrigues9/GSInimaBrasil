// Gerador de dados FICTÍCIOS para o banco da versão Azure (teste para o TI).
// Usado por 4-dados-ficticios.js: gera um ano de lançamentos inventados (macromedidores, análises, níveis,
// ETEs, calibrações, químicos, coletas, descargas e usuários) com os nomes reais dos locais e pessoas inventadas.
'use strict';

  // ---------- números "aleatórios" sempre iguais (mesma demonstração para todo mundo) ----------
  var semente = 20261028;
  function rnd() {
    semente |= 0; semente = (semente + 0x6D2B79F5) | 0;
    var t = Math.imul(semente ^ (semente >>> 15), 1 | semente);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  }
  function entre(a, b) { return a + (b - a) * rnd(); }
  function arred(v, c) { var f = Math.pow(10, c || 0); return Math.round(v * f) / f; }
  function uuid() {
    var h = '0123456789abcdef', s = '';
    for (var i = 0; i < 32; i++) s += h[Math.floor(rnd() * 16)];
    return s.slice(0, 8) + '-' + s.slice(8, 12) + '-4' + s.slice(13, 16) + '-a' + s.slice(17, 20) + '-' + s.slice(20, 32);
  }
  function quando(dia, hora, min) { var d = new Date(dia); d.setHours(hora, min || 0, 0, 0); return d.toISOString(); }

  var OPERADORES = ['Ana Souza', 'Bruno Lima', 'Carla Mendes', 'Diego Alves', 'Elisa Rocha', 'Fábio Nunes'];
  var ANALISTAS = ['Gabriela Torres', 'Henrique Prado'];
  function quem() { return OPERADORES[Math.floor(rnd() * OPERADORES.length)]; }
  var DEMO_ID = '00000000-0000-4000-a000-000000000001';

  var POCOS = [['m3', 'Poço Diamantes', 1500, 0], ['e0', 'Poço Esmeralda', 3500, 150], ['m11', 'Poço Moradas', 1700, 75], ['m21', 'Poço Nova Alcântara', 40, 0],
    ['m8', 'Poço Pacaembu', 350, 18], ['m7', 'Poço São João', 4800, 210], ['m15', 'Poço Ville de France', 700, 35]];
  // Macromedidores: [id, nome, grupo, volume médio por dia (m³), vazão (m³/h) ou 0 quando só tem totalizador]
  var MACROS = [
    ['m0', 'REL Paineiras', 'res', 7500, 1], ['m1', 'Entrada RAP Paineiras 2', 'res', 950, 1], ['m2', 'Saída RAP Paineiras 2', 'res', 900, 1],
    ['m4', 'RAP Cohab', 'res', 900, 1], ['m5', 'REL Cohab', 'res', 880, 1], ['m6', 'REL São João', 'res', 3900, 1],
    ['m9', 'RAP Pacaembu - Zona Alta', 'res', 200, 1], ['m10', 'RAP Pacaembu - Zona Baixa', 'res', 150, 1],
    ['m12', 'REL Moradas - Condomínio', 'res', 600, 1], ['m13', 'REL Moradas - Bairros', 'res', 900, 1], ['m14', 'REL Moradas Clube', 'res', 150, 1],
    ['m16', 'R3 > São Silvestre', 'res', 1800, 1], ['m17', 'REL São Silvestre', 'res', 1750, 1], ['m18', 'Recalque Vila Margarida', 'res', 2500, 1],
    ['m19', 'REL Parque Minas Gerais', 'res', 3000, 1], ['m20', 'REL Anchieta', 'res', 4200, 1],
    ['m22', 'RAP Nova Alcântara - Zona Baixa', 'res', 20, 0], ['m23', 'REL Nova Alcântara - Zona Alta', 'res', 15, 0],
    ['e1', 'Retrolavagem ETA 1', 'eta', 1200, 1], ['e2', 'R2 > Centro', 'eta', 22000, 1], ['e3', 'R2 > Parque Minas Gerais', 'eta', 9000, 1],
    ['e4', 'Captação ETA 2', 'eta', 9000, 1], ['e5', 'Retrolavagem ETA 2', 'eta', 250, 1], ['e6', 'Saída ETA 2', 'eta', 8600, 1],
    ['e7', 'R2 > Paineiras', 'eta', 6000, 1], ['e8', 'R2 > Anchieta', 'eta', 4300, 1], ['e9', 'Captação ETA 1', 'eta', 38000, 1]
  ].concat(POCOS.map(function (p) { return [p[0], p[1], 'poco', p[2], p[0] === 'm3' || p[0] === 'm21' ? 0 : 1]; }));
  var ETES = ['ETE Choso Misato', 'ETE Moradas', 'ETE Moradas Clube', 'ETE Pacaembu', 'ETE Trianon', 'ETE Ville de France'];
  var BAIRROS = [['Rua das Flores, 120', 'Centro', 'ETAs'], ['Av. Jacinto Ferreira de Sá, 900', 'Vila Margarida', 'ETAs'], ['Rua Paraná, 45', 'Parque Minas Gerais', 'ETAs'],
    ['Rua Santos Dumont, 300', 'Jardim Paineiras', 'ETAs'], ['Rua Rio Branco, 77', 'São João', 'Poços'], ['Rua Tiradentes, 510', 'Moradas', 'Poços']];

  // ---------- geração das tabelas ----------
  function gerar(iniTxt, fimTxt) {
    var hoje = new Date(fimTxt + 'T00:00:00'), ini = new Date(iniTxt + 'T00:00:00');
    var t = {
      ourinhos_macros: [], ourinhos_analises_pocos: [], ourinhos_medicoes_pocos: [], ourinhos_operacao_etes: [], ourinhos_analises_esgoto: [],
      ourinhos_calibracoes: [], ourinhos_analises_agua: [], ourinhos_estoque_quimicos: [], ourinhos_descarregamentos: [], ourinhos_coletas_campo: [],
      ourinhos_coletas_tratamento: [], descargas_rede: [], ourinhos_operacao_etas: [], ourinhos_volumes_diarios: [], capacidades_pocos: [], ourinhos_usuarios: []
    };
    var tot = {}; MACROS.forEach(function (m, i) { tot[m[0]] = 150000 + i * 83731; });
    var estPoco = {}; POCOS.forEach(function (p) { estPoco[p[0]] = { hip: 800, aci: 400 }; });
    var pac = 30000, flu = 4500, sal = 600;

    for (var d = new Date(ini), n = 0; d <= hoje; d.setDate(d.getDate() + 1), n++) {
      var dia = new Date(d), fds = d.getDay() === 0 || d.getDay() === 6, sazonal = 1 + 0.06 * Math.sin((d.getMonth() + 1) / 12 * 2 * Math.PI);
      // Leituras dos macromedidores (uma por dia, de manhã).
      {
        MACROS.forEach(function (m) {
          var vol = m[3] * sazonal * (fds ? 0.95 : 1) * entre(0.9, 1.1);
          if (m[0] === 'm21' || m[0] === 'm22' || m[0] === 'm23') vol = rnd() < 0.2 ? arred(entre(10, 200)) : 0;
          tot[m[0]] += vol;
          t.ourinhos_macros.push({ id: uuid(), criado_em: quando(dia, 7 + Math.floor(rnd() * 3), Math.floor(rnd() * 60)), ponto_id: m[0], ponto_nome: m[1], grupo: m[2],
            vazao_m3h: m[4] ? arred(m[3] / 22 * entre(0.92, 1.08), 1) : null, totalizador_m3: arred(tot[m[0]]), volume_m3: arred(vol, 2),
            operador: quem(), observacao: null, usuario_id: null, turno: 'Diurno', origem: 'demonstracao', linha_planilha: null });
        });
      }
      // Análises de cloro e flúor dos poços (todo dia).
      POCOS.forEach(function (p) {
        t.ourinhos_analises_pocos.push({ id: uuid(), criado_em: quando(dia, 9 + Math.floor(rnd() * 6), Math.floor(rnd() * 60)), turno: 'Diurno', ponto_id: p[0], ponto_nome: p[1], grupo: 'poco',
          cloro_mg_l: arred(rnd() < 0.03 ? entre(2.05, 2.4) : entre(0.6, 1.6), 2), fluor_mg_l: arred(rnd() < 0.04 ? entre(0.5, 0.58) : entre(0.62, 0.78), 2),
          pulso_cloro_anterior_s: null, pulso_cloro_novo_s: null, pulso_fluor_anterior_s: null, pulso_fluor_novo_s: null,
          operador: quem(), observacao: null, usuario_id: null, origem: 'demonstracao', linha_planilha: null });
        // Estoque de hipoclorito e ácido no poço (consumo e reabastecimento).
        var e = estPoco[p[0]];
        e.hip -= entre(15, 35); e.aci -= entre(6, 14);
        if (e.hip < 200) e.hip = 800; if (e.aci < 100) e.aci = 400;
        t.ourinhos_estoque_quimicos.push({ id: uuid(), criado_em: quando(dia, 10, 30), turno: 'Diurno', local: 'poco', ponto_id: p[0], ponto_nome: p[1], niveis_l: null,
          hipoclorito_l: arred(e.hip), acido_fluossilicico_l: arred(e.aci), operador: quem(), usuario_id: null, origem: 'demonstracao', linha_planilha: null });
      });
      // Níveis estático e dinâmico (uma medição por mês em cada poço).
      if (d.getDate() === 10) POCOS.forEach(function (p, i) {
        var ne = 30 + i * 6 + entre(-1.5, 1.5);
        t.ourinhos_medicoes_pocos.push({ id: uuid(), criado_em: quando(dia, 14), turno: 'Diurno', ponto_id: p[0], ponto_nome: p[1],
          nivel_estatico_m: arred(ne, 2), nivel_dinamico_m: arred(ne + 12 + i * 3 + entre(-2, 2), 2), observacao: null, operador: quem(), usuario_id: null, origem: 'demonstracao', linha_planilha: null });
      });
      // ETEs: vazão de cada dia e, às segundas, as análises da semana.
      ETES.forEach(function (ete, i) {
        if (ete === 'ETE Pacaembu') return; // paralisada
        t.ourinhos_operacao_etes.push({ id: uuid(), criado_em: quando(dia, 8 + i, 15), turno: 'Diurno', ete: ete, vazao_m3h: arred(entre(3, 25) * (1 + i * 0.1), 1),
          checklist: {}, observacoes: {}, analises_realizadas: false, analises: null, operador: quem(), usuario_id: null, origem: 'demonstracao', linha_planilha: null });
        if (d.getDay() === 1) {
          var dqoB = entre(450, 750), ef = entre(0.55, 0.85);
          t.ourinhos_operacao_etes.push({ id: uuid(), criado_em: quando(dia, 15, 0), turno: 'Diurno', ete: ete, vazao_m3h: null, checklist: {}, observacoes: {}, analises_realizadas: true,
            analises: { 'ph-b': arred(entre(6.8, 8.4), 2), 'ph-t': arred(entre(6.6, 7.6), 2), 'od-b': arred(entre(0.2, 0.8), 2), 'od-t': arred(entre(0.4, 2.5), 2),
              'dqo-b': arred(dqoB), 'dqo-p': arred(dqoB * 0.85), 'dqo-t': arred(dqoB * (1 - ef)), 'sol-b': arred(entre(0.5, 4), 1), 'sol-t': arred(entre(0, 0.5), 1),
              'temp-b': arred(entre(21, 28), 1), 'temp-t': arred(entre(21, 27), 1) },
            operador: ANALISTAS[i % 2], usuario_id: null, origem: 'demonstracao', linha_planilha: null });
        }
        if (d.getDate() === 15) t.ourinhos_analises_esgoto.push({ id: uuid(), criado_em: quando(dia, 11), turno: 'Diurno', ete: ete,
          analises: { 'namon-b': arred(entre(5, 30), 1), 'namon-t': arred(entre(1, 12), 1), 'ntotal-b': arred(entre(15, 45), 1), 'ntotal-t': arred(entre(2, 15), 1),
            'fosforo-b': arred(entre(2, 6), 2), 'fosforo-t': arred(entre(0.5, 3), 2), 'nitrato-b': arred(entre(0.1, 1), 2), 'nitrato-t': arred(entre(0.5, 4), 2),
            'nitrito-b': arred(entre(0.01, 0.1), 3), 'nitrito-t': arred(entre(0.05, 0.4), 3), 'sulfato-b': arred(entre(15, 40)), 'sulfato-t': arred(entre(8, 25)),
            'sulfeto-b': arred(entre(0.05, 0.3), 2), 'sulfeto-t': arred(entre(0.01, 0.08), 2) },
          observacao: null, operador: ANALISTAS[0], usuario_id: null, origem: 'demonstracao', linha_planilha: null });
      });
      // Calibração diária dos equipamentos do laboratório.
      t.ourinhos_calibracoes.push({ id: uuid(), criado_em: quando(dia, 7, 40), turno: 'Diurno', operador: quem(), usuario_id: null, origem: 'demonstracao', linha_planilha: null, observacao: null,
        leituras: { c0: 0, c10: arred(entre(9.6, 10.3), 1), c500: arred(entre(490, 510)), p4: arred(entre(3.98, 4.03), 2), p7: arred(entre(6.98, 7.03), 2), p10: arred(entre(9.97, 10.04), 2),
          t10: arred(entre(9.8, 10.2), 1), t20: arred(entre(19.7, 20.3), 1), t100: arred(entre(97, 102), 1), t800: arred(entre(785, 812)), slope: arred(entre(91, 99), 1) } });
      // Análises quinzenais da água (bruta e tratada).
      if (d.getDate() === 1 || d.getDate() === 15) t.ourinhos_analises_agua.push({ id: uuid(), criado_em: quando(dia, 13), turno: 'Diurno',
        bruta_turbidez_ntu: arred(entre(8, 120), 1), bruta_cor_ptco: arred(entre(40, 300)), bruta_ph: arred(entre(6.8, 7.6), 2), bruta_ferro_mg_l: arred(entre(0.3, 2), 2),
        bruta_manganes_mg_l: arred(entre(0.02, 0.2), 3), bruta_alcalinidade_mg_l: arred(entre(15, 35), 1), bruta_dureza_mg_l: arred(entre(15, 40), 1),
        tratada_turbidez_ntu: arred(entre(0.2, 0.9), 2), tratada_cor_ptco: arred(entre(1, 8)), tratada_ph: arred(entre(6.8, 7.4), 2), tratada_cloro_livre_mg_l: arred(entre(0.8, 1.6), 2),
        tratada_cloro_total_mg_l: arred(entre(1, 1.9), 2), tratada_fluoreto_mg_l: arred(entre(0.62, 0.78), 2), tratada_ferro_mg_l: arred(entre(0.01, 0.1), 2),
        tratada_manganes_mg_l: arred(entre(0.001, 0.03), 3), tratada_aluminio_mg_l: arred(entre(0.02, 0.15), 2), tratada_alcalinidade_mg_l: arred(entre(10, 25), 1),
        tratada_dureza_mg_l: arred(entre(15, 40), 1), observacao: null, operador: ANALISTAS[1], usuario_id: null, origem: 'demonstracao', linha_planilha: null });
      // Estoque de químicos das ETAs (PAC, flúor e sal).
      pac -= entre(600, 1100); flu -= entre(60, 120); sal -= entre(8, 14);
      if (pac < 8000) { pac += 25000; t.ourinhos_descarregamentos.push({ id: uuid(), criado_em: quando(dia, 11), turno: 'Diurno', local: 'eta', lote_id: null, produto: 'PAC', ponto_id: null, ponto_nome: 'Tanques de PAC', quantidade: 25000, unidade: 'L', operador: quem(), usuario_id: null }); }
      if (flu < 1200) { flu += 3500; t.ourinhos_descarregamentos.push({ id: uuid(), criado_em: quando(dia, 11, 30), turno: 'Diurno', local: 'eta', lote_id: null, produto: 'Ácido fluossilícico', ponto_id: null, ponto_nome: 'Tanques de flúor', quantidade: 3500, unidade: 'L', operador: quem(), usuario_id: null }); }
      if (sal < 120) { sal += 600; t.ourinhos_descarregamentos.push({ id: uuid(), criado_em: quando(dia, 10), turno: 'Diurno', local: 'eta', lote_id: null, produto: 'Sal', ponto_id: null, ponto_nome: 'Depósito de sal', quantidade: 15000, unidade: 'kg', operador: quem(), usuario_id: null }); }
      t.ourinhos_estoque_quimicos.push({ id: uuid(), criado_em: quando(dia, 9), turno: 'Diurno', local: 'eta', ponto_id: 'eta', ponto_nome: 'ETAs', hipoclorito_l: null, acido_fluossilicico_l: null,
        niveis_l: { 'pac1-R1': arred(pac * 0.25), 'pac1-R2': arred(pac * 0.3), 'pac1-R3': arred(pac * 0.2), 'pac2-R1': arred(pac * 0.1), 'pac2-R2': arred(pac * 0.15),
          'flu1-R1': arred(flu * 0.22), 'flu1-R2': arred(flu * 0.22), 'flu1-R3': arred(flu * 0.2), 'flu1-R4': arred(flu * 0.18), 'flu2-R1': arred(flu * 0.18), sal_sacos_usados: Math.round(entre(8, 14)) },
        operador: quem(), usuario_id: null, origem: 'demonstracao', linha_planilha: null });
      // Coletas de campo (algumas por semana; as mais recentes ainda pendentes no laboratório).
      if (d.getDay() === 2 || d.getDay() === 4) {
        var b = BAIRROS[n % BAIRROS.length], pend = (hoje - d) / 864e5 < 3;
        t.ourinhos_coletas_campo.push({ id: uuid(), coletada_em: quando(dia, 9, 20), endereco: b[0], bairro: b[1], sistema: b[2], cloro_mg_l: arred(entre(0.4, 1.4), 2),
          fluor_mg_l: arred(entre(0.6, 0.8), 2), ph: pend ? null : arred(entre(6.8, 7.6), 2), cor_uh: pend ? null : arred(entre(1, 8)), turbidez_ut: pend ? null : arred(entre(0.2, 1.5), 2),
          coliformes_totais: pend ? null : (rnd() < 0.05 ? 'P' : 'A'), coliformes_termotolerantes: pend ? null : 'A', observacao: null,
          status: pend ? 'pendente' : 'concluida', coletor: quem(), analista: pend ? null : ANALISTAS[0], concluida_em: pend ? null : quando(dia, 16), usuario_id: null });
      }
      // Descargas de rede (de vez em quando).
      if (d.getDate() % 9 === 0) {
        var bb = BAIRROS[(n * 7) % BAIRROS.length], ini2 = quando(dia, 10), min = Math.round(entre(20, 90));
        t.descargas_rede.push({ id: uuid(), criado_em: ini2, endereco: bb[0], bairro: bb[1], sistema: bb[2], dn_mm: [50, 75, 100, 150][n % 4], inicio_em: ini2,
          fim_em: new Date(Date.parse(ini2) + min * 60000).toISOString(), volume_m3: arred(min * entre(0.4, 1.2), 1), observacao: 'Cor aparente após manutenção', status: 'concluida', operador: quem(), usuario_id: null });
      }
    }
    POCOS.forEach(function (p) {
      t.capacidades_pocos.push({ ponto_id: p[0], ponto_nome: p[1], hipoclorito_l: 1000, acido_fluossilicico_l: 500, fluor_diluido: p[0] === 'm7' || p[0] === 'm11', atualizado_em: quando(ini, 9), atualizado_por: 'Usuário Demonstração' });
    });
    // Estoque "real" dos poços: nos poços com flúor diluído 50%, metade do volume é ácido.
    t.ourinhos_estoque_quimicos_real = t.ourinhos_estoque_quimicos.map(function (r) {
      var cap = t.capacidades_pocos.filter(function (c) { return c.ponto_id === r.ponto_id; })[0], dil = !!(cap && cap.fluor_diluido);
      return Object.assign({}, r, { fluor_diluido: dil, acido_fluossilicico_real_l: r.acido_fluossilicico_l == null ? null : dil ? r.acido_fluossilicico_l / 2 : r.acido_fluossilicico_l });
    });
    var tudo = { eta: { on: true }, ete: { on: true }, poco: { on: true }, coleta: { on: true }, descarga: { on: true },
      web: { exp: true, imp: true, admin: true, excluir: true, cadastrar: true, capacidades: true },
      telas: { inicio: true, etas: true, etaForm: true, pocos: true, etes: true, agua: true, esgoto: true, calibracoes: true, quimicos: true, volumes: true, descargas: true } };
    t.ourinhos_usuarios.push({ id: uuid(), usuario_id: DEMO_ID, login: 'demonstracao', nome: 'Usuário Demonstração', papel: 'admin', ativo: true, permissoes: tudo,
      ultimo_acesso: new Date().toISOString(), criado_em: quando(ini, 8), criado_por: null, foto: null, preferencias: {}, email: 'demonstracao@exemplo.com' });
    OPERADORES.concat(ANALISTAS).forEach(function (nome, i) {
      var op = i < OPERADORES.length, papel = op ? (i % 2 ? 'operador_volante' : 'operador_eta') : 'analista';
      var login = nome.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(' ', '.');
      t.ourinhos_usuarios.push({ id: uuid(), usuario_id: uuid(), login: login, nome: nome, papel: papel, ativo: true,
        permissoes: { eta: { on: true }, ete: { on: !op }, poco: { on: true }, coleta: { on: true }, descarga: { on: op } },
        ultimo_acesso: quando(hoje, 7 + i), criado_em: quando(ini, 8), criado_por: DEMO_ID, foto: null, preferencias: {}, email: login + '@exemplo.com' });
    });
    return t;
  }
module.exports = { gerar: gerar };
