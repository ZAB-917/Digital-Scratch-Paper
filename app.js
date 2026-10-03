"use strict";


/* =========================================================
   GENERAL HELPERS
   ========================================================= */

function cloneObjects(objects) {
  return JSON.parse(JSON.stringify(objects));
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
      ) / (dx * dx + dy * dy)
    )
  );

  const closest = {
    x: a.x + t * dx,
    y: a.y + t * dy
  };

  return distance(point, closest);
}


function getElementPoint(canvas, event) {

  const rect = canvas.getBoundingClientRect();

  return {
    x: event.clientX - rect.left,
    y: event.clientY - rect.top
  };
}


function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}


/* =========================================================
   WHITEBOARD WORKSPACE
   ========================================================= */

function createWhiteboardWorkspace(config) {

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

    weightEditor,
    weightInput,
    weightAdd,
    weightCancel,

    confirmEditor,
    confirmMessage,
    confirmYes,
    confirmNo
  } = config;


  const ctx = canvas.getContext("2d");


  const state = {
    objects: [],
    selectedId: null,

    tool: "select",

    color: colorInput.value,
    size: Number(sizeInput.value),

    history: [],
    future: [],

    nextNodeNumber: 1,

    pendingNodePosition: null,
    pendingTextPosition: null,
    pendingWeightId: null,

    edgeStartId: null,

    draggingNodeId: null,
    dragOffset: null,

    drawing: false,
    currentStroke: null,

    dragHistorySnapshot: null,

    confirmAction: null
  };


  const toolMessages = {
    select: "Select and move objects.",
    pen: "Draw freehand.",
    eraser: "Erase freehand strokes.",
    node: "Click to place a numbered node.",
    edge: "Click two nodes to connect them.",
    directed: "Click two nodes to create a directed edge.",
    weight: "Click an edge to add or edit its weight.",
    text: "Click to place text."
  };


  /* -------------------------------------------------------
     CANVAS
     ------------------------------------------------------- */

  function resizeCanvas() {

    const rect = canvas.getBoundingClientRect();

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


  /* -------------------------------------------------------
     HISTORY
     ------------------------------------------------------- */

  function pushHistory() {

    state.history.push(
      cloneObjects(state.objects)
    );

    if (state.history.length > 100) {
      state.history.shift();
    }

    state.future = [];
  }


  function undo() {

    if (state.history.length === 0) {
      return;
    }

    state.future.push(
      cloneObjects(state.objects)
    );

    state.objects =
      state.history.pop();

    state.selectedId = null;

    draw();
  }


  function redo() {

    if (state.future.length === 0) {
      return;
    }

    state.history.push(
      cloneObjects(state.objects)
    );

    state.objects =
      state.future.pop();

    state.selectedId = null;

    draw();
  }


  /* -------------------------------------------------------
     OBJECT LOOKUPS
     ------------------------------------------------------- */

  function getObject(id) {
    return state.objects.find(
      object => object.id === id
    );
  }


  function getNode(id) {

    return state.objects.find(
      object =>
        object.id === id &&
        object.type === "node"
    );
  }


  function getNodeAt(point) {

    for (let i = state.objects.length - 1; i >= 0; i--) {

      const object = state.objects[i];

      if (object.type !== "node") {
        continue;
      }

      if (
        distance(point, {
          x: object.x,
          y: object.y
        }) <= 24
      ) {
        return object;
      }
    }

    return null;
  }


  function getEdgeAt(point) {

    for (let i = state.objects.length - 1; i >= 0; i--) {

      const object = state.objects[i];

      if (
        object.type !== "edge" &&
        object.type !== "directed"
      ) {
        continue;
      }

      const from = getNode(object.from);
      const to = getNode(object.to);

      if (!from || !to) {
        continue;
      }

      const hit = distanceToSegment(
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

      if (hit <= 10) {
        return object;
      }
    }

    return null;
  }


  function getStrokeAt(point) {

    for (let i = state.objects.length - 1; i >= 0; i--) {

      const object = state.objects[i];

      if (object.type !== "stroke") {
        continue;
      }

      for (let j = 1; j < object.points.length; j++) {

        const hit = distanceToSegment(
          point,
          object.points[j - 1],
          object.points[j]
        );

        if (hit <= Math.max(8, object.size + 5)) {
          return object;
        }
      }
    }

    return null;
  }


  function getTextAt(point) {

    ctx.save();

    ctx.font =
      "16px ui-monospace, SFMono-Regular, Menlo, Consolas, monospace";

    for (let i = state.objects.length - 1; i >= 0; i--) {

      const object = state.objects[i];

      if (object.type !== "text") {
        continue;
      }

      const width =
        ctx.measureText(object.text).width;

      if (
        point.x >= object.x - 4 &&
        point.x <= object.x + width + 4 &&
        point.y >= object.y - 20 &&
        point.y <= object.y + 6
      ) {
        ctx.restore();
        return object;
      }
    }

    ctx.restore();

    return null;
  }


  function getObjectAt(point) {

    return (
      getNodeAt(point) ||
      getEdgeAt(point) ||
      getTextAt(point) ||
      getStrokeAt(point)
    );
  }


  /* -------------------------------------------------------
     DRAWING
     ------------------------------------------------------- */

  function draw() {

    const rect = canvas.getBoundingClientRect();

    if (rect.width <= 0 || rect.height <= 0) {
      return;
    }

    ctx.clearRect(
      0,
      0,
      rect.width,
      rect.height
    );

    drawEdges();
    drawStrokes();
    drawTexts();
    drawNodes();
  }


  function drawEdges() {

    for (const object of state.objects) {

      if (
        object.type !== "edge" &&
        object.type !== "directed"
      ) {
        continue;
      }

      const from = getNode(object.from);
      const to = getNode(object.to);

      if (!from || !to) {
        continue;
      }

      const dx = to.x - from.x;
      const dy = to.y - from.y;

      const length = Math.hypot(dx, dy);

      if (length === 0) {
        continue;
      }

      const ux = dx / length;
      const uy = dy / length;

      const radius = 23;

      const start = {
        x: from.x + ux * radius,
        y: from.y + uy * radius
      };

      const end = {
        x: to.x - ux * radius,
        y: to.y - uy * radius
      };

      ctx.save();

      ctx.strokeStyle = "#111827";
      ctx.lineWidth = 2;

      ctx.beginPath();

      ctx.moveTo(start.x, start.y);
      ctx.lineTo(end.x, end.y);

      ctx.stroke();

      if (object.type === "directed") {
        drawArrowHead(end, ux, uy);
      }

      if (object.weight !== "") {

        const midpoint = {
          x: (from.x + to.x) / 2,
          y: (from.y + to.y) / 2
        };

        drawWeight(
          object.weight,
          midpoint
        );
      }

      if (state.selectedId === object.id) {

        ctx.strokeStyle = "#2563eb";
        ctx.lineWidth = 4;
        ctx.globalAlpha = 0.25;

        ctx.beginPath();

        ctx.moveTo(start.x, start.y);
        ctx.lineTo(end.x, end.y);

        ctx.stroke();
      }

      ctx.restore();
    }
  }


  function drawArrowHead(point, ux, uy) {

    const size = 10;

    const angle = Math.atan2(uy, ux);

    ctx.save();

    ctx.fillStyle = "#111827";

    ctx.beginPath();

    ctx.moveTo(
      point.x,
      point.y
    );

    ctx.lineTo(
      point.x -
        size * Math.cos(angle - Math.PI / 6),

      point.y -
        size * Math.sin(angle - Math.PI / 6)
    );

    ctx.lineTo(
      point.x -
        size * Math.cos(angle + Math.PI / 6),

      point.y -
        size * Math.sin(angle + Math.PI / 6)
    );

    ctx.closePath();

    ctx.fill();

    ctx.restore();
  }


  function drawWeight(weight, point) {

    ctx.save();

    ctx.font =
      "bold 14px system-ui, sans-serif";

    const textWidth =
      ctx.measureText(weight).width;

    const padding = 5;

    ctx.fillStyle = "white";

    ctx.fillRect(
      point.x - textWidth / 2 - padding,
      point.y - 11,
      textWidth + padding * 2,
      22
    );

    ctx.fillStyle = "#111827";

    ctx.textAlign = "center";
    ctx.textBaseline = "middle";

    ctx.fillText(
      weight,
      point.x,
      point.y
    );

    ctx.restore();
  }


  function drawStrokes() {

    for (const object of state.objects) {

      if (object.type !== "stroke") {
        continue;
      }

      if (object.points.length < 2) {
        continue;
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
  }


  function drawTexts() {

    ctx.save();

    ctx.font =
      "16px ui-monospace, SFMono-Regular, Menlo, Consolas, monospace";

    ctx.textBaseline = "alphabetic";

    for (const object of state.objects) {

      if (object.type !== "text") {
        continue;
      }

      if (state.selectedId === object.id) {

        const width =
          ctx.measureText(object.text).width;

        ctx.strokeStyle = "#93c5fd";
        ctx.lineWidth = 2;

        ctx.strokeRect(
          object.x - 5,
          object.y - 19,
          width + 10,
          25
        );
      }

      ctx.fillStyle = "#111827";

      ctx.fillText(
        object.text,
        object.x,
        object.y
      );
    }

    ctx.restore();
  }


  function drawNodes() {

    for (const object of state.objects) {

      if (object.type !== "node") {
        continue;
      }

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

      ctx.lineWidth =
        state.selectedId === object.id
          ? 4
          : 2;

      ctx.strokeStyle =
        state.selectedId === object.id
          ? "#2563eb"
          : "#111827";

      ctx.stroke();

      ctx.fillStyle = "#111827";

      ctx.font =
        "bold 15px system-ui, sans-serif";

      ctx.textAlign = "center";
      ctx.textBaseline = "middle";

      ctx.fillText(
        object.label,
        object.x,
        object.y
      );

      ctx.restore();
    }
  }


  /* -------------------------------------------------------
     TOOL SELECTION
     ------------------------------------------------------- */

  function setTool(tool) {

    state.tool = tool;

    state.edgeStartId = null;

    closeEditors();

    toolButtons.forEach(button => {

      button.classList.toggle(
        "active",
        button.dataset.tool === tool
      );
    });

    toolHelp.textContent =
      toolMessages[tool];

    canvas.style.cursor =
      tool === "select"
        ? "default"
        : "crosshair";
  }


  /* -------------------------------------------------------
     EDITORS
     ------------------------------------------------------- */

  function positionEditor(editor, point) {

    editor.hidden = false;

    const editorWidth =
      editor.offsetWidth || 220;

    const editorHeight =
      editor.offsetHeight || 50;

    const rect =
      boardWrap.getBoundingClientRect();

    const left =
      clamp(
        point.x + 10,
        8,
        Math.max(
          8,
          rect.width - editorWidth - 8
        )
      );

    const top =
      clamp(
        point.y + 10,
        8,
        Math.max(
          8,
          rect.height - editorHeight - 8
        )
      );

    editor.style.left = `${left}px`;
    editor.style.top = `${top}px`;
  }


  function closeEditors() {

    textEditor.hidden = true;
    weightEditor.hidden = true;
    confirmEditor.hidden = true;

    state.pendingNodePosition = null;
    state.pendingTextPosition = null;
    state.pendingWeightId = null;

    state.confirmAction = null;
  }


  function showTextEditor(point) {

    state.pendingTextPosition = point;

    textInput.value = "";

    positionEditor(
      textEditor,
      point
    );

    textInput.focus();
  }


  function addText() {

    const text =
      textInput.value.trim();

    if (!text) {
      closeEditors();
      return;
    }

    pushHistory();

    state.objects.push({
      id: crypto.randomUUID(),
      type: "text",
      x: state.pendingTextPosition.x,
      y: state.pendingTextPosition.y,
      text
    });

    closeEditors();

    draw();
  }


  function showWeightEditor(edge) {

    state.pendingWeightId =
      edge.id;

    weightInput.value =
      edge.weight || "";

    const from =
      getNode(edge.from);

    const to =
      getNode(edge.to);

    const point = {
      x: (from.x + to.x) / 2,
      y: (from.y + to.y) / 2
    };

    positionEditor(
      weightEditor,
      point
    );

    weightInput.focus();
  }


  function applyWeight() {

    const edge =
      getObject(state.pendingWeightId);

    if (!edge) {
      closeEditors();
      return;
    }

    pushHistory();

    edge.weight =
      weightInput.value.trim();

    closeEditors();

    draw();
  }


  /* -------------------------------------------------------
     CONFIRMATION
     ------------------------------------------------------- */

  function askConfirmation(message, action) {

    state.confirmAction =
      action;

    confirmMessage.textContent =
      message;

    confirmEditor.hidden = false;

    confirmYes.focus();
  }


  confirmYes.addEventListener(
    "click",
    () => {

      const action =
        state.confirmAction;

      confirmEditor.hidden = true;

      state.confirmAction = null;

      if (action) {
        action();
      }
    }
  );


  confirmNo.addEventListener(
    "click",
    () => {

      confirmEditor.hidden = true;

      state.confirmAction = null;
    }
  );


  /* -------------------------------------------------------
     NODES
     ------------------------------------------------------- */

  function addNode(point) {

    pushHistory();

    const label =
      String(state.nextNodeNumber);

    state.nextNodeNumber++;

    const node = {
      id: crypto.randomUUID(),
      type: "node",
      x: point.x,
      y: point.y,
      label
    };

    state.objects.push(node);

    state.selectedId =
      node.id;

    draw();
  }


  function createEdge(firstNode, secondNode, directed) {

    if (
      !firstNode ||
      !secondNode ||
      firstNode.id === secondNode.id
    ) {
      return;
    }

    pushHistory();

    state.objects.push({
      id: crypto.randomUUID(),
      type: directed
        ? "directed"
        : "edge",

      from: firstNode.id,
      to: secondNode.id,

      weight: ""
    });

    state.selectedId = null;

    draw();
  }


  /* -------------------------------------------------------
     POINTER EVENTS
     ------------------------------------------------------- */

  function pointerDown(event) {

    event.preventDefault();

    const point =
      getElementPoint(
        canvas,
        event
      );

    if (state.tool === "node") {

      addNode(point);

      return;
    }


    if (
      state.tool === "edge" ||
      state.tool === "directed"
    ) {

      const node =
        getNodeAt(point);

      if (!node) {
        return;
      }

      if (!state.edgeStartId) {

        state.edgeStartId =
          node.id;

        state.selectedId =
          node.id;

        draw();

        toolHelp.textContent =
          "Now click another node.";

        return;
      }

      const firstNode =
        getNode(state.edgeStartId);

      createEdge(
        firstNode,
        node,
        state.tool === "directed"
      );

      state.edgeStartId = null;

      toolHelp.textContent =
        toolMessages[state.tool];

      return;
    }


    if (state.tool === "weight") {

      const edge =
        getEdgeAt(point);

      if (edge) {
        showWeightEditor(edge);
      }

      return;
    }


    if (state.tool === "text") {

      showTextEditor(point);

      return;
    }


    if (state.tool === "pen") {

      state.drawing = true;

      state.currentStroke = {
        id: crypto.randomUUID(),
        type: "stroke",
        color: state.color,
        size: state.size,
        points: [point]
      };

      pushHistory();

      state.objects.push(
        state.currentStroke
      );

      canvas.setPointerCapture(
        event.pointerId
      );

      draw();

      return;
    }


    if (state.tool === "eraser") {

      const object =
        getStrokeAt(point);

      if (object) {

        pushHistory();

        state.objects =
          state.objects.filter(
            item => item.id !== object.id
          );

        draw();
      }

      return;
    }


    if (state.tool === "select") {

      const object =
        getObjectAt(point);

      if (!object) {

        state.selectedId = null;

        draw();

        return;
      }

      state.selectedId =
        object.id;

      if (object.type === "node") {

        state.draggingNodeId =
          object.id;

        state.dragOffset = {
          x: point.x - object.x,
          y: point.y - object.y
        };

        state.dragHistorySnapshot =
          cloneObjects(
            state.objects
          );

        canvas.setPointerCapture(
          event.pointerId
        );
      }

      draw();
    }
  }


  function pointerMove(event) {

    const point =
      getElementPoint(
        canvas,
        event
      );


    if (
      state.tool === "pen" &&
      state.drawing &&
      state.currentStroke
    ) {

      state.currentStroke.points.push(
        point
      );

      draw();

      return;
    }


    if (
      state.tool === "select" &&
      state.draggingNodeId
    ) {

      const node =
        getNode(
          state.draggingNodeId
        );

      if (!node) {
        return;
      }

      node.x =
        point.x -
        state.dragOffset.x;

      node.y =
        point.y -
        state.dragOffset.y;

      draw();
    }
  }


  function pointerUp(event) {

    if (
      state.tool === "pen" &&
      state.drawing
    ) {

      state.drawing = false;
      state.currentStroke = null;

      try {
        canvas.releasePointerCapture(
          event.pointerId
        );
      } catch {
        // Pointer capture may already be released.
      }

      draw();

      return;
    }


    if (
      state.tool === "select" &&
      state.draggingNodeId
    ) {

      const before =
        state.dragHistorySnapshot;

      const after =
        cloneObjects(
          state.objects
        );

      if (
        JSON.stringify(before) !==
        JSON.stringify(after)
      ) {

        state.history.push(before);

        if (state.history.length > 100) {
          state.history.shift();
        }

        state.future = [];
      }

      state.draggingNodeId = null;
      state.dragOffset = null;
      state.dragHistorySnapshot = null;

      try {
        canvas.releasePointerCapture(
          event.pointerId
        );
      } catch {
        // Pointer capture may already be released.
      }

      draw();
    }
  }


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
    pointerUp
  );


  /* -------------------------------------------------------
     BUTTONS
     ------------------------------------------------------- */

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
      state.color =
        colorInput.value;
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

      if (!state.selectedId) {
        return;
      }

      pushHistory();

      state.objects =
        state.objects.filter(
          object =>
            object.id !==
            state.selectedId
        );

      state.selectedId = null;

      draw();
    }
  );


  clearButton.addEventListener(
    "click",
    () => {

      if (state.objects.length === 0) {
        return;
      }

      askConfirmation(
        "Clear the entire whiteboard?",
        () => {

          pushHistory();

          state.objects = [];
          state.selectedId = null;
          state.edgeStartId = null;

          draw();
        }
      );
    }
  );


  textAdd.addEventListener(
    "click",
    addText
  );


  textCancel.addEventListener(
    "click",
    closeEditors
  );


  weightAdd.addEventListener(
    "click",
    applyWeight
  );


  weightCancel.addEventListener(
    "click",
    closeEditors
  );


  textInput.addEventListener(
    "keydown",
    event => {

      if (event.key === "Enter") {
        event.preventDefault();
        addText();
      }

      if (event.key === "Escape") {
        closeEditors();
      }
    }
  );


  weightInput.addEventListener(
    "keydown",
    event => {

      if (event.key === "Enter") {
        event.preventDefault();
        applyWeight();
      }

      if (event.key === "Escape") {
        closeEditors();
      }
    }
  );


  /* -------------------------------------------------------
     PUBLIC API
     ------------------------------------------------------- */

  function clear() {

    if (state.objects.length === 0) {
      return;
    }

    pushHistory();

    state.objects = [];
    state.selectedId = null;
    state.edgeStartId = null;

    draw();
  }


  function getObjects() {
    return cloneObjects(
      state.objects
    );
  }


  function downloadPNG(filename) {

    canvas.toBlob(
      blob => {

        if (!blob) {
          return;
        }

        downloadBlob(
          blob,
          filename
        );
      },
      "image/png"
    );
  }


  resizeCanvas();

  setTool("select");


  return {
    resize: resizeCanvas,
    clear,
    getObjects,
    downloadPNG
  };
}


