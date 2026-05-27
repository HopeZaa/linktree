const canvas = document.getElementById('matrix');
const ctx = canvas.getContext('2d');
const chars = 'アイウエオカキクケコサシスセソタチツテトナニヌネノ0123456789ABCDEF<>/{}[]';
let drops = [];

function resize() {
  canvas.width = window.innerWidth;
  canvas.height = window.innerHeight;
  const cols = Math.floor(canvas.width / 16);
  drops = Array.from({ length: cols }, () => Math.random() * -canvas.height / 16);
}

function draw() {
  ctx.fillStyle = 'rgba(2, 12, 2, 0.05)';
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.font = '14px Share Tech Mono, monospace';
  drops.forEach((y, i) => {
    const char = chars[Math.floor(Math.random() * chars.length)];
    const bright = Math.random() > 0.95;
    ctx.fillStyle = bright ? '#ffd700' : (Math.random() > 0.7 ? '#00ff41' : '#00c832');
    ctx.fillText(char, i * 16, y * 16);
    if (y * 16 > canvas.height && Math.random() > 0.975) drops[i] = 0;
    drops[i] += 0.5;
  });
}

resize();
window.addEventListener('resize', resize);
setInterval(draw, 50);
