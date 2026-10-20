// Level 1 and Level 2 playgrounds: the handout number-line track and a line-by-line driveFor run.
(function () {
  const vex = window.vexCppRun;
  if (!vex) return;

  const COLORS = { A: "#d1495b", B: "#1f7a8c", C: "#d98c00" };
  const BEGIN = [
    "/**********************************************************",
    " * *** Auto-generated variables for the map above ***",
    " * *** BEGIN ***",
    " **********************************************************/"
  ].join("\n");
  const END = [
    "/**********************************************************",
    " * *** END ***",
    " **********************************************************/",
  ].join("\n");

  function mount(cfg) {
    if (!document.getElementById(cfg.root)) return;
    const P = cfg.prefix;

    function id(name) { return P + "-" + name; }
    function node(name) { return document.getElementById(id(name)); }

    const s = {
      map: Object.assign({}, cfg.defaults),
      mm: 0,
      trail: [0],
      visited: {},
      fuelNow: null,
      capNow: null,
      program: null,
      compiled: false,
      token: 0,
      flow: "idle",
      pauseWhenDone: false,
      resume: null,
      varText: null,
      silent: false,
      console: ""
    };

    function literal(n) {
      return (Math.round(Number(n) * 10) / 10).toFixed(1);
    }

    function fieldValue(field) {
      if (field.key) return literal(s.map[field.key]);
      return field.fixed;
    }

    function starterValues() {
      const values = {};
      cfg.groups.forEach(group => {
        group.forEach(field => { values[field.name] = fieldValue(field); });
      });
      return values;
    }

    function generated(values) {
      const lines = [BEGIN];
      cfg.groups.forEach((group, index) => {
        if (index) lines.push("");
        group.forEach(field => {
          lines.push((field.isConst ? "const " : "") + "float " + field.name + " = " + values[field.name] + ";");
        });
      });
      lines.push(END);
      return lines.join("\n");
    }

    function starter() {
      return generated(starterValues());
    }

    function knownNames() {
      const names = {};
      cfg.groups.forEach(group => group.forEach(field => { names[field.name] = field; }));
      return names;
    }

    function shape(source) {
      let text = String(source || "").replace(/\r\n/g, "\n").split(BEGIN).join("").split(END).join("");
      const noise = [
        /^\/\/ Map numbers for the picture above\.\s*$/,
        /^\/\/ TODO: experimentally determine these values\.\s*$/,
        /^\/\/ Your delivery code starts here\.\s*$/
      ];
      const names = knownNames();
      const values = {};
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
      const defaults = starterValues();
      Object.keys(defaults).forEach(name => {
        if (values[name] == null || values[name] === "") values[name] = defaults[name];
      });
      const block = generated(values);
      const rest = remain.join("\n").replace(/^\n+|\n+$/g, "").replace(/\n{3,}/g, "\n\n");
      return rest ? block + "\n\n" + rest : block;
    }

    function hasLogic(source) {
      const code = String(source).replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/.*$/gm, "");
      return /\b(if|else|Drivetrain|wait|for|while|printf)\b/.test(code);
    }

    function mapFields() {
      const fields = [];
      cfg.groups.forEach(group => group.forEach(field => {
        if (field.key) fields.push(field);
      }));
      return fields;
    }

    function setCode(value) {
      const area = node("code");
      s.silent = true;
      area.value = value;
      vex.refreshEditorHighlight(area);
      s.silent = false;
      try { localStorage.setItem(cfg.codeKey, value); } catch (err) { /* storage may be blocked */ }
      s.compiled = false;
      s.program = null;
      if (s.flow === "running" || s.flow === "stepping" || s.flow === "paused") {
        halt();
        home();
        render();
        clearChrome();
      }
      updateButtons();
    }

    function applyNumbers(insertMissing) {
      const area = node("code");
      let source = area.value.replace(/\r\n/g, "\n");
      const before = source;
      let found = 0;
      const missing = [];
      mapFields().forEach(field => {
        const re = new RegExp("(^|\\n)([ \\t]*)(const[ \\t]+)?(int|float)[ \\t]+" + field.name + "[ \\t]*=[ \\t]*[^;\\n]*;", "g");
        let hit = false;
        source = source.replace(re, (m, lead, indent, constPart, foundType) => {
          hit = true;
          const useConst = field.isConst ? "const " : (constPart || "");
          const useType = foundType === "int" && !field.isConst ? "int" : "float";
          return lead + indent + useConst + useType + " " + field.name + " = " + literal(s.map[field.key]) + ";";
        });
        if (hit) found += 1;
        else missing.push(field);
      });
      let inserted = false;
      if (insertMissing && missing.length) {
        source = missing.map(field => (field.isConst ? "const " : "") + "float " + field.name + " = " + literal(s.map[field.key]) + ";").join("\n") + "\n" + source;
        inserted = true;
      }
      const next = insertMissing ? shape(source) : source;
      const changed = next !== before;
      if (changed) setCode(insertMissing ? next : shape(source));
      if (insertMissing && before.indexOf("*** BEGIN ***") === -1) inserted = true;
      return { found: found, inserted: inserted, changed: changed };
    }

    function saveMap() {
      try { localStorage.setItem(cfg.mapKey, JSON.stringify(s.map)); } catch (err) { /* storage may be blocked */ }
    }

    function loadMap() {
      const map = Object.assign({}, cfg.defaults);
      try {
        const raw = JSON.parse(localStorage.getItem(cfg.mapKey) || "null");
        if (raw && typeof raw === "object") {
          Object.keys(map).forEach(key => {
            const n = Number(raw[key]);
            if (Number.isFinite(n)) map[key] = n;
          });
        }
      } catch (err) { /* keep the handout targets */ }
      return map;
    }

    function home() {
      s.mm = 0;
      s.trail = [0];
      s.visited = {};
      s.fuelNow = s.map.F;
      s.capNow = s.map.K;
      s.console = "";
      paintConsole();
    }

    function paintConsole() {
      const el = node("console");
      if (!el) return;
      el.textContent = s.console;
      el.scrollTop = el.scrollHeight;
    }

    function speed() {
      const input = node("speed");
      const v = input ? Number(input.value) : 1;
      return Number.isFinite(v) && v > 0 ? v : 1;
    }

    function syncSpeed() {
      const label = node("speed-label");
      if (!label) return;
      const v = speed();
      label.textContent = (Math.round(v * 10) % 10 === 0 ? String(Math.round(v)) : v.toFixed(1)) + "×";
    }

    function message(text, kind) {
      const el = node("msg");
      if (!el) return;
      if (!text) { el.hidden = true; el.textContent = ""; el.className = "l3-msg"; return; }
      el.hidden = false;
      el.className = "l3-msg " + (kind || "info");
      el.textContent = text;
    }

    function metrics() {
      const pre = document.querySelector("#" + id("editor") + " .code-highlight");
      const cs = pre ? getComputedStyle(pre) : null;
      return { pre: pre, lh: cs ? (parseFloat(cs.lineHeight) || 22) : 22, pad: cs ? (parseFloat(cs.paddingTop) || 12) : 12 };
    }

    function showLine(n) {
      const bar = node("current");
      const m = metrics();
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
            const area = node("code");
            if (area) area.scrollTop = next;
          }
        }
      }
    }

    function clearLine() {
      const bar = node("current");
      if (bar) bar.hidden = true;
    }

    function renderRows(rows) {
      const host = node("vars");
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

    function renderVars(env) {
      if (!env) { renderRows([]); return; }
      const map = new Map();
      env.stack.forEach(scope => scope.forEach((rec, name) => map.set(name, rec)));
      const rows = [];
      map.forEach((rec, name) => {
        if (rec.initialized) rows.push({ name: name, value: vex.formatValue(rec.type, rec.value) });
      });
      const prev = s.varText;
      const next = {};
      rows.forEach(row => {
        next[row.name] = row.value;
        row.changed = !!(prev && prev[row.name] !== row.value);
      });
      s.varText = next;
      renderRows(rows);
      const fuel = map.get("fuel");
      const cap = map.get("kTankCapacity");
      if (fuel && fuel.initialized) s.fuelNow = vex.numericValue(fuel);
      if (cap && cap.initialized) s.capNow = vex.numericValue(cap);
    }

    function clearChrome() {
      clearLine();
      s.varText = null;
      renderRows([]);
    }

    function updateButtons() {
      const run = node("run");
      const pause = node("pause");
      const step = node("step");
      if (run) run.textContent = s.flow === "paused" ? "Resume" : "Run";
      if (pause) pause.disabled = s.flow !== "running" && s.flow !== "stepping";
      if (step) step.disabled = !s.compiled;
    }

    function svgText(x, y, text, extra) {
      return "<text x=\"" + x + "\" y=\"" + y + "\" " + (extra || "") + ">" + String(text) + "</text>";
    }

    function render() {
      const host = node("map");
      if (!host) return;
      const W = 760;
      const H = cfg.fuel ? 168 : 132;
      const padL = 86;
      const padR = 24;
      const trackY = 62;
      const trackH = 28;
      const X = mm => padL + (Math.max(0, Math.min(1000, mm)) / 1000) * (W - padL - padR);
      let svg = "<svg viewBox=\"0 0 " + W + " " + H + "\" xmlns=\"http://www.w3.org/2000/svg\" font-family=\"Segoe UI, Arial, sans-serif\">";
      if (cfg.fuel) {
        svg += "<rect x=\"18\" y=\"" + (trackY - 2) + "\" width=\"18\" height=\"28\" rx=\"3\" fill=\"#1e8e4e\"/>";
        svg += "<rect x=\"22\" y=\"" + (trackY + 2) + "\" width=\"10\" height=\"8\" rx=\"1\" fill=\"#fff\"/>";
        svg += "<path d=\"M36," + (trackY + 6) + " q8,2 6,12 l0,6\" stroke=\"#1e8e4e\" stroke-width=\"2.5\" fill=\"none\"/>";
        svg += svgText(27, trackY - 8, "FUEL", "text-anchor=\"middle\" font-size=\"9.5\" font-weight=\"700\" fill=\"#1e8e4e\"");
      }
      svg += "<rect x=\"" + X(0) + "\" y=\"" + trackY + "\" width=\"" + (X(1000) - X(0)) + "\" height=\"" + trackH + "\" fill=\"#8f99a6\" stroke=\"#5d6672\"/>";
      svg += "<line x1=\"" + X(0) + "\" y1=\"" + (trackY + trackH / 2) + "\" x2=\"" + X(1000) + "\" y2=\"" + (trackY + trackH / 2) + "\" stroke=\"#fff\" stroke-width=\"2\" stroke-dasharray=\"10 8\"/>";
      if (s.trail.length > 1) {
        const pts = s.trail.map(mm => X(mm) + "," + (trackY + trackH / 2)).join(" ");
        svg += "<polyline points=\"" + pts + "\" fill=\"none\" stroke=\"#16324f\" stroke-width=\"3\" stroke-linecap=\"round\" stroke-linejoin=\"round\"/>";
      }
      for (let v = 0; v <= 1000; v += 50) {
        const major = v % 100 === 0;
        svg += "<line x1=\"" + X(v) + "\" y1=\"" + (trackY + trackH) + "\" x2=\"" + X(v) + "\" y2=\"" + (trackY + trackH + (major ? 8 : 4)) + "\" stroke=\"#333\"/>";
        if (major) svg += svgText(X(v), trackY + trackH + 20, v, "text-anchor=\"middle\" font-size=\"10\" fill=\"#333\"");
      }
      svg += svgText(padL - 28, trackY + trackH + 20, "mm", "text-anchor=\"end\" font-size=\"10\" font-weight=\"700\" fill=\"#333\"");
      ["A", "B", "C"].forEach(letter => {
        const v = s.map[letter];
        const x = X(v);
        const ring = s.visited[letter] ? " stroke=\"#16324f\" stroke-width=\"3\"" : "";
        svg += "<line x1=\"" + x + "\" y1=\"52\" x2=\"" + x + "\" y2=\"" + (trackY + trackH) + "\" stroke=\"" + COLORS[letter] + "\" stroke-width=\"1.4\" stroke-dasharray=\"6 4\" opacity=\"0.85\"/>";
        svg += "<circle cx=\"" + x + "\" cy=\"16\" r=\"12\"" + ring + " fill=\"" + COLORS[letter] + "\"/>";
        svg += svgText(x, 21, letter, "text-anchor=\"middle\" font-size=\"14\" font-weight=\"700\" fill=\"#fff\"");
        svg += "<rect x=\"" + (x - 25) + "\" y=\"31\" width=\"50\" height=\"15\" rx=\"3\" fill=\"#fff\"/>";
        svg += svgText(x, 43, v + " mm", "text-anchor=\"middle\" font-size=\"11.5\" font-weight=\"700\" fill=\"" + COLORS[letter] + "\"");
        svg += "<path d=\"M" + (x - 5) + "," + (trackY - 7) + " L" + (x + 5) + "," + (trackY - 7) + " L" + x + "," + (trackY - 1) + " z\" fill=\"" + COLORS[letter] + "\"/>";
        svg += "<rect x=\"" + (x - 2) + "\" y=\"" + trackY + "\" width=\"4\" height=\"" + trackH + "\" fill=\"" + COLORS[letter] + "\" stroke=\"#fff\" stroke-width=\"0.8\"/>";
      });
      const rx = X(s.mm);
      svg += "<rect x=\"" + (rx - 11) + "\" y=\"" + (trackY + 4) + "\" width=\"20\" height=\"18\" rx=\"3\" fill=\"#16324f\"/>";
      svg += "<path d=\"M" + (rx + 9) + "," + (trackY + 6) + " L" + (rx + 16) + "," + (trackY + 13) + " L" + (rx + 9) + "," + (trackY + 20) + " z\" fill=\"#16324f\"/>";
      if (cfg.fuel) {
        const cap = Number.isFinite(s.capNow) && s.capNow > 0 ? s.capNow : (s.map.K || 1);
        const fuel = Number.isFinite(s.fuelNow) ? s.fuelNow : s.map.F;
        const frac = Math.max(0, Math.min(1, fuel / cap));
        const barX = padL;
        const barY = trackY + trackH + 36;
        const barW = X(1000) - X(0);
        svg += "<rect x=\"" + barX + "\" y=\"" + barY + "\" width=\"" + barW + "\" height=\"10\" rx=\"3\" fill=\"#e8f6ee\" stroke=\"#1e8e4e\"/>";
        svg += "<rect x=\"" + barX + "\" y=\"" + barY + "\" width=\"" + (barW * frac) + "\" height=\"10\" rx=\"3\" fill=\"" + (fuel < 0 ? "#c62828" : "#1e8e4e") + "\"/>";
        svg += svgText(barX, barY + 24, "fuel " + literal(fuel) + " / " + literal(cap), "font-size=\"11\" font-weight=\"700\" fill=\"" + (fuel < 0 ? "#c62828" : "#1e8e4e") + "\"");
      }
      svg += "</svg>";
      host.innerHTML = svg;
    }

    function noteVisit() {
      ["A", "B", "C"].forEach(letter => {
        if (Math.abs(s.mm - s.map[letter]) <= 1.5) s.visited[letter] = true;
      });
    }

    function abort() {
      const err = new Error("stopped");
      err.abort = true;
      return err;
    }

    function halt() {
      s.token += 1;
      s.flow = "idle";
      s.pauseWhenDone = false;
      const go = s.resume;
      s.resume = null;
      if (go) go();
    }

    function showError(err) {
      let text = err && err.message ? String(err.message) : "The program stopped.";
      text = text.replace(/this practice/g, "this playground").replace(/before running the tests/g, "before running").replace(/running the tests/g, "running");
      message(text, "error");
      const match = /^Line (\d+):/.exec(text);
      if (match) showLine(Number(match[1]));
    }

    function readExpr(expr, env) {
      if (!expr) throw new Error("This expression is missing a value.");
      if (expr.kind === "ident") {
        const rec = env.lookup(expr.name);
        if (!rec) throw vex.cppError(expr.line, expr.name + " has not been declared. Declare it with int, float, or bool before using it.");
        if (!rec.initialized) throw vex.cppError(expr.line, expr.name + " has no starting value yet. Initialize it before using it.");
      } else if (expr.kind === "unary") readExpr(expr.expr, env);
      else if (expr.kind === "binary") { readExpr(expr.left, env); readExpr(expr.right, env); }
      else if (expr.kind === "assignExpr") {
        const rec = env.lookup(expr.name);
        if (!rec) throw vex.cppError(expr.line, expr.name + " has not been declared. Declare it with int, float, or bool before using it.");
        if (rec.isConst) throw vex.cppError(expr.line, expr.name + " is const, so its value cannot be changed.");
        readExpr(expr.expr, env);
      }
      return vex.evalExpr(expr, env);
    }

    function numberArg(expr, env) {
      const value = readExpr(expr, env);
      if (!value || value.type === "enum" || value.type === "bool") throw vex.cppError(expr.line, "this argument needs a number.");
      const n = vex.numericValue(value);
      if (typeof n !== "number" || !Number.isFinite(n)) throw vex.cppError(expr.line, "this argument needs a number.");
      return n;
    }

    function enumArg(expr, env, allowed, text) {
      const value = readExpr(expr, env);
      if (!value || value.type !== "enum" || allowed.indexOf(value.value) === -1) throw vex.cppError(expr.line, text);
      return value.value;
    }

    function formatSpec(spec, value, line) {
      if (spec === "s") {
        if (value.type === "string") return value.value;
        if (value.type === "bool") return value.value ? "true" : "false";
        if (typeof value.value === "number" && Number.isFinite(value.value)) return literal(value.value);
        throw vex.cppError(line, "%s needs text or a number.");
      }
      if (spec === "d" || spec === "i" || spec === "f") {
        const n = value.type === "bool" ? (value.value ? 1 : 0) : value.value;
        if (typeof n !== "number" || !Number.isFinite(n)) throw vex.cppError(line, "%" + spec + " needs a number.");
        return spec === "f" ? literal(n) : String(Math.trunc(n));
      }
      throw vex.cppError(line, "printf does not use %" + spec + " here. Use %d, %f, or %s.");
    }

    function formatPrintf(fmt, values, line) {
      let out = "";
      let i = 0;
      let ai = 0;
      while (i < fmt.length) {
        if (fmt.charAt(i) !== "%") { out += fmt.charAt(i); i++; continue; }
        const spec = fmt.charAt(i + 1);
        if (!spec) throw vex.cppError(line, "printf has a % with nothing after it.");
        if (spec === "%") { out += "%"; i += 2; continue; }
        if (ai >= values.length) throw vex.cppError(line, "printf is missing a value for %" + spec + ".");
        out += formatSpec(spec, values[ai], line);
        ai++;
        i += 2;
      }
      return out;
    }

    function printCall(stmt, env, live) {
      const args = stmt.args || [];
      if (!args.length) throw vex.cppError(stmt.line, "printf needs a message in quotes, such as printf(\"Hello\\n\");");
      const fmt = readExpr(args[0], env);
      if (!fmt || fmt.type !== "string") throw vex.cppError(stmt.line, "printf starts with text in quotes, such as printf(\"Hello\\n\");");
      const values = [];
      for (let i = 1; i < args.length; i++) values.push(readExpr(args[i], env));
      const text = formatPrintf(fmt.value, values, stmt.line);
      if (live) {
        s.console += text;
        paintConsole();
      }
      return null;
    }

    function inspectCall(stmt, env, live) {
      const args = stmt.args;
      if (stmt.name === "printf") return printCall(stmt, env, live);
      if (stmt.name !== "Drivetrain.driveFor") {
        throw vex.cppError(stmt.line, "this playground runs Drivetrain.driveFor.");
      }
      if (args.length < 3 || args.length > 4) throw vex.cppError(stmt.line, "use Drivetrain.driveFor(forward, distance, mm);");
      const dir = enumArg(args[0], env, ["forward", "reverse"], "the first argument is forward or reverse.");
      const distance = numberArg(args[1], env);
      enumArg(args[2], env, ["mm"], "the distance is measured in mm.");
      if (args.length === 4) {
        const flag = readExpr(args[3], env);
        if (!flag || flag.type !== "bool") throw vex.cppError(args[3].line, "the last argument is true or false.");
      }
      return { dir: dir, distance: distance };
    }

    function cloneEnv(env) {
      const copy = new vex.Environment();
      env.stack.forEach(map => {
        const next = new Map();
        map.forEach((rec, name) => next.set(name, { type: rec.type, value: rec.value, isConst: !!rec.isConst, initialized: !!rec.initialized }));
        copy.stack.push(next);
      });
      return copy;
    }

    function checkStmt(stmt, env) {
      vex.resetSteps();
      if (!stmt || stmt.kind === "empty") return;
      if (stmt.kind === "block") {
        env.push();
        try { (stmt.stmts || []).forEach(item => checkStmt(item, env)); }
        finally { env.pop(); }
        return;
      }
      if (stmt.kind === "if") {
        const taken = vex.isTruthy(readExpr(stmt.cond, env));
        const snap = cloneEnv(env);
        checkStmt(stmt.then, taken ? env : snap);
        if (stmt.else) checkStmt(stmt.else, taken ? snap : env);
        return;
      }
      if (stmt.kind === "decl") {
        let stored = null;
        let ready = false;
        if (stmt.init) {
          stored = vex.coerce(stmt.type, readExpr(stmt.init, env), stmt);
          ready = true;
        }
        env.declare(stmt.name, stmt.type, stored, stmt.isConst, ready, stmt.line);
        return;
      }
      if (stmt.kind === "assign") {
        readExpr(stmt.expr, env);
        vex.assignVariable(stmt.name, stmt.expr, env, stmt);
        return;
      }
      if (stmt.kind === "call") {
        inspectCall(stmt, env, false);
        return;
      }
      if (stmt.kind === "return") throw vex.cppError(stmt.line, "return is not used here. The statements run from top to bottom.");
      throw vex.cppError(stmt.line, "this statement is not supported in this playground.");
    }

    function compile() {
      const source = node("code").value;
      try {
        if (!source.trim()) throw new Error("Write some statements before compiling.");
        const program = vex.parseCpp(source, true, { calls: true, limit: 50000 });
        vex.resetSteps();
        const env = new vex.Environment();
        env.push();
        (program.stmts || []).forEach(stmt => checkStmt(stmt, env));
        s.program = program;
        s.compiled = true;
        clearLine();
        updateButtons();
        return program;
      } catch (err) {
        s.program = null;
        s.compiled = false;
        updateButtons();
        showError(err);
        return null;
      }
    }

    function sleep(ms, token) {
      return new Promise(resolve => {
        let acc = 0;
        let last = performance.now();
        function frame(now) {
          if (s.token !== token) { resolve(); return; }
          const dt = now - last;
          last = now;
          if (s.flow !== "paused") acc += dt * speed();
          if (acc >= ms) resolve();
          else requestAnimationFrame(frame);
        }
        requestAnimationFrame(frame);
      });
    }

    function animate(ms, token, draw) {
      return new Promise(resolve => {
        let acc = 0;
        let last = performance.now();
        function frame(now) {
          if (s.token !== token) { resolve(); return; }
          const dt = now - last;
          last = now;
          if (s.flow !== "paused") acc += dt * speed();
          const t = Math.max(0, Math.min(1, ms <= 0 ? 1 : acc / ms));
          const eased = t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2;
          draw(eased);
          if (t >= 1) resolve();
          else requestAnimationFrame(frame);
        }
        requestAnimationFrame(frame);
      });
    }

    async function drive(delta, token) {
      const start = s.mm;
      const end = start + delta;
      if (Math.abs(delta) < 0.001) {
        await sleep(140, token);
        return;
      }
      const duration = Math.min(1900, Math.max(320, Math.abs(delta) / 1050 * 1000));
      await animate(duration, token, eased => {
        s.mm = start + (end - start) * eased;
        render();
      });
      s.mm = end;
      s.trail.push(end);
      noteVisit();
      render();
    }

    async function begin(stmt, token) {
      if (s.token !== token) throw abort();
      while (s.flow === "paused") {
        await new Promise(resolve => { s.resume = resolve; });
        if (s.token !== token) throw abort();
      }
      showLine(stmt.line);
    }

    async function end(token, env) {
      if (s.token !== token) throw abort();
      if (env) renderVars(env);
      render();
      if (s.flow === "stepping" || s.pauseWhenDone) {
        s.pauseWhenDone = false;
        s.flow = "paused";
        updateButtons();
        return;
      }
      if (s.flow === "running") await sleep(100, token);
    }

    async function exec(stmt, env, token) {
      if (s.token !== token) throw abort();
      if (!stmt || stmt.kind === "empty") return;
      if (stmt.kind === "block") {
        env.push();
        try {
          for (let i = 0; i < stmt.stmts.length; i++) await exec(stmt.stmts[i], env, token);
        } finally { env.pop(); }
        return;
      }
      await begin(stmt, token);
      if (stmt.kind === "decl") {
        let stored = null;
        let ready = false;
        if (stmt.init) {
          stored = vex.coerce(stmt.type, vex.evalExpr(stmt.init, env), stmt);
          ready = true;
        }
        env.declare(stmt.name, stmt.type, stored, stmt.isConst, ready, stmt.line);
        await end(token, env);
        return;
      }
      if (stmt.kind === "assign") {
        vex.assignVariable(stmt.name, stmt.expr, env, stmt);
        await end(token, env);
        return;
      }
      if (stmt.kind === "if") {
        const cond = vex.evalExpr(stmt.cond, env);
        await end(token, env);
        if (s.token !== token) throw abort();
        if (vex.isTruthy(cond)) await exec(stmt.then, env, token);
        else if (stmt.else) await exec(stmt.else, env, token);
        return;
      }
      if (stmt.kind === "call") {
        const step = inspectCall(stmt, env, true);
        if (step) {
          const delta = (step.dir === "reverse" ? -1 : 1) * step.distance;
          await drive(delta, token);
        }
        await end(token, env);
        return;
      }
      if (stmt.kind === "return") throw vex.cppError(stmt.line, "return is not used here. The statements run from top to bottom.");
      throw vex.cppError(stmt.line, "this statement is not supported in this playground.");
    }

    async function run(token) {
      const program = s.program;
      if (!program) { s.flow = "done"; updateButtons(); return; }
      vex.resetSteps();
      home();
      render();
      clearChrome();
      message("", "");
      const env = new vex.Environment();
      env.push();
      try {
        for (let i = 0; i < (program.stmts || []).length; i++) await exec(program.stmts[i], env, token);
        if (s.token !== token) return;
        if (s.flow === "paused") {
          await new Promise(resolve => { s.resume = resolve; });
          if (s.token !== token) return;
        }
        clearLine();
        const outside = s.mm < -0.5 || s.mm > 1000.5;
        message("Finished. The robot is at " + literal(s.mm) + " mm." + (outside ? " It is off the track." : ""), outside ? "error" : "ok");
      } catch (err) {
        if (!err || err.abort || s.token !== token) return;
        s.flow = "done";
        showError(err);
        renderVars(env);
      }
      if (s.token === token) updateButtons();
    }

    function start(stepping) {
      halt();
      s.flow = stepping ? "stepping" : "running";
      const token = s.token;
      updateButtons();
      run(token);
    }

    function onRun() {
      if (s.flow === "paused") {
        s.pauseWhenDone = false;
        s.flow = "running";
        const go = s.resume;
        s.resume = null;
        if (go) go();
        updateButtons();
        return;
      }
      if (!compile()) {
        home();
        render();
        clearChrome();
        s.flow = "done";
        updateButtons();
        return;
      }
      start(false);
    }

    function onCompile() {
      if (s.flow === "running" || s.flow === "stepping" || s.flow === "paused") {
        halt();
        home();
        render();
        clearChrome();
      }
      if (!compile()) return;
      message("Compiled. Step through the program, or Run it.", "ok");
    }

    function onStep() {
      if (!s.compiled || !s.program) return;
      if (s.flow === "idle" || s.flow === "done") { start(true); return; }
      if (s.flow === "paused") {
        s.pauseWhenDone = true;
        s.flow = "stepping";
        const go = s.resume;
        s.resume = null;
        if (go) go();
        updateButtons();
      }
    }

    function positions() {
      const values = [];
      for (let v = 50; v <= 1000; v += 50) values.push(v);
      return values;
    }

    function shuffle(list) {
      const copy = list.slice();
      for (let i = copy.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        const tmp = copy[i];
        copy[i] = copy[j];
        copy[j] = tmp;
      }
      return copy;
    }

    function commit(prefix) {
      halt();
      home();
      saveMap();
      render();
      clearChrome();
      const result = applyNumbers(false);
      let extra = " Use Copy map numbers into code so your variables match the picture.";
      if (result.changed) extra = " Updated the map numbers in your code.";
      else if (result.found) extra = " The map numbers in your code already match.";
      message(prefix + extra, "info");
      updateButtons();
    }

    s.map = loadMap();
    home();
    let saved = "";
    try { saved = localStorage.getItem(cfg.codeKey) || ""; } catch (err) { saved = ""; }
    if (saved && !hasLogic(saved)) saved = "";
    setCode(saved ? shape(saved) : starter());
    saveMap();
    render();
    updateButtons();
    syncSpeed();

    const area = node("code");
    const pre = document.querySelector("#" + id("editor") + " .code-highlight");
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
      try { localStorage.setItem(cfg.codeKey, area.value); } catch (err) { /* storage may be blocked */ }
      if (s.silent) return;
      const wasCompiled = s.compiled;
      s.compiled = false;
      s.program = null;
      const running = s.flow === "running" || s.flow === "stepping" || s.flow === "paused";
      if (running) {
        halt();
        home();
        render();
        clearChrome();
        message("Code changed. Compile again, then Run or Step. The robot starts from 0.", "info");
      } else if (wasCompiled) {
        clearLine();
        message("Code changed. Compile again before Step.", "info");
      }
      updateButtons();
    });
    area.addEventListener("keydown", event => {
      if (event.key === "Tab") {
        event.preventDefault();
        const start = area.selectionStart;
        const end = area.selectionEnd;
        area.value = area.value.slice(0, start) + "    " + area.value.slice(end);
        area.selectionStart = area.selectionEnd = start + 4;
        area.dispatchEvent(new Event("input"));
      } else if (event.key === "Enter" && (event.ctrlKey || event.metaKey)) {
        event.preventDefault();
        onRun();
      }
    });

    node("run").addEventListener("click", onRun);
    node("compile").addEventListener("click", onCompile);
    node("pause").addEventListener("click", () => {
      if (s.flow !== "running" && s.flow !== "stepping") return;
      s.flow = "paused";
      updateButtons();
    });
    node("step").addEventListener("click", onStep);
    node("reset").addEventListener("click", () => {
      halt();
      home();
      render();
      clearChrome();
      s.flow = "idle";
      message("", "");
      updateButtons();
    });
    node("copy").addEventListener("click", () => {
      const result = applyNumbers(true);
      if (result.inserted) message("Copied the map numbers into your code.", "info");
      else if (result.changed) message("Updated the map numbers in your code.", "info");
      else message("The map numbers in your code already match the picture.", "info");
    });
    node("speed").addEventListener("input", syncSpeed);
    node("vars-toggle").addEventListener("click", () => {
      const panel = node("vars");
      const button = node("vars-toggle");
      const open = panel.hidden;
      panel.hidden = !open;
      button.setAttribute("aria-expanded", open ? "true" : "false");
      button.textContent = open ? "Hide variables" : "Show variables";
    });
    node("size").addEventListener("click", () => {
      const editor = node("editor");
      const tall = editor.classList.toggle("l3-tall");
      const button = node("size");
      button.setAttribute("aria-pressed", tall ? "true" : "false");
      button.setAttribute("aria-label", tall ? "Shorter code" : "Taller code");
    });
    node("console-toggle").addEventListener("click", () => {
      const panel = node("console");
      const button = node("console-toggle");
      const open = panel.hidden;
      panel.hidden = !open;
      button.setAttribute("aria-pressed", open ? "true" : "false");
      button.setAttribute("aria-label", open ? "Hide console" : "Show console");
      button.title = open ? "Hide console" : "Show console";
    });
    node("rand").addEventListener("click", () => {
      const before = [s.map.A, s.map.B, s.map.C].join(",");
      let chosen = null;
      for (let attempt = 0; attempt < 80; attempt++) {
        const picked = shuffle(positions());
        const apart = Math.abs(picked[0] - picked[1]) >= 200 && Math.abs(picked[0] - picked[2]) >= 200 && Math.abs(picked[1] - picked[2]) >= 200;
        if (!apart || picked.join(",") === before) continue;
        chosen = picked;
        break;
      }
      if (!chosen) chosen = [200, 500, 900];
      s.map.A = chosen[0];
      s.map.B = chosen[1];
      s.map.C = chosen[2];
      if (cfg.fuel && s.map.K < Math.max(s.map.A, s.map.B, s.map.C)) s.map.K = Math.max(s.map.A, s.map.B, s.map.C);
      if (cfg.fuel && s.map.F > s.map.K) s.map.F = s.map.K;
      commit("New targets.");
    });
    node("handout").addEventListener("click", () => {
      Object.keys(cfg.defaults).forEach(key => { s.map[key] = cfg.defaults[key]; });
      commit("Handout targets.");
    });
    if (cfg.fuel) {
      node("rand-fuel").addEventListener("click", () => {
        const far = Math.max(s.map.A, s.map.B, s.map.C);
        const caps = [];
        for (let k = far; k <= 1000; k += 50) caps.push(k);
        const before = s.map.K + "," + s.map.F;
        for (let attempt = 0; attempt < 8; attempt++) {
          s.map.K = caps[Math.floor(Math.random() * caps.length)];
          const step = Math.max(50, Math.round(s.map.K / 10 / 50) * 50) || 50;
          const fuels = [];
          for (let f = 0; f <= s.map.K; f += step) fuels.push(f);
          if (fuels[fuels.length - 1] !== s.map.K) fuels.push(s.map.K);
          s.map.F = fuels[Math.floor(Math.random() * fuels.length)];
          if (s.map.K + "," + s.map.F !== before) break;
        }
        commit("New fuel.");
      });
    }
  }

  const target = (letter) => ({ name: "target" + letter, key: letter });
  mount({
    root: "level1-playground",
    prefix: "l1",
    codeKey: "vexcpp-level1-code",
    mapKey: "vexcpp-level1-map",
    fuel: false,
    defaults: { A: 600, B: 250, C: 950 },
    groups: [
      [target("A"), target("B"), target("C")],
      [{ name: "start", fixed: "0.0" }]
    ]
  });
  mount({
    root: "level2-playground",
    prefix: "l2",
    codeKey: "vexcpp-level2-code",
    mapKey: "vexcpp-level2-map",
    fuel: true,
    defaults: { K: 900, F: 500, A: 650, B: 150, C: 800 },
    groups: [
      [{ name: "kTankCapacity", key: "K", isConst: true }, { name: "fuel", key: "F" }],
      [target("A"), target("B"), target("C")],
      [{ name: "position", fixed: "0.0" }, { name: "distance", fixed: "0.0" }]
    ]
  });
})();
