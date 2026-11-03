/**
 * SignX - Full Settings Page Controller
 */

import { storageService } from '../services/storage-service.js';

document.addEventListener('DOMContentLoaded', async () => {
  await storageService.init();
  const cfg = await storageService.getAll();

  const endpointInput = document.getElementById('page-ollama-endpoint');
  const modelInput = document.getElementById('page-ollama-model');
  const keyInput = document.getElementById('page-ollama-key');
  const toggleKeyBtn = document.getElementById('page-toggle-key-visibility');
  const dialectSelect = document.getElementById('page-isl-dialect');
  const sovCheck = document.getElementById('page-sov-convert');
  const autoCopyCheck = document.getElementById('page-auto-copy');
  const highContrastCheck = document.getElementById('page-high-contrast');
  const saveBtn = document.getElementById('page-save-settings-btn');
  const resetBtn = document.getElementById('page-reset-settings-btn');
  const statusMsg = document.getElementById('save-status-msg');

  // Populate existing settings
  endpointInput.value = cfg.ollama?.endpoint || '';
  modelInput.value = cfg.ollama?.model || '';
  keyInput.value = cfg.ollama?.apiKey || '';
  dialectSelect.value = cfg.isl?.dialect || 'standard-isl';
  sovCheck.checked = Boolean(cfg.isl?.sovGrammarConversion ?? true);
  autoCopyCheck.checked = Boolean(cfg.recognition?.autoCopyOnComplete);
  highContrastCheck.checked = Boolean(cfg.ui?.highContrast);

  toggleKeyBtn?.addEventListener('click', () => {
    if (keyInput.type === 'password') {
      keyInput.type = 'text';
      toggleKeyBtn.textContent = 'Hide';
    } else {
      keyInput.type = 'password';
      toggleKeyBtn.textContent = 'Show';
    }
  });

  saveBtn?.addEventListener('click', async () => {
    const updated = {
      ollama: {
        endpoint: endpointInput.value.trim(),
        model: modelInput.value.trim(),
        apiKey: keyInput.value.trim()
      },
      isl: {
        dialect: dialectSelect.value,
        sovGrammarConversion: sovCheck.checked
      },
      recognition: {
        autoCopyOnComplete: autoCopyCheck.checked
      },
      ui: {
        highContrast: highContrastCheck.checked
      }
    };

    await storageService.set('ollama', updated.ollama);
    await storageService.set('isl', updated.isl);
    await storageService.set('recognition', { ...storageService.cache?.recognition, ...updated.recognition });
    await storageService.set('ui', { ...storageService.cache?.ui, ...updated.ui });

    statusMsg.textContent = '✓ Settings saved successfully!';
    setTimeout(() => { statusMsg.textContent = ''; }, 3000);
  });

  resetBtn?.addEventListener('click', async () => {
    await storageService.resetToDefaults();
    statusMsg.textContent = '✓ Preferences restored to defaults.';
    setTimeout(() => { window.location.reload(); }, 800);
  });
});
