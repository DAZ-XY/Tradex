(() => {
  const root = document.documentElement;
  const config = window.TRADEX_CONFIG;
  const settings = config.motion;
  const reduceMotion = matchMedia('(prefers-reduced-motion: reduce)');
  const mobileHero = matchMedia('(max-width: 720px)');
  const compactNav = matchMedia('(max-width: 1024px)');
  const fullScenes = matchMedia('(min-width: 921px) and (min-height: 700px)');
  const finePointer = matchMedia('(hover: hover) and (pointer: fine)');
  const by = (selector, scope = document) => scope.querySelector(selector);
  const all = (selector, scope = document) => [...scope.querySelectorAll(selector)];
  const header = by('#header');
  const menu = by('.menu-toggle');
  const nav = by('#site-nav');
  const hero = by('.hero');
  const heroStage = by('.hero-stage');
  const heroCopy = by('.hero-copy');
  const heroSlogan = by('#hero-slogan');
  const heroSummary = by('.hero-summary');
  const heroMedia = by('.hero-media');
  const heroVideo = by('#hero-video');
  const desktopPoster = heroVideo.getAttribute('poster');
  const compoundVideo = by('#compound-video');
  const compoundFrame = by('.compound-frame');
  const playingVideos = new WeakSet();
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
  let activeProfile = null;
  let ignoreProfileFocus = false;
  let currentNav = '';
  let lastArea = 100000;
  let sceneGeometry = [];
  let summaryShift = 0;
  let alignedHeadlineOffset = 0;
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
    playingVideos.delete(heroVideo);
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

  function updatePlayback(video, mediaVisible) {
    const shouldPlay = video.hasAttribute('src') && mediaVisible && !document.hidden && !reduceMotion.matches;
    if (shouldPlay === playingVideos.has(video)) return;
    if (!shouldPlay) {
      playingVideos.delete(video);
      video.pause();
      return;
    }
    playingVideos.add(video);
    // Keep the poster available if the browser blocks automatic playback.
    video.play().catch(() => {});
  }

  function updateCompoundPlayback() {
    const bounds = compoundFrame.getBoundingClientRect();
    const visible = bounds.bottom > 0 && bounds.top < viewHeight;
    if (visible && config.media.compound && !reduceMotion.matches && !compoundVideo.hasAttribute('src')) {
      compoundVideo.src = config.media.compound;
    }
    updatePlayback(compoundVideo, visible);
  }


  function installConfiguredContent() {
    all('[data-url]').forEach(link => { link.href = config.urls[link.dataset.url]; });

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
  const choreoWindows = { label:[0,.31], title:[.11,.54], lead:[.30,.78], detail:[.48,.98], photo:[0,.69] };

  function setReveal(element, value, prefix = 'stage') {
    element.style.setProperty(`--${prefix}-opacity`, value.toFixed(3));
    element.style.setProperty(`--${prefix}-y`, `${((prefix === 'choreo' ? 22 : prefix === 'piece' ? 19 : 9) * (1 - value)).toFixed(2)}px`);
  }

  function revealInFlow(element, start = .92, end = .72) {
    if (reduceMotion.matches || element.contains(document.activeElement)) return 1;
    const distance = viewHeight * start - element.getBoundingClientRect().top;
    return smooth(ramp(distance, 0, viewHeight * (start - end)));
  }

  function collectScenes() {
    const ratios = {
      top: () => mobileHero.matches ? settings.heroTravelMobile : settings.heroTravelDesktop,
      services: () => settings.serviceTravel,
      'data-and-people': () => settings.studyTravel,
      compound: () => settings.compoundTravel,
      company: () => settings.companyTravel,
      coming: () => settings.futureTravel,
    };
    for (const element of all('[data-progress]')) {
      const stage = by('.motion-stage', element);
      const steps = all('[data-step]', element);
      const future = element.id === 'coming';
      const sequence = all('[data-sequence]', element);
      const study = all('[data-study]', element);
      scenes.set(element.id, {
        element, stage, ratio: ratios[element.id], steps, future, sequence, study,
        pieces: sequence.map(panel => all('[data-piece]', panel)),
        choreo: all('[data-choreo]', element),
        lastRender: {y:NaN},
        photo: by('.photo-motion', element),
      });
    }
  }

  function offsetWithin(element, ancestor) {
    let offset = 0;
    for (let node = element; node && node !== ancestor; node = node.offsetParent) {
      offset += node.offsetTop;
    }
    return offset;
  }

  function measureMotion() {
    viewHeight = window.innerHeight;
    const motion = !reduceMotion.matches;
    root.classList.toggle('motion', motion);
    summaryShift = mobileHero.matches ? Math.min(heroSummary.offsetHeight * .74, viewHeight * .31) : viewHeight * .13;
    alignedHeadlineOffset = offsetWithin(heroSummary, heroCopy) - offsetWithin(heroSlogan, heroCopy);
    for (const scene of scenes.values()) {
      const needsDesktop = scene.sequence.length || scene.study.length
        || scene.future || scene.element.id === 'compound';
      const canPin = scene.stage && motion && (scene.element !== hero || viewHeight >= 580)
        && (!needsDesktop || fullScenes.matches);
      scene.element.classList.toggle('is-pinned', Boolean(canPin));
      scene.inset = 0;
      const height = scene.stage?.offsetHeight || 0;
      const fits = canPin && height <= viewHeight + 1 && Boolean(scene.ratio);
      scene.reveal = fits ? Math.round(viewHeight * scene.ratio()) : 0;
      const holdRatio = scene.future ? .25 : .22;
      const hold = fits ? Math.round(Math.min(270, viewHeight * holdRatio)) : 0;
      scene.travel = scene.reveal + hold;
      if (!fits) scene.element.classList.remove('is-pinned');
      scene.element.style.setProperty('--pin-inset', '0px');
      scene.element.style.setProperty('--scene-height', `${height}px`);
      scene.element.style.setProperty('--travel', `${scene.travel}px`);
      scene.stageHeight = height;
      scene.lastRender.y = NaN;
    }
    sceneGeometry = [...scenes.values()].map(scene => {
      const bounds = scene.element.getBoundingClientRect();
      const top = bounds.top + scrollY;
      const pinStart = top - scene.inset;
      return { ...scene, top, pinStart, height: bounds.height };
    });
    installHeroSources();
    schedule();
  }

  function updateHero(progress, pinned, y, top, bottom) {
    const departure = pinned ? smooth(ramp(progress, 0, settings.heroClearAt)) : 0;
    const headlineProgress = smooth(ramp(progress, .055, .44));
    const headlineTarget = mobileHero.matches ? 0 : alignedHeadlineOffset;
    const headlineOffset = pinned
      ? summaryShift + (headlineTarget - summaryShift) * headlineProgress
      : 0;
    heroStage.style.setProperty('--media-clip', `${(44 * departure).toFixed(2)}%`);
    heroStage.style.setProperty('--media-y', `${(-62 * departure).toFixed(2)}%`);
    heroStage.style.setProperty('--headline-y', `${headlineOffset.toFixed(2)}px`);
    heroParts.forEach((part, index) => {
      const value = pinned ? amountAt(progress, settings.heroStages[index]) : revealInFlow(part);
      setReveal(part, value);
      const lift = index === 0 ? 18 : 13;
      part.style.setProperty('--summary-lift', `${((1 - value) * (reduceMotion.matches ? 0 : lift)).toFixed(2)}px`);
      if (part.classList.contains('action-row')) part.inert = value < .95 && !part.contains(document.activeElement);
    });
    const mediaAway = departure * 1.06 >= 1 || bottom <= y || top >= y + viewHeight;
    heroMedia.classList.toggle('is-away', mediaAway);
    updatePlayback(heroVideo, !mediaAway);
    header.classList.toggle('is-solid', y > 22);
  }

  function updateChoreography(scene, y, pinned) {
    const arrival = ramp(y, scene.top - viewHeight * .68, scene.pinStart + viewHeight * .1);
    scene.choreo.forEach(element => {
      const kind = element.dataset.choreo;
      const value = scene.element === hero && y < 24 ? 1
        : reduceMotion.matches ? 1
        : pinned ? amountAt(arrival, choreoWindows[kind])
        : revealInFlow(element, .98, kind === 'photo' ? .73 : .81);
      setReveal(element, value, 'choreo');
    });
  }

  function updateSequence(scene, progress, pinned) {
    const phase = Math.min(progress * scene.sequence.length, scene.sequence.length - .0001);
    const current = Math.floor(phase);
    const within = phase - current;
    scene.sequence.forEach((panel, index) => {
      const active = index === current;
      const distance = phase - index;
      const entry = index === 0 ? 1 : smooth(ramp(within, 0, .27));
      const exit = index === scene.sequence.length - 1 ? 1 : 1 - .21 * smooth(ramp(within,.86,1));
      panel.toggleAttribute('data-active', pinned && active);
      panel.toggleAttribute('data-tail', pinned && !active && distance >= 1 && distance < 1.15);
      if (pinned && !active) panel.setAttribute('aria-hidden', 'true');
      else panel.removeAttribute('aria-hidden');
      setReveal(panel, pinned ? active ? (.84 + entry * .16) * exit : .18 * (1 - ramp(distance,1,1.15)) : 1, 'sequence');
      if (pinned && active) {
        panel.style.setProperty('--phase-y', `${(19 * (1 - entry)).toFixed(2)}px`);
        panel.style.setProperty('--phase-scale', (1.025 - entry * .025).toFixed(3));
      }
      if (pinned && !active) return;
      scene.pieces[index].forEach((piece, i) => {
        const value = pinned
          ? .65 + .35 * smooth(ramp(within, i * .069, .27 + i * .069))
          : revealInFlow(piece, .98, .80);
        setReveal(piece, value, 'piece');
      });
    });
  }

  function updatePhoto(scene, progress, maxScale) {
    const value = reduceMotion.matches ? 0 : smooth(progress);
    scene.photo.style.setProperty('--photo-scale', (1 + value * (maxScale - 1)).toFixed(4));
    scene.photo.style.setProperty('--photo-y', `${(-12 * value).toFixed(2)}px`);
  }

  function updateStudy(scene, progress, pinned) {
    scene.study.forEach((item,index) => {
      const value = pinned ? amountAt(progress, settings.studyStages[index]) : revealInFlow(item, .98, .8);
      setReveal(item,value,'study');
    });
    updatePhoto(scene,progress,1.075);
  }

  function setNumber(value) {
    if (lastArea === value) return;
    lastArea = value;
    count.textContent = areaFormat.format(value);
  }

  function updateCompoundCount(scene, progress) {
    if (reduceMotion.matches) {
      setNumber(100000);
      return;
    }
    const amount = scene.reveal ? amountAt(progress, settings.compoundCountStage)
      : revealInFlow(scene.steps[1], .88, .66);
    setNumber(81000 + Math.round(19000 * amount));
  }

  function goToSection(destination, focus = false) {
    const scene = sceneGeometry.find(item => item.element === destination);
    const padding = parseFloat(getComputedStyle(root).scrollPaddingTop) || 0;
    const top = scene?.top ?? destination.getBoundingClientRect().top + scrollY;
    const entryProgress = {compound:.13, coming:.45}[destination.id] ?? 0;
    const entryDistance = (scene?.reveal || 0) * entryProgress;
    const storyTarget = window.tradexStudioAnchor?.(destination);
    const y = Number.isFinite(storyTarget) ? storyTarget : scene?.reveal ? Math.ceil(scene.pinStart + entryDistance)
      : destination === hero ? 0 : Math.max(0, top - padding);
    if (focus) {
      if (destination.tabIndex < 0 && !destination.hasAttribute('tabindex')) {
        destination.setAttribute('tabindex', '-1');
      }
      destination.focus({ preventScroll: true });
    }
    window.scrollTo({top:y, behavior:'instant'});
    schedule();
  }

  window.tradexEcosystemRefresh = measureMotion;
  window.tradexHeroDescriptionAnchor = () => {
    const scene = sceneGeometry.find(item => item.element === hero);
    if (scene?.reveal) return scene.pinStart + scene.reveal * settings.heroStages.at(-1)[1];
    return heroSummary.getBoundingClientRect().top + scrollY - header.offsetHeight;
  };

  function restoreSectionFromHash() {
    const destination = document.getElementById(location.hash.slice(1));
    if (destination) goToSection(destination);
    else schedule();
  }

  function rememberCompactPosition() {
    const y = scrollY;
    const visible = item => y >= item.top - viewHeight && y < item.top + item.height - header.offsetHeight;
    const candidates = sceneGeometry.filter(item => item.future && visible(item));
    const scene = candidates.find(item => y >= item.top - item.inset) || candidates[0];
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

  function updateStages(scene, progress, isPinned, windows) {
    let active = -1;
    const amounts = windows.map((range, index) => {
      if (isPinned) return amountAt(progress, range);
      if (scene.future) return revealInFlow(scene.steps[index], .98, .80);
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
      step.toggleAttribute('data-current', index === active);
    });
    return amounts;
  }

  function stageProgress(scene, y) {
    if (!scene.reveal) {
      return clamp((y + viewHeight * .2 - scene.top) / Math.max(viewHeight * .28, scene.height - viewHeight * .67));
    }
    return clamp((y - scene.pinStart) / scene.reveal);
  }

  function render(time) {
    frame = 0;
    const y = scrollY;
    let active = '';
    const windows = {
      coming: settings.futureStages,
      compound: settings.compoundStages,
    };
    for (const scene of sceneGeometry) {
      const id = scene.element.id;
      const pinned = Boolean(scene.travel);
      const bottom = scene.top + scene.height;
      const progress = stageProgress(scene, y);
      let rail = reduceMotion.matches ? 1 : progress;
      if (scene.top <= y + viewHeight * .29) active = id === 'ecosystem' && by('#dealers').getBoundingClientRect().top < viewHeight * .3 ? 'dealers' : id;
      const buffered = bottom >= y - viewHeight && scene.top <= y + viewHeight * 2;
      if (!buffered && scene.lastRender.y === (y > bottom ? Infinity : -Infinity) && !reduceMotion.matches) continue;
      scene.lastRender.y = buffered ? y : y > bottom ? Infinity : -Infinity;
      updateChoreography(scene, y, pinned);
      if (id === 'top') updateHero(progress, pinned, y, scene.top, bottom);
      else if (scene.sequence.length) updateSequence(scene, progress, pinned);
      else if (scene.study.length) updateStudy(scene, progress, pinned);
      else if (windows[id]) {
        const amounts = updateStages(scene, progress, pinned, windows[id]);
        if (scene.future && !pinned) rail = amounts.reduce((sum, amount) => sum + amount, 0) / amounts.length;
      }
      scene.element.style.setProperty('--section-progress', rail.toFixed(3));
      if (id === 'compound') {
        updateCompoundCount(scene, progress);
        updatePhoto(scene, progress, 1.085);
        updateCompoundPlayback();
      }
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
      const portrait = by('.portrait-display', person);
      const name = by('.person-meta h3', person);
      const role = by('.person-meta p', person);
      appendProfileText(panel, { en: name.textContent, de: name.textContent }, 'profile-name');
      const panelName = by('.profile-name', panel);
      panelName.id = `${panel.id}-name`;
      panel.setAttribute('aria-labelledby', panelName.id);
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
          label.className = 'sr-only';
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
      const record = { person, trigger, panel };
      let pressType = '';
      portrait.addEventListener('pointerenter', event => {
        if (event.pointerType === 'mouse' || (event.pointerType === 'pen' && event.buttons === 0)) openProfile(record);
      });
      portrait.addEventListener('pointerleave', event => {
        if (event.pointerType !== 'touch' && activeProfile === record) closeProfile();
      });
      trigger.addEventListener('focus', () => {
        if (!ignoreProfileFocus && trigger.matches(':focus-visible')) openProfile(record);
      });
      trigger.addEventListener('pointerdown', event => { pressType = event.pointerType; });
      trigger.addEventListener('click', event => {
        if (event.detail === 0) openProfile(record);
        else if (pressType === 'touch') {
          if (activeProfile === record) closeProfile();
          else openProfile(record);
        }
        pressType = '';
      });
      person.addEventListener('focusout', event => {
        if (activeProfile === record && !person.contains(event.relatedTarget) && !portrait.matches(':hover')) closeProfile();
      });
      panel.hidden = false;
      panel.inert = true;
    }
  }

  function openProfile(record) {
    if (activeProfile !== record) {
      closeProfile();
      activeProfile = record;
    }
    record.panel.inert = false;
    record.person.classList.add('is-expanded');
    record.trigger.setAttribute('aria-expanded', 'true');
  }

  function closeProfile(restoreFocus = false) {
    if (!activeProfile) return;
    const { panel, person, trigger } = activeProfile;
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
    for (const [suffix, property] of [['', ''], ['-label', 'aria-label'], ['-alt', 'alt'], ['-href', 'href'], ['-content', 'content']]) {
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
        if (reduceMotion.matches) continue;
        const index = all('[data-enter]', entry.target.parentElement).indexOf(entry.target);
        entry.target.animate([{opacity:.25,transform:'translateY(14px)'},{opacity:1,transform:'translateY(0)'}],
          {duration:380,delay:(index % 4) * 42,easing:'ease-out',fill:'none'});
      }
    }, { threshold:.13 });
    all('[data-enter]').forEach(node => observer.observe(node));
    const portraits = all('[data-portrait]');
    const portraitObserver = new IntersectionObserver(entries => {
      for (const entry of entries) {
        if (!entry.isIntersecting) continue;
        const portrait = entry.target;
        const img = by('.portrait-frame img', portrait);
        portraitObserver.unobserve(portrait);
        img.decode().catch(() => {}).then(() => { portrait.dataset.portraitVisible = ''; });
      }
    }, { rootMargin: '0px 0px 85px 0px', threshold: .08 });
    portraits.forEach((portrait,index) => {
      portrait.style.setProperty('--portrait-delay', `${(index % 4) * 36}ms`);
      portraitObserver.observe(portrait);
    });
    root.classList.add('portrait-reveals');
  }

  root.classList.add('js');
  installConfiguredContent();
  collectScenes();
  installHeroSources();
  if ((!location.hash || location.hash === '#top') && scrollY < 20) updatePlayback(heroVideo, true);
  buildProfiles();
  installEntrances();
  menu.hidden = false;
  languageBar.hidden = false;

  menu.addEventListener('click', () => setMenu(menu.getAttribute('aria-expanded') === 'false'));
  document.addEventListener('click', event => {
    const navLink = event.target.closest('a[href^="#"]');
    if (!navLink?.hash || navLink.hasAttribute('data-story-select') || event.defaultPrevented || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
    const destination = document.getElementById(navLink.hash.slice(1));
    if (!destination) return;
    event.preventDefault();
    setMenu(false);
    const jump = () => {
      if (location.hash !== navLink.hash) history.pushState(null, '', navLink.hash);
      goToSection(destination, true);
    };
    if (!window.tradexApprovedNavigate?.(destination, jump)) jump();
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
    measureMotion();
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
