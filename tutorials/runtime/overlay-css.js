// Styles du calque des tutoriels (injectés dans la page ; la CSP autorise les styles en ligne).

export const OVERLAY_CSS = `
body.tuto #app { height: calc(100vh - 26px); margin-top: 26px; }
.tuto-menubar {
  position: fixed; top: 0; left: 0; right: 0; height: 26px; z-index: 5;
  display: flex; align-items: center; gap: 2px; padding: 0 6px;
  background: #2b2b2b; border-bottom: 1px solid #3c3c3c; font: 13px system-ui, sans-serif; color: #ddd;
}
.tuto-menu { padding: 3px 9px; border-radius: 3px; }
.tuto-menu.open { background: #094771; color: #fff; }

.tuto-root, .tuto-root:popover-open {
  position: fixed; inset: 0; width: 100vw; height: 100vh; max-width: none; max-height: none;
  margin: 0; padding: 0; border: 0; background: transparent; overflow: hidden; pointer-events: none;
  font: 15px system-ui, "Segoe UI", sans-serif; color: #fff;
}
.tuto-root * { pointer-events: none; }

.tuto-cursor { position: absolute; left: 0; top: 0; z-index: 50; filter: drop-shadow(0 2px 3px rgba(0,0,0,.6)); transition: opacity .3s; }
.tuto-ripple {
  position: absolute; width: 14px; height: 14px; margin: -7px 0 0 -7px; border-radius: 50%; z-index: 49;
  border: 3px solid #ffca28; animation: tuto-ripple .65s ease-out forwards;
}
@keyframes tuto-ripple { to { transform: scale(3.4); opacity: 0; } }

.tuto-keys {
  position: absolute; left: 50%; bottom: 46px; transform: translate(-50%, 20px); opacity: 0;
  display: flex; align-items: center; gap: 8px; padding: 10px 16px; z-index: 40;
  background: rgba(20,20,24,.88); border: 1px solid #555; border-radius: 12px; transition: all .25s;
}
.tuto-keys.show { opacity: 1; transform: translate(-50%, 0); }
.tuto-keys kbd {
  font: 600 20px system-ui, sans-serif; min-width: 22px; text-align: center; padding: 6px 12px;
  background: linear-gradient(#4a4a52, #33333a); border: 1px solid #777; border-bottom-width: 3px; border-radius: 7px; color: #fff;
}
.tuto-plus { font-size: 20px; color: #aaa; }

.tuto-tag {
  position: absolute; left: 58px; top: 76px; z-index: 30; padding: 5px 12px; border-radius: 14px;
  background: rgba(14,99,156,.9); font-size: 14px; font-weight: 600; opacity: 0; transition: opacity .4s;
}
.tuto-tag.show { opacity: 1; }

.tuto-hl {
  position: absolute; z-index: 20; border: 3px solid #ffca28; border-radius: 6px; opacity: 0; transition: opacity .3s;
  box-shadow: 0 0 0 2px rgba(0,0,0,.4), 0 0 18px rgba(255,202,40,.55);
}
.tuto-hl.dim { box-shadow: 0 0 0 9999px rgba(0,0,0,.5), 0 0 18px rgba(255,202,40,.55); }
.tuto-hl.show { opacity: 1; }
.tuto-tip {
  position: absolute; left: 50%; transform: translateX(-50%); white-space: nowrap; z-index: 21;
  padding: 7px 13px; border-radius: 8px; background: #ffca28; color: #1b1b1b; font-weight: 700; font-size: 16px;
  box-shadow: 0 4px 14px rgba(0,0,0,.45);
}
.tuto-tip.above { bottom: calc(100% + 10px); }
.tuto-tip.below { top: calc(100% + 10px); }
.tuto-tip.left { right: calc(100% + 12px); left: auto; transform: translateY(-50%); top: 50%; }
.tuto-tip.right { left: calc(100% + 12px); transform: translateY(-50%); top: 50%; }
.tuto-tip.inside { top: 8px; }

.tuto-note {
  position: absolute; z-index: 22; transform: translate(14px, -50%) scale(.9); opacity: 0; transition: all .3s;
  max-width: 340px; padding: 8px 12px; border-radius: 8px; background: rgba(255,255,255,.96); color: #1b1b1b;
  font-weight: 600; font-size: 15px; box-shadow: 0 4px 14px rgba(0,0,0,.45); border-left: 5px solid #ffca28;
}
.tuto-note.show { opacity: 1; transform: translate(14px, -50%) scale(1); }

.tuto-ghost {
  position: absolute; left: 0; top: 0; z-index: 45; padding: 4px 9px; border-radius: 5px;
  background: rgba(14,99,156,.92); font-size: 13px;
}

.tuto-dropdown {
  position: absolute; z-index: 35; background: #252526; border: 1px solid #555; border-radius: 4px;
  box-shadow: 0 8px 22px rgba(0,0,0,.55); padding: 4px 0; font-size: 13px; color: #ddd;
}
.tuto-dropdown > div { padding: 4px 14px; }
.tuto-dropdown > div.on { background: #094771; color: #fff; }
.tuto-dropdown hr { border: 0; border-top: 1px solid #444; margin: 4px 0; }
.tuto-menudrop { min-width: 300px; }
.tuto-mi { display: flex; justify-content: space-between; gap: 30px; }
.tuto-mi em { font-style: normal; color: #999; }
.tuto-mi.on em { color: #ddd; }

.tuto-filedlg {
  position: absolute; left: 50%; top: 45%; transform: translate(-50%, -50%); z-index: 36; width: 560px;
  background: #f3f3f3; color: #222; border-radius: 8px; box-shadow: 0 18px 50px rgba(0,0,0,.6); overflow: hidden; font-size: 14px;
  animation: tuto-pop .25s ease-out;
}
.tuto-filedlg .t { padding: 10px 14px; background: #e1e1e1; font-weight: 600; }
.tuto-filedlg .b { padding: 16px 14px; display: grid; gap: 12px; }
.tuto-filedlg .crumbs { padding: 8px 10px; background: #fff; border: 1px solid #ccc; border-radius: 4px; color: #444; }
.tuto-filedlg label { display: flex; gap: 10px; align-items: center; }
.tuto-filedlg input { flex: 1; font: inherit; padding: 6px 8px; border: 1px solid #999; border-radius: 4px; }
.tuto-filedlg .a { display: flex; justify-content: flex-end; gap: 10px; padding: 10px 14px; background: #e9e9e9; }
.tuto-filedlg .btn { padding: 6px 16px; border-radius: 4px; border: 1px solid #aaa; background: #fff; }
.tuto-filedlg .btn.primary { background: #0e639c; border-color: #0e639c; color: #fff; }
@keyframes tuto-pop { from { transform: translate(-50%, -46%); opacity: 0; } }

.tuto-card {
  position: absolute; inset: 0; z-index: 45; display: flex; align-items: center; justify-content: center;
  background: radial-gradient(ellipse at 30% 20%, #1d3b57 0%, #121820 55%, #0b0e13 100%);
  opacity: 0; transition: opacity .5s;
}
.tuto-card.show { opacity: 1; }
.tuto-card .inner { width: 72%; max-width: 1050px; }
.tuto-card .brand { display: flex; align-items: center; gap: 12px; font-size: 20px; color: #9fb3c8; letter-spacing: .5px; }
.tuto-card .brand img { width: 44px; height: 44px; }
.tuto-card .kicker { margin-top: 34px; font-size: 22px; color: #ffca28; font-weight: 700; text-transform: uppercase; letter-spacing: 2px; }
.tuto-card h1 { margin: 10px 0 0; font-size: 58px; line-height: 1.1; }
.tuto-card .sub { font-size: 24px; color: #c9d4df; margin: 16px 0 0; }
.tuto-card ul { margin: 30px 0 0; padding: 0; list-style: none; display: grid; gap: 14px; }
.tuto-card li { font-size: 25px; padding-left: 36px; position: relative; opacity: 0; transform: translateX(-12px); transition: all .45s; }
.tuto-card li.on { opacity: 1; transform: none; }
.tuto-card li::before { content: ""; position: absolute; left: 4px; top: 10px; width: 14px; height: 14px; border-radius: 4px; background: #ffca28; }
.tuto-card .foot { margin-top: 40px; font-size: 20px; color: #9fb3c8; }
.tuto-card .schema { margin-top: 26px; }

/* Carte « fichier à calques » : le dessin et sa pile de calques, comme dans Krita. */
.tuto-layers { display: flex; gap: 48px; align-items: center; margin-top: 26px; }
.tuto-layers .art { width: 360px; height: 410px; background: repeating-conic-gradient(#3a3f47 0% 25%, #30343b 0% 50%) 0 0 / 24px 24px; border-radius: 10px; display: flex; align-items: center; justify-content: center; }
.tuto-layers .art img { max-width: 92%; max-height: 92%; }
.tuto-layers .stack { flex: 1; max-width: 430px; background: #22252b; border: 1px solid #444; border-radius: 8px; padding: 8px; display: grid; gap: 3px; }
.tuto-layers .stack .h { font-size: 16px; color: #9fb3c8; padding: 2px 6px 6px; }
.tuto-layers .lay { display: flex; align-items: center; gap: 12px; padding: 2px 8px; background: #2d3139; border-radius: 4px; font-size: 16px; opacity: 0; transform: translateX(10px); transition: all .35s; }
.tuto-layers .lay.on { opacity: 1; transform: none; }
.tuto-layers .lay.hot { background: #3d4a5c; outline: 2px solid #ffca28; }
.tuto-layers .lay img { width: 30px; height: 22px; object-fit: contain; background: #444a52; border-radius: 3px; }
.tuto-palette {
  position: fixed; display: grid; grid-template-columns: repeat(6, 34px); gap: 8px; padding: 10px;
  background: #252526; border: 1px solid #555; border-radius: 8px; box-shadow: 0 8px 24px rgba(0,0,0,.5);
}
.tuto-palette > span { width: 34px; height: 34px; border-radius: 6px; border: 2px solid #3c3c3c; }
.tuto-palette > span.on { border-color: #ffca28; box-shadow: 0 0 0 2px #ffca28; }
`;
