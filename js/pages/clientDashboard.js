/**
 * Barber Studio — Client Portal Controller
 */

import { authService } from '../services/authService.js';
import { appointmentService } from '../services/appointmentService.js';
import { Toast } from '../core/toast.js';
import { formatDate, formatDateLocalISO, cleanPhone, setupPhoneInput, escapeHtml, isPlausiblePhone, FAKE_PHONE_MESSAGE } from '../core/utils.js';
import { promptLogoutConfirmation } from '../components/nav.js';
import { watchAppointments } from '../services/realtimeService.js';

let currentUser = null;
let clientAppointments = [];
let pendingCancelId = null;

// Histórico: quanto tempo mostrar (escolha do cliente, guardada neste dispositivo)
const HISTORY_PREF_KEY = 'barberstudio_history_days';
const HISTORY_PAGE_SIZE = 5;
let historyVisibleCount = HISTORY_PAGE_SIZE;

document.addEventListener('DOMContentLoaded', async () => {
  // 1. Auth Guard
  currentUser = await authService.getCurrentUser();
  if (!currentUser) {
    window.location.href = 'login.html';
    return;
  }
  if (currentUser.role === 'admin' || currentUser.role === 'barbeiro') {
    window.location.href = 'admin.html';
    return;
  }
  document.body.classList.add('is-ready');

  // 2. Set Greeting & User Details
  const greetingEl = document.getElementById('client-greeting');
  if (greetingEl) {
    const firstName = currentUser.name.split(' ')[0].toUpperCase();
    greetingEl.textContent = `OLÁ, ${firstName}.`;
  }

  // 3. Tab Switching
  initTabs();
  initHistoryControls();

  // 4. Load & Render Data
  await loadAndRenderData();

  // 5. Profile Form Handlers
  initProfileForms();

  // 6. Logout Handlers
  const logoutBtns = [
    document.getElementById('client-logout-btn'),
    document.getElementById('profile-logout-btn')
  ];
  logoutBtns.forEach(btn => {
    if (btn) {
      btn.addEventListener('click', (e) => {
        e.preventDefault();
        promptLogoutConfirmation();
      });
    }
  });

  // 7. Cancellation Modal Setup
  initCancelModal();

  // 8. O estado das marcações muda sem recarregar a página
  watchAppointments(handleAppointmentChange, { clientId: currentUser.id });
});

/**
 * Tempo real: quando o barbeiro confirma ou cancela, recarrega as marcações e avisa.
 */
let realtimeTimer = null;

function handleAppointmentChange(payload) {
  const row = payload.new || {};
  const old = payload.old || {};

  if (payload.eventType === 'UPDATE' && row.status !== old.status) {
    const when = row.date ? `${formatDate(String(row.date).split('T')[0])} às ${String(row.time || '').slice(0, 5)}` : '';
    if (row.status === 'CONFIRMADA') {
      Toast.success(`O Rui confirmou a tua marcação de ${when}.`, 7000);
    } else if (row.estado === 'CANCELADA' && row.cancelada_por === 'admin') {
      cancelToastShown = false; // deixa o aviso de cancelamento voltar a aparecer
    }
  }

  clearTimeout(realtimeTimer);
  realtimeTimer = setTimeout(loadAndRenderData, 400);
}

async function loadAndRenderData() {
  try {
    clientAppointments = await appointmentService.getClientAppointments(currentUser.id);
    renderCancelNotices();
    renderUpcomingAppointments();
    renderHistory();
  } catch (err) {
    console.error('Erro ao carregar marcações:', err);
    const nextContainer = document.getElementById('next-apt-container');
    if (nextContainer) {
      nextContainer.innerHTML = `
        <div class="empty-state">
          <div class="empty-state__icon">
            <svg class="icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>
          </div>
          <h3 class="empty-state__title">ERRO AO CARREGAR MARCAÇÕES</h3>
          <p class="empty-state__desc">Não foi possível carregar as tuas marcações. Por favor, tenta novamente mais tarde.</p>
        </div>
      `;
    }
  }
}

/**
 * Marcações que o barbeiro cancelou e que o cliente ainda não viu:
 * ficam em destaque no topo até o cliente carregar em "Entendi".
 */
let cancelToastShown = false;

