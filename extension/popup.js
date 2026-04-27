(function () {
  'use strict';

  const { getSettings, setSettings, getLanguages } = window.MAR_SETTINGS;

  const fields = {
    autoRecord: document.getElementById('autoRecord'),
    autoConfigureCalendar: document.getElementById('autoConfigureCalendar'),
    transcription: document.getElementById('transcription'),
    geminiNotes: document.getElementById('geminiNotes'),
    captions: document.getElementById('captions'),
    language: document.getElementById('language'),
    preferredCalendar: document.getElementById('preferredCalendar'),
    showBanners: document.getElementById('showBanners')
  };
  const statusEl = document.getElementById('status');
  const versionEl = document.getElementById('version');

  if (chrome?.runtime?.getManifest) {
    versionEl.textContent = 'v' + chrome.runtime.getManifest().version;
  }

  let saveTimer = null;
  function scheduleSave() {
    clearTimeout(saveTimer);
    saveTimer = setTimeout(save, 150);
  }

  async function save() {
    const patch = {
      autoRecord: fields.autoRecord.checked,
      autoConfigureCalendar: fields.autoConfigureCalendar.checked,
      transcription: fields.transcription.checked,
      geminiNotes: fields.geminiNotes.checked,
      captions: fields.captions.checked,
      language: fields.language.value,
      preferredCalendar: fields.preferredCalendar.value.trim(),
      showBanners: fields.showBanners.checked
    };
    await setSettings(patch);
    flashStatus('Saved');
  }

  function flashStatus(text) {
    statusEl.textContent = text;
    statusEl.classList.add('visible');
    clearTimeout(flashStatus._t);
    flashStatus._t = setTimeout(() => statusEl.classList.remove('visible'), 1200);
  }

  (async function init() {
    const [s, languages] = await Promise.all([getSettings(), getLanguages()]);

    // Populate language dropdown from captured list (or defaults on first run).
    fields.language.innerHTML = '';
    for (const lang of languages) {
      const opt = document.createElement('option');
      opt.value = lang;
      opt.textContent = lang;
      fields.language.appendChild(opt);
    }
    // Keep the user's saved language even if it's not in the currently-captured list.
    if (s.language && !languages.includes(s.language)) {
      const opt = document.createElement('option');
      opt.value = s.language;
      opt.textContent = s.language;
      fields.language.appendChild(opt);
    }

    fields.autoRecord.checked = s.autoRecord;
    fields.autoConfigureCalendar.checked = s.autoConfigureCalendar !== false;
    fields.transcription.checked = s.transcription;
    fields.geminiNotes.checked = s.geminiNotes;
    fields.captions.checked = s.captions;
    fields.language.value = s.language;
    fields.preferredCalendar.value = s.preferredCalendar || '';
    fields.showBanners.checked = s.showBanners;

    for (const el of Object.values(fields)) {
      el.addEventListener('change', scheduleSave);
      el.addEventListener('input', scheduleSave);
    }
  })();
})();
