/**
 * Barber Studio — Gallery Service (Supabase Layer + UUID Safe)
 */

import { supabase, SUPABASE_ENABLED } from '../supabase/supabase-config.js';

// Função para verificar se é um UUID válido do PostgreSQL
function isUUID(str) {
  const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
  return typeof str === 'string' && uuidRegex.test(str);
}

// Imagens editoriais padrão caso a base de dados ainda não tenha fotos
const DEFAULT_GALLERY_ITEMS = [
  {
    id: 'def-1',
    imageUrl: 'https://images.unsplash.com/photo-1622286342621-4bd786c2447c?auto=format&fit=crop&w=1000&q=85',
    title: 'Mid Taper Fade & Texture Crop',
    description: 'Degradê lateral limpo com textura e finalização mate.',
    category: 'cortes',
    categoryLabel: 'CORTES',
    layoutType: 'alto'
  },
  {
    id: 'def-2',
    imageUrl: 'https://images.unsplash.com/photo-1599351431202-1e0f0137899a?auto=format&fit=crop&w=1200&q=85',
    title: 'Precision Scissor Craft',
    description: 'Trabalho de tesoura estruturado ao detalhe milimétrico.',
    category: 'detalhes',
    categoryLabel: 'DETALHES',
    layoutType: 'largo'
  },
  {
    id: 'def-3',
    imageUrl: 'https://images.unsplash.com/photo-1621605815971-fbc98d665033?auto=format&fit=crop&w=800&q=85',
    title: 'Sculpted Beard & Razor Lines',
    description: 'Contorno de barba cirúrgico e alinhamento à navalha.',
    category: 'barba',
    categoryLabel: 'BARBA',
    layoutType: 'normal'
  },
  {
    id: 'def-4',
    imageUrl: 'https://images.unsplash.com/photo-1503951914875-452162b0f3f1?auto=format&fit=crop&w=1000&q=85',
    title: 'Low Skin Fade',
    description: 'Transição suave adaptada à fisionomia craniana.',
    category: 'cortes',
    categoryLabel: 'CORTES',
    layoutType: 'normal'
  },
  {
    id: 'def-5',
    imageUrl: 'https://images.unsplash.com/photo-1517832606589-7629c339590a?auto=format&fit=crop&w=1000&q=85',
    title: 'Hot Towel Barboterapia',
    description: 'Ritual clássico de toalha quente e óleos essenciais.',
    category: 'detalhes',
    categoryLabel: 'DETALHES',
    layoutType: 'normal'
  },
  {
    id: 'def-6',
    imageUrl: 'https://images.unsplash.com/photo-1512690459411-b9245aed614b?auto=format&fit=crop&w=1000&q=85',
    title: 'Classic Pompadour Modern',
    description: 'Volume e acabamento tradicional com brilho controlado.',
    category: 'cortes',
    categoryLabel: 'CORTES',
    layoutType: 'largo'
  }
];

function mapGalleryItem(item, index = 0) {
  if (!item) return null;
  return {
    id: item.id,
    imageUrl: item.imagem_url,
    description: item.descricao || 'Corte & Estilo de Precisão',
    title: item.titulo || item.descricao || 'Corte Assinatura',
    category: item.categoria || 'cortes',
    categoryLabel: (item.categoria || 'cortes').toUpperCase(),
    layoutType: item.tipo_layout || (index % 3 === 0 ? 'alto' : (index % 3 === 1 ? 'largo' : 'normal')),
    createdAt: item.criado_em
  };
}

export const galleryService = {
  async getAllItems() {
    if (!SUPABASE_ENABLED || !supabase) {
      return DEFAULT_GALLERY_ITEMS;
    }

    try {
      const { data, error } = await supabase
        .from('galeria')
        .select('*')
        .order('criado_em', { ascending: true });

      if (error || !data || data.length === 0) {
        return DEFAULT_GALLERY_ITEMS;
      }

      return data.map((item, idx) => mapGalleryItem(item, idx));
    } catch (e) {
      console.warn('Falha na ligação Supabase, a usar Lookbook padrão:', e);
      return DEFAULT_GALLERY_ITEMS;
    }
  },

  async getFiltered(category = 'all') {
    const items = await this.getAllItems();
    if (!category || category === 'all') return items;
    return items.filter(item => item.category.toLowerCase() === category.toLowerCase());
  },

  async addItem({ title, category, description, imageUrl, layoutType = 'normal' }) {
    if (!SUPABASE_ENABLED || !supabase) throw new Error('Supabase não está configurado.');

    const newItemData = {
      imagem_url: imageUrl.trim(),
      descricao: (description || title || 'Corte de Precisão').trim(),
      categoria: category || 'cortes',
      tipo_layout: layoutType || 'normal'
    };

    const { data, error } = await supabase
      .from('galeria')
      .insert(newItemData)
      .select()
      .single();

    if (error) throw new Error(error.message || 'Erro ao adicionar item na galeria.');
    return mapGalleryItem(data);
  },

  async updateItem(id, updates) {
    if (!SUPABASE_ENABLED || !supabase) throw new Error('Supabase não está configurado.');

    // SE O ID NÃO FOR UM UUID (ex: 'def-5'), É UMA FOTO MODELO:
    // Cria um registo real no Supabase (INSERT) em vez de falhar no UPDATE
    if (!isUUID(id)) {
      return await this.addItem({
        title: updates.title || updates.description,
        category: updates.category,
        description: updates.description,
        imageUrl: updates.imageUrl || updates.image_url,
        layoutType: updates.layoutType || updates.layout_type
      });
    }

    const dbUpdates = {};
    if (updates.imageUrl || updates.image_url) dbUpdates.imagem_url = (updates.imageUrl || updates.image_url).trim();
    if (updates.description !== undefined) dbUpdates.descricao = updates.description.trim();
    if (updates.category !== undefined) dbUpdates.categoria = updates.category;
    if (updates.layoutType !== undefined) dbUpdates.tipo_layout = updates.layoutType;

    const { data, error } = await supabase
      .from('galeria')
      .update(dbUpdates)
      .eq('id', id)
      .select()
      .single();

    if (error) throw new Error(error.message || 'Erro ao atualizar galeria.');
    return mapGalleryItem(data);
  },

  async deleteItem(id) {
    if (!SUPABASE_ENABLED || !supabase) throw new Error('Supabase não está configurado.');

    // Se for uma foto modelo (não é UUID), não está na BD, apenas retorna sucesso
    if (!isUUID(id)) {
      return true;
    }

    const { error } = await supabase.from('galeria').delete().eq('id', id);
    if (error) throw new Error(error.message || 'Erro ao remover item da galeria.');
    return true;
  }
};