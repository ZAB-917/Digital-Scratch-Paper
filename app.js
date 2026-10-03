(() => {
  "use strict";

  /*
    DIGITAL SCRATCH PAPER

    Privacy design:
    - No localStorage
    - No sessionStorage
    - No IndexedDB
    - No cookies
    - No backend
    - No analytics
    - No network requests
    - All workspace state exists only in JavaScript memory.
    - Everything disappears when the page is refreshed or closed.

    Whiteboard:
    - Uses a virtual/infinite coordinate system.
    - Space + drag = pan
    - Middle mouse + drag = pan
    - Mouse wheel = zoom
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

  // Virtual camera.
  // x/y represent the top-left of the visible area in virtual coordinates.
  let camera = {
    x: 0,
    y: 0,
    zoom: 1
  };

  const MIN_ZOOM = 0.25;
  const MAX_ZOOM = 4;

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

  function uid() {
    return nextId++;
  }

  /* -----------------------------------------------------------
     CANVAS / CAMERA
  ----------------------------------------------------------- */

  function resizeCanvas() {
    const dpr = window.devicePixelRatio || 1;
    const rect = wrap.getBoundingClientRect();

    canvas.width = Math.max(1, Math.round(rect.width * dpr));
    canvas.height = Math.max(1, Math.round(rect.height * dpr));

    canvas.style.width = rect.width + "px";
    canvas.style.height = rect.height + "px";

    draw();
  }

  window.addEventListener("resize", resizeCanvas);

  /*
    Convert mouse/screen coordinates into virtual whiteboard coordinates.
  */
  function point(e) {
    const r = canvas.getBoundingClientRect();

    return {
      x: (e.clientX - r.left) / camera.zoom + camera.x,
      y: (e.clientY - r.top) / camera.zoom + camera.y
    };
  }

  /*
    Convert virtual whiteboard coordinates into screen coordinates.
  */
  function screenPoint(p) {
    return {
      x: (p.x - camera.x) * camera.zoom,
      y: (p.y - camera.y) * camera.zoom
    };
  }

  /*
    Change zoom while keeping the point under the mouse stationary.
  */
  function zoomAt(clientX, clientY, newZoom) {
    const rect = canvas.getBoundingClientRect();

    const mouseX = clientX - rect.left;
    const mouseY = clientY - rect.top;

    const worldX = mouseX / camera.zoom + camera.x;
    const worldY = mouseY / camera.zoom + camera.y;

    camera.zoom = Math.max(MIN_ZOOM, Math.min(MAX_ZOOM, newZoom));

    camera.x = worldX - mouseX / camera.zoom;
    camera.y = worldY - mouseY / camera.zoom;

    closeTextEditor();
    draw();
  }

  /*
    Mouse wheel zoom.
  */
  canvas.addEventListener(
    "wheel",
    e => {
      e.preventDefault();

      const factor = e.deltaY < 0 ? 1.1 : 1 / 1.1;
      zoomAt(e.clientX, e.clientY, camera.zoom * factor);
    },
    { passive: false }
  );

  /*
    Spacebar is used as the pan modifier.
  */
  let spaceHeld = false;

  window.addEventListener("keydown", e => {
    if (e.code === "Space") {
      spaceHeld = true;

      // Prevent the browser from scrolling the page while using Space.
      if (
        document.activeElement === canvas ||
        document.activeElement === document.body
      ) {
        e.preventDefault();
      }
    }
  });

  window.addEventListener("keyup", e => {
    if (e.code === "Space") {
      spaceHeld = false;
      canvas.style.cursor = state.tool === "select" ? "default" : "crosshair";
    }
  });

  /*
    Keep the page from scrolling when Space is being used over the board.
  */
  canvas.addEventListener("keydown", e => {
    if (e.code === "Space") {
      e.preventDefault();
    }
  });

  /* -----------------------------------------------------------
     HISTORY
  ----------------------------------------------------------- */

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

  /* -----------------------------------------------------------
     TOOLS
  ----------------------------------------------------------- */

  function setTool(t) {
    state.tool = t;

    document
      .querySelectorAll(".tool")
      .forEach(b =>
        b.classList.toggle("active", b.dataset.tool === t)
      );

    document.getElementById("toolHelp").textContent = toolHelp[t];

    canvas.style.cursor =
      t === "select" ? "default" : "crosshair";
  }

  function nodeAt(p) {
    /*
      Slightly larger hit area makes nodes easier to select,
      especially when zoomed out.
    */

    for (let i = state.objects.length - 1; i >= 0; i--) {
      const o = state.objects[i];

      if (
        o.type === "node" &&
        Math.hypot(o.x - p.x, o.y - p.y) <= o.r + 10 / camera.zoom
      ) {
        return o;
      }
    }

    return null;
  }

  function edgeAt(p) {
    let best = null;
    let bestD = 9 / camera.zoom;

    for (const o of state.objects) {
      if (o.type !== "edge") continue;

      const a = getNode(o.a);
      const b = getNode(o.b);

      if (!a || !b) continue;

      const d = pointSegmentDistance(p, a, b);

      if (d < bestD) {
        bestD = d;
        best = o;
      }
    }

    return best;
  }

  function getNode(id) {
    return state.objects.find(
      o => o.id === id && o.type === "node"
    );
  }

  function pointSegmentDistance(p, a, b) {
    const dx = b.x - a.x;
    const dy = b.y - a.y;
    const len2 = dx * dx + dy * dy;

    if (!len2) {
      return Math.hypot(p.x - a.x, p.y - a.y);
    }

    let t =
      ((p.x - a.x) * dx + (p.y - a.y) * dy) /
      len2;

    t = Math.max(0, Math.min(1, t));

    return Math.hypot(
      p.x - (a.x + t * dx),
      p.y - (a.y + t * dy)
    );
  }

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
    if (!a || !b || a.id === b.id) return;

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

  /* -----------------------------------------------------------
     POINTER EVENTS
  ----------------------------------------------------------- */

  canvas.addEventListener("pointerdown", e => {
    e.preventDefault();

    const p = point(e);

    canvas.setPointerCapture(e.pointerId);

    /*
      Middle mouse button = pan.
    */
    if (e.button === 1) {
      interaction = {
        kind: "pan",
        startClientX: e.clientX,
        startClientY: e.clientY,
        startCameraX: camera.x,
        startCameraY: camera.y
      };

      canvas.style.cursor = "grabbing";
      return;
    }

    /*
      Space + left mouse button = pan.
    */
    if (spaceHeld && e.button === 0) {
      interaction = {
        kind: "pan",
        startClientX: e.clientX,
        startClientY: e.clientY,
        startCameraX: camera.x,
        startCameraY: camera.y
      };

      canvas.style.cursor = "grabbing";
      return;
    }

    if (e.button !== 0) return;

    /* PEN */
    if (state.tool === "pen") {
      beginPen(p);
      return;
    }

    /* ERASER */
    if (state.tool === "eraser") {
      const before = snapshot();

      const hit = state.objects.find(
        o =>
          o.type === "stroke" &&
          strokeHit(o, p)
      );

      if (hit) {
        state.objects = state.objects.filter(
          o => o !== hit
        );

        commit(before);
      }

      return;
    }

    /* NODE */
    if (state.tool === "node") {
      addNode(p);
      return;
    }

    /* EDGE / DIRECTED EDGE */
    if (
      state.tool === "edge" ||
      state.tool === "directed"
    ) {
      const n = nodeAt(p);

      if (!n) return;

      if (
        !interaction ||
        interaction.kind !== "edgeStart"
      ) {
        interaction = {
          kind: "edgeStart",
          node: n,
          directed: state.tool === "directed"
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

    /* WEIGHT */
    if (state.tool === "weight") {
      const edge = edgeAt(p);

      if (edge) {
        const v = prompt(
          "Edge weight:",
          edge.weight || ""
        );

        if (v !== null) {
          const before = snapshot();

          edge.weight = v;

          commit(before);
        }
      }

      return;
    }

    /* TEXT */
    if (state.tool === "text") {
      openTextEditor(p);
      return;
    }

    /* SELECT */
    if (state.tool === "select") {
      const n = nodeAt(p);

      const s = state.objects.find(
        o =>
          o.type === "stroke" &&
          strokeHit(o, p)
      );

      const eobj = edgeAt(p);

      const target = n || s || eobj;

      state.selectedId = target
        ? target.id
        : null;

      /*
        Only nodes are currently movable.
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
    if (!interaction) return;

    /*
      PAN
    */
    if (interaction.kind === "pan") {
      const dx =
        e.clientX - interaction.startClientX;

      const dy =
        e.clientY - interaction.startClientY;

      camera.x =
        interaction.startCameraX -
        dx / camera.zoom;

      camera.y =
        interaction.startCameraY -
        dy / camera.zoom;

      draw();

      return;
    }

    const p = point(e);

    /*
      PEN
    */
    if (interaction.kind === "pen") {
      const stroke =
        state.objects[state.objects.length - 1];

      if (stroke && stroke.type === "stroke") {
        stroke.points.push(p);
        draw();
      }

      return;
    }

    /*
      MOVE NODE
    */
    if (interaction.kind === "move") {
      interaction.node.x =
        p.x - interaction.dx;

      interaction.node.y =
        p.y - interaction.dy;

      draw();
    }
  });

  canvas.addEventListener("pointerup", e => {
    if (!interaction) return;

    if (
      interaction.kind === "pen" ||
      interaction.kind === "move"
    ) {
      const before = interaction.before;

      interaction = null;

      commit(before);

      canvas.style.cursor =
        state.tool === "select"
          ? "default"
          : "crosshair";

      return;
    }

    if (interaction.kind === "pan") {
      interaction = null;

      canvas.style.cursor =
        state.tool === "select"
          ? "default"
          : "crosshair";

      return;
    }

    if (interaction.kind === "edgeStart") {
      /*
        Leave edge selection alone if the user releases
        without clicking another node.
      */
      return;
    }
  });

  canvas.addEventListener("pointercancel", () => {
    interaction = null;

    canvas.style.cursor =
      state.tool === "select"
        ? "default"
        : "crosshair";
  });

  /* -----------------------------------------------------------
     DOUBLE CLICK NODE LABEL
  ----------------------------------------------------------- */

  canvas.addEventListener("dblclick", e => {
    const n = nodeAt(point(e));

    if (n) {
      const v = prompt(
        "Node label:",
        n.label || ""
      );

      if (v !== null) {
        const before = snapshot();

        n.label = v;

        commit(before);
      }
    }
  });

  /* -----------------------------------------------------------
     STROKE HIT TEST
  ----------------------------------------------------------- */

  function strokeHit(s, p) {
    for (let i = 1; i < s.points.length; i++) {
      if (
        pointSegmentDistance(
          p,
          s.points[i - 1],
          s.points[i]
        ) <=
        Math.max(
          10 / camera.zoom,
          s.size + 5 / camera.zoom
        )
      ) {
        return true;
      }
    }

    return false;
  }

  /* -----------------------------------------------------------
     DRAWING
  ----------------------------------------------------------- */

  function drawArrow(a, b) {
    const ang = Math.atan2(
      b.y - a.y,
      b.x - a.x
    );

    const len = 11 / camera.zoom;

    ctx.beginPath();

    ctx.moveTo(b.x, b.y);

    ctx.lineTo(
      b.x -
        len *
          Math.cos(
            ang - Math.PI / 6
          ),
      b.y -
        len *
          Math.sin(
            ang - Math.PI / 6
          )
    );

    ctx.moveTo(b.x, b.y);

    ctx.lineTo(
      b.x -
        len *
          Math.cos(
            ang + Math.PI / 6
          ),
      b.y -
        len *
          Math.sin(
            ang + Math.PI / 6
          )
    );

    ctx.stroke();
  }

  function drawGrid(width, height) {
    /*
      Determine the virtual coordinate range currently visible.
    */
    const left = camera.x;
    const top = camera.y;

    const right =
      camera.x + width / camera.zoom;

    const bottom =
      camera.y + height / camera.zoom;

    /*
      Grid spacing in virtual coordinates.
    */
    const grid = 24;

    /*
      Start slightly before the visible area so there are
      no gaps caused by rounding.
    */
    const startX =
      Math.floor(left / grid) * grid;

    const startY =
      Math.floor(top / grid) * grid;

    ctx.strokeStyle = "#eef1f4";
    ctx.lineWidth = 1 / camera.zoom;

    ctx.beginPath();

    for (
      let x = startX;
      x <= right + grid;
      x += grid
    ) {
      ctx.moveTo(x, top);
      ctx.lineTo(x, bottom);
    }

    for (
      let y = startY;
      y <= bottom + grid;
      y += grid
    ) {
      ctx.moveTo(left, y);
      ctx.lineTo(right, y);
    }

    ctx.stroke();
  }

  function draw() {
    const rect =
      wrap.getBoundingClientRect();

    const dpr =
      window.devicePixelRatio || 1;

    /*
      Reset transform and clear the physical canvas.
    */
    ctx.setTransform(
      dpr,
      0,
      0,
      dpr,
      0,
      0
    );

    ctx.clearRect(
      0,
      0,
      rect.width,
      rect.height
    );

    /*
      White background.
    */
    ctx.fillStyle = "#fff";

    ctx.fillRect(
      0,
      0,
      rect.width,
      rect.height
    );

    /*
      Apply virtual-camera transformation.

      From this point onward, all drawing coordinates are
      virtual whiteboard coordinates.
    */
    ctx.setTransform(
      dpr * camera.zoom,
      0,
      0,
      dpr * camera.zoom,
      dpr * (-camera.x * camera.zoom),
      dpr * (-camera.y * camera.zoom)
    );

    /*
      Grid
    */
    drawGrid(
      rect.width,
      rect.height
    );

    /*
      Freehand strokes
    */
    for (const o of state.objects) {
      if (o.type !== "stroke") continue;

      ctx.strokeStyle = o.color;
      ctx.lineWidth =
        o.size / camera.zoom;

      ctx.lineCap = "round";
      ctx.lineJoin = "round";

      if (!o.points.length) continue;

      ctx.beginPath();

      o.points.forEach((p, i) => {
        if (i) {
          ctx.lineTo(p.x, p.y);
        } else {
          ctx.moveTo(p.x, p.y);
        }
      });

      ctx.stroke();
    }

    /*
      Edges
    */
    for (const o of state.objects) {
      if (o.type !== "edge") continue;

      const a = getNode(o.a);
      const b = getNode(o.b);

      if (!a || !b) continue;

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

      ctx.strokeStyle = "#374151";
      ctx.lineWidth =
        2 / camera.zoom;

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

      /*
        Edge weight
      */
      if (o.weight) {
        const mx =
          (start.x + end.x) / 2;

        const my =
          (start.y + end.y) / 2;

        ctx.font =
          `${14 / camera.zoom}px system-ui`;

        ctx.textAlign = "center";
        ctx.textBaseline = "middle";

        const pad =
          4 / camera.zoom;

        const w =
          ctx.measureText(o.weight).width +
          pad * 2;

        ctx.fillStyle = "#fff";

        ctx.fillRect(
          mx - w / 2,
          my - 11 / camera.zoom,
          w,
          22 / camera.zoom
        );

        ctx.fillStyle = "#111827";

        ctx.fillText(
          o.weight,
          mx,
          my
        );
      }
    }

    /*
      Text objects
    */
    for (const o of state.objects) {
      if (o.type !== "text") continue;

      ctx.fillStyle = "#111827";

      ctx.font =
        `${15 / camera.zoom}px system-ui`;

      ctx.textAlign = "left";
      ctx.textBaseline = "alphabetic";

      ctx.fillText(
        o.text,
        o.x,
        o.y
      );
    }

    /*
      Nodes
    */
    for (const o of state.objects) {
      if (o.type !== "node") continue;

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
        (o.id === state.selectedId ? 3 : 2) /
        camera.zoom;

      ctx.strokeStyle =
        o.id === state.selectedId
          ? "#2563eb"
          : "#111827";

      ctx.stroke();

      if (o.label) {
        ctx.fillStyle = "#111827";

        ctx.font =
          `bold ${14 / camera.zoom}px system-ui`;

        ctx.textAlign = "center";
        ctx.textBaseline = "middle";

        ctx.fillText(
          o.label,
          o.x,
          o.y
        );
      } else {
        ctx.fillStyle = "#667085";

        ctx.font =
          `${11 / camera.zoom}px system-ui`;

        ctx.textAlign = "center";
        ctx.textBaseline = "middle";

        ctx.fillText(
          String(o.id),
          o.x,
          o.y
        );
      }
    }

    /*
      Reset transform so any future screen-space drawing
      isn't affected by the virtual camera.
    */
    ctx.setTransform(
      dpr,
      0,
      0,
      dpr,
      0,
      0
    );
  }

  /* -----------------------------------------------------------
     TEXT EDITOR
  ----------------------------------------------------------- */

  function openTextEditor(p) {
    const editor =
      document.getElementById("textEditor");

    const screen =
      screenPoint(p);

    const editorWidth = 260;
    const editorHeight = 50;

    editor.style.left =
      Math.max(
        0,
        Math.min(
          screen.x,
          wrap.clientWidth -
            editorWidth
        )
      ) + "px";

    editor.style.top =
      Math.max(
        0,
        Math.min(
          screen.y,
          wrap.clientHeight -
            editorHeight
        )
      ) + "px";

    editor.hidden = false;

    editor.dataset.x = p.x;
    editor.dataset.y = p.y;

    document.getElementById(
      "textInput"
    ).value = "";

    document.getElementById(
      "textInput"
    ).focus();
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

    const v =
      input.value.trim();

    if (v) {
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
        text: v
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
        document
          .getElementById("textAdd")
          .click();
      }

      if (e.key === "Escape") {
        closeTextEditor();
      }
    }
  );

  /* -----------------------------------------------------------
     CONTROLS
  ----------------------------------------------------------- */

  document
    .querySelectorAll(".tool")
    .forEach(
      b =>
        (b.onclick = () =>
          setTool(b.dataset.tool))
    );

  document.getElementById(
    "strokeColor"
  ).oninput = e =>
    (state.color = e.target.value);

  document.getElementById(
    "strokeSize"
  ).oninput = e =>
    (state.size = +e.target.value);

  /* -----------------------------------------------------------
     UNDO / REDO
  ----------------------------------------------------------- */

  document.getElementById(
    "undo"
  ).onclick = () => {
    if (!state.history.length) return;

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
    if (!state.future.length) return;

    state.history.push(
      snapshot()
    );

    restore(
      state.future.pop()
    );
  };

  /* -----------------------------------------------------------
     DELETE SELECTED
  ----------------------------------------------------------- */

  document.getElementById(
    "deleteSelected"
  ).onclick = () => {
    if (state.selectedId === null)
      return;

    const before = snapshot();

    const id =
      state.selectedId;

    state.objects =
      state.objects.filter(
        o => o.id !== id
      );

    /*
      If a node is deleted, also remove
      edges connected to it.
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

  /* -----------------------------------------------------------
     CLEAR BOARD
  ----------------------------------------------------------- */

  document.getElementById(
    "clearBoard"
  ).onclick = () => {
    if (!state.objects.length)
      return;

    if (
      confirm(
        "Clear the entire whiteboard?"
      )
    ) {
      const before = snapshot();

      state.objects = [];
      state.selectedId = null;

      commit(before);
    }
  };

  /* -----------------------------------------------------------
     CLEAR NOTES
  ----------------------------------------------------------- */

  document.getElementById(
    "clearNotes"
  ).onclick = () => {
    if (
      notes.value &&
      confirm("Clear all notes?")
    ) {
      notes.value = "";
    }
  };

  /* -----------------------------------------------------------
     CLEAR EVERYTHING
  ----------------------------------------------------------- */

  document.getElementById(
    "clearAll"
  ).onclick = () => {
    if (
      confirm(
        "Clear the whiteboard and notepad?"
      )
    ) {
      state.objects = [];
      state.selectedId = null;
      state.history = [];
      state.future = [];

      notes.value = "";

      camera.x = 0;
      camera.y = 0;
      camera.zoom = 1;

      closeTextEditor();

      draw();
    }
  };

  /* -----------------------------------------------------------
     TABS
  ----------------------------------------------------------- */

  document
    .querySelectorAll(".tab")
    .forEach(
      tab =>
        (tab.onclick = () => {
          document
            .querySelectorAll(".tab")
            .forEach(
              t =>
                t.classList.toggle(
                  "active",
                  t === tab
                )
            );

          document
            .querySelectorAll(".panel")
            .forEach(
              p =>
                p.classList.toggle(
                  "active-panel",
                  p.id ===
                    tab.dataset.tab
                )
            );

          if (
            tab.dataset.tab ===
            "whiteboard"
          ) {
            resizeCanvas();
          }
        })
    );

  /* -----------------------------------------------------------
     DOWNLOAD
  ----------------------------------------------------------- */

  function downloadBlob(blob, name) {
    const a =
      document.createElement("a");

    a.href =
      URL.createObjectURL(blob);

    a.download = name;

    document.body.appendChild(a);

    a.click();

    a.remove();

    setTimeout(
      () =>
        URL.revokeObjectURL(
          a.href
        ),
      1000
    );
  }

  document.getElementById(
    "downloadAll"
  ).onclick = () => {
    const choice = prompt(
      "Download: 1 = Whiteboard PNG, 2 = Notes TXT, 3 = Both",
      "3"
    );

    if (choice === "1") {
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

    else if (choice === "2") {
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

    else if (choice === "3") {
      const a =
        document.createElement("a");

      a.href =
        canvas.toDataURL(
          "image/png"
        );

      a.download =
        "exam-whiteboard.png";

      a.click();

      setTimeout(
        () =>
          downloadBlob(
            new Blob(
              [notes.value],
              {
                type:
                  "text/plain;charset=utf-8"
              }
            ),
            "exam-notes.txt"
          ),
        250
      );
    }
  };

  /* -----------------------------------------------------------
     STARTUP
  ----------------------------------------------------------- */

  resizeCanvas();
  setTool("select");
})();
