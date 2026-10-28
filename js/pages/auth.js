/**
 * Barber Studio — Auth Pages Controller (Login & Register)
 * Supports dynamic redirect after successful login or registration.
 */

import { authService } from '../services/authService.js';
import { Toast } from '../core/toast.js';
import { cleanPhone, setupPhoneInput } from '../core/utils.js';
import { arrivedFromRecoveryLink } from '../components/passwordRecovery.js';

document.addEventListener('DOMContentLoaded', async () => {
  const urlParams = new URLSearchParams(window.location.search);
  const redirectTarget = urlParams.get('redirect');

  // Check if already logged in -> redirect to target or respective portal
  const currentUser = await authService.getCurrentUser();
  // Quem vem do link de recuperação fica nesta página para escolher a password nova
  if (currentUser && !arrivedFromRecoveryLink) {
    if (window.location.pathname.endsWith('login.html') || window.location.pathname.endsWith('registo.html')) {
      if (redirectTarget) {
        window.location.href = redirectTarget;
      } else if (currentUser.role === 'admin') {
        window.location.href = 'admin.html';
      } else {
        window.location.href = 'index.html';
      }
      return;
    }
  }

  // --- SOCIAL AUTH BUTTONS (Google) ---
  const handleSocialAuth = async (provider, btnEl) => {
    try {
      btnEl.disabled = true;
      btnEl.style.opacity = '0.7';
      Toast.info('A redirecionar para autenticação Google...');
      await authService.loginWithProvider(provider);
    } catch (err) {
      console.error(`Erro OAuth (${provider}):`, err);
      Toast.error(err.message || `Erro ao autenticar com Google.`);
      btnEl.disabled = false;
      btnEl.style.opacity = '1';
    }
  };

  const googleLoginBtn = document.getElementById('google-login-btn');
  const googleRegBtn = document.getElementById('google-reg-btn');

  googleLoginBtn?.addEventListener('click', (e) => {
    e.preventDefault();
    handleSocialAuth('google', googleLoginBtn);
  });

  // Criar conta (por email ou com a Google) exige aceitar a Política de Privacidade
  const consentAccepted = () => {
    const consent = document.getElementById('reg-consent');
    if (!consent || consent.checked) return true;
    Toast.error('Para criares conta tens de aceitar a Política de Privacidade.');
    consent.focus();
    return false;
  };

  googleRegBtn?.addEventListener('click', (e) => {
    e.preventDefault();
    if (!consentAccepted()) return;
    handleSocialAuth('google', googleRegBtn);
  });

  // --- LOGIN PAGE LOGIC ---
  const loginForm = document.getElementById('login-form');
  const demoClientBtn = document.getElementById('demo-client-btn');
  const demoAdminBtn = document.getElementById('demo-admin-btn');
  const emailInput = document.getElementById('login-email');
  const passwordInput = document.getElementById('login-password');

  // Update link to register with redirect parameter
  const registerLink = document.querySelector('.auth-bottom-text a');
  if (registerLink && redirectTarget) {
    registerLink.href = `registo.html?redirect=${encodeURIComponent(redirectTarget)}`;
  }

  // Quick 1-Click Fill Demo Client
  if (demoClientBtn && emailInput && passwordInput) {
    demoClientBtn.addEventListener('click', () => {
      emailInput.value = 'cliente@test.com';
      passwordInput.value = '123456';
      Toast.info('Credenciais de Cliente preenchidas. Clica em Entrar!');
    });
  }

  // Quick 1-Click Fill Demo Admin (Rui)
  if (demoAdminBtn && emailInput && passwordInput) {
    demoAdminBtn.addEventListener('click', () => {
      emailInput.value = 'rui@barberstudio.demo';
      passwordInput.value = '123456';
      Toast.info('Credenciais de Rui (Admin) preenchidas. Clica em Entrar!');
    });
  }

  // Handle Login Submit
  if (loginForm) {
    loginForm.addEventListener('submit', async (e) => {
      e.preventDefault();
      const submitBtn = document.getElementById('login-submit-btn');
      const origText = submitBtn.innerHTML;

      const email = emailInput.value;
      const password = passwordInput.value;

      try {
        submitBtn.disabled = true;
        submitBtn.innerHTML = `<span>A ENTRAR...</span>`;

        const user = await authService.login(email, password);
        // A página inicial volta a dar as boas-vindas, agora pelo nome
        try { sessionStorage.setItem('barberstudio_greet_login', 'true'); } catch (err) { /* ignore */ }
        Toast.success(`Bem-vindo, ${user.name}!`);

        setTimeout(() => {
          if (user.role === 'admin') {
            window.location.href = 'admin.html';
          } else if (redirectTarget) {
            window.location.href = redirectTarget;
          } else {
            window.location.href = 'index.html';
          }
        }, 400);
      } catch (err) {
        if (err.message && err.message.includes('não foi confirmado')) {
          Toast.error(err.message);
          try {
            await authService.resendConfirmation(email);
            Toast.info(`Reenviámos um link de confirmação para ${email}.`);
          } catch (resendErr) {
            console.log('Resend note:', resendErr);
          }
        } else {
          Toast.error(err.message || 'Erro ao iniciar sessão.');
        }
        submitBtn.disabled = false;
        submitBtn.innerHTML = origText;
      }
    });
  }

  // Forgot Password Modal
  const forgotBtn = document.getElementById('forgot-pw-btn');
  const forgotModal = document.getElementById('forgot-modal');
  const closeForgotModal = document.getElementById('close-forgot-modal');
  const forgotForm = document.getElementById('forgot-form');

  if (forgotBtn && forgotModal) {
    forgotBtn.addEventListener('click', () => {
      forgotModal.classList.add('is-active');
    });
  }

  if (closeForgotModal && forgotModal) {
    closeForgotModal.addEventListener('click', () => {
      forgotModal.classList.remove('is-active');
    });
  }

  if (forgotForm) {
    forgotForm.addEventListener('submit', async (e) => {
      e.preventDefault();
      const email = document.getElementById('forgot-email')?.value;
      try {
         await authService.requestPasswordReset(email);
         Toast.success('Email de recuperação enviado! Verifica a tua caixa de entrada.');
        forgotModal.classList.remove('is-active');
        forgotForm.reset();
      } catch (err) {
        Toast.error(err.message);
      }
    });
  }

  // --- REGISTER PAGE LOGIC ---
  const registerForm = document.getElementById('register-form');
  const phoneInput = document.getElementById('reg-phone');

  // Restrict phone input strictly to 9 digits
  if (phoneInput) {
    setupPhoneInput(phoneInput);
  }

  const loginLinkOnRegister = document.querySelector('.auth-bottom-text a');
  if (loginLinkOnRegister && redirectTarget && window.location.pathname.endsWith('registo.html')) {
    loginLinkOnRegister.href = `login.html?redirect=${encodeURIComponent(redirectTarget)}`;
  }

  if (registerForm) {
    registerForm.addEventListener('submit', async (e) => {
      e.preventDefault();
      const submitBtn = document.getElementById('reg-submit-btn');
      const origText = submitBtn.innerHTML;

      const name = document.getElementById('reg-name')?.value;
      const email = document.getElementById('reg-email')?.value;
      const phone = cleanPhone(phoneInput?.value);
      const password = document.getElementById('reg-password')?.value;
      const confirmPassword = document.getElementById('reg-confirm-password')?.value;

      if (!consentAccepted()) return;

      if (phone.length !== 9) {
        Toast.error('O número de telemóvel deve ter exatamente 9 dígitos.');
        phoneInput?.focus();
        return;
      }

      // Password strength validation (min 8 chars, must mix letters and numbers)
      const PASSWORD_MIN_LENGTH = 8;
      const hasLetter = /[a-zA-Z]/.test(password);
      const hasDigit = /[0-9]/.test(password);
      if (password.length < PASSWORD_MIN_LENGTH || !hasLetter || !hasDigit) {
        Toast.error('A password deve ter pelo menos 8 caracteres, incluindo letras e números.');
        return;
      }

      if (password !== confirmPassword) {
        Toast.error('As passwords introduzidas não coincidem.');
        return;
      }

      try {
        submitBtn.disabled = true;
        submitBtn.innerHTML = `<span>A CRIAR CONTA...</span>`;

        const user = await authService.register({ name, email, phone, password });
        try { sessionStorage.setItem('barberstudio_greet_login', 'true'); } catch (err) { /* ignore */ }
        Toast.success(`Conta criada com sucesso! Bem-vindo, ${user.name}.`);

        setTimeout(() => {
          if (user.role === 'admin') {
            window.location.href = 'admin.html';
          } else if (redirectTarget) {
            window.location.href = redirectTarget;
          } else {
            window.location.href = 'index.html';
          }
        }, 500);
      } catch (err) {
        console.error('Erro no registo:', err);
        Toast.error(err.message || 'Erro ao criar conta.');
        submitBtn.disabled = false;
        submitBtn.innerHTML = origText;
      }
    });
  }
});
