/**
 * Barber Studio — Universal Header & Navigation Controller
 * Com Cache Instantânea (Zero Flash/Flicker), Scroll Suave e Modal de Logout
 */

import { authService } from '../services/authService.js';
import { flashToast } from '../core/toast.js';

// --------------------------------------------------------------------------
// 1. GERADORES DE HTML DOS BOTÕES DE SESSÃO
// --------------------------------------------------------------------------
function getDesktopAuthHtml(role) {
  if (role === 'admin' || role === 'barbeiro') {
    return `
      <a href="admin.html" class="btn btn--gold-outline btn--sm">
        <svg class="icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5">
          <path d="M12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6Z"/>
          <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 1 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 1 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 1 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 1 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1Z"/>
        </svg>
        <span class="btn-text-desktop">ADMIN</span>
      </a>
      <button type="button" class="btn btn--outline btn--sm global-logout-btn">
        <span>SAIR</span>
      </button>
    `;
  }

  if (role === 'cliente') {
    return `
      <a href="cliente.html" class="btn btn--gold-outline btn--sm">
        <svg class="icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5">
          <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"></path>
          <circle cx="12" cy="7" r="4"></circle>
        </svg>
        <span class="btn-text-desktop">CLIENTE</span>
      </a>
      <button type="button" class="btn btn--outline btn--sm global-logout-btn">
        <span>SAIR</span>
      </button>
    `;
  }

  // Visitante não autenticado
  return `
    <a href="login.html" class="btn btn--outline btn--sm">
      <svg class="icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5">
        <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"></path>
        <circle cx="12" cy="7" r="4"></circle>
      </svg>
      <span class="btn-text-desktop">ENTRAR</span>
    </a>
  `;
}

function getDrawerAuthHtml(role) {
  if (role === 'admin' || role === 'barbeiro') {
    return `
      <a href="admin.html" class="btn btn--gold-outline btn--full">PAINEL DE GESTÃO</a>
      <button type="button" class="btn btn--outline btn--full global-logout-btn" style="margin-top: 0.5rem;">TERMINAR SESSÃO</button>
    `;
  }
  if (role === 'cliente') {
    return `
      <a href="cliente.html" class="btn btn--gold-outline btn--full">A MINHA ÁREA DE CLIENTE</a>
      <button type="button" class="btn btn--outline btn--full global-logout-btn" style="margin-top: 0.5rem;">TERMINAR SESSÃO</button>
    `;
  }
  return `
    <a href="login.html" class="btn btn--outline btn--full">INICIAR SESSÃO</a>
  `;
}

// --------------------------------------------------------------------------
// 2. MODAL DE CONFIRMAÇÃO DE LOGOUT UNIVERSAL
// --------------------------------------------------------------------------
export function ensureLogoutConfirmModal() {
  let modal = document.getElementById('global-logout-confirm-modal');
  if (!modal) {
    modal = document.createElement('div');
    modal.id = 'global-logout-confirm-modal';
    modal.className = 'modal-backdrop';
    modal.setAttribute('aria-hidden', 'true');
    modal.setAttribute('role', 'dialog');
    modal.innerHTML = `
      <div class="modal-card" style="max-width: 440px; text-align: center;">
        <div class="modal-header" style="justify-content: center; border-bottom: none; padding-bottom: 0.5rem; margin-bottom: 0.5rem;">
          <h2 class="modal-title" style="font-size: 1.35rem; color: var(--color-white);">Terminar sessão?</h2>
        </div>
        <p style="color: var(--color-gray-soft); font-size: 0.9375rem; margin-bottom: 2rem; line-height: 1.5;">
          Tens a certeza de que pretendes sair da tua conta?
        </p>
        <div style="display: flex; gap: 0.75rem; justify-content: center;">
          <button type="button" class="btn btn--outline" id="modal-logout-cancel-btn" style="flex: 1;">
            CANCELAR
          </button>
          <button type="button" class="btn btn--gold" id="modal-logout-confirm-btn" style="flex: 1;">
            SAIR
          </button>
        </div>
      </div>
    `;
    document.body.appendChild(modal);

    const cancelBtn = modal.querySelector('#modal-logout-cancel-btn');
    const confirmBtn = modal.querySelector('#modal-logout-confirm-btn');

    cancelBtn?.addEventListener('click', () => {
      modal.classList.remove('is-active');
      modal.setAttribute('aria-hidden', 'true');
    });

    modal.addEventListener('click', (e) => {
      if (e.target === modal) {
        modal.classList.remove('is-active');
        modal.setAttribute('aria-hidden', 'true');
      }
    });

    confirmBtn?.addEventListener('click', async () => {
      confirmBtn.disabled = true;
      confirmBtn.textContent = 'A SAIR...';
      localStorage.removeItem('barberstudio_session_role');
      try {
        await authService.logout();
      } catch (e) { /* ignore */ }
      // Ao sair só recebe a despedida: adia as boas-vindas seguintes
      try { localStorage.setItem('barberstudio_notice_welcome_back', String(Date.now())); } catch (e) { /* ignore */ }
      flashToast('Sessão terminada. Até breve!', 'bye');
      window.location.href = 'index.html';
    });
  }
  return modal;
}

