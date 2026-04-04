// SPDX-License-Identifier: MIT
// Splash screen renderer logic — extracted from inline script for CSP compliance.

const stepTexts = {
  0: { active: 'Select project folder', done: 'Project selected' },
  1: { active: 'Starting Node.js runtime...', done: 'Runtime ready' },
  2: { active: 'Initializing server...', done: 'Server started' },
  3: { active: 'Loading dashboard...', done: 'Ready!' }
};

const pathInput = document.getElementById('pathInput');
const pathSelector = document.getElementById('pathSelector');
const btnBrowse = document.getElementById('btnBrowse');
const btnStart = document.getElementById('btnStart');
const pathError = document.getElementById('pathError');

let currentPath = '';

function updateStep(stepIndex, status) {
  const stepEl = document.querySelector(`[data-step="${stepIndex}"]`);
  if (!stepEl) return;

  stepEl.className = `step ${status}`;
  const iconEl = stepEl.querySelector('.step-icon');
  const textEl = stepEl.querySelector('.step-text');

  if (status === 'active') {
    iconEl.innerHTML = '<div class="spinner"></div>';
    textEl.textContent = stepTexts[stepIndex].active;
  } else if (status === 'done') {
    iconEl.innerHTML = '&#10003;';
    textEl.textContent = stepTexts[stepIndex].done;
  } else if (status === 'error') {
    iconEl.innerHTML = '&#10007;';
  } else if (status === 'pending') {
    iconEl.innerHTML = '';
    textEl.textContent = stepTexts[stepIndex].active;
  }
}

function hidePathSelector() {
  pathSelector.classList.add('hidden');
}

function showError(msg) {
  pathError.textContent = msg;
  pathError.classList.add('visible');
}

function hideError() {
  pathError.classList.remove('visible');
}

function setPath(p) {
  currentPath = p;
  pathInput.value = p;
  pathInput.title = p;
  hideError();
}

// Allow manual path entry — keep currentPath in sync as the user types
pathInput.addEventListener('input', () => {
  currentPath = pathInput.value.trim();
  hideError();
});

// Button handlers
btnBrowse.addEventListener('click', async () => {
  if (window.splashAPI && window.splashAPI.browseFolder) {
    const newPath = await window.splashAPI.browseFolder();
    if (newPath) {
      setPath(newPath);
    }
  }
});

btnStart.addEventListener('click', async () => {
  if (!currentPath) {
    showError('Please select a folder');
    return;
  }

  btnStart.disabled = true;
  btnStart.textContent = 'Starting...';

  if (window.splashAPI && window.splashAPI.confirmPath) {
    const result = await window.splashAPI.confirmPath(currentPath);
    if (result && result.error) {
      showError(result.error);
      btnStart.disabled = false;
      btnStart.textContent = 'Start';
    } else {
      // Path confirmed, hide selector - main process will update step to 'done'
      hidePathSelector();
    }
  }
});

// Listen for updates from main process
if (window.splashAPI) {
  window.splashAPI.onStepUpdate((event, data) => {
    updateStep(data.step, data.status);
  });

  window.splashAPI.onSetDefaultPath((event, defaultPath) => {
    setPath(defaultPath);
  });

  // Show version if available (getVersion returns a Promise via IPC)
  const versionEl = document.getElementById('version');
  if (window.splashAPI.getVersion) {
    window.splashAPI.getVersion().then((v) => {
      if (v) versionEl.textContent = 'v' + v;
    }).catch(() => {});
  }
}