/* =========================================================
   NOTEPAD WORKSPACE
   ========================================================= */

function createNotepadWorkspace(config) {

  const {
    notes,
    insertTableButton,
    clearNotesButton,

    tableEditor,
    tableRows,
    tableColumns,
    tableInsert,
    tableCancel
  } = config;


  let savedRange = null;


  /* -------------------------------------------------------
     SELECTION PRESERVATION
     ------------------------------------------------------- */

  function saveSelection() {

    const selection =
      window.getSelection();

    if (
      !selection ||
      selection.rangeCount === 0
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

    if (
      !notes.contains(
        savedRange.commonAncestorContainer
      )
    ) {
      savedRange = null;
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

    range.selectNodeContents(
      notes
    );

    range.collapse(false);

    const selection =
      window.getSelection();

    selection.removeAllRanges();

    selection.addRange(range);
  }


  document.addEventListener(
    "selectionchange",
    () => {

      const selection =
        window.getSelection();

      if (
        !selection ||
        selection.rangeCount === 0
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


  ["mouseup", "keyup", "focus"].forEach(
    eventName => {

      notes.addEventListener(
        eventName,
        saveSelection
      );
    }
  );


  /* -------------------------------------------------------
     TABLE CREATION
     ------------------------------------------------------- */

  function createTable(rows, columns) {

    const table =
      document.createElement("table");

    const tbody =
      document.createElement("tbody");

    for (let r = 0; r < rows; r++) {

      const tr =
        document.createElement("tr");

      for (let c = 0; c < columns; c++) {

        const td =
          document.createElement("td");

        td.contentEditable = "true";
        td.tabIndex = 0;

        tr.appendChild(td);
      }

      tbody.appendChild(tr);
    }

    table.appendChild(tbody);

    return table;
  }


  function insertTableAtCursor() {

    const rows =
      clamp(
        Number(tableRows.value) || 1,
        1,
        30
      );

    const columns =
      clamp(
        Number(tableColumns.value) || 1,
        1,
        20
      );


    const table =
      createTable(
        rows,
        columns
      );


    notes.focus();


    /*
      Critical part:

      Restore the exact selection that existed BEFORE
      the Insert Table button was clicked.

      This prevents the table from jumping to the
      beginning/end of the notes.
    */

    const restored =
      restoreSelection();


    let range = null;

    if (
      restored &&
      window.getSelection().rangeCount
    ) {

      range =
        window.getSelection()
          .getRangeAt(0);
    }


    /*
      If there is no saved cursor position yet,
      put the table at the end.
    */

    if (
      !range ||
      !notes.contains(
        range.commonAncestorContainer
      )
    ) {

      placeCaretAtEnd();

      range =
        window.getSelection()
          .getRangeAt(0);
    }


    /*
      Prevent accidentally putting a table inside
      another table cell.
    */

    let container =
      range.startContainer;

    if (
      container.nodeType !== Node.ELEMENT_NODE
    ) {
      container =
        container.parentElement;
    }

    const containingCell =
      container?.closest("td");


    if (containingCell) {

      const containingTable =
        containingCell.closest("table");

      const spacer =
        document.createElement("p");

      spacer.innerHTML = "<br>";

      containingTable.after(
        spacer
      );

      spacer.after(table);

    } else {

      range.deleteContents();

      range.insertNode(table);
    }


    /*
      Put a blank paragraph after the table so the
      student can immediately continue typing below it.
    */

    if (!table.nextSibling) {

      const spacer =
        document.createElement("p");

      spacer.innerHTML = "<br>";

      table.after(spacer);
    }


    /*
      Put the cursor in the first cell.
    */

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

      selection.addRange(
        cellRange
      );

      savedRange =
        cellRange.cloneRange();
    }


    tableEditor.hidden = true;
  }


  /* -------------------------------------------------------
     TABLE BUTTON
     ------------------------------------------------------- */

  insertTableButton.addEventListener(
    "click",
    () => {

      /*
        Save the cursor BEFORE the table controls
        take focus.
      */

      saveSelection();

      tableEditor.hidden = false;

      tableRows.focus();
      tableRows.select();
    }
  );


  tableInsert.addEventListener(
    "click",
    insertTableAtCursor
  );


  tableCancel.addEventListener(
    "click",
    () => {

      tableEditor.hidden = true;

      notes.focus();

      restoreSelection();
    }
  );


  /* -------------------------------------------------------
     TABLE TAB NAVIGATION
     ------------------------------------------------------- */

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

      if (!table) {
        return;
      }

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

        } else {

          cell.focus();
        }

        return;
      }


      if (index < cells.length - 1) {

        cells[index + 1].focus();

        return;
      }


      /*
        Tab from the final cell creates a new row.
      */

      const lastRow =
        table.querySelector(
          "tbody tr:last-child"
        );

      if (!lastRow) {
        return;
      }

      const columnCount =
        lastRow.children.length;

      const newRow =
        document.createElement("tr");

      for (
        let i = 0;
        i < columnCount;
        i++
      ) {

        const newCell =
          document.createElement("td");

        newCell.contentEditable = "true";
        newCell.tabIndex = 0;

        newRow.appendChild(
          newCell
        );
      }

      table
        .querySelector("tbody")
        .appendChild(newRow);

      const newCell =
        newRow.querySelector("td");

      if (newCell) {
        newCell.focus();
      }
    }
  );


  /* -------------------------------------------------------
     CLEAR
     ------------------------------------------------------- */

  clearNotesButton.addEventListener(
    "click",
    () => {

      notes.innerHTML = "";

      savedRange = null;

      notes.focus();
    }
  );


  /* -------------------------------------------------------
     PUBLIC API
     ------------------------------------------------------- */

  function clear() {

    notes.innerHTML = "";

    savedRange = null;
  }


  function getHTML() {
    return notes.innerHTML;
  }


  return {
    clear,
    getHTML,
    saveSelection,
    restoreSelection
  };
}


