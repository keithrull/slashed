// Skeletal Watercolor Mesh & Multi-Pose Animation System
// Combines multi-pose action keyframes (Idle, Stride, Slash, Heavy/Jump, Guard/Hit)
// with real-time 2D skeletal deformation (breathing chest, articulated knee/foot stride,
// torso twist, head tracking, and arm/weapon swing) so painted watercolor characters
// move like living fighters instead of stiff sliding cutouts.

export type PoseKey = 'idle' | 'run' | 'slash' | 'heavy' | 'guard';

export interface CroppedPoseFrame {
  canvas: HTMLCanvasElement;
  cropX: number;
  cropY: number;
  cropW: number;
  cropH: number;
  footCenterX: number;
}

export interface FighterPoseSet {
  idle?: CroppedPoseFrame;
  run?: CroppedPoseFrame;
  slash?: CroppedPoseFrame;
  heavy?: CroppedPoseFrame;
  guard?: CroppedPoseFrame;
}

export interface SkeletalDeformParams {
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

export class WatercolorSpriteAnimator {
  private poseSets: Map<string, FighterPoseSet> = new Map();

  public ensureFighterLoaded(fighterId: string, baseSpriteUrl: string, sheetUrl: string): void {
    if (this.poseSets.has(fighterId)) return;
    const set: FighterPoseSet = {};
    this.poseSets.set(fighterId, set);

    // 1. Load primary high-res Idle / Ready Stance sprite
    const idleImg = new Image();
    idleImg.src = baseSpriteUrl;
    idleImg.onload = () => {
      set.idle = this.removeWhiteBgAndCrop(idleImg, 0, 0, idleImg.naturalWidth, idleImg.naturalHeight);
    };

    // 2. Load 2x2 Action Pose Sheet (Top-Left: run, Top-Right: slash, Bottom-Left: heavy/jump, Bottom-Right: guard/hit)
    const sheetImg = new Image();
    sheetImg.src = sheetUrl;
    sheetImg.onload = () => {
      const halfW = Math.floor(sheetImg.naturalWidth / 2);
      const halfH = Math.floor(sheetImg.naturalHeight / 2);

      const runFrame = this.removeWhiteBgAndCrop(sheetImg, 0, 0, halfW, halfH);
      const slashFrame = this.removeWhiteBgAndCrop(sheetImg, halfW, 0, halfW, halfH);
      const heavyFrame = this.removeWhiteBgAndCrop(sheetImg, 0, halfH, halfW, halfH);
      const guardFrame = this.removeWhiteBgAndCrop(sheetImg, halfW, halfH, halfW, halfH);

      if (runFrame.cropW > 40 && runFrame.cropH > 40) set.run = runFrame;
      if (slashFrame.cropW > 40 && slashFrame.cropH > 40) set.slash = slashFrame;
      if (heavyFrame.cropW > 40 && heavyFrame.cropH > 40) set.heavy = heavyFrame;
      if (guardFrame.cropW > 40 && guardFrame.cropH > 40) set.guard = guardFrame;
    };
  }

  public getPoseSet(fighterId: string): FighterPoseSet | undefined {
    return this.poseSets.get(fighterId);
  }

