const screens = {
  menu: document.getElementById('menu'),
  game: document.getElementById('game-screen'),
  help: document.getElementById('help-screen')
};

const canvas = document.getElementById('gameCanvas');
const ctx = canvas.getContext('2d');
const levelLabel = document.getElementById('levelLabel');
const statusLabel = document.getElementById('status');
const scoreLabel = document.getElementById('scoreLabel');
const messageLabel = document.getElementById('message');
const backBtn = document.getElementById('backBtn');
const helpBtn = document.getElementById('helpBtn');
const helpBackBtn = document.getElementById('helpBackBtn');

const buttons = document.querySelectorAll('button[data-level]');
let animationId;
let inputActive = false;
let gameState = null;

// Deterministic level maps. Each entry's `x` is distance offset from level start.
const levels = [
  {
    name: 'Neon Runner',
    speed: 4,
    colors: ['#3fa9f5', '#66d9ef'],
    length: 2800,
    map: [
      { type: 'block', x: 300, width: 60, height: 30 },
      { type: 'spike', x: 520, count: 3 },
      { type: 'platform', x: 760, count: 2 },
      { type: 'ship', x: 1000, length: 480 },
      { type: 'block', x: 1600, width: 60, height: 40 },
      { type: 'spike', x: 1750, count: 4 },
      { type: 'platform', x: 2000, count: 3 },
      { type: 'spike', x: 2350, count: 5 }
    ]
  },
  {
    name: 'Cyber Rush',
    speed: 5.2,
    colors: ['#e88cff', '#a64dff'],
    length: 3200,
    map: [
      { type: 'block', x: 240, width: 50, height: 36 },
      { type: 'spike', x: 480, count: 4 },
      { type: 'platform', x: 700, count: 3 },
      { type: 'ship', x: 900, length: 520 },
      { type: 'block', x: 1500, width: 80, height: 48 },
      { type: 'spike', x: 1850, count: 5 },
      { type: 'platform', x: 2100, count: 2 },
      { type: 'spike', x: 2600, count: 6 }
    ]
  },
  {
    name: 'Pixel Blast',
    speed: 6.6,
    colors: ['#ffb347', '#ffcc33'],
    length: 3600,
    map: [
      { type: 'block', x: 300, width: 60, height: 44 },
      { type: 'spike', x: 620, count: 4 },
      { type: 'platform', x: 850, count: 3 },
      { type: 'ship', x: 1100, length: 600 },
      { type: 'block', x: 1800, width: 70, height: 60 },
      { type: 'spike', x: 2100, count: 6 },
      { type: 'platform', x: 2450, count: 3 },
      { type: 'spike', x: 3000, count: 8 }
    ]
  }
];

const player = {
  x: 120,
  y: 0,
  width: 30,
  height: 30,
  dy: 0,
  gravity: 0.46,
  jumpForce: -10,
  grounded: false
};

function openScreen(name) {
  Object.values(screens).forEach(screen => screen.classList.remove('active'));
  screens[name].classList.add('active');
}

function setupLevel(index) {
  const level = levels[index - 1];
  gameState = {
    running: true,
    levelIndex: index,
    distance: 0,
    score: 0,
    finished: false,
    collision: false,
    speed: level.speed,
    obstacleGap: level.obstacleGap,
    spikeCount: level.spikeCount,
    colors: level.colors,
    obstacles: [],
    nextSpawn: 0
  };

  player.y = canvas.height - player.height - 16;
  player.dy = 0;
  player.grounded = true;
  player.mode = 'cube';
  player.thrust = false;

  gameState.obstacles = [];
  gameState.shipZones = [];

  // Build obstacles from the deterministic map
  for (const entry of level.map) {
    if (entry.type === 'spike') {
      const spikeWidth = 14;
      const spikeHeight = 20;
      const spikes = [];
      for (let i = 0; i < entry.count; i += 1) {
        spikes.push({ x: entry.x + i * spikeWidth * 1.4, y: canvas.height - 16 - spikeHeight, width: spikeWidth, height: spikeHeight });
      }
      gameState.obstacles.push({ type: 'spike', x: entry.x, width: entry.count * spikeWidth * 1.4 + 10, height: spikeHeight, spikes });
    } else if (entry.type === 'block') {
      gameState.obstacles.push({ type: 'block', x: entry.x, y: canvas.height - (entry.height || 36) - 16, width: entry.width || 60, height: entry.height || 36, spikes: [] });
    } else if (entry.type === 'platform') {
      const blockWidth = 50;
      const blockHeight = 28;
      let platformX = entry.x;
      for (let i = 0; i < entry.count; i += 1) {
        gameState.obstacles.push({ type: 'platform', x: platformX, y: canvas.height - blockHeight - 16, width: blockWidth, height: blockHeight, spikes: [] });
        platformX += blockWidth + 12;
      }
    } else if (entry.type === 'ship') {
      gameState.shipZones.push({ start: entry.x, end: entry.x + (entry.length || 400) });
    }
  }

  levelLabel.textContent = `Level ${index}: ${level.name}`;
  statusLabel.textContent = 'Go!';
  messageLabel.textContent = '';
  scoreLabel.textContent = 'Score: 0';
  openScreen('game');
  cancelAnimationFrame(animationId);
  animationId = requestAnimationFrame(gameLoop);
}

