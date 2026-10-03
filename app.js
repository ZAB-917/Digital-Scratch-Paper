"use strict";

/*
  =========================================================
  DIGITAL SCRATCH PAPER
  =========================================================

  There is intentionally NO:

  - localStorage
  - sessionStorage
  - IndexedDB
  - cookies
  - server storage
  - analytics
  - accounts
  - network requests

  Existing Split View uses the SAME whiteboard and notepad
  as the normal tabs.

  Blank Split View has its own independent workspace.
*/


/* =========================================================
   GENERAL HELPERS
   ========================================================= */

function deepClone(value) {
  return JSON.parse(JSON.stringify(value));
}

function downloadBlob(blob, filename) {
  const url = URL.createObjectURL(blob);

  const link = document.createElement("a");

  link.href = url;
  link.download = filename;

  document.body.appendChild(link);

  link.click();

  link.remove();

  setTimeout(() => {
    URL.revokeObjectURL(url);
  }, 1000);
}

function downloadText(text, filename, type = "text/plain") {
  downloadBlob(
    new Blob([text], { type }),
    filename
  );
}


/* =========================================================
   WHITEBOARD FACTORY
   ========================================================= */

function createWhiteboard(config) {

  const {
    canvas,
    boardWrap,

    toolButtons,
    colorInput,
    sizeInput,

    undoButton,
    redoButton,
    deleteButton,
    clearButton,

    toolHelp,

    textEditor,
    textInput,
    textAdd,
    textCancel,

    nodeEditor,
    nodeInput,
    nodeAdd,
    nodeCancel,

    weightEditor,
    weightInput,
    weightAdd,
    weightCancel
  } = config;


  const ctx = canvas.getContext("2d");


  const state = {

    objects: [],

    selectedId: null,

    tool: "select",

    color: colorInput.value,

    size: Number(sizeInput.value),

    history: [],

    future: []

  };


  let pendingNodePosition = null;

  let pendingTextPosition = null;

  let pendingWeightId = null;

  let pendingEdgeNodeId = null;

  let draggingNodeId = null;

  let dragBefore = null;

  let drawing = false;

  let currentStroke = null;

  let lastPoint = null;


  const toolDescriptions = {

    select: "Select and move objects.",

    pen: "Draw freehand.",

    eraser: "Erase freehand strokes.",

    node: "Click the board to place a node.",

    edge: "Click two nodes to create an edge.",

    directed: "Click two nodes to create a directed edge.",

    weight: "Click an edge to add or edit its weight.",

    text: "Click the board to place text."

  };


  function makeId() {
    return (
      Date.now().toString(36) +
      Math.random().toString(36).slice(2)
    );
  }


  function snapshot() {
    return deepClone(state.objects);
  }


  function commitMutation(before) {

    const after = JSON.stringify(state.objects);

    const beforeString = JSON.stringify(before);

    if (after === beforeString) {
      return;
    }

    state.history.push(before);

    if (state.history.length > 100) {
      state.history.shift();
    }

    state.future = [];
  }


  function restore(objects) {

    state.objects = deepClone(objects);

    state.selectedId = null;

    pendingEdgeNodeId = null;

    draw();
  }


  function undo() {

    if (!state.history.length) {
      return;
    }

    const previous = state.history.pop();

    state.future.push(snapshot());

    restore(previous);
  }


  function redo() {

    if (!state.future.length) {
      return;
    }

    const next = state.future.pop();

    state.history.push(snapshot());

    restore(next);
  }


  function getPoint(event) {

    const rect = canvas.getBoundingClientRect();

    return {
      x: event.clientX - rect.left,
      y: event.clientY - rect.top
    };
  }


  function resize() {

    const rect = boardWrap.getBoundingClientRect();

    if (rect.width <= 0 || rect.height <= 0) {
      return;
    }

    const dpr = window.devicePixelRatio || 1;

    canvas.width = Math.max(
      1,
      Math.floor(rect.width * dpr)
    );

    canvas.height = Math.max(
      1,
      Math.floor(rect.height * dpr)
    );

    canvas.style.width = `${rect.width}px`;
    canvas.style.height = `${rect.height}px`;

    ctx.setTransform(
      dpr,
      0,
      0,
      dpr,
      0,
      0
    );

    draw();
  }


  function distance(a, b) {

    return Math.hypot(
      a.x - b.x,
      a.y - b.y
    );
  }


  function distanceToSegment(point, a, b) {

    const dx = b.x - a.x;
    const dy = b.y - a.y;

    if (dx === 0 && dy === 0) {
      return distance(point, a);
    }

    const t = Math.max(
      0,
      Math.min(
        1,
        (
          (point.x - a.x) * dx +
          (point.y - a.y) * dy
        ) /
        (dx * dx + dy * dy)
      )
    );

    const projection = {
      x: a.x + t * dx,
      y: a.y + t * dy
    };

    return distance(point, projection);
  }


  function findNodeAt(point) {

    for (let i = state.objects.length - 1; i >= 0; i--) {

      const object = state.objects[i];

      if (object.type !== "node") {
        continue;
      }

      if (
        distance(
          point,
          {
            x: object.x,
            y: object.y
          }
        ) <= 25
      ) {
        return object;
      }

    }

    return null;
  }


  function findEdgeAt(point) {

    for (let i = state.objects.length - 1; i >= 0; i--) {

      const object = state.objects[i];

      if (
        object.type !== "edge" &&
        object.type !== "directed"
      ) {
        continue;
      }

      const from = findObjectById(object.from);
      const to = findObjectById(object.to);

      if (!from || !to) {
        continue;
      }

      const distanceToLine = distanceToSegment(
        point,
        {
          x: from.x,
          y: from.y
        },
        {
          x: to.x,
          y: to.y
        }
      );

      if (distanceToLine <= 10) {
        return object;
      }

    }

    return null;
  }


  function findStrokeAt(point) {

    for (let i = state.objects.length - 1; i >= 0; i--) {

      const object = state.objects[i];

      if (object.type !== "stroke") {
        continue;
      }

      for (let j = 1; j < object.points.length; j++) {

        if (
          distanceToSegment(
            point,
            object.points[j - 1],
            object.points[j]
          ) <= Math.max(10, object.size + 5)
        ) {
          return object;
        }

      }

    }

    return null;
  }


  function findObjectAt(point) {

    const node = findNodeAt(point);

    if (node) {
      return node;
    }

    const edge = findEdgeAt(point);

    if (edge) {
      return edge;
    }

    return findStrokeAt(point);
  }


  function findObjectById(id) {

    return state.objects.find(
      object => object.id === id
    );
  }


  function edgeEndpoints(edge) {

    const from = findObjectById(edge.from);
    const to = findObjectById(edge.to);

    if (!from || !to) {
      return null;
    }

    const dx = to.x - from.x;
    const dy = to.y - from.y;

    const length = Math.hypot(dx, dy);

    if (!length) {
      return null;
    }

    const radius = 22;

    const ux = dx / length;
    const uy = dy / length;

    return {

      start: {
        x: from.x + ux * radius,
        y: from.y + uy * radius
      },

      end: {
        x: to.x - ux * radius,
        y: to.y - uy * radius
      }

    };
  }


  function drawArrowhead(end, start) {

    const angle = Math.atan2(
      end.y - start.y,
      end.x - start.x
    );

    const size = 10;

    ctx.beginPath();

    ctx.moveTo(end.x, end.y);

    ctx.lineTo(
      end.x - size * Math.cos(angle - Math.PI / 6),
      end.y - size * Math.sin(angle - Math.PI / 6)
    );

    ctx.lineTo(
      end.x - size * Math.cos(angle + Math.PI / 6),
      end.y - size * Math.sin(angle + Math.PI / 6)
    );

    ctx.closePath();

    ctx.fill();
  }


  function drawEdge(object) {

    const endpoints = edgeEndpoints(object);

    if (!endpoints) {
      return;
    }

    const {
      start,
      end
    } = endpoints;

    ctx.save();

    ctx.strokeStyle = "#374151";

    ctx.lineWidth = 2;

    ctx.beginPath();

    ctx.moveTo(start.x, start.y);

    ctx.lineTo(end.x, end.y);

    ctx.stroke();

    if (object.type === "directed") {

      ctx.fillStyle = "#374151";

      drawArrowhead(end, start);
    }

    if (
      object.weight !== undefined &&
      object.weight !== ""
    ) {

      const midX =
        (start.x + end.x) / 2;

      const midY =
        (start.y + end.y) / 2;

      ctx.fillStyle = "#111827";

      ctx.font =
        "14px system-ui, sans-serif";

      ctx.textAlign = "center";

      ctx.textBaseline = "middle";

      ctx.fillText(
        String(object.weight),
        midX,
        midY - 10
      );
    }

    ctx.restore();
  }


  function drawStroke(object) {

    if (!object.points.length) {
      return;
    }

    ctx.save();

    ctx.strokeStyle = object.color;

    ctx.lineWidth = object.size;

    ctx.lineCap = "round";

    ctx.lineJoin = "round";

    ctx.beginPath();

    ctx.moveTo(
      object.points[0].x,
      object.points[0].y
    );

    for (let i = 1; i < object.points.length; i++) {

      ctx.lineTo(
        object.points[i].x,
        object.points[i].y
      );

    }

    ctx.stroke();

    ctx.restore();
  }


  function drawNode(object) {

    const selected =
      object.id === state.selectedId;

    ctx.save();

    ctx.beginPath();

    ctx.arc(
      object.x,
      object.y,
      22,
      0,
      Math.PI * 2
    );

    ctx.fillStyle = "white";

    ctx.fill();

    ctx.lineWidth = selected ? 4 : 2;

    ctx.strokeStyle =
      selected ? "#2563eb" : "#111827";

    ctx.stroke();

    if (object.label) {

      ctx.fillStyle = "#111827";

      ctx.font =
        "15px system-ui, sans-serif";

      ctx.textAlign = "center";

      ctx.textBaseline = "middle";

      ctx.fillText(
        object.label,
        object.x,
        object.y
      );

    }

    ctx.restore();
  }


  function drawText(object) {

    ctx.save();

    ctx.fillStyle = object.color;

    ctx.font =
      `${Math.max(12, object.size * 5)}px system-ui, sans-serif`;

    ctx.textAlign = "left";

    ctx.textBaseline = "top";

    ctx.fillText(
      object.text,
      object.x,
      object.y
    );

    ctx.restore();
  }


  function drawSelection(object) {

    if (!object || object.type === "node") {
      return;
    }

    if (object.type === "stroke") {

      if (!object.points.length) {
        return;
      }

      ctx.save();

      ctx.strokeStyle = "#2563eb";

      ctx.lineWidth = object.size + 7;

      ctx.globalAlpha = 0.18;

      ctx.lineCap = "round";

      ctx.lineJoin = "round";

      ctx.beginPath();

      ctx.moveTo(
        object.points[0].x,
        object.points[0].y
      );

      for (let i = 1; i < object.points.length; i++) {

        ctx.lineTo(
          object.points[i].x,
          object.points[i].y
        );

      }

      ctx.stroke();

      ctx.restore();

      return;
    }

    if (
      object.type === "edge" ||
      object.type === "directed"
    ) {

      const endpoints =
        edgeEndpoints(object);

      if (!endpoints) {
        return;
      }

      ctx.save();

      ctx.strokeStyle = "#2563eb";

      ctx.lineWidth = 7;

      ctx.globalAlpha = 0.18;

      ctx.beginPath();

      ctx.moveTo(
        endpoints.start.x,
        endpoints.start.y
      );

      ctx.lineTo(
        endpoints.end.x,
        endpoints.end.y
      );

      ctx.stroke();

      ctx.restore();

    }

  }


  function draw() {

    const rect =
      boardWrap.getBoundingClientRect();

    if (
      rect.width <= 0 ||
      rect.height <= 0
    ) {
      return;
    }

    ctx.clearRect(
      0,
      0,
      rect.width,
      rect.height
    );


    /*
      Edges first.
    */

    for (const object of state.objects) {

      if (
        object.type === "edge" ||
        object.type === "directed"
      ) {
        drawEdge(object);
      }

    }


    /*
      Freehand strokes.
    */

    for (const object of state.objects) {

      if (object.type === "stroke") {
        drawStroke(object);
      }

    }


    /*
      Text.
    */

    for (const object of state.objects) {

      if (object.type === "text") {
        drawText(object);
      }

    }


    /*
      Nodes last so they sit above edges.
    */

    for (const object of state.objects) {

      if (object.type === "node") {
        drawNode(object);
      }

    }


    const selected =
      findObjectById(state.selectedId);

    if (selected) {
      drawSelection(selected);

      if (selected.type === "node") {
        drawNode(selected);
      }
    }


    /*
      Temporary edge source indicator.
    */

    if (pendingEdgeNodeId) {

      const node =
        findObjectById(pendingEdgeNodeId);

      if (node) {

        ctx.save();

        ctx.beginPath();

        ctx.arc(
          node.x,
          node.y,
          27,
          0,
          Math.PI * 2
        );

        ctx.strokeStyle = "#2563eb";

        ctx.lineWidth = 3;

        ctx.setLineDash([5, 4]);

        ctx.stroke();

        ctx.restore();

      }

    }

  }


  function hideEditors() {

    textEditor.hidden = true;

    nodeEditor.hidden = true;

    weightEditor.hidden = true;
  }


  function showEditor(editor, x, y) {

    editor.hidden = false;

    const rect =
      boardWrap.getBoundingClientRect();

    requestAnimationFrame(() => {

      const width = editor.offsetWidth;
      const height = editor.offsetHeight;

      const left = Math.max(
        5,
        Math.min(
          x,
          rect.width - width - 5
        )
      );

      const top = Math.max(
        5,
        Math.min(
          y,
          rect.height - height - 5
        )
      );

      editor.style.left = `${left}px`;
      editor.style.top = `${top}px`;

    });
  }


  function setTool(tool) {

    state.tool = tool;

    pendingEdgeNodeId = null;

    hideEditors();

    toolButtons.forEach(button => {

      button.classList.toggle(
        "active",
        button.dataset.tool === tool
      );

    });

    toolHelp.textContent =
      toolDescriptions[tool];

    draw();
  }


  function removeObject(id) {

    const index =
      state.objects.findIndex(
        object => object.id === id
      );

    if (index === -1) {
      return;
    }

    const before = snapshot();

    state.objects.splice(index, 1);

    state.selectedId = null;

    commitMutation(before);

    draw();
  }


  function openTextEditor(point) {

    pendingTextPosition = point;

    textInput.value = "";

    showEditor(
      textEditor,
      point.x + 8,
      point.y + 8
    );

    textInput.focus();
  }


  function addText() {

    const value =
      textInput.value.trim();

    if (!value || !pendingTextPosition) {
      hideEditors();
      return;
    }

    const before = snapshot();

    state.objects.push({

      id: makeId(),

      type: "text",

      x: pendingTextPosition.x,

      y: pendingTextPosition.y,

      text: value,

      color: state.color,

      size: state.size

    });

    commitMutation(before);

    pendingTextPosition = null;

    hideEditors();

    draw();
  }


  function openNodeEditor(point) {

    pendingNodePosition = point;

    nodeInput.value = "";

    showEditor(
      nodeEditor,
      point.x + 8,
      point.y + 8
    );

    nodeInput.focus();
  }


  function addNode() {

    if (!pendingNodePosition) {
      return;
    }

    const before = snapshot();

    state.objects.push({

      id: makeId(),

      type: "node",

      x: pendingNodePosition.x,

      y: pendingNodePosition.y,

      label: nodeInput.value.trim()

    });

    commitMutation(before);

    pendingNodePosition = null;

    hideEditors();

    draw();
  }


  function openWeightEditor(edge) {

    pendingWeightId = edge.id;

    weightInput.value =
      edge.weight ?? "";

    const endpoints =
      edgeEndpoints(edge);

    if (!endpoints) {
      return;
    }

    const x =
      (endpoints.start.x + endpoints.end.x) / 2;

    const y =
      (endpoints.start.y + endpoints.end.y) / 2;

    showEditor(
      weightEditor,
      x + 8,
      y + 8
    );

    weightInput.focus();
  }


  function applyWeight() {

    if (!pendingWeightId) {
      return;
    }

    const edge =
      findObjectById(pendingWeightId);

    if (!edge) {
      hideEditors();
      return;
    }

    const before = snapshot();

    edge.weight =
      weightInput.value.trim();

    commitMutation(before);

    pendingWeightId = null;

    hideEditors();

    draw();
  }


  function createEdge(type, firstNode, secondNode) {

    if (
      !firstNode ||
      !secondNode ||
      firstNode.id === secondNode.id
    ) {
      return;
    }

    const before = snapshot();

    state.objects.push({

      id: makeId(),

      type,

      from: firstNode.id,

      to: secondNode.id,

      weight: ""

    });

    commitMutation(before);

    state.selectedId =
      state.objects[state.objects.length - 1].id;

    draw();
  }


  function handleEdgeTool(point) {

    const node =
      findNodeAt(point);

    if (!node) {
      return;
    }

    if (!pendingEdgeNodeId) {

      pendingEdgeNodeId = node.id;

      state.selectedId = node.id;

      toolHelp.textContent =
        "Click another node to create the edge.";

      draw();

      return;
    }


    const first =
      findObjectById(pendingEdgeNodeId);

    const second = node;

    const type =
      state.tool === "directed"
        ? "directed"
        : "edge";

    createEdge(
      type,
      first,
      second
    );

    pendingEdgeNodeId = null;

    toolHelp.textContent =
      toolDescriptions[state.tool];

    draw();
  }


  function eraseAt(point) {

    const object =
      findStrokeAt(point);

    if (!object) {
      return;
    }

    const before = snapshot();

    state.objects =
      state.objects.filter(
        item => item.id !== object.id
      );

    commitMutation(before);

    draw();
  }


  function pointerDown(event) {

    if (event.pointerType === "mouse" && event.button !== 0) {
      return;
    }

    const point =
      getPoint(event);

    canvas.setPointerCapture?.(
      event.pointerId
    );


    if (state.tool === "pen") {

      drawing = true;

      currentStroke = {

        id: makeId(),

        type: "stroke",

        points: [point],

        color: state.color,

        size: state.size

      };

      state.objects.push(currentStroke);

      lastPoint = point;

      draw();

      return;
    }


    if (state.tool === "eraser") {

      drawing = true;

      eraseAt(point);

      return;
    }


    if (
      state.tool === "edge" ||
      state.tool === "directed"
    ) {

      handleEdgeTool(point);

      return;
    }


    if (state.tool === "node") {

      openNodeEditor(point);

      return;
    }


    if (state.tool === "text") {

      openTextEditor(point);

      return;
    }


    if (state.tool === "weight") {

      const edge =
        findEdgeAt(point);

      if (edge) {
        openWeightEditor(edge);
      }

      return;
    }


    if (state.tool === "select") {

      const object =
        findObjectAt(point);

      state.selectedId =
        object ? object.id : null;

      if (
        object &&
        object.type === "node"
      ) {

        draggingNodeId = object.id;

        dragBefore = snapshot();

        canvas.style.cursor = "grabbing";
      }

      draw();

    }

  }


  function pointerMove(event) {

    const point =
      getPoint(event);


    if (state.tool === "pen" && drawing) {

      if (!currentStroke) {
        return;
      }

      currentStroke.points.push(point);

      lastPoint = point;

      draw();

      return;
    }


    if (state.tool === "eraser" && drawing) {

      eraseAt(point);

      return;
    }


    if (
      state.tool === "select" &&
      draggingNodeId
    ) {

      const node =
        findObjectById(draggingNodeId);

      if (!node) {
        return;
      }

      node.x = point.x;

      node.y = point.y;

      draw();

    }

  }


  function pointerUp(event) {

    if (state.tool === "pen" && drawing) {

      drawing = false;

      if (currentStroke) {

        if (
          currentStroke.points.length === 1
        ) {

          const p =
            currentStroke.points[0];

          currentStroke.points.push({
            x: p.x + 0.1,
            y: p.y + 0.1
          });

        }

        state.history.push(
          state.objects
            .slice(0, -1)
            .map(item => deepClone(item))
        );

        if (state.history.length > 100) {
          state.history.shift();
        }

        state.future = [];
      }

      currentStroke = null;

      lastPoint = null;

      draw();

    }


    if (state.tool === "eraser") {

      drawing = false;

    }


    if (
      state.tool === "select" &&
      draggingNodeId
    ) {

      commitMutation(dragBefore);

      draggingNodeId = null;

      dragBefore = null;

      canvas.style.cursor = "crosshair";

      draw();

    }


    canvas.releasePointerCapture?.(
      event.pointerId
    );

  }


  function pointerCancel(event) {
    pointerUp(event);
  }


  toolButtons.forEach(button => {

    button.addEventListener(
      "click",
      () => {
        setTool(button.dataset.tool);
      }
    );

  });


  colorInput.addEventListener(
    "input",
    () => {
      state.color = colorInput.value;
    }
  );


  sizeInput.addEventListener(
    "input",
    () => {
      state.size =
        Number(sizeInput.value);
    }
  );


  undoButton.addEventListener(
    "click",
    undo
  );


  redoButton.addEventListener(
    "click",
    redo
  );


  deleteButton.addEventListener(
    "click",
    () => {

      if (state.selectedId) {
        removeObject(state.selectedId);
      }

    }
  );


  clearButton.addEventListener(
    "click",
    () => {

      if (!state.objects.length) {
        return;
      }

      const before = snapshot();

      state.objects = [];

      state.selectedId = null;

      pendingEdgeNodeId = null;

      state.history.push(before);

      state.future = [];

      draw();

    }
  );


  textAdd.addEventListener(
    "click",
    addText
  );


  textCancel.addEventListener(
    "click",
    () => {
      pendingTextPosition = null;
      hideEditors();
    }
  );


  nodeAdd.addEventListener(
    "click",
    addNode
  );


  nodeCancel.addEventListener(
    "click",
    () => {
      pendingNodePosition = null;
      hideEditors();
    }
  );


  weightAdd.addEventListener(
    "click",
    applyWeight
  );


  weightCancel.addEventListener(
    "click",
    () => {
      pendingWeightId = null;
      hideEditors();
    }
  );


  [textInput, nodeInput, weightInput]
    .forEach(input => {

      input.addEventListener(
        "keydown",
        event => {

          if (event.key === "Enter") {

            event.preventDefault();

            if (input === textInput) {
              addText();
            }

            if (input === nodeInput) {
              addNode();
            }

            if (input === weightInput) {
              applyWeight();
            }

          }

          if (event.key === "Escape") {

            event.preventDefault();

            hideEditors();

          }

        }
      );

    });


  canvas.addEventListener(
    "pointerdown",
    pointerDown
  );

  canvas.addEventListener(
    "pointermove",
    pointerMove
  );

  canvas.addEventListener(
    "pointerup",
    pointerUp
  );

  canvas.addEventListener(
    "pointercancel",
    pointerCancel
  );


  window.addEventListener(
    "resize",
    resize
  );


  resize();


  return {

    resize,

    clear() {

      if (!state.objects.length) {
        return;
      }

      state.history.push(
        snapshot()
      );

      state.objects = [];

      state.selectedId = null;

      state.future = [];

      draw();

    },

    getCanvas() {
      return canvas;
    },

    getObjects() {
      return deepClone(state.objects);
    },

    downloadPNG(filename) {

      canvas.toBlob(
        blob => {

          if (blob) {
            downloadBlob(
              blob,
              filename
            );
          }

        },
        "image/png"
      );

    }

  };

}


