const canvas = document.getElementById("board");
const boardWrap = document.getElementById("boardWrap");
const ctx = canvas.getContext("2d");

const textEditor = document.getElementById("textEditor");
const textInput = document.getElementById("textInput");
const textAdd = document.getElementById("textAdd");
const textCancel = document.getElementById("textCancel");

const nodeEditor = document.getElementById("nodeEditor");
const nodeInput = document.getElementById("nodeInput");
const nodeAdd = document.getElementById("nodeAdd");
const nodeCancel = document.getElementById("nodeCancel");

const weightEditor = document.getElementById("weightEditor");
const weightInput = document.getElementById("weightInput");
const weightAdd = document.getElementById("weightAdd");
const weightCancel = document.getElementById("weightCancel");

const confirmEditor = document.getElementById("confirmEditor");
const confirmMessage = document.getElementById("confirmMessage");
const confirmYes = document.getElementById("confirmYes");
const confirmNo = document.getElementById("confirmNo");

const notes = document.getElementById("notes");

const state = {
  objects: [],
  selectedId: null,
  tool: "select",
  color: "#111827",
  size: 3,
  history: [],
  future: []
};

let dpr = window.devicePixelRatio || 1;

let pendingTextPoint = null;
let pendingNodePoint = null;
let pendingNodeId = null;
let pendingWeightEdgeId = null;
let pendingConfirmAction = null;

let drawingStroke = null;
let dragState = null;
let edgeStartNodeId = null;

let savedNotesRange = null;


/* =========================================================
   GENERAL HELPERS
   ========================================================= */

function makeId() {
  return Math.random().toString(36).slice(2) + Date.now().toString(36);
}

function cloneObjects(objects) {
  return JSON.parse(JSON.stringify(objects));
}

function saveHistory() {
  state.history.push(cloneObjects(state.objects));

  if (state.history.length > 100) {
    state.history.shift();
  }

  state.future = [];
}

function restoreObjects(objects) {
  state.objects = cloneObjects(objects);
  state.selectedId = null;
  redraw();
}

function getObject(id) {
  return state.objects.find(obj => obj.id === id);
}

function getNode(id) {
  const obj = getObject(id);
  return obj && obj.type === "node" ? obj : null;
}

function getEdge(id) {
  const obj = getObject(id);
  return obj && (obj.type === "edge" || obj.type === "directed") ? obj : null;
}

function getPoint(event) {
  const rect = canvas.getBoundingClientRect();

  return {
    x: event.clientX - rect.left,
    y: event.clientY - rect.top
  };
}

function distance(a, b) {
  return Math.hypot(a.x - b.x, a.y - b.y);
}

function midpoint(a, b) {
  return {
    x: (a.x + b.x) / 2,
    y: (a.y + b.y) / 2
  };
}


/* =========================================================
   CANVAS RESIZING
   ========================================================= */

function resizeCanvas() {
  const rect = boardWrap.getBoundingClientRect();

  dpr = window.devicePixelRatio || 1;

  canvas.width = Math.max(1, Math.floor(rect.width * dpr));
  canvas.height = Math.max(1, Math.floor(rect.height * dpr));

  canvas.style.width = `${rect.width}px`;
  canvas.style.height = `${rect.height}px`;

  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

  redraw();
}


/* =========================================================
   HIT TESTING
   ========================================================= */

function nodeAt(point) {
  for (let i = state.objects.length - 1; i >= 0; i--) {
    const obj = state.objects[i];

    if (obj.type !== "node") {
      continue;
    }

    if (distance(point, obj) <= 24) {
      return obj;
    }
  }

  return null;
}

function pointToSegmentDistance(point, a, b) {
  const dx = b.x - a.x;
  const dy = b.y - a.y;

  if (dx === 0 && dy === 0) {
    return distance(point, a);
  }

  const t = Math.max(
    0,
    Math.min(
      1,
      ((point.x - a.x) * dx + (point.y - a.y) * dy) /
        (dx * dx + dy * dy)
    )
  );

  const closest = {
    x: a.x + t * dx,
    y: a.y + t * dy
  };

  return distance(point, closest);
}

function edgeAt(point) {
  for (let i = state.objects.length - 1; i >= 0; i--) {
    const obj = state.objects[i];

    if (obj.type !== "edge" && obj.type !== "directed") {
      continue;
    }

    const a = getNode(obj.from);
    const b = getNode(obj.to);

    if (!a || !b) {
      continue;
    }

    if (pointToSegmentDistance(point, a, b) <= 10) {
      return obj;
    }
  }

  return null;
}

