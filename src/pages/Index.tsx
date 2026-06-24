import { useCallback, useEffect, useRef, useState } from 'react';
import Icon from '@/components/ui/icon';
import {
  Game,
  GAME_H,
  GAME_W,
  SKINS,
  type HudState,
  type Settings,
  type GameStatus,
} from '@/game/engine';

type Screen = 'menu' | 'skins' | 'settings' | 'records' | 'intro' | 'game' | 'gameover';

const PixelButton = ({
  children,
  onClick,
  color = 'cyan',
  className = '',
}: {
  children: React.ReactNode;
  onClick?: () => void;
  color?: 'cyan' | 'pink' | 'green' | 'yellow';
  className?: string;
}) => {
  const map = {
    cyan: 'border-[#22e3ff] text-[#22e3ff] hover:bg-[#22e3ff] box-neon-cyan',
    pink: 'border-[#ff3df2] text-[#ff3df2] hover:bg-[#ff3df2] box-neon-pink',
    green: 'border-[#51ff7a] text-[#51ff7a] hover:bg-[#51ff7a]',
    yellow: 'border-[#ffd000] text-[#ffd000] hover:bg-[#ffd000]',
  };
  return (
    <button
      onClick={onClick}
      className={`font-pixel text-[11px] sm:text-xs px-5 py-3 border-2 bg-black/40 transition-all duration-150 hover:text-black hover:scale-105 active:scale-95 tracking-wider ${map[color]} ${className}`}
    >
      {children}
    </button>
  );
};

const loadRecords = (): number[] => {
  try {
    return JSON.parse(localStorage.getItem('gd_records') || '[]');
  } catch {
    return [];
  }
};

