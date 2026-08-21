import { inject as injectAnalytics } from '@vercel/analytics';

import { AudioBus } from './engine/audio';
import { setHapticsEnabled } from './engine/haptics';
import { Input } from './engine/input';
import { attachInputKind } from './engine/inputKind';
import { Loop } from './engine/loop';
import { Viewport, requestWakeLock } from './engine/viewport';
import { CAPS } from './game/balance';
import { Sim } from './game/sim';
import { step } from './game/step';
import { readyEarly } from './game/systems/phase';
import { Tutorial } from './game/tutorial';
import { loadSave, serializeRun, writeSave } from './game/save';
import type { Phase, SaveFile } from './game/types';
import { View } from './render/view';
import { DebugTools } from './ui/debug';
import { Hud } from './ui/hud';
import { Overlays } from './ui/overlays';

// Vercel Web Analytics — visitor counts only. Its script is served from
// /_vercel/insights on the deployment, so it is inert anywhere but Vercel.
injectAnalytics();

const canvas = document.getElementById('stage') as HTMLCanvasElement;
const hudRoot = document.getElementById('hud') as HTMLElement;
const overlayRoot = document.getElementById('overlay') as HTMLElement;

const save: SaveFile = loadSave();
const audio = new AudioBus();
audio.enabled = save.settings.audio;
audio.music = save.settings.music;

// Publishes `data-input` on the root element and keeps it current, so the
// interface can drop the key hints the moment a thumb arrives.
attachInputKind();

const sim = new Sim(newSeed(), audio);
sim.settings = save.settings;
sim.reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

setHapticsEnabled(save.settings.haptics);

const view = new View(canvas, sim);
const hud = new Hud(hudRoot);
hud.hapticsOn = save.settings.haptics;
const input = new Input(canvas);
// The systems read this object every step. Without the hand-off nothing the
// player does, on a thumb or on a keyboard, ever reaches the Warden.
sim.input = input.state;

let started = false;
let wakeLock: WakeLockSentinel | null = null;

const loop = new Loop({
  step: (dt) => {
    input.beginStep();
    step(sim, dt);
  },
  render: (alpha, frameDt) => {
    view.render(sim, alpha, frameDt);
    hud.update(sim, view, frameDt);
    audio.tickAmbience(frameDt);
    degrade();
    if (debug.enabled) hud.setDebugText(debug.text());
  },
});

const overlays = new Overlays(
  overlayRoot,
  {
    onStart: () => startRun(newSeed()),
    onTutorial: () => startTutorial(),
    onResume: () => resume(),
    onRetry: () => startRun(newSeed()),
    onContinueEndless: () => {
      sim.state.endless = true;
      sim.setPhase('resolve', 0);
      overlays.hide();
      loop.paused = false;
      audio.setMusic('day');
      // Roll straight into the next day rather than replaying the resolve beat.
      sim.state.phaseDuration = 0;
    },
    onSettingChange: (patch) => {
      Object.assign(sim.settings, patch);
      save.settings = sim.settings;
      if (patch.audio !== undefined) audio.setEnabled(patch.audio);
      if (patch.music !== undefined) {
        audio.setMusicEnabled(patch.music, sim.state.phase === 'night' ? 'night' : 'day');
      }
      if (patch.haptics !== undefined) {
        setHapticsEnabled(patch.haptics);
        hud.hapticsOn = patch.haptics;
      }
      if (patch.hudScale !== undefined) {
        document.documentElement.style.setProperty('--hud-scale', String(patch.hudScale));
      }
      persist();
    },
  },
  sim.settings,
);

const debug = new DebugTools(sim, loop, view, hudRoot);
hud.setDebugVisible(debug.enabled);
if (debug.enabled) {
  // Handle for the debug console and the replay tooling in section 20.
  (window as unknown as Record<string, unknown>).crumbhold = { sim, loop, view, debug };
}

sim.hooks = {
  onPhaseChange: (prev, next) => onPhaseChange(prev, next),
  onToast: (text, seconds) => hud.showToast(text, seconds),
  onStamp: (text) => hud.showStamp(text),
  onLightingDirty: () => {},
};

hud.onAction = () => {
  audio.unlock();
  input.queueAction();
};
hud.onPause = () => pause();
hud.onEndDay = () => {
  audio.unlock();
  readyEarly(sim);
};
hud.onTutorialNext = () => {
  sim.tutorial?.advance();
  if (sim.tutorial?.finished) endTutorial();
};
hud.onTutorialQuit = () => endTutorial();

input.onFirstPointer = () => audio.unlock();
input.onPauseKey = () => {
  if (overlays.shown !== 'pause') {
    pause();
    return;
  }
  // Escape leaves an open panel before it leaves the pause sheet.
  if (!overlays.back()) resume();
};
input.onDebugKey = (code) => {
  if (!debug.enabled) return;
  if (code === 'KeyG') debug.grantSugar(1000);
  if (code === 'KeyK') debug.killAll();
  if (code === 'KeyM') debug.maxAll();
};

