import { haptic } from '../engine/haptics';
import { STACK, TIME } from '../game/balance';
import { capacityFor, tierOf } from '../game/state';
import { actionCooldown, actionLabel, canEndDay, currentAction } from '../game/systems/actions';
import { broodHealth } from '../game/systems/phase';
import { currentSubWave } from '../game/systems/spawn';
import type { Sim } from '../game/sim';
import type { Pad } from '../game/types';
import type { View } from '../render/view';
import { Onboarding } from './onboarding';

// A tall pale prism with a gold edge, matching the crystal on the floor.
const SUGAR_GLYPH = `<svg class="chip__glyph" viewBox="0 0 24 24" aria-hidden="true"><path d="M12 1.5 19 12l-7 10.5L5 12z" fill="#eef1f2" stroke="#d9a63f" stroke-width="2.2" stroke-linejoin="round"/></svg>`;
const DROP_GLYPH = `<svg class="chip__glyph" viewBox="0 0 24 24" aria-hidden="true"><path d="M12 2c4 6 6.5 8.6 6.5 12A6.5 6.5 0 0 1 12 20.5 6.5 6.5 0 0 1 5.5 14C5.5 10.6 8 8 12 2z" fill="#ffd98a" stroke="#22212b" stroke-width="2.2"/></svg>`;
const LEAF_GLYPH = `<svg class="chip__glyph" viewBox="0 0 24 24" aria-hidden="true"><path d="M3 21C3 10 10 3 21 3c0 11-7 18-18 18z" fill="#8fc95a" stroke="#22212b" stroke-width="2.2" stroke-linejoin="round"/></svg>`;

/**
 * Persistent HUD. Everything that can live on the floor lives on the floor, so
 * this stays under the 14 percent screen-area budget: a band, two counters, one
 * bar, and two buttons.
 */
export class Hud {
  private readonly root: HTMLElement;
  private readonly band: SurfaceBand;
  private readonly sugarChip: HTMLElement;
  private readonly sugarValue: HTMLElement;
  private readonly sugarCap: HTMLElement;
  private readonly otherChip: HTMLElement;
  private readonly nightBar: HTMLElement;
  private readonly broodFill: HTMLElement;
  private readonly wavePips: HTMLElement;
  private readonly actionBtn: HTMLButtonElement;
  private readonly actionText: HTMLElement;
  private readonly actionWipe: HTMLElement;
  private readonly pauseBtn: HTMLButtonElement;
  private readonly endDayBtn: HTMLButtonElement;
  private readonly stick: HTMLElement;
  private readonly stickKnob: HTMLElement;
  private readonly labelLayer: HTMLElement;
  private readonly toast: HTMLElement;
  private readonly stamp: HTMLElement;
  private readonly debug: HTMLElement;
  private readonly tally: HTMLElement;
  private readonly onboarding: Onboarding;
  private readonly tutorialCard: HTMLElement;
  private readonly tutorialChapter: HTMLElement;
  private readonly tutorialCount: HTMLElement;
  private readonly tutorialText: HTMLElement;
  private readonly tutorialDetail: HTMLElement;
  private readonly tutorialNext: HTMLButtonElement;
  private readonly tutorialSkip: HTMLButtonElement;
  private lastTutorialStep = -1;
  private readonly damageNodes: HTMLElement[] = [];
  private readonly stackBadges: HTMLElement[] = [];

  private readonly labels = new Map<string, HTMLElement>();
  private readonly chevrons: HTMLElement[] = [];
  private readonly threats: { x: number; y: number; tier: number }[] = [];
  private readonly projected = { x: 0, y: 0 };

  private lastSugar = -1;
  private lastOther = '';
  private lastPips = -1;
  private toastTimer = 0;
  private stampTimer = 0;

  /** Mirrors the player's setting, read on the button press path. */
  hapticsOn = true;

  onAction: (() => void) | null = null;
  onPause: (() => void) | null = null;
  /** Advance a read-and-continue step, or step past one that is stuck. */
  onTutorialNext: (() => void) | null = null;
  onTutorialQuit: (() => void) | null = null;
  onEndDay: (() => void) | null = null;

