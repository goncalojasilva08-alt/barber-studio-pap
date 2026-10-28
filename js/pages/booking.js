/**
 * Barber Studio — Dedicated Booking Wizard Controller
 */

import { serviceCatalog } from '../services/serviceCatalog.js';
import { appointmentService } from '../services/appointmentService.js';
import { scheduleService, isDayClosed } from '../services/scheduleService.js';
import { authService } from '../services/authService.js';
import { emailService } from '../services/emailService.js';
import { Toast } from '../core/toast.js';
import { cleanPhone, setupPhoneInput, escapeHtml, formatDateLocalISO, isPlausiblePhone, FAKE_PHONE_MESSAGE } from '../core/utils.js';

let activeServices = [
  { id: 'srv-1', name: 'Corte', price: 7, duration: '30 min', category: 'CORTE', description: 'Consultoria de estilo e corte de precisão.' },
  { id: 'srv-2', name: 'Corte + Barba', price: 10, duration: '50 min', category: 'EXPERIÊNCIA COMPLETA', description: 'Corte de precisão combinado com acabamento de barba à navalha.', featured: true }
];
let currentUser = null;
let currentStep = 1;

// Máximo de marcações futuras ativas por cliente (RN06); a base de dados também o garante
const MAX_ACTIVE_APPOINTMENTS = 2;
let activeAppointmentsCount = 0;

let bookingState = {
  serviceId: null,
  service: null,
  date: null,
  time: null,
  clientName: '',
  clientPhone: '',
  notes: '',
  createdAppointment: null
};

// Variáveis do Calendário
const MONTHS_PT = [
  'Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho',
  'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro'
];
const today = new Date();
today.setHours(0, 0, 0, 0);
let viewYear = today.getFullYear();
let viewMonth = today.getMonth();
let schedule = scheduleService.defaults();

// 1. DESENHAR CALENDÁRIO E NAVEGAÇÃO IMEDIATAMENTE (SEM ESPERAR POR REDE)
function initInstantUI() {
  initCalendar();
  initStepNavigation();
  renderServices();
  setupPhoneField();
}

function setupPhoneField() {
  const phoneInput = document.getElementById('wiz-phone');
  if (phoneInput) {
    setupPhoneInput(phoneInput);
  }
}

// 2. SINCRONIZAR COM O SUPABASE EM SEGUNDO PLANO
async function syncDatabaseData() {
  // Horário e dias bloqueados definidos pelo barbeiro
  scheduleService.getSchedule().then(loaded => {
    schedule = loaded;
    renderCalendarGrid();
    if (!schedule.bookingsOpen) {
      Toast.info('As marcações estão fechadas de momento. Volta a tentar mais tarde.', 6000);
    }
  });

  try {
    const fetched = await serviceCatalog.getActiveServices();
    if (fetched && fetched.length > 0) {
      activeServices = fetched;
      renderServices();
    }
  } catch (e) {
    console.warn('A usar serviços predefinidos.');
  }

  try {
    currentUser = await authService.getCurrentUser();
    if (currentUser) {
      hideAuthRequiredNotice();
      countActiveAppointments();
      bookingState.clientName = currentUser.name || '';
      bookingState.clientPhone = currentUser.phone || '';

      const nameInput = document.getElementById('wiz-name');
      const phoneInput = document.getElementById('wiz-phone');

      if (nameInput && !nameInput.value) nameInput.value = bookingState.clientName;
      if (phoneInput && !phoneInput.value) {
        phoneInput.value = cleanPhone(bookingState.clientPhone);
        setupPhoneInput(phoneInput);
      }
    } else {
      showAuthRequiredNotice();
    }
  } catch (e) {
    currentUser = null;
    showAuthRequiredNotice();
  }

  // Verificar se veio serviço na URL (?service=...)
  const urlParams = new URLSearchParams(window.location.search);
  const preService = urlParams.get('service');
  if (preService && activeServices.length > 0) {
    const found = activeServices.find(s => s.id === preService || s.name.toLowerCase().includes(preService.toLowerCase()));
    if (found) {
      selectService(found);
      if (currentUser) {
        goToStep(2);
      }
    }
  }
}

