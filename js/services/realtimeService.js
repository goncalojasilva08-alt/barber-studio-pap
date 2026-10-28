/**
 * Barber Studio — Realtime Service (Supabase Layer)
 * Avisa a página quando uma marcação é criada ou muda, sem recarregar.
 * Precisa do passo 7 de supabase/bd-portugues.sql; sem ele, simplesmente não chega nada.
 */

import { supabase, SUPABASE_ENABLED } from '../supabase/supabase-config.js';

/**
 * @param {(payload: object) => void} onChange recebe { eventType, new, old }
 * @param {{ clientId?: string }} [options] clientId: só as marcações desse cliente
 * @returns {() => void} função para deixar de ouvir
 */
export function watchAppointments(onChange, { clientId } = {}) {
  if (!SUPABASE_ENABLED || !supabase) return () => {};

  const filter = clientId ? { filter: `cliente_id=eq.${clientId}` } : {};
  const channel = supabase
    .channel(`marcacoes-${clientId || 'todas'}-${Date.now()}`)
    .on('postgres_changes', { event: '*', schema: 'public', table: 'marcacoes', ...filter }, (payload) => {
      try { onChange(payload); } catch (err) { console.error('Erro ao tratar mudança em tempo real:', err); }
    })
    .subscribe();

  return () => supabase.removeChannel(channel);
}
