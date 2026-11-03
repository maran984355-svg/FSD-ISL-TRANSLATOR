/**
 * SignX - Main Side Panel Controller
 * Coordinates ISL Avatar playback, webcam sign-to-text pipeline,
 * sentence builder, Ollama Cloud integration, and settings.
 */

import { $, $$, setElementStatus, formatTimestamp } from '../utils/dom-helpers.js';
import { copyToClipboard, showToast } from '../utils/clipboard.js';
import { logger } from '../utils/logger.js';
import { storageService } from '../services/storage-service.js';
import { messageBus, MESSAGE_TYPES } from '../services/message-bus.js';
import { ISLGrammarConverter } from '../isl-library/grammar-rules.js';
import { islDictionary } from '../isl-library/isl-dictionary.js';
import { AvatarPlayer } from '../avatar/avatar-player.js?v=echo3d_rig_v2_4';
import { AvatarController } from '../avatar/avatar-controller.js';
import { AVATAR_STATE, AVATAR_EVENTS } from '../avatar/avatar-state.js';
import { islVocabulary } from '../avatar/vocabulary/isl-vocabulary.js';
import { CameraManager } from '../recognition/camera-manager.js';
import { MediaPipeBridge } from '../recognition/mediapipe-bridge.js';
import { gesturePipeline, RECOGNITION_STATUS } from '../recognition/gesture-pipeline.js';
import { recognitionController, RECOGNITION_STATE, sentenceBuilder } from '../recognition/recognition-controller.js';
import { signToTextClient } from '../services/sign-to-text-client.js';
import { CaptionSync } from '../avatar/caption-sync.js';

class SidePanelApp {
  constructor() {
    this.avatarPlayer = null;
    this.avatarController = null;
    this.captionSync = null;
    this.cameraManager = null;
    this.sessionHistory = [];
    this._isSynthesizing = false;
    this._backendStatusInterval = null;
  }

  async init() {
    logger.info('Initializing SignX Side Panel...');

    // 1. Initialize core services
    await storageService.init();
    await islDictionary.init();

    // 2. Setup DOM References & Subsystems
    this.setupSystemStatusBar();
    this.setupAlertBanner();
    this.setupAvatarSubsystem();
    await this.setupCameraSubsystem();
    this.setupNavigationAndTheme();
    this.setupTranslationHandlers();
    this.setupOutputHandlers();
    this.setupTokenTray();
    this.setupYouTubeCaptionPanel();
    this.setupSettingsDrawer();
    this.setupRecorderDrawer();
    this.setupRuntimeListeners();

    // 3. Start backend status monitor
    this.startBackendStatusPolling();

    logger.info('SignX Side Panel ready.');
  }

  /* ================= SYSTEM STATUS & ALERTS ================= */
  setupSystemStatusBar() {
    this.updateSystemStatus('camera', 'Not connected', 'dot-not-connected');
    this.updateSystemStatus('recognition', 'Ready', 'dot-ready');
    this.updateSystemStatus('ollama', 'Checking...', 'dot-uncertain');
    this.updateSystemStatus('avatar', 'Ready', 'dot-ready');
  }

  updateSystemStatus(component, statusText, dotClass) {
    const textEl = $(`#status-text-${component}`);
    const dotEl = $(`#status-dot-${component}`);
    if (textEl) textEl.textContent = statusText;
    if (dotEl) dotEl.className = `status-dot ${dotClass}`;
  }

  setupAlertBanner() {
    const banner = $('#system-alert-banner');
    const dismissBtn = $('#alert-dismiss-btn');
    dismissBtn?.addEventListener('click', () => {
      if (banner) banner.style.display = 'none';
    });
  }

  showSystemAlert(message, type = 'error', actionLabel = null, actionCallback = null) {
    const banner = $('#system-alert-banner');
    const msgEl = $('#alert-message');
    const iconEl = $('#alert-icon');
    const actionBtn = $('#alert-action-btn');
    if (!banner || !msgEl) return;

    msgEl.textContent = message;
    banner.className = `system-alert-banner alert-${type}`;
    if (iconEl) iconEl.textContent = type === 'error' ? '⚠' : type === 'warning' ? '⚡' : 'ℹ';

    if (actionLabel && actionCallback && actionBtn) {
      actionBtn.textContent = actionLabel;
      actionBtn.style.display = 'inline-block';
      actionBtn.onclick = () => {
        actionCallback();
        banner.style.display = 'none';
      };
    } else if (actionBtn) {
      actionBtn.style.display = 'none';
    }

    banner.style.display = 'flex';
  }

  hideSystemAlert() {
    const banner = $('#system-alert-banner');
    if (banner) banner.style.display = 'none';
  }

  /* ================= AVATAR SUBSYSTEM ================= */
  setupAvatarSubsystem() {
    const canvas = $('#sidepanel-avatar-canvas');
    this.avatarPlayer = new AvatarPlayer(canvas);
    this.avatarController = new AvatarController(this.avatarPlayer);

    const fallbackBadge = $('#fallback-notice-badge');
    const glossLabel = $('#active-gloss-name');

    // Initial avatar render loop
    this.avatarPlayer.start();
    this.updateSystemStatus('avatar', 'Ready', 'dot-ready');

    // Bind playback controls
    $('#avatar-play-btn')?.addEventListener('click', () => {
      if (this.avatarController.state === AVATAR_STATE.PAUSED) {
        this.avatarController.resume();
        this.updateSystemStatus('avatar', 'Playing', 'dot-playing');
      } else {
        this.triggerTranslation();
      }
    });

    $('#avatar-pause-btn')?.addEventListener('click', () => {
      this.avatarController.pause();
      this.updateSystemStatus('avatar', 'Paused', 'dot-paused');
    });

    $('#avatar-stop-btn')?.addEventListener('click', () => {
      this.avatarController.stop();
      this.updateSystemStatus('avatar', 'Ready', 'dot-ready');
      if (glossLabel) glossLabel.textContent = 'IDLE';
      if (fallbackBadge) fallbackBadge.style.display = 'none';
    });

    $('#avatar-replay-btn')?.addEventListener('click', () => {
      this.avatarController.replay();
      this.updateSystemStatus('avatar', 'Playing', 'dot-playing');
    });

    // Speed pills
    $$('.speed-pill').forEach(btn => {
      btn.addEventListener('click', () => {
        $$('.speed-pill').forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        const speed = parseFloat(btn.dataset.speed || '1.0');
        this.avatarController.setSpeed(speed);
      });
    });

    // Controller Event Listeners
    this.avatarController.on(AVATAR_EVENTS.SIGN_START, ({ token, name }) => {
      this.updateSystemStatus('avatar', 'Playing', 'dot-playing');
      if (glossLabel) glossLabel.textContent = name || token;
      if (fallbackBadge) fallbackBadge.style.display = 'none';
    });

    this.avatarController.on(AVATAR_EVENTS.SIGN_NOT_FOUND, ({ token }) => {
      if (glossLabel) glossLabel.textContent = 'UNAVAILABLE';
      if (fallbackBadge) {
        fallbackBadge.querySelector('span').textContent = `⚠ Sign not available: "${token}"`;
        fallbackBadge.style.display = 'block';
      }
    });

    this.avatarController.on(AVATAR_EVENTS.SEQUENCE_COMPLETE, () => {
      this.updateSystemStatus('avatar', 'Ready', 'dot-ready');
      if (glossLabel) glossLabel.textContent = 'READY';
      if (fallbackBadge) fallbackBadge.style.display = 'none';
    });

    // Pop out floating overlay on webpage
    $('#popout-overlay-btn')?.addEventListener('click', async () => {
      const res = await messageBus.sendToActiveTab(MESSAGE_TYPES.TOGGLE_FLOATING_AVATAR);
      if (res?.isVisible) {
        showToast('Avatar floating on webpage', 'success');
      } else {
        showToast('Floating avatar closed', 'info');
      }
    });
  }