/* =========================================================
   PRIMARY WHITEBOARD
   ========================================================= */

const mainBoard =
  createWhiteboard({

    canvas:
      document.getElementById("board"),

    boardWrap:
      document.getElementById("boardWrap"),

    toolButtons:
      document.querySelectorAll(
        '.tool[data-workspace="main"]'
      ),

    colorInput:
      document.getElementById("strokeColor"),

    sizeInput:
      document.getElementById("strokeSize"),

    undoButton:
      document.getElementById("undo"),

    redoButton:
      document.getElementById("redo"),

    deleteButton:
      document.getElementById("deleteSelected"),

    clearButton:
      document.getElementById("clearBoard"),

    toolHelp:
      document.getElementById("toolHelp"),

    textEditor:
      document.getElementById("textEditor"),

    textInput:
      document.getElementById("textInput"),

    textAdd:
      document.getElementById("textAdd"),

    textCancel:
      document.getElementById("textCancel"),

    nodeEditor:
      document.getElementById("nodeEditor"),

    nodeInput:
      document.getElementById("nodeInput"),

    nodeAdd:
      document.getElementById("nodeAdd"),

    nodeCancel:
      document.getElementById("nodeCancel"),

    weightEditor:
      document.getElementById("weightEditor"),

    weightInput:
      document.getElementById("weightInput"),

    weightAdd:
      document.getElementById("weightAdd"),

    weightCancel:
      document.getElementById("weightCancel")

  });