function strokeAt(point) {
  for (let i = state.objects.length - 1; i >= 0; i--) {
    const obj = state.objects[i];

    if (obj.type !== "stroke") {
      continue;
    }

    for (let j = 1; j < obj.points.length; j++) {
      if (
        pointToSegmentDistance(
          point,
          obj.points[j - 1],
          obj.points[j]
        ) <= Math.max(8, obj.size + 5)
      ) {
        return obj;
      }
    }
  }

  return null;
}

function objectAt(point) {
  return nodeAt(point) || edgeAt(point) || strokeAt(point);
}


/* =========================================================
   DRAWING
   ========================================================= */

function clearCanvas() {
  const rect = boardWrap.getBoundingClientRect();

  ctx.clearRect(0, 0, rect.width, rect.height);
}

function drawGrid() {
  const rect = boardWrap.getBoundingClientRect();

  const spacing = 25;

  ctx.save();

  ctx.strokeStyle = "#eef1f4";
  ctx.lineWidth = 1;

  for (let x = 0; x <= rect.width; x += spacing) {
    ctx.beginPath();
    ctx.moveTo(x, 0);
    ctx.lineTo(x, rect.height);
    ctx.stroke();
  }

  for (let y = 0; y <= rect.height; y += spacing) {
    ctx.beginPath();
    ctx.moveTo(0, y);
    ctx.lineTo(rect.width, y);
    ctx.stroke();
  }

  ctx.restore();
}

function drawArrowhead(from, to) {
  const angle = Math.atan2(to.y - from.y, to.x - from.x);

  const length = 12;
  const width = Math.PI / 7;

  ctx.beginPath();

  ctx.moveTo(to.x, to.y);

  ctx.lineTo(
    to.x - length * Math.cos(angle - width),
    to.y - length * Math.sin(angle - width)
  );

  ctx.lineTo(
    to.x - length * Math.cos(angle + width),
    to.y - length * Math.sin(angle + width)
  );

  ctx.closePath();

  ctx.fill();
}

function drawNode(node) {
  const selected = node.id === state.selectedId;

  ctx.save();

  ctx.beginPath();
  ctx.arc(node.x, node.y, 20, 0, Math.PI * 2);

  ctx.fillStyle = "#ffffff";
  ctx.fill();

  ctx.lineWidth = selected ? 3 : 2;
  ctx.strokeStyle = selected ? "#2563eb" : "#111827";
  ctx.stroke();

  if (node.label) {
    ctx.fillStyle = "#111827";
    ctx.font = "14px system-ui, sans-serif";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText(node.label, node.x, node.y);
  }

  ctx.restore();
}

function drawEdge(edge) {
  const from = getNode(edge.from);
  const to = getNode(edge.to);

  if (!from || !to) {
    return;
  }

  const selected = edge.id === state.selectedId;

  ctx.save();

  ctx.strokeStyle = selected ? "#2563eb" : "#111827";
  ctx.fillStyle = selected ? "#2563eb" : "#111827";
  ctx.lineWidth = selected ? 3 : 2;

  ctx.beginPath();
  ctx.moveTo(from.x, from.y);
  ctx.lineTo(to.x, to.y);
  ctx.stroke();

  if (edge.type === "directed") {
    drawArrowhead(from, to);
  }

  if (edge.weight !== undefined && edge.weight !== "") {
    const mid = midpoint(from, to);

    ctx.font = "14px system-ui, sans-serif";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";

    const text = String(edge.weight);
    const metrics = ctx.measureText(text);

    const paddingX = 5;
    const paddingY = 3;

    ctx.fillStyle = "#ffffff";

    ctx.fillRect(
      mid.x - metrics.width / 2 - paddingX,
      mid.y - 9 - paddingY,
      metrics.width + paddingX * 2,
      18 + paddingY * 2
    );

    ctx.fillStyle = selected ? "#2563eb" : "#111827";
    ctx.fillText(text, mid.x, mid.y);
  }

  ctx.restore();
}

