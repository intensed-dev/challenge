(() => {
  const $=s=>document.querySelector(s), cfg=window.CHALLENGE_CONFIG;
  let secret="", challenge=null, timer=null;
  const api=async(path,options={})=>{const r=await fetch(cfg.API_URL+path,{...options,headers:{"Content-Type":"application/json","X-Admin-Secret":secret,...(options.headers||{})}});const d=await r.json().catch(()=>({}));if(!r.ok)throw new Error(d.error||"Anfrage fehlgeschlagen.");return d;};
  const msg=(s,error=false)=>{$("#admin-message").textContent=s;$("#admin-message").className="notice"+(error?" error":" success");};
  const time=n=>{n=Math.max(0,Math.floor(n||0));return String(Math.floor(n/60)).padStart(2,"0")+":"+String(n%60).padStart(2,"0");};
  $("#admin-login-form").addEventListener("submit",async e=>{e.preventDefault();secret=new FormData(e.currentTarget).get("secret");try{challenge=await api("/api/admin/state");$("#admin-login").classList.add("hidden");$("#admin-app").classList.remove("hidden");render();}catch(err){msg(err.message,true);}});
  $("#create-challenge").addEventListener("click",async()=>{try{challenge=await api("/api/admin/challenge",{method:"POST",body:JSON.stringify({code:$("#join-code").value||"PLAY"})});render();}catch(e){msg(e.message,true);}});
  $("#start-timer").addEventListener("click",()=>action("start"));
  $("#pause-timer").addEventListener("click",()=>action("pause"));
  $("#finish-drawing").addEventListener("click",()=>action("finish"));
  $("#publish-results").addEventListener("click",()=>action("publish"));
  async function action(action){try{challenge=await api("/api/admin/action",{method:"POST",body:JSON.stringify({action})});await refresh();}catch(e){msg(e.message,true);}}
  async function refresh(){try{challenge=await api("/api/admin/state");render();}catch(e){msg(e.message,true);}}
  function render(){
    if(!challenge)return;$("#phase-status").textContent=challenge.phase;$("#create-round").classList.toggle("hidden",!!challenge.id);$("#round-controls").classList.toggle("hidden",!challenge.id);$("#active-code").textContent=challenge.code||"";$("#admin-timer").textContent=time(challenge.remaining);
    const players=challenge.players||[];$("#player-count").textContent=players.length;$("#players").innerHTML="";players.forEach(p=>{const el=document.createElement("div");el.className="player-chip";const name=document.createElement("strong");name.textContent=p.name;const small=document.createElement("small");small.textContent=(p.drawingCount||0)+" Zeichnungen";el.append(name,small);$("#players").append(el);});
    $("#submissions").innerHTML="";$("#review-list").innerHTML="";
    players.forEach(p=>{const group=document.createElement("div");group.className="review-group";const heading=document.createElement("h3");heading.textContent=p.name+" · "+p.drawings.length+" Zeichnungen";group.append(heading);
      p.drawings.forEach(d=>{const card=document.createElement("div");card.className="drawing-card";const img=document.createElement("img");img.src=d.imageUrl;const info=document.createElement("p");info.textContent=d.quantity+"× "+d.itemName+" ("+d.itemId+")";card.append(img,info);group.append(card);
        const review=document.createElement("div");review.className="review-card";const preview=document.createElement("img");preview.src=d.imageUrl;const detail=document.createElement("div");const label=document.createElement("strong");label.textContent=p.name+" · "+d.quantity+"× "+d.itemName;const id=document.createElement("p");id.className="muted";id.textContent="minecraft:"+d.itemId;detail.append(label,id);
        const decision=document.createElement("div");decision.className="decision";const yes=document.createElement("button");yes.className="correct";yes.textContent="Richtig";yes.disabled=d.reviewed;yes.addEventListener("click",()=>rate(d.id,true));const no=document.createElement("button");no.className="incorrect";no.textContent="Falsch";no.disabled=d.reviewed;no.addEventListener("click",()=>rate(d.id,false));decision.append(yes,no);detail.append(decision);if(d.reviewed){const state=document.createElement("p");state.textContent=d.correct?"Als richtig bewertet":"Als falsch bewertet";detail.append(state);}review.append(preview,detail);$("#review-list").append(review);
      });$("#submissions").append(group);
    });
    renderResults();
  }
  async function rate(id,correct){try{await api("/api/admin/review",{method:"POST",body:JSON.stringify({drawingId:id,correct})});await refresh();}catch(e){msg(e.message,true);}}
  function renderResults(){const root=$("#admin-results");root.innerHTML="";(challenge.results||[]).forEach(p=>{const group=document.createElement("div");group.className="review-group";const h=document.createElement("h3");h.textContent=p.name;group.append(h);p.items.forEach(i=>{const line=document.createElement("div");line.className="item-line";const img=document.createElement("img");img.src=i.icon;const text=document.createElement("span");text.textContent=i.quantity+"× "+i.itemName;line.append(img,text);group.append(line);});root.append(group);});}
  setInterval(()=>{if(secret)refresh();},2500);
})();