/* MOSAIC — frontend-only wellness experience */
(() => {
"use strict";

/* 0. BACKEND API CONNECTION */
const API_BASE_URL = "https://mosaic-production-6f14.up.railway.app";
const DEMO_USER_ID = "6d6ebef4-6b93-4071-be85-aa30281975fd";

async function callAPI(endpoint, options = {}) {
    try {
        const url = `${API_BASE_URL}${endpoint}`;
        const response = await fetch(url, {
            ...options,
            headers: {
                'Content-Type': 'application/json',
                ...(options.headers || {})
            }
        });
        return await response.json();
    } catch (error) {
        console.log('API call failed, using fallback:', error);
        return null;
    }
}

/* 1. GLOBAL STATE */
const DIMS = {
  sleep:{name:"Sleep",short:"Sleep",color:"#9B8FEF",bg:"#DCD6FF",icon:"moon",desc:"How rested do you generally feel?",low:"Very low",high:"Very rested",
    info:"Sleep plays an important role in recovery, attention and many everyday biological processes.",connections:["Recovery","Attention","Energy","Mood"]},
  movement:{name:"Movement",short:"Movement",color:"#73CDB0",bg:"#CDEFE4",icon:"footprints",desc:"How much movement feels present in your days?",low:"Very little",high:"Very active",
    info:"Movement can be part of everyday wellbeing, from activity breaks to walks and more structured exercise.",connections:["Energy","Mood","Routine","Connection"]},
  nutrition:{name:"Nutrition",short:"Nutrition",color:"#F4A982",bg:"#FFDCC8",icon:"salad",desc:"How supported does your everyday eating feel?",low:"Not supported",high:"Well supported",
    info:"Nutrition is one part of the broader pattern of eating, energy, routine and everyday wellbeing.",connections:["Energy","Routine","Recovery","Mood"]},
  stress:{name:"Stress",short:"Stress",color:"#8CCBFF",bg:"#CFE8FF",icon:"waves",desc:"How high does your stress feel lately?",low:"Very low",high:"Very high",
    info:"Stress can shape attention, recovery, routines and how everyday experiences feel. Individual responses vary.",connections:["Recovery","Attention","Sleep","Mood"]},
  social:{name:"Social connection",short:"Social",color:"#EFA0B7",bg:"#FFD5E1",icon:"heart-handshake",desc:"How connected do you feel to people you value?",low:"Very disconnected",high:"Very connected",
    info:"Connection is a meaningful part of everyday wellbeing and can include small moments of contact, belonging and support.",connections:["Mood","Joy","Support","Belonging"]},
  joy:{name:"Joy",short:"Joy",color:"#E8C95B",bg:"#FFF0B8",icon:"sparkles",desc:"How much room is there for enjoyment?",low:"Very little",high:"A lot",
    info:"Joy can include pleasure, curiosity, creativity, play and moments that feel meaningful or enjoyable.",connections:["Mood","Connection","Creativity","Energy"]}
};
const DIM_KEYS = Object.keys(DIMS);
const DEFAULTS = {sleep:0,movement:0,nutrition:0,stress:0,social:0,joy:0};
const DEMO = {sleep:5,movement:3,nutrition:7,stress:8,social:4,joy:5};
let state = {values:{...DEFAULTS}, before:{...DEFAULTS}, selected:"sleep", whatIf:"sleep", whatIfBefore:0, resetCompleted:false, reflection:[]};
let three = null, sceneNodes = [], dragging = false, dragStart = {x:0,y:0};
let breathInterval = null, movementInterval = null, breathRemaining = 60, movementRemaining = 120, movementDurationSec = 120;
const $ = s => document.querySelector(s), $$ = s => [...document.querySelectorAll(s)];
const safeNum = (v,f=0) => Number.isFinite(Number(v)) ? Number(v) : f;

/* 2. LOCAL STORAGE */
const STORE = "mosaic-wellbeing-v1";
function loadState(){
  try{const saved=JSON.parse(localStorage.getItem(STORE)||"null");if(saved?.values) state.values={...DEFAULTS,...saved.values};if(saved?.before)state.before={...state.values,...saved.before};if(Array.isArray(saved?.reflection))state.reflection=saved.reflection.slice(-7);}catch(_){}
}
function saveState(){
  try{localStorage.setItem(STORE,JSON.stringify({values:state.values,before:state.before,reflection:state.reflection}));}catch(_){}
}
function clearData(){
  try{localStorage.removeItem(STORE)}catch(_){}
  state.values={...DEFAULTS};state.before={...DEFAULTS};state.reflection=[];state.resetCompleted=false;
  renderSliders();renderSnapshot();renderBeforeAfter();renderTimeline();updateGuide();updatePersonal();updateWhatIf();
  toast("Your local MOSAIC data was cleared.");
}

/* 3. NAVIGATION */
function initNavigation(){
  const nav=$(".site-nav"), menu=$("#mobileMenu");
  window.addEventListener("scroll",()=>nav.classList.toggle("scrolled",scrollY>80),{passive:true});
  menu.addEventListener("click",()=>{const open=nav.classList.toggle("menu-open");menu.setAttribute("aria-expanded",String(open))});
  $$("#navLinks a").forEach(a=>a.addEventListener("click",()=>nav.classList.remove("menu-open")));
  $$("[data-scroll]").forEach(b=>b.addEventListener("click",()=>document.querySelector(b.dataset.scroll)?.scrollIntoView({behavior:"smooth"})));
}

/* 4. PROFILE SLIDERS */
function renderSliders(){
  const grid=$("#sliderGrid");grid.innerHTML="";
  DIM_KEYS.forEach(k=>{
    const d=DIMS[k],v=state.values[k];
    const card=document.createElement("article");card.className="slider-card";card.style.setProperty("--accent",d.color);card.innerHTML=`
      <div class="slider-head"><div class="slider-title"><span class="dim-icon" style="background:${d.bg};color:${d.color}"><i data-lucide="${d.icon}"></i></span><span>${d.name}</span></div><strong class="slider-value">${v}<small>/10</small></strong></div>
      <p class="slider-desc">${d.desc}</p>
      <input class="range" data-dim="${k}" type="range" min="0" max="10" step="1" value="${v}" aria-label="${d.name}, from 0 to 10" style="--fill:${v*10}%">
      <div class="range-ends"><span>${d.low}</span><span>${d.high}</span></div>`;
    grid.appendChild(card);
  });
  $$(".range").forEach(input=>input.addEventListener("input",e=>{
    const k=e.target.dataset.dim,v=safeNum(e.target.value);state.values[k]=v;
    e.target.style.setProperty("--fill",`${v*10}%`);
    e.target.closest(".slider-card").querySelector(".slider-value").innerHTML=`${v}<small>/10</small>`;
    renderSnapshot();updateEcosystem();updateGuide();updatePersonal();updateBeforeNow();saveState();
  }));
  icons();
}
function average(){return DIM_KEYS.reduce((a,k)=>a+safeNum(state.values[k]),0)/DIM_KEYS.length}
function renderSnapshot(){
  const avg=average();$("#overallScore").textContent=avg.toFixed(1);$("#scoreRing").style.setProperty("--score",`${avg*10}%`);
  $("#snapshotLabel").textContent=avg<4.5?"A gentle place to begin.":avg<6.5?"A balanced place to experiment.":"A strong snapshot to build from.";
}
/* 5.5 MICRO ACTIONS */
function getMicroActions(factor) {
    const actions = {
        sleep: [
            { icon: "🌙", label: "5-minute breathing reset", action: "startBreath()" },
            { icon: "📱", label: "Digital sunset: no screens 30 min before bed", action: "toast('Try a digital sunset!')" }
        ],
        stress: [
            { icon: "🧘", label: "60-second breathing reset", action: "startBreath()" },
            { icon: "💧", label: "Hydration pause", action: "startHydration()" }
        ],
        movement: [
            { icon: "🚶", label: "2-minute movement reset", action: "startMovement()" },
            { icon: "🧘", label: "Stand up and stretch", action: "toast('Stand up and stretch!')" }
        ],
        nutrition: [
            { icon: "🍎", label: "Add one serving of fruit today", action: "toast('Add a serving of fruit!')" },
            { icon: "💧", label: "Hydration check", action: "startHydration()" }
        ],
        social: [
            { icon: "💬", label: "Send a message to someone you value", action: "toast('Send that message!')" }
        ],
        joy: [
            { icon: "🎵", label: "5-minute joy mission", action: "document.querySelector('#joy').scrollIntoView({behavior:'smooth'})" }
        ]
    };
    return actions[factor] || [{ icon: "✨", label: "Explore this piece", action: "console.log('Explore')" }];
}
/* 5. ECOSYSTEM */
function selectDimension(k,fromThree=false){
  if(!DIMS[k])return;state.selected=k;$("#nodeKicker").textContent="SELECTED PIECE";$("#nodeName").textContent=DIMS[k].name;
  $("#nodeValue").textContent=`${state.values[k]}/10`;$("#nodeDescription").textContent=DIMS[k].info;
  const icon=$("#nodeIcon");icon.innerHTML=`<i data-lucide="${DIMS[k].icon}"></i>`;icon.style.background=DIMS[k].bg;icon.style.color=DIMS[k].color;
  $("#connectionList").innerHTML=DIMS[k].connections.map(x=>`<span>${x}</span>`).join("");
  $("#explorePiece").onclick=()=>{state.whatIf=k;setupWhatIf(k);document.querySelector("#whatif").scrollIntoView({behavior:"smooth"})};
  state.whatIf=k;setupWhatIf(k);icons();updateFallbackSelection();
  const actions=getMicroActions(k);
  const actionHtml=actions.map(a=>`<button class="micro-action" onclick="${a.action}">${a.icon} ${a.label}</button>`).join("");
  const microContainer=document.getElementById("microActions");
  if(microContainer){microContainer.innerHTML=actionHtml;}
}
function buildFallback(){
  const wrap=$("#fallbackEcosystem");wrap.innerHTML="";wrap.style.display="grid";
  const core=document.createElement("div");core.className="fallback-core";core.textContent="YOU";wrap.appendChild(core);
  const positions={sleep:[25,20],movement:[72,18],nutrition:[86,50],stress:[70,80],social:[27,80],joy:[12,50]};
  DIM_KEYS.forEach(k=>{
    const [x,y]=positions[k],n=document.createElement("button");n.className="fallback-node";n.dataset.dim=k;n.textContent=DIMS[k].short;n.style.left=`${x}%`;n.style.top=`${y}%`;n.style.transform="translate(-50%,-50%)";n.style.background=DIMS[k].bg;n.style.color=DIMS[k].color;n.addEventListener("click",()=>selectDimension(k));wrap.appendChild(n);
    const line=document.createElement("div");line.className="fallback-line";const dx=(x-50),dy=(y-50),len=Math.sqrt(dx*dx+dy*dy)*1.95;line.style.width=`${len}%`;line.style.left="50%";line.style.top="50%";line.style.transform=`rotate(${Math.atan2(dy,dx)*180/Math.PI}deg)`;wrap.insertBefore(line,n);
  });updateFallbackSelection();
}
function updateFallbackSelection(){
  $$(".fallback-node").forEach(n=>{const active=n.dataset.dim===state.selected;n.style.boxShadow=active?`0 0 0 6px ${DIMS[n.dataset.dim].color}33,0 14px 30px rgba(40,48,68,.1)`:"0 10px 20px rgba(40,48,68,.08)"});
}
function initThree(){
  if(typeof THREE==="undefined"){showFallback();return}
  try{
    const root=$("#threeRoot"),w=root.clientWidth,h=root.clientHeight;
    three={scene:new THREE.Scene(),camera:new THREE.PerspectiveCamera(42,w/h,.1,100),renderer:new THREE.WebGLRenderer({antialias:true,alpha:true})};
    three.camera.position.set(0,0,8);three.renderer.setPixelRatio(Math.min(devicePixelRatio,1.6));three.renderer.setSize(w,h);root.appendChild(three.renderer.domElement);
    const amb=new THREE.AmbientLight(0xffffff,2);three.scene.add(amb);
    const group=new THREE.Group();three.scene.add(group);three.group=group;
    const centerMat=new THREE.MeshPhysicalMaterial({color:0xece9ff,transparent:true,opacity:.92,roughness:.25,metalness:0.02,emissive:0xdcd6ff,emissiveIntensity:.25});
    const center=new THREE.Mesh(new THREE.SphereGeometry(.72,32,24),centerMat);group.add(center);three.center=center;
    const particleGeo=new THREE.BufferGeometry(),count=180,pos=new Float32Array(count*3);
    for(let i=0;i<count;i++){const r=3.6*Math.random()+.7, a=Math.random()*Math.PI*2, z=(Math.random()-.5)*3;pos[i*3]=Math.cos(a)*r;pos[i*3+1]=Math.sin(a)*r;pos[i*3+2]=z}
    particleGeo.setAttribute("position",new THREE.BufferAttribute(pos,3));const pm=new THREE.PointsMaterial({color:0xc9c4d8,size:.025,transparent:true,opacity:.55});group.add(new THREE.Points(particleGeo,pm));
    const positions={sleep:[-2.35,1.55,.2],movement:[2.35,1.6,.1],nutrition:[3,-.1,.3],stress:[2.15,-1.7,-.1],social:[-2.1,-1.65,.2],joy:[-3,.0,.15]};
    DIM_KEYS.forEach(k=>{
      const d=DIMS[k],g=new THREE.Group();g.position.set(...positions[k]);const mat=new THREE.MeshPhysicalMaterial({color:d.color,transparent:true,opacity:.88,roughness:.22,emissive:d.color,emissiveIntensity:.12});
      const mesh=new THREE.Mesh(new THREE.SphereGeometry(.48,24,18),mat);g.add(mesh);g.userData={dim:k,base:.48};group.add(g);sceneNodes.push(g);
      const pts=new Float32Array([0,0,0,...positions[k]]),geo=new THREE.BufferGeometry();geo.setAttribute("position",new THREE.BufferAttribute(pts,3));const lm=new THREE.LineBasicMaterial({color:0xc9c4d8,transparent:true,opacity:.32});const line=new THREE.Line(geo,lm);line.userData.dim=k;group.add(line);
    });
    three.renderer.domElement.addEventListener("pointerdown",e=>{dragging=true;dragStart={x:e.clientX,y:e.clientY}});
    window.addEventListener("pointerup",()=>dragging=false);
    three.renderer.domElement.addEventListener("pointermove",e=>{if(dragging){three.group.rotation.y+=(e.clientX-dragStart.x)*.004;three.group.rotation.x+=(e.clientY-dragStart.y)*.002;dragStart={x:e.clientX,y:e.clientY}}});
    three.renderer.domElement.addEventListener("wheel",e=>{e.preventDefault();three.camera.position.z=Math.max(5,Math.min(11,three.camera.position.z+e.deltaY*.004))},{passive:false});
    three.renderer.domElement.addEventListener("click",pickThree);
    window.addEventListener("resize",resizeThree);
    animateThree();
  }catch(_){showFallback()}
}
function pickThree(e){
  if(!three)return;const rect=three.renderer.domElement.getBoundingClientRect(),mouse=new THREE.Vector2((e.clientX-rect.left)/rect.width*2-1,-(e.clientY-rect.top)/rect.height*2+1),ray=new THREE.Raycaster();ray.setFromCamera(mouse,three.camera);
  const meshes=sceneNodes.map(g=>g.children[0]),hit=ray.intersectObjects(meshes)[0];if(hit){const g=hit.object.parent;selectDimension(g.userData.dim,true);ripple()}
}
function updateEcosystem(){
  if(!three)return;
  sceneNodes.forEach(g=>{const k=g.userData.dim,v=state.values[k],s=.8+v/12;g.children[0].scale.setScalar(s);g.children[0].material.emissiveIntensity=.06+v*.012;});
}
function animateThree(){
  if(!three)return;requestAnimationFrame(animateThree);three.group.rotation.y+=.00045;sceneNodes.forEach(g=>g.position.y+=Math.sin(performance.now()*.001+g.position.x)*.00015);three.renderer.render(three.scene,three.camera)
}
function resizeThree(){if(!three)return;const root=$("#threeRoot"),w=root.clientWidth,h=root.clientHeight;three.camera.aspect=w/h;three.camera.updateProjectionMatrix();three.renderer.setSize(w,h)}
function showFallback(){$("#threeRoot").style.display="none";buildFallback()}

/* 7. WHAT-IF ENGINE */
function setupWhatIf(k){
  const v=state.values[k];state.whatIf=k;state.whatIfBefore=v;
  $("#whatIfButtons").innerHTML=DIM_KEYS.map(x=>`<button class="${x===k?"active":""}" data-k="${x}">${DIMS[x].short}</button>`).join("");
  $$("#whatIfButtons button").forEach(b=>b.addEventListener("click",()=>setupWhatIf(b.dataset.k)));
  const range=$("#whatIfRange");range.value=v;range.style.accentColor=DIMS[k].color;$("#whatIfName").textContent=DIMS[k].name;$("#whatIfBefore").textContent=v;$("#whatIfAfter").textContent=v;$("#whatIfValue").textContent=`${v} / 10`;
  $("#rippleCore").textContent=DIMS[k].short.toUpperCase();$("#rippleCore").style.background=DIMS[k].bg;$("#rippleCore").style.color=DIMS[k].color;
  updateWhatIf();
}
function updateWhatIf() {
    const k = state.whatIf;
    const v = safeNum($("#whatIfRange")?.value, state.values[k] ?? 5);
    if (!DIMS[k]) return;
    $("#whatIfAfter").textContent = v;
    $("#whatIfValue").textContent = `${v} / 10`;

    // Try to get simulation from backend
    callAPI('/ai/simulate', {
        method: 'POST',
        body: JSON.stringify({
            factor: k,
            new_value: v,
            user_id: DEMO_USER_ID
        })
    })
    .then(data => {
        if (data && data.predicted_impact) {
            const changes = data.predicted_impact.changes;
            let chain = [DIMS[k].short];
            for (const [factor, change] of Object.entries(changes)) {
                if (factor === k) continue; // skip the factor the user just moved — it's not a "connection" to itself
                if (Math.abs(change.delta) > 0.5) {
                    chain.push(factor.charAt(0).toUpperCase() + factor.slice(1));
                }
            }
            const otherFactors = Object.keys(changes).filter(f => f !== k).slice(0, 3);
            $("#pathChain").innerHTML = chain.map((x, i) => 
                i ? `<i>→</i><span>${x}</span>` : `<span>${x}</span>`
            ).join("");
            $("#whatIfText").textContent = otherFactors.length
                ? `Changing ${DIMS[k].short} to ${v}/10 may influence ${otherFactors.join(', ')}.`
                : `Changing ${DIMS[k].short} to ${v}/10 is a good place to start experimenting.`;
            $("#whatIfCallout").textContent = "One change can touch more than one part of your wellbeing.";
        } else {
            // Fallback to her original logic
            fallbackWhatIf();
        }
    })
    .catch(() => fallbackWhatIf());

    // Her original logic (preserved as fallback)
    function fallbackWhatIf() {
        const chain = whatIfChain(k, v);
        $("#pathChain").innerHTML = chain.map((x, i) => 
            i ? `<i>→</i><span>${x}</span>` : `<span>${x}</span>`
        ).join("");
        $("#whatIfText").textContent = whatIfText(k, v);
        $("#whatIfCallout").textContent = whatIfCallout(k, v);
    }
}
function whatIfChain(k,v){
  const map={sleep:["Sleep","Recovery","Energy","Attention"],movement:["Movement","Energy","Mood"],nutrition:["Nutrition","Energy","Routine","Mood"],stress:["Stress","Recovery","Attention","Sleep"],social:["Connection","Mood","Joy"],joy:["Joy","Mood","Connection"]};return map[k]||[DIMS[k].name,"Wellbeing"];
}
function whatIfText(k,v){
  if(k==="sleep")return v>state.whatIfBefore?"Sleep is associated with recovery and attention. Individual experiences vary.":"A lower sleep snapshot may be a useful cue to explore recovery and routines gently.";
  if(k==="stress")return v<state.whatIfBefore?"Lower reported stress may make room for recovery and attention. Individual experiences vary.":"Higher reported stress can touch several everyday experiences, including recovery and attention.";
  if(k==="movement")return "Movement can be connected with energy, mood and routine. Even a small change can be worth experimenting with.";
  if(k==="nutrition")return "Everyday eating can interact with routines and perceived energy. Individual experiences and needs vary.";
  if(k==="social")return "Connection can influence how supported and engaged we feel. Small moments of contact can count.";
  return "Joy can make space for enjoyment and connection. Wellbeing is not only about fixing problems.";
}
function whatIfCallout(k,v){return v===state.whatIfBefore?"Try moving the slider to explore a different snapshot.":"One change can touch more than one part of your wellbeing."}
$("#whatIfRange").addEventListener("input",e=>{const k=state.whatIf,v=safeNum(e.target.value);state.values[k]=v;updateWhatIf();updateEcosystem();updateFallbackSelection();renderSnapshot();updateGuide();updatePersonal();saveState();ripple()});
function ripple(){const r=$("#rippleVisual");r.classList.remove("rippling");void r.offsetWidth;r.classList.add("rippling");}

/* 8. AI-STYLE INSIGHTS */
function bestGuideCandidate() {
    const v = state.values;
    const candidates = [
        {score:(10-v.sleep)+v.stress,title:"Recovery may be a useful place to start.",why:`Your reported sleep is ${v.sleep<5?"relatively low":"moderate"} while your reported stress is ${v.stress>6?"relatively high":"not especially high"}. Sleep and stress can influence one another, so a small recovery-focused action may be a reasonable first experiment.`,next:"Try a 60-second breathing reset.",reset:"breath"},
        {score:(10-v.movement)+2,title:"Movement may be an approachable place to begin.",why:`Your reported movement is ${v.movement<5?"relatively low":"moderate"}. A short activity break can be easier than trying to change everything at once.`,next:"Take a two-minute movement reset.",reset:"movement"},
        {score:(10-v.social)+1,title:"Connection is part of wellbeing too.",why:`Your reported social connection is ${v.social<5?"relatively low":"moderate"}. Consider a small, low-pressure moment with someone you enjoy talking to.`,next:"Send one message to someone you value.",reset:"joy"},
        {score:(10-v.joy)+1,title:"Make room for something enjoyable.",why:`Your reported joy is ${v.joy<5?"relatively low":"moderate"}. Wellbeing isn't only about productivity; making space for something enjoyable matters too.`,next:"Choose a five-minute joy mission.",reset:"joy"}
    ];
    if(v.stress>7)candidates[0].score+=3;
    candidates.sort((a,b)=>b.score-a.score);
    return candidates[0];
}
function updateGuide() {
    // Try to get AI insights from backend
    callAPI(`/ai/insights?user_id=${DEMO_USER_ID}`)
        .then(data => {
            if (data && data.insights && data.insights.length > 0) {
                const insight = data.insights[0];
                // Use the AI-generated text, but still derive which reset actually fits
                // the user's current weakest area, instead of always defaulting to breathing.
                const g = bestGuideCandidate();
                $("#guideTitle").textContent = insight.split('.')[0] + '.';
                $("#guideWhy").textContent = insight;
                $("#guideNext").textContent = g.next;
                $("#startGuideReset").dataset.reset = g.reset;
            } else {
                // Fallback to her original logic
                fallbackGuide();
            }
        })
        .catch(() => fallbackGuide());
    
    // Her original logic (preserved as fallback)
    function fallbackGuide() {
        const g = bestGuideCandidate();
        $("#guideTitle").textContent = g.title;
        $("#guideWhy").textContent = g.why;
        $("#guideNext").textContent = g.next;
        $("#startGuideReset").dataset.reset = g.reset;
    }
}
$("#askGuide").addEventListener("click",()=>{updateGuide();document.querySelector("#guide").scrollIntoView({behavior:"smooth"})});
$("#startGuideReset").addEventListener("click",()=>{const r=$("#startGuideReset").dataset.reset;document.querySelector("#resets").scrollIntoView({behavior:"smooth"});if(r==="breath")setTimeout(startBreath,450);else if(r==="movement")setTimeout(startMovement,450);else document.querySelector("#joy").scrollIntoView({behavior:"smooth"})});
function updatePersonal(){
  const v=state.values;let k=DIM_KEYS.reduce((best,x)=>Math.abs(v[x]-5)>Math.abs(v[best]-5)?x:best,"sleep");
  if(v.stress>7)k="stress";if(k==="stress"){$("#personalTitle").textContent="Your biggest opportunity may be recovery.";$("#personalText").textContent=`Your reported stress is ${v.stress}/10. Instead of changing everything at once, try one small recovery-focused action.`}
  else{$("#personalTitle").textContent=`Your ${DIMS[k].short.toLowerCase()} piece may be worth exploring.`;$("#personalText").textContent=`Your reported ${DIMS[k].name.toLowerCase()} is ${v[k]}/10. Pick one small experiment that feels approachable rather than trying to optimize everything.`}
}

/* 9. SCIENCE MODALS */
const SCIENCE={
 sleep:{what:"A recurring period of rest that supports everyday recovery and functioning.",why:"Sleep is involved in recovery, attention and many everyday biological processes.",try:"Keep a gentle wind-down cue, protect a consistent sleep opportunity, or simply notice how rested you feel.",sources:["NIH"]},
 movement:{what:"Everyday physical activity, from walking and stretching to more structured exercise.",why:"Movement can be part of routines, energy and mood, while also creating opportunities for connection.",try:"Take a short walk, stand and stretch, or add a small activity break to an existing routine.",sources:["CDC","WHO"]},
 nutrition:{what:"The everyday pattern of foods and drinks that makes up how you eat.",why:"Eating patterns are one part of the broader picture of energy, routine and wellbeing.",try:"Notice one meal that feels supportive and make the next small choice easier.",sources:["CDC","WHO"]},
 stress:{what:"The feeling of pressure or demand that can show up in everyday life.",why:"Stress can shape attention, recovery, routines and how experiences feel. Responses vary.",try:"Try a brief pause, reduce one immediate demand, or identify one thing you can control today.",sources:["NIH","CDC"]},
 social:{what:"Relationships, belonging, support and everyday moments of human connection.",why:"Connection is a meaningful dimension of wellbeing and can include very small interactions.",try:"Send a message, share a meal, ask someone how they are, or spend time with someone you value.",sources:["WHO"]},
 joy:{what:"Pleasure, curiosity, creativity, play and moments that feel meaningful or enjoyable.",why:"Joy gives wellbeing another dimension beyond productivity and problem-solving.",try:"Make something, listen to a favorite song, spend time with a pet, or step outside for a few minutes.",sources:["WHO"]}
};
function initScience(){
  const grid=$("#scienceGrid");grid.innerHTML="";DIM_KEYS.forEach(k=>{const d=DIMS[k],s=SCIENCE[k],b=document.createElement("button");b.className="science-card";b.style.textAlign="left";b.innerHTML=`<span class="dim-icon" style="background:${d.bg};color:${d.color}"><i data-lucide="${d.icon}"></i></span><h3>${d.name}</h3><p>${s.why}</p>`;b.addEventListener("click",()=>openScience(k));grid.appendChild(b)});icons();
}
function openScience(k){const d=DIMS[k],s=SCIENCE[k];$("#modalKicker").textContent=`SCIENCE · ${d.name}`;$("#modalTitle").textContent=d.name;$("#modalWhat").textContent=s.what;$("#modalWhy").textContent=s.why;$("#modalTry").textContent=s.try;$("#modalSources").innerHTML=s.sources.map(x=>`<b>${x}</b>`).join("");$("#scienceModal").showModal()}
$("#modalClose").addEventListener("click",()=>$("#scienceModal").close());$("#scienceModal").addEventListener("click",e=>{if(e.target.id==="scienceModal")e.target.close()});

/* 10. BREATHING RESET */
function startBreath(){
  if(breathInterval)return;breathRemaining=60;
  $("#breathStart").style.display="none";$("#breathStop").style.display="inline-flex";
  const circle=$("#breathCircle");
  breathInterval=setInterval(()=>{breathRemaining--;const elapsed=60-breathRemaining,phase=elapsed%10;let label="Breathe in";if(phase>=4&&phase<6)label="Hold";else if(phase>=6)label="Breathe out";$("#breathState").textContent=label;$("#breathTimer").textContent=breathRemaining;$("#breathProgress").style.width=`${elapsed/60*100}%`;circle.classList.toggle("inhale",phase<4);circle.classList.toggle("exhale",phase>=6);
    if(breathRemaining<=0){clearInterval(breathInterval);breathInterval=null;circle.classList.remove("inhale","exhale");$("#breathState").textContent="Nice work";$("#breathTimer").textContent="✓";$("#breathStart").style.display="inline-flex";$("#breathStop").style.display="none";state.resetCompleted=true;recordReflection("Breathing reset completed");toast("Nice work. Take a moment before continuing.");renderBeforeAfter();renderTimeline();saveState()}
  },1000)
}
function stopBreath(){
  if(!breathInterval)return;clearInterval(breathInterval);breathInterval=null;
  const circle=$("#breathCircle");circle.classList.remove("inhale","exhale");
  $("#breathState").textContent="Ready";$("#breathTimer").textContent="60";$("#breathProgress").style.width="0%";
  $("#breathStart").style.display="inline-flex";$("#breathStop").style.display="none";
}
$("#breathStart").addEventListener("click",startBreath);
$("#breathStop").addEventListener("click",stopBreath);

/* 11. MOVEMENT RESET */
function movementLabel(sec){return sec<60?`${sec} seconds`:`${sec/60} minute${sec===60?"":"s"}`}
function renderMovementTimer(sec){const m=Math.floor(sec/60),s=sec%60;$("#movementTimer").textContent=`${String(m).padStart(2,"0")}:${String(s).padStart(2,"0")}`}
function initDurationPicker(){
  $$(".dur-btn").forEach(b=>b.addEventListener("click",()=>{
    if(movementInterval)return;
    $$(".dur-btn").forEach(x=>x.classList.remove("active"));b.classList.add("active");
    movementDurationSec=Number(b.dataset.sec);movementRemaining=movementDurationSec;
    renderMovementTimer(movementRemaining);
    $("#movementDurationLabel").textContent=movementLabel(movementDurationSec);
  }));
}
function initMovementSteps(){
  $$(".movement-step").forEach((btn,i)=>btn.addEventListener("click",()=>{
    if(movementInterval)return; // don't let the manual pick fight the auto-advancing timer mid-run
    $$(".movement-step").forEach((x,j)=>x.classList.toggle("active",j===i));
  }));
}
function startMovement(){
  if(movementInterval)return;movementRemaining=movementDurationSec;
  const totalSec=movementDurationSec;
  $("#movementStart").style.display="none";$("#movementStop").style.display="inline-flex";
  $$(".dur-btn").forEach(b=>b.disabled=true);
  $$(".movement-step").forEach(b=>b.disabled=true);
  movementInterval=setInterval(()=>{movementRemaining--;renderMovementTimer(movementRemaining);const idx=Math.min(2,Math.floor((totalSec-movementRemaining)/(totalSec/3)));$$(".movement-step").forEach((x,i)=>x.classList.toggle("active",i===idx));
    if(movementRemaining<=0){clearInterval(movementInterval);movementInterval=null;$("#movementTimer").textContent="Done";$("#movementStart").style.display="inline-flex";$("#movementStop").style.display="none";$$(".dur-btn").forEach(b=>b.disabled=false);$$(".movement-step").forEach(b=>b.disabled=false);state.resetCompleted=true;recordReflection("Movement reset completed");toast("Reset complete. Nice work.");renderBeforeAfter();renderTimeline();saveState()}
  },1000)
}
function stopMovement(){
  if(!movementInterval)return;clearInterval(movementInterval);movementInterval=null;
  $("#movementStart").style.display="inline-flex";$("#movementStop").style.display="none";
  $$(".dur-btn").forEach(b=>b.disabled=false);
  $$(".movement-step").forEach(b=>b.disabled=false);
  movementRemaining=movementDurationSec;renderMovementTimer(movementRemaining);
  $$(".movement-step").forEach((x,i)=>x.classList.toggle("active",i===0));
}
$("#movementStart").addEventListener("click",startMovement);
$("#movementStop").addEventListener("click",stopMovement);

/* 12. HYDRATION */
function initHydration(){const drops=$("#droplets");for(let i=0;i<9;i++){const b=document.createElement("button");b.className="drop";b.setAttribute("aria-label","Add a water drop");b.addEventListener("click",()=>{const n=Math.min(9,(Number(drops.dataset.count)||0)+1);drops.dataset.count=n;$("#waterFill").style.height=`${n/9*80}%`;if(n===9){$("#waterCopy").textContent="Take a moment to drink some water.";toast("A gentle hydration pause.");state.resetCompleted=true;recordReflection("Hydration pause");renderBeforeAfter();renderTimeline();saveState();$("#waterReset").style.display="inline-flex"}else $("#waterCopy").textContent=`${n}/9 drops — take a small pause.`});drops.appendChild(b)}}
function resetHydration(){const drops=$("#droplets");drops.dataset.count=0;$("#waterFill").style.height="0%";$("#waterCopy").textContent="Tap the drops to fill the glass.";$("#waterReset").style.display="none"}
$("#waterReset").addEventListener("click",resetHydration);

/* 13. JOY MISSIONS */
const MISSIONS={5:["Listen to a song you love.","Send someone a message.","Step outside for a few minutes.","Make something just for fun.","Spend time with a pet.","Do something creative.","Write down one thing you appreciated today."],10:["Make a favorite drink and enjoy it slowly.","Take a short walk somewhere pleasant.","Call someone you haven't spoken to recently.","Try a tiny creative project.","Read something purely for fun."],15:["Make a small meal you enjoy.","Take a longer walk without multitasking.","Do something creative with no outcome in mind.","Spend fifteen minutes with someone you care about.","Put on music and make your space feel good."]};
function newJoy(){const min=Number($(".time-btn.active").dataset.min),arr=MISSIONS[min],current=$("#joyMission").textContent;let pick=arr[Math.floor(Math.random()*arr.length)];if(arr.length>1&&pick===current)pick=arr[(arr.indexOf(pick)+1)%arr.length];$("#joyMission").textContent=pick;$("#joyMission").animate?.([{opacity:.2,transform:"translateY(6px)"},{opacity:1,transform:"translateY(0)"}],{duration:350})}
$$(".time-btn").forEach(b=>b.addEventListener("click",()=>{$$(".time-btn").forEach(x=>x.classList.remove("active"));b.classList.add("active");newJoy()}));$("#newJoy").addEventListener("click",newJoy);

/* 14. BEFORE/AFTER */
function renderBars(target,values){
  const el=$(target);el.innerHTML=DIM_KEYS.map(k=>`<div class="bar-row"><span>${DIMS[k].short}</span><div class="bar-bg"><div class="bar-fill" style="width:${safeNum(values[k])*10}%;background:${DIMS[k].color}"></div></div><b>${safeNum(values[k])}</b></div>`).join("");
}
function renderBeforeAfter(){
  renderBars("#beforeBars",state.before);renderBars("#nowBars",state.values);
  const note=$(".center-note");
  if(!note)return;
  const changed=DIM_KEYS.some(k=>state.before[k]!==state.values[k]);
  note.textContent=changed
    ? "Your self-reported snapshot changed. Small changes are worth noticing."
    : "No changes yet — try adjusting a piece of your mosaic above.";
}
function updateBeforeNow(){renderBars("#nowBars",state.values)}
function recordReflection(action){state.reflection.push({date:new Date().toLocaleDateString(undefined,{weekday:"short"}),values:{...state.values},action});state.reflection=state.reflection.slice(-7)}
function renderTimeline(){
  const t=$("#timeline");if(!state.reflection.length){t.innerHTML=`<div style="color:var(--text-muted);font-size:11px">Complete a reset to begin a lightweight reflection timeline.</div>`;return}
  t.innerHTML=state.reflection.map(r=>{const v=r.values.stress??5;return `<div class="timeline-item" title="${r.action||""}"><b>${v}</b><div class="timeline-bar" style="--h:${Math.max(10,v*12)}px"></div><small>${r.date}</small></div>`}).join("");
}

/* 16. ACCESSIBILITY + HELPERS */
function icons(){if(window.lucide?.createIcons)window.lucide.createIcons()}
let toastTimer=null;function toast(msg){const t=$("#toast");t.textContent=msg;t.classList.add("show");clearTimeout(toastTimer);toastTimer=setTimeout(()=>t.classList.remove("show"),3000)}
function updateFallback(){if(!three)buildFallback()}

/* 17. DEMO MODE */
function runDemo(){
  state.before={...state.values};state.values={...DEMO};state.selected="stress";state.whatIf="stress";state.resetCompleted=false;
  renderSliders();renderSnapshot();renderBeforeAfter();renderTimeline();selectDimension("stress");updateGuide();updatePersonal();saveState();
  document.querySelector("#ecosystem").scrollIntoView({behavior:"smooth"});setTimeout(()=>{selectDimension("stress");document.querySelector("#whatif").scrollIntoView({behavior:"smooth"});setTimeout(()=>{state.whatIfBefore=8;$("#whatIfRange").value=5;state.values.stress=5;updateWhatIf();updateEcosystem();renderSnapshot();updateGuide();updatePersonal();ripple();saveState();document.querySelector("#guide").scrollIntoView({behavior:"smooth"});toast("Demo ripple complete — your next step is ready.")},1700)},1100);
}
$("#demoBtn").addEventListener("click",runDemo);$("#enterMosaic").addEventListener("click",()=>{document.querySelector("#ecosystem").scrollIntoView({behavior:"smooth"});selectDimension(state.selected);});$("#clearData").addEventListener("click",clearData);$("#personalAction").addEventListener("click",()=>{document.querySelector("#guide").scrollIntoView({behavior:"smooth"});});
/* Initialisation */
function init(){
  loadState();initNavigation();renderSliders();renderSnapshot();buildFallback();initThree();initScience();initHydration();initDurationPicker();initMovementSteps();renderBeforeAfter();renderTimeline();setupWhatIf(state.selected);updateGuide();updatePersonal();icons();
}
if(document.readyState==="loading")document.addEventListener("DOMContentLoaded",init);else init();
})();