(() => {
  "use strict";

  const root = document.documentElement;
  const reducedMotion = matchMedia("(prefers-reduced-motion: reduce)");
  const compactScreen = matchMedia("(max-width: 640px)");
  const clamp = (value) => Math.max(0, Math.min(1, value));
  const mix = (a, b, t) => a + (b - a) * t;
  const ease = (t) => 1 - Math.pow(1 - clamp(t), 3);
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
  const ribbon = document.querySelector(".ribbon-track");
  const builders = [
    { name: "layout", color: "#ffc19b" },
    { name: "type", color: "#d6c6e6" },
    { name: "detail", color: "#ccdda8" },
  ];
  let preference;
  try {
    preference = localStorage.getItem("hopezaa-motion");
  } catch (_) {
    /* Optional. */
  }
  let motionEnabled = !reducedMotion.matches && preference !== "off";
  let frame = 0,
    dirty = true,
    reflowNeeded = false,
    previousTime = 0;
  let bootStarted = performance.now();
  let lastScrollPosition = scrollY,
    lastScrollSample = bootStarted,
    scrollSpeed = 0;
  let currentSection = sections[0],
    navigationReady = false,
    pageProgress = 0;
  let emitParticles = () => {};

  const title = document.querySelector(".hero-title");
  title.setAttribute("aria-label", "PORTFOLIO");
  for (const node of [...title.childNodes])
    if (node.nodeType === Node.TEXT_NODE) node.remove();
  const glyphs = document.createDocumentFragment();
  for (const character of "PORTFOLIO") {
    const glyph = document.createElement("span");
    glyph.className = "hero-glyph";
    glyph.dataset.char = character;
    glyph.dataset.typed = "";
    glyph.textContent = character;
    glyph.setAttribute("aria-hidden", "true");
    glyphs.append(glyph);
  }
  title.prepend(glyphs);
  document.querySelectorAll(".skill-card").forEach((card, index) => {
    const watermark = document.createElement("span");
    watermark.className = "skill-watermark";
    watermark.setAttribute("aria-hidden", "true");
    watermark.textContent = String(index + 1).padStart(2, "0");
    card.append(watermark);
  });

  function hiddenDecoration(element) {
    return Boolean(
      element.closest('[aria-hidden="true"], .build-frame, .builder-rig'),
    );
  }

  function createTextTask(element) {
    const records = [];
    const walker = document.createTreeWalker(element, NodeFilter.SHOW_TEXT);
    while (walker.nextNode()) {
      const node = walker.currentNode;
      if (
        !node.data.trim() ||
        hiddenDecoration(node.parentElement) ||
        node.parentElement.closest("#track-name, #player-status")
      )
        continue;
      const raw = node.data;
      const text = element.tagName === "PRE" ? raw : raw.replace(/\s+/g, " ");
      records.push({ node, raw, text });
    }
    if (!records.length) return null;
    const task = {
      element,
      records,
      length: records.reduce((n, r) => n + r.text.length, 0),
      count: -1,
      height: 0,
      minHeight: element.style.minHeight,
      activeNode: null,
    };
    element.classList.add("builder-text-host");
    return task;
  }

  function collectTextTasks(element) {
    if (element === title)
      return [
        {
          element,
          glyphs: [...element.querySelectorAll(".hero-glyph")],
          length: 9,
          count: -1,
          height: 0,
          activeNode: null,
        },
      ];
    const grouped = [
      ...element.querySelectorAll(
        ".profile-details > div, .hero-bottom > div, .identity-bottom",
      ),
    ];
    const blocks = [
      ...element.querySelectorAll("h2,h3,p,blockquote,dt,dd,pre,strong,small"),
    ];
    const leaves = [...element.querySelectorAll("a,.mono")];
    if (
      element.matches(".mono") &&
      !element.querySelector("h2,h3,p,pre,blockquote")
    )
      leaves.unshift(element);
    const candidates = [...new Set([...grouped, ...blocks, ...leaves])].filter(
      (host) => !hiddenDecoration(host),
    );
    const selected = candidates.filter((host) => {
      if (grouped.includes(host)) return true;
      if (grouped.some((group) => group.contains(host))) return false;
      // Select a paragraph/heading once, preserving all of its inline emphasis.
      if (blocks.includes(host))
        return !blocks.some((other) => other !== host && other.contains(host));
      if (
        blocks.some((block) => block.contains(host)) ||
        candidates.some((other) => other !== host && host.contains(other))
      )
        return false;
      return true;
    });
    selected.sort((a, b) =>
      a === b
        ? 0
        : a.compareDocumentPosition(b) & Node.DOCUMENT_POSITION_FOLLOWING
          ? -1
          : 1,
    );
    return selected.map(createTextTask).filter(Boolean);
  }

  const states = parts.map((element, index) => {
    element.style.setProperty(
      "--agent-color",
      builders[index % builders.length].color,
    );
    return {
      element,
      index,
      tasks: collectTextTasks(element),
      rect: null,
      status: "empty",
      progress: 0,
      eligible: false,
      inWindow: false,
      cycle: 0,
      worker: null,
      bucket: 0,
    };
  });

  function paintText(task, count) {
    const next = Math.max(0, Math.min(task.length, Math.floor(count)));
    if (task.count === next) return;
    task.count = next;
    if (task.glyphs) {
      task.glyphs.forEach((glyph, index) => {
        glyph.dataset.typed = index < next ? glyph.dataset.char : "";
      });
      return;
    }
    let remaining = next;
    task.activeNode = null;
    for (const record of task.records) {
      const take = Math.min(remaining, record.text.length);
      const value =
        next === task.length ? record.raw : record.text.slice(0, take);
      if (record.node.data !== value) record.node.data = value;
      if (take > 0) task.activeNode = record.node;
      remaining -= take;
    }
    task.element.classList.toggle("is-typing", next > 0 && next < task.length);
  }

  function reserveText(task) {
    if (!task.glyphs && task.height > 0)
      task.element.style.minHeight = `${task.height}px`;
  }

  function releaseText(task) {
    if (!task.glyphs) {
      task.element.style.minHeight = task.minHeight;
      task.element.classList.remove("is-typing");
    }
  }

  function measureTextLayout() {
    // Restore and measure every full string before clearing it. This reserves the
    // final line wrapping, so actual typing cannot pull the rest of the page up.
    for (const state of states)
      for (const task of state.tasks) {
        paintText(task, task.length);
        releaseText(task);
      }
    for (const state of states)
      for (const task of state.tasks) {
        const height = parseFloat(getComputedStyle(task.element).height);
        task.height = Number.isFinite(height)
          ? height
          : task.element.getBoundingClientRect().height;
      }
    for (const state of states) {
      if (state.status === "built") continue;
      for (const task of state.tasks) {
        reserveText(task);
        paintText(task, 0);
      }
      if (state.worker) paintTyping(state.worker, state.progress);
    }
    reflowNeeded = false;
  }

  function paintPart(state, p) {
    state.progress = p;
    const placed = clamp((p - 0.31) / 0.11);
    const move = 1 - ease((p - 0.31) / 0.15);
    const style = state.element.style;
    style.setProperty("--build-p", p.toFixed(4));
    style.setProperty("--part-opacity", placed.toFixed(4));
    style.setProperty("--place-x", `${(-12 * move).toFixed(2)}px`);
    style.setProperty("--place-y", `${(14 * move).toFixed(2)}px`);
    style.setProperty(
      "--path-offset",
      String((1 - clamp((p - 0.36) / 0.55)) * 450),
    );
    // The phase is observable in QA and describes an action, not a scroll mask.
    state.element.dataset.buildState = state.status;
    state.element.dataset.buildPhase =
      p < 0.12
        ? "approach"
        : p < 0.31
          ? "draw"
          : p < 0.46
            ? "place"
            : p < 0.94
              ? "type"
              : "settle";
    const bucket = Math.floor(p * 5);
    if (bucket !== state.bucket && p > 0.2 && p < 0.98 && state.rect)
      emitParticles(
        state.rect,
        p,
        style.getPropertyValue("--agent-color"),
        false,
      );
    state.bucket = bucket;
  }

  const workers = builders.map((builder, index) => {
    const rig = document.createElement("div");
    rig.className = "builder-rig";
    rig.style.setProperty("--worker-color", builder.color);
    const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
    svg.classList.add("builder-guides");
    const path = document.createElementNS("http://www.w3.org/2000/svg", "path");
    svg.append(path);
    function box(className) {
      const node = document.createElement("div");
      node.className = className;
      const label = document.createElement("span");
      label.className = "builder-box-label";
      node.append(label);
      for (let i = 0; i < 4; i++) {
        const handle = document.createElement("i");
        handle.className = `builder-handle handle-${i}`;
        node.append(handle);
      }
      rig.append(node);
      return { node, label };
    }
    rig.append(svg);
    const frameBox = box("builder-frame-box"),
      textBox = box("builder-text-box");
    const caret = document.createElement("span");
    caret.className = "builder-caret";
    rig.append(caret);
    const cursor = document.createElement("div");
    cursor.className = "agent-cursor builder-cursor";
    cursor.style.setProperty("--cursor-color", builder.color);
    cursor.innerHTML =
      '<svg class="builder-arrow" viewBox="0 0 18 23" aria-hidden="true"><path d="M1 1 16 11 9 12 12 19 8 21 5 14 1 18Z"/></svg><svg class="builder-ibeam" viewBox="0 0 18 23" aria-hidden="true"><path d="M5 3h8M9 3v17M5 20h8"/></svg><span class="builder-click"></span>';
    const name = document.createElement("span");
    name.className = "agent-name";
    cursor.append(name);
    rig.append(cursor);
    agentLayer.append(rig);
    return {
      index,
      rig,
      path,
      frameBox,
      textBox,
      caret,
      cursor,
      name,
      state: null,
      elapsed: 0,
      duration: 0,
      textTasks: [],
      x: 0,
      y: 0,
      started: false,
    };
  });

  function stopWorker(worker) {
    if (worker.state) worker.state.worker = null;
    worker.state = null;
    worker.started = false;
    worker.rig.classList.remove("is-active");
    worker.cursor.classList.remove("is-visible", "is-typing", "is-pressed");
  }

  function emptyState(state) {
    if (state.worker) stopWorker(state.worker);
    state.status = "empty";
    for (const task of state.tasks) {
      reserveText(task);
      paintText(task, 0);
    }
    paintPart(state, 0);
  }

  function finishState(state) {
    if (state.worker)
      state.element.dataset.buildFinished = performance.now().toFixed(1);
    if (state.worker) stopWorker(state.worker);
    state.status = "built";
    for (const task of state.tasks) {
      paintText(task, task.length);
      releaseText(task);
    }
    paintPart(state, 1);
  }

  function beginJob(worker, state) {
    state.status = "building";
    state.cycle += 1;
    state.worker = worker;
    state.element.dataset.buildCycle = String(state.cycle);
    state.element.dataset.buildStarted = performance.now().toFixed(1);
    worker.state = state;
    worker.elapsed = 0;
    worker.started = false;
    const letters = state.tasks.reduce((n, task) => n + task.length, 0);
    worker.duration = Math.min(
      1480,
      Math.max(820, 650 + letters * 1.05 + state.tasks.length * 52),
    );
    const budget = worker.duration * 0.48;
    const weight =
      state.tasks.reduce((n, task) => n + Math.sqrt(task.length), 0) || 1;
    const minimum = Math.min(
      65,
      (budget / Math.max(1, state.tasks.length)) * 0.6,
    );
    const remaining = Math.max(0, budget - minimum * state.tasks.length);
    let offset = 0;
    worker.textTasks = state.tasks.map((task) => {
      const duration = minimum + (remaining * Math.sqrt(task.length)) / weight;
      const entry = { task, start: offset, duration };
      offset += duration;
      return entry;
    });
    worker.rig.classList.add("is-active");
    worker.cursor.classList.add("is-visible");
    worker.frameBox.label.textContent = `${state.element.dataset.build} / draw frame`;
    for (const task of state.tasks) {
      reserveText(task);
      paintText(task, 0);
    }
    paintPart(state, 0);
  }

  function schedule(time) {
    if (!motionEnabled || time - bootStarted < 140) return;
    const count = compactScreen.matches ? 2 : 3;
    const queue = states.filter(
      (state) => state.eligible && state.status === "empty",
    );
    queue.sort((a, b) => {
      const aPriority = Math.abs(
        a.rect.top +
          Math.min(a.rect.height, innerHeight) * 0.3 -
          innerHeight * 0.42,
      );
      const bPriority = Math.abs(
        b.rect.top +
          Math.min(b.rect.height, innerHeight) * 0.3 -
          innerHeight * 0.42,
      );
      // The headline and initial text establish the first scene before details.
      if (scrollY < 100 && time - bootStarted < 1900) return a.index - b.index;
      return aPriority - bPriority;
    });
    for (const worker of workers) {
      if (worker.index >= count) {
        if (worker.state) emptyState(worker.state);
        continue;
      }
      if (!worker.state && queue.length) beginJob(worker, queue.shift());
    }
  }

  function paintTyping(worker, p) {
    const elapsed = clamp((p - 0.46) / 0.48) * worker.duration * 0.48;
    let active = null;
    for (const entry of worker.textTasks) {
      const local = clamp((elapsed - entry.start) / entry.duration);
      const drag = Math.min(0.32, 48 / entry.duration);
      const typed = clamp((local - drag) / (1 - drag));
      paintText(entry.task, Math.floor(typed * entry.task.length));
      if (local > 0 && local < 1) active = { ...entry, local, drag, typed };
    }
    return active;
  }

  function caretPoint(task) {
    const box = task.element.getBoundingClientRect();
    if (task.glyphs) {
      const glyph =
        task.glyphs[
          Math.max(0, Math.min(task.glyphs.length - 1, task.count - 1))
        ];
      const rect = glyph.getBoundingClientRect();
      return {
        x: task.count ? rect.right : box.left,
        y: rect.top + rect.height * 0.12,
        height: Math.min(100, rect.height * 0.7),
      };
    }
    const font = parseFloat(getComputedStyle(task.element).fontSize) || 13;
    if (task.activeNode && task.activeNode.length) {
      const range = document.createRange();
      range.setStart(task.activeNode, task.activeNode.length - 1);
      range.setEnd(task.activeNode, task.activeNode.length);
      const rects = range.getClientRects();
      const rect = rects[rects.length - 1];
      if (rect && rect.width + rect.height > 0)
        return {
          x: rect.right + 1,
          y: rect.top,
          height: Math.min(80, rect.height || font),
        };
    }
    return {
      x: box.left + 2,
      y: box.top + 3,
      height: Math.min(80, font * 1.1),
    };
  }

  function setBox(box, x, y, width, height, opacity = 1) {
    box.node.style.transform = `translate3d(${x.toFixed(1)}px,${y.toFixed(1)}px,0)`;
    box.node.style.width = `${Math.max(1, width).toFixed(1)}px`;
    box.node.style.height = `${Math.max(1, height).toFixed(1)}px`;
    box.node.style.opacity = String(opacity);
  }

  function drawWorker(worker, delta) {
    const state = worker.state;
    if (!state) return;
    const p = state.progress,
      rect = state.rect;
    let x = rect.left,
      y = rect.top,
      label = "Move to frame",
      pressed = false,
      typing = false;
    worker.caret.style.opacity = "0";
    worker.textBox.node.style.opacity = "0";
    worker.path.style.opacity = p < 0.4 ? "1" : "0";
    worker.path.setAttribute(
      "d",
      `M 0 ${rect.top.toFixed(1)} H ${innerWidth} M ${rect.left.toFixed(1)} 78 V ${innerHeight}`,
    );
    if (p < 0.12) {
      const t = ease(p / 0.12);
      x = mix(rect.left - 34, rect.left, t);
      y = mix(rect.top - 22, rect.top, t);
      setBox(worker.frameBox, rect.left, rect.top, 1, 1, t);
    } else if (p < 0.31) {
      const t = ease((p - 0.12) / 0.19);
      x = rect.left + rect.width * t;
      y = rect.top + rect.height * t;
      pressed = true;
      label = "Drag frame";
      setBox(
        worker.frameBox,
        rect.left,
        rect.top,
        rect.width * t,
        rect.height * t,
        0.9,
      );
    } else if (p < 0.46) {
      const t = ease((p - 0.31) / 0.15);
      x = rect.left + rect.width * 0.62 - 12 * (1 - t);
      y = rect.top + 9 + 14 * (1 - t);
      pressed = true;
      label = "Place layout";
      worker.frameBox.label.textContent = `${state.element.dataset.build} / place layout`;
      setBox(
        worker.frameBox,
        rect.left - 12 * (1 - t),
        rect.top + 14 * (1 - t),
        rect.width,
        rect.height,
        0.75,
      );
    } else if (p < 0.94) {
      setBox(
        worker.frameBox,
        rect.left,
        rect.top,
        rect.width,
        rect.height,
        0.25,
      );
      const active = paintTyping(worker, p);
      if (active) {
        const host = active.task.element.getBoundingClientRect();
        if (active.local < active.drag) {
          const t = ease(active.local / active.drag);
          x = host.left + host.width * t;
          y = host.top + host.height * t;
          pressed = true;
          label = "Drag text box";
          setBox(
            worker.textBox,
            host.left - 2,
            host.top - 2,
            host.width * t + 4,
            host.height * t + 4,
            0.9,
          );
          worker.textBox.label.textContent = "TEXT / drag to size";
        } else {
          const caret = caretPoint(active.task);
          x = caret.x;
          y = caret.y + caret.height * 0.5;
          typing = true;
          label = "Typing…";
          setBox(
            worker.textBox,
            host.left - 3,
            host.top - 3,
            host.width + 6,
            host.height + 6,
            0.55,
          );
          worker.textBox.label.textContent = `TEXT / ${active.task.count} characters`;
          worker.caret.style.transform = `translate3d(${caret.x.toFixed(1)}px,${caret.y.toFixed(1)}px,0)`;
          worker.caret.style.height = `${caret.height.toFixed(1)}px`;
          worker.caret.style.opacity = "1";
        }
      }
      worker.frameBox.label.textContent = `${state.element.dataset.build} / compose text`;
    } else {
      state.tasks.forEach((task) => paintText(task, task.length));
      const t = clamp((p - 0.94) / 0.06);
      x = rect.right - 8;
      y = rect.bottom - 8;
      label = "Done ✓";
      setBox(
        worker.frameBox,
        rect.left,
        rect.top,
        rect.width,
        rect.height,
        (1 - t) * 0.45,
      );
    }
    x = Math.max(8, Math.min(innerWidth - 35, x));
    y = Math.max(83, Math.min(innerHeight - 80, y));
    const follow = worker.started ? 1 - Math.exp(-delta / 32) : 1;
    worker.x = mix(worker.x, x, follow);
    worker.y = mix(worker.y, y, follow);
    worker.started = true;
    worker.cursor.style.transform = `translate3d(${worker.x.toFixed(1)}px,${worker.y.toFixed(1)}px,0)`;
    worker.name.textContent = label;
    worker.cursor.classList.toggle("is-typing", typing);
    worker.cursor.classList.toggle("is-pressed", pressed);
  }

  function updateControls() {
    motionButton.setAttribute("aria-pressed", String(motionEnabled));
    motionLabel.textContent = motionEnabled ? "on" : "off";
    replayButton.disabled = !motionEnabled;
    if (!motionEnabled) {
      buildStatus.textContent = "MOTION PAUSED";
      buildDetail.textContent = "All content visible · take your time";
      return;
    }
    const active = workers.filter((worker) => worker.state);
    buildStatus.textContent = active.length
      ? `COMPOSING ${currentSection.dataset.section.toUpperCase()}`
      : "READY · SCROLL TO REBUILD";
    buildDetail.textContent = active.length
      ? "Draw frame → drag layout → type text"
      : "Built in place · rebuilds in both directions";
  }

  function measure() {
    dirty = false;
    if (reflowNeeded) measureTextLayout();
    const height = innerHeight;
    const maxScroll = document.documentElement.scrollHeight - height;
    pageProgress = maxScroll > 0 ? clamp(scrollY / maxScroll) : 0;
    // Read layout first; clearing happens only after the element has left view.
    const measurements = states.map((state) => ({
      state,
      rect: state.element.getBoundingClientRect(),
    }));
    for (const { state, rect } of measurements) {
      state.rect = rect;
      state.inWindow = rect.bottom > -65 && rect.top < height + 65;
      state.eligible = rect.bottom > 100 && rect.top < height - 48;
    }
    for (const state of states) {
      if (
        motionEnabled &&
        !state.inWindow &&
        state.status !== "empty" &&
        !state.element.contains(document.activeElement)
      )
        emptyState(state);
    }
    let next = sections[0];
    for (const section of sections)
      if (section.getBoundingClientRect().top < height * 0.52) next = section;
    if (next !== currentSection || !navigationReady) {
      currentSection = next;
      navigationReady = true;
      for (const link of document.querySelectorAll(
        '.site-nav a[href^="#"], .chapter-rail a[href^="#"]',
      )) {
        const selected = link.getAttribute("href") === `#${next.id}`;
        link.classList.toggle("is-active", selected);
        if (selected) link.setAttribute("aria-current", "location");
        else link.removeAttribute("aria-current");
      }
    }
    progressLine.style.transform = `scaleX(${pageProgress})`;
    buildProgress.style.transform = `scaleX(${pageProgress})`;
    if (ribbon)
      ribbon.style.transform = `translate3d(${-(scrollY * 0.1)}px,0,0)`;
  }

  function render(time) {
    frame = 0;
    if (document.hidden) return;
    const delta = previousTime ? Math.min(50, time - previousTime) : 16;
    previousTime = time;
    if (dirty) measure();
    const boot = clamp((time - bootStarted) / 1500);
    root.style.setProperty("--boot-p", String(motionEnabled ? boot : 1));
    root.classList.toggle(
      "experience-started",
      !motionEnabled || time - bootStarted > 300,
    );
    schedule(time);
    const rate = 1 + Math.min(0.7, scrollSpeed / 2400);
    let active = false;
    for (const worker of workers) {
      if (!worker.state) continue;
      active = true;
      worker.elapsed += delta * rate;
      const state = worker.state,
        p = clamp(worker.elapsed / worker.duration);
      paintPart(state, p);
      drawWorker(worker, delta);
      if (p >= 1) finishState(state);
    }
    scrollSpeed *= 0.9;
    updateControls();
    const waiting =
      motionEnabled &&
      states.some((state) => state.eligible && state.status === "empty");
    if (active || waiting || (motionEnabled && boot < 1))
      frame = requestAnimationFrame(render);
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
        /* Optional. */
      }
    }
    workers.forEach(stopWorker);
    if (motionEnabled) {
      bootStarted = performance.now();
      states.forEach(emptyState);
    } else states.forEach(finishState);
    requestUpdate();
    updateControls();
  }

  window.addEventListener(
    "scroll",
    () => {
      const now = performance.now();
      scrollSpeed = Math.min(
        4000,
        (Math.abs(scrollY - lastScrollPosition) /
          Math.max(16, now - lastScrollSample)) *
          1000,
      );
      lastScrollPosition = scrollY;
      lastScrollSample = now;
      requestUpdate();
    },
    { passive: true },
  );
  window.addEventListener(
    "resize",
    () => {
      reflowNeeded = true;
      requestUpdate();
    },
    { passive: true },
  );
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
    states.filter((state) => state.inWindow).forEach(emptyState);
    bootStarted = performance.now() - 150;
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
    const hash = anchor.getAttribute("href"),
      target = document.getElementById(hash.slice(1));
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
  compactScreen.addEventListener("change", () => {
    closeMenu();
    reflowNeeded = true;
    requestUpdate();
  });
  document.addEventListener("focusin", (event) => {
    const element = event.target.closest("[data-build]"),
      state = states.find((item) => item.element === element);
    if (state && state.status !== "built") finishState(state);
  });

  measureTextLayout();
  setMotion(motionEnabled);
  root.dataset.builderReady = "true";
  root.classList.remove("builder-pending");

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
      const intro = Math.max(
        scrollY / height,
        Number(root.style.getPropertyValue("--boot-p")) * 0.72,
      );
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
