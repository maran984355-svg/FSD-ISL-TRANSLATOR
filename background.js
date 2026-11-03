/**
 * SignX - Background Service Worker (Manifest V3)
 * Handles side panel routing, tab events, and context menus.
 */

// Configure side panel behavior on installation
chrome.runtime.onInstalled.addListener(() => {
  console.log('[SignX Background] Extension installed/updated.');

  if (chrome.sidePanel?.setPanelBehavior) {
    chrome.sidePanel.setPanelBehavior({ openPanelOnActionClick: true })
      .catch(err => console.error('[SignX Background] Side panel error:', err));
  }

  // Create context menu for quick ISL translation of selected text
  if (chrome.contextMenus) {
    chrome.contextMenus.create({
      id: 'signx-translate-selection',
      title: 'Translate with SignX (ISL)',
      contexts: ['selection']
    });
  }
});

// Handle Context Menu click
if (chrome.contextMenus) {
  chrome.contextMenus.onClicked.addListener((info, tab) => {
    if (info.menuItemId === 'signx-translate-selection' && info.selectionText) {
      // Forward to active tab and sidepanel
      chrome.runtime.sendMessage({
        type: 'SIGNX_SELECTED_TEXT_DETECTED',
        payload: { text: info.selectionText }
      }).catch(() => {});
    }
  });
}

// Handle keyboard shortcuts
chrome.commands?.onCommand.addListener(async (command) => {
  if (command === 'open_side_panel') {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    if (tab?.id && chrome.sidePanel?.open) {
      chrome.sidePanel.open({ tabId: tab.id });
    }
  }
});

// Message router
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  const tabId = sender.tab?.id;

  // Phase 1-4: Side panel open
  if (message.type === 'SIGNX_OPEN_SIDE_PANEL') {
    if (tabId && chrome.sidePanel?.open) {
      chrome.sidePanel.open({ tabId });
    }
    sendResponse({ success: true });
    return true;
  }

  // Phase 5: Forward YouTube caption update to all extension pages (side panel)
  if (message.type === 'SIGNX_YOUTUBE_CAPTION_UPDATE') {
    // Broadcast to side panel and any extension pages listening
    chrome.runtime.sendMessage(message).catch(() => {});
    sendResponse({ received: true });
    return true;
  }

  // Phase 5: YouTube player state — broadcast to extension
  if ([
    'SIGNX_YT_PLAYER_PAUSED',
    'SIGNX_YT_PLAYER_RESUMED',
    'SIGNX_YT_AVATAR_STOP',
    'SIGNX_YT_AVATAR_SEEK'
  ].includes(message.type)) {
    chrome.runtime.sendMessage(message).catch(() => {});
    sendResponse({ received: true });
    return true;
  }

  // Phase 5: Toggle caption sync on the active YouTube tab
  if (message.type === 'SIGNX_YT_CAPTION_TOGGLE') {
    const { enabled } = message.payload || {};
    chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
      const ytTab = tabs.find(t => t.url?.includes('youtube.com'));
      if (ytTab?.id) {
        const msgType = enabled ? 'SIGNX_YT_CAPTION_ENABLE' : 'SIGNX_YT_CAPTION_DISABLE';
        chrome.tabs.sendMessage(ytTab.id, { type: msgType }).catch(() => {});
      }
    });
    sendResponse({ success: true });
    return true;
  }
});
