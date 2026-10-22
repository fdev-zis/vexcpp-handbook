// General C++ playground: a complete main program, printf, and a few standard libraries.
(function () {
  const vex = window.vexCppRun;
  const dialog = document.getElementById("cpp-playground");
  const openButton = document.getElementById("open-cpp-playground");
  if (!vex || !dialog || !openButton) return;

  const CODE_KEY = "vexcpp-general-code";
  const STARTER = [
    "#include <cstdio>",
    "",
    "int main() {",
    "    printf(\"Hello world!\");",
    "    return 0;",
    "}"
  ].join("\n");

  const HEADER_ALIAS = {
    "stdio.h": "cstdio",
    "math.h": "cmath",
    "stdlib.h": "cstdlib"
  };
  const HEADER_FUNCS = {
    cstdio: ["printf", "puts"],
    iostream: [],
    cmath: ["sqrt", "abs", "fabs", "pow", "round", "floor", "ceil", "fmod", "sin", "cos", "tan"],
    cstdlib: ["abs", "rand", "srand"],
    string: []
  };
  const HEADER_NEED = {
    printf: "<cstdio>",
    puts: "<cstdio>",
    sqrt: "<cmath>",
    fabs: "<cmath>",
    pow: "<cmath>",
    round: "<cmath>",
    floor: "<cmath>",
    ceil: "<cmath>",
    fmod: "<cmath>",
    sin: "<cmath>",
    cos: "<cmath>",
    tan: "<cmath>",
    rand: "<cstdlib>",
    srand: "<cstdlib>",
    abs: "<cmath> or <cstdlib>"
  };

  const code = document.getElementById("cpp-playground-code");
  const editor = document.getElementById("cpp-playground-editor");
  const highlight = editor.querySelector(".code-highlight");
  const consoleEl = document.getElementById("cpp-playground-console");
  const messageEl = document.getElementById("cpp-playground-msg");
  let runSerial = 0;
  const inputWaiters = [];

  function cancelError() {
    const err = new Error("cancelled");
    err.name = "CancelRun";
    return err;
  }

  function stopRun() {
    runSerial += 1;
    const pending = inputWaiters.splice(0);
    pending.forEach(reject => reject(cancelError()));
    const stray = consoleEl.querySelector("input");
    if (stray) stray.remove();
  }

  function renderConsole(text, waiting) {
    consoleEl.replaceChildren();
    if (text) consoleEl.append(document.createTextNode(text));
    let input = null;
    if (waiting) {
      input = document.createElement("input");
      input.type = "text";
      input.className = "cpp-playground-console-input";
      input.setAttribute("aria-label", "Console input");
      input.autocomplete = "off";
      input.spellcheck = false;
      input.autocapitalize = "off";
      input.addEventListener("input", () => {
        input.style.width = Math.max(12, input.value.length + 1) + "ch";
      });
      consoleEl.append(input);
    }
    consoleEl.scrollTop = consoleEl.scrollHeight;
    if (input) input.focus();
    return input;
  }

  function readConsoleLine(token, text) {
    return new Promise((resolve, reject) => {
      if (token !== runSerial) {
        reject(cancelError());
        return;
      }
      inputWaiters.push(reject);
      const input = renderConsole(text, true);
      input.addEventListener("keydown", event => {
        if (event.key !== "Enter") return;
        event.preventDefault();
        const index = inputWaiters.indexOf(reject);
        if (index >= 0) inputWaiters.splice(index, 1);
        resolve(input.value);
      });
    });
  }

  function readCode() {
    try { return localStorage.getItem(CODE_KEY) || ""; }
    catch (err) { return ""; }
  }

  function writeCode(value) {
    try { localStorage.setItem(CODE_KEY, value); }
    catch (err) { /* storage may be blocked */ }
  }

  function setCode(value) {
    code.value = value;
    vex.refreshEditorHighlight(code);
    writeCode(value);
  }

  function showMessage(text, kind) {
    if (!text) {
      messageEl.hidden = true;
      messageEl.textContent = "";
      messageEl.className = "l3-msg";
      return;
    }
    messageEl.hidden = false;
    messageEl.className = "l3-msg " + kind;
    messageEl.textContent = text;
  }

  function friendly(err) {
    let text = err && err.message ? String(err.message) : "The program stopped.";
    text = text.replace(/this practice/g, "this playground");
    text = text.replace(/this solution/g, "this program");
    text = text.replace(/before running the tests/g, "before running");
    text = text.replace(/running the tests/g, "running");
    return text;
  }

  function takeIncludes(source) {
    const headers = [];
    const lines = String(source).replace(/\r\n/g, "\n").split("\n");
    const includeRe = /^#\s*include\s*(?:<([^<>]+)>|"([^"]+)")\s*(?:\/\/.*)?$/;
    lines.forEach((line, index) => {
      const trimmed = line.trim();
      const match = includeRe.exec(trimmed);
      if (match) {
        headers.push({ name: (match[1] || match[2] || "").trim(), line: index + 1 });
        lines[index] = "";
        return;
      }
      if (/^using\s+namespace\s+[A-Za-z_][A-Za-z0-9_]*\s*;\s*(?:\/\/.*)?$/.test(trimmed)) lines[index] = "";
    });
    return { headers: headers, source: lines.join("\n") };
  }

  function librarySet(headers) {
    const enabled = new Set();
    let strings = false;
    let stream = false;
    headers.forEach(header => {
      const name = HEADER_ALIAS[header.name] || header.name;
      if (!Object.prototype.hasOwnProperty.call(HEADER_FUNCS, name)) {
        throw vex.cppError(header.line, "This playground can include <cstdio>, <iostream>, <cmath>, <cstdlib>, and <string>.");
      }
      if (name === "string") strings = true;
      if (name === "iostream") stream = true;
      HEADER_FUNCS[name].forEach(fn => enabled.add(fn));
    });
    return { enabled: enabled, strings: strings, stream: stream };
  }

  function requireKnown(name, enabled, line) {
    if (enabled.has(name)) return;
    if (Object.prototype.hasOwnProperty.call(HEADER_NEED, name)) {
      throw vex.cppError(line, name + " needs #include " + HEADER_NEED[name] + ".");
    }
  }

  function asNumber(value, line, name) {
    const n = vex.numericValue(value);
    if (typeof n !== "number" || !Number.isFinite(n)) throw vex.cppError(line, name + " needs a number.");
    return n;
  }

  function floatResult(n, line, name) {
    if (!Number.isFinite(n)) throw vex.cppError(line, name + " did not produce a usable number.");
    return { type: "float", value: n };
  }

  function showValue(value) {
    if (!value) return "";
    if (value.type === "bool") return value.value ? "true" : "false";
    if (value.type === "string" || value.type === "char") return String(value.value);
    if (typeof value.value === "number" && Number.isFinite(value.value)) {
      if (value.type === "float") {
        const rounded = Math.round(value.value * 1000000) / 1000000;
        return String(rounded);
      }
      return String(value.value);
    }
    return String(value.value);
  }

  function formatSpec(spec, value, line) {
    if (spec === "s") return showValue(value);
    if (spec === "d" || spec === "i" || spec === "f") {
      const n = asNumber(value, line, "%" + spec);
      if (spec === "f") {
        const text = n.toFixed(6).replace(/0+$/, "").replace(/\.$/, ".0");
        return text;
      }
      return String(Math.trunc(n));
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
    if (ai < values.length) throw vex.cppError(line, "printf has an extra value.");
    return out;
  }

  const LOOP = {};

  function isThenable(value) {
    return !!value && typeof value.then === "function";
  }

  function settle(value, next) {
    if (isThenable(value)) return value.then(next);
    return next(value);
  }

  function finish(value, onEnd) {
    if (isThenable(value)) return value.finally(onEnd);
    try { return value; }
    finally { onEnd(); }
  }

  function loopBody(step) {
    while (true) {
      const outcome = step();
      if (isThenable(outcome)) return outcome.then(value => value === LOOP ? loopBody(step) : value);
      if (outcome !== LOOP) return outcome;
    }
  }

  let built = null;
  let activeRun = false;

  function compileSource(source) {
    if (!String(source).trim()) throw new Error("Write a program before compiling.");
    const prepared = takeIncludes(source);
    const libs = librarySet(prepared.headers);
    const program = vex.parseCpp(prepared.source, false, { demo: true, calls: true, limit: 80000 });
    const functions = program.functions.filter(fn => !fn.prototype);
    const main = functions.find(fn => fn.name === "main");
    if (!main) throw new Error("This program needs a main function.");
    if (main.params.length) throw vex.cppError(main.line, "This playground calls main with no arguments.");
    const unit = { source: source, program: program, libs: libs, functions: functions, main: main };
    checkProgram(unit);
    return unit;
  }

  function checkProgram(unit) {
    const libs = unit.libs;
    const known = new Map();
    (unit.program.functions || []).forEach(fn => {
      const prev = known.get(fn.name);
      if (!prev || fn.body) known.set(fn.name, fn);
    });
    vex.resetSteps();

    function sampleOf(typed) {
      if (typed.type === "string") return typeof typed.value === "string" ? typed.value : "a";
      if (typed.type === "char") return typeof typed.value === "string" && typed.value.length === 1 ? typed.value : "a";
      if (typed.type === "bool") return typeof typed.value === "boolean" ? typed.value : true;
      if (typed.type === "enum") return typeof typed.value === "string" ? typed.value : "forward";
      return typeof typed.value === "number" ? typed.value : 1;
    }

    function literalOf(typed, line) {
      return { kind: "literal", type: typed.type === "enum" ? "enum" : typed.type, value: sampleOf(typed), line: line };
    }

    function avoidZeroDivisor(lit) {
      const n = vex.numericValue(lit);
      if (n !== 0) return;
      if (lit.type === "bool") lit.value = true;
      else if (lit.type === "char") lit.value = "a";
      else lit.value = 1;
    }

    function requireStringType(type, line) {
      if (type === "string" && !libs.strings) throw vex.cppError(line, "string needs #include <string>.");
    }

    function coerceType(target, typed, node) {
      requireStringType(target, node.line);
      return vex.coerce(target, { type: typed.type, value: sampleOf(typed) }, node);
    }

    function lookupVar(name, env, line) {
      const rec = env.lookup(name);
      if (!rec) throw vex.cppError(line, name + " has not been declared. Declare it with int, float, or bool before using it.");
      return rec;
    }

    function readVar(name, env, line) {
      const rec = lookupVar(name, env, line);
      const global = env.stack[0] && env.stack[0].get(name) === rec;
      if (!rec.initialized && !(global && env.maybeSetGlobals)) {
        throw vex.cppError(line, name + " has no starting value yet. Initialize it before using it.");
      }
      return rec;
    }

    function checkCall(name, args, node, env) {
      const user = known.get(name);
      if (user) {
        env.maybeSetGlobals = true;
        if (!user.body) throw vex.cppError(node.line, name + " is declared but has no body.");
        if (args.length !== user.params.length) {
          throw vex.cppError(node.line, name + " expects " + user.params.length + " argument" + (user.params.length === 1 ? "" : "s") + ".");
        }
        args.forEach((arg, index) => {
          const typed = checkExpr(arg, env);
          const param = user.params[index];
          requireStringType(param.type, param.line);
          coerceType(param.type, typed, arg);
        });
        return user.returnType === "void" ? null : { type: user.returnType };
      }
      if (Object.prototype.hasOwnProperty.call(HEADER_NEED, name)) {
        requireKnown(name, libs.enabled, node.line);
        const typedArgs = args.map(arg => checkExpr(arg, env));
        return checkStd(name, typedArgs, node.line);
      }
      const declared = env.lookup(name);
      if (!declared) throw vex.cppError(node.line, name + " has not been declared.");
      throw vex.cppError(node.line, name + " is a variable, not a function.");
    }

    function checkStd(name, typedArgs, line) {
      function needCount(count, text) {
        if (typedArgs.length !== count) throw vex.cppError(line, text);
      }
      function needNumber(typed, label) {
        if (typed.type === "string") throw vex.cppError(line, label + " needs a number.");
      }
      if (name === "printf") {
        if (!typedArgs.length) throw vex.cppError(line, "printf needs a message in quotes, such as printf(\"Hello world!\");");
        if (typedArgs[0].type !== "string") throw vex.cppError(line, "printf starts with text in quotes, such as printf(\"Hello world!\");");
        if (typeof typedArgs[0].value === "string") formatPrintf(typedArgs[0].value, typedArgs.slice(1).map(typed => ({ type: typed.type, value: sampleOf(typed) })), line);
        return { type: "int" };
      }
      if (name === "puts") {
        needCount(1, "puts needs one message, such as puts(\"Hello\");");
        return { type: "int" };
      }
      if (name === "sqrt" || name === "fabs" || name === "round" || name === "floor" || name === "ceil") {
        needCount(1, name + " needs one number.");
        needNumber(typedArgs[0], name);
        return { type: "float" };
      }
      if (name === "sin" || name === "cos" || name === "tan") {
        needCount(1, name + " needs an angle in radians.");
        needNumber(typedArgs[0], name);
        return { type: "float" };
      }
      if (name === "abs") {
        needCount(1, "abs needs one number.");
        needNumber(typedArgs[0], "abs");
        return { type: typedArgs[0].type === "int" ? "int" : "float" };
      }
      if (name === "pow") {
        needCount(2, "pow needs a base and an exponent.");
        needNumber(typedArgs[0], "pow");
        needNumber(typedArgs[1], "pow");
        return { type: "float" };
      }
      if (name === "fmod") {
        needCount(2, "fmod needs two numbers.");
        needNumber(typedArgs[0], "fmod");
        needNumber(typedArgs[1], "fmod");
        return { type: "float" };
      }
      if (name === "srand") {
        needCount(1, "srand needs one number.");
        needNumber(typedArgs[0], "srand");
        return { type: "int" };
      }
      if (name === "rand") {
        if (typedArgs.length) throw vex.cppError(line, "rand takes no arguments.");
        return { type: "int" };
      }
      throw vex.cppError(line, name + " is not available in this playground.");
    }

    function checkExpr(expr, env) {
      if (!expr) throw new Error("This expression is missing a value.");
      if (expr.kind === "literal") return { type: expr.type, value: expr.value };
      if (expr.kind === "ident") return { type: readVar(expr.name, env, expr.line).type };
      if (expr.kind === "unary" || expr.kind === "binary") {
        if (expr.kind === "binary" && (expr.op === "&&" || expr.op === "||")) {
          checkExpr(expr.left, env);
          checkExpr(expr.right, env);
          return { type: "bool" };
        }
        const parts = expr.kind === "unary" ? [checkExpr(expr.expr, env)] : [checkExpr(expr.left, env), checkExpr(expr.right, env)];
        const right = expr.kind === "binary" ? literalOf(parts[1], expr.line) : undefined;
        if (right && (expr.op === "/" || expr.op === "%")) avoidZeroDivisor(right);
        const synthetic = {
          kind: expr.kind,
          op: expr.op,
          line: expr.line,
          expr: expr.kind === "unary" ? literalOf(parts[0], expr.line) : undefined,
          left: expr.kind === "binary" ? literalOf(parts[0], expr.line) : undefined,
          right: right
        };
        const value = vex.evalExpr(synthetic, env);
        return { type: value.type };
      }
      if (expr.kind === "assignExpr") {
        const rec = lookupVar(expr.name, env, expr.line);
        if (rec.isConst) throw vex.cppError(expr.line, expr.name + " is const, so its value cannot be changed.");
        const typed = checkExpr(expr.expr, env);
        coerceType(rec.type, typed, expr);
        rec.initialized = true;
        return { type: rec.type };
      }
      if (expr.kind === "compound") {
        const rec = readVar(expr.name, env, expr.line);
        if (rec.isConst) throw vex.cppError(expr.line, expr.name + " is const, so its value cannot be changed.");
        const typed = checkExpr(expr.expr, env);
        const right = literalOf(typed, expr.line);
        if (expr.op === "/" || expr.op === "%") avoidZeroDivisor(right);
        const combined = vex.evalExpr({
          kind: "binary",
          op: expr.op,
          line: expr.line,
          left: literalOf({ type: rec.type }, expr.line),
          right: right
        }, env);
        coerceType(rec.type, { type: combined.type }, expr);
        return { type: rec.type };
      }
      if (expr.kind === "prefix" || expr.kind === "postfix") {
        const rec = readVar(expr.name, env, expr.line);
        if (rec.isConst) throw vex.cppError(expr.line, expr.name + " is const, so its value cannot be changed.");
        if (rec.type !== "int" && rec.type !== "float") throw vex.cppError(expr.line, "++ and -- need a number variable.");
        return { type: rec.type };
      }
      if (expr.kind === "cast") {
        const typed = checkExpr(expr.expr, env);
        if (expr.type === "void") throw vex.cppError(expr.line, "static_cast cannot produce void.");
        coerceType(expr.type, typed, expr);
        return { type: expr.type };
      }
      if (expr.kind === "memberCall") {
        const rec = readVar(expr.object, env, expr.line);
        if (expr.name === "length" && !expr.args.length && (rec.type === "string" || rec.type === "char")) return { type: "int" };
        throw vex.cppError(expr.line, "this playground can use .length() on a string.");
      }
      if (expr.kind === "callExpr") {
        const result = checkCall(expr.name, expr.args, expr, env);
        if (!result) throw vex.cppError(expr.line, expr.name + " does not produce a value.");
        return result;
      }
      throw vex.cppError(expr.line, "this expression is not supported in this playground.");
    }

    function cloneEnv(env) {
      const copy = new vex.Environment();
      copy.fn = env.fn;
      copy.maybeSetGlobals = env.maybeSetGlobals;
      env.stack.forEach(scope => {
        const next = new Map();
        scope.forEach((rec, name) => next.set(name, { type: rec.type, value: rec.value, isConst: rec.isConst, initialized: rec.initialized }));
        copy.stack.push(next);
      });
      return copy;
    }

    function mergeInit(env, thenEnv, elseEnv) {
      env.stack.forEach((scope, index) => {
        scope.forEach((rec, name) => {
          const left = thenEnv.stack[index] && thenEnv.stack[index].get(name);
          const right = elseEnv.stack[index] && elseEnv.stack[index].get(name);
          rec.initialized = !!(left && left.initialized && right && right.initialized);
        });
      });
      if (thenEnv.maybeSetGlobals && elseEnv.maybeSetGlobals) env.maybeSetGlobals = true;
    }

    function checkStmt(stmt, env, loop) {
      if (!stmt || stmt.kind === "empty") return;
      if (stmt.kind === "block") {
        env.push();
        try { (stmt.stmts || []).forEach(item => checkStmt(item, env, loop)); }
        finally { env.pop(); }
        return;
      }
      if (stmt.kind === "decl") {
        requireStringType(stmt.type, stmt.line);
        let ready = false;
        if (stmt.init) {
          coerceType(stmt.type, checkExpr(stmt.init, env), stmt);
          ready = true;
        }
        env.declare(stmt.name, stmt.type, null, stmt.isConst, ready, stmt.line);
        return;
      }
      if (stmt.kind === "assign") {
        const rec = lookupVar(stmt.name, env, stmt.line);
        if (rec.isConst) throw vex.cppError(stmt.line, stmt.name + " is const, so its value cannot be changed.");
        coerceType(rec.type, checkExpr(stmt.expr, env), stmt);
        rec.initialized = true;
        return;
      }
      if (stmt.kind === "compound" || stmt.kind === "postfix" || stmt.kind === "prefix" || stmt.kind === "exprStmt") {
        checkExpr(stmt.kind === "exprStmt" ? stmt.expr : stmt, env);
        return;
      }
      if (stmt.kind === "if") {
        checkExpr(stmt.cond, env);
        const thenEnv = cloneEnv(env);
        const elseEnv = cloneEnv(env);
        checkStmt(stmt.then, thenEnv, loop);
        if (stmt.else) checkStmt(stmt.else, elseEnv, loop);
        mergeInit(env, thenEnv, elseEnv);
        return;
      }
      if (stmt.kind === "for") {
        env.push();
        try {
          if (stmt.init) checkStmt(stmt.init, env, loop + 1);
          if (stmt.cond) checkExpr(stmt.cond, env);
          const bodyEnv = cloneEnv(env);
          checkStmt(stmt.body, bodyEnv, loop + 1);
          if (stmt.step) checkExpr(stmt.step, bodyEnv);
        } finally {
          env.pop();
        }
        return;
      }
      if (stmt.kind === "while") {
        checkExpr(stmt.cond, env);
        checkStmt(stmt.body, cloneEnv(env), loop + 1);
        return;
      }
      if (stmt.kind === "break" || stmt.kind === "continue") {
        if (!loop) throw vex.cppError(stmt.line, stmt.kind + " is not inside a loop.");
        return;
      }
      if (stmt.kind === "return") {
        const fn = env.fn;
        if (!stmt.expr) {
          if (fn && fn.returnType !== "void") throw vex.cppError(stmt.line, fn.name + " finished without returning a value.");
          return;
        }
        const typed = checkExpr(stmt.expr, env);
        if (fn && fn.returnType === "void") throw vex.cppError(stmt.line, fn.name + " is void, so return cannot include a value.");
        if (fn && fn.returnType !== "void") coerceType(fn.returnType, typed, stmt);
        return;
      }
      if (stmt.kind === "call") {
        checkCall(stmt.name, stmt.args, stmt, env);
        return;
      }
      if (stmt.kind === "cout") {
        if (!libs.stream) throw vex.cppError(stmt.line, "cout needs #include <iostream>.");
        stmt.parts.forEach(part => {
          if (part.kind === "manip") return;
          checkExpr(part, env);
        });
        return;
      }
      if (stmt.kind === "cin") {
        if (!libs.stream) throw vex.cppError(stmt.line, "cin needs #include <iostream>.");
        stmt.targets.forEach(target => {
          const rec = lookupVar(target.name, env, target.line);
          if (rec.isConst) throw vex.cppError(target.line, target.name + " is const, so its value cannot be changed.");
          rec.initialized = true;
        });
        return;
      }
      throw vex.cppError(stmt.line, "this statement is not supported in this playground.");
    }

    function hasReturn(node, seen) {
      if (!node || typeof node !== "object" || seen.has(node)) return false;
      seen.add(node);
      if (node.kind === "return" && node.expr) return true;
      const children = Array.isArray(node) ? node : Object.keys(node).map(key => node[key]);
      return children.some(child => hasReturn(child, seen));
    }

    const global = new vex.Environment();
    global.push();
    (unit.program.globals || []).forEach(stmt => checkStmt(stmt, global, 0));
    unit.functions.forEach(fn => {
      const env = cloneEnv(global);
      env.fn = fn;
      env.push();
      fn.params.forEach(param => {
        requireStringType(param.type, param.line);
        env.declare(param.name, param.type, null, !!param.isConst, true, param.line);
      });
      checkStmt(fn.body, env, 0);
      if (fn.returnType !== "void" && !(fn.name === "main" && fn.returnType === "int") && !hasReturn(fn.body, new Set())) {
        throw vex.cppError(fn.line, fn.name + " finished without returning a value.");
      }
    });
  }

  function build() {
    try {
      built = compileSource(code.value);
      return true;
    } catch (err) {
      built = null;
      showMessage(friendly(err), "error");
      return false;
    }
  }

  function onCompile() {
    stopRun();
    activeRun = false;
    if (!build()) {
      renderConsole("", false);
      return;
    }
    showMessage("Compiled. Run the program.", "ok");
  }

  function runProgram(unit, token) {
    const libs = unit.libs;
    const program = unit.program;
    const functions = unit.functions;
    const main = unit.main;

    const ctx = {
      display: "",
      token: token,
      enabled: libs.enabled,
      strings: libs.strings,
      stream: libs.stream,
      functions: functions,
      seed: 1,
      inputTokens: [],
      inputPos: 0,
      loop: 0,
      globalMap: null
    };

    function writeOut(text) {
      ctx.display += text;
      if (ctx.token === runSerial) renderConsole(ctx.display, false);
    }

    function paint(waiting) {
      if (ctx.token !== runSerial) return null;
      return renderConsole(ctx.display, waiting);
    }

    function requireString(line) {
      if (!ctx.strings) throw vex.cppError(line, "string needs #include <string>.");
    }

    function bump(node) { vex.tick(node); }

    function evalArgs(args, env) {
      const values = [];
      function next(index) {
        if (index >= args.length) return values;
        return settle(vex.evalExpr(args[index], env), value => {
          values.push(value);
          return next(index + 1);
        });
      }
      return next(0);
    }

    function callStd(name, values, line) {
      requireKnown(name, ctx.enabled, line);
      if (name === "printf") {
        if (!values.length) throw vex.cppError(line, "printf needs a message in quotes, such as printf(\"Hello world!\");");
        if (values[0].type !== "string") throw vex.cppError(line, "printf starts with text in quotes, such as printf(\"Hello world!\");");
        const text = formatPrintf(values[0].value, values.slice(1), line);
        writeOut(text);
        return { type: "int", value: text.length };
      }
      if (name === "puts") {
        if (values.length !== 1) throw vex.cppError(line, "puts needs one message, such as puts(\"Hello\");");
        const text = showValue(values[0]) + "\n";
        writeOut(text);
        return { type: "int", value: text.length };
      }
      if (name === "sqrt") {
        if (values.length !== 1) throw vex.cppError(line, "sqrt needs one number.");
        const n = asNumber(values[0], line, "sqrt");
        if (n < 0) throw vex.cppError(line, "sqrt needs a number that is zero or greater.");
        return floatResult(Math.sqrt(n), line, "sqrt");
      }
      if (name === "abs" || name === "fabs") {
        if (values.length !== 1) throw vex.cppError(line, name + " needs one number.");
        const n = asNumber(values[0], line, name);
        if (name === "abs" && values[0].type === "int") return { type: "int", value: Math.abs(Math.trunc(n)) };
        return floatResult(Math.abs(n), line, name);
      }
      if (name === "pow") {
        if (values.length !== 2) throw vex.cppError(line, "pow needs a base and an exponent.");
        return floatResult(Math.pow(asNumber(values[0], line, "pow"), asNumber(values[1], line, "pow")), line, "pow");
      }
      if (name === "round" || name === "floor" || name === "ceil") {
        if (values.length !== 1) throw vex.cppError(line, name + " needs one number.");
        return floatResult(Math[name](asNumber(values[0], line, name)), line, name);
      }
      if (name === "fmod") {
        if (values.length !== 2) throw vex.cppError(line, "fmod needs two numbers.");
        const right = asNumber(values[1], line, "fmod");
        if (right === 0) throw vex.cppError(line, "modulo by zero.");
        return floatResult(asNumber(values[0], line, "fmod") % right, line, "fmod");
      }
      if (name === "sin" || name === "cos" || name === "tan") {
        if (values.length !== 1) throw vex.cppError(line, name + " needs an angle in radians.");
        return floatResult(Math[name](asNumber(values[0], line, name)), line, name);
      }
      if (name === "srand") {
        if (values.length !== 1) throw vex.cppError(line, "srand needs one number.");
        ctx.seed = Math.abs(Math.trunc(asNumber(values[0], line, "srand"))) || 1;
        return { type: "int", value: 0 };
      }
      if (name === "rand") {
        if (values.length) throw vex.cppError(line, "rand takes no arguments.");
        ctx.seed = (ctx.seed * 1103515245 + 12345) % 2147483648;
        return { type: "int", value: ctx.seed % 32768 };
      }
      throw vex.cppError(line, name + " is not available in this playground.");
    }

    function callUser(fn, argExprs, callNode, callerEnv) {
      if (!fn.body) throw vex.cppError(callNode.line, fn.name + " is declared but has no body.");
      if (argExprs.length !== fn.params.length) {
        throw vex.cppError(callNode.line, fn.name + " expects " + fn.params.length + " argument" + (fn.params.length === 1 ? "" : "s") + ".");
      }
      return settle(evalArgs(argExprs, callerEnv), values => {
        const inner = new vex.Environment();
        inner.stack.push(ctx.globalMap);
        inner.push();
        fn.params.forEach((param, index) => {
          if (param.type === "string") requireString(param.line);
          const stored = vex.coerce(param.type, values[index], argExprs[index]);
          inner.declare(param.name, param.type, stored, !!param.isConst, true, param.line);
        });
        return settle(exec(fn.body, inner, ctx), outcome => {
          if (fn.returnType === "void") {
            if (outcome.returned && !outcome.bare) throw vex.cppError(outcome.node.line, fn.name + " is void, so return cannot include a value.");
            return null;
          }
          if (!outcome.returned || outcome.bare) {
            if (fn.name === "main" && fn.returnType === "int") return { type: "int", value: 0 };
            throw vex.cppError(fn.line, fn.name + " finished without returning a value.");
          }
          return { type: fn.returnType, value: vex.coerce(fn.returnType, outcome.value, outcome.node || callNode) };
        });
      });
    }

    function callNamed(name, argExprs, callNode, env) {
      const user = ctx.functions.find(fn => fn.name === name && fn.body);
      if (user) return callUser(user, argExprs, callNode, env);
      if (Object.prototype.hasOwnProperty.call(HEADER_NEED, name)) {
        return settle(evalArgs(argExprs, env), values => callStd(name, values, callNode.line));
      }
      const declared = env.lookup(name);
      if (!declared) throw vex.cppError(callNode.line, name + " has not been declared.");
      throw vex.cppError(callNode.line, name + " is a variable, not a function.");
    }

    function stepVar(expr, env) {
      const rec = env.lookup(expr.name);
      if (!rec) throw vex.cppError(expr.line, expr.name + " has not been declared. Declare it with int, float, or bool before using it.");
      if (!rec.initialized) throw vex.cppError(expr.line, expr.name + " has no starting value yet. Initialize it before using it.");
      if (rec.isConst) throw vex.cppError(expr.line, expr.name + " is const, so its value cannot be changed.");
      if (rec.type !== "int" && rec.type !== "float") throw vex.cppError(expr.line, "++ and -- need a number variable.");
      const before = rec.value;
      const delta = expr.op === "++" ? 1 : -1;
      rec.value = rec.type === "int" ? Math.trunc(before + delta) : before + delta;
      return { type: rec.type, value: expr.kind === "prefix" ? rec.value : before };
    }

    function compoundAssign(expr, env) {
      const rec = env.lookup(expr.name);
      if (!rec) throw vex.cppError(expr.line, expr.name + " has not been declared. Declare it with int, float, or bool before using it.");
      if (!rec.initialized) throw vex.cppError(expr.line, expr.name + " has no starting value yet. Initialize it before using it.");
      if (rec.isConst) throw vex.cppError(expr.line, expr.name + " is const, so its value cannot be changed.");
      const right = vex.evalExpr(expr.expr, env);
      return settle(right, resolved => {
        const combined = vex.evalExpr({
          kind: "binary",
          op: expr.op,
          left: { kind: "literal", type: rec.type, value: rec.value, line: expr.line },
          right: { kind: "literal", type: resolved.type, value: resolved.value, line: expr.line },
          line: expr.line
        }, env);
        rec.value = vex.coerce(rec.type, combined, expr);
        return { type: rec.type, value: rec.value };
      });
    }

    function evalExtra(expr, env) {
      if (expr.kind === "cast") {
        return settle(vex.evalExpr(expr.expr, env), value => {
          if (expr.type === "string") requireString(expr.line);
          return { type: expr.type, value: vex.coerce(expr.type, value, expr) };
        });
      }
      if (expr.kind === "prefix" || expr.kind === "postfix") return stepVar(expr, env);
      if (expr.kind === "compound") return compoundAssign(expr, env);
      if (expr.kind === "memberCall") {
        const rec = env.lookup(expr.object);
        if (!rec) throw vex.cppError(expr.line, expr.object + " has not been declared. Declare it with int, float, or bool before using it.");
        if (expr.name === "length" && !expr.args.length && (rec.type === "string" || rec.type === "char")) {
          return { type: "int", value: String(rec.value).length };
        }
        throw vex.cppError(expr.line, "this playground can use .length() on a string.");
      }
      if (expr.kind === "callExpr") {
        return settle(callNamed(expr.name, expr.args, expr, env), result => {
          if (!result) throw vex.cppError(expr.line, expr.name + " does not produce a value.");
          return result;
        });
      }
      throw vex.cppError(expr.line, "this expression is not supported in this playground.");
    }

    function takeToken(line) {
      if (ctx.inputPos < ctx.inputTokens.length) return ctx.inputTokens[ctx.inputPos++];
      showMessage("Type in the console and press Enter.", "info");
      return readConsoleLine(ctx.token, ctx.display).then(text => {
        if (ctx.token !== runSerial) throw cancelError();
        ctx.display += text + "\n";
        const parts = String(text).trim().split(/\s+/).filter(Boolean);
        if (!parts.length) return takeToken(line);
        ctx.inputTokens = parts;
        ctx.inputPos = 1;
        showMessage("", "");
        paint(false);
        return parts[0];
      });
    }

    function storeCin(target, token, env) {
      const rec = env.lookup(target.name);
      let stored;
      if (rec.type === "string") stored = token;
      else if (rec.type === "char") {
        if (token.length !== 1) throw vex.cppError(target.line, "cin needs one character for " + target.name + ".");
        stored = token;
      } else if (rec.type === "bool") {
        if (token === "true" || token === "1") stored = true;
        else if (token === "false" || token === "0") stored = false;
        else throw vex.cppError(target.line, "cin needs true or false for " + target.name + ".");
      } else {
        const n = Number(token);
        if (!Number.isFinite(n)) throw vex.cppError(target.line, "cin needs a number for " + target.name + ".");
        stored = rec.type === "int" ? Math.trunc(n) : n;
      }
      rec.value = stored;
      rec.initialized = true;
    }

    function readCin(stmt, env, index) {
      if (index >= stmt.targets.length) return {};
      const target = stmt.targets[index];
      const rec = env.lookup(target.name);
      if (!rec) throw vex.cppError(target.line, target.name + " has not been declared. Declare it with int, float, or bool before using it.");
      if (rec.isConst) throw vex.cppError(target.line, target.name + " is const, so its value cannot be changed.");
      return settle(takeToken(target.line), token => {
        storeCin(target, token, env);
        return readCin(stmt, env, index + 1);
      });
    }

    function execList(stmts, env, context) {
      let index = 0;
      return loopBody(() => {
        if (index >= stmts.length) return {};
        const current = stmts[index];
        index += 1;
        return settle(exec(current, env, context), outcome => {
          if (outcome.returned || outcome.break || outcome.continue) return outcome;
          return LOOP;
        });
      });
    }

    function exec(stmt, env, context) {
      bump(stmt);
      if (!stmt || stmt.kind === "empty") return {};
      if (stmt.kind === "block") {
        env.push();
        try {
          return finish(execList(stmt.stmts, env, context), () => env.pop());
        } catch (err) {
          env.pop();
          throw err;
        }
      }
      if (stmt.kind === "decl") {
        if (stmt.type === "string") requireString(stmt.line);
        if (!stmt.init) {
          env.declare(stmt.name, stmt.type, null, stmt.isConst, false, stmt.line);
          return {};
        }
        return settle(vex.evalExpr(stmt.init, env), value => {
          env.declare(stmt.name, stmt.type, vex.coerce(stmt.type, value, stmt), stmt.isConst, true, stmt.line);
          return {};
        });
      }
      if (stmt.kind === "assign") {
        return settle(vex.assignVariable(stmt.name, stmt.expr, env, stmt), () => ({}));
      }
      if (stmt.kind === "compound" || stmt.kind === "postfix" || stmt.kind === "prefix" || stmt.kind === "exprStmt") {
        return settle(vex.evalExpr(stmt.kind === "exprStmt" ? stmt.expr : stmt, env), () => ({}));
      }
      if (stmt.kind === "if") {
        return settle(vex.evalExpr(stmt.cond, env), cond => {
          if (vex.isTruthy(cond)) return exec(stmt.then, env, context);
          if (stmt.else) return exec(stmt.else, env, context);
          return {};
        });
      }
      if (stmt.kind === "for") {
        env.push();
        context.loop += 1;
        const cleanup = () => {
          context.loop -= 1;
          env.pop();
        };
        function runFor() {
          return loopBody(() => {
            const cond = stmt.cond ? vex.evalExpr(stmt.cond, env) : { type: "bool", value: true };
            return settle(cond, resolved => {
              if (stmt.cond && !vex.isTruthy(resolved)) return {};
              return settle(exec(stmt.body, env, context), outcome => {
                if (outcome.returned) return outcome;
                if (outcome.break) return {};
                if (!stmt.step) return LOOP;
                return settle(vex.evalExpr(stmt.step, env), () => LOOP);
              });
            });
          });
        }
        try {
          const started = stmt.init ? settle(exec(stmt.init, env, context), runFor) : runFor();
          return finish(started, cleanup);
        } catch (err) {
          cleanup();
          throw err;
        }
      }
      if (stmt.kind === "while") {
        context.loop += 1;
        const cleanup = () => { context.loop -= 1; };
        function runWhile() {
          return loopBody(() => {
            return settle(vex.evalExpr(stmt.cond, env), cond => {
              if (!vex.isTruthy(cond)) return {};
              return settle(exec(stmt.body, env, context), outcome => {
                if (outcome.returned) return outcome;
                if (outcome.break) return {};
                return LOOP;
              });
            });
          });
        }
        try {
          return finish(runWhile(), cleanup);
        } catch (err) {
          cleanup();
          throw err;
        }
      }
      if (stmt.kind === "break") {
        if (!context.loop) throw vex.cppError(stmt.line, "break is not inside a loop.");
        return { break: true };
      }
      if (stmt.kind === "continue") {
        if (!context.loop) throw vex.cppError(stmt.line, "continue is not inside a loop.");
        return { continue: true };
      }
      if (stmt.kind === "return") {
        if (!stmt.expr) return { returned: true, bare: true, value: null, node: stmt };
        return settle(vex.evalExpr(stmt.expr, env), value => ({ returned: true, value: value, node: stmt }));
      }
      if (stmt.kind === "call") {
        return settle(callNamed(stmt.name, stmt.args, stmt, env), () => ({}));
      }
      if (stmt.kind === "cout") {
        if (!context.stream) throw vex.cppError(stmt.line, "cout needs #include <iostream>.");
        function writeParts(index) {
          if (index >= stmt.parts.length) return {};
          const part = stmt.parts[index];
          if (part.kind === "manip") {
            if (part.name === "endl") writeOut("\n");
            return writeParts(index + 1);
          }
          return settle(vex.evalExpr(part, env), value => {
            writeOut(showValue(value));
            return writeParts(index + 1);
          });
        }
        return writeParts(0);
      }
      if (stmt.kind === "cin") {
        if (!context.stream) throw vex.cppError(stmt.line, "cin needs #include <iostream>.");
        return readCin(stmt, env, 0);
      }
      throw vex.cppError(stmt.line, "this statement is not supported in this playground.");
    }

    const env = new vex.Environment();
    env.push();
    ctx.globalMap = env.stack[0];
    vex.resetSteps();
    vex.setDemoEval(function (expr, scope) { return evalExtra(expr, scope); });
    let started;
    try {
      started = settle(execList(program.globals || [], env, ctx), () => callUser(main, [], main, env));
    } catch (err) {
      if (ctx.token === runSerial) vex.setDemoEval(null);
      throw err;
    }
    return finish(settle(started, () => ctx.display), () => {
      if (ctx.token === runSerial) vex.setDemoEval(null);
    });
  }

  async function onRun() {
    stopRun();
    activeRun = false;
    const token = runSerial;
    if (!built || built.source !== code.value) {
      if (!build()) {
        renderConsole("", false);
        return;
      }
    }
    const unit = built;
    renderConsole("", false);
    showMessage("", "");
    activeRun = true;
    try {
      const output = await runProgram(unit, token);
      if (token !== runSerial) return;
      renderConsole(output, false);
      showMessage(output ? "Finished." : "Finished. The program did not print anything.", "ok");
    } catch (err) {
      if (token !== runSerial || (err && err.name === "CancelRun")) return;
      showMessage(friendly(err), "error");
    } finally {
      if (token === runSerial) activeRun = false;
    }
  }

  function openDialog() {
    dialog.hidden = false;
    document.body.style.overflow = "hidden";
    code.focus();
  }

  function closeDialog() {
    stopRun();
    activeRun = false;
    dialog.hidden = true;
    document.body.style.overflow = "";
    openButton.focus();
  }

  const saved = readCode();
  setCode(saved ? saved : STARTER);

  openButton.addEventListener("click", openDialog);
  document.getElementById("cpp-playground-close").addEventListener("click", closeDialog);
  dialog.addEventListener("click", event => {
    if (event.target === dialog) closeDialog();
  });
  document.addEventListener("keydown", event => {
    if (event.key === "Escape" && !dialog.hidden) {
      event.preventDefault();
      closeDialog();
    }
  });
  document.getElementById("cpp-playground-run").addEventListener("click", onRun);
  document.getElementById("cpp-playground-compile").addEventListener("click", onCompile);
  document.getElementById("cpp-playground-reset").addEventListener("click", () => {
    if (confirm("Replace the playground code with the Hello world program?")) {
      stopRun();
      activeRun = false;
      built = null;
      setCode(STARTER);
      renderConsole("", false);
      showMessage("", "");
    }
  });
  code.addEventListener("input", () => {
    vex.refreshEditorHighlight(code);
    writeCode(code.value);
    if (!built || built.source === code.value) return;
    built = null;
    if (activeRun) {
      stopRun();
      activeRun = false;
      showMessage("Code changed. Compile again, then Run.", "info");
      return;
    }
    showMessage("Code changed. Compile again before Run.", "info");
  });
  code.addEventListener("scroll", () => {
    highlight.scrollTop = code.scrollTop;
    highlight.scrollLeft = code.scrollLeft;
  });
  code.addEventListener("keydown", event => {
    if (event.key === "Tab") {
      event.preventDefault();
      const start = code.selectionStart;
      const end = code.selectionEnd;
      code.value = code.value.slice(0, start) + "    " + code.value.slice(end);
      code.selectionStart = code.selectionEnd = start + 4;
      code.dispatchEvent(new Event("input"));
    } else if (event.key === "Enter" && (event.ctrlKey || event.metaKey)) {
      event.preventDefault();
      onRun();
    }
  });
})();
