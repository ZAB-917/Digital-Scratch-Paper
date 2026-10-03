/* =========================================================
   WORKSPACE STATE
   ========================================================= */

function createWorkspaceState() {
  return {
    objects: [],
    selectedId: null,
    tool: "select",
    color: "#111827",
    size: 3,
    history: [],
    future: [],
    edgeStartNodeId: null
  };
}


/*
  MAIN workspace:
  This is the student's normal whiteboard/notepad.

  BLANK workspace:
  Completely independent blank workspace.
*/

const mainState =
  createWorkspaceState();

const blankState =
  createWorkspaceState();


/* =========================================================
   DOM REFERENCES
   ========================================================= */

const main = document.getElementById(
  "mainWorkspace"
);


/* Main whiteboard */

const board =
  document.getElementById("board");

const boardWrap =
  document.getElementById("boardWrap");

const ctx =
  board.getContext("2d");


/* Existing-work split whiteboard */

const splitBoard =
  document.getElementById("splitBoard");

const splitBoardWrap =
  document.getElementById(
    "splitBoardWrap"
  );

const splitCtx =
  splitBoard.getContext("2d");


/* Blank split whiteboard */

const blankBoard =
  document.getElementById(
    "blankBoard"
  );

const blankBoardWrap =
  document.getElementById(
    "blankBoardWrap"
  );

const blankCtx =
  blankBoard.getContext("2d");


/* Notes */

const notes =
  document.getElementById("notes");

const splitNotes =
  document.getElementById(
    "splitNotes"
  );

const blankNotes =
  document.getElementById(
    "blankNotes"
  );


/* =========================================================
   CURSOR MEMORY
   ========================================================= */

let savedNotesRange = null;
let savedBlankNotesRange = null;


function saveSelectionFor(
  editor,
  callback
) {
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
    editor.contains(
      range.startContainer
    ) &&
    editor.contains(
      range.endContainer
    )
  ) {
    callback(
      range.cloneRange()
    );
  }
}


function restoreSelection(
  range
) {
  if (!range) {
    return false;
  }

  try {

    const selection =
      window.getSelection();

    selection.removeAllRanges();

    selection.addRange(
      range
    );

    return true;

  } catch {
    return false;
  }
}


function saveMainNotesSelection() {
  saveSelectionFor(
    notes,
    range => {
      savedNotesRange =
        range;
    }
  );
}


function saveBlankNotesSelection() {
  saveSelectionFor(
    blankNotes,
    range => {
      savedBlankNotesRange =
        range;
    }
  );
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
      saveMainNotesSelection();
    }

    if (
      active === blankNotes ||
      blankNotes.contains(active)
    ) {
      saveBlankNotesSelection();
    }
  }
);


[
  "mouseup",
  "keyup",
  "focus"
].forEach(eventName => {

  notes.addEventListener(
    eventName,
    saveMainNotesSelection
  );

  blankNotes.addEventListener(
    eventName,
    saveBlankNotesSelection
  );

});


/* =========================================================
   GENERAL HELPERS
   ========================================================= */

function makeId() {
  return (
    Math.random()
      .toString(36)
      .slice(2) +
    Date.now()
      .toString(36)
  );
}


function cloneObjects(objects) {
  return JSON.parse(
    JSON.stringify(objects)
  );
}


function saveHistory(state) {
  state.history.push(
    cloneObjects(
      state.objects
    )
  );

  if (
    state.history.length > 100
  ) {
    state.history.shift();
  }

  state.future = [];
}


function restoreObjects(
  state,
  objects
) {
  state.objects =
    cloneObjects(objects);

  state.selectedId = null;

  redrawAll();
}


function getObject(
  state,
  id
) {
  return state.objects.find(
    obj =>
      obj.id === id
  );
}


function getNode(
  state,
  id
) {
  const object =
    getObject(
      state,
      id
    );

  return object &&
    object.type === "node"
    ? object
    : null;
}


function getEdge(
  state,
  id
) {
  const object =
    getObject(
      state,
      id
    );

  if (!object) {
    return null;
  }

  return (
    object.type === "edge" ||
    object.type === "directed"
  )
    ? object
    : null;
}


function distance(a, b) {
  return Math.hypot(
    a.x - b.x,
    a.y - b.y
  );
}


function midpoint(a, b) {
  return {
    x: (a.x + b.x) / 2,
    y: (a.y + b.y) / 2
  };
}


function getPoint(
  event,
  canvasElement
) {
  const rect =
    canvasElement.getBoundingClientRect();

  return {
    x:
      event.clientX -
      rect.left,

    y:
      event.clientY -
      rect.top
  };
}


/* =========================================================
   CANVAS RESIZING
   ========================================================= */

function resizeCanvas(
  canvasElement,
  wrapElement,
  context
) {
  const rect =
    wrapElement.getBoundingClientRect();

  if (
    rect.width <= 0 ||
    rect.height <= 0
  ) {
    return;
  }

  const dpr =
    window.devicePixelRatio || 1;

  canvasElement.width =
    Math.max(
      1,
      Math.floor(
        rect.width * dpr
      )
    );

  canvasElement.height =
    Math.max(
      1,
      Math.floor(
        rect.height * dpr
      )
    );

  canvasElement.style.width =
    `${rect.width}px`;

  canvasElement.style.height =
    `${rect.height}px`;

  context.setTransform(
    dpr,
    0,
    0,
    dpr,
    0,
    0
  );
}


function resizeAllCanvases() {

  resizeCanvas(
    board,
    boardWrap,
    ctx
  );

  resizeCanvas(
    splitBoard,
    splitBoardWrap,
    splitCtx
  );

  resizeCanvas(
    blankBoard,
    blankBoardWrap,
    blankCtx
  );

  redrawAll();
}


/* =========================================================
   HIT TESTING
   ========================================================= */

function nodeAt(
  state,
  point
) {
  for (
    let i =
      state.objects.length - 1;
    i >= 0;
    i--
  ) {

    const object =
      state.objects[i];

    if (
      object.type !== "node"
    ) {
      continue;
    }

    if (
      distance(
        point,
        object
      ) <= 24
    ) {
      return object;
    }
  }

  return null;
}


