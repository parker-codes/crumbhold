import { COMBAT } from '../balance';
import { tierOf } from '../state';
import type { Sim } from '../sim';

export type ActionKind = 'trail' | 'drum' | 'dismount' | 'none';

/**
 * One context-sensitive action button. Priority when several contexts are live:
 * Rally > Mount > Dismount.
 *
 * Ending the day is deliberately NOT in this list. Under the section 6 priority
 * it sat below Drum, which meant that buying a Paddock permanently removed the
 * early-end bonus from the run: on foot in daylight the button was always Drum,
 * so Ready could never come up again. It has its own control beside Pause now,
 * where it is always in the same place and always reachable.
 */
export function currentAction(sim: Sim): ActionKind {
  const st = sim.state;
  if (st.warden.knockedUntil > st.time) return 'none';
  if (st.phase === 'night' && tierOf(st, 'galleryA') + tierOf(st, 'galleryB') > 0) {
    return 'trail';
  }
  if (st.warden.mounted) return 'dismount';
  if (st.beetle.owned) return 'drum';
  return 'none';
}

/** True while ending the day early is a thing the player can actually do. */
export function canEndDay(sim: Sim): boolean {
  const st = sim.state;
  if (st.phase !== 'day' || st.warden.knockedUntil > st.time) return false;
  // A guided tutorial parks the day clock on purpose, so the control appears
  // only on the step that teaches it. Otherwise one tap would skip the lesson.
  return !sim.tutorial || sim.tutorial.step.ownsClock === true;
}

/**
 * Say what the button does, not what the fiction calls it. "Trail" and "Drum"
 * name the pheromone and the signal; the player needs to know they summon the
 * majors and the beetle. "Down" could mean anything.
 */
export function actionLabel(kind: ActionKind): string {
  switch (kind) {
    case 'trail': return 'Rally';
    case 'drum': return 'Mount';
    case 'dismount': return 'Dismount';
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
    default:
      break;
  }
}
