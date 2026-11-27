(() => {
  const portraits = [...document.querySelectorAll('.portrait-display')];
  const pointer = matchMedia('(hover: hover) and (pointer: fine)');
  const clamp = value => Math.min(1, Math.max(0, value));
  const reduce = matchMedia('(prefers-reduced-motion: reduce)');

  for (const portrait of portraits) {
    portrait.addEventListener('pointermove', event => {
      if (reduce.matches || !pointer.matches || event.pointerType !== 'mouse') return;
      const rect = portrait.getBoundingClientRect();
      portrait.style.setProperty('--approved-pointer-x', `${clamp((event.clientX - rect.left) / rect.width) * 100}%`);
      portrait.style.setProperty('--approved-pointer-y', `${clamp((event.clientY - rect.top) / rect.height) * 100}%`);
      portrait.classList.add('approved-pointer-in');
    }, {passive:true});
    portrait.addEventListener('pointerleave', () => {
      portrait.classList.remove('approved-pointer-in');
      portrait.style.removeProperty('--approved-pointer-x');
      portrait.style.removeProperty('--approved-pointer-y');
    }, {passive:true});
  }

  reduce.addEventListener('change', () => {
    if (reduce.matches) {
      for (const portrait of portraits) {
        portrait.classList.remove('approved-pointer-in');
        portrait.style.removeProperty('--approved-pointer-x');
        portrait.style.removeProperty('--approved-pointer-y');
      }
    }
  });
})();
