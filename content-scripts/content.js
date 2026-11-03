/**
 * SignX - Webpage Content Script & Floating Overlay Manager
 * Injects isolated Shadow DOM floating avatar overlay onto web pages.
 */

(function () {
  if (window.__SIGNX_CONTENT_SCRIPT_LOADED__) return;
  window.__SIGNX_CONTENT_SCRIPT_LOADED__ = true;

  let overlayHost = null;
  let shadowRoot = null;
  let avatarRenderer = null;
  let isDragging = false;
  let dragOffset = { x: 0, y: 0 };
  let isOverlayVisible = false;

  // Listen for messages from extension runtime
  chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    if (message.type === 'SIGNX_TOGGLE_FLOATING_AVATAR') {
      toggleOverlay();
      sendResponse({ success: true, isVisible: isOverlayVisible });
      return true;
    }

    if (message.type === 'SIGNX_PLAY_GLOSS_SEQUENCE') {
      if (!isOverlayVisible) showOverlay();
      playGlossesInOverlay(message.payload?.glosses || []);
      sendResponse({ success: true });
      return true;
    }

    if (message.type === 'SIGNX_PING') {
      sendResponse({ status: 'active', isOverlayVisible });
      return true;
    }
  });

  // Listen for text selection on page for quick translation
  document.addEventListener('mouseup', handleTextSelection);

  function handleTextSelection(e) {
    // Avoid triggering from our own overlay
    if (overlayHost && overlayHost.contains(e.target)) return;

    const selection = window.getSelection().toString().trim();
    if (selection && selection.length > 2 && selection.length < 200) {
      chrome.runtime.sendMessage({
        type: 'SIGNX_SELECTED_TEXT_DETECTED',
        payload: { text: selection }
      }).catch(() => {});
    }
  }

  function toggleOverlay() {
    if (isOverlayVisible) {
      hideOverlay();
    } else {
      showOverlay();
    }
  }

  async function showOverlay() {
    if (!overlayHost) {
      await createOverlayDOM();
    }
    overlayHost.style.display = 'block';
    isOverlayVisible = true;
    startAvatarLoop();
  }

  function hideOverlay() {
    if (overlayHost) {
      overlayHost.style.display = 'none';
    }
    isOverlayVisible = false;
  }

  async function createOverlayDOM() {
    overlayHost = document.createElement('div');
    overlayHost.id = 'signx-floating-avatar-host';
    shadowRoot = overlayHost.attachShadow({ mode: 'open' });

    // Fetch and inject CSS
    const cssUrl = chrome.runtime.getURL('avatar/avatar-overlay.css');
    const cssRes = await fetch(cssUrl);
    const cssText = await cssRes.text();

    const style = document.createElement('style');
    style.textContent = cssText;
    shadowRoot.appendChild(style);

    // Fetch and inject HTML template
    const htmlUrl = chrome.runtime.getURL('avatar/avatar-overlay.html');
    const htmlRes = await fetch(htmlUrl);
    const htmlText = await htmlRes.text();

    const wrapper = document.createElement('div');
    wrapper.innerHTML = htmlText;
    shadowRoot.appendChild(wrapper.firstElementChild);

    document.body.appendChild(overlayHost);

    // Setup interactive handlers
    bindOverlayEvents();
  }

  function bindOverlayEvents() {
    const win = shadowRoot.querySelector('#signx-floating-avatar-container');
    const dragHandle = shadowRoot.querySelector('#signx-drag-handle');
    const closeBtn = shadowRoot.querySelector('#signx-overlay-close');
    const minBtn = shadowRoot.querySelector('#signx-overlay-minimize');
    const dockBtn = shadowRoot.querySelector('#signx-overlay-dock');

    closeBtn?.addEventListener('click', hideOverlay);
    minBtn?.addEventListener('click', () => win.classList.toggle('minimized'));
    dockBtn?.addEventListener('click', () => {
      win.style.top = '';
      win.style.left = '';
      win.style.bottom = '24px';
      win.style.right = '24px';
    });

    // Draggable functionality
    dragHandle?.addEventListener('mousedown', (e) => {
      isDragging = true;
      const rect = win.getBoundingClientRect();
      dragOffset.x = e.clientX - rect.left;
      dragOffset.y = e.clientY - rect.top;
      win.style.bottom = 'auto';
      win.style.right = 'auto';
    });

    window.addEventListener('mousemove', (e) => {
      if (!isDragging) return;
      win.style.left = `${Math.max(10, Math.min(window.innerWidth - win.offsetWidth - 10, e.clientX - dragOffset.x))}px`;
      win.style.top = `${Math.max(10, Math.min(window.innerHeight - win.offsetHeight - 10, e.clientY - dragOffset.y))}px`;
    });

    window.addEventListener('mouseup', () => {
      isDragging = false;
    });
  }

  let overlayPlayer = null;
  let activeSequence = [];
  let sequenceIndex = 0;
  let sequenceTimer = null;

  function startAvatarLoop() {
    const canvas = shadowRoot?.querySelector('#signx-overlay-canvas');
    if (!canvas) return;

    const ctx = canvas.getContext('2d');
    let startTime = performance.now();
    let currentPose = {
      head: { pitch: 0, yaw: 0, roll: 0 },
      torso: { x: 0, y: 0, z: 0, lean: 0 },
      leftArm: { shoulderX: -0.32, shoulderY: 0.28, elbowX: -0.42, elbowY: -0.05, wristX: -0.28, wristY: -0.35, rotation: 0 },
      rightArm: { shoulderX: 0.32, shoulderY: 0.28, elbowX: 0.42, elbowY: -0.05, wristX: 0.28, wristY: -0.35, rotation: 0 }
    };

    function draw() {
      if (!isOverlayVisible) return;

      const t = (performance.now() - startTime) / 1000;
      const w = canvas.width;
      const h = canvas.height;

      // Studio background
      const bgGrad = ctx.createRadialGradient(w / 2, h / 2 - 20, 20, w / 2, h / 2, Math.max(w, h));
      bgGrad.addColorStop(0, '#172554');
      bgGrad.addColorStop(0.7, '#0f172a');
      bgGrad.addColorStop(1, '#020617');
      ctx.fillStyle = bgGrad;
      ctx.fillRect(0, 0, w, h);

      // Subtle signing space grid
      ctx.strokeStyle = 'rgba(255, 255, 255, 0.03)';
      ctx.lineWidth = 1;
      for (let x = 0; x < w; x += 30) {
        ctx.beginPath();
        ctx.moveTo(x, 0);
        ctx.lineTo(x, h);
        ctx.stroke();
      }

      ctx.save();
      const unitScale = Math.min(w, h) * 1.05;
      const breath = Math.sin(t * 2) * 0.015;
      ctx.translate(w / 2, h * 0.52 + breath * unitScale);

      // Torso
      ctx.fillStyle = '#1e3a8a';
      ctx.strokeStyle = 'rgba(255,255,255,0.15)';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(-unitScale * 0.32, -unitScale * 0.18);
      ctx.quadraticCurveTo(0, -unitScale * 0.16, unitScale * 0.32, -unitScale * 0.18);
      ctx.lineTo(unitScale * 0.22, unitScale * 0.32);
      ctx.lineTo(-unitScale * 0.22, unitScale * 0.32);
      ctx.closePath();
      ctx.fill();
      ctx.stroke();

      // V-Collar
      ctx.fillStyle = '#ffffff';
      ctx.beginPath();
      ctx.moveTo(-unitScale * 0.06, -unitScale * 0.17);
      ctx.lineTo(0, -unitScale * 0.06);
      ctx.lineTo(unitScale * 0.06, -unitScale * 0.17);
      ctx.closePath();
      ctx.fill();

      // Head & Face
      const hy = -unitScale * 0.32;
      ctx.save();
      ctx.translate(0, hy);

      // Neck
      ctx.fillStyle = '#dfa685';
      ctx.beginPath();
      ctx.roundRect(-unitScale * 0.045, unitScale * 0.06, unitScale * 0.09, unitScale * 0.08, 4);
      ctx.fill();

      // Head
      ctx.fillStyle = '#fbd4b7';
      ctx.beginPath();
      ctx.ellipse(0, 0, unitScale * 0.10, unitScale * 0.125, 0, 0, Math.PI * 2);
      ctx.fill();

      // Hair
      ctx.fillStyle = '#1f2937';
      ctx.beginPath();
      ctx.ellipse(0, -unitScale * 0.065, unitScale * 0.105, unitScale * 0.08, 0, Math.PI, Math.PI * 2);
      ctx.fill();

      // Eyes & Smile
      ctx.fillStyle = '#ffffff';
      ctx.beginPath();
      ctx.ellipse(-unitScale * 0.038, -unitScale * 0.015, unitScale * 0.018, unitScale * 0.014, 0, 0, Math.PI * 2);
      ctx.ellipse(unitScale * 0.038, -unitScale * 0.015, unitScale * 0.018, unitScale * 0.014, 0, 0, Math.PI * 2);
      ctx.fill();

      ctx.fillStyle = '#0284c7';
      ctx.beginPath();
      ctx.arc(-unitScale * 0.038, -unitScale * 0.015, unitScale * 0.009, 0, Math.PI * 2);
      ctx.arc(unitScale * 0.038, -unitScale * 0.015, unitScale * 0.009, 0, Math.PI * 2);
      ctx.fill();

      ctx.strokeStyle = '#dfa685';
      ctx.lineWidth = 2.5;
      ctx.lineCap = 'round';
      ctx.beginPath();
      ctx.arc(0, unitScale * 0.035, unitScale * 0.025, 0.2, Math.PI - 0.2);
      ctx.stroke();

      ctx.restore();

      // Arms & Articulated Hands
      const waveL = Math.sin(t * 3) * 0.03;
      const waveR = Math.cos(t * 3) * 0.03;

      drawOverlayLimb(ctx, -unitScale * 0.32, unitScale * 0.18, -unitScale * 0.28, -unitScale * (0.05 + waveL), -unitScale * 0.18, -unitScale * (0.20 + waveL * 1.5), unitScale);
      drawOverlayLimb(ctx, unitScale * 0.32, unitScale * 0.18, unitScale * 0.28, -unitScale * (0.05 + waveR), unitScale * 0.18, -unitScale * (0.20 + waveR * 1.5), unitScale);

      ctx.restore();

      requestAnimationFrame(draw);
    }

    requestAnimationFrame(draw);
  }

  function drawOverlayLimb(ctx, sx, sy, ex, ey, wx, wy, s) {
    ctx.strokeStyle = '#1e3a8a';
    ctx.lineWidth = s * 0.080;
    ctx.lineCap = 'round';
    ctx.beginPath();
    ctx.moveTo(sx, sy);
    ctx.lineTo(ex, ey);
    ctx.stroke();

    ctx.strokeStyle = '#fbd4b7';
    ctx.lineWidth = s * 0.060;
    ctx.beginPath();
    ctx.moveTo(ex, ey);
    ctx.lineTo(wx, wy);
    ctx.stroke();

    // Hand Palm
    ctx.fillStyle = '#fbd4b7';
    ctx.strokeStyle = '#ffffff';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.roundRect(wx - s * 0.03, wy - s * 0.035, s * 0.06, s * 0.07, s * 0.015);
    ctx.fill();
    ctx.stroke();

    // 5 Finger Nodes
    for (let f = -2; f <= 2; f++) {
      ctx.fillStyle = '#ffffff';
      ctx.beginPath();
      ctx.arc(wx + f * s * 0.012, wy - s * 0.045, s * 0.008, 0, Math.PI * 2);
      ctx.fill();
    }
  }

  function playGlossesInOverlay(glosses) {
    const pill = shadowRoot?.querySelector('#signx-current-gloss-pill span');
    const fallbackBadge = shadowRoot?.querySelector('#signx-overlay-fallback');
    if (!pill || !glosses.length) return;

    // Verified vocab list
    const VERIFIED = new Set([
      'NAMASTE', 'HELLO', 'HI', 'THANK-YOU', 'THANK_YOU', 'WELCOME', 'PLEASE', 'YES', 'NO',
      'HELP', 'WHERE', 'WHAT', 'WHO', 'HOW', 'GOOD-MORNING', 'GOOD_MORNING', 'WATER',
      'FOOD', 'EAT', 'DOCTOR', 'EMERGENCY', 'TRAIN-STATION', 'TRAIN_STATION', 'SCHOOL',
      'MY-NAME', 'MY_NAME', 'GOODBYE'
    ]);

    clearTimeout(sequenceTimer);
    let idx = 0;

    function next() {
      if (idx >= glosses.length) {
        pill.textContent = 'READY';
        if (fallbackBadge) fallbackBadge.style.display = 'none';
        return;
      }

      const raw = glosses[idx].toUpperCase();
      const isVerified = VERIFIED.has(raw) || raw.startsWith('ISL_') || raw.length === 1;

      if (isVerified) {
        pill.textContent = raw;
        if (fallbackBadge) fallbackBadge.style.display = 'none';
      } else {
        pill.textContent = 'UNAVAILABLE';
        if (fallbackBadge) {
          fallbackBadge.querySelector('span').textContent = `⚠ Sign not available: "${raw}"`;
          fallbackBadge.style.display = 'block';
        }
      }

      idx++;
      sequenceTimer = setTimeout(next, 1300);
    }

    next();
  }
})();