// Deprecated: levels are deterministic now. Keep function as no-op for safety.
function spawnObstacle() {}

function jump() {
  if (!gameState || !gameState.running) return;
  if (player.grounded) {
    player.dy = player.jumpForce;
    player.grounded = false;
    inputActive = true;
  }
}

function updatePlayer() {
  if (!gameState) return;

  if (player.mode === 'ship') {
    // Ship: hold thrust to go up, otherwise drift down
    if (player.thrust) player.dy = -3.6;
    else player.dy += 0.18;
    player.y += player.dy;
    if (player.y < 6) player.y = 6;
    if (player.y + player.height > canvas.height - 16) player.y = canvas.height - 16 - player.height;
    player.grounded = false;
  } else {
    player.dy += player.gravity;
    player.y += player.dy;

    const ground = canvas.height - player.height - 16;
    if (player.y >= ground) {
      player.y = ground;
      player.dy = 0;
      player.grounded = true;
    }
    if (player.y < 0) {
      player.y = 0;
      player.dy = 0;
    }
  }
}

function rectsOverlap(a, b) {
  return a.x < b.x + b.width && a.x + a.width > b.x && a.y < b.y + b.height && a.y + a.height > b.y;
}

function checkCollision() {
  const playerHitbox = { x: player.x, y: player.y, width: player.width, height: player.height };
  for (const obstacle of gameState.obstacles) {
    // Spikes always kill on contact
    if (obstacle.type === 'spike') {
      for (const spike of obstacle.spikes) {
        if (rectsOverlap(playerHitbox, spike)) return true;
      }
      continue;
    }

    // Ship ignores block/platform collisions
    if (player.mode === 'ship') continue;

    const block = { x: obstacle.x, y: obstacle.y, width: obstacle.width, height: obstacle.height };
    if (rectsOverlap(playerHitbox, block)) {
      if (obstacle.type === 'platform' || obstacle.type === 'block') {
        const playerBottom = player.y + player.height;
        const blockTop = obstacle.y;

        // landing from above: snap to top
        if (player.dy >= 0 && playerBottom - player.dy <= blockTop + 10 && playerBottom >= blockTop - 4) {
          player.y = obstacle.y - player.height;
          player.dy = 0;
          player.grounded = true;
          return false;
        }

        // side collision = death
        return true;
      }
    }
  }
  return false;
}

function drawBackground() {
  ctx.fillStyle = '#0d0d0d';
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  const gradient = ctx.createLinearGradient(0, 0, canvas.width, canvas.height);
  gradient.addColorStop(0, '#161616');
  gradient.addColorStop(1, '#090909');
  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, canvas.width, canvas.height);

  for (let i = 0; i < 20; i += 1) {
    ctx.fillStyle = 'rgba(255,255,255,0.03)';
    const size = 2 + (i % 3);
    ctx.fillRect((i * 90 + (gameState ? gameState.distance * 0.4 : 0)) % canvas.width, i * 22, size, size);
  }
}

