/**
 * SignX - Safe Clipboard & Toast Feedback Utility
 */

export async function copyToClipboard(text, targetButton = null) {
  if (!text || text.trim() === '') {
    showToast('No text available to copy', 'warning');
    return false;
  }

  try {
    if (navigator.clipboard && window.isSecureContext) {
      await navigator.clipboard.writeText(text);
    } else {
      // Fallback for older contexts or iframe sandboxes
      const textarea = document.createElement('textarea');
      textarea.value = text;
      textarea.style.position = 'fixed';
      textarea.style.opacity = '0';
      document.body.appendChild(textarea);
      textarea.focus();
      textarea.select();
      document.execCommand('copy');
      document.body.removeChild(textarea);
    }

    if (targetButton) {
      animateButtonSuccess(targetButton);
    }
    showToast('Copied to clipboard!', 'success');
    return true;
  } catch (err) {
    console.error('Clipboard copy failed:', err);
    showToast('Failed to copy text', 'error');
    return false;
  }
}

export function animateButtonSuccess(btn) {
  if (!btn) return;
  const originalHtml = btn.innerHTML;
  btn.classList.add('btn-success-state');
  btn.innerHTML = `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><polyline points="20 6 9 17 4 12"></polyline></svg> Copied!`;
  
  setTimeout(() => {
    btn.innerHTML = originalHtml;
    btn.classList.remove('btn-success-state');
  }, 1800);
}

export function showToast(message, type = 'info', durationMs = 2600) {
  let container = document.getElementById('signx-toast-container');
  if (!container) {
    container = document.createElement('div');
    container.id = 'signx-toast-container';
    container.className = 'signx-toast-container';
    document.body.appendChild(container);
  }

  const toast = document.createElement('div');
  toast.className = `signx-toast signx-toast-${type}`;
  
  const icons = {
    success: '✓',
    warning: '⚠',
    error: '✖',
    info: 'ℹ'
  };

  toast.innerHTML = `
    <span class="signx-toast-icon">${icons[type] || 'ℹ'}</span>
    <span class="signx-toast-text">${escapeHtml(message)}</span>
  `;

  container.appendChild(toast);

  // Trigger animation
  requestAnimationFrame(() => {
    toast.classList.add('visible');
  });

  setTimeout(() => {
    toast.classList.remove('visible');
    toast.addEventListener('transitionend', () => toast.remove());
  }, durationMs);
}

function escapeHtml(str) {
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}
