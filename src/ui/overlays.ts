import { BUILD, TIME } from '../game/balance';
import { SITES } from '../game/gallery';
import { glowcapCount, tierOf } from '../game/state';
import type { Sim } from '../game/sim';
import type { Settings } from '../game/types';

export type OverlayName = 'title' | 'pause' | 'win' | 'lose' | 'none';

export interface OverlayCallbacks {
  onStart(): void;
  onTutorial(): void;
  onResume(): void;
  onRetry(): void;
  onContinueEndless(): void;
  onSettingChange(patch: Partial<Settings>): void;
}

/** Title, pause, win, and lose sheets. All DOM: crisp text costs nothing here. */
export class Overlays {
  private readonly root: HTMLElement;
  private current: OverlayName = 'none';
  private hasSavedRun = false;

  constructor(
    root: HTMLElement,
    private readonly callbacks: OverlayCallbacks,
    private readonly settings: Settings,
  ) {
    this.root = root;
  }

  get visible(): boolean {
    return this.current !== 'none';
  }

  get shown(): OverlayName {
    return this.current;
  }

  setHasSavedRun(has: boolean): void {
    this.hasSavedRun = has;
  }

  hide(): void {
    this.current = 'none';
    this.root.innerHTML = '';
  }

  show(name: OverlayName, sim: Sim | null): void {
    this.current = name;
    this.root.innerHTML = '';
    if (name === 'none') return;
    const sheet = document.createElement('div');
    sheet.className = 'sheet';
    const card = document.createElement('div');
    card.className = 'sheet__card';
    sheet.appendChild(card);
    this.root.appendChild(sheet);

    switch (name) {
      case 'title': this.buildTitle(card); break;
      case 'pause': this.buildPause(card, sim); break;
      case 'win': this.buildWin(card, sim); break;
      case 'lose': this.buildLose(card, sim); break;
      default: break;
    }
  }

  private buildTitle(card: HTMLElement): void {
    card.innerHTML = `
      <h1>Crumbhold</h1>
      <p class="tagline">Haul the sugar by day. Hold the tunnels after dark.</p>
    `;
    if (this.hasSavedRun) {
      card.appendChild(button('big', 'Resume run', () => this.callbacks.onResume()));
      card.appendChild(button('ghost', 'New run', () => this.callbacks.onStart()));
    } else {
      card.appendChild(button('big', 'Begin', () => this.callbacks.onStart()));
    }
    card.appendChild(button('ghost', 'Tutorial', () => this.callbacks.onTutorial()));
    const help = document.createElement('div');
    help.className = 'help';
    help.innerHTML = helpHtml();
    card.appendChild(help);
  }

  private buildPause(card: HTMLElement, sim: Sim | null): void {
    card.innerHTML = `<h2>Paused</h2>`;
    if (sim) {
      const st = sim.state;
      const rows = document.createElement('div');
      rows.className = 'rows';
      rows.innerHTML =
        row('Night', `${st.night} of ${TIME.nightsPerRun}`) +
        row('Nights held', String(st.stats.nightsHeld)) +
        row('Sugar gathered', String(Math.round(st.stats.sugarEarned))) +
        row('Glowcaps', String(glowcapCount(st)));
      card.appendChild(rows);
    }
    card.appendChild(button('big', 'Resume', () => this.callbacks.onResume()));
    card.appendChild(this.buildSettings());
    const help = document.createElement('div');
    help.className = 'help';
    help.innerHTML = `<h2 style="font-size:20px">How to play</h2>${helpHtml()}`;
    card.appendChild(help);
  }

  private buildWin(card: HTMLElement, sim: Sim | null): void {
    card.innerHTML = `<h1>The colony holds</h1>`
      + `<p>You held all twelve nights. The brood is safe.</p>`;
    if (sim) card.appendChild(summary(sim));
    card.appendChild(button('big', 'Keep going', () => this.callbacks.onContinueEndless()));
    card.appendChild(button('ghost', 'New run', () => this.callbacks.onRetry()));
  }

  private buildLose(card: HTMLElement, sim: Sim | null): void {
    const night = sim?.state.loseNight ?? 0;
    card.innerHTML = `<h1 style="color:#c2405b">The brood falls</h1>`
      + `<p>You held ${Math.max(0, night - 1)} of ${TIME.nightsPerRun} nights.</p>`;
    if (sim) {
      card.appendChild(summary(sim));
      const gap = biggestGap(sim);
      if (gap) {
        const note = document.createElement('p');
        note.innerHTML = `You never built the <b style="color:#f5c147">${gap}</b>.`;
        card.appendChild(note);
      }
    }
    card.appendChild(button('big', 'Try again', () => this.callbacks.onRetry()));
  }