function drawStroke(stroke) {
  if (!stroke.points.length) {
    return;
  }

  ctx.save();

  ctx.strokeStyle =
    stroke.color || "#111827";

  ctx.lineWidth =
    stroke.size || 3;

  ctx.lineCap = "round";
  ctx.lineJoin = "round";

  ctx.beginPath();

  ctx.moveTo(
    stroke.points[0].x,
    stroke.points[0].y
  );

  for (let i = 1; i < stroke.points.length; i++) {
    ctx.lineTo(
      stroke.points[i].x,
      stroke.points[i].y
    );
  }

  ctx.stroke();

  ctx.restore();
}

function drawTextObject(obj) {
  ctx.save();

  ctx.fillStyle = obj.color || "#111827";
  ctx.font = "16px system-ui, sans-serif";
  ctx.textBaseline = "top";

  const lines = String(obj.text || "").split("\n");

  lines.forEach((line, index) => {
    ctx.fillText(
      line,
      obj.x,
      obj.y + index * 21
    );
  });

  ctx.restore();
}

function redraw() {
  clearCanvas();
  drawGrid();

  for (const obj of state.objects) {
    if (obj.type === "stroke") {
      drawStroke(obj);
    }
  }

  for (const obj of state.objects) {
    if (
      obj.type === "edge" ||
      obj.type === "directed"
    ) {
      drawEdge(obj);
    }
  }

  for (const obj of state.objects) {
    if (obj.type === "node") {
      drawNode(obj);
    }
  }

  for (const obj of state.objects) {
    if (obj.type === "text") {
      drawTextObject(obj);
    }
  }

  if (drawingStroke) {
    drawStroke(drawingStroke);
  }
}


/* =========================================================
   TOOL SELECTION
   ========================================================= */

const toolHelp = {
  select: "Select and move objects.",
  pen: "Draw freehand.",
  eraser: "Erase freehand strokes.",
  node: "Click to place a graph node.",
  edge: "Click two nodes to connect them.",
  directed: "Click two nodes to create a directed edge.",
  weight: "Click an edge to add or edit its weight.",
  text: "Click to place text."
};

document.querySelectorAll(".tool").forEach(button => {
  button.addEventListener("click", () => {
    state.tool = button.dataset.tool;
    edgeStartNodeId = null;

    document
      .querySelectorAll(".tool")
      .forEach(btn => btn.classList.remove("active"));

    button.classList.add("active");

    toolHelp.textContent =
      toolHelp[state.tool] || "";

    canvas.style.cursor =
      state.tool === "select"
        ? "default"
        : "crosshair";
  });
});

document
  .getElementById("strokeColor")
  .addEventListener("input", event => {
    state.color = event.target.value;
  });

document
  .getElementById("strokeSize")
  .addEventListener("input", event => {
    state.size = Number(event.target.value);
  });


/* =========================================================
   FLOATING EDITORS
   ========================================================= */

function hideEditors() {
  textEditor.hidden = true;
  nodeEditor.hidden = true;
  weightEditor.hidden = true;
}

function positionEditor(editor, point) {
  const maxX =
    boardWrap.clientWidth -
    editor.offsetWidth -
    10;

  const maxY =
    boardWrap.clientHeight -
    editor.offsetHeight -
    10;

  editor.style.left =
    `${Math.max(10, Math.min(point.x + 10, maxX))}px`;

  editor.style.top =
    `${Math.max(10, Math.min(point.y + 10, maxY))}px`;
}

function openTextEditor(point) {
  hideEditors();

  pendingTextPoint = point;

  textEditor.hidden = false;

  requestAnimationFrame(() => {
    positionEditor(textEditor, point);
    textInput.focus();
  });
}

function openNodeEditor(point, node = null) {
  hideEditors();

  pendingNodePoint = point;
  pendingNodeId = node ? node.id : null;

  nodeInput.value =
    node ? node.label || "" : "";

  nodeEditor.hidden = false;

  requestAnimationFrame(() => {
    positionEditor(nodeEditor, point);
    nodeInput.focus();
    nodeInput.select();
  });
}

function openWeightEditor(edge) {
  hideEditors();

  pendingWeightEdgeId = edge.id;

  weightInput.value =
    edge.weight ?? "";

  const from = getNode(edge.from);
  const to = getNode(edge.to);

  if (!from || !to) {
    return;
  }

  const point = midpoint(from, to);

  weightEditor.hidden = false;

  requestAnimationFrame(() => {
    positionEditor(weightEditor, point);
    weightInput.focus();
    weightInput.select();
  });
}


