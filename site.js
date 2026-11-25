(() => {
  const root = document.documentElement;
  const config = window.TRADEX_CONFIG;
  const settings = config.motion;
  const reduceMotion = matchMedia('(prefers-reduced-motion: reduce)');
  const mobileHero = matchMedia('(max-width: 720px)');
  const compactNav = matchMedia('(max-width: 1024px)');
  const finePointer = matchMedia('(hover: hover) and (pointer: fine)');
  const by = (selector, scope = document) => scope.querySelector(selector);
  const all = (selector, scope = document) => [...scope.querySelectorAll(selector)];
  const header = by('#header');
  const menu = by('.menu-toggle');
  const nav = by('#site-nav');
  const hero = by('.hero');
  const heroStage = by('.hero-stage');
  const heroSummary = by('.hero-summary');
  const heroMedia = by('.hero-media');
  const heroVideo = by('#hero-video');
  const desktopPoster = heroVideo.getAttribute('poster');
  const videoToggle = by('#video-toggle');
  const languageBar = by('.languages');
  const localeButtons = all('[data-lang]', languageBar);
  const cursor = by('.cursor-light');
  const count = by('#compound-count');
  const scenes = new Map();
  const navigationType = performance.getEntriesByType('navigation')[0]?.type;
  const restoreNativeScroll = navigationType === 'reload' || navigationType === 'back_forward';
  const scrollKey = `tradex-scroll:${location.pathname}${location.search}${location.hash}`;
  let refreshPosition = null;
  if (navigationType === 'reload') {
    try { refreshPosition = JSON.parse(sessionStorage.getItem(scrollKey)); } catch {}
  }
  let lang = 'en';
  let areaFormat = new Intl.NumberFormat('en-GB');
  let frame = 0;
  let pointerFrame = 0;
  let mouseX = 0, mouseY = 0, lightX = 0, lightY = 0;
  let videoPath = '';
  let videoRequested = false;
  let videoBlocked = false;
  let videoPausedByVisitor = false;
  let activeProfile = null;
  let ignoreProfileFocus = false;
  let directEntry = null;
  let currentNav = '';
  let lastArea = 100000;
  let sceneGeometry = [];
  let summaryShift = 0;
  let viewHeight = 0;
  function setMenu(open) {
    header.classList.toggle('menu-open', open);
    menu.setAttribute('aria-expanded', String(open));
  }

  function installHeroSources() {
    const { enabled, mobile, mp4, mobilePoster } = config.media.hero;
    const compact = mobileHero.matches;
    const poster = compact && mobilePoster ? mobilePoster : desktopPoster;
    if (heroVideo.getAttribute('poster') !== poster) heroVideo.setAttribute('poster', poster);
    const path = compact && mobile ? mobile : mp4;
    if (!path || path === videoPath || reduceMotion.matches || !enabled) return;

    const previousTime = heroVideo.currentTime;
    videoPath = path;
    videoRequested = false;
    videoBlocked = false;
    heroVideo.muted = true;
    heroVideo.toggleAttribute('data-landscape', path === mp4);
    if (previousTime > 0) {
      heroVideo.addEventListener('loadedmetadata', () => {
        if (videoPath === path && Number.isFinite(heroVideo.duration) && heroVideo.duration > 0) {
          heroVideo.currentTime = previousTime % heroVideo.duration;
        }
      }, { once:true });
    }
    heroVideo.setAttribute('src', path);
  }

  function updateVideoControl() {
    videoToggle.textContent = videoPausedByVisitor || videoBlocked
      ? (lang === 'de' ? 'Video abspielen' : 'Play video')
      : (lang === 'de' ? 'Video pausieren' : 'Pause video');
  }

  function updatePlayback(mediaVisible) {
    const shouldPlay = Boolean(videoPath) && mediaVisible && !document.hidden && !videoPausedByVisitor && !reduceMotion.matches;
    if (shouldPlay === videoRequested || (shouldPlay && videoBlocked)) return;
    videoRequested = shouldPlay;
    if (!shouldPlay) {
      heroVideo.pause();
      return;
    }
    const requestedPath = videoPath;
    heroVideo.play().catch(error => {
      if (videoPath !== requestedPath || !videoRequested || error.name === 'AbortError') return;
      videoRequested = false;
      videoBlocked = true;
      updateVideoControl();
      schedule();
    });
  }


  function installConfiguredContent() {
    all('[data-url]').forEach(link => { link.href = config.urls[link.dataset.url]; });

    const compoundPhoto = by('#compound-photo');
    if (config.media.compound) {
      compoundPhoto.src = config.media.compound;
      compoundPhoto.alt = 'TRADEX. vehicle logistics compound';
      compoundPhoto.dataset.deAlt = 'TRADEX. Fahrzeuglogistikstandort';
    }

    for (const location of all('[data-location]')) {
      const lines = config.locations[location.dataset.location];
      if (!lines?.length) continue;
      const address = by('address', location);
      address.replaceChildren();
      lines.forEach((line, index) => {
        if (index) address.append(document.createElement('br'));
        address.append(line);
      });
    }
  }

  const clamp = value => Math.min(1, Math.max(0, value));
  const ramp = (value, start, end) => clamp((value - start) / (end - start));
  const smooth = value => value * value * (3 - 2 * value);
  const amountAt = (progress, range) => range[0] === range[1]
    ? Number(progress >= range[0]) : smooth(ramp(progress, ...range));

  const heroParts = all(':scope > p, :scope > .action-row', heroSummary);
  const portalStack = by('.portal-stack');
  const portalFragments = all('.portal-fragment', portalStack);
  const portalSteps = all('.purchase-step');

  function setReveal(element, value, prefix = 'stage') {
    element.style.setProperty(`--${prefix}-opacity`, value.toFixed(3));
    element.style.setProperty(`--${prefix}-y`, `${(9 * (1 - value)).toFixed(2)}px`);
  }

  function revealInFlow(element, start = .92, end = .72) {
    if (reduceMotion.matches || element.contains(document.activeElement)) return 1;
    const distance = viewHeight * start - element.getBoundingClientRect().top;
    return smooth(ramp(distance, 0, viewHeight * (start - end)));
  }

  function collectScenes() {
    const ratios = {
      top: () => mobileHero.matches ? settings.heroTravelMobile : settings.heroTravelDesktop,
      ecosystem: () => settings.ecosystemTravel,
      compound: () => settings.compoundTravel,
      purchasing: () => settings.purchasingTravel,
    };
    for (const element of all('[data-progress]')) {
      const stage = by('.motion-stage', element);
      const steps = all('[data-step]', element);
      const compact = element.id === 'dealers' || element.id === 'coming';
      const earlyReveal = element.id === 'purchasing' || element.id === 'coming';
      scenes.set(element.id, {
        element, stage, ratio: ratios[element.id], steps, compact, earlyReveal,
        heading: earlyReveal ? by('.section-head', element) : null,
        arcs: all('.orbit-active', element),
        points: all('.orbit-point', element),
        orbit: by('.orbit-turn', element),
        titles: all('.eco-service .service-title', element),
        descriptions: all('.eco-service > p', element),
      });
    }
  }

  function arrangePortal() {
    const compact = mobileHero.matches;
    portalFragments.forEach((fragment, index) => {
      const target = compact ? portalSteps[index] : portalStack;
      if (fragment.parentNode !== target) target.append(fragment);
    });
    by('.portal-composition').hidden = compact;
  }

  function measureMotion() {
    viewHeight = window.innerHeight;
    const motion = !reduceMotion.matches;
    root.classList.toggle('motion', motion);
    arrangePortal();
    const headerHeight = header.offsetHeight;
    summaryShift = mobileHero.matches ? Math.min(heroSummary.offsetHeight * .74, viewHeight * .31) : viewHeight * .13;
    for (const scene of scenes.values()) {
      const canPin = scene.stage && motion && (scene.element !== hero || viewHeight >= 580);
      scene.element.classList.toggle('is-pinned', Boolean(canPin));
      const height = scene.stage?.offsetHeight || 0;
      scene.inset = 0;
      if (scene.element.id === 'coming') {
        const maxInset = viewHeight - height;
        scene.inset = Math.max(headerHeight, Math.min(maxInset, headerHeight + Math.min(32, viewHeight * .035)));
      } else if (scene.compact) {
        scene.inset = Math.max(headerHeight, Math.floor((viewHeight - height + headerHeight) / 2));
      }
      const fits = canPin && height + scene.inset <= viewHeight + 1;
      const revealDistance = scene.compact
        ? Math.min(150, Math.max(90, viewHeight * settings.compactTravel))
        : viewHeight * (scene.ratio?.() ?? 0);
      scene.reveal = fits ? Math.round(revealDistance) : 0;
      const holdDistance = scene.element.id === 'purchasing'
        ? Math.min(240, Math.max(185, viewHeight * .235))
        : scene.element.id === 'coming'
        ? Math.min(280, Math.max(180, viewHeight * .28))
        : scene.compact
        ? Math.min(55, Math.max(30, viewHeight * .055))
        : Math.min(270, Math.max(150, viewHeight * settings.holdRatio));
      const hold = fits ? Math.round(holdDistance) : 0;
      scene.travel = scene.reveal + hold;
      if (!fits) scene.element.classList.remove('is-pinned');
      scene.element.style.setProperty('--pin-inset', `${scene.inset}px`);
      scene.element.style.setProperty('--scene-height', `${height}px`);
      scene.element.style.setProperty('--travel', `${scene.travel}px`);
      scene.stageHeight = height;
    }
    sceneGeometry = [...scenes.values()].map(scene => {
      const bounds = scene.element.getBoundingClientRect();
      const top = bounds.top + scrollY;
      const pinStart = top - scene.inset;
      let approachStart = pinStart;
      if (scene.earlyReveal && scene.reveal) {
        const stageTop = scene.stage.getBoundingClientRect().top;
        const headingTop = scene.heading.getBoundingClientRect().top;
        const stepTop = scene.steps[0].getBoundingClientRect().top;
        const firstVisible = top + Math.max(headingTop, stepTop) - stageTop - viewHeight * .83;
        approachStart = pinStart - Math.min(viewHeight * .59, Math.max(80, pinStart - firstVisible));
      }
      return { ...scene, top, pinStart, approachStart, height: bounds.height };
    });
    installHeroSources();
    schedule();
  }

  function updateHero(progress, pinned, y, top, bottom) {
    const departure = pinned ? smooth(ramp(progress, 0, settings.heroClearAt)) : 0;
    const headline = pinned ? smooth(ramp(progress, .045, settings.heroClearAt)) : 1;
    heroStage.style.setProperty('--media-clip', `${(44 * departure).toFixed(2)}%`);
    heroStage.style.setProperty('--media-y', `${(-62 * departure).toFixed(2)}%`);
    heroStage.style.setProperty('--headline-y', `${(summaryShift * (1 - headline)).toFixed(2)}px`);
    heroParts.forEach((part, index) => {
      const value = pinned ? amountAt(progress, settings.heroStages[index]) : revealInFlow(part);
      setReveal(part, value);
      if (part.classList.contains('action-row')) part.inert = value < .95 && !part.contains(document.activeElement);
    });
    const mediaAway = departure * 1.06 >= 1 || bottom <= y || top >= y + viewHeight;
    heroMedia.classList.toggle('is-away', mediaAway);
    videoToggle.hidden = !videoPath || !heroVideo.videoWidth || reduceMotion.matches || mediaAway;
    updatePlayback(!mediaAway);
    header.classList.toggle('is-solid', y > 22);
  }

  function updateEcosystem(scene, progress, isPinned) {
    const windows = settings.ecosystemStages;
    const phases = scene.titles.map((heading, index) => ({
      title: isPinned ? amountAt(progress, windows[index * 2]) : revealInFlow(heading),
      description: isPinned ? amountAt(progress, windows[index * 2 + 1])
        : revealInFlow(scene.descriptions[index], .82, .62),
    }));
    let active = -1;
    phases.forEach(({title, description}, index) => {
      if (title > .15) active = index;
      setReveal(scene.titles[index], title);
      setReveal(scene.descriptions[index], description);
      const draw = title * .22 + description * .78;
      scene.arcs[index].style.setProperty('--arc', (1 - draw).toFixed(3));
      scene.points[index].toggleAttribute('data-reached', title > .15);
    });
    scene.points.forEach((point, index) => {
      point.toggleAttribute('data-current', index === active && !reduceMotion.matches);
    });
    const turns = isPinned
      ? settings.ecosystemTurns.reduce((n, window) => n + amountAt(progress, window), 0)
      : phases.reduce((n, phase) => n + phase.description, 0);
    const angle = reduceMotion.matches ? 0 : turns * settings.orbitDegrees;
    scene.orbit.style.setProperty('--orbit-angle', `${angle.toFixed(2)}deg`);
  }

  function setNumber(value) {
    if (lastArea === value) return;
    lastArea = value;
    count.textContent = areaFormat.format(value);
  }

  function updateCompoundCount(scene, progress, complete) {
    if (complete || reduceMotion.matches) {
      setNumber(100000);
      return;
    }
    const amount = scene.reveal ? amountAt(progress, settings.compoundCountStage)
      : revealInFlow(scene.steps[0], .86, .61);
    setNumber(81000 + Math.round(19000 * amount));
  }

  function goToSection(destination, focus = false) {
    const scene = sceneGeometry.find(item => item.element === destination);
    const complete = destination.id === 'compound' || scene?.compact;
    const preview = destination.id === 'purchasing';
    const padding = parseFloat(getComputedStyle(root).scrollPaddingTop) || 0;
    const top = scene?.top ?? destination.getBoundingClientRect().top + scrollY;
    const entryProgress = complete ? 1 : destination.id === 'ecosystem' ? settings.ecosystemStages[1][1] : 0;
    const entryDistance = preview && scene?.reveal ? scene.reveal * .05 : (scene?.reveal || 0) * entryProgress;
    const y = scene?.reveal ? Math.ceil(scene.pinStart + entryDistance)
      : destination === hero ? 0 : Math.max(0, top - padding);
    // Pinned compact scenes reach their final frame at the anchor itself.
    directEntry = (complete && !(scene?.compact && scene.reveal)) || (preview && !scene?.reveal)
      ? {id: destination.id, y, complete}
      : null;
    if (focus) {
      destination.setAttribute('tabindex', '-1');
      destination.focus({ preventScroll: true });
    }
    window.scrollTo({top:y, behavior:'instant'});
    schedule();
  }

  function restoreSectionFromHash() {
    const destination = document.getElementById(location.hash.slice(1));
    if (destination) goToSection(destination);
    else {
      directEntry = null;
      schedule();
    }
  }

  function rememberCompactPosition() {
    const y = scrollY;
    const visible = item => y >= item.top - viewHeight && y < item.top + item.height - header.offsetHeight;
    const candidates = sceneGeometry.filter(item => (item.compact || item.earlyReveal) && visible(item));
    const scene = candidates.find(item => y >= item.approachStart && y >= item.top - item.inset) || candidates[0];
    const key = `tradex-scroll:${location.pathname}${location.search}${location.hash}`;
    try {
      if (scene) {
        sessionStorage.setItem(key, JSON.stringify({ id: scene.element.id, offset: y - scene.top }));
      } else {
        sessionStorage.removeItem(key);
      }
    } catch {}
  }

  function restoreCompactPosition() {
    const scene = sceneGeometry.find(item => item.element.id === refreshPosition.id);
    if (scene && Number.isFinite(refreshPosition.offset)) {
      window.scrollTo({ top:scene.top + refreshPosition.offset, behavior:'instant' });
    }
    refreshPosition = null;
  }

  function updateStages(scene, progress, isPinned, windows, entry) {
    let active = -1;
    const amounts = windows.map((range, index) => {
      if (entry?.complete || (entry && index === 0)) return 1;
      if (isPinned) return amountAt(progress, range);
      if (scene.compact) return revealInFlow(scene.steps[index], .98 - index * .10, .83 - index * .10);
      if (scene.earlyReveal) return revealInFlow(scene.steps[index], .98, .80);
      return revealInFlow(scene.steps[index]);
    });
    if (!reduceMotion.matches) {
      for (let i = 0; i < amounts.length; i += 1) {
        if (amounts[i] > .15) active = i;
      }
    }
    scene.steps.forEach((step, index) => {
      const value = amounts[index];
      setReveal(step, value, 'step');
      if (scene.element.id === 'purchasing') {
        const selected = index === active;
        const color = !isPinned || index <= active
          ? selected ? '#00748d' : '#326577' : '#152732';
        step.style.setProperty('--stage-accent', color);
        step.toggleAttribute('data-current', selected);
        const fragment = portalFragments[index];
        const inStack = portalStack.contains(fragment);
        fragment.toggleAttribute('data-portal-current', selected);
        setReveal(fragment, inStack ? value : 1);
      }
    });
    return amounts;
  }

  function compactProgress(scene, y) {
    const fullyVisible = Math.min(scene.top + scene.stageHeight - viewHeight, scene.pinStart - 28);
    const lead = Math.min(112, Math.max(55, viewHeight * .12));
    // Start the first reveal on approach, then reserve the pinned travel for the second.
    const approach = .16 * ramp(y, fullyVisible - lead, fullyVisible);
    const arrival = .32 * ramp(y, fullyVisible, scene.pinStart);
    const pinned = .52 * ramp(y, scene.pinStart, scene.pinStart + scene.reveal);
    return approach + arrival + pinned;
  }

  function stageProgress(scene, y) {
    if (!scene.reveal) {
      return clamp((y + viewHeight * .2 - scene.top) / Math.max(viewHeight * .28, scene.height - viewHeight * .67));
    }
    if (scene.earlyReveal) {
      const approach = .26 * ramp(y, scene.approachStart, scene.pinStart);
      return approach + .74 * ramp(y, scene.pinStart, scene.pinStart + scene.reveal);
    }
    return scene.compact ? compactProgress(scene, y) : clamp((y - scene.pinStart) / scene.reveal);
  }

  function render() {
    frame = 0;
    const y = scrollY;
    let active = '';
    const windows = {
      compound: settings.compoundStages,
      dealers: settings.compactStages,
      purchasing: settings.purchasingStages,
      coming: settings.futureStages,
    };
    for (const scene of sceneGeometry) {
      const id = scene.element.id;
      const pinned = Boolean(scene.travel);
      const bottom = scene.top + scene.height;
      if (directEntry?.id === id && (y < directEntry.y - (pinned ? 2 : 24) || bottom <= y)) directEntry = null;
      const entry = directEntry?.id === id ? directEntry : null;
      const progress = stageProgress(scene, y);
      let rail = entry?.complete || reduceMotion.matches ? 1 : progress;
      if (scene.top <= y + viewHeight * .29) active = id;
      if (id === 'top') updateHero(progress, pinned, y, scene.top, bottom);
      else if (id === 'ecosystem') updateEcosystem(scene, progress, pinned);
      else if (windows[id]) {
        const amounts = updateStages(scene, progress, pinned, windows[id], entry);
        if ((scene.compact || scene.earlyReveal) && !pinned) rail = amounts.reduce((sum, amount) => sum + amount, 0) / amounts.length;
      }
      scene.element.style.setProperty('--section-progress', rail.toFixed(3));
      if (id === 'compound') updateCompoundCount(scene, progress, entry?.complete);
    }
    if (active !== currentNav) {
      currentNav = active;
      all('a[href^="#"]', nav).forEach(link => {
        if (link.hash === `#${active}`) link.setAttribute('aria-current', 'location');
        else link.removeAttribute('aria-current');
      });
    }
  }

  function schedule() {
    if (!frame) frame = requestAnimationFrame(render);
  }

  const flags = {
    de: '<path fill="#ffce00" d="M0 0h24v15H0z"/><path fill="#d00" d="M0 0h24v10H0z"/><path d="M0 0h24v5H0z"/>',
    en: '<path fill="#15316a" d="M0 0h24v15H0z"/><path stroke="#fff" stroke-width="2.6" d="m0 0 24 15m0-15L0 15"/><path stroke="#ce2639" d="m0 0 24 15m0-15L0 15"/><path stroke="#fff" stroke-width="4.2" d="M0 7.5h24M12 0v15"/><path stroke="#ce2639" stroke-width="2.2" d="M0 7.5h24M12 0v15"/>',
    hr: '<path fill="#1547ac" d="M0 0h24v15H0z"/><path fill="#fff" d="M0 0h24v10H0z"/><path fill="#dc2841" d="M0 0h24v5H0z"/><path fill="#d8293e" d="M10 5h4v5h-4z"/><path fill="#fff" d="M10 5h1v1h-1zm2 0h1v1h-1zm-1 1h1v1h-1zm2 0h1v1h-1zm-3 1h1v1h-1zm2 0h1v1h-1z"/>',
    it: '<path fill="#d72841" d="M0 0h24v15H0z"/><path fill="#fff" d="M0 0h16v15H0z"/><path fill="#009246" d="M0 0h8v15H0z"/>',
    da: '<path fill="#c91f37" d="M0 0h24v15H0z"/><path stroke="#fff" stroke-width="2" d="M0 7.5h24M8 0v15"/>',
    es: '<path fill="#ad1628" d="M0 0h24v15H0z"/><path fill="#ffcc43" d="M0 4h24v7H0z"/><path fill="#ad1628" d="M6 6h3v3H6z"/>',
    pt: '<path fill="#da273d" d="M0 0h24v15H0z"/><path fill="#087f45" d="M0 0h10v15H0z"/><circle fill="#ffce2b" cx="10" cy="7.5" r="2.7"/><path fill="#fff" d="M9 6h2v3H9z"/>',
    fr: '<path fill="#e3344b" d="M0 0h24v15H0z"/><path fill="#fff" d="M0 0h16v15H0z"/><path fill="#214d9f" d="M0 0h8v15H0z"/>',
    ro: '<path fill="#dc2c3f" d="M0 0h24v15H0z"/><path fill="#f7d047" d="M0 0h16v15H0z"/><path fill="#214d9f" d="M0 0h8v15H0z"/>',
    sq: '<path fill="#d22334" d="M0 0h24v15H0z"/><path d="m12 4 1 2 4-2-2 4 1 2-3-1-1 3-1-3-3 1 1-2-2-4 4 2z"/>',
    tr: '<path fill="#d92335" d="M0 0h24v15H0z"/><circle fill="#fff" cx="9" cy="7.5" r="4"/><circle fill="#d92335" cx="10.6" cy="7.5" r="3.2"/><path fill="#fff" d="m15 5.5.6 1.4 1.6.1-1.2 1 .4 1.5-1.4-.8-1.3.8.3-1.5-1.2-1 1.6-.1z"/>',
  };
  const languages = {
    en: ['English','Englisch'], de:['German','Deutsch'], hr:['Croatian','Kroatisch'],
    it:['Italian','Italienisch'], da:['Danish','Dänisch'], es:['Spanish','Spanisch'],
    pt:['Portuguese','Portugiesisch'], fr:['French','Französisch'], ro:['Romanian','Rumänisch'],
    sq:['Albanian','Albanisch'], tr:['Turkish','Türkisch'],
  };

  function localiseInline(element, de) {
    element.dataset.en = element.textContent;
    element.dataset.de = de || element.textContent;
  }

  function appendProfileText(panel, field, className) {
    if (!field?.en && !field?.de) return;
    const p = document.createElement('p');
    p.className = className;
    p.textContent = field.en || field.de;
    localiseInline(p, field.de);
    panel.append(p);
  }

  function buildProfiles() {
    for (const person of all('[data-person]')) {
      const id = person.dataset.person;
      const datum = window.TRADEX_PROFILES[id];
      if (!datum) continue;
      const trigger = by('.portrait-trigger', person);
      const panel = by('.inline-profile', person);
      const name = by('.person-meta h3', person);
      const role = by('.person-meta p', person);
      appendProfileText(panel, { en: name.textContent, de: name.textContent }, 'profile-name');
      appendProfileText(panel, { en: role.textContent, de: role.dataset.de }, 'profile-role');
      appendProfileText(panel, datum.bio, 'bio');
      appendProfileText(panel, datum.focus, 'focus');
      if (datum.languages?.length) {
        const list = document.createElement('ul');
        list.className = 'language-list';
        list.setAttribute('aria-label', 'Languages');
        list.dataset.deLabel = 'Sprachen';
        for (const code of datum.languages) {
          if (!flags[code]) continue;
          const li = document.createElement('li');
          const flag = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
          flag.setAttribute('viewBox', '0 0 24 15');
          flag.setAttribute('aria-hidden', 'true');
          flag.innerHTML = flags[code];
          const label = document.createElement('span');
          label.textContent = languages[code][0];
          localiseInline(label, languages[code][1]);
          li.append(flag, label);
          list.append(li);
        }
        panel.append(list);
      }
      const contacts = document.createElement('div');
      contacts.className = 'profile-links';
      for (const [value, scheme] of [[datum.email, 'mailto:'], [datum.phone, 'tel:']]) {
        if (!value) continue;
        const link = document.createElement('a');
        link.textContent = value;
        link.href = scheme + (scheme === 'tel:' ? value.replace(/[^+\d]/g, '') : value);
        contacts.append(link);
      }
      if (contacts.childElementCount) panel.append(contacts);
      trigger.hidden = false;
      const record = { person, trigger, panel, pinned: false };
      person.addEventListener('pointerenter', event => {
        if (event.pointerType === 'mouse' || (event.pointerType === 'pen' && event.buttons === 0)) openProfile(record, false);
      });
      person.addEventListener('pointerleave', () => {
        if (activeProfile === record && !record.pinned && !panel.contains(document.activeElement)) closeProfile();
      });
      trigger.addEventListener('focus', () => {
        if (!ignoreProfileFocus && trigger.matches(':focus-visible')) openProfile(record, false);
      });
      function toggleProfile() {
        if (activeProfile === record && record.pinned) closeProfile(true);
        else openProfile(record, true);
      }
      trigger.addEventListener('click', toggleProfile);
      panel.addEventListener('click', event => {
        if (!event.target.closest('a,button')) toggleProfile();
      });
      person.addEventListener('focusout', event => {
        if (activeProfile === record && !person.contains(event.relatedTarget) && !person.matches(':hover')) closeProfile();
      });
      panel.hidden = false;
      panel.inert = true;
    }
  }

  function openProfile(record, pinned) {
    if (activeProfile !== record) {
      if (!pinned && activeProfile?.panel.contains(document.activeElement)) return;
      closeProfile();
      activeProfile = record;
    }
    record.pinned ||= pinned;
    record.panel.inert = false;
    record.person.classList.add('is-expanded');
    record.trigger.setAttribute('aria-expanded', 'true');
  }

  function closeProfile(restoreFocus = false) {
    if (!activeProfile) return;
    const { panel, person, trigger } = activeProfile;
    activeProfile.pinned = false;
    activeProfile = null;
    panel.inert = true;
    person.classList.remove('is-expanded');
    trigger.setAttribute('aria-expanded', 'false');
    if (restoreFocus) {
      ignoreProfileFocus = true;
      trigger.focus({ preventScroll: true });
      ignoreProfileFocus = false;
    }
  }

  function translatePage(selected) {
    lang = selected;
    root.lang = lang;
    areaFormat = new Intl.NumberFormat(lang === 'de' ? 'de-DE' : 'en-GB');
    count.textContent = areaFormat.format(lastArea);
    document.title = lang === 'de' ? 'TRADEX. | Europäischer Fahrzeughandel' : 'TRADEX. | European car trading';
    for (const [suffix, property] of [['', ''], ['-label', 'aria-label'], ['-alt', 'alt'], ['-href', 'href']]) {
      all(`[data-de${suffix}]`).forEach(element => {
        const original = property ? element.getAttribute(property) : element.textContent;
        const key = `data-en${suffix}`;
        if (!element.hasAttribute(key)) element.setAttribute(key, original);
        const next = element.getAttribute(`data-${lang}${suffix}`);
        if (property) element.setAttribute(property, next);
        else element.textContent = next;
      });
    }
    all('[data-de-html]').forEach(element => {
      if (!element.hasAttribute('data-en-html')) element.dataset.enHtml = element.innerHTML;
      // The bilingual emphasis strings are authored in index.html.
      element.innerHTML = lang === 'de' ? element.dataset.deHtml : element.dataset.enHtml;
    });
    for (const button of localeButtons) button.setAttribute('aria-pressed', String(button.dataset.lang === lang));
    updateVideoControl();
    measureMotion();
  }

  function moveLight() {
    pointerFrame = 0;
    lightX += (mouseX - lightX) * .2;
    lightY += (mouseY - lightY) * .2;
    cursor.style.setProperty('--pointer-x', `${lightX - 180}px`);
    cursor.style.setProperty('--pointer-y', `${lightY - 180}px`);
    if (Math.abs(mouseX - lightX) + Math.abs(mouseY - lightY) > 1) pointerFrame = requestAnimationFrame(moveLight);
  }

  function resetLight() {
    cursor.classList.remove('is-active');
    if (pointerFrame) cancelAnimationFrame(pointerFrame);
    pointerFrame = 0;
  }

  function installEntrances() {
    if (!('IntersectionObserver' in window)) return;
    const observer = new IntersectionObserver(entries => {
      for (const entry of entries) {
        if (!entry.isIntersecting) continue;
        observer.unobserve(entry.target);
        if (reduceMotion.matches || (directEntry && entry.target.closest('section')?.id === directEntry.id)) continue;
        const index = all('[data-enter]', entry.target.parentElement).indexOf(entry.target);
        entry.target.animate([{opacity:.25,transform:'translateY(14px)'},{opacity:1,transform:'translateY(0)'}],
          {duration:380,delay:(index % 4) * 42,easing:'ease-out',fill:'none'});
      }
    }, { threshold:.13 });
    all('[data-enter]').forEach(node => observer.observe(node));
  }

  root.classList.add('js');
  installConfiguredContent();
  collectScenes();
  installHeroSources();
  if ((!location.hash || location.hash === '#top') && scrollY < 20) updatePlayback(true);
  buildProfiles();
  installEntrances();
  menu.hidden = false;
  languageBar.hidden = false;

  menu.addEventListener('click', () => setMenu(menu.getAttribute('aria-expanded') === 'false'));
  document.addEventListener('click', event => {
    const navLink = event.target.closest('a[href^="#"]');
    if (!navLink?.hash || event.defaultPrevented || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
    const destination = document.getElementById(navLink.hash.slice(1));
    if (!destination) return;
    event.preventDefault();
    setMenu(false);
    if (location.hash !== navLink.hash) history.pushState(null, '', navLink.hash);
    goToSection(destination, true);
  });
  document.addEventListener('keydown', event => {
    if (event.key !== 'Escape') return;
    if (activeProfile) closeProfile(true);
    else if (header.classList.contains('menu-open')) {
      setMenu(false);
      menu.focus();
    }
  });
  document.addEventListener('pointerdown', event => {
    if (!header.contains(event.target)) setMenu(false);
    if (activeProfile && !activeProfile.person.contains(event.target)) closeProfile();
  });
  document.addEventListener('pointermove', event => {
    if (event.pointerType !== 'mouse' || !finePointer.matches || reduceMotion.matches) return;
    mouseX = event.clientX;
    mouseY = event.clientY;
    if (!cursor.classList.contains('is-active')) {
      lightX = mouseX;
      lightY = mouseY;
      cursor.classList.add('is-active');
    }
    if (!pointerFrame) pointerFrame = requestAnimationFrame(moveLight);
  }, { passive: true });
  document.documentElement.addEventListener('pointerleave', resetLight);
  finePointer.addEventListener('change', resetLight);
  compactNav.addEventListener('change', () => setMenu(false));

  for (const button of localeButtons) {
    button.addEventListener('click', () => {
      if (button.dataset.lang === lang) return;
      translatePage(button.dataset.lang);
      try { localStorage.setItem('tradex-language', lang); } catch {}
    });
  }

  videoToggle.addEventListener('click', () => {
    if (videoBlocked) {
      videoBlocked = false;
      videoPausedByVisitor = false;
      updatePlayback(true);
    } else {
      videoPausedByVisitor = !videoPausedByVisitor;
      if (!videoPausedByVisitor) updatePlayback(true);
    }
    updateVideoControl();
    schedule();
  });
  heroVideo.addEventListener('loadeddata', schedule);
  document.addEventListener('visibilitychange', () => {
    if (document.hidden) resetLight();
    schedule();
  });
  window.addEventListener('hashchange', () => {
    measureMotion();
    restoreSectionFromHash();
  });
  window.addEventListener('pagehide', rememberCompactPosition);
  window.addEventListener('pageshow', event => {
    measureMotion();
    // Native reloads can restore before sticky heights are applied. Resolve the saved offset against measured geometry.
    if (!event.persisted && refreshPosition) requestAnimationFrame(restoreCompactPosition);
    if (!event.persisted && !restoreNativeScroll && location.hash) restoreSectionFromHash();
  });
  window.addEventListener('scroll', schedule, { passive:true });
  window.addEventListener('resize', measureMotion, { passive:true });
  reduceMotion.addEventListener('change', () => { resetLight(); measureMotion(); });
  if (document.fonts) document.fonts.ready.then(() => {
    const wasAtEntry = directEntry && Math.abs(scrollY - directEntry.y) <= 24;
    measureMotion();
    if (wasAtEntry) restoreSectionFromHash();
  });
  if ('ResizeObserver' in window) {
    const observer = new ResizeObserver(measureMotion);
    for (const scene of scenes.values()) if (scene.stage) observer.observe(scene.stage);
  }

  let savedLanguage = 'en';
  try { savedLanguage = localStorage.getItem('tradex-language') === 'de' ? 'de' : 'en'; } catch {}
  translatePage(savedLanguage);
  if (!restoreNativeScroll && location.hash) restoreSectionFromHash();
})();
