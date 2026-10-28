/**
 * Barber Studio — Public Website Controller
 * Foco na renderização limpa do website e redirecionamento direto para o calendário.
 */

import { initNavigation } from '../components/nav.js';
import { serviceCatalog } from '../services/serviceCatalog.js';
import { galleryService } from '../services/galleryService.js';
import { barberService } from '../services/barberService.js';
import { siteSettings } from '../services/siteSettings.js';
import { scheduleService, summarizeWeek } from '../services/scheduleService.js';
import { escapeHtml } from '../core/utils.js';
import { Toast } from '../core/toast.js';
import { authService } from '../services/authService.js';

let activeServices = [];
let allGalleryItems = [];

// Galeria: a página mostra só as primeiras fotos; as restantes descobrem-se a deslizar no ecrã ampliado
const GALLERY_PREVIEW_COUNT = 4;
let galleryFilter = 'all';
let lightboxItems = [];
let lightboxIndex = 0;
let lightboxHintShown = false;
let barberProfile = null;
let siteConfig = null;

document.addEventListener('DOMContentLoaded', async () => {
  // 1. Carregar configurações do site e aplicar ao DOM
  try {
    siteConfig = await siteSettings.getSettings();
    siteSettings.applyToDOM(siteConfig);
  } catch (err) {
    console.warn('Erro ao carregar configurações do site:', err);
  }

  // 2. Navegação dinâmica (estado de login na navbar)
  await initNavigation();
  showWelcome();

  // 3. Carregar perfil do barbeiro
  try {
    barberProfile = await barberService.getProfile();
  } catch (err) {
    console.warn('Perfil do barbeiro não encontrado, a usar fallback.', err);
    barberProfile = null;
  }

  // 4. Renderizar catálogo de serviços com links diretos para o calendário
  await loadAndRenderServices();

  // 5. Renderizar lookbook editorial
  await loadAndRenderGallery();

  // 6. Preencher dados reais de contacto
  populateContactData();

  // Novidades desde a última visita (fotos e/ou serviços)
  announceNews();

  // 7. Lightbox para fotos
  initLightbox();

  // 8. Efeitos suaves de Scroll Reveal
  initScrollReveal();

  // 9. Initialize dynamic Google Maps
  initGoogleMaps();
});

/**
 * Boas-vindas, depois do ecrã de carregamento:
 * - primeira vez neste dispositivo: apresentação da barbearia;
 * - quem volta: um cumprimento curto, no máximo uma vez a cada 12 horas.
 */
async function showWelcome() {
  let isFirstEver = false;
  try {
    isFirstEver = !localStorage.getItem('barberstudio_first_visit');
    if (isFirstEver) {
      localStorage.setItem('barberstudio_first_visit', new Date().toISOString());
      // Quem acabou de ser apresentado não precisa de um "bem-vindo de volta" a seguir
      localStorage.setItem('barberstudio_notice_welcome_back', String(Date.now()));
    }

    // Depois de um login/registo cumprimenta-se outra vez, já pelo nome
    if (sessionStorage.getItem('barberstudio_greet_login')) {
      sessionStorage.removeItem('barberstudio_greet_login');
      localStorage.removeItem('barberstudio_notice_welcome_back');
    }
  } catch (err) {
    return;
  }

  let firstName = '';
  try {
    const user = await authService.getCurrentUser();
    firstName = user?.name ? String(user.name).trim().split(' ')[0] : '';
  } catch (err) {
    // Sem sessão: boas-vindas genéricas
  }

  setTimeout(() => {
    if (isFirstEver) {
      Toast.ambient('Bem-vindo à barbearia do Rui. Marca o teu corte em menos de um minuto.', 'welcome', {
        key: 'welcome_first',
        duration: 5500
      });
    } else {
      Toast.ambient(firstName ? `Bem-vindo de volta, ${firstName}.` : 'Bem-vindo de volta à barbearia do Rui.', 'welcome', {
        key: 'welcome_back',
        cooldownHours: 12
      });
    }
  }, 1300);
}

