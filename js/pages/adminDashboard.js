/**
 * Barber Studio — Admin Management Portal Controller
 * Controlador completo do Painel de Administração
 */

import { authService } from '../services/authService.js';
import { appointmentService } from '../services/appointmentService.js';
import { serviceCatalog } from '../services/serviceCatalog.js';
import { galleryService } from '../services/galleryService.js';
import { barberService } from '../services/barberService.js';
import { scheduleService, summarizeDay, toMinutes, WEEKDAY_NAMES } from '../services/scheduleService.js';
import { Toast } from '../core/toast.js';
import { confirmTwoStep } from '../core/confirm.js';
import { openCropper } from '../components/cropper.js';
import { formatDate, formatDateLocalISO, escapeHtml } from '../core/utils.js';
import { storageService } from '../services/storageService.js';
import { promptLogoutConfirmation } from '../components/nav.js';
import { watchAppointments } from '../services/realtimeService.js';

let currentUser = null;
let allAppointments = [];
let allServices = [];
let allGalleryItems = [];

// Estado da interface: o que está aberto mantém-se aberto depois de cada ação
const HISTORY_PAGE_SIZE = 5;
let openAptId = null;
let openServiceId = null;
let aptListInitialized = false;
const openHistorySections = new Set();
const historyVisible = { 'CONCLUÍDA': HISTORY_PAGE_SIZE, 'CANCELADA': HISTORY_PAGE_SIZE };

// Separador Horário
let adminSchedule = scheduleService.defaults();
let allTimeOff = [];
let openDayId = null;
let openTimeOffId = null;
let pastTimeOffOpen = false;

document.addEventListener('DOMContentLoaded', async () => {
  // 1. Verificação de Acesso: Apenas Dono ('barbeiro') ou Barbeiro de Equipa ('admin') entram
  currentUser = await authService.getCurrentUser();
  if (!currentUser || (currentUser.role !== 'barbeiro' && currentUser.role !== 'admin')) {
    window.location.href = 'login.html';
    return;
  }
  document.body.classList.add('is-ready');

  // 3. Inicializar Abas
  initAdminTabs();

  // 4. Carregar Dados
  await refreshAdminData();
  await loadBarberPhoto();

  // 5. Terminar Sessão (com confirmação)
  document.getElementById('admin-logout-btn')?.addEventListener('click', (e) => {
    e.preventDefault();
    promptLogoutConfirmation();
  });

  // 6. Modais de Serviços e Fotos
  initServiceModals();
  initPhotoModals();

  // 7. Handlers da Foto do Barbeiro
  initBarberPhotoHandlers();

  // 8. Modal de bloqueio de dias
  initTimeOffModal();

  // 9. Mudar a password a partir do painel
  initAdminAccount();

  // 10. Pedidos novos e cancelamentos aparecem sem recarregar a página
  watchAppointments(handleAppointmentChange);
});

/**
 * Separador 4: a conta do barbeiro (mudar a password sem depender do email)
 */
function initAdminAccount() {
  const acc = document.getElementById('admin-account-acc');
  const toggle = document.getElementById('admin-account-toggle');
  const form = document.getElementById('admin-pw-form');
  if (!acc || !toggle || !form) return;

  toggle.addEventListener('click', () => {
    const open = acc.classList.toggle('is-open');
    toggle.setAttribute('aria-expanded', String(open));
  });

  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    const newPw = document.getElementById('admin-new-pw').value;
    const confirmPw = document.getElementById('admin-confirm-pw').value;
    const btn = document.getElementById('admin-pw-btn');

    if (!newPw || newPw.length < 8 || !/[a-zA-Z]/.test(newPw) || !/[0-9]/.test(newPw)) {
      Toast.error('A password deve ter pelo menos 8 caracteres, incluindo letras e números.');
      return;
    }
    if (newPw !== confirmPw) {
      Toast.error('As passwords não coincidem.');
      return;
    }

    try {
      btn.disabled = true;
      btn.textContent = 'A ALTERAR...';
      await authService.changePassword(currentUser.id, newPw);
      Toast.success('Password alterada. Usa-a da próxima vez que entrares com o email ou o nome.');
      form.reset();
      acc.classList.remove('is-open');
      toggle.setAttribute('aria-expanded', 'false');
    } catch (err) {
      Toast.error(err.message || 'Não foi possível alterar a password.');
    } finally {
      btn.disabled = false;
      btn.textContent = 'ALTERAR PASSWORD';
    }
  });
}

/**
 * Tempo real: volta a carregar só as marcações e avisa o barbeiro do que é novo.
 * Várias mudanças seguidas (ex.: as do próprio barbeiro) juntam-se numa só atualização.
 */
let realtimeTimer = null;
const realtimeNotices = [];

function handleAppointmentChange(payload) {
  const row = payload.new || {};
  if (payload.eventType === 'INSERT') {
    realtimeNotices.push({ id: row.id, kind: 'novo' });
  } else if (payload.eventType === 'UPDATE' && row.estado === 'CANCELADA' && row.cancelada_por === 'cliente' && row.cancelamento_visto === false) {
    realtimeNotices.push({ id: row.id, kind: 'cancelou' });
  }

  clearTimeout(realtimeTimer);
  realtimeTimer = setTimeout(refreshAppointmentsLive, 500);
}

async function refreshAppointmentsLive() {
  try {
    allAppointments = await appointmentService.getAllAppointments();
  } catch (err) {
    console.warn('Erro ao atualizar marcações em tempo real:', err);
    return;
  }

  renderKPIs();
  renderClientCancellations();
  renderOpenAppointments();
  renderAppointmentHistory();

  realtimeNotices.splice(0).forEach(notice => {
    const apt = allAppointments.find(a => String(a.id) === String(notice.id));
    if (!apt) return;
    const when = `${formatDate(apt.date)} às ${apt.time}`;
    if (notice.kind === 'novo') {
      Toast.info(`Nova marcação: ${apt.clientName}, ${when}.`, 7000);
    } else {
      Toast.warning(`${apt.clientName} cancelou a marcação de ${when}.`, 7000);
    }
  });
}

async function refreshAdminData() {
  try {
    allAppointments = await appointmentService.getAllAppointments();
  } catch (err) {
    console.warn('Erro ao carregar marcações:', err);
    allAppointments = [];
  }

  try {
    allServices = await serviceCatalog.getAllServices();
  } catch (err) {
    console.warn('Erro ao carregar serviços:', err);
    allServices = [];
  }

  try {
    allGalleryItems = await galleryService.getAllItems();
  } catch (err) {
    console.warn('Erro ao carregar galeria:', err);
    allGalleryItems = [];
  }

  renderKPIs();
  renderClientCancellations();
  renderOpenAppointments();
  renderAppointmentHistory();
  renderServicesTable();
  renderGalleryGrid();
  await refreshSchedule();
}

/**
 * Renderizar Cartões de Métricas (KPIs)
 */
async function renderKPIs() {
  try {
    const kpis = await appointmentService.getAdminKPIs();

    const elPending = document.getElementById('kpi-pending');
    const elToday = document.getElementById('kpi-today');
    const elCompleted = document.getElementById('kpi-completed');
    const elRevenue = document.getElementById('kpi-revenue');

    if (elPending) elPending.textContent = kpis.pendingCount;
    if (elToday) elToday.textContent = kpis.todayCount;
    if (elCompleted) elCompleted.textContent = kpis.completedCount;
    if (elRevenue) elRevenue.textContent = `€${kpis.totalRevenue.toLocaleString()}`;
  } catch (err) {
    console.warn('Erro ao calcular KPIs:', err);
  }
}

/**
 * Separador 1: Marcações por tratar — um bloco por marcação, fechado por defeito
 */
const CHEVRON_SVG = '<svg class="icon apt-acc__chevron" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" aria-hidden="true"><polyline points="6 9 12 15 18 9"/></svg>';

/**
 * Ligação que abre o WhatsApp do barbeiro numa conversa com o cliente, com a
 * mensagem já escrita. Devolve '' se o cliente não tiver um telemóvel válido.
 */
function whatsappLink(apt, message) {
  let digits = String(apt?.clientPhone || '').replace(/\D/g, '');
  if (digits.length === 9) digits = `351${digits}`;
  if (digits.length < 11) return '';
  return `https://wa.me/${digits}?text=${encodeURIComponent(message)}`;
}

/**
 * Abre o WhatsApp logo a seguir à ação do barbeiro. Se o browser bloquear a
 * janela nova, abre na mesma página (no telemóvel salta para a aplicação).
 */
function openWhatsApp(url) {
  const win = window.open(url, '_blank');
  if (win) {
    win.opener = null;
  } else {
    window.location.href = url;
  }
}