/* =========================================================
   BLANK WHITEBOARD
   ========================================================= */

const blankBoard =
  createWhiteboard({

    canvas:
      document.getElementById("blankBoard"),

    boardWrap:
      document.getElementById("blankBoardWrap"),

    toolButtons:
      document.querySelectorAll(
        '.tool[data-workspace="blank"]'
      ),

    colorInput:
      document.getElementById("blankStrokeColor"),

    sizeInput:
      document.getElementById("blankStrokeSize"),

    undoButton:
      document.getElementById("blankUndo"),

    redoButton:
      document.getElementById("blankRedo"),

    deleteButton:
      document.getElementById(
        "blankDeleteSelected"
      ),

    clearButton:
      document.getElementById("blankClearBoard"),

    toolHelp:
      document.getElementById("blankToolHelp"),

    textEditor:
      document.getElementById("blankTextEditor"),

    textInput:
      document.getElementById("blankTextInput"),

    textAdd:
      document.getElementById("blankTextAdd"),

    textCancel:
      document.getElementById(
        "blankTextCancel"
      ),

    nodeEditor:
      document.getElementById("blankNodeEditor"),

    nodeInput:
      document.getElementById("blankNodeInput"),

    nodeAdd:
      document.getElementById("blankNodeAdd"),

    nodeCancel:
      document.getElementById(
        "blankNodeCancel"
      ),

    weightEditor:
      document.getElementById("blankWeightEditor"),

    weightInput:
      document.getElementById("blankWeightInput"),

    weightAdd:
      document.getElementById("blankWeightAdd"),

    weightCancel:
      document.getElementById(
        "blankWeightCancel"
      )

  });


