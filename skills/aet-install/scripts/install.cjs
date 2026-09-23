#!/usr/bin/env node
"use strict";
var __create = Object.create;
var __defProp = Object.defineProperty;
var __getOwnPropDesc = Object.getOwnPropertyDescriptor;
var __getOwnPropNames = Object.getOwnPropertyNames;
var __getProtoOf = Object.getPrototypeOf;
var __hasOwnProp = Object.prototype.hasOwnProperty;
var __commonJS = (cb, mod) => function __require() {
  try {
    return mod || (0, cb[__getOwnPropNames(cb)[0]])((mod = { exports: {} }).exports, mod), mod.exports;
  } catch (e) {
    throw mod = 0, e;
  }
};
var __copyProps = (to, from, except, desc) => {
  if (from && typeof from === "object" || typeof from === "function") {
    for (let key of __getOwnPropNames(from))
      if (!__hasOwnProp.call(to, key) && key !== except)
        __defProp(to, key, { get: () => from[key], enumerable: !(desc = __getOwnPropDesc(from, key)) || desc.enumerable });
  }
  return to;
};
var __toESM = (mod, isNodeMode, target) => (target = mod != null ? __create(__getProtoOf(mod)) : {}, __copyProps(
  // If the importer is in node compatibility mode or this is not an ESM
  // file that has been converted to a CommonJS file using a Babel-
  // compatible transform (i.e. "__esModule" has not been set), then set
  // "default" to the CommonJS "module.exports" for node compatibility.
  isNodeMode || !mod || !mod.__esModule ? __defProp(target, "default", { value: mod, enumerable: true }) : target,
  mod
));

// node_modules/isexe/windows.js
var require_windows = __commonJS({
  "node_modules/isexe/windows.js"(exports2, module2) {
    module2.exports = isexe;
    isexe.sync = sync;
    var fs = require("fs");
    function checkPathExt(path, options) {
      var pathext = options.pathExt !== void 0 ? options.pathExt : process.env.PATHEXT;
      if (!pathext) {
        return true;
      }
      pathext = pathext.split(";");
      if (pathext.indexOf("") !== -1) {
        return true;
      }
      for (var i = 0; i < pathext.length; i++) {
        var p = pathext[i].toLowerCase();
        if (p && path.substr(-p.length).toLowerCase() === p) {
          return true;
        }
      }
      return false;
    }
    function checkStat(stat, path, options) {
      if (!stat.isSymbolicLink() && !stat.isFile()) {
        return false;
      }
      return checkPathExt(path, options);
    }
    function isexe(path, options, cb) {
      fs.stat(path, function(er, stat) {
        cb(er, er ? false : checkStat(stat, path, options));
      });
    }
    function sync(path, options) {
      return checkStat(fs.statSync(path), path, options);
    }
  }
});

// node_modules/isexe/mode.js
var require_mode = __commonJS({
  "node_modules/isexe/mode.js"(exports2, module2) {
    module2.exports = isexe;
    isexe.sync = sync;
    var fs = require("fs");
    function isexe(path, options, cb) {
      fs.stat(path, function(er, stat) {
        cb(er, er ? false : checkStat(stat, options));
      });
    }
    function sync(path, options) {
      return checkStat(fs.statSync(path), options);
    }
    function checkStat(stat, options) {
      return stat.isFile() && checkMode(stat, options);
    }
    function checkMode(stat, options) {
      var mod = stat.mode;
      var uid = stat.uid;
      var gid = stat.gid;
      var myUid = options.uid !== void 0 ? options.uid : process.getuid && process.getuid();
      var myGid = options.gid !== void 0 ? options.gid : process.getgid && process.getgid();
      var u = parseInt("100", 8);
      var g = parseInt("010", 8);
      var o = parseInt("001", 8);
      var ug = u | g;
      var ret = mod & o || mod & g && gid === myGid || mod & u && uid === myUid || mod & ug && myUid === 0;
      return ret;
    }
  }
});

