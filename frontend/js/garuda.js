// ═══════════════════════════════════════════════════════════
// CORE CONSTANTS & REINFORCEMENT LEARNING PARAMS
// ═══════════════════════════════════════════════════════════
const ROWS=20, COLS=20;
const FREE=0, OBS=1, NOFLY=2, START=3, VISITED=4;
const DIRS=[[-1,0],[1,0],[0,-1],[0,1]];
const DRONE_COLORS=['#ffd700','#00d4ff','#ff4466','#a855f7'];
const DRONE_NAMES=['GARUDA-1','GARUDA-2','GARUDA-3','GARUDA-4'];
const ALPHA=0.45, GAMMA=0.92,
      EPS0=0.90,       // Round 1: exploration
      EPS_DECAY=0.15,  // Decay per round
      EPS_MIN=0.05;

const RTB_THRESHOLD=0.12, FOG_RADIUS=3, MAX_BATT=1200, RECHARGE_STEPS=40;
const R_NEW_CELL=+15, R_REVISIT=-8, R_DANGER=-0.08,
      R_STEP=-0.2, R_STRAIGHT=+5.0, R_TURN=-7.0;

// ═══════════════════════════════════════════════════════════
// PERSISTENT MULTI-MISSION VAULT SYSTEM
// ═══════════════════════════════════════════════════════════
const VAULT_KEY = 'garuda_missions_vault_v1';
let activeMissionId = 'msn_default';
let activeMissionName = 'OPERATION DELTA';

function getVault(){
  try{
    const raw = localStorage.getItem(VAULT_KEY);
    return raw ? JSON.parse(raw) : {};
  }catch(e){ return {}; }
}

function saveVault(vault){
  try{
    localStorage.setItem(VAULT_KEY, JSON.stringify(vault));
  }catch(e){ console.warn('Vault save failed:', e); }
}

function saveActiveMissionToVault(){
  try {
    const vault = getVault();
    vault[activeMissionId] = {
      id: activeMissionId,
      name: activeMissionName,
      updatedAt: new Date().toISOString(),
      zone: { lat: Z.lat, lng: Z.lng, rad: Z.rad, alt: Z.alt },
      renderMode,
      roundsCount: MEM.msnHistory.length,
      qSize: MEM.qSize(),
      knownObs: MEM.knownObs,
      danger: MEM.danger,
      Q: MEM.Q,
      msnHistory: MEM.msnHistory,
      msnEfficiency: MEM.msnEfficiency
    };
    saveVault(vault);
    const el = document.getElementById('memStatus');
    if(el){ el.textContent='💾 SAVED'; el.style.color='var(--g)'; setTimeout(()=>{el.textContent='';},2000); }
  } catch(e) { console.error('Save mission error:', e); }
}

// ═══════════════════════════════════════════════════════════
// GATEWAY HUB & MISSION CONTROLLER
// ═══════════════════════════════════════════════════════════
function openHubModal(){ 
  const el = document.getElementById('hubModal');
  if(el) el.classList.add('open'); 
}
function closeHubModal(){ 
  const el = document.getElementById('hubModal');
  if(el) el.classList.remove('open'); 
}

function openMyMissionsFromHub(){
  closeHubModal();
  openMyMissions();
}

function openNewMissionFromHub(){
  closeHubModal();
  openNewMissionModal();
}

function openMyMissions(){
  const modal = document.getElementById('myMissionsModal');
  if(!modal) return;
  const listEl = document.getElementById('myMissionsList');
  const vault = getVault();
  const keys = Object.keys(vault);

  if(keys.length === 0){
    listEl.innerHTML = `
      <div style="font-size:9px;color:var(--tx);text-align:center;padding:24px 10px;line-height:2">
        No missions saved yet.<br>Click <b>➕ START NEW MISSION</b> to create your first autonomous mission!
      </div>`;
  } else {
    listEl.innerHTML = keys.map(k=>{
      const m = vault[k];
      if(!m) return '';
      const isActive = (k === activeMissionId);
      const bestEff = m.msnEfficiency && m.msnEfficiency.length ? Math.max(...m.msnEfficiency) : 0;
      const bestTime = m.msnHistory && m.msnHistory.length ? Math.min(...m.msnHistory.map(h=>h.timeSec||999)) : 0;
      const timeStr = bestTime < 900 ? `${bestTime}s` : 'N/A';
      const zoneLat = m.zone ? m.zone.lat : 28.6139;
      const zoneLng = m.zone ? m.zone.lng : 77.2090;
      const zoneAlt = m.zone ? m.zone.alt : 120;
      return `
        <div class="mission-card ${isActive?'active-msn':''}">
          <div>
            <div class="msn-info-hd">${m.name || 'MISSION'} ${isActive?'<span style="color:var(--g);font-size:7px;margin-left:6px">● CURRENT ACTIVE</span>':''}</div>
            <div class="msn-info-sub">
              📍 ${fmtCoord(zoneLat,true)}, ${fmtCoord(zoneLng,false)} (Alt: ${zoneAlt}m) · Mode: <b style="color:var(--b)">${m.renderMode==='sat'?'Real Satellite':'Simulation'}</b><br>
              🔄 Rounds: <b style="color:var(--b)">${m.roundsCount || 0}</b> · ⚡ Best Eff: <b style="color:var(--g)">${bestEff}%</b> · ⏱️ Best Time: <b style="color:var(--b)">${timeStr}</b> · 🧠 Q-States: ${m.qSize || 0}
            </div>
          </div>
          <div class="msn-actions">
            <button class="btn bb" onclick="loadMissionFromVault('${m.id}')"><span>${isActive?'ACTIVE':'⚡ RESUME'}</span></button>
            <button class="btn bo" onclick="restartMissionFromVault('${m.id}')"><span>↺ RESTART</span></button>
            <button class="btn br" onclick="deleteMissionFromVault('${m.id}')"><span>🗑️</span></button>
          </div>
        </div>
      `;
    }).join('');
  }
  modal.classList.add('open');
}

function closeMyMissions(){ 
  const el = document.getElementById('myMissionsModal');
  if(el) el.classList.remove('open'); 
}

function loadMissionFromVault(id){
  const vault = getVault();
  const m = vault[id];
  if(!m) return;
  activeMissionId = m.id || ('msn_' + Date.now());
  activeMissionName = m.name || 'OPERATION DELTA';
  if(m.zone){
    Z.lat = m.zone.lat || 28.6139;
    Z.lng = m.zone.lng || 77.2090;
    Z.rad = m.zone.rad || 2;
    Z.alt = m.zone.alt || 120;
  }
  renderMode = m.renderMode || 'sim';
  MEM.Q = m.Q || {};
  MEM.danger = m.danger || {};
  MEM.knownObs = m.knownObs || [];
  MEM.msnHistory = m.msnHistory || [];
  MEM.msnEfficiency = m.msnEfficiency || [];
  msnNum = MEM.msnHistory.length + 1;

  const nameEl = document.getElementById('msnNameDisplay');
  if(nameEl) nameEl.textContent = activeMissionName.toUpperCase();
  const tagEl = document.getElementById('msnTag');
  if(tagEl) tagEl.textContent = `ROUND ${msnNum}`;
  closeMyMissions();
  initMission();
  updateMsnHistory();
  setRenderMode(renderMode);
  if(leafletMap && renderMode==='sat'){ leafletMap.setView([Z.lat, Z.lng], 14); }
  toast(`📂 RESUMED MISSION "${activeMissionName}"`,'ok');
  speak(`Resumed mission ${activeMissionName}.`);
  log(`📂 Loaded Mission: "${activeMissionName}" with ${MEM.msnHistory.length} completed rounds`,'ok');
}

function restartMissionFromVault(id){
  const vault = getVault();
  const m = vault[id];
  if(!m) return;
  activeMissionId = m.id;
  activeMissionName = m.name;
  if(m.zone){
    Z.lat = m.zone.lat || 28.6139;
    Z.lng = m.zone.lng || 77.2090;
    Z.rad = m.zone.rad || 2;
    Z.alt = m.zone.alt || 120;
  }
  renderMode = m.renderMode || 'sim';
  MEM.reset();
  msnNum = 1;

  const nameEl = document.getElementById('msnNameDisplay');
  if(nameEl) nameEl.textContent = activeMissionName.toUpperCase();
  const tagEl = document.getElementById('msnTag');
  if(tagEl) tagEl.textContent = 'ROUND 1';
  closeMyMissions();
  initMission();
  updateMsnHistory();
  setRenderMode(renderMode);
  saveActiveMissionToVault();
  toast(`↺ RESTARTED MISSION "${activeMissionName}"`,'ok');
}

function deleteMissionFromVault(id){
  const vault = getVault();
  if(vault[id]){
    delete vault[id];
    saveVault(vault);
    openMyMissions();
    toast('🗑️ MISSION DELETED FROM VAULT','al');
  }
}

let selectedNewMode = 'sim';

function openNewMissionModal(){
  selectedNewMode = 'sim';
  selectNewMode('sim');
  const nameInp = document.getElementById('newMsnName');
  if(nameInp) nameInp.value = `OPERATION ${['DELTA','ECHO','OMEGA','FALCON','VALKYRIE'][Math.floor(Math.random()*5)]}`;
  const modal = document.getElementById('newMissionModal');
  if(modal) modal.classList.add('open');
}

function closeNewMissionModal(){ 
  const modal = document.getElementById('newMissionModal');
  if(modal) modal.classList.remove('open'); 
}

function selectNewMode(mode){
  selectedNewMode = mode;
  const simB = document.getElementById('boxModeSim');
  const satB = document.getElementById('boxModeSat');
  const gpsSec = document.getElementById('liveGpsPromptSec');
  if(simB) simB.classList.toggle('active', mode==='sim');
  if(satB) satB.classList.toggle('active', mode==='sat');
  if(gpsSec) gpsSec.style.display = mode==='sat' ? 'block' : 'none';
  if(mode === 'sat'){
    useLiveGPSInNew();
  }
}

function setNewPreset(lat, lng, alt, name){
  const latInp = document.getElementById('newLat');
  const lngInp = document.getElementById('newLng');
  const altInp = document.getElementById('newAlt');
  const nameInp = document.getElementById('newMsnName');
  if(latInp) latInp.value = lat;
  if(lngInp) lngInp.value = lng;
  if(altInp) altInp.value = alt;
  if(name && nameInp) nameInp.value = name;
}

function useLiveGPSInNew(){
  if(!navigator.geolocation){ toast('⚠️ Geolocation not supported','w'); return; }
  toast('🛰️ ACQUIRING LIVE GPS FIX...','inf');
  navigator.geolocation.getCurrentPosition(
    (pos)=>{
      const latInp = document.getElementById('newLat');
      const lngInp = document.getElementById('newLng');
      if(latInp) latInp.value = pos.coords.latitude.toFixed(4);
      if(lngInp) lngInp.value = pos.coords.longitude.toFixed(4);
      toast(`📍 GPS LOCKED: ${pos.coords.latitude.toFixed(4)}°, ${pos.coords.longitude.toFixed(4)}°`,'ok');
    },
    (err)=>{ toast('⚠️ GPS Timeout / Denied','al'); },
    { enableHighAccuracy: true, timeout: 8000 }
  );
}

