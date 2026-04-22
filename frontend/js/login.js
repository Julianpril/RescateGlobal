const tabs = document.querySelectorAll('.tab');
const generalFields = document.getElementById('general-fields');
const volunteerFields = document.getElementById('volunteer-fields');
const submitBtn = document.getElementById('submit-btn');

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

document.getElementById('login-form').addEventListener('submit', (event) => {
  event.preventDefault();
  const activeMode = document.querySelector('.tab.is-active')?.dataset.role;

  if (activeMode === 'general') {
    alert('Acceso de usuario general enviado.');
    return;
  }

  alert('Inicio de sesion de voluntario enviado.');
});

setMode('general');