function firstNameOf(apt) {
  return String(apt?.clientName || '').trim().split(' ')[0] || '';
}

/**
 * Marcações que o cliente cancelou e o barbeiro ainda não viu: ficam em destaque
 * no topo até ele carregar em OK. (cancelamento_visto = "a outra parte já viu o cancelamento":
 * o cliente, quando cancela o barbeiro; o barbeiro, quando cancela o cliente.)
 */
function renderClientCancellations() {
  const container = document.getElementById('admin-cancel-notices');
  if (!container) return;

  const todayStr = formatDateLocalISO();
  const unseen = allAppointments
    .filter(a => a.status === 'CANCELADA' && a.cancelledBy === 'cliente' && !a.cancelSeen && a.date >= todayStr)
    .sort((a, b) => `${a.date}T${a.time}`.localeCompare(`${b.date}T${b.time}`));

  container.innerHTML = unseen.map(apt => `
    <div class="apt-acc cancel-notice" role="alert">
      <div class="cancel-notice__body">
        <span class="badge-status badge-status--cancelled">CANCELADA PELO CLIENTE</span>
        <h2 class="cancel-notice__title">${escapeHtml(apt.clientName)} cancelou a marcação de ${formatDate(apt.date)} às ${apt.time}.</h2>
        <p class="cancel-notice__desc">
          <strong>${escapeHtml(apt.serviceName)}</strong>. Esse horário voltou a ficar livre para outros clientes.
        </p>
      </div>
      <div class="apt-acc__footer apt-acc__footer--actions">
        <span></span>
        <button type="button" class="btn btn--gold btn--sm client-cancel-ack" data-id="${apt.id}">OK</button>
      </div>
    </div>
  `).join('');

  container.querySelectorAll('.client-cancel-ack').forEach(btn => {
    btn.addEventListener('click', async () => {
      const id = btn.getAttribute('data-id');
      const card = btn.closest('.cancel-notice');
      try {
        btn.disabled = true;
        await appointmentService.markCancelSeen(id);
        const apt = allAppointments.find(a => String(a.id) === String(id));
        if (apt) apt.cancelSeen = true;
        card.classList.add('is-leaving');
        setTimeout(() => card.remove(), 300);
      } catch (err) {
        btn.disabled = false;
        Toast.error(err.message || 'Não foi possível fechar o aviso.');
      }
    });
  });
}

function isOpenAppointment(a) {
  return a.status === 'PENDENTE' || a.status === 'CONFIRMADA';
}

function renderOpenAppointments() {
  const container = document.getElementById('admin-open-list');
  if (!container) return;

  const open = allAppointments.filter(isOpenAppointment)
    .sort((a, b) => `${a.date}T${a.time}`.localeCompare(`${b.date}T${b.time}`));

  if (open.length === 0) {
    container.innerHTML = `
      <div class="empty-state">
        <h3 class="empty-state__title">TUDO TRATADO</h3>
        <p class="empty-state__desc">Não tens marcações à espera de resposta.</p>
      </div>
    `;
    return;
  }

  // A mais próxima vem aberta na primeira vez; depois respeita o que o barbeiro abriu
  if (!aptListInitialized) {
    openAptId = open[0].id;
    aptListInitialized = true;
  }

  container.innerHTML = `<div class="apt-accordion">${open.map(apt => {
    const confirmed = apt.status === 'CONFIRMADA';
    const isOpen = apt.id === openAptId;
    const waLink = whatsappLink(apt, `Olá ${firstNameOf(apt)}, daqui é o Rui. Sobre a tua marcação de ${formatDate(apt.date)} às ${apt.time}: `);

    return `
      <div class="apt-acc ${isOpen ? 'is-open' : ''}" data-apt-id="${apt.id}">
        <button type="button" class="apt-acc__head" aria-expanded="${isOpen}">
          <span class="apt-acc__when">
            <strong>${formatDate(apt.date)}</strong>
            <span>${apt.time}</span>
          </span>
          <span class="apt-acc__service">${escapeHtml(apt.clientName)}</span>
          <span class="badge-status ${confirmed ? 'badge-status--confirmed' : 'badge-status--pending'}">${confirmed ? 'CONFIRMADA' : 'PENDENTE'}</span>
          ${CHEVRON_SVG}
        </button>

        <div class="apt-acc__panel">
          <div class="apt-acc__inner">
            <div class="apt-acc__details">
              <div>
                <span class="apt-field-label">SERVIÇO</span>
                <strong>${escapeHtml(apt.serviceName)}</strong>
              </div>
              <div>
                <span class="apt-field-label">DURAÇÃO</span>
                <strong>${apt.duration || '45 min'}</strong>
              </div>
              <div>
                <span class="apt-field-label">VALOR</span>
                <strong style="color: var(--color-gold);">€${apt.price}</strong>
              </div>
            </div>
            <p class="apt-acc__status">
              ${apt.clientPhone
                ? `Contacto: <a href="tel:${escapeHtml(apt.clientPhone)}" class="apt-acc__link">${escapeHtml(apt.clientPhone)}</a>${waLink ? ` · <a href="${escapeHtml(waLink)}" target="_blank" rel="noopener" class="apt-acc__link">WHATSAPP</a>` : ''}`
                : 'Cliente sem telemóvel registado.'}
              ${apt.notes ? `<span class="apt-acc__note">“${escapeHtml(apt.notes)}”</span>` : ''}
            </p>
            <div class="apt-acc__footer apt-acc__footer--actions">
              <button type="button" class="btn btn--danger-outline btn--sm action-cancel-btn" data-id="${apt.id}">CANCELAR</button>
              ${confirmed
                ? `<button type="button" class="btn btn--gold btn--sm action-complete-btn" data-id="${apt.id}">MARCAR COMO CONCLUÍDO</button>`
                : `<button type="button" class="btn btn--gold btn--sm action-confirm-btn" data-id="${apt.id}">CONFIRMAR</button>`}
            </div>
          </div>
        </div>
      </div>
    `;
  }).join('')}</div>`;

  container.querySelectorAll('.apt-acc__head').forEach(head => {
    head.addEventListener('click', () => {
      const item = head.parentElement;
      const willOpen = !item.classList.contains('is-open');
      container.querySelectorAll('.apt-acc').forEach(other => {
        other.classList.remove('is-open');
        other.querySelector('.apt-acc__head').setAttribute('aria-expanded', 'false');
      });
      openAptId = willOpen ? item.getAttribute('data-apt-id') : null;
      if (willOpen) {
        item.classList.add('is-open');
        head.setAttribute('aria-expanded', 'true');
      }
    });
  });

  bindAppointmentAction(container, '.action-confirm-btn', 'A CONFIRMAR...', async (id) => {
    const apt = allAppointments.find(a => String(a.id) === String(id));
    await appointmentService.updateStatus(id, 'CONFIRMADA');

    // Abre o WhatsApp com a confirmação já escrita: só falta tocar em enviar
    const waLink = apt ? whatsappLink(apt, `Olá ${firstNameOf(apt)}, daqui é o Rui. A tua marcação de ${apt.serviceName} está confirmada para ${formatDate(apt.date)} às ${apt.time}. Até lá!\n\nVê os detalhes ou cancela aqui: ${window.location.origin}/cliente.html`) : '';
    if (waLink) {
      openWhatsApp(waLink);
      Toast.show('Marcação confirmada. Se o WhatsApp não abriu, toca aqui.', 'success', 9000, {
        onClick: () => openWhatsApp(waLink)
      });
    } else {
      Toast.success('Marcação confirmada. O cliente não tem telemóvel válido para WhatsApp.');
    }
  });

  bindAppointmentAction(container, '.action-complete-btn', 'A CONCLUIR...', async (id) => {
    await appointmentService.updateStatus(id, 'CONCLUÍDA');
    Toast.success('Corte concluído.');
  });

  bindAppointmentAction(container, '.action-cancel-btn', 'A CANCELAR...', async (id) => {
    const apt = allAppointments.find(a => String(a.id) === String(id));
    await appointmentService.cancelAppointment(id, 'Cancelado pelo barbeiro', 'admin');

    // O cliente só vê o cancelamento se voltar ao site: convém avisá-lo
    const waLink = apt ? whatsappLink(apt, `Olá ${firstNameOf(apt)}, daqui é o Rui. Tive de cancelar a tua marcação de ${formatDate(apt.date)} às ${apt.time}. Desculpa o incómodo!\n\nVê os detalhes e escolhe outro horário aqui: ${window.location.origin}/cliente.html`) : '';
    if (waLink) {
      openWhatsApp(waLink);
      Toast.show('Marcação cancelada. Se o WhatsApp não abriu, toca aqui.', 'info', 9000, {
        onClick: () => openWhatsApp(waLink)
      });
    } else {
      Toast.info('Marcação cancelada. O cliente não tem telemóvel válido para WhatsApp.');
    }
  }, 'CANCELAR MESMO?');
}

