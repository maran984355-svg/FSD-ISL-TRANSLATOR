/**
 * SignX - Sign-to-Text Client Service (Extension Side)
 * Connects browser extension to the secure backend service.
 * NEVER handles API keys directly. Automatically falls back to deterministic synthesizer if offline.
 */

import { storageService } from './storage-service.js';
import { logger } from '../utils/logger.js';
import { SentenceBuilder } from '../recognition/sentence-builder.js';

class SignToTextClient {
  constructor() {
    this.defaultBackendUrl = 'http://localhost:3001/api';
    this.timeoutMs = 8000;
  }

  async getBackendUrl() {
    const config = await storageService.get('backend', {});
    return (config.url || this.defaultBackendUrl).replace(/\/+$/, '');
  }

  /**
   * Convert recognized sign tokens to natural English text
   * @param {string[]|object[]} tokens - Array of sign tokens
   * @param {number} confidence - Average DTW confidence
   * @returns {Promise<{ recognized_tokens: string[], display_text: string, confidence: number, status: string, source: string, model?: string }>}
   */
  async convertTokensToText(tokens, confidence = 1.0) {
    if (!tokens || tokens.length === 0) {
      return {
        recognized_tokens: [],
        display_text: '',
        confidence: 0,
        status: 'empty',
        source: 'none'
      };
    }

    const tokenKeys = tokens.map(t => (typeof t === 'string' ? t.toUpperCase() : (t.key || '').toUpperCase())).filter(Boolean);
    const rawText = tokens.map(t => (typeof t === 'string' ? t : (t.text || t.key || ''))).join(' ');

    const backendUrl = await this.getBackendUrl();

    // 1. Attempt Secure Backend Call (Ollama Cloud)
    try {
      logger.info(`Sending ${tokenKeys.length} tokens to backend: ${backendUrl}/sign-to-text`);
      
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), this.timeoutMs);

      const response = await fetch(`${backendUrl}/sign-to-text`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          tokens: tokenKeys,
          confidence,
          rawText
        }),
        signal: controller.signal
      });

      clearTimeout(timeoutId);

      if (response.ok) {
        const data = await response.json();
        if (data.status === 'success' && data.display_text) {
          logger.info('Received synthesized text from Ollama Cloud backend:', data.display_text);
          return data;
        }
      }
      
      logger.warn(`Backend responded with status ${response.status}. Switching to deterministic fallback.`);
    } catch (err) {
      logger.warn(`Backend unreachable (${err.message}). Using deterministic ISL sentence builder fallback.`);
    }

    // 2. Seamless Deterministic Offline Fallback
    const fallbackText = SentenceBuilder.buildFallbackSentence(tokenKeys);
    logger.info('Synthesized text via deterministic fallback engine:', fallbackText);

    return {
      recognized_tokens: tokenKeys,
      display_text: fallbackText,
      confidence: typeof confidence === 'number' ? Number(confidence.toFixed(2)) : 1.0,
      status: 'success',
      source: 'deterministic_fallback',
      model: 'rule_based_fallback'
    };
  }

  /**
   * Check if backend service and Ollama are reachable
   */
  async checkBackendStatus() {
    const backendUrl = await this.getBackendUrl();
    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 2500);

      const res = await fetch(`${backendUrl}/health`, { signal: controller.signal });
      clearTimeout(timeoutId);

      if (res.ok) {
        const json = await res.json();
        return {
          connected: true,
          ollamaReachable: Boolean(json.ollamaConnectivity?.reachable),
          model: json.config?.ollama?.model || 'qwen3:8b',
          service: json.service
        };
      }
      return { connected: false, error: `HTTP ${res.status}` };
    } catch (err) {
      return { connected: false, error: err.message };
    }
  }
}

export const signToTextClient = new SignToTextClient();
