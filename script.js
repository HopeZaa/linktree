(() => {
  "use strict";

  const root = document.documentElement;
  const reducedMotion = matchMedia("(prefers-reduced-motion: reduce)");
  const compactScreen = matchMedia("(max-width: 640px)");
  const clamp = (value) => Math.max(0, Math.min(1, value));
  const parts = [...document.querySelectorAll("[data-build]")];
  const sections = [...document.querySelectorAll("[data-section]")];
  const navigation = document.getElementById("site-nav");
  const menuButton = document.getElementById("menu-toggle");
  const progressLine = document.getElementById("page-progress");
  const buildProgress = document.getElementById("build-progress");
  const buildStatus = document.getElementById("build-status");
  const buildDetail = document.getElementById("build-detail");
  const motionButton = document.getElementById("motion-toggle");
  const motionLabel = document.getElementById("motion-label");
  const replayButton = document.getElementById("replay-build");
  const agentLayer = document.getElementById("agent-layer");
  const introGuide = document.querySelector(".intro-guide");
  const builders = [
    { name: "structure", color: "#ffc19b" },
    { name: "type", color: "#d6c6e6" },
    { name: "detail", color: "#ccdda8" },
  ];
  let preference;
  try {
    preference = localStorage.getItem("hopezaa-motion");
  } catch (_) {
    /* Optional preference. */
  }
  let motionEnabled = !reducedMotion.matches && preference !== "off";
  let frame = 0;
  let dirty = true;
  let previousTime = 0;
  let lastScroll = -2000;
  let pageProgress = 0;
  let currentSection = sections[0];
  let navigationReady = false;
  let focusedPart = null;
  let moving = false;
  let emitParticles = () => {};
  const introScript = document.querySelector(".intro-script");
  const ribbon = document.querySelector(".ribbon-track");
  const title = document.querySelector(".hero-title");
  title.setAttribute("aria-label", "PORTFOLIO");
  for (const node of [...title.childNodes]) {
    if (node.nodeType === Node.TEXT_NODE) node.remove();
  }
  const glyphs = document.createDocumentFragment();
  for (const character of "PORTFOLIO") {
    const glyph = document.createElement("span");
    glyph.className = "hero-glyph";
    glyph.dataset.char = character;
    glyph.textContent = character;
    glyph.setAttribute("aria-hidden", "true");
    glyphs.append(glyph);
  }
  title.prepend(glyphs);
  document.querySelectorAll(".skill-card").forEach((card, i) => {
    const watermark = document.createElement("span");
    watermark.className = "skill-watermark";
    watermark.setAttribute("aria-hidden", "true");
    watermark.textContent = String(i + 1).padStart(2, "0");
    card.append(watermark);
  });

  const states = parts.map((element, index) => {
    const builder = builders[index % builders.length];
    element.style.setProperty("--agent-color", builder.color);
    // Wrap direct text nodes, without changing any grid/flex layout or heading semantics.
    for (const node of [...element.childNodes]) {
      if (node.nodeType === Node.TEXT_NODE && node.textContent.trim()) {
        const text = document.createElement("span");
        text.className = "build-text";
        node.replaceWith(text);
        text.append(node);
      }
    }
    const outline = document.createElement("span");
    outline.className = "build-frame";
    outline.setAttribute("aria-hidden", "true");
    const label = document.createElement("span");
    label.className = "build-label";
    label.textContent = `${element.dataset.build} / structure`;
    const scanner = document.createElement("span");
    scanner.className = "scan-line";
    outline.append(label, scanner);
    element.append(outline);
    return {
      element,
      label,
      progress: 0,
      goal: 0,
      rect: null,
      leaving: false,
      bucket: 0,
      glyphs: [...element.querySelectorAll(".hero-glyph")],
    };
  });

  const cursors = builders.map((builder) => {
    const element = document.createElement("div");
    element.className = "agent-cursor";
    element.style.setProperty("--cursor-color", builder.color);
    element.innerHTML =
      '<svg viewBox="0 0 18 23" aria-hidden="true"><path d="M1 1 16 11 9 12 12 19 8 21 5 14 1 18Z"/></svg>';
    const name = document.createElement("span");
    name.className = "agent-name";
    name.textContent = builder.name;
    element.append(name);
    agentLayer.append(element);
    return { element, x: 0, y: 0, visible: false };
  });

  function updateControls() {
    motionButton.setAttribute("aria-pressed", String(motionEnabled));
    motionLabel.textContent = motionEnabled ? "on" : "off";
    replayButton.disabled = !motionEnabled;
    if (!motionEnabled) {
      buildStatus.textContent = "MOTION PAUSED";
      buildDetail.textContent = "All content visible · take your time";
      return;
    }
    const building = states.some(
      (state) => state.goal > 0 && state.goal < 0.99 && state.rect?.bottom > 80,
    );
    buildStatus.textContent = building
      ? `BUILDING ${currentSection.dataset.section.toUpperCase()}`
      : "SCROLL TO BUILD";
    buildDetail.textContent = "Structure → content · scroll back to rebuild";
  }

  function measure() {
    dirty = false;
    const height = innerHeight;
    const maxScroll = document.documentElement.scrollHeight - height;
    pageProgress = maxScroll > 0 ? clamp(scrollY / maxScroll) : 0;
    // Read every rectangle first; write visual styles only after measurement.
    for (const state of states) {
      const rect = state.element.getBoundingClientRect();
      state.rect = rect;
      const enter = clamp(
        (height * 0.94 - rect.top) /
          (height * 0.3 + Math.min(rect.height * 0.24, 100)),
      );
      const leave = clamp((rect.bottom - 32) / Math.min(height * 0.12, 85));
      state.leaving = leave < enter;
      state.goal =
        !motionEnabled || state.element === focusedPart
          ? 1
          : Math.min(enter, leave);
    }
    let nextSection = sections[0];
    for (const section of sections) {
      if (section.getBoundingClientRect().top < height * 0.53)
        nextSection = section;
    }
    if (nextSection !== currentSection || !navigationReady) {
      navigationReady = true;
      currentSection = nextSection;
      for (const link of document.querySelectorAll(
        '.site-nav a[href^="#"], .chapter-rail a[href^="#"]',
      )) {
        const selected = link.getAttribute("href") === `#${currentSection.id}`;
        link.classList.toggle("is-active", selected);
        if (selected) link.setAttribute("aria-current", "location");
        else link.removeAttribute("aria-current");
      }
    }
    root.classList.toggle(
      "experience-started",
      scrollY > height * 0.32 || !motionEnabled,
    );
    progressLine.style.transform = `scaleX(${pageProgress})`;
    buildProgress.style.transform = `scaleX(${pageProgress})`;
    introGuide.style.opacity = String(1 - clamp(scrollY / (height * 0.5)));
    const introProgress = scrollY / height;
    const introOpacity =
      clamp((introProgress - 0.015) / 0.13) *
      clamp((0.55 - introProgress) / 0.2);
    introScript.style.opacity = motionEnabled ? String(introOpacity) : "0";
    introScript.style.transform = `translate3d(0,${-introProgress * 70}px,0) scale(${1.08 - Math.min(1, introProgress) * 0.11})`;
    if (ribbon)
      ribbon.style.transform = `translate3d(${-(scrollY * 0.1)}px,0,0)`;
    updateControls();
  }

  function paintPart(state) {
    const p = state.progress;
    state.element.style.setProperty("--build-p", p.toFixed(4));
    const bucket = Math.floor(p * 5);
    if (bucket !== state.bucket && state.rect) {
      if (p > 0.1 && p < 0.98)
        emitParticles(
          state.rect,
          p,
          state.element.style.getPropertyValue("--agent-color"),
          state.leaving,
        );
      state.bucket = bucket;
    }
    if (state.glyphs.length)
      state.glyphs.forEach((glyph, index) => {
        const local = clamp((p - 0.05 - index * 0.025) / 0.65);
        glyph.style.setProperty("--glyph-opacity", String(clamp(local * 3)));
        glyph.style.setProperty("--glyph-y", `${(1 - local) * 40}px`);
        glyph.style.setProperty("--glyph-angle", `${(1 - local) * 65}deg`);
        glyph.style.setProperty("--glyph-fill", `${(1 - local) * 100}%`);
      });
    state.element.style.setProperty(
      "--path-offset",
      `${(1 - clamp((p - 0.25) / 0.65)) * 450}`,
    );
    const content = clamp((p - 0.21) / 0.65);
    const smoothContent = content * content * (3 - 2 * content);
    const outline = Math.min(clamp(p / 0.15), clamp((1 - p) / 0.14));
    const style = state.element.style;
    style.setProperty("--part-opacity", clamp(p / 0.07).toFixed(4));
    style.setProperty("--content-opacity", smoothContent.toFixed(4));
    style.setProperty("--content-clip", `${((1 - content) * 100).toFixed(2)}%`);
    style.setProperty(
      "--content-offset",
      `${((1 - content) * 9).toFixed(2)}px`,
    );
    style.setProperty("--content-blur", `${((1 - content) * 2).toFixed(2)}px`);
    style.setProperty("--frame-opacity", outline.toFixed(4));
    style.setProperty(
      "--wire-clip",
      `${((1 - clamp(p / 0.24)) * 100).toFixed(2)}%`,
    );
    style.setProperty("--scan-x", `${(content * 100).toFixed(2)}%`);
    state.element.dataset.buildState =
      p < 0.01
        ? "empty"
        : p > 0.99
          ? "built"
          : state.leaving
            ? "clearing"
            : "building";
    state.label.textContent = `${state.element.dataset.build} / ${state.leaving ? "clearing" : p < 0.3 ? "structure" : "assembling"}`;
  }

  function drawBuilders(time, delta) {
    // Builders visit the structure itself. No pointer listener, cursor trail,
    // idle flock, or relationship to the visitor's mouse position is used.
    const working = motionEnabled && time - lastScroll < 850;
    const targets = states.filter(
      (state) =>
        state.rect &&
        state.rect.bottom > 100 &&
        state.rect.top < innerHeight - 100 &&
        state.progress > 0.025 &&
        state.progress < 0.98,
    );
    targets.sort(
      (a, b) =>
        Math.abs(a.rect.top + a.rect.height / 2 - innerHeight * 0.57) -
        Math.abs(b.rect.top + b.rect.height / 2 - innerHeight * 0.57),
    );
    const count = compactScreen.matches ? 1 : 3;
    for (let index = 0; index < cursors.length; index++) {
      const cursor = cursors[index];
      const target = targets[index];
      const visible = working && index < count && Boolean(target);
      if (visible) {
        const rect = target.rect;
        const p = target.progress;
        const t = clamp(p / 0.28) * 4;
        let x, y;
        if (p < 0.28) {
          if (t < 1) {
            x = rect.left + rect.width * t;
            y = rect.top;
          } else if (t < 2) {
            x = rect.right;
            y = rect.top + rect.height * (t - 1);
          } else if (t < 3) {
            x = rect.right - rect.width * (t - 2);
            y = rect.bottom;
          } else {
            x = rect.left;
            y = rect.bottom - rect.height * (t - 3);
          }
        } else {
          const content = clamp((p - 0.21) / 0.65);
          x = rect.left + rect.width * content;
          y = rect.top + rect.height * (0.3 + content * 0.4);
        }
        x = Math.max(10, Math.min(innerWidth - 60, x));
        y = Math.max(90, Math.min(innerHeight - 110, y));
        const ease = 1 - Math.exp(-delta / 75);
        if (!cursor.visible) {
          cursor.x = x;
          cursor.y = y;
        }
        cursor.x += (x - cursor.x) * ease;
        cursor.y += (y - cursor.y) * ease;
        cursor.element.style.transform = `translate3d(${cursor.x.toFixed(1)}px,${cursor.y.toFixed(1)}px,0)`;
      }
      if (visible !== cursor.visible) {
        cursor.visible = visible;
        cursor.element.classList.toggle("is-visible", visible);
      }
    }
    return working;
  }

  function render(time) {
    frame = 0;
    if (document.hidden) return;
    const delta = previousTime ? Math.min(50, time - previousTime) : 16;
    previousTime = time;
    if (dirty) measure();
    const ease = motionEnabled ? 1 - Math.exp(-delta / 92) : 1;
    moving = false;
    for (const state of states) {
      const difference = state.goal - state.progress;
      if (Math.abs(difference) > 0.001) {
        state.progress += difference * ease;
        moving = true;
        paintPart(state);
      } else if (state.progress !== state.goal) {
        state.progress = state.goal;
        paintPart(state);
      }
    }
    const buildersWorking = drawBuilders(time, delta);
    if (moving || buildersWorking) frame = requestAnimationFrame(render);
  }

  function wake() {
    if (!frame && !document.hidden) {
      previousTime = 0;
      frame = requestAnimationFrame(render);
    }
  }
  function requestUpdate() {
    dirty = true;
    wake();
  }

  function setMotion(enabled, remember = false) {
    motionEnabled = enabled && !reducedMotion.matches;
    root.classList.toggle("motion-enabled", motionEnabled);
    root.classList.toggle("motion-disabled", !motionEnabled);
    if (remember) {
      preference = motionEnabled ? "on" : "off";
      try {
        localStorage.setItem("hopezaa-motion", preference);
      } catch (_) {
        /* Optional preference. */
      }
    }
    // Every visual is visible immediately in the accessible motion-off mode.
    for (const state of states) {
      state.progress = motionEnabled ? 0 : 1;
      paintPart(state);
    }
    requestUpdate();
    updateControls();
  }

  window.addEventListener(
    "scroll",
    () => {
      lastScroll = performance.now();
      requestUpdate();
    },
    { passive: true },
  );
  window.addEventListener("resize", requestUpdate, { passive: true });
  document.addEventListener("visibilitychange", () => {
    if (document.hidden) {
      cancelAnimationFrame(frame);
      frame = 0;
    } else requestUpdate();
  });
  motionButton.addEventListener("click", () => {
    if (reducedMotion.matches) {
      buildDetail.textContent =
        "Reduced motion is enabled in your device settings.";
      return;
    }
    setMotion(!motionEnabled, true);
  });
  replayButton.addEventListener("click", () => {
    if (!motionEnabled) return;
    for (const state of states) {
      state.progress = 0;
      paintPart(state);
    }
    lastScroll = performance.now();
    requestUpdate();
  });
  reducedMotion.addEventListener("change", () =>
    setMotion(!reducedMotion.matches && preference !== "off"),
  );

  function closeMenu(returnFocus = false) {
    navigation.classList.remove("is-open");
    menuButton.setAttribute("aria-expanded", "false");
    menuButton.setAttribute("aria-label", "Open navigation");
    if (returnFocus) menuButton.focus();
  }
  menuButton.addEventListener("click", () => {
    const open = menuButton.getAttribute("aria-expanded") !== "true";
    navigation.classList.toggle("is-open", open);
    menuButton.setAttribute("aria-expanded", String(open));
    menuButton.setAttribute(
      "aria-label",
      open ? "Close navigation" : "Open navigation",
    );
  });
  document.addEventListener("keydown", (event) => {
    if (event.key === "Escape" && navigation.classList.contains("is-open"))
      closeMenu(true);
  });
  function visitSection(
    target,
    behavior = motionEnabled ? "smooth" : "instant",
  ) {
    const top =
      target.getBoundingClientRect().top +
      scrollY -
      (target.id === "home" ? 0 : 72);
    window.scrollTo({ top: Math.max(0, top), behavior });
    requestUpdate();
  }
  document.addEventListener("click", (event) => {
    const anchor = event.target.closest('a[href^="#"]');
    if (!event.target.closest(".site-header") || anchor) closeMenu();
    if (
      !anchor ||
      event.button > 0 ||
      event.metaKey ||
      event.ctrlKey ||
      event.shiftKey ||
      event.altKey
    )
      return;
    const hash = anchor.getAttribute("href");
    const target = document.getElementById(hash.slice(1));
    if (!target) return;
    event.preventDefault();
    if (location.hash !== hash) history.pushState(null, "", hash);
    visitSection(target);
  });
  history.scrollRestoration = "manual";
  window.addEventListener("popstate", () => {
    const target = document.getElementById(location.hash.slice(1));
    if (target) visitSection(target);
    else window.scrollTo({ top: 0, behavior: "instant" });
  });
  window.addEventListener("pageshow", () => {
    const target = document.getElementById(location.hash.slice(1));
    if (target) visitSection(target, "instant");
  });
  compactScreen.addEventListener("change", () => closeMenu());
  document.addEventListener("focusin", (event) => {
    focusedPart = event.target.closest("[data-build]");
    const state = states.find((item) => item.element === focusedPart);
    if (state) {
      state.progress = 1;
      paintPart(state);
    }
    requestUpdate();
  });
  document.addEventListener("focusout", () => {
    focusedPart = null;
    requestUpdate();
  });

  setMotion(motionEnabled);

  function createVisualScene() {
    const canvas = document.getElementById("scene-canvas");
    const artifact = document.getElementById("artifact-canvas");
    const context = canvas.getContext("2d");
    const art = artifact.getContext("2d");
    if (!context || !art) return;
    const core = artifact.closest("[data-build]");
    let width = innerWidth,
      height = innerHeight,
      artWidth = 0,
      artHeight = 0;
    let visible = true,
      frameId = 0,
      previous = 0,
      elapsed = 0;
    let oldScroll = scrollY,
      velocity = 0;
    const sparks = [];
    const geometry = [];
    const stars = Array.from(
      { length: compactScreen.matches ? 21 : 42 },
      (_, i) => ({
        x: Math.sin(i * 38.13 + 5) * 0.5 + 0.5,
        y: Math.cos(i * 17.43 + 2) * 0.5 + 0.5,
        phase: i * 1.73,
      }),
    );
    const dot = (a, b) => a.x * b.x + a.y * b.y + a.z * b.z;
    const subtract = (a, b) => ({ x: a.x - b.x, y: a.y - b.y, z: a.z - b.z });
    const cross = (a, b) => ({
      x: a.y * b.z - a.z * b.y,
      y: a.z * b.x - a.x * b.z,
      z: a.x * b.y - a.y * b.x,
    });
    const normal = (v) => {
      const length = Math.hypot(v.x, v.y, v.z) || 1;
      return { x: v.x / length, y: v.y / length, z: v.z / length };
    };
    const curve = (t) => ({
      x: (1 + 0.29 * Math.cos(3 * t)) * Math.cos(2 * t),
      y: (1 + 0.29 * Math.cos(3 * t)) * Math.sin(2 * t),
      z: 0.49 * Math.sin(3 * t),
    });
    function vertex(t, angle) {
      const center = curve(t);
      const tangent = normal(subtract(curve(t + 0.001), center));
      const side = normal({ x: tangent.y, y: -tangent.x, z: 0 });
      const up = normal(cross(tangent, side));
      const tube = 0.19 + 0.025 * Math.cos(6 * t);
      return {
        x:
          center.x + tube * (side.x * Math.cos(angle) + up.x * Math.sin(angle)),
        y:
          center.y + tube * (side.y * Math.cos(angle) + up.y * Math.sin(angle)),
        z:
          center.z + tube * (side.z * Math.cos(angle) + up.z * Math.sin(angle)),
      };
    }
    const segments = compactScreen.matches ? 48 : 64;
    const sides = 7;
    for (let segment = 0; segment < segments; segment++) {
      for (let side = 0; side < sides; side++) {
        const t = (segment / segments) * Math.PI * 2,
          next = ((segment + 1) / segments) * Math.PI * 2;
        const a = (side / sides) * Math.PI * 2,
          b = ((side + 1) / sides) * Math.PI * 2;
        geometry.push({
          vertices: [
            vertex(t, a),
            vertex(next, a),
            vertex(next, b),
            vertex(t, b),
          ],
          id: segment * sides + side,
        });
      }
    }

    function resize() {
      width = innerWidth;
      height = innerHeight;
      const dpr = Math.min(devicePixelRatio || 1, 1.5);
      canvas.width = Math.round(width * dpr);
      canvas.height = Math.round(height * dpr);
      context.setTransform(dpr, 0, 0, dpr, 0, 0);
      const box = artifact.getBoundingClientRect();
      artWidth = box.width;
      artHeight = box.height;
      artifact.width = Math.round(artWidth * dpr);
      artifact.height = Math.round(artHeight * dpr);
      art.setTransform(dpr, 0, 0, dpr, 0, 0);
      start();
    }

    emitParticles = (rect, p, color, leaving) => {
      if (!motionEnabled || rect.bottom < 80 || rect.top > innerHeight - 90)
        return;
      const count = compactScreen.matches ? 2 : 4;
      for (let i = 0; i < count; i++) {
        const angle = (i / count) * Math.PI * 2 + p * 7;
        sparks.push({
          x: rect.left + rect.width * clamp((p - 0.15) / 0.7),
          y: Math.max(
            90,
            Math.min(height - 90, rect.top + rect.height * (0.25 + p * 0.5)),
          ),
          vx: Math.cos(angle) * (leaving ? 22 : 34),
          vy: Math.sin(angle) * 28 - 15,
          life: 1,
          color,
          size: i % 2 ? 1 : 2,
        });
      }
      if (sparks.length > 100) sparks.splice(0, sparks.length - 100);
    };

    function drawWorld(time, delta) {
      context.clearRect(0, 0, width, height);
      const intro = scrollY / height;
      const presence = motionEnabled ? clamp(intro * 3) : 0.3;
      if (presence < 0.002) return;
      const glow = context.createRadialGradient(
        width * 0.74,
        height * 0.43,
        0,
        width * 0.74,
        height * 0.43,
        Math.min(width, height) * 0.65,
      );
      glow.addColorStop(0, `rgba(122,40,23,${0.11 * presence})`);
      glow.addColorStop(1, "rgba(45,15,15,0)");
      context.fillStyle = glow;
      context.fillRect(0, 0, width, height);
      context.lineWidth = 1;
      const horizon = height * 0.61;
      context.strokeStyle = `rgba(228,139,95,${0.025 * presence})`;
      for (let i = -7; i <= 7; i++) {
        context.beginPath();
        context.moveTo(width * 0.5 + i * 7, horizon);
        context.lineTo(width * 0.5 + i * width * 0.15, height);
        context.stroke();
      }
      for (let i = 1; i < 11; i++) {
        const fraction = (i + ((scrollY * 0.002) % 1)) / 11;
        const y = horizon + fraction * fraction * (height - horizon);
        context.beginPath();
        context.moveTo(0, y);
        context.lineTo(width, y);
        context.stroke();
      }
      const portal = clamp(intro * 5) * clamp((1.15 - intro) * 1.7);
      if (portal > 0.001) {
        const radius =
          Math.min(width * 0.28, height * 0.27) * (1 + intro * 0.35);
        const x = width * 0.5,
          y = height * 0.43 - intro * height * 0.09;
        for (let i = 0; i < 5; i++) {
          const r = radius * (0.72 + i * 0.1);
          context.strokeStyle = `rgba(242,106,68,${portal * (i === 3 ? 0.18 : 0.045)})`;
          context.beginPath();
          context.ellipse(
            x,
            y,
            r,
            r * 0.67,
            -0.32 + intro * 0.25,
            0,
            Math.PI * 2,
          );
          context.stroke();
        }
      }
      for (const star of stars) {
        const y = (star.y * height - scrollY * 0.08 + height * 3) % height;
        const pulse = 0.5 + Math.sin(time * 0.0005 + star.phase) * 0.25;
        context.fillStyle = `rgba(220,185,153,${pulse * 0.16 * presence})`;
        context.fillRect(star.x * width, y, 1, 1);
      }
      for (let i = sparks.length - 1; i >= 0; i--) {
        const p = sparks[i];
        p.life -= delta * 0.0012;
        p.x += p.vx * delta * 0.001;
        p.y += p.vy * delta * 0.001;
        if (p.life <= 0) {
          sparks.splice(i, 1);
          continue;
        }
        context.globalAlpha = p.life * 0.6;
        context.fillStyle = p.color;
        context.fillRect(p.x, p.y, p.size, p.size);
      }
      context.globalAlpha = 1;
      const scrollDelta = scrollY - oldScroll;
      oldScroll = scrollY;
      velocity += (scrollDelta - velocity) * 0.16;
      if (Math.abs(velocity) > 2) {
        context.strokeStyle = `rgba(255,119,75,${Math.min(0.15, Math.abs(velocity) * 0.002)})`;
        for (let i = 0; i < 6; i++) {
          const x = i % 2 ? width - 24 : 24;
          const y = (time * 0.1 + (i * height) / 6) % height;
          context.beginPath();
          context.moveTo(x, y);
          context.lineTo(x, y + Math.min(80, Math.abs(velocity) * 2));
          context.stroke();
        }
      }
    }

    function drawArtifact(time) {
      if (!visible || !artWidth || !artHeight) return;
      art.clearRect(0, 0, artWidth, artHeight);
      const p = motionEnabled
        ? Number(core.style.getPropertyValue("--build-p") || 0)
        : 1;
      if (p < 0.005) return;
      const formation = clamp((p - 0.04) / 0.87);
      const scatter = (1 - formation) * 1.1;
      const yaw = motionEnabled ? time * 0.00016 + scrollY * 0.00013 : 0.4;
      const pitch = 0.43 + Math.sin(yaw * 0.7) * 0.1;
      const roll = -0.3;
      const cy = Math.cos(yaw),
        sy = Math.sin(yaw),
        cx = Math.cos(pitch),
        sx = Math.sin(pitch),
        cz = Math.cos(roll),
        sz = Math.sin(roll);
      const unit = Math.min(artWidth, artHeight) * 0.32;
      function rotate(v) {
        const x = v.x * cy + v.z * sy,
          z = -v.x * sy + v.z * cy;
        const y = v.y * cx - z * sx,
          zz = v.y * sx + z * cx;
        return { x: x * cz - y * sz, y: x * sz + y * cz, z: zz };
      }
      function project(v) {
        const scale = 4 / (4 + v.z);
        return {
          x: artWidth * 0.5 + v.x * unit * scale,
          y: artHeight * 0.48 + v.y * unit * scale,
          z: v.z,
        };
      }
      const halo = art.createRadialGradient(
        artWidth * 0.5,
        artHeight * 0.47,
        10,
        artWidth * 0.5,
        artHeight * 0.47,
        artWidth * 0.48,
      );
      halo.addColorStop(0, `rgba(219,67,29,${formation * 0.12})`);
      halo.addColorStop(1, "rgba(100,15,10,0)");
      art.fillStyle = halo;
      art.fillRect(0, 0, artWidth, artHeight);
      art.save();
      art.translate(artWidth * 0.5, artHeight * 0.48);
      art.rotate(-0.4);
      art.strokeStyle = `rgba(214,161,117,${formation * 0.2})`;
      art.lineWidth = 0.65;
      art.beginPath();
      art.ellipse(0, 0, artWidth * 0.43, artHeight * 0.17, 0, 0, Math.PI * 2);
      art.stroke();
      art.restore();
      const faces = geometry
        .map((face) => {
          const offset = {
            x: Math.sin(face.id * 7.7) * scatter,
            y: Math.cos(face.id * 4.3) * scatter,
            z: Math.sin(face.id * 1.9) * scatter,
          };
          const vertices = face.vertices.map((v) =>
            rotate({ x: v.x + offset.x, y: v.y + offset.y, z: v.z + offset.z }),
          );
          const n = normal(
            cross(
              subtract(vertices[1], vertices[0]),
              subtract(vertices[3], vertices[0]),
            ),
          );
          const lighting = clamp(
            Math.abs(dot(n, normal({ x: -0.5, y: -0.7, z: -1.3 }))) * 0.74 +
              0.26,
          );
          return {
            points: vertices.map(project),
            depth: vertices.reduce((sum, v) => sum + v.z, 0) / 4,
            lighting,
            id: face.id,
          };
        })
        .sort((a, b) => b.depth - a.depth);
      const fill = clamp((formation - 0.1) / 0.7);
      for (const face of faces) {
        const l = face.lighting;
        const shade = l * l;
        const red = Math.round(41 + 213 * shade),
          green = Math.round(17 + 153 * Math.pow(l, 3)),
          blue = Math.round(17 + 100 * Math.pow(l, 4));
        art.beginPath();
        face.points.forEach((point, index) =>
          index ? art.lineTo(point.x, point.y) : art.moveTo(point.x, point.y),
        );
        art.closePath();
        art.fillStyle = `rgba(${red},${green},${blue},${fill * 0.96})`;
        art.fill();
        art.strokeStyle = `rgba(255,193,141,${(0.06 + l * 0.14) * formation})`;
        art.lineWidth = 0.55;
        art.stroke();
      }
      art.strokeStyle = `rgba(239,170,118,${formation * 0.15})`;
      art.lineWidth = 0.6;
      art.beginPath();
      art.moveTo(artWidth * 0.12, artHeight * 0.86);
      art.lineTo(artWidth * 0.88, artHeight * 0.86);
      art.stroke();
      if (formation < 0.95) {
        for (let i = 0; i < 12; i++) {
          const angle = (i / 12) * Math.PI * 2 + time * 0.0004;
          const radius = (1.1 - formation) * artWidth * 0.46;
          art.fillStyle = `rgba(251,188,127,${formation * 0.5})`;
          art.fillRect(
            artWidth * 0.5 + Math.cos(angle) * radius,
            artHeight * 0.48 + Math.sin(angle) * radius * 0.8,
            1.5,
            1.5,
          );
        }
      }
    }

    function render(time) {
      frameId = 0;
      if (document.hidden) return;
      const limit = compactScreen.matches ? 1000 / 30 : 1000 / 60;
      if (time - previous < limit - 1) {
        frameId = requestAnimationFrame(render);
        return;
      }
      const delta = previous ? Math.min(time - previous, 60) : 16;
      previous = time;
      elapsed = time;
      drawWorld(time, delta);
      drawArtifact(time);
      if (motionEnabled) frameId = requestAnimationFrame(render);
    }
    function start() {
      if (!frameId && !document.hidden) {
        previous = 0;
        frameId = requestAnimationFrame(render);
      }
    }
    const observer = new IntersectionObserver(
      (entries) => {
        visible = entries[0].isIntersecting;
        if (visible) start();
      },
      { rootMargin: "150px" },
    );
    observer.observe(artifact);
    new ResizeObserver(resize).observe(artifact);
    window.addEventListener("resize", resize, { passive: true });
    document.addEventListener("visibilitychange", () => {
      if (document.hidden) {
        cancelAnimationFrame(frameId);
        frameId = 0;
      } else start();
    });
    new MutationObserver(() => {
      if (!motionEnabled) {
        cancelAnimationFrame(frameId);
        frameId = 0;
        drawWorld(elapsed, 0);
        drawArtifact(elapsed);
      } else start();
    }).observe(root, { attributes: true, attributeFilter: ["class"] });
    resize();
  }

  createVisualScene();

  // The original playlist and featured video are retained. Loading is intentional,
  // so the embedded player never delays the visual build or plays audio on arrival.
  const playlistId = "PLHwpzHeYmNyQuXnQdnCLgUq8J4LlAY1h4";
  const initialVideoId = "qngCJf9V6g8";
  const playButton = document.getElementById("play-toggle");
  const previousButton = document.getElementById("prev-track");
  const nextButton = document.getElementById("next-track");
  const volume = document.getElementById("volume");
  const trackName = document.getElementById("track-name");
  const playerStatus = document.getElementById("player-status");
  const playerCover = document.getElementById("load-playlist");
  let player = null;
  let isPlaying = false;
  let playerReady = false;
  let apiLoading = false;
  let playRequested = false;
  let apiTimer = 0;

  function setPlaying(playing) {
    isPlaying = playing;
    document.body.classList.toggle("music-playing", playing);
    playButton.replaceChildren(
      document.createTextNode(playing ? "Pause " : "Play "),
    );
    const symbol = document.createElement("span");
    symbol.setAttribute("aria-hidden", "true");
    symbol.textContent = playing ? "Ⅱ" : "▶";
    playButton.append(symbol);
    playButton.setAttribute(
      "aria-label",
      playing ? "Pause music" : "Play music",
    );
  }

  function playerError(
    message = "Unable to load this track. Open the playlist on YouTube.",
  ) {
    clearTimeout(apiTimer);
    setPlaying(false);
    trackName.textContent = message;
    playerStatus.textContent = "UNAVAILABLE";
    playButton.disabled = false;
    playerCover.disabled = false;
    playerCover.classList.remove("is-hidden");
    playerCover.setAttribute(
      "aria-label",
      "Retry loading HopeZaa YouTube playlist",
    );
    const coverText = playerCover.querySelector(".cover-copy > span");
    if (coverText) coverText.textContent = "↻ Retry playlist";
    previousButton.disabled = true;
    nextButton.disabled = true;
    volume.disabled = true;
  }

  function updateTrack() {
    const data = player?.getVideoData?.();
    trackName.textContent = data?.title || "HopeZaa Playlist";
  }

  function createPlayer() {
    if (player || !window.YT?.Player) return;
    player = new window.YT.Player("youtube-player", {
      width: "100%",
      height: "100%",
      videoId: initialVideoId,
      playerVars: {
        autoplay: 0,
        controls: 1,
        rel: 0,
        playsinline: 1,
        listType: "playlist",
        list: playlistId,
      },
      events: {
        onReady(event) {
          clearTimeout(apiTimer);
          player = event.target;
          playerReady = true;
          apiLoading = false;
          player.setVolume(Number(volume.value));
          playButton.disabled = false;
          previousButton.disabled = false;
          nextButton.disabled = false;
          volume.disabled = false;
          playerCover.classList.add("is-hidden");
          playerStatus.textContent = "READY";
          updateTrack();
          if (playRequested) {
            player.playVideo();
            playRequested = false;
          }
        },
        onStateChange(event) {
          const state = window.YT.PlayerState;
          setPlaying(event.data === state.PLAYING);
          if (event.data === state.PLAYING) {
            playerStatus.textContent = "PLAYING";
            updateTrack();
          } else if (event.data === state.BUFFERING)
            playerStatus.textContent = "BUFFERING";
          else if (event.data === state.PAUSED)
            playerStatus.textContent = "PAUSED";
          else if (event.data === state.CUED || event.data === state.ENDED) {
            playerStatus.textContent = "READY";
            updateTrack();
          }
        },
        onError() {
          apiLoading = false;
          playerReady = false;
          playerError();
        },
      },
    });
  }

  function loadPlaylist() {
    playRequested = true;
    if (playerReady) {
      player.playVideo();
      return;
    }
    if (apiLoading) return;
    if (player?.destroy) {
      player.destroy();
      player = null;
    }
    if (!document.getElementById("youtube-player")) {
      const mount = document.createElement("div");
      mount.id = "youtube-player";
      mount.setAttribute("aria-label", "YouTube playlist player");
      document.querySelector(".youtube-player-wrap").prepend(mount);
    }
    apiLoading = true;
    playerStatus.textContent = "LOADING";
    trackName.textContent = "Loading HopeZaa Playlist…";
    playButton.disabled = true;
    playerCover.disabled = true;
    apiTimer = window.setTimeout(() => {
      apiLoading = false;
      playerError(
        "YouTube is taking a while. Retry or open the playlist on YouTube.",
      );
    }, 15000);
    if (window.YT?.Player) {
      createPlayer();
      return;
    }
    window.onYouTubeIframeAPIReady = createPlayer;
    const previousScript = document.getElementById("youtube-api");
    if (previousScript) previousScript.remove();
    const script = document.createElement("script");
    script.id = "youtube-api";
    script.src = "https://www.youtube.com/iframe_api";
    script.onerror = () => {
      apiLoading = false;
      playerError(
        "YouTube could not connect. Retry or open the playlist on YouTube.",
      );
    };
    document.head.append(script);
  }

  playerCover.addEventListener("click", loadPlaylist);
  playButton.addEventListener("click", () => {
    if (!playerReady) loadPlaylist();
    else if (isPlaying) player.pauseVideo();
    else player.playVideo();
  });
  previousButton.addEventListener("click", () => {
    if (playerReady) player.previousVideo();
  });
  nextButton.addEventListener("click", () => {
    if (playerReady) player.nextVideo();
  });
  volume.addEventListener("input", () => {
    if (playerReady) player.setVolume(Number(volume.value));
  });
})();