  constructor(root: HTMLElement) {
    root.innerHTML = '';
    this.root = root;

    this.band = new SurfaceBand();
    root.appendChild(this.band.element);

    const counters = el('div', 'counters');
    this.sugarChip = el('div', 'chip chip--sugar');
    this.sugarChip.innerHTML = `${SUGAR_GLYPH}<span class="chip__value">0</span><span class="chip__cap"></span>`;
    this.sugarValue = this.sugarChip.querySelector('.chip__value') as HTMLElement;
    this.sugarCap = this.sugarChip.querySelector('.chip__cap') as HTMLElement;
    this.otherChip = el('div', 'chip chip--honeydew hidden');
    counters.append(this.sugarChip, this.otherChip);
    root.appendChild(counters);

    this.nightBar = el('div', 'nightbar');
    const broodBar = el('div', 'broodbar');
    this.broodFill = el('div', 'broodbar__fill');
    broodBar.appendChild(this.broodFill);
    this.wavePips = el('div', 'wavepips');
    this.nightBar.append(broodBar, this.wavePips);
    root.appendChild(this.nightBar);

    this.pauseBtn = el('button', 'btn btn--pause') as HTMLButtonElement;
    this.pauseBtn.type = 'button';
    this.pauseBtn.setAttribute('aria-label', 'Pause');
    this.pauseBtn.innerHTML = `<svg width="18" height="18" viewBox="0 0 18 18"><rect x="3" y="2" width="4.4" height="14" rx="1.4" fill="#fff"/><rect x="10.6" y="2" width="4.4" height="14" rx="1.4" fill="#fff"/></svg>`;
    this.pauseBtn.addEventListener('pointerdown', (e) => {
      e.preventDefault();
      this.onPause?.();
    });
    root.appendChild(this.pauseBtn);

    // Ending the day gets its own control beside Pause, so it is always in the
    // same place and never competes with Rally or Mount for the one button.
    this.endDayBtn = el('button', 'btn btn--endday') as HTMLButtonElement;
    this.endDayBtn.type = 'button';
    this.endDayBtn.innerHTML = '<span>End day</span>';
    this.endDayBtn.addEventListener('pointerdown', (e) => {
      e.preventDefault();
      this.onEndDay?.();
    });
    root.appendChild(this.endDayBtn);

    this.actionBtn = el('button', 'btn btn--action') as HTMLButtonElement;
    this.actionBtn.type = 'button';
    this.actionWipe = el('div', 'wipe');
    this.actionText = el('span', '');
    this.actionBtn.append(this.actionWipe, this.actionText);
    this.actionBtn.addEventListener('pointerdown', (e) => {
      e.preventDefault();
      this.actionBtn.classList.add('press');
      // The one control a thumb lands on without looking, so it answers back.
      if (this.hapticsOn) haptic('tap');
      this.onAction?.();
    });
    const release = (): void => this.actionBtn.classList.remove('press');
    this.actionBtn.addEventListener('pointerup', release);
    this.actionBtn.addEventListener('pointercancel', release);
    root.appendChild(this.actionBtn);

    this.stick = el('div', 'stick');
    this.stickKnob = el('div', 'stick__knob');
    this.stick.appendChild(this.stickKnob);
    root.appendChild(this.stick);

    this.labelLayer = el('div', 'labels');
    root.appendChild(this.labelLayer);

    this.tally = el('div', 'tally');
    root.appendChild(this.tally);

    this.toast = el('div', 'toast');
    root.appendChild(this.toast);
    this.stamp = el('div', 'stamp');
    root.appendChild(this.stamp);
    this.debug = el('div', 'debug');
    this.debug.style.display = 'none';
    root.appendChild(this.debug);

    for (let i = 0; i < 12; i++) {
      const chevron = el('div', 'lbl lbl--chevron');
      chevron.textContent = '▲';
      chevron.style.display = 'none';
      this.labelLayer.appendChild(chevron);
      this.chevrons.push(chevron);
    }
    for (let i = 0; i < 24; i++) {
      const node = el('div', 'dmg');
      node.style.display = 'none';
      this.labelLayer.appendChild(node);
      this.damageNodes.push(node);
    }
    for (let i = 0; i < 2; i++) {
      const badge = el('div', 'lbl lbl--cost lbl--chevron');
      badge.style.display = 'none';
      this.labelLayer.appendChild(badge);
      this.stackBadges.push(badge);
    }
    this.onboarding = new Onboarding(this.labelLayer);

    // The tutorial card. Bottom centre, between the thumb zones, and never
    // blocking input: only its two buttons take pointer events.
    this.tutorialCard = el('div', 'tut');
    const head = el('div', 'tut__head');
    this.tutorialChapter = el('span', 'tut__chapter');
    this.tutorialCount = el('span', 'tut__count');
    head.append(this.tutorialChapter, this.tutorialCount);
    this.tutorialText = el('p', 'tut__text');
    this.tutorialDetail = el('p', 'tut__detail');
    const row = el('div', 'tut__row');
    this.tutorialSkip = el('button', 'tut__btn') as HTMLButtonElement;
    this.tutorialSkip.type = 'button';
    this.tutorialSkip.textContent = 'Quit tutorial';
    this.tutorialSkip.addEventListener('click', () => this.onTutorialQuit?.());
    this.tutorialNext = el('button', 'tut__btn tut__btn--go') as HTMLButtonElement;
    this.tutorialNext.type = 'button';
    this.tutorialNext.addEventListener('click', () => this.onTutorialNext?.());
    row.append(this.tutorialSkip, this.tutorialNext);
    this.tutorialCard.append(head, this.tutorialText, this.tutorialDetail, row);
    root.appendChild(this.tutorialCard);
  }

