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
    { name: "structure", color: "#91baff" },
    { name: "type", color: "#c6a3ec" },
    { name: "detail", color: "#ace4bb" },
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
  let focusedPart = null;
  let moving = false;

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
    return { element, label, progress: 0, goal: 0, rect: null, leaving: false };
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
      const leave = clamp((rect.bottom - 25) / (height * 0.16));
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
    if (nextSection !== currentSection) {
      currentSection = nextSection;
      for (const link of navigation.querySelectorAll('a[href^="#"]')) {
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
    updateControls();
  }

  function paintPart(state) {
    const p = state.progress;
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
  document.addEventListener("click", (event) => {
    if (
      !event.target.closest(".site-header") ||
      event.target.closest('a[href^="#"]')
    )
      closeMenu();
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
