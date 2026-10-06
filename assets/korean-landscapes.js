import * as THREE from './vendor/three.module.js';

// A connected, deliberately stylized 3D terrain. This is an artistic journey,
// not surveyed geography or footage of the named places. World units are metres
// in spirit; northbound camera travel runs from z=80 to z=-1700.
const COLORS = {
  olive: '#626a37', leaf: '#777c42', deepLeaf: '#354b32', burgundy: '#542d37',
  gold: '#d9b85b', stone: '#a6997c', lightStone: '#c3b59a', wood: '#692e37',
  water: '#416661', foam: '#b9c6a5', roof: '#454638', paper: '#d8c89a'
};
const clamp = (v, a=0, b=1) => Math.max(a, Math.min(b, v));
const ease = v => { const t = clamp(v); return t*t*(3-2*t); };
const v3 = (x,y,z) => new THREE.Vector3(x,y,z);
const ISLANDS = [
  [-160,-490,88,56,31], [115,-535,87,61,43], [-40,-614,60,43,38],
  [-245,-625,57,52,29], [237,-675,91,46,34], [27,-465,38,25,17]
];

function islandHeight(x,z,cx,cz,rx,rz,height) {
  const radius = ((x-cx)/rx)**2 + ((z-cz)/rz)**2;
  if (radius > 1.12) return -7;
  return -4 + height * Math.max(0, 1-radius)**1.05;
}

function heightAt(x,z) {
  let height = -7;
  const jejuRadius = ((x-12)/222)**2 + ((z+205)/139)**2;
  if (jejuRadius < 1.12) {
    height = -4 + 32*Math.max(0,1-jejuRadius)**1.05;
    height += 43*Math.exp(-(((x-25)/66)**2+((z+196)/62)**2));
  }
  for (const island of ISLANDS) height = Math.max(height, islandHeight(x,z,...island));
  const mainland = ease((-z-665)/130);
  if (mainland > 0) {
    const rolling = 7*Math.sin(x*.014+z*.008)+5*Math.cos(z*.021-x*.012);
    const plateau = 18 + rolling + 21*Math.exp(-((x/220)**2+((z+982)/185)**2));
    const easternHills = 23*Math.exp(-(((x-147)/185)**2+((z+1410)/170)**2));
    const side = ease((440-Math.abs(x))/75);
    height = Math.max(height, -7 + mainland*side*(plateau+easternHills+7));
  }
  return height;
}

function randomSource() {
  let seed=47817;
  return () => { seed=(Math.imul(1664525,seed)+1013904223)>>>0; return seed/4294967296; };
}