function pointToSegmentDistance(
  point,
  a,
  b
) {
  const dx =
    b.x - a.x;

  const dy =
    b.y - a.y;

  if (
    dx === 0 &&
    dy === 0
  ) {
    return distance(
      point,
      a
    );
  }

  const t =
    Math.max(
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

  const closest = {
    x:
      a.x + t * dx,

    y:
      a.y + t * dy
  };

  return distance(
    point,
    closest
  );
}


function edgeAt(
  state,
  point
) {
  for (
    let i =
      state.objects.length - 1;
    i >= 0;
    i--
  ) {

    const object =
      state.objects[i];

    if (
      object.type !== "edge" &&
      object.type !== "directed"
    ) {
      continue;
    }

    const from =
      getNode(
        state,
        object.from
      );

    const to =
      getNode(
        state,
        object.to
      );

    if (!from || !to) {
      continue;
    }

    if (
      pointToSegmentDistance(
        point,
        from,
        to
      ) <= 10
    ) {
      return object;
    }
  }

  return null;
}


function strokeAt(
  state,
  point
) {
  for (
    let i =
      state.objects.length - 1;
    i >= 0;
    i--
  ) {

    const object =
      state.objects[i];

    if (
      object.type !== "stroke"
    ) {
      continue;
    }

    for (
      let j = 1;
      j < object.points.length;
      j++
    ) {

      if (
        pointToSegmentDistance(
          point,
          object.points[j - 1],
          object.points[j]
        ) <=
        Math.max(
          8,
          object.size + 5
        )
      ) {
        return object;
      }
    }
  }

  return null;
}


function objectAt(
  state,
  point
) {
  return (
    nodeAt(state, point) ||
    edgeAt(state, point) ||
    strokeAt(state, point)
  );
}


/* =========================================================
   DRAWING
   ========================================================= */

function drawGrid(
  context,
  wrap
) {
  const rect =
    wrap.getBoundingClientRect();

  const spacing = 25;

  context.save();

  context.strokeStyle =
    "#eef1f4";

  context.lineWidth = 1;

  for (
    let x = 0;
    x <= rect.width;
    x += spacing
  ) {

    context.beginPath();

    context.moveTo(
      x,
      0
    );

    context.lineTo(
      x,
      rect.height
    );

    context.stroke();
  }

  for (
    let y = 0;
    y <= rect.height;
    y += spacing
  ) {

    context.beginPath();

    context.moveTo(
      0,
      y
    );

    context.lineTo(
      rect.width,
      y
    );

    context.stroke();
  }

  context.restore();
}


function drawArrowhead(
  context,
  from,
  to
) {
  const angle =
    Math.atan2(
      to.y - from.y,
      to.x - from.x
    );

  const length = 12;
  const width = Math.PI / 7;

  context.beginPath();

  context.moveTo(
    to.x,
    to.y
  );

  context.lineTo(
    to.x -
      length *
      Math.cos(
        angle - width
      ),
    to.y -
      length *
      Math.sin(
        angle - width
      )
  );

  context.lineTo(
    to.x -
      length *
      Math.cos(
        angle + width
      ),
    to.y -
      length *
      Math.sin(
        angle + width
      )
  );

  context.closePath();

  context.fill();
}


function drawNode(
  context,
  node,
  selected
) {
  context.save();

  context.beginPath();

  context.arc(
    node.x,
    node.y,
    20,
    0,
    Math.PI * 2
  );

  context.fillStyle =
    "#ffffff";

  context.fill();

  context.lineWidth =
    selected ? 3 : 2;

  context.strokeStyle =
    selected
      ? "#2563eb"
      : "#111827";

  context.stroke();

  if (node.label) {

    context.fillStyle =
      "#111827";

    context.font =
      "14px system-ui, sans-serif";

    context.textAlign =
      "center";

    context.textBaseline =
      "middle";

    context.fillText(
      node.label,
      node.x,
      node.y
    );
  }

  context.restore();
}


function drawEdge(
  context,
  state,
  edge,
  selected
) {
  const from =
    getNode(
      state,
      edge.from
    );

  const to =
    getNode(
      state,
      edge.to
    );

  if (!from || !to) {
    return;
  }

  context.save();

  context.strokeStyle =
    selected
      ? "#2563eb"
      : "#111827";

  context.fillStyle =
    selected
      ? "#2563eb"
      : "#111827";

  context.lineWidth =
    selected ? 3 : 2;

  context.beginPath();

  context.moveTo(
    from.x,
    from.y
  );

  context.lineTo(
    to.x,
    to.y
  );

  context.stroke();

  if (
    edge.type === "directed"
  ) {
    drawArrowhead(
      context,
      from,
      to
    );
  }

  if (
    edge.weight !== undefined &&
    edge.weight !== ""
  ) {

    const mid =
      midpoint(
        from,
        to
      );

    const text =
      String(edge.weight);

    context.font =
      "14px system-ui, sans-serif";

    context.textAlign =
      "center";

    context.textBaseline =
      "middle";

    const metrics =
      context.measureText(
        text
      );

    context.fillStyle =
      "#ffffff";

    context.fillRect(
      mid.x -
        metrics.width / 2 -
        5,

      mid.y - 12,

      metrics.width + 10,

      24
    );

    context.fillStyle =
      selected
        ? "#2563eb"
        : "#111827";

    context.fillText(
      text,
      mid.x,
      mid.y
    );
  }

  context.restore();
}


function drawStroke(
  context,
  stroke
) {
  if (
    !stroke.points.length
  ) {
    return;
  }

  context.save();

  context.strokeStyle =
    stroke.color ||
    "#111827";

  context.lineWidth =
    stroke.size || 3;

  context.lineCap =
    "round";

  context.lineJoin =
    "round";

  context.beginPath();

  context.moveTo(
    stroke.points[0].x,
    stroke.points[0].y
  );

  for (
    let i = 1;
    i < stroke.points.length;
    i++
  ) {

    context.lineTo(
      stroke.points[i].x,
      stroke.points[i].y
    );
  }

  context.stroke();

  context.restore();
}


function drawTextObject(
  context,
  object
) {
  context.save();

  context.fillStyle =
    object.color ||
    "#111827";

  context.font =
    "16px system-ui, sans-serif";

  context.textBaseline =
    "top";

  const lines =
    String(
      object.text || ""
    ).split("\n");

  lines.forEach(
    (line, index) => {

      context.fillText(
        line,
        object.x,
        object.y +
          index * 21
      );
    }
  );

  context.restore();
}


function drawWorkspace(
  context,
  wrap,
  state
) {
  const rect =
    wrap.getBoundingClientRect();

  if (
    rect.width <= 0 ||
    rect.height <= 0
  ) {
    return;
  }

  context.clearRect(
    0,
    0,
    rect.width,
    rect.height
  );

  drawGrid(
    context,
    wrap
  );

  for (
    const object of state.objects
  ) {

    if (
      object.type === "stroke"
    ) {
      drawStroke(
        context,
        object
      );
    }
  }

  for (
    const object of state.objects
  ) {

    if (
      object.type === "edge" ||
      object.type === "directed"
    ) {

      drawEdge(
        context,
        state,
        object,
        object.id ===
          state.selectedId
      );
    }
  }

  for (
    const object of state.objects
  ) {

    if (
      object.type === "node"
    ) {

      drawNode(
        context,
        object,
        object.id ===
          state.selectedId
      );
    }
  }

  for (
    const object of state.objects
  ) {

    if (
      object.type === "text"
    ) {

      drawTextObject(
        context,
        object
      );
    }
  }
}


function redrawAll() {

  drawWorkspace(
    ctx,
    boardWrap,
    mainState
  );

  drawWorkspace(
    splitCtx,
    splitBoardWrap,
    mainState
  );

  drawWorkspace(
    blankCtx,
    blankBoardWrap,
    blankState
  );
}


/* =========================================================
   MAIN TOOL HELP
   ========================================================= */

const toolHelp =
  document.getElementById(
    "toolHelp"
  );

const toolDescriptions = {
  select:
    "Select and move objects.",

  pen:
    "Draw freehand.",

  eraser:
    "Erase freehand strokes.",

  node:
    "Click to place a graph node.",

  edge:
    "Click two nodes to connect them.",

  directed:
    "Click two nodes to create a directed edge.",

  weight:
    "Click an edge to add or edit its weight.",

  text:
    "Click to place text."
};


/* =========================================================
   TOOL SELECTION
   ========================================================= */

document
  .querySelectorAll(
    ".tool[data-workspace='main']"
  )
  .forEach(button => {

    button.addEventListener(
      "click",
      () => {

        mainState.tool =
          button.dataset.tool;

        mainState.edgeStartNodeId =
          null;

        document
          .querySelectorAll(
            ".tool[data-workspace='main']"
          )
          .forEach(btn =>
            btn.classList.remove(
              "active"
            )
          );

        button.classList.add(
          "active"
        );

        toolHelp.textContent =
          toolDescriptions[
            mainState.tool
          ];

        updateCanvasCursors();

        redrawAll();
      }
    );
  });


function updateCanvasCursors() {

  const cursor =
    mainState.tool === "select"
      ? "default"
      : "crosshair";

  board.style.cursor =
    cursor;

  splitBoard.style.cursor =
    cursor;

  blankBoard.style.cursor =
    blankState.tool === "select"
      ? "default"
      : "crosshair";
}


/* =========================================================
   MAIN COLORS / PEN SIZE
   ========================================================= */

document
  .getElementById(
    "strokeColor"
  )
  .addEventListener(
    "input",
    event => {

      mainState.color =
        event.target.value;
    }
  );


document
  .getElementById(
    "strokeSize"
  )
  .addEventListener(
    "input",
    event => {

      mainState.size =
        Number(
          event.target.value
        );
    }
  );


/* =========================================================
   FLOATING EDITORS
   ========================================================= */

let activeEditorBoardWrap =
  boardWrap;


function positionEditor(
  editor,
  point,
  wrap
) {
  editor.style.left =
    `${Math.max(
      10,
      Math.min(
        point.x + 10,
        wrap.clientWidth -
          editor.offsetWidth -
          10
      )
    )}px`;

  editor.style.top =
    `${Math.max(
      10,
      Math.min(
        point.y + 10,
        wrap.clientHeight -
          editor.offsetHeight -
          10
      )
    )}px`;
}


function hideMainEditors() {

  document
    .getElementById(
      "textEditor"
    )
    .hidden = true;

  document
    .getElementById(
      "nodeEditor"
    )
    .hidden = true;

  document
    .getElementById(
      "weightEditor"
    )
    .hidden = true;
}


function hideBlankEditors() {

  document
    .getElementById(
      "blankTextEditor"
    )
    .hidden = true;

  document
    .getElementById(
      "blankNodeEditor"
    )
    .hidden = true;

  document
    .getElementById(
      "blankWeightEditor"
    )
    .hidden = true;
}


/* =========================================================
   MAIN WHITEBOARD EDITORS
   ========================================================= */

let mainPendingTextPoint = null;
let mainPendingNodePoint = null;
let mainPendingNodeId = null;
let mainPendingWeightEdgeId = null;


function openMainTextEditor(
  point,
  wrap
) {
  hideMainEditors();

  activeEditorBoardWrap =
    wrap;

  mainPendingTextPoint =
    point;

  const editor =
    document.getElementById(
      "textEditor"
    );

  editor.hidden = false;

  requestAnimationFrame(
    () => {

      positionEditor(
        editor,
        point,
        wrap
      );

      document
        .getElementById(
          "textInput"
        )
        .focus();
    }
  );
}


function openMainNodeEditor(
  point,
  wrap,
  node = null
) {
  hideMainEditors();

  activeEditorBoardWrap =
    wrap;

  mainPendingNodePoint =
    point;

  mainPendingNodeId =
    node
      ? node.id
      : null;

  const input =
    document.getElementById(
      "nodeInput"
    );

  input.value =
    node
      ? node.label || ""
      : "";

  const editor =
    document.getElementById(
      "nodeEditor"
    );

  editor.hidden = false;

  requestAnimationFrame(
    () => {

      positionEditor(
        editor,
        point,
        wrap
      );

      input.focus();
      input.select();
    }
  );
}


function openMainWeightEditor(
  edge,
  wrap
) {
  hideMainEditors();

  activeEditorBoardWrap =
    wrap;

  mainPendingWeightEdgeId =
    edge.id;

  const from =
    getNode(
      mainState,
      edge.from
    );

  const to =
    getNode(
      mainState,
      edge.to
    );

  if (!from || !to) {
    return;
  }

  const point =
    midpoint(
      from,
      to
    );

  const input =
    document.getElementById(
      "weightInput"
    );

  input.value =
    edge.weight ?? "";

  const editor =
    document.getElementById(
      "weightEditor"
    );

  editor.hidden = false;

  requestAnimationFrame(
    () => {

      positionEditor(
        editor,
        point,
        wrap
      );

      input.focus();
      input.select();
    }
  );
}


function applyMainText() {

  const value =
    document
      .getElementById(
        "textInput"
      )
      .value.trim();

  if (
    !value ||
    !mainPendingTextPoint
  ) {
    hideMainEditors();
    return;
  }

  saveHistory(mainState);

  mainState.objects.push({
    id: makeId(),
    type: "text",
    x: mainPendingTextPoint.x,
    y: mainPendingTextPoint.y,
    text: value,
    color: mainState.color
  });

  mainPendingTextPoint =
    null;

  hideMainEditors();

  redrawAll();
}


document
  .getElementById(
    "textAdd"
  )
  .addEventListener(
    "click",
    applyMainText
  );


document
  .getElementById(
    "textCancel"
  )
  .addEventListener(
    "click",
    () => {

      mainPendingTextPoint =
        null;

      hideMainEditors();
    }
  );


document
  .getElementById(
    "textInput"
  )
  .addEventListener(
    "keydown",
    event => {

      if (
        event.key === "Enter"
      ) {

        event.preventDefault();

        applyMainText();
      }

      if (
        event.key === "Escape"
      ) {

        event.preventDefault();

        mainPendingTextPoint =
          null;

        hideMainEditors();
      }
    }
  );


function applyMainNodeLabel() {

  const label =
    document
      .getElementById(
        "nodeInput"
      )
      .value.trim();

  if (
    mainPendingNodeId
  ) {

    const node =
      getNode(
        mainState,
        mainPendingNodeId
      );

    if (node) {

      saveHistory(mainState);

      node.label =
        label;
    }

  } else if (
    mainPendingNodePoint
  ) {

    saveHistory(mainState);

    mainState.objects.push({
      id: makeId(),
      type: "node",
      x: mainPendingNodePoint.x,
      y: mainPendingNodePoint.y,
      label
    });
  }

  mainPendingNodePoint =
    null;

  mainPendingNodeId =
    null;

  hideMainEditors();

  redrawAll();
}


document
  .getElementById(
    "nodeAdd"
  )
  .addEventListener(
    "click",
    applyMainNodeLabel
  );


document
  .getElementById(
    "nodeCancel"
  )
  .addEventListener(
    "click",
    () => {

      mainPendingNodePoint =
        null;

      mainPendingNodeId =
        null;

      hideMainEditors();
    }
  );


document
  .getElementById(
    "nodeInput"
  )
  .addEventListener(
    "keydown",
    event => {

      if (
        event.key === "Enter"
      ) {

        event.preventDefault();

        applyMainNodeLabel();
      }

      if (
        event.key === "Escape"
      ) {

        event.preventDefault();

        mainPendingNodePoint =
          null;

        mainPendingNodeId =
          null;

        hideMainEditors();
      }
    }
  );


function applyMainWeight() {

  const edge =
    getEdge(
      mainState,
      mainPendingWeightEdgeId
    );

  if (edge) {

    saveHistory(mainState);

    edge.weight =
      document
        .getElementById(
          "weightInput"
        )
        .value.trim();
  }

  mainPendingWeightEdgeId =
    null;

  hideMainEditors();

  redrawAll();
}


document
  .getElementById(
    "weightAdd"
  )
  .addEventListener(
    "click",
    applyMainWeight
  );


document
  .getElementById(
    "weightCancel"
  )
  .addEventListener(
    "click",
    () => {

      mainPendingWeightEdgeId =
        null;

      hideMainEditors();
    }
  );


document
  .getElementById(
    "weightInput"
  )
  .addEventListener(
    "keydown",
    event => {

      if (
        event.key === "Enter"
      ) {

        event.preventDefault();

        applyMainWeight();
      }

      if (
        event.key === "Escape"
      ) {

        event.preventDefault();

        mainPendingWeightEdgeId =
          null;

        hideMainEditors();
      }
    }
  );


/* =========================================================
   BLANK WHITEBOARD EDITORS
   ========================================================= */

let blankPendingTextPoint = null;
let blankPendingNodePoint = null;
let blankPendingNodeId = null;
let blankPendingWeightEdgeId = null;


function positionBlankEditor(
  editor,
  point
) {
  positionEditor(
    editor,
    point,
    blankBoardWrap
  );
}


function openBlankTextEditor(point) {

  hideBlankEditors();

  blankPendingTextPoint =
    point;

  const editor =
    document.getElementById(
      "blankTextEditor"
    );

  editor.hidden = false;

  requestAnimationFrame(
    () => {

      positionBlankEditor(
        editor,
        point
      );

      document
        .getElementById(
          "blankTextInput"
        )
        .focus();
    }
  );
}


function openBlankNodeEditor(
  point,
  node = null
) {
  hideBlankEditors();

  blankPendingNodePoint =
    point;

  blankPendingNodeId =
    node
      ? node.id
      : null;

  const input =
    document.getElementById(
      "blankNodeInput"
    );

  input.value =
    node
      ? node.label || ""
      : "";

  const editor =
    document.getElementById(
      "blankNodeEditor"
    );

  editor.hidden = false;

  requestAnimationFrame(
    () => {

      positionBlankEditor(
        editor,
        point
      );

      input.focus();
      input.select();
    }
  );
}


function openBlankWeightEditor(
  edge
) {
  hideBlankEditors();

  blankPendingWeightEdgeId =
    edge.id;

  const from =
    getNode(
      blankState,
      edge.from
    );

  const to =
    getNode(
      blankState,
      edge.to
    );

  if (!from || !to) {
    return;
  }

  const point =
    midpoint(
      from,
      to
    );

  const input =
    document.getElementById(
      "blankWeightInput"
    );

  input.value =
    edge.weight ?? "";

  const editor =
    document.getElementById(
      "blankWeightEditor"
    );

  editor.hidden = false;

  requestAnimationFrame(
    () => {

      positionBlankEditor(
        editor,
        point
      );

      input.focus();
      input.select();
    }
  );
}


function applyBlankText() {

  const value =
    document
      .getElementById(
        "blankTextInput"
      )
      .value.trim();

  if (
    !value ||
    !blankPendingTextPoint
  ) {
    hideBlankEditors();
    return;
  }

  saveHistory(blankState);

  blankState.objects.push({
    id: makeId(),
    type: "text",
    x: blankPendingTextPoint.x,
    y: blankPendingTextPoint.y,
    text: value,
    color: blankState.color
  });

  blankPendingTextPoint =
    null;

  hideBlankEditors();

  redrawAll();
}


document
  .getElementById(
    "blankTextAdd"
  )
  .addEventListener(
    "click",
    applyBlankText
  );


document
  .getElementById(
    "blankTextCancel"
  )
  .addEventListener(
    "click",
    () => {

      blankPendingTextPoint =
        null;

      hideBlankEditors();
    }
  );


document
  .getElementById(
    "blankTextInput"
  )
  .addEventListener(
    "keydown",
    event => {

      if (
        event.key === "Enter"
      ) {

        event.preventDefault();

        applyBlankText();
      }

      if (
        event.key === "Escape"
      ) {

        event.preventDefault();

        blankPendingTextPoint =
          null;

        hideBlankEditors();
      }
    }
  );


function applyBlankNodeLabel() {

  const label =
    document
      .getElementById(
        "blankNodeInput"
      )
      .value.trim();

  if (
    blankPendingNodeId
  ) {

    const node =
      getNode(
        blankState,
        blankPendingNodeId
      );

    if (node) {

      saveHistory(blankState);

      node.label =
        label;
    }

  } else if (
    blankPendingNodePoint
  ) {

    saveHistory(blankState);

    blankState.objects.push({
      id: makeId(),
      type: "node",
      x: blankPendingNodePoint.x,
      y: blankPendingNodePoint.y,
      label
    });
  }

  blankPendingNodePoint =
    null;

  blankPendingNodeId =
    null;

  hideBlankEditors();

  redrawAll();
}


document
  .getElementById(
    "blankNodeAdd"
  )
  .addEventListener(
    "click",
    applyBlankNodeLabel
  );


document
  .getElementById(
    "blankNodeCancel"
  )
  .addEventListener(
    "click",
    () => {

      blankPendingNodePoint =
        null;

      blankPendingNodeId =
        null;

      hideBlankEditors();
    }
  );


document
  .getElementById(
    "blankNodeInput"
  )
  .addEventListener(
    "keydown",
    event => {

      if (
        event.key === "Enter"
      ) {

        event.preventDefault();

        applyBlankNodeLabel();
      }

      if (
        event.key === "Escape"
      ) {

        event.preventDefault();

        blankPendingNodePoint =
          null;

        blankPendingNodeId =
          null;

        hideBlankEditors();
      }
    }
  );


function applyBlankWeight() {

  const edge =
    getEdge(
      blankState,
      blankPendingWeightEdgeId
    );

  if (edge) {

    saveHistory(blankState);

    edge.weight =
      document
        .getElementById(
          "blankWeightInput"
        )
        .value.trim();
  }

  blankPendingWeightEdgeId =
    null;

  hideBlankEditors();

  redrawAll();
}


document
  .getElementById(
    "blankWeightAdd"
  )
  .addEventListener(
    "click",
    applyBlankWeight
  );


document
  .getElementById(
    "blankWeightCancel"
  )
  .addEventListener(
    "click",
    () => {

      blankPendingWeightEdgeId =
        null;

      hideBlankEditors();
    }
  );


document
  .getElementById(
    "blankWeightInput"
  )
  .addEventListener(
    "keydown",
    event => {

      if (
        event.key === "Enter"
      ) {

        event.preventDefault();

        applyBlankWeight();
      }

      if (
        event.key === "Escape"
      ) {

        event.preventDefault();

        blankPendingWeightEdgeId =
          null;

        hideBlankEditors();
      }
    }
  );


/* =========================================================
   POINTER HANDLING
   ========================================================= */

let drawingStroke = null;
let dragState = null;


function handlePointerDown(
  event,
  state,
  canvasElement,
  wrapElement,
  isBlank
) {
  event.preventDefault();

  const point =
    getPoint(
      event,
      canvasElement
    );

  if (isBlank) {
    hideBlankEditors();
  } else {
    hideMainEditors();
  }


  /* -------------------------------------------------------
     PEN
     ------------------------------------------------------- */

  if (
    state.tool === "pen"
  ) {

    saveHistory(state);

    drawingStroke = {
      state,
      canvasElement,
      id: makeId(),
      type: "stroke",
      color: state.color,
      size: state.size,
      points: [point]
    };

    canvasElement.setPointerCapture(
      event.pointerId
    );

    redrawAll();

    return;
  }


  /* -------------------------------------------------------
     ERASER
     ------------------------------------------------------- */

  if (
    state.tool === "eraser"
  ) {

    const target =
      strokeAt(
        state,
        point
      );

    if (target) {

      saveHistory(state);

      state.objects =
        state.objects.filter(
          object =>
            object.id !==
            target.id
        );

      redrawAll();
    }

    return;
  }


  /* -------------------------------------------------------
     NODE
     ------------------------------------------------------- */

  if (
    state.tool === "node"
  ) {

    if (isBlank) {

      openBlankNodeEditor(
        point
      );

    } else {

      openMainNodeEditor(
        point,
        wrapElement
      );
    }

    return;
  }


  /* -------------------------------------------------------
     EDGE
     ------------------------------------------------------- */

  if (
    state.tool === "edge" ||
    state.tool === "directed"
  ) {

    const node =
      nodeAt(
        state,
        point
      );

    if (!node) {

      state.edgeStartNodeId =
        null;

      redrawAll();

      return;
    }

    if (
      !state.edgeStartNodeId
    ) {

      state.edgeStartNodeId =
        node.id;

      state.selectedId =
        node.id;

      redrawAll();

      return;
    }

    if (
      state.edgeStartNodeId ===
      node.id
    ) {
      return;
    }

    saveHistory(state);

    state.objects.push({
      id: makeId(),

      type:
        state.tool === "directed"
          ? "directed"
          : "edge",

      from:
        state.edgeStartNodeId,

      to:
        node.id,

      weight: ""
    });

    state.edgeStartNodeId =
      null;

    state.selectedId =
      null;

    redrawAll();

    return;
  }


  /* -------------------------------------------------------
     WEIGHT
     ------------------------------------------------------- */

  if (
    state.tool === "weight"
  ) {

    const edge =
      edgeAt(
        state,
        point
      );

    if (!edge) {
      return;
    }

    if (isBlank) {

      openBlankWeightEditor(
        edge
      );

    } else {

      openMainWeightEditor(
        edge,
        wrapElement
      );
    }

    return;
  }


  /* -------------------------------------------------------
     TEXT
     ------------------------------------------------------- */

  if (
    state.tool === "text"
  ) {

    if (isBlank) {

      openBlankTextEditor(
        point
      );

    } else {

      openMainTextEditor(
        point,
        wrapElement
      );
    }

    return;
  }


  /* -------------------------------------------------------
     SELECT
     ------------------------------------------------------- */

  if (
    state.tool === "select"
  ) {

    const target =
      objectAt(
        state,
        point
      );

    if (!target) {

      state.selectedId =
        null;

      redrawAll();

      return;
    }

    state.selectedId =
      target.id;

    if (
      target.type === "node"
    ) {

      saveHistory(state);

      dragState = {
        state,

        canvasElement,

        nodeId:
          target.id,

        offsetX:
          point.x -
          target.x,

        offsetY:
          point.y -
          target.y
      };

      canvasElement.setPointerCapture(
        event.pointerId
      );
    }

    redrawAll();
  }
}


function handlePointerMove(
  event,
  canvasElement
) {
  if (
    !drawingStroke &&
    !dragState
  ) {
    return;
  }

  const point =
    getPoint(
      event,
      canvasElement
    );

  if (drawingStroke) {

    drawingStroke.points.push(
      point
    );

    redrawAll();

    return;
  }

  if (dragState) {

    const node =
      getNode(
        dragState.state,
        dragState.nodeId
      );

    if (!node) {
      return;
    }

    node.x =
      point.x -
      dragState.offsetX;

    node.y =
      point.y -
      dragState.offsetY;

    redrawAll();
  }
}


function handlePointerUp(
  event,
  canvasElement
) {

  if (drawingStroke) {

    if (
      drawingStroke.points.length >
      1
    ) {

      drawingStroke.state.objects.push(
        drawingStroke
      );
    }

    drawingStroke =
      null;

    try {
      canvasElement.releasePointerCapture(
        event.pointerId
      );
    } catch {}

    redrawAll();
  }


  if (dragState) {

    dragState =
      null;

    try {
      canvasElement.releasePointerCapture(
        event.pointerId
      );
    } catch {}

    redrawAll();
  }
}


function handlePointerCancel() {

  drawingStroke =
    null;

  dragState =
    null;

  redrawAll();
}


/* Main board */

board.addEventListener(
  "pointerdown",
  event =>
    handlePointerDown(
      event,
      mainState,
      board,
      boardWrap,
      false
    )
);

board.addEventListener(
  "pointermove",
  event =>
    handlePointerMove(
      event,
      board
    )
);

board.addEventListener(
  "pointerup",
  event =>
    handlePointerUp(
      event,
      board
    )
);

board.addEventListener(
  "pointercancel",
  handlePointerCancel
);


/* Existing-work split board */

splitBoard.addEventListener(
  "pointerdown",
  event =>
    handlePointerDown(
      event,
      mainState,
      splitBoard,
      splitBoardWrap,
      false
    )
);

splitBoard.addEventListener(
  "pointermove",
  event =>
    handlePointerMove(
      event,
      splitBoard
    )
);

splitBoard.addEventListener(
  "pointerup",
  event =>
    handlePointerUp(
      event,
      splitBoard
    )
);

splitBoard.addEventListener(
  "pointercancel",
  handlePointerCancel
);


/* Blank split board */

blankBoard.addEventListener(
  "pointerdown",
  event =>
    handlePointerDown(
      event,
      blankState,
      blankBoard,
      blankBoardWrap,
      true
    )
);

blankBoard.addEventListener(
  "pointermove",
  event =>
    handlePointerMove(
      event,
      blankBoard
    )
);

blankBoard.addEventListener(
  "pointerup",
  event =>
    handlePointerUp(
      event,
      blankBoard
    )
);

blankBoard.addEventListener(
  "pointercancel",
  handlePointerCancel
);


/* =========================================================
   UNDO / REDO
   ========================================================= */

document
  .getElementById(
    "undo"
  )
  .addEventListener(
    "click",
    () => {

      if (
        !mainState.history.length
      ) {
        return;
      }

      mainState.future.push(
        cloneObjects(
          mainState.objects
        )
      );

      const previous =
        mainState.history.pop();

      restoreObjects(
        mainState,
        previous
      );
    }
  );


document
  .getElementById(
    "redo"
  )
  .addEventListener(
    "click",
    () => {

      if (
        !mainState.future.length
      ) {
        return;
      }

      mainState.history.push(
        cloneObjects(
          mainState.objects
        )
      );

      const next =
        mainState.future.pop();

      restoreObjects(
        mainState,
        next
      );
    }
  );


/* =========================================================
   DELETE
   ========================================================= */

document
  .getElementById(
    "deleteSelected"
  )
  .addEventListener(
    "click",
    () => {

      if (
        !mainState.selectedId
      ) {
        return;
      }

      saveHistory(
        mainState
      );

      const selectedId =
        mainState.selectedId;

      mainState.objects =
        mainState.objects.filter(
          object => {

            if (
              object.id ===
              selectedId
            ) {
              return false;
            }

            if (
              object.type === "edge" ||
              object.type === "directed"
            ) {

              return (
                object.from !==
                  selectedId &&
                object.to !==
                  selectedId
              );
            }

            return true;
          }
        );

      mainState.selectedId =
        null;

      redrawAll();
    }
  );


/* =========================================================
   CLEAR HELPERS
   ========================================================= */

function clearMainBoard() {

  mainState.objects = [];

  mainState.selectedId =
    null;

  mainState.history = [];
  mainState.future = [];

  mainState.edgeStartNodeId =
    null;

  redrawAll();
}


function clearMainNotes() {

  notes.innerHTML = "";

  savedNotesRange =
    null;
}


function clearBlankBoard() {

  blankState.objects = [];

  blankState.selectedId =
    null;

  blankState.history = [];
  blankState.future = [];

  blankState.edgeStartNodeId =
    null;

  redrawAll();
}


function clearBlankNotes() {

  blankNotes.innerHTML = "";

  savedBlankNotesRange =
    null;
}


/* =========================================================
   INLINE CONFIRMATION
   ========================================================= */

let pendingConfirmation =
  null;


function showConfirmation(
  message,
  action
) {
  document
    .getElementById(
      "confirmMessage"
    )
    .textContent =
    message;

  pendingConfirmation =
    action;

  document
    .getElementById(
      "confirmEditor"
    )
    .hidden = false;
}


function hideConfirmation() {

  document
    .getElementById(
      "confirmEditor"
    )
    .hidden = true;

  pendingConfirmation =
    null;
}


document
  .getElementById(
    "confirmYes"
  )
  .addEventListener(
    "click",
    () => {

      const action =
        pendingConfirmation;

      hideConfirmation();

      if (action) {
        action();
      }
    }
  );


document
  .getElementById(
    "confirmNo"
  )
  .addEventListener(
    "click",
    hideConfirmation
  );


document
  .getElementById(
    "clearBoard"
  )
  .addEventListener(
    "click",
    () => {

      if (
        !mainState.objects.length
      ) {
        return;
      }

      showConfirmation(
        "Clear everything on the whiteboard?",
        clearMainBoard
      );
    }
  );


document
  .getElementById(
    "clearNotes"
  )
  .addEventListener(
    "click",
    () => {

      if (
        !notes.innerHTML.trim()
      ) {
        return;
      }

      showConfirmation(
        "Clear all scratch notes?",
        clearMainNotes
      );
    }
  );


document
  .getElementById(
    "clearAll"
  )
  .addEventListener(
    "click",
    () => {

      const hasMainBoard =
        mainState.objects.length > 0;

      const hasMainNotes =
        notes.innerHTML.trim()
          .length > 0;

      const hasBlankBoard =
        blankState.objects.length > 0;

      const hasBlankNotes =
        blankNotes.innerHTML.trim()
          .length > 0;

      if (
        !hasMainBoard &&
        !hasMainNotes &&
        !hasBlankBoard &&
        !hasBlankNotes
      ) {
        return;
      }

      showConfirmation(
        "Clear all whiteboards and notes?",
        () => {

          clearMainBoard();
          clearMainNotes();

          clearBlankBoard();
          clearBlankNotes();
        }
      );
    }
  );


/* =========================================================
   TABLE CREATION
   ========================================================= */

function createTable(
  rows,
  columns
) {
  const table =
    document.createElement(
      "table"
    );

  for (
    let r = 0;
    r < rows;
    r++
  ) {

    const row =
      document.createElement(
        "tr"
      );

    for (
      let c = 0;
      c < columns;
      c++
    ) {

      const cell =
        document.createElement(
          "td"
        );

      cell.contentEditable =
        "true";

      cell.innerHTML =
        "&nbsp;";

      row.appendChild(
        cell
      );
    }

    table.appendChild(
      row
    );
  }

  return table;
}


function insertTableAtSavedPosition(
  editor,
  savedRange,
  rows,
  columns,
  updateRange
) {
  editor.focus();

  let range = null;

  if (savedRange) {

    if (
      restoreSelection(
        savedRange
      )
    ) {
      range =
        savedRange.cloneRange();
    }
  }


  /*
    No remembered cursor:
    put the table at the end.
  */

  if (!range) {

    range =
      document.createRange();

    range.selectNodeContents(
      editor
    );

    range.collapse(false);
  }


  /*
    Prevent nested tables.
  */

  let container =
    range.startContainer;

  if (
    container.nodeType ===
    Node.TEXT_NODE
  ) {
    container =
      container.parentElement;
  }

  const containingTable =
    container?.closest?.(
      "table"
    );

  if (containingTable) {

    range.selectNode(
      containingTable
    );

    range.collapse(false);
  }


  /*
    Replace selected text, if any.
  */

  range.deleteContents();


  const table =
    createTable(
      rows,
      columns
    );


  range.insertNode(
    table
  );


  /*
    Blank paragraph after table.
  */

  const paragraph =
    document.createElement(
      "div"
    );

  paragraph.innerHTML =
    "<br>";

  table.parentNode.insertBefore(
    paragraph,
    table.nextSibling
  );


  /*
    Put cursor into first cell.
  */

  const firstCell =
    table.querySelector(
      "td"
    );

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

    updateRange(
      cellRange.cloneRange()
    );
  }
}


