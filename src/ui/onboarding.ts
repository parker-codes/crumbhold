import type { SiteId } from '../game/gallery';
import { tierOf } from '../game/state';
import type { Sim } from '../game/sim';

/**
 * Diegetic onboarding: a dotted pheromone trail from the Warden to the next
 * suggested pad, shown once per new mechanic and gone for good once the player
 * does it. No modal, no popup, no blocking text.
 */
interface Lesson {
  id: string;
  site: SiteId;
  /** True once the player has done the thing this lesson points at. */
  done(sim: Sim): boolean;
  /** True while the lesson is worth showing at all. */
  active(sim: Sim): boolean;
}

const LESSONS: Lesson[] = [
  {
    id: 'barricade',
    site: 'barricadeN',
    done: (sim) => tierOf(sim.state, 'barricadeN') > 0,
    active: (sim) => sim.state.night === 1 && sim.state.phase === 'day',
  },
  {
    id: 'spitter',
    site: 'spitter1',
    done: (sim) => tierOf(sim.state, 'spitter1') > 0,
    active: (sim) => sim.state.night <= 2 && sim.state.phase === 'day',
  },
  {
    id: 'aphids',
    site: 'aphidA',
    // Learned the moment she is carrying honeydew at all.
    done: (sim) => sim.state.warden.stack.honeydew > 0 || sim.state.stats.sugarConverted > 0,
    active: (sim) => sim.state.night <= 2 && sim.state.phase === 'day',
  },
  {
    id: 'vat',
    site: 'nectarVat',
    done: (sim) => sim.state.stats.sugarConverted > 0,
    active: (sim) => sim.state.warden.stack.honeydew > 0 && sim.state.phase === 'day',
  },
  {
    id: 'mortar',
    site: 'mortar',
    done: (sim) => sim.mortarUsed,
    active: (sim) => {
      const brood = sim.state.structures.find((s) => s.kind === 'broodChamber');
      return sim.state.phase === 'day' && !!brood && brood.hp < brood.maxHp * 0.8;
    },
  },
];

const DOT_COUNT = 9;

export class Onboarding {
  private readonly dots: HTMLElement[] = [];
  private readonly learned = new Set<string>();
  private readonly projected = { x: 0, y: 0 };

  constructor(layer: HTMLElement) {
    for (let i = 0; i < DOT_COUNT; i++) {
      const dot = document.createElement('div');
      dot.className = 'trailhint';
      dot.style.display = 'none';
      layer.appendChild(dot);
      this.dots.push(dot);
    }
  }

  /** Lessons already satisfied at load, so a resumed run shows no trails. */
  seed(sim: Sim): void {
    for (const lesson of LESSONS) {
      if (lesson.done(sim)) this.learned.add(lesson.id);
    }
  }

  update(sim: Sim, project: (x: number, y: number, z: number, out: { x: number; y: number }) => boolean, time: number): void {
    const lesson = this.pick(sim);
    if (!lesson) {
      for (const dot of this.dots) dot.style.display = 'none';
      return;
    }
    const pad = sim.state.pads.find((p) => p.id === lesson.site);
    if (!pad) return;
    const w = sim.state.warden.pos;
    for (let i = 0; i < this.dots.length; i++) {
      // The trail crawls toward the pad, which reads as a scent being laid.
      const t = ((i + 1) / (DOT_COUNT + 1) + time * 0.35) % 1;
      const x = w.x + (pad.pos.x - w.x) * t;
      const y = w.y + (pad.pos.y - w.y) * t;
      const dot = this.dots[i];
      if (!project(x, y, 8, this.projected)) {
        dot.style.display = 'none';
        continue;
      }
      dot.style.display = 'block';
      dot.style.opacity = String(0.25 + (1 - t) * 0.6);
      dot.style.transform = `translate(${this.projected.x}px, ${this.projected.y}px)`;
    }
  }

  private pick(sim: Sim): Lesson | null {
    for (const lesson of LESSONS) {
      if (this.learned.has(lesson.id)) continue;
      if (lesson.done(sim)) {
        this.learned.add(lesson.id);
        continue;
      }
      if (lesson.active(sim)) return lesson;
    }
    return null;
  }
}
