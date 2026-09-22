/**
 * Brows & Lips Meta CAPI Helper
 * --------------------------
 * Generates unique event_id for browser pixel + CAPI deduplication.
 * Same event_id = Meta dedupes (counts conversion ONCE).
 *
 * Usage:
 *   import { trackConversion } from './capi-helper.js';
 *   trackConversion('book_click', { value: 1500, currency: 'AED' });
 *   trackConversion('whatsapp_click');
 *   trackConversion('phone_click');
 *   trackConversion('contact', { value: 0, currency: 'AED' });
 *   trackConversion('schedule', { value: 1500, currency: 'AED' });
 *
 * - Generates UUID-like event_id, stores in sessionStorage for dedup
 * - Fires browser fbq with same event_id
 * - POSTs to CAPI endpoint with same event_id (server-side dedup)
 * - Falls back gracefully if CAPI endpoint unavailable
 */
(function() {
  'use strict';

  // CAPI endpoint — update if you migrate this
  const CAPI_ENDPOINT = 'https://capi.browsandlips.ae/events';

  // Generate stable event_id (per session per conversion type)
  function getEventId(eventName) {
    // Use sessionStorage so back-button / repeat click doesn't fire twice
    const key = 'capi_eid_' + eventName;
    let stored = sessionStorage.getItem(key);
    if (stored) return stored;
    // UUID-like: timestamp + random
    stored = eventName + '_' + Date.now() + '_' + Math.random().toString(36).substr(2, 9);
    sessionStorage.setItem(key, stored);
    // Clear after 24h (browser sessionStorage auto-clears on tab close)
    return stored;
  }

  // Get user data from page (if present)
  function getUserData() {
    // Read from cookies or localStorage if available (e.g., fbclid, gclid, fbp)
    const fbp = document.cookie.match(/_fbp=([^;]+)/)?.[1];
    const fbc = document.cookie.match(/_fbc=([^;]+)/)?.[1];
    return {
      client_ip: '',  // Will be inferred by Meta
      client_user_agent: navigator.userAgent,
      fbp,
      fbc,
      event_source_url: location.href,
    };
  }

  // Main tracker
  window.trackConversion = function(eventName, params) {
    params = params || {};
    const eventId = getEventId(eventName);
    const userData = getUserData();

    // 1. Fire browser pixel with event_id (for attribution)
    if (typeof fbq === 'function') {
      fbq('track', eventName, params, { eventID: eventId });
    }

    // 2. Fire CAPI server-side with same event_id (dedup)
    fetch(CAPI_ENDPOINT, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        event_name: eventName,
        event_id: eventId,
        user_data: userData,
        custom_data: params,
      }),
      // Don't block UI on CAPI failure
      keepalive: true,
    }).catch(function() {
      // Silent — pixel tracking still works
      console.debug('[CAPI] server-side event failed (using browser-only)');
    });
  };

  // Helper for standard events
  window.trackBookClick = function(params) {
    params = params || { value: 1500, currency: 'AED' };
    window.trackConversion('book_click', params);
  };

  window.trackWhatsAppClick = function() {
    window.trackConversion('whatsapp_click', { value: 0, currency: 'AED' });
  };

  window.trackPhoneClick = function() {
    window.trackConversion('phone_click', { value: 0, currency: 'AED' });
  };

  window.trackContact = function(params) {
    params = params || { value: 0, currency: 'AED' };
    window.trackConversion('contact', params);
  };

  window.trackSchedule = function(params) {
    params = params || { value: 1500, currency: 'AED' };
    window.trackConversion('schedule', params);
  };

  // Auto-track contact form submissions
  document.addEventListener('DOMContentLoaded', function() {
    // Newsletter form
    document.querySelectorAll('.bl-newsletter').forEach(function(form) {
      form.addEventListener('submit', function() {
        window.trackConversion('lead', { value: 0, currency: 'AED' });
      });
    });
  });

  console.debug('[CAPI] Helper loaded, event_id dedup enabled');
})();
