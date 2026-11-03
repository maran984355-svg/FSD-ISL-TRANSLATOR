/**
 * SignX - YouTube Caption Observer & Video Synchronization Hook
 * Listens for YouTube live captions and dispatches translation triggers.
 */

(function () {
  if (window.__SIGNX_YOUTUBE_OBSERVER_LOADED__) return;
  window.__SIGNX_YOUTUBE_OBSERVER_LOADED__ = true;

  let lastCaptionText = '';
  let captionObserver = null;

  function initCaptionObserver() {
    const captionContainer = document.querySelector('.ytp-caption-window-container') || document.body;
    
    if (captionObserver) captionObserver.disconnect();

    captionObserver = new MutationObserver(() => {
      const captionElements = document.querySelectorAll('.ytp-caption-segment');
      if (!captionElements || captionElements.length === 0) return;

      const currentText = Array.from(captionElements).map(el => el.textContent).join(' ').trim();
      
      if (currentText && currentText !== lastCaptionText && currentText.length > 2) {
        lastCaptionText = currentText;
        
        chrome.runtime.sendMessage({
          type: 'SIGNX_YOUTUBE_CAPTION_UPDATE',
          payload: {
            caption: currentText,
            timestamp: Date.now()
          }
        }).catch(() => {});
      }
    });

    captionObserver.observe(captionContainer, {
      childList: true,
      subtree: true,
      characterData: true
    });
  }

  // Attempt to initialize on page load and on navigation change
  initCaptionObserver();
  window.addEventListener('yt-navigate-finish', initCaptionObserver);
})();
