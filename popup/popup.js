/**
 * SignX - Action Popup Script
 */

document.addEventListener('DOMContentLoaded', () => {
  const openSidePanelBtn = document.getElementById('open-sidepanel-action');
  const toggleFloatingOverlayBtn = document.getElementById('toggle-floating-overlay-action');

  openSidePanelBtn?.addEventListener('click', async () => {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    if (tab?.id && chrome.sidePanel?.open) {
      await chrome.sidePanel.open({ tabId: tab.id });
      window.close();
    }
  });

  toggleFloatingOverlayBtn?.addEventListener('click', async () => {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    if (tab?.id) {
      await chrome.tabs.sendMessage(tab.id, { type: 'SIGNX_TOGGLE_FLOATING_AVATAR' });
      window.close();
    }
  });
});