/**
 * Liga um botão de ação a uma operação sobre a marcação, com estado de carregamento
 */
function bindAppointmentAction(parent, selector, busyText, action, confirmLabel = null) {
  parent.querySelectorAll(selector).forEach(btn => {
    btn.addEventListener('click', async () => {
      if (confirmLabel && !confirmTwoStep(btn, confirmLabel)) return;

      const id = btn.getAttribute('data-id');
      const originalText = btn.textContent;
      try {
        btn.disabled = true;
        btn.textContent = busyText;
        await action(id);
        await refreshAdminData();
      } catch (err) {
        console.error(err);
        Toast.error(err.message || 'Não foi possível concluir a ação.');
        btn.disabled = false;
        btn.textContent = originalText;
      }
    });
  });
}

/**
 * Separador 1: Histórico — concluídas e canceladas, recolhidas por defeito
 */
function renderAppointmentHistory() {
  const container = document.getElementById('admin-history');
  if (!container) return;

  const sections = [
    { key: 'CONCLUÍDA', title: 'CONCLUÍDAS', badge: 'badge-status--completed' },
    { key: 'CANCELADA', title: 'CANCELADAS', badge: 'badge-status--cancelled' }
  ];

  container.innerHTML = sections.map(sec => {
    const items = allAppointments.filter(a => a.status === sec.key);
    const visible = items.slice(0, historyVisible[sec.key]);
    const remaining = items.length - visible.length;
    const isOpen = openHistorySections.has(sec.key);

    return `
      <div class="apt-acc history-acc ${isOpen ? 'is-open' : ''}" data-history="${sec.key}">
        <button type="button" class="apt-acc__head history-acc__head" aria-expanded="${isOpen}">
          <span class="history-acc__title">${sec.title}</span>
          <span class="mono-tag mono-tag--muted">${items.length}</span>
          ${CHEVRON_SVG}
        </button>
        <div class="apt-acc__panel">
          <div class="apt-acc__inner">
            <div class="apt-list history-acc__list">
              ${items.length === 0
                ? '<p class="empty-state__desc" style="padding: 0.5rem 0 1rem; text-align: center;">Nada por aqui.</p>'
                : visible.map(apt => `
                  <div class="apt-row">
                    <div class="apt-row__info">
                      <div class="apt-row__date-block">
                        <span class="apt-row__date">${formatDate(apt.date)}</span>
                        <span class="apt-row__time">${apt.time}</span>
                      </div>
                      <div class="apt-row__service-block">
                        <span class="apt-row__service">${escapeHtml(apt.clientName)}</span>
                        <span class="mono-tag mono-tag--muted">${escapeHtml(apt.serviceName)} · €${apt.price}</span>
                      </div>
                    </div>
                    <div class="apt-row__actions">
                      <button type="button" class="btn btn--danger-outline btn--sm delete-history-btn" data-id="${apt.id}">ELIMINAR</button>
                    </div>
                  </div>
                `).join('')}
            </div>
            <div class="history-acc__more">
              ${remaining > 0 ? `<button type="button" class="btn btn--outline btn--sm history-more-btn" data-history="${sec.key}">VER MAIS (${remaining})</button>` : ''}
              ${sec.key === 'CANCELADA' && items.length > 1 ? `<button type="button" class="btn btn--danger-outline btn--sm clear-cancelled-btn">ELIMINAR TODAS (${items.length})</button>` : ''}
            </div>
          </div>
        </div>
      </div>
    `;
  }).join('');

  container.querySelectorAll('.history-acc__head').forEach(head => {
    head.addEventListener('click', () => {
      const item = head.parentElement;
      const key = item.getAttribute('data-history');
      const open = item.classList.toggle('is-open');
      head.setAttribute('aria-expanded', String(open));
      if (open) openHistorySections.add(key); else openHistorySections.delete(key);
    });
  });

  container.querySelectorAll('.history-more-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      historyVisible[btn.getAttribute('data-history')] += HISTORY_PAGE_SIZE;
      renderAppointmentHistory();
    });
  });

  container.querySelector('.clear-cancelled-btn')?.addEventListener('click', async (e) => {
    const btn = e.currentTarget;
    const ids = allAppointments.filter(a => a.status === 'CANCELADA').map(a => a.id);
    if (!confirmTwoStep(btn, `ELIMINAR AS ${ids.length} DE VEZ?`)) return;

    try {
      btn.disabled = true;
      btn.textContent = 'A ELIMINAR...';
      await appointmentService.deleteAppointments(ids);
      Toast.success(`${ids.length} marcações canceladas eliminadas.`);
      await refreshAdminData();
    } catch (err) {
      console.error(err);
      Toast.error(err.message || 'Não foi possível eliminar as marcações.');
      await refreshAdminData();
    }
  });

  bindAppointmentAction(container, '.delete-history-btn', 'A ELIMINAR...', async (id) => {
    await appointmentService.deleteAppointment(id);
    Toast.success('Marcação eliminada.');
  }, 'ELIMINAR DE VEZ?');
}

/**
 * Separador 2: Catálogo de Serviços — um bloco por serviço
 */
function renderServicesTable() {
  const container = document.getElementById('admin-services-list');
  if (!container) return;

  if (allServices.length === 0) {
    container.innerHTML = `
      <div class="empty-state">
        <p class="empty-state__desc">Ainda não tens serviços no catálogo.</p>
      </div>
    `;
    return;
  }

  container.innerHTML = `<div class="apt-accordion">${allServices.map(s => {
    const active = s.active !== false;
    const isOpen = s.id === openServiceId;

    return `
      <div class="apt-acc ${isOpen ? 'is-open' : ''}" data-service-id="${s.id}">
        <button type="button" class="apt-acc__head srv-acc__head" aria-expanded="${isOpen}">
          <span class="apt-acc__service">${escapeHtml(s.name)}</span>
          <strong class="srv-acc__price">€${s.price}</strong>
          <span class="badge-status ${active ? 'badge-status--confirmed' : 'badge-status--cancelled'}">${active ? 'ATIVO' : 'INATIVO'}</span>
          ${CHEVRON_SVG}
        </button>

        <div class="apt-acc__panel">
          <div class="apt-acc__inner">
            <div class="apt-acc__details" style="grid-template-columns: repeat(2, 1fr);">
              <div>
                <span class="apt-field-label">CATEGORIA</span>
                <strong>${escapeHtml(s.category)}</strong>
              </div>
              <div>
                <span class="apt-field-label">DURAÇÃO</span>
                <strong>${s.duration}</strong>
              </div>
            </div>
            <p class="apt-acc__status">${escapeHtml(s.description)}</p>
            <div class="apt-acc__footer apt-acc__footer--actions">
              <label class="switch-label">
                <input type="checkbox" class="switch-input srv-toggle" data-id="${s.id}" ${active ? 'checked' : ''}>
                <span class="switch-slider"></span>
                <span style="font-size: 0.75rem; font-family: var(--font-mono);">VISÍVEL NO SITE</span>
              </label>
              <div style="display: flex; gap: 0.5rem;">
                <button type="button" class="btn btn--danger-outline btn--sm delete-srv-btn" data-id="${s.id}">REMOVER</button>
                <button type="button" class="btn btn--outline btn--sm edit-srv-btn" data-id="${s.id}">EDITAR</button>
              </div>
            </div>
          </div>
        </div>
      </div>
    `;
  }).join('')}</div>`;

  container.querySelectorAll('.apt-acc__head').forEach(head => {
    head.addEventListener('click', () => {
      const item = head.parentElement;
      const willOpen = !item.classList.contains('is-open');
      container.querySelectorAll('.apt-acc').forEach(other => {
        other.classList.remove('is-open');
        other.querySelector('.apt-acc__head').setAttribute('aria-expanded', 'false');
      });
      openServiceId = willOpen ? item.getAttribute('data-service-id') : null;
      if (willOpen) {
        item.classList.add('is-open');
        head.setAttribute('aria-expanded', 'true');
      }
    });
  });

  // Alternar ativo/inativo
  container.querySelectorAll('.srv-toggle').forEach(chk => {
    chk.addEventListener('change', async () => {
      const id = chk.getAttribute('data-id');
      const previousState = !chk.checked;
      try {
        chk.disabled = true;
        const updated = await serviceCatalog.toggleServiceStatus(id);
        Toast.success(`Serviço "${updated.name}" está agora ${updated.active ? 'ATIVO' : 'INATIVO'}.`);
        await refreshAdminData();
      } catch (err) {
        console.error(err);
        chk.checked = previousState;
        Toast.error(err.message || 'Erro ao alterar estado do serviço.');
      } finally {
        chk.disabled = false;
      }
    });
  });

  // Editar Serviço
  container.querySelectorAll('.edit-srv-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      const id = btn.getAttribute('data-id');
      const service = allServices.find(s => s.id === id);
      if (service) openServiceModal(service);
    });
  });

  // Remover Serviço
  container.querySelectorAll('.delete-srv-btn').forEach(btn => {
    btn.addEventListener('click', async () => {
      const id = btn.getAttribute('data-id');
      if (confirmTwoStep(btn, 'REMOVER MESMO?')) {
        try {
          await serviceCatalog.deleteService(id);
          Toast.info('Serviço removido.');
          await refreshAdminData();
        } catch (err) {
          Toast.error(err.message || 'Erro ao remover serviço.');
        }
      }
    });
  });
}