/* =========================================================
   DOM REFERENCES
   ========================================================= */

const mainWorkspace =
  document.getElementById(
    "mainWorkspace"
  );

const tabs =
  document.querySelectorAll(
    ".tab"
  );


/* =========================================================
   MAIN WHITEBOARD
   ========================================================= */

const mainBoard =
  createWhiteboardWorkspace({

    canvas:
      document.getElementById("board"),

    boardWrap:
      document.getElementById("boardWrap"),

    toolButtons:
      document.querySelectorAll(
        ".tool"
      ),

    colorInput:
      document.getElementById(
        "strokeColor"
      ),

    sizeInput:
      document.getElementById(
        "strokeSize"
      ),

    undoButton:
      document.getElementById("undo"),

    redoButton:
      document.getElementById("redo"),

    deleteButton:
      document.getElementById(
        "deleteSelected"
      ),

    clearButton:
      document.getElementById(
        "clearBoard"
      ),

    toolHelp:
      document.getElementById(
        "toolHelp"
      ),

    textEditor:
      document.getElementById(
        "textEditor"
      ),

    textInput:
      document.getElementById(
        "textInput"
      ),

    textAdd:
      document.getElementById(
        "textAdd"
      ),

    textCancel:
      document.getElementById(
        "textCancel"
      ),

    weightEditor:
      document.getElementById(
        "weightEditor"
      ),

    weightInput:
      document.getElementById(
        "weightInput"
      ),

    weightAdd:
      document.getElementById(
        "weightAdd"
      ),

    weightCancel:
      document.getElementById(
        "weightCancel"
      ),

    confirmEditor:
      document.getElementById(
        "confirmEditor"
      ),

    confirmMessage:
      document.getElementById(
        "confirmMessage"
      ),

    confirmYes:
      document.getElementById(
        "confirmYes"
      ),

    confirmNo:
      document.getElementById(
        "confirmNo"
      )
  });


