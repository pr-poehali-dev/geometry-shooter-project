export type SkinDef = {
  id: string;
  name: string;
  body: string;
  glow: string;
  trail: string;
};

export const SKINS: SkinDef[] = [
  { id: 'cyber', name: 'CYBER', body: '#22e3ff', glow: '#22e3ff', trail: '#0aa6d6' },
  { id: 'toxic', name: 'TOXIC', body: '#51ff7a', glow: '#51ff7a', trail: '#18b94a' },
  { id: 'magma', name: 'MAGMA', body: '#ff6a2b', glow: '#ff8a00', trail: '#d63a00' },
  { id: 'plasma', name: 'PLASMA', body: '#ff3df2', glow: '#ff3df2', trail: '#c411b8' },
  { id: 'gold', name: 'GOLD', body: '#ffd000', glow: '#ffe14d', trail: '#c79a00' },
];

export type Settings = {
  sound: boolean;
  difficulty: 'easy' | 'normal' | 'hard';
  showFps: boolean;
};

export type GameStatus = 'playing' | 'won' | 'lost';

type Vec = { x: number; y: number };

type Bullet = Vec & { vx: number; vy: number; from: 'player' | 'enemy'; r: number; dmg: number };
type Drone = Vec & { vx: number; vy: number; hp: number; r: number; t: number; shootT: number };
type Bonus = Vec & { type: 'health' | 'rapid' | 'shield'; t: number };
type Particle = Vec & { vx: number; vy: number; life: number; max: number; color: string };

export type HudState = {
  hp: number;
  maxHp: number;
  score: number;
  wave: number;
  bossActive: boolean;
  bossHp: number;
  bossMax: number;
  status: GameStatus;
  fps: number;
  buff: string;
};

const W = 900;
const H = 540;
const GROUND = H - 60;

export class Game {
  ctx: CanvasRenderingContext2D;
  skin: SkinDef;
  settings: Settings;
  onHud: (h: HudState) => void;
  onEnd: (status: GameStatus, score: number) => void;

  raf = 0;
  last = 0;
  fps = 60;
  paused = false;
  ended = false;

  keys: Record<string, boolean> = {};

  // player
  px = 120;
  py = GROUND - 40;
  pvx = 0;
  pvy = 0;
  pw = 34;
  ph = 40;
  onGround = true;
  facing = 1;
  hp = 100;
  maxHp = 100;
  shootCd = 0;
  rapid = 0;
  shield = 0;

  bullets: Bullet[] = [];
  drones: Drone[] = [];
  bonuses: Bonus[] = [];
  particles: Particle[] = [];
  stars: { x: number; y: number; s: number }[] = [];

  score = 0;
  wave = 1;
  spawnT = 0;
  spawnedThisWave = 0;
  bossActive = false;
  boss: (Vec & { hp: number; max: number; vx: number; vy: number; shootT: number; phase: number }) | null = null;

  constructor(
    canvas: HTMLCanvasElement,
    skin: SkinDef,
    settings: Settings,
    onHud: (h: HudState) => void,
    onEnd: (status: GameStatus, score: number) => void
  ) {
    this.ctx = canvas.getContext('2d')!;
    this.skin = skin;
    this.settings = settings;
    this.onHud = onHud;
    this.onEnd = onEnd;
    for (let i = 0; i < 70; i++) {
      this.stars.push({ x: Math.random() * W, y: Math.random() * GROUND, s: Math.random() * 2 + 0.5 });
    }
  }

  get diffMul() {
    return this.settings.difficulty === 'easy' ? 0.7 : this.settings.difficulty === 'hard' ? 1.4 : 1;
  }

  start() {
    this.last = performance.now();
    this.loop(this.last);
  }

  stop() {
    cancelAnimationFrame(this.raf);
  }

  setPaused(p: boolean) {
    this.paused = p;
    if (!p) {
      this.last = performance.now();
      this.loop(this.last);
    }
  }