  /** Suppresses trail hints a resumed run has already earned. */
  seedOnboarding(sim: Sim): void {
    this.onboarding.seed(sim);
  }

  /** Clears any live toast, so an overlay never opens with text over its button. */
  clearToast(): void {
    this.toastTimer = 0;
    this.toast.classList.remove('on');
  }

  showToast(text: string, seconds: number): void {
    this.toast.textContent = text;
    this.toast.classList.add('on');
    this.toastTimer = seconds;
  }

  showStamp(text: string): void {
    this.stamp.textContent = text;
    this.stamp.classList.remove('on');
    // Force a reflow so the animation restarts on a repeat stamp.
    void this.stamp.offsetWidth;
    this.stamp.classList.add('on');
    this.stampTimer = 1.6;
  }

  setDebugVisible(on: boolean): void {
    this.debug.style.display = on ? 'block' : 'none';
  }

  setDebugText(text: string): void {
    this.debug.textContent = text;
  }

  update(sim: Sim, view: View, dt: number): void {
    if (this.toastTimer > 0) {
      this.toastTimer -= dt;
      if (this.toastTimer <= 0) this.toast.classList.remove('on');
    }
    if (this.stampTimer > 0) this.stampTimer -= dt;

    this.band.update(sim);
    this.updateCounters(sim);
    this.updateNightBar(sim);
    this.updateTally(sim);
    this.updateAction(sim);
    this.updateStick(sim);
    this.updateLabels(sim, view);
    this.updateChevrons(sim, view);
    this.updateDamageNumbers(sim, view);
    this.updateStackBadges(view);
    this.updateTutorial(sim);
    this.onboarding.update(
      sim,
      (x, y, z, out) => view.stage.project(x, y, z, out),
      sim.state.time,
    );
  }

  /**
   * The tutorial card, and the trail override that points at the current step's
   * target. Only rebuilt when the step changes, so this costs nothing per frame.
   */
  private updateTutorial(sim: Sim): void {
    const run = sim.tutorial;
    const show = !!run && !run.finished;
    this.tutorialCard.classList.toggle('on', show);
    // Lifts the toast clear of the card, which owns the bottom of the screen.
    this.root.classList.toggle('hud--tutorial', show);
    // The card sits over the drag zone on a phone, so it steps out of the way
    // the moment a thumb goes down rather than hiding the joystick under itself.
    this.tutorialCard.classList.toggle('dim', sim.input.stick.active);
    this.onboarding.muted = show;
    if (!run || !show) {
      this.onboarding.override = null;
      this.lastTutorialStep = -1;
      return;
    }
    this.onboarding.override = run.trail(sim);
    if (run.index === this.lastTutorialStep) return;
    this.lastTutorialStep = run.index;
    const step = run.step;
    this.tutorialChapter.textContent = step.chapter;
    this.tutorialCount.textContent = `${run.index + 1} / ${run.total}`;
    this.tutorialText.textContent = step.instruction;
    this.tutorialDetail.textContent =
      typeof step.detail === 'function' ? step.detail() : step.detail;
    // A step that waits on the player offers a way past it; one that only needs
    // reading offers the way forward.
    const waiting = !!step.done;
    this.tutorialNext.textContent = waiting ? 'Skip step' : 'Next';
    this.tutorialNext.classList.toggle('tut__btn--go', !waiting);
  }

