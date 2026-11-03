/**
 * SignX - Ollama Cloud & Local LLM Integration Service
 * Converts English natural language to Indian Sign Language (ISL) SOV Gloss notation.
 */

import { storageService } from './storage-service.js';
import { logger } from '../utils/logger.js';

class OllamaService {
  constructor() {
    this.endpoint = 'https://api.ollama.ai/v1';
    this.model = 'llama3.2';
  }

  async getConfig() {
    const ollamaConfig = await storageService.get('ollama', {});
    return {
      endpoint: ollamaConfig.endpoint || this.endpoint,
      model: ollamaConfig.model || this.model,
      apiKey: ollamaConfig.apiKey || '',
      customPrompt: ollamaConfig.customPrompt || 'Convert the following English text to Indian Sign Language (ISL) gloss sequence in SOV format. Output ONLY space-separated uppercase glosses.',
      timeoutMs: ollamaConfig.timeoutMs || 15000
    };
  }

  /**
   * Translates English text to ISL Glosses using Ollama
   * @param {string} text - Input English text
   * @returns {Promise<{success: boolean, glosses: string[], rawResponse?: string, error?: string}>}
   */
  async textToISLGloss(text) {
    if (!text || text.trim() === '') {
      return { success: false, glosses: [], error: 'Input text is empty' };
    }

    const config = await this.getConfig();

    // Check if API key or local host is configured
    if (!config.apiKey && !config.endpoint.includes('localhost') && !config.endpoint.includes('127.0.0.1')) {
      logger.info('Ollama API key not configured. Fallback to offline rule-based dictionary engine.');
      return {
        success: false,
        glosses: [],
        error: 'API_KEY_REQUIRED',
        message: 'Ollama API Key not set in Settings. Using built-in offline ISL grammar engine.'
      };
    }

    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), config.timeoutMs);

      const url = `${config.endpoint.replace(/\/+$/, '')}/chat/completions`;
      const headers = {
        'Content-Type': 'application/json'
      };

      if (config.apiKey) {
        headers['Authorization'] = `Bearer ${config.apiKey}`;
      }

      const body = {
        model: config.model,
        messages: [
          { role: 'system', content: config.customPrompt },
          { role: 'user', content: text }
        ],
        temperature: 0.1,
        stream: false
      };

      const response = await fetch(url, {
        method: 'POST',
        headers,
        body: JSON.stringify(body),
        signal: controller.signal
      });

      clearTimeout(timeoutId);

      if (!response.ok) {
        throw new Error(`Ollama API error: ${response.status} ${response.statusText}`);
      }

      const data = await response.json();
      const rawContent = data.choices?.[0]?.message?.content?.trim() || '';
      
      // Clean and split glosses
      const glosses = rawContent
        .replace(/[^a-zA-Z0-9\s_-]/g, '')
        .toUpperCase()
        .split(/\s+/)
        .filter(Boolean);

      logger.info('Ollama gloss translation complete:', glosses);
      return {
        success: true,
        glosses,
        rawResponse: rawContent
      };
    } catch (err) {
      logger.error('Ollama translation request failed:', err);
      return {
        success: false,
        glosses: [],
        error: err.name === 'AbortError' ? 'Request timed out' : err.message
      };
    }
  }

  /**
   * Test connection to Ollama endpoint
   */
  async testConnection() {
    const config = await this.getConfig();
    try {
      const url = `${config.endpoint.replace(/\/+$/, '')}/models`;
      const headers = {};
      if (config.apiKey) headers['Authorization'] = `Bearer ${config.apiKey}`;

      const res = await fetch(url, { headers });
      return { ok: res.ok, status: res.status };
    } catch (err) {
      return { ok: false, error: err.message };
    }
  }
}

export const ollamaService = new OllamaService();
