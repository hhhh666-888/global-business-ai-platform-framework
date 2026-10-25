// Apply the explicit device choice before React paints the application.
(() => {
  let mode = 'light';
  try {
    const saved = localStorage.getItem('gbap.appearance.device');
    if (['light', 'dark', 'black', 'system'].includes(saved)) mode = saved;
  } catch { /* Storage can be unavailable in private browser sessions. */ }
  const resolved = mode === 'system' ? (matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light') : mode === 'black' ? 'dark' : mode;
  document.documentElement.dataset.theme = resolved;
  document.documentElement.dataset.appearance = mode;
  document.documentElement.style.colorScheme = resolved;
})();