export function createKoreanLandscape() {
  const group = new THREE.Group();
  group.name = 'Korean origin landscape — procedural 3D interpretation';
  const geometries = new Set();
  const materials = new Set();
  const keepGeometry = geometry => { geometries.add(geometry); return geometry; };
  const material = (color, options={}) => {
    const result = new THREE.MeshStandardMaterial({color, roughness:.91, ...options});
    materials.add(result); return result;
  };
  const mesh = (geometry, mat, parent=group) => {
    const result = new THREE.Mesh(keepGeometry(geometry),mat);
    result.receiveShadow=true; parent.add(result); return result;
  };
  const olive = material(COLORS.olive);
  const burgundy = material(COLORS.burgundy);
  const stone = material(COLORS.stone);
  const lightStone = material(COLORS.lightStone);
  const wood = material(COLORS.wood);
  const gold = material(COLORS.gold, {metalness:.2,roughness:.7});
  const roofMaterial = material(COLORS.roof, {side:THREE.DoubleSide});
  const paper = material(COLORS.paper);
  const trunkMaterial = material('#503a2f');
  const leafMaterial = material('#ffffff');
  const terrainMaterial = material('#ffffff', {vertexColors:true});

  // One continuous triangulated landscape supports real depth/parallax.
  const terrain = keepGeometry(new THREE.PlaneGeometry(960,1930,58,176));
  terrain.rotateX(-Math.PI/2); terrain.translate(0,0,-805);
  const position=terrain.attributes.position;
  const colors=new Float32Array(position.count*3);
  const landColor = new THREE.Color(), low=new THREE.Color('#4c5c35');
  const high = new THREE.Color('#858651'), soil=new THREE.Color('#6a4042');
  for (let i=0;i<position.count;i++) {
    const x=position.getX(i), z=position.getZ(i), y=heightAt(x,z);
    position.setY(i,y);
    const speckle=(Math.sin(x*.39+z*.31)*Math.cos(x*.15-z*.27)+1)*.5;
    landColor.copy(low).lerp(high,clamp(y/100)*.67+speckle*.23);
    if (y>63 && z>-360) landColor.lerp(soil,clamp((y-63)/25));
    colors.set([landColor.r,landColor.g,landColor.b],i*3);
  }
  terrain.setAttribute('color',new THREE.BufferAttribute(colors,3));
  terrain.computeVertexNormals();
  const ground=mesh(terrain,terrainMaterial); ground.name='Connected olive terrain';

  // Water is geometric; shallow procedural waves move its subdivided surface.
  const waterUniform={value:0};
  const waterMaterial=material(COLORS.water,{roughness:.5,metalness:.2});
  waterMaterial.onBeforeCompile=shader=>{
    shader.uniforms.landscapeTime=waterUniform;
    shader.vertexShader='uniform float landscapeTime;\n'+shader.vertexShader;
    shader.vertexShader=shader.vertexShader.replace('#include <begin_vertex>',
      '#include <begin_vertex>\ntransformed.z += .6*sin(position.x*.037+landscapeTime*.7)*cos(position.y*.032-landscapeTime*.5);');
    shader.vertexShader=shader.vertexShader.replace('#include <beginnormal_vertex>',
      '#include <beginnormal_vertex>\nobjectNormal = normalize(vec3(-.0222*cos(position.x*.037+landscapeTime*.7)*cos(position.y*.032-landscapeTime*.5), .0192*sin(position.x*.037+landscapeTime*.7)*sin(position.y*.032-landscapeTime*.5), 1.0));');
  };
  const ocean=mesh(new THREE.PlaneGeometry(1800,2420,22,34),waterMaterial);
  ocean.rotation.x=-Math.PI/2; ocean.position.set(0,-.7,-780); ocean.name='Olive teal sea';

  const foamMaterial=new THREE.LineBasicMaterial({color:COLORS.foam,transparent:true,opacity:.24});
  materials.add(foamMaterial);
  function shoreline(cx,cz,rx,rz) {
    const pts=[];
    for(let i=0;i<=80;i++) {
      const a=i/80*Math.PI*2;
      const jitter=1+.022*Math.sin(a*7)+.014*Math.cos(a*11);
      pts.push(v3(cx+Math.cos(a)*rx*jitter,.25,cz+Math.sin(a)*rz*jitter));
    }
    const line=new THREE.Line(keepGeometry(new THREE.BufferGeometry().setFromPoints(pts)),foamMaterial);
    group.add(line);
  }
  shoreline(12,-205,205,127);
  for(const [x,z,rx,rz] of ISLANDS) shoreline(x,z,rx*.92,rz*.92);

  // Hallasan: a broad volcanic cone with an actual rim and a recessed crater.
  const hallasan=new THREE.Group(); hallasan.name='Jeju / Hallasan volcanic crater';
  hallasan.position.set(25,27,-196); group.add(hallasan);
  const craterProfile=[[83,0],[71,8],[55,25],[41,42],[29,57],[22,65],[17,64],[12,58],[0,57]];
  const volcanoGeo=new THREE.LatheGeometry(craterProfile.map(p=>new THREE.Vector2(...p)),48);
  const volcanoColors=new Float32Array(volcanoGeo.attributes.position.count*3);
  const volcanoColor=new THREE.Color();
  for(let i=0;i<volcanoGeo.attributes.position.count;i++){
    const y=volcanoGeo.attributes.position.getY(i);
    volcanoColor.set(COLORS.olive).lerp(new THREE.Color(COLORS.burgundy),clamp((y-15)/52)*.66);
    volcanoColors.set([volcanoColor.r,volcanoColor.g,volcanoColor.b],i*3);
  }
  volcanoGeo.setAttribute('color',new THREE.BufferAttribute(volcanoColors,3));
  const cone=mesh(volcanoGeo,terrainMaterial,hallasan); cone.castShadow=true;
  const lake=mesh(new THREE.CircleGeometry(11.5,32),material('#607565',{roughness:.25}),hallasan);
  lake.rotation.x=-Math.PI/2; lake.position.y=85.2-27;
  // The crater rim catches the brand's warm gold light without a flat image.
  const rim=mesh(new THREE.TorusGeometry(20,1.05,5,48),material('#a6a26b'),hallasan);
  rim.rotation.x=Math.PI/2; rim.position.y=64.3;

  // Maisan's distinctive pair of steep, rounded rock pinnacles.
  const maisan=new THREE.Group(); maisan.position.set(0,0,-1030); maisan.name='Jinan / Maisan twin peaks';
  group.add(maisan);
  const rockMaterial=material('#ffffff',{vertexColors:true});
  function rockPeak(x,z,width,height,lean) {
    const geometry=new THREE.SphereGeometry(1,18,15);
    const p=geometry.attributes.position;
    const rockColors=new Float32Array(p.count*3), rockColor=new THREE.Color();
    for(let i=0;i<p.count;i++) {
      const py=p.getY(i), bulge=1+.06*Math.sin(p.getX(i)*14+p.getZ(i)*11+py*12);
      const layer=clamp(.35+.16*Math.sin(py*54+p.getX(i)*.7)+.13*Math.cos(py*15));
      rockColor.set('#7c7766').lerp(new THREE.Color('#b1a58d'),layer);
      if(py<-.65) rockColor.lerp(new THREE.Color('#655441'),(-py-.65)*.75);
      rockColors.set([rockColor.r,rockColor.g,rockColor.b],i*3);
      p.setXYZ(i,p.getX(i)*width*bulge+lean*(py+1)*.5,(py+1)*height*.5,
        p.getZ(i)*width*.72*bulge);
    }
    geometry.setAttribute('color',new THREE.BufferAttribute(rockColors,3));
    geometry.computeVertexNormals();
    const rock=mesh(geometry,rockMaterial,maisan);
    rock.position.set(x,heightAt(x,-1030+z)-2,z); rock.castShadow=true;
    return rock;
  }
  rockPeak(-33,-3,35,121,-9); rockPeak(32,8,28,99,5);
  // Low stone piles suggest the mountain paths while keeping the mesh budget modest.
  const pileGeo=keepGeometry(new THREE.IcosahedronGeometry(2,0));
  const piles=new THREE.InstancedMesh(pileGeo,stone,24);
  const matrix=new THREE.Matrix4(), quaternion=new THREE.Quaternion(), scale=new THREE.Vector3();
  for(let i=0;i<24;i++) {
    const tower=Math.floor(i/4), level=i%4;
    const x=-66+tower*19, z=-981+Math.sin(tower)*6;
    scale.set(1-level*.15,.65,1-level*.15);
    matrix.compose(v3(x,heightAt(x,z)+1+level*2,z),quaternion,scale); piles.setMatrixAt(i,matrix);
  }
  piles.instanceMatrix.needsUpdate=true; group.add(piles);

  // Forest canopy is real instanced geometry, with gaps in the flight corridor.
  const random=randomSource(), treePoints=[];
  for(let trial=0;trial<2400 && treePoints.length<240;trial++) {
    const x=(random()-.5)*690, z=80-random()*1780, y=heightAt(x,z);
    if(y<5 || (z>-340 && y>47)) continue;
    if(z<-1350 && z>-1540 && Math.abs(x-62)<75) continue;
    if(z<-947 && z>-1090 && Math.abs(x)<77) continue;
    treePoints.push({x,y,z,s:.62+random()*.78,r:random()*Math.PI*2});
  }
  const trunks=new THREE.InstancedMesh(keepGeometry(new THREE.CylinderGeometry(.55,.8,6,5)),trunkMaterial,treePoints.length);
  const crowns=new THREE.InstancedMesh(keepGeometry(new THREE.ConeGeometry(4.7,12,6)),leafMaterial,treePoints.length*2);
  for(let i=0;i<treePoints.length;i++) {
    const p=treePoints[i]; quaternion.setFromAxisAngle(v3(0,1,0),p.r); scale.setScalar(p.s);
    matrix.compose(v3(p.x,p.y+3*p.s,p.z),quaternion,scale); trunks.setMatrixAt(i,matrix);
    matrix.compose(v3(p.x,p.y+10*p.s,p.z),quaternion,scale); crowns.setMatrixAt(i*2,matrix);
    scale.set(p.s*.77,p.s*.76,p.s*.77);
    matrix.compose(v3(p.x,p.y+15*p.s,p.z),quaternion,scale); crowns.setMatrixAt(i*2+1,matrix);
    crowns.setColorAt(i*2,new THREE.Color(COLORS.deepLeaf).lerp(new THREE.Color(COLORS.leaf),i%5*.09));
    crowns.setColorAt(i*2+1,new THREE.Color(COLORS.deepLeaf).lerp(new THREE.Color(COLORS.leaf),.15+i%5*.08));
  }
  trunks.instanceMatrix.needsUpdate=true; crowns.instanceMatrix.needsUpdate=true;
  trunks.castShadow=true; crowns.castShadow=true; group.add(trunks,crowns);

  // Buseoksa-inspired hillside pavilion: timber columns, stone terraces and a
  // curved tiled roof are built as meshes. This is not a replica of the temple.
  const temple=new THREE.Group(); temple.name='Yeongju / Buseoksa inspired timber pavilion';
  const templeGround=heightAt(62,-1435);
  temple.position.set(62,templeGround,-1435); group.add(temple);
  function box(w,h,d,x,y,z,mat,parent=temple) {
    const result=mesh(new THREE.BoxGeometry(w,h,d),mat,parent); result.position.set(x,y,z); return result;
  }
  box(112,6,92,0,3,5,stone);
  box(91,6,73,0,8,1,lightStone);
  box(73,4,54,0,13,-1,stone);
  box(65,2,39,0,16,-5,wood);
  // Stair geometry is instanced rather than separate draw calls.
  const stairs=new THREE.InstancedMesh(keepGeometry(new THREE.BoxGeometry(18,1.6,3)),lightStone,11);
  for(let i=0;i<11;i++) {
    matrix.makeTranslation(0,.8+i*1.5,63-i*3); stairs.setMatrixAt(i,matrix);
  }
  stairs.instanceMatrix.needsUpdate=true; temple.add(stairs);
  const columnGeometry=keepGeometry(new THREE.CylinderGeometry(.75,1,20,8));
  const columns=new THREE.InstancedMesh(columnGeometry,wood,14);
  let ci=0;
  for(const z of [-18,8]) for(let x=-27;x<=27;x+=9) {
    matrix.makeTranslation(x,27,z); columns.setMatrixAt(ci++,matrix);
  }
  columns.instanceMatrix.needsUpdate=true; temple.add(columns);
  box(58,14,1.1,0,26,-17,paper);
  box(58,1.1,29,0,37,-5,wood);
  box(1.1,14,28,-28.5,26,-5,paper);
  box(1.1,14,28,28.5,26,-5,paper);
  // Fine vertical window slats, gold lintels and door frames, all batched.
  const slats=new THREE.InstancedMesh(keepGeometry(new THREE.BoxGeometry(.33,13,1.3)),wood,43);
  for(let i=0;i<43;i++) { matrix.makeTranslation(-27+i*1.28,26,-16.7); slats.setMatrixAt(i,matrix); }
  slats.instanceMatrix.needsUpdate=true; temple.add(slats);
  box(59,.75,1.7,0,33,-16.4,gold);
  box(64,1.4,1.6,0,36.2,9,wood);

  function curvedRoof(w,d,base,parent=temple) {
    const geo=new THREE.PlaneGeometry(w*2,d*2,24,14); geo.rotateX(-Math.PI/2);
    const pp=geo.attributes.position;
    for(let i=0;i<pp.count;i++) {
      const x=pp.getX(i), z=pp.getZ(i), zn=Math.abs(z/d), xn=Math.abs(x/w);
      pp.setY(i,base+11*(1-zn)+4*xn**6+2*zn**6);
    }
    geo.computeVertexNormals();
    const result=mesh(geo,roofMaterial,parent); result.castShadow=true;
    // Tile seams follow the actual curved roof surface, revealing its shape.
    const lines=[];
    for(let i=0;i<=30;i++) {
      const x=-w+2*w*i/30;
      for(let j=0;j<12;j++) {
        const z0=-d+2*d*j/12, z1=-d+2*d*(j+1)/12;
        for(const z of [z0,z1]) {
          const zn=Math.abs(z/d), xn=Math.abs(x/w);
          lines.push(x,base+11*(1-zn)+4*xn**6+2*zn**6+.14,z);
        }
      }
    }
    const tileMat=new THREE.LineBasicMaterial({color:'#7e7b59'}); materials.add(tileMat);
    const tiles=new THREE.LineSegments(keepGeometry(new THREE.BufferGeometry().setAttribute('position',new THREE.Float32BufferAttribute(lines,3))),tileMat);
    parent.add(tiles);
    const ridge=mesh(new THREE.CylinderGeometry(.55,.55,w*2,8),gold,parent);
    ridge.rotation.z=Math.PI/2; ridge.position.set(0,base+11.5,0);
    return result;
  }
  const mainRoof=new THREE.Group(); mainRoof.position.z=-5; temple.add(mainRoof);
  curvedRoof(39,22,38,mainRoof);
  // A smaller entry pavilion reads against the terraces as the camera arrives.
  const entry=new THREE.Group(); entry.position.set(-36,7,35); temple.add(entry);
  for(const x of [-7,7])for(const z of [-4,4]){
    const p=mesh(new THREE.CylinderGeometry(.55,.65,12,6),wood,entry); p.position.set(x,6,z);
  }
  curvedRoof(11,7,12,entry);

  // Warm, restrained markers are solid geometry, rather than map pin sprites.
  function path(points) {
    const curve=new THREE.CatmullRomCurve3(points.map(([x,z])=>v3(x,heightAt(x,z)+.35,z)));
    mesh(new THREE.TubeGeometry(curve,60,1.4,4,false),material('#a58e58'));
  }
  path([[-113,-791],[-89,-871],[-85,-933],[-78,-986]]);
  path([[47,-1340],[56,-1358],[67,-1372],[65,-1397]]);

  // Curve points are intentionally shared between routes. Heading, position and
  // ground clearance remain continuous as the camera moves into the farm module.
  const cameraPoints=[
    [-170,147,88],[-170,135,-107],[-115,123,-233],[94,119,-323],
    [94,125,-426],[-90,138,-510],[-150,132,-650],[-155,145,-819],
    [-155,155,-952],[84,133,-1110],[127,98,-1260],[-61,97,-1357],
    [0,86,-1480],[42,82,-1604],[0,78,-1700]
  ].map(p=>v3(...p));
  const targetPoints=[
    [20,40,-200],[25,72,-196],[25,68,-196],[0,34,-311],
    [20,3,-585],[0,4,-625],[0,25,-782],[-15,75,-1028],
    [0,94,-1030],[44,38,-1204],[62,60,-1435],[62,75,-1438],
    [62,templeGround+26,-1435],[0,30,-1700],[0,22,-1790]
  ].map(p=>v3(...p));
  const cameraCurve=new THREE.CatmullRomCurve3(cameraPoints,false,'catmullrom',.34);
  const targetCurve=new THREE.CatmullRomCurve3(targetPoints,false,'catmullrom',.3);
  const landmarks=[
    {id:'jeju',name:'Jeju Island · Hallasan',start:0,end:3/14},
    {id:'south-coast',name:'The South Coast · Islands & Sea',start:3/14,end:6/14},
    {id:'maisan',name:'Jeolla Highlands · Maisan',start:6/14,end:9/14},
    {id:'buseoksa',name:'Gyeongsang · Buseoksa',start:9/14,end:12/14},
    {id:'farms',name:'From Korean Land to Living Ingredients',start:12/14,end:1}
  ];
  const routes=landmarks.map(item=>({...item,
    from:cameraCurve.getPoint(item.start),to:cameraCurve.getPoint(item.end),
    lookFrom:targetCurve.getPoint(item.start),lookTo:targetCurve.getPoint(item.end)
  }));
  const cameraPosition=new THREE.Vector3(),cameraTarget=new THREE.Vector3();
  function getCamera(progress) {
    const p=clamp(progress);
    cameraCurve.getPoint(p,cameraPosition); targetCurve.getPoint(p,cameraTarget);
    const landmark=landmarks.find(item=>p<=item.end)||landmarks[landmarks.length-1];
    return {position:cameraPosition.clone(),target:cameraTarget.clone(),landmark:landmark.name,id:landmark.id};
  }
  function update(time,progress=0) { waterUniform.value=time; group.userData.progress=clamp(progress); }
  function dispose() {
    for(const geometry of geometries) geometry.dispose();
    for(const mat of materials) mat.dispose();
    group.clear();
  }
  group.userData.landmarks=landmarks;
  group.userData.description='Stylized procedural 3D interpretation of Korean places; not filmed or surveyed scenery.';
  return {group,routes,getCamera,update,dispose,heightAt};
}
