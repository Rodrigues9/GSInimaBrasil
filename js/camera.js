/* Experimento: leitura do visor do macromedidor pela câmera do celular (só na versão Azure).
 *
 * No formulário do macromedidor aparece um botão "Ler visor pela câmera", acima dos campos.
 * A câmera traseira abre com uma moldura; a pessoa enquadra o visor (vazão e totalizador) e toca em "Ler".
 * A foto é lida no próprio aparelho (Tesseract.js, carregado só na primeira vez): o número com mais
 * dígitos vira o totalizador e o outro, a vazão. Os dois aparecem junto do recorte da foto, para conferir,
 * e só entram nos campos se a pessoa confirmar. Pontos sem vazão usam só o totalizador.
 */
(function () {
  'use strict';

  var TESSERACT = 'https://cdn.jsdelivr.net/npm/tesseract.js@5.1.1/dist/tesseract.min.js';
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
        // Bloco de texto (o visor tem duas linhas: vazão e totalizador).
        return w.setParameters({ tessedit_char_whitelist: '0123456789.,', tessedit_pageseg_mode: '6' }).then(function () { return w; });
      });
      leitor.catch(function () { leitor = null; });
    }
    return leitor;
  }

  // Deixa a foto mais fácil de ler: cinza, contraste alto e preto no branco (visores de LCD costumam ser escuros no claro).
  function prepararImagem(origem, recorte) {
    var w = recorte ? recorte.w : origem.width, h = recorte ? recorte.h : origem.height;
    var escala = Math.max(1, 1000 / w);
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

  // Separa os números do visor: o de mais dígitos é o totalizador; o outro (de preferência com vírgula) é a vazão.
  function separar(texto) {
    var nums = (texto.match(/\d[\d.,]*/g) || []).map(function (t) { return t.replace(/[.,]+$/, ''); })
      .filter(function (t) { return t.replace(/\D/g, '').length >= 1; });
    var digitos = function (t) { return t.replace(/\D/g, '').length; };
    var ordem = nums.slice().sort(function (a, b) { return digitos(b) - digitos(a); });
    var tot = ordem[0] || '';
    var resto = nums.filter(function (t) { return t !== tot; });
    var vaz = resto.filter(function (t) { return /[.,]/.test(t); })[0] || resto[0] || '';
    return { tot: tot.replace(/[.,]/g, ''), vaz: vaz.replace('.', ',') };
  }

  function lerVisor(canvas) {
    return obterLeitor().then(function (w) { return w.recognize(canvas); }).then(function (r) {
      var texto = (r.data && r.data.text) || '';
      var res = separar(texto);
      res.texto = texto.trim(); res.confianca = Math.round((r.data && r.data.confidence) || 0);
      return res;
    });
  }

  // ---------- tela da câmera ----------
  function estilo(el, css) { el.style.cssText = css; return el; }
  function botao(texto, primario) {
    return estilo(Object.assign(document.createElement('button'), { type: 'button', textContent: texto }),
      'height:52px;border-radius:16px;font:700 16px Inter,system-ui,sans-serif;cursor:pointer;padding:0 18px;' +
      (primario ? 'border:0;background:' + COR.azul + ';color:#fff' : 'border:1.5px solid ' + COR.borda + ';background:#fff;color:' + COR.marinho));
  }

  function abrirCamera() {
    var temVazao = !!document.getElementById('vaz');
    var oQue = temVazao ? 'a vazão e o totalizador' : 'o totalizador';
    var fundo = estilo(document.createElement('div'),
      'position:fixed;inset:0;z-index:9999;background:#0F1E2E;display:flex;flex-direction:column;font-family:Inter,system-ui,sans-serif;color:#fff');
    fundo.setAttribute('role', 'dialog'); fundo.setAttribute('aria-label', 'Ler visor pela câmera');
    var topo = estilo(document.createElement('div'), 'padding:16px 18px;display:flex;flex-direction:column;gap:4px');
    topo.innerHTML = '<strong style="font-size:18px">Ler visor pela câmera</strong>' +
      '<span style="font-size:14px;color:#C7D4E2">Enquadre o visor com ' + oQue + ' dentro da moldura e toque em Ler. <b style="color:#FFD166">Experimento</b>: confira sempre os valores.</span>';
    var area = estilo(document.createElement('div'), 'position:relative;flex:1;overflow:hidden;background:#000');
    var video = estilo(document.createElement('video'), 'width:100%;height:100%;object-fit:cover');
    video.setAttribute('playsinline', ''); video.muted = true;
    var moldura = estilo(document.createElement('div'),
      'position:absolute;left:6%;right:6%;top:30%;height:' + (temVazao ? '34%' : '18%') + ';border:3px solid #3ab0c8;border-radius:14px;box-shadow:0 0 0 2000px rgba(0,0,0,.45)');
    area.appendChild(video); area.appendChild(moldura);
    var base = estilo(document.createElement('div'), 'padding:14px 18px 22px;display:flex;flex-direction:column;gap:10px;background:#0F1E2E');
    var msg = estilo(document.createElement('div'), 'min-height:20px;font-size:15px;color:#C7D4E2;text-align:center');
    var linha = estilo(document.createElement('div'), 'display:flex;gap:10px');
    var bCancelar = botao('Cancelar'), bLer = botao('Ler', true);
    bLer.style.flex = '1';
    linha.appendChild(bCancelar); linha.appendChild(bLer);
    base.appendChild(msg); base.appendChild(linha);
    fundo.appendChild(topo); fundo.appendChild(area); fundo.appendChild(base);
    document.body.appendChild(fundo);

    var fluxo = null;
    function fechar() { if (fluxo) fluxo.getTracks().forEach(function (t) { t.stop(); }); fundo.remove(); }
    function semCamera(texto) { msg.textContent = texto; bLer.disabled = true; bLer.style.opacity = 0.45; }
    bCancelar.onclick = fechar;
    obterLeitor().catch(function () {}); // começa a carregar o leitor enquanto a câmera abre

    if (navigator.mediaDevices && navigator.mediaDevices.getUserMedia) {
      navigator.mediaDevices.getUserMedia({ video: { facingMode: { ideal: 'environment' }, width: { ideal: 1920 } }, audio: false }).then(function (s) {
        fluxo = s; video.srcObject = s; return video.play();
      }).catch(function () { semCamera('Não foi possível abrir a câmera. Confira se o navegador tem permissão para usá-la.'); });
    } else semCamera('Este aparelho não abre a câmera pelo navegador.');

    // Recorta da imagem do vídeo a parte que está dentro da moldura.
    bLer.onclick = function () {
      if (!video.videoWidth) return;
      var a = area.getBoundingClientRect(), m = moldura.getBoundingClientRect();
      var esc = Math.max(a.width / video.videoWidth, a.height / video.videoHeight); // object-fit: cover
      var dx = (video.videoWidth * esc - a.width) / 2, dy = (video.videoHeight * esc - a.height) / 2;
      var quadro = document.createElement('canvas'); quadro.width = video.videoWidth; quadro.height = video.videoHeight;
      quadro.getContext('2d').drawImage(video, 0, 0);
      msg.textContent = 'Lendo os números… (na primeira vez demora um pouco)';
      bLer.disabled = true;
      var preparado = prepararImagem(quadro, { x: (m.left - a.left + dx) / esc, y: (m.top - a.top + dy) / esc, w: m.width / esc, h: m.height / esc });
      lerVisor(preparado).then(function (r) { mostrarResultado(preparado, r); }, function (e) {
        msg.textContent = 'Não foi possível ler (' + (e && e.message ? e.message : 'erro') + '). Tente de novo ou digite.';
        bLer.disabled = false;
      });
    };

    function campoResultado(id, rotulo, valor, unidade) {
      var caixa = estilo(document.createElement('div'), 'display:flex;flex-direction:column;gap:6px');
      var rot = estilo(document.createElement('label'), 'font-weight:700;font-size:15px');
      rot.textContent = rotulo; rot.htmlFor = id;
      var dentro = estilo(document.createElement('div'), 'position:relative');
      var campo = estilo(Object.assign(document.createElement('input'), { id: id, type: 'text', value: valor }),
        'width:100%;box-sizing:border-box;height:64px;border:2px solid ' + COR.borda + ';border-radius:18px;padding:0 64px 0 18px;font:700 30px Inter,system-ui,sans-serif;color:#0F1E2E;background:#fff;font-variant-numeric:tabular-nums');
      campo.setAttribute('inputmode', 'decimal');
      var un = estilo(document.createElement('span'), 'position:absolute;right:18px;top:20px;font-weight:700;font-size:17px;color:' + COR.texto);
      un.textContent = unidade;
      dentro.appendChild(campo); dentro.appendChild(un);
      caixa.appendChild(rot); caixa.appendChild(dentro);
      return { caixa: caixa, campo: campo };
    }

    function mostrarResultado(preparado, r) {
      if (fluxo) fluxo.getTracks().forEach(function (t) { t.stop(); });
      area.innerHTML = '';
      estilo(area, 'flex:1;overflow:auto;background:#EEF3F7;color:' + COR.marinho + ';padding:18px;display:flex;flex-direction:column;gap:14px');
      var foto = estilo(document.createElement('img'), 'width:100%;border-radius:12px;border:1px solid ' + COR.borda + ';background:#fff');
      foto.src = preparado.toDataURL('image/png'); foto.alt = 'Recorte do visor';
      area.appendChild(foto);
      var cVaz = temVazao ? campoResultado('cam-vaz', 'Vazão lida', r.vaz, 'm³/h') : null;
      var cTot = campoResultado('cam-tot', 'Totalizador lido', r.tot, 'm³');
      if (cVaz) area.appendChild(cVaz.caixa);
      area.appendChild(cTot.caixa);
      var info = estilo(document.createElement('div'), 'font-size:14px;color:' + COR.texto);
      info.textContent = (r.tot || r.vaz) ? 'Confiança da leitura: ' + r.confianca + '%' + (r.confianca < 70 ? ' (baixa: confira com atenção)' : '') + '. Confira e corrija se precisar.'
        : 'Nenhum número encontrado. Digite os valores ou tente de novo com o visor mais perto e sem reflexo.';
      area.appendChild(info);
      msg.textContent = '';
      linha.innerHTML = '';
      var bDeNovo = botao('Tentar de novo'), bUsar = botao('Usar estes valores', true);
      bUsar.style.flex = '1';
      bDeNovo.onclick = function () { fechar(); abrirCamera(); };
      bUsar.onclick = function () {
        if (cVaz) preencher('vaz', cVaz.campo.value.trim());
        preencher('tot', cTot.campo.value.trim());
        fechar();
      };
      linha.appendChild(bDeNovo); linha.appendChild(bUsar);
    }
  }

  // Coloca o valor no campo do formulário como se a pessoa tivesse digitado (o app atualiza a tela e as conferências).
  function preencher(campoId, valor) {
    var el = document.getElementById(campoId);
    if (!el || !valor) return;
    Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set.call(el, valor);
    el.dispatchEvent(new Event('input', { bubbles: true }));
    el.dispatchEvent(new Event('blur', { bubbles: true }));
  }

  // ---------- botão no formulário ----------
  // Um botão só, na linha do título do primeiro campo (vazão, ou totalizador nos pontos sem vazão).
  // O app redesenha o formulário comparando os elementos pela posição; por isso o botão entra sempre
  // como ÚLTIMO elemento da linha do título (o app só o remove, sem recriar os campos) e volta a cada desenho.
  function colocarBotao() {
    var tot = document.getElementById('tot');
    if (!tot || tot.type !== 'text') return;
    var primeiro = document.getElementById('vaz') || tot;
    var bloco = primeiro.parentElement && primeiro.parentElement.parentElement; // caixa do campo (título + campo)
    var titulo = bloco && bloco.firstElementChild; // linha com o rótulo do campo
    if (!titulo || titulo.querySelector('.cam-ler')) return;
    var b = estilo(Object.assign(document.createElement('button'), { type: 'button', className: 'cam-ler' }),
      'margin-left:auto;display:flex;align-items:center;gap:8px;height:38px;padding:0 12px;border-radius:12px;border:1.5px solid ' + COR.azul +
      ';background:#fff;color:' + COR.azul + ';font:700 14px Inter,system-ui,sans-serif;cursor:pointer;white-space:nowrap');
    b.innerHTML = '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' +
      '<path d="M4 8h3l2-3h6l2 3h3v11H4z"/><circle cx="12" cy="13" r="3.5"/></svg>Ler visor pela câmera';
    b.setAttribute('aria-label', 'Ler vazão e totalizador pela câmera');
    b.addEventListener('click', function (e) { e.preventDefault(); e.stopPropagation(); abrirCamera(); });
    titulo.appendChild(b);
  }
  new MutationObserver(colocarBotao).observe(document.documentElement, { childList: true, subtree: true });
  window.CAMERA_MACRO = { abrir: abrirCamera, lerVisor: lerVisor, prepararImagem: prepararImagem, separar: separar };
})();
