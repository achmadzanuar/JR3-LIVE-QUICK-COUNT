(function () {
  'use strict';
  const storageKey = 'jr3-theme';
  const valid = value => value === 'light' || value === 'dark';
  function applyTheme(theme) {
    document.documentElement.dataset.theme = theme;
    const meta = document.querySelector('meta[name="theme-color"]');
    if (meta) meta.content = theme === 'dark' ? '#090c27' : '#f3f6fc';
    document.querySelectorAll('[data-theme-choice]').forEach(button => {
      button.setAttribute('aria-pressed', String(button.dataset.themeChoice === theme));
    });
  }
  let saved;
  try { saved = localStorage.getItem(storageKey); } catch (_) { /* Storage can be unavailable. */ }
  // Apply before styles load to avoid flashing the wrong background on reload.
  applyTheme(valid(saved) ? saved : 'light');
  document.addEventListener('DOMContentLoaded', function () {
    applyTheme(document.documentElement.dataset.theme);
    document.querySelectorAll('[data-theme-choice]').forEach(button => {
      button.addEventListener('click', function () {
        const theme = button.dataset.themeChoice;
        if (!valid(theme)) return;
        applyTheme(theme);
        try { localStorage.setItem(storageKey, theme); } catch (_) { /* Switching still works. */ }
      });
    });
  });
  window.addEventListener('storage', function (event) {
    if (event.key === storageKey && (event.newValue === null || valid(event.newValue))) {
      applyTheme(event.newValue || 'light');
    }
  });
})();
