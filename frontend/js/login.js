const tabs = document.querySelectorAll('.tab');
const generalFields = document.getElementById('general-fields');
const volunteerFields = document.getElementById('volunteer-fields');
const submitBtn = document.getElementById('submit-btn');
const feedback = document.getElementById('login-feedback');
const loginForm = document.getElementById('login-form');

const API_BASE_URL = `${window.location.origin}/api`;

async function hydrateGoogleSessionFromQuery() {
  const currentUrl = new URL(window.location.href);
  const token = currentUrl.searchParams.get('sessionToken');
  const googleError = currentUrl.searchParams.get('googleError');

  if (googleError) {
    showFeedback(decodeURIComponent(googleError));
    currentUrl.searchParams.delete('googleError');
    window.history.replaceState({}, '', currentUrl.toString());
    return;
  }

  if (!token) return;

  try {
    const response = await fetch(`${API_BASE_URL}/auth/session?token=${encodeURIComponent(token)}`);
    const result = await response.json();

    if (!response.ok || !result.ok) {
      throw new Error(result.message || 'No fue posible recuperar la sesion de Google.');
    }

    localStorage.setItem('rgSession', JSON.stringify({
      token: result.token,
      user: result.user,
    }));

    currentUrl.searchParams.delete('sessionToken');
    window.history.replaceState({}, '', currentUrl.toString());
    const isMobileGoogle = window.matchMedia('(max-width: 768px)').matches;
    window.location.href = isMobileGoogle ? './canal-mobile.html' : './canal.html';
  } catch (error) {
    showFeedback(error.message || 'No fue posible iniciar con Google.');
  }
}

function setMode(mode) {
  const isGeneral = mode === 'general';

  tabs.forEach((tab) => {
    const selected = tab.dataset.role === mode;
    tab.classList.toggle('is-active', selected);
    tab.setAttribute('aria-selected', String(selected));
  });

  generalFields.classList.toggle('is-visible', isGeneral);
  volunteerFields.classList.toggle('is-visible', !isGeneral);

  generalFields.querySelectorAll('input, select').forEach((field) => {
    field.required = isGeneral;
  });
  volunteerFields.querySelectorAll('input').forEach((input) => {
    input.required = !isGeneral;
  });

  submitBtn.textContent = isGeneral ? 'UNIRSE AL CANAL GLOBAL' : 'INICIAR SESION';
}

tabs.forEach((tab) => {
  tab.addEventListener('click', () => setMode(tab.dataset.role));
});

function showFeedback(message, isOk = false) {
  feedback.textContent = message;
  feedback.classList.toggle('ok', isOk);
}

loginForm.addEventListener('submit', async (event) => {
  event.preventDefault();
  const activeMode = document.querySelector('.tab.is-active')?.dataset.role;
  const formData = new FormData(loginForm);

  const payload = {
    role: activeMode,
  };

  if (activeMode === 'general') {
    payload.nombre = String(formData.get('nombre') || '').trim();
    payload.ubicacion = String(formData.get('ubicacion') || '').trim();
  } else {
    payload.usuario = String(formData.get('usuario') || '').trim();
    payload.contrasena = String(formData.get('contrasena') || '').trim();
  }

  showFeedback('Validando credenciales...');

  try {
    const response = await fetch(`${API_BASE_URL}/auth/login`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(payload),
    });

    const result = await response.json();

    if (!response.ok || !result.ok) {
      showFeedback(result.message || 'No fue posible iniciar sesion.');
      return;
    }

    localStorage.setItem('rgSession', JSON.stringify({
      token: result.token,
      user: result.user,
    }));

    showFeedback(`Bienvenido/a ${result.user.displayName}.`, true);

    const isMobile = window.matchMedia('(max-width: 768px)').matches;

    if (result.user.role === 'coordinador') {
      window.location.href = isMobile ? './coordinador-mobile.html' : './coordinador.html';
      return;
    }

    window.location.href = isMobile ? './canal-mobile.html' : './canal.html';
  } catch (error) {
    showFeedback('No hay conexion con el servidor.');
  }
});

document.querySelector('.btn-google')?.addEventListener('click', () => {
  showFeedback('Redirigiendo a Google...');
  window.location.href = `${API_BASE_URL}/auth/google`;
});

setMode('general');
hydrateGoogleSessionFromQuery();
