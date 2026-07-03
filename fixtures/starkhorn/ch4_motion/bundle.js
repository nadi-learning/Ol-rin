//#region ../../../../../var/folders/_d/9xxv4yg13xz4pvwj4bs4ckqm0000gp/T/nadi-slides-48cb9343-4cfd-4b11-8b2a-9f2d685199fd/react-shim.js
var e = window.__REVISION_REACT__;
if (!e) throw Error("[slide-bundle] window.__REVISION_REACT__ is not set");
var { Children: t, Component: n, Fragment: r, PureComponent: i, StrictMode: a, Suspense: o, cloneElement: s, createContext: c, createElement: l, createRef: u, forwardRef: d, isValidElement: f, lazy: p, memo: m, startTransition: h, useCallback: g, useContext: _, useDebugValue: v, useDeferredValue: y, useEffect: b, useId: x, useImperativeHandle: S, useInsertionEffect: ee, useLayoutEffect: te, useMemo: ne, useReducer: re, useRef: ie, useState: ae, useSyncExternalStore: oe, useTransition: se } = e, ce = "/Users/mab/Desktop/nadi/nadi-backend/packages/interactive-frame/src/InteractiveFrame.tsx", le = c(null);
function ue() {
	let e = _(le);
	if (!e) throw Error("[interactive-frame] useInteractiveFrame() must be called inside <InteractiveFrame>.");
	return e;
}
var de = .5, fe = 2, pe = .1;
function me(e) {
	return Number.isNaN(e) ? 1 : Math.max(de, Math.min(fe, e));
}
var he = d(function({ title: e, onEvent: t, hideChrome: n = !1, initialZoom: r = 1, className: i, children: a }, o) {
	let s = ie(null), [c, u] = ae(() => me(r)), [d, f] = ae(!1), p = ie(t);
	b(() => {
		p.current = t;
	}, [t]);
	let m = g((e) => {
		p.current?.("stage_complete", { stage_name: e });
	}, []), h = g(() => {
		p.current?.("fully_complete", {});
	}, []), _ = ne(() => ({
		completeStage: m,
		completeFully: h
	}), [m, h]);
	S(o, () => _, [_]);
	let v = g(() => {
		let e = s.current;
		if (!e) return;
		let t = e.ownerDocument;
		typeof t?.exitFullscreen == "function" && typeof e.requestFullscreen == "function" ? t.fullscreenElement === e ? t.exitFullscreen().catch(() => {}) : e.requestFullscreen().catch(() => {
			f((e) => !e);
		}) : f((e) => !e);
	}, []);
	b(() => {
		let e = s.current;
		if (!e) return;
		let t = e.ownerDocument;
		if (!t) return;
		let n = () => {
			f(t.fullscreenElement === e);
		};
		return t.addEventListener("fullscreenchange", n), () => t.removeEventListener("fullscreenchange", n);
	}, []);
	let y = g(() => u((e) => me(e + pe)), []), x = g(() => u((e) => me(e - pe)), []), ee = g(() => u(1), []);
	return /* @__PURE__ */ l("div", {
		ref: s,
		className: ["nadi-iframe", i].filter(Boolean).join(" "),
		"data-fullscreen": d ? "true" : "false",
		__self: this,
		__source: {
			fileName: ce,
			lineNumber: 194,
			columnNumber: 5
		}
	}, !n && /* @__PURE__ */ l("div", {
		className: "nadi-iframe__chrome",
		role: "toolbar",
		"aria-label": "Slide controls",
		__self: this,
		__source: {
			fileName: ce,
			lineNumber: 200,
			columnNumber: 9
		}
	}, /* @__PURE__ */ l("div", {
		className: "nadi-iframe__title",
		title: e,
		__self: this,
		__source: {
			fileName: ce,
			lineNumber: 201,
			columnNumber: 11
		}
	}, e ?? ""), /* @__PURE__ */ l("div", {
		className: "nadi-iframe__controls",
		__self: this,
		__source: {
			fileName: ce,
			lineNumber: 204,
			columnNumber: 11
		}
	}, /* @__PURE__ */ l("button", {
		type: "button",
		className: "nadi-iframe__btn",
		onClick: x,
		"aria-label": "Zoom out",
		disabled: c <= .500001,
		__self: this,
		__source: {
			fileName: ce,
			lineNumber: 205,
			columnNumber: 13
		}
	}, "−"), /* @__PURE__ */ l("button", {
		type: "button",
		className: "nadi-iframe__btn",
		onClick: ee,
		"aria-label": "Reset zoom",
		title: `${Math.round(c * 100)}%`,
		__self: this,
		__source: {
			fileName: ce,
			lineNumber: 214,
			columnNumber: 13
		}
	}, Math.round(c * 100), "%"), /* @__PURE__ */ l("button", {
		type: "button",
		className: "nadi-iframe__btn",
		onClick: y,
		"aria-label": "Zoom in",
		disabled: c >= fe - 1e-6,
		__self: this,
		__source: {
			fileName: ce,
			lineNumber: 223,
			columnNumber: 13
		}
	}, "+"), /* @__PURE__ */ l("button", {
		type: "button",
		className: "nadi-iframe__btn",
		onClick: v,
		"aria-label": d ? "Exit fullscreen" : "Enter fullscreen",
		"aria-pressed": d,
		__self: this,
		__source: {
			fileName: ce,
			lineNumber: 232,
			columnNumber: 13
		}
	}, d ? "⤢" : "⤡"))), /* @__PURE__ */ l("div", {
		className: "nadi-iframe__viewport",
		__self: this,
		__source: {
			fileName: ce,
			lineNumber: 245,
			columnNumber: 7
		}
	}, /* @__PURE__ */ l("div", {
		className: "nadi-iframe__zoom",
		style: {
			transform: c === 1 ? void 0 : `scale(${c})`,
			width: c === 1 ? "100%" : `${100 / c}%`,
			height: c === 1 ? "100%" : `${100 / c}%`
		},
		__self: this,
		__source: {
			fileName: ce,
			lineNumber: 246,
			columnNumber: 9
		}
	}, /* @__PURE__ */ l(le.Provider, {
		value: _,
		__self: this,
		__source: {
			fileName: ce,
			lineNumber: 254,
			columnNumber: 11
		}
	}, /* @__PURE__ */ l(ge, {
		__self: this,
		__source: {
			fileName: ce,
			lineNumber: 255,
			columnNumber: 13
		}
	}, a)))));
}), ge = class extends n {
	state = { error: null };
	static getDerivedStateFromError(e) {
		return { error: e };
	}
	componentDidCatch(e, t) {
		console.error("[interactive-frame] slide threw:", e, t);
	}
	render() {
		return this.state.error ? /* @__PURE__ */ l("div", {
			className: "nadi-iframe__error",
			role: "alert",
			__self: this,
			__source: {
				fileName: ce,
				lineNumber: 288,
				columnNumber: 9
			}
		}, `Slide error: ${this.state.error.message}`) : this.props.children;
	}
}, C = class e extends Error {
	constructor(t, n) {
		var r = "KaTeX parse error: " + t, i, a, o = n && n.loc;
		if (o && o.start <= o.end) {
			var s = o.lexer.input;
			i = o.start, a = o.end, i === s.length ? r += " at end of input: " : r += " at position " + (i + 1) + ": ";
			var c = s.slice(i, a).replace(/[^]/g, "$&̲"), l = i > 15 ? "…" + s.slice(i - 15, i) : s.slice(0, i), u = a + 15 < s.length ? s.slice(a, a + 15) + "…" : s.slice(a);
			r += l + c + u;
		}
		super(r), this.name = "ParseError", this.position = void 0, this.length = void 0, this.rawMessage = void 0, Object.setPrototypeOf(this, e.prototype), this.position = i, i != null && a != null && (this.length = a - i), this.rawMessage = t;
	}
}, _e = /([A-Z])/g, ve = (e) => e.replace(_e, "-$1").toLowerCase(), ye = {
	"&": "&amp;",
	">": "&gt;",
	"<": "&lt;",
	"\"": "&quot;",
	"'": "&#x27;"
}, be = /[&><"']/g, xe = (e) => String(e).replace(be, (e) => ye[e]), Se = (e) => e.type === "ordgroup" || e.type === "color" ? e.body.length === 1 ? Se(e.body[0]) : e : e.type === "font" ? Se(e.body) : e, Ce = new Set([
	"mathord",
	"textord",
	"atom"
]), we = (e) => Ce.has(Se(e).type), Te = class {
	constructor(e, t, n) {
		this.id = void 0, this.size = void 0, this.cramped = void 0, this.id = e, this.size = t, this.cramped = n;
	}
	sup() {
		return Pe[Fe[this.id]];
	}
	sub() {
		return Pe[Ie[this.id]];
	}
	fracNum() {
		return Pe[Le[this.id]];
	}
	fracDen() {
		return Pe[Re[this.id]];
	}
	cramp() {
		return Pe[ze[this.id]];
	}
	text() {
		return Pe[Be[this.id]];
	}
	isTight() {
		return this.size >= 2;
	}
}, Ee = 0, De = 1, Oe = 2, ke = 3, Ae = 4, je = 5, Me = 6, Ne = 7, Pe = [
	new Te(Ee, 0, !1),
	new Te(De, 0, !0),
	new Te(Oe, 1, !1),
	new Te(ke, 1, !0),
	new Te(Ae, 2, !1),
	new Te(je, 2, !0),
	new Te(Me, 3, !1),
	new Te(Ne, 3, !0)
], Fe = [
	Ae,
	je,
	Ae,
	je,
	Me,
	Ne,
	Me,
	Ne
], Ie = [
	je,
	je,
	je,
	je,
	Ne,
	Ne,
	Ne,
	Ne
], Le = [
	Oe,
	ke,
	Ae,
	je,
	Me,
	Ne,
	Me,
	Ne
], Re = [
	ke,
	ke,
	je,
	je,
	Ne,
	Ne,
	Ne,
	Ne
], ze = [
	De,
	De,
	ke,
	ke,
	je,
	je,
	Ne,
	Ne
], Be = [
	Ee,
	De,
	Oe,
	ke,
	Oe,
	ke,
	Oe,
	ke
], w = {
	DISPLAY: Pe[Ee],
	TEXT: Pe[Oe],
	SCRIPT: Pe[Ae],
	SCRIPTSCRIPT: Pe[Me]
}, Ve = [
	{
		name: "latin",
		blocks: [[256, 591], [768, 879]]
	},
	{
		name: "cyrillic",
		blocks: [[1024, 1279]]
	},
	{
		name: "armenian",
		blocks: [[1328, 1423]]
	},
	{
		name: "brahmic",
		blocks: [[2304, 4255]]
	},
	{
		name: "georgian",
		blocks: [[4256, 4351]]
	},
	{
		name: "cjk",
		blocks: [
			[12288, 12543],
			[19968, 40879],
			[65280, 65376]
		]
	},
	{
		name: "hangul",
		blocks: [[44032, 55215]]
	}
];
function He(e) {
	for (var t = 0; t < Ve.length; t++) for (var n = Ve[t], r = 0; r < n.blocks.length; r++) {
		var i = n.blocks[r];
		if (e >= i[0] && e <= i[1]) return n.name;
	}
	return null;
}
var Ue = [];
Ve.forEach((e) => e.blocks.forEach((e) => Ue.push(...e)));
function We(e) {
	for (var t = 0; t < Ue.length; t += 2) if (e >= Ue[t] && e <= Ue[t + 1]) return !0;
	return !1;
}
var Ge = (e) => e + " " + e, Ke = 80, qe = function(e, t) {
	return "M95," + (622 + e + t) + "\nc-2.7,0,-7.17,-2.7,-13.5,-8c-5.8,-5.3,-9.5,-10,-9.5,-14\nc0,-2,0.3,-3.3,1,-4c1.3,-2.7,23.83,-20.7,67.5,-54\nc44.2,-33.3,65.8,-50.3,66.5,-51c1.3,-1.3,3,-2,5,-2c4.7,0,8.7,3.3,12,10\ns173,378,173,378c0.7,0,35.3,-71,104,-213c68.7,-142,137.5,-285,206.5,-429\nc69,-144,104.5,-217.7,106.5,-221\nl" + e / 2.075 + " -" + e + "\nc5.3,-9.3,12,-14,20,-14\nH400000v" + (40 + e) + "H845.2724\ns-225.272,467,-225.272,467s-235,486,-235,486c-2.7,4.7,-9,7,-19,7\nc-6,0,-10,-1,-12,-3s-194,-422,-194,-422s-65,47,-65,47z\nM" + (834 + e) + " " + t + "h400000v" + (40 + e) + "h-400000z";
}, Je = function(e, t) {
	return "M263," + (601 + e + t) + "c0.7,0,18,39.7,52,119\nc34,79.3,68.167,158.7,102.5,238c34.3,79.3,51.8,119.3,52.5,120\nc340,-704.7,510.7,-1060.3,512,-1067\nl" + e / 2.084 + " -" + e + "\nc4.7,-7.3,11,-11,19,-11\nH40000v" + (40 + e) + "H1012.3\ns-271.3,567,-271.3,567c-38.7,80.7,-84,175,-136,283c-52,108,-89.167,185.3,-111.5,232\nc-22.3,46.7,-33.8,70.3,-34.5,71c-4.7,4.7,-12.3,7,-23,7s-12,-1,-12,-1\ns-109,-253,-109,-253c-72.7,-168,-109.3,-252,-110,-252c-10.7,8,-22,16.7,-34,26\nc-22,17.3,-33.3,26,-34,26s-26,-26,-26,-26s76,-59,76,-59s76,-60,76,-60z\nM" + (1001 + e) + " " + t + "h400000v" + (40 + e) + "h-400000z";
}, Ye = function(e, t) {
	return "M983 " + (10 + e + t) + "\nl" + e / 3.13 + " -" + e + "\nc4,-6.7,10,-10,18,-10 H400000v" + (40 + e) + "\nH1013.1s-83.4,268,-264.1,840c-180.7,572,-277,876.3,-289,913c-4.7,4.7,-12.7,7,-24,7\ns-12,0,-12,0c-1.3,-3.3,-3.7,-11.7,-7,-25c-35.3,-125.3,-106.7,-373.3,-214,-744\nc-10,12,-21,25,-33,39s-32,39,-32,39c-6,-5.3,-15,-14,-27,-26s25,-30,25,-30\nc26.7,-32.7,52,-63,76,-91s52,-60,52,-60s208,722,208,722\nc56,-175.3,126.3,-397.3,211,-666c84.7,-268.7,153.8,-488.2,207.5,-658.5\nc53.7,-170.3,84.5,-266.8,92.5,-289.5z\nM" + (1001 + e) + " " + t + "h400000v" + (40 + e) + "h-400000z";
}, Xe = function(e, t) {
	return "M424," + (2398 + e + t) + "\nc-1.3,-0.7,-38.5,-172,-111.5,-514c-73,-342,-109.8,-513.3,-110.5,-514\nc0,-2,-10.7,14.3,-32,49c-4.7,7.3,-9.8,15.7,-15.5,25c-5.7,9.3,-9.8,16,-12.5,20\ns-5,7,-5,7c-4,-3.3,-8.3,-7.7,-13,-13s-13,-13,-13,-13s76,-122,76,-122s77,-121,77,-121\ns209,968,209,968c0,-2,84.7,-361.7,254,-1079c169.3,-717.3,254.7,-1077.7,256,-1081\nl" + e / 4.223 + " -" + e + "c4,-6.7,10,-10,18,-10 H400000\nv" + (40 + e) + "H1014.6\ns-87.3,378.7,-272.6,1166c-185.3,787.3,-279.3,1182.3,-282,1185\nc-2,6,-10,9,-24,9\nc-8,0,-12,-0.7,-12,-2z M" + (1001 + e) + " " + t + "\nh400000v" + (40 + e) + "h-400000z";
}, Ze = function(e, t) {
	return "M473," + (2713 + e + t) + "\nc339.3,-1799.3,509.3,-2700,510,-2702 l" + e / 5.298 + " -" + e + "\nc3.3,-7.3,9.3,-11,18,-11 H400000v" + (40 + e) + "H1017.7\ns-90.5,478,-276.2,1466c-185.7,988,-279.5,1483,-281.5,1485c-2,6,-10,9,-24,9\nc-8,0,-12,-0.7,-12,-2c0,-1.3,-5.3,-32,-16,-92c-50.7,-293.3,-119.7,-693.3,-207,-1200\nc0,-1.3,-5.3,8.7,-16,30c-10.7,21.3,-21.3,42.7,-32,64s-16,33,-16,33s-26,-26,-26,-26\ns76,-153,76,-153s77,-151,77,-151c0.7,0.7,35.7,202,105,604c67.3,400.7,102,602.7,104,\n606zM" + (1001 + e) + " " + t + "h400000v" + (40 + e) + "H1017.7z";
}, Qe = function(e) {
	var t = e / 2;
	return "M400000 " + e + " H0 L" + t + " 0 l65 45 L145 " + (e - 80) + " H400000z";
}, $e = function(e, t, n) {
	var r = n - 54 - t - e;
	return "M702 " + (e + t) + "H400000" + (40 + e) + "\nH742v" + r + "l-4 4-4 4c-.667.7 -2 1.5-4 2.5s-4.167 1.833-6.5 2.5-5.5 1-9.5 1\nh-12l-28-84c-16.667-52-96.667 -294.333-240-727l-212 -643 -85 170\nc-4-3.333-8.333-7.667-13 -13l-13-13l77-155 77-156c66 199.333 139 419.667\n219 661 l218 661zM702 " + t + "H400000v" + (40 + e) + "H742z";
}, et = function(e, t, n) {
	t = 1e3 * t;
	var r = "";
	switch (e) {
		case "sqrtMain":
			r = qe(t, Ke);
			break;
		case "sqrtSize1":
			r = Je(t, Ke);
			break;
		case "sqrtSize2":
			r = Ye(t, Ke);
			break;
		case "sqrtSize3":
			r = Xe(t, Ke);
			break;
		case "sqrtSize4":
			r = Ze(t, Ke);
			break;
		case "sqrtTall": r = $e(t, Ke, n);
	}
	return r;
}, tt = function(e, t) {
	switch (e) {
		case "⎜": return Ge("M291 0 H417 V" + t + " H291z");
		case "∣": return Ge("M145 0 H188 V" + t + " H145z");
		case "∥": return Ge("M145 0 H188 V" + t + " H145z") + Ge("M367 0 H410 V" + t + " H367z");
		case "⎟": return Ge("M457 0 H583 V" + t + " H457z");
		case "⎢": return Ge("M319 0 H403 V" + t + " H319z");
		case "⎥": return Ge("M263 0 H347 V" + t + " H263z");
		case "⎪": return Ge("M384 0 H504 V" + t + " H384z");
		case "⏐": return Ge("M312 0 H355 V" + t + " H312z");
		case "‖": return Ge("M257 0 H300 V" + t + " H257z") + Ge("M478 0 H521 V" + t + " H478z");
		default: return "";
	}
}, nt = {
	doubleleftarrow: "M262 157\nl10-10c34-36 62.7-77 86-123 3.3-8 5-13.3 5-16 0-5.3-6.7-8-20-8-7.3\n 0-12.2.5-14.5 1.5-2.3 1-4.8 4.5-7.5 10.5-49.3 97.3-121.7 169.3-217 216-28\n 14-57.3 25-88 33-6.7 2-11 3.8-13 5.5-2 1.7-3 4.2-3 7.5s1 5.8 3 7.5\nc2 1.7 6.3 3.5 13 5.5 68 17.3 128.2 47.8 180.5 91.5 52.3 43.7 93.8 96.2 124.5\n 157.5 9.3 8 15.3 12.3 18 13h6c12-.7 18-4 18-10 0-2-1.7-7-5-15-23.3-46-52-87\n-86-123l-10-10h399738v-40H218c328 0 0 0 0 0l-10-8c-26.7-20-65.7-43-117-69 2.7\n-2 6-3.7 10-5 36.7-16 72.3-37.3 107-64l10-8h399782v-40z\nm8 0v40h399730v-40zm0 194v40h399730v-40z",
	doublerightarrow: "M399738 392l\n-10 10c-34 36-62.7 77-86 123-3.3 8-5 13.3-5 16 0 5.3 6.7 8 20 8 7.3 0 12.2-.5\n 14.5-1.5 2.3-1 4.8-4.5 7.5-10.5 49.3-97.3 121.7-169.3 217-216 28-14 57.3-25 88\n-33 6.7-2 11-3.8 13-5.5 2-1.7 3-4.2 3-7.5s-1-5.8-3-7.5c-2-1.7-6.3-3.5-13-5.5-68\n-17.3-128.2-47.8-180.5-91.5-52.3-43.7-93.8-96.2-124.5-157.5-9.3-8-15.3-12.3-18\n-13h-6c-12 .7-18 4-18 10 0 2 1.7 7 5 15 23.3 46 52 87 86 123l10 10H0v40h399782\nc-328 0 0 0 0 0l10 8c26.7 20 65.7 43 117 69-2.7 2-6 3.7-10 5-36.7 16-72.3 37.3\n-107 64l-10 8H0v40zM0 157v40h399730v-40zm0 194v40h399730v-40z",
	leftarrow: "M400000 241H110l3-3c68.7-52.7 113.7-120\n 135-202 4-14.7 6-23 6-25 0-7.3-7-11-21-11-8 0-13.2.8-15.5 2.5-2.3 1.7-4.2 5.8\n-5.5 12.5-1.3 4.7-2.7 10.3-4 17-12 48.7-34.8 92-68.5 130S65.3 228.3 18 247\nc-10 4-16 7.7-18 11 0 8.7 6 14.3 18 17 47.3 18.7 87.8 47 121.5 85S196 441.3 208\n 490c.7 2 1.3 5 2 9s1.2 6.7 1.5 8c.3 1.3 1 3.3 2 6s2.2 4.5 3.5 5.5c1.3 1 3.3\n 1.8 6 2.5s6 1 10 1c14 0 21-3.7 21-11 0-2-2-10.3-6-25-20-79.3-65-146.7-135-202\n l-3-3h399890zM100 241v40h399900v-40z",
	leftbrace: "M6 548l-6-6v-35l6-11c56-104 135.3-181.3 238-232 57.3-28.7 117\n-45 179-50h399577v120H403c-43.3 7-81 15-113 26-100.7 33-179.7 91-237 174-2.7\n 5-6 9-10 13-.7 1-7.3 1-20 1H6z",
	leftbraceunder: "M0 6l6-6h17c12.688 0 19.313.3 20 1 4 4 7.313 8.3 10 13\n 35.313 51.3 80.813 93.8 136.5 127.5 55.688 33.7 117.188 55.8 184.5 66.5.688\n 0 2 .3 4 1 18.688 2.7 76 4.3 172 5h399450v120H429l-6-1c-124.688-8-235-61.7\n-331-161C60.687 138.7 32.312 99.3 7 54L0 41V6z",
	leftgroup: "M400000 80\nH435C64 80 168.3 229.4 21 260c-5.9 1.2-18 0-18 0-2 0-3-1-3-3v-38C76 61 257 0\n 435 0h399565z",
	leftgroupunder: "M400000 262\nH435C64 262 168.3 112.6 21 82c-5.9-1.2-18 0-18 0-2 0-3 1-3 3v38c76 158 257 219\n 435 219h399565z",
	leftharpoon: "M0 267c.7 5.3 3 10 7 14h399993v-40H93c3.3\n-3.3 10.2-9.5 20.5-18.5s17.8-15.8 22.5-20.5c50.7-52 88-110.3 112-175 4-11.3 5\n-18.3 3-21-1.3-4-7.3-6-18-6-8 0-13 .7-15 2s-4.7 6.7-8 16c-42 98.7-107.3 174.7\n-196 228-6.7 4.7-10.7 8-12 10-1.3 2-2 5.7-2 11zm100-26v40h399900v-40z",
	leftharpoonplus: "M0 267c.7 5.3 3 10 7 14h399993v-40H93c3.3-3.3 10.2-9.5\n 20.5-18.5s17.8-15.8 22.5-20.5c50.7-52 88-110.3 112-175 4-11.3 5-18.3 3-21-1.3\n-4-7.3-6-18-6-8 0-13 .7-15 2s-4.7 6.7-8 16c-42 98.7-107.3 174.7-196 228-6.7 4.7\n-10.7 8-12 10-1.3 2-2 5.7-2 11zm100-26v40h399900v-40zM0 435v40h400000v-40z\nm0 0v40h400000v-40z",
	leftharpoondown: "M7 241c-4 4-6.333 8.667-7 14 0 5.333.667 9 2 11s5.333\n 5.333 12 10c90.667 54 156 130 196 228 3.333 10.667 6.333 16.333 9 17 2 .667 5\n 1 9 1h5c10.667 0 16.667-2 18-6 2-2.667 1-9.667-3-21-32-87.333-82.667-157.667\n-152-211l-3-3h399907v-40zM93 281 H400000 v-40L7 241z",
	leftharpoondownplus: "M7 435c-4 4-6.3 8.7-7 14 0 5.3.7 9 2 11s5.3 5.3 12\n 10c90.7 54 156 130 196 228 3.3 10.7 6.3 16.3 9 17 2 .7 5 1 9 1h5c10.7 0 16.7\n-2 18-6 2-2.7 1-9.7-3-21-32-87.3-82.7-157.7-152-211l-3-3h399907v-40H7zm93 0\nv40h399900v-40zM0 241v40h399900v-40zm0 0v40h399900v-40z",
	lefthook: "M400000 281 H103s-33-11.2-61-33.5S0 197.3 0 164s14.2-61.2 42.5\n-83.5C70.8 58.2 104 47 142 47 c16.7 0 25 6.7 25 20 0 12-8.7 18.7-26 20-40 3.3\n-68.7 15.7-86 37-10 12-15 25.3-15 40 0 22.7 9.8 40.7 29.5 54 19.7 13.3 43.5 21\n 71.5 23h399859zM103 281v-40h399897v40z",
	leftlinesegment: Ge("M40 281 V428 H0 V94 H40 V241 H400000 v40z"),
	leftbracketunder: Ge("M0 0 h120 V290 H399995 v120 H0z"),
	leftbracketover: Ge("M0 440 h120 V150 H399995 v-120 H0z"),
	leftmapsto: Ge("M40 281 V448H0V74H40V241H400000v40z"),
	leftToFrom: "M0 147h400000v40H0zm0 214c68 40 115.7 95.7 143 167h22c15.3 0 23\n-.3 23-1 0-1.3-5.3-13.7-16-37-18-35.3-41.3-69-70-101l-7-8h399905v-40H95l7-8\nc28.7-32 52-65.7 70-101 10.7-23.3 16-35.7 16-37 0-.7-7.7-1-23-1h-22C115.7 265.3\n 68 321 0 361zm0-174v-40h399900v40zm100 154v40h399900v-40z",
	longequal: Ge("M0 50 h400000 v40H0z m0 194h40000v40H0z"),
	midbrace: "M200428 334\nc-100.7-8.3-195.3-44-280-108-55.3-42-101.7-93-139-153l-9-14c-2.7 4-5.7 8.7-9 14\n-53.3 86.7-123.7 153-211 199-66.7 36-137.3 56.3-212 62H0V214h199568c178.3-11.7\n 311.7-78.3 403-201 6-8 9.7-12 11-12 .7-.7 6.7-1 18-1s17.3.3 18 1c1.3 0 5 4 11\n 12 44.7 59.3 101.3 106.3 170 141s145.3 54.3 229 60h199572v120z",
	midbraceunder: "M199572 214\nc100.7 8.3 195.3 44 280 108 55.3 42 101.7 93 139 153l9 14c2.7-4 5.7-8.7 9-14\n 53.3-86.7 123.7-153 211-199 66.7-36 137.3-56.3 212-62h199568v120H200432c-178.3\n 11.7-311.7 78.3-403 201-6 8-9.7 12-11 12-.7.7-6.7 1-18 1s-17.3-.3-18-1c-1.3 0\n-5-4-11-12-44.7-59.3-101.3-106.3-170-141s-145.3-54.3-229-60H0V214z",
	oiintSize1: "M512.6 71.6c272.6 0 320.3 106.8 320.3 178.2 0 70.8-47.7 177.6\n-320.3 177.6S193.1 320.6 193.1 249.8c0-71.4 46.9-178.2 319.5-178.2z\nm368.1 178.2c0-86.4-60.9-215.4-368.1-215.4-306.4 0-367.3 129-367.3 215.4 0 85.8\n60.9 214.8 367.3 214.8 307.2 0 368.1-129 368.1-214.8z",
	oiintSize2: "M757.8 100.1c384.7 0 451.1 137.6 451.1 230 0 91.3-66.4 228.8\n-451.1 228.8-386.3 0-452.7-137.5-452.7-228.8 0-92.4 66.4-230 452.7-230z\nm502.4 230c0-111.2-82.4-277.2-502.4-277.2s-504 166-504 277.2\nc0 110 84 276 504 276s502.4-166 502.4-276z",
	oiiintSize1: "M681.4 71.6c408.9 0 480.5 106.8 480.5 178.2 0 70.8-71.6 177.6\n-480.5 177.6S202.1 320.6 202.1 249.8c0-71.4 70.5-178.2 479.3-178.2z\nm525.8 178.2c0-86.4-86.8-215.4-525.7-215.4-437.9 0-524.7 129-524.7 215.4 0\n85.8 86.8 214.8 524.7 214.8 438.9 0 525.7-129 525.7-214.8z",
	oiiintSize2: "M1021.2 53c603.6 0 707.8 165.8 707.8 277.2 0 110-104.2 275.8\n-707.8 275.8-606 0-710.2-165.8-710.2-275.8C311 218.8 415.2 53 1021.2 53z\nm770.4 277.1c0-131.2-126.4-327.6-770.5-327.6S248.4 198.9 248.4 330.1\nc0 130 128.8 326.4 772.7 326.4s770.5-196.4 770.5-326.4z",
	rightarrow: "M0 241v40h399891c-47.3 35.3-84 78-110 128\n-16.7 32-27.7 63.7-33 95 0 1.3-.2 2.7-.5 4-.3 1.3-.5 2.3-.5 3 0 7.3 6.7 11 20\n 11 8 0 13.2-.8 15.5-2.5 2.3-1.7 4.2-5.5 5.5-11.5 2-13.3 5.7-27 11-41 14.7-44.7\n 39-84.5 73-119.5s73.7-60.2 119-75.5c6-2 9-5.7 9-11s-3-9-9-11c-45.3-15.3-85\n-40.5-119-75.5s-58.3-74.8-73-119.5c-4.7-14-8.3-27.3-11-40-1.3-6.7-3.2-10.8-5.5\n-12.5-2.3-1.7-7.5-2.5-15.5-2.5-14 0-21 3.7-21 11 0 2 2 10.3 6 25 20.7 83.3 67\n 151.7 139 205zm0 0v40h399900v-40z",
	rightbrace: "M400000 542l\n-6 6h-17c-12.7 0-19.3-.3-20-1-4-4-7.3-8.3-10-13-35.3-51.3-80.8-93.8-136.5-127.5\ns-117.2-55.8-184.5-66.5c-.7 0-2-.3-4-1-18.7-2.7-76-4.3-172-5H0V214h399571l6 1\nc124.7 8 235 61.7 331 161 31.3 33.3 59.7 72.7 85 118l7 13v35z",
	rightbraceunder: "M399994 0l6 6v35l-6 11c-56 104-135.3 181.3-238 232-57.3\n 28.7-117 45-179 50H-300V214h399897c43.3-7 81-15 113-26 100.7-33 179.7-91 237\n-174 2.7-5 6-9 10-13 .7-1 7.3-1 20-1h17z",
	rightgroup: "M0 80h399565c371 0 266.7 149.4 414 180 5.9 1.2 18 0 18 0 2 0\n 3-1 3-3v-38c-76-158-257-219-435-219H0z",
	rightgroupunder: "M0 262h399565c371 0 266.7-149.4 414-180 5.9-1.2 18 0 18\n 0 2 0 3 1 3 3v38c-76 158-257 219-435 219H0z",
	rightharpoon: "M0 241v40h399993c4.7-4.7 7-9.3 7-14 0-9.3\n-3.7-15.3-11-18-92.7-56.7-159-133.7-199-231-3.3-9.3-6-14.7-8-16-2-1.3-7-2-15-2\n-10.7 0-16.7 2-18 6-2 2.7-1 9.7 3 21 15.3 42 36.7 81.8 64 119.5 27.3 37.7 58\n 69.2 92 94.5zm0 0v40h399900v-40z",
	rightharpoonplus: "M0 241v40h399993c4.7-4.7 7-9.3 7-14 0-9.3-3.7-15.3-11\n-18-92.7-56.7-159-133.7-199-231-3.3-9.3-6-14.7-8-16-2-1.3-7-2-15-2-10.7 0-16.7\n 2-18 6-2 2.7-1 9.7 3 21 15.3 42 36.7 81.8 64 119.5 27.3 37.7 58 69.2 92 94.5z\nm0 0v40h399900v-40z m100 194v40h399900v-40zm0 0v40h399900v-40z",
	rightharpoondown: "M399747 511c0 7.3 6.7 11 20 11 8 0 13-.8 15-2.5s4.7-6.8\n 8-15.5c40-94 99.3-166.3 178-217 13.3-8 20.3-12.3 21-13 5.3-3.3 8.5-5.8 9.5\n-7.5 1-1.7 1.5-5.2 1.5-10.5s-2.3-10.3-7-15H0v40h399908c-34 25.3-64.7 57-92 95\n-27.3 38-48.7 77.7-64 119-3.3 8.7-5 14-5 16zM0 241v40h399900v-40z",
	rightharpoondownplus: "M399747 705c0 7.3 6.7 11 20 11 8 0 13-.8\n 15-2.5s4.7-6.8 8-15.5c40-94 99.3-166.3 178-217 13.3-8 20.3-12.3 21-13 5.3-3.3\n 8.5-5.8 9.5-7.5 1-1.7 1.5-5.2 1.5-10.5s-2.3-10.3-7-15H0v40h399908c-34 25.3\n-64.7 57-92 95-27.3 38-48.7 77.7-64 119-3.3 8.7-5 14-5 16zM0 435v40h399900v-40z\nm0-194v40h400000v-40zm0 0v40h400000v-40z",
	righthook: "M399859 241c-764 0 0 0 0 0 40-3.3 68.7-15.7 86-37 10-12 15-25.3\n 15-40 0-22.7-9.8-40.7-29.5-54-19.7-13.3-43.5-21-71.5-23-17.3-1.3-26-8-26-20 0\n-13.3 8.7-20 26-20 38 0 71 11.2 99 33.5 0 0 7 5.6 21 16.7 14 11.2 21 33.5 21\n 66.8s-14 61.2-42 83.5c-28 22.3-61 33.5-99 33.5L0 241z M0 281v-40h399859v40z",
	rightlinesegment: Ge("M399960 241 V94 h40 V428 h-40 V281 H0 v-40z"),
	rightbracketunder: Ge("M399995 0 h-120 V290 H0 v120 H400000z"),
	rightbracketover: Ge("M399995 440 h-120 V150 H0 v-120 H399995z"),
	rightToFrom: "M400000 167c-70.7-42-118-97.7-142-167h-23c-15.3 0-23 .3-23\n 1 0 1.3 5.3 13.7 16 37 18 35.3 41.3 69 70 101l7 8H0v40h399905l-7 8c-28.7 32\n-52 65.7-70 101-10.7 23.3-16 35.7-16 37 0 .7 7.7 1 23 1h23c24-69.3 71.3-125 142\n-167z M100 147v40h399900v-40zM0 341v40h399900v-40z",
	twoheadleftarrow: "M0 167c68 40\n 115.7 95.7 143 167h22c15.3 0 23-.3 23-1 0-1.3-5.3-13.7-16-37-18-35.3-41.3-69\n-70-101l-7-8h125l9 7c50.7 39.3 85 86 103 140h46c0-4.7-6.3-18.7-19-42-18-35.3\n-40-67.3-66-96l-9-9h399716v-40H284l9-9c26-28.7 48-60.7 66-96 12.7-23.333 19\n-37.333 19-42h-46c-18 54-52.3 100.7-103 140l-9 7H95l7-8c28.7-32 52-65.7 70-101\n 10.7-23.333 16-35.7 16-37 0-.7-7.7-1-23-1h-22C115.7 71.3 68 127 0 167z",
	twoheadrightarrow: "M400000 167\nc-68-40-115.7-95.7-143-167h-22c-15.3 0-23 .3-23 1 0 1.3 5.3 13.7 16 37 18 35.3\n 41.3 69 70 101l7 8h-125l-9-7c-50.7-39.3-85-86-103-140h-46c0 4.7 6.3 18.7 19 42\n 18 35.3 40 67.3 66 96l9 9H0v40h399716l-9 9c-26 28.7-48 60.7-66 96-12.7 23.333\n-19 37.333-19 42h46c18-54 52.3-100.7 103-140l9-7h125l-7 8c-28.7 32-52 65.7-70\n 101-10.7 23.333-16 35.7-16 37 0 .7 7.7 1 23 1h22c27.3-71.3 75-127 143-167z",
	tilde1: "M200 55.538c-77 0-168 73.953-177 73.953-3 0-7\n-2.175-9-5.437L2 97c-1-2-2-4-2-6 0-4 2-7 5-9l20-12C116 12 171 0 207 0c86 0\n 114 68 191 68 78 0 168-68 177-68 4 0 7 2 9 5l12 19c1 2.175 2 4.35 2 6.525 0\n 4.35-2 7.613-5 9.788l-19 13.05c-92 63.077-116.937 75.308-183 76.128\n-68.267.847-113-73.952-191-73.952z",
	tilde2: "M344 55.266c-142 0-300.638 81.316-311.5 86.418\n-8.01 3.762-22.5 10.91-23.5 5.562L1 120c-1-2-1-3-1-4 0-5 3-9 8-10l18.4-9C160.9\n 31.9 283 0 358 0c148 0 188 122 331 122s314-97 326-97c4 0 8 2 10 7l7 21.114\nc1 2.14 1 3.21 1 4.28 0 5.347-3 9.626-7 10.696l-22.3 12.622C852.6 158.372 751\n 181.476 676 181.476c-149 0-189-126.21-332-126.21z",
	tilde3: "M786 59C457 59 32 175.242 13 175.242c-6 0-10-3.457\n-11-10.37L.15 138c-1-7 3-12 10-13l19.2-6.4C378.4 40.7 634.3 0 804.3 0c337 0\n 411.8 157 746.8 157 328 0 754-112 773-112 5 0 10 3 11 9l1 14.075c1 8.066-.697\n 16.595-6.697 17.492l-21.052 7.31c-367.9 98.146-609.15 122.696-778.15 122.696\n -338 0-409-156.573-744-156.573z",
	tilde4: "M786 58C457 58 32 177.487 13 177.487c-6 0-10-3.345\n-11-10.035L.15 143c-1-7 3-12 10-13l22-6.7C381.2 35 637.15 0 807.15 0c337 0 409\n 177 744 177 328 0 754-127 773-127 5 0 10 3 11 9l1 14.794c1 7.805-3 13.38-9\n 14.495l-20.7 5.574c-366.85 99.79-607.3 139.372-776.3 139.372-338 0-409\n -175.236-744-175.236z",
	vec: "M377 20c0-5.333 1.833-10 5.5-14S391 0 397 0c4.667 0 8.667 1.667 12 5\n3.333 2.667 6.667 9 10 19 6.667 24.667 20.333 43.667 41 57 7.333 4.667 11\n10.667 11 18 0 6-1 10-3 12s-6.667 5-14 9c-28.667 14.667-53.667 35.667-75 63\n-1.333 1.333-3.167 3.5-5.5 6.5s-4 4.833-5 5.5c-1 .667-2.5 1.333-4.5 2s-4.333 1\n-7 1c-4.667 0-9.167-1.833-13.5-5.5S337 184 337 178c0-12.667 15.667-32.333 47-59\nH213l-171-1c-8.667-6-13-12.333-13-19 0-4.667 4.333-11.333 13-20h359\nc-16-25.333-24-45-24-59z",
	widehat1: "M529 0h5l519 115c5 1 9 5 9 10 0 1-1 2-1 3l-4 22\nc-1 5-5 9-11 9h-2L532 67 19 159h-2c-5 0-9-4-11-9l-5-22c-1-6 2-12 8-13z",
	widehat2: "M1181 0h2l1171 176c6 0 10 5 10 11l-2 23c-1 6-5 10\n-11 10h-1L1182 67 15 220h-1c-6 0-10-4-11-10l-2-23c-1-6 4-11 10-11z",
	widehat3: "M1181 0h2l1171 236c6 0 10 5 10 11l-2 23c-1 6-5 10\n-11 10h-1L1182 67 15 280h-1c-6 0-10-4-11-10l-2-23c-1-6 4-11 10-11z",
	widehat4: "M1181 0h2l1171 296c6 0 10 5 10 11l-2 23c-1 6-5 10\n-11 10h-1L1182 67 15 340h-1c-6 0-10-4-11-10l-2-23c-1-6 4-11 10-11z",
	widecheck1: "M529,159h5l519,-115c5,-1,9,-5,9,-10c0,-1,-1,-2,-1,-3l-4,-22c-1,\n-5,-5,-9,-11,-9h-2l-512,92l-513,-92h-2c-5,0,-9,4,-11,9l-5,22c-1,6,2,12,8,13z",
	widecheck2: "M1181,220h2l1171,-176c6,0,10,-5,10,-11l-2,-23c-1,-6,-5,-10,\n-11,-10h-1l-1168,153l-1167,-153h-1c-6,0,-10,4,-11,10l-2,23c-1,6,4,11,10,11z",
	widecheck3: "M1181,280h2l1171,-236c6,0,10,-5,10,-11l-2,-23c-1,-6,-5,-10,\n-11,-10h-1l-1168,213l-1167,-213h-1c-6,0,-10,4,-11,10l-2,23c-1,6,4,11,10,11z",
	widecheck4: "M1181,340h2l1171,-296c6,0,10,-5,10,-11l-2,-23c-1,-6,-5,-10,\n-11,-10h-1l-1168,273l-1167,-273h-1c-6,0,-10,4,-11,10l-2,23c-1,6,4,11,10,11z",
	baraboveleftarrow: "M400000 620h-399890l3 -3c68.7 -52.7 113.7 -120 135 -202\nc4 -14.7 6 -23 6 -25c0 -7.3 -7 -11 -21 -11c-8 0 -13.2 0.8 -15.5 2.5\nc-2.3 1.7 -4.2 5.8 -5.5 12.5c-1.3 4.7 -2.7 10.3 -4 17c-12 48.7 -34.8 92 -68.5 130\ns-74.2 66.3 -121.5 85c-10 4 -16 7.7 -18 11c0 8.7 6 14.3 18 17c47.3 18.7 87.8 47\n121.5 85s56.5 81.3 68.5 130c0.7 2 1.3 5 2 9s1.2 6.7 1.5 8c0.3 1.3 1 3.3 2 6\ns2.2 4.5 3.5 5.5c1.3 1 3.3 1.8 6 2.5s6 1 10 1c14 0 21 -3.7 21 -11\nc0 -2 -2 -10.3 -6 -25c-20 -79.3 -65 -146.7 -135 -202l-3 -3h399890z\nM100 620v40h399900v-40z M0 241v40h399900v-40zM0 241v40h399900v-40z",
	rightarrowabovebar: "M0 241v40h399891c-47.3 35.3-84 78-110 128-16.7 32\n-27.7 63.7-33 95 0 1.3-.2 2.7-.5 4-.3 1.3-.5 2.3-.5 3 0 7.3 6.7 11 20 11 8 0\n13.2-.8 15.5-2.5 2.3-1.7 4.2-5.5 5.5-11.5 2-13.3 5.7-27 11-41 14.7-44.7 39\n-84.5 73-119.5s73.7-60.2 119-75.5c6-2 9-5.7 9-11s-3-9-9-11c-45.3-15.3-85-40.5\n-119-75.5s-58.3-74.8-73-119.5c-4.7-14-8.3-27.3-11-40-1.3-6.7-3.2-10.8-5.5\n-12.5-2.3-1.7-7.5-2.5-15.5-2.5-14 0-21 3.7-21 11 0 2 2 10.3 6 25 20.7 83.3 67\n151.7 139 205zm96 379h399894v40H0zm0 0h399904v40H0z",
	baraboveshortleftharpoon: "M507,435c-4,4,-6.3,8.7,-7,14c0,5.3,0.7,9,2,11\nc1.3,2,5.3,5.3,12,10c90.7,54,156,130,196,228c3.3,10.7,6.3,16.3,9,17\nc2,0.7,5,1,9,1c0,0,5,0,5,0c10.7,0,16.7,-2,18,-6c2,-2.7,1,-9.7,-3,-21\nc-32,-87.3,-82.7,-157.7,-152,-211c0,0,-3,-3,-3,-3l399351,0l0,-40\nc-398570,0,-399437,0,-399437,0z M593 435 v40 H399500 v-40z\nM0 281 v-40 H399908 v40z M0 281 v-40 H399908 v40z",
	rightharpoonaboveshortbar: "M0,241 l0,40c399126,0,399993,0,399993,0\nc4.7,-4.7,7,-9.3,7,-14c0,-9.3,-3.7,-15.3,-11,-18c-92.7,-56.7,-159,-133.7,-199,\n-231c-3.3,-9.3,-6,-14.7,-8,-16c-2,-1.3,-7,-2,-15,-2c-10.7,0,-16.7,2,-18,6\nc-2,2.7,-1,9.7,3,21c15.3,42,36.7,81.8,64,119.5c27.3,37.7,58,69.2,92,94.5z\nM0 241 v40 H399908 v-40z M0 475 v-40 H399500 v40z M0 475 v-40 H399500 v40z",
	shortbaraboveleftharpoon: "M7,435c-4,4,-6.3,8.7,-7,14c0,5.3,0.7,9,2,11\nc1.3,2,5.3,5.3,12,10c90.7,54,156,130,196,228c3.3,10.7,6.3,16.3,9,17c2,0.7,5,1,9,\n1c0,0,5,0,5,0c10.7,0,16.7,-2,18,-6c2,-2.7,1,-9.7,-3,-21c-32,-87.3,-82.7,-157.7,\n-152,-211c0,0,-3,-3,-3,-3l399907,0l0,-40c-399126,0,-399993,0,-399993,0z\nM93 435 v40 H400000 v-40z M500 241 v40 H400000 v-40z M500 241 v40 H400000 v-40z",
	shortrightharpoonabovebar: "M53,241l0,40c398570,0,399437,0,399437,0\nc4.7,-4.7,7,-9.3,7,-14c0,-9.3,-3.7,-15.3,-11,-18c-92.7,-56.7,-159,-133.7,-199,\n-231c-3.3,-9.3,-6,-14.7,-8,-16c-2,-1.3,-7,-2,-15,-2c-10.7,0,-16.7,2,-18,6\nc-2,2.7,-1,9.7,3,21c15.3,42,36.7,81.8,64,119.5c27.3,37.7,58,69.2,92,94.5z\nM500 241 v40 H399408 v-40z M500 435 v40 H400000 v-40z"
}, rt = function(e, t) {
	switch (e) {
		case "lbrack": return "M403 1759 V84 H666 V0 H319 V1759 v" + t + " v1759 v84 h347 v-84\nH403z M403 1759 V0 H319 V1759 v" + t + " v1759 v84 h84z";
		case "rbrack": return "M347 1759 V0 H0 V84 H263 V1759 v" + t + " v1759 H0 v84 H347z\nM347 1759 V0 H263 V1759 v" + t + " v1759 h84z";
		case "vert": return "M145 15 v585 v" + t + " v585 c2.667,10,9.667,15,21,15\nc10,0,16.667,-5,20,-15 v-585 v" + -t + " v-585 c-2.667,-10,-9.667,-15,-21,-15\nc-10,0,-16.667,5,-20,15z M188 15 H145 v585 v" + t + " v585 h43z";
		case "doublevert": return "M145 15 v585 v" + t + " v585 c2.667,10,9.667,15,21,15\nc10,0,16.667,-5,20,-15 v-585 v" + -t + " v-585 c-2.667,-10,-9.667,-15,-21,-15\nc-10,0,-16.667,5,-20,15z M188 15 H145 v585 v" + t + " v585 h43z\nM367 15 v585 v" + t + " v585 c2.667,10,9.667,15,21,15\nc10,0,16.667,-5,20,-15 v-585 v" + -t + " v-585 c-2.667,-10,-9.667,-15,-21,-15\nc-10,0,-16.667,5,-20,15z M410 15 H367 v585 v" + t + " v585 h43z";
		case "lfloor": return "M319 602 V0 H403 V602 v" + t + " v1715 h263 v84 H319z\nMM319 602 V0 H403 V602 v" + t + " v1715 H319z";
		case "rfloor": return "M319 602 V0 H403 V602 v" + t + " v1799 H0 v-84 H319z\nMM319 602 V0 H403 V602 v" + t + " v1715 H319z";
		case "lceil": return "M403 1759 V84 H666 V0 H319 V1759 v" + t + " v602 h84z\nM403 1759 V0 H319 V1759 v" + t + " v602 h84z";
		case "rceil": return "M347 1759 V0 H0 V84 H263 V1759 v" + t + " v602 h84z\nM347 1759 V0 h-84 V1759 v" + t + " v602 h84z";
		case "lparen": return "M863,9c0,-2,-2,-5,-6,-9c0,0,-17,0,-17,0c-12.7,0,-19.3,0.3,-20,1\nc-5.3,5.3,-10.3,11,-15,17c-242.7,294.7,-395.3,682,-458,1162c-21.3,163.3,-33.3,349,\n-36,557 l0," + (t + 84) + "c0.2,6,0,26,0,60c2,159.3,10,310.7,24,454c53.3,528,210,\n949.7,470,1265c4.7,6,9.7,11.7,15,17c0.7,0.7,7,1,19,1c0,0,18,0,18,0c4,-4,6,-7,6,-9\nc0,-2.7,-3.3,-8.7,-10,-18c-135.3,-192.7,-235.5,-414.3,-300.5,-665c-65,-250.7,-102.5,\n-544.7,-112.5,-882c-2,-104,-3,-167,-3,-189\nl0,-" + (t + 92) + "c0,-162.7,5.7,-314,17,-454c20.7,-272,63.7,-513,129,-723c65.3,\n-210,155.3,-396.3,270,-559c6.7,-9.3,10,-15.3,10,-18z";
		case "rparen": return "M76,0c-16.7,0,-25,3,-25,9c0,2,2,6.3,6,13c21.3,28.7,42.3,60.3,\n63,95c96.7,156.7,172.8,332.5,228.5,527.5c55.7,195,92.8,416.5,111.5,664.5\nc11.3,139.3,17,290.7,17,454c0,28,1.7,43,3.3,45l0," + (t + 9) + "\nc-3,4,-3.3,16.7,-3.3,38c0,162,-5.7,313.7,-17,455c-18.7,248,-55.8,469.3,-111.5,664\nc-55.7,194.7,-131.8,370.3,-228.5,527c-20.7,34.7,-41.7,66.3,-63,95c-2,3.3,-4,7,-6,11\nc0,7.3,5.7,11,17,11c0,0,11,0,11,0c9.3,0,14.3,-0.3,15,-1c5.3,-5.3,10.3,-11,15,-17\nc242.7,-294.7,395.3,-681.7,458,-1161c21.3,-164.7,33.3,-350.7,36,-558\nl0,-" + (t + 144) + "c-2,-159.3,-10,-310.7,-24,-454c-53.3,-528,-210,-949.7,\n-470,-1265c-4.7,-6,-9.7,-11.7,-15,-17c-0.7,-0.7,-6.7,-1,-18,-1z";
		default: throw Error("Unknown stretchy delimiter.");
	}
};
function it(e) {
	return "toText" in e;
}
var at = class {
	constructor(e) {
		this.children = void 0, this.classes = void 0, this.height = void 0, this.depth = void 0, this.maxFontSize = void 0, this.style = void 0, this.children = e, this.classes = [], this.height = 0, this.depth = 0, this.maxFontSize = 0, this.style = {};
	}
	hasClass(e) {
		return this.classes.includes(e);
	}
	toNode() {
		for (var e = document.createDocumentFragment(), t = 0; t < this.children.length; t++) e.appendChild(this.children[t].toNode());
		return e;
	}
	toMarkup() {
		for (var e = "", t = 0; t < this.children.length; t++) e += this.children[t].toMarkup();
		return e;
	}
	toText() {
		return this.children.map((e) => {
			if (it(e)) return e.toText();
			throw Error("Expected MathDomNode with toText, got " + e.constructor.name);
		}).join("");
	}
}, ot = {
	pt: 1,
	mm: 7227 / 2540,
	cm: 7227 / 254,
	in: 72.27,
	bp: 803 / 800,
	pc: 12,
	dd: 1238 / 1157,
	cc: 14856 / 1157,
	nd: 685 / 642,
	nc: 1370 / 107,
	sp: 1 / 65536,
	px: 803 / 800
}, st = {
	ex: !0,
	em: !0,
	mu: !0
}, ct = function(e) {
	return typeof e != "string" && (e = e.unit), e in ot || e in st || e === "ex";
}, T = function(e, t) {
	var n;
	if (e.unit in ot) n = ot[e.unit] / t.fontMetrics().ptPerEm / t.sizeMultiplier;
	else if (e.unit === "mu") n = t.fontMetrics().cssEmPerMu;
	else {
		var r = t.style.isTight() ? t.havingStyle(t.style.text()) : t;
		if (e.unit === "ex") n = r.fontMetrics().xHeight;
		else if (e.unit === "em") n = r.fontMetrics().quad;
		else throw new C("Invalid unit: '" + e.unit + "'");
		r !== t && (n *= r.sizeMultiplier / t.sizeMultiplier);
	}
	return Math.min(e.number * n, t.maxSize);
}, E = function(e) {
	return +e.toFixed(4) + "em";
}, lt = function(e) {
	return e.filter((e) => e).join(" ");
}, ut = function(e) {
	var t = "";
	for (var n of Object.keys(e)) {
		var r = e[n];
		r !== void 0 && (t += ve(n) + ":" + r + ";");
	}
	return t;
}, dt = function(e, t, n) {
	if (this.classes = e || [], this.attributes = {}, this.height = 0, this.depth = 0, this.maxFontSize = 0, this.style = n || {}, t) {
		t.style.isTight() && this.classes.push("mtight");
		var r = t.getColor();
		r && (this.style.color = r);
	}
}, ft = function(e) {
	var t = document.createElement(e);
	t.className = lt(this.classes), Object.assign(t.style, this.style);
	for (var n of Object.keys(this.attributes)) t.setAttribute(n, this.attributes[n]);
	for (var r = 0; r < this.children.length; r++) t.appendChild(this.children[r].toNode());
	return t;
}, pt = /[\s"'>/=\x00-\x1f]/, mt = function(e) {
	var t = "<" + e;
	this.classes.length && (t += " class=\"" + xe(lt(this.classes)) + "\"");
	var n = ut(this.style);
	n && (t += " style=\"" + xe(n) + "\"");
	for (var r of Object.keys(this.attributes)) {
		if (pt.test(r)) throw new C("Invalid attribute name '" + r + "'");
		t += " " + r + "=\"" + xe(this.attributes[r]) + "\"";
	}
	t += ">";
	for (var i = 0; i < this.children.length; i++) t += this.children[i].toMarkup();
	return t += "</" + e + ">", t;
}, ht = class {
	constructor(e, t, n, r) {
		this.children = void 0, this.attributes = void 0, this.classes = void 0, this.height = void 0, this.depth = void 0, this.width = void 0, this.maxFontSize = void 0, this.style = void 0, this.italic = void 0, dt.call(this, e, n, r), this.children = t || [];
	}
	setAttribute(e, t) {
		this.attributes[e] = t;
	}
	hasClass(e) {
		return this.classes.includes(e);
	}
	toNode() {
		return ft.call(this, "span");
	}
	toMarkup() {
		return mt.call(this, "span");
	}
}, gt = class {
	constructor(e, t, n, r) {
		this.children = void 0, this.attributes = void 0, this.classes = void 0, this.height = void 0, this.depth = void 0, this.maxFontSize = void 0, this.style = void 0, dt.call(this, t, r), this.children = n || [], this.setAttribute("href", e);
	}
	setAttribute(e, t) {
		this.attributes[e] = t;
	}
	hasClass(e) {
		return this.classes.includes(e);
	}
	toNode() {
		return ft.call(this, "a");
	}
	toMarkup() {
		return mt.call(this, "a");
	}
}, _t = class {
	constructor(e, t, n) {
		this.src = void 0, this.alt = void 0, this.classes = void 0, this.height = void 0, this.depth = void 0, this.maxFontSize = void 0, this.style = void 0, this.alt = t, this.src = e, this.classes = ["mord"], this.height = 0, this.depth = 0, this.maxFontSize = 0, this.style = n;
	}
	hasClass(e) {
		return this.classes.includes(e);
	}
	toNode() {
		var e = document.createElement("img");
		return e.src = this.src, e.alt = this.alt, e.className = "mord", Object.assign(e.style, this.style), e;
	}
	toMarkup() {
		var e = "<img src=\"" + xe(this.src) + "\"" + (" alt=\"" + xe(this.alt) + "\""), t = ut(this.style);
		return t && (e += " style=\"" + xe(t) + "\""), e += "'/>", e;
	}
}, vt = {
	î: "ı̂",
	ï: "ı̈",
	í: "ı́",
	ì: "ı̀"
}, yt = class {
	constructor(e, t, n, r, i, a, o, s) {
		this.text = void 0, this.height = void 0, this.depth = void 0, this.italic = void 0, this.skew = void 0, this.width = void 0, this.maxFontSize = void 0, this.classes = void 0, this.style = void 0, this.text = e, this.height = t || 0, this.depth = n || 0, this.italic = r || 0, this.skew = i || 0, this.width = a || 0, this.classes = o || [], this.style = s || {}, this.maxFontSize = 0;
		var c = He(this.text.charCodeAt(0));
		c && this.classes.push(c + "_fallback"), /[îïíì]/.test(this.text) && (this.text = vt[this.text]);
	}
	hasClass(e) {
		return this.classes.includes(e);
	}
	toNode() {
		var e = document.createTextNode(this.text), t = null;
		return this.italic > 0 && (t = document.createElement("span"), t.style.marginRight = E(this.italic)), this.classes.length > 0 && (t ||= document.createElement("span"), t.className = lt(this.classes)), Object.keys(this.style).length > 0 && (t ||= document.createElement("span"), Object.assign(t.style, this.style)), t ? (t.appendChild(e), t) : e;
	}
	toMarkup() {
		var e = !1, t = "<span";
		this.classes.length && (e = !0, t += " class=\"", t += xe(lt(this.classes)), t += "\"");
		var n = "";
		this.italic > 0 && (n += "margin-right:" + E(this.italic) + ";"), n += ut(this.style), n && (e = !0, t += " style=\"" + xe(n) + "\"");
		var r = xe(this.text);
		return e ? (t += ">", t += r, t += "</span>", t) : r;
	}
}, bt = class {
	constructor(e, t) {
		this.children = void 0, this.attributes = void 0, this.children = e || [], this.attributes = t || {};
	}
	toNode() {
		var e = document.createElementNS("http://www.w3.org/2000/svg", "svg");
		for (var t of Object.keys(this.attributes)) e.setAttribute(t, this.attributes[t]);
		for (var n = 0; n < this.children.length; n++) e.appendChild(this.children[n].toNode());
		return e;
	}
	toMarkup() {
		var e = "<svg xmlns=\"http://www.w3.org/2000/svg\"";
		for (var t of Object.keys(this.attributes)) e += " " + t + "=\"" + xe(this.attributes[t]) + "\"";
		e += ">";
		for (var n = 0; n < this.children.length; n++) e += this.children[n].toMarkup();
		return e += "</svg>", e;
	}
}, xt = class {
	constructor(e, t) {
		this.pathName = void 0, this.alternate = void 0, this.pathName = e, this.alternate = t;
	}
	toNode() {
		var e = document.createElementNS("http://www.w3.org/2000/svg", "path");
		return this.alternate ? e.setAttribute("d", this.alternate) : e.setAttribute("d", nt[this.pathName]), e;
	}
	toMarkup() {
		return this.alternate ? "<path d=\"" + xe(this.alternate) + "\"/>" : "<path d=\"" + xe(nt[this.pathName]) + "\"/>";
	}
}, St = class {
	constructor(e) {
		this.attributes = void 0, this.attributes = e || {};
	}
	toNode() {
		var e = document.createElementNS("http://www.w3.org/2000/svg", "line");
		for (var t of Object.keys(this.attributes)) e.setAttribute(t, this.attributes[t]);
		return e;
	}
	toMarkup() {
		var e = "<line";
		for (var t of Object.keys(this.attributes)) e += " " + t + "=\"" + xe(this.attributes[t]) + "\"";
		return e += "/>", e;
	}
};
function Ct(e) {
	if (e instanceof yt) return e;
	throw Error("Expected symbolNode but got " + String(e) + ".");
}
function wt(e) {
	if (e instanceof ht) return e;
	throw Error("Expected span<HtmlDomNode> but got " + String(e) + ".");
}
var Tt = (e) => e instanceof ht || e instanceof gt || e instanceof at, Et = {
	"AMS-Regular": {
		32: [
			0,
			0,
			0,
			0,
			.25
		],
		65: [
			0,
			.68889,
			0,
			0,
			.72222
		],
		66: [
			0,
			.68889,
			0,
			0,
			.66667
		],
		67: [
			0,
			.68889,
			0,
			0,
			.72222
		],
		68: [
			0,
			.68889,
			0,
			0,
			.72222
		],
		69: [
			0,
			.68889,
			0,
			0,
			.66667
		],
		70: [
			0,
			.68889,
			0,
			0,
			.61111
		],
		71: [
			0,
			.68889,
			0,
			0,
			.77778
		],
		72: [
			0,
			.68889,
			0,
			0,
			.77778
		],
		73: [
			0,
			.68889,
			0,
			0,
			.38889
		],
		74: [
			.16667,
			.68889,
			0,
			0,
			.5
		],
		75: [
			0,
			.68889,
			0,
			0,
			.77778
		],
		76: [
			0,
			.68889,
			0,
			0,
			.66667
		],
		77: [
			0,
			.68889,
			0,
			0,
			.94445
		],
		78: [
			0,
			.68889,
			0,
			0,
			.72222
		],
		79: [
			.16667,
			.68889,
			0,
			0,
			.77778
		],
		80: [
			0,
			.68889,
			0,
			0,
			.61111
		],
		81: [
			.16667,
			.68889,
			0,
			0,
			.77778
		],
		82: [
			0,
			.68889,
			0,
			0,
			.72222
		],
		83: [
			0,
			.68889,
			0,
			0,
			.55556
		],
		84: [
			0,
			.68889,
			0,
			0,
			.66667
		],
		85: [
			0,
			.68889,
			0,
			0,
			.72222
		],
		86: [
			0,
			.68889,
			0,
			0,
			.72222
		],
		87: [
			0,
			.68889,
			0,
			0,
			1
		],
		88: [
			0,
			.68889,
			0,
			0,
			.72222
		],
		89: [
			0,
			.68889,
			0,
			0,
			.72222
		],
		90: [
			0,
			.68889,
			0,
			0,
			.66667
		],
		107: [
			0,
			.68889,
			0,
			0,
			.55556
		],
		160: [
			0,
			0,
			0,
			0,
			.25
		],
		165: [
			0,
			.675,
			.025,
			0,
			.75
		],
		174: [
			.15559,
			.69224,
			0,
			0,
			.94666
		],
		240: [
			0,
			.68889,
			0,
			0,
			.55556
		],
		295: [
			0,
			.68889,
			0,
			0,
			.54028
		],
		710: [
			0,
			.825,
			0,
			0,
			2.33334
		],
		732: [
			0,
			.9,
			0,
			0,
			2.33334
		],
		770: [
			0,
			.825,
			0,
			0,
			2.33334
		],
		771: [
			0,
			.9,
			0,
			0,
			2.33334
		],
		989: [
			.08167,
			.58167,
			0,
			0,
			.77778
		],
		1008: [
			0,
			.43056,
			.04028,
			0,
			.66667
		],
		8245: [
			0,
			.54986,
			0,
			0,
			.275
		],
		8463: [
			0,
			.68889,
			0,
			0,
			.54028
		],
		8487: [
			0,
			.68889,
			0,
			0,
			.72222
		],
		8498: [
			0,
			.68889,
			0,
			0,
			.55556
		],
		8502: [
			0,
			.68889,
			0,
			0,
			.66667
		],
		8503: [
			0,
			.68889,
			0,
			0,
			.44445
		],
		8504: [
			0,
			.68889,
			0,
			0,
			.66667
		],
		8513: [
			0,
			.68889,
			0,
			0,
			.63889
		],
		8592: [
			-.03598,
			.46402,
			0,
			0,
			.5
		],
		8594: [
			-.03598,
			.46402,
			0,
			0,
			.5
		],
		8602: [
			-.13313,
			.36687,
			0,
			0,
			1
		],
		8603: [
			-.13313,
			.36687,
			0,
			0,
			1
		],
		8606: [
			.01354,
			.52239,
			0,
			0,
			1
		],
		8608: [
			.01354,
			.52239,
			0,
			0,
			1
		],
		8610: [
			.01354,
			.52239,
			0,
			0,
			1.11111
		],
		8611: [
			.01354,
			.52239,
			0,
			0,
			1.11111
		],
		8619: [
			0,
			.54986,
			0,
			0,
			1
		],
		8620: [
			0,
			.54986,
			0,
			0,
			1
		],
		8621: [
			-.13313,
			.37788,
			0,
			0,
			1.38889
		],
		8622: [
			-.13313,
			.36687,
			0,
			0,
			1
		],
		8624: [
			0,
			.69224,
			0,
			0,
			.5
		],
		8625: [
			0,
			.69224,
			0,
			0,
			.5
		],
		8630: [
			0,
			.43056,
			0,
			0,
			1
		],
		8631: [
			0,
			.43056,
			0,
			0,
			1
		],
		8634: [
			.08198,
			.58198,
			0,
			0,
			.77778
		],
		8635: [
			.08198,
			.58198,
			0,
			0,
			.77778
		],
		8638: [
			.19444,
			.69224,
			0,
			0,
			.41667
		],
		8639: [
			.19444,
			.69224,
			0,
			0,
			.41667
		],
		8642: [
			.19444,
			.69224,
			0,
			0,
			.41667
		],
		8643: [
			.19444,
			.69224,
			0,
			0,
			.41667
		],
		8644: [
			.1808,
			.675,
			0,
			0,
			1
		],
		8646: [
			.1808,
			.675,
			0,
			0,
			1
		],
		8647: [
			.1808,
			.675,
			0,
			0,
			1
		],
		8648: [
			.19444,
			.69224,
			0,
			0,
			.83334
		],
		8649: [
			.1808,
			.675,
			0,
			0,
			1
		],
		8650: [
			.19444,
			.69224,
			0,
			0,
			.83334
		],
		8651: [
			.01354,
			.52239,
			0,
			0,
			1
		],
		8652: [
			.01354,
			.52239,
			0,
			0,
			1
		],
		8653: [
			-.13313,
			.36687,
			0,
			0,
			1
		],
		8654: [
			-.13313,
			.36687,
			0,
			0,
			1
		],
		8655: [
			-.13313,
			.36687,
			0,
			0,
			1
		],
		8666: [
			.13667,
			.63667,
			0,
			0,
			1
		],
		8667: [
			.13667,
			.63667,
			0,
			0,
			1
		],
		8669: [
			-.13313,
			.37788,
			0,
			0,
			1
		],
		8672: [
			-.064,
			.437,
			0,
			0,
			1.334
		],
		8674: [
			-.064,
			.437,
			0,
			0,
			1.334
		],
		8705: [
			0,
			.825,
			0,
			0,
			.5
		],
		8708: [
			0,
			.68889,
			0,
			0,
			.55556
		],
		8709: [
			.08167,
			.58167,
			0,
			0,
			.77778
		],
		8717: [
			0,
			.43056,
			0,
			0,
			.42917
		],
		8722: [
			-.03598,
			.46402,
			0,
			0,
			.5
		],
		8724: [
			.08198,
			.69224,
			0,
			0,
			.77778
		],
		8726: [
			.08167,
			.58167,
			0,
			0,
			.77778
		],
		8733: [
			0,
			.69224,
			0,
			0,
			.77778
		],
		8736: [
			0,
			.69224,
			0,
			0,
			.72222
		],
		8737: [
			0,
			.69224,
			0,
			0,
			.72222
		],
		8738: [
			.03517,
			.52239,
			0,
			0,
			.72222
		],
		8739: [
			.08167,
			.58167,
			0,
			0,
			.22222
		],
		8740: [
			.25142,
			.74111,
			0,
			0,
			.27778
		],
		8741: [
			.08167,
			.58167,
			0,
			0,
			.38889
		],
		8742: [
			.25142,
			.74111,
			0,
			0,
			.5
		],
		8756: [
			0,
			.69224,
			0,
			0,
			.66667
		],
		8757: [
			0,
			.69224,
			0,
			0,
			.66667
		],
		8764: [
			-.13313,
			.36687,
			0,
			0,
			.77778
		],
		8765: [
			-.13313,
			.37788,
			0,
			0,
			.77778
		],
		8769: [
			-.13313,
			.36687,
			0,
			0,
			.77778
		],
		8770: [
			-.03625,
			.46375,
			0,
			0,
			.77778
		],
		8774: [
			.30274,
			.79383,
			0,
			0,
			.77778
		],
		8776: [
			-.01688,
			.48312,
			0,
			0,
			.77778
		],
		8778: [
			.08167,
			.58167,
			0,
			0,
			.77778
		],
		8782: [
			.06062,
			.54986,
			0,
			0,
			.77778
		],
		8783: [
			.06062,
			.54986,
			0,
			0,
			.77778
		],
		8785: [
			.08198,
			.58198,
			0,
			0,
			.77778
		],
		8786: [
			.08198,
			.58198,
			0,
			0,
			.77778
		],
		8787: [
			.08198,
			.58198,
			0,
			0,
			.77778
		],
		8790: [
			0,
			.69224,
			0,
			0,
			.77778
		],
		8791: [
			.22958,
			.72958,
			0,
			0,
			.77778
		],
		8796: [
			.08198,
			.91667,
			0,
			0,
			.77778
		],
		8806: [
			.25583,
			.75583,
			0,
			0,
			.77778
		],
		8807: [
			.25583,
			.75583,
			0,
			0,
			.77778
		],
		8808: [
			.25142,
			.75726,
			0,
			0,
			.77778
		],
		8809: [
			.25142,
			.75726,
			0,
			0,
			.77778
		],
		8812: [
			.25583,
			.75583,
			0,
			0,
			.5
		],
		8814: [
			.20576,
			.70576,
			0,
			0,
			.77778
		],
		8815: [
			.20576,
			.70576,
			0,
			0,
			.77778
		],
		8816: [
			.30274,
			.79383,
			0,
			0,
			.77778
		],
		8817: [
			.30274,
			.79383,
			0,
			0,
			.77778
		],
		8818: [
			.22958,
			.72958,
			0,
			0,
			.77778
		],
		8819: [
			.22958,
			.72958,
			0,
			0,
			.77778
		],
		8822: [
			.1808,
			.675,
			0,
			0,
			.77778
		],
		8823: [
			.1808,
			.675,
			0,
			0,
			.77778
		],
		8828: [
			.13667,
			.63667,
			0,
			0,
			.77778
		],
		8829: [
			.13667,
			.63667,
			0,
			0,
			.77778
		],
		8830: [
			.22958,
			.72958,
			0,
			0,
			.77778
		],
		8831: [
			.22958,
			.72958,
			0,
			0,
			.77778
		],
		8832: [
			.20576,
			.70576,
			0,
			0,
			.77778
		],
		8833: [
			.20576,
			.70576,
			0,
			0,
			.77778
		],
		8840: [
			.30274,
			.79383,
			0,
			0,
			.77778
		],
		8841: [
			.30274,
			.79383,
			0,
			0,
			.77778
		],
		8842: [
			.13597,
			.63597,
			0,
			0,
			.77778
		],
		8843: [
			.13597,
			.63597,
			0,
			0,
			.77778
		],
		8847: [
			.03517,
			.54986,
			0,
			0,
			.77778
		],
		8848: [
			.03517,
			.54986,
			0,
			0,
			.77778
		],
		8858: [
			.08198,
			.58198,
			0,
			0,
			.77778
		],
		8859: [
			.08198,
			.58198,
			0,
			0,
			.77778
		],
		8861: [
			.08198,
			.58198,
			0,
			0,
			.77778
		],
		8862: [
			0,
			.675,
			0,
			0,
			.77778
		],
		8863: [
			0,
			.675,
			0,
			0,
			.77778
		],
		8864: [
			0,
			.675,
			0,
			0,
			.77778
		],
		8865: [
			0,
			.675,
			0,
			0,
			.77778
		],
		8872: [
			0,
			.69224,
			0,
			0,
			.61111
		],
		8873: [
			0,
			.69224,
			0,
			0,
			.72222
		],
		8874: [
			0,
			.69224,
			0,
			0,
			.88889
		],
		8876: [
			0,
			.68889,
			0,
			0,
			.61111
		],
		8877: [
			0,
			.68889,
			0,
			0,
			.61111
		],
		8878: [
			0,
			.68889,
			0,
			0,
			.72222
		],
		8879: [
			0,
			.68889,
			0,
			0,
			.72222
		],
		8882: [
			.03517,
			.54986,
			0,
			0,
			.77778
		],
		8883: [
			.03517,
			.54986,
			0,
			0,
			.77778
		],
		8884: [
			.13667,
			.63667,
			0,
			0,
			.77778
		],
		8885: [
			.13667,
			.63667,
			0,
			0,
			.77778
		],
		8888: [
			0,
			.54986,
			0,
			0,
			1.11111
		],
		8890: [
			.19444,
			.43056,
			0,
			0,
			.55556
		],
		8891: [
			.19444,
			.69224,
			0,
			0,
			.61111
		],
		8892: [
			.19444,
			.69224,
			0,
			0,
			.61111
		],
		8901: [
			0,
			.54986,
			0,
			0,
			.27778
		],
		8903: [
			.08167,
			.58167,
			0,
			0,
			.77778
		],
		8905: [
			.08167,
			.58167,
			0,
			0,
			.77778
		],
		8906: [
			.08167,
			.58167,
			0,
			0,
			.77778
		],
		8907: [
			0,
			.69224,
			0,
			0,
			.77778
		],
		8908: [
			0,
			.69224,
			0,
			0,
			.77778
		],
		8909: [
			-.03598,
			.46402,
			0,
			0,
			.77778
		],
		8910: [
			0,
			.54986,
			0,
			0,
			.76042
		],
		8911: [
			0,
			.54986,
			0,
			0,
			.76042
		],
		8912: [
			.03517,
			.54986,
			0,
			0,
			.77778
		],
		8913: [
			.03517,
			.54986,
			0,
			0,
			.77778
		],
		8914: [
			0,
			.54986,
			0,
			0,
			.66667
		],
		8915: [
			0,
			.54986,
			0,
			0,
			.66667
		],
		8916: [
			0,
			.69224,
			0,
			0,
			.66667
		],
		8918: [
			.0391,
			.5391,
			0,
			0,
			.77778
		],
		8919: [
			.0391,
			.5391,
			0,
			0,
			.77778
		],
		8920: [
			.03517,
			.54986,
			0,
			0,
			1.33334
		],
		8921: [
			.03517,
			.54986,
			0,
			0,
			1.33334
		],
		8922: [
			.38569,
			.88569,
			0,
			0,
			.77778
		],
		8923: [
			.38569,
			.88569,
			0,
			0,
			.77778
		],
		8926: [
			.13667,
			.63667,
			0,
			0,
			.77778
		],
		8927: [
			.13667,
			.63667,
			0,
			0,
			.77778
		],
		8928: [
			.30274,
			.79383,
			0,
			0,
			.77778
		],
		8929: [
			.30274,
			.79383,
			0,
			0,
			.77778
		],
		8934: [
			.23222,
			.74111,
			0,
			0,
			.77778
		],
		8935: [
			.23222,
			.74111,
			0,
			0,
			.77778
		],
		8936: [
			.23222,
			.74111,
			0,
			0,
			.77778
		],
		8937: [
			.23222,
			.74111,
			0,
			0,
			.77778
		],
		8938: [
			.20576,
			.70576,
			0,
			0,
			.77778
		],
		8939: [
			.20576,
			.70576,
			0,
			0,
			.77778
		],
		8940: [
			.30274,
			.79383,
			0,
			0,
			.77778
		],
		8941: [
			.30274,
			.79383,
			0,
			0,
			.77778
		],
		8994: [
			.19444,
			.69224,
			0,
			0,
			.77778
		],
		8995: [
			.19444,
			.69224,
			0,
			0,
			.77778
		],
		9416: [
			.15559,
			.69224,
			0,
			0,
			.90222
		],
		9484: [
			0,
			.69224,
			0,
			0,
			.5
		],
		9488: [
			0,
			.69224,
			0,
			0,
			.5
		],
		9492: [
			0,
			.37788,
			0,
			0,
			.5
		],
		9496: [
			0,
			.37788,
			0,
			0,
			.5
		],
		9585: [
			.19444,
			.68889,
			0,
			0,
			.88889
		],
		9586: [
			.19444,
			.74111,
			0,
			0,
			.88889
		],
		9632: [
			0,
			.675,
			0,
			0,
			.77778
		],
		9633: [
			0,
			.675,
			0,
			0,
			.77778
		],
		9650: [
			0,
			.54986,
			0,
			0,
			.72222
		],
		9651: [
			0,
			.54986,
			0,
			0,
			.72222
		],
		9654: [
			.03517,
			.54986,
			0,
			0,
			.77778
		],
		9660: [
			0,
			.54986,
			0,
			0,
			.72222
		],
		9661: [
			0,
			.54986,
			0,
			0,
			.72222
		],
		9664: [
			.03517,
			.54986,
			0,
			0,
			.77778
		],
		9674: [
			.11111,
			.69224,
			0,
			0,
			.66667
		],
		9733: [
			.19444,
			.69224,
			0,
			0,
			.94445
		],
		10003: [
			0,
			.69224,
			0,
			0,
			.83334
		],
		10016: [
			0,
			.69224,
			0,
			0,
			.83334
		],
		10731: [
			.11111,
			.69224,
			0,
			0,
			.66667
		],
		10846: [
			.19444,
			.75583,
			0,
			0,
			.61111
		],
		10877: [
			.13667,
			.63667,
			0,
			0,
			.77778
		],
		10878: [
			.13667,
			.63667,
			0,
			0,
			.77778
		],
		10885: [
			.25583,
			.75583,
			0,
			0,
			.77778
		],
		10886: [
			.25583,
			.75583,
			0,
			0,
			.77778
		],
		10887: [
			.13597,
			.63597,
			0,
			0,
			.77778
		],
		10888: [
			.13597,
			.63597,
			0,
			0,
			.77778
		],
		10889: [
			.26167,
			.75726,
			0,
			0,
			.77778
		],
		10890: [
			.26167,
			.75726,
			0,
			0,
			.77778
		],
		10891: [
			.48256,
			.98256,
			0,
			0,
			.77778
		],
		10892: [
			.48256,
			.98256,
			0,
			0,
			.77778
		],
		10901: [
			.13667,
			.63667,
			0,
			0,
			.77778
		],
		10902: [
			.13667,
			.63667,
			0,
			0,
			.77778
		],
		10933: [
			.25142,
			.75726,
			0,
			0,
			.77778
		],
		10934: [
			.25142,
			.75726,
			0,
			0,
			.77778
		],
		10935: [
			.26167,
			.75726,
			0,
			0,
			.77778
		],
		10936: [
			.26167,
			.75726,
			0,
			0,
			.77778
		],
		10937: [
			.26167,
			.75726,
			0,
			0,
			.77778
		],
		10938: [
			.26167,
			.75726,
			0,
			0,
			.77778
		],
		10949: [
			.25583,
			.75583,
			0,
			0,
			.77778
		],
		10950: [
			.25583,
			.75583,
			0,
			0,
			.77778
		],
		10955: [
			.28481,
			.79383,
			0,
			0,
			.77778
		],
		10956: [
			.28481,
			.79383,
			0,
			0,
			.77778
		],
		57350: [
			.08167,
			.58167,
			0,
			0,
			.22222
		],
		57351: [
			.08167,
			.58167,
			0,
			0,
			.38889
		],
		57352: [
			.08167,
			.58167,
			0,
			0,
			.77778
		],
		57353: [
			0,
			.43056,
			.04028,
			0,
			.66667
		],
		57356: [
			.25142,
			.75726,
			0,
			0,
			.77778
		],
		57357: [
			.25142,
			.75726,
			0,
			0,
			.77778
		],
		57358: [
			.41951,
			.91951,
			0,
			0,
			.77778
		],
		57359: [
			.30274,
			.79383,
			0,
			0,
			.77778
		],
		57360: [
			.30274,
			.79383,
			0,
			0,
			.77778
		],
		57361: [
			.41951,
			.91951,
			0,
			0,
			.77778
		],
		57366: [
			.25142,
			.75726,
			0,
			0,
			.77778
		],
		57367: [
			.25142,
			.75726,
			0,
			0,
			.77778
		],
		57368: [
			.25142,
			.75726,
			0,
			0,
			.77778
		],
		57369: [
			.25142,
			.75726,
			0,
			0,
			.77778
		],
		57370: [
			.13597,
			.63597,
			0,
			0,
			.77778
		],
		57371: [
			.13597,
			.63597,
			0,
			0,
			.77778
		]
	},
	"Caligraphic-Regular": {
		32: [
			0,
			0,
			0,
			0,
			.25
		],
		65: [
			0,
			.68333,
			0,
			.19445,
			.79847
		],
		66: [
			0,
			.68333,
			.03041,
			.13889,
			.65681
		],
		67: [
			0,
			.68333,
			.05834,
			.13889,
			.52653
		],
		68: [
			0,
			.68333,
			.02778,
			.08334,
			.77139
		],
		69: [
			0,
			.68333,
			.08944,
			.11111,
			.52778
		],
		70: [
			0,
			.68333,
			.09931,
			.11111,
			.71875
		],
		71: [
			.09722,
			.68333,
			.0593,
			.11111,
			.59487
		],
		72: [
			0,
			.68333,
			.00965,
			.11111,
			.84452
		],
		73: [
			0,
			.68333,
			.07382,
			0,
			.54452
		],
		74: [
			.09722,
			.68333,
			.18472,
			.16667,
			.67778
		],
		75: [
			0,
			.68333,
			.01445,
			.05556,
			.76195
		],
		76: [
			0,
			.68333,
			0,
			.13889,
			.68972
		],
		77: [
			0,
			.68333,
			0,
			.13889,
			1.2009
		],
		78: [
			0,
			.68333,
			.14736,
			.08334,
			.82049
		],
		79: [
			0,
			.68333,
			.02778,
			.11111,
			.79611
		],
		80: [
			0,
			.68333,
			.08222,
			.08334,
			.69556
		],
		81: [
			.09722,
			.68333,
			0,
			.11111,
			.81667
		],
		82: [
			0,
			.68333,
			0,
			.08334,
			.8475
		],
		83: [
			0,
			.68333,
			.075,
			.13889,
			.60556
		],
		84: [
			0,
			.68333,
			.25417,
			0,
			.54464
		],
		85: [
			0,
			.68333,
			.09931,
			.08334,
			.62583
		],
		86: [
			0,
			.68333,
			.08222,
			0,
			.61278
		],
		87: [
			0,
			.68333,
			.08222,
			.08334,
			.98778
		],
		88: [
			0,
			.68333,
			.14643,
			.13889,
			.7133
		],
		89: [
			.09722,
			.68333,
			.08222,
			.08334,
			.66834
		],
		90: [
			0,
			.68333,
			.07944,
			.13889,
			.72473
		],
		160: [
			0,
			0,
			0,
			0,
			.25
		]
	},
	"Fraktur-Regular": {
		32: [
			0,
			0,
			0,
			0,
			.25
		],
		33: [
			0,
			.69141,
			0,
			0,
			.29574
		],
		34: [
			0,
			.69141,
			0,
			0,
			.21471
		],
		38: [
			0,
			.69141,
			0,
			0,
			.73786
		],
		39: [
			0,
			.69141,
			0,
			0,
			.21201
		],
		40: [
			.24982,
			.74947,
			0,
			0,
			.38865
		],
		41: [
			.24982,
			.74947,
			0,
			0,
			.38865
		],
		42: [
			0,
			.62119,
			0,
			0,
			.27764
		],
		43: [
			.08319,
			.58283,
			0,
			0,
			.75623
		],
		44: [
			0,
			.10803,
			0,
			0,
			.27764
		],
		45: [
			.08319,
			.58283,
			0,
			0,
			.75623
		],
		46: [
			0,
			.10803,
			0,
			0,
			.27764
		],
		47: [
			.24982,
			.74947,
			0,
			0,
			.50181
		],
		48: [
			0,
			.47534,
			0,
			0,
			.50181
		],
		49: [
			0,
			.47534,
			0,
			0,
			.50181
		],
		50: [
			0,
			.47534,
			0,
			0,
			.50181
		],
		51: [
			.18906,
			.47534,
			0,
			0,
			.50181
		],
		52: [
			.18906,
			.47534,
			0,
			0,
			.50181
		],
		53: [
			.18906,
			.47534,
			0,
			0,
			.50181
		],
		54: [
			0,
			.69141,
			0,
			0,
			.50181
		],
		55: [
			.18906,
			.47534,
			0,
			0,
			.50181
		],
		56: [
			0,
			.69141,
			0,
			0,
			.50181
		],
		57: [
			.18906,
			.47534,
			0,
			0,
			.50181
		],
		58: [
			0,
			.47534,
			0,
			0,
			.21606
		],
		59: [
			.12604,
			.47534,
			0,
			0,
			.21606
		],
		61: [
			-.13099,
			.36866,
			0,
			0,
			.75623
		],
		63: [
			0,
			.69141,
			0,
			0,
			.36245
		],
		65: [
			0,
			.69141,
			0,
			0,
			.7176
		],
		66: [
			0,
			.69141,
			0,
			0,
			.88397
		],
		67: [
			0,
			.69141,
			0,
			0,
			.61254
		],
		68: [
			0,
			.69141,
			0,
			0,
			.83158
		],
		69: [
			0,
			.69141,
			0,
			0,
			.66278
		],
		70: [
			.12604,
			.69141,
			0,
			0,
			.61119
		],
		71: [
			0,
			.69141,
			0,
			0,
			.78539
		],
		72: [
			.06302,
			.69141,
			0,
			0,
			.7203
		],
		73: [
			0,
			.69141,
			0,
			0,
			.55448
		],
		74: [
			.12604,
			.69141,
			0,
			0,
			.55231
		],
		75: [
			0,
			.69141,
			0,
			0,
			.66845
		],
		76: [
			0,
			.69141,
			0,
			0,
			.66602
		],
		77: [
			0,
			.69141,
			0,
			0,
			1.04953
		],
		78: [
			0,
			.69141,
			0,
			0,
			.83212
		],
		79: [
			0,
			.69141,
			0,
			0,
			.82699
		],
		80: [
			.18906,
			.69141,
			0,
			0,
			.82753
		],
		81: [
			.03781,
			.69141,
			0,
			0,
			.82699
		],
		82: [
			0,
			.69141,
			0,
			0,
			.82807
		],
		83: [
			0,
			.69141,
			0,
			0,
			.82861
		],
		84: [
			0,
			.69141,
			0,
			0,
			.66899
		],
		85: [
			0,
			.69141,
			0,
			0,
			.64576
		],
		86: [
			0,
			.69141,
			0,
			0,
			.83131
		],
		87: [
			0,
			.69141,
			0,
			0,
			1.04602
		],
		88: [
			0,
			.69141,
			0,
			0,
			.71922
		],
		89: [
			.18906,
			.69141,
			0,
			0,
			.83293
		],
		90: [
			.12604,
			.69141,
			0,
			0,
			.60201
		],
		91: [
			.24982,
			.74947,
			0,
			0,
			.27764
		],
		93: [
			.24982,
			.74947,
			0,
			0,
			.27764
		],
		94: [
			0,
			.69141,
			0,
			0,
			.49965
		],
		97: [
			0,
			.47534,
			0,
			0,
			.50046
		],
		98: [
			0,
			.69141,
			0,
			0,
			.51315
		],
		99: [
			0,
			.47534,
			0,
			0,
			.38946
		],
		100: [
			0,
			.62119,
			0,
			0,
			.49857
		],
		101: [
			0,
			.47534,
			0,
			0,
			.40053
		],
		102: [
			.18906,
			.69141,
			0,
			0,
			.32626
		],
		103: [
			.18906,
			.47534,
			0,
			0,
			.5037
		],
		104: [
			.18906,
			.69141,
			0,
			0,
			.52126
		],
		105: [
			0,
			.69141,
			0,
			0,
			.27899
		],
		106: [
			0,
			.69141,
			0,
			0,
			.28088
		],
		107: [
			0,
			.69141,
			0,
			0,
			.38946
		],
		108: [
			0,
			.69141,
			0,
			0,
			.27953
		],
		109: [
			0,
			.47534,
			0,
			0,
			.76676
		],
		110: [
			0,
			.47534,
			0,
			0,
			.52666
		],
		111: [
			0,
			.47534,
			0,
			0,
			.48885
		],
		112: [
			.18906,
			.52396,
			0,
			0,
			.50046
		],
		113: [
			.18906,
			.47534,
			0,
			0,
			.48912
		],
		114: [
			0,
			.47534,
			0,
			0,
			.38919
		],
		115: [
			0,
			.47534,
			0,
			0,
			.44266
		],
		116: [
			0,
			.62119,
			0,
			0,
			.33301
		],
		117: [
			0,
			.47534,
			0,
			0,
			.5172
		],
		118: [
			0,
			.52396,
			0,
			0,
			.5118
		],
		119: [
			0,
			.52396,
			0,
			0,
			.77351
		],
		120: [
			.18906,
			.47534,
			0,
			0,
			.38865
		],
		121: [
			.18906,
			.47534,
			0,
			0,
			.49884
		],
		122: [
			.18906,
			.47534,
			0,
			0,
			.39054
		],
		160: [
			0,
			0,
			0,
			0,
			.25
		],
		8216: [
			0,
			.69141,
			0,
			0,
			.21471
		],
		8217: [
			0,
			.69141,
			0,
			0,
			.21471
		],
		58112: [
			0,
			.62119,
			0,
			0,
			.49749
		],
		58113: [
			0,
			.62119,
			0,
			0,
			.4983
		],
		58114: [
			.18906,
			.69141,
			0,
			0,
			.33328
		],
		58115: [
			.18906,
			.69141,
			0,
			0,
			.32923
		],
		58116: [
			.18906,
			.47534,
			0,
			0,
			.50343
		],
		58117: [
			0,
			.69141,
			0,
			0,
			.33301
		],
		58118: [
			0,
			.62119,
			0,
			0,
			.33409
		],
		58119: [
			0,
			.47534,
			0,
			0,
			.50073
		]
	},
	"Main-Bold": {
		32: [
			0,
			0,
			0,
			0,
			.25
		],
		33: [
			0,
			.69444,
			0,
			0,
			.35
		],
		34: [
			0,
			.69444,
			0,
			0,
			.60278
		],
		35: [
			.19444,
			.69444,
			0,
			0,
			.95833
		],
		36: [
			.05556,
			.75,
			0,
			0,
			.575
		],
		37: [
			.05556,
			.75,
			0,
			0,
			.95833
		],
		38: [
			0,
			.69444,
			0,
			0,
			.89444
		],
		39: [
			0,
			.69444,
			0,
			0,
			.31944
		],
		40: [
			.25,
			.75,
			0,
			0,
			.44722
		],
		41: [
			.25,
			.75,
			0,
			0,
			.44722
		],
		42: [
			0,
			.75,
			0,
			0,
			.575
		],
		43: [
			.13333,
			.63333,
			0,
			0,
			.89444
		],
		44: [
			.19444,
			.15556,
			0,
			0,
			.31944
		],
		45: [
			0,
			.44444,
			0,
			0,
			.38333
		],
		46: [
			0,
			.15556,
			0,
			0,
			.31944
		],
		47: [
			.25,
			.75,
			0,
			0,
			.575
		],
		48: [
			0,
			.64444,
			0,
			0,
			.575
		],
		49: [
			0,
			.64444,
			0,
			0,
			.575
		],
		50: [
			0,
			.64444,
			0,
			0,
			.575
		],
		51: [
			0,
			.64444,
			0,
			0,
			.575
		],
		52: [
			0,
			.64444,
			0,
			0,
			.575
		],
		53: [
			0,
			.64444,
			0,
			0,
			.575
		],
		54: [
			0,
			.64444,
			0,
			0,
			.575
		],
		55: [
			0,
			.64444,
			0,
			0,
			.575
		],
		56: [
			0,
			.64444,
			0,
			0,
			.575
		],
		57: [
			0,
			.64444,
			0,
			0,
			.575
		],
		58: [
			0,
			.44444,
			0,
			0,
			.31944
		],
		59: [
			.19444,
			.44444,
			0,
			0,
			.31944
		],
		60: [
			.08556,
			.58556,
			0,
			0,
			.89444
		],
		61: [
			-.10889,
			.39111,
			0,
			0,
			.89444
		],
		62: [
			.08556,
			.58556,
			0,
			0,
			.89444
		],
		63: [
			0,
			.69444,
			0,
			0,
			.54305
		],
		64: [
			0,
			.69444,
			0,
			0,
			.89444
		],
		65: [
			0,
			.68611,
			0,
			0,
			.86944
		],
		66: [
			0,
			.68611,
			0,
			0,
			.81805
		],
		67: [
			0,
			.68611,
			0,
			0,
			.83055
		],
		68: [
			0,
			.68611,
			0,
			0,
			.88194
		],
		69: [
			0,
			.68611,
			0,
			0,
			.75555
		],
		70: [
			0,
			.68611,
			0,
			0,
			.72361
		],
		71: [
			0,
			.68611,
			0,
			0,
			.90416
		],
		72: [
			0,
			.68611,
			0,
			0,
			.9
		],
		73: [
			0,
			.68611,
			0,
			0,
			.43611
		],
		74: [
			0,
			.68611,
			0,
			0,
			.59444
		],
		75: [
			0,
			.68611,
			0,
			0,
			.90138
		],
		76: [
			0,
			.68611,
			0,
			0,
			.69166
		],
		77: [
			0,
			.68611,
			0,
			0,
			1.09166
		],
		78: [
			0,
			.68611,
			0,
			0,
			.9
		],
		79: [
			0,
			.68611,
			0,
			0,
			.86388
		],
		80: [
			0,
			.68611,
			0,
			0,
			.78611
		],
		81: [
			.19444,
			.68611,
			0,
			0,
			.86388
		],
		82: [
			0,
			.68611,
			0,
			0,
			.8625
		],
		83: [
			0,
			.68611,
			0,
			0,
			.63889
		],
		84: [
			0,
			.68611,
			0,
			0,
			.8
		],
		85: [
			0,
			.68611,
			0,
			0,
			.88472
		],
		86: [
			0,
			.68611,
			.01597,
			0,
			.86944
		],
		87: [
			0,
			.68611,
			.01597,
			0,
			1.18888
		],
		88: [
			0,
			.68611,
			0,
			0,
			.86944
		],
		89: [
			0,
			.68611,
			.02875,
			0,
			.86944
		],
		90: [
			0,
			.68611,
			0,
			0,
			.70277
		],
		91: [
			.25,
			.75,
			0,
			0,
			.31944
		],
		92: [
			.25,
			.75,
			0,
			0,
			.575
		],
		93: [
			.25,
			.75,
			0,
			0,
			.31944
		],
		94: [
			0,
			.69444,
			0,
			0,
			.575
		],
		95: [
			.31,
			.13444,
			.03194,
			0,
			.575
		],
		97: [
			0,
			.44444,
			0,
			0,
			.55902
		],
		98: [
			0,
			.69444,
			0,
			0,
			.63889
		],
		99: [
			0,
			.44444,
			0,
			0,
			.51111
		],
		100: [
			0,
			.69444,
			0,
			0,
			.63889
		],
		101: [
			0,
			.44444,
			0,
			0,
			.52708
		],
		102: [
			0,
			.69444,
			.10903,
			0,
			.35139
		],
		103: [
			.19444,
			.44444,
			.01597,
			0,
			.575
		],
		104: [
			0,
			.69444,
			0,
			0,
			.63889
		],
		105: [
			0,
			.69444,
			0,
			0,
			.31944
		],
		106: [
			.19444,
			.69444,
			0,
			0,
			.35139
		],
		107: [
			0,
			.69444,
			0,
			0,
			.60694
		],
		108: [
			0,
			.69444,
			0,
			0,
			.31944
		],
		109: [
			0,
			.44444,
			0,
			0,
			.95833
		],
		110: [
			0,
			.44444,
			0,
			0,
			.63889
		],
		111: [
			0,
			.44444,
			0,
			0,
			.575
		],
		112: [
			.19444,
			.44444,
			0,
			0,
			.63889
		],
		113: [
			.19444,
			.44444,
			0,
			0,
			.60694
		],
		114: [
			0,
			.44444,
			0,
			0,
			.47361
		],
		115: [
			0,
			.44444,
			0,
			0,
			.45361
		],
		116: [
			0,
			.63492,
			0,
			0,
			.44722
		],
		117: [
			0,
			.44444,
			0,
			0,
			.63889
		],
		118: [
			0,
			.44444,
			.01597,
			0,
			.60694
		],
		119: [
			0,
			.44444,
			.01597,
			0,
			.83055
		],
		120: [
			0,
			.44444,
			0,
			0,
			.60694
		],
		121: [
			.19444,
			.44444,
			.01597,
			0,
			.60694
		],
		122: [
			0,
			.44444,
			0,
			0,
			.51111
		],
		123: [
			.25,
			.75,
			0,
			0,
			.575
		],
		124: [
			.25,
			.75,
			0,
			0,
			.31944
		],
		125: [
			.25,
			.75,
			0,
			0,
			.575
		],
		126: [
			.35,
			.34444,
			0,
			0,
			.575
		],
		160: [
			0,
			0,
			0,
			0,
			.25
		],
		163: [
			0,
			.69444,
			0,
			0,
			.86853
		],
		168: [
			0,
			.69444,
			0,
			0,
			.575
		],
		172: [
			0,
			.44444,
			0,
			0,
			.76666
		],
		176: [
			0,
			.69444,
			0,
			0,
			.86944
		],
		177: [
			.13333,
			.63333,
			0,
			0,
			.89444
		],
		184: [
			.17014,
			0,
			0,
			0,
			.51111
		],
		198: [
			0,
			.68611,
			0,
			0,
			1.04166
		],
		215: [
			.13333,
			.63333,
			0,
			0,
			.89444
		],
		216: [
			.04861,
			.73472,
			0,
			0,
			.89444
		],
		223: [
			0,
			.69444,
			0,
			0,
			.59722
		],
		230: [
			0,
			.44444,
			0,
			0,
			.83055
		],
		247: [
			.13333,
			.63333,
			0,
			0,
			.89444
		],
		248: [
			.09722,
			.54167,
			0,
			0,
			.575
		],
		305: [
			0,
			.44444,
			0,
			0,
			.31944
		],
		338: [
			0,
			.68611,
			0,
			0,
			1.16944
		],
		339: [
			0,
			.44444,
			0,
			0,
			.89444
		],
		567: [
			.19444,
			.44444,
			0,
			0,
			.35139
		],
		710: [
			0,
			.69444,
			0,
			0,
			.575
		],
		711: [
			0,
			.63194,
			0,
			0,
			.575
		],
		713: [
			0,
			.59611,
			0,
			0,
			.575
		],
		714: [
			0,
			.69444,
			0,
			0,
			.575
		],
		715: [
			0,
			.69444,
			0,
			0,
			.575
		],
		728: [
			0,
			.69444,
			0,
			0,
			.575
		],
		729: [
			0,
			.69444,
			0,
			0,
			.31944
		],
		730: [
			0,
			.69444,
			0,
			0,
			.86944
		],
		732: [
			0,
			.69444,
			0,
			0,
			.575
		],
		733: [
			0,
			.69444,
			0,
			0,
			.575
		],
		915: [
			0,
			.68611,
			0,
			0,
			.69166
		],
		916: [
			0,
			.68611,
			0,
			0,
			.95833
		],
		920: [
			0,
			.68611,
			0,
			0,
			.89444
		],
		923: [
			0,
			.68611,
			0,
			0,
			.80555
		],
		926: [
			0,
			.68611,
			0,
			0,
			.76666
		],
		928: [
			0,
			.68611,
			0,
			0,
			.9
		],
		931: [
			0,
			.68611,
			0,
			0,
			.83055
		],
		933: [
			0,
			.68611,
			0,
			0,
			.89444
		],
		934: [
			0,
			.68611,
			0,
			0,
			.83055
		],
		936: [
			0,
			.68611,
			0,
			0,
			.89444
		],
		937: [
			0,
			.68611,
			0,
			0,
			.83055
		],
		8211: [
			0,
			.44444,
			.03194,
			0,
			.575
		],
		8212: [
			0,
			.44444,
			.03194,
			0,
			1.14999
		],
		8216: [
			0,
			.69444,
			0,
			0,
			.31944
		],
		8217: [
			0,
			.69444,
			0,
			0,
			.31944
		],
		8220: [
			0,
			.69444,
			0,
			0,
			.60278
		],
		8221: [
			0,
			.69444,
			0,
			0,
			.60278
		],
		8224: [
			.19444,
			.69444,
			0,
			0,
			.51111
		],
		8225: [
			.19444,
			.69444,
			0,
			0,
			.51111
		],
		8242: [
			0,
			.55556,
			0,
			0,
			.34444
		],
		8407: [
			0,
			.72444,
			.15486,
			0,
			.575
		],
		8463: [
			0,
			.69444,
			0,
			0,
			.66759
		],
		8465: [
			0,
			.69444,
			0,
			0,
			.83055
		],
		8467: [
			0,
			.69444,
			0,
			0,
			.47361
		],
		8472: [
			.19444,
			.44444,
			0,
			0,
			.74027
		],
		8476: [
			0,
			.69444,
			0,
			0,
			.83055
		],
		8501: [
			0,
			.69444,
			0,
			0,
			.70277
		],
		8592: [
			-.10889,
			.39111,
			0,
			0,
			1.14999
		],
		8593: [
			.19444,
			.69444,
			0,
			0,
			.575
		],
		8594: [
			-.10889,
			.39111,
			0,
			0,
			1.14999
		],
		8595: [
			.19444,
			.69444,
			0,
			0,
			.575
		],
		8596: [
			-.10889,
			.39111,
			0,
			0,
			1.14999
		],
		8597: [
			.25,
			.75,
			0,
			0,
			.575
		],
		8598: [
			.19444,
			.69444,
			0,
			0,
			1.14999
		],
		8599: [
			.19444,
			.69444,
			0,
			0,
			1.14999
		],
		8600: [
			.19444,
			.69444,
			0,
			0,
			1.14999
		],
		8601: [
			.19444,
			.69444,
			0,
			0,
			1.14999
		],
		8636: [
			-.10889,
			.39111,
			0,
			0,
			1.14999
		],
		8637: [
			-.10889,
			.39111,
			0,
			0,
			1.14999
		],
		8640: [
			-.10889,
			.39111,
			0,
			0,
			1.14999
		],
		8641: [
			-.10889,
			.39111,
			0,
			0,
			1.14999
		],
		8656: [
			-.10889,
			.39111,
			0,
			0,
			1.14999
		],
		8657: [
			.19444,
			.69444,
			0,
			0,
			.70277
		],
		8658: [
			-.10889,
			.39111,
			0,
			0,
			1.14999
		],
		8659: [
			.19444,
			.69444,
			0,
			0,
			.70277
		],
		8660: [
			-.10889,
			.39111,
			0,
			0,
			1.14999
		],
		8661: [
			.25,
			.75,
			0,
			0,
			.70277
		],
		8704: [
			0,
			.69444,
			0,
			0,
			.63889
		],
		8706: [
			0,
			.69444,
			.06389,
			0,
			.62847
		],
		8707: [
			0,
			.69444,
			0,
			0,
			.63889
		],
		8709: [
			.05556,
			.75,
			0,
			0,
			.575
		],
		8711: [
			0,
			.68611,
			0,
			0,
			.95833
		],
		8712: [
			.08556,
			.58556,
			0,
			0,
			.76666
		],
		8715: [
			.08556,
			.58556,
			0,
			0,
			.76666
		],
		8722: [
			.13333,
			.63333,
			0,
			0,
			.89444
		],
		8723: [
			.13333,
			.63333,
			0,
			0,
			.89444
		],
		8725: [
			.25,
			.75,
			0,
			0,
			.575
		],
		8726: [
			.25,
			.75,
			0,
			0,
			.575
		],
		8727: [
			-.02778,
			.47222,
			0,
			0,
			.575
		],
		8728: [
			-.02639,
			.47361,
			0,
			0,
			.575
		],
		8729: [
			-.02639,
			.47361,
			0,
			0,
			.575
		],
		8730: [
			.18,
			.82,
			0,
			0,
			.95833
		],
		8733: [
			0,
			.44444,
			0,
			0,
			.89444
		],
		8734: [
			0,
			.44444,
			0,
			0,
			1.14999
		],
		8736: [
			0,
			.69224,
			0,
			0,
			.72222
		],
		8739: [
			.25,
			.75,
			0,
			0,
			.31944
		],
		8741: [
			.25,
			.75,
			0,
			0,
			.575
		],
		8743: [
			0,
			.55556,
			0,
			0,
			.76666
		],
		8744: [
			0,
			.55556,
			0,
			0,
			.76666
		],
		8745: [
			0,
			.55556,
			0,
			0,
			.76666
		],
		8746: [
			0,
			.55556,
			0,
			0,
			.76666
		],
		8747: [
			.19444,
			.69444,
			.12778,
			0,
			.56875
		],
		8764: [
			-.10889,
			.39111,
			0,
			0,
			.89444
		],
		8768: [
			.19444,
			.69444,
			0,
			0,
			.31944
		],
		8771: [
			.00222,
			.50222,
			0,
			0,
			.89444
		],
		8773: [
			.027,
			.638,
			0,
			0,
			.894
		],
		8776: [
			.02444,
			.52444,
			0,
			0,
			.89444
		],
		8781: [
			.00222,
			.50222,
			0,
			0,
			.89444
		],
		8801: [
			.00222,
			.50222,
			0,
			0,
			.89444
		],
		8804: [
			.19667,
			.69667,
			0,
			0,
			.89444
		],
		8805: [
			.19667,
			.69667,
			0,
			0,
			.89444
		],
		8810: [
			.08556,
			.58556,
			0,
			0,
			1.14999
		],
		8811: [
			.08556,
			.58556,
			0,
			0,
			1.14999
		],
		8826: [
			.08556,
			.58556,
			0,
			0,
			.89444
		],
		8827: [
			.08556,
			.58556,
			0,
			0,
			.89444
		],
		8834: [
			.08556,
			.58556,
			0,
			0,
			.89444
		],
		8835: [
			.08556,
			.58556,
			0,
			0,
			.89444
		],
		8838: [
			.19667,
			.69667,
			0,
			0,
			.89444
		],
		8839: [
			.19667,
			.69667,
			0,
			0,
			.89444
		],
		8846: [
			0,
			.55556,
			0,
			0,
			.76666
		],
		8849: [
			.19667,
			.69667,
			0,
			0,
			.89444
		],
		8850: [
			.19667,
			.69667,
			0,
			0,
			.89444
		],
		8851: [
			0,
			.55556,
			0,
			0,
			.76666
		],
		8852: [
			0,
			.55556,
			0,
			0,
			.76666
		],
		8853: [
			.13333,
			.63333,
			0,
			0,
			.89444
		],
		8854: [
			.13333,
			.63333,
			0,
			0,
			.89444
		],
		8855: [
			.13333,
			.63333,
			0,
			0,
			.89444
		],
		8856: [
			.13333,
			.63333,
			0,
			0,
			.89444
		],
		8857: [
			.13333,
			.63333,
			0,
			0,
			.89444
		],
		8866: [
			0,
			.69444,
			0,
			0,
			.70277
		],
		8867: [
			0,
			.69444,
			0,
			0,
			.70277
		],
		8868: [
			0,
			.69444,
			0,
			0,
			.89444
		],
		8869: [
			0,
			.69444,
			0,
			0,
			.89444
		],
		8900: [
			-.02639,
			.47361,
			0,
			0,
			.575
		],
		8901: [
			-.02639,
			.47361,
			0,
			0,
			.31944
		],
		8902: [
			-.02778,
			.47222,
			0,
			0,
			.575
		],
		8968: [
			.25,
			.75,
			0,
			0,
			.51111
		],
		8969: [
			.25,
			.75,
			0,
			0,
			.51111
		],
		8970: [
			.25,
			.75,
			0,
			0,
			.51111
		],
		8971: [
			.25,
			.75,
			0,
			0,
			.51111
		],
		8994: [
			-.13889,
			.36111,
			0,
			0,
			1.14999
		],
		8995: [
			-.13889,
			.36111,
			0,
			0,
			1.14999
		],
		9651: [
			.19444,
			.69444,
			0,
			0,
			1.02222
		],
		9657: [
			-.02778,
			.47222,
			0,
			0,
			.575
		],
		9661: [
			.19444,
			.69444,
			0,
			0,
			1.02222
		],
		9667: [
			-.02778,
			.47222,
			0,
			0,
			.575
		],
		9711: [
			.19444,
			.69444,
			0,
			0,
			1.14999
		],
		9824: [
			.12963,
			.69444,
			0,
			0,
			.89444
		],
		9825: [
			.12963,
			.69444,
			0,
			0,
			.89444
		],
		9826: [
			.12963,
			.69444,
			0,
			0,
			.89444
		],
		9827: [
			.12963,
			.69444,
			0,
			0,
			.89444
		],
		9837: [
			0,
			.75,
			0,
			0,
			.44722
		],
		9838: [
			.19444,
			.69444,
			0,
			0,
			.44722
		],
		9839: [
			.19444,
			.69444,
			0,
			0,
			.44722
		],
		10216: [
			.25,
			.75,
			0,
			0,
			.44722
		],
		10217: [
			.25,
			.75,
			0,
			0,
			.44722
		],
		10815: [
			0,
			.68611,
			0,
			0,
			.9
		],
		10927: [
			.19667,
			.69667,
			0,
			0,
			.89444
		],
		10928: [
			.19667,
			.69667,
			0,
			0,
			.89444
		],
		57376: [
			.19444,
			.69444,
			0,
			0,
			0
		]
	},
	"Main-BoldItalic": {
		32: [
			0,
			0,
			0,
			0,
			.25
		],
		33: [
			0,
			.69444,
			.11417,
			0,
			.38611
		],
		34: [
			0,
			.69444,
			.07939,
			0,
			.62055
		],
		35: [
			.19444,
			.69444,
			.06833,
			0,
			.94444
		],
		37: [
			.05556,
			.75,
			.12861,
			0,
			.94444
		],
		38: [
			0,
			.69444,
			.08528,
			0,
			.88555
		],
		39: [
			0,
			.69444,
			.12945,
			0,
			.35555
		],
		40: [
			.25,
			.75,
			.15806,
			0,
			.47333
		],
		41: [
			.25,
			.75,
			.03306,
			0,
			.47333
		],
		42: [
			0,
			.75,
			.14333,
			0,
			.59111
		],
		43: [
			.10333,
			.60333,
			.03306,
			0,
			.88555
		],
		44: [
			.19444,
			.14722,
			0,
			0,
			.35555
		],
		45: [
			0,
			.44444,
			.02611,
			0,
			.41444
		],
		46: [
			0,
			.14722,
			0,
			0,
			.35555
		],
		47: [
			.25,
			.75,
			.15806,
			0,
			.59111
		],
		48: [
			0,
			.64444,
			.13167,
			0,
			.59111
		],
		49: [
			0,
			.64444,
			.13167,
			0,
			.59111
		],
		50: [
			0,
			.64444,
			.13167,
			0,
			.59111
		],
		51: [
			0,
			.64444,
			.13167,
			0,
			.59111
		],
		52: [
			.19444,
			.64444,
			.13167,
			0,
			.59111
		],
		53: [
			0,
			.64444,
			.13167,
			0,
			.59111
		],
		54: [
			0,
			.64444,
			.13167,
			0,
			.59111
		],
		55: [
			.19444,
			.64444,
			.13167,
			0,
			.59111
		],
		56: [
			0,
			.64444,
			.13167,
			0,
			.59111
		],
		57: [
			0,
			.64444,
			.13167,
			0,
			.59111
		],
		58: [
			0,
			.44444,
			.06695,
			0,
			.35555
		],
		59: [
			.19444,
			.44444,
			.06695,
			0,
			.35555
		],
		61: [
			-.10889,
			.39111,
			.06833,
			0,
			.88555
		],
		63: [
			0,
			.69444,
			.11472,
			0,
			.59111
		],
		64: [
			0,
			.69444,
			.09208,
			0,
			.88555
		],
		65: [
			0,
			.68611,
			0,
			0,
			.86555
		],
		66: [
			0,
			.68611,
			.0992,
			0,
			.81666
		],
		67: [
			0,
			.68611,
			.14208,
			0,
			.82666
		],
		68: [
			0,
			.68611,
			.09062,
			0,
			.87555
		],
		69: [
			0,
			.68611,
			.11431,
			0,
			.75666
		],
		70: [
			0,
			.68611,
			.12903,
			0,
			.72722
		],
		71: [
			0,
			.68611,
			.07347,
			0,
			.89527
		],
		72: [
			0,
			.68611,
			.17208,
			0,
			.8961
		],
		73: [
			0,
			.68611,
			.15681,
			0,
			.47166
		],
		74: [
			0,
			.68611,
			.145,
			0,
			.61055
		],
		75: [
			0,
			.68611,
			.14208,
			0,
			.89499
		],
		76: [
			0,
			.68611,
			0,
			0,
			.69777
		],
		77: [
			0,
			.68611,
			.17208,
			0,
			1.07277
		],
		78: [
			0,
			.68611,
			.17208,
			0,
			.8961
		],
		79: [
			0,
			.68611,
			.09062,
			0,
			.85499
		],
		80: [
			0,
			.68611,
			.0992,
			0,
			.78721
		],
		81: [
			.19444,
			.68611,
			.09062,
			0,
			.85499
		],
		82: [
			0,
			.68611,
			.02559,
			0,
			.85944
		],
		83: [
			0,
			.68611,
			.11264,
			0,
			.64999
		],
		84: [
			0,
			.68611,
			.12903,
			0,
			.7961
		],
		85: [
			0,
			.68611,
			.17208,
			0,
			.88083
		],
		86: [
			0,
			.68611,
			.18625,
			0,
			.86555
		],
		87: [
			0,
			.68611,
			.18625,
			0,
			1.15999
		],
		88: [
			0,
			.68611,
			.15681,
			0,
			.86555
		],
		89: [
			0,
			.68611,
			.19803,
			0,
			.86555
		],
		90: [
			0,
			.68611,
			.14208,
			0,
			.70888
		],
		91: [
			.25,
			.75,
			.1875,
			0,
			.35611
		],
		93: [
			.25,
			.75,
			.09972,
			0,
			.35611
		],
		94: [
			0,
			.69444,
			.06709,
			0,
			.59111
		],
		95: [
			.31,
			.13444,
			.09811,
			0,
			.59111
		],
		97: [
			0,
			.44444,
			.09426,
			0,
			.59111
		],
		98: [
			0,
			.69444,
			.07861,
			0,
			.53222
		],
		99: [
			0,
			.44444,
			.05222,
			0,
			.53222
		],
		100: [
			0,
			.69444,
			.10861,
			0,
			.59111
		],
		101: [
			0,
			.44444,
			.085,
			0,
			.53222
		],
		102: [
			.19444,
			.69444,
			.21778,
			0,
			.4
		],
		103: [
			.19444,
			.44444,
			.105,
			0,
			.53222
		],
		104: [
			0,
			.69444,
			.09426,
			0,
			.59111
		],
		105: [
			0,
			.69326,
			.11387,
			0,
			.35555
		],
		106: [
			.19444,
			.69326,
			.1672,
			0,
			.35555
		],
		107: [
			0,
			.69444,
			.11111,
			0,
			.53222
		],
		108: [
			0,
			.69444,
			.10861,
			0,
			.29666
		],
		109: [
			0,
			.44444,
			.09426,
			0,
			.94444
		],
		110: [
			0,
			.44444,
			.09426,
			0,
			.64999
		],
		111: [
			0,
			.44444,
			.07861,
			0,
			.59111
		],
		112: [
			.19444,
			.44444,
			.07861,
			0,
			.59111
		],
		113: [
			.19444,
			.44444,
			.105,
			0,
			.53222
		],
		114: [
			0,
			.44444,
			.11111,
			0,
			.50167
		],
		115: [
			0,
			.44444,
			.08167,
			0,
			.48694
		],
		116: [
			0,
			.63492,
			.09639,
			0,
			.385
		],
		117: [
			0,
			.44444,
			.09426,
			0,
			.62055
		],
		118: [
			0,
			.44444,
			.11111,
			0,
			.53222
		],
		119: [
			0,
			.44444,
			.11111,
			0,
			.76777
		],
		120: [
			0,
			.44444,
			.12583,
			0,
			.56055
		],
		121: [
			.19444,
			.44444,
			.105,
			0,
			.56166
		],
		122: [
			0,
			.44444,
			.13889,
			0,
			.49055
		],
		126: [
			.35,
			.34444,
			.11472,
			0,
			.59111
		],
		160: [
			0,
			0,
			0,
			0,
			.25
		],
		168: [
			0,
			.69444,
			.11473,
			0,
			.59111
		],
		176: [
			0,
			.69444,
			0,
			0,
			.94888
		],
		184: [
			.17014,
			0,
			0,
			0,
			.53222
		],
		198: [
			0,
			.68611,
			.11431,
			0,
			1.02277
		],
		216: [
			.04861,
			.73472,
			.09062,
			0,
			.88555
		],
		223: [
			.19444,
			.69444,
			.09736,
			0,
			.665
		],
		230: [
			0,
			.44444,
			.085,
			0,
			.82666
		],
		248: [
			.09722,
			.54167,
			.09458,
			0,
			.59111
		],
		305: [
			0,
			.44444,
			.09426,
			0,
			.35555
		],
		338: [
			0,
			.68611,
			.11431,
			0,
			1.14054
		],
		339: [
			0,
			.44444,
			.085,
			0,
			.82666
		],
		567: [
			.19444,
			.44444,
			.04611,
			0,
			.385
		],
		710: [
			0,
			.69444,
			.06709,
			0,
			.59111
		],
		711: [
			0,
			.63194,
			.08271,
			0,
			.59111
		],
		713: [
			0,
			.59444,
			.10444,
			0,
			.59111
		],
		714: [
			0,
			.69444,
			.08528,
			0,
			.59111
		],
		715: [
			0,
			.69444,
			0,
			0,
			.59111
		],
		728: [
			0,
			.69444,
			.10333,
			0,
			.59111
		],
		729: [
			0,
			.69444,
			.12945,
			0,
			.35555
		],
		730: [
			0,
			.69444,
			0,
			0,
			.94888
		],
		732: [
			0,
			.69444,
			.11472,
			0,
			.59111
		],
		733: [
			0,
			.69444,
			.11472,
			0,
			.59111
		],
		915: [
			0,
			.68611,
			.12903,
			0,
			.69777
		],
		916: [
			0,
			.68611,
			0,
			0,
			.94444
		],
		920: [
			0,
			.68611,
			.09062,
			0,
			.88555
		],
		923: [
			0,
			.68611,
			0,
			0,
			.80666
		],
		926: [
			0,
			.68611,
			.15092,
			0,
			.76777
		],
		928: [
			0,
			.68611,
			.17208,
			0,
			.8961
		],
		931: [
			0,
			.68611,
			.11431,
			0,
			.82666
		],
		933: [
			0,
			.68611,
			.10778,
			0,
			.88555
		],
		934: [
			0,
			.68611,
			.05632,
			0,
			.82666
		],
		936: [
			0,
			.68611,
			.10778,
			0,
			.88555
		],
		937: [
			0,
			.68611,
			.0992,
			0,
			.82666
		],
		8211: [
			0,
			.44444,
			.09811,
			0,
			.59111
		],
		8212: [
			0,
			.44444,
			.09811,
			0,
			1.18221
		],
		8216: [
			0,
			.69444,
			.12945,
			0,
			.35555
		],
		8217: [
			0,
			.69444,
			.12945,
			0,
			.35555
		],
		8220: [
			0,
			.69444,
			.16772,
			0,
			.62055
		],
		8221: [
			0,
			.69444,
			.07939,
			0,
			.62055
		]
	},
	"Main-Italic": {
		32: [
			0,
			0,
			0,
			0,
			.25
		],
		33: [
			0,
			.69444,
			.12417,
			0,
			.30667
		],
		34: [
			0,
			.69444,
			.06961,
			0,
			.51444
		],
		35: [
			.19444,
			.69444,
			.06616,
			0,
			.81777
		],
		37: [
			.05556,
			.75,
			.13639,
			0,
			.81777
		],
		38: [
			0,
			.69444,
			.09694,
			0,
			.76666
		],
		39: [
			0,
			.69444,
			.12417,
			0,
			.30667
		],
		40: [
			.25,
			.75,
			.16194,
			0,
			.40889
		],
		41: [
			.25,
			.75,
			.03694,
			0,
			.40889
		],
		42: [
			0,
			.75,
			.14917,
			0,
			.51111
		],
		43: [
			.05667,
			.56167,
			.03694,
			0,
			.76666
		],
		44: [
			.19444,
			.10556,
			0,
			0,
			.30667
		],
		45: [
			0,
			.43056,
			.02826,
			0,
			.35778
		],
		46: [
			0,
			.10556,
			0,
			0,
			.30667
		],
		47: [
			.25,
			.75,
			.16194,
			0,
			.51111
		],
		48: [
			0,
			.64444,
			.13556,
			0,
			.51111
		],
		49: [
			0,
			.64444,
			.13556,
			0,
			.51111
		],
		50: [
			0,
			.64444,
			.13556,
			0,
			.51111
		],
		51: [
			0,
			.64444,
			.13556,
			0,
			.51111
		],
		52: [
			.19444,
			.64444,
			.13556,
			0,
			.51111
		],
		53: [
			0,
			.64444,
			.13556,
			0,
			.51111
		],
		54: [
			0,
			.64444,
			.13556,
			0,
			.51111
		],
		55: [
			.19444,
			.64444,
			.13556,
			0,
			.51111
		],
		56: [
			0,
			.64444,
			.13556,
			0,
			.51111
		],
		57: [
			0,
			.64444,
			.13556,
			0,
			.51111
		],
		58: [
			0,
			.43056,
			.0582,
			0,
			.30667
		],
		59: [
			.19444,
			.43056,
			.0582,
			0,
			.30667
		],
		61: [
			-.13313,
			.36687,
			.06616,
			0,
			.76666
		],
		63: [
			0,
			.69444,
			.1225,
			0,
			.51111
		],
		64: [
			0,
			.69444,
			.09597,
			0,
			.76666
		],
		65: [
			0,
			.68333,
			0,
			0,
			.74333
		],
		66: [
			0,
			.68333,
			.10257,
			0,
			.70389
		],
		67: [
			0,
			.68333,
			.14528,
			0,
			.71555
		],
		68: [
			0,
			.68333,
			.09403,
			0,
			.755
		],
		69: [
			0,
			.68333,
			.12028,
			0,
			.67833
		],
		70: [
			0,
			.68333,
			.13305,
			0,
			.65277
		],
		71: [
			0,
			.68333,
			.08722,
			0,
			.77361
		],
		72: [
			0,
			.68333,
			.16389,
			0,
			.74333
		],
		73: [
			0,
			.68333,
			.15806,
			0,
			.38555
		],
		74: [
			0,
			.68333,
			.14028,
			0,
			.525
		],
		75: [
			0,
			.68333,
			.14528,
			0,
			.76888
		],
		76: [
			0,
			.68333,
			0,
			0,
			.62722
		],
		77: [
			0,
			.68333,
			.16389,
			0,
			.89666
		],
		78: [
			0,
			.68333,
			.16389,
			0,
			.74333
		],
		79: [
			0,
			.68333,
			.09403,
			0,
			.76666
		],
		80: [
			0,
			.68333,
			.10257,
			0,
			.67833
		],
		81: [
			.19444,
			.68333,
			.09403,
			0,
			.76666
		],
		82: [
			0,
			.68333,
			.03868,
			0,
			.72944
		],
		83: [
			0,
			.68333,
			.11972,
			0,
			.56222
		],
		84: [
			0,
			.68333,
			.13305,
			0,
			.71555
		],
		85: [
			0,
			.68333,
			.16389,
			0,
			.74333
		],
		86: [
			0,
			.68333,
			.18361,
			0,
			.74333
		],
		87: [
			0,
			.68333,
			.18361,
			0,
			.99888
		],
		88: [
			0,
			.68333,
			.15806,
			0,
			.74333
		],
		89: [
			0,
			.68333,
			.19383,
			0,
			.74333
		],
		90: [
			0,
			.68333,
			.14528,
			0,
			.61333
		],
		91: [
			.25,
			.75,
			.1875,
			0,
			.30667
		],
		93: [
			.25,
			.75,
			.10528,
			0,
			.30667
		],
		94: [
			0,
			.69444,
			.06646,
			0,
			.51111
		],
		95: [
			.31,
			.12056,
			.09208,
			0,
			.51111
		],
		97: [
			0,
			.43056,
			.07671,
			0,
			.51111
		],
		98: [
			0,
			.69444,
			.06312,
			0,
			.46
		],
		99: [
			0,
			.43056,
			.05653,
			0,
			.46
		],
		100: [
			0,
			.69444,
			.10333,
			0,
			.51111
		],
		101: [
			0,
			.43056,
			.07514,
			0,
			.46
		],
		102: [
			.19444,
			.69444,
			.21194,
			0,
			.30667
		],
		103: [
			.19444,
			.43056,
			.08847,
			0,
			.46
		],
		104: [
			0,
			.69444,
			.07671,
			0,
			.51111
		],
		105: [
			0,
			.65536,
			.1019,
			0,
			.30667
		],
		106: [
			.19444,
			.65536,
			.14467,
			0,
			.30667
		],
		107: [
			0,
			.69444,
			.10764,
			0,
			.46
		],
		108: [
			0,
			.69444,
			.10333,
			0,
			.25555
		],
		109: [
			0,
			.43056,
			.07671,
			0,
			.81777
		],
		110: [
			0,
			.43056,
			.07671,
			0,
			.56222
		],
		111: [
			0,
			.43056,
			.06312,
			0,
			.51111
		],
		112: [
			.19444,
			.43056,
			.06312,
			0,
			.51111
		],
		113: [
			.19444,
			.43056,
			.08847,
			0,
			.46
		],
		114: [
			0,
			.43056,
			.10764,
			0,
			.42166
		],
		115: [
			0,
			.43056,
			.08208,
			0,
			.40889
		],
		116: [
			0,
			.61508,
			.09486,
			0,
			.33222
		],
		117: [
			0,
			.43056,
			.07671,
			0,
			.53666
		],
		118: [
			0,
			.43056,
			.10764,
			0,
			.46
		],
		119: [
			0,
			.43056,
			.10764,
			0,
			.66444
		],
		120: [
			0,
			.43056,
			.12042,
			0,
			.46389
		],
		121: [
			.19444,
			.43056,
			.08847,
			0,
			.48555
		],
		122: [
			0,
			.43056,
			.12292,
			0,
			.40889
		],
		126: [
			.35,
			.31786,
			.11585,
			0,
			.51111
		],
		160: [
			0,
			0,
			0,
			0,
			.25
		],
		168: [
			0,
			.66786,
			.10474,
			0,
			.51111
		],
		176: [
			0,
			.69444,
			0,
			0,
			.83129
		],
		184: [
			.17014,
			0,
			0,
			0,
			.46
		],
		198: [
			0,
			.68333,
			.12028,
			0,
			.88277
		],
		216: [
			.04861,
			.73194,
			.09403,
			0,
			.76666
		],
		223: [
			.19444,
			.69444,
			.10514,
			0,
			.53666
		],
		230: [
			0,
			.43056,
			.07514,
			0,
			.71555
		],
		248: [
			.09722,
			.52778,
			.09194,
			0,
			.51111
		],
		338: [
			0,
			.68333,
			.12028,
			0,
			.98499
		],
		339: [
			0,
			.43056,
			.07514,
			0,
			.71555
		],
		710: [
			0,
			.69444,
			.06646,
			0,
			.51111
		],
		711: [
			0,
			.62847,
			.08295,
			0,
			.51111
		],
		713: [
			0,
			.56167,
			.10333,
			0,
			.51111
		],
		714: [
			0,
			.69444,
			.09694,
			0,
			.51111
		],
		715: [
			0,
			.69444,
			0,
			0,
			.51111
		],
		728: [
			0,
			.69444,
			.10806,
			0,
			.51111
		],
		729: [
			0,
			.66786,
			.11752,
			0,
			.30667
		],
		730: [
			0,
			.69444,
			0,
			0,
			.83129
		],
		732: [
			0,
			.66786,
			.11585,
			0,
			.51111
		],
		733: [
			0,
			.69444,
			.1225,
			0,
			.51111
		],
		915: [
			0,
			.68333,
			.13305,
			0,
			.62722
		],
		916: [
			0,
			.68333,
			0,
			0,
			.81777
		],
		920: [
			0,
			.68333,
			.09403,
			0,
			.76666
		],
		923: [
			0,
			.68333,
			0,
			0,
			.69222
		],
		926: [
			0,
			.68333,
			.15294,
			0,
			.66444
		],
		928: [
			0,
			.68333,
			.16389,
			0,
			.74333
		],
		931: [
			0,
			.68333,
			.12028,
			0,
			.71555
		],
		933: [
			0,
			.68333,
			.11111,
			0,
			.76666
		],
		934: [
			0,
			.68333,
			.05986,
			0,
			.71555
		],
		936: [
			0,
			.68333,
			.11111,
			0,
			.76666
		],
		937: [
			0,
			.68333,
			.10257,
			0,
			.71555
		],
		8211: [
			0,
			.43056,
			.09208,
			0,
			.51111
		],
		8212: [
			0,
			.43056,
			.09208,
			0,
			1.02222
		],
		8216: [
			0,
			.69444,
			.12417,
			0,
			.30667
		],
		8217: [
			0,
			.69444,
			.12417,
			0,
			.30667
		],
		8220: [
			0,
			.69444,
			.1685,
			0,
			.51444
		],
		8221: [
			0,
			.69444,
			.06961,
			0,
			.51444
		],
		8463: [
			0,
			.68889,
			0,
			0,
			.54028
		]
	},
	"Main-Regular": {
		32: [
			0,
			0,
			0,
			0,
			.25
		],
		33: [
			0,
			.69444,
			0,
			0,
			.27778
		],
		34: [
			0,
			.69444,
			0,
			0,
			.5
		],
		35: [
			.19444,
			.69444,
			0,
			0,
			.83334
		],
		36: [
			.05556,
			.75,
			0,
			0,
			.5
		],
		37: [
			.05556,
			.75,
			0,
			0,
			.83334
		],
		38: [
			0,
			.69444,
			0,
			0,
			.77778
		],
		39: [
			0,
			.69444,
			0,
			0,
			.27778
		],
		40: [
			.25,
			.75,
			0,
			0,
			.38889
		],
		41: [
			.25,
			.75,
			0,
			0,
			.38889
		],
		42: [
			0,
			.75,
			0,
			0,
			.5
		],
		43: [
			.08333,
			.58333,
			0,
			0,
			.77778
		],
		44: [
			.19444,
			.10556,
			0,
			0,
			.27778
		],
		45: [
			0,
			.43056,
			0,
			0,
			.33333
		],
		46: [
			0,
			.10556,
			0,
			0,
			.27778
		],
		47: [
			.25,
			.75,
			0,
			0,
			.5
		],
		48: [
			0,
			.64444,
			0,
			0,
			.5
		],
		49: [
			0,
			.64444,
			0,
			0,
			.5
		],
		50: [
			0,
			.64444,
			0,
			0,
			.5
		],
		51: [
			0,
			.64444,
			0,
			0,
			.5
		],
		52: [
			0,
			.64444,
			0,
			0,
			.5
		],
		53: [
			0,
			.64444,
			0,
			0,
			.5
		],
		54: [
			0,
			.64444,
			0,
			0,
			.5
		],
		55: [
			0,
			.64444,
			0,
			0,
			.5
		],
		56: [
			0,
			.64444,
			0,
			0,
			.5
		],
		57: [
			0,
			.64444,
			0,
			0,
			.5
		],
		58: [
			0,
			.43056,
			0,
			0,
			.27778
		],
		59: [
			.19444,
			.43056,
			0,
			0,
			.27778
		],
		60: [
			.0391,
			.5391,
			0,
			0,
			.77778
		],
		61: [
			-.13313,
			.36687,
			0,
			0,
			.77778
		],
		62: [
			.0391,
			.5391,
			0,
			0,
			.77778
		],
		63: [
			0,
			.69444,
			0,
			0,
			.47222
		],
		64: [
			0,
			.69444,
			0,
			0,
			.77778
		],
		65: [
			0,
			.68333,
			0,
			0,
			.75
		],
		66: [
			0,
			.68333,
			0,
			0,
			.70834
		],
		67: [
			0,
			.68333,
			0,
			0,
			.72222
		],
		68: [
			0,
			.68333,
			0,
			0,
			.76389
		],
		69: [
			0,
			.68333,
			0,
			0,
			.68056
		],
		70: [
			0,
			.68333,
			0,
			0,
			.65278
		],
		71: [
			0,
			.68333,
			0,
			0,
			.78472
		],
		72: [
			0,
			.68333,
			0,
			0,
			.75
		],
		73: [
			0,
			.68333,
			0,
			0,
			.36111
		],
		74: [
			0,
			.68333,
			0,
			0,
			.51389
		],
		75: [
			0,
			.68333,
			0,
			0,
			.77778
		],
		76: [
			0,
			.68333,
			0,
			0,
			.625
		],
		77: [
			0,
			.68333,
			0,
			0,
			.91667
		],
		78: [
			0,
			.68333,
			0,
			0,
			.75
		],
		79: [
			0,
			.68333,
			0,
			0,
			.77778
		],
		80: [
			0,
			.68333,
			0,
			0,
			.68056
		],
		81: [
			.19444,
			.68333,
			0,
			0,
			.77778
		],
		82: [
			0,
			.68333,
			0,
			0,
			.73611
		],
		83: [
			0,
			.68333,
			0,
			0,
			.55556
		],
		84: [
			0,
			.68333,
			0,
			0,
			.72222
		],
		85: [
			0,
			.68333,
			0,
			0,
			.75
		],
		86: [
			0,
			.68333,
			.01389,
			0,
			.75
		],
		87: [
			0,
			.68333,
			.01389,
			0,
			1.02778
		],
		88: [
			0,
			.68333,
			0,
			0,
			.75
		],
		89: [
			0,
			.68333,
			.025,
			0,
			.75
		],
		90: [
			0,
			.68333,
			0,
			0,
			.61111
		],
		91: [
			.25,
			.75,
			0,
			0,
			.27778
		],
		92: [
			.25,
			.75,
			0,
			0,
			.5
		],
		93: [
			.25,
			.75,
			0,
			0,
			.27778
		],
		94: [
			0,
			.69444,
			0,
			0,
			.5
		],
		95: [
			.31,
			.12056,
			.02778,
			0,
			.5
		],
		97: [
			0,
			.43056,
			0,
			0,
			.5
		],
		98: [
			0,
			.69444,
			0,
			0,
			.55556
		],
		99: [
			0,
			.43056,
			0,
			0,
			.44445
		],
		100: [
			0,
			.69444,
			0,
			0,
			.55556
		],
		101: [
			0,
			.43056,
			0,
			0,
			.44445
		],
		102: [
			0,
			.69444,
			.07778,
			0,
			.30556
		],
		103: [
			.19444,
			.43056,
			.01389,
			0,
			.5
		],
		104: [
			0,
			.69444,
			0,
			0,
			.55556
		],
		105: [
			0,
			.66786,
			0,
			0,
			.27778
		],
		106: [
			.19444,
			.66786,
			0,
			0,
			.30556
		],
		107: [
			0,
			.69444,
			0,
			0,
			.52778
		],
		108: [
			0,
			.69444,
			0,
			0,
			.27778
		],
		109: [
			0,
			.43056,
			0,
			0,
			.83334
		],
		110: [
			0,
			.43056,
			0,
			0,
			.55556
		],
		111: [
			0,
			.43056,
			0,
			0,
			.5
		],
		112: [
			.19444,
			.43056,
			0,
			0,
			.55556
		],
		113: [
			.19444,
			.43056,
			0,
			0,
			.52778
		],
		114: [
			0,
			.43056,
			0,
			0,
			.39167
		],
		115: [
			0,
			.43056,
			0,
			0,
			.39445
		],
		116: [
			0,
			.61508,
			0,
			0,
			.38889
		],
		117: [
			0,
			.43056,
			0,
			0,
			.55556
		],
		118: [
			0,
			.43056,
			.01389,
			0,
			.52778
		],
		119: [
			0,
			.43056,
			.01389,
			0,
			.72222
		],
		120: [
			0,
			.43056,
			0,
			0,
			.52778
		],
		121: [
			.19444,
			.43056,
			.01389,
			0,
			.52778
		],
		122: [
			0,
			.43056,
			0,
			0,
			.44445
		],
		123: [
			.25,
			.75,
			0,
			0,
			.5
		],
		124: [
			.25,
			.75,
			0,
			0,
			.27778
		],
		125: [
			.25,
			.75,
			0,
			0,
			.5
		],
		126: [
			.35,
			.31786,
			0,
			0,
			.5
		],
		160: [
			0,
			0,
			0,
			0,
			.25
		],
		163: [
			0,
			.69444,
			0,
			0,
			.76909
		],
		167: [
			.19444,
			.69444,
			0,
			0,
			.44445
		],
		168: [
			0,
			.66786,
			0,
			0,
			.5
		],
		172: [
			0,
			.43056,
			0,
			0,
			.66667
		],
		176: [
			0,
			.69444,
			0,
			0,
			.75
		],
		177: [
			.08333,
			.58333,
			0,
			0,
			.77778
		],
		182: [
			.19444,
			.69444,
			0,
			0,
			.61111
		],
		184: [
			.17014,
			0,
			0,
			0,
			.44445
		],
		198: [
			0,
			.68333,
			0,
			0,
			.90278
		],
		215: [
			.08333,
			.58333,
			0,
			0,
			.77778
		],
		216: [
			.04861,
			.73194,
			0,
			0,
			.77778
		],
		223: [
			0,
			.69444,
			0,
			0,
			.5
		],
		230: [
			0,
			.43056,
			0,
			0,
			.72222
		],
		247: [
			.08333,
			.58333,
			0,
			0,
			.77778
		],
		248: [
			.09722,
			.52778,
			0,
			0,
			.5
		],
		305: [
			0,
			.43056,
			0,
			0,
			.27778
		],
		338: [
			0,
			.68333,
			0,
			0,
			1.01389
		],
		339: [
			0,
			.43056,
			0,
			0,
			.77778
		],
		567: [
			.19444,
			.43056,
			0,
			0,
			.30556
		],
		710: [
			0,
			.69444,
			0,
			0,
			.5
		],
		711: [
			0,
			.62847,
			0,
			0,
			.5
		],
		713: [
			0,
			.56778,
			0,
			0,
			.5
		],
		714: [
			0,
			.69444,
			0,
			0,
			.5
		],
		715: [
			0,
			.69444,
			0,
			0,
			.5
		],
		728: [
			0,
			.69444,
			0,
			0,
			.5
		],
		729: [
			0,
			.66786,
			0,
			0,
			.27778
		],
		730: [
			0,
			.69444,
			0,
			0,
			.75
		],
		732: [
			0,
			.66786,
			0,
			0,
			.5
		],
		733: [
			0,
			.69444,
			0,
			0,
			.5
		],
		915: [
			0,
			.68333,
			0,
			0,
			.625
		],
		916: [
			0,
			.68333,
			0,
			0,
			.83334
		],
		920: [
			0,
			.68333,
			0,
			0,
			.77778
		],
		923: [
			0,
			.68333,
			0,
			0,
			.69445
		],
		926: [
			0,
			.68333,
			0,
			0,
			.66667
		],
		928: [
			0,
			.68333,
			0,
			0,
			.75
		],
		931: [
			0,
			.68333,
			0,
			0,
			.72222
		],
		933: [
			0,
			.68333,
			0,
			0,
			.77778
		],
		934: [
			0,
			.68333,
			0,
			0,
			.72222
		],
		936: [
			0,
			.68333,
			0,
			0,
			.77778
		],
		937: [
			0,
			.68333,
			0,
			0,
			.72222
		],
		8211: [
			0,
			.43056,
			.02778,
			0,
			.5
		],
		8212: [
			0,
			.43056,
			.02778,
			0,
			1
		],
		8216: [
			0,
			.69444,
			0,
			0,
			.27778
		],
		8217: [
			0,
			.69444,
			0,
			0,
			.27778
		],
		8220: [
			0,
			.69444,
			0,
			0,
			.5
		],
		8221: [
			0,
			.69444,
			0,
			0,
			.5
		],
		8224: [
			.19444,
			.69444,
			0,
			0,
			.44445
		],
		8225: [
			.19444,
			.69444,
			0,
			0,
			.44445
		],
		8230: [
			0,
			.123,
			0,
			0,
			1.172
		],
		8242: [
			0,
			.55556,
			0,
			0,
			.275
		],
		8407: [
			0,
			.71444,
			.15382,
			0,
			.5
		],
		8463: [
			0,
			.68889,
			0,
			0,
			.54028
		],
		8465: [
			0,
			.69444,
			0,
			0,
			.72222
		],
		8467: [
			0,
			.69444,
			0,
			.11111,
			.41667
		],
		8472: [
			.19444,
			.43056,
			0,
			.11111,
			.63646
		],
		8476: [
			0,
			.69444,
			0,
			0,
			.72222
		],
		8501: [
			0,
			.69444,
			0,
			0,
			.61111
		],
		8592: [
			-.13313,
			.36687,
			0,
			0,
			1
		],
		8593: [
			.19444,
			.69444,
			0,
			0,
			.5
		],
		8594: [
			-.13313,
			.36687,
			0,
			0,
			1
		],
		8595: [
			.19444,
			.69444,
			0,
			0,
			.5
		],
		8596: [
			-.13313,
			.36687,
			0,
			0,
			1
		],
		8597: [
			.25,
			.75,
			0,
			0,
			.5
		],
		8598: [
			.19444,
			.69444,
			0,
			0,
			1
		],
		8599: [
			.19444,
			.69444,
			0,
			0,
			1
		],
		8600: [
			.19444,
			.69444,
			0,
			0,
			1
		],
		8601: [
			.19444,
			.69444,
			0,
			0,
			1
		],
		8614: [
			.011,
			.511,
			0,
			0,
			1
		],
		8617: [
			.011,
			.511,
			0,
			0,
			1.126
		],
		8618: [
			.011,
			.511,
			0,
			0,
			1.126
		],
		8636: [
			-.13313,
			.36687,
			0,
			0,
			1
		],
		8637: [
			-.13313,
			.36687,
			0,
			0,
			1
		],
		8640: [
			-.13313,
			.36687,
			0,
			0,
			1
		],
		8641: [
			-.13313,
			.36687,
			0,
			0,
			1
		],
		8652: [
			.011,
			.671,
			0,
			0,
			1
		],
		8656: [
			-.13313,
			.36687,
			0,
			0,
			1
		],
		8657: [
			.19444,
			.69444,
			0,
			0,
			.61111
		],
		8658: [
			-.13313,
			.36687,
			0,
			0,
			1
		],
		8659: [
			.19444,
			.69444,
			0,
			0,
			.61111
		],
		8660: [
			-.13313,
			.36687,
			0,
			0,
			1
		],
		8661: [
			.25,
			.75,
			0,
			0,
			.61111
		],
		8704: [
			0,
			.69444,
			0,
			0,
			.55556
		],
		8706: [
			0,
			.69444,
			.05556,
			.08334,
			.5309
		],
		8707: [
			0,
			.69444,
			0,
			0,
			.55556
		],
		8709: [
			.05556,
			.75,
			0,
			0,
			.5
		],
		8711: [
			0,
			.68333,
			0,
			0,
			.83334
		],
		8712: [
			.0391,
			.5391,
			0,
			0,
			.66667
		],
		8715: [
			.0391,
			.5391,
			0,
			0,
			.66667
		],
		8722: [
			.08333,
			.58333,
			0,
			0,
			.77778
		],
		8723: [
			.08333,
			.58333,
			0,
			0,
			.77778
		],
		8725: [
			.25,
			.75,
			0,
			0,
			.5
		],
		8726: [
			.25,
			.75,
			0,
			0,
			.5
		],
		8727: [
			-.03472,
			.46528,
			0,
			0,
			.5
		],
		8728: [
			-.05555,
			.44445,
			0,
			0,
			.5
		],
		8729: [
			-.05555,
			.44445,
			0,
			0,
			.5
		],
		8730: [
			.2,
			.8,
			0,
			0,
			.83334
		],
		8733: [
			0,
			.43056,
			0,
			0,
			.77778
		],
		8734: [
			0,
			.43056,
			0,
			0,
			1
		],
		8736: [
			0,
			.69224,
			0,
			0,
			.72222
		],
		8739: [
			.25,
			.75,
			0,
			0,
			.27778
		],
		8741: [
			.25,
			.75,
			0,
			0,
			.5
		],
		8743: [
			0,
			.55556,
			0,
			0,
			.66667
		],
		8744: [
			0,
			.55556,
			0,
			0,
			.66667
		],
		8745: [
			0,
			.55556,
			0,
			0,
			.66667
		],
		8746: [
			0,
			.55556,
			0,
			0,
			.66667
		],
		8747: [
			.19444,
			.69444,
			.11111,
			0,
			.41667
		],
		8764: [
			-.13313,
			.36687,
			0,
			0,
			.77778
		],
		8768: [
			.19444,
			.69444,
			0,
			0,
			.27778
		],
		8771: [
			-.03625,
			.46375,
			0,
			0,
			.77778
		],
		8773: [
			-.022,
			.589,
			0,
			0,
			.778
		],
		8776: [
			-.01688,
			.48312,
			0,
			0,
			.77778
		],
		8781: [
			-.03625,
			.46375,
			0,
			0,
			.77778
		],
		8784: [
			-.133,
			.673,
			0,
			0,
			.778
		],
		8801: [
			-.03625,
			.46375,
			0,
			0,
			.77778
		],
		8804: [
			.13597,
			.63597,
			0,
			0,
			.77778
		],
		8805: [
			.13597,
			.63597,
			0,
			0,
			.77778
		],
		8810: [
			.0391,
			.5391,
			0,
			0,
			1
		],
		8811: [
			.0391,
			.5391,
			0,
			0,
			1
		],
		8826: [
			.0391,
			.5391,
			0,
			0,
			.77778
		],
		8827: [
			.0391,
			.5391,
			0,
			0,
			.77778
		],
		8834: [
			.0391,
			.5391,
			0,
			0,
			.77778
		],
		8835: [
			.0391,
			.5391,
			0,
			0,
			.77778
		],
		8838: [
			.13597,
			.63597,
			0,
			0,
			.77778
		],
		8839: [
			.13597,
			.63597,
			0,
			0,
			.77778
		],
		8846: [
			0,
			.55556,
			0,
			0,
			.66667
		],
		8849: [
			.13597,
			.63597,
			0,
			0,
			.77778
		],
		8850: [
			.13597,
			.63597,
			0,
			0,
			.77778
		],
		8851: [
			0,
			.55556,
			0,
			0,
			.66667
		],
		8852: [
			0,
			.55556,
			0,
			0,
			.66667
		],
		8853: [
			.08333,
			.58333,
			0,
			0,
			.77778
		],
		8854: [
			.08333,
			.58333,
			0,
			0,
			.77778
		],
		8855: [
			.08333,
			.58333,
			0,
			0,
			.77778
		],
		8856: [
			.08333,
			.58333,
			0,
			0,
			.77778
		],
		8857: [
			.08333,
			.58333,
			0,
			0,
			.77778
		],
		8866: [
			0,
			.69444,
			0,
			0,
			.61111
		],
		8867: [
			0,
			.69444,
			0,
			0,
			.61111
		],
		8868: [
			0,
			.69444,
			0,
			0,
			.77778
		],
		8869: [
			0,
			.69444,
			0,
			0,
			.77778
		],
		8872: [
			.249,
			.75,
			0,
			0,
			.867
		],
		8900: [
			-.05555,
			.44445,
			0,
			0,
			.5
		],
		8901: [
			-.05555,
			.44445,
			0,
			0,
			.27778
		],
		8902: [
			-.03472,
			.46528,
			0,
			0,
			.5
		],
		8904: [
			.005,
			.505,
			0,
			0,
			.9
		],
		8942: [
			.03,
			.903,
			0,
			0,
			.278
		],
		8943: [
			-.19,
			.313,
			0,
			0,
			1.172
		],
		8945: [
			-.1,
			.823,
			0,
			0,
			1.282
		],
		8968: [
			.25,
			.75,
			0,
			0,
			.44445
		],
		8969: [
			.25,
			.75,
			0,
			0,
			.44445
		],
		8970: [
			.25,
			.75,
			0,
			0,
			.44445
		],
		8971: [
			.25,
			.75,
			0,
			0,
			.44445
		],
		8994: [
			-.14236,
			.35764,
			0,
			0,
			1
		],
		8995: [
			-.14236,
			.35764,
			0,
			0,
			1
		],
		9136: [
			.244,
			.744,
			0,
			0,
			.412
		],
		9137: [
			.244,
			.745,
			0,
			0,
			.412
		],
		9651: [
			.19444,
			.69444,
			0,
			0,
			.88889
		],
		9657: [
			-.03472,
			.46528,
			0,
			0,
			.5
		],
		9661: [
			.19444,
			.69444,
			0,
			0,
			.88889
		],
		9667: [
			-.03472,
			.46528,
			0,
			0,
			.5
		],
		9711: [
			.19444,
			.69444,
			0,
			0,
			1
		],
		9824: [
			.12963,
			.69444,
			0,
			0,
			.77778
		],
		9825: [
			.12963,
			.69444,
			0,
			0,
			.77778
		],
		9826: [
			.12963,
			.69444,
			0,
			0,
			.77778
		],
		9827: [
			.12963,
			.69444,
			0,
			0,
			.77778
		],
		9837: [
			0,
			.75,
			0,
			0,
			.38889
		],
		9838: [
			.19444,
			.69444,
			0,
			0,
			.38889
		],
		9839: [
			.19444,
			.69444,
			0,
			0,
			.38889
		],
		10216: [
			.25,
			.75,
			0,
			0,
			.38889
		],
		10217: [
			.25,
			.75,
			0,
			0,
			.38889
		],
		10222: [
			.244,
			.744,
			0,
			0,
			.412
		],
		10223: [
			.244,
			.745,
			0,
			0,
			.412
		],
		10229: [
			.011,
			.511,
			0,
			0,
			1.609
		],
		10230: [
			.011,
			.511,
			0,
			0,
			1.638
		],
		10231: [
			.011,
			.511,
			0,
			0,
			1.859
		],
		10232: [
			.024,
			.525,
			0,
			0,
			1.609
		],
		10233: [
			.024,
			.525,
			0,
			0,
			1.638
		],
		10234: [
			.024,
			.525,
			0,
			0,
			1.858
		],
		10236: [
			.011,
			.511,
			0,
			0,
			1.638
		],
		10815: [
			0,
			.68333,
			0,
			0,
			.75
		],
		10927: [
			.13597,
			.63597,
			0,
			0,
			.77778
		],
		10928: [
			.13597,
			.63597,
			0,
			0,
			.77778
		],
		57376: [
			.19444,
			.69444,
			0,
			0,
			0
		]
	},
	"Math-BoldItalic": {
		32: [
			0,
			0,
			0,
			0,
			.25
		],
		48: [
			0,
			.44444,
			0,
			0,
			.575
		],
		49: [
			0,
			.44444,
			0,
			0,
			.575
		],
		50: [
			0,
			.44444,
			0,
			0,
			.575
		],
		51: [
			.19444,
			.44444,
			0,
			0,
			.575
		],
		52: [
			.19444,
			.44444,
			0,
			0,
			.575
		],
		53: [
			.19444,
			.44444,
			0,
			0,
			.575
		],
		54: [
			0,
			.64444,
			0,
			0,
			.575
		],
		55: [
			.19444,
			.44444,
			0,
			0,
			.575
		],
		56: [
			0,
			.64444,
			0,
			0,
			.575
		],
		57: [
			.19444,
			.44444,
			0,
			0,
			.575
		],
		65: [
			0,
			.68611,
			0,
			0,
			.86944
		],
		66: [
			0,
			.68611,
			.04835,
			0,
			.8664
		],
		67: [
			0,
			.68611,
			.06979,
			0,
			.81694
		],
		68: [
			0,
			.68611,
			.03194,
			0,
			.93812
		],
		69: [
			0,
			.68611,
			.05451,
			0,
			.81007
		],
		70: [
			0,
			.68611,
			.15972,
			0,
			.68889
		],
		71: [
			0,
			.68611,
			0,
			0,
			.88673
		],
		72: [
			0,
			.68611,
			.08229,
			0,
			.98229
		],
		73: [
			0,
			.68611,
			.07778,
			0,
			.51111
		],
		74: [
			0,
			.68611,
			.10069,
			0,
			.63125
		],
		75: [
			0,
			.68611,
			.06979,
			0,
			.97118
		],
		76: [
			0,
			.68611,
			0,
			0,
			.75555
		],
		77: [
			0,
			.68611,
			.11424,
			0,
			1.14201
		],
		78: [
			0,
			.68611,
			.11424,
			0,
			.95034
		],
		79: [
			0,
			.68611,
			.03194,
			0,
			.83666
		],
		80: [
			0,
			.68611,
			.15972,
			0,
			.72309
		],
		81: [
			.19444,
			.68611,
			0,
			0,
			.86861
		],
		82: [
			0,
			.68611,
			.00421,
			0,
			.87235
		],
		83: [
			0,
			.68611,
			.05382,
			0,
			.69271
		],
		84: [
			0,
			.68611,
			.15972,
			0,
			.63663
		],
		85: [
			0,
			.68611,
			.11424,
			0,
			.80027
		],
		86: [
			0,
			.68611,
			.25555,
			0,
			.67778
		],
		87: [
			0,
			.68611,
			.15972,
			0,
			1.09305
		],
		88: [
			0,
			.68611,
			.07778,
			0,
			.94722
		],
		89: [
			0,
			.68611,
			.25555,
			0,
			.67458
		],
		90: [
			0,
			.68611,
			.06979,
			0,
			.77257
		],
		97: [
			0,
			.44444,
			0,
			0,
			.63287
		],
		98: [
			0,
			.69444,
			0,
			0,
			.52083
		],
		99: [
			0,
			.44444,
			0,
			0,
			.51342
		],
		100: [
			0,
			.69444,
			0,
			0,
			.60972
		],
		101: [
			0,
			.44444,
			0,
			0,
			.55361
		],
		102: [
			.19444,
			.69444,
			.11042,
			0,
			.56806
		],
		103: [
			.19444,
			.44444,
			.03704,
			0,
			.5449
		],
		104: [
			0,
			.69444,
			0,
			0,
			.66759
		],
		105: [
			0,
			.69326,
			0,
			0,
			.4048
		],
		106: [
			.19444,
			.69326,
			.0622,
			0,
			.47083
		],
		107: [
			0,
			.69444,
			.01852,
			0,
			.6037
		],
		108: [
			0,
			.69444,
			.0088,
			0,
			.34815
		],
		109: [
			0,
			.44444,
			0,
			0,
			1.0324
		],
		110: [
			0,
			.44444,
			0,
			0,
			.71296
		],
		111: [
			0,
			.44444,
			0,
			0,
			.58472
		],
		112: [
			.19444,
			.44444,
			0,
			0,
			.60092
		],
		113: [
			.19444,
			.44444,
			.03704,
			0,
			.54213
		],
		114: [
			0,
			.44444,
			.03194,
			0,
			.5287
		],
		115: [
			0,
			.44444,
			0,
			0,
			.53125
		],
		116: [
			0,
			.63492,
			0,
			0,
			.41528
		],
		117: [
			0,
			.44444,
			0,
			0,
			.68102
		],
		118: [
			0,
			.44444,
			.03704,
			0,
			.56666
		],
		119: [
			0,
			.44444,
			.02778,
			0,
			.83148
		],
		120: [
			0,
			.44444,
			0,
			0,
			.65903
		],
		121: [
			.19444,
			.44444,
			.03704,
			0,
			.59028
		],
		122: [
			0,
			.44444,
			.04213,
			0,
			.55509
		],
		160: [
			0,
			0,
			0,
			0,
			.25
		],
		915: [
			0,
			.68611,
			.15972,
			0,
			.65694
		],
		916: [
			0,
			.68611,
			0,
			0,
			.95833
		],
		920: [
			0,
			.68611,
			.03194,
			0,
			.86722
		],
		923: [
			0,
			.68611,
			0,
			0,
			.80555
		],
		926: [
			0,
			.68611,
			.07458,
			0,
			.84125
		],
		928: [
			0,
			.68611,
			.08229,
			0,
			.98229
		],
		931: [
			0,
			.68611,
			.05451,
			0,
			.88507
		],
		933: [
			0,
			.68611,
			.15972,
			0,
			.67083
		],
		934: [
			0,
			.68611,
			0,
			0,
			.76666
		],
		936: [
			0,
			.68611,
			.11653,
			0,
			.71402
		],
		937: [
			0,
			.68611,
			.04835,
			0,
			.8789
		],
		945: [
			0,
			.44444,
			0,
			0,
			.76064
		],
		946: [
			.19444,
			.69444,
			.03403,
			0,
			.65972
		],
		947: [
			.19444,
			.44444,
			.06389,
			0,
			.59003
		],
		948: [
			0,
			.69444,
			.03819,
			0,
			.52222
		],
		949: [
			0,
			.44444,
			0,
			0,
			.52882
		],
		950: [
			.19444,
			.69444,
			.06215,
			0,
			.50833
		],
		951: [
			.19444,
			.44444,
			.03704,
			0,
			.6
		],
		952: [
			0,
			.69444,
			.03194,
			0,
			.5618
		],
		953: [
			0,
			.44444,
			0,
			0,
			.41204
		],
		954: [
			0,
			.44444,
			0,
			0,
			.66759
		],
		955: [
			0,
			.69444,
			0,
			0,
			.67083
		],
		956: [
			.19444,
			.44444,
			0,
			0,
			.70787
		],
		957: [
			0,
			.44444,
			.06898,
			0,
			.57685
		],
		958: [
			.19444,
			.69444,
			.03021,
			0,
			.50833
		],
		959: [
			0,
			.44444,
			0,
			0,
			.58472
		],
		960: [
			0,
			.44444,
			.03704,
			0,
			.68241
		],
		961: [
			.19444,
			.44444,
			0,
			0,
			.6118
		],
		962: [
			.09722,
			.44444,
			.07917,
			0,
			.42361
		],
		963: [
			0,
			.44444,
			.03704,
			0,
			.68588
		],
		964: [
			0,
			.44444,
			.13472,
			0,
			.52083
		],
		965: [
			0,
			.44444,
			.03704,
			0,
			.63055
		],
		966: [
			.19444,
			.44444,
			0,
			0,
			.74722
		],
		967: [
			.19444,
			.44444,
			0,
			0,
			.71805
		],
		968: [
			.19444,
			.69444,
			.03704,
			0,
			.75833
		],
		969: [
			0,
			.44444,
			.03704,
			0,
			.71782
		],
		977: [
			0,
			.69444,
			0,
			0,
			.69155
		],
		981: [
			.19444,
			.69444,
			0,
			0,
			.7125
		],
		982: [
			0,
			.44444,
			.03194,
			0,
			.975
		],
		1009: [
			.19444,
			.44444,
			0,
			0,
			.6118
		],
		1013: [
			0,
			.44444,
			0,
			0,
			.48333
		],
		57649: [
			0,
			.44444,
			0,
			0,
			.39352
		],
		57911: [
			.19444,
			.44444,
			0,
			0,
			.43889
		]
	},
	"Math-Italic": {
		32: [
			0,
			0,
			0,
			0,
			.25
		],
		48: [
			0,
			.43056,
			0,
			0,
			.5
		],
		49: [
			0,
			.43056,
			0,
			0,
			.5
		],
		50: [
			0,
			.43056,
			0,
			0,
			.5
		],
		51: [
			.19444,
			.43056,
			0,
			0,
			.5
		],
		52: [
			.19444,
			.43056,
			0,
			0,
			.5
		],
		53: [
			.19444,
			.43056,
			0,
			0,
			.5
		],
		54: [
			0,
			.64444,
			0,
			0,
			.5
		],
		55: [
			.19444,
			.43056,
			0,
			0,
			.5
		],
		56: [
			0,
			.64444,
			0,
			0,
			.5
		],
		57: [
			.19444,
			.43056,
			0,
			0,
			.5
		],
		65: [
			0,
			.68333,
			0,
			.13889,
			.75
		],
		66: [
			0,
			.68333,
			.05017,
			.08334,
			.75851
		],
		67: [
			0,
			.68333,
			.07153,
			.08334,
			.71472
		],
		68: [
			0,
			.68333,
			.02778,
			.05556,
			.82792
		],
		69: [
			0,
			.68333,
			.05764,
			.08334,
			.7382
		],
		70: [
			0,
			.68333,
			.13889,
			.08334,
			.64306
		],
		71: [
			0,
			.68333,
			0,
			.08334,
			.78625
		],
		72: [
			0,
			.68333,
			.08125,
			.05556,
			.83125
		],
		73: [
			0,
			.68333,
			.07847,
			.11111,
			.43958
		],
		74: [
			0,
			.68333,
			.09618,
			.16667,
			.55451
		],
		75: [
			0,
			.68333,
			.07153,
			.05556,
			.84931
		],
		76: [
			0,
			.68333,
			0,
			.02778,
			.68056
		],
		77: [
			0,
			.68333,
			.10903,
			.08334,
			.97014
		],
		78: [
			0,
			.68333,
			.10903,
			.08334,
			.80347
		],
		79: [
			0,
			.68333,
			.02778,
			.08334,
			.76278
		],
		80: [
			0,
			.68333,
			.13889,
			.08334,
			.64201
		],
		81: [
			.19444,
			.68333,
			0,
			.08334,
			.79056
		],
		82: [
			0,
			.68333,
			.00773,
			.08334,
			.75929
		],
		83: [
			0,
			.68333,
			.05764,
			.08334,
			.6132
		],
		84: [
			0,
			.68333,
			.13889,
			.08334,
			.58438
		],
		85: [
			0,
			.68333,
			.10903,
			.02778,
			.68278
		],
		86: [
			0,
			.68333,
			.22222,
			0,
			.58333
		],
		87: [
			0,
			.68333,
			.13889,
			0,
			.94445
		],
		88: [
			0,
			.68333,
			.07847,
			.08334,
			.82847
		],
		89: [
			0,
			.68333,
			.22222,
			0,
			.58056
		],
		90: [
			0,
			.68333,
			.07153,
			.08334,
			.68264
		],
		97: [
			0,
			.43056,
			0,
			0,
			.52859
		],
		98: [
			0,
			.69444,
			0,
			0,
			.42917
		],
		99: [
			0,
			.43056,
			0,
			.05556,
			.43276
		],
		100: [
			0,
			.69444,
			0,
			.16667,
			.52049
		],
		101: [
			0,
			.43056,
			0,
			.05556,
			.46563
		],
		102: [
			.19444,
			.69444,
			.10764,
			.16667,
			.48959
		],
		103: [
			.19444,
			.43056,
			.03588,
			.02778,
			.47697
		],
		104: [
			0,
			.69444,
			0,
			0,
			.57616
		],
		105: [
			0,
			.65952,
			0,
			0,
			.34451
		],
		106: [
			.19444,
			.65952,
			.05724,
			0,
			.41181
		],
		107: [
			0,
			.69444,
			.03148,
			0,
			.5206
		],
		108: [
			0,
			.69444,
			.01968,
			.08334,
			.29838
		],
		109: [
			0,
			.43056,
			0,
			0,
			.87801
		],
		110: [
			0,
			.43056,
			0,
			0,
			.60023
		],
		111: [
			0,
			.43056,
			0,
			.05556,
			.48472
		],
		112: [
			.19444,
			.43056,
			0,
			.08334,
			.50313
		],
		113: [
			.19444,
			.43056,
			.03588,
			.08334,
			.44641
		],
		114: [
			0,
			.43056,
			.02778,
			.05556,
			.45116
		],
		115: [
			0,
			.43056,
			0,
			.05556,
			.46875
		],
		116: [
			0,
			.61508,
			0,
			.08334,
			.36111
		],
		117: [
			0,
			.43056,
			0,
			.02778,
			.57246
		],
		118: [
			0,
			.43056,
			.03588,
			.02778,
			.48472
		],
		119: [
			0,
			.43056,
			.02691,
			.08334,
			.71592
		],
		120: [
			0,
			.43056,
			0,
			.02778,
			.57153
		],
		121: [
			.19444,
			.43056,
			.03588,
			.05556,
			.49028
		],
		122: [
			0,
			.43056,
			.04398,
			.05556,
			.46505
		],
		160: [
			0,
			0,
			0,
			0,
			.25
		],
		915: [
			0,
			.68333,
			.13889,
			.08334,
			.61528
		],
		916: [
			0,
			.68333,
			0,
			.16667,
			.83334
		],
		920: [
			0,
			.68333,
			.02778,
			.08334,
			.76278
		],
		923: [
			0,
			.68333,
			0,
			.16667,
			.69445
		],
		926: [
			0,
			.68333,
			.07569,
			.08334,
			.74236
		],
		928: [
			0,
			.68333,
			.08125,
			.05556,
			.83125
		],
		931: [
			0,
			.68333,
			.05764,
			.08334,
			.77986
		],
		933: [
			0,
			.68333,
			.13889,
			.05556,
			.58333
		],
		934: [
			0,
			.68333,
			0,
			.08334,
			.66667
		],
		936: [
			0,
			.68333,
			.11,
			.05556,
			.61222
		],
		937: [
			0,
			.68333,
			.05017,
			.08334,
			.7724
		],
		945: [
			0,
			.43056,
			.0037,
			.02778,
			.6397
		],
		946: [
			.19444,
			.69444,
			.05278,
			.08334,
			.56563
		],
		947: [
			.19444,
			.43056,
			.05556,
			0,
			.51773
		],
		948: [
			0,
			.69444,
			.03785,
			.05556,
			.44444
		],
		949: [
			0,
			.43056,
			0,
			.08334,
			.46632
		],
		950: [
			.19444,
			.69444,
			.07378,
			.08334,
			.4375
		],
		951: [
			.19444,
			.43056,
			.03588,
			.05556,
			.49653
		],
		952: [
			0,
			.69444,
			.02778,
			.08334,
			.46944
		],
		953: [
			0,
			.43056,
			0,
			.05556,
			.35394
		],
		954: [
			0,
			.43056,
			0,
			0,
			.57616
		],
		955: [
			0,
			.69444,
			0,
			0,
			.58334
		],
		956: [
			.19444,
			.43056,
			0,
			.02778,
			.60255
		],
		957: [
			0,
			.43056,
			.06366,
			.02778,
			.49398
		],
		958: [
			.19444,
			.69444,
			.04601,
			.11111,
			.4375
		],
		959: [
			0,
			.43056,
			0,
			.05556,
			.48472
		],
		960: [
			0,
			.43056,
			.03588,
			0,
			.57003
		],
		961: [
			.19444,
			.43056,
			0,
			.08334,
			.51702
		],
		962: [
			.09722,
			.43056,
			.07986,
			.08334,
			.36285
		],
		963: [
			0,
			.43056,
			.03588,
			0,
			.57141
		],
		964: [
			0,
			.43056,
			.1132,
			.02778,
			.43715
		],
		965: [
			0,
			.43056,
			.03588,
			.02778,
			.54028
		],
		966: [
			.19444,
			.43056,
			0,
			.08334,
			.65417
		],
		967: [
			.19444,
			.43056,
			0,
			.05556,
			.62569
		],
		968: [
			.19444,
			.69444,
			.03588,
			.11111,
			.65139
		],
		969: [
			0,
			.43056,
			.03588,
			0,
			.62245
		],
		977: [
			0,
			.69444,
			0,
			.08334,
			.59144
		],
		981: [
			.19444,
			.69444,
			0,
			.08334,
			.59583
		],
		982: [
			0,
			.43056,
			.02778,
			0,
			.82813
		],
		1009: [
			.19444,
			.43056,
			0,
			.08334,
			.51702
		],
		1013: [
			0,
			.43056,
			0,
			.05556,
			.4059
		],
		57649: [
			0,
			.43056,
			0,
			.02778,
			.32246
		],
		57911: [
			.19444,
			.43056,
			0,
			.08334,
			.38403
		]
	},
	"SansSerif-Bold": {
		32: [
			0,
			0,
			0,
			0,
			.25
		],
		33: [
			0,
			.69444,
			0,
			0,
			.36667
		],
		34: [
			0,
			.69444,
			0,
			0,
			.55834
		],
		35: [
			.19444,
			.69444,
			0,
			0,
			.91667
		],
		36: [
			.05556,
			.75,
			0,
			0,
			.55
		],
		37: [
			.05556,
			.75,
			0,
			0,
			1.02912
		],
		38: [
			0,
			.69444,
			0,
			0,
			.83056
		],
		39: [
			0,
			.69444,
			0,
			0,
			.30556
		],
		40: [
			.25,
			.75,
			0,
			0,
			.42778
		],
		41: [
			.25,
			.75,
			0,
			0,
			.42778
		],
		42: [
			0,
			.75,
			0,
			0,
			.55
		],
		43: [
			.11667,
			.61667,
			0,
			0,
			.85556
		],
		44: [
			.10556,
			.13056,
			0,
			0,
			.30556
		],
		45: [
			0,
			.45833,
			0,
			0,
			.36667
		],
		46: [
			0,
			.13056,
			0,
			0,
			.30556
		],
		47: [
			.25,
			.75,
			0,
			0,
			.55
		],
		48: [
			0,
			.69444,
			0,
			0,
			.55
		],
		49: [
			0,
			.69444,
			0,
			0,
			.55
		],
		50: [
			0,
			.69444,
			0,
			0,
			.55
		],
		51: [
			0,
			.69444,
			0,
			0,
			.55
		],
		52: [
			0,
			.69444,
			0,
			0,
			.55
		],
		53: [
			0,
			.69444,
			0,
			0,
			.55
		],
		54: [
			0,
			.69444,
			0,
			0,
			.55
		],
		55: [
			0,
			.69444,
			0,
			0,
			.55
		],
		56: [
			0,
			.69444,
			0,
			0,
			.55
		],
		57: [
			0,
			.69444,
			0,
			0,
			.55
		],
		58: [
			0,
			.45833,
			0,
			0,
			.30556
		],
		59: [
			.10556,
			.45833,
			0,
			0,
			.30556
		],
		61: [
			-.09375,
			.40625,
			0,
			0,
			.85556
		],
		63: [
			0,
			.69444,
			0,
			0,
			.51945
		],
		64: [
			0,
			.69444,
			0,
			0,
			.73334
		],
		65: [
			0,
			.69444,
			0,
			0,
			.73334
		],
		66: [
			0,
			.69444,
			0,
			0,
			.73334
		],
		67: [
			0,
			.69444,
			0,
			0,
			.70278
		],
		68: [
			0,
			.69444,
			0,
			0,
			.79445
		],
		69: [
			0,
			.69444,
			0,
			0,
			.64167
		],
		70: [
			0,
			.69444,
			0,
			0,
			.61111
		],
		71: [
			0,
			.69444,
			0,
			0,
			.73334
		],
		72: [
			0,
			.69444,
			0,
			0,
			.79445
		],
		73: [
			0,
			.69444,
			0,
			0,
			.33056
		],
		74: [
			0,
			.69444,
			0,
			0,
			.51945
		],
		75: [
			0,
			.69444,
			0,
			0,
			.76389
		],
		76: [
			0,
			.69444,
			0,
			0,
			.58056
		],
		77: [
			0,
			.69444,
			0,
			0,
			.97778
		],
		78: [
			0,
			.69444,
			0,
			0,
			.79445
		],
		79: [
			0,
			.69444,
			0,
			0,
			.79445
		],
		80: [
			0,
			.69444,
			0,
			0,
			.70278
		],
		81: [
			.10556,
			.69444,
			0,
			0,
			.79445
		],
		82: [
			0,
			.69444,
			0,
			0,
			.70278
		],
		83: [
			0,
			.69444,
			0,
			0,
			.61111
		],
		84: [
			0,
			.69444,
			0,
			0,
			.73334
		],
		85: [
			0,
			.69444,
			0,
			0,
			.76389
		],
		86: [
			0,
			.69444,
			.01528,
			0,
			.73334
		],
		87: [
			0,
			.69444,
			.01528,
			0,
			1.03889
		],
		88: [
			0,
			.69444,
			0,
			0,
			.73334
		],
		89: [
			0,
			.69444,
			.0275,
			0,
			.73334
		],
		90: [
			0,
			.69444,
			0,
			0,
			.67223
		],
		91: [
			.25,
			.75,
			0,
			0,
			.34306
		],
		93: [
			.25,
			.75,
			0,
			0,
			.34306
		],
		94: [
			0,
			.69444,
			0,
			0,
			.55
		],
		95: [
			.35,
			.10833,
			.03056,
			0,
			.55
		],
		97: [
			0,
			.45833,
			0,
			0,
			.525
		],
		98: [
			0,
			.69444,
			0,
			0,
			.56111
		],
		99: [
			0,
			.45833,
			0,
			0,
			.48889
		],
		100: [
			0,
			.69444,
			0,
			0,
			.56111
		],
		101: [
			0,
			.45833,
			0,
			0,
			.51111
		],
		102: [
			0,
			.69444,
			.07639,
			0,
			.33611
		],
		103: [
			.19444,
			.45833,
			.01528,
			0,
			.55
		],
		104: [
			0,
			.69444,
			0,
			0,
			.56111
		],
		105: [
			0,
			.69444,
			0,
			0,
			.25556
		],
		106: [
			.19444,
			.69444,
			0,
			0,
			.28611
		],
		107: [
			0,
			.69444,
			0,
			0,
			.53056
		],
		108: [
			0,
			.69444,
			0,
			0,
			.25556
		],
		109: [
			0,
			.45833,
			0,
			0,
			.86667
		],
		110: [
			0,
			.45833,
			0,
			0,
			.56111
		],
		111: [
			0,
			.45833,
			0,
			0,
			.55
		],
		112: [
			.19444,
			.45833,
			0,
			0,
			.56111
		],
		113: [
			.19444,
			.45833,
			0,
			0,
			.56111
		],
		114: [
			0,
			.45833,
			.01528,
			0,
			.37222
		],
		115: [
			0,
			.45833,
			0,
			0,
			.42167
		],
		116: [
			0,
			.58929,
			0,
			0,
			.40417
		],
		117: [
			0,
			.45833,
			0,
			0,
			.56111
		],
		118: [
			0,
			.45833,
			.01528,
			0,
			.5
		],
		119: [
			0,
			.45833,
			.01528,
			0,
			.74445
		],
		120: [
			0,
			.45833,
			0,
			0,
			.5
		],
		121: [
			.19444,
			.45833,
			.01528,
			0,
			.5
		],
		122: [
			0,
			.45833,
			0,
			0,
			.47639
		],
		126: [
			.35,
			.34444,
			0,
			0,
			.55
		],
		160: [
			0,
			0,
			0,
			0,
			.25
		],
		168: [
			0,
			.69444,
			0,
			0,
			.55
		],
		176: [
			0,
			.69444,
			0,
			0,
			.73334
		],
		180: [
			0,
			.69444,
			0,
			0,
			.55
		],
		184: [
			.17014,
			0,
			0,
			0,
			.48889
		],
		305: [
			0,
			.45833,
			0,
			0,
			.25556
		],
		567: [
			.19444,
			.45833,
			0,
			0,
			.28611
		],
		710: [
			0,
			.69444,
			0,
			0,
			.55
		],
		711: [
			0,
			.63542,
			0,
			0,
			.55
		],
		713: [
			0,
			.63778,
			0,
			0,
			.55
		],
		728: [
			0,
			.69444,
			0,
			0,
			.55
		],
		729: [
			0,
			.69444,
			0,
			0,
			.30556
		],
		730: [
			0,
			.69444,
			0,
			0,
			.73334
		],
		732: [
			0,
			.69444,
			0,
			0,
			.55
		],
		733: [
			0,
			.69444,
			0,
			0,
			.55
		],
		915: [
			0,
			.69444,
			0,
			0,
			.58056
		],
		916: [
			0,
			.69444,
			0,
			0,
			.91667
		],
		920: [
			0,
			.69444,
			0,
			0,
			.85556
		],
		923: [
			0,
			.69444,
			0,
			0,
			.67223
		],
		926: [
			0,
			.69444,
			0,
			0,
			.73334
		],
		928: [
			0,
			.69444,
			0,
			0,
			.79445
		],
		931: [
			0,
			.69444,
			0,
			0,
			.79445
		],
		933: [
			0,
			.69444,
			0,
			0,
			.85556
		],
		934: [
			0,
			.69444,
			0,
			0,
			.79445
		],
		936: [
			0,
			.69444,
			0,
			0,
			.85556
		],
		937: [
			0,
			.69444,
			0,
			0,
			.79445
		],
		8211: [
			0,
			.45833,
			.03056,
			0,
			.55
		],
		8212: [
			0,
			.45833,
			.03056,
			0,
			1.10001
		],
		8216: [
			0,
			.69444,
			0,
			0,
			.30556
		],
		8217: [
			0,
			.69444,
			0,
			0,
			.30556
		],
		8220: [
			0,
			.69444,
			0,
			0,
			.55834
		],
		8221: [
			0,
			.69444,
			0,
			0,
			.55834
		]
	},
	"SansSerif-Italic": {
		32: [
			0,
			0,
			0,
			0,
			.25
		],
		33: [
			0,
			.69444,
			.05733,
			0,
			.31945
		],
		34: [
			0,
			.69444,
			.00316,
			0,
			.5
		],
		35: [
			.19444,
			.69444,
			.05087,
			0,
			.83334
		],
		36: [
			.05556,
			.75,
			.11156,
			0,
			.5
		],
		37: [
			.05556,
			.75,
			.03126,
			0,
			.83334
		],
		38: [
			0,
			.69444,
			.03058,
			0,
			.75834
		],
		39: [
			0,
			.69444,
			.07816,
			0,
			.27778
		],
		40: [
			.25,
			.75,
			.13164,
			0,
			.38889
		],
		41: [
			.25,
			.75,
			.02536,
			0,
			.38889
		],
		42: [
			0,
			.75,
			.11775,
			0,
			.5
		],
		43: [
			.08333,
			.58333,
			.02536,
			0,
			.77778
		],
		44: [
			.125,
			.08333,
			0,
			0,
			.27778
		],
		45: [
			0,
			.44444,
			.01946,
			0,
			.33333
		],
		46: [
			0,
			.08333,
			0,
			0,
			.27778
		],
		47: [
			.25,
			.75,
			.13164,
			0,
			.5
		],
		48: [
			0,
			.65556,
			.11156,
			0,
			.5
		],
		49: [
			0,
			.65556,
			.11156,
			0,
			.5
		],
		50: [
			0,
			.65556,
			.11156,
			0,
			.5
		],
		51: [
			0,
			.65556,
			.11156,
			0,
			.5
		],
		52: [
			0,
			.65556,
			.11156,
			0,
			.5
		],
		53: [
			0,
			.65556,
			.11156,
			0,
			.5
		],
		54: [
			0,
			.65556,
			.11156,
			0,
			.5
		],
		55: [
			0,
			.65556,
			.11156,
			0,
			.5
		],
		56: [
			0,
			.65556,
			.11156,
			0,
			.5
		],
		57: [
			0,
			.65556,
			.11156,
			0,
			.5
		],
		58: [
			0,
			.44444,
			.02502,
			0,
			.27778
		],
		59: [
			.125,
			.44444,
			.02502,
			0,
			.27778
		],
		61: [
			-.13,
			.37,
			.05087,
			0,
			.77778
		],
		63: [
			0,
			.69444,
			.11809,
			0,
			.47222
		],
		64: [
			0,
			.69444,
			.07555,
			0,
			.66667
		],
		65: [
			0,
			.69444,
			0,
			0,
			.66667
		],
		66: [
			0,
			.69444,
			.08293,
			0,
			.66667
		],
		67: [
			0,
			.69444,
			.11983,
			0,
			.63889
		],
		68: [
			0,
			.69444,
			.07555,
			0,
			.72223
		],
		69: [
			0,
			.69444,
			.11983,
			0,
			.59722
		],
		70: [
			0,
			.69444,
			.13372,
			0,
			.56945
		],
		71: [
			0,
			.69444,
			.11983,
			0,
			.66667
		],
		72: [
			0,
			.69444,
			.08094,
			0,
			.70834
		],
		73: [
			0,
			.69444,
			.13372,
			0,
			.27778
		],
		74: [
			0,
			.69444,
			.08094,
			0,
			.47222
		],
		75: [
			0,
			.69444,
			.11983,
			0,
			.69445
		],
		76: [
			0,
			.69444,
			0,
			0,
			.54167
		],
		77: [
			0,
			.69444,
			.08094,
			0,
			.875
		],
		78: [
			0,
			.69444,
			.08094,
			0,
			.70834
		],
		79: [
			0,
			.69444,
			.07555,
			0,
			.73611
		],
		80: [
			0,
			.69444,
			.08293,
			0,
			.63889
		],
		81: [
			.125,
			.69444,
			.07555,
			0,
			.73611
		],
		82: [
			0,
			.69444,
			.08293,
			0,
			.64584
		],
		83: [
			0,
			.69444,
			.09205,
			0,
			.55556
		],
		84: [
			0,
			.69444,
			.13372,
			0,
			.68056
		],
		85: [
			0,
			.69444,
			.08094,
			0,
			.6875
		],
		86: [
			0,
			.69444,
			.1615,
			0,
			.66667
		],
		87: [
			0,
			.69444,
			.1615,
			0,
			.94445
		],
		88: [
			0,
			.69444,
			.13372,
			0,
			.66667
		],
		89: [
			0,
			.69444,
			.17261,
			0,
			.66667
		],
		90: [
			0,
			.69444,
			.11983,
			0,
			.61111
		],
		91: [
			.25,
			.75,
			.15942,
			0,
			.28889
		],
		93: [
			.25,
			.75,
			.08719,
			0,
			.28889
		],
		94: [
			0,
			.69444,
			.0799,
			0,
			.5
		],
		95: [
			.35,
			.09444,
			.08616,
			0,
			.5
		],
		97: [
			0,
			.44444,
			.00981,
			0,
			.48056
		],
		98: [
			0,
			.69444,
			.03057,
			0,
			.51667
		],
		99: [
			0,
			.44444,
			.08336,
			0,
			.44445
		],
		100: [
			0,
			.69444,
			.09483,
			0,
			.51667
		],
		101: [
			0,
			.44444,
			.06778,
			0,
			.44445
		],
		102: [
			0,
			.69444,
			.21705,
			0,
			.30556
		],
		103: [
			.19444,
			.44444,
			.10836,
			0,
			.5
		],
		104: [
			0,
			.69444,
			.01778,
			0,
			.51667
		],
		105: [
			0,
			.67937,
			.09718,
			0,
			.23889
		],
		106: [
			.19444,
			.67937,
			.09162,
			0,
			.26667
		],
		107: [
			0,
			.69444,
			.08336,
			0,
			.48889
		],
		108: [
			0,
			.69444,
			.09483,
			0,
			.23889
		],
		109: [
			0,
			.44444,
			.01778,
			0,
			.79445
		],
		110: [
			0,
			.44444,
			.01778,
			0,
			.51667
		],
		111: [
			0,
			.44444,
			.06613,
			0,
			.5
		],
		112: [
			.19444,
			.44444,
			.0389,
			0,
			.51667
		],
		113: [
			.19444,
			.44444,
			.04169,
			0,
			.51667
		],
		114: [
			0,
			.44444,
			.10836,
			0,
			.34167
		],
		115: [
			0,
			.44444,
			.0778,
			0,
			.38333
		],
		116: [
			0,
			.57143,
			.07225,
			0,
			.36111
		],
		117: [
			0,
			.44444,
			.04169,
			0,
			.51667
		],
		118: [
			0,
			.44444,
			.10836,
			0,
			.46111
		],
		119: [
			0,
			.44444,
			.10836,
			0,
			.68334
		],
		120: [
			0,
			.44444,
			.09169,
			0,
			.46111
		],
		121: [
			.19444,
			.44444,
			.10836,
			0,
			.46111
		],
		122: [
			0,
			.44444,
			.08752,
			0,
			.43472
		],
		126: [
			.35,
			.32659,
			.08826,
			0,
			.5
		],
		160: [
			0,
			0,
			0,
			0,
			.25
		],
		168: [
			0,
			.67937,
			.06385,
			0,
			.5
		],
		176: [
			0,
			.69444,
			0,
			0,
			.73752
		],
		184: [
			.17014,
			0,
			0,
			0,
			.44445
		],
		305: [
			0,
			.44444,
			.04169,
			0,
			.23889
		],
		567: [
			.19444,
			.44444,
			.04169,
			0,
			.26667
		],
		710: [
			0,
			.69444,
			.0799,
			0,
			.5
		],
		711: [
			0,
			.63194,
			.08432,
			0,
			.5
		],
		713: [
			0,
			.60889,
			.08776,
			0,
			.5
		],
		714: [
			0,
			.69444,
			.09205,
			0,
			.5
		],
		715: [
			0,
			.69444,
			0,
			0,
			.5
		],
		728: [
			0,
			.69444,
			.09483,
			0,
			.5
		],
		729: [
			0,
			.67937,
			.07774,
			0,
			.27778
		],
		730: [
			0,
			.69444,
			0,
			0,
			.73752
		],
		732: [
			0,
			.67659,
			.08826,
			0,
			.5
		],
		733: [
			0,
			.69444,
			.09205,
			0,
			.5
		],
		915: [
			0,
			.69444,
			.13372,
			0,
			.54167
		],
		916: [
			0,
			.69444,
			0,
			0,
			.83334
		],
		920: [
			0,
			.69444,
			.07555,
			0,
			.77778
		],
		923: [
			0,
			.69444,
			0,
			0,
			.61111
		],
		926: [
			0,
			.69444,
			.12816,
			0,
			.66667
		],
		928: [
			0,
			.69444,
			.08094,
			0,
			.70834
		],
		931: [
			0,
			.69444,
			.11983,
			0,
			.72222
		],
		933: [
			0,
			.69444,
			.09031,
			0,
			.77778
		],
		934: [
			0,
			.69444,
			.04603,
			0,
			.72222
		],
		936: [
			0,
			.69444,
			.09031,
			0,
			.77778
		],
		937: [
			0,
			.69444,
			.08293,
			0,
			.72222
		],
		8211: [
			0,
			.44444,
			.08616,
			0,
			.5
		],
		8212: [
			0,
			.44444,
			.08616,
			0,
			1
		],
		8216: [
			0,
			.69444,
			.07816,
			0,
			.27778
		],
		8217: [
			0,
			.69444,
			.07816,
			0,
			.27778
		],
		8220: [
			0,
			.69444,
			.14205,
			0,
			.5
		],
		8221: [
			0,
			.69444,
			.00316,
			0,
			.5
		]
	},
	"SansSerif-Regular": {
		32: [
			0,
			0,
			0,
			0,
			.25
		],
		33: [
			0,
			.69444,
			0,
			0,
			.31945
		],
		34: [
			0,
			.69444,
			0,
			0,
			.5
		],
		35: [
			.19444,
			.69444,
			0,
			0,
			.83334
		],
		36: [
			.05556,
			.75,
			0,
			0,
			.5
		],
		37: [
			.05556,
			.75,
			0,
			0,
			.83334
		],
		38: [
			0,
			.69444,
			0,
			0,
			.75834
		],
		39: [
			0,
			.69444,
			0,
			0,
			.27778
		],
		40: [
			.25,
			.75,
			0,
			0,
			.38889
		],
		41: [
			.25,
			.75,
			0,
			0,
			.38889
		],
		42: [
			0,
			.75,
			0,
			0,
			.5
		],
		43: [
			.08333,
			.58333,
			0,
			0,
			.77778
		],
		44: [
			.125,
			.08333,
			0,
			0,
			.27778
		],
		45: [
			0,
			.44444,
			0,
			0,
			.33333
		],
		46: [
			0,
			.08333,
			0,
			0,
			.27778
		],
		47: [
			.25,
			.75,
			0,
			0,
			.5
		],
		48: [
			0,
			.65556,
			0,
			0,
			.5
		],
		49: [
			0,
			.65556,
			0,
			0,
			.5
		],
		50: [
			0,
			.65556,
			0,
			0,
			.5
		],
		51: [
			0,
			.65556,
			0,
			0,
			.5
		],
		52: [
			0,
			.65556,
			0,
			0,
			.5
		],
		53: [
			0,
			.65556,
			0,
			0,
			.5
		],
		54: [
			0,
			.65556,
			0,
			0,
			.5
		],
		55: [
			0,
			.65556,
			0,
			0,
			.5
		],
		56: [
			0,
			.65556,
			0,
			0,
			.5
		],
		57: [
			0,
			.65556,
			0,
			0,
			.5
		],
		58: [
			0,
			.44444,
			0,
			0,
			.27778
		],
		59: [
			.125,
			.44444,
			0,
			0,
			.27778
		],
		61: [
			-.13,
			.37,
			0,
			0,
			.77778
		],
		63: [
			0,
			.69444,
			0,
			0,
			.47222
		],
		64: [
			0,
			.69444,
			0,
			0,
			.66667
		],
		65: [
			0,
			.69444,
			0,
			0,
			.66667
		],
		66: [
			0,
			.69444,
			0,
			0,
			.66667
		],
		67: [
			0,
			.69444,
			0,
			0,
			.63889
		],
		68: [
			0,
			.69444,
			0,
			0,
			.72223
		],
		69: [
			0,
			.69444,
			0,
			0,
			.59722
		],
		70: [
			0,
			.69444,
			0,
			0,
			.56945
		],
		71: [
			0,
			.69444,
			0,
			0,
			.66667
		],
		72: [
			0,
			.69444,
			0,
			0,
			.70834
		],
		73: [
			0,
			.69444,
			0,
			0,
			.27778
		],
		74: [
			0,
			.69444,
			0,
			0,
			.47222
		],
		75: [
			0,
			.69444,
			0,
			0,
			.69445
		],
		76: [
			0,
			.69444,
			0,
			0,
			.54167
		],
		77: [
			0,
			.69444,
			0,
			0,
			.875
		],
		78: [
			0,
			.69444,
			0,
			0,
			.70834
		],
		79: [
			0,
			.69444,
			0,
			0,
			.73611
		],
		80: [
			0,
			.69444,
			0,
			0,
			.63889
		],
		81: [
			.125,
			.69444,
			0,
			0,
			.73611
		],
		82: [
			0,
			.69444,
			0,
			0,
			.64584
		],
		83: [
			0,
			.69444,
			0,
			0,
			.55556
		],
		84: [
			0,
			.69444,
			0,
			0,
			.68056
		],
		85: [
			0,
			.69444,
			0,
			0,
			.6875
		],
		86: [
			0,
			.69444,
			.01389,
			0,
			.66667
		],
		87: [
			0,
			.69444,
			.01389,
			0,
			.94445
		],
		88: [
			0,
			.69444,
			0,
			0,
			.66667
		],
		89: [
			0,
			.69444,
			.025,
			0,
			.66667
		],
		90: [
			0,
			.69444,
			0,
			0,
			.61111
		],
		91: [
			.25,
			.75,
			0,
			0,
			.28889
		],
		93: [
			.25,
			.75,
			0,
			0,
			.28889
		],
		94: [
			0,
			.69444,
			0,
			0,
			.5
		],
		95: [
			.35,
			.09444,
			.02778,
			0,
			.5
		],
		97: [
			0,
			.44444,
			0,
			0,
			.48056
		],
		98: [
			0,
			.69444,
			0,
			0,
			.51667
		],
		99: [
			0,
			.44444,
			0,
			0,
			.44445
		],
		100: [
			0,
			.69444,
			0,
			0,
			.51667
		],
		101: [
			0,
			.44444,
			0,
			0,
			.44445
		],
		102: [
			0,
			.69444,
			.06944,
			0,
			.30556
		],
		103: [
			.19444,
			.44444,
			.01389,
			0,
			.5
		],
		104: [
			0,
			.69444,
			0,
			0,
			.51667
		],
		105: [
			0,
			.67937,
			0,
			0,
			.23889
		],
		106: [
			.19444,
			.67937,
			0,
			0,
			.26667
		],
		107: [
			0,
			.69444,
			0,
			0,
			.48889
		],
		108: [
			0,
			.69444,
			0,
			0,
			.23889
		],
		109: [
			0,
			.44444,
			0,
			0,
			.79445
		],
		110: [
			0,
			.44444,
			0,
			0,
			.51667
		],
		111: [
			0,
			.44444,
			0,
			0,
			.5
		],
		112: [
			.19444,
			.44444,
			0,
			0,
			.51667
		],
		113: [
			.19444,
			.44444,
			0,
			0,
			.51667
		],
		114: [
			0,
			.44444,
			.01389,
			0,
			.34167
		],
		115: [
			0,
			.44444,
			0,
			0,
			.38333
		],
		116: [
			0,
			.57143,
			0,
			0,
			.36111
		],
		117: [
			0,
			.44444,
			0,
			0,
			.51667
		],
		118: [
			0,
			.44444,
			.01389,
			0,
			.46111
		],
		119: [
			0,
			.44444,
			.01389,
			0,
			.68334
		],
		120: [
			0,
			.44444,
			0,
			0,
			.46111
		],
		121: [
			.19444,
			.44444,
			.01389,
			0,
			.46111
		],
		122: [
			0,
			.44444,
			0,
			0,
			.43472
		],
		126: [
			.35,
			.32659,
			0,
			0,
			.5
		],
		160: [
			0,
			0,
			0,
			0,
			.25
		],
		168: [
			0,
			.67937,
			0,
			0,
			.5
		],
		176: [
			0,
			.69444,
			0,
			0,
			.66667
		],
		184: [
			.17014,
			0,
			0,
			0,
			.44445
		],
		305: [
			0,
			.44444,
			0,
			0,
			.23889
		],
		567: [
			.19444,
			.44444,
			0,
			0,
			.26667
		],
		710: [
			0,
			.69444,
			0,
			0,
			.5
		],
		711: [
			0,
			.63194,
			0,
			0,
			.5
		],
		713: [
			0,
			.60889,
			0,
			0,
			.5
		],
		714: [
			0,
			.69444,
			0,
			0,
			.5
		],
		715: [
			0,
			.69444,
			0,
			0,
			.5
		],
		728: [
			0,
			.69444,
			0,
			0,
			.5
		],
		729: [
			0,
			.67937,
			0,
			0,
			.27778
		],
		730: [
			0,
			.69444,
			0,
			0,
			.66667
		],
		732: [
			0,
			.67659,
			0,
			0,
			.5
		],
		733: [
			0,
			.69444,
			0,
			0,
			.5
		],
		915: [
			0,
			.69444,
			0,
			0,
			.54167
		],
		916: [
			0,
			.69444,
			0,
			0,
			.83334
		],
		920: [
			0,
			.69444,
			0,
			0,
			.77778
		],
		923: [
			0,
			.69444,
			0,
			0,
			.61111
		],
		926: [
			0,
			.69444,
			0,
			0,
			.66667
		],
		928: [
			0,
			.69444,
			0,
			0,
			.70834
		],
		931: [
			0,
			.69444,
			0,
			0,
			.72222
		],
		933: [
			0,
			.69444,
			0,
			0,
			.77778
		],
		934: [
			0,
			.69444,
			0,
			0,
			.72222
		],
		936: [
			0,
			.69444,
			0,
			0,
			.77778
		],
		937: [
			0,
			.69444,
			0,
			0,
			.72222
		],
		8211: [
			0,
			.44444,
			.02778,
			0,
			.5
		],
		8212: [
			0,
			.44444,
			.02778,
			0,
			1
		],
		8216: [
			0,
			.69444,
			0,
			0,
			.27778
		],
		8217: [
			0,
			.69444,
			0,
			0,
			.27778
		],
		8220: [
			0,
			.69444,
			0,
			0,
			.5
		],
		8221: [
			0,
			.69444,
			0,
			0,
			.5
		]
	},
	"Script-Regular": {
		32: [
			0,
			0,
			0,
			0,
			.25
		],
		65: [
			0,
			.7,
			.22925,
			0,
			.80253
		],
		66: [
			0,
			.7,
			.04087,
			0,
			.90757
		],
		67: [
			0,
			.7,
			.1689,
			0,
			.66619
		],
		68: [
			0,
			.7,
			.09371,
			0,
			.77443
		],
		69: [
			0,
			.7,
			.18583,
			0,
			.56162
		],
		70: [
			0,
			.7,
			.13634,
			0,
			.89544
		],
		71: [
			0,
			.7,
			.17322,
			0,
			.60961
		],
		72: [
			0,
			.7,
			.29694,
			0,
			.96919
		],
		73: [
			0,
			.7,
			.19189,
			0,
			.80907
		],
		74: [
			.27778,
			.7,
			.19189,
			0,
			1.05159
		],
		75: [
			0,
			.7,
			.31259,
			0,
			.91364
		],
		76: [
			0,
			.7,
			.19189,
			0,
			.87373
		],
		77: [
			0,
			.7,
			.15981,
			0,
			1.08031
		],
		78: [
			0,
			.7,
			.3525,
			0,
			.9015
		],
		79: [
			0,
			.7,
			.08078,
			0,
			.73787
		],
		80: [
			0,
			.7,
			.08078,
			0,
			1.01262
		],
		81: [
			0,
			.7,
			.03305,
			0,
			.88282
		],
		82: [
			0,
			.7,
			.06259,
			0,
			.85
		],
		83: [
			0,
			.7,
			.19189,
			0,
			.86767
		],
		84: [
			0,
			.7,
			.29087,
			0,
			.74697
		],
		85: [
			0,
			.7,
			.25815,
			0,
			.79996
		],
		86: [
			0,
			.7,
			.27523,
			0,
			.62204
		],
		87: [
			0,
			.7,
			.27523,
			0,
			.80532
		],
		88: [
			0,
			.7,
			.26006,
			0,
			.94445
		],
		89: [
			0,
			.7,
			.2939,
			0,
			.70961
		],
		90: [
			0,
			.7,
			.24037,
			0,
			.8212
		],
		160: [
			0,
			0,
			0,
			0,
			.25
		]
	},
	"Size1-Regular": {
		32: [
			0,
			0,
			0,
			0,
			.25
		],
		40: [
			.35001,
			.85,
			0,
			0,
			.45834
		],
		41: [
			.35001,
			.85,
			0,
			0,
			.45834
		],
		47: [
			.35001,
			.85,
			0,
			0,
			.57778
		],
		91: [
			.35001,
			.85,
			0,
			0,
			.41667
		],
		92: [
			.35001,
			.85,
			0,
			0,
			.57778
		],
		93: [
			.35001,
			.85,
			0,
			0,
			.41667
		],
		123: [
			.35001,
			.85,
			0,
			0,
			.58334
		],
		125: [
			.35001,
			.85,
			0,
			0,
			.58334
		],
		160: [
			0,
			0,
			0,
			0,
			.25
		],
		710: [
			0,
			.72222,
			0,
			0,
			.55556
		],
		732: [
			0,
			.72222,
			0,
			0,
			.55556
		],
		770: [
			0,
			.72222,
			0,
			0,
			.55556
		],
		771: [
			0,
			.72222,
			0,
			0,
			.55556
		],
		8214: [
			-99e-5,
			.601,
			0,
			0,
			.77778
		],
		8593: [
			1e-5,
			.6,
			0,
			0,
			.66667
		],
		8595: [
			1e-5,
			.6,
			0,
			0,
			.66667
		],
		8657: [
			1e-5,
			.6,
			0,
			0,
			.77778
		],
		8659: [
			1e-5,
			.6,
			0,
			0,
			.77778
		],
		8719: [
			.25001,
			.75,
			0,
			0,
			.94445
		],
		8720: [
			.25001,
			.75,
			0,
			0,
			.94445
		],
		8721: [
			.25001,
			.75,
			0,
			0,
			1.05556
		],
		8730: [
			.35001,
			.85,
			0,
			0,
			1
		],
		8739: [
			-.00599,
			.606,
			0,
			0,
			.33333
		],
		8741: [
			-.00599,
			.606,
			0,
			0,
			.55556
		],
		8747: [
			.30612,
			.805,
			.19445,
			0,
			.47222
		],
		8748: [
			.306,
			.805,
			.19445,
			0,
			.47222
		],
		8749: [
			.306,
			.805,
			.19445,
			0,
			.47222
		],
		8750: [
			.30612,
			.805,
			.19445,
			0,
			.47222
		],
		8896: [
			.25001,
			.75,
			0,
			0,
			.83334
		],
		8897: [
			.25001,
			.75,
			0,
			0,
			.83334
		],
		8898: [
			.25001,
			.75,
			0,
			0,
			.83334
		],
		8899: [
			.25001,
			.75,
			0,
			0,
			.83334
		],
		8968: [
			.35001,
			.85,
			0,
			0,
			.47222
		],
		8969: [
			.35001,
			.85,
			0,
			0,
			.47222
		],
		8970: [
			.35001,
			.85,
			0,
			0,
			.47222
		],
		8971: [
			.35001,
			.85,
			0,
			0,
			.47222
		],
		9168: [
			-99e-5,
			.601,
			0,
			0,
			.66667
		],
		10216: [
			.35001,
			.85,
			0,
			0,
			.47222
		],
		10217: [
			.35001,
			.85,
			0,
			0,
			.47222
		],
		10752: [
			.25001,
			.75,
			0,
			0,
			1.11111
		],
		10753: [
			.25001,
			.75,
			0,
			0,
			1.11111
		],
		10754: [
			.25001,
			.75,
			0,
			0,
			1.11111
		],
		10756: [
			.25001,
			.75,
			0,
			0,
			.83334
		],
		10758: [
			.25001,
			.75,
			0,
			0,
			.83334
		]
	},
	"Size2-Regular": {
		32: [
			0,
			0,
			0,
			0,
			.25
		],
		40: [
			.65002,
			1.15,
			0,
			0,
			.59722
		],
		41: [
			.65002,
			1.15,
			0,
			0,
			.59722
		],
		47: [
			.65002,
			1.15,
			0,
			0,
			.81111
		],
		91: [
			.65002,
			1.15,
			0,
			0,
			.47222
		],
		92: [
			.65002,
			1.15,
			0,
			0,
			.81111
		],
		93: [
			.65002,
			1.15,
			0,
			0,
			.47222
		],
		123: [
			.65002,
			1.15,
			0,
			0,
			.66667
		],
		125: [
			.65002,
			1.15,
			0,
			0,
			.66667
		],
		160: [
			0,
			0,
			0,
			0,
			.25
		],
		710: [
			0,
			.75,
			0,
			0,
			1
		],
		732: [
			0,
			.75,
			0,
			0,
			1
		],
		770: [
			0,
			.75,
			0,
			0,
			1
		],
		771: [
			0,
			.75,
			0,
			0,
			1
		],
		8719: [
			.55001,
			1.05,
			0,
			0,
			1.27778
		],
		8720: [
			.55001,
			1.05,
			0,
			0,
			1.27778
		],
		8721: [
			.55001,
			1.05,
			0,
			0,
			1.44445
		],
		8730: [
			.65002,
			1.15,
			0,
			0,
			1
		],
		8747: [
			.86225,
			1.36,
			.44445,
			0,
			.55556
		],
		8748: [
			.862,
			1.36,
			.44445,
			0,
			.55556
		],
		8749: [
			.862,
			1.36,
			.44445,
			0,
			.55556
		],
		8750: [
			.86225,
			1.36,
			.44445,
			0,
			.55556
		],
		8896: [
			.55001,
			1.05,
			0,
			0,
			1.11111
		],
		8897: [
			.55001,
			1.05,
			0,
			0,
			1.11111
		],
		8898: [
			.55001,
			1.05,
			0,
			0,
			1.11111
		],
		8899: [
			.55001,
			1.05,
			0,
			0,
			1.11111
		],
		8968: [
			.65002,
			1.15,
			0,
			0,
			.52778
		],
		8969: [
			.65002,
			1.15,
			0,
			0,
			.52778
		],
		8970: [
			.65002,
			1.15,
			0,
			0,
			.52778
		],
		8971: [
			.65002,
			1.15,
			0,
			0,
			.52778
		],
		10216: [
			.65002,
			1.15,
			0,
			0,
			.61111
		],
		10217: [
			.65002,
			1.15,
			0,
			0,
			.61111
		],
		10752: [
			.55001,
			1.05,
			0,
			0,
			1.51112
		],
		10753: [
			.55001,
			1.05,
			0,
			0,
			1.51112
		],
		10754: [
			.55001,
			1.05,
			0,
			0,
			1.51112
		],
		10756: [
			.55001,
			1.05,
			0,
			0,
			1.11111
		],
		10758: [
			.55001,
			1.05,
			0,
			0,
			1.11111
		]
	},
	"Size3-Regular": {
		32: [
			0,
			0,
			0,
			0,
			.25
		],
		40: [
			.95003,
			1.45,
			0,
			0,
			.73611
		],
		41: [
			.95003,
			1.45,
			0,
			0,
			.73611
		],
		47: [
			.95003,
			1.45,
			0,
			0,
			1.04445
		],
		91: [
			.95003,
			1.45,
			0,
			0,
			.52778
		],
		92: [
			.95003,
			1.45,
			0,
			0,
			1.04445
		],
		93: [
			.95003,
			1.45,
			0,
			0,
			.52778
		],
		123: [
			.95003,
			1.45,
			0,
			0,
			.75
		],
		125: [
			.95003,
			1.45,
			0,
			0,
			.75
		],
		160: [
			0,
			0,
			0,
			0,
			.25
		],
		710: [
			0,
			.75,
			0,
			0,
			1.44445
		],
		732: [
			0,
			.75,
			0,
			0,
			1.44445
		],
		770: [
			0,
			.75,
			0,
			0,
			1.44445
		],
		771: [
			0,
			.75,
			0,
			0,
			1.44445
		],
		8730: [
			.95003,
			1.45,
			0,
			0,
			1
		],
		8968: [
			.95003,
			1.45,
			0,
			0,
			.58334
		],
		8969: [
			.95003,
			1.45,
			0,
			0,
			.58334
		],
		8970: [
			.95003,
			1.45,
			0,
			0,
			.58334
		],
		8971: [
			.95003,
			1.45,
			0,
			0,
			.58334
		],
		10216: [
			.95003,
			1.45,
			0,
			0,
			.75
		],
		10217: [
			.95003,
			1.45,
			0,
			0,
			.75
		]
	},
	"Size4-Regular": {
		32: [
			0,
			0,
			0,
			0,
			.25
		],
		40: [
			1.25003,
			1.75,
			0,
			0,
			.79167
		],
		41: [
			1.25003,
			1.75,
			0,
			0,
			.79167
		],
		47: [
			1.25003,
			1.75,
			0,
			0,
			1.27778
		],
		91: [
			1.25003,
			1.75,
			0,
			0,
			.58334
		],
		92: [
			1.25003,
			1.75,
			0,
			0,
			1.27778
		],
		93: [
			1.25003,
			1.75,
			0,
			0,
			.58334
		],
		123: [
			1.25003,
			1.75,
			0,
			0,
			.80556
		],
		125: [
			1.25003,
			1.75,
			0,
			0,
			.80556
		],
		160: [
			0,
			0,
			0,
			0,
			.25
		],
		710: [
			0,
			.825,
			0,
			0,
			1.8889
		],
		732: [
			0,
			.825,
			0,
			0,
			1.8889
		],
		770: [
			0,
			.825,
			0,
			0,
			1.8889
		],
		771: [
			0,
			.825,
			0,
			0,
			1.8889
		],
		8730: [
			1.25003,
			1.75,
			0,
			0,
			1
		],
		8968: [
			1.25003,
			1.75,
			0,
			0,
			.63889
		],
		8969: [
			1.25003,
			1.75,
			0,
			0,
			.63889
		],
		8970: [
			1.25003,
			1.75,
			0,
			0,
			.63889
		],
		8971: [
			1.25003,
			1.75,
			0,
			0,
			.63889
		],
		9115: [
			.64502,
			1.155,
			0,
			0,
			.875
		],
		9116: [
			1e-5,
			.6,
			0,
			0,
			.875
		],
		9117: [
			.64502,
			1.155,
			0,
			0,
			.875
		],
		9118: [
			.64502,
			1.155,
			0,
			0,
			.875
		],
		9119: [
			1e-5,
			.6,
			0,
			0,
			.875
		],
		9120: [
			.64502,
			1.155,
			0,
			0,
			.875
		],
		9121: [
			.64502,
			1.155,
			0,
			0,
			.66667
		],
		9122: [
			-99e-5,
			.601,
			0,
			0,
			.66667
		],
		9123: [
			.64502,
			1.155,
			0,
			0,
			.66667
		],
		9124: [
			.64502,
			1.155,
			0,
			0,
			.66667
		],
		9125: [
			-99e-5,
			.601,
			0,
			0,
			.66667
		],
		9126: [
			.64502,
			1.155,
			0,
			0,
			.66667
		],
		9127: [
			1e-5,
			.9,
			0,
			0,
			.88889
		],
		9128: [
			.65002,
			1.15,
			0,
			0,
			.88889
		],
		9129: [
			.90001,
			0,
			0,
			0,
			.88889
		],
		9130: [
			0,
			.3,
			0,
			0,
			.88889
		],
		9131: [
			1e-5,
			.9,
			0,
			0,
			.88889
		],
		9132: [
			.65002,
			1.15,
			0,
			0,
			.88889
		],
		9133: [
			.90001,
			0,
			0,
			0,
			.88889
		],
		9143: [
			.88502,
			.915,
			0,
			0,
			1.05556
		],
		10216: [
			1.25003,
			1.75,
			0,
			0,
			.80556
		],
		10217: [
			1.25003,
			1.75,
			0,
			0,
			.80556
		],
		57344: [
			-.00499,
			.605,
			0,
			0,
			1.05556
		],
		57345: [
			-.00499,
			.605,
			0,
			0,
			1.05556
		],
		57680: [
			0,
			.12,
			0,
			0,
			.45
		],
		57681: [
			0,
			.12,
			0,
			0,
			.45
		],
		57682: [
			0,
			.12,
			0,
			0,
			.45
		],
		57683: [
			0,
			.12,
			0,
			0,
			.45
		]
	},
	"Typewriter-Regular": {
		32: [
			0,
			0,
			0,
			0,
			.525
		],
		33: [
			0,
			.61111,
			0,
			0,
			.525
		],
		34: [
			0,
			.61111,
			0,
			0,
			.525
		],
		35: [
			0,
			.61111,
			0,
			0,
			.525
		],
		36: [
			.08333,
			.69444,
			0,
			0,
			.525
		],
		37: [
			.08333,
			.69444,
			0,
			0,
			.525
		],
		38: [
			0,
			.61111,
			0,
			0,
			.525
		],
		39: [
			0,
			.61111,
			0,
			0,
			.525
		],
		40: [
			.08333,
			.69444,
			0,
			0,
			.525
		],
		41: [
			.08333,
			.69444,
			0,
			0,
			.525
		],
		42: [
			0,
			.52083,
			0,
			0,
			.525
		],
		43: [
			-.08056,
			.53055,
			0,
			0,
			.525
		],
		44: [
			.13889,
			.125,
			0,
			0,
			.525
		],
		45: [
			-.08056,
			.53055,
			0,
			0,
			.525
		],
		46: [
			0,
			.125,
			0,
			0,
			.525
		],
		47: [
			.08333,
			.69444,
			0,
			0,
			.525
		],
		48: [
			0,
			.61111,
			0,
			0,
			.525
		],
		49: [
			0,
			.61111,
			0,
			0,
			.525
		],
		50: [
			0,
			.61111,
			0,
			0,
			.525
		],
		51: [
			0,
			.61111,
			0,
			0,
			.525
		],
		52: [
			0,
			.61111,
			0,
			0,
			.525
		],
		53: [
			0,
			.61111,
			0,
			0,
			.525
		],
		54: [
			0,
			.61111,
			0,
			0,
			.525
		],
		55: [
			0,
			.61111,
			0,
			0,
			.525
		],
		56: [
			0,
			.61111,
			0,
			0,
			.525
		],
		57: [
			0,
			.61111,
			0,
			0,
			.525
		],
		58: [
			0,
			.43056,
			0,
			0,
			.525
		],
		59: [
			.13889,
			.43056,
			0,
			0,
			.525
		],
		60: [
			-.05556,
			.55556,
			0,
			0,
			.525
		],
		61: [
			-.19549,
			.41562,
			0,
			0,
			.525
		],
		62: [
			-.05556,
			.55556,
			0,
			0,
			.525
		],
		63: [
			0,
			.61111,
			0,
			0,
			.525
		],
		64: [
			0,
			.61111,
			0,
			0,
			.525
		],
		65: [
			0,
			.61111,
			0,
			0,
			.525
		],
		66: [
			0,
			.61111,
			0,
			0,
			.525
		],
		67: [
			0,
			.61111,
			0,
			0,
			.525
		],
		68: [
			0,
			.61111,
			0,
			0,
			.525
		],
		69: [
			0,
			.61111,
			0,
			0,
			.525
		],
		70: [
			0,
			.61111,
			0,
			0,
			.525
		],
		71: [
			0,
			.61111,
			0,
			0,
			.525
		],
		72: [
			0,
			.61111,
			0,
			0,
			.525
		],
		73: [
			0,
			.61111,
			0,
			0,
			.525
		],
		74: [
			0,
			.61111,
			0,
			0,
			.525
		],
		75: [
			0,
			.61111,
			0,
			0,
			.525
		],
		76: [
			0,
			.61111,
			0,
			0,
			.525
		],
		77: [
			0,
			.61111,
			0,
			0,
			.525
		],
		78: [
			0,
			.61111,
			0,
			0,
			.525
		],
		79: [
			0,
			.61111,
			0,
			0,
			.525
		],
		80: [
			0,
			.61111,
			0,
			0,
			.525
		],
		81: [
			.13889,
			.61111,
			0,
			0,
			.525
		],
		82: [
			0,
			.61111,
			0,
			0,
			.525
		],
		83: [
			0,
			.61111,
			0,
			0,
			.525
		],
		84: [
			0,
			.61111,
			0,
			0,
			.525
		],
		85: [
			0,
			.61111,
			0,
			0,
			.525
		],
		86: [
			0,
			.61111,
			0,
			0,
			.525
		],
		87: [
			0,
			.61111,
			0,
			0,
			.525
		],
		88: [
			0,
			.61111,
			0,
			0,
			.525
		],
		89: [
			0,
			.61111,
			0,
			0,
			.525
		],
		90: [
			0,
			.61111,
			0,
			0,
			.525
		],
		91: [
			.08333,
			.69444,
			0,
			0,
			.525
		],
		92: [
			.08333,
			.69444,
			0,
			0,
			.525
		],
		93: [
			.08333,
			.69444,
			0,
			0,
			.525
		],
		94: [
			0,
			.61111,
			0,
			0,
			.525
		],
		95: [
			.09514,
			0,
			0,
			0,
			.525
		],
		96: [
			0,
			.61111,
			0,
			0,
			.525
		],
		97: [
			0,
			.43056,
			0,
			0,
			.525
		],
		98: [
			0,
			.61111,
			0,
			0,
			.525
		],
		99: [
			0,
			.43056,
			0,
			0,
			.525
		],
		100: [
			0,
			.61111,
			0,
			0,
			.525
		],
		101: [
			0,
			.43056,
			0,
			0,
			.525
		],
		102: [
			0,
			.61111,
			0,
			0,
			.525
		],
		103: [
			.22222,
			.43056,
			0,
			0,
			.525
		],
		104: [
			0,
			.61111,
			0,
			0,
			.525
		],
		105: [
			0,
			.61111,
			0,
			0,
			.525
		],
		106: [
			.22222,
			.61111,
			0,
			0,
			.525
		],
		107: [
			0,
			.61111,
			0,
			0,
			.525
		],
		108: [
			0,
			.61111,
			0,
			0,
			.525
		],
		109: [
			0,
			.43056,
			0,
			0,
			.525
		],
		110: [
			0,
			.43056,
			0,
			0,
			.525
		],
		111: [
			0,
			.43056,
			0,
			0,
			.525
		],
		112: [
			.22222,
			.43056,
			0,
			0,
			.525
		],
		113: [
			.22222,
			.43056,
			0,
			0,
			.525
		],
		114: [
			0,
			.43056,
			0,
			0,
			.525
		],
		115: [
			0,
			.43056,
			0,
			0,
			.525
		],
		116: [
			0,
			.55358,
			0,
			0,
			.525
		],
		117: [
			0,
			.43056,
			0,
			0,
			.525
		],
		118: [
			0,
			.43056,
			0,
			0,
			.525
		],
		119: [
			0,
			.43056,
			0,
			0,
			.525
		],
		120: [
			0,
			.43056,
			0,
			0,
			.525
		],
		121: [
			.22222,
			.43056,
			0,
			0,
			.525
		],
		122: [
			0,
			.43056,
			0,
			0,
			.525
		],
		123: [
			.08333,
			.69444,
			0,
			0,
			.525
		],
		124: [
			.08333,
			.69444,
			0,
			0,
			.525
		],
		125: [
			.08333,
			.69444,
			0,
			0,
			.525
		],
		126: [
			0,
			.61111,
			0,
			0,
			.525
		],
		127: [
			0,
			.61111,
			0,
			0,
			.525
		],
		160: [
			0,
			0,
			0,
			0,
			.525
		],
		176: [
			0,
			.61111,
			0,
			0,
			.525
		],
		184: [
			.19445,
			0,
			0,
			0,
			.525
		],
		305: [
			0,
			.43056,
			0,
			0,
			.525
		],
		567: [
			.22222,
			.43056,
			0,
			0,
			.525
		],
		711: [
			0,
			.56597,
			0,
			0,
			.525
		],
		713: [
			0,
			.56555,
			0,
			0,
			.525
		],
		714: [
			0,
			.61111,
			0,
			0,
			.525
		],
		715: [
			0,
			.61111,
			0,
			0,
			.525
		],
		728: [
			0,
			.61111,
			0,
			0,
			.525
		],
		730: [
			0,
			.61111,
			0,
			0,
			.525
		],
		770: [
			0,
			.61111,
			0,
			0,
			.525
		],
		771: [
			0,
			.61111,
			0,
			0,
			.525
		],
		776: [
			0,
			.61111,
			0,
			0,
			.525
		],
		915: [
			0,
			.61111,
			0,
			0,
			.525
		],
		916: [
			0,
			.61111,
			0,
			0,
			.525
		],
		920: [
			0,
			.61111,
			0,
			0,
			.525
		],
		923: [
			0,
			.61111,
			0,
			0,
			.525
		],
		926: [
			0,
			.61111,
			0,
			0,
			.525
		],
		928: [
			0,
			.61111,
			0,
			0,
			.525
		],
		931: [
			0,
			.61111,
			0,
			0,
			.525
		],
		933: [
			0,
			.61111,
			0,
			0,
			.525
		],
		934: [
			0,
			.61111,
			0,
			0,
			.525
		],
		936: [
			0,
			.61111,
			0,
			0,
			.525
		],
		937: [
			0,
			.61111,
			0,
			0,
			.525
		],
		8216: [
			0,
			.61111,
			0,
			0,
			.525
		],
		8217: [
			0,
			.61111,
			0,
			0,
			.525
		],
		8242: [
			0,
			.61111,
			0,
			0,
			.525
		],
		9251: [
			.11111,
			.21944,
			0,
			0,
			.525
		]
	}
}, Dt = {
	slant: [
		.25,
		.25,
		.25
	],
	space: [
		0,
		0,
		0
	],
	stretch: [
		0,
		0,
		0
	],
	shrink: [
		0,
		0,
		0
	],
	xHeight: [
		.431,
		.431,
		.431
	],
	quad: [
		1,
		1.171,
		1.472
	],
	extraSpace: [
		0,
		0,
		0
	],
	num1: [
		.677,
		.732,
		.925
	],
	num2: [
		.394,
		.384,
		.387
	],
	num3: [
		.444,
		.471,
		.504
	],
	denom1: [
		.686,
		.752,
		1.025
	],
	denom2: [
		.345,
		.344,
		.532
	],
	sup1: [
		.413,
		.503,
		.504
	],
	sup2: [
		.363,
		.431,
		.404
	],
	sup3: [
		.289,
		.286,
		.294
	],
	sub1: [
		.15,
		.143,
		.2
	],
	sub2: [
		.247,
		.286,
		.4
	],
	supDrop: [
		.386,
		.353,
		.494
	],
	subDrop: [
		.05,
		.071,
		.1
	],
	delim1: [
		2.39,
		1.7,
		1.98
	],
	delim2: [
		1.01,
		1.157,
		1.42
	],
	axisHeight: [
		.25,
		.25,
		.25
	],
	defaultRuleThickness: [
		.04,
		.049,
		.049
	],
	bigOpSpacing1: [
		.111,
		.111,
		.111
	],
	bigOpSpacing2: [
		.166,
		.166,
		.166
	],
	bigOpSpacing3: [
		.2,
		.2,
		.2
	],
	bigOpSpacing4: [
		.6,
		.611,
		.611
	],
	bigOpSpacing5: [
		.1,
		.143,
		.143
	],
	sqrtRuleThickness: [
		.04,
		.04,
		.04
	],
	ptPerEm: [
		10,
		10,
		10
	],
	doubleRuleSep: [
		.2,
		.2,
		.2
	],
	arrayRuleWidth: [
		.04,
		.04,
		.04
	],
	fboxsep: [
		.3,
		.3,
		.3
	],
	fboxrule: [
		.04,
		.04,
		.04
	]
}, Ot = {
	Å: "A",
	Ð: "D",
	Þ: "o",
	å: "a",
	ð: "d",
	þ: "o",
	А: "A",
	Б: "B",
	В: "B",
	Г: "F",
	Д: "A",
	Е: "E",
	Ж: "K",
	З: "3",
	И: "N",
	Й: "N",
	К: "K",
	Л: "N",
	М: "M",
	Н: "H",
	О: "O",
	П: "N",
	Р: "P",
	С: "C",
	Т: "T",
	У: "y",
	Ф: "O",
	Х: "X",
	Ц: "U",
	Ч: "h",
	Ш: "W",
	Щ: "W",
	Ъ: "B",
	Ы: "X",
	Ь: "B",
	Э: "3",
	Ю: "X",
	Я: "R",
	а: "a",
	б: "b",
	в: "a",
	г: "r",
	д: "y",
	е: "e",
	ж: "m",
	з: "e",
	и: "n",
	й: "n",
	к: "n",
	л: "n",
	м: "m",
	н: "n",
	о: "o",
	п: "n",
	р: "p",
	с: "c",
	т: "o",
	у: "y",
	ф: "b",
	х: "x",
	ц: "n",
	ч: "n",
	ш: "w",
	щ: "w",
	ъ: "a",
	ы: "m",
	ь: "a",
	э: "e",
	ю: "m",
	я: "r"
};
function kt(e, t, n) {
	if (!Et[t]) throw Error("Font metrics not found for font: " + t + ".");
	var r = e.charCodeAt(0), i = Et[t][r];
	if (!i && e[0] in Ot && (r = Ot[e[0]].charCodeAt(0), i = Et[t][r]), !i && n === "text" && We(r) && (i = Et[t][77]), i) return {
		depth: i[0],
		height: i[1],
		italic: i[2],
		skew: i[3],
		width: i[4]
	};
}
var At = {};
function jt(e) {
	var t = e >= 5 ? 0 : e >= 3 ? 1 : 2;
	if (!At[t]) {
		var n = At[t] = { cssEmPerMu: Dt.quad[t] / 18 };
		for (var r in Dt) Dt.hasOwnProperty(r) && (n[r] = Dt[r][t]);
	}
	return At[t];
}
var D = {
	math: {},
	text: {}
};
function O(e, t, n, r, i, a) {
	D[e][i] = {
		font: t,
		group: n,
		replace: r
	}, a && r && (D[e][r] = D[e][i]);
}
var k = "math", A = "text", j = "main", M = "ams", N = "accent-token", P = "bin", Mt = "close", Nt = "inner", F = "mathord", Pt = "op-token", Ft = "open", It = "punct", I = "rel", Lt = "spacing", L = "textord";
O(k, j, I, "≡", "\\equiv", !0), O(k, j, I, "≺", "\\prec", !0), O(k, j, I, "≻", "\\succ", !0), O(k, j, I, "∼", "\\sim", !0), O(k, j, I, "⊥", "\\perp"), O(k, j, I, "⪯", "\\preceq", !0), O(k, j, I, "⪰", "\\succeq", !0), O(k, j, I, "≃", "\\simeq", !0), O(k, j, I, "∣", "\\mid", !0), O(k, j, I, "≪", "\\ll", !0), O(k, j, I, "≫", "\\gg", !0), O(k, j, I, "≍", "\\asymp", !0), O(k, j, I, "∥", "\\parallel"), O(k, j, I, "⋈", "\\bowtie", !0), O(k, j, I, "⌣", "\\smile", !0), O(k, j, I, "⊑", "\\sqsubseteq", !0), O(k, j, I, "⊒", "\\sqsupseteq", !0), O(k, j, I, "≐", "\\doteq", !0), O(k, j, I, "⌢", "\\frown", !0), O(k, j, I, "∋", "\\ni", !0), O(k, j, I, "∝", "\\propto", !0), O(k, j, I, "⊢", "\\vdash", !0), O(k, j, I, "⊣", "\\dashv", !0), O(k, j, I, "∋", "\\owns"), O(k, j, It, ".", "\\ldotp"), O(k, j, It, "⋅", "\\cdotp"), O(k, j, It, "⋅", "·"), O(A, j, L, "⋅", "·"), O(k, j, L, "#", "\\#"), O(A, j, L, "#", "\\#"), O(k, j, L, "&", "\\&"), O(A, j, L, "&", "\\&"), O(k, j, L, "ℵ", "\\aleph", !0), O(k, j, L, "∀", "\\forall", !0), O(k, j, L, "ℏ", "\\hbar", !0), O(k, j, L, "∃", "\\exists", !0), O(k, j, L, "∇", "\\nabla", !0), O(k, j, L, "♭", "\\flat", !0), O(k, j, L, "ℓ", "\\ell", !0), O(k, j, L, "♮", "\\natural", !0), O(k, j, L, "♣", "\\clubsuit", !0), O(k, j, L, "℘", "\\wp", !0), O(k, j, L, "♯", "\\sharp", !0), O(k, j, L, "♢", "\\diamondsuit", !0), O(k, j, L, "ℜ", "\\Re", !0), O(k, j, L, "♡", "\\heartsuit", !0), O(k, j, L, "ℑ", "\\Im", !0), O(k, j, L, "♠", "\\spadesuit", !0), O(k, j, L, "§", "\\S", !0), O(A, j, L, "§", "\\S"), O(k, j, L, "¶", "\\P", !0), O(A, j, L, "¶", "\\P"), O(k, j, L, "†", "\\dag"), O(A, j, L, "†", "\\dag"), O(A, j, L, "†", "\\textdagger"), O(k, j, L, "‡", "\\ddag"), O(A, j, L, "‡", "\\ddag"), O(A, j, L, "‡", "\\textdaggerdbl"), O(k, j, Mt, "⎱", "\\rmoustache", !0), O(k, j, Ft, "⎰", "\\lmoustache", !0), O(k, j, Mt, "⟯", "\\rgroup", !0), O(k, j, Ft, "⟮", "\\lgroup", !0), O(k, j, P, "∓", "\\mp", !0), O(k, j, P, "⊖", "\\ominus", !0), O(k, j, P, "⊎", "\\uplus", !0), O(k, j, P, "⊓", "\\sqcap", !0), O(k, j, P, "∗", "\\ast"), O(k, j, P, "⊔", "\\sqcup", !0), O(k, j, P, "◯", "\\bigcirc", !0), O(k, j, P, "∙", "\\bullet", !0), O(k, j, P, "‡", "\\ddagger"), O(k, j, P, "≀", "\\wr", !0), O(k, j, P, "⨿", "\\amalg"), O(k, j, P, "&", "\\And"), O(k, j, I, "⟵", "\\longleftarrow", !0), O(k, j, I, "⇐", "\\Leftarrow", !0), O(k, j, I, "⟸", "\\Longleftarrow", !0), O(k, j, I, "⟶", "\\longrightarrow", !0), O(k, j, I, "⇒", "\\Rightarrow", !0), O(k, j, I, "⟹", "\\Longrightarrow", !0), O(k, j, I, "↔", "\\leftrightarrow", !0), O(k, j, I, "⟷", "\\longleftrightarrow", !0), O(k, j, I, "⇔", "\\Leftrightarrow", !0), O(k, j, I, "⟺", "\\Longleftrightarrow", !0), O(k, j, I, "↦", "\\mapsto", !0), O(k, j, I, "⟼", "\\longmapsto", !0), O(k, j, I, "↗", "\\nearrow", !0), O(k, j, I, "↩", "\\hookleftarrow", !0), O(k, j, I, "↪", "\\hookrightarrow", !0), O(k, j, I, "↘", "\\searrow", !0), O(k, j, I, "↼", "\\leftharpoonup", !0), O(k, j, I, "⇀", "\\rightharpoonup", !0), O(k, j, I, "↙", "\\swarrow", !0), O(k, j, I, "↽", "\\leftharpoondown", !0), O(k, j, I, "⇁", "\\rightharpoondown", !0), O(k, j, I, "↖", "\\nwarrow", !0), O(k, j, I, "⇌", "\\rightleftharpoons", !0), O(k, M, I, "≮", "\\nless", !0), O(k, M, I, "", "\\@nleqslant"), O(k, M, I, "", "\\@nleqq"), O(k, M, I, "⪇", "\\lneq", !0), O(k, M, I, "≨", "\\lneqq", !0), O(k, M, I, "", "\\@lvertneqq"), O(k, M, I, "⋦", "\\lnsim", !0), O(k, M, I, "⪉", "\\lnapprox", !0), O(k, M, I, "⊀", "\\nprec", !0), O(k, M, I, "⋠", "\\npreceq", !0), O(k, M, I, "⋨", "\\precnsim", !0), O(k, M, I, "⪹", "\\precnapprox", !0), O(k, M, I, "≁", "\\nsim", !0), O(k, M, I, "", "\\@nshortmid"), O(k, M, I, "∤", "\\nmid", !0), O(k, M, I, "⊬", "\\nvdash", !0), O(k, M, I, "⊭", "\\nvDash", !0), O(k, M, I, "⋪", "\\ntriangleleft"), O(k, M, I, "⋬", "\\ntrianglelefteq", !0), O(k, M, I, "⊊", "\\subsetneq", !0), O(k, M, I, "", "\\@varsubsetneq"), O(k, M, I, "⫋", "\\subsetneqq", !0), O(k, M, I, "", "\\@varsubsetneqq"), O(k, M, I, "≯", "\\ngtr", !0), O(k, M, I, "", "\\@ngeqslant"), O(k, M, I, "", "\\@ngeqq"), O(k, M, I, "⪈", "\\gneq", !0), O(k, M, I, "≩", "\\gneqq", !0), O(k, M, I, "", "\\@gvertneqq"), O(k, M, I, "⋧", "\\gnsim", !0), O(k, M, I, "⪊", "\\gnapprox", !0), O(k, M, I, "⊁", "\\nsucc", !0), O(k, M, I, "⋡", "\\nsucceq", !0), O(k, M, I, "⋩", "\\succnsim", !0), O(k, M, I, "⪺", "\\succnapprox", !0), O(k, M, I, "≆", "\\ncong", !0), O(k, M, I, "", "\\@nshortparallel"), O(k, M, I, "∦", "\\nparallel", !0), O(k, M, I, "⊯", "\\nVDash", !0), O(k, M, I, "⋫", "\\ntriangleright"), O(k, M, I, "⋭", "\\ntrianglerighteq", !0), O(k, M, I, "", "\\@nsupseteqq"), O(k, M, I, "⊋", "\\supsetneq", !0), O(k, M, I, "", "\\@varsupsetneq"), O(k, M, I, "⫌", "\\supsetneqq", !0), O(k, M, I, "", "\\@varsupsetneqq"), O(k, M, I, "⊮", "\\nVdash", !0), O(k, M, I, "⪵", "\\precneqq", !0), O(k, M, I, "⪶", "\\succneqq", !0), O(k, M, I, "", "\\@nsubseteqq"), O(k, M, P, "⊴", "\\unlhd"), O(k, M, P, "⊵", "\\unrhd"), O(k, M, I, "↚", "\\nleftarrow", !0), O(k, M, I, "↛", "\\nrightarrow", !0), O(k, M, I, "⇍", "\\nLeftarrow", !0), O(k, M, I, "⇏", "\\nRightarrow", !0), O(k, M, I, "↮", "\\nleftrightarrow", !0), O(k, M, I, "⇎", "\\nLeftrightarrow", !0), O(k, M, I, "△", "\\vartriangle"), O(k, M, L, "ℏ", "\\hslash"), O(k, M, L, "▽", "\\triangledown"), O(k, M, L, "◊", "\\lozenge"), O(k, M, L, "Ⓢ", "\\circledS"), O(k, M, L, "®", "\\circledR"), O(A, M, L, "®", "\\circledR"), O(k, M, L, "∡", "\\measuredangle", !0), O(k, M, L, "∄", "\\nexists"), O(k, M, L, "℧", "\\mho"), O(k, M, L, "Ⅎ", "\\Finv", !0), O(k, M, L, "⅁", "\\Game", !0), O(k, M, L, "‵", "\\backprime"), O(k, M, L, "▲", "\\blacktriangle"), O(k, M, L, "▼", "\\blacktriangledown"), O(k, M, L, "■", "\\blacksquare"), O(k, M, L, "⧫", "\\blacklozenge"), O(k, M, L, "★", "\\bigstar"), O(k, M, L, "∢", "\\sphericalangle", !0), O(k, M, L, "∁", "\\complement", !0), O(k, M, L, "ð", "\\eth", !0), O(A, j, L, "ð", "ð"), O(k, M, L, "╱", "\\diagup"), O(k, M, L, "╲", "\\diagdown"), O(k, M, L, "□", "\\square"), O(k, M, L, "□", "\\Box"), O(k, M, L, "◊", "\\Diamond"), O(k, M, L, "¥", "\\yen", !0), O(A, M, L, "¥", "\\yen", !0), O(k, M, L, "✓", "\\checkmark", !0), O(A, M, L, "✓", "\\checkmark"), O(k, M, L, "ℶ", "\\beth", !0), O(k, M, L, "ℸ", "\\daleth", !0), O(k, M, L, "ℷ", "\\gimel", !0), O(k, M, L, "ϝ", "\\digamma", !0), O(k, M, L, "ϰ", "\\varkappa"), O(k, M, Ft, "┌", "\\@ulcorner", !0), O(k, M, Mt, "┐", "\\@urcorner", !0), O(k, M, Ft, "└", "\\@llcorner", !0), O(k, M, Mt, "┘", "\\@lrcorner", !0), O(k, M, I, "≦", "\\leqq", !0), O(k, M, I, "⩽", "\\leqslant", !0), O(k, M, I, "⪕", "\\eqslantless", !0), O(k, M, I, "≲", "\\lesssim", !0), O(k, M, I, "⪅", "\\lessapprox", !0), O(k, M, I, "≊", "\\approxeq", !0), O(k, M, P, "⋖", "\\lessdot"), O(k, M, I, "⋘", "\\lll", !0), O(k, M, I, "≶", "\\lessgtr", !0), O(k, M, I, "⋚", "\\lesseqgtr", !0), O(k, M, I, "⪋", "\\lesseqqgtr", !0), O(k, M, I, "≑", "\\doteqdot"), O(k, M, I, "≓", "\\risingdotseq", !0), O(k, M, I, "≒", "\\fallingdotseq", !0), O(k, M, I, "∽", "\\backsim", !0), O(k, M, I, "⋍", "\\backsimeq", !0), O(k, M, I, "⫅", "\\subseteqq", !0), O(k, M, I, "⋐", "\\Subset", !0), O(k, M, I, "⊏", "\\sqsubset", !0), O(k, M, I, "≼", "\\preccurlyeq", !0), O(k, M, I, "⋞", "\\curlyeqprec", !0), O(k, M, I, "≾", "\\precsim", !0), O(k, M, I, "⪷", "\\precapprox", !0), O(k, M, I, "⊲", "\\vartriangleleft"), O(k, M, I, "⊴", "\\trianglelefteq"), O(k, M, I, "⊨", "\\vDash", !0), O(k, M, I, "⊪", "\\Vvdash", !0), O(k, M, I, "⌣", "\\smallsmile"), O(k, M, I, "⌢", "\\smallfrown"), O(k, M, I, "≏", "\\bumpeq", !0), O(k, M, I, "≎", "\\Bumpeq", !0), O(k, M, I, "≧", "\\geqq", !0), O(k, M, I, "⩾", "\\geqslant", !0), O(k, M, I, "⪖", "\\eqslantgtr", !0), O(k, M, I, "≳", "\\gtrsim", !0), O(k, M, I, "⪆", "\\gtrapprox", !0), O(k, M, P, "⋗", "\\gtrdot"), O(k, M, I, "⋙", "\\ggg", !0), O(k, M, I, "≷", "\\gtrless", !0), O(k, M, I, "⋛", "\\gtreqless", !0), O(k, M, I, "⪌", "\\gtreqqless", !0), O(k, M, I, "≖", "\\eqcirc", !0), O(k, M, I, "≗", "\\circeq", !0), O(k, M, I, "≜", "\\triangleq", !0), O(k, M, I, "∼", "\\thicksim"), O(k, M, I, "≈", "\\thickapprox"), O(k, M, I, "⫆", "\\supseteqq", !0), O(k, M, I, "⋑", "\\Supset", !0), O(k, M, I, "⊐", "\\sqsupset", !0), O(k, M, I, "≽", "\\succcurlyeq", !0), O(k, M, I, "⋟", "\\curlyeqsucc", !0), O(k, M, I, "≿", "\\succsim", !0), O(k, M, I, "⪸", "\\succapprox", !0), O(k, M, I, "⊳", "\\vartriangleright"), O(k, M, I, "⊵", "\\trianglerighteq"), O(k, M, I, "⊩", "\\Vdash", !0), O(k, M, I, "∣", "\\shortmid"), O(k, M, I, "∥", "\\shortparallel"), O(k, M, I, "≬", "\\between", !0), O(k, M, I, "⋔", "\\pitchfork", !0), O(k, M, I, "∝", "\\varpropto"), O(k, M, I, "◀", "\\blacktriangleleft"), O(k, M, I, "∴", "\\therefore", !0), O(k, M, I, "∍", "\\backepsilon"), O(k, M, I, "▶", "\\blacktriangleright"), O(k, M, I, "∵", "\\because", !0), O(k, M, I, "⋘", "\\llless"), O(k, M, I, "⋙", "\\gggtr"), O(k, M, P, "⊲", "\\lhd"), O(k, M, P, "⊳", "\\rhd"), O(k, M, I, "≂", "\\eqsim", !0), O(k, j, I, "⋈", "\\Join"), O(k, M, I, "≑", "\\Doteq", !0), O(k, M, P, "∔", "\\dotplus", !0), O(k, M, P, "∖", "\\smallsetminus"), O(k, M, P, "⋒", "\\Cap", !0), O(k, M, P, "⋓", "\\Cup", !0), O(k, M, P, "⩞", "\\doublebarwedge", !0), O(k, M, P, "⊟", "\\boxminus", !0), O(k, M, P, "⊞", "\\boxplus", !0), O(k, M, P, "⋇", "\\divideontimes", !0), O(k, M, P, "⋉", "\\ltimes", !0), O(k, M, P, "⋊", "\\rtimes", !0), O(k, M, P, "⋋", "\\leftthreetimes", !0), O(k, M, P, "⋌", "\\rightthreetimes", !0), O(k, M, P, "⋏", "\\curlywedge", !0), O(k, M, P, "⋎", "\\curlyvee", !0), O(k, M, P, "⊝", "\\circleddash", !0), O(k, M, P, "⊛", "\\circledast", !0), O(k, M, P, "⋅", "\\centerdot"), O(k, M, P, "⊺", "\\intercal", !0), O(k, M, P, "⋒", "\\doublecap"), O(k, M, P, "⋓", "\\doublecup"), O(k, M, P, "⊠", "\\boxtimes", !0), O(k, M, I, "⇢", "\\dashrightarrow", !0), O(k, M, I, "⇠", "\\dashleftarrow", !0), O(k, M, I, "⇇", "\\leftleftarrows", !0), O(k, M, I, "⇆", "\\leftrightarrows", !0), O(k, M, I, "⇚", "\\Lleftarrow", !0), O(k, M, I, "↞", "\\twoheadleftarrow", !0), O(k, M, I, "↢", "\\leftarrowtail", !0), O(k, M, I, "↫", "\\looparrowleft", !0), O(k, M, I, "⇋", "\\leftrightharpoons", !0), O(k, M, I, "↶", "\\curvearrowleft", !0), O(k, M, I, "↺", "\\circlearrowleft", !0), O(k, M, I, "↰", "\\Lsh", !0), O(k, M, I, "⇈", "\\upuparrows", !0), O(k, M, I, "↿", "\\upharpoonleft", !0), O(k, M, I, "⇃", "\\downharpoonleft", !0), O(k, j, I, "⊶", "\\origof", !0), O(k, j, I, "⊷", "\\imageof", !0), O(k, M, I, "⊸", "\\multimap", !0), O(k, M, I, "↭", "\\leftrightsquigarrow", !0), O(k, M, I, "⇉", "\\rightrightarrows", !0), O(k, M, I, "⇄", "\\rightleftarrows", !0), O(k, M, I, "↠", "\\twoheadrightarrow", !0), O(k, M, I, "↣", "\\rightarrowtail", !0), O(k, M, I, "↬", "\\looparrowright", !0), O(k, M, I, "↷", "\\curvearrowright", !0), O(k, M, I, "↻", "\\circlearrowright", !0), O(k, M, I, "↱", "\\Rsh", !0), O(k, M, I, "⇊", "\\downdownarrows", !0), O(k, M, I, "↾", "\\upharpoonright", !0), O(k, M, I, "⇂", "\\downharpoonright", !0), O(k, M, I, "⇝", "\\rightsquigarrow", !0), O(k, M, I, "⇝", "\\leadsto"), O(k, M, I, "⇛", "\\Rrightarrow", !0), O(k, M, I, "↾", "\\restriction"), O(k, j, L, "‘", "`"), O(k, j, L, "$", "\\$"), O(A, j, L, "$", "\\$"), O(A, j, L, "$", "\\textdollar"), O(k, j, L, "%", "\\%"), O(A, j, L, "%", "\\%"), O(k, j, L, "_", "\\_"), O(A, j, L, "_", "\\_"), O(A, j, L, "_", "\\textunderscore"), O(k, j, L, "∠", "\\angle", !0), O(k, j, L, "∞", "\\infty", !0), O(k, j, L, "′", "\\prime"), O(k, j, L, "△", "\\triangle"), O(k, j, L, "Γ", "\\Gamma", !0), O(k, j, L, "Δ", "\\Delta", !0), O(k, j, L, "Θ", "\\Theta", !0), O(k, j, L, "Λ", "\\Lambda", !0), O(k, j, L, "Ξ", "\\Xi", !0), O(k, j, L, "Π", "\\Pi", !0), O(k, j, L, "Σ", "\\Sigma", !0), O(k, j, L, "Υ", "\\Upsilon", !0), O(k, j, L, "Φ", "\\Phi", !0), O(k, j, L, "Ψ", "\\Psi", !0), O(k, j, L, "Ω", "\\Omega", !0), O(k, j, L, "A", "Α"), O(k, j, L, "B", "Β"), O(k, j, L, "E", "Ε"), O(k, j, L, "Z", "Ζ"), O(k, j, L, "H", "Η"), O(k, j, L, "I", "Ι"), O(k, j, L, "K", "Κ"), O(k, j, L, "M", "Μ"), O(k, j, L, "N", "Ν"), O(k, j, L, "O", "Ο"), O(k, j, L, "P", "Ρ"), O(k, j, L, "T", "Τ"), O(k, j, L, "X", "Χ"), O(k, j, L, "¬", "\\neg", !0), O(k, j, L, "¬", "\\lnot"), O(k, j, L, "⊤", "\\top"), O(k, j, L, "⊥", "\\bot"), O(k, j, L, "∅", "\\emptyset"), O(k, M, L, "∅", "\\varnothing"), O(k, j, F, "α", "\\alpha", !0), O(k, j, F, "β", "\\beta", !0), O(k, j, F, "γ", "\\gamma", !0), O(k, j, F, "δ", "\\delta", !0), O(k, j, F, "ϵ", "\\epsilon", !0), O(k, j, F, "ζ", "\\zeta", !0), O(k, j, F, "η", "\\eta", !0), O(k, j, F, "θ", "\\theta", !0), O(k, j, F, "ι", "\\iota", !0), O(k, j, F, "κ", "\\kappa", !0), O(k, j, F, "λ", "\\lambda", !0), O(k, j, F, "μ", "\\mu", !0), O(k, j, F, "ν", "\\nu", !0), O(k, j, F, "ξ", "\\xi", !0), O(k, j, F, "ο", "\\omicron", !0), O(k, j, F, "π", "\\pi", !0), O(k, j, F, "ρ", "\\rho", !0), O(k, j, F, "σ", "\\sigma", !0), O(k, j, F, "τ", "\\tau", !0), O(k, j, F, "υ", "\\upsilon", !0), O(k, j, F, "ϕ", "\\phi", !0), O(k, j, F, "χ", "\\chi", !0), O(k, j, F, "ψ", "\\psi", !0), O(k, j, F, "ω", "\\omega", !0), O(k, j, F, "ε", "\\varepsilon", !0), O(k, j, F, "ϑ", "\\vartheta", !0), O(k, j, F, "ϖ", "\\varpi", !0), O(k, j, F, "ϱ", "\\varrho", !0), O(k, j, F, "ς", "\\varsigma", !0), O(k, j, F, "φ", "\\varphi", !0), O(k, j, P, "∗", "*", !0), O(k, j, P, "+", "+"), O(k, j, P, "−", "-", !0), O(k, j, P, "⋅", "\\cdot", !0), O(k, j, P, "∘", "\\circ", !0), O(k, j, P, "÷", "\\div", !0), O(k, j, P, "±", "\\pm", !0), O(k, j, P, "×", "\\times", !0), O(k, j, P, "∩", "\\cap", !0), O(k, j, P, "∪", "\\cup", !0), O(k, j, P, "∖", "\\setminus", !0), O(k, j, P, "∧", "\\land"), O(k, j, P, "∨", "\\lor"), O(k, j, P, "∧", "\\wedge", !0), O(k, j, P, "∨", "\\vee", !0), O(k, j, L, "√", "\\surd"), O(k, j, Ft, "⟨", "\\langle", !0), O(k, j, Ft, "∣", "\\lvert"), O(k, j, Ft, "∥", "\\lVert"), O(k, j, Mt, "?", "?"), O(k, j, Mt, "!", "!"), O(k, j, Mt, "⟩", "\\rangle", !0), O(k, j, Mt, "∣", "\\rvert"), O(k, j, Mt, "∥", "\\rVert"), O(k, j, I, "=", "="), O(k, j, I, ":", ":"), O(k, j, I, "≈", "\\approx", !0), O(k, j, I, "≅", "\\cong", !0), O(k, j, I, "≥", "\\ge"), O(k, j, I, "≥", "\\geq", !0), O(k, j, I, "←", "\\gets"), O(k, j, I, ">", "\\gt", !0), O(k, j, I, "∈", "\\in", !0), O(k, j, I, "", "\\@not"), O(k, j, I, "⊂", "\\subset", !0), O(k, j, I, "⊃", "\\supset", !0), O(k, j, I, "⊆", "\\subseteq", !0), O(k, j, I, "⊇", "\\supseteq", !0), O(k, M, I, "⊈", "\\nsubseteq", !0), O(k, M, I, "⊉", "\\nsupseteq", !0), O(k, j, I, "⊨", "\\models"), O(k, j, I, "←", "\\leftarrow", !0), O(k, j, I, "≤", "\\le"), O(k, j, I, "≤", "\\leq", !0), O(k, j, I, "<", "\\lt", !0), O(k, j, I, "→", "\\rightarrow", !0), O(k, j, I, "→", "\\to"), O(k, M, I, "≱", "\\ngeq", !0), O(k, M, I, "≰", "\\nleq", !0), O(k, j, Lt, "\xA0", "\\ "), O(k, j, Lt, "\xA0", "\\space"), O(k, j, Lt, "\xA0", "\\nobreakspace"), O(A, j, Lt, "\xA0", "\\ "), O(A, j, Lt, "\xA0", " "), O(A, j, Lt, "\xA0", "\\space"), O(A, j, Lt, "\xA0", "\\nobreakspace"), O(k, j, Lt, "", "\\nobreak"), O(k, j, Lt, "", "\\allowbreak"), O(k, j, It, ",", ","), O(k, j, It, ";", ";"), O(k, M, P, "⊼", "\\barwedge", !0), O(k, M, P, "⊻", "\\veebar", !0), O(k, j, P, "⊙", "\\odot", !0), O(k, j, P, "⊕", "\\oplus", !0), O(k, j, P, "⊗", "\\otimes", !0), O(k, j, L, "∂", "\\partial", !0), O(k, j, P, "⊘", "\\oslash", !0), O(k, M, P, "⊚", "\\circledcirc", !0), O(k, M, P, "⊡", "\\boxdot", !0), O(k, j, P, "△", "\\bigtriangleup"), O(k, j, P, "▽", "\\bigtriangledown"), O(k, j, P, "†", "\\dagger"), O(k, j, P, "⋄", "\\diamond"), O(k, j, P, "⋆", "\\star"), O(k, j, P, "◃", "\\triangleleft"), O(k, j, P, "▹", "\\triangleright"), O(k, j, Ft, "{", "\\{"), O(A, j, L, "{", "\\{"), O(A, j, L, "{", "\\textbraceleft"), O(k, j, Mt, "}", "\\}"), O(A, j, L, "}", "\\}"), O(A, j, L, "}", "\\textbraceright"), O(k, j, Ft, "{", "\\lbrace"), O(k, j, Mt, "}", "\\rbrace"), O(k, j, Ft, "[", "\\lbrack", !0), O(A, j, L, "[", "\\lbrack", !0), O(k, j, Mt, "]", "\\rbrack", !0), O(A, j, L, "]", "\\rbrack", !0), O(k, j, Ft, "(", "\\lparen", !0), O(k, j, Mt, ")", "\\rparen", !0), O(A, j, L, "<", "\\textless", !0), O(A, j, L, ">", "\\textgreater", !0), O(k, j, Ft, "⌊", "\\lfloor", !0), O(k, j, Mt, "⌋", "\\rfloor", !0), O(k, j, Ft, "⌈", "\\lceil", !0), O(k, j, Mt, "⌉", "\\rceil", !0), O(k, j, L, "\\", "\\backslash"), O(k, j, L, "∣", "|"), O(k, j, L, "∣", "\\vert"), O(A, j, L, "|", "\\textbar", !0), O(k, j, L, "∥", "\\|"), O(k, j, L, "∥", "\\Vert"), O(A, j, L, "∥", "\\textbardbl"), O(A, j, L, "~", "\\textasciitilde"), O(A, j, L, "\\", "\\textbackslash"), O(A, j, L, "^", "\\textasciicircum"), O(k, j, I, "↑", "\\uparrow", !0), O(k, j, I, "⇑", "\\Uparrow", !0), O(k, j, I, "↓", "\\downarrow", !0), O(k, j, I, "⇓", "\\Downarrow", !0), O(k, j, I, "↕", "\\updownarrow", !0), O(k, j, I, "⇕", "\\Updownarrow", !0), O(k, j, Pt, "∐", "\\coprod"), O(k, j, Pt, "⋁", "\\bigvee"), O(k, j, Pt, "⋀", "\\bigwedge"), O(k, j, Pt, "⨄", "\\biguplus"), O(k, j, Pt, "⋂", "\\bigcap"), O(k, j, Pt, "⋃", "\\bigcup"), O(k, j, Pt, "∫", "\\int"), O(k, j, Pt, "∫", "\\intop"), O(k, j, Pt, "∬", "\\iint"), O(k, j, Pt, "∭", "\\iiint"), O(k, j, Pt, "∏", "\\prod"), O(k, j, Pt, "∑", "\\sum"), O(k, j, Pt, "⨂", "\\bigotimes"), O(k, j, Pt, "⨁", "\\bigoplus"), O(k, j, Pt, "⨀", "\\bigodot"), O(k, j, Pt, "∮", "\\oint"), O(k, j, Pt, "∯", "\\oiint"), O(k, j, Pt, "∰", "\\oiiint"), O(k, j, Pt, "⨆", "\\bigsqcup"), O(k, j, Pt, "∫", "\\smallint"), O(A, j, Nt, "…", "\\textellipsis"), O(k, j, Nt, "…", "\\mathellipsis"), O(A, j, Nt, "…", "\\ldots", !0), O(k, j, Nt, "…", "\\ldots", !0), O(k, j, Nt, "⋯", "\\@cdots", !0), O(k, j, Nt, "⋱", "\\ddots", !0), O(k, j, L, "⋮", "\\varvdots"), O(A, j, L, "⋮", "\\varvdots"), O(k, j, N, "ˊ", "\\acute"), O(k, j, N, "ˋ", "\\grave"), O(k, j, N, "¨", "\\ddot"), O(k, j, N, "~", "\\tilde"), O(k, j, N, "ˉ", "\\bar"), O(k, j, N, "˘", "\\breve"), O(k, j, N, "ˇ", "\\check"), O(k, j, N, "^", "\\hat"), O(k, j, N, "⃗", "\\vec"), O(k, j, N, "˙", "\\dot"), O(k, j, N, "˚", "\\mathring"), O(k, j, F, "", "\\@imath"), O(k, j, F, "", "\\@jmath"), O(k, j, L, "ı", "ı"), O(k, j, L, "ȷ", "ȷ"), O(A, j, L, "ı", "\\i", !0), O(A, j, L, "ȷ", "\\j", !0), O(A, j, L, "ß", "\\ss", !0), O(A, j, L, "æ", "\\ae", !0), O(A, j, L, "œ", "\\oe", !0), O(A, j, L, "ø", "\\o", !0), O(A, j, L, "Æ", "\\AE", !0), O(A, j, L, "Œ", "\\OE", !0), O(A, j, L, "Ø", "\\O", !0), O(A, j, N, "ˊ", "\\'"), O(A, j, N, "ˋ", "\\`"), O(A, j, N, "ˆ", "\\^"), O(A, j, N, "˜", "\\~"), O(A, j, N, "ˉ", "\\="), O(A, j, N, "˘", "\\u"), O(A, j, N, "˙", "\\."), O(A, j, N, "¸", "\\c"), O(A, j, N, "˚", "\\r"), O(A, j, N, "ˇ", "\\v"), O(A, j, N, "¨", "\\\""), O(A, j, N, "˝", "\\H"), O(A, j, N, "◯", "\\textcircled");
var Rt = {
	"--": !0,
	"---": !0,
	"``": !0,
	"''": !0
};
O(A, j, L, "–", "--", !0), O(A, j, L, "–", "\\textendash"), O(A, j, L, "—", "---", !0), O(A, j, L, "—", "\\textemdash"), O(A, j, L, "‘", "`", !0), O(A, j, L, "‘", "\\textquoteleft"), O(A, j, L, "’", "'", !0), O(A, j, L, "’", "\\textquoteright"), O(A, j, L, "“", "``", !0), O(A, j, L, "“", "\\textquotedblleft"), O(A, j, L, "”", "''", !0), O(A, j, L, "”", "\\textquotedblright"), O(k, j, L, "°", "\\degree", !0), O(A, j, L, "°", "\\degree"), O(A, j, L, "°", "\\textdegree", !0), O(k, j, L, "£", "\\pounds"), O(k, j, L, "£", "\\mathsterling", !0), O(A, j, L, "£", "\\pounds"), O(A, j, L, "£", "\\textsterling", !0), O(k, M, L, "✠", "\\maltese"), O(A, M, L, "✠", "\\maltese");
for (var zt = "0123456789/@.\"", Bt = 0; Bt < zt.length; Bt++) {
	var Vt = zt.charAt(Bt);
	O(k, j, L, Vt, Vt);
}
for (var Ht = "0123456789!@*()-=+\";:?/.,", Ut = 0; Ut < Ht.length; Ut++) {
	var Wt = Ht.charAt(Ut);
	O(A, j, L, Wt, Wt);
}
for (var Gt = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz", Kt = 0; Kt < Gt.length; Kt++) {
	var qt = Gt.charAt(Kt);
	O(k, j, F, qt, qt), O(A, j, L, qt, qt);
}
O(k, M, L, "C", "ℂ"), O(A, M, L, "C", "ℂ"), O(k, M, L, "H", "ℍ"), O(A, M, L, "H", "ℍ"), O(k, M, L, "N", "ℕ"), O(A, M, L, "N", "ℕ"), O(k, M, L, "P", "ℙ"), O(A, M, L, "P", "ℙ"), O(k, M, L, "Q", "ℚ"), O(A, M, L, "Q", "ℚ"), O(k, M, L, "R", "ℝ"), O(A, M, L, "R", "ℝ"), O(k, M, L, "Z", "ℤ"), O(A, M, L, "Z", "ℤ"), O(k, j, F, "h", "ℎ"), O(A, j, F, "h", "ℎ");
for (var R, Jt = 0; Jt < Gt.length; Jt++) {
	var Yt = Gt.charAt(Jt);
	R = String.fromCharCode(55349, 56320 + Jt), O(k, j, F, Yt, R), O(A, j, L, Yt, R), R = String.fromCharCode(55349, 56372 + Jt), O(k, j, F, Yt, R), O(A, j, L, Yt, R), R = String.fromCharCode(55349, 56424 + Jt), O(k, j, F, Yt, R), O(A, j, L, Yt, R), R = String.fromCharCode(55349, 56580 + Jt), O(k, j, F, Yt, R), O(A, j, L, Yt, R), R = String.fromCharCode(55349, 56684 + Jt), O(k, j, F, Yt, R), O(A, j, L, Yt, R), R = String.fromCharCode(55349, 56736 + Jt), O(k, j, F, Yt, R), O(A, j, L, Yt, R), R = String.fromCharCode(55349, 56788 + Jt), O(k, j, F, Yt, R), O(A, j, L, Yt, R), R = String.fromCharCode(55349, 56840 + Jt), O(k, j, F, Yt, R), O(A, j, L, Yt, R), R = String.fromCharCode(55349, 56944 + Jt), O(k, j, F, Yt, R), O(A, j, L, Yt, R), Jt < 26 && (R = String.fromCharCode(55349, 56632 + Jt), O(k, j, F, Yt, R), O(A, j, L, Yt, R), R = String.fromCharCode(55349, 56476 + Jt), O(k, j, F, Yt, R), O(A, j, L, Yt, R));
}
R = String.fromCharCode(55349, 56668), O(k, j, F, "k", R), O(A, j, L, "k", R);
for (var Xt = 0; Xt < 10; Xt++) {
	var Zt = Xt.toString();
	R = String.fromCharCode(55349, 57294 + Xt), O(k, j, F, Zt, R), O(A, j, L, Zt, R), R = String.fromCharCode(55349, 57314 + Xt), O(k, j, F, Zt, R), O(A, j, L, Zt, R), R = String.fromCharCode(55349, 57324 + Xt), O(k, j, F, Zt, R), O(A, j, L, Zt, R), R = String.fromCharCode(55349, 57334 + Xt), O(k, j, F, Zt, R), O(A, j, L, Zt, R);
}
for (var Qt = "ÐÞþ", $t = 0; $t < Qt.length; $t++) {
	var en = Qt.charAt($t);
	O(k, j, F, en, en), O(A, j, L, en, en);
}
var tn = {
	mathClass: "mathbf",
	textClass: "textbf",
	font: "Main-Bold"
}, nn = {
	mathClass: "mathnormal",
	textClass: "textit",
	font: "Math-Italic"
}, rn = {
	mathClass: "boldsymbol",
	textClass: "boldsymbol",
	font: "Main-BoldItalic"
}, an = {
	mathClass: "mathscr",
	textClass: "textscr",
	font: "Script-Regular"
}, on = {
	mathClass: "",
	textClass: "",
	font: ""
}, sn = {
	mathClass: "mathfrak",
	textClass: "textfrak",
	font: "Fraktur-Regular"
}, cn = {
	mathClass: "mathbb",
	textClass: "textbb",
	font: "AMS-Regular"
}, ln = {
	mathClass: "mathboldfrak",
	textClass: "textboldfrak",
	font: "Fraktur-Regular"
}, un = {
	mathClass: "mathsf",
	textClass: "textsf",
	font: "SansSerif-Regular"
}, dn = {
	mathClass: "mathboldsf",
	textClass: "textboldsf",
	font: "SansSerif-Bold"
}, fn = {
	mathClass: "mathitsf",
	textClass: "textitsf",
	font: "SansSerif-Italic"
}, pn = {
	mathClass: "mathtt",
	textClass: "texttt",
	font: "Typewriter-Regular"
}, mn = [
	tn,
	tn,
	nn,
	nn,
	rn,
	rn,
	an,
	on,
	on,
	on,
	sn,
	sn,
	cn,
	cn,
	ln,
	ln,
	un,
	un,
	dn,
	dn,
	fn,
	fn,
	on,
	on,
	pn,
	pn
], hn = [
	tn,
	on,
	un,
	dn,
	pn
], gn = (e) => {
	var t = e.charCodeAt(0), n = e.charCodeAt(1), r = (t - 55296) * 1024 + (n - 56320) + 65536;
	if (119808 <= r && r < 120484) return mn[Math.floor((r - 119808) / 26)];
	if (120782 <= r && r <= 120831) return hn[Math.floor((r - 120782) / 10)];
	if (r === 120485 || r === 120486) return mn[0];
	if (120486 < r && r < 120782) return on;
	throw new C("Unsupported character: " + e);
}, _n = function(e, t, n) {
	if (D[n][e]) {
		var r = D[n][e].replace;
		r && (e = r);
	}
	return {
		value: e,
		metrics: kt(e, t, n)
	};
}, vn = function(e, t, n, r, i) {
	var a = _n(e, t, n), o = a.metrics;
	e = a.value;
	var s;
	if (o) {
		var c = o.italic;
		(n === "text" || r && r.font === "mathit") && (c = 0), s = new yt(e, o.height, o.depth, c, o.skew, o.width, i);
	} else typeof console < "u" && console.warn("No character metrics " + ("for '" + e + "' in style '" + t + "' and mode '" + n + "'")), s = new yt(e, 0, 0, 0, 0, 0, i);
	if (r) {
		s.maxFontSize = r.sizeMultiplier, r.style.isTight() && s.classes.push("mtight");
		var l = r.getColor();
		l && (s.style.color = l);
	}
	return s;
}, yn = function(e, t, n, r) {
	return r === void 0 && (r = []), n.font === "boldsymbol" && _n(e, "Main-Bold", t).metrics ? vn(e, "Main-Bold", t, n, r.concat(["mathbf"])) : e === "\\" || D[t][e].font === "main" ? vn(e, "Main-Regular", t, n, r) : vn(e, "AMS-Regular", t, n, r.concat(["amsrm"]));
}, bn = function(e, t, n) {
	return n !== "textord" && _n(e, "Math-BoldItalic", t).metrics ? {
		fontName: "Math-BoldItalic",
		fontClass: "boldsymbol"
	} : {
		fontName: "Main-Bold",
		fontClass: "mathbf"
	};
}, xn = function(e, t, n) {
	var r = e.mode, i = e.text, a = ["mord"], { font: o, fontFamily: s, fontWeight: c, fontShape: l } = t, u = r === "math" || r === "text" && !!o, d = u ? o : s, f = "", p = "";
	if (i.charCodeAt(0) === 55349) {
		var m = gn(i);
		f = m.font, p = m[r + "Class"];
	}
	if (f) return vn(i, f, r, t, a.concat(p));
	if (d) {
		var h, g;
		if (d === "boldsymbol") {
			var _ = bn(i, r, n);
			h = _.fontName, g = [_.fontClass];
		} else u ? (h = Nn[o].fontName, g = [o]) : (h = Mn(s, c, l), g = [
			s,
			c,
			l
		]);
		if (_n(i, h, r).metrics) return vn(i, h, r, t, a.concat(g));
		if (Rt.hasOwnProperty(i) && h.slice(0, 10) === "Typewriter") {
			for (var v = [], y = 0; y < i.length; y++) v.push(vn(i[y], h, r, t, a.concat(g)));
			return On(v);
		}
	}
	if (n === "mathord") return vn(i, "Math-Italic", r, t, a.concat(["mathnormal"]));
	if (n === "textord") {
		var b = D[r][i] && D[r][i].font;
		if (b === "ams") return vn(i, Mn("amsrm", c, l), r, t, a.concat("amsrm", c, l));
		if (b === "main" || !b) return vn(i, Mn("textrm", c, l), r, t, a.concat(c, l));
		var x = Mn(b, c, l);
		return vn(i, x, r, t, a.concat(x, c, l));
	} else throw Error("unexpected type: " + n + " in makeOrd");
}, Sn = (e, t) => {
	if (lt(e.classes) !== lt(t.classes) || e.skew !== t.skew || e.maxFontSize !== t.maxFontSize || e.italic !== 0 && e.hasClass("mathnormal")) return !1;
	if (e.classes.length === 1) {
		var n = e.classes[0];
		if (n === "mbin" || n === "mord") return !1;
	}
	for (var r of Object.keys(e.style)) if (e.style[r] !== t.style[r]) return !1;
	for (var i of Object.keys(t.style)) if (e.style[i] !== t.style[i]) return !1;
	return !0;
}, Cn = (e) => {
	for (var t = 0; t < e.length - 1; t++) {
		var n = e[t], r = e[t + 1];
		n instanceof yt && r instanceof yt && Sn(n, r) && (n.text += r.text, n.height = Math.max(n.height, r.height), n.depth = Math.max(n.depth, r.depth), n.italic = r.italic, e.splice(t + 1, 1), t--);
	}
	return e;
}, wn = function(e) {
	for (var t = 0, n = 0, r = 0, i = 0; i < e.children.length; i++) {
		var a = e.children[i];
		a.height > t && (t = a.height), a.depth > n && (n = a.depth), a.maxFontSize > r && (r = a.maxFontSize);
	}
	e.height = t, e.depth = n, e.maxFontSize = r;
}, z = function(e, t, n, r) {
	var i = new ht(e, t, n, r);
	return wn(i), i;
}, Tn = (e, t, n, r) => new ht(e, t, n, r), En = function(e, t, n) {
	var r = z([e], [], t);
	return r.height = Math.max(n || t.fontMetrics().defaultRuleThickness, t.minRuleThickness), r.style.borderBottomWidth = E(r.height), r.maxFontSize = 1, r;
}, Dn = function(e, t, n, r) {
	var i = new gt(e, t, n, r);
	return wn(i), i;
}, On = function(e) {
	var t = new at(e);
	return wn(t), t;
}, kn = function(e, t) {
	return e instanceof at ? z([], [e], t) : e;
}, An = function(e) {
	if (e.positionType === "individualShift") {
		for (var t = e.children, n = [t[0]], r = -t[0].shift - t[0].elem.depth, i = r, a = 1; a < t.length; a++) {
			var o = -t[a].shift - i - t[a].elem.depth, s = o - (t[a - 1].elem.height + t[a - 1].elem.depth);
			i += o, n.push({
				type: "kern",
				size: s
			}), n.push(t[a]);
		}
		return {
			children: n,
			depth: r
		};
	}
	var c;
	if (e.positionType === "top") {
		for (var l = e.positionData, u = 0; u < e.children.length; u++) {
			var d = e.children[u];
			l -= d.type === "kern" ? d.size : d.elem.height + d.elem.depth;
		}
		c = l;
	} else if (e.positionType === "bottom") c = -e.positionData;
	else {
		var f = e.children[0];
		if (f.type !== "elem") throw Error("First child must have type \"elem\".");
		if (e.positionType === "shift") c = -f.elem.depth - e.positionData;
		else if (e.positionType === "firstBaseline") c = -f.elem.depth;
		else throw Error("Invalid positionType " + e.positionType + ".");
	}
	return {
		children: e.children,
		depth: c
	};
}, B = function(e, t) {
	for (var { children: n, depth: r } = An(e), i = 0, a = 0; a < n.length; a++) {
		var o = n[a];
		if (o.type === "elem") {
			var s = o.elem;
			i = Math.max(i, s.maxFontSize, s.height);
		}
	}
	i += 2;
	var c = z(["pstrut"], []);
	c.style.height = E(i);
	for (var l = [], u = r, d = r, f = r, p = 0; p < n.length; p++) {
		var m = n[p];
		if (m.type === "kern") f += m.size;
		else {
			var h = m.elem, g = m.wrapperClasses || [], _ = m.wrapperStyle || {}, v = z(g, [c, h], void 0, _);
			v.style.top = E(-i - f - h.depth), m.marginLeft && (v.style.marginLeft = m.marginLeft), m.marginRight && (v.style.marginRight = m.marginRight), l.push(v), f += h.height + h.depth;
		}
		u = Math.min(u, f), d = Math.max(d, f);
	}
	var y = z(["vlist"], l);
	y.style.height = E(d);
	var b;
	if (u < 0) {
		var x = z(["vlist"], [z([], [])]);
		x.style.height = E(-u), b = [z(["vlist-r"], [y, z(["vlist-s"], [new yt("​")])]), z(["vlist-r"], [x])];
	} else b = [z(["vlist-r"], [y])];
	var S = z(["vlist-t"], b);
	return b.length === 2 && S.classes.push("vlist-t2"), S.height = d, S.depth = -u, S;
}, jn = (e, t) => {
	var n = z(["mspace"], [], t), r = T(e, t);
	return n.style.marginRight = E(r), n;
}, Mn = (e, t, n) => {
	var r, i;
	switch (e) {
		case "amsrm":
			r = "AMS";
			break;
		case "textrm":
			r = "Main";
			break;
		case "textsf":
			r = "SansSerif";
			break;
		case "texttt":
			r = "Typewriter";
			break;
		default: r = e;
	}
	return i = t === "textbf" && n === "textit" ? "BoldItalic" : t === "textbf" ? "Bold" : n === "textit" ? "Italic" : "Regular", r + "-" + i;
}, Nn = {
	mathbf: {
		variant: "bold",
		fontName: "Main-Bold"
	},
	mathrm: {
		variant: "normal",
		fontName: "Main-Regular"
	},
	textit: {
		variant: "italic",
		fontName: "Main-Italic"
	},
	mathit: {
		variant: "italic",
		fontName: "Main-Italic"
	},
	mathnormal: {
		variant: "italic",
		fontName: "Math-Italic"
	},
	mathsfit: {
		variant: "sans-serif-italic",
		fontName: "SansSerif-Italic"
	},
	mathbb: {
		variant: "double-struck",
		fontName: "AMS-Regular"
	},
	mathcal: {
		variant: "script",
		fontName: "Caligraphic-Regular"
	},
	mathfrak: {
		variant: "fraktur",
		fontName: "Fraktur-Regular"
	},
	mathscr: {
		variant: "script",
		fontName: "Script-Regular"
	},
	mathsf: {
		variant: "sans-serif",
		fontName: "SansSerif-Regular"
	},
	mathtt: {
		variant: "monospace",
		fontName: "Typewriter-Regular"
	}
}, Pn = {
	vec: [
		"vec",
		.471,
		.714
	],
	oiintSize1: [
		"oiintSize1",
		.957,
		.499
	],
	oiintSize2: [
		"oiintSize2",
		1.472,
		.659
	],
	oiiintSize1: [
		"oiiintSize1",
		1.304,
		.499
	],
	oiiintSize2: [
		"oiiintSize2",
		1.98,
		.659
	]
}, Fn = function(e, t) {
	var [n, r, i] = Pn[e], a = Tn(["overlay"], [new bt([new xt(n)], {
		width: E(r),
		height: E(i),
		style: "width:" + E(r),
		viewBox: "0 0 " + 1e3 * r + " " + 1e3 * i,
		preserveAspectRatio: "xMinYMin"
	})], t);
	return a.height = i, a.style.height = E(i), a.style.width = E(r), a;
}, V = {
	number: 3,
	unit: "mu"
}, In = {
	number: 4,
	unit: "mu"
}, Ln = {
	number: 5,
	unit: "mu"
}, Rn = {
	mord: {
		mop: V,
		mbin: In,
		mrel: Ln,
		minner: V
	},
	mop: {
		mord: V,
		mop: V,
		mrel: Ln,
		minner: V
	},
	mbin: {
		mord: In,
		mop: In,
		mopen: In,
		minner: In
	},
	mrel: {
		mord: Ln,
		mop: Ln,
		mopen: Ln,
		minner: Ln
	},
	mopen: {},
	mclose: {
		mop: V,
		mbin: In,
		mrel: Ln,
		minner: V
	},
	mpunct: {
		mord: V,
		mop: V,
		mrel: Ln,
		mopen: V,
		mclose: V,
		mpunct: V,
		minner: V
	},
	minner: {
		mord: V,
		mop: V,
		mbin: In,
		mrel: Ln,
		mopen: V,
		mpunct: V,
		minner: V
	}
}, zn = {
	mord: { mop: V },
	mop: {
		mord: V,
		mop: V
	},
	mbin: {},
	mrel: {},
	mopen: {},
	mclose: { mop: V },
	mpunct: {},
	minner: { mop: V }
}, Bn = {}, Vn = {}, Hn = {};
function H(e) {
	for (var { type: t, names: n, props: r, handler: i, htmlBuilder: a, mathmlBuilder: o } = e, s = {
		type: t,
		numArgs: r.numArgs,
		argTypes: r.argTypes,
		allowedInArgument: !!r.allowedInArgument,
		allowedInText: !!r.allowedInText,
		allowedInMath: r.allowedInMath === void 0 ? !0 : r.allowedInMath,
		numOptionalArgs: r.numOptionalArgs || 0,
		infix: !!r.infix,
		primitive: !!r.primitive,
		handler: i
	}, c = 0; c < n.length; ++c) Bn[n[c]] = s;
	t && (a && (Vn[t] = a), o && (Hn[t] = o));
}
function Un(e) {
	var { type: t, htmlBuilder: n, mathmlBuilder: r } = e;
	H({
		type: t,
		names: [],
		props: { numArgs: 0 },
		handler() {
			throw Error("Should never be called.");
		},
		htmlBuilder: n,
		mathmlBuilder: r
	});
}
var Wn = function(e) {
	return e.type === "ordgroup" && e.body.length === 1 ? e.body[0] : e;
}, Gn = function(e) {
	return e.type === "ordgroup" ? e.body : [e];
}, Kn = new Set([
	"leftmost",
	"mbin",
	"mopen",
	"mrel",
	"mop",
	"mpunct"
]), qn = new Set([
	"rightmost",
	"mrel",
	"mclose",
	"mpunct"
]), Jn = {
	display: w.DISPLAY,
	text: w.TEXT,
	script: w.SCRIPT,
	scriptscript: w.SCRIPTSCRIPT
}, Yn = {
	mord: "mord",
	mop: "mop",
	mbin: "mbin",
	mrel: "mrel",
	mopen: "mopen",
	mclose: "mclose",
	mpunct: "mpunct",
	minner: "minner"
}, Xn = function(e, t, n, r) {
	r === void 0 && (r = [null, null]);
	for (var i = [], a = 0; a < e.length; a++) {
		var o = U(e[a], t);
		if (o instanceof at) {
			var s = o.children;
			i.push(...s);
		} else i.push(o);
	}
	if (Cn(i), !n) return i;
	var c = t;
	if (e.length === 1) {
		var l = e[0];
		l.type === "sizing" ? c = t.havingSize(l.size) : l.type === "styling" && (c = t.havingStyle(Jn[l.style]));
	}
	var u = z([r[0] || "leftmost"], [], t), d = z([r[1] || "rightmost"], [], t), f = n === "root";
	return Zn(i, (e, t) => {
		var n = t.classes[0], r = e.classes[0];
		n === "mbin" && qn.has(r) ? t.classes[0] = "mord" : r === "mbin" && Kn.has(n) && (e.classes[0] = "mord");
	}, { node: u }, d, f), Zn(i, (e, t) => {
		var n = er(t), r = er(e), i = n && r ? e.hasClass("mtight") ? zn[n]?.[r] : Rn[n]?.[r] : null;
		if (i) return jn(i, c);
	}, { node: u }, d, f), i;
}, Zn = function(e, t, n, r, i) {
	r && e.push(r);
	for (var a = 0; a < e.length; a++) {
		var o = e[a], s = Qn(o);
		if (s) {
			Zn(s.children, t, n, null, i);
			continue;
		}
		var c = !o.hasClass("mspace");
		if (c) {
			var l = t(o, n.node);
			l && (n.insertAfter ? n.insertAfter(l) : (e.unshift(l), a++));
		}
		c ? n.node = o : i && o.hasClass("newline") && (n.node = z(["leftmost"])), n.insertAfter = ((t) => (n) => {
			e.splice(t + 1, 0, n), a++;
		})(a);
	}
	r && e.pop();
}, Qn = function(e) {
	return e instanceof at || e instanceof gt || e instanceof ht && e.hasClass("enclosing") ? e : null;
}, $n = function(e, t) {
	var n = Qn(e);
	if (n) {
		var r = n.children;
		if (r.length) {
			if (t === "right") return $n(r[r.length - 1], "right");
			if (t === "left") return $n(r[0], "left");
		}
	}
	return e;
}, er = function(e, t) {
	return e ? (t && (e = $n(e, t)), Yn[e.classes[0]] || null) : null;
}, tr = function(e, t) {
	var n = ["nulldelimiter"].concat(e.baseSizingClasses());
	return z(t.concat(n));
}, U = function(e, t, n) {
	if (!e) return z();
	if (Vn[e.type]) {
		var r = Vn[e.type](e, t);
		if (n && t.size !== n.size) {
			r = z(t.sizingClasses(n), [r], t);
			var i = t.sizeMultiplier / n.sizeMultiplier;
			r.height *= i, r.depth *= i;
		}
		return r;
	} else throw new C("Got group of unknown type: '" + e.type + "'");
};
function nr(e) {
	return new at(e);
}
var W = class {
	constructor(e, t, n) {
		this.type = void 0, this.attributes = void 0, this.children = void 0, this.classes = void 0, this.type = e, this.attributes = {}, this.children = t || [], this.classes = n || [];
	}
	setAttribute(e, t) {
		this.attributes[e] = t;
	}
	getAttribute(e) {
		return this.attributes[e];
	}
	toNode() {
		var e = document.createElementNS("http://www.w3.org/1998/Math/MathML", this.type);
		for (var t in this.attributes) Object.prototype.hasOwnProperty.call(this.attributes, t) && e.setAttribute(t, this.attributes[t]);
		this.classes.length > 0 && (e.className = lt(this.classes));
		for (var n = 0; n < this.children.length; n++) if (this.children[n] instanceof rr && this.children[n + 1] instanceof rr) {
			for (var r = this.children[n].toText() + this.children[++n].toText(); this.children[n + 1] instanceof rr;) r += this.children[++n].toText();
			e.appendChild(new rr(r).toNode());
		} else e.appendChild(this.children[n].toNode());
		return e;
	}
	toMarkup() {
		var e = "<" + this.type;
		for (var t in this.attributes) Object.prototype.hasOwnProperty.call(this.attributes, t) && (e += " " + t + "=\"", e += xe(this.attributes[t]), e += "\"");
		this.classes.length > 0 && (e += " class =\"" + xe(lt(this.classes)) + "\""), e += ">";
		for (var n = 0; n < this.children.length; n++) e += this.children[n].toMarkup();
		return e += "</" + this.type + ">", e;
	}
	toText() {
		return this.children.map((e) => e.toText()).join("");
	}
}, rr = class {
	constructor(e) {
		this.text = void 0, this.text = e;
	}
	toNode() {
		return document.createTextNode(this.text);
	}
	toMarkup() {
		return xe(this.toText());
	}
	toText() {
		return this.text;
	}
}, ir = class {
	constructor(e) {
		this.width = void 0, this.character = void 0, this.width = e, e >= .05555 && e <= .05556 ? this.character = " " : e >= .1666 && e <= .1667 ? this.character = " " : e >= .2222 && e <= .2223 ? this.character = " " : e >= .2777 && e <= .2778 ? this.character = "  " : e >= -.05556 && e <= -.05555 ? this.character = " ⁣" : e >= -.1667 && e <= -.1666 ? this.character = " ⁣" : e >= -.2223 && e <= -.2222 ? this.character = " ⁣" : e >= -.2778 && e <= -.2777 ? this.character = " ⁣" : this.character = null;
	}
	toNode() {
		if (this.character) return document.createTextNode(this.character);
		var e = document.createElementNS("http://www.w3.org/1998/Math/MathML", "mspace");
		return e.setAttribute("width", E(this.width)), e;
	}
	toMarkup() {
		return this.character ? "<mtext>" + this.character + "</mtext>" : "<mspace width=\"" + E(this.width) + "\"/>";
	}
	toText() {
		return this.character ? this.character : " ";
	}
}, ar = new Set(["\\imath", "\\jmath"]);
new Set(["mrow", "mtable"]);
var or = function(e, t, n) {
	return D[t][e] && D[t][e].replace && e.charCodeAt(0) !== 55349 && !(Rt.hasOwnProperty(e) && n && (n.fontFamily && n.fontFamily.slice(4, 6) === "tt" || n.font && n.font.slice(4, 6) === "tt")) && (e = D[t][e].replace), new rr(e);
}, sr = function(e) {
	return e.length === 1 ? e[0] : new W("mrow", e);
}, cr = {
	mathit: "italic",
	boldsymbol: (e) => e.type === "textord" ? "bold" : "bold-italic",
	mathbf: "bold",
	mathbb: "double-struck",
	mathsfit: "sans-serif-italic",
	mathfrak: "fraktur",
	mathscr: "script",
	mathcal: "script",
	mathsf: "sans-serif",
	mathtt: "monospace"
}, lr = (e, t) => {
	if (e.mode === "text") {
		if (t.fontFamily === "texttt") return "monospace";
		if (t.fontFamily === "textsf") return t.fontShape === "textit" && t.fontWeight === "textbf" ? "sans-serif-bold-italic" : t.fontShape === "textit" ? "sans-serif-italic" : t.fontWeight === "textbf" ? "bold-sans-serif" : "sans-serif";
		if (t.fontShape === "textit" && t.fontWeight === "textbf") return "bold-italic";
		if (t.fontShape === "textit") return "italic";
		if (t.fontWeight === "textbf") return "bold";
	}
	var n = t.font;
	if (!n || n === "mathnormal") return null;
	var r = e.mode, i = cr[n];
	if (i) return typeof i == "function" ? i(e) : i;
	var a = e.text;
	if (ar.has(a)) return null;
	if (D[r][a]) {
		var o = D[r][a].replace;
		o && (a = o);
	}
	var s = Nn[n].fontName;
	return kt(a, s, r) ? Nn[n].variant : null;
};
function ur(e) {
	if (!e) return !1;
	if (e.type === "mi" && e.children.length === 1) {
		var t = e.children[0];
		return t instanceof rr && t.text === ".";
	} else if (e.type === "mo" && e.children.length === 1 && e.getAttribute("separator") === "true" && e.getAttribute("lspace") === "0em" && e.getAttribute("rspace") === "0em") {
		var n = e.children[0];
		return n instanceof rr && n.text === ",";
	} else return !1;
}
var dr = function(e, t, n) {
	if (e.length === 1) {
		var r = G(e[0], t);
		return n && r instanceof W && r.type === "mo" && (r.setAttribute("lspace", "0em"), r.setAttribute("rspace", "0em")), [r];
	}
	for (var i = [], a, o = 0; o < e.length; o++) {
		var s = G(e[o], t);
		if (s instanceof W && a instanceof W) {
			if (s.type === "mtext" && a.type === "mtext" && s.getAttribute("mathvariant") === a.getAttribute("mathvariant")) {
				a.children.push(...s.children);
				continue;
			} else if (s.type === "mn" && a.type === "mn") {
				a.children.push(...s.children);
				continue;
			} else if (ur(s) && a.type === "mn") {
				a.children.push(...s.children);
				continue;
			} else if (s.type === "mn" && ur(a)) s.children = [...a.children, ...s.children], i.pop();
			else if ((s.type === "msup" || s.type === "msub") && s.children.length >= 1 && (a.type === "mn" || ur(a))) {
				var c = s.children[0];
				c instanceof W && c.type === "mn" && (c.children = [...a.children, ...c.children], i.pop());
			} else if (a.type === "mi" && a.children.length === 1) {
				var l = a.children[0];
				if (l instanceof rr && l.text === "̸" && (s.type === "mo" || s.type === "mi" || s.type === "mn")) {
					var u = s.children[0];
					u instanceof rr && u.text.length > 0 && (u.text = u.text.slice(0, 1) + "̸" + u.text.slice(1), i.pop());
				}
			}
		}
		i.push(s), a = s;
	}
	return i;
}, fr = function(e, t, n) {
	return sr(dr(e, t, n));
}, G = function(e, t) {
	if (!e) return new W("mrow");
	if (Hn[e.type]) return Hn[e.type](e, t);
	throw new C("Got group of unknown type: '" + e.type + "'");
}, pr = [
	[
		1,
		1,
		1
	],
	[
		2,
		1,
		1
	],
	[
		3,
		1,
		1
	],
	[
		4,
		2,
		1
	],
	[
		5,
		2,
		1
	],
	[
		6,
		3,
		1
	],
	[
		7,
		4,
		2
	],
	[
		8,
		6,
		3
	],
	[
		9,
		7,
		6
	],
	[
		10,
		8,
		7
	],
	[
		11,
		10,
		9
	]
], mr = [
	.5,
	.6,
	.7,
	.8,
	.9,
	1,
	1.2,
	1.44,
	1.728,
	2.074,
	2.488
], hr = function(e, t) {
	return t.size < 2 ? e : pr[e - 1][t.size - 1];
}, gr = class e {
	constructor(t) {
		this.style = void 0, this.color = void 0, this.size = void 0, this.textSize = void 0, this.phantom = void 0, this.font = void 0, this.fontFamily = void 0, this.fontWeight = void 0, this.fontShape = void 0, this.sizeMultiplier = void 0, this.maxSize = void 0, this.minRuleThickness = void 0, this._fontMetrics = void 0, this.style = t.style, this.color = t.color, this.size = t.size || e.BASESIZE, this.textSize = t.textSize || this.size, this.phantom = !!t.phantom, this.font = t.font || "", this.fontFamily = t.fontFamily || "", this.fontWeight = t.fontWeight || "", this.fontShape = t.fontShape || "", this.sizeMultiplier = mr[this.size - 1], this.maxSize = t.maxSize, this.minRuleThickness = t.minRuleThickness, this._fontMetrics = void 0;
	}
	extend(t) {
		var n = {
			style: this.style,
			size: this.size,
			textSize: this.textSize,
			color: this.color,
			phantom: this.phantom,
			font: this.font,
			fontFamily: this.fontFamily,
			fontWeight: this.fontWeight,
			fontShape: this.fontShape,
			maxSize: this.maxSize,
			minRuleThickness: this.minRuleThickness
		};
		return Object.assign(n, t), new e(n);
	}
	havingStyle(e) {
		return this.style === e ? this : this.extend({
			style: e,
			size: hr(this.textSize, e)
		});
	}
	havingCrampedStyle() {
		return this.havingStyle(this.style.cramp());
	}
	havingSize(e) {
		return this.size === e && this.textSize === e ? this : this.extend({
			style: this.style.text(),
			size: e,
			textSize: e,
			sizeMultiplier: mr[e - 1]
		});
	}
	havingBaseStyle(t) {
		t ||= this.style.text();
		var n = hr(e.BASESIZE, t);
		return this.size === n && this.textSize === e.BASESIZE && this.style === t ? this : this.extend({
			style: t,
			size: n
		});
	}
	havingBaseSizing() {
		var e;
		switch (this.style.id) {
			case 4:
			case 5:
				e = 3;
				break;
			case 6:
			case 7:
				e = 1;
				break;
			default: e = 6;
		}
		return this.extend({
			style: this.style.text(),
			size: e
		});
	}
	withColor(e) {
		return this.extend({ color: e });
	}
	withPhantom() {
		return this.extend({ phantom: !0 });
	}
	withFont(e) {
		return this.extend({ font: e });
	}
	withTextFontFamily(e) {
		return this.extend({
			fontFamily: e,
			font: ""
		});
	}
	withTextFontWeight(e) {
		return this.extend({
			fontWeight: e,
			font: ""
		});
	}
	withTextFontShape(e) {
		return this.extend({
			fontShape: e,
			font: ""
		});
	}
	sizingClasses(e) {
		return e.size === this.size ? [] : [
			"sizing",
			"reset-size" + e.size,
			"size" + this.size
		];
	}
	baseSizingClasses() {
		return this.size === e.BASESIZE ? [] : [
			"sizing",
			"reset-size" + this.size,
			"size" + e.BASESIZE
		];
	}
	fontMetrics() {
		return this._fontMetrics ||= jt(this.size), this._fontMetrics;
	}
	getColor() {
		return this.phantom ? "transparent" : this.color;
	}
};
gr.BASESIZE = 6;
var _r = {
	widehat: "^",
	widecheck: "ˇ",
	widetilde: "~",
	utilde: "~",
	overleftarrow: "←",
	underleftarrow: "←",
	xleftarrow: "←",
	overrightarrow: "→",
	underrightarrow: "→",
	xrightarrow: "→",
	underbrace: "⏟",
	overbrace: "⏞",
	underbracket: "⎵",
	overbracket: "⎴",
	overgroup: "⏠",
	undergroup: "⏡",
	overleftrightarrow: "↔",
	underleftrightarrow: "↔",
	xleftrightarrow: "↔",
	Overrightarrow: "⇒",
	xRightarrow: "⇒",
	overleftharpoon: "↼",
	xleftharpoonup: "↼",
	overrightharpoon: "⇀",
	xrightharpoonup: "⇀",
	xLeftarrow: "⇐",
	xLeftrightarrow: "⇔",
	xhookleftarrow: "↩",
	xhookrightarrow: "↪",
	xmapsto: "↦",
	xrightharpoondown: "⇁",
	xleftharpoondown: "↽",
	xrightleftharpoons: "⇌",
	xleftrightharpoons: "⇋",
	xtwoheadleftarrow: "↞",
	xtwoheadrightarrow: "↠",
	xlongequal: "=",
	xtofrom: "⇄",
	xrightleftarrows: "⇄",
	xrightequilibrium: "⇌",
	xleftequilibrium: "⇋",
	"\\cdrightarrow": "→",
	"\\cdleftarrow": "←",
	"\\cdlongequal": "="
}, vr = function(e) {
	var t = new W("mo", [new rr(_r[e.replace(/^\\/, "")])]);
	return t.setAttribute("stretchy", "true"), t;
}, yr = {
	overrightarrow: [
		["rightarrow"],
		.888,
		522,
		"xMaxYMin"
	],
	overleftarrow: [
		["leftarrow"],
		.888,
		522,
		"xMinYMin"
	],
	underrightarrow: [
		["rightarrow"],
		.888,
		522,
		"xMaxYMin"
	],
	underleftarrow: [
		["leftarrow"],
		.888,
		522,
		"xMinYMin"
	],
	xrightarrow: [
		["rightarrow"],
		1.469,
		522,
		"xMaxYMin"
	],
	"\\cdrightarrow": [
		["rightarrow"],
		3,
		522,
		"xMaxYMin"
	],
	xleftarrow: [
		["leftarrow"],
		1.469,
		522,
		"xMinYMin"
	],
	"\\cdleftarrow": [
		["leftarrow"],
		3,
		522,
		"xMinYMin"
	],
	Overrightarrow: [
		["doublerightarrow"],
		.888,
		560,
		"xMaxYMin"
	],
	xRightarrow: [
		["doublerightarrow"],
		1.526,
		560,
		"xMaxYMin"
	],
	xLeftarrow: [
		["doubleleftarrow"],
		1.526,
		560,
		"xMinYMin"
	],
	overleftharpoon: [
		["leftharpoon"],
		.888,
		522,
		"xMinYMin"
	],
	xleftharpoonup: [
		["leftharpoon"],
		.888,
		522,
		"xMinYMin"
	],
	xleftharpoondown: [
		["leftharpoondown"],
		.888,
		522,
		"xMinYMin"
	],
	overrightharpoon: [
		["rightharpoon"],
		.888,
		522,
		"xMaxYMin"
	],
	xrightharpoonup: [
		["rightharpoon"],
		.888,
		522,
		"xMaxYMin"
	],
	xrightharpoondown: [
		["rightharpoondown"],
		.888,
		522,
		"xMaxYMin"
	],
	xlongequal: [
		["longequal"],
		.888,
		334,
		"xMinYMin"
	],
	"\\cdlongequal": [
		["longequal"],
		3,
		334,
		"xMinYMin"
	],
	xtwoheadleftarrow: [
		["twoheadleftarrow"],
		.888,
		334,
		"xMinYMin"
	],
	xtwoheadrightarrow: [
		["twoheadrightarrow"],
		.888,
		334,
		"xMaxYMin"
	],
	overleftrightarrow: [
		["leftarrow", "rightarrow"],
		.888,
		522
	],
	overbrace: [
		[
			"leftbrace",
			"midbrace",
			"rightbrace"
		],
		1.6,
		548
	],
	underbrace: [
		[
			"leftbraceunder",
			"midbraceunder",
			"rightbraceunder"
		],
		1.6,
		548
	],
	underleftrightarrow: [
		["leftarrow", "rightarrow"],
		.888,
		522
	],
	xleftrightarrow: [
		["leftarrow", "rightarrow"],
		1.75,
		522
	],
	xLeftrightarrow: [
		["doubleleftarrow", "doublerightarrow"],
		1.75,
		560
	],
	xrightleftharpoons: [
		["leftharpoondownplus", "rightharpoonplus"],
		1.75,
		716
	],
	xleftrightharpoons: [
		["leftharpoonplus", "rightharpoondownplus"],
		1.75,
		716
	],
	xhookleftarrow: [
		["leftarrow", "righthook"],
		1.08,
		522
	],
	xhookrightarrow: [
		["lefthook", "rightarrow"],
		1.08,
		522
	],
	overlinesegment: [
		["leftlinesegment", "rightlinesegment"],
		.888,
		522
	],
	underlinesegment: [
		["leftlinesegment", "rightlinesegment"],
		.888,
		522
	],
	overbracket: [
		["leftbracketover", "rightbracketover"],
		1.6,
		440
	],
	underbracket: [
		["leftbracketunder", "rightbracketunder"],
		1.6,
		410
	],
	overgroup: [
		["leftgroup", "rightgroup"],
		.888,
		342
	],
	undergroup: [
		["leftgroupunder", "rightgroupunder"],
		.888,
		342
	],
	xmapsto: [
		["leftmapsto", "rightarrow"],
		1.5,
		522
	],
	xtofrom: [
		["leftToFrom", "rightToFrom"],
		1.75,
		528
	],
	xrightleftarrows: [
		["baraboveleftarrow", "rightarrowabovebar"],
		1.75,
		901
	],
	xrightequilibrium: [
		["baraboveshortleftharpoon", "rightharpoonaboveshortbar"],
		1.75,
		716
	],
	xleftequilibrium: [
		["shortbaraboveleftharpoon", "shortrightharpoonabovebar"],
		1.75,
		716
	]
}, br = new Set([
	"widehat",
	"widecheck",
	"widetilde",
	"utilde"
]), xr = function(e, t) {
	function n() {
		var n = 4e5, r = e.label.slice(1);
		if (br.has(r) && "base" in e) {
			var i = e.base.type === "ordgroup" ? e.base.body.length : 1, a, o, s;
			if (i > 5) r === "widehat" || r === "widecheck" ? (a = 420, n = 2364, s = .42, o = r + "4") : (a = 312, n = 2340, s = .34, o = "tilde4");
			else {
				var c = [
					1,
					1,
					2,
					2,
					3,
					3
				][i];
				r === "widehat" || r === "widecheck" ? (n = [
					0,
					1062,
					2364,
					2364,
					2364
				][c], a = [
					0,
					239,
					300,
					360,
					420
				][c], s = [
					0,
					.24,
					.3,
					.3,
					.36,
					.42
				][c], o = r + c) : (n = [
					0,
					600,
					1033,
					2339,
					2340
				][c], a = [
					0,
					260,
					286,
					306,
					312
				][c], s = [
					0,
					.26,
					.286,
					.3,
					.306,
					.34
				][c], o = "tilde" + c);
			}
			return {
				span: Tn([], [new bt([new xt(o)], {
					width: "100%",
					height: E(s),
					viewBox: "0 0 " + n + " " + a,
					preserveAspectRatio: "none"
				})], t),
				minWidth: 0,
				height: s
			};
		} else {
			var l = [], u = yr[r];
			if (!u) throw Error("No SVG data for \"" + r + "\".");
			var [d, f, p] = u, m = p / 1e3, h = d.length, g, _;
			if (h === 1) {
				if (u.length !== 4) throw Error("Expected 4-tuple for single-path SVG data \"" + r + "\".");
				g = ["hide-tail"], _ = [u[3]];
			} else if (h === 2) g = ["halfarrow-left", "halfarrow-right"], _ = ["xMinYMin", "xMaxYMin"];
			else if (h === 3) g = [
				"brace-left",
				"brace-center",
				"brace-right"
			], _ = [
				"xMinYMin",
				"xMidYMin",
				"xMaxYMin"
			];
			else throw Error("Correct katexImagesData or update code here to support\n                    " + h + " children.");
			for (var v = 0; v < h; v++) {
				var y = new bt([new xt(d[v])], {
					width: "400em",
					height: E(m),
					viewBox: "0 0 " + n + " " + p,
					preserveAspectRatio: _[v] + " slice"
				}), b = Tn([g[v]], [y], t);
				if (h === 1) return {
					span: b,
					minWidth: f,
					height: m
				};
				b.style.height = E(m), l.push(b);
			}
			return {
				span: z(["stretchy"], l, t),
				minWidth: f,
				height: m
			};
		}
	}
	var { span: r, minWidth: i, height: a } = n();
	return r.height = a, r.style.height = E(a), i > 0 && (r.style.minWidth = E(i)), r;
}, Sr = function(e, t, n, r, i) {
	var a, o = e.height + e.depth + n + r;
	if (/fbox|color|angl/.test(t)) {
		if (a = z(["stretchy", t], [], i), t === "fbox") {
			var s = i.color && i.getColor();
			s && (a.style.borderColor = s);
		}
	} else {
		var c = [];
		/^[bx]cancel$/.test(t) && c.push(new St({
			x1: "0",
			y1: "0",
			x2: "100%",
			y2: "100%",
			"stroke-width": "0.046em"
		})), /^x?cancel$/.test(t) && c.push(new St({
			x1: "0",
			y1: "100%",
			x2: "100%",
			y2: "0",
			"stroke-width": "0.046em"
		})), a = Tn([], [new bt(c, {
			width: "100%",
			height: E(o)
		})], i);
	}
	return a.height = o, a.style.height = E(o), a;
}, Cr = {
	bin: 1,
	close: 1,
	inner: 1,
	open: 1,
	punct: 1,
	rel: 1
}, wr = {
	"accent-token": 1,
	mathord: 1,
	"op-token": 1,
	spacing: 1,
	textord: 1
};
function Tr(e) {
	return e in Cr;
}
function K(e, t) {
	if (!e || e.type !== t) throw Error("Expected node of type " + t + ", but got " + (e ? "node of type " + e.type : String(e)));
	return e;
}
function Er(e) {
	var t = Dr(e);
	if (!t) throw Error("Expected node of symbol group type, but got " + (e ? "node of type " + e.type : String(e)));
	return t;
}
function Dr(e) {
	return e && (e.type === "atom" || wr.hasOwnProperty(e.type)) ? e : null;
}
var Or = (e) => {
	if (e instanceof yt) return e;
	if (Tt(e) && e.children.length === 1) return Or(e.children[0]);
}, kr = (e, t) => {
	var n, r, i;
	e && e.type === "supsub" ? (r = K(e.base, "accent"), n = r.base, e.base = n, i = wt(U(e, t)), e.base = r) : (r = K(e, "accent"), n = r.base);
	var a = U(n, t.havingCrampedStyle()), o = r.isShifty && we(n), s = 0;
	o && (s = Or(a)?.skew ?? 0);
	var c = r.label === "\\c", l = c ? a.height + a.depth : Math.min(a.height, t.fontMetrics().xHeight), u;
	if (r.isStretchy) u = xr(r, t), u = B({
		positionType: "firstBaseline",
		children: [{
			type: "elem",
			elem: a
		}, {
			type: "elem",
			elem: u,
			wrapperClasses: ["svg-align"],
			wrapperStyle: s > 0 ? {
				width: "calc(100% - " + E(2 * s) + ")",
				marginLeft: E(2 * s)
			} : void 0
		}]
	});
	else {
		var d, f;
		r.label === "\\vec" ? (d = Fn("vec", t), f = Pn.vec[1]) : (d = xn({
			type: "textord",
			mode: r.mode,
			text: r.label
		}, t, "textord"), d = Ct(d), d.italic = 0, f = d.width, c && (l += d.depth)), u = z(["accent-body"], [d]);
		var p = r.label === "\\textcircled";
		p && (u.classes.push("accent-full"), l = a.height);
		var m = s;
		p || (m -= f / 2), u.style.left = E(m), r.label === "\\textcircled" && (u.style.top = ".2em"), u = B({
			positionType: "firstBaseline",
			children: [
				{
					type: "elem",
					elem: a
				},
				{
					type: "kern",
					size: -l
				},
				{
					type: "elem",
					elem: u
				}
			]
		});
	}
	var h = z(["mord", "accent"], [u], t);
	return i ? (i.children[0] = h, i.height = Math.max(h.height, i.height), i.classes[0] = "mord", i) : h;
}, Ar = (e, t) => {
	var n = e.isStretchy ? vr(e.label) : new W("mo", [or(e.label, e.mode)]), r = new W("mover", [G(e.base, t), n]);
	return r.setAttribute("accent", "true"), r;
}, jr = new RegExp([
	"\\acute",
	"\\grave",
	"\\ddot",
	"\\tilde",
	"\\bar",
	"\\breve",
	"\\check",
	"\\hat",
	"\\vec",
	"\\dot",
	"\\mathring"
].map((e) => "\\" + e).join("|"));
H({
	type: "accent",
	names: [
		"\\acute",
		"\\grave",
		"\\ddot",
		"\\tilde",
		"\\bar",
		"\\breve",
		"\\check",
		"\\hat",
		"\\vec",
		"\\dot",
		"\\mathring",
		"\\widecheck",
		"\\widehat",
		"\\widetilde",
		"\\overrightarrow",
		"\\overleftarrow",
		"\\Overrightarrow",
		"\\overleftrightarrow",
		"\\overgroup",
		"\\overlinesegment",
		"\\overleftharpoon",
		"\\overrightharpoon"
	],
	props: { numArgs: 1 },
	handler: (e, t) => {
		var n = Wn(t[0]), r = !jr.test(e.funcName), i = !r || e.funcName === "\\widehat" || e.funcName === "\\widetilde" || e.funcName === "\\widecheck";
		return {
			type: "accent",
			mode: e.parser.mode,
			label: e.funcName,
			isStretchy: r,
			isShifty: i,
			base: n
		};
	},
	htmlBuilder: kr,
	mathmlBuilder: Ar
}), H({
	type: "accent",
	names: [
		"\\'",
		"\\`",
		"\\^",
		"\\~",
		"\\=",
		"\\u",
		"\\.",
		"\\\"",
		"\\c",
		"\\r",
		"\\H",
		"\\v",
		"\\textcircled"
	],
	props: {
		numArgs: 1,
		allowedInText: !0,
		allowedInMath: !0,
		argTypes: ["primitive"]
	},
	handler: (e, t) => {
		var n = t[0], r = e.parser.mode;
		return r === "math" && (e.parser.settings.reportNonstrict("mathVsTextAccents", "LaTeX's accent " + e.funcName + " works only in text mode"), r = "text"), {
			type: "accent",
			mode: r,
			label: e.funcName,
			isStretchy: !1,
			isShifty: !0,
			base: n
		};
	},
	htmlBuilder: kr,
	mathmlBuilder: Ar
}), H({
	type: "accentUnder",
	names: [
		"\\underleftarrow",
		"\\underrightarrow",
		"\\underleftrightarrow",
		"\\undergroup",
		"\\underlinesegment",
		"\\utilde"
	],
	props: { numArgs: 1 },
	handler: (e, t) => {
		var { parser: n, funcName: r } = e, i = t[0];
		return {
			type: "accentUnder",
			mode: n.mode,
			label: r,
			base: i
		};
	},
	htmlBuilder: (e, t) => {
		var n = U(e.base, t), r = xr(e, t), i = e.label === "\\utilde" ? .12 : 0;
		return z(["mord", "accentunder"], [B({
			positionType: "top",
			positionData: n.height,
			children: [
				{
					type: "elem",
					elem: r,
					wrapperClasses: ["svg-align"]
				},
				{
					type: "kern",
					size: i
				},
				{
					type: "elem",
					elem: n
				}
			]
		})], t);
	},
	mathmlBuilder: (e, t) => {
		var n = vr(e.label), r = new W("munder", [G(e.base, t), n]);
		return r.setAttribute("accentunder", "true"), r;
	}
});
var Mr = (e) => {
	var t = new W("mpadded", e ? [e] : []);
	return t.setAttribute("width", "+0.6em"), t.setAttribute("lspace", "0.3em"), t;
};
H({
	type: "xArrow",
	names: [
		"\\xleftarrow",
		"\\xrightarrow",
		"\\xLeftarrow",
		"\\xRightarrow",
		"\\xleftrightarrow",
		"\\xLeftrightarrow",
		"\\xhookleftarrow",
		"\\xhookrightarrow",
		"\\xmapsto",
		"\\xrightharpoondown",
		"\\xrightharpoonup",
		"\\xleftharpoondown",
		"\\xleftharpoonup",
		"\\xrightleftharpoons",
		"\\xleftrightharpoons",
		"\\xlongequal",
		"\\xtwoheadrightarrow",
		"\\xtwoheadleftarrow",
		"\\xtofrom",
		"\\xrightleftarrows",
		"\\xrightequilibrium",
		"\\xleftequilibrium",
		"\\\\cdrightarrow",
		"\\\\cdleftarrow",
		"\\\\cdlongequal"
	],
	props: {
		numArgs: 1,
		numOptionalArgs: 1
	},
	handler(e, t, n) {
		var { parser: r, funcName: i } = e;
		return {
			type: "xArrow",
			mode: r.mode,
			label: i,
			body: t[0],
			below: n[0]
		};
	},
	htmlBuilder(e, t) {
		var n = t.style, r = t.havingStyle(n.sup()), i = kn(U(e.body, r, t), t), a = e.label.slice(0, 2) === "\\x" ? "x" : "cd";
		i.classes.push(a + "-arrow-pad");
		var o;
		e.below && (r = t.havingStyle(n.sub()), o = kn(U(e.below, r, t), t), o.classes.push(a + "-arrow-pad"));
		var s = xr(e, t), c = -t.fontMetrics().axisHeight + .5 * s.height, l = -t.fontMetrics().axisHeight - .5 * s.height - .111;
		(i.depth > .25 || e.label === "\\xleftequilibrium") && (l -= i.depth);
		var u;
		if (o) {
			var d = -t.fontMetrics().axisHeight + o.height + .5 * s.height + .111;
			u = B({
				positionType: "individualShift",
				children: [
					{
						type: "elem",
						elem: i,
						shift: l
					},
					{
						type: "elem",
						elem: s,
						shift: c,
						wrapperClasses: ["svg-align"]
					},
					{
						type: "elem",
						elem: o,
						shift: d
					}
				]
			});
		} else u = B({
			positionType: "individualShift",
			children: [{
				type: "elem",
				elem: i,
				shift: l
			}, {
				type: "elem",
				elem: s,
				shift: c,
				wrapperClasses: ["svg-align"]
			}]
		});
		return z(["mrel", "x-arrow"], [u], t);
	},
	mathmlBuilder(e, t) {
		var n = vr(e.label);
		n.setAttribute("minsize", e.label.charAt(0) === "x" ? "1.75em" : "3.0em");
		var r;
		if (e.body) {
			var i = Mr(G(e.body, t));
			r = e.below ? new W("munderover", [
				n,
				Mr(G(e.below, t)),
				i
			]) : new W("mover", [n, i]);
		} else e.below ? r = new W("munder", [n, Mr(G(e.below, t))]) : (r = Mr(), r = new W("mover", [n, r]));
		return r;
	}
});
function Nr(e, t) {
	var n = Xn(e.body, t, !0);
	return z([e.mclass], n, t);
}
function Pr(e, t) {
	var n, r = dr(e.body, t);
	return e.mclass === "minner" ? n = new W("mpadded", r) : e.mclass === "mord" ? e.isCharacterBox ? (n = r[0], n.type = "mi") : n = new W("mi", r) : (e.isCharacterBox ? (n = r[0], n.type = "mo") : n = new W("mo", r), e.mclass === "mbin" ? (n.attributes.lspace = "0.22em", n.attributes.rspace = "0.22em") : e.mclass === "mpunct" ? (n.attributes.lspace = "0em", n.attributes.rspace = "0.17em") : e.mclass === "mopen" || e.mclass === "mclose" ? (n.attributes.lspace = "0em", n.attributes.rspace = "0em") : e.mclass === "minner" && (n.attributes.lspace = "0.0556em", n.attributes.width = "+0.1111em")), n;
}
H({
	type: "mclass",
	names: [
		"\\mathord",
		"\\mathbin",
		"\\mathrel",
		"\\mathopen",
		"\\mathclose",
		"\\mathpunct",
		"\\mathinner"
	],
	props: {
		numArgs: 1,
		primitive: !0
	},
	handler(e, t) {
		var { parser: n, funcName: r } = e, i = t[0];
		return {
			type: "mclass",
			mode: n.mode,
			mclass: "m" + r.slice(5),
			body: Gn(i),
			isCharacterBox: we(i)
		};
	},
	htmlBuilder: Nr,
	mathmlBuilder: Pr
});
var Fr = (e) => {
	var t = e.type === "ordgroup" && e.body.length ? e.body[0] : e;
	return t.type === "atom" && (t.family === "bin" || t.family === "rel") ? "m" + t.family : "mord";
};
H({
	type: "mclass",
	names: ["\\@binrel"],
	props: { numArgs: 2 },
	handler(e, t) {
		var { parser: n } = e;
		return {
			type: "mclass",
			mode: n.mode,
			mclass: Fr(t[0]),
			body: Gn(t[1]),
			isCharacterBox: we(t[1])
		};
	}
}), H({
	type: "mclass",
	names: [
		"\\stackrel",
		"\\overset",
		"\\underset"
	],
	props: { numArgs: 2 },
	handler(e, t) {
		var { parser: n, funcName: r } = e, i = t[1], a = t[0], o = r === "\\stackrel" ? "mrel" : Fr(i), s = {
			type: "op",
			mode: i.mode,
			limits: !0,
			alwaysHandleSupSub: !0,
			parentIsSupSub: !1,
			symbol: !1,
			suppressBaseShift: r !== "\\stackrel",
			body: Gn(i)
		}, c = {
			type: "supsub",
			mode: a.mode,
			base: s,
			sup: r === "\\underset" ? null : a,
			sub: r === "\\underset" ? a : null
		};
		return {
			type: "mclass",
			mode: n.mode,
			mclass: o,
			body: [c],
			isCharacterBox: we(c)
		};
	},
	htmlBuilder: Nr,
	mathmlBuilder: Pr
}), H({
	type: "pmb",
	names: ["\\pmb"],
	props: {
		numArgs: 1,
		allowedInText: !0
	},
	handler(e, t) {
		var { parser: n } = e;
		return {
			type: "pmb",
			mode: n.mode,
			mclass: Fr(t[0]),
			body: Gn(t[0])
		};
	},
	htmlBuilder(e, t) {
		var n = Xn(e.body, t, !0), r = z([e.mclass], n, t);
		return r.style.textShadow = "0.02em 0.01em 0.04px", r;
	},
	mathmlBuilder(e, t) {
		var n = new W("mstyle", dr(e.body, t));
		return n.setAttribute("style", "text-shadow: 0.02em 0.01em 0.04px"), n;
	}
});
var Ir = {
	">": "\\\\cdrightarrow",
	"<": "\\\\cdleftarrow",
	"=": "\\\\cdlongequal",
	A: "\\uparrow",
	V: "\\downarrow",
	"|": "\\Vert",
	".": "no arrow"
}, Lr = () => ({
	type: "styling",
	body: [],
	mode: "math",
	style: "display",
	resetFont: !0
}), Rr = (e) => e.type === "textord" && e.text === "@", zr = (e, t) => (e.type === "mathord" || e.type === "atom") && e.text === t;
function Br(e, t, n) {
	var r = Ir[e];
	switch (r) {
		case "\\\\cdrightarrow":
		case "\\\\cdleftarrow": return n.callFunction(r, [t[0]], [t[1]]);
		case "\\uparrow":
		case "\\downarrow":
			var i = n.callFunction("\\\\cdleft", [t[0]], []), a = {
				type: "atom",
				text: r,
				mode: "math",
				family: "rel"
			}, o = {
				type: "ordgroup",
				mode: "math",
				body: [
					i,
					n.callFunction("\\Big", [a], []),
					n.callFunction("\\\\cdright", [t[1]], [])
				]
			};
			return n.callFunction("\\\\cdparent", [o], []);
		case "\\\\cdlongequal": return n.callFunction("\\\\cdlongequal", [], []);
		case "\\Vert": return n.callFunction("\\Big", [{
			type: "textord",
			text: "\\Vert",
			mode: "math"
		}], []);
		default: return {
			type: "textord",
			text: " ",
			mode: "math"
		};
	}
}
function Vr(e) {
	var t = [];
	for (e.gullet.beginGroup(), e.gullet.macros.set("\\cr", "\\\\\\relax"), e.gullet.beginGroup();;) {
		t.push(e.parseExpression(!1, "\\\\")), e.gullet.endGroup(), e.gullet.beginGroup();
		var n = e.fetch().text;
		if (n === "&" || n === "\\\\") e.consume();
		else if (n === "\\end") {
			t[t.length - 1].length === 0 && t.pop();
			break;
		} else throw new C("Expected \\\\ or \\cr or \\end", e.nextToken);
	}
	for (var r = [], i = [r], a = 0; a < t.length; a++) {
		for (var o = t[a], s = Lr(), c = 0; c < o.length; c++) if (!Rr(o[c])) s.body.push(o[c]);
		else {
			r.push(s), c += 1;
			var l = Er(o[c]).text, u = [, ,];
			if (u[0] = {
				type: "ordgroup",
				mode: "math",
				body: []
			}, u[1] = {
				type: "ordgroup",
				mode: "math",
				body: []
			}, !"=|.".includes(l)) if ("<>AV".includes(l)) for (var d = 0; d < 2; d++) {
				for (var f = !0, p = c + 1; p < o.length; p++) {
					if (zr(o[p], l)) {
						f = !1, c = p;
						break;
					}
					if (Rr(o[p])) throw new C("Missing a " + l + " character to complete a CD arrow.", o[p]);
					u[d].body.push(o[p]);
				}
				if (f) throw new C("Missing a " + l + " character to complete a CD arrow.", o[c]);
			}
			else throw new C("Expected one of \"<>AV=|.\" after @", o[c]);
			var m = {
				type: "styling",
				body: [Br(l, u, e)],
				mode: "math",
				style: "display",
				resetFont: !0
			};
			r.push(m), s = Lr();
		}
		a % 2 == 0 ? r.push(s) : r.shift(), r = [], i.push(r);
	}
	return e.gullet.endGroup(), e.gullet.endGroup(), {
		type: "array",
		mode: "math",
		body: i,
		arraystretch: 1,
		addJot: !0,
		rowGaps: [null],
		cols: Array(i[0].length).fill({
			type: "align",
			align: "c",
			pregap: .25,
			postgap: .25
		}),
		colSeparationType: "CD",
		hLinesBeforeRow: Array(i.length + 1).fill([])
	};
}
H({
	type: "cdlabel",
	names: ["\\\\cdleft", "\\\\cdright"],
	props: { numArgs: 1 },
	handler(e, t) {
		var { parser: n, funcName: r } = e;
		return {
			type: "cdlabel",
			mode: n.mode,
			side: r.slice(4),
			label: t[0]
		};
	},
	htmlBuilder(e, t) {
		var n = t.havingStyle(t.style.sup()), r = kn(U(e.label, n, t), t);
		return r.classes.push("cd-label-" + e.side), r.style.bottom = E(.8 - r.depth), r.height = 0, r.depth = 0, r;
	},
	mathmlBuilder(e, t) {
		var n = new W("mrow", [G(e.label, t)]);
		return n = new W("mpadded", [n]), n.setAttribute("width", "0"), e.side === "left" && n.setAttribute("lspace", "-1width"), n.setAttribute("voffset", "0.7em"), n = new W("mstyle", [n]), n.setAttribute("displaystyle", "false"), n.setAttribute("scriptlevel", "1"), n;
	}
}), H({
	type: "cdlabelparent",
	names: ["\\\\cdparent"],
	props: { numArgs: 1 },
	handler(e, t) {
		var { parser: n } = e;
		return {
			type: "cdlabelparent",
			mode: n.mode,
			fragment: t[0]
		};
	},
	htmlBuilder(e, t) {
		var n = kn(U(e.fragment, t), t);
		return n.classes.push("cd-vert-arrow"), n;
	},
	mathmlBuilder(e, t) {
		return new W("mrow", [G(e.fragment, t)]);
	}
}), H({
	type: "textord",
	names: ["\\@char"],
	props: {
		numArgs: 1,
		allowedInText: !0
	},
	handler(e, t) {
		for (var { parser: n } = e, r = K(t[0], "ordgroup").body, i = "", a = 0; a < r.length; a++) {
			var o = K(r[a], "textord");
			i += o.text;
		}
		var s = parseInt(i), c;
		if (isNaN(s)) throw new C("\\@char has non-numeric argument " + i);
		if (s < 0 || s >= 1114111) throw new C("\\@char with invalid code point " + i);
		return s <= 65535 ? c = String.fromCharCode(s) : (s -= 65536, c = String.fromCharCode((s >> 10) + 55296, (s & 1023) + 56320)), {
			type: "textord",
			mode: n.mode,
			text: c
		};
	}
});
var Hr = (e, t) => On(Xn(e.body, t.withColor(e.color), !1)), Ur = (e, t) => {
	var n = new W("mstyle", dr(e.body, t.withColor(e.color)));
	return n.setAttribute("mathcolor", e.color), n;
};
H({
	type: "color",
	names: ["\\textcolor"],
	props: {
		numArgs: 2,
		allowedInText: !0,
		argTypes: ["color", "original"]
	},
	handler(e, t) {
		var { parser: n } = e, r = K(t[0], "color-token").color, i = t[1];
		return {
			type: "color",
			mode: n.mode,
			color: r,
			body: Gn(i)
		};
	},
	htmlBuilder: Hr,
	mathmlBuilder: Ur
}), H({
	type: "color",
	names: ["\\color"],
	props: {
		numArgs: 1,
		allowedInText: !0,
		argTypes: ["color"]
	},
	handler(e, t) {
		var { parser: n, breakOnTokenText: r } = e, i = K(t[0], "color-token").color;
		n.gullet.macros.set("\\current@color", i);
		var a = n.parseExpression(!0, r);
		return {
			type: "color",
			mode: n.mode,
			color: i,
			body: a
		};
	},
	htmlBuilder: Hr,
	mathmlBuilder: Ur
}), H({
	type: "cr",
	names: ["\\\\"],
	props: {
		numArgs: 0,
		numOptionalArgs: 0,
		allowedInText: !0
	},
	handler(e, t, n) {
		var { parser: r } = e, i = r.gullet.future().text === "[" ? r.parseSizeGroup(!0) : null, a = !r.settings.displayMode || !r.settings.useStrictBehavior("newLineInDisplayMode", "In LaTeX, \\\\ or \\newline does nothing in display mode");
		return {
			type: "cr",
			mode: r.mode,
			newLine: a,
			size: i && K(i, "size").value
		};
	},
	htmlBuilder(e, t) {
		var n = z(["mspace"], [], t);
		return e.newLine && (n.classes.push("newline"), e.size && (n.style.marginTop = E(T(e.size, t)))), n;
	},
	mathmlBuilder(e, t) {
		var n = new W("mspace");
		return e.newLine && (n.setAttribute("linebreak", "newline"), e.size && n.setAttribute("height", E(T(e.size, t)))), n;
	}
});
var Wr = {
	"\\global": "\\global",
	"\\long": "\\\\globallong",
	"\\\\globallong": "\\\\globallong",
	"\\def": "\\gdef",
	"\\gdef": "\\gdef",
	"\\edef": "\\xdef",
	"\\xdef": "\\xdef",
	"\\let": "\\\\globallet",
	"\\futurelet": "\\\\globalfuture"
}, Gr = (e) => {
	var t = e.text;
	if (/^(?:[\\{}$&#^_]|EOF)$/.test(t)) throw new C("Expected a control sequence", e);
	return t;
}, Kr = (e) => {
	var t = e.gullet.popToken();
	return t.text === "=" && (t = e.gullet.popToken(), t.text === " " && (t = e.gullet.popToken())), t;
}, qr = (e, t, n, r) => {
	var i = e.gullet.macros.get(n.text);
	i ??= (n.noexpand = !0, {
		tokens: [n],
		numArgs: 0,
		unexpandable: !e.gullet.isExpandable(n.text)
	}), e.gullet.macros.set(t, i, r);
};
H({
	type: "internal",
	names: [
		"\\global",
		"\\long",
		"\\\\globallong"
	],
	props: {
		numArgs: 0,
		allowedInText: !0
	},
	handler(e) {
		var { parser: t, funcName: n } = e;
		t.consumeSpaces();
		var r = t.fetch();
		if (Wr[r.text]) return (n === "\\global" || n === "\\\\globallong") && (r.text = Wr[r.text]), K(t.parseFunction(), "internal");
		throw new C("Invalid token after macro prefix", r);
	}
}), H({
	type: "internal",
	names: [
		"\\def",
		"\\gdef",
		"\\edef",
		"\\xdef"
	],
	props: {
		numArgs: 0,
		allowedInText: !0,
		primitive: !0
	},
	handler(e) {
		var { parser: t, funcName: n } = e, r = t.gullet.popToken(), i = r.text;
		if (/^(?:[\\{}$&#^_]|EOF)$/.test(i)) throw new C("Expected a control sequence", r);
		for (var a = 0, o, s = [[]]; t.gullet.future().text !== "{";) if (r = t.gullet.popToken(), r.text === "#") {
			if (t.gullet.future().text === "{") {
				o = t.gullet.future(), s[a].push("{");
				break;
			}
			if (r = t.gullet.popToken(), !/^[1-9]$/.test(r.text)) throw new C("Invalid argument number \"" + r.text + "\"");
			if (parseInt(r.text) !== a + 1) throw new C("Argument number \"" + r.text + "\" out of order");
			a++, s.push([]);
		} else if (r.text === "EOF") throw new C("Expected a macro definition");
		else s[a].push(r.text);
		var { tokens: c } = t.gullet.consumeArg();
		return o && c.unshift(o), (n === "\\edef" || n === "\\xdef") && (c = t.gullet.expandTokens(c), c.reverse()), t.gullet.macros.set(i, {
			tokens: c,
			numArgs: a,
			delimiters: s
		}, n === Wr[n]), {
			type: "internal",
			mode: t.mode
		};
	}
}), H({
	type: "internal",
	names: ["\\let", "\\\\globallet"],
	props: {
		numArgs: 0,
		allowedInText: !0,
		primitive: !0
	},
	handler(e) {
		var { parser: t, funcName: n } = e, r = Gr(t.gullet.popToken());
		return t.gullet.consumeSpaces(), qr(t, r, Kr(t), n === "\\\\globallet"), {
			type: "internal",
			mode: t.mode
		};
	}
}), H({
	type: "internal",
	names: ["\\futurelet", "\\\\globalfuture"],
	props: {
		numArgs: 0,
		allowedInText: !0,
		primitive: !0
	},
	handler(e) {
		var { parser: t, funcName: n } = e, r = Gr(t.gullet.popToken()), i = t.gullet.popToken(), a = t.gullet.popToken();
		return qr(t, r, a, n === "\\\\globalfuture"), t.gullet.pushToken(a), t.gullet.pushToken(i), {
			type: "internal",
			mode: t.mode
		};
	}
});
var Jr = function(e, t, n) {
	var r = kt(D.math[e] && D.math[e].replace || e, t, n);
	if (!r) throw Error("Unsupported symbol " + e + " and font size " + t + ".");
	return r;
}, Yr = function(e, t, n, r) {
	var i = n.havingBaseStyle(t), a = z(r.concat(i.sizingClasses(n)), [e], n), o = i.sizeMultiplier / n.sizeMultiplier;
	return a.height *= o, a.depth *= o, a.maxFontSize = i.sizeMultiplier, a;
}, Xr = function(e, t, n) {
	var r = t.havingBaseStyle(n), i = (1 - t.sizeMultiplier / r.sizeMultiplier) * t.fontMetrics().axisHeight;
	e.classes.push("delimcenter"), e.style.top = E(i), e.height -= i, e.depth += i;
}, Zr = function(e, t, n, r, i, a) {
	var o = Yr(vn(e, "Main-Regular", i, r), t, r, a);
	return n && Xr(o, r, t), o;
}, Qr = function(e, t, n, r) {
	return vn(e, "Size" + t + "-Regular", n, r);
}, $r = function(e, t, n, r, i, a) {
	var o = Qr(e, t, i, r), s = Yr(z(["delimsizing", "size" + t], [o], r), w.TEXT, r, a);
	return n && Xr(s, r, w.TEXT), s;
}, ei = function(e, t, n) {
	return {
		type: "elem",
		elem: z(["delimsizinginner", t === "Size1-Regular" ? "delim-size1" : "delim-size4"], [z([], [vn(e, t, n)])])
	};
}, ti = function(e, t, n) {
	var r = Et["Size4-Regular"][e.charCodeAt(0)] ? Et["Size4-Regular"][e.charCodeAt(0)][4] : Et["Size1-Regular"][e.charCodeAt(0)][4], i = Tn([], [new bt([new xt("inner", tt(e, Math.round(1e3 * t)))], {
		width: E(r),
		height: E(t),
		style: "width:" + E(r),
		viewBox: "0 0 " + 1e3 * r + " " + Math.round(1e3 * t),
		preserveAspectRatio: "xMinYMin"
	})], n);
	return i.height = t, i.style.height = E(t), i.style.width = E(r), {
		type: "elem",
		elem: i
	};
}, ni = .008, ri = {
	type: "kern",
	size: -1 * ni
}, ii = new Set([
	"|",
	"\\lvert",
	"\\rvert",
	"\\vert"
]), ai = new Set([
	"\\|",
	"\\lVert",
	"\\rVert",
	"\\Vert"
]), oi = function(e, t, n, r, i, a) {
	var o, s, c, l, u = "", d = 0;
	o = c = l = e, s = null;
	var f = "Size1-Regular";
	e === "\\uparrow" ? c = l = "⏐" : e === "\\Uparrow" ? c = l = "‖" : e === "\\downarrow" ? o = c = "⏐" : e === "\\Downarrow" ? o = c = "‖" : e === "\\updownarrow" ? (o = "\\uparrow", c = "⏐", l = "\\downarrow") : e === "\\Updownarrow" ? (o = "\\Uparrow", c = "‖", l = "\\Downarrow") : ii.has(e) ? (c = "∣", u = "vert", d = 333) : ai.has(e) ? (c = "∥", u = "doublevert", d = 556) : e === "[" || e === "\\lbrack" ? (o = "⎡", c = "⎢", l = "⎣", f = "Size4-Regular", u = "lbrack", d = 667) : e === "]" || e === "\\rbrack" ? (o = "⎤", c = "⎥", l = "⎦", f = "Size4-Regular", u = "rbrack", d = 667) : e === "\\lfloor" || e === "⌊" ? (c = o = "⎢", l = "⎣", f = "Size4-Regular", u = "lfloor", d = 667) : e === "\\lceil" || e === "⌈" ? (o = "⎡", c = l = "⎢", f = "Size4-Regular", u = "lceil", d = 667) : e === "\\rfloor" || e === "⌋" ? (c = o = "⎥", l = "⎦", f = "Size4-Regular", u = "rfloor", d = 667) : e === "\\rceil" || e === "⌉" ? (o = "⎤", c = l = "⎥", f = "Size4-Regular", u = "rceil", d = 667) : e === "(" || e === "\\lparen" ? (o = "⎛", c = "⎜", l = "⎝", f = "Size4-Regular", u = "lparen", d = 875) : e === ")" || e === "\\rparen" ? (o = "⎞", c = "⎟", l = "⎠", f = "Size4-Regular", u = "rparen", d = 875) : e === "\\{" || e === "\\lbrace" ? (o = "⎧", s = "⎨", l = "⎩", c = "⎪", f = "Size4-Regular") : e === "\\}" || e === "\\rbrace" ? (o = "⎫", s = "⎬", l = "⎭", c = "⎪", f = "Size4-Regular") : e === "\\lgroup" || e === "⟮" ? (o = "⎧", l = "⎩", c = "⎪", f = "Size4-Regular") : e === "\\rgroup" || e === "⟯" ? (o = "⎫", l = "⎭", c = "⎪", f = "Size4-Regular") : e === "\\lmoustache" || e === "⎰" ? (o = "⎧", l = "⎭", c = "⎪", f = "Size4-Regular") : (e === "\\rmoustache" || e === "⎱") && (o = "⎫", l = "⎩", c = "⎪", f = "Size4-Regular");
	var p = Jr(o, f, i), m = p.height + p.depth, h = Jr(c, f, i), g = h.height + h.depth, _ = Jr(l, f, i), v = _.height + _.depth, y = 0, b = 1;
	if (s !== null) {
		var x = Jr(s, f, i);
		y = x.height + x.depth, b = 2;
	}
	var S = m + v + y, ee = S + Math.max(0, Math.ceil((t - S) / (b * g))) * b * g, te = r.fontMetrics().axisHeight;
	n && (te *= r.sizeMultiplier);
	var ne = ee / 2 - te, re = [];
	if (u.length > 0) {
		var ie = ee - m - v, ae = Math.round(ee * 1e3), oe = rt(u, Math.round(ie * 1e3)), se = new xt(u, oe), ce = E(d / 1e3), le = E(ae / 1e3), ue = Tn([], [new bt([se], {
			width: ce,
			height: le,
			viewBox: "0 0 " + d + " " + ae
		})], r);
		ue.height = ae / 1e3, ue.style.width = ce, ue.style.height = le, re.push({
			type: "elem",
			elem: ue
		});
	} else {
		if (re.push(ei(l, f, i)), re.push(ri), s === null) {
			var de = ee - m - v + 2 * ni;
			re.push(ti(c, de, r));
		} else {
			var fe = (ee - m - v - y) / 2 + 2 * ni;
			re.push(ti(c, fe, r)), re.push(ri), re.push(ei(s, f, i)), re.push(ri), re.push(ti(c, fe, r));
		}
		re.push(ri), re.push(ei(o, f, i));
	}
	var pe = r.havingBaseStyle(w.TEXT);
	return Yr(z(["delimsizing", "mult"], [B({
		positionType: "bottom",
		positionData: ne,
		children: re
	})], pe), w.TEXT, r, a);
}, si = 80, ci = .08, li = function(e, t, n, r, i) {
	return Tn(["hide-tail"], [new bt([new xt(e, et(e, r, n))], {
		width: "400em",
		height: E(t),
		viewBox: "0 0 400000 " + n,
		preserveAspectRatio: "xMinYMin slice"
	})], i);
}, ui = function(e, t) {
	var n = t.havingBaseSizing(), r = bi("\\surd", e * n.sizeMultiplier, vi, n), i = n.sizeMultiplier, a = Math.max(0, t.minRuleThickness - t.fontMetrics().sqrtRuleThickness), o, s, c, l, u;
	return r.type === "small" ? (l = 1e3 + 1e3 * a + si, e < 1 ? i = 1 : e < 1.4 && (i = .7), s = (1 + a + ci) / i, c = (1 + a) / i, o = li("sqrtMain", s, l, a, t), o.style.minWidth = "0.853em", u = .833 / i) : r.type === "large" ? (l = (1e3 + si) * mi[r.size], c = (mi[r.size] + a) / i, s = (mi[r.size] + a + ci) / i, o = li("sqrtSize" + r.size, s, l, a, t), o.style.minWidth = "1.02em", u = 1 / i) : (s = e + a + ci, c = e + a, l = Math.floor(1e3 * e + a) + si, o = li("sqrtTall", s, l, a, t), o.style.minWidth = "0.742em", u = 1.056), o.height = c, o.style.height = E(s), {
		span: o,
		advanceWidth: u,
		ruleWidth: (t.fontMetrics().sqrtRuleThickness + a) * i
	};
}, di = new Set([
	"(",
	"\\lparen",
	")",
	"\\rparen",
	"[",
	"\\lbrack",
	"]",
	"\\rbrack",
	"\\{",
	"\\lbrace",
	"\\}",
	"\\rbrace",
	"\\lfloor",
	"\\rfloor",
	"⌊",
	"⌋",
	"\\lceil",
	"\\rceil",
	"⌈",
	"⌉",
	"\\surd"
]), fi = new Set([
	"\\uparrow",
	"\\downarrow",
	"\\updownarrow",
	"\\Uparrow",
	"\\Downarrow",
	"\\Updownarrow",
	"|",
	"\\|",
	"\\vert",
	"\\Vert",
	"\\lvert",
	"\\rvert",
	"\\lVert",
	"\\rVert",
	"\\lgroup",
	"\\rgroup",
	"⟮",
	"⟯",
	"\\lmoustache",
	"\\rmoustache",
	"⎰",
	"⎱"
]), pi = new Set([
	"<",
	">",
	"\\langle",
	"\\rangle",
	"/",
	"\\backslash",
	"\\lt",
	"\\gt"
]), mi = [
	0,
	1.2,
	1.8,
	2.4,
	3
], hi = function(e, t, n, r, i) {
	if (e === "<" || e === "\\lt" || e === "⟨" ? e = "\\langle" : (e === ">" || e === "\\gt" || e === "⟩") && (e = "\\rangle"), di.has(e) || pi.has(e)) return $r(e, t, !1, n, r, i);
	if (fi.has(e)) return oi(e, mi[t], !1, n, r, i);
	throw new C("Illegal delimiter: '" + e + "'");
}, gi = [
	{
		type: "small",
		style: w.SCRIPTSCRIPT
	},
	{
		type: "small",
		style: w.SCRIPT
	},
	{
		type: "small",
		style: w.TEXT
	},
	{
		type: "large",
		size: 1
	},
	{
		type: "large",
		size: 2
	},
	{
		type: "large",
		size: 3
	},
	{
		type: "large",
		size: 4
	}
], _i = [
	{
		type: "small",
		style: w.SCRIPTSCRIPT
	},
	{
		type: "small",
		style: w.SCRIPT
	},
	{
		type: "small",
		style: w.TEXT
	},
	{ type: "stack" }
], vi = [
	{
		type: "small",
		style: w.SCRIPTSCRIPT
	},
	{
		type: "small",
		style: w.SCRIPT
	},
	{
		type: "small",
		style: w.TEXT
	},
	{
		type: "large",
		size: 1
	},
	{
		type: "large",
		size: 2
	},
	{
		type: "large",
		size: 3
	},
	{
		type: "large",
		size: 4
	},
	{ type: "stack" }
], yi = function(e) {
	if (e.type === "small") return "Main-Regular";
	if (e.type === "large") return "Size" + e.size + "-Regular";
	if (e.type === "stack") return "Size4-Regular";
	var t = e.type;
	throw Error("Add support for delim type '" + t + "' here.");
}, bi = function(e, t, n, r) {
	for (var i = Math.min(2, 3 - r.style.size); i < n.length; i++) {
		var a = n[i];
		if (a.type === "stack") break;
		var o = Jr(e, yi(a), "math"), s = o.height + o.depth;
		if (a.type === "small") {
			var c = r.havingBaseStyle(a.style);
			s *= c.sizeMultiplier;
		}
		if (s > t) return a;
	}
	return n[n.length - 1];
}, xi = function(e, t, n, r, i, a) {
	e === "<" || e === "\\lt" || e === "⟨" ? e = "\\langle" : (e === ">" || e === "\\gt" || e === "⟩") && (e = "\\rangle");
	var o = pi.has(e) ? gi : di.has(e) ? vi : _i, s = bi(e, t, o, r);
	return s.type === "small" ? Zr(e, s.style, n, r, i, a) : s.type === "large" ? $r(e, s.size, n, r, i, a) : oi(e, t, n, r, i, a);
}, Si = function(e, t, n, r, i, a) {
	var o = r.fontMetrics().axisHeight * r.sizeMultiplier, s = 901, c = 5 / r.fontMetrics().ptPerEm, l = Math.max(t - o, n + o);
	return xi(e, Math.max(l / 500 * s, 2 * l - c), !0, r, i, a);
}, Ci = {
	"\\bigl": {
		mclass: "mopen",
		size: 1
	},
	"\\Bigl": {
		mclass: "mopen",
		size: 2
	},
	"\\biggl": {
		mclass: "mopen",
		size: 3
	},
	"\\Biggl": {
		mclass: "mopen",
		size: 4
	},
	"\\bigr": {
		mclass: "mclose",
		size: 1
	},
	"\\Bigr": {
		mclass: "mclose",
		size: 2
	},
	"\\biggr": {
		mclass: "mclose",
		size: 3
	},
	"\\Biggr": {
		mclass: "mclose",
		size: 4
	},
	"\\bigm": {
		mclass: "mrel",
		size: 1
	},
	"\\Bigm": {
		mclass: "mrel",
		size: 2
	},
	"\\biggm": {
		mclass: "mrel",
		size: 3
	},
	"\\Biggm": {
		mclass: "mrel",
		size: 4
	},
	"\\big": {
		mclass: "mord",
		size: 1
	},
	"\\Big": {
		mclass: "mord",
		size: 2
	},
	"\\bigg": {
		mclass: "mord",
		size: 3
	},
	"\\Bigg": {
		mclass: "mord",
		size: 4
	}
}, wi = new Set(/* @__PURE__ */ "(,\\lparen,),\\rparen,[,\\lbrack,],\\rbrack,\\{,\\lbrace,\\},\\rbrace,\\lfloor,\\rfloor,⌊,⌋,\\lceil,\\rceil,⌈,⌉,<,>,\\langle,⟨,\\rangle,⟩,\\lt,\\gt,\\lvert,\\rvert,\\lVert,\\rVert,\\lgroup,\\rgroup,⟮,⟯,\\lmoustache,\\rmoustache,⎰,⎱,/,\\backslash,|,\\vert,\\|,\\Vert,\\uparrow,\\Uparrow,\\downarrow,\\Downarrow,\\updownarrow,\\Updownarrow,.".split(","));
function Ti(e) {
	return "isMiddle" in e;
}
function Ei(e, t) {
	var n = Dr(e);
	if (n && wi.has(n.text)) return n;
	throw n ? new C("Invalid delimiter '" + n.text + "' after '" + t.funcName + "'", e) : new C("Invalid delimiter type '" + e.type + "'", e);
}
H({
	type: "delimsizing",
	names: [
		"\\bigl",
		"\\Bigl",
		"\\biggl",
		"\\Biggl",
		"\\bigr",
		"\\Bigr",
		"\\biggr",
		"\\Biggr",
		"\\bigm",
		"\\Bigm",
		"\\biggm",
		"\\Biggm",
		"\\big",
		"\\Big",
		"\\bigg",
		"\\Bigg"
	],
	props: {
		numArgs: 1,
		argTypes: ["primitive"]
	},
	handler: (e, t) => {
		var n = Ei(t[0], e);
		return {
			type: "delimsizing",
			mode: e.parser.mode,
			size: Ci[e.funcName].size,
			mclass: Ci[e.funcName].mclass,
			delim: n.text
		};
	},
	htmlBuilder: (e, t) => e.delim === "." ? z([e.mclass]) : hi(e.delim, e.size, t, e.mode, [e.mclass]),
	mathmlBuilder: (e) => {
		var t = [];
		e.delim !== "." && t.push(or(e.delim, e.mode));
		var n = new W("mo", t);
		e.mclass === "mopen" || e.mclass === "mclose" ? n.setAttribute("fence", "true") : n.setAttribute("fence", "false"), n.setAttribute("stretchy", "true");
		var r = E(mi[e.size]);
		return n.setAttribute("minsize", r), n.setAttribute("maxsize", r), n;
	}
});
function Di(e) {
	if (!e.body) throw Error("Bug: The leftright ParseNode wasn't fully parsed.");
}
H({
	type: "leftright-right",
	names: ["\\right"],
	props: {
		numArgs: 1,
		primitive: !0
	},
	handler: (e, t) => {
		var n = e.parser.gullet.macros.get("\\current@color");
		if (n && typeof n != "string") throw new C("\\current@color set to non-string in \\right");
		return {
			type: "leftright-right",
			mode: e.parser.mode,
			delim: Ei(t[0], e).text,
			color: n
		};
	}
}), H({
	type: "leftright",
	names: ["\\left"],
	props: {
		numArgs: 1,
		primitive: !0
	},
	handler: (e, t) => {
		var n = Ei(t[0], e), r = e.parser;
		++r.leftrightDepth;
		var i = r.parseExpression(!1);
		--r.leftrightDepth, r.expect("\\right", !1);
		var a = K(r.parseFunction(), "leftright-right");
		return {
			type: "leftright",
			mode: r.mode,
			body: i,
			left: n.text,
			right: a.delim,
			rightColor: a.color
		};
	},
	htmlBuilder: (e, t) => {
		Di(e);
		for (var n = Xn(e.body, t, !0, ["mopen", "mclose"]), r = 0, i = 0, a = !1, o = 0; o < n.length; o++) {
			var s = n[o];
			Ti(s) ? a = !0 : (r = Math.max(n[o].height, r), i = Math.max(n[o].depth, i));
		}
		r *= t.sizeMultiplier, i *= t.sizeMultiplier;
		var c = e.left === "." ? tr(t, ["mopen"]) : Si(e.left, r, i, t, e.mode, ["mopen"]);
		if (n.unshift(c), a) for (var l = 1; l < n.length; l++) {
			var u = n[l];
			if (Ti(u)) {
				var d = u.isMiddle;
				n[l] = Si(d.delim, r, i, d.options, e.mode, []);
			}
		}
		var f;
		if (e.right === ".") f = tr(t, ["mclose"]);
		else {
			var p = e.rightColor ? t.withColor(e.rightColor) : t;
			f = Si(e.right, r, i, p, e.mode, ["mclose"]);
		}
		return n.push(f), z(["minner"], n, t);
	},
	mathmlBuilder: (e, t) => {
		Di(e);
		var n = dr(e.body, t);
		if (e.left !== ".") {
			var r = new W("mo", [or(e.left, e.mode)]);
			r.setAttribute("fence", "true"), n.unshift(r);
		}
		if (e.right !== ".") {
			var i = new W("mo", [or(e.right, e.mode)]);
			i.setAttribute("fence", "true"), e.rightColor && i.setAttribute("mathcolor", e.rightColor), n.push(i);
		}
		return sr(n);
	}
}), H({
	type: "middle",
	names: ["\\middle"],
	props: {
		numArgs: 1,
		primitive: !0
	},
	handler: (e, t) => {
		var n = Ei(t[0], e);
		if (!e.parser.leftrightDepth) throw new C("\\middle without preceding \\left", n);
		return {
			type: "middle",
			mode: e.parser.mode,
			delim: n.text
		};
	},
	htmlBuilder: (e, t) => {
		var n;
		return e.delim === "." ? n = tr(t, []) : (n = hi(e.delim, 1, t, e.mode, []), n.isMiddle = {
			delim: e.delim,
			options: t
		}), n;
	},
	mathmlBuilder: (e, t) => {
		var n = new W("mo", [e.delim === "\\vert" || e.delim === "|" ? or("|", "text") : or(e.delim, e.mode)]);
		return n.setAttribute("fence", "true"), n.setAttribute("lspace", "0.05em"), n.setAttribute("rspace", "0.05em"), n;
	}
});
var Oi = (e, t) => {
	var n = kn(U(e.body, t), t), r = e.label.slice(1), i = t.sizeMultiplier, a, o, s = we(e.body);
	if (r === "sout") a = z(["stretchy", "sout"]), a.height = t.fontMetrics().defaultRuleThickness / i, o = -.5 * t.fontMetrics().xHeight;
	else if (r === "phase") {
		var c = T({
			number: .6,
			unit: "pt"
		}, t), l = T({
			number: .35,
			unit: "ex"
		}, t), u = t.havingBaseSizing();
		i /= u.sizeMultiplier;
		var d = n.height + n.depth + c + l;
		n.style.paddingLeft = E(d / 2 + c);
		var f = Math.floor(1e3 * d * i);
		a = Tn(["hide-tail"], [new bt([new xt("phase", Qe(f))], {
			width: "400em",
			height: E(f / 1e3),
			viewBox: "0 0 400000 " + f,
			preserveAspectRatio: "xMinYMin slice"
		})], t), a.style.height = E(d), o = n.depth + c + l;
	} else {
		/cancel/.test(r) ? s || n.classes.push("cancel-pad") : r === "angl" ? n.classes.push("anglpad") : n.classes.push("boxpad");
		var p, m, h = 0;
		/box/.test(r) ? (h = Math.max(t.fontMetrics().fboxrule, t.minRuleThickness), p = t.fontMetrics().fboxsep + (r === "colorbox" ? 0 : h), m = p) : r === "angl" ? (h = Math.max(t.fontMetrics().defaultRuleThickness, t.minRuleThickness), p = 4 * h, m = Math.max(0, .25 - n.depth)) : (p = s ? .2 : 0, m = p), a = Sr(n, r, p, m, t), /fbox|boxed|fcolorbox/.test(r) ? (a.style.borderStyle = "solid", a.style.borderWidth = E(h)) : r === "angl" && h !== .049 && (a.style.borderTopWidth = E(h), a.style.borderRightWidth = E(h)), o = n.depth + m, e.backgroundColor && (a.style.backgroundColor = e.backgroundColor, e.borderColor && (a.style.borderColor = e.borderColor));
	}
	var g;
	if (e.backgroundColor) g = B({
		positionType: "individualShift",
		children: [{
			type: "elem",
			elem: a,
			shift: o
		}, {
			type: "elem",
			elem: n,
			shift: 0
		}]
	});
	else {
		var _ = /cancel|phase/.test(r) ? ["svg-align"] : [];
		g = B({
			positionType: "individualShift",
			children: [{
				type: "elem",
				elem: n,
				shift: 0
			}, {
				type: "elem",
				elem: a,
				shift: o,
				wrapperClasses: _
			}]
		});
	}
	return /cancel/.test(r) && (g.height = n.height, g.depth = n.depth), /cancel/.test(r) && !s ? z(["mord", "cancel-lap"], [g], t) : z(["mord"], [g], t);
}, ki = (e, t) => {
	var n, r = new W(e.label.includes("colorbox") ? "mpadded" : "menclose", [G(e.body, t)]);
	switch (e.label) {
		case "\\cancel":
			r.setAttribute("notation", "updiagonalstrike");
			break;
		case "\\bcancel":
			r.setAttribute("notation", "downdiagonalstrike");
			break;
		case "\\phase":
			r.setAttribute("notation", "phasorangle");
			break;
		case "\\sout":
			r.setAttribute("notation", "horizontalstrike");
			break;
		case "\\fbox":
			r.setAttribute("notation", "box");
			break;
		case "\\angl":
			r.setAttribute("notation", "actuarial");
			break;
		case "\\fcolorbox":
		case "\\colorbox":
			if (n = t.fontMetrics().fboxsep * t.fontMetrics().ptPerEm, r.setAttribute("width", "+" + 2 * n + "pt"), r.setAttribute("height", "+" + 2 * n + "pt"), r.setAttribute("lspace", n + "pt"), r.setAttribute("voffset", n + "pt"), e.label === "\\fcolorbox") {
				var i = Math.max(t.fontMetrics().fboxrule, t.minRuleThickness);
				r.setAttribute("style", "border: " + E(i) + " solid " + e.borderColor);
			}
			break;
		case "\\xcancel":
			r.setAttribute("notation", "updiagonalstrike downdiagonalstrike");
			break;
	}
	return e.backgroundColor && r.setAttribute("mathbackground", e.backgroundColor), r;
};
H({
	type: "enclose",
	names: ["\\colorbox"],
	props: {
		numArgs: 2,
		allowedInText: !0,
		argTypes: ["color", "hbox"]
	},
	handler(e, t, n) {
		var { parser: r, funcName: i } = e, a = K(t[0], "color-token").color, o = t[1];
		return {
			type: "enclose",
			mode: r.mode,
			label: i,
			backgroundColor: a,
			body: o
		};
	},
	htmlBuilder: Oi,
	mathmlBuilder: ki
}), H({
	type: "enclose",
	names: ["\\fcolorbox"],
	props: {
		numArgs: 3,
		allowedInText: !0,
		argTypes: [
			"color",
			"color",
			"hbox"
		]
	},
	handler(e, t, n) {
		var { parser: r, funcName: i } = e, a = K(t[0], "color-token").color, o = K(t[1], "color-token").color, s = t[2];
		return {
			type: "enclose",
			mode: r.mode,
			label: i,
			backgroundColor: o,
			borderColor: a,
			body: s
		};
	},
	htmlBuilder: Oi,
	mathmlBuilder: ki
}), H({
	type: "enclose",
	names: ["\\fbox"],
	props: {
		numArgs: 1,
		argTypes: ["hbox"],
		allowedInText: !0
	},
	handler(e, t) {
		var { parser: n } = e;
		return {
			type: "enclose",
			mode: n.mode,
			label: "\\fbox",
			body: t[0]
		};
	}
}), H({
	type: "enclose",
	names: [
		"\\cancel",
		"\\bcancel",
		"\\xcancel",
		"\\phase"
	],
	props: { numArgs: 1 },
	handler(e, t) {
		var { parser: n, funcName: r } = e, i = t[0];
		return {
			type: "enclose",
			mode: n.mode,
			label: r,
			body: i
		};
	},
	htmlBuilder: Oi,
	mathmlBuilder: ki
}), H({
	type: "enclose",
	names: ["\\sout"],
	props: {
		numArgs: 1,
		allowedInText: !0
	},
	handler(e, t) {
		var { parser: n, funcName: r } = e;
		n.mode === "math" && n.settings.reportNonstrict("mathVsSout", "LaTeX's \\sout works only in text mode");
		var i = t[0];
		return {
			type: "enclose",
			mode: n.mode,
			label: r,
			body: i
		};
	},
	htmlBuilder: Oi,
	mathmlBuilder: ki
}), H({
	type: "enclose",
	names: ["\\angl"],
	props: {
		numArgs: 1,
		argTypes: ["hbox"],
		allowedInText: !1
	},
	handler(e, t) {
		var { parser: n } = e;
		return {
			type: "enclose",
			mode: n.mode,
			label: "\\angl",
			body: t[0]
		};
	}
});
var Ai = {};
function ji(e) {
	for (var { type: t, names: n, props: r, handler: i, htmlBuilder: a, mathmlBuilder: o } = e, s = {
		type: t,
		numArgs: r.numArgs || 0,
		allowedInText: !1,
		numOptionalArgs: 0,
		handler: i
	}, c = 0; c < n.length; ++c) Ai[n[c]] = s;
	a && (Vn[t] = a), o && (Hn[t] = o);
}
var Mi = {};
function q(e, t) {
	Mi[e] = t;
}
var Ni = class e {
	constructor(e, t, n) {
		this.lexer = void 0, this.start = void 0, this.end = void 0, this.lexer = e, this.start = t, this.end = n;
	}
	static range(t, n) {
		return n ? !t || !t.loc || !n.loc || t.loc.lexer !== n.loc.lexer ? null : new e(t.loc.lexer, t.loc.start, n.loc.end) : t && t.loc;
	}
}, Pi = class e {
	constructor(e, t) {
		this.text = void 0, this.loc = void 0, this.noexpand = void 0, this.treatAsRelax = void 0, this.text = e, this.loc = t;
	}
	range(t, n) {
		return new e(n, Ni.range(this, t));
	}
};
function Fi(e) {
	var t = [];
	e.consumeSpaces();
	var n = e.fetch().text;
	for (n === "\\relax" && (e.consume(), e.consumeSpaces(), n = e.fetch().text); n === "\\hline" || n === "\\hdashline";) e.consume(), t.push(n === "\\hdashline"), e.consumeSpaces(), n = e.fetch().text;
	return t;
}
var Ii = (e) => {
	if (!e.parser.settings.displayMode) throw new C("{" + e.envName + "} can be used only in display mode.");
}, Li = new Set(["gather", "gather*"]);
function Ri(e) {
	if (!e.includes("ed")) return !e.includes("*");
}
function zi(e, t, n) {
	var { hskipBeforeAndAfter: r, addJot: i, cols: a, arraystretch: o, colSeparationType: s, autoTag: c, singleRow: l, emptySingleRow: u, maxNumCols: d, leqno: f } = t;
	if (e.gullet.beginGroup(), l || e.gullet.macros.set("\\cr", "\\\\\\relax"), !o) {
		var p = e.gullet.expandMacroAsText("\\arraystretch");
		if (p == null) o = 1;
		else if (o = parseFloat(p), !o || o < 0) throw new C("Invalid \\arraystretch: " + p);
	}
	e.gullet.beginGroup();
	var m = [], h = [m], g = [], _ = [], v = c == null ? void 0 : [];
	function y() {
		c && e.gullet.macros.set("\\@eqnsw", "1", !0);
	}
	function b() {
		v && (e.gullet.macros.get("\\df@tag") ? (v.push(e.subparse([new Pi("\\df@tag")])), e.gullet.macros.set("\\df@tag", void 0, !0)) : v.push(!!c && e.gullet.macros.get("\\@eqnsw") === "1"));
	}
	for (y(), _.push(Fi(e));;) {
		var x = e.parseExpression(!1, l ? "\\end" : "\\\\");
		e.gullet.endGroup(), e.gullet.beginGroup();
		var S = {
			type: "ordgroup",
			mode: e.mode,
			body: x
		};
		n && (S = {
			type: "styling",
			mode: e.mode,
			style: n,
			resetFont: !0,
			body: [S]
		}), m.push(S);
		var ee = e.fetch().text;
		if (ee === "&") {
			if (d && m.length === d) {
				if (l || s) throw new C("Too many tab characters: &", e.nextToken);
				e.settings.reportNonstrict("textEnv", "Too few columns specified in the {array} column argument.");
			}
			e.consume();
		} else if (ee === "\\end") {
			b(), m.length === 1 && S.type === "styling" && S.body.length === 1 && S.body[0].type === "ordgroup" && S.body[0].body.length === 0 && (h.length > 1 || !u) && h.pop(), _.length < h.length + 1 && _.push([]);
			break;
		} else if (ee === "\\\\") {
			e.consume();
			var te = void 0;
			e.gullet.future().text !== " " && (te = e.parseSizeGroup(!0)), g.push(te ? te.value : null), b(), _.push(Fi(e)), m = [], h.push(m), y();
		} else throw new C("Expected & or \\\\ or \\cr or \\end", e.nextToken);
	}
	return e.gullet.endGroup(), e.gullet.endGroup(), {
		type: "array",
		mode: e.mode,
		addJot: i,
		arraystretch: o,
		body: h,
		cols: a,
		rowGaps: g,
		hskipBeforeAndAfter: r,
		hLinesBeforeRow: _,
		colSeparationType: s,
		tags: v,
		leqno: f
	};
}
function Bi(e) {
	return e.slice(0, 1) === "d" ? "display" : "text";
}
var Vi = function(e, t) {
	var n, r, i = e.body.length, a = e.hLinesBeforeRow, o = 0, s = Array(i), c = [], l = Math.max(t.fontMetrics().arrayRuleWidth, t.minRuleThickness), u = 1 / t.fontMetrics().ptPerEm, d = 5 * u;
	e.colSeparationType && e.colSeparationType === "small" && (d = .2778 * (t.havingStyle(w.SCRIPT).sizeMultiplier / t.sizeMultiplier));
	var f = e.colSeparationType === "CD" ? T({
		number: 3,
		unit: "ex"
	}, t) : 12 * u, p = 3 * u, m = e.arraystretch * f, h = .7 * m, g = .3 * m, _ = 0;
	function v(e) {
		for (var t = 0; t < e.length; ++t) t > 0 && (_ += .25), c.push({
			pos: _,
			isDashed: e[t]
		});
	}
	for (v(a[0]), n = 0; n < e.body.length; ++n) {
		var y = e.body[n], b = h, x = g;
		o < y.length && (o = y.length);
		var S = {
			cells: Array(y.length),
			height: 0,
			depth: 0,
			pos: 0
		};
		for (r = 0; r < y.length; ++r) {
			var ee = U(y[r], t);
			x < ee.depth && (x = ee.depth), b < ee.height && (b = ee.height), S.cells[r] = ee;
		}
		var te = e.rowGaps[n], ne = 0;
		te && (ne = T(te, t), ne > 0 && (ne += g, x < ne && (x = ne), ne = 0)), e.addJot && n < e.body.length - 1 && (x += p), S.height = b, S.depth = x, _ += b, S.pos = _, _ += x + ne, s[n] = S, v(a[n + 1]);
	}
	var re = _ / 2 + t.fontMetrics().axisHeight, ie = e.cols || [], ae = [], oe, se, ce = [];
	if (e.tags && e.tags.some((e) => e)) for (n = 0; n < i; ++n) {
		var le = s[n], ue = le.pos - re, de = e.tags[n], fe = void 0;
		fe = de === !0 ? z(["eqn-num"], [], t) : de === !1 ? z([], [], t) : z([], Xn(de, t, !0), t), fe.depth = le.depth, fe.height = le.height, ce.push({
			type: "elem",
			elem: fe,
			shift: ue
		});
	}
	for (r = 0, se = 0; r < o || se < ie.length; ++r, ++se) {
		for (var pe = ie[se], me = !0; (he = pe)?.type === "separator";) {
			var he;
			if (me || (oe = z(["arraycolsep"], []), oe.style.width = E(t.fontMetrics().doubleRuleSep), ae.push(oe)), pe.separator === "|" || pe.separator === ":") {
				var ge = pe.separator === "|" ? "solid" : "dashed", _e = z(["vertical-separator"], [], t);
				_e.style.height = E(_), _e.style.borderRightWidth = E(l), _e.style.borderRightStyle = ge, _e.style.margin = "0 " + E(-l / 2);
				var ve = _ - re;
				ve && (_e.style.verticalAlign = E(-ve)), ae.push(_e);
			} else throw new C("Invalid separator type: " + pe.separator);
			se++, pe = ie[se], me = !1;
		}
		if (!(r >= o)) {
			var ye = void 0;
			(r > 0 || e.hskipBeforeAndAfter) && (ye = pe?.pregap ?? d, ye !== 0 && (oe = z(["arraycolsep"], []), oe.style.width = E(ye), ae.push(oe)));
			var be = [];
			for (n = 0; n < i; ++n) {
				var xe = s[n], Se = xe.cells[r];
				if (Se) {
					var Ce = xe.pos - re;
					Se.depth = xe.depth, Se.height = xe.height, be.push({
						type: "elem",
						elem: Se,
						shift: Ce
					});
				}
			}
			var we = B({
				positionType: "individualShift",
				children: be
			}), Te = z(["col-align-" + (pe?.align || "c")], [we]);
			ae.push(Te), (r < o - 1 || e.hskipBeforeAndAfter) && (ye = pe?.postgap ?? d, ye !== 0 && (oe = z(["arraycolsep"], []), oe.style.width = E(ye), ae.push(oe)));
		}
	}
	var Ee = z(["mtable"], ae);
	if (c.length > 0) {
		for (var De = En("hline", t, l), Oe = En("hdashline", t, l), ke = [{
			type: "elem",
			elem: Ee,
			shift: 0
		}]; c.length > 0;) {
			var Ae = c.pop(), je = Ae.pos - re;
			Ae.isDashed ? ke.push({
				type: "elem",
				elem: Oe,
				shift: je
			}) : ke.push({
				type: "elem",
				elem: De,
				shift: je
			});
		}
		Ee = B({
			positionType: "individualShift",
			children: ke
		});
	}
	if (ce.length === 0) return z(["mord"], [Ee], t);
	var Me = z(["tag"], [B({
		positionType: "individualShift",
		children: ce
	})], t);
	return On([Ee, Me]);
}, Hi = {
	c: "center ",
	l: "left ",
	r: "right "
}, Ui = function(e, t) {
	for (var n = [], r = new W("mtd", [], ["mtr-glue"]), i = new W("mtd", [], ["mml-eqn-num"]), a = 0; a < e.body.length; a++) {
		for (var o = e.body[a], s = [], c = 0; c < o.length; c++) s.push(new W("mtd", [G(o[c], t)]));
		e.tags && e.tags[a] && (s.unshift(r), s.push(r), e.leqno ? s.unshift(i) : s.push(i)), n.push(new W("mtr", s));
	}
	var l = new W("mtable", n), u = e.arraystretch === .5 ? .1 : .16 + e.arraystretch - 1 + (e.addJot ? .09 : 0);
	l.setAttribute("rowspacing", E(u));
	var d = "", f = "";
	if (e.cols && e.cols.length > 0) {
		var p = e.cols, m = "", h = !1, g = 0, _ = p.length;
		p[0].type === "separator" && (d += "top ", g = 1), p[p.length - 1].type === "separator" && (d += "bottom ", --_);
		for (var v = g; v < _; v++) {
			var y = p[v];
			y.type === "align" ? (f += Hi[y.align], h && (m += "none "), h = !0) : y.type === "separator" && (h &&= (m += y.separator === "|" ? "solid " : "dashed ", !1));
		}
		l.setAttribute("columnalign", f.trim()), /[sd]/.test(m) && l.setAttribute("columnlines", m.trim());
	}
	if (e.colSeparationType === "align") {
		for (var b = e.cols || [], x = "", S = 1; S < b.length; S++) x += S % 2 ? "0em " : "1em ";
		l.setAttribute("columnspacing", x.trim());
	} else e.colSeparationType === "alignat" || e.colSeparationType === "gather" ? l.setAttribute("columnspacing", "0em") : e.colSeparationType === "small" ? l.setAttribute("columnspacing", "0.2778em") : e.colSeparationType === "CD" ? l.setAttribute("columnspacing", "0.5em") : l.setAttribute("columnspacing", "1em");
	var ee = "", te = e.hLinesBeforeRow;
	d += te[0].length > 0 ? "left " : "", d += te[te.length - 1].length > 0 ? "right " : "";
	for (var ne = 1; ne < te.length - 1; ne++) ee += te[ne].length === 0 ? "none " : te[ne][0] ? "dashed " : "solid ";
	return /[sd]/.test(ee) && l.setAttribute("rowlines", ee.trim()), d !== "" && (l = new W("menclose", [l]), l.setAttribute("notation", d.trim())), e.arraystretch && e.arraystretch < 1 && (l = new W("mstyle", [l]), l.setAttribute("scriptlevel", "1")), l;
}, Wi = function(e, t) {
	e.envName.includes("ed") || Ii(e);
	var n = [], r = e.envName.includes("at") ? "alignat" : "align", i = e.envName === "split", a = zi(e.parser, {
		cols: n,
		addJot: !0,
		autoTag: i ? void 0 : Ri(e.envName),
		emptySingleRow: !0,
		colSeparationType: r,
		maxNumCols: i ? 2 : void 0,
		leqno: e.parser.settings.leqno
	}, "display"), o = 0, s = 0, c = {
		type: "ordgroup",
		mode: e.mode,
		body: []
	};
	if (t[0] && t[0].type === "ordgroup") {
		for (var l = "", u = 0; u < t[0].body.length; u++) {
			var d = K(t[0].body[u], "textord");
			l += d.text;
		}
		o = Number(l), s = o * 2;
	}
	var f = !s;
	a.body.forEach(function(e) {
		for (var t = 1; t < e.length; t += 2) K(K(e[t], "styling").body[0], "ordgroup").body.unshift(c);
		if (f) s < e.length && (s = e.length);
		else {
			var n = e.length / 2;
			if (o < n) throw new C("Too many math in a row: " + ("expected " + o + ", but got " + n), e[0]);
		}
	});
	for (var p = 0; p < s; ++p) {
		var m = "r", h = 0;
		p % 2 == 1 ? m = "l" : p > 0 && f && (h = 1), n[p] = {
			type: "align",
			align: m,
			pregap: h,
			postgap: 0
		};
	}
	return a.colSeparationType = f ? "align" : "alignat", a;
};
ji({
	type: "array",
	names: ["array", "darray"],
	props: { numArgs: 1 },
	handler(e, t) {
		var n = (Dr(t[0]) ? [t[0]] : K(t[0], "ordgroup").body).map(function(e) {
			var t = Er(e).text;
			if ("lcr".includes(t)) return {
				type: "align",
				align: t
			};
			if (t === "|") return {
				type: "separator",
				separator: "|"
			};
			if (t === ":") return {
				type: "separator",
				separator: ":"
			};
			throw new C("Unknown column alignment: " + t, e);
		}), r = {
			cols: n,
			hskipBeforeAndAfter: !0,
			maxNumCols: n.length
		};
		return zi(e.parser, r, Bi(e.envName));
	},
	htmlBuilder: Vi,
	mathmlBuilder: Ui
}), ji({
	type: "array",
	names: [
		"matrix",
		"pmatrix",
		"bmatrix",
		"Bmatrix",
		"vmatrix",
		"Vmatrix",
		"matrix*",
		"pmatrix*",
		"bmatrix*",
		"Bmatrix*",
		"vmatrix*",
		"Vmatrix*"
	],
	props: { numArgs: 0 },
	handler(e) {
		var t = {
			matrix: null,
			pmatrix: ["(", ")"],
			bmatrix: ["[", "]"],
			Bmatrix: ["\\{", "\\}"],
			vmatrix: ["|", "|"],
			Vmatrix: ["\\Vert", "\\Vert"]
		}[e.envName.replace("*", "")], n = "c", r = {
			hskipBeforeAndAfter: !1,
			cols: [{
				type: "align",
				align: n
			}]
		};
		if (e.envName.charAt(e.envName.length - 1) === "*") {
			var i = e.parser;
			if (i.consumeSpaces(), i.fetch().text === "[") {
				if (i.consume(), i.consumeSpaces(), n = i.fetch().text, !"lcr".includes(n)) throw new C("Expected l or c or r", i.nextToken);
				i.consume(), i.consumeSpaces(), i.expect("]"), i.consume(), r.cols = [{
					type: "align",
					align: n
				}];
			}
		}
		var a = zi(e.parser, r, Bi(e.envName)), o = Math.max(0, ...a.body.map((e) => e.length));
		return a.cols = Array(o).fill({
			type: "align",
			align: n
		}), t ? {
			type: "leftright",
			mode: e.mode,
			body: [a],
			left: t[0],
			right: t[1],
			rightColor: void 0
		} : a;
	},
	htmlBuilder: Vi,
	mathmlBuilder: Ui
}), ji({
	type: "array",
	names: ["smallmatrix"],
	props: { numArgs: 0 },
	handler(e) {
		var t = zi(e.parser, { arraystretch: .5 }, "script");
		return t.colSeparationType = "small", t;
	},
	htmlBuilder: Vi,
	mathmlBuilder: Ui
}), ji({
	type: "array",
	names: ["subarray"],
	props: { numArgs: 1 },
	handler(e, t) {
		var n = (Dr(t[0]) ? [t[0]] : K(t[0], "ordgroup").body).map(function(e) {
			var t = Er(e).text;
			if ("lc".includes(t)) return {
				type: "align",
				align: t
			};
			throw new C("Unknown column alignment: " + t, e);
		});
		if (n.length > 1) throw new C("{subarray} can contain only one column");
		var r = {
			cols: n,
			hskipBeforeAndAfter: !1,
			arraystretch: .5
		}, i = zi(e.parser, r, "script");
		if (i.body.length > 0 && i.body[0].length > 1) throw new C("{subarray} can contain only one column");
		return i;
	},
	htmlBuilder: Vi,
	mathmlBuilder: Ui
}), ji({
	type: "array",
	names: [
		"cases",
		"dcases",
		"rcases",
		"drcases"
	],
	props: { numArgs: 0 },
	handler(e) {
		var t = zi(e.parser, {
			arraystretch: 1.2,
			cols: [{
				type: "align",
				align: "l",
				pregap: 0,
				postgap: 1
			}, {
				type: "align",
				align: "l",
				pregap: 0,
				postgap: 0
			}]
		}, Bi(e.envName));
		return {
			type: "leftright",
			mode: e.mode,
			body: [t],
			left: e.envName.includes("r") ? "." : "\\{",
			right: e.envName.includes("r") ? "\\}" : ".",
			rightColor: void 0
		};
	},
	htmlBuilder: Vi,
	mathmlBuilder: Ui
}), ji({
	type: "array",
	names: [
		"align",
		"align*",
		"aligned",
		"split"
	],
	props: { numArgs: 0 },
	handler: Wi,
	htmlBuilder: Vi,
	mathmlBuilder: Ui
}), ji({
	type: "array",
	names: [
		"gathered",
		"gather",
		"gather*"
	],
	props: { numArgs: 0 },
	handler(e) {
		Li.has(e.envName) && Ii(e);
		var t = {
			cols: [{
				type: "align",
				align: "c"
			}],
			addJot: !0,
			colSeparationType: "gather",
			autoTag: Ri(e.envName),
			emptySingleRow: !0,
			leqno: e.parser.settings.leqno
		};
		return zi(e.parser, t, "display");
	},
	htmlBuilder: Vi,
	mathmlBuilder: Ui
}), ji({
	type: "array",
	names: [
		"alignat",
		"alignat*",
		"alignedat"
	],
	props: { numArgs: 1 },
	handler: Wi,
	htmlBuilder: Vi,
	mathmlBuilder: Ui
}), ji({
	type: "array",
	names: ["equation", "equation*"],
	props: { numArgs: 0 },
	handler(e) {
		Ii(e);
		var t = {
			autoTag: Ri(e.envName),
			emptySingleRow: !0,
			singleRow: !0,
			maxNumCols: 1,
			leqno: e.parser.settings.leqno
		};
		return zi(e.parser, t, "display");
	},
	htmlBuilder: Vi,
	mathmlBuilder: Ui
}), ji({
	type: "array",
	names: ["CD"],
	props: { numArgs: 0 },
	handler(e) {
		return Ii(e), Vr(e.parser);
	},
	htmlBuilder: Vi,
	mathmlBuilder: Ui
}), q("\\nonumber", "\\gdef\\@eqnsw{0}"), q("\\notag", "\\nonumber"), H({
	type: "text",
	names: ["\\hline", "\\hdashline"],
	props: {
		numArgs: 0,
		allowedInText: !0,
		allowedInMath: !0
	},
	handler(e, t) {
		throw new C(e.funcName + " valid only within array environment");
	}
});
var Gi = Ai;
H({
	type: "environment",
	names: ["\\begin", "\\end"],
	props: {
		numArgs: 1,
		argTypes: ["text"]
	},
	handler(e, t) {
		var { parser: n, funcName: r } = e, i = t[0];
		if (i.type !== "ordgroup") throw new C("Invalid environment name", i);
		for (var a = "", o = 0; o < i.body.length; ++o) a += K(i.body[o], "textord").text;
		if (r === "\\begin") {
			if (!Gi.hasOwnProperty(a)) throw new C("No such environment: " + a, i);
			var s = Gi[a], { args: c, optArgs: l } = n.parseArguments("\\begin{" + a + "}", s), u = {
				mode: n.mode,
				envName: a,
				parser: n
			}, d = s.handler(u, c, l);
			n.expect("\\end", !1);
			var f = n.nextToken, p = K(n.parseFunction(), "environment");
			if (p.name !== a) throw new C("Mismatch: \\begin{" + a + "} matched by \\end{" + p.name + "}", f);
			return d;
		}
		return {
			type: "environment",
			mode: n.mode,
			name: a,
			nameGroup: i
		};
	}
});
var Ki = (e, t) => {
	var n = e.font, r = t.withFont(n);
	return U(e.body, r);
}, qi = (e, t) => {
	var n = e.font, r = t.withFont(n);
	return G(e.body, r);
}, Ji = {
	"\\Bbb": "\\mathbb",
	"\\bold": "\\mathbf",
	"\\frak": "\\mathfrak"
};
H({
	type: "font",
	names: [
		"\\mathrm",
		"\\mathit",
		"\\mathbf",
		"\\mathnormal",
		"\\mathsfit",
		"\\mathbb",
		"\\mathcal",
		"\\mathfrak",
		"\\mathscr",
		"\\mathsf",
		"\\mathtt",
		"\\Bbb",
		"\\bold",
		"\\frak"
	],
	props: {
		numArgs: 1,
		allowedInArgument: !0
	},
	handler: (e, t) => {
		var { parser: n, funcName: r } = e, i = Wn(t[0]), a = r;
		return a in Ji && (a = Ji[a]), {
			type: "font",
			mode: n.mode,
			font: a.slice(1),
			body: i
		};
	},
	htmlBuilder: Ki,
	mathmlBuilder: qi
}), H({
	type: "mclass",
	names: ["\\boldsymbol", "\\bm"],
	props: { numArgs: 1 },
	handler: (e, t) => {
		var { parser: n } = e, r = t[0];
		return {
			type: "mclass",
			mode: n.mode,
			mclass: Fr(r),
			body: [{
				type: "font",
				mode: n.mode,
				font: "boldsymbol",
				body: r
			}],
			isCharacterBox: we(r)
		};
	}
}), H({
	type: "font",
	names: [
		"\\rm",
		"\\sf",
		"\\tt",
		"\\bf",
		"\\it",
		"\\cal"
	],
	props: {
		numArgs: 0,
		allowedInText: !0
	},
	handler: (e, t) => {
		var { parser: n, funcName: r, breakOnTokenText: i } = e, { mode: a } = n, o = n.parseExpression(!0, i);
		return {
			type: "font",
			mode: a,
			font: "math" + r.slice(1),
			body: {
				type: "ordgroup",
				mode: n.mode,
				body: o
			}
		};
	},
	htmlBuilder: Ki,
	mathmlBuilder: qi
});
var Yi = (e, t) => {
	var n = t.style, r = n.fracNum(), i = n.fracDen(), a = t.havingStyle(r), o = U(e.numer, a, t);
	if (e.continued) {
		var s = 8.5 / t.fontMetrics().ptPerEm, c = 3.5 / t.fontMetrics().ptPerEm;
		o.height = o.height < s ? s : o.height, o.depth = o.depth < c ? c : o.depth;
	}
	a = t.havingStyle(i);
	var l = U(e.denom, a, t), u, d, f;
	e.hasBarLine ? (e.barSize ? (d = T(e.barSize, t), u = En("frac-line", t, d)) : u = En("frac-line", t), d = u.height, f = u.height) : (u = null, d = 0, f = t.fontMetrics().defaultRuleThickness);
	var p, m, h;
	n.size === w.DISPLAY.size ? (p = t.fontMetrics().num1, m = d > 0 ? 3 * f : 7 * f, h = t.fontMetrics().denom1) : (d > 0 ? (p = t.fontMetrics().num2, m = f) : (p = t.fontMetrics().num3, m = 3 * f), h = t.fontMetrics().denom2);
	var g;
	if (u) {
		var _ = t.fontMetrics().axisHeight;
		p - o.depth - (_ + .5 * d) < m && (p += m - (p - o.depth - (_ + .5 * d))), _ - .5 * d - (l.height - h) < m && (h += m - (_ - .5 * d - (l.height - h)));
		var v = -(_ - .5 * d);
		g = B({
			positionType: "individualShift",
			children: [
				{
					type: "elem",
					elem: l,
					shift: h
				},
				{
					type: "elem",
					elem: u,
					shift: v
				},
				{
					type: "elem",
					elem: o,
					shift: -p
				}
			]
		});
	} else {
		var y = p - o.depth - (l.height - h);
		y < m && (p += .5 * (m - y), h += .5 * (m - y)), g = B({
			positionType: "individualShift",
			children: [{
				type: "elem",
				elem: l,
				shift: h
			}, {
				type: "elem",
				elem: o,
				shift: -p
			}]
		});
	}
	a = t.havingStyle(n), g.height *= a.sizeMultiplier / t.sizeMultiplier, g.depth *= a.sizeMultiplier / t.sizeMultiplier;
	var b = n.size === w.DISPLAY.size ? t.fontMetrics().delim1 : n.size === w.SCRIPTSCRIPT.size ? t.havingStyle(w.SCRIPT).fontMetrics().delim2 : t.fontMetrics().delim2, x = e.leftDelim == null ? tr(t, ["mopen"]) : xi(e.leftDelim, b, !0, t.havingStyle(n), e.mode, ["mopen"]), S = e.continued ? z([]) : e.rightDelim == null ? tr(t, ["mclose"]) : xi(e.rightDelim, b, !0, t.havingStyle(n), e.mode, ["mclose"]);
	return z(["mord"].concat(a.sizingClasses(t)), [
		x,
		z(["mfrac"], [g]),
		S
	], t);
}, Xi = (e, t) => {
	var n = new W("mfrac", [G(e.numer, t), G(e.denom, t)]);
	if (!e.hasBarLine) n.setAttribute("linethickness", "0px");
	else if (e.barSize) {
		var r = T(e.barSize, t);
		n.setAttribute("linethickness", E(r));
	}
	if (e.leftDelim != null || e.rightDelim != null) {
		var i = [];
		if (e.leftDelim != null) {
			var a = new W("mo", [new rr(e.leftDelim.replace("\\", ""))]);
			a.setAttribute("fence", "true"), i.push(a);
		}
		if (i.push(n), e.rightDelim != null) {
			var o = new W("mo", [new rr(e.rightDelim.replace("\\", ""))]);
			o.setAttribute("fence", "true"), i.push(o);
		}
		return sr(i);
	}
	return n;
}, Zi = (e, t) => t ? {
	type: "styling",
	mode: e.mode,
	style: t,
	body: [e]
} : e;
H({
	type: "genfrac",
	names: [
		"\\cfrac",
		"\\dfrac",
		"\\frac",
		"\\tfrac",
		"\\dbinom",
		"\\binom",
		"\\tbinom",
		"\\\\atopfrac",
		"\\\\bracefrac",
		"\\\\brackfrac"
	],
	props: {
		numArgs: 2,
		allowedInArgument: !0
	},
	handler: (e, t) => {
		var { parser: n, funcName: r } = e, i = t[0], a = t[1], o, s = null, c = null;
		switch (r) {
			case "\\cfrac":
			case "\\dfrac":
			case "\\frac":
			case "\\tfrac":
				o = !0;
				break;
			case "\\\\atopfrac":
				o = !1;
				break;
			case "\\dbinom":
			case "\\binom":
			case "\\tbinom":
				o = !1, s = "(", c = ")";
				break;
			case "\\\\bracefrac":
				o = !1, s = "\\{", c = "\\}";
				break;
			case "\\\\brackfrac":
				o = !1, s = "[", c = "]";
				break;
			default: throw Error("Unrecognized genfrac command");
		}
		var l = r === "\\cfrac", u = null;
		return l || r.startsWith("\\d") ? u = "display" : r.startsWith("\\t") && (u = "text"), Zi({
			type: "genfrac",
			mode: n.mode,
			numer: i,
			denom: a,
			continued: l,
			hasBarLine: o,
			leftDelim: s,
			rightDelim: c,
			barSize: null
		}, u);
	},
	htmlBuilder: Yi,
	mathmlBuilder: Xi
}), H({
	type: "infix",
	names: [
		"\\over",
		"\\choose",
		"\\atop",
		"\\brace",
		"\\brack"
	],
	props: {
		numArgs: 0,
		infix: !0
	},
	handler(e) {
		var { parser: t, funcName: n, token: r } = e, i;
		switch (n) {
			case "\\over":
				i = "\\frac";
				break;
			case "\\choose":
				i = "\\binom";
				break;
			case "\\atop":
				i = "\\\\atopfrac";
				break;
			case "\\brace":
				i = "\\\\bracefrac";
				break;
			case "\\brack":
				i = "\\\\brackfrac";
				break;
			default: throw Error("Unrecognized infix genfrac command");
		}
		return {
			type: "infix",
			mode: t.mode,
			replaceWith: i,
			token: r
		};
	}
});
var Qi = [
	"display",
	"text",
	"script",
	"scriptscript"
], $i = function(e) {
	var t = null;
	return e.length > 0 && (t = e, t = t === "." ? null : t), t;
};
H({
	type: "genfrac",
	names: ["\\genfrac"],
	props: {
		numArgs: 6,
		allowedInArgument: !0,
		argTypes: [
			"math",
			"math",
			"size",
			"text",
			"math",
			"math"
		]
	},
	handler(e, t) {
		var { parser: n } = e, r = t[4], i = t[5], a = Wn(t[0]), o = a.type === "atom" && a.family === "open" ? $i(a.text) : null, s = Wn(t[1]), c = s.type === "atom" && s.family === "close" ? $i(s.text) : null, l = K(t[2], "size"), u, d = null;
		l.isBlank ? u = !0 : (d = l.value, u = d.number > 0);
		var f = null, p = t[3];
		if (p.type === "ordgroup") {
			if (p.body.length > 0) {
				var m = K(p.body[0], "textord");
				f = Qi[Number(m.text)];
			}
		} else p = K(p, "textord"), f = Qi[Number(p.text)];
		return Zi({
			type: "genfrac",
			mode: n.mode,
			numer: r,
			denom: i,
			continued: !1,
			hasBarLine: u,
			barSize: d,
			leftDelim: o,
			rightDelim: c
		}, f);
	}
}), H({
	type: "infix",
	names: ["\\above"],
	props: {
		numArgs: 1,
		argTypes: ["size"],
		infix: !0
	},
	handler(e, t) {
		var { parser: n, funcName: r, token: i } = e;
		return {
			type: "infix",
			mode: n.mode,
			replaceWith: "\\\\abovefrac",
			size: K(t[0], "size").value,
			token: i
		};
	}
}), H({
	type: "genfrac",
	names: ["\\\\abovefrac"],
	props: {
		numArgs: 3,
		argTypes: [
			"math",
			"size",
			"math"
		]
	},
	handler: (e, t) => {
		var { parser: n, funcName: r } = e, i = t[0], a = K(t[1], "infix").size;
		if (!a) throw Error("\\\\abovefrac expected size, but got " + String(a));
		var o = t[2], s = a.number > 0;
		return {
			type: "genfrac",
			mode: n.mode,
			numer: i,
			denom: o,
			continued: !1,
			hasBarLine: s,
			barSize: a,
			leftDelim: null,
			rightDelim: null
		};
	}
});
var ea = (e, t) => {
	var n = t.style, r, i;
	e.type === "supsub" ? (r = e.sup ? U(e.sup, t.havingStyle(n.sup()), t) : U(e.sub, t.havingStyle(n.sub()), t), i = K(e.base, "horizBrace")) : i = K(e, "horizBrace");
	var a = U(i.base, t.havingBaseStyle(w.DISPLAY)), o = xr(i, t), s = i.isOver ? B({
		positionType: "firstBaseline",
		children: [
			{
				type: "elem",
				elem: a
			},
			{
				type: "kern",
				size: .1
			},
			{
				type: "elem",
				elem: o,
				wrapperClasses: ["svg-align"]
			}
		]
	}) : B({
		positionType: "bottom",
		positionData: a.depth + .1 + o.height,
		children: [
			{
				type: "elem",
				elem: o,
				wrapperClasses: ["svg-align"]
			},
			{
				type: "kern",
				size: .1
			},
			{
				type: "elem",
				elem: a
			}
		]
	});
	if (r) {
		var c = z(["minner", i.isOver ? "mover" : "munder"], [s], t);
		s = i.isOver ? B({
			positionType: "firstBaseline",
			children: [
				{
					type: "elem",
					elem: c
				},
				{
					type: "kern",
					size: .2
				},
				{
					type: "elem",
					elem: r
				}
			]
		}) : B({
			positionType: "bottom",
			positionData: c.depth + .2 + r.height + r.depth,
			children: [
				{
					type: "elem",
					elem: r
				},
				{
					type: "kern",
					size: .2
				},
				{
					type: "elem",
					elem: c
				}
			]
		});
	}
	return z(["minner", i.isOver ? "mover" : "munder"], [s], t);
};
H({
	type: "horizBrace",
	names: [
		"\\overbrace",
		"\\underbrace",
		"\\overbracket",
		"\\underbracket"
	],
	props: { numArgs: 1 },
	handler(e, t) {
		var { parser: n, funcName: r } = e;
		return {
			type: "horizBrace",
			mode: n.mode,
			label: r,
			isOver: r.includes("\\over"),
			base: t[0]
		};
	},
	htmlBuilder: ea,
	mathmlBuilder: (e, t) => {
		var n = vr(e.label);
		return new W(e.isOver ? "mover" : "munder", [G(e.base, t), n]);
	}
}), H({
	type: "href",
	names: ["\\href"],
	props: {
		numArgs: 2,
		argTypes: ["url", "original"],
		allowedInText: !0
	},
	handler: (e, t) => {
		var { parser: n } = e, r = t[1], i = K(t[0], "url").url;
		return n.settings.isTrusted({
			command: "\\href",
			url: i
		}) ? {
			type: "href",
			mode: n.mode,
			href: i,
			body: Gn(r)
		} : n.formatUnsupportedCmd("\\href");
	},
	htmlBuilder: (e, t) => {
		var n = Xn(e.body, t, !1);
		return Dn(e.href, [], n, t);
	},
	mathmlBuilder: (e, t) => {
		var n = fr(e.body, t);
		return n instanceof W || (n = new W("mrow", [n])), n.setAttribute("href", e.href), n;
	}
}), H({
	type: "href",
	names: ["\\url"],
	props: {
		numArgs: 1,
		argTypes: ["url"],
		allowedInText: !0
	},
	handler: (e, t) => {
		var { parser: n } = e, r = K(t[0], "url").url;
		if (!n.settings.isTrusted({
			command: "\\url",
			url: r
		})) return n.formatUnsupportedCmd("\\url");
		for (var i = [], a = 0; a < r.length; a++) {
			var o = r[a];
			o === "~" && (o = "\\textasciitilde"), i.push({
				type: "textord",
				mode: "text",
				text: o
			});
		}
		var s = {
			type: "text",
			mode: n.mode,
			font: "\\texttt",
			body: i
		};
		return {
			type: "href",
			mode: n.mode,
			href: r,
			body: Gn(s)
		};
	}
}), H({
	type: "hbox",
	names: ["\\hbox"],
	props: {
		numArgs: 1,
		argTypes: ["text"],
		allowedInText: !0,
		primitive: !0
	},
	handler(e, t) {
		var { parser: n } = e;
		return {
			type: "hbox",
			mode: n.mode,
			body: Gn(t[0])
		};
	},
	htmlBuilder(e, t) {
		return On(Xn(e.body, t.withFont(""), !1));
	},
	mathmlBuilder(e, t) {
		return new W("mrow", dr(e.body, t.withFont("")));
	}
}), H({
	type: "html",
	names: [
		"\\htmlClass",
		"\\htmlId",
		"\\htmlStyle",
		"\\htmlData"
	],
	props: {
		numArgs: 2,
		argTypes: ["raw", "original"],
		allowedInText: !0
	},
	handler: (e, t) => {
		var { parser: n, funcName: r, token: i } = e, a = K(t[0], "raw").string, o = t[1];
		n.settings.strict && n.settings.reportNonstrict("htmlExtension", "HTML extension is disabled on strict mode");
		var s, c = {};
		switch (r) {
			case "\\htmlClass":
				c.class = a, s = {
					command: "\\htmlClass",
					class: a
				};
				break;
			case "\\htmlId":
				c.id = a, s = {
					command: "\\htmlId",
					id: a
				};
				break;
			case "\\htmlStyle":
				c.style = a, s = {
					command: "\\htmlStyle",
					style: a
				};
				break;
			case "\\htmlData":
				for (var l = a.split(","), u = 0; u < l.length; u++) {
					var d = l[u], f = d.indexOf("=");
					if (f < 0) throw new C("\\htmlData key/value '" + d + "' missing equals sign");
					var p = d.slice(0, f), m = d.slice(f + 1);
					c["data-" + p.trim()] = m;
				}
				s = {
					command: "\\htmlData",
					attributes: c
				};
				break;
			default: throw Error("Unrecognized html command");
		}
		return n.settings.isTrusted(s) ? {
			type: "html",
			mode: n.mode,
			attributes: c,
			body: Gn(o)
		} : n.formatUnsupportedCmd(r);
	},
	htmlBuilder: (e, t) => {
		var n = Xn(e.body, t, !1), r = ["enclosing"];
		e.attributes.class && r.push(...e.attributes.class.trim().split(/\s+/));
		var i = z(r, n, t);
		for (var a in e.attributes) a !== "class" && e.attributes.hasOwnProperty(a) && i.setAttribute(a, e.attributes[a]);
		return i;
	},
	mathmlBuilder: (e, t) => fr(e.body, t)
}), H({
	type: "htmlmathml",
	names: ["\\html@mathml"],
	props: {
		numArgs: 2,
		allowedInArgument: !0,
		allowedInText: !0
	},
	handler: (e, t) => {
		var { parser: n } = e;
		return {
			type: "htmlmathml",
			mode: n.mode,
			html: Gn(t[0]),
			mathml: Gn(t[1])
		};
	},
	htmlBuilder: (e, t) => On(Xn(e.html, t, !1)),
	mathmlBuilder: (e, t) => fr(e.mathml, t)
});
var ta = function(e) {
	if (/^[-+]? *(\d+(\.\d*)?|\.\d+)$/.test(e)) return {
		number: +e,
		unit: "bp"
	};
	var t = /([-+]?) *(\d+(?:\.\d*)?|\.\d+) *([a-z]{2})/.exec(e);
	if (!t) throw new C("Invalid size: '" + e + "' in \\includegraphics");
	var n = {
		number: +(t[1] + t[2]),
		unit: t[3]
	};
	if (!ct(n)) throw new C("Invalid unit: '" + n.unit + "' in \\includegraphics.");
	return n;
};
H({
	type: "includegraphics",
	names: ["\\includegraphics"],
	props: {
		numArgs: 1,
		numOptionalArgs: 1,
		argTypes: ["raw", "url"],
		allowedInText: !1
	},
	handler: (e, t, n) => {
		var { parser: r } = e, i = {
			number: 0,
			unit: "em"
		}, a = {
			number: .9,
			unit: "em"
		}, o = {
			number: 0,
			unit: "em"
		}, s = "";
		if (n[0]) for (var c = K(n[0], "raw").string.split(","), l = 0; l < c.length; l++) {
			var u = c[l].split("=");
			if (u.length === 2) {
				var d = u[1].trim();
				switch (u[0].trim()) {
					case "alt":
						s = d;
						break;
					case "width":
						i = ta(d);
						break;
					case "height":
						a = ta(d);
						break;
					case "totalheight":
						o = ta(d);
						break;
					default: throw new C("Invalid key: '" + u[0] + "' in \\includegraphics.");
				}
			}
		}
		var f = K(t[0], "url").url;
		return s === "" && (s = f, s = s.replace(/^.*[\\/]/, ""), s = s.substring(0, s.lastIndexOf("."))), r.settings.isTrusted({
			command: "\\includegraphics",
			url: f
		}) ? {
			type: "includegraphics",
			mode: r.mode,
			alt: s,
			width: i,
			height: a,
			totalheight: o,
			src: f
		} : r.formatUnsupportedCmd("\\includegraphics");
	},
	htmlBuilder: (e, t) => {
		var n = T(e.height, t), r = 0;
		e.totalheight.number > 0 && (r = T(e.totalheight, t) - n);
		var i = 0;
		e.width.number > 0 && (i = T(e.width, t));
		var a = { height: E(n + r) };
		i > 0 && (a.width = E(i)), r > 0 && (a.verticalAlign = E(-r));
		var o = new _t(e.src, e.alt, a);
		return o.height = n, o.depth = r, o;
	},
	mathmlBuilder: (e, t) => {
		var n = new W("mglyph", []);
		n.setAttribute("alt", e.alt);
		var r = T(e.height, t), i = 0;
		if (e.totalheight.number > 0 && (i = T(e.totalheight, t) - r, n.setAttribute("valign", E(-i))), n.setAttribute("height", E(r + i)), e.width.number > 0) {
			var a = T(e.width, t);
			n.setAttribute("width", E(a));
		}
		return n.setAttribute("src", e.src), n;
	}
}), H({
	type: "kern",
	names: [
		"\\kern",
		"\\mkern",
		"\\hskip",
		"\\mskip"
	],
	props: {
		numArgs: 1,
		argTypes: ["size"],
		primitive: !0,
		allowedInText: !0
	},
	handler(e, t) {
		var { parser: n, funcName: r } = e, i = K(t[0], "size");
		if (n.settings.strict) {
			var a = r[1] === "m", o = i.value.unit === "mu";
			a ? (o || n.settings.reportNonstrict("mathVsTextUnits", "LaTeX's " + r + " supports only mu units, " + ("not " + i.value.unit + " units")), n.mode !== "math" && n.settings.reportNonstrict("mathVsTextUnits", "LaTeX's " + r + " works only in math mode")) : o && n.settings.reportNonstrict("mathVsTextUnits", "LaTeX's " + r + " doesn't support mu units");
		}
		return {
			type: "kern",
			mode: n.mode,
			dimension: i.value
		};
	},
	htmlBuilder(e, t) {
		return jn(e.dimension, t);
	},
	mathmlBuilder(e, t) {
		return new ir(T(e.dimension, t));
	}
}), H({
	type: "lap",
	names: [
		"\\mathllap",
		"\\mathrlap",
		"\\mathclap"
	],
	props: {
		numArgs: 1,
		allowedInText: !0
	},
	handler: (e, t) => {
		var { parser: n, funcName: r } = e, i = t[0];
		return {
			type: "lap",
			mode: n.mode,
			alignment: r.slice(5),
			body: i
		};
	},
	htmlBuilder: (e, t) => {
		var n;
		e.alignment === "clap" ? (n = z([], [U(e.body, t)]), n = z(["inner"], [n], t)) : n = z(["inner"], [U(e.body, t)]);
		var r = z(["fix"], []), i = z([e.alignment], [n, r], t), a = z(["strut"]);
		return a.style.height = E(i.height + i.depth), i.depth && (a.style.verticalAlign = E(-i.depth)), i.children.unshift(a), i = z(["thinbox"], [i], t), z(["mord", "vbox"], [i], t);
	},
	mathmlBuilder: (e, t) => {
		var n = new W("mpadded", [G(e.body, t)]);
		if (e.alignment !== "rlap") {
			var r = e.alignment === "llap" ? "-1" : "-0.5";
			n.setAttribute("lspace", r + "width");
		}
		return n.setAttribute("width", "0px"), n;
	}
}), H({
	type: "styling",
	names: ["\\(", "$"],
	props: {
		numArgs: 0,
		allowedInText: !0,
		allowedInMath: !1
	},
	handler(e, t) {
		var { funcName: n, parser: r } = e, i = r.mode;
		r.switchMode("math");
		var a = n === "\\(" ? "\\)" : "$", o = r.parseExpression(!1, a);
		return r.expect(a), r.switchMode(i), {
			type: "styling",
			mode: r.mode,
			style: "text",
			resetFont: !0,
			body: o
		};
	}
}), H({
	type: "text",
	names: ["\\)", "\\]"],
	props: {
		numArgs: 0,
		allowedInText: !0,
		allowedInMath: !1
	},
	handler(e, t) {
		throw new C("Mismatched " + e.funcName);
	}
});
var na = (e, t) => {
	switch (t.style.size) {
		case w.DISPLAY.size: return e.display;
		case w.TEXT.size: return e.text;
		case w.SCRIPT.size: return e.script;
		case w.SCRIPTSCRIPT.size: return e.scriptscript;
		default: return e.text;
	}
};
H({
	type: "mathchoice",
	names: ["\\mathchoice"],
	props: {
		numArgs: 4,
		primitive: !0
	},
	handler: (e, t) => {
		var { parser: n } = e;
		return {
			type: "mathchoice",
			mode: n.mode,
			display: Gn(t[0]),
			text: Gn(t[1]),
			script: Gn(t[2]),
			scriptscript: Gn(t[3])
		};
	},
	htmlBuilder: (e, t) => On(Xn(na(e, t), t, !1)),
	mathmlBuilder: (e, t) => fr(na(e, t), t)
});
var ra = (e, t, n, r, i, a, o) => {
	e = z([], [e]);
	var s = n && we(n), c, l;
	if (t) {
		var u = U(t, r.havingStyle(i.sup()), r);
		l = {
			elem: u,
			kern: Math.max(r.fontMetrics().bigOpSpacing1, r.fontMetrics().bigOpSpacing3 - u.depth)
		};
	}
	if (n) {
		var d = U(n, r.havingStyle(i.sub()), r);
		c = {
			elem: d,
			kern: Math.max(r.fontMetrics().bigOpSpacing2, r.fontMetrics().bigOpSpacing4 - d.height)
		};
	}
	var f;
	if (l && c) f = B({
		positionType: "bottom",
		positionData: r.fontMetrics().bigOpSpacing5 + c.elem.height + c.elem.depth + c.kern + e.depth + o,
		children: [
			{
				type: "kern",
				size: r.fontMetrics().bigOpSpacing5
			},
			{
				type: "elem",
				elem: c.elem,
				marginLeft: E(-a)
			},
			{
				type: "kern",
				size: c.kern
			},
			{
				type: "elem",
				elem: e
			},
			{
				type: "kern",
				size: l.kern
			},
			{
				type: "elem",
				elem: l.elem,
				marginLeft: E(a)
			},
			{
				type: "kern",
				size: r.fontMetrics().bigOpSpacing5
			}
		]
	});
	else if (c) f = B({
		positionType: "top",
		positionData: e.height - o,
		children: [
			{
				type: "kern",
				size: r.fontMetrics().bigOpSpacing5
			},
			{
				type: "elem",
				elem: c.elem,
				marginLeft: E(-a)
			},
			{
				type: "kern",
				size: c.kern
			},
			{
				type: "elem",
				elem: e
			}
		]
	});
	else if (l) f = B({
		positionType: "bottom",
		positionData: e.depth + o,
		children: [
			{
				type: "elem",
				elem: e
			},
			{
				type: "kern",
				size: l.kern
			},
			{
				type: "elem",
				elem: l.elem,
				marginLeft: E(a)
			},
			{
				type: "kern",
				size: r.fontMetrics().bigOpSpacing5
			}
		]
	});
	else return e;
	var p = [f];
	if (c && a !== 0 && !s) {
		var m = z(["mspace"], [], r);
		m.style.marginRight = E(a), p.unshift(m);
	}
	return z(["mop", "op-limits"], p, r);
}, ia = new Set(["\\smallint"]), aa = (e, t) => {
	var n, r, i = !1, a;
	e.type === "supsub" ? (n = e.sup, r = e.sub, a = K(e.base, "op"), i = !0) : a = K(e, "op");
	var o = t.style, s = !1;
	o.size === w.DISPLAY.size && a.symbol && !ia.has(a.name) && (s = !0);
	var c, l;
	if (a.symbol) {
		var u = s ? "Size2-Regular" : "Size1-Regular", d = "";
		if ((a.name === "\\oiint" || a.name === "\\oiiint") && (d = a.name.slice(1), a.name = d === "oiint" ? "\\iint" : "\\iiint"), c = vn(a.name, u, "math", t, [
			"mop",
			"op-symbol",
			s ? "large-op" : "small-op"
		]), l = c.italic, d.length > 0) {
			var f = Fn(d + "Size" + (s ? "2" : "1"), t);
			c = B({
				positionType: "individualShift",
				children: [{
					type: "elem",
					elem: c,
					shift: 0
				}, {
					type: "elem",
					elem: f,
					shift: s ? .08 : 0
				}]
			}), a.name = "\\" + d, c.classes.unshift("mop"), c.italic = l;
		}
	} else if (a.body) {
		var p = Xn(a.body, t, !0);
		p.length === 1 && p[0] instanceof yt ? (c = p[0], c.classes[0] = "mop") : c = z(["mop"], p, t);
	} else {
		for (var m = [], h = 1; h < a.name.length; h++) m.push(yn(a.name[h], a.mode, t));
		c = z(["mop"], m, t);
	}
	var g = 0, _ = 0;
	return (c instanceof yt || a.name === "\\oiint" || a.name === "\\oiiint") && !a.suppressBaseShift && (g = (c.height - c.depth) / 2 - t.fontMetrics().axisHeight, _ = c.italic ?? 0), i ? ra(c, n, r, t, o, _, g) : (g && (c.style.position = "relative", c.style.top = E(g)), c);
}, oa = (e, t) => {
	var n;
	if (e.symbol) n = new W("mo", [or(e.name, e.mode)]), ia.has(e.name) && n.setAttribute("largeop", "false");
	else if (e.body) n = new W("mo", dr(e.body, t));
	else {
		n = new W("mi", [new rr(e.name.slice(1))]);
		var r = new W("mo", [or("⁡", "text")]);
		n = e.parentIsSupSub ? new W("mrow", [n, r]) : nr([n, r]);
	}
	return n;
}, sa = {
	"∏": "\\prod",
	"∐": "\\coprod",
	"∑": "\\sum",
	"⋀": "\\bigwedge",
	"⋁": "\\bigvee",
	"⋂": "\\bigcap",
	"⋃": "\\bigcup",
	"⨀": "\\bigodot",
	"⨁": "\\bigoplus",
	"⨂": "\\bigotimes",
	"⨄": "\\biguplus",
	"⨆": "\\bigsqcup"
};
H({
	type: "op",
	names: /* @__PURE__ */ "\\coprod.\\bigvee.\\bigwedge.\\biguplus.\\bigcap.\\bigcup.\\intop.\\prod.\\sum.\\bigotimes.\\bigoplus.\\bigodot.\\bigsqcup.\\smallint.∏.∐.∑.⋀.⋁.⋂.⋃.⨀.⨁.⨂.⨄.⨆".split("."),
	props: { numArgs: 0 },
	handler: (e, t) => {
		var { parser: n, funcName: r } = e, i = r;
		return i.length === 1 && (i = sa[i]), {
			type: "op",
			mode: n.mode,
			limits: !0,
			parentIsSupSub: !1,
			symbol: !0,
			name: i
		};
	},
	htmlBuilder: aa,
	mathmlBuilder: oa
}), H({
	type: "op",
	names: ["\\mathop"],
	props: {
		numArgs: 1,
		primitive: !0
	},
	handler: (e, t) => {
		var { parser: n } = e, r = t[0];
		return {
			type: "op",
			mode: n.mode,
			limits: !1,
			parentIsSupSub: !1,
			symbol: !1,
			body: Gn(r)
		};
	},
	htmlBuilder: aa,
	mathmlBuilder: oa
});
var ca = {
	"∫": "\\int",
	"∬": "\\iint",
	"∭": "\\iiint",
	"∮": "\\oint",
	"∯": "\\oiint",
	"∰": "\\oiiint"
};
H({
	type: "op",
	names: /* @__PURE__ */ "\\arcsin.\\arccos.\\arctan.\\arctg.\\arcctg.\\arg.\\ch.\\cos.\\cosec.\\cosh.\\cot.\\cotg.\\coth.\\csc.\\ctg.\\cth.\\deg.\\dim.\\exp.\\hom.\\ker.\\lg.\\ln.\\log.\\sec.\\sin.\\sinh.\\sh.\\tan.\\tanh.\\tg.\\th".split("."),
	props: { numArgs: 0 },
	handler(e) {
		var { parser: t, funcName: n } = e;
		return {
			type: "op",
			mode: t.mode,
			limits: !1,
			parentIsSupSub: !1,
			symbol: !1,
			name: n
		};
	},
	htmlBuilder: aa,
	mathmlBuilder: oa
}), H({
	type: "op",
	names: [
		"\\det",
		"\\gcd",
		"\\inf",
		"\\lim",
		"\\max",
		"\\min",
		"\\Pr",
		"\\sup"
	],
	props: { numArgs: 0 },
	handler(e) {
		var { parser: t, funcName: n } = e;
		return {
			type: "op",
			mode: t.mode,
			limits: !0,
			parentIsSupSub: !1,
			symbol: !1,
			name: n
		};
	},
	htmlBuilder: aa,
	mathmlBuilder: oa
}), H({
	type: "op",
	names: [
		"\\int",
		"\\iint",
		"\\iiint",
		"\\oint",
		"\\oiint",
		"\\oiiint",
		"∫",
		"∬",
		"∭",
		"∮",
		"∯",
		"∰"
	],
	props: {
		numArgs: 0,
		allowedInArgument: !0
	},
	handler(e) {
		var { parser: t, funcName: n } = e, r = n;
		return r.length === 1 && (r = ca[r]), {
			type: "op",
			mode: t.mode,
			limits: !1,
			parentIsSupSub: !1,
			symbol: !0,
			name: r
		};
	},
	htmlBuilder: aa,
	mathmlBuilder: oa
});
var la = (e, t) => {
	var n, r, i = !1, a;
	e.type === "supsub" ? (n = e.sup, r = e.sub, a = K(e.base, "operatorname"), i = !0) : a = K(e, "operatorname");
	var o;
	if (a.body.length > 0) {
		for (var s = Xn(a.body.map((e) => {
			var t = "text" in e ? e.text : void 0;
			return typeof t == "string" ? {
				type: "textord",
				mode: e.mode,
				text: t
			} : e;
		}), t.withFont("mathrm"), !0), c = 0; c < s.length; c++) {
			var l = s[c];
			l instanceof yt && (l.text = l.text.replace(/\u2212/, "-").replace(/\u2217/, "*"));
		}
		o = z(["mop"], s, t);
	} else o = z(["mop"], [], t);
	return i ? ra(o, n, r, t, t.style, 0, 0) : o;
};
H({
	type: "operatorname",
	names: ["\\operatorname@", "\\operatornamewithlimits"],
	props: { numArgs: 1 },
	handler: (e, t) => {
		var { parser: n, funcName: r } = e, i = t[0];
		return {
			type: "operatorname",
			mode: n.mode,
			body: Gn(i),
			alwaysHandleSupSub: r === "\\operatornamewithlimits",
			limits: !1,
			parentIsSupSub: !1
		};
	},
	htmlBuilder: la,
	mathmlBuilder: (e, t) => {
		for (var n = dr(e.body, t.withFont("mathrm")), r = !0, i = 0; i < n.length; i++) {
			var a = n[i];
			if (!(a instanceof ir)) if (a instanceof W) switch (a.type) {
				case "mi":
				case "mn":
				case "mspace":
				case "mtext": break;
				case "mo":
					var o = a.children[0];
					a.children.length === 1 && o instanceof rr ? o.text = o.text.replace(/\u2212/, "-").replace(/\u2217/, "*") : r = !1;
					break;
				default: r = !1;
			}
			else r = !1;
		}
		r && (n = [new rr(n.map((e) => e.toText()).join(""))]);
		var s = new W("mi", n);
		s.setAttribute("mathvariant", "normal");
		var c = new W("mo", [or("⁡", "text")]);
		return e.parentIsSupSub ? new W("mrow", [s, c]) : nr([s, c]);
	}
}), q("\\operatorname", "\\@ifstar\\operatornamewithlimits\\operatorname@"), Un({
	type: "ordgroup",
	htmlBuilder(e, t) {
		return e.semisimple ? On(Xn(e.body, t, !1)) : z(["mord"], Xn(e.body, t, !0), t);
	},
	mathmlBuilder(e, t) {
		return fr(e.body, t, !0);
	}
}), H({
	type: "overline",
	names: ["\\overline"],
	props: { numArgs: 1 },
	handler(e, t) {
		var { parser: n } = e, r = t[0];
		return {
			type: "overline",
			mode: n.mode,
			body: r
		};
	},
	htmlBuilder(e, t) {
		var n = U(e.body, t.havingCrampedStyle()), r = En("overline-line", t), i = t.fontMetrics().defaultRuleThickness;
		return z(["mord", "overline"], [B({
			positionType: "firstBaseline",
			children: [
				{
					type: "elem",
					elem: n
				},
				{
					type: "kern",
					size: 3 * i
				},
				{
					type: "elem",
					elem: r
				},
				{
					type: "kern",
					size: i
				}
			]
		})], t);
	},
	mathmlBuilder(e, t) {
		var n = new W("mo", [new rr("‾")]);
		n.setAttribute("stretchy", "true");
		var r = new W("mover", [G(e.body, t), n]);
		return r.setAttribute("accent", "true"), r;
	}
}), H({
	type: "phantom",
	names: ["\\phantom"],
	props: {
		numArgs: 1,
		allowedInText: !0
	},
	handler: (e, t) => {
		var { parser: n } = e, r = t[0];
		return {
			type: "phantom",
			mode: n.mode,
			body: Gn(r)
		};
	},
	htmlBuilder: (e, t) => On(Xn(e.body, t.withPhantom(), !1)),
	mathmlBuilder: (e, t) => new W("mphantom", dr(e.body, t))
}), q("\\hphantom", "\\smash{\\phantom{#1}}"), H({
	type: "vphantom",
	names: ["\\vphantom"],
	props: {
		numArgs: 1,
		allowedInText: !0
	},
	handler: (e, t) => {
		var { parser: n } = e, r = t[0];
		return {
			type: "vphantom",
			mode: n.mode,
			body: r
		};
	},
	htmlBuilder: (e, t) => z(["mord", "rlap"], [z(["inner"], [U(e.body, t.withPhantom())]), z(["fix"], [])], t),
	mathmlBuilder: (e, t) => {
		var n = new W("mpadded", [new W("mphantom", dr(Gn(e.body), t))]);
		return n.setAttribute("width", "0px"), n;
	}
}), H({
	type: "raisebox",
	names: ["\\raisebox"],
	props: {
		numArgs: 2,
		argTypes: ["size", "hbox"],
		allowedInText: !0
	},
	handler(e, t) {
		var { parser: n } = e, r = K(t[0], "size").value, i = t[1];
		return {
			type: "raisebox",
			mode: n.mode,
			dy: r,
			body: i
		};
	},
	htmlBuilder(e, t) {
		var n = U(e.body, t);
		return B({
			positionType: "shift",
			positionData: -T(e.dy, t),
			children: [{
				type: "elem",
				elem: n
			}]
		});
	},
	mathmlBuilder(e, t) {
		var n = new W("mpadded", [G(e.body, t)]), r = e.dy.number + e.dy.unit;
		return n.setAttribute("voffset", r), n;
	}
}), H({
	type: "internal",
	names: ["\\relax"],
	props: {
		numArgs: 0,
		allowedInText: !0,
		allowedInArgument: !0
	},
	handler(e) {
		var { parser: t } = e;
		return {
			type: "internal",
			mode: t.mode
		};
	}
}), H({
	type: "rule",
	names: ["\\rule"],
	props: {
		numArgs: 2,
		numOptionalArgs: 1,
		allowedInText: !0,
		allowedInMath: !0,
		argTypes: [
			"size",
			"size",
			"size"
		]
	},
	handler(e, t, n) {
		var { parser: r } = e, i = n[0], a = K(t[0], "size"), o = K(t[1], "size");
		return {
			type: "rule",
			mode: r.mode,
			shift: i && K(i, "size").value,
			width: a.value,
			height: o.value
		};
	},
	htmlBuilder(e, t) {
		var n = z(["mord", "rule"], [], t), r = T(e.width, t), i = T(e.height, t), a = e.shift ? T(e.shift, t) : 0;
		return n.style.borderRightWidth = E(r), n.style.borderTopWidth = E(i), n.style.bottom = E(a), n.width = r, n.height = i + a, n.depth = -a, n.maxFontSize = i * 1.125 * t.sizeMultiplier, n;
	},
	mathmlBuilder(e, t) {
		var n = T(e.width, t), r = T(e.height, t), i = e.shift ? T(e.shift, t) : 0, a = t.color && t.getColor() || "black", o = new W("mspace");
		o.setAttribute("mathbackground", a), o.setAttribute("width", E(n)), o.setAttribute("height", E(r));
		var s = new W("mpadded", [o]);
		return i >= 0 ? s.setAttribute("height", E(i)) : (s.setAttribute("height", E(i)), s.setAttribute("depth", E(-i))), s.setAttribute("voffset", E(i)), s;
	}
});
function ua(e, t, n) {
	for (var r = Xn(e, t, !1), i = t.sizeMultiplier / n.sizeMultiplier, a = 0; a < r.length; a++) {
		var o = r[a].classes.indexOf("sizing");
		o < 0 ? Array.prototype.push.apply(r[a].classes, t.sizingClasses(n)) : r[a].classes[o + 1] === "reset-size" + t.size && (r[a].classes[o + 1] = "reset-size" + n.size), r[a].height *= i, r[a].depth *= i;
	}
	return On(r);
}
var da = [
	"\\tiny",
	"\\sixptsize",
	"\\scriptsize",
	"\\footnotesize",
	"\\small",
	"\\normalsize",
	"\\large",
	"\\Large",
	"\\LARGE",
	"\\huge",
	"\\Huge"
];
H({
	type: "sizing",
	names: da,
	props: {
		numArgs: 0,
		allowedInText: !0
	},
	handler: (e, t) => {
		var { breakOnTokenText: n, funcName: r, parser: i } = e, a = i.parseExpression(!1, n);
		return {
			type: "sizing",
			mode: i.mode,
			size: da.indexOf(r) + 1,
			body: a
		};
	},
	htmlBuilder: (e, t) => {
		var n = t.havingSize(e.size);
		return ua(e.body, n, t);
	},
	mathmlBuilder: (e, t) => {
		var n = t.havingSize(e.size), r = new W("mstyle", dr(e.body, n));
		return r.setAttribute("mathsize", E(n.sizeMultiplier)), r;
	}
}), H({
	type: "smash",
	names: ["\\smash"],
	props: {
		numArgs: 1,
		numOptionalArgs: 1,
		allowedInText: !0
	},
	handler: (e, t, n) => {
		var { parser: r } = e, i = !1, a = !1, o = n[0] && K(n[0], "ordgroup");
		if (o) for (var s, c = 0; c < o.body.length; ++c) {
			var l = o.body[c];
			if (s = Er(l).text, s === "t") i = !0;
			else if (s === "b") a = !0;
			else {
				i = !1, a = !1;
				break;
			}
		}
		else i = !0, a = !0;
		var u = t[0];
		return {
			type: "smash",
			mode: r.mode,
			body: u,
			smashHeight: i,
			smashDepth: a
		};
	},
	htmlBuilder: (e, t) => {
		var n = z([], [U(e.body, t)]);
		if (!e.smashHeight && !e.smashDepth) return n;
		if (e.smashHeight && (n.height = 0), e.smashDepth && (n.depth = 0), e.smashHeight && e.smashDepth) return z(["mord", "smash"], [n], t);
		if (n.children) for (var r = 0; r < n.children.length; r++) e.smashHeight && (n.children[r].height = 0), e.smashDepth && (n.children[r].depth = 0);
		return z(["mord"], [B({
			positionType: "firstBaseline",
			children: [{
				type: "elem",
				elem: n
			}]
		})], t);
	},
	mathmlBuilder: (e, t) => {
		var n = new W("mpadded", [G(e.body, t)]);
		return e.smashHeight && n.setAttribute("height", "0px"), e.smashDepth && n.setAttribute("depth", "0px"), n;
	}
}), H({
	type: "sqrt",
	names: ["\\sqrt"],
	props: {
		numArgs: 1,
		numOptionalArgs: 1
	},
	handler(e, t, n) {
		var { parser: r } = e, i = n[0], a = t[0];
		return {
			type: "sqrt",
			mode: r.mode,
			body: a,
			index: i
		};
	},
	htmlBuilder(e, t) {
		var n = U(e.body, t.havingCrampedStyle());
		n.height === 0 && (n.height = t.fontMetrics().xHeight), n = kn(n, t);
		var r = t.fontMetrics().defaultRuleThickness, i = r;
		t.style.id < w.TEXT.id && (i = t.fontMetrics().xHeight);
		var a = r + i / 4, { span: o, ruleWidth: s, advanceWidth: c } = ui(n.height + n.depth + a + r, t), l = o.height - s;
		l > n.height + n.depth + a && (a = (a + l - n.height - n.depth) / 2);
		var u = o.height - n.height - a - s;
		n.style.paddingLeft = E(c);
		var d = B({
			positionType: "firstBaseline",
			children: [
				{
					type: "elem",
					elem: n,
					wrapperClasses: ["svg-align"]
				},
				{
					type: "kern",
					size: -(n.height + u)
				},
				{
					type: "elem",
					elem: o
				},
				{
					type: "kern",
					size: s
				}
			]
		});
		if (e.index) {
			var f = t.havingStyle(w.SCRIPTSCRIPT), p = U(e.index, f, t);
			return z(["mord", "sqrt"], [z(["root"], [B({
				positionType: "shift",
				positionData: -(.6 * (d.height - d.depth)),
				children: [{
					type: "elem",
					elem: p
				}]
			})]), d], t);
		} else return z(["mord", "sqrt"], [d], t);
	},
	mathmlBuilder(e, t) {
		var { body: n, index: r } = e;
		return r ? new W("mroot", [G(n, t), G(r, t)]) : new W("msqrt", [G(n, t)]);
	}
});
var fa = {
	display: w.DISPLAY,
	text: w.TEXT,
	script: w.SCRIPT,
	scriptscript: w.SCRIPTSCRIPT
};
function pa(e) {
	return e in fa;
}
H({
	type: "styling",
	names: [
		"\\displaystyle",
		"\\textstyle",
		"\\scriptstyle",
		"\\scriptscriptstyle"
	],
	props: {
		numArgs: 0,
		allowedInText: !0,
		primitive: !0
	},
	handler(e, t) {
		var { breakOnTokenText: n, funcName: r, parser: i } = e, a = i.parseExpression(!0, n), o = r.slice(1, r.length - 5);
		if (!pa(o)) throw Error("Unknown style: " + o);
		return {
			type: "styling",
			mode: i.mode,
			style: o,
			body: a
		};
	},
	htmlBuilder(e, t) {
		var n = fa[e.style], r = t.havingStyle(n);
		return e.resetFont && (r = r.withFont("")), ua(e.body, r, t);
	},
	mathmlBuilder(e, t) {
		var n = fa[e.style], r = t.havingStyle(n);
		e.resetFont && (r = r.withFont(""));
		var i = new W("mstyle", dr(e.body, r)), a = {
			display: ["0", "true"],
			text: ["0", "false"],
			script: ["1", "false"],
			scriptscript: ["2", "false"]
		}[e.style];
		return i.setAttribute("scriptlevel", a[0]), i.setAttribute("displaystyle", a[1]), i;
	}
});
var ma = function(e, t) {
	var n = e.base;
	return n ? n.type === "op" ? n.limits && (t.style.size === w.DISPLAY.size || n.alwaysHandleSupSub) ? aa : null : n.type === "operatorname" ? n.alwaysHandleSupSub && (t.style.size === w.DISPLAY.size || n.limits) ? la : null : n.type === "accent" ? we(n.base) ? kr : null : n.type === "horizBrace" && !e.sub === n.isOver ? ea : null : null;
};
Un({
	type: "supsub",
	htmlBuilder(e, t) {
		var n = ma(e, t);
		if (n) return n(e, t);
		var { base: r, sup: i, sub: a } = e, o = U(r, t), s, c, l = t.fontMetrics(), u = 0, d = 0, f = r && we(r);
		if (i) {
			var p = t.havingStyle(t.style.sup());
			s = U(i, p, t), f || (u = o.height - p.fontMetrics().supDrop * p.sizeMultiplier / t.sizeMultiplier);
		}
		if (a) {
			var m = t.havingStyle(t.style.sub());
			c = U(a, m, t), f || (d = o.depth + m.fontMetrics().subDrop * m.sizeMultiplier / t.sizeMultiplier);
		}
		var h = t.style === w.DISPLAY ? l.sup1 : t.style.cramped ? l.sup3 : l.sup2, g = t.sizeMultiplier, _ = E(.5 / l.ptPerEm / g), v = null;
		if (c) {
			var y = e.base && e.base.type === "op" && e.base.name && (e.base.name === "\\oiint" || e.base.name === "\\oiiint");
			(o instanceof yt || y) && (v = E(-(o.italic ?? 0)));
		}
		var b;
		if (s && c) {
			u = Math.max(u, h, s.depth + .25 * l.xHeight), d = Math.max(d, l.sub2);
			var x = 4 * l.defaultRuleThickness;
			if (u - s.depth - (c.height - d) < x) {
				d = x - (u - s.depth) + c.height;
				var S = .8 * l.xHeight - (u - s.depth);
				S > 0 && (u += S, d -= S);
			}
			b = B({
				positionType: "individualShift",
				children: [{
					type: "elem",
					elem: c,
					shift: d,
					marginRight: _,
					marginLeft: v
				}, {
					type: "elem",
					elem: s,
					shift: -u,
					marginRight: _
				}]
			});
		} else if (c) d = Math.max(d, l.sub1, c.height - .8 * l.xHeight), b = B({
			positionType: "shift",
			positionData: d,
			children: [{
				type: "elem",
				elem: c,
				marginLeft: v,
				marginRight: _
			}]
		});
		else if (s) u = Math.max(u, h, s.depth + .25 * l.xHeight), b = B({
			positionType: "shift",
			positionData: -u,
			children: [{
				type: "elem",
				elem: s,
				marginRight: _
			}]
		});
		else throw Error("supsub must have either sup or sub.");
		return z([er(o, "right") || "mord"], [o, z(["msupsub"], [b])], t);
	},
	mathmlBuilder(e, t) {
		var n = !1, r, i;
		e.base && e.base.type === "horizBrace" && (i = !!e.sup, i === e.base.isOver && (n = !0, r = e.base.isOver)), e.base && (e.base.type === "op" || e.base.type === "operatorname") && (e.base.parentIsSupSub = !0);
		var a = [G(e.base, t)];
		e.sub && a.push(G(e.sub, t)), e.sup && a.push(G(e.sup, t));
		var o;
		if (n) o = r ? "mover" : "munder";
		else if (!e.sub) {
			var s = e.base;
			o = s && s.type === "op" && s.limits && (t.style === w.DISPLAY || s.alwaysHandleSupSub) || s && s.type === "operatorname" && s.alwaysHandleSupSub && (s.limits || t.style === w.DISPLAY) ? "mover" : "msup";
		} else if (e.sup) {
			var c = e.base;
			o = c && c.type === "op" && c.limits && t.style === w.DISPLAY || c && c.type === "operatorname" && c.alwaysHandleSupSub && (t.style === w.DISPLAY || c.limits) ? "munderover" : "msubsup";
		} else {
			var l = e.base;
			o = l && l.type === "op" && l.limits && (t.style === w.DISPLAY || l.alwaysHandleSupSub) || l && l.type === "operatorname" && l.alwaysHandleSupSub && (l.limits || t.style === w.DISPLAY) ? "munder" : "msub";
		}
		return new W(o, a);
	}
}), Un({
	type: "atom",
	htmlBuilder(e, t) {
		return yn(e.text, e.mode, t, ["m" + e.family]);
	},
	mathmlBuilder(e, t) {
		var n = new W("mo", [or(e.text, e.mode)]);
		if (e.family === "bin") {
			var r = lr(e, t);
			r === "bold-italic" && n.setAttribute("mathvariant", r);
		} else e.family === "punct" ? n.setAttribute("separator", "true") : (e.family === "open" || e.family === "close") && n.setAttribute("stretchy", "false");
		return n;
	}
});
var ha = {
	mi: "italic",
	mn: "normal",
	mtext: "normal"
};
Un({
	type: "mathord",
	htmlBuilder(e, t) {
		return xn(e, t, "mathord");
	},
	mathmlBuilder(e, t) {
		var n = new W("mi", [or(e.text, e.mode, t)]), r = lr(e, t) || "italic";
		return r !== ha[n.type] && n.setAttribute("mathvariant", r), n;
	}
}), Un({
	type: "textord",
	htmlBuilder(e, t) {
		return xn(e, t, "textord");
	},
	mathmlBuilder(e, t) {
		var n = or(e.text, e.mode, t), r = lr(e, t) || "normal", i = e.mode === "text" ? new W("mtext", [n]) : /[0-9]/.test(e.text) ? new W("mn", [n]) : e.text === "\\prime" ? new W("mo", [n]) : new W("mi", [n]);
		return r !== ha[i.type] && i.setAttribute("mathvariant", r), i;
	}
});
var ga = {
	"\\nobreak": "nobreak",
	"\\allowbreak": "allowbreak"
}, _a = {
	" ": {},
	"\\ ": {},
	"~": { className: "nobreak" },
	"\\space": {},
	"\\nobreakspace": { className: "nobreak" }
};
Un({
	type: "spacing",
	htmlBuilder(e, t) {
		if (_a.hasOwnProperty(e.text)) {
			var n = _a[e.text].className || "";
			if (e.mode === "text") {
				var r = xn(e, t, "textord");
				return r.classes.push(n), r;
			} else return z(["mspace", n], [yn(e.text, e.mode, t)], t);
		} else if (ga.hasOwnProperty(e.text)) return z(["mspace", ga[e.text]], [], t);
		else throw new C("Unknown type of space \"" + e.text + "\"");
	},
	mathmlBuilder(e, t) {
		var n;
		if (_a.hasOwnProperty(e.text)) n = new W("mtext", [new rr("\xA0")]);
		else if (ga.hasOwnProperty(e.text)) return new W("mspace");
		else throw new C("Unknown type of space \"" + e.text + "\"");
		return n;
	}
});
var va = () => {
	var e = new W("mtd", []);
	return e.setAttribute("width", "50%"), e;
};
Un({
	type: "tag",
	mathmlBuilder(e, t) {
		var n = new W("mtable", [new W("mtr", [
			va(),
			new W("mtd", [fr(e.body, t)]),
			va(),
			new W("mtd", [fr(e.tag, t)])
		])]);
		return n.setAttribute("width", "100%"), n;
	}
});
var ya = {
	"\\text": void 0,
	"\\textrm": "textrm",
	"\\textsf": "textsf",
	"\\texttt": "texttt",
	"\\textnormal": "textrm"
}, ba = {
	"\\textbf": "textbf",
	"\\textmd": "textmd"
}, xa = {
	"\\textit": "textit",
	"\\textup": "textup"
}, Sa = (e, t) => {
	var n = e.font;
	return n ? ya[n] ? t.withTextFontFamily(ya[n]) : ba[n] ? t.withTextFontWeight(ba[n]) : n === "\\emph" ? t.fontShape === "textit" ? t.withTextFontShape("textup") : t.withTextFontShape("textit") : t.withTextFontShape(xa[n]) : t;
};
H({
	type: "text",
	names: [
		"\\text",
		"\\textrm",
		"\\textsf",
		"\\texttt",
		"\\textnormal",
		"\\textbf",
		"\\textmd",
		"\\textit",
		"\\textup",
		"\\emph"
	],
	props: {
		numArgs: 1,
		argTypes: ["text"],
		allowedInArgument: !0,
		allowedInText: !0
	},
	handler(e, t) {
		var { parser: n, funcName: r } = e, i = t[0];
		return {
			type: "text",
			mode: n.mode,
			body: Gn(i),
			font: r
		};
	},
	htmlBuilder(e, t) {
		var n = Sa(e, t);
		return z(["mord", "text"], Xn(e.body, n, !0), n);
	},
	mathmlBuilder(e, t) {
		var n = Sa(e, t);
		return fr(e.body, n);
	}
}), H({
	type: "underline",
	names: ["\\underline"],
	props: {
		numArgs: 1,
		allowedInText: !0
	},
	handler(e, t) {
		var { parser: n } = e;
		return {
			type: "underline",
			mode: n.mode,
			body: t[0]
		};
	},
	htmlBuilder(e, t) {
		var n = U(e.body, t), r = En("underline-line", t), i = t.fontMetrics().defaultRuleThickness;
		return z(["mord", "underline"], [B({
			positionType: "top",
			positionData: n.height,
			children: [
				{
					type: "kern",
					size: i
				},
				{
					type: "elem",
					elem: r
				},
				{
					type: "kern",
					size: 3 * i
				},
				{
					type: "elem",
					elem: n
				}
			]
		})], t);
	},
	mathmlBuilder(e, t) {
		var n = new W("mo", [new rr("‾")]);
		n.setAttribute("stretchy", "true");
		var r = new W("munder", [G(e.body, t), n]);
		return r.setAttribute("accentunder", "true"), r;
	}
}), H({
	type: "vcenter",
	names: ["\\vcenter"],
	props: {
		numArgs: 1,
		argTypes: ["original"],
		allowedInText: !1
	},
	handler(e, t) {
		var { parser: n } = e;
		return {
			type: "vcenter",
			mode: n.mode,
			body: t[0]
		};
	},
	htmlBuilder(e, t) {
		var n = U(e.body, t), r = t.fontMetrics().axisHeight;
		return B({
			positionType: "shift",
			positionData: .5 * (n.height - r - (n.depth + r)),
			children: [{
				type: "elem",
				elem: n
			}]
		});
	},
	mathmlBuilder(e, t) {
		return new W("mrow", [new W("mpadded", [G(e.body, t)], ["vcenter"])]);
	}
}), H({
	type: "verb",
	names: ["\\verb"],
	props: {
		numArgs: 0,
		allowedInText: !0
	},
	handler(e, t, n) {
		throw new C("\\verb ended by end of line instead of matching delimiter");
	},
	htmlBuilder(e, t) {
		for (var n = Ca(e), r = [], i = t.havingStyle(t.style.text()), a = 0; a < n.length; a++) {
			var o = n[a];
			o === "~" && (o = "\\textasciitilde"), r.push(vn(o, "Typewriter-Regular", e.mode, i, ["mord", "texttt"]));
		}
		return z(["mord", "text"].concat(i.sizingClasses(t)), Cn(r), i);
	},
	mathmlBuilder(e, t) {
		var n = new W("mtext", [new rr(Ca(e))]);
		return n.setAttribute("mathvariant", "monospace"), n;
	}
});
var Ca = (e) => e.body.replace(/ /g, e.star ? "␣" : "\xA0"), wa = Bn, Ta = "[ \r\n	]", Ea = "\\\\[a-zA-Z@]+", Da = "\\\\[^\ud800-\udfff]", Oa = "(" + Ea + ")" + Ta + "*", ka = "\\\\(\n|[ \r	]+\n?)[ \r	]*", Aa = "[̀-ͯ]", ja = RegExp(Aa + "+$"), Ma = "(" + Ta + "+)|" + (ka + "|") + "([!-\\[\\]-‧‪-퟿豈-￿]" + (Aa + "*") + "|[\ud800-\udbff][\udc00-\udfff]" + (Aa + "*") + "|\\\\verb\\*([^]).*?\\4|\\\\verb([^*a-zA-Z]).*?\\5" + ("|" + Oa) + ("|" + Da + ")"), Na = class {
	constructor(e, t) {
		this.input = void 0, this.settings = void 0, this.tokenRegex = void 0, this.catcodes = void 0, this.input = e, this.settings = t, this.tokenRegex = new RegExp(Ma, "g"), this.catcodes = {
			"%": 14,
			"~": 13
		};
	}
	setCatcode(e, t) {
		this.catcodes[e] = t;
	}
	lex() {
		var e = this.input, t = this.tokenRegex.lastIndex;
		if (t === e.length) return new Pi("EOF", new Ni(this, t, t));
		var n = this.tokenRegex.exec(e);
		if (n === null || n.index !== t) throw new C("Unexpected character: '" + e[t] + "'", new Pi(e[t], new Ni(this, t, t + 1)));
		var r = n[6] || n[3] || (n[2] ? "\\ " : " ");
		if (this.catcodes[r] === 14) {
			var i = e.indexOf("\n", this.tokenRegex.lastIndex);
			return i === -1 ? (this.tokenRegex.lastIndex = e.length, this.settings.reportNonstrict("commentAtEnd", "% comment has no terminating newline; LaTeX would fail because of commenting the end of math mode (e.g. $)")) : this.tokenRegex.lastIndex = i + 1, this.lex();
		}
		return new Pi(r, new Ni(this, t, this.tokenRegex.lastIndex));
	}
}, Pa = class {
	constructor(e, t) {
		e === void 0 && (e = {}), t === void 0 && (t = {}), this.current = void 0, this.builtins = void 0, this.undefStack = void 0, this.current = t, this.builtins = e, this.undefStack = [];
	}
	beginGroup() {
		this.undefStack.push({});
	}
	endGroup() {
		if (this.undefStack.length === 0) throw new C("Unbalanced namespace destruction: attempt to pop global namespace; please report this as a bug");
		var e = this.undefStack.pop();
		for (var t in e) e.hasOwnProperty(t) && (e[t] == null ? delete this.current[t] : this.current[t] = e[t]);
	}
	endGroups() {
		for (; this.undefStack.length > 0;) this.endGroup();
	}
	has(e) {
		return this.current.hasOwnProperty(e) || this.builtins.hasOwnProperty(e);
	}
	get(e) {
		return this.current.hasOwnProperty(e) ? this.current[e] : this.builtins[e];
	}
	set(e, t, n) {
		if (n === void 0 && (n = !1), n) {
			for (var r = 0; r < this.undefStack.length; r++) delete this.undefStack[r][e];
			this.undefStack.length > 0 && (this.undefStack[this.undefStack.length - 1][e] = t);
		} else {
			var i = this.undefStack[this.undefStack.length - 1];
			i && !i.hasOwnProperty(e) && (i[e] = this.current[e]);
		}
		t == null ? delete this.current[e] : this.current[e] = t;
	}
}, Fa = Mi;
q("\\noexpand", function(e) {
	var t = e.popToken();
	return e.isExpandable(t.text) && (t.noexpand = !0, t.treatAsRelax = !0), {
		tokens: [t],
		numArgs: 0
	};
}), q("\\expandafter", function(e) {
	var t = e.popToken();
	return e.expandOnce(!0), {
		tokens: [t],
		numArgs: 0
	};
}), q("\\@firstoftwo", function(e) {
	return {
		tokens: e.consumeArgs(2)[0],
		numArgs: 0
	};
}), q("\\@secondoftwo", function(e) {
	return {
		tokens: e.consumeArgs(2)[1],
		numArgs: 0
	};
}), q("\\@ifnextchar", function(e) {
	var t = e.consumeArgs(3);
	e.consumeSpaces();
	var n = e.future();
	return t[0].length === 1 && t[0][0].text === n.text ? {
		tokens: t[1],
		numArgs: 0
	} : {
		tokens: t[2],
		numArgs: 0
	};
}), q("\\@ifstar", "\\@ifnextchar *{\\@firstoftwo{#1}}"), q("\\TextOrMath", function(e) {
	var t = e.consumeArgs(2);
	return e.mode === "text" ? {
		tokens: t[0],
		numArgs: 0
	} : {
		tokens: t[1],
		numArgs: 0
	};
});
var Ia = {
	0: 0,
	1: 1,
	2: 2,
	3: 3,
	4: 4,
	5: 5,
	6: 6,
	7: 7,
	8: 8,
	9: 9,
	a: 10,
	A: 10,
	b: 11,
	B: 11,
	c: 12,
	C: 12,
	d: 13,
	D: 13,
	e: 14,
	E: 14,
	f: 15,
	F: 15
};
q("\\char", function(e) {
	var t = e.popToken(), n, r = 0;
	if (t.text === "'") n = 8, t = e.popToken();
	else if (t.text === "\"") n = 16, t = e.popToken();
	else if (t.text === "`") if (t = e.popToken(), t.text[0] === "\\") r = t.text.charCodeAt(1);
	else if (t.text === "EOF") throw new C("\\char` missing argument");
	else r = t.text.charCodeAt(0);
	else n = 10;
	if (n) {
		if (r = Ia[t.text], r == null || r >= n) throw new C("Invalid base-" + n + " digit " + t.text);
		for (var i; (i = Ia[e.future().text]) != null && i < n;) r *= n, r += i, e.popToken();
	}
	return "\\@char{" + r + "}";
});
var La = (e, t, n, r) => {
	var i = e.consumeArg().tokens;
	if (i.length !== 1) throw new C("\\newcommand's first argument must be a macro name");
	var a = i[0].text, o = e.isDefined(a);
	if (o && !t) throw new C("\\newcommand{" + a + "} attempting to redefine " + (a + "; use \\renewcommand"));
	if (!o && !n) throw new C("\\renewcommand{" + a + "} when command " + a + " does not yet exist; use \\newcommand");
	var s = 0;
	if (i = e.consumeArg().tokens, i.length === 1 && i[0].text === "[") {
		for (var c = "", l = e.expandNextToken(); l.text !== "]" && l.text !== "EOF";) c += l.text, l = e.expandNextToken();
		if (!c.match(/^\s*[0-9]+\s*$/)) throw new C("Invalid number of arguments: " + c);
		s = parseInt(c), i = e.consumeArg().tokens;
	}
	return o && r || e.macros.set(a, {
		tokens: i,
		numArgs: s
	}), "";
};
q("\\newcommand", (e) => La(e, !1, !0, !1)), q("\\renewcommand", (e) => La(e, !0, !1, !1)), q("\\providecommand", (e) => La(e, !0, !0, !0)), q("\\message", (e) => {
	var t = e.consumeArgs(1)[0];
	return console.log(t.reverse().map((e) => e.text).join("")), "";
}), q("\\errmessage", (e) => {
	var t = e.consumeArgs(1)[0];
	return console.error(t.reverse().map((e) => e.text).join("")), "";
}), q("\\show", (e) => {
	var t = e.popToken(), n = t.text;
	return console.log(t, e.macros.get(n), wa[n], D.math[n], D.text[n]), "";
}), q("\\bgroup", "{"), q("\\egroup", "}"), q("~", "\\nobreakspace"), q("\\lq", "`"), q("\\rq", "'"), q("\\aa", "\\r a"), q("\\AA", "\\r A"), q("\\textcopyright", "\\html@mathml{\\textcircled{c}}{\\char`©}"), q("\\copyright", "\\TextOrMath{\\textcopyright}{\\text{\\textcopyright}}"), q("\\textregistered", "\\html@mathml{\\textcircled{\\scriptsize R}}{\\char`®}"), q("ℬ", "\\mathscr{B}"), q("ℰ", "\\mathscr{E}"), q("ℱ", "\\mathscr{F}"), q("ℋ", "\\mathscr{H}"), q("ℐ", "\\mathscr{I}"), q("ℒ", "\\mathscr{L}"), q("ℳ", "\\mathscr{M}"), q("ℛ", "\\mathscr{R}"), q("ℭ", "\\mathfrak{C}"), q("ℌ", "\\mathfrak{H}"), q("ℨ", "\\mathfrak{Z}"), q("\\Bbbk", "\\Bbb{k}"), q("\\llap", "\\mathllap{\\textrm{#1}}"), q("\\rlap", "\\mathrlap{\\textrm{#1}}"), q("\\clap", "\\mathclap{\\textrm{#1}}"), q("\\mathstrut", "\\vphantom{(}"), q("\\underbar", "\\underline{\\text{#1}}"), q("\\not", "\\html@mathml{\\mathrel{\\mathrlap\\@not}\\nobreak}{\\char\"338}"), q("\\neq", "\\html@mathml{\\mathrel{\\not=}}{\\mathrel{\\char`≠}}"), q("\\ne", "\\neq"), q("≠", "\\neq"), q("\\notin", "\\html@mathml{\\mathrel{{\\in}\\mathllap{/\\mskip1mu}}}{\\mathrel{\\char`∉}}"), q("∉", "\\notin"), q("≘", "\\html@mathml{\\mathrel{=\\kern{-1em}\\raisebox{0.4em}{$\\scriptsize\\frown$}}}{\\mathrel{\\char`≘}}"), q("≙", "\\html@mathml{\\stackrel{\\tiny\\wedge}{=}}{\\mathrel{\\char`≘}}"), q("≚", "\\html@mathml{\\stackrel{\\tiny\\vee}{=}}{\\mathrel{\\char`≚}}"), q("≛", "\\html@mathml{\\stackrel{\\scriptsize\\star}{=}}{\\mathrel{\\char`≛}}"), q("≝", "\\html@mathml{\\stackrel{\\tiny\\mathrm{def}}{=}}{\\mathrel{\\char`≝}}"), q("≞", "\\html@mathml{\\stackrel{\\tiny\\mathrm{m}}{=}}{\\mathrel{\\char`≞}}"), q("≟", "\\html@mathml{\\stackrel{\\tiny?}{=}}{\\mathrel{\\char`≟}}"), q("⟂", "\\perp"), q("‼", "\\mathclose{!\\mkern-0.8mu!}"), q("∌", "\\notni"), q("⌜", "\\ulcorner"), q("⌝", "\\urcorner"), q("⌞", "\\llcorner"), q("⌟", "\\lrcorner"), q("©", "\\copyright"), q("®", "\\textregistered"), q("\\ulcorner", "\\html@mathml{\\@ulcorner}{\\mathop{\\char\"231c}}"), q("\\urcorner", "\\html@mathml{\\@urcorner}{\\mathop{\\char\"231d}}"), q("\\llcorner", "\\html@mathml{\\@llcorner}{\\mathop{\\char\"231e}}"), q("\\lrcorner", "\\html@mathml{\\@lrcorner}{\\mathop{\\char\"231f}}"), q("\\vdots", "{\\varvdots\\rule{0pt}{15pt}}"), q("⋮", "\\vdots"), q("\\varGamma", "\\mathit{\\Gamma}"), q("\\varDelta", "\\mathit{\\Delta}"), q("\\varTheta", "\\mathit{\\Theta}"), q("\\varLambda", "\\mathit{\\Lambda}"), q("\\varXi", "\\mathit{\\Xi}"), q("\\varPi", "\\mathit{\\Pi}"), q("\\varSigma", "\\mathit{\\Sigma}"), q("\\varUpsilon", "\\mathit{\\Upsilon}"), q("\\varPhi", "\\mathit{\\Phi}"), q("\\varPsi", "\\mathit{\\Psi}"), q("\\varOmega", "\\mathit{\\Omega}"), q("\\substack", "\\begin{subarray}{c}#1\\end{subarray}"), q("\\colon", "\\nobreak\\mskip2mu\\mathpunct{}\\mathchoice{\\mkern-3mu}{\\mkern-3mu}{}{}{:}\\mskip6mu\\relax"), q("\\boxed", "\\fbox{$\\displaystyle{#1}$}"), q("\\iff", "\\DOTSB\\;\\Longleftrightarrow\\;"), q("\\implies", "\\DOTSB\\;\\Longrightarrow\\;"), q("\\impliedby", "\\DOTSB\\;\\Longleftarrow\\;"), q("\\dddot", "{\\overset{\\raisebox{-0.1ex}{\\normalsize ...}}{#1}}"), q("\\ddddot", "{\\overset{\\raisebox{-0.1ex}{\\normalsize ....}}{#1}}");
var Ra = {
	",": "\\dotsc",
	"\\not": "\\dotsb",
	"+": "\\dotsb",
	"=": "\\dotsb",
	"<": "\\dotsb",
	">": "\\dotsb",
	"-": "\\dotsb",
	"*": "\\dotsb",
	":": "\\dotsb",
	"\\DOTSB": "\\dotsb",
	"\\coprod": "\\dotsb",
	"\\bigvee": "\\dotsb",
	"\\bigwedge": "\\dotsb",
	"\\biguplus": "\\dotsb",
	"\\bigcap": "\\dotsb",
	"\\bigcup": "\\dotsb",
	"\\prod": "\\dotsb",
	"\\sum": "\\dotsb",
	"\\bigotimes": "\\dotsb",
	"\\bigoplus": "\\dotsb",
	"\\bigodot": "\\dotsb",
	"\\bigsqcup": "\\dotsb",
	"\\And": "\\dotsb",
	"\\longrightarrow": "\\dotsb",
	"\\Longrightarrow": "\\dotsb",
	"\\longleftarrow": "\\dotsb",
	"\\Longleftarrow": "\\dotsb",
	"\\longleftrightarrow": "\\dotsb",
	"\\Longleftrightarrow": "\\dotsb",
	"\\mapsto": "\\dotsb",
	"\\longmapsto": "\\dotsb",
	"\\hookrightarrow": "\\dotsb",
	"\\doteq": "\\dotsb",
	"\\mathbin": "\\dotsb",
	"\\mathrel": "\\dotsb",
	"\\relbar": "\\dotsb",
	"\\Relbar": "\\dotsb",
	"\\xrightarrow": "\\dotsb",
	"\\xleftarrow": "\\dotsb",
	"\\DOTSI": "\\dotsi",
	"\\int": "\\dotsi",
	"\\oint": "\\dotsi",
	"\\iint": "\\dotsi",
	"\\iiint": "\\dotsi",
	"\\iiiint": "\\dotsi",
	"\\idotsint": "\\dotsi",
	"\\DOTSX": "\\dotsx"
}, za = new Set(["bin", "rel"]);
q("\\dots", function(e) {
	var t = "\\dotso", n = e.expandAfterFuture().text;
	return n in Ra ? t = Ra[n] : (n.slice(0, 4) === "\\not" || n in D.math && za.has(D.math[n].group)) && (t = "\\dotsb"), t;
});
var Ba = {
	")": !0,
	"]": !0,
	"\\rbrack": !0,
	"\\}": !0,
	"\\rbrace": !0,
	"\\rangle": !0,
	"\\rceil": !0,
	"\\rfloor": !0,
	"\\rgroup": !0,
	"\\rmoustache": !0,
	"\\right": !0,
	"\\bigr": !0,
	"\\biggr": !0,
	"\\Bigr": !0,
	"\\Biggr": !0,
	$: !0,
	";": !0,
	".": !0,
	",": !0
};
q("\\dotso", function(e) {
	return e.future().text in Ba ? "\\ldots\\," : "\\ldots";
}), q("\\dotsc", function(e) {
	var t = e.future().text;
	return t in Ba && t !== "," ? "\\ldots\\," : "\\ldots";
}), q("\\cdots", function(e) {
	return e.future().text in Ba ? "\\@cdots\\," : "\\@cdots";
}), q("\\dotsb", "\\cdots"), q("\\dotsm", "\\cdots"), q("\\dotsi", "\\!\\cdots"), q("\\dotsx", "\\ldots\\,"), q("\\DOTSI", "\\relax"), q("\\DOTSB", "\\relax"), q("\\DOTSX", "\\relax"), q("\\tmspace", "\\TextOrMath{\\kern#1#3}{\\mskip#1#2}\\relax"), q("\\,", "\\tmspace+{3mu}{.1667em}"), q("\\thinspace", "\\,"), q("\\>", "\\mskip{4mu}"), q("\\:", "\\tmspace+{4mu}{.2222em}"), q("\\medspace", "\\:"), q("\\;", "\\tmspace+{5mu}{.2777em}"), q("\\thickspace", "\\;"), q("\\!", "\\tmspace-{3mu}{.1667em}"), q("\\negthinspace", "\\!"), q("\\negmedspace", "\\tmspace-{4mu}{.2222em}"), q("\\negthickspace", "\\tmspace-{5mu}{.277em}"), q("\\enspace", "\\kern.5em "), q("\\enskip", "\\hskip.5em\\relax"), q("\\quad", "\\hskip1em\\relax"), q("\\qquad", "\\hskip2em\\relax"), q("\\tag", "\\@ifstar\\tag@literal\\tag@paren"), q("\\tag@paren", "\\tag@literal{({#1})}"), q("\\tag@literal", (e) => {
	if (e.macros.get("\\df@tag")) throw new C("Multiple \\tag");
	return "\\gdef\\df@tag{\\text{#1}}";
}), q("\\bmod", "\\mathchoice{\\mskip1mu}{\\mskip1mu}{\\mskip5mu}{\\mskip5mu}\\mathbin{\\rm mod}\\mathchoice{\\mskip1mu}{\\mskip1mu}{\\mskip5mu}{\\mskip5mu}"), q("\\pod", "\\allowbreak\\mathchoice{\\mkern18mu}{\\mkern8mu}{\\mkern8mu}{\\mkern8mu}(#1)"), q("\\pmod", "\\pod{{\\rm mod}\\mkern6mu#1}"), q("\\mod", "\\allowbreak\\mathchoice{\\mkern18mu}{\\mkern12mu}{\\mkern12mu}{\\mkern12mu}{\\rm mod}\\,\\,#1"), q("\\newline", "\\\\\\relax"), q("\\TeX", "\\textrm{\\html@mathml{T\\kern-.1667em\\raisebox{-.5ex}{E}\\kern-.125emX}{TeX}}");
var Va = E(Et["Main-Regular"][84][1] - .7 * Et["Main-Regular"][65][1]);
q("\\LaTeX", "\\textrm{\\html@mathml{" + ("L\\kern-.36em\\raisebox{" + Va + "}{\\scriptstyle A}") + "\\kern-.15em\\TeX}{LaTeX}}"), q("\\KaTeX", "\\textrm{\\html@mathml{" + ("K\\kern-.17em\\raisebox{" + Va + "}{\\scriptstyle A}") + "\\kern-.15em\\TeX}{KaTeX}}"), q("\\hspace", "\\@ifstar\\@hspacer\\@hspace"), q("\\@hspace", "\\hskip #1\\relax"), q("\\@hspacer", "\\rule{0pt}{0pt}\\hskip #1\\relax"), q("\\ordinarycolon", ":"), q("\\vcentcolon", "\\mathrel{\\mathop\\ordinarycolon}"), q("\\dblcolon", "\\html@mathml{\\mathrel{\\vcentcolon\\mathrel{\\mkern-.9mu}\\vcentcolon}}{\\mathop{\\char\"2237}}"), q("\\coloneqq", "\\html@mathml{\\mathrel{\\vcentcolon\\mathrel{\\mkern-1.2mu}=}}{\\mathop{\\char\"2254}}"), q("\\Coloneqq", "\\html@mathml{\\mathrel{\\dblcolon\\mathrel{\\mkern-1.2mu}=}}{\\mathop{\\char\"2237\\char\"3d}}"), q("\\coloneq", "\\html@mathml{\\mathrel{\\vcentcolon\\mathrel{\\mkern-1.2mu}\\mathrel{-}}}{\\mathop{\\char\"3a\\char\"2212}}"), q("\\Coloneq", "\\html@mathml{\\mathrel{\\dblcolon\\mathrel{\\mkern-1.2mu}\\mathrel{-}}}{\\mathop{\\char\"2237\\char\"2212}}"), q("\\eqqcolon", "\\html@mathml{\\mathrel{=\\mathrel{\\mkern-1.2mu}\\vcentcolon}}{\\mathop{\\char\"2255}}"), q("\\Eqqcolon", "\\html@mathml{\\mathrel{=\\mathrel{\\mkern-1.2mu}\\dblcolon}}{\\mathop{\\char\"3d\\char\"2237}}"), q("\\eqcolon", "\\html@mathml{\\mathrel{\\mathrel{-}\\mathrel{\\mkern-1.2mu}\\vcentcolon}}{\\mathop{\\char\"2239}}"), q("\\Eqcolon", "\\html@mathml{\\mathrel{\\mathrel{-}\\mathrel{\\mkern-1.2mu}\\dblcolon}}{\\mathop{\\char\"2212\\char\"2237}}"), q("\\colonapprox", "\\html@mathml{\\mathrel{\\vcentcolon\\mathrel{\\mkern-1.2mu}\\approx}}{\\mathop{\\char\"3a\\char\"2248}}"), q("\\Colonapprox", "\\html@mathml{\\mathrel{\\dblcolon\\mathrel{\\mkern-1.2mu}\\approx}}{\\mathop{\\char\"2237\\char\"2248}}"), q("\\colonsim", "\\html@mathml{\\mathrel{\\vcentcolon\\mathrel{\\mkern-1.2mu}\\sim}}{\\mathop{\\char\"3a\\char\"223c}}"), q("\\Colonsim", "\\html@mathml{\\mathrel{\\dblcolon\\mathrel{\\mkern-1.2mu}\\sim}}{\\mathop{\\char\"2237\\char\"223c}}"), q("∷", "\\dblcolon"), q("∹", "\\eqcolon"), q("≔", "\\coloneqq"), q("≕", "\\eqqcolon"), q("⩴", "\\Coloneqq"), q("\\ratio", "\\vcentcolon"), q("\\coloncolon", "\\dblcolon"), q("\\colonequals", "\\coloneqq"), q("\\coloncolonequals", "\\Coloneqq"), q("\\equalscolon", "\\eqqcolon"), q("\\equalscoloncolon", "\\Eqqcolon"), q("\\colonminus", "\\coloneq"), q("\\coloncolonminus", "\\Coloneq"), q("\\minuscolon", "\\eqcolon"), q("\\minuscoloncolon", "\\Eqcolon"), q("\\coloncolonapprox", "\\Colonapprox"), q("\\coloncolonsim", "\\Colonsim"), q("\\simcolon", "\\mathrel{\\sim\\mathrel{\\mkern-1.2mu}\\vcentcolon}"), q("\\simcoloncolon", "\\mathrel{\\sim\\mathrel{\\mkern-1.2mu}\\dblcolon}"), q("\\approxcolon", "\\mathrel{\\approx\\mathrel{\\mkern-1.2mu}\\vcentcolon}"), q("\\approxcoloncolon", "\\mathrel{\\approx\\mathrel{\\mkern-1.2mu}\\dblcolon}"), q("\\notni", "\\html@mathml{\\not\\ni}{\\mathrel{\\char`∌}}"), q("\\limsup", "\\DOTSB\\operatorname*{lim\\,sup}"), q("\\liminf", "\\DOTSB\\operatorname*{lim\\,inf}"), q("\\injlim", "\\DOTSB\\operatorname*{inj\\,lim}"), q("\\projlim", "\\DOTSB\\operatorname*{proj\\,lim}"), q("\\varlimsup", "\\DOTSB\\operatorname*{\\overline{lim}}"), q("\\varliminf", "\\DOTSB\\operatorname*{\\underline{lim}}"), q("\\varinjlim", "\\DOTSB\\operatorname*{\\underrightarrow{lim}}"), q("\\varprojlim", "\\DOTSB\\operatorname*{\\underleftarrow{lim}}"), q("\\gvertneqq", "\\html@mathml{\\@gvertneqq}{≩}"), q("\\lvertneqq", "\\html@mathml{\\@lvertneqq}{≨}"), q("\\ngeqq", "\\html@mathml{\\@ngeqq}{≱}"), q("\\ngeqslant", "\\html@mathml{\\@ngeqslant}{≱}"), q("\\nleqq", "\\html@mathml{\\@nleqq}{≰}"), q("\\nleqslant", "\\html@mathml{\\@nleqslant}{≰}"), q("\\nshortmid", "\\html@mathml{\\@nshortmid}{∤}"), q("\\nshortparallel", "\\html@mathml{\\@nshortparallel}{∦}"), q("\\nsubseteqq", "\\html@mathml{\\@nsubseteqq}{⊈}"), q("\\nsupseteqq", "\\html@mathml{\\@nsupseteqq}{⊉}"), q("\\varsubsetneq", "\\html@mathml{\\@varsubsetneq}{⊊}"), q("\\varsubsetneqq", "\\html@mathml{\\@varsubsetneqq}{⫋}"), q("\\varsupsetneq", "\\html@mathml{\\@varsupsetneq}{⊋}"), q("\\varsupsetneqq", "\\html@mathml{\\@varsupsetneqq}{⫌}"), q("\\imath", "\\html@mathml{\\@imath}{ı}"), q("\\jmath", "\\html@mathml{\\@jmath}{ȷ}"), q("\\llbracket", "\\html@mathml{\\mathopen{[\\mkern-3.2mu[}}{\\mathopen{\\char`⟦}}"), q("\\rrbracket", "\\html@mathml{\\mathclose{]\\mkern-3.2mu]}}{\\mathclose{\\char`⟧}}"), q("⟦", "\\llbracket"), q("⟧", "\\rrbracket"), q("\\lBrace", "\\html@mathml{\\mathopen{\\{\\mkern-3.2mu[}}{\\mathopen{\\char`⦃}}"), q("\\rBrace", "\\html@mathml{\\mathclose{]\\mkern-3.2mu\\}}}{\\mathclose{\\char`⦄}}"), q("⦃", "\\lBrace"), q("⦄", "\\rBrace"), q("\\minuso", "\\mathbin{\\html@mathml{{\\mathrlap{\\mathchoice{\\kern{0.145em}}{\\kern{0.145em}}{\\kern{0.1015em}}{\\kern{0.0725em}}\\circ}{-}}}{\\char`⦵}}"), q("⦵", "\\minuso"), q("\\darr", "\\downarrow"), q("\\dArr", "\\Downarrow"), q("\\Darr", "\\Downarrow"), q("\\lang", "\\langle"), q("\\rang", "\\rangle"), q("\\uarr", "\\uparrow"), q("\\uArr", "\\Uparrow"), q("\\Uarr", "\\Uparrow"), q("\\N", "\\mathbb{N}"), q("\\R", "\\mathbb{R}"), q("\\Z", "\\mathbb{Z}"), q("\\alef", "\\aleph"), q("\\alefsym", "\\aleph"), q("\\Alpha", "\\mathrm{A}"), q("\\Beta", "\\mathrm{B}"), q("\\bull", "\\bullet"), q("\\Chi", "\\mathrm{X}"), q("\\clubs", "\\clubsuit"), q("\\cnums", "\\mathbb{C}"), q("\\Complex", "\\mathbb{C}"), q("\\Dagger", "\\ddagger"), q("\\diamonds", "\\diamondsuit"), q("\\empty", "\\emptyset"), q("\\Epsilon", "\\mathrm{E}"), q("\\Eta", "\\mathrm{H}"), q("\\exist", "\\exists"), q("\\harr", "\\leftrightarrow"), q("\\hArr", "\\Leftrightarrow"), q("\\Harr", "\\Leftrightarrow"), q("\\hearts", "\\heartsuit"), q("\\image", "\\Im"), q("\\infin", "\\infty"), q("\\Iota", "\\mathrm{I}"), q("\\isin", "\\in"), q("\\Kappa", "\\mathrm{K}"), q("\\larr", "\\leftarrow"), q("\\lArr", "\\Leftarrow"), q("\\Larr", "\\Leftarrow"), q("\\lrarr", "\\leftrightarrow"), q("\\lrArr", "\\Leftrightarrow"), q("\\Lrarr", "\\Leftrightarrow"), q("\\Mu", "\\mathrm{M}"), q("\\natnums", "\\mathbb{N}"), q("\\Nu", "\\mathrm{N}"), q("\\Omicron", "\\mathrm{O}"), q("\\plusmn", "\\pm"), q("\\rarr", "\\rightarrow"), q("\\rArr", "\\Rightarrow"), q("\\Rarr", "\\Rightarrow"), q("\\real", "\\Re"), q("\\reals", "\\mathbb{R}"), q("\\Reals", "\\mathbb{R}"), q("\\Rho", "\\mathrm{P}"), q("\\sdot", "\\cdot"), q("\\sect", "\\S"), q("\\spades", "\\spadesuit"), q("\\sub", "\\subset"), q("\\sube", "\\subseteq"), q("\\supe", "\\supseteq"), q("\\Tau", "\\mathrm{T}"), q("\\thetasym", "\\vartheta"), q("\\weierp", "\\wp"), q("\\Zeta", "\\mathrm{Z}"), q("\\argmin", "\\DOTSB\\operatorname*{arg\\,min}"), q("\\argmax", "\\DOTSB\\operatorname*{arg\\,max}"), q("\\plim", "\\DOTSB\\mathop{\\operatorname{plim}}\\limits"), q("\\bra", "\\mathinner{\\langle{#1}|}"), q("\\ket", "\\mathinner{|{#1}\\rangle}"), q("\\braket", "\\mathinner{\\langle{#1}\\rangle}"), q("\\Bra", "\\left\\langle#1\\right|"), q("\\Ket", "\\left|#1\\right\\rangle");
var Ha = (e) => (t) => {
	var n = t.consumeArg().tokens, r = t.consumeArg().tokens, i = t.consumeArg().tokens, a = t.consumeArg().tokens, o = t.macros.get("|"), s = t.macros.get("\\|");
	t.macros.beginGroup();
	var c = (t) => (n) => {
		e && (n.macros.set("|", o), i.length && n.macros.set("\\|", s));
		var a = t;
		return !t && i.length && n.future().text === "|" && (n.popToken(), a = !0), {
			tokens: a ? i : r,
			numArgs: 0
		};
	};
	t.macros.set("|", c(!1)), i.length && t.macros.set("\\|", c(!0));
	var l = t.consumeArg().tokens, u = t.expandTokens([
		...a,
		...l,
		...n
	]);
	return t.macros.endGroup(), {
		tokens: u.reverse(),
		numArgs: 0
	};
};
q("\\bra@ket", Ha(!1)), q("\\bra@set", Ha(!0)), q("\\Braket", "\\bra@ket{\\left\\langle}{\\,\\middle\\vert\\,}{\\,\\middle\\vert\\,}{\\right\\rangle}"), q("\\Set", "\\bra@set{\\left\\{\\:}{\\;\\middle\\vert\\;}{\\;\\middle\\Vert\\;}{\\:\\right\\}}"), q("\\set", "\\bra@set{\\{\\,}{\\mid}{}{\\,\\}}"), q("\\angln", "{\\angl n}"), q("\\blue", "\\textcolor{##6495ed}{#1}"), q("\\orange", "\\textcolor{##ffa500}{#1}"), q("\\pink", "\\textcolor{##ff00af}{#1}"), q("\\red", "\\textcolor{##df0030}{#1}"), q("\\green", "\\textcolor{##28ae7b}{#1}"), q("\\gray", "\\textcolor{gray}{#1}"), q("\\purple", "\\textcolor{##9d38bd}{#1}"), q("\\blueA", "\\textcolor{##ccfaff}{#1}"), q("\\blueB", "\\textcolor{##80f6ff}{#1}"), q("\\blueC", "\\textcolor{##63d9ea}{#1}"), q("\\blueD", "\\textcolor{##11accd}{#1}"), q("\\blueE", "\\textcolor{##0c7f99}{#1}"), q("\\tealA", "\\textcolor{##94fff5}{#1}"), q("\\tealB", "\\textcolor{##26edd5}{#1}"), q("\\tealC", "\\textcolor{##01d1c1}{#1}"), q("\\tealD", "\\textcolor{##01a995}{#1}"), q("\\tealE", "\\textcolor{##208170}{#1}"), q("\\greenA", "\\textcolor{##b6ffb0}{#1}"), q("\\greenB", "\\textcolor{##8af281}{#1}"), q("\\greenC", "\\textcolor{##74cf70}{#1}"), q("\\greenD", "\\textcolor{##1fab54}{#1}"), q("\\greenE", "\\textcolor{##0d923f}{#1}"), q("\\goldA", "\\textcolor{##ffd0a9}{#1}"), q("\\goldB", "\\textcolor{##ffbb71}{#1}"), q("\\goldC", "\\textcolor{##ff9c39}{#1}"), q("\\goldD", "\\textcolor{##e07d10}{#1}"), q("\\goldE", "\\textcolor{##a75a05}{#1}"), q("\\redA", "\\textcolor{##fca9a9}{#1}"), q("\\redB", "\\textcolor{##ff8482}{#1}"), q("\\redC", "\\textcolor{##f9685d}{#1}"), q("\\redD", "\\textcolor{##e84d39}{#1}"), q("\\redE", "\\textcolor{##bc2612}{#1}"), q("\\maroonA", "\\textcolor{##ffbde0}{#1}"), q("\\maroonB", "\\textcolor{##ff92c6}{#1}"), q("\\maroonC", "\\textcolor{##ed5fa6}{#1}"), q("\\maroonD", "\\textcolor{##ca337c}{#1}"), q("\\maroonE", "\\textcolor{##9e034e}{#1}"), q("\\purpleA", "\\textcolor{##ddd7ff}{#1}"), q("\\purpleB", "\\textcolor{##c6b9fc}{#1}"), q("\\purpleC", "\\textcolor{##aa87ff}{#1}"), q("\\purpleD", "\\textcolor{##7854ab}{#1}"), q("\\purpleE", "\\textcolor{##543b78}{#1}"), q("\\mintA", "\\textcolor{##f5f9e8}{#1}"), q("\\mintB", "\\textcolor{##edf2df}{#1}"), q("\\mintC", "\\textcolor{##e0e5cc}{#1}"), q("\\grayA", "\\textcolor{##f6f7f7}{#1}"), q("\\grayB", "\\textcolor{##f0f1f2}{#1}"), q("\\grayC", "\\textcolor{##e3e5e6}{#1}"), q("\\grayD", "\\textcolor{##d6d8da}{#1}"), q("\\grayE", "\\textcolor{##babec2}{#1}"), q("\\grayF", "\\textcolor{##888d93}{#1}"), q("\\grayG", "\\textcolor{##626569}{#1}"), q("\\grayH", "\\textcolor{##3b3e40}{#1}"), q("\\grayI", "\\textcolor{##21242c}{#1}"), q("\\kaBlue", "\\textcolor{##314453}{#1}"), q("\\kaGreen", "\\textcolor{##71B307}{#1}");
var Ua = {
	"^": !0,
	_: !0,
	"\\limits": !0,
	"\\nolimits": !0
}, Wa = class {
	constructor(e, t, n) {
		this.settings = void 0, this.expansionCount = void 0, this.lexer = void 0, this.macros = void 0, this.stack = void 0, this.mode = void 0, this.settings = t, this.expansionCount = 0, this.feed(e), this.macros = new Pa(Fa, t.macros), this.mode = n, this.stack = [];
	}
	feed(e) {
		this.lexer = new Na(e, this.settings);
	}
	switchMode(e) {
		this.mode = e;
	}
	beginGroup() {
		this.macros.beginGroup();
	}
	endGroup() {
		this.macros.endGroup();
	}
	endGroups() {
		this.macros.endGroups();
	}
	future() {
		return this.stack.length === 0 && this.pushToken(this.lexer.lex()), this.stack[this.stack.length - 1];
	}
	popToken() {
		return this.future(), this.stack.pop();
	}
	pushToken(e) {
		this.stack.push(e);
	}
	pushTokens(e) {
		this.stack.push(...e);
	}
	scanArgument(e) {
		var t, n, r;
		if (e) {
			if (this.consumeSpaces(), this.future().text !== "[") return null;
			t = this.popToken(), {tokens: r, end: n} = this.consumeArg(["]"]);
		} else ({tokens: r, start: t, end: n} = this.consumeArg());
		return this.pushToken(new Pi("EOF", n.loc)), this.pushTokens(r), new Pi("", Ni.range(t, n));
	}
	consumeSpaces() {
		for (; this.future().text === " ";) this.stack.pop();
	}
	consumeArg(e) {
		var t = [], n = e && e.length > 0;
		n || this.consumeSpaces();
		var r = this.future(), i, a = 0, o = 0;
		do {
			if (i = this.popToken(), t.push(i), i.text === "{") ++a;
			else if (i.text === "}") {
				if (--a, a === -1) throw new C("Extra }", i);
			} else if (i.text === "EOF") throw new C("Unexpected end of input in a macro argument, expected '" + (e && n ? e[o] : "}") + "'", i);
			if (e && n) if ((a === 0 || a === 1 && e[o] === "{") && i.text === e[o]) {
				if (++o, o === e.length) {
					t.splice(-o, o);
					break;
				}
			} else o = 0;
		} while (a !== 0 || n);
		return r.text === "{" && t[t.length - 1].text === "}" && (t.pop(), t.shift()), t.reverse(), {
			tokens: t,
			start: r,
			end: i
		};
	}
	consumeArgs(e, t) {
		if (t) {
			if (t.length !== e + 1) throw new C("The length of delimiters doesn't match the number of args!");
			for (var n = t[0], r = 0; r < n.length; r++) {
				var i = this.popToken();
				if (n[r] !== i.text) throw new C("Use of the macro doesn't match its definition", i);
			}
		}
		for (var a = [], o = 0; o < e; o++) a.push(this.consumeArg(t && t[o + 1]).tokens);
		return a;
	}
	countExpansion(e) {
		if (this.expansionCount += e, this.expansionCount > this.settings.maxExpand) throw new C("Too many expansions: infinite loop or need to increase maxExpand setting");
	}
	expandOnce(e) {
		var t = this.popToken(), n = t.text, r = t.noexpand ? null : this._getExpansion(n);
		if (r == null || e && r.unexpandable) {
			if (e && r == null && n[0] === "\\" && !this.isDefined(n)) throw new C("Undefined control sequence: " + n);
			return this.pushToken(t), !1;
		}
		this.countExpansion(1);
		var i = r.tokens, a = this.consumeArgs(r.numArgs, r.delimiters);
		if (r.numArgs) {
			i = i.slice();
			for (var o = i.length - 1; o >= 0; --o) {
				var s = i[o];
				if (s.text === "#") {
					if (o === 0) throw new C("Incomplete placeholder at end of macro body", s);
					if (s = i[--o], s.text === "#") i.splice(o + 1, 1);
					else if (/^[1-9]$/.test(s.text)) i.splice(o, 2, ...a[s.text - 1]);
					else throw new C("Not a valid argument number", s);
				}
			}
		}
		return this.pushTokens(i), i.length;
	}
	expandAfterFuture() {
		return this.expandOnce(), this.future();
	}
	expandNextToken() {
		for (;;) if (this.expandOnce() === !1) {
			var e = this.stack.pop();
			return e.treatAsRelax && (e.text = "\\relax"), e;
		}
	}
	expandMacro(e) {
		return this.macros.has(e) ? this.expandTokens([new Pi(e)]) : void 0;
	}
	expandTokens(e) {
		var t = [], n = this.stack.length;
		for (this.pushTokens(e); this.stack.length > n;) if (this.expandOnce(!0) === !1) {
			var r = this.stack.pop();
			r.treatAsRelax &&= (r.noexpand = !1, !1), t.push(r);
		}
		return this.countExpansion(t.length), t;
	}
	expandMacroAsText(e) {
		var t = this.expandMacro(e);
		return t && t.map((e) => e.text).join("");
	}
	_getExpansion(e) {
		var t = this.macros.get(e);
		if (t == null) return t;
		if (e.length === 1) {
			var n = this.lexer.catcodes[e];
			if (n != null && n !== 13) return;
		}
		var r = typeof t == "function" ? t(this) : t;
		if (typeof r == "string") {
			var i = 0;
			if (r.includes("#")) for (var a = r.replace(/##/g, ""); a.includes("#" + (i + 1));) ++i;
			for (var o = new Na(r, this.settings), s = [], c = o.lex(); c.text !== "EOF";) s.push(c), c = o.lex();
			return s.reverse(), {
				tokens: s,
				numArgs: i
			};
		}
		return r;
	}
	isDefined(e) {
		return this.macros.has(e) || wa.hasOwnProperty(e) || D.math.hasOwnProperty(e) || D.text.hasOwnProperty(e) || Ua.hasOwnProperty(e);
	}
	isExpandable(e) {
		var t = this.macros.get(e);
		return t == null ? wa.hasOwnProperty(e) && !wa[e].primitive : typeof t == "string" || typeof t == "function" || !t.unexpandable;
	}
}, Ga = /^[₊₋₌₍₎₀₁₂₃₄₅₆₇₈₉ₐₑₕᵢⱼₖₗₘₙₒₚᵣₛₜᵤᵥₓᵦᵧᵨᵩᵪ]/, Ka = Object.freeze({
	"₊": "+",
	"₋": "-",
	"₌": "=",
	"₍": "(",
	"₎": ")",
	"₀": "0",
	"₁": "1",
	"₂": "2",
	"₃": "3",
	"₄": "4",
	"₅": "5",
	"₆": "6",
	"₇": "7",
	"₈": "8",
	"₉": "9",
	ₐ: "a",
	ₑ: "e",
	ₕ: "h",
	ᵢ: "i",
	ⱼ: "j",
	ₖ: "k",
	ₗ: "l",
	ₘ: "m",
	ₙ: "n",
	ₒ: "o",
	ₚ: "p",
	ᵣ: "r",
	ₛ: "s",
	ₜ: "t",
	ᵤ: "u",
	ᵥ: "v",
	ₓ: "x",
	ᵦ: "β",
	ᵧ: "γ",
	ᵨ: "ρ",
	ᵩ: "ϕ",
	ᵪ: "χ",
	"⁺": "+",
	"⁻": "-",
	"⁼": "=",
	"⁽": "(",
	"⁾": ")",
	"⁰": "0",
	"¹": "1",
	"²": "2",
	"³": "3",
	"⁴": "4",
	"⁵": "5",
	"⁶": "6",
	"⁷": "7",
	"⁸": "8",
	"⁹": "9",
	ᴬ: "A",
	ᴮ: "B",
	ᴰ: "D",
	ᴱ: "E",
	ᴳ: "G",
	ᴴ: "H",
	ᴵ: "I",
	ᴶ: "J",
	ᴷ: "K",
	ᴸ: "L",
	ᴹ: "M",
	ᴺ: "N",
	ᴼ: "O",
	ᴾ: "P",
	ᴿ: "R",
	ᵀ: "T",
	ᵁ: "U",
	ⱽ: "V",
	ᵂ: "W",
	ᵃ: "a",
	ᵇ: "b",
	ᶜ: "c",
	ᵈ: "d",
	ᵉ: "e",
	ᶠ: "f",
	ᵍ: "g",
	ʰ: "h",
	ⁱ: "i",
	ʲ: "j",
	ᵏ: "k",
	ˡ: "l",
	ᵐ: "m",
	ⁿ: "n",
	ᵒ: "o",
	ᵖ: "p",
	ʳ: "r",
	ˢ: "s",
	ᵗ: "t",
	ᵘ: "u",
	ᵛ: "v",
	ʷ: "w",
	ˣ: "x",
	ʸ: "y",
	ᶻ: "z",
	ᵝ: "β",
	ᵞ: "γ",
	ᵟ: "δ",
	ᵠ: "ϕ",
	ᵡ: "χ",
	ᶿ: "θ"
}), qa = {
	"́": {
		text: "\\'",
		math: "\\acute"
	},
	"̀": {
		text: "\\`",
		math: "\\grave"
	},
	"̈": {
		text: "\\\"",
		math: "\\ddot"
	},
	"̃": {
		text: "\\~",
		math: "\\tilde"
	},
	"̄": {
		text: "\\=",
		math: "\\bar"
	},
	"̆": {
		text: "\\u",
		math: "\\breve"
	},
	"̌": {
		text: "\\v",
		math: "\\check"
	},
	"̂": {
		text: "\\^",
		math: "\\hat"
	},
	"̇": {
		text: "\\.",
		math: "\\dot"
	},
	"̊": {
		text: "\\r",
		math: "\\mathring"
	},
	"̋": { text: "\\H" },
	"̧": { text: "\\c" }
}, Ja = {
	á: "á",
	à: "à",
	ä: "ä",
	ǟ: "ǟ",
	ã: "ã",
	ā: "ā",
	ă: "ă",
	ắ: "ắ",
	ằ: "ằ",
	ẵ: "ẵ",
	ǎ: "ǎ",
	â: "â",
	ấ: "ấ",
	ầ: "ầ",
	ẫ: "ẫ",
	ȧ: "ȧ",
	ǡ: "ǡ",
	å: "å",
	ǻ: "ǻ",
	ḃ: "ḃ",
	ć: "ć",
	ḉ: "ḉ",
	č: "č",
	ĉ: "ĉ",
	ċ: "ċ",
	ç: "ç",
	ď: "ď",
	ḋ: "ḋ",
	ḑ: "ḑ",
	é: "é",
	è: "è",
	ë: "ë",
	ẽ: "ẽ",
	ē: "ē",
	ḗ: "ḗ",
	ḕ: "ḕ",
	ĕ: "ĕ",
	ḝ: "ḝ",
	ě: "ě",
	ê: "ê",
	ế: "ế",
	ề: "ề",
	ễ: "ễ",
	ė: "ė",
	ȩ: "ȩ",
	ḟ: "ḟ",
	ǵ: "ǵ",
	ḡ: "ḡ",
	ğ: "ğ",
	ǧ: "ǧ",
	ĝ: "ĝ",
	ġ: "ġ",
	ģ: "ģ",
	ḧ: "ḧ",
	ȟ: "ȟ",
	ĥ: "ĥ",
	ḣ: "ḣ",
	ḩ: "ḩ",
	í: "í",
	ì: "ì",
	ï: "ï",
	ḯ: "ḯ",
	ĩ: "ĩ",
	ī: "ī",
	ĭ: "ĭ",
	ǐ: "ǐ",
	î: "î",
	ǰ: "ǰ",
	ĵ: "ĵ",
	ḱ: "ḱ",
	ǩ: "ǩ",
	ķ: "ķ",
	ĺ: "ĺ",
	ľ: "ľ",
	ļ: "ļ",
	ḿ: "ḿ",
	ṁ: "ṁ",
	ń: "ń",
	ǹ: "ǹ",
	ñ: "ñ",
	ň: "ň",
	ṅ: "ṅ",
	ņ: "ņ",
	ó: "ó",
	ò: "ò",
	ö: "ö",
	ȫ: "ȫ",
	õ: "õ",
	ṍ: "ṍ",
	ṏ: "ṏ",
	ȭ: "ȭ",
	ō: "ō",
	ṓ: "ṓ",
	ṑ: "ṑ",
	ŏ: "ŏ",
	ǒ: "ǒ",
	ô: "ô",
	ố: "ố",
	ồ: "ồ",
	ỗ: "ỗ",
	ȯ: "ȯ",
	ȱ: "ȱ",
	ő: "ő",
	ṕ: "ṕ",
	ṗ: "ṗ",
	ŕ: "ŕ",
	ř: "ř",
	ṙ: "ṙ",
	ŗ: "ŗ",
	ś: "ś",
	ṥ: "ṥ",
	š: "š",
	ṧ: "ṧ",
	ŝ: "ŝ",
	ṡ: "ṡ",
	ş: "ş",
	ẗ: "ẗ",
	ť: "ť",
	ṫ: "ṫ",
	ţ: "ţ",
	ú: "ú",
	ù: "ù",
	ü: "ü",
	ǘ: "ǘ",
	ǜ: "ǜ",
	ǖ: "ǖ",
	ǚ: "ǚ",
	ũ: "ũ",
	ṹ: "ṹ",
	ū: "ū",
	ṻ: "ṻ",
	ŭ: "ŭ",
	ǔ: "ǔ",
	û: "û",
	ů: "ů",
	ű: "ű",
	ṽ: "ṽ",
	ẃ: "ẃ",
	ẁ: "ẁ",
	ẅ: "ẅ",
	ŵ: "ŵ",
	ẇ: "ẇ",
	ẘ: "ẘ",
	ẍ: "ẍ",
	ẋ: "ẋ",
	ý: "ý",
	ỳ: "ỳ",
	ÿ: "ÿ",
	ỹ: "ỹ",
	ȳ: "ȳ",
	ŷ: "ŷ",
	ẏ: "ẏ",
	ẙ: "ẙ",
	ź: "ź",
	ž: "ž",
	ẑ: "ẑ",
	ż: "ż",
	Á: "Á",
	À: "À",
	Ä: "Ä",
	Ǟ: "Ǟ",
	Ã: "Ã",
	Ā: "Ā",
	Ă: "Ă",
	Ắ: "Ắ",
	Ằ: "Ằ",
	Ẵ: "Ẵ",
	Ǎ: "Ǎ",
	Â: "Â",
	Ấ: "Ấ",
	Ầ: "Ầ",
	Ẫ: "Ẫ",
	Ȧ: "Ȧ",
	Ǡ: "Ǡ",
	Å: "Å",
	Ǻ: "Ǻ",
	Ḃ: "Ḃ",
	Ć: "Ć",
	Ḉ: "Ḉ",
	Č: "Č",
	Ĉ: "Ĉ",
	Ċ: "Ċ",
	Ç: "Ç",
	Ď: "Ď",
	Ḋ: "Ḋ",
	Ḑ: "Ḑ",
	É: "É",
	È: "È",
	Ë: "Ë",
	Ẽ: "Ẽ",
	Ē: "Ē",
	Ḗ: "Ḗ",
	Ḕ: "Ḕ",
	Ĕ: "Ĕ",
	Ḝ: "Ḝ",
	Ě: "Ě",
	Ê: "Ê",
	Ế: "Ế",
	Ề: "Ề",
	Ễ: "Ễ",
	Ė: "Ė",
	Ȩ: "Ȩ",
	Ḟ: "Ḟ",
	Ǵ: "Ǵ",
	Ḡ: "Ḡ",
	Ğ: "Ğ",
	Ǧ: "Ǧ",
	Ĝ: "Ĝ",
	Ġ: "Ġ",
	Ģ: "Ģ",
	Ḧ: "Ḧ",
	Ȟ: "Ȟ",
	Ĥ: "Ĥ",
	Ḣ: "Ḣ",
	Ḩ: "Ḩ",
	Í: "Í",
	Ì: "Ì",
	Ï: "Ï",
	Ḯ: "Ḯ",
	Ĩ: "Ĩ",
	Ī: "Ī",
	Ĭ: "Ĭ",
	Ǐ: "Ǐ",
	Î: "Î",
	İ: "İ",
	Ĵ: "Ĵ",
	Ḱ: "Ḱ",
	Ǩ: "Ǩ",
	Ķ: "Ķ",
	Ĺ: "Ĺ",
	Ľ: "Ľ",
	Ļ: "Ļ",
	Ḿ: "Ḿ",
	Ṁ: "Ṁ",
	Ń: "Ń",
	Ǹ: "Ǹ",
	Ñ: "Ñ",
	Ň: "Ň",
	Ṅ: "Ṅ",
	Ņ: "Ņ",
	Ó: "Ó",
	Ò: "Ò",
	Ö: "Ö",
	Ȫ: "Ȫ",
	Õ: "Õ",
	Ṍ: "Ṍ",
	Ṏ: "Ṏ",
	Ȭ: "Ȭ",
	Ō: "Ō",
	Ṓ: "Ṓ",
	Ṑ: "Ṑ",
	Ŏ: "Ŏ",
	Ǒ: "Ǒ",
	Ô: "Ô",
	Ố: "Ố",
	Ồ: "Ồ",
	Ỗ: "Ỗ",
	Ȯ: "Ȯ",
	Ȱ: "Ȱ",
	Ő: "Ő",
	Ṕ: "Ṕ",
	Ṗ: "Ṗ",
	Ŕ: "Ŕ",
	Ř: "Ř",
	Ṙ: "Ṙ",
	Ŗ: "Ŗ",
	Ś: "Ś",
	Ṥ: "Ṥ",
	Š: "Š",
	Ṧ: "Ṧ",
	Ŝ: "Ŝ",
	Ṡ: "Ṡ",
	Ş: "Ş",
	Ť: "Ť",
	Ṫ: "Ṫ",
	Ţ: "Ţ",
	Ú: "Ú",
	Ù: "Ù",
	Ü: "Ü",
	Ǘ: "Ǘ",
	Ǜ: "Ǜ",
	Ǖ: "Ǖ",
	Ǚ: "Ǚ",
	Ũ: "Ũ",
	Ṹ: "Ṹ",
	Ū: "Ū",
	Ṻ: "Ṻ",
	Ŭ: "Ŭ",
	Ǔ: "Ǔ",
	Û: "Û",
	Ů: "Ů",
	Ű: "Ű",
	Ṽ: "Ṽ",
	Ẃ: "Ẃ",
	Ẁ: "Ẁ",
	Ẅ: "Ẅ",
	Ŵ: "Ŵ",
	Ẇ: "Ẇ",
	Ẍ: "Ẍ",
	Ẋ: "Ẋ",
	Ý: "Ý",
	Ỳ: "Ỳ",
	Ÿ: "Ÿ",
	Ỹ: "Ỹ",
	Ȳ: "Ȳ",
	Ŷ: "Ŷ",
	Ẏ: "Ẏ",
	Ź: "Ź",
	Ž: "Ž",
	Ẑ: "Ẑ",
	Ż: "Ż",
	ά: "ά",
	ὰ: "ὰ",
	ᾱ: "ᾱ",
	ᾰ: "ᾰ",
	έ: "έ",
	ὲ: "ὲ",
	ή: "ή",
	ὴ: "ὴ",
	ί: "ί",
	ὶ: "ὶ",
	ϊ: "ϊ",
	ΐ: "ΐ",
	ῒ: "ῒ",
	ῑ: "ῑ",
	ῐ: "ῐ",
	ό: "ό",
	ὸ: "ὸ",
	ύ: "ύ",
	ὺ: "ὺ",
	ϋ: "ϋ",
	ΰ: "ΰ",
	ῢ: "ῢ",
	ῡ: "ῡ",
	ῠ: "ῠ",
	ώ: "ώ",
	ὼ: "ὼ",
	Ύ: "Ύ",
	Ὺ: "Ὺ",
	Ϋ: "Ϋ",
	Ῡ: "Ῡ",
	Ῠ: "Ῠ",
	Ώ: "Ώ",
	Ὼ: "Ὼ"
}, Ya = class e {
	constructor(e, t) {
		this.mode = void 0, this.gullet = void 0, this.settings = void 0, this.leftrightDepth = void 0, this.nextToken = void 0, this.mode = "math", this.gullet = new Wa(e, t, this.mode), this.settings = t, this.leftrightDepth = 0, this.nextToken = null;
	}
	expect(e, t) {
		if (t === void 0 && (t = !0), this.fetch().text !== e) throw new C("Expected '" + e + "', got '" + this.fetch().text + "'", this.fetch());
		t && this.consume();
	}
	consume() {
		this.nextToken = null;
	}
	fetch() {
		return this.nextToken ??= this.gullet.expandNextToken(), this.nextToken;
	}
	switchMode(e) {
		this.mode = e, this.gullet.switchMode(e);
	}
	parse() {
		this.settings.globalGroup || this.gullet.beginGroup(), this.settings.colorIsTextColor && this.gullet.macros.set("\\color", "\\textcolor");
		try {
			var e = this.parseExpression(!1);
			return this.expect("EOF"), this.settings.globalGroup || this.gullet.endGroup(), e;
		} finally {
			this.gullet.endGroups();
		}
	}
	subparse(e) {
		var t = this.nextToken;
		this.consume(), this.gullet.pushToken(new Pi("}")), this.gullet.pushTokens(e);
		var n = this.parseExpression(!1);
		return this.expect("}"), this.nextToken = t, n;
	}
	parseExpression(t, n) {
		for (var r = [];;) {
			this.mode === "math" && this.consumeSpaces();
			var i = this.fetch();
			if (e.endOfExpression.has(i.text) || n && i.text === n || t && wa[i.text] && wa[i.text].infix) break;
			var a = this.parseAtom(n);
			if (!a) break;
			a.type !== "internal" && r.push(a);
		}
		return this.mode === "text" && this.formLigatures(r), this.handleInfixNodes(r);
	}
	handleInfixNodes(e) {
		for (var t = -1, n, r = 0; r < e.length; r++) {
			var i = e[r];
			if (i.type === "infix") {
				if (t !== -1) throw new C("only one infix operator per group", i.token);
				t = r, n = i.replaceWith;
			}
		}
		if (t !== -1 && n) {
			var a, o, s = e.slice(0, t), c = e.slice(t + 1);
			return a = s.length === 1 && s[0].type === "ordgroup" ? s[0] : {
				type: "ordgroup",
				mode: this.mode,
				body: s
			}, o = c.length === 1 && c[0].type === "ordgroup" ? c[0] : {
				type: "ordgroup",
				mode: this.mode,
				body: c
			}, [n === "\\\\abovefrac" ? this.callFunction(n, [
				a,
				e[t],
				o
			], []) : this.callFunction(n, [a, o], [])];
		} else return e;
	}
	handleSupSubscript(e) {
		var t = this.fetch(), n = t.text;
		this.consume(), this.consumeSpaces();
		var r;
		do
			r = this.parseGroup(e);
		while (r?.type === "internal");
		if (!r) throw new C("Expected group after '" + n + "'", t);
		return r;
	}
	formatUnsupportedCmd(e) {
		for (var t = [], n = 0; n < e.length; n++) t.push({
			type: "textord",
			mode: "text",
			text: e[n]
		});
		var r = {
			type: "text",
			mode: this.mode,
			body: t
		};
		return {
			type: "color",
			mode: this.mode,
			color: this.settings.errorColor,
			body: [r]
		};
	}
	parseAtom(e) {
		var t = this.parseGroup("atom", e);
		if (t?.type === "internal" || this.mode === "text") return t;
		for (var n, r;;) {
			this.consumeSpaces();
			var i = this.fetch();
			if (i.text === "\\limits" || i.text === "\\nolimits") {
				if (t && t.type === "op") t.limits = i.text === "\\limits", t.alwaysHandleSupSub = !0;
				else if (t && t.type === "operatorname") t.alwaysHandleSupSub && (t.limits = i.text === "\\limits");
				else throw new C("Limit controls must follow a math operator", i);
				this.consume();
			} else if (i.text === "^") {
				if (n) throw new C("Double superscript", i);
				n = this.handleSupSubscript("superscript");
			} else if (i.text === "_") {
				if (r) throw new C("Double subscript", i);
				r = this.handleSupSubscript("subscript");
			} else if (i.text === "'") {
				if (n) throw new C("Double superscript", i);
				var a = {
					type: "textord",
					mode: this.mode,
					text: "\\prime"
				}, o = [a];
				for (this.consume(); this.fetch().text === "'";) o.push(a), this.consume();
				this.fetch().text === "^" && o.push(this.handleSupSubscript("superscript")), n = {
					type: "ordgroup",
					mode: this.mode,
					body: o
				};
			} else if (Ka[i.text]) {
				var s = Ga.test(i.text), c = [];
				for (c.push(new Pi(Ka[i.text])), this.consume();;) {
					var l = this.fetch().text;
					if (!Ka[l] || Ga.test(l) !== s) break;
					c.unshift(new Pi(Ka[l])), this.consume();
				}
				var u = this.subparse(c);
				s ? r = {
					type: "ordgroup",
					mode: "math",
					body: u
				} : n = {
					type: "ordgroup",
					mode: "math",
					body: u
				};
			} else break;
		}
		return n || r ? {
			type: "supsub",
			mode: this.mode,
			base: t,
			sup: n,
			sub: r
		} : t;
	}
	parseFunction(e, t) {
		var n = this.fetch(), r = n.text, i = wa[r];
		if (!i) return null;
		if (this.consume(), t && t !== "atom" && !i.allowedInArgument) throw new C("Got function '" + r + "' with no arguments" + (t ? " as " + t : ""), n);
		if (this.mode === "text" && !i.allowedInText) throw new C("Can't use function '" + r + "' in text mode", n);
		if (this.mode === "math" && i.allowedInMath === !1) throw new C("Can't use function '" + r + "' in math mode", n);
		var { args: a, optArgs: o } = this.parseArguments(r, i);
		return this.callFunction(r, a, o, n, e);
	}
	callFunction(e, t, n, r, i) {
		var a = {
			funcName: e,
			parser: this,
			token: r,
			breakOnTokenText: i
		}, o = wa[e];
		if (o && o.handler) return o.handler(a, t, n);
		throw new C("No function handler for " + e);
	}
	parseArguments(e, t) {
		var n = t.numArgs + t.numOptionalArgs;
		if (n === 0) return {
			args: [],
			optArgs: []
		};
		for (var r = [], i = [], a = 0; a < n; a++) {
			var o = t.argTypes && t.argTypes[a], s = a < t.numOptionalArgs;
			("primitive" in t && t.primitive && o == null || t.type === "sqrt" && a === 1 && i[0] == null) && (o = "primitive");
			var c = this.parseGroupOfType("argument to '" + e + "'", o, s);
			if (s) i.push(c);
			else if (c != null) r.push(c);
			else throw new C("Null argument, please report this as a bug");
		}
		return {
			args: r,
			optArgs: i
		};
	}
	parseGroupOfType(e, t, n) {
		switch (t) {
			case "color": return this.parseColorGroup(n);
			case "size": return this.parseSizeGroup(n);
			case "url": return this.parseUrlGroup(n);
			case "math":
			case "text": return this.parseArgumentGroup(n, t);
			case "hbox":
				var r = this.parseArgumentGroup(n, "text");
				return r == null ? null : {
					type: "styling",
					mode: r.mode,
					body: [r],
					style: "text",
					resetFont: !0
				};
			case "raw":
				var i = this.parseStringGroup("raw", n);
				return i == null ? null : {
					type: "raw",
					mode: "text",
					string: i.text
				};
			case "primitive":
				if (n) throw new C("A primitive argument cannot be optional");
				var a = this.parseGroup(e);
				if (a == null) throw new C("Expected group as " + e, this.fetch());
				return a;
			case "original":
			case null:
			case void 0: return this.parseArgumentGroup(n);
			default: throw new C("Unknown group type as " + e, this.fetch());
		}
	}
	consumeSpaces() {
		for (; this.fetch().text === " ";) this.consume();
	}
	parseStringGroup(e, t) {
		var n = this.gullet.scanArgument(t);
		if (n == null) return null;
		for (var r = "", i; (i = this.fetch()).text !== "EOF";) r += i.text, this.consume();
		return this.consume(), n.text = r, n;
	}
	parseRegexGroup(e, t) {
		for (var n = this.fetch(), r = n, i = "", a; (a = this.fetch()).text !== "EOF" && e.test(i + a.text);) r = a, i += r.text, this.consume();
		if (i === "") throw new C("Invalid " + t + ": '" + n.text + "'", n);
		return n.range(r, i);
	}
	parseColorGroup(e) {
		var t = this.parseStringGroup("color", e);
		if (t == null) return null;
		var n = /^(#[a-f0-9]{3,4}|#[a-f0-9]{6}|#[a-f0-9]{8}|[a-f0-9]{6}|[a-z]+)$/i.exec(t.text);
		if (!n) throw new C("Invalid color: '" + t.text + "'", t);
		var r = n[0];
		return /^[0-9a-f]{6}$/i.test(r) && (r = "#" + r), {
			type: "color-token",
			mode: this.mode,
			color: r
		};
	}
	parseSizeGroup(e) {
		var t, n = !1;
		if (this.gullet.consumeSpaces(), t = !e && this.gullet.future().text !== "{" ? this.parseRegexGroup(/^[-+]? *(?:$|\d+|\d+\.\d*|\.\d*) *[a-z]{0,2} *$/, "size") : this.parseStringGroup("size", e), !t) return null;
		!e && t.text.length === 0 && (t.text = "0pt", n = !0);
		var r = /([-+]?) *(\d+(?:\.\d*)?|\.\d+) *([a-z]{2})/.exec(t.text);
		if (!r) throw new C("Invalid size: '" + t.text + "'", t);
		var i = {
			number: +(r[1] + r[2]),
			unit: r[3]
		};
		if (!ct(i)) throw new C("Invalid unit: '" + i.unit + "'", t);
		return {
			type: "size",
			mode: this.mode,
			value: i,
			isBlank: n
		};
	}
	parseUrlGroup(e) {
		this.gullet.lexer.setCatcode("%", 13), this.gullet.lexer.setCatcode("~", 12);
		var t = this.parseStringGroup("url", e);
		if (this.gullet.lexer.setCatcode("%", 14), this.gullet.lexer.setCatcode("~", 13), t == null) return null;
		var n = t.text.replace(/\\([#$%&~_^{}])/g, "$1");
		return {
			type: "url",
			mode: this.mode,
			url: n
		};
	}
	parseArgumentGroup(e, t) {
		var n = this.gullet.scanArgument(e);
		if (n == null) return null;
		var r = this.mode;
		t && this.switchMode(t), this.gullet.beginGroup();
		var i = this.parseExpression(!1, "EOF");
		this.expect("EOF"), this.gullet.endGroup();
		var a = {
			type: "ordgroup",
			mode: this.mode,
			loc: n.loc,
			body: i
		};
		return t && this.switchMode(r), a;
	}
	parseGroup(e, t) {
		var n = this.fetch(), r = n.text, i;
		if (r === "{" || r === "\\begingroup") {
			this.consume();
			var a = r === "{" ? "}" : "\\endgroup";
			this.gullet.beginGroup();
			var o = this.parseExpression(!1, a), s = this.fetch();
			this.expect(a), this.gullet.endGroup(), i = {
				type: "ordgroup",
				mode: this.mode,
				loc: Ni.range(n, s),
				body: o,
				semisimple: r === "\\begingroup" || void 0
			};
		} else if (i = this.parseFunction(t, e) || this.parseSymbol(), i == null && r[0] === "\\" && !Ua.hasOwnProperty(r)) {
			if (this.settings.throwOnError) throw new C("Undefined control sequence: " + r, n);
			i = this.formatUnsupportedCmd(r), this.consume();
		}
		return i;
	}
	formLigatures(e) {
		for (var t = e.length - 1, n = 0; n < t; ++n) {
			var r = e[n];
			if (r.type === "textord") {
				var i = r.text, a = e[n + 1];
				if (!(!a || a.type !== "textord")) {
					if (i === "-" && a.text === "-") {
						var o = e[n + 2];
						n + 1 < t && o && o.type === "textord" && o.text === "-" ? (e.splice(n, 3, {
							type: "textord",
							mode: "text",
							loc: Ni.range(r, o),
							text: "---"
						}), t -= 2) : (e.splice(n, 2, {
							type: "textord",
							mode: "text",
							loc: Ni.range(r, a),
							text: "--"
						}), --t);
					}
					(i === "'" || i === "`") && a.text === i && (e.splice(n, 2, {
						type: "textord",
						mode: "text",
						loc: Ni.range(r, a),
						text: i + i
					}), --t);
				}
			}
		}
	}
	parseSymbol() {
		var e = this.fetch(), t = e.text;
		if (/^\\verb[^a-zA-Z]/.test(t)) {
			this.consume();
			var n = t.slice(5), r = n.charAt(0) === "*";
			if (r && (n = n.slice(1)), n.length < 2 || n.charAt(0) !== n.slice(-1)) throw new C("\\verb assertion failed --\n                    please report what input caused this bug");
			return n = n.slice(1, -1), {
				type: "verb",
				mode: "text",
				body: n,
				star: r
			};
		}
		Ja.hasOwnProperty(t[0]) && !D[this.mode][t[0]] && (this.settings.strict && this.mode === "math" && this.settings.reportNonstrict("unicodeTextInMathMode", "Accented Unicode text character \"" + t[0] + "\" used in math mode", e), t = Ja[t[0]] + t.slice(1));
		var i = ja.exec(t);
		i && (t = t.substring(0, i.index), t === "i" ? t = "ı" : t === "j" && (t = "ȷ"));
		var a;
		if (D[this.mode][t]) {
			this.settings.strict && this.mode === "math" && Qt.includes(t) && this.settings.reportNonstrict("unicodeTextInMathMode", "Latin-1/Unicode text character \"" + t[0] + "\" used in math mode", e);
			var o = D[this.mode][t].group, s = Ni.range(e);
			a = Tr(o) ? {
				type: "atom",
				mode: this.mode,
				family: o,
				loc: s,
				text: t
			} : {
				type: o,
				mode: this.mode,
				loc: s,
				text: t
			};
		} else if (t.charCodeAt(0) >= 128) this.settings.strict && (We(t.charCodeAt(0)) ? this.mode === "math" && this.settings.reportNonstrict("unicodeTextInMathMode", "Unicode text character \"" + t[0] + "\" used in math mode", e) : this.settings.reportNonstrict("unknownSymbol", "Unrecognized Unicode character \"" + t[0] + "\"" + (" (" + t.charCodeAt(0) + ")"), e)), a = {
			type: "textord",
			mode: "text",
			loc: Ni.range(e),
			text: t
		};
		else return null;
		if (this.consume(), i) for (var c = 0; c < i[0].length; c++) {
			var l = i[0][c];
			if (!qa[l]) throw new C("Unknown accent ' " + l + "'", e);
			var u = qa[l][this.mode] || qa[l].text;
			if (!u) throw new C("Accent " + l + " unsupported in " + this.mode + " mode", e);
			a = {
				type: "accent",
				mode: this.mode,
				loc: Ni.range(e),
				label: u,
				isStretchy: !1,
				isShifty: !0,
				base: a
			};
		}
		return a;
	}
};
Ya.endOfExpression = new Set([
	"}",
	"\\endgroup",
	"\\end",
	"\\right",
	"&"
]), typeof document < "u" && document.compatMode !== "CSS1Compat" && typeof console < "u" && console.warn("Warning: KaTeX doesn't work in quirks mode. Make sure your website has a suitable doctype.");
var Xa = "/private/var/folders/_d/9xxv4yg13xz4pvwj4bs4ckqm0000gp/T/nadi-slides-48cb9343-4cfd-4b11-8b2a-9f2d685199fd/Slide_t2-2.jsx";
function Za() {
	let t = ue();
	return /* @__PURE__ */ e.createElement("div", {
		style: { padding: "var(--nadi-space-8)" },
		__self: this,
		__source: {
			fileName: Xa,
			lineNumber: 15,
			columnNumber: 5
		}
	}, /* @__PURE__ */ e.createElement("p", {
		__self: this,
		__source: {
			fileName: Xa,
			lineNumber: 16,
			columnNumber: 7
		}
	}, "Placeholder — Claude will fill this in."), /* @__PURE__ */ e.createElement("button", {
		type: "button",
		onClick: () => t.completeStage("intro"),
		style: {
			padding: "var(--nadi-space-2) var(--nadi-space-4)",
			background: "var(--nadi-accent)",
			color: "var(--nadi-accent-fg)",
			border: "none",
			borderRadius: "var(--nadi-radius)",
			cursor: "pointer"
		},
		__self: this,
		__source: {
			fileName: Xa,
			lineNumber: 17,
			columnNumber: 7
		}
	}, "Continue"));
}
function Qa({ studentName: t, onEvent: n }) {
	return /* @__PURE__ */ e.createElement(he, {
		title: "Acceleration — the per-second-per-second leap",
		onEvent: n,
		__self: this,
		__source: {
			fileName: Xa,
			lineNumber: 37,
			columnNumber: 5
		}
	}, /* @__PURE__ */ e.createElement(Za, {
		__self: this,
		__source: {
			fileName: Xa,
			lineNumber: 38,
			columnNumber: 7
		}
	}));
}
//#endregion
//#region ../../../../../private/var/folders/_d/9xxv4yg13xz4pvwj4bs4ckqm0000gp/T/nadi-slides-48cb9343-4cfd-4b11-8b2a-9f2d685199fd/Slide_t2-3.jsx
var $a = "/private/var/folders/_d/9xxv4yg13xz4pvwj4bs4ckqm0000gp/T/nadi-slides-48cb9343-4cfd-4b11-8b2a-9f2d685199fd/Slide_t2-3.jsx";
function eo() {
	let t = ue();
	return /* @__PURE__ */ e.createElement("div", {
		style: { padding: "var(--nadi-space-8)" },
		__self: this,
		__source: {
			fileName: $a,
			lineNumber: 15,
			columnNumber: 5
		}
	}, /* @__PURE__ */ e.createElement("p", {
		__self: this,
		__source: {
			fileName: $a,
			lineNumber: 16,
			columnNumber: 7
		}
	}, "Placeholder — Claude will fill this in."), /* @__PURE__ */ e.createElement("button", {
		type: "button",
		onClick: () => t.completeStage("intro"),
		style: {
			padding: "var(--nadi-space-2) var(--nadi-space-4)",
			background: "var(--nadi-accent)",
			color: "var(--nadi-accent-fg)",
			border: "none",
			borderRadius: "var(--nadi-radius)",
			cursor: "pointer"
		},
		__self: this,
		__source: {
			fileName: $a,
			lineNumber: 17,
			columnNumber: 7
		}
	}, "Continue"));
}
function to({ studentName: t, onEvent: n }) {
	return /* @__PURE__ */ e.createElement(he, {
		title: "Direction of acceleration vs direction of velocity",
		onEvent: n,
		__self: this,
		__source: {
			fileName: $a,
			lineNumber: 37,
			columnNumber: 5
		}
	}, /* @__PURE__ */ e.createElement(eo, {
		__self: this,
		__source: {
			fileName: $a,
			lineNumber: 38,
			columnNumber: 7
		}
	}));
}
//#endregion
//#region ../../../../../private/var/folders/_d/9xxv4yg13xz4pvwj4bs4ckqm0000gp/T/nadi-slides-48cb9343-4cfd-4b11-8b2a-9f2d685199fd/Slide_t1-2.jsx
var no = "/private/var/folders/_d/9xxv4yg13xz4pvwj4bs4ckqm0000gp/T/nadi-slides-48cb9343-4cfd-4b11-8b2a-9f2d685199fd/Slide_t1-2.jsx";
function ro() {
	let t = ue();
	return /* @__PURE__ */ e.createElement("div", {
		style: { padding: "var(--nadi-space-8)" },
		__self: this,
		__source: {
			fileName: no,
			lineNumber: 15,
			columnNumber: 5
		}
	}, /* @__PURE__ */ e.createElement("p", {
		__self: this,
		__source: {
			fileName: no,
			lineNumber: 16,
			columnNumber: 7
		}
	}, "Placeholder — Claude will fill this in."), /* @__PURE__ */ e.createElement("button", {
		type: "button",
		onClick: () => t.completeStage("intro"),
		style: {
			padding: "var(--nadi-space-2) var(--nadi-space-4)",
			background: "var(--nadi-accent)",
			color: "var(--nadi-accent-fg)",
			border: "none",
			borderRadius: "var(--nadi-radius)",
			cursor: "pointer"
		},
		__self: this,
		__source: {
			fileName: no,
			lineNumber: 17,
			columnNumber: 7
		}
	}, "Continue"));
}
function io({ studentName: t, onEvent: n }) {
	return /* @__PURE__ */ e.createElement(he, {
		title: "Distance vs displacement in 1D",
		onEvent: n,
		__self: this,
		__source: {
			fileName: no,
			lineNumber: 37,
			columnNumber: 5
		}
	}, /* @__PURE__ */ e.createElement(ro, {
		__self: this,
		__source: {
			fileName: no,
			lineNumber: 38,
			columnNumber: 7
		}
	}));
}
//#endregion
//#region ../../../../../private/var/folders/_d/9xxv4yg13xz4pvwj4bs4ckqm0000gp/T/nadi-slides-48cb9343-4cfd-4b11-8b2a-9f2d685199fd/Slide_t2-4.jsx
var ao = "/private/var/folders/_d/9xxv4yg13xz4pvwj4bs4ckqm0000gp/T/nadi-slides-48cb9343-4cfd-4b11-8b2a-9f2d685199fd/Slide_t2-4.jsx";
function oo() {
	let t = ue();
	return /* @__PURE__ */ e.createElement("div", {
		style: { padding: "var(--nadi-space-8)" },
		__self: this,
		__source: {
			fileName: ao,
			lineNumber: 15,
			columnNumber: 5
		}
	}, /* @__PURE__ */ e.createElement("p", {
		__self: this,
		__source: {
			fileName: ao,
			lineNumber: 16,
			columnNumber: 7
		}
	}, "Placeholder — Claude will fill this in."), /* @__PURE__ */ e.createElement("button", {
		type: "button",
		onClick: () => t.completeStage("intro"),
		style: {
			padding: "var(--nadi-space-2) var(--nadi-space-4)",
			background: "var(--nadi-accent)",
			color: "var(--nadi-accent-fg)",
			border: "none",
			borderRadius: "var(--nadi-radius)",
			cursor: "pointer"
		},
		__self: this,
		__source: {
			fileName: ao,
			lineNumber: 17,
			columnNumber: 7
		}
	}, "Continue"));
}
function so({ studentName: t, onEvent: n }) {
	return /* @__PURE__ */ e.createElement(he, {
		title: "Average vs in-the-moment rate",
		onEvent: n,
		__self: this,
		__source: {
			fileName: ao,
			lineNumber: 37,
			columnNumber: 5
		}
	}, /* @__PURE__ */ e.createElement(oo, {
		__self: this,
		__source: {
			fileName: ao,
			lineNumber: 38,
			columnNumber: 7
		}
	}));
}
//#endregion
//#region ../../../../../private/var/folders/_d/9xxv4yg13xz4pvwj4bs4ckqm0000gp/T/nadi-slides-48cb9343-4cfd-4b11-8b2a-9f2d685199fd/Slide_t3-1.jsx
var co = "/private/var/folders/_d/9xxv4yg13xz4pvwj4bs4ckqm0000gp/T/nadi-slides-48cb9343-4cfd-4b11-8b2a-9f2d685199fd/Slide_t3-1.jsx";
function lo() {
	let t = ue();
	return /* @__PURE__ */ e.createElement("div", {
		style: { padding: "var(--nadi-space-8)" },
		__self: this,
		__source: {
			fileName: co,
			lineNumber: 15,
			columnNumber: 5
		}
	}, /* @__PURE__ */ e.createElement("p", {
		__self: this,
		__source: {
			fileName: co,
			lineNumber: 16,
			columnNumber: 7
		}
	}, "Placeholder — Claude will fill this in."), /* @__PURE__ */ e.createElement("button", {
		type: "button",
		onClick: () => t.completeStage("intro"),
		style: {
			padding: "var(--nadi-space-2) var(--nadi-space-4)",
			background: "var(--nadi-accent)",
			color: "var(--nadi-accent-fg)",
			border: "none",
			borderRadius: "var(--nadi-radius)",
			cursor: "pointer"
		},
		__self: this,
		__source: {
			fileName: co,
			lineNumber: 17,
			columnNumber: 7
		}
	}, "Continue"));
}
function uo({ studentName: t, onEvent: n }) {
	return /* @__PURE__ */ e.createElement(he, {
		title: "Reading any graph as a rate of change",
		onEvent: n,
		__self: this,
		__source: {
			fileName: co,
			lineNumber: 37,
			columnNumber: 5
		}
	}, /* @__PURE__ */ e.createElement(lo, {
		__self: this,
		__source: {
			fileName: co,
			lineNumber: 38,
			columnNumber: 7
		}
	}));
}
//#endregion
//#region ../../../../../private/var/folders/_d/9xxv4yg13xz4pvwj4bs4ckqm0000gp/T/nadi-slides-48cb9343-4cfd-4b11-8b2a-9f2d685199fd/Slide_t3-2.jsx
var fo = "/private/var/folders/_d/9xxv4yg13xz4pvwj4bs4ckqm0000gp/T/nadi-slides-48cb9343-4cfd-4b11-8b2a-9f2d685199fd/Slide_t3-2.jsx";
function po() {
	let t = ue();
	return /* @__PURE__ */ e.createElement("div", {
		style: { padding: "var(--nadi-space-8)" },
		__self: this,
		__source: {
			fileName: fo,
			lineNumber: 15,
			columnNumber: 5
		}
	}, /* @__PURE__ */ e.createElement("p", {
		__self: this,
		__source: {
			fileName: fo,
			lineNumber: 16,
			columnNumber: 7
		}
	}, "Placeholder — Claude will fill this in."), /* @__PURE__ */ e.createElement("button", {
		type: "button",
		onClick: () => t.completeStage("intro"),
		style: {
			padding: "var(--nadi-space-2) var(--nadi-space-4)",
			background: "var(--nadi-accent)",
			color: "var(--nadi-accent-fg)",
			border: "none",
			borderRadius: "var(--nadi-radius)",
			cursor: "pointer"
		},
		__self: this,
		__source: {
			fileName: fo,
			lineNumber: 17,
			columnNumber: 7
		}
	}, "Continue"));
}
function mo({ studentName: t, onEvent: n }) {
	return /* @__PURE__ */ e.createElement(he, {
		title: "Position-time graphs",
		onEvent: n,
		__self: this,
		__source: {
			fileName: fo,
			lineNumber: 37,
			columnNumber: 5
		}
	}, /* @__PURE__ */ e.createElement(po, {
		__self: this,
		__source: {
			fileName: fo,
			lineNumber: 38,
			columnNumber: 7
		}
	}));
}
//#endregion
//#region ../../../../../private/var/folders/_d/9xxv4yg13xz4pvwj4bs4ckqm0000gp/T/nadi-slides-48cb9343-4cfd-4b11-8b2a-9f2d685199fd/Slide_t3-3.jsx
var ho = "/private/var/folders/_d/9xxv4yg13xz4pvwj4bs4ckqm0000gp/T/nadi-slides-48cb9343-4cfd-4b11-8b2a-9f2d685199fd/Slide_t3-3.jsx";
function go() {
	let t = ue();
	return /* @__PURE__ */ e.createElement("div", {
		style: { padding: "var(--nadi-space-8)" },
		__self: this,
		__source: {
			fileName: ho,
			lineNumber: 15,
			columnNumber: 5
		}
	}, /* @__PURE__ */ e.createElement("p", {
		__self: this,
		__source: {
			fileName: ho,
			lineNumber: 16,
			columnNumber: 7
		}
	}, "Placeholder — Claude will fill this in."), /* @__PURE__ */ e.createElement("button", {
		type: "button",
		onClick: () => t.completeStage("intro"),
		style: {
			padding: "var(--nadi-space-2) var(--nadi-space-4)",
			background: "var(--nadi-accent)",
			color: "var(--nadi-accent-fg)",
			border: "none",
			borderRadius: "var(--nadi-radius)",
			cursor: "pointer"
		},
		__self: this,
		__source: {
			fileName: ho,
			lineNumber: 17,
			columnNumber: 7
		}
	}, "Continue"));
}
function _o({ studentName: t, onEvent: n }) {
	return /* @__PURE__ */ e.createElement(he, {
		title: "Velocity-time graphs",
		onEvent: n,
		__self: this,
		__source: {
			fileName: ho,
			lineNumber: 37,
			columnNumber: 5
		}
	}, /* @__PURE__ */ e.createElement(go, {
		__self: this,
		__source: {
			fileName: ho,
			lineNumber: 38,
			columnNumber: 7
		}
	}));
}
//#endregion
//#region ../../../../../private/var/folders/_d/9xxv4yg13xz4pvwj4bs4ckqm0000gp/T/nadi-slides-48cb9343-4cfd-4b11-8b2a-9f2d685199fd/Slide_t3-4.jsx
var vo = "/private/var/folders/_d/9xxv4yg13xz4pvwj4bs4ckqm0000gp/T/nadi-slides-48cb9343-4cfd-4b11-8b2a-9f2d685199fd/Slide_t3-4.jsx";
function yo() {
	let t = ue();
	return /* @__PURE__ */ e.createElement("div", {
		style: { padding: "var(--nadi-space-8)" },
		__self: this,
		__source: {
			fileName: vo,
			lineNumber: 15,
			columnNumber: 5
		}
	}, /* @__PURE__ */ e.createElement("p", {
		__self: this,
		__source: {
			fileName: vo,
			lineNumber: 16,
			columnNumber: 7
		}
	}, "Placeholder — Claude will fill this in."), /* @__PURE__ */ e.createElement("button", {
		type: "button",
		onClick: () => t.completeStage("intro"),
		style: {
			padding: "var(--nadi-space-2) var(--nadi-space-4)",
			background: "var(--nadi-accent)",
			color: "var(--nadi-accent-fg)",
			border: "none",
			borderRadius: "var(--nadi-radius)",
			cursor: "pointer"
		},
		__self: this,
		__source: {
			fileName: vo,
			lineNumber: 17,
			columnNumber: 7
		}
	}, "Continue"));
}
function bo({ studentName: t, onEvent: n }) {
	return /* @__PURE__ */ e.createElement(he, {
		title: "Area as accumulated change",
		onEvent: n,
		__self: this,
		__source: {
			fileName: vo,
			lineNumber: 37,
			columnNumber: 5
		}
	}, /* @__PURE__ */ e.createElement(yo, {
		__self: this,
		__source: {
			fileName: vo,
			lineNumber: 38,
			columnNumber: 7
		}
	}));
}
//#endregion
//#region ../../../../../private/var/folders/_d/9xxv4yg13xz4pvwj4bs4ckqm0000gp/T/nadi-slides-48cb9343-4cfd-4b11-8b2a-9f2d685199fd/Slide_t3-5.jsx
var xo = "/private/var/folders/_d/9xxv4yg13xz4pvwj4bs4ckqm0000gp/T/nadi-slides-48cb9343-4cfd-4b11-8b2a-9f2d685199fd/Slide_t3-5.jsx";
function So() {
	let t = ue();
	return /* @__PURE__ */ e.createElement("div", {
		style: { padding: "var(--nadi-space-8)" },
		__self: this,
		__source: {
			fileName: xo,
			lineNumber: 15,
			columnNumber: 5
		}
	}, /* @__PURE__ */ e.createElement("p", {
		__self: this,
		__source: {
			fileName: xo,
			lineNumber: 16,
			columnNumber: 7
		}
	}, "Placeholder — Claude will fill this in."), /* @__PURE__ */ e.createElement("button", {
		type: "button",
		onClick: () => t.completeStage("intro"),
		style: {
			padding: "var(--nadi-space-2) var(--nadi-space-4)",
			background: "var(--nadi-accent)",
			color: "var(--nadi-accent-fg)",
			border: "none",
			borderRadius: "var(--nadi-radius)",
			cursor: "pointer"
		},
		__self: this,
		__source: {
			fileName: xo,
			lineNumber: 17,
			columnNumber: 7
		}
	}, "Continue"));
}
function Co({ studentName: t, onEvent: n }) {
	return /* @__PURE__ */ e.createElement(he, {
		title: "Translating across representations of one motion",
		onEvent: n,
		__self: this,
		__source: {
			fileName: xo,
			lineNumber: 37,
			columnNumber: 5
		}
	}, /* @__PURE__ */ e.createElement(So, {
		__self: this,
		__source: {
			fileName: xo,
			lineNumber: 38,
			columnNumber: 7
		}
	}));
}
//#endregion
//#region ../../../../../private/var/folders/_d/9xxv4yg13xz4pvwj4bs4ckqm0000gp/T/nadi-slides-48cb9343-4cfd-4b11-8b2a-9f2d685199fd/Slide_t4-1.jsx
var wo = "/private/var/folders/_d/9xxv4yg13xz4pvwj4bs4ckqm0000gp/T/nadi-slides-48cb9343-4cfd-4b11-8b2a-9f2d685199fd/Slide_t4-1.jsx";
function To() {
	let t = ue();
	return /* @__PURE__ */ e.createElement("div", {
		style: { padding: "var(--nadi-space-8)" },
		__self: this,
		__source: {
			fileName: wo,
			lineNumber: 15,
			columnNumber: 5
		}
	}, /* @__PURE__ */ e.createElement("p", {
		__self: this,
		__source: {
			fileName: wo,
			lineNumber: 16,
			columnNumber: 7
		}
	}, "Placeholder — Claude will fill this in."), /* @__PURE__ */ e.createElement("button", {
		type: "button",
		onClick: () => t.completeStage("intro"),
		style: {
			padding: "var(--nadi-space-2) var(--nadi-space-4)",
			background: "var(--nadi-accent)",
			color: "var(--nadi-accent-fg)",
			border: "none",
			borderRadius: "var(--nadi-radius)",
			cursor: "pointer"
		},
		__self: this,
		__source: {
			fileName: wo,
			lineNumber: 17,
			columnNumber: 7
		}
	}, "Continue"));
}
function Eo({ studentName: t, onEvent: n }) {
	return /* @__PURE__ */ e.createElement(he, {
		title: "Sub-topic structure pending discussion",
		onEvent: n,
		__self: this,
		__source: {
			fileName: wo,
			lineNumber: 37,
			columnNumber: 5
		}
	}, /* @__PURE__ */ e.createElement(To, {
		__self: this,
		__source: {
			fileName: wo,
			lineNumber: 38,
			columnNumber: 7
		}
	}));
}
//#endregion
//#region ../../../../../private/var/folders/_d/9xxv4yg13xz4pvwj4bs4ckqm0000gp/T/nadi-slides-48cb9343-4cfd-4b11-8b2a-9f2d685199fd/Slide_t5-1.jsx
var Do = "/private/var/folders/_d/9xxv4yg13xz4pvwj4bs4ckqm0000gp/T/nadi-slides-48cb9343-4cfd-4b11-8b2a-9f2d685199fd/Slide_t5-1.jsx";
function Oo() {
	let t = ue();
	return /* @__PURE__ */ e.createElement("div", {
		style: { padding: "var(--nadi-space-8)" },
		__self: this,
		__source: {
			fileName: Do,
			lineNumber: 15,
			columnNumber: 5
		}
	}, /* @__PURE__ */ e.createElement("p", {
		__self: this,
		__source: {
			fileName: Do,
			lineNumber: 16,
			columnNumber: 7
		}
	}, "Placeholder — Claude will fill this in."), /* @__PURE__ */ e.createElement("button", {
		type: "button",
		onClick: () => t.completeStage("intro"),
		style: {
			padding: "var(--nadi-space-2) var(--nadi-space-4)",
			background: "var(--nadi-accent)",
			color: "var(--nadi-accent-fg)",
			border: "none",
			borderRadius: "var(--nadi-radius)",
			cursor: "pointer"
		},
		__self: this,
		__source: {
			fileName: Do,
			lineNumber: 17,
			columnNumber: 7
		}
	}, "Continue"));
}
function ko({ studentName: t, onEvent: n }) {
	return /* @__PURE__ */ e.createElement(he, {
		title: "Sub-topic structure pending discussion",
		onEvent: n,
		__self: this,
		__source: {
			fileName: Do,
			lineNumber: 37,
			columnNumber: 5
		}
	}, /* @__PURE__ */ e.createElement(Oo, {
		__self: this,
		__source: {
			fileName: Do,
			lineNumber: 38,
			columnNumber: 7
		}
	}));
}
//#endregion
//#region ../../../../../private/var/folders/_d/9xxv4yg13xz4pvwj4bs4ckqm0000gp/T/nadi-slides-48cb9343-4cfd-4b11-8b2a-9f2d685199fd/Slide_t1-1.jsx
var J = "/private/var/folders/_d/9xxv4yg13xz4pvwj4bs4ckqm0000gp/T/nadi-slides-48cb9343-4cfd-4b11-8b2a-9f2d685199fd/Slide_t1-1.jsx";
function Ao({ studentName: t }) {
	let n = (e) => 50 + e * 65, [r, i] = ae(4), [a, o] = ae(!1), [s, c] = ae(0), l = ie(!1), u = ie(null), d = s !== 0, f = a && d, p = (e) => s * (e - r), m = p(6), h = (e) => (e > 0 ? "+" : "") + e, g = (e) => {
		let t = u.current;
		if (!t) return r;
		let n = t.getBoundingClientRect();
		if (!n.width) return r;
		let i = (e - n.left) * (600 / n.width), a = Math.round((i - 50) / 65);
		return Math.max(0, Math.min(8, a));
	}, _ = (e) => {
		e.preventDefault(), l.current = !0, o(!0);
		try {
			e.currentTarget.setPointerCapture(e.pointerId);
		} catch {}
	}, v = (e) => {
		l.current && i(g(e.clientX));
	}, y = () => {
		l.current = !1;
	}, b = () => {
		i(4), o(!1), c(0), l.current = !1;
	}, x = 300 + s * 60;
	return /* @__PURE__ */ e.createElement(e.Fragment, null, /* @__PURE__ */ e.createElement("div", {
		className: "slide-title",
		style: Y.title,
		__self: this,
		__source: {
			fileName: J,
			lineNumber: 49,
			columnNumber: 7
		}
	}, "What turns a spot into a position?"), /* @__PURE__ */ e.createElement("div", {
		className: "slide-left",
		style: Y.left,
		__self: this,
		__source: {
			fileName: J,
			lineNumber: 51,
			columnNumber: 7
		}
	}, /* @__PURE__ */ e.createElement("div", {
		style: Y.cardHook,
		__self: this,
		__source: {
			fileName: J,
			lineNumber: 52,
			columnNumber: 9
		}
	}, /* @__PURE__ */ e.createElement("div", {
		style: Y.row,
		__self: this,
		__source: {
			fileName: J,
			lineNumber: 53,
			columnNumber: 11
		}
	}, /* @__PURE__ */ e.createElement("span", {
		style: Y.badge,
		__self: this,
		__source: {
			fileName: J,
			lineNumber: 53,
			columnNumber: 30
		}
	}, "💭"), /* @__PURE__ */ e.createElement("span", {
		style: Y.hHook,
		__self: this,
		__source: {
			fileName: J,
			lineNumber: 53,
			columnNumber: 61
		}
	}, "A text that didn't help")), /* @__PURE__ */ e.createElement("p", {
		style: Y.hookText,
		__self: this,
		__source: {
			fileName: J,
			lineNumber: 54,
			columnNumber: 11
		}
	}, t, ", a friend texts: ", /* @__PURE__ */ e.createElement("b", {
		__self: this,
		__source: {
			fileName: J,
			lineNumber: 54,
			columnNumber: 64
		}
	}, "\"I'm at 7 — come meet me!\""), " You ride out to the 7th lamppost… nobody there. The number ", /* @__PURE__ */ e.createElement("i", {
		__self: this,
		__source: {
			fileName: J,
			lineNumber: 54,
			columnNumber: 157
		}
	}, "felt"), " like an answer — but \"7\" on its own can't point to a single spot.")), /* @__PURE__ */ e.createElement("div", {
		style: Y.card,
		__self: this,
		__source: {
			fileName: J,
			lineNumber: 57,
			columnNumber: 9
		}
	}, /* @__PURE__ */ e.createElement("div", {
		style: Y.hCard,
		__self: this,
		__source: {
			fileName: J,
			lineNumber: 58,
			columnNumber: 11
		}
	}, "So what's missing?"), /* @__PURE__ */ e.createElement("p", {
		style: Y.body,
		__self: this,
		__source: {
			fileName: J,
			lineNumber: 59,
			columnNumber: 11
		}
	}, "To turn a real spot on the road into a number, you and your friend must agree on ", /* @__PURE__ */ e.createElement("b", {
		__self: this,
		__source: {
			fileName: J,
			lineNumber: 59,
			columnNumber: 110
		}
	}, "two things"), " first. Find them in the sandbox → set both, and the cyclist finally gets a number.")), !f && /* @__PURE__ */ e.createElement("div", {
		style: Y.cardLock,
		__self: this,
		__source: {
			fileName: J,
			lineNumber: 63,
			columnNumber: 11
		}
	}, /* @__PURE__ */ e.createElement("div", {
		style: Y.row,
		__self: this,
		__source: {
			fileName: J,
			lineNumber: 64,
			columnNumber: 13
		}
	}, /* @__PURE__ */ e.createElement("span", {
		style: Y.badge,
		__self: this,
		__source: {
			fileName: J,
			lineNumber: 64,
			columnNumber: 32
		}
	}, "🔒"), /* @__PURE__ */ e.createElement("span", {
		style: Y.hLock,
		__self: this,
		__source: {
			fileName: J,
			lineNumber: 64,
			columnNumber: 63
		}
	}, "The two ingredients")), /* @__PURE__ */ e.createElement("p", {
		style: Y.bodyMuted,
		__self: this,
		__source: {
			fileName: J,
			lineNumber: 65,
			columnNumber: 13
		}
	}, "Set a zero ", /* @__PURE__ */ e.createElement("i", {
		__self: this,
		__source: {
			fileName: J,
			lineNumber: 65,
			columnNumber: 47
		}
	}, "and"), " a forward direction in the sandbox to unlock this →")), f && /* @__PURE__ */ e.createElement(e.Fragment, null, /* @__PURE__ */ e.createElement("div", {
		style: Y.cardInsight,
		__self: this,
		__source: {
			fileName: J,
			lineNumber: 71,
			columnNumber: 13
		}
	}, /* @__PURE__ */ e.createElement("div", {
		style: Y.row,
		__self: this,
		__source: {
			fileName: J,
			lineNumber: 72,
			columnNumber: 15
		}
	}, /* @__PURE__ */ e.createElement("span", {
		style: Y.badge,
		__self: this,
		__source: {
			fileName: J,
			lineNumber: 72,
			columnNumber: 34
		}
	}, "💡"), /* @__PURE__ */ e.createElement("span", {
		style: Y.hInsight,
		__self: this,
		__source: {
			fileName: J,
			lineNumber: 72,
			columnNumber: 65
		}
	}, "The two ingredients")), /* @__PURE__ */ e.createElement("p", {
		style: Y.body,
		__self: this,
		__source: {
			fileName: J,
			lineNumber: 73,
			columnNumber: 15
		}
	}, /* @__PURE__ */ e.createElement("b", {
		__self: this,
		__source: {
			fileName: J,
			lineNumber: 73,
			columnNumber: 33
		}
	}, "1. A reference point"), " — where your ", /* @__PURE__ */ e.createElement("b", {
		__self: this,
		__source: {
			fileName: J,
			lineNumber: 73,
			columnNumber: 74
		}
	}, "0"), " sits (the origin).", /* @__PURE__ */ e.createElement("br", {
		__self: this,
		__source: {
			fileName: J,
			lineNumber: 73,
			columnNumber: 101
		}
	}), /* @__PURE__ */ e.createElement("b", {
		__self: this,
		__source: {
			fileName: J,
			lineNumber: 73,
			columnNumber: 106
		}
	}, "2. A positive direction"), " — which way along the line counts as ", /* @__PURE__ */ e.createElement("b", {
		__self: this,
		__source: {
			fileName: J,
			lineNumber: 73,
			columnNumber: 174
		}
	}, "+"), "."), /* @__PURE__ */ e.createElement("hr", {
		style: Y.hr,
		__self: this,
		__source: {
			fileName: J,
			lineNumber: 74,
			columnNumber: 15
		}
	}), /* @__PURE__ */ e.createElement("p", {
		style: Y.body,
		__self: this,
		__source: {
			fileName: J,
			lineNumber: 75,
			columnNumber: 15
		}
	}, "Fix both and every spot becomes a ", /* @__PURE__ */ e.createElement("b", {
		__self: this,
		__source: {
			fileName: J,
			lineNumber: 75,
			columnNumber: 67
		}
	}, "signed number"), ": position = how many steps from the origin, with a sign for the side. It ", /* @__PURE__ */ e.createElement("i", {
		__self: this,
		__source: {
			fileName: J,
			lineNumber: 75,
			columnNumber: 161
		}
	}, "describes"), " the spot — it is not the bike itself.")), /* @__PURE__ */ e.createElement("div", {
		style: Y.cardPitfall,
		__self: this,
		__source: {
			fileName: J,
			lineNumber: 77,
			columnNumber: 13
		}
	}, /* @__PURE__ */ e.createElement("div", {
		style: Y.row,
		__self: this,
		__source: {
			fileName: J,
			lineNumber: 78,
			columnNumber: 15
		}
	}, /* @__PURE__ */ e.createElement("span", {
		style: Y.badge,
		__self: this,
		__source: {
			fileName: J,
			lineNumber: 78,
			columnNumber: 34
		}
	}, "⚠️"), /* @__PURE__ */ e.createElement("span", {
		style: Y.hPitfall,
		__self: this,
		__source: {
			fileName: J,
			lineNumber: 78,
			columnNumber: 65
		}
	}, "Exam trap")), /* @__PURE__ */ e.createElement("p", {
		style: Y.body,
		__self: this,
		__source: {
			fileName: J,
			lineNumber: 79,
			columnNumber: 15
		}
	}, "\"At marker 7\" or \"+5\" means nothing until you've stated ", /* @__PURE__ */ e.createElement("b", {
		__self: this,
		__source: {
			fileName: J,
			lineNumber: 79,
			columnNumber: 89
		}
	}, "where 0 is"), " and ", /* @__PURE__ */ e.createElement("b", {
		__self: this,
		__source: {
			fileName: J,
			lineNumber: 79,
			columnNumber: 111
		}
	}, "which way is +"), ". Same bike, different choices → different number. The physics didn't change, only its description.")))), /* @__PURE__ */ e.createElement("div", {
		className: "slide-right",
		style: Y.right,
		__self: this,
		__source: {
			fileName: J,
			lineNumber: 85,
			columnNumber: 7
		}
	}, /* @__PURE__ */ e.createElement("div", {
		style: Y.panelTitle,
		__self: this,
		__source: {
			fileName: J,
			lineNumber: 86,
			columnNumber: 9
		}
	}, "The road — drag the flag, pick a direction"), /* @__PURE__ */ e.createElement("div", {
		style: Y.stage,
		__self: this,
		__source: {
			fileName: J,
			lineNumber: 88,
			columnNumber: 9
		}
	}, /* @__PURE__ */ e.createElement("svg", {
		ref: u,
		viewBox: "0 0 600 200",
		style: Y.svg,
		onPointerMove: v,
		onPointerUp: y,
		onPointerLeave: y,
		__self: this,
		__source: {
			fileName: J,
			lineNumber: 89,
			columnNumber: 11
		}
	}, /* @__PURE__ */ e.createElement("line", {
		x1: 20,
		y1: 130,
		x2: 580,
		y2: 130,
		stroke: "var(--border-light)",
		strokeWidth: 6,
		strokeLinecap: "round",
		__self: this,
		__source: {
			fileName: J,
			lineNumber: 92,
			columnNumber: 13
		}
	}), Array.from({ length: 9 }).map((t, a) => /* @__PURE__ */ e.createElement("g", {
		key: a,
		onClick: () => {
			i(a), o(!0);
		},
		style: { cursor: "pointer" },
		__self: this,
		__source: {
			fileName: J,
			lineNumber: 96,
			columnNumber: 15
		}
	}, /* @__PURE__ */ e.createElement("line", {
		x1: n(a),
		y1: 118,
		x2: n(a),
		y2: 142,
		stroke: "var(--border)",
		strokeWidth: 3,
		__self: this,
		__source: {
			fileName: J,
			lineNumber: 97,
			columnNumber: 17
		}
	}), /* @__PURE__ */ e.createElement("circle", {
		cx: n(a),
		cy: 114,
		r: 4,
		fill: "var(--text-muted)",
		__self: this,
		__source: {
			fileName: J,
			lineNumber: 98,
			columnNumber: 17
		}
	}), f && /* @__PURE__ */ e.createElement("text", {
		x: n(a),
		y: 164,
		textAnchor: "middle",
		fontSize: 13,
		fontWeight: 700,
		fill: a === r ? "var(--primary)" : "var(--text-secondary)",
		__self: this,
		__source: {
			fileName: J,
			lineNumber: 100,
			columnNumber: 19
		}
	}, p(a)))), d && /* @__PURE__ */ e.createElement("g", {
		__self: this,
		__source: {
			fileName: J,
			lineNumber: 108,
			columnNumber: 15
		}
	}, /* @__PURE__ */ e.createElement("line", {
		x1: 300,
		y1: 36,
		x2: x,
		y2: 36,
		stroke: "var(--primary)",
		strokeWidth: 3,
		__self: this,
		__source: {
			fileName: J,
			lineNumber: 109,
			columnNumber: 17
		}
	}), /* @__PURE__ */ e.createElement("polygon", {
		points: `${x},36 ${x - s * 9},31 ${x - s * 9},41`,
		fill: "var(--primary)",
		__self: this,
		__source: {
			fileName: J,
			lineNumber: 110,
			columnNumber: 17
		}
	}), /* @__PURE__ */ e.createElement("text", {
		x: 300,
		y: 24,
		textAnchor: "middle",
		fontSize: 12,
		fontWeight: 700,
		fill: "var(--primary)",
		__self: this,
		__source: {
			fileName: J,
			lineNumber: 111,
			columnNumber: 17
		}
	}, "+ forward")), /* @__PURE__ */ e.createElement("g", {
		__self: this,
		__source: {
			fileName: J,
			lineNumber: 116,
			columnNumber: 13
		}
	}, /* @__PURE__ */ e.createElement("rect", {
		x: n(6) - 28,
		y: 50,
		width: 56,
		height: 28,
		rx: 8,
		fill: f ? "var(--primary)" : "var(--border)",
		__self: this,
		__source: {
			fileName: J,
			lineNumber: 117,
			columnNumber: 15
		}
	}), /* @__PURE__ */ e.createElement("text", {
		x: n(6),
		y: 69,
		textAnchor: "middle",
		fontSize: 16,
		fontWeight: 700,
		fill: f ? "var(--primary-text)" : "var(--text-secondary)",
		__self: this,
		__source: {
			fileName: J,
			lineNumber: 119,
			columnNumber: 15
		}
	}, f ? h(m) : "?")), /* @__PURE__ */ e.createElement("text", {
		x: n(6),
		y: 106,
		textAnchor: "middle",
		fontSize: 30,
		__self: this,
		__source: {
			fileName: J,
			lineNumber: 124,
			columnNumber: 13
		}
	}, "🚲"), /* @__PURE__ */ e.createElement("g", {
		transform: `translate(${n(r)},0)`,
		onPointerDown: _,
		style: {
			cursor: "grab",
			touchAction: "none"
		},
		__self: this,
		__source: {
			fileName: J,
			lineNumber: 127,
			columnNumber: 13
		}
	}, /* @__PURE__ */ e.createElement("line", {
		x1: 0,
		y1: 92,
		x2: 0,
		y2: 130,
		stroke: "var(--accent)",
		strokeWidth: 2,
		__self: this,
		__source: {
			fileName: J,
			lineNumber: 129,
			columnNumber: 15
		}
	}), /* @__PURE__ */ e.createElement("image", {
		href: "http://localhost:3001/files/slide-assets/43701f3b-4137-4172-b4e9-54e872c8f550/5e6b47f5-0405-4529-b596-c4de4a46d9a8.png",
		x: -15,
		y: 62,
		width: 30,
		height: 30,
		preserveAspectRatio: "xMidYMid meet",
		style: { pointerEvents: "none" },
		__self: this,
		__source: {
			fileName: J,
			lineNumber: 130,
			columnNumber: 15
		}
	}), /* @__PURE__ */ e.createElement("text", {
		x: 0,
		y: 186,
		textAnchor: "middle",
		fontSize: 12,
		fontWeight: 700,
		fill: a ? "var(--accent-text)" : "var(--text-muted)",
		__self: this,
		__source: {
			fileName: J,
			lineNumber: 132,
			columnNumber: 15
		}
	}, a ? "0 (origin)" : "drag me")))), /* @__PURE__ */ e.createElement("div", {
		style: Y.readoutRow,
		__self: this,
		__source: {
			fileName: J,
			lineNumber: 138,
			columnNumber: 9
		}
	}, /* @__PURE__ */ e.createElement("div", {
		style: {
			...Y.bigNum,
			color: f ? "var(--primary)" : "var(--text-muted)"
		},
		__self: this,
		__source: {
			fileName: J,
			lineNumber: 139,
			columnNumber: 11
		}
	}, f ? h(m) : "?"), /* @__PURE__ */ e.createElement("div", {
		style: Y.readoutText,
		__self: this,
		__source: {
			fileName: J,
			lineNumber: 140,
			columnNumber: 11
		}
	}, f ? `The cyclist is at position ${h(m)} — but the 🚲 never moved.` : "The road won't hand out a number yet. Pick a zero and a forward direction.")), /* @__PURE__ */ e.createElement("div", {
		style: Y.controls,
		__self: this,
		__source: {
			fileName: J,
			lineNumber: 145,
			columnNumber: 9
		}
	}, /* @__PURE__ */ e.createElement("button", {
		style: s === -1 ? Y.dirBtnActive : Y.dirBtn,
		onClick: () => c(-1),
		__self: this,
		__source: {
			fileName: J,
			lineNumber: 146,
			columnNumber: 11
		}
	}, "⬅ + this way"), /* @__PURE__ */ e.createElement("button", {
		style: s === 1 ? Y.dirBtnActive : Y.dirBtn,
		onClick: () => c(1),
		__self: this,
		__source: {
			fileName: J,
			lineNumber: 147,
			columnNumber: 11
		}
	}, "+ this way ➡"), /* @__PURE__ */ e.createElement("button", {
		style: Y.resetBtn,
		onClick: b,
		__self: this,
		__source: {
			fileName: J,
			lineNumber: 148,
			columnNumber: 11
		}
	}, "↺ Reset")), /* @__PURE__ */ e.createElement("div", {
		style: Y.steps,
		__self: this,
		__source: {
			fileName: J,
			lineNumber: 151,
			columnNumber: 9
		}
	}, /* @__PURE__ */ e.createElement("div", {
		style: Y.step,
		__self: this,
		__source: {
			fileName: J,
			lineNumber: 152,
			columnNumber: 11
		}
	}, /* @__PURE__ */ e.createElement("span", {
		style: Y.stepIcon,
		__self: this,
		__source: {
			fileName: J,
			lineNumber: 152,
			columnNumber: 31
		}
	}, a ? "✅" : "1️⃣"), " Drag the 🚩 onto a lamppost — that's your ", /* @__PURE__ */ e.createElement("b", {
		__self: this,
		__source: {
			fileName: J,
			lineNumber: 152,
			columnNumber: 131
		}
	}, "zero")), /* @__PURE__ */ e.createElement("div", {
		style: Y.step,
		__self: this,
		__source: {
			fileName: J,
			lineNumber: 153,
			columnNumber: 11
		}
	}, /* @__PURE__ */ e.createElement("span", {
		style: Y.stepIcon,
		__self: this,
		__source: {
			fileName: J,
			lineNumber: 153,
			columnNumber: 31
		}
	}, d ? "✅" : "2️⃣"), " Tap which way counts as ", /* @__PURE__ */ e.createElement("b", {
		__self: this,
		__source: {
			fileName: J,
			lineNumber: 153,
			columnNumber: 110
		}
	}, "+")), f && /* @__PURE__ */ e.createElement("div", {
		style: Y.tryIt,
		__self: this,
		__source: {
			fileName: J,
			lineNumber: 154,
			columnNumber: 24
		}
	}, "Now move the 🚩 or flip the arrow — watch every number renumber while the bike sits still."))));
}
var jo = {
	background: "var(--surface-raised)",
	border: "1px solid var(--border-light)",
	borderRadius: 10,
	padding: "14px 18px",
	boxSizing: "border-box"
}, Y = {
	title: {
		fontSize: 22,
		fontWeight: 700,
		color: "var(--text-primary)"
	},
	left: {
		display: "flex",
		flexDirection: "column",
		gap: 12,
		minWidth: 0
	},
	right: {
		display: "flex",
		flexDirection: "column",
		gap: 14,
		minWidth: 0
	},
	row: {
		display: "flex",
		alignItems: "center",
		gap: 8,
		marginBottom: 8
	},
	badge: {
		display: "inline-flex",
		alignItems: "center",
		justifyContent: "center",
		width: 24,
		height: 24,
		borderRadius: 6,
		fontSize: 14,
		background: "var(--surface)",
		flexShrink: 0
	},
	card: { ...jo },
	cardHook: {
		...jo,
		background: "var(--hook-soft)",
		borderLeft: "2px solid var(--hook)"
	},
	cardLock: {
		...jo,
		background: "var(--surface)",
		borderStyle: "dashed"
	},
	cardInsight: {
		...jo,
		background: "var(--primary-softer)",
		borderColor: "var(--primary-soft)",
		borderLeft: "2px solid var(--primary)"
	},
	cardPitfall: {
		...jo,
		background: "var(--accent-soft)",
		borderLeft: "2px solid var(--accent)"
	},
	hHook: {
		fontSize: 14,
		fontWeight: 700,
		color: "var(--hook-text)"
	},
	hCard: {
		fontSize: 14,
		fontWeight: 700,
		color: "var(--primary)",
		marginBottom: 8
	},
	hLock: {
		fontSize: 14,
		fontWeight: 700,
		color: "var(--text-muted)"
	},
	hInsight: {
		fontSize: 14,
		fontWeight: 700,
		color: "var(--primary)"
	},
	hPitfall: {
		fontSize: 14,
		fontWeight: 700,
		color: "var(--accent)"
	},
	hookText: {
		fontSize: 15,
		lineHeight: 1.6,
		color: "var(--text-primary)",
		fontStyle: "italic",
		margin: 0
	},
	body: {
		fontSize: 15,
		lineHeight: 1.6,
		color: "var(--text-primary)",
		margin: 0
	},
	bodyMuted: {
		fontSize: 14,
		lineHeight: 1.6,
		color: "var(--text-muted)",
		margin: 0,
		fontStyle: "italic"
	},
	hr: {
		border: "none",
		borderTop: "1px solid var(--border-light)",
		margin: "10px 0"
	},
	panelTitle: {
		fontSize: 16,
		fontWeight: 700,
		color: "var(--text-primary)"
	},
	stage: {
		background: "var(--surface)",
		border: "1px solid var(--border-light)",
		borderRadius: 10,
		padding: 10,
		boxSizing: "border-box"
	},
	svg: {
		width: "100%",
		height: "auto",
		display: "block",
		maxWidth: "100%",
		touchAction: "none"
	},
	readoutRow: {
		display: "flex",
		alignItems: "center",
		gap: 14,
		minWidth: 0
	},
	bigNum: {
		fontSize: 40,
		fontWeight: 800,
		fontFamily: "monospace",
		minWidth: 60,
		textAlign: "center",
		flexShrink: 0
	},
	readoutText: {
		fontSize: 14,
		lineHeight: 1.5,
		color: "var(--text-secondary)",
		minWidth: 0
	},
	controls: {
		display: "flex",
		gap: 8,
		flexWrap: "wrap"
	},
	dirBtn: {
		flex: "1 1 30%",
		minWidth: 0,
		padding: "10px 8px",
		borderRadius: 8,
		border: "1px solid var(--border)",
		background: "var(--surface-raised)",
		color: "var(--text-secondary)",
		fontWeight: 700,
		fontSize: 13,
		cursor: "pointer",
		fontFamily: "inherit"
	},
	dirBtnActive: {
		flex: "1 1 30%",
		minWidth: 0,
		padding: "10px 8px",
		borderRadius: 8,
		border: "1px solid var(--primary)",
		background: "var(--primary)",
		color: "var(--primary-text)",
		fontWeight: 700,
		fontSize: 13,
		cursor: "pointer",
		fontFamily: "inherit"
	},
	resetBtn: {
		flex: "1 1 30%",
		minWidth: 0,
		padding: "10px 8px",
		borderRadius: 8,
		border: "1px solid var(--border)",
		background: "var(--surface)",
		color: "var(--text-muted)",
		fontWeight: 700,
		fontSize: 13,
		cursor: "pointer",
		fontFamily: "inherit"
	},
	steps: {
		display: "flex",
		flexDirection: "column",
		gap: 8,
		background: "var(--surface)",
		border: "1px solid var(--border-light)",
		borderRadius: 10,
		padding: "12px 14px",
		boxSizing: "border-box"
	},
	step: {
		fontSize: 14,
		lineHeight: 1.5,
		color: "var(--text-primary)",
		display: "flex",
		gap: 8,
		alignItems: "flex-start"
	},
	stepIcon: { flexShrink: 0 },
	tryIt: {
		fontSize: 13,
		lineHeight: 1.5,
		color: "var(--primary)",
		fontWeight: 600,
		marginTop: 2
	}
}, X = "/private/var/folders/_d/9xxv4yg13xz4pvwj4bs4ckqm0000gp/T/nadi-slides-48cb9343-4cfd-4b11-8b2a-9f2d685199fd/Slide_t2-1.jsx";
function Mo({ studentName: t }) {
	let [n, r] = ae(1), [i, a] = ae(0), o = ie(0), s = ie(0), c = ie(0), l = ie(null), [u, d] = ae({
		pos: 0,
		vel: 0
	});
	b(() => {
		let e = l.current;
		if (!e) return;
		let t = e.getContext("2d"), r = !0;
		function u() {
			let n = e.getBoundingClientRect(), r = window.devicePixelRatio || 1;
			e.width = n.width * r, e.height = n.height * r, t.setTransform(r, 0, 0, r, 0, 0);
		}
		u();
		let f = new ResizeObserver(u);
		f.observe(e);
		let p = null;
		function m(l) {
			if (!r) return;
			let u = e.clientWidth, f = e.clientHeight;
			p ??= l;
			let h = Math.min(.05, (l - p) / 1e3);
			p = l;
			let g = (u - 80) / 120;
			i === 1 ? (s.current = 12, o.current += 12 * h, o.current >= 120 && (o.current = 120, a(2))) : i === 2 && (s.current = -12, o.current -= 12 * h, o.current <= 0 && (o.current = 0, a(0), s.current = 0)), t.clearRect(0, 0, u, f);
			let _ = f * .62;
			t.strokeStyle = "#94a3b8", t.lineWidth = 2, t.beginPath(), t.moveTo(40, _), t.lineTo(u - 28, _), t.stroke(), t.strokeStyle = "#0ea5a4", t.fillStyle = "#0ea5a4", t.lineWidth = 2;
			let v = f * .22;
			n === 1 ? (t.beginPath(), t.moveTo(u * .5 - 50, v), t.lineTo(u * .5 + 50, v), t.stroke(), t.beginPath(), t.moveTo(u * .5 + 50, v), t.lineTo(u * .5 + 40, v - 5), t.lineTo(u * .5 + 40, v + 5), t.fill()) : (t.beginPath(), t.moveTo(u * .5 + 50, v), t.lineTo(u * .5 - 50, v), t.stroke(), t.beginPath(), t.moveTo(u * .5 - 50, v), t.lineTo(u * .5 - 40, v - 5), t.lineTo(u * .5 - 40, v + 5), t.fill()), t.fillStyle = "#0ea5a4", t.font = "600 12px Outfit, sans-serif", t.textAlign = "center", t.fillText("+ direction", u * .5, v - 12), t.fillStyle = "#64748b", t.font = "11px Outfit, sans-serif";
			for (let e = 0; e <= 120; e += 30) {
				let r = 40 + e * g;
				t.strokeStyle = "#cbd5e1", t.beginPath(), t.moveTo(r, _ - 5), t.lineTo(r, _ + 5), t.stroke();
				let i = n === 1 ? e : 120 - e;
				t.fillText(String(i), r, _ + 20);
			}
			let y = 40 + o.current * g;
			if (t.fillStyle = "#2563eb", t.beginPath(), t.arc(y, _ - 14, 9, 0, Math.PI * 2), t.fill(), s.current !== 0) {
				let e = s.current > 0 ? 1 : -1;
				t.strokeStyle = "#2563eb", t.fillStyle = "#2563eb", t.lineWidth = 3, t.beginPath(), t.moveTo(y, _ - 14), t.lineTo(y + e * 26, _ - 14), t.stroke(), t.beginPath(), t.moveTo(y + e * 26, _ - 14), t.lineTo(y + e * 18, _ - 18), t.lineTo(y + e * 18, _ - 10), t.fill();
			}
			let b = s.current * n;
			d({
				pos: Math.round(o.current),
				vel: Math.round(b)
			}), c.current = requestAnimationFrame(m);
		}
		return c.current = requestAnimationFrame(m), () => {
			r = !1, cancelAnimationFrame(c.current), f.disconnect();
		};
	}, [i, n]);
	let f = () => {
		i === 0 && (o.current = 0, a(1));
	}, p = () => r((e) => -e);
	return /* @__PURE__ */ e.createElement(e.Fragment, null, /* @__PURE__ */ e.createElement("div", {
		className: "slide-title",
		style: Z.title,
		__self: this,
		__source: {
			fileName: X,
			lineNumber: 122,
			columnNumber: 7
		}
	}, "Speed and Velocity — Rate, With and Without Direction"), /* @__PURE__ */ e.createElement("div", {
		className: "slide-left",
		style: Z.left,
		__self: this,
		__source: {
			fileName: X,
			lineNumber: 123,
			columnNumber: 7
		}
	}, /* @__PURE__ */ e.createElement("div", {
		style: Z.cardHook,
		__self: this,
		__source: {
			fileName: X,
			lineNumber: 124,
			columnNumber: 9
		}
	}, /* @__PURE__ */ e.createElement("div", {
		style: Z.row,
		__self: this,
		__source: {
			fileName: X,
			lineNumber: 125,
			columnNumber: 11
		}
	}, /* @__PURE__ */ e.createElement("span", {
		style: Z.badge,
		__self: this,
		__source: {
			fileName: X,
			lineNumber: 125,
			columnNumber: 30
		}
	}, "💭"), /* @__PURE__ */ e.createElement("span", {
		style: Z.hHook,
		__self: this,
		__source: {
			fileName: X,
			lineNumber: 125,
			columnNumber: 61
		}
	}, "Think about this")), /* @__PURE__ */ e.createElement("p", {
		style: Z.hookText,
		__self: this,
		__source: {
			fileName: X,
			lineNumber: 126,
			columnNumber: 11
		}
	}, t, ", two cars both read \"12 m/s\" on the dash — yet one is catching the other and one is pulling away. The number is identical. What's missing?")), /* @__PURE__ */ e.createElement("div", {
		style: Z.card,
		__self: this,
		__source: {
			fileName: X,
			lineNumber: 128,
			columnNumber: 9
		}
	}, /* @__PURE__ */ e.createElement("div", {
		style: Z.hCard,
		__self: this,
		__source: {
			fileName: X,
			lineNumber: 129,
			columnNumber: 11
		}
	}, "Same split as before, dressed in rate"), /* @__PURE__ */ e.createElement("p", {
		style: Z.body,
		__self: this,
		__source: {
			fileName: X,
			lineNumber: 130,
			columnNumber: 11
		}
	}, /* @__PURE__ */ e.createElement("b", {
		__self: this,
		__source: {
			fileName: X,
			lineNumber: 130,
			columnNumber: 29
		}
	}, "Speed"), " = distance ÷ time. Always positive — it never asks which way.", /* @__PURE__ */ e.createElement("br", {
		__self: this,
		__source: {
			fileName: X,
			lineNumber: 130,
			columnNumber: 103
		}
	}), /* @__PURE__ */ e.createElement("b", {
		__self: this,
		__source: {
			fileName: X,
			lineNumber: 130,
			columnNumber: 108
		}
	}, "Velocity"), " = displacement ÷ time. It carries a sign, inherited from the + direction you chose.")), /* @__PURE__ */ e.createElement("div", {
		style: Z.cardInsight,
		__self: this,
		__source: {
			fileName: X,
			lineNumber: 132,
			columnNumber: 9
		}
	}, /* @__PURE__ */ e.createElement("div", {
		style: Z.row,
		__self: this,
		__source: {
			fileName: X,
			lineNumber: 133,
			columnNumber: 11
		}
	}, /* @__PURE__ */ e.createElement("span", {
		style: Z.badge,
		__self: this,
		__source: {
			fileName: X,
			lineNumber: 133,
			columnNumber: 30
		}
	}, "💡"), /* @__PURE__ */ e.createElement("span", {
		style: Z.hInsight,
		__self: this,
		__source: {
			fileName: X,
			lineNumber: 133,
			columnNumber: 61
		}
	}, "Key insight")), /* @__PURE__ */ e.createElement("p", {
		style: Z.body,
		__self: this,
		__source: {
			fileName: X,
			lineNumber: 134,
			columnNumber: 11
		}
	}, "Flip which way counts as positive and the ", /* @__PURE__ */ e.createElement("i", {
		__self: this,
		__source: {
			fileName: X,
			lineNumber: 134,
			columnNumber: 71
		}
	}, "speed"), " stays 12 — but the ", /* @__PURE__ */ e.createElement("i", {
		__self: this,
		__source: {
			fileName: X,
			lineNumber: 134,
			columnNumber: 103
		}
	}, "velocity"), " changes sign. Speed is a bare magnitude; velocity is magnitude + direction.")), /* @__PURE__ */ e.createElement("div", {
		style: Z.cardPitfall,
		__self: this,
		__source: {
			fileName: X,
			lineNumber: 136,
			columnNumber: 9
		}
	}, /* @__PURE__ */ e.createElement("div", {
		style: Z.row,
		__self: this,
		__source: {
			fileName: X,
			lineNumber: 137,
			columnNumber: 11
		}
	}, /* @__PURE__ */ e.createElement("span", {
		style: Z.badge,
		__self: this,
		__source: {
			fileName: X,
			lineNumber: 137,
			columnNumber: 30
		}
	}, "⚠️"), /* @__PURE__ */ e.createElement("span", {
		style: Z.hPitfall,
		__self: this,
		__source: {
			fileName: X,
			lineNumber: 137,
			columnNumber: 61
		}
	}, "Exam trap")), /* @__PURE__ */ e.createElement("p", {
		style: Z.body,
		__self: this,
		__source: {
			fileName: X,
			lineNumber: 138,
			columnNumber: 11
		}
	}, "\"−12 m/s\" is not slower than \"+12 m/s\". The minus is a ", /* @__PURE__ */ e.createElement("i", {
		__self: this,
		__source: {
			fileName: X,
			lineNumber: 138,
			columnNumber: 84
		}
	}, "direction"), ", not a smaller size. Both have a speed of 12 m/s."))), /* @__PURE__ */ e.createElement("div", {
		className: "slide-right",
		style: Z.right,
		__self: this,
		__source: {
			fileName: X,
			lineNumber: 141,
			columnNumber: 7
		}
	}, /* @__PURE__ */ e.createElement("div", {
		style: Z.panelTitle,
		__self: this,
		__source: {
			fileName: X,
			lineNumber: 142,
			columnNumber: 9
		}
	}, "A velocity always names a direction"), /* @__PURE__ */ e.createElement("img", {
		src: "http://localhost:3001/files/slide-assets/43701f3b-4137-4172-b4e9-54e872c8f550/5ba11cae-1680-4561-be2d-7f46de58e048.png",
		alt: "Velocity vector: 12 m/s east",
		style: Z.refImg,
		__self: this,
		__source: {
			fileName: X,
			lineNumber: 143,
			columnNumber: 9
		}
	}), /* @__PURE__ */ e.createElement("div", {
		style: Z.imgCaption,
		__self: this,
		__source: {
			fileName: X,
			lineNumber: 148,
			columnNumber: 9
		}
	}, "A speed of 12 m/s + a direction (east) = a velocity. Drop the \"east\" and you only have speed."), /* @__PURE__ */ e.createElement("hr", {
		style: Z.hr,
		__self: this,
		__source: {
			fileName: X,
			lineNumber: 149,
			columnNumber: 9
		}
	}), /* @__PURE__ */ e.createElement("div", {
		style: Z.panelTitle,
		__self: this,
		__source: {
			fileName: X,
			lineNumber: 150,
			columnNumber: 9
		}
	}, "Run the trip — watch speed vs velocity"), /* @__PURE__ */ e.createElement("canvas", {
		ref: l,
		style: Z.canvas,
		__self: this,
		__source: {
			fileName: X,
			lineNumber: 151,
			columnNumber: 9
		}
	}), /* @__PURE__ */ e.createElement("div", {
		style: Z.readRow,
		__self: this,
		__source: {
			fileName: X,
			lineNumber: 152,
			columnNumber: 9
		}
	}, /* @__PURE__ */ e.createElement("div", {
		style: Z.readBox,
		__self: this,
		__source: {
			fileName: X,
			lineNumber: 153,
			columnNumber: 11
		}
	}, /* @__PURE__ */ e.createElement("div", {
		style: Z.readK,
		__self: this,
		__source: {
			fileName: X,
			lineNumber: 153,
			columnNumber: 34
		}
	}, "Speed"), /* @__PURE__ */ e.createElement("div", {
		style: Z.readV,
		__self: this,
		__source: {
			fileName: X,
			lineNumber: 153,
			columnNumber: 66
		}
	}, Math.abs(u.vel), " m/s")), /* @__PURE__ */ e.createElement("div", {
		style: Z.readBox,
		__self: this,
		__source: {
			fileName: X,
			lineNumber: 154,
			columnNumber: 11
		}
	}, /* @__PURE__ */ e.createElement("div", {
		style: Z.readK,
		__self: this,
		__source: {
			fileName: X,
			lineNumber: 154,
			columnNumber: 34
		}
	}, "Velocity"), /* @__PURE__ */ e.createElement("div", {
		style: {
			...Z.readV,
			color: u.vel < 0 ? "var(--accent-text)" : "var(--primary)"
		},
		__self: this,
		__source: {
			fileName: X,
			lineNumber: 154,
			columnNumber: 69
		}
	}, u.vel > 0 ? "+" : "", u.vel, " m/s"))), /* @__PURE__ */ e.createElement("div", {
		style: Z.controls,
		__self: this,
		__source: {
			fileName: X,
			lineNumber: 156,
			columnNumber: 9
		}
	}, /* @__PURE__ */ e.createElement("button", {
		style: Z.btn,
		onClick: f,
		disabled: i !== 0,
		__self: this,
		__source: {
			fileName: X,
			lineNumber: 157,
			columnNumber: 11
		}
	}, i === 0 ? "▶ Go (there & back)" : "Moving…"), /* @__PURE__ */ e.createElement("button", {
		style: Z.btnGhost,
		onClick: p,
		__self: this,
		__source: {
			fileName: X,
			lineNumber: 158,
			columnNumber: 11
		}
	}, "⇄ Flip + direction")), /* @__PURE__ */ e.createElement("div", {
		style: Z.note,
		__self: this,
		__source: {
			fileName: X,
			lineNumber: 160,
			columnNumber: 9
		}
	}, "Outbound and return have the ", /* @__PURE__ */ e.createElement("b", {
		__self: this,
		__source: {
			fileName: X,
			lineNumber: 160,
			columnNumber: 58
		}
	}, "same speed"), " but ", /* @__PURE__ */ e.createElement("b", {
		__self: this,
		__source: {
			fileName: X,
			lineNumber: 160,
			columnNumber: 80
		}
	}, "opposite velocity"), ". Flip the + arrow and watch the velocity sign swap while speed never does.")));
}
var No = {
	background: "var(--surface-raised)",
	border: "1px solid var(--border-light)",
	borderRadius: 10,
	padding: "14px 18px",
	boxSizing: "border-box"
}, Z = {
	title: {
		fontSize: 22,
		fontWeight: 700,
		color: "var(--text-primary)"
	},
	left: {
		display: "flex",
		flexDirection: "column",
		gap: 12,
		minWidth: 0
	},
	right: {
		display: "flex",
		flexDirection: "column",
		gap: 12,
		minWidth: 0
	},
	row: {
		display: "flex",
		alignItems: "center",
		gap: 8,
		marginBottom: 8
	},
	badge: {
		display: "inline-flex",
		alignItems: "center",
		justifyContent: "center",
		width: 24,
		height: 24,
		borderRadius: 6,
		fontSize: 14,
		background: "var(--surface)",
		flexShrink: 0
	},
	card: { ...No },
	cardHook: {
		...No,
		background: "var(--hook-soft)",
		borderLeft: "2px solid var(--hook)"
	},
	cardInsight: {
		...No,
		background: "var(--primary-softer)",
		borderColor: "var(--primary-soft)",
		borderLeft: "2px solid var(--primary)"
	},
	cardPitfall: {
		...No,
		background: "var(--accent-soft)",
		borderLeft: "2px solid var(--accent)"
	},
	hHook: {
		fontSize: 14,
		fontWeight: 700,
		color: "var(--hook-text)"
	},
	hCard: {
		fontSize: 14,
		fontWeight: 700,
		color: "var(--primary)",
		marginBottom: 8
	},
	hInsight: {
		fontSize: 14,
		fontWeight: 700,
		color: "var(--primary)"
	},
	hPitfall: {
		fontSize: 14,
		fontWeight: 700,
		color: "var(--accent)"
	},
	hookText: {
		fontSize: 15,
		lineHeight: 1.65,
		color: "var(--text-primary)",
		fontStyle: "italic",
		margin: 0
	},
	body: {
		fontSize: 15,
		lineHeight: 1.65,
		color: "var(--text-primary)",
		margin: 0
	},
	panelTitle: {
		fontSize: 16,
		fontWeight: 700,
		color: "var(--text-primary)"
	},
	refImg: {
		display: "block",
		width: "100%",
		maxWidth: 320,
		maxHeight: 170,
		objectFit: "contain",
		margin: "0 auto",
		alignSelf: "center"
	},
	imgCaption: {
		fontSize: 13,
		color: "var(--text-muted)",
		textAlign: "center",
		lineHeight: 1.5
	},
	hr: {
		border: "none",
		borderTop: "1px solid var(--border-light)",
		margin: "4px 0"
	},
	canvas: {
		width: "100%",
		aspectRatio: "5 / 3",
		maxHeight: "34vh",
		display: "block",
		background: "var(--surface)",
		border: "1px solid var(--border-light)",
		borderRadius: 8
	},
	readRow: {
		display: "flex",
		gap: 12
	},
	readBox: {
		flex: 1,
		minWidth: 0,
		textAlign: "center",
		background: "var(--surface)",
		border: "1px solid var(--border-light)",
		borderRadius: 8,
		padding: "10px 8px"
	},
	readK: {
		fontSize: 12,
		color: "var(--text-muted)",
		marginBottom: 4
	},
	readV: {
		fontSize: 20,
		fontWeight: 700,
		color: "var(--text-primary)"
	},
	controls: {
		display: "flex",
		gap: 10,
		flexWrap: "wrap"
	},
	btn: {
		flex: 1,
		minWidth: 140,
		padding: "10px 12px",
		borderRadius: 8,
		border: "none",
		background: "var(--primary)",
		color: "var(--primary-text)",
		fontWeight: 700,
		fontSize: 14,
		cursor: "pointer",
		fontFamily: "Outfit, sans-serif"
	},
	btnGhost: {
		flex: 1,
		minWidth: 140,
		padding: "10px 12px",
		borderRadius: 8,
		border: "1px solid var(--border)",
		background: "var(--surface)",
		color: "var(--text-primary)",
		fontWeight: 700,
		fontSize: 14,
		cursor: "pointer",
		fontFamily: "Outfit, sans-serif"
	},
	note: {
		fontSize: 13,
		color: "var(--text-secondary)",
		lineHeight: 1.55,
		background: "var(--surface)",
		border: "1px solid var(--border-light)",
		borderRadius: 8,
		padding: "10px 12px"
	}
}, Q = "/private/var/folders/_d/9xxv4yg13xz4pvwj4bs4ckqm0000gp/T/nadi-slides-48cb9343-4cfd-4b11-8b2a-9f2d685199fd/Slide_t1-1_invariant.jsx";
function Po({ studentName: t }) {
	let n = (e) => 50 + e * 65, [r, i] = ae(3), [a, o] = ae(1), [s, c] = ae("predict"), [l, u] = ae(null), [d, f] = ae(!1), p = ie(!1), m = ie(null), h = (e) => a * (e - r), g = h(2), _ = h(6), v = Math.abs(_ - g), y = (e) => (e > 0 ? "+" : "") + e, b = (e) => {
		let t = m.current;
		if (!t) return r;
		let n = t.getBoundingClientRect();
		if (!n.width) return r;
		let i = (e - n.left) * (600 / n.width), a = Math.round((i - 50) / 65);
		return Math.max(0, Math.min(8, a));
	}, x = (e) => {
		if (s === "explore") {
			e.preventDefault(), p.current = !0;
			try {
				e.currentTarget.setPointerCapture(e.pointerId);
			} catch {}
		}
	}, S = (e) => {
		!p.current || s !== "explore" || (i(b(e.clientX)), f(!0));
	}, ee = () => {
		p.current = !1;
	}, te = (e) => {
		u(e), c("explore");
	}, ne = () => {
		s === "explore" && (o((e) => -e), f(!0));
	}, re = (e) => {
		s === "explore" && (i(e), f(!0));
	}, oe = () => {
		c("predict"), u(null), f(!1), i(3), o(1), p.current = !1;
	}, se = l === "grow" ? "get bigger" : l === "shrink" ? "get smaller" : "stay the same", ce = l === "same", le = n(2), ue = n(6), de = (le + ue) / 2, fe = 300 + a * 50;
	return /* @__PURE__ */ e.createElement(e.Fragment, null, /* @__PURE__ */ e.createElement("div", {
		className: "slide-title",
		style: $.title,
		__self: this,
		__source: {
			fileName: Q,
			lineNumber: 61,
			columnNumber: 7
		}
	}, "The gap that won't budge"), /* @__PURE__ */ e.createElement("div", {
		className: "slide-left",
		style: $.left,
		__self: this,
		__source: {
			fileName: Q,
			lineNumber: 63,
			columnNumber: 7
		}
	}, /* @__PURE__ */ e.createElement("div", {
		style: $.cardHook,
		__self: this,
		__source: {
			fileName: Q,
			lineNumber: 64,
			columnNumber: 9
		}
	}, /* @__PURE__ */ e.createElement("div", {
		style: $.row,
		__self: this,
		__source: {
			fileName: Q,
			lineNumber: 65,
			columnNumber: 11
		}
	}, /* @__PURE__ */ e.createElement("span", {
		style: $.badge,
		__self: this,
		__source: {
			fileName: Q,
			lineNumber: 65,
			columnNumber: 30
		}
	}, "💭"), /* @__PURE__ */ e.createElement("span", {
		style: $.hHook,
		__self: this,
		__source: {
			fileName: Q,
			lineNumber: 65,
			columnNumber: 61
		}
	}, "You vs your friend")), /* @__PURE__ */ e.createElement("p", {
		style: $.hookText,
		__self: this,
		__source: {
			fileName: Q,
			lineNumber: 66,
			columnNumber: 11
		}
	}, t, ", the tree and your bike sit exactly where they sit. You pick one spot for zero, your friend picks another — so you'll read off ", /* @__PURE__ */ e.createElement("i", {
		__self: this,
		__source: {
			fileName: Q,
			lineNumber: 66,
			columnNumber: 174
		}
	}, "different"), " position numbers for both. Fair enough. But here's the bet…")), /* @__PURE__ */ e.createElement("div", {
		style: $.card,
		__self: this,
		__source: {
			fileName: Q,
			lineNumber: 69,
			columnNumber: 9
		}
	}, /* @__PURE__ */ e.createElement("div", {
		style: $.hCard,
		__self: this,
		__source: {
			fileName: Q,
			lineNumber: 70,
			columnNumber: 11
		}
	}, "So make the call"), /* @__PURE__ */ e.createElement("p", {
		style: $.body,
		__self: this,
		__source: {
			fileName: Q,
			lineNumber: 71,
			columnNumber: 11
		}
	}, "You two will disagree about each ", /* @__PURE__ */ e.createElement("i", {
		__self: this,
		__source: {
			fileName: Q,
			lineNumber: 71,
			columnNumber: 62
		}
	}, "number"), ". Will you also disagree about ", /* @__PURE__ */ e.createElement("b", {
		__self: this,
		__source: {
			fileName: Q,
			lineNumber: 71,
			columnNumber: 106
		}
	}, "how far apart"), " the tree and bike are? Commit to a guess in the sandbox — ", /* @__PURE__ */ e.createElement("i", {
		__self: this,
		__source: {
			fileName: Q,
			lineNumber: 71,
			columnNumber: 185
		}
	}, "then"), " drag the zero around and find out.")), !d && /* @__PURE__ */ e.createElement("div", {
		style: $.cardLock,
		__self: this,
		__source: {
			fileName: Q,
			lineNumber: 75,
			columnNumber: 11
		}
	}, /* @__PURE__ */ e.createElement("div", {
		style: $.row,
		__self: this,
		__source: {
			fileName: Q,
			lineNumber: 76,
			columnNumber: 13
		}
	}, /* @__PURE__ */ e.createElement("span", {
		style: $.badge,
		__self: this,
		__source: {
			fileName: Q,
			lineNumber: 76,
			columnNumber: 32
		}
	}, "🔒"), /* @__PURE__ */ e.createElement("span", {
		style: $.hLock,
		__self: this,
		__source: {
			fileName: Q,
			lineNumber: 76,
			columnNumber: 63
		}
	}, "What's really going on")), /* @__PURE__ */ e.createElement("p", {
		style: $.bodyMuted,
		__self: this,
		__source: {
			fileName: Q,
			lineNumber: 77,
			columnNumber: 13
		}
	}, "Predict, then drag the 🚩 around and watch the gap. This unlocks once you've tested it →")), d && /* @__PURE__ */ e.createElement(e.Fragment, null, /* @__PURE__ */ e.createElement("div", {
		style: $.cardInsight,
		__self: this,
		__source: {
			fileName: Q,
			lineNumber: 83,
			columnNumber: 13
		}
	}, /* @__PURE__ */ e.createElement("div", {
		style: $.row,
		__self: this,
		__source: {
			fileName: Q,
			lineNumber: 84,
			columnNumber: 15
		}
	}, /* @__PURE__ */ e.createElement("span", {
		style: $.badge,
		__self: this,
		__source: {
			fileName: Q,
			lineNumber: 84,
			columnNumber: 34
		}
	}, "💡"), /* @__PURE__ */ e.createElement("span", {
		style: $.hInsight,
		__self: this,
		__source: {
			fileName: Q,
			lineNumber: 84,
			columnNumber: 65
		}
	}, "What you just found")), /* @__PURE__ */ e.createElement("p", {
		style: $.body,
		__self: this,
		__source: {
			fileName: Q,
			lineNumber: 85,
			columnNumber: 15
		}
	}, "Every ", /* @__PURE__ */ e.createElement("i", {
		__self: this,
		__source: {
			fileName: Q,
			lineNumber: 85,
			columnNumber: 39
		}
	}, "coordinate"), " changed as you slid the zero — because a coordinate is just ", /* @__PURE__ */ e.createElement("b", {
		__self: this,
		__source: {
			fileName: Q,
			lineNumber: 85,
			columnNumber: 117
		}
	}, "description"), ", measured from a zero you happened to pick. But the ", /* @__PURE__ */ e.createElement("b", {
		__self: this,
		__source: {
			fileName: Q,
			lineNumber: 85,
			columnNumber: 188
		}
	}, "gap between two real points"), " can't care where you scribbled zero, so it held at ", /* @__PURE__ */ e.createElement("b", {
		__self: this,
		__source: {
			fileName: Q,
			lineNumber: 85,
			columnNumber: 274
		}
	}, v), "."), /* @__PURE__ */ e.createElement("hr", {
		style: $.hr,
		__self: this,
		__source: {
			fileName: Q,
			lineNumber: 86,
			columnNumber: 15
		}
	}), /* @__PURE__ */ e.createElement("p", {
		style: $.body,
		__self: this,
		__source: {
			fileName: Q,
			lineNumber: 87,
			columnNumber: 15
		}
	}, "Positions are opinions. The ", /* @__PURE__ */ e.createElement("b", {
		__self: this,
		__source: {
			fileName: Q,
			lineNumber: 87,
			columnNumber: 61
		}
	}, "distance between things is a fact"), " everyone agrees on.")), /* @__PURE__ */ e.createElement("div", {
		style: $.cardSurprise,
		__self: this,
		__source: {
			fileName: Q,
			lineNumber: 89,
			columnNumber: 13
		}
	}, /* @__PURE__ */ e.createElement("div", {
		style: $.row,
		__self: this,
		__source: {
			fileName: Q,
			lineNumber: 90,
			columnNumber: 15
		}
	}, /* @__PURE__ */ e.createElement("span", {
		style: $.badge,
		__self: this,
		__source: {
			fileName: Q,
			lineNumber: 90,
			columnNumber: 34
		}
	}, "🤯"), /* @__PURE__ */ e.createElement("span", {
		style: $.hSurprise,
		__self: this,
		__source: {
			fileName: Q,
			lineNumber: 90,
			columnNumber: 65
		}
	}, "Why this matters next")), /* @__PURE__ */ e.createElement("p", {
		style: $.body,
		__self: this,
		__source: {
			fileName: Q,
			lineNumber: 91,
			columnNumber: 15
		}
	}, "Distance and displacement are built out of ", /* @__PURE__ */ e.createElement("i", {
		__self: this,
		__source: {
			fileName: Q,
			lineNumber: 91,
			columnNumber: 76
		}
	}, "gaps"), ", not raw positions — that's exactly why they're real facts about a journey even though no two people number the road the same way.")))), /* @__PURE__ */ e.createElement("div", {
		className: "slide-right",
		style: $.right,
		__self: this,
		__source: {
			fileName: Q,
			lineNumber: 97,
			columnNumber: 7
		}
	}, /* @__PURE__ */ e.createElement("div", {
		style: $.panelTitle,
		__self: this,
		__source: {
			fileName: Q,
			lineNumber: 98,
			columnNumber: 9
		}
	}, "The same road — now with a tree 🌳 and your bike 🚲"), /* @__PURE__ */ e.createElement("div", {
		style: $.stage,
		__self: this,
		__source: {
			fileName: Q,
			lineNumber: 100,
			columnNumber: 9
		}
	}, /* @__PURE__ */ e.createElement("svg", {
		ref: m,
		viewBox: "0 0 600 220",
		style: $.svg,
		onPointerMove: S,
		onPointerUp: ee,
		onPointerLeave: ee,
		__self: this,
		__source: {
			fileName: Q,
			lineNumber: 101,
			columnNumber: 11
		}
	}, /* @__PURE__ */ e.createElement("g", {
		__self: this,
		__source: {
			fileName: Q,
			lineNumber: 104,
			columnNumber: 13
		}
	}, /* @__PURE__ */ e.createElement("line", {
		x1: le,
		y1: 32,
		x2: ue,
		y2: 32,
		stroke: "var(--surprise)",
		strokeWidth: 2,
		__self: this,
		__source: {
			fileName: Q,
			lineNumber: 105,
			columnNumber: 15
		}
	}), /* @__PURE__ */ e.createElement("line", {
		x1: le,
		y1: 28,
		x2: le,
		y2: 40,
		stroke: "var(--surprise)",
		strokeWidth: 2,
		__self: this,
		__source: {
			fileName: Q,
			lineNumber: 106,
			columnNumber: 15
		}
	}), /* @__PURE__ */ e.createElement("line", {
		x1: ue,
		y1: 28,
		x2: ue,
		y2: 40,
		stroke: "var(--surprise)",
		strokeWidth: 2,
		__self: this,
		__source: {
			fileName: Q,
			lineNumber: 107,
			columnNumber: 15
		}
	}), /* @__PURE__ */ e.createElement("text", {
		x: de,
		y: 22,
		textAnchor: "middle",
		fontSize: 13,
		fontWeight: 800,
		fill: "var(--surprise-text)",
		__self: this,
		__source: {
			fileName: Q,
			lineNumber: 108,
			columnNumber: 15
		}
	}, "↔ gap = ", v)), [{
		xi: le,
		v: g
	}, {
		xi: ue,
		v: _
	}].map((t, n) => /* @__PURE__ */ e.createElement("g", {
		key: n,
		__self: this,
		__source: {
			fileName: Q,
			lineNumber: 113,
			columnNumber: 15
		}
	}, /* @__PURE__ */ e.createElement("rect", {
		x: t.xi - 24,
		y: 56,
		width: 48,
		height: 24,
		rx: 7,
		fill: "var(--primary)",
		__self: this,
		__source: {
			fileName: Q,
			lineNumber: 114,
			columnNumber: 17
		}
	}), /* @__PURE__ */ e.createElement("text", {
		x: t.xi,
		y: 73,
		textAnchor: "middle",
		fontSize: 14,
		fontWeight: 700,
		fill: "var(--primary-text)",
		__self: this,
		__source: {
			fileName: Q,
			lineNumber: 115,
			columnNumber: 17
		}
	}, y(t.v)))), /* @__PURE__ */ e.createElement("line", {
		x1: 20,
		y1: 150,
		x2: 580,
		y2: 150,
		stroke: "var(--border-light)",
		strokeWidth: 6,
		strokeLinecap: "round",
		__self: this,
		__source: {
			fileName: Q,
			lineNumber: 120,
			columnNumber: 13
		}
	}), Array.from({ length: 9 }).map((t, i) => /* @__PURE__ */ e.createElement("g", {
		key: i,
		onClick: () => re(i),
		style: { cursor: s === "explore" ? "pointer" : "default" },
		__self: this,
		__source: {
			fileName: Q,
			lineNumber: 124,
			columnNumber: 15
		}
	}, /* @__PURE__ */ e.createElement("line", {
		x1: n(i),
		y1: 138,
		x2: n(i),
		y2: 162,
		stroke: "var(--border)",
		strokeWidth: 3,
		__self: this,
		__source: {
			fileName: Q,
			lineNumber: 125,
			columnNumber: 17
		}
	}), /* @__PURE__ */ e.createElement("text", {
		x: n(i),
		y: 182,
		textAnchor: "middle",
		fontSize: 12,
		fontWeight: 700,
		fill: i === r ? "var(--accent)" : "var(--text-secondary)",
		__self: this,
		__source: {
			fileName: Q,
			lineNumber: 126,
			columnNumber: 17
		}
	}, h(i)))), /* @__PURE__ */ e.createElement("text", {
		x: le,
		y: 116,
		textAnchor: "middle",
		fontSize: 28,
		__self: this,
		__source: {
			fileName: Q,
			lineNumber: 132,
			columnNumber: 13
		}
	}, "🌳"), /* @__PURE__ */ e.createElement("text", {
		x: ue,
		y: 116,
		textAnchor: "middle",
		fontSize: 28,
		__self: this,
		__source: {
			fileName: Q,
			lineNumber: 133,
			columnNumber: 13
		}
	}, "🚲"), /* @__PURE__ */ e.createElement("g", {
		transform: `translate(${n(r)},0)`,
		onPointerDown: x,
		style: {
			cursor: s === "explore" ? "grab" : "not-allowed",
			touchAction: "none"
		},
		__self: this,
		__source: {
			fileName: Q,
			lineNumber: 136,
			columnNumber: 13
		}
	}, /* @__PURE__ */ e.createElement("line", {
		x1: 0,
		y1: 126,
		x2: 0,
		y2: 162,
		stroke: "var(--accent)",
		strokeWidth: 2,
		__self: this,
		__source: {
			fileName: Q,
			lineNumber: 138,
			columnNumber: 15
		}
	}), /* @__PURE__ */ e.createElement("text", {
		x: 0,
		y: 126,
		textAnchor: "middle",
		fontSize: 20,
		__self: this,
		__source: {
			fileName: Q,
			lineNumber: 139,
			columnNumber: 15
		}
	}, "🚩")), /* @__PURE__ */ e.createElement("g", {
		__self: this,
		__source: {
			fileName: Q,
			lineNumber: 143,
			columnNumber: 13
		}
	}, /* @__PURE__ */ e.createElement("text", {
		x: 300,
		y: 200,
		textAnchor: "middle",
		fontSize: 11,
		fontWeight: 700,
		fill: "var(--primary)",
		__self: this,
		__source: {
			fileName: Q,
			lineNumber: 144,
			columnNumber: 15
		}
	}, "+ forward"), /* @__PURE__ */ e.createElement("line", {
		x1: 300,
		y1: 208,
		x2: fe,
		y2: 208,
		stroke: "var(--primary)",
		strokeWidth: 3,
		__self: this,
		__source: {
			fileName: Q,
			lineNumber: 145,
			columnNumber: 15
		}
	}), /* @__PURE__ */ e.createElement("polygon", {
		points: `${fe},208 ${fe - a * 9},203 ${fe - a * 9},213`,
		fill: "var(--primary)",
		__self: this,
		__source: {
			fileName: Q,
			lineNumber: 146,
			columnNumber: 15
		}
	})))), s === "predict" && /* @__PURE__ */ e.createElement("div", {
		style: $.predict,
		__self: this,
		__source: {
			fileName: Q,
			lineNumber: 152,
			columnNumber: 11
		}
	}, /* @__PURE__ */ e.createElement("div", {
		style: $.predictQ,
		__self: this,
		__source: {
			fileName: Q,
			lineNumber: 153,
			columnNumber: 13
		}
	}, "Right now the gap reads ", /* @__PURE__ */ e.createElement("b", {
		__self: this,
		__source: {
			fileName: Q,
			lineNumber: 153,
			columnNumber: 61
		}
	}, "4"), ". You're about to drag the zero all over the road. ", /* @__PURE__ */ e.createElement("b", {
		__self: this,
		__source: {
			fileName: Q,
			lineNumber: 153,
			columnNumber: 120
		}
	}, "Predict first:"), " the gap between 🌳 and 🚲 will…"), /* @__PURE__ */ e.createElement("div", {
		style: $.predictBtns,
		__self: this,
		__source: {
			fileName: Q,
			lineNumber: 154,
			columnNumber: 13
		}
	}, /* @__PURE__ */ e.createElement("button", {
		style: $.gBtn,
		onClick: () => te("grow"),
		__self: this,
		__source: {
			fileName: Q,
			lineNumber: 155,
			columnNumber: 15
		}
	}, "📈 get bigger"), /* @__PURE__ */ e.createElement("button", {
		style: $.gBtn,
		onClick: () => te("shrink"),
		__self: this,
		__source: {
			fileName: Q,
			lineNumber: 156,
			columnNumber: 15
		}
	}, "📉 get smaller"), /* @__PURE__ */ e.createElement("button", {
		style: $.gBtn,
		onClick: () => te("same"),
		__self: this,
		__source: {
			fileName: Q,
			lineNumber: 157,
			columnNumber: 15
		}
	}, "🔒 stay 4"))), s === "explore" && !d && /* @__PURE__ */ e.createElement("div", {
		style: $.banner,
		__self: this,
		__source: {
			fileName: Q,
			lineNumber: 163,
			columnNumber: 11
		}
	}, /* @__PURE__ */ e.createElement("b", {
		__self: this,
		__source: {
			fileName: Q,
			lineNumber: 164,
			columnNumber: 13
		}
	}, "You predicted:"), " the gap will ", /* @__PURE__ */ e.createElement("b", {
		__self: this,
		__source: {
			fileName: Q,
			lineNumber: 164,
			columnNumber: 48
		}
	}, se), ". Now drag the 🚩 (or flip +) and keep your eye on ", /* @__PURE__ */ e.createElement("b", {
		__self: this,
		__source: {
			fileName: Q,
			lineNumber: 164,
			columnNumber: 117
		}
	}, "gap = ", v), ". Were you right?"), s === "explore" && d && /* @__PURE__ */ e.createElement("div", {
		style: ce ? $.bannerWin : $.bannerHold,
		__self: this,
		__source: {
			fileName: Q,
			lineNumber: 169,
			columnNumber: 11
		}
	}, ce ? `Called it. 🌳 reads ${y(g)} and 🚲 reads ${y(_)} — both numbers shift as you drag, yet the gap is glued at ${v}.` : `You predicted the gap would ${se} — watch again. 🌳 = ${y(g)}, 🚲 = ${y(_)}: the two numbers really are moving, but the gap won't leave ${v}.`), /* @__PURE__ */ e.createElement("div", {
		style: $.controls,
		__self: this,
		__source: {
			fileName: Q,
			lineNumber: 176,
			columnNumber: 9
		}
	}, /* @__PURE__ */ e.createElement("button", {
		style: a === -1 ? $.dirBtnActive : $.dirBtn,
		disabled: s !== "explore",
		onClick: ne,
		__self: this,
		__source: {
			fileName: Q,
			lineNumber: 177,
			columnNumber: 11
		}
	}, "⬅ + this way"), /* @__PURE__ */ e.createElement("button", {
		style: a === 1 ? $.dirBtnActive : $.dirBtn,
		disabled: s !== "explore",
		onClick: ne,
		__self: this,
		__source: {
			fileName: Q,
			lineNumber: 178,
			columnNumber: 11
		}
	}, "+ this way ➡"), /* @__PURE__ */ e.createElement("button", {
		style: $.resetBtn,
		onClick: oe,
		__self: this,
		__source: {
			fileName: Q,
			lineNumber: 179,
			columnNumber: 11
		}
	}, "↺ Reset"))));
}
var Fo = {
	background: "var(--surface-raised)",
	border: "1px solid var(--border-light)",
	borderRadius: 10,
	padding: "14px 18px",
	boxSizing: "border-box"
}, $ = {
	title: {
		fontSize: 22,
		fontWeight: 700,
		color: "var(--text-primary)"
	},
	left: {
		display: "flex",
		flexDirection: "column",
		gap: 12,
		minWidth: 0
	},
	right: {
		display: "flex",
		flexDirection: "column",
		gap: 14,
		minWidth: 0
	},
	row: {
		display: "flex",
		alignItems: "center",
		gap: 8,
		marginBottom: 8
	},
	badge: {
		display: "inline-flex",
		alignItems: "center",
		justifyContent: "center",
		width: 24,
		height: 24,
		borderRadius: 6,
		fontSize: 14,
		background: "var(--surface)",
		flexShrink: 0
	},
	card: { ...Fo },
	cardHook: {
		...Fo,
		background: "var(--hook-soft)",
		borderLeft: "2px solid var(--hook)"
	},
	cardLock: {
		...Fo,
		background: "var(--surface)",
		borderStyle: "dashed"
	},
	cardInsight: {
		...Fo,
		background: "var(--primary-softer)",
		borderColor: "var(--primary-soft)",
		borderLeft: "2px solid var(--primary)"
	},
	cardSurprise: {
		...Fo,
		background: "var(--surprise-soft)",
		borderLeft: "2px solid var(--surprise)"
	},
	hHook: {
		fontSize: 14,
		fontWeight: 700,
		color: "var(--hook-text)"
	},
	hCard: {
		fontSize: 14,
		fontWeight: 700,
		color: "var(--primary)",
		marginBottom: 8
	},
	hLock: {
		fontSize: 14,
		fontWeight: 700,
		color: "var(--text-muted)"
	},
	hInsight: {
		fontSize: 14,
		fontWeight: 700,
		color: "var(--primary)"
	},
	hSurprise: {
		fontSize: 14,
		fontWeight: 700,
		color: "var(--surprise-text)"
	},
	hookText: {
		fontSize: 15,
		lineHeight: 1.6,
		color: "var(--text-primary)",
		fontStyle: "italic",
		margin: 0
	},
	body: {
		fontSize: 15,
		lineHeight: 1.6,
		color: "var(--text-primary)",
		margin: 0
	},
	bodyMuted: {
		fontSize: 14,
		lineHeight: 1.6,
		color: "var(--text-muted)",
		margin: 0,
		fontStyle: "italic"
	},
	hr: {
		border: "none",
		borderTop: "1px solid var(--border-light)",
		margin: "10px 0"
	},
	panelTitle: {
		fontSize: 16,
		fontWeight: 700,
		color: "var(--text-primary)"
	},
	stage: {
		background: "var(--surface)",
		border: "1px solid var(--border-light)",
		borderRadius: 10,
		padding: 10,
		boxSizing: "border-box"
	},
	svg: {
		width: "100%",
		height: "auto",
		display: "block",
		maxWidth: "100%",
		touchAction: "none"
	},
	predict: {
		background: "var(--surface)",
		border: "1px solid var(--border-light)",
		borderRadius: 10,
		padding: "14px 16px",
		boxSizing: "border-box",
		display: "flex",
		flexDirection: "column",
		gap: 12
	},
	predictQ: {
		fontSize: 14,
		lineHeight: 1.55,
		color: "var(--text-primary)"
	},
	predictBtns: {
		display: "flex",
		gap: 8,
		flexWrap: "wrap"
	},
	gBtn: {
		flex: "1 1 30%",
		minWidth: 0,
		padding: "12px 8px",
		borderRadius: 8,
		border: "1px solid var(--primary-soft)",
		background: "var(--primary-softer)",
		color: "var(--primary)",
		fontWeight: 700,
		fontSize: 13,
		cursor: "pointer",
		fontFamily: "inherit"
	},
	banner: {
		background: "var(--surface)",
		border: "1px solid var(--border-light)",
		borderRadius: 10,
		padding: "12px 16px",
		fontSize: 14,
		lineHeight: 1.55,
		color: "var(--text-primary)",
		boxSizing: "border-box"
	},
	bannerWin: {
		background: "var(--primary-softer)",
		border: "1px solid var(--primary-soft)",
		borderLeft: "2px solid var(--primary)",
		borderRadius: 10,
		padding: "12px 16px",
		fontSize: 14,
		lineHeight: 1.55,
		color: "var(--text-primary)",
		boxSizing: "border-box"
	},
	bannerHold: {
		background: "var(--accent-soft)",
		border: "1px solid var(--accent)",
		borderLeft: "2px solid var(--accent)",
		borderRadius: 10,
		padding: "12px 16px",
		fontSize: 14,
		lineHeight: 1.55,
		color: "var(--text-primary)",
		boxSizing: "border-box"
	},
	controls: {
		display: "flex",
		gap: 8,
		flexWrap: "wrap"
	},
	dirBtn: {
		flex: "1 1 30%",
		minWidth: 0,
		padding: "10px 8px",
		borderRadius: 8,
		border: "1px solid var(--border)",
		background: "var(--surface-raised)",
		color: "var(--text-secondary)",
		fontWeight: 700,
		fontSize: 13,
		cursor: "pointer",
		fontFamily: "inherit"
	},
	dirBtnActive: {
		flex: "1 1 30%",
		minWidth: 0,
		padding: "10px 8px",
		borderRadius: 8,
		border: "1px solid var(--primary)",
		background: "var(--primary)",
		color: "var(--primary-text)",
		fontWeight: 700,
		fontSize: 13,
		cursor: "pointer",
		fontFamily: "inherit"
	},
	resetBtn: {
		flex: "1 1 30%",
		minWidth: 0,
		padding: "10px 8px",
		borderRadius: 8,
		border: "1px solid var(--border)",
		background: "var(--surface)",
		color: "var(--text-muted)",
		fontWeight: 700,
		fontSize: 13,
		cursor: "pointer",
		fontFamily: "inherit"
	}
}, Io = {
	contractVersion: 1,
	components: {
		"t2-2": Qa,
		"t2-3": to,
		"t1-2": io,
		"t2-4": so,
		"t3-1": uo,
		"t3-2": mo,
		"t3-3": _o,
		"t3-4": bo,
		"t3-5": Co,
		"t4-1": Eo,
		"t5-1": ko,
		"t1-1": Ao,
		"t2-1": Mo,
		"t1-1_invariant": Po
	}
};
//#endregion
export { Io as default };
