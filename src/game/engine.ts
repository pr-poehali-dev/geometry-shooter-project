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
type DroneKind = 'uzi' | 'n';
type Drone = Vec & {
  vx: number; vy: number; hp: number; maxHp: number; r: number; t: number; shootT: number;
  kind: DroneKind; onGround: boolean; walk: number;
};
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
  underground: boolean;
  canDescend: boolean;
  laserCharge: number;
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
  boss:
    | (Vec & {
        hp: number; max: number; vx: number; vy: number; shootT: number; phase: number;
        hits: number; laserState: 'idle' | 'charging' | 'firing'; laserT: number; laserY: number;
      })
    | null = null;

  // underground / descent
  underground = false;
  canDescend = false;
  descendT = 0;
  laserCharge = 0;

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
      underground: this.underground,
      canDescend: this.canDescend,
      laserCharge: this.laserCharge,
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
    const kind: DroneKind = Math.random() > 0.5 ? 'uzi' : 'n';
    const hp = kind === 'uzi' ? 14 : 12;
    this.drones.push({
      x: side > 0 ? W + 30 : -30,
      y: GROUND - 26,
      vx: -side * (1.1 + Math.random() * 0.9) * this.diffMul,
      vy: 0, hp, maxHp: hp, r: 18, t: Math.random() * 6.28,
      shootT: 50 + Math.random() * 70, kind, onGround: true, walk: Math.random() * 6.28,
    });
  }

  startBoss() {
    this.bossActive = true;
    const baseY = this.underground ? GROUND - 220 : 140;
    this.boss = {
      x: W - 150, y: baseY, hp: 100, max: 100, vx: 0, vy: 1.4, shootT: 50, phase: 0,
      hits: 0, laserState: 'idle', laserT: 0, laserY: baseY,
    };
  }

  descend() {
    if (this.underground) return;
    this.underground = true;
    this.canDescend = false;
    this.spawnedThisWave = 0;
    this.spawnT = 30;
    this.wave = 4;
    this.drones = [];
    this.bullets = [];
    this.px = 120;
    this.py = GROUND - this.ph / 2;
    this.spawnParticles(this.px, this.py, 24, '#9b6bff');
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
      if (!this.underground) {
        // surface: 3 waves, then open descent
        this.spawnT -= dt;
        const perWave = 6 + this.wave * 2;
        if (!this.canDescend && this.spawnT <= 0 && this.spawnedThisWave < perWave) {
          this.spawnDrone();
          this.spawnedThisWave++;
          this.spawnT = Math.max(20, 70 - this.wave * 5) / this.diffMul;
        }
        if (!this.canDescend && this.spawnedThisWave >= perWave && this.drones.length === 0) {
          if (this.wave >= 3) {
            this.canDescend = true;
          } else {
            this.wave++;
            this.spawnedThisWave = 0;
          }
        }
        // descend when player reaches the hatch (right side) holding down
        if (this.canDescend && this.px > W - 90 &&
            (this.keys['ArrowDown'] || this.keys['KeyS'])) {
          this.descend();
        }
      } else {
        // underground: short guard wave, then boss
        this.spawnT -= dt;
        if (this.spawnedThisWave < 4 && this.spawnT <= 0) {
          this.spawnDrone();
          this.spawnedThisWave++;
          this.spawnT = 50 / this.diffMul;
        }
        if (this.spawnedThisWave >= 4 && this.drones.length === 0) {
          this.startBoss();
        }
      }
    }

    // drones (ground walkers)
    for (const d of this.drones) {
      d.t += 0.05 * dt;
      d.walk += Math.abs(d.vx) * 0.25 * dt;
      // walk toward player
      const dir = this.px < d.x ? -1 : 1;
      const sp = (d.kind === 'uzi' ? 1.5 : 1.1) * this.diffMul;
      d.vx = dir * sp;
      d.x += d.vx * dt;
      // gravity to ground
      d.vy += 0.7 * dt;
      d.y += d.vy * dt;
      if (d.y >= GROUND - 26) { d.y = GROUND - 26; d.vy = 0; d.onGround = true; }
      // occasional hop
      if (d.onGround && Math.random() < 0.01 * dt) { d.vy = -8; d.onGround = false; }
      d.shootT -= dt;
      if (d.shootT <= 0) {
        const ang = Math.atan2(this.py - d.y, this.px - d.x);
        if (d.kind === 'uzi') {
          // Uzi: rapid burst
          d.shootT = (55 + Math.random() * 30) / this.diffMul;
          this.bullets.push({ x: d.x, y: d.y - 6, vx: Math.cos(ang) * 6, vy: Math.sin(ang) * 6, from: 'enemy', r: 4, dmg: 5 });
        } else {
          // N: stronger single shot
          d.shootT = (95 + Math.random() * 50) / this.diffMul;
          this.bullets.push({ x: d.x, y: d.y - 6, vx: Math.cos(ang) * 4.5, vy: Math.sin(ang) * 4.5, from: 'enemy', r: 6, dmg: 9 });
        }
      }
      if (d.x < 18) d.x = 18;
      if (d.x > W - 18) d.x = W - 18;
    }

    // boss
    if (this.boss) {
      const b = this.boss;
      const topY = this.underground ? GROUND - 300 : 100;
      const botY = GROUND - 160;
      b.y += b.vy * dt;
      if (b.y < topY || b.y > botY) b.vy *= -1;

      if (b.laserState === 'charging') {
        // freeze and lock the laser height to player's row
        b.laserT -= dt;
        b.laserY = b.laserY * 0.9 + this.py * 0.1;
        if (b.laserT <= 0) { b.laserState = 'firing'; b.laserT = 60; }
      } else if (b.laserState === 'firing') {
        b.laserT -= dt;
        // damage if player crosses the beam line (left of boss)
        if (this.shield <= 0 && this.px < b.x - 40 && Math.abs(this.py - b.laserY) < this.ph / 2 + 14) {
          this.hp -= 0.9 * dt;
          this.spawnParticles(this.px, this.py, 2, '#ff3df2');
        }
        if (b.laserT <= 0) { b.laserState = 'idle'; b.hits = 0; }
      } else {
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
      this.laserCharge = b.hits;
    } else {
      this.laserCharge = 0;
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
        if (this.boss.laserState === 'idle') {
          this.boss.hits++;
          if (this.boss.hits >= 5) {
            this.boss.laserState = 'charging';
            this.boss.laserT = 70;
            this.boss.laserY = this.py;
            this.spawnParticles(this.boss.x, this.boss.y, 16, '#ff3df2');
          }
        }
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
    if (this.underground) {
      g.addColorStop(0, '#1a0a05');
      g.addColorStop(0.6, '#2a1206');
      g.addColorStop(1, '#0c0602');
    } else {
      g.addColorStop(0, '#0a0420');
      g.addColorStop(0.6, '#140a33');
      g.addColorStop(1, '#1d0a3d');
    }
    c.fillStyle = g;
    c.fillRect(0, 0, W, H);

    if (this.underground) {
      // cave rocks
      c.fillStyle = 'rgba(120,70,30,0.25)';
      for (const s of this.stars) {
        c.fillRect((s.x * 1.3) % W, (s.y * 0.9) % GROUND, s.s * 3, s.s * 3);
      }
      // hanging stalactites
      c.fillStyle = '#3a1c08';
      for (let i = 0; i < 9; i++) {
        const sx = i * 110 + 30;
        c.beginPath();
        c.moveTo(sx - 16, 0); c.lineTo(sx + 16, 0); c.lineTo(sx, 60 + (i % 3) * 20);
        c.closePath(); c.fill();
      }
    } else {
      // stars
      c.fillStyle = '#7d6bcf';
      for (const s of this.stars) {
        c.globalAlpha = 0.3 + (Math.sin((this.last / 600) + s.x) + 1) * 0.25;
        c.fillRect(s.x, s.y, s.s, s.s);
      }
      c.globalAlpha = 1;
    }

    // descent hatch on surface
    if (!this.underground && this.canDescend) {
      const hx = W - 60;
      c.save();
      c.shadowBlur = 18; c.shadowColor = '#9b6bff';
      c.fillStyle = '#1a0a30';
      c.fillRect(hx - 34, GROUND - 6, 68, 6);
      c.fillStyle = '#9b6bff';
      const pulse = 0.5 + Math.sin(this.last / 200) * 0.5;
      c.globalAlpha = 0.4 + pulse * 0.5;
      c.fillRect(hx - 30, GROUND - 4, 60, 4);
      c.restore();
      c.globalAlpha = 1;
      c.fillStyle = '#cdb6ff';
      c.font = '18px "VT323", monospace';
      c.textAlign = 'center';
      c.fillText('\u2193 ВНИЗ (S)', hx, GROUND - 14);
    }

    // ground
    c.fillStyle = this.underground ? '#160a04' : '#0a0a18';
    c.fillRect(0, GROUND, W, H - GROUND);
    c.strokeStyle = this.underground ? '#ff8a3a' : '#22e3ff';
    c.lineWidth = 2;
    c.shadowBlur = 12;
    c.shadowColor = this.underground ? '#ff8a3a' : '#22e3ff';
    c.beginPath();
    c.moveTo(0, GROUND);
    c.lineTo(W, GROUND);
    c.stroke();
    c.shadowBlur = 0;
    // grid floor
    c.strokeStyle = this.underground ? 'rgba(255,138,58,0.12)' : 'rgba(34,227,255,0.15)';
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

    // drones — Murder Drones style (Uzi / N)
    for (const d of this.drones) {
      const accent = d.kind === 'uzi' ? '#ff4dd2' : '#ffd000';
      const legSwing = Math.sin(d.walk) * 5;
      c.save();
      c.translate(d.x, d.y);
      // legs (walking)
      c.strokeStyle = '#d8d8e0';
      c.lineWidth = 3;
      c.beginPath(); c.moveTo(-6, 14); c.lineTo(-6 + legSwing, 26); c.stroke();
      c.beginPath(); c.moveTo(6, 14); c.lineTo(6 - legSwing, 26); c.stroke();
      // body capsule (white)
      c.shadowBlur = 8; c.shadowColor = accent;
      c.fillStyle = '#f2f0f5';
      c.fillRect(-13, -16, 26, 30);
      c.fillStyle = '#d6d2dd';
      c.fillRect(-13, 10, 26, 4);
      // black face screen
      c.shadowBlur = 0;
      c.fillStyle = '#0a0a0f';
      c.fillRect(-11, -13, 22, 18);
      // eyes / symbol
      c.fillStyle = accent;
      c.shadowBlur = 8; c.shadowColor = accent;
      if (d.kind === 'uzi') {
        // X X eyes
        c.font = 'bold 9px "VT323", monospace';
        c.textAlign = 'center';
        c.fillText('X', -5, -2);
        c.fillText('X', 5, -2);
      } else {
        // N: two angled eyes
        c.fillRect(-8, -8, 5, 7);
        c.fillRect(3, -8, 5, 7);
      }
      // antenna / horns
      c.shadowBlur = 0;
      c.strokeStyle = accent; c.lineWidth = 2;
      c.beginPath(); c.moveTo(-7, -16); c.lineTo(-10, -24); c.stroke();
      c.beginPath(); c.moveTo(7, -16); c.lineTo(10, -24); c.stroke();
      // little gun arm
      c.fillStyle = '#8a8a96';
      const gd = this.px < d.x ? -1 : 1;
      c.fillRect(gd > 0 ? 11 : -17, 0, 6, 4);
      c.restore();
      c.shadowBlur = 0;
      // hp bar
      c.fillStyle = '#300';
      c.fillRect(d.x - 16, d.y - 32, 32, 3);
      c.fillStyle = '#51ff7a';
      c.fillRect(d.x - 16, d.y - 32, 32 * Math.max(0, d.hp / d.maxHp), 3);
    }

    // boss
    if (this.boss) {
      const b = this.boss;
      // laser beam
      if (b.laserState === 'charging') {
        const k = 1 - b.laserT / 70;
        c.save();
        c.globalAlpha = 0.4 + Math.sin(this.last / 40) * 0.3;
        c.fillStyle = '#ff3df2';
        c.fillRect(0, b.laserY - (1 + k * 4), b.x - 40, 2 + k * 8);
        c.restore();
      } else if (b.laserState === 'firing') {
        c.save();
        c.shadowBlur = 24; c.shadowColor = '#ff3df2';
        c.fillStyle = '#ffffff';
        c.fillRect(0, b.laserY - 7, b.x - 40, 14);
        c.fillStyle = '#ff3df2';
        c.globalAlpha = 0.7;
        c.fillRect(0, b.laserY - 14, b.x - 40, 28);
        c.restore();
        c.shadowBlur = 0;
      }
      c.save();
      c.translate(b.x, b.y);
      const charging = b.laserState !== 'idle';
      c.shadowBlur = 25; c.shadowColor = charging ? '#ffffff' : '#ff3df2';
      c.fillStyle = '#2a0030';
      c.fillRect(-52, -42, 104, 84);
      c.fillStyle = charging ? '#ffffff' : '#ff3df2';
      c.fillRect(-52, -42, 104, 8);
      c.fillRect(-52, 34, 104, 8);
      // eyes (glow red when charging laser)
      c.fillStyle = charging ? '#ff2b2b' : '#ffd000';
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