  /**
   * The resolve tally. Spoilage reduction is its own line, because the point is
   * that the number the player sees is the number they get.
   */
  private updateTally(sim: Sim): void {
    const st = sim.state;
    const show = st.phase === 'resolve' && st.tally !== null;
    this.tally.classList.toggle('on', show);
    if (!show || !st.tally) return;
    const key = `${st.night}:${st.tally.total}`;
    if (this.tally.dataset.key === key) return;
    this.tally.dataset.key = key;
    const t = st.tally;
    const lines: string[] = [
      line('Swept up', `${Math.round(t.collected)}`),
    ];
    if (t.hoardMultiplier > 1) {
      lines.push(line('Spoilage saved', `+${Math.round((t.hoardMultiplier - 1) * 100)}%`));
    }
    if (t.earlyBonus > 0) {
      lines.push(line('Ready early', `+${Math.round(t.earlyBonus * 100)}%`));
    }
    if (t.broodBonus > 0) {
      lines.push(line('Royal glowcaps', `+${t.broodBonus}`));
    }
    lines.push(line('Kept', `${t.total}`, 'tally__line--total'));
    this.tally.innerHTML = lines.join('');
  }

  /**
   * A column renders ten items at most; past that a count badge carries the
   * real number, because twenty five crystals is noise and costs fill rate.
   */
  private updateStackBadges(view: View): void {
    for (let i = 0; i < this.stackBadges.length; i++) {
      const badge = this.stackBadges[i];
      const top = view.columnTops[i];
      if (top.count <= STACK.maxColumnItems) {
        badge.style.display = 'none';
        continue;
      }
      if (!view.stage.project(top.x, top.y, top.z, this.projected)) {
        badge.style.display = 'none';
        continue;
      }
      badge.style.display = 'block';
      badge.textContent = `x${top.count}`;
      badge.style.transform = `translate(${this.projected.x}px, ${this.projected.y}px) translate(-50%, -50%)`;
    }
  }

  /** Optional floating damage numbers, off by default. */
  private updateDamageNumbers(sim: Sim, view: View): void {
    const pool = sim.damageNumbers;
    for (let i = 0; i < this.damageNodes.length; i++) {
      const node = this.damageNodes[i];
      if (i >= pool.size || !sim.settings.damageNumbers) {
        node.style.display = 'none';
        continue;
      }
      const d = pool.items[i];
      if (!view.stage.project(d.x, d.y, d.z, this.projected)) {
        node.style.display = 'none';
        continue;
      }
      node.style.display = 'block';
      node.className = `dmg ${d.friendly ? 'dmg--foe' : 'dmg--friendly'}`;
      node.style.opacity = String(Math.min(1, d.life * 2));
      node.textContent = String(d.value);
      node.style.transform = `translate(${this.projected.x}px, ${this.projected.y}px) translate(-50%, -50%)`;
    }
  }

  private updateCounters(sim: Sim): void {
    const st = sim.state;
    const stack = st.warden.stack;
    const sugar = Math.floor(stack.sugar);
    const cap = capacityFor(st, 'sugar');
    if (sugar !== this.lastSugar) {
      this.lastSugar = sugar;
      this.sugarValue.textContent = String(sugar);
      // The cap suffix only appears above 80 percent, where it starts to matter.
      this.sugarCap.textContent = sugar >= cap * 0.8 ? `/${cap}` : '';
    }
    if (stack.fullFlash > 0) this.sugarChip.classList.add('chip--full');
    else this.sugarChip.classList.remove('chip--full');

    const other = stack.lastNonSugar;
    const amount = other ? Math.floor(stack[other]) : 0;
    const key = other && amount > 0 ? `${other}:${amount}` : '';
    if (key !== this.lastOther) {
      this.lastOther = key;
      if (!key || !other) {
        this.otherChip.className = 'chip hidden';
      } else {
        const glyph = other === 'honeydew' ? DROP_GLYPH : LEAF_GLYPH;
        this.otherChip.className = `chip chip--${other}`;
        this.otherChip.innerHTML =
          `${glyph}<span class="chip__value">${amount}</span>` +
          `<span class="chip__cap">/${capacityFor(st, other)}</span>`;
      }
    }
  }

