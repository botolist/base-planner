const board = document.querySelector("#board");
const boardViewport = document.querySelector("#boardViewport");
const boardScaler = document.querySelector("#boardScaler");
const layer = document.querySelector("#baseLayer");
const nameList = document.querySelector("#nameList");
const nameForm = document.querySelector("#nameForm");
const nameInput = document.querySelector("#nameInput");
const spreadsheetInput = document.querySelector("#spreadsheetInput");
const importStatus = document.querySelector("#importStatus");
const saveConfig = document.querySelector("#saveConfig");
const loadConfig = document.querySelector("#loadConfig");

const tile = 18;
const boardCols = 999;
const boardRows = 999;
const baseSize = tile * 3;
const blockedCore = {
  x: (490 - 1) * tile,
  y: (boardRows - (490 + 21 - 1)) * tile,
  size: 21 * tile,
};

const defaultBaseColor = "#8fc8ee";

let roster = [];
let bases = [];
let selectedId = null;
let zoom = 1;

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

function overlapsRect(x, y, rect) {
  const separate =
    x + baseSize <= rect.x ||
    x >= rect.x + rect.size ||
    y + baseSize <= rect.y ||
    y >= rect.y + rect.size;
  return !separate;
}

function isValidBasePosition(base, x, y) {
  return !overlapsAny(base, x, y) && !overlapsRect(x, y, blockedCore);
}

function isInsideMapViewport(x, y) {
  const rect = boardViewport.getBoundingClientRect();
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
  fitBaseName(node);
}

function updateAllCoordinates() {
  document.querySelectorAll(".base").forEach((node) => {
    const base = bases.find((item) => item.id === node.dataset.id);
    if (base) updateBaseNode(node, base);
  });
}

function fitBaseName(node) {
  const name = node.querySelector(".label strong");
  if (!name) return;

  name.style.fontSize = "6px";
  let size = 6;
  while (name.scrollWidth > name.clientWidth && size > 3) {
    size -= 0.5;
    name.style.fontSize = `${size}px`;
  }
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
    fitBaseName(node);
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

  function move(moveEvent) {
    const next = getPointerPosition(moveEvent);
    moveGhost(ghost, next.x, next.y);
  }

  function stop(upEvent) {
    const next = getPointerPosition(upEvent);
    ghost.remove();
    window.removeEventListener("pointermove", move);
    window.removeEventListener("pointerup", stop);
    window.removeEventListener("pointercancel", stop);

    if (!isInsideMapViewport(next.x, next.y)) return;

    const position = boardPositionFromPointer(next.x, next.y);
    const base = {
      id: crypto.randomUUID(),
      rosterId: person.id,
      name: person.name,
      color: person.color,
      x: position.x,
      y: position.y,
    };

    if (!isValidBasePosition(base, base.x, base.y)) return;

    bases.push(base);
    selectedId = base.id;
    render();
  }

  window.addEventListener("pointermove", move);
  window.addEventListener("pointerup", stop);
  window.addEventListener("pointercancel", stop);
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

    if (isValidBasePosition(base, position.x, position.y)) {
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
    color: defaultBaseColor,
  });
  renderRoster();
}

function saveState() {
  return {
    version: 1,
    savedAt: new Date().toISOString(),
    map: { cols: boardCols, rows: boardRows },
    roster,
    bases: bases.map((base) => ({
      id: base.id,
      rosterId: base.rosterId,
      name: base.name,
      color: base.color,
      x: base.x,
      y: base.y,
      coordinate: coordinateFor(base),
    })),
  };
}

function downloadJson(data) {
  const blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json" });
  const link = document.createElement("a");
  const date = new Date().toISOString().slice(0, 10);
  link.href = URL.createObjectURL(blob);
  link.download = `base-planner-${date}.json`;
  link.click();
  URL.revokeObjectURL(link.href);
}

