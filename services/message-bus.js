/**
 * SignX - Message Bus
 * Standardized cross-component messaging protocol for Manifest V3.
 * Supports: SidePanel <-> Background <-> Content Script <-> Floating Overlay
 */

import { logger } from '../utils/logger.js';

export const MESSAGE_TYPES = {
  // Navigation & UI
  OPEN_SIDE_PANEL: 'SIGNX_OPEN_SIDE_PANEL',
  TOGGLE_FLOATING_AVATAR: 'SIGNX_TOGGLE_FLOATING_AVATAR',
  PING: 'SIGNX_PING',
  
  // Translation & Text
  TRANSLATE_TEXT_TO_ISL: 'SIGNX_TRANSLATE_TEXT_TO_ISL',
  PLAY_GLOSS_SEQUENCE: 'SIGNX_PLAY_GLOSS_SEQUENCE',
  SELECTED_TEXT_DETECTED: 'SIGNX_SELECTED_TEXT_DETECTED',
  YOUTUBE_CAPTION_UPDATE: 'SIGNX_YOUTUBE_CAPTION_UPDATE',
  
  // Recognition & Camera
  CAMERA_STATUS_CHANGED: 'SIGNX_CAMERA_STATUS_CHANGED',
  LANDMARKS_DETECTED: 'SIGNX_LANDMARKS_DETECTED',
  GESTURE_RECOGNIZED: 'SIGNX_GESTURE_RECOGNIZED',
  RECOGNITION_CONFIDENCE: 'SIGNX_RECOGNITION_CONFIDENCE',
  
  // Settings
  SETTINGS_UPDATED: 'SIGNX_SETTINGS_UPDATED'
};

class MessageBus {
  constructor() {
    this.listeners = new Map();
    this.setupGlobalListener();
  }

  setupGlobalListener() {
    if (typeof chrome !== 'undefined' && chrome.runtime?.onMessage) {
      chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
        if (!message || !message.type || !message.type.startsWith('SIGNX_')) {
          return false;
        }

        logger.log(`Message received: ${message.type}`, message.payload);
        const handlers = this.listeners.get(message.type) || [];
        
        // Execute handlers
        let isAsync = false;
        handlers.forEach(handler => {
          const result = handler(message.payload, sender, sendResponse);
          if (result === true) isAsync = true;
        });

        return isAsync;
      });
    }
  }

  on(type, callback) {
    if (!this.listeners.has(type)) {
      this.listeners.set(type, []);
    }
    this.listeners.get(type).push(callback);
    return () => this.off(type, callback);
  }

  off(type, callback) {
    if (!this.listeners.has(type)) return;
    const list = this.listeners.get(type).filter(fn => fn !== callback);
    this.listeners.set(type, list);
  }

  /**
   * Send message to background service worker or open side panels
   */
  async sendToRuntime(type, payload = {}) {
    try {
      if (typeof chrome !== 'undefined' && chrome.runtime?.sendMessage) {
        return await chrome.runtime.sendMessage({ type, payload });
      }
    } catch (err) {
      logger.warn(`Could not send runtime message ${type}:`, err.message);
    }
    return null;
  }

  /**
   * Send message to the active tab's content script
   */
  async sendToActiveTab(type, payload = {}) {
    try {
      if (typeof chrome !== 'undefined' && chrome.tabs) {
        const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
        if (tab?.id) {
          return await chrome.tabs.sendMessage(tab.id, { type, payload });
        }
      }
    } catch (err) {
      logger.warn(`Could not send message ${type} to active tab:`, err.message);
    }
    return null;
  }
}

export const messageBus = new MessageBus();
