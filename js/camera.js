/* Experimento: leitura do visor do macromedidor pela câmera do celular (só na versão Azure).
 *
 * No formulário do macromedidor aparece um botão "Ler pela câmera" nos campos Totalizador e Vazão.
 * A câmera traseira abre com uma moldura; a pessoa enquadra os números do visor e toca em "Ler".
 * A foto é lida no próprio aparelho (Tesseract.js, carregado só na primeira vez), o número é
 * mostrado junto do recorte da foto, e só entra no campo se a pessoa confirmar.
 * Sem câmera (ex.: computador), abre a escolha de uma foto.
 */
(function () {
  'use strict';

  var TESSERACT = 'https://cdn.jsdelivr.net/npm/tesseract.js@5.1.1/dist/tesseract.min.js';
  var CAMPOS = { tot: 'Totalizador', vaz: 'Vazão' };
  var COR = { marinho: '#0A2E5C', azul: '#0057A8', texto: '#52627A', borda: '#C7D4E2' };

  // ---------- leitura dos números (Tesseract, só dígitos) ----------
  var leitor = null;
  function carregarScript(url) {
    return new Promise(function (ok, falha) {
      var s = document.createElement('script');
      s.src = url; s.onload = ok; s.onerror = function () { falha(new Error('não foi possível carregar o leitor de números')); };
      document.head.appendChild(s);
    });
  }
  function obterLeitor() {
    if (!leitor) {
      leitor = (window.Tesseract ? Promise.resolve() : carregarScript(TESSERACT)).then(function () {
        return window.Tesseract.createWorker('eng');
      }).then(function (w) {
        return w.setParameters({ tessedit_char_whitelist: '0123456789.,', tessedit_pageseg_mode: '7' }).then(function () { return w; });
      });
      leitor.catch(function () { leitor = null; });
    }
    return leitor;
  }

  // Deixa a foto mais fácil de ler: cinza, contraste alto e preto no branco (visores de LCD costumam ser escuros no claro).
  function prepararImagem(origem, recorte) {
    var w = recorte ? recorte.w : origem.width, h = recorte ? recorte.h : origem.height;
    var escala = Math.max(1, 900 / w);
    var c = document.createElement('canvas'); c.width = Math.round(w * escala); c.height = Math.round(h * escala);
    var g = c.getContext('2d');
    g.drawImage(origem, recorte ? recorte.x : 0, recorte ? recorte.y : 0, w, h, 0, 0, c.width, c.height);
    var img = g.getImageData(0, 0, c.width, c.height), d = img.data, soma = 0, n = d.length / 4;
    for (var i = 0; i < d.length; i += 4) { var y = 0.299 * d[i] + 0.587 * d[i + 1] + 0.114 * d[i + 2]; d[i] = y; soma += y; }
    var media = soma / n, claroNoEscuro = media < 110; // visor com números claros em fundo escuro
    for (var j = 0; j < d.length; j += 4) {
      var v = d[j] > media * 0.85 ? 255 : 0;
      if (claroNoEscuro) v = 255 - v;
      d[j] = d[j + 1] = d[j + 2] = v; d[j + 3] = 255;
    }
    g.putImageData(img, 0, 0);
    return c;
  }

  // Lê a imagem e devolve o número mais provável (a sequência de dígitos mais longa).
  function lerNumero(canvas) {
    return obterLeitor().then(function (w) { return w.recognize(canvas); }).then(function (r) {
      var texto = (r.data && r.data.text) || '', confianca = Math.round((r.data && r.data.confidence) || 0);
      var grupos = (texto.match(/\d[\d.,]*/g) || []).map(function (t) { return t.replace(/[.,]$/, ''); });
      grupos.sort(function (a, b) { return b.replace(/\D/g, '').length - a.replace(/\D/g, '').length; });
      return { numero: grupos[0] || '', texto: texto.trim(), confianca: confianca };
    });
  }

  // ---------- tela da câmera ----------
  function estilo(el, css) { el.style.cssText = css; return el; }
  function botao(texto, primario) {
    return estilo(Object.assign(document.createElement('button'), { type: 'button', textContent: texto }),
      'height:52px;border-radius:16px;font:700 16px Inter,system-ui,sans-serif;cursor:pointer;padding:0 18px;' +
      (primario ? 'border:0;background:' + COR.azul + ';color:#fff' : 'border:1.5px solid ' + COR.borda + ';background:#fff;color:' + COR.marinho));
  }

  function abrirCamera(campoId) {
    var nome = CAMPOS[campoId], fundo = estilo(document.createElement('div'),
      'position:fixed;inset:0;z-index:9999;background:#0F1E2E;display:flex;flex-direction:column;font-family:Inter,system-ui,sans-serif;color:#fff');
    fundo.setAttribute('role', 'dialog'); fundo.setAttribute('aria-label', 'Ler ' + nome + ' pela câmera');
    var topo = estilo(document.createElement('div'), 'padding:16px 18px;display:flex;flex-direction:column;gap:4px');
    topo.innerHTML = '<strong style="font-size:18px">Ler ' + nome + ' pela câmera</strong>' +
      '<span style="font-size:14px;color:#C7D4E2">Enquadre só os números do visor dentro da moldura e toque em Ler. <b style="color:#FFD166">Experimento</b>: confira sempre o valor.</span>';
    var area = estilo(document.createElement('div'), 'position:relative;flex:1;overflow:hidden;background:#000');
    var video = estilo(document.createElement('video'), 'width:100%;height:100%;object-fit:cover');
    video.setAttribute('playsinline', ''); video.muted = true;
    var moldura = estilo(document.createElement('div'),
      'position:absolute;left:8%;right:8%;top:38%;height:18%;border:3px solid #3ab0c8;border-radius:14px;box-shadow:0 0 0 2000px rgba(0,0,0,.45)');
    area.appendChild(video); area.appendChild(moldura);
    var base = estilo(document.createElement('div'), 'padding:14px 18px 22px;display:flex;flex-direction:column;gap:10px;background:#0F1E2E');
    var msg = estilo(document.createElement('div'), 'min-height:20px;font-size:15px;color:#C7D4E2;text-align:center');
    var linha = estilo(document.createElement('div'), 'display:flex;gap:10px');
    var bCancelar = botao('Cancelar'), bLer = botao('Ler', true), bFoto = botao('Escolher foto');
    bLer.style.flex = '1';
    linha.appendChild(bCancelar); linha.appendChild(bFoto); linha.appendChild(bLer);
    base.appendChild(msg); base.appendChild(linha);
    fundo.appendChild(topo); fundo.appendChild(area); fundo.appendChild(base);
    document.body.appendChild(fundo);

    var fluxo = null;
    function fechar() { if (fluxo) fluxo.getTracks().forEach(function (t) { t.stop(); }); fundo.remove(); }
    bCancelar.onclick = fechar;
    obterLeitor().catch(function () {}); // começa a carregar o leitor enquanto a câmera abre

    var arquivo = Object.assign(document.createElement('input'), { type: 'file', accept: 'image/*' });
    arquivo.setAttribute('capture', 'environment');
    bFoto.onclick = function () { arquivo.click(); };
    arquivo.onchange = function () {
      var f = arquivo.files && arquivo.files[0]; if (!f) return;
      var img = new Image(); img.onload = function () { processar(img, null); }; img.src = URL.createObjectURL(f);
    };

    if (navigator.mediaDevices && navigator.mediaDevices.getUserMedia) {
      navigator.mediaDevices.getUserMedia({ video: { facingMode: { ideal: 'environment' }, width: { ideal: 1920 } }, audio: false }).then(function (s) {
        fluxo = s; video.srcObject = s; return video.play();
      }).catch(function () { msg.textContent = 'Câmera indisponível aqui. Use "Escolher foto".'; bLer.disabled = true; bLer.style.opacity = .45; });
    } else { msg.textContent = 'Este aparelho não abre a câmera pelo navegador. Use "Escolher foto".'; bLer.disabled = true; bLer.style.opacity = .45; }

    // Recorta da imagem do vídeo a parte que está dentro da moldura.
    bLer.onclick = function () {
      if (!video.videoWidth) return;
      var a = area.getBoundingClientRect(), m = moldura.getBoundingClientRect();
      var esc = Math.max(a.width / video.videoWidth, a.height / video.videoHeight); // object-fit: cover
      var dx = (video.videoWidth * esc - a.width) / 2, dy = (video.videoHeight * esc - a.height) / 2;
      var quadro = document.createElement('canvas'); quadro.width = video.videoWidth; quadro.height = video.videoHeight;
      quadro.getContext('2d').drawImage(video, 0, 0);
      processar(quadro, { x: (m.left - a.left + dx) / esc, y: (m.top - a.top + dy) / esc, w: m.width / esc, h: m.height / esc });
    };

    function processar(origem, recorte) {
      msg.textContent = 'Lendo os números… (na primeira vez demora um pouco)';
      bLer.disabled = bFoto.disabled = true;
      var preparado = prepararImagem(origem, recorte);
      lerNumero(preparado).then(function (r) { mostrarResultado(preparado, r); }, function (e) {
        msg.textContent = 'Não foi possível ler (' + (e && e.message ? e.message : 'erro') + '). Tente de novo ou digite.';
        bLer.disabled = bFoto.disabled = false;
      });
    }

    function mostrarResultado(preparado, r) {
      if (fluxo) fluxo.getTracks().forEach(function (t) { t.stop(); });
      area.innerHTML = '';
      estilo(area, 'flex:1;overflow:auto;background:#EEF3F7;color:' + COR.marinho + ';padding:18px;display:flex;flex-direction:column;gap:14px');
      var foto = estilo(document.createElement('img'), 'width:100%;border-radius:12px;border:1px solid ' + COR.borda + ';background:#fff');
      foto.src = preparado.toDataURL('image/png'); foto.alt = 'Recorte do visor';
      var rot = estilo(document.createElement('label'), 'font-weight:700;font-size:15px');
      rot.textContent = nome + ' lido (confira e corrija se precisar)'; rot.htmlFor = 'cam-valor';
      var campo = estilo(Object.assign(document.createElement('input'), { id: 'cam-valor', type: 'text', value: r.numero }),
        'height:70px;border:2px solid ' + COR.borda + ';border-radius:18px;padding:0 18px;font:700 34px Inter,system-ui,sans-serif;color:#0F1E2E;background:#fff;font-variant-numeric:tabular-nums');
      campo.setAttribute('inputmode', 'decimal');
      var info = estilo(document.createElement('div'), 'font-size:14px;color:' + COR.texto);
      info.textContent = r.numero ? 'Confiança da leitura: ' + r.confianca + '%' + (r.confianca < 70 ? ' (baixa: confira com atenção)' : '')
        : 'Nenhum número encontrado. Digite o valor ou tente de novo com o visor mais perto e sem reflexo.';
      area.appendChild(foto); area.appendChild(rot); area.appendChild(campo); area.appendChild(info);
      msg.textContent = '';
      linha.innerHTML = '';
      var bDeNovo = botao('Tentar de novo'), bUsar = botao('Usar este valor', true);
      bUsar.style.flex = '1';
      bDeNovo.onclick = function () { fechar(); abrirCamera(campoId); };
      bUsar.onclick = function () { preencher(campoId, campo.value.trim()); fechar(); };
      linha.appendChild(bDeNovo); linha.appendChild(bUsar);
      campo.focus();
    }
  }

  // Coloca o valor no campo do formulário como se a pessoa tivesse digitado (o app atualiza a tela e as conferências).
  function preencher(campoId, valor) {
    var el = document.getElementById(campoId);
    if (!el || !valor) return;
    var setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set;
    setter.call(el, valor);
    el.dispatchEvent(new Event('input', { bubbles: true }));
    el.dispatchEvent(new Event('blur', { bubbles: true }));
  }

  // ---------- botões no formulário ----------
  // O formulário é redesenhado pelo app; a cada mudança, garante o botão ao lado dos campos.
  function colocarBotoes() {
    Object.keys(CAMPOS).forEach(function (id) {
      var campo = document.getElementById(id);
      if (!campo || campo.type !== 'text') return;
      var caixa = campo.parentElement && campo.parentElement.parentElement;
      if (!caixa || caixa.querySelector('.cam-ler')) return;
      var b = estilo(Object.assign(document.createElement('button'), { type: 'button', className: 'cam-ler' }),
        'align-self:flex-start;display:flex;align-items:center;gap:8px;height:40px;padding:0 14px;border-radius:12px;border:1.5px solid ' + COR.borda +
        ';background:#fff;color:' + COR.azul + ';font:700 14px Inter,system-ui,sans-serif;cursor:pointer');
      b.innerHTML = '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' +
        '<path d="M4 8h3l2-3h6l2 3h3v11H4z"/><circle cx="12" cy="13" r="3.5"/></svg>Ler pela câmera';
      b.setAttribute('aria-label', 'Ler ' + CAMPOS[id] + ' pela câmera');
      b.addEventListener('click', function (e) { e.preventDefault(); e.stopPropagation(); abrirCamera(id); });
      caixa.appendChild(b);
    });
  }
  new MutationObserver(colocarBotoes).observe(document.documentElement, { childList: true, subtree: true });
  window.CAMERA_MACRO = { abrir: abrirCamera, lerNumero: lerNumero, prepararImagem: prepararImagem };
})();