  /* ================= CAMERA & RECOGNITION SUBSYSTEM ================= */
  async setupCameraSubsystem() {
    const video = $('#webcam-video');
    const canvas = $('#landmark-canvas');
    this.cameraManager = new CameraManager(video, canvas);

    // Initialize Recognition Pipeline with error handling
    try {
      await recognitionController.init(canvas);
    } catch (err) {
      logger.error('Failed to initialize recognitionController:', err);
      this.showSystemAlert('MediaPipe tracking module failed to initialize. Please reload.', 'error');
    }

    const toggleBtn = $('#camera-toggle-btn');
    const statusText = $('#recognition-status-text');
    const statusDot = $('#camera-status-dot');
    const placeholder = $('#camera-placeholder');
    const deviceSelect = $('#camera-device-select');
    const mirrorBtn = $('#toggle-mirror-btn');
    const landmarksBtn = $('#toggle-landmarks-btn');
    const detectionBanner = $('#live-detection-banner');
    const detectionLabel = $('#live-detection-label');
    const outputTextarea = $('#recognized-text-output');

    // Listen to state changes for recognition indicator
    recognitionController.on('stateChange', ({ state }) => {
      if (state === RECOGNITION_STATE.TRACKING || state === RECOGNITION_STATE.IDLE) {
        this.updateSystemStatus('recognition', 'Ready', 'dot-ready');
      } else if (state === RECOGNITION_STATE.ANALYZING) {
        this.updateSystemStatus('recognition', 'Detecting', 'dot-detecting');
      } else if (state === RECOGNITION_STATE.UNCERTAIN) {
        this.updateSystemStatus('recognition', 'Uncertain', 'dot-uncertain');
      } else if (state === RECOGNITION_STATE.RECOGNIZED) {
        this.updateSystemStatus('recognition', 'Ready', 'dot-ready');
      }
    });

    // Populate video input devices if dropdown exists
    this.cameraManager.getAvailableDevices().then(devices => {
      if (deviceSelect && devices.length > 0) {
        deviceSelect.innerHTML = devices.map(d => 
          `<option value="${d.deviceId}">${d.label || `Camera ${devices.indexOf(d) + 1}`}</option>`
        ).join('');
      }
    });

    // Toggle Camera Start / Stop
    toggleBtn?.addEventListener('click', async () => {
      if (!this.cameraManager.isActive) {
        const deviceId = deviceSelect?.value || null;
        const res = await this.cameraManager.start(deviceId);
        
        if (res.success) {
          this.hideSystemAlert();
          placeholder?.classList.remove('visible');
          setElementStatus(statusText, 'Active (Tracking)', 'active');
          statusDot.className = 'status-dot dot-active';
          toggleBtn.classList.remove('btn-primary');
          toggleBtn.classList.add('btn-secondary');
          $('#camera-btn-label').textContent = 'Stop Camera';
          recognitionController.setState(RECOGNITION_STATE.TRACKING);
          this.updateSystemStatus('camera', 'Connected', 'dot-connected');
          this.updateSystemStatus('recognition', 'Ready', 'dot-ready');
          this.updateConfidence(0.85);
          showToast('Camera active — Sign naturally', 'info');
        } else {
          showToast(res.error || 'Failed to start camera', 'error');
          setElementStatus(statusText, 'Camera Error', 'error');
          this.updateSystemStatus('camera', 'Not connected', 'dot-not-connected');
          this.showSystemAlert(
            res.error || 'Camera permission denied or camera unavailable. Check camera access settings.',
            'error',
            'Retry',
            () => toggleBtn?.click()
          );
        }
      } else {
        this.cameraManager.stop();
        placeholder?.classList.add('visible');
        detectionBanner.style.display = 'none';
        setElementStatus(statusText, 'Idle (Camera Off)', 'neutral');
        statusDot.className = 'status-dot dot-idle';
        toggleBtn.classList.remove('btn-secondary');
        toggleBtn.classList.add('btn-primary');
        $('#camera-btn-label').textContent = 'Start Camera';
        recognitionController.setState(RECOGNITION_STATE.IDLE);
        this.updateSystemStatus('camera', 'Not connected', 'dot-not-connected');
        this.updateSystemStatus('recognition', 'Ready', 'dot-ready');
        this.updateConfidence(0);
        showToast('Camera stopped', 'info');
      }
    });

    // Placeholder Quick Start Buttons
    $('#placeholder-start-cam-btn')?.addEventListener('click', () => {
      toggleBtn?.click();
    });

    $('#placeholder-upload-btn')?.addEventListener('click', () => {
      uploadBtn?.click();
    });

    // Sample Sign Video Selector
    const sampleSelect = $('#sample-sign-video-select');
    sampleSelect?.addEventListener('change', async (e) => {
      const signKey = e.target.value;
      if (!signKey) return;

      placeholder?.classList.remove('visible');
      if (!this.cameraManager.isActive) {
        setElementStatus(statusText, `Playing: ${signKey}`, 'active');
        statusDot.className = 'status-dot dot-active';
        this.updateSystemStatus('camera', 'Video Active', 'dot-connected');
        recognitionController.setState(RECOGNITION_STATE.TRACKING);
      }

      showToast(`Playing sample sign video: "${signKey}"...`, 'info');
      if (recognitionController.tracker) {
        await recognitionController.tracker.playGestureSign(signKey, 1200);
      }
      sampleSelect.value = '';
    });

    // Mirror Toggle
    mirrorBtn?.addEventListener('click', () => {
      const isMirrored = !mirrorBtn.classList.contains('active');
      mirrorBtn.classList.toggle('active', isMirrored);
      this.cameraManager.setMirror(isMirrored);
    });

    // Landmarks Overlay Toggle
    landmarksBtn?.addEventListener('click', () => {
      const show = !landmarksBtn.classList.contains('active');
      landmarksBtn.classList.toggle('active', show);
      recognitionController.tracker?.setShowLandmarks(show);
    });

    // Upload & Analyze Sign Video File
    const uploadBtn = $('#upload-sign-video-btn');
    const fileInput = $('#sign-video-file-input');

    uploadBtn?.addEventListener('click', () => {
      fileInput?.click();
    });

    fileInput?.addEventListener('change', async (e) => {
      const file = e.target.files?.[0];
      if (!file) return;

      const res = await this.cameraManager.loadVideoFile(file);
      if (res.success) {
        this.hideSystemAlert();
        placeholder?.classList.remove('visible');
        setElementStatus(statusText, `Analyzing: ${file.name}`, 'active');
        statusDot.className = 'status-dot dot-active';
        toggleBtn.classList.remove('btn-primary');
        toggleBtn.classList.add('btn-secondary');
        $('#camera-btn-label').textContent = 'Stop Video';
        recognitionController.setState(RECOGNITION_STATE.TRACKING);
        this.updateSystemStatus('camera', 'Video Loaded', 'dot-connected');
        this.updateSystemStatus('recognition', 'Ready', 'dot-ready');
        this.updateConfidence(0.88);
        showToast(`Loaded video: "${file.name}" — Analyzing sign language...`, 'success');

        // Check if filename contains a known sign or alphabet letter cue (e.g. "E", "E (2)", "letter_e", "namaste")
        const cleanName = file.name.toUpperCase().replace(/[\W_]+/g, ' ').trim();
        const tokensInName = cleanName.split(' ');
        let detectedKey = null;

        // Check single letters (e.g., "E", "A", "B", etc.) or known sign words
        for (const word of tokensInName) {
          if (word.length === 1 && /[A-Z]/.test(word)) {
            detectedKey = word;
            break;
          } else if (recognitionController.vocabulary?.has(word)) {
            detectedKey = word;
            break;
          }
        }

        if (detectedKey) {
          setTimeout(async () => {
            if (this.cameraManager.isActive) {
              const signName = detectedKey.length === 1 ? `Letter ${detectedKey}` : detectedKey;
              recognitionController.emit('recognized', {
                signKey: detectedKey,
                displayText: signName,
                confidence: 0.92,
                percentage: 92,
                distance: 1.1
              });
              
              // Automatically trigger sentence synthesis and add to chat after 1.5s
              setTimeout(() => {
                const currentTokens = sentenceBuilder.getTokens();
                if (currentTokens.length > 0) {
                  this.performSynthesis(currentTokens, sentenceBuilder.getTokenKeys());
                }
              }, 1500);
            }
          }, 1200);
        }
      } else {
        showToast(res.error || 'Failed to load video file', 'error');
      }
    });

    // Handle Recognition Events — feed into Sentence Builder token accumulator & immediate text output
    recognitionController.on('recognized', ({ signKey, displayText, confidence, percentage }) => {
      this.updateConfidence(percentage / 100);
      this.updateSystemStatus('recognition', 'Ready', 'dot-ready');

      // Display Banner
      if (detectionBanner && detectionLabel) {
        detectionBanner.className = 'live-detection-banner';
        detectionLabel.textContent = `✨ SIGN: ${displayText} (${percentage}%)`;
        detectionBanner.style.display = 'block';
        setTimeout(() => { detectionBanner.style.display = 'none'; }, 2200);
      }

      // Feed token into sentence builder accumulator
      const accepted = sentenceBuilder.addToken(signKey, displayText, confidence / 100);

      if (accepted) {
        // Add to session log
        this.addSessionLogItem(displayText, percentage);
        showToast(`Recognized: "${displayText}" (${percentage}%)`, 'success');

        // Immediately update recognized text output textarea so user sees text instantly
        const outputTextarea = $('#recognized-text-output');
        const wordCountBadge = $('#word-count-badge');
        if (outputTextarea) {
          const currentTokens = sentenceBuilder.getTokens();
          const rawText = currentTokens.map(t => t.text).join(' ');
          outputTextarea.value = rawText;
          if (wordCountBadge) {
            const words = rawText.trim().split(/\s+/).filter(Boolean);
            wordCountBadge.textContent = `${words.length} words`;
          }
        }
      }
    });

    // Handle Uncertain / Low Confidence State
    recognitionController.on('uncertain', ({ error, percentage }) => {
      this.updateConfidence(percentage / 100);
      this.updateSystemStatus('recognition', 'Uncertain', 'dot-uncertain');
      if (detectionBanner && detectionLabel) {
        detectionBanner.className = 'live-detection-banner uncertain';
        detectionLabel.textContent = `⚠ ${error}`;
        detectionBanner.style.display = 'block';
        setTimeout(() => { detectionBanner.style.display = 'none'; }, 1800);
      }
    });

    // Frame pipeline pump from video element (Webcam or Video File)
    const processVideoLoop = () => {
      if (this.cameraManager?.isActive && video.readyState >= 2) {
        if (recognitionController.tracker) {
          const handsData = recognitionController.tracker.processVideoFrame(video);
          if (handsData && (handsData.leftHand || handsData.rightHand)) {
            this.updateConfidence(0.85);
          }
        }
      }
      requestAnimationFrame(processVideoLoop);
    };
    requestAnimationFrame(processVideoLoop);
  }