function renderCancelNotices() {
  const container = document.getElementById('cancel-notice-container');
  if (!container) return;

  const unseen = clientAppointments
    .filter(a => a.status === 'CANCELADA' && a.cancelledBy === 'admin' && !a.cancelSeen)
    .sort((a, b) => `${a.date}T${a.time}`.localeCompare(`${b.date}T${b.time}`));

  container.innerHTML = unseen.map(apt => `
    <div class="apt-acc cancel-notice" role="alert" data-apt-id="${apt.id}">
      <div class="cancel-notice__body">
        <span class="badge-status badge-status--cancelled">CANCELADA PELO BARBEIRO</span>
        <h2 class="cancel-notice__title">A tua marcação de ${formatDate(apt.date)} às ${apt.time} foi cancelada.</h2>
        <p class="cancel-notice__desc">
          O Rui cancelou a tua marcação de <strong>${escapeHtml(apt.serviceName)}</strong>.
          Esse horário já não está reservado para ti. Podes marcar outro quando quiseres.
        </p>
      </div>
      <div class="apt-acc__footer apt-acc__footer--actions">
        <button type="button" class="btn btn--outline btn--sm cancel-notice-ack" data-apt-id="${apt.id}">ENTENDI</button>
        <a href="marcar.html" class="btn btn--gold btn--sm">MARCAR OUTRO HORÁRIO</a>
      </div>
    </div>
  `).join('');

  if (unseen.length > 0 && !cancelToastShown) {
    cancelToastShown = true;
    Toast.warning(unseen.length === 1
      ? 'O Rui cancelou uma marcação tua.'
      : `O Rui cancelou ${unseen.length} marcações tuas.`, 6000);
  }

  container.querySelectorAll('.cancel-notice-ack').forEach(btn => {
    btn.addEventListener('click', async () => {
      const id = btn.getAttribute('data-apt-id');
      const card = btn.closest('.cancel-notice');
      try {
        btn.disabled = true;
        await appointmentService.markCancelSeen(id);
        const apt = clientAppointments.find(a => a.id === id);
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

function isUpcoming(apt, todayStr) {
  return (apt.status === 'PENDENTE' || apt.status === 'CONFIRMADA') && apt.date >= todayStr;
}

/**
 * Próximas marcações: um bloco por marcação, fechado por defeito.
 * Tocar no bloco expande os detalhes e o botão de cancelar.
 */
function renderUpcomingAppointments() {
  const container = document.getElementById('next-apt-container');
  if (!container) return;

  const todayStr = formatDateLocalISO();
  const upcoming = clientAppointments
    .filter(a => isUpcoming(a, todayStr))
    .sort((a, b) => `${a.date}T${a.time}`.localeCompare(`${b.date}T${b.time}`));

  if (upcoming.length === 0) {
    container.innerHTML = `
      <div class="empty-state">
        <div class="empty-state__icon">
          <svg class="icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><rect width="18" height="18" x="3" y="4" rx="2" ry="2"/><line x1="16" x2="16" y1="2" y2="6"/><line x1="8" x2="8" y1="2" y2="6"/><line x1="3" x2="21" y1="10" y2="10"/></svg>
        </div>
        <h3 class="empty-state__title">NÃO TENS MARCAÇÕES ATIVAS</h3>
        <p class="empty-state__desc">Está na hora de renovar o teu corte ou alinhar a barba com o Rui.</p>
        <a href="marcar.html" class="btn btn--gold btn--sm" style="margin-top: 0.5rem;">
          <span>MARCAR NOVO HORÁRIO</span>
        </a>
      </div>
    `;
    return;
  }

  container.innerHTML = `<div class="apt-accordion">${upcoming.map((apt, idx) => {
    const confirmed = apt.status === 'CONFIRMADA';
    const badgeClass = confirmed ? 'badge-status--confirmed' : 'badge-status--pending';
    const badgeLabel = confirmed ? 'CONFIRMADA' : 'PENDENTE';
    const open = idx === 0;

    return `
      <div class="apt-acc ${open ? 'is-open' : ''}">
        <button type="button" class="apt-acc__head" aria-expanded="${open}">
          <span class="apt-acc__when">
            <strong>${formatDate(apt.date)}</strong>
            <span>${apt.time}</span>
          </span>
          <span class="apt-acc__service">${escapeHtml(apt.serviceName)}</span>
          <span class="badge-status ${badgeClass}">${badgeLabel}</span>
          <svg class="icon apt-acc__chevron" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" aria-hidden="true"><polyline points="6 9 12 15 18 9"/></svg>
        </button>

        <div class="apt-acc__panel">
          <div class="apt-acc__inner">
            <div class="apt-acc__details">
              <div>
                <span class="apt-field-label">DURAÇÃO</span>
                <strong>${apt.duration || '45 min'}</strong>
              </div>
              <div>
                <span class="apt-field-label">VALOR</span>
                <strong style="color: var(--color-gold);">€${apt.price}</strong>
              </div>
              <div>
                <span class="apt-field-label">REFERÊNCIA</span>
                <strong>#${String(apt.id).slice(0, 8).toUpperCase()}</strong>
              </div>
            </div>
            <p class="apt-acc__status">
              ${confirmed ? 'Marcação confirmada. Até lá!' : 'A aguardar confirmação do Rui.'}
            </p>
            <div class="apt-acc__footer">
              <span>Não podes comparecer?</span>
              <button type="button" class="btn btn--danger-outline btn--sm cancel-trigger-btn" data-apt-id="${apt.id}">
                CANCELAR ESTA MARCAÇÃO
              </button>
            </div>
          </div>
        </div>
      </div>
    `;
  }).join('')}</div>`;

  // Abrir / fechar blocos (um aberto de cada vez)
  container.querySelectorAll('.apt-acc__head').forEach(head => {
    head.addEventListener('click', () => {
      const item = head.parentElement;
      const willOpen = !item.classList.contains('is-open');
      container.querySelectorAll('.apt-acc').forEach(other => {
        other.classList.remove('is-open');
        other.querySelector('.apt-acc__head').setAttribute('aria-expanded', 'false');
      });
      if (willOpen) {
        item.classList.add('is-open');
        head.setAttribute('aria-expanded', 'true');
      }
    });
  });

  attachRowActionListeners(container);
}

function getHistoryDays() {
  const saved = Number(localStorage.getItem(HISTORY_PREF_KEY));
  return [0, 30, 90].includes(saved) && localStorage.getItem(HISTORY_PREF_KEY) !== null ? saved : 90;
}

/**
 * Histórico: marcações concluídas, canceladas ou já passadas.
 * Fechado por defeito; mostra só o período escolhido pelo cliente, 5 de cada vez.
 */
function renderHistory() {
  const container = document.getElementById('all-apts-list');
  if (!container) return;

  const todayStr = formatDateLocalISO();
  const days = getHistoryDays();
  let past = clientAppointments.filter(a => !isUpcoming(a, todayStr));

  if (days > 0) {
    const limit = new Date();
    limit.setDate(limit.getDate() - days);
    const limitStr = formatDateLocalISO(limit);
    past = past.filter(a => a.date >= limitStr);
  }

  const countEl = document.getElementById('history-count');
  if (countEl) countEl.textContent = past.length === 1 ? '1 MARCAÇÃO' : `${past.length} MARCAÇÕES`;

  document.querySelectorAll('.history-period-btn').forEach(btn => {
    btn.classList.toggle('is-active', Number(btn.getAttribute('data-history-days')) === days);
  });

  const moreBtn = document.getElementById('history-more-btn');

  if (past.length === 0) {
    container.innerHTML = `<p class="empty-state__desc" style="padding: 1.5rem 0; text-align: center;">Sem marcações neste período.</p>`;
    if (moreBtn) moreBtn.style.display = 'none';
    return;
  }

  container.innerHTML = past.slice(0, historyVisibleCount).map(apt => createAppointmentRowHtml(apt)).join('');

  if (moreBtn) {
    const remaining = past.length - historyVisibleCount;
    moreBtn.style.display = remaining > 0 ? 'inline-flex' : 'none';
    moreBtn.textContent = `VER MAIS (${remaining})`;
  }
}

function initHistoryControls() {
  const acc = document.getElementById('history-acc');
  const toggle = document.getElementById('history-toggle');

  toggle?.addEventListener('click', () => {
    const open = acc.classList.toggle('is-open');
    toggle.setAttribute('aria-expanded', String(open));
  });

  document.querySelectorAll('.history-period-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      localStorage.setItem(HISTORY_PREF_KEY, btn.getAttribute('data-history-days'));
      historyVisibleCount = HISTORY_PAGE_SIZE;
      renderHistory();
    });
  });

  document.getElementById('history-more-btn')?.addEventListener('click', () => {
    historyVisibleCount += HISTORY_PAGE_SIZE;
    renderHistory();
  });
}

function createAppointmentRowHtml(apt) {
  let badgeClass = 'badge-status--pending';
  if (apt.status === 'CONFIRMADA') badgeClass = 'badge-status--confirmed';
  if (apt.status === 'CONCLUÍDA') badgeClass = 'badge-status--completed';
  if (apt.status === 'CANCELADA') badgeClass = 'badge-status--cancelled';

  return `
    <div class="apt-row">
      <div class="apt-row__info">
        <div class="apt-row__date-block">
          <span class="apt-row__date">${formatDate(apt.date)}</span>
          <span class="apt-row__time">${apt.time}</span>
        </div>
        <div class="apt-row__service-block">
          <span class="apt-row__service">${escapeHtml(apt.serviceName)}</span>
          <span class="mono-tag mono-tag--muted">${apt.duration || '45 min'} · €${apt.price}</span>
        </div>
      </div>
      <div class="apt-row__actions">
        <span class="badge-status ${badgeClass}">${apt.status === 'CANCELADA' && apt.cancelledBy === 'admin' ? 'CANCELADA PELO BARBEIRO' : apt.status}</span>
      </div>
    </div>
  `;
}

function attachRowActionListeners(parent) {
  parent.querySelectorAll('.cancel-trigger-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      const aptId = btn.getAttribute('data-apt-id');
      const apt = clientAppointments.find(a => a.id === aptId);
      if (apt) openCancelModal(apt);
    });
  });
}

