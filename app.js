(() => {
  "use strict";

  const $ = (s, r = document) => r.querySelector(s);
  const $$ = (s, r = document) => [...r.querySelectorAll(s)];
  const uid = () => `${Date.now().toString(36)}${Math.random().toString(36).slice(2)}`;

  const STANDARD_COLORS = [
    ["Black", "#000000"], ["Charcoal", "#374151"], ["Slate", "#334155"],
    ["Navy", "#1e3a8a"], ["Blue", "#1d4ed8"], ["Teal", "#0f766e"],
    ["Green", "#166534"], ["Forest", "#14532d"], ["Olive", "#3f6212"],
    ["Brown", "#78350f"], ["Orange", "#c2410c"], ["Red", "#b91c1c"],
    ["Crimson", "#991b1b"], ["Purple", "#6b21a8"], ["Indigo", "#4338ca"],
    ["Magenta", "#86198f"]
  ];

  // Okabe-Ito inspired choices, supplemented with black and dark blue for white backgrounds.
  const COLORBLIND_COLORS = [
    ["Black", "#000000"], ["Blue", "#0072B2"], ["Sky Blue", "#56B4E9"],
    ["Bluish Green", "#009E73"], ["Orange", "#E69F00"], ["Vermillion", "#D55E00"],
    ["Reddish Purple", "#CC79A7"], ["Dark Blue", "#003B5C"]
  ];

  const app = $("#app");
  const dialogLayer = $("#dialogLayer");
  const instances = {};
  let activeQuestion = "q1";

  function button(text, cls = "tool-button") {
    const b = document.createElement("button");
    b.type = "button";
    b.className = cls;
    b.textContent = text;
    return b;
  }

  function group() {
    const g = document.createElement("div");
    g.className = "toolbar-group";
    return g;
  }

  function label(text) {
    const s = document.createElement("span");
    s.className = "toolbar-label";
    s.textContent = text;
    return s;
  }

  function fillColors(select, palette, current) {
    select.innerHTML = "";
    palette.forEach(([name, hex]) => {
      const o = document.createElement("option");
      o.value = hex;
      o.textContent = `${name} (${hex})`;
      select.appendChild(o);
    });
    const custom = document.createElement("option");
    custom.value = "__custom__";
    custom.textContent = "Custom color…";
    select.appendChild(custom);
    if ([...select.options].some(o => o.value === current)) select.value = current;
    else select.value = "__custom__";
  }

  function currentPalette() {
    return document.body.classList.contains("colorblind-mode") ? COLORBLIND_COLORS : STANDARD_COLORS;
  }

  function showDialog({ title, labelText, value = "", confirmText = "Save", danger = false, onConfirm }) {
    dialogLayer.innerHTML = "";
    dialogLayer.hidden = false;
    const box = document.createElement("div");
    box.className = "dialog";
    const h = document.createElement("h2"); h.textContent = title;
    box.appendChild(h);

    let input = null;
    if (labelText) {
      const l = document.createElement("label"); l.textContent = labelText;
      input = document.createElement("input"); input.value = value;
      box.append(l, input);
    }

    const actions = document.createElement("div"); actions.className = "dialog-actions";
    const cancel = button("Cancel", "secondary-button");
    const ok = button(confirmText, danger ? "danger-button" : "primary-button");
    actions.append(cancel, ok); box.appendChild(actions); dialogLayer.appendChild(box);

    const close = () => { dialogLayer.hidden = true; dialogLayer.innerHTML = ""; };
    cancel.addEventListener("click", close);
    ok.addEventListener("click", () => { onConfirm(input ? input.value : undefined); close(); });
    (input || ok).focus();
    if (input) input.select();
  }

  function confirmAction(title, message, action) {
    showDialog({
      title,
      labelText: null,
      confirmText: "Clear",
      danger: true,
      onConfirm: action
    });
    const h = $(".dialog h2", dialogLayer);
    const p = document.createElement("p"); p.textContent = message; h.after(p);
  }

  function createQuestion(id, title) {
    const shell = document.createElement("section");
    shell.className = "question-shell";
    shell.dataset.question = id;

    const tabs = document.createElement("nav");
    tabs.className = "inner-tabs";
    tabs.setAttribute("aria-label", `${title} tools`);
    const tabDefs = [
      ["whiteboard", "Whiteboard"], ["notepad", "Notepad"], ["split", "Split View"],
      ["blank", "Blank Split View"], ["accessibility", "Accessibility"], ["help", "How to Use"]
    ];
    tabDefs.forEach(([view, text], i) => {
      const b = button(text, `inner-tab${i === 0 ? " active" : ""}`);
      b.dataset.view = view;
      tabs.appendChild(b);
    });

    const stage = document.createElement("div"); stage.className = "view-stage";
    const whiteboard = document.createElement("section"); whiteboard.className = "workspace-panel visible";
    const notepad = document.createElement("section"); notepad.className = "workspace-panel";
    const split = document.createElement("section"); split.className = "split-stage";
    const blank = document.createElement("section"); blank.className = "split-stage";
    const blankBoard = document.createElement("section"); blankBoard.className = "workspace-panel";
    const blankNotes = document.createElement("section"); blankNotes.className = "workspace-panel";
    blank.append(blankBoard, blankNotes);
    const accessibility = document.createElement("section"); accessibility.className = "info-panel";
    const help = document.createElement("section"); help.className = "info-panel";

    stage.append(whiteboard, notepad, split, blank, accessibility, help);
    shell.append(tabs, stage); app.appendChild(shell);

    const primaryBoard = createWhiteboard(whiteboard, `${title} whiteboard`);
    const primaryNotes = createNotepad(notepad, `${title} notepad`);
    const blankBoardApi = createWhiteboard(blankBoard, `${title} blank whiteboard`);
    const blankNotesApi = createNotepad(blankNotes, `${title} blank notepad`);
    buildAccessibility(accessibility, id);
    buildHelp(help);

    function setView(view) {
      $$(".inner-tab", tabs).forEach(b => b.classList.toggle("active", b.dataset.view === view));
      [whiteboard, notepad].forEach(p => p.classList.remove("visible"));
      [split, blank].forEach(p => p.classList.remove("visible"));
      [accessibility, help].forEach(p => p.classList.remove("visible"));

      if (view === "whiteboard") whiteboard.classList.add("visible");
      if (view === "notepad") notepad.classList.add("visible");
      if (view === "blank") blank.classList.add("visible");
      if (view === "accessibility") accessibility.classList.add("visible");
      if (view === "help") help.classList.add("visible");
      if (view === "split") {
        split.classList.add("visible");
        split.append(whiteboard, notepad); // same DOM, same work, same full toolbars
        whiteboard.classList.add("visible"); notepad.classList.add("visible");
      } else if (!stage.contains(whiteboard) || whiteboard.parentElement === split) {
        stage.insertBefore(whiteboard, split);
        stage.insertBefore(notepad, split);
      }
      requestAnimationFrame(() => window.dispatchEvent(new Event("resize")));
    }

    $$(".inner-tab", tabs).forEach(b => b.addEventListener("click", () => setView(b.dataset.view)));

    return { shell, primaryBoard, primaryNotes, blankBoardApi, blankNotesApi, setView };
  }

  function createWhiteboard(root, ariaLabel) {
    root.innerHTML = "";
    const state = {
      objects: [], selectedId: null, tool: "select", drawColor: "#000000", nodeColor: "#000000", edgeColor: "#1d4ed8",
      penSize: 3, nodeSize: 46, edgeSize: 3, history: [], future: [], edgeStart: null
    };

    const toolbar = document.createElement("div"); toolbar.className = "toolbar";
    const tools = group();
    const toolDefs = [["select","Select"],["pen","Pen"],["eraser","Eraser"],["node","Node"],["edge","Edge"],["directed","Directed Edge"],["weight","Weight"],["text","Text"]];
    const toolButtons = {};
    toolDefs.forEach(([k,t]) => { const b=button(t); b.dataset.tool=k; toolButtons[k]=b; tools.appendChild(b); });

    const edits = group();
    const undo = button("Undo"), redo = button("Redo"), editLabel = button("Edit Label"), del = button("Delete"), clear = button("Clear Board", "danger-button");
    edits.append(undo, redo, editLabel, del, clear);

    const style = group();
    const drawColor = document.createElement("input"); drawColor.type="color"; drawColor.value=state.drawColor; drawColor.setAttribute("aria-label","Drawing color");
    const penSize = selectFrom([[1,"1px"],[2,"2px"],[3,"3px"],[5,"5px"],[8,"8px"],[12,"12px"]], 3, "Pen size");
    const nodeColor = document.createElement("select"); nodeColor.setAttribute("aria-label","Node color"); fillColors(nodeColor,currentPalette(),state.nodeColor);
    const nodeCustom = document.createElement("input"); nodeCustom.type="color"; nodeCustom.value=state.nodeColor; nodeCustom.setAttribute("aria-label","Custom node color");
    const edgeColor = document.createElement("select"); edgeColor.setAttribute("aria-label","Edge color"); fillColors(edgeColor,currentPalette(),state.edgeColor);
    const edgeCustom = document.createElement("input"); edgeCustom.type="color"; edgeCustom.value=state.edgeColor; edgeCustom.setAttribute("aria-label","Custom edge color");
    style.append(label("Draw"),drawColor,label("Pen"),penSize,label("Node"),nodeColor,nodeCustom,label("Edge"),edgeColor,edgeCustom);

    const status = document.createElement("span"); status.className="status";
    toolbar.append(tools, edits, style, status);

    const wrap = document.createElement("div"); wrap.className="canvas-wrap";
    const canvas = document.createElement("canvas"); canvas.className="board-canvas"; canvas.setAttribute("aria-label",ariaLabel); wrap.appendChild(canvas);
    root.append(toolbar,wrap);
    const ctx=canvas.getContext("2d"); let drawing=null; let drag=null;

    function selectFromLocal() {}
    function snap(){return JSON.stringify(state.objects);}
    function commit(before){const after=snap(); if(before!==after){state.history.push(before); if(state.history.length>100)state.history.shift(); state.future=[];} draw();}
    function restore(s){state.objects=JSON.parse(s);state.selectedId=null;state.edgeStart=null;draw();}
    function node(id){return state.objects.find(o=>o.type==="node"&&o.id===id);}
    function selected(){return state.objects.find(o=>o.id===state.selectedId);}
    function nextLabel(){const used=new Set(state.objects.filter(o=>o.type==="node").map(o=>Number(o.label)).filter(Number.isInteger));let n=1;while(used.has(n))n++;return String(n);}
    function point(e){const r=canvas.getBoundingClientRect();return{x:e.clientX-r.left,y:e.clientY-r.top};}
    function segDist(p,a,b){const dx=b.x-a.x,dy=b.y-a.y,l=dx*dx+dy*dy;if(!l)return Math.hypot(p.x-a.x,p.y-a.y);let t=((p.x-a.x)*dx+(p.y-a.y)*dy)/l;t=Math.max(0,Math.min(1,t));return Math.hypot(p.x-(a.x+t*dx),p.y-(a.y+t*dy));}
    function hit(p){
      for(let i=state.objects.length-1;i>=0;i--){const o=state.objects[i];if(o.type==="node"&&Math.hypot(p.x-o.x,p.y-o.y)<=(o.size||state.nodeSize)/2+6)return o;}
      for(let i=state.objects.length-1;i>=0;i--){const o=state.objects[i];if(o.type==="edge"){const a=node(o.from),b=node(o.to);if(a&&b&&segDist(p,a,b)<=Math.max(9,(o.size||state.edgeSize)+5))return o;}}
      for(let i=state.objects.length-1;i>=0;i--){const o=state.objects[i];if(o.type==="text"&&p.x>=o.x-5&&p.x<=o.x+Math.max(50,o.text.length*11)&&p.y>=o.y-28&&p.y<=o.y+8)return o;}
      for(let i=state.objects.length-1;i>=0;i--){const o=state.objects[i];if(o.type==="stroke")for(let j=1;j<o.points.length;j++)if(segDist(p,o.points[j-1],o.points[j])<=8)return o;}
      return null;
    }

    function resize(){const r=wrap.getBoundingClientRect();if(!r.width||!r.height)return;const d=Math.max(1,devicePixelRatio||1);canvas.width=Math.round(r.width*d);canvas.height=Math.round(r.height*d);canvas.style.width=r.width+"px";canvas.style.height=r.height+"px";ctx.setTransform(d,0,0,d,0,0);draw();}
    new ResizeObserver(resize).observe(wrap);

    function arrow(a,b,r){const ang=Math.atan2(b.y-a.y,b.x-a.x),x=b.x-Math.cos(ang)*r,y=b.y-Math.sin(ang)*r,s=13;ctx.beginPath();ctx.moveTo(x,y);ctx.lineTo(x-s*Math.cos(ang-Math.PI/6),y-s*Math.sin(ang-Math.PI/6));ctx.lineTo(x-s*Math.cos(ang+Math.PI/6),y-s*Math.sin(ang+Math.PI/6));ctx.closePath();ctx.fill();}

    function draw(){
      const r=wrap.getBoundingClientRect();ctx.clearRect(0,0,r.width,r.height);
      state.objects.filter(o=>o.type==="stroke").forEach(o=>{if(o.points.length<2)return;ctx.save();ctx.strokeStyle=o.color;ctx.lineWidth=o.size;ctx.lineCap="round";ctx.lineJoin="round";ctx.beginPath();ctx.moveTo(o.points[0].x,o.points[0].y);o.points.slice(1).forEach(p=>ctx.lineTo(p.x,p.y));ctx.stroke();ctx.restore();});
      state.objects.filter(o=>o.type==="edge").forEach(o=>{const a=node(o.from),b=node(o.to);if(!a||!b)return;ctx.save();ctx.strokeStyle=o.color;ctx.fillStyle=o.color;ctx.lineWidth=o.size||state.edgeSize;ctx.beginPath();ctx.moveTo(a.x,a.y);ctx.lineTo(b.x,b.y);ctx.stroke();if(o.directed)arrow(a,b,(b.size||state.nodeSize)/2);if(o.weight){ctx.font="700 18px Arial";ctx.fillText(o.weight,(a.x+b.x)/2+7,(a.y+b.y)/2-7);}ctx.restore();});
      state.objects.filter(o=>o.type==="node").forEach(o=>{const rr=(o.size||state.nodeSize)/2;ctx.save();ctx.fillStyle=getComputedStyle(document.body).getPropertyValue("--canvas").trim();ctx.strokeStyle=o.color;ctx.lineWidth=3;ctx.beginPath();ctx.arc(o.x,o.y,rr,0,Math.PI*2);ctx.fill();ctx.stroke();ctx.fillStyle=o.color;ctx.textAlign="center";ctx.textBaseline="middle";ctx.font=`700 ${Math.max(16,Math.min(34,rr*.8))}px Arial`;ctx.fillText(o.label,o.x,o.y);ctx.restore();});
      state.objects.filter(o=>o.type==="text").forEach(o=>{ctx.save();ctx.fillStyle=o.color;ctx.font=`600 ${o.size||20}px Arial`;ctx.fillText(o.text,o.x,o.y);ctx.restore();});
      const s=selected();if(s){ctx.save();ctx.strokeStyle=getComputedStyle(document.body).getPropertyValue("--selection").trim();ctx.lineWidth=3;ctx.setLineDash([7,5]);if(s.type==="node"){ctx.beginPath();ctx.arc(s.x,s.y,(s.size||state.nodeSize)/2+7,0,Math.PI*2);ctx.stroke();}else if(s.type==="edge"){const a=node(s.from),b=node(s.to);if(a&&b){ctx.beginPath();ctx.moveTo(a.x,a.y);ctx.lineTo(b.x,b.y);ctx.stroke();}}ctx.restore();}
      status.textContent=s?`Selected: ${s.type}`:`Tool: ${toolDefs.find(x=>x[0]===state.tool)?.[1]||state.tool}`;
    }

    function setTool(t){state.tool=t;state.edgeStart=null;Object.entries(toolButtons).forEach(([k,b])=>b.classList.toggle("active",k===t));canvas.classList.toggle("crosshair",t!=="select");draw();}
    Object.entries(toolButtons).forEach(([k,b])=>b.addEventListener("click",()=>setTool(k)));
    undo.addEventListener("click",()=>{if(state.history.length){state.future.push(snap());restore(state.history.pop());}});
    redo.addEventListener("click",()=>{if(state.future.length){state.history.push(snap());restore(state.future.pop());}});
    drawColor.addEventListener("input",()=>state.drawColor=drawColor.value);
    drawColor.addEventListener("change",()=>{const s=selected();if(s&&(s.type==="stroke"||s.type==="text")){const before=snap();s.color=drawColor.value;commit(before);}});
    penSize.addEventListener("change",()=>state.penSize=Number(penSize.value));

    function recolorNode(c){state.nodeColor=c;nodeCustom.value=c;const s=selected();if(s?.type==="node"){const before=snap();s.color=c;commit(before);}else draw();}
    nodeColor.addEventListener("change",()=>{if(nodeColor.value==="__custom__")nodeCustom.click();else recolorNode(nodeColor.value);});
    nodeCustom.addEventListener("input",()=>{nodeColor.value="__custom__";recolorNode(nodeCustom.value);});

    function recolorEdge(c){state.edgeColor=c;edgeCustom.value=c;const s=selected();if(s?.type==="edge"){const before=snap();s.color=c;commit(before);}else draw();}
    edgeColor.addEventListener("change",()=>{if(edgeColor.value==="__custom__")edgeCustom.click();else recolorEdge(edgeColor.value);});
    edgeCustom.addEventListener("input",()=>{edgeColor.value="__custom__";recolorEdge(edgeCustom.value);});

    editLabel.addEventListener("click",()=>{const s=selected();if(s?.type!=="node"){status.textContent="Select a node first.";return;}showDialog({title:"Edit Node Label",labelText:"Node label",value:s.label,onConfirm:v=>{if(v.trim()){const before=snap();s.label=v.trim();commit(before);}}});});
    del.addEventListener("click",()=>{const s=selected();if(!s)return;const before=snap();if(s.type==="node")state.objects=state.objects.filter(o=>o.id!==s.id&&!(o.type==="edge"&&(o.from===s.id||o.to===s.id)));else state.objects=state.objects.filter(o=>o.id!==s.id);state.selectedId=null;commit(before);});
    clear.addEventListener("click",()=>{if(!state.objects.length)return;confirmAction("Clear whiteboard?","Everything on this whiteboard will be removed.",()=>{const before=snap();state.objects=[];state.selectedId=null;commit(before);});});

    canvas.addEventListener("dblclick",e=>{if(state.tool!=="select")return;const h=hit(point(e));if(h?.type==="node"){state.selectedId=h.id;editLabel.click();}});
    canvas.addEventListener("pointerdown",e=>{
      if(e.pointerType==="mouse"&&e.button!==0)return;
      canvas.setPointerCapture?.(e.pointerId);
      const p=point(e);

      if(state.tool==="select"){
        const h=hit(p);
        state.selectedId=h?.id||null;
        drag=null;

        if(h?.type==="node"){
          drag={
            pointerId:e.pointerId,
            kind:"node",
            before:snap(),
            start:p,
            moved:false,
            nodeId:h.id,
            nodeStart:{x:h.x,y:h.y}
          };
        }else if(h?.type==="edge"){
          const a=node(h.from),b=node(h.to);
          if(a&&b){
            drag={
              pointerId:e.pointerId,
              kind:"edge",
              before:snap(),
              start:p,
              moved:false,
              fromId:a.id,
              toId:b.id,
              fromStart:{x:a.x,y:a.y},
              toStart:{x:b.x,y:b.y}
            };
          }
        }
        draw();
        return;
      }

      if(state.tool==="node"){const before=snap();state.objects.push({id:uid(),type:"node",x:p.x,y:p.y,label:nextLabel(),color:state.nodeColor,size:state.nodeSize});commit(before);return;}
      if(state.tool==="edge"||state.tool==="directed"){const h=hit(p);if(h?.type!=="node"){status.textContent="Choose a node.";return;}if(!state.edgeStart){state.edgeStart=h.id;state.selectedId=h.id;draw();}else if(state.edgeStart!==h.id){const before=snap();state.objects.push({id:uid(),type:"edge",from:state.edgeStart,to:h.id,directed:state.tool==="directed",color:state.edgeColor,size:state.edgeSize});state.edgeStart=null;state.selectedId=null;commit(before);}return;}
      if(state.tool==="weight"){const h=hit(p);if(h?.type==="edge"){state.selectedId=h.id;showDialog({title:"Edge Weight",labelText:"Weight",value:h.weight||"",onConfirm:v=>{const before=snap();h.weight=v.trim();commit(before);}});}return;}
      if(state.tool==="text"){showDialog({title:"Add Text",labelText:"Text",onConfirm:v=>{if(v.trim()){const before=snap();state.objects.push({id:uid(),type:"text",x:p.x,y:p.y,text:v.trim(),color:state.drawColor,size:20});commit(before);}}});return;}
      if(state.tool==="pen"||state.tool==="eraser"){drawing={before:snap(),erase:state.tool==="eraser",points:[p]};if(!drawing.erase)state.objects.push({id:uid(),type:"stroke",points:drawing.points,color:state.drawColor,size:state.penSize});}
    });

    canvas.addEventListener("pointermove",e=>{
      const p=point(e);

      if(drag&&e.pointerId===drag.pointerId){
        const rawDx=p.x-drag.start.x,rawDy=p.y-drag.start.y;
        if(!drag.moved&&Math.hypot(rawDx,rawDy)<4)return;
        drag.moved=true;
        const bounds=canvas.getBoundingClientRect();

        if(drag.kind==="node"){
          const n=node(drag.nodeId);
          if(n){
            const r=(n.size||state.nodeSize)/2;
            n.x=Math.max(r,Math.min(bounds.width-r,drag.nodeStart.x+rawDx));
            n.y=Math.max(r,Math.min(bounds.height-r,drag.nodeStart.y+rawDy));
          }
        }else if(drag.kind==="edge"){
          const a=node(drag.fromId),b=node(drag.toId);
          if(a&&b){
            const ar=(a.size||state.nodeSize)/2,br=(b.size||state.nodeSize)/2;
            const minDx=Math.max(ar-drag.fromStart.x,br-drag.toStart.x);
            const maxDx=Math.min(bounds.width-ar-drag.fromStart.x,bounds.width-br-drag.toStart.x);
            const minDy=Math.max(ar-drag.fromStart.y,br-drag.toStart.y);
            const maxDy=Math.min(bounds.height-ar-drag.fromStart.y,bounds.height-br-drag.toStart.y);
            const dx=Math.max(minDx,Math.min(maxDx,rawDx));
            const dy=Math.max(minDy,Math.min(maxDy,rawDy));
            a.x=drag.fromStart.x+dx;a.y=drag.fromStart.y+dy;
            b.x=drag.toStart.x+dx;b.y=drag.toStart.y+dy;
          }
        }
        draw();
        return;
      }

      if(!drawing)return;
      if(drawing.erase){
        const h=hit(p);
        if(h){
          state.objects=state.objects.filter(o=>o.id!==h.id);
          if(h.type==="node")state.objects=state.objects.filter(o=>!(o.type==="edge"&&(o.from===h.id||o.to===h.id)));
        }
      }else{
        const s=state.objects.at(-1);
        if(s?.type==="stroke")s.points.push(p);
      }
      draw();
    });

    canvas.addEventListener("pointerup",e=>{
      if(drag&&e.pointerId===drag.pointerId){
        const finished=drag;
        drag=null;
        if(finished.moved)commit(finished.before);
        else draw();
        return;
      }
      if(!drawing)return;
      const before=drawing.before;
      drawing=null;
      commit(before);
    });

    canvas.addEventListener("pointercancel",e=>{
      if(drag&&e.pointerId===drag.pointerId){
        const before=drag.before;
        drag=null;
        restore(before);
      }
      drawing=null;
    });

    setTool("select");

    return {
      state, canvas, redraw: draw,
      setNodeSize(v){state.nodeSize=Number(v);const s=selected();if(s?.type==="node"){const before=snap();s.size=state.nodeSize;commit(before);}else draw();},
      setEdgeSize(v){state.edgeSize=Number(v);const s=selected();if(s?.type==="edge"){const before=snap();s.size=state.edgeSize;commit(before);}else draw();},
      refreshPalette(){fillColors(nodeColor,currentPalette(),state.nodeColor);fillColors(edgeColor,currentPalette(),state.edgeColor);},
      exportPNG(){draw();return canvas.toDataURL("image/png");}
    };
  }

  function selectFrom(items, selected, aria) {
    const s=document.createElement("select");s.setAttribute("aria-label",aria);items.forEach(([v,t])=>{const o=document.createElement("option");o.value=v;o.textContent=t;if(String(v)===String(selected))o.selected=true;s.appendChild(o);});return s;
  }

  function createNotepad(root, ariaLabel) {
    root.innerHTML="";let savedRange=null;
    const toolbar=document.createElement("div");toolbar.className="toolbar";
    const g1=group(), insert=button("Insert Table"), clear=button("Clear Notes","danger-button");g1.append(insert,clear);
    const g2=group(), color= document.createElement("select"), custom=document.createElement("input");color.setAttribute("aria-label","Note color");fillColors(color,currentPalette(),"#000000");custom.type="color";custom.value="#000000";custom.setAttribute("aria-label","Custom note color");g2.append(label("Note color"),color,custom);
    const g3=group(), rows=numberInput(3,1,30,"Table rows"), cols=numberInput(3,1,15,"Table columns");g3.append(label("Rows"),rows,label("Columns"),cols);
    const status=document.createElement("span");status.className="status";status.textContent="Temporary notes";toolbar.append(g1,g2,g3,status);
    const editor=document.createElement("div");editor.className="notes-editor";editor.contentEditable="true";editor.setAttribute("role","textbox");editor.setAttribute("aria-multiline","true");editor.setAttribute("aria-label",ariaLabel);root.append(toolbar,editor);

    function inside(){const s=getSelection();return !!(s&&s.rangeCount&&editor.contains(s.anchorNode)&&editor.contains(s.focusNode));}
    function save(){if(inside())savedRange=getSelection().getRangeAt(0).cloneRange();}
    document.addEventListener("selectionchange",save);editor.addEventListener("keyup",save);editor.addEventListener("mouseup",save);editor.addEventListener("touchend",save);editor.addEventListener("input",save);editor.addEventListener("focus",save);
    function restore(){editor.focus();const sel=getSelection();sel.removeAllRanges();if(savedRange){try{sel.addRange(savedRange);return savedRange;}catch{savedRange=null;}}const r=document.createRange();r.selectNodeContents(editor);r.collapse(false);sel.addRange(r);return r;}
    function tableAncestor(n){let x=n?.nodeType===3?n.parentElement:n;while(x&&x!==editor){if(x.tagName==="TABLE")return x;x=x.parentElement;}return null;}
    function insertTable(){const r=restore(),table=document.createElement("table"),body=document.createElement("tbody"),rc=Math.max(1,Math.min(30,+rows.value||3)),cc=Math.max(1,Math.min(15,+cols.value||3));for(let i=0;i<rc;i++){const tr=document.createElement("tr");for(let j=0;j<cc;j++){const td=document.createElement("td");td.contentEditable="true";td.innerHTML="<br>";tr.appendChild(td);}body.appendChild(tr);}table.appendChild(body);const current=tableAncestor(r.commonAncestorContainer),spacer=document.createElement("div");spacer.innerHTML="<br>";if(current){current.after(table);table.after(spacer);}else{r.deleteContents();r.insertNode(table);table.after(spacer);}const first=$("td",table);first.focus();const nr=document.createRange();nr.selectNodeContents(first);nr.collapse(true);const sel=getSelection();sel.removeAllRanges();sel.addRange(nr);savedRange=nr.cloneRange();}
    insert.addEventListener("pointerdown",e=>{e.preventDefault();save();insertTable();});
    clear.addEventListener("click",()=>{if(!editor.innerHTML.trim())return;confirmAction("Clear notes?","All notes and tables in this notepad will be removed.",()=>{editor.innerHTML="";savedRange=null;});});
    function applyColor(c){restore();document.execCommand("foreColor",false,c);save();editor.focus();}
    color.addEventListener("pointerdown",save);custom.addEventListener("pointerdown",save);color.addEventListener("change",()=>{if(color.value==="__custom__")custom.click();else applyColor(color.value);});custom.addEventListener("input",()=>{color.value="__custom__";applyColor(custom.value);});
    editor.addEventListener("keydown",e=>{if(e.key!=="Tab")return;const cell=e.target.closest?.("td");if(!cell||!editor.contains(cell))return;e.preventDefault();const table=cell.closest("table"),cells=$$("td",table),i=cells.indexOf(cell);if(e.shiftKey){if(i>0)cells[i-1].focus();return;}if(i<cells.length-1){cells[i+1].focus();return;}const count=cell.parentElement.children.length,tr=document.createElement("tr");for(let j=0;j<count;j++){const td=document.createElement("td");td.contentEditable="true";td.innerHTML="<br>";tr.appendChild(td);}table.tBodies[0].appendChild(tr);tr.firstElementChild.focus();});
    return { editor, getHTML:()=>editor.innerHTML, refreshPalette(){const old=color.value;fillColors(color,currentPalette(),old);} };
  }

  function numberInput(value,min,max,aria){const i=document.createElement("input");i.type="number";i.value=value;i.min=min;i.max=max;i.style.width="76px";i.setAttribute("aria-label",aria);return i;}

  function buildAccessibility(root, questionId) {
    root.innerHTML=`
      <h2>Accessibility</h2>
      <p>These settings are shared across both workspaces so students do not have to configure the interface twice.</p>
      <div class="accessibility-grid">
        <div class="accessibility-card">
          <h3>Text &amp; reading</h3>
          <label>Interface and note text size
            <select data-setting="text-scale">
              <option value="0.9">90%</option><option value="1" selected>100%</option><option value="1.15">115%</option>
              <option value="1.3">130%</option><option value="1.5">150%</option><option value="1.75">175%</option><option value="2">200%</option>
            </select>
          </label>
          <label>Font
            <select data-setting="font">
              <option value="standard">Standard</option><option value="readable">High readability</option><option value="dyslexic">Dyslexia-friendly</option>
            </select>
          </label>
          <label><input type="checkbox" data-setting="spacing"> Extra line, letter, and word spacing</label>
        </div>
        <div class="accessibility-card">
          <h3>Graph visibility</h3>
          <label>Node size
            <select data-setting="node-size"><option value="34">Small</option><option value="46" selected>Standard</option><option value="60">Large</option><option value="76">Extra large</option><option value="96">Huge</option></select>
          </label>
          <label>Edge thickness
            <select data-setting="edge-size"><option value="2">Thin</option><option value="3" selected>Standard</option><option value="5">Thick</option><option value="8">Extra thick</option><option value="12">Maximum</option></select>
          </label>
          <p>When a node or edge is selected, changing its size also changes that selected object. Otherwise the setting applies to new objects.</p>
        </div>
        <div class="accessibility-card">
          <h3>Display</h3>
          <label>Theme
            <select data-setting="theme"><option value="light">Light</option><option value="dark">Dark</option><option value="contrast">High contrast</option></select>
          </label>
          <label>Color palette
            <select data-setting="palette"><option value="standard">Standard high-contrast colors</option><option value="colorblind">Colorblind-friendly palette</option></select>
          </label>
          <p>The colorblind-friendly palette avoids relying on red versus green. Graph meaning should still come from labels, weights, and arrowheads rather than color alone.</p>
        </div>
        <div class="accessibility-card">
          <h3>Interaction</h3>
          <label><input type="checkbox" data-setting="focus"> Focus mode: hide nonessential status text</label>
          <p>Controls have large touch targets, visible keyboard focus outlines, touchscreen/stylus support, and reduced-motion support when the operating system requests it.</p>
          <p>Browser zoom remains available and is not disabled by the site.</p>
        </div>
      </div>
      <p class="notice"><strong>Privacy:</strong> accessibility choices are intentionally not saved. Reloading the page returns the site to its defaults, just like the scratch work.</p>`;

    const controls = $$('[data-setting]', root);
    controls.forEach(c => c.addEventListener("change", () => applyAccessibility(c.dataset.setting, c.type === "checkbox" ? c.checked : c.value)));
  }

  function applyAccessibility(setting, value) {
    if(setting==="text-scale") document.documentElement.style.setProperty("--ui-scale", value);
    if(setting==="font"){document.body.classList.remove("font-readable","font-dyslexic");if(value==="readable")document.body.classList.add("font-readable");if(value==="dyslexic")document.body.classList.add("font-dyslexic");}
    if(setting==="spacing") document.body.classList.toggle("extra-spacing", value);
    if(setting==="theme"){document.body.classList.remove("dark-mode","high-contrast");if(value==="dark")document.body.classList.add("dark-mode");if(value==="contrast")document.body.classList.add("high-contrast");Object.values(instances).forEach(x=>{x.primaryBoard.redraw();x.blankBoardApi.redraw();});}
    if(setting==="palette"){document.body.classList.toggle("colorblind-mode",value==="colorblind");Object.values(instances).forEach(x=>{x.primaryBoard.refreshPalette();x.blankBoardApi.refreshPalette();x.primaryNotes.refreshPalette();x.blankNotesApi.refreshPalette();});}
    if(setting==="focus") document.body.classList.toggle("focus-mode", value);
    if(setting==="node-size") Object.values(instances).forEach(x=>{x.primaryBoard.setNodeSize(value);x.blankBoardApi.setNodeSize(value);});
    if(setting==="edge-size") Object.values(instances).forEach(x=>{x.primaryBoard.setEdgeSize(value);x.blankBoardApi.setEdgeSize(value);});
    syncAccessibilityControls(setting, value);
    window.dispatchEvent(new Event("resize"));
  }

  function syncAccessibilityControls(setting, value){$$(`[data-setting="${setting}"]`).forEach(c=>{if(c.type==="checkbox")c.checked=!!value;else c.value=String(value);});}

  function buildHelp(root) {
    root.innerHTML=`
      <h2>How to Use</h2>
      <p>There are two completely independent workspaces. Use the large <strong>Workspace 1</strong> and <strong>Workspace 2</strong> buttons at the top to switch between them.</p>
      <h3>Whiteboard</h3>
      <ul>
        <li><strong>Select:</strong> select a node, edge, stroke, or text object before editing or deleting it.</li>
        <li><strong>Pen / Eraser:</strong> draw or erase with a mouse, touchscreen, or stylus.</li>
        <li><strong>Node:</strong> click or tap to add nodes. Nodes automatically receive the smallest unused positive number.</li>
        <li><strong>Edit Label:</strong> select a node and choose Edit Label. Double-clicking a selected-mode node also opens the label editor.</li>
        <li><strong>Edge / Directed Edge:</strong> choose the tool, then select the first and second nodes. Directed edges receive an arrowhead.</li>
        <li><strong>Weight:</strong> choose Weight and select an edge.</li>
        <li><strong>Text:</strong> choose Text, then click or tap where the text should appear.</li>
        <li><strong>Colors:</strong> drawing color affects strokes, nodes, and text. Edge Color controls edges. Selecting an existing object before changing its color recolors it.</li>
      </ul>
      <h3>Notepad</h3>
      <ul>
        <li>Type directly into the notepad. Select text before choosing Note Color to recolor it.</li>
        <li>Set the desired row and column count, place the cursor where the table should go, then choose <strong>Insert Table</strong>.</li>
        <li>Tab moves through table cells. Pressing Tab from the final cell adds another row. Shift+Tab moves backward.</li>
      </ul>
      <h3>Split views</h3>
      <ul>
        <li><strong>Split View</strong> shows the same whiteboard and notepad side by side. All controls remain available.</li>
        <li><strong>Blank Split View</strong> is a second blank whiteboard/notepad pair inside that workspace. It stays independent from the main work during the current session.</li>
      </ul>
      <h3>Accessibility</h3>
      <p>The Accessibility tab includes text size, node size, edge thickness, dark mode, high contrast, a colorblind-friendly palette, a dyslexia-friendly font, extra text spacing, and focus mode. Accessibility settings apply to both question tabs.</p>
      <h3>Download</h3>
      <p><strong>Download Work</strong> downloads the main whiteboard and notepad for both Workspace 1 and Workspace 2. Blank Split View is intentionally not included.</p>
      <p class="notice"><strong>Nothing is saved automatically.</strong> Closing or refreshing the browser clears the work. The site does not use localStorage, sessionStorage, IndexedDB, cookies, analytics, a backend, or collaboration features.</p>`;
  }

  function downloadBlob(name, blob){const u=URL.createObjectURL(blob),a=document.createElement("a");a.href=u;a.download=name;a.click();setTimeout(()=>URL.revokeObjectURL(u),1000);}
  function dataURLBlob(url){const [meta,data]=url.split(","),mime=meta.match(/:(.*?);/)[1],raw=atob(data),arr=new Uint8Array(raw.length);for(let i=0;i<raw.length;i++)arr[i]=raw.charCodeAt(i);return new Blob([arr],{type:mime});}
  function downloadText(name,text,type="text/html"){downloadBlob(name,new Blob([text],{type}));}

  instances.q1=createQuestion("q1","Question 1");
  instances.q2=createQuestion("q2","Question 2");
  instances.q1.shell.classList.add("active");

  $$(".question-tab").forEach(tab=>tab.addEventListener("click",()=>{
    activeQuestion=tab.dataset.question;
    $$(".question-tab").forEach(t=>{const on=t===tab;t.classList.toggle("active",on);t.setAttribute("aria-selected",String(on));});
    Object.entries(instances).forEach(([id,x])=>x.shell.classList.toggle("active",id===activeQuestion));
    requestAnimationFrame(()=>window.dispatchEvent(new Event("resize")));
  }));

  $("#downloadAll").addEventListener("click",()=>{
    [["q1","question-1"],["q2","question-2"]].forEach(([id,prefix])=>{
      const x=instances[id];
      downloadBlob(`${prefix}-whiteboard.png`,dataURLBlob(x.primaryBoard.exportPNG()));
      downloadText(`${prefix}-notes.html`,`<!doctype html><html><head><meta charset="utf-8"><title>${prefix} notes</title></head><body>${x.primaryNotes.getHTML()}</body></html>`);
    });
  });
})();