/* =========================================================
   MAIN NOTEPAD
   ========================================================= */

const mainNotes =
  createNotepadWorkspace({

    notes:
      document.getElementById(
        "notes"
      ),

    insertTableButton:
      document.getElementById(
        "insertTable"
      ),

    clearNotesButton:
      document.getElementById(
        "clearNotes"
      ),

    tableEditor:
      document.getElementById(
        "tableEditor"
      ),

    tableRows:
      document.getElementById(
        "tableRows"
      ),

    tableColumns:
      document.getElementById(
        "tableColumns"
      ),

    tableInsert:
      document.getElementById(
        "tableInsert"
      ),

    tableCancel:
      document.getElementById(
        "tableCancel"
      )
  });


/* =========================================================
   BLANK WHITEBOARD
   ========================================================= */

const blankBoard =
  createWhiteboardWorkspace({

    canvas:
      document.getElementById(
        "blankBoard"
      ),

    boardWrap:
      document.getElementById(
        "blankBoardWrap"
      ),

    toolButtons:
      document.querySelectorAll(
        ".blank-tool"
      ),

    colorInput:
      document.getElementById(
        "blankStrokeColor"
      ),

    sizeInput:
      document.getElementById(
        "blankStrokeSize"
      ),

    undoButton:
      document.getElementById(
        "blankUndo"
      ),

    redoButton:
      document.getElementById(
        "blankRedo"
      ),

    deleteButton:
      document.getElementById(
        "blankDelete"
      ),

    clearButton:
      document.getElementById(
        "blankClearBoard"
      ),

    toolHelp:
      document.getElementById(
        "blankToolHelp"
      ),

    textEditor:
      document.getElementById(
        "blankTextEditor"
      ),

    textInput:
      document.getElementById(
        "blankTextInput"
      ),

    textAdd:
      document.getElementById(
        "blankTextAdd"
      ),

    textCancel:
      document.getElementById(
        "blankTextCancel"
      ),

    weightEditor:
      document.getElementById(
        "blankWeightEditor"
      ),

    weightInput:
      document.getElementById(
        "blankWeightInput"
      ),

    weightAdd:
      document.getElementById(
        "blankWeightAdd"
      ),

    weightCancel:
      document.getElementById(
        "blankWeightCancel"
      ),

    confirmEditor:
      document.createElement("div"),

    confirmMessage:
      document.createElement("span"),

    confirmYes:
      document.createElement("button"),

    confirmNo:
      document.createElement("button")
  });