/* =========================================================
   NOTEPAD FACTORY
   ========================================================= */

function createNotepad(config) {

  const {
    notes,
    insertTableButton,
    clearNotesButton,
    tableEditor,
    tableRows,
    tableColumns,
    tableInsertButton,
    tableCancelButton
  } = config;


  let savedRange = null;


  function saveSelection() {

    const selection =
      window.getSelection();

    if (
      !selection ||
      !selection.rangeCount
    ) {
      return;
    }

    const range =
      selection.getRangeAt(0);

    if (
      notes.contains(
        range.commonAncestorContainer
      )
    ) {

      savedRange =
        range.cloneRange();

    }

  }


  function restoreSelection() {

    if (!savedRange) {
      return false;
    }

    const selection =
      window.getSelection();

    selection.removeAllRanges();

    selection.addRange(
      savedRange.cloneRange()
    );

    return true;
  }


  function placeCaretAtEnd() {

    notes.focus();

    const range =
      document.createRange();

    range.selectNodeContents(notes);

    range.collapse(false);

    const selection =
      window.getSelection();

    selection.removeAllRanges();

    selection.addRange(range);
  }


  function insertTable() {

    let rows =
      Number(tableRows.value);

    let columns =
      Number(tableColumns.value);

    rows =
      Math.max(
        1,
        Math.min(30, rows)
      );

    columns =
      Math.max(
        1,
        Math.min(20, columns)
      );


    const table =
      document.createElement("table");


    for (let r = 0; r < rows; r++) {

      const row =
        document.createElement("tr");

      for (let c = 0; c < columns; c++) {

        const cell =
          document.createElement("td");

        cell.contentEditable = "true";

        cell.tabIndex = 0;

        cell.innerHTML = "";

        row.appendChild(cell);

      }

      table.appendChild(row);

    }


    notes.focus();


    const restored =
      restoreSelection();


    let range;

    if (
      restored &&
      savedRange &&
      notes.contains(
        savedRange.commonAncestorContainer
      )
    ) {

      range =
        window.getSelection()
          .getRangeAt(0);

    } else {

      placeCaretAtEnd();

      range =
        window.getSelection()
          .getRangeAt(0);

    }


    /*
      Prevent inserting a table inside
      an existing table cell.
    */

    let startElement =
      range.startContainer;

    if (
      startElement.nodeType !== 1
    ) {
      startElement =
        startElement.parentElement;
    }


    const containingCell =
      startElement?.closest?.("td");


    if (containingCell) {

      const containingTable =
        containingCell.closest("table");

      containingTable.after(table);

    } else {

      range.deleteContents();

      range.insertNode(table);

    }


    const spacer =
      document.createElement("p");

    spacer.innerHTML = "<br>";

    table.after(spacer);


    const firstCell =
      table.querySelector("td");


    if (firstCell) {

      firstCell.focus();

      const cellRange =
        document.createRange();

      cellRange.selectNodeContents(
        firstCell
      );

      cellRange.collapse(true);

      const selection =
        window.getSelection();

      selection.removeAllRanges();

      selection.addRange(cellRange);

    }


    tableEditor.hidden = true;

    savedRange = null;

  }


  function showTableEditor() {

    saveSelection();

    tableEditor.hidden = false;

    tableRows.focus();

    tableRows.select();

  }


  function cancelTableEditor() {

    tableEditor.hidden = true;

    notes.focus();

    restoreSelection();

  }


  function clear() {

    notes.innerHTML = "";

    savedRange = null;

  }


  insertTableButton.addEventListener(
    "click",
    showTableEditor
  );


  tableInsertButton.addEventListener(
    "click",
    insertTable
  );


  tableCancelButton.addEventListener(
    "click",
    cancelTableEditor
  );


  clearNotesButton.addEventListener(
    "click",
    clear
  );


  document.addEventListener(
    "selectionchange",
    () => {

      const selection =
        window.getSelection();

      if (
        !selection ||
        !selection.rangeCount
      ) {
        return;
      }

      const range =
        selection.getRangeAt(0);

      if (
        notes.contains(
          range.commonAncestorContainer
        )
      ) {

        savedRange =
          range.cloneRange();

      }

    }
  );


  notes.addEventListener(
    "keydown",
    event => {

      if (event.key !== "Tab") {
        return;
      }

      const cell =
        event.target.closest?.("td");

      if (
        !cell ||
        !notes.contains(cell)
      ) {
        return;
      }

      const table =
        cell.closest("table");

      const cells =
        Array.from(
          table.querySelectorAll("td")
        );

      const index =
        cells.indexOf(cell);


      event.preventDefault();


      if (event.shiftKey) {

        if (index > 0) {
          cells[index - 1].focus();
        }

        return;

      }


      if (index < cells.length - 1) {

        cells[index + 1].focus();

        return;

      }


      /*
        Tab from the final cell creates
        another row.
      */

      const columnCount =
        table.rows[0].cells.length;

      const row =
        table.insertRow();

      for (
        let i = 0;
        i < columnCount;
        i++
      ) {

        const newCell =
          row.insertCell();

        newCell.contentEditable = "true";

        newCell.tabIndex = 0;

      }


      row.cells[0].focus();

    }
  );


  notes.addEventListener(
    "mouseup",
    saveSelection
  );

  notes.addEventListener(
    "keyup",
    saveSelection
  );

  notes.addEventListener(
    "focus",
    saveSelection
  );


  return {

    clear,

    getHTML() {
      return notes.innerHTML;
    }

  };

}


