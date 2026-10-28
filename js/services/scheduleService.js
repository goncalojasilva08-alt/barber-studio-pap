/**
 * Barber Studio — Schedule Service (Supabase Layer)
 * Horário semanal, indisponibilidades e interruptor geral das marcações.
 */

import { supabase, SUPABASE_ENABLED } from '../supabase/supabase-config.js';
import { formatDateLocalISO } from '../core/utils.js';

// Intervalo entre horários de marcação, a contar da abertura e do fim de cada pausa (RN03)
export const SLOT_STEP_MIN = 15;

export const WEEKDAY_NAMES = ['Domingo', 'Segunda', 'Terça', 'Quarta', 'Quinta', 'Sexta', 'Sábado'];

// Horário usado enquanto a base de dados não responde (igual ao de supabase/bd-portugues.sql)
const DEFAULT_HOURS = [
  { weekday: 0, isOpen: true, open: '17:00', close: '21:00', breaks: [] },
  { weekday: 1, isOpen: true, open: '17:30', close: '21:00', breaks: [] },
  { weekday: 2, isOpen: true, open: '17:30', close: '21:00', breaks: [] },
  { weekday: 3, isOpen: true, open: '17:30', close: '21:00', breaks: [] },
  { weekday: 4, isOpen: true, open: '17:30', close: '21:00', breaks: [] },
  { weekday: 5, isOpen: true, open: '17:30', close: '21:00', breaks: [] },
  { weekday: 6, isOpen: true, open: '09:00', close: '18:00', breaks: [{ start: '12:45', end: '14:00' }] }
];

const hhmm = (t) => String(t || '').slice(0, 5);

export function toMinutes(t) {
  const [h, m] = hhmm(t).split(':').map(Number);
  return (h || 0) * 60 + (m || 0);
}

function fromMinutes(min) {
  return `${String(Math.floor(min / 60)).padStart(2, '0')}:${String(min % 60).padStart(2, '0')}`;
}

function mapHours(row) {
  return {
    weekday: Number(row.dia_semana),
    isOpen: row.aberto === true,
    open: hhmm(row.hora_abertura),
    close: hhmm(row.hora_fecho),
    breaks: (Array.isArray(row.pausas) ? row.pausas : [])
      .map(b => ({ start: hhmm(b.inicio), end: hhmm(b.fim) }))
      .filter(b => b.start && b.end)
  };
}

function mapTimeOff(row) {
  return {
    id: row.id,
    startDate: String(row.data_inicio).split('T')[0],
    endDate: String(row.data_fim).split('T')[0],
    startTime: row.hora_inicio ? hhmm(row.hora_inicio) : null,
    endTime: row.hora_fim ? hhmm(row.hora_fim) : null,
    kind: row.tipo || 'FOLGA',
    reason: row.motivo || ''
  };
}

function defaultSchedule() {
  return {
    hours: DEFAULT_HOURS.map(h => ({ ...h, breaks: h.breaks.map(b => ({ ...b })) })),
    timeOff: [],
    bookingsOpen: true,
    fromDb: false
  };
}

function friendlyError(error, fallback) {
  // 42P01 / PGRST205 = a tabela ainda não existe na base de dados
  if (error?.code === '42P01' || error?.code === 'PGRST205') {
    return new Error('Falta correr o ficheiro supabase/bd-portugues.sql no Supabase.');
  }
  return new Error(error?.message || fallback);
}

function weekdayOf(dateStr) {
  return new Date(`${dateStr}T00:00:00`).getDay();
}

/**
 * Dia sem marcações: marcações fechadas, dia da semana encerrado ou bloqueio de dia inteiro
 */
export function isDayClosed(schedule, dateStr) {
  if (!schedule.bookingsOpen) return true;
  const day = schedule.hours[weekdayOf(dateStr)];
  if (!day || !day.isOpen) return true;
  return schedule.timeOff.some(t => !t.startTime && t.startDate <= dateStr && dateStr <= t.endDate);
}

/**
 * Horários de início possíveis num dia, antes de retirar os já ocupados
 */
export function buildSlotsForDate(schedule, dateStr, durationMin = 0) {
  if (isDayClosed(schedule, dateStr)) return [];
  const day = schedule.hours[weekdayOf(dateStr)];

  // Períodos de trabalho: da abertura ao fecho, cortados pelas pausas
  const periods = [];
  let cursor = toMinutes(day.open);
  const close = toMinutes(day.close);
  [...day.breaks]
    .sort((a, b) => toMinutes(a.start) - toMinutes(b.start))
    .forEach(b => {
      const start = toMinutes(b.start);
      const end = toMinutes(b.end);
      if (start > cursor) periods.push([cursor, Math.min(start, close)]);
      cursor = Math.max(cursor, end);
    });
  if (cursor < close) periods.push([cursor, close]);

  const blocked = schedule.timeOff
    .filter(t => t.startTime && t.startDate <= dateStr && dateStr <= t.endDate)
    .map(t => [toMinutes(t.startTime), toMinutes(t.endTime)]);

  // O serviço tem de caber inteiro antes da pausa ou do fecho (RN02)
  const length = Math.max(durationMin, 1);
  const slots = [];
  periods.forEach(([start, end]) => {
    for (let t = start; t + Math.max(durationMin, 0) <= end && t < end; t += SLOT_STEP_MIN) {
      if (!blocked.some(([bs, be]) => t < be && t + length > bs)) slots.push(fromMinutes(t));
    }
  });
  return slots;
}