/**
 * Separador 3: Galeria e foto do barbeiro
 */
function renderGalleryGrid() {
  const container = document.getElementById('admin-gallery-grid');
  if (!container) return;

  if (allGalleryItems.length === 0) {
    container.innerHTML = `
      <p style="color: rgba(255,255,255,0.5); grid-column: 1/-1; padding: 2rem; text-align: center;">
        Ainda não há fotos adicionadas à galeria.
      </p>
    `;
    return;
  }

  container.innerHTML = allGalleryItems.map(item => `
    <div class="mag-item" style="height: 280px; border-radius: var(--radius-sm);">
      <img src="${escapeHtml(item.imageUrl)}" alt="${escapeHtml(item.title)}" class="mag-img">
      <div class="mag-overlay" style="opacity: 1;">
        <div class="mag-meta">
          <span class="mono-tag mono-tag--gold">${escapeHtml((item.category || 'HAIRCUTS').toUpperCase())}</span>
          <strong style="color: var(--color-white); font-size: 0.9375rem;">${escapeHtml(item.title)}</strong>
          <p style="font-size: 0.75rem; color: var(--color-gray-subtle);">${escapeHtml(item.description)}</p>
        </div>
        <div style="display: flex; gap: 0.4rem;">
          <button type="button" class="btn btn--sm photo-card-btn edit-photo-btn" data-id="${item.id}">
            EDITAR
          </button>
          <button type="button" class="btn btn--sm photo-card-btn photo-card-btn--danger delete-photo-btn" data-id="${item.id}">
            REMOVER
          </button>
        </div>
      </div>
    </div>
  `).join('');

  container.querySelectorAll('.edit-photo-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      const id = btn.getAttribute('data-id');
      const item = allGalleryItems.find(g => g.id === id);
      if (item) openPhotoModal(item);
    });
  });

  container.querySelectorAll('.delete-photo-btn').forEach(btn => {
    btn.addEventListener('click', async () => {
      const id = btn.getAttribute('data-id');
      if (confirmTwoStep(btn, 'REMOVER?')) {
        try {
          await galleryService.deleteItem(id);
          Toast.info('Fotografia removida.');
          await refreshAdminData();
        } catch (err) {
          Toast.error(err.message || 'Erro ao remover foto.');
        }
      }
    });
  });
}

/**
 * Modais: Serviços
 */
function initServiceModals() {
  const modal = document.getElementById('service-modal');
  const closeBtn = document.getElementById('close-service-modal');
  const abortBtn = document.getElementById('abort-service-btn');
  const form = document.getElementById('service-form');

  const triggers = [
    document.getElementById('quick-add-service-btn'),
    document.getElementById('add-service-btn-tab')
  ];

  triggers.forEach(btn => btn?.addEventListener('click', () => openServiceModal()));

  const closeModal = () => modal?.classList.remove('is-active');
  closeBtn?.addEventListener('click', closeModal);
  abortBtn?.addEventListener('click', closeModal);

  form?.addEventListener('submit', async (e) => {
    e.preventDefault();
    const editId = document.getElementById('service-edit-id')?.value;
    const name = document.getElementById('srv-name')?.value;
    const category = document.getElementById('srv-cat')?.value;
    const price = document.getElementById('srv-price')?.value;
    const duration = document.getElementById('srv-duration')?.value;
    const description = document.getElementById('srv-desc')?.value;

    try {
      if (editId) {
        await serviceCatalog.updateService(editId, { name, category, price, duration, description });
        Toast.success('Serviço atualizado!');
      } else {
        await serviceCatalog.addService({ name, category, price, duration, description });
        Toast.success('Novo serviço adicionado!');
      }
      closeModal();
      form.reset();
      await refreshAdminData();
    } catch (err) {
      Toast.error(err.message || 'Erro ao guardar serviço.');
    }
  });
}

function openServiceModal(service = null) {
  const modal = document.getElementById('service-modal');
  const titleEl = document.getElementById('service-modal-title');
  const editId = document.getElementById('service-edit-id');
  const name = document.getElementById('srv-name');
  const category = document.getElementById('srv-cat');
  const price = document.getElementById('srv-price');
  const duration = document.getElementById('srv-duration');
  const description = document.getElementById('srv-desc');

  if (!modal) return;

  if (service) {
    if (titleEl) titleEl.textContent = 'EDITAR SERVIÇO';
    if (editId) editId.value = service.id;
    if (name) name.value = service.name;
    if (category) category.value = service.category;
    if (price) price.value = service.price;
    if (duration) duration.value = service.duration;
    if (description) description.value = service.description || '';
  } else {
    if (titleEl) titleEl.textContent = 'NOVO SERVIÇO';
    if (editId) editId.value = '';
    document.getElementById('service-form')?.reset();
  }

  modal.classList.add('is-active');
}

/**
 * Modais: Fotos
 */
function initPhotoModals() {
  const modal = document.getElementById('photo-modal');
  const closeBtn = document.getElementById('close-photo-modal');
  const abortBtn = document.getElementById('abort-photo-btn');
  const form = document.getElementById('photo-form');
  const fileInput = document.getElementById('photo-file-input');
  const dropzone = document.getElementById('photo-dropzone');
  const removeBtn = document.getElementById('remove-uploaded-photo-btn');

  const triggers = [
    document.getElementById('quick-add-photo-btn'),
    document.getElementById('add-photo-btn-tab')
  ];
  triggers.forEach(btn => btn?.addEventListener('click', () => openPhotoModal()));

  const closeModal = () => modal?.classList.remove('is-active');
  closeBtn?.addEventListener('click', closeModal);
  abortBtn?.addEventListener('click', closeModal);

  // 1. Clique na dropzone abre o seletor de ficheiros
  dropzone?.addEventListener('click', (e) => {
    if (e.target !== removeBtn && !removeBtn?.contains(e.target)) {
      fileInput?.click();
    }
  });

  // 2. Processar ficheiro selecionado
  fileInput?.addEventListener('change', async (e) => {
    const file = e.target.files?.[0];
    if (file) await handleImageUpload(file);
  });

  // 3. Mecânica de Arrastar e Soltar (Drag & Drop)
  ['dragenter', 'dragover'].forEach(name => {
    dropzone?.addEventListener(name, (e) => {
      e.preventDefault();
      e.stopPropagation();
      dropzone.classList.add('is-dragover');
    });
  });

  ['dragleave', 'drop'].forEach(name => {
    dropzone?.addEventListener(name, (e) => {
      e.preventDefault();
      e.stopPropagation();
      dropzone.classList.remove('is-dragover');
    });
  });

  dropzone?.addEventListener('drop', async (e) => {
    const file = e.dataTransfer?.files?.[0];
    if (file) await handleImageUpload(file);
  });

  // 4. Mecânica de Colar com CTRL + V (Paste)
  window.addEventListener('paste', async (e) => {
    if (!modal?.classList.contains('is-active')) return;
    const items = (e.clipboardData || window.clipboardData)?.items;
    if (!items) return;

    for (let i = 0; i < items.length; i++) {
      if (items[i].type.indexOf('image') !== -1) {
        const file = items[i].getAsFile();
        if (file) {
          e.preventDefault();
          Toast.info('Imagem colada com sucesso! A enviar...');
          await handleImageUpload(file);
          break;
        }
      }
    }
  });

  // 5. Botão para trocar ou remover imagem
  removeBtn?.addEventListener('click', (e) => {
    e.stopPropagation();
    resetPhotoDropzone();
  });

  // 6. Submissão do Formulário
  form?.addEventListener('submit', async (e) => {
    e.preventDefault();
    const editId = document.getElementById('photo-edit-id')?.value;
    const title = document.getElementById('photo-title')?.value;
    const category = document.getElementById('photo-cat')?.value;
    const layoutType = document.getElementById('photo-layout')?.value;
    const imageUrl = document.getElementById('photo-url')?.value;
    const description = document.getElementById('photo-desc')?.value;

    if (!imageUrl) {
      Toast.error('Por favor envia uma imagem antes de guardar.');
      return;
    }

    const submitBtn = document.getElementById('save-photo-submit-btn');
    const origText = submitBtn.textContent;

    try {
      submitBtn.disabled = true;
      submitBtn.textContent = 'A GUARDAR...';

      if (editId) {
        await galleryService.updateItem(editId, { title, category, layoutType, imageUrl, description });
        Toast.success('Foto atualizada!');
      } else {
        await galleryService.addItem({ title, category, layoutType, imageUrl, description });
        Toast.success('Nova foto adicionada ao Lookbook!');
      }
      closeModal();
      form.reset();
      resetPhotoDropzone();
      await refreshAdminData();
    } catch (err) {
      Toast.error(err.message || 'Erro ao guardar foto.');
    } finally {
      submitBtn.disabled = false;
      submitBtn.textContent = origText;
    }
  });
}

