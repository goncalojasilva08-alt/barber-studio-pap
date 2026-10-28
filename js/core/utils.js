/**
 * Barber Studio — Shared Utilities
 */

const MONTH_NAMES = ['JAN', 'FEV', 'MAR', 'ABR', 'MAI', 'JUN', 'JUL', 'AGO', 'SET', 'OUT', 'NOV', 'DEZ'];

/**
 * Format date string (YYYY-MM-DD) into readable Portuguese format "DD MMM YYYY"
 * @param {string} dateStr
 * @returns {string}
 */
export function formatDate(dateStr) {
  if (!dateStr) return '';
  const [y, m, d] = dateStr.split('-');
  const monthName = MONTH_NAMES[parseInt(m, 10) - 1] || m;
  return `${d} ${monthName} ${y}`;
}

/**
 * Sanitize and enforce 9-digit PT phone number
 * @param {string} phone
 * @returns {string}
 */
export function cleanPhone(phone) {
  if (!phone) return '';
  return String(phone).replace(/\D/g, '').slice(0, 9);
}

/**
 * Telemóvel português plausível: 9 dígitos, começa por 91/92/93/96 e não é
 * um número inventado (o mesmo algarismo repetido ou uma sequência)
 * @param {string} phone
 * @returns {boolean}
 */
export function isPlausiblePhone(phone) {
  const digits = cleanPhone(phone);
  if (!/^9[1236]\d{7}$/.test(digits)) return false;
  const rest = digits.slice(2).split('').map(Number);
  if (rest.every(d => d === rest[0])) return false;
  const ascending = rest.every((d, i) => i === 0 || d === rest[i - 1] + 1);
  const descending = rest.every((d, i) => i === 0 || d === rest[i - 1] - 1);
  return !ascending && !descending;
}

export const FAKE_PHONE_MESSAGE = 'Esse número não parece válido. Usa o teu telemóvel verdadeiro para receberes a confirmação no WhatsApp.';

/**
 * Attach numeric-only 9-digit input behavior to phone input elements
 * @param {HTMLInputElement} inputEl
 */
export function setupPhoneInput(inputEl) {
  if (!inputEl) return;
  inputEl.setAttribute('maxlength', '9');
  inputEl.setAttribute('inputmode', 'numeric');
  inputEl.addEventListener('input', (e) => {
    e.target.value = cleanPhone(e.target.value);
  });
}

/**
 * Format a Date object to YYYY-MM-DD
 * @param {Date} [d=new Date()]
 * @returns {string}
 */
export function formatDateISO(d = new Date()) {
  return d.toISOString().split('T')[0];
}

/**
 * Get next available business date (skipping Sundays and Mondays)
 * @returns {string}
 */
export function getNextBusinessDate() {
  const date = new Date();
  date.setDate(date.getDate() + 1);
  if (date.getDay() === 0) date.setDate(date.getDate() + 2); // Skip Sunday -> Tuesday
  if (date.getDay() === 1) date.setDate(date.getDate() + 1); // Skip Monday -> Tuesday
  return formatDateISO(date);
}

/**
 * Format a Date object to YYYY-MM-DD in the browser's local timezone
 * @param {Date} [d=new Date()]
 * @returns {string}
 */
export function formatDateLocalISO(d = new Date()) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

/**
 * Escape text coming from the database or user input before placing it in innerHTML
 * @param {*} value
 * @returns {string}
 */
export function escapeHtml(value) {
  if (value === null || value === undefined) return '';
  return String(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}