/* =========================================================
   MAIN TABLE
   ========================================================= */

const tableEditor =
  document.getElementById(
    "tableEditor"
  );


document
  .getElementById(
    "insertTable"
  )
  .addEventListener(
    "click",
    () => {

      /*
        Save cursor BEFORE button focus.
      */

      saveMainNotesSelection();

      tableEditor.hidden =
        false;

      const rows =
        document.getElementById(
          "tableRows"
        );

      rows.focus();
      rows.select();
    }
  );


document
  .getElementById(
    "tableCancel"
  )
  .addEventListener(
    "click",
    () => {

      tableEditor.hidden =
        true;

      notes.focus();

      restoreSelection(
        savedNotesRange
      );
    }
  );


document
  .getElementById(
    "tableInsert"
  )
  .addEventListener(
    "click",
    () => {

      const rows =
        Math.max(
          1,
          Math.min(
            30,
            Number(
              document
                .getElementById(
                  "tableRows"
                )
                .value
            ) || 1
          )
        );

      const columns =
        Math.max(
          1,
          Math.min(
            20,
            Number(
              document
                .getElementById(
                  "tableColumns"
                )
                .value
            ) || 1
          )
        );

      tableEditor.hidden =
        true;

      insertTableAtSavedPosition(
        notes,
        savedNotesRange,
        rows,
        columns,
        range => {
          savedNotesRange =
            range;
        }
      );
    }
  );


