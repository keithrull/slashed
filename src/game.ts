import { AttackFrameData, FIGHTER_ROSTER, FighterConfig, FighterId, StageId } from './fighters';
import { sound } from './audio';
import { WatercolorProjectile, WatercolorRenderer } from './watercolor';

export type GameMode = 'ai' | 'versus' | 'training';
export type AIDifficulty = 'Novice' | 'Ronin' | 'Kensei';

export type FighterState =
  | 'idle'
  | 'walk_fwd'
  | 'walk_back'
  | 'crouch'
  | 'jump'
  | 'dash'
  | 'attack'
  | 'parry'
  | 'hitstun'
  | 'blockstun'
  | 'ko';

export type AttackKey = 'light' | 'medium' | 'heavy' | 'special1' | 'special2' | 'super';

export interface PlayerInputs {
  left: boolean;
  right: boolean;
  up: boolean;
  down: boolean;
  dashPressed: boolean;
  lightPressed: boolean;
  mediumPressed: boolean;
  heavyPressed: boolean;
  parryPressed: boolean;
  special1Pressed: boolean;
  special2Pressed: boolean;
  superPressed: boolean;
}

export class FighterInstance {
  public playerIndex: 0 | 1;
  public config: FighterConfig;
  public x: number;
  public y: number;
  public vx: number = 0;
  public vy: number = 0;
  public facing: 1 | -1;

  public health: number;
  public trailingHealth: number; // White/gold watercolor bar that drains smoothly after taking damage
  public inkMeter: number = 25;  // 0 to 100 (Zanshin Super Art gauge)
  public roundsWon: number = 0;

  public state: FighterState = 'idle';
  public stateFrame: number = 0;
  public stunDuration: number = 0;
  public activeAttackKey: AttackKey | null = null;
  public attackHasConnected: boolean = false;
  public attackHasSpawnedFX: boolean = false;

  public comboCount: number = 0;
  public comboTimer: number = 0;
  public hitFlashFrames: number = 0;
  public parryCooldown: number = 0;
  public animTick: number = 0;

  constructor(playerIndex: 0 | 1, fighterId: FighterId, startX: number, facing: 1 | -1) {
    this.playerIndex = playerIndex;
    this.config = FIGHTER_ROSTER[fighterId];
    this.x = startX;
    this.y = 610;
    this.facing = facing;
    this.health = this.config.maxHealth;
    this.trailingHealth = this.config.maxHealth;
  }

  public resetForRound(startX: number, facing: 1 | -1): void {
    this.x = startX;
    this.y = 610;
    this.vx = 0;
    this.vy = 0;
    this.facing = facing;
    this.health = this.config.maxHealth;
    this.trailingHealth = this.config.maxHealth;
    this.state = 'idle';
    this.stateFrame = 0;
    this.stunDuration = 0;
    this.activeAttackKey = null;
    this.attackHasConnected = false;
    this.attackHasSpawnedFX = false;
    this.comboCount = 0;
    this.comboTimer = 0;
    this.hitFlashFrames = 0;
  }

  public isGrounded(): boolean {
    return this.y >= 610;
  }

  public isHoldingBack(inputs: PlayerInputs): boolean {
    return (this.facing === 1 && inputs.left) || (this.facing === -1 && inputs.right);
  }
}

export class SlashedGameEngine {
  public canvas: HTMLCanvasElement;
  public ctx: CanvasRenderingContext2D;
  public renderer: WatercolorRenderer;

  public mode: GameMode = 'ai';
  public aiDifficulty: AIDifficulty = 'Ronin';
  public stage: StageId = 'crimson_torii';

  public fighters: [FighterInstance, FighterInstance];
  public projectiles: WatercolorProjectile[] = [];

  public roundNumber: number = 1;
  public roundTimer: number = 99;
  public frameTickCounter: number = 0;

  // Hit-stop freeze frames, Screen Shake & Super Darkness
  public hitStopFrames: number = 0;
  public shakeMagnitude: number = 0;
  public superFreezeFrames: number = 0;
  public superActorIndex: 0 | 1 | null = null;

  // Round Banner Announcement ("一合目 — FIRST BOUT", "勝負 — SLASH!", "一本 — IPPON!")
  public bannerKanji: string = '一合目';
  public bannerSubtext: string = 'FIRST BOUT — READY YOUR BLADE';
  public bannerFrames: number = 110;
  public roundOverFrames: number = 0;
  public matchWinnerIndex: 0 | 1 | null = null;
  public isPausedByModal: boolean = true;
  public autoDemoWatch: boolean = false;

  // Input tracking for P1 and P2
  private keysDown: Set<string> = new Set();
  private keysJustPressed: Set<string> = new Set();
  private lastTapTime: Record<string, number> = {};
  private doubleTapDashTriggered: [boolean, boolean] = [false, false];

  constructor(canvas: HTMLCanvasElement) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d')!;
    this.renderer = new WatercolorRenderer(canvas.width, canvas.height);

    // Preload all fighter portraits & multi-pose watercolor sprite sheets
    Object.values(FIGHTER_ROSTER).forEach((f) => {
      this.renderer.preloadPortrait(f.portraitUrl);
      this.renderer.spriteAnimator.ensureFighterLoaded(f.id, f.spriteUrl, f.sheetUrl);
    });

    this.fighters = [
      new FighterInstance(0, 'kazemaru', 360, 1),
      new FighterInstance(1, 'hotaru', 920, -1),
    ];

