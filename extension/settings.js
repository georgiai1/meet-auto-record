/**
 * Meet Auto Record — shared settings helpers
 * Loaded into both content scripts and the popup.
 */
(function (global) {
  'use strict';

  const DEFAULTS = {
    language: 'English',
    autoRecord: true,
    transcription: true,
    geminiNotes: true,
    captions: false,
    preferredAuthuser: null, // number (0-9) or null = no preference
    preferredCalendar: '',   // calendar name (substring match) to auto-select in event editor
    showBanners: true
  };

  // Default list is replaced with whatever Google Meet's Calendar Settings
  // iframe actually exposes the first time the user opens "Video call options".
  // These defaults match Meet's current supported set (2026-04) so the popup
  // isn't empty on first run.
  const DEFAULT_LANGUAGES = [
    'English',
    'French',
    'German',
    'Italian',
    'Japanese',
    'Korean',
    'Portuguese (Brazil)',
    'Spanish'
  ];

  async function getLanguages() {
    if (!global.chrome?.storage?.local) return [...DEFAULT_LANGUAGES];
    return new Promise((resolve) => {
      chrome.storage.local.get({ capturedLanguages: null }, (items) => {
        const list = Array.isArray(items.capturedLanguages) && items.capturedLanguages.length > 0
          ? items.capturedLanguages
          : DEFAULT_LANGUAGES;
        resolve([...list]);
      });
    });
  }

  async function saveLanguages(list) {
    if (!global.chrome?.storage?.local) return;
    if (!Array.isArray(list) || list.length === 0) return;
    return new Promise((resolve) => {
      chrome.storage.local.set({ capturedLanguages: list, capturedLanguagesAt: Date.now() }, resolve);
    });
  }

  async function getSettings() {
    if (!global.chrome?.storage?.sync) return { ...DEFAULTS };
    return new Promise((resolve) => {
      chrome.storage.sync.get(DEFAULTS, (items) => {
        resolve({ ...DEFAULTS, ...items });
      });
    });
  }

  async function setSettings(patch) {
    if (!global.chrome?.storage?.sync) return;
    return new Promise((resolve) => {
      chrome.storage.sync.set(patch, resolve);
    });
  }

  function onSettingsChange(cb) {
    if (!global.chrome?.storage?.onChanged) return;
    chrome.storage.onChanged.addListener((changes, area) => {
      if (area !== 'sync') return;
      const patch = {};
      for (const [key, { newValue }] of Object.entries(changes)) {
        patch[key] = newValue;
      }
      cb(patch);
    });
  }

  global.MAR_SETTINGS = {
    DEFAULTS,
    DEFAULT_LANGUAGES,
    // Legacy alias — popup.js reads this. Resolves to the captured list (or defaults).
    get LANGUAGES() { return [...DEFAULT_LANGUAGES]; },
    getSettings,
    setSettings,
    onSettingsChange,
    getLanguages,
    saveLanguages
  };
})(typeof window !== 'undefined' ? window : globalThis);
