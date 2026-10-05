const board = document.querySelector("#board");
const boardViewport = document.querySelector("#boardViewport");
const boardScaler = document.querySelector("#boardScaler");
const layer = document.querySelector("#baseLayer");
const nameList = document.querySelector("#nameList");
const nameForm = document.querySelector("#nameForm");
const nameInput = document.querySelector("#nameInput");

const tile = 18;
const boardCols = 999;
const boardRows = 999;
const baseSize = tile * 3;

const baseColors = ["#8fc8ee", "#eebc5b", "#80bd83", "#d98277", "#a98ad7", "#60b6a7", "#d48bb0"];

let roster = [];
let bases = [];
let selectedId = null;
let zoom = 1;
let nextColorIndex = 0;

function coordinateFor(base) {
  const centerCol = Math.round((base.x + tile) / tile);
  const centerRowFromBottom = Math.round((boardRows * tile - (base.y + tile * 2)) / tile);
  return {
    x: centerCol + 1,
    y: centerRowFromBottom + 1,
  };
}

function clamp(value, min, max) {
  return Math.max(min, Math.min(value, max));
}

function snapToTile(value) {
  return Math.round(value / tile) * tile;
}

function getPointerPosition(event) {
  const point = event.touches?.[0] || event;
  return { x: point.clientX, y: point.clientY };
}

function overlapsAny(base, x, y) {
  return bases.some((other) => {
    if (other.id === base.id) return false;
    const separate =
      x + baseSize <= other.x ||
      x >= other.x + baseSize ||
      y + baseSize <= other.y ||
      y >= other.y + baseSize;
    return !separate;
  });
}

function isInsideBoard(x, y) {
  const rect = board.getBoundingClientRect();
  return x >= rect.left && x <= rect.right && y >= rect.top && y <= rect.bottom;
}

function boardPositionFromPointer(x, y, offsetX = baseSize / 2, offsetY = baseSize / 2) {
  const rect = board.getBoundingClientRect();
  return {
    x: clamp(snapToTile((x - rect.left) / zoom - offsetX), 0, boardCols * tile - baseSize),
    y: clamp(snapToTile((y - rect.top) / zoom - offsetY), 0, boardRows * tile - baseSize),
  };
}

function updateBaseNode(node, base) {
  const coord = coordinateFor(base);
  node.style.left = `${base.x}px`;
  node.style.top = `${base.y}px`;
  node.querySelector("small").textContent = `X${coord.x}:Y${coord.y}`;
}

function updateAllCoordinates() {
  document.querySelectorAll(".base").forEach((node) => {
    const base = bases.find((item) => item.id === node.dataset.id);
    if (base) updateBaseNode(node, base);
  });
}

function renderAxes() {
  const xAxis = document.querySelector(".xAxis");
  const yAxis = document.querySelector(".yAxis");

  for (let col = 0; col < boardCols; col += 25) {
    const tick = document.createElement("span");
    tick.className = "tick";
    tick.style.left = `${col * tile}px`;
    tick.style.bottom = "0";
    tick.textContent = col + 1;
    xAxis.append(tick);
  }

  for (let row = 0; row < boardRows; row += 25) {
    const tick = document.createElement("span");
    tick.className = "tick";
    tick.style.left = "0";
    tick.style.top = `${row * tile}px`;
    tick.textContent = boardRows - row;
    yAxis.append(tick);
  }
}

function placedRosterIds() {
  return new Set(bases.map((base) => base.rosterId));
}

function renderRoster() {
  const placed = placedRosterIds();
  nameList.innerHTML = "";
  if (!roster.length) {
    const empty = document.createElement("div");
    empty.className = "emptyNames";
    empty.textContent = "Add a name to start.";
    nameList.append(empty);
    return;
  }

  roster.forEach((person) => {
    const item = document.createElement("button");
    item.type = "button";
    item.className = `nameItem${placed.has(person.id) ? " used" : ""}`;
    item.style.setProperty("--color", person.color);
    item.innerHTML = `<span></span><strong>${person.name}</strong>`;
    item.disabled = placed.has(person.id);
    if (!item.disabled) {
      item.addEventListener("pointerdown", (event) => startRosterDrag(event, person, item));
    }
    nameList.append(item);
  });
}