// node_modules/isexe/index.js
var require_isexe = __commonJS({
  "node_modules/isexe/index.js"(exports2, module2) {
    var fs = require("fs");
    var core;
    if (process.platform === "win32" || global.TESTING_WINDOWS) {
      core = require_windows();
    } else {
      core = require_mode();
    }
    module2.exports = isexe;
    isexe.sync = sync;
    function isexe(path, options, cb) {
      if (typeof options === "function") {
        cb = options;
        options = {};
      }
      if (!cb) {
        if (typeof Promise !== "function") {
          throw new TypeError("callback not provided");
        }
        return new Promise(function(resolve, reject) {
          isexe(path, options || {}, function(er, is) {
            if (er) {
              reject(er);
            } else {
              resolve(is);
            }
          });
        });
      }
      core(path, options || {}, function(er, is) {
        if (er) {
          if (er.code === "EACCES" || options && options.ignoreErrors) {
            er = null;
            is = false;
          }
        }
        cb(er, is);
      });
    }
    function sync(path, options) {
      try {
        return core.sync(path, options || {});
      } catch (er) {
        if (options && options.ignoreErrors || er.code === "EACCES") {
          return false;
        } else {
          throw er;
        }
      }
    }
  }
});

// node_modules/which/which.js
var require_which = __commonJS({
  "node_modules/which/which.js"(exports2, module2) {
    var isWindows = process.platform === "win32" || process.env.OSTYPE === "cygwin" || process.env.OSTYPE === "msys";
    var path = require("path");
    var COLON = isWindows ? ";" : ":";
    var isexe = require_isexe();
    var getNotFoundError = (cmd) => Object.assign(new Error(`not found: ${cmd}`), { code: "ENOENT" });
    var getPathInfo = (cmd, opt) => {
      const colon = opt.colon || COLON;
      const pathEnv = cmd.match(/\//) || isWindows && cmd.match(/\\/) ? [""] : [
        // windows always checks the cwd first
        ...isWindows ? [process.cwd()] : [],
        ...(opt.path || process.env.PATH || /* istanbul ignore next: very unusual */
        "").split(colon)
      ];
      const pathExtExe = isWindows ? opt.pathExt || process.env.PATHEXT || ".EXE;.CMD;.BAT;.COM" : "";
      const pathExt = isWindows ? pathExtExe.split(colon) : [""];
      if (isWindows) {
        if (cmd.indexOf(".") !== -1 && pathExt[0] !== "")
          pathExt.unshift("");
      }
      return {
        pathEnv,
        pathExt,
        pathExtExe
      };
    };
    var which = (cmd, opt, cb) => {
      if (typeof opt === "function") {
        cb = opt;
        opt = {};
      }
      if (!opt)
        opt = {};
      const { pathEnv, pathExt, pathExtExe } = getPathInfo(cmd, opt);
      const found = [];
      const step = (i) => new Promise((resolve, reject) => {
        if (i === pathEnv.length)
          return opt.all && found.length ? resolve(found) : reject(getNotFoundError(cmd));
        const ppRaw = pathEnv[i];
        const pathPart = /^".*"$/.test(ppRaw) ? ppRaw.slice(1, -1) : ppRaw;
        const pCmd = path.join(pathPart, cmd);
        const p = !pathPart && /^\.[\\\/]/.test(cmd) ? cmd.slice(0, 2) + pCmd : pCmd;
        resolve(subStep(p, i, 0));
      });
      const subStep = (p, i, ii) => new Promise((resolve, reject) => {
        if (ii === pathExt.length)
          return resolve(step(i + 1));
        const ext = pathExt[ii];
        isexe(p + ext, { pathExt: pathExtExe }, (er, is) => {
          if (!er && is) {
            if (opt.all)
              found.push(p + ext);
            else
              return resolve(p + ext);
          }
          return resolve(subStep(p, i, ii + 1));
        });
      });
      return cb ? step(0).then((res) => cb(null, res), cb) : step(0);
    };
    var whichSync = (cmd, opt) => {
      opt = opt || {};
      const { pathEnv, pathExt, pathExtExe } = getPathInfo(cmd, opt);
      const found = [];
      for (let i = 0; i < pathEnv.length; i++) {
        const ppRaw = pathEnv[i];
        const pathPart = /^".*"$/.test(ppRaw) ? ppRaw.slice(1, -1) : ppRaw;
        const pCmd = path.join(pathPart, cmd);
        const p = !pathPart && /^\.[\\\/]/.test(cmd) ? cmd.slice(0, 2) + pCmd : pCmd;
        for (let j = 0; j < pathExt.length; j++) {
          const cur = p + pathExt[j];
          try {
            const is = isexe.sync(cur, { pathExt: pathExtExe });
            if (is) {
              if (opt.all)
                found.push(cur);
              else
                return cur;
            }
          } catch (ex) {
          }
        }
      }
      if (opt.all && found.length)
        return found;
      if (opt.nothrow)
        return null;
      throw getNotFoundError(cmd);
    };
    module2.exports = which;
    which.sync = whichSync;
  }
});