  // Flood-fills exterior white background from borders inward and returns tightly cropped transparent canvas
  private removeWhiteBgAndCrop(
    img: HTMLImageElement,
    sx: number,
    sy: number,
    sw: number,
    sh: number
  ): CroppedPoseFrame {
    const off = document.createElement('canvas');
    off.width = sw;
    off.height = sh;
    const octx = off.getContext('2d')!;
    octx.drawImage(img, sx, sy, sw, sh, 0, 0, sw, sh);

    const imgData = octx.getImageData(0, 0, sw, sh);
    const data = imgData.data;
    const visited = new Uint8Array(sw * sh);
    const queue = new Int32Array(sw * sh);
    let head = 0;
    let tail = 0;

    const isBgWhite = (idx: number): boolean => {
      const p = idx * 4;
      return data[p] > 232 && data[p + 1] > 232 && data[p + 2] > 232;
    };

    for (let x = 0; x < sw; x++) {
      const topIdx = x;
      const botIdx = (sh - 1) * sw + x;
      if (isBgWhite(topIdx)) {
        visited[topIdx] = 1;
        queue[tail++] = topIdx;
      }
      if (isBgWhite(botIdx)) {
        visited[botIdx] = 1;
        queue[tail++] = botIdx;
      }
    }
    for (let y = 0; y < sh; y++) {
      const leftIdx = y * sw;
      const rightIdx = y * sw + (sw - 1);
      if (!visited[leftIdx] && isBgWhite(leftIdx)) {
        visited[leftIdx] = 1;
        queue[tail++] = leftIdx;
      }
      if (!visited[rightIdx] && isBgWhite(rightIdx)) {
        visited[rightIdx] = 1;
        queue[tail++] = rightIdx;
      }
    }

    while (head < tail) {
      const curr = queue[head++];
      data[curr * 4 + 3] = 0;

      const cx = curr % sw;
      const cy = (curr - cx) / sw;
      const n0 = cx > 0 ? curr - 1 : -1;
      const n1 = cx < sw - 1 ? curr + 1 : -1;
      const n2 = cy > 0 ? curr - sw : -1;
      const n3 = cy < sh - 1 ? curr + sw : -1;

      const neighbors = [n0, n1, n2, n3];
      for (let i = 0; i < 4; i++) {
        const n = neighbors[i];
        if (n !== -1 && !visited[n]) {
          if (isBgWhite(n)) {
            visited[n] = 1;
            queue[tail++] = n;
          } else {
            const np = n * 4;
            const lum = (data[np] + data[np + 1] + data[np + 2]) / 3;
            if (lum > 200) {
              data[np + 3] = Math.round(((240 - lum) / 40) * 255);
            }
          }
        }
      }
    }

    let minX = sw,
      minY = sh,
      maxX = 0,
      maxY = 0;
    for (let y = 0; y < sh; y++) {
      for (let x = 0; x < sw; x++) {
        if (data[(y * sw + x) * 4 + 3] > 28) {
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
      maxX = sw - 1;
      maxY = sh - 1;
    }

    // Compute horizontal center of the feet (bottom 22% of figure)
    let footSumX = 0;
    let footCount = 0;
    const footStartY = Math.floor(maxY - (maxY - minY) * 0.22);
    for (let y = footStartY; y <= maxY; y++) {
      for (let x = minX; x <= maxX; x++) {
        if (data[(y * sw + x) * 4 + 3] > 80) {
          footSumX += x;
          footCount++;
        }
      }
    }

    octx.putImageData(imgData, 0, 0);

    const cropW = Math.max(1, maxX - minX + 1);
    const cropH = Math.max(1, maxY - minY + 1);
    const footCenterX = footCount > 0 ? footSumX / footCount - minX : cropW * 0.46;

    return {
      canvas: off,
      cropX: minX,
      cropY: minY,
      cropW,
      cropH,
      footCenterX,
    };
  }

  // Selects the right keyframe pose and renders it using a multi-band articulated skeletal deformer
  // so the head, chest/arms, waist/hakama, and lower legs/feet articulate independently!
  public renderArticulatedFighter(
    ctx: CanvasRenderingContext2D,
    fighterId: string,
    targetHeight: number,
    params: SkeletalDeformParams,
    filterCss: string
  ): void {
    const set = this.poseSets.get(fighterId);
    if (!set || !set.idle) return;

    // 1. Choose active keyframe pose based on fighter combat state & frame phase
    let activePose: CroppedPoseFrame = set.idle;

    if (params.state === 'attack' && params.activeAttackKey) {
      const inWindup = params.stateFrame < params.attackStartup * 0.7;
      const inActiveOrFollow = params.stateFrame >= params.attackStartup * 0.7;

      if (inWindup) {
        // Coil back in guard/windup pose before unleashing slash
        activePose = set.guard || set.idle;
      } else if (inActiveOrFollow) {
        const isHeavyOrAir =
          params.activeAttackKey === 'heavy' ||
          params.activeAttackKey === 'special2' ||
          params.activeAttackKey === 'super' ||
          !params.isGrounded;
        activePose = (isHeavyOrAir ? set.heavy || set.slash : set.slash || set.heavy) || set.idle;
      }
    } else if (params.state === 'dash') {
      activePose = set.run || set.idle;
    } else if (params.state === 'walk_fwd' || params.state === 'walk_back') {
      // Alternate between Run Stride keyframe and Idle Stance keyframe on step cycle!
      const stepPhase = Math.sin(params.animTick * 0.26);
      if (Math.abs(stepPhase) > 0.32 && set.run) {
        activePose = set.run;
      } else {
        activePose = set.idle;
      }
    } else if (!params.isGrounded) {
      activePose = set.heavy || set.run || set.idle;
    } else if (
      params.state === 'parry' ||
      params.state === 'blockstun' ||
      params.state === 'hitstun' ||
      params.state === 'crouch'
    ) {
      activePose = set.guard || set.idle;
    }

    const drawScale = targetHeight / activePose.cropH;
    const drawW = activePose.cropW * drawScale;
    const drawH = targetHeight;
    const anchorX = activePose.footCenterX * drawScale;

    // 2. Compute Articulated Anatomical Strip Displacements (14 horizontal slices from head to feet)
    // Top of sprite (yRatio = 0.0) = Head & Hair Crest
    // Upper-mid (yRatio = 0.25..0.55) = Shoulders, Torso & Weapon Arms
    // Lower-mid (yRatio = 0.55..0.80) = Obi Waist & Upper Hakama
    // Bottom (yRatio = 0.80..1.0) = Lower Shins & Sandals
    const slices = 14;
    const srcSliceH = activePose.cropH / slices;
    const dstSliceH = drawH / slices;

    const breathe = Math.sin(params.animTick * 0.09);
    const walkCycle = Math.sin(params.animTick * 0.26);
    const walkCos = Math.cos(params.animTick * 0.26);

    ctx.save();
    ctx.filter = filterCss;

    for (let i = 0; i < slices; i++) {
      const yRatio = i / (slices - 1); // 0 = top (head), 1 = bottom (feet)
      const upperFactor = 1 - yRatio;  // 1 at head/shoulders, 0 at feet
      const midTorsoBell = Math.sin(yRatio * Math.PI); // peaks at chest/obi (0.5)
      const legFactor = Math.max(0, (yRatio - 0.55) / 0.45); // 0 above hips, 1 at feet

      let sliceOffsetX = 0;
      let sliceOffsetY = 0;
      let sliceScaleX = 1.0;

      // A. Natural Breathing & Martial Spirit Rhythm (Idle & All States)
      sliceOffsetY += upperFactor * breathe * -3.2;
      sliceScaleX += midTorsoBell * breathe * 0.024;
      // Subtle wind ripple in hair/haori hem
      sliceOffsetX += Math.sin(params.animTick * 0.12 + yRatio * 4.5) * 1.6 * midTorsoBell;

      // B. Walking / Advancing Footwork Articulation
      if (params.state === 'walk_fwd' || params.state === 'walk_back') {
        const dirSign = params.state === 'walk_fwd' ? 1 : -1;
        // Upper body leans into the walk direction while legs scissor beneath
        sliceOffsetX += upperFactor * dirSign * 9 + legFactor * walkCycle * 11 * dirSign;
        // Vertical hip/knee step bounce
        sliceOffsetY += Math.abs(walkCos) * -7 * (0.4 + 0.6 * upperFactor);
        // Torso counter-twist during stride
        sliceScaleX += midTorsoBell * walkCycle * 0.04;
      }

      // C. Explosive Ink-Step Dash Shear
      else if (params.state === 'dash') {
        sliceOffsetX += Math.pow(upperFactor, 1.15) * 28 - legFactor * 10;
        sliceOffsetY += upperFactor * 8;
        sliceScaleX += midTorsoBell * 0.08;
      }

      // D. Crouch Compression (knees bend deeply, torso drops low without squishing head flat)
      else if (params.state === 'crouch') {
        sliceOffsetY += upperFactor * 36;
        sliceOffsetX += midTorsoBell * 8 + upperFactor * 6;
        sliceScaleX += legFactor * 0.12;
      }

      // E. Airborne Jump Tuck & Descent Extension
      else if (!params.isGrounded && params.state !== 'attack') {
        const rising = params.vy < 0;
        sliceOffsetX += upperFactor * (rising ? 10 : -6);
        sliceOffsetY += legFactor * (rising ? -14 : 6);
      }

      // F. Sword Attack Articulation (Coil Back -> Torso Whip & Weapon Extension -> Zanshin Recovery)
      if (params.state === 'attack' && params.activeAttackKey) {
        const armBand = Math.exp(-Math.pow((yRatio - 0.38) / 0.24, 2)); // Peaks strongly at shoulders/arms/weapon
        if (params.stateFrame <= params.attackStartup) {
          const wp = params.stateFrame / Math.max(1, params.attackStartup);
          // Coil torso and sword arm backward
          sliceOffsetX -= (upperFactor * 18 + armBand * 14) * wp;
          sliceOffsetY += upperFactor * 5 * wp;
          sliceScaleX -= armBand * 0.06 * wp;
        } else if (params.stateFrame <= params.attackStartup + params.attackActive) {
          const ap = (params.stateFrame - params.attackStartup) / Math.max(1, params.attackActive);
          // Whip upper torso & weapon arm aggressively forward while back foot anchors!
          const whip = Math.sin(ap * Math.PI * 0.65 + 0.35);
          sliceOffsetX += (upperFactor * 34 + armBand * 26) * whip;
          sliceOffsetY -= upperFactor * 4 * whip;
          sliceScaleX += armBand * 0.14 * whip;
        } else {
          const rp =
            (params.stateFrame - params.attackStartup - params.attackActive) /
            Math.max(1, params.attackRecovery);
          const easeOut = 1 - rp;
          sliceOffsetX += (upperFactor * 24 + armBand * 16) * easeOut;
          sliceScaleX += armBand * 0.08 * easeOut;
        }
      }

      // G. Hitstun Whiplash & Guard Recoil
      else if (params.state === 'hitstun') {
        const recoil = Math.sin(Math.min(1, params.stateFrame / 10) * Math.PI);
        sliceOffsetX -= (upperFactor * 26 + midTorsoBell * 12) * (0.5 + 0.5 * recoil);
        sliceOffsetY += upperFactor * 7;
      } else if (params.state === 'blockstun' || params.state === 'parry') {
        sliceOffsetX -= upperFactor * 8;
        sliceOffsetY += upperFactor * 5;
      }

      const sy = activePose.cropY + i * srcSliceH;
      const dy = -drawH + 8 + i * dstSliceH + sliceOffsetY;
      const dw = drawW * sliceScaleX;
      const dx = -anchorX * sliceScaleX + sliceOffsetX;

      // Draw slightly overlapping vertical strip (+1.2px) to prevent subpixel seam lines
      ctx.drawImage(
        activePose.canvas,
        activePose.cropX,
        sy,
        activePose.cropW,
        srcSliceH + 1.2 / drawScale,
        dx,
        dy,
        dw,
        dstSliceH + 1.4
      );
    }

    ctx.restore();
  }
}