  key(code: string, down: boolean) {
    this.keys[code] = down;
    if (down && (code === 'Space' || code === 'ArrowUp' || code === 'KeyW')) this.jump();
  }

  jump() {
    if (this.onGround) {
      this.pvy = -13;
      this.onGround = false;
      this.spawnParticles(this.px, this.py + this.ph / 2, 6, this.skin.trail);
    }
  }

  loop = (t: number) => {
    if (this.paused || this.ended) return;
    const frameMs = t - this.last;
    let dt = frameMs / 16.6667;
    if (dt > 3) dt = 3;
    this.last = t;

    if (frameMs > 0) {
      this.fps = this.fps * 0.9 + (1000 / frameMs) * 0.1;
    }

    this.update(dt);
    this.draw();
    this.emitHud();
    this.raf = requestAnimationFrame(this.loop);
  };

  emitHud() {
    this.onHud({
      hp: Math.max(0, Math.round(this.hp)),
      maxHp: this.maxHp,
      score: this.score,
      wave: this.wave,
      bossActive: this.bossActive,
      bossHp: this.boss ? Math.max(0, Math.round(this.boss.hp)) : 0,
      bossMax: this.boss ? this.boss.max : 100,
      status: 'playing',
      fps: Math.round(this.fps),
      buff: this.rapid > 0 ? 'RAPID' : this.shield > 0 ? 'SHIELD' : '',
    });
  }

  spawnParticles(x: number, y: number, n: number, color: string) {
    for (let i = 0; i < n; i++) {
      this.particles.push({
        x, y,
        vx: (Math.random() - 0.5) * 5,
        vy: (Math.random() - 0.5) * 5,
        life: 0, max: 18 + Math.random() * 14, color,
      });
    }
  }

  shoot() {
    const cd = this.rapid > 0 ? 6 : 13;
    if (this.shootCd > 0) return;
    this.shootCd = cd;
    this.bullets.push({
      x: this.px + this.facing * 22, y: this.py,
      vx: this.facing * 12, vy: 0, from: 'player', r: 5, dmg: 6,
    });
    this.spawnParticles(this.px + this.facing * 22, this.py, 3, this.skin.glow);
  }

  spawnDrone() {
    const side = Math.random() > 0.5 ? 1 : -1;
    this.drones.push({
      x: side > 0 ? W + 30 : -30,
      y: 80 + Math.random() * (GROUND - 180),
      vx: -side * (1.4 + Math.random() * 1.2) * this.diffMul,
      vy: 0, hp: 12, r: 18, t: Math.random() * 6.28, shootT: 40 + Math.random() * 60,
    });
  }

  startBoss() {
    this.bossActive = true;
    this.boss = { x: W - 140, y: 140, hp: 100, max: 100, vx: 0, vy: 1.4, shootT: 50, phase: 0 };
  }

