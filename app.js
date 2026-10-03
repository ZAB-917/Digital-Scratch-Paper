(() => {
  "use strict";

  /*
    PRIVACY DESIGN

    There is intentionally NO:
    - localStorage
    - sessionStorage
    - IndexedDB
    - cookies
    - service worker
    - backend
    - analytics
    - network request
    - server-side work storage

    All workspace state exists only in JavaScript memory.
    Reloading or closing the page removes the work.
  */

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
    select: "Select and move objects. Double-click a node to edit its label.",
    pen: "Draw freehand strokes.",
    eraser: "Erase a freehand stroke by clicking near it.",
    node: "Click to place a graph node.",
    edge: "Click two nodes to connect them with an undirected edge.",
    directed: "Click two nodes to create a directed edge.",
    weight: "Click an edge to add or change its weight.",
    text: "Click the board, enter text, then press Add."
  };


  /* ---------------------------------
     Basic helpers
  --------------------------------- */

  function uid() {
    return nextId++;
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

      if (state.history.length > 100) {
        state.history.shift();
      }

      state.future = [];
    }

    draw();
  }


  /* ---------------------------------
     Canvas sizing
  --------------------------------- */

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


  /* ---------------------------------
     Coordinates
  --------------------------------- */

  function point(e) {
    const r = canvas.getBoundingClientRect();

    return {
      x: e.clientX - r.left,
      y: e.clientY - r.top
    };
  }


  /* ---------------------------------
     Object lookup
  --------------------------------- */

  function getNode(id) {
    return state.objects.find(
      o => o.id === id && o.type === "node"
    );
  }

  function nodeAt(p) {
    for (let i = state.objects.length - 1; i >= 0; i--) {
      const o = state.objects[i];

      if (
        o.type === "node" &&
        Math.hypot(o.x - p.x, o.y - p.y) <= o.r + 7
      ) {
        return o;
      }
    }

    return null;
  }


  function pointSegmentDistance(p, a, b) {
    const dx = b.x - a.x;
    const dy = b.y - a.y;

    const len2 = dx * dx + dy * dy;

    if (!len2) {
      return Math.hypot(
        p.x - a.x,
        p.y - a.y
      );
    }

    let t =
      ((p.x - a.x) * dx +
       (p.y - a.y) * dy) / len2;

    t = Math.max(0, Math.min(1, t));

    return Math.hypot(
      p.x - (a.x + t * dx),
      p.y - (a.y + t * dy)
    );
  }


  function edgeAt(p) {
    let best = null;
    let bestDistance = 9;

    for (const o of state.objects) {

      if (o.type !== "edge") {
        continue;
      }

      const a = getNode(o.a);
      const b = getNode(o.b);

      if (!a || !b) {
        continue;
      }

      const distance = pointSegmentDistance(p, a, b);

      if (distance < bestDistance) {
        bestDistance = distance;
        best = o;
      }
    }

    return best;
  }


  function strokeHit(s, p) {
    for (let i = 1; i < s.points.length; i++) {

      if (
        pointSegmentDistance(
          p,
          s.points[i - 1],
          s.points[i]
        ) <= Math.max(10, s.size + 5)
      ) {
        return true;
      }
    }

    return false;
  }


  /* ---------------------------------
     Tools
  --------------------------------- */

  function setTool(tool) {
    state.tool = tool;

    document
      .querySelectorAll(".tool")
      .forEach(button => {
        button.classList.toggle(
          "active",
          button.dataset.tool === tool
        );
      });

    document.getElementById("toolHelp").textContent =
      toolHelp[tool];

    canvas.style.cursor =
      tool === "select"
        ? "default"
        : "crosshair";

    closeAllEditors();
  }


  /* ---------------------------------
     Add objects
  --------------------------------- */

  function addNode(p) {

    const before = snapshot();

    state.objects.push({
      type: "node",
      id: uid(),
      x: p.x,
      y: p.y,
      r: 22,
      label: ""
    });

    commit(before);
  }


  function addEdge(a, b, directed) {

    if (!a || !b || a.id === b.id) {
      return;
    }

    const before = snapshot();

    state.objects.push({
      type: "edge",
      id: uid(),
      a: a.id,
      b: b.id,
      directed,
      weight: ""
    });

    commit(before);
  }


  function beginPen(p) {

    interaction = {
      kind: "pen",
      before: snapshot(),
      points: [p]
    };

    state.objects.push({
      type: "stroke",
      id: uid(),
      points: [p],
      color: state.color,
      size: state.size
    });
  }


  /* ---------------------------------
     Pointer interaction
  --------------------------------- */

  canvas.addEventListener("pointerdown", e => {

    e.preventDefault();

    const p = point(e);

    canvas.setPointerCapture(e.pointerId);

    closeAllEditors();


    /* Pen */

    if (state.tool === "pen") {
      beginPen(p);
      return;
    }


    /* Eraser */

    if (state.tool === "eraser") {

      const before = snapshot();

      const hit = state.objects.find(
        o =>
          o.type === "stroke" &&
          strokeHit(o, p)
      );

      if (hit) {

        state.objects =
          state.objects.filter(
            o => o !== hit
          );

        commit(before);
      }

      return;
    }


    /* Node */

    if (state.tool === "node") {
      addNode(p);
      return;
    }


    /* Edge / Directed Edge */

    if (
      state.tool === "edge" ||
      state.tool === "directed"
    ) {

      const n = nodeAt(p);

      if (!n) {
        return;
      }

      if (
        !interaction ||
        interaction.kind !== "edgeStart"
      ) {

        interaction = {
          kind: "edgeStart",
          node: n,
          directed:
            state.tool === "directed"
        };

        state.selectedId = n.id;

        draw();

      } else {

        const start = interaction.node;

        interaction = null;

        addEdge(
          start,
          n,
          state.tool === "directed"
        );
      }

      return;
    }


    /* Weight */

    if (state.tool === "weight") {

      const edge = edgeAt(p);

      if (edge) {
        openWeightEditor(edge, p);
      }

      return;
    }


    /* Text */

    if (state.tool === "text") {

      openTextEditor(p);

      return;
    }


    /* Select */

    if (state.tool === "select") {

      const n = nodeAt(p);

      const stroke =
        state.objects.find(
          o =>
            o.type === "stroke" &&
            strokeHit(o, p)
        );

      const edge = edgeAt(p);

      const target =
        n || stroke || edge;

      state.selectedId =
        target ? target.id : null;


      /*
        Double-clicking a node is handled separately,
        but selecting a node allows it to be moved.
      */

      if (n) {

        interaction = {
          kind: "move",
          before: snapshot(),
          node: n,
          dx: p.x - n.x,
          dy: p.y - n.y
        };
      }

      draw();
    }
  });


  canvas.addEventListener("pointermove", e => {

    if (!interaction) {
      return;
    }

    const p = point(e);


    if (interaction.kind === "pen") {

      const stroke =
        state.objects[
          state.objects.length - 1
        ];

      if (
        stroke &&
        stroke.type === "stroke"
      ) {
        stroke.points.push(p);
      }

      draw();

    } else if (interaction.kind === "move") {

      interaction.node.x =
        p.x - interaction.dx;

      interaction.node.y =
        p.y - interaction.dy;

      draw();
    }
  });


  canvas.addEventListener("pointerup", () => {

    if (!interaction) {
      return;
    }

    if (
      interaction.kind === "pen" ||
      interaction.kind === "move"
    ) {

      const before =
        interaction.before;

      interaction = null;

      commit(before);
    }
  });


  canvas.addEventListener("pointercancel", () => {
    interaction = null;
  });


  /* ---------------------------------
     Node label editing
  --------------------------------- */

  canvas.addEventListener("dblclick", e => {

    const n = nodeAt(point(e));

    if (!n) {
      return;
    }

    openNodeEditor(n);
  });


  function openNodeEditor(node) {

    closeAllEditors();

    const editor =
      document.getElementById("nodeEditor");

    const input =
      document.getElementById("nodeInput");

    editor.style.left =
      Math.min(
        node.x + 28,
        wrap.clientWidth - 230
      ) + "px";

    editor.style.top =
      Math.min(
        node.y - 20,
        wrap.clientHeight - 55
      ) + "px";

    editor.hidden = false;

    editor.dataset.nodeId =
      node.id;

    input.value =
      node.label || "";

    input.focus();
    input.select();
  }


  function applyNodeLabel() {

    const editor =
      document.getElementById("nodeEditor");

    const input =
      document.getElementById("nodeInput");

    const nodeId =
      Number(editor.dataset.nodeId);

    const node =
      getNode(nodeId);

    if (!node) {
      closeNodeEditor();
      return;
    }

    const before = snapshot();

    node.label =
      input.value.trim();

    commit(before);

    closeNodeEditor();
  }


  function closeNodeEditor() {
    document.getElementById(
      "nodeEditor"
    ).hidden = true;
  }


  document.getElementById(
    "nodeAdd"
  ).onclick = applyNodeLabel;

  document.getElementById(
    "nodeCancel"
  ).onclick = closeNodeEditor;


  document.getElementById(
    "nodeInput"
  ).addEventListener(
    "keydown",
    e => {

      if (e.key === "Enter") {
        applyNodeLabel();
      }

      if (e.key === "Escape") {
        closeNodeEditor();
      }
    }
  );


  /* ---------------------------------
     Weight editing
  --------------------------------- */

  function openWeightEditor(edge, p) {

    closeAllEditors();

    const editor =
      document.getElementById(
        "weightEditor"
      );

    const input =
      document.getElementById(
        "weightInput"
      );

    /*
      Put the editor near the clicked point.
    */

    editor.style.left =
      Math.min(
        p.x + 10,
        wrap.clientWidth - 235
      ) + "px";

    editor.style.top =
      Math.min(
        p.y - 20,
        wrap.clientHeight - 55
      ) + "px";

    editor.hidden = false;

    editor.dataset.edgeId =
      edge.id;

    input.value =
      edge.weight || "";

    input.focus();
    input.select();
  }


  function applyWeight() {

    const editor =
      document.getElementById(
        "weightEditor"
      );

    const input =
      document.getElementById(
        "weightInput"
      );

    const edgeId =
      Number(editor.dataset.edgeId);

    const edge =
      state.objects.find(
        o =>
          o.id === edgeId &&
          o.type === "edge"
      );

    if (!edge) {
      closeWeightEditor();
      return;
    }

    const before = snapshot();

    edge.weight =
      input.value.trim();

    commit(before);

    closeWeightEditor();
  }


  function closeWeightEditor() {

    document.getElementById(
      "weightEditor"
    ).hidden = true;
  }


  document.getElementById(
    "weightAdd"
  ).onclick = applyWeight;

  document.getElementById(
    "weightCancel"
  ).onclick = closeWeightEditor;


  document.getElementById(
    "weightInput"
  ).addEventListener(
    "keydown",
    e => {

      if (e.key === "Enter") {
        applyWeight();
      }

      if (e.key === "Escape") {
        closeWeightEditor();
      }
    }
  );


  /* ---------------------------------
     Text editing
  --------------------------------- */

  function openTextEditor(p) {

    closeAllEditors();

    const editor =
      document.getElementById(
        "textEditor"
      );

    editor.style.left =
      Math.min(
        p.x,
        wrap.clientWidth - 260
      ) + "px";

    editor.style.top =
      Math.min(
        p.y,
        wrap.clientHeight - 50
      ) + "px";

    editor.hidden = false;

    editor.dataset.x = p.x;
    editor.dataset.y = p.y;

    const input =
      document.getElementById(
        "textInput"
      );

    input.value = "";
    input.focus();
  }


  function closeTextEditor() {

    document.getElementById(
      "textEditor"
    ).hidden = true;
  }


  document.getElementById(
    "textAdd"
  ).onclick = () => {

    const input =
      document.getElementById(
        "textInput"
      );

    const value =
      input.value.trim();

    if (value) {

      const before = snapshot();

      state.objects.push({
        type: "text",
        id: uid(),
        x: +document.getElementById(
          "textEditor"
        ).dataset.x,
        y: +document.getElementById(
          "textEditor"
        ).dataset.y,
        text: value
      });

      commit(before);
    }

    closeTextEditor();
  };


  document.getElementById(
    "textCancel"
  ).onclick = closeTextEditor;


  document.getElementById(
    "textInput"
  ).addEventListener(
    "keydown",
    e => {

      if (e.key === "Enter") {
        document.getElementById(
          "textAdd"
        ).click();
      }

      if (e.key === "Escape") {
        closeTextEditor();
      }
    }
  );


  /* ---------------------------------
     Close editors
  --------------------------------- */

  function closeAllEditors() {

    closeTextEditor();
    closeNodeEditor();
    closeWeightEditor();
    closeConfirmEditor();
  }


  /* ---------------------------------
     Drawing
  --------------------------------- */

  function drawArrow(a, b) {

    const angle =
      Math.atan2(
        b.y - a.y,
        b.x - a.x
      );

    const length = 11;

    ctx.beginPath();

    ctx.moveTo(
      b.x,
      b.y
    );

    ctx.lineTo(
      b.x -
        length *
        Math.cos(
          angle - Math.PI / 6
        ),
      b.y -
        length *
        Math.sin(
          angle - Math.PI / 6
        )
    );

    ctx.moveTo(
      b.x,
      b.y
    );

    ctx.lineTo(
      b.x -
        length *
        Math.cos(
          angle + Math.PI / 6
        ),
      b.y -
        length *
        Math.sin(
          angle + Math.PI / 6
        )
    );

    ctx.stroke();
  }


  function draw() {

    const rect =
      wrap.getBoundingClientRect();

    ctx.clearRect(
      0,
      0,
      rect.width,
      rect.height
    );

    ctx.fillStyle = "#fff";

    ctx.fillRect(
      0,
      0,
      rect.width,
      rect.height
    );


    /* Grid */

    ctx.strokeStyle = "#eef1f4";
    ctx.lineWidth = 1;

    const grid = 24;

    for (
      let x = 0;
      x < rect.width;
      x += grid
    ) {

      ctx.beginPath();
      ctx.moveTo(x, 0);
      ctx.lineTo(x, rect.height);
      ctx.stroke();
    }

    for (
      let y = 0;
      y < rect.height;
      y += grid
    ) {

      ctx.beginPath();
      ctx.moveTo(0, y);
      ctx.lineTo(rect.width, y);
      ctx.stroke();
    }


    /* Freehand strokes */

    for (const o of state.objects) {

      if (o.type !== "stroke") {
        continue;
      }

      ctx.strokeStyle = o.color;
      ctx.lineWidth = o.size;
      ctx.lineCap = "round";
      ctx.lineJoin = "round";

      ctx.beginPath();

      o.points.forEach(
        (p, i) => {

          if (i) {
            ctx.lineTo(
              p.x,
              p.y
            );
          } else {
            ctx.moveTo(
              p.x,
              p.y
            );
          }
        }
      );

      ctx.stroke();
    }


    /* Edges */

    for (const o of state.objects) {

      if (o.type !== "edge") {
        continue;
      }

      const a = getNode(o.a);
      const b = getNode(o.b);

      if (!a || !b) {
        continue;
      }

      const dx = b.x - a.x;
      const dy = b.y - a.y;

      const len =
        Math.hypot(dx, dy) || 1;

      const ux = dx / len;
      const uy = dy / len;

      const start = {
        x: a.x + ux * a.r,
        y: a.y + uy * a.r
      };

      const end = {
        x: b.x - ux * b.r,
        y: b.y - uy * b.r
      };


      ctx.strokeStyle =
        o.id === state.selectedId
          ? "#2563eb"
          : "#374151";

      ctx.lineWidth =
        o.id === state.selectedId
          ? 3
          : 2;

      ctx.beginPath();

      ctx.moveTo(
        start.x,
        start.y
      );

      ctx.lineTo(
        end.x,
        end.y
      );

      ctx.stroke();


      if (o.directed) {
        drawArrow(start, end);
      }


      /* Weight */

      if (o.weight) {

        const mx =
          (start.x + end.x) / 2;

        const my =
          (start.y + end.y) / 2;

        ctx.font =
          "14px system-ui";

        ctx.textAlign = "center";
        ctx.textBaseline = "middle";

        const padding = 4;

        const width =
          ctx.measureText(
            o.weight
          ).width +
          padding * 2;

        ctx.fillStyle = "#fff";

        ctx.fillRect(
          mx - width / 2,
          my - 11,
          width,
          22
        );

        ctx.fillStyle =
          "#111827";

        ctx.fillText(
          o.weight,
          mx,
          my
        );
      }
    }


    /* Text */

    for (const o of state.objects) {

      if (o.type !== "text") {
        continue;
      }

      ctx.fillStyle =
        "#111827";

      ctx.font =
        "15px system-ui";

      ctx.textAlign = "left";
      ctx.textBaseline =
        "alphabetic";

      ctx.fillText(
        o.text,
        o.x,
        o.y
      );
    }


    /* Nodes */

    for (const o of state.objects) {

      if (o.type !== "node") {
        continue;
      }

      ctx.beginPath();

      ctx.arc(
        o.x,
        o.y,
        o.r,
        0,
        Math.PI * 2
      );

      ctx.fillStyle = "#fff";
      ctx.fill();

      ctx.lineWidth =
        o.id === state.selectedId
          ? 3
          : 2;

      ctx.strokeStyle =
        o.id === state.selectedId
          ? "#2563eb"
          : "#111827";

      ctx.stroke();


      if (o.label) {

        ctx.fillStyle =
          "#111827";

        ctx.font =
          "bold 14px system-ui";

        ctx.textAlign = "center";
        ctx.textBaseline =
          "middle";

        ctx.fillText(
          o.label,
          o.x,
          o.y
        );

      } else {

        ctx.fillStyle =
          "#667085";

        ctx.font =
          "11px system-ui";

        ctx.textAlign = "center";
        ctx.textBaseline =
          "middle";

        ctx.fillText(
          String(o.id),
          o.x,
          o.y
        );
      }
    }
  }


  /* ---------------------------------
     Undo / Redo
  --------------------------------- */

  document.getElementById(
    "undo"
  ).onclick = () => {

    if (!state.history.length) {
      return;
    }

    state.future.push(
      snapshot()
    );

    restore(
      state.history.pop()
    );
  };


  document.getElementById(
    "redo"
  ).onclick = () => {

    if (!state.future.length) {
      return;
    }

    state.history.push(
      snapshot()
    );

    restore(
      state.future.pop()
    );
  };


  /* ---------------------------------
     Delete
  --------------------------------- */

  document.getElementById(
    "deleteSelected"
  ).onclick = () => {

    if (state.selectedId === null) {
      return;
    }

    const before =
      snapshot();

    const id =
      state.selectedId;

    state.objects =
      state.objects.filter(
        o => o.id !== id
      );

    /*
      Remove graph edges connected
      to a deleted node.
    */

    state.objects =
      state.objects.filter(
        o =>
          !(
            o.type === "edge" &&
            (o.a === id ||
             o.b === id)
          )
      );

    state.selectedId = null;

    commit(before);
  };


  /* ---------------------------------
     In-page confirmation
  --------------------------------- */

  let pendingConfirmation = null;


  function showConfirmation(
    message,
    action
  ) {

    closeAllEditors();

    const editor =
      document.getElementById(
        "confirmEditor"
      );

    document.getElementById(
      "confirmMessage"
    ).textContent =
      message;

    pendingConfirmation =
      action;

    editor.hidden = false;
  }


  function closeConfirmEditor() {

    document.getElementById(
      "confirmEditor"
    ).hidden = true;

    pendingConfirmation = null;
  }


  document.getElementById(
    "confirmYes"
  ).onclick = () => {

    if (pendingConfirmation) {
      pendingConfirmation();
    }

    closeConfirmEditor();
  };


  document.getElementById(
    "confirmNo"
  ).onclick =
    closeConfirmEditor;


  /* ---------------------------------
     Clear board
  --------------------------------- */

  document.getElementById(
    "clearBoard"
  ).onclick = () => {

    if (!state.objects.length) {
      return;
    }

    showConfirmation(
      "Clear the entire whiteboard?",
      () => {

        const before =
          snapshot();

        state.objects = [];
        state.selectedId = null;

        commit(before);
      }
    );
  };


  /* ---------------------------------
     Clear notes
  --------------------------------- */

  document.getElementById(
    "clearNotes"
  ).onclick = () => {

    if (!notes.value) {
      return;
    }

    showConfirmation(
      "Clear all notes?",
      () => {
        notes.value = "";
      }
    );
  };


  /* ---------------------------------
     Clear everything
  --------------------------------- */

  document.getElementById(
    "clearAll"
  ).onclick = () => {

    showConfirmation(
      "Clear the whiteboard and notepad?",
      () => {

        state.objects = [];
        state.selectedId = null;
        state.history = [];
        state.future = [];

        notes.value = "";

        closeAllEditors();

        draw();
      }
    );
  };


  /* ---------------------------------
     Download
  --------------------------------- */

  function downloadBlob(
    blob,
    name
  ) {

    const url =
      URL.createObjectURL(blob);

    const a =
      document.createElement("a");

    a.href = url;
    a.download = name;

    document.body.appendChild(a);

    a.click();

    a.remove();

    setTimeout(
      () => URL.revokeObjectURL(url),
      1000
    );
  }


  function downloadWhiteboard() {

    const a =
      document.createElement("a");

    a.href =
      canvas.toDataURL(
        "image/png"
      );

    a.download =
      "exam-whiteboard.png";

    a.click();
  }


  function downloadNotes() {

    downloadBlob(
      new Blob(
        [notes.value],
        {
          type:
            "text/plain;charset=utf-8"
        }
      ),
      "exam-notes.txt"
    );
  }


  function showDownloadMenu() {

    closeAllEditors();

    const editor =
      document.getElementById(
        "confirmEditor"
      );

    const message =
      document.getElementById(
        "confirmMessage"
      );

    message.textContent =
      "Download:";

    const yes =
      document.getElementById(
        "confirmYes"
      );

    const no =
      document.getElementById(
        "confirmNo"
      );

    yes.textContent =
      "Whiteboard";

    no.textContent =
      "Notes";

    editor.hidden = false;

    pendingConfirmation = () => {};

    yes.onclick = () => {
      downloadWhiteboard();
      restoreConfirmationButtons();
      closeConfirmEditor();
    };

    no.onclick = () => {
      downloadNotes();
      restoreConfirmationButtons();
      closeConfirmEditor();
    };
  }


  function restoreConfirmationButtons() {

    const yes =
      document.getElementById(
        "confirmYes"
      );

    const no =
      document.getElementById(
        "confirmNo"
      );

    yes.textContent =
      "Confirm";

    no.textContent =
      "Cancel";

    yes.classList.add("danger");

    yes.onclick = () => {

      if (pendingConfirmation) {
        pendingConfirmation();
      }

      closeConfirmEditor();
    };

    no.onclick =
      closeConfirmEditor;
  }


  document.getElementById(
    "downloadAll"
  ).onclick = showDownloadMenu;


  /* ---------------------------------
     Tool controls
  --------------------------------- */

  document
    .querySelectorAll(".tool")
    .forEach(button => {

      button.onclick = () => {
        setTool(
          button.dataset.tool
        );
      };
    });


  document.getElementById(
    "strokeColor"
  ).oninput = e => {
    state.color =
      e.target.value;
  };


  document.getElementById(
    "strokeSize"
  ).oninput = e => {
    state.size =
      +e.target.value;
  };


  /* ---------------------------------
     Tabs
  --------------------------------- */

  document
    .querySelectorAll(".tab")
    .forEach(tab => {

      tab.onclick = () => {

        document
          .querySelectorAll(".tab")
          .forEach(t => {

            t.classList.toggle(
              "active",
              t === tab
            );
          });


        document
          .querySelectorAll(".panel")
          .forEach(panel => {

            panel.classList.toggle(
              "active-panel",
              panel.id ===
                tab.dataset.tab
            );
          });


        if (
          tab.dataset.tab ===
          "whiteboard"
        ) {
          resizeCanvas();
        }
      };
    });


  /* ---------------------------------
     Escape closes editors
  --------------------------------- */

  document.addEventListener(
    "keydown",
    e => {

      if (e.key === "Escape") {
        closeAllEditors();
      }
    }
  );


  /* ---------------------------------
     Start
  --------------------------------- */

  window.addEventListener(
    "resize",
    resizeCanvas
  );

  resizeCanvas();

  setTool("select");

})();
