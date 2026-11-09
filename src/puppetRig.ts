// 14-Bone Hand-Painted Watercolor Skinned Mesh Rig (`PrecisionWatercolorSamuraiRig`)
// Skins the EXACT original hand-painted Japanese watercolor character artwork (`sprite_*.jpg` + `sheet_*.jpg`)
// onto a 14-bone anatomical skeleton (Pelvis, Torso, Head/Neck, Lead Shoulder/Elbow/Wrist,
// Rear Shoulder/Elbow/Wrist, Front Hip/Knee/Ankle, Back Hip/Knee/Ankle) using a watertight
// 2D affine triangle mesh with split-leg articulation below the hip line.

import { FighterConfig } from './fighters';
import { NormalizedPoseSprite } from './spriteAnimator';

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
  hitFlashFrames?: number;
  activeAttackKey: string | null;
  attackStartup: number;
  attackActive: number;
  attackRecovery: number;
}

interface MeshVertex {
  u: number; // Source pixel X in pose.normalCanvas
  v: number; // Source pixel Y in pose.normalCanvas
  x: number; // Deformed screen X relative to character foot origin (0,0)
  y: number; // Deformed screen Y relative to character foot origin (0,0)
}

export class PrecisionWatercolorSamuraiRig {
  private smoothedBones: Map<string, BoneAngles> = new Map();

  private damp(cur: number, target: number, rate: number): number {
    return cur + (target - cur) * rate;
  }

  public getRestBones(config: FighterConfig): BoneAngles {
    const rest: BoneAngles = {
      pelvisX: 0,
      pelvisY: -86,
      torso: 0.08,
      head: -0.05,
      shoulderR: -0.58,
      elbowR: -0.78,
      wristR: 0.22,
      shoulderL: -0.32,
      elbowL: -0.92,
      wristL: 0.15,
      hipR: -0.46,
      kneeR: 0.48,
      ankleR: -0.04,
      hipL: 0.42,
      kneeL: 0.22,
      ankleL: -0.35,
    };

    if (config.id === 'raidenbo') {
      rest.shoulderR = -1.25;
      rest.elbowR = -1.15;
      rest.wristR = -0.85;
    } else if (config.id === 'yuki') {
      rest.shoulderR = -0.45;
      rest.elbowR = -0.85;
      rest.wristR = 0.05;
    } else if (config.id === 'hotaru') {
      rest.pelvisY = -80;
      rest.torso = 0.18;
      rest.shoulderL = 0.48;
      rest.elbowL = -0.55;
      rest.wristL = 0.65;
    }
    return rest;
  }

