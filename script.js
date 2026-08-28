const clamp = (value, min = 0, max = 1) => Math.min(Math.max(value, min), max);

const body = document.body;
const loader = document.getElementById("loader");
const scrollMeter = document.querySelector(".scroll-meter span");
const horizontalStages = [...document.querySelectorAll("[data-horizontal]")];
const revealItems = [...document.querySelectorAll(".reveal")];
const mottoStage = document.querySelector("[data-motto]");

let latestScroll = window.scrollY;
let ticking = false;

window.addEventListener("load", () => {
  setTimeout(() => {
    body.classList.add("is-loaded");
    loader.setAttribute("aria-hidden", "true");
  }, 950);
});

const revealObserver = new IntersectionObserver(
  (entries) => {
    entries.forEach((entry) => {
      entry.target.classList.toggle("is-visible", entry.isIntersecting);
    });
  },
  { threshold: 0.22, rootMargin: "0px 0px -8% 0px" },
);

revealItems.forEach((item) => revealObserver.observe(item));

function setPageProgress() {
  const maxScroll = document.documentElement.scrollHeight - window.innerHeight;
  const progress = maxScroll > 0 ? latestScroll / maxScroll : 0;
  body.style.setProperty("--page-progress", progress.toFixed(4));
  body.style.setProperty("--bg-shift", `${progress * -60}px`);
  body.style.setProperty("--hero-shift", `${progress * -90}px`);
  body.style.setProperty("--console-shift", `${progress * 75}px`);
  body.style.setProperty("--orbit-y", `${progress * -160}px`);
  if (scrollMeter) {
    scrollMeter.style.width = `${progress * 100}%`;
  }
}

function updateHorizontalStage(stage) {
  const track = stage.querySelector("[data-track]");
  const cards = [...stage.querySelectorAll(".h-card")];
  const progressEl = stage.querySelector(".stage-progress span");
  if (!track || cards.length === 0) return;

  const rect = stage.getBoundingClientRect();
  const stageTop = latestScroll + rect.top;
  const range = Math.max(stage.offsetHeight - window.innerHeight, 1);
  const progress = clamp((latestScroll - stageTop) / range);
  const firstCard = cards[0];
  const step = cards.length > 1 ? cards[1].offsetLeft - cards[0].offsetLeft : 0;
  const maxMove = step * (cards.length - 1);
  const baseX = (window.innerWidth - firstCard.offsetWidth) / 2;
  const x = baseX - maxMove * progress;
  const exactIndex = progress * (cards.length - 1);

  stage.style.setProperty("--stage-progress", progress.toFixed(4));
  stage.style.setProperty("--stage-shift", `${progress * -90}px`);
  track.style.transform = `translate3d(${x}px, 0, 0)`;

  cards.forEach((card, index) => {
    const distance = clamp(Math.abs(index - exactIndex), 0, 1);
    card.style.setProperty("--card-y", `${distance * 24}px`);
    card.style.setProperty("--card-scale", (1 - distance * 0.055).toFixed(4));
    card.style.setProperty("--card-opacity", (1 - distance * 0.25).toFixed(4));
  });

  if (progressEl) {
    progressEl.style.width = `${progress * 100}%`;
  }
}

function updateMotto() {
  if (!mottoStage) return;
  const rect = mottoStage.getBoundingClientRect();
  const stageTop = latestScroll + rect.top;
  const range = Math.max(mottoStage.offsetHeight - window.innerHeight, 1);
  const progress = clamp((latestScroll - stageTop) / range);
  const glow = Math.sin(progress * Math.PI);
  mottoStage.style.setProperty("--motto-glow", glow.toFixed(4));
  mottoStage.style.setProperty("--motto-field-opacity", (0.2 + glow * 0.72).toFixed(4));
  mottoStage.style.setProperty("--motto-blur", `${12 + glow * 22}px`);
  mottoStage.style.setProperty("--motto-field-scale", (0.88 + glow * 0.18).toFixed(4));
  mottoStage.style.setProperty("--motto-rotate-a", `${glow * 44}deg`);
  mottoStage.style.setProperty("--motto-rotate-b", `${glow * -58}deg`);
  mottoStage.style.setProperty("--motto-quote-opacity", (0.34 + glow * 0.66).toFixed(4));
  mottoStage.style.setProperty("--motto-shadow-a", `${glow * 22}px`);
  mottoStage.style.setProperty("--motto-shadow-b", `${glow * 68}px`);
  mottoStage.style.setProperty("--motto-y", `${(1 - glow) * 42}px`);
  mottoStage.style.setProperty("--motto-quote-scale", (0.94 + glow * 0.06).toFixed(4));
}