/* =========================================================
   BLANK TABLE
   ========================================================= */

const blankTableEditor =
  document.getElementById(
    "blankTableEditor"
  );


document
  .getElementById(
    "blankInsertTable"
  )
  .addEventListener(
    "click",
    () => {

      saveBlankNotesSelection();

      blankTableEditor.hidden =
        false;

      const rows =
        document.getElementById(
          "blankTableRows"
        );

      rows.focus();
      rows.select();
    }
  );


document
  .getElementById(
    "blankTableCancel"
  )
  .addEventListener(
    "click",
    () => {

      blankTableEditor.hidden =
        true;

      blankNotes.focus();

      restoreSelection(
        savedBlankNotesRange
      );
    }
  );


document
  .getElementById(
    "blankTableInsert"
  )
  .addEventListener(
    "click",
    () => {

      const rows =
        Math.max(
          1,
          Math.min(
            30,
            Number(
              document
                .getElementById(
                  "blankTableRows"
                )
                .value
            ) || 1
          )
        );

      const columns =
        Math.max(
          1,
          Math.min(
            20,
            Number(
              document
                .getElementById(
                  "blankTableColumns"
                )
                .value
            ) || 1
          )
        );

      blankTableEditor.hidden =
        true;

      insertTableAtSavedPosition(
        blankNotes,
        savedBlankNotesRange,
        rows,
        columns,
        range => {
          savedBlankNotesRange =
            range;
        }
      );
    }
  );