function renderBases() {
  layer.innerHTML = "";
  bases.forEach((base) => {
    const coord = coordinateFor(base);
    const node = document.createElement("div");
    node.className = `base${base.id === selectedId ? " selected" : ""}`;
    node.dataset.id = base.id;
    node.style.left = `${base.x}px`;
    node.style.top = `${base.y}px`;
    node.style.setProperty("--color", base.color);
    node.innerHTML = `<button class="baseDelete" type="button" aria-label="Delete ${base.name}">X</button><div class="label"><strong>${base.name}</strong><small>X${coord.x}:Y${coord.y}</small></div>`;
    const deleteButton = node.querySelector(".baseDelete");
    deleteButton.addEventListener("pointerdown", (event) => {
      event.stopPropagation();
    });
    deleteButton.addEventListener("click", (event) => {
      event.stopPropagation();
      deleteBase(base.id);
    });
    node.addEventListener("pointerdown", (event) => startBaseDrag(event, base, node));
    layer.append(node);
  });
}

function render() {
  renderRoster();
  renderBases();
}

function selectBase(base, node) {
  selectedId = base.id;
  document.querySelectorAll(".base").forEach((item) => item.classList.toggle("selected", item === node));
}

function makeGhost(person, x, y) {
  const ghost = document.createElement("div");
  ghost.className = "dragGhost";
  ghost.style.setProperty("--color", person.color);
  ghost.innerHTML = `<strong>${person.name}</strong>`;
  document.body.append(ghost);
  moveGhost(ghost, x, y);
  return ghost;
}

function moveGhost(ghost, x, y) {
  ghost.style.left = `${x - 72}px`;
  ghost.style.top = `${y - 26}px`;
}

function startRosterDrag(event, person, item) {
  event.preventDefault();
  const pointer = getPointerPosition(event);
  const ghost = makeGhost(person, pointer.x, pointer.y);
  item.setPointerCapture(event.pointerId);

  function move(moveEvent) {
    const next = getPointerPosition(moveEvent);
    moveGhost(ghost, next.x, next.y);
  }

  function stop(upEvent) {
    const next = getPointerPosition(upEvent);
    ghost.remove();
    item.releasePointerCapture(event.pointerId);
    item.removeEventListener("pointermove", move);
    item.removeEventListener("pointerup", stop);
    item.removeEventListener("pointercancel", stop);

    if (!isInsideBoard(next.x, next.y)) return;

    const position = boardPositionFromPointer(next.x, next.y);
    const base = {
      id: crypto.randomUUID(),
      rosterId: person.id,
      name: person.name,
      color: person.color,
      x: position.x,
      y: position.y,
    };

    if (overlapsAny(base, base.x, base.y)) return;

    bases.push(base);
    selectedId = base.id;
    render();
  }

  item.addEventListener("pointermove", move);
  item.addEventListener("pointerup", stop);
  item.addEventListener("pointercancel", stop);
}

function startBaseDrag(event, base, node) {
  event.preventDefault();
  selectBase(base, node);

  const pointer = getPointerPosition(event);
  const nodeRect = node.getBoundingClientRect();
  const pointerOffsetX = (pointer.x - nodeRect.left) / zoom;
  const pointerOffsetY = (pointer.y - nodeRect.top) / zoom;
  const lastValid = { x: base.x, y: base.y };

  node.setPointerCapture(event.pointerId);

  function move(moveEvent) {
    const next = getPointerPosition(moveEvent);
    const position = boardPositionFromPointer(next.x, next.y, pointerOffsetX, pointerOffsetY);

    if (!overlapsAny(base, position.x, position.y)) {
      lastValid.x = position.x;
      lastValid.y = position.y;
    }

    base.x = lastValid.x;
    base.y = lastValid.y;
    updateBaseNode(node, base);
  }

  function stop() {
    node.releasePointerCapture(event.pointerId);
    node.removeEventListener("pointermove", move);
    node.removeEventListener("pointerup", stop);
    node.removeEventListener("pointercancel", stop);
  }

  node.addEventListener("pointermove", move);
  node.addEventListener("pointerup", stop);
  node.addEventListener("pointercancel", stop);
}

