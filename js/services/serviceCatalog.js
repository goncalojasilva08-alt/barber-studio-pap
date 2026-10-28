/**
 * Barber Studio — Service Catalog (Supabase Layer)
 */

import { supabase, SUPABASE_ENABLED } from '../supabase/supabase-config.js';

function parseDurationMinutes(duration) {
  if (typeof duration === 'number') return duration;
  if (!duration) return 30;
  const match = String(duration).match(/\d+/);
  return match ? parseInt(match[0], 10) : 30;
}

function isUUID(str) {
  const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
  return typeof str === 'string' && uuidRegex.test(str);
}

function mapService(s) {
  if (!s) return null;
  const durationMin = s.duracao_minutos || 30;
  return {
    id: s.id,
    name: s.nome,
    price: Number(s.preco),
    duration: `${durationMin} min`,
    duration_minutes: durationMin,
    category: s.categoria || (s.nome?.toLowerCase().includes('barba') ? 'EXPERIÊNCIA COMPLETA' : 'CORTE'),
    description: s.descricao || (s.nome?.toLowerCase().includes('barba')
      ? 'Corte de cabelo completo combinado com alinhamento e acabamento de barba à navalha.'
      : 'Consultoria de estilo, corte de precisão à tesoura ou máquina e finalização personalizada.'),
    active: s.ativo !== false,
    // Os selos são atribuídos automaticamente em getActiveServices()
    featured: false,
    popular: false,
    createdAt: s.criado_em
  };
}

// Mínimo de marcações (últimos 90 dias) para um serviço poder ser "o mais pedido"
const POPULAR_MIN_BOOKINGS = 2;

/**
 * Nº de marcações por serviço nos últimos 90 dias. Vem de uma função da base de
 * dados porque um visitante não pode ler as marcações dos outros clientes.
 * Enquanto a função não existir, devolve um mapa vazio (sem selo "Mais pedido").
 */
async function fetchPopularity() {
  const counts = new Map();
  if (!SUPABASE_ENABLED || !supabase) return counts;

  try {
    const { data, error } = await supabase.rpc('popularidade_servicos');
    if (error || !Array.isArray(data)) return counts;
    data.forEach(row => counts.set(row.servico_id, Number(row.total) || 0));
  } catch (err) {
    // Sem estatísticas: segue sem o selo
  }
  return counts;
}

/**
 * Selos automáticos:
 * - "Mais pedido": o serviço com mais marcações nos últimos 90 dias.
 * - "Recomendado": o serviço mais completo (preço mais alto; em caso de empate,
 *   o mais demorado). Havendo três ou mais serviços, evita-se que os dois selos
 *   caiam no mesmo, para destacar duas opções diferentes.
 */
function applyAutoBadges(services, counts) {
  const list = services.map(s => ({ ...s, featured: false, popular: false }));
  if (list.length < 2) return list;

  let popular = null;
  list.forEach(s => {
    const total = counts.get(s.id) || 0;
    if (total >= POPULAR_MIN_BOOKINGS && (!popular || total > (counts.get(popular.id) || 0))) popular = s;
  });
  if (popular) popular.popular = true;

  const byCompleteness = [...list].sort((a, b) =>
    (b.price - a.price) || (b.duration_minutes - a.duration_minutes));
  let recommended = byCompleteness[0];
  if (recommended === popular && list.length >= 3) recommended = byCompleteness[1];
  recommended.featured = true;

  return list;
}