/**
 * Resumo de um dia: "17:30 — 21:00" ou "Encerrado"
 */
export function summarizeDay(day) {
  return day.isOpen ? `${day.open} — ${day.close}` : 'Encerrado';
}

/**
 * Semana agrupada para mostrar ao público: dias seguidos com o mesmo horário ficam juntos
 */
export function summarizeWeek(hours) {
  const order = [1, 2, 3, 4, 5, 6, 0];
  const groups = [];
  order.forEach(wd => {
    const day = hours[wd];
    const text = summarizeDay(day);
    const last = groups[groups.length - 1];
    if (last && last.text === text) last.days.push(wd);
    else groups.push({ days: [wd], text, closed: !day.isOpen });
  });

  return groups.map(g => {
    const first = WEEKDAY_NAMES[g.days[0]];
    const last = WEEKDAY_NAMES[g.days[g.days.length - 1]];
    let label = first;
    if (g.days.length === 2) label = `${first} e ${last}`;
    if (g.days.length > 2) label = `${first} a ${last}`;
    return { label, text: g.text, closed: g.closed };
  });
}

let schedulePromise = null;

export const scheduleService = {
  defaults: defaultSchedule,

  /**
   * Horário, bloqueios de hoje em diante e estado das marcações.
   * Se a base de dados falhar, devolve o horário predefinido.
   */
  async getSchedule({ fresh = false } = {}) {
    if (!SUPABASE_ENABLED || !supabase) return defaultSchedule();
    if (fresh) schedulePromise = null;
    if (!schedulePromise) schedulePromise = this._loadSchedule();
    return schedulePromise;
  },

  async _loadSchedule() {
    const schedule = defaultSchedule();
    try {
      const [hoursRes, offRes, settingsRes] = await Promise.all([
        supabase.from('horario_funcionamento').select('*'),
        supabase.from('folgas').select('*').gte('data_fim', formatDateLocalISO()).order('data_inicio'),
        supabase.from('definicoes_marcacoes').select('marcacoes_abertas').eq('id', 1).maybeSingle()
      ]);

      if (hoursRes.error) throw hoursRes.error;
      (hoursRes.data || []).map(mapHours).forEach(h => {
        if (h.weekday >= 0 && h.weekday <= 6) schedule.hours[h.weekday] = h;
      });
      schedule.fromDb = true;

      if (!offRes.error) schedule.timeOff = (offRes.data || []).map(mapTimeOff);
      if (!settingsRes.error && settingsRes.data) schedule.bookingsOpen = settingsRes.data.marcacoes_abertas !== false;
    } catch (err) {
      console.warn('Horário indisponível, a usar o predefinido:', err);
    }
    return schedule;
  },

  async saveDays(days) {
    const rows = days.map(d => ({
      dia_semana: d.weekday,
      aberto: d.isOpen,
      hora_abertura: d.open,
      hora_fecho: d.close,
      pausas: d.breaks.map(b => ({ inicio: b.start, fim: b.end })),
      atualizado_em: new Date().toISOString()
    }));

    const { error } = await supabase.from('horario_funcionamento').upsert(rows, { onConflict: 'dia_semana' });
    if (error) {
      console.error('Erro ao guardar horário:', error);
      throw friendlyError(error, 'Erro ao guardar o horário.');
    }
    schedulePromise = null;
    return true;
  },

  async setBookingsOpen(open) {
    const { error } = await supabase
      .from('definicoes_marcacoes')
      .upsert({ id: 1, marcacoes_abertas: open, atualizado_em: new Date().toISOString() }, { onConflict: 'id' });
    if (error) {
      console.error('Erro ao abrir/fechar marcações:', error);
      throw friendlyError(error, 'Erro ao alterar o estado das marcações.');
    }
    schedulePromise = null;
    return open;
  },

  async getAllTimeOff() {
    const { data, error } = await supabase
      .from('folgas')
      .select('*')
      .order('data_inicio', { ascending: true });
    if (error) {
      console.error('Erro ao listar indisponibilidades:', error);
      throw friendlyError(error, 'Erro ao carregar indisponibilidades.');
    }
    return (data || []).map(mapTimeOff);
  },

  async addTimeOff({ startDate, endDate, startTime = null, endTime = null, kind = 'FOLGA', reason = '' }) {
    const { data, error } = await supabase
      .from('folgas')
      .insert({
        data_inicio: startDate,
        data_fim: endDate,
        hora_inicio: startTime,
        hora_fim: endTime,
        tipo: kind,
        motivo: reason ? String(reason).trim() : null
      })
      .select()
      .single();
    if (error) {
      console.error('Erro ao criar indisponibilidade:', error);
      throw friendlyError(error, 'Erro ao bloquear os dias.');
    }
    schedulePromise = null;
    return mapTimeOff(data);
  },

  async deleteTimeOff(id) {
    const { error } = await supabase.from('folgas').delete().eq('id', id);
    if (error) {
      console.error('Erro ao remover indisponibilidade:', error);
      throw friendlyError(error, 'Erro ao remover o bloqueio.');
    }
    schedulePromise = null;
    return true;
  }
};