  private updateNightBar(sim: Sim): void {
    const st = sim.state;
    const night = st.phase === 'night';
    this.nightBar.classList.toggle('on', night);
    if (!night) return;
    const brood = broodHealth(sim);
    const fraction = brood.hp / brood.maxHp;
    this.broodFill.style.width = `${Math.max(0, fraction) * 100}%`;
    this.broodFill.className = `broodbar__fill${fraction < 0.3 ? ' crit' : fraction < 0.65 ? ' hurt' : ''}`;

    const total = st.subWaveCount;
    const current = currentSubWave(sim);
    if (current !== this.lastPips) {
      this.lastPips = current;
      let html = '';
      for (let i = 0; i < total; i++) {
        html += `<div class="pip${i < current ? ' done' : ''}"></div>`;
      }
      html += `<span>Wave ${Math.max(1, current)} / ${total}</span>`;
      this.wavePips.innerHTML = html;
    }
  }

  private updateAction(sim: Sim): void {
    const kind = currentAction(sim);
    const label = actionLabel(kind);
    if (this.actionText.textContent !== label) this.actionText.textContent = label;
    const cooldown = actionCooldown(sim, kind);
    // With nothing to offer the button carries no label, and an empty disabled
    // circle reads as a bug rather than as an absence.
    this.actionBtn.classList.toggle('hidden', kind === 'none');
    this.actionBtn.disabled = kind === 'none' || cooldown > 0;
    this.actionWipe.style.setProperty('--wipe', `${cooldown}turn`);

    const canEnd = canEndDay(sim);
    this.endDayBtn.classList.toggle('hidden', !canEnd);
    // The tutorial asks for this control by name, so it says which one it means.
    this.endDayBtn.classList.toggle('nudge', canEnd && sim.tutorial?.step.ownsClock === true);
  }

  private updateStick(sim: Sim): void {
    const s = sim.input.stick;
    this.stick.classList.toggle('on', s.active);
    if (!s.active) return;
    this.stick.style.left = `${s.originX}px`;
    this.stick.style.top = `${s.originY}px`;
    this.stickKnob.style.transform = `translate(${s.knobX - s.originX}px, ${s.knobY - s.originY}px)`;
  }

  /**
   * Pad labels live in world space, projected each frame. Costs read as
   * `Barricade 25` with a sugar glyph, never `Cost: 25 sugar`.
   */
  private updateLabels(sim: Sim, view: View): void {
    const st = sim.state;
    for (const pad of st.pads) {
      let node = this.labels.get(pad.id);
      if (!node) {
        node = el('div', 'lbl');
        this.labelLayer.appendChild(node);
        this.labels.set(pad.id, node);
      }
      const visible = view.stage.project(pad.pos.x, pad.pos.y + pad.radius + 34, 6, this.projected);
      if (!visible) {
        node.style.display = 'none';
        continue;
      }
      // Always readable, but pads far from the Warden step back so the room in
      // front of her stays legible.
      const away = Math.hypot(pad.pos.x - st.warden.pos.x, pad.pos.y - st.warden.pos.y);
      node.style.display = 'block';
      node.style.opacity = away > 620 ? '0.4' : away > 380 ? '0.72' : '1';
      node.style.transform = `translate(${this.projected.x}px, ${this.projected.y}px) translate(-50%, -50%)`;
      const text = padText(sim, pad);
      if (node.dataset.text !== text.key) {
        node.dataset.text = text.key;
        node.className = `lbl ${text.cls}`;
        node.innerHTML = text.html;
      }
    }
  }

