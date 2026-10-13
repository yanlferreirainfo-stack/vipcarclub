/* =========================================================
   VipCar Club — Landing page de orçamento
   ========================================================= */

// ---- Configuração -------------------------------------------------------
// Cloudinary (upload da foto). Deixe vazio para desativar: a mensagem do
// WhatsApp pede para o cliente enviar a foto na própria conversa.
const CLOUD_NAME = 'zg0ey9fk';
const UPLOAD_PRESET = 'Vipcar';

const WHATSAPP_NUMBER = '5531991701636';
const PHOTO_MAX_SIZE = 1600;     // maior lado da foto, em pixels
const PHOTO_QUALITY = 0.8;       // qualidade do JPEG (0 a 1)
const UPLOAD_TIMEOUT_MS = 20000; // depois disso, segue sem a foto
const SLIDE_INTERVAL_MS = 5000;  // tempo de cada foto no topo
const PHOTO_FALLBACK = 'Vou enviar a foto do veículo aqui na conversa.';

// ---- Altura fixa da foto do topo no celular ------------------------------
// A barra de endereço do celular some/aparece ao rolar e muda a altura da tela.
// Fixamos a altura em pixels e só recalculamos se a largura mudar (girar o celular).
(function lockHeroHeight() {
  const root = document.documentElement;
  let lastWidth = 0;
  const set = () => {
    if (window.innerWidth === lastWidth) return;
    lastWidth = window.innerWidth;
    root.style.setProperty('--hero-h', `${window.innerHeight}px`);
  };
  set();
  window.addEventListener('resize', set);
})();

// ---- Slideshow do topo --------------------------------------------------
(function slideshow() {
  const slides = document.querySelectorAll('.hero__slide');
  const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  if (slides.length < 2 || reduceMotion) return;

  let current = 0;
  const next = () => {
    if (document.hidden) return;
    const target = slides[(current + 1) % slides.length];
    // Só troca quando a próxima foto já carregou, para não piscar fundo preto
    if (!target.complete || !target.naturalWidth) return;
    slides[current].classList.remove('is-active');
    current = (current + 1) % slides.length;
    target.classList.add('is-active');
  };

  // Começa depois do carregamento da página, para a primeira foto ter prioridade
  const start = () => {
    slides.forEach((img) => { img.loading = 'eager'; });
    setInterval(next, SLIDE_INTERVAL_MS);
  };
  if (document.readyState === 'complete') start();
  else window.addEventListener('load', start, { once: true });
})();

// ---- Rolar até o formulário ----------------------------------------------
document.querySelectorAll('[data-scroll-to-form]').forEach((link) => {
  link.addEventListener('click', (e) => {
    e.preventDefault();
    const card = document.getElementById('orcamento');
    card.scrollIntoView({ behavior: 'smooth', block: 'start' });
    // Foca o primeiro campo sem "pular" a rolagem suave
    setTimeout(() => document.getElementById('nome').focus({ preventScroll: true }), 500);
  });
});

// Esconde o WhatsApp flutuante enquanto o formulário está na tela (não cobre os campos)
const waFloat = document.querySelector('.wa-float');
if ('IntersectionObserver' in window && waFloat) {
  new IntersectionObserver(([entry]) => {
    waFloat.classList.toggle('is-hidden', entry.isIntersecting);
  }, { threshold: 0.15 }).observe(document.getElementById('lead-form'));
}

document.getElementById('year').textContent = new Date().getFullYear();

// ---- Formulário ---------------------------------------------------------
const form = document.getElementById('lead-form');
const submitBtn = document.getElementById('submit-btn');
const submitLabel = submitBtn.querySelector('.btn__label');
const statusEl = document.getElementById('form-status');
const fileInputs = [document.getElementById('foto-camera'), document.getElementById('foto-galeria')];
const preview = document.getElementById('photo-preview');
const previewImg = document.getElementById('photo-img');
const photoActions = document.getElementById('photo-actions');

let selectedFile = null;
let previewUrl = null;
let sending = false;

// Pré-visualização da foto
fileInputs.forEach((input) => {
  input.addEventListener('change', () => {
    const file = input.files && input.files[0];
    input.value = ''; // permite escolher a mesma foto de novo
    if (!file) return;
    if (!file.type.startsWith('image/') && !/\.(heic|heif)$/i.test(file.name)) {
      statusEl.textContent = 'Escolha um arquivo de imagem.';
      return;
    }
    statusEl.textContent = '';
    setPhoto(file);
  });
});

document.getElementById('photo-remove').addEventListener('click', () => {
  setPhoto(null);
  fileInputs[1].focus();
});

function setPhoto(file) {
  if (previewUrl) URL.revokeObjectURL(previewUrl);
  selectedFile = file;
  previewUrl = file ? URL.createObjectURL(file) : null;
  if (previewUrl) previewImg.src = previewUrl; else previewImg.removeAttribute('src');
  preview.hidden = !file;
  photoActions.hidden = !!file;
}

