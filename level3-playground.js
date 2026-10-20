// Level 3 playground: the handout street map, a line-by-line C++ run, and drivetrain animation.
(function () {
  const vex = window.vexCppRun;
  if (!vex || !document.getElementById("level3-playground")) return;

  const L3_CODE_KEY = "vexcpp-level3-code";
  const L3_MAP_KEY = "vexcpp-level3-map";
  const L3_COL = { 1: "#d1495b", 2: "#1f7a8c", 3: "#d98c00" };
  const L3_DEFAULT = [
    { id: 1, x: 0, y: 500, dx: 1800, dy: 1000, p: 2 },
    { id: 2, x: 1800, y: 500, dx: 0, dy: 1000, p: 5 },
    { id: 3, x: 900, y: 500, dx: 900, dy: 1000, p: 3 }
  ];
  const L3W = 760, L3H = 250, L3L = 82, L3R = 18, L3T = 62, L3B = 30;

  const l3 = {
    cans: [],
    robot: { x: 0, y: 0, heading: 0 },
    trail: [],
    pieces: [],
    held: 0,
    grip: 0,
    gripLine: 0,
    shakeX: 0,
    shakeY: 0,
    shakeRot: 0,
    intent: "",
    phase: "",
    grabTarget: 0,
    program: null,
    compiled: false,
    token: 0,
    flow: "idle",
    line: 0,
    pauseWhenDone: false,
    resume: null,
    varText: null,
    silent: false
  };

  const L3_GRIP_STEPS = [
    { bit: 1, need: 0, motor: "Arm", name: "armDown", reach: 1, open: 0, phase: "down", action: "Arm down" },
    { bit: 2, need: 1, motor: "Claw", name: "clawOpen", reach: 1, open: 1, phase: "open", action: "Claw open" },
    { bit: 4, need: 3, motor: "Claw", name: "clawClosed", reach: 1, open: 0, phase: "close", action: "Claw closed" },
    { bit: 8, need: 7, motor: "Arm", name: "armUp", reach: 0, open: 0, phase: "up", action: "Arm up" }
  ];

  function l3X(mm) { return L3L + (mm / 1800) * (L3W - L3L - L3R); }
  function l3Y(mm) { return L3T + ((1000 - mm) / 1000) * (L3H - L3T - L3B); }

  function l3Esc(value) {
    return String(value).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
  }

  function l3Clone(cans) {
    return cans.map(c => ({ id: c.id, x: c.x, y: c.y, dx: c.dx, dy: c.dy, p: c.p }));
  }

  function l3OnGrid(x, y) {
    return (x === 0 || x === 900 || x === 1800) && (y === 0 || y === 500 || y === 1000);
  }

  function l3Normalize(raw) {
    if (!Array.isArray(raw) || raw.length !== 3) return null;
    const seen = new Set();
    const pri = new Set();
    const cans = [];
    for (let i = 0; i < 3; i++) {
      const c = raw[i];
      if (!c || c.id !== i + 1) return null;
      if (!l3OnGrid(c.x, c.y) || !l3OnGrid(c.dx, c.dy)) return null;
      if ((c.x === 0 && c.y === 0) || (c.dx === 0 && c.dy === 0)) return null;
      if (!Number.isInteger(c.p)) return null;
      const a = c.x + "," + c.y;
      const b = "h" + c.dx + "," + c.dy;
      if (seen.has(a) || seen.has(b)) return null;
      seen.add(a);
      seen.add(b);
      if (pri.has(c.p)) return null;
      pri.add(c.p);
      cans.push({ id: c.id, x: c.x, y: c.y, dx: c.dx, dy: c.dy, p: c.p });
    }
    return cans;
  }

  function l3LoadMap() {
    try {
      const raw = localStorage.getItem(L3_MAP_KEY);
      if (raw) {
        const parsed = l3Normalize(JSON.parse(raw));
        if (parsed) return parsed;
      }
    } catch (err) { /* keep the handout map */ }
    return l3Clone(L3_DEFAULT);
  }

  function l3SaveMap() {
    try { localStorage.setItem(L3_MAP_KEY, JSON.stringify(l3.cans)); } catch (err) { /* storage may be blocked */ }
  }

  function l3Literal(type, n) {
    if (type === "int") return String(Math.trunc(Number(n)));
    return (Math.round(Number(n) * 10) / 10).toFixed(1);
  }

  function l3MapFields() {
    const c = l3.cans;
    return [
      ["float", "can1X", c[0].x],
      ["float", "can1Y", c[0].y],
      ["float", "can2X", c[1].x],
      ["float", "can2Y", c[1].y],
      ["float", "can3X", c[2].x],
      ["float", "can3Y", c[2].y],
      ["float", "house1X", c[0].dx],
      ["float", "house1Y", c[0].dy],
      ["float", "house2X", c[1].dx],
      ["float", "house2Y", c[1].dy],
      ["float", "house3X", c[2].dx],
      ["float", "house3Y", c[2].dy],
      ["int", "priority1", c[0].p],
      ["int", "priority2", c[1].p],
      ["int", "priority3", c[2].p]
    ];
  }

  const L3_BEGIN = [
    "/**********************************************************",
    " * *** Auto-generated variables for the map above ***",
    " * *** BEGIN ***",
    " **********************************************************/"
  ].join("\n");

  const L3_END = [
    "/**********************************************************",
    " * *** END ***",
    " **********************************************************/"
  ].join("\n");

  function l3Generated(values) {
    const line = (type, name, isConst) => (isConst ? "const " : "") + type + " " + name + " = " + values[name] + ";";
    const fields = l3MapFields();
    const lines = [L3_BEGIN];
    fields.slice(0, 6).forEach(field => lines.push(line(field[0], field[1], false)));
    lines.push("");
    fields.slice(6, 12).forEach(field => lines.push(line(field[0], field[1], false)));
    lines.push("");
    ["x", "y", "heading"].forEach(name => lines.push(line("float", name, false)));
    lines.push("");
    fields.slice(12).forEach(field => lines.push(line(field[0], field[1], false)));
    lines.push(
      "",
      "// TODO: experimentally determine these values.",
      line("float", "armDown", true),
      line("float", "armUp", true),
      line("float", "clawOpen", true),
      line("float", "clawClosed", true),
      L3_END
    );
    return lines.join("\n");
  }

  function l3StarterValues() {
    const values = { x: "0.0", y: "0.0", heading: "0.0", armDown: "0.0", armUp: "0.0", clawOpen: "0.0", clawClosed: "0.0" };
    l3MapFields().forEach(field => { values[field[1]] = l3Literal(field[0], field[2]); });
    return values;
  }

  function l3Starter() {
    return l3Generated(l3StarterValues());
  }

  function l3ShapeGenerated(source) {
    let text = String(source || "").replace(/\r\n/g, "\n");
    text = text.split(L3_BEGIN).join("");
    text = text.split(L3_END).join("");
    text = text.replace(/\/\* Generated from the map\.[\s\S]*?\*\//g, "");
    text = text.replace(/\/\* End of the generated map\.[\s\S]*?\*\//g, "");
    const noise = [
      /^\/\/ Map numbers for the picture above\.\s*$/,
      /^\/\/ --- Map block\..*$/,
      /^\/\/ --- End of the map block\..*$/,
      /^\/\/ Can positions\.\s*$/,
      /^\/\/ House positions\.\s*$/,
      /^\/\/ Priorities\..*$/,
      /^\/\/ Robot position and facing\..*$/,
      /^\/\/ Gripper angles.*$/,
      /^\/\/ TODO: experimentally determine these values\.\s*$/,
      /^\/\/ Your delivery code starts here\.\s*$/
    ];
    const values = {};
    const names = {};
    Object.keys(l3StarterValues()).forEach(name => { names[name] = true; });
    const declRe = /^[ \t]*(?:const[ \t]+)?(?:int|float)[ \t]+([A-Za-z_][A-Za-z0-9_]*)[ \t]*=[ \t]*([^;\n]*);[ \t]*$/;
    const remain = [];
    text.split("\n").forEach(line => {
      if (noise.some(re => re.test(line.trim()))) return;
      const match = declRe.exec(line);
      if (match && names[match[1]]) {
        if (values[match[1]] == null) values[match[1]] = match[2].trim();
        return;
      }
      remain.push(line);
    });
    const defaults = l3StarterValues();
    Object.keys(defaults).forEach(name => {
      if (values[name] == null || values[name] === "") values[name] = defaults[name];
    });
    const block = l3Generated(values);
    const rest = remain.join("\n").replace(/^\n+|\n+$/g, "").replace(/\n{3,}/g, "\n\n");
    return rest ? block + "\n\n" + rest : block;
  }

  function l3HasStudentLogic(source) {
    const code = String(source).replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/.*$/gm, "");
    return /\b(if|else|Drivetrain|ArmMotor|ClawMotor|wait|for|while)\b/.test(code);
  }

  function l3SetCode(value) {
    const area = document.getElementById("l3-code");
    l3.silent = true;
    area.value = value;
    vex.refreshEditorHighlight(area);
    l3.silent = false;
    try { localStorage.setItem(L3_CODE_KEY, value); } catch (err) { /* storage may be blocked */ }
    l3.compiled = false;
    l3.program = null;
    if (l3.flow === "running" || l3.flow === "stepping" || l3.flow === "paused") {
      l3Halt();
      l3Home();
      l3RenderMap();
      l3ClearChrome();
    }
    l3UpdateButtons();
  }

  function l3ApplyNumbers(insertMissing) {
    const area = document.getElementById("l3-code");
    let source = area.value.replace(/\r\n/g, "\n");
    const before = source;
    let found = 0;
    const missing = [];
    l3MapFields().forEach(field => {
      const name = field[1];
      const raw = field[2];
      const re = new RegExp("(^|\\n)([ \\t]*)(const[ \\t]+)?(int|float)[ \\t]+" + name + "[ \\t]*=[ \\t]*[^;\\n]*;", "g");
      let hit = false;
      source = source.replace(re, (m, lead, indent, constPart, foundType) => {
        hit = true;
        const useType = foundType === "int" ? "int" : "float";
        return lead + indent + (constPart || "") + useType + " " + name + " = " + l3Literal(useType, raw) + ";";
      });
      if (hit) found += 1;
      else missing.push(field);
    });
    let inserted = false;
    if (insertMissing && missing.length) {
      const block = missing.map(field => field[0] + " " + field[1] + " = " + l3Literal(field[0], field[2]) + ";").join("\n");
      source = block + "\n" + source;
      inserted = true;
    }
    if (source !== before) l3SetCode(l3ShapeGenerated(source));
    return { found: found, inserted: inserted, changed: source !== before };
  }

  function l3Fmt(n) {
    if (!Number.isFinite(n)) return "?";
    const rounded = Math.round(n * 10) / 10;
    if (Math.abs(rounded - Math.round(rounded)) < 0.05) return String(Math.round(rounded));
    return rounded.toFixed(1);
  }

  function l3Norm(heading) {
    let x = heading % 360;
    if (x < 0) x += 360;
    if (x >= 359.999) return 0;
    return x;
  }

  function l3Face(heading) {
    const n = l3Norm(heading);
    const cards = [[0, "east"], [90, "north"], [180, "west"], [270, "south"]];
    for (let i = 0; i < cards.length; i++) {
      const diff = Math.abs(n - cards[i][0]);
      if (diff < 0.8 || diff > 359.2) return cards[i][1];
    }
    return Math.round(n) + "°";
  }

  function l3PoseString() {
    let text = "at (" + l3Fmt(l3.robot.x) + ", " + l3Fmt(l3.robot.y) + "), facing " + l3Face(l3.robot.heading);
    if (l3.held) text += ", carrying CAN " + l3.held;
    return text;
  }

  function l3OffField() {
    return l3.robot.x < -1 || l3.robot.x > 1801 || l3.robot.y < -1 || l3.robot.y > 1001;
  }

  function l3Vector(heading) {
    const n = l3Norm(heading);
    const cards = [0, 90, 180, 270];
    for (let i = 0; i < cards.length; i++) {
      if (Math.abs(n - cards[i]) < 0.05 || (cards[i] === 0 && n > 359.95)) {
        const h = cards[i];
        return {
          x: h === 0 ? 1 : h === 180 ? -1 : 0,
          y: h === 90 ? 1 : h === 270 ? -1 : 0
        };
      }
    }
    const rad = heading * Math.PI / 180;
    return { x: Math.cos(rad), y: Math.sin(rad) };
  }

  function l3Home() {
    l3.robot = { x: 0, y: 0, heading: 0 };
    l3.trail = [];
    l3.varText = null;
    l3.pieces = l3.cans.map(c => ({ id: c.id, x: c.x, y: c.y }));
    l3.held = 0;
    l3.grip = 0;
    l3.gripLine = 0;
    l3.shakeX = 0;
    l3.shakeY = 0;
    l3.shakeRot = 0;
    l3.intent = "";
    l3.phase = "";
    l3.grabTarget = 0;
  }

  function l3Push(x, y) {
    const last = l3.trail[l3.trail.length - 1];
    if (last && Math.abs(last.x - x) < 0.05 && Math.abs(last.y - y) < 0.05) return;
    l3.trail.push({ x: x, y: y });
  }

  function l3TrailAttr() {
    const pts = l3.trail.slice();
    const last = pts[pts.length - 1];
    if (pts.length && (!last || Math.abs(last.x - l3.robot.x) > 0.05 || Math.abs(last.y - l3.robot.y) > 0.05)) {
      pts.push({ x: l3.robot.x, y: l3.robot.y });
    }
    if (pts.length < 2) return "";
    return pts.map(p => l3X(p.x) + "," + l3Y(p.y)).join(" ");
  }

  function l3PlaceRobot() {
    const sx = l3.shakeX || 0;
    const sy = l3.shakeY || 0;
    const g = document.getElementById("l3-robot");
    if (g) {
      g.setAttribute("transform", "translate(" + (l3X(l3.robot.x) + sx) + " " + (l3Y(l3.robot.y) + sy) + ") rotate(" + (-l3.robot.heading + (l3.shakeRot || 0)) + ")");
    }
    if (l3.held) {
      const can = document.getElementById("l3-can-" + l3.held);
      if (can) {
        const at = l3CarrySvg();
        can.setAttribute("transform", "translate(" + (at.x + sx) + " " + (at.y + sy) + ")");
      }
    }
    const pose = document.getElementById("l3-pose");
    if (pose) {
      pose.textContent = l3PoseString();
      pose.classList.toggle("l3-off", l3OffField());
    }
  }

  function l3SetTrail() {
    const attr = l3TrailAttr();
    const halo = document.getElementById("l3-trail-halo");
    const line = document.getElementById("l3-trail");
    if (halo) halo.setAttribute("points", attr);
    if (line) line.setAttribute("points", attr);
  }

  function l3Piece(id) {
    for (let i = 0; i < l3.pieces.length; i++) {
      if (l3.pieces[i].id === id) return l3.pieces[i];
    }
    return null;
  }

  function l3CanHere() {
    const vec = l3Vector(l3.robot.heading);
    const nose = { x: l3.robot.x + vec.x * 80, y: l3.robot.y + vec.y * 80 };
    let best = null;
    let bestD = 110;
    l3.pieces.forEach(p => {
      if (p.id === l3.held) return;
      const atRobot = Math.hypot(p.x - l3.robot.x, p.y - l3.robot.y);
      const atNose = Math.hypot(p.x - nose.x, p.y - nose.y);
      const d = Math.min(atRobot, atNose);
      if (d <= bestD + 0.001 && (!best || d < bestD - 0.001 || (Math.abs(d - bestD) <= 0.001 && p.id < best.id))) {
        best = p;
        bestD = d;
      }
    });
    return best;
  }

  function l3CarrySvg() {
    const h = l3.robot.heading * Math.PI / 180;
    const cos = Math.cos(h);
    const sin = Math.sin(h);
    const ly = -18;
    return {
      x: l3X(l3.robot.x) + ly * sin,
      y: l3Y(l3.robot.y) + ly * cos
    };
  }

  function l3CanMarkup(x, y, color) {
    return '<rect x="' + (x - 7) + '" y="' + (y - 6) + '" width="14" height="13" rx="2" fill="' + color + '"/>'
      + '<ellipse cx="' + x + '" cy="' + (y - 6) + '" rx="7" ry="2.7" fill="#fff" stroke="' + color + '" stroke-width="1.15"/>'
      + '<circle cx="' + x + '" cy="' + y + '" r="2.2" fill="#16324f"/>';
  }

  function l3RobotInner() {
    return '<line x1="0" y1="0" x2="20" y2="0" stroke="#fff" stroke-width="6.5" stroke-linecap="round"/>'
      + '<line x1="0" y1="0" x2="20" y2="0" stroke="#16324f" stroke-width="3.2" stroke-linecap="round"/>'
      + '<polygon points="30,0 20,6 20,-6" fill="#16324f" stroke="#fff" stroke-width="1"/>';
  }

  function l3IsHandoutLayout() {
    return l3.cans.every((c, i) => {
      const d = L3_DEFAULT[i];
      return c.x === d.x && c.y === d.y && c.dx === d.dx && c.dy === d.dy;
    });
  }

  function l3LabelPos(mmX, mmY, kind) {
    const px = l3X(mmX);
    const py = l3Y(mmY);
    const above = kind === "house" ? 40 : 26;
    const side = kind === "house" ? 16 : 14;
    let anchor = "start";
    let x = px + side;
    let y = py - above;
    if (mmX >= 1800) {
      anchor = "end";
      x = px - side;
    }
    if (y < 18) y = py + 24;
    return { x: x, y: y, anchor: anchor };
  }

  function l3Label(parts, x, y, anchor, color, title, sub) {
    l3Text(parts, x, y, anchor, color, 11, 700, title);
    l3Text(parts, x, y + 11, anchor, color, 9, 0, sub);
  }

  function l3Text(parts, x, y, anchor, color, size, weight, content) {
    parts.push('<text x="' + x + '" y="' + y + '" text-anchor="' + anchor + '" font-size="' + size + '"' + (weight ? ' font-weight="' + weight + '"' : '') + ' fill="' + color + '">' + l3Esc(content) + "</text>");
  }

  function l3MapSvg() {
    const road = 20;
    const handout = l3IsHandoutLayout();
    const parts = [];
    parts.push('<svg viewBox="0 0 ' + L3W + ' ' + L3H + '" xmlns="http://www.w3.org/2000/svg" font-family="Segoe UI, Arial, sans-serif" aria-hidden="true">');
    parts.push('<rect x="' + (l3X(0) - road / 2) + '" y="2" width="' + (l3X(1800) - l3X(0) + road) + '" height="' + (l3Y(0) + road / 2 - 2) + '" fill="#e5f2df"/>');
    [0, 500, 1000].forEach(v => {
      parts.push('<rect x="' + (l3X(0) - road / 2) + '" y="' + (l3Y(v) - road / 2) + '" width="' + (l3X(1800) - l3X(0) + road) + '" height="' + road + '" fill="#8f99a6"/>');
    });
    [0, 900, 1800].forEach(v => {
      parts.push('<rect x="' + (l3X(v) - road / 2) + '" y="' + (l3Y(1000) - road / 2) + '" width="' + road + '" height="' + (l3Y(0) - l3Y(1000) + road) + '" fill="#8f99a6"/>');
    });
    [0, 500, 1000].forEach(v => {
      parts.push('<line x1="' + l3X(0) + '" y1="' + l3Y(v) + '" x2="' + l3X(1800) + '" y2="' + l3Y(v) + '" stroke="#fff" stroke-width="2" stroke-dasharray="10 8"/>');
    });
    [0, 900, 1800].forEach(v => {
      parts.push('<line x1="' + l3X(v) + '" y1="' + l3Y(1000) + '" x2="' + l3X(v) + '" y2="' + l3Y(0) + '" stroke="#fff" stroke-width="2" stroke-dasharray="10 8"/>');
    });
    [0, 900, 1800].forEach(v => {
      parts.push('<line x1="' + l3X(v) + '" y1="' + (l3Y(0) + road / 2) + '" x2="' + l3X(v) + '" y2="' + (l3Y(0) + road / 2 + 6) + '" stroke="#333"/>');
      l3Text(parts, l3X(v), l3Y(0) + road / 2 + 18, "middle", "#333", 10, 0, String(v));
    });
    l3Text(parts, l3X(0) - road / 2 - 8, l3Y(0) + road / 2 + 18, "end", "#333", 10, 700, "mm");
    [500, 1000].forEach(v => {
      parts.push('<line x1="' + (l3X(0) - road / 2 - 6) + '" y1="' + l3Y(v) + '" x2="' + (l3X(0) - road / 2) + '" y2="' + l3Y(v) + '" stroke="#333"/>');
      l3Text(parts, l3X(0) - road / 2 - 8, l3Y(v) + 3, "end", "#333", 10, 0, String(v));
    });

    l3.cans.forEach(c => {
      const color = L3_COL[c.id];
      const hx = l3X(c.dx);
      const hy = l3Y(c.dy);
      parts.push('<polygon points="' + hx + ',' + (hy - 13) + ' ' + (hx - 13) + ',' + (hy - 5) + ' ' + (hx + 13) + ',' + (hy - 5) + '" fill="' + color + '"/>');
      parts.push('<rect x="' + (hx - 11) + '" y="' + (hy - 5) + '" width="22" height="16" fill="#fffdf8" stroke="' + color + '" stroke-width="1.6"/>');
      parts.push('<rect x="' + (hx - 2.4) + '" y="' + (hy + 4) + '" width="4.8" height="7" fill="' + color + '"/>');
      parts.push('<circle cx="' + hx + '" cy="' + hy + '" r="2.2" fill="#16324f"/>');
      const houseTitle = "HOUSE " + c.id;
      const houseSub = "(" + c.dx + ", " + c.dy + ")";
      if (handout && c.id === 1) l3Label(parts, hx - 16, hy - 40, "end", color, houseTitle, houseSub);
      else if (handout && c.id === 2) l3Label(parts, hx + 16, hy - 40, "start", color, houseTitle, houseSub);
      else if (handout) l3Label(parts, hx + 16, hy - 40, "start", color, houseTitle, houseSub);
      else {
        const pos = l3LabelPos(c.dx, c.dy, "house");
        l3Label(parts, pos.x, pos.y, pos.anchor, color, houseTitle, houseSub);
      }

    });

    const trail = l3TrailAttr();
    parts.push('<polyline id="l3-trail-halo" points="' + trail + '" fill="none" stroke="#fff" stroke-width="5" stroke-linecap="round" stroke-linejoin="round"/>');
    parts.push('<polyline id="l3-trail" points="' + trail + '" fill="none" stroke="#1565c0" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"/>');
    parts.push('<g id="l3-robot" transform="translate(' + l3X(l3.robot.x) + ' ' + l3Y(l3.robot.y) + ') rotate(' + (-l3.robot.heading) + ')">');
    parts.push(l3RobotInner());
    parts.push("</g>");
    l3.cans.forEach(c => {
      const color = L3_COL[c.id];
      const piece = l3Piece(c.id) || { id: c.id, x: c.x, y: c.y };
      const carried = l3.held === c.id;
      const at = carried ? l3CarrySvg() : { x: l3X(piece.x), y: l3Y(piece.y) };
      parts.push('<g id="l3-can-' + c.id + '" transform="translate(' + at.x + ' ' + at.y + ')">');
      parts.push(l3CanMarkup(0, 0, color));
      const canTitle = "CAN " + c.id;
      const canSub = carried ? "with the robot" : ("priority " + c.p + " · (" + l3Fmt(piece.x) + ", " + l3Fmt(piece.y) + ")");
      const moved = Math.abs(piece.x - c.x) > 0.5 || Math.abs(piece.y - c.y) > 0.5;
      if (carried) l3Label(parts, 14, -26, "start", color, canTitle, canSub);
      else if (!moved && handout && c.id === 2) l3Label(parts, -14, -26, "end", color, canTitle, canSub);
      else if (!moved && handout) l3Label(parts, 14, -26, "start", color, canTitle, canSub);
      else {
        const pos = l3LabelPos(piece.x, piece.y, "can");
        l3Label(parts, pos.x - l3X(piece.x), pos.y - l3Y(piece.y), pos.anchor, color, canTitle, canSub);
      }
      parts.push("</g>");
    });
    parts.push("</svg>");
    return parts.join("");
  }

  function l3RenderMap() {
    const host = document.getElementById("l3-map");
    if (!host) return;
    host.innerHTML = l3MapSvg();
    l3PlaceRobot();
  }

  function l3RenderLegend() {
    const host = document.getElementById("l3-legend");
    if (!host) return;
    host.replaceChildren();
    l3.cans.forEach(c => {
      const row = document.createElement("div");
      row.className = "l3-key";
      const swatch = document.createElement("i");
      swatch.style.background = L3_COL[c.id];
      const text = document.createElement("span");
      const can = document.createElement("b");
      can.textContent = "CAN " + c.id;
      const house = document.createElement("b");
      house.textContent = "HOUSE " + c.id;
      text.append(can, document.createTextNode(" (" + c.x + ", " + c.y + ") · priority " + c.p + " → "), house, document.createTextNode(" (" + c.dx + ", " + c.dy + ")"));
      row.append(swatch, text);
      host.appendChild(row);
    });
  }

  function l3Message(text, kind) {
    const el = document.getElementById("l3-msg");
    if (!el) return;
    if (!text) {
      el.hidden = true;
      el.textContent = "";
      el.className = "l3-msg";
      return;
    }
    el.hidden = false;
    el.className = "l3-msg " + (kind || "info");
    el.textContent = text;
  }

  function l3Action(text) {
    const el = document.getElementById("l3-action");
    if (el) el.textContent = text || "";
  }

  function l3Metrics() {
    const pre = document.querySelector("#l3-editor .code-highlight");
    const cs = pre ? getComputedStyle(pre) : null;
    return {
      pre: pre,
      lh: cs ? (parseFloat(cs.lineHeight) || 22) : 22,
      pad: cs ? (parseFloat(cs.paddingTop) || 12) : 12
    };
  }

  function l3ShowLine(n) {
    l3.line = n;
    const bar = document.getElementById("l3-current");
    const m = l3Metrics();
    if (bar && m.pre) {
      const top = m.pad + (n - 1) * m.lh;
      bar.hidden = false;
      bar.style.height = m.lh + "px";
      bar.style.top = top + "px";
      if (m.pre.clientHeight > 0) {
        const viewTop = m.pre.scrollTop;
        const viewBottom = viewTop + m.pre.clientHeight - m.lh;
        if (top < viewTop || top > viewBottom) {
          const next = Math.max(0, top - m.pre.clientHeight * 0.35);
          m.pre.scrollTop = next;
          const area = document.getElementById("l3-code");
          if (area) area.scrollTop = next;
        }
      }
    }
    const label = document.getElementById("l3-line");
    if (label) label.textContent = "Line " + n;
  }

  function l3ClearLine() {
    l3.line = 0;
    const bar = document.getElementById("l3-current");
    if (bar) bar.hidden = true;
    const label = document.getElementById("l3-line");
    if (label) label.textContent = "Ready";
  }

  function l3RenderVarRows(rows) {
    const host = document.getElementById("l3-vars");
    if (!host) return;
    host.replaceChildren();
    if (!rows.length) return;
    const kicker = document.createElement("span");
    kicker.className = "l3-k";
    kicker.textContent = "Variables";
    host.appendChild(kicker);
    rows.forEach(row => {
      const chip = document.createElement("span");
      chip.className = "l3-chip" + (row.changed ? " changed" : "");
      chip.textContent = row.name + " = " + row.value;
      host.appendChild(chip);
    });
  }

  function l3RenderVarsFrom(env) {
    const map = new Map();
    env.stack.forEach(scope => {
      scope.forEach((rec, name) => map.set(name, rec));
    });
    const rows = [];
    map.forEach((rec, name) => {
      if (rec.initialized) rows.push({ name: name, value: vex.formatValue(rec.type, rec.value) });
    });
    const prev = l3.varText;
    const next = {};
    rows.forEach(row => {
      next[row.name] = row.value;
      row.changed = !!(prev && prev[row.name] !== row.value);
    });
    l3.varText = next;
    l3RenderVarRows(rows);
  }

  function l3ClearChrome() {
    l3ClearLine();
    l3Action("");
    l3.varText = null;
    l3RenderVarRows([]);
  }

  function l3Speed() {
    const input = document.getElementById("l3-speed");
    const v = input ? Number(input.value) : 1;
    return Number.isFinite(v) && v > 0 ? v : 1;
  }

  function l3SyncSpeed() {
    const label = document.getElementById("l3-speed-label");
    if (!label) return;
    const v = l3Speed();
    label.textContent = (Math.round(v * 10) % 10 === 0 ? String(Math.round(v)) : v.toFixed(1)) + "×";
  }

  function l3UpdateButtons() {
    const run = document.getElementById("l3-run");
    const pause = document.getElementById("l3-pause");
    const step = document.getElementById("l3-step");
    if (run) run.textContent = l3.flow === "paused" ? "Resume" : "Run";
    if (pause) pause.disabled = l3.flow !== "running" && l3.flow !== "stepping";
    if (step) step.disabled = !l3.compiled;
  }

  function l3Compile() {
    const source = document.getElementById("l3-code").value;
    try {
      if (!source.trim()) throw new Error("Write some statements before compiling.");
      const program = vex.parseCpp(source, true, { calls: true, limit: 50000 });
      l3CheckProgram(program);
      l3.program = program;
      l3.compiled = true;
      l3ClearLine();
      l3UpdateButtons();
      return program;
    } catch (err) {
      l3.program = null;
      l3.compiled = false;
      l3UpdateButtons();
      l3ShowError(err);
      return null;
    }
  }

  function l3Abort() {
    const err = new Error("stopped");
    err.abort = true;
    return err;
  }

  function l3Halt() {
    l3.token += 1;
    l3.flow = "idle";
    l3.pauseWhenDone = false;
    const go = l3.resume;
    l3.resume = null;
    if (go) go();
  }

  function l3ShowError(err) {
    let message = err && err.message ? String(err.message) : "The program stopped.";
    message = message.replace(/this practice/g, "this playground").replace(/before running the tests/g, "before running").replace(/running the tests/g, "running");
    l3Message(message, "error");
    const match = /^Line (\d+):/.exec(message);
    if (match) l3ShowLine(Number(match[1]));
  }

  function l3Sleep(ms, token) {
    return new Promise(resolve => {
      let acc = 0;
      let last = performance.now();
      function frame(now) {
        if (l3.token !== token) { resolve(); return; }
        if (l3.pauseWhenDone && l3.flow === "running") { resolve(); return; }
        if (l3.flow === "paused") {
          l3.resume = function () {
            last = performance.now();
            l3.resume = null;
            requestAnimationFrame(frame);
          };
          return;
        }
        const dt = Math.min(40, now - last);
        last = now;
        acc += dt * l3Speed();
        if (acc >= ms) resolve();
        else requestAnimationFrame(frame);
      }
      requestAnimationFrame(frame);
    }).then(() => {
      if (l3.token !== token) throw l3Abort();
    });
  }

  function l3Ease(t) {
    return t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2;
  }

  function l3Animate(duration, token, draw) {
    return new Promise(resolve => {
      let acc = 0;
      let last = performance.now();
      function frame(now) {
        if (l3.token !== token) { resolve(); return; }
        if (l3.flow === "paused") {
          l3.resume = function () {
            last = performance.now();
            l3.resume = null;
            requestAnimationFrame(frame);
          };
          return;
        }
        const dt = Math.min(40, now - last);
        last = now;
        acc += dt * l3Speed();
        const t = duration <= 0 ? 1 : Math.min(1, acc / duration);
        draw(l3Ease(t));
        if (t >= 1) resolve();
        else requestAnimationFrame(frame);
      }
      requestAnimationFrame(frame);
    }).then(() => {
      if (l3.token !== token) throw l3Abort();
    });
  }

  async function l3Turn(delta, token) {
    const start = l3.robot.heading;
    if (Math.abs(delta) < 0.001) {
      await l3Sleep(140, token);
      return;
    }
    const duration = Math.min(1700, Math.max(280, Math.abs(delta) / 170 * 1000));
    await l3Animate(duration, token, eased => {
      l3.robot.heading = start + delta * eased;
      l3PlaceRobot();
    });
    l3.robot.heading = start + delta;
    l3PlaceRobot();
  }

  function l3FloatVar(name, env, line) {
    const rec = env.lookup(name);
    if (!rec) throw vex.cppError(line, name + " has not been declared. Declare it with float before using it.");
    if (!rec.initialized) throw vex.cppError(line, name + " has no starting value yet. Initialize it before using it.");
    if (rec.type !== "float") throw vex.cppError(line, name + " must be a float.");
  }

  function l3GripMatch(stmt) {
    if (stmt.name !== "ArmMotor.spinToPosition" && stmt.name !== "ClawMotor.spinToPosition") return null;
    const arg = stmt.args[0];
    if (!arg || arg.kind !== "ident") return null;
    let step = null;
    for (let i = 0; i < L3_GRIP_STEPS.length; i++) {
      if (L3_GRIP_STEPS[i].name === arg.name) step = L3_GRIP_STEPS[i];
    }
    if (!step) return null;
    const motor = stmt.name.indexOf("Arm") === 0 ? "Arm" : "Claw";
    if (step.motor !== motor) {
      const which = step.motor === "Arm" ? "ArmMotor" : "ClawMotor";
      return { error: "use " + which + ".spinToPosition(" + step.name + ", degrees, true);" };
    }
    return { step: step };
  }

  async function l3Shake(token) {
    await l3Animate(460, token, eased => {
      const amp = Math.sin(eased * Math.PI * 6) * (1 - eased);
      l3.shakeX = amp * 3.6;
      l3.shakeY = amp * 2.6;
      l3.shakeRot = amp * 8;
      l3PlaceRobot();
    });
    l3.shakeX = 0;
    l3.shakeY = 0;
    l3.shakeRot = 0;
    l3PlaceRobot();
  }

  function l3CommitGrip() {
    if (l3.intent === "release" && l3.held) {
      const piece = l3Piece(l3.held);
      const id = l3.held;
      if (piece) {
        piece.x = l3.robot.x;
        piece.y = l3.robot.y;
      }
      l3.held = 0;
      l3Action("Released CAN " + id);
    } else if (l3.intent === "grab" && l3.grabTarget) {
      l3.held = l3.grabTarget;
      l3Action("Grabbed CAN " + l3.held);
    } else {
      l3Action("Gripper finished. No can here.");
    }
    l3.grip = 0;
    l3.intent = "";
    l3.phase = "";
    l3.grabTarget = 0;
    l3RenderMap();
  }

  async function l3Drive(distance, token) {
    const startX = l3.robot.x;
    const startY = l3.robot.y;
    const vec = l3Vector(l3.robot.heading);
    const endX = startX + vec.x * distance;
    const endY = startY + vec.y * distance;
    l3Push(startX, startY);
    if (Math.abs(distance) < 0.001) {
      await l3Sleep(140, token);
      return;
    }
    const duration = Math.min(1900, Math.max(320, Math.abs(distance) / 1050 * 1000));
    await l3Animate(duration, token, eased => {
      l3.robot.x = startX + (endX - startX) * eased;
      l3.robot.y = startY + (endY - startY) * eased;
      l3PlaceRobot();
      l3SetTrail();
    });
    l3.robot.x = endX;
    l3.robot.y = endY;
    l3Push(endX, endY);
    l3PlaceRobot();
    l3SetTrail();
  }

  function l3MentionExpr(expr, env) {
    if (!expr) throw new Error("This expression is missing a value.");
    if (expr.kind === "literal") return;
    if (expr.kind === "ident") {
      const rec = env.lookup(expr.name);
      if (!rec) throw vex.cppError(expr.line, expr.name + " has not been declared. Declare it with int, float, or bool before using it.");
      if (!rec.initialized) throw vex.cppError(expr.line, expr.name + " has no starting value yet. Initialize it before using it.");
      return;
    }
    if (expr.kind === "unary") {
      l3MentionExpr(expr.expr, env);
      return;
    }
    if (expr.kind === "binary") {
      l3MentionExpr(expr.left, env);
      l3MentionExpr(expr.right, env);
      return;
    }
    if (expr.kind === "assignExpr") {
      const rec = env.lookup(expr.name);
      if (!rec) throw vex.cppError(expr.line, expr.name + " has not been declared. Declare it with int, float, or bool before using it.");
      if (rec.isConst) throw vex.cppError(expr.line, expr.name + " is const, so its value cannot be changed.");
      l3MentionExpr(expr.expr, env);
      return;
    }
    throw vex.cppError(expr.line, "this expression is not supported in this practice.");
  }

  function l3ReadExpr(expr, env) {
    l3MentionExpr(expr, env);
    return vex.evalExpr(expr, env);
  }

  function l3Number(expr, env) {
    const value = l3ReadExpr(expr, env);
    if (!value || value.type === "enum" || value.type === "bool") {
      throw vex.cppError(expr.line, "this argument needs a number.");
    }
    const n = vex.numericValue(value);
    if (typeof n !== "number" || !Number.isFinite(n)) throw vex.cppError(expr.line, "this argument needs a number.");
    return n;
  }

  function l3Enum(expr, env, allowed, message) {
    const value = l3ReadExpr(expr, env);
    if (!value || value.type !== "enum" || allowed.indexOf(value.value) === -1) throw vex.cppError(expr.line, message);
    return value.value;
  }

  function l3Bool(expr, env) {
    const value = l3ReadExpr(expr, env);
    if (!value || value.type !== "bool") throw vex.cppError(expr.line, "the last argument is true or false.");
    return value.value;
  }

  function l3GripOpen(grip, line) {
    if (!grip || grip.mask === 0) return;
    throw vex.cppError(grip.line || line, "Finish the gripper before the robot moves or turns. The four steps are arm down, claw open, claw closed, then arm up.");
  }

  function l3InspectCall(stmt, env, grip, live) {
    const name = stmt.name;
    const args = stmt.args;
    if (name === "Drivetrain.turnFor") {
      if (live) l3GripOpen(grip, stmt.line);
      if (args.length < 3 || args.length > 4) throw vex.cppError(stmt.line, "use Drivetrain.turnFor(left, angle, degrees, true);");
      const dir = l3Enum(args[0], env, ["left", "right"], "the first argument is left or right.");
      const angle = l3Number(args[1], env);
      l3Enum(args[2], env, ["degrees"], "the turn is measured in degrees.");
      if (args.length === 4) l3Bool(args[3], env);
      return { grip: grip, kind: "turn", dir: dir, angle: angle, action: "Turning " + dir + " " + vex.formatValue("float", angle) + "°" };
    }
    if (name === "Drivetrain.driveFor") {
      if (live) l3GripOpen(grip, stmt.line);
      if (args.length < 3 || args.length > 4) throw vex.cppError(stmt.line, "use Drivetrain.driveFor(forward, distance, mm);");
      const dir = l3Enum(args[0], env, ["forward", "reverse"], "the first argument is forward or reverse.");
      const distance = l3Number(args[1], env);
      l3Enum(args[2], env, ["mm"], "the distance is measured in mm.");
      if (args.length === 4) l3Bool(args[3], env);
      return { grip: grip, kind: "drive", dir: dir, distance: distance, action: "Driving " + dir + " " + vex.formatValue("float", distance) + " mm" };
    }
    if (name === "ArmMotor.spinToPosition" || name === "ClawMotor.spinToPosition") {
      if (args.length < 2 || args.length > 3) throw vex.cppError(stmt.line, "use spinToPosition(angle, degrees, true);");
      const matched = l3GripMatch(stmt);
      if (matched && matched.error) throw vex.cppError(stmt.line, matched.error);
      l3Enum(args[1], env, ["degrees"], "the angle is measured in degrees.");
      if (args.length === 3) l3Bool(args[2], env);
      if (matched) {
        const step = matched.step;
        l3FloatVar(step.name, env, stmt.line);
        if (live && grip.mask !== step.need) {
          throw vex.cppError(stmt.line, "The gripper steps go in order: arm down, claw open, claw closed, then arm up.");
        }
        let next = { mask: grip.mask | step.bit, line: stmt.line };
        let commit = false;
        if (next.mask === 15) {
          next = { mask: 0, line: 0 };
          commit = true;
        }
        return { grip: next, kind: "grip", commit: commit, arm: step.need === 0, phase: step.phase, action: step.action };
      }
      if (live && grip.mask !== 0) {
        throw vex.cppError(stmt.line, "Finish the gripper before another motor command. The four steps are arm down, claw open, claw closed, then arm up.");
      }
      const angle = l3Number(args[0], env);
      const which = name.indexOf("Arm") === 0 ? "Arm" : "Claw";
      return { grip: grip, kind: "motor", action: which + " to " + vex.formatValue("float", angle) + "°" };
    }
    if (name === "wait") {
      if (args.length !== 2) throw vex.cppError(stmt.line, "use wait(5.0, seconds);");
      const time = l3Number(args[0], env);
      l3Enum(args[1], env, ["seconds"], "wait uses seconds.");
      if (time < 0) throw vex.cppError(stmt.line, "wait needs a time of 0 or more seconds.");
      return { grip: grip, kind: "wait", time: time, action: "Waiting " + vex.formatValue("float", time) + " seconds" };
    }
    throw vex.cppError(stmt.line, "this playground runs Drivetrain.turnFor, Drivetrain.driveFor, ArmMotor.spinToPosition, ClawMotor.spinToPosition, and wait.");
  }

  async function l3Call(stmt, env, token) {
    const step = l3InspectCall(stmt, env, { mask: l3.grip, line: l3.gripLine }, true);
    if (step.arm) {
      if (l3.held) {
        l3.intent = "release";
        l3.grabTarget = 0;
      } else {
        const here = l3CanHere();
        l3.intent = here ? "grab" : "none";
        l3.grabTarget = here ? here.id : 0;
      }
    }
    if (step.phase) l3.phase = step.phase;
    l3Action(step.action);
    if (step.kind === "turn") {
      await l3Turn(step.dir === "left" ? step.angle : -step.angle, token);
      return;
    }
    if (step.kind === "drive") {
      await l3Drive(step.dir === "reverse" ? -step.distance : step.distance, token);
      return;
    }
    if (step.kind === "grip") {
      l3.gripLine = stmt.line;
      await l3Sleep(80, token);
      l3.grip = step.grip.mask;
      l3.gripLine = step.grip.line;
      if (step.commit) {
        l3CommitGrip();
        await l3Shake(token);
      }
      return;
    }
    if (step.kind === "motor") {
      await l3Sleep(160, token);
      return;
    }
    if (step.kind === "wait") await l3Sleep(time * 1000, token);
  }

  function l3CloneEnv(env) {
    const copy = new vex.Environment();
    env.stack.forEach(map => {
      const next = new Map();
      map.forEach((rec, name) => {
        next.set(name, {
          type: rec.type,
          value: rec.value,
          isConst: !!rec.isConst,
          initialized: !!rec.initialized
        });
      });
      copy.stack.push(next);
    });
    return copy;
  }

  function l3CheckStmt(stmt, env) {
    vex.resetSteps();
    if (!stmt || stmt.kind === "empty") return;
    if (stmt.kind === "block") {
      env.push();
      try { l3CheckSequence(stmt.stmts, env); }
      finally { env.pop(); }
      return;
    }
    if (stmt.kind === "if") {
      const taken = vex.isTruthy(l3ReadExpr(stmt.cond, env));
      const snap = l3CloneEnv(env);
      l3CheckStmt(stmt.then, taken ? env : snap);
      if (stmt.else) l3CheckStmt(stmt.else, taken ? snap : env);
      return;
    }
    if (stmt.kind === "decl") {
      let stored = null;
      let ready = false;
      if (stmt.init) {
        stored = vex.coerce(stmt.type, l3ReadExpr(stmt.init, env), stmt);
        ready = true;
      }
      env.declare(stmt.name, stmt.type, stored, stmt.isConst, ready, stmt.line);
      return;
    }
    if (stmt.kind === "assign") {
      l3MentionExpr(stmt.expr, env);
      vex.assignVariable(stmt.name, stmt.expr, env, stmt);
      return;
    }
    if (stmt.kind === "call") {
      l3InspectCall(stmt, env, { mask: 0, line: 0 }, false);
      return;
    }
    if (stmt.kind === "return") throw vex.cppError(stmt.line, "return is not used here. The statements run from top to bottom.");
    throw vex.cppError(stmt.line, "this statement is not supported in this playground.");
  }

  function l3CheckSequence(stmts, env) {
    for (let i = 0; i < stmts.length; i++) l3CheckStmt(stmts[i], env);
  }

  function l3CheckProgram(program) {
    vex.resetSteps();
    const env = new vex.Environment();
    env.push();
    l3CheckSequence(program.stmts || [], env);
  }

  async function l3Begin(stmt, token) {
    if (l3.token !== token) throw l3Abort();
    while (l3.flow === "paused") {
      await new Promise(resolve => { l3.resume = resolve; });
      if (l3.token !== token) throw l3Abort();
    }
    if (l3.token !== token) throw l3Abort();
    l3ShowLine(stmt.line);
  }

  async function l3End(token, env) {
    if (l3.token !== token) throw l3Abort();
    if (env) l3RenderVarsFrom(env);
    if (l3.flow === "stepping" || l3.pauseWhenDone) {
      l3.pauseWhenDone = false;
      l3.flow = "paused";
      l3UpdateButtons();
      return;
    }
    if (l3.flow === "running") await l3Sleep(100, token);
    if (l3.token !== token) throw l3Abort();
    if (l3.pauseWhenDone || l3.flow === "stepping") {
      l3.pauseWhenDone = false;
      l3.flow = "paused";
      l3UpdateButtons();
    }
  }

  async function l3ExecList(stmts, env, token) {
    for (let i = 0; i < stmts.length; i++) await l3Exec(stmts[i], env, token);
  }

  async function l3Exec(stmt, env, token) {
    if (l3.token !== token) throw l3Abort();
    if (!stmt || stmt.kind === "empty") return;
    if (stmt.kind === "block") {
      env.push();
      try { await l3ExecList(stmt.stmts, env, token); }
      finally { env.pop(); }
      return;
    }
    await l3Begin(stmt, token);
    if (stmt.kind === "decl") {
      let stored = null;
      let ready = false;
      if (stmt.init) {
        stored = vex.coerce(stmt.type, vex.evalExpr(stmt.init, env), stmt);
        ready = true;
      }
      env.declare(stmt.name, stmt.type, stored, stmt.isConst, ready, stmt.line);
      l3Action(ready ? "Declare " + stmt.name + " = " + vex.formatValue(stmt.type, stored) : "Declare " + stmt.name);
      await l3End(token, env);
      return;
    }
    if (stmt.kind === "assign") {
      vex.assignVariable(stmt.name, stmt.expr, env, stmt);
      const rec = env.lookup(stmt.name);
      l3Action("Set " + stmt.name + " to " + vex.formatValue(rec.type, rec.value));
      await l3End(token, env);
      return;
    }
    if (stmt.kind === "if") {
      const cond = vex.evalExpr(stmt.cond, env);
      l3Action(vex.isTruthy(cond) ? "if condition is true" : "if condition is false");
      await l3End(token, env);
      if (l3.token !== token) throw l3Abort();
      if (vex.isTruthy(cond)) await l3Exec(stmt.then, env, token);
      else if (stmt.else) await l3Exec(stmt.else, env, token);
      return;
    }
    if (stmt.kind === "call") {
      await l3Call(stmt, env, token);
      await l3End(token, env);
      return;
    }
    if (stmt.kind === "return") throw vex.cppError(stmt.line, "return is not used here. The statements run from top to bottom.");
    throw vex.cppError(stmt.line, "this statement is not supported in this playground.");
  }

  async function l3Run(token) {
    const program = l3.program;
    if (!program) {
      l3.flow = "done";
      l3UpdateButtons();
      return;
    }
    vex.resetSteps();
    l3Home();
    l3RenderMap();
    l3ClearChrome();
    l3Message("", "");
    const env = new vex.Environment();
    env.push();
    try {
      await l3ExecList(program.stmts || [], env, token);
      if (l3.token !== token) return;
      if (l3.grip !== 0) {
        throw vex.cppError(l3.gripLine, "Finish the gripper before the robot moves or turns. The four steps are arm down, claw open, claw closed, then arm up.");
      }
      if (l3.flow === "paused") {
        await new Promise(resolve => { l3.resume = resolve; });
        if (l3.token !== token) return;
      }
      l3ClearLine();
      l3Action("");
      const label = document.getElementById("l3-line");
      if (label) label.textContent = "Done";
      l3.flow = "done";
      const outside = l3OffField();
      l3Message("Finished. The robot is " + l3PoseString() + "." + (outside ? " It is outside the 1800 mm by 1000 mm field." : ""), outside ? "error" : "ok");
    } catch (err) {
      if (!err || err.abort || l3.token !== token) return;
      l3.flow = "done";
      l3ShowError(err);
      l3RenderVarsFrom(env);
    }
    if (l3.token === token) l3UpdateButtons();
  }

  function l3Start(stepping) {
    l3Halt();
    l3.flow = stepping ? "stepping" : "running";
    const token = l3.token;
    l3UpdateButtons();
    l3Run(token);
  }

  function l3OnRun() {
    if (l3.flow === "paused") {
      l3.pauseWhenDone = false;
      l3.flow = "running";
      const go = l3.resume;
      l3.resume = null;
      if (go) go();
      l3UpdateButtons();
      return;
    }
    if (!l3Compile()) {
      l3Home();
      l3RenderMap();
      l3Action("");
      l3.varText = null;
      l3RenderVarRows([]);
      l3.flow = "done";
      l3UpdateButtons();
      return;
    }
    l3Start(false);
  }

  function l3OnCompile() {
    const busy = l3.flow === "running" || l3.flow === "stepping" || l3.flow === "paused";
    if (busy) {
      l3Halt();
      l3Home();
      l3RenderMap();
      l3ClearChrome();
    }
    if (!l3Compile()) return;
    l3Message("Compiled. Step through the program, or Run it.", "ok");
  }

  function l3OnPause() {
    if (l3.flow !== "running" && l3.flow !== "stepping") return;
    l3.flow = "paused";
    l3UpdateButtons();
  }

  function l3OnStep() {
    if (!l3.compiled || !l3.program) return;
    if (l3.flow === "idle" || l3.flow === "done") {
      l3Start(true);
      return;
    }
    if (l3.flow === "paused") {
      l3.pauseWhenDone = true;
      l3.flow = "stepping";
      const go = l3.resume;
      l3.resume = null;
      if (go) go();
      l3UpdateButtons();
      return;
    }
    if (l3.flow === "running") l3.pauseWhenDone = true;
  }

  function l3OnReset() {
    l3Halt();
    l3Home();
    l3RenderMap();
    l3ClearChrome();
    l3Message("The robot is at (0, 0), facing east.", "info");
    l3UpdateButtons();
  }

  function l3PosKey() {
    return l3.cans.map(c => c.x + "," + c.y + "," + c.dx + "," + c.dy).join("|");
  }

  function l3Shuffle(list) {
    const a = list.slice();
    for (let i = a.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      const tmp = a[i];
      a[i] = a[j];
      a[j] = tmp;
    }
    return a;
  }

  function l3Crossings() {
    const pts = [];
    [0, 900, 1800].forEach(x => {
      [0, 500, 1000].forEach(y => {
        if (x === 0 && y === 0) return;
        pts.push({ x: x, y: y });
      });
    });
    return pts;
  }

  function l3CommitMap(prefix) {
    l3Halt();
    l3Home();
    l3SaveMap();
    l3RenderLegend();
    l3RenderMap();
    l3ClearChrome();
    const result = l3ApplyNumbers(false);
    let extra = " Use Copy map numbers into code so your variables match the picture.";
    if (result.changed) extra = " Updated the map numbers in your code.";
    else if (result.found) extra = " The map numbers in your code already match.";
    l3Message(prefix + extra, "info");
    l3UpdateButtons();
  }

  function l3CopyDefault() {
    L3_DEFAULT.forEach((c, i) => {
      l3.cans[i].id = c.id;
      l3.cans[i].x = c.x;
      l3.cans[i].y = c.y;
      l3.cans[i].dx = c.dx;
      l3.cans[i].dy = c.dy;
      l3.cans[i].p = c.p;
    });
  }

  function initLevel3Playground() {
    l3.cans = l3LoadMap();
    l3Home();
    let saved = "";
    try { saved = localStorage.getItem(L3_CODE_KEY) || ""; } catch (err) { saved = ""; }
    if (saved && !l3HasStudentLogic(saved)) saved = "";
    l3SetCode(saved ? l3ShapeGenerated(saved) : l3Starter());
    l3SaveMap();
    l3RenderLegend();
    l3RenderMap();
    l3UpdateButtons();
    l3SyncSpeed();

    const area = document.getElementById("l3-code");
    const pre = document.querySelector("#l3-editor .code-highlight");
    let lock = false;
    function mirror(from, to) {
      if (lock) return;
      lock = true;
      to.scrollTop = from.scrollTop;
      to.scrollLeft = from.scrollLeft;
      lock = false;
    }
    area.addEventListener("scroll", () => mirror(area, pre));
    pre.addEventListener("scroll", () => mirror(pre, area));
    area.addEventListener("input", () => {
      vex.refreshEditorHighlight(area);
      try { localStorage.setItem(L3_CODE_KEY, area.value); } catch (err) { /* storage may be blocked */ }
      if (l3.silent) return;
      const wasCompiled = l3.compiled;
      l3.compiled = false;
      l3.program = null;
      const running = l3.flow === "running" || l3.flow === "stepping" || l3.flow === "paused";
      if (running) {
        l3Halt();
        l3Home();
        l3RenderMap();
        l3ClearChrome();
        l3Message("Code changed. Compile again, then Run or Step. The robot starts from (0, 0).", "info");
      } else if (wasCompiled) {
        l3ClearLine();
        l3Message("Code changed. Compile again before Step.", "info");
      }
      l3UpdateButtons();
    });
    area.addEventListener("keydown", event => {
      if (event.key === "Tab") {
        event.preventDefault();
        const start = area.selectionStart;
        const end = area.selectionEnd;
        const insert = "    ";
        area.value = area.value.slice(0, start) + insert + area.value.slice(end);
        area.selectionStart = area.selectionEnd = start + insert.length;
        area.dispatchEvent(new Event("input"));
      } else if (event.key === "Enter" && (event.ctrlKey || event.metaKey)) {
        event.preventDefault();
        l3OnRun();
      }
    });

    document.getElementById("l3-run").addEventListener("click", l3OnRun);
    document.getElementById("l3-compile").addEventListener("click", l3OnCompile);
    document.getElementById("l3-pause").addEventListener("click", l3OnPause);
    document.getElementById("l3-step").addEventListener("click", l3OnStep);
    document.getElementById("l3-reset").addEventListener("click", l3OnReset);
    document.getElementById("l3-copy").addEventListener("click", () => {
      const result = l3ApplyNumbers(true);
      if (result.inserted) l3Message("Copied the map numbers into your code.", "info");
      else if (result.changed) l3Message("Updated the map numbers in your code.", "info");
      else l3Message("The map numbers in your code already match the picture.", "info");
    });
    document.getElementById("l3-speed").addEventListener("input", l3SyncSpeed);
    document.getElementById("l3-vars-toggle").addEventListener("click", () => {
      const panel = document.getElementById("l3-vars");
      const button = document.getElementById("l3-vars-toggle");
      const open = panel.hidden;
      panel.hidden = !open;
      button.setAttribute("aria-expanded", open ? "true" : "false");
      button.textContent = open ? "Hide variables" : "Show variables";
    });
    document.getElementById("l3-size").addEventListener("click", () => {
      const editor = document.getElementById("l3-editor");
      const tall = editor.classList.toggle("l3-tall");
      const button = document.getElementById("l3-size");
      button.setAttribute("aria-pressed", tall ? "true" : "false");
      button.setAttribute("aria-label", tall ? "Shorter code" : "Taller code");
    });
    document.getElementById("l3-rand-pos").addEventListener("click", () => {
      const before = l3PosKey();
      for (let attempt = 0; attempt < 8; attempt++) {
        const pts = l3Shuffle(l3Crossings());
        l3.cans.forEach((c, i) => {
          c.x = pts[i].x;
          c.y = pts[i].y;
          c.dx = pts[i + 3].x;
          c.dy = pts[i + 3].y;
        });
        if (l3PosKey() !== before) break;
      }
      l3CommitMap("New crossings.");
    });
    document.getElementById("l3-rand-pri").addEventListener("click", () => {
      const before = l3.cans.map(c => c.p).join(",");
      for (let attempt = 0; attempt < 8; attempt++) {
        const nums = l3Shuffle([1, 2, 3, 4, 5, 6, 7, 8, 9]);
        l3.cans[0].p = nums[0];
        l3.cans[1].p = nums[1];
        l3.cans[2].p = nums[2];
        if (l3.cans.map(c => c.p).join(",") !== before) break;
      }
      l3CommitMap("New priorities.");
    });
    document.getElementById("l3-handout").addEventListener("click", () => {
      l3CopyDefault();
      l3CommitMap("Handout map.");
    });
  }

  initLevel3Playground();
})();