/* =========================================================
   PRIMARY NOTEPAD
   ========================================================= */

const mainNotes =
  createNotepad({

    notes:
      document.getElementById("notes"),

    insertTableButton:
      document.getElementById("insertTable"),

    clearNotesButton:
      document.getElementById("clearNotes"),

    tableEditor:
      document.getElementById("tableEditor"),

    tableRows:
      document.getElementById("tableRows"),

    tableColumns:
      document.getElementById("tableColumns"),

    tableInsertButton:
      document.getElementById("tableInsert"),

    tableCancelButton:
      document.getElementById("tableCancel")

  });


/* =========================================================
   BLANK NOTEPAD
   ========================================================= */

const blankNotes =
  createNotepad({

    notes:
      document.getElementById("blankNotes"),

    insertTableButton:
      document.getElementById("blankInsertTable"),

    clearNotesButton:
      document.getElementById("blankClearNotes"),

    tableEditor:
      document.getElementById("blankTableEditor"),

    tableRows:
      document.getElementById("blankTableRows"),

    tableColumns:
      document.getElementById("blankTableColumns"),

    tableInsertButton:
      document.getElementById("blankTableInsert"),

    tableCancelButton:
      document.getElementById("blankTableCancel")

  });


/* =========================================================
   TAB / VIEW MANAGEMENT
   ========================================================= */

