(() => {
  let mode = 'light';
  try {
    const cookieValue = document.cookie
      .split(';')
      .map((part) => part.trim())
      .find((part) => part.startsWith('gbap_appearance='))
      ?.slice('gbap_appearance='.length);
    const cookieMode = cookieValue ? decodeURIComponent(cookieValue) : '';
    const storedMode = window.localStorage.getItem('gbap.appearance.device');
    const saved = cookieMode || storedMode;
    if (saved === 'light' || saved === 'dark' || saved === 'black' || saved === 'system') mode = saved;
  } catch {
    mode = 'light';
  }
  if (mode === 'system') {
    mode = window.matchMedia?.('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
  }
  document.documentElement.dataset.gbapAppearance = mode;
  document.documentElement.dataset.gbapTheme = mode === 'dark' || mode === 'black' ? 'dark' : 'light';
})();