async function countActiveAppointments() {
  try {
    const todayStr = formatDateLocalISO();
    const mine = await appointmentService.getClientAppointments(currentUser.id);
    activeAppointmentsCount = mine.filter(a =>
      (a.status === 'PENDENTE' || a.status === 'CONFIRMADA') && a.date >= todayStr
    ).length;
  } catch (e) {
    activeAppointmentsCount = 0; // Na dúvida deixa avançar: a base de dados recusa se for preciso
  }
}

function reachedAppointmentLimit() {
  if (!currentUser || currentUser.role === 'admin' || currentUser.role === 'barbeiro') return false;
  if (activeAppointmentsCount < MAX_ACTIVE_APPOINTMENTS) return false;
  Toast.warning(`Já tens ${MAX_ACTIVE_APPOINTMENTS} marcações ativas. Para marcares outra, espera que uma passe ou cancela-a na tua área de cliente.`, 7000);
  return true;
}

function checkAuthOrPrompt() {
  if (!currentUser) {
    showAuthRequiredNotice();
    openAuthModal();
    return false;
  }
  return true;
}

function showAuthRequiredNotice() {
  const notice = document.getElementById('booking-auth-notice');
  if (notice) notice.style.display = 'block';
}

function hideAuthRequiredNotice() {
  const notice = document.getElementById('booking-auth-notice');
  if (notice) notice.style.display = 'none';
}

function openAuthModal() {
  const modal = document.getElementById('auth-required-modal');
  if (modal) modal.classList.add('is-active');
}

function closeAuthModal() {
  const modal = document.getElementById('auth-required-modal');
  if (modal) modal.classList.remove('is-active');
}

function renderServices() {
  const container = document.getElementById('booking-services-list');
  if (!container) return;

  container.innerHTML = activeServices.map((s, i) => `
    <div class="service-select-card ${bookingState.serviceId === s.id ? 'is-selected' : ''}" data-service-id="${escapeHtml(s.id)}" role="button" tabindex="0" style="--i: ${i};">
      <span class="svc-radio" aria-hidden="true">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"/></svg>
      </span>
      <div class="svc-body">
        <div class="svc-top">
          <strong class="svc-name">${escapeHtml(s.name)}</strong>
          ${s.popular ? '<span class="service-badge service-badge--popular">MAIS PEDIDO</span>' : ''}
          ${s.featured ? '<span class="service-badge service-badge--recommended">RECOMENDADO</span>' : ''}
        </div>
        <span class="svc-meta">${s.duration}</span>
        <p class="svc-desc">${escapeHtml(s.description)}</p>
      </div>
      <span class="service-price">€${s.price}</span>
    </div>
  `).join('');

  container.querySelectorAll('.service-select-card').forEach(card => {
    const choose = () => {
      const id = card.getAttribute('data-service-id');
      const service = activeServices.find(s => s.id === id);
      if (!service) return;
      selectService(service);
    };
    card.addEventListener('click', choose);
    card.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); choose(); }
    });
  });
}

function selectService(service) {
  bookingState.serviceId = service.id;
  bookingState.service = service;

  document.querySelectorAll('.service-select-card').forEach(c => {
    c.classList.toggle('is-selected', c.getAttribute('data-service-id') === service.id);
  });

  const nextBtn = document.getElementById('goto-step-2-btn');
  if (nextBtn) nextBtn.disabled = false;

  // Outro serviço tem outra duração: as horas livres do dia escolhido mudam
  if (bookingState.date) {
    bookingState.time = null;
    const nextStep3 = document.getElementById('goto-step-3-btn');
    if (nextStep3) nextStep3.disabled = true;
    loadSlots(bookingState.date);
  }
}

/**
 * Escolhas já feitas, em etiquetas por cima do passo atual.
 * Tocar numa etiqueta volta ao passo onde essa escolha se altera.
 */
