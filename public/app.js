'use strict';

const EMOJIS = ['🚗', '📱', '✈️', '🏠', '❤️', '🏎️', '🚚', '💼', '🚲', '💻', '🐶', '⛵', '🏥', '🎓'];
const moeda = new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' });
const $ = (sel) => document.querySelector(sel);

const estado = { api: '', busca: '', categoria: '', seguros: [], editandoId: null, excluindoId: null };

function esc(s) {
  return String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

// Texto branco ou escuro sobre a cor primária, escolhido por luminância (contraste AA)
function corSobre(hex) {
  const m = /^#?([0-9a-f]{6})$/i.exec(hex || '');
  if (!m) return '#ffffff';
  const [r, g, b] = [0, 2, 4].map((i) => parseInt(m[1].slice(i, i + 2), 16) / 255)
    .map((c) => (c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4));
  const L = 0.2126 * r + 0.7152 * g + 0.0722 * b;
  return (1.05 / (L + 0.05)) >= ((L + 0.05) / 0.05) ? '#ffffff' : '#1a1d29';
}

function toast(msg, erro = false) {
  const el = document.createElement('div');
  el.className = `toast${erro ? ' erro' : ''}`;
  el.textContent = msg;
  $('#toasts').appendChild(el);
  setTimeout(() => el.remove(), 4000);
}

async function api(caminho, opcoes = {}) {
  const resp = await fetch(`${estado.api}${caminho}`, {
    ...opcoes,
    headers: opcoes.body ? { 'content-type': 'application/json' } : undefined,
  });
  if (resp.status === 204) return null;
  const dados = await resp.json().catch(() => ({}));
  if (!resp.ok) throw new Error(dados.erro || `Erro ${resp.status} ao falar com a API.`);
  return dados;
}

async function carregarConfig() {
  const cfg = await fetch('/config.json', { cache: 'no-store' }).then((r) => r.json());
  estado.api = (cfg.api_url || '').replace(/\/$/, '');
  const raiz = document.documentElement.style;
  if (cfg.primary_color) { raiz.setProperty('--primary', cfg.primary_color); raiz.setProperty('--on-primary', corSobre(cfg.primary_color)); }
  if (cfg.secondary_color) raiz.setProperty('--secondary', cfg.secondary_color);
  if (cfg.insurer_name) {
    document.title = `Catálogo de Seguros — ${cfg.insurer_name}`;
    document.querySelectorAll('[data-nome-seguradora]').forEach((el) => { el.textContent = cfg.insurer_name; });
  }
  if (cfg.created_by) $('#assinatura').textContent = `Criada com ${cfg.created_by}`;
}

async function atualizarStatus() {
  const el = $('#status');
  try {
    const s = await api('/api/status');
    el.className = 'status online';
    el.querySelector('.status-texto').textContent = `API online · banco conectado · ${s.totalSeguros} seguros`;
  } catch (e) {
    el.className = 'status offline';
    el.querySelector('.status-texto').textContent = 'API indisponível';
  }
}

async function carregarCategorias() {
  try {
    const cats = await api('/api/categorias');
    const nav = $('#categorias');
    nav.innerHTML = ['', ...cats].map((c) =>
      `<button type="button" class="pilula${c === estado.categoria ? ' ativa' : ''}" data-categoria="${esc(c)}">${c ? esc(c) : 'Todas'}</button>`).join('');
    $('#lista-categorias').innerHTML = cats.map((c) => `<option value="${esc(c)}">`).join('');
  } catch (e) { /* status já sinaliza */ }
}

async function carregarSeguros() {
  const p = new URLSearchParams();
  if (estado.busca) p.set('busca', estado.busca);
  if (estado.categoria) p.set('categoria', estado.categoria);
  try {
    estado.seguros = await api(`/api/seguros${p.toString() ? `?${p}` : ''}`);
    renderizar();
  } catch (e) {
    $('#grade').innerHTML = `<p class="vazio">Não foi possível carregar os seguros. ${esc(e.message)}</p>`;
    $('#contador').textContent = '';
  }
}

function renderizar() {
  const lista = estado.seguros;
  $('#contador').textContent = `${lista.length} ${lista.length === 1 ? 'seguro encontrado' : 'seguros encontrados'}`;
  if (!lista.length) { $('#grade').innerHTML = '<p class="vazio">Nenhum seguro encontrado.</p>'; return; }
  $('#grade').innerHTML = lista.map((s) => `
    <article class="cartao">
      <div class="cartao-imagem" aria-hidden="true">${esc(s.imagem)}</div>
      <div class="cartao-corpo">
        <span class="categoria">${esc(s.categoria)}</span>
        <h3>${esc(s.titulo)}</h3>
        <p class="descricao">${esc(s.descricao)}</p>
        <p class="cobertura"><strong>Destaque:</strong> ${esc(s.cobertura_destaque)}</p>
        <p class="valor">${moeda.format(s.valor_mensal)} <small>/mês</small></p>
      </div>
      <div class="cartao-acoes">
        <button class="botao" type="button" data-editar="${s.id}">Editar</button>
        <button class="botao" type="button" data-excluir="${s.id}">Excluir</button>
      </div>
    </article>`).join('');
}

function selecionarEmoji(valor) {
  $('#form-seguro').imagem.value = valor;
  document.querySelectorAll('#emojis button').forEach((b) => b.classList.toggle('selecionado', b.dataset.emoji === valor));
}

function abrirFormulario(seguro) {
  const f = $('#form-seguro');
  f.reset();
  $('#erro-form').textContent = '';
  estado.editandoId = seguro ? seguro.id : null;
  $('#modal-titulo').textContent = seguro ? 'Editar seguro' : 'Novo seguro';
  if (seguro) ['titulo', 'descricao', 'categoria', 'valor_mensal', 'cobertura_destaque'].forEach((k) => { f[k].value = seguro[k]; });
  selecionarEmoji(seguro ? seguro.imagem : EMOJIS[0]);
  $('#modal-seguro').showModal();
}

async function salvar(ev) {
  ev.preventDefault();
  const f = ev.target;
  const dados = Object.fromEntries(new FormData(f).entries());
  const faltam = Object.entries(dados).filter(([, v]) => !String(v).trim());
  if (faltam.length) { $('#erro-form').textContent = 'Preencha todos os campos.'; return; }
  dados.valor_mensal = Number(dados.valor_mensal);
  try {
    if (estado.editandoId) {
      await api(`/api/seguros/${estado.editandoId}`, { method: 'PUT', body: JSON.stringify(dados) });
      toast('Seguro atualizado com sucesso.');
    } else {
      await api('/api/seguros', { method: 'POST', body: JSON.stringify(dados) });
      toast('Seguro criado com sucesso.');
    }
    $('#modal-seguro').close();
    await Promise.all([carregarSeguros(), carregarCategorias(), atualizarStatus()]);
  } catch (e) {
    $('#erro-form').textContent = e.message;
  }
}

async function confirmarExclusao() {
  try {
    await api(`/api/seguros/${estado.excluindoId}`, { method: 'DELETE' });
    toast('Seguro excluído.');
    $('#modal-excluir').close();
    await Promise.all([carregarSeguros(), carregarCategorias(), atualizarStatus()]);
  } catch (e) {
    toast(e.message, true);
  }
}

function ligarEventos() {
  let timer;
  $('#busca').addEventListener('input', (e) => {
    clearTimeout(timer);
    timer = setTimeout(() => { estado.busca = e.target.value.trim(); carregarSeguros(); }, 300);
  });
  $('#categorias').addEventListener('click', (e) => {
    const b = e.target.closest('[data-categoria]'); if (!b) return;
    estado.categoria = b.dataset.categoria;
    document.querySelectorAll('.pilula').forEach((p) => p.classList.toggle('ativa', p === b));
    carregarSeguros();
  });
  $('#novo').addEventListener('click', () => abrirFormulario(null));
  $('#grade').addEventListener('click', (e) => {
    const ed = e.target.closest('[data-editar]');
    const ex = e.target.closest('[data-excluir]');
    if (ed) abrirFormulario(estado.seguros.find((s) => String(s.id) === ed.dataset.editar));
    if (ex) {
      const s = estado.seguros.find((x) => String(x.id) === ex.dataset.excluir);
      estado.excluindoId = s.id;
      $('#texto-excluir').textContent = `Tem certeza que deseja excluir "${s.titulo}"? Esta ação não pode ser desfeita.`;
      $('#modal-excluir').showModal();
    }
  });
  $('#emojis').innerHTML = EMOJIS.map((em) => `<button type="button" data-emoji="${em}" aria-label="Usar ${em}">${em}</button>`).join('');
  $('#emojis').addEventListener('click', (e) => { const b = e.target.closest('[data-emoji]'); if (b) selecionarEmoji(b.dataset.emoji); });
  $('#form-seguro').imagem.addEventListener('input', (e) => selecionarEmoji(e.target.value));
  $('#form-seguro').addEventListener('submit', salvar);
  $('#confirmar-excluir').addEventListener('click', confirmarExclusao);
  document.querySelectorAll('[data-fechar]').forEach((b) => b.addEventListener('click', () => b.closest('dialog').close()));
}

(async function iniciar() {
  ligarEventos();
  try { await carregarConfig(); } catch (e) { toast('Não foi possível carregar a configuração.', true); }
  await Promise.all([atualizarStatus(), carregarCategorias(), carregarSeguros()]);
  setInterval(atualizarStatus, 30000);
})();
