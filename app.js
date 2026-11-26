// Pega aquí la URL de la aplicación web de Google Apps Script (termina en /exec)
const API_URL = 'https://script.google.com/macros/s/AKfycbz-ejn5gK8njUMVnzFChN-H7rrndhqDTu9MFOfGxBi0IFL1KFMHBe4q2Efl1OYlJ4dw/exec';
const WHATSAPP = '526188070846';
const PRICE = 130;
const BOX = 15;
const FLAVORS = [
  { name: 'Piña', color: '#f4c430', text: 'Dulce y tropical, con trocitos de piña.' },
  { name: 'Cajeta', color: '#a0522d', text: 'Cremosa cajeta de leche de cabra.' },
  { name: 'Membrillo', color: '#d9822b', text: 'Ate de membrillo, el clásico de siempre.' },
  { name: 'Fresa', color: '#e63950', text: 'Mermelada de fresa natural.' },
  { name: 'Guayaba', color: '#f08a7e', text: 'Guayaba casera, aromática y dulce.' },
  { name: 'Zarzamora', color: '#6b2d5c', text: 'Zarzamora con su toque ácido.' },
];

const $ = (s) => document.querySelector(s);
const money = (n) => `$${n.toLocaleString('es-MX')}`;
const cart = [];
const custom = Object.fromEntries(FLAVORS.map((f) => [f.name, 0]));

// Fecha de entrega calculada en Google (corte: viernes 12:00 pm, hora de México)
fetch(API_URL).then((r) => r.json()).then(({ delivery }) => {
  const [y, m, d] = delivery.split('-').map(Number);
  $('#delivery-date').textContent = new Date(y, m - 1, d).toLocaleDateString('es-MX', { weekday: 'long', day: 'numeric', month: 'long' });
}).catch(() => {});

// Sabores
$('#flavor-grid').innerHTML = FLAVORS.map((f) => `
  <article class="flavor" style="--fill:${f.color}">
    <svg aria-hidden="true"><use href="#empanada"/></svg>
    <h3>${f.name}</h3><p>${f.text}</p>
  </article>`).join('');
$('#single-flavor').innerHTML = FLAVORS.map((f) => `<option>${f.name}</option>`).join('');

// Arma tu caja
$('#custom-list').innerHTML = FLAVORS.map((f) => `
  <div class="stepper" style="--fill:${f.color}">
    <span><span class="dot"></span>${f.name}</span>
    <span class="controls">
      <button type="button" class="step" data-flavor="${f.name}" data-d="-1" aria-label="Quitar una de ${f.name}">−</button>
      <output data-out="${f.name}" aria-live="polite">0</output>
      <button type="button" class="step" data-flavor="${f.name}" data-d="1" aria-label="Agregar una de ${f.name}">+</button>
    </span>
  </div>`).join('');

const customTotal = () => Object.values(custom).reduce((a, b) => a + b, 0);
function renderCustom() {
  const total = customTotal();
  $('#custom-count').textContent = total;
  $('#custom-meter').style.width = `${(total / BOX) * 100}%`;
  document.querySelectorAll('[data-out]').forEach((o) => (o.textContent = custom[o.dataset.out]));
  document.querySelectorAll('[data-flavor]').forEach((b) => {
    b.disabled = b.dataset.d === '1' ? total >= BOX : custom[b.dataset.flavor] === 0;
  });
}
$('#custom-list').addEventListener('click', (e) => {
  const b = e.target.closest('[data-flavor]');
  if (!b) return;
  custom[b.dataset.flavor] = Math.max(0, custom[b.dataset.flavor] + Number(b.dataset.d));
  renderCustom();
});
renderCustom();

// Paneles según tipo de caja
const boxForm = $('#box-form');
boxForm.addEventListener('change', (e) => {
  if (e.target.name !== 'type') return;
  document.querySelectorAll('[data-panel]').forEach((p) => (p.hidden = p.dataset.panel !== e.target.value));
});
boxForm.addEventListener('click', (e) => {
  const b = e.target.closest('[data-qty]');
  if (!b) return;
  const q = $('#qty');
  q.value = Math.min(20, Math.max(1, (Number(q.value) || 1) + Number(b.dataset.qty)));
});

function boxLabel(b) {
  if (b.type === 'single') return `${b.flavor} (caja completa)`;
  if (b.type === 'mix') return 'Mix surtido';
  return `Arma tu caja: ${Object.entries(b.counts).filter(([, n]) => n).map(([f, n]) => `${f} ${n}`).join(', ')}`;
}

