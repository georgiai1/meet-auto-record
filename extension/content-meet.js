/**
 * Meet Auto Record - Google Meet Content Script
 * Handles both Calendar Settings iframe and actual Meet calls
 */

(function() {
  'use strict';

  // ============================================
  // Configuration
  // ============================================

  const CONFIG = {
    LANGUAGE: 'English',
    AUTO_START_DELAY: 3000, // Wait 3 seconds after joining before auto-starting
    CHECK_INTERVAL: 1000,
    MAX_RETRIES: 10,
    TOAST_DURATION: 5000
  };

  // Populated from chrome.storage.sync via settings.js. Defaults applied until loaded.
  let SETTINGS = window.MAR_SETTINGS?.DEFAULTS
    ? { ...window.MAR_SETTINGS.DEFAULTS }
    : {
        language: 'English',
        autoRecord: true,
        transcription: true,
        geminiNotes: true,
        captions: false,
        showBanners: true
      };

  if (window.MAR_SETTINGS) {
    window.MAR_SETTINGS.getSettings().then((s) => {
      SETTINGS = s;
      CONFIG.LANGUAGE = s.language || CONFIG.LANGUAGE;
    });
    window.MAR_SETTINGS.onSettingsChange((patch) => {
      SETTINGS = { ...SETTINGS, ...patch };
      if (patch.language) CONFIG.LANGUAGE = patch.language;
    });
  }

  // ============================================
  // Context Detection (reactive — Meet uses SPA nav)
  // ============================================

  function computeContext() {
    const url = window.location.href;
    const path = window.location.pathname || '';
    return {
      url,
      isCalendarSettings: url.includes('calendarsettings'),
      // Meet room path is e.g. /vdw-fvmp-kcu — 3+ letter segments, dash-separated.
      // Landing pages like "/", "/new", "/landing" don't match.
      isMeetCall: /^\/[a-z]{3,}-[a-z]{3,}-[a-z]{3,}(?:\/|$|\?)/.test(path)
    };
  }

  let CONTEXT = computeContext();
  let toastContainer = null;
  let hasAttemptedAutoRecord = false;
  let isProcessing = false;
  let meetCallSetupDone = false;
  let autoRecordAttempts = 0;
  let autoRecordAbandoned = false;
  const MAX_AUTO_RECORD_ATTEMPTS = 2;

  const MAR_VERSION = chrome?.runtime?.getManifest?.()?.version || 'dev';
  console.log(`[Meet Auto Record v${MAR_VERSION}] loaded`, CONTEXT);

  // ============================================
  // Toast Notification System
  // ============================================

  function createToastContainer() {
    if (toastContainer && document.body.contains(toastContainer)) return toastContainer;

    toastContainer = document.createElement('div');
    toastContainer.className = 'mar-toast-container';
    toastContainer.id = 'mar-toast-container';
    document.body.appendChild(toastContainer);
    return toastContainer;
  }

  function showToast(type, title, message, duration = CONFIG.TOAST_DURATION) {
    const container = createToastContainer();

    const icons = {
      success: `<svg class="mar-toast-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/><polyline points="22 4 12 14.01 9 11.01"/></svg>`,
      error: `<svg class="mar-toast-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><line x1="15" y1="9" x2="9" y2="15"/><line x1="9" y1="9" x2="15" y2="15"/></svg>`,
      info: `<svg class="mar-toast-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><line x1="12" y1="16" x2="12" y2="12"/><line x1="12" y1="8" x2="12.01" y2="8"/></svg>`,
      warning: `<svg class="mar-toast-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg>`
    };

    const toast = document.createElement('div');
    toast.className = `mar-toast mar-toast-${type}`;
    toast.innerHTML = `
      ${icons[type]}
      <div class="mar-toast-content">
        <div class="mar-toast-title">${title}</div>
        <div class="mar-toast-message">${message}</div>
      </div>
      <button class="mar-toast-close">&times;</button>
    `;

    const closeBtn = toast.querySelector('.mar-toast-close');
    closeBtn.addEventListener('click', () => hideToast(toast));

    container.appendChild(toast);

    if (duration > 0) {
      setTimeout(() => hideToast(toast), duration);
    }

    return toast;
  }

  function hideToast(toast) {
    if (!toast || !toast.parentNode) return;
    toast.classList.add('mar-toast-hiding');
    setTimeout(() => toast.remove(), 300);
  }

  // ============================================
  // Activity Indicator
  // ============================================

  function showIndicator(message) {
    hideIndicator();
    const indicator = document.createElement('div');
    indicator.className = 'mar-indicator';
    indicator.id = 'mar-indicator';
    indicator.innerHTML = `
      <div class="mar-indicator-spinner"></div>
      <span>${message}</span>
    `;
    document.body.appendChild(indicator);
    return indicator;
  }

  function hideIndicator() {
    const indicator = document.getElementById('mar-indicator');
    if (indicator) indicator.remove();
  }

  // ============================================
  // Utility Functions
  // ============================================

  function sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  function waitForElement(selector, timeout = 10000, parent = document) {
    return new Promise((resolve, reject) => {
      const startTime = Date.now();

      const check = () => {
        const element = parent.querySelector(selector);
        if (element) {
          resolve(element);
          return;
        }

        if (Date.now() - startTime > timeout) {
          reject(new Error(`Element not found: ${selector}`));
          return;
        }

        requestAnimationFrame(check);
      };

      check();
    });
  }

  function findElementByText(text, selector = '*') {
    const elements = document.querySelectorAll(selector);
    for (const el of elements) {
      if (el.textContent?.trim() === text || el.textContent?.includes(text)) {
        return el;
      }
    }
    return null;
  }

  function findButtonByAriaLabel(label) {
    return document.querySelector(`button[aria-label*="${label}"], [role="button"][aria-label*="${label}"]`);
  }

  function clickElement(element) {
    if (!element) return false;
    element.click();
    return true;
  }

  // ============================================
  // CALENDAR SETTINGS IFRAME HANDLERS
  // ============================================

  async function handleCalendarSettings() {
    console.log('[Meet Auto Record] Handling Calendar Settings iframe');
    showIndicator('Configuring meeting settings...');

    try {
      await sleep(1000); // Wait for iframe to fully load

      // Step 1: Click on "Meeting records" tab
      const meetingRecordsTab = await findAndClickTab('Meeting records');
      if (!meetingRecordsTab) {
        throw new Error('Could not find Meeting records tab');
      }
      await sleep(500);

      // Step 2: Select language (English)
      await selectLanguage(CONFIG.LANGUAGE);
      await sleep(300);

      // Step 3: Enable all checkboxes
      await enableAllRecordingOptions();
      await sleep(300);

      // Step 4: Click Save
      const saved = await clickSaveButton();

      hideIndicator();

      if (saved) {
        showToast('success', 'Meet Auto Record', 'Recording settings configured successfully!');
      }

    } catch (error) {
      console.error('[Meet Auto Record] Calendar settings error:', error);
      hideIndicator();
      showToast('error', 'Meet Auto Record', `Failed to configure settings: ${error.message}`);
    }
  }

  async function findAndClickTab(tabName) {
    // Find tab by role and name
    const tabs = document.querySelectorAll('[role="tab"]');
    for (const tab of tabs) {
      if (tab.textContent?.includes(tabName) || tab.getAttribute('aria-label')?.includes(tabName)) {
        tab.click();
        console.log(`[Meet Auto Record] Clicked tab: ${tabName}`);
        return tab;
      }
    }

    // Try finding by description attribute
    const tabByDesc = document.querySelector(`[role="tab"][description*="${tabName}"]`);
    if (tabByDesc) {
      tabByDesc.click();
      console.log(`[Meet Auto Record] Clicked tab by description: ${tabName}`);
      return tabByDesc;
    }

    return null;
  }

  async function captureLanguagesFromDropdown() {
    if (!window.MAR_SETTINGS?.saveLanguages) return;
    const rawOptions = document.querySelectorAll('[role="option"], option');
    const names = [];
    const seen = new Set();
    for (const opt of rawOptions) {
      // Each option renders as e.g. "French\nALPHA". Strip the "ALPHA"/"BETA" tag.
      const raw = (opt.textContent || opt.value || '').trim();
      if (!raw) continue;
      const clean = raw.replace(/\b(ALPHA|BETA|NEW|PREVIEW)\b/gi, '').replace(/\s+/g, ' ').trim();
      if (!clean || /select a language/i.test(clean)) continue;
      if (seen.has(clean)) continue;
      seen.add(clean);
      names.push(clean);
    }
    if (names.length > 0) {
      await window.MAR_SETTINGS.saveLanguages(names);
      console.log('[Meet Auto Record] Captured supported languages:', names);
    }
  }

  async function selectLanguage(language) {
    // Find the language dropdown
    const languageSelect = document.querySelector('select, [role="listbox"], [role="combobox"]');

    if (!languageSelect) {
      console.log('[Meet Auto Record] Language dropdown not found, might already be set');
      return;
    }

    // Click to open dropdown
    languageSelect.click();
    await sleep(400);

    // Capture the list of supported languages before we pick one.
    await captureLanguagesFromDropdown();

    // Find and click the language option
    const options = document.querySelectorAll('[role="option"], option');
    for (const option of options) {
      const text = (option.textContent || option.value || '').replace(/\b(ALPHA|BETA|NEW|PREVIEW)\b/gi, '').trim();
      if (text === language || text.toLowerCase() === language.toLowerCase()) {
        option.click();
        console.log(`[Meet Auto Record] Selected language: ${language}`);
        return;
      }
    }

    // Fallback: substring match (e.g. "Portuguese" → "Portuguese (Brazil)")
    for (const option of options) {
      if (option.textContent?.includes(language)) {
        option.click();
        console.log(`[Meet Auto Record] Selected language by substring: ${language}`);
        return;
      }
    }
  }

  async function enableAllRecordingOptions() {
    const checkboxes = document.querySelectorAll('[role="checkbox"], input[type="checkbox"]');

    for (const checkbox of checkboxes) {
      const label = checkbox.textContent ||
                    checkbox.getAttribute('aria-label') ||
                    checkbox.parentElement?.textContent || '';

      // Map category -> user setting. For the Calendar Settings iframe we also
      // manage the "Record meeting" checkbox itself: it follows autoRecord.
      let shouldEnable = null;
      if (/gemini|notes/i.test(label)) shouldEnable = SETTINGS.geminiNotes !== false;
      else if (/transcribe|transcript/i.test(label)) shouldEnable = SETTINGS.transcription !== false;
      else if (/caption/i.test(label)) shouldEnable = SETTINGS.captions === true;
      else if (/record/i.test(label)) shouldEnable = SETTINGS.autoRecord !== false;
      else continue;

      const isChecked = checkbox.getAttribute('aria-checked') === 'true' ||
                       checkbox.checked === true ||
                       checkbox.getAttribute('checked') !== null;

      if (shouldEnable && !isChecked && !checkbox.disabled) {
        checkbox.click();
        console.log(`[Meet Auto Record] Enabled: ${label.substring(0, 50)}`);
        await sleep(200);
      } else if (!shouldEnable && isChecked && !checkbox.disabled) {
        checkbox.click();
        console.log(`[Meet Auto Record] Disabled (per settings): ${label.substring(0, 50)}`);
        await sleep(200);
      }
    }
  }

  async function clickSaveButton() {
    // Find Save button
    const saveButton = findElementByText('Save', 'button') ||
                       document.querySelector('button[aria-label*="Save"]');

    if (saveButton && !saveButton.disabled) {
      saveButton.click();
      console.log('[Meet Auto Record] Clicked Save button');
      return true;
    }

    console.log('[Meet Auto Record] Save button not found or disabled');
    return false;
  }

  // ============================================
  // MEET CALL HANDLERS
  // ============================================

  function isRecordingActive() {
    // High-signal checks only — avoid matching the word "Recording" in random UI.
    if (document.querySelector('[aria-label*="Stop recording" i]')) return true;
    if (document.querySelector('button[aria-label*="recording" i][aria-label*="stop" i]')) return true;

    // The red "REC" pill / "This call is being recorded" banner.
    const banners = document.querySelectorAll('[role="status"], [aria-live], [data-self-name]');
    for (const el of banners) {
      const t = (el.textContent || '').toLowerCase();
      if (t.includes('this call is being recorded') ||
          t.includes('this meeting is being recorded') ||
          t.includes('recording has started')) {
        return true;
      }
    }

    // Generic fallback — match exact indicator phrases anywhere on page.
    if (findElementByText('This call is being recorded') ||
        findElementByText('This meeting is being recorded')) {
      return true;
    }

    return false;
  }

  function isInActiveMeeting() {
    // Check if we're in an active meeting (not lobby)
    const callControls = document.querySelector('[aria-label*="Leave call"], [aria-label*="Turn on microphone"], [aria-label*="Turn off microphone"]');
    return !!callControls;
  }

  function canUserRecord() {
    // Check if user has recording permission
    // If Recording option exists in Meeting tools, user can record
    // This will be verified when we try to access the recording panel
    return true; // Will be validated during the recording attempt
  }

  async function abandonAutoRecord(reason) {
    autoRecordAbandoned = true;
    hasAttemptedAutoRecord = true;
    isProcessing = false;
    hideIndicator();
    try { await closeMeetingToolsPanel(); } catch (_) {}
    console.log('[Meet Auto Record] Giving up for this call:', reason);
  }

  async function startAutoRecording() {
    if (autoRecordAbandoned) {
      console.log('[Meet Auto Record] Already abandoned for this call');
      return;
    }
    if (hasAttemptedAutoRecord || isProcessing) {
      console.log('[Meet Auto Record] Already attempted or processing');
      return;
    }

    if (!SETTINGS.autoRecord) {
      console.log('[Meet Auto Record] Auto-record disabled in settings');
      hasAttemptedAutoRecord = true;
      return;
    }

    if (!isInActiveMeeting()) {
      console.log('[Meet Auto Record] Not in active meeting yet');
      return;
    }

    if (isRecordingActive()) {
      console.log('[Meet Auto Record] Recording already active — standing down');
      if (SETTINGS.showBanners) {
        showToast('info', 'Meet Auto Record', 'Recording is already active — nothing to do');
      }
      hasAttemptedAutoRecord = true;
      return;
    }

    isProcessing = true;
    hasAttemptedAutoRecord = true;
    autoRecordAttempts++;
    showIndicator('Starting recording...');
    console.log(`[Meet Auto Record] Attempt ${autoRecordAttempts}/${MAX_AUTO_RECORD_ATTEMPTS}`);

    try {
      // Step 1: Open Meeting tools panel
      const meetingToolsOpened = await openMeetingTools();
      if (!meetingToolsOpened) {
        throw new Error('Could not open Meeting tools');
      }
      await sleep(700);

      // Re-check after the panel opens — recording banner sometimes appears late,
      // and the side panel exposes a "Stop recording" item when recording is live.
      if (isRecordingActive() || document.querySelector('[aria-label*="Stop recording" i]')) {
        console.log('[Meet Auto Record] Detected active recording after opening panel — aborting');
        await closeMeetingToolsPanel();
        hideIndicator();
        if (SETTINGS.showBanners) {
          showToast('info', 'Meet Auto Record', 'Recording is already active — nothing to do');
        }
        return;
      }

      // Step 2: Click on Recording option
      const recordingClicked = await clickRecordingOption();
      if (!recordingClicked) {
        // Did the panel populate with other tools? If yes, Record is genuinely
        // missing (non-Workspace / lower plan). If no, it's a load-timing glitch.
        const panelHasOtherTools = document.querySelector(
          '[role="button"][aria-label^="Speech translation" i], ' +
          '[role="button"][aria-label^="Breakout rooms" i], ' +
          '[role="button"][aria-label^="Polls" i], ' +
          '[role="button"][aria-label^="Q&A" i]'
        );

        if (panelHasOtherTools) {
          await abandonAutoRecord('recording not offered on this account');
          if (SETTINGS.showBanners) {
            showToast(
              'warning',
              'Meet Auto Record',
              'Recording isn\'t offered on this account. Workspace Business Standard or higher is required.',
              8000
            );
          }
          return;
        }

        // Timing/load glitch. Allow ONE retry total; then give up cleanly.
        if (autoRecordAttempts >= MAX_AUTO_RECORD_ATTEMPTS) {
          await abandonAutoRecord('meeting tools never populated after max attempts');
          if (SETTINGS.showBanners) {
            showToast('warning', 'Meet Auto Record', 'Could not start recording on this call.', 6000);
          }
          return;
        }

        // One more try on the next tick.
        await closeMeetingToolsPanel();
        hasAttemptedAutoRecord = false;
        isProcessing = false;
        hideIndicator();
        console.log('[Meet Auto Record] Meeting tools panel never populated — retrying once');
        setTimeout(() => {
          if (!autoRecordAbandoned && !hasAttemptedAutoRecord && isInActiveMeeting() && !isRecordingActive()) {
            startAutoRecording();
          }
        }, 5000);
        return;
      }
      await sleep(500);

      // Step 3: Enable recording options (checkboxes)
      await enableRecordingCheckboxes();
      await sleep(300);

      // Step 4: Click Start recording
      const startClicked = await clickStartRecording();
      if (!startClicked) {
        throw new Error('Could not start recording');
      }
      await sleep(500);

      // Step 5: Handle any dialogs
      await handleRecordingDialogs();

      hideIndicator();

      // Check if recording actually started
      await sleep(2000);
      if (isRecordingActive()) {
        showToast('success', 'Meet Auto Record', 'Recording started successfully!');
        // Close the side panel
        await sleep(500);
        await closeMeetingToolsPanel();
      } else {
        showToast('warning', 'Meet Auto Record', 'Recording may not have started - please verify');
      }

    } catch (error) {
      console.error('[Meet Auto Record] Auto-recording error:', error);
      hideIndicator();

      if (autoRecordAttempts >= MAX_AUTO_RECORD_ATTEMPTS) {
        await abandonAutoRecord('max attempts reached after error: ' + error.message);
        if (SETTINGS.showBanners) {
          showToast('warning', 'Meet Auto Record', 'Could not start recording on this call.', 6000);
        }
      } else {
        // One more try.
        hasAttemptedAutoRecord = false;
        isProcessing = false;
        if (SETTINGS.showBanners) {
          showToast('error', 'Meet Auto Record', error.message);
        }
        setTimeout(() => {
          if (!autoRecordAbandoned && !hasAttemptedAutoRecord && isInActiveMeeting() && !isRecordingActive()) {
            console.log('[Meet Auto Record] Retrying auto-record after transient error');
            startAutoRecording();
          }
        }, 5000);
      }
    } finally {
      isProcessing = false;
    }
  }

  function findActivitiesButton() {
    // Google labels this button differently across accounts/rollouts:
    //   Workspace:  "Meeting tools"
    //   Personal:   "More activities in this meeting."
    //   Older UI:   "Activities"
    const selectors = [
      'button[aria-label*="Meeting tools" i]',
      '[role="button"][aria-label*="Meeting tools" i]',
      'button[aria-label*="More activities" i]',
      '[role="button"][aria-label*="More activities" i]',
      'button[aria-label="Activities"]',
      '[role="button"][aria-label="Activities"]'
    ];
    for (const sel of selectors) {
      const el = document.querySelector(sel);
      if (el) return el;
    }
    return findElementByText('Meeting tools', 'button') ||
           findElementByText('Activities', 'button');
  }

  async function waitForActivitiesButton(timeoutMs = 15000) {
    const start = Date.now();
    while (Date.now() - start < timeoutMs) {
      const btn = findActivitiesButton();
      if (btn) return btn;
      await sleep(400);
    }
    return null;
  }

  async function openMeetingTools() {
    const btn = await waitForActivitiesButton();

    if (!btn) {
      console.log('[Meet Auto Record] Meeting tools button never appeared');
      return false;
    }

    // Check if already expanded
    if (btn.getAttribute('aria-expanded') === 'true') {
      console.log('[Meet Auto Record] Activities panel already open');
      return true;
    }

    btn.click();
    console.log('[Meet Auto Record] Opened activities panel:', btn.getAttribute('aria-label'));
    return true;
  }

  function isStopRecordingText(text) {
    const t = (text || '').toLowerCase();
    return t.includes('stop recording') || t.includes('stop the recording');
  }

  // Matches the entry point in the Meeting tools side panel. Google has used
  // several labels across rollouts: "Recording", "Record", "Record meeting".
  function isRecordEntryText(text) {
    const t = (text || '').trim().toLowerCase();
    if (!t) return false;
    if (isStopRecordingText(t)) return false;
    // Match either of the headline phrasings. The panel row aria-label is
    // e.g. "Record Capture the meeting" — so a prefix / word-boundary match
    // on "record" at the start catches both variants.
    return /^record\b/i.test(t) || /\brecording\b/i.test(t);
  }

  function panelHasPopulated() {
    // The panel is "live" when we can see any of the standard tool entries.
    return !!document.querySelector(
      '[role="button"][aria-label^="Speech translation" i], ' +
      '[role="button"][aria-label^="Record " i], ' +
      '[role="button"][aria-label^="Breakout rooms" i], ' +
      '[role="button"][aria-label^="Polls" i], ' +
      '[role="button"][aria-label^="Q&A" i], ' +
      '[role="button"][aria-label^="Timer" i]'
    );
  }

  async function clickRecordingOption() {
    const SEL_ITEM = '[role="option"], [role="menuitem"], [role="button"], button';

    // Kick: if the panel was opened but never populated after ~2.5s,
    // re-click the Meeting tools button — Meet sometimes drops the first click
    // on a cold join before its handler is wired up.
    let kicked = false;

    // Wait up to 6s — the Meeting tools panel typically populates around
    // 1.5s but can take longer on cold joins.
    for (let i = 0; i < 12; i++) {
      await sleep(500);

      // After ~2.5s with no tools showing, assume Meet dropped the first
      // click. Close the panel and re-open it to try again.
      if (!kicked && i >= 5 && !panelHasPopulated()) {
        console.log('[Meet Auto Record] Panel still empty — re-clicking Meeting tools');
        const btn = findActivitiesButton();
        if (btn) {
          // Collapse first if still expanded, then re-open.
          if (btn.getAttribute('aria-expanded') === 'true') {
            btn.click();
            await sleep(300);
          }
          btn.click();
          kicked = true;
          continue;
        }
      }

      // Direct attribute-based candidates (older and newer UIs)
      const directSelectors = [
        '[role="button"][aria-label^="Record " i]',
        '[role="button"][aria-label="Record" i]',
        '[role="option"][aria-label*="Recording" i]',
        '[role="menuitem"][aria-label*="Recording" i]',
        '[role="option"][value*="Recording" i]'
      ];
      for (const sel of directSelectors) {
        const direct = document.querySelector(sel);
        if (!direct) continue;
        const label = (direct.getAttribute('aria-label') || '') + ' ' + (direct.textContent || '');
        if (isStopRecordingText(label)) continue;
        direct.click();
        console.log('[Meet Auto Record] Clicked Record option (direct):', sel);
        return true;
      }

      const panels = document.querySelectorAll('[role="listbox"], [role="menu"], [role="complementary"], [aria-label*="Meeting tools" i], [aria-label="Side panel"]');
      for (const panel of panels) {
        const items = panel.querySelectorAll(SEL_ITEM);
        for (const item of items) {
          const label = item.getAttribute('aria-label') || '';
          const text = (item.textContent || '').trim();
          if (isStopRecordingText(label + ' ' + text)) continue;
          if (isRecordEntryText(label) || isRecordEntryText(text)) {
            item.click();
            console.log('[Meet Auto Record] Clicked Record option (panel scan):', label || text.slice(0, 40));
            return true;
          }
        }
      }

      // Last-resort: scan the whole document for a role=button with matching label
      const all = document.querySelectorAll('[role="button"]');
      for (const item of all) {
        const label = item.getAttribute('aria-label') || '';
        if (isStopRecordingText(label)) continue;
        if (/^record\b/i.test(label) || /^record\s+/i.test(label)) {
          item.click();
          console.log('[Meet Auto Record] Clicked Record option (global scan):', label);
          return true;
        }
      }
    }

    return false;
  }

  function getCheckboxLabel(cb) {
    // Native checkboxes in Meet's Recording panel have no aria-label and
    // no direct text. The label text lives 1–3 ancestors up.
    const explicit = cb.getAttribute('aria-label');
    if (explicit) return explicit;

    if (cb.getAttribute('aria-labelledby')) {
      const refs = cb.getAttribute('aria-labelledby').split(/\s+/);
      for (const id of refs) {
        const node = document.getElementById(id);
        if (node?.textContent) return node.textContent.trim();
      }
    }

    if (cb.id) {
      const lab = document.querySelector(`label[for="${cb.id}"]`);
      if (lab?.textContent) return lab.textContent.trim();
    }

    // Walk up and grab the first ancestor whose text is long enough to be a label.
    let node = cb.parentElement;
    for (let depth = 0; node && depth < 5; depth++, node = node.parentElement) {
      const t = (node.innerText || node.textContent || '').trim();
      if (t.length >= 5 && t.length <= 120) return t;
    }
    return '';
  }

  async function enableRecordingCheckboxes() {
    await sleep(300);

    const checkboxes = document.querySelectorAll('[role="checkbox"], input[type="checkbox"]');

    for (const checkbox of checkboxes) {
      const label = getCheckboxLabel(checkbox);
      const lower = label.toLowerCase();

      if (lower.includes('stop')) continue;

      let shouldEnable = null;
      // Order matters: "Take Notes with Gemini" also contains the word "notes".
      if (/gemini|take notes|notes/i.test(label)) shouldEnable = SETTINGS.geminiNotes !== false;
      else if (/transcript/i.test(label)) shouldEnable = SETTINGS.transcription !== false;
      else if (/caption/i.test(label)) shouldEnable = SETTINGS.captions === true;
      else continue;

      const isChecked = checkbox.getAttribute('aria-checked') === 'true' || checkbox.checked;

      if (shouldEnable && !isChecked && !checkbox.disabled) {
        checkbox.click();
        console.log(`[Meet Auto Record] Enabled: ${label.substring(0, 60)}`);
        await sleep(150);
      } else if (!shouldEnable && isChecked && !checkbox.disabled) {
        checkbox.click();
        console.log(`[Meet Auto Record] Disabled (per settings): ${label.substring(0, 60)}`);
        await sleep(150);
      }
    }
  }

  function findStartRecordingButton() {
    return document.querySelector('button[aria-label="Start recording" i]') ||
           document.querySelector('button[aria-label*="Start recording" i]') ||
           findElementByText('Start recording', 'button');
  }

  async function clickStartRecording() {
    // Wait up to 6s for the Recording sub-panel to finish rendering.
    let startButton = null;
    for (let i = 0; i < 12; i++) {
      startButton = findStartRecordingButton();
      if (startButton && !startButton.disabled) break;
      await sleep(500);
    }

    if (!startButton) {
      console.log('[Meet Auto Record] Start recording button never appeared');
      return false;
    }

    if (startButton.disabled) {
      console.log('[Meet Auto Record] Start recording button is disabled');
      return false;
    }

    startButton.click();
    console.log('[Meet Auto Record] Clicked Start recording');
    return true;
  }

  function findConsentDialogStart() {
    const dialogs = document.querySelectorAll('[role="dialog"], [role="alertdialog"]');
    for (const dialog of dialogs) {
      const text = (dialog.textContent || '').toLowerCase();
      if (!/make sure everyone is ready|consent|recording this meeting/.test(text)) continue;
      const buttons = dialog.querySelectorAll('button, [role="button"]');
      for (const btn of buttons) {
        const label = ((btn.textContent || '') + ' ' + (btn.getAttribute('aria-label') || '')).trim();
        if (/^start\b/i.test(label) && !/cancel/i.test(label)) return btn;
      }
    }
    return null;
  }

  async function handleRecordingDialogs() {
    // Watch for dialogs over an 8s window. Meet shows "Got it"-style info
    // dialogs first, then the "Make sure everyone is ready" consent.
    const deadline = Date.now() + 8000;
    let consentHandled = false;

    while (Date.now() < deadline) {
      await sleep(400);

      // "Got it" / info-style dialogs
      const gotItBtn = findElementByText('Got it', 'button');
      if (gotItBtn) {
        gotItBtn.click();
        console.log('[Meet Auto Record] Clicked "Got it" dialog');
        await sleep(200);
        continue;
      }

      // Consent dialog
      if (!consentHandled) {
        const startBtn = findConsentDialogStart();
        if (startBtn && !startBtn.disabled) {
          startBtn.click();
          consentHandled = true;
          console.log('[Meet Auto Record] Clicked Start in consent dialog');
          // Keep looping briefly to catch any follow-up "Got it" dialog.
        }
      }

      // Exit early if recording is now actually live.
      if (consentHandled && isRecordingActive()) return;
    }
  }

  async function closeMeetingToolsPanel() {
    // Method 1: Click the Close button in the side panel
    const closeButton = document.querySelector('[aria-label="Close"]') ||
                       document.querySelector('button[aria-label*="Close"]') ||
                       document.querySelector('[role="complementary"] button[aria-label*="Close"]');

    if (closeButton) {
      closeButton.click();
      console.log('[Meet Auto Record] Closed side panel via Close button');
      return true;
    }

    // Method 2: Toggle the activities button to close it
    const activitiesBtn = findActivitiesButton();
    if (activitiesBtn && activitiesBtn.getAttribute('aria-expanded') === 'true') {
      activitiesBtn.click();
      console.log('[Meet Auto Record] Closed side panel via activities toggle');
      return true;
    }

    console.log('[Meet Auto Record] Could not find way to close side panel');
    return false;
  }

  // ============================================
  // Meeting Join Detection
  // ============================================

  function setupMeetingJoinDetection() {
    let wasInMeeting = false;

    const checkMeetingStatus = () => {
      const inMeeting = isInActiveMeeting();

      if (inMeeting && !wasInMeeting) {
        console.log('[Meet Auto Record] Joined meeting, waiting before auto-record...');

        // Wait a bit before attempting to record
        setTimeout(() => {
          if (!hasAttemptedAutoRecord && isInActiveMeeting()) {
            startAutoRecording();
          }
        }, CONFIG.AUTO_START_DELAY);
      }

      wasInMeeting = inMeeting;
    };

    // Check periodically
    setInterval(checkMeetingStatus, CONFIG.CHECK_INTERVAL);

    // Also observe DOM changes
    const observer = new MutationObserver(() => {
      if (!hasAttemptedAutoRecord) {
        checkMeetingStatus();
      }
    });

    observer.observe(document.body, {
      childList: true,
      subtree: true
    });
  }

  // ============================================
  // Initialization
  // ============================================

  function setupMeetCallContext() {
    CONTEXT = computeContext();
    if (!CONTEXT.isMeetCall || meetCallSetupDone) return;
    meetCallSetupDone = true;
    console.log('[Meet Auto Record] Running in Meet Call context:', CONTEXT.url);

    // Show initialization toast (once per Meet room)
    const roomKey = 'mar-meet-init-' + window.location.pathname;
    if (SETTINGS.showBanners && !sessionStorage.getItem(roomKey)) {
      sessionStorage.setItem(roomKey, 'true');
      const msg = SETTINGS.autoRecord
        ? 'Extension active — will auto-start recording when you join'
        : 'Extension active — auto-record disabled in settings';
      showToast('info', 'Meet Auto Record', msg, 4000);
    }

    setupMeetingJoinDetection();
  }

  function startUrlMonitor() {
    // Meet uses SPA navigation (history.pushState) — content scripts only
    // run at document_load, so we must watch for URL changes ourselves.
    let lastUrl = window.location.href;
    const check = () => {
      if (window.location.href !== lastUrl) {
        lastUrl = window.location.href;
        console.log('[Meet Auto Record] URL changed ->', lastUrl);
        // Reset per-call state so a new room gets a fresh attempt.
        hasAttemptedAutoRecord = false;
        autoRecordAttempts = 0;
        autoRecordAbandoned = false;
        setupMeetCallContext();
      }
    };
    setInterval(check, 500);
    // Also patch history API for immediate notification
    ['pushState', 'replaceState'].forEach(fn => {
      const original = history[fn];
      history[fn] = function() {
        const result = original.apply(this, arguments);
        setTimeout(check, 0);
        return result;
      };
    });
    window.addEventListener('popstate', check);
  }

  function init() {
    console.log('[Meet Auto Record] Initializing...', CONTEXT);

    if (CONTEXT.isCalendarSettings) {
      // Running in Calendar Settings iframe
      // DON'T auto-run - wait for postMessage from parent (Calendar page)
      console.log('[Meet Auto Record] Running in Calendar Settings context - waiting for signal...');

      window.addEventListener('message', (event) => {
        if (event.origin === 'https://calendar.google.com' &&
            event.data?.type === 'MAR_AUTO_CONFIGURE') {
          console.log('[Meet Auto Record] Received auto-configure signal from Calendar');
          handleCalendarSettings();
        }
      });

      window.parent.postMessage({ type: 'MAR_IFRAME_READY' }, 'https://calendar.google.com');
      console.log('[Meet Auto Record] Sent ready signal to parent');
      return;
    }

    // Any other meet.google.com page: set up reactive detection.
    // Handles both direct loads (/xxx-xxxx-xxx) and SPA navigation from
    // landing pages like meet.new → /new → /xxx-xxxx-xxx.
    setupMeetCallContext();
    startUrlMonitor();
  }

  // Run initialization
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }

  // Expose for debugging
  window.__meetAutoRecord = {
    showToast,
    showIndicator,
    hideIndicator,
    isRecordingActive,
    isInActiveMeeting,
    startAutoRecording,
    CONTEXT,
    CONFIG
  };

})();