function normalizeLoadedState(data) {
  const loadedRoster = Array.isArray(data?.roster) ? data.roster : [];
  const loadedBases = Array.isArray(data?.bases) ? data.bases : [];
  const rosterIds = new Set();

  roster = loadedRoster
    .filter((person) => person && person.name)
    .map((person) => {
      const id = String(person.id || crypto.randomUUID());
      rosterIds.add(id);
      return {
        id,
        name: String(person.name),
        color: String(person.color || defaultBaseColor),
      };
    });

  bases = loadedBases
    .filter((base) => base && base.name && Number.isFinite(Number(base.x)) && Number.isFinite(Number(base.y)))
    .map((base) => {
      const rosterId = String(base.rosterId || base.id || crypto.randomUUID());
      if (!rosterIds.has(rosterId)) {
        rosterIds.add(rosterId);
        roster.push({
          id: rosterId,
          name: String(base.name),
          color: String(base.color || defaultBaseColor),
        });
      }

      return {
        id: String(base.id || crypto.randomUUID()),
        rosterId,
        name: String(base.name),
        color: String(base.color || defaultBaseColor),
        x: clamp(snapToTile(Number(base.x)), 0, boardCols * tile - baseSize),
        y: clamp(snapToTile(Number(base.y)), 0, boardRows * tile - baseSize),
      };
    })
    .filter((base, index, list) => {
      const duplicate = list.some((other, otherIndex) => otherIndex < index && !(
        base.x + baseSize <= other.x ||
        base.x >= other.x + baseSize ||
        base.y + baseSize <= other.y ||
        base.y >= other.y + baseSize
      ));
      return !duplicate && !overlapsRect(base.x, base.y, blockedCore);
    });

  selectedId = null;
  render();
}

function xmlDoc(text) {
  return new DOMParser().parseFromString(text, "application/xml");
}

function cellColumn(ref) {
  return ref.replace(/\d+/g, "");
}

function cellRow(ref) {
  return Number(ref.replace(/\D+/g, ""));
}

async function readZipText(zip, path) {
  const file = zip.file(path);
  return file ? file.async("text") : "";
}

async function importSpreadsheet(file) {
  if (!window.JSZip) throw new Error("Excel reader is not loaded.");

  const zip = await JSZip.loadAsync(await file.arrayBuffer());
  const sharedXml = await readZipText(zip, "xl/sharedStrings.xml");
  const sharedStrings = sharedXml
    ? [...xmlDoc(sharedXml).querySelectorAll("si")].map((item) => [...item.querySelectorAll("t")].map((node) => node.textContent || "").join(""))
    : [];

  const workbookXml = await readZipText(zip, "xl/workbook.xml");
  const relsXml = await readZipText(zip, "xl/_rels/workbook.xml.rels");
  const workbook = xmlDoc(workbookXml);
  const rels = xmlDoc(relsXml);
  const firstSheet = workbook.querySelector("sheet");
  const relId = firstSheet?.getAttribute("r:id");
  const relationship = relId ? [...rels.querySelectorAll("Relationship")].find((item) => item.getAttribute("Id") === relId) : null;
  const target = relationship?.getAttribute("Target") || "worksheets/sheet1.xml";
  const sheetPath = `xl/${target.replace(/^\/?xl\//, "")}`;
  const sheetXml = await readZipText(zip, sheetPath);
  const sheet = xmlDoc(sheetXml);
  const rows = new Map();

  sheet.querySelectorAll("c").forEach((cell) => {
    const ref = cell.getAttribute("r") || "";
    const row = cellRow(ref);
    const col = cellColumn(ref);
    const type = cell.getAttribute("t");
    const valueNode = cell.querySelector("v");
    let value = "";

    if (type === "inlineStr") {
      value = [...cell.querySelectorAll("t")].map((node) => node.textContent || "").join("");
    } else if (valueNode) {
      value = type === "s" ? sharedStrings[Number(valueNode.textContent)] || "" : valueNode.textContent || "";
    }

    if (!rows.has(row)) rows.set(row, {});
    rows.get(row)[col] = value.trim();
  });

  return [...rows.values()]
    .map((row) => row.B || Object.values(row).find((value) => value && !/^\d+$/.test(value)) || "")
    .filter(Boolean);
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

spreadsheetInput.addEventListener("change", async () => {
  const file = spreadsheetInput.files?.[0];
  if (!file) return;

  importStatus.textContent = "Importing...";
  try {
    const names = await importSpreadsheet(file);
    const existing = new Set(roster.map((person) => person.name));
    let added = 0;
    names.forEach((name) => {
      if (existing.has(name)) return;
      addName(name);
      existing.add(name);
      added += 1;
    });
    importStatus.textContent = added ? `Imported ${added} names.` : "No new names found.";
  } catch {
    importStatus.textContent = "Could not read this Excel file.";
  } finally {
    spreadsheetInput.value = "";
  }
});

saveConfig.addEventListener("click", () => {
  downloadJson(saveState());
});

loadConfig.addEventListener("change", async () => {
  const file = loadConfig.files?.[0];
  if (!file) return;

  try {
    normalizeLoadedState(JSON.parse(await file.text()));
    importStatus.textContent = `Loaded ${roster.length} names and ${bases.length} bases.`;
  } catch {
    importStatus.textContent = "Could not load this JSON file.";
  } finally {
    loadConfig.value = "";
  }
});

renderAxes();
setZoom(0.08, boardViewport.getBoundingClientRect().left, boardViewport.getBoundingClientRect().top);
render();
scrollToCoordinate(500, 500);