  update(dt: number) {
    // input movement
    const speed = 4.2;
    this.pvx = 0;
    if (this.keys['ArrowLeft'] || this.keys['KeyA']) { this.pvx = -speed; this.facing = -1; }
    if (this.keys['ArrowRight'] || this.keys['KeyD']) { this.pvx = speed; this.facing = 1; }
    if (this.keys['KeyJ'] || this.keys['KeyF'] || this.keys['Enter']) this.shoot();

    this.pvy += 0.7 * dt;
    this.px += this.pvx * dt;
    this.py += this.pvy * dt;
    if (this.px < 20) this.px = 20;
    if (this.px > W - 20) this.px = W - 20;
    if (this.py >= GROUND - this.ph / 2) {
      this.py = GROUND - this.ph / 2;
      this.pvy = 0;
      this.onGround = true;
    }

    if (this.shootCd > 0) this.shootCd -= dt;
    if (this.rapid > 0) this.rapid -= dt;
    if (this.shield > 0) this.shield -= dt;

    // spawn waves
    if (!this.bossActive) {
      this.spawnT -= dt;
      const perWave = 6 + this.wave * 2;
      if (this.spawnT <= 0 && this.spawnedThisWave < perWave) {
        this.spawnDrone();
        this.spawnedThisWave++;
        this.spawnT = Math.max(20, 70 - this.wave * 5) / this.diffMul;
      }
      if (this.spawnedThisWave >= perWave && this.drones.length === 0) {
        if (this.wave >= 3) {
          this.startBoss();
        } else {
          this.wave++;
          this.spawnedThisWave = 0;
        }
      }
    }

    // drones
    for (const d of this.drones) {
      d.t += 0.05 * dt;
      d.x += d.vx * dt;
      d.y += Math.sin(d.t) * 1.4 * dt;
      d.shootT -= dt;
      if (d.shootT <= 0) {
        d.shootT = (90 + Math.random() * 60) / this.diffMul;
        const ang = Math.atan2(this.py - d.y, this.px - d.x);
        this.bullets.push({ x: d.x, y: d.y, vx: Math.cos(ang) * 4.5, vy: Math.sin(ang) * 4.5, from: 'enemy', r: 5, dmg: 8 });
      }
      if (d.x < -60 || d.x > W + 60) d.vx *= -1;
    }

    // boss
    if (this.boss) {
      const b = this.boss;
      b.y += b.vy * dt;
      if (b.y < 100 || b.y > GROUND - 160) b.vy *= -1;
      b.shootT -= dt;
      if (b.shootT <= 0) {
        b.phase++;
        b.shootT = 45 / this.diffMul;
        if (b.phase % 3 === 0) {
          for (let a = 0; a < 8; a++) {
            const ang = (a / 8) * Math.PI * 2;
            this.bullets.push({ x: b.x, y: b.y, vx: Math.cos(ang) * 3.5, vy: Math.sin(ang) * 3.5, from: 'enemy', r: 6, dmg: 10 });
          }
        } else {
          const ang = Math.atan2(this.py - b.y, this.px - b.x);
          this.bullets.push({ x: b.x, y: b.y, vx: Math.cos(ang) * 5.5, vy: Math.sin(ang) * 5.5, from: 'enemy', r: 7, dmg: 12 });
        }
      }
    }

    // bullets
    for (const bl of this.bullets) {
      bl.x += bl.vx * dt;
      bl.y += bl.vy * dt;
    }

    // collisions: player bullets -> drones / boss
    for (const bl of this.bullets) {
      if (bl.from !== 'player') continue;
      for (const d of this.drones) {
        if (Math.hypot(bl.x - d.x, bl.y - d.y) < d.r + bl.r) {
          d.hp -= bl.dmg;
          bl.x = -9999;
          this.spawnParticles(bl.x, bl.y, 4, '#ff8a00');
        }
      }
      if (this.boss && Math.hypot(bl.x - this.boss.x, bl.y - this.boss.y) < 52 + bl.r) {
        this.boss.hp -= bl.dmg;
        bl.x = -9999;
        this.spawnParticles(bl.x, bl.y, 6, '#ff3df2');
      }
    }

    // enemy bullets -> player
    for (const bl of this.bullets) {
      if (bl.from !== 'enemy') continue;
      if (Math.abs(bl.x - this.px) < this.pw / 2 + bl.r && Math.abs(bl.y - this.py) < this.ph / 2 + bl.r) {
        bl.x = -9999;
        if (this.shield > 0) {
          this.spawnParticles(this.px, this.py, 6, '#22e3ff');
        } else {
          this.hp -= bl.dmg;
          this.spawnParticles(this.px, this.py, 8, '#ff3b3b');
        }
      }
    }

    // drone touch player
    for (const d of this.drones) {
      if (Math.abs(d.x - this.px) < this.pw / 2 + d.r && Math.abs(d.y - this.py) < this.ph / 2 + d.r) {
        if (this.shield <= 0) this.hp -= 0.5 * dt;
      }
    }

    // dead drones -> score + bonus chance
    this.drones = this.drones.filter((d) => {
      if (d.hp <= 0) {
        this.score += 10;
        this.spawnParticles(d.x, d.y, 14, '#ffd000');
        if (Math.random() < 0.25) {
          const r = Math.random();
          const type = r < 0.5 ? 'health' : r < 0.8 ? 'rapid' : 'shield';
          this.bonuses.push({ x: d.x, y: d.y, type, t: 0 });
        }
        return false;
      }
      return true;
    });

    // boss death -> win
    if (this.boss && this.boss.hp <= 0) {
      this.score += 500;
      this.spawnParticles(this.boss.x, this.boss.y, 40, '#ff3df2');
      this.boss = null;
      this.bossActive = false;
      this.win();
    }

    // bonuses
    for (const bo of this.bonuses) {
      bo.t += dt;
      bo.y += Math.sin(bo.t * 0.1) * 0.5;
    }
    this.bonuses = this.bonuses.filter((bo) => {
      if (Math.abs(bo.x - this.px) < this.pw / 2 + 14 && Math.abs(bo.y - this.py) < this.ph / 2 + 14) {
        if (bo.type === 'health') this.hp = Math.min(this.maxHp, this.hp + 25);
        if (bo.type === 'rapid') this.rapid = 360;
        if (bo.type === 'shield') this.shield = 360;
        this.score += 5;
        this.spawnParticles(bo.x, bo.y, 10, '#51ff7a');
        return false;
      }
      return true;
    });

    // particles
    for (const p of this.particles) {
      p.life += dt;
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      p.vy += 0.12 * dt;
    }
    this.particles = this.particles.filter((p) => p.life < p.max);

    // cleanup bullets
    this.bullets = this.bullets.filter((b) => b.x > -50 && b.x < W + 50 && b.y > -50 && b.y < H + 50);

    if (this.hp <= 0) this.lose();
  }

