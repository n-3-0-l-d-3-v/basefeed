// Same identity as the dashboard (Basenine's brand): white cards and ink type, a dark pill toolbar
// like basenine.co's navigation, lime for "act", pink for "feedback". Sized for any client site.
export const css = /* css */ `
:host { all: initial; }
* { box-sizing: border-box; }
.root {
  --ivory: #fffef4; --paper: #ffffff; --sunken: #f7f5ea; --line: #e9e6d8; --line-2: #d3cfbe;
  --ink: #0a0a0a; --ink-2: #2f2d29; --muted: #6b665e; --night: #1d1c1f;
  --lime: #96ff7c; --lime-soft: #eaf6e6; --pink: #ffacca; --pink-soft: #fff0f5; --pink-deep: #b8245f; --plum: #540224;
  --info: #2747c7; --info-soft: #edf1ff; --danger: #b42318;
  --sans: "Satoshi", ui-sans-serif, system-ui, -apple-system, "Segoe UI", sans-serif;
  --pixel: "BN Pixel", ui-monospace, "SF Mono", Menlo, monospace;
  --mono: ui-monospace, "SF Mono", "Cascadia Mono", Menlo, Consolas, monospace;
  --shadow: 0 10px 30px rgba(10,10,10,.14), 0 0 0 1px rgba(10,10,10,.06);
  font: 14px/1.5 var(--sans); color: var(--ink); -webkit-font-smoothing: antialiased;
  position: fixed; inset: 0; pointer-events: none; z-index: 2147483000;
}
button, textarea, input, select { font: inherit; color: inherit; }
button { cursor: pointer; }
.ui { pointer-events: auto; }
:focus-visible { outline: 2px solid var(--ink); outline-offset: 2px; }
.eyebrow { font-family: var(--pixel); font-size: 11px; color: var(--muted); }

/* Comment mode: what you're about to comment on */
.hl { position: fixed; border: 2px solid var(--pink-deep); background: rgba(255,172,202,.16); border-radius: 4px; transition: all 60ms linear; }
.hl-label { position: fixed; display: flex; gap: 6px; align-items: center; background: var(--night); color: #fff; font: 500 11px/1 var(--mono); padding: 5px 8px; border-radius: 6px; white-space: nowrap; max-width: 60vw; overflow: hidden; text-overflow: ellipsis; box-shadow: var(--shadow); }
.hl-label b { color: var(--pink); font-weight: 500; }

/* Pins: the same marker the dashboard shows */
.pin {
  position: fixed; min-width: 28px; height: 28px; padding: 0 7px; margin: -28px 0 0 -2px; border-radius: 14px 14px 14px 3px;
  background: var(--pink); color: var(--plum); border: 2px solid var(--paper);
  font: 700 12px/24px var(--sans); text-align: center; font-variant-numeric: tabular-nums;
  box-shadow: 0 4px 14px rgba(10,10,10,.22); transition: transform 120ms ease;
  transform-origin: 0 100%;
}
.pin:hover { transform: scale(1.1); }
.pin[aria-expanded="true"] { background: var(--night); color: var(--pink); transform: scale(1.1); }
.pin.resolved { background: #e4e1d4; color: var(--muted); }
.pin.suggested { background: var(--paper); color: var(--pink-deep); border: 2px dashed var(--pink-deep); }
.pin.draft { background: var(--night); color: var(--lime); }

/* Toolbar: Basenine's dark pill */
.bar {
  position: fixed; right: 16px; bottom: 16px; display: flex; gap: 2px; align-items: center;
  background: var(--night); border-radius: 14px; padding: 5px; box-shadow: var(--shadow); font: 500 13px/1 var(--sans); color: #fff;
}
.bar .brand { font: 700 12px/1 var(--sans); letter-spacing: -.01em; padding: 0 8px 0 9px; color: #fff; }
.bar .brand i { font: normal 11px/1 var(--pixel); color: var(--lime); margin-left: 5px; }
.bar button { border: 0; background: transparent; height: 32px; padding: 0 12px; border-radius: 10px; color: rgba(255,255,255,.72); display: inline-flex; align-items: center; gap: 7px; }
.bar button:hover { color: #fff; background: rgba(255,255,255,.1); }
.bar button[aria-pressed="true"] { background: var(--lime); color: var(--ink); }
.bar .count { min-width: 20px; height: 20px; padding: 0 6px; border-radius: 10px; background: var(--pink); color: var(--plum); font: 700 11px/20px var(--sans); text-align: center; font-variant-numeric: tabular-nums; }
.bar .sep { width: 1px; align-self: stretch; background: rgba(255,255,255,.14); margin: 6px 3px; }
.bar svg { width: 15px; height: 15px; }

/* Cards: composer, thread, list */
.card {
  position: fixed; width: 340px; max-width: calc(100vw - 24px); max-height: min(560px, calc(100vh - 24px));
  display: flex; flex-direction: column; background: var(--paper); color: var(--ink);
  border-radius: 16px; box-shadow: var(--shadow); overflow: hidden;
}
.card header { display: flex; align-items: center; gap: 8px; padding: 10px 10px 10px 14px; border-bottom: 1px solid var(--line); }
.card header .grow { flex: 1; min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.card .body { padding: 14px; overflow: auto; display: flex; flex-direction: column; gap: 12px; }
.card footer { padding: 10px 14px; border-top: 1px solid var(--line); display: flex; gap: 8px; align-items: center; }
.x { border: 0; background: transparent; color: var(--muted); width: 28px; height: 28px; border-radius: 8px; display: grid; place-items: center; }
.x:hover { color: var(--ink); background: var(--sunken); }
.x svg { width: 15px; height: 15px; }

textarea {
  width: 100%; min-height: 88px; resize: vertical; background: var(--paper); border: 1px solid var(--line-2);
  border-radius: 10px; padding: 10px 12px; outline: none; line-height: 1.5; font-size: 14px;
}
textarea::placeholder { color: #9a958c; }
textarea:focus { border-color: var(--ink); box-shadow: 0 0 0 4px rgba(150,255,124,.4); }
.chips { display: flex; gap: 6px; flex-wrap: wrap; align-items: center; }
.chip { border: 1px solid var(--line-2); background: var(--paper); border-radius: 999px; padding: 3px 10px; font-size: 12px; font-weight: 500; color: var(--muted); }
.chip:hover { color: var(--ink); }
.chip[aria-pressed="true"] { background: var(--night); border-color: var(--night); color: #fff; }
.chip.p-high[aria-pressed="true"] { background: #fff3da; border-color: #f6dfae; color: #8a5300; }
.chip.p-urgent[aria-pressed="true"] { background: #fdecea; border-color: #f6c9c4; color: var(--danger); }

.btn { border: 0; height: 34px; padding: 0 14px; border-radius: 10px; font-size: 13px; font-weight: 500; background: var(--paper); box-shadow: inset 0 0 0 1px var(--line-2); display: inline-flex; align-items: center; gap: 6px; }
.btn:hover { box-shadow: inset 0 0 0 1px var(--ink); }
.btn.primary { background: var(--lime); color: var(--ink); box-shadow: none; }
.btn.primary:hover { filter: brightness(.96); }
.btn.dark { background: var(--night); color: #fff; box-shadow: none; }
.btn:disabled { opacity: .45; cursor: default; }
.spacer { flex: 1; }
.hint { color: var(--muted); font-size: 12px; line-height: 1.35; }
.meta { color: var(--muted); font-size: 12px; }
.target { display: inline-flex; align-items: center; gap: 6px; font: 500 11px/1.2 var(--mono); color: var(--ink-2); background: var(--sunken); border: 1px solid var(--line); border-radius: 6px; padding: 4px 7px; max-width: 100%; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.device { font: 11px/1 var(--pixel); color: var(--muted); white-space: nowrap; }
.err { color: var(--danger); font-size: 13px; }

.msg { display: flex; flex-direction: column; gap: 3px; }
.msg .who { font-weight: 500; font-size: 13px; }
.msg .text { white-space: pre-wrap; word-wrap: break-word; line-height: 1.5; }
.status { font-size: 11px; font-weight: 500; padding: 2px 8px; border-radius: 999px; background: var(--sunken); color: var(--ink-2); }
.status.open { background: var(--pink-soft); color: var(--pink-deep); }
.status.in_progress { background: var(--info-soft); color: var(--info); }
.status.resolved { background: var(--lime-soft); color: #1f5c12; }
.num { font: 700 12px/1 var(--sans); }
.notice { background: var(--pink-soft); border-radius: 10px; padding: 9px 11px; font-size: 13px; color: var(--ink-2); line-height: 1.45; }
.notice b { color: var(--pink-deep); font-weight: 500; display: block; }
.notice.info { background: var(--info-soft); }
.notice.info b { color: var(--info); }
.notice ul { margin: 6px 0 0; padding-left: 16px; font: 11px/1.6 var(--mono); color: var(--muted); }

.panel { position: fixed; right: 16px; bottom: 70px; width: 340px; max-height: min(70vh, 640px); }
.list { list-style: none; margin: 0; padding: 0; overflow: auto; }
.list li + li { border-top: 1px solid var(--line); }
.list li button { width: 100%; text-align: left; display: flex; gap: 10px; padding: 11px 14px; border: 0; background: transparent; }
.list li button:hover { background: var(--sunken); }
.list .badge { flex: none; min-width: 24px; height: 24px; padding: 0 6px; border-radius: 12px 12px 12px 3px; background: var(--pink); color: var(--plum); font: 700 11px/24px var(--sans); text-align: center; }
.list .badge.resolved { background: #e4e1d4; color: var(--muted); }
.list .badge.detached { background: var(--paper); color: var(--pink-deep); outline: 1.5px dashed var(--pink-deep); outline-offset: -1.5px; }
.list .line { flex: 1; min-width: 0; }
.list .line .t { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.toggle { display: inline-flex; gap: 6px; align-items: center; font-size: 12px; color: var(--muted); }
.empty { padding: 28px 16px; text-align: center; color: var(--muted); font-size: 13px; line-height: 1.5; }

.toast { position: fixed; left: 50%; bottom: 20px; transform: translateX(-50%); display: flex; gap: 8px; align-items: center; background: var(--night); color: #fff; border-radius: 12px; padding: 10px 14px; font-size: 13px; box-shadow: var(--shadow); }
.toast i { width: 7px; height: 7px; border-radius: 50%; background: var(--lime); }
.signin { position: fixed; right: 16px; bottom: 16px; width: 320px; }
.brandline { display: flex; align-items: baseline; gap: 6px; }
.brandline strong { font: 700 13px/1 var(--sans); letter-spacing: -.01em; }
.brandline span { font: 11px/1 var(--pixel); color: var(--pink-deep); }

@media (prefers-reduced-motion: reduce) { * { transition: none !important; } }
@media (max-width: 480px) {
  .card, .panel { left: 12px !important; right: 12px !important; width: auto; bottom: 66px !important; top: auto !important; }
  .bar { right: 12px; bottom: 12px; }
  .bar .brand { display: none; }
}
`;