const mainWorkspace =
  document.getElementById(
    "mainWorkspace"
  );

const whiteboardPanel =
  document.getElementById(
    "whiteboard"
  );

const notepadPanel =
  document.getElementById(
    "notepad"
  );

const blankSplitPanel =
  document.getElementById(
    "blankSplit"
  );

const tabs =
  document.querySelectorAll(".tab");


function setView(view) {

  /*
    Remove all special layout states.
  */

  mainWorkspace.classList.remove(
    "existing-split"
  );


  /*
    Hide everything first.
  */

  whiteboardPanel.classList.remove(
    "active-panel"
  );

  notepadPanel.classList.remove(
    "active-panel"
  );

  blankSplitPanel.classList.remove(
    "active-panel"
  );


  tabs.forEach(tab => {

    tab.classList.toggle(
      "active",
      tab.dataset.tab === view
    );

  });


  if (view === "whiteboard") {

    whiteboardPanel.classList.add(
      "active-panel"
    );

  }


  if (view === "notepad") {

    notepadPanel.classList.add(
      "active-panel"
    );

  }


  if (view === "split") {

    /*
      THIS IS THE IMPORTANT PART.

      We do NOT display another copy.

      We simply display the SAME
      whiteboard and notepad side-by-side.
    */

    mainWorkspace.classList.add(
      "existing-split"
    );

    whiteboardPanel.classList.add(
      "active-panel"
    );

    notepadPanel.classList.add(
      "active-panel"
    );

  }


  if (view === "blankSplit") {

    blankSplitPanel.classList.add(
      "active-panel"
    );

  }


  /*
    A canvas that was hidden may have had
    a zero-sized bounding rectangle.

    Resize after the browser has applied
    the new layout.
  */

  requestAnimationFrame(() => {

    mainBoard.resize();

    blankBoard.resize();

  });

}