export function promptLogoutConfirmation() {
  const modal = ensureLogoutConfirmModal();
  modal.classList.add('is-active');
  modal.setAttribute('aria-hidden', 'false');
}

// --------------------------------------------------------------------------
// 3. APLICAÇÃO IMEDIATA DOS SLOTS DE AUTENTICAÇÃO
// --------------------------------------------------------------------------
function renderAuthSlots(role) {
  const navAuthSlot = document.getElementById('nav-auth-slot');
  const drawerAuthSlot = document.getElementById('drawer-auth-slot');

  if (navAuthSlot) navAuthSlot.innerHTML = getDesktopAuthHtml(role);
  if (drawerAuthSlot) drawerAuthSlot.innerHTML = getDrawerAuthHtml(role);

  // Vincular modal de logout aos botões
  document.querySelectorAll('.global-logout-btn').forEach(btn => {
    btn.onclick = (e) => {
      e.preventDefault();
      promptLogoutConfirmation();
    };
  });
}

// --------------------------------------------------------------------------
// 4. CONTROLADOR PRINCIPAL DA NAVEGAÇÃO
// --------------------------------------------------------------------------
export async function initNavigation() {
  ensureLogoutConfirmModal();

  // A) Intercetor global para qualquer botão de logout na página
  document.addEventListener('click', (e) => {
    const logoutTrigger = e.target.closest('#profile-logout-btn, #admin-logout-btn, #client-logout-btn, .global-logout-btn, [data-logout-btn]');
    if (logoutTrigger) {
      e.preventDefault();
      promptLogoutConfirmation();
    }
  });

  // B) RENDERIZAÇÃO INSTANTÂNEA VIA CACHE LOCAL (Impede qualquer flash visual)
  const cachedRole = localStorage.getItem('barberstudio_session_role') || 'guest';
  renderAuthSlots(cachedRole);

  // C) CONTROLO DO MENU HAMBÚRGUER MOBILE
  const menuToggle = document.getElementById('menu-toggle');
  const mobileDrawer = document.getElementById('mobile-drawer');

  if (menuToggle && mobileDrawer) {
    menuToggle.onclick = () => {
      const isExpanded = menuToggle.getAttribute('aria-expanded') === 'true';
      menuToggle.setAttribute('aria-expanded', String(!isExpanded));
      mobileDrawer.classList.toggle('is-open');
      mobileDrawer.setAttribute('aria-hidden', String(isExpanded));
      document.body.style.overflow = !isExpanded ? 'hidden' : '';
    };

    mobileDrawer.querySelectorAll('a').forEach(link => {
      link.onclick = () => {
        menuToggle.setAttribute('aria-expanded', 'false');
        mobileDrawer.classList.remove('is-open');
        mobileDrawer.setAttribute('aria-hidden', 'true');
        document.body.style.overflow = '';
      };
    });
  }

  // D) INTERCEÇÃO DE ÂNCORAS NO INDEX (Evita recarregamento de página)
  document.addEventListener('click', (e) => {
    const link = e.target.closest('a');
    if (!link) return;

    const href = link.getAttribute('href');
    if (!href || !href.includes('#')) return;

    const hash = href.substring(href.indexOf('#'));
    if (hash === '#') return;

    const isCurrentPage = link.pathname === window.location.pathname ||
      (link.pathname.endsWith('index.html') && (window.location.pathname === '/' || window.location.pathname.endsWith('index.html'))) ||
      !href.includes('.html');

    if (isCurrentPage) {
      const targetEl = document.querySelector(hash);
      if (targetEl) {
        e.preventDefault();

        // Fechar gaveta mobile se estiver aberta
        if (mobileDrawer?.classList.contains('is-open')) {
          menuToggle?.setAttribute('aria-expanded', 'false');
          mobileDrawer.classList.remove('is-open');
          mobileDrawer.setAttribute('aria-hidden', 'true');
          document.body.style.overflow = '';
        }

        targetEl.scrollIntoView({ behavior: 'smooth', block: 'start' });
        history.pushState(null, null, hash);
      }
    }
  });

  // E) CONFIRMAÇÃO SILENCIOSA COM SUPABASE EM SEGUNDO PLANO
  try {
    const user = await authService.getCurrentUser();
    const activeRole = user ? (user.role || 'cliente') : 'guest';

    if (activeRole !== cachedRole) {
      localStorage.setItem('barberstudio_session_role', activeRole);
      renderAuthSlots(activeRole);
    }
  } catch (err) {
    // Se a rede falhar, mantém a cache
  }
}

// Inicialização imediata
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', initNavigation);
} else {
  initNavigation();
}