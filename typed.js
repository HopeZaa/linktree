const lines = [
  'whoami',
  'Sirawich Roopngam — Developer',
  'code temp.cpp',
  'C | C++ | Python | JavaScript | IoT',
  'echo "Ready to build."',
];
const el = document.getElementById('typed');
let li = 0, ci = 0, deleting = false;

function tick() {
  const line = lines[li];
  if (!deleting) {
    el.textContent = line.slice(0, ++ci);
    if (ci === line.length) { deleting = true; setTimeout(tick, 1800); return; }
  } else {
    el.textContent = line.slice(0, --ci);
    if (ci === 0) { deleting = false; li = (li + 1) % lines.length; setTimeout(tick, 400); return; }
  }
  setTimeout(tick, deleting ? 40 : 80);
}
tick();