/**
 * Novidades: compara o que existe agora com o que este visitante já tinha visto
 * (guardado no dispositivo) e avisa se houver fotos e/ou serviços novos.
 */
function countNewSince(items, storageKey) {
  const dates = items.map(i => i.createdAt).filter(Boolean).sort();
  if (dates.length === 0) return 0;

  const latest = dates[dates.length - 1];
  let lastSeen = null;
  try {
    lastSeen = localStorage.getItem(storageKey);
    localStorage.setItem(storageKey, latest);
  } catch (err) {
    return 0;
  }

  // Primeira visita: fica só registado, sem aviso
  if (!lastSeen) return 0;
  return dates.filter(d => d > lastSeen).length;
}

async function announceNews() {
  const newPhotos = countNewSince(allGalleryItems, 'barberstudio_seen_gallery');
  const newServices = countNewSince(activeServices, 'barberstudio_seen_services');
  if (newPhotos === 0 && newServices === 0) return;

  // Quem gere o site não precisa de ser avisado do que ele próprio publicou
  try {
    const user = await authService.getCurrentUser();
    if (user && (user.role === 'barbeiro' || user.role === 'admin')) return;
  } catch (err) {
    // Sem sessão: é um visitante
  }

  const photosText = newPhotos === 1 ? '1 foto nova' : `${newPhotos} fotos novas`;
  const servicesText = newServices === 1 ? '1 serviço novo' : `${newServices} serviços novos`;

  let message;
  let target;
  if (newPhotos > 0 && newServices > 0) {
    message = `Há novidades: ${photosText} e ${servicesText}.`;
    target = '#servicos';
  } else if (newPhotos > 0) {
    message = `Há ${photosText} na galeria. Toca para ver.`;
    target = '#galeria';
  } else {
    message = `Há ${servicesText}. Toca para ver.`;
    target = '#servicos';
  }

  // Entra na fila a seguir às boas-vindas
  setTimeout(() => {
    Toast.ambient(message, 'news', {
      duration: 6500,
      onClick: () => document.querySelector(target)?.scrollIntoView({ behavior: 'smooth', block: 'start' })
    });
  }, 1500);
}

/**
 * Selos automáticos de um serviço ("Recomendado" / "Mais pedido")
 */
function renderServiceBadges(s) {
  if (!s.featured && !s.popular) return '';
  return `
    <div class="service-badges">
      ${s.popular ? '<span class="service-badge service-badge--popular"><svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M12 2c1 3.5-1.5 5-1.5 7.5a2.5 2.5 0 0 0 5 0c2 1.5 3.5 4 3.5 6.5a7 7 0 0 1-14 0c0-4 3-6 4-9 .5-1.6 1.5-3.4 3-5z"/></svg>MAIS PEDIDO</span>' : ''}
      ${s.featured ? '<span class="service-badge service-badge--recommended">RECOMENDADO</span>' : ''}
    </div>
  `;
}

/**
 * Renderiza Serviços dinâmicos
 */
async function loadAndRenderServices() {
  const container = document.querySelector('.services-list');
  if (!container) return;

  activeServices = await serviceCatalog.getActiveServices();

  if (activeServices.length === 0) {
    container.innerHTML = `<p class="section-subtitle" style="padding: 2rem 0;">Catálogo de serviços em atualização.</p>`;
    return;
  }

  container.innerHTML = activeServices.map((s) => `
    <div class="service-row ${s.featured ? 'service-row--featured' : ''}" data-service-id="${escapeHtml(s.id)}">
      ${renderServiceBadges(s)}
      <div class="service-row__main">
        <div class="service-row__header">
          <span class="service-category mono-tag ${s.featured ? 'mono-tag--gold' : ''}">${escapeHtml(s.category)}</span>
          <h3 class="service-name">${escapeHtml(s.name)}</h3>
        </div>
        <p class="service-desc">${escapeHtml(s.description)}</p>
        <div class="service-meta">
          <span class="mono-tag mono-tag--muted">DURAÇÃO: ${s.duration}</span>
          <span class="service-dot">·</span>
          <span class="mono-tag ${s.featured ? 'mono-tag--gold' : 'mono-tag--muted'}">ATENDIMENTO SOLO 1-ON-1</span>
        </div>
      </div>
      <div class="service-row__side">
        <span class="service-price">€${s.price}</span>
        <a href="marcar.html?service=${encodeURIComponent(s.id)}" class="btn ${s.featured ? 'btn--gold' : 'btn--gold-outline'} btn--sm">
          MARCAR
        </a>
      </div>
    </div>
  `).join('');
}

