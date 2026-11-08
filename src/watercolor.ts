import { FighterConfig, StageId } from './fighters';

export interface InkParticle {
  x: number;
  y: number;
  vx: number;
  vy: number;
  radius: number;
  color: string;
  alpha: number;
  decay: number;
  gravity: number;
  isPetal?: boolean;
  angle?: number;
  spin?: number;
}

export interface CalligraphicFloatingText {
  text: string;
  subtext?: string;
  x: number;
  y: number;
  vy: number;
  scale: number;
  alpha: number;
  color: string;
  strokeColor: string;
  life: number;
  maxLife: number;
}

export interface SlashRibbon {
  x: number;
  y: number;
  facing: 1 | -1;
  startAngle: number;
  endAngle: number;
  radius: number;
  primaryColor: string;
  accentColor: string;
  life: number;
  maxLife: number;
  isHeavy: boolean;
  isSuper: boolean;
}

export interface WatercolorProjectile {
  ownerIndex: 0 | 1;
  x: number;
  y: number;
  vx: number;
  radius: number;
  damage: number;
  chipDamage: number;
  hitstun: number;
  blockstun: number;
  knockbackX: number;
  primaryColor: string;
  secondaryColor: string;
  kanji: string;
  active: boolean;
  trailTimer: number;
}

export class WatercolorRenderer {
  public width: number;
  public height: number;
  // Persistent Washi Paper Stain Layer (collects dried watercolor blooms & ink splatters during the match)
  public stainCanvas: HTMLCanvasElement;
  public stainCtx: CanvasRenderingContext2D;
  // Procedural Washi Paper Grain Pattern Canvas
  private paperCanvas: HTMLCanvasElement;
  private stageBgImg: HTMLImageElement;
  private stageBgLoaded: boolean = false;
  private portraitImages: Map<string, HTMLImageElement> = new Map();

  public particles: InkParticle[] = [];
  public ambientPetals: InkParticle[] = [];
  public slashRibbons: SlashRibbon[] = [];
  public floatingTexts: CalligraphicFloatingText[] = [];

  constructor(width: number, height: number) {
    this.width = width;
    this.height = height;

    this.stainCanvas = document.createElement('canvas');
    this.stainCanvas.width = width;
    this.stainCanvas.height = height;
    this.stainCtx = this.stainCanvas.getContext('2d')!;

    this.paperCanvas = this.createWashiPaperTexture(width, height);

    this.stageBgImg = new Image();
    this.stageBgImg.src = '/assets/stage_bg.jpg';
    this.stageBgImg.onload = () => {
      this.stageBgLoaded = true;
    };

    this.initAmbientPetals();
  }

  public preloadPortrait(url: string): HTMLImageElement {
    if (this.portraitImages.has(url)) {
      return this.portraitImages.get(url)!;
    }
    const img = new Image();
    img.src = url;
    this.portraitImages.set(url, img);
    return img;
  }

  private createWashiPaperTexture(w: number, h: number): HTMLCanvasElement {
    const c = document.createElement('canvas');
    c.width = w;
    c.height = h;
    const ctx = c.getContext('2d')!;

    // Base warm cream mulberry paper gradient
    const grad = ctx.createRadialGradient(w * 0.5, h * 0.45, 80, w * 0.5, h * 0.5, w * 0.78);
    grad.addColorStop(0, '#f8f1e5');
    grad.addColorStop(0.65, '#ede0cc');
    grad.addColorStop(1, '#d6c3a7');
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, w, h);

    // Organic mulberry fibers (kozo fibers)
    ctx.strokeStyle = 'rgba(130, 105, 75, 0.08)';
    for (let i = 0; i < 950; i++) {
      const x = Math.random() * w;
      const y = Math.random() * h;
      const len = 8 + Math.random() * 26;
      const angle = Math.random() * Math.PI * 2;
      ctx.lineWidth = 0.5 + Math.random() * 1.2;
      ctx.beginPath();
      ctx.moveTo(x, y);
      ctx.quadraticCurveTo(
        x + Math.cos(angle + 0.3) * len * 0.5,
        y + Math.sin(angle + 0.3) * len * 0.5,
        x + Math.cos(angle) * len,
        y + Math.sin(angle) * len
      );
      ctx.stroke();
    }

    // Subtle tea-stain / aged watercolor clouds on paper edges
    for (let i = 0; i < 18; i++) {
      const bx = Math.random() * w;
      const by = Math.random() * h;
      const r = 90 + Math.random() * 180;
      const bGrad = ctx.createRadialGradient(bx, by, r * 0.1, bx, by, r);
      bGrad.addColorStop(0, 'rgba(168, 138, 102, 0.045)');
      bGrad.addColorStop(0.75, 'rgba(148, 118, 82, 0.06)');
      bGrad.addColorStop(1, 'rgba(148, 118, 82, 0)');
      ctx.fillStyle = bGrad;
      ctx.beginPath();
      ctx.arc(bx, by, r, 0, Math.PI * 2);
      ctx.fill();
    }

