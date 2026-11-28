(() => {
  const reduced = matchMedia('(prefers-reduced-motion: reduce)');

  function buildPoints(count, seedBase = 81721) {
    let seed = seedBase;
    const rand = () => ((seed = (1664525 * seed + 1013904223) >>> 0) / 4294967296);
    return Array.from({length:count}, (_, i) => {
      const outer = i < Math.round(count * 0.74);
      const n = outer ? Math.round(count * 0.74) : count - Math.round(count * 0.74);
      const j = outer ? i : i - Math.round(count * 0.74);
      const y = 1 - 2 * (j + .5) / n;
      const a = j * 2.3999632297 + (outer ? 0 : .7);
      const base = outer ? (.76 + .18 * rand()) : (.18 + .34 * Math.cbrt(rand()));
      const irregular = 1 + .10 * Math.sin(a * 2.7 + rand() * .9) + .06 * Math.sin(a * 6.1 + rand() * 1.3);
      const r = base * irregular;
      const q = Math.sqrt(Math.max(0, 1 - y * y));
      return {
        x:r * q * Math.cos(a), y:r * y, z:r * q * Math.sin(a),
        phase:rand() * Math.PI * 2, phaseY:rand() * Math.PI * 2, phaseZ:rand() * Math.PI * 2,
        speed:.30 + rand() * .48, rad:.72 + rand() * 1.1, bright:rand(), dx:0, dy:0,
      };
    });
  }

  function connect(points, degree = 5) {
    const edges = [], seen = new Set(), neighbors = points.map(() => []);
    points.forEach((p, i) => {
      const nearest = points.map((q, j) => ({j, d:(p.x-q.x)**2 + (p.y-q.y)**2 + (p.z-q.z)**2}))
        .filter(q => q.j !== i)
        .sort((a,b) => a.d - b.d)
        .slice(0, degree);
      for (const {j} of nearest) {
        const a = Math.min(i, j), b = Math.max(i, j), key = `${a}:${b}`;
        if (seen.has(key)) continue;
        seen.add(key);
        edges.push([a, b]);
        neighbors[a].push(b); neighbors[b].push(a);
      }
    });
    return {edges, neighbors};
  }

  function initMesh({ root, back, front, labels = [], mode = 'ecosystem' }) {
    if (!root || !back) return;
    const bc = back.getContext('2d');
    const fc = front?.getContext('2d');
    if (!bc) return;
    const canvases = fc ? [back, front] : [back];
    const contexts = fc ? [bc, fc] : [bc];
    const pts = buildPoints(mode === 'hero' ? 92 : 108, mode === 'hero' ? 99221 : 81721);
    const {edges, neighbors} = connect(pts, mode === 'hero' ? 4 : 5);
    let w = 0, h = 0, dpr = 1, frame = 0, last = 0, time = 0, visible = false;
    let active = 0, magnets = [], power = labels.map((_, i) => i === 0 ? 1 : 0);

    const isDark = () => mode === 'hero' || root.closest('section')?.matches('[data-section-background="graphite"],[data-section-background="midnight"]') || (document.documentElement.dataset.studioPalette === 'graphite' && !root.closest('#ecosystem')?.matches('[data-section-background="porcelain"],[data-section-background="mist"]'));

    function measureMagnets() {
      const box = root.getBoundingClientRect();
      const scale = Math.min(box.width, box.height) || 1;
      if (mode === 'ecosystem') {
        active = Math.max(0, labels.findIndex(n => n.getAttribute('aria-current') === 'true'));
        magnets = labels.map(node => {
          const r = node.getBoundingClientRect();
          return {
            x:(r.left + r.width / 2 - box.left - box.width / 2) / scale,
            y:(r.top + r.height / 2 - box.top - box.height / 2) / scale, hw:r.width/2+10, hh:r.height/2+10,
          };
        });
        if (power.length !== magnets.length) power = magnets.map((_, i) => i === active ? 1 : 0);
      } else {
        magnets = [];
      }
    }

    function resize() {
      const r = root.getBoundingClientRect();
      w = Math.max(1, r.width); h = Math.max(1, r.height);
      dpr = Math.min(devicePixelRatio || 1, 2);
      for (const canvas of canvases) { canvas.width = Math.round(w * dpr); canvas.height = Math.round(h * dpr); }
      measureMagnets();
      draw(0);
    }

    function draw(dt) {
      if (!w || !h) return;
      const dark = isDark(), s = Math.min(w, h);
      const angle = mode === 'hero' ? .34 : .42;
      const tilt = mode === 'hero' ? .18 : .23;
      const ca = Math.cos(angle), sa = Math.sin(angle), ct = Math.cos(tilt), st = Math.sin(tilt);
      if (mode === 'ecosystem') {
        const blend = dt ? 1 - Math.exp(-dt * 3.4) : 1;
        power = power.map((p, i) => p + ((i === active ? 1 : 0) - p) * blend);
      }
      const projected = pts.map((p, i) => {
        const x = p.x * ca + p.z * sa;
        const z = -p.x * sa + p.z * ca;
        const y = p.y * ct - z * st;
        const zz = p.y * st + z * ct;
        const perspective = 1 / (1 - zz * .16);
        const sx = (mode === 'hero' ? .54 : .375) * (1 + .035 * Math.sin(p.phase));
        const sy = (mode === 'hero' ? .54 : .375) * (1 + .03 * Math.cos(p.phaseY));
        return { x:x * sx * perspective, y:y * sy * perspective, z:zz };
      });

      const forces = projected.map((p, j) => {
        const base = pts[j];
        let fx = 0, fy = 0;
        const radius = Math.hypot(p.x, p.y) || .0001;
        const rim = Math.pow(Math.max(0, Math.min(1, (radius - .08) / .26)), 1.32);
        for (let i = 0; i < magnets.length; i++) {
          const m = magnets[i];
          const md = Math.hypot(m.x, m.y) || 1;
          const ux = m.x / md, uy = m.y / md;
          const facing = Math.max(0, (p.x * ux + p.y * uy) / radius);
          const distance = Math.hypot(m.x - p.x, m.y - p.y) || .0001;
          const proximity = Math.max(0, 1 - distance / (mode === 'hero' ? .78 : .92));
          const local = Math.pow(facing, mode === 'hero' ? 4.2 : 7.0) * (rim * .82 + proximity * .45);
          const selectBoost = mode === 'hero' ? 1 : (1 + power[i] * 1.95);
          const breath = 1 + .18 * Math.sin(time * (base.speed * 1.15) + base.phaseY + i * .65);
          const soft = (mode === 'hero' ? .010 : .012) + local * (.026 + (mode === 'ecosystem' ? power[i] * .032 : .012)) * breath * selectBoost;
          const cap = Math.max(0, distance - (mode === 'hero' ? .062 : .115));
          const strength = Math.min(cap, soft);
          fx += (m.x - p.x) / distance * strength;
          fy += (m.y - p.y) / distance * strength;
        }
        return {x:fx, y:fy};
      });

      let field = forces;
      for (let pass = 0; pass < 2; pass++) {
        const prev = field;
        field = prev.map((f, i) => {
          const ns = neighbors[i];
          const nx = ns.reduce((a, j) => a + prev[j].x, 0) / ns.length;
          const ny = ns.reduce((a, j) => a + prev[j].y, 0) / ns.length;
          const keep = mode === 'hero' ? .86 : .82;
          const share = 1 - keep;
          return { x: forces[i].x * keep + nx * share, y: forces[i].y * keep + ny * share };
        });
      }

      const points = projected.map((p, i) => {
        const b = pts[i], f = field[i];
        const settle = dt ? 1 - Math.exp(-dt * (mode === 'hero' ? 1.8 : 4.6)) : 1;
        b.dx += (f.x - b.dx) * settle;
        b.dy += (f.y - b.dy) * settle;
        const driftAmp = mode === 'hero' ? .008 : .026;
        const dx = driftAmp * Math.sin(time * (b.speed * 1.85) + b.phase) + (driftAmp * .38) * Math.sin(time * (b.speed * 2.31) + b.phaseZ);
        const dy = (driftAmp * 1.05) * Math.sin(time * (b.speed * 1.55) + b.phaseY) + (driftAmp * .32) * Math.cos(time * (b.speed * 1.93) + b.phase);
        const z = p.z + .028 * Math.sin(time * b.speed * .82 + b.phaseZ);
        let px=w/2+(p.x+b.dx+dx)*s, py=h/2+(p.y+b.dy+dy)*s;
        if(mode==='ecosystem') for(const m of magnets){const mx=w/2+m.x*s,my=h/2+m.y*s, vx=px-mx,vy=py-my;if(Math.abs(vx)<m.hw && Math.abs(vy)<m.hh){if(m.hw-Math.abs(vx)<m.hh-Math.abs(vy))px=mx+(vx<0?-1:1)*m.hw;else py=my+(vy<0?-1:1)*m.hh;}}
        return {x:px,y:py,z,r:b.rad,bright:b.bright};
      });

      contexts.forEach(ctx => { ctx.setTransform(dpr,0,0,dpr,0,0); ctx.clearRect(0,0,w,h); });
      for (const [i, j] of edges) {
        const a = points[i], b = points[j], z = (a.z + b.z) / 2;
        const ctx = fc ? (z > .25 ? fc : bc) : bc;
        const depth = (z + 1) / 2;
        const alpha = mode === 'hero' ? (.045 + depth * .08) : ((dark ? .10 : .08) + depth * (dark ? .18 : .14));
        ctx.strokeStyle = mode === 'hero'
          ? `rgba(${dark ? '106,216,240' : '21,131,157'},${alpha})`
          : `rgba(${dark ? '66,185,213' : '20,126,153'},${alpha})`;
        ctx.lineWidth = mode === 'hero' ? (.45 + depth * .16) : (.5 + depth * .24);
        ctx.beginPath(); ctx.moveTo(a.x, a.y); ctx.lineTo(b.x, b.y); ctx.stroke();
      }
      points.sort((a, b) => a.z - b.z);
      for (const p of points) {
        const depth = (p.z + 1) / 2;
        const ctx = fc ? (p.z > .25 ? fc : bc) : bc;
        const alpha = mode === 'hero' ? (.11 + depth * .16) : (.30 + depth * .43);
        ctx.fillStyle = p.bright > .86
          ? `rgba(0,${dark ? 224 : 170},${dark ? 245 : 198},${alpha})`
          : `rgba(${dark ? '72,163,190' : '24,119,149'},${alpha})`;
        ctx.beginPath(); ctx.arc(p.x, p.y, p.r * (mode === 'hero' ? (.46 + depth * .3) : (.64 + depth * .56)), 0, Math.PI * 2); ctx.fill();
      }
    }

    function sync() {
      measureMagnets();
      if (reduced.matches) draw(0);
      if (visible && !document.hidden && !reduced.matches && !frame) { last = 0; frame = requestAnimationFrame(tick); }
      else if ((!visible || document.hidden || reduced.matches) && frame) { cancelAnimationFrame(frame); frame = 0; }
    }
    function tick(now) {
      frame = 0;
      if (!visible || document.hidden || reduced.matches) return;
      const dt = last ? Math.min(.05, (now - last) / 1000) : .016;
      last = now; time += dt; draw(dt); frame = requestAnimationFrame(tick);
    }

    if (mode === 'ecosystem' && labels.length) new MutationObserver(sync).observe(root, {subtree:true, attributes:true, attributeFilter:['aria-current']});
    new ResizeObserver(resize).observe(root);
    new IntersectionObserver(entries => { visible = entries[0].isIntersecting; sync(); }, {rootMargin:'80px'}).observe(root);
    document.addEventListener('visibilitychange', sync);
    reduced.addEventListener('change', sync);
    document.fonts?.ready.then(resize);
    resize();
  }

  const ecoRoot = document.querySelector('#ecosystem .eco-dial');
  const ecoBack = ecoRoot?.querySelector('.eco-plexus');
  if (ecoRoot && ecoBack) {
    const ecoFront = document.createElement('canvas');
    ecoFront.className = 'eco-plexus-front';
    ecoFront.setAttribute('aria-hidden', 'true');
    ecoRoot.insertBefore(ecoFront, ecoRoot.querySelector('.eco-nodes'));
    initMesh({ root: ecoRoot, back: ecoBack, front: ecoFront, labels:[...ecoRoot.querySelectorAll('.eco-node')], mode:'ecosystem' });
  }

  const heroRoot = document.querySelector('.hero-stage .hero-summary-art');
  if (heroRoot) {
    initMesh({ root: heroRoot, back: heroRoot.querySelector('.hero-summary-plexus-back'), front: heroRoot.querySelector('.hero-summary-plexus-front'), mode:'hero' });
  }
})();
