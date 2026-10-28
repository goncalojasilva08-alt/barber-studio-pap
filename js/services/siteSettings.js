/**
 * Barber Studio — Site Settings (Supabase + Fallback Estático)
 * Busca configurações dinâmicas do perfil_barbeiro, com fallback para DEFAULT_SETTINGS.
 */

import { supabase, SUPABASE_ENABLED } from '../supabase/supabase-config.js';

export const DEFAULT_SETTINGS = {
  heroTitle: 'PRECISÃO<br>EM CADA<br>CORTE.',
  heroSubtitle: 'Mais do que um corte. Uma experiência pensada ao detalhe, onde técnica cirúrgica, visagismo masculino e calma se unem para elevar a tua identidade.',
  heroBackgroundImage: 'https://images.unsplash.com/photo-1503951914875-452162b0f3f1?auto=format&fit=crop&w=1200&q=85',
  heroBadgeText: 'SOLO BARBER ATELIER · POR RUI',
  heroBadgeGoldText: 'ATENDIMENTO EXCLUSIVO',
  aboutHeading: 'RUI.<br>A ARTE DO CORTE<br>INDIVIDUALIZADO.',
  aboutQuote: 'Cada corte é tratado como uma peça única. O meu compromisso é encontrar o equilíbrio exato entre a geometria do teu rosto e o teu estilo pessoal.',
  aboutQuoteAuthor: '— RUI, FUNDADOR & BARBEIRO',
  aboutBody1: 'Como barbeiro solo, optei por quebrar o ritmo impessoal das barbearias convencionais de grande volume. Aqui não há filas de espera ruidosas nem pressa para passar ao próximo cliente.',
  aboutBody2: 'Combino formação contínua nas técnicas mais avançadas de tesoura, fades modernos e barboterapia tradicional. Cada marcação é um momento reservado para cuidar da tua imagem com calma, precisão e respeito pelo teu tempo.',
  aboutPortraitImage: 'https://images.unsplash.com/photo-1621605815971-fbc98d665033?auto=format&fit=crop&w=900&q=85',
  aboutSpecialties: ['Visagismo & Skin Fade', 'Atendimento Solo 1-on-1'],
  pillar1Title: 'PRECISÃO',
  pillar1Text: 'Cada linha, degradê e textura são executados com rigor milimétrico. Sem pressa e com atenção cirúrgica a cada ângulo do teu cabelo e barba.',
  pillar2Title: 'VISAGISMO',
  pillar2Text: 'Não aplicamos moldes genéricos. Analisamos a tua estrutura óssea, formato de rosto e tipo de fio para criar um estilo que valoriza a tua identidade única.',
  pillar3Title: 'QUALIDADE',
  pillar3Text: 'Utilização de produtos capilares e óleos de barba importados de topo de gama, acompanhados de navalhas descartáveis e esterilização hospitalar.',
  pillar4Title: 'EXCLUSIVIDADE',
  pillar4Text: 'Atendimento a solo e à porta fechada. O estúdio é reservado exclusivamente para ti no horário agendado, com pontualidade britânica e conforto premium.',
  contactAddress: 'Atendimento Privado & Exclusivo<br>Madeira, Portugal',
  contactPhone: '+351 900 000 000',
  contactEmail: 'contacto@barberstudio.demo',
  contactInstagram: '@barberstudio.demo',
  contactMapsUrl: 'https://www.google.com/maps/search/Madeira,+Portugal',
  contactMapsEmbedUrl: 'https://www.google.com/maps?q=32.6537836,-16.9103331&z=16&hl=pt-PT&output=embed',
  scheduleTueFri: '09:30 — 19:30',
  scheduleSat: '09:00 — 18:00',
  scheduleSunMon: 'Encerrado',
  ctaTitle: 'READY FOR YOUR<br>NEXT CUT?',
  ctaSubtitle: 'Escolhe o teu serviço, seleciona o melhor dia no calendário e garante a tua marcação exclusiva com o Rui.',
  ctaButtonText: 'MARCAR NO CALENDÁRIO',
  brandName: 'BARBER STUDIO',
  brandSubtitle: 'SOLO BARBER',
  brandLogoUrl: './assets/favicon-32.png',
  colorPrimary: '#C9A227',
  colorPrimaryHover: '#D8B036',
  colorPrimaryDark: '#A38018',
  colorPrimarySubtle: 'rgba(201, 162, 39, 0.12)',
  colorPrimaryGlow: 'rgba(201, 162, 39, 0.25)',
  colorBackground: '#171717',
  colorBackgroundPure: '#0C0C0C',
  colorBackgroundElevated: '#1F1F1F',
  colorSurfaceLight: '#DFD8CB',
  colorCardLight: '#F7F3EB',
  colorWarmWhite: '#FFFFFF',
  colorWhite: '#FFFFFF',
  colorGrayLight: '#D6CEBE',
  colorGrayBorderLight: '#CCC4B2',
  colorGrayBorderDark: '#262626',
  colorGrayBorderDarkHover: '#3D3D3D',
  colorGrayMuted: '#59544D',
  colorGraySubtle: '#8A8A8A',
  colorGraySoft: '#A3A3A3',
  fontSans: "'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif",
  fontMono: "'JetBrains Mono', 'Geist Mono', Consolas, monospace",
  seoTitle: 'BARBER STUDIO — Barbearia & Visagismo Masculino | Precision Haircuts',
  seoDescription: 'Atelier de barbearia solo por Rui. Cortes de precisão, barboterapia, visagismo e atendimento 100% individualizado. Marca o teu horário online.',
  seoKeywords: 'barbearia, barbeiro, barber studio, corte masculino, fade, barba, visagismo, barboterapia, agendamento',
  ogImage: 'https://barber-studio.vercel.app/assets/og-image.jpg',
  footerDescription: 'Atendimento a solo e exclusivo. A união de técnica moderna com o conforto da barbearia clássica.',
  footerCopyright: '© 2026 Barber Studio. Todos os direitos reservados.',
};