function update() {
  latestScroll = window.scrollY;
  setPageProgress();
  horizontalStages.forEach(updateHorizontalStage);
  updateMotto();
  ticking = false;
}

function requestUpdate() {
  if (!ticking) {
    window.requestAnimationFrame(update);
    ticking = true;
  }
}

window.addEventListener("scroll", requestUpdate, { passive: true });
window.addEventListener("resize", requestUpdate);
update();

const brandDock = document.querySelector(".brand-dock");
const brandHint = document.getElementById("brand-hint");
const HINT_SEEN_KEY = "hopezaa-topic-hint-seen";

if (brandDock && brandHint) {
  let hintTimeout;

  const dismissHint = () => {
    body.classList.remove("hint-visible");
    window.clearTimeout(hintTimeout);
  };

  if (!window.localStorage.getItem(HINT_SEEN_KEY)) {
    window.addEventListener("load", () => {
      window.setTimeout(() => {
        body.classList.add("hint-visible");
        window.localStorage.setItem(HINT_SEEN_KEY, "1");
        hintTimeout = window.setTimeout(dismissHint, 4200);
      }, 1400);
    });
  }

  brandDock.addEventListener("mouseenter", dismissHint);
  brandDock.addEventListener("focusin", dismissHint);
  brandDock.addEventListener("touchstart", dismissHint, { passive: true });
}

const canvas = document.getElementById("ambient-canvas");
const ctx = canvas.getContext("2d");
let points = [];
let pointer = { x: 0.5, y: 0.5 };

function resizeCanvas() {
  const pixelRatio = Math.min(window.devicePixelRatio || 1, 2);
  canvas.width = Math.floor(window.innerWidth * pixelRatio);
  canvas.height = Math.floor(window.innerHeight * pixelRatio);
  canvas.style.width = `${window.innerWidth}px`;
  canvas.style.height = `${window.innerHeight}px`;
  ctx.setTransform(pixelRatio, 0, 0, pixelRatio, 0, 0);

  const count = Math.max(42, Math.floor((window.innerWidth * window.innerHeight) / 26000));
  points = Array.from({ length: count }, (_, index) => ({
    x: Math.random() * window.innerWidth,
    y: Math.random() * window.innerHeight,
    vx: (Math.random() - 0.5) * 0.18,
    vy: (Math.random() - 0.5) * 0.18,
    pulse: index * 0.37,
  }));
}

function drawCanvas(time = 0) {
  const width = window.innerWidth;
  const height = window.innerHeight;
  ctx.clearRect(0, 0, width, height);
  ctx.lineWidth = 1;

  points.forEach((point) => {
    point.x += point.vx + (pointer.x - 0.5) * 0.08;
    point.y += point.vy + (pointer.y - 0.5) * 0.08;

    if (point.x < -30) point.x = width + 30;
    if (point.x > width + 30) point.x = -30;
    if (point.y < -30) point.y = height + 30;
    if (point.y > height + 30) point.y = -30;
  });

  for (let i = 0; i < points.length; i += 1) {
    for (let j = i + 1; j < points.length; j += 1) {
      const a = points[i];
      const b = points[j];
      const dx = a.x - b.x;
      const dy = a.y - b.y;
      const distance = Math.hypot(dx, dy);

      if (distance < 155) {
        const alpha = (1 - distance / 155) * 0.17;
        ctx.strokeStyle = `rgba(54, 182, 255, ${alpha})`;
        ctx.beginPath();
        ctx.moveTo(a.x, a.y);
        ctx.lineTo(b.x, b.y);
        ctx.stroke();
      }
    }
  }

  points.forEach((point) => {
    const flicker = 0.38 + Math.sin(time * 0.0015 + point.pulse) * 0.25;
    ctx.fillStyle = `rgba(230, 247, 255, ${0.3 + flicker * 0.28})`;
    ctx.fillRect(point.x - 1, point.y - 1, 2, 2);
  });

  requestAnimationFrame(drawCanvas);
}