  private buildSettings(): HTMLElement {
    const wrap = document.createElement('div');
    wrap.className = 'rows';
    wrap.appendChild(toggle('Sound', this.settings.audio, (on) => {
      this.settings.audio = on;
      this.callbacks.onSettingChange({ audio: on });
    }));
    wrap.appendChild(toggle('High-contrast invaders', this.settings.highContrast, (on) => {
      this.settings.highContrast = on;
      this.callbacks.onSettingChange({ highContrast: on });
    }));
    wrap.appendChild(toggle('Damage numbers', this.settings.damageNumbers, (on) => {
      this.settings.damageNumbers = on;
      this.callbacks.onSettingChange({ damageNumbers: on });
    }));
    wrap.appendChild(toggle('Larger HUD', this.settings.hudScale > 1, (on) => {
      const scale = on ? 1.25 : 1;
      this.settings.hudScale = scale;
      this.callbacks.onSettingChange({ hudScale: scale });
    }));
    wrap.appendChild(slider('Night brightness', this.settings.nightBrightness, (value) => {
      this.settings.nightBrightness = value;
      this.callbacks.onSettingChange({ nightBrightness: value });
    }));
    return wrap;
  }
}

function summary(sim: Sim): HTMLElement {
  const st = sim.state;
  const rows = document.createElement('div');
  rows.className = 'rows';
  rows.innerHTML =
    row('Nights held', String(st.stats.nightsHeld)) +
    row('Sugar gathered', String(Math.round(st.stats.sugarEarned))) +
    row('Sugar spent', String(Math.round(st.stats.sugarSpent))) +
    row('Invaders killed', String(st.stats.invadersKilled)) +
    row('Knockdowns', String(st.stats.knockdowns)) +
    row('Glowcaps', String(glowcapCount(st)));
  return rows;
}

/**
 * Names the most expensive thing the player could have built and did not. Locked
 * sites are excluded: "you never built the Acid Battery" is not useful advice
 * when the Brood Chamber never reached the tier that unlocks it.
 */
function biggestGap(sim: Sim): string | null {
  const st = sim.state;
  let bestLabel: string | null = null;
  let bestCost = 0;
  for (const site of SITES) {
    const pad = st.pads.find((p) => p.id === site.id);
    if (!pad || pad.state === 'locked' || pad.kind === 'repair') continue;
    const owned = tierOf(st, site.id);
    const rows = BUILD[site.kind].tiers as readonly { cost: number }[];
    if (owned >= rows.length) continue;
    const cost = rows[owned].cost;
    if (cost > bestCost) {
      bestCost = cost;
      bestLabel = `${site.label} ${owned + 1}`;
    }
  }
  return bestLabel;
}

/**
 * Every line says what the player does and what happens. No line describes the
 * design of the game to the person trying to play it.
 */
function helpHtml(): string {
  const lines = [
    'Drag the left side of the screen to walk. You attack automatically.',
    'Stand on a pad to buy it. Walk away and your sugar stays on the pad.',
    'Carry honeydew to the Nectar Vat and leaf scraps to the Fungus Garden. Both pay you in sugar.',
    'Each day lasts 45 seconds \u2014 too short to do everything. Pick what matters.',
    'Hold the Brood Chamber for twelve nights to win.',
  ];
  // Only worth the line on a device that has a keyboard to mention.
  if (hasKeyboard()) {
    lines.push(
      'Keyboard: <b>WASD</b> or the arrow keys to walk, ' +
      '<b>Space</b> for the button, <b>Esc</b> to pause.',
    );
  }
  return `<ul>${lines.map((line) => `<li>${line}</li>`).join('')}</ul>`;
}

function hasKeyboard(): boolean {
  return typeof window.matchMedia === 'function' && window.matchMedia('(pointer: fine)').matches;
}

function row(label: string, value: string): string {
  return `<div class="row"><span>${label}</span><b>${value}</b></div>`;
}

function button(cls: string, label: string, onClick: () => void): HTMLElement {
  const node = document.createElement('button');
  node.type = 'button';
  node.className = cls;
  node.textContent = label;
  node.addEventListener('click', onClick);
  return node;
}

function toggle(label: string, initial: boolean, onChange: (on: boolean) => void): HTMLElement {
  const wrap = document.createElement('div');
  wrap.className = 'setting';
  const text = document.createElement('span');
  text.textContent = label;
  const btn = document.createElement('button');
  btn.type = 'button';
  btn.className = 'switch';
  let on = initial;
  const paint = (): void => {
    btn.setAttribute('aria-pressed', String(on));
    btn.textContent = on ? 'On' : 'Off';
  };
  paint();
  btn.addEventListener('click', () => {
    on = !on;
    paint();
    onChange(on);
  });
  wrap.append(text, btn);
  return wrap;
}

function slider(label: string, initial: number, onChange: (value: number) => void): HTMLElement {
  const wrap = document.createElement('div');
  wrap.className = 'setting';
  const text = document.createElement('span');
  text.textContent = label;
  const input = document.createElement('input');
  input.type = 'range';
  input.min = '0';
  input.max = '1';
  input.step = '0.05';
  input.value = String(initial);
  input.addEventListener('input', () => onChange(Number(input.value)));
  wrap.append(text, input);
  return wrap;
}