/*
  The blank whiteboard does not need its own confirmation UI.
  Its Clear Board button already performs the clear directly.
*/


/* =========================================================
   BLANK NOTEPAD
   ========================================================= */

const blankNotes =
  createNotepadWorkspace({

    notes:
      document.getElementById(
        "blankNotes"
      ),

    insertTableButton:
      document.getElementById(
        "blankInsertTable"
      ),

    clearNotesButton:
      document.getElementById(
        "blankClearNotes"
      ),

    tableEditor:
      document.getElementById(
        "blankTableEditor"
      ),

    tableRows:
      document.getElementById(
        "blankTableRows"
      ),

    tableColumns:
      document.getElementById(
        "blankTableColumns"
      ),

    tableInsert:
      document.getElementById(
        "blankTableInsert"
      ),

    tableCancel:
      document.getElementById(
        "blankTableCancel"
      )
  });


/* =========================================================
   SPLIT VIEW
   =========================================================

   IMPORTANT:

   Split View uses the actual existing whiteboard and
   notepad elements.

   We move those DOM elements into the split-view hosts
   instead of creating copies.

   Therefore:

   Whiteboard tab -> same work
   Notepad tab    -> same work
   Split View     -> same work

   Nothing gets duplicated or lost.
   ========================================================= */

const whiteboardSection =
  document.getElementById(
    "whiteboard"
  );

