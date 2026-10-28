/**
 * Barber Studio — Barber Profile Service (Supabase Layer)
 */

import { supabase, SUPABASE_ENABLED } from '../supabase/supabase-config.js';

const DEFAULT_PROFILE = {
  id: 'default',
  name: 'Rui',
  studioName: 'Barber Studio',
  location: 'Madeira, Portugal',
  phone: '900000000',
  formattedPhone: '+351 900 000 000',
  email: 'contacto@barberstudio.demo',
  instagram: '@barberstudio.demo',
  instagramUrl: 'https://www.instagram.com/',
  mapsUrl: 'https://www.google.com/maps/search/Madeira,+Portugal',
  photoUrl: 'https://images.unsplash.com/photo-1621605815971-fbc98d665033?auto=format&fit=crop&w=900&q=85',
  bio: 'Especialista em visagismo e cortes de precisão na Madeira. Atendimento 100% exclusivo e individualizado.',
  specialties: ['Visagismo & Skin Fade', 'Atendimento Solo 1-on-1'],
  latitude: 32.748,
  longitude: -17.031885,
  websiteUrl: '',
  seoTitle: '',
  seoDescription: '',
  seoKeywords: '',
};

function mapBarberProfile(bp) {
  if (!bp) return DEFAULT_PROFILE;
  return {
    ...DEFAULT_PROFILE,
    id: bp.id,
    name: bp.nome || DEFAULT_PROFILE.name,
    studioName: bp.nome_estudio || DEFAULT_PROFILE.studioName,
    location: DEFAULT_PROFILE.location,
    phone: DEFAULT_PROFILE.phone,
    formattedPhone: DEFAULT_PROFILE.formattedPhone,
    email: bp.email || DEFAULT_PROFILE.email,
    instagram: DEFAULT_PROFILE.instagram,
    instagramUrl: DEFAULT_PROFILE.instagramUrl,
    mapsUrl: DEFAULT_PROFILE.mapsUrl,
    photoUrl: bp.foto_url || DEFAULT_PROFILE.photoUrl,
    bio: bp.biografia || DEFAULT_PROFILE.bio,
    specialties: DEFAULT_PROFILE.specialties,
    latitude: bp.latitude || DEFAULT_PROFILE.latitude,
    longitude: bp.longitude || DEFAULT_PROFILE.longitude,
    websiteUrl: bp.site_url || DEFAULT_PROFILE.websiteUrl,
    seoTitle: bp.seo_titulo || DEFAULT_PROFILE.seoTitle,
    seoDescription: bp.seo_descricao || DEFAULT_PROFILE.seoDescription,
    seoKeywords: bp.seo_palavras_chave || DEFAULT_PROFILE.seoKeywords,
    createdAt: bp.criado_em,
  };
}

export const barberService = {
  async getProfile() {
    if (!SUPABASE_ENABLED || !supabase) {
      return DEFAULT_PROFILE;
    }

    try {
      const { data, error } = await supabase
        .from('perfil_barbeiro')
        .select('*')
        .limit(1)
        .maybeSingle();

      if (error) {
        console.warn('Erro ao carregar perfil do barbeiro:', error);
        return DEFAULT_PROFILE;
      }

      return mapBarberProfile(data);
    } catch (e) {
      console.warn('Fallback perfil do barbeiro:', e);
      return DEFAULT_PROFILE;
    }
  },

  async updateProfile(updates) {
    if (!SUPABASE_ENABLED || !supabase) {
      throw new Error('Supabase não está configurado.');
    }

    const current = await this.getProfile();
    const dbUpdates = {};
    if (updates.name) dbUpdates.nome = updates.name.trim();
    if (updates.studioName) dbUpdates.nome_estudio = updates.studioName.trim();
    if (updates.bio) dbUpdates.biografia = updates.bio.trim();
    if (updates.avatar_url || updates.photoUrl) dbUpdates.foto_url = (updates.avatar_url || updates.photoUrl).trim();
    if (updates.email) dbUpdates.email = updates.email.trim();
    if (updates.latitude !== undefined) dbUpdates.latitude = updates.latitude;
    if (updates.longitude !== undefined) dbUpdates.longitude = updates.longitude;
    if (updates.website_url) dbUpdates.site_url = updates.website_url.trim();
    if (updates.seo_title) dbUpdates.seo_titulo = updates.seo_title.trim();
    if (updates.seo_description) dbUpdates.seo_descricao = updates.seo_description.trim();
    if (updates.seo_keywords) dbUpdates.seo_palavras_chave = updates.seo_keywords.trim();

    if (current.id && current.id !== 'default') {
      const { data, error } = await supabase
        .from('perfil_barbeiro')
        .update(dbUpdates)
        .eq('id', current.id)
        .select()
        .single();

      if (error) throw new Error(error.message || 'Erro ao atualizar perfil.');
      return mapBarberProfile(data);
    } else {
      const { data, error } = await supabase
        .from('perfil_barbeiro')
        .insert(dbUpdates)
        .select()
        .single();

      if (error) throw new Error(error.message || 'Erro ao criar perfil.');
      return mapBarberProfile(data);
    }
  }
};