function renderChips() {
  const container = document.getElementById('wizard-chips');
  if (!container) return;

  const chips = [];
  if (typeof currentStep === 'number' && currentStep >= 2 && bookingState.service) {
    chips.push({ step: 1, label: `${bookingState.service.name} · €${bookingState.service.price}` });
  }
  if (typeof currentStep === 'number' && currentStep >= 3 && bookingState.date && bookingState.time) {
    const [y, m, d] = bookingState.date.split('-');
    chips.push({ step: 2, label: `${d}/${m} às ${bookingState.time}` });
  }

  container.innerHTML = chips.map((chip, i) => `
    <button type="button" class="wizard-chip" data-chip-step="${chip.step}" style="--i: ${i};">
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><polyline points="20 6 9 17 4 12"/></svg>
      <span>${escapeHtml(chip.label)}</span>
    </button>
  `).join('');

  container.querySelectorAll('.wizard-chip').forEach(btn => {
    btn.addEventListener('click', () => goToStep(Number(btn.getAttribute('data-chip-step'))));
  });
}

function initCalendar() {
  const prevBtn = document.getElementById('cal-prev-btn');
  const nextBtn = document.getElementById('cal-next-btn');

  prevBtn?.addEventListener('click', () => {
    viewMonth--;
    if (viewMonth < 0) {
      viewMonth = 11;
      viewYear--;
    }
    renderCalendarGrid();
  });

  nextBtn?.addEventListener('click', () => {
    viewMonth++;
    if (viewMonth > 11) {
      viewMonth = 0;
      viewYear++;
    }
    renderCalendarGrid();
  });

  renderCalendarGrid();
}

