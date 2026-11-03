/**
 * SignX - Chrome Storage & Settings Management Service
 * Safe persistence for user configurations, API credentials, and preferences.
 */

import { logger } from '../utils/logger.js';

class StorageService {
  constructor() {
    this.cache = null;
    this.initialized = false;
  }

  async init() {
    if (this.initialized) return this.cache;

    try {
      // Load default settings file
      const defaultUrl = chrome.runtime?.getURL ? chrome.runtime.getURL('data/default-settings.json') : '../data/default-settings.json';
      const response = await fetch(defaultUrl);
      const defaults = await response.json();

      const stored = await this.getAll();
      this.cache = this.deepMerge(defaults, stored);
      this.initialized = true;
      logger.info('StorageService initialized');
      return this.cache;
    } catch (err) {
      logger.error('Failed to initialize storage defaults:', err);
      this.cache = {};
      return this.cache;
    }
  }

  async get(key, defaultValue = null) {
    await this.init();
    if (this.cache && this.cache[key] !== undefined) {
      return this.cache[key];
    }

    try {
      if (typeof chrome !== 'undefined' && chrome.storage?.local) {
        const result = await chrome.storage.local.get(key);
        return result[key] !== undefined ? result[key] : defaultValue;
      } else {
        const item = localStorage.getItem(`signx_${key}`);
        return item ? JSON.parse(item) : defaultValue;
      }
    } catch (err) {
      logger.error(`Storage get error for key "${key}":`, err);
      return defaultValue;
    }
  }

  async set(key, value) {
    await this.init();
    this.cache[key] = value;

    try {
      if (typeof chrome !== 'undefined' && chrome.storage?.local) {
        await chrome.storage.local.set({ [key]: value });
      } else {
        localStorage.setItem(`signx_${key}`, JSON.stringify(value));
      }
      logger.log(`Storage updated for key "${key}"`);
      return true;
    } catch (err) {
      logger.error(`Storage set error for key "${key}":`, err);
      return false;
    }
  }

  async getAll() {
    try {
      if (typeof chrome !== 'undefined' && chrome.storage?.local) {
        return await chrome.storage.local.get(null);
      } else {
        const result = {};
        for (let i = 0; i < localStorage.length; i++) {
          const k = localStorage.key(i);
          if (k.startsWith('signx_')) {
            const actualKey = k.replace('signx_', '');
            result[actualKey] = JSON.parse(localStorage.getItem(k));
          }
        }
        return result;
      }
    } catch (err) {
      logger.error('Failed to fetch all storage:', err);
      return {};
    }
  }

  async resetToDefaults() {
    try {
      if (typeof chrome !== 'undefined' && chrome.storage?.local) {
        await chrome.storage.local.clear();
      } else {
        const keysToRemove = [];
        for (let i = 0; i < localStorage.length; i++) {
          const k = localStorage.key(i);
          if (k.startsWith('signx_')) keysToRemove.push(k);
        }
        keysToRemove.forEach(k => localStorage.removeItem(k));
      }
      this.initialized = false;
      return await this.init();
    } catch (err) {
      logger.error('Failed to reset storage:', err);
      return false;
    }
  }

  deepMerge(target, source) {
    const output = { ...target };
    if (this.isObject(target) && this.isObject(source)) {
      Object.keys(source).forEach(key => {
        if (this.isObject(source[key])) {
          if (!(key in target)) {
            Object.assign(output, { [key]: source[key] });
          } else {
            output[key] = this.deepMerge(target[key], source[key]);
          }
        } else {
          Object.assign(output, { [key]: source[key] });
        }
      });
    }
    return output;
  }

  isObject(item) {
    return (item && typeof item === 'object' && !Array.isArray(item));
  }
}

export const storageService = new StorageService();