/* =========================================================
   TEXT EDITOR
   ========================================================= */

function applyText() {
  const value = textInput.value.trim();

  if (!value || !pendingTextPoint) {
    hideEditors();
    return;
  }

  saveHistory();

  state.objects.push({
    id: makeId(),
    type: "text",
    x: pendingTextPoint.x,
    y: pendingTextPoint.y,
    text: value,
    color: state.color
  });

  pendingTextPoint = null;

  hideEditors();
  redraw();
}

textAdd.addEventListener("click", applyText);

textCancel.addEventListener("click", () => {
  pendingTextPoint = null;
  hideEditors();
});

textInput.addEventListener("keydown", event => {
  if (event.key === "Enter") {
    event.preventDefault();
    applyText();
  }

  if (event.key === "Escape") {
    event.preventDefault();
    pendingTextPoint = null;
    hideEditors();
  }
});


/* =========================================================
   NODE EDITOR
   ========================================================= */

function applyNodeLabel() {
  const label = nodeInput.value.trim();

  if (pendingNodeId) {
    const node = getNode(pendingNodeId);

    if (node) {
      saveHistory();
      node.label = label;
    }
  } else if (pendingNodePoint) {
    saveHistory();

    state.objects.push({
      id: makeId(),
      type: "node",
      x: pendingNodePoint.x,
      y: pendingNodePoint.y,
      label
    });
  }

  pendingNodePoint = null;
  pendingNodeId = null;

  hideEditors();
  redraw();
}

nodeAdd.addEventListener("click", applyNodeLabel);

nodeCancel.addEventListener("click", () => {
  pendingNodePoint = null;
  pendingNodeId = null;
  hideEditors();
});

nodeInput.addEventListener("keydown", event => {
  if (event.key === "Enter") {
    event.preventDefault();
    applyNodeLabel();
  }

  if (event.key === "Escape") {
    event.preventDefault();
    pendingNodePoint = null;
    pendingNodeId = null;
    hideEditors();
  }
});


/* =========================================================
   WEIGHT EDITOR
   ========================================================= */

function applyWeight() {
  if (!pendingWeightEdgeId) {
    hideEditors();
    return;
  }

  const edge = getEdge(pendingWeightEdgeId);

  if (edge) {
    saveHistory();

    edge.weight =
      weightInput.value.trim();
  }

  pendingWeightEdgeId = null;

  hideEditors();
  redraw();
}

weightAdd.addEventListener("click", applyWeight);

weightCancel.addEventListener("click", () => {
  pendingWeightEdgeId = null;
  hideEditors();
});

weightInput.addEventListener("keydown", event => {
  if (event.key === "Enter") {
    event.preventDefault();
    applyWeight();
  }

  if (event.key === "Escape") {
    event.preventDefault();
    pendingWeightEdgeId = null;
    hideEditors();
  }
});


/* =========================================================
   CONFIRMATION DIALOG
   ========================================================= */

function showConfirmation(message, action) {
  confirmMessage.textContent = message;
  pendingConfirmAction = action;
  confirmEditor.hidden = false;
}

function hideConfirmation() {
  confirmEditor.hidden = true;
  pendingConfirmAction = null;
}

confirmYes.addEventListener("click", () => {
  const action = pendingConfirmAction;

  hideConfirmation();

  if (action) {
    action();
  }
});

confirmNo.addEventListener("click", hideConfirmation);


/* =========================================================
   CANVAS POINTER EVENTS
   ========================================================= */

