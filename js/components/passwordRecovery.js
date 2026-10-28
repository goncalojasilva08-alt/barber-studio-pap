/**
 * Barber Studio — Recuperação de password
 * Quem chega ao site pelo link "repor password" do email entra com uma sessão
 * de recuperação. Este componente mostra então a janela para escolher a
 * password nova (sem ele, o site abria-se e nada mais acontecia).
 */

import { authService } from '../services/authService.js';
import { Toast } from '../core/toast.js';

const urlState = window.location.hash + window.location.search;

// Lido logo ao carregar, antes de o Supabase limpar o endereço
export const arrivedFromRecoveryLink = /[#&?]type=recovery\b/.test(urlState);
const linkExpired = /[#&?]error_code=otp_expired\b/.test(urlState) || /[#&?]error=access_denied\b/.test(urlState);

let modal = null;

function buildModal() {
  const el = document.createElement('div');
  el.className = 'modal-backdrop';
  el.id = 'recovery-modal';
  el.setAttribute('role', 'dialog');
  el.setAttribute('aria-modal', 'true');
  el.setAttribute('aria-labelledby', 'recovery-modal-title');
  el.innerHTML = `
    <div class="modal-card" style="max-width: 440px;">
      <div class="modal-header">
        <h2 class="modal-title" id="recovery-modal-title">NOVA PASSWORD</h2>
      </div>
      <form id="recovery-form" class="booking-form">
        <p class="section-subtitle" style="font-size: 0.875rem;">Escolhe a password nova para a tua conta.</p>
        <div class="form-group">
          <label class="form-label" for="recovery-pw">NOVA PASSWORD</label>
          <input type="password" id="recovery-pw" class="form-input" placeholder="8+ caracteres, letras e números"
            required autocomplete="new-password">
        </div>
        <div class="form-group">
          <label class="form-label" for="recovery-pw-confirm">CONFIRMAR NOVA PASSWORD</label>
          <input type="password" id="recovery-pw-confirm" class="form-input" placeholder="••••••••"
            required autocomplete="new-password">
        </div>
        <button type="submit" class="btn btn--gold btn--full" id="recovery-submit-btn">GUARDAR PASSWORD</button>
      </form>
    </div>
  `;
  document.body.appendChild(el);

  const form = el.querySelector('#recovery-form');
  const submitBtn = el.querySelector('#recovery-submit-btn');

  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    const password = el.querySelector('#recovery-pw').value;
    const confirm = el.querySelector('#recovery-pw-confirm').value;

    if (password.length < 8 || !/[a-zA-Z]/.test(password) || !/[0-9]/.test(password)) {
      Toast.error('A password deve ter pelo menos 8 caracteres, incluindo letras e números.');
      return;
    }
    if (password !== confirm) {
      Toast.error('As passwords não coincidem.');
      return;
    }

    try {
      submitBtn.disabled = true;
      submitBtn.textContent = 'A GUARDAR...';
      await authService.changePassword(null, password);
      Toast.success('Password alterada. Já estás com a sessão iniciada.');

      const user = await authService.getCurrentUser();
      setTimeout(() => {
        window.location.href = user?.role === 'admin' || user?.role === 'barbeiro' ? 'admin.html' : 'index.html';
      }, 1200);
    } catch (err) {
      Toast.error(err.message || 'Não foi possível alterar a password. Pede um novo link.');
      submitBtn.disabled = false;
      submitBtn.textContent = 'GUARDAR PASSWORD';
    }
  });

  return el;
}

function openRecoveryModal() {
  if (!modal) modal = buildModal();
  if (modal.classList.contains('is-active')) return;
  modal.classList.add('is-active');
  modal.querySelector('#recovery-pw')?.focus();
}

function whenReady(fn) {
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', fn);
  else fn();
}

// O Supabase anuncia a sessão de recuperação com este evento
authService.onAuthStateChange((user, event) => {
  if (event === 'PASSWORD_RECOVERY') whenReady(openRecoveryModal);
});

if (arrivedFromRecoveryLink) {
  // Rede de segurança caso o evento chegue antes de este ficheiro estar a ouvir
  whenReady(async () => {
    const user = await authService.getCurrentUser();
    if (user) openRecoveryModal();
  });
} else if (linkExpired) {
  whenReady(() => {
    Toast.error('O link de recuperação expirou ou já foi usado. Pede um novo em "Esqueci-me da password".', 7000);
  });
}
