import { STACK, TIME } from '../game/balance';
import { capacityFor, tierOf } from '../game/state';
import { actionCooldown, actionLabel, currentAction } from '../game/systems/actions';
import { broodHealth } from '../game/systems/phase';
import { currentSubWave } from '../game/systems/spawn';
import type { Sim } from '../game/sim';
import type { Pad } from '../game/types';
import type { View } from '../render/view';
import { Onboarding } from './onboarding';

const SUGAR_GLYPH = `<svg class="chip__glyph" viewBox="0 0 24 24" aria-hidden="true"><path d="M12 1.5 21 12l-9 10.5L3 12z" fill="#f5c147" stroke="#22212b" stroke-width="2.4" stroke-linejoin="round"/></svg>`;
const DROP_GLYPH = `<svg class="chip__glyph" viewBox="0 0 24 24" aria-hidden="true"><path d="M12 2c4 6 6.5 8.6 6.5 12A6.5 6.5 0 0 1 12 20.5 6.5 6.5 0 0 1 5.5 14C5.5 10.6 8 8 12 2z" fill="#ffd98a" stroke="#22212b" stroke-width="2.2"/></svg>`;
const LEAF_GLYPH = `<svg class="chip__glyph" viewBox="0 0 24 24" aria-hidden="true"><path d="M3 21C3 10 10 3 21 3c0 11-7 18-18 18z" fill="#8fc95a" stroke="#22212b" stroke-width="2.2" stroke-linejoin="round"/></svg>`;

/**
 * Persistent HUD. Everything that can live on the floor lives on the floor, so
 * this stays under the 14 percent screen-area budget: a band, two counters, one
 * bar, and two buttons.
 */
export class Hud {
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
  private readonly stick: HTMLElement;
  private readonly stickKnob: HTMLElement;
  private readonly labelLayer: HTMLElement;
  private readonly toast: HTMLElement;
  private readonly stamp: HTMLElement;
  private readonly debug: HTMLElement;
  private readonly tally: HTMLElement;
  private readonly onboarding: Onboarding;
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

  onAction: (() => void) | null = null;
  onPause: (() => void) | null = null;

  constructor(root: HTMLElement) {
    root.innerHTML = '';

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

    this.actionBtn = el('button', 'btn btn--action') as HTMLButtonElement;
    this.actionBtn.type = 'button';
    this.actionWipe = el('div', 'wipe');
    this.actionText = el('span', '');
    this.actionBtn.append(this.actionWipe, this.actionText);
    this.actionBtn.addEventListener('pointerdown', (e) => {
      e.preventDefault();
      this.actionBtn.classList.add('press');
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
      const chevron = el('div', 'lbl lbl--short');
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
      const badge = el('div', 'lbl lbl--cost');
      badge.style.display = 'none';
      this.labelLayer.appendChild(badge);
      this.stackBadges.push(badge);
    }
    this.onboarding = new Onboarding(this.labelLayer);
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
    this.onboarding.update(
      sim,
      (x, y, z, out) => view.stage.project(x, y, z, out),
      sim.state.time,
    );
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
        this.otherChip.innerHTML = `${glyph}<span>${amount}/${capacityFor(st, other)}</span>`;
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
      html += `<span>Wave ${Math.max(1, current)} of ${total}</span>`;
      this.wavePips.innerHTML = html;
    }
  }

