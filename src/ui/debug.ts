import { threatBudget } from '../game/waves';
import { applyPurchase, maxTier, refreshPadStates, tierRow } from '../game/state';
import { startNight } from '../game/systems/phase';
import type { Loop } from '../engine/loop';
import type { Sim } from '../game/sim';
import type { View } from '../render/view';

/** Debug overlay and cheats, gated behind `?debug=1`. */
export class DebugTools {
  readonly enabled: boolean;
  private readonly panel: HTMLElement | null = null;

  constructor(
    private readonly sim: Sim,
    private readonly loop: Loop,
    private readonly view: View,
    root: HTMLElement,
  ) {
    this.enabled = new URLSearchParams(location.search).get('debug') === '1';
    if (!this.enabled) return;
    this.panel = document.createElement('div');
    this.panel.className = 'cheats';
    const add = (label: string, fn: () => void): void => {
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.textContent = label;
      btn.addEventListener('click', fn);
      this.panel!.appendChild(btn);
    };
    add('+1000 sugar', () => this.grantSugar(1000));
    add('max all', () => this.maxAll());
    add('kill all', () => this.killAll());
    add('skip to night', () => startNight(this.sim));
    add('invuln', () => {
      this.sim.invulnerable = !this.sim.invulnerable;
    });
    add('slow 0.25x', () => {
      this.loop.timeScale = this.loop.timeScale === 1 ? 0.25 : 1;
    });
    add('step frame', () => {
      this.loop.paused = true;
      this.loop.stepOnce();
    });
    root.appendChild(this.panel);
  }

  grantSugar(amount: number): void {
    const stack = this.sim.state.warden.stack;
    for (let i = 0; i < amount / 5; i++) {
      this.sim.spawnPickup('sugar', stack.anchor.x, stack.anchor.y, 5, 90);
    }
  }

  killAll(): void {
    for (const inv of [...this.sim.state.invaders]) this.sim.killInvader(inv);
  }

  maxAll(): void {
    const st = this.sim.state;
    for (const pad of st.pads) {
      if (pad.kind === 'repair') continue;
      let guard = 0;
      while (pad.targetTier > 0 && pad.targetTier <= maxTier(pad.buildable) && guard++ < 6) {
        pad.paid = pad.cost;
        applyPurchase(st, pad);
      }
    }
    refreshPadStates(st);
    this.sim.markLightingDirty();
  }

  text(): string {
    const sim = this.sim;
    const st = sim.state;
    const stats = this.loop.stats;
    return [
      `fps ${stats.fps.toFixed(0)}  frame ${stats.frameMs.toFixed(1)}ms  sim ${stats.simMs.toFixed(2)}ms`,
      `phase ${st.phase} ${(st.time - st.phaseStartedAt).toFixed(1)}s  night ${st.night}`,
      `inv ${st.invaders.length}  maj ${st.majors.length}  pick ${st.pickups.length}`,
      `proj ${st.projectiles.length}  part ${sim.particles.size}  pools ${this.view.lightPoolCount}`,
      `threat ${threatBudget(st.night)}  queued ${st.spawnQueue.length - st.spawnCursor}`,
      `sugar/night ${Math.round(st.sugarEarnedThisNight)}  brood ${tierRow('broodChamber', Math.max(1, broodTierOf(sim)))?.hp ?? 0}hp`,
      `quality ${sim.quality.toFixed(2)}  shake ${sim.shake.toFixed(1)}`,
    ].join('\n');
  }
}

function broodTierOf(sim: Sim): number {
  for (const s of sim.state.structures) if (s.kind === 'broodChamber') return s.tier;
  return 1;
}