/**
 * Galeria Lookbook
 */
function getFilteredGallery() {
  return galleryFilter === 'all'
    ? allGalleryItems
    : allGalleryItems.filter(item => item.category === galleryFilter);
}

function renderGalleryGrid() {
  const grid = document.getElementById('magazine-grid');
  const more = document.getElementById('gallery-more');
  if (!grid) return;

  const items = getFilteredGallery();
  const shown = items.slice(0, GALLERY_PREVIEW_COUNT);

  if (items.length === 0) {
    grid.innerHTML = `<p class="section-subtitle" style="grid-column: 1 / -1; padding: 2rem 0;">Ainda não há fotos nesta categoria.</p>`;
    if (more) more.innerHTML = '';
    return;
  }

  grid.innerHTML = shown.map((item, idx) => {
    let layoutClass = '';
    if (item.layoutType === 'alto') layoutClass = 'mag-item--tall';
    if (item.layoutType === 'largo') layoutClass = 'mag-item--wide';
    const numStr = String(idx + 1).padStart(2, '0');

    return `
      <figure class="mag-item ${layoutClass}" data-index="${idx}" data-category="${escapeHtml(item.category)}">
        <div class="mag-item__img-wrap">
          <img src="${escapeHtml(item.imageUrl)}" alt="${escapeHtml(item.title)}" class="mag-img" loading="lazy">
          <div class="mag-overlay">
            <div class="mag-meta">
              <span class="mono-tag mono-tag--gold">${numStr} · ${escapeHtml(item.categoryLabel || (item.category || '').toUpperCase())}</span>
              <h3 class="mag-title">${escapeHtml(item.title)}</h3>
              <p class="mag-desc">${escapeHtml(item.description)}</p>
            </div>
            <button type="button" class="mag-zoom-btn" aria-label="Ampliar imagem">
              <svg class="icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><circle cx="11" cy="11" r="8"/><line x1="21" x2="16.65" y1="21" y2="16.65"/><line x1="11" x2="11" y1="8" y2="14"/><line x1="8" x2="14" y1="11" y2="11"/></svg>
            </button>
          </div>
        </div>
      </figure>
    `;
  }).join('');

  // Fotos que não cabem na página: abrem diretamente no ecrã ampliado
  if (more) {
    const hidden = items.length - shown.length;
    more.innerHTML = hidden > 0
      ? `<button type="button" class="btn btn--outline-dark btn--sm" id="gallery-more-btn">VER MAIS ${hidden} ${hidden === 1 ? 'FOTO' : 'FOTOS'}</button>`
      : '';
    document.getElementById('gallery-more-btn')?.addEventListener('click', () => openLightbox(shown.length));
  }
}

async function loadAndRenderGallery() {
  const grid = document.getElementById('magazine-grid');
  if (!grid) return;

  allGalleryItems = await galleryService.getAllItems();
  renderGalleryGrid();

  // Filtros de categorias
  const filterBtns = document.querySelectorAll('.filter-btn');
  filterBtns.forEach(btn => {
    btn.addEventListener('click', () => {
      filterBtns.forEach(b => b.classList.remove('is-active'));
      btn.classList.add('is-active');
      galleryFilter = btn.getAttribute('data-filter') || 'all';

      grid.classList.add('is-switching');
      setTimeout(() => {
        renderGalleryGrid();
        grid.classList.remove('is-switching');
      }, 180);
    });
  });
}

