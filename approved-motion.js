(() => {
  const root = document.documentElement;
  const $ = (selector, scope = document) => scope.querySelector(selector);
  const $$ = (selector, scope = document) => [...scope.querySelectorAll(selector)];
  const reduce = matchMedia('(prefers-reduced-motion: reduce)');
  const canAnimate = () => !reduce.matches && Boolean(Element.prototype.animate);
  const hero = $('.hero-stage');
  const mark = $('.hero-mark');
  const clamp = (n, lo, hi) => Math.min(hi, Math.max(lo, n));
  const asset = index => `assets/logos/facet-${index + 1}.svg`;

  // Keep the source gradients independent for each inlined copy of the original mark.
  function copyMark(name) {
    const svg = mark.cloneNode(true);
    svg.removeAttribute('class');
    const idMap = new Map($$('[id]', svg).map(node => [node.id, `${name}-${node.id}`]));
    for (const node of $$('*', svg)) {
      for (const attr of [...node.attributes]) {
        let value = attr.value;
        if (attr.name === 'id') value = idMap.get(value);
        else value = value.replace(/url\(#([^)]+)\)/g, (_, id) => `url(#${idMap.get(id) ?? id})`);
        if (value !== attr.value) node.setAttribute(attr.name, value);
      }
    }
    return svg;
  }

  const closing = copyMark('closing');
  closing.classList.add('approved-closing-mark');
  $('#join').prepend(closing);

  const flightPlans = [
    [-.36, -.22, -21, 0],
    [-.22, .32, 27, 24],
    [.38, .22, -25, 46],
    [.29, .36, 31, 65],
    [.17, -.42, -34, 82],
    [.32, -.18, 23, 102],
  ];
  let flights = [];
  function cancelFlight() {
    flights.forEach(animation => animation.cancel());
    flights = [];
  }
  function flight() {
    cancelFlight();
    if (!canAnimate()) return;
    closing.classList.add('approved-assembled');
    const nodes = $$('[data-facet-assembly]', closing);
    flights = nodes.map((node, index) => {
      const [x, y, angle, delay] = flightPlans[index];
      const scale = node.parentElement.getScreenCTM()?.a || .3;
      const xOffset = x * Math.min(innerWidth, 800) / scale;
      const yOffset = y * Math.min(innerHeight, 700) / scale;
      const pose = amount =>
        `translate(${xOffset * amount}px,${yOffset * amount}px) rotate(${angle * amount}deg) scale(${1 + amount * .7})`;
      return node.animate([
        {transform:pose(1), opacity:0, easing:'cubic-bezier(.28,.42,.54,.88)'},
        {transform:pose(.29), opacity:0, offset:.46, easing:'cubic-bezier(.25,.42,.52,1)'},
        {transform:pose(.075), opacity:.7, offset:.74, easing:'ease-out'},
        {transform:'none', opacity:1},
      ], {duration:890, delay, fill:'backwards'});
    });
  }

  const tideSites = [
    [hero, [[0, 3, 14, 38, -7, .24], [4, 97, 14, 25, 34, .26], [3, 91, 95, 31, -11, .22]]],
    [$('.ecosystem-stage'), [[2, 102, 31, 31, 21, .20], [1, 9, 83, 30, -24, .18]]],
    [$('.compound-stage'), [[5, 98, 0, 30, -28, .25], [3, -1, 95, 44, 21, .18]]],
    [$('.purchase-stage'), [[2, 100, 6, 29, -18, .14], [3, 2, 95, 25, 9, .19]]],
    [$('.future-stage'), [[4, 99, 5, 39, 11, .23], [0, -2, 86, 25, 9, .19]]],
    [$('#team'), [[5, -2, 16, 24, -17, .13], [1, 103, 64, 29, 16, .12]]],
  ];
  const tide = tideSites.map(([section, settings]) => {
    const layer = document.createElement('div');
    layer.className = 'approved-tide';
    layer.setAttribute('aria-hidden', 'true');
    for (const [index, x, y, width, angle, opacity] of settings) {
      const img = new Image();
      img.alt = '';
      img.src = asset(index);
      img.decoding = 'async';
      img.style.cssText = `--tide-left:${x}%;--tide-top:${y}%;--tide-width:clamp(80px,${width}vw,590px);--tide-angle:${angle}deg;--tide-opacity:${opacity};--tide-time:${7 + index % 4 * 2}s;--tide-delay:-${index * 2.1}s`;
      layer.append(img);
    }
    section.prepend(layer);
    return layer;
  });
  if ('IntersectionObserver' in window) {
    const observer = new IntersectionObserver(entries => {
      for (const entry of entries) entry.target.classList.toggle('approved-visible', entry.isIntersecting);
    }, { rootMargin: '36px' });
    tide.forEach(layer => observer.observe(layer));
  }

  const trails = document.createElement('div');
  trails.className = 'approved-trails';
  trails.setAttribute('aria-hidden', 'true');
  document.body.append(trails);
  const trailStamps = Array.from({length:10}, (_, index) => {
    const image = new Image();
    image.alt = '';
    image.src = asset(index % 6);
    trails.append(image);
    return image;
  });
  let stampIndex = 0;
  let stampTime = 0;
  let stampX = -1000;
  let stampY = -1000;
  function trail(x, y) {
    if (!canAnimate()) return;
    const now = performance.now();
    if (now - stampTime < 75 || Math.hypot(x - stampX, y - stampY) < 24) return;
    const node = trailStamps[stampIndex % trailStamps.length];
    const direction = x >= stampX ? 1 : -1;
    const rotation = direction * (stampIndex % 3 + 1) * 15;
    node.getAnimations().forEach(animation => animation.cancel());
    node.animate([
      {transform:`translate(${x - 10}px,${y - 10}px) rotate(0deg) scale(.55)`, opacity:0},
      {transform:`translate(${x - 9}px,${y - 12}px) rotate(${rotation}deg)`, opacity:.38, offset:.26},
      {transform:`translate(${x + direction * 9 - 10}px,${y - 28}px) rotate(${rotation * 1.6}deg) scale(.4)`, opacity:0},
    ], {duration:530, easing:'cubic-bezier(.21,.7,.35,1)'});
    stampIndex++;
    stampTime = now;
    stampX = x;
    stampY = y;
  }
  function trackTrail(event) {
    if (event.target.closest?.('dialog') || cut.classList.contains('approved-active')) return;
    trail(event.clientX, event.clientY);
  }
  document.addEventListener('pointermove', event => {
    if (event.pointerType !== 'touch') trackTrail(event);
  }, {passive:true});
  document.addEventListener('pointerdown', event => {
    if (event.pointerType === 'touch') trackTrail(event);
  }, {passive:true});

  const cut = $('.approved-cut');
  const halves = $$('.approved-cut-half', cut);
  let cutState;
  function finishCut() {
    const state = cutState;
    if (!state) return;
    cutState = null;
    if (!state.jumped) state.jump();
    state.running.forEach(animation => animation.cancel());
    cut.classList.remove('approved-active');
  }
  async function cutTo(jump) {
    if (!canAnimate()) {
      jump();
      return;
    }
    if (cutState) finishCut();
    const state = { jump, jumped: false, running: [] };
    cutState = state;
    cut.classList.add('approved-active');
    const playCurtains = (entering, duration) => {
      const running = halves.map((panel, i) => {
        const away = `translate3d(${i ? 105 : -105}%,${i ? -6 : 6}%,0)`;
        return panel.animate(entering ? [ {transform:away}, {transform:'none'} ] : [ {transform:'none'}, {transform:away} ],
          {duration, easing:'cubic-bezier(.64,.02,.22,1)', fill:'both'});
      });
      state.running.push(...running);
      return Promise.allSettled(running.map(animation => animation.finished));
    };
    await playCurtains(true, 320);
    if (cutState !== state) return;
    state.jumped = true;
    jump();
    await new Promise(resolve => setTimeout(resolve, 105));
    if (cutState !== state) return;
    await playCurtains(false, 390);
    if (cutState === state) finishCut();
  }
  window.tradexApprovedNavigate = (destination, jump) => {
    if (!canAnimate() || destination.id === 'main' || Math.abs(destination.getBoundingClientRect().top) < 120) return false;
    void cutTo(jump);
    return true;
  };
  document.addEventListener('keydown', event => {
    if (event.key === 'Escape' && cutState) finishCut();
  });

  const year = $('.future-year');
  const yearStage = $('#coming');
  let scrollFrame = 0;
  function queueScrub() {
    if (scrollFrame || reduce.matches) return;
    scrollFrame = requestAnimationFrame(() => {
      scrollFrame = 0;
      if (reduce.matches) return;
      const box = year.getBoundingClientRect();
      const progress = Number(yearStage.style.getPropertyValue('--section-progress'));
      const position = yearStage.classList.contains('is-pinned') ? 2 * progress - 1
        : clamp((innerHeight * .56 - box.top) / (innerHeight * .59), -1, 1);
      year.style.setProperty('--year-x', `${position * 42}px`);
      year.style.setProperty('--year-y', `${position * -51}px`);
      year.style.setProperty('--year-shadow', `${position * 11}px`);
      year.style.setProperty('--year-scale', String(1.06 + position * .09));
    });
  }
  window.addEventListener('scroll', queueScrub, {passive:true});
  window.addEventListener('resize', queueScrub, {passive:true});

  if ('IntersectionObserver' in window) {
    root.classList.add('approved-closing-observed');
    const observer = new IntersectionObserver(([entry]) => {
      if (!entry.isIntersecting) {
        closing.classList.remove('approved-assembled');
        cancelFlight();
      } else if (!closing.classList.contains('approved-assembled')) flight();
    }, {threshold:.15, rootMargin:'-5% 0px -7%'});
    observer.observe(closing);
  }

  reduce.addEventListener('change', () => {
    if (reduce.matches) {
      cancelFlight();
      finishCut();
      trailStamps.forEach(stamp => stamp.getAnimations().forEach(animation => animation.cancel()));
      closing.classList.add('approved-assembled');
    }
    queueScrub();
  });

  const effects = ["02", "04", "05", "13", "16", "22", "23", "24", "27", "34", "37", "38", "41", "43", "44", "46", "47", "48", "50", "52", "53"];
  root.dataset.approvedMotion = effects.join(' ');
  root.classList.add(...effects.map(id => `fx-${id}`));
  if (!Element.prototype.animate) root.classList.remove('approved-closing-observed');
  queueScrub();
})();
