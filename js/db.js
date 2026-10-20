/* Conexão do app e do sistema web com o Supabase.
 *
 * As telas continuam como estão; este arquivo:
 *  - faz o login (login + senha) e guarda a sessão no aparelho;
 *  - libera no app só os blocos permitidos para a conta, e o sistema web só para quem tem acesso;
 *  - carrega do banco o que já foi lançado (hoje, pendências e totais do mês) e substitui os dados de exemplo;
 *  - grava no banco cada formulário salvo;
 *  - liga a tela "Usuários e permissões" aos perfis reais.
 *
 * Uso: DB.install(PAGES.Main.cls) antes de montar o app; no sistema web, DB.guardWeb(iniciar).
 */
(function () {
  'use strict';

  var env = window.ENV || {};
  if (!window.supabase || !env.SUPABASE_URL || !env.SUPABASE_PUBLISHABLE_KEY) {
    console.warn('Supabase não configurado: o app vai rodar só com dados de exemplo.');
    return;
  }
  var sb = window.supabase.createClient(env.SUPABASE_URL, env.SUPABASE_PUBLISHABLE_KEY, {
    auth: { persistSession: true, autoRefreshToken: true, storageKey: 'gsinima.sessao' }
  });

  // ---------- utilidades ----------
  var LOGIN_KEY = 'gsinima.login';
  function storeGet(k) { try { return localStorage.getItem(k); } catch (e) { return null; } }
  function storeSet(k, v) { try { localStorage.setItem(k, v); } catch (e) { /* sem armazenamento */ } }

  // ---------- login e perfil ----------
  // O login (ex.: felipe.altafini) vira um e-mail interno no Supabase Auth; nenhum e-mail é enviado.
  var DOMINIO_LOGIN = 'usuarios.gsinima.local';
  var BLOCOS = ['eta', 'ete', 'poco', 'coleta', 'descarga'];
  var PAPEIS = { operador: 'Operador', lab: 'Laboratório', super: 'Supervisor', admin: 'Administrador' };
  var perfil = null;

  function operador() { return perfil ? perfil.nome : 'Operador'; }
  function papelTxt() { return perfil ? (PAPEIS[perfil.papel] || perfil.papel) : ''; }
  function podeWeb() { return !!(perfil && perfil.permissoes && perfil.permissoes.web && perfil.permissoes.web.acesso); }
  function blocosLiberados(p) {
    var acc = {};
    BLOCOS.forEach(function (k) { acc[k] = !!(p && p.permissoes && p.permissoes[k] && p.permissoes[k].on); });
    return acc;
  }

  async function carregarPerfil() {
    var s = await sb.auth.getSession();
    var sessao = s.data && s.data.session;
    if (!sessao) { perfil = null; return null; }
    var r = await sb.from('perfis').select('*').eq('id', sessao.user.id).maybeSingle();
    if (r.error) throw r.error;
    perfil = r.data || null;
    if (!perfil || !perfil.ativo) {
      await sb.auth.signOut();
      perfil = null;
      throw new Error(!r.data ? 'usuário sem perfil cadastrado, fale com o administrador' : 'conta desativada, fale com o administrador');
    }
    return perfil;
  }

  async function entrar(login, senha) {
    login = String(login || '').trim().toLowerCase();
    if (!login || !senha) throw new Error('Preencha o login e a senha.');
    var r = await sb.auth.signInWithPassword({ email: login + '@' + DOMINIO_LOGIN, password: senha });
    if (r.error) {
      if (/invalid/i.test(r.error.message)) throw new Error('Login ou senha incorretos.');
      throw r.error;
    }
    storeSet(LOGIN_KEY, login);
    var p = await carregarPerfil();
    sb.rpc('registrar_acesso').then(function () {}, function () {});
    return p;
  }

  async function sair() {
    try { await sb.auth.signOut(); } catch (e) { /* já saiu */ }
    perfil = null;
  }

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
    if (!perfil) return Promise.resolve();
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
    v.opPapel = papelTxt();
    v.alertas = st.alertas || [];
    v.semAlertas = !!st.dbOk && v.alertas.length === 0;

    // Tela de entrada: login e senha. Só entra no app depois que o Supabase confirma.
    if (v.nav && typeof v.nav.home === 'function') {
      var home = v.nav.home;
      v.nav.home = function () {
        if (comp.state.screen !== 'login') return home.apply(this, arguments);
        if (entrando) return;
        var u = document.getElementById('lg-user'), s = document.getElementById('lg-pass');
        var self = this, args = arguments;
        entrando = true;
        entrar(u ? u.value : '', s ? s.value : '').then(function (p) {
          if (s) s.value = '';
          if (toastEl) toastEl.hidden = true;
          comp.setState({ acc: blocosLiberados(p) });
          home.apply(self, args);
          atualizar(comp);
        }, function (err) {
          toast(err && err.message && !/fetch/i.test(err.message) ? err.message : 'Não foi possível entrar (' + erroTxt(err) + ').');
        }).then(function () { entrando = false; });
      };
    }

    // Botão "Sair" do perfil: encerra a sessão antes de voltar à tela de entrada.
    if (v.nav && typeof v.nav.login === 'function') {
      var paraLogin = v.nav.login;
      v.nav.login = function () {
        var self = this, args = arguments;
        sair().then(function () { paraLogin.apply(self, args); });
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
  var atual = null, entrando = false;
  function install(cls) {
    var montar = cls.prototype.componentDidMount;
    cls.prototype.componentDidMount = function () {
      if (montar) montar.call(this);
      var comp = this;
      atual = comp;
      // Tira os dados de exemplo e esconde os blocos até saber quem está logado.
      comp.setState({
        acc: blocosLiberados(null),
        done: {}, etaDone: {}, eteDone: {}, descLast: null, dbLast: {}, dbEtaPrev: {}, alertas: [],
        colPend: [], colDone: { eta: 0, sj: 0, mor: 0, pac: 0 }, colHist: [],
        dscRun: [], dscToday: [], dscMonthN: 0, dscMonthVol: 0
      });
      // Sessão guardada no aparelho: entra direto.
      carregarPerfil().then(function (p) {
        if (!p) return;
        comp.setState({ acc: blocosLiberados(p), screen: comp.state.screen === 'login' ? 'home' : comp.state.screen });
        atualizar(comp);
      }, function (err) { toast('Entre de novo: ' + erroTxt(err) + '.'); });
      setTimeout(function () {
        var u = document.getElementById('lg-user'), s = document.getElementById('lg-pass');
        if (u && !u.value) u.value = storeGet(LOGIN_KEY) || '';
        // Enter na senha = Entrar.
        if (s && !s.__enter) {
          s.__enter = true;
          s.addEventListener('keydown', function (e) {
            if (e.key !== 'Enter') return;
            var b = Array.prototype.find.call(document.querySelectorAll('#app button'), function (x) { return x.textContent.trim() === 'Entrar'; });
            if (b) b.click();
          });
        }
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

  // ---------- sistema web: entrada e controle de acesso ----------
  var COR = { fundo: '#EEF3F7', azul: '#0057A8', marinho: '#0A2E5C', texto: '#52627A', borda: '#C7D4E2' };
  function cartao(html) {
    var shell = document.getElementById('shell');
    shell.innerHTML = '<div style="min-height:100vh;display:flex;align-items:center;justify-content:center;padding:24px 16px;box-sizing:border-box;background:' + COR.fundo + ';font-family:\'Atkinson Hyperlegible\',system-ui,sans-serif">' +
      '<div style="width:100%;max-width:380px;background:#fff;border-radius:22px;padding:28px 24px;box-sizing:border-box;box-shadow:0 20px 60px rgba(10,46,92,.12);display:flex;flex-direction:column;gap:14px">' +
      '<h1 style="margin:0;font-family:\'Bricolage Grotesque\',sans-serif;font-weight:800;font-size:26px;color:' + COR.marinho + '">Sistema Ourinhos Saneamento</h1>' +
      html + '</div></div>';
    return shell;
  }
  var campo = 'height:50px;border:1.5px solid ' + COR.borda + ';border-radius:14px;padding:0 14px;font-size:16px;font-family:inherit;width:100%;box-sizing:border-box';
  var botao = 'height:52px;border:0;border-radius:16px;background:' + COR.azul + ';color:#fff;font-size:16px;font-weight:700;cursor:pointer;font-family:inherit';

  function telaLogin(iniciar, aviso) {
    var shell = cartao(
      '<p style="margin:0;color:' + COR.texto + '">Entre com seu login e senha.</p>' +
      '<form id="wl-form" style="display:flex;flex-direction:column;gap:12px">' +
      '<label for="wl-user" style="font-weight:700;font-size:14px;color:' + COR.marinho + '">Login</label>' +
      '<input id="wl-user" autocomplete="username" autocapitalize="none" spellcheck="false" placeholder="Ex.: nome.sobrenome" style="' + campo + '">' +
      '<label for="wl-pass" style="font-weight:700;font-size:14px;color:' + COR.marinho + '">Senha</label>' +
      '<input id="wl-pass" type="password" autocomplete="current-password" style="' + campo + '">' +
      '<p id="wl-msg" role="alert" style="margin:0;color:#8C1D18;font-size:14px;min-height:1em"></p>' +
      '<button type="submit" style="' + botao + '">Entrar</button>' +
      '</form>' +
      '<p style="margin:0;color:' + COR.texto + ';font-size:13px">Esqueceu a senha? Fale com o administrador do sistema.</p>');
    var u = shell.querySelector('#wl-user'), s = shell.querySelector('#wl-pass'), msg = shell.querySelector('#wl-msg');
    u.value = storeGet(LOGIN_KEY) || '';
    msg.textContent = aviso || '';
    (u.value ? s : u).focus();
    shell.querySelector('#wl-form').addEventListener('submit', function (e) {
      e.preventDefault();
      var b = shell.querySelector('button[type=submit]');
      b.disabled = true; b.textContent = 'Entrando…'; msg.textContent = '';
      entrar(u.value, s.value).then(function () {
        if (!podeWeb()) return semAcesso();
        abrirWeb(iniciar);
      }, function (err) {
        msg.textContent = err && err.message && !/fetch/i.test(err.message) ? err.message : 'Não foi possível entrar (' + erroTxt(err) + ').';
        b.disabled = false; b.textContent = 'Entrar'; s.value = ''; s.focus();
      });
    });
  }

  function semAcesso() {
    var shell = cartao(
      '<p style="margin:0;color:' + COR.marinho + ';font-weight:700">Olá, ' + operador().replace(/[<>&"]/g, '') + '.</p>' +
      '<p style="margin:0;color:' + COR.texto + '">Sua conta não tem acesso ao sistema web. Use o app do operador para fazer seus lançamentos.</p>' +
      '<a href="/app/" style="' + botao + ';display:flex;align-items:center;justify-content:center;text-decoration:none">Abrir o app</a>' +
      '<button type="button" id="wl-sair" style="' + botao + ';background:#fff;color:' + COR.marinho + ';border:1.5px solid ' + COR.borda + '">Sair</button>');
    shell.querySelector('#wl-sair').addEventListener('click', function () { sair().then(function () { location.reload(); }); });
  }

  // Cabeçalho das telas web: nome e perfil de quem está logado; clicar oferece sair.
  var webInstalado = false;
  function abrirWeb(iniciar) {
    if (!webInstalado && window.PAGES) {
      webInstalado = true;
      Object.keys(window.PAGES).forEach(function (k) {
        if (k === 'Main') return;
        var cls = window.PAGES[k].cls, render = cls.prototype.renderVals;
        cls.prototype.renderVals = function () {
          var v = render.call(this);
          v.me = {
            nome: operador(), papel: papelTxt(), ini: operador().charAt(0).toUpperCase(),
            sair: function () { if (window.confirm('Sair da conta de ' + operador() + '?')) sair().then(function () { location.reload(); }); }
          };
          return v;
        };
      });
    }
    iniciar();
  }

  function guardWeb(iniciar) {
    cartao('<p style="margin:0;color:' + COR.texto + '">Carregando…</p>');
    carregarPerfil().then(function (p) {
      if (!p) return telaLogin(iniciar);
      sb.rpc('registrar_acesso').then(function () {}, function () {});
      if (!podeWeb()) return semAcesso();
      abrirWeb(iniciar);
    }, function (err) { telaLogin(iniciar, 'Entre de novo: ' + erroTxt(err) + '.'); });
  }

  // ---------- tela "Usuários e permissões" ----------
  function permCompleta(p) {
    var x = JSON.parse(JSON.stringify(p || {}));
    x.web = Object.assign({ acesso: false, painelVer: false, painelExp: false, imp: false, exp: false, admin: false }, x.web || {});
    return x;
  }
  function instalarAdmin(cls) {
    var montar = cls.prototype.componentDidMount;
    cls.prototype.componentDidMount = function () {
      if (montar) montar.call(this);
      var comp = this;
      var vazio = { id: '_', name: 'Carregando…', email: '', role: 'operador', last: '', active: true };
      comp.setState({ users: [vazio], perms: { _: permCompleta(comp.preset('operador')) }, sel: '_', saved: false });
      sb.from('perfis').select('*').order('nome').then(function (r) {
        if (r.error) { toast('Não foi possível carregar os usuários (' + erroTxt(r.error) + ').'); return; }
        var users = r.data.map(function (p) {
          return { id: p.id, name: p.nome, email: p.login, role: p.papel, last: p.ultimo_acesso ? quando(p.ultimo_acesso) : 'nunca entrou', active: p.ativo };
        });
        if (!users.length) return;
        var perms = {};
        r.data.forEach(function (p) { perms[p.id] = permCompleta(p.permissoes); });
        var sel = users.some(function (u) { return u.id === comp.state.sel; }) ? comp.state.sel : users[0].id;
        comp.setState({ users: users, perms: perms, sel: sel, saved: false, dbUsers: r.data });
      });
    };
    var render = cls.prototype.renderVals;
    cls.prototype.renderVals = function () {
      var comp = this, v = render.call(this);
      var salvar = v.save;
      v.save = function () {
        var st = comp.state;
        if (!st.dbUsers) return;
        // Proteção: ninguém tira de si mesmo o acesso de administrador nem desativa a própria conta.
        var eu = perfil && st.users.find(function (u) { return u.id === perfil.id; });
        if (eu && (!eu.active || !st.perms[eu.id].web.admin || !st.perms[eu.id].web.acesso)) {
          toast('Você não pode tirar o seu próprio acesso de administrador nem desativar a sua conta.');
          return;
        }
        var mudou = st.users.filter(function (u) {
          var orig = st.dbUsers.find(function (p) { return p.id === u.id; });
          return orig && (orig.papel !== u.role || orig.ativo !== u.active || JSON.stringify(permCompleta(orig.permissoes)) !== JSON.stringify(st.perms[u.id]));
        });
        if (!mudou.length) { salvar.apply(this, arguments); return; }
        Promise.all(mudou.map(function (u) {
          return q(sb.from('perfis').update({ papel: u.role, ativo: u.active, permissoes: st.perms[u.id] }).eq('id', u.id).select('*'));
        })).then(function (res) {
          if (res.some(function (rows) { return !rows || !rows.length; })) throw new Error('só administradores podem alterar permissões');
          var dbUsers = st.dbUsers.map(function (p) {
            var nova = null;
            res.forEach(function (rows) { if (rows[0].id === p.id) nova = rows[0]; });
            return nova || p;
          });
          comp.setState({ dbUsers: dbUsers, saved: true });
          toast('Permissões salvas.', 'ok');
        }).catch(function (err) {
          toast('As alterações NÃO foram salvas (' + erroTxt(err) + ').');
        });
      };
      return v;
    };
  }

  window.DB = {
    client: sb, install: install, guardWeb: guardWeb, instalarAdmin: instalarAdmin,
    operador: operador, toast: toast
  };
})();
