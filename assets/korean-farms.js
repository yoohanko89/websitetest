import * as THREE from './vendor/three.module.js';

// A continuous, entirely geometric farm world. No image planes are used here.
// Coordinates continue the Korean landscape southwards along the negative Z axis.
export function createKoreanFarms() {
  const group = new THREE.Group();
  group.name = 'Korean farms — living ingredients';
  const resources = new Set();
  const keep = (resource) => { resources.add(resource); return resource; };
  const material = (color, extra = {}) => keep(new THREE.MeshStandardMaterial({ color, roughness: .86, ...extra }));
  const olive = material('#778042');
  const oliveDark = material('#354329');
  const oliveLight = material('#a0ac55');
  const tintedCanopy = material('#ffffff');
  const bark = material('#70503a');
  const burgundySoil = material('#573a31');
  const soil = material('#795540');
  const goldenFruit = material('#efbb36', { roughness: .64 });
  const rootSkin = material('#d9b479', { roughness: .95 });
  const rootTip = material('#b99562');
  const dew = material('#f5dc8c', { metalness: .15, roughness: .16, transparent: true, opacity: .88 });
  const dummy = new THREE.Object3D();
  const color = new THREE.Color();
  let seed = 70423;
  const random = () => { seed = (seed * 16807) % 2147483647; return (seed - 1) / 2147483646; };
  const lerp = THREE.MathUtils.lerp;
  const smooth = (a, b, t) => THREE.MathUtils.smoothstep(t, a, b);

  function terrainHeight(x, z) {
    // Gentle terraces remain continuous with the landscape's farm entrance.
    const tea = 5 + Math.sin(x * .021 + z * .013) * 6 + Math.cos(z * .019) * 3;
    const blend = 1 - smooth(-2140, -2020, z);
    return lerp(tea, -.1 + Math.sin(x * .027) * .35, blend);
  }

  function mesh(geometry, mat, x = 0, y = 0, z = 0, parent = group) {
    const object = new THREE.Mesh(geometry, mat);
    object.position.set(x, y, z);
    object.castShadow = true;
    object.receiveShadow = true;
    parent.add(object);
    return object;
  }

  // A leaf has thickness through a lifted central ridge and curled tip.
  function leafGeometry(length = 1, width = .4) {
    const positions = [];
    const indices = [];
    const rows = 5;
    for (let i = 0; i <= rows; i++) {
      const t = i / rows;
      const halfWidth = Math.pow(Math.sin(Math.PI * t), .8) * width * .5;
      const curl = .14 * Math.sin(t * Math.PI) - .11 * t * t;
      positions.push(-halfWidth, t * length, curl, 0, t * length, curl + halfWidth * .22, halfWidth, t * length, curl);
      if (i < rows) {
        const p = i * 3;
        indices.push(p, p + 3, p + 1, p + 1, p + 3, p + 4, p + 1, p + 4, p + 2, p + 2, p + 4, p + 5);
      }
    }
    const geometry = keep(new THREE.BufferGeometry());
    geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
    geometry.setIndex(indices);
    geometry.computeVertexNormals();
    return geometry;
  }
  const leafMat = material('#71863d', { side: THREE.DoubleSide, roughness: .65 });
  const heroTeaMaterial = material('#71863d', { side: THREE.DoubleSide, roughness: .65, emissive: '#b99438', emissiveIntensity: 0 });
  const tintedLeaves = material('#ffffff', { side: THREE.DoubleSide, roughness: .65 });
  const teaLeafGeometry = leafGeometry(1.65, .6);
  const treeLeafGeometry = leafGeometry(1.5, .63);
  const sphere = keep(new THREE.SphereGeometry(1, 8, 6));
  const tinySphere = keep(new THREE.IcosahedronGeometry(1, 0));
  const cylinder = keep(new THREE.CylinderGeometry(.65, 1, 1, 7));

  function instance(geometry, mat, count, name) {
    const object = keep(new THREE.InstancedMesh(geometry, mat, count));
    object.name = name;
    object.castShadow = true;
    object.receiveShadow = true;
    group.add(object);
    return object;
  }

  function setInstance(object, i, x, y, z, sx, sy = sx, sz = sx, rx = 0, ry = 0, rz = 0, tint) {
    dummy.position.set(x, y, z);
    dummy.scale.set(sx, sy, sz);
    dummy.rotation.set(rx, ry, rz);
    dummy.updateMatrix();
    object.setMatrixAt(i, dummy.matrix);
    if (tint) object.setColorAt(i, color.set(tint));
  }

  // Sculpted rolling earth gives the drone pass real depth and parallax.
  const groundGeometry = keep(new THREE.PlaneGeometry(600, 1160, 70, 145));
  groundGeometry.rotateX(-Math.PI / 2);
  const vertices = groundGeometry.attributes.position;
  const groundColors = [];
  for (let i = 0; i < vertices.count; i++) {
    const x = vertices.getX(i);
    const z = vertices.getZ(i) - 2260;
    vertices.setZ(i, z);
    vertices.setY(i, terrainHeight(x, z) - .6);
    const farSide = Math.abs(x) > 142;
    const c = new THREE.Color(farSide ? '#657340' : '#736a40');
    c.multiplyScalar(.86 + random() * .24);
    groundColors.push(c.r, c.g, c.b);
  }
  groundGeometry.setAttribute('color', new THREE.Float32BufferAttribute(groundColors, 3));
  groundGeometry.computeVertexNormals();
  mesh(groundGeometry, material('#ffffff', { vertexColors: true }));

  // Tea hedges follow the hillside in closely spaced, unmistakable curved rows.
  const teaRows = 27;
  const teaColumns = 39;
  const teaCount = teaRows * teaColumns;
  const leavesPerBush = 7;
  const teaBushes = instance(sphere, tintedCanopy, teaCount * 2, 'Three-dimensional tea hedges');
  const teaLeaves = instance(teaLeafGeometry, tintedLeaves, teaCount * leavesPerBush, 'Fresh tea leaves');
  const teaStems = instance(cylinder, bark, teaCount, 'Tea woody stems');
  const teaDew = instance(tinySphere, dew, teaCount * 2, 'Morning dew on tea');
  let bushIndex = 0, leafIndex = 0, dewIndex = 0;
  const teaTints = ['#617b37', '#7e8b40', '#a1a953', '#526d31', '#889747'];
  for (let row = 0; row < teaRows; row++) {
    for (let col = 0; col < teaColumns; col++) {
      const x = (col - (teaColumns - 1) / 2) * 6.9;
      const z = -1750 - row * 10.2 + Math.sin(x * .019) * 6;
      const y = terrainHeight(x, z);
      setInstance(teaStems, row * teaColumns + col, x, y + .7, z, .42, 2.4, .42);
      setInstance(teaBushes, bushIndex++, x - 1.2, y + 2.3, z, 3.7, 2.2, 3.7, 0, 0, 0, teaTints[row % teaTints.length]);
      setInstance(teaBushes, bushIndex++, x + 1.5, y + 2.6, z - .8, 3.4, 2.5, 3.7, 0, 0, 0, teaTints[(row + 1) % teaTints.length]);
      for (let n = 0; n < leavesPerBush; n++) {
        const angle = n / leavesPerBush * Math.PI * 2 + random() * .4;
        const lx = x + Math.cos(angle) * (1.6 + random() * 1.3);
        const lz = z + Math.sin(angle) * (1.7 + random() * 1.3);
        const ly = y + 4 + random() * .65;
        setInstance(teaLeaves, leafIndex, lx, ly, lz, 1.15 + random() * .45, 1.15 + random() * .45, 1.15, .3 + random() * .5, angle, .1 + random() * .25, teaTints[(n + row) % teaTints.length]);
        leafIndex++;
      }
      for (let n = 0; n < 2; n++) {
        setInstance(teaDew, dewIndex++, x + (random() - .5) * 3, y + 5.06, z + (random() - .5) * 2.5, .11 + random() * .08);
      }
    }
  }

  // Fine tea shoots close to the camera make their leaf shape visible, even on mobile.
  const teaShootGroup = new THREE.Group();
  group.add(teaShootGroup);
  const shootPositions = [[-5, -1913], [-1.7, -1912], [2.2, -1916], [5.6, -1912], [8, -1917]];
  for (const [x, z] of shootPositions) {
    const y = terrainHeight(x, z);
    mesh(cylinder, oliveDark, x, y + 5.9, z, teaShootGroup).scale.set(.055, 2.5, .055);
    for (let n = 0; n < 5; n++) {
      const leaf = mesh(teaLeafGeometry, oliveLight, x, y + 5.2 + n * .35, z, teaShootGroup);
      leaf.material = heroTeaMaterial;
      leaf.rotation.set(.65, n * 2.399, n % 2 ? .5 : -.5);
      leaf.scale.setScalar(1.35 - n * .07);
      const droplet = mesh(tinySphere, dew, x + .24 * Math.cos(n * 2.399), y + 6 + n * .35, z + .24 * Math.sin(n * 2.399), teaShootGroup);
      droplet.scale.setScalar(.11);
    }
  }

  // Orchard trees are true branched structures with individually modelled yuzu fruit.
  const orchardTreeCount = 7 * 9;
  const trunks = instance(cylinder, bark, orchardTreeCount, 'Yuzu orchard trunks');
  const branches = instance(cylinder, bark, orchardTreeCount * 4, 'Yuzu orchard branches');
  const crowns = instance(sphere, tintedCanopy, orchardTreeCount * 4, 'Yuzu leaf canopies');
  const orchardLeaves = instance(treeLeafGeometry, tintedLeaves, orchardTreeCount * 34, 'Yuzu orchard leaves');
  const fruits = instance(sphere, goldenFruit, orchardTreeCount * 16, 'Golden yuzu on branches');
  const fruitLeaf = instance(treeLeafGeometry, olive, orchardTreeCount * 16, 'Leaves beside yuzu fruit');
  let treeIndex = 0, branchIndex = 0, crownIndex = 0, orchardLeafIndex = 0, fruitIndex = 0;
  const treeLocations = [];
  for (let row = 0; row < 9; row++) {
    for (let col = 0; col < 7; col++) {
      const x = (col - 3) * 27 + (row % 2 ? 3 : -3);
      const z = -2105 - row * 26;
      treeLocations.push([x, z]);
    }
  }
  // The final tree is the one approached by the camera for a fruit macro.
  treeLocations[treeLocations.length - 1] = [7, -2260];
  for (let locationIndex = 0; locationIndex < treeLocations.length; locationIndex++) {
    const [x, z] = treeLocations[locationIndex];
    const isHeroTree = locationIndex === treeLocations.length - 1;
    const y = terrainHeight(x, z);
    setInstance(trunks, treeIndex++, x, y + 3, z, .54, 6.8, .54);
    for (let n = 0; n < 4; n++) {
      const a = n * Math.PI * .5 + .32;
      const bx = x + Math.cos(a) * 2.6;
      const bz = z + Math.sin(a) * 2.6;
      setInstance(branches, branchIndex++, bx, y + 6, bz, .22, 5.1, .22, Math.sin(a) * .55, a, -Math.cos(a) * .6);
      // Lift this tree's crown above its fruit-bearing branch so the close-up
      // sees the yellow fruit and individual leaves against the actual orchard.
      setInstance(crowns, crownIndex++, bx, y + (isHeroTree ? 12 : 8.5) + (n % 2) * .7, bz - (isHeroTree ? 3 : 0), isHeroTree ? 2.9 : 4.2, isHeroTree ? 2.2 : 3.3, isHeroTree ? 2.9 : 4.2, 0, 0, 0, ['#405432', '#596c39', '#758343', '#647641'][n]);
    }
    for (let n = 0; n < 34; n++) {
      const a = random() * Math.PI * 2;
      const r = 2 + random() * 4;
      const ly = y + 7.5 + random() * 4;
      setInstance(orchardLeaves, orchardLeafIndex++, x + Math.cos(a) * r, ly, z + Math.sin(a) * r, 1 + random() * .6, 1.4, 1, .3 + random(), a, .3, teaTints[n % teaTints.length]);
    }
    for (let n = 0; n < 16; n++) {
      const a = n / 16 * Math.PI * 2 + .2;
      const r = 3.8 + random() * 1.8;
      const fx = x + Math.cos(a) * r;
      const fz = z + Math.sin(a) * r;
      const fy = y + 6.7 + random() * 2.4;
      setInstance(fruits, fruitIndex, fx, fy, fz, .48 + random() * .2, .58, .58, 0, a, 0);
      setInstance(fruitLeaf, fruitIndex++, fx + .15, fy + .55, fz, .62, .65, .62, .8, a, .4);
    }
  }

  // A carefully shaped branch, rind and curling leaves fill the fruit close-up.
  const heroYuzu = new THREE.Group();
  heroYuzu.position.set(9.4, 8.2, -2257);
  heroYuzu.name = 'Living yuzu fruit close-up';
  group.add(heroYuzu);
  const rindGeometry = keep(new THREE.SphereGeometry(1, 32, 20));
  const rindVertices = rindGeometry.attributes.position;
  for (let i = 0; i < rindVertices.count; i++) {
    const p = new THREE.Vector3().fromBufferAttribute(rindVertices, i);
    const rough = 1 + .022 * Math.sin(p.x * 58) * Math.sin(p.y * 47) * Math.cos(p.z * 51);
    p.multiplyScalar(rough);
    rindVertices.setXYZ(i, p.x, p.y * .94, p.z);
  }
  rindGeometry.computeVertexNormals();
  const heroFruit = mesh(rindGeometry, goldenFruit, 0, 0, 0, heroYuzu);
  const heroFruitMaterial = material('#efbb36', { roughness: .64, emissive: '#e7b23d', emissiveIntensity: 0 });
  heroFruit.material = heroFruitMaterial;
  heroFruit.scale.setScalar(.95);
  mesh(cylinder, bark, 0, 1.12, 0, heroYuzu).scale.set(.045, .5, .045);
  const heroBranch = mesh(cylinder, bark, -.8, 1.42, .25, heroYuzu);
  heroBranch.scale.set(.13, 3.4, .13);
  heroBranch.rotation.z = -1.08;
  for (let i = 0; i < 7; i++) {
    const a = i * 2.399;
    const leaf = mesh(treeLeafGeometry, leafMat, Math.cos(a) * .5, 1.38 + (i % 2) * .2, Math.sin(a) * .5, heroYuzu);
    leaf.rotation.set(.7 + i * .08, a, i % 2 ? .6 : -.5);
    leaf.scale.setScalar(1.05 + (i % 3) * .18);
  }
  const fruitBeads = new THREE.Group();
  heroYuzu.add(fruitBeads);
  for (let n = 0; n < 18; n++) {
    const angle = random() * Math.PI * 2;
    const h = -.4 + random() * 1.2;
    const radius = Math.sqrt(Math.max(0, .91 - h * h));
    mesh(tinySphere, dew, Math.cos(angle) * radius, h, Math.sin(angle) * radius, fruitBeads).scale.setScalar(.028 + random() * .016);
  }

  // Ginseng beds use raised earth, stakes and loose geometrical shade slats.
  const bedGeometry = keep(new THREE.BoxGeometry(1, 1, 1));
  const beds = instance(bedGeometry, soil, 14, 'Raised ginseng soil beds');
  const bedPlants = instance(leafGeometry(2, .75), tintedLeaves, 14 * 44 * 5, 'Five-leaf ginseng plants');
  const plantStems = instance(cylinder, oliveDark, 14 * 44, 'Ginseng stems');
  const ginsengBerries = instance(tinySphere, material('#843849', { roughness: .6 }), 14 * 44 * 3, 'Ginseng red berries');
  let plantIndex = 0, plantLeafIndex = 0, berryIndex = 0;
  for (let row = 0; row < 14; row++) {
    const x = (row - 6.5) * 11;
    setInstance(beds, row, x, .05, -2550, 7.5, .9, 220);
    for (let n = 0; n < 44; n++) {
      const z = -2445 - n * 5;
      const px = x + (n % 2 ? 1.8 : -1.8);
      setInstance(plantStems, plantIndex++, px, 1.5, z, .06, 2.3, .06);
      for (let leaf = 0; leaf < 5; leaf++) {
        const a = leaf * Math.PI * 2 / 5;
        setInstance(bedPlants, plantLeafIndex++, px, 2.55, z, .85, 1.1, .85, .8, a, .18, teaTints[leaf]);
      }
      for (let berry = 0; berry < 3; berry++) {
        setInstance(ginsengBerries, berryIndex++, px + (berry - 1) * .13, 2.75 + (berry % 2) * .12, z, .095);
      }
    }
  }
  const shadePosts = instance(cylinder, bark, 32, 'Ginseng shade-frame posts');
  const shadeBars = instance(bedGeometry, burgundySoil, 56, 'Open ginseng shade-frame slats');
  let shadeBarIndex = 0;
  for (let n = 0; n < 16; n++) {
    const z = -2440 - n * 14;
    setInstance(shadePosts, n * 2, -86, 3.5, z, .18, 7, .18);
    setInstance(shadePosts, n * 2 + 1, 86, 3.5, z, .18, 7, .18);
    // The harvest bay is open, as it is when the shade is removed for digging.
    if (n !== 13 && n !== 14) for (let m = 0; m < 4; m++) setInstance(shadeBars, shadeBarIndex++, 0, 6.75, z - m * 2.8, 174, .13, .35);
  }

  // The harvested root is a sculpted central body, branching legs and fine rootlets.
  const harvest = new THREE.Group();
  harvest.name = 'Fresh ginseng rising from the earth';
  harvest.position.set(0, -2.65, -2636);
  group.add(harvest);
  const rootProfile = [new THREE.Vector2(.1, -1.1), new THREE.Vector2(.36, -.75), new THREE.Vector2(.55, .05), new THREE.Vector2(.58, .75), new THREE.Vector2(.42, 1.45), new THREE.Vector2(.2, 1.9), new THREE.Vector2(.15, 2.25)];
  const bodyGeometry = keep(new THREE.LatheGeometry(rootProfile, 18));
  const bodyVertices = bodyGeometry.attributes.position;
  for (let i = 0; i < bodyVertices.count; i++) {
    const y = bodyVertices.getY(i);
    const ripple = 1 + .035 * Math.sin(y * 27) + .018 * Math.cos(y * 43);
    bodyVertices.setX(i, bodyVertices.getX(i) * ripple);
    bodyVertices.setZ(i, bodyVertices.getZ(i) * ripple);
  }
  bodyGeometry.computeVertexNormals();
  const rootBody = mesh(bodyGeometry, rootSkin, 0, 0, 0, harvest);
  rootBody.rotation.z = -.09;
  function rootBranch(points, radius, mat = rootSkin) {
    const curve = new THREE.CatmullRomCurve3(points.map((p) => new THREE.Vector3(...p)));
    const geometry = keep(new THREE.TubeGeometry(curve, 18, radius, 6, false));
    const position = geometry.attributes.position;
    // Tube radii taper toward the delicate living tips.
    for (let i = 0; i < position.count; i++) {
      const segment = Math.floor(i / 7);
      const t = Math.min(1, segment / 18);
      const center = curve.getPointAt(t);
      const p = new THREE.Vector3().fromBufferAttribute(position, i);
      p.sub(center).multiplyScalar(1 - t * .84).add(center);
      position.setXYZ(i, p.x, p.y, p.z);
    }
    geometry.computeVertexNormals();
    return mesh(geometry, mat, 0, 0, 0, harvest);
  }
  rootBranch([[-.28, .15, 0], [-.7, -.85, .08], [-1.16, -1.65, .3], [-1.75, -2.15, .22]], .23);
  rootBranch([[.3, .05, -.03], [.65, -.8, -.1], [.7, -1.7, .1], [1.18, -2.65, .3]], .25);
  rootBranch([[.15, .3, -.25], [.4, -.8, -.55], [.1, -1.7, -.8]], .14);
  rootBranch([[-.4, 1.1, 0], [-.92, .8, .2], [-1.33, .2, .42]], .13);
  rootBranch([[.34, 1.1, .06], [.86, .7, .2], [1.32, .4, .18]], .11);
  for (let n = 0; n < 14; n++) {
    const side = n % 2 ? 1 : -1;
    const y = -.2 - (n % 7) * .29;
    const x = side * (.5 + (n % 7) * .12);
    rootBranch([[x, y, .1], [x + side * .35, y - .2, .2], [x + side * .7, y - .55, .12]], .035, rootTip);
  }
  mesh(cylinder, oliveDark, 0, 3.4, 0, harvest).scale.set(.07, 2.5, .07);
  const ginsengHeroLeaves = [];
  for (let n = 0; n < 5; n++) {
    const a = n * Math.PI * 2 / 5;
    const leaf = mesh(leafGeometry(2.7, .95), leafMat, 0, 4.45, 0, harvest);
    leaf.rotation.set(.95, a, .18);
    ginsengHeroLeaves.push(leaf);
  }
  for (let n = 0; n < 7; n++) mesh(tinySphere, ginsengBerries.material, Math.cos(n * .897) * .18, 4.65 + (n % 2) * .12, Math.sin(n * .897) * .18, harvest).scale.setScalar(.11);

  // The visitor discovers a living ingredient in its actual three-dimensional
  // setting. These small gold droplets have volume, depth and occlusion; they
  // are not sprites or a screen overlay. Only the chosen hero receives light.
  const heroRootMaterial = material('#d9b479', { roughness: .95, emissive: '#b78c43', emissiveIntensity: 0 });
  harvest.traverse((object) => {
    if (object.isMesh && object.material === rootSkin) object.material = heroRootMaterial;
  });
  function discoveryCluster(id, parent, center, radius, height, beadSize, accent) {
    const mat = material('#f2d584', {
      roughness: .2, metalness: .18, emissive: '#e0ab40', emissiveIntensity: .7,
      transparent: true, opacity: 0, depthWrite: false,
    });
    const object = keep(new THREE.InstancedMesh(tinySphere, mat, 12));
    object.name = `${id} — discovered living ingredient`;
    object.visible = false;
    object.frustumCulled = false;
    parent.add(object);
    return { id, object, mat, center: new THREE.Vector3(...center), radius, height, beadSize, accent, strength: 0 };
  }
  const discoveries = [
    discoveryCluster('tea', teaShootGroup, [-1.7, terrainHeight(-1.7, -1912) + 6.5, -1912], 1.45, .65, .065, heroTeaMaterial),
    discoveryCluster('yuzu', heroYuzu, [0, .12, 0], 1.22, .45, .045, heroFruitMaterial),
    discoveryCluster('ginseng', harvest, [0, .1, 0], 1.75, 1.55, .06, heroRootMaterial),
  ];
  let discoveredId = null;
  let previousDiscoveryTime = null;
  function setDiscovery(id) {
    discoveredId = discoveries.some((entry) => entry.id === id) ? id : null;
  }
  function updateDiscovery(time) {
    const delta = previousDiscoveryTime === null ? 1 / 60 : THREE.MathUtils.clamp(time - previousDiscoveryTime, 0, .1);
    previousDiscoveryTime = time;
    const ease = 1 - Math.exp(-delta * 5);
    for (const entry of discoveries) {
      entry.strength += ((entry.id === discoveredId ? 1 : 0) - entry.strength) * ease;
      const strength = entry.strength;
      entry.object.visible = strength > .002;
      entry.mat.opacity = strength * .78;
      entry.accent.emissiveIntensity = strength * (.15 + Math.sin(time * 1.7) * .045);
      if (!entry.object.visible) continue;
      for (let n = 0; n < 12; n++) {
        const angle = n / 12 * Math.PI * 2 + time * .22;
        const breath = 1 + Math.sin(time * .6 + n * .9) * .065;
        const x = entry.center.x + Math.cos(angle) * entry.radius * breath;
        const y = entry.center.y + Math.sin(angle * 2 + time * .3) * entry.height;
        const z = entry.center.z + Math.sin(angle) * entry.radius * breath;
        const size = entry.beadSize * strength * (.85 + Math.sin(time * 1.4 + n) * .15);
        setInstance(entry.object, n, x, y, z, size, size, size, time * .16 + n, angle, 0);
      }
      entry.object.instanceMatrix.needsUpdate = true;
    }
  }

  // Disturbed earth stays opaque and geometric rather than a sprite effect.
  const soilParticles = instance(tinySphere, burgundySoil, 90, 'Earth falling from harvested root');
  const particleSeeds = [];
  for (let n = 0; n < 90; n++) particleSeeds.push({ x: (random() - .5) * 3, z: (random() - .5) * 2.4, phase: random(), size: .035 + random() * .09 });
  soilParticles.visible = false;

  // Smaller terrain details show scale during the overhead flights.
  const stones = instance(tinySphere, material('#9b9270'), 100, 'Farm path stones');
  for (let n = 0; n < 100; n++) {
    const x = (n % 2 ? 1 : -1) * (143 + random() * 10);
    const z = -1710 - random() * 1050;
    setInstance(stones, n, x, terrainHeight(x, z), z, .8 + random() * 1.4, .4 + random() * .7, 1 + random());
  }
  // A boundary line of trees keeps the orchard and tea terraces grounded.
  const borderTrees = instance(sphere, oliveDark, 110, 'Olive farm boundary trees');
  const borderTrunks = instance(cylinder, bark, 110, 'Farm boundary trunks');
  for (let n = 0; n < 110; n++) {
    const x = (n % 2 ? 1 : -1) * (173 + random() * 22);
    const z = -1715 - Math.floor(n / 2) * 19;
    const y = terrainHeight(x, z);
    setInstance(borderTrunks, n, x, y + 3, z, .4, 6, .4);
    setInstance(borderTrees, n, x, y + 7, z, 4 + random() * 3, 5 + random() * 4, 4 + random() * 3);
  }

  const pathPositions = [
    [0, 78, -1700], [8, 50, -1738], [22, 25, -1830], [6, 15, -1896],
    [-1, 16, -1908], [8, 22, -1980], [-15, 32, -2080], [-7, 22, -2180],
    [6.5, 10.1, -2250.5], [8, 9.3, -2253.5], [-5, 26, -2320], [14, 36, -2444],
    [5, 14, -2550], [-4.3, 5.8, -2625], [-6, 7.1, -2625], [-6.7, 7.8, -2624],
  ];
  const pathTargets = [
    [0, 22, -1790], [0, 6, -1830], [0, 8, -1890], [0, 11.7, -1916],
    [1.5, 14.1, -1915], [0, 6, -2060], [0, 5, -2180], [7, 8, -2260],
    [9.4, 8.2, -2257], [9.4, 8.2, -2257], [0, 4, -2420], [0, 3, -2550],
    [0, 2, -2636], [0, 2.5, -2636], [0, 4.2, -2636], [0, 4.4, -2636],
  ];
  const positionCurve = new THREE.CatmullRomCurve3(pathPositions.map((p) => new THREE.Vector3(...p)), false, 'centripetal');
  const targetCurve = new THREE.CatmullRomCurve3(pathTargets.map((p) => new THREE.Vector3(...p)), false, 'centripetal');
  const cameraPosition = new THREE.Vector3();
  const cameraTarget = new THREE.Vector3();
  function getCamera(progress) {
    const p = THREE.MathUtils.clamp(progress, 0, 1);
    positionCurve.getPoint(p, cameraPosition);
    targetCurve.getPoint(p, cameraTarget);
    return {
      position: cameraPosition.clone(), target: cameraTarget.clone(),
      landmark: p < .37 ? 'Boseong · fresh tea & matcha' : p < .69 ? 'South coast · golden yuzu' : 'Geumsan · living ginseng',
    };
  }

  function update(time, progress) {
    const p = THREE.MathUtils.clamp(progress, 0, 1);
    const harvestProgress = smooth(.72, .97, p);
    harvest.position.y = -2.65 + harvestProgress * 5.45;
    harvest.rotation.y = -.28 + harvestProgress * .46 + Math.sin(time * .35) * .012;
    harvest.rotation.z = harvestProgress * -.08;
    heroYuzu.rotation.z = Math.sin(time * .65) * .022;
    teaShootGroup.rotation.z = Math.sin(time * .8) * .003;
    updateDiscovery(time);
    for (let n = 0; n < ginsengHeroLeaves.length; n++) ginsengHeroLeaves[n].rotation.x = .95 + Math.sin(time * 1.1 + n) * .055;
    soilParticles.visible = harvestProgress > .02 && harvestProgress < .99;
    if (soilParticles.visible) {
      for (let n = 0; n < particleSeeds.length; n++) {
        const s = particleSeeds[n];
        const cycle = (harvestProgress * 2.5 + s.phase) % 1;
        const height = Math.max(.12, harvest.position.y + 1.4 - cycle * cycle * 5);
        const size = s.size * (1 - cycle * .4);
        setInstance(soilParticles, n, s.x * (1 + cycle * .35), height, -2636 + s.z * (1 + cycle * .35), size, size * .75, size, time * .3 + n, n, cycle);
      }
      soilParticles.instanceMatrix.needsUpdate = true;
    }
  }

  // Bounding volumes are computed once; instanced farms are culled as clusters.
  group.traverse((object) => {
    if (object.isInstancedMesh) {
      object.instanceMatrix.needsUpdate = true;
      if (object.instanceColor) object.instanceColor.needsUpdate = true;
      object.computeBoundingSphere();
    }
  });
  soilParticles.frustumCulled = false;
  return {
    group, getCamera, update, setDiscovery,
    dispose() { for (const resource of resources) resource.dispose(); },
  };
}