canvas.addEventListener("pointerdown", event => {
  event.preventDefault();

  const point = getPoint(event);

  hideEditors();

  if (state.tool === "pen") {
    saveHistory();

    drawingStroke = {
      id: makeId(),
      type: "stroke",
      color: state.color,
      size: state.size,
      points: [point]
    };

    canvas.setPointerCapture(event.pointerId);
    redraw();
    return;
  }

  if (state.tool === "eraser") {
    const target = strokeAt(point);

    if (target) {
      saveHistory();

      state.objects =
        state.objects.filter(
          obj => obj.id !== target.id
        );

      redraw();
    }

    return;
  }

  if (state.tool === "node") {
    openNodeEditor(point);
    return;
  }

  if (
    state.tool === "edge" ||
    state.tool === "directed"
  ) {
    const node = nodeAt(point);

    if (!node) {
      edgeStartNodeId = null;
      return;
    }

    if (!edgeStartNodeId) {
      edgeStartNodeId = node.id;
      state.selectedId = node.id;
      redraw();
      return;
    }

    if (edgeStartNodeId === node.id) {
      return;
    }

    const edgeType =
      state.tool === "directed"
        ? "directed"
        : "edge";

    saveHistory();

    state.objects.push({
      id: makeId(),
      type: edgeType,
      from: edgeStartNodeId,
      to: node.id,
      weight: ""
    });

    edgeStartNodeId = null;
    state.selectedId = null;

    redraw();
    return;
  }

  if (state.tool === "weight") {
    const edge = edgeAt(point);

    if (edge) {
      openWeightEditor(edge);
    }

    return;
  }

  if (state.tool === "text") {
    openTextEditor(point);
    return;
  }

  if (state.tool === "select") {
    const target = objectAt(point);

    if (!target) {
      state.selectedId = null;
      redraw();
      return;
    }

    state.selectedId = target.id;

    if (target.type === "node") {
      saveHistory();

      dragState = {
        nodeId: target.id,
        offsetX: point.x - target.x,
        offsetY: point.y - target.y
      };

      canvas.setPointerCapture(event.pointerId);
    }

    redraw();
  }
});

canvas.addEventListener("pointermove", event => {
  if (!drawingStroke && !dragState) {
    return;
  }

  const point = getPoint(event);

  if (drawingStroke) {
    drawingStroke.points.push(point);
    redraw();
    return;
  }

  if (dragState) {
    const node = getNode(dragState.nodeId);

    if (!node) {
      return;
    }

    node.x =
      point.x - dragState.offsetX;

    node.y =
      point.y - dragState.offsetY;

    redraw();
  }
});

canvas.addEventListener("pointerup", event => {
  if (drawingStroke) {
    if (drawingStroke.points.length > 1) {
      state.objects.push(drawingStroke);
    }

    drawingStroke = null;

    try {
      canvas.releasePointerCapture(event.pointerId);
    } catch {}

    redraw();
  }

  if (dragState) {
    dragState = null;

    try {
      canvas.releasePointerCapture(event.pointerId);
    } catch {}

    redraw();
  }
});

canvas.addEventListener("pointercancel", () => {
  drawingStroke = null;
  dragState = null;
  redraw();
});


/* =========================================================
   SELECT / DELETE
   ========================================================= */

document
  .getElementById("deleteSelected")
  .addEventListener("click", () => {
    if (!state.selectedId) {
      return;
    }

    saveHistory();

    const selectedId = state.selectedId;

    state.objects =
      state.objects.filter(obj => {
        if (obj.id === selectedId) {
          return false;
        }

        if (
          obj.type === "edge" ||
          obj.type === "directed"
        ) {
          return (
            obj.from !== selectedId &&
            obj.to !== selectedId
          );
        }

        return true;
      });

    state.selectedId = null;

    redraw();
  });


/* =========================================================
   UNDO / REDO
   ========================================================= */

document
  .getElementById("undo")
  .addEventListener("click", () => {
    if (!state.history.length) {
      return;
    }

    state.future.push(
      cloneObjects(state.objects)
    );

    const previous =
      state.history.pop();

    restoreObjects(previous);
  });

document
  .getElementById("redo")
  .addEventListener("click", () => {
    if (!state.future.length) {
      return;
    }

    state.history.push(
      cloneObjects(state.objects)
    );

    const next =
      state.future.pop();

    restoreObjects(next);
  });


/* =========================================================
   CLEAR BOARD
   ========================================================= */

document
  .getElementById("clearBoard")
  .addEventListener("click", () => {
    if (!state.objects.length) {
      return;
    }

    showConfirmation(
      "Clear everything on the whiteboard?",
      () => {
        saveHistory();

        state.objects = [];
        state.selectedId = null;
        edgeStartNodeId = null;

        redraw();
      }
    );
  });


/* =========================================================
   NOTEPAD SELECTION SAVING
   ========================================================= */

/*
  The Insert Table button takes focus away from the contenteditable
  notepad. This means the browser's current selection can disappear.

  We keep our own copy of the last selection so the table can be
  inserted exactly where the cursor was.
*/

