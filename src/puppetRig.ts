// Pixel-Accurate Watercolor Samurai Rig Engine
// Uses a precision-authored 14-bone anatomical samurai mannequin (Head, Hair/Hat/Mask, Neck, Torso, Obi,
// Back Upper Arm, Back Forearm, Back Hand, Back Thigh, Back Shin, Back Foot, Front Thigh, Front Shin, Front Foot,
// Front Upper Arm, Front Forearm, Front Hand + Weapon) with Inverse Kinematics (IK) & exact joint pivots,
// textured directly with wet Japanese watercolor pigment washes, fabric patterns, and hand-brushed Sumi-e outlines!

import { FighterConfig } from './fighters';

export interface BoneAngles {
  pelvisX: number;
  pelvisY: number;
  torso: number;
  head: number;
  // Front (Lead / Sword) Arm
  shoulderR: number;
  elbowR: number;
  wristR: number;
  // Back (Off-hand) Arm
  shoulderL: number;
  elbowL: number;
  wristL: number;
  // Front Leg
  hipR: number;
  kneeR: number;
  ankleR: number;
  // Back Leg
  hipL: number;
  kneeL: number;
  ankleL: number;
}

export interface RigPoseInput {
  state: string;
  stateFrame: number;
  animTick: number;
  vx: number;
  vy: number;
  facing: 1 | -1;
  isGrounded: boolean;
  activeAttackKey: string | null;
  attackStartup: number;
  attackActive: number;
  attackRecovery: number;
}

export class PrecisionWatercolorSamuraiRig {
  private smoothedBones: Map<string, BoneAngles> = new Map();
  private watercolorNoisePattern: CanvasPattern | null = null;

  constructor() {
    this.initWatercolorPattern();
  }

  private initWatercolorPattern(): void {
    const c = document.createElement('canvas');
    c.width = 128;
    c.height = 128;
    const ctx = c.getContext('2d')!;

    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, 128, 128);