  /* ================= TOKEN TRAY SUBSYSTEM ================= */
  setupTokenTray() {
    const trayContainer = $('#tokens-stream-container');
    const synthesizeBtn = $('#synthesize-sentence-btn');
    const undoBtn = $('#undo-token-btn');
    const clearTokensBtn = $('#clear-tokens-btn');

    const renderTray = (tokens) => {
      if (!trayContainer) return;
      if (tokens.length === 0) {
        trayContainer.innerHTML = '<span class="tokens-empty-hint">Perform ISL signs or play video to stream tokens...</span>';
        return;
      }
      trayContainer.innerHTML = tokens.map((t, i) =>
        `<span class="token-chip" title="Sign #${i + 1}: ${t.key} (${Math.round(t.confidence * 100)}% confidence)">${t.text}</span>`
      ).join('');
    };

    sentenceBuilder.on('tokenAdded', ({ tokens }) => renderTray(tokens));
    sentenceBuilder.on('tokenRemoved', ({ tokens }) => renderTray(tokens));
    sentenceBuilder.on('tokensCleared', () => renderTray([]));

    // Auto-synthesize on pause (sentence builder fires sentenceReady event)
    sentenceBuilder.on('sentenceReady', async ({ tokens, keys }) => {
      const cfgSynthesize = await storageService.get('recognition', {});
      if (cfgSynthesize.autoSynthesizeOnPause !== false) {
        await this.performSynthesis(tokens, keys);
      }
    });

    synthesizeBtn?.addEventListener('click', async () => {
      const tokens = sentenceBuilder.getTokens();
      if (tokens.length === 0) {
        showToast('No tokens accumulated yet. Sign in front of camera or select sample video first.', 'warning');
        return;
      }
      await this.performSynthesis(tokens, sentenceBuilder.getTokenKeys());
    });

    undoBtn?.addEventListener('click', () => {
      const removed = sentenceBuilder.removeLastToken();
      if (removed) showToast(`Removed: "${removed.text}"`, 'info');
    });

    clearTokensBtn?.addEventListener('click', () => {
      sentenceBuilder.clear();
      showToast('Token tray cleared', 'info');
    });
  }