window.addEventListener("resize", resizeCanvas);
window.addEventListener("pointermove", (event) => {
  pointer = {
    x: event.clientX / window.innerWidth,
    y: event.clientY / window.innerHeight,
  };
});

resizeCanvas();
drawCanvas();

const playlistId = "PLHwpzHeYmNyQuXnQdnCLgUq8J4LlAY1h4";
const playButton = document.getElementById("play-toggle");
const prevButton = document.getElementById("prev-track");
const nextButton = document.getElementById("next-track");
const volumeInput = document.getElementById("volume");
const trackName = document.getElementById("track-name");

let youtubePlayer;
let pendingAutoplay = false;
let isPlaying = false;

function setPlayerReadyState(isReady) {
  playButton.disabled = !isReady;
  prevButton.disabled = !isReady;
  nextButton.disabled = !isReady;
  volumeInput.disabled = !isReady;
}

function setPlayingState(nextIsPlaying) {
  isPlaying = nextIsPlaying;
  body.classList.toggle("music-playing", isPlaying);
  playButton.textContent = isPlaying ? "Pause" : "Play";
  playButton.setAttribute("aria-label", isPlaying ? "Pause music" : "Play music");
}

function updateTrackName() {
  if (!youtubePlayer?.getVideoData) return;

  const data = youtubePlayer.getVideoData();

  if (!data || !data.title) {
    trackName.textContent = "HopeZaa Playlist";
    return;
  }

  trackName.textContent = data.title;
}

function onYouTubePlayerReady(event) {
  youtubePlayer = event.target;

  youtubePlayer.setVolume(Number(volumeInput.value));

  setPlayerReadyState(true);

  setTimeout(() => {
    updateTrackName();
  }, 500);

  if (pendingAutoplay) {
    pendingAutoplay = false;

    youtubePlayer.playVideo();
  }
}

function onYouTubePlayerStateChange(event) {
  const states = window.YT.PlayerState;
  setPlayingState(event.data === states.PLAYING);

  if (event.data === states.PLAYING || event.data === states.CUED) {
    updateTrackName();
  }
}

function onYouTubePlayerError(event) {
    console.log("YT Error:", event.data);

    trackName.textContent = "Unable to load this track";

    setPlayingState(false);
}

window.onYouTubeIframeAPIReady = () => {
  youtubePlayer = new YT.Player("youtube-player", {
    width: "100%",
    height: "100%",

    playerVars: {
      autoplay: 0,
      controls: 1,
      rel: 0,
      modestbranding: 1,

      listType: "playlist",
      list: playlistId,

      startSeconds: 0,
    },

    events: {
      onReady: (event) => {
        onYouTubePlayerReady(event);

        youtubePlayer.cueVideoById({
          videoId: "qngCJf9V6g8",
          startSeconds: 0,
        });
      },
      onStateChange: onYouTubePlayerStateChange,
      onError: onYouTubePlayerError,
    },
  });
};

function loadYouTubeApi() {
  setPlayerReadyState(false);
  const tag = document.createElement("script");
  tag.src = "https://www.youtube.com/iframe_api";
  document.head.appendChild(tag);
}

function pauseMusic() {
  youtubePlayer?.pauseVideo();
}

function playMusic() {
  if (!youtubePlayer?.playVideo) {
    pendingAutoplay = true;
    return;
  }

  youtubePlayer.playVideo();
}

function switchTrack(direction) {
  if (!youtubePlayer) return;
  if (direction < 0) {
    youtubePlayer.previousVideo();
  } else {
    youtubePlayer.nextVideo();
  }
  window.setTimeout(updateTrackName, 350);
}

playButton.addEventListener("click", () => (isPlaying ? pauseMusic() : playMusic()));
prevButton.addEventListener("click", () => switchTrack(-1));
nextButton.addEventListener("click", () => switchTrack(1));

volumeInput.addEventListener("input", () => {
  youtubePlayer?.setVolume(Number(volumeInput.value));
});

loadYouTubeApi();