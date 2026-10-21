/* Conexão do app e do sistema web com o Supabase.
 *
 * As telas continuam como estão; este arquivo:
 *  - faz o login (login + senha) e guarda a sessão no aparelho;
 *  - libera no app só os blocos permitidos para a conta e, no computador, só as telas permitidas;
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
  function storeGet(k) { try { return localStorage.getItem(k); } catch (e) { return null; } }
  function storeSet(k, v) { try { localStorage.setItem(k, v); } catch (e) { /* sem armazenamento */ } }
  try { localStorage.removeItem('gsinima.login'); localStorage.removeItem('gsinima.entrada'); } catch (e) { /* sem armazenamento */ }

  // ---------- login e perfil ----------
  // O login (ex.: felipe.altafini) vira um e-mail interno no Supabase Auth; nenhum e-mail é enviado.
  var DOMINIO_LOGIN = 'usuarios.gsinima.local';
  var BLOCOS = ['eta', 'ete', 'poco', 'coleta', 'descarga'];
  var PAPEIS = { operador: 'Operador', lab: 'Laboratório', super: 'Supervisor', admin: 'Administrador' };
  var perfil = null;

  function operador() { return perfil ? perfil.nome : 'Operador'; }
  function papelTxt() { return perfil ? (PAPEIS[perfil.papel] || perfil.papel) : ''; }
  function blocosLiberados(p) {
    var acc = {};
    BLOCOS.forEach(function (k) { acc[k] = !!(p && p.permissoes && p.permissoes[k] && p.permissoes[k].on); });
    return acc;
  }

  async function carregarPerfil() {
    var s = await sb.auth.getSession();
    var sessao = s.data && s.data.session;
    if (!sessao) { perfil = null; return null; }
    var r = await sb.from('perfis').select('*').eq('usuario_id', sessao.user.id).maybeSingle();
    if (r.error) throw r.error;
    perfil = r.data || null;
    if (!perfil || !perfil.ativo) {
      await sb.auth.signOut();
      perfil = null;
      throw new Error(!r.data ? 'usuário sem perfil cadastrado, fale com o administrador' : 'conta desativada, fale com o administrador');
    }
    atualizarFotoUrl().then(function () {}, function () {});
    return perfil;
  }

  async function entrar(login, senha) {
    login = String(login || '').trim().toLowerCase();
    if (!login || !senha) throw new Error('Preencha o login e a senha.');
    var r = await sb.auth.signInWithPassword({ email: login + '@' + DOMINIO_LOGIN, password: senha });
    if (r.error) {
      if (/invalid/i.test(r.error.message)) {
        var e = new Error('Login ou senha incorretos.');
        e.credenciais = true;
        throw e;
      }
      throw r.error;
    }
    storeSet('gsinima.web.atividade', String(Date.now()));
    var p = await carregarPerfil();
    sb.rpc('registrar_acesso').then(function () {}, function () {});
    return p;
  }

  // Primeiro acesso: login cadastrado pelo administrador e ainda sem senha.
  // A pessoa digita o login e a senha que quer; confirmamos a senha e a conta é criada na hora.
  async function chamarPrimeiroAcesso(corpo) {
    var r = await sb.functions.invoke('primeiro-acesso', { body: corpo });
    if (r.error) {
      var msg = 'não foi possível falar com o servidor';
      try { var j = await r.error.context.json(); if (j && j.erro) msg = j.erro; } catch (e) { /* sem corpo */ }
      throw new Error(msg);
    }
    return r.data || {};
  }

  async function entrarOuPrimeiroAcesso(login, senha) {
    try {
      return await entrar(login, senha);
    } catch (err) {
      if (!err.credenciais) throw err;
      login = String(login || '').trim().toLowerCase();
      var v = await chamarPrimeiroAcesso({ acao: 'verificar', login: login }).catch(function () { return {}; });
      if (!v.pendente) throw err;
      if (String(senha).length < 8) throw new Error('Primeiro acesso: escolha uma senha com pelo menos 8 caracteres.');
      var conf = await confirmarSenha();
      if (conf === null) throw new Error('Primeiro acesso cancelado. Sua senha ainda não foi criada.');
      if (conf !== senha) throw new Error('As senhas não conferem. Digite de novo a senha que você quer usar.');
      await chamarPrimeiroAcesso({ acao: 'criar', login: login, senha: senha });
      var p = await entrar(login, senha);
      toast('Senha criada. Bem-vindo(a), ' + p.nome + '!', 'ok');
      return p;
    }
  }

  // Janela para confirmar a senha no primeiro acesso (fica fora das telas do app).
  function confirmarSenha() {
    return new Promise(function (resolve) {
      var fundo = document.createElement('div');
      fundo.style.cssText = 'position:fixed;inset:0;background:rgba(10,46,92,.45);display:flex;align-items:center;justify-content:center;padding:16px;z-index:9998;font-family:\'Inter\',system-ui,sans-serif';
      fundo.innerHTML =
        '<form role="dialog" aria-modal="true" aria-labelledby="pa-tit" style="width:100%;max-width:360px;background:#fff;border-radius:22px;padding:22px;box-sizing:border-box;display:flex;flex-direction:column;gap:12px">' +
        '<h2 id="pa-tit" style="margin:0;font-family:\'Inter\',sans-serif;font-size:22px;color:#0A2E5C">Primeiro acesso</h2>' +
        '<p style="margin:0;color:#52627A;font-size:15px">Este é o seu primeiro acesso. A senha que você digitou será a sua senha. Digite-a de novo para confirmar.</p>' +
        '<label for="pa-conf" style="font-weight:700;font-size:14px;color:#0A2E5C">Confirme a senha</label>' +
        '<input id="pa-conf" type="password" autocomplete="new-password" style="height:52px;border:1.5px solid #C7D4E2;border-radius:14px;padding:0 16px;font-size:17px">' +
        '<button type="submit" style="height:52px;border:0;border-radius:16px;background:#0057A8;color:#fff;font-size:16px;font-weight:700;cursor:pointer">Criar senha e entrar</button>' +
        '<button type="button" id="pa-cancel" style="height:46px;border:1.5px solid #C7D4E2;border-radius:14px;background:#fff;color:#0A2E5C;font-size:15px;font-weight:700;cursor:pointer">Cancelar</button>' +
        '</form>';
      document.body.appendChild(fundo);
      var campoConf = fundo.querySelector('#pa-conf');
      campoConf.focus();
      var fim = function (v) { fundo.remove(); resolve(v); };
      fundo.querySelector('form').addEventListener('submit', function (e) { e.preventDefault(); e.stopPropagation(); fim(campoConf.value); });
      fundo.querySelector('#pa-cancel').addEventListener('click', function () { fim(null); });
      fundo.addEventListener('keydown', function (e) { if (e.key === 'Escape') fim(null); });
    });
  }

  async function sair() {
    try { await sb.auth.signOut(); } catch (e) { /* já saiu */ }
    perfil = null;
    fotoUrl = null; fotoDe = null;
  }

  // ---------- foto de perfil e iniciais ----------
  // Iniciais do login: "felipe.altafini" -> "FA".
  function iniciais() {
    var partes = String((perfil && perfil.login) || operador()).split(/[._\s-]+/).filter(Boolean);
    return ((partes[0] || '?').charAt(0) + (partes.length > 1 ? partes[partes.length - 1].charAt(0) : '')).toUpperCase();
  }
  function primeiroNome() { return operador().trim().split(/\s+/)[0]; }

  // A foto fica numa pasta privada do Storage; para mostrar, gera um link temporário (24 h).
  var fotoUrl = null, fotoDe = null, telasParaAtualizar = [];
  // Telas abertas que mostram a foto (as últimas montadas); redesenhadas quando a foto muda.
  function aoMudarFoto(comp) {
    if (telasParaAtualizar.indexOf(comp) >= 0) return;
    telasParaAtualizar.push(comp);
    if (telasParaAtualizar.length > 4) telasParaAtualizar.shift();
  }
  function redesenhar() { telasParaAtualizar.forEach(function (c) { c.forceUpdate(); }); }
  function atualizarFotoUrl() {
    var caminho = perfil && perfil.foto;
    if (!caminho) { if (fotoUrl) { fotoUrl = null; fotoDe = null; redesenhar(); } return Promise.resolve(); }
    if (caminho === fotoDe && fotoUrl) return Promise.resolve();
    return sb.storage.from('avatares').createSignedUrl(caminho, 86400).then(function (r) {
      fotoUrl = r.data ? r.data.signedUrl : null;
      fotoDe = caminho;
      redesenhar();
    });
  }

  // Recorta no centro em quadrado de 320 px e gera JPEG (fica leve, uns 30 KB).
  function prepararFoto(arquivo) {
    return new Promise(function (resolve, reject) {
      if (!/^image\/(jpeg|png|webp)$/.test(arquivo.type)) return reject(new Error('use uma imagem JPG, PNG ou WebP'));
      var img = new Image(), url = URL.createObjectURL(arquivo);
      img.onload = function () {
        var lado = Math.min(img.naturalWidth, img.naturalHeight), T = 320;
        var c = document.createElement('canvas'); c.width = T; c.height = T;
        c.getContext('2d').drawImage(img, (img.naturalWidth - lado) / 2, (img.naturalHeight - lado) / 2, lado, lado, 0, 0, T, T);
        URL.revokeObjectURL(url);
        c.toBlob(function (b) { b ? resolve(b) : reject(new Error('não foi possível ler a imagem')); }, 'image/jpeg', 0.85);
      };
      img.onerror = function () { URL.revokeObjectURL(url); reject(new Error('não foi possível ler a imagem')); };
      img.src = url;
    });
  }

  var enviandoFoto = false;
  function trocarFoto() {
    if (enviandoFoto || !perfil) return;
    var input = document.createElement('input');
    input.type = 'file';
    input.accept = 'image/jpeg,image/png,image/webp';
    input.addEventListener('change', function () {
      var arq = input.files && input.files[0];
      if (!arq) return;
      enviandoFoto = true; redesenhar();
      var antigo = perfil.foto;
      var caminho;
      sb.auth.getUser().then(function (u) {
        if (!u.data || !u.data.user) throw new Error('entre de novo');
        caminho = u.data.user.id + '/' + Date.now() + '.jpg';
        return prepararFoto(arq);
      }).then(function (blob) {
        return sb.storage.from('avatares').upload(caminho, blob, { contentType: 'image/jpeg', upsert: false });
      }).then(function (r) {
        if (r.error) throw r.error;
        return sb.rpc('definir_minha_foto', { caminho: caminho });
      }).then(function (r) {
        if (r.error) throw r.error;
        perfil.foto = caminho;
        if (antigo) sb.storage.from('avatares').remove([antigo]).then(function () {}, function () {});
        return atualizarFotoUrl();
      }).then(function () {
        toast('Foto atualizada.', 'ok');
      }).catch(function (err) {
        toast('A foto NÃO foi trocada (' + erroTxt(err) + ').');
      }).then(function () { enviandoFoto = false; redesenhar(); });
    });
    input.click();
  }

  function fotoPadrao() {
    if (!perfil || !perfil.foto || enviandoFoto) return;
    var antigo = perfil.foto;
    sb.rpc('definir_minha_foto', { caminho: null }).then(function (r) {
      if (r.error) throw r.error;
      perfil.foto = null;
      sb.storage.from('avatares').remove([antigo]).then(function () {}, function () {});
      return atualizarFotoUrl();
    }).then(function () {
      toast('Pronto: no lugar da foto aparecem as suas iniciais (' + iniciais() + ').', 'ok');
    }).catch(function (err) {
      toast('Não foi possível tirar a foto (' + erroTxt(err) + ').');
    });
  }

  // Valores de foto e iniciais para as telas (app: prefixo "op"; web: dentro de "me").
  function valoresFoto() {
    var tem = !!(perfil && perfil.foto && fotoUrl);
    return {
      ini: iniciais(), foto: tem ? fotoUrl : '', temFoto: tem, semFoto: !tem,
      trocarTxt: enviandoFoto ? 'Enviando foto…' : tem ? 'Alterar foto' : 'Escolher foto',
      padraoOp: tem ? 1 : 0.45
    };
  }

  // ---------- alterar a própria senha (sistema web) ----------
  var trocandoSenha = false;
  function alterarSenha() {
    if (trocandoSenha || !perfil) return;
    var atual = document.getElementById('pf-atual'), nova = document.getElementById('pf-nova'), conf = document.getElementById('pf-conf');
    if (!atual || !nova || !conf) return;
    if (!atual.value) { toast('Digite a sua senha atual.'); atual.focus(); return; }
    if (nova.value.length < 8) { toast('A nova senha precisa ter pelo menos 8 caracteres.'); nova.focus(); return; }
    if (nova.value.length > 72) { toast('A nova senha pode ter no máximo 72 caracteres.'); nova.focus(); return; }
    if (nova.value !== conf.value) { toast('A confirmação não confere com a nova senha.'); conf.focus(); return; }
    if (nova.value === atual.value) { toast('A nova senha precisa ser diferente da atual.'); nova.focus(); return; }
    trocandoSenha = true; redesenhar();
    // Confere a senha atual entrando de novo; só então troca.
    sb.auth.signInWithPassword({ email: perfil.login + '@' + DOMINIO_LOGIN, password: atual.value }).then(function (r) {
      if (r.error) throw new Error(/invalid/i.test(r.error.message) ? 'a senha atual não confere' : r.error.message);
      return sb.auth.updateUser({ password: nova.value });
    }).then(function (r) {
      if (r.error) throw new Error(/different|same/i.test(r.error.message) ? 'a nova senha precisa ser diferente da atual' :
        /weak|short|characters/i.test(r.error.message) ? 'a nova senha é fraca demais' : r.error.message);
      atual.value = ''; nova.value = ''; conf.value = '';
      toast('Senha alterada. Use a nova senha no próximo acesso.', 'ok');
    }).catch(function (err) {
      toast('A senha NÃO foi alterada (' + (err && err.message ? err.message : erroTxt(err)) + ').');
    }).then(function () { trocandoSenha = false; redesenhar(); });
  }

  // ---------- sair com confirmação no centro da tela ----------
  function confirmarSaida() {
    if (document.getElementById('cs-fundo')) return;
    var fundo = document.createElement('div');
    fundo.id = 'cs-fundo';
    fundo.style.cssText = 'position:fixed;inset:0;background:rgba(10,46,92,.45);display:flex;align-items:center;justify-content:center;padding:16px;z-index:9998;font-family:\'Inter\',system-ui,sans-serif';
    fundo.innerHTML =
      '<div role="alertdialog" aria-modal="true" aria-labelledby="cs-tit" aria-describedby="cs-txt" style="width:100%;max-width:380px;background:#fff;border-radius:22px;padding:24px;box-sizing:border-box;display:flex;flex-direction:column;gap:12px;text-align:center">' +
      '<span style="width:52px;height:52px;border-radius:50%;background:#FDECEA;color:#B42318;display:flex;align-items:center;justify-content:center;align-self:center">' +
      '<svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M15 4h4v16h-4"/><path d="M10 8l-4 4 4 4"/><path d="M6 12h10"/></svg></span>' +
      '<h2 id="cs-tit" style="margin:0;font-size:21px;font-weight:800;color:#0A2E5C">Sair da conta?</h2>' +
      '<p id="cs-txt" style="margin:0;color:#52627A;font-size:15px">Você vai precisar entrar de novo com login e senha.</p>' +
      '<div style="display:flex;gap:10px;margin-top:6px">' +
      '<button type="button" id="cs-nao" style="flex:1;height:46px;border:1.5px solid #C7D4E2;border-radius:12px;background:#fff;color:#0A2E5C;font:700 15px \'Inter\',sans-serif;cursor:pointer">Cancelar</button>' +
      '<button type="button" id="cs-sim" style="flex:1;height:46px;border:0;border-radius:12px;background:#B42318;color:#fff;font:700 15px \'Inter\',sans-serif;cursor:pointer">Sair</button>' +
      '</div></div>';
    document.body.appendChild(fundo);
    var fechar = function () { fundo.remove(); };
    fundo.querySelector('#cs-nao').addEventListener('click', fechar);
    fundo.addEventListener('click', function (e) { if (e.target === fundo) fechar(); });
    fundo.addEventListener('keydown', function (e) { if (e.key === 'Escape') fechar(); });
    fundo.querySelector('#cs-sim').addEventListener('click', function () {
      pararVigia();
      sair().then(function () { location.reload(); });
    });
    fundo.querySelector('#cs-nao').focus();
  }

  // ---------- submenu da conta (canto superior direito do sistema web) ----------
  var ICONES = {
    perfil: '<circle cx="12" cy="8" r="4"/><path d="M4 21a8 8 0 0 1 16 0"/>',
    config: '<circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1.1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1z"/>',
    sair: '<path d="M15 4h4v16h-4"/><path d="M10 8l-4 4 4 4"/><path d="M6 12h10"/>'
  };
  function fecharMenuConta() { var m = document.getElementById('menu-conta'); if (m) m.remove(); }
  // acoes (opcional): { perfil, config } para o app abrir as próprias telas; sem isso, vale o sistema web.
  function abrirMenuConta(ev, acoes) {
    acoes = acoes || {};
    if (document.getElementById('menu-conta')) { fecharMenuConta(); return; }
    var botao = ev && ev.currentTarget ? ev.currentTarget : null;
    var r = botao ? botao.getBoundingClientRect() : { bottom: 60, right: window.innerWidth - 16 };
    var menu = document.createElement('div');
    menu.id = 'menu-conta';
    menu.setAttribute('role', 'menu');
    menu.style.cssText = 'position:fixed;top:' + Math.round(r.bottom + 6) + 'px;right:' + Math.max(8, Math.round(window.innerWidth - r.right)) + 'px;' +
      'min-width:220px;background:#fff;border:1px solid #DDE5EE;border-radius:14px;box-shadow:0 14px 40px rgba(10,46,92,.16);padding:6px;z-index:9990;font-family:\'Inter\',system-ui,sans-serif';
    var item = function (id, rotulo, icone, cor) {
      return '<button type="button" role="menuitem" data-acao="' + id + '" style="width:100%;display:flex;align-items:center;gap:12px;height:44px;padding:0 12px;border:0;border-radius:10px;background:transparent;color:' + cor + ';font:600 15px \'Inter\',sans-serif;cursor:pointer;text-align:left">' +
        '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' + icone + '</svg>' + rotulo + '</button>';
    };
    menu.innerHTML = item('perfil', 'Perfil', ICONES.perfil, '#0A2E5C') + item('config', 'Configurações', ICONES.config, '#0A2E5C') +
      '<div style="height:1px;background:#DDE5EE;margin:4px 6px"></div>' + item('sair', 'Sair', ICONES.sair, '#B42318');
    document.body.appendChild(menu);
    Array.prototype.forEach.call(menu.querySelectorAll('button'), function (b) {
      b.addEventListener('mouseenter', function () { b.style.background = '#F2F6FA'; });
      b.addEventListener('mouseleave', function () { b.style.background = 'transparent'; });
      b.addEventListener('click', function () {
        var acao = b.getAttribute('data-acao');
        fecharMenuConta();
        if (acao === 'perfil') { if (acoes.perfil) acoes.perfil(); else if (window.DCRoute) window.DCRoute('WebPerfil'); }
        else if (acao === 'config') { if (acoes.config) acoes.config(); else if (window.DCRoute) window.DCRoute('WebConfig'); }
        else if (acao === 'sair') confirmarSaida();
      });
    });
    menu.querySelector('button').focus();
    // Fecha ao clicar fora, apertar Esc ou rolar a página.
    setTimeout(function () {
      var fora = function (e) { if (!menu.contains(e.target)) { fecharMenuConta(); limpar(); } };
      var tecla = function (e) { if (e.key === 'Escape') { fecharMenuConta(); limpar(); if (botao) botao.focus(); } };
      var limpar = function () {
        document.removeEventListener('pointerdown', fora, true);
        document.removeEventListener('keydown', tecla, true);
        window.removeEventListener('scroll', rolar, true);
      };
      var rolar = function () { fecharMenuConta(); limpar(); };
      document.addEventListener('pointerdown', fora, true);
      document.addEventListener('keydown', tecla, true);
      window.addEventListener('scroll', rolar, true);
    }, 0);
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
    toastTimer = setTimeout(function () { toastEl.hidden = true; }, err ? 7000 : Math.max(3000, msg.length * 70));
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
        .or('coliformes_totais.eq.P,coliformes_termotolerantes.eq.P').order('concluida_em', { ascending: false })),
      q(sb.from('descarregamentos_quimicos').select('produto,eta').gte('criado_em', t0)),
      q(sb.from('descarregamentos_pocos').select('lote_id,produto,quantidade_l,criado_em').order('criado_em', { ascending: false }).limit(50))
    ]);
    var estPoco = res[10], colPositivas = res[11], descHoje = res[12], pdRecentes = res[13];

    // Estoque dos poços lançado hoje (por ponto).
    var estDone = {};
    estPoco.forEach(function (r) { if (!estDone[r.ponto_id] && Date.parse(r.criado_em) >= Date.parse(t0)) estDone[r.ponto_id] = hhmm(r.criado_em); });
    // Último descarregamento nos poços (o lote mais recente, somado por produto).
    var pdLast = null;
    if (pdRecentes.length) {
      var lote = pdRecentes[0].lote_id, soma = {}, destinos = 0;
      pdRecentes.forEach(function (r) {
        if (r.lote_id !== lote) return;
        destinos++;
        var nome = r.produto === 'Hipoclorito de sódio' ? 'cloro' : 'flúor';
        soma[nome] = (soma[nome] || 0) + Number(r.quantidade_l);
      });
      pdLast = Object.keys(soma).map(function (k) { return fmt(soma[k]) + ' L de ' + k; }).join(' e ') + (destinos > 1 ? ', ' + destinos + ' destinos' : '');
    }
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
      alertas: alertas, estDone: estDone, pdLast: pdLast, descHoje: descHoje, diaCarregado: t0,
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
  // Envolve um botão de salvar: roda a lógica original do app (validação e montagem do resumo).
  // Se ela aceitou, em vez da tela de resumo aparece uma janela de confirmação com os dados;
  // ao confirmar, grava no banco e volta para a lista de onde a pessoa veio.
  // opcoes: { validar(st) -> mensagem de erro ou nada, limpar: campos zerados depois de enviar }
  function aoSalvar(comp, obj, key, aceito, gravar, antes, depois, opcoes) {
    if (!obj || typeof obj[key] !== 'function') return;
    var orig = obj[key];
    opcoes = opcoes || {};
    obj[key] = function () {
      var st = comp.state;
      if (opcoes.validar) {
        var problema = opcoes.validar(st);
        if (problema) { toast(problema); return; }
      }
      var extra = antes ? antes(st) : null;
      orig.apply(this, arguments);
      if (comp.state === st || !aceito(comp.state, st)) return;
      if (depois) depois(st, extra);
      var feito = comp.state;
      var resumo = feito.last || {};
      var enviar = function () {
        Promise.resolve().then(function () { return gravar(st, extra); }).then(function () {
          if (feito.screen === 'ok' && resumo.title) toast(resumo.title + '.', 'ok');
          return atualizar(comp);
        }, function (err) {
          console.error(err);
          toast('Atenção: o registro NÃO foi salvo no sistema (' + erroTxt(err) + '). Tente de novo.');
          return atualizar(comp);
        });
      };
      // Sem tela de resumo (ex.: "Salvar e terminar depois"): grava direto.
      if (feito.screen !== 'ok') { enviar(); return; }
      // Desfaz a ida para a tela de resumo: o formulário continua na tela, com os dados, atrás da janela.
      comp.state = st;
      comp.forceUpdate();
      confirmarEnvio(resumo).then(function (ok) {
        if (!ok) return;
        comp.state = Object.assign({}, feito, destinoApos(feito), opcoes.limpar || {});
        comp.forceUpdate();
        enviar();
      });
    };
  }
  var foiParaConfirmacao = function (novo) { return novo.screen === 'ok'; };

  // Depois de confirmar, volta para a lista de onde a pessoa veio (e não para o próximo da fila).
  function destinoApos(feito) {
    var ctx = feito.okCtx;
    if (ctx === 'etamac') return { screen: 'eta', block: 'eta', etaMode: 'mac', etaFilt: 'pend' };
    if (ctx === 'coleta') return { screen: 'coleta' };
    if (ctx === 'descarga') return { screen: 'descarga' };
    if (ctx === 'pocosDesc') return { screen: 'lista', block: 'pocos', filt: 'todos', q: '' };
    if (ctx === 'poco') {
      return feito.tab === 'estoque' ? { screen: 'lista', block: 'pocoEst', filt: 'todos', q: '' }
        : { screen: 'lista', block: 'poco', filt: 'pend', q: '' };
    }
    return { screen: 'lista', block: ctx === 'eta' || ctx === 'ete' ? ctx : 'poco', filt: 'todos', q: '' };
  }

  // Janela de confirmação com o resumo dos dados preenchidos.
  function confirmarEnvio(resumo) {
    return new Promise(function (resolve) {
      var fundo = document.createElement('div');
      fundo.style.cssText = 'position:fixed;inset:0;background:rgba(10,46,92,.45);display:flex;align-items:center;justify-content:center;padding:16px;z-index:9998;font-family:\'Inter\',system-ui,sans-serif';
      var caixa = document.createElement('div');
      caixa.setAttribute('role', 'dialog');
      caixa.setAttribute('aria-modal', 'true');
      caixa.setAttribute('aria-labelledby', 'ce-tit');
      caixa.style.cssText = 'width:100%;max-width:380px;max-height:calc(100vh - 32px);overflow-y:auto;background:#fff;border-radius:22px;padding:22px;box-sizing:border-box;display:flex;flex-direction:column;gap:12px';
      caixa.innerHTML =
        '<h2 id="ce-tit" style="margin:0;font-size:21px;font-weight:800;color:#0A2E5C">Confirme os dados</h2>' +
        '<p id="ce-sub" style="margin:-6px 0 0;color:#52627A;font-size:14px"></p>' +
        '<div id="ce-linhas" style="display:flex;flex-direction:column;border:1px solid #DDE5EE;border-radius:14px;overflow:hidden"></div>' +
        '<p style="margin:0;color:#52627A;font-size:13px">Confira antes de enviar. Depois de enviado, o lançamento não pode ser apagado.</p>' +
        '<div style="display:flex;gap:10px">' +
        '<button type="button" id="ce-nao" style="flex:1;height:50px;border:1.5px solid #C7D4E2;border-radius:14px;background:#fff;color:#0A2E5C;font:700 16px \'Inter\',sans-serif;cursor:pointer">Corrigir</button>' +
        '<button type="button" id="ce-sim" style="flex:1;height:50px;border:0;border-radius:14px;background:#0057A8;color:#fff;font:700 16px \'Inter\',sans-serif;cursor:pointer">Confirmar</button>' +
        '</div>';
      caixa.querySelector('#ce-sub').textContent = resumo.sub || '';
      var linhas = caixa.querySelector('#ce-linhas');
      (resumo.rows || []).forEach(function (r, i) {
        var l = document.createElement('div');
        l.style.cssText = 'display:flex;justify-content:space-between;align-items:baseline;gap:12px;padding:10px 12px;font-size:14px' + (i ? ';border-top:1px solid #EEF3F7' : '');
        var k = document.createElement('span'); k.style.color = '#52627A'; k.textContent = r.k;
        var val = document.createElement('span'); val.style.cssText = 'font-weight:700;color:' + (r.alerta ? '#9A3412' : '#0A2E5C') + ';text-align:right'; val.textContent = r.v;
        l.appendChild(k); l.appendChild(val); linhas.appendChild(l);
      });
      fundo.appendChild(caixa);
      document.body.appendChild(fundo);
      var fim = function (v) { fundo.remove(); resolve(v); };
      caixa.querySelector('#ce-nao').addEventListener('click', function () { fim(false); });
      caixa.querySelector('#ce-sim').addEventListener('click', function () { fim(true); });
      fundo.addEventListener('keydown', function (e) { if (e.key === 'Escape') fim(false); });
      caixa.querySelector('#ce-sim').focus();
    });
  }

  // Rótulos dos padrões da calibração (para o resumo).
  var PADROES_CAL = {
    t20: ['Turbidímetro', '20 NTU', 20], t100: ['Turbidímetro', '100 NTU', 100], t800: ['Turbidímetro', '800 NTU', 800], t10: ['Turbidímetro', '10 NTU', 10],
    c500: ['Colorímetro', '500 Pt-Co', 500], c100: ['Colorímetro', '100 Pt-Co', 100], c10: ['Colorímetro', '10 Pt-Co', 10], c0: ['Colorímetro', '0 Pt-Co', 0],
    p4: ['pHmetro', 'pH 4', 4], p7: ['pHmetro', 'pH 7', 7], p10: ['pHmetro', 'pH 10', 10], slope: ['pHmetro', 'Average slope', 100]
  };

  // Tolerâncias da calibração: turbidez e cor 5%; padrão 0 Pt-Co até 1 Pt-Co; pH ±0,1; slope 90% a 110%.
  // Devolve { alerta, txt (para embaixo do campo), curto (para o resumo) }.
  function regraCal(k, v) {
    var pd = PADROES_CAL[k];
    if (!pd || v == null) return { alerta: false };
    var ref = pd[2], fim = ' O recomendado é iniciar uma nova calibração.';
    if (k === 'c0') {
      return v > 1 ? { alerta: true, curto: 'acima de 1 Pt-Co', txt: 'Leitura acima de 1 Pt-Co para o padrão 0.' + fim } : { alerta: false };
    }
    if (k === 'p4' || k === 'p7' || k === 'p10') {
      var dif = Math.abs(v - ref);
      return dif > 0.1 + 1e-9
        ? { alerta: true, curto: 'diferença de ' + br(Math.round(dif * 100) / 100), txt: 'Diferença de ' + br(Math.round(dif * 100) / 100) + ' em relação ao pH ' + ref + ' (máximo de 0,1).' + fim }
        : { alerta: false };
    }
    var lim = k === 'slope' ? 10 : 5;
    var d = Math.abs(v - ref) / ref * 100;
    if (d <= lim + 1e-9) return { alerta: false };
    return {
      alerta: true, curto: 'desvio de ' + br(Math.round(d * 10) / 10) + '%',
      txt: (k === 'slope' ? 'Slope fora da faixa de 90% a 110%.' : 'Desvio de ' + br(Math.round(d * 10) / 10) + '% em relação ao padrão de ' + pd[1] + ' (máximo de 5%).') + fim
    };
  }

  // Estoque da ETA: produto e ETA de cada grupo de reservatórios.
  var GRUPO_ETA = { pac1: ['PAC', 'ETA 1'], pac2: ['PAC', 'ETA 2'], flu1: ['Flúor', 'ETA 1'], flu2: ['Flúor', 'ETA 2'] };

  function inserir(tabela, linha) { return q(sb.from(tabela).insert(linha)); }
  async function alterar(tabela, id, campos) {
    var rows = await q(sb.from(tabela).update(campos).eq('id', id).select('id'));
    if (!rows || !rows.length) throw new Error('registro não encontrado ou já encerrado');
  }

  function decorar(comp, v) {
    var st = comp.state;
    v.opName = operador();
    v.opPapel = papelTxt();
    v.opPrimeiro = primeiroNome();
    aoMudarFoto(comp);
    var vf = valoresFoto();
    v.opIni = vf.ini; v.opFoto = vf.foto; v.opTemFoto = vf.temFoto; v.opSemFoto = vf.semFoto;
    v.opTrocarTxt = vf.trocarTxt; v.opPadraoOp = vf.padraoOp;
    v.opTrocarFoto = trocarFoto; v.opFotoPadrao = fotoPadrao;
    // Foto do canto superior direito: Perfil, Configurações e Sair (como no sistema web).
    v.opMenu = function (ev) {
      abrirMenuConta(ev, {
        perfil: function () { comp.setState({ screen: 'perfil' }); },
        config: function () { comp.setState({ screen: 'config' }); }
      });
    };
    v.opAlterarSenha = alterarSenha;
    v.opTrocandoSenha = trocandoSenha;
    v.opSenhaTxt = trocandoSenha ? 'Alterando…' : 'Alterar senha';
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
        entrarOuPrimeiroAcesso(u ? u.value : '', s ? s.value : '').then(function (p) {
          if (s) s.value = '';
          if (toastEl) toastEl.hidden = true;
          esconderAvisoAmarelo();
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
      v.nav.login = function () {
        pararVigia();
        sair().then(function () { location.reload(); });
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
        var menor = hasCur && vol < 0;
        // O aviso de totalizador menor só aparece depois que a pessoa sai do campo (ou tenta registrar).
        v.neg = menor && !!st.totTocado;
        v.volTxt = hasCur && !menor ? fmt(vol) : '—';
        v.vazMedTxt = hasCur && !menor && hrs > 0 ? fmt1(vol / hrs) : '—';
        v.hrsTxt = h + ' h ' + pad(m) + ' min';
      } else {
        v.p.prevTxt = '—'; v.p.vazPrevTxt = '—'; v.p.lastTxt = 'primeira leitura deste ponto';
        v.neg = false; v.volTxt = '—'; v.vazMedTxt = '—'; v.hrsTxt = '—';
      }
    } else if (v.p) {
      v.p.lastTxt = 'carregando…';
    }
    if (v.on && typeof v.on.tot === 'function') {
      var digitarTot = v.on.tot;
      v.on.tot = function (ev) { digitarTot(ev); comp.setState({ totTocado: false }); };
      v.on.totSair = function () { comp.setState({ totTocado: true }); };
    }

    // Calibração: aviso de desvio só depois de sair do campo.
    (v.calEquip || []).forEach(function (q2) {
      (q2.fields || []).forEach(function (f) {
        var k = String(f.id).replace(/^cal-/, '');
        var r = regraCal(k, dec((st.calv || {})[k]));
        f.alerta = r.alerta && !!(st.calTocado || {})[k];
        f.alertaTxt = r.txt || '';
        var digitar = f.set;
        f.set = function (ev) { digitar(ev); comp.setState({ calTocado: Object.assign({}, comp.state.calTocado, { [k]: false }) }); };
        f.sair = function () { comp.setState({ calTocado: Object.assign({}, comp.state.calTocado, { [k]: true }) }); };
      });
    });

    // DQO: padrão de 500 mg/L, desvio máximo de 10%; aviso só depois de sair do campo.
    (v.eteAn || []).forEach(function (g) {
      if (String(g.name).indexOf('DQO') !== 0) { g.alerta = false; return; }
      var pdq = dec((st.anv || {})['an-dqo-p']);
      var dd = pdq == null ? 0 : Math.abs(pdq - 500) / 500 * 100;
      g.alerta = pdq != null && dd > 10 && !!st.dqoTocado;
      g.alertaTxt = 'Padrão com desvio de ' + br(Math.round(dd * 10) / 10) + '% em relação a 500 mg/L (máximo de 10%). A análise de DQO está comprometida: o recomendado é refazer o padrão.';
      (g.fields || []).forEach(function (f) {
        if (f.id !== 'an-dqo-p') return;
        var digitar = f.set;
        f.set = function (ev) { digitar(ev); comp.setState({ dqoTocado: false }); };
        f.sair = function () { comp.setState({ dqoTocado: true }); };
      });
    });

    // Estoque da ETA: aviso se o volume subir em relação ao último registro sem descarregamento hoje.
    (v.stockGroups || []).forEach(function (g) {
      (g.res || []).forEach(function (r) {
        var key = String(r.id).replace(/^st-/, '');
        var grupo = GRUPO_ETA[key.split('-')[0]];
        var antes = (st.dbEtaPrev || {})[key];
        var agora = num((st.lev || {})[key]);
        var descarregou = grupo && (st.descHoje || []).some(function (d) { return d.produto === grupo[0] && d.eta === grupo[1]; });
        var tocado = !!(st.levTocado || {})[key];
        r.alerta = !!st.dbOk && antes != null && agora != null && agora > Number(antes) && !descarregou && tocado;
        r.over = !!r.over && tocado; // "passa da capacidade" também só depois de sair do campo
        r.alertaTxt = grupo ? 'O volume está maior que o último registro (' + fmt(Number(antes)) + ' L), mas não há descarregamento de ' + grupo[0] + ' na ' + grupo[1] + ' hoje. Confira antes de registrar.' : '';
        var digitar = r.set;
        r.set = function (ev) { digitar(ev); comp.setState({ levTocado: Object.assign({}, comp.state.levTocado, { [key]: false }) }); };
        r.sair = function () { comp.setState({ levTocado: Object.assign({}, comp.state.levTocado, { [key]: true }) }); };
      });
    });

    var p = v.p, op = operador();

    aoSalvar(comp, v.on, 'saveLeitura', foiParaConfirmacao, function (s, obs) {
      var tot = num(s.tot), last = (s.dbLast || {})[p.id];
      return inserir('leituras_macromedidor', {
        ponto_id: p.id, ponto_nome: p.name, grupo: p.grp,
        vazao_m3h: dec(s.vaz), totalizador_m3: tot,
        volume_m3: last ? tot - last.tot : null,
        cloro_mg_l: p.poco ? dec(s.cl) : null, fluor_mg_l: p.poco ? dec(s.fl) : null,
        foto_anexada: false, observacao: obs, operador: op
      });
    }, function () {
      // O campo de observações não fica no estado do app: lê antes de a tela mudar.
      var el = document.getElementById('obs');
      return el && el.value.trim() ? el.value.trim().slice(0, 1000) : null;
    }, function () {
      // Na confirmação, só a vazão e o totalizador digitados.
      var cur = comp.state.last;
      if (cur && cur.rows) {
        comp.state.last = Object.assign({}, cur, { rows: cur.rows.filter(function (r) { return r.k !== 'Volume no intervalo' && r.v !== 'Não informado'; }) });
      }
    }, {
      // O totalizador nunca pode ser menor que a leitura anterior.
      validar: function (s) {
        var tot = num(s.tot), last = (s.dbLast || {})[p.id];
        if (last && tot != null && tot < last.tot) {
          comp.setState({ totTocado: true });
          return 'O totalizador não pode ser menor que a leitura anterior (' + fmt(last.tot) + ' m³).';
        }
      }
    });

    aoSalvar(comp, v.on, 'saveEstoque', foiParaConfirmacao, function (s) {
      return inserir('estoque_poco', {
        ponto_id: p.id, ponto_nome: p.name,
        hipoclorito_l: dec(s.hip), acido_fluossilicico_l: dec(s.aci), operador: op
      });
    }, null, null, {
      // O estoque começa em branco em cada poço: exige os dois volumes.
      validar: function (s) {
        if (dec(s.hip) == null || dec(s.aci) == null) return 'Informe o volume atual de hipoclorito e de ácido fluossilícico.';
      },
      limpar: { hip: '', aci: '' }
    });

    aoSalvar(comp, v.on, 'saveCal', foiParaConfirmacao, function (s) {
      return inserir('calibracoes_eta', { leituras: soPreenchidos(s.calv, dec), operador: op });
    }, null, function (s) {
      // Resumo com cada leitura preenchida, marcando as que estão fora da tolerância.
      var rows = [];
      Object.keys(PADROES_CAL).forEach(function (k) {
        var val = dec((s.calv || {})[k]);
        if (val == null) return;
        var pd = PADROES_CAL[k], r = regraCal(k, val);
        rows.push({ k: pd[0] + ' · ' + pd[1], v: br(val) + (r.alerta ? ' (' + r.curto + ')' : ''), alerta: r.alerta });
      });
      comp.state.last = Object.assign({}, comp.state.last, { rows: rows });
    }, { limpar: { calv: {}, calTocado: {} } });

    aoSalvar(comp, v.on, 'saveEtaStock', foiParaConfirmacao, function (s) {
      var niveis = Object.assign({}, s.dbEtaPrev || {}, soPreenchidos(s.lev, num));
      // Sacos de sal usados no turno: vale só para este registro (não vem do anterior).
      delete niveis.sal_sacos_usados;
      var sal = num(s.salUsed);
      if (sal != null) niveis.sal_sacos_usados = sal;
      return inserir('estoque_eta', { niveis_l: niveis, operador: op });
    }, null, null, { limpar: { lev: {}, levTocado: {}, salUsed: '' } });

    // Descarregamento nos poços: uma linha por destino, todas com o mesmo lote.
    aoSalvar(comp, v.on, 'savePocoDesc', foiParaConfirmacao, function (s) {
      var lote = (window.crypto && crypto.randomUUID) ? crypto.randomUUID() : null;
      if (!lote) throw new Error('navegador sem suporte para gerar o lote');
      var linhas = (s.pd || []).map(function (r) {
        return {
          lote_id: lote, produto: r.tipo, quantidade_l: num(r.qtd),
          ponto_id: r.dest, ponto_nome: r.destNome || r.dest, operador: op
        };
      });
      return inserir('descarregamentos_pocos', linhas);
    }, null, null, { limpar: { pd: null } });

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
        estDone: {}, pdLast: null, descHoje: [],
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

  // Virou o dia com o app aberto: recarrega (tudo volta a "pendente") e os filtros dos macros voltam para Pendentes.
  setInterval(function () {
    if (!atual || !perfil || !atual.state.diaCarregado) return;
    if (dayStart(0).toISOString() === atual.state.diaCarregado) return;
    atual.setState({ filt: atual.state.block === 'poco' ? 'pend' : atual.state.filt, etaFilt: 'pend' });
    atualizar(atual);
  }, 60000);

  // Ao voltar para o app (outra aba, celular desbloqueado), busca o que outros operadores lançaram.
  document.addEventListener('visibilitychange', function () {
    if (document.visibilityState === 'visible' && atual && document.body.contains(document.getElementById('app'))) atualizar(atual);
  });

  // ---------- telas permitidas (site único: celular x computador) ----------
  // Operador no celular: só o app. Operador no computador: as telas marcadas em "Telas no computador",
  // nunca "Usuários e permissões" nem "Importar e exportar". Os outros cargos veem tudo, como antes.
  var TELAS = { WebDashboard: 'painel', WebQuimicos: 'quimicos', WebColetas: 'coletas', WebDescargas: 'descargas', WebOperacaoEta: 'operacao' };
  var ORDEM_TELAS = ['WebDashboard', 'WebQuimicos', 'WebColetas', 'WebDescargas', 'WebOperacaoEta'];
  var TODAS_TELAS = ORDEM_TELAS.concat(['WebAdmin', 'WebDados']);
  function eOperador() { return !!perfil && perfil.papel === 'operador'; }
  function podeAbrir(nome, cel) {
    if (!perfil) return false;
    if (nome === 'Main') return true;
    if (eOperador()) {
      if (cel) return false;
      if (nome === 'WebAdmin' || nome === 'WebDados' || nome === 'MobileHome') return false;
      var t = (perfil.permissoes && perfil.permissoes.telas) || {};
      return TELAS[nome] ? t[TELAS[nome]] !== false : true;
    }
    if (nome === 'MobileHome') return !!cel;
    return true;
  }
  function inicio(cel) {
    if (cel) return eOperador() ? 'Main' : 'MobileHome';
    for (var i = 0; i < ORDEM_TELAS.length; i++) if (podeAbrir(ORDEM_TELAS[i], false)) return ORDEM_TELAS[i];
    return 'WebPerfil';
  }
  // Esconde do menu lateral (e dos atalhos) as telas que a pessoa não pode abrir.
  var estiloMenu = null;
  function menuPermitido(cel) {
    if (!estiloMenu) { estiloMenu = document.createElement('style'); document.head.appendChild(estiloMenu); }
    estiloMenu.textContent = TODAS_TELAS.filter(function (n) { return !podeAbrir(n, cel); })
      .map(function (n) { return 'a[href="#' + n + '"]'; }).join(',') + (TODAS_TELAS.some(function (n) { return !podeAbrir(n, cel); }) ? '{display:none!important}' : '');
  }

  // ---------- sistema web: entrada e controle de acesso ----------
  var COR = { fundo: '#EEF3F7', azul: '#0057A8', marinho: '#0A2E5C', texto: '#52627A', borda: '#C7D4E2' };
  function cartao(html) {
    var shell = document.getElementById('shell');
    shell.innerHTML = '<div style="min-height:100vh;display:flex;align-items:center;justify-content:center;padding:24px 16px;box-sizing:border-box;background:' + COR.fundo + ';font-family:\'Inter\',system-ui,sans-serif">' +
      '<div style="width:100%;max-width:380px;background:#fff;border-radius:22px;padding:28px 24px;box-sizing:border-box;box-shadow:0 20px 60px rgba(10,46,92,.12);display:flex;flex-direction:column;gap:14px">' +
      '<h1 style="margin:0;font-family:\'Inter\',sans-serif;font-weight:800;font-size:26px;color:' + COR.marinho + '">GS Inima Tech</h1>' +
      html + '</div></div>';
    return shell;
  }
  var campo = 'height:50px;border:1.5px solid ' + COR.borda + ';border-radius:14px;padding:0 14px;font-size:16px;font-family:inherit;width:100%;box-sizing:border-box';
  var botao = 'height:52px;border:0;border-radius:16px;background:' + COR.azul + ';color:#fff;font-size:16px;font-weight:700;cursor:pointer;font-family:inherit';

  // Painel de entrada do sistema web: o mesmo do app (logo, campos e ilustração), tirado do próprio template do app.
  function painelDoApp() {
    var tpl = window.PAGES && window.PAGES.Main && window.PAGES.Main.tpl;
    if (!tpl) return null;
    var a = tpl.indexOf('<!-- ============ LOGIN ============ -->');
    var b = tpl.indexOf('<!-- ============ HOME', a);
    if (a < 0 || b < 0) return null;
    var html = tpl.slice(a, b)
      .replace(/<sc-if value="\{\{ s\.login \}\}"[^>]*>/, '')
      .replace(/<\/sc-if>\s*$/, '')
      .replace('onClick="{{ nav.home }}"', 'id="lg-btn"')
      .replace('Operação em campo', 'Operação e acompanhamento')
      .replace('Leituras, análises e estoque de cada unidade, num só lugar.', 'Lançamentos, painéis e acompanhamento, num só lugar.');
    if (/\{\{/.test(html) || html.indexOf('lg-pass') < 0) return null;
    return html;
  }

  function telaLogin(iniciar, aviso) {
    var html = painelDoApp();
    if (!html) return telaLoginSimples(iniciar, aviso);
    var shell = document.getElementById('shell');
    var cel = window.innerWidth < 1024;
    shell.innerHTML = cel
      ? '<div style="position:relative;width:100%;height:100dvh;min-height:560px;overflow:hidden;background:#EEF3F7;font-family:\'Inter\',system-ui,sans-serif;color:#0F1E2E;font-size:15px;line-height:1.4">' + html + '</div>'
      : '<div style="min-height:100vh;display:flex;align-items:center;justify-content:center;padding:24px 16px;box-sizing:border-box;background:#DCE6EF">' +
      '<div style="position:relative;width:420px;max-width:100%;height:min(820px,calc(100vh - 48px));min-height:640px;border-radius:28px;overflow:hidden;background:#EEF3F7;box-shadow:0 30px 80px rgba(10,46,92,.18);font-family:\'Inter\',system-ui,sans-serif;color:#0F1E2E;font-size:15px;line-height:1.4">' +
      html + '</div></div>';
    var u = shell.querySelector('#lg-user'), s = shell.querySelector('#lg-pass'), b = shell.querySelector('#lg-btn');
    if (aviso) toast(aviso);
    u.focus();
    var ir = function () {
      if (b.disabled) return;
      b.disabled = true; b.textContent = 'Entrando…';
      entrarOuPrimeiroAcesso(u.value, s.value).then(function () {
        if (toastEl) toastEl.hidden = true;
        abrirWeb(iniciar);
      }, function (err) {
        toast(err && err.message && !/fetch/i.test(err.message) ? err.message : 'Não foi possível entrar (' + erroTxt(err) + ').');
        b.disabled = false; b.textContent = 'Entrar'; s.value = ''; s.focus();
      });
    };
    b.addEventListener('click', ir);
    s.addEventListener('keydown', function (e) { if (e.key === 'Enter') ir(); });
  }

  // Reserva, caso o template do app não esteja disponível.
  function telaLoginSimples(iniciar, aviso) {
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
    msg.textContent = aviso || '';
    u.focus();
    shell.querySelector('#wl-form').addEventListener('submit', function (e) {
      e.preventDefault();
      var b = shell.querySelector('button[type=submit]');
      b.disabled = true; b.textContent = 'Entrando…'; msg.textContent = '';
      entrarOuPrimeiroAcesso(u.value, s.value).then(function () {
        abrirWeb(iniciar);
      }, function (err) {
        msg.textContent = err && err.message && !/fetch/i.test(err.message) ? err.message : 'Não foi possível entrar (' + erroTxt(err) + ').';
        b.disabled = false; b.textContent = 'Entrar'; s.value = ''; s.focus();
      });
    });
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
          aoMudarFoto(this);
          v.me = Object.assign(valoresFoto(), {
            nome: operador(), papel: papelTxt(), login: perfil ? perfil.login : '', primeiro: primeiroNome(),
            menu: abrirMenuConta, sair: confirmarSaida,
            trocarFoto: trocarFoto, fotoPadrao: fotoPadrao,
            alterarSenha: alterarSenha, trocandoSenha: trocandoSenha, senhaTxt: trocandoSenha ? 'Alterando…' : 'Alterar senha'
          });
          return v;
        };
      });
    }
    esconderAvisoAmarelo();
    vigiarInatividade(iniciar);
    iniciar();
  }

  // ---------- sessão expira após 1 hora sem atividade (todos os cargos, celular ou computador) ----------
  // Conta como atividade: clique, toque, tecla ou rolagem (mexer o mouse não conta).
  // O horário da última atividade fica no aparelho, então reabrir o navegador depois de 1 hora também pede login.
  var LIMITE_INATIVO = 60 * 60 * 1000;
  var ATIVIDADE_KEY = 'gsinima.web.atividade';
  var MSG_INATIVO = 'Sessão encerrada após 1 hora sem atividade. Por segurança, entre novamente para continuar.';
  var EVENTOS_ATIVIDADE = ['pointerdown', 'keydown', 'wheel', 'touchstart'];
  var vigia = null;

  function marcarAtividade() { storeSet(ATIVIDADE_KEY, String(Date.now())); }
  function inativoDemais() {
    var t = Number(storeGet(ATIVIDADE_KEY));
    return !t || Date.now() - t > LIMITE_INATIVO;
  }

  function vigiarInatividade(iniciar) {
    pararVigia();
    marcarAtividade();
    var ultimaGravacao = Date.now();
    var aoAgir = function (e) {
      if (inativoDemais()) {
        // Passou do tempo: a ação não acontece e a sessão é encerrada.
        e.preventDefault(); e.stopPropagation(); e.stopImmediatePropagation();
        encerrarPorInatividade(iniciar);
        return;
      }
      if (Date.now() - ultimaGravacao > 5000) { ultimaGravacao = Date.now(); marcarAtividade(); }
    };
    EVENTOS_ATIVIDADE.forEach(function (ev) { document.addEventListener(ev, aoAgir, true); });
    // Se a pessoa saiu da frente da tela, a sessão já se encerra sozinha (o aviso estará lá quando voltar).
    var relogio = setInterval(function () { if (inativoDemais()) encerrarPorInatividade(iniciar); }, 30000);
    var aoVoltar = function () { if (document.visibilityState === 'visible' && inativoDemais()) encerrarPorInatividade(iniciar); };
    document.addEventListener('visibilitychange', aoVoltar);
    vigia = function () {
      EVENTOS_ATIVIDADE.forEach(function (ev) { document.removeEventListener(ev, aoAgir, true); });
      clearInterval(relogio);
      document.removeEventListener('visibilitychange', aoVoltar);
    };
  }
  function pararVigia() { if (vigia) { vigia(); vigia = null; } }

  function encerrarPorInatividade(iniciar) {
    pararVigia();
    sair().then(function () {
      telaLogin(iniciar);
      mostrarAvisoAmarelo(MSG_INATIVO);
    });
  }

  var avisoEl = null;
  function mostrarAvisoAmarelo(texto) {
    if (!avisoEl) {
      avisoEl = document.createElement('div');
      avisoEl.setAttribute('role', 'alert');
      avisoEl.style.cssText = 'position:fixed;top:16px;left:50%;transform:translateX(-50%);width:min(520px,calc(100vw - 32px));box-sizing:border-box;' +
        'background:#FEF3C7;color:#78350F;border:1.5px solid #F59E0B;border-radius:14px;padding:14px 16px;z-index:9999;' +
        'font:500 15px/1.4 \'Inter\',system-ui,sans-serif;box-shadow:0 8px 24px rgba(10,46,92,.18);display:flex;gap:10px;align-items:flex-start';
      document.body.appendChild(avisoEl);
    }
    avisoEl.innerHTML = '<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="#B45309" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" style="flex-shrink:0;margin-top:1px">' +
      '<circle cx="12" cy="13" r="8"/><path d="M12 9v4l2.5 2"/><path d="M9 2h6"/></svg><span></span>';
    avisoEl.querySelector('span').textContent = texto;
    avisoEl.hidden = false;
  }
  function esconderAvisoAmarelo() { if (avisoEl) avisoEl.hidden = true; }

  function guardWeb(iniciar) {
    cartao('<p style="margin:0;color:' + COR.texto + '">Carregando…</p>');
    carregarPerfil().then(function (p) {
      if (!p) return telaLogin(iniciar);
      // Sessão guardada, mas sem atividade há mais de 1 hora: pede login de novo.
      if (inativoDemais()) {
        return sair().then(function () {
          telaLogin(iniciar);
          mostrarAvisoAmarelo(MSG_INATIVO);
        });
      }
      sb.rpc('registrar_acesso').then(function () {}, function () {});
      abrirWeb(iniciar);
    }, function (err) { telaLogin(iniciar, 'Entre de novo: ' + erroTxt(err) + '.'); });
  }

  // ---------- tela "Usuários e permissões" ----------
  function permCompleta(p) {
    var x = JSON.parse(JSON.stringify(p || {}));
    x.web = Object.assign({ painelVer: false, painelExp: false, imp: false, exp: false, admin: false }, x.web || {});
    delete x.web.acesso;
    x.telas = Object.assign({ painel: true, quimicos: true, coletas: true, descargas: true, operacao: true }, x.telas || {});
    return x;
  }
  function carregarUsuarios(comp, selecionar) {
    return sb.from('perfis').select('*').order('nome').then(function (r) {
      if (r.error) { toast('Não foi possível carregar os usuários (' + erroTxt(r.error) + ').'); return; }
      var users = r.data.map(function (p) {
        return {
          id: p.id, name: p.nome, email: p.login, role: p.papel, active: p.ativo, pendente: !p.usuario_id,
          last: !p.usuario_id ? 'aguardando o primeiro acesso' : p.ultimo_acesso ? 'último acesso ' + quando(p.ultimo_acesso) : 'nunca entrou'
        };
      });
      if (!users.length) return;
      var perms = {};
      r.data.forEach(function (p) { perms[p.id] = permCompleta(p.permissoes); });
      var quer = selecionar || comp.state.sel;
      var sel = users.some(function (u) { return u.id === quer; }) ? quer : users[0].id;
      comp.setState({ users: users, perms: perms, sel: sel, saved: false, dbUsers: r.data });
    });
  }

  // "Cadastrar usuário": nome, login e cargo; sem senha (a pessoa cria no primeiro acesso).
  var CARGOS = [
    ['operador', 'Operador', 'Lança em campo'],
    ['lab', 'Laboratório', 'ETAs e calibrações'],
    ['super', 'Supervisor', 'Corrige e exporta'],
    ['admin', 'Administrador', 'Acesso total']
  ];
  function formCadastro(comp) {
    if (!comp.state.dbUsers) { toast('Aguarde a lista de usuários carregar.'); return; }
    var fundo = document.createElement('div');
    var campoF = 'height:48px;border:1.5px solid #C7D4E2;border-radius:12px;padding:0 14px;font-size:16px;font-family:inherit;width:100%;box-sizing:border-box;background:#fff';
    var rot = 'font-weight:700;font-size:14px;color:#0A2E5C';
    fundo.style.cssText = 'position:fixed;inset:0;background:rgba(10,46,92,.45);display:flex;align-items:center;justify-content:center;padding:16px;z-index:9998;font-family:\'Inter\',system-ui,sans-serif';
    fundo.innerHTML =
      '<form role="dialog" aria-modal="true" aria-labelledby="cu-tit" style="width:100%;max-width:440px;background:#fff;border-radius:22px;padding:24px;box-sizing:border-box;display:flex;flex-direction:column;gap:10px">' +
      '<h2 id="cu-tit" style="margin:0 0 4px;font-family:\'Inter\',sans-serif;font-size:24px;color:#0A2E5C">Cadastrar usuário</h2>' +
      '<p style="margin:0 0 6px;color:#52627A;font-size:14px">A pessoa cria a própria senha no primeiro acesso, entrando com o login abaixo e a senha que quiser.</p>' +
      '<label for="cu-nome" style="' + rot + '">Nome para visualização</label>' +
      '<input id="cu-nome" maxlength="80" autocomplete="off" placeholder="Ex.: Ana Souza" style="' + campoF + '">' +
      '<label for="cu-login" style="' + rot + '">Login</label>' +
      '<input id="cu-login" maxlength="40" autocomplete="off" autocapitalize="none" spellcheck="false" placeholder="Ex.: ana.souza" style="' + campoF + '">' +
      '<span style="font-size:13px;color:#52627A;margin-top:-4px">Letras minúsculas, números, ponto, hífen ou sublinhado (3 a 40).</span>' +
      '<label for="cu-cargo" style="' + rot + '">Cargo</label>' +
      '<select id="cu-cargo" style="' + campoF + '">' +
      CARGOS.map(function (c) { return '<option value="' + c[0] + '">' + c[1] + ' — ' + c[2] + '</option>'; }).join('') +
      '</select>' +
      '<span style="font-size:13px;color:#52627A;margin-top:-4px">O cargo preenche as permissões; depois você pode ajustá-las na tela.</span>' +
      '<p id="cu-msg" role="alert" style="margin:0;color:#8C1D18;font-size:14px;min-height:1em"></p>' +
      '<div style="display:flex;gap:10px;justify-content:flex-end;flex-wrap:wrap">' +
      '<button type="button" id="cu-cancel" style="height:46px;padding:0 18px;border:1.5px solid #C7D4E2;border-radius:12px;background:#fff;color:#0A2E5C;font-size:15px;font-weight:700;cursor:pointer">Cancelar</button>' +
      '<button type="submit" style="height:46px;padding:0 18px;border:0;border-radius:12px;background:#0057A8;color:#fff;font-size:15px;font-weight:700;cursor:pointer">Cadastrar</button>' +
      '</div></form>';
    document.body.appendChild(fundo);
    var nome = fundo.querySelector('#cu-nome'), login = fundo.querySelector('#cu-login'), cargo = fundo.querySelector('#cu-cargo'), msg = fundo.querySelector('#cu-msg');
    nome.focus();
    // Sugere o login a partir do nome (ex.: "Ana Souza" -> "ana.souza") enquanto ninguém mexeu no campo.
    var loginMexido = false;
    login.addEventListener('input', function () { loginMexido = true; });
    nome.addEventListener('input', function () {
      if (loginMexido) return;
      login.value = nome.value.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().trim()
        .replace(/[^a-z0-9]+/g, '.').replace(/^\.+|\.+$/g, '').slice(0, 40);
    });
    var fechar = function () { fundo.remove(); };
    fundo.querySelector('#cu-cancel').addEventListener('click', fechar);
    fundo.addEventListener('keydown', function (e) { if (e.key === 'Escape') fechar(); });
    fundo.querySelector('form').addEventListener('submit', function (e) {
      e.preventDefault(); e.stopPropagation();
      var n = nome.value.trim(), l = login.value.trim().toLowerCase(), c = cargo.value;
      if (!n) { msg.textContent = 'Informe o nome.'; nome.focus(); return; }
      if (!/^[a-z0-9._-]{3,40}$/.test(l)) { msg.textContent = 'Login inválido: use 3 a 40 letras minúsculas, números, ponto, hífen ou sublinhado.'; login.focus(); return; }
      if (comp.state.dbUsers.some(function (p) { return p.login === l; })) { msg.textContent = 'Esse login já existe.'; login.focus(); return; }
      var b = fundo.querySelector('button[type=submit]');
      b.disabled = true; b.textContent = 'Cadastrando…'; msg.textContent = '';
      q(sb.from('perfis').insert({ login: l, nome: n, papel: c, permissoes: permCompleta(comp.preset(c)) }).select('id')).then(function (rows) {
        fechar();
        toast('Usuário cadastrado. No primeiro acesso, ' + n + ' entra com o login "' + l + '" e a senha que quiser.', 'ok');
        return carregarUsuarios(comp, rows && rows[0] && rows[0].id);
      }).catch(function (err) {
        b.disabled = false; b.textContent = 'Cadastrar';
        msg.textContent = /duplicate|23505/.test(String(err && (err.code || err.message))) ? 'Esse login já existe.' :
          /row-level security/i.test(String(err && err.message)) ? 'Só administradores podem cadastrar usuários.' : 'Não foi possível cadastrar (' + erroTxt(err) + ').';
      });
    });
  }

  function redefinirSenha(comp, u) {
    if (!u || u.pendente) return;
    if (perfil && u.id === perfil.id) { toast('Você não pode redefinir a sua própria senha por aqui.'); return; }
    if (!window.confirm('Redefinir a senha de ' + u.name + '?\n\nA senha atual deixa de valer. No próximo acesso, ' + u.name +
      ' entra com o login "' + u.email + '" e cria uma senha nova. Cargo, permissões e lançamentos continuam iguais.')) return;
    chamarPrimeiroAcesso({ acao: 'redefinir', perfil_id: u.id }).then(function () {
      // Atualiza só esta pessoa na tela, sem perder alterações de permissões ainda não salvas.
      var st = comp.state;
      comp.setState({
        users: st.users.map(function (x) { return x.id === u.id ? Object.assign({}, x, { pendente: true, last: 'aguardando o primeiro acesso' }) : x; }),
        dbUsers: st.dbUsers.map(function (p) { return p.id === u.id ? Object.assign({}, p, { usuario_id: null }) : p; })
      });
      toast('Senha redefinida. No próximo acesso, ' + u.name + ' entra com o login "' + u.email + '" e cria uma senha nova.', 'ok');
    }).catch(function (err) {
      toast('A senha NÃO foi redefinida (' + erroTxt(err) + ').');
    });
  }

  // "Excluir conta": apaga o login e o cadastro da pessoa. Os lançamentos dela continuam no sistema.
  function excluirConta(comp, u) {
    if (!u || u.id === '_') return;
    if (perfil && u.id === perfil.id) { toast('Você não pode excluir a sua própria conta.'); return; }
    var digitado = window.prompt('Excluir a conta de ' + u.name + '?\n\nO login e o cadastro serão apagados e isso não pode ser desfeito. ' +
      'Os lançamentos já feitos por ' + u.name + ' continuam no sistema.\n\nPara confirmar, digite o login: ' + u.email);
    if (digitado === null) return;
    if (digitado.trim().toLowerCase() !== u.email) { toast('Login digitado não confere. A conta NÃO foi excluída.'); return; }
    chamarPrimeiroAcesso({ acao: 'excluir', perfil_id: u.id }).then(function () {
      // Tira só esta pessoa da tela, sem perder alterações de permissões ainda não salvas das outras.
      var st = comp.state;
      var users = st.users.filter(function (x) { return x.id !== u.id; });
      var perms = Object.assign({}, st.perms); delete perms[u.id];
      comp.setState({
        users: users, perms: perms,
        dbUsers: st.dbUsers.filter(function (p) { return p.id !== u.id; }),
        sel: users.length ? users[0].id : st.sel
      });
      toast('Conta de ' + u.name + ' excluída.', 'ok');
    }).catch(function (err) {
      toast('A conta NÃO foi excluída (' + erroTxt(err) + ').');
    });
  }

  function instalarAdmin(cls) {
    var montar = cls.prototype.componentDidMount;
    cls.prototype.componentDidMount = function () {
      if (montar) montar.call(this);
      var comp = this;
      var vazio = { id: '_', name: 'Carregando…', email: '', role: 'operador', last: '', active: true };
      comp.setState({ users: [vazio], perms: { _: permCompleta(comp.preset('operador')) }, sel: '_', saved: false });
      carregarUsuarios(comp);
    };
    var render = cls.prototype.renderVals;
    cls.prototype.renderVals = function () {
      var comp = this, v = render.call(this);
      // Quem foi cadastrado e ainda não criou a senha aparece como "Aguardando 1º acesso".
      (v.users || []).forEach(function (vu, i) {
        var u = comp.state.users[i];
        if (u && u.pendente && u.active) { vu.status = 'Aguardando 1º acesso'; vu.stBg = '#FDF0DC'; vu.stFg = '#8A3C06'; }
      });
      v.cadastrar = function () { formCadastro(comp); };
      // "Redefinir senha": apaga a conta da pessoa e o perfil volta a aguardar o primeiro acesso
      // (ela cria uma senha nova ao entrar). Não vale para a própria conta nem para quem ainda não entrou.
      var sel = comp.state.users.find(function (u) { return u.id === comp.state.sel; });
      if (v.cur) {
        v.cur.podeRedefinir = !!(comp.state.dbUsers && sel && !sel.pendente && !(perfil && sel.id === perfil.id));
        v.cur.redefinir = function () { redefinirSenha(comp, sel); };
        // "Excluir conta": vale também para quem ainda não fez o primeiro acesso; nunca para a própria conta.
        v.cur.podeExcluir = !!(comp.state.dbUsers && sel && sel.id !== '_' && !(perfil && sel.id === perfil.id));
        v.cur.excluir = function () { excluirConta(comp, sel); };
      }
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
    operador: operador, toast: toast,
    inicio: inicio, podeAbrir: podeAbrir, menuPermitido: menuPermitido
  };
})();
