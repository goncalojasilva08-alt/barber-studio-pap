/**
 * Barber Studio — Ecrã de carregamento
 * Aparece na primeira visita e nas mudanças entre páginas diferentes
 * (nunca em âncoras da mesma página). Sai com um esbatimento suave.
 */

(function () {
  const style = document.createElement('style');
  style.textContent = `
    #barberstudio-loader-screen {
      position: fixed;
      inset: 0;
      background: #0C0C0C;
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: center;
      gap: 1.5rem;
      z-index: 99999;
      opacity: 1;
      visibility: visible;
      transition: opacity 420ms cubic-bezier(0.16, 1, 0.3, 1), visibility 420ms ease;
      pointer-events: all;
    }

    #barberstudio-loader-screen.is-hidden {
      opacity: 0;
      visibility: hidden;
      pointer-events: none;
    }

    /* Logótipo dentro de um anel fino que se desenha em volta */
    .barberstudio-loader-mark {
      position: relative;
      width: 96px;
      height: 96px;
      display: flex;
      align-items: center;
      justify-content: center;
      transition: transform 420ms cubic-bezier(0.16, 1, 0.3, 1);
    }

    #barberstudio-loader-screen.is-hidden .barberstudio-loader-mark {
      transform: scale(1.08);
    }

    .barberstudio-loader-ring {
      position: absolute;
      inset: 0;
      width: 100%;
      height: 100%;
      transform: rotate(-90deg);
    }

    .barberstudio-loader-ring circle {
      fill: none;
      stroke-width: 1.5;
    }

    .barberstudio-loader-ring__track {
      stroke: rgba(255, 255, 255, 0.07);
    }

    .barberstudio-loader-ring__arc {
      stroke: var(--color-gold, #C9A227);
      stroke-linecap: round;
      stroke-dasharray: 289;
      stroke-dashoffset: 289;
      transform-origin: center;
      animation: barberstudioLoaderArc 1.5s cubic-bezier(0.65, 0, 0.35, 1) infinite;
    }

    .barberstudio-loader-logo {
      width: 52px;
      height: 52px;
      object-fit: contain;
      opacity: 0;
      animation: barberstudioLoaderLogoIn 600ms cubic-bezier(0.16, 1, 0.3, 1) 80ms forwards;
    }

    .barberstudio-loader-name {
      display: flex;
      flex-direction: column;
      align-items: center;
      gap: 0.35rem;
      opacity: 0;
      animation: barberstudioLoaderTextIn 600ms cubic-bezier(0.16, 1, 0.3, 1) 220ms forwards;
    }

    .barberstudio-loader-name strong {
      font-family: 'Inter', -apple-system, 'Segoe UI', sans-serif;
      font-size: 1rem;
      font-weight: 800;
      letter-spacing: 0.42em;
      margin-right: -0.42em;
      color: #ffffff;
    }

    .barberstudio-loader-name span {
      font-family: 'JetBrains Mono', Consolas, monospace;
      font-size: 0.5625rem;
      letter-spacing: 0.3em;
      margin-right: -0.3em;
      color: var(--color-gold, #C9A227);
    }

    @keyframes barberstudioLoaderArc {
      0% { stroke-dashoffset: 289; transform: rotate(0deg); }
      50% { stroke-dashoffset: 72; transform: rotate(120deg); }
      100% { stroke-dashoffset: 289; transform: rotate(360deg); }
    }

    @keyframes barberstudioLoaderLogoIn {
      from { opacity: 0; transform: scale(0.82); }
      to { opacity: 1; transform: scale(1); }
    }

    @keyframes barberstudioLoaderTextIn {
      from { opacity: 0; transform: translateY(8px); }
      to { opacity: 1; transform: translateY(0); }
    }

    @media (prefers-reduced-motion: reduce) {
      .barberstudio-loader-ring__arc { animation: none; stroke-dashoffset: 72; }
      .barberstudio-loader-logo, .barberstudio-loader-name { animation: none; opacity: 1; }
      #barberstudio-loader-screen, .barberstudio-loader-mark { transition-duration: 1ms; }
    }
  `;
  document.head.appendChild(style);

  let isTransition = false;
  let isFirstVisit = false;
  try {
    isTransition = sessionStorage.getItem('barberstudio_transition') === 'true';
    sessionStorage.removeItem('barberstudio_transition');
    isFirstVisit = !sessionStorage.getItem('barberstudio_seen');
    sessionStorage.setItem('barberstudio_seen', 'true');
  } catch (err) {
    // Sem sessionStorage (modo privado restrito): não mostra o ecrã
  }

  if (isTransition || isFirstVisit) {
    const loader = document.createElement('div');
    loader.id = 'barberstudio-loader-screen';
    loader.setAttribute('aria-hidden', 'true');
    loader.innerHTML = `
      <div class="barberstudio-loader-mark">
        <svg class="barberstudio-loader-ring" viewBox="0 0 96 96">
          <circle class="barberstudio-loader-ring__track" cx="48" cy="48" r="46"></circle>
          <circle class="barberstudio-loader-ring__arc" cx="48" cy="48" r="46"></circle>
        </svg>
        <img src="./assets/logo-192.webp" alt="" class="barberstudio-loader-logo">
      </div>
      <div class="barberstudio-loader-name">
        <strong>BARBER STUDIO</strong>
        <span>SOLO BARBER</span>
      </div>
    `;
    document.body.appendChild(loader);

    // Fica visível o tempo suficiente para se ler, mas nunca prende a página
    const shownAt = performance.now();
    const MIN_VISIBLE = isFirstVisit ? 700 : 350;
    let finished = false;

    const finish = () => {
      if (finished) return;
      finished = true;
      const wait = Math.max(0, MIN_VISIBLE - (performance.now() - shownAt));
      setTimeout(() => {
        loader.classList.add('is-hidden');
        setTimeout(() => loader.remove(), 450);
      }, wait);
    };

    if (document.readyState === 'complete') {
      finish();
    } else {
      window.addEventListener('load', finish);
      setTimeout(finish, 1500); // Limite de segurança
    }
  }

  // Marca as mudanças para outra página do site
  document.addEventListener('click', (e) => {
    const link = e.target.closest('a');
    if (!link || !link.href) return;

    // Ignorar links externos, telefone ou nova aba
    if (link.target === '_blank' || link.href.startsWith('tel:') || link.href.startsWith('mailto:')) return;

    try {
      const url = new URL(link.href, window.location.href);

      if (url.origin === window.location.origin) {
        const currentPath = window.location.pathname.replace(/\/index\.html$/, '/');
        const targetPath = url.pathname.replace(/\/index\.html$/, '/');

        // Âncoras da mesma página (#servicos, etc.) nunca mostram o ecrã
        if (currentPath === targetPath) return;

        sessionStorage.setItem('barberstudio_transition', 'true');
      }
    } catch (err) {
      // Ignorar erros de URL
    }
  });
})();