  private updateAction(sim: Sim): void {
    const kind = currentAction(sim);
    const label = actionLabel(kind);
    if (this.actionText.textContent !== label) this.actionText.textContent = label;
    const cooldown = actionCooldown(sim, kind);
    this.actionBtn.disabled = kind === 'none' || cooldown > 0;
    this.actionWipe.style.setProperty('--wipe', `${cooldown}turn`);
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

function padText(sim: Sim, pad: Pad): PadText {
  const st = sim.state;
  const owned = tierOf(st, pad.id);
  if (pad.kind === 'repair') {
    return { key: 'mortar', cls: '', html: 'Mortar' };
  }
  const structure = st.structures.find((s) => s.site === pad.id);
  if (structure && structure.hp <= 0) {
    return { key: 'breached', cls: 'lbl--short', html: `${pad.label}<span class="lbl__sub">Breached</span>` };
  }
  if (pad.state === 'locked') {
    return {
      key: `locked${pad.unlockBroodTier}`,
      cls: 'lbl--locked',
      html: `${pad.label}<span class="lbl__sub">Brood ${pad.unlockBroodTier}</span>`,
    };
  }
  if (pad.state === 'complete' || pad.targetTier === 0) {
    return {
      key: `max${owned}`,
      cls: 'lbl--locked',
      html: `${pad.label} ${romanTier(owned)}`,
    };
  }
  const remaining = Math.max(0, Math.ceil(pad.cost - pad.paid));
  const short = pad.paid > 0 && pad.paid < pad.cost;
  const suffix = owned > 0 ? ` ${romanTier(owned + 1)}` : '';
  const sub = short ? `<span class="lbl__sub">${Math.floor(pad.paid)} / ${pad.cost}</span>` : '';
  return {
    key: `${pad.state}${owned}${remaining}${short ? 'p' : ''}`,
    cls: 'lbl--cost',
    html: `${pad.label}${suffix} ${remaining}${sub}`,
  };
}

function romanTier(tier: number): string {
  return ['', 'I', 'II', 'III', 'IV', 'V'][Math.min(5, Math.max(0, tier))];
}

/**
 * The Surface Band: a cross-section of the world above the colony. It is the
 * clock, the progress bar, the phase indicator, and the source of the in-world
 * light shaft, all in one object.
 */
class SurfaceBand {
  readonly element: HTMLElement;
  private readonly sky: SVGRectElement;
  private readonly sun: SVGGElement;
  private readonly moon: SVGGElement;
  private readonly cells: SVGCircleElement[] = [];
  private filled = -1;

  constructor() {
    this.element = el('div', 'band');
    const svg = document.createElementNS(SVG, 'svg');
    svg.setAttribute('viewBox', '0 0 360 56');
    svg.setAttribute('preserveAspectRatio', 'none');

    this.sky = document.createElementNS(SVG, 'rect');
    this.sky.setAttribute('x', '0');
    this.sky.setAttribute('y', '0');
    this.sky.setAttribute('width', '360');
    this.sky.setAttribute('height', '30');
    svg.appendChild(this.sky);

    // Sun and moon travel above the soil line; only one is ever visible.
    this.sun = document.createElementNS(SVG, 'g');
    this.sun.innerHTML = `<circle r="7" fill="#f5c147" stroke="#22212b" stroke-width="2"/>`;
    svg.appendChild(this.sun);
    this.moon = document.createElementNS(SVG, 'g');
    this.moon.innerHTML = `<circle r="6.5" fill="#dfe4f5" stroke="#22212b" stroke-width="2"/><circle cx="3" cy="-2" r="4.6" fill="#1b2036"/>`;
    svg.appendChild(this.moon);

    const soil = document.createElementNS(SVG, 'path');
    soil.setAttribute(
      'd',
      'M0 30 L34 30 L38 26 L52 26 L56 30 L360 30 L360 56 L0 56 Z',
    );
    soil.setAttribute('fill', '#4a3f38');
    svg.appendChild(soil);

    // The surface entrance, from which the daylight shaft descends.
    const hole = document.createElementNS(SVG, 'path');
    hole.setAttribute('d', 'M38 26 L52 26 L50 42 L40 42 Z');
    hole.setAttribute('fill', '#22212b');
    svg.appendChild(hole);

    const grass = document.createElementNS(SVG, 'g');
    grass.setAttribute('stroke', '#5f7a45');
    grass.setAttribute('stroke-width', '2');
    grass.setAttribute('stroke-linecap', 'round');
    grass.innerHTML =
      `<path d="M14 30 C12 24 10 22 8 19"/><path d="M20 30 C20 25 21 22 23 18"/>` +
      `<path d="M70 30 C68 25 66 23 64 20"/><path d="M76 30 C77 25 78 23 80 19"/>` +
      `<path d="M300 30 C299 25 297 23 295 20"/><path d="M306 30 C307 25 309 23 311 19"/>`;
    svg.appendChild(grass);

    const pebble = document.createElementNS(SVG, 'ellipse');
    pebble.setAttribute('cx', '246');
    pebble.setAttribute('cy', '28');
    pebble.setAttribute('rx', '13');
    pebble.setAttribute('ry', '6');
    pebble.setAttribute('fill', '#8e97a8');
    pebble.setAttribute('stroke', '#22212b');
    pebble.setAttribute('stroke-width', '2');
    svg.appendChild(pebble);

    // Twelve brood cells set into the soil, one per night held.
    for (let i = 0; i < TIME.nightsPerRun; i++) {
      const cell = document.createElementNS(SVG, 'circle');
      cell.setAttribute('cx', String(96 + i * 21));
      cell.setAttribute('cy', '43');
      cell.setAttribute('r', '6.4');
      cell.setAttribute('fill', '#2b241f');
      cell.setAttribute('stroke', '#6a5a4d');
      cell.setAttribute('stroke-width', '1.6');
      svg.appendChild(cell);
      this.cells.push(cell);
    }

    this.element.appendChild(svg);
  }

  update(sim: Sim): void {
    const st = sim.state;
    const night = st.phase === 'night';
    this.sky.setAttribute('fill', night ? '#1b2036' : '#7fb4d4');

    // By day the sun tracks the day timer; at night the moon tracks the raid.
    let t: number;
    if (night) {
      const window = Math.max(1, st.spawnWindow);
      t = Math.min(1, (st.time - st.phaseStartedAt) / window);
    } else {
      t = sim.phaseProgress;
    }
    const x = 24 + t * 312;
    const y = 24 - Math.sin(t * Math.PI) * 15;
    this.sun.setAttribute('transform', `translate(${x} ${y})`);
    this.moon.setAttribute('transform', `translate(${x} ${y})`);
    this.sun.style.display = night ? 'none' : 'block';
    this.moon.style.display = night ? 'block' : 'none';

    const held = st.stats.nightsHeld;
    if (held !== this.filled) {
      this.filled = held;
      for (let i = 0; i < this.cells.length; i++) {
        const on = i < held;
        this.cells[i].setAttribute('fill', on ? '#f5c147' : '#2b241f');
        this.cells[i].setAttribute('stroke', on ? '#c48a16' : '#6a5a4d');
      }
    }
  }
}

const SVG = 'http://www.w3.org/2000/svg';

function line(label: string, value: string, extra = ''): string {
  return `<div class="tally__line ${extra}"><span>${label}</span><b>${value}</b></div>`;
}

function el(tag: string, className: string): HTMLElement {
  const node = document.createElement(tag);
  if (className) node.className = className;
  return node;
}