// node_modules/path-key/index.js
var require_path_key = __commonJS({
  "node_modules/path-key/index.js"(exports2, module2) {
    "use strict";
    var pathKey = (options = {}) => {
      const environment = options.env || process.env;
      const platform = options.platform || process.platform;
      if (platform !== "win32") {
        return "PATH";
      }
      return Object.keys(environment).reverse().find((key) => key.toUpperCase() === "PATH") || "Path";
    };
    module2.exports = pathKey;
    module2.exports.default = pathKey;
  }
});

// node_modules/cross-spawn/lib/util/resolveCommand.js
var require_resolveCommand = __commonJS({
  "node_modules/cross-spawn/lib/util/resolveCommand.js"(exports2, module2) {
    "use strict";
    var path = require("path");
    var which = require_which();
    var getPathKey = require_path_key();
    function resolveCommandAttempt(parsed, withoutPathExt) {
      const env = parsed.options.env || process.env;
      const cwd = process.cwd();
      const hasCustomCwd = parsed.options.cwd != null;
      const shouldSwitchCwd = hasCustomCwd && process.chdir !== void 0 && !process.chdir.disabled;
      if (shouldSwitchCwd) {
        try {
          process.chdir(parsed.options.cwd);
        } catch (err) {
        }
      }
      let resolved;
      try {
        resolved = which.sync(parsed.command, {
          path: env[getPathKey({ env })],
          pathExt: withoutPathExt ? path.delimiter : void 0
        });
      } catch (e) {
      } finally {
        if (shouldSwitchCwd) {
          process.chdir(cwd);
        }
      }
      if (resolved) {
        resolved = path.resolve(hasCustomCwd ? parsed.options.cwd : "", resolved);
      }
      return resolved;
    }
    function resolveCommand(parsed) {
      return resolveCommandAttempt(parsed) || resolveCommandAttempt(parsed, true);
    }
    module2.exports = resolveCommand;
  }
});