function deleteBase(id) {
  bases = bases.filter((base) => base.id !== id);
  if (selectedId === id) selectedId = null;
  render();
}

function addName(name) {
  roster.push({
    id: crypto.randomUUID(),
    name,
    color: baseColors[nextColorIndex % baseColors.length],
  });
  nextColorIndex += 1;
  renderRoster();
}

function setZoom(nextZoom, anchorX, anchorY) {
  const viewportRect = boardViewport.getBoundingClientRect();
  const anchorInViewportX = anchorX - viewportRect.left;
  const anchorInViewportY = anchorY - viewportRect.top;
  const mapX = (boardViewport.scrollLeft + anchorInViewportX) / zoom;
  const mapY = (boardViewport.scrollTop + anchorInViewportY) / zoom;

  zoom = clamp(nextZoom, 0.04, 2.6);
  board.style.setProperty("--zoom", zoom);
  boardScaler.style.width = `${boardCols * tile * zoom}px`;
  boardScaler.style.height = `${boardRows * tile * zoom}px`;

  boardViewport.scrollLeft = mapX * zoom - anchorInViewportX;
  boardViewport.scrollTop = mapY * zoom - anchorInViewportY;
}

function scrollToCoordinate(x, y) {
  boardViewport.scrollLeft = (x - 1) * tile * zoom - boardViewport.clientWidth / 2;
  boardViewport.scrollTop = (boardRows - y) * tile * zoom - boardViewport.clientHeight / 2;
}

function startPan(event) {
  if (event.target.closest(".base")) return;

  event.preventDefault();
  const startX = event.clientX;
  const startY = event.clientY;
  const startScrollLeft = boardViewport.scrollLeft;
  const startScrollTop = boardViewport.scrollTop;

  boardViewport.classList.add("panning");
  boardViewport.setPointerCapture(event.pointerId);

  function move(moveEvent) {
    boardViewport.scrollLeft = startScrollLeft - (moveEvent.clientX - startX);
    boardViewport.scrollTop = startScrollTop - (moveEvent.clientY - startY);
  }

  function stop() {
    boardViewport.classList.remove("panning");
    boardViewport.releasePointerCapture(event.pointerId);
    boardViewport.removeEventListener("pointermove", move);
    boardViewport.removeEventListener("pointerup", stop);
    boardViewport.removeEventListener("pointercancel", stop);
  }

  boardViewport.addEventListener("pointermove", move);
  boardViewport.addEventListener("pointerup", stop);
  boardViewport.addEventListener("pointercancel", stop);
}

boardViewport.addEventListener("wheel", (event) => {
  if (!event.ctrlKey && !event.metaKey) return;

  event.preventDefault();
  const intensity = Math.min(Math.abs(event.deltaY), 80);
  const factor = Math.exp((event.deltaY < 0 ? 1 : -1) * intensity * 0.0025);
  setZoom(zoom * factor, event.clientX, event.clientY);
}, { passive: false });

boardViewport.addEventListener("pointerdown", startPan);

nameForm.addEventListener("submit", (event) => {
  event.preventDefault();
  const name = nameInput.value.trim();
  if (!name) return;
  addName(name);
  nameInput.value = "";
  nameInput.focus();
});

renderAxes();
setZoom(0.08, boardViewport.getBoundingClientRect().left, boardViewport.getBoundingClientRect().top);
render();
scrollToCoordinate(500, 500);
