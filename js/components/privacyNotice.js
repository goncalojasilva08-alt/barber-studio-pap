/**
 * Barber Studio — Aviso de privacidade
 * O site não usa cookies de publicidade nem de estatísticas: só guarda a sessão
 * e preferências no dispositivo. Por isso basta um aviso informativo, mostrado
 * uma única vez, que leva à Política de Privacidade.
 */

import { Toast } from '../core/toast.js';

const POLICY_URL = 'politica-privacidade.html';
const TEN_YEARS_HOURS = 24 * 365 * 10; // na prática, uma vez por dispositivo

function showPrivacyNotice() {
  // Quem já está a ler a política não precisa do aviso
  if (window.location.pathname.endsWith(POLICY_URL)) return;

  // Entra depois do ecrã de carregamento e das boas-vindas
  setTimeout(() => {
    Toast.ambient('Este site só guarda a tua sessão e preferências neste dispositivo. Toca para saber mais.', 'info', {
      key: 'privacy',
      cooldownHours: TEN_YEARS_HOURS,
      duration: 8000,
      onClick: () => { window.location.href = POLICY_URL; }
    });
  }, 1600);
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', showPrivacyNotice);
} else {
  showPrivacyNotice();
}
