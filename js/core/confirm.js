/**
 * Barber Studio — Confirmação em dois passos
 * Substitui o confirm() do browser: o primeiro toque "arma" o botão
 * ("TENS A CERTEZA?"), o segundo executa. Sem segundo toque, volta ao normal.
 */

const ARMED_MS = 4000;

/**
 * Devolve true apenas no segundo toque (confirmação).
 * @param {HTMLButtonElement} btn
 * @param {string} [confirmLabel='TENS A CERTEZA?']
 * @returns {boolean}
 */
export function confirmTwoStep(btn, confirmLabel = 'TENS A CERTEZA?') {
  if (btn.classList.contains('is-armed')) {
    disarm(btn);
    return true;
  }

  btn._originalHtml = btn.innerHTML;
  btn.classList.add('is-armed');
  btn.style.setProperty('--armed-duration', `${ARMED_MS}ms`);
  btn.textContent = confirmLabel;
  btn._armedTimer = setTimeout(() => disarm(btn), ARMED_MS);

  // Tocar fora cancela
  btn._outsideHandler = (e) => {
    if (!btn.contains(e.target)) disarm(btn);
  };
  setTimeout(() => document.addEventListener('click', btn._outsideHandler), 0);

  return false;
}

function disarm(btn) {
  clearTimeout(btn._armedTimer);
  document.removeEventListener('click', btn._outsideHandler);
  if (!btn.classList.contains('is-armed')) return;
  btn.classList.remove('is-armed');
  if (btn._originalHtml !== undefined) btn.innerHTML = btn._originalHtml;
}
