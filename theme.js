// apply the saved theme (auto / light / dark) before first paint
(function () {
  var t = localStorage.getItem('dl-theme') || 'auto';
  var dark = t === 'dark' || (t === 'auto' && window.matchMedia && matchMedia('(prefers-color-scheme: dark)').matches);
  document.documentElement.dataset.theme = dark ? 'dark' : 'light';
})();
