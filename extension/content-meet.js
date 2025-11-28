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

  // ============================================
  // Context Detection
  // ============================================

  const CONTEXT = {
    isCalendarSettings: window.location.href.includes('calendarsettings'),
    isMeetCall: /^https:\/\/meet\.google\.com\/[a-z]{3}-[a-z]{4}-[a-z]{3}/.test(window.location.href)
  };

  let toastContainer = null;
  let hasAttemptedAutoRecord = false;
  let isProcessing = false;

  console.log('[Meet Auto Record] Context:', CONTEXT);

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

  async function selectLanguage(language) {
    // Find the language dropdown
    const languageSelect = document.querySelector('select, [role="listbox"], [role="combobox"]');

    if (!languageSelect) {
      console.log('[Meet Auto Record] Language dropdown not found, might already be set');
      return;
    }

    // Click to open dropdown
    languageSelect.click();
    await sleep(300);

    // Find and click the language option
    const options = document.querySelectorAll('[role="option"], option');
    for (const option of options) {
      if (option.textContent?.includes(language) || option.value === language) {
        option.click();
        console.log(`[Meet Auto Record] Selected language: ${language}`);
        return;
      }
    }

    // Try clicking directly on text
    const langOption = findElementByText(language, '[role="option"], option');
    if (langOption) {
      langOption.click();
      console.log(`[Meet Auto Record] Selected language by text: ${language}`);
    }
  }

  async function enableAllRecordingOptions() {
    const checkboxes = document.querySelectorAll('[role="checkbox"], input[type="checkbox"]');

    for (const checkbox of checkboxes) {
      const label = checkbox.textContent ||
                    checkbox.getAttribute('aria-label') ||
                    checkbox.parentElement?.textContent || '';

      const isRecordingOption =
        label.includes('Gemini') ||
        label.includes('notes') ||
        label.includes('Transcribe') ||
        label.includes('transcript') ||
        label.includes('Record') ||
        label.includes('recording');

      if (isRecordingOption) {
        const isChecked = checkbox.getAttribute('aria-checked') === 'true' ||
                         checkbox.checked === true ||
                         checkbox.getAttribute('checked') !== null;

        if (!isChecked && !checkbox.disabled) {
          checkbox.click();
          console.log(`[Meet Auto Record] Enabled checkbox: ${label.substring(0, 50)}`);
          await sleep(200);
        }
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
    // Check for recording indicators
    const recordingIndicators = [
      () => findElementByText('This call is being recorded'),
      () => findElementByText('Recording'),
      () => document.querySelector('[aria-label*="Stop recording"]'),
      () => document.querySelector('button[aria-label*="recording"][aria-label*="stop"]')
    ];

    for (const check of recordingIndicators) {
      if (check()) {
        console.log('[Meet Auto Record] Recording is already active');
        return true;
      }
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

  async function startAutoRecording() {
    if (hasAttemptedAutoRecord || isProcessing) {
      console.log('[Meet Auto Record] Already attempted or processing');
      return;
    }

    if (!isInActiveMeeting()) {
      console.log('[Meet Auto Record] Not in active meeting yet');
      return;
    }

    if (isRecordingActive()) {
      console.log('[Meet Auto Record] Recording already active');
      showToast('info', 'Meet Auto Record', 'Recording is already active');
      hasAttemptedAutoRecord = true;
      return;
    }

    isProcessing = true;
    hasAttemptedAutoRecord = true;
    showIndicator('Starting recording...');

    try {
      // Step 1: Open Meeting tools panel
      const meetingToolsOpened = await openMeetingTools();
      if (!meetingToolsOpened) {
        throw new Error('Could not open Meeting tools');
      }
      await sleep(500);

      // Step 2: Click on Recording option
      const recordingClicked = await clickRecordingOption();
      if (!recordingClicked) {
        throw new Error('Recording option not available - you may not have permission');
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
      showToast('error', 'Meet Auto Record', error.message);
    } finally {
      isProcessing = false;
    }
  }

  async function openMeetingTools() {
    // Find Meeting tools button
    const meetingToolsBtn = findButtonByAriaLabel('Meeting tools') ||
                           findElementByText('Meeting tools', 'button');

    if (!meetingToolsBtn) {
      console.log('[Meet Auto Record] Meeting tools button not found');
      return false;
    }

    // Check if already expanded
    if (meetingToolsBtn.getAttribute('aria-expanded') === 'true') {
      console.log('[Meet Auto Record] Meeting tools already open');
      return true;
    }

    meetingToolsBtn.click();
    console.log('[Meet Auto Record] Opened Meeting tools');
    return true;
  }

  async function clickRecordingOption() {
    // Wait for the side panel to appear
    await sleep(500);

    // Find Recording option in the list
    const recordingOption = document.querySelector('[role="option"][value*="Recording"]') ||
                           document.querySelector('[role="option"][aria-label*="Recording"]') ||
                           findElementByText('Recording', '[role="option"]');

    if (!recordingOption) {
      // Try finding in listbox
      const listbox = document.querySelector('[role="listbox"]');
      if (listbox) {
        const options = listbox.querySelectorAll('[role="option"]');
        for (const opt of options) {
          if (opt.textContent?.includes('Recording')) {
            opt.click();
            console.log('[Meet Auto Record] Clicked Recording option');
            return true;
          }
        }
      }
      return false;
    }

    recordingOption.click();
    console.log('[Meet Auto Record] Clicked Recording option');
    return true;
  }

  async function enableRecordingCheckboxes() {
    await sleep(300);

    const checkboxes = document.querySelectorAll('[role="checkbox"], input[type="checkbox"]');

    for (const checkbox of checkboxes) {
      const label = checkbox.textContent ||
                    checkbox.getAttribute('aria-label') ||
                    checkbox.parentElement?.textContent ||
                    checkbox.nextSibling?.textContent || '';

      // Skip "stop" checkboxes (these appear when recording is active)
      if (label.toLowerCase().includes('stop')) {
        continue;
      }

      const isRecordingOption =
        label.includes('Gemini') ||
        label.includes('notes') ||
        label.includes('transcript') ||
        label.includes('caption');

      if (isRecordingOption) {
        const isChecked = checkbox.getAttribute('aria-checked') === 'true' || checkbox.checked;

        if (!isChecked && !checkbox.disabled) {
          checkbox.click();
          console.log(`[Meet Auto Record] Enabled: ${label.substring(0, 40)}`);
          await sleep(150);
        }
      }
    }
  }

  async function clickStartRecording() {
    const startButton = findElementByText('Start recording', 'button') ||
                       document.querySelector('button[aria-label*="Start recording"]');

    if (!startButton) {
      console.log('[Meet Auto Record] Start recording button not found');
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

  async function handleRecordingDialogs() {
    // Handle "Take notes with Gemini" info dialog
    for (let i = 0; i < 3; i++) {
      await sleep(500);

      const gotItBtn = findElementByText('Got it', 'button');
      if (gotItBtn) {
        gotItBtn.click();
        console.log('[Meet Auto Record] Clicked "Got it" dialog');
        await sleep(300);
      }
    }

    // Handle consent dialog "Make sure everyone is ready"
    await sleep(500);

    const dialog = document.querySelector('[role="dialog"]');
    if (dialog) {
      const dialogText = dialog.textContent || '';

      if (dialogText.includes('Make sure everyone is ready') || dialogText.includes('consent')) {
        const startBtn = dialog.querySelector('button');
        // Find the "Start" button (usually the last/primary button)
        const buttons = dialog.querySelectorAll('button');
        for (const btn of buttons) {
          if (btn.textContent?.trim() === 'Start') {
            btn.click();
            console.log('[Meet Auto Record] Clicked Start in consent dialog');
            return;
          }
        }
      }
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

    // Method 2: Toggle the Meeting tools button to close it
    const meetingToolsBtn = findButtonByAriaLabel('Meeting tools');
    if (meetingToolsBtn && meetingToolsBtn.getAttribute('aria-expanded') === 'true') {
      meetingToolsBtn.click();
      console.log('[Meet Auto Record] Closed side panel via Meeting tools toggle');
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

  function init() {
    console.log('[Meet Auto Record] Initializing...', CONTEXT);

    if (CONTEXT.isCalendarSettings) {
      // Running in Calendar Settings iframe
      // DON'T auto-run - wait for postMessage from parent (Calendar page)
      // This prevents auto-configuration when user manually opens settings
      console.log('[Meet Auto Record] Running in Calendar Settings context - waiting for signal...');

      // Set up listener for configure signal
      window.addEventListener('message', (event) => {
        // Only accept messages from Google Calendar
        if (event.origin === 'https://calendar.google.com' &&
            event.data?.type === 'MAR_AUTO_CONFIGURE') {
          console.log('[Meet Auto Record] Received auto-configure signal from Calendar');
          handleCalendarSettings();
        }
      });

      // Tell parent we're ready to receive the configure signal
      window.parent.postMessage({ type: 'MAR_IFRAME_READY' }, 'https://calendar.google.com');
      console.log('[Meet Auto Record] Sent ready signal to parent');
    } else if (CONTEXT.isMeetCall) {
      // Running in actual Meet call
      console.log('[Meet Auto Record] Running in Meet Call context');

      // Show initialization toast
      if (!sessionStorage.getItem('mar-meet-init')) {
        sessionStorage.setItem('mar-meet-init', 'true');
        showToast('info', 'Meet Auto Record', 'Extension active - will auto-start recording when you join', 4000);
      }

      setupMeetingJoinDetection();
    }
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