async function handleImageUpload(file) {
  const idle = document.getElementById('dropzone-idle');
  const loading = document.getElementById('dropzone-loading');
  const preview = document.getElementById('dropzone-preview');
  const previewImg = document.getElementById('dropzone-preview-img');
  const hiddenUrlInput = document.getElementById('photo-url');

  if (!file.type || !file.type.startsWith('image/')) {
    Toast.error('O ficheiro tem de ser uma imagem.');
    return;
  }

  // O barbeiro enquadra a foto aqui, em vez de a cortar antes no telemóvel
  const cropped = await openCropper(file, { aspect: 4 / 5, title: 'AJUSTAR FOTO DA GALERIA', showSafeZone: true });
  if (!cropped) return;

  try {
    if (idle) idle.style.display = 'none';
    if (preview) preview.style.display = 'none';
    if (loading) loading.style.display = 'flex';

    // Upload direto para o bucket 'gallery'
    const publicUrl = await storageService.uploadImage(cropped, 'lookbook');

    hiddenUrlInput.value = publicUrl;
    previewImg.src = publicUrl;

    if (loading) loading.style.display = 'none';
    if (preview) preview.style.display = 'flex';
    Toast.success('Foto pronta. Guarda para a publicar.');
  } catch (err) {
    console.error(err);
    Toast.error(err.message || 'Erro ao fazer upload da imagem.');
    resetPhotoDropzone();
  }
}

function resetPhotoDropzone() {
  const idle = document.getElementById('dropzone-idle');
  const loading = document.getElementById('dropzone-loading');
  const preview = document.getElementById('dropzone-preview');
  const previewImg = document.getElementById('dropzone-preview-img');
  const hiddenUrlInput = document.getElementById('photo-url');
  const fileInput = document.getElementById('photo-file-input');

  if (hiddenUrlInput) hiddenUrlInput.value = '';
  if (fileInput) fileInput.value = '';
  if (previewImg) previewImg.src = '';

  if (loading) loading.style.display = 'none';
  if (preview) preview.style.display = 'none';
  if (idle) idle.style.display = 'flex';
}

function openPhotoModal(item = null) {
  const modal = document.getElementById('photo-modal');
  const titleEl = document.getElementById('photo-modal-title');
  const editId = document.getElementById('photo-edit-id');
  const title = document.getElementById('photo-title');
  const category = document.getElementById('photo-cat');
  const layout = document.getElementById('photo-layout');
  const hiddenUrl = document.getElementById('photo-url');
  const desc = document.getElementById('photo-desc');

  const idle = document.getElementById('dropzone-idle');
  const preview = document.getElementById('dropzone-preview');
  const previewImg = document.getElementById('dropzone-preview-img');

  if (!modal) return;

  if (item) {
    if (titleEl) titleEl.textContent = 'EDITAR FOTOGRAFIA';
    if (editId) editId.value = item.id;
    if (title) title.value = item.title;
    if (category) category.value = item.category;
    if (layout) layout.value = item.layoutType || 'normal';
    if (hiddenUrl) hiddenUrl.value = item.imageUrl;
    if (desc) desc.value = item.description || '';

    // Mostrar pré-visualização da imagem existente
    if (idle) idle.style.display = 'none';
    if (preview) preview.style.display = 'flex';
    if (previewImg) previewImg.src = item.imageUrl;
  } else {
    if (titleEl) titleEl.textContent = 'NOVA FOTOGRAFIA';
    if (editId) editId.value = '';
    document.getElementById('photo-form')?.reset();
    resetPhotoDropzone();
  }

  modal.classList.add('is-active');
}

/**
 * Separador 4: Horário semanal, interruptor das marcações e indisponibilidades
 */
async function refreshSchedule() {
  adminSchedule = await scheduleService.getSchedule({ fresh: true });
  try {
    allTimeOff = adminSchedule.fromDb ? await scheduleService.getAllTimeOff() : [];
  } catch (err) {
    console.warn('Erro ao carregar indisponibilidades:', err);
    allTimeOff = [];
  }

  renderBookingsSwitch();
  renderHoursList();
  renderTimeOffList();
}

function renderBookingsSwitch() {
  const container = document.getElementById('admin-bookings-switch');
  if (!container) return;
  const open = adminSchedule.bookingsOpen;

  container.innerHTML = `
    <div class="apt-acc sched-master ${open ? '' : 'is-closed'}">
      <label class="switch-label">
        <input type="checkbox" class="switch-input" id="bookings-open-toggle" ${open ? 'checked' : ''}>
        <span class="switch-slider"></span>
        <span class="sched-master__title">MARCAÇÕES ${open ? 'ABERTAS' : 'FECHADAS'}</span>
      </label>
      <p class="sched-master__desc">
        ${open
          ? 'Os clientes podem marcar nos dias e horas abaixo. Desliga para deixares de receber pedidos novos.'
          : 'Ninguém consegue marcar até voltares a ligar. As marcações já feitas mantêm-se.'}
      </p>
      ${adminSchedule.fromDb ? '' : '<p class="sched-master__desc" style="color: #ff8a8a;">O horário ainda não está na base de dados: falta correr o ficheiro supabase/horario.sql no Supabase.</p>'}
    </div>
  `;

  const toggle = container.querySelector('#bookings-open-toggle');
  toggle?.addEventListener('change', async () => {
    const wanted = toggle.checked;
    try {
      toggle.disabled = true;
      await scheduleService.setBookingsOpen(wanted);
      if (wanted) Toast.success('Marcações abertas.');
      else Toast.info('Marcações fechadas. Ninguém consegue marcar até voltares a abrir.');
      await refreshSchedule();
    } catch (err) {
      console.error(err);
      toggle.checked = !wanted;
      toggle.disabled = false;
      Toast.error(err.message || 'Não foi possível alterar o estado das marcações.');
    }
  });
}

function breakRowHtml(b = { start: '', end: '' }) {
  return `
    <div class="sched-break">
      <input type="time" class="form-input sched-break-start" step="900" value="${escapeHtml(b.start)}" aria-label="Início da pausa">
      <span class="sched-break__sep">—</span>
      <input type="time" class="form-input sched-break-end" step="900" value="${escapeHtml(b.end)}" aria-label="Fim da pausa">
      <button type="button" class="btn btn--danger-outline btn--sm sched-break-remove" aria-label="Remover pausa">✕</button>
    </div>
  `;
}

