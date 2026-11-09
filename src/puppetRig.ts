// Painted Watercolor Skeletal Puppet Rig (Spine / DragonBones Style 2D Hierarchical Bone Engine)
// Combines the exact AI-painted Japanese watercolor character artwork (Head, Torso, Front Sword Arm,
// Back Arm, Front Leg, Back Leg) with real 60fps hierarchical bone & joint kinematics!

export interface PuppetLimbSprite {
  canvas: HTMLCanvasElement;
  cropX: number;
  cropY: number;
  cropW: number;
  cropH: number;
  // Normalized pivot point (0..1) inside the cropped part where the parent joint attaches
  pivotRatioX: number;
  pivotRatioY: number;
}

export interface FighterPuppetParts {
  loaded: boolean;
  head?: PuppetLimbSprite;
  torso?: PuppetLimbSprite;
  frontArm?: PuppetLimbSprite;
  backArm?: PuppetLimbSprite;
  frontLeg?: PuppetLimbSprite;
  backLeg?: PuppetLimbSprite;
}

export interface PuppetPoseState {
  pelvisY: number;
  pelvisRot: number;
  torsoRot: number;
  headRot: number;
  frontArmRot: number;
  backArmRot: number;
  frontLegRot: number;
  frontKneeBendY: number;
  backLegRot: number;
  backKneeBendY: number;
  lungeOffsetX: number;
}

export interface PuppetUpdateInput {
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

export class WatercolorPuppetRigEngine {
  private characterParts: Map<string, FighterPuppetParts> = new Map();
  private smoothedPoses: Map<string, PuppetPoseState> = new Map();

  public ensurePuppetLoaded(fighterId: string, partsSheetUrl: string): void {
    if (this.characterParts.has(fighterId)) return;

    const record: FighterPuppetParts = { loaded: false };
    this.characterParts.set(fighterId, record);

    const img = new Image();
    img.src = partsSheetUrl;
    img.onload = () => {
      const W = img.naturalWidth;
      const H = img.naturalHeight;
      const colW = Math.floor(W / 2);
      const rowH = Math.floor(H / 3);

      // Extract each of the 6 cells in the 2x3 modular body-part sheet:
      // Row 0, Col 0: Head & Hair/Mask (pivot at bottom-center neck)
      record.head = this.extractCleanPart(img, 0, 0, colW, rowH, 0.52, 0.85);
      // Row 0, Col 1: Torso & Haori/Obi (pivot at bottom-center waist/pelvis)
      record.torso = this.extractCleanPart(img, colW, 0, colW, rowH, 0.5, 0.82);
      // Row 1, Col 0: Front Sword Arm + Weapon (pivot at left-upper shoulder sleeve)
      const frontArmPivotX = fighterId === 'raidenbo' ? 0.24 : 0.16;
      const frontArmPivotY = fighterId === 'yuki' ? 0.52 : 0.35;
      record.frontArm = this.extractCleanPart(
        img,
        0,
        rowH,
        colW,
        rowH,
        frontArmPivotX,
        frontArmPivotY
      );
      // Row 1, Col 1: Back / Off-hand Arm (pivot at upper shoulder sleeve)
      const backArmPivotX =
        fighterId === 'kazemaru' ? 0.78 : fighterId === 'hotaru' ? 0.58 : 0.25;
      const backArmPivotY = fighterId === 'hotaru' ? 0.22 : 0.25;
      record.backArm = this.extractCleanPart(
        img,
        colW,
        rowH,
        colW,
        rowH,
        backArmPivotX,
        backArmPivotY
      );
      // Row 2, Col 0: Front Leg Hakama + Sandal (pivot at top-center hip)
      record.frontLeg = this.extractCleanPart(img, 0, rowH * 2, colW, rowH, 0.45, 0.12);
      // Row 2, Col 1: Back Leg Hakama + Sandal (pivot at top-center hip)
      record.backLeg = this.extractCleanPart(img, colW, rowH * 2, colW, rowH, 0.42, 0.12);

      record.loaded = true;
    };
  }

  public isPuppetReady(fighterId: string): boolean {
    const p = this.characterParts.get(fighterId);
    return Boolean(p && p.loaded && p.torso && p.head && p.frontArm && p.frontLeg);
  }