function drawPlayer() {
  if (player.mode === 'ship') {
    // Draw spaceship
    ctx.fillStyle = '#ffcc00';
    ctx.beginPath();
    ctx.moveTo(player.x + player.width / 2, player.y);
    ctx.lineTo(player.x + player.width, player.y + player.height);
    ctx.lineTo(player.x + player.width - 4, player.y + player.height - 6);
    ctx.lineTo(player.x + player.width / 2, player.y + player.height - 2);
    ctx.lineTo(player.x + 4, player.y + player.height - 6);
    ctx.lineTo(player.x, player.y + player.height);
    ctx.closePath();
    ctx.fill();
    ctx.strokeStyle = '#ff6600';
    ctx.lineWidth = 2;
    ctx.stroke();
    // Glow effect
    ctx.fillStyle = 'rgba(255, 200, 0, 0.3)';
    ctx.beginPath();
    ctx.arc(player.x + player.width / 2, player.y + player.height / 2, player.width, 0, Math.PI * 2);
    ctx.fill();
  } else {
    // Draw cube
    ctx.fillStyle = '#ff5f5f';
    ctx.fillRect(player.x, player.y, player.width, player.height);
    ctx.strokeStyle = '#fff5';
    ctx.lineWidth = 3;
    ctx.strokeRect(player.x + 2, player.y + 2, player.width - 4, player.height - 4);
  }
}

function drawObstacles() {
  for (const obstacle of gameState.obstacles) {
    if (obstacle.type === 'spike') {
      for (const spike of obstacle.spikes) {
        ctx.beginPath();
        ctx.moveTo(spike.x, spike.y + spike.height);
        ctx.lineTo(spike.x + spike.width / 2, spike.y);
        ctx.lineTo(spike.x + spike.width, spike.y + spike.height);
        ctx.closePath();
        ctx.fillStyle = '#ffffff';
        ctx.fill();
        ctx.strokeStyle = '#ffff00';
        ctx.lineWidth = 1.5;
        ctx.stroke();
      }
    } else if (obstacle.type === 'platform') {
      // Platforms are brighter and have more visual appeal
      ctx.fillStyle = gameState.colors[0];
      ctx.fillRect(obstacle.x, obstacle.y, obstacle.width, obstacle.height);
      ctx.fillStyle = gameState.colors[1];
      ctx.lineWidth = 3;
      ctx.strokeRect(obstacle.x, obstacle.y, obstacle.width, obstacle.height);
      // Add detail pattern
      ctx.fillStyle = 'rgba(255,255,255,0.2)';
      for (let i = 0; i < obstacle.width; i += 12) {
        ctx.fillRect(obstacle.x + i, obstacle.y + obstacle.height - 4, 10, 4);
      }
    } else {
      // Regular blocks
      ctx.fillStyle = gameState.colors[0];
      ctx.fillRect(obstacle.x, obstacle.y, obstacle.width, obstacle.height);
      ctx.fillStyle = gameState.colors[1];
      ctx.lineWidth = 2;
      ctx.strokeRect(obstacle.x, obstacle.y, obstacle.width, obstacle.height);
    }
  }
}

function drawGround() {
  ctx.fillStyle = '#181818';
  ctx.fillRect(0, canvas.height - 16, canvas.width, 16);
  ctx.fillStyle = '#2a2a2a';
  for (let i = 0; i < canvas.width; i += 22) ctx.fillRect(i, canvas.height - 16, 16, 16);
}

function drawFinish() {
  const x = canvas.width - 96;
  ctx.save();
  ctx.fillStyle = '#fff';
  ctx.fillRect(x, canvas.height - 96, 12, 80);
  ctx.fillStyle = '#ff5f5f';
  ctx.fillRect(x + 12, canvas.height - 72, 12, 48);
  ctx.restore();
}

function updateObstacles(dt) {
  for (const obstacle of gameState.obstacles) {
    obstacle.x -= gameState.speed;
    if (obstacle.spikes) for (const spike of obstacle.spikes) spike.x -= gameState.speed;
  }
  gameState.obstacles = gameState.obstacles.filter(obstacle => obstacle.x + obstacle.width > -120);
  gameState.distance += gameState.speed;
}

