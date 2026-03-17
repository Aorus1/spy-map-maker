// --- Constants ---
const GRID_SIZE = 100;
const TILE_COLORS = {
    n: '#b0b0b0',
    m: '#8B6914',
    w: '#4a90d9',
    s: '#4CAF50',
    p: '#FF9800',
    t: '#f44336',
};
const TILE_LABELS = { p: 'P', t: 'T', s: 'S' };

// --- Checkerboard shade helper ---
function shadeColor(hex, amt) {
    let r = parseInt(hex.slice(1, 3), 16) + amt;
    let g = parseInt(hex.slice(3, 5), 16) + amt;
    let b = parseInt(hex.slice(5, 7), 16) + amt;
    r = Math.max(0, Math.min(255, r));
    g = Math.max(0, Math.min(255, g));
    b = Math.max(0, Math.min(255, b));
    return '#' + [r, g, b].map(v => v.toString(16).padStart(2, '0')).join('');
}

// --- State ---
let grid = [];
let currentTool = 'pencil';
let currentTile = 'm';
let zoom = 1;
let panX = 0, panY = 0;
let isPanning = false;
let panStartX, panStartY, panStartPanX, panStartPanY;
let isDrawing = false;
let lastDrawPos = null;
let lineStart = null;
let rectStart = null;
let previewCells = [];

// --- Init grid ---
function initGrid() {
    grid = [];
    for (let r = 0; r < GRID_SIZE; r++) {
        grid[r] = [];
        for (let c = 0; c < GRID_SIZE; c++) {
            grid[r][c] = 'n';
        }
    }
}
initGrid();

// --- Canvas setup ---
const canvas = document.getElementById('grid-canvas');
const ctx = canvas.getContext('2d');
const container = document.getElementById('canvas-container');

function cellSize() {
    return Math.max(1, Math.floor(6 * zoom));
}

function resizeCanvas() {
    const cs = cellSize();
    canvas.width = GRID_SIZE * cs;
    canvas.height = GRID_SIZE * cs;
    fitView();
    render();
}

function fitView() {
    const cs = cellSize();
    const totalW = GRID_SIZE * cs;
    const totalH = GRID_SIZE * cs;
    const cw = container.clientWidth;
    const ch = container.clientHeight;
    panX = Math.max(0, (cw - totalW) / 2);
    panY = Math.max(0, (ch - totalH) / 2);
    applyTransform();
}

function applyTransform() {
    canvas.style.left = panX + 'px';
    canvas.style.top = panY + 'px';
}

// --- Rendering ---
function render() {
    const cs = cellSize();
    ctx.clearRect(0, 0, canvas.width, canvas.height);

    for (let r = 0; r < GRID_SIZE; r++) {
        for (let c = 0; c < GRID_SIZE; c++) {
            const tile = grid[r][c];
            const base = TILE_COLORS[tile] || '#b0b0b0';
            // Checkerboard: darken alternate cells slightly
            const darken = (r + c) % 2 === 0;
            ctx.fillStyle = darken ? shadeColor(base, -12) : shadeColor(base, 12);
            ctx.fillRect(c * cs, r * cs, cs, cs);
        }
    }

    // Preview overlay
    if (previewCells.length > 0) {
        ctx.fillStyle = TILE_COLORS[currentTile] || '#b0b0b0';
        ctx.globalAlpha = 0.5;
        for (const [r, c] of previewCells) {
            ctx.fillRect(c * cs, r * cs, cs, cs);
        }
        ctx.globalAlpha = 1.0;
    }

    // Grid lines when zoomed in enough
    if (cs >= 8) {
        ctx.strokeStyle = 'rgba(255,255,255,0.08)';
        ctx.lineWidth = 0.5;
        for (let i = 0; i <= GRID_SIZE; i++) {
            ctx.beginPath();
            ctx.moveTo(i * cs, 0);
            ctx.lineTo(i * cs, GRID_SIZE * cs);
            ctx.stroke();
            ctx.beginPath();
            ctx.moveTo(0, i * cs);
            ctx.lineTo(GRID_SIZE * cs, i * cs);
            ctx.stroke();
        }
    }

    // Labels for special tiles when zoomed in
    if (cs >= 12) {
        ctx.font = `bold ${Math.floor(cs * 0.6)}px sans-serif`;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillStyle = '#fff';
        for (let r = 0; r < GRID_SIZE; r++) {
            for (let c = 0; c < GRID_SIZE; c++) {
                const label = TILE_LABELS[grid[r][c]];
                if (label) {
                    ctx.fillText(label, c * cs + cs / 2, r * cs + cs / 2);
                }
            }
        }
    }

    updateInfo();
}