function mapProfileToSettings(profile) {
  if (!profile) return DEFAULT_SETTINGS;

  return {
    ...DEFAULT_SETTINGS,
    contactPhone: profile.formattedPhone || profile.phone ? `+351 ${String(profile.phone).replace(/(\d{3})(\d{3})(\d{3})/, '$1 $2 $3')}` : DEFAULT_SETTINGS.contactPhone,
    contactEmail: profile.email || DEFAULT_SETTINGS.contactEmail,
    contactInstagram: profile.instagram || DEFAULT_SETTINGS.contactInstagram,
    contactMapsUrl: profile.maps_url || profile.mapsUrl || DEFAULT_SETTINGS.contactMapsUrl,
    aboutPortraitImage: profile.foto_url || profile.photoUrl || DEFAULT_SETTINGS.aboutPortraitImage,
    brandName: DEFAULT_SETTINGS.brandName,
    brandSubtitle: DEFAULT_SETTINGS.brandSubtitle,
    seoTitle: profile.seo_titulo || profile.seoTitle || DEFAULT_SETTINGS.seoTitle,
    seoDescription: profile.seo_descricao || profile.seoDescription || DEFAULT_SETTINGS.seoDescription,
    seoKeywords: profile.seo_palavras_chave || profile.seoKeywords || DEFAULT_SETTINGS.seoKeywords,
    ogImage: profile.foto_url || profile.photoUrl || DEFAULT_SETTINGS.ogImage,
  };
}