  /** Chevrons on the nearest screen edge, one per cluster of three. */
  private updateChevrons(sim: Sim, view: View): void {
    view.collectOffscreenThreats(sim, this.threats);
    const w = window.innerWidth;
    const h = window.innerHeight;
    const margin = 26;
    for (let i = 0; i < this.chevrons.length; i++) {
      const node = this.chevrons[i];
      const threat = this.threats[i];
      if (!threat || sim.state.phase !== 'night') {
        node.style.display = 'none';
        continue;
      }
      view.stage.project(threat.x, threat.y, 20, this.projected);
      const x = Math.max(margin, Math.min(w - margin, this.projected.x));
      const y = Math.max(margin + 70, Math.min(h - margin - 120, this.projected.y));
      const angle = Math.atan2(this.projected.y - y || 1, this.projected.x - x);
      node.style.display = 'block';
      node.style.color = threat.tier >= 30 ? '#ffb347' : '#c2405b';
      node.style.fontSize = threat.tier >= 100 ? '22px' : '15px';
      node.style.transform = `translate(${x}px, ${y}px) translate(-50%, -50%) rotate(${angle + Math.PI / 2}rad)`;
    }
  }
}

interface PadText {
  key: string;
  cls: string;
  html: string;
}

/**
 * Two levels, always in the same order: the name in tracked-out micro type, and
 * beneath it the number the player acts on. A cost has to be findable without
 * reading the name first.
 */
function padText(sim: Sim, pad: Pad): PadText {
  const st = sim.state;
  const owned = tierOf(st, pad.id);
  if (pad.kind === 'repair') {
    return { key: 'mortar', cls: '', html: padName('Mortar') };
  }
  const structure = st.structures.find((s) => s.site === pad.id);
  if (structure && structure.hp <= 0) {
    return {
      key: 'breached',
      cls: 'lbl--short',
      html: `${padName(pad.label)}<span class="lbl__value">Breached</span>`,
    };
  }
  if (pad.state === 'locked') {
    return {
      key: `locked${pad.unlockBroodTier}`,
      cls: 'lbl--locked',
      html: `${padName(pad.label)}<span class="lbl__sub">Brood ${pad.unlockBroodTier}</span>`,
    };
  }
  if (pad.state === 'complete' || pad.targetTier === 0) {
    return {
      key: `max${owned}`,
      cls: 'lbl--locked',
      html: `${padName(pad.label)}<span class="lbl__sub">${romanTier(owned)}</span>`,
    };
  }
  const remaining = Math.max(0, Math.ceil(pad.cost - pad.paid));
  const short = pad.paid > 0 && pad.paid < pad.cost;
  const suffix = owned > 0 ? ` ${romanTier(owned + 1)}` : '';
  const sub = short ? `<span class="lbl__sub">${Math.floor(pad.paid)} / ${pad.cost}</span>` : '';
  return {
    key: `${pad.state}${owned}${remaining}${short ? 'p' : ''}`,
    cls: 'lbl--cost',
    html: `${padName(pad.label + suffix)}<span class="lbl__value">${remaining}</span>${sub}`,
  };
}

function padName(text: string): string {
  return `<span class="lbl__name">${text}</span>`;
}

function romanTier(tier: number): string {
  return ['', 'I', 'II', 'III', 'IV', 'V'][Math.min(5, Math.max(0, tier))];
}

/**
 * The Surface Band: a cross-section of the world above the colony. It is the
 * clock, the progress bar, the phase indicator, and the source of the in-world
 * light shaft, all in one object.
 *
 * Built from positioned elements at real pixel size rather than one stretched
 * drawing. The old version was a 360 by 56 viewBox with
 * `preserveAspectRatio="none"`, so on a desktop viewport every circle in it was
 * squashed into an ellipse three and a half times too wide and every blade of
 * grass splayed sideways. Nothing here scales horizontally: the sky is a
 * gradient, the sun is a circle measured in pixels, and the brood cells are a
 * centred row that keeps its own geometry at any width.
 */
class SurfaceBand {
  readonly element: HTMLElement;
  private readonly body: HTMLElement;
  private readonly bodyDisc: HTMLElement;
  private readonly cells: HTMLElement[] = [];
  private filled = -1;
  private wasNight: boolean | null = null;

