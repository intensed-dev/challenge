(() => {
  const $ = (s) => document.querySelector(s);
  const cfg = window.CHALLENGE_CONFIG;
  const api = async (path, options = {}) => {
    const response = await fetch(cfg.API_URL + path, { ...options, headers: { "Content-Type": "application/json", ...(options.headers || {}) } });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(data.error || "Anfrage fehlgeschlagen.");
    return data;
  };
  let session = JSON.parse(localStorage.getItem("challenge-player") || "null");
  let selectedItem = null, items = [], drawings = [], timerHandle = null, strokes = [], currentStroke = null;
  const joinPanel = $("#join-panel"), drawPanel = $("#draw-panel");
  const message = (el, text, error = false) => { el.textContent = text; el.className = "notice" + (error ? " error" : " success"); };
  async function loadItems() {
    try {
      const url = cfg.ITEMS_API + "/items?namespace=minecraft&mc_version=" + encodeURIComponent(cfg.MINECRAFT_VERSION) + "&limit=500";
      const data = await fetch(url).then(r => { if (!r.ok) throw new Error(); return r.json(); });
      items = Array.isArray(data) ? data : (data.items || data.results || data.data || []);
    } catch { items = []; }
  }
  function itemId(item) { return String(item.id || item.full_id || item.namespaced_id || item.namespacedId || "").replace(/^minecraft:/, ""); }
  function itemName(item) { return item.name || item.display_name || item.displayName || itemId(item).replaceAll("_", " "); }
  function iconUrl(id) { return cfg.ITEMS_API + "/icon/minecraft:" + encodeURIComponent(id) + ".png?size=64"; }
  function renderItemMatches(query) {
    const box = $("#item-results"); box.innerHTML = "";
    if (!query.trim()) { box.classList.add("hidden"); return; }
    const normalized = query.toLowerCase().replace(/^minecraft:/, "");
    const matches = items.filter(item => itemId(item).toLowerCase().includes(normalized) || itemName(item).toLowerCase().includes(normalized)).slice(0, 12);
    matches.forEach(item => {
      const id = itemId(item), name = itemName(item), button = document.createElement("button");
      button.type = "button"; button.className = "item-option";
      const img = document.createElement("img"); img.src = iconUrl(id); img.alt = "";
      const label = document.createElement("span"); label.innerHTML = "";
      const strong = document.createElement("strong"); strong.textContent = name;
      const small = document.createElement("small"); small.textContent = "minecraft:" + id;
      label.append(strong, small); button.append(img, label);
      button.addEventListener("click", () => { selectedItem = { id, name, icon: iconUrl(id) }; $("#item-id").value = id; $("#item-results").classList.add("hidden"); renderSelected(); });
      box.append(button);
    });
    box.classList.toggle("hidden", matches.length === 0);
  }
  function renderSelected() {
    const box = $("#selected-item"); box.innerHTML = "";
    if (!selectedItem) { box.classList.add("hidden"); return; }
    const img = document.createElement("img"); img.src = selectedItem.icon; img.alt = "";
    const text = document.createElement("div"); const strong = document.createElement("strong"); strong.textContent = selectedItem.name;
    const small = document.createElement("small"); small.textContent = "minecraft:" + selectedItem.id; text.append(strong, small); box.append(img, text); box.classList.remove("hidden");
  }
  const canvas = $("#canvas"), ctx = canvas.getContext("2d");
  ctx.fillStyle = "#fff"; ctx.fillRect(0, 0, canvas.width, canvas.height);
  function point(e) { const r = canvas.getBoundingClientRect(); return { x: (e.clientX-r.left)*canvas.width/r.width, y: (e.clientY-r.top)*canvas.height/r.height }; }
  function drawStroke(stroke) { if (!stroke.points.length) return; ctx.strokeStyle=stroke.color;ctx.lineWidth=stroke.size;ctx.lineCap="round";ctx.lineJoin="round";ctx.beginPath();ctx.moveTo(stroke.points[0].x,stroke.points[0].y);stroke.points.slice(1).forEach(p=>ctx.lineTo(p.x,p.y));ctx.stroke(); }
  function redraw() { ctx.fillStyle="#fff";ctx.fillRect(0,0,canvas.width,canvas.height);strokes.forEach(drawStroke);if(currentStroke)drawStroke(currentStroke); }
  canvas.addEventListener("pointerdown", e => { canvas.setPointerCapture(e.pointerId); currentStroke={color:$("#pen-color").value,size:Number($("#pen-size").value),points:[point(e)]};redraw(); });
  canvas.addEventListener("pointermove", e => { if(!currentStroke)return;currentStroke.points.push(point(e));redraw(); });
  const stopStroke = () => { if(currentStroke){strokes.push(currentStroke);currentStroke=null;redraw();} };
  canvas.addEventListener("pointerup",stopStroke);canvas.addEventListener("pointercancel",stopStroke);
  $("#undo").addEventListener("click",()=>{strokes.pop();redraw();});
  $("#clear").addEventListener("click",()=>{strokes=[];currentStroke=null;redraw();});
  $("#item-id").addEventListener("input", e => { selectedItem=null;renderSelected();renderItemMatches(e.target.value); });
  $("#join-form").addEventListener("submit", async e => {
    e.preventDefault(); const form=new FormData(e.currentTarget);
    try { const data=await api("/api/join",{method:"POST",body:JSON.stringify({name:form.get("name"),code:form.get("code")})});session=data;localStorage.setItem("challenge-player",JSON.stringify(session));await enter(); }
    catch(err){message($("#join-message"),err.message,true);}
  });
  $("#drawing-form").addEventListener("submit", async e => {
    e.preventDefault(); if(!selectedItem){message($("#draw-message"),"Bitte wähle zuerst ein Item aus der Liste aus.",true);return;}
    const quantity=Number($("#quantity").value);if(!Number.isInteger(quantity)||quantity<1||quantity>9999){message($("#draw-message"),"Bitte gib eine gültige Anzahl ein.",true);return;}
    $("#submit-drawing").disabled=true;
    try {
      const image=canvas.toDataURL("image/png").split(",")[1];
      await api("/api/drawings",{method:"POST",headers:{"Authorization":"Bearer "+session.token},body:JSON.stringify({itemId:selectedItem.id,itemName:selectedItem.name,icon:selectedItem.icon,quantity,image})});
      message($("#draw-message"),"Zeichnung abgegeben.");strokes=[];redraw();selectedItem=null;renderSelected();$("#item-id").value="";$("#quantity").value="1";await refresh();
    } catch(err){message($("#draw-message"),err.message,true);} finally{$("#submit-drawing").disabled=false;}
  });
  async function refresh(){
    if(!session)return;
    const data=await api("/api/player",{headers:{"Authorization":"Bearer "+session.token}});
    $("#phase-label").textContent=data.challenge.phase==="drawing"?(data.challenge.running?"Zeichnungsphase läuft.":"Warte auf den Timer-Start."):"Phase: "+data.challenge.phase;
    $("#timer").textContent=formatTime(data.challenge.remaining);
    if(data.challenge.phase==="results"&&data.results){$("#draw-panel").classList.add("hidden");$("#results-panel").classList.remove("hidden");renderResults($("#player-results"),data.results.filter(x=>x.playerId===session.playerId));return;}
    if(data.challenge.phase!=="drawing"){ $("#drawing-form").classList.add("hidden");$("#waiting-panel").classList.remove("hidden"); }
    drawings=data.drawings||[];$("#drawing-count").textContent=drawings.length;$("#my-drawings").innerHTML="";
    drawings.forEach(d=>{const card=document.createElement("div");card.className="drawing-card";const img=document.createElement("img");img.src=d.imageUrl;const p=document.createElement("p");p.textContent=d.quantity+"× "+d.itemName;card.append(img,p);$("#my-drawings").append(card);});
  }
  function formatTime(seconds){seconds=Math.max(0,Math.floor(seconds||0));return String(Math.floor(seconds/60)).padStart(2,"0")+":"+String(seconds%60).padStart(2,"0");}
  function renderResults(root, entries){root.innerHTML="";entries.forEach(e=>{const line=document.createElement("div");line.className="item-line";const img=document.createElement("img");img.src=e.icon;const label=document.createElement("span");label.textContent=e.quantity+"× "+e.itemName;const status=document.createElement("span");status.className="result-status "+(e.correct?"good":"bad");status.textContent=e.correct?"ERRATEN":"NICHT ERRATEN";line.append(img,label,status);root.append(line);});}
  async function enter(){
    joinPanel.classList.add("hidden");drawPanel.classList.remove("hidden");$("#player-title").textContent=session.name;
    await loadItems();await refresh();if(timerHandle)clearInterval(timerHandle);timerHandle=setInterval(()=>refresh().catch(()=>{}),2500);
  }
  if(session?.token)enter().catch(()=>{localStorage.removeItem("challenge-player");session=null;joinPanel.classList.remove("hidden");drawPanel.classList.add("hidden");});
})();