  private extractCleanPart(
    img: HTMLImageElement,
    sx: number,
    sy: number,
    sw: number,
    sh: number,
    defaultPivotX: number,
    defaultPivotY: number
  ): PuppetLimbSprite {
    // Inset cell slightly by 6px to avoid any edge bleed between adjacent cells
    const pad = 6;
    const cx0 = sx + pad;
    const cy0 = sy + pad;
    const cw = sw - pad * 2;
    const ch = sh - pad * 2;

    const off = document.createElement('canvas');
    off.width = cw;
    off.height = ch;
    const ctx = off.getContext('2d')!;
    ctx.drawImage(img, cx0, cy0, cw, ch, 0, 0, cw, ch);

    const imgData = ctx.getImageData(0, 0, cw, ch);
    const data = imgData.data;
    const visited = new Uint8Array(cw * ch);
    const queue = new Int32Array(cw * ch);
    let head = 0;
    let tail = 0;

    const isWhite = (idx: number): boolean => {
      const p = idx * 4;
      return data[p] > 232 && data[p + 1] > 232 && data[p + 2] > 232;
    };

    for (let x = 0; x < cw; x++) {
      const top = x;
      const bot = (ch - 1) * cw + x;
      if (isWhite(top)) {
        visited[top] = 1;
        queue[tail++] = top;
      }
      if (isWhite(bot)) {
        visited[bot] = 1;
        queue[tail++] = bot;
      }
    }
    for (let y = 0; y < ch; y++) {
      const left = y * cw;
      const right = y * cw + (cw - 1);
      if (!visited[left] && isWhite(left)) {
        visited[left] = 1;
        queue[tail++] = left;
      }
      if (!visited[right] && isWhite(right)) {
        visited[right] = 1;
        queue[tail++] = right;
      }
    }

    while (head < tail) {
      const curr = queue[head++];
      data[curr * 4 + 3] = 0;

      const x = curr % cw;
      const y = (curr - x) / cw;
      const neighbors = [
        x > 0 ? curr - 1 : -1,
        x < cw - 1 ? curr + 1 : -1,
        y > 0 ? curr - cw : -1,
        y < ch - 1 ? curr + cw : -1,
      ];

      for (let i = 0; i < 4; i++) {
        const n = neighbors[i];
        if (n !== -1 && !visited[n]) {
          if (isWhite(n)) {
            visited[n] = 1;
            queue[tail++] = n;
          } else {
            const np = n * 4;
            const lum = (data[np] + data[np + 1] + data[np + 2]) / 3;
            if (lum > 205) {
              data[np + 3] = Math.round(((242 - lum) / 37) * 255);
            }
          }
        }
      }
    }

    let minX = cw,
      minY = ch,
      maxX = 0,
      maxY = 0;
    for (let y = 0; y < ch; y++) {
      for (let x = 0; x < cw; x++) {
        if (data[(y * cw + x) * 4 + 3] > 28) {
          if (x < minX) minX = x;
          if (x > maxX) maxX = x;
          if (y < minY) minY = y;
          if (y > maxY) maxY = y;
        }
      }
    }

    if (maxX <= minX || maxY <= minY) {
      minX = 0;
      minY = 0;
      maxX = cw - 1;
      maxY = ch - 1;
    }

    ctx.putImageData(imgData, 0, 0);

    return {
      canvas: off,
      cropX: minX,
      cropY: minY,
      cropW: Math.max(1, maxX - minX + 1),
      cropH: Math.max(1, maxY - minY + 1),
      pivotRatioX: defaultPivotX,
      pivotRatioY: defaultPivotY,
    };
  }

  private damp(cur: number, target: number, rate: number): number {
    return cur + (target - cur) * rate;
  }