function populateContactData() {
  const profile = barberProfile || (siteConfig ? {
    formattedPhone: siteConfig.contactPhone,
    phone: siteConfig.contactPhone.replace(/\D/g, ''),
    instagram: siteConfig.contactInstagram,
    instagramUrl: `https://instagram.com/${siteConfig.contactInstagram.replace('@', '')}`,
    mapsUrl: siteConfig.contactMapsUrl
  } : null);
  
  if (!profile) return;

  document.querySelectorAll('[data-real-phone]').forEach(el => {
    el.textContent = profile.formattedPhone;
    if (el.tagName === 'A') el.href = `tel:+351${String(profile.phone).replace(/\D/g, '').slice(-9)}`;
  });

  document.querySelectorAll('[data-real-instagram]').forEach(el => {
    // Mantém o ícone: só troca o texto
    const label = el.querySelector('span') || el;
    label.textContent = profile.instagram;
    if (el.tagName === 'A') el.href = profile.instagramUrl;
  });

  document.querySelectorAll('[data-real-maps]').forEach(el => {
    if (el.tagName === 'A') el.href = profile.mapsUrl;
  });

  // Update Google Maps iframe if siteConfig has embed URL
  if (siteConfig?.contactMapsEmbedUrl) {
    const mapsIframe = document.querySelector('.map-visual iframe');
    if (mapsIframe) {
      mapsIframe.src = siteConfig.contactMapsEmbedUrl;
    }
  }

  // Horário definido pelo barbeiro no painel
  scheduleService.getSchedule().then(schedule => {
    const list = document.querySelector('.schedule-list');
    if (!list) return;
    list.innerHTML = summarizeWeek(schedule.hours).map(g =>
      `<li><span>${g.label}</span> <strong${g.closed ? ' class="schedule-closed"' : ''}>${g.text}</strong></li>`
    ).join('');
  });

  // Update barber portrait and specialties from barberProfile or siteConfig
  const portraitImg = document.getElementById('barber-portrait-img');
  const photoUrl = barberProfile?.photoUrl || siteConfig?.aboutPortraitImage;
  if (portraitImg && photoUrl) {
    portraitImg.src = photoUrl;
    portraitImg.alt = `${barberProfile?.name || 'Rui'} - Barbeiro e Fundador do Atelier`;
  }
  
  if (barberProfile) {
    const specialty1 = document.getElementById('barber-specialty-1');
    const specialty2 = document.getElementById('barber-specialty-2');
    if (specialty1 && barberProfile.specialties?.[0]) {
      specialty1.textContent = barberProfile.specialties[0];
    }
    if (specialty2 && barberProfile.specialties?.[1]) {
      specialty2.textContent = barberProfile.specialties[1];
    }
  }
}

/**
 * Ecrã ampliado: as fotos são cartas lado a lado que se deslizam com o dedo
 * (ou com as setas). Inclui todas as fotos, não só as que estão na página.
 */
function scrollLightboxTo(index, smooth = true) {
  const track = document.getElementById('lightbox-track');
  const slide = track?.children[index];
  if (!slide) return;
  const left = slide.offsetLeft - (track.clientWidth - slide.offsetWidth) / 2;
  track.scrollTo({ left, behavior: smooth ? 'smooth' : 'auto' });
}

function setLightboxCurrent(index) {
  const track = document.getElementById('lightbox-track');
  const counter = document.getElementById('lightbox-counter');
  const dots = document.getElementById('lightbox-dots');
  if (!track) return;

  lightboxIndex = index;
  [...track.children].forEach((slide, i) => slide.classList.toggle('is-current', i === index));
  if (counter) counter.textContent = `${index + 1} / ${lightboxItems.length}`;
  if (dots) [...dots.children].forEach((dot, i) => dot.classList.toggle('is-current', i === index));

  document.getElementById('lightbox-prev')?.toggleAttribute('disabled', index === 0);
  document.getElementById('lightbox-next')?.toggleAttribute('disabled', index === lightboxItems.length - 1);
}