const notepadSection =
  document.getElementById(
    "notepad"
  );

const boardWrap =
  document.getElementById(
    "boardWrap"
  );

const notes =
  document.getElementById(
    "notes"
  );

const originalBoardParent =
  boardWrap.parentElement;

const originalNotesParent =
  notes.parentElement;

const splitBoardHost =
  document.getElementById(
    "splitBoardHost"
  );

const splitNotesHost =
  document.getElementById(
    "splitNotesHost"
  );


/*
  The actual boardWrap and notes editor are moved into
  Split View when needed.

  Their content remains exactly the same.
*/

function enterSplitView() {

  splitBoardHost.appendChild(
    boardWrap
  );

  splitNotesHost.appendChild(
    notes
  );

  requestAnimationFrame(() => {

    mainBoard.resize();

    mainNotes.restoreSelection();
  });
}


function leaveSplitView() {

  whiteboardSection.appendChild(
    boardWrap
  );

  notepadSection.appendChild(
    notes
  );

  requestAnimationFrame(() => {
    mainBoard.resize();
  });
}


/* =========================================================
   SPLIT TABLE BUTTON
   ========================================================= */

document
  .getElementById("splitInsertTable")
  .addEventListener(
    "click",
    () => {

      /*
        The actual Insert Table button is reused.

        First save the current cursor in the actual
        notepad, then open the table editor.
      */

      mainNotes.saveSelection();

      document
        .getElementById("tableEditor")
        .hidden = false;

      document
        .getElementById("tableRows")
        .focus();

      document
        .getElementById("tableRows")
        .select();
    }
  );