/* =========================================================
   TABLE TAB NAVIGATION
   ========================================================= */

function setupTableNavigation(
  editor,
  updateRange
) {
  editor.addEventListener(
    "keydown",
    event => {

      if (
        event.key !== "Tab"
      ) {
        return;
      }

      const target =
        event.target;

      if (
        !target ||
        target.tagName !== "TD"
      ) {
        return;
      }

      event.preventDefault();

      const cell =
        target;

      const row =
        cell.parentElement;

      const table =
        row.parentElement;

      const cells =
        Array.from(
          table.querySelectorAll(
            "td"
          )
        );

      const index =
        cells.indexOf(
          cell
        );

      if (
        index === -1
      ) {
        return;
      }


      if (
        index <
        cells.length - 1
      ) {

        cells[index + 1].focus();

        return;
      }


      /*
        Tab out of the final cell:
        automatically create another row.
      */

      const columnCount =
        row.children.length;

      const newRow =
        document.createElement(
          "tr"
        );

      for (
        let i = 0;
        i < columnCount;
        i++
      ) {

        const newCell =
          document.createElement(
            "td"
          );

        newCell.contentEditable =
          "true";

        newCell.innerHTML =
          "&nbsp;";

        newRow.appendChild(
          newCell
        );
      }

      table.appendChild(
        newRow
      );


      const firstNewCell =
        newRow.querySelector(
          "td"
        );

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

        selection.addRange(
          range
        );

        updateRange(
          range.cloneRange()
        );
      }
    }
  );
}


