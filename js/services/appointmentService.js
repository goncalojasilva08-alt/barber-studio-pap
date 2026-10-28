/**
 * Barber Studio — Appointment Service (Supabase Layer)
 */

import { supabase, SUPABASE_ENABLED } from '../supabase/supabase-config.js';
import { formatDateLocalISO } from '../core/utils.js';
import { scheduleService, buildSlotsForDate, toMinutes } from './scheduleService.js';

/**
 * Data e hora atuais na Madeira (onde fica o atelier), seja qual for o fuso do telemóvel do cliente
 */
function nowInMadeira() {
  const parts = new Intl.DateTimeFormat('en-GB', {
    timeZone: 'Atlantic/Madeira',
    year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', hourCycle: 'h23'
  }).formatToParts(new Date());
  const get = (type) => parts.find(p => p.type === type).value;
  return {
    date: `${get('year')}-${get('month')}-${get('day')}`,
    minutes: Number(get('hour')) * 60 + Number(get('minute'))
  };
}

function mapAppointment(a) {
  if (!a) return null;
  const srv = a.servicos || {};
  const prof = a.perfis || {};
  const durationMin = srv.duracao_minutos || 30;

  // Limpa data e hora de qualquer formato ISO com segundos ou fuso horário
  const cleanDate = a.data ? String(a.data).split('T')[0] : '';
  const cleanTime = a.hora ? String(a.hora).slice(0, 5) : '09:30';

  return {
    id: a.id,
    clientId: a.cliente_id,
    clientName: prof.nome || (prof.email ? prof.email.split('@')[0] : 'Cliente'),
    clientPhone: prof.telemovel || '',
    clientEmail: prof.email || '',
    serviceId: a.servico_id,
    serviceName: srv.nome || 'Serviço',
    price: Number(srv.preco || 0),
    duration: `${durationMin} min`,
    duration_minutes: durationMin,
    date: cleanDate,
    time: cleanTime,
    status: (a.estado || 'PENDENTE').toUpperCase(),
    notes: a.notas || '',
    cancelledBy: a.cancelada_por || null,
    cancelSeen: a.cancelamento_visto === true,
    createdAt: a.criado_em
  };
}