  public renderPuppetFighter(
    ctx: CanvasRenderingContext2D,
    slotKey: string,
    fighterId: string,
    targetHeight: number,
    input: PuppetUpdateInput,
    filterCss: string
  ): void {
    const parts = this.characterParts.get(fighterId);
    if (!parts || !parts.loaded || !parts.torso || !parts.head || !parts.frontArm || !parts.frontLeg) {
      return;
    }

    const t = input.animTick;
    const breathe = Math.sin(t * 0.09);

    // Compute Target Bone Angles (in radians; positive rotates clockwise/downward when facing right)
    let target: PuppetPoseState = {
      pelvisY: -targetHeight * 0.44 + breathe * -2.5,
      pelvisRot: 0,
      torsoRot: 0.04 + breathe * 0.025,
      headRot: -0.03 - breathe * 0.02,
      frontArmRot: 0.08 + breathe * 0.04,
      backArmRot: 0.15 - breathe * 0.03,
      frontLegRot: -0.18,
      frontKneeBendY: 1.0,
      backLegRot: 0.22,
      backKneeBendY: 1.0,
      lungeOffsetX: 0,
    };

    // 1. WALKING / FOOTWORK STRIDE KINEMATICS (Real scissoring legs + knee lift + arm counter-swing!)
    if (input.state === 'walk_fwd' || input.state === 'walk_back') {
      const dir = input.state === 'walk_fwd' ? 1 : -1;
      const cycle = t * 0.25 * dir;
      const s = Math.sin(cycle);
      const c = Math.cos(cycle);

      target.pelvisY = -targetHeight * 0.44 + Math.abs(c) * -9;
      target.torsoRot = dir === 1 ? 0.14 : -0.06;
      target.headRot = dir === 1 ? -0.08 : 0.04;

      // Front and Back legs swing in opposite phases from the hip joint
      target.frontLegRot = -s * 0.58;
      target.frontKneeBendY = c > 0 ? 1 - c * 0.12 : 1.0;

      target.backLegRot = s * 0.58;
      target.backKneeBendY = c < 0 ? 1 + c * 0.12 : 1.0;

      // Arms counter-swing naturally with stride
      target.frontArmRot = 0.12 + s * 0.22;
      target.backArmRot = 0.2 - s * 0.42;
    }

    // 2. INK-STEP SPRINT DASH
    else if (input.state === 'dash') {
      const cycle = t * 0.46;
      const s = Math.sin(cycle);
      target.pelvisY = -targetHeight * 0.39;
      target.torsoRot = 0.38; // Deep forward ninja/ronin sprint lean
      target.headRot = -0.26;
      target.lungeOffsetX = 16;
      target.frontLegRot = -s * 0.82;
      target.backLegRot = s * 0.82;
      target.frontArmRot = 0.45; // Sword trailed ready to strike
      target.backArmRot = 0.65;
    }

    // 3. CROUCH STANCE
    else if (input.state === 'crouch') {
      target.pelvisY = -targetHeight * 0.31;
      target.torsoRot = 0.24;
      target.headRot = -0.18;
      target.frontLegRot = -0.42;
      target.frontKneeBendY = 0.76;
      target.backLegRot = 0.38;
      target.backKneeBendY = 0.76;
      target.frontArmRot = 0.25;
      target.backArmRot = 0.35;
    }

    // 4. AIRBORNE JUMP
    else if (!input.isGrounded && input.state !== 'attack') {
      const rising = input.vy < 0;
      target.pelvisY = -targetHeight * 0.46;
      target.torsoRot = rising ? 0.16 : -0.1;
      target.frontLegRot = rising ? -0.55 : -0.25;
      target.frontKneeBendY = rising ? 0.82 : 0.98;
      target.backLegRot = rising ? 0.45 : 0.28;
      target.backKneeBendY = rising ? 0.85 : 0.98;
      target.frontArmRot = rising ? -0.45 : 0.35;
      target.backArmRot = rising ? -0.35 : 0.45;
    }

    // 5. SWORD ATTACK CHOREOGRAPHY (Real 3-Phase Wind-up -> Full Shoulder/Sword Swing Arc -> Zanshin Recovery!)
    if (input.state === 'attack' && input.activeAttackKey) {
      const key = input.activeAttackKey;
      const f = input.stateFrame;
      const sUp = Math.max(1, input.attackStartup);
      const act = Math.max(1, input.attackActive);
      const rec = Math.max(1, input.attackRecovery);

      // Deep martial-arts lunge stance
      target.pelvisY = -targetHeight * 0.4;
      target.frontLegRot = -0.52;
      target.backLegRot = 0.56;

      if (f <= sUp) {
        // Phase 1: Wind-up Coil (Raise sword high or draw across chest)
        const p = f / sUp;
        if (key === 'light') {
          target.torsoRot = -0.14 * p;
          target.frontArmRot = -0.95 * p;
          target.backArmRot = -0.45 * p;
          target.lungeOffsetX = -10 * p;
        } else if (key === 'medium' || key === 'special1') {
          target.torsoRot = -0.22 * p;
          target.frontArmRot = -1.35 * p;
          target.backArmRot = -0.65 * p;
          target.lungeOffsetX = -16 * p;
        } else {
          // Heavy / Rising Dragon / Super: High overhead raise (Jōdan-no-Kamae)
          target.torsoRot = -0.28 * p;
          target.headRot = 0.15 * p;
          target.frontArmRot = -1.85 * p;
          target.backArmRot = -1.45 * p;
          target.lungeOffsetX = -18 * p;
        }
      } else if (f <= sUp + act) {
        // Phase 2: Explosive Active Blade Swing Arc!
        const p = (f - sUp) / act;
        const ease = 1 - Math.pow(1 - p, 2.2);

        if (key === 'light') {
          target.torsoRot = 0.26;
          target.frontArmRot = -0.95 + 1.35 * ease;
          target.backArmRot = 0.35;
          target.lungeOffsetX = 24 * ease;
        } else if (key === 'medium' || key === 'special1') {
          target.torsoRot = 0.34;
          target.frontArmRot = -1.35 + 1.95 * ease;
          target.backArmRot = 0.55 * ease;
          target.lungeOffsetX = 32 * ease;
        } else if (key === 'special2') {
          // Rising Dragon Uppercut Slash (from low crouch up into the sky!)
          target.torsoRot = 0.25 - 0.55 * ease;
          target.frontArmRot = 0.85 - 2.65 * ease;
          target.backArmRot = 0.65 - 1.95 * ease;
          target.lungeOffsetX = 22 * ease;
        } else {
          // Heavy Cleave & Zanshin Super Art: Full 180° Overhead-to-Floor Cleave!
          target.torsoRot = -0.28 + 0.72 * ease;
          target.headRot = -0.22 * ease;
          target.frontArmRot = -1.85 + 2.65 * ease;
          target.backArmRot = -1.45 + 2.15 * ease;
          target.lungeOffsetX = 38 * ease;
        }
      } else {
        // Phase 3: Zanshin Follow-Through -> Smooth Return to Ready Guard
        const p = Math.min(1, (f - sUp - act) / rec);
        const hold = 1 - p;
        target.torsoRot = 0.32 * hold + 0.04 * p;
        target.frontArmRot = 0.55 * hold + 0.08 * p;
        target.backArmRot = 0.45 * hold + 0.15 * p;
        target.lungeOffsetX = 28 * hold;
      }
    }

    // 6. PARRY & BLOCK GUARD
    else if (input.state === 'parry' || input.state === 'blockstun') {
      target.pelvisY = -targetHeight * 0.41;
      target.torsoRot = -0.12;
      target.frontArmRot = -0.82; // Blade raised defensively in front of chest/head
      target.backArmRot = -0.55;
      target.frontLegRot = -0.32;
      target.backLegRot = 0.38;
      target.lungeOffsetX = -8;
    }

    // 7. HITSTUN RECOIL & KNOCKOUT
    else if (input.state === 'hitstun') {
      target.pelvisY = -targetHeight * 0.42;
      target.torsoRot = -0.38;
      target.headRot = -0.28;
      target.frontArmRot = -0.55;
      target.backArmRot = 0.65;
      target.lungeOffsetX = -18;
    } else if (input.state === 'ko') {
      target.pelvisY = -targetHeight * 0.12;
      target.pelvisRot = -1.45;
      target.torsoRot = -0.15;
    }

    // Smoothly interpolate current bone angles toward target angles
    const stateKey = `${slotKey}_${fighterId}`;
    let cur = this.smoothedPoses.get(stateKey);
    if (!cur) {
      cur = { ...target };
      this.smoothedPoses.set(stateKey, cur);
    }

    const rate = input.state === 'attack' ? 0.58 : 0.34;
    cur.pelvisY = this.damp(cur.pelvisY, target.pelvisY, rate);
    cur.pelvisRot = this.damp(cur.pelvisRot, target.pelvisRot, rate);
    cur.torsoRot = this.damp(cur.torsoRot, target.torsoRot, rate);
    cur.headRot = this.damp(cur.headRot, target.headRot, rate);
    cur.frontArmRot = this.damp(cur.frontArmRot, target.frontArmRot, rate);
    cur.backArmRot = this.damp(cur.backArmRot, target.backArmRot, rate);
    cur.frontLegRot = this.damp(cur.frontLegRot, target.frontLegRot, rate);
    cur.frontKneeBendY = this.damp(cur.frontKneeBendY, target.frontKneeBendY, rate);
    cur.backLegRot = this.damp(cur.backLegRot, target.backLegRot, rate);
    cur.backKneeBendY = this.damp(cur.backKneeBendY, target.backKneeBendY, rate);
    cur.lungeOffsetX = this.damp(cur.lungeOffsetX, target.lungeOffsetX, rate);

    // Proportional sizing of each body part relative to total character height
    const torsoH = targetHeight * 0.46;
    const headH = targetHeight * 0.31;
    const legH = targetHeight * 0.49;
    const armMaxW = targetHeight * 0.88;
    const armMaxH = targetHeight * 0.46;

    ctx.save();
    ctx.filter = filterCss;
    ctx.translate(cur.lungeOffsetX, cur.pelvisY);
    ctx.rotate(cur.pelvisRot);

    // --- LAYER 1 (Back-most): BACK ARM ---
    if (parts.backArm) {
      ctx.save();
      ctx.rotate(cur.torsoRot);
      ctx.translate(8, -torsoH * 0.72);
      ctx.rotate(cur.backArmRot);
      this.drawLimbConstrained(ctx, parts.backArm, armMaxW * 0.78, armMaxH * 0.78);
      ctx.restore();
    }

    // --- LAYER 2: BACK LEG ---
    if (parts.backLeg) {
      ctx.save();
      ctx.translate(6, 2);
      ctx.rotate(cur.backLegRot);
      ctx.scale(1, cur.backKneeBendY);
      this.drawLimbConstrained(ctx, parts.backLeg, targetHeight * 0.65, legH * 0.96);
      ctx.restore();
    }

    // --- LAYER 3: FRONT LEG ---
    ctx.save();
    ctx.translate(-4, 4);
    ctx.rotate(cur.frontLegRot);
    ctx.scale(1, cur.frontKneeBendY);
    this.drawLimbConstrained(ctx, parts.frontLeg, targetHeight * 0.68, legH);
    ctx.restore();

    // --- LAYER 4: TORSO & HAORI ---
    ctx.save();
    ctx.rotate(cur.torsoRot);
    this.drawLimbConstrained(ctx, parts.torso, targetHeight * 0.65, torsoH);

    // --- LAYER 5: HEAD & HAIR / MASK (Attached to Neck at top of Torso) ---
    ctx.save();
    ctx.translate(4, -torsoH * 0.76);
    ctx.rotate(cur.headRot);
    this.drawLimbConstrained(ctx, parts.head, targetHeight * 0.48, headH);
    ctx.restore();

    // --- LAYER 6 (Front-most): FRONT SWORD ARM + WEAPON (Attached to Lead Shoulder) ---
    ctx.save();
    ctx.translate(-8, -torsoH * 0.66);
    ctx.rotate(cur.frontArmRot);
    this.drawLimbConstrained(ctx, parts.frontArm, armMaxW, armMaxH);
    ctx.restore();

    ctx.restore(); // end torso
    ctx.restore(); // end pelvis
  }

  private drawLimbConstrained(
    ctx: CanvasRenderingContext2D,
    limb: PuppetLimbSprite,
    maxW: number,
    maxH: number
  ): void {
    const scale = Math.min(maxW / limb.cropW, maxH / limb.cropH);
    const drawW = limb.cropW * scale;
    const drawH = limb.cropH * scale;
    const px = limb.pivotRatioX * drawW;
    const py = limb.pivotRatioY * drawH;

    ctx.drawImage(
      limb.canvas,
      limb.cropX,
      limb.cropY,
      limb.cropW,
      limb.cropH,
      -px,
      -py,
      drawW,
      drawH
    );
  }
}