  // Computes target 14-bone martial arts posture & interpolates smoothly at 60fps
  public getInterpolatedBones(
    slotKey: string,
    config: FighterConfig,
    input: RigPoseInput
  ): BoneAngles {
    const t = input.animTick;
    const breathe = Math.sin(t * 0.1);
    const rest = this.getRestBones(config);

    const target: BoneAngles = {
      pelvisX: 0,
      pelvisY: rest.pelvisY + breathe * 2.5,
      torso: rest.torso + breathe * 0.028,
      head: rest.head - breathe * 0.022,
      shoulderR: rest.shoulderR + breathe * 0.035,
      elbowR: rest.elbowR - breathe * 0.04,
      wristR: rest.wristR,
      shoulderL: rest.shoulderL - breathe * 0.03,
      elbowL: rest.elbowL,
      wristL: rest.wristL,
      hipR: rest.hipR,
      kneeR: rest.kneeR,
      ankleR: rest.ankleR,
      hipL: rest.hipL,
      kneeL: rest.kneeL,
      ankleL: rest.ankleL,
    };

    // --- 1. WALKING / ADVANCING FOOTWORK (True 2-Bone Hip + Knee + Ankle Gait Cycle) ---
    if (input.state === 'walk_fwd' || input.state === 'walk_back') {
      const dir = input.state === 'walk_fwd' ? 1 : -1;
      const phase = t * 0.32 * dir;
      const s = Math.sin(phase);
      const c = Math.cos(phase);

      target.pelvisY = rest.pelvisY + Math.abs(c) * -7;
      target.torso = rest.torso + (dir === 1 ? 0.12 : -0.08);
      target.head = rest.head + (dir === 1 ? -0.06 : 0.05);

      // Lead Leg (Right)
      target.hipR = rest.hipR - s * 0.38;
      target.kneeR = rest.kneeR + Math.max(-0.2, c * 0.35);
      target.ankleR = rest.ankleR - s * 0.15;

      // Rear Leg (Left - 180 deg out of phase)
      target.hipL = rest.hipL + s * 0.38;
      target.kneeL = rest.kneeL + Math.max(-0.2, -c * 0.35);
      target.ankleL = rest.ankleL + s * 0.15;

      // Natural arm counter-swing
      target.shoulderL = rest.shoulderL + s * 0.32;
      target.shoulderR = rest.shoulderR - s * 0.22;
    }

    // --- 2. EXPLOSIVE INK-STEP SPRINT DASH ---
    else if (input.state === 'dash') {
      const phase = t * 0.48;
      const s = Math.sin(phase);
      target.pelvisX = 16;
      target.pelvisY = rest.pelvisY + 8;
      target.torso = rest.torso + 0.26;
      target.head = rest.head - 0.18;
      target.hipR = rest.hipR - s * 0.45;
      target.hipL = rest.hipL + s * 0.45;
      target.shoulderR = rest.shoulderR + 0.28;
      target.shoulderL = rest.shoulderL - 0.35;
    }

    // --- 3. CROUCH STANCE ---
    else if (input.state === 'crouch') {
      target.pelvisY = rest.pelvisY + 24;
      target.torso = rest.torso + 0.18;
      target.head = rest.head - 0.14;
      target.hipR = rest.hipR - 0.32;
      target.kneeR = rest.kneeR + 0.48;
      target.hipL = rest.hipL + 0.22;
      target.kneeL = rest.kneeL + 0.45;
    }

    // --- 4. AIRBORNE JUMP ---
    else if (!input.isGrounded && input.state !== 'attack') {
      const rising = input.vy < 0;
      target.pelvisY = rest.pelvisY - 6;
      target.torso = rest.torso + (rising ? 0.12 : -0.08);
      target.hipR = rest.hipR + (rising ? -0.35 : 0.15);
      target.kneeR = rest.kneeR + (rising ? 0.45 : -0.15);
      target.hipL = rest.hipL + (rising ? -0.25 : 0.2);
      target.kneeL = rest.kneeL + (rising ? 0.4 : -0.1);
      target.shoulderR = rest.shoulderR + (rising ? -0.35 : 0.22);
    }

    // --- 5. SWORD ATTACK CHOREOGRAPHY (3-Phase Wind-up -> Full Articulated Swing -> Zanshin Recovery) ---
    if (input.state === 'attack' && input.activeAttackKey) {
      const key = input.activeAttackKey;
      const f = input.stateFrame;
      const sUp = Math.max(1, input.attackStartup);
      const act = Math.max(1, input.attackActive);
      const rec = Math.max(1, input.attackRecovery);

      target.pelvisY = rest.pelvisY + 6;
      target.hipR = rest.hipR - 0.22;
      target.kneeR = rest.kneeR + 0.25;
      target.hipL = rest.hipL + 0.22;

      if (f <= sUp) {
        // Phase 1: Wind-up Coil
        const p = f / sUp;
        target.pelvisX = -12 * p;
        target.torso = rest.torso - 0.18 * p;
        target.head = rest.head + 0.1 * p;
        target.shoulderR = rest.shoulderR - 0.55 * p;
        target.elbowR = rest.elbowR - 0.35 * p;
        target.wristR = rest.wristR - 0.35 * p;
        target.shoulderL = rest.shoulderL - 0.35 * p;
      } else if (f <= sUp + act) {
        // Phase 2: Explosive Active Blade Swing Arc!
        const p = (f - sUp) / act;
        const ease = 1 - Math.pow(1 - p, 2.4);

        if (key === 'light') {
          target.pelvisX = 24 * ease;
          target.torso = rest.torso + 0.22 * ease;
          target.shoulderR = rest.shoulderR - 0.55 + 0.95 * ease;
          target.elbowR = rest.elbowR + 0.45 * ease;
          target.wristR = rest.wristR + 0.4 * ease;
        } else if (key === 'medium' || key === 'special1') {
          target.pelvisX = 32 * ease;
          target.torso = rest.torso + 0.28 * ease;
          target.shoulderR = rest.shoulderR - 0.65 + 1.15 * ease;
          target.elbowR = rest.elbowR + 0.55 * ease;
          target.wristR = rest.wristR + 0.52 * ease;
          target.shoulderL = rest.shoulderL + 0.4 * ease;
        } else if (key === 'special2') {
          // Rising Dragon Uppercut Slash
          target.pelvisX = 22 * ease;
          target.torso = rest.torso - 0.24 * ease;
          target.shoulderR = rest.shoulderR + 0.35 - 1.15 * ease;
          target.elbowR = rest.elbowR + 0.4 * ease;
          target.wristR = rest.wristR - 0.45 * ease;
        } else {
          // Heavy Cleave & Zanshin Super Art
          target.pelvisX = 36 * ease;
          target.torso = rest.torso - 0.2 + 0.52 * ease;
          target.head = rest.head - 0.16 * ease;
          target.shoulderR = rest.shoulderR - 0.75 + 1.35 * ease;
          target.elbowR = rest.elbowR + 0.6 * ease;
          target.wristR = rest.wristR + 0.65 * ease;
          target.shoulderL = rest.shoulderL + 0.5 * ease;
        }
      } else {
        // Phase 3: Zanshin Follow-Through -> Smooth Return to Ready Guard
        const p = Math.min(1, (f - sUp - act) / rec);
        const hold = 1 - p;
        target.pelvisX = 24 * hold;
        target.torso = rest.torso + 0.22 * hold;
        target.shoulderR = rest.shoulderR + 0.35 * hold;
        target.elbowR = rest.elbowR + 0.35 * hold;
        target.wristR = rest.wristR + 0.35 * hold;
      }
    }

    // --- 6. MIND'S EYE PARRY & BLOCK GUARD ---
    else if (input.state === 'parry' || input.state === 'blockstun') {
      target.pelvisX = -8;
      target.pelvisY = rest.pelvisY + 4;
      target.torso = rest.torso - 0.12;
      target.shoulderR = rest.shoulderR - 0.35;
      target.elbowR = rest.elbowR - 0.28;
      target.wristR = rest.wristR - 0.35;
    }

    // --- 7. HITSTUN RECOIL & KNOCKOUT ---
    else if (input.state === 'hitstun') {
      target.pelvisX = -16;
      target.torso = rest.torso - 0.28;
      target.head = rest.head - 0.22;
      target.shoulderR = rest.shoulderR + 0.35;
      target.shoulderL = rest.shoulderL + 0.35;
    }

    const key = `${slotKey}_${config.id}`;
    let cur = this.smoothedBones.get(key);
    if (!cur) {
      cur = { ...target };
      this.smoothedBones.set(key, cur);
    }

    const rate = input.state === 'attack' ? 0.65 : 0.42;
    (Object.keys(target) as Array<keyof BoneAngles>).forEach((k) => {
      cur![k] = this.damp(cur![k], target[k], rate);
    });

    return cur;
  }