/**
 * Cancellation Modal Logic
 */
function initCancelModal() {
  const modal = document.getElementById('cancel-modal');
  const closeBtn = document.getElementById('close-cancel-modal');
  const abortBtn = document.getElementById('abort-cancel-btn');
  const confirmBtn = document.getElementById('confirm-cancel-btn');

  const closeModal = () => {
    if (!modal) return;
    modal.classList.remove('is-active');
    pendingCancelId = null;
  };

  closeBtn?.addEventListener('click', closeModal);
  abortBtn?.addEventListener('click', closeModal);

  confirmBtn?.addEventListener('click', async () => {
    if (!pendingCancelId) return;
    try {
      confirmBtn.disabled = true;
      confirmBtn.textContent = 'A CANCELAR...';

      // O barbeiro só é avisado se já tinha confirmado esta marcação
      const wasConfirmed = clientAppointments.find(a => a.id === pendingCancelId)?.status === 'CONFIRMADA';
      await appointmentService.cancelAppointment(pendingCancelId, '', 'cliente', wasConfirmed);
      Toast.success('Marcação cancelada com sucesso.');
      closeModal();
      await loadAndRenderData();
    } catch (err) {
      Toast.error(err.message || 'Erro ao cancelar marcação.');
    } finally {
      confirmBtn.disabled = false;
      confirmBtn.textContent = 'CONFIRMAR CANCELAMENTO';
    }
  });
}