function toISO(y, m, d) {
  return `${y}-${String(m + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
}

function renderCalendarGrid() {
  const monthNameEl = document.getElementById('cal-month-name');
  const daysGrid = document.getElementById('cal-days-grid');
  if (!monthNameEl || !daysGrid) return;

  monthNameEl.textContent = `${MONTHS_PT[viewMonth]} ${viewYear}`;
  daysGrid.innerHTML = '';

  const firstDay = new Date(viewYear, viewMonth, 1);
  const startOffset = (firstDay.getDay() + 6) % 7; // Segunda = 0
  const daysInMonth = new Date(viewYear, viewMonth + 1, 0).getDate();

  // Dias vazios para alinhamento
  for (let i = 0; i < startOffset; i++) {
    const empty = document.createElement('div');
    empty.className = 'cal-day cal-day--empty';
    daysGrid.appendChild(empty);
  }

  // Preenchimento do mês
  for (let d = 1; d <= daysInMonth; d++) {
    const cellDate = new Date(viewYear, viewMonth, d);
    const isPast = cellDate < today;
    const isToday = cellDate.getTime() === today.getTime();
    const dateStr = toISO(viewYear, viewMonth, d);
    const isOff = isDayClosed(schedule, dateStr); // Encerrado, bloqueado ou marcações fechadas

    const cell = document.createElement('div');
    cell.textContent = d;

    if (isPast) {
      cell.className = 'cal-day cal-day--past';
    } else if (isOff) {
      cell.className = 'cal-day cal-day--off';
    } else {
      cell.className = 'cal-day cal-day--available';
      cell.addEventListener('click', () => selectDay(dateStr, cell));
    }

    if (isToday) cell.classList.add('cal-day--today');
    if (dateStr === bookingState.date) cell.classList.add('is-selected');

    daysGrid.appendChild(cell);
  }
}

async function selectDay(dateStr, cellEl) {
  document.querySelectorAll('.cal-day.is-selected').forEach(c => c.classList.remove('is-selected'));
  cellEl.classList.add('is-selected');

  bookingState.date = dateStr;
  bookingState.time = null;

  const [y, m, d] = dateStr.split('-');
  const labelPickedDate = document.getElementById('label-picked-date');
  if (labelPickedDate) labelPickedDate.textContent = `${d}/${m}/${y}`;

  const timeWrap = document.getElementById('time-selection-wrap');
  if (timeWrap) timeWrap.style.display = 'block';

  const gotoStep3Btn = document.getElementById('goto-step-3-btn');
  if (gotoStep3Btn) gotoStep3Btn.disabled = true;

  await loadSlots(dateStr);

  // Traz os horários para o ecrã, para não ser preciso procurar por eles
  timeWrap?.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
}

async function loadSlots(dateStr, { quiet = false } = {}) {
  const container = document.getElementById('wizard-slots-container');
  if (!container) return;

  // Na atualização silenciosa não pisca: troca a lista só quando chega a nova
  if (!quiet) {
    container.innerHTML = Array.from({ length: 8 }, () => '<span class="slot-skeleton"></span>').join('');
  }

  try {
    let slots = [];
    try {
      slots = await appointmentService.getAvailableSlots(dateStr, bookingState.service?.duration_minutes);
    } catch (e) {
      // Horários padrão de contingência
      slots = [
        { time: '09:30', available: true },
        { time: '10:15', available: true },
        { time: '11:00', available: true },
        { time: '14:00', available: true },
        { time: '14:45', available: true },
        { time: '15:30', available: true },
        { time: '16:15', available: true },
        { time: '17:00', available: true }
      ];
    }

    if (slots.length === 0) {
      container.innerHTML = `<p style="color:#ef4444;font-size:0.875rem;grid-column:1/-1;">Sem vagas para esta data.</p>`;
      return;
    }

    container.innerHTML = slots.map((slot, i) => `
      <button type="button" class="slot-btn" data-time="${slot.time}" style="--i: ${i};" ${slot.available ? '' : 'disabled title="Ocupado"'}>
        ${slot.time}
      </button>
    `).join('');

    container.querySelectorAll('.slot-btn:not(:disabled)').forEach(btn => {
      btn.addEventListener('click', () => {
        container.querySelectorAll('.slot-btn').forEach(b => b.classList.remove('is-selected'));
        btn.classList.add('is-selected');
        bookingState.time = btn.getAttribute('data-time');

        const nextBtn = document.getElementById('goto-step-3-btn');
        if (nextBtn) nextBtn.disabled = false;
      });
    });

    // Mantém a hora escolhida; se alguém a ocupou entretanto, avisa
    if (bookingState.time) {
      const kept = container.querySelector(`.slot-btn[data-time="${bookingState.time}"]:not(:disabled)`);
      if (kept) {
        kept.classList.add('is-selected');
      } else if (quiet) {
        bookingState.time = null;
        const nextBtn = document.getElementById('goto-step-3-btn');
        if (nextBtn) nextBtn.disabled = true;
        Toast.info('A hora que escolheste acabou de ser ocupada. Escolhe outra.', 6000);
      }
    }
  } catch (err) {
    container.innerHTML = `<p style="color:#ef4444;font-size:0.875rem;">Erro ao listar horários.</p>`;
  }
}

// Enquanto o cliente escolhe a hora, as horas livres atualizam-se sozinhas
function refreshSlotsQuietly() {
  if (currentStep === 2 && bookingState.date && document.visibilityState === 'visible') {
    loadSlots(bookingState.date, { quiet: true });
  }
}
setInterval(refreshSlotsQuietly, 30000);
document.addEventListener('visibilitychange', refreshSlotsQuietly);

function goToStep(stepNumber) {
  const order = [1, 2, 3, 4, 'success'];
  const panels = {
    1: document.getElementById('panel-step-1'),
    2: document.getElementById('panel-step-2'),
    3: document.getElementById('panel-step-3'),
    4: document.getElementById('panel-step-4'),
    success: document.getElementById('panel-step-success')
  };

  const goingBack = order.indexOf(stepNumber) < order.indexOf(currentStep);
  currentStep = stepNumber;

  // Passo atual desliza para dentro: da direita ao avançar, da esquerda ao voltar
  Object.values(panels).forEach(p => {
    if (!p) return;
    p.style.display = 'none';
    p.classList.remove('is-entering', 'is-entering-back');
  });
  const panel = panels[stepNumber];
  if (panel) {
    panel.style.display = 'block';
    void panel.offsetWidth; // reinicia a animação
    panel.classList.add(goingBack ? 'is-entering-back' : 'is-entering');
  }

  // Indicador: passos feitos ficam marcados e as linhas enchem-se
  const reached = stepNumber === 'success' ? 5 : stepNumber;
  [1, 2, 3, 4].forEach(n => {
    const ind = document.getElementById(`ind-step-${n}`);
    if (!ind) return;
    ind.classList.toggle('is-active', n === reached);
    ind.classList.toggle('is-done', n < reached);
  });
  document.querySelectorAll('.wizard-progress-line').forEach((line, i) => {
    line.classList.toggle('is-filled', i + 1 < reached);
  });

  renderChips();

  // Redesenhar calendário sempre que o passo 2 for ativado
  if (stepNumber === 2) {
    renderCalendarGrid();
  }

  const top = document.querySelector('.wizard-progress');
  if (top) {
    const y = top.getBoundingClientRect().top + window.scrollY - 88;
    window.scrollTo({ top: Math.max(0, y), behavior: 'smooth' });
  }
}

function initStepNavigation() {
  [1, 2, 3].forEach(n => {
    document.getElementById(`ind-step-${n}`)?.addEventListener('click', () => {
      if (typeof currentStep === 'number' && n < currentStep) goToStep(n);
    });
  });

  document.getElementById('goto-step-2-btn')?.addEventListener('click', () => {
    if (!checkAuthOrPrompt()) {
      Toast.warning('Inicia sessão para continuares com a marcação.');
      return;
    }
    if (reachedAppointmentLimit()) return;
    goToStep(2);
  });

  document.getElementById('back-to-step-1-btn')?.addEventListener('click', () => goToStep(1));

  document.getElementById('goto-step-3-btn')?.addEventListener('click', () => {
    if (!checkAuthOrPrompt()) {
      Toast.warning('Inicia sessão para continuares com a marcação.');
      return;
    }
    goToStep(3);
  });

  document.getElementById('back-to-step-2-btn')?.addEventListener('click', () => goToStep(2));
  document.getElementById('back-to-step-3-btn')?.addEventListener('click', () => goToStep(3));

  // Fechar modal de login
  document.getElementById('close-auth-modal-btn')?.addEventListener('click', closeAuthModal);
  document.getElementById('auth-required-modal')?.addEventListener('click', (e) => {
    if (e.target.id === 'auth-required-modal') closeAuthModal();
  });

  const clientForm = document.getElementById('wizard-client-form');
  if (clientForm) {
    clientForm.addEventListener('submit', (e) => {
      e.preventDefault();
      if (!checkAuthOrPrompt()) {
        Toast.warning('Inicia sessão para confirmares os teus dados.');
        return;
      }

      const rawPhone = document.getElementById('wiz-phone')?.value || '';
      const clean = cleanPhone(rawPhone);
      if (clean.length !== 9) {
        Toast.error('O telemóvel deve ter exatamente 9 dígitos.');
        document.getElementById('wiz-phone')?.focus();
        return;
      }
      if (!isPlausiblePhone(clean)) {
        Toast.error(FAKE_PHONE_MESSAGE, 6000);
        document.getElementById('wiz-phone')?.focus();
        return;
      }

      bookingState.clientName = document.getElementById('wiz-name')?.value || '';
      bookingState.clientPhone = clean;
      bookingState.notes = document.getElementById('wiz-notes')?.value || '';

      renderSummary();
      goToStep(4);
    });
  }

  const finalBtn = document.getElementById('final-confirm-btn');
  if (finalBtn) {
    finalBtn.addEventListener('click', async () => {
      if (!checkAuthOrPrompt()) {
        Toast.warning('Inicia sessão para confirmares o agendamento.');
        return;
      }

      try {
        finalBtn.disabled = true;
        finalBtn.innerHTML = `<span>A CONFIRMAR...</span>`;

        const appointment = await appointmentService.createAppointment({
          clientId: currentUser ? currentUser.id : null,
          clientName: bookingState.clientName,
          clientPhone: bookingState.clientPhone,
          clientEmail: currentUser ? currentUser.email : '',
          serviceId: bookingState.serviceId,
          date: bookingState.date,
          time: bookingState.time,
          notes: bookingState.notes
        });

        bookingState.createdAppointment = appointment;

        // Enviar email de confirmação de forma assíncrona — NUNCA bloqueia o agendamento
        emailService.sendBookingConfirmation({
          clientName: bookingState.clientName,
          clientEmail: currentUser ? currentUser.email : '',
          serviceName: bookingState.service ? bookingState.service.name : '',
          servicePrice: bookingState.service ? bookingState.service.price : '',
          date: bookingState.date,
          time: bookingState.time,
          appointmentRef: appointment.id ? String(appointment.id).slice(0, 8).toUpperCase() : 'N/A'
        }).catch(e => console.warn('[Booking] Aviso no envio do email de confirmação:', e));

        renderSuccessState(appointment);
        goToStep('success');
      } catch (err) {
        Toast.error(err.message || 'Erro ao criar marcação.');
        finalBtn.disabled = false;
        finalBtn.innerHTML = `<span>CONFIRMAR AGENDAMENTO</span>`;
      }
    });
  }
}

function renderSummary() {
  const container = document.getElementById('wizard-summary-card');
  if (!container) return;

  const s = bookingState.service;
  const [y, m, d] = (bookingState.date || '').split('-');
  const weekday = bookingState.date
    ? new Date(`${bookingState.date}T00:00:00`).toLocaleDateString('pt-PT', { weekday: 'long' })
    : '';

  container.innerHTML = `
    <div class="summary-main">
      <div>
        <strong class="summary-service">${s ? escapeHtml(s.name) : ''}</strong>
        <span class="summary-meta">${s ? s.duration : ''}</span>
      </div>
      <span class="apt-field-price">€${s ? s.price : ''}</span>
    </div>

    <div class="summary-when">
      <div>
        <span class="apt-field-label">DIA</span>
        <strong>${d}/${m}/${y}</strong>
        <span class="summary-sub">${escapeHtml(weekday)}</span>
      </div>
      <div>
        <span class="apt-field-label">HORA</span>
        <strong style="color: var(--color-gold);">${bookingState.time}</strong>
      </div>
    </div>

    <div class="summary-row">
      <span class="apt-field-label">EM NOME DE</span>
      <span>${escapeHtml(bookingState.clientName)} · ${escapeHtml(bookingState.clientPhone)}</span>
    </div>
    ${bookingState.notes ? `
      <div class="summary-row">
        <span class="apt-field-label">NOTA</span>
        <span>${escapeHtml(bookingState.notes)}</span>
      </div>
    ` : ''}
    <p class="summary-foot">O Rui confirma a marcação e podes acompanhá-la na tua área de cliente.</p>
  `;
}

function renderSuccessState(apt) {
  const refEl = document.getElementById('success-apt-ref');
  const serviceEl = document.getElementById('success-service-name');
  const dateEl = document.getElementById('success-apt-date');
  const timeEl = document.getElementById('success-apt-time');

  const [y, m, d] = (apt.date || '').split('-');
  const formattedDate = `${d}/${m}/${y}`;

  if (refEl) refEl.textContent = `#${apt.id ? String(apt.id).slice(0, 8).toUpperCase() : 'OK'}`;
  const srv = bookingState.service;
  if (serviceEl) serviceEl.textContent = srv ? `${srv.name} — €${srv.price}` : `${apt.serviceName} — €${apt.price}`;
  if (dateEl) dateEl.textContent = formattedDate;
  if (timeEl) timeEl.textContent = apt.time;
}

// Inicializar interface imediatamente e ligar a base de dados em paralelo
initInstantUI();
syncDatabaseData();