function createAndStartMission(){
  const nameInp = document.getElementById('newMsnName');
  const latInp = document.getElementById('newLat');
  const lngInp = document.getElementById('newLng');
  const radInp = document.getElementById('newRad');
  const altInp = document.getElementById('newAlt');

  const name = (nameInp && nameInp.value ? String(nameInp.value).trim() : '') || 'OPERATION CUSTOM';
  const lat = parseFloat(latInp ? latInp.value : 28.6139) || 28.6139;
  const lng = parseFloat(lngInp ? lngInp.value : 77.2090) || 77.2090;
  const rad = parseFloat(radInp ? radInp.value : 2) || 2;
  const alt = parseFloat(altInp ? altInp.value : 120) || 120;

  activeMissionId = 'msn_' + Date.now();
  activeMissionName = name;
  Z.lat = lat; Z.lng = lng; Z.rad = rad; Z.alt = alt;
  renderMode = selectedNewMode;
  MEM.reset();
  msnNum = 1;

  const nameEl = document.getElementById('msnNameDisplay');
  if(nameEl) nameEl.textContent = activeMissionName.toUpperCase();
  const tagEl = document.getElementById('msnTag');
  if(tagEl) tagEl.textContent = 'ROUND 1';
  
  const doneOv = document.getElementById('doneOv');
  if(doneOv) doneOv.classList.remove('show');
  closeNewMissionModal();

  initMission();
  updateMsnHistory();
  setRenderMode(renderMode);
  saveActiveMissionToVault();
  if(leafletMap && renderMode==='sat'){ leafletMap.setView([Z.lat, Z.lng], 14); }
  toast(`🚀 MISSION "${activeMissionName}" INITIALIZED`,'ok');
  speak(`Mission ${activeMissionName} initialized.`);
  log(`🚀 Initialized: "${activeMissionName}" (${renderMode==='sat'?'Satellite Map':'Simulation Grid'})`,'ok');
}

// ═══════════════════════════════════════════════════════════
// TOAST NOTIFICATIONS
// ═══════════════════════════════════════════════════════════
let lastToastMsgs = {};
function toast(msg, type='inf'){
  const now = Date.now();
  if(lastToastMsgs[msg] && now - lastToastMsgs[msg] < 2200) return;
  lastToastMsgs[msg] = now;

  const ct = document.getElementById('toastContainer');
  if(!ct) return;
  while(ct.children.length >= 3){ ct.removeChild(ct.firstChild); }
  const t = document.createElement('div');
  t.className = `toast toast-${type}`;
  t.textContent = msg;
  ct.appendChild(t);
  requestAnimationFrame(()=>t.classList.add('show'));
  setTimeout(()=>{ t.classList.remove('show'); setTimeout(()=>t.remove(),250); }, 2800);
}

// ═══════════════════════════════════════════════════════════
// VOICE ALERTS (Web Speech API)
// ═══════════════════════════════════════════════════════════
let voiceEnabled = false;

function toggleVoice(){
  voiceEnabled = !voiceEnabled;
  const btn = document.getElementById('voiceBtn');
  if(btn){
    btn.textContent = voiceEnabled ? '🔊 VOICE' : '🔇 VOICE';
    btn.classList.toggle('active', voiceEnabled);
  }
  if(voiceEnabled) speak('Voice alerts enabled. GARUDA online.');
  else { if(window.speechSynthesis) speechSynthesis.cancel(); }
}

function speak(text){
  if(!voiceEnabled || !window.speechSynthesis) return;
  const u = new SpeechSynthesisUtterance(text);
  u.rate = 0.90; u.pitch = 0.80; u.volume = 0.85;
  speechSynthesis.cancel();
  speechSynthesis.speak(u);
}