// node_modules/cross-spawn/lib/util/escape.js
var require_escape = __commonJS({
  "node_modules/cross-spawn/lib/util/escape.js"(exports2, module2) {
    "use strict";
    var metaCharsRegExp = /([()\][%!^"`<>&|;, *?])/g;
    function escapeCommand(arg) {
      arg = arg.replace(metaCharsRegExp, "^$1");
      return arg;
    }
    function escapeArgument(arg, doubleEscapeMetaChars) {
      arg = `${arg}`;
      arg = arg.replace(/(?=(\\+?)?)\1"/g, '$1$1\\"');
      arg = arg.replace(/(?=(\\+?)?)\1$/, "$1$1");
      arg = `"${arg}"`;
      arg = arg.replace(metaCharsRegExp, "^$1");
      if (doubleEscapeMetaChars) {
        arg = arg.replace(metaCharsRegExp, "^$1");
      }
      return arg;
    }
    module2.exports.command = escapeCommand;
    module2.exports.argument = escapeArgument;
  }
});

// node_modules/shebang-regex/index.js
var require_shebang_regex = __commonJS({
  "node_modules/shebang-regex/index.js"(exports2, module2) {
    "use strict";
    module2.exports = /^#!(.*)/;
  }
});

// node_modules/shebang-command/index.js
var require_shebang_command = __commonJS({
  "node_modules/shebang-command/index.js"(exports2, module2) {
    "use strict";
    var shebangRegex = require_shebang_regex();
    module2.exports = (string = "") => {
      const match = string.match(shebangRegex);
      if (!match) {
        return null;
      }
      const [path, argument] = match[0].replace(/#! ?/, "").split(" ");
      const binary = path.split("/").pop();
      if (binary === "env") {
        return argument;
      }
      return argument ? `${binary} ${argument}` : binary;
    };
  }
});

// node_modules/cross-spawn/lib/util/readShebang.js
var require_readShebang = __commonJS({
  "node_modules/cross-spawn/lib/util/readShebang.js"(exports2, module2) {
    "use strict";
    var fs = require("fs");
    var shebangCommand = require_shebang_command();
    function readShebang(command) {
      const size = 150;
      const buffer = Buffer.alloc(size);
      let fd;
      try {
        fd = fs.openSync(command, "r");
        fs.readSync(fd, buffer, 0, size, 0);
        fs.closeSync(fd);
      } catch (e) {
      }
      return shebangCommand(buffer.toString());
    }
    module2.exports = readShebang;
  }
});

// node_modules/cross-spawn/lib/parse.js
var require_parse = __commonJS({
  "node_modules/cross-spawn/lib/parse.js"(exports2, module2) {
    "use strict";
    var path = require("path");
    var resolveCommand = require_resolveCommand();
    var escape = require_escape();
    var readShebang = require_readShebang();
    var isWin = process.platform === "win32";
    var isExecutableRegExp = /\.(?:com|exe)$/i;
    var isCmdShimRegExp = /node_modules[\\/].bin[\\/][^\\/]+\.cmd$/i;
    function detectShebang(parsed) {
      parsed.file = resolveCommand(parsed);
      const shebang = parsed.file && readShebang(parsed.file);
      if (shebang) {
        parsed.args.unshift(parsed.file);
        parsed.command = shebang;
        return resolveCommand(parsed);
      }
      return parsed.file;
    }
    function parseNonShell(parsed) {
      if (!isWin) {
        return parsed;
      }
      const commandFile = detectShebang(parsed);
      const needsShell = !isExecutableRegExp.test(commandFile);
      if (parsed.options.forceShell || needsShell) {
        const needsDoubleEscapeMetaChars = isCmdShimRegExp.test(commandFile);
        parsed.command = path.normalize(parsed.command);
        parsed.command = escape.command(parsed.command);
        parsed.args = parsed.args.map((arg) => escape.argument(arg, needsDoubleEscapeMetaChars));
        const shellCommand = [parsed.command].concat(parsed.args).join(" ");
        parsed.args = ["/d", "/s", "/c", `"${shellCommand}"`];
        parsed.command = process.env.comspec || "cmd.exe";
        parsed.options.windowsVerbatimArguments = true;
      }
      return parsed;
    }
    function parse(command, args, options) {
      if (args && !Array.isArray(args)) {
        options = args;
        args = null;
      }
      args = args ? args.slice(0) : [];
      options = Object.assign({}, options);
      const parsed = {
        command,
        args,
        options,
        file: void 0,
        original: {
          command,
          args
        }
      };
      return options.shell ? parsed : parseNonShell(parsed);
    }
    module2.exports = parse;
  }
});

// node_modules/cross-spawn/lib/enoent.js
var require_enoent = __commonJS({
  "node_modules/cross-spawn/lib/enoent.js"(exports2, module2) {
    "use strict";
    var isWin = process.platform === "win32";
    function notFoundError(original, syscall) {
      return Object.assign(new Error(`${syscall} ${original.command} ENOENT`), {
        code: "ENOENT",
        errno: "ENOENT",
        syscall: `${syscall} ${original.command}`,
        path: original.command,
        spawnargs: original.args
      });
    }
    function hookChildProcess(cp, parsed) {
      if (!isWin) {
        return;
      }
      const originalEmit = cp.emit;
      cp.emit = function(name, arg1) {
        if (name === "exit") {
          const err = verifyENOENT(arg1, parsed);
          if (err) {
            return originalEmit.call(cp, "error", err);
          }
        }
        return originalEmit.apply(cp, arguments);
      };
    }
    function verifyENOENT(status, parsed) {
      if (isWin && status === 1 && !parsed.file) {
        return notFoundError(parsed.original, "spawn");
      }
      return null;
    }
    function verifyENOENTSync(status, parsed) {
      if (isWin && status === 1 && !parsed.file) {
        return notFoundError(parsed.original, "spawnSync");
      }
      return null;
    }
    module2.exports = {
      hookChildProcess,
      verifyENOENT,
      verifyENOENTSync,
      notFoundError
    };
  }
});

// node_modules/cross-spawn/index.js
var require_cross_spawn = __commonJS({
  "node_modules/cross-spawn/index.js"(exports2, module2) {
    "use strict";
    var cp = require("child_process");
    var parse = require_parse();
    var enoent = require_enoent();
    function spawn2(command, args, options) {
      const parsed = parse(command, args, options);
      const spawned = cp.spawn(parsed.command, parsed.args, parsed.options);
      enoent.hookChildProcess(spawned, parsed);
      return spawned;
    }
    function spawnSync(command, args, options) {
      const parsed = parse(command, args, options);
      const result = cp.spawnSync(parsed.command, parsed.args, parsed.options);
      result.error = result.error || enoent.verifyENOENTSync(result.status, parsed);
      return result;
    }
    module2.exports = spawn2;
    module2.exports.spawn = spawn2;
    module2.exports.sync = spawnSync;
    module2.exports._parse = parse;
    module2.exports._enoent = enoent;
  }
});

// install.ts
var import_cross_spawn = __toESM(require_cross_spawn(), 1);
var import_node_fs = require("node:fs");
var import_node_path = require("node:path");
var MIN_NODE_MAJOR = 18;
function readBundledVersion(cliDir) {
  try {
    const pkg = JSON.parse((0, import_node_fs.readFileSync)((0, import_node_path.join)(cliDir, "package.json"), "utf8"));
    return pkg.version ?? null;
  } catch {
    return null;
  }
}
function fail(code, message) {
  console.error(`[aet:ensure] ${message}`);
  process.exit(code);
}
function run(cmd, args, opts = {}) {
  const res = import_cross_spawn.default.sync(cmd, args, {
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
    ...opts
  });
  return {
    status: res.status,
    stdout: (res.stdout || "").trim(),
    stderr: (res.stderr || "").trim(),
    error: res.error ? res.error.message : null
  };
}
function gte(a, b) {
  const norm = (s) => String(s || "").replace(/^[^\d]*/, "").split(".").map((n) => parseInt(n, 10) || 0);
  const pa = norm(a);
  const pb = norm(b);
  for (let i = 0; i < Math.max(pa.length, pb.length); i++) {
    const x = pa[i] || 0;
    const y = pb[i] || 0;
    if (x > y) return true;
    if (x < y) return false;
  }
  return true;
}
function main() {
  const selfDir = __dirname;
  const cliDir = (0, import_node_path.join)(selfDir, "..", "cli");
  const runtimeDir = (0, import_node_path.join)(selfDir, "..", "runtime");
  const installSrc = cliDir;
  if (!process.versions?.node) {
    fail(41, "Node.js is required but not available. Install Node.js >= 18, then run /init again.");
  }
  const nodeMajor = parseInt(process.versions.node.split(".")[0], 10);
  if (nodeMajor < MIN_NODE_MAJOR) {
    fail(41, `AET requires Node.js >= ${MIN_NODE_MAJOR}; found ${process.versions.node}. Please upgrade Node.js, then run /init again.`);
  }
  const npm = run("npm", ["--version"]);
  if (npm.error || !npm.stdout) {
    fail(42, `npm is required to install the AET CLI but was not found (${npm.error || "no version output"}). Install npm / Node.js, then run /init again.`);
  }
  const bundledVersion = readBundledVersion(cliDir);
  if (!bundledVersion) {
    fail(43, `Bundled AET CLI package not found at ${installSrc}. Reinstall the plugin, then run /init again.`);
  }
  let installedVersion = null;
  const existing = run("aet", ["--version"]);
  if (!existing.error && existing.stdout) {
    installedVersion = existing.stdout.trim();
    if (gte(installedVersion, bundledVersion)) {
      console.log(`[aet:ensure] AET CLI ${installedVersion} already installed (need >= ${bundledVersion}); skipping install.`);
    } else {
      console.log(`[aet:ensure] global AET CLI ${installedVersion} is older than bundled ${bundledVersion}; upgrading.`);
      installCli(installSrc);
    }
  } else {
    console.log("[aet:ensure] global AET CLI not found; installing.");
    installCli(installSrc);
  }
  syncRuntime(runtimeDir);
  installGraphify();
}
function installCli(installSrc) {
  const res = run("npm", ["install", "-g", installSrc], {
    env: { ...process.env, npm_config_fund: "false", npm_config_audit: "false" }
  });
  if (res.status !== 0) {
    fail(44, `npm install -g failed.
  stdout: ${res.stdout || "(empty)"}
  stderr: ${res.stderr || res.error || "(empty)"}

AET init failed: the CLI could not be installed. Check the npm output above (often a permissions issue \u2014 consider fixing your global npm prefix), then run /init again.`);
  }
  const check = run("aet", ["--version"]);
  if (check.error || !check.stdout) {
    fail(45, `AET CLI was installed globally but the \`aet\` command could not be found on PATH.
  npm said: ${res.stdout || res.stderr || "(no output)"}
  check said: ${check.error || "(no version output)"}

AET init failed: add npm's global bin directory to your PATH, then run /init again.`);
  }
  console.log(`[aet:ensure] AET CLI ${check.stdout} installed globally. You can now run \`aet\` from your terminal.`);
}
function globalAetDir() {
  const base = process.env.AET_GLOBAL_ROOT || (process.env.HOME || "");
  return (0, import_node_path.join)(base, ".aet");
}
function copyRuntimeFile(relPath, srcFile, destFile, whitelist) {
  const destExists = (0, import_node_fs.existsSync)(destFile);
  if (whitelist.includes(relPath) && destExists) {
    console.log(`[aet:ensure]    keep existing ${relPath} (whitelisted)`);
    return false;
  }
  (0, import_node_fs.mkdirSync)((0, import_node_path.dirname)(destFile), { recursive: true });
  (0, import_node_fs.copyFileSync)(srcFile, destFile);
  return true;
}
function syncRuntimeTree(runtimeDir, aetDir, whitelist) {
  let copied = 0;
  let kept = 0;
  const walk = (srcDir, relPrefix) => {
    for (const entry of (0, import_node_fs.readdirSync)(srcDir, { withFileTypes: true })) {
      if (entry.name === "runtime-meta.json") continue;
      const s = (0, import_node_path.join)(srcDir, entry.name);
      const relPath = relPrefix ? `${relPrefix}/${entry.name}` : entry.name;
      if (entry.isDirectory()) {
        walk(s, relPath);
      } else if (entry.isFile()) {
        const destFile = (0, import_node_path.join)(aetDir, relPath);
        if (copyRuntimeFile(relPath, s, destFile, whitelist)) copied++;
        else kept++;
      }
    }
  };
  walk(runtimeDir, "");
  return { copied, kept };
}
function readWhitelist(runtimeDir) {
  const metaPath = (0, import_node_path.join)(runtimeDir, "runtime-meta.json");
  if (!(0, import_node_fs.existsSync)(metaPath)) return [];
  try {
    const meta = JSON.parse((0, import_node_fs.readFileSync)(metaPath, "utf8"));
    return Array.isArray(meta.whitelist) ? meta.whitelist : [];
  } catch {
    return [];
  }
}
function syncRuntime(runtimeDir) {
  if (!(0, import_node_fs.existsSync)(runtimeDir)) {
    console.log(`[aet:ensure] runtime dir not found at ${runtimeDir}; skipping runtime sync.`);
    return;
  }
  const aetDir = globalAetDir();
  const whitelist = readWhitelist(runtimeDir);
  console.log(`[aet:ensure] syncing AET runtime \u2192 ${aetDir} ...`);
  const { copied, kept } = syncRuntimeTree(runtimeDir, aetDir, whitelist);
  console.log(`[aet:ensure] AET runtime synced to ${aetDir}; ${copied} copied, ${kept} preserved.`);
}
function installGraphify() {
  const aetDir = globalAetDir();
  const venvDir = (0, import_node_path.join)(aetDir, "venv");
  const venvPython = (0, import_node_path.join)(venvDir, "bin", "python3");
  const venvPip = (0, import_node_path.join)(venvDir, "bin", "pip");
  if ((0, import_node_fs.existsSync)(venvPython)) {
    const venvCheck = run(venvPython, ["-c", "import graphify"]);
    if (venvCheck.status === 0) {
      console.log("[aet:ensure] graphify already installed (~/.aet/venv); skipping.");
      return { status: "ready" };
    }
  }
  const cmdCheck = run("graphify", ["--version"]);
  if (!cmdCheck.error) {
    console.log("[aet:ensure] graphify already on PATH; skipping.");
    return { status: "ready" };
  }
  const pyProbe = run("python3", ["--version"]);
  if (!pyProbe.error && pyProbe.status === 0) {
    const sysCheck = run("python3", ["-c", "import graphify"]);
    if (sysCheck.status === 0) {
      console.log("[aet:ensure] graphify already installed (system python3); skipping.");
      return { status: "ready" };
    }
  }
  if (pyProbe.error || pyProbe.status !== 0) {
    const reason = "python3 not available on PATH (graphify requires Python 3)";
    console.log(`[aet:ensure] graphify NOT installed: ${reason}.`);
    return { status: "failed", reason };
  }
  if (!(0, import_node_fs.existsSync)(venvPython)) {
    console.log("[aet:ensure] creating venv for graphify (~/.aet/venv)...");
    const venvCreate = run("python3", ["-m", "venv", venvDir]);
    if (venvCreate.status !== 0) {
      const reason = `venv creation failed (${venvCreate.stderr || venvCreate.error || "unknown error"})`;
      console.log(`[aet:ensure] graphify NOT installed: ${reason}.`);
      return { status: "failed", reason };
    }
  }
  if (!(0, import_node_fs.existsSync)(venvPip)) {
    const reason = `venv pip missing at ${venvPip} (venv may be incomplete; remove ~/.aet/venv and re-run /init)`;
    console.log(`[aet:ensure] graphify NOT installed: ${reason}.`);
    return { status: "failed", reason };
  }
  console.log("[aet:ensure] installing graphifyy into ~/.aet/venv (network required)...");
  const install = run(venvPip, ["install", "--no-input", "graphifyy"], {
    env: { ...process.env, PIP_NO_INPUT: "1", PIP_DISABLE_PIP_VERSION_CHECK: "1" },
    timeout: 5 * 60 * 1e3
    // 5 min ceiling for the network install
  });
  if (install.status !== 0) {
    const detail = install.error ? install.error : install.stderr || "network/dependency error or timeout";
    const reason = `pip install graphifyy failed (${detail})`;
    console.log(`[aet:ensure] graphify NOT installed: ${reason}.`);
    return { status: "failed", reason };
  }
  const verify = run(venvPython, ["-c", "import graphify"]);
  if (verify.status !== 0) {
    const reason = `graphifyy installed but \`import graphify\` failed (${verify.stderr || verify.error || "unknown"})`;
    console.log(`[aet:ensure] graphify NOT installed: ${reason}.`);
    return { status: "failed", reason };
  }
  console.log("[aet:ensure] graphify installed into ~/.aet/venv.");
  return { status: "installed" };
}
main();