setupTableNavigation(
  notes,
  range => {
    savedNotesRange =
      range;
  }
);


setupTableNavigation(
  blankNotes,
  range => {
    savedBlankNotesRange =
      range;
  }
);


/* =========================================================
   SPLIT VIEW RESIZER
   ========================================================= */

document
  .querySelectorAll(
    ".split-workspace"
  )
  .forEach(workspace => {

    const divider =
      workspace.querySelector(
        ".split-divider"
      );

    const halves =
      workspace.querySelectorAll(
        ".split-half"
      );

    if (
      !divider ||
      halves.length !== 2
    ) {
      return;
    }

    let dragging = false;


    function updateSplit(
      event
    ) {
      const rect =
        workspace.getBoundingClientRect();

      const mobile =
        window.innerWidth <= 800;

      let ratio;

      if (mobile) {

        ratio =
          (
            event.clientY -
            rect.top
          ) /
          rect.height;

      } else {

        ratio =
          (
            event.clientX -
            rect.left
          ) /
          rect.width;
      }

      ratio =
        Math.max(
          0.2,
          Math.min(
            0.8,
            ratio
          )
        );


      if (mobile) {

        halves[0].style.flex =
          `0 0 ${ratio * 100}%`;

        halves[1].style.flex =
          `1 1 0`;

      } else {

        halves[0].style.flex =
          `0 0 ${ratio * 100}%`;

        halves[1].style.flex =
          `1 1 0`;
      }

      resizeAllCanvases();
    }


    divider.addEventListener(
      "pointerdown",
      event => {

        event.preventDefault();

        dragging = true;

        divider.setPointerCapture(
          event.pointerId
        );
      }
    );


    divider.addEventListener(
      "pointermove",
      event => {

        if (!dragging) {
          return;
        }

        updateSplit(event);
      }
    );


    divider.addEventListener(
      "pointerup",
      event => {

        dragging = false;

        try {
          divider.releasePointerCapture(
            event.pointerId
          );
        } catch {}
      }
    );


    divider.addEventListener(
      "pointercancel",
      () => {
        dragging = false;
      }
    );


    divider.addEventListener(
      "keydown",
      event => {

        if (
          event.key !==
          "ArrowLeft" &&
          event.key !==
          "ArrowRight" &&
          event.key !==
          "ArrowUp" &&
          event.key !==
          "ArrowDown"
        ) {
          return;
        }

        event.preventDefault();

        const first =
          halves[0];

        const current =
          parseFloat(
            first.style.flexBasis
          );

        let percentage =
          Number.isFinite(
            current
          )
            ? current
            : 50;

        const mobile =
          window.innerWidth <= 800;

        if (
          (!mobile &&
            event.key ===
              "ArrowLeft") ||
          (mobile &&
            event.key ===
              "ArrowUp")
        ) {
          percentage -= 5;
        }

        if (
          (!mobile &&
            event.key ===
              "ArrowRight") ||
          (mobile &&
            event.key ===
              "ArrowDown")
        ) {
          percentage += 5;
        }

        percentage =
          Math.max(
            20,
            Math.min(
              80,
              percentage
            )
          );

        first.style.flex =
          `0 0 ${percentage}%`;

        halves[1].style.flex =
          "1 1 0";

        resizeAllCanvases();
      }
    );
  });