function renderHoursList() {
  const container = document.getElementById('admin-hours-list');
  if (!container) return;

  // Semana a começar na segunda, como no calendário das marcações
  const order = [1, 2, 3, 4, 5, 6, 0];

  container.innerHTML = `<div class="apt-accordion">${order.map(wd => {
    const day = adminSchedule.hours[wd];
    const isOpen = wd === openDayId;

    return `
      <div class="apt-acc ${isOpen ? 'is-open' : ''}" data-weekday="${wd}">
        <button type="button" class="apt-acc__head srv-acc__head" aria-expanded="${isOpen}">
          <span class="apt-acc__service">${WEEKDAY_NAMES[wd]}</span>
          <strong class="srv-acc__price">${day.isOpen ? summarizeDay(day) : '—'}</strong>
          <span class="badge-status ${day.isOpen ? 'badge-status--confirmed' : 'badge-status--cancelled'}">${day.isOpen ? 'ABERTO' : 'ENCERRADO'}</span>
          ${CHEVRON_SVG}
        </button>

        <div class="apt-acc__panel">
          <div class="apt-acc__inner">
            <div class="sched-form">
              <label class="switch-label">
                <input type="checkbox" class="switch-input sched-open-toggle" ${day.isOpen ? 'checked' : ''}>
                <span class="switch-slider"></span>
                <span style="font-size: 0.75rem; font-family: var(--font-mono);">ABERTO NESTE DIA</span>
              </label>

              <div class="sched-fields ${day.isOpen ? '' : 'is-disabled'}">
                <div class="sched-times">
                  <div class="form-group">
                    <label class="form-label" for="sched-open-${wd}">ABRE ÀS</label>
                    <input type="time" id="sched-open-${wd}" class="form-input sched-open" step="900" value="${escapeHtml(day.open)}">
                  </div>
                  <div class="form-group">
                    <label class="form-label" for="sched-close-${wd}">FECHA ÀS</label>
                    <input type="time" id="sched-close-${wd}" class="form-input sched-close" step="900" value="${escapeHtml(day.close)}">
                  </div>
                </div>

                <span class="apt-field-label">PAUSAS</span>
                <p class="sched-hint">Intervalos sem marcações dentro do horário do dia, como o almoço. Se não fazes intervalos, deixa vazio.</p>
                <div class="sched-breaks">${day.breaks.map(breakRowHtml).join('')}</div>
                <button type="button" class="btn btn--outline btn--sm sched-add-break">+ PAUSA</button>
              </div>
            </div>
            <div class="apt-acc__footer apt-acc__footer--actions">
              <button type="button" class="btn btn--outline btn--sm sched-copy-btn">COPIAR PARA TODOS OS DIAS</button>
              <button type="button" class="btn btn--gold btn--sm sched-save-btn">GUARDAR</button>
            </div>
          </div>
        </div>
      </div>
    `;
  }).join('')}</div>`;

  container.querySelectorAll('.apt-acc__head').forEach(head => {
    head.addEventListener('click', () => {
      const item = head.parentElement;
      const willOpen = !item.classList.contains('is-open');
      container.querySelectorAll('.apt-acc').forEach(other => {
        other.classList.remove('is-open');
        other.querySelector('.apt-acc__head').setAttribute('aria-expanded', 'false');
      });
      openDayId = willOpen ? Number(item.getAttribute('data-weekday')) : null;
      if (willOpen) {
        item.classList.add('is-open');
        head.setAttribute('aria-expanded', 'true');
      }
    });
  });

  container.querySelectorAll('.apt-acc').forEach(item => {
    const wd = Number(item.getAttribute('data-weekday'));
    const fieldsEl = item.querySelector('.sched-fields');
    const breaksEl = item.querySelector('.sched-breaks');
    const saveBtn = item.querySelector('.sched-save-btn');
    const copyBtn = item.querySelector('.sched-copy-btn');
    const toggle = item.querySelector('.sched-open-toggle');

    const bindRemove = (row) => {
      row.querySelector('.sched-break-remove')?.addEventListener('click', () => row.remove());
    };
    breaksEl.querySelectorAll('.sched-break').forEach(bindRemove);

    item.querySelector('.sched-add-break').addEventListener('click', () => {
      breaksEl.insertAdjacentHTML('beforeend', breakRowHtml());
      bindRemove(breaksEl.lastElementChild);
    });

    const save = async (btn, weekdays, busyText, doneText) => {
      const day = readDayForm(item, wd);
      if (!day) return false;

      const originalText = btn.textContent;
      try {
        btn.disabled = true;
        btn.textContent = busyText;
        await scheduleService.saveDays(weekdays.map(weekday => ({ ...day, weekday })));
        Toast.success(doneText);
        await refreshSchedule();
        return true;
      } catch (err) {
        console.error(err);
        Toast.error(err.message || 'Não foi possível guardar o horário.');
        btn.disabled = false;
        btn.textContent = originalText;
        return false;
      }
    };

    // Abrir/fechar o dia guarda logo, sem ser preciso carregar em Guardar
    toggle.addEventListener('change', async () => {
      fieldsEl.classList.toggle('is-disabled', !toggle.checked);
      const ok = await save(saveBtn, [wd], 'A GUARDAR...',
        `${WEEKDAY_NAMES[wd]}: ${toggle.checked ? 'aberto' : 'encerrado'}.`);
      if (!ok) {
        toggle.checked = !toggle.checked;
        fieldsEl.classList.toggle('is-disabled', !toggle.checked);
      }
    });

    saveBtn.addEventListener('click', () => save(saveBtn, [wd], 'A GUARDAR...', `Horário de ${WEEKDAY_NAMES[wd]} guardado.`));

    copyBtn.addEventListener('click', () => {
      if (!confirmTwoStep(copyBtn, 'COPIAR MESMO?')) return;
      save(copyBtn, [0, 1, 2, 3, 4, 5, 6], 'A COPIAR...', 'Horário copiado para todos os dias.');
    });
  });
}

/**
 * Lê e valida o formulário de um dia. Devolve null (e avisa) se houver algo errado.
 */
function readDayForm(item, weekday) {
  const isOpen = item.querySelector('.sched-open-toggle').checked;
  const open = item.querySelector('.sched-open').value;
  const close = item.querySelector('.sched-close').value;

  if (!open || !close) {
    Toast.error('Escolhe a hora de abertura e a de fecho.');
    return null;
  }
  if (toMinutes(close) <= toMinutes(open)) {
    Toast.error('A hora de fecho tem de ser depois da abertura.');
    return null;
  }

  const breaks = [];
  for (const row of item.querySelectorAll('.sched-break')) {
    const start = row.querySelector('.sched-break-start').value;
    const endEl = row.querySelector('.sched-break-end');
    let end = endEl.value;
    if (!start && !end) continue; // linha vazia: ignora
    if (!start || !end) {
      Toast.error('Escolhe o início e o fim da pausa, ou remove-a no ✕.');
      return null;
    }

    // "01:00" a seguir a "12:00" quer dizer uma da tarde: corrige para 13:00
    if (toMinutes(end) <= toMinutes(start) && toMinutes(end) < 720 && toMinutes(end) + 720 > toMinutes(start)) {
      const typed = end;
      const fixed = toMinutes(end) + 720;
      end = `${String(Math.floor(fixed / 60)).padStart(2, '0')}:${String(fixed % 60).padStart(2, '0')}`;
      endEl.value = end;
      Toast.info(`Pus o fim da pausa às ${end} (${typed} seria de madrugada).`);
    }

    if (toMinutes(end) <= toMinutes(start)) {
      Toast.error(`A pausa das ${start} às ${end} acaba antes de começar. O fim tem de ser depois do início.`);
      return null;
    }
    if (toMinutes(start) < toMinutes(open) || toMinutes(end) > toMinutes(close)) {
      Toast.error(`${WEEKDAY_NAMES[weekday]} só está aberto das ${open} às ${close}. A pausa (${start} — ${end}) tem de ficar dentro dessas horas; fora delas já não há marcações.`, 7000);
      return null;
    }
    breaks.push({ start, end });
  }
  breaks.sort((a, b) => toMinutes(a.start) - toMinutes(b.start));

  return { weekday, isOpen, open, close, breaks };
}

function timeOffDaysLabel(t) {
  const days = Math.round((new Date(`${t.endDate}T00:00:00`) - new Date(`${t.startDate}T00:00:00`)) / 86400000) + 1;
  return days === 1 ? '1 dia' : `${days} dias`;
}

function timeOffRangeLabel(t) {
  return t.startDate === t.endDate
    ? formatDate(t.startDate)
    : `${formatDate(t.startDate)} → ${formatDate(t.endDate)}`;
}

