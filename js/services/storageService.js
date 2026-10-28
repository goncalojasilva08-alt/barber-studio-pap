/**
 * Barber Studio — Storage Service (Supabase Storage)
 */

import { supabase, SUPABASE_ENABLED } from '../supabase/supabase-config.js';

export const storageService = {
    /**
     * Faz upload de uma imagem para o bucket do Supabase
     * @param {File|Blob} file Ficheiro de imagem
     * @param {string} [folder='lookbook'] Subpasta
     * @returns {Promise<string>} URL pública da imagem
     */
    async uploadImage(file, folder = 'lookbook') {
        if (!SUPABASE_ENABLED || !supabase) {
            throw new Error('Supabase não está configurado.');
        }

        if (!file) {
            throw new Error('Nenhum ficheiro fornecido.');
        }

        // Validação de tipo
        if (!file.type || !file.type.startsWith('image/')) {
            throw new Error('O ficheiro tem de ser uma imagem (JPG, PNG, WEBP).');
        }

        // Limite de 8MB
        if (file.size > 8 * 1024 * 1024) {
            throw new Error('A imagem não pode ultrapassar 8MB.');
        }

        // Extensão e nome único
        const ext = file.name ? file.name.split('.').pop().toLowerCase() : 'jpg';
        const cleanExt = ['jpg', 'jpeg', 'png', 'webp'].includes(ext) ? ext : 'jpg';
        const fileName = `${folder}/${Date.now()}_${Math.random().toString(36).substring(2, 8)}.${cleanExt}`;

        const { data, error } = await supabase.storage
            .from('galeria')
            .upload(fileName, file, {
                cacheControl: '3600',
                upsert: false
            });

        if (error) {
            console.error('Erro no upload para o Supabase Storage:', error);
            throw new Error(error.message || 'Falha ao guardar a imagem no servidor.');
        }

        // Obter o URL público definitivo
        const { data: publicUrlData } = supabase.storage
            .from('galeria')
            .getPublicUrl(data.path);

        return publicUrlData.publicUrl;
    }
};