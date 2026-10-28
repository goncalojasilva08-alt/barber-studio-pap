/**
 * Barber Studio — Toast Notification Service
 * Avisos curtos com ícone, barra de tempo e animação de entrada/saída.
 */

const MAX_VISIBLE = 3;
const EXIT_MS = 280;

/**
 * Regras contra excesso de avisos
 * - Avisos de ação (resposta a algo que a pessoa fez) aparecem sempre, de imediato.
 * - Avisos "de ambiente" (boas-vindas, novidades, dicas) ninguém os pediu, por isso:
 *     · aparecem um de cada vez, com uma pausa entre eles;
 *     · no máximo AMBIENT_MAX_PER_PAGE por página aberta;
 *     · cada um tem um intervalo mínimo antes de se repetir no mesmo dispositivo;
 *     · esperam se a pessoa acabou de receber um aviso de ação.
 */
const AMBIENT_MAX_PER_PAGE = 2;
const AMBIENT_GAP_MS = 600;
const AMBIENT_QUIET_AFTER_ACTION_MS = 2500;
const AMBIENT_KEY_PREFIX = 'barberstudio_notice_';

const ambientQueue = [];
let ambientShown = 0;
let ambientBusy = false;
let lastActionAt = 0;

function ambientAllowed(key, cooldownHours) {
  if (!key || !cooldownHours) return true;
  try {
    const last = Number(localStorage.getItem(AMBIENT_KEY_PREFIX + key)) || 0;
    return Date.now() - last > cooldownHours * 3600 * 1000;
  } catch (err) {
    return true;
  }
}

function ambientRemember(key) {
  if (!key) return;
  try {
    localStorage.setItem(AMBIENT_KEY_PREFIX + key, String(Date.now()));
  } catch (err) {
    // Sem localStorage: o aviso pode repetir-se, nada de grave
  }
}

const ICONS = {
  success: '<polyline points="20 6 9 17 4 12"/>',
  error: '<line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>',
  warning: '<line x1="12" y1="7" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/>',
  info: '<line x1="12" y1="11" x2="12" y2="17"/><line x1="12" y1="7" x2="12.01" y2="7"/>',
  news: '<path d="M6 8a6 6 0 0 1 12 0c0 7 3 9 3 9H3s3-2 3-9"/><path d="M10.3 21a1.94 1.94 0 0 0 3.4 0"/>',
  bye: '<path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/><polyline points="16 17 21 12 16 7"/><line x1="21" y1="12" x2="9" y2="12"/>',
  welcome: '<circle cx="6" cy="6" r="3"/><circle cx="6" cy="18" r="3"/><line x1="20" y1="4" x2="8.12" y2="15.88"/><line x1="14.47" y1="14.48" x2="20" y2="20"/><line x1="8.12" y1="8.12" x2="12" y2="12"/>'
};

export class Toast {
  static getContainer() {
    let container = document.getElementById('toast-container');
    if (!container) {
      container = document.createElement('div');
      container.id = 'toast-container';
      container.className = 'toast-container';
      container.setAttribute('aria-live', 'polite');
      document.body.appendChild(container);
    }
    return container;
  }

  static dismiss(toast) {
    if (!toast || toast.classList.contains('is-leaving')) return;
    clearTimeout(toast._timer);
    toast.classList.add('is-leaving');
    setTimeout(() => toast.remove(), EXIT_MS);
  }