// --- Coordinate helpers ---
function canvasToGrid(clientX, clientY) {
    const rect = canvas.getBoundingClientRect();
    const cs = cellSize();
    const x = clientX - rect.left;
    const y = clientY - rect.top;
    const col = Math.floor(x / cs);
    const row = Math.floor(y / cs);
    if (row >= 0 && row < GRID_SIZE && col >= 0 && col < GRID_SIZE) {
        return [row, col];
    }
    return null;
}

// --- Drawing helpers ---
function setTile(r, c, tile) {
    if (r < 0 || r >= GRID_SIZE || c < 0 || c >= GRID_SIZE) return;
    if (tile === 'p') {
        // Remove old package
        for (let rr = 0; rr < GRID_SIZE; rr++)
            for (let cc = 0; cc < GRID_SIZE; cc++)
                if (grid[rr][cc] === 'p') grid[rr][cc] = 'n';
    }
    if (tile === 't') {
        // Remove old target
        for (let rr = 0; rr < GRID_SIZE; rr++)
            for (let cc = 0; cc < GRID_SIZE; cc++)
                if (grid[rr][cc] === 't') grid[rr][cc] = 'n';
    }
    grid[r][c] = tile;
}

function getLineCells(r0, c0, r1, c1) {
    const cells = [];
    const dr = Math.abs(r1 - r0);
    const dc = Math.abs(c1 - c0);
    const sr = r0 < r1 ? 1 : -1;
    const sc = c0 < c1 ? 1 : -1;
    let err = dr - dc;
    let r = r0, c = c0;
    while (true) {
        cells.push([r, c]);
        if (r === r1 && c === c1) break;
        const e2 = 2 * err;
        if (e2 > -dc) { err -= dc; r += sr; }
        if (e2 < dr) { err += dr; c += sc; }
    }
    return cells;
}

function getRectOutlineCells(r0, c0, r1, c1) {
    const cells = [];
    const minR = Math.min(r0, r1), maxR = Math.max(r0, r1);
    const minC = Math.min(c0, c1), maxC = Math.max(c0, c1);
    for (let c = minC; c <= maxC; c++) {
        cells.push([minR, c]);
        cells.push([maxR, c]);
    }
    for (let r = minR + 1; r < maxR; r++) {
        cells.push([r, minC]);
        cells.push([r, maxC]);
    }
    return cells;
}

function getRectFilledCells(r0, c0, r1, c1) {
    const cells = [];
    const minR = Math.min(r0, r1), maxR = Math.max(r0, r1);
    const minC = Math.min(c0, c1), maxC = Math.max(c0, c1);
    for (let r = minR; r <= maxR; r++)
        for (let c = minC; c <= maxC; c++)
            cells.push([r, c]);
    return cells;
}

function floodFill(startR, startC, newTile) {
    const oldTile = grid[startR][startC];
    if (oldTile === newTile) return;
    const stack = [[startR, startC]];
    const visited = new Set();
    while (stack.length > 0) {
        const [r, c] = stack.pop();
        const key = r * GRID_SIZE + c;
        if (visited.has(key)) continue;
        if (r < 0 || r >= GRID_SIZE || c < 0 || c >= GRID_SIZE) continue;
        if (grid[r][c] !== oldTile) continue;
        visited.add(key);
        setTile(r, c, newTile);
        stack.push([r - 1, c], [r + 1, c], [r, c - 1], [r, c + 1]);
    }
}