document
  .getElementById("splitClearNotes")
  .addEventListener(
    "click",
    () => {
      mainNotes.clear();
    }
  );


/* =========================================================
   TAB SWITCHING
   ========================================================= */

function setTab(tabName) {

  /*
    If leaving Split View, restore the original DOM
    locations first.
  */

  if (tabName !== "split") {
    leaveSplitView();
  }


  tabs.forEach(tab => {

    tab.classList.toggle(
      "active",
      tab.dataset.tab === tabName
    );
  });


  document
    .querySelectorAll(".panel")
    .forEach(panel => {
      panel.classList.remove(
        "active-panel"
      );
    });


  if (tabName === "split") {

    enterSplitView();

    document
      .getElementById("split")
      .classList.add(
        "active-panel"
      );

  } else {

    document
      .getElementById(tabName)
      .classList.add(
        "active-panel"
      );
  }


  requestAnimationFrame(() => {

    mainBoard.resize();

    blankBoard.resize();
  });
}


tabs.forEach(tab => {

  tab.addEventListener(
    "click",
    () => {

      setTab(
        tab.dataset.tab
      );
    }
  );
});


/* =========================================================
   CLEAR ALL
   ========================================================= */

document
  .getElementById("clearAll")
  .addEventListener(
    "click",
    () => {

      mainBoard.clear();

      mainNotes.clear();
    }
  );


