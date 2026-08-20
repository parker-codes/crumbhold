import { COMBAT } from '../balance';
import { tierOf } from '../state';
import { readyEarly } from './phase';
import type { Sim } from '../sim';

export type ActionKind = 'trail' | 'drum' | 'dismount' | 'ready' | 'none';

/**
 * One context-sensitive action button. Priority when several contexts are live:
 * Trail > Drum > Ready (section 6).
 */
export function currentAction(sim: Sim): ActionKind {
  const st = sim.state;
  if (st.warden.knockedUntil > st.time) return 'none';
  if (st.phase === 'night' && tierOf(st, 'galleryA') + tierOf(st, 'galleryB') > 0) {
    return 'trail';
  }
  if (st.warden.mounted) return 'dismount';
  if (st.beetle.owned) return 'drum';
  if (st.phase === 'day') return 'ready';
  return 'none';
}

export function actionLabel(kind: ActionKind): string {
  switch (kind) {
    case 'trail': return 'Trail';
    case 'drum': return 'Drum';
    case 'dismount': return 'Down';
    case 'ready': return 'Ready';
    default: return '';
  }
}

/** Remaining cooldown fraction for the radial wipe, 0 when ready. */
export function actionCooldown(sim: Sim, kind: ActionKind): number {
  const st = sim.state;
  if (kind !== 'trail') return 0;
  const remaining = st.trailCooldownUntil - st.time;
  return remaining > 0 ? remaining / COMBAT.trailCooldown : 0;
}

export function actions(sim: Sim, _dt: number): void {
  const st = sim.state;
  if (!sim.input.actionPressed) return;
  const kind = currentAction(sim);
  switch (kind) {
    case 'trail': {
      if (st.trailCooldownUntil > st.time) return;
      st.trailUntil = st.time + COMBAT.trailDuration;
      st.trailCooldownUntil = st.time + COMBAT.trailCooldown;
      for (const m of st.majors) m.trailedUntil = st.trailUntil;
      sim.sound('trail');
      break;
    }
    case 'drum': {
      // Antennal drumming: the beetle scuttles over and she mounts on contact.
      st.beetle.summoned = true;
      sim.sound('drum');
      break;
    }
    case 'dismount': {
      st.warden.mounted = false;
      st.beetle.summoned = false;
      st.beetle.vel.x = 0;
      st.beetle.vel.y = 0;
      sim.sound('mount', -6);
      break;
    }
    case 'ready': {
      readyEarly(sim);
      break;
    }
    default:
      break;
  }
}