// --- Undo support ---
let undoStack = [];
let redoStack = [];
const MAX_UNDO = 50;

function saveUndo() {
    undoStack.push(grid.map(row => row.slice()));
    if (undoStack.length > MAX_UNDO) undoStack.shift();
    redoStack = [];
}

function undo() {
    if (undoStack.length === 0) return;
    redoStack.push(grid.map(row => row.slice()));
    grid = undoStack.pop();
    render();
}

function redo() {
    if (redoStack.length === 0) return;
    undoStack.push(grid.map(row => row.slice()));
    grid = redoStack.pop();
    render();
}

// --- Tool handling ---
function activeTile() {
    return currentTool === 'eraser' ? 'n' : currentTile;
}

canvas.addEventListener('mousedown', (e) => {
    if (e.button === 1 || (e.button === 0 && e.shiftKey) || (e.button === 0 && currentTool === 'grab')) {
        isPanning = true;
        panStartX = e.clientX;
        panStartY = e.clientY;
        panStartPanX = panX;
        panStartPanY = panY;
        container.style.cursor = 'grabbing';
        e.preventDefault();
        return;
    }

    if (e.button !== 0) return;
    const pos = canvasToGrid(e.clientX, e.clientY);
    if (!pos) return;

    const [r, c] = pos;
    const tile = activeTile();

    if (currentTool === 'pencil' || currentTool === 'eraser') {
        saveUndo();
        setTile(r, c, tile);
        render();
    } else if (currentTool === 'freedraw') {
        saveUndo();
        isDrawing = true;
        lastDrawPos = [r, c];
        setTile(r, c, tile);
        render();
    } else if (currentTool === 'line') {
        if (!lineStart) {
            lineStart = [r, c];
        } else {
            saveUndo();
            const cells = getLineCells(lineStart[0], lineStart[1], r, c);
            for (const [cr, cc] of cells) setTile(cr, cc, tile);
            lineStart = null;
            previewCells = [];
            render();
        }
    } else if (currentTool === 'rect-outline' || currentTool === 'rect-filled') {
        if (!rectStart) {
            rectStart = [r, c];
        } else {
            saveUndo();
            const cells = currentTool === 'rect-outline'
                ? getRectOutlineCells(rectStart[0], rectStart[1], r, c)
                : getRectFilledCells(rectStart[0], rectStart[1], r, c);
            for (const [cr, cc] of cells) setTile(cr, cc, tile);
            rectStart = null;
            previewCells = [];
            render();
        }
    } else if (currentTool === 'fill') {
        saveUndo();
        floodFill(r, c, tile);
        render();
    }
});

canvas.addEventListener('mousemove', (e) => {
    if (isPanning) {
        panX = panStartPanX + (e.clientX - panStartX);
        panY = panStartPanY + (e.clientY - panStartY);
        applyTransform();
        return;
    }

    const pos = canvasToGrid(e.clientX, e.clientY);
    document.getElementById('cursor-pos').textContent = pos ? `${pos[0]}, ${pos[1]}` : '-';

    if (isDrawing && currentTool === 'freedraw' && pos) {
        const tile = activeTile();
        if (lastDrawPos) {
            // Interpolate from last position to current using Bresenham
            const cells = getLineCells(lastDrawPos[0], lastDrawPos[1], pos[0], pos[1]);
            for (const [cr, cc] of cells) setTile(cr, cc, tile);
        } else {
            setTile(pos[0], pos[1], tile);
        }
        lastDrawPos = [pos[0], pos[1]];
        render();
        return;
    }

    if (currentTool === 'line' && lineStart && pos) {
        previewCells = getLineCells(lineStart[0], lineStart[1], pos[0], pos[1]);
        render();
    } else if ((currentTool === 'rect-outline' || currentTool === 'rect-filled') && rectStart && pos) {
        previewCells = currentTool === 'rect-outline'
            ? getRectOutlineCells(rectStart[0], rectStart[1], pos[0], pos[1])
            : getRectFilledCells(rectStart[0], rectStart[1], pos[0], pos[1]);
        render();
    }
});