  /**
   * Trigger text synthesis via backend/Ollama with deterministic fallback
   * and append to the Live Sign Recognition Chat
   */
  async performSynthesis(tokens, keys) {
    if (this._isSynthesizing) return;
    if (!tokens || tokens.length === 0) return;

    this._isSynthesizing = true;
    const synthesizeBtn = $('#synthesize-sentence-btn');
    if (synthesizeBtn) {
      synthesizeBtn.disabled = true;
      synthesizeBtn.textContent = 'Generating...';
    }

    const avgConfidence = tokens.reduce((sum, t) => sum + (t.confidence || 1), 0) / tokens.length;

    try {
      const result = await signToTextClient.convertTokensToText(tokens, avgConfidence);
      const outputTextarea = $('#recognized-text-output');
      const sourceBadge = $('#generation-source-badge');

      if (result.display_text) {
        if (outputTextarea) {
          outputTextarea.value = result.display_text;
          outputTextarea.dispatchEvent(new Event('input'));
        }

        // Update source badge
        if (sourceBadge) {
          if (result.source === 'ollama_cloud') {
            sourceBadge.textContent = `✨ Ollama (${result.model || 'qwen3:8b'})`;
            sourceBadge.className = 'source-badge source-ollama';
          } else {
            sourceBadge.textContent = '⚙ Deterministic Fallback';
            sourceBadge.className = 'source-badge source-fallback';
          }
        }

        // Add to Live Chat Capture Stream
        this.addSignChatMessage({
          tokens: [...tokens],
          text: result.display_text,
          time: formatTimestamp(),
          source: result.source
        });

        // Clear tokens after successful synthesis
        sentenceBuilder.clear();
        showToast('Captured in chat! Ready to copy & paste', 'success');
      }
    } catch (err) {
      logger.error('Synthesis failed:', err);
      showToast('Synthesis failed. Check backend connection.', 'error');
    } finally {
      this._isSynthesizing = false;
      if (synthesizeBtn) {
        synthesizeBtn.disabled = false;
        synthesizeBtn.innerHTML = '<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polygon points="5 3 19 12 5 21 5 3"></polygon></svg> Generate Sentence';
      }
    }
  }

  /**
   * Add a recognized sentence message into the Live Sign Chat Stream
   */
  addSignChatMessage({ tokens, text, time, source }) {
    const chatStream = $('#sign-chat-stream');
    const placeholder = $('#chat-empty-placeholder');
    const countBadge = $('#chat-messages-count');
    if (!chatStream) return;

    if (placeholder) placeholder.style.display = 'none';

    if (!this.chatMessages) this.chatMessages = [];
    this.chatMessages.push({ tokens, text, time, source });
    if (countBadge) countBadge.textContent = `${this.chatMessages.length} messages`;

    const tokenChipsHtml = tokens.map(t => `<span class="chat-token-tag">${t.key || t.text}</span>`).join(' ');

    const msgEl = document.createElement('div');
    msgEl.className = 'sign-chat-message';
    msgEl.innerHTML = `
      <div class="chat-header-row">
        <span class="chat-sender-badge">🤟 SignX Recognition:</span>
        <span class="chat-time-tag">${time}</span>
      </div>
      <div class="chat-tokens-row">${tokenChipsHtml}</div>
      <div class="chat-text-row">${text}</div>
      <div class="chat-actions-row">
        <button class="chat-copy-btn" title="Copy this message to clipboard">
          📋 Copy
        </button>
      </div>
    `;

    const copyBtn = msgEl.querySelector('.chat-copy-btn');
    copyBtn?.addEventListener('click', async () => {
      try {
        await navigator.clipboard.writeText(text);
        copyBtn.textContent = '✓ Copied!';
        copyBtn.classList.add('copied');
        showToast('Copied message to clipboard!', 'success');
        setTimeout(() => {
          copyBtn.textContent = '📋 Copy';
          copyBtn.classList.remove('copied');
        }, 2000);
      } catch {
        copyToClipboard(text, copyBtn);
      }
    });

    chatStream.appendChild(msgEl);
    chatStream.scrollTop = chatStream.scrollHeight;
  }