function renderTimeOffList() {
  const container = document.getElementById('admin-timeoff-list');
  const pastContainer = document.getElementById('admin-timeoff-past');
  if (!container || !pastContainer) return;

  const todayStr = formatDateLocalISO();
  const upcoming = allTimeOff.filter(t => t.endDate >= todayStr);
  const past = allTimeOff.filter(t => t.endDate < todayStr).reverse();

  if (upcoming.length === 0) {
    container.innerHTML = `
      <div class="empty-state">
        <p class="empty-state__desc">Não tens dias bloqueados. Usa "+ BLOQUEAR DIAS" quando não puderes atender.</p>
      </div>
    `;
  } else {
    container.innerHTML = `<div class="apt-accordion">${upcoming.map(t => {
      const isOpen = t.id === openTimeOffId;
      const sameDay = t.startDate === t.endDate;
      const hoursLabel = t.startTime ? `${t.startTime} — ${t.endTime}` : 'Dia inteiro';

      return `
        <div class="apt-acc ${isOpen ? 'is-open' : ''}" data-timeoff-id="${t.id}">
          <button type="button" class="apt-acc__head" aria-expanded="${isOpen}">
            <span class="apt-acc__when">
              <strong>${formatDate(t.startDate)}</strong>
              <span>${sameDay ? hoursLabel : `até ${formatDate(t.endDate)}`}</span>
            </span>
            <span class="apt-acc__service">${timeOffDaysLabel(t)}</span>
            <span class="badge-status badge-status--cancelled">BLOQUEADO</span>
            ${CHEVRON_SVG}
          </button>

          <div class="apt-acc__panel">
            <div class="apt-acc__inner">
              <div class="apt-acc__details">
                <div>
                  <span class="apt-field-label">DE</span>
                  <strong>${formatDate(t.startDate)}</strong>
                </div>
                <div>
                  <span class="apt-field-label">ATÉ</span>
                  <strong>${formatDate(t.endDate)}</strong>
                </div>
                <div>
                  <span class="apt-field-label">HORAS</span>
                  <strong>${hoursLabel}</strong>
                </div>
              </div>
              <p class="apt-acc__status">Os clientes não conseguem marcar neste período.</p>
              <div class="apt-acc__footer apt-acc__footer--actions">
                <span></span>
                <button type="button" class="btn btn--danger-outline btn--sm delete-timeoff-btn" data-id="${t.id}">REMOVER BLOQUEIO</button>
              </div>
            </div>
          </div>
        </div>
      `;
    }).join('')}</div>`;

    container.querySelectorAll('.apt-acc__head').forEach(head => {
      head.addEventListener('click', () => {
        const item = head.parentElement;
        const willOpen = !item.classList.contains('is-open');
        container.querySelectorAll('.apt-acc').forEach(other => {
          other.classList.remove('is-open');
          other.querySelector('.apt-acc__head').setAttribute('aria-expanded', 'false');
        });
        openTimeOffId = willOpen ? item.getAttribute('data-timeoff-id') : null;
        if (willOpen) {
          item.classList.add('is-open');
          head.setAttribute('aria-expanded', 'true');
        }
      });
    });
  }

  pastContainer.innerHTML = past.length === 0 ? '' : `
    <div class="apt-acc history-acc ${pastTimeOffOpen ? 'is-open' : ''}">
      <button type="button" class="apt-acc__head history-acc__head" aria-expanded="${pastTimeOffOpen}">
        <span class="history-acc__title">JÁ PASSADOS</span>
        <span class="mono-tag mono-tag--muted">${past.length}</span>
        ${CHEVRON_SVG}
      </button>
      <div class="apt-acc__panel">
        <div class="apt-acc__inner">
          <div class="apt-list history-acc__list" style="padding-bottom: 1.25rem;">
            ${past.map(t => `
              <div class="apt-row">
                <div class="apt-row__info">
                  <div class="apt-row__date-block">
                    <span class="apt-row__date">${timeOffRangeLabel(t)}</span>
                    <span class="apt-row__time">${t.startTime ? `${t.startTime} — ${t.endTime}` : 'Dia inteiro'}</span>
                  </div>
                  <div class="apt-row__service-block">
                    <span class="apt-row__service">${timeOffDaysLabel(t)}</span>
                  </div>
                </div>
                <div class="apt-row__actions">
                  <button type="button" class="btn btn--danger-outline btn--sm delete-timeoff-btn" data-id="${t.id}">ELIMINAR</button>
                </div>
              </div>
            `).join('')}
          </div>
        </div>
      </div>
    </div>
  `;

  pastContainer.querySelector('.history-acc__head')?.addEventListener('click', (e) => {
    const item = e.currentTarget.parentElement;
    pastTimeOffOpen = item.classList.toggle('is-open');
    e.currentTarget.setAttribute('aria-expanded', String(pastTimeOffOpen));
  });

  [container, pastContainer].forEach(parent => {
    parent.querySelectorAll('.delete-timeoff-btn').forEach(btn => {
      btn.addEventListener('click', async () => {
        if (!confirmTwoStep(btn, 'REMOVER MESMO?')) return;
        const originalText = btn.textContent;
        try {
          btn.disabled = true;
          btn.textContent = 'A REMOVER...';
          await scheduleService.deleteTimeOff(btn.getAttribute('data-id'));
          Toast.info('Bloqueio removido.');
          await refreshSchedule();
        } catch (err) {
          console.error(err);
          Toast.error(err.message || 'Não foi possível remover o bloqueio.');
          btn.disabled = false;
          btn.textContent = originalText;
        }
      });
    });
  });
}

/**
 * Modal: bloquear dias
 */
function initTimeOffModal() {
  const modal = document.getElementById('timeoff-modal');
  const form = document.getElementById('timeoff-form');
  if (!modal || !form) return;

  const startEl = document.getElementById('off-start');
  const endEl = document.getElementById('off-end');
  const allDayEl = document.getElementById('off-all-day');
  const timesEl = document.getElementById('off-times');
  const startTimeEl = document.getElementById('off-start-time');
  const endTimeEl = document.getElementById('off-end-time');
  const submitBtn = document.getElementById('save-timeoff-btn');

  const closeModal = () => modal.classList.remove('is-active');
  document.getElementById('close-timeoff-modal')?.addEventListener('click', closeModal);
  document.getElementById('abort-timeoff-btn')?.addEventListener('click', closeModal);

  document.getElementById('add-timeoff-btn')?.addEventListener('click', () => {
    const todayStr = formatDateLocalISO();
    form.reset();
    startEl.min = todayStr;
    endEl.min = todayStr;
    startEl.value = todayStr;
    endEl.value = todayStr;
    timesEl.style.display = 'none';
    modal.classList.add('is-active');
  });

  // O fim nunca fica antes do início
  startEl.addEventListener('change', () => {
    endEl.min = startEl.value;
    if (!endEl.value || endEl.value < startEl.value) endEl.value = startEl.value;
  });

  allDayEl.addEventListener('change', () => {
    timesEl.style.display = allDayEl.checked ? 'none' : 'grid';
  });

  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    const startDate = startEl.value;
    const endDate = endEl.value;
    const allDay = allDayEl.checked;
    const startTime = allDay ? null : startTimeEl.value;
    const endTime = allDay ? null : endTimeEl.value;

    if (endDate < startDate) {
      Toast.error('A data final tem de ser igual ou posterior à inicial.');
      return;
    }
    if (!allDay && (!startTime || !endTime || toMinutes(endTime) <= toMinutes(startTime))) {
      Toast.error('Escolhe as horas, com o fim depois do início.');
      return;
    }

    try {
      submitBtn.disabled = true;
      submitBtn.textContent = 'A BLOQUEAR...';
      await scheduleService.addTimeOff({
        startDate,
        endDate,
        startTime,
        endTime
      });
      closeModal();
      Toast.success('Dias bloqueados.');

      // Não cancela nada sozinho: avisa se já havia marcações nesse período
      const affected = allAppointments.filter(a => isOpenAppointment(a)
        && a.date >= startDate && a.date <= endDate
        && (allDay || (toMinutes(a.time) >= toMinutes(startTime) && toMinutes(a.time) < toMinutes(endTime))));
      if (affected.length > 0) {
        const one = affected.length === 1;
        Toast.warning(`Tens ${affected.length} ${one ? 'marcação' : 'marcações'} nesse período. Trata ${one ? 'dela' : 'delas'} no separador Marcações.`, 7000);
      }

      await refreshSchedule();
    } catch (err) {
      console.error(err);
      Toast.error(err.message || 'Não foi possível bloquear os dias.');
    } finally {
      submitBtn.disabled = false;
      submitBtn.textContent = 'BLOQUEAR';
    }
  });
}

/**
 * Navegação de Abas do Admin
 */
function initAdminTabs() {
  const tabLinks = document.querySelectorAll('.tab-link');
  const tabPanels = document.querySelectorAll('.tab-content-panel');

  tabLinks.forEach(link => {
    link.addEventListener('click', () => {
      tabLinks.forEach(l => l.classList.remove('is-active'));
      tabPanels.forEach(p => p.classList.remove('is-active'));

      link.classList.add('is-active');
      const targetId = link.getAttribute('data-tab');
      document.getElementById(targetId)?.classList.add('is-active');
    });
  });
}