function gameLoop(timestamp) {
  if (!gameState || !gameState.running) return;
  updatePlayer();
  updateObstacles();

  drawBackground();
  drawGround();
  drawFinish();
  drawPlayer();
  drawObstacles();

  if (checkCollision()) {
    gameState.running = false;
    gameState.collision = true;
    statusLabel.textContent = 'Crashed!';
    messageLabel.textContent = 'Tap Main Menu to retry.';
    cancelAnimationFrame(animationId);
    return;
  }

  // Toggle ship mode based on map-defined zones
  const levelDef = levels[gameState.levelIndex - 1];
  if (levelDef) {
    const inShip = gameState.shipZones.some(zone => gameState.distance >= zone.start && gameState.distance <= zone.end);
    if (inShip && player.mode !== 'ship') {
      player.mode = 'ship';
      statusLabel.textContent = '🚀 Ship Mode';
      messageLabel.textContent = 'Hold to rise!';
      messageLabel.style.color = '#ffcc00';
    } else if (!inShip && player.mode !== 'cube') {
      player.mode = 'cube';
      statusLabel.textContent = 'Cube Mode';
      messageLabel.textContent = '';
      messageLabel.style.color = '#f4f4f4';
    }
  }

  // Level finished
  if (levels[gameState.levelIndex - 1] && gameState.distance >= levels[gameState.levelIndex - 1].length) {
    gameState.running = false;
    gameState.finished = true;
    statusLabel.textContent = 'Cleared!';
    messageLabel.textContent = `Level ${gameState.levelIndex} complete. Great job!`;
    cancelAnimationFrame(animationId);
    startEndingAnimation();
    return;
  }

  gameState.score = Math.floor(gameState.distance / 10);
  scoreLabel.textContent = `Score: ${gameState.score}`;

  if (gameState.running) animationId = requestAnimationFrame(gameLoop);
}

// Ending animation with confetti and player glide to finish
function startEndingAnimation() {
  const particles = [];
  for (let i = 0; i < 120; i += 1) {
    particles.push({ x: Math.random() * canvas.width, y: -10 - Math.random() * 200, vx: (Math.random() - 0.5) * 3, vy: 1 + Math.random() * 4, color: `hsl(${Math.random() * 360},70%,60%)`, rotation: Math.random() * Math.PI * 2 });
  }

  const finishX = canvas.width - 80;
  let frameCount = 0;
  player.mode = 'cube';
  
  function endLoop() {
    frameCount++;
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    drawBackground();
    drawGround();
    drawFinish();

    // glide player toward finish smoothly
    const distance = finishX - player.x;
    if (distance > 8) player.x += distance * 0.08;
    const yTarget = canvas.height / 2 - 10;
    if (player.y > yTarget) player.y += (yTarget - player.y) * 0.1;
    
    drawPlayer();

    // draw confetti particles
    for (const p of particles) {
      p.x += p.vx;
      p.y += p.vy;
      p.vy += 0.08;
      p.rotation += (Math.random() - 0.5) * 0.3;
      
      ctx.save();
      ctx.translate(p.x, p.y);
      ctx.rotate(p.rotation);
      ctx.fillStyle = p.color;
      ctx.fillRect(-3, -5, 6, 10);
      ctx.restore();
    }

    // Show celebration text
    if (frameCount > 30) {
      ctx.fillStyle = 'rgba(255, 255, 255, ' + Math.min(1, (frameCount - 30) / 20) + ')';
      ctx.font = 'bold 48px Arial';
      ctx.textAlign = 'center';
      ctx.fillText('LEVEL COMPLETE!', canvas.width / 2, 100);
    }

    // end after particles drop and celebration shows
    if (frameCount > 180 || particles.every(p => p.y > canvas.height + 50)) return;
    requestAnimationFrame(endLoop);
  }

  requestAnimationFrame(endLoop);
}

buttons.forEach(button => {
  button.addEventListener('click', () => setupLevel(Number(button.dataset.level)));
});

backBtn.addEventListener('click', () => {
  openScreen('menu');
  cancelAnimationFrame(animationId);
});
helpBtn.addEventListener('click', () => openScreen('help'));
helpBackBtn.addEventListener('click', () => openScreen('menu'));

// Input handling: support jump (cube) and thrust (ship)
window.addEventListener('keydown', (event) => {
  if (!screens.game.classList.contains('active')) return;
  if (event.code === 'Space') {
    event.preventDefault();
    if (player.mode === 'ship') player.thrust = true;
    else jump();
  }
});
window.addEventListener('keyup', (event) => {
  if (!screens.game.classList.contains('active')) return;
  if (event.code === 'Space') {
    if (player.mode === 'ship') player.thrust = false;
  }
});

canvas.addEventListener('pointerdown', (e) => {
  if (!screens.game.classList.contains('active')) return;
  if (player.mode === 'ship') player.thrust = true;
  else jump();
});
canvas.addEventListener('pointerup', (e) => {
  if (!screens.game.classList.contains('active')) return;
  if (player.mode === 'ship') player.thrust = false;
});
canvas.addEventListener('touchcancel', () => { if (player.mode === 'ship') player.thrust = false; });
