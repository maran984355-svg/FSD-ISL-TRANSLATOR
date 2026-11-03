/**
 * SignX - DOM Utilities and Accessible Helper Functions
 */

export const $ = (selector, context = document) => context.querySelector(selector);
export const $$ = (selector, context = document) => Array.from(context.querySelectorAll(selector));

export function setElementStatus(el, statusText, statusClass = 'neutral') {
  if (!el) return;
  el.textContent = statusText;
  el.className = `status-badge status-${statusClass}`;
  el.setAttribute('aria-label', `Status: ${statusText}`);
}

export function createElement(tag, attributes = {}, children = []) {
  const el = document.createElement(tag);
  
  for (const [key, value] of Object.entries(attributes)) {
    if (key === 'className') {
      el.className = value;
    } else if (key === 'dataset') {
      for (const [dKey, dVal] of Object.entries(value)) {
        el.dataset[dKey] = dVal;
      }
    } else if (key.startsWith('on') && typeof value === 'function') {
      el.addEventListener(key.slice(2).toLowerCase(), value);
    } else {
      el.setAttribute(key, value);
    }
  }

  children.forEach(child => {
    if (typeof child === 'string') {
      el.appendChild(document.createTextNode(child));
    } else if (child instanceof HTMLElement) {
      el.appendChild(child);
    }
  });

  return el;
}

export function debounce(func, waitMs = 250) {
  let timeout;
  return function (...args) {
    clearTimeout(timeout);
    timeout = setTimeout(() => func.apply(this, args), waitMs);
  };
}

export function formatTimestamp(date = new Date()) {
  return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' });
}