async function renderTeamManagementTable() {
  const tbody = document.getElementById('admin-team-tbody');
  if (!tbody || currentUser.role !== 'barbeiro') return;

  try {
    const users = await authService.getTeamMembers();

    tbody.innerHTML = users.map(u => {
      const isOwner = u.tipo_utilizador === 'barbeiro';
      const isAdmin = u.tipo_utilizador === 'admin';

      return `
        <tr>
          <td><strong style="color: var(--color-white);">${escapeHtml(u.name) || 'Sem nome'}</strong></td>
          <td><span style="font-family: var(--font-mono); font-size: 0.8125rem;">${escapeHtml(u.email)}</span></td>
          <td><span style="font-family: var(--font-mono); font-size: 0.8125rem;">${escapeHtml(u.phone) || '-'}</span></td>
          <td>
            ${isOwner
          ? '<span class="badge-status badge-status--completed">DONO (MESTRE)</span>'
          : (isAdmin
            ? '<span class="badge-status badge-status--confirmed">ADMIN (BARBEIRO)</span>'
            : '<span class="badge-status badge-status--pending">CLIENTE</span>')}
          </td>
          <td style="text-align: right;">
            ${isOwner ? '<span class="mono-tag mono-tag--gold">INALTERÁVEL</span>' : `
              <button type="button" class="btn ${isAdmin ? 'btn--outline' : 'btn--gold'} btn--sm toggle-role-btn" 
                data-id="${u.id}" data-current-role="${u.tipo_utilizador}">
                ${isAdmin ? 'DESPROMOVER A CLIENTE' : 'PROMOVER A ADMIN'}
              </button>
            `}
          </td>
        </tr>
      `;
    }).join('');

    // Adicionar eventos aos botões de promover/despromover
    tbody.querySelectorAll('.toggle-role-btn').forEach(btn => {
      btn.addEventListener('click', async () => {
        const targetId = btn.getAttribute('data-id');
        const currentRole = btn.getAttribute('data-current-role');
        const newRole = currentRole === 'admin' ? 'cliente' : 'admin';

        try {
          btn.disabled = true;
          await authService.updateStaffRole(targetId, newRole);
          Toast.success(`Permissões atualizadas com sucesso!`);
          await renderTeamManagementTable();
        } catch (err) {
          Toast.error(err.message || 'Erro ao alterar permissão.');
          btn.disabled = false;
        }
      });
    });

  } catch (err) {
    console.error('Erro ao listar equipa:', err);
  }
}

/**
 * Barber Photo Management (Secção "O Barbeiro")
 */
const DEFAULT_BARBER_PHOTO = 'https://images.unsplash.com/photo-1621605815971-fbc98d665033?auto=format&fit=crop&w=900&q=85';

async function loadBarberPhoto() {
  try {
    let currentPhoto = '';
    const profile = await barberService.getProfile();
    if (profile && profile.photoUrl) {
      currentPhoto = profile.photoUrl;
    } else {
      currentPhoto = DEFAULT_BARBER_PHOTO;
    }

    setBarberPhotoPreview(currentPhoto);
  } catch (err) {
    console.warn('Erro ao carregar fotografia do barbeiro:', err);
    setBarberPhotoPreview(DEFAULT_BARBER_PHOTO);
  }
}

function setBarberPhotoPreview(photoUrl) {
  const hiddenInput = document.getElementById('site-about-portrait');
  const idle = document.getElementById('about-portrait-dropzone-idle');
  const preview = document.getElementById('about-portrait-dropzone-preview');
  const previewImg = document.getElementById('about-portrait-dropzone-preview-img');

  if (hiddenInput) hiddenInput.value = photoUrl || '';

  if (photoUrl && previewImg && idle && preview) {
    previewImg.src = photoUrl;
    idle.style.display = 'none';
    preview.style.display = 'flex';
  } else if (idle && preview) {
    idle.style.display = 'flex';
    preview.style.display = 'none';
  }
}

function initBarberPhotoHandlers() {
  const hiddenInput = document.getElementById('site-about-portrait');
  const fileInput = document.getElementById('site-about-portrait-input');
  const dropzone = document.getElementById('site-about-portrait-dropzone');
  const idle = document.getElementById('about-portrait-dropzone-idle');
  const loading = document.getElementById('about-portrait-dropzone-loading');
  const preview = document.getElementById('about-portrait-dropzone-preview');
  const previewImg = document.getElementById('about-portrait-dropzone-preview-img');
  const removeBtn = document.getElementById('remove-about-portrait-btn');
  const saveBtn = document.getElementById('save-barber-photo-btn');
  const resetBtn = document.getElementById('reset-barber-photo-btn');

  if (!dropzone || !fileInput) return;

  // Clique na zona para abrir explorador de ficheiros
  dropzone.addEventListener('click', (e) => {
    if (e.target !== removeBtn && !removeBtn?.contains(e.target)) {
      fileInput.click();
    }
  });

  // Seleção de ficheiro
  fileInput.addEventListener('change', async (e) => {
    const file = e.target.files?.[0];
    if (file) await handleBarberPhotoUpload(file);
  });

  // Drag & Drop
  ['dragenter', 'dragover'].forEach(name => {
    dropzone.addEventListener(name, (e) => {
      e.preventDefault();
      e.stopPropagation();
      dropzone.classList.add('is-dragover');
    });
  });

  ['dragleave', 'drop'].forEach(name => {
    dropzone.addEventListener(name, (e) => {
      e.preventDefault();
      e.stopPropagation();
      dropzone.classList.remove('is-dragover');
    });
  });

  dropzone.addEventListener('drop', async (e) => {
    const file = e.dataTransfer?.files?.[0];
    if (file) await handleBarberPhotoUpload(file);
  });

  // Colar imagem via CTRL+V quando focado ou visível
  window.addEventListener('paste', async (e) => {
    if (!dropzone.offsetParent) return;
    if (document.getElementById('photo-modal')?.classList.contains('is-active')) return;
    const items = (e.clipboardData || window.clipboardData)?.items;
    if (!items) return;
    for (let i = 0; i < items.length; i++) {
      if (items[i].type.indexOf('image') !== -1) {
        const file = items[i].getAsFile();
        if (file) {
          e.preventDefault();
          Toast.info('Imagem colada! A enviar...');
          await handleBarberPhotoUpload(file);
          break;
        }
      }
    }
  });

  // Botão Trocar / Remover
  removeBtn?.addEventListener('click', (e) => {
    e.stopPropagation();
    fileInput.click();
  });

  // Função de upload
  async function handleBarberPhotoUpload(file) {
    if (!file.type.startsWith('image/')) {
      Toast.error('O ficheiro tem de ser uma imagem.');
      return;
    }

    const cropped = await openCropper(file, { aspect: 3 / 4, title: 'AJUSTAR A TUA FOTO' });
    if (!cropped) return;

    try {
      if (idle) idle.style.display = 'none';
      if (preview) preview.style.display = 'none';
      if (loading) loading.style.display = 'flex';

      const publicUrl = await storageService.uploadImage(cropped, 'barbeiro');

      if (hiddenInput) hiddenInput.value = publicUrl;
      if (previewImg) previewImg.src = publicUrl;

      if (loading) loading.style.display = 'none';
      if (preview) preview.style.display = 'flex';

      Toast.success('Fotografia enviada! Clica em "Guardar Foto" para confirmar.');
    } catch (err) {
      console.error(err);
      Toast.error(err.message || 'Erro ao enviar imagem.');
      if (loading) loading.style.display = 'none';
      if (hiddenInput?.value && preview && previewImg) {
        preview.style.display = 'flex';
      } else if (idle) {
        idle.style.display = 'flex';
      }
    }
  }

  // Guardar fotografia
  saveBtn?.addEventListener('click', async () => {
    const photoUrl = hiddenInput?.value?.trim();
    if (!photoUrl) {
      Toast.error('Por favor adiciona uma fotografia antes de guardar.');
      return;
    }

    try {
      saveBtn.disabled = true;
      saveBtn.textContent = 'A GUARDAR...';

      // Atualiza perfil_barbeiro
      await barberService.updateProfile({ photoUrl: photoUrl, avatar_url: photoUrl });

      Toast.success('Fotografia da secção "O Barbeiro" atualizada com sucesso!');
    } catch (err) {
      console.error(err);
      Toast.error(err.message || 'Erro ao guardar fotografia.');
    } finally {
      saveBtn.disabled = false;
      saveBtn.innerHTML = '<span>GUARDAR FOTO</span>';
    }
  });

  // Repor foto padrão
  resetBtn?.addEventListener('click', async () => {
    if (!confirmTwoStep(resetBtn, 'REPOR MESMO?')) return;

    try {
      resetBtn.disabled = true;
      resetBtn.textContent = 'A REPOR...';

      setBarberPhotoPreview(DEFAULT_BARBER_PHOTO);

      await barberService.updateProfile({ photoUrl: DEFAULT_BARBER_PHOTO, avatar_url: DEFAULT_BARBER_PHOTO });

      Toast.success('Fotografia reposta para o padrão com sucesso.');
    } catch (err) {
      console.error(err);
      Toast.error(err.message || 'Erro ao repor fotografia.');
    } finally {
      resetBtn.disabled = false;
      resetBtn.textContent = 'REPOR FOTO PADRÃO';
    }
  });
}