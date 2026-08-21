import { HAPTICS_SUPPORTED } from '../engine/haptics';
import { isTouchInput } from '../engine/inputKind';
import { BUILD, TIME } from '../game/balance';
import { SITES } from '../game/gallery';
import { glowcapCount, tierOf } from '../game/state';
import type { Sim } from '../game/sim';
import type { Settings } from '../game/types';

export type OverlayName = 'title' | 'pause' | 'win' | 'lose' | 'none';

/**
 * Which panel of the open sheet is on screen. Instructions and settings are
 * panels rather than blocks on the main list: a menu the player has to read
 * past to find the one button they came for is not a menu.
 */
type OverlayView = 'main' | 'help' | 'settings';

export interface OverlayCallbacks {
  onStart(): void;
  onTutorial(): void;
  onResume(): void;
  onQuit(): void;
  onRetry(): void;
  onContinueEndless(): void;
  onSettingChange(patch: Partial<Settings>): void;
}

/** Title, pause, win, and lose sheets. All DOM: crisp text costs nothing here. */
export class Overlays {
  private readonly root: HTMLElement;
  private current: OverlayName = 'none';
  private view: OverlayView = 'main';
  /** Held so a panel can be opened and closed without rebuilding the sheet. */
  private sim: Sim | null = null;
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
    this.view = 'main';
    this.sim = null;
    this.root.innerHTML = '';
  }

  show(name: OverlayName, sim: Sim | null): void {
    this.current = name;
    this.sim = sim;
    // A sheet always opens on its own main list, never on a panel the player
    // left open half an hour ago.
    this.view = 'main';
    this.render();
  }

  /**
   * Closes an open panel and returns true, so Escape and the system back
   * gesture leave the panel before they leave the sheet.
   */
  back(): boolean {
    if (this.view === 'main') return false;
    this.view = 'main';
    this.render();
    return true;
  }

  private open(view: OverlayView): void {
    this.view = view;
    this.render();
  }

  private render(): void {
    this.root.innerHTML = '';
    if (this.current === 'none') return;
    const sheet = document.createElement('div');
    sheet.className = 'sheet';
    const card = document.createElement('div');
    card.className = 'sheet__card';
    sheet.appendChild(card);
    this.root.appendChild(sheet);

    if (this.view === 'help') {
      this.buildHelpPanel(card);
      return;
    }
    if (this.view === 'settings') {
      this.buildSettingsPanel(card);
      return;
    }
    switch (this.current) {
      case 'title': this.buildTitle(card); break;
      case 'pause': this.buildPause(card, this.sim); break;
      case 'win': this.buildWin(card, this.sim); break;
      case 'lose': this.buildLose(card, this.sim); break;
      default: break;
    }
  }

  /** The name and the one button that starts playing, then the two ways in. */
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
    card.appendChild(foot(
      button('ghost', 'How to play', () => this.open('help')),
      button('ghost', 'Tutorial', () => this.callbacks.onTutorial()),
    ));
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
    // The run is kept: the title screen offers it back as "Resume run".
    card.appendChild(button('ghost', 'Quit to title', () => this.callbacks.onQuit()));
    card.appendChild(foot(
      button('ghost', 'Settings', () => this.open('settings')),
      button('ghost', 'How to play', () => this.open('help')),
    ));
  }

  private buildHelpPanel(card: HTMLElement): void {
    card.innerHTML = `<h2>How to play</h2>`;
    const help = document.createElement('div');
    help.className = 'help';
    help.innerHTML = helpHtml();
    card.appendChild(help);
    card.appendChild(button('ghost', 'Back', () => this.back()));
  }

  private buildSettingsPanel(card: HTMLElement): void {
    card.innerHTML = `<h2>Settings</h2>`;
    card.appendChild(this.buildSettings());
    card.appendChild(button('ghost', 'Back', () => this.back()));
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
    wrap.appendChild(toggle('Ambient music', this.settings.music, (on) => {
      this.settings.music = on;
      this.callbacks.onSettingChange({ music: on });
    }));
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
    // Hidden where the browser has no Vibration API, which includes every
    // iPhone: a switch that does nothing is worse than no switch.
    if (HAPTICS_SUPPORTED) {
      wrap.appendChild(toggle('Vibration', this.settings.haptics, (on) => {
        this.settings.haptics = on;
        this.callbacks.onSettingChange({ haptics: on });
      }));
    }
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
 * when the Brood Chamber never reached the level that unlocks it.
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
    'Drag anywhere on the screen to walk. You attack automatically.',
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
  return !isTouchInput();
}

/**
 * The secondary items, set off from the button that starts playing. Everything
 * here is a way to read about the game rather than a way into it.
 */
function foot(...items: HTMLElement[]): HTMLElement {
  const wrap = document.createElement('div');
  wrap.className = 'sheet__foot';
  wrap.append(...items);
  return wrap;
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
