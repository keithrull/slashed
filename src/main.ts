import { FIGHTER_ROSTER, FighterId, StageId } from './fighters';
import { AIDifficulty, GameMode, SlashedGameEngine } from './game';
import { sound } from './audio';

const canvas = document.getElementById('game-canvas') as HTMLCanvasElement;
const engine = new SlashedGameEngine(canvas);

// UI State for Character Select Modal
let selectedP1: FighterId = 'kazemaru';
let selectedP2: FighterId = 'hotaru';
let selectedMode: GameMode = 'ai';
let selectedStage: StageId = 'crimson_torii';
let nextClickAssigns: 1 | 2 = 1;

const overlayScreen = document.getElementById('overlay-screen')!;
const helpModal = document.getElementById('help-modal')!;
const fighterGrid = document.getElementById('fighter-grid')!;
const p1PickName = document.getElementById('p1-pick-name')!;
const p2PickName = document.getElementById('p2-pick-name')!;
const assignTargetLabel = document.getElementById('assign-target-label')!;

const btnModeToggle = document.getElementById('btn-mode-toggle')!;
const btnCharSelect = document.getElementById('btn-char-select')!;
const btnVisualStyle = document.getElementById('btn-visual-style')!;
const btnPracticeAi = document.getElementById('btn-practice-ai')!;
const btnAutoDemo = document.getElementById('btn-auto-demo')!;
const btnClearInk = document.getElementById('btn-clear-ink')!;
const btnSound = document.getElementById('btn-sound')!;
const btnHelp = document.getElementById('btn-help')!;
const btnStartMatch = document.getElementById('btn-start-match')!;
const btnCloseHelp = document.getElementById('btn-close-help')!;

function renderFighterCards(): void {
  fighterGrid.innerHTML = '';

  (Object.keys(FIGHTER_ROSTER) as FighterId[]).forEach((id) => {
    const cfg = FIGHTER_ROSTER[id];
    const card = document.createElement('div');
    card.className = 'fighter-card';
    if (selectedP1 === id) card.classList.add('selected-p1');
    if (selectedP2 === id) card.classList.add('selected-p2');

    card.innerHTML = `
      <div class="fighter-portrait-wrap">
        <img src="${cfg.portraitUrl}" alt="${cfg.name}" />
        <span class="fighter-kanji-badge">${cfg.kanji}</span>
      </div>
      <div class="fighter-name-row">
        <span class="fighter-name">${cfg.name}</span>
      </div>
      <div class="fighter-title">${cfg.title}</div>
      <p class="fighter-desc">${cfg.description}</p>
      <div class="fighter-stats">
        <span>SPD ${cfg.statsLabel.speed}</span>
        <span>PWR ${cfg.statsLabel.power}</span>
      </div>
    `;

    card.addEventListener('click', (e) => {
      sound.playTaiko(0.75, 95);
      if (e.shiftKey) {
        selectedP2 = id;
      } else if (nextClickAssigns === 1) {
        selectedP1 = id;
        nextClickAssigns = 2;
      } else {
        selectedP2 = id;
        nextClickAssigns = 1;
      }
      updateSelectionLabels();
      renderFighterCards();
    });

    card.addEventListener('contextmenu', (e) => {
      e.preventDefault();
      sound.playTaiko(0.75, 82);
      selectedP2 = id;
      updateSelectionLabels();
      renderFighterCards();
    });

    fighterGrid.appendChild(card);
  });
}

function updateSelectionLabels(): void {
  const c1 = FIGHTER_ROSTER[selectedP1];
  const c2 = FIGHTER_ROSTER[selectedP2];
  p1PickName.textContent = `${c1.name} (${c1.kanji})`;
  p2PickName.textContent = `${c2.name} (${c2.kanji})`;
  assignTargetLabel.textContent = nextClickAssigns === 1 ? 'Player 1' : 'Player 2 / CPU';
}

// Mode Pill Selector
document.querySelectorAll('.mode-pill').forEach((btn) => {
  btn.addEventListener('click', () => {
    document.querySelectorAll('.mode-pill').forEach((b) => b.classList.remove('active'));
    btn.classList.add('active');
    selectedMode = (btn.getAttribute('data-mode') as GameMode) || 'ai';
    updateModeButtonLabel();
    sound.playTaiko(0.65, 105);
  });
});

// Stage Pill Selector
document.querySelectorAll('.stage-pill').forEach((btn) => {
  btn.addEventListener('click', () => {
    document.querySelectorAll('.stage-pill').forEach((b) => b.classList.remove('active'));
    btn.classList.add('active');
    selectedStage = (btn.getAttribute('data-stage') as StageId) || 'crimson_torii';
    engine.stage = selectedStage;
    sound.playTaiko(0.65, 110);
  });
});