const Index = () => {
  const [screen, setScreen] = useState<Screen>('menu');
  const [skinId, setSkinId] = useState(() => localStorage.getItem('gd_skin') || 'cyber');
  const [settings, setSettings] = useState<Settings>(() => {
    try {
      return JSON.parse(localStorage.getItem('gd_settings') || '');
    } catch {
      return { sound: true, difficulty: 'normal', showFps: false };
    }
  });
  const [records, setRecords] = useState<number[]>(loadRecords);
  const [hud, setHud] = useState<HudState | null>(null);
  const [paused, setPaused] = useState(false);
  const [result, setResult] = useState<{ status: GameStatus; score: number } | null>(null);

  const canvasRef = useRef<HTMLCanvasElement>(null);
  const gameRef = useRef<Game | null>(null);

  useEffect(() => {
    localStorage.setItem('gd_skin', skinId);
  }, [skinId]);
  useEffect(() => {
    localStorage.setItem('gd_settings', JSON.stringify(settings));
  }, [settings]);

  const endGame = useCallback((status: GameStatus, score: number) => {
    const recs = [...loadRecords(), score].sort((a, b) => b - a).slice(0, 5);
    localStorage.setItem('gd_records', JSON.stringify(recs));
    setRecords(recs);
    setResult({ status, score });
    setScreen('gameover');
  }, []);

  const startGame = useCallback(() => {
    setResult(null);
    setPaused(false);
    setScreen('intro');
  }, []);

  useEffect(() => {
    if (screen !== 'game' || !canvasRef.current) return;
    const skin = SKINS.find((s) => s.id === skinId) || SKINS[0];
    const game = new Game(canvasRef.current, skin, settings, setHud, endGame);
    gameRef.current = game;
    game.start();

    const down = (e: KeyboardEvent) => {
      if (e.code === 'Escape') {
        setPaused((p) => {
          const np = !p;
          game.setPaused(np);
          return np;
        });
        return;
      }
      if (['Space', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(e.code)) e.preventDefault();
      game.key(e.code, true);
    };
    const up = (e: KeyboardEvent) => game.key(e.code, false);
    window.addEventListener('keydown', down);
    window.addEventListener('keyup', up);
    return () => {
      window.removeEventListener('keydown', down);
      window.removeEventListener('keyup', up);
      game.stop();
      gameRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [screen]);

  const togglePause = () => {
    setPaused((p) => {
      const np = !p;
      gameRef.current?.setPaused(np);
      return np;
    });
  };

  const quitToMenu = () => {
    gameRef.current?.stop();
    setScreen('menu');
    setPaused(false);
  };

  const selectedSkin = SKINS.find((s) => s.id === skinId) || SKINS[0];

  return (
    <div className="min-h-screen w-full bg-[#06030f] arcade-grid flex flex-col items-center justify-center p-4 overflow-hidden">
      <div className="relative w-full max-w-[920px]">
        {/* Title */}
        {screen !== 'game' && screen !== 'intro' && (
          <div className="text-center mb-6 select-none">
            <h1 className="font-pixel text-[#22e3ff] neon-cyan text-2xl sm:text-4xl leading-tight animate-flicker">
              NEON
            </h1>
            <h1 className="font-pixel text-[#ff3df2] neon-pink text-2xl sm:text-4xl leading-tight mt-2">
              DRONE WAR
            </h1>
            <p className="font-mono2 text-[#51ff7a] text-xl mt-3 tracking-widest neon-green">
              2D PIXEL SHOOTER
            </p>
          </div>
        )}

        {/* MENU */}
        {screen === 'menu' && (
          <div className="flex flex-col items-center gap-3 animate-fade-in">
            <PixelButton onClick={startGame} color="green" className="w-64">
              ▶ ИГРАТЬ
            </PixelButton>
            <PixelButton onClick={() => setScreen('skins')} color="pink" className="w-64">
              СКИНЫ
            </PixelButton>
            <PixelButton onClick={() => setScreen('settings')} color="cyan" className="w-64">
              НАСТРОЙКИ
            </PixelButton>
            <PixelButton onClick={() => setScreen('records')} color="yellow" className="w-64">
              РЕКОРДЫ
            </PixelButton>
            <p className="font-mono2 text-[#7d6bcf] text-base mt-4 text-center max-w-md">
              A/D — движение · SPACE — прыжок · S — вниз · J — стрелять · ESC — пауза
            </p>
          </div>
        )}

        {/* INTRO — командир */}
        {screen === 'intro' && (
          <CommanderIntro onDone={() => setScreen('game')} />
        )}

        {/* SKINS */}
        {screen === 'skins' && (
          <div className="animate-fade-in">
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-4">
              {SKINS.map((s) => (
                <button
                  key={s.id}
                  onClick={() => setSkinId(s.id)}
                  className={`relative flex flex-col items-center gap-3 p-5 border-2 bg-black/50 transition-all hover:scale-105 ${
                    skinId === s.id ? 'border-white' : 'border-[#2a1f4d]'
                  }`}
                  style={skinId === s.id ? { boxShadow: `0 0 14px ${s.glow}` } : undefined}
                >
                  <div
                    className="w-12 h-14 animate-float-slow"
                    style={{ background: s.body, boxShadow: `0 0 18px ${s.glow}` }}
                  />
                  <span className="font-pixel text-[10px]" style={{ color: s.glow }}>
                    {s.name}
                  </span>
                  {skinId === s.id && (
                    <span className="absolute top-2 right-2 font-pixel text-[8px] text-white">✓</span>
                  )}
                </button>
              ))}
            </div>
            <div className="flex justify-center mt-6">
              <PixelButton onClick={() => setScreen('menu')} color="cyan">
                ← НАЗАД
              </PixelButton>
            </div>
          </div>
        )}

        {/* SETTINGS */}
        {screen === 'settings' && (
          <div className="animate-fade-in max-w-md mx-auto flex flex-col gap-5 border-2 border-[#2a1f4d] bg-black/50 p-6">
            <div className="flex items-center justify-between">
              <span className="font-mono2 text-[#22e3ff] text-xl">СЛОЖНОСТЬ</span>
              <div className="flex gap-2">
                {(['easy', 'normal', 'hard'] as const).map((d) => (
                  <button
                    key={d}
                    onClick={() => setSettings((s) => ({ ...s, difficulty: d }))}
                    className={`font-pixel text-[9px] px-3 py-2 border-2 ${
                      settings.difficulty === d
                        ? 'border-[#51ff7a] text-[#51ff7a]'
                        : 'border-[#2a1f4d] text-[#5b4d8a]'
                    }`}
                  >
                    {d === 'easy' ? 'ЛЕГКО' : d === 'normal' ? 'НОРМА' : 'ХАРД'}
                  </button>
                ))}
              </div>
            </div>
            <div className="flex items-center justify-between">
              <span className="font-mono2 text-[#22e3ff] text-xl">ЗВУК</span>
              <button
                onClick={() => setSettings((s) => ({ ...s, sound: !s.sound }))}
                className={`font-pixel text-[9px] px-4 py-2 border-2 ${
                  settings.sound ? 'border-[#51ff7a] text-[#51ff7a]' : 'border-[#ff3b3b] text-[#ff3b3b]'
                }`}
              >
                {settings.sound ? 'ВКЛ' : 'ВЫКЛ'}
              </button>
            </div>
            <div className="flex items-center justify-between">
              <span className="font-mono2 text-[#22e3ff] text-xl">ПОКАЗ FPS</span>
              <button
                onClick={() => setSettings((s) => ({ ...s, showFps: !s.showFps }))}
                className={`font-pixel text-[9px] px-4 py-2 border-2 ${
                  settings.showFps ? 'border-[#51ff7a] text-[#51ff7a]' : 'border-[#ff3b3b] text-[#ff3b3b]'
                }`}
              >
                {settings.showFps ? 'ВКЛ' : 'ВЫКЛ'}
              </button>
            </div>
            <div className="flex justify-center mt-2">
              <PixelButton onClick={() => setScreen('menu')} color="cyan">
                ← НАЗАД
              </PixelButton>
            </div>
          </div>
        )}

        {/* RECORDS */}
        {screen === 'records' && (
          <div className="animate-fade-in max-w-md mx-auto border-2 border-[#ffd000] bg-black/50 p-6">
            <h2 className="font-pixel text-[#ffd000] neon-yellow text-sm text-center mb-5">
              ТОП-5 РЕКОРДОВ
            </h2>
            {records.length === 0 ? (
              <p className="font-mono2 text-[#7d6bcf] text-xl text-center">Рекордов пока нет</p>
            ) : (
              <ol className="flex flex-col gap-2">
                {records.map((r, i) => (
                  <li
                    key={i}
                    className="flex justify-between font-mono2 text-2xl border-b border-[#2a1f4d] pb-1"
                  >
                    <span className="text-[#ff3df2]">#{i + 1}</span>
                    <span className="text-[#22e3ff]">{r}</span>
                  </li>
                ))}
              </ol>
            )}
            <div className="flex justify-center mt-6">
              <PixelButton onClick={() => setScreen('menu')} color="cyan">
                ← НАЗАД
              </PixelButton>
            </div>
          </div>
        )}

        {/* GAME */}
        {screen === 'game' && (
          <div className="flex flex-col items-center gap-2 animate-fade-in">
            {/* HUD */}
            <div className="w-full max-w-[900px] flex items-center justify-between gap-3 font-pixel text-[9px]">
              <div className="flex items-center gap-2">
                <span className="text-[#ff5470]">HP</span>
                <div className="w-40 h-4 border-2 border-[#ff5470] bg-black/60">
                  <div
                    className="h-full bg-[#ff5470] transition-all"
                    style={{ width: `${((hud?.hp ?? 100) / (hud?.maxHp ?? 100)) * 100}%` }}
                  />
                </div>
                {hud?.buff && <span className="text-[#ffd000]">{hud.buff}</span>}
              </div>
              <span className="text-[#51ff7a]">SCORE {hud?.score ?? 0}</span>
              <span className={hud?.underground ? 'text-[#ff8a3a]' : 'text-[#22e3ff]'}>
                {hud?.bossActive
                  ? 'BOSS!'
                  : hud?.underground
                  ? 'ПОДЗЕМЕЛЬЕ'
                  : `WAVE ${hud?.wave ?? 1}`}
              </span>
              <button onClick={togglePause} className="text-[#ff3df2] hover:scale-110 transition">
                <Icon name="Pause" size={18} />
              </button>
            </div>

            {/* Descent hint */}
            {hud?.canDescend && !hud?.bossActive && (
              <div className="w-full max-w-[900px] font-pixel text-[9px] text-[#9b6bff] animate-flicker text-center">
                ↓ ПОДОЙДИ К ЛЮКУ СПРАВА И НАЖМИ S — СПУСК В ПОДЗЕМЕЛЬЕ
              </div>
            )}

            {/* Boss bar */}
            {hud?.bossActive && (
              <div className="w-full max-w-[900px] flex flex-col gap-1">
                <div className="flex items-center gap-2 font-pixel text-[9px]">
                  <span className="text-[#ff3df2] animate-flicker">BOSS</span>
                  <div className="flex-1 h-5 border-2 border-[#ff3df2] bg-black/60 box-neon-pink">
                    <div
                      className="h-full bg-[#ff3df2] transition-all"
                      style={{ width: `${(hud.bossHp / hud.bossMax) * 100}%` }}
                    />
                  </div>
                  <span className="text-[#ff3df2]">
                    {hud.bossHp}/{hud.bossMax}
                  </span>
                </div>
                {/* Laser charge */}
                <div className="flex items-center gap-2 font-pixel text-[8px]">
                  <span className="text-[#ffd000]">ЛАЗЕР</span>
                  <div className="flex gap-1">
                    {[0, 1, 2, 3, 4].map((i) => (
                      <span
                        key={i}
                        className={`w-4 h-3 border ${
                          (hud.laserCharge ?? 0) > i
                            ? 'bg-[#ff2b2b] border-[#ff2b2b]'
                            : 'border-[#5b1f2a] bg-black/40'
                        }`}
                      />
                    ))}
                  </div>
                  {(hud.laserCharge ?? 0) >= 5 && (
                    <span className="text-[#ff2b2b] animate-flicker">ОПАСНОСТЬ!</span>
                  )}
                </div>
              </div>
            )}

            <div className="relative crt border-2 border-[#22e3ff] box-neon-cyan">
              <canvas
                ref={canvasRef}
                width={GAME_W}
                height={GAME_H}
                className="pixelated block w-full max-w-[900px] h-auto"
              />

              {/* PAUSE overlay */}
              {paused && (
                <div className="absolute inset-0 bg-black/80 flex flex-col items-center justify-center gap-4 z-[60] animate-fade-in">
                  <h2 className="font-pixel text-[#22e3ff] neon-cyan text-2xl">ПАУЗА</h2>
                  <PixelButton onClick={togglePause} color="green" className="w-56">
                    ПРОДОЛЖИТЬ
                  </PixelButton>
                  <PixelButton onClick={quitToMenu} color="pink" className="w-56">
                    В МЕНЮ
                  </PixelButton>
                </div>
              )}
            </div>

            {/* Mobile controls */}
            <div className="flex sm:hidden gap-3 mt-2 select-none">
              <TouchBtn label="◀" onDown={() => gameRef.current?.key('ArrowLeft', true)} onUp={() => gameRef.current?.key('ArrowLeft', false)} />
              <TouchBtn label="▶" onDown={() => gameRef.current?.key('ArrowRight', true)} onUp={() => gameRef.current?.key('ArrowRight', false)} />
              <TouchBtn label="↑" onDown={() => gameRef.current?.jump()} onUp={() => {}} />
              <TouchBtn label="↓" onDown={() => gameRef.current?.key('ArrowDown', true)} onUp={() => gameRef.current?.key('ArrowDown', false)} />
              <TouchBtn label="●" onDown={() => gameRef.current?.key('KeyJ', true)} onUp={() => gameRef.current?.key('KeyJ', false)} />
            </div>
          </div>
        )}

        {/* GAME OVER */}
        {screen === 'gameover' && result && (
          <div className="animate-scale-in max-w-md mx-auto border-2 bg-black/60 p-8 text-center"
            style={{ borderColor: result.status === 'won' ? '#51ff7a' : '#ff3b3b' }}>
            <h2
              className={`font-pixel text-xl mb-4 ${
                result.status === 'won' ? 'text-[#51ff7a] neon-green' : 'text-[#ff3b3b]'
              }`}
            >
              {result.status === 'won' ? 'ПОБЕДА!' : 'GAME OVER'}
            </h2>
            <p className="font-mono2 text-[#22e3ff] text-3xl mb-1">SCORE</p>
            <p className="font-pixel text-[#ffd000] neon-yellow text-2xl mb-6">{result.score}</p>
            <div className="flex flex-col gap-3">
              <PixelButton onClick={startGame} color="green" className="w-full">
                ИГРАТЬ СНОВА
              </PixelButton>
              <PixelButton onClick={() => setScreen('menu')} color="cyan" className="w-full">
                В МЕНЮ
              </PixelButton>
            </div>
          </div>
        )}
      </div>

      {screen !== 'game' && (
        <div className="mt-8 flex items-center gap-2 font-mono2 text-[#5b4d8a] text-lg">
          <span style={{ color: selectedSkin.glow }}>СКИН: {selectedSkin.name}</span>
        </div>
      )}
    </div>
  );
};

const COMMANDER_LINES = [
  'КОМАНДИР: На нас напали!',
  'Дроны-убийцы атакуют сектор...',
  'Узи и N уже близко. Будь начеку!',
  'ПОБЕДА БУДЕТ ЗА НАМИ!',
];

const CommanderIntro = ({ onDone }: { onDone: () => void }) => {
  const [line, setLine] = useState(0);
  const [text, setText] = useState('');

  useEffect(() => {
    const full = COMMANDER_LINES[line];
    let i = 0;
    setText('');
    const typer = setInterval(() => {
      i++;
      setText(full.slice(0, i));
      if (i >= full.length) {
        clearInterval(typer);
        const next = setTimeout(() => {
          if (line < COMMANDER_LINES.length - 1) setLine((l) => l + 1);
          else onDone();
        }, line === COMMANDER_LINES.length - 1 ? 900 : 700);
        return () => clearTimeout(next);
      }
    }, 38);
    return () => clearInterval(typer);
  }, [line, onDone]);

  const isFinal = line === COMMANDER_LINES.length - 1;

  return (
    <div className="animate-fade-in flex flex-col items-center gap-6 py-6">
      {/* Commander avatar */}
      <div className="relative animate-float-slow">
        <div
          className="w-28 h-28 border-4 border-[#22e3ff] box-neon-cyan bg-[#0a1530] flex items-center justify-center"
          style={{ imageRendering: 'pixelated' }}
        >
          <div className="relative w-16 h-16">
            <div className="absolute inset-0 bg-[#3a6b8c]" />
            <div className="absolute top-0 left-0 right-0 h-3 bg-[#1f3d52]" />
            <div className="absolute top-5 left-2 w-3 h-3 bg-[#22e3ff]" />
            <div className="absolute top-5 right-2 w-3 h-3 bg-[#22e3ff]" />
            <div className="absolute bottom-3 left-4 right-4 h-2 bg-[#ffd000]" />
          </div>
        </div>
        <span className="absolute -bottom-3 left-1/2 -translate-x-1/2 font-pixel text-[8px] text-[#22e3ff] bg-black px-2 py-1 whitespace-nowrap">
          КОМАНДИР
        </span>
      </div>

      {/* Speech box */}
      <div className="border-2 border-[#51ff7a] bg-black/70 px-6 py-5 max-w-md min-h-[90px] flex items-center justify-center">
        <p
          className={`font-mono2 text-2xl text-center ${
            isFinal ? 'text-[#ff3df2] neon-pink' : 'text-[#51ff7a] neon-green'
          }`}
        >
          {text}
          <span className="animate-flicker">_</span>
        </p>
      </div>

      <button
        onClick={onDone}
        className="font-pixel text-[10px] text-[#7d6bcf] hover:text-[#22e3ff] transition tracking-wider"
      >
        ПРОПУСТИТЬ ▶
      </button>
    </div>
  );
};

const TouchBtn = ({
  label,
  onDown,
  onUp,
}: {
  label: string;
  onDown: () => void;
  onUp: () => void;
}) => (
  <button
    onTouchStart={(e) => {
      e.preventDefault();
      onDown();
    }}
    onTouchEnd={(e) => {
      e.preventDefault();
      onUp();
    }}
    className="w-14 h-14 border-2 border-[#22e3ff] text-[#22e3ff] font-pixel text-lg bg-black/50 active:bg-[#22e3ff] active:text-black"
  >
    {label}
  </button>
);

export default Index;