tabs.forEach(tab => {

  tab.addEventListener(
    "click",
    () => {
      setView(tab.dataset.tab);
    }
  );

});


/* =========================================================
   CLEAR ALL EXISTING WORK
   ========================================================= */

const clearAll =
  document.getElementById(
    "clearAll"
  );


clearAll.addEventListener(
  "click",
  () => {

    const confirmed =
      window.confirm(
        "Clear all existing whiteboard and notepad work?"
      );

    if (!confirmed) {
      return;
    }

    mainBoard.clear();

    mainNotes.clear();

  }
);


/* =========================================================
   DOWNLOAD EXISTING WORK
   ========================================================= */

const downloadAll =
  document.getElementById(
    "downloadAll"
  );


downloadAll.addEventListener(
  "click",
  () => {

    /*
      Only the student's EXISTING work
      is downloaded.

      Blank Split View is intentionally excluded.
    */

    mainBoard.downloadPNG(
      "whiteboard.png"
    );


    const html =
`<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<title>Scratch Notes</title>
<style>
body {
  font-family: system-ui, sans-serif;
  margin: 40px;
}
table {
  border-collapse: collapse;
}
td {
  border: 1px solid #777;
  min-width: 90px;
  min-height: 30px;
  padding: 6px 8px;
  vertical-align: top;
}
</style>
</head>
<body>
${mainNotes.getHTML()}
</body>
</html>`;


    setTimeout(() => {

      downloadText(
        html,
        "notes.html",
        "text/html"
      );

    }, 150);

  }
);


/* =========================================================
   INITIAL STATE
   ========================================================= */

setView("whiteboard");


/*
  Escape closes floating editors.

  This is intentionally NOT a keyboard shortcut
  for an application command. It only dismisses
  an editor that is already open.
*/

document.addEventListener(
  "keydown",
  event => {

    if (event.key !== "Escape") {
      return;
    }

    document
      .querySelectorAll(
        ".floating-editor:not([hidden]), .table-editor:not([hidden])"
      )
      .forEach(editor => {
        editor.hidden = true;
      });

  }
);
