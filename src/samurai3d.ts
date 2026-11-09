import * as THREE from 'three';
import { FighterConfig, FighterId } from './fighters';

// Custom GLSL Vertex & Fragment Shaders for Authentic Suibokuga / Sumi-e Watercolor 3D Rendering
// Inspired by Street Fighter IV Ink Trailers & Okami:
// - Quantized wet watercolor pigment wash bands
// - Darkened pigment edge pooling (wet-on-wet watercolor ring effect)
// - Fresnel Sumi-e ink rim bleed
// - Procedural 3D turbulence brush-stroke modulation

const WATERCOLOR_VERTEX_SHADER = /* glsl */ `
  varying vec3 vNormal;
  varying vec3 vViewPosition;
  varying vec3 vWorldPosition;
  varying vec2 vUv;

  void main() {
    vUv = uv;
    vNormal = normalize(normalMatrix * normal);
    vec4 mvPosition = modelViewMatrix * vec4(position, 1.0);
    vViewPosition = -mvPosition.xyz;
    vec4 worldPos = modelMatrix * vec4(position, 1.0);
    vWorldPosition = worldPos.xyz;
    gl_Position = projectionMatrix * mvPosition;
  }
`;

const WATERCOLOR_FRAGMENT_SHADER = /* glsl */ `
  uniform vec3 uBaseColor;
  uniform vec3 uShadeColor;
  uniform vec3 uInkColor;
  uniform vec3 uAccentColor;
  uniform float uHitFlash;
  uniform float uPaperGrain;

  varying vec3 vNormal;
  varying vec3 vViewPosition;
  varying vec3 vWorldPosition;
  varying vec2 vUv;

  // Simple procedural hash noise for brush bristles & paper granulation
  float hash(vec2 p) {
    return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453123);
  }

  float noise(vec2 p) {
    vec2 i = floor(p);
    vec2 f = fract(p);
    f = f * f * (3.0 - 2.0 * f);
    float a = hash(i);
    float b = hash(i + vec2(1.0, 0.0));
    float c = hash(i + vec2(0.0, 1.0));
    float d = hash(i + vec2(1.0, 1.0));
    return mix(mix(a, b, f.x), mix(c, d, f.x), f.y);
  }

  void main() {
    vec3 normal = normalize(vNormal);
    vec3 viewDir = normalize(vViewPosition);
    vec3 lightDir = normalize(vec3(0.45, 0.75, 0.65));

    // Brush grain noise in screen/world space
    float brushNoise = (noise(vWorldPosition.xy * 6.5) - 0.5) * 0.22;

    float ndotl = dot(normal, lightDir) + brushNoise;

    // 3-band Watercolor Wash quantization with soft wet feathered transitions
    vec3 washColor;
    if (ndotl > 0.35) {
      // Sunlit warm Washi highlight bleed
      washColor = mix(uBaseColor, vec3(0.98, 0.95, 0.89), 0.32);
    } else if (ndotl > -0.08) {
      // Mid-tone watercolor pigment
      washColor = uBaseColor;
    } else {
      // Deep Suibokuga indigo/charcoal shadow wash
      washColor = mix(uShadeColor, uInkColor, 0.45);
    }

    // Wet watercolor pigment pooling near terminator boundary
    float edgePool = smoothstep(-0.18, -0.04, ndotl) * (1.0 - smoothstep(-0.04, 0.12, ndotl));
    washColor = mix(washColor, uAccentColor * 0.65, edgePool * 0.45);

    // Sumi-e Calligraphic Ink Rim (Fresnel silhouette edge)
    float fresnel = 1.0 - max(0.0, dot(normal, viewDir));
    float inkRim = smoothstep(0.58, 0.78, fresnel + brushNoise * 0.5);
    vec3 finalColor = mix(washColor, uInkColor, inkRim * 0.92);

    // Hit flash override
    if (uHitFlash > 0.0) {
      finalColor = mix(finalColor, vec3(1.0, 0.96, 0.92), uHitFlash * 0.85);
    }

    gl_FragColor = vec4(finalColor, 1.0);
  }
`;

export interface RigJoints {
  root: THREE.Group;
  pelvis: THREE.Group;
  torso: THREE.Group;
  neck: THREE.Group;
  head: THREE.Group;
  hairRibbon: THREE.Group[];
  shoulderL: THREE.Group;
  elbowL: THREE.Group;
  handL: THREE.Group;
  shoulderR: THREE.Group;
  elbowR: THREE.Group;
  handR: THREE.Group;
  weaponPivot: THREE.Group;
  weaponTipMarker: THREE.Object3D;
  weaponBaseMarker: THREE.Object3D;
  hipL: THREE.Group;
  kneeL: THREE.Group;
  ankleL: THREE.Group;
  hipR: THREE.Group;
  kneeR: THREE.Group;
  ankleR: THREE.Group;
  materials: THREE.ShaderMaterial[];
}

export interface Fighter3DPoseInput {
  x: number;
  y: number;
  vx: number;
  vy: number;
  facing: 1 | -1;
  isGrounded: boolean;
  state: string;
  stateFrame: number;
  animTick: number;
  hitFlashFrames: number;
  isParrying: boolean;
  activeAttackKey: string | null;
  attackStartup: number;
  attackActive: number;
  attackRecovery: number;
}