export const serviceCatalog = {
  async getAllServices() {
    if (!SUPABASE_ENABLED || !supabase) {
      throw new Error('Supabase não está configurado.');
    }

    const { data, error } = await supabase
      .from('servicos')
      .select('*')
      .order('preco', { ascending: true });

    if (error) {
      console.error('Erro ao listar serviços:', error);
      throw new Error(error.message || 'Erro ao carregar serviços.');
    }

    return (data || []).map(mapService);
  },

  async getActiveServices() {
    const all = await this.getAllServices();
    const active = all.filter(s => s.active !== false);
    return applyAutoBadges(active, await fetchPopularity());
  },

  async getServiceById(id) {
    if (!SUPABASE_ENABLED || !supabase) {
      throw new Error('Supabase não está configurado.');
    }

    const { data, error } = await supabase
      .from('servicos')
      .select('*')
      .eq('id', id)
      .maybeSingle();

    if (error) {
      console.error('Erro ao buscar serviço:', error);
      return null;
    }

    return mapService(data);
  },

  async addService({ name, category, price, duration, description, featured = false, active = true }) {
    if (!SUPABASE_ENABLED || !supabase) {
      throw new Error('Supabase não está configurado.');
    }

    const durationMin = parseDurationMinutes(duration);
    const newServiceData = {
      nome: name.trim(),
      categoria: (category || 'CORTE').trim().toUpperCase(),
      preco: Number(price),
      duracao_minutos: durationMin,
      descricao: description ? description.trim() : '',
      destaque: Boolean(featured),
      ativo: active !== false
    };

    const { data, error } = await supabase
      .from('servicos')
      .insert(newServiceData)
      .select()
      .single();

    if (error) {
      console.error('Erro ao adicionar serviço:', error);
      throw new Error(error.message || 'Erro ao adicionar serviço.');
    }

    return mapService(data);
  },

  async updateService(id, updates) {
    if (!SUPABASE_ENABLED || !supabase) {
      throw new Error('Supabase não está configurado.');
    }

    // Se for serviço de demonstração (não UUID), cria um novo real na BD
    if (!isUUID(id)) {
      return await this.addService({
        name: updates.name,
        category: updates.category,
        price: updates.price,
        duration: updates.duration || updates.duration_minutes,
        description: updates.description,
        featured: updates.featured,
        active: updates.active
      });
    }

    const dbUpdates = {};
    if (updates.name !== undefined) dbUpdates.nome = updates.name.trim();
    if (updates.category !== undefined) dbUpdates.categoria = updates.category.trim().toUpperCase();
    if (updates.price !== undefined) dbUpdates.preco = Number(updates.price);
    if (updates.duration !== undefined || updates.duration_minutes !== undefined) {
      dbUpdates.duracao_minutos = parseDurationMinutes(updates.duration || updates.duration_minutes);
    }
    if (updates.description !== undefined) dbUpdates.descricao = updates.description.trim();
    if (updates.featured !== undefined) dbUpdates.destaque = Boolean(updates.featured);
    if (updates.active !== undefined) dbUpdates.ativo = Boolean(updates.active);

    const { data, error } = await supabase
      .from('servicos')
      .update(dbUpdates)
      .eq('id', id)
      .select()
      .single();

    if (error) {
      console.error('Erro ao atualizar serviço:', error);
      throw new Error(error.message || 'Erro ao atualizar serviço.');
    }

    return mapService(data);
  },

  async toggleServiceStatus(id) {
    if (!SUPABASE_ENABLED || !supabase) {
      throw new Error('Supabase não está configurado.');
    }

    const service = await this.getServiceById(id);
    if (!service) throw new Error('Serviço não encontrado.');

    const newActiveState = !service.active;

    const { data, error } = await supabase
      .from('servicos')
      .update({ ativo: newActiveState })
      .eq('id', id)
      .select()
      .single();

    if (error) {
      console.error('Erro ao alternar estado do serviço:', error);
      throw new Error(error.message || 'Erro ao atualizar estado do serviço no Supabase.');
    }

    return mapService(data);
  },

  async deleteService(id) {
    if (!SUPABASE_ENABLED || !supabase) {
      throw new Error('Supabase não está configurado.');
    }

    if (!isUUID(id)) {
      return true;
    }

    const { error } = await supabase
      .from('servicos')
      .delete()
      .eq('id', id);

    if (error) {
      console.error('Erro ao remover serviço:', error);
      throw new Error(error.message || 'Erro ao remover serviço.');
    }

    return true;
  }
};