canvas.addEventListener('mouseup', (e) => {
    if (isPanning) {
        isPanning = false;
        container.style.cursor = currentTool === 'grab' ? 'grab' : 'crosshair';
        return;
    }
    if (isDrawing) {
        isDrawing = false;
        lastDrawPos = null;
    }
});

canvas.addEventListener('mouseleave', () => {
    if (isPanning) {
        isPanning = false;
        container.style.cursor = currentTool === 'grab' ? 'grab' : 'crosshair';
    }
    if (isDrawing) { isDrawing = false; lastDrawPos = null; }
    document.getElementById('cursor-pos').textContent = '-';
});

// Zoom with scroll
container.addEventListener('wheel', (e) => {
    e.preventDefault();
    const oldZoom = zoom;
    const delta = e.deltaY > 0 ? -0.15 : 0.15;
    zoom = Math.max(0.5, Math.min(10, zoom + delta));
    if (zoom === oldZoom) return;

    // Zoom toward cursor
    const rect = container.getBoundingClientRect();
    const mx = e.clientX - rect.left;
    const my = e.clientY - rect.top;
    const oldCS = Math.max(1, Math.floor(6 * oldZoom));
    const newCS = Math.max(1, Math.floor(6 * zoom));
    const ratio = newCS / oldCS;

    panX = mx - ratio * (mx - panX);
    panY = my - ratio * (my - panY);

    resizeCanvas();
    applyTransform();
}, { passive: false });

// --- Keyboard shortcuts ---
const keysHeld = new Set();
let panAnimId = null;
const PAN_PX_PER_SEC = 400;

function panLoop(timestamp) {
    if (!panLoop.lastTime) panLoop.lastTime = timestamp;
    const dt = (timestamp - panLoop.lastTime) / 1000;
    panLoop.lastTime = timestamp;

    let dx = 0, dy = 0;
    if (keysHeld.has('a') || keysHeld.has('arrowleft'))  dx += 1;
    if (keysHeld.has('d') || keysHeld.has('arrowright')) dx -= 1;
    if (keysHeld.has('w') || keysHeld.has('arrowup'))   dy += 1;
    if (keysHeld.has('s') || keysHeld.has('arrowdown')) dy -= 1;

    if (dx !== 0 || dy !== 0) {
        const speed = PAN_PX_PER_SEC * dt;
        panX += dx * speed;
        panY += dy * speed;
        applyTransform();
        panAnimId = requestAnimationFrame(panLoop);
    } else {
        panAnimId = null;
        panLoop.lastTime = null;
    }
}

document.addEventListener('keydown', (e) => {
    if (e.ctrlKey || e.metaKey) {
        if (e.key === 'z') { e.preventDefault(); undo(); }
        if (e.key === 'y') { e.preventDefault(); redo(); }
    }
    if (e.key === 'Escape') {
        lineStart = null;
        rectStart = null;
        previewCells = [];
        render();
    }
    if (!e.ctrlKey && !e.metaKey) {
        const key = e.key.toLowerCase();
        if (['a','d','w','s','arrowleft','arrowright','arrowup','arrowdown'].includes(key)) {
            e.preventDefault();
            if (!keysHeld.has(key)) {
                keysHeld.add(key);
                if (!panAnimId) {
                    panLoop.lastTime = null;
                    panAnimId = requestAnimationFrame(panLoop);
                }
            }
        }
    }
});

