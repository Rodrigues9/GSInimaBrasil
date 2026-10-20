/* Conexão do app do operador com o Supabase (sem login: qualquer pessoa lê e envia).
 *
 * As telas do app continuam como estão; este arquivo:
 *  - carrega do banco o que já foi lançado (hoje, pendências e totais do mês) e substitui os dados de exemplo;
 *  - grava no banco cada formulário salvo;
 *  - registra como operador o nome digitado na tela de entrada.
 *
 * Uso: DB.install(PAGES.Main.cls) antes de montar a tela do app.
 */
(function () {
  'use strict';

  var env = window.ENV || {};
  if (!window.supabase || !env.SUPABASE_URL || !env.SUPABASE_PUBLISHABLE_KEY) {
    console.warn('Supabase não configurado: o app vai rodar só com dados de exemplo.');
    return;
  }
  var sb = window.supabase.createClient(env.SUPABASE_URL, env.SUPABASE_PUBLISHABLE_KEY, {
    auth: { persistSession: false, autoRefreshToken: false }
  });

  // ---------- utilidades ----------
  var OP_KEY = 'gsinima.operador';
  function storeGet(k) { try { return localStorage.getItem(k); } catch (e) { return null; } }
  function storeSet(k, v) { try { localStorage.setItem(k, v); } catch (e) { /* sem armazenamento */ } }
  function operador() { return (storeGet(OP_KEY) || '').trim() || 'Operador'; }

  // Números digitados no padrão brasileiro: "1.234.567" (inteiro) e "1,25" (decimal).
  function num(s) {
    var t = String(s == null ? '' : s).trim();
    if (!t) return null;
    var n = Number(t.replace(/\./g, '').replace(',', '.'));
    return isFinite(n) ? n : null;
  }
  function dec(s) {
    var t = String(s == null ? '' : s).trim();
    if (!t) return null;
    var n = Number(t.replace(',', '.'));
    return isFinite(n) ? n : null;
  }
  function br(n) { return n == null ? '' : String(n).replace('.', ','); }
  function fmt(n) { return Math.round(n).toLocaleString('pt-BR'); }
  function fmt1(n) { return n.toLocaleString('pt-BR', { minimumFractionDigits: 1, maximumFractionDigits: 1 }); }
  function pad(n) { return String(n).padStart(2, '0'); }
  function hhmm(iso) { var d = new Date(iso); return pad(d.getHours()) + ':' + pad(d.getMinutes()); }
  function ddmm(iso) { var d = new Date(iso); return pad(d.getDate()) + '/' + pad(d.getMonth() + 1); }
  function dayStart(offsetDays) {
    var d = new Date(); d.setHours(0, 0, 0, 0); d.setDate(d.getDate() + (offsetDays || 0)); return d;
  }
  function monthStart() { var d = dayStart(0); d.setDate(1); return d; }
  function quando(iso) {
    var t = Date.parse(iso);
    if (t >= dayStart(0).getTime()) return 'hoje ' + hhmm(iso);
    if (t >= dayStart(-1).getTime()) return 'ontem ' + hhmm(iso);
    return ddmm(iso) + ' ' + hhmm(iso);
  }
  function hojeAs(hm) {
    var m = /^(\d{1,2}):(\d{2})/.exec(String(hm || ''));
    if (!m) return null;
    var d = new Date(); d.setHours(Number(m[1]), Number(m[2]), 0, 0);
    return d.toISOString();
  }
  function soPreenchidos(obj, conv) {
    var out = {};
    Object.keys(obj || {}).forEach(function (k) {
      var v = conv ? conv(obj[k]) : obj[k];
      if (v != null && v !== '') out[k] = v;
    });
    return out;
  }
  // Vazão estimada por diâmetro de rede (m³/h), a mesma usada na tela de descargas.
  var VAZAO_DN = { 50: 18, 75: 36, 100: 60, 150: 130 };

  // ---------- aviso na tela ----------
  var toastEl = null, toastTimer = null;
  function toast(msg, kind) {
    if (!toastEl) {
      toastEl = document.createElement('div');
      toastEl.setAttribute('role', 'status');
      toastEl.style.cssText = 'position:fixed;left:50%;bottom:24px;transform:translateX(-50%);max-width:min(360px,calc(100vw - 32px));' +
        'padding:12px 16px;border-radius:14px;font:600 14px/1.35 system-ui,sans-serif;z-index:9999;box-shadow:0 8px 24px rgba(10,46,92,.25)';
      document.body.appendChild(toastEl);
    }
    var err = kind !== 'ok';
    toastEl.style.background = err ? '#FDECEA' : '#E2F4EE';
    toastEl.style.color = err ? '#8C1D18' : '#0B6B57';
    toastEl.textContent = msg;
    toastEl.hidden = false;
    clearTimeout(toastTimer);
    toastTimer = setTimeout(function () { toastEl.hidden = true; }, err ? 7000 : 3000);
  }
  function erroTxt(err) {
    var m = (err && (err.message || err.details)) || String(err || '');
    if (/Failed to fetch|NetworkError|network/i.test(m)) return 'sem conexão com a internet';
    return m;
  }

  async function q(req) {
    var r = await req;
    if (r.error) throw r.error;
    return r.data;
  }

  // ---------- leitura dos dados ----------
  async function carregar(comp) {
    var t0 = dayStart(0).toISOString();
    var m0 = monthStart().toISOString();
    var res = await Promise.all([
      q(sb.from('leituras_macromedidor').select('ponto_id,ponto_nome,criado_em,vazao_m3h,totalizador_m3,cloro_mg_l,fluor_mg_l,operador').order('criado_em', { ascending: false }).limit(1000)),
      q(sb.from('calibracoes_eta').select('criado_em').gte('criado_em', t0).order('criado_em', { ascending: false }).limit(1)),
      q(sb.from('estoque_eta').select('criado_em,niveis_l').order('criado_em', { ascending: false }).limit(1)),
      q(sb.from('visitas_ete').select('ete,criado_em').gte('criado_em', t0).order('criado_em', { ascending: true })),
      q(sb.from('descarregamentos_quimicos').select('produto,eta,quantidade_kg').order('criado_em', { ascending: false }).limit(1)),
      q(sb.from('coletas').select('*').eq('status', 'pendente').order('coletada_em', { ascending: true })),
      q(sb.from('coletas').select('sistema').eq('status', 'concluida').gte('concluida_em', m0)),
      q(sb.from('coletas').select('endereco,coletada_em,concluida_em,status').or('coletada_em.gte.' + t0 + ',concluida_em.gte.' + t0)),
      q(sb.from('descargas_rede').select('*').eq('status', 'andamento').order('inicio_em', { ascending: true })),
      q(sb.from('descargas_rede').select('*').eq('status', 'concluida').gte('fim_em', m0).order('fim_em', { ascending: false })),
      q(sb.from('estoque_poco').select('ponto_id,ponto_nome,hipoclorito_l,acido_fluossilicico_l,criado_em').order('criado_em', { ascending: false }).limit(300)),
      q(sb.from('coletas').select('endereco,concluida_em,coliformes_totais,coliformes_termotolerantes').eq('status', 'concluida').gte('concluida_em', m0)
        .or('coliformes_totais.eq.P,coliformes_termotolerantes.eq.P').order('concluida_em', { ascending: false }))
    ]);
    var estPoco = res[10], colPositivas = res[11];
    var leit = res[0], cal = res[1], estEta = res[2], ete = res[3], desc = res[4];
    var colPend = res[5], colMes = res[6], colHoje = res[7], dscAnd = res[8], dscMes = res[9];
    var hoje = Date.parse(t0);

    // Macromedidores: lançados hoje e última leitura de cada ponto.
    var done = {}, dbLast = {};
    leit.forEach(function (r) {
      if (!dbLast[r.ponto_id]) dbLast[r.ponto_id] = { tot: Number(r.totalizador_m3), vaz: Number(r.vazao_m3h), at: r.criado_em, who: r.operador };
      if (!done[r.ponto_id] && Date.parse(r.criado_em) >= hoje) done[r.ponto_id] = hhmm(r.criado_em);
    });

    var etaDone = {};
    if (cal[0]) etaDone.cal = hhmm(cal[0].criado_em);
    if (estEta[0] && Date.parse(estEta[0].criado_em) >= hoje) etaDone.est = hhmm(estEta[0].criado_em);

    var eteDone = {};
    ete.forEach(function (r) { eteDone[r.ete] = hhmm(r.criado_em); });

    var descLast = desc[0] ? desc[0].produto + ' na ' + desc[0].eta + ', ' + fmt(Number(desc[0].quantidade_kg)) + ' kg' : null;

    // Coletas
    var A = comp.colAddrs();
    var idxAddr = function (end) { for (var i = 0; i < A.length; i++) if (A[i].addr === end) return i; return -1; };
    var pend = colPend.map(function (c) {
      return {
        id: c.id, a: idxAddr(c.endereco), date: ddmm(c.coletada_em), time: hhmm(c.coletada_em), who: c.coletor,
        cl: br(c.cloro_mg_l), fl: br(c.fluor_mg_l), ph: br(c.ph), cor: br(c.cor_uh), tur: br(c.turbidez_ut),
        ct: c.coliformes_totais || '', cte: c.coliformes_termotolerantes || ''
      };
    }).filter(function (c) { return c.a >= 0; });
    var colDone = { eta: 0, sj: 0, mor: 0, pac: 0 };
    colMes.forEach(function (c) { colDone[c.sistema] = (colDone[c.sistema] || 0) + 1; });

    // Descargas de rede
    var P = comp.dscPoints();
    var idxPt = function (end) { for (var i = 0; i < P.length; i++) if (P[i][0] === end) return i; return -1; };
    var dscRun = dscAnd.map(function (d) { return { id: d.id, p: idxPt(d.endereco), ini: hhmm(d.inicio_em), who: d.operador }; })
      .filter(function (d) { return d.p >= 0; });
    var dscToday = dscMes.filter(function (d) { return Date.parse(d.fim_em) >= hoje; })
      .map(function (d) { return { p: idxPt(d.endereco), ini: hhmm(d.inicio_em), fim: hhmm(d.fim_em), who: d.operador }; })
      .filter(function (d) { return d.p >= 0; });
    var dscMonthVol = dscMes.reduce(function (s, d) { return s + (Number(d.volume_m3) || 0); }, 0);

    // Histórico de hoje (coletas e descargas; o restante o app monta sozinho).
    var hist = [];
    var add = function (title, sub, iso) { hist.push({ title: title, sub: sub, time: 'Hoje, ' + hhmm(iso), t: hhmm(iso) }); };
    colHoje.forEach(function (c) {
      if (Date.parse(c.coletada_em) >= hoje) add(c.endereco, 'Coleta de campo', c.coletada_em);
      if (c.concluida_em && Date.parse(c.concluida_em) >= hoje) add(c.endereco, 'Análises da coleta concluídas', c.concluida_em);
    });
    dscAnd.concat(dscMes).forEach(function (d) {
      if (Date.parse(d.inicio_em) >= hoje) add(d.endereco, d.status === 'andamento' ? 'Início de descarga' : 'Descarga de rede', d.status === 'andamento' ? d.inicio_em : d.fim_em);
      else if (d.fim_em && Date.parse(d.fim_em) >= hoje) add(d.endereco, 'Descarga de rede encerrada', d.fim_em);
    });
    hist.sort(function (a, b) { return a.t < b.t ? 1 : -1; });

    // "Precisa de atenção": residuais fora da faixa hoje, estoque baixo nos poços, coliformes presentes no mês.
    var alertas = [];
    var vistoHoje = {};
    leit.forEach(function (r) {
      if (Date.parse(r.criado_em) < hoje || vistoHoje[r.ponto_id]) return;
      vistoHoje[r.ponto_id] = true;
      var cl = r.cloro_mg_l == null ? null : Number(r.cloro_mg_l);
      var fl = r.fluor_mg_l == null ? null : Number(r.fluor_mg_l);
      if (cl != null && (cl < 0.2 || cl > 2.0)) alertas.push({ title: 'Cloro ' + (cl < 0.2 ? 'abaixo' : 'acima') + ' da faixa no ' + r.ponto_nome, sub: br(cl) + ' mg/L na leitura das ' + hhmm(r.criado_em) });
      if (fl != null && (fl < 0.6 || fl > 0.8)) alertas.push({ title: 'Flúor ' + (fl < 0.6 ? 'abaixo' : 'acima') + ' da faixa no ' + r.ponto_nome, sub: br(fl) + ' mg/L na leitura das ' + hhmm(r.criado_em) });
    });
    // Capacidade e consumo diário dos reservatórios dos poços (os mesmos da tela de estoque).
    var TANQUES = [['hipoclorito_l', 'Hipoclorito de sódio', 1000, 58], ['acido_fluossilicico_l', 'Ácido fluossilícico', 500, 21]];
    var vistoEst = {};
    estPoco.forEach(function (r) {
      if (vistoEst[r.ponto_id]) return;
      vistoEst[r.ponto_id] = true;
      TANQUES.forEach(function (t) {
        var v = r[t[0]] == null ? null : Number(r[t[0]]);
        if (v == null || v / t[2] >= 0.2) return;
        alertas.push({ title: t[1] + ' baixo no ' + r.ponto_nome, sub: Math.round(v / t[2] * 100) + '% do reservatório, cerca de ' + Math.floor(v / t[3]) + ' dias' });
      });
    });
    colPositivas.forEach(function (c) {
      alertas.push({ title: 'Coliformes presentes em ' + c.endereco, sub: 'Coleta concluída em ' + ddmm(c.concluida_em) + ', recoleta necessária' });
    });

    return {
      alertas: alertas,
      dbOk: true, done: done, dbLast: dbLast, etaDone: etaDone, dbEtaPrev: (estEta[0] && estEta[0].niveis_l) || {},
      eteDone: eteDone, descLast: descLast,
      colPend: pend, colDone: colDone, colHist: hist,
      dscRun: dscRun, dscToday: dscToday, dscMonthN: dscMes.length, dscMonthVol: dscMonthVol
    };
  }

  function atualizar(comp) {
    return carregar(comp).then(function (patch) { comp.setState(patch); }, function (err) {
      console.error(err);
      toast('Não foi possível carregar os dados do sistema (' + erroTxt(err) + ').');
    });
  }

  // ---------- gravação dos formulários ----------
  // Envolve um botão de salvar: roda a lógica original do app (validação e tela de confirmação)
  // e, se ela aceitou o envio, grava no banco e recarrega os dados.
  function aoSalvar(comp, obj, key, aceito, gravar, antes, depois) {
    if (!obj || typeof obj[key] !== 'function') return;
    var orig = obj[key];
    obj[key] = function () {
      var st = comp.state;
      var extra = antes ? antes(st) : null;
      orig.apply(this, arguments);
      if (comp.state === st || !aceito(comp.state, st)) return;
      if (depois) depois(st, extra);
      Promise.resolve().then(function () { return gravar(st, extra); }).then(function () {
        return atualizar(comp);
      }, function (err) {
        console.error(err);
        toast('Atenção: o registro NÃO foi salvo no sistema (' + erroTxt(err) + '). Tente de novo.');
        return atualizar(comp);
      });
    };
  }
  var foiParaConfirmacao = function (novo) { return novo.screen === 'ok'; };

  function inserir(tabela, linha) { return q(sb.from(tabela).insert(linha)); }
  async function alterar(tabela, id, campos) {
    var rows = await q(sb.from(tabela).update(campos).eq('id', id).select('id'));
    if (!rows || !rows.length) throw new Error('registro não encontrado ou já encerrado');
  }

  function decorar(comp, v) {
    var st = comp.state;
    v.opName = operador();
    v.alertas = st.alertas || [];
    v.semAlertas = !!st.dbOk && v.alertas.length === 0;

    // Tela de entrada: o nome digitado vira o operador dos registros.
    if (v.nav && typeof v.nav.home === 'function') {
      var home = v.nav.home;
      v.nav.home = function () {
        if (comp.state.screen === 'login') {
          var el = document.getElementById('lg-user');
          var nome = el ? el.value.trim() : '';
          if (!nome) { toast('Digite seu nome para entrar.'); if (el) el.focus(); return; }
          storeSet(OP_KEY, nome.slice(0, 80));
          if (toastEl) toastEl.hidden = true;
          atualizar(comp);
        }
        return home.apply(this, arguments);
      };
    }

    // Formulário de macromedidor: leitura anterior vem do banco.
    if (v.p && st.dbOk) {
      var last = (st.dbLast || {})[v.p.id];
      var cur = num(st.tot), hasCur = cur != null && cur > 0;
      if (last) {
        var vol = cur - last.tot;
        var hrs = (Date.now() - Date.parse(last.at)) / 3600000;
        var h = Math.floor(hrs), m = Math.round((hrs - h) * 60);
        v.p.prevTxt = fmt(last.tot);
        v.p.vazPrevTxt = fmt1(last.vaz);
        v.p.lastTxt = quando(last.at) + ', ' + last.who;
        v.neg = hasCur && vol < 0;
        v.volTxt = hasCur && !v.neg ? fmt(vol) : '—';
        v.vazMedTxt = hasCur && !v.neg && hrs > 0 ? fmt1(vol / hrs) : '—';
        v.hrsTxt = h + ' h ' + pad(m) + ' min';
      } else {
        v.p.prevTxt = '—'; v.p.vazPrevTxt = '—'; v.p.lastTxt = 'primeira leitura deste ponto';
        v.neg = false; v.volTxt = '—'; v.vazMedTxt = '—'; v.hrsTxt = '—';
      }
    } else if (v.p) {
      v.p.lastTxt = 'carregando…';
    }

    var p = v.p, op = operador();

    aoSalvar(comp, v.on, 'saveLeitura', foiParaConfirmacao, function (s, obs) {
      var tot = num(s.tot), last = (s.dbLast || {})[p.id];
      return inserir('leituras_macromedidor', {
        ponto_id: p.id, ponto_nome: p.name, grupo: p.grp,
        vazao_m3h: dec(s.vaz), totalizador_m3: tot,
        volume_m3: last ? tot - last.tot : null,
        cloro_mg_l: p.poco ? dec(s.cl) : null, fluor_mg_l: p.poco ? dec(s.fl) : null,
        foto_anexada: !!s.foto, observacao: obs, operador: op
      });
    }, function () {
      // O campo de observações não fica no estado do app: lê antes de a tela mudar.
      var el = document.getElementById('obs');
      return el && el.value.trim() ? el.value.trim().slice(0, 1000) : null;
    }, function (s) {
      // Na confirmação, o volume usa a leitura anterior real (do banco).
      var tot = num(s.tot), last = (s.dbLast || {})[p.id];
      var txt = !last ? 'Primeira leitura do ponto' : tot - last.tot < 0 ? 'Conferir leitura' : fmt(tot - last.tot) + ' m³';
      var cur = comp.state.last;
      if (cur && cur.rows) {
        comp.state.last = Object.assign({}, cur, { rows: cur.rows.map(function (r) {
          return r.k === 'Volume no intervalo' ? { k: r.k, v: txt } : r;
        }) });
      }
    });

    aoSalvar(comp, v.on, 'saveEstoque', foiParaConfirmacao, function (s) {
      return inserir('estoque_poco', {
        ponto_id: p.id, ponto_nome: p.name,
        hipoclorito_l: dec(s.hip), acido_fluossilicico_l: dec(s.aci), operador: op
      });
    });

    aoSalvar(comp, v.on, 'saveCal', foiParaConfirmacao, function (s) {
      return inserir('calibracoes_eta', { leituras: soPreenchidos(s.calv, dec), operador: op });
    });

    aoSalvar(comp, v.on, 'saveEtaStock', foiParaConfirmacao, function (s) {
      var niveis = Object.assign({}, s.dbEtaPrev || {}, soPreenchidos(s.lev, num));
      return inserir('estoque_eta', { niveis_l: niveis, operador: op });
    });

    aoSalvar(comp, v.on, 'saveDesc', foiParaConfirmacao, function (s) {
      return inserir('descarregamentos_quimicos', {
        produto: s.prod, eta: s.descEta, quantidade_kg: num(s.descKg), operador: op
      });
    });

    var ANALISES_ETE = ['an-ph-b', 'an-ph-t', 'an-temp-b', 'an-temp-t', 'an-od-b', 'an-od-t',
      'an-sol-b', 'an-sol-t', 'an-dqo-p', 'an-dqo-b', 'an-dqo-t'];
    aoSalvar(comp, v.on, 'saveEte', foiParaConfirmacao, function (s, analises) {
      var obs = {};
      Object.keys(s.chk || {}).forEach(function (k) {
        if (s.chk[k] === 'nc' && s.chkObs && s.chkObs[k]) obs[k] = String(s.chkObs[k]).slice(0, 500);
      });
      return inserir('visitas_ete', {
        ete: s.selEte, vazao_m3h: dec(s.eteVaz), checklist: s.chk, observacoes: obs,
        analises_realizadas: s.anal === true, analises: s.anal === true ? analises : null, operador: op
      });
    }, function () {
      // As análises da ETE não ficam no estado do app: lê dos campos antes de a tela mudar.
      var out = {};
      ANALISES_ETE.forEach(function (id) {
        var el = document.getElementById(id);
        var n = el ? dec(el.value) : null;
        if (n != null) out[id.replace(/^an-/, '')] = n;
      });
      return out;
    });

    if (v.col) {
      aoSalvar(comp, v.col.cn, 'save', foiParaConfirmacao, function (s) {
        var ad = comp.colAddrs()[s.cn.loc];
        return inserir('coletas', {
          endereco: ad.addr, bairro: ad.bairro, sistema: ad.sys,
          cloro_mg_l: dec(s.cn.cl), observacao: (s.cn.obs || '').trim() || null, coletor: op
        });
      });
      var camposAnalise = function (an) {
        return {
          fluor_mg_l: dec(an.fl), ph: dec(an.ph), cor_uh: dec(an.cor), turbidez_ut: dec(an.tur),
          coliformes_totais: an.ct || null, coliformes_termotolerantes: an.cte || null
        };
      };
      aoSalvar(comp, v.col.an, 'savePartial', function (novo) { return novo.screen === 'coleta'; }, function (s) {
        return alterar('coletas', s.an.id, camposAnalise(s.an));
      });
      aoSalvar(comp, v.col.an, 'conclude', foiParaConfirmacao, function (s) {
        return alterar('coletas', s.an.id, Object.assign(camposAnalise(s.an), {
          status: 'concluida', analista: op, concluida_em: new Date().toISOString()
        }));
      });
    }

    if (v.ds) {
      aoSalvar(comp, v.ds.cn, 'save', foiParaConfirmacao, function (s) {
        var pt = comp.dscPoints()[s.dn.loc];
        var ini = hojeAs(s.dn.ini), fim = hojeAs(s.dn.fim);
        var terminou = !!fim && Date.parse(fim) > Date.parse(ini);
        var min = terminou ? (Date.parse(fim) - Date.parse(ini)) / 60000 : 0;
        return inserir('descargas_rede', {
          endereco: pt[0], bairro: pt[1], sistema: pt[2], dn_mm: pt[3],
          inicio_em: ini, fim_em: terminou ? fim : null,
          volume_m3: terminou ? VAZAO_DN[pt[3]] * min / 60 : null,
          observacao: (s.dn.obs || '').trim() || null,
          status: terminou ? 'concluida' : 'andamento', operador: op
        });
      });
      aoSalvar(comp, v.ds.ef, 'save', foiParaConfirmacao, async function (s) {
        var rr = s.dscRun.find(function (r) { return r.id === s.dfId; }) || s.dscRun[0];
        var atual = await q(sb.from('descargas_rede').select('inicio_em,dn_mm').eq('id', rr.id).single());
        var fim = hojeAs(s.dfFim);
        var min = (Date.parse(fim) - Date.parse(atual.inicio_em)) / 60000;
        return alterar('descargas_rede', rr.id, {
          fim_em: fim, volume_m3: (VAZAO_DN[atual.dn_mm] || 0) * min / 60, status: 'concluida'
        });
      });
    }
  }

  // ---------- instalação na tela do app ----------
  var atual = null;
  function install(cls) {
    var montar = cls.prototype.componentDidMount;
    cls.prototype.componentDidMount = function () {
      if (montar) montar.call(this);
      atual = this;
      // Tira os dados de exemplo até o banco responder.
      this.setState({
        done: {}, etaDone: {}, eteDone: {}, descLast: null, dbLast: {}, dbEtaPrev: {}, alertas: [],
        colPend: [], colDone: { eta: 0, sj: 0, mor: 0, pac: 0 }, colHist: [],
        dscRun: [], dscToday: [], dscMonthN: 0, dscMonthVol: 0
      });
      atualizar(this);
      setTimeout(function () {
        var el = document.getElementById('lg-user');
        if (el && !el.value) el.value = storeGet(OP_KEY) || '';
      }, 0);
    };
    var render = cls.prototype.renderVals;
    cls.prototype.renderVals = function () {
      var v = render.call(this);
      try { decorar(this, v); } catch (e) { console.error(e); }
      return v;
    };
  }

  // Ao voltar para o app (outra aba, celular desbloqueado), busca o que outros operadores lançaram.
  document.addEventListener('visibilitychange', function () {
    if (document.visibilityState === 'visible' && atual && document.body.contains(document.getElementById('app'))) atualizar(atual);
  });

  window.DB = { client: sb, install: install, operador: operador, toast: toast };
})();