boxForm.addEventListener('submit', (e) => {
  e.preventDefault();
  const type = boxForm.type.value;
  const qty = Number($('#qty').value);
  $('#box-error').textContent = '';
  if (!Number.isInteger(qty) || qty < 1 || qty > 20) return ($('#box-error').textContent = 'Elige entre 1 y 20 cajas.');
  const box = { type, flour: boxForm.flour.value, qty };
  if (type === 'single') box.flavor = $('#single-flavor').value;
  if (type === 'custom') {
    const left = BOX - customTotal();
    if (left) return ($('#box-error').textContent = `Te faltan ${left} empanadas para completar la caja.`);
    box.counts = { ...custom };
    FLAVORS.forEach((f) => (custom[f.name] = 0));
    renderCustom();
  }
  cart.push(box);
  $('#qty').value = 1;
  renderCart();
  $('#cart').lastElementChild.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
});

function renderCart() {
  const boxes = cart.reduce((s, b) => s + b.qty, 0);
  $('#cart').innerHTML = cart.length
    ? cart.map((b, i) => `<li><span>${b.qty}× ${boxLabel(b)}<small>Harina ${b.flour.toLowerCase()} · ${money(b.qty * PRICE)}</small></span>
        <button type="button" class="remove" data-remove="${i}" aria-label="Quitar ${boxLabel(b)}">Quitar</button></li>`).join('')
    : '<li class="empty">Aún no agregas cajas.</li>';
  $('#total').textContent = money(boxes * PRICE);
  $('#total-boxes').textContent = boxes ? `(${boxes} ${boxes === 1 ? 'caja' : 'cajas'})` : '';
}
$('#cart').addEventListener('click', (e) => {
  const b = e.target.closest('[data-remove]');
  if (b) { cart.splice(Number(b.dataset.remove), 1); renderCart(); }
});

// Enviar pedido: se guarda en el servidor (Excel) y se abre WhatsApp con el resumen
const orderForm = $('#order-form');
orderForm.addEventListener('submit', async (e) => {
  e.preventDefault();
  const err = $('#order-error');
  err.textContent = '';
  const data = { name: orderForm.name.value.trim(), address: orderForm.address.value.trim(), phone: orderForm.phone.value.trim(), boxes: cart };
  if (!cart.length) return (err.textContent = 'Agrega al menos una caja a tu pedido.');
  if (!data.name) return (err.textContent = 'Escribe tu nombre.', orderForm.name.focus());
  if (!data.address) return (err.textContent = 'Escribe tu dirección.', orderForm.address.focus());
  if (data.phone.replace(/\D/g, '').length < 10) return (err.textContent = 'Escribe tu teléfono a 10 dígitos.', orderForm.phone.focus());

  const btn = $('#send-btn');
  btn.disabled = true;
  try {
    // text/plain evita la verificación CORS previa, que Apps Script no responde
    const res = await fetch(API_URL, { method: 'POST', headers: { 'Content-Type': 'text/plain;charset=utf-8' }, body: JSON.stringify(data) });
    const out = await res.json();
    if (!res.ok || out.error) throw new Error(out.error || 'No se pudo enviar el pedido.');

    const [y, m, d] = out.delivery.split('-').map(Number);
    const when = new Date(y, m - 1, d).toLocaleDateString('es-MX', { weekday: 'long', day: 'numeric', month: 'long' });
    const msg = [
      '¡Hola! Quiero hacer un pedido de empanadas 🥟',
      '',
      ...cart.map((b) => `• ${b.qty}× ${boxLabel(b)} — harina ${b.flour.toLowerCase()}`),
      '',
      `Total: ${money(out.total)} (${out.totalBoxes} ${out.totalBoxes === 1 ? 'caja' : 'cajas'})`,
      `Entrega: ${when}`,
      '',
      `Nombre: ${data.name}`,
      `Dirección: ${data.address}`,
      `Teléfono: ${data.phone}`,
    ].join('\n');
    const url = `https://wa.me/${WHATSAPP}?text=${encodeURIComponent(msg)}`;

    $('#thanks-text').textContent = `Tu pedido de ${out.totalBoxes} ${out.totalBoxes === 1 ? 'caja' : 'cajas'} (${money(out.total)}) quedó registrado. Te lo llevamos el ${when}.`;
    $('#wa-link').href = url;
    $('#thanks').showModal();
    window.open(url, '_blank', 'noopener');

    cart.length = 0;
    renderCart();
    orderForm.reset();
  } catch (ex) {
    err.textContent = ex.message === 'Failed to fetch' ? 'Sin conexión. Revisa tu internet e intenta de nuevo.' : ex.message;
  } finally {
    btn.disabled = false;
  }
});