  win() {
    this.ended = true;
    this.onEnd('won', this.score);
  }
  lose() {
    if (this.ended) return;
    this.ended = true;
    this.onEnd('lost', this.score);
  }

  draw() {
    const c = this.ctx;
    // bg gradient
    const g = c.createLinearGradient(0, 0, 0, H);
    g.addColorStop(0, '#0a0420');
    g.addColorStop(0.6, '#140a33');
    g.addColorStop(1, '#1d0a3d');
    c.fillStyle = g;
    c.fillRect(0, 0, W, H);

    // stars
    c.fillStyle = '#7d6bcf';
    for (const s of this.stars) {
      c.globalAlpha = 0.3 + (Math.sin((this.last / 600) + s.x) + 1) * 0.25;
      c.fillRect(s.x, s.y, s.s, s.s);
    }
    c.globalAlpha = 1;

    // ground
    c.fillStyle = '#0a0a18';
    c.fillRect(0, GROUND, W, H - GROUND);
    c.strokeStyle = '#22e3ff';
    c.lineWidth = 2;
    c.shadowBlur = 12;
    c.shadowColor = '#22e3ff';
    c.beginPath();
    c.moveTo(0, GROUND);
    c.lineTo(W, GROUND);
    c.stroke();
    c.shadowBlur = 0;
    // grid floor
    c.strokeStyle = 'rgba(34,227,255,0.15)';
    c.lineWidth = 1;
    for (let x = (this.px % 40); x < W; x += 40) {
      c.beginPath(); c.moveTo(x, GROUND); c.lineTo(x, H); c.stroke();
    }

    // particles
    for (const p of this.particles) {
      const a = 1 - p.life / p.max;
      c.globalAlpha = a;
      c.fillStyle = p.color;
      c.fillRect(p.x - 2, p.y - 2, 4, 4);
    }
    c.globalAlpha = 1;

    // bonuses
    for (const bo of this.bonuses) {
      const col = bo.type === 'health' ? '#ff5470' : bo.type === 'rapid' ? '#ffd000' : '#22e3ff';
      c.shadowBlur = 12; c.shadowColor = col; c.fillStyle = col;
      c.fillRect(bo.x - 9, bo.y - 9, 18, 18);
      c.shadowBlur = 0;
      c.fillStyle = '#000';
      c.font = '14px "VT323", monospace';
      c.textAlign = 'center';
      c.fillText(bo.type === 'health' ? '+' : bo.type === 'rapid' ? 'R' : 'S', bo.x, bo.y + 5);
    }

    // drones
    for (const d of this.drones) {
      c.save();
      c.translate(d.x, d.y);
      c.shadowBlur = 10; c.shadowColor = '#ff3b3b';
      c.fillStyle = '#2a0a0a';
      c.fillRect(-d.r, -d.r * 0.6, d.r * 2, d.r * 1.2);
      c.fillStyle = '#ff3b3b';
      c.fillRect(-d.r, -2, d.r * 2, 4);
      c.fillStyle = '#ffd000';
      c.fillRect(-4, -4, 8, 8);
      // propellers
      c.fillStyle = '#888';
      c.fillRect(-d.r - 6, -d.r * 0.6 - 4, 8, 3);
      c.fillRect(d.r - 2, -d.r * 0.6 - 4, 8, 3);
      c.restore();
      c.shadowBlur = 0;
      // hp bar
      c.fillStyle = '#300';
      c.fillRect(d.x - 16, d.y - d.r - 8, 32, 3);
      c.fillStyle = '#51ff7a';
      c.fillRect(d.x - 16, d.y - d.r - 8, 32 * (d.hp / 12), 3);
    }

    // boss
    if (this.boss) {
      const b = this.boss;
      c.save();
      c.translate(b.x, b.y);
      c.shadowBlur = 25; c.shadowColor = '#ff3df2';
      c.fillStyle = '#2a0030';
      c.fillRect(-52, -42, 104, 84);
      c.fillStyle = '#ff3df2';
      c.fillRect(-52, -42, 104, 8);
      c.fillRect(-52, 34, 104, 8);
      // eyes
      c.fillStyle = '#ffd000';
      c.fillRect(-30, -14, 18, 18);
      c.fillRect(12, -14, 18, 18);
      c.fillStyle = '#000';
      c.fillRect(-24, -8, 8, 8);
      c.fillRect(18, -8, 8, 8);
      // mouth
      c.fillStyle = '#ff3b3b';
      c.fillRect(-26, 16, 52, 8);
      c.restore();
      c.shadowBlur = 0;
    }

    // bullets
    for (const bl of this.bullets) {
      const col = bl.from === 'player' ? this.skin.glow : '#ff5470';
      c.shadowBlur = 10; c.shadowColor = col; c.fillStyle = col;
      c.fillRect(bl.x - bl.r, bl.y - bl.r, bl.r * 2, bl.r * 2);
    }
    c.shadowBlur = 0;

    // player
    c.save();
    c.translate(this.px, this.py);
    if (this.shield > 0) {
      c.strokeStyle = '#22e3ff';
      c.shadowBlur = 14; c.shadowColor = '#22e3ff';
      c.lineWidth = 2;
      c.beginPath(); c.arc(0, 0, 30, 0, Math.PI * 2); c.stroke();
    }
    c.shadowBlur = 16; c.shadowColor = this.skin.glow;
    c.fillStyle = this.skin.body;
    c.fillRect(-this.pw / 2, -this.ph / 2, this.pw, this.ph);
    // face
    c.fillStyle = '#04111c';
    c.fillRect(this.facing > 0 ? 2 : -14, -10, 12, 8);
    // gun
    c.fillStyle = '#dfe9ff';
    c.fillRect(this.facing > 0 ? 8 : -22, -2, 14, 5);
    c.restore();
    c.shadowBlur = 0;

    // fps
    if (this.settings.showFps) {
      c.fillStyle = '#51ff7a';
      c.font = '16px "VT323", monospace';
      c.textAlign = 'left';
      c.fillText('FPS ' + Math.round(this.fps), 10, 20);
    }
  }
}

export const GAME_W = W;
export const GAME_H = H;