// ═══════════════════════════════════════════════════════════
// JSON MISSION EXPORT
// ═══════════════════════════════════════════════════════════
function exportReport(){
  const report = {
    missionName: activeMissionName,
    missionId: activeMissionId,
    exportedAt: new Date().toISOString(),
    system: 'GARUDA-OPS v10',
    zone: { lat: Z.lat, lng: Z.lng, radiusKm: Z.rad, altitudeM: Z.alt },
    totalRounds: MEM.msnHistory.length,
    rounds: MEM.msnHistory,
    rlMemory: { qStates: MEM.qSize(), dangerCells: MEM.dangerCells(), knownObstacles: MEM.knownObs.length },
    currentEpsilon: getEps()
  };
  const blob = new Blob([JSON.stringify(report, null, 2)], { type: 'application/json' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = `${activeMissionName.toLowerCase().replace(/\s+/g,'_')}_report.json`;
  a.click();
  toast('📥 FLIGHT REPORT EXPORTED','ok');
}

// ═══════════════════════════════════════════════════════════
// ZONE & REAL MAP / SATELLITE ENGINE
// ═══════════════════════════════════════════════════════════
let renderMode = 'sim';
let leafletMap = null;

const Z = { lat: 28.6139, lng: 77.2090, rad: 2, alt: 120,
  latPerCell(){ return (this.rad*2/ROWS)/111; },
  lngPerCell(){ return (this.rad*2/COLS)/(111*Math.cos(this.lat*Math.PI/180)); },
  cellLatLng(r,c){
    return {
      lat: (this.lat+this.rad/111) - r*this.latPerCell(),
      lng: (this.lng - this.rad/(111*Math.cos(this.lat*Math.PI/180))) + c*this.lngPerCell()
    };
  }
};
const fmtCoord = (v, isLat) => `${Math.abs(v).toFixed(4)}°${isLat?(v>=0?'N':'S'):(v>=0?'E':'W')}`;

function initLeafletMap(){
  const mapEl = document.getElementById('leafletMap');
  if(!mapEl || !window.L) return;
  if(!leafletMap){
    leafletMap = L.map('leafletMap', {
      zoomControl: false,
      attributionControl: false,
      dragging: false,
      scrollWheelZoom: false,
      doubleClickZoom: false
    }).setView([Z.lat, Z.lng], 14);

    L.tileLayer('https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}', {
      maxZoom: 19
    }).addTo(leafletMap);
  } else {
    leafletMap.setView([Z.lat, Z.lng], 14);
    setTimeout(()=>{ leafletMap.invalidateSize(); }, 200);
  }
}

function toggleMapMode(){
  setRenderMode(renderMode === 'sim' ? 'sat' : 'sim');
}

function setRenderMode(mode){
  renderMode = mode;
  const mapEl = document.getElementById('leafletMap');
  if(renderMode === 'sat'){
    if(mapEl) mapEl.style.display = 'block';
    initLeafletMap();
  } else {
    if(mapEl) mapEl.style.display = 'none';
  }
  drawMap();
}

function getBuildingHazardLevel(lat, lng, alt){
  let avgStructureHeight = 45;
  if(Math.abs(lat-40.71)<0.5 && Math.abs(lng+74.00)<0.5) avgStructureHeight = 160;
  else if(Math.abs(lat-19.07)<0.5 && Math.abs(lng-72.87)<0.5) avgStructureHeight = 110;
  else if(Math.abs(lat-28.61)<0.5 && Math.abs(lng-77.20)<0.5) avgStructureHeight = 65;
  else if(Math.abs(lat-35.67)<0.5 && Math.abs(lng-139.6)<0.5) avgStructureHeight = 120;

  const clearance = alt - avgStructureHeight;
  if(clearance >= 40) return { status:'🟢 OPTIMAL (>40m above structures)', safe:true, clearance, density:1 };
  if(clearance >= 10) return { status:'🟡 MODERATE (10-40m clearance over towers)', safe:true, clearance, density:2 };
  return { status:'🔴 LOW ALTITUDE (Building collision risk active)', safe:false, clearance, density:3 };
}

// ═══════════════════════════════════════════════════════════
// RL MEMORY & DYNAMIC POLICY
// ═══════════════════════════════════════════════════════════
const MEM = {
  Q:{}, danger:{}, knownObs:[], msnHistory:[], msnEfficiency:[],

  getQ(r,c,a){ const k=`${r},${c}`; if(!this.Q[k])this.Q[k]=[0,0,0,0]; return this.Q[k][a]; },
  setQ(r,c,a,v){ const k=`${r},${c}`; if(!this.Q[k])this.Q[k]=[0,0,0,0]; this.Q[k][a]=v; },
  getDanger(r,c){ return this.danger[`${r},${c}`]||0; },

  learnObstacle(r,c){
    if(!this.knownObs.find(o=>o[0]===r&&o[1]===c)) this.knownObs.push([r,c]);
    for(let dr=-2;dr<=2;dr++) for(let dc=-2;dc<=2;dc++){
      const nr=r+dr, nc=c+dc;
      if(nr<0||nr>=ROWS||nc<0||nc>=COLS) continue;
      const dist=Math.sqrt(dr*dr+dc*dc);
      const k=`${nr},${nc}`;
      this.danger[k]=Math.min(100,(this.danger[k]||0)+35/(dist+0.5));
    }
  },

  rewardStraightPath(r,c,a){ this.setQ(r,c,a, this.getQ(r,c,a)+R_STRAIGHT); },
  penalizeTurn(r,c,a){ this.setQ(r,c,a, this.getQ(r,c,a)+R_TURN); },

  recordMission(cov, straightMoves, turnMoves, replannings, obs, totalSteps, energyUsed, timeSec){
    const totalMoves = straightMoves + turnMoves;
    const eff = totalMoves > 0
      ? Math.min(98, Math.round(((straightMoves * 1.0) / (straightMoves * 1.0 + turnMoves * 1.5 + replannings * 5.0)) * 100))
      : 0;
    this.msnEfficiency.push(eff);
    this.msnHistory.push({
      m: this.msnHistory.length+1,
      cov: Math.min(100, Math.round(cov*10)/10),
      eff,
      straight: straightMoves,
      turns: turnMoves,
      replan: replannings,
      obs,
      steps: totalSteps,
      energy: Math.round(energyUsed),
      timeSec: timeSec || 0,
      eps: getEps().toFixed(2)
    });
    saveActiveMissionToVault();
  },

  qSize(){ return Object.keys(this.Q).length; },
  dangerCells(){ return Object.keys(this.danger).length; },
  reset(){ this.Q={}; this.danger={}; this.knownObs=[]; this.msnHistory=[]; this.msnEfficiency=[]; }
};

// ═══════════════════════════════════════════════════════════
// GRID & BASE MAP
// ═══════════════════════════════════════════════════════════
let baseGrid=[], liveGrid=[], fogGrid=[], userPaints=[];

function buildBaseGrid(){
  const g=Array.from({length:ROWS},()=>new Array(COLS).fill(FREE));
  g[0][0]=START;

  for(let r=5;r<9;r++) for(let c=10;c<14;c++) g[r][c]=NOFLY;
  for(let r=14;r<18;r++) for(let c=3;c<7;c++) g[r][c]=NOFLY;

  const baseObstacles = [
    [2,5],[2,6],[3,5],[3,6],[8,2],[8,3],[9,2],[9,3],[12,15],[13,15],[12,16],
    [1,18],[2,18],[3,18],[4,18],[17,12],[17,13],[18,12],[6,18],[7,18],[7,17]
  ];
  baseObstacles.forEach(([r,c])=>g[r][c]=OBS);

  const hazard = getBuildingHazardLevel(Z.lat, Z.lng, Z.alt);
  if(hazard.density >= 2){
    [[4,3],[4,4],[11,8],[11,9],[15,16],[16,16]].forEach(([r,c])=>{
      if(g[r][c]===FREE) g[r][c]=OBS;
    });
  }

  userPaints.forEach(([r,c,t])=>{
    if(r===0&&c===0) return;
    g[r][c] = t==='obs'?OBS : t==='nfz'?NOFLY : FREE;
  });
  return g;
}

function buildFogGrid(){ return Array.from({length:ROWS},()=>new Array(COLS).fill(true)); }

function revealFog(r,c){
  for(let dr=-FOG_RADIUS;dr<=FOG_RADIUS;dr++)
    for(let dc=-FOG_RADIUS;dc<=FOG_RADIUS;dc++){
      const nr=r+dr, nc=c+dc;
      if(nr>=0&&nr<ROWS&&nc>=0&&nc<COLS) fogGrid[nr][nc]=false;
    }
}

function preloadMemory(g){
  let cnt=0;
  MEM.knownObs.forEach(([r,c])=>{ if(g[r][c]===FREE){g[r][c]=OBS;cnt++;} });
  return cnt;
}

// ═══════════════════════════════════════════════════════════
// A* PATHFINDER WITH CORRIDOR OPTIMIZATION
// ═══════════════════════════════════════════════════════════
function walkable(g,r,c){ return r>=0&&r<ROWS&&c>=0&&c<COLS&&g[r][c]!==OBS&&g[r][c]!==NOFLY; }

function astar(g,sr,sc,er,ec){
  if(!walkable(g,er,ec)) return [[sr,sc]];
  if(sr===er && sc===ec) return [[sr,sc]];
  const H=(r,c)=>Math.abs(r-er)+Math.abs(c-ec);
  const turnPenaltyScale = Math.min(3.0, 0.4 + (msnNum-1)*0.9);
  const open=[[H(sr,sc),sr,sc,null]];
  const gScore={}; gScore[`${sr},${sc}`]=0;
  const from={};
  const closed=new Set();

  let maxIter=1500;
  while(open.length && maxIter-->0){
    open.sort((a,b)=>a[0]-b[0]);
    const [,r,c,prevDir]=open.shift();
    const k=`${r},${c}`;
    if(closed.has(k)) continue;
    closed.add(k);

    if(r===er&&c===ec){
      const path=[]; let cr=er,cc=ec;
      let depth=0; const visitedNodes=new Set();
      while(from[`${cr},${cc}`] && depth++<400){
        const pk=`${cr},${cc}`;
        if(visitedNodes.has(pk)) break;
        visitedNodes.add(pk);
        [cr,cc]=from[pk];
        path.unshift([cr,cc]);
      }
      path.push([er,ec]);
      return path.length?path:[[sr,sc]];
    }

    for(let i=0;i<DIRS.length;i++){
      const [dr,dc]=DIRS[i];
      const nr=r+dr,nc=c+dc;
      if(!walkable(g,nr,nc)) continue;
      if(nr===sr && nc===sc) continue;
      const dangerCost=MEM.getDanger(nr,nc)*0.02;
      const isTurnHere = prevDir && !(prevDir[0]===dr && prevDir[1]===dc);
      const turnCost = isTurnHere ? turnPenaltyScale : 0;
      const qVal = MEM.getQ(r,c,i);
      const qBenefit = Math.max(-2.0, Math.min(2.0, qVal*0.06));
      const moveCost = Math.max(0.1, 1 + dangerCost + turnCost - qBenefit);
      const ng=(gScore[`${r},${c}`]||0) + moveCost;
      if(gScore[`${nr},${nc}`]===undefined||ng<gScore[`${nr},${nc}`]){
        gScore[`${nr},${nc}`]=ng;
        from[`${nr},${nc}`]=[r,c];
        open.push([ng+H(nr,nc),nr,nc,[dr,dc]]);
      }
    }
  }
  return [[sr,sc]];
}

// ═══════════════════════════════════════════════════════════
// SECTOR PATH BUILDER
// ═══════════════════════════════════════════════════════════
function buildSectorPath(g, droneIdx, totalDrones, startR, startC){
  const secW=Math.ceil(COLS/totalDrones);
  const c0=droneIdx*secW, c1=Math.min(c0+secW,COLS);
  const waypoints=[];

  for(let r=0;r<ROWS;r++){
    const sweepLeftToRight = (r%2===0);
    for(let ci=0;ci<(c1-c0);ci++){
      const c=sweepLeftToRight ? (c0+ci) : (c1-1-ci);
      if(walkable(g,r,c) && (g[r][c]===FREE||g[r][c]===START)){
        waypoints.push([r,c]);
      }
    }
  }
  if(!waypoints.length) return [[startR,startC]];
  const fullPath=[];
  let cur=[startR,startC];
  for(const [wr,wc] of waypoints){
    if(!walkable(g,wr,wc)) continue;
    if(wr===cur[0]&&wc===cur[1]){
      if(!fullPath.length||(fullPath[fullPath.length-1][0]!==wr||fullPath[fullPath.length-1][1]!==wc)) fullPath.push([wr,wc]);
      continue;
    }
    const seg=astar(g,cur[0],cur[1],wr,wc);
    if(seg && seg.length>0 && seg[seg.length-1][0]===wr && seg[seg.length-1][1]===wc){
      seg.forEach(p=>{
        if(walkable(g,p[0],p[1]) || (p[0]===startR && p[1]===startC)){
          if(!fullPath.length||(p[0]!==fullPath[fullPath.length-1][0]||p[1]!==fullPath[fullPath.length-1][1]))
            fullPath.push(p);
        }
      });
      cur=[wr,wc];
    }
  }
  return fullPath.length?fullPath:[[startR,startC]];
}

// ═══════════════════════════════════════════════════════════
// DRONE SWARM STATE & Q-POLICY
// ═══════════════════════════════════════════════════════════
let drones=[], nDrones=2, msnNum=1, totalReplan=0;
let running=false, paused=false, simTimer=null;
let totalStraightMoves=0, totalTurnMoves=0, totalEnergyUsed=0, totalSteps=0;
let missionStartTime=0, missionElapsedTime='0.0';
let prevDroneDirections={};
const getEps=()=>Math.max(EPS_MIN, EPS0-EPS_DECAY*(msnNum-1));

function makeDrone(idx){
  const path=buildSectorPath(liveGrid, idx, nDrones, 0, 0);
  return {
    idx, color:DRONE_COLORS[idx], name:DRONE_NAMES[idx],
    path, pathIdx:0, pos:[0,0], batt:MAX_BATT, trail:[],
    status:'READY', replanCount:0, cellsVisited:0, speedKmh:0,
    rtbPath:null, rtbIdx:0, rechargeTick:0,
    homePath:null, homeIdx:0,
    rotAngle:Math.random()*Math.PI*2, bobPhase:Math.random()*Math.PI*2,
  };
}

function chooseAction(r,c){
  const eps = getEps();
  if(Math.random()<eps){
    const valid=[];
    for(let i=0;i<4;i++){
      const [dr,dc]=DIRS[i],nr=r+dr,nc=c+dc;
      if(walkable(liveGrid,nr,nc)){
        const dg=MEM.getDanger(nr,nc);
        const w=Math.max(0.4, 1.0-dg/150);
        valid.push({i,w});
      }
    }
    if(!valid.length) return Math.floor(Math.random()*4);
    const tot=valid.reduce((s,x)=>s+x.w,0);
    let rr=Math.random()*tot;
    for(const x of valid){rr-=x.w;if(rr<=0)return x.i;}
    return valid[valid.length-1].i;
  }
  let best=null, bestScore=-Infinity;
  for(let i=0;i<4;i++){
    const [dr,dc]=DIRS[i],nr=r+dr,nc=c+dc;
    if(walkable(liveGrid,nr,nc)){
      const q=MEM.getQ(r,c,i);
      const dg=MEM.getDanger(nr,nc);
      const score=q - dg*0.08;
      if(score>bestScore){bestScore=score;best=i;}
    }
  }
  return best!==null?best:Math.floor(Math.random()*4);
}

function updateQ(r,c,a,reward,nr,nc){
  const old=MEM.getQ(r,c,a);
  const bestNext=Math.max(...DIRS.map((_,i)=>MEM.getQ(nr,nc,i)));
  MEM.setQ(r,c,a, old+ALPHA*(reward+GAMMA*bestNext-old));
}

// ═══════════════════════════════════════════════════════════
// AUTO OBSTACLE SCHEDULE
// ═══════════════════════════════════════════════════════════
let dynObsSchedule={};
let globalTick=0;

// ═══════════════════════════════════════════════════════════
// SIMULATION TICK WITH ACCELERATION
// ═══════════════════════════════════════════════════════════
function tickDrone(d){
  d.rotAngle+=0.09; d.bobPhase+=0.06;
  if(d.status==='DONE') return;

  if(d.status==='RECHARGING'){
    d.rechargeTick--;
    d.batt=Math.min(MAX_BATT, d.batt+MAX_BATT/RECHARGE_STEPS);
    d.speedKmh=0;
    if(d.rechargeTick<=0){
      d.path=buildSectorPath(liveGrid,d.idx,nDrones,d.pos[0],d.pos[1]);
      d.pathIdx=0; d.status='ACTIVE';
      log(`🔋 ${d.name} recharged → resuming`,'ok');
    }
    return;
  }

  if(d.status==='RETURNING'){
    d.speedKmh=calcSpeed();
    if(!d.homePath||d.homeIdx>=d.homePath.length){
      d.status='DONE'; d.speedKmh=0;
      log(`🏠 ${d.name} returned to base`,'ok');
      return;
    }
    const np=d.homePath[d.homeIdx];
    if(!walkable(liveGrid,np[0],np[1])){
      d.homePath=astar(liveGrid,d.pos[0],d.pos[1],0,0);
      d.homeIdx=0;
      log(`↺ ${d.name} home path rerouted around obstacle`,'al');
      return;
    }
    d.homeIdx++;
    d.pos=[...np]; d.batt-=0.4;
    d.trail.push([...np]); if(d.trail.length>80) d.trail.shift();
    revealFog(np[0],np[1]);
    return;
  }

  if(d.status==='RTB'){
    d.speedKmh=calcSpeed()*1.2;
    if(!d.rtbPath||d.rtbIdx>=d.rtbPath.length){
      d.status='RECHARGING'; d.rechargeTick=RECHARGE_STEPS; d.speedKmh=0;
      log(`🔌 ${d.name} at base — RECHARGING`,'w');
      return;
    }
    const np=d.rtbPath[d.rtbIdx];
    if(!walkable(liveGrid,np[0],np[1])){
      d.rtbPath=astar(liveGrid,d.pos[0],d.pos[1],0,0);
      d.rtbIdx=0;
      log(`↺ ${d.name} RTB rerouted around obstacle`,'al');
      return;
    }
    d.rtbIdx++;
    d.pos=[...np]; d.batt-=0.7;
    d.trail.push([...np]); if(d.trail.length>60) d.trail.shift();
    revealFog(np[0],np[1]);
    return;
  }

  if(d.batt/MAX_BATT<RTB_THRESHOLD && d.status==='ACTIVE'){
    d.status='RTB';
    d.rtbPath=astar(liveGrid,d.pos[0],d.pos[1],0,0);
    d.rtbIdx=0;
    log(`⚠ ${d.name} BATTERY ${(d.batt/MAX_BATT*100).toFixed(0)}% — RTB`,'w');
    showHint(`${d.name} LOW BATTERY — RTB ENGAGED`,'obs');
    toast(`⚠ ${d.name} BATTERY CRITICAL — RTB INITIATED`,'w');
    speak(`${d.name.replace('-',' ')}, battery critical, return to base.`);
    return;
  }

  if(d.pathIdx>=d.path.length && d.status==='ACTIVE'){
    d.status='RETURNING';
    d.homePath=astar(liveGrid,d.pos[0],d.pos[1],0,0);
    d.homeIdx=0; d.speedKmh=calcSpeed();
    log(`✅ ${d.name} sector complete → returning home`,'ok');
    return;
  }

  if(d.pathIdx>=d.path.length) return;

  const [r,c]=d.path[d.pathIdx];

  // 🛡️ CRITICAL OBSTACLE COLLISION PRE-CHECK WITH ANTI-LOOP
  if(!walkable(liveGrid,r,c)){
    MEM.learnObstacle(r,c);
    let replanStart = d.pos;
    if(!walkable(liveGrid, replanStart[0], replanStart[1])){
      for(let i=0;i<4;i++){
        const nr=replanStart[0]+DIRS[i][0], nc=replanStart[1]+DIRS[i][1];
        if(walkable(liveGrid, nr, nc)){ replanStart=[nr,nc]; break; }
      }
    }
    d.pos = replanStart;
    d.path=buildSectorPath(liveGrid,d.idx,nDrones,d.pos[0],d.pos[1]);
    d.pathIdx=0; d.replanCount++; totalReplan++;
    log(`🛡️ ${d.name} avoided obstacle at [${r},${c}] → rerouting`,'al');
    toast(`🛡️ ${d.name} AVOIDED OBSTACLE AT [${r},${c}]`,'al');
    drawHeatmap();
    drawMap();
    return;
  }

  revealFog(r,c);
  d.trail.push([r,c]); if(d.trail.length>80) d.trail.shift();
  d.speedKmh=calcSpeed();
  totalSteps++;

  const prevDir=prevDroneDirections[d.idx];
  const newDir=d.pos?[r-d.pos[0], c-d.pos[1]]:null;
  let isTurn=false;
  if(prevDir&&newDir){
    isTurn=!(prevDir[0]===newDir[0]&&prevDir[1]===newDir[1]);
    if(isTurn){
      totalTurnMoves++; totalEnergyUsed+=1.4;
      const act=DIRS.findIndex(([dr,dc])=>dr===newDir[0]&&dc===newDir[1]);
      if(act>=0) MEM.penalizeTurn(d.pos[0],d.pos[1],act);
    } else {
      totalStraightMoves++; totalEnergyUsed+=1.0;
      const act=DIRS.findIndex(([dr,dc])=>dr===newDir[0]&&dc===newDir[1]);
      if(act>=0) MEM.rewardStraightPath(d.pos[0],d.pos[1],act);
    }
  } else {
    totalStraightMoves++; totalEnergyUsed+=1.0;
  }
  if(newDir) prevDroneDirections[d.idx]=newDir;

  const act=chooseAction(r,c);
  let reward=R_STEP;
  const dg=MEM.getDanger(r,c);
  reward+=R_DANGER*(dg/80);
  if(isTurn) reward+=R_TURN; else reward+=R_STRAIGHT;
  if(liveGrid[r][c]===FREE){
    liveGrid[r][c]=VISITED; reward+=R_NEW_CELL; d.cellsVisited++;
  } else {
    reward+=R_REVISIT;
  }
  const nxt=d.pathIdx+1<d.path.length?d.path[d.pathIdx+1]:[r,c];
  updateQ(r,c,act,reward,nxt[0],nxt[1]);
  d.batt-=0.5; d.pos=[r,c]; d.pathIdx++;

  // 🚀 RL VELOCITY ACCELERATION ON CORRIDORS
  if(msnNum >= 2 && !isTurn && d.pathIdx < d.path.length){
    const qConfidence = MEM.getQ(r,c,act);
    const advanceChance = msnNum === 2 ? 0.35 : 0.65;
    if(qConfidence > 2.0 && Math.random() < advanceChance){
      const [nextR, nextC] = d.path[d.pathIdx];
      if(walkable(liveGrid, nextR, nextC)){
        revealFog(nextR, nextC);
        d.trail.push([nextR, nextC]); if(d.trail.length>80) d.trail.shift();
        totalSteps++; totalStraightMoves++; totalEnergyUsed += 0.8;
        if(liveGrid[nextR][nextC]===FREE){ liveGrid[nextR][nextC]=VISITED; d.cellsVisited++; }
        d.pos = [nextR, nextC];
        d.pathIdx++;
      }
    }
  }
}

function calcSpeed(){
  const spdEl = document.getElementById('spdSlider');
  const spd = spdEl ? +spdEl.value : 5;
  const msPerTick=Math.max(8,180-spd*18);
  const cellSize=(Z.rad*2/ROWS)*1000;
  const rlBoost = msnNum === 2 ? 1.3 : msnNum >= 3 ? 1.6 : 1.0;
  return Math.round((cellSize/msPerTick)*3600/1000 * rlBoost);
}

let CELL=24;
let gc = null, gx = null;

function initCanvasContext(){
  if(!gc) gc = document.getElementById('gc');
  if(gc && !gx) gx = gc.getContext('2d');
}

function setupCanvas(){
  initCanvasContext();
  if(!gc || !gx) return;
  const cw=window.innerWidth-410, ch=window.innerHeight-90;
  CELL=Math.max(10,Math.floor(Math.min(cw/COLS,ch/ROWS)));
  gc.width=COLS*CELL; gc.height=ROWS*CELL;
  const mapWrap = document.querySelector('.map-wrap');
  if(mapWrap){
    mapWrap.style.width = gc.width + 'px';
    mapWrap.style.height = gc.height + 'px';
  }
  if(leafletMap && renderMode==='sat'){
    leafletMap.invalidateSize();
  }
}

function drawDrone3D(px,py,color,size,rotAngle,bobPhase,status){
  gx.save();
  const bob=Math.sin(bobPhase)*size*0.08;
  gx.translate(px,py+bob);
  const dc=status==='RTB'?'#ff8c00':status==='RECHARGING'?'#00d4ff':status==='RETURNING'?'#a855f7':color;
  const bodyR=Math.max(4.5,size*0.40);
  const armLen=bodyR*1.05;
  const rotorR=Math.max(2.2,bodyR*0.38);
  // Shadow
  gx.save();gx.translate(size*0.06,bodyR*0.65);
  gx.beginPath();gx.ellipse(0,0,bodyR*1.15,bodyR*0.28,0,0,Math.PI*2);
  gx.fillStyle='rgba(0,0,0,0.28)';gx.fill();gx.restore();
  // Glow rings
  [3.0,2.2,1.5].forEach((s,i)=>{
    gx.beginPath();gx.arc(0,0,bodyR*s,0,Math.PI*2);
    gx.strokeStyle=dc+['0e','1a','2e'][i];gx.lineWidth=i===0?3:i===1?2:1;gx.stroke();
  });
  // 4 Arms
  for(let i=0;i<4;i++){
    const armAngle=i*(Math.PI/2)+rotAngle;
    const ax=Math.cos(armAngle)*armLen,ay=Math.sin(armAngle)*armLen;
    const perspScale=1-Math.abs(Math.sin(armAngle))*0.12;
    gx.save();gx.scale(1,perspScale);
    const armGrad=gx.createLinearGradient(0,0,ax,ay);
    armGrad.addColorStop(0,dc+'80');armGrad.addColorStop(1,dc+'cc');
    gx.strokeStyle=armGrad;gx.lineWidth=Math.max(1.5,size*0.1);gx.lineCap='round';
    gx.beginPath();gx.moveTo(0,0);gx.lineTo(ax,ay);gx.stroke();
    gx.beginPath();gx.arc(ax,ay,Math.max(1.5,bodyR*0.22),0,Math.PI*2);
    const mGrad=gx.createRadialGradient(ax-1,ay-1,0.5,ax,ay,bodyR*0.22);
    mGrad.addColorStop(0,'#fff');mGrad.addColorStop(0.4,dc);mGrad.addColorStop(1,dc+'88');
    gx.fillStyle=mGrad;gx.fill();
    gx.save();gx.translate(ax,ay);
    gx.beginPath();gx.ellipse(0,0,rotorR,rotorR*0.38,armAngle,0,Math.PI*2);
    gx.fillStyle=dc+'22';gx.fill();gx.strokeStyle=dc+'55';gx.lineWidth=0.8;gx.stroke();
    for(let b=0;b<3;b++){
      const ba=b*(Math.PI*2/3)+rotAngle*4;
      gx.beginPath();gx.moveTo(0,0);gx.lineTo(Math.cos(ba)*rotorR,Math.sin(ba)*rotorR*0.38);
      gx.strokeStyle=dc+'70';gx.lineWidth=1.2;gx.stroke();
    }
    gx.restore();gx.restore();
  }
  // Body
  const bodyGrad=gx.createRadialGradient(-bodyR*.28,-bodyR*.28,0,0,0,bodyR);
  bodyGrad.addColorStop(0,'#ffffff');bodyGrad.addColorStop(0.25,dc);
  bodyGrad.addColorStop(0.7,dc+'cc');bodyGrad.addColorStop(1,dc+'55');
  gx.beginPath();gx.arc(0,0,bodyR,0,Math.PI*2);
  gx.shadowColor=dc;gx.shadowBlur=size*0.5;gx.fillStyle=bodyGrad;gx.fill();gx.shadowBlur=0;
  gx.strokeStyle='rgba(0,0,0,0.5)';gx.lineWidth=1.2;
  gx.beginPath();gx.moveTo(-bodyR*.6,0);gx.lineTo(bodyR*.6,0);gx.stroke();
  gx.beginPath();gx.moveTo(0,-bodyR*.6);gx.lineTo(0,bodyR*.6);gx.stroke();
  // Camera
  gx.beginPath();gx.arc(0,bodyR*.35,bodyR*0.22,0,Math.PI*2);
  const camGrad=gx.createRadialGradient(-bodyR*.06,bodyR*.3,0.5,0,bodyR*.35,bodyR*0.22);
  camGrad.addColorStop(0,'#80e0ff');camGrad.addColorStop(1,'#004488');
  gx.fillStyle=camGrad;gx.fill();gx.strokeStyle=dc+'60';gx.lineWidth=0.8;gx.stroke();
  // Landing gear
  [[-bodyR*.42,bodyR*.15],[bodyR*.42,bodyR*.15]].forEach(([lx,ly])=>{
    gx.strokeStyle=dc+'55';gx.lineWidth=1;
    gx.beginPath();gx.moveTo(lx,ly);gx.lineTo(lx*0.8,bodyR*0.75);gx.stroke();
  });
  gx.beginPath();gx.moveTo(-bodyR*.42,bodyR*0.75);gx.lineTo(bodyR*.42,bodyR*0.75);
  gx.strokeStyle=dc+'44';gx.lineWidth=1;gx.stroke();
  gx.restore();
}

// ═══════════════════════════════════════════════════════════
// MAP DRAWING
// ═══════════════════════════════════════════════════════════
function drawMap(){
  initCanvasContext();
  if(!gc || !gx) return;
  if(renderMode === 'sat'){
    gx.clearRect(0,0,gc.width,gc.height);
  } else {
    gx.fillStyle='#04060f';
    gx.fillRect(0,0,gc.width,gc.height);
  }

  for(let r=0;r<ROWS;r++) for(let c=0;c<COLS;c++){
    const x=c*CELL, y=r*CELL;
    if(fogGrid[r] && fogGrid[r][c]){
      gx.fillStyle = renderMode==='sat' ? 'rgba(7,14,35,0.78)' : '#0b1225';
      gx.fillRect(x,y,CELL,CELL);
      gx.strokeStyle='rgba(255,255,255,.04)'; gx.lineWidth=.4; gx.strokeRect(x,y,CELL,CELL);
      continue;
    }
    const v = liveGrid[r] ? liveGrid[r][c] : FREE;
    const dg = MEM.getDanger(r,c);
    if(dg>0 && v!==OBS && v!==NOFLY){
      gx.fillStyle=`rgba(255,68,102,${Math.min(.14,dg/200)})`; gx.fillRect(x,y,CELL,CELL);
    }
    if(v===OBS){
      gx.fillStyle='rgba(255,68,102,.28)'; gx.fillRect(x+1,y+1,CELL-2,CELL-2);
      gx.strokeStyle='#ff4466'; gx.lineWidth=1.2; gx.strokeRect(x+1,y+1,CELL-2,CELL-2);
      gx.beginPath(); gx.moveTo(x+3,y+3); gx.lineTo(x+CELL-3,y+CELL-3); gx.stroke();
      gx.beginPath(); gx.moveTo(x+CELL-3,y+3); gx.lineTo(x+3,y+CELL-3); gx.stroke();
    } else if(v===NOFLY){
      gx.fillStyle='rgba(255,140,0,.15)'; gx.fillRect(x,y,CELL,CELL);
      gx.save(); gx.strokeStyle='rgba(255,140,0,.28)'; gx.lineWidth=.5;
      for(let i=-CELL;i<CELL*2;i+=5){ gx.beginPath(); gx.moveTo(x+i,y); gx.lineTo(x+i+CELL,y+CELL); gx.stroke(); }
      gx.restore();
      gx.strokeStyle='rgba(255,140,0,.6)'; gx.lineWidth=.6; gx.strokeRect(x,y,CELL,CELL);
    } else if(v===VISITED){
      gx.fillStyle = renderMode==='sat' ? 'rgba(0,245,160,0.18)' : '#001508';
      gx.fillRect(x+1,y+1,CELL-2,CELL-2);
    }
  }

  // Grid lines
  gx.strokeStyle = renderMode==='sat' ? 'rgba(255,255,255,.20)' : 'rgba(0,212,255,.22)';
  gx.lineWidth=.6;
  for(let r=0;r<=ROWS;r++){gx.beginPath();gx.moveTo(0,r*CELL);gx.lineTo(COLS*CELL,r*CELL);gx.stroke();}
  for(let c=0;c<=COLS;c++){gx.beginPath();gx.moveTo(c*CELL,0);gx.lineTo(c*CELL,ROWS*CELL);gx.stroke();}

  // Swarm sector dividers
  for(let i=1;i<nDrones;i++){
    const x=Math.floor(i*COLS/nDrones)*CELL;
    gx.strokeStyle='rgba(0,245,160,.35)'; gx.lineWidth=1.2; gx.setLineDash([4,4]);
    gx.beginPath(); gx.moveTo(x,0); gx.lineTo(x,gc.height); gx.stroke();
    gx.setLineDash([]);
  }

  // Known obstacles from memory
  MEM.knownObs.forEach(([r,c])=>{
    if(fogGrid[r] && fogGrid[r][c]) return;
    const x=c*CELL,y=r*CELL;
    gx.fillStyle='rgba(168,85,247,.20)'; gx.fillRect(x+1,y+1,CELL-2,CELL-2);
    gx.strokeStyle='rgba(168,85,247,.75)'; gx.lineWidth=1; gx.strokeRect(x+1,y+1,CELL-2,CELL-2);
  });

  // Base Helipad
  gx.fillStyle='rgba(0,245,160,.28)'; gx.fillRect(0,0,CELL,CELL);
  gx.strokeStyle='rgba(0,245,160,.9)'; gx.lineWidth=1.8; gx.strokeRect(0,0,CELL,CELL);
  gx.fillStyle='#00f5a0'; gx.font=`bold ${Math.max(8,CELL*.42)}px Share Tech Mono`;
  gx.textAlign='center'; gx.fillText('H',CELL/2,CELL*.72); gx.textAlign='left';

  // Drone trails
  drones.forEach(d=>{
    if(d.trail.length<2) return;
    const tr=d.trail;
    const grad=gx.createLinearGradient(tr[0][1]*CELL+CELL/2,tr[0][0]*CELL+CELL/2,tr[tr.length-1][1]*CELL+CELL/2,tr[tr.length-1][0]*CELL+CELL/2);
    grad.addColorStop(0,'transparent'); grad.addColorStop(1,d.color+'77');
    gx.beginPath();gx.moveTo(tr[0][1]*CELL+CELL/2,tr[0][0]*CELL+CELL/2);
    tr.forEach(p=>gx.lineTo(p[1]*CELL+CELL/2,p[0]*CELL+CELL/2));
    gx.strokeStyle=grad; gx.lineWidth=1.6; gx.stroke();
  });

  // Drones
  drones.forEach(d=>{
    if(d.status==='DONE') return;
    const [dr,dc]=d.pos;
    const px=dc*CELL+CELL/2, py=dr*CELL+CELL/2;
    drawDrone3D(px,py,d.color,CELL,d.rotAngle,d.bobPhase,d.status);
    const lc=d.status==='RTB'?'#ff8c00':d.status==='RECHARGING'?'#00d4ff':d.status==='RETURNING'?'#a855f7':d.color;
    gx.fillStyle=lc; gx.font=`bold ${Math.max(6,CELL*.26)}px Orbitron,Share Tech Mono`;
    gx.textAlign='center';
    gx.fillText(d.name.split('-')[1],px,py-CELL*.52);
    if(d.status==='RTB'||d.status==='RETURNING'){
      gx.font=`${Math.max(5,CELL*.2)}px Share Tech Mono`;
      gx.fillText(d.status==='RTB'?'RTB↩':'HOME↩',px,py+CELL*.6);
    }
  });
  gx.textAlign='left';
}

// ═══════════════════════════════════════════════════════════
// HUD UPDATE
// ═══════════════════════════════════════════════════════════
function updateHUD(){
  const act=drones.filter(d=>['ACTIVE','RTB','RETURNING','RECHARGING'].includes(d.status)).length;
  const actEl = document.getElementById('vAct');
  if(actEl) actEl.textContent=act;
  
  let vis=0,tot=0;
  for(let r=0;r<ROWS;r++) for(let c=0;c<COLS;c++){
    if(liveGrid[r] && liveGrid[r][c]!==OBS && liveGrid[r][c]!==NOFLY) tot++;
    if(liveGrid[r] && (liveGrid[r][c]===VISITED||liveGrid[r][c]===START)) vis++;
  }
  const covPct=tot>0?(vis/tot*100):0;
  const covEl = document.getElementById('vCov');
  if(covEl) covEl.textContent=covPct.toFixed(1)+'%';
  const covBar=document.getElementById('covBar');
  if(covBar) covBar.style.width=covPct+'%';
  
  const fogCleared=fogGrid.flat().filter(f=>!f).length;
  const fogEl = document.getElementById('vFog');
  if(fogEl) fogEl.textContent=(fogCleared/(ROWS*COLS)*100).toFixed(1)+'%';
  
  const repEl = document.getElementById('vRep');
  if(repEl) repEl.textContent=totalReplan;
  const koEl = document.getElementById('vKO');
  if(koEl) koEl.textContent=MEM.knownObs.length;
  const dzEl = document.getElementById('vDZ');
  if(dzEl) dzEl.textContent=MEM.dangerCells();
  const qsEl = document.getElementById('vQS');
  if(qsEl) qsEl.textContent=MEM.qSize();
  const epsEl = document.getElementById('vEps');
  if(epsEl) epsEl.textContent=getEps().toFixed(2);
  const tagEl = document.getElementById('msnTag');
  if(tagEl) tagEl.textContent=`ROUND ${msnNum}`;
  
  const totalMoves=totalStraightMoves+totalTurnMoves;
  const strEl = document.getElementById('vStraight');
  if(strEl) strEl.textContent=totalStraightMoves;
  const turnEl = document.getElementById('vTurns');
  if(turnEl) turnEl.textContent=totalTurnMoves;
  const engEl = document.getElementById('vEnergy');
  if(engEl) engEl.textContent=totalEnergyUsed.toFixed(0)+' units';
  const timeEl = document.getElementById('vTime');
  if(timeEl) timeEl.textContent=`${missionElapsedTime}s`;

  const effPct=totalMoves>0?Math.min(98, Math.round(((totalStraightMoves*1.0)/(totalStraightMoves*1.0 + totalTurnMoves*1.5 + totalReplan*5.0))*100)):0;
  const effEl = document.getElementById('vEff');
  if(effEl) effEl.textContent=effPct+'%';
  const effBar=document.getElementById('effBar');
  if(effBar){
    effBar.style.width=effPct+'%';
    effBar.style.background=effPct>80?'var(--g)':effPct>65?'var(--gd)':'var(--o)';
  }
  const safeEl=document.getElementById('vSafe');
  if(safeEl) safeEl.textContent=MEM.knownObs.length>0?`✓ ${MEM.knownObs.length} OBS AVOIDED`:'✓ ACTIVE';

  drones.forEach(d=>{
    const el=document.getElementById('dc'+d.idx); if(!el)return;
    const pct=Math.max(0,d.batt/MAX_BATT*100);
    el.querySelector('.badge').textContent=d.status;
    el.querySelector('.badge').style.borderColor=d.color;
    el.querySelector('.badge').style.color=d.color;
    el.querySelector('.battval').textContent=pct.toFixed(0)+'%';
    const bf=el.querySelector('.battfill');
    bf.style.width=pct+'%';
    const bc=pct<12?'#ff4466':pct<40?'#ff8c00':d.color;
    bf.style.background=bc;
    const sv=el.querySelector('.speedval');
    if(sv) sv.textContent=d.speedKmh>0?`${d.speedKmh} km/h`:'0 km/h';
    el.className='dcard'+(d.status==='RTB'?' rtb':d.status==='RETURNING'?' returning':d.status==='RECHARGING'?' recharging':d.status==='DONE'?' done':'');
    if(d.status!=='DONE') el.style.borderColor=d.color+'40';
    el.querySelector('.replct').textContent=d.replanCount;
  });

  const lead=drones.find(d=>d.status==='ACTIVE')||drones[0];
  if(lead){
    const {lat,lng}=Z.cellLatLng(lead.pos[0],lead.pos[1]);
    const cbar = document.getElementById('cbar');
    if(cbar) cbar.textContent=`[ ${lead.name} | ${fmtCoord(lat,true)} | ${fmtCoord(lng,false)} | ALT:${Z.alt}m | ACTIVE:${act}/${nDrones} ]`;
  }
}

// ═══════════════════════════════════════════════════════════
// THREAT HEATMAP
// ═══════════════════════════════════════════════════════════
function drawHeatmap(){
  const hc=document.getElementById('heatCanvas');
  if(!hc) return;
  const hx=hc.getContext('2d');
  const cw=hc.width/COLS, ch=hc.height/ROWS;
  let maxD=1;
  for(let r=0;r<ROWS;r++) for(let c=0;c<COLS;c++) maxD=Math.max(maxD,MEM.getDanger(r,c));
  hx.fillStyle='#04060f'; hx.fillRect(0,0,hc.width,hc.height);
  const obsSet=new Set(MEM.knownObs.map(([r,c])=>`${r},${c}`));
  for(let r=0;r<ROWS;r++) for(let c=0;c<COLS;c++){
    const x=c*cw, y=r*ch;
    const inFog=fogGrid[r] && fogGrid[r][c];
    const dg=MEM.getDanger(r,c);
    const isKnownObs=obsSet.has(`${r},${c}`);
    const isGridObs=liveGrid[r]&&liveGrid[r][c]===OBS;
    if(isKnownObs||isGridObs){
      hx.fillStyle=inFog?'rgba(255,68,102,0.5)':'rgba(255,68,102,0.9)';
      hx.fillRect(x,y,cw,ch);
      hx.strokeStyle=inFog?'rgba(255,68,102,0.35)':'rgba(255,100,120,0.8)';
      hx.lineWidth=0.7;
      hx.beginPath();hx.moveTo(x+1,y+1);hx.lineTo(x+cw-1,y+ch-1);hx.stroke();
      hx.beginPath();hx.moveTo(x+cw-1,y+1);hx.lineTo(x+1,y+ch-1);hx.stroke();
    } else if(dg>0){
      const ratio=dg/maxD;
      const alpha=inFog?ratio*0.42:ratio*0.82;
      hx.fillStyle=`rgba(255,${Math.floor(68*(1-ratio))},${Math.floor(102*(1-ratio))},${alpha})`;
      hx.fillRect(x,y,cw,ch);
    } else if(inFog){
      hx.fillStyle='#080e1e'; hx.fillRect(x,y,cw,ch);
    } else {
      hx.fillStyle='#001508'; hx.fillRect(x,y,cw,ch);
    }
  }
  drones.forEach(d=>{
    if(d.status==='DONE') return;
    const [dr,dc]=d.pos;
    hx.beginPath();hx.arc(dc*cw+cw/2,dr*ch+ch/2,Math.max(1.5,cw*.38),0,Math.PI*2);
    hx.fillStyle=d.color+'cc'; hx.fill();
  });
  hx.strokeStyle='rgba(26,37,64,.18)'; hx.lineWidth=.25;
  for(let r=0;r<=ROWS;r++){hx.beginPath();hx.moveTo(0,r*ch);hx.lineTo(hc.width,r*ch);hx.stroke();}
  for(let c=0;c<=COLS;c++){hx.beginPath();hx.moveTo(c*cw,0);hx.lineTo(c*cw,hc.height);hx.stroke();}
  const sub=document.getElementById('heatSub');
  if(sub){
    const o=MEM.knownObs.length, d2=MEM.dangerCells();
    sub.textContent=o>0||d2>0?`${o} OBS · ${d2} DANGER ZONES IN MEMORY`:'NO THREAT DATA YET';
  }
}

// ═══════════════════════════════════════════════════════════
// MISSION SETUP
// ═══════════════════════════════════════════════════════════
function initMission(){
  baseGrid=buildBaseGrid();
  liveGrid=baseGrid.map(r=>[...r]);
  fogGrid=buildFogGrid();
  const memLoaded=preloadMemory(liveGrid);
  if(memLoaded>0){
    log(`🧠 Memory: ${memLoaded} obstacles pre-avoided`,'mem');
    showHint(`MEMORY: ${memLoaded} OBS PRE-AVOIDED`,'mem');
  }
  
  dynObsSchedule={};
  const FIXED_DYN=[[3,10],[7,14]];
  FIXED_DYN.forEach((obs,i)=>{
    const [or,oc]=obs;
    if(!MEM.knownObs.find(o=>o[0]===or&&o[1]===oc)){
      dynObsSchedule[110+i*140]=obs;
    }
  });

  globalTick=0;
  missionStartTime=0;
  missionElapsedTime='0.0';
  drones=[]; for(let i=0;i<nDrones;i++) drones.push(makeDrone(i));
  drones.forEach(d => revealFog(d.pos[0], d.pos[1]));
  totalReplan=0; running=false; paused=false;
  totalStraightMoves=0; totalTurnMoves=0; totalEnergyUsed=0; totalSteps=0;
  prevDroneDirections={};
  
  renderDroneCards(); drawMap(); drawHeatmap(); updateHUD();
  
  const tagEl = document.getElementById('topTag');
  if(tagEl) tagEl.textContent=`GARUDA ${nDrones}-DRONE | Q-LEARNING + BOUSTROPHEDON | ${activeMissionName} | ROUND ${msnNum}`;
  const lBtn = document.getElementById('launchBtn');
  if(lBtn) lBtn.disabled=false;
  const pBtn = document.getElementById('pauseBtn');
  if(pBtn) pBtn.disabled=true;
  const nBtn = document.getElementById('nextBtn');
  if(nBtn) nBtn.disabled=true;
  const pTxt = document.getElementById('pauseTxt');
  if(pTxt) pTxt.textContent='⏸ PAUSE';

  const relBtn = document.getElementById('relaunchBtn');
  if(relBtn) relBtn.style.display = MEM.msnHistory.length>0 ? 'block' : 'none';
}

function renderDroneCards(){
  const dc = document.getElementById('droneCards');
  if(!dc) return;
  dc.innerHTML=
    `<div class="sec-title">◈ DRONE STATUS</div>`+
    drones.map(d=>`
      <div class="dcard" id="dc${d.idx}" style="border-color:${d.color}40">
        <div class="dcard-hd">
          <span class="dname" style="color:${d.color}">${d.name}</span>
          <span class="badge" style="border-color:${d.color};color:${d.color}">READY</span>
        </div>
        <div class="kv"><span>BATTERY</span><span class="val battval" style="color:${d.color}">100%</span></div>
        <div class="battbar"><div class="battfill" style="width:100%;background:${d.color}"></div></div>
        <div class="kv"><span>SPEED</span><span class="val speedval" style="color:${d.color}">0 km/h</span></div>
        <div class="kv"><span>REPLANNINGS</span><span class="val replct" style="color:${d.color}">0</span></div>
      </div>`).join('');
}

// ═══════════════════════════════════════════════════════════
// SWARM EXECUTION
// ═══════════════════════════════════════════════════════════
function doLaunch(){
  document.getElementById('launchBtn').disabled=true;
  const relBtn = document.getElementById('relaunchBtn');
  if(relBtn) relBtn.disabled=true;
  document.getElementById('pauseBtn').disabled=false;
  drones.forEach(d=>d.status='ACTIVE');
  running=true;
  missionStartTime=Date.now();
  log(`🚀 Swarm launched for Round ${msnNum}! ε=${getEps().toFixed(2)}`,'ok');
  toast(`🚀 SWARM LAUNCHED — ROUND ${msnNum} IN PROGRESS`,'ok');
  speak(`Launching drone swarm. Round ${msnNum} active.`);
  startTimer();
}

function startTimer(){
  if(simTimer) clearInterval(simTimer);
  const spdEl = document.getElementById('spdSlider');
  const spd = spdEl ? +spdEl.value : 5;
  simTimer=setInterval(gameTick, Math.max(8,180-spd*18));
}

function gameTick(){
  if(paused||!running) return;
  globalTick++;
  if(missionStartTime>0){
    missionElapsedTime = ((Date.now() - missionStartTime) / 1000).toFixed(1);
  }
  if(dynObsSchedule[globalTick]){
    const [or,oc]=dynObsSchedule[globalTick];
    delete dynObsSchedule[globalTick];
    if(liveGrid[or] && liveGrid[or][oc]===FREE){
      liveGrid[or][oc]=OBS; baseGrid[or][oc]=OBS;
      MEM.learnObstacle(or,oc);
      log(`⊕ Auto-obstacle detected at [${or},${oc}]`,'al');
      showHint(`OBSTACLE DETECTED [${or},${oc}]`,'al');
      toast(`⊕ OBSTACLE DETECTED AT [${or},${oc}]`,'al');
      speak(`Obstacle detected at grid ${or}, ${oc}. Dynamic replanning.`);
      let n=0;
      drones.forEach(od=>{
        if(od.status==='ACTIVE'){
          const remaining=od.path.slice(od.pathIdx);
          if(remaining.some(p=>p[0]===or&&p[1]===oc)||(od.pos[0]===or&&od.pos[1]===oc)){
            od.path=buildSectorPath(liveGrid,od.idx,nDrones,od.pos[0],od.pos[1]);
            od.pathIdx=0; od.replanCount++; totalReplan++; n++;
            log(`↺ ${od.name} replanned from [${od.pos}]`,'al');
          }
        }
      });
      drawHeatmap();
    }
  }
  drones.forEach(d=>tickDrone(d));
  drawMap(); updateHUD();
  if(drones.every(d=>d.status==='DONE'||d.batt<=0)) missionComplete();
}

function togglePause(){
  paused=!paused;
  document.getElementById('pauseTxt').textContent=paused?'▶ RESUME':'⏸ PAUSE';
  log(paused?'⏸ Mission paused':'▶ Mission resumed', paused?'w':'inf');
}

// ═══════════════════════════════════════════════════════════
// HIGH DEFINITION LEARNING CURVE LINE CHART (CANVAS 2D)
// ═══════════════════════════════════════════════════════════
function drawLearningCurveGraph(){
  const canvas = document.getElementById('lcGraphCanvas');
  if(!canvas) return;
  const ctx = canvas.getContext('2d');
  const w = canvas.width, h = canvas.height;
  ctx.clearRect(0,0,w,h);

  // Background
  ctx.fillStyle = '#020408'; ctx.fillRect(0,0,w,h);

  // Grid lines
  ctx.strokeStyle = 'rgba(26,37,64,0.45)'; ctx.lineWidth = 0.5;
  for(let y=30; y<h-30; y+=35){
    ctx.beginPath(); ctx.moveTo(50,y); ctx.lineTo(w-30,y); ctx.stroke();
  }

  const hist = MEM.msnHistory;
  if(hist.length === 0){
    ctx.fillStyle = '#6080a0'; ctx.font = '10px Share Tech Mono'; ctx.textAlign = 'center';
    ctx.fillText('Complete Round 1 to view Reinforcement Learning curve', w/2, h/2);
    ctx.textAlign = 'left';
    return;
  }

  const padL = 60, padR = 40, padT = 36, padB = 32;
  const plotW = w - padL - padR;
  const plotH = h - padT - padB;
  const n = hist.length;

  const maxTime = Math.max(30, ...hist.map(m=>m.timeSec||20));

  const getX = (i) => n === 1 ? padL + plotW/2 : padL + (i / (n - 1)) * plotW;
  const getY_Eff = (eff) => padT + plotH - (Math.max(40, eff) / 100) * plotH;
  const getY_Time = (time) => padT + plotH - (time / (maxTime*1.2)) * plotH;

  // 1. Draw Efficiency Area & Line (GREEN)
  ctx.strokeStyle = '#00f5a0'; ctx.lineWidth = 2.8; ctx.beginPath();
  hist.forEach((m, i)=>{
    const x = getX(i), y = getY_Eff(m.eff);
    if(i===0) ctx.moveTo(x,y); else ctx.lineTo(x,y);
  });
  ctx.stroke();

  // Gradient fill for Efficiency
  ctx.lineTo(getX(n-1), padT+plotH); ctx.lineTo(getX(0), padT+plotH); ctx.closePath();
  const gradEff = ctx.createLinearGradient(0,padT,0,padT+plotH);
  gradEff.addColorStop(0,'rgba(0,245,160,0.22)'); gradEff.addColorStop(1,'transparent');
  ctx.fillStyle = gradEff; ctx.fill();

  // 2. Draw Flight Time Line (CYAN)
  ctx.strokeStyle = '#00d4ff'; ctx.lineWidth = 2.2; ctx.setLineDash([5,3]); ctx.beginPath();
  hist.forEach((m, i)=>{
    const x = getX(i), y = getY_Time(m.timeSec||0);
    if(i===0) ctx.moveTo(x,y); else ctx.lineTo(x,y);
  });
  ctx.stroke(); ctx.setLineDash([]);

  // 3. Draw Data Points & Non-overlapping Labels
  hist.forEach((m, i)=>{
    const x = getX(i);
    const yEff = getY_Eff(m.eff);
    const yTime = getY_Time(m.timeSec||0);

    // Efficiency Node
    ctx.beginPath(); ctx.arc(x, yEff, 4.5, 0, Math.PI*2);
    ctx.fillStyle = '#00f5a0'; ctx.fill();
    ctx.fillStyle = '#020408'; ctx.beginPath(); ctx.arc(x, yEff, 2, 0, Math.PI*2); ctx.fill();

    // Time Node
    ctx.beginPath(); ctx.arc(x, yTime, 4, 0, Math.PI*2);
    ctx.fillStyle = '#00d4ff'; ctx.fill();

    // Round number on bottom axis
    ctx.fillStyle = '#80a0c0'; ctx.font = 'bold 9px Share Tech Mono'; ctx.textAlign = 'center';
    ctx.fillText(`R${m.m}`, x, h - 10);

    // Efficiency label (Above Green line)
    ctx.fillStyle = '#00f5a0'; ctx.font = 'bold 9px Share Tech Mono';
    ctx.fillText(`${m.eff}%`, x, yEff - 9);

    // Time label (Below Cyan line)
    ctx.fillStyle = '#00d4ff'; ctx.font = '9px Share Tech Mono';
    ctx.fillText(`${m.timeSec}s`, x, yTime + 15);
  });

  // 4. Draw Header Legend
  ctx.textAlign = 'left';
  ctx.fillStyle = '#00f5a0'; ctx.fillRect(padL, 12, 10, 10);
  ctx.fillStyle = '#a0c0e0'; ctx.font = '9px Share Tech Mono'; ctx.fillText('PATH EFFICIENCY % (CLIMBING ▲)', padL + 16, 20);

  ctx.fillStyle = '#00d4ff'; ctx.fillRect(padL + 250, 12, 10, 10);
  ctx.fillStyle = '#a0c0e0'; ctx.font = '9px Share Tech Mono'; ctx.fillText('FLIGHT TIME IN SECONDS (DROPPING ▼)', padL + 266, 20);
}

function renderLearningCurveMetrics(){
  const curveEl = document.getElementById('curveMetricsGrid');
  if(!curveEl) return;
  if(MEM.msnHistory.length === 0){ curveEl.innerHTML = ''; return; }
  
  const m1 = MEM.msnHistory[0];
  const cur = MEM.msnHistory[MEM.msnHistory.length-1];
  const effGain = cur.eff - m1.eff;
  const timeSaved = m1.timeSec > 0 ? Math.round(((m1.timeSec - cur.timeSec)/m1.timeSec)*100) : 0;
  const turnsReduced = m1.turns - cur.turns;
  const replansEliminated = m1.replan - cur.replan;

  curveEl.innerHTML = `
    <div class="curve-card">
      <div class="curve-card-hd">
        <span>⚡ PATH EFFICIENCY</span>
        <b style="color:var(--g)">${cur.eff}% ${effGain>0?`(+${effGain}%)`:'(Base)'}</b>
      </div>
      <div class="curve-track"><div class="curve-fill" style="width:${cur.eff}%;background:var(--g)"></div></div>
    </div>

    <div class="curve-card">
      <div class="curve-card-hd">
        <span>⏱️ FLIGHT TIME REDUCTION</span>
        <b style="color:var(--b)">${cur.timeSec}s ${timeSaved>0?`(-${timeSaved}% faster)`:'(Base)'}</b>
      </div>
      <div class="curve-track"><div class="curve-fill" style="width:${Math.max(10, 100 - (cur.timeSec/(m1.timeSec||1))*40)}%;background:var(--b)"></div></div>
    </div>

    <div class="curve-card">
      <div class="curve-card-hd">
        <span>🔄 TURN MINIMIZATION</span>
        <b style="color:var(--pu)">${cur.turns} turns ${turnsReduced>0?`(-${turnsReduced} fewer)`:'(Base)'}</b>
      </div>
      <div class="curve-track"><div class="curve-fill" style="width:${Math.min(100, Math.round((cur.straight/(cur.turns+cur.straight))*100))}%;background:var(--pu)"></div></div>
    </div>

    <div class="curve-card">
      <div class="curve-card-hd">
        <span>🛡️ MID-AIR STALLS</span>
        <b style="color:${cur.replan===0?'var(--g)':'var(--r)'}">${cur.replan} stalls ${replansEliminated>0?`(-${replansEliminated} pre-avoided)`:cur.replan===0?'(Zero Stalls)':'(Encountered)'}</b>
      </div>
      <div class="curve-track"><div class="curve-fill" style="width:${cur.replan===0?100:30}%;background:${cur.replan===0?'var(--g)':'var(--r)'}"></div></div>
    </div>
  `;
}

// ═══════════════════════════════════════════════════════════
// MISSION COMPLETE & REPORT RENDERING
// ═══════════════════════════════════════════════════════════
function missionComplete(){
  clearInterval(simTimer); running=false;
  const timeTaken = parseFloat(missionElapsedTime) || 0;
  let vis=0,tot=0;
  for(let r=0;r<ROWS;r++) for(let c=0;c<COLS;c++){
    if(liveGrid[r] && liveGrid[r][c]!==OBS&&liveGrid[r][c]!==NOFLY)tot++;
    if(liveGrid[r] && (liveGrid[r][c]===VISITED||liveGrid[r][c]===START))vis++;
  }
  const cov=tot>0?(vis/tot*100):0;
  MEM.recordMission(cov, totalStraightMoves, totalTurnMoves, totalReplan, MEM.knownObs.length, totalSteps, totalEnergyUsed, timeTaken);
  updateMsnHistory();

  const curMsn = MEM.msnHistory[MEM.msnHistory.length-1];
  const effPct = curMsn ? curMsn.eff : 0;
  const m1 = MEM.msnHistory[0];
  const effDelta = m1 && curMsn && curMsn.m>1 ? curMsn.eff - m1.eff : null;

  document.getElementById('doneTitle').textContent = `ROUND ${msnNum} COMPLETE`;

  document.getElementById('doneGrid').innerHTML=`
    <div>① COVERAGE <b>${cov.toFixed(1)}%</b></div>
    <div>② EFFICIENCY <b style="color:${effPct>=80?'var(--g)':effPct>=65?'var(--gd)':'var(--o)'}">${effPct}%</b>${effDelta!==null?`<b style="color:${effDelta>0?'var(--g)':'var(--o)'}"> ${effDelta>0?'▲+':'▼'}${effDelta}%</b>`:''}</div>
    <div>③ FLIGHT TIME <b>${timeTaken.toFixed(1)}s</b></div>
    <div>④ REPLAN STALLS <b>${totalReplan}</b></div>
    <div>⑤ COMPLETED ROUNDS <b>${MEM.msnHistory.length}</b></div>
    <div>⑥ OBS PRE-AVOIDED <b>${MEM.knownObs.length}</b></div>
    <div>TOTAL STEPS <b>${totalSteps}</b></div>
    <div>STRAIGHT MOVES <b>${totalStraightMoves}</b></div>
    <div>TURN MOVES <b>${totalTurnMoves}</b></div>
    <div>ENERGY USED <b>${totalEnergyUsed.toFixed(0)} units</b></div>
    <div>Q-STATES LEARNED <b>${MEM.qSize()}</b></div>
    <div>EXPLORATION RATE ε <b>${getEps().toFixed(2)}</b></div>`;

  // Render Round-by-Round Progression Table
  const tableBody = document.getElementById('roundTableBody');
  if(tableBody){
    tableBody.innerHTML = MEM.msnHistory.map((m, idx)=>{
      const isBase = idx === 0;
      let deltaText = '<span style="color:var(--b)">Baseline Run (Exploration)</span>';
      if(!isBase){
        const effDiff = m.eff - m1.eff;
        const timeDiff = m1.timeSec > 0 ? Math.round(((m1.timeSec - m.timeSec)/m1.timeSec)*100) : 0;
        deltaText = `<span class="c-good">⚡ +${effDiff}% Eff | ${timeDiff>=0?timeDiff+'% Faster':Math.abs(timeDiff)+'% Slower'}</span>`;
      }
      return `
        <tr>
          <td><b class="c-val">Round ${m.m}</b> ${isBase?'(Initial)':''}</td>
          <td>${m.timeSec||0}s</td>
          <td class="c-good">${m.cov.toFixed(1)}%</td>
          <td class="c-good">${m.eff}%</td>
          <td>${m.steps} steps</td>
          <td>${m.turns} turns</td>
          <td class="${m.replan===0?'c-good':'c-bad'}">${m.replan===0?'0 stalls':m.replan+' stalls'}</td>
          <td>ε=${m.eps}</td>
          <td>${deltaText}</td>
        </tr>
      `;
    }).join('');
  }

  // Summary note
  let note='';
  if(msnNum === 1){
    note = `📊 <b>ROUND 1 (BASELINE EXPLORATION) FINISHED</b><br>
    The drones mapped the area with zero prior knowledge (ε=0.90) and experienced ${totalReplan} mid-air stalls due to dynamic obstacles.<br>
    Click <b>⚡ RELAUNCH MISSION</b> to run Round 2 and watch Q-Learning cruise faster and eliminate delays!`;
  } else {
    const timeSavings = m1 && m1.timeSec>0 ? Math.round(((m1.timeSec - timeTaken)/m1.timeSec)*100) : 0;
    note = `⚡ <b>ROUND ${msnNum} (WITH REINFORCEMENT LEARNING) FINISHED</b><br>
    ${timeSavings >= 0 ? `🚀 <b>${timeSavings}% Faster Flight Time</b>` : ''} · 🛡️ <b>${MEM.knownObs.length} Obstacles Pre-Avoided</b> · ⚡ <b>${effPct}% Path Efficiency</b><br>
    The swarm used its ${MEM.qSize()} learned Q-states to fly straight optimal corridors and eliminate replanning delays!`;
  }
  document.getElementById('doneNote').innerHTML = note;

  renderLearningCurveMetrics();
  saveActiveMissionToVault();
  toast(`✅ ROUND ${msnNum} COMPLETE — ${timeTaken.toFixed(1)}s · EFF:${effPct}%`,'ok');
  speak(`Round ${msnNum} complete. Efficiency ${effPct} percent.`);
  
  document.getElementById('doneOv').classList.add('show');
  document.getElementById('nextBtn').disabled=false;
  
  const relBtn = document.getElementById('relaunchBtn');
  if(relBtn) { relBtn.style.display='block'; relBtn.disabled=false; }
  
  setTimeout(drawLearningCurveGraph, 60);
  log(`✅ Round ${msnNum} done — ${timeTaken.toFixed(1)}s | Cov:${cov.toFixed(1)}% | Eff:${effPct}% | Replan:${totalReplan}`,'ok');
}

function relaunchSameZone(){
  document.getElementById('doneOv').classList.remove('show');
  msnNum++;
  initMission();
  updateMsnHistory();
  log(`⚡ RELAUNCHING SAME ZONE WITH LEARNED Q-TABLE — ROUND ${msnNum}`,'mem');
  toast(`⚡ RELAUNCHING WITH RL KNOWLEDGE (ROUND ${msnNum})`,'mem');
  setTimeout(doLaunch, 350);
}

function nextMission(){
  document.getElementById('doneOv').classList.remove('show');
  openNewMissionModal();
}

function setN(n){
  nDrones=n;
  document.querySelectorAll('.cnt-btn').forEach((b,i)=>b.classList.toggle('on',i===n-1));
  if(!running) initMission();
}

function fullReset(){
  clearInterval(simTimer); MEM.reset(); msnNum=1; nDrones=2; userPaints=[];
  obsMode=false; editMode=false;
  document.querySelectorAll('.cnt-btn').forEach((b,i)=>b.classList.toggle('on',i===1));
  document.getElementById('doneOv').classList.remove('show');
  document.getElementById('edbar').style.display='none';
  document.getElementById('editBtn').textContent='✏ EDIT MAP';
  document.getElementById('editBtn').classList.remove('active');
  document.getElementById('obsBtn').innerHTML='<span>🎯 PLACE OBSTACLE</span>';
  document.getElementById('obsBtn').className='btn bo';
  const relBtn = document.getElementById('relaunchBtn');
  if(relBtn) relBtn.style.display='none';
  initMission(); updateMsnHistory();
  saveActiveMissionToVault();
  log('↺ Full reset — all memory cleared','al');
}

function onSpeedChange(){
  if(running&&!paused) startTimer();
  const spd=calcSpeed();
  const el=document.getElementById('spdDisplay');
  if(el) el.textContent=`~${spd} km/h`;
}

function updateMsnHistory(){
  const el=document.getElementById('mhist');
  if(!el) return;
  if(!MEM.msnHistory.length){
    el.innerHTML='<div style="font-size:8px;color:var(--tx)">No rounds completed</div>';
    return;
  }
  el.innerHTML=MEM.msnHistory.map((m,i)=>{
    const prev=MEM.msnHistory[i-1];
    const rDelta=prev?prev.replan-m.replan:null;
    const rArrow=rDelta===null?''
      :rDelta>0?`<span style="color:var(--g)"> ▼${rDelta}rpl</span>`
      :rDelta<0?`<span style="color:var(--r)"> ▲${Math.abs(rDelta)}</span>`
      :`<span style="color:var(--tx)"> ─</span>`;
    const sDelta=prev?prev.steps-m.steps:null;
    const sArrow=sDelta===null?''
      :sDelta>0?`<span style="color:var(--g)"> ▼${sDelta}s</span>`
      :sDelta<0?`<span style="color:var(--r)"> ▲${Math.abs(sDelta)}</span>`:'';
    return `
    <div class="mhrow">
      <span style="min-width:26px;color:var(--tx)">R${m.m}</span>
      <div class="mhtrack"><div class="mhfill" style="width:${m.cov}%;background:${m.cov>90?'var(--g)':m.cov>75?'var(--gd)':'var(--o)'}"></div></div>
      <span style="min-width:28px;text-align:right;color:var(--g)">${m.cov.toFixed(0)}%</span>
    </div>
    <div style="font-size:7px;color:var(--tx);padding-left:26px;margin-bottom:5px">
      Time:${m.timeSec||0}s · Eff:${m.eff}% · Rpl:<span style="color:${m.replan===0?'var(--g)':m.replan<=1?'var(--gd)':'var(--r)'}">${m.replan}</span>${rArrow} · ${m.steps}s${sArrow}
    </div>`;
  }).join('');
}

// ═══════════════════════════════════════════════════════════
// OBSTACLE PLACEMENT
// ═══════════════════════════════════════════════════════════
let obsMode=false;

function toggleObsMode(){
  if(!running){ log('Launch mission first!','w'); return; }
  obsMode=!obsMode;
  const btn=document.getElementById('obsBtn');
  if(obsMode){
    btn.innerHTML='<span>✕ CANCEL PLACEMENT</span>'; btn.className='btn br';
    gc.style.cursor='crosshair';
    showHint('🎯 CLICK ANY REVEALED FREE CELL TO PLACE OBSTACLE','obs');
  } else {
    btn.innerHTML='<span>🎯 PLACE OBSTACLE</span>'; btn.className='btn bo';
    gc.style.cursor='default'; clearHint();
  }
}

function placeObstacle(r,c){
  if(r<0||r>=ROWS||c<0||c>=COLS) return;
  if(fogGrid[r] && fogGrid[r][c]){ showHint('CELL IN FOG — NOT YET REVEALED','al'); return; }
  if(r===0&&c===0){ showHint('CANNOT BLOCK HOME BASE','al'); return; }
  if(liveGrid[r] && (liveGrid[r][c]===OBS||liveGrid[r][c]===NOFLY)){ showHint(`[${r},${c}] ALREADY BLOCKED`,'w'); return; }
  if(liveGrid[r]) liveGrid[r][c]=OBS; 
  if(baseGrid[r]) baseGrid[r][c]=OBS;
  MEM.learnObstacle(r,c);
  let replanned=0;
  drones.forEach(d=>{
    if(d.status==='ACTIVE'){
      const remaining=d.path.slice(d.pathIdx);
      if(remaining.some(p=>p[0]===r&&p[1]===c)||(d.pos[0]===r&&d.pos[1]===c)){
        d.path=buildSectorPath(liveGrid,d.idx,nDrones,d.pos[0],d.pos[1]);
        d.pathIdx=0; d.replanCount++; totalReplan++; replanned++;
        log(`↺ ${d.name} replanned from [${d.pos[0]},${d.pos[1]}]`,'al');
      }
    } else if(d.status==='RTB' && d.rtbPath){
      if(d.rtbPath.slice(d.rtbIdx).some(p=>p[0]===r&&p[1]===c)){
        d.rtbPath=astar(liveGrid,d.pos[0],d.pos[1],0,0);
        d.rtbIdx=0; replanned++;
        log(`↺ ${d.name} RTB rerouted around obstacle`,'al');
      }
    } else if(d.status==='RETURNING' && d.homePath){
      if(d.homePath.slice(d.homeIdx).some(p=>p[0]===r&&p[1]===c)){
        d.homePath=astar(liveGrid,d.pos[0],d.pos[1],0,0);
        d.homeIdx=0; replanned++;
        log(`↺ ${d.name} Home path rerouted around obstacle`,'al');
      }
    }
  });
  const msg=replanned>0?`⊕ OBS [${r},${c}] → ${replanned} DRONE(S) REPLANNING`:`⊕ OBS [${r},${c}] → NO DRONES AFFECTED`;
  showHint(msg,'al'); drawHeatmap(); drawMap();
  log(msg, replanned>0?'al':'inf');
  obsMode=false;
  const obsBtn = document.getElementById('obsBtn');
  if(obsBtn){
    obsBtn.innerHTML='<span>🎯 PLACE OBSTACLE</span>';
    obsBtn.className='btn bo';
  }
  gc.style.cursor='default';
  setTimeout(clearHint, 2800);
}

// ═══════════════════════════════════════════════════════════
// MAP EDITOR
// ═══════════════════════════════════════════════════════════
let editMode=false, currentTool='nfz', mouseDown=false;

function toggleEdit(){
  editMode=!editMode;
  const edbar = document.getElementById('edbar');
  if(edbar) edbar.style.display=editMode?'flex':'none';
  const editBtn = document.getElementById('editBtn');
  if(editBtn){
    editBtn.textContent=editMode?'✕ CLOSE EDITOR':'✏ EDIT MAP';
    editBtn.classList.toggle('active',editMode);
  }
  gc.style.cursor=editMode?'crosshair':'default';
}

function setTool(t){
  currentTool=t;
  document.getElementById('tObs').classList.toggle('on',t==='obs');
  document.getElementById('tNfz').classList.toggle('on',t==='nfz');
  document.getElementById('tEra').classList.toggle('on',t==='era');
}

function cellFromEvent(e){
  const rect=gc.getBoundingClientRect();
  return [Math.floor((e.clientY-rect.top)/CELL), Math.floor((e.clientX-rect.left)/CELL)];
}

function applyPaint(r,c){
  if(r<0||r>=ROWS||c<0||c>=COLS||running) return;
  if(r===0&&c===0) return;
  userPaints=userPaints.filter(p=>!(p[0]===r&&p[1]===c));
  userPaints.push([r,c,currentTool]);
  if(liveGrid[r]) liveGrid[r][c]=currentTool==='obs'?OBS:currentTool==='nfz'?NOFLY:FREE;
  if(baseGrid[r]) baseGrid[r][c]=currentTool==='obs'?OBS:currentTool==='nfz'?NOFLY:FREE;
  if(fogGrid[r]) fogGrid[r][c]=false;
  if(currentTool==='obs') MEM.learnObstacle(r,c);
  else if(currentTool==='era'){ const k=`${r},${c}`; if(MEM.danger[k]) delete MEM.danger[k]; MEM.knownObs=MEM.knownObs.filter(o=>!(o[0]===r&&o[1]===c)); }
  drawMap(); drawHeatmap();
}

function clearEdits(){ userPaints=[]; initMission(); log('Editor cleared','w'); }

function initEventListeners(){
  initCanvasContext();
  if(gc){
    gc.addEventListener('mousedown',e=>{ if(obsMode&&running){ placeObstacle(...cellFromEvent(e)); return; } if(!editMode||running) return; mouseDown=true; applyPaint(...cellFromEvent(e)); });
    gc.addEventListener('mousemove',e=>{ if(mouseDown&&editMode&&!running) applyPaint(...cellFromEvent(e)); });
    gc.addEventListener('mouseup',()=>mouseDown=false);
    gc.addEventListener('mouseleave',()=>mouseDown=false);
  }
}

// ═══════════════════════════════════════════════════════════
// HINTS + LOG
// ═══════════════════════════════════════════════════════════
let hintTimer=null;
function showHint(msg,type='inf'){ const box=document.getElementById('hintBox'); if(!box)return; box.innerHTML=`<div class="hint hint-${type}">${msg}</div>`; if(hintTimer) clearTimeout(hintTimer); if(type!=='obs') hintTimer=setTimeout(clearHint,3000); }
function clearHint(){ const box=document.getElementById('hintBox'); if(box) box.innerHTML=''; }
function log(msg,type=''){ const el=document.createElement('div'); el.className='ei'+(type?' '+type:''); el.textContent=`[${new Date().toLocaleTimeString('en',{hour12:false})}] ${msg}`; const lg=document.getElementById('elog'); if(lg){ lg.insertBefore(el,lg.firstChild); while(lg.children.length>60) lg.removeChild(lg.lastChild); } }

// ═══════════════════════════════════════════════════════════
// SAFE INITIALIZATION
// ═══════════════════════════════════════════════════════════
function updateClock(){ 
  const el = document.getElementById('clk');
  if(el) el.textContent=new Date().toLocaleTimeString('en',{hour12:false}); 
}

function bootGaruda(){
  updateClock();
  setInterval(updateClock,1000);
  window.addEventListener('resize',()=>{ setupCanvas(); drawMap(); });

  try {
    const existingVault = getVault();
    const keys = Object.keys(existingVault);
    if(keys.length > 0){
      const latestId = keys[keys.length - 1];
      const m = existingVault[latestId];
      if(m){
        activeMissionId = m.id || ('msn_' + Date.now());
        activeMissionName = m.name || 'OPERATION DELTA';
        if(m.zone){
          Z.lat = m.zone.lat || 28.6139;
          Z.lng = m.zone.lng || 77.2090;
          Z.rad = m.zone.rad || 2;
          Z.alt = m.zone.alt || 120;
        }
        renderMode = m.renderMode || 'sim';
        MEM.Q = m.Q || {};
        MEM.danger = m.danger || {};
        MEM.knownObs = m.knownObs || [];
        MEM.msnHistory = m.msnHistory || [];
        MEM.msnEfficiency = m.msnEfficiency || [];
        msnNum = MEM.msnHistory.length + 1;
      }
    }
  } catch(e) {
    console.warn('Vault recovery fallback:', e);
  }

  const msnDisplay = document.getElementById('msnNameDisplay');
  if(msnDisplay) msnDisplay.textContent = activeMissionName.toUpperCase();

  setupCanvas();
  initEventListeners();
  initMission();
  updateMsnHistory();
  onSpeedChange();
  log('🦅 GARUDA-OPS v10 — ONLINE','ok');
  log('✅ Mission Gateway Hub Active | ✅ Learning Curve Graph Ready','inf');
  setTimeout(openHubModal, 350);
}

if(document.readyState === 'loading'){
  document.addEventListener('DOMContentLoaded', bootGaruda);
} else {
  bootGaruda();
}