function saveNotesSelection() {
  const selection =
    window.getSelection();

  if (!selection || selection.rangeCount === 0) {
    return;
  }

  const range =
    selection.getRangeAt(0);

  if (
    notes.contains(range.startContainer) &&
    notes.contains(range.endContainer)
  ) {
    savedNotesRange = range.cloneRange();
  }
}

function restoreNotesSelection() {
  if (!savedNotesRange) {
    return false;
  }

  try {
    const selection =
      window.getSelection();

    selection.removeAllRanges();
    selection.addRange(
      savedNotesRange
    );

    return true;
  } catch {
    return false;
  }
}

document.addEventListener(
  "selectionchange",
  () => {
    const active =
      document.activeElement;

    if (
      active === notes ||
      notes.contains(active)
    ) {
      saveNotesSelection();
    }
  }
);

notes.addEventListener(
  "mouseup",
  saveNotesSelection
);

notes.addEventListener(
  "keyup",
  saveNotesSelection
);

notes.addEventListener(
  "focus",
  saveNotesSelection
);


/* =========================================================
   NOTEPAD TABLE INSERTION
   ========================================================= */

const insertTableButton =
  document.getElementById("insertTable");

const tableEditor =
  document.getElementById("tableEditor");

const tableRows =
  document.getElementById("tableRows");

const tableColumns =
  document.getElementById("tableColumns");

const tableInsert =
  document.getElementById("tableInsert");

const tableCancel =
  document.getElementById("tableCancel");


insertTableButton.addEventListener("click", () => {
  saveNotesSelection();

  tableEditor.hidden = false;

  tableRows.focus();
  tableRows.select();
});


tableCancel.addEventListener("click", () => {
  tableEditor.hidden = true;

  notes.focus();
  restoreNotesSelection();
});