    // Paint organic wet watercolor pigment blotches for internal fabric texture
    for (let i = 0; i < 45; i++) {
      const x = Math.random() * 128;
      const y = Math.random() * 128;
      const r = 10 + Math.random() * 28;
      const g = ctx.createRadialGradient(x, y, 2, x, y, r);
      const dark = Math.random() > 0.5;
      g.addColorStop(0, dark ? 'rgba(0,0,0,0.08)' : 'rgba(255,248,235,0.12)');
      g.addColorStop(0.7, dark ? 'rgba(0,0,0,0.14)' : 'rgba(255,248,235,0.05)');
      g.addColorStop(1, 'rgba(0,0,0,0)');
      ctx.fillStyle = g;
      ctx.beginPath();
      ctx.arc(x, y, r, 0, Math.PI * 2);
      ctx.fill();
    }
    this.watercolorNoisePattern = ctx.createPattern(c, 'repeat');
  }

  private damp(cur: number, target: number, rate: number): number {
    return cur + (target - cur) * rate;
  }

  // Computes target 14-bone martial arts posture & interpolates smoothly at 60fps
  public getInterpolatedBones(
    slotKey: string,
    config: FighterConfig,
    input: RigPoseInput
  ): BoneAngles {
    const t = input.animTick;
    const breathe = Math.sin(t * 0.09);

    // Angles are in radians relative to parent bone (or vertical down = 0 for legs/arms, vertical up = 0 for torso/head)
    // For Legs/Arms: 0 = straight down, negative = swung forward (right), positive = swung backward (left)
    const target: BoneAngles = {
      pelvisX: 0,
      pelvisY: -86 + breathe * 2,
      torso: 0.08 + breathe * 0.025, // Slight martial-arts forward readiness
      head: -0.05 - breathe * 0.02,
      // Ready Kamae Sword Stance (Chūdan-no-Kamae)
      shoulderR: -0.58 + breathe * 0.03,
      elbowR: -0.78 - breathe * 0.04,
      wristR: 0.22,
      shoulderL: -0.32 - breathe * 0.03,
      elbowL: -0.92,
      wristL: 0.15,
      // Wide stable Samurai stance (Front leg stepped forward with bent knee, Back leg braced behind)
      hipR: -0.46,
      kneeR: 0.48,
      ankleR: -0.04,
      hipL: 0.42,
      kneeL: 0.22,
      ankleL: -0.35,
    };

    if (config.id === 'raidenbo') {
      // Heavy Kanabo resting on shoulder in idle stance
      target.shoulderR = -1.25 + breathe * 0.03;
      target.elbowR = -1.15;
      target.wristR = -0.85;
    } else if (config.id === 'yuki') {
      // Graceful poised Naginata stance
      target.shoulderR = -0.45 + breathe * 0.03;
      target.elbowR = -0.85;
      target.wristR = 0.05;
    } else if (config.id === 'hotaru') {
      // Low agile ninja dual-kodachi stance
      target.pelvisY = -80 + breathe * 2.5;
      target.torso = 0.18 + breathe * 0.03;
      target.shoulderL = 0.48;
      target.elbowL = -0.55;
      target.wristL = 0.65;
    }

    // --- 1. WALKING / ADVANCING FOOTWORK (True 2-Bone Hip + Knee + Ankle Gait Cycle) ---
    if (input.state === 'walk_fwd' || input.state === 'walk_back') {
      const dir = input.state === 'walk_fwd' ? 1 : -1;
      const phase = t * 0.24 * dir;
      const s = Math.sin(phase);
      const c = Math.cos(phase);

      target.pelvisY = -85 + Math.abs(c) * -7;
      target.torso = dir === 1 ? 0.18 : -0.04;
      target.head = dir === 1 ? -0.1 : 0.04;

      // Lead Leg (Right)
      target.hipR = -0.05 - s * 0.56;
      target.kneeR = Math.max(0.08, 0.45 + c * 0.48); // Knee bends as foot lifts through swing phase
      target.ankleR = -(target.hipR + target.kneeR) * 0.65;

      // Rear Leg (Left - 180 deg out of phase)
      target.hipL = -0.05 + s * 0.56;
      target.kneeL = Math.max(0.08, 0.45 - c * 0.48);
      target.ankleL = -(target.hipL + target.kneeL) * 0.65;

      // Natural arm counter-swing
      target.shoulderL = -0.2 + s * 0.45;
      target.shoulderR = -0.52 - s * 0.22;
    }

    // --- 2. EXPLOSIVE INK-STEP SPRINT DASH ---
    else if (input.state === 'dash') {
      const phase = t * 0.45;
      const s = Math.sin(phase);
      const c = Math.cos(phase);
      target.pelvisX = 14;
      target.pelvisY = -74;
      target.torso = 0.46; // Deep low samurai dash lean
      target.head = -0.34;
      target.hipR = -0.1 - s * 0.85;
      target.kneeR = Math.max(0.15, 0.65 + c * 0.55);
      target.hipL = -0.1 + s * 0.85;
      target.kneeL = Math.max(0.15, 0.65 - c * 0.55);
      target.shoulderR = 0.35; // Blade trailed behind back for Iai slash
      target.elbowR = -0.45;
      target.wristR = 0.45;
      target.shoulderL = -0.85;
    }

    // --- 3. CROUCH STANCE ---
    else if (input.state === 'crouch') {
      target.pelvisY = -56;
      target.torso = 0.28;
      target.head = -0.22;
      target.hipR = -0.88;
      target.kneeR = 1.32;
      target.ankleR = -0.44;
      target.hipL = 0.25;
      target.kneeL = 1.25;
      target.ankleL = -0.85;
      target.shoulderR = -0.45;
      target.elbowR = -1.05;
    }

    // --- 4. AIRBORNE JUMP ---
    else if (!input.isGrounded && input.state !== 'attack') {
      const rising = input.vy < 0;
      target.pelvisY = -92;
      target.torso = rising ? 0.16 : -0.08;
      target.hipR = rising ? -0.95 : -0.45;
      target.kneeR = rising ? 1.45 : 0.55;
      target.hipL = rising ? -0.35 : 0.35;
      target.kneeL = rising ? 1.25 : 0.65;
      target.shoulderR = rising ? -1.15 : -0.35;
      target.shoulderL = rising ? -0.95 : 0.35;
    }

    // --- 5. SWORD ATTACK CHOREOGRAPHY (3-Phase Wind-up -> Full Articulated Swing -> Zanshin Recovery) ---
    if (input.state === 'attack' && input.activeAttackKey) {
      const key = input.activeAttackKey;
      const f = input.stateFrame;
      const sUp = Math.max(1, input.attackStartup);
      const act = Math.max(1, input.attackActive);
      const rec = Math.max(1, input.attackRecovery);

      // Deep powerful martial lunge footwork during attacks
      target.pelvisY = -76;
      target.hipR = -0.78;
      target.kneeR = 0.82;
      target.ankleR = -0.05;
      target.hipL = 0.68;
      target.kneeL = 0.18;
      target.ankleL = -0.55;

      if (f <= sUp) {
        // Phase 1: Wind-up Coil
        const p = f / sUp;
        target.pelvisX = -12 * p;
        if (key === 'light') {
          target.torso = -0.12 * p;
          target.shoulderR = -1.45 * p - 0.4 * (1 - p);
          target.elbowR = -1.15;
          target.wristR = -0.45 * p;
        } else if (key === 'medium' || key === 'special1') {
          target.torso = -0.22 * p;
          target.shoulderR = -1.85 * p;
          target.elbowR = -0.95;
          target.wristR = -0.65 * p;
          target.shoulderL = -1.25 * p;
        } else {
          // Heavy / Rising Dragon / Super: High Jōdan-no-Kamae overhead raise
          target.torso = -0.28 * p;
          target.head = 0.18 * p;
          target.shoulderR = -2.55 * p;
          target.elbowR = -0.55 * p;
          target.wristR = -0.55 * p;
          target.shoulderL = -2.25 * p;
          target.elbowL = -0.65 * p;
        }
      } else if (f <= sUp + act) {
        // Phase 2: Explosive Active Blade Swing Arc!
        const p = (f - sUp) / act;
        const ease = 1 - Math.pow(1 - p, 2.3);

        if (key === 'light') {
          target.pelvisX = 22 * ease;
          target.torso = 0.28;
          target.shoulderR = -1.45 + 1.15 * ease;
          target.elbowR = -0.15; // Arm snaps straight out!
          target.wristR = 0.55 * ease;
        } else if (key === 'medium' || key === 'special1') {
          target.pelvisX = 30 * ease;
          target.torso = 0.36;
          target.shoulderR = -1.85 + 1.75 * ease;
          target.elbowR = -0.12;
          target.wristR = 0.75 * ease;
          target.shoulderL = 0.45 * ease;
        } else if (key === 'special2') {
          // Rising Dragon Uppercut Slash (from low ground sweep high into the heavens!)
          target.pelvisX = 20 * ease;
          target.torso = 0.25 - 0.55 * ease;
          target.shoulderR = 0.45 - 2.85 * ease;
          target.elbowR = -0.18;
          target.wristR = -0.45 * ease;
          target.shoulderL = 0.25 - 2.15 * ease;
        } else {
          // Heavy Cleave & Zanshin Super Art: Full 210° Overhead-to-Floor Cleave!
          target.pelvisX = 36 * ease;
          target.torso = -0.28 + 0.74 * ease;
          target.head = -0.24 * ease;
          target.shoulderR = -2.55 + 2.75 * ease;
          target.elbowR = -0.1;
          target.wristR = -0.55 + 1.45 * ease;
          target.shoulderL = -2.25 + 2.55 * ease;
        }
      } else {
        // Phase 3: Zanshin Follow-Through -> Smooth Return to Ready Guard
        const p = Math.min(1, (f - sUp - act) / rec);
        const hold = 1 - p;
        target.pelvisX = 26 * hold;
        target.torso = 0.32 * hold + 0.08 * p;
        target.shoulderR = 0.1 * hold - 0.58 * p;
        target.elbowR = -0.15 * hold - 0.78 * p;
        target.wristR = 0.65 * hold + 0.22 * p;
      }
    }

    // --- 6. MIND'S EYE PARRY & BLOCK GUARD ---
    else if (input.state === 'parry' || input.state === 'blockstun') {
      target.pelvisX = -8;
      target.pelvisY = -82;
      target.torso = -0.1;
      target.shoulderR = -1.15;
      target.elbowR = -1.25;
      target.wristR = -0.65; // Vertical blade held in front of face/chest
      target.shoulderL = -0.95;
      target.elbowL = -1.1;
    }

    // --- 7. HITSTUN RECOIL & KNOCKOUT ---
    else if (input.state === 'hitstun') {
      target.pelvisX = -18;
      target.pelvisY = -84;
      target.torso = -0.42;
      target.head = -0.35;
      target.shoulderR = 0.35;
      target.elbowR = -0.35;
      target.shoulderL = 0.55;
    } else if (input.state === 'ko') {
      target.pelvisY = -18;
      target.torso = -1.48;
      target.hipR = 1.25;
      target.hipL = 1.42;
    }

    const key = `${slotKey}_${config.id}`;
    let cur = this.smoothedBones.get(key);
    if (!cur) {
      cur = { ...target };
      this.smoothedBones.set(key, cur);
    }

    const rate = input.state === 'attack' ? 0.58 : 0.34;
    (Object.keys(target) as Array<keyof BoneAngles>).forEach((k) => {
      cur![k] = this.damp(cur![k], target[k], rate);
    });

    return cur;
  }

  // Renders the 14-bone Samurai Fighter with authentic Japanese Watercolor pigment shading,
  // crimson/floral/crane garment details, and variable-width Sumi-e ink brush outlines
  public renderSamurai(
    ctx: CanvasRenderingContext2D,
    slotKey: string,
    config: FighterConfig,
    input: RigPoseInput,
    portraitImg?: HTMLImageElement
  ): void {
    const b = this.getInterpolatedBones(slotKey, config, input);
    const isHeavy = config.id === 'raidenbo';
    const isSlim = config.id === 'hotaru';
    const isNoble = config.id === 'yuki';
    const scale = isHeavy ? 1.15 : isSlim ? 0.94 : 1.0;

    ctx.save();
    ctx.scale(scale, scale);
    ctx.translate(b.pelvisX, b.pelvisY);

    // =========================================================================
    // LAYER 1: BACK ARM (Shoulder -> Elbow -> Hand [+ Second Kodachi for Hotaru])
    // =========================================================================
    ctx.save();
    ctx.rotate(b.torso);
    ctx.translate(6, -54); // Back shoulder socket
    ctx.rotate(b.shoulderL);
    this.drawHaoriSleeve(ctx, config, true);
    ctx.translate(0, 30); // Back elbow socket
    ctx.rotate(b.elbowL);
    this.drawForearmAndHand(ctx, config, true);
    if (config.weaponType === 'twin_kodachi') {
      ctx.save();
      ctx.translate(0, 26);
      ctx.rotate(b.wristL + 0.5);
      this.drawWeapon(ctx, config, true);
      ctx.restore();
    }
    ctx.restore();

    // =========================================================================
    // LAYER 2: BACK LEG (Hip -> Thigh/Hakama -> Knee -> Shin/Kyahan -> Sandal)
    // =========================================================================
    this.drawArticulatedLeg(ctx, config, -8, 2, b.hipL, b.kneeL, b.ankleL, true);

    // =========================================================================
    // LAYER 3: FRONT LEG (Hip -> Thigh/Hakama -> Knee -> Shin/Kyahan -> Sandal)
    // =========================================================================
    this.drawArticulatedLeg(ctx, config, 8, 4, b.hipR, b.kneeR, b.ankleR, false);

    // =========================================================================
    // LAYER 4: TORSO, HAORI COAT, OBI SASH & CHARACTER MOTIFS
    // =========================================================================
    ctx.save();
    ctx.rotate(b.torso);
    this.drawTorsoAndHaori(ctx, config, input.animTick);

    // =========================================================================
    // LAYER 5: NECK, SCULPTED HEAD, FACE & ICONIC HEADGEAR
    // =========================================================================
    ctx.save();
    ctx.translate(4, -64); // Neck socket
    ctx.rotate(b.head);
    this.drawCharacterHead(ctx, config, input.animTick);
    ctx.restore();

    // =========================================================================
    // LAYER 6: FRONT SWORD ARM + SIGNATURE WEAPON
    // =========================================================================
    ctx.save();
    ctx.translate(-6, -52); // Lead shoulder socket
    ctx.rotate(b.shoulderR);
    this.drawHaoriSleeve(ctx, config, false);
    ctx.translate(0, 32); // Lead elbow socket
    ctx.rotate(b.elbowR);
    this.drawForearmAndHand(ctx, config, false);
    ctx.translate(0, 28); // Lead wrist / weapon grip
    ctx.rotate(b.wristR);
    this.drawWeapon(ctx, config, false);
    ctx.restore();

    ctx.restore(); // end torso
    ctx.restore(); // end pelvis
  }

  private fillAndBrushOutline(
    ctx: CanvasRenderingContext2D,
    fillStyle: string | CanvasGradient,
    inkColor: string = '#14110f',
    lineWidth: number = 3.2
  ): void {
    ctx.fillStyle = fillStyle;
    ctx.fill();
    if (this.watercolorNoisePattern) {
      ctx.save();
      ctx.globalCompositeOperation = 'multiply';
      ctx.fillStyle = this.watercolorNoisePattern;
      ctx.fill();
      ctx.restore();
    }
    ctx.strokeStyle = inkColor;
    ctx.lineWidth = lineWidth;
    ctx.lineJoin = 'round';
    ctx.lineCap = 'round';
    ctx.stroke();
  }

  private drawArticulatedLeg(
    ctx: CanvasRenderingContext2D,
    config: FighterConfig,
    hipX: number,
    hipY: number,
    hipAngle: number,
    kneeAngle: number,
    ankleAngle: number,
    isBack: boolean
  ): void {
    const darkTint = isBack ? '#191614' : config.robeColor;
    const hakamaGrad = ctx.createLinearGradient(0, 0, 0, 46);
    hakamaGrad.addColorStop(0, darkTint);
    hakamaGrad.addColorStop(0.7, config.id === 'yuki' ? '#495a78' : config.robeColor);
    hakamaGrad.addColorStop(1, isBack ? '#12100e' : config.primaryInk);

    ctx.save();
    ctx.translate(hipX, hipY);
    ctx.rotate(hipAngle);

    // 1. Upper Leg: Wide Pleated Samurai Hakama Thigh
    ctx.beginPath();
    ctx.moveTo(-16, -4);
    ctx.quadraticCurveTo(-24, 22, -22, 44);
    ctx.lineTo(22, 44);
    ctx.quadraticCurveTo(24, 20, 15, -4);
    ctx.closePath();
    this.fillAndBrushOutline(ctx, hakamaGrad, config.primaryInk, 3.4);

    // Hakama vertical calligraphy pleat lines + crimson/sakura watercolor splashes
    ctx.strokeStyle = config.primaryInk;
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(-4, 4);
    ctx.lineTo(-8, 40);
    ctx.moveTo(6, 4);
    ctx.lineTo(9, 40);
    ctx.stroke();

    if (!isBack && config.id === 'kazemaru') {
      // Crimson blood-watercolor splatters on Kazemaru's hakama matching his portrait!
      ctx.fillStyle = 'rgba(201, 42, 42, 0.55)';
      ctx.beginPath();
      ctx.arc(4, 26, 9, 0, Math.PI * 2);
      ctx.arc(-6, 34, 6, 0, Math.PI * 2);
      ctx.fill();
    }

    // 2. Knee Joint -> Shin & Kyahan Leggings
    ctx.translate(0, 40);
    ctx.rotate(kneeAngle);

    const shinFill = config.id === 'yuki' ? '#dce4f0' : '#24201d';
    ctx.beginPath();
    ctx.moveTo(-13, 0);
    ctx.lineTo(-9, 38);
    ctx.lineTo(9, 38);
    ctx.lineTo(13, 0);
    ctx.closePath();
    this.fillAndBrushOutline(ctx, shinFill, config.primaryInk, 3.0);

    // Crisscross shin wraps (Kyahan)
    ctx.strokeStyle = config.id === 'raidenbo' ? '#c29b61' : '#5c5248';
    ctx.lineWidth = 1.8;
    for (let y = 8; y < 32; y += 8) {
      ctx.beginPath();
      ctx.moveTo(-10, y);
      ctx.lineTo(10, y + 5);
      ctx.stroke();
    }

    // 3. Ankle Joint -> Waraji Straw Sandal / Geta & Tabi Sock
    ctx.translate(0, 38);
    ctx.rotate(ankleAngle);

    // White/Dark Tabi Foot
    ctx.beginPath();
    ctx.moveTo(-8, -2);
    ctx.lineTo(20, 4);
    ctx.quadraticCurveTo(24, 9, 18, 11);
    ctx.lineTo(-10, 11);
    ctx.closePath();
    this.fillAndBrushOutline(
      ctx,
      config.id === 'yuki' || config.id === 'kazemaru' ? '#f4ece1' : '#2b2623',
      config.primaryInk,
      2.6
    );

    // Straw Waraji Sandal Sole or Wooden Geta teeth
    ctx.fillStyle = '#c29b61';
    ctx.strokeStyle = config.primaryInk;
    ctx.lineWidth = 2.2;
    ctx.fillRect(-11, 9, 31, 4);
    ctx.strokeRect(-11, 9, 31, 4);

    ctx.restore();
  }

  private drawTorsoAndHaori(
    ctx: CanvasRenderingContext2D,
    config: FighterConfig,
    tick: number
  ): void {
    // 1. Sedge Hat slung on Kazemaru's back (drawn behind torso!)
    if (config.hatType === 'sedge_ronin') {
      ctx.save();
      ctx.translate(-22, -42);
      ctx.rotate(-0.48);
      const hatGrad = ctx.createRadialGradient(0, 0, 6, 0, 0, 42);
      hatGrad.addColorStop(0, '#e3c58d');
      hatGrad.addColorStop(1, '#9c7844');
      ctx.beginPath();
      ctx.ellipse(0, 0, 18, 42, 0, 0, Math.PI * 2);
      this.fillAndBrushOutline(ctx, hatGrad, config.primaryInk, 3.2);
      // Woven bamboo radial ribs
      ctx.strokeStyle = 'rgba(24, 21, 18, 0.45)';
      ctx.lineWidth = 1.4;
      for (let a = -1.2; a <= 1.2; a += 0.4) {
        ctx.beginPath();
        ctx.moveTo(0, 0);
        ctx.lineTo(Math.cos(a) * 17, Math.sin(a) * 40);
        ctx.stroke();
      }
      ctx.restore();
    }

    // 2. Main Torso & Haori Coat
    const torsoGrad = ctx.createLinearGradient(-25, -62, 25, 10);
    if (config.id === 'raidenbo') {
      // Muscular bare bronze chest with half-monk袈裟 (Kesa) robe
      torsoGrad.addColorStop(0, '#e0b284');
      torsoGrad.addColorStop(0.55, '#c28b5a');
      torsoGrad.addColorStop(1, '#d98218');
    } else if (config.id === 'yuki') {
      torsoGrad.addColorStop(0, '#74a0c7');
      torsoGrad.addColorStop(0.6, '#486b94');
      torsoGrad.addColorStop(1, '#8c6d9c');
    } else if (config.id === 'hotaru') {
      torsoGrad.addColorStop(0, '#2b3d5c');
      torsoGrad.addColorStop(0.65, '#42385e');
      torsoGrad.addColorStop(1, '#c2597c');
    } else {
      torsoGrad.addColorStop(0, '#36302b');
      torsoGrad.addColorStop(0.6, '#1f1b18');
      torsoGrad.addColorStop(1, '#14110f');
    }

    ctx.beginPath();
    ctx.moveTo(-22, 6);
    ctx.quadraticCurveTo(-28, -28, -24, -60);
    ctx.lineTo(22, -60);
    ctx.quadraticCurveTo(28, -26, 22, 6);
    ctx.closePath();
    this.fillAndBrushOutline(ctx, torsoGrad, config.primaryInk, 3.6);

    // Character-specific painted kimono patterns matching their portraits!
    if (config.id === 'kazemaru') {
      // Bare chest V-neck + vivid crimson watercolor blood/ink splashes across haori
      ctx.fillStyle = '#e6c5a3';
      ctx.beginPath();
      ctx.moveTo(-4, -60);
      ctx.lineTo(14, -60);
      ctx.lineTo(8, -26);
      ctx.closePath();
      ctx.fill();
      ctx.stroke();

      ctx.fillStyle = 'rgba(201, 42, 42, 0.65)';
      ctx.beginPath();
      ctx.arc(-6, -34, 12, 0, Math.PI * 2);
      ctx.arc(8, -22, 9, 0, Math.PI * 2);
      ctx.arc(-12, -18, 7, 0, Math.PI * 2);
      ctx.fill();
    } else if (config.id === 'hotaru') {
      // Sakura blossom motifs on Hotaru's indigo kimono
      ctx.fillStyle = '#f783ac';
      [
        [-8, -42],
        [10, -32],
        [-6, -18],
      ].forEach(([sx, sy]) => {
        ctx.beginPath();
        ctx.arc(sx, sy, 5, 0, Math.PI * 2);
        ctx.fill();
      });
    } else if (config.id === 'yuki') {
      // White crane motif on Shirayuki's kimono
      ctx.fillStyle = '#ffffff';
      ctx.beginPath();
      ctx.moveTo(-12, -36);
      ctx.quadraticCurveTo(0, -48, 12, -34);
      ctx.quadraticCurveTo(0, -28, -12, -36);
      ctx.fill();
    } else if (config.id === 'raidenbo') {
      // Giant Bronze/Amber Juzu Prayer Beads draped around Raidenbo's chest & neck
      for (let i = -3; i <= 3; i++) {
        const bx = i * 6.5;
        const by = -52 + Math.cos(i * 0.45) * 16;
        ctx.beginPath();
        ctx.arc(bx, by, 6.2, 0, Math.PI * 2);
        this.fillAndBrushOutline(ctx, '#d98218', config.primaryInk, 2.4);
      }
    }

    // Crossed Kimono Collar Lapels
    ctx.strokeStyle = config.id === 'yuki' ? '#ffffff' : config.primaryInk;
    ctx.lineWidth = 3.2;
    ctx.beginPath();
    ctx.moveTo(-10, -60);
    ctx.lineTo(14, -12);
    ctx.moveTo(14, -60);
    ctx.lineTo(-4, -28);
    ctx.stroke();

    // 3. Obi Waist Sash & Knot
    const obiColor =
      config.id === 'kazemaru' || config.id === 'yuki'
        ? '#f4ece1'
        : config.id === 'hotaru'
          ? '#e64980'
          : '#c28b42';
    ctx.beginPath();
    ctx.roundRect(-23, -12, 46, 15, 3);
    this.fillAndBrushOutline(ctx, obiColor, config.primaryInk, 3.0);
  }

  private drawCharacterHead(
    ctx: CanvasRenderingContext2D,
    config: FighterConfig,
    tick: number
  ): void {
    const wind = Math.sin(tick * 0.14) * 5;

    // 1. Back Flowing Hair locks (drawn behind face)
    if (config.id === 'yuki') {
      // Long flowing silver-white hair
      ctx.beginPath();
      ctx.moveTo(-6, -26);
      ctx.bezierCurveTo(-38, -22, -52, 18 + wind, -62, 48 + wind);
      ctx.bezierCurveTo(-32, 38, -18, 12, -4, -4);
      ctx.closePath();
      this.fillAndBrushOutline(ctx, '#eef4fa', '#3b4a5e', 2.6);
    } else if (config.id === 'hotaru' || config.id === 'kazemaru') {
      // Windswept black sumi hair / topknot tails
      ctx.beginPath();
      ctx.moveTo(-8, -28);
      ctx.quadraticCurveTo(-38, -34 + wind, -48, -12 + wind);
      ctx.quadraticCurveTo(-28, -6, -6, -8);
      ctx.closePath();
      this.fillAndBrushOutline(ctx, '#181512', '#0d0b0a', 2.5);
    }

    // 2. Sculpted Neck & Angular Face Profile (Facing Right)
    const skinColor =
      config.id === 'raidenbo'
        ? '#d4a359'
        : config.id === 'yuki'
          ? '#fcf7f2'
          : '#edd2b5';

    ctx.beginPath();
    ctx.moveTo(-8, 4); // Back of neck
    ctx.lineTo(-10, -22); // Back of skull
    ctx.quadraticCurveTo(2, -34, 16, -24); // Forehead
    ctx.lineTo(19, -14); // Nose bridge
    ctx.lineTo(15, -9); // Upper lip
    ctx.lineTo(14, -2); // Chin
    ctx.lineTo(4, 2); // Jawline
    ctx.lineTo(4, 6); // Front of neck
    ctx.closePath();
    this.fillAndBrushOutline(ctx, skinColor, config.primaryInk, 2.8);

    // 3. Facial Details & Headgear matching each Portrait!
    if (config.id === 'kazemaru') {
      // Fierce brow, cheek scar, jaw stubble, and wild ronin hair locks
      ctx.strokeStyle = '#c92a2a';
      ctx.lineWidth = 1.8;
      ctx.beginPath();
      ctx.moveTo(6, -16);
      ctx.lineTo(8, -7); // Cheek scar
      ctx.stroke();

      // Wild hair crown & topknot
      ctx.beginPath();
      ctx.arc(-2, -20, 15, Math.PI * 0.65, Math.PI * 2.05);
      this.fillAndBrushOutline(ctx, '#181512', '#0d0b0a', 2.5);
    } else if (config.id === 'hotaru') {
      // Dark hair + White & Vermilion Kitsune Fox Mask tilted on the side/crown of her head!
      ctx.beginPath();
      ctx.arc(-1, -20, 14, Math.PI * 0.6, Math.PI * 2.0);
      this.fillAndBrushOutline(ctx, '#181512', '#0d0b0a', 2.4);

      // Kitsune Fox Mask
      ctx.save();
      ctx.translate(4, -26);
      ctx.rotate(-0.25);
      ctx.beginPath();
      ctx.ellipse(0, 0, 14, 10, 0, 0, Math.PI * 2);
      this.fillAndBrushOutline(ctx, '#fffcf7', '#181512', 2.4);
      // Fox Ears
      ctx.beginPath();
      ctx.moveTo(-6, -7);
      ctx.lineTo(-2, -20);
      ctx.lineTo(4, -8);
      ctx.closePath();
      this.fillAndBrushOutline(ctx, '#fffcf7', '#c92a2a', 2.2);
      // Red Kitsune markings
      ctx.strokeStyle = '#e03131';
      ctx.lineWidth = 2.2;
      ctx.beginPath();
      ctx.moveTo(-4, -2);
      ctx.lineTo(8, 1);
      ctx.stroke();
      ctx.restore();
    } else if (config.id === 'raidenbo') {
      // Horned Oni Demon Visage + Topknot matching Raidenbo's portrait!
      // Topknot
      ctx.beginPath();
      ctx.arc(-4, -36, 8, 0, Math.PI * 2);
      this.fillAndBrushOutline(ctx, '#181512', '#0d0b0a', 2.4);

      // Curved Oni Horns
      ctx.beginPath();
      ctx.moveTo(4, -24);
      ctx.quadraticCurveTo(18, -36, 14, -46);
      ctx.quadraticCurveTo(8, -34, 0, -24);
      ctx.closePath();
      this.fillAndBrushOutline(ctx, '#f4ece1', '#181512', 2.5);

      // Oni Fangs
      ctx.fillStyle = '#ffffff';
      ctx.beginPath();
      ctx.moveTo(10, -5);
      ctx.lineTo(15, -11);
      ctx.lineTo(13, -4);
      ctx.fill();
    } else if (config.id === 'yuki') {
      // Silver-white noble hair crest + Butterfly ornament
      ctx.beginPath();
      ctx.arc(0, -21, 14.5, Math.PI * 0.6, Math.PI * 2.02);
      this.fillAndBrushOutline(ctx, '#eef4fa', '#3b4a5e', 2.4);

      // Butterfly Hairpin (Kanzashi)
      ctx.fillStyle = '#fcc419';
      ctx.strokeStyle = '#181512';
      ctx.lineWidth = 1.8;
      ctx.beginPath();
      ctx.ellipse(-10, -28, 7, 4, -0.5, 0, Math.PI * 2);
      ctx.ellipse(-10, -22, 6, 3.5, 0.4, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();
    }

    // Sharp Samurai Eye & Brow
    ctx.fillStyle = config.id === 'yuki' ? '#1c7ed6' : config.id === 'raidenbo' ? '#ffd43b' : '#181512';
    ctx.beginPath();
    ctx.ellipse(11, -16, 3.2, 1.8, 0.1, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = config.primaryInk;
    ctx.lineWidth = 2.2;
    ctx.beginPath();
    ctx.moveTo(6, -19);
    ctx.lineTo(16, -18);
    ctx.stroke();
  }

  private drawHaoriSleeve(
    ctx: CanvasRenderingContext2D,
    config: FighterConfig,
    isBack: boolean
  ): void {
    if (config.id === 'raidenbo' && !isBack) {
      // Layered Iron Sode (Samurai Shoulder Armor) on Raidenbo's lead arm!
      ctx.beginPath();
      ctx.roundRect(-14, -6, 28, 34, 4);
      this.fillAndBrushOutline(ctx, '#3b3530', config.primaryInk, 3.0);
      ctx.strokeStyle = '#c92a2a';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(-12, 6);
      ctx.lineTo(12, 6);
      ctx.moveTo(-12, 16);
      ctx.lineTo(12, 16);
      ctx.stroke();
      return;
    }

    // Flowing Wide Kimono / Haori Sleeve
    const sleeveW = config.id === 'yuki' ? 22 : 16;
    ctx.beginPath();
    ctx.moveTo(-10, -4);
    ctx.quadraticCurveTo(-sleeveW, 18, -14, 34);
    ctx.lineTo(13, 32);
    ctx.quadraticCurveTo(15, 14, 10, -4);
    ctx.closePath();
    this.fillAndBrushOutline(
      ctx,
      config.id === 'yuki' ? '#6c92b8' : config.robeColor,
      config.primaryInk,
      3.0
    );
  }

  private drawForearmAndHand(
    ctx: CanvasRenderingContext2D,
    config: FighterConfig,
    isBack: boolean
  ): void {
    // Forearm / Kote Bracer
    const bracerColor =
      config.id === 'kazemaru' || config.id === 'yuki' ? '#edd2b5' : '#26221e';
    ctx.beginPath();
    ctx.moveTo(-7, -2);
    ctx.lineTo(-5, 24);
    ctx.lineTo(6, 24);
    ctx.lineTo(8, -2);
    ctx.closePath();
    this.fillAndBrushOutline(ctx, bracerColor, config.primaryInk, 2.6);

    // Gripping Hand
    ctx.beginPath();
    ctx.arc(0, 27, 6.5, 0, Math.PI * 2);
    this.fillAndBrushOutline(ctx, '#edd2b5', config.primaryInk, 2.4);
  }

  private drawWeapon(
    ctx: CanvasRenderingContext2D,
    config: FighterConfig,
    isOffhand: boolean
  ): void {
    // Oriented so +X extends out from the gripping fist when arm is extended
    ctx.save();
    ctx.rotate(Math.PI * 0.5); // Align blade along forearm direction by default

    if (config.weaponType === 'kanabo_nodachi') {
      // Massive Spiked Iron Kanabo War Club
      ctx.beginPath();
      ctx.roundRect(-24, -4, 36, 8, 2);
      this.fillAndBrushOutline(ctx, '#c29b61', config.primaryInk, 2.5);

      const clubGrad = ctx.createLinearGradient(12, -12, 138, 12);
      clubGrad.addColorStop(0, '#36322e');
      clubGrad.addColorStop(0.5, '#4f4a44');
      clubGrad.addColorStop(1, '#1c1917');
      ctx.beginPath();
      ctx.moveTo(12, -7);
      ctx.lineTo(132, -13);
      ctx.quadraticCurveTo(142, 0, 132, 13);
      ctx.lineTo(12, 7);
      ctx.closePath();
      this.fillAndBrushOutline(ctx, clubGrad, config.primaryInk, 3.2);

      // Iron Spikes along Kanabo
      ctx.fillStyle = '#adb5bd';
      for (let x = 28; x <= 118; x += 22) {
        ctx.beginPath();
        ctx.moveTo(x - 5, -10);
        ctx.lineTo(x, -19);
        ctx.lineTo(x + 5, -10);
        ctx.moveTo(x - 5, 10);
        ctx.lineTo(x, 19);
        ctx.lineTo(x + 5, 10);
        ctx.fill();
        ctx.stroke();
      }
    } else {
      // Katana / Kodachi / Frost Blade
      const bladeLen =
        config.weaponType === 'frost_naginata'
          ? 136
          : config.weaponType === 'twin_kodachi'
            ? isOffhand
              ? 76
              : 88
            : 116;

      // Tsuka (Wrapped Hilt)
      ctx.beginPath();
      ctx.roundRect(-28, -4, 30, 8, 2);
      this.fillAndBrushOutline(ctx, '#24201d', config.primaryInk, 2.4);

      // Tsuba (Handguard)
      ctx.beginPath();
      ctx.roundRect(1, -11, 5, 22, 2);
      this.fillAndBrushOutline(ctx, '#d49b27', config.primaryInk, 2.2);

      // Curved Japanese Steel Blade with Hamon temper sheen
      const bladeGrad = ctx.createLinearGradient(6, -6, 6 + bladeLen, 6);
      bladeGrad.addColorStop(0, '#ffffff');
      bladeGrad.addColorStop(0.6, config.id === 'yuki' ? '#d0ebff' : '#e9ecef');
      bladeGrad.addColorStop(1, '#adb5bd');

      ctx.beginPath();
      ctx.moveTo(6, -4);
      ctx.quadraticCurveTo(6 + bladeLen * 0.55, -9, 6 + bladeLen, -2);
      ctx.lineTo(6 + bladeLen - 8, 4);
      ctx.quadraticCurveTo(6 + bladeLen * 0.5, 0, 6, 4);
      ctx.closePath();
      this.fillAndBrushOutline(ctx, bladeGrad, config.primaryInk, 2.6);

      // Frost icicles along Shirayuki's blade matching her portrait!
      if (config.id === 'yuki') {
        ctx.fillStyle = 'rgba(165, 216, 255, 0.85)';
        for (let x = 22; x < bladeLen - 15; x += 18) {
          ctx.beginPath();
          ctx.moveTo(x, 2);
          ctx.lineTo(x + 3, 14 + (x % 9));
          ctx.lineTo(x + 7, 2);
          ctx.fill();
        }
      }
    }

    ctx.restore();
  }
}
