// Rendering/interaction layer. Filled in during the core-mechanic stage.

const stage = document.getElementById("stage");
const canvas = document.getElementById("scene");
const ctx = canvas.getContext("2d");

let width = 0;
let height = 0;

function resize() {
  const rect = stage.getBoundingClientRect();
  width = rect.width;
  height = rect.height;
  const dpr = window.devicePixelRatio || 1;
  canvas.width = width * dpr;
  canvas.height = height * dpr;
  canvas.style.width = `${width}px`;
  canvas.style.height = `${height}px`;
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
}

function anchorPoint() {
  return { x: width * 0.22, y: height * 0.78 };
}

function draw() {
  ctx.clearRect(0, 0, width, height);
  const anchor = anchorPoint();

  ctx.strokeStyle = "#4a5568";
  ctx.lineWidth = 3;
  ctx.beginPath();
  ctx.moveTo(anchor.x, anchor.y);
  ctx.lineTo(anchor.x, anchor.y - 60);
  ctx.stroke();

  ctx.fillStyle = "#6fb3ff";
  ctx.beginPath();
  ctx.arc(anchor.x, anchor.y - 60, 14, 0, Math.PI * 2);
  ctx.fill();
}

window.addEventListener("resize", () => {
  resize();
  draw();
});

resize();
draw();