tableInsert.addEventListener("click", () => {
  const rows = Math.max(
    1,
    Math.min(
      30,
      Number(tableRows.value) || 1
    )
  );

  const columns = Math.max(
    1,
    Math.min(
      20,
      Number(tableColumns.value) || 1
    )
  );

  tableEditor.hidden = true;

  notes.focus();

  const restored =
    restoreNotesSelection();

  const range =
    restored
      ? savedNotesRange.cloneRange()
      : document.createRange();

  if (!restored) {
    range.selectNodeContents(notes);
    range.collapse(false);
  }

  /*
    If the cursor is currently inside an existing table cell,
    inserting a table there would create a nested table.

    Instead, place the new table immediately after the
    containing table.
  */

  let currentElement = range.startContainer;

  if (
    currentElement.nodeType === Node.TEXT_NODE
  ) {
    currentElement =
      currentElement.parentElement;
  }

  const containingCell =
    currentElement?.closest?.("td");

  if (containingCell) {
    const containingTable =
      containingCell.closest("table");

    if (containingTable) {
      range.selectNode(containingTable);
      range.collapse(false);
    }
  }

  range.deleteContents();

  const table =
    document.createElement("table");

  for (let r = 0; r < rows; r++) {
    const tr =
      document.createElement("tr");

    for (let c = 0; c < columns; c++) {
      const td =
        document.createElement("td");

      td.contentEditable = "true";
      td.innerHTML = "&nbsp;";

      tr.appendChild(td);
    }

    table.appendChild(tr);
  }

  range.insertNode(table);

  /*
    Put a normal editable paragraph after the table
    so students can continue typing below it.
  */

  const paragraph =
    document.createElement("div");

  paragraph.innerHTML = "<br>";

  table.parentNode.insertBefore(
    paragraph,
    table.nextSibling
  );

  /*
    Place the cursor in the first cell.
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
    selection.addRange(cellRange);

    savedNotesRange =
      cellRange.cloneRange();
  }
});


/* =========================================================
   TABLE TAB NAVIGATION
   ========================================================= */

notes.addEventListener("keydown", event => {
  if (event.key !== "Tab") {
    return;
  }

  const target = event.target;

  if (
    !target ||
    target.tagName !== "TD"
  ) {
    return;
  }

  event.preventDefault();

  const cell = target;
  const row = cell.parentElement;
  const table = row.parentElement;

  const cells = Array.from(
    table.querySelectorAll("td")
  );

  const index =
    cells.indexOf(cell);

  if (index === -1) {
    return;
  }

  if (index < cells.length - 1) {
    cells[index + 1].focus();
    return;
  }

  /*
    Tab from the last cell creates a new row.
  */

  const columnCount =
    row.children.length;

  const newRow =
    document.createElement("tr");

  for (let i = 0; i < columnCount; i++) {
    const newCell =
      document.createElement("td");

    newCell.contentEditable = "true";
    newCell.innerHTML = "&nbsp;";

    newRow.appendChild(newCell);
  }

  table.appendChild(newRow);

  const firstNewCell =
    newRow.querySelector("td");

  if (firstNewCell) {
    firstNewCell.focus();

    const range =
      document.createRange();

    range.selectNodeContents(
      firstNewCell
    );

    range.collapse(true);

    const selection =
      window.getSelection();

    selection.removeAllRanges();
    selection.addRange(range);

    savedNotesRange =
      range.cloneRange();
  }
});


/* =========================================================
   CLEAR NOTES
   ========================================================= */

document
  .getElementById("clearNotes")
  .addEventListener("click", () => {
    if (!notes.innerHTML.trim()) {
      return;
    }

    showConfirmation(
      "Clear all scratch notes?",
      () => {
        notes.innerHTML = "";
        savedNotesRange = null;
      }
    );
  });


/* =========================================================
   CLEAR EVERYTHING
   ========================================================= */

document
  .getElementById("clearAll")
  .addEventListener("click", () => {
    const hasBoard =
      state.objects.length > 0;

    const hasNotes =
      notes.innerHTML.trim().length > 0;

    if (!hasBoard && !hasNotes) {
      return;
    }

    showConfirmation(
      "Clear the entire whiteboard and notepad?",
      () => {
        state.objects = [];
        state.selectedId = null;
        state.history = [];
        state.future = [];

        notes.innerHTML = "";
        savedNotesRange = null;

        edgeStartNodeId = null;

        redraw();
      }
    );
  });


/* =========================================================
   DOWNLOAD WORK
   ========================================================= */

document
  .getElementById("downloadAll")
  .addEventListener("click", () => {

    /*
      Whiteboard PNG
    */

    const whiteboardLink =
      document.createElement("a");

    whiteboardLink.download =
      "whiteboard.png";

    whiteboardLink.href =
      canvas.toDataURL("image/png");

    whiteboardLink.click();


    /*
      Notepad HTML
    */

    const notesHTML = `
<!doctype html>
<html>
<head>
<meta charset="utf-8">
<title>Scratch Notes</title>

<style>
body {
  font-family:
    ui-monospace,
    SFMono-Regular,
    Menlo,
    Consolas,
    monospace;

  line-height: 1.55;
  padding: 24px;
}

table {
  border-collapse: collapse;
  margin: 12px 0;
}

td {
  min-width: 90px;
  height: 32px;
  border: 1px solid #7b8794;
  padding: 5px 8px;
  vertical-align: top;
}
</style>

</head>

<body>

${notes.innerHTML}

</body>
</html>
`;

    const blob =
      new Blob(
        [notesHTML],
        { type: "text/html" }
      );

    const url =
      URL.createObjectURL(blob);

    const notesLink =
      document.createElement("a");

    notesLink.href = url;
    notesLink.download =
      "scratch-notes.html";

    notesLink.click();

    setTimeout(() => {
      URL.revokeObjectURL(url);
    }, 1000);
  });


/* =========================================================
   TABS
   ========================================================= */

document.querySelectorAll(".tab").forEach(tab => {
  tab.addEventListener("click", () => {
    const target =
      tab.dataset.tab;

    document
      .querySelectorAll(".tab")
      .forEach(button => {
        button.classList.toggle(
          "active",
          button === tab
        );
      });

    document
      .querySelectorAll(".panel")
      .forEach(panel => {
        panel.classList.remove(
          "active-panel"
        );
      });

    const panel =
      document.getElementById(target);

    panel.classList.add(
      "active-panel"
    );

    if (target === "whiteboard") {
      requestAnimationFrame(
        resizeCanvas
      );
    }
  });
});


/* =========================================================
   ESCAPE KEY
   ========================================================= */

document.addEventListener(
  "keydown",
  event => {
    if (event.key !== "Escape") {
      return;
    }

    hideEditors();
    hideConfirmation();

    tableEditor.hidden = true;

    edgeStartNodeId = null;

    redraw();
  }
);


/* =========================================================
   INITIALIZATION
   ========================================================= */

window.addEventListener(
  "resize",
  resizeCanvas
);

resizeCanvas();
redraw();