export const appointmentService = {
  async getAllAppointments() {
    if (!SUPABASE_ENABLED || !supabase) {
      throw new Error('Supabase não está configurado.');
    }

    // Todas as colunas da marcação (inclui quem cancelou e se o aviso já foi visto)
    const { data, error } = await supabase
      .from('marcacoes')
      .select(`
        *,
        perfis ( id, nome, telemovel, email, tipo_utilizador ),
        servicos ( id, nome, preco, duracao_minutos )
      `)
      .order('data', { ascending: false })
      .order('hora', { ascending: false });

    if (error) {
      console.error('Erro ao listar marcações:', error);
      throw new Error(error.message || 'Erro ao carregar marcações.');
    }

    return (data || []).map(mapAppointment);
  },

  async getClientAppointments(clientId) {
    if (!SUPABASE_ENABLED || !supabase) {
      throw new Error('Supabase não está configurado.');
    }

    const { data, error } = await supabase
      .from('marcacoes')
      .select(`
        *,
        perfis ( id, nome, telemovel, email, tipo_utilizador ),
        servicos ( id, nome, preco, duracao_minutos )
      `)
      .eq('cliente_id', clientId)
      .order('data', { ascending: false })
      .order('hora', { ascending: false });

    if (error) {
      console.error('Erro ao listar marcações do cliente:', error);
      throw new Error(error.message || 'Erro ao carregar marcações do cliente.');
    }

    return (data || []).map(mapAppointment);
  },

  async createAppointment({ clientId, clientName, clientPhone, clientEmail, serviceId, date, time, notes = '' }) {
    if (!SUPABASE_ENABLED || !supabase) {
      throw new Error('Supabase não está configurado.');
    }

    // Sincroniza nome/telemóvel do perfil (nunca o papel do utilizador)
    if (clientId) {
      const profileUpdates = {};
      if (clientName) profileUpdates.nome = clientName.trim();
      if (clientPhone) profileUpdates.telemovel = clientPhone.trim();

      if (Object.keys(profileUpdates).length > 0) {
        const { error: pErr } = await supabase.from('perfis').update(profileUpdates).eq('id', clientId);
        if (pErr) console.warn('Profile sync warning:', pErr);
      }
    }

    const newAptData = {
      cliente_id: clientId,
      servico_id: serviceId,
      data: date,
      hora: time,
      // Fica pendente até o barbeiro a aceitar no painel (RF15)
      estado: 'PENDENTE',
      notas: notes ? String(notes).trim() : null
    };

    const { data, error } = await supabase
      .from('marcacoes')
      .insert(newAptData)
      .select()
      .single();

    if (error) {
      console.error('Erro ao criar marcação:', error);
      // 23505 = índice único (data, hora): outro cliente reservou este horário entretanto
      if (error.code === '23505') {
        throw new Error('Este horário acabou de ser reservado. Por favor escolhe outro.');
      }
      throw new Error(error.message || 'Erro ao criar marcação.');
    }

    return mapAppointment(data);
  },

  async updateStatus(id, newStatus) {
    if (!SUPABASE_ENABLED || !supabase) {
      throw new Error('Supabase não está configurado.');
    }

    // Update direto sem joins aninhados que quebram o PostgREST
    const { data, error } = await supabase
      .from('marcacoes')
      .update({ estado: newStatus })
      .eq('id', id)
      .select();

    if (error) {
      console.error('Erro no updateStatus:', error);
      throw new Error(error.message || 'Falha ao atualizar o estado no Supabase.');
    }

    if (!data || data.length === 0) {
      throw new Error('Nenhuma linha foi alterada. Verifica as permissões (RLS) no Supabase.');
    }

    return { id, status: newStatus };
  },

  async deleteAppointment(id) {
    if (!SUPABASE_ENABLED || !supabase) {
      throw new Error('Supabase não está configurado.');
    }

    const { error } = await supabase
      .from('marcacoes')
      .delete()
      .eq('id', id);

    if (error) {
      console.error('Erro ao eliminar marcação:', error);
      throw new Error(error.message || 'Erro ao eliminar marcação da base de dados.');
    }

    return true;
  },

  async deleteAppointments(ids) {
    if (!SUPABASE_ENABLED || !supabase) {
      throw new Error('Supabase não está configurado.');
    }
    if (!Array.isArray(ids) || ids.length === 0) return true;

    const { error } = await supabase
      .from('marcacoes')
      .delete()
      .in('id', ids);

    if (error) {
      console.error('Erro ao eliminar marcações:', error);
      throw new Error(error.message || 'Erro ao eliminar marcações da base de dados.');
    }

    return true;
  },

  /**
   * @param {boolean} [notify=true] a outra parte deve ver um aviso do cancelamento
   *   (cancelamento_visto = false). O cliente vê sempre quando o barbeiro cancela; o barbeiro
   *   só vê quando o cliente cancela uma marcação que ele já tinha confirmado.
   */
  async cancelAppointment(id, reason = '', cancelledBy = 'cliente', notify = true) {
    if (!SUPABASE_ENABLED || !supabase) {
      throw new Error('Supabase não está configurado.');
    }

    let { data, error: updateErr } = await supabase
      .from('marcacoes')
      .update({ estado: 'CANCELADA', cancelada_por: cancelledBy, cancelamento_visto: !notify })
      .eq('id', id)
      .select();

    // Colunas do aviso ainda não criadas: cancela na mesma
    if (updateErr && (updateErr.code === '42703' || updateErr.code === 'PGRST204')) {
      ({ data, error: updateErr } = await supabase
        .from('marcacoes')
        .update({ estado: 'CANCELADA' })
        .eq('id', id)
        .select());
    }

    if (updateErr) {
      console.error('Erro ao cancelar marcação:', updateErr);
      throw new Error(updateErr.message || 'Erro ao cancelar marcação.');
    }

    if (!data || data.length === 0) {
      throw new Error('Não foi possível cancelar esta marcação.');
    }

    return { id, status: 'CANCELADA', cancelReason: reason };
  },

  async markCancelSeen(id) {
    const { error } = await supabase
      .from('marcacoes')
      .update({ cancelamento_visto: true })
      .eq('id', id);

    if (error) {
      console.error('Erro ao marcar aviso como visto:', error);
      throw new Error(error.message || 'Não foi possível fechar o aviso.');
    }
    return true;
  },

  async getAdminKPIs() {
    const appointments = await this.getAllAppointments();
    const todayStr = formatDateLocalISO();

    const pending = appointments.filter(a => a.status === 'PENDENTE');
    const today = appointments.filter(a => a.date === todayStr && a.status !== 'CANCELADA');
    const completed = appointments.filter(a => a.status === 'CONCLUÍDA');
    const totalRevenue = completed.reduce((sum, a) => sum + (Number(a.price) || 0), 0);

    return {
      pendingCount: pending.length,
      todayCount: today.length,
      completedCount: completed.length,
      totalRevenue: totalRevenue
    };
  },

  async getAvailableSlots(dateStr, durationMin = 30) {
    if (!dateStr) return [];

    const cleanTargetDate = dateStr.split('T')[0];
    const duration = Number(durationMin) || 30;

    // Horário e indisponibilidades definidos pelo barbeiro no painel,
    // só com horas onde o serviço escolhido cabe inteiro
    const schedule = await scheduleService.getSchedule();
    let allSlots = buildSlotsForDate(schedule, cleanTargetDate, duration);

    // No próprio dia, as horas que já passaram deixam de aparecer
    const now = nowInMadeira();
    if (cleanTargetDate < now.date) {
      return [];
    }
    if (cleanTargetDate === now.date) {
      allSlots = allSlots.filter(time => toMinutes(time) > now.minutes);
    }

    if (allSlots.length === 0) {
      return [];
    }

    // Horas ocupadas por TODOS os clientes, com a duração de cada serviço
    // (o RLS só deixa cada cliente ler as suas próprias marcações)
    let booked = [];
    const { data: intervals, error } = await supabase.rpc('horarios_ocupados', { p_data: cleanTargetDate });

    if (!error && Array.isArray(intervals)) {
      booked = intervals.map(b => [toMinutes(b.hora_inicio), toMinutes(b.hora_inicio) + (Number(b.duracao_minutos) || 30)]);
    } else {
      // Sem a função horarios_ocupados: só as horas de início, com 30 minutos cada
      console.warn('horarios_ocupados indisponível, a usar horas_ocupadas:', error);
      const { data: times } = await supabase.rpc('horas_ocupadas', { p_data: cleanTargetDate });
      booked = (Array.isArray(times) ? times : []).map(t => [toMinutes(t), toMinutes(t) + 30]);
    }

    // Só os horários em que o serviço não se sobrepõe a nenhuma marcação (RF14)
    return allSlots
      .filter(time => {
        const start = toMinutes(time);
        return !booked.some(([bs, be]) => start < be && start + duration > bs);
      })
      .map(time => ({ time, available: true }));
  }
};