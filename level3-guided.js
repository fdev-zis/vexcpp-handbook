(function () {
  const book = window.vexHandbook;
  const vex = window.vexCppRun;
  const root = document.getElementById("guided-root");
  if (!book || !vex || !root) return;

  window.vexGuidedNudges = {};
  const keys = {};
  const tasks = {};
  const hints = {};
  const parts = [];
  let figSeq = 0;

  const P3 = [
    "float desired = heading;",
    "if (canX > x) { desired = 0.0; }",
    "if (canX < x) { desired = 180.0; }",
    "float turn = desired - heading;",
    "if (turn > 180.0) { turn = turn - 360.0; }",
    "if (turn < -180.0) { turn = turn + 360.0; }",
    "Drivetrain.turnFor(left, turn, degrees, true);",
    "heading = desired;",
    "float distance = canX - x;",
    "if (distance < 0.0) { distance = -distance; }",
    "Drivetrain.driveFor(forward, distance, mm);",
    "x = canX;"
  ].join("\n");

  const PIECES = [
    { title: "Pick the best can", from: null },
    { title: "Where that can and its house are", from: null },
    { title: "East–west leg", from: "w3b23" },
    { title: "North–south leg", from: "w3c4" },
    { title: "Pick the can up", from: null },
    { title: "Drive to the house", from: null },
    { title: "Put the can down", from: null },
    { title: "Mark that can done", from: null }
  ];

  function ok(text) { return { text: text, correct: true, nudge: "" }; }
  function no(text, nudge) { return { text: text, correct: false, nudge: nudge }; }
  function choice(letter, text, correct, nudge) {
    return { letter: letter, text: text, correct: correct, nudge: nudge || "" };
  }

  function fillRich(el, text) {
    const re = /`([^`]+)`/g;
    let last = 0;
    let match;
    while ((match = re.exec(text))) {
      if (match.index > last) el.appendChild(document.createTextNode(text.slice(last, match.index)));
      const code = document.createElement("code");
      code.textContent = match[1];
      el.appendChild(code);
      last = match.index + match[0].length;
    }
    if (last < text.length) el.appendChild(document.createTextNode(text.slice(last)));
  }

  function near(a, b) {
    return typeof a === "number" && typeof b === "number" && Math.abs(a - b) < 0.05;
  }

  function normDeg(value) {
    if (typeof value !== "number" || !isFinite(value)) return NaN;
    let turned = value % 360;
    if (turned < 0) turned += 360;
    if (turned < 0.001 || Math.abs(turned - 360) < 0.001) return 0;
    return turned;
  }

  function fmt(value) {
    if (typeof value !== "number" || !isFinite(value)) return "?";
    return vex.formatValue("float", value);
  }

  function readVar(env, name) {
    const rec = env.lookup(name);
    if (!rec || !rec.initialized) return null;
    return rec.value;
  }

  function passCase(title, detail) { return { pass: true, title: title, detail: detail }; }
  function failCase(title, detail) { return { pass: false, title: title, detail: detail }; }

  function enumArg(expr, env, allowed, message) {
    const value = vex.evalExpr(expr, env);
    if (!value || value.type !== "enum" || allowed.indexOf(value.value) < 0) throw vex.cppError(expr.line, message);
    return value.value;
  }

  function numArg(expr, env) {
    const value = vex.evalExpr(expr, env);
    if (!value || (value.type !== "int" && value.type !== "float")) throw vex.cppError(expr.line, "this argument should be a number.");
    return Number(value.value);
  }

  function boolArg(expr, env) {
    const value = vex.evalExpr(expr, env);
    if (!value || value.type !== "bool") throw vex.cppError(expr.line, "the last argument is true or false.");
    return value.value;
  }

  function applyCall(stmt, env, robot, calls) {
    const args = stmt.args;
    if (stmt.name === "Drivetrain.turnFor") {
      if (args.length < 3 || args.length > 4) throw vex.cppError(stmt.line, "use Drivetrain.turnFor(left, angle, degrees, true);");
      const dir = enumArg(args[0], env, ["left", "right"], "the first argument is left or right.");
      const angle = numArg(args[1], env);
      enumArg(args[2], env, ["degrees"], "the turn is measured in degrees.");
      if (args.length === 4) boolArg(args[3], env);
      robot.heading += dir === "left" ? angle : -angle;
      calls.push({ kind: "turn", dir: dir, angle: angle });
      return;
    }
    if (stmt.name === "Drivetrain.driveFor") {
      if (args.length < 3 || args.length > 4) throw vex.cppError(stmt.line, "use Drivetrain.driveFor(forward, distance, mm);");
      const dir = enumArg(args[0], env, ["forward", "reverse"], "the first argument is forward or reverse.");
      const distance = numArg(args[1], env);
      enumArg(args[2], env, ["mm"], "the distance is measured in mm.");
      if (args.length === 4) boolArg(args[3], env);
      const travel = dir === "reverse" ? -distance : distance;
      const rad = robot.heading * Math.PI / 180;
      robot.x += Math.cos(rad) * travel;
      robot.y += Math.sin(rad) * travel;
      calls.push({ kind: "drive", dir: dir, distance: distance });
      return;
    }
    throw vex.cppError(stmt.line, "this station uses Drivetrain.turnFor and Drivetrain.driveFor.");
  }

  function execStmt(stmt, env, robot, calls) {
    if (!stmt || stmt.kind === "empty") return;
    if (stmt.kind === "block") {
      env.push();
      try { stmt.stmts.forEach(item => execStmt(item, env, robot, calls)); }
      finally { env.pop(); }
      return;
    }
    if (stmt.kind === "decl") {
      let value = null;
      let ready = false;
      if (stmt.init) {
        value = vex.coerce(stmt.type, vex.evalExpr(stmt.init, env), stmt);
        ready = true;
      }
      env.declare(stmt.name, stmt.type, value, !!stmt.isConst, ready, stmt.line);
      return;
    }
    if (stmt.kind === "assign") {
      vex.assignVariable(stmt.name, stmt.expr, env, stmt);
      return;
    }
    if (stmt.kind === "if") {
      if (vex.isTruthy(vex.evalExpr(stmt.cond, env))) execStmt(stmt.then, env, robot, calls);
      else if (stmt.else) execStmt(stmt.else, env, robot, calls);
      return;
    }
    if (stmt.kind === "call") {
      applyCall(stmt, env, robot, calls);
      return;
    }
    throw vex.cppError(stmt.line, "this station uses variables, if, and Drivetrain calls.");
  }

  function runProgram(source, decls, prelude) {
    vex.resetSteps();
    const env = new vex.Environment();
    env.push();
    decls.forEach(item => env.declare(item[0], "float", item[1], false, true, 1));
    function declared(name, fallback) {
      for (let i = 0; i < decls.length; i++) if (decls[i][0] === name) return decls[i][1];
      return fallback;
    }
    const robot = { x: declared("x", 0), y: declared("y", 0), heading: declared("heading", 0) };
    const calls = [];
    if (prelude) execSource(prelude, env, robot, calls);
    const mark = calls.length;
    execSource(source, env, robot, calls);
    return { env: env, robot: robot, calls: calls, studentCalls: calls.slice(mark) };
  }

  function execSource(source, env, robot, calls) {
    const program = vex.parseCpp(source, true, { calls: true });
    (program.stmts || []).forEach(stmt => execStmt(stmt, env, robot, calls));
  }

  function bigTurn(calls) {
    for (let i = 0; i < calls.length; i++) {
      if (calls[i].kind === "turn" && Math.abs(calls[i].angle) > 180.001) return Math.abs(calls[i].angle);
    }
    return 0;
  }

  function gradeTurn(source, rows) {
    const cases = rows.map(row => {
      const title = "heading " + row.heading + ", desired " + row.desired;
      try {
        const run = runProgram(source, [
          ["x", 0], ["y", 0], ["canX", 0], ["canY", 0],
          ["heading", row.heading], ["desired", row.desired], ["turn", row.turn]
        ]);
        const turns = run.studentCalls.filter(call => call.kind === "turn");
        const drives = run.studentCalls.filter(call => call.kind === "drive");
        if (drives.length) return failCase(title, "This question only turns.");
        let spun = 0;
        turns.forEach(call => { spun += call.dir === "left" ? call.angle : -call.angle; });
        const notebook = readVar(run.env, "heading");
        const facing = normDeg(run.robot.heading);
        if (!turns.length && Math.abs(row.turn) > 0.001) {
          if (notebook !== null && !near(notebook, row.heading)) return failCase(title, "heading changed in the notebook, and the robot did not turn.");
          return failCase(title, "The robot did not turn, and heading stayed at " + fmt(row.heading) + "°.");
        }
        if (!near(spun, row.turn)) return failCase(title, "The turn command does not use the angle stored in turn.");
        if (!near(facing, normDeg(row.desired))) return failCase(title, "The robot faces " + fmt(facing) + "° but it is not facing desired.");
        if (!near(notebook, row.desired)) return failCase(title, "The robot faces " + fmt(facing) + "° but your notebook says " + fmt(notebook) + "°.");
        return passCase(title, "The robot faces " + fmt(facing) + "° and the notebook agrees.");
      } catch (err) {
        return failCase(title, err.message);
      }
    });
    return { ok: cases.every(row => row.pass), cases: cases };
  }

  function gradeDrive(source, rows) {
    const cases = rows.map(row => {
      const title = "x " + row.x + ", canX " + row.canX + ", heading " + row.heading;
      const startY = 400;
      try {
        const run = runProgram(source, [
          ["x", row.x], ["y", startY], ["canX", row.canX], ["canY", 0],
          ["heading", row.heading], ["distance", row.distance]
        ]);
        const turned = run.studentCalls.some(call => call.kind === "turn" && Math.abs(call.angle) > 0.001);
        if (turned) return failCase(title, "This question only drives. The robot was already facing the right way.");
        const notebookX = readVar(run.env, "x");
        const notebookY = readVar(run.env, "y");
        const notebookH = readVar(run.env, "heading");
        if (!near(run.robot.y, startY) || !near(notebookY, startY)) return failCase(title, "y changed. This drive stays on the east-west street.");
        if (!near(normDeg(run.robot.heading), normDeg(row.heading)) || !near(notebookH, row.heading)) return failCase(title, "heading changed. The robot was already facing the right way.");
        if (!near(notebookX, run.robot.x)) return failCase(title, "The robot is at x = " + fmt(run.robot.x) + " but your notebook says x = " + fmt(notebookX) + ".");
        if (!near(run.robot.x, row.canX)) return failCase(title, "The robot is still at x = " + fmt(run.robot.x) + ".");
        return passCase(title, "The robot and the notebook are both at x = " + fmt(run.robot.x) + ".");
      } catch (err) {
        return failCase(title, err.message);
      }
    });
    return { ok: cases.every(row => row.pass), cases: cases };
  }

  function gradeLeg(source, rows, prelude) {
    const cases = rows.map(row => {
      const title = "Start (" + row.x + ", " + row.y + ") facing " + row.heading + (row.canY == null ? ", canX " + row.canX : ", can (" + row.canX + ", " + row.canY + ")");
      try {
        const decls = [["x", row.x], ["y", row.y], ["heading", row.heading], ["canX", row.canX]];
        if (row.canY != null) decls.push(["canY", row.canY]);
        const run = runProgram(source, decls, prelude);
        const tooFar = bigTurn(prelude ? run.studentCalls : run.calls);
        if (tooFar) return failCase(title, "A turn of " + fmt(tooFar) + "° is more than a half circle.");
        const notebookX = readVar(run.env, "x");
        const notebookY = readVar(run.env, "y");
        const notebookH = readVar(run.env, "heading");
        const facing = normDeg(run.robot.heading);
        if (!near(run.robot.x, row.endX) || !near(run.robot.y, row.endY) || !near(facing, normDeg(row.endH))) {
          return failCase(title, "The robot finished at (" + fmt(run.robot.x) + ", " + fmt(run.robot.y) + "), facing " + fmt(facing) + "°.");
        }
        if (!near(notebookX, run.robot.x) || !near(notebookY, run.robot.y) || !near(normDeg(notebookH), facing)) {
          return failCase(title, "The robot is at (" + fmt(run.robot.x) + ", " + fmt(run.robot.y) + "), facing " + fmt(facing) + "°, but the notebook does not match.");
        }
        return passCase(title, "The robot and the notebook agree at (" + fmt(run.robot.x) + ", " + fmt(run.robot.y) + "), facing " + fmt(facing) + "°.");
      } catch (err) {
        return failCase(title, err.message);
      }
    });
    return { ok: cases.every(row => row.pass), cases: cases };
  }

  const TURN_ROWS = [
    { heading: 90, desired: 0, turn: -90 },
    { heading: 270, desired: 0, turn: 90 },
    { heading: 0, desired: 180, turn: 180 },
    { heading: 0, desired: 0, turn: 0 },
    { heading: 180, desired: 90, turn: -90 }
  ];

  const DRIVE_ROWS = [
    { x: 1200, canX: 300, heading: 180, distance: 900 },
    { x: 0, canX: 900, heading: 0, distance: 900 },
    { x: 500, canX: 500, heading: 90, distance: 0 }
  ];

  const LEG1_ROWS = [
    { x: 0, y: 0, heading: 0, canX: 900, endX: 900, endY: 0, endH: 0 },
    { x: 1200, y: 500, heading: 90, canX: 300, endX: 300, endY: 500, endH: 180 },
    { x: 900, y: 0, heading: 270, canX: 1800, endX: 1800, endY: 0, endH: 0 },
    { x: 900, y: 1000, heading: 0, canX: 0, endX: 0, endY: 1000, endH: 180 },
    { x: 500, y: 200, heading: 90, canX: 500, endX: 500, endY: 200, endH: 90 },
    { x: 1800, y: 1000, heading: 180, canX: 0, endX: 0, endY: 1000, endH: 180 }
  ];

  const LEG2_ROWS = [
    { x: 0, y: 0, heading: 0, canX: 900, canY: 500, endX: 900, endY: 500, endH: 90 },
    { x: 1800, y: 1000, heading: 90, canX: 0, canY: 500, endX: 0, endY: 500, endH: 270 },
    { x: 900, y: 1000, heading: 90, canX: 900, canY: 0, endX: 900, endY: 0, endH: 270 },
    { x: 0, y: 0, heading: 270, canX: 1800, canY: 0, endX: 1800, endY: 0, endH: 0 },
    { x: 500, y: 500, heading: 0, canX: 500, canY: 500, endX: 500, endY: 500, endH: 0 },
    { x: 1800, y: 0, heading: 0, canX: 0, canY: 1000, endX: 0, endY: 1000, endH: 90 }
  ];

  function showResult(block, result) {
    const panel = block.querySelector(".test-results");
    const feedback = block.querySelector(".feedback");
    panel.replaceChildren();
    (result.cases || []).forEach(row => {
      const div = document.createElement("div");
      div.className = "test-case " + (row.pass ? "pass" : "fail");
      const title = document.createElement("div");
      title.className = "test-case-title";
      title.textContent = row.title;
      const detail = document.createElement("div");
      detail.className = "test-case-detail";
      detail.textContent = row.detail;
      div.append(title, detail);
      panel.appendChild(div);
    });
    feedback.style.display = "";
    feedback.className = "feedback " + (result.ok ? "correct" : "wrong");
    feedback.textContent = result.ok ? "✓ All test cases passed." : ("✗ " + (result.error || "Not every test case passed."));
  }

  function isCorrect(id) {
    return !!keys[id] && book.loadSavedAnswers()[id] === keys[id];
  }

  function partFinished(part) {
    return part.ids.every(isCorrect);
  }

  function forcedParts() {
    try {
      const parsed = JSON.parse(sessionStorage.getItem("vexcpp-guided-open") || "[]");
      return Array.isArray(parsed) ? parsed : [];
    } catch (err) {
      return [];
    }
  }

  function copyText(text, button) {
    const previous = button.textContent;
    const done = () => {
      button.textContent = "Copied";
      setTimeout(() => { button.textContent = previous; }, 1200);
    };
    const fallback = () => {
      const area = document.createElement("textarea");
      area.value = text;
      document.body.appendChild(area);
      area.select();
      try { document.execCommand("copy"); done(); } catch (err) { button.textContent = "Copy failed"; }
      area.remove();
    };
    if (navigator.clipboard && navigator.clipboard.writeText) navigator.clipboard.writeText(text).then(done).catch(fallback);
    else fallback();
  }

  function refreshGuide() {
    parts.forEach(part => {
      const done = part.ids.filter(isCorrect).length;
      part.status.textContent = done + " of " + part.ids.length + " finished";
      const locked = !!(part.previous && !partFinished(part.previous));
      const forced = forcedParts().indexOf(part.id) !== -1;
      part.body.hidden = locked && !forced;
      part.lock.hidden = !locked || forced;
      if (locked) part.lockMsg.textContent = "Finish " + part.previous.title + " to open this station.";
    });
    const saved = book.loadSavedCode();
    const panel = document.getElementById("guided-piece-panel");
    const count = document.getElementById("guided-piece-count");
    const collected = [];
    let readyCount = 0;
    panel.replaceChildren();
    const heading = document.createElement("h3");
    heading.textContent = "Your pieces";
    panel.appendChild(heading);
    PIECES.forEach((piece, index) => {
      const row = document.createElement("div");
      row.className = "guided-piece";
      const label = document.createElement("div");
      label.textContent = (index + 1) + ". " + piece.title;
      const side = document.createElement("div");
      const ready = !!(piece.from && isCorrect(piece.from) && saved[piece.from] && String(saved[piece.from]).trim());
      if (ready) {
        readyCount += 1;
        collected.push("// " + piece.title + "\n" + String(saved[piece.from]).trim());
        const button = document.createElement("button");
        button.type = "button";
        button.className = "btn-paper";
        button.textContent = "Copy";
        button.addEventListener("click", () => copyText(String(saved[piece.from]).trim(), button));
        side.appendChild(button);
      } else {
        const note = document.createElement("span");
        note.className = "guided-piece-note";
        note.textContent = piece.from ? "Not collected yet." : "Later in this guided build.";
        side.appendChild(note);
      }
      row.append(label, side);
      panel.appendChild(row);
    });
    const copyAll = document.createElement("button");
    copyAll.type = "button";
    copyAll.className = "btn-run";
    copyAll.textContent = "Copy assembled program";
    copyAll.disabled = collected.length === 0;
    copyAll.addEventListener("click", () => copyText(collected.join("\n\n"), copyAll));
    panel.appendChild(copyAll);
    if (count) count.textContent = "Pieces collected: " + readyCount + " / 8";
    document.querySelectorAll("[data-piece-view]").forEach(view => {
      const note = view.querySelector(".guided-piece-note");
      const code = view.querySelector("code");
      const source = isCorrect("w3b23") ? (saved.w3b23 || "") : "";
      if (String(source).trim()) {
        code.innerHTML = vex.highlightCpp(source);
        note.textContent = "Your east-west leg. These tests run a finished leg 1 first, then the lines below.";
      } else {
        code.textContent = "";
        note.textContent = "Your east-west leg appears here after that piece passes. These tests still run a finished leg 1 first, then your north-south lines.";
      }
    });
  }

  function startPart(id, title, name, previous) {
    const section = document.createElement("div");
    section.className = "guided-part";
    const head = document.createElement("div");
    head.className = "guided-part-head";
    const h = document.createElement("h3");
    h.textContent = title + " · " + name;
    const status = document.createElement("p");
    status.className = "guided-status";
    head.append(h, status);
    const lock = document.createElement("div");
    lock.className = "guided-lock";
    lock.hidden = true;
    const lockMsg = document.createElement("p");
    const openBtn = document.createElement("button");
    openBtn.type = "button";
    openBtn.className = "btn-paper";
    openBtn.textContent = "Open anyway";
    lock.append(lockMsg, openBtn);
    const body = document.createElement("div");
    body.className = "guided-part-body";
    section.append(head, lock, body);
    root.appendChild(section);
    const part = { id: id, title: title, previous: previous, status: status, lock: lock, lockMsg: lockMsg, body: body, ids: [], n: 0 };
    openBtn.addEventListener("click", () => {
      const open = forcedParts();
      if (open.indexOf(id) < 0) open.push(id);
      sessionStorage.setItem("vexcpp-guided-open", JSON.stringify(open));
      refreshGuide();
    });
    parts.push(part);
    return part;
  }

  function addPencil(parent, text) {
    const p = document.createElement("p");
    p.className = "guided-draw";
    p.textContent = "✏️ " + text;
    parent.appendChild(p);
  }

  function addProse(parent, text) {
    const p = document.createElement("p");
    fillRich(p, text);
    parent.appendChild(p);
  }

  function arrange(id, options) {
    const correct = options.filter(opt => opt.correct)[0];
    const wrong = options.filter(opt => !opt.correct);
    const slot = id.charCodeAt(id.length - 1) % options.length;
    const arranged = wrong.slice();
    arranged.splice(slot, 0, correct);
    return arranged.map((opt, index) => ({ letter: "ABCDEF"[index], text: opt.text, nudge: opt.nudge || "", correct: !!opt.correct }));
  }

  function addChoice(part, item, host) {
    const parent = host || part.body;
    const multi = !!item.multi;
    const block = document.createElement("div");
    block.className = "question-block" + (item.optional ? " guided-custom" : "");
    block.setAttribute("data-qid", item.id);
    if (multi) block.setAttribute("data-multi", "true");
    if (item.after) block.setAttribute("data-correct-note", item.after);
    if (item.wrong) block.setAttribute("data-wrong-note", item.wrong);
    const text = document.createElement("div");
    text.className = "question-text";
    if (!item.optional) {
      part.n += 1;
      text.appendChild(document.createTextNode(part.n + ". "));
    }
    fillRich(text, item.prompt);
    block.appendChild(text);
    const options = multi ? item.options : arrange(item.id, item.options);
    const nudges = {};
    const correct = [];
    const list = document.createElement("ul");
    list.className = "options-list";
    options.forEach(opt => {
      if (opt.nudge && !opt.correct) nudges[opt.letter] = opt.nudge;
      if (opt.correct) correct.push(opt.letter);
      const li = document.createElement("li");
      li.className = "option-item";
      const label = document.createElement("label");
      label.className = "option-label";
      const input = document.createElement("input");
      input.type = multi ? "checkbox" : "radio";
      input.name = item.id;
      input.value = opt.letter;
      const span = document.createElement("span");
      fillRich(span, opt.text);
      label.append(input, document.createTextNode(" "), span);
      li.appendChild(label);
      list.appendChild(li);
    });
    window.vexGuidedNudges[item.id] = nudges;
    const answer = correct.slice().sort().join(",");
    if (!item.optional) {
      keys[item.id] = answer;
      part.ids.push(item.id);
    }
    block.appendChild(list);
    const feedback = document.createElement("div");
    feedback.className = "feedback";
    block.appendChild(feedback);
    parent.appendChild(block);
    if (item.optional) {
      const saved = book.loadSavedAnswers()[item.id];
      const paint = value => {
        feedback.style.display = "";
        if (value === answer) {
          feedback.className = "feedback correct";
          feedback.textContent = item.after ? ("✓ Correct! " + item.after) : "✓ Correct! Excellent job.";
        } else {
          feedback.className = "feedback wrong";
          feedback.textContent = nudges[value] ? ("✗ " + nudges[value]) : "✗ Incorrect. Give it another try!";
        }
      };
      block.querySelectorAll("input").forEach(input => {
        if (saved && input.value === saved) input.checked = true;
        input.addEventListener("change", () => {
          book.saveAnswer(item.id, input.value);
          paint(input.value);
          refreshGuide();
        });
      });
      if (saved) paint(saved);
    }
  }

  function addOpen(part, item) {
    part.n += 1;
    part.ids.push(item.id);
    keys[item.id] = "pass";
    const block = document.createElement("div");
    block.className = "question-block guided-custom guided-open";
    block.setAttribute("data-qid", item.id);
    const text = document.createElement("div");
    text.className = "question-text";
    text.appendChild(document.createTextNode(part.n + ". "));
    fillRich(text, item.prompt);
    const area = document.createElement("textarea");
    area.spellcheck = false;
    area.setAttribute("aria-label", "Your answer");
    const savedCode = book.loadSavedCode();
    if (Object.prototype.hasOwnProperty.call(savedCode, item.id)) area.value = savedCode[item.id];
    area.addEventListener("input", () => book.saveCode(item.id, area.value));
    const show = document.createElement("button");
    show.type = "button";
    show.className = "btn-paper";
    show.textContent = "Show model answer";
    const model = document.createElement("div");
    model.className = "guided-model";
    model.hidden = true;
    const modelText = document.createElement("p");
    modelText.textContent = item.model;
    model.appendChild(modelText);
    show.addEventListener("click", () => {
      model.hidden = !model.hidden;
      show.textContent = model.hidden ? "Show model answer" : "Hide model answer";
    });
    const checks = document.createElement("div");
    item.checks.forEach(line => {
      const label = document.createElement("label");
      label.className = "guided-check";
      const input = document.createElement("input");
      input.type = "checkbox";
      label.append(input, document.createTextNode(" " + line));
      checks.appendChild(label);
    });
    const saved = book.loadSavedAnswers()[item.id] === "pass";
    checks.querySelectorAll("input").forEach(input => {
      input.checked = saved;
      input.addEventListener("change", () => {
        const all = [...checks.querySelectorAll("input")].every(box => box.checked);
        if (all) book.saveAnswer(item.id, "pass");
        else book.clearAnswer(item.id);
        refreshGuide();
      });
    });
    block.append(text, area, show, model, checks);
    part.body.appendChild(block);
  }

  function addCells(part, item, mode) {
    part.n += 1;
    part.ids.push(item.id);
    const block = document.createElement("div");
    block.className = "question-block guided-custom";
    block.setAttribute("data-qid", item.id);
    const text = document.createElement("div");
    text.className = "question-text";
    text.appendChild(document.createTextNode(part.n + ". "));
    fillRich(text, item.prompt);
    block.appendChild(text);
    const answers = [];
    const selects = [];
    const rowOf = [];
    if (mode === "table") {
      const table = document.createElement("table");
      table.className = "guided-table";
      const head = document.createElement("tr");
      item.columns.forEach(column => {
        const th = document.createElement("th");
        th.textContent = column;
        head.appendChild(th);
      });
      const thead = document.createElement("thead");
      thead.appendChild(head);
      const tbody = document.createElement("tbody");
      item.rows.forEach((row, rowIndex) => {
        const tr = document.createElement("tr");
        row.forEach(cell => {
          const td = document.createElement("td");
          if (cell && cell.options) {
            answers.push(cell.answer);
            rowOf.push(rowIndex);
            td.appendChild(makeSelect(cell.options, selects));
          } else td.textContent = cell;
          tr.appendChild(td);
        });
        tbody.appendChild(tr);
      });
      table.append(thead, tbody);
      block.appendChild(table);
    } else {
      const box = document.createElement("div");
      box.className = "guided-blanks";
      item.lines.forEach(line => {
        const div = document.createElement("div");
        line.forEach(piece => {
          if (piece && piece.options) {
            answers.push(piece.answer);
            rowOf.push(answers.length - 1);
            div.appendChild(makeSelect(piece.options, selects));
          } else div.appendChild(document.createTextNode(piece));
        });
        box.appendChild(div);
      });
      block.appendChild(box);
    }
    keys[item.id] = answers.join("|");
    const button = document.createElement("button");
    button.type = "button";
    button.className = "btn-run";
    button.textContent = "Check answers";
    const feedback = document.createElement("div");
    feedback.className = "feedback";
    function grade(show) {
      const values = selects.map(select => select.value);
      if (!show && values.every(value => value === "")) return;
      book.saveAnswer(item.id, values.join("|"));
      const wrongAt = values.findIndex((value, index) => value !== answers[index]);
      feedback.style.display = "";
      if (wrongAt < 0) {
        feedback.className = "feedback correct";
        feedback.textContent = item.after ? ("✓ Correct! " + item.after) : "✓ Correct! Excellent job.";
      } else {
        feedback.className = "feedback wrong";
        feedback.textContent = mode === "table"
          ? ("✗ Row " + (rowOf[wrongAt] + 1) + " is not right yet.")
          : ("✗ Blank " + (wrongAt + 1) + " is not right yet.");
      }
      refreshGuide();
    }
    selects.forEach(select => select.addEventListener("change", () => grade(true)));
    button.addEventListener("click", () => grade(true));
    const saved = book.loadSavedAnswers()[item.id];
    if (saved) {
      saved.split("|").forEach((value, index) => { if (selects[index]) selects[index].value = value; });
      grade(true);
    }
    block.append(button, feedback);
    part.body.appendChild(block);
  }

  function makeSelect(options, selects) {
    const select = document.createElement("select");
    select.setAttribute("aria-label", "Choose");
    const blank = document.createElement("option");
    blank.value = "";
    blank.textContent = "Choose";
    select.appendChild(blank);
    options.forEach(option => {
      const node = document.createElement("option");
      node.value = option;
      node.textContent = option;
      select.appendChild(node);
    });
    selects.push(select);
    return select;
  }

  function editorWrap(starter, label) {
    const wrap = document.createElement("div");
    wrap.className = "code-editor-wrap";
    const pre = document.createElement("pre");
    pre.className = "code-highlight";
    pre.setAttribute("aria-hidden", "true");
    pre.appendChild(document.createElement("code"));
    const area = document.createElement("textarea");
    area.className = "code-editor";
    area.spellcheck = false;
    area.autocapitalize = "off";
    area.autocomplete = "off";
    area.autocorrect = "off";
    area.setAttribute("aria-label", label);
    area.value = starter;
    wrap.append(pre, area);
    return { wrap: wrap, area: area };
  }

  function addCode(part, item) {
    part.n += 1;
    part.ids.push(item.id);
    keys[item.id] = "pass";
    tasks[item.id] = { cases: item.cases };
    hints[item.id] = item.hint;
    const block = document.createElement("div");
    block.className = "question-block coding-block";
    block.setAttribute("data-qid", item.id);
    const text = document.createElement("div");
    text.className = "question-text";
    text.appendChild(document.createTextNode(part.n + ". "));
    fillRich(text, item.prompt);
    const editor = editorWrap(item.starter, item.label);
    const button = document.createElement("button");
    button.type = "button";
    button.className = "btn-run";
    button.textContent = "Run tests";
    const results = document.createElement("div");
    results.className = "test-results";
    const feedback = document.createElement("div");
    feedback.className = "feedback";
    block.append(text, editor.wrap, button, results, feedback);
    part.body.appendChild(block);
  }

  function wireRobot(area, run) {
    const block = area.closest(".question-block");
    const qid = block.getAttribute("data-qid");
    vex.refreshEditorHighlight(area);
    area.addEventListener("scroll", () => {
      const pre = area.parentElement.querySelector(".code-highlight");
      if (!pre) return;
      pre.scrollTop = area.scrollTop;
      pre.scrollLeft = area.scrollLeft;
    });
    area.addEventListener("keydown", event => {
      if (event.key === "Tab") {
        event.preventDefault();
        area.setRangeText("    ", area.selectionStart, area.selectionEnd, "end");
        area.dispatchEvent(new Event("input", { bubbles: true }));
      } else if (event.key === "Enter" && (event.ctrlKey || event.metaKey)) {
        event.preventDefault();
        run();
      }
    });
    area.addEventListener("input", () => {
      vex.refreshEditorHighlight(area);
      book.saveCode(qid, area.value);
      book.clearAnswer(qid);
      const feedback = block.querySelector(".feedback");
      feedback.className = "feedback";
      feedback.textContent = "";
      const panel = block.querySelector(".test-results");
      if (panel.childElementCount) {
        const note = document.createElement("p");
        note.className = "test-stale";
        note.textContent = "Code changed. Run the tests again.";
        panel.replaceChildren(note);
      }
      refreshGuide();
    });
  }

  function addRobot(part, item) {
    part.n += 1;
    part.ids.push(item.id);
    keys[item.id] = "pass";
    const block = document.createElement("div");
    block.className = "question-block guided-custom";
    block.setAttribute("data-qid", item.id);
    const text = document.createElement("div");
    text.className = "question-text";
    text.appendChild(document.createTextNode(part.n + ". "));
    fillRich(text, item.prompt);
    block.appendChild(text);
    if (item.readonly) {
      const view = document.createElement("div");
      view.className = "guided-readonly";
      view.setAttribute("data-piece-view", "w3b23");
      const strong = document.createElement("strong");
      strong.textContent = "Leg 1, already written";
      const note = document.createElement("p");
      note.className = "guided-piece-note";
      const pre = document.createElement("pre");
      pre.appendChild(document.createElement("code"));
      view.append(strong, note, pre);
      block.appendChild(view);
    }
    const editor = editorWrap(item.starter, item.label);
    const saved = book.loadSavedCode();
    if (Object.prototype.hasOwnProperty.call(saved, item.id)) editor.area.value = saved[item.id];
    const button = document.createElement("button");
    button.type = "button";
    button.className = "btn-run";
    button.textContent = "Run tests";
    const results = document.createElement("div");
    results.className = "test-results";
    const feedback = document.createElement("div");
    feedback.className = "feedback";
    const hint = document.createElement("details");
    hint.className = "guided-deeper";
    const summary = document.createElement("summary");
    summary.textContent = "Hint";
    const hintText = document.createElement("p");
    hintText.textContent = item.hint;
    hint.append(summary, hintText);
    function run() {
      book.saveCode(item.id, editor.area.value);
      const result = item.grade(editor.area.value);
      showResult(block, result);
      if (result.ok) book.saveAnswer(item.id, "pass");
      else book.clearAnswer(item.id);
      refreshGuide();
    }
    button.addEventListener("click", run);
    block.append(editor.wrap, button, hint, results, feedback);
    part.body.appendChild(block);
    wireRobot(editor.area, run);
    if (book.loadSavedAnswers()[item.id] === "pass") run();
  }

  function svgEl(name, attrs) {
    const node = document.createElementNS("http://www.w3.org/2000/svg", name);
    Object.keys(attrs || {}).forEach(key => node.setAttribute(key, attrs[key]));
    return node;
  }

  function polar(cx, cy, radius, deg) {
    const rad = deg * Math.PI / 180;
    return [cx + radius * Math.cos(rad), cy - radius * Math.sin(rad)];
  }

  function arcPath(cx, cy, radius, start, sweep, ccw) {
    if (sweep <= 0.1) return "";
    const end = ccw ? start + sweep : start - sweep;
    const from = polar(cx, cy, radius, start);
    const to = polar(cx, cy, radius, end);
    const large = sweep > 180 ? 1 : 0;
    const flag = ccw ? 0 : 1;
    return "M " + from[0] + " " + from[1] + " A " + radius + " " + radius + " 0 " + large + " " + flag + " " + to[0] + " " + to[1];
  }

  function drawD1(parent) {
    const fig = document.createElement("figure");
    fig.className = "guided-figure";
    const svg = svgEl("svg", { class: "guided-svg", viewBox: "-180 -90 2140 1220", role: "img" });
    figSeq += 1;
    const capId = "guided-fig-" + figSeq;
    svg.setAttribute("aria-labelledby", capId);
    const field = svgEl("rect", { x: 0, y: 0, width: 1800, height: 1000, fill: "#f8fafc", stroke: "#334155", "stroke-width": 4 });
    svg.appendChild(field);
    [0, 900, 1800].forEach(x => svg.appendChild(svgEl("line", { x1: x, y1: 0, x2: x, y2: 1000, stroke: "#94a3b8", "stroke-width": 3, "stroke-dasharray": "14 12" })));
    [0, 500, 1000].forEach(y => svg.appendChild(svgEl("line", { x1: 0, y1: 1000 - y, x2: 1800, y2: 1000 - y, stroke: "#94a3b8", "stroke-width": 3, "stroke-dasharray": "14 12" })));
    const places = [
      { kind: "can", name: "Can 1", x: 0, y: 500, color: "#d1495b" },
      { kind: "can", name: "Can 2", x: 1800, y: 500, color: "#1f7a8c" },
      { kind: "can", name: "Can 3", x: 900, y: 500, color: "#d98c00" },
      { kind: "house", name: "House 1", x: 1800, y: 1000, color: "#d1495b" },
      { kind: "house", name: "House 2", x: 0, y: 1000, color: "#1f7a8c" },
      { kind: "house", name: "House 3", x: 900, y: 1000, color: "#d98c00" }
    ];
    places.forEach(place => {
      const sy = 1000 - place.y;
      if (place.kind === "can") svg.appendChild(svgEl("circle", { cx: place.x, cy: sy, r: 28, fill: place.color }));
      else svg.appendChild(svgEl("rect", { x: place.x - 32, y: sy - 32, width: 64, height: 64, fill: "none", stroke: place.color, "stroke-width": 8 }));
      const label = svgEl("text", { class: "guided-num", x: place.x + 40, y: sy - 16, "font-size": 32, fill: "#0f172a", visibility: "hidden" });
      label.textContent = place.name + " (" + place.x + ", " + place.y + ")";
      svg.appendChild(label);
    });
    svg.appendChild(svgEl("polygon", { points: "0,988 0,1012 48,1000", fill: "#1e3a8a" }));
    const start = svgEl("text", { x: 60, y: 970, "font-size": 32, fill: "#1e3a8a" });
    start.textContent = "start: x = 0, y = 0, heading = 0";
    svg.appendChild(start);
    svg.appendChild(svgEl("line", { x1: 0, y1: 1048, x2: 260, y2: 1048, stroke: "#0f172a", "stroke-width": 4 }));
    svg.appendChild(svgEl("polygon", { points: "260,1038 284,1048 260,1058", fill: "#0f172a" }));
    const xLabel = svgEl("text", { x: 300, y: 1060, "font-size": 34, fill: "#0f172a" });
    xLabel.textContent = "x (mm), east";
    svg.appendChild(xLabel);
    svg.appendChild(svgEl("line", { x1: -40, y1: 1000, x2: -40, y2: 740, stroke: "#0f172a", "stroke-width": 4 }));
    svg.appendChild(svgEl("polygon", { points: "-50,740 -40,712 -30,740", fill: "#0f172a" }));
    const yLabel = svgEl("text", { x: -150, y: 680, "font-size": 34, fill: "#0f172a" });
    yLabel.textContent = "y (mm), north";
    svg.appendChild(yLabel);
    const controls = document.createElement("div");
    controls.className = "guided-controls";
    const toggle = document.createElement("button");
    toggle.type = "button";
    toggle.className = "btn-paper";
    toggle.textContent = "Show numbers";
    toggle.setAttribute("aria-pressed", "false");
    toggle.addEventListener("click", () => {
      const on = toggle.getAttribute("aria-pressed") !== "true";
      toggle.setAttribute("aria-pressed", on ? "true" : "false");
      toggle.textContent = on ? "Hide numbers" : "Show numbers";
      svg.querySelectorAll(".guided-num").forEach(node => node.setAttribute("visibility", on ? "visible" : "hidden"));
    });
    controls.appendChild(toggle);
    const cap = document.createElement("figcaption");
    cap.id = capId;
    cap.textContent = "The field is 1800 mm east by 1000 mm north. The origin is the south-west corner. Can 1 is at (0, 500), Can 2 at (1800, 500), and Can 3 at (900, 500). House 1 is at (1800, 1000), House 2 at (0, 1000), and House 3 at (900, 1000). The robot starts at (0, 0) facing east. Dashed lines are the streets x = 0, 900, 1800 and y = 0, 500, 1000.";
    fig.append(svg, controls, cap);
    parent.appendChild(fig);
  }

  function drawD2(parent) {
    const fig = document.createElement("figure");
    fig.className = "guided-figure";
    const svg = svgEl("svg", { class: "guided-svg", viewBox: "0 0 360 320", role: "img" });
    figSeq += 1;
    const capId = "guided-fig-" + figSeq;
    svg.setAttribute("aria-labelledby", capId);
    const cx = 180;
    const cy = 168;
    svg.appendChild(svgEl("circle", { cx: cx, cy: cy, r: 92, fill: "none", stroke: "#cbd5e1", "stroke-width": 8 }));
    svg.appendChild(svgEl("line", { x1: cx, y1: cy, x2: cx + 118, y2: cy, stroke: "#94a3b8", "stroke-width": 2 }));
    const arc = svgEl("path", { fill: "none", stroke: "#3730a3", "stroke-width": 8, "stroke-linecap": "round" });
    const arrow = svgEl("polygon", { points: "-16,-8 -16,8 22,0", fill: "#1e3a8a" });
    const angleText = svgEl("text", { x: 180, y: 40, "text-anchor": "middle", "font-size": 22, fill: "#312e81" });
    [["E 0°", 300, 174], ["N 90°", 180, 48], ["W 180°", 42, 174], ["S 270°", 180, 292]].forEach(item => {
      const label = svgEl("text", { x: item[1], y: item[2], "text-anchor": "middle", "font-size": 18, fill: "#334155" });
      label.textContent = item[0];
      svg.appendChild(label);
    });
    svg.append(arc, arrow, angleText);
    function show(heading) {
      arrow.setAttribute("transform", "translate(" + cx + " " + cy + ") rotate(" + (-heading) + ")");
      arc.setAttribute("d", heading ? arcPath(cx, cy, 78, 0, heading, true) : "");
      angleText.textContent = heading + "°";
      controls.querySelectorAll("button").forEach(button => button.setAttribute("aria-pressed", button.dataset.heading === String(heading) ? "true" : "false"));
    }
    const controls = document.createElement("div");
    controls.className = "guided-controls";
    [0, 90, 180, 270].forEach(heading => {
      const button = document.createElement("button");
      button.type = "button";
      button.className = "btn-paper";
      button.dataset.heading = String(heading);
      button.textContent = heading + "°";
      button.addEventListener("click", () => show(heading));
      controls.appendChild(button);
    });
    const cap = document.createElement("figcaption");
    cap.id = capId;
    cap.textContent = "Angles grow counter-clockwise, the direction of a left turn. East is 0°, north is 90°, west is 180°, and south is 270°.";
    show(0);
    fig.append(svg, controls, cap);
    parent.appendChild(fig);
  }

  function drawD3(parent) {
    const fig = document.createElement("figure");
    fig.className = "guided-figure";
    const svg = svgEl("svg", { class: "guided-svg", viewBox: "0 0 360 300", role: "img" });
    figSeq += 1;
    const capId = "guided-fig-" + figSeq;
    svg.setAttribute("aria-labelledby", capId);
    const cx = 180;
    const cy = 150;
    svg.appendChild(svgEl("circle", { cx: cx, cy: cy, r: 78, fill: "none", stroke: "#e2e8f0", "stroke-width": 10 }));
    const leftArc = svgEl("path", { fill: "none", stroke: "#16a34a", "stroke-linecap": "round" });
    const rightArc = svgEl("path", { fill: "none", stroke: "#7c3aed", "stroke-linecap": "round" });
    const nowArrow = svgEl("polygon", { points: "-18,-9 -18,9 28,0", fill: "#2563eb" });
    const needArrow = svgEl("polygon", { points: "-18,-9 -18,9 28,0", fill: "#d98c00" });
    const leftLabel = svgEl("text", { "text-anchor": "middle", "font-size": 16, fill: "#166534" });
    const rightLabel = svgEl("text", { "text-anchor": "middle", "font-size": 16, fill: "#5b21b6" });
    svg.append(leftArc, rightArc, nowArrow, needArrow, leftLabel, rightLabel);
    const controls = document.createElement("div");
    controls.className = "guided-controls";
    function picker(label) {
      const wrap = document.createElement("label");
      wrap.appendChild(document.createTextNode(label + " "));
      const select = document.createElement("select");
      [0, 90, 180, 270].forEach(value => {
        const option = document.createElement("option");
        option.value = String(value);
        option.textContent = value + "°";
        select.appendChild(option);
      });
      wrap.appendChild(select);
      controls.appendChild(wrap);
      return select;
    }
    const now = picker("Now facing");
    const need = picker("Need to face");
    need.value = "90";
    const shorten = document.createElement("label");
    const shortenBox = document.createElement("input");
    shortenBox.type = "checkbox";
    shorten.append(shortenBox, document.createTextNode(" Shorten long turns"));
    controls.appendChild(shorten);
    const readout = document.createElement("p");
    readout.className = "guided-alt";
    function show() {
      const from = Number(now.value);
      const to = Number(need.value);
      nowArrow.setAttribute("transform", "translate(" + cx + " " + cy + ") rotate(" + (-from) + ")");
      needArrow.setAttribute("transform", "translate(" + cx + " " + cy + ") rotate(" + (-to) + ")");
      let left = (to - from) % 360;
      if (left < 0) left += 360;
      const right = left === 0 ? 0 : 360 - left;
      leftArc.setAttribute("d", arcPath(cx, cy, 96, from, left, true));
      rightArc.setAttribute("d", arcPath(cx, cy, 112, from, right, false));
      const leftWider = left < right || (left === right && left > 0);
      leftArc.setAttribute("stroke-width", left === 0 ? 0 : (leftWider || left === right ? 8 : 3));
      rightArc.setAttribute("stroke-width", right === 0 ? 0 : (!leftWider || left === right ? 8 : 3));
      const leftMid = polar(cx, cy, 124, from + left / 2);
      const rightMid = polar(cx, cy, 142, from - right / 2);
      leftLabel.setAttribute("x", leftMid[0]);
      leftLabel.setAttribute("y", leftMid[1]);
      leftLabel.textContent = left ? ("left " + left + "°") : "";
      rightLabel.setAttribute("x", rightMid[0]);
      rightLabel.setAttribute("y", rightMid[1]);
      rightLabel.textContent = right ? ("right " + right + "°") : "";
      const raw = to - from;
      let signed = raw;
      if (signed > 180) signed -= 360;
      if (signed < -180) signed += 360;
      let sentence = "need − now = " + raw;
      if (shortenBox.checked) {
        if (signed === 0) sentence += ". Shortest way: already facing that way, turn = 0.";
        else if (Math.abs(signed) === 180) sentence += ". Shortest way: half a turn either way, turn = 180 or −180.";
        else if (signed > 0) sentence += ". Shortest way: left " + signed + ", turn = " + signed + ".";
        else sentence += ". Shortest way: right " + (-signed) + ", turn = " + signed + ".";
      }
      readout.textContent = sentence;
    }
    now.addEventListener("change", show);
    need.addEventListener("change", show);
    shortenBox.addEventListener("change", show);
    const cap = document.createElement("figcaption");
    cap.id = capId;
    cap.textContent = "The blue arrow is the way the robot faces now. The orange arrow is the way it needs to face. The green arc is a left turn. The purple arc is a right turn. The thicker arc is the shorter one. Positive turn means left.";
    show();
    fig.append(svg, controls, readout, cap);
    parent.appendChild(fig);
  }

  function drawD4(parent) {
    const fig = document.createElement("figure");
    fig.className = "guided-figure";
    const grid = document.createElement("div");
    grid.className = "guided-streets";
    [
      ["North-east", 1200, 700, "East", "North"],
      ["North-west", 100, 700, "West", "North"],
      ["South-east", 1200, 50, "East", "South"],
      ["South-west", 100, 50, "West", "South"]
    ].forEach(item => {
      const svg = svgEl("svg", { class: "guided-svg", viewBox: "0 0 220 170", role: "img" });
      svg.appendChild(svgEl("rect", { x: 8, y: 8, width: 204, height: 140, fill: "#f8fafc", stroke: "#e2e8f0" }));
      [40, 80, 120, 160].forEach(x => svg.appendChild(svgEl("line", { x1: x, y1: 16, x2: x, y2: 140, stroke: "#e2e8f0" })));
      [30, 70, 110].forEach(y => svg.appendChild(svgEl("line", { x1: 16, y1: y, x2: 200, y2: y, stroke: "#e2e8f0" })));
      const rx = 70;
      const ry = 110;
      const cx = 20 + item[1] / 10;
      const cy = 150 - item[2] / 5;
      svg.appendChild(svgEl("line", { x1: rx, y1: ry, x2: cx, y2: ry, stroke: "#3730a3", "stroke-width": 4 }));
      svg.appendChild(svgEl("line", { x1: cx, y1: ry, x2: cx, y2: cy, stroke: "#0f766e", "stroke-width": 4 }));
      svg.appendChild(svgEl("circle", { cx: rx, cy: ry, r: 7, fill: "#1e3a8a" }));
      svg.appendChild(svgEl("circle", { cx: cx, cy: cy, r: 7, fill: "#d1495b" }));
      const rLabel = svgEl("text", { x: rx - 16, y: ry + 16, "font-size": 12, fill: "#1e3a8a" });
      rLabel.textContent = "R";
      const cLabel = svgEl("text", { x: cx + 8, y: cy - 8, "font-size": 12, fill: "#d1495b" });
      cLabel.textContent = "C";
      const one = svgEl("text", { x: (rx + cx) / 2, y: ry - 6, "text-anchor": "middle", "font-size": 12, fill: "#312e81" });
      one.textContent = item[3];
      const two = svgEl("text", { x: cx + 8, y: (ry + cy) / 2, "font-size": 12, fill: "#115e59" });
      two.textContent = item[4];
      const title = svgEl("text", { x: 110, y: 22, "text-anchor": "middle", "font-size": 13, fill: "#334155" });
      title.textContent = item[0];
      svg.append(rLabel, cLabel, one, two, title);
      grid.appendChild(svg);
    });
    const cap = document.createElement("figcaption");
    cap.textContent = "The robot R is at (400, 200). Each panel puts the can C on a different side. The blue arrow is the east-west walk. The green arrow is the north-south walk.";
    fig.append(grid, cap);
    parent.appendChild(fig);
  }

  function drawD5(parent) {
    const steps = [
      { code: "x = 900.0;", robotX: 0, bookX: 900, note: "The notebook changed. The robot stayed.", state: "" },
      { code: "Drivetrain.driveFor(forward, 900.0, mm);", robotX: 900, bookX: 0, note: "The robot moved. The notebook did not.", state: "is-bad", label: "out of sync" },
      { code: "x = 900.0;", robotX: 900, bookX: 900, note: "The assignment caught the notebook up with the robot.", state: "is-good", label: "in sync" }
    ];
    const fig = document.createElement("figure");
    fig.className = "guided-figure";
    const panels = document.createElement("div");
    panels.className = "guided-stepper-panels";
    const robotPanel = document.createElement("div");
    robotPanel.className = "guided-panel";
    const bookPanel = document.createElement("div");
    bookPanel.className = "guided-panel";
    panels.append(robotPanel, bookPanel);
    const code = document.createElement("div");
    code.className = "guided-code-line";
    const note = document.createElement("p");
    note.className = "guided-alt";
    const controls = document.createElement("div");
    controls.className = "guided-controls";
    const prev = document.createElement("button");
    prev.type = "button";
    prev.className = "btn-paper";
    prev.textContent = "Previous";
    const next = document.createElement("button");
    next.type = "button";
    next.className = "btn-paper";
    next.textContent = "Next";
    const progress = document.createElement("span");
    controls.append(prev, next, progress);
    let index = 0;
    function robotSvg(x) {
      const svg = svgEl("svg", { viewBox: "0 0 220 80", class: "guided-svg" });
      svg.appendChild(svgEl("line", { x1: 20, y1: 50, x2: 200, y2: 50, stroke: "#cbd5e1", "stroke-width": 4 }));
      const px = 30 + x / 10;
      svg.appendChild(svgEl("polygon", { points: (px - 14) + ",40 " + (px - 14) + ",58 " + (px + 12) + ",49", fill: "#1e3a8a" }));
      return svg;
    }
    function show() {
      const step = steps[index];
      robotPanel.className = "guided-panel";
      bookPanel.className = "guided-panel " + step.state;
      robotPanel.replaceChildren();
      bookPanel.replaceChildren();
      const robotTitle = document.createElement("strong");
      robotTitle.textContent = "The real robot";
      const bookTitle = document.createElement("strong");
      bookTitle.textContent = "The notebook (variables)" + (step.label ? " · " + step.label : "");
      const bookList = document.createElement("p");
      bookList.textContent = "x = " + step.bookX + ".0, y = 0.0, heading = 0.0";
      robotPanel.append(robotTitle, robotSvg(step.robotX));
      bookPanel.append(bookTitle, bookList);
      code.textContent = step.code;
      note.textContent = step.note;
      progress.textContent = "Step " + (index + 1) + " of 3";
      prev.disabled = index === 0;
      next.disabled = index === steps.length - 1;
    }
    prev.addEventListener("click", () => { index -= 1; show(); });
    next.addEventListener("click", () => { index += 1; show(); });
    const cap = document.createElement("figcaption");
    cap.textContent = "Step 1 changes only the notebook. Step 2 moves only the robot, so the two disagree. Step 3 writes the robot's position back into the notebook.";
    show();
    fig.append(panels, code, controls, note, cap);
    parent.appendChild(fig);
  }

  function drawD6(parent) {
    const fig = document.createElement("figure");
    fig.className = "guided-figure";
    const cards = document.createElement("div");
    cards.className = "guided-streets";
    const priorities = [2, 5, 3];
    const names = ["Can 1", "Can 2", "Can 3"];
    const nodes = names.map((name, index) => {
      const card = document.createElement("div");
      card.className = "guided-panel";
      cards.appendChild(card);
      return card;
    });
    let runs = 0;
    function paint() {
      let best = -1;
      priorities.forEach((value, index) => { if (value > (best < 0 ? -2 : priorities[best])) best = index; });
      nodes.forEach((card, index) => {
        card.replaceChildren();
        const title = document.createElement("strong");
        title.textContent = names[index] + (index === best && priorities[index] >= 0 ? " · chosen" : "");
        const line = document.createElement("p");
        line.textContent = "priority " + priorities[index];
        card.append(title, line);
        card.style.opacity = priorities[index] < 0 ? "0.55" : "1";
      });
    }
    const controls = document.createElement("div");
    controls.className = "guided-controls";
    [1, 2, 3].forEach(run => {
      const button = document.createElement("button");
      button.type = "button";
      button.className = "btn-paper";
      button.textContent = "Run " + run;
      button.addEventListener("click", () => {
        if (run !== runs + 1) return;
        let best = 0;
        priorities.forEach((value, index) => { if (value > priorities[best]) best = index; });
        priorities[best] = -1;
        runs = run;
        paint();
      });
      controls.appendChild(button);
    });
    const cap = document.createElement("figcaption");
    cap.textContent = "Priorities start at 2, 5, and 3. Each run marks the chosen can with priority -1, and the badge moves to the largest priority that is left.";
    paint();
    fig.append(cards, controls, cap);
    parent.appendChild(fig);
  }

  function drawD7(parent) {
    const fig = document.createElement("figure");
    fig.className = "guided-figure";
    const cap = document.createElement("figcaption");
    cap.textContent = "Pickup: arm down, claw open around the can, claw closed on the can, arm up with the can. Drop: arm down with the can, claw open so the can stays down, claw closed, arm up.";
    const grid = document.createElement("div");
    grid.className = "guided-streets";
    ["Arm down", "Claw open", "Claw closed", "Arm up", "Arm down, can held", "Claw open, can down", "Claw closed", "Arm up"].forEach((label, index) => {
      const svg = svgEl("svg", { class: "guided-svg", viewBox: "0 0 160 90", role: "img" });
      svg.appendChild(svgEl("rect", { x: 8, y: 8, width: 144, height: 74, fill: "#f8fafc", stroke: "#e2e8f0" }));
      const up = index === 3 || index === 7;
      const open = index === 1 || index === 5;
      const holding = index === 3 || index === 4;
      const canY = holding ? (up ? 24 : 48) : 58;
      svg.appendChild(svgEl("line", { x1: 30, y1: 70, x2: 78, y2: up ? 28 : 52, stroke: "#334155", "stroke-width": 4 }));
      svg.appendChild(svgEl("line", { x1: 78, y1: up ? 28 : 52, x2: 78, y2: open ? (up ? 18 : 42) : (up ? 34 : 62), stroke: "#334155", "stroke-width": 3 }));
      svg.appendChild(svgEl("line", { x1: 96, y1: up ? 28 : 52, x2: 96, y2: open ? (up ? 18 : 42) : (up ? 34 : 62), stroke: "#334155", "stroke-width": 3 }));
      if (index !== 1) svg.appendChild(svgEl("circle", { cx: 87, cy: canY, r: 7, fill: "#d1495b" }));
      const text = svgEl("text", { x: 80, y: 84, "text-anchor": "middle", "font-size": 11, fill: "#334155" });
      text.textContent = label;
      svg.appendChild(text);
      grid.appendChild(svg);
    });
    fig.append(grid, cap);
    parent.appendChild(fig);
  }

  const drawings = { d1: drawD1, d2: drawD2, d3: drawD3, d4: drawD4, d5: drawD5, d6: drawD6, d7: drawD7 };
  function addDraw(parent, name) { drawings[name](parent); }

  function given(pairs) {
    return pairs.map(pair => "float " + pair[0] + " = " + pair[1] + ";").join("\n");
  }

  function floatCase(title, pairs, name, value, fail, also) {
    const spec = { name: name, type: "float", value: value };
    if (also) spec.also = also;
    return { title: title, given: given(pairs), expect: [spec], fail: fail };
  }

  function build() {
    const dirs = ["North", "East", "South", "West"];
    const headings = ["0", "90", "180", "270", "the current heading"];
    const partA = startPart("A", "Part A", "Reading the map", null);
    addPencil(partA.body, "Draw the field as a rectangle 1800 wide and 1000 high. Mark the robot at the bottom-left corner. Then compare your drawing with the map.");
    addDraw(partA.body, "d1");
    addChoice(partA, {
      id: "w3a1",
      prompt: "Look at `float can1X = 0.0;` and `float can1Y = 500.0;`. What do these two numbers tell the robot?",
      options: [
        ok("Can 1 sits 0 mm east and 500 mm north of the point where the robot starts."),
        no("Can 1 weighs 0 g and is 500 mm tall.", "Nothing in the program mentions weight or height. Where does a can live on the field?"),
        no("The robot must drive 0 mm and then turn 500°.", "These are not actions. They describe a place."),
        no("Can 1 sits 500 mm east and 0 mm north of the start.", "The letters are swapped. X is the east-west position, Y is the north-south position. Check the axes in the picture.")
      ]
    });
    addChoice(partA, {
      id: "w3a2",
      prompt: "`house2X = 0.0` and `house2Y = 1000.0`. In which part of the field is House 2?",
      options: [
        ok("North-west corner."),
        no("North-east corner.", "That is House 1 (1800, 1000). Which way does x grow?"),
        no("South-west corner.", "y = 0 is the south edge. How far north is 1000?"),
        no("Middle of the north edge.", "That is House 3 (900, 1000).")
      ]
    });
    addChoice(partA, {
      id: "w3a3",
      prompt: "The program also starts with `float x = 0.0;`, `float y = 0.0;` and `float heading = 0.0;`. What are these three variables?",
      options: [
        ok("The program's notebook: where it believes the robot is and which way it believes the robot faces."),
        no("Sensor readings that always show the true position.", "The robot has no GPS. These are ordinary variables that hold whatever the program last wrote into them."),
        no("Constants that never change.", "They change every time the robot moves."),
        no("The position of Can 1.", "Can 1 has its own variables.")
      ]
    });
    addChoice(partA, {
      id: "w3a4",
      prompt: "A program contains one line: `x = 900.0;`. What does the real robot do?",
      after: "Moving the robot and updating the notebook are two separate jobs. Your program must do both and keep them in agreement.",
      options: [
        ok("Nothing. Only the notebook changes."),
        no("It drives to x = 900.", "Level 2 said it already: changing a variable does not move the robot. Only Drivetrain calls move it."),
        no("It turns to face east.", "Same: a variable change is not a movement."),
        no("The program stops with an error.", "The line is perfectly legal.")
      ]
    });
    addDraw(partA.body, "d5");
    addChoice(partA, {
      id: "w3a5",
      prompt: "`priority1 = 2`, `priority2 = 5`, `priority3 = 3`. In which order are the cans delivered?",
      options: [
        ok("Can 2, then Can 3, then Can 1."),
        no("Can 1, Can 2, Can 3.", "That is the numbering order. The task says a bigger priority goes first."),
        no("Can 1, Can 3, Can 2.", "That is smallest first."),
        no("Can 2, Can 1, Can 3.", "Compare the last two again: which is bigger, 2 or 3?")
      ]
    });
    addChoice(partA, {
      id: "w3a6",
      prompt: "Our program will use names such as `can2X` instead of typing `1800.0` directly. Why?",
      options: [
        ok("The map can change (Randomize positions). A program that reads the variables works on every map; a program with typed numbers works on one map only."),
        no("Drivetrain calls do not accept typed numbers.", "They do. The question is what happens after Randomize."),
        no("Variables make the robot faster.", "Speed is not affected."),
        no("There is no reason.", "Press \"Randomize positions\" on a program full of typed numbers and watch.")
      ]
    });
    addOpen(partA, {
      id: "w3a7",
      prompt: "The robot is somewhere on the field and a can is somewhere else. List every piece of information the program needs before it plans the trip. For each piece, say which variable holds it.",
      model: "Where the robot is (x and y); which way it faces (heading); where the can is (canX and canY). Heading is needed because the robot can only drive forward in the direction it faces, so it may have to turn first.",
      checks: [
        "I named the robot's position (x, y).",
        "I named the direction it faces (heading).",
        "I named the target position.",
        "I can say why heading matters."
      ]
    });

    const partB = startPart("B", "Part B", "Going to a point, the east-west leg", partA);
    addProse(partB.body, "Thought experiment. You are a delivery driver in a town whose streets form a perfect grid. You stand at one crossing and the can is at another. You can only walk forward along a street, you carry a compass, and you can spin on the spot. There are no shortcuts across the blocks.");
    addDraw(partB.body, "d4");
    addPencil(partB.body, "Draw yourself on one crossing and the can on another before you answer.");
    addOpen(partB, {
      id: "w3b1",
      prompt: "Using only straight walks along streets, how many walks do you need in general? Describe each one.",
      model: "Two. First an east-west walk until you are in the can's column (x = canX), then a north-south walk until you reach the can's row (y = canY). If you already share a row or a column, one walk is enough (or none). Going north-south first would also work on an empty grid; we pick east-west first and always keep that order, so the program has the same shape every time.",
      checks: ["Two walks.", "One along x, one along y.", "I know when one walk is enough."]
    });
    addCells(partB, {
      id: "w3b2",
      prompt: "You stand at (400, 200). For each can position, choose the compass direction of walk 1 (east-west) and walk 2 (north-south).",
      after: "Walk 1 only depends on comparing x with canX. Walk 2 only depends on comparing y with canY.",
      columns: ["Can at", "Walk 1", "Walk 2"],
      rows: [
        ["(1200, 700)", { options: dirs, answer: "East" }, { options: dirs, answer: "North" }],
        ["(100, 700)", { options: dirs, answer: "West" }, { options: dirs, answer: "North" }],
        ["(1200, 50)", { options: dirs, answer: "East" }, { options: dirs, answer: "South" }],
        ["(100, 50)", { options: dirs, answer: "West" }, { options: dirs, answer: "South" }]
      ]
    }, "table");
    addPencil(partB.body, "Draw arrows at 0°, 90°, 180°, and 270° around a dot.");
    addDraw(partB.body, "d2");
    addChoice(partB, {
      id: "w3b3",
      prompt: "In this handbook a heading is an angle measured from the east axis, growing counter-clockwise, the direction of a left turn. An arrow pointing straight down the page (south) has heading…",
      options: [
        ok("270"),
        no("90", "That is north. Which way does a left turn from east go?"),
        no("180", "That is west."),
        no("360", "A full circle brings you back to east, which is 0.")
      ]
    });
    addChoice(partB, {
      id: "w3b4",
      multi: true,
      prompt: "The robot faces north (heading 90). Select every call that leaves it facing east (heading 0).",
      wrong: "Check the angle arithmetic: left adds, right subtracts, and 360 is a full circle.",
      options: [
        choice("A", "`Drivetrain.turnFor(left, 90, degrees, true);`", false, "Left angles add to the heading: 90 + 90 = 180, west."),
        choice("B", "`Drivetrain.turnFor(left, -90, degrees, true);`", true, ""),
        choice("C", "`Drivetrain.turnFor(right, 90, degrees, true);`", true, ""),
        choice("D", "`Drivetrain.turnFor(left, 270, degrees, true);`", true, "90 + 270 = 360, a full circle, east again.")
      ]
    });
    addOpen(partB, {
      id: "w3b5",
      prompt: "B, C and D all end facing east, but D spins the robot 270° while B and C spin it 90°. Why do 270 and −90 give the same final direction? Which would you choose for a competition run, and why?",
      model: "270 and −90 differ by exactly 360°, one full circle, and a full circle brings the robot back to the same direction. B or C is better: a third of the rotation means less time, less wheel slip and less accumulated heading error.",
      checks: ["I mentioned the full circle (360).", "I chose a 90° turn.", "I gave a reason (time, error, wear)."]
    });
    addCells(partB, {
      id: "w3b6",
      prompt: "The robot is at x and the can at canX. Which heading should the robot have for the east-west walk?",
      columns: ["Condition", "Heading"],
      rows: [
        ["canX > x", { options: headings, answer: "0" }],
        ["canX < x", { options: headings, answer: "180" }],
        ["canX == x", { options: headings, answer: "the current heading" }]
      ]
    }, "table");
    addCode(partB, {
      id: "w3b7",
      label: "Create float desired",
      starter: "// Create float desired.\n",
      prompt: "Create `float desired`: the heading the robot needs for the east-west walk. Start it at the robot's current heading and change it only when the robot has to go east or west. `x`, `canX`, and `heading` are already declared.",
      hint: "What should desired be when the robot is already in the right column? Then use two separate if statements, one for canX > x and one for canX < x.",
      cases: [
        floatCase("x 0, canX 900, heading 0", [["x", 0], ["canX", 900], ["heading", 0]], "desired", 0, "desired does not follow the east-west rule for these positions."),
        floatCase("x 900, canX 300, heading 0", [["x", 900], ["canX", 300], ["heading", 0]], "desired", 180, "desired does not follow the east-west rule for these positions."),
        floatCase("x 500, canX 500, heading 90", [["x", 500], ["canX", 500], ["heading", 90]], "desired", 90, "When x and canX are equal, desired should stay at the current heading."),
        floatCase("x 1800, canX 0, heading 90", [["x", 1800], ["canX", 0], ["heading", 90]], "desired", 180, "desired does not follow the east-west rule for these positions."),
        floatCase("x 0, canX 1800, heading 270", [["x", 0], ["canX", 1800], ["heading", 270]], "desired", 0, "desired does not follow the east-west rule for these positions."),
        floatCase("x 700, canX 700, heading 180", [["x", 700], ["canX", 700], ["heading", 180]], "desired", 180, "When x and canX are equal, desired should stay at the current heading.")
      ]
    });
    addChoice(partB, {
      id: "w3b8",
      prompt: "The first line is `float desired = heading;`. Why not `float desired;` or `float desired = 0.0;`?",
      options: [
        ok("When canX equals x neither if runs, so desired must already hold a sensible value, and keep facing the same way is the right one."),
        no("`float desired;` is fine, the ifs always set it.", "If canX equals x, neither if runs. What does desired hold then?"),
        no("`= 0.0` is exactly the same.", "It compiles, but when the robot is already in the right column it would spin to face east for a walk of 0 mm, wasting a turn."),
        no("A float must always start from another variable.", "Any value is allowed. The question is which value makes sense here.")
      ]
    });
    addPencil(partB.body, "Draw the four situations as arrows on a compass.");
    addDraw(partB.body, "d3");
    addOpen(partB, {
      id: "w3b9",
      prompt: "You sit in the robot and must face along the east-west street. For each case say which way you turn (left, right or half a turn), by how many degrees, and how you decided. a) You face north and the can is east of you. b) You face south and the can is east of you. c) You face west and the can is east of you. d) You face east and the can is north of you.",
      model: "a) right 90. b) left 90. c) half a turn, 180, either direction. d) left 90. How to decide: compare two angles, where I point now and where I need to point. Subtracting them (wanted − current) gives a signed turn: a) 0 − 90 = −90; b) 0 − 270 = −270, which is the same direction as +90; c) 0 − 180 = −180; d) 90 − 0 = +90. Positive means left, negative means right.",
      checks: ["a) and d) are correct.", "I noticed b) can be done two ways.", "I used wanted minus current, or left is positive."]
    });
    addChoice(partB, {
      id: "w3b10",
      prompt: "The robot faces north (heading 90) and needs to face east (desired 0). Which expression gives the angle to pass to `turnFor(left, …)`?",
      after: "Positive means left, negative means right.",
      options: [
        ok("`desired - heading`"),
        no("`heading - desired`", "That gives +90, a left turn, which ends facing west. Check it on the turn dial."),
        no("`desired + heading`", "That gives 90, also a left turn to west."),
        no("`desired`", "That gives 0: no turn at all. The turn depends on where the robot faces now.")
      ]
    });
    addChoice(partB, {
      id: "w3b11",
      prompt: "The robot faces south (270) and needs east (0), so `desired - heading` is −270. Adding or subtracting one full circle (360) never changes where the robot ends up. Which value points the same way and is shorter?",
      options: [
        ok("90"),
        no("−90", "From south, a right turn of 90 faces west, not east. Did you add 360 or subtract it?"),
        no("630", "That points east, but it is longer, not shorter."),
        no("180", "A left half turn from south faces north. Different direction.")
      ]
    });
    addChoice(partB, {
      id: "w3b12",
      prompt: "Our rules shorten a turn only when it is bigger than 180 or smaller than −180. Why 180?",
      options: [
        ok("A turn longer than half a circle always has a shorter way round in the opposite direction; a turn of 180 or less is already the shortest."),
        no("The robot cannot turn more than 180°.", "It can: option D in the call question turned 270°."),
        no("The compiler only accepts angles up to 180.", "Nothing in C++ limits angles."),
        no("Any number would do.", "Try 100: a turn of 150 is already the shortest way, but a limit of 100 would change it to −210, which is longer.")
      ]
    });
    addChoice(partB, {
      id: "w3b13",
      prompt: "heading = 0 and desired = 180, so turn = 180. The rules are `if (turn > 180.0)` and `if (turn < -180.0)`. What happens?",
      after: "If you wrote >= the turn would become −180, the same half turn in the other direction. Both versions are correct.",
      options: [
        ok("Neither rule fires. The robot makes a half turn to the left, which is as short as a half turn to the right."),
        no("turn becomes −180.", "Is 180 bigger than 180?"),
        no("The robot does not turn.", "`turnFor(left, 180, …)` turns half a circle."),
        no("The program stops with an error.", "Nothing here is illegal.")
      ]
    });
    addCode(partB, {
      id: "w3b14",
      label: "Create float turn",
      starter: "// Create float turn.\n",
      prompt: "Create `float turn`: the angle to turn left (negative means right) so that the robot goes from `heading` to `desired` the short way round. Both variables are already declared.",
      hint: "Start with the difference between the wanted heading and the current one. Then two separate ifs: one for a turn bigger than 180 (take away a full circle) and one for a turn smaller than −180 (add a full circle).",
      cases: [
        floatCase("heading 0, desired 0", [["heading", 0], ["desired", 0]], "turn", 0, "turn is not the short signed turn."),
        floatCase("heading 0, desired 90", [["heading", 0], ["desired", 90]], "turn", 90, "turn is not the short signed turn."),
        floatCase("heading 90, desired 0", [["heading", 90], ["desired", 0]], "turn", -90, "turn is not the short signed turn."),
        floatCase("heading 0, desired 270", [["heading", 0], ["desired", 270]], "turn", -90, "turn is not the short signed turn."),
        floatCase("heading 270, desired 0", [["heading", 270], ["desired", 0]], "turn", 90, "turn is not the short signed turn."),
        floatCase("heading 180, desired 270", [["heading", 180], ["desired", 270]], "turn", 90, "turn is not the short signed turn."),
        floatCase("heading 270, desired 180", [["heading", 270], ["desired", 180]], "turn", -90, "turn is not the short signed turn."),
        floatCase("heading 180, desired 90", [["heading", 180], ["desired", 90]], "turn", -90, "turn is not the short signed turn."),
        floatCase("heading 90, desired 180", [["heading", 90], ["desired", 180]], "turn", 90, "turn is not the short signed turn."),
        floatCase("heading 0, desired 180", [["heading", 0], ["desired", 180]], "turn", 180, "turn is not the short signed turn.", [-180]),
        floatCase("heading 180, desired 0", [["heading", 180], ["desired", 0]], "turn", -180, "turn is not the short signed turn.", [180]),
        floatCase("heading 90, desired 270", [["heading", 90], ["desired", 270]], "turn", 180, "turn is not the short signed turn.", [-180]),
        floatCase("heading 270, desired 90", [["heading", 270], ["desired", 90]], "turn", -180, "turn is not the short signed turn.", [180]),
        floatCase("heading 45, desired 270", [["heading", 45], ["desired", 270]], "turn", -135, "turn is not the short signed turn.")
      ]
    });
    addChoice(partB, {
      id: "w3b15",
      prompt: "A classmate deletes both shortening ifs and keeps only `float turn = desired - heading;`. Which statement is true?",
      after: "The ifs are about efficiency, not correctness. In a timed run a wasted half turn costs time, and on a real robot every extra degree of spinning adds a little heading error.",
      options: [
        ok("The robot still ends up facing the right way every time, but sometimes it turns 270° when 90° would do."),
        no("The program no longer compiles.", "Only two ifs were removed. Is anything missing that a later line needs?"),
        no("The robot sometimes ends up facing the wrong way.", "Remember the calls that differed by a full circle. Where does the robot end up?"),
        no("Nothing changes at all.", "Compare the amount of rotation on the turn dial for south to east.")
      ]
    });
    addRobot(partB, {
      id: "w3b16",
      label: "Turn, then update heading",
      starter: "// Turn, then update heading.\n",
      prompt: "Make the robot turn by `turn`, then update `heading` so that the notebook agrees with the robot. `heading`, `desired`, and `turn` are already set. The real robot faces `heading`.",
      hint: "Drivetrain.turnFor(left, turn, degrees, true); makes the robot turn; the last argument true means wait until the turn is finished. Afterwards, which way does the robot face, and which variable should say so?",
      grade: source => gradeTurn(source, TURN_ROWS)
    });
    addChoice(partB, {
      id: "w3b17",
      prompt: "A student writes the turn call but forgets `heading = desired;`. The robot (heading 0) turns to face west (180) for its east-west walk, and the notebook still says 0. The north-south walk needs desired = 90, so the code computes turn = 90 − 0 = 90 and turns left by 90. What happens?",
      after: "Every calculation trusts the notebook. After each movement, update it straight away.",
      options: [
        ok("The robot ends up facing south (270), the wrong way. The turn was calculated from the notebook but applied to the real robot."),
        no("It ends up facing north.", "The notebook thinks the robot started at 0, but the real robot started at 180. What is 180 + 90?"),
        no("Nothing happens.", "The robot does turn, by 90° to the left."),
        no("The compiler reports an error.", "The code is legal. It is just wrong.")
      ]
    });
    addDraw(partB.body, "d5");
    const deeper = document.createElement("details");
    deeper.className = "guided-deeper";
    const summary = document.createElement("summary");
    summary.textContent = "Go deeper";
    deeper.appendChild(summary);
    partB.body.appendChild(deeper);
    addChoice(partB, {
      id: "w3b18",
      optional: true,
      prompt: "After the turn we write `heading = desired;`. Why not `heading = heading + turn;`?",
      options: [
        ok("We know the robot now faces desired, so assigning it directly keeps heading a clean 0, 90, 180 or 270 instead of values such as −90 or 360."),
        no("heading + turn is wrong arithmetic.", "The arithmetic is right. The result is just untidy."),
        no("A variable cannot appear on both sides of =.", "It can: `speed = speed + 15;` is in Section 4."),
        no("There is no difference.", "Try heading = 270 and turn = 90: heading + turn is 360. Is that a tidy heading?")
      ]
    }, deeper);
    addChoice(partB, {
      id: "w3b19",
      prompt: "x = 1200 and canX = 300. The robot has turned to face west. `canX - x` is −900. What does `Drivetrain.driveFor(forward, distance, mm);` do when distance is −900?",
      after: "The robot has already turned toward the target, so it must always drive forward by a positive distance.",
      options: [
        ok("It drives backward 900 mm, which is east, to x = 2100: away from the can."),
        no("It drives 900 mm west to the can.", "A negative distance drives the other way. Which way is that when you face west?"),
        no("It does not move.", "A negative distance still moves the robot, in reverse (Level 2)."),
        no("It reports an error.", "Negative distances are legal.")
      ]
    });
    addCode(partB, {
      id: "w3b20",
      label: "Create float distance",
      starter: "// Create float distance.\n",
      prompt: "Create `float distance`: how far to drive forward to reach `canX`. It must never be negative. `x` and `canX` are already declared.",
      hint: "Subtract the two positions, then check whether the result is below zero. -distance flips the sign of a variable; there is no abs() yet.",
      cases: [
        floatCase("x 0, canX 900", [["x", 0], ["canX", 900]], "distance", 900, "distance is not the positive gap between the two positions."),
        floatCase("x 1200, canX 300", [["x", 1200], ["canX", 300]], "distance", 900, "distance is not the positive gap between the two positions."),
        floatCase("x 500, canX 500", [["x", 500], ["canX", 500]], "distance", 0, "distance is not the positive gap between the two positions."),
        floatCase("x 1800, canX 0", [["x", 1800], ["canX", 0]], "distance", 1800, "distance is not the positive gap between the two positions."),
        floatCase("x 250.5, canX 100", [["x", 250.5], ["canX", 100]], "distance", 150.5, "distance is not the positive gap between the two positions."),
        floatCase("x 0, canX 1800", [["x", 0], ["canX", 1800]], "distance", 1800, "distance is not the positive gap between the two positions.")
      ]
    });
    addRobot(partB, {
      id: "w3b21",
      label: "Drive, then update x",
      starter: "// Drive, then update x.\n",
      prompt: "Drive `distance` millimetres forward, then update `x` so that the notebook agrees with the robot. `x`, `canX`, `heading`, and `distance` are already set. The robot already faces the right way.",
      hint: "Drivetrain.driveFor(forward, distance, mm); moves the robot. Where is the robot afterwards, and which variable should say so?",
      grade: source => gradeDrive(source, DRIVE_ROWS)
    });
    addChoice(partB, {
      id: "w3b22",
      prompt: "After driving west for 900 mm from x = 1200 (distance is 900), a student writes `x = x + distance;`. What does the notebook say, and is it right?",
      after: "distance is always positive, but the robot moved toward smaller x. Adding it only works when walking east.",
      options: [
        ok("2100, which is wrong: the robot is at 300. Setting `x = canX` is right in every case."),
        no("300, which is right.", "What is 1200 + 900?"),
        no("1200, which is right.", "The assignment changes x."),
        no("900, which is right.", "x is a position, not a distance.")
      ]
    });
    addDraw(partB.body, "d5");
    addRobot(partB, {
      id: "w3b23",
      label: "East-west leg",
      starter: "// Leg 1: east-west.\n",
      prompt: "Paste your pieces together, in order, and test the whole east-west leg: desired, turn, the turn call with the heading update, distance, the drive with the x update. `x`, `y`, `heading`, and `canX` are already declared. The robot really is where the notebook says.",
      hint: "Order matters: desired before turn, the turn before the drive, and each update right after the move it describes.",
      grade: source => gradeLeg(source, LEG1_ROWS, null)
    });

    const partC = startPart("C", "Part C", "The north-south leg", partB);
    addDraw(partC.body, "d4");
    addCells(partC, {
      id: "w3c1",
      prompt: "The second walk is the first one with north and south in place of east and west. Fill in the blanks of the leg 2 code.",
      lines: [
        ["desired = heading;"],
        ["if (canY ", { options: [">", "<", "=="], answer: ">" }, " y) { desired = ", { options: ["0", "90", "180", "270"], answer: "90" }, "; }  // north"],
        ["if (canY ", { options: [">", "<", "=="], answer: "<" }, " y) { desired = ", { options: ["0", "90", "180", "270"], answer: "270" }, "; }  // south"],
        ["distance = ", { options: ["x", "y", "canX", "canY"], answer: "canY" }, " - ", { options: ["x", "y", "canX", "canY"], answer: "y" }, ";"],
        [{ options: ["x", "y", "canX", "canY"], answer: "y" }, " = canY;"]
      ]
    }, "blanks");
    addChoice(partC, {
      id: "w3c2",
      prompt: "Leg 2 begins with `desired = heading;`, not `float desired = heading;`. Why?",
      after: "If you write float again, the compiler says: Line 12: desired is already declared in this block.",
      options: [
        ok("desired already exists from leg 1, and declaring the same name twice in one block is an error."),
        no("float may only be used once in a program.", "It can be used many times, with different names."),
        no("desired is a constant here.", "It changes: it is assigned again right away."),
        no("Leg 2 does not use desired.", "Look at the next line.")
      ]
    });
    addChoice(partC, {
      id: "w3c3",
      multi: true,
      prompt: "Which parts of leg 1 can be copied into leg 2 with no change at all?",
      after: "Only lines that mention x, canX or the east and west headings change. The turning logic does not care about compass names.",
      wrong: "Look again at any line that names x, canX, or an east-west heading.",
      options: [
        choice("A", "The turn formula and the two shortening ifs.", true, ""),
        choice("B", "`Drivetrain.turnFor(left, turn, degrees, true);` and `heading = desired;`", true, ""),
        choice("C", "`if (distance < 0.0) { distance = -distance; }`", true, ""),
        choice("D", "`if (canX > x) { desired = 0.0; }`", false, "This one mentions canX and an east-west heading."),
        choice("E", "`x = canX;`", false, "Leg 2 moves along y.")
      ]
    });
    addRobot(partC, {
      id: "w3c4",
      readonly: true,
      label: "North-south leg",
      starter: "// Leg 2: north-south.\n",
      prompt: "Write leg 2: face north or south as needed, turn the short way, drive, and update the notebook. Leg 1 is already written in the grey box above your editor.",
      hint: "Copy leg 1 and change what must change: the target is canY, the headings are 90 and 270, and the variable that gets updated is y. Remember that desired, turn and distance already exist.",
      grade: source => gradeLeg(source, LEG2_ROWS, P3)
    });

    book.addAnswers(keys);
    book.addTasks(tasks);
    book.addHints(hints);
    refreshGuide();
    root.addEventListener("change", event => {
      const block = event.target.closest(".question-block");
      if (!block || block.classList.contains("guided-custom")) return;
      setTimeout(refreshGuide, 0);
    });
    root.addEventListener("click", event => {
      if (event.target.closest(".coding-block .btn-run")) setTimeout(refreshGuide, 0);
    });
  }

  try {
    build();
  } catch (err) {
    const pre = document.createElement("pre");
    pre.id = "guided-build-error";
    pre.textContent = (err && err.stack) || String(err);
    root.appendChild(pre);
  }
})();