// Validação
const fields = {
  nome: { el: form.elements.nome, msg: 'Informe seu nome.' },
  modelo: { el: form.elements.modelo, msg: 'Informe o modelo do carro.' },
  servico: { el: form.elements.servico, msg: 'Selecione o serviço.' },
};

function validateField(key) {
  const { el, msg } = fields[key];
  const ok = el.value.trim() !== '';
  el.setAttribute('aria-invalid', ok ? 'false' : 'true');
  document.getElementById(`${key}-erro`).textContent = ok ? '' : msg;
  return ok;
}

Object.keys(fields).forEach((key) => {
  const { el } = fields[key];
  const evt = el.tagName === 'SELECT' ? 'change' : 'input';
  // Só revalida depois que o campo já foi marcado como inválido
  el.addEventListener(evt, () => { if (el.getAttribute('aria-invalid') === 'true') validateField(key); });
});

form.addEventListener('submit', async (e) => {
  e.preventDefault();
  if (sending) return;

  const invalid = Object.keys(fields).filter((key) => !validateField(key));
  if (invalid.length) {
    fields[invalid[0]].el.focus();
    return;
  }

  const nome = fields.nome.el.value.trim();
  const modelo = fields.modelo.el.value.trim();
  const servico = fields.servico.el.value;

  // Meta Pixel: Lead antes de ir para o WhatsApp
  if (typeof fbq === 'function') fbq('track', 'Lead', { content_name: servico });

  sending = true;
  submitBtn.disabled = true;
  submitBtn.classList.add('is-loading');
  submitLabel.textContent = 'Enviando...';

  let fotoLinha = PHOTO_FALLBACK;
  if (selectedFile && CLOUD_NAME && UPLOAD_PRESET) {
    statusEl.textContent = 'Enviando a foto...';
    try {
      fotoLinha = await uploadPhoto(selectedFile);
    } catch (err) {
      console.warn('Upload da foto falhou, seguindo sem ela:', err);
      fotoLinha = PHOTO_FALLBACK;
    }
  } else {
    // Pequena pausa para o Pixel conseguir registrar o evento antes de sair da página
    await wait(400);
  }

  const mensagem = [
    'Olá, VipCar Club! Gostaria de um orçamento.',
    `Nome: ${nome}`,
    `Carro: ${modelo}`,
    `Serviço: ${servico}`,
    `Foto: ${fotoLinha}`,
  ].join('\n');

  statusEl.textContent = 'Abrindo o WhatsApp...';
  window.location.href = `https://wa.me/${WHATSAPP_NUMBER}?text=${encodeURIComponent(mensagem)}`;

  // Se o usuário voltar para a página, o botão volta ao normal
  setTimeout(resetButton, 2500);
});

// Volta do WhatsApp com a página em cache (Safari/iOS)
window.addEventListener('pageshow', (e) => { if (e.persisted) resetButton(); });

function resetButton() {
  sending = false;
  submitBtn.disabled = false;
  submitBtn.classList.remove('is-loading');
  submitLabel.textContent = 'Solicitar orçamento';
  statusEl.textContent = '';
}

// ---- Upload para o Cloudinary ---------------------------------------------
async function uploadPhoto(file) {
  let blob;
  try {
    blob = await compressImage(file);
  } catch (err) {
    // Formato que o navegador não abre (ex.: HEIC no Android): envia o original
    blob = file;
  }

  const data = new FormData();
  data.append('file', blob, 'veiculo.jpg');
  data.append('upload_preset', UPLOAD_PRESET);

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), UPLOAD_TIMEOUT_MS);
  try {
    const res = await fetch(`https://api.cloudinary.com/v1_1/${CLOUD_NAME}/image/upload`, {
      method: 'POST',
      body: data,
      signal: controller.signal,
    });
    if (!res.ok) throw new Error(`Cloudinary respondeu ${res.status}`);
    const json = await res.json();
    if (!json.secure_url) throw new Error('Resposta sem secure_url');
    return json.secure_url;
  } finally {
    clearTimeout(timer);
  }
}

// Reduz para no máximo PHOTO_MAX_SIZE px e converte para JPEG
function compressImage(file) {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      URL.revokeObjectURL(url);
      const scale = Math.min(1, PHOTO_MAX_SIZE / Math.max(img.naturalWidth, img.naturalHeight));
      const w = Math.round(img.naturalWidth * scale);
      const h = Math.round(img.naturalHeight * scale);
      const canvas = document.createElement('canvas');
      canvas.width = w;
      canvas.height = h;
      const ctx = canvas.getContext('2d');
      ctx.fillStyle = '#fff';
      ctx.fillRect(0, 0, w, h);
      ctx.drawImage(img, 0, 0, w, h);
      canvas.toBlob((blob) => (blob ? resolve(blob) : reject(new Error('Falha ao gerar JPEG'))), 'image/jpeg', PHOTO_QUALITY);
    };
    img.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error('Não foi possível ler a imagem'));
    };
    img.src = url;
  });
}

function wait(ms) {
  return new Promise((r) => setTimeout(r, ms));
}