export const siteSettings = {
  async getSettings() {
    if (!SUPABASE_ENABLED || !supabase) {
      return DEFAULT_SETTINGS;
    }

    try {
      const { data, error } = await supabase
        .from('perfil_barbeiro')
        .select('*')
        .limit(1)
        .maybeSingle();

      if (error) {
        console.warn('Erro ao carregar configurações do site (perfil_barbeiro):', error);
        return DEFAULT_SETTINGS;
      }

      return mapProfileToSettings(data);
    } catch (e) {
      console.warn('Fallback configurações do site:', e);
      return DEFAULT_SETTINGS;
    }
  },

  applyToDOM(settings) {
    const root = document.documentElement;

    if (settings.colorPrimary) root.style.setProperty('--color-gold', settings.colorPrimary);
    if (settings.colorPrimaryHover) root.style.setProperty('--color-gold-hover', settings.colorPrimaryHover);
    if (settings.colorPrimaryDark) root.style.setProperty('--color-gold-dark', settings.colorPrimaryDark);
    if (settings.colorPrimarySubtle) root.style.setProperty('--color-gold-subtle', settings.colorPrimarySubtle);
    if (settings.colorPrimaryGlow) root.style.setProperty('--color-gold-glow', settings.colorPrimaryGlow);
    if (settings.colorBackground) root.style.setProperty('--color-black', settings.colorBackground);
    if (settings.colorBackgroundPure) root.style.setProperty('--color-black-pure', settings.colorBackgroundPure);
    if (settings.colorBackgroundElevated) root.style.setProperty('--color-black-elevated', settings.colorBackgroundElevated);
    if (settings.colorSurfaceLight) root.style.setProperty('--color-surface-light', settings.colorSurfaceLight);
    if (settings.colorCardLight) root.style.setProperty('--color-card-light', settings.colorCardLight);
    if (settings.colorWarmWhite) root.style.setProperty('--color-warm-white', settings.colorWarmWhite);
    if (settings.colorWhite) root.style.setProperty('--color-white', settings.colorWhite);
    if (settings.colorGrayLight) root.style.setProperty('--color-gray-light', settings.colorGrayLight);
    if (settings.colorGrayBorderLight) root.style.setProperty('--color-gray-border-light', settings.colorGrayBorderLight);
    if (settings.colorGrayBorderDark) root.style.setProperty('--color-gray-border-dark', settings.colorGrayBorderDark);
    if (settings.colorGrayBorderDarkHover) root.style.setProperty('--color-gray-border-dark-hover', settings.colorGrayBorderDarkHover);
    if (settings.colorGrayMuted) root.style.setProperty('--color-gray-muted', settings.colorGrayMuted);
    if (settings.colorGraySubtle) root.style.setProperty('--color-gray-subtle', settings.colorGraySubtle);
    if (settings.colorGraySoft) root.style.setProperty('--color-gray-soft', settings.colorGraySoft);

    if (settings.fontSans) root.style.setProperty('--font-sans', settings.fontSans);
    if (settings.fontMono) root.style.setProperty('--font-mono', settings.fontMono);

    if (settings.seoTitle) document.title = settings.seoTitle;
    if (settings.seoDescription) {
      const metaDesc = document.querySelector('meta[name="description"]');
      if (metaDesc) metaDesc.setAttribute('content', settings.seoDescription);
    }
    if (settings.seoKeywords) {
      const metaKeywords = document.querySelector('meta[name="keywords"]');
      if (metaKeywords) metaKeywords.setAttribute('content', settings.seoKeywords);
    }
    if (settings.ogImage) {
      const ogImage = document.querySelector('meta[property="og:image"]');
      if (ogImage) ogImage.setAttribute('content', settings.ogImage);
    }
    if (settings.brandLogoUrl) {
      const favicon = document.querySelector('link[rel="icon"]');
      if (favicon) favicon.setAttribute('href', settings.brandLogoUrl);
    }
    if (settings.aboutPortraitImage) {
      const barberImg = document.getElementById('barber-portrait-img');
      if (barberImg) barberImg.src = settings.aboutPortraitImage;
    }
  },
};