/* =========================================================
   TABS
   ========================================================= */

document
  .querySelectorAll(
    ".tab"
  )
  .forEach(tab => {

    tab.addEventListener(
      "click",
      () => {

        const target =
          tab.dataset.tab;

        document
          .querySelectorAll(
            ".tab"
          )
          .forEach(button => {

            button.classList.toggle(
              "active",
              button === tab
            );
          });


        document
          .querySelectorAll(
            ".panel"
          )
          .forEach(panel => {

            panel.classList.remove(
              "active-panel"
            );
          });


        const panel =
          document.getElementById(
            target
          );

        panel.classList.add(
          "active-panel"
        );


        /*
          The important distinction:

          Split View uses mainState.
          Blank Split View uses blankState.

          Therefore Split View is literally another
          window into the student's existing work.
        */

        requestAnimationFrame(
          () => {
            resizeAllCanvases();
          }
        );
      }
    );
  });


/* =========================================================
   DOWNLOAD
   ========================================================= */

document
  .getElementById(
    "downloadAll"
  )
  .addEventListener(
    "click",
    () => {

      /*
        Download the student's primary work,
        not the blank scratch workspace.
      */

      const link =
        document.createElement(
          "a"
        );

      link.download =
        "whiteboard.png";

      link.href =
        board.toDataURL(
          "image/png"
        );

      link.click();


      const html = `
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
          [html],
          {
            type: "text/html"
          }
        );


      const url =
        URL.createObjectURL(
          blob
        );


      const notesLink =
        document.createElement(
          "a"
        );

      notesLink.href =
        url;

      notesLink.download =
        "scratch-notes.html";

      notesLink.click();


      setTimeout(
        () => {

          URL.revokeObjectURL(
            url
          );

        },
        1000
      );
    }
  );


/* =========================================================
   ESCAPE
   ========================================================= */

document.addEventListener(
  "keydown",
  event => {

    if (
      event.key !== "Escape"
    ) {
      return;
    }

    hideMainEditors();
    hideBlankEditors();

    document
      .getElementById(
        "tableEditor"
      )
      .hidden = true;

    document
      .getElementById(
        "blankTableEditor"
      )
      .hidden = true;

    hideConfirmation();

    mainState.edgeStartNodeId =
      null;

    blankState.edgeStartNodeId =
      null;

    redrawAll();
  }
);


/* =========================================================
   INITIALIZATION
   ========================================================= */

window.addEventListener(
  "resize",
  () => {
    resizeAllCanvases();
  }
);


requestAnimationFrame(
  () => {
    resizeAllCanvases();
  }
);