function openLightbox(index = 0) {
  const modal = document.getElementById('lightbox-modal');
  const track = document.getElementById('lightbox-track');
  const dots = document.getElementById('lightbox-dots');
  if (!modal || !track) return;

  lightboxItems = getFilteredGallery();
  if (lightboxItems.length === 0) return;
  const start = Math.min(Math.max(index, 0), lightboxItems.length - 1);

  track.innerHTML = lightboxItems.map((item, i) => `
    <figure class="lb-slide">
      <div class="lb-card">
        <img src="${escapeHtml(item.imageUrl)}" alt="${escapeHtml(item.title)}" class="lb-img" ${Math.abs(i - start) > 1 ? 'loading="lazy"' : ''} draggable="false">
        <figcaption class="lb-caption">
          <span class="mono-tag mono-tag--gold">${String(i + 1).padStart(2, '0')} · ${escapeHtml(item.categoryLabel || (item.category || '').toUpperCase())}</span>
          <h3 class="lightbox-title">${escapeHtml(item.title)}</h3>
          ${item.description && item.description !== item.title ? `<p class="lightbox-desc">${escapeHtml(item.description)}</p>` : ''}
        </figcaption>
      </div>
    </figure>
  `).join('');

  if (dots) {
    dots.innerHTML = lightboxItems.length > 1 && lightboxItems.length <= 12
      ? lightboxItems.map(() => '<span></span>').join('')
      : '';
  }

  modal.classList.toggle('lb-single', lightboxItems.length === 1);
  modal.classList.add('is-active');
  modal.setAttribute('aria-hidden', 'false');
  document.body.style.overflow = 'hidden';

  scrollLightboxTo(start, false);
  setLightboxCurrent(start);

  // Dica de utilização: uma vez por página aberta e, no mesmo dispositivo, uma vez por semana
  if (!lightboxHintShown && lightboxItems.length > 1) {
    lightboxHintShown = true;
    Toast.ambient('Desliza para os lados para veres mais cortes.', 'info', { key: 'gallery_swipe', cooldownHours: 24 * 7 });
  }
}

function closeLightbox() {
  const modal = document.getElementById('lightbox-modal');
  if (!modal) return;
  modal.classList.remove('is-active');
  modal.setAttribute('aria-hidden', 'true');
  document.body.style.overflow = '';
}

function initLightbox() {
  const modal = document.getElementById('lightbox-modal');
  const track = document.getElementById('lightbox-track');
  if (!modal || !track) return;

  // Abrir a partir de uma foto da página
  document.addEventListener('click', (e) => {
    const wrap = e.target.closest('.mag-item__img-wrap');
    if (!wrap) return;
    const fig = wrap.closest('.mag-item');
    openLightbox(Number(fig?.getAttribute('data-index')) || 0);
  });

  // A carta mais próxima do centro passa a ser a atual
  let ticking = false;
  track.addEventListener('scroll', () => {
    if (ticking) return;
    ticking = true;
    requestAnimationFrame(() => {
      ticking = false;
      const center = track.scrollLeft + track.clientWidth / 2;
      let best = 0;
      let bestDist = Infinity;
      [...track.children].forEach((slide, i) => {
        const dist = Math.abs(slide.offsetLeft + slide.offsetWidth / 2 - center);
        if (dist < bestDist) { bestDist = dist; best = i; }
      });
      if (best !== lightboxIndex) setLightboxCurrent(best);
    });
  }, { passive: true });

  document.getElementById('lightbox-prev')?.addEventListener('click', () => scrollLightboxTo(lightboxIndex - 1));
  document.getElementById('lightbox-next')?.addEventListener('click', () => scrollLightboxTo(lightboxIndex + 1));
  document.getElementById('lightbox-close')?.addEventListener('click', closeLightbox);

  // Tocar fora das cartas fecha; tocar numa carta ao lado traz-a para o centro
  track.addEventListener('click', (e) => {
    const slide = e.target.closest('.lb-slide');
    if (!e.target.closest('.lb-card')) { closeLightbox(); return; }
    const i = [...track.children].indexOf(slide);
    if (i !== lightboxIndex) scrollLightboxTo(i);
  });

  document.addEventListener('keydown', (e) => {
    if (!modal.classList.contains('is-active')) return;
    if (e.key === 'Escape') closeLightbox();
    if (e.key === 'ArrowLeft') scrollLightboxTo(lightboxIndex - 1);
    if (e.key === 'ArrowRight') scrollLightboxTo(lightboxIndex + 1);
  });
}