  static show(message, type = 'success', duration = 3500, { onClick, ambient = false } = {}) {
    const container = this.getContainer();
    if (!ambient) lastActionAt = Date.now();
    const kind = ICONS[type] ? type : 'info';

    // O mesmo aviso repetido reinicia o tempo em vez de empilhar
    const existing = [...container.children].find(t => t.dataset.message === message && !t.classList.contains('is-leaving'));
    if (existing) this.dismiss(existing);

    // Nunca mais de três avisos no ecrã
    const visible = [...container.children].filter(t => !t.classList.contains('is-leaving'));
    visible.slice(0, Math.max(0, visible.length - (MAX_VISIBLE - 1))).forEach(t => this.dismiss(t));

    const toast = document.createElement('div');
    toast.className = `toast toast--${kind}`;
    toast.setAttribute('role', kind === 'error' ? 'alert' : 'status');
    toast.dataset.message = message;
    toast.style.setProperty('--toast-duration', `${duration}ms`);
    toast.innerHTML = `
      <span class="toast__icon" aria-hidden="true">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.25" stroke-linecap="round" stroke-linejoin="round">${ICONS[kind]}</svg>
      </span>
      <span class="toast__text"></span>
      <span class="toast__bar" aria-hidden="true"></span>
    `;
    toast.querySelector('.toast__text').textContent = message;

    // Tocar no aviso fecha-o (e, se tiver destino, leva lá)
    if (onClick) toast.classList.add('toast--action');
    toast.addEventListener('click', () => {
      this.dismiss(toast);
      if (onClick) onClick();
    });

    container.appendChild(toast);
    toast._timer = setTimeout(() => this.dismiss(toast), duration);
    return toast;
  }

  /**
   * Aviso de ambiente (boas-vindas, novidades, dicas): entra na fila e respeita
   * as regras contra excesso de avisos. Devolve false se foi descartado.
   * @param {string} message
   * @param {string} [type='info']
   * @param {Object} [options]
   * @param {string} [options.key]            Identificador para o intervalo mínimo
   * @param {number} [options.cooldownHours]  Horas até poder repetir-se neste dispositivo
   * @param {number} [options.duration=4500]
   * @param {Function} [options.onClick]
   */
  static ambient(message, type = 'info', { key, cooldownHours = 0, duration = 4500, onClick } = {}) {
    if (!ambientAllowed(key, cooldownHours)) return false;
    if (ambientShown + ambientQueue.length >= AMBIENT_MAX_PER_PAGE) return false;
    if (key && ambientQueue.some(item => item.key === key)) return false;

    ambientQueue.push({ message, type, key, duration, onClick });
    this._drainAmbient();
    return true;
  }

  static _drainAmbient() {
    if (ambientBusy || ambientQueue.length === 0) return;
    ambientBusy = true;

    // Dá espaço a um aviso de ação recente
    const quiet = Math.max(0, AMBIENT_QUIET_AFTER_ACTION_MS - (Date.now() - lastActionAt));

    setTimeout(() => {
      const item = ambientQueue.shift();
      if (!item) { ambientBusy = false; return; }

      ambientShown++;
      ambientRemember(item.key);
      this.show(item.message, item.type, item.duration, { onClick: item.onClick, ambient: true });

      // O seguinte só entra depois de este sair
      setTimeout(() => {
        ambientBusy = false;
        this._drainAmbient();
      }, item.duration + EXIT_MS + AMBIENT_GAP_MS);
    }, quiet);
  }

  static success(msg, duration) {
    return this.show(msg, 'success', duration);
  }

  static error(msg, duration = 5000) {
    return this.show(msg, 'error', duration);
  }

  static warning(msg, duration) {
    return this.show(msg, 'warning', duration);
  }

  static info(msg, duration) {
    return this.show(msg, 'info', duration);
  }
}

/**
 * Aviso deixado para a página seguinte (ex.: "Sessão terminada" depois do
 * redirecionamento). Guarda-se antes de mudar de página e mostra-se ao chegar.
 */
export function flashToast(message, type = 'info') {
  try {
    sessionStorage.setItem('barberstudio_flash', JSON.stringify({ message, type }));
  } catch (err) {
    // Sem sessionStorage: o aviso perde-se, a navegação continua
  }
}

(function showPendingFlash() {
  let flash = null;
  try {
    flash = JSON.parse(sessionStorage.getItem('barberstudio_flash') || 'null');
    sessionStorage.removeItem('barberstudio_flash');
  } catch (err) {
    return;
  }
  if (!flash?.message) return;

  // Espera pelo fim do ecrã de carregamento
  const show = () => setTimeout(() => Toast.ambient(flash.message, flash.type || 'info', { duration: 4000 }), 900);
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', show);
  } else {
    show();
  }
})();
