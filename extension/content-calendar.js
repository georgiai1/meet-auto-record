/**
 * Meet Auto Record - Google Calendar Content Script
 * Automatically enables recording settings when creating meetings with Google Meet
 */

(function() {
  'use strict';

  const MAR_PREFIX = 'mar';
  let toastContainer = null;
  let isProcessing = false;
  let pendingAutoConfig = false;

  // ============================================
  // PostMessage Handshake with Iframe
  // ============================================

  // Listen for "ready" signal from the settings iframe
  window.addEventListener('message', (event) => {
    if (event.origin === 'https://meet.google.com' &&
        event.data?.type === 'MAR_IFRAME_READY' &&
        pendingAutoConfig) {
      // Iframe is ready and we have a pending auto-config request
      const iframe = document.querySelector('iframe[src*="meet.google.com/calendarsettings"]');
      if (iframe && iframe.contentWindow) {
        iframe.contentWindow.postMessage({ type: 'MAR_AUTO_CONFIGURE' }, 'https://meet.google.com');
        console.log('[Meet Auto Record] Sent auto-configure signal to ready iframe');
      }
      pendingAutoConfig = false;
    }
  });

  // ============================================
  // Toast Notification System
  // ============================================

  function createToastContainer() {
    if (toastContainer) return toastContainer;

    toastContainer = document.createElement('div');
    toastContainer.className = 'mar-toast-container';
    toastContainer.id = 'mar-toast-container';
    document.body.appendChild(toastContainer);
    return toastContainer;
  }

  function showToast(type, title, message, duration = 5000) {
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

  function waitForElementByText(text, tagName = '*', timeout = 10000) {
    return new Promise((resolve, reject) => {
      const startTime = Date.now();

      const check = () => {
        const elements = document.querySelectorAll(tagName);
        for (const el of elements) {
          if (el.textContent.includes(text)) {
            resolve(el);
            return;
          }
        }

        if (Date.now() - startTime > timeout) {
          reject(new Error(`Element with text not found: ${text}`));
          return;
        }

        requestAnimationFrame(check);
      };

      check();
    });
  }

  // ============================================
  // Video Call Options Modal Detection & Handling
  // ============================================

  function detectVideoCallOptionsModal() {
    // Look for the iframe containing the video call options
    const iframe = document.querySelector('iframe[src*="meet.google.com/calendarsettings"]');
    return iframe;
  }

  function isVideoCallOptionsModalOpen() {
    const dialog = document.querySelector('div[role="dialog"]');
    if (!dialog) return false;

    // Check if it contains the video call options iframe
    const iframe = dialog.querySelector('iframe[src*="meet.google.com/calendarsettings"]');
    return !!iframe;
  }

  // ============================================
  // Settings Icon Detection & Auto-Click
  // ============================================

  let hasClickedSettingsForCurrentEvent = false;
  let lastMeetLinkCount = 0;

  function findVideoCallSettingsIcon() {
    // Look for the "Video call options" button in the event dialog
    // The button appears after adding Google Meet video conferencing

    // First, try to find by exact text content "Video call options"
    const dialog = document.querySelector('[role="dialog"]');
    if (dialog) {
      const buttons = dialog.querySelectorAll('button');
      for (const btn of buttons) {
        const text = btn.textContent?.trim() || '';
        if (text === 'Video call options') {
          return btn;
        }
      }
    }

    // Fallback: Look near Google Meet links
    const meetLinks = document.querySelectorAll('a[href*="meet.google.com"]');

    for (const link of meetLinks) {
      // Look for nearby settings button
      const parent = link.closest('[data-eventid], [data-eventchip], [role="dialog"], [role="main"]');
      if (parent) {
        // Look for settings/options button near the meet link by text content
        const buttons = parent.querySelectorAll('button');
        for (const btn of buttons) {
          const text = btn.textContent?.trim() || '';
          const label = btn.getAttribute('aria-label') || btn.getAttribute('data-tooltip') || '';
          if (text === 'Video call options' ||
              label.toLowerCase().includes('video call options') ||
              label.toLowerCase().includes('video') && label.toLowerCase().includes('option')) {
            return btn;
          }
        }
      }
    }

    return null;
  }

  async function autoClickVideoCallOptions() {
    if (hasClickedSettingsForCurrentEvent || isProcessing) {
      return;
    }

    isProcessing = true;
    console.log('[Meet Auto Record] Looking for Video call options button...');

    // Retry finding the button several times as it may take time to appear
    let settingsIcon = null;
    for (let attempt = 0; attempt < 10; attempt++) {
      await sleep(500);
      settingsIcon = findVideoCallSettingsIcon();
      if (settingsIcon) {
        console.log('[Meet Auto Record] Found video call options button on attempt', attempt + 1);
        break;
      }
      console.log('[Meet Auto Record] Button not found yet, attempt', attempt + 1);
    }

    if (settingsIcon) {
      showIndicator('Opening meeting settings...');
      hasClickedSettingsForCurrentEvent = true;

      // Set pending flag BEFORE clicking - iframe will signal when ready
      pendingAutoConfig = true;

      // Clear pending flag after timeout (in case iframe never loads)
      setTimeout(() => {
        if (pendingAutoConfig) {
          pendingAutoConfig = false;
          console.log('[Meet Auto Record] Auto-config timeout - iframe did not respond');
        }
      }, 10000);

      settingsIcon.click();

      // Wait a moment then hide indicator
      await sleep(500);
      hideIndicator();
      showToast('info', 'Meet Auto Record', 'Configuring recording settings...', 3000);
    } else {
      console.log('[Meet Auto Record] Could not find Video call options button after retries');
    }

    isProcessing = false;
  }

  // ============================================
  // Observer for Modal Opening
  // ============================================

  let modalObserver = null;
  let lastModalState = false;

  function setupModalObserver() {
    if (modalObserver) return;

    modalObserver = new MutationObserver((mutations) => {
      const isOpen = isVideoCallOptionsModalOpen();

      if (isOpen && !lastModalState) {
        console.log('[Meet Auto Record] Video call options modal detected');
        // Modal just opened - the iframe content script will handle the rest
        // We just show a notification that we detected it
        showToast('info', 'Meet Auto Record', 'Detected video call options - configuring...', 3000);
      }

      lastModalState = isOpen;
    });

    modalObserver.observe(document.body, {
      childList: true,
      subtree: true
    });

    console.log('[Meet Auto Record] Calendar modal observer started');
  }

  // ============================================
  // Event Creation Detection
  // ============================================

  function detectEventCreation() {
    // Watch for event creation dialog and Google Meet links
    const observer = new MutationObserver((mutations) => {
      for (const mutation of mutations) {
        // Check for new nodes
        for (const node of mutation.addedNodes) {
          if (node.nodeType === Node.ELEMENT_NODE) {
            // Check if this is an event dialog
            const dialog = node.matches?.('[role="dialog"]') ? node : node.querySelector?.('[role="dialog"]');
            if (dialog) {
              // Reset flag for new dialog
              hasClickedSettingsForCurrentEvent = false;
              checkForMeetLinkInDialog(dialog);
            }

            // Check if a Meet link was added
            if (node.matches?.('a[href*="meet.google.com"]') || node.querySelector?.('a[href*="meet.google.com"]')) {
              console.log('[Meet Auto Record] Google Meet link detected in DOM');
              checkForNewMeetLink();
            }
          }
        }

        // Also check for attribute changes that might indicate a Meet link was added
        if (mutation.type === 'attributes' || mutation.type === 'characterData') {
          checkForNewMeetLink();
        }
      }
    });

    observer.observe(document.body, {
      childList: true,
      subtree: true,
      attributes: true,
      attributeFilter: ['href', 'data-conferencedata']
    });
  }

  function checkForNewMeetLink() {
    const currentMeetLinks = document.querySelectorAll('a[href*="meet.google.com"]');

    if (currentMeetLinks.length > lastMeetLinkCount) {
      console.log('[Meet Auto Record] New Google Meet link detected');
      lastMeetLinkCount = currentMeetLinks.length;

      // Check if we're in an event creation dialog
      const dialog = document.querySelector('[role="dialog"]');
      if (dialog) {
        checkForMeetLinkInDialog(dialog);
      }
    }
  }

  function checkForMeetLinkInDialog(dialog) {
    // Look for Google Meet link in the dialog (not just "Adding conferencing details")
    const meetLink = dialog.querySelector('a[href*="meet.google.com"]');

    // Also check if we're still loading (don't trigger if "Adding conferencing details" is shown)
    const isLoading = Array.from(dialog.querySelectorAll('*')).some(el =>
      el.textContent?.includes('Adding conferencing details')
    );

    if (meetLink && !isLoading) {
      console.log('[Meet Auto Record] Google Meet conferencing detected in event dialog');

      // Auto-click the video call options
      autoClickVideoCallOptions();
    }
  }

  // ============================================
  // Initialization
  // ============================================

  function init() {
    console.log('[Meet Auto Record] Calendar content script initialized');

    // Setup observers
    setupModalObserver();
    detectEventCreation();

    // Show initialization toast (only once per session)
    if (!sessionStorage.getItem('mar-calendar-init')) {
      sessionStorage.setItem('mar-calendar-init', 'true');
      showToast('info', 'Meet Auto Record', 'Extension active on Google Calendar', 3000);
    }
  }

  // Run when DOM is ready
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }

  // Expose functions for debugging
  window.__meetAutoRecord = {
    showToast,
    showIndicator,
    hideIndicator,
    isVideoCallOptionsModalOpen,
    detectVideoCallOptionsModal,
    findVideoCallSettingsIcon,
    autoClickVideoCallOptions
  };

})();