function initScrollReveal() {
  const elements = document.querySelectorAll(
    '.pillar-item, .service-row, .mag-item, .contact-card, .about-quote-box'
  );
  elements.forEach(el => el.classList.add('reveal-on-scroll'));

  if ('IntersectionObserver' in window) {
    const observer = new IntersectionObserver((entries, obs) => {
      entries.forEach(entry => {
        if (entry.isIntersecting) {
          entry.target.classList.add('is-revealed');
          obs.unobserve(entry.target);
        }
      });
    }, { rootMargin: '0px 0px -40px 0px', threshold: 0.1 });
    elements.forEach(el => observer.observe(el));
  } else {
    elements.forEach(el => el.classList.add('is-revealed'));
  }
}

function initGoogleMaps() {
  const mapVisual = document.getElementById('map-visual');
  const mapIframe = document.getElementById('map-iframe');
  const mapLoading = mapVisual?.querySelector('.map-loading');
  const mapOpenLink = document.getElementById('map-open-link');

  if (!mapVisual || !mapIframe) return;

  // Use siteConfig embed URL or fallback to barberProfile or default
  let embedUrl = siteConfig?.contactMapsEmbedUrl;
  let mapsUrl = siteConfig?.contactMapsUrl || barberProfile?.mapsUrl || 'https://www.google.com/maps/search/Madeira,+Portugal';

  // If no embed URL, construct one from coordinates
  if (!embedUrl && barberProfile?.latitude && barberProfile?.longitude) {
    embedUrl = `https://www.google.com/maps/embed?pb=!1m18!1m12!1m3!1d3153.0!2d${barberProfile.longitude}!3d${barberProfile.latitude}!2m3!1f0!2f0!3f0!3m2!1i1024!2i768!4f13.1!3m3!1m2!1s0x0%3A0x0!2zMzPCsDQ0JzUyLjgiUyAxNsKwMDInMzQuOCJX!5e0!3m2!1spt-PT!2spt!4v${Date.now()}!5m2!1spt-PT!2spt`;
  } else if (!embedUrl) {
    // Localização do atelier (mesmas coordenadas do link "Abrir no Google Maps")
    embedUrl = 'https://www.google.com/maps?q=32.6537836,-16.9103331&z=16&hl=pt-PT&output=embed';
  }

  // Update open link
  if (mapOpenLink) {
    mapOpenLink.href = mapsUrl;
  }

  // Load iframe when visible (lazy load)
  if ('IntersectionObserver' in window) {
    const mapObserver = new IntersectionObserver((entries, obs) => {
      entries.forEach(entry => {
        if (entry.isIntersecting) {
          mapIframe.src = embedUrl;
          mapIframe.style.display = 'block';
          mapIframe.style.filter = 'grayscale(100%) contrast(1.1) invert(90%) hue-rotate(180deg)';
          if (mapLoading) mapLoading.style.display = 'none';
          obs.unobserve(entry.target);
        }
      });
    }, { rootMargin: '100px', threshold: 0.1 });
    mapObserver.observe(mapVisual);
  } else {
    // Fallback: load immediately
    mapIframe.src = embedUrl;
    mapIframe.style.display = 'block';
    mapIframe.style.filter = 'grayscale(100%) contrast(1.1) invert(90%) hue-rotate(180deg)';
    if (mapLoading) mapLoading.style.display = 'none';
  }
}