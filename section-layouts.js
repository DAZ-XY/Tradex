(() => {
  const root = document.documentElement;
  const header = document.querySelector('#header');
  const message = document.getElementById('hero-description');
  const reduced = matchMedia('(prefers-reduced-motion: reduce)');
  const flowLayouts = new Set(['folio','timeline','spread','support','roadmap']);
  const stories = [...document.querySelectorAll('.studio-story')].map(section => ({
    section, scene:section.querySelector('.studio-scene'), slides:[...section.querySelectorAll('.studio-slide')],
    pin:section.querySelector('.studio-pin'), links:[...section.querySelectorAll('[data-story-select]')],
    active:-1, sticky:false, step:0, passages:[],
  }));
  let frame = 0;
  let layoutFrame = 0;
  let pinTop = 0;
  let reading = null;
  let heldReading = null;
  const clamp = (value,lo,hi) => Math.min(hi,Math.max(lo,value));
  function start(story) {
    return story.section.getBoundingClientRect().top + scrollY - pinTop;
  }

  function anchor(story,index = 0) {
    if (!story.sticky) return story.slides[index].getBoundingClientRect().top + scrollY - pinTop - 17;
    return Math.ceil(start(story) + (story.passages[index]?.start ?? index * story.step));
  }

  function activate(story,index) {
    if (story.active === index) return;
    const old = story.active;
    story.active = index;
    story.section.toggleAttribute('data-reverse', old > index);
    const focus = document.activeElement;
    if (story.sticky && old >= 0 && story.slides[old].contains(focus)) {
      story.links.find(link => Number(link.dataset.storySelect) === index && link.getClientRects().length)?.focus({preventScroll:true});
    }
    story.slides.forEach((slide,i) => {
      slide.toggleAttribute('data-leaving', old >= 0 && i === old);
      slide.toggleAttribute('data-active', i === index);
      slide.inert = story.sticky && i !== index;
      slide.querySelector('.portal-fragment')?.toggleAttribute('data-portal-current',i === index);
    });
    story.links.forEach(link => {
      if (Number(link.dataset.storySelect) === index) link.setAttribute('aria-current','true');
      else link.removeAttribute('aria-current');
    });
  }

  function measurePassages(story, available) {
    const {section,scene,slides} = story;
    const hold = clamp(Math.round(available * .37), 95, 235);
    let next = 0;
    section.setAttribute('data-measuring', '');
    const passages = slides.map((slide,index) => {
      slide.setAttribute('data-measure', '');
      const overflow = Math.max(0, scene.offsetHeight - available);
      const slideTop = slide.getBoundingClientRect().top - scene.getBoundingClientRect().top;
      // Later cards start near their heading so the section introduction doesn't repeat.
      const skipLimit = Math.max(0, overflow - Math.min(72, Math.round(available * .18)));
      const entry = index === 0 ? 0 : clamp(Math.round(slideTop) - 24, 0, skipLimit);
      const start = next;
      next += overflow - entry + hold;
      slide.removeAttribute('data-measure');
      return {start, end:next, entry, overflow};
    });
    section.removeAttribute('data-measuring');
    return passages;
  }

  function layout() {
    layoutFrame = 0;
    const held = heldReading;
    heldReading = null;
    const viewport = root.clientHeight;
    pinTop = getComputedStyle(header).position === 'fixed' ? header.offsetHeight : 0;
    const available = Math.max(1, viewport - pinTop);
    root.style.setProperty('--studio-header-height', `${pinTop}px`);
    root.style.setProperty('--studio-window', `${available}px`);
    for (const story of stories) {
      const {section,scene,slides} = story;
      story.sticky = !flowLayouts.has(section.dataset.layout);
      section.toggleAttribute('data-sticky', story.sticky);
      section.removeAttribute('data-overflow-scene');
      section.removeAttribute('data-compact-scene');
      section.style.removeProperty('--studio-pan');
      if (story.active < 0) activate(story, 0);
      for (const [index,slide] of slides.entries()) slide.inert = story.sticky && index !== story.active;
      if (!story.sticky) continue;

      if (scene.offsetHeight > available) section.setAttribute('data-compact-scene', '');
      const content = scene.offsetHeight;
      story.passages = content > available ? measurePassages(story, available) : [];
      story.step = clamp(Math.round(viewport * .42), 260, 445);
      story.travel = story.passages.at(-1)?.end ?? story.step * (slides.length - .22);
      section.toggleAttribute('data-overflow-scene', Boolean(story.passages.length));
      section.style.setProperty('--studio-content', `${available}px`);
      section.style.setProperty('--studio-travel', `${story.travel}px`);
    }
    window.tradexEcosystemRefresh();
    if (held) {
      const {story,index,fraction,scanning} = held;
      const passage = story.passages[index];
      const length = passage && passage.end - passage.start;
      const offset = passage
        ? (scanning ? Math.min(length - 2, fraction * length) : 0)
        : (scanning ? 0 : fraction * story.step);
      window.scrollTo({top:Math.max(0,anchor(story,index) + offset),behavior:'instant'});
    }
    requestPaint();
  }

  function queueLayout() {
    if (!layoutFrame) layoutFrame = requestAnimationFrame(layout);
  }

  function reflow() {
    heldReading ??= reading;
    queueLayout();
  }

  function flowPosition(story) {
    const middle = document.documentElement.clientHeight * .57;
    const centres = story.slides.map(slide => { const r = slide.getBoundingClientRect(); return (r.top + r.bottom) / 2; });
    let index = centres.findIndex(y => y >= middle);
    if (index <= 0) return index === 0 ? 0 : centres.length - 1;
    return index - 1 + clamp((middle-centres[index-1])/(centres[index]-centres[index-1]),0,1);
  }

  function paint() {
    frame = 0;
    reading = null;
    for (const story of stories) {
      const {section,slides} = story;
      const bounds = section.getBoundingClientRect();
      if (bounds.bottom < 0 || bounds.top > innerHeight) continue;
      const distance = scrollY - start(story);
      let phase;
      let fraction = 0;
      if (story.passages.length) {
        const next = story.passages.findIndex(passage => distance < passage.end);
        phase = next < 0 ? slides.length - 1 : next;
        const {start:from,end,entry,overflow} = story.passages[phase];
        const offset = clamp(distance - from, 0, end - from);
        fraction = offset / (end - from);
        section.style.setProperty('--studio-pan', `${Math.min(entry + offset, overflow)}px`);
      } else {
        phase = story.sticky ? clamp(distance / story.step,0,slides.length - 1) : flowPosition(story);
        fraction = phase - Math.round(phase);
      }
      const index = Math.round(phase);
      if (story.sticky && distance >= 0 && distance < story.travel) {
        reading = {story,index,fraction,scanning:Boolean(story.passages.length)};
      }
      activate(story,index);
      const turn = reduced.matches ? 0 : phase * 72;
      section.style.setProperty('--studio-orbit-angle',`${turn}deg`);
      section.style.setProperty('--studio-orbit-pointer',`${index * 72}deg`);
      section.style.setProperty('--studio-phase',(phase / (slides.length-1)).toFixed(3));
      const parallax = reduced.matches || root.dataset.studioMotion === 'soft' ? 0 : (phase-index) * 11;
      section.style.setProperty('--studio-parallax',`${parallax}%`);
    }
  }

  function requestPaint() {
    if (!frame) frame = requestAnimationFrame(paint);
  }

  function go(story, index) {
    activate(story,index);
    window.scrollTo({top:Math.max(0,anchor(story,index)),behavior:'instant'});
    requestPaint();
  }

  window.tradexStudioAnchor = destination => {
    if (destination === message) return window.tradexHeroDescriptionAnchor();
    const story = stories.find(item => item.section === destination || item.section.contains(destination));
    if (!story) return;
    const index = story.slides.indexOf(destination);
    if (index >= 0 && story.sticky) activate(story, index);
    return index >= 0 ? anchor(story,index) : start(story);
  };

  for (const story of stories) {
    story.scene.addEventListener('focusin', event => {
      const passage = story.passages[story.active];
      if (!passage) return;
      const distance = scrollY - start(story) - passage.start;
      if (distance < 0 || distance >= passage.end - passage.start) return;
      const clip = story.pin.getBoundingClientRect();
      const target = event.target.getBoundingClientRect();
      const margin = 8;
      const delta = target.top < clip.top + margin ? target.top - clip.top - margin
        : Math.max(0,target.bottom - clip.bottom + margin);
      const offset = clamp(distance + delta, 0, passage.overflow - passage.entry);
      if (delta) window.scrollTo({top:anchor(story,story.active) + offset,behavior:'instant'});
    });
    for (const link of story.links) {
      link.addEventListener('click',event => {
        if (event.metaKey || event.ctrlKey || event.altKey || event.shiftKey || event.button !== 0) return;
        event.preventDefault();
        const index = Number(link.dataset.storySelect);
        go(story,index);
      });
      link.addEventListener('keydown',event => {
        const next = ['ArrowDown','ArrowRight'].includes(event.key);
        if (!next && !['ArrowUp','ArrowLeft'].includes(event.key)) return;
        event.preventDefault();
        const links = [...link.parentElement.querySelectorAll('[data-story-select]')];
        const index = (links.indexOf(link) + (next ? 1 : -1) + links.length) % links.length;
        links[index].focus({preventScroll:true});
        go(story,Number(links[index].dataset.storySelect));
      });
    }
  }

  layout();
  const initial = document.getElementById(location.hash.slice(1));
  const to = initial && window.tradexStudioAnchor(initial);
  if (Number.isFinite(to)) window.scrollTo({top:Math.max(0,to),behavior:'instant'});
  window.addEventListener('scroll',requestPaint,{passive:true});
  window.addEventListener('resize',reflow,{passive:true});
  document.fonts?.ready.then(reflow);
  new MutationObserver(reflow).observe(root,{attributes:true,attributeFilter:['lang']});
  if ('ResizeObserver' in window) {
    const observer = new ResizeObserver(queueLayout);
    observer.observe(header);
    stories.forEach(({pin}) => observer.observe(pin));
  }
})();