    this.bindKeyboardListeners();
  }

  private bindKeyboardListeners(): void {
    window.addEventListener('keydown', (e) => {
      const code = e.code;
      if (!this.keysDown.has(code)) {
        this.keysJustPressed.add(code);

        // Detect double-tap left/right for quick Ink Step Dash
        const now = performance.now();
        if (code === 'KeyA' || code === 'KeyD') {
          if (this.lastTapTime[code] && now - this.lastTapTime[code] < 240) {
            this.doubleTapDashTriggered[0] = true;
          }
          this.lastTapTime[code] = now;
        }
        if (code === 'ArrowLeft' || code === 'ArrowRight') {
          if (this.lastTapTime[code] && now - this.lastTapTime[code] < 240) {
            this.doubleTapDashTriggered[1] = true;
          }
          this.lastTapTime[code] = now;
        }
      }
      this.keysDown.add(code);

      // Prevent browser scrolling on Space / Arrows when playing
      if (['Space', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(code)) {
        e.preventDefault();
      }
    });

    window.addEventListener('keyup', (e) => {
      this.keysDown.delete(e.code);
    });
  }

  public startNewMatch(p1Id: FighterId, p2Id: FighterId, mode: GameMode, stage: StageId): void {
    this.mode = mode;
    this.stage = stage;
    this.fighters = [
      new FighterInstance(0, p1Id, 360, 1),
      new FighterInstance(1, p2Id, 920, -1),
    ];
    this.roundNumber = 1;
    this.matchWinnerIndex = null;
    this.renderer.stainCtx.clearRect(0, 0, this.canvas.width, this.canvas.height);
    this.startRound();
  }

  public startRound(): void {
    this.fighters[0].resetForRound(360, 1);
    this.fighters[1].resetForRound(920, -1);
    this.projectiles = [];
    this.roundTimer = this.mode === 'training' ? 999 : 99;
    this.roundOverFrames = 0;

    const roundKanji = ['一合目', '二合目', '最終合'][Math.min(2, this.roundNumber - 1)];
    this.bannerKanji = 'いざ尋常に';
    this.bannerSubtext = `${roundKanji} — ROUND ${this.roundNumber} — SLASH!`;
    this.bannerFrames = 95;
    sound.playKotoArpeggio(false);
    sound.playTaiko(1.1, 68);
  }

  private gatherPlayerInputs(playerIdx: 0 | 1): PlayerInputs {
    if (playerIdx === 0) {
      const uJust = this.keysJustPressed.has('KeyU');
      const iJust = this.keysJustPressed.has('KeyI');
      const dash = this.doubleTapDashTriggered[0] || this.keysJustPressed.has('ShiftLeft');
      this.doubleTapDashTriggered[0] = false;

      return {
        left: this.keysDown.has('KeyA'),
        right: this.keysDown.has('KeyD'),
        up: this.keysDown.has('KeyW'),
        down: this.keysDown.has('KeyS'),
        dashPressed: dash,
        lightPressed: uJust,
        mediumPressed: iJust,
        heavyPressed: this.keysJustPressed.has('KeyO'),
        parryPressed: this.keysJustPressed.has('KeyJ'),
        special1Pressed: this.keysJustPressed.has('KeyK'),
        special2Pressed: this.keysJustPressed.has('KeyL'),
        superPressed:
          this.keysJustPressed.has('Space') ||
          (this.keysDown.has('KeyU') && this.keysDown.has('KeyI') && (uJust || iJust)),
      };
    } else {
      const dash = this.doubleTapDashTriggered[1] || this.keysJustPressed.has('ShiftRight');
      this.doubleTapDashTriggered[1] = false;

      return {
        left: this.keysDown.has('ArrowLeft'),
        right: this.keysDown.has('ArrowRight'),
        up: this.keysDown.has('ArrowUp'),
        down: this.keysDown.has('ArrowDown'),
        dashPressed: dash,
        lightPressed: this.keysJustPressed.has('Numpad4') || this.keysJustPressed.has('KeyV'),
        mediumPressed: this.keysJustPressed.has('Numpad5') || this.keysJustPressed.has('KeyB'),
        heavyPressed: this.keysJustPressed.has('Numpad6') || this.keysJustPressed.has('KeyN'),
        parryPressed: this.keysJustPressed.has('Numpad1') || this.keysJustPressed.has('KeyG'),
        special1Pressed: this.keysJustPressed.has('Numpad2') || this.keysJustPressed.has('KeyH'),
        special2Pressed: this.keysJustPressed.has('Numpad3') || this.keysJustPressed.has('KeyM'),
        superPressed: this.keysJustPressed.has('Enter') || this.keysJustPressed.has('Numpad0'),
      };
    }
  }

  private computeAIInputs(ai: FighterInstance, opponent: FighterInstance): PlayerInputs {
    const empty: PlayerInputs = {
      left: false,
      right: false,
      up: false,
      down: false,
      dashPressed: false,
      lightPressed: false,
      mediumPressed: false,
      heavyPressed: false,
      parryPressed: false,
      special1Pressed: false,
      special2Pressed: false,
      superPressed: false,
    };

    if (this.mode === 'training') {
      // In Dojo Practice mode, CPU blocks if hit recently, refills health & meter automatically
      if (ai.health < ai.config.maxHealth && ai.state === 'idle') {
        ai.health = Math.min(ai.config.maxHealth, ai.health + 4);
      }
      this.fighters[0].inkMeter = 100;
      return empty;
    }

    const dist = Math.abs(ai.x - opponent.x);
    const dirToOpp = opponent.x > ai.x ? 1 : -1;
    const aggroChance =
      this.aiDifficulty === 'Kensei' ? 0.14 : this.aiDifficulty === 'Ronin' ? 0.08 : 0.035;
    const defenseChance =
      this.aiDifficulty === 'Kensei' ? 0.72 : this.aiDifficulty === 'Ronin' ? 0.42 : 0.16;

    // 1. Defensive Reaction if Opponent is Attacking nearby
    if (opponent.state === 'attack' && dist < 210) {
      if (Math.random() < defenseChance * 0.22 && ai.parryCooldown === 0 && ai.state === 'idle') {
        empty.parryPressed = true;
        return empty;
      }
      if (Math.random() < defenseChance) {
        if (dirToOpp === 1) empty.left = true;
        else empty.right = true;
        return empty;
      }
    }

    // 2. Super Art execution when gauge is full and in range
    if (ai.inkMeter >= 100 && dist < 245 && Math.random() < aggroChance * 1.4) {
      empty.superPressed = true;
      return empty;
    }

    // 3. Anti-air Rising Dragon Brush if player jumps in
    if (!opponent.isGrounded() && dist < 175 && Math.random() < aggroChance * 1.6) {
      empty.special2Pressed = true;
      return empty;
    }

    // 4. Close-mid range sword exchanges & combo cancels
    if (dist <= 165) {
      if (ai.state === 'attack' && ai.attackHasConnected) {
        // AI combo cancels Light -> Medium -> Heavy / Special
        if (ai.activeAttackKey === 'light' && Math.random() < 0.65) empty.mediumPressed = true;
        else if (ai.activeAttackKey === 'medium' && Math.random() < 0.55) empty.heavyPressed = true;
        else if (ai.activeAttackKey === 'heavy' && Math.random() < 0.45) empty.special1Pressed = true;
        return empty;
      }

      if (Math.random() < aggroChance) {
        const roll = Math.random();
        if (roll < 0.42) empty.lightPressed = true;
        else if (roll < 0.76) empty.mediumPressed = true;
        else empty.heavyPressed = true;
      } else if (Math.random() < 0.25) {
        // Micro spacing step back
        if (dirToOpp === 1) empty.left = true;
        else empty.right = true;
      }
    } else if (dist > 165 && dist < 380) {
      // Mid-far range: approach or throw Watercolor Wave projectile
      if (Math.random() < aggroChance * 0.45) {
        empty.special1Pressed = true;
      } else if (Math.random() < aggroChance * 0.55) {
        empty.dashPressed = true;
        if (dirToOpp === 1) empty.right = true;
        else empty.left = true;
      } else {
        if (dirToOpp === 1) empty.right = true;
        else empty.left = true;
      }
    } else {
      // Far range: close distance
      if (dirToOpp === 1) empty.right = true;
      else empty.left = true;
    }

    return empty;
  }

  public update(): void {
    if (this.isPausedByModal) return;

    this.frameTickCounter++;

    if (this.bannerFrames > 0) {
      this.bannerFrames--;
    }

    // Dramatic Super Art freeze frame (Sumi-e Calligraphic Cut-In)
    if (this.superFreezeFrames > 0) {
      this.superFreezeFrames--;
      this.keysJustPressed.clear();
      return;
    }

    // Hit-stop impact freeze frames (gives katana slashes heavy weight!)
    if (this.hitStopFrames > 0) {
      this.hitStopFrames--;
      this.keysJustPressed.clear();
      return;
    }

    // Round Timer countdown (every 60 frames = 1 second)
    if (this.roundOverFrames === 0 && this.mode !== 'training' && this.frameTickCounter % 60 === 0) {
      if (this.roundTimer > 0) {
        this.roundTimer--;
        if (this.roundTimer === 0) {
          this.handleTimeOver();
        }
      }
    }

    // Handle Round Over transition
    if (this.roundOverFrames > 0) {
      this.roundOverFrames--;
      if (this.roundOverFrames === 0) {
        if (this.matchWinnerIndex !== null) {
          // Reset full match after brief celebration
          this.fighters[0].roundsWon = 0;
          this.fighters[1].roundsWon = 0;
          this.roundNumber = 1;
          this.matchWinnerIndex = null;
        } else {
          this.roundNumber++;
        }
        this.startRound();
      }
    }

    const p1Inputs = this.autoDemoWatch
      ? this.computeAIInputs(this.fighters[0], this.fighters[1])
      : this.gatherPlayerInputs(0);
    const p2Inputs =
      this.mode === 'versus' && !this.autoDemoWatch
        ? this.gatherPlayerInputs(1)
        : this.computeAIInputs(this.fighters[1], this.fighters[0]);

    this.updateFighter(this.fighters[0], this.fighters[1], p1Inputs);
    this.updateFighter(this.fighters[1], this.fighters[0], p2Inputs);

    this.resolveFighterPushboxCollision();
    this.updateProjectiles();
    this.checkMeleeHitboxes(this.fighters[0], this.fighters[1]);
    this.checkMeleeHitboxes(this.fighters[1], this.fighters[0]);

    if (this.shakeMagnitude > 0) {
      this.shakeMagnitude *= 0.82;
      if (this.shakeMagnitude < 0.4) this.shakeMagnitude = 0;
    }

    this.keysJustPressed.clear();
  }

  private updateFighter(
    f: FighterInstance,
    opponent: FighterInstance,
    inputs: PlayerInputs
  ): void {
    f.animTick++;
    if (f.hitFlashFrames > 0) f.hitFlashFrames--;
    if (f.parryCooldown > 0) f.parryCooldown--;

    // Smoothly drain trailing watercolor health bar
    if (f.trailingHealth > f.health) {
      f.trailingHealth = Math.max(f.health, f.trailingHealth - 2.8);
    }

    // Reset combo counter if opponent has recovered from hitstun
    if (opponent.state !== 'hitstun' && f.comboCount > 0) {
      f.comboTimer++;
      if (f.comboTimer > 20) {
        f.comboCount = 0;
        f.comboTimer = 0;
      }
    }

    if (f.state === 'ko') {
      f.vx *= 0.85;
      f.x += f.vx;
      this.applyGravityAndBounds(f);
      return;
    }

    // Auto-face opponent when neutral on the ground
    if (
      f.isGrounded() &&
      (f.state === 'idle' || f.state === 'walk_fwd' || f.state === 'walk_back' || f.state === 'crouch')
    ) {
      f.facing = opponent.x >= f.x ? 1 : -1;
    }

    // Stun States (Hitstun / Blockstun)
    if (f.state === 'hitstun' || f.state === 'blockstun') {
      f.stateFrame++;
      f.vx *= 0.86;
      f.x += f.vx;
      this.applyGravityAndBounds(f);
      if (f.stateFrame >= f.stunDuration && f.isGrounded()) {
        f.state = 'idle';
        f.stateFrame = 0;
      }
      return;
    }

    // Mind's Eye Parry State
    if (f.state === 'parry') {
      f.stateFrame++;
      f.vx *= 0.8;
      f.x += f.vx;
      if (f.stateFrame >= 18) {
        f.state = 'idle';
        f.stateFrame = 0;
      }
      return;
    }

    // Check Attack Cancels & Initiations
    const canStartAttack =
      f.state === 'idle' ||
      f.state === 'walk_fwd' ||
      f.state === 'walk_back' ||
      f.state === 'crouch' ||
      f.state === 'dash' ||
      f.state === 'jump' ||
      this.canCancelCurrentAttack(f, inputs);

    if (canStartAttack && this.roundOverFrames === 0) {
      if (inputs.superPressed && f.inkMeter >= 100) {
        this.triggerAttack(f, 'super');
        return;
      }
      if (inputs.special2Pressed) {
        this.triggerAttack(f, 'special2');
        return;
      }
      if (inputs.special1Pressed) {
        this.triggerAttack(f, 'special1');
        return;
      }
      if (inputs.heavyPressed) {
        this.triggerAttack(f, 'heavy');
        return;
      }
      if (inputs.mediumPressed) {
        this.triggerAttack(f, 'medium');
        return;
      }
      if (inputs.lightPressed) {
        this.triggerAttack(f, 'light');
        return;
      }
    }

    // Active Attack Progression
    if (f.state === 'attack' && f.activeAttackKey) {
      const atk = f.config.attacks[f.activeAttackKey];
      f.stateFrame++;

      // Apply forward/upward blade impulse on first active frame
      if (f.stateFrame === atk.startup) {
        if (atk.forwardImpulse) {
          f.vx = f.facing * atk.forwardImpulse;
        }
        if (atk.upwardImpulse) {
          f.vy = atk.upwardImpulse;
        }
      }

      // Spawn Sumi-e Slash Arc & Sound on first active frame
      if (f.stateFrame === atk.startup + 1 && !f.attackHasSpawnedFX) {
        f.attackHasSpawnedFX = true;
        sound.playBrushSlash(Boolean(atk.isHeavy));

        this.renderer.addSlashRibbon(
          f.x + f.facing * 24,
          f.y + atk.offsetY,
          f.facing,
          atk.slashArcStart,
          atk.slashArcEnd,
          atk.slashRadius,
          f.config.primaryInk,
          f.config.accentWatercolor,
          Boolean(atk.isHeavy),
          Boolean(atk.isSuper)
        );

        // Stamp dry-brush ink mark along the background scroll for heavy/special cuts
        if (atk.isHeavy || atk.isSpecial || atk.isSuper) {
          this.renderer.stampDryBrushSlash(
            f.x - f.facing * 30,
            f.y + atk.offsetY + 20,
            f.x + f.facing * atk.reachX,
            f.y + atk.offsetY - 25,
            atk.isSuper ? 28 : 14,
            atk.isSuper ? f.config.accentWatercolor : f.config.primaryInk,
            atk.isSuper ? 0.36 : 0.22
          );
        }

        if (atk.spawnsProjectile) {
          this.spawnWatercolorProjectile(f, atk);
        }
      }

      f.vx *= 0.85;
      f.x += f.vx;
      this.applyGravityAndBounds(f);

      const totalFrames = atk.startup + atk.active + atk.recovery;
      if (f.stateFrame >= totalFrames) {
        f.state = f.isGrounded() ? 'idle' : 'jump';
        f.stateFrame = 0;
        f.activeAttackKey = null;
      }
      return;
    }

    // Mind's Eye Parry Trigger
    if (inputs.parryPressed && f.isGrounded() && f.parryCooldown === 0) {
      f.state = 'parry';
      f.stateFrame = 0;
      f.parryCooldown = 28;
      sound.playBrushSlash(false);
      this.renderer.spawnFloatingKanji('心眼', "MIND'S EYE", f.x, f.y - 135, '#d49b27');
      return;
    }

    // Dash State
    if (f.state === 'dash') {
      f.stateFrame++;
      f.x += f.vx;
      if (f.stateFrame % 2 === 0) {
        this.renderer.spawnInkBurst(f.x, f.y - 15, 2, f.config.primaryInk, f.config.accentWatercolor, -f.vx * 0.4);
      }
      this.applyGravityAndBounds(f);
      if (f.stateFrame >= 12) {
        f.state = 'idle';
        f.vx = 0;
      }
      return;
    }

    // Initiate Ink Step Dash
    if (inputs.dashPressed && f.isGrounded()) {
      f.state = 'dash';
      f.stateFrame = 0;
      const dashDir = inputs.left ? -1 : inputs.right ? 1 : f.facing;
      f.vx = dashDir * f.config.dashSpeed;
      sound.playBrushSlash(false);
      this.renderer.stampWatercolorBloom(f.x, 608, 28, f.config.primaryInk, 0.25);
      return;
    }

    // Jump Initiation
    if (inputs.up && f.isGrounded()) {
      f.state = 'jump';
      f.vy = f.config.jumpForce;
      if (inputs.left) f.vx = -f.config.walkSpeed * 1.1;
      else if (inputs.right) f.vx = f.config.walkSpeed * 1.1;
      this.renderer.stampWatercolorBloom(f.x, 608, 24, f.config.primaryInk, 0.2);
    }

    // Airborne Physics
    if (!f.isGrounded()) {
      f.x += f.vx;
      this.applyGravityAndBounds(f);
      if (f.isGrounded()) {
        f.state = 'idle';
        f.vx *= 0.35;
        sound.playTaiko(0.45, 110);
        this.renderer.spawnInkBurst(f.x, 608, 6, f.config.primaryInk, f.config.accentWatercolor);
        this.renderer.stampWatercolorBloom(f.x, 608, 22, f.config.primaryInk, 0.18);
      }
      return;
    }

    // Crouch vs Smooth Accelerated Walk vs Friction Deceleration
    if (inputs.down) {
      f.state = 'crouch';
      f.vx *= 0.65;
      f.x += f.vx;
    } else if (inputs.left) {
      f.state = f.facing === 1 ? 'walk_back' : 'walk_fwd';
      const targetVx = -f.config.walkSpeed * (f.state === 'walk_back' ? 0.82 : 1.0);
      f.vx += (targetVx - f.vx) * 0.35;
      f.x += f.vx;
      if (f.animTick % 14 === 0) {
        this.renderer.spawnInkBurst(f.x, 608, 2, f.config.primaryInk, f.config.accentWatercolor, 1.5);
      }
    } else if (inputs.right) {
      f.state = f.facing === -1 ? 'walk_back' : 'walk_fwd';
      const targetVx = f.config.walkSpeed * (f.state === 'walk_back' ? 0.82 : 1.0);
      f.vx += (targetVx - f.vx) * 0.35;
      f.x += f.vx;
      if (f.animTick % 14 === 0) {
        this.renderer.spawnInkBurst(f.x, 608, 2, f.config.primaryInk, f.config.accentWatercolor, -1.5);
      }
    } else {
      f.state = 'idle';
      f.vx *= 0.72;
      if (Math.abs(f.vx) < 0.15) f.vx = 0;
      f.x += f.vx;
    }

    this.applyGravityAndBounds(f);
  }

  private canCancelCurrentAttack(f: FighterInstance, inputs: PlayerInputs): boolean {
    if (f.state !== 'attack' || !f.activeAttackKey || !f.attackHasConnected) return false;

    const current = f.activeAttackKey;
    // Target combo & special cancel hierarchy:
    // Light -> Medium / Heavy / Special / Super
    // Medium -> Heavy / Special / Super
    // Heavy -> Special / Super
    // Special -> Super
    if (inputs.superPressed && f.inkMeter >= 100 && current !== 'super') {
      return true;
    }
    if (inputs.special1Pressed || inputs.special2Pressed) {
      return current === 'light' || current === 'medium' || current === 'heavy';
    }
    if (inputs.heavyPressed) {
      return current === 'light' || current === 'medium';
    }
    if (inputs.mediumPressed) {
      return current === 'light';
    }
    return false;
  }

  private triggerAttack(f: FighterInstance, key: AttackKey): void {
    f.state = 'attack';
    f.stateFrame = 0;
    f.activeAttackKey = key;
    f.attackHasConnected = false;
    f.attackHasSpawnedFX = false;

    const atk = f.config.attacks[key];
    if (key === 'super') {
      f.inkMeter = 0;
      this.superFreezeFrames = 34;
      this.superActorIndex = f.playerIndex;
      sound.playKotoArpeggio(true);
      sound.playTaiko(1.4, 52);
      this.renderer.spawnFloatingKanji(atk.kanji, atk.name.toUpperCase(), f.x, f.y - 160, f.config.accentWatercolor);
      this.renderer.spawnInkBurst(f.x, f.y - 90, 32, f.config.accentWatercolor, f.config.primaryInk);
    } else if (key === 'special1' || key === 'special2') {
      this.renderer.spawnFloatingKanji(atk.kanji, undefined, f.x, f.y - 145, f.config.accentWatercolor);
    }
  }

  private spawnWatercolorProjectile(f: FighterInstance, atk: AttackFrameData): void {
    this.projectiles.push({
      ownerIndex: f.playerIndex,
      x: f.x + f.facing * 75,
      y: f.y - 84,
      vx: f.facing * 11.5,
      radius: 36,
      damage: atk.damage,
      chipDamage: atk.chipDamage,
      hitstun: atk.hitstun,
      blockstun: atk.blockstun,
      knockbackX: atk.knockbackX,
      primaryColor: f.config.accentWatercolor,
      secondaryColor: f.config.secondaryWatercolor,
      kanji: atk.kanji[0] || '波',
      active: true,
      trailTimer: 0,
    });
  }

  private updateProjectiles(): void {
    for (let i = this.projectiles.length - 1; i >= 0; i--) {
      const p = this.projectiles[i];
      if (!p.active) {
        this.projectiles.splice(i, 1);
        continue;
      }

      p.x += p.vx;
      p.trailTimer++;

      if (p.trailTimer % 2 === 0) {
        this.renderer.spawnInkBurst(p.x, p.y, 2, p.primaryColor, p.secondaryColor, -p.vx * 0.2);
      }

      if (p.x < -80 || p.x > this.canvas.width + 80) {
        p.active = false;
        continue;
      }

      // Check collision with enemy projectile (clash!)
      for (let j = i - 1; j >= 0; j--) {
        const other = this.projectiles[j];
        if (other.active && other.ownerIndex !== p.ownerIndex) {
          if (Math.hypot(p.x - other.x, p.y - other.y) < p.radius + other.radius) {
            p.active = false;
            other.active = false;
            sound.playHitImpact(true, true);
            this.renderer.spawnInkBurst((p.x + other.x) * 0.5, p.y, 20, p.primaryColor, other.primaryColor);
            this.renderer.spawnFloatingKanji('相殺', 'CLASH!', (p.x + other.x) * 0.5, p.y - 30, '#d49b27');
          }
        }
      }

      if (!p.active) continue;

      // Check hit against defender
      const defender = this.fighters[p.ownerIndex === 0 ? 1 : 0];
      const attacker = this.fighters[p.ownerIndex];
      if (defender.state === 'ko') continue;

      const defLeft = defender.x - defender.config.bodyWidth * 0.5;
      const defRight = defender.x + defender.config.bodyWidth * 0.5;
      const defTop = defender.y - defender.config.bodyHeight;
      const defBottom = defender.y;

      if (
        p.x + p.radius > defLeft &&
        p.x - p.radius < defRight &&
        p.y + p.radius > defTop &&
        p.y - p.radius < defBottom
      ) {
        p.active = false;
        this.applyAttackImpact(
          attacker,
          defender,
          {
            name: 'Wave Art',
            kanji: p.kanji,
            startup: 0,
            active: 0,
            recovery: 0,
            damage: p.damage,
            chipDamage: p.chipDamage,
            meterGain: 12,
            hitstun: p.hitstun,
            blockstun: p.blockstun,
            knockbackX: p.knockbackX,
            knockbackY: -3.5,
            reachX: 0,
            reachY: 0,
            offsetY: -80,
            slashArcStart: 0,
            slashArcEnd: 0,
            slashRadius: 0,
            isSpecial: true,
          },
          p.x,
          p.y
        );
      }
    }
  }

  private checkMeleeHitboxes(attacker: FighterInstance, defender: FighterInstance): void {
    if (
      attacker.state !== 'attack' ||
      !attacker.activeAttackKey ||
      attacker.attackHasConnected ||
      defender.state === 'ko'
    ) {
      return;
    }

    const atk = attacker.config.attacks[attacker.activeAttackKey];
    if (attacker.stateFrame < atk.startup || attacker.stateFrame > atk.startup + atk.active) {
      return;
    }

    // Compute attack bounding box in front of attacker
    const hitX1 = attacker.facing === 1 ? attacker.x - 10 : attacker.x - atk.reachX;
    const hitX2 = attacker.facing === 1 ? attacker.x + atk.reachX : attacker.x + 10;
    const hitY1 = attacker.y + atk.offsetY - atk.reachY * 0.5;
    const hitY2 = attacker.y + atk.offsetY + atk.reachY * 0.5;

    const defX1 = defender.x - defender.config.bodyWidth * 0.55;
    const defX2 = defender.x + defender.config.bodyWidth * 0.55;
    const defY1 = defender.y - defender.config.bodyHeight;
    const defY2 = defender.y;

    const overlaps = hitX1 < defX2 && hitX2 > defX1 && hitY1 < defY2 && hitY2 > defY1;
    if (!overlaps) return;

    attacker.attackHasConnected = true;

    // Blade Clash! If both fighters are in active attack frames simultaneously
    if (defender.state === 'attack' && defender.activeAttackKey) {
      const defAtk = defender.config.attacks[defender.activeAttackKey];
      if (
        defender.stateFrame >= defAtk.startup &&
        defender.stateFrame <= defAtk.startup + defAtk.active
      ) {
        defender.attackHasConnected = true;
        this.hitStopFrames = 12;
        this.shakeMagnitude = 12;
        attacker.vx = -attacker.facing * 10;
        defender.vx = -defender.facing * 10;
        sound.playParryFlash();
        const midX = (attacker.x + defender.x) * 0.5;
        this.renderer.spawnInkBurst(midX, attacker.y - 90, 28, '#ffd43b', '#181512');
        this.renderer.spawnFloatingKanji('鍔迫合', 'BLADE CLASH!', midX, attacker.y - 130, '#d49b27');
        return;
      }
    }

    const impactX = (attacker.x + defender.x) * 0.5;
    const impactY = defender.y - defender.config.bodyHeight * 0.55;
    this.applyAttackImpact(attacker, defender, atk, impactX, impactY);
  }

  private applyAttackImpact(
    attacker: FighterInstance,
    defender: FighterInstance,
    atk: AttackFrameData,
    impactX: number,
    impactY: number
  ): void {
    // 1. Check Mind's Eye Parry (心眼)!
    if (defender.state === 'parry') {
      this.hitStopFrames = 16;
      this.shakeMagnitude = 14;
      defender.inkMeter = Math.min(100, defender.inkMeter + 28);
      defender.state = 'idle';
      defender.stateFrame = 0;

      // Put attacker into long counter-vulnerable recovery!
      attacker.state = 'hitstun';
      attacker.stateFrame = 0;
      attacker.stunDuration = 28;
      attacker.vx = -attacker.facing * 8.5;

      sound.playParryFlash();
      this.renderer.spawnInkBurst(impactX, impactY, 34, '#fcc419', defender.config.accentWatercolor);
      this.renderer.stampWatercolorBloom(impactX, impactY, 64, '#fcc419', 0.35);
      this.renderer.spawnFloatingKanji('見切', 'PARRY COUNTER!', impactX, impactY - 45, '#e67700');
      return;
    }

    // 2. Check Guard / Block (holding away from attacker while grounded and idle/walk_back/crouch/blockstun)
    const defInputs =
      defender.playerIndex === 0
        ? this.gatherPlayerInputs(0)
        : this.mode === 'versus'
          ? this.gatherPlayerInputs(1)
          : {
              left: defender.state === 'walk_back' && defender.facing === 1,
              right: defender.state === 'walk_back' && defender.facing === -1,
            };

    const isBlocking =
      defender.isGrounded() &&
      (defender.state === 'walk_back' ||
        defender.state === 'blockstun' ||
        (defender.state === 'crouch' &&
          ((defender.facing === 1 && defInputs.left) ||
            (defender.facing === -1 && defInputs.right))));

    if (isBlocking) {
      defender.health = Math.max(1, defender.health - atk.chipDamage);
      defender.state = 'blockstun';
      defender.stateFrame = 0;
      defender.stunDuration = atk.blockstun;
      defender.vx = attacker.facing * atk.knockbackX * 0.65;

      attacker.inkMeter = Math.min(100, attacker.inkMeter + Math.floor(atk.meterGain * 0.5));
      defender.inkMeter = Math.min(100, defender.inkMeter + Math.floor(atk.meterGain * 0.4));

      this.hitStopFrames = atk.isHeavy ? 7 : 4;
      this.shakeMagnitude = atk.isHeavy ? 6 : 3;
      sound.playHitImpact(Boolean(atk.isHeavy), true);

      this.renderer.spawnInkBurst(impactX, impactY, 12, '#adb5bd', defender.config.primaryInk, attacker.facing * 4);
      this.renderer.spawnFloatingKanji('防', 'GUARD', impactX, impactY - 30, '#495057');
      return;
    }

    // 3. Clean Hit! Apply Combo Scaling, Crimson Ink Blossom & Stun
    attacker.comboCount++;
    attacker.comboTimer = 0;
    const comboScale = Math.max(0.45, 1 - (attacker.comboCount - 1) * 0.1);
    const finalDamage = Math.round(atk.damage * comboScale);

    defender.health = Math.max(0, defender.health - finalDamage);
    defender.state = 'hitstun';
    defender.stateFrame = 0;
    defender.stunDuration = atk.hitstun;
    defender.hitFlashFrames = 6;
    defender.vx = attacker.facing * atk.knockbackX;
    if (atk.knockbackY < -4) {
      defender.vy = atk.knockbackY;
    }

    attacker.inkMeter = Math.min(100, attacker.inkMeter + atk.meterGain);
    defender.inkMeter = Math.min(100, defender.inkMeter + Math.floor(atk.meterGain * 0.45));

    this.hitStopFrames = atk.isSuper ? 18 : atk.isHeavy ? 11 : 6;
    this.shakeMagnitude = atk.isSuper ? 22 : atk.isHeavy ? 13 : 6;

    sound.playHitImpact(Boolean(atk.isHeavy || atk.isSuper), false);

    // Stamp permanent watercolor crimson & character pigment blooms onto the Washi scroll!
    this.renderer.stampWatercolorBloom(
      impactX,
      impactY,
      atk.isSuper ? 85 : atk.isHeavy ? 54 : 34,
      attacker.config.accentWatercolor,
      atk.isSuper ? 0.4 : 0.28
    );

    this.renderer.spawnInkBurst(
      impactX,
      impactY,
      atk.isSuper ? 45 : atk.isHeavy ? 26 : 14,
      attacker.config.accentWatercolor,
      attacker.config.primaryInk,
      attacker.facing * 7
    );

    const hitKanji = atk.isSuper
      ? '一閃'
      : attacker.comboCount >= 3
        ? `${attacker.comboCount}連斬`
        : atk.isHeavy
          ? '痛恨'
          : '斬';
    const hitSub =
      attacker.comboCount >= 2 ? `${attacker.comboCount} HIT BRUSH COMBO!` : atk.name.toUpperCase();

    this.renderer.spawnFloatingKanji(hitKanji, hitSub, impactX, impactY - 40, attacker.config.accentWatercolor);

    // Check K.O. (Ippon!)
    if (defender.health <= 0 && this.roundOverFrames === 0) {
      this.triggerKnockout(attacker, defender);
    }
  }

  private triggerKnockout(winner: FighterInstance, loser: FighterInstance): void {
    loser.health = 0;
    loser.state = 'ko';
    loser.vx = winner.facing * 14;
    loser.vy = -10;

    winner.roundsWon++;
    this.hitStopFrames = 26;
    this.shakeMagnitude = 24;
    this.roundOverFrames = 170;

    sound.playKotoArpeggio(true);
    sound.playTaiko(1.5, 48);

    // Giant crimson & sumi K.O. splash on the paper scroll
    this.renderer.stampWatercolorBloom(loser.x, loser.y - 70, 115, '#c92a2a', 0.42);
    this.renderer.spawnInkBurst(loser.x, loser.y - 75, 55, '#c92a2a', '#181512', winner.facing * 9);

    if (winner.roundsWon >= 2) {
      this.matchWinnerIndex = winner.playerIndex;
      this.bannerKanji = '勝負あり';
      this.bannerSubtext = `${winner.config.name} (${winner.config.kanji}) CLAIMS VICTORY!`;
    } else {
      this.bannerKanji = '一本';
      this.bannerSubtext = `IPPON! — ${winner.config.name} TAKES THE BOUT`;
    }
    this.bannerFrames = 165;
  }

  private handleTimeOver(): void {
    const [p1, p2] = this.fighters;
    const winner = p1.health >= p2.health ? p1 : p2;
    winner.roundsWon++;
    this.roundOverFrames = 150;
    if (winner.roundsWon >= 2) {
      this.matchWinnerIndex = winner.playerIndex;
    }
    this.bannerKanji = '時間切';
    this.bannerSubtext = `TIME OVER — ${winner.config.name} WINS BY SPIRIT`;
    this.bannerFrames = 145;
    sound.playTaiko(1.2, 60);
  }

  private applyGravityAndBounds(f: FighterInstance): void {
    if (f.y < 610 || f.vy < 0) {
      f.y += f.vy;
      f.vy += 0.88; // Gravity
      if (f.y >= 610) {
        f.y = 610;
        f.vy = 0;
      }
    }
    // Keep within Dojo scroll margins
    const margin = 65;
    if (f.x < margin) f.x = margin;
    if (f.x > this.canvas.width - margin) f.x = this.canvas.width - margin;
  }

  private resolveFighterPushboxCollision(): void {
    const [f1, f2] = this.fighters;
    const minDistance = (f1.config.bodyWidth + f2.config.bodyWidth) * 0.46;
    const dx = f2.x - f1.x;
    const absDx = Math.abs(dx);
    const absDy = Math.abs(f2.y - f1.y);

    if (absDx < minDistance && absDy < 110) {
      const overlap = (minDistance - absDx) * 0.5;
      const sign = dx >= 0 ? 1 : -1;
      f1.x -= sign * overlap;
      f2.x += sign * overlap;
    }
  }

  public render(): void {
    const ctx = this.ctx;
    ctx.save();

    // Apply Camera Screen Shake
    if (this.shakeMagnitude > 0) {
      const sx = (Math.random() - 0.5) * this.shakeMagnitude;
      const sy = (Math.random() - 0.5) * this.shakeMagnitude;
      ctx.translate(sx, sy);
    }

    const superDark =
      this.superFreezeFrames > 0
        ? 1.0
        : this.fighters.some((f) => f.state === 'attack' && f.activeAttackKey === 'super')
          ? 0.65
          : 0;

    // 1. Render Washi Paper, Stage Watercolor Artwork, Mist & Dried Ink Stains
    this.renderer.renderBackground(ctx, this.stage, performance.now(), superDark);

    // 2. Render Both Samurai Fighters
    for (const f of this.fighters) {
      this.renderer.renderSamuraiFighter(
        ctx,
        f.config,
        f.x,
        f.y,
        f.vx,
        f.vy,
        f.isGrounded(),
        f.facing,
        f.state,
        f.stateFrame,
        f.animTick,
        f.health / f.config.maxHealth,
        f.state === 'parry',
        f.hitFlashFrames,
        f.activeAttackKey
      );
    }

    // 3. Render Slash Ribbons, Watercolor Projectiles, Petals & Floating Kanji
    this.renderer.updateAndRenderEffects(ctx, this.projectiles);

    // 4. Render Super Art Dramatic Cut-In Portrait Banner
    if (this.superFreezeFrames > 0 && this.superActorIndex !== null) {
      this.renderSuperCutInBanner(ctx, this.fighters[this.superActorIndex]);
    }

    // 5. Render Traditional Brush-Stroke HUD (Health Bars, Portraits, Round Seals, Zanshin Ink Gauges)
    this.renderBrushHud(ctx);

    // 6. Render Center Calligraphic Round / K.O. Banner
    if (this.bannerFrames > 0) {
      this.renderCalligraphicBanner(ctx);
    }

    ctx.restore();
  }

  private renderBrushHud(ctx: CanvasRenderingContext2D): void {
    const [p1, p2] = this.fighters;

    // --- Center Round Timer in Enso Brush Circle ---
    ctx.save();
    const centerX = this.canvas.width * 0.5;
    const topY = 66;

    ctx.fillStyle = 'rgba(244, 236, 225, 0.9)';
    ctx.strokeStyle = '#181512';
    ctx.lineWidth = 4;
    ctx.beginPath();
    ctx.arc(centerX, topY, 34, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();

    ctx.fillStyle = this.roundTimer <= 15 ? '#c92a2a' : '#181512';
    ctx.font = '900 28px "Cinzel Decorative", "Noto Serif JP", serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(this.mode === 'training' ? '∞' : String(this.roundTimer), centerX, topY + 2);

    // --- Player 1 Left Health & Ink Gauge ---
    this.drawFighterHudSide(ctx, p1, 42, 42, false);
    // --- Player 2 Right Health & Ink Gauge ---
    this.drawFighterHudSide(ctx, p2, this.canvas.width - 42, 42, true);

    ctx.restore();
  }

  private drawFighterHudSide(
    ctx: CanvasRenderingContext2D,
    f: FighterInstance,
    anchorX: number,
    anchorY: number,
    isRightSide: boolean
  ): void {
    ctx.save();
    const barW = 445;
    const barH = 24;
    const portraitSize = 66;

    // Portrait Frame
    const portX = isRightSide ? anchorX - portraitSize : anchorX;
    const img = this.renderer.preloadPortrait(f.config.portraitUrl);

    ctx.fillStyle = '#e6d7c3';
    ctx.strokeStyle = f.config.primaryInk;
    ctx.lineWidth = 3.5;
    ctx.fillRect(portX, anchorY, portraitSize, portraitSize);
    if (img.complete && img.naturalWidth > 0) {
      ctx.drawImage(img, portX, anchorY, portraitSize, portraitSize);
    }
    ctx.strokeRect(portX, anchorY, portraitSize, portraitSize);

    // Health Bar Coordinates
    const barX = isRightSide ? portX - 12 - barW : portX + portraitSize + 12;
    const barY = anchorY + 6;

    // Background sumi brush trough
    ctx.fillStyle = 'rgba(24, 21, 18, 0.82)';
    ctx.fillRect(barX - 3, barY - 3, barW + 6, barH + 6);

    // Trailing damage watercolor bar (gold/white)
    const trailRatio = Math.max(0, f.trailingHealth / f.config.maxHealth);
    const healthRatio = Math.max(0, f.health / f.config.maxHealth);

    const trailW = barW * trailRatio;
    const fillW = barW * healthRatio;

    ctx.fillStyle = '#f3d9fa';
    if (isRightSide) {
      ctx.fillRect(barX + (barW - trailW), barY, trailW, barH);
    } else {
      ctx.fillRect(barX, barY, trailW, barH);
    }

    // Active Watercolor Health Gradient
    const grad = ctx.createLinearGradient(barX, barY, barX + barW, barY);
    if (healthRatio < 0.28) {
      grad.addColorStop(0, '#c92a2a');
      grad.addColorStop(1, '#ff6b6b');
    } else {
      grad.addColorStop(0, f.config.accentWatercolor);
      grad.addColorStop(1, f.config.secondaryWatercolor);
    }
    ctx.fillStyle = grad;

    if (isRightSide) {
      ctx.fillRect(barX + (barW - fillW), barY, fillW, barH);
    } else {
      ctx.fillRect(barX, barY, fillW, barH);
    }

    // Name, Kanji & Round Victory Hanko Stamps below health bar
    ctx.fillStyle = '#181512';
    ctx.font = '900 15px "Noto Serif JP", serif';
    ctx.textAlign = isRightSide ? 'right' : 'left';
    const textX = isRightSide ? barX + barW : barX;
    ctx.fillText(`${f.config.name} 【${f.config.kanji}】`, textX, barY + barH + 20);

    // Round Win Hanko Seals (2 required to win match)
    for (let r = 0; r < 2; r++) {
      const sealX = isRightSide ? barX + 14 + r * 28 : barX + barW - 14 - r * 28;
      const sealY = barY + barH + 15;
      ctx.strokeStyle = '#c92a2a';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.arc(sealX, sealY, 10, 0, Math.PI * 2);
      ctx.stroke();

      if (f.roundsWon > r) {
        ctx.fillStyle = '#c92a2a';
        ctx.beginPath();
        ctx.arc(sealX, sealY, 8, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillStyle = '#fff';
        ctx.font = '900 11px "Yuji Syuku", serif';
        ctx.textAlign = 'center';
        ctx.fillText('勝', sealX, sealY + 1);
      }
    }

    // --- Bottom Zanshin Super Ink Gauge (墨奥義) ---
    const meterW = 340;
    const meterH = 15;
    const meterX = isRightSide ? this.canvas.width - 46 - meterW : 46;
    const meterY = this.canvas.height - 42;

    ctx.fillStyle = 'rgba(24, 21, 18, 0.85)';
    ctx.fillRect(meterX - 2, meterY - 2, meterW + 4, meterH + 4);

    const meterRatio = f.inkMeter / 100;
    const mFill = meterW * meterRatio;

    ctx.fillStyle = f.inkMeter >= 100 ? '#fcc419' : f.config.accentWatercolor;
    if (isRightSide) {
      ctx.fillRect(meterX + (meterW - mFill), meterY, mFill, meterH);
    } else {
      ctx.fillRect(meterX, meterY, mFill, meterH);
    }

    ctx.fillStyle = f.inkMeter >= 100 ? '#ffe066' : '#f4ece1';
    ctx.font = '900 12px "Noto Serif JP", serif';
    ctx.textAlign = isRightSide ? 'right' : 'left';
    const labelX = isRightSide ? meterX + meterW : meterX;
    ctx.fillText(
      f.inkMeter >= 100 ? '🔥 墨奥義 ZANSHIN READY! (SPACE / ENTER)' : `墨氣 INK SPIRIT: ${Math.floor(f.inkMeter)}%`,
      labelX,
      meterY - 7
    );

    ctx.restore();
  }

  private renderSuperCutInBanner(ctx: CanvasRenderingContext2D, f: FighterInstance): void {
    ctx.save();
    const bandY = this.canvas.height * 0.36;
    const bandH = 165;

    // Slash banner across center screen
    ctx.fillStyle = '#181512';
    ctx.fillRect(0, bandY, this.canvas.width, bandH);

    ctx.strokeStyle = f.config.accentWatercolor;
    ctx.lineWidth = 6;
    ctx.beginPath();
    ctx.moveTo(0, bandY);
    ctx.lineTo(this.canvas.width, bandY);
    ctx.moveTo(0, bandY + bandH);
    ctx.lineTo(this.canvas.width, bandY + bandH);
    ctx.stroke();

    // Portrait Close-up inside Cut-In
    const img = this.renderer.preloadPortrait(f.config.portraitUrl);
    if (img.complete && img.naturalWidth > 0) {
      ctx.drawImage(img, 180, bandY + 6, bandH - 12, bandH - 12);
    }

    const atk = f.config.attacks.super;
    ctx.fillStyle = '#fff9f0';
    ctx.font = '900 64px "Yuji Syuku", serif';
    ctx.textAlign = 'left';
    ctx.fillText(atk.kanji, 380, bandY + 95);

    ctx.fillStyle = f.config.accentWatercolor;
    ctx.font = '900 22px "Cinzel Decorative", serif';
    ctx.fillText(atk.name.toUpperCase(), 385, bandY + 138);

    ctx.restore();
  }

  private renderCalligraphicBanner(ctx: CanvasRenderingContext2D): void {
    ctx.save();
    const cx = this.canvas.width * 0.5;
    const cy = this.canvas.height * 0.44;

    // Horizontal Washi Scroll Strip
    ctx.fillStyle = 'rgba(24, 21, 18, 0.82)';
    ctx.fillRect(0, cy - 68, this.canvas.width, 136);

    ctx.strokeStyle = '#c92a2a';
    ctx.lineWidth = 3;
    ctx.strokeRect(0, cy - 62, this.canvas.width, 124);

    // Big Sumi Kanji
    ctx.fillStyle = '#f8f1e5';
    ctx.font = '900 68px "Yuji Syuku", "Noto Serif JP", serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(this.bannerKanji, cx, cy - 10);

    // English Bushido Subtitle
    ctx.fillStyle = '#fcc419';
    ctx.font = '900 16px "Cinzel Decorative", "Noto Serif JP", serif';
    ctx.fillText(this.bannerSubtext, cx, cy + 40);

    ctx.restore();
  }
}