  constructor() {
    this.element = el('div', 'band');

    const sky = el('div', 'band__sky');
    // A drift of stars, only visible once the palette has gone over to night.
    const stars = el('div', 'band__stars');
    for (const [left, top, dim] of STARS) {
      const star = el('i', '');
      star.style.left = `${left}%`;
      star.style.top = `${top}%`;
      star.style.opacity = String(dim);
      stars.appendChild(star);
    }
    sky.appendChild(stars);
    this.element.appendChild(sky);

    // Sun and moon share one element: only one is ever up, and swapping a class
    // is cheaper than moving two nodes every frame.
    this.body = el('div', 'band__body');
    this.bodyDisc = el('div', 'band__disc');
    this.body.appendChild(this.bodyDisc);
    this.element.appendChild(this.body);

    const ground = el('div', 'band__ground');
    ground.appendChild(el('div', 'band__horizon'));
    // Two hairlines of strata. Real soil is layered, and the layers are what
    // stop a block of brown reading as a block of brown.
    ground.appendChild(el('div', 'band__stratum band__stratum--a'));
    ground.appendChild(el('div', 'band__stratum band__stratum--b'));
    for (const [left, size] of STONES) {
      const stone = el('i', 'band__stone');
      stone.style.left = `${left}%`;
      stone.style.width = `${size}px`;
      stone.style.height = `${size * 0.62}px`;
      ground.appendChild(stone);
    }
    this.element.appendChild(ground);

    // The surface entrance, from which the daylight shaft descends.
    this.element.appendChild(el('div', 'band__mouth'));

    for (const [left, variant] of BLADES) {
      const clump = el('div', `band__blades ${variant}`);
      clump.style.left = `${left}%`;
      clump.innerHTML = BLADE_SVG;
      this.element.appendChild(clump);
    }

    // Twelve brood cells set into the soil, one per night held. Hexagons,
    // because that is the shape of a real brood comb and it reads as one.
    const comb = el('div', 'band__comb');
    for (let i = 0; i < TIME.nightsPerRun; i++) {
      const cell = el('i', 'band__cell');
      comb.appendChild(cell);
      this.cells.push(cell);
    }
    this.element.appendChild(comb);
  }

  update(sim: Sim): void {
    const st = sim.state;
    const night = st.phase === 'night';

    // By day the sun tracks the day timer; at night the moon tracks the raid.
    let t: number;
    if (night) {
      const window = Math.max(1, st.spawnWindow);
      t = Math.min(1, (st.time - st.phaseStartedAt) / window);
    } else {
      t = sim.phaseProgress;
    }
    // Percent across, and an arc that peaks at midday rather than a straight
    // line. The disc keeps its own pixel size, so it stays round.
    this.body.style.left = `${7 + t * 86}%`;
    this.body.style.top = `${40 - Math.sin(t * Math.PI) * 24}%`;

    if (night !== this.wasNight) {
      this.wasNight = night;
      this.element.classList.toggle('band--night', night);
    }

    const held = st.stats.nightsHeld;
    if (held !== this.filled) {
      this.filled = held;
      for (let i = 0; i < this.cells.length; i++) {
        this.cells[i].classList.toggle('on', i < held);
      }
    }
  }
}

/** Left percent, top percent, and base opacity for each star. */
const STARS: readonly [number, number, number][] = [
  [7, 22, 0.7], [14, 52, 0.4], [23, 16, 0.85], [31, 40, 0.5], [39, 26, 0.6],
  [47, 58, 0.35], [55, 20, 0.8], [62, 44, 0.45], [70, 14, 0.7], [77, 36, 0.55],
  [85, 24, 0.9], [92, 50, 0.4],
];

/** Left percent and width in pixels for the stones set into the soil. */
const STONES: readonly [number, number][] = [[36, 8], [87, 11]];

/**
 * Left percent and variant for each grass clump. One SVG mirrored and cropped
 * beats four copies of the same silhouette in a row.
 */
const BLADES: readonly [number, string][] = [
  [4, ''],
  [20, 'band__blades--flip band__blades--short'],
  [64, 'band__blades--short'],
  [82, 'band__blades--flip'],
];

const BLADE_SVG =
  `<svg width="26" height="15" viewBox="0 0 26 15" fill="none" aria-hidden="true">` +
  `<path d="M4 15C3 9 2 6 0 3" /><path d="M9 15C9 9 10 5 12 1" />` +
  `<path d="M15 15C15 10 16 7 18 4" /><path d="M21 15C22 10 23 7 26 4" />` +
  `</svg>`;

function line(label: string, value: string, extra = ''): string {
  return `<div class="tally__line ${extra}"><span>${label}</span><b>${value}</b></div>`;
}

function el(tag: string, className: string): HTMLElement {
  const node = document.createElement(tag);
  if (className) node.className = className;
  return node;
}