document.addEventListener('keyup', (e) => {
    keysHeld.delete(e.key.toLowerCase());
});

// --- Tool/tile selection ---
document.querySelectorAll('.tool-btn').forEach(btn => {
    btn.addEventListener('click', () => {
        document.querySelectorAll('.tool-btn').forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        currentTool = btn.dataset.tool;
        lineStart = null;
        rectStart = null;
        previewCells = [];
        container.style.cursor = currentTool === 'grab' ? 'grab' : 'crosshair';
        render();
    });
});

document.querySelectorAll('.tile-btn').forEach(btn => {
    btn.addEventListener('click', () => {
        document.querySelectorAll('.tile-btn').forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        currentTile = btn.dataset.tile;
    });
});

// --- Info panel ---
function updateInfo() {
    let startCount = 0, hasPackage = false, hasTarget = false;
    let pPos = null, tPos = null;
    for (let r = 0; r < GRID_SIZE; r++) {
        for (let c = 0; c < GRID_SIZE; c++) {
            if (grid[r][c] === 's') startCount++;
            if (grid[r][c] === 'p') { hasPackage = true; pPos = [r, c]; }
            if (grid[r][c] === 't') { hasTarget = true; tPos = [r, c]; }
        }
    }
    document.getElementById('start-count').textContent = startCount;
    document.getElementById('package-status').textContent = hasPackage ? `(${pPos[0]}, ${pPos[1]})` : 'not placed';
    document.getElementById('target-status').textContent = hasTarget ? `(${tPos[0]}, ${tPos[1]})` : 'not placed';
}

// --- Validation ---
function validate() {
    const errors = [];
    let startCount = 0, packageCount = 0, targetCount = 0;
    let pPos = null, tPos = null;

    for (let r = 0; r < GRID_SIZE; r++) {
        for (let c = 0; c < GRID_SIZE; c++) {
            const t = grid[r][c];
            if (t === 's') startCount++;
            if (t === 'p') { packageCount++; pPos = [r, c]; }
            if (t === 't') { targetCount++; tPos = [r, c]; }
        }
    }

    if (startCount !== 30) errors.push(`Need exactly 30 starting cells, found ${startCount}`);
    if (packageCount !== 1) errors.push(`Need exactly 1 package, found ${packageCount}`);
    if (targetCount !== 1) errors.push(`Need exactly 1 target, found ${targetCount}`);

    if (pPos && tPos && pPos[0] === tPos[0] && pPos[1] === tPos[1]) {
        errors.push('Package and target must be on different cells');
    }

    // Check all land cells connected (8-dir)
    const landCheck = checkAllLandConnected();
    if (landCheck) errors.push(landCheck);

    // Check target reachable from package via clear cells (8-dir)
    if (pPos && tPos) {
        const clearCheck = checkClearPath(pPos, tPos);
        if (clearCheck) errors.push(clearCheck);
    }

    return errors;
}

function neighbors8(r, c) {
    const out = [];
    for (let dr = -1; dr <= 1; dr++) {
        for (let dc = -1; dc <= 1; dc++) {
            if (dr === 0 && dc === 0) continue;
            const nr = r + dr, nc = c + dc;
            if (nr >= 0 && nr < GRID_SIZE && nc >= 0 && nc < GRID_SIZE) {
                out.push([nr, nc]);
            }
        }
    }
    return out;
}