  private rotatePoint(
    px: number,
    py: number,
    ox: number,
    oy: number,
    angle: number
  ): { x: number; y: number } {
    if (Math.abs(angle) < 0.0005) return { x: px, y: py };
    const c = Math.cos(angle);
    const s = Math.sin(angle);
    const dx = px - ox;
    const dy = py - oy;
    return {
      x: ox + dx * c - dy * s,
      y: oy + dx * s + dy * c,
    };
  }

  // Renders the 14-bone Samurai Fighter by skinning the ORIGINAL Hand-Painted Watercolor Artwork
  // (`sprite_*.jpg` + `sheet_*.jpg`) onto a 16-quad (32-triangle) anatomical skeletal mesh!
  public renderSamurai(
    ctx: CanvasRenderingContext2D,
    slotKey: string,
    config: FighterConfig,
    input: RigPoseInput,
    pose?: NormalizedPoseSprite | null
  ): void {
    if (!pose) return;

    const b = this.getInterpolatedBones(slotKey, config, input);
    const rest = this.getRestBones(config);

    // Compute bone deltas relative to rest pose so that neutral stance preserves 100% original painted proportions!
    const dPelvisX = b.pelvisX - rest.pelvisX;
    const dPelvisY = b.pelvisY - rest.pelvisY;
    const dTorso = (b.torso - rest.torso) * 0.65;
    const dHead = (b.head - rest.head) * 0.65;
    const dArmR =
      (b.shoulderR - rest.shoulderR) * 0.42 +
      (b.elbowR - rest.elbowR) * 0.28 +
      (b.wristR - rest.wristR) * 0.22;
    const dArmL =
      (b.shoulderL - rest.shoulderL) * 0.38 +
      (b.elbowL - rest.elbowL) * 0.22;
    const dHipR = (b.hipR - rest.hipR) * 0.48;
    const dKneeR = (b.kneeR - rest.kneeR) * 0.42;
    const dHipL = (b.hipL - rest.hipL) * 0.48;
    const dKneeL = (b.kneeL - rest.kneeL) * 0.42;

    const scaleMult = config.id === 'raidenbo' ? 1.12 : config.id === 'hotaru' ? 0.94 : 1.0;
    const W = pose.width;
    const H = pose.height;
    const ax = pose.anchorX;
    const ay = pose.anchorY - 6;

    // Anatomical Normalized Grid Coordinates:
    // 5 Columns across width [0, W]: Back Edge, Back Body, Spine/Leg-Split, Front Body, Weapon Tip
    const uSplit = pose.legSplitU;
    const uCols = [
      0.0,
      uSplit * 0.58,
      uSplit,
      uSplit + (1.0 - uSplit) * 0.45,
      1.0,
    ];
    // 4 Upper-Body Rows across height [0, H]: Crown (0.0), Neck/Shoulder (0.25), Chest/Elbow (0.42), Pelvis/Hip (0.56)
    const vUpper = [0.0, 0.25, 0.42, 0.56];
    // 3 Lower-Body Leg Rows across height [0, H]: Hip (0.56), Knee (0.78), Foot/Ankle (1.0)
    const vLegs = [0.56, 0.78, 1.0];

    // Key Anatomical Joint Pivots in local space (relative to foot anchor `(0, 0)`)
    const pelvisPivotX = (uCols[2] * W - ax) + dPelvisX;
    const pelvisPivotY = (vUpper[3] * H - ay) + dPelvisY;

    const neckBase = this.rotatePoint(
      (uCols[2] * W - ax) + dPelvisX,
      (vUpper[1] * H - ay) + dPelvisY,
      pelvisPivotX,
      pelvisPivotY,
      dTorso
    );
    const frontShoulderBase = this.rotatePoint(
      (uCols[3] * W - ax) + dPelvisX,
      (vUpper[1] * H - ay) + dPelvisY,
      pelvisPivotX,
      pelvisPivotY,
      dTorso
    );
    const backShoulderBase = this.rotatePoint(
      (uCols[1] * W - ax) + dPelvisX,
      (vUpper[1] * H - ay) + dPelvisY,
      pelvisPivotX,
      pelvisPivotY,
      dTorso
    );

    // 1. Compute Deformed Upper-Body Vertices (4 rows x 5 cols)
    const upperVerts: MeshVertex[][] = [];
    for (let r = 0; r < 4; r++) {
      const row: MeshVertex[] = [];
      const vNorm = vUpper[r];
      const srcY = vNorm * H;
      // Spine torso weight fades smoothly from 1.0 at chest/neck to 0.35 at pelvis
      const torsoWeight = r === 3 ? 0.35 : 1.0;

      for (let c = 0; c < 5; c++) {
        const uNorm = uCols[c];
        const srcX = uNorm * W;

        // Start in rest local space shifted by pelvis translation
        let x = (srcX - ax) + dPelvisX;
        let y = (srcY - ay) + dPelvisY;

        // Apply spine/torso rotation around pelvis
        const pTorso = this.rotatePoint(x, y, pelvisPivotX, pelvisPivotY, dTorso * torsoWeight);
        x = pTorso.x;
        y = pTorso.y;

        // Head & Crown articulation (top 2 rows, center columns)
        if (r <= 1 && c >= 1 && c <= 3) {
          const headWeight = r === 0 ? 1.0 : 0.45;
          const pHead = this.rotatePoint(x, y, neckBase.x, neckBase.y, dHead * headWeight);
          x = pHead.x;
          y = pHead.y;
        }

        // Front Sword Arm & Extended Weapon articulation (rightmost columns c = 3, 4)
        if (c >= 3 && r <= 2) {
          const armWeight = c === 4 ? 1.0 : 0.35;
          const pArmR = this.rotatePoint(
            x,
            y,
            frontShoulderBase.x,
            frontShoulderBase.y,
            dArmR * armWeight
          );
          x = pArmR.x;
          y = pArmR.y;
        }

        // Back Arm & Rear Scarf/Silhouette articulation (leftmost columns c = 0, 1)
        if (c <= 1 && r >= 1 && r <= 2) {
          const armLWeight = c === 0 ? 0.9 : 0.3;
          const pArmL = this.rotatePoint(
            x,
            y,
            backShoulderBase.x,
            backShoulderBase.y,
            dArmL * armLWeight
          );
          x = pArmL.x;
          y = pArmL.y;
        }

        row.push({ u: srcX, v: srcY, x, y });
      }
      upperVerts.push(row);
    }

    // 2. Compute Deformed Back Leg Strip (Left side: cols 0, 1, 2; rows vLegs = 0.56, 0.78, 1.0)
    // Row 0 of Back Leg is IDENTICAL to Row 3 (cols 0, 1, 2) of Upper Body so the hip is 100% seamless!
    const backHipPivot = upperVerts[3][1];
    const backLegVerts: MeshVertex[][] = [
      [upperVerts[3][0], upperVerts[3][1], upperVerts[3][2]],
    ];
    for (let r = 1; r <= 2; r++) {
      const row: MeshVertex[] = [];
      const srcY = vLegs[r] * H;
      for (let c = 0; c <= 2; c++) {
        const srcX = uCols[c] * W;
        let x = (srcX - ax) + dPelvisX * (r === 1 ? 0.6 : 0.25);
        let y = (srcY - ay) + dPelvisY * (r === 1 ? 0.5 : 0.0);

        // Rotate Thigh + Shin around Back Hip
        const pHip = this.rotatePoint(x, y, backHipPivot.x, backHipPivot.y, dHipL);
        x = pHip.x;
        y = pHip.y;

        // Additional Knee bend on the Ankle/Foot row (r = 2)
        if (r === 2) {
          const kneePivot = backLegVerts[1][1];
          const pKnee = this.rotatePoint(x, y, kneePivot.x, kneePivot.y, dKneeL);
          x = pKnee.x;
          y = pKnee.y;
        }
        row.push({ u: srcX, v: srcY, x, y });
      }
      backLegVerts.push(row);
    }

    // 3. Compute Deformed Front Leg Strip (Right side: cols 2, 3, 4; rows vLegs = 0.56, 0.78, 1.0)
    // Row 0 of Front Leg is IDENTICAL to Row 3 (cols 2, 3, 4) of Upper Body so the hip is 100% seamless!
    const frontHipPivot = upperVerts[3][3];
    const frontLegVerts: MeshVertex[][] = [
      [upperVerts[3][2], upperVerts[3][3], upperVerts[3][4]],
    ];
    for (let r = 1; r <= 2; r++) {
      const row: MeshVertex[] = [];
      const srcY = vLegs[r] * H;
      for (let c = 2; c <= 4; c++) {
        const srcX = uCols[c] * W;
        let x = (srcX - ax) + dPelvisX * (r === 1 ? 0.6 : 0.25);
        let y = (srcY - ay) + dPelvisY * (r === 1 ? 0.5 : 0.0);

        // Rotate Thigh + Shin around Front Hip
        const pHip = this.rotatePoint(x, y, frontHipPivot.x, frontHipPivot.y, dHipR);
        x = pHip.x;
        y = pHip.y;

        // Additional Knee bend on the Ankle/Foot row (r = 2)
        if (r === 2) {
          const kneePivot = frontLegVerts[1][1];
          const pKnee = this.rotatePoint(x, y, kneePivot.x, kneePivot.y, dKneeR);
          x = pKnee.x;
          y = pKnee.y;
        }
        row.push({ u: srcX, v: srcY, x, y });
      }
      frontLegVerts.push(row);
    }

    ctx.save();
    ctx.scale(scaleMult, scaleMult);

    // 4. Optional Ghost Afterimage during Dash & Heavy/Special Attacks
    if (
      input.state === 'dash' ||
      (input.state === 'attack' && input.activeAttackKey && input.activeAttackKey !== 'light')
    ) {
      ctx.save();
      ctx.globalAlpha = 0.35;
      ctx.translate(-26, 0);
      ctx.drawImage(pose.ghostCanvas, -ax + dPelvisX, -ay + dPelvisY);
      ctx.restore();
    }

    // 5. Render the Skinned Mesh Triangles Using Original Hand-Painted Watercolor Texture!
    const tex = input.hitFlashFrames && input.hitFlashFrames > 0 ? pose.flashCanvas : pose.normalCanvas;

    // Draw Back Leg Strip (2x2 quads = 8 triangles)
    this.drawMeshGrid(ctx, tex, backLegVerts, 2, 2);

    // Draw Front Leg Strip (2x2 quads = 8 triangles)
    this.drawMeshGrid(ctx, tex, frontLegVerts, 2, 2);

    // Draw Upper Body, Head, Arms & Weapon (3x4 quads = 24 triangles)
    this.drawMeshGrid(ctx, tex, upperVerts, 3, 4);

    ctx.restore();
  }

