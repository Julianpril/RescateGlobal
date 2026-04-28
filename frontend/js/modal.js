const RGModal = (() => {
  let overlay = null;
  let currentResolve = null;

  function getOverlay() {
    if (overlay) return overlay;
    overlay = document.createElement('div');
    overlay.className = 'rg-overlay';
    document.body.appendChild(overlay);
    overlay.addEventListener('click', e => {
      if (e.target === overlay) dismiss(null);
    });
    document.addEventListener('keydown', e => {
      if (e.key === 'Escape' && overlay.classList.contains('rg-overlay--open')) dismiss(null);
    });
    return overlay;
  }

  function dismiss(value) {
    const ov = getOverlay();
    ov.classList.remove('rg-overlay--open');
    ov.querySelector('.rg-modal')?.classList.remove('rg-modal--in');
    if (currentResolve) currentResolve(value);
    currentResolve = null;
  }

  function show(modalEl) {
    const ov = getOverlay();
    ov.innerHTML = '';
    ov.appendChild(modalEl);
    requestAnimationFrame(() => {
      ov.classList.add('rg-overlay--open');
      requestAnimationFrame(() => modalEl.classList.add('rg-modal--in'));
    });
    const firstInput = modalEl.querySelector('input');
    if (firstInput) setTimeout(() => { firstInput.focus(); firstInput.select(); }, 120);
  }

  function confirm(message) {
    return new Promise(res => {
      currentResolve = res;
      const el = document.createElement('div');
      el.className = 'rg-modal';
      el.innerHTML = `
        <div class="rg-modal__header rg-modal__header--danger">
          <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><path d="M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg>
          <h3>Confirmar acción</h3>
        </div>
        <p class="rg-modal__msg">${message}</p>
        <div class="rg-modal__footer">
          <button class="rg-btn rg-btn--ghost" data-cancel>Cancelar</button>
          <button class="rg-btn rg-btn--danger" data-ok>Confirmar</button>
        </div>`;
      el.querySelector('[data-cancel]').onclick = () => dismiss(false);
      el.querySelector('[data-ok]').onclick = () => dismiss(true);
      show(el);
    });
  }

  function openEmergencyForm(defaultLocation = '') {
    return new Promise(res => {
      currentResolve = res;
      const el = document.createElement('div');
      el.className = 'rg-modal rg-modal--wide';
      el.innerHTML = `
        <div class="rg-modal__header rg-modal__header--danger">
          <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>
          <h3>ABRIR EMERGENCIA</h3>
        </div>
        <div class="rg-modal__body">
          <label class="rg-label">Nombre de la emergencia <span class="rg-required">*</span></label>
          <input class="rg-input" id="rg-em-title" type="text" placeholder="Ej: Incendio estructural" autocomplete="off" />

          <label class="rg-label">Ubicación (barrio / sector)</label>
          <input class="rg-input" id="rg-em-loc" type="text" placeholder="Ej: Barrio Centro" value="${defaultLocation}" autocomplete="off" />

          <label class="rg-label">Descripción breve</label>
          <input class="rg-input" id="rg-em-desc" type="text" placeholder="Activada por coordinador" value="Activada por coordinador" autocomplete="off" />
        </div>
        <div class="rg-modal__footer">
          <button class="rg-btn rg-btn--ghost" data-cancel>Cancelar</button>
          <button class="rg-btn rg-btn--danger" data-ok>ABRIR EMERGENCIA</button>
        </div>`;
      const titleEl = el.querySelector('#rg-em-title');
      const locEl = el.querySelector('#rg-em-loc');
      const descEl = el.querySelector('#rg-em-desc');
      el.querySelector('[data-cancel]').onclick = () => dismiss(null);
      el.querySelector('[data-ok]').onclick = () => {
        const title = titleEl.value.trim();
        if (!title) { titleEl.focus(); titleEl.classList.add('rg-input--err'); return; }
        dismiss({ title, location: locEl.value.trim(), description: descEl.value.trim() || 'Activada por coordinador' });
      };
      titleEl.addEventListener('input', () => titleEl.classList.remove('rg-input--err'));
      titleEl.addEventListener('keydown', e => { if (e.key === 'Enter') el.querySelector('[data-ok]').click(); });
      show(el);
    });
  }

  function alertPrompt() {
    return new Promise(res => {
      currentResolve = res;
      const el = document.createElement('div');
      el.className = 'rg-modal';
      el.innerHTML = `
        <div class="rg-modal__header rg-modal__header--warn">
          <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><path d="M22 16.92V19a2 2 0 01-2.18 2 19.79 19.79 0 01-8.63-3.07A19.5 19.5 0 013.07 8.81 19.79 19.79 0 01.01 4.18 2 2 0 012 2h2.09a2 2 0 012 1.72c.127.96.361 1.903.7 2.81a2 2 0 01-.45 2.11L5.09 9.91a16 16 0 006 6l1.27-1.27a2 2 0 012.11-.45c.907.339 1.85.573 2.81.7A2 2 0 0122 16.92z"/></svg>
          <h3>Enviar Alerta Crítica</h3>
        </div>
        <p class="rg-modal__hint">Se enviará a todos los voluntarios conectados</p>
        <div class="rg-modal__body">
          <input class="rg-input" type="text" value="ALERTA: " autocomplete="off" />
        </div>
        <div class="rg-modal__footer">
          <button class="rg-btn rg-btn--ghost" data-cancel>Cancelar</button>
          <button class="rg-btn rg-btn--warn" data-ok>Enviar Alerta</button>
        </div>`;
      const input = el.querySelector('input');
      el.querySelector('[data-cancel]').onclick = () => dismiss(null);
      el.querySelector('[data-ok]').onclick = () => {
        const v = input.value.trim();
        dismiss(v || null);
      };
      input.addEventListener('keydown', e => { if (e.key === 'Enter') el.querySelector('[data-ok]').click(); });
      show(el);
      setTimeout(() => { input.focus(); input.setSelectionRange(input.value.length, input.value.length); }, 120);
    });
  }

  return { confirm, openEmergencyForm, alertPrompt };
})();