function checkAllLandConnected() {
    // Find first land cell
    let startR = -1, startC = -1;
    let landCount = 0;
    for (let r = 0; r < GRID_SIZE; r++) {
        for (let c = 0; c < GRID_SIZE; c++) {
            if (grid[r][c] !== 'w') {
                landCount++;
                if (startR === -1) { startR = r; startC = c; }
            }
        }
    }
    if (landCount === 0) return null;

    // BFS from first land cell
    const visited = new Uint8Array(GRID_SIZE * GRID_SIZE);
    const queue = [[startR, startC]];
    visited[startR * GRID_SIZE + startC] = 1;
    let count = 0;

    while (queue.length > 0) {
        const [r, c] = queue.shift();
        count++;
        for (const [nr, nc] of neighbors8(r, c)) {
            const key = nr * GRID_SIZE + nc;
            if (!visited[key] && grid[nr][nc] !== 'w') {
                visited[key] = 1;
                queue.push([nr, nc]);
            }
        }
    }

    if (count !== landCount) {
        return `Not all land cells are connected (reached ${count} of ${landCount})`;
    }
    return null;
}

function checkClearPath(pPos, tPos) {
    const isGood = (r, c) => {
        const t = grid[r][c];
        return t === 'n' || t === 's' || t === 'p' || t === 't';
    };

    if (!isGood(pPos[0], pPos[1])) return 'Package is not on a good-condition cell';
    if (!isGood(tPos[0], tPos[1])) return 'Target is not on a good-condition cell';

    const visited = new Uint8Array(GRID_SIZE * GRID_SIZE);
    const queue = [[pPos[0], pPos[1]]];
    visited[pPos[0] * GRID_SIZE + pPos[1]] = 1;

    while (queue.length > 0) {
        const [r, c] = queue.shift();
        if (r === tPos[0] && c === tPos[1]) return null;
        for (const [nr, nc] of neighbors8(r, c)) {
            const key = nr * GRID_SIZE + nc;
            if (!visited[key] && isGood(nr, nc)) {
                visited[key] = 1;
                queue.push([nr, nc]);
            }
        }
    }

    return 'Target is not reachable from package via clear-condition cells';
}

// --- Import/Export ---
function importMap(text) {
    const lines = text.trim().split('\n');
    if (lines.length < GRID_SIZE) {
        alert(`Map must have ${GRID_SIZE} lines, found ${lines.length}`);
        return false;
    }
    // Validate first
    for (let i = 0; i < GRID_SIZE; i++) {
        const line = lines[i];
        if (line.length < GRID_SIZE) {
            alert(`Line ${i + 1} must have ${GRID_SIZE} characters, found ${line.length}`);
            return false;
        }
        for (let j = 0; j < GRID_SIZE; j++) {
            if (!'nmwspt'.includes(line[j])) {
                alert(`Invalid character '${line[j]}' at line ${i + 1}, col ${j + 1}`);
                return false;
            }
        }
    }
    // Transpose on import: file line index = X, char index = Y
    const newGrid = [];
    for (let r = 0; r < GRID_SIZE; r++) {
        newGrid[r] = [];
        for (let c = 0; c < GRID_SIZE; c++) {
            newGrid[r][c] = lines[c][r];
        }
    }
    saveUndo();
    grid = newGrid;
    render();
    return true;
}

function exportMap() {
    // Transpose: simulator treats line index as X, char index as Y
    let text = '';
    for (let c = 0; c < GRID_SIZE; c++) {
        for (let r = 0; r < GRID_SIZE; r++) {
            text += grid[r][c];
        }
        text += '\n';
    }
    return text;
}

// --- Button handlers ---
document.getElementById('btn-validate').addEventListener('click', () => {
    const errors = validate();
    const msgEl = document.getElementById('validation-msg');
    if (errors.length === 0) {
        msgEl.className = 'pass';
        msgEl.textContent = 'Map is valid!';
    } else {
        msgEl.className = 'fail';
        msgEl.textContent = errors.join(' | ');
    }
});

document.getElementById('btn-import').addEventListener('click', () => {
    document.getElementById('file-input').click();
});

document.getElementById('file-input').addEventListener('change', (e) => {
    const file = e.target.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
        importMap(reader.result);
    };
    reader.readAsText(file);
    e.target.value = '';
});

