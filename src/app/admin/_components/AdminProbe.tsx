// Blank-screen probe. Plain DOM, no React: it runs from the server HTML even if
// the app never hydrates. When nothing of the console is on screen 4 s after
// load (or with ?debug=1), it prints what it sees in a box to screenshot.
const PROBE = `(function(){
  var errs = [];
  addEventListener("error", function (e) { errs.push((e.message || "error") + " @ " + String(e.filename || "").split("/").pop() + ":" + (e.lineno || "")); });
  addEventListener("unhandledrejection", function (e) { var r = e.reason; errs.push("promise: " + String((r && r.message) || r)); });
  var origError = console.error;
  console.error = function () { try { errs.push("console: " + Array.prototype.map.call(arguments, function (a) { return a && a.message ? a.message : String(a); }).join(" ").slice(0, 300)); } catch (x) {} return origError.apply(console, arguments); };

  function desc(el) { if (!el) return "none"; var c = typeof el.className === "string" ? el.className : ""; return el.tagName.toLowerCase() + (c ? "." + c.trim().split(/\\s+/).join(".") : ""); }
  function seen(sel) {
    var el = document.querySelector(sel);
    if (!el) return false;
    var r = el.getBoundingClientRect(), cs = getComputedStyle(el);
    if (r.width < 2 || r.height < 2 || r.right <= 0 || r.bottom <= 0 || r.left >= innerWidth || r.top >= innerHeight) return false;
    if (cs.visibility === "hidden" || +cs.opacity < 0.05) return false;
    var x = Math.min(innerWidth - 1, Math.max(0, r.left + Math.min(r.width, 40) / 2)), y = Math.min(innerHeight - 1, Math.max(0, r.top + Math.min(r.height, 40) / 2));
    var top = document.elementFromPoint(x, y);
    return !!top && (el === top || el.contains(top));
  }
  function info(sel) {
    var el = document.querySelector(sel);
    if (!el) return sel + ": absent";
    var r = el.getBoundingClientRect(), cs = getComputedStyle(el);
    return sel + ": " + Math.round(r.left) + "," + Math.round(r.top) + " " + Math.round(r.width) + "x" + Math.round(r.height) + " op=" + cs.opacity + " vis=" + cs.visibility + " disp=" + cs.display + " tf=" + cs.transform + " anim=" + cs.animationName + "/" + cs.animationPlayState;
  }
  function report(force) {
    if (!force && (seen(".tc-side") || seen(".tc-topbar") || seen(".tc-head") || seen(".tc-gate__box"))) return;
    var shell = document.querySelector(".tc-shell") || document.querySelector(".tc-gate");
    var lines = [
      "TRACKIT ADMIN DIAGNOSTIC (screenshot this)",
      "url: " + location.pathname + location.search + " | ready: " + document.readyState + " | hydrated: " + (document.querySelector(".tc-shell,.tc-gate") && Object.keys(document.querySelector(".tc-shell,.tc-gate")).some(function (k) { return k.indexOf("__react") === 0; })),
      "viewport: " + innerWidth + "x" + innerHeight + " dpr=" + devicePixelRatio + " zoom=" + (window.visualViewport ? visualViewport.scale : "?") + " | fonts: " + (document.fonts ? document.fonts.status : "?"),
      "container: " + desc(shell) + (shell ? " children=" + shell.children.length + " scroll=" + shell.scrollLeft + "," + shell.scrollTop + "/" + shell.scrollWidth + "x" + shell.scrollHeight : ""),
      info(".tc-side"), info(".tc-main"), info(".tc-topbar"), info(".tc-content"), info(".tc-head"), info(".tc-gate__box"),
      "at center: " + desc(document.elementFromPoint(innerWidth / 2, innerHeight / 2)),
      "at 120,120: " + desc(document.elementFromPoint(120, 120)),
      "body children: " + Array.prototype.map.call(document.body.children, desc).join(" | ").slice(0, 400),
      "errors (" + errs.length + "): " + (errs.slice(-6).join(" || ") || "none"),
      "ua: " + navigator.userAgent
    ];
    var box = document.createElement("pre");
    box.id = "tc-probe";
    box.textContent = lines.join("\\n");
    box.setAttribute("style", "position:fixed;left:12px;right:12px;bottom:12px;z-index:2147483647;margin:0;padding:14px 16px;max-height:70vh;overflow:auto;background:#111;color:#f3f4f7;font:12px/1.5 ui-monospace,Consolas,monospace;white-space:pre-wrap;word-break:break-word;border-radius:12px;box-shadow:0 10px 40px rgba(0,0,0,.5);opacity:1;visibility:visible;transform:none;animation:none");
    var close = document.createElement("button");
    close.textContent = "×";
    close.setAttribute("style", "position:absolute;top:6px;right:10px;background:none;border:0;color:#fff;font-size:20px;cursor:pointer");
    close.onclick = function () { box.remove(); };
    box.appendChild(close);
    var old = document.getElementById("tc-probe");
    if (old) old.remove();
    document.documentElement.appendChild(box);
  }
  var force = /[?&]debug=1/.test(location.search);
  function arm() { setTimeout(function () { report(force); }, 4000); }
  if (document.readyState === "complete") arm(); else addEventListener("load", arm);
})();`;

export function AdminProbe() {
  return <script dangerouslySetInnerHTML={{ __html: PROBE }} />;
}