  private drawMeshGrid(
    ctx: CanvasRenderingContext2D,
    tex: HTMLCanvasElement,
    verts: MeshVertex[][],
    numRows: number,
    numCols: number
  ): void {
    for (let r = 0; r < numRows; r++) {
      for (let c = 0; c < numCols; c++) {
        const v00 = verts[r][c];
        const v10 = verts[r][c + 1];
        const v01 = verts[r + 1][c];
        const v11 = verts[r + 1][c + 1];

        this.drawTexturedTriangle(ctx, tex, v00, v10, v11);
        this.drawTexturedTriangle(ctx, tex, v00, v11, v01);
      }
    }
  }

  // Hardware-accelerated affine triangle texture mapper with 0.75px clip expansion to eliminate seams
  private drawTexturedTriangle(
    ctx: CanvasRenderingContext2D,
    tex: HTMLCanvasElement,
    p0: MeshVertex,
    p1: MeshVertex,
    p2: MeshVertex
  ): void {
    const du1 = p1.u - p0.u;
    const dv1 = p1.v - p0.v;
    const du2 = p2.u - p0.u;
    const dv2 = p2.v - p0.v;

    const det = du1 * dv2 - du2 * dv1;
    if (Math.abs(det) < 1e-4) return;
    const invDet = 1 / det;

    const dx1 = p1.x - p0.x;
    const dy1 = p1.y - p0.y;
    const dx2 = p2.x - p0.x;
    const dy2 = p2.y - p0.y;

    const a = (dx1 * dv2 - dx2 * dv1) * invDet;
    const b = (dy1 * dv2 - dy2 * dv1) * invDet;
    const c = (du1 * dx2 - du2 * dx1) * invDet;
    const d = (du1 * dy2 - du2 * dy1) * invDet;
    const e = p0.x - a * p0.u - c * p0.v;
    const f = p0.y - b * p0.u - d * p0.v;

    // Expand clip triangle slightly outward from centroid to prevent subpixel anti-aliasing seams
    const cx = (p0.x + p1.x + p2.x) / 3;
    const cy = (p0.y + p1.y + p2.y) / 3;
    const expand = (px: number, py: number): { x: number; y: number } => {
      const vx = px - cx;
      const vy = py - cy;
      const len = Math.hypot(vx, vy) || 1;
      return { x: px + (vx / len) * 0.75, y: py + (vy / len) * 0.75 };
    };
    const c0 = expand(p0.x, p0.y);
    const c1 = expand(p1.x, p1.y);
    const c2 = expand(p2.x, p2.y);

    ctx.save();
    ctx.beginPath();
    ctx.moveTo(c0.x, c0.y);
    ctx.lineTo(c1.x, c1.y);
    ctx.lineTo(c2.x, c2.y);
    ctx.closePath();
    ctx.clip();

    ctx.transform(a, b, c, d, e, f);
    ctx.drawImage(tex, 0, 0);
    ctx.restore();
  }
}