function updateModeButtonLabel(): void {
  const labelMap: Record<GameMode, string> = {
    ai: 'Mode: 1P vs AI',
    versus: 'Mode: Local 2P',
    training: 'Mode: Dojo Practice',
  };
  btnModeToggle.textContent = labelMap[selectedMode];
}

function launchMatchFromModal(): void {
  overlayScreen.classList.add('hidden');
  helpModal.classList.add('hidden');
  engine.isPausedByModal = false;
  engine.startNewMatch(selectedP1, selectedP2, selectedMode, selectedStage);
}

btnStartMatch.addEventListener('click', () => {
  launchMatchFromModal();
});

// Top Bar Quick Controls
btnModeToggle.addEventListener('click', () => {
  const order: GameMode[] = ['ai', 'versus', 'training'];
  const next = order[(order.indexOf(selectedMode) + 1) % order.length];
  selectedMode = next;
  engine.mode = next;
  updateModeButtonLabel();
  sound.playTaiko(0.7, 90);
});

btnCharSelect.addEventListener('click', () => {
  const isHidden = overlayScreen.classList.contains('hidden');
  if (isHidden) {
    overlayScreen.classList.remove('hidden');
    engine.isPausedByModal = true;
  } else {
    overlayScreen.classList.add('hidden');
    engine.isPausedByModal = false;
  }
});

btnVisualStyle.addEventListener('click', () => {
  const styles: Array<'puppet' | '3d' | 'scroll'> = ['puppet', '3d', 'scroll'];
  const next = styles[(styles.indexOf(engine.renderer.renderStyle) + 1) % styles.length];
  engine.renderer.renderStyle = next;
  const labels: Record<'puppet' | '3d' | 'scroll', string> = {
    puppet: 'Art: Painted Bone Rig',
    '3d': 'Art: 3D Sumi-e Shader',
    scroll: 'Art: 2D Pose Scroll',
  };
  btnVisualStyle.textContent = labels[next];
  sound.playTaiko(0.7, 102);
});

btnPracticeAi.addEventListener('click', () => {
  const levels: AIDifficulty[] = ['Novice', 'Ronin', 'Kensei'];
  const next = levels[(levels.indexOf(engine.aiDifficulty) + 1) % levels.length];
  engine.aiDifficulty = next;
  btnPracticeAi.textContent = `AI: ${next}`;
  sound.playTaiko(0.7, 98);
});

btnAutoDemo.addEventListener('click', () => {
  engine.autoDemoWatch = !engine.autoDemoWatch;
  btnAutoDemo.textContent = `CPU Watch: ${engine.autoDemoWatch ? 'ON' : 'OFF'}`;
  if (engine.autoDemoWatch && !overlayScreen.classList.contains('hidden')) {
    launchMatchFromModal();
  }
  sound.playTaiko(0.75, 92);
});

btnClearInk.addEventListener('click', () => {
  engine.renderer.washStainCanvas();
  sound.playBrushSlash(false);
});

btnSound.addEventListener('click', () => {
  const state = sound.toggle();
  btnSound.textContent = `Sound: ${state ? 'ON' : 'OFF'}`;
});

btnHelp.addEventListener('click', () => {
  helpModal.classList.toggle('hidden');
  engine.isPausedByModal = !helpModal.classList.contains('hidden') || !overlayScreen.classList.contains('hidden');
});

btnCloseHelp.addEventListener('click', () => {
  helpModal.classList.add('hidden');
  engine.isPausedByModal = !overlayScreen.classList.contains('hidden');
});

// Global Hotkeys for convenience (C = Character Select, R = Wash Ink, ? / H = Help, Escape = Close Modal)
window.addEventListener('keydown', (e) => {
  if (e.code === 'KeyR' && !engine.isPausedByModal) {
    engine.renderer.washStainCanvas();
  } else if (e.code === 'KeyC') {
    btnCharSelect.click();
  } else if (e.code === 'Slash' && e.shiftKey) {
    btnHelp.click();
  } else if (e.code === 'Escape') {
    if (!helpModal.classList.contains('hidden')) {
      btnCloseHelp.click();
    } else if (!overlayScreen.classList.contains('hidden')) {
      launchMatchFromModal();
    } else {
      overlayScreen.classList.remove('hidden');
      engine.isPausedByModal = true;
    }
  } else if ((e.code === 'Space' || e.code === 'Enter') && !overlayScreen.classList.contains('hidden')) {
    launchMatchFromModal();
  }
});

// Initialize UI and start 60fps Game Loop
renderFighterCards();
updateSelectionLabels();

function gameLoop(): void {
  engine.update();
  engine.render();
  requestAnimationFrame(gameLoop);
}

requestAnimationFrame(gameLoop);
