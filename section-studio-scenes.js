(() => {
  const find = (selector, within = document) => within.querySelector(selector);
  const all = (selector, within = document) => [...within.querySelectorAll(selector)];
  const range = (n, start = 0, end = 1) => Math.min(1, Math.max(0, (n - start) / (end - start)));
  const progress = section => Number(section.style.getPropertyValue('--section-progress'));
  const inView = node => {
    const rect = node.getBoundingClientRect();
    return rect.top < innerHeight && rect.bottom > 0;
  };
  const pinned = section => section.classList.contains('is-pinned');
  const ease = 'cubic-bezier(.2,.72,.23,1)';
  const compound = find('#compound');
  const purchasing = find('#purchasing');
  const hero = find('#top');
  const dataCards = all('.dossier-card');
  const portals = all('.portal-fragment');
  const numbers = all('.trade-panel .scene-index');
  const roadmap = all('.future-features article');
  const teamHeadings = all('#team .department-label');
  const tradeChapters = all('.trade-panel');
  const heroType = find('#hero-title span:last-child');
  const running = new Map();
  const reduce = matchMedia('(prefers-reduced-motion: reduce)');
  let frame = 0;
  const motion = () => !reduce.matches && Boolean(Element.prototype.animate);

  function layer(parent, cssClass) {
    const node = document.createElement('span');
    node.className = cssClass;
    node.setAttribute('aria-hidden', 'true');
    parent.append(node);
    return node;
  }

  const accentLines = new Map([...teamHeadings, ...roadmap].map(node => {
    const department = node.matches('.department-label');
    const line = layer(department ? node.parentElement : node, 'approved-accent-line');
    line.dataset.accent = department ? '43' : '44';
    return [node, line];
  }));
  const dataRules = dataCards.map(card => layer(card, 'approved-data-rule'));
  const yardLight = layer(find('.compound-photo-wrap'), 'approved-yard-light');

  function play(id, node, keyframes, duration = 670, delay = 0) {
    if (!motion() || !node.getClientRects().length) return;
    let byEffect = running.get(node);
    if (!byEffect) {
      byEffect = new Map();
      running.set(node, byEffect);
    }
    byEffect.get(id)?.cancel();
    const animation = node.animate(keyframes, {duration, delay, easing:ease, fill:'backwards'});
    byEffect.set(id, animation);
    animation.onfinish = animation.oncancel = () => {
      if (byEffect.get(id) !== animation) return;
      byEffect.delete(id);
      if (!byEffect.size) running.delete(node);
    };
  }

  function settle(id, node, x, y, delay = 0, duration = 700) {
    play(id, node, [{translate:`${x}px ${y}px`, composite:'add'}, {translate:'0px 0px', composite:'add'}], duration, delay);
  }

  function draw(id, line, delay = 0) {
    play(id, line, [{transform:'scaleX(0)', opacity:.25}, {transform:'scaleX(1)', opacity:1}], 780, delay);
  }

  function splitCopy() {
    settle('34', find('#decision-title'), 0, 23, 0, 610);
    settle('34', find('.data-copy .scene-intro'), -20, 9, 120);
    settle('34', find('.study-support'), 22, 9, 230);
  }

  function priceLock() {
    const chips = all('.pricing-equation > span');
    chips.forEach((chip,index) => settle('37', chip, [-32,0,32][index], [-13,18,-13][index], index * 105, 650));
    play('37', find('.pricing-result'), [
      {translate:'0px 21px', scale:.96, composite:'add'},
      {translate:'0px 0px', scale:1.025, composite:'add', offset:.72},
      {translate:'0px 0px', scale:1, composite:'add'},
    ], 690, 275);
  }

  function portalCard(card) {
    play('41', card, [
      {translate:'32px 11px', scale:.96, composite:'add'},
      {translate:'-4px 0px', scale:1.025, composite:'add', offset:.73},
      {translate:'0px 0px', scale:1, composite:'add'},
    ], 760);
    play('41', find('.approved-portal-shadow', card), [
      {opacity:0, translate:'18px 4px'}, {opacity:.8, offset:.45}, {opacity:0, translate:'0 0'},
    ], 760);
  }
  portals.forEach(card => layer(card, 'approved-portal-shadow'));

  function teamHeading(heading) {
    draw('43', accentLines.get(heading));
    settle('43', heading, 0, 11);
  }

  function roadmapCard(card) {
    const index = roadmap.indexOf(card);
    draw('44', accentLines.get(card));
    settle('44', card, index ? 25 : -25, index ? -9 : 14, 0, 820);
  }

  function turnNumber(node) {
    play('46', node, [
      {transform:'perspective(300px) rotateX(-85deg) translateY(10px)', transformOrigin:'center bottom', opacity:.2},
      {transform:'perspective(300px) rotateX(9deg)', offset:.72},
      {transform:'none', opacity:1},
    ], 780);
  }

  function titleReflection() {
    if (!CSS.supports('background-clip', 'text') || !motion()) return;
    play('48', heroType, [{backgroundPosition:'110% 0%'},{backgroundPosition:'-12% 0%'}], 1230);
  }

  function dataLabel(card) {
    const rule = dataRules[dataCards.indexOf(card)];
    draw('52', rule);
    settle('52', find('span:not(.approved-data-rule)', card), 0, 10, 90, 520);
  }

  const entryActions = [
    ['34',find('.data-copy'),splitCopy],
    ...(find('.pricing-equation') ? [['37',find('.pricing-equation'),priceLock]] : []),
    ...portals.map(card => ['41',card,() => { if (!pinned(purchasing)) portalCard(card); }]),
    ...teamHeadings.map(heading => ['43',heading,() => teamHeading(heading)]),
    ...roadmap.map(card => ['44',card,() => roadmapCard(card)]),
    ...numbers.map(number => ['46',number,() => turnNumber(number)]),
    ['48',heroType,titleReflection],
    ...dataCards.map(card => ['52',card,() => { if (!card.closest('[data-sticky]')) dataLabel(card); }]),
  ];

  if ('IntersectionObserver' in window) {
    const byNode = new Map(entryActions.map(([id,node,action]) => [node, {id,action}]));
    const observer = new IntersectionObserver(entries => {
      for (const {target,isIntersecting} of entries) {
        if (isIntersecting && getComputedStyle(target).visibility === 'visible') {
          const {action} = byNode.get(target);
          if (motion()) action();
        }
      }
    }, {threshold:.18});
    byNode.forEach((_,node) => observer.observe(node));
  }

  const changes = new MutationObserver(records => {
    for (const {target,attributeName} of records) {
      if (!target.hasAttribute(attributeName) || !inView(target)) continue;
      const actions = changeActions.get(target);
      for (const [,attribute,action] of actions) {
        if (attribute === attributeName && motion()) action();
      }
    }
  });
  const changeActions = new Map();
  function observeChange(node, id, attribute, action) {
    const actions = changeActions.get(node) ?? [];
    actions.push([id,attribute,action]);
    changeActions.set(node, actions);
    changes.observe(node, {attributes:true, attributeFilter:[...new Set(actions.map(([,key]) => key))]});
  }
  if (find('.pricing-equation') && tradeChapters[1]) observeChange(tradeChapters[1], '37', 'data-active', priceLock);
  for (const [index,chapter] of tradeChapters.entries()) {
    observeChange(chapter, '46', 'data-active', () => turnNumber(numbers[index]));
  }
  for (const card of dataCards) {
    observeChange(card, '52', 'data-active', () => { if (card.closest('[data-sticky]')) dataLabel(card); });
  }
  for (const card of portals) observeChange(card, '41', 'data-portal-current', () => portalCard(card));

  find('.intro .gate-right')?.addEventListener('animationend', () => {
    if (inView(heroType)) titleReflection();
  }, {once:true});

  function paint() {
    frame = 0;
    if (reduce.matches) return;
    if (inView(hero)) {
      const amount = range(progress(hero), .015, .31);
      hero.style.setProperty('--approved-angle', `${Math.sin(amount * Math.PI) * 23}%`);
    }
    if (inView(compound)) {
      const rect = yardLight.parentElement.getBoundingClientRect();
      const step = pinned(compound) ? progress(compound) : range(rect.top, innerHeight * .88, -rect.height * .4);
      yardLight.style.setProperty('--yard-light-angle', `${(step - .5) * 125}%`);
      yardLight.style.setProperty('--yard-light-opacity', Math.sin(Math.PI * step) * .7);
    }
  }

  function schedule() {
    if (!reduce.matches && !frame) frame = requestAnimationFrame(paint);
  }
  window.addEventListener('scroll', schedule, {passive:true});
  window.addEventListener('resize', schedule, {passive:true});

  reduce.addEventListener('change', () => {
    if (reduce.matches) {
      for (const byEffect of running.values()) {
        for (const animation of byEffect.values()) animation.cancel();
      }
    }
    schedule();
  });
  schedule();
})();
