/**
 * Barber Studio — Ajuste de fotografia antes do envio
 * Mostra a foto dentro de uma moldura com a proporção certa; o barbeiro arrasta
 * e aproxima até ficar como quer, e só essa parte é enviada (já redimensionada).
 */

const MAX_ZOOM = 3;

/**
 * @param {File|Blob} file
 * @param {Object} [options]
 * @param {number} [options.aspect=0.8]        Largura / altura da moldura (0.8 = 4:5)
 * @param {number} [options.outputWidth=1200]  Largura máxima da imagem final, em píxeis
 * @param {string} [options.title]
 * @param {boolean} [options.showSafeZone]     Mostra a zona que aparece nos mosaicos da página
 * @returns {Promise<File|null>} A imagem recortada, ou null se o utilizador cancelar
 */
export function openCropper(file, { aspect = 0.8, outputWidth = 1200, title = 'AJUSTAR FOTOGRAFIA', showSafeZone = false } = {}) {
  return new Promise((resolve) => {
    const url = URL.createObjectURL(file);
    const img = new Image();

    img.onerror = () => {
      URL.revokeObjectURL(url);
      resolve(null);
    };

    img.onload = () => {
      const modal = document.createElement('div');
      modal.className = 'modal-backdrop cropper-modal';
      modal.setAttribute('role', 'dialog');
      modal.setAttribute('aria-label', title);
      modal.innerHTML = `
        <div class="modal-card cropper-card">
          <div class="modal-header">
            <h2 class="modal-title">${title}</h2>
          </div>
          <p class="cropper-hint">Arrasta a foto para a posicionar e usa a barra para aproximar.</p>

          <div class="cropper-frame" style="aspect-ratio: ${aspect}; width: min(100%, calc(52vh * ${aspect}));">
            <img class="cropper-img" alt="" draggable="false">
            ${showSafeZone ? '<div class="cropper-safe"><span>SEMPRE VISÍVEL NA PÁGINA</span></div>' : ''}
          </div>

          <label class="cropper-zoom">
            <svg class="icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><circle cx="11" cy="11" r="7"/><line x1="21" x2="16.5" y1="21" y2="16.5"/><line x1="8" x2="14" y1="11" y2="11"/></svg>
            <input type="range" min="1" max="${MAX_ZOOM}" step="0.01" value="1" aria-label="Aproximar">
            <svg class="icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><circle cx="11" cy="11" r="7"/><line x1="21" x2="16.5" y1="21" y2="16.5"/><line x1="8" x2="14" y1="11" y2="11"/><line x1="11" x2="11" y1="8" y2="14"/></svg>
          </label>

          <div class="cropper-actions">
            <button type="button" class="btn btn--outline" data-cropper-cancel>CANCELAR</button>
            <button type="button" class="btn btn--gold" data-cropper-ok>USAR ESTA FOTO</button>
          </div>
        </div>
      `;
      document.body.appendChild(modal);

      const frame = modal.querySelector('.cropper-frame');
      const view = modal.querySelector('.cropper-img');
      const slider = modal.querySelector('input[type="range"]');
      view.src = url;

      // Estado: deslocamento (x, y) da imagem dentro da moldura e nível de aproximação
      let zoom = 1;
      let x = 0;
      let y = 0;
      let base = 1;

      const frameSize = () => ({ w: frame.clientWidth, h: frame.clientHeight });

      function apply() {
        const { w, h } = frameSize();
        const scale = base * zoom;
        const dw = img.naturalWidth * scale;
        const dh = img.naturalHeight * scale;
        // A imagem tem de cobrir sempre a moldura toda
        x = Math.min(0, Math.max(w - dw, x));
        y = Math.min(0, Math.max(h - dh, y));
        view.style.width = `${dw}px`;
        view.style.height = `${dh}px`;
        view.style.transform = `translate3d(${x}px, ${y}px, 0)`;
      }

      function setZoom(next, originX, originY) {
        const { w, h } = frameSize();
        const ox = originX ?? w / 2;
        const oy = originY ?? h / 2;
        const clamped = Math.min(MAX_ZOOM, Math.max(1, next));
        // Mantém fixo o ponto por baixo do dedo / centro da moldura
        const ratio = clamped / zoom;
        x = ox - (ox - x) * ratio;
        y = oy - (oy - y) * ratio;
        zoom = clamped;
        slider.value = String(zoom);
        apply();
      }

      function init() {
        const { w, h } = frameSize();
        base = Math.max(w / img.naturalWidth, h / img.naturalHeight);
        zoom = 1;
        x = (w - img.naturalWidth * base) / 2;
        y = (h - img.naturalHeight * base) / 2;
        slider.value = '1';
        apply();
      }

      // Arrastar com um dedo/rato; aproximar com dois dedos
      const pointers = new Map();
      let pinchStart = null;

      frame.addEventListener('pointerdown', (e) => {
        frame.setPointerCapture(e.pointerId);
        pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
        if (pointers.size === 2) {
          const [a, b] = [...pointers.values()];
          pinchStart = { dist: Math.hypot(a.x - b.x, a.y - b.y), zoom };
        }
      });

      frame.addEventListener('pointermove', (e) => {
        const prev = pointers.get(e.pointerId);
        if (!prev) return;
        pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });

        if (pointers.size === 2 && pinchStart) {
          const [a, b] = [...pointers.values()];
          const rect = frame.getBoundingClientRect();
          const dist = Math.hypot(a.x - b.x, a.y - b.y);
          setZoom(pinchStart.zoom * (dist / pinchStart.dist), (a.x + b.x) / 2 - rect.left, (a.y + b.y) / 2 - rect.top);
        } else if (pointers.size === 1) {
          x += e.clientX - prev.x;
          y += e.clientY - prev.y;
          apply();
        }
      });

      const release = (e) => {
        pointers.delete(e.pointerId);
        if (pointers.size < 2) pinchStart = null;
      };
      frame.addEventListener('pointerup', release);
      frame.addEventListener('pointercancel', release);

      frame.addEventListener('wheel', (e) => {
        e.preventDefault();
        const rect = frame.getBoundingClientRect();
        setZoom(zoom * (e.deltaY < 0 ? 1.08 : 0.92), e.clientX - rect.left, e.clientY - rect.top);
      }, { passive: false });

      slider.addEventListener('input', () => setZoom(Number(slider.value)));

      const onResize = () => init();
      window.addEventListener('resize', onResize);

      function close(result) {
        window.removeEventListener('resize', onResize);
        modal.classList.remove('is-active');
        setTimeout(() => {
          modal.remove();
          URL.revokeObjectURL(url);
        }, 300);
        resolve(result);
      }

      modal.querySelector('[data-cropper-cancel]').addEventListener('click', () => close(null));

      modal.querySelector('[data-cropper-ok]').addEventListener('click', (e) => {
        const btn = e.currentTarget;
        btn.disabled = true;
        btn.textContent = 'A PREPARAR...';

        const { w, h } = frameSize();
        const scale = base * zoom;
        const sx = -x / scale;
        const sy = -y / scale;
        const sw = w / scale;
        const sh = h / scale;

        // Nunca aumenta a imagem para além da resolução original
        const outW = Math.round(Math.min(outputWidth, sw));
        const outH = Math.round(outW / aspect);

        const canvas = document.createElement('canvas');
        canvas.width = outW;
        canvas.height = outH;
        const ctx = canvas.getContext('2d');
        ctx.imageSmoothingQuality = 'high';
        ctx.drawImage(img, sx, sy, sw, sh, 0, 0, outW, outH);

        canvas.toBlob((blob) => {
          if (!blob) { close(null); return; }
          const baseName = (file.name || 'foto').replace(/\.[^.]+$/, '');
          close(new File([blob], `${baseName}.jpg`, { type: 'image/jpeg' }));
        }, 'image/jpeg', 0.88);
      });

      // Mostrar (com animação) e calcular o enquadramento inicial já com tamanhos reais
      requestAnimationFrame(() => {
        modal.classList.add('is-active');
        init();
      });
    };

    img.src = url;
  });
}