    return c;
  }

  public initAmbientPetals(): void {
    this.ambientPetals = [];
    for (let i = 0; i < 36; i++) {
      this.ambientPetals.push({
        x: Math.random() * this.width,
        y: Math.random() * this.height,
        vx: -0.6 - Math.random() * 1.3,
        vy: 0.5 + Math.random() * 1.1,
        radius: 3.5 + Math.random() * 4.5,
        color: Math.random() > 0.3 ? '#e88ca5' : '#2d2622',
        alpha: 0.45 + Math.random() * 0.4,
        decay: 0,
        gravity: 0,
        isPetal: true,
        angle: Math.random() * Math.PI * 2,
        spin: (Math.random() - 0.5) * 0.05,
      });
    }
  }

  public washStainCanvas(): void {
    this.stainCtx.clearRect(0, 0, this.width, this.height);
    this.spawnFloatingKanji('紙洗', 'WASHI CLEANSED', this.width / 2, this.height * 0.35, '#1e3a5f');
  }

  // Stamp an authentic wet-on-wet watercolor pigment bloom onto the persistent Washi paper layer
  public stampWatercolorBloom(
    x: number,
    y: number,
    radius: number,
    color: string,
    alpha: number = 0.24
  ): void {
    const ctx = this.stainCtx;
    ctx.save();
    ctx.translate(x, y);
    ctx.rotate(Math.random() * Math.PI * 2);

    // Wet watercolor pigment ring (lighter center, slightly darker feathered pigment edge)
    const grad = ctx.createRadialGradient(0, 0, radius * 0.1, 0, 0, radius);
    grad.addColorStop(0, this.hexToRgba(color, alpha * 0.45));
    grad.addColorStop(0.72, this.hexToRgba(color, alpha * 0.85));
    grad.addColorStop(0.92, this.hexToRgba(color, alpha * 1.15));
    grad.addColorStop(1, this.hexToRgba(color, 0));

    ctx.fillStyle = grad;
    ctx.beginPath();
    const lobes = 9;
    for (let i = 0; i <= lobes; i++) {
      const ang = (i / lobes) * Math.PI * 2;
      const r = radius * (0.76 + Math.sin(i * 3.7) * 0.22);
      const px = Math.cos(ang) * r;
      const py = Math.sin(ang) * r * 0.72;
      if (i === 0) ctx.moveTo(px, py);
      else ctx.lineTo(px, py);
    }
    ctx.closePath();
    ctx.fill();

    // Fine sumi/pigment micro-droplets around the bloom
    for (let i = 0; i < 5; i++) {
      const dist = radius * (0.75 + Math.random() * 0.65);
      const ang = Math.random() * Math.PI * 2;
      const sr = 1.5 + Math.random() * 4.5;
      ctx.fillStyle = this.hexToRgba(color, alpha * 1.1);
      ctx.beginPath();
      ctx.arc(Math.cos(ang) * dist, Math.sin(ang) * dist * 0.7, sr, 0, Math.PI * 2);
      ctx.fill();
    }

    ctx.restore();
  }

  // Stamp a bold dry-brush sumi-e slash mark directly onto the floor/backdrop scroll
  public stampDryBrushSlash(
    x1: number,
    y1: number,
    x2: number,
    y2: number,
    thickness: number,
    color: string,
    alpha: number = 0.28
  ): void {
    const ctx = this.stainCtx;
    ctx.save();
    ctx.strokeStyle = this.hexToRgba(color, alpha);
    ctx.lineCap = 'round';

    // Draw multiple parallel bristles to create "Kasure" (flying white dry brush texture)
    const bristles = 6;
    for (let b = 0; b < bristles; b++) {
      const offset = (b - bristles / 2) * (thickness / bristles);
      ctx.lineWidth = Math.max(1, (thickness / bristles) * (0.5 + Math.random() * 0.8));
      ctx.beginPath();
      ctx.moveTo(x1, y1 + offset);
      ctx.quadraticCurveTo(
        (x1 + x2) * 0.5 + (Math.random() - 0.5) * 18,
        (y1 + y2) * 0.5 + offset - 12,
        x2,
        y2 + offset * 0.4
      );
      ctx.stroke();
    }
    ctx.restore();
  }

  public addSlashRibbon(
    x: number,
    y: number,
    facing: 1 | -1,
    startAngle: number,
    endAngle: number,
    radius: number,
    primaryColor: string,
    accentColor: string,
    isHeavy: boolean = false,
    isSuper: boolean = false
  ): void {
    this.slashRibbons.push({
      x,
      y,
      facing,
      startAngle,
      endAngle,
      radius,
      primaryColor,
      accentColor,
      life: 0,
      maxLife: isSuper ? 26 : isHeavy ? 18 : 13,
      isHeavy,
      isSuper,
    });
  }

  public spawnInkBurst(
    x: number,
    y: number,
    count: number,
    color: string,
    secondaryColor: string,
    directionalVx: number = 0
  ): void {
    for (let i = 0; i < count; i++) {
      const angle = Math.random() * Math.PI * 2;
      const speed = 2 + Math.random() * 11;
      this.particles.push({
        x,
        y,
        vx: Math.cos(angle) * speed + directionalVx * (0.4 + Math.random() * 0.7),
        vy: Math.sin(angle) * speed - 2.5,
        radius: 3 + Math.random() * 9,
        color: Math.random() > 0.38 ? color : secondaryColor,
        alpha: 0.88,
        decay: 0.018 + Math.random() * 0.022,
        gravity: 0.34,
      });
    }
  }

  public spawnFloatingKanji(
    text: string,
    subtext: string | undefined,
    x: number,
    y: number,
    color: string = '#c92a2a'
  ): void {
    this.floatingTexts.push({
      text,
      subtext,
      x,
      y,
      vy: -1.4,
      scale: 0.4,
      alpha: 1.0,
      color,
      strokeColor: '#181512',
      life: 0,
      maxLife: 52,
    });
  }

  public renderBackground(ctx: CanvasRenderingContext2D, stage: StageId, time: number, superDarkness: number): void {
    // 1. Base Washi Paper Texture
    ctx.drawImage(this.paperCanvas, 0, 0);

    // 2. AI-Generated Japanese Watercolor Landscape Painting blended via multiply/darken onto the paper
    if (this.stageBgLoaded) {
      ctx.save();
      ctx.globalAlpha = 0.78;
      ctx.drawImage(this.stageBgImg, 0, 0, this.width, this.height);
      ctx.restore();
    }

    // 3. Stage-specific atmospheric watercolor color-wash & silhouettes
    ctx.save();
    if (stage === 'indigo_bamboo') {
      ctx.fillStyle = 'rgba(22, 50, 79, 0.22)';
      ctx.fillRect(0, 0, this.width, this.height);
      this.drawSumiBambooGroves(ctx, time);
    } else if (stage === 'golden_temple') {
      ctx.fillStyle = 'rgba(212, 130, 28, 0.16)';
      ctx.fillRect(0, 0, this.width, this.height);
    } else if (stage === 'snow_shrine') {
      ctx.fillStyle = 'rgba(180, 210, 240, 0.22)';
      ctx.fillRect(0, 0, this.width, this.height);
    }

    // Drifting Suibokuga Mist Layer across distant horizon
    const mistY = this.height * 0.62;
    const mistOffset = Math.sin(time * 0.0008) * 60;
    const mistGrad = ctx.createLinearGradient(0, mistY - 90, 0, mistY + 110);
    mistGrad.addColorStop(0, 'rgba(244, 236, 225, 0)');
    mistGrad.addColorStop(0.5, 'rgba(244, 236, 225, 0.52)');
    mistGrad.addColorStop(1, 'rgba(244, 236, 225, 0)');
    ctx.fillStyle = mistGrad;
    ctx.fillRect(mistOffset - 80, mistY - 90, this.width + 160, 200);
    ctx.restore();

    // 4. Persistent Washi Stain Layer (dried watercolor blooms & ink splatters from combat)
    ctx.save();
    ctx.drawImage(this.stainCanvas, 0, 0);
    ctx.restore();

    // 5. Traditional Dojo Floor Brush Line
    const floorY = 610;
    ctx.save();
    ctx.strokeStyle = 'rgba(24, 21, 18, 0.75)';
    ctx.lineWidth = 4;
    ctx.beginPath();
    ctx.moveTo(40, floorY);
    ctx.quadraticCurveTo(this.width * 0.5, floorY - 3, this.width - 40, floorY + 2);
    ctx.stroke();

    // Subtle reflection wash below the floor line
    const floorGrad = ctx.createLinearGradient(0, floorY, 0, this.height);
    floorGrad.addColorStop(0, 'rgba(28, 23, 19, 0.18)');
    floorGrad.addColorStop(1, 'rgba(28, 23, 19, 0.42)');
    ctx.fillStyle = floorGrad;
    ctx.fillRect(0, floorY, this.width, this.height - floorY);
    ctx.restore();

    // 6. If Super Art is active, dramatic sumi-e ink eclipse vignette
    if (superDarkness > 0.01) {
      ctx.save();
      ctx.fillStyle = `rgba(14, 11, 10, ${superDarkness * 0.72})`;
      ctx.fillRect(0, 0, this.width, this.height);
      ctx.restore();
    }
  }

  private drawSumiBambooGroves(ctx: CanvasRenderingContext2D, time: number): void {
    ctx.save();
    ctx.strokeStyle = 'rgba(20, 35, 45, 0.28)';
    const stalks = [95, 135, 165, 1120, 1165, 1205];
    stalks.forEach((bx, idx) => {
      const sway = Math.sin(time * 0.0015 + idx) * 8;
      ctx.lineWidth = 7 - (idx % 2) * 2;
      ctx.beginPath();
      ctx.moveTo(bx, 610);
      ctx.quadraticCurveTo(bx + sway * 0.5, 350, bx + sway, 60);
      ctx.stroke();
    });
    ctx.restore();
  }

  // Render an articulated Samurai Fighter in dynamic Sumi-e Brush & Watercolor Wash style
  public renderSamuraiFighter(
    ctx: CanvasRenderingContext2D,
    config: FighterConfig,
    x: number,
    y: number,
    facing: 1 | -1,
    state: string,
    stateFrame: number,
    animTick: number,
    healthRatio: number,
    isParrying: boolean,
    hitFlashFrames: number,
    activeAttackKey: string | null
  ): void {
    ctx.save();
    ctx.translate(x, y);
    ctx.scale(facing, 1);

    // Ground ink shadow beneath feet
    ctx.fillStyle = 'rgba(20, 16, 13, 0.36)';
    ctx.beginPath();
    ctx.ellipse(0, 0, config.bodyWidth * 0.72, 11, 0, 0, Math.PI * 2);
    ctx.fill();

    // Compute procedural posture & joint angles from state
    const breathe = Math.sin(animTick * 0.1) * 3.5;
    const isMoving = state === 'walk_fwd' || state === 'walk_back' || state === 'dash';
    const legStride = isMoving ? Math.sin(animTick * 0.36) * 24 : 8;
    const crouchOffset = state === 'crouch' ? 28 : 0;
    const hitLean = state === 'hitstun' ? -18 : state === 'blockstun' ? -9 : 0;

    let torsoLean = state === 'dash' ? 0.34 : state === 'walk_fwd' ? 0.14 : state === 'walk_back' ? -0.1 : 0.05;
    let swordAngle = -0.35 + Math.sin(animTick * 0.06) * 0.05;
    let armReachX = 22;
    let armReachY = -88 + crouchOffset + breathe;

    if (state === 'attack' && activeAttackKey) {
      const atk = config.attacks[activeAttackKey as keyof typeof config.attacks];
      const total = atk.startup + atk.active + atk.recovery;
      const p = Math.min(1, stateFrame / Math.max(1, total));
      if (stateFrame <= atk.startup) {
        // Wind-up coil
        const wp = stateFrame / Math.max(1, atk.startup);
        torsoLean = -0.22 * wp;
        swordAngle = atk.slashArcStart - 0.6 * wp;
        armReachX = 6 - 14 * wp;
      } else if (stateFrame <= atk.startup + atk.active) {
        // Full brush extension slash!
        const ap = (stateFrame - atk.startup) / Math.max(1, atk.active);
        torsoLean = 0.38;
        swordAngle = atk.slashArcStart + (atk.slashArcEnd - atk.slashArcStart) * ap;
        armReachX = 48;
        armReachY = -92 + crouchOffset;
      } else {
        // Zanshin follow-through recovery
        torsoLean = 0.25 * (1 - p);
        swordAngle = atk.slashArcEnd;
        armReachX = 34;
      }
    } else if (state === 'parry') {
      torsoLean = -0.08;
      swordAngle = -1.45; // Vertical guard blade in front of face
      armReachX = 28;
      armReachY = -102;
    } else if (state === 'blockstun') {
      torsoLean = -0.14;
      swordAngle = -1.25;
      armReachX = 24;
    } else if (state === 'hitstun') {
      torsoLean = -0.35;
      swordAngle = 0.65;
      armReachX = -8;
    } else if (state === 'ko') {
      ctx.rotate(-1.42);
      ctx.translate(0, -25);
    }

    const hipY = -58 + crouchOffset + breathe * 0.5;
    const shoulderY = -118 + crouchOffset + breathe;

    // 1. Back flowing watercolor scarf / haori aura ribbon
    this.drawFlowingWatercolorRibbon(
      ctx,
      -14,
      shoulderY + 8,
      animTick,
      config.accentWatercolor,
      config.secondaryWatercolor,
      isMoving || state === 'attack'
    );

    // 2. Watercolor Inner Wash Aura (wet pigment glow inside silhouette)
    const auraGrad = ctx.createRadialGradient(0, hipY - 20, 10, 0, hipY - 20, config.bodyHeight * 0.62);
    auraGrad.addColorStop(0, this.hexToRgba(config.accentWatercolor, 0.34));
    auraGrad.addColorStop(0.6, this.hexToRgba(config.secondaryWatercolor, 0.16));
    auraGrad.addColorStop(1, this.hexToRgba(config.accentWatercolor, 0));
    ctx.fillStyle = auraGrad;
    ctx.beginPath();
    ctx.arc(0, hipY - 20, config.bodyHeight * 0.62, 0, Math.PI * 2);
    ctx.fill();

    // 3. Hakama (Pleated Samurai Trousers) rendered with broad angled brush strokes
    ctx.save();
    ctx.translate(hitLean * 0.5, 0);

    // Back Leg Hakama
    this.drawCalligraphicLimb(
      ctx,
      -8,
      hipY,
      -16 - legStride,
      -4,
      26,
      16,
      config.primaryInk,
      config.robeColor
    );
    // Front Leg Hakama
    this.drawCalligraphicLimb(
      ctx,
      8,
      hipY,
      18 + legStride,
      -4,
      28,
      17,
      config.robeColor,
      config.accentWatercolor
    );

    // 4. Torso & Haori Coat
    ctx.save();
    ctx.translate(0, hipY);
    ctx.rotate(torsoLean);

    // Haori silhouette in sumi ink & watercolor wash
    ctx.fillStyle = hitFlashFrames > 0 ? '#fff5f5' : config.robeColor;
    ctx.strokeStyle = config.primaryInk;
    ctx.lineWidth = 4.5;
    ctx.beginPath();
    ctx.moveTo(-config.bodyWidth * 0.42, 6);
    ctx.quadraticCurveTo(-config.bodyWidth * 0.52, -32, -config.bodyWidth * 0.36, -64);
    ctx.lineTo(config.bodyWidth * 0.38, -64);
    ctx.quadraticCurveTo(config.bodyWidth * 0.5, -28, config.bodyWidth * 0.42, 6);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();

    // Obi (Sash) in accent watercolor
    ctx.fillStyle = config.accentWatercolor;
    ctx.fillRect(-config.bodyWidth * 0.4, -10, config.bodyWidth * 0.8, 12);

    // Chest diagonal kimono lapel brush strokes
    ctx.strokeStyle = config.accentWatercolor;
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.moveTo(-14, -62);
    ctx.lineTo(12, -10);
    ctx.moveTo(14, -62);
    ctx.lineTo(-6, -24);
    ctx.stroke();

    // 5. Head & Distinctive Samurai Headgear
    const headY = -78;
    // Neck & Face
    ctx.fillStyle = '#efe2cf';
    ctx.strokeStyle = config.primaryInk;
    ctx.lineWidth = 3.2;
    ctx.beginPath();
    ctx.arc(2, headY, 16, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();

    // Fierce glowing brush eye
    ctx.fillStyle = config.accentWatercolor;
    ctx.beginPath();
    ctx.moveTo(6, headY - 3);
    ctx.lineTo(16, headY - 6);
    ctx.lineTo(13, headY);
    ctx.closePath();
    ctx.fill();

    this.drawFighterHeadgear(ctx, config, headY, animTick);

    ctx.restore(); // end torso rotation

    // 6. Sword Arm & Weapon (Katana / Twin Kodachi / Kanabo / Frost Naginata)
    this.drawSamuraiWeaponAndArm(
      ctx,
      config,
      armReachX,
      armReachY,
      swordAngle,
      state === 'attack',
      isParrying
    );

    // 7. Mind's Eye Parry Golden Enso Circle (圓相)
    if (isParrying || state === 'parry') {
      ctx.save();
      ctx.strokeStyle = '#f59f00';
      ctx.lineWidth = 5;
      ctx.beginPath();
      ctx.arc(18, shoulderY + 12, 54, -0.4, Math.PI * 1.65);
      ctx.stroke();
      ctx.restore();
    }

    ctx.restore();
    ctx.restore();
  }

  private drawFlowingWatercolorRibbon(
    ctx: CanvasRenderingContext2D,
    startX: number,
    startY: number,
    tick: number,
    color1: string,
    color2: string,
    energetic: boolean
  ): void {
    ctx.save();
    const len = energetic ? 88 : 58;
    const wave1 = Math.sin(tick * 0.18) * 18;
    const wave2 = Math.cos(tick * 0.14) * 24;

    const grad = ctx.createLinearGradient(startX, startY, startX - len, startY + wave2);
    grad.addColorStop(0, this.hexToRgba(color1, 0.82));
    grad.addColorStop(0.6, this.hexToRgba(color2, 0.48));
    grad.addColorStop(1, this.hexToRgba(color2, 0));

    ctx.strokeStyle = grad;
    ctx.lineWidth = energetic ? 15 : 10;
    ctx.lineCap = 'round';
    ctx.beginPath();
    ctx.moveTo(startX, startY);
    ctx.bezierCurveTo(
      startX - len * 0.35,
      startY - 12 + wave1,
      startX - len * 0.7,
      startY + 8 + wave2,
      startX - len,
      startY - 4 + wave1 * 0.7
    );
    ctx.stroke();
    ctx.restore();
  }

  private drawCalligraphicLimb(
    ctx: CanvasRenderingContext2D,
    x1: number,
    y1: number,
    x2: number,
    y2: number,
    startWidth: number,
    endWidth: number,
    inkColor: string,
    washColor: string
  ): void {
    const angle = Math.atan2(y2 - y1, x2 - x1);
    const perp = angle + Math.PI / 2;

    ctx.fillStyle = washColor;
    ctx.strokeStyle = inkColor;
    ctx.lineWidth = 4;

    ctx.beginPath();
    ctx.moveTo(x1 + Math.cos(perp) * startWidth * 0.5, y1 + Math.sin(perp) * startWidth * 0.5);
    ctx.lineTo(x2 + Math.cos(perp) * endWidth * 0.5, y2 + Math.sin(perp) * endWidth * 0.5);
    ctx.lineTo(x2 - Math.cos(perp) * endWidth * 0.5, y2 - Math.sin(perp) * endWidth * 0.5);
    ctx.lineTo(x1 - Math.cos(perp) * startWidth * 0.5, y1 - Math.sin(perp) * startWidth * 0.5);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();
  }

  private drawFighterHeadgear(
    ctx: CanvasRenderingContext2D,
    config: FighterConfig,
    headY: number,
    tick: number
  ): void {
    if (config.hatType === 'sedge_ronin') {
      // Wild windswept sumi hair + iconic wide woven Sandogasa sedge hat
      ctx.fillStyle = config.primaryInk;
      ctx.beginPath();
      ctx.moveTo(-8, headY - 6);
      ctx.quadraticCurveTo(-36, headY - 18 + Math.sin(tick * 0.15) * 5, -46, headY + 4);
      ctx.quadraticCurveTo(-22, headY + 6, -6, headY + 4);
      ctx.fill();

      // Bamboo Sedge Hat
      ctx.fillStyle = '#c2a378';
      ctx.strokeStyle = config.primaryInk;
      ctx.lineWidth = 3.5;
      ctx.beginPath();
      ctx.moveTo(-42, headY - 8);
      ctx.quadraticCurveTo(2, headY - 36, 44, headY - 6);
      ctx.quadraticCurveTo(2, headY - 15, -42, headY - 8);
      ctx.fill();
      ctx.stroke();
    } else if (config.hatType === 'kitsune_mask') {
      // High shinobi ponytail + Kitsune fox mask tilted on side of head
      ctx.fillStyle = config.primaryInk;
      ctx.beginPath();
      ctx.moveTo(-10, headY - 12);
      ctx.quadraticCurveTo(-38, headY - 34 + Math.cos(tick * 0.2) * 6, -48, headY - 8);
      ctx.lineTo(-12, headY - 4);
      ctx.fill();

      // White & Crimson Kitsune Mask
      ctx.fillStyle = '#fcf8f2';
      ctx.strokeStyle = config.accentWatercolor;
      ctx.lineWidth = 2.5;
      ctx.beginPath();
      ctx.ellipse(6, headY - 12, 13, 9, -0.3, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();
      // Fox ears
      ctx.beginPath();
      ctx.moveTo(0, headY - 18);
      ctx.lineTo(4, headY - 30);
      ctx.lineTo(10, headY - 18);
      ctx.fill();
      ctx.stroke();
    } else if (config.hatType === 'monk_mane') {
      // Lion-like shock of wild warrior-monk hair + oversized prayer beads (Juzu) around neck
      ctx.fillStyle = '#2b241f';
      ctx.beginPath();
      ctx.arc(-4, headY - 4, 24, Math.PI * 0.5, Math.PI * 1.85);
      ctx.fill();

      // Giant Amber Juzu Prayer Beads around collar
      ctx.fillStyle = config.accentWatercolor;
      ctx.strokeStyle = config.primaryInk;
      ctx.lineWidth = 2;
      for (let i = -3; i <= 3; i++) {
        ctx.beginPath();
        ctx.arc(i * 7, headY + 18 + Math.abs(i) * 1.5, 4.5, 0, Math.PI * 2);
        ctx.fill();
        ctx.stroke();
      }
    } else if (config.hatType === 'snow_hairpins') {
      // Long flowing silver-white sumi hair + golden crane hairpins
      ctx.fillStyle = '#e9f0f7';
      ctx.strokeStyle = config.primaryInk;
      ctx.lineWidth = 2.5;
      ctx.beginPath();
      ctx.moveTo(-4, headY - 14);
      ctx.quadraticCurveTo(-36, headY - 4, -44, headY + 34 + Math.sin(tick * 0.12) * 5);
      ctx.quadraticCurveTo(-18, headY + 26, -6, headY + 6);
      ctx.fill();
      ctx.stroke();

      // Kanzashi Hairpin
      ctx.strokeStyle = '#fcc419';
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.moveTo(-12, headY - 18);
      ctx.lineTo(14, headY - 6);
      ctx.stroke();
    }
  }

  private drawSamuraiWeaponAndArm(
    ctx: CanvasRenderingContext2D,
    config: FighterConfig,
    armX: number,
    armY: number,
    swordAngle: number,
    isAttacking: boolean,
    isParrying: boolean
  ): void {
    ctx.save();
    ctx.translate(armX, armY);

    // Wide kimono sleeve
    ctx.fillStyle = config.robeColor;
    ctx.strokeStyle = config.primaryInk;
    ctx.lineWidth = 3.5;
    ctx.beginPath();
    ctx.arc(0, 0, 14, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();

    ctx.rotate(swordAngle);

    // Hilt (Tsuka) & Guard (Tsuba)
    ctx.fillStyle = config.primaryInk;
    ctx.fillRect(-10, -4, 24, 8);
    ctx.fillStyle = '#d49b27';
    ctx.fillRect(12, -10, 4, 20);

    // Weapon Blade by Archetype
    const bladeLen =
      config.weaponType === 'frost_naginata'
        ? 128
        : config.weaponType === 'kanabo_nodachi'
          ? 118
          : config.weaponType === 'twin_kodachi'
            ? 78
            : 102;

    if (config.weaponType === 'kanabo_nodachi') {
      // Heavy iron-studded Kanabo / Nodachi
      ctx.fillStyle = '#2d2926';
      ctx.strokeStyle = isAttacking ? config.bladeGlow : config.primaryInk;
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.moveTo(16, -5);
      ctx.lineTo(16 + bladeLen, -11);
      ctx.lineTo(16 + bladeLen + 8, 0);
      ctx.lineTo(16 + bladeLen, 11);
      ctx.lineTo(16, 5);
      ctx.closePath();
      ctx.fill();
      ctx.stroke();
    } else {
      // Curved Japanese Katana / Naginata / Kodachi blade with gleaming hamon temper line
      ctx.fillStyle = isAttacking || isParrying ? '#ffffff' : '#e6ecf2';
      ctx.strokeStyle = isAttacking ? config.accentWatercolor : config.primaryInk;
      ctx.lineWidth = isAttacking ? 3.5 : 2.5;

      ctx.beginPath();
      ctx.moveTo(16, -3);
      ctx.quadraticCurveTo(16 + bladeLen * 0.6, -9, 16 + bladeLen, -2);
      ctx.lineTo(16 + bladeLen - 6, 4);
      ctx.quadraticCurveTo(16 + bladeLen * 0.5, -1, 16, 3);
      ctx.closePath();
      ctx.fill();
      ctx.stroke();
    }

    ctx.restore();
  }

  public updateAndRenderEffects(
    ctx: CanvasRenderingContext2D,
    projectiles: WatercolorProjectile[]
  ): void {
    // 1. Render Watercolor Projectiles (Kamaitachi wind crescents, Onibi fireflies, Raijin waves, Frost petals)
    for (const proj of projectiles) {
      if (!proj.active) continue;
      ctx.save();
      ctx.translate(proj.x, proj.y);

      const grad = ctx.createRadialGradient(0, 0, 4, 0, 0, proj.radius * 1.35);
      grad.addColorStop(0, '#ffffff');
      grad.addColorStop(0.45, proj.primaryColor);
      grad.addColorStop(0.85, this.hexToRgba(proj.secondaryColor, 0.7));
      grad.addColorStop(1, this.hexToRgba(proj.secondaryColor, 0));

      ctx.fillStyle = grad;
      ctx.beginPath();
      ctx.arc(0, 0, proj.radius * 1.35, 0, Math.PI * 2);
      ctx.fill();

      // Calligraphic Crescent Core & Kanji inside projectile
      ctx.strokeStyle = '#181512';
      ctx.lineWidth = 4;
      ctx.beginPath();
      ctx.arc(0, 0, proj.radius * 0.78, -1.1, 1.1);
      ctx.stroke();

      ctx.fillStyle = '#fff9f0';
      ctx.font = '900 22px "Yuji Syuku", "Noto Serif JP", serif';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(proj.kanji, 0, 0);

      ctx.restore();
    }

    // 2. Render & Update Expressive Sumi-e Slash Arcs (with Kasure dry-brush bristles & watercolor edge bleed)
    for (let i = this.slashRibbons.length - 1; i >= 0; i--) {
      const s = this.slashRibbons[i];
      s.life++;
      const progress = s.life / s.maxLife;
      const alpha = Math.max(0, 1 - Math.pow(progress, 1.4));

      ctx.save();
      ctx.translate(s.x, s.y);
      ctx.scale(s.facing, 1);

      // Outer watercolor glow arc
      ctx.strokeStyle = this.hexToRgba(s.accentColor, alpha * 0.65);
      ctx.lineWidth = (s.isSuper ? 44 : s.isHeavy ? 30 : 20) * (1 - progress * 0.4);
      ctx.lineCap = 'round';
      ctx.beginPath();
      ctx.arc(0, 0, s.radius, s.startAngle, s.endAngle, s.endAngle < s.startAngle);
      ctx.stroke();

      // Core Sumi-e Black Brush Stroke + Flying White bristle streaks
      const bristleCount = s.isSuper ? 7 : 5;
      for (let b = 0; b < bristleCount; b++) {
        const rOffset = (b - bristleCount / 2) * 4.5;
        ctx.strokeStyle =
          b === Math.floor(bristleCount / 2)
            ? `rgba(255, 250, 245, ${alpha * 0.95})`
            : this.hexToRgba(s.primaryColor, alpha * 0.92);
        ctx.lineWidth = b === Math.floor(bristleCount / 2) ? 4 : 3.5;
        ctx.beginPath();
        ctx.arc(
          0,
          0,
          Math.max(12, s.radius + rOffset),
          s.startAngle,
          s.endAngle,
          s.endAngle < s.startAngle
        );
        ctx.stroke();
      }

      ctx.restore();

      if (s.life >= s.maxLife) {
        this.slashRibbons.splice(i, 1);
      }
    }

    // 3. Update & Render Ink Droplets & Watercolor Splatter Particles
    for (let i = this.particles.length - 1; i >= 0; i--) {
      const p = this.particles[i];
      p.x += p.vx;
      p.y += p.vy;
      p.vy += p.gravity;
      p.alpha -= p.decay;

      // When an ink droplet hits the dojo floor, stamp it permanently into the Washi stain canvas!
      if (p.y >= 608 && p.vy > 0) {
        this.stampWatercolorBloom(p.x, 606 + (Math.random() - 0.5) * 14, p.radius * 2.2, p.color, 0.22);
        p.alpha = 0;
      }

      if (p.alpha <= 0) {
        this.particles.splice(i, 1);
        continue;
      }

      ctx.save();
      ctx.fillStyle = this.hexToRgba(p.color, p.alpha);
      ctx.beginPath();
      ctx.arc(p.x, p.y, p.radius, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
    }

    // 4. Ambient Drifting Sakura Petals & Sumi Ash
    for (const petal of this.ambientPetals) {
      petal.x += petal.vx;
      petal.y += petal.vy;
      petal.angle = (petal.angle || 0) + (petal.spin || 0.02);

      if (petal.x < -20) petal.x = this.width + 20;
      if (petal.y > this.height + 20) {
        petal.y = -20;
        petal.x = Math.random() * this.width;
      }

      ctx.save();
      ctx.translate(petal.x, petal.y);
      ctx.rotate(petal.angle);
      ctx.fillStyle = this.hexToRgba(petal.color, petal.alpha);
      ctx.beginPath();
      ctx.ellipse(0, 0, petal.radius, petal.radius * 0.55, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
    }

    // 5. Calligraphic Floating Kanji Impact Stamps (斬, 破, 心眼, 一閃)
    for (let i = this.floatingTexts.length - 1; i >= 0; i--) {
      const ft = this.floatingTexts[i];
      ft.life++;
      ft.y += ft.vy;
      ft.scale = Math.min(1.15, ft.scale + 0.14);
      const lifeRatio = ft.life / ft.maxLife;
      ft.alpha = lifeRatio > 0.65 ? Math.max(0, 1 - (lifeRatio - 0.65) / 0.35) : 1;

      ctx.save();
      ctx.translate(ft.x, ft.y);
      ctx.scale(ft.scale, ft.scale);
      ctx.globalAlpha = ft.alpha;

      // Red hanko / brush splash behind kanji
      ctx.fillStyle = this.hexToRgba(ft.color, 0.22);
      ctx.beginPath();
      ctx.arc(0, 0, 34, 0, Math.PI * 2);
      ctx.fill();

      ctx.font = '900 44px "Yuji Syuku", "Noto Serif JP", serif';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.lineWidth = 6;
      ctx.strokeStyle = '#f8f1e5';
      ctx.strokeText(ft.text, 0, 0);
      ctx.fillStyle = ft.color;
      ctx.fillText(ft.text, 0, 0);

      if (ft.subtext) {
        ctx.font = '900 13px "Noto Serif JP", serif';
        ctx.fillStyle = '#181512';
        ctx.fillText(ft.subtext, 0, 32);
      }

      ctx.restore();

      if (ft.life >= ft.maxLife) {
        this.floatingTexts.splice(i, 1);
      }
    }
  }

  public hexToRgba(hex: string, alpha: number): string {
    const clean = hex.replace('#', '');
    const num = parseInt(clean, 16);
    const r = (num >> 16) & 255;
    const g = (num >> 8) & 255;
    const b = num & 255;
    return `rgba(${r}, ${g}, ${b}, ${Math.max(0, Math.min(1, alpha))})`;
  }
}