/* =========================================================
   DOWNLOAD WORK
   =========================================================

   Only the student's primary work is downloaded.

   The separate Blank Split View is intentionally excluded.
   ========================================================= */

document
  .getElementById("downloadAll")
  .addEventListener(
    "click",
    () => {

      mainBoard.downloadPNG(
        "whiteboard.png"
      );


      const html =
        `<!doctype html>
<html>
<head>
<meta charset="utf-8">
<title>Scratch Notes</title>
<style>
body {
  font-family: system-ui, sans-serif;
  padding: 24px;
}
table {
  border-collapse: collapse;
}
td {
  border: 1px solid #777;
  min-width: 90px;
  height: 32px;
  padding: 5px 8px;
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
   WINDOW RESIZE
   ========================================================= */

window.addEventListener(
  "resize",
  () => {

    mainBoard.resize();

    blankBoard.resize();
  }
);


/* =========================================================
   ESCAPE
   ========================================================= */

document.addEventListener(
  "keydown",
  event => {

    if (event.key !== "Escape") {
      return;
    }

    document
      .querySelectorAll(
        ".floating-editor, .table-editor, .confirm-editor"
      )
      .forEach(editor => {
        editor.hidden = true;
      });
  }
);


/* =========================================================
   INITIAL RESIZE
   ========================================================= */

requestAnimationFrame(() => {

  mainBoard.resize();

  blankBoard.resize();
});
