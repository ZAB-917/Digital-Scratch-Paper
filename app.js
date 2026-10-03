(() => {
  "use strict";

  // IMPORTANT PRIVACY DESIGN:
  // There is intentionally NO localStorage, sessionStorage, IndexedDB, cookies,
  // service worker, backend, analytics, or network request in this application.
  // All workspace state lives only in JavaScript memory and disappears on reload/tab close.

  const canvas = document.getElementById("board");
  const ctx = canvas.getContext("2d");
  const wrap = document.getElementById("boardWrap");
  const notes = document.getElementById("notes");

  let state = {
    objects: [],
    selectedId: null,
    tool: "select",
    color: "#111827",
    size: 3,
    history: [],
    future: []
  };

  let interaction = null;
  let nextId = 1;

  const toolHelp = {
    select: "Select and move objects.",
    pen: "Draw freehand strokes.",
    eraser: "Erase a freehand stroke by clicking near it.",
    node: "Click to place a graph node. Double-click a node to edit its label.",
    edge: "Click two nodes to connect them with an undirected edge.",
    directed: "Click two nodes to create a directed edge.",
    weight: "Click an edge to add or change its weight.",
    text: "Click the board, enter text, then press Add."
  };

  function uid() { return nextId++; }

  function resizeCanvas() {
    const dpr = window.devicePixelRatio || 1;
    const rect = wrap.getBoundingClientRect();
    canvas.width = Math.max(1, Math.round(rect.width * dpr));
    canvas.height = Math.max(1, Math.round(rect.height * dpr));
    canvas.style.width = rect.width + "px";
    canvas.style.height = rect.height + "px";
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    draw();
  }
  window.addEventListener("resize", resizeCanvas);

  function point(e) {
    const r = canvas.getBoundingClientRect();
    return { x: e.clientX - r.left, y: e.clientY - r.top };
  }

  function snapshot() {
    return JSON.stringify(state.objects);
  }
  function restore(s) {
    state.objects = JSON.parse(s);
    state.selectedId = null;
    draw();
  }
  function commit(before) {
    const after = snapshot();
    if (before !== after) {
      state.history.push(before);
      if (state.history.length > 100) state.history.shift();
      state.future = [];
    }
    draw();
  }

  function setTool(t) {
    state.tool = t;
    document.querySelectorAll(".tool").forEach(b => b.classList.toggle("active", b.dataset.tool === t));
    document.getElementById("toolHelp").textContent = toolHelp[t];
    canvas.style.cursor = t === "select" ? "default" : "crosshair";
  }

  function nodeAt(p) {
    for (let i = state.objects.length - 1; i >= 0; i--) {
      const o = state.objects[i];
      if (o.type === "node" && Math.hypot(o.x - p.x, o.y - p.y) <= o.r + 7) return o;
    }
    return null;
  }

  function edgeAt(p) {
    let best = null, bestD = 9;
    for (const o of state.objects) {
      if (o.type !== "edge") continue;
      const a = getNode(o.a), b = getNode(o.b);
      if (!a || !b) continue;
      const d = pointSegmentDistance(p, a, b);
      if (d < bestD) { bestD = d; best = o; }
    }
    return best;
  }

  function getNode(id) { return state.objects.find(o => o.id === id && o.type === "node"); }

  function pointSegmentDistance(p, a, b) {
    const dx = b.x-a.x, dy = b.y-a.y;
    const len2 = dx*dx + dy*dy;
    if (!len2) return Math.hypot(p.x-a.x,p.y-a.y);
    let t = ((p.x-a.x)*dx + (p.y-a.y)*dy)/len2;
    t = Math.max(0, Math.min(1,t));
    return Math.hypot(p.x-(a.x+t*dx), p.y-(a.y+t*dy));
  }

  function addNode(p) {
    const before = snapshot();
    state.objects.push({ type:"node", id:uid(), x:p.x, y:p.y, r:22, label:"" });
    commit(before);
  }

  function addEdge(a, b, directed) {
    if (!a || !b || a.id === b.id) return;
    const before = snapshot();
    state.objects.push({ type:"edge", id:uid(), a:a.id, b:b.id, directed, weight:"" });
    commit(before);
  }

  function beginPen(p) {
    interaction = { kind:"pen", before:snapshot(), points:[p] };
    state.objects.push({type:"stroke", id:uid(), points:[p], color:state.color, size:state.size});
  }

  canvas.addEventListener("pointerdown", e => {
    e.preventDefault();
    const p = point(e);
    canvas.setPointerCapture(e.pointerId);

    if (state.tool === "pen") return beginPen(p);

    if (state.tool === "eraser") {
      const before = snapshot();
      const hit = state.objects.find(o => o.type==="stroke" && strokeHit(o,p));
      if (hit) {
        state.objects = state.objects.filter(o => o !== hit);
        commit(before);
      }
      return;
    }

    if (state.tool === "node") return addNode(p);

    if (state.tool === "edge" || state.tool === "directed") {
      const n = nodeAt(p);
      if (!n) return;
      if (!interaction || interaction.kind !== "edgeStart") {
        interaction = {kind:"edgeStart", node:n, directed:state.tool==="directed"};
        state.selectedId = n.id;
        draw();
      } else {
        const start = interaction.node;
        interaction = null;
        addEdge(start, n, state.tool==="directed");
      }
      return;
    }

    if (state.tool === "weight") {
      const edge = edgeAt(p);
      if (edge) {
        const v = prompt("Edge weight:", edge.weight || "");
        if (v !== null) {
          const before = snapshot();
          edge.weight = v;
          commit(before);
        }
      }
      return;
    }

    if (state.tool === "text") {
      openTextEditor(p);
      return;
    }

    if (state.tool === "select") {
      const n = nodeAt(p);
      const s = state.objects.find(o => o.type==="stroke" && strokeHit(o,p));
      const eobj = edgeAt(p);
      const target = n || s || eobj;
      state.selectedId = target ? target.id : null;
      if (n) {
        interaction = {kind:"move", before:snapshot(), node:n, dx:p.x-n.x, dy:p.y-n.y};
      }
      draw();
    }
  });

  canvas.addEventListener("pointermove", e => {
    if (!interaction) return;
    const p = point(e);
    if (interaction.kind === "pen") {
      const stroke = state.objects[state.objects.length-1];
      stroke.points.push(p);
      draw();
    } else if (interaction.kind === "move") {
      interaction.node.x = p.x - interaction.dx;
      interaction.node.y = p.y - interaction.dy;
      draw();
    }
  });

  canvas.addEventListener("pointerup", () => {
    if (!interaction) return;
    if (interaction.kind === "pen" || interaction.kind === "move") {
      const before = interaction.before;
      interaction = null;
      commit(before);
    }
  });

  canvas.addEventListener("dblclick", e => {
    const n = nodeAt(point(e));
    if (n) {
      const v = prompt("Node label:", n.label || "");
      if (v !== null) {
        const before = snapshot();
        n.label = v;
        commit(before);
      }
    }
  });

  function strokeHit(s,p) {
    for (let i=1;i<s.points.length;i++) {
      if (pointSegmentDistance(p,s.points[i-1],s.points[i]) <= Math.max(10,s.size+5)) return true;
    }
    return false;
  }

  function drawArrow(a,b) {
    const ang = Math.atan2(b.y-a.y,b.x-a.x);
    const len = 11;
    ctx.beginPath();
    ctx.moveTo(b.x,b.y);
    ctx.lineTo(b.x-len*Math.cos(ang-Math.PI/6), b.y-len*Math.sin(ang-Math.PI/6));
    ctx.moveTo(b.x,b.y);
    ctx.lineTo(b.x-len*Math.cos(ang+Math.PI/6), b.y-len*Math.sin(ang+Math.PI/6));
    ctx.stroke();
  }

  function draw() {
    const rect = wrap.getBoundingClientRect();
    ctx.clearRect(0,0,rect.width,rect.height);
    ctx.fillStyle = "#fff";
    ctx.fillRect(0,0,rect.width,rect.height);

    // Subtle graph-paper grid
    ctx.strokeStyle = "#eef1f4";
    ctx.lineWidth = 1;
    const grid=24;
    for(let x=0;x<rect.width;x+=grid){ctx.beginPath();ctx.moveTo(x,0);ctx.lineTo(x,rect.height);ctx.stroke();}
    for(let y=0;y<rect.height;y+=grid){ctx.beginPath();ctx.moveTo(0,y);ctx.lineTo(rect.width,y);ctx.stroke();}

    for (const o of state.objects) {
      if (o.type==="stroke") {
        ctx.strokeStyle=o.color; ctx.lineWidth=o.size; ctx.lineCap="round"; ctx.lineJoin="round";
        ctx.beginPath();
        o.points.forEach((p,i)=>i?ctx.lineTo(p.x,p.y):ctx.moveTo(p.x,p.y));
        ctx.stroke();
      }
    }

    for (const o of state.objects) {
      if (o.type!=="edge") continue;
      const a=getNode(o.a), b=getNode(o.b); if(!a||!b) continue;
      const dx=b.x-a.x, dy=b.y-a.y, len=Math.hypot(dx,dy)||1;
      const ux=dx/len, uy=dy/len;
      const start={x:a.x+ux*a.r,y:a.y+uy*a.r};
      const end={x:b.x-ux*b.r,y:b.y-uy*b.r};
      ctx.strokeStyle="#374151"; ctx.lineWidth=2;
      ctx.beginPath();ctx.moveTo(start.x,start.y);ctx.lineTo(end.x,end.y);ctx.stroke();
      if(o.directed) drawArrow(start,end);
      if(o.weight) {
        const mx=(start.x+end.x)/2, my=(start.y+end.y)/2;
        ctx.font="14px system-ui"; ctx.textAlign="center"; ctx.textBaseline="middle";
        const pad=4, w=ctx.measureText(o.weight).width+pad*2;
        ctx.fillStyle="#fff";ctx.fillRect(mx-w/2,my-11,w,22);
        ctx.fillStyle="#111827";ctx.fillText(o.weight,mx,my);
      }
    }

    for (const o of state.objects) {
      if(o.type==="text") {
        ctx.fillStyle="#111827";
        ctx.font="15px system-ui";
        ctx.textAlign="left";
        ctx.textBaseline="alphabetic";
        ctx.fillText(o.text,o.x,o.y);
      }
    }

    for (const o of state.objects) {
      if(o.type!=="node") continue;
      ctx.beginPath();ctx.arc(o.x,o.y,o.r,0,Math.PI*2);
      ctx.fillStyle="#fff";ctx.fill();
      ctx.lineWidth=o.id===state.selectedId?3:2;
      ctx.strokeStyle=o.id===state.selectedId?"#2563eb":"#111827";ctx.stroke();
      if(o.label){
        ctx.fillStyle="#111827";ctx.font="bold 14px system-ui";ctx.textAlign="center";ctx.textBaseline="middle";
        ctx.fillText(o.label,o.x,o.y);
      } else {
        ctx.fillStyle="#667085";ctx.font="11px system-ui";ctx.textAlign="center";ctx.textBaseline="middle";
        ctx.fillText(String(o.id),o.x,o.y);
      }
    }
  }

  function openTextEditor(p) {
    const editor=document.getElementById("textEditor");
    editor.style.left=Math.min(p.x, wrap.clientWidth-260)+"px";
    editor.style.top=Math.min(p.y, wrap.clientHeight-50)+"px";
    editor.hidden=false;
    editor.dataset.x=p.x; editor.dataset.y=p.y;
    document.getElementById("textInput").value="";
    document.getElementById("textInput").focus();
  }
  function closeTextEditor(){document.getElementById("textEditor").hidden=true;}

  document.getElementById("textAdd").onclick=()=>{
    const input=document.getElementById("textInput"), v=input.value.trim();
    if(v){
      const before=snapshot();
      state.objects.push({type:"text",id:uid(),x:+document.getElementById("textEditor").dataset.x,y:+document.getElementById("textEditor").dataset.y,text:v});
      commit(before);
    }
    closeTextEditor();
  };
  document.getElementById("textCancel").onclick=closeTextEditor;
  document.getElementById("textInput").addEventListener("keydown",e=>{if(e.key==="Enter")document.getElementById("textAdd").click();if(e.key==="Escape")closeTextEditor();});

  document.querySelectorAll(".tool").forEach(b=>b.onclick=()=>setTool(b.dataset.tool));
  document.getElementById("strokeColor").oninput=e=>state.color=e.target.value;
  document.getElementById("strokeSize").oninput=e=>state.size=+e.target.value;

  document.getElementById("undo").onclick=()=>{
    if(!state.history.length)return;
    state.future.push(snapshot()); restore(state.history.pop());
  };
  document.getElementById("redo").onclick=()=>{
    if(!state.future.length)return;
    state.history.push(snapshot()); restore(state.future.pop());
  };
  document.getElementById("deleteSelected").onclick=()=>{
    if(state.selectedId===null)return;
    const before=snapshot();
    const id=state.selectedId;
    state.objects=state.objects.filter(o=>o.id!==id);
    // Remove graph edges connected to a deleted node.
    state.objects=state.objects.filter(o=>!(o.type==="edge"&&(o.a===id||o.b===id)));
    state.selectedId=null;
    commit(before);
  };
  document.getElementById("clearBoard").onclick=()=>{
    if(!state.objects.length)return;
    if(confirm("Clear the entire whiteboard?")){
      const before=snapshot(); state.objects=[];state.selectedId=null;commit(before);
    }
  };
  document.getElementById("clearNotes").onclick=()=>{
    if(notes.value && confirm("Clear all notes?")) notes.value="";
  };
  document.getElementById("clearAll").onclick=()=>{
    if(confirm("Clear the whiteboard and notepad?")){
      state.objects=[];state.selectedId=null;state.history=[];state.future=[];notes.value="";draw();
    }
  };

  document.querySelectorAll(".tab").forEach(tab=>tab.onclick=()=>{
    document.querySelectorAll(".tab").forEach(t=>t.classList.toggle("active",t===tab));
    document.querySelectorAll(".panel").forEach(p=>p.classList.toggle("active-panel",p.id===tab.dataset.tab));
    if(tab.dataset.tab==="whiteboard") resizeCanvas();
  });

  function canvasPNG() {
    const out=document.createElement("canvas");
    const r=wrap.getBoundingClientRect(), scale=2;
    out.width=r.width*scale;out.height=r.height*scale;
    const octx=out.getContext("2d");
    octx.scale(scale,scale);
    // Temporarily render using the same drawing logic is more involved, so use canvas pixels.
    // This captures the visible whiteboard at device resolution.
    return canvas.toDataURL("image/png");
  }

  function downloadBlob(blob,name) {
    const a=document.createElement("a");
    a.href=URL.createObjectURL(blob);a.download=name;
    document.body.appendChild(a);a.click();a.remove();
    setTimeout(()=>URL.revokeObjectURL(a.href),1000);
  }

  document.getElementById("downloadAll").onclick=()=>{
    const choice=prompt("Download: 1 = Whiteboard PNG, 2 = Notes TXT, 3 = Both", "3");
    if(choice==="1") {
      const a=document.createElement("a");a.href=canvas.toDataURL("image/png");a.download="exam-whiteboard.png";a.click();
    } else if(choice==="2") {
      downloadBlob(new Blob([notes.value],{type:"text/plain;charset=utf-8"}),"exam-notes.txt");
    } else if(choice==="3") {
      const a=document.createElement("a");a.href=canvas.toDataURL("image/png");a.download="exam-whiteboard.png";a.click();
      setTimeout(()=>downloadBlob(new Blob([notes.value],{type:"text/plain;charset=utf-8"}),"exam-notes.txt"),250);
    }
  };

  // Keep text objects visible by overriding draw calls from this point onward.
  const redraw = () => drawWithText();
  window.addEventListener("resize", redraw);
  resizeCanvas();
  setTool("select");
})();