const viewport = new Viewport(canvas, (size) => view.resize(size));
viewport.attach();
input.attach();

document.documentElement.style.setProperty('--hud-scale', String(sim.settings.hudScale));

overlays.setHasSavedRun(save.activeRun !== null);
overlays.show('title', null);
sim.state.phase = 'title';
loop.paused = true;
loop.start();

// ---------------------------------------------------------------- run control

function startRun(seed: number): void {
  audio.unlock();
  sim.reset(seed);
  sim.state.phase = 'day';
  sim.state.phaseStartedAt = 0;
  save.runs++;
  save.activeRun = null;
  persist();
  overlays.hide();
  loop.paused = false;
  loop.resetClock();
  started = true;
  hud.seedOnboarding(sim);
  audio.setMusic('day');
  acquireWakeLock();
}

/**
 * A guided run in the real gallery. It never touches the saved run: `persist`
 * skips while a tutorial is live, so a player can take the tutorial mid-campaign
 * and come back to exactly where they were.
 */
function startTutorial(): void {
  audio.unlock();
  sim.reset(newSeed());
  sim.tutorial = new Tutorial();
  sim.state.phase = 'day';
  sim.state.phaseStartedAt = 0;
  overlays.hide();
  loop.paused = false;
  loop.resetClock();
  started = true;
  audio.setMusic('day');
  acquireWakeLock();
}

/** Back to the title, with the saved run untouched and the cheat switch off. */
function endTutorial(): void {
  sim.tutorial = null;
  sim.invulnerable = false;
  started = false;
  loop.paused = true;
  canvas.style.filter = '';
  hud.clearToast();
  audio.setMusic('off');
  overlays.setHasSavedRun(save.activeRun !== null);
  overlays.show('title', null);
  sim.state.phase = 'title';
  releaseWakeLock();
}

function resume(): void {
  audio.unlock();
  if (!started && save.activeRun) {
    sim.adopt(save.activeRun);
    started = true;
  }
  if (sim.state.phase === 'title') sim.state.phase = 'day';
  hud.seedOnboarding(sim);
  overlays.hide();
  loop.paused = false;
  loop.resetClock();
  audio.resume();
  audio.setMusic(sim.state.phase === 'night' ? 'night' : 'day');
  acquireWakeLock();
}

function pause(): void {
  if (!started || overlays.visible) return;
  loop.paused = true;
  overlays.show('pause', sim);
  audio.suspend();
  input.releaseAll();
  persist();
}

function onPhaseChange(prev: Phase, next: Phase): void {
  void prev;
  if (next === 'win' || next === 'lose') {
    hud.clearToast();
    // Freeze and desaturate the gallery behind the summary.
    canvas.style.filter = 'saturate(0.25)';
    overlays.show(next, sim);
    save.bestNight = Math.max(save.bestNight, sim.state.stats.nightsHeld);
    save.royalJelly += sim.state.stats.nightsHeld + (next === 'win' ? 3 : 0);
    save.activeRun = null;
    persist();
    releaseWakeLock();
    return;
  }
  canvas.style.filter = '';
  persist();
}

function persist(): void {
  const st = sim.state;
  // A tutorial must never overwrite a real run.
  if (sim.tutorial) return;
  const live = started && st.phase !== 'win' && st.phase !== 'lose' && st.phase !== 'title';
  save.activeRun = live ? serializeRun(st) : null;
  save.settings = sim.settings;
  writeSave(save);
}

// ------------------------------------------------------- lifecycle and health

/**
 * Degradation ladder: if the rolling frame average is slow, halve particle
 * detail. Never drop the sim rate (spec section 5).
 */
function degrade(): void {
  const share = loop.slowFrameShare(CAPS.degradeFrameMs);
  // Hysteresis on the share of slow frames, so one hitch cannot drop detail and
  // the level does not flap frame to frame.
  if (sim.quality === 1 && share > 0.5) sim.quality = 0.5;
  else if (sim.quality < 1 && share < 0.2) sim.quality = 1;
}

document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'hidden') {
    if (started && !overlays.visible) pause();
    else persist();
    audio.suspend();
  }
});

window.addEventListener('blur', () => {
  if (started && !overlays.visible) pause();
});

window.addEventListener('pagehide', () => persist());

async function acquireWakeLock(): Promise<void> {
  if (wakeLock) return;
  wakeLock = await requestWakeLock();
}

function releaseWakeLock(): void {
  void wakeLock?.release().catch(() => {});
  wakeLock = null;
}

function newSeed(): number {
  return (Date.now() ^ (Math.random() * 0xffffffff)) >>> 0;
}

if ('serviceWorker' in navigator && import.meta.env.PROD) {
  window.addEventListener('load', () => {
    // The build id must ride on the URL; the browser reinstalls the worker only
    // when the script it fetches differs, and public/ files carry no build stamp.
    void navigator.serviceWorker.register(`./sw.js?v=${__BUILD_ID__}`).catch(() => {});
  });
}