function openCancelModal(apt) {
  const modal = document.getElementById('cancel-modal');
  const preview = document.getElementById('cancel-apt-preview');
  if (!modal || !preview) return;

  pendingCancelId = apt.id;
  preview.innerHTML = `
    <strong style="display: block; color: var(--color-white); font-size: 1.05rem;">${escapeHtml(apt.serviceName)}</strong>
    <span class="mono-tag mono-tag--gold" style="margin-top: 0.35rem; display: block;">
      ${formatDate(apt.date)} às ${apt.time} · €${apt.price}
    </span>
  `;

  modal.classList.add('is-active');
}

/**
 * Tab Navigation Setup
 */
function initTabs() {
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

/**
 * Profile Forms Logic
 */
function initProfileForms() {
  const profName = document.getElementById('prof-name');
  const profEmail = document.getElementById('prof-email');
  const profPhone = document.getElementById('prof-phone');
  const profileForm = document.getElementById('profile-form');
  const changePwForm = document.getElementById('change-pw-form');

  if (currentUser) {
    if (profName) profName.value = currentUser.name || '';
    if (profEmail) profEmail.value = currentUser.email || '';
    if (profPhone) {
      profPhone.value = cleanPhone(currentUser.phone);
      setupPhoneInput(profPhone);
    }
  }

  if (profileForm) {
    profileForm.addEventListener('submit', async (e) => {
      e.preventDefault();
      const phoneVal = cleanPhone(profPhone?.value);
      if (phoneVal.length !== 9) {
        Toast.error('O número de telemóvel deve ter exatamente 9 dígitos.');
        profPhone?.focus();
        return;
      }
      if (!isPlausiblePhone(phoneVal)) {
        Toast.error(FAKE_PHONE_MESSAGE, 6000);
        profPhone?.focus();
        return;
      }

      try {
        const updated = await authService.updateProfile(currentUser.id, {
          name: profName.value,
          phone: phoneVal
        });
        currentUser = updated;
        Toast.success('Perfil atualizado com sucesso!');
        const greetingEl = document.getElementById('client-greeting');
        if (greetingEl) {
          greetingEl.textContent = `OLÁ, ${updated.name.split(' ')[0].toUpperCase()}.`;
        }
      } catch (err) {
        Toast.error(err.message || 'Erro ao atualizar perfil.');
      }
    });
  }

  if (changePwForm) {
    changePwForm.addEventListener('submit', async (e) => {
      e.preventDefault();
      const newPw = document.getElementById('new-pw')?.value;
      const confirmPw = document.getElementById('confirm-new-pw')?.value;

      if (!newPw || newPw.length < 8 || !/[a-zA-Z]/.test(newPw) || !/[0-9]/.test(newPw)) {
        Toast.error('A password deve ter pelo menos 8 caracteres, incluindo letras e números.');
        return;
      }

      if (newPw !== confirmPw) {
        Toast.error('As passwords não coincidem.');
        return;
      }

      try {
        await authService.changePassword(currentUser.id, newPw);
        Toast.success('Password alterada com sucesso!');
        changePwForm.reset();
      } catch (err) {
        Toast.error(err.message || 'Erro ao alterar password.');
      }
    });
  }
}
