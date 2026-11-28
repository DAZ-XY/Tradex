(() => {
  const root = document.documentElement;
  const header = document.querySelector('#header');
  const message = document.getElementById('hero-description');
  const reduced = matchMedia('(prefers-reduced-motion: reduce)');
  const flowLayouts = new Set(['folio','timeline','spread','support','roadmap']);
  const stories = [...document.querySelectorAll('.studio-story')].map(section => ({
    section, scene:section.querySelector('.studio-scene'), slides:[...section.querySelectorAll('.studio-slide')],
    links:[...section.querySelectorAll('[data-story-select]')], active:-1, sticky:false, step:0,
  }));
  let frame = 0;
  let layoutFrame = 0;
  const clamp = (value,lo,hi) => Math.min(hi,Math.max(lo,value));
  function start(story) {
    return story.section.getBoundingClientRect().top + scrollY - (story.pinTop ?? header.offsetHeight);
  }

  function anchor(story,index = 0) {
    return story.sticky ? start(story) + index * story.step
      : story.slides[index].getBoundingClientRect().top + scrollY - header.offsetHeight - 17;
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
      slide.toggleAttribute('data-past', story.section.id === 'data-and-people' && i < index);
      slide.toggleAttribute('data-future', story.section.id === 'data-and-people' && i > index);
      slide.inert = story.sticky && (story.section.id === 'data-and-people' ? i > index : i !== index);
      slide.querySelector('.portal-fragment')?.toggleAttribute('data-portal-current',i === index);
    });
    story.links.forEach(link => {
      if (Number(link.dataset.storySelect) === index) link.setAttribute('aria-current','true');
      else link.removeAttribute('aria-current');
    });
  }

  function layout() {
    layoutFrame = 0;
    for (const story of stories) {
      const {section,scene,slides} = story;
      const viewport = document.documentElement.clientHeight;
      const dossierSequence = section.id === 'data-and-people';
      const valueChainSequence = section.id === 'services' && !reduced.matches;
      const ecosystemSequence = section.id === 'ecosystem' && innerWidth >= 681 && !reduced.matches;
      const fixedSequence = dossierSequence || valueChainSequence || ecosystemSequence;
      const candidate = fixedSequence || ((innerWidth >= 680 || viewport >= 740) && !flowLayouts.has(section.dataset.layout) && !reduced.matches);
      section.toggleAttribute('data-sticky',candidate);
      const content = Math.ceil(scene.getBoundingClientRect().height);
      story.sticky = candidate && (fixedSequence || content <= viewport - header.offsetHeight + 3);
      story.pinTop = fixedSequence ? Math.min(header.offsetHeight, viewport - content) : header.offsetHeight;
      if (fixedSequence) section.style.setProperty('--dossier-pin-top', `${story.pinTop}px`);
      section.toggleAttribute('data-sticky',story.sticky);
      story.step = dossierSequence ? clamp(Math.round(viewport * .29), 180, 320) : clamp(Math.round(viewport * .42), 260, 445);
      section.style.setProperty('--studio-content', `${content}px`);
      section.style.setProperty('--studio-travel', `${story.step * (slides.length - .22)}px`);
      for (const [index,slide] of slides.entries()) slide.inert = story.sticky && (dossierSequence ? index > Math.max(story.active,0) : index !== Math.max(story.active,0));
    }
    window.tradexEcosystemRefresh();
    requestPaint();
  }

  function queueLayout() {
    if (!layoutFrame) layoutFrame = requestAnimationFrame(layout);
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
    for (const story of stories) {
      const {section,slides} = story;
      const bounds = section.getBoundingClientRect();
      if (bounds.bottom < 0 || bounds.top > innerHeight) continue;
      const phase = story.sticky ? clamp((scrollY - start(story)) / story.step,0,slides.length - 1) : flowPosition(story);
      const index = Math.round(phase);
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
    window.scrollTo({top:Math.max(0,anchor(story,index)),behavior:'instant'});
    activate(story,index);
    requestPaint();
  }

  window.tradexStudioAnchor = destination => {
    if (destination === message) return window.tradexHeroDescriptionAnchor();
    const story = stories.find(item => item.section === destination || item.section.contains(destination));
    if (!story) return;
    const index = story.slides.indexOf(destination);
    return index >= 0 ? anchor(story,index) : start(story);
  };

  for (const story of stories) {
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
  window.addEventListener('resize',queueLayout,{passive:true});
  reduced.addEventListener('change',queueLayout);
  document.fonts?.ready.then(queueLayout);
  if ('ResizeObserver' in window) {
    const observer = new ResizeObserver(queueLayout);
    stories.forEach(({scene}) => observer.observe(scene));
  }
})();