export class Samurai3DWatercolorEngine {
  public width: number;
  public height: number;
  public renderer: THREE.WebGLRenderer;
  public scene: THREE.Scene;
  public camera: THREE.PerspectiveCamera;
  private rigs: Map<string, RigJoints> = new Map();

  // Dynamic 3D Sword Ribbon Trail Buffers per player
  private swordTrailHistory: [Array<{ tip: THREE.Vector3; base: THREE.Vector3 }>, Array<{ tip: THREE.Vector3; base: THREE.Vector3 }>] = [
    [],
    [],
  ];
  private swordTrailMeshes: [THREE.Mesh, THREE.Mesh];

  constructor(width: number, height: number) {
    this.width = width;
    this.height = height;

    this.renderer = new THREE.WebGLRenderer({
      alpha: true,
      antialias: true,
      powerPreference: 'high-performance',
    });
    this.renderer.setSize(width, height);
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));

    this.scene = new THREE.Scene();

    // 2.5D Fighting Game Camera (narrow FOV for classic Street Fighter IV / Guilty Gear perspective with minimal edge distortion)
    this.camera = new THREE.PerspectiveCamera(26, width / height, 0.1, 100);
    this.camera.position.set(0, 1.55, 11.8);
    this.camera.lookAt(0, 1.35, 0);

    // Initialize 3D Sumi-e Sword Ribbon Trail Meshes for P1 & P2
    this.swordTrailMeshes = [
      this.createSwordTrailMesh('#c92a2a'),
      this.createSwordTrailMesh('#15aabf'),
    ];
    this.scene.add(this.swordTrailMeshes[0]);
    this.scene.add(this.swordTrailMeshes[1]);
  }

  private createSwordTrailMesh(colorHex: string): THREE.Mesh {
    const maxSegments = 10;
    const geom = new THREE.BufferGeometry();
    const positions = new Float32Array(maxSegments * 2 * 3);
    const alphas = new Float32Array(maxSegments * 2);
    const indices: number[] = [];

    for (let i = 0; i < maxSegments - 1; i++) {
      const a = i * 2;
      const b = i * 2 + 1;
      const c = (i + 1) * 2;
      const d = (i + 1) * 2 + 1;
      indices.push(a, b, c, b, d, c);
    }

    geom.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    geom.setAttribute('alpha', new THREE.BufferAttribute(alphas, 1));
    geom.setIndex(indices);

    const mat = new THREE.ShaderMaterial({
      transparent: true,
      depthWrite: false,
      side: THREE.DoubleSide,
      uniforms: {
        uColor: { value: new THREE.Color(colorHex) },
        uInk: { value: new THREE.Color('#181512') },
      },
      vertexShader: /* glsl */ `
        attribute float alpha;
        varying float vAlpha;
        void main() {
          vAlpha = alpha;
          gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
        }
      `,
      fragmentShader: /* glsl */ `
        uniform vec3 uColor;
        uniform vec3 uInk;
        varying float vAlpha;
        void main() {
          if (vAlpha <= 0.01) discard;
          vec3 col = mix(uInk, uColor, vAlpha);
          gl_FragColor = vec4(col, vAlpha * 0.82);
        }
      `,
    });

    const mesh = new THREE.Mesh(geom, mat);
    mesh.frustumCulled = false;
    return mesh;
  }

  private makeWatercolorMaterial(
    baseHex: string,
    shadeHex: string,
    accentHex: string,
    inkHex: string = '#14110f'
  ): THREE.ShaderMaterial {
    return new THREE.ShaderMaterial({
      uniforms: {
        uBaseColor: { value: new THREE.Color(baseHex) },
        uShadeColor: { value: new THREE.Color(shadeHex) },
        uInkColor: { value: new THREE.Color(inkHex) },
        uAccentColor: { value: new THREE.Color(accentHex) },
        uHitFlash: { value: 0.0 },
        uPaperGrain: { value: 1.0 },
      },
      vertexShader: WATERCOLOR_VERTEX_SHADER,
      fragmentShader: WATERCOLOR_FRAGMENT_SHADER,
    });
  }

  // Adds a mesh together with an inverted-hull black Sumi-e calligraphy ink outline mesh
  private addOutlinedPart(
    parent: THREE.Object3D,
    geometry: THREE.BufferGeometry,
    material: THREE.ShaderMaterial,
    outlineThickness: number = 0.022,
    pos: [number, number, number] = [0, 0, 0],
    rot: [number, number, number] = [0, 0, 0],
    scale: [number, number, number] = [1, 1, 1]
  ): THREE.Mesh {
    const group = new THREE.Group();
    group.position.set(pos[0], pos[1], pos[2]);
    group.rotation.set(rot[0], rot[1], rot[2]);
    group.scale.set(scale[0], scale[1], scale[2]);

    const mesh = new THREE.Mesh(geometry, material);
    group.add(mesh);

    // Inverted Hull Sumi-e Brush Outline
    const outlineMat = new THREE.MeshBasicMaterial({
      color: 0x14110f,
      side: THREE.BackSide,
    });
    const outlineMesh = new THREE.Mesh(geometry, outlineMat);
    outlineMesh.scale.setScalar(1 + outlineThickness * 5.2);
    group.add(outlineMesh);

    parent.add(group);
    return mesh;
  }

  // Construct a detailed 3D Articulated Samurai Rig tailored to each character's proportions, clothing, headgear, and weapon
  public getOrCreateRig(slotKey: string, config: FighterConfig): RigJoints {
    const fullKey = `${slotKey}_${config.id}`;
    if (this.rigs.has(fullKey)) {
      return this.rigs.get(fullKey)!;
    }

    const materials: THREE.ShaderMaterial[] = [];
    const registerMat = (m: THREE.ShaderMaterial) => {
      materials.push(m);
      return m;
    };

    const skinMat = registerMat(
      this.makeWatercolorMaterial('#f3dec7', '#c99e7a', config.accentWatercolor)
    );
    const robeMat = registerMat(
      this.makeWatercolorMaterial(config.robeColor, '#141210', config.accentWatercolor)
    );
    const accentMat = registerMat(
      this.makeWatercolorMaterial(
        config.accentWatercolor,
        config.secondaryWatercolor,
        '#ffffff'
      )
    );
    const darkInkMat = registerMat(
      this.makeWatercolorMaterial('#26221e', '#0d0b0a', config.accentWatercolor)
    );
    const strawGoldMat = registerMat(
      this.makeWatercolorMaterial('#d8b47c', '#8c683a', config.accentWatercolor)
    );
    const steelBladeMat = registerMat(
      this.makeWatercolorMaterial('#f2f6fa', '#748ffc', config.bladeGlow)
    );

    const root = new THREE.Group();
    const isHeavyMonk = config.id === 'raidenbo';
    const isSlimNinja = config.id === 'hotaru';
    const bodyScale = isHeavyMonk ? 1.18 : isSlimNinja ? 0.93 : 1.0;
    root.scale.setScalar(bodyScale);

    // 1. PELVIS & OBI WAIST
    const pelvis = new THREE.Group();
    pelvis.position.set(0, 1.02, 0);
    root.add(pelvis);

    // Pleated Hakama Hip Skirt
    const hipGeom = new THREE.CylinderGeometry(0.22 * (isHeavyMonk ? 1.2 : 1), 0.31, 0.32, 10);
    this.addOutlinedPart(pelvis, hipGeom, robeMat, 0.024, [0, -0.04, 0]);

    // Obi Sash Belt + Knot
    const obiGeom = new THREE.CylinderGeometry(0.235 * (isHeavyMonk ? 1.2 : 1), 0.24, 0.13, 12);
    this.addOutlinedPart(pelvis, obiGeom, accentMat, 0.02, [0, 0.08, 0]);

    // 2. TORSO & HAORI KIMONO CHEST
    const torso = new THREE.Group();
    torso.position.set(0, 0.12, 0);
    pelvis.add(torso);

    const chestW = isHeavyMonk ? 0.34 : isSlimNinja ? 0.21 : 0.26;
    const torsoGeom = new THREE.CylinderGeometry(chestW, chestW * 0.82, 0.56, 12);
    this.addOutlinedPart(
      torso,
      torsoGeom,
      isHeavyMonk ? skinMat : robeMat,
      0.025,
      [0, 0.28, 0],
      [0, 0, 0],
      [1, 1, 0.72]
    );

    // Crossed Kimono Lapels / Monk Sash across chest
    const lapelGeom = new THREE.BoxGeometry(0.12, 0.52, 0.38);
    this.addOutlinedPart(torso, lapelGeom, accentMat, 0.018, [0.04, 0.28, 0], [0, 0, 0.25]);

    // 3. NECK, HEAD & DISTINCTIVE HEADGEAR
    const neck = new THREE.Group();
    neck.position.set(0, 0.58, 0);
    torso.add(neck);

    const head = new THREE.Group();
    head.position.set(0, 0.08, 0);
    neck.add(head);

    // Sculpted Head
    const headGeom = new THREE.SphereGeometry(0.17, 14, 12);
    this.addOutlinedPart(head, headGeom, skinMat, 0.024, [0, 0.12, 0], [0, 0, 0], [0.95, 1.12, 0.95]);

    // Articulated Multi-Link Hair / Scarf Physics Chain trailing behind head
    const hairRibbon: THREE.Group[] = [];
    let hairParent: THREE.Object3D = head;
    const hairColorMat = config.id === 'yuki' ? steelBladeMat : darkInkMat;
    for (let i = 0; i < 4; i++) {
      const hLink = new THREE.Group();
      hLink.position.set(i === 0 ? -0.12 : -0.18, i === 0 ? 0.18 : 0, 0);
      const hGeom = new THREE.ConeGeometry(0.11 - i * 0.018, 0.26, 8);
      this.addOutlinedPart(
        hLink,
        hGeom,
        hairColorMat,
        0.02,
        [-0.09, 0, 0],
        [0, 0, Math.PI * 0.5]
      );
      hairParent.add(hLink);
      hairRibbon.push(hLink);
      hairParent = hLink;
    }

    // Character-Specific Iconic Accessories
    if (config.hatType === 'sedge_ronin') {
      // Wide Woven Sandogasa Sedge Hat slung across upper back + wild ronin hair spikes
      const hatGeom = new THREE.ConeGeometry(0.48, 0.22, 16);
      this.addOutlinedPart(
        torso,
        hatGeom,
        strawGoldMat,
        0.025,
        [-0.22, 0.42, -0.08],
        [0.15, 0.1, 1.18]
      );
    } else if (config.hatType === 'kitsune_mask') {
      // White & Crimson Kitsune Fox Mask tilted on the side of Hotaru's head
      const maskMat = registerMat(
        this.makeWatercolorMaterial('#fcf8f2', '#e8d8c8', '#c92a2a')
      );
      const maskGeom = new THREE.ConeGeometry(0.14, 0.24, 8);
      this.addOutlinedPart(head, maskGeom, maskMat, 0.02, [0.06, 0.22, 0.14], [0.4, 0.3, -0.6]);
    } else if (config.hatType === 'monk_mane') {
      // Giant Amber Juzu Prayer Beads Necklace around Raidenbo's muscular shoulders
      const beadGeom = new THREE.SphereGeometry(0.068, 10, 10);
      for (let b = 0; b < 9; b++) {
        const ang = (b / 9) * Math.PI * 2;
        this.addOutlinedPart(
          torso,
          beadGeom,
          accentMat,
          0.02,
          [Math.cos(ang) * 0.24, 0.52 - Math.sin(ang) * 0.08, Math.sin(ang) * 0.22]
        );
      }
    } else if (config.hatType === 'snow_hairpins') {
      // Golden Kanzashi Hairpins & Noble Bun on Shirayuki
      const bunGeom = new THREE.SphereGeometry(0.11, 10, 10);
      this.addOutlinedPart(head, bunGeom, steelBladeMat, 0.02, [-0.08, 0.28, 0]);
      const pinGeom = new THREE.CylinderGeometry(0.012, 0.012, 0.46, 6);
      this.addOutlinedPart(head, pinGeom, strawGoldMat, 0.015, [-0.08, 0.28, 0], [0.3, 0, 0.6]);
    }

    // 4. ARMS (Left = Rear / Off-hand, Right = Lead / Sword-hand)
    const buildArm = (isRight: boolean) => {
      const zSign = isRight ? 1 : -1;
      const shoulder = new THREE.Group();
      shoulder.position.set(0, 0.5, zSign * (chestW + 0.05));
      torso.add(shoulder);

      // Wide Haori Shoulder Sleeve
      const sleeveGeom = new THREE.ConeGeometry(0.16, 0.36, 9);
      this.addOutlinedPart(
        shoulder,
        sleeveGeom,
        isHeavyMonk && isRight ? skinMat : robeMat,
        0.022,
        [0, -0.15, 0],
        [Math.PI, 0, 0]
      );

      const elbow = new THREE.Group();
      elbow.position.set(0, -0.3, 0);
      shoulder.add(elbow);

      // Forearm & Gauntlet (Kote)
      const forearmGeom = new THREE.CylinderGeometry(0.075, 0.06, 0.3, 8);
      this.addOutlinedPart(elbow, forearmGeom, darkInkMat, 0.02, [0, -0.14, 0]);

      const hand = new THREE.Group();
      hand.position.set(0, -0.28, 0);
      elbow.add(hand);

      const fistGeom = new THREE.SphereGeometry(0.068, 8, 8);
      this.addOutlinedPart(hand, fistGeom, skinMat, 0.02);

      return { shoulder, elbow, hand };
    };

    const leftArm = buildArm(false);
    const rightArm = buildArm(true);

    // 5. WEAPON RIG ATTACHED TO SWORD HAND (Katana / Twin Kodachi / Kanabo / Frost Naginata)
    const weaponPivot = new THREE.Group();
    rightArm.hand.add(weaponPivot);

    const weaponBaseMarker = new THREE.Object3D();
    const weaponTipMarker = new THREE.Object3D();
    weaponPivot.add(weaponBaseMarker);
    weaponPivot.add(weaponTipMarker);

    if (config.weaponType === 'kanabo_nodachi') {
      // Massive Spiked Iron Kanabo War Club
      const handleGeom = new THREE.CylinderGeometry(0.032, 0.035, 0.45, 8);
      this.addOutlinedPart(weaponPivot, handleGeom, strawGoldMat, 0.02, [0.15, 0, 0], [0, 0, Math.PI * 0.5]);
      const clubGeom = new THREE.CylinderGeometry(0.055, 0.11, 1.35, 8);
      this.addOutlinedPart(weaponPivot, clubGeom, darkInkMat, 0.028, [0.95, 0, 0], [0, 0, Math.PI * 0.5]);
      weaponBaseMarker.position.set(0.3, 0, 0);
      weaponTipMarker.position.set(1.65, 0, 0);
    } else if (config.weaponType === 'frost_naginata') {
      // Long Polearm Shaft + Curved Frost Naginata Blade
      const poleGeom = new THREE.CylinderGeometry(0.024, 0.026, 1.65, 8);
      this.addOutlinedPart(weaponPivot, poleGeom, strawGoldMat, 0.018, [0.45, 0, 0], [0, 0, Math.PI * 0.5]);
      const bladeGeom = new THREE.BoxGeometry(0.75, 0.075, 0.018);
      this.addOutlinedPart(weaponPivot, bladeGeom, steelBladeMat, 0.022, [1.62, 0.02, 0], [0, 0, 0.08]);
      weaponBaseMarker.position.set(1.15, 0, 0);
      weaponTipMarker.position.set(2.02, 0.05, 0);
    } else {
      // Curved Samurai Katana / Twin Kodachi
      const bladeLen = config.weaponType === 'twin_kodachi' ? 0.92 : 1.28;
      const hiltGeom = new THREE.CylinderGeometry(0.026, 0.026, 0.34, 8);
      this.addOutlinedPart(weaponPivot, hiltGeom, darkInkMat, 0.018, [-0.05, 0, 0], [0, 0, Math.PI * 0.5]);
      // Tsuba Guard
      const tsubaGeom = new THREE.CylinderGeometry(0.075, 0.075, 0.02, 10);
      this.addOutlinedPart(weaponPivot, tsubaGeom, strawGoldMat, 0.018, [0.12, 0, 0], [0, 0, Math.PI * 0.5]);
      // Gleaming Katana Blade
      const bladeGeom = new THREE.BoxGeometry(bladeLen, 0.052, 0.014);
      this.addOutlinedPart(
        weaponPivot,
        bladeGeom,
        steelBladeMat,
        0.022,
        [0.12 + bladeLen * 0.5, 0.015, 0],
        [0, 0, 0.04]
      );
      weaponBaseMarker.position.set(0.18, 0, 0);
      weaponTipMarker.position.set(0.12 + bladeLen, 0.03, 0);

      // If Hotaru (twin_kodachi), also attach second Reverse-Grip Kodachi to Left Hand!
      if (config.weaponType === 'twin_kodachi') {
        const offBlade = new THREE.BoxGeometry(0.82, 0.048, 0.014);
        this.addOutlinedPart(
          leftArm.hand,
          offBlade,
          steelBladeMat,
          0.02,
          [-0.42, -0.02, 0],
          [0, 0, -0.06]
        );
      }
    }

    // 6. LEGS (Pleated Wide Hakama Thighs + Shin Guards + Waraji Sandals)
    const buildLeg = (isRight: boolean) => {
      const zSign = isRight ? 1 : -1;
      const hip = new THREE.Group();
      hip.position.set(0, -0.08, zSign * 0.14);
      pelvis.add(hip);

      // Wide billowy Hakama upper leg
      const thighGeom = new THREE.CylinderGeometry(0.15, 0.21, 0.48, 9);
      this.addOutlinedPart(hip, thighGeom, robeMat, 0.025, [0, -0.22, 0]);

      const knee = new THREE.Group();
      knee.position.set(0, -0.44, 0);
      hip.add(knee);

      // Wrapped Shin (Kyahan)
      const shinGeom = new THREE.CylinderGeometry(0.11, 0.075, 0.44, 8);
      this.addOutlinedPart(knee, shinGeom, darkInkMat, 0.022, [0, -0.21, 0]);

      const ankle = new THREE.Group();
      ankle.position.set(0, -0.42, 0);
      knee.add(ankle);

      // Waraji Straw Sandal & Tabi Foot
      const footGeom = new THREE.BoxGeometry(0.26, 0.07, 0.12);
      this.addOutlinedPart(ankle, footGeom, strawGoldMat, 0.02, [0.06, -0.03, 0]);

      return { hip, knee, ankle };
    };

    const leftLeg = buildLeg(false);
    const rightLeg = buildLeg(true);

    const rig: RigJoints = {
      root,
      pelvis,
      torso,
      neck,
      head,
      hairRibbon,
      shoulderL: leftArm.shoulder,
      elbowL: leftArm.elbow,
      handL: leftArm.hand,
      shoulderR: rightArm.shoulder,
      elbowR: rightArm.elbow,
      handR: rightArm.hand,
      weaponPivot,
      weaponTipMarker,
      weaponBaseMarker,
      hipL: leftLeg.hip,
      kneeL: leftLeg.knee,
      ankleL: leftLeg.ankle,
      hipR: rightLeg.hip,
      kneeR: rightLeg.knee,
      ankleR: rightLeg.ankle,
      materials,
    };

    this.rigs.set(fullKey, rig);
    return rig;
  }

  // Smoothly interpolates Euler angles every frame so transitions between Idle, Run, Slash, and Hit are 100% fluid
  private dampAngle(current: number, target: number, factor: number = 0.32): number {
    return current + (target - current) * factor;
  }

  public updateAndPoseFighter(
    playerIndex: 0 | 1,
    config: FighterConfig,
    pose: Fighter3DPoseInput
  ): RigJoints {
    const rig = this.getOrCreateRig(`p${playerIndex}`, config);
    if (!rig.root.parent) {
      this.scene.add(rig.root);
    }

    // Convert 2D Canvas Coordinates (1280x720, ground Y = 610) to 3D Stage World Space
    const worldX = ((pose.x - 640) / 640) * 4.75;
    const worldY = ((610 - pose.y) / 610) * 4.6;
    const worldZ = playerIndex === 0 ? 0.12 : -0.12;

    rig.root.position.set(worldX, worldY, worldZ);

    // Slight 3/4 martial-arts camera turn so chest, shoulders, and both arms/legs read with full 3D depth!
    const targetYaw = pose.facing === 1 ? -0.32 : Math.PI + 0.32;
    rig.root.rotation.y = this.dampAngle(rig.root.rotation.y, targetYaw, 0.28);

    // Update Hit-Flash uniform across all shader materials
    const flashVal = pose.hitFlashFrames > 0 ? 1.0 : 0.0;
    for (const mat of rig.materials) {
      mat.uniforms.uHitFlash.value = flashVal;
    }

    // Target Joint Angles (Z = side-plane pitch: +Z leans/swings forward, -Z leans/swings backward)
    const t = pose.animTick;
    const breathe = Math.sin(t * 0.08);

    let pelvisY = 0.94 + breathe * 0.025;
    let pelvisRotZ = -0.06;
    let torsoRotZ = -0.08 + breathe * 0.025;
    let torsoRotY = 0.28; // Martial arts side-stance shoulder turn
    let headRotZ = 0.06;
    let headRotY = -0.22;

    // Legs (Hip Z, Knee Z, Ankle Z)
    let hipLZ = 0.34,
      kneeLZ = -0.45,
      ankleLZ = 0.12;
    let hipRZ = -0.32,
      kneeRZ = -0.28,
      ankleRZ = 0.25;

    // Arms & Sword (Shoulder Z/X/Y, Elbow Z, Weapon Z/X)
    let shRZ = 0.55 + breathe * 0.04,
      shRX = 0.18,
      shRY = -0.2,
      elRZ = 0.72,
      wpZ = -0.35,
      wpY = 0;
    let shLZ = 0.28 - breathe * 0.03,
      shLX = -0.22,
      elLZ = 0.85;

    // --- 1. WALKING / ADVANCING FOOTWORK ---
    if (pose.state === 'walk_fwd' || pose.state === 'walk_back') {
      const dir = pose.state === 'walk_fwd' ? 1 : -1;
      const cycle = t * 0.26 * dir;
      const s = Math.sin(cycle);
      const c = Math.cos(cycle);

      // Authentic Hip & Knee Articulation (knee bends when foot lifts back, extends as heel strikes forward)
      hipRZ = s * 0.68;
      kneeRZ = Math.min(-0.08, -0.48 + c * 0.42);
      ankleRZ = -hipRZ * 0.5 - kneeRZ * 0.4;

      hipLZ = -s * 0.68;
      kneeLZ = Math.min(-0.08, -0.48 - c * 0.42);
      ankleLZ = -hipLZ * 0.5 - kneeLZ * 0.4;

      // Pelvis bob at double step frequency & counter-rotating shoulders
      pelvisY = 0.92 + Math.abs(c) * 0.09;
      torsoRotZ = dir === 1 ? -0.22 : 0.08;
      torsoRotY = 0.22 + s * 0.24;

      // Natural arm counter-swing
      shLZ = 0.25 + s * 0.45;
      shRZ = 0.5 - s * 0.22;
    }

    // --- 2. EXPLOSIVE INK-STEP SPRINT DASH ---
    else if (pose.state === 'dash') {
      const cycle = t * 0.48;
      const s = Math.sin(cycle);
      pelvisY = 0.82;
      torsoRotZ = -0.52; // Deep forward ninja/samurai sprint lean
      headRotZ = 0.38;
      hipRZ = s * 0.95;
      kneeRZ = -0.65 + Math.cos(cycle) * 0.45;
      hipLZ = -s * 0.95;
      kneeLZ = -0.65 - Math.cos(cycle) * 0.45;
      shRZ = -0.45; // Sword trailed back for iai slash
      elRZ = 0.35;
      shLZ = 0.85;
    }

    // --- 3. CROUCH GUARD / LOW STANCE ---
    else if (pose.state === 'crouch') {
      pelvisY = 0.62;
      torsoRotZ = -0.28;
      hipRZ = 0.65;
      kneeRZ = -1.25;
      ankleRZ = 0.55;
      hipLZ = -0.25;
      kneeLZ = -1.15;
      ankleLZ = 0.65;
      shRZ = 0.75;
      elRZ = 0.95;
      wpZ = -0.55;
    }

    // --- 4. AIRBORNE JUMP ---
    else if (!pose.isGrounded && pose.state !== 'attack') {
      const rising = pose.vy < 0;
      pelvisY = 1.02;
      torsoRotZ = rising ? -0.18 : 0.12;
      hipRZ = rising ? 0.85 : 0.35;
      kneeRZ = rising ? -1.35 : -0.45;
      hipLZ = rising ? 0.45 : -0.25;
      kneeLZ = rising ? -1.15 : -0.65;
      shRZ = rising ? 1.15 : 0.45;
      shLZ = rising ? 0.95 : -0.35;
    }

    // --- 5. SWORD ATTACK CHOREOGRAPHY (Windup -> Full 180° Arc Slash -> Zanshin Recovery) ---
    if (pose.state === 'attack' && pose.activeAttackKey) {
      const key = pose.activeAttackKey;
      const f = pose.stateFrame;
      const sUp = Math.max(1, pose.attackStartup);
      const act = Math.max(1, pose.attackActive);
      const rec = Math.max(1, pose.attackRecovery);

      // Deep Lunging Martial Stance during all sword strikes
      pelvisY = 0.84;
      hipRZ = 0.68;
      kneeRZ = -0.78;
      hipLZ = -0.62;
      kneeLZ = -0.22;

      if (f <= sUp) {
        // Phase 1: Wind-up Coil
        const p = f / sUp;
        if (key === 'light') {
          torsoRotY = 0.55 * p;
          torsoRotZ = 0.1 * p;
          shRZ = 1.35 * p;
          elRZ = 0.95;
          wpZ = 0.25;
        } else if (key === 'medium' || key === 'special1') {
          // Wide horizontal cross-body coil
          torsoRotY = 0.78 * p;
          torsoRotZ = -0.12 * p;
          shRZ = 0.85;
          shRY = 0.85 * p;
          elRZ = 1.1;
          wpY = 0.65 * p;
        } else {
          // Heavy / Rising Dragon / Super: High overhead two-handed sword raise (Jōdan-no-Kamae)
          torsoRotZ = 0.24 * p;
          torsoRotY = 0.35 * p;
          shRZ = 2.45 * p;
          shLZ = 2.15 * p;
          elRZ = 0.45;
          wpZ = 0.35;
        }
      } else if (f <= sUp + act) {
        // Phase 2: Explosive Active Blade Swing!
        const p = (f - sUp) / act;
        const ease = 1 - Math.pow(1 - p, 2.2);

        if (key === 'light') {
          // Fast diagonal snap cut
          torsoRotY = 0.55 - 1.15 * ease;
          torsoRotZ = -0.28;
          shRZ = 1.35 - 1.55 * ease;
          elRZ = 0.15; // Full arm extension
          wpZ = -0.55 * ease;
        } else if (key === 'medium' || key === 'special1') {
          // Wide horizontal sweeping slash across torso
          torsoRotY = 0.78 - 1.55 * ease;
          torsoRotZ = -0.34;
          shRZ = 0.72 - 0.5 * ease;
          shRY = 0.85 - 1.75 * ease;
          elRZ = 0.12;
          wpZ = -0.45;
          wpY = 0.65 - 1.35 * ease;
        } else if (key === 'special2') {
          // Rising Dragon uppercut slash from low to high heaven!
          torsoRotZ = -0.35 + 0.6 * ease;
          torsoRotY = -0.65 * ease;
          shRZ = -0.45 + 2.85 * ease;
          shLZ = -0.2 + 2.2 * ease;
          elRZ = 0.15;
          wpZ = 0.45 * ease;
        } else {
          // Heavy Cleave & Zanshin Super Art: Devastating overhead 210° downward cleave!
          torsoRotZ = 0.24 - 0.72 * ease;
          torsoRotY = 0.35 - 0.95 * ease;
          shRZ = 2.45 - 2.95 * ease;
          shLZ = 2.15 - 2.45 * ease;
          elRZ = 0.1;
          wpZ = 0.35 - 1.05 * ease;
        }
      } else {
        // Phase 3: Zanshin Follow-Through -> Smooth Return to Ready Guard
        const p = Math.min(1, (f - sUp - act) / rec);
        const hold = 1 - p;
        torsoRotZ = -0.32 * hold;
        torsoRotY = -0.55 * hold;
        shRZ = -0.25 * hold + 0.55 * p;
        elRZ = 0.15 * hold + 0.72 * p;
        wpZ = -0.55 * hold - 0.35 * p;
      }
    }

    // --- 6. MIND'S EYE PARRY & DEFENSIVE GUARD ---
    else if (pose.state === 'parry' || pose.state === 'blockstun') {
      pelvisY = 0.88;
      torsoRotZ = 0.12;
      torsoRotY = 0.35;
      shRZ = 1.25;
      shRX = -0.45;
      elRZ = 1.15;
      wpZ = 0.85; // Vertical blade guard in front of face
      shLZ = 1.05;
      elLZ = 1.1;
    }

    // --- 7. HITSTUN RECOIL & KNOCKOUT ---
    else if (pose.state === 'hitstun') {
      pelvisY = 0.9;
      torsoRotZ = 0.48; // Thrown backward by impact
      torsoRotY = 0.45;
      headRotZ = 0.42;
      shRZ = -0.45;
      shLZ = -0.55;
      hipRZ = 0.15;
      hipLZ = -0.45;
    } else if (pose.state === 'ko') {
      pelvisY = 0.22;
      pelvisRotZ = 1.48; // Fallen flat on the dojo floor
      torsoRotZ = 0.15;
      shRZ = -0.8;
      shLZ = -0.6;
    }

    // Apply smooth damping to all 3D joints (faster interpolation during attacks for crisp frame accuracy!)
    const rate = pose.state === 'attack' ? 0.58 : 0.32;

    rig.pelvis.position.y = this.dampAngle(rig.pelvis.position.y, pelvisY, rate);
    rig.pelvis.rotation.z = this.dampAngle(rig.pelvis.rotation.z, pelvisRotZ, rate);

    rig.torso.rotation.z = this.dampAngle(rig.torso.rotation.z, torsoRotZ, rate);
    rig.torso.rotation.y = this.dampAngle(rig.torso.rotation.y, torsoRotY, rate);

    rig.head.rotation.z = this.dampAngle(rig.head.rotation.z, headRotZ, rate);
    rig.head.rotation.y = this.dampAngle(rig.head.rotation.y, headRotY, rate);

    rig.hipL.rotation.z = this.dampAngle(rig.hipL.rotation.z, hipLZ, rate);
    rig.kneeL.rotation.z = this.dampAngle(rig.kneeL.rotation.z, kneeLZ, rate);
    rig.ankleL.rotation.z = this.dampAngle(rig.ankleL.rotation.z, ankleLZ, rate);

    rig.hipR.rotation.z = this.dampAngle(rig.hipR.rotation.z, hipRZ, rate);
    rig.kneeR.rotation.z = this.dampAngle(rig.kneeR.rotation.z, kneeRZ, rate);
    rig.ankleR.rotation.z = this.dampAngle(rig.ankleR.rotation.z, ankleRZ, rate);

    rig.shoulderR.rotation.z = this.dampAngle(rig.shoulderR.rotation.z, shRZ, rate);
    rig.shoulderR.rotation.x = this.dampAngle(rig.shoulderR.rotation.x, shRX, rate);
    rig.shoulderR.rotation.y = this.dampAngle(rig.shoulderR.rotation.y, shRY, rate);
    rig.elbowR.rotation.z = this.dampAngle(rig.elbowR.rotation.z, elRZ, rate);

    rig.weaponPivot.rotation.z = this.dampAngle(rig.weaponPivot.rotation.z, wpZ, rate);
    rig.weaponPivot.rotation.y = this.dampAngle(rig.weaponPivot.rotation.y, wpY, rate);

    rig.shoulderL.rotation.z = this.dampAngle(rig.shoulderL.rotation.z, shLZ, rate);
    rig.shoulderL.rotation.x = this.dampAngle(rig.shoulderL.rotation.x, shLX, rate);
    rig.elbowL.rotation.z = this.dampAngle(rig.elbowL.rotation.z, elLZ, rate);

    // Secondary Hair / Scarf Physics Chain Wave
    const windSpeed = Math.abs(pose.vx) > 2 || pose.state === 'attack' ? 0.25 : 0.11;
    rig.hairRibbon.forEach((link, idx) => {
      link.rotation.z = Math.sin(t * windSpeed - idx * 0.7) * (0.18 + idx * 0.06);
      link.rotation.y = Math.cos(t * windSpeed * 0.8 - idx) * 0.12;
    });

    // Update 3D Sword Trail Ribbon in World Space
    rig.root.updateMatrixWorld(true);
    const tipWorld = new THREE.Vector3();
    const baseWorld = new THREE.Vector3();
    rig.weaponTipMarker.getWorldPosition(tipWorld);
    rig.weaponBaseMarker.getWorldPosition(baseWorld);

    const trail = this.swordTrailHistory[playerIndex];
    if (pose.state === 'attack') {
      trail.unshift({ tip: tipWorld.clone(), base: baseWorld.clone() });
      if (trail.length > 10) trail.pop();
    } else if (trail.length > 0) {
      trail.pop();
    }

    this.updateSwordTrailGeometry(playerIndex, config.accentWatercolor);

    return rig;
  }

  private updateSwordTrailGeometry(playerIndex: 0 | 1, accentHex: string): void {
    const mesh = this.swordTrailMeshes[playerIndex];
    const trail = this.swordTrailHistory[playerIndex];
    const mat = mesh.material as THREE.ShaderMaterial;
    mat.uniforms.uColor.value.set(accentHex);

    const geom = mesh.geometry as THREE.BufferGeometry;
    const posAttr = geom.getAttribute('position') as THREE.BufferAttribute;
    const alphaAttr = geom.getAttribute('alpha') as THREE.BufferAttribute;

    const maxSegments = 10;
    for (let i = 0; i < maxSegments; i++) {
      const sample = trail[Math.min(i, Math.max(0, trail.length - 1))];
      const a = trail.length > 1 && i < trail.length ? Math.pow(1 - i / trail.length, 1.4) : 0;

      if (sample) {
        posAttr.setXYZ(i * 2, sample.tip.x, sample.tip.y, sample.tip.z);
        posAttr.setXYZ(i * 2 + 1, sample.base.x, sample.base.y, sample.base.z);
      }
      alphaAttr.setX(i * 2, a);
      alphaAttr.setX(i * 2 + 1, a * 0.5);
    }

    posAttr.needsUpdate = true;
    alphaAttr.needsUpdate = true;
  }

  public renderTo2DCanvas(
    ctx: CanvasRenderingContext2D,
    p1Config: FighterConfig,
    p1Pose: Fighter3DPoseInput,
    p2Config: FighterConfig,
    p2Pose: Fighter3DPoseInput
  ): void {
    // Hide any cached rigs from previous character selections
    for (const [key, r] of this.rigs.entries()) {
      r.root.visible = key === `p0_${p1Config.id}` || key === `p1_${p2Config.id}`;
    }

    const r1 = this.updateAndPoseFighter(0, p1Config, p1Pose);
    const r2 = this.updateAndPoseFighter(1, p2Config, p2Pose);
    r1.root.visible = true;
    r2.root.visible = true;

    this.renderer.render(this.scene, this.camera);
    ctx.drawImage(this.renderer.domElement, 0, 0, this.width, this.height);
  }
}
