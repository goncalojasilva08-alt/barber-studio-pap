/**
 * Barber Studio — Email Notification Service
 * O site envia dois emails pelo EmailJS, cada um com o seu modelo:
 *   - conta criada (no registo);
 *   - marcação confirmada (ao marcar).
 * Ver supabase/EMAILS.md.
 */

// Configuração do EmailJS. Com a chave pública vazia, nenhum email é enviado.
// (A chave pública pode estar no código: é feita para isso. A privada nunca.)
export const EMAIL_CONFIG = {
  EMAILJS_SERVICE_ID: '',
  EMAILJS_TEMPLATE_ID: '',         // conta criada
  EMAILJS_TEMPLATE_BOOKING_ID: '',                  // marcação confirmada
  EMAILJS_PUBLIC_KEY: '',
  ATELIER_NAME: 'Barber Studio',
  ATELIER_PHONE: '+351 900 000 000',
  ATELIER_INSTAGRAM: '@barberstudio.demo'
};

/**
 * Entrega um email ao EmailJS. Nunca lança erro: quem chama não pode ficar
 * bloqueado por causa de um email (limite mensal esgotado, rede, etc.).
 * @returns {Promise<boolean>} true se o EmailJS aceitou o pedido
 */
async function send(templateId, templateParams, label) {
  if (!EMAIL_CONFIG.EMAILJS_PUBLIC_KEY || !EMAIL_CONFIG.EMAILJS_SERVICE_ID || !templateId) return false;

  try {
    const response = await fetch('https://api.emailjs.com/api/v1.0/email/send', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        service_id: EMAIL_CONFIG.EMAILJS_SERVICE_ID,
        template_id: templateId,
        user_id: EMAIL_CONFIG.EMAILJS_PUBLIC_KEY,
        template_params: {
          ...templateParams,
          site_url: window.location.origin,
          atelier_name: EMAIL_CONFIG.ATELIER_NAME,
          atelier_phone: EMAIL_CONFIG.ATELIER_PHONE,
          atelier_instagram: EMAIL_CONFIG.ATELIER_INSTAGRAM
        }
      })
    });

    if (!response.ok) {
      console.warn(`[EmailService] O EmailJS recusou o email de ${label} (estado ${response.status}).`);
    }
    return response.ok;
  } catch (err) {
    console.warn(`[EmailService] Não foi possível enviar o email de ${label}:`, err);
    return false;
  }
}

// YYYY-MM-DD → DD/MM/YYYY
function formatDatePt(date) {
  const clean = String(date || '').split('T')[0];
  if (!clean.includes('-')) return clean;
  const [y, m, d] = clean.split('-');
  return `${d}/${m}/${y}`;
}

export const emailService = {
  /**
   * Email de conta criada, enviado ao utilizador recém-registado.
   * NUNCA bloqueia o registo: os erros ficam só na consola.
   * @returns {Promise<boolean>} true se o email foi entregue ao EmailJS
   */
  async sendWelcomeEmail({ name, email }) {
    if (!email) return false;

    return send(EMAIL_CONFIG.EMAILJS_TEMPLATE_ID, {
      to_name: String(name || '').trim().split(' ')[0] || 'Cliente',
      to_email: email,
      subject: `A tua conta no ${EMAIL_CONFIG.ATELIER_NAME} está ativa`,
      intro: 'A tua conta foi criada e já está ativa. A partir de agora podes marcar o teu corte em menos de um minuto e acompanhar as tuas marcações na área de cliente.',
      outro: 'Se não foste tu a criar esta conta, responde a este email para a removermos.',
      account_email: email,
      booking_url: `${window.location.origin}/marcar.html`
    }, 'conta criada');
  },

  /**
   * Email de marcação confirmada, enviado ao cliente quando marca.
   * NUNCA bloqueia a marcação: os erros ficam só na consola.
   * @returns {Promise<boolean>} true se o email foi entregue ao EmailJS
   */
  async sendBookingConfirmation({ clientName, clientEmail, serviceName, servicePrice, date, time }) {
    if (!clientEmail) return false;

    const day = formatDatePt(date);
    const hour = String(time || '').slice(0, 5);
    const hasPrice = servicePrice !== undefined && servicePrice !== null && servicePrice !== '';

    return send(EMAIL_CONFIG.EMAILJS_TEMPLATE_BOOKING_ID, {
      to_name: String(clientName || '').trim().split(' ')[0] || 'Cliente',
      to_email: clientEmail,
      subject: `Marcação confirmada — ${day} às ${hour}`,
      intro: 'A tua marcação está confirmada. Não precisas de fazer mais nada: é só aparecer.',
      outro: 'Se não puderes vir, cancela na tua área de cliente para libertar o horário.',
      service_name: serviceName || '',
      service_price: hasPrice ? `€${servicePrice}` : '',
      appointment_date: day,
      appointment_time: hour,
      client_area_url: `${window.location.origin}/cliente.html`
    }, 'marcação confirmada');
  },

  /**
   * Recuperação de password: o email é enviado pelo próprio Supabase (resetPasswordForEmail)
   */
  async sendPasswordResetEmail(email) {
    return Boolean(email);
  }
};