document.getElementById('btn-export').addEventListener('click', () => {
    const errors = validate();
    const msgEl = document.getElementById('validation-msg');
    if (errors.length > 0) {
        msgEl.className = 'fail';
        msgEl.textContent = 'Warning: ' + errors.join(' | ');
    } else {
        msgEl.className = 'pass';
        msgEl.textContent = 'Map is valid!';
    }
    // Download regardless
    const text = exportMap();
    const blob = new Blob([text], { type: 'text/plain' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'map.txt';
    a.click();
    URL.revokeObjectURL(url);
});

document.getElementById('btn-export-java').addEventListener('click', () => {
    const name = prompt('Enter map folder name (no spaces, e.g. "kr").\nThis becomes the path: spy/NAME/map.txt');
    if (!name) return;
    const trimmed = name.trim();
    if (!trimmed || /\s/.test(trimmed)) {
        alert('Folder name cannot be empty or contain spaces.');
        return;
    }
    const java = `package spy.${trimmed};

import java.io.BufferedReader;
import java.io.FileReader;
import java.io.IOException;
import java.util.List;
import java.util.ArrayList;
import java.util.Random;

import spy.sim.Point;

public class MapGenerator implements spy.sim.MapGenerator {

\tpublic static final String PATH = "spy/${trimmed}/map.txt";

\tprotected List<Point> waterCells;
\tprotected List<Point> muddyCells;
\tprotected List<Point> startingCells;
\tprotected Point packageCell;
\tprotected Point targetCell;

\tpublic MapGenerator() {

\t\twaterCells = new ArrayList<Point>();
\t\tmuddyCells = new ArrayList<Point>();
\t\tstartingCells = new ArrayList<Point>();

\t\ttry {
\t\t\tBufferedReader br = new BufferedReader(new FileReader(PATH));
\t\t\tString line = br.readLine();
\t\t\tint i = 0;
\t\t\twhile (line != null) {
\t\t\t\tfor (int j = 0; j < line.length(); ++j) {
\t\t\t\t\tswitch (line.charAt(j)) {
\t\t\t\t\t\tcase 'n': break;
\t\t\t\t\t\tcase 'm': muddyCells.add(new Point(i, j)); break;
\t\t\t\t\t\tcase 'w': waterCells.add(new Point(i, j)); break;
\t\t\t\t\t\tcase 's': startingCells.add(new Point(i, j)); break;
\t\t\t\t\t\tcase 'p': packageCell = new Point(i, j); break;
\t\t\t\t\t\tcase 't': targetCell = new Point(i, j); break;
\t\t\t\t\t\tdefault : throw new IOException("Invalid map token");
\t\t\t\t\t}
\t\t\t\t}
\t\t\t\ti++;
\t\t\t\tline = br.readLine();
\t\t\t}
\t\t\tbr.close();
\t\t}
\t\tcatch (IOException e) {
\t\t\te.printStackTrace();
\t\t}
\t}

    public List<Point> waterCells(){
        return waterCells;
    }

    public List<Point> muddyCells(){
        return muddyCells;
    }

    public Point packageLocation(){
        return packageCell;
    }

    public Point targetLocation(){
        return targetCell;
    }

    public List<Point> startingLocations(List<Point> waterCells)
    {
        return startingCells;
    }
}
`;
    const blob = new Blob([java], { type: 'text/x-java-source' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'MapGenerator.java';
    a.click();
    URL.revokeObjectURL(url);
});

document.getElementById('btn-clear').addEventListener('click', () => {
    if (!confirm('Clear the entire map?')) return;
    saveUndo();
    initGrid();
    render();
});

// --- Initial render ---
window.addEventListener('resize', () => {
    resizeCanvas();
});

// Start with a good zoom to fill the viewport
function initialFit() {
    const cw = container.clientWidth;
    const ch = container.clientHeight;
    const minDim = Math.min(cw, ch);
    zoom = Math.max(0.5, Math.min(10, minDim / (GRID_SIZE * 6)));
    resizeCanvas();
}

initialFit();