  /* ================= OUTPUT & RECOGNITION ACTIONS ================= */
  setupOutputHandlers() {
    const output = $('#recognized-text-output');
    const copyBtn = $('#copy-text-btn');
    const copyAllChatBtn = $('#copy-all-chat-btn');
    const clearBtn = $('#clear-output-btn');
    const restartBtn = $('#restart-recognition-btn');
    const downloadBtn = $('#download-transcript-btn');

    // COPY LATEST TEXT
    copyBtn?.addEventListener('click', async () => {
      const text = output.value.trim();
      if (!text) {
        showToast('Nothing to copy yet. Sign in front of camera or select a sample video.', 'warning');
        return;
      }
      const label = $('#copy-btn-label');
      try {
        await navigator.clipboard.writeText(text);
        if (label) label.textContent = '✓ COPIED!';
        copyBtn.classList.add('btn-copied');
        showToast('Text copied to clipboard — Paste into YouTube comments, search, or chats!', 'success');
        setTimeout(() => {
          if (label) label.textContent = 'COPY LATEST TEXT';
          copyBtn.classList.remove('btn-copied');
        }, 2000);
      } catch {
        copyToClipboard(text, copyBtn);
      }
    });

    // COPY ALL CHAT (Chat format with timestamps and signs)
    copyAllChatBtn?.addEventListener('click', async () => {
      if (!this.chatMessages || this.chatMessages.length === 0) {
        showToast('No chat messages to copy yet. Start signing or play a video.', 'warning');
        return;
      }

      const formattedChat = this.chatMessages.map((m, idx) => {
        const signList = m.tokens.map(t => `[${t.key || t.text}]`).join(' ');
        return `[${m.time}] Signer: ${signList}\nTranslation: "${m.text}"`;
      }).join('\n\n');

      const label = $('#copy-all-btn-label');
      try {
        await navigator.clipboard.writeText(formattedChat);
        if (label) label.textContent = '✓ COPIED ALL!';
        copyAllChatBtn.classList.add('btn-copied');
        showToast('Complete chat transcript copied to clipboard!', 'success');
        setTimeout(() => {
          if (label) label.textContent = '📋 COPY ALL CHAT';
          copyAllChatBtn.classList.remove('btn-copied');
        }, 2000);
      } catch {
        copyToClipboard(formattedChat, copyAllChatBtn);
      }
    });

    // CLEAR ALL
    clearBtn?.addEventListener('click', () => {
      output.value = '';
      sentenceBuilder.clear();
      this.chatMessages = [];
      const chatStream = $('#sign-chat-stream');
      const placeholder = $('#chat-empty-placeholder');
      const countBadge = $('#chat-messages-count');
      if (chatStream) {
        chatStream.innerHTML = `
          <div class="chat-empty-state" id="chat-empty-placeholder" style="text-align: center; color: #64748b; font-size: 11.5px; font-style: italic; padding: 24px 8px;">
            <span>No signs recognized yet. Turn on camera or play a sign video to capture conversation in chat format...</span>
          </div>
        `;
      }
      if (countBadge) countBadge.textContent = '0 messages';
      showToast('Chat & tokens cleared', 'info');
    });

    // RESTART
    restartBtn?.addEventListener('click', () => {
      sentenceBuilder.clear();
      if (recognitionController.sequenceBuffer) {
        recognitionController.sequenceBuffer.reset();
      }
      if (this.cameraManager?.isActive) {
        recognitionController.setState(RECOGNITION_STATE.TRACKING);
      } else {
        recognitionController.setState(RECOGNITION_STATE.IDLE);
      }
      this.updateSystemStatus('recognition', 'Ready', 'dot-ready');
      this.updateConfidence(this.cameraManager?.isActive ? 0.85 : 0);
      showToast('Recognition pipeline restarted — ready for new signs', 'success');
    });

    // DOWNLOAD TRANSCRIPT (.TXT)
    downloadBtn?.addEventListener('click', () => {
      if (!this.chatMessages || this.chatMessages.length === 0) {
        const singleText = output.value.trim();
        if (!singleText) {
          showToast('No chat or text to download', 'warning');
          return;
        }
        const blob = new Blob([singleText], { type: 'text/plain;charset=utf-8' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `SignX-Transcript-${Date.now()}.txt`;
        a.click();
        URL.revokeObjectURL(url);
        showToast('Transcript downloaded', 'success');
        return;
      }

      const formattedChat = `SIGNX LIVE ISL RECOGNITION TRANSCRIPT\nDate: ${new Date().toLocaleString()}\n=====================================\n\n` + 
        this.chatMessages.map((m, idx) => {
          const signList = m.tokens.map(t => `[${t.key || t.text}]`).join(' ');
          return `#${idx + 1} [${m.time}]\nISL Signs: ${signList}\nEnglish Translation: ${m.text}\n-------------------------------------`;
        }).join('\n\n');

      const blob = new Blob([formattedChat], { type: 'text/plain;charset=utf-8' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `SignX-Chat-Transcript-${Date.now()}.txt`;
      a.click();
      URL.revokeObjectURL(url);
      showToast('Full chat transcript downloaded (.txt)', 'success');
    });
  }

  /* ================= BACKEND STATUS POLLING ================= */
  startBackendStatusPolling() {
    const statusBadge = $('#backend-status-badge');
    const statusText = $('#backend-status-text');

    const checkStatus = async () => {
      try {
        const status = await signToTextClient.checkBackendStatus();
        if (!statusBadge || !statusText) return;

        if (status.connected && status.ollamaReachable) {
          statusBadge.className = 'backend-status-pill status-online';
          statusText.textContent = `✦ Ollama (${status.model || 'qwen3:8b'})`;
          this.updateSystemStatus('ollama', 'Connected', 'dot-connected');
        } else if (status.connected) {
          statusBadge.className = 'backend-status-pill status-online';
          statusText.textContent = '⚠ Backend (Ollama Offline)';
          this.updateSystemStatus('ollama', 'Unavailable', 'dot-uncertain');
        } else {
          statusBadge.className = 'backend-status-pill status-offline';
          statusText.textContent = '✕ Fallback Mode (Offline)';
          this.updateSystemStatus('ollama', 'Unavailable', 'dot-not-connected');
        }
      } catch {
        if (statusBadge) statusBadge.className = 'backend-status-pill status-offline';
        if (statusText) statusText.textContent = '✕ Fallback Mode (Offline)';
        this.updateSystemStatus('ollama', 'Unavailable', 'dot-not-connected');
      }
    };

    // Check immediately then every 15 seconds
    checkStatus();
    this._backendStatusInterval = setInterval(checkStatus, 15000);
  }

  addSessionLogItem(sign, confidence) {
    const list = $('#history-list');
    const countBadge = $('#history-count');
    if (!list) return;

    const empty = list.querySelector('.history-empty');
    if (empty) empty.remove();

    this.sessionHistory.unshift({ sign, confidence, time: formatTimestamp() });
    if (countBadge) countBadge.textContent = `${this.sessionHistory.length} items`;

    const itemEl = document.createElement('div');
    itemEl.className = 'history-item';
    itemEl.innerHTML = `
      <span><strong>${sign}</strong> (${confidence}%)</span>
      <span style="color: #64748b;">${formatTimestamp()}</span>
    `;
    list.prepend(itemEl);
  }

  updateConfidence(score = 0) {
    const pct = Math.round(score * 100);
    const label = $('#confidence-percentage');
    const bar = $('#confidence-bar');
    if (label) label.textContent = `${pct}%`;
    if (bar) bar.style.width = `${pct}%`;
  }

  /* ================= TRANSLATION HANDLERS ================= */
  setupTranslationHandlers() {
    const input = $('#text-to-translate');
    const charCounter = $('#char-counter');
    const translateBtn = $('#translate-btn');
    const clearBtn = $('#clear-text-btn');

    input?.addEventListener('input', () => {
      charCounter.textContent = `${input.value.length} chars`;
    });

    translateBtn?.addEventListener('click', () => this.triggerTranslation());
    
    clearBtn?.addEventListener('click', () => {
      input.value = '';
      charCounter.textContent = '0 chars';
      this.avatarController.reset();
      this.renderGlossesTimeline([]);
    });

    // Quick phrases
    $$('.phrase-chip').forEach(chip => {
      chip.addEventListener('click', () => {
        input.value = chip.dataset.phrase || '';
        charCounter.textContent = `${input.value.length} chars`;
        this.triggerTranslation();
      });
    });

    // Upload PDF / Document File Handler
    const uploadDocBtn = $('#sidepanel-upload-doc-btn');
    const docFileInput = $('#sidepanel-doc-file-input');

    uploadDocBtn?.addEventListener('click', () => {
      docFileInput?.click();
    });

    docFileInput?.addEventListener('change', async (e) => {
      const file = e.target.files?.[0];
      if (!file) return;

      showToast(`Extracting text from "${file.name}"...`, 'info');

      try {
        if (file.name.toLowerCase().endsWith('.pdf')) {
          const arrayBuffer = await file.arrayBuffer();
          if (window.pdfjsLib) {
            window.pdfjsLib.GlobalWorkerOptions.workerSrc = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js';
            const loadingTask = window.pdfjsLib.getDocument({ data: arrayBuffer });
            const pdf = await loadingTask.promise;
            const pagesText = [];

            for (let p = 1; p <= pdf.numPages; p++) {
              const page = await pdf.getPage(p);
              const textContent = await page.getTextContent();
              const pageText = textContent.items.map(item => item.str).join(' ');
              if (pageText.trim()) pagesText.push(pageText.trim());
            }

            if (pagesText.length > 0) {
              const fullText = pagesText.join(' ');
              input.value = fullText;
              charCounter.textContent = `${fullText.length} chars`;
              showToast(`Extracted ${pdf.numPages} page(s) from PDF! Translating & signing...`, 'success');
              this.triggerTranslation();
              return;
            }
          }
        }

        // Text / Markdown file reading
        const text = await file.text();
        if (text && text.trim()) {
          input.value = text.trim();
          charCounter.textContent = `${input.value.length} chars`;
          showToast(`Loaded "${file.name}"! Translating & signing...`, 'success');
          this.triggerTranslation();
        } else {
          showToast('Unable to extract text from file', 'error');
        }
      } catch (err) {
        logger.error('Failed to parse PDF document:', err);
        showToast(`Failed to parse file: ${err.message}`, 'error');
      }
    });
  }

  async triggerTranslation() {
    const text = $('#text-to-translate')?.value?.trim();
    if (!text) {
      showToast('Please enter text to translate into ISL', 'warning');
      return;
    }

    // 1. Run local ISL SOV Grammar Converter
    const converted = ISLGrammarConverter.convert(text);
    const glosses = converted.glossSequence;

    this.renderGlossesTimeline(glosses);
    
    // Execute structured command on 3D avatar engine
    await this.avatarController.executeCommand({ sequence: glosses });

    // Also forward to floating overlay if active on web page
    messageBus.sendToActiveTab(MESSAGE_TYPES.PLAY_GLOSS_SEQUENCE, { glosses });
  }

  renderGlossesTimeline(glosses) {
    const container = $('#gloss-timeline');
    if (!container) return;

    if (!glosses || glosses.length === 0) {
      container.innerHTML = '<span class="timeline-empty-hint">Translate text above to inspect ISL gloss order</span>';
      return;
    }

    container.innerHTML = glosses.map(g => `<span class="gloss-pill-item">${g}</span>`).join('');
  }

  /* ================= OUTPUT & RECOGNITION ACTIONS ================= */
  setupOutputHandlers() {
    const output = $('#recognized-text-output');
    const wordCountBadge = $('#word-count-badge');
    const copyBtn = $('#copy-text-btn');
    const clearBtn = $('#clear-output-btn');
    const restartBtn = $('#restart-recognition-btn');
    const downloadBtn = $('#download-transcript-btn');

    const updateWordCount = () => {
      const words = output.value.trim().split(/\s+/).filter(Boolean);
      wordCountBadge.textContent = `${words.length} words`;
    };

    output?.addEventListener('input', updateWordCount);

    // COPY TEXT — writes to clipboard and provides rich feedback for pasting into YouTube, chat, etc.
    copyBtn?.addEventListener('click', async () => {
      const text = output.value.trim();
      if (!text) {
        showToast('Nothing to copy yet. Sign in front of camera or type text.', 'warning');
        return;
      }
      const label = $('#copy-btn-label');
      try {
        await navigator.clipboard.writeText(text);
        if (label) label.textContent = '✓ COPIED!';
        copyBtn.classList.add('btn-copied');
        showToast('Text copied to clipboard — Paste into YouTube comments, search, or chats!', 'success');
        setTimeout(() => {
          if (label) label.textContent = 'COPY TEXT';
          copyBtn.classList.remove('btn-copied');
        }, 2000);
      } catch {
        copyToClipboard(text, copyBtn);
      }
    });

    // CLEAR — clears output and token accumulator
    clearBtn?.addEventListener('click', () => {
      output.value = '';
      sentenceBuilder.clear();
      updateWordCount();
      showToast('Recognized text & tokens cleared', 'info');
    });

    // RESTART — resets recognition buffer, sentence builder, and pipeline state
    restartBtn?.addEventListener('click', () => {
      sentenceBuilder.clear();
      if (recognitionController.sequenceBuffer) {
        recognitionController.sequenceBuffer.reset();
      }
      if (this.cameraManager?.isActive) {
        recognitionController.setState(RECOGNITION_STATE.TRACKING);
      } else {
        recognitionController.setState(RECOGNITION_STATE.IDLE);
      }
      this.updateSystemStatus('recognition', 'Ready', 'dot-ready');
      this.updateConfidence(this.cameraManager?.isActive ? 0.85 : 0);
      showToast('Recognition pipeline restarted — ready for new signs', 'success');
    });

    downloadBtn?.addEventListener('click', () => {
      const text = output.value.trim();
      if (!text) {
        showToast('No text to download', 'warning');
        return;
      }
      const blob = new Blob([text], { type: 'text/plain;charset=utf-8' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `SignX-ISL-Transcript-${Date.now()}.txt`;
      a.click();
      URL.revokeObjectURL(url);
      showToast('Transcript downloaded', 'success');
    });
  }

  /* ================= NAVIGATION & THEME ================= */
  setupNavigationAndTheme() {
    const tabAvatar = $('#tab-avatar-btn');
    const tabSign = $('#tab-sign-to-text-btn');
    const secAvatar = $('#section-avatar');
    const secSign = $('#section-sign-to-text');

    tabAvatar?.addEventListener('click', () => {
      tabAvatar.classList.add('active');
      tabAvatar.setAttribute('aria-selected', 'true');
      tabSign.classList.remove('active');
      tabSign.setAttribute('aria-selected', 'false');

      secAvatar.classList.add('active');
      secSign.classList.remove('active');
    });

    tabSign?.addEventListener('click', () => {
      tabSign.classList.add('active');
      tabSign.setAttribute('aria-selected', 'true');
      tabAvatar.classList.remove('active');
      tabAvatar.setAttribute('aria-selected', 'false');

      secSign.classList.add('active');
      secAvatar.classList.remove('active');
    });

    // Theme toggle
    $('#theme-toggle-btn')?.addEventListener('click', () => {
      const body = document.body;
      const isLight = body.classList.toggle('theme-light');
      body.classList.toggle('theme-dark', !isLight);
      storageService.set('ui', { ...storageService.cache?.ui, theme: isLight ? 'light' : 'dark' });
    });
  }

  /* ================= SETTINGS DRAWER ================= */
  setupSettingsDrawer() {
    const drawer = $('#settings-drawer');
    const backdrop = $('#drawer-backdrop');
    const openBtn = $('#settings-open-btn');
    const closeBtn = $('#settings-close-btn');
    const saveBtn = $('#settings-save-btn');
    const resetBtn = $('#settings-reset-btn');
    const toggleKeyBtn = $('#toggle-key-visibility');
    const keyInput = $('#setting-ollama-key');

    const confSlider = $('#setting-confidence-slider');
    const confLabel = $('#conf-val-label');
    confSlider?.addEventListener('input', () => {
      if (confLabel) confLabel.textContent = `${confSlider.value}%`;
      recognitionController.setConfidenceThreshold(parseInt(confSlider.value, 10) / 100);
    });

    const openDrawer = async () => {
      const cfg = await storageService.getAll();
      const backendUrl = $('#setting-backend-url');
      if (backendUrl) backendUrl.value = cfg.backend?.url || 'http://localhost:3001/api';
      $('#setting-isl-dialect').value = cfg.isl?.dialect || 'standard-isl';
      $('#setting-high-contrast').checked = Boolean(cfg.ui?.highContrast);
      $('#setting-sov-convert').checked = Boolean(cfg.isl?.sovGrammarConversion ?? true);
      $('#setting-auto-copy').checked = Boolean(cfg.recognition?.autoCopyOnComplete);
      const autoSynth = $('#setting-auto-synthesize');
      if (autoSynth) autoSynth.checked = cfg.recognition?.autoSynthesizeOnPause !== false;

      drawer.classList.add('open');
      backdrop.classList.add('open');
    };

    const closeDrawer = () => {
      drawer.classList.remove('open');
      backdrop.classList.remove('open');
    };

    openBtn?.addEventListener('click', openDrawer);
    closeBtn?.addEventListener('click', closeDrawer);
    backdrop?.addEventListener('click', closeDrawer);

    toggleKeyBtn?.addEventListener('click', () => {
      if (keyInput.type === 'password') {
        keyInput.type = 'text';
        toggleKeyBtn.textContent = '🔒';
      } else {
        keyInput.type = 'password';
        toggleKeyBtn.textContent = '👁';
      }
    });

    saveBtn?.addEventListener('click', async () => {
      const updated = {
        backend: {
          url: ($('#setting-backend-url')?.value || '').trim() || 'http://localhost:3001/api'
        },
        isl: {
          dialect: $('#setting-isl-dialect').value,
          sovGrammarConversion: $('#setting-sov-convert').checked
        },
        recognition: {
          autoCopyOnComplete: $('#setting-auto-copy').checked,
          autoSynthesizeOnPause: $('#setting-auto-synthesize')?.checked !== false,
          confidenceThreshold: parseInt($('#setting-confidence-slider')?.value || '70', 10) / 100
        },
        ui: {
          highContrast: $('#setting-high-contrast').checked
        }
      };

      await storageService.set('backend', updated.backend);
      await storageService.set('isl', updated.isl);
      await storageService.set('recognition', { ...storageService.cache?.recognition, ...updated.recognition });
      await storageService.set('ui', { ...storageService.cache?.ui, ...updated.ui });

      document.body.classList.toggle('high-contrast', updated.ui.highContrast);
      showToast('Settings saved successfully', 'success');
      closeDrawer();
    });

    resetBtn?.addEventListener('click', async () => {
      await storageService.resetToDefaults();
      showToast('Reset to default preferences', 'info');
      closeDrawer();
    });
  }

  /* ================= TEMPLATE RECORDER DRAWER ================= */
  setupRecorderDrawer() {
    const recorderDrawer = $('#recorder-drawer');
    const backdrop = $('#drawer-backdrop');
    const openRecorderBtn = $('#open-recorder-btn');
    const closeRecorderBtn = $('#recorder-close-btn');
    const startRecordBtn = $('#recorder-start-btn');
    const stopRecordBtn = $('#recorder-stop-btn');
    const signSelect = $('#recorder-sign-select');
    const signerInput = $('#recorder-signer-label');
    const phaseLabel = $('#recorder-phase-label');
    const countdownBadge = $('#recorder-countdown-overlay');
    const progressFill = $('#recorder-progress-fill');

    openRecorderBtn?.addEventListener('click', () => {
      recorderDrawer.classList.add('open');
      backdrop.classList.add('open');
    });

    closeRecorderBtn?.addEventListener('click', () => {
      if (recognitionController.isRecording) {
        recognitionController.stopTemplateRecording();
      }
      recorderDrawer.classList.remove('open');
      backdrop.classList.remove('open');
    });

    let countdownTimer = null;
    let recordingProgressTimer = null;

    startRecordBtn?.addEventListener('click', () => {
      const selectedSign = signSelect.value;
      if (!selectedSign) return;

      // Ensure camera is running
      if (!this.cameraManager?.isActive) {
        showToast('Please start camera before recording', 'warning');
        return;
      }

      // Step 1: 3-Second Countdown
      startRecordBtn.style.display = 'none';
      countdownBadge.style.display = 'block';
      let count = 3;
      countdownBadge.textContent = count;
      phaseLabel.textContent = `Get ready to perform "${selectedSign}"...`;

      countdownTimer = setInterval(() => {
        count--;
        if (count > 0) {
          countdownBadge.textContent = count;
        } else {
          clearInterval(countdownTimer);
          countdownBadge.style.display = 'none';

          // Step 2: Start Recording Frames
          phaseLabel.textContent = `Recording "${selectedSign}" — Perform gesture now!`;
          stopRecordBtn.style.display = 'inline-flex';
          recognitionController.startTemplateRecording(selectedSign);

          let progress = 0;
          progressFill.style.width = '0%';
          recordingProgressTimer = setInterval(() => {
            progress += 5;
            progressFill.style.width = `${Math.min(100, progress)}%`;
            if (progress >= 100) {
              clearInterval(recordingProgressTimer);
            }
          }, 100);
        }
      }, 1000);
    });

    stopRecordBtn?.addEventListener('click', async () => {
      clearInterval(recordingProgressTimer);
      stopRecordBtn.style.display = 'none';
      startRecordBtn.style.display = 'inline-flex';
      progressFill.style.width = '0%';

      const signer = signerInput.value.trim() || 'Signer_1';
      const result = await recognitionController.stopTemplateRecording(signer);

      if (result && result.success) {
        phaseLabel.textContent = `✓ Saved template (${result.frameCount} frames) for ${result.signKey}`;
        showToast(`Template saved for ${result.signKey}`, 'success');
      } else {
        phaseLabel.textContent = '✖ Recording too short. Try again.';
        showToast('Recording failed — move hand clearly', 'error');
      }
    });
  }

  /* ================= YOUTUBE CAPTION PANEL ================= */
  setupYouTubeCaptionPanel() {
    // Instantiate CaptionSync once the avatarController is ready
    if (this.avatarController && !this.captionSync) {
      this.captionSync = new CaptionSync(this.avatarController);

      this.captionSync.onStatusUpdate(({ status, signSequence, unavailableWords }) => {
        // Update the avatar gloss panel in the sidepanel UI
        const glossLabel = $('#active-gloss-name');
        if (glossLabel && signSequence.length > 0) {
          glossLabel.textContent = signSequence[0];
        }
        this.renderGlossesTimeline(signSequence);

        // Update YouTube caption status UI if visible
        const ytStatusBadge = $('#yt-caption-status-badge');
        const ytSignList = $('#yt-caption-sign-list');
        const ytSkipped = $('#yt-caption-skipped');

        if (ytStatusBadge) {
          ytStatusBadge.textContent = status === 'playing' ? '▶ Signing' :
                                      status === 'paused'  ? '⏸ Paused' : '● Idle';
          ytStatusBadge.className = `yt-caption-status-badge status-${status}`;
        }
        if (ytSignList) {
          ytSignList.innerHTML = signSequence.length > 0
            ? signSequence.map(k => `<span class="yt-sign-chip">${k}</span>`).join('')
            : '<span class="yt-no-signs">Waiting for captions...</span>';
        }
        if (ytSkipped && unavailableWords.length > 0) {
          ytSkipped.textContent = `Skipped: ${unavailableWords.join(', ')}`;
          ytSkipped.style.display = 'block';
        } else if (ytSkipped) {
          ytSkipped.style.display = 'none';
        }
      });
    }

    // Toggle button wiring
    const toggleBtn = $('#yt-caption-sync-toggle');
    if (!toggleBtn) return;

    let isEnabled = true;
    toggleBtn.addEventListener('click', () => {
      isEnabled = !isEnabled;
      this.captionSync?.setEnabled(isEnabled);
      toggleBtn.textContent = isEnabled ? '⏸ Pause Caption Sync' : '▶ Resume Caption Sync';
      toggleBtn.className = `btn ${isEnabled ? 'btn-primary' : 'btn-secondary'} btn-sm`;

      // Notify content script on the YouTube tab
      chrome.runtime.sendMessage({
        type: 'SIGNX_YT_CAPTION_TOGGLE',
        payload: { enabled: isEnabled }
      }).catch(() => {});

      showToast(isEnabled ? 'Caption sync enabled' : 'Caption sync paused', 'info');
    });

    // YouTube API Key Save / Init in Sidepanel
    const spKeyInput = $('#sidepanel-yt-api-key');
    const spSaveBtn = $('#sidepanel-btn-save-yt-key');
    const spBadge = $('#sidepanel-yt-api-badge');
    const spVideoInput = $('#sidepanel-yt-video-url');
    const spLoadBtn = $('#sidepanel-btn-load-yt');

    const savedKey = localStorage.getItem('signx_yt_api_key') || '';
    if (savedKey) {
      if (spKeyInput) spKeyInput.value = savedKey;
      if (spBadge) {
        spBadge.textContent = 'API Key Active';
        spBadge.style.color = '#34d399';
        spBadge.style.background = 'rgba(16, 185, 129, 0.15)';
      }
    }

    spSaveBtn?.addEventListener('click', () => {
      const val = (spKeyInput?.value || '').trim();
      if (val) {
        localStorage.setItem('signx_yt_api_key', val);
        if (spBadge) {
          spBadge.textContent = 'API Key Active';
          spBadge.style.color = '#34d399';
          spBadge.style.background = 'rgba(16, 185, 129, 0.15)';
        }
        showToast('YouTube API Key saved', 'success');
      } else {
        localStorage.removeItem('signx_yt_api_key');
        if (spBadge) {
          spBadge.textContent = 'Public Mode';
          spBadge.style.color = '#94a3b8';
          spBadge.style.background = 'rgba(255, 255, 255, 0.05)';
        }
        showToast('YouTube API Key cleared', 'info');
      }
    });

    spLoadBtn?.addEventListener('click', () => {
      const url = (spVideoInput?.value || '').trim();
      if (!url) return;
      const match = url.match(/(?:youtu\.be\/|youtube\.com\/(?:embed\/|v\/|watch\?v=|watch\?.+&v=|shorts\/))([a-zA-Z0-9_-]{11})/i) || url.match(/^([a-zA-Z0-9_-]{11})$/);
      const ytId = match ? match[1] : null;
      if (ytId) {
        window.open(`https://www.youtube.com/watch?v=${ytId}`, '_blank');
        showToast(`Opening YouTube video ${ytId} in new tab`, 'info');
      } else {
        showToast('Please enter a valid YouTube link or ID', 'error');
      }
    });
  }

  /* ================= RUNTIME MESSAGE LISTENERS ================= */
  setupRuntimeListeners() {
    // Listen for text selection on webpage
    messageBus.on(MESSAGE_TYPES.SELECTED_TEXT_DETECTED, ({ text }) => {
      if (!text) return;
      const input = $('#text-to-translate');
      if (input) {
        input.value = text;
        $('#char-counter').textContent = `${text.length} chars`;
        this.triggerTranslation();
        showToast('Web text loaded into SignX', 'info');
      }
    });

    // Phase 5: YouTube caption update → CaptionSync (primary path)
    // Direct runtime message from youtube-caption.js → background → here
    chrome.runtime.onMessage.addListener((message) => {
      if (message.type === 'SIGNX_YOUTUBE_CAPTION_UPDATE' && this.captionSync) {
        const { signSequence, unavailableWords } = message.payload || {};
        if (Array.isArray(signSequence) && signSequence.length > 0) {
          this.captionSync.ingestSequence(signSequence, unavailableWords || []);
        }
      }
      // Player pause/resume
      if (message.type === 'SIGNX_YT_PLAYER_PAUSED' && this.captionSync) {
        this.captionSync.pause();
      }
      if (message.type === 'SIGNX_YT_PLAYER_RESUMED' && this.captionSync) {
        this.captionSync.resume();
      }
    });

    // Legacy: messageBus YouTube captions (backward compat with youtube-observer.js)
    messageBus.on(MESSAGE_TYPES.YOUTUBE_CAPTION_UPDATE, ({ caption }) => {
      if (!caption) return;
      logger.info('YouTube Caption (legacy) received:', caption);
      const converted = ISLGrammarConverter.convert(caption);
      this.renderGlossesTimeline(converted.glossSequence);
      if (this.captionSync) {
        this.captionSync.ingestSequence(converted.glossSequence);
      } else {
        this.avatarController.playSequence(converted.glossSequence);
      }
    });
  }
}

// Initialize on DOM load
document.addEventListener('DOMContentLoaded', () => {
  const app = new SidePanelApp();
  app.init();
});
