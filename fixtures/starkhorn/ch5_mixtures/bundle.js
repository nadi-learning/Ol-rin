//#region ../tmp/nadi-slides-fd6e4518-99e0-414a-a92e-35da921944c5/react-shim.js
var e = window.__REVISION_REACT__;
if (!e) throw Error("[slide-bundle] window.__REVISION_REACT__ is not set");
var { Children: t, Component: n, Fragment: r, PureComponent: i, StrictMode: a, Suspense: o, cloneElement: s, createContext: c, createElement: l, createRef: u, forwardRef: d, isValidElement: f, lazy: p, memo: m, startTransition: h, useCallback: g, useContext: _, useDebugValue: v, useDeferredValue: y, useEffect: b, useId: x, useImperativeHandle: S, useInsertionEffect: ee, useLayoutEffect: te, useMemo: ne, useReducer: re, useRef: C, useState: w, useSyncExternalStore: ie, useTransition: ae } = e;
//#endregion
//#region ../tmp/nadi-slides-fd6e4518-99e0-414a-a92e-35da921944c5/Slide_t1-1.jsx
function oe(e, t, n) {
	let r = Math.round(e[0] + (t[0] - e[0]) * n), i = Math.round(e[1] + (t[1] - e[1]) * n), a = Math.round(e[2] + (t[2] - e[2]) * n);
	return "rgb(" + r + "," + i + "," + a + ")";
}
function se({ studentName: t }) {
	let n = C(null), r = C(null), i = C({
		x: .15,
		y: .14,
		active: !1
	}), a = C(0), o = C(0), s = C(!1), c = C(!1), l = C(0), [u, d] = w(!1), [f, p] = w(!1), [m, h] = w(!1), g = f && m;
	if (!r.current) {
		let e = [], t = 0;
		for (; e.length < 700;) {
			let n = Math.random() * Math.PI * 2, r = Math.sqrt(Math.random()), i = .5 + Math.cos(n) * .32 * r, a = .55 + Math.sin(n) * .12 * r, o = e.length % 2 == 0 ? "iron" : "sulfur", s = {
				bx: i,
				by: a,
				x: i,
				y: a,
				type: o,
				jx: Math.random() - .5,
				jy: Math.random()
			};
			o === "iron" && (s.pole = t % 2, s.sx = (Math.random() + Math.random() + Math.random() - 1.5) / 1.5, s.sy = Math.random(), t++), e.push(s);
		}
		r.current = e;
	}
	b(() => {
		a.current = +!!u;
	}, [u]), b(() => {
		let e = n.current;
		if (!e) return;
		let t = e.getContext("2d"), s = !0;
		function c() {
			let n = e.getBoundingClientRect(), r = window.devicePixelRatio || 1;
			e.width = n.width * r, e.height = n.height * r, t.setTransform(r, 0, 0, r, 0, 0);
		}
		c();
		let u = new ResizeObserver(c);
		u.observe(e);
		function d() {
			if (!s) return;
			let n = e.clientWidth, c = e.clientHeight;
			o.current += (a.current - o.current) * .06;
			let u = o.current, f = i.current, p = r.current, m = Math.max(30, n * .1) / 2 / n;
			for (let e of p) {
				let t = e.bx, n = e.by;
				if (u < .5 && f.active && e.type === "iron") {
					let r = f.x - e.x, i = f.y - e.y;
					if (Math.hypot(r, i) < .5) {
						let r = f.x + (e.pole === 0 ? -m : m), i = f.y;
						t = r + e.sx * .058, n = i + .004 + e.sy * .046;
					}
				}
				let r = t !== e.bx || n !== e.by ? .22 : .14;
				e.x += (t - e.x) * r, e.y += (n - e.y) * r;
			}
			t.clearRect(0, 0, n, c), t.fillStyle = "#ffffff", t.fillRect(0, 0, n, c);
			let h = .5 * n, g = .6 * c, _ = .4 * n, v = .23 * c;
			if (t.save(), t.shadowColor = "rgba(0,0,0,0.18)", t.shadowBlur = 14, t.shadowOffsetY = 5, t.fillStyle = "#fcfcfe", t.beginPath(), t.ellipse(h, g, _, v, 0, 0, Math.PI * 2), t.fill(), t.restore(), t.beginPath(), t.ellipse(h, g, _, v, 0, 0, Math.PI * 2), t.strokeStyle = "rgba(96,168,138,0.65)", t.lineWidth = 2.6, t.stroke(), t.beginPath(), t.ellipse(h, g, _ - 1.5, v - 1.5, 0, 0, Math.PI * 2), t.strokeStyle = "rgba(150,205,180,0.45)", t.lineWidth = 1, t.stroke(), t.beginPath(), t.ellipse(h, g, _ * .8, v * .8, 0, 0, Math.PI * 2), t.strokeStyle = "rgba(0,0,0,0.08)", t.lineWidth = 1.2, t.stroke(), u > .04) {
				let e = t.createRadialGradient(h, g + v, 2, h, g + v, _);
				e.globalAlpha = u, e.addColorStop(0, "rgba(255,140,40," + .35 * Math.min(1, u * 1.6) + ")"), e.addColorStop(1, "rgba(255,140,40,0)"), t.fillStyle = e, t.beginPath(), t.ellipse(h, g + v, _, v, 0, 0, Math.PI * 2), t.fill();
			}
			for (let e of p) {
				let r = e.x * n, i = e.y * c, a;
				a = e.type === "iron" ? u > .04 ? oe([
					150,
					154,
					160
				], [
					22,
					22,
					26
				], u) : "rgb(150,154,160)" : u > .04 ? oe([
					222,
					196,
					64
				], [
					30,
					26,
					34
				], u) : "rgb(222,196,64)", t.fillStyle = a, t.beginPath(), t.arc(r, i, 2.7, 0, Math.PI * 2), t.fill();
			}
			let y = f.x * n, b = f.y * c, x = Math.max(30, n * .1), S = Math.max(20, c * .085), ee = Math.max(8, n * .022);
			t.save(), t.globalAlpha = f.active ? 1 : .55, t.lineJoin = "round", t.lineCap = "butt", t.beginPath(), t.moveTo(y - x / 2, b), t.lineTo(y - x / 2, b - S), t.arc(y, b - S, x / 2, Math.PI, 0, !1), t.lineTo(y + x / 2, b), t.strokeStyle = "#d83a3a", t.lineWidth = ee, t.stroke(), t.strokeStyle = "#9aa0aa", t.lineWidth = ee, t.beginPath(), t.moveTo(y - x / 2, b - ee * .55), t.lineTo(y - x / 2, b), t.moveTo(y + x / 2, b - ee * .55), t.lineTo(y + x / 2, b), t.stroke(), t.fillStyle = "#1a1f2b", t.font = "bold " + Math.round(ee * .62) + "px Outfit, sans-serif", t.textAlign = "center", t.textBaseline = "middle", t.fillText("N", y - x / 2, b - ee * .27), t.fillText("S", y + x / 2, b - ee * .27), t.restore(), l.current = requestAnimationFrame(d);
		}
		return l.current = requestAnimationFrame(d), () => {
			s = !1, cancelAnimationFrame(l.current), u.disconnect();
		};
	}, []);
	function _(e) {
		let t = n.current;
		if (!t) return;
		let r = t.getBoundingClientRect(), o = (e.clientX - r.left) / r.width, l = (e.clientY - r.top) / r.height, u = i.current;
		u.x = Math.max(.06, Math.min(.94, o)), u.y = Math.max(.05, Math.min(.42, l)), u.active = !0, a.current > .5 ? c.current || (c.current = !0, h(!0)) : s.current || (s.current = !0, p(!0));
	}
	let v;
	return v = !u && !f ? "Step 1 — drag the red magnet across the fresh mixture." : !u && f ? "Observation: the magnet lifts the grey iron out; the sulfur stays put. The iron is still iron." : u && !m ? "Step 2 — energy added. Now drag the magnet over the black solid…" : "Observation: nothing moves. No free iron remains — a brand-new substance has formed.", /* @__PURE__ */ e.createElement(e.Fragment, null, /* @__PURE__ */ e.createElement("div", {
		className: "slide-title",
		style: T.title
	}, "A mixture keeps each part's identity"), /* @__PURE__ */ e.createElement("div", {
		className: "slide-left",
		style: T.left
	}, /* @__PURE__ */ e.createElement("div", { style: T.cardHook }, /* @__PURE__ */ e.createElement("span", { style: T.cornerBadge }, "💭"), /* @__PURE__ */ e.createElement("p", { style: T.epigraph }, "\"The particles of one gas are not affected by the presence of particles of another gas; they form a mixture, yet each acts as a vacuum to the other.\"", /* @__PURE__ */ e.createElement("span", { style: T.epigraphAttr }, "— John Dalton")), /* @__PURE__ */ e.createElement("p", { style: T.hookText }, "If you stir salt into a glass of water it vanishes, yet the first sip and the last sip are equally salty. The salt is hidden, not gone: boil the water off and the salt is left behind, unchanged. Hold on to that picture — you understand more than you think.")), /* @__PURE__ */ e.createElement("div", { style: T.plain }, /* @__PURE__ */ e.createElement("p", { style: T.body }, "In chemistry we are interested in the study of matter and the changes it undergoes. ", /* @__PURE__ */ e.createElement("span", { style: T.defn }, "Matter is anything that occupies space and has mass."), " Matter includes things we can see and touch, as well as things we cannot see. ", /* @__PURE__ */ e.createElement("b", null, "What all forms do we find matter around us in?"))), /* @__PURE__ */ e.createElement("div", { style: T.plain }, /* @__PURE__ */ e.createElement("p", { style: T.body }, /* @__PURE__ */ e.createElement("span", { style: T.defn }, "A ", /* @__PURE__ */ e.createElement("b", null, "substance"), " is a form of matter that has a definite (constant) composition and distinct properties."), " Substances differ from one another in composition and can be identified by their appearance, smell, taste, and other properties."), /* @__PURE__ */ e.createElement("hr", { style: T.hr }), /* @__PURE__ */ e.createElement("p", { style: T.body }, /* @__PURE__ */ e.createElement("span", { style: T.defn }, "A ", /* @__PURE__ */ e.createElement("b", null, "mixture"), " is a combination of two or more substances in which the substances retain their distinct identities."), " Mixtures do not have constant composition — samples of air collected in different cities would probably differ in composition because of differences in altitude, pollution, and so on.")), /* @__PURE__ */ e.createElement("div", { style: T.plain }, /* @__PURE__ */ e.createElement("div", { style: T.hCard }, "What a mixture really is"), /* @__PURE__ */ e.createElement("p", { style: T.body }, /* @__PURE__ */ e.createElement("b", null, "Macroscopic (what you see):"), " two or more substances jumbled together, in ", /* @__PURE__ */ e.createElement("b", null, "no fixed proportion"), "."), /* @__PURE__ */ e.createElement("hr", { style: T.hr }), /* @__PURE__ */ e.createElement("p", { style: T.body }, /* @__PURE__ */ e.createElement("b", null, "Microscopic (what's happening):"), " every particle ", /* @__PURE__ */ e.createElement("b", null, "keeps all its own properties"), ". The components only share a space — none of them stops being itself.")), /* @__PURE__ */ e.createElement("div", { style: T.plain }, /* @__PURE__ */ e.createElement("div", { style: T.hCard }, "Worked test: is it a mixture?"), /* @__PURE__ */ e.createElement("p", { style: T.body }, /* @__PURE__ */ e.createElement("b", null, "Strategy:"), " pick a property only one part has. Iron is magnetic; sulfur is not."), /* @__PURE__ */ e.createElement("hr", { style: T.hr }), /* @__PURE__ */ e.createElement("p", { style: T.body }, /* @__PURE__ */ e.createElement("b", null, "Solution:")), /* @__PURE__ */ e.createElement("ol", { style: T.steps }, /* @__PURE__ */ e.createElement("li", null, "Mix iron filings + sulfur powder."), /* @__PURE__ */ e.createElement("li", null, "Bring a magnet close."), /* @__PURE__ */ e.createElement("li", null, "The iron lifts out — proof it is ", /* @__PURE__ */ e.createElement("i", null, "still iron"), "."))), g ? /* @__PURE__ */ e.createElement("div", { style: T.cardInsight }, /* @__PURE__ */ e.createElement("span", { style: T.cornerBadge }, "💡"), /* @__PURE__ */ e.createElement("p", { style: T.body }, "Energy drove a reaction. ", /* @__PURE__ */ e.createElement("b", null, "Macroscopically"), " you now have a black solid; ", /* @__PURE__ */ e.createElement("b", null, "microscopically"), " the atoms are locked into ", /* @__PURE__ */ e.createElement("b", null, "iron sulfide"), " — neither magnetic iron nor yellow sulfur. The parts ", /* @__PURE__ */ e.createElement("b", null, "surrendered their identities"), ": that is a ", /* @__PURE__ */ e.createElement("b", null, "compound"), ", and the magnet grabs nothing.")) : /* @__PURE__ */ e.createElement("div", { style: T.plain }, /* @__PURE__ */ e.createElement("div", { style: T.hLockedRow }, /* @__PURE__ */ e.createElement("span", null, "🔒"), /* @__PURE__ */ e.createElement("span", { style: T.hLocked }, "What happens if you add energy?")), /* @__PURE__ */ e.createElement("p", { style: T.lockedText }, "Run the test on both the fresh dish and the heated dish to unlock this step →")), /* @__PURE__ */ e.createElement("div", { style: T.cardPitfall }, /* @__PURE__ */ e.createElement("span", { style: T.cornerBadge }, "⚠️"), /* @__PURE__ */ e.createElement("p", { style: T.body }, "Classify by ", /* @__PURE__ */ e.createElement("b", null, "what happened to the parts"), ", not by appearance. Train your eye to ask \"did the parts react?\" — not \"does it look uniform?\" A perfectly uniform material (salt-water, brass) can still be a mixture."))), /* @__PURE__ */ e.createElement("div", {
		className: "slide-right",
		style: T.right
	}, /* @__PURE__ */ e.createElement("div", { style: T.panelTitle }, "Iron + sulfur: drag the magnet"), /* @__PURE__ */ e.createElement("canvas", {
		ref: n,
		style: {
			...T.canvas,
			outline: g ? "2px solid var(--primary)" : "1px solid var(--border)"
		},
		onPointerDown: _,
		onPointerMove: (e) => {
			(e.buttons === 1 || e.pointerType === "mouse") && _(e);
		},
		onPointerLeave: () => {
			i.current.active = !1;
		}
	}), /* @__PURE__ */ e.createElement("div", { style: T.photoWrap }, /* @__PURE__ */ e.createElement("img", {
		src: "https://starkhorn.nadilearning.com/files/slide-assets/b7953a8a-5277-46bd-aec3-8bc8576a1f49/f0e86dde-9e8f-4b60-bfd7-ade7789a8503.jpg",
		alt: "Watch glasses holding yellow sulfur powder and grey iron filings",
		style: T.photo
	})), /* @__PURE__ */ e.createElement("div", { style: T.legendRow }, /* @__PURE__ */ e.createElement("span", { style: T.legend }, /* @__PURE__ */ e.createElement("span", { style: {
		...T.dot,
		background: "rgb(222,196,64)"
	} }), "sulfur powder (left)"), /* @__PURE__ */ e.createElement("span", { style: T.legend }, /* @__PURE__ */ e.createElement("span", { style: {
		...T.dot,
		background: "rgb(150,154,160)"
	} }), "iron filings (right)")), /* @__PURE__ */ e.createElement("div", { style: T.caption }, v), /* @__PURE__ */ e.createElement("button", {
		style: u ? T.btnAlt : T.btn,
		onClick: () => d((e) => !e)
	}, u ? "↺ Reset to fresh mixture" : "🔥 Heat the dish"), /* @__PURE__ */ e.createElement("div", { style: T.videoLabel }, "Watch: iron + sulfur in the lab"), /* @__PURE__ */ e.createElement("div", { style: T.videoWrap }, /* @__PURE__ */ e.createElement("iframe", {
		style: T.video,
		src: "https://www.youtube.com/embed/SAL21S-zgpc",
		title: "Iron and sulfur reaction",
		allow: "accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture",
		allowFullScreen: !0
	}))));
}
var ce = {
	position: "relative",
	borderRadius: 10,
	padding: "26px 18px 14px"
}, T = {
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
		gap: 16,
		minWidth: 0
	},
	plain: {
		padding: "2px 2px",
		minWidth: 0
	},
	cornerBadge: {
		position: "absolute",
		top: 8,
		right: 12,
		fontSize: 18,
		lineHeight: 1
	},
	cardHook: {
		...ce,
		background: "var(--hook-soft)",
		borderLeft: "2px solid var(--hook)"
	},
	cardInsight: {
		...ce,
		background: "var(--primary-softer)",
		border: "1px solid var(--primary-soft)",
		borderLeft: "2px solid var(--primary)"
	},
	cardPitfall: {
		...ce,
		background: "var(--accent-soft)",
		borderLeft: "2px solid var(--accent)"
	},
	hCard: {
		fontSize: 14,
		fontWeight: 700,
		color: "var(--primary)",
		marginBottom: 8
	},
	hLockedRow: {
		display: "flex",
		alignItems: "center",
		gap: 8,
		marginBottom: 6
	},
	hLocked: {
		fontSize: 14,
		fontWeight: 700,
		color: "var(--text-muted)"
	},
	epigraph: {
		fontSize: 14,
		lineHeight: 1.55,
		color: "var(--hook-text)",
		fontStyle: "italic",
		fontWeight: 600,
		margin: "0 0 10px",
		paddingBottom: 10,
		borderBottom: "1px solid var(--border-light)"
	},
	epigraphAttr: {
		display: "block",
		fontSize: 12,
		fontWeight: 600,
		fontStyle: "normal",
		color: "var(--text-muted)",
		marginTop: 4,
		textAlign: "right"
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
		margin: "0 0 4px"
	},
	steps: {
		fontSize: 15,
		lineHeight: 1.6,
		color: "var(--text-primary)",
		margin: "4px 0 8px",
		paddingLeft: 20
	},
	hr: {
		border: "none",
		borderTop: "1px solid var(--border-light)",
		margin: "10px 0"
	},
	defn: {
		fontFamily: "Georgia, \"Times New Roman\", serif",
		fontStyle: "italic"
	},
	formula: {
		textAlign: "center",
		fontFamily: "monospace",
		fontWeight: 700,
		fontSize: 18,
		color: "var(--text-primary)",
		background: "var(--surface)",
		border: "1px solid var(--border-light)",
		borderRadius: 8,
		padding: "10px 14px",
		margin: "8px 0 10px"
	},
	lockedText: {
		fontSize: 14,
		lineHeight: 1.55,
		color: "var(--text-muted)",
		margin: 0,
		fontStyle: "italic"
	},
	panelTitle: {
		fontSize: 16,
		fontWeight: 700,
		color: "var(--text-primary)"
	},
	canvas: {
		width: "100%",
		aspectRatio: "4 / 3",
		maxHeight: "40vh",
		display: "block",
		borderRadius: 10,
		touchAction: "none",
		cursor: "grab"
	},
	photoWrap: {
		width: "100%",
		aspectRatio: "16 / 5",
		overflow: "hidden",
		display: "block"
	},
	photo: {
		width: "100%",
		height: "100%",
		objectFit: "cover",
		objectPosition: "center 58%",
		display: "block"
	},
	legendRow: {
		display: "flex",
		gap: 18,
		justifyContent: "center",
		flexWrap: "wrap"
	},
	legend: {
		display: "inline-flex",
		alignItems: "center",
		gap: 6,
		fontSize: 13,
		color: "var(--text-secondary)"
	},
	dot: {
		width: 11,
		height: 11,
		borderRadius: "50%",
		display: "inline-block"
	},
	caption: {
		fontSize: 14,
		lineHeight: 1.5,
		color: "var(--text-secondary)",
		textAlign: "center",
		minHeight: 38
	},
	videoLabel: {
		fontSize: 14,
		fontWeight: 700,
		color: "var(--text-primary)",
		marginTop: 4
	},
	videoWrap: {
		width: "100%",
		aspectRatio: "16 / 9",
		borderRadius: 10,
		overflow: "hidden",
		border: "1px solid var(--border-light)"
	},
	video: {
		width: "100%",
		height: "100%",
		border: "none",
		display: "block"
	},
	btn: {
		width: "100%",
		padding: "12px 16px",
		border: "1px solid var(--accent)",
		background: "var(--accent-soft)",
		color: "var(--accent-text)",
		borderRadius: 10,
		fontSize: 15,
		fontWeight: 700,
		cursor: "pointer",
		fontFamily: "inherit"
	},
	btnAlt: {
		width: "100%",
		padding: "12px 16px",
		border: "1px solid var(--primary)",
		background: "var(--primary-softer)",
		color: "var(--primary)",
		borderRadius: 10,
		fontSize: 15,
		fontWeight: 700,
		cursor: "pointer",
		fontFamily: "inherit"
	}
};
//#endregion
//#region ../tmp/nadi-slides-fd6e4518-99e0-414a-a92e-35da921944c5/Slide_t3-3_cool_or_evaporate.jsx
function le({ studentName: t }) {
	let [n, r] = w("kno3"), [i, a] = w(null), [o, s] = w(!1), [c, l] = w(60), u = C(null), d = C(null), f = C(!1), p = {
		kno3: {
			name: "Potassium nitrate",
			hot: 110,
			cold: 32,
			color: "#3b82f6",
			steep: !0
		},
		nacl: {
			name: "Common salt",
			hot: 37,
			cold: 36,
			color: "#f59e0b",
			steep: !1
		}
	}[n], m = p.hot - p.cold, h = p.steep ? "cool" : "evaporate", g = (e) => {
		let t = (e - 20) / 40;
		return p.cold + (p.hot - p.cold) * (t < 0 ? 0 : t) ** (p.steep ? 1.2 : 1);
	}, _ = Math.round(g(c)), v = (e) => {
		r(e), a(null), s(!1), l(60);
	}, y = (e) => {
		o || (a(e), s(!0));
	}, x = (e) => {
		let t = u.current, n = d.current;
		if (!t || !n) return;
		let r = e - t.getBoundingClientRect().left, i = n.tMin + (r - n.padL) / n.plotW * (n.tMax - n.tMin);
		i = Math.max(20, Math.min(60, Math.round(i))), l(i);
	}, S = (e) => {
		f.current = !0, x(e.clientX);
	}, ee = (e) => {
		f.current && x(e.clientX);
	}, te = () => {
		f.current = !1;
	};
	b(() => {
		let e = u.current;
		if (!e) return;
		let t = e.getContext("2d"), n = () => {
			let n = e.getBoundingClientRect(), r = window.devicePixelRatio || 1;
			e.width = n.width * r, e.height = n.height * r, t.setTransform(r, 0, 0, r, 0, 0);
			let i = e.clientWidth, a = e.clientHeight;
			t.clearRect(0, 0, i, a);
			let s = i - 44 - 16, l = a - 16 - 30;
			d.current = {
				padL: 44,
				plotW: s,
				tMin: 10,
				tMax: 70
			};
			let u = (e) => 44 + (e - 10) / 60 * s, f = (e) => 16 + (1 - e / 120) * l;
			t.fillStyle = "#f1f8f1", t.fillRect(44, 16, s, l), t.strokeStyle = "#d8ecd8", t.lineWidth = 1;
			for (let e = 0; e <= 120; e += 10) t.beginPath(), t.moveTo(44, f(e)), t.lineTo(44 + s, f(e)), t.stroke();
			for (let e = 10; e <= 70; e += 5) t.beginPath(), t.moveTo(u(e), 16), t.lineTo(u(e), 16 + l), t.stroke();
			t.strokeStyle = "#b6dcb6", t.fillStyle = "#5e8a5e", t.font = "10px Outfit, sans-serif", t.textAlign = "right", t.textBaseline = "middle";
			for (let e = 0; e <= 120; e += 40) t.beginPath(), t.moveTo(44, f(e)), t.lineTo(44 + s, f(e)), t.stroke(), t.fillText(String(e), 38, f(e));
			t.textAlign = "center", t.textBaseline = "top";
			for (let e = 20; e <= 60; e += 20) t.beginPath(), t.moveTo(u(e), 16), t.lineTo(u(e), 16 + l), t.stroke(), t.fillText(e + "°", u(e), 16 + l + 5);
			t.textBaseline = "alphabetic", t.strokeStyle = "#9ac79a", t.lineWidth = 1, t.beginPath(), t.moveTo(44, 16), t.lineTo(44, 16 + l), t.lineTo(44 + s, 16 + l), t.stroke(), t.fillStyle = "#5e8a5e", t.font = "11px Outfit, sans-serif", t.textAlign = "center", t.fillText("Temperature (°C)", 44 + s / 2, a - 6), t.save(), t.translate(13, 16 + l / 2), t.rotate(-Math.PI / 2), t.fillText("Solubility (g / 100 g)", 0, 0), t.restore(), t.strokeStyle = "#7c3aed", t.lineWidth = 3, t.beginPath();
			for (let e = 20; e <= 60; e += 1) {
				let n = u(e), r = f(g(e));
				e === 20 ? t.moveTo(n, r) : t.lineTo(n, r);
			}
			t.stroke();
			let h = u(c), _ = f(g(c));
			t.strokeStyle = "#c2c8d2", t.setLineDash([3, 3]), t.beginPath(), t.moveTo(h, _), t.lineTo(h, 16 + l), t.stroke(), t.beginPath(), t.moveTo(44, _), t.lineTo(h, _), t.stroke(), t.setLineDash([]), t.fillStyle = "rgba(124,58,237,0.18)", t.beginPath(), t.arc(h, _, 11, 0, Math.PI * 2), t.fill(), t.fillStyle = "#7c3aed", t.beginPath(), t.arc(h, _, 6, 0, Math.PI * 2), t.fill(), t.strokeStyle = "#fff", t.lineWidth = 2, t.stroke(), c >= 59 && (t.fillStyle = "#5a6472", t.font = "600 10px Outfit, sans-serif", t.textAlign = "center", t.fillText("◄ drag me", h, _ - 18));
			let v = (e, n, r, i) => {
				t.font = "700 10px Outfit, sans-serif";
				let a = t.measureText(e).width + 10, o = n - a / 2, s = r - 16 / 2;
				i === "bottom" && (o = n - a / 2, s = r), i === "left" && (o = n - a, s = r - 16 / 2), t.fillStyle = "#7c3aed", t.beginPath(), t.roundRect ? t.roundRect(o, s, a, 16, 4) : t.rect(o, s, a, 16), t.fill(), t.fillStyle = "#ffffff", t.textAlign = "center", t.textBaseline = "middle", t.fillText(e, o + a / 2, s + 16 / 2 + .5);
			};
			if (v(c + "°C", h, 16 + l + 3, "bottom"), v(Math.round(g(c)) + " g", 41, _, "left"), t.textAlign = "left", t.textBaseline = "alphabetic", o) {
				let e = u(20) - 4, n = f(p.hot), r = f(p.cold);
				t.strokeStyle = p.steep ? "#16a34a" : "#94a3b8", t.lineWidth = 2, t.beginPath(), t.moveTo(e, n), t.lineTo(e, r), t.stroke(), t.fillStyle = p.steep ? "#16a34a" : "#94a3b8", t.font = "bold 12px Outfit, sans-serif", t.textAlign = "right", t.fillText(m + " g out", e - 4, (n + r) / 2 + 4);
			}
		};
		n();
		let r = new ResizeObserver(() => n());
		return r.observe(e), () => {
			r.disconnect();
		};
	}, [
		n,
		o,
		c,
		p.cold,
		p.hot,
		p.steep,
		m
	]);
	let ne = i === h;
	return /* @__PURE__ */ e.createElement(e.Fragment, null, /* @__PURE__ */ e.createElement("div", {
		className: "slide-title",
		style: E.title
	}, "Cool It or Boil It? Curve Shape Decides"), /* @__PURE__ */ e.createElement("div", {
		className: "slide-left",
		style: E.left
	}, /* @__PURE__ */ e.createElement("div", { style: E.cardHook }, /* @__PURE__ */ e.createElement("span", { style: E.corner }, "💭"), /* @__PURE__ */ e.createElement("p", { style: E.hookText }, "Here's a puzzle worth pausing on, ", t, ". Sugar is purified by cooling a hot syrup — yet sea salt is made by boiling the water away in shallow pans. Same goal, opposite method. Before reading on, ask yourself: what could make cooling work for one and fail for the other?")), /* @__PURE__ */ e.createElement("div", { style: E.explain }, /* @__PURE__ */ e.createElement("div", { style: E.hCard }, "The deciding question"), /* @__PURE__ */ e.createElement("p", { style: E.body }, "Crystallising by cooling hinges on a single quantity: how far the solubility ceiling drops as the temperature falls. Drag the point along the curve and read its coordinates straight off the axes — no guessing.")), /* @__PURE__ */ e.createElement("div", { style: E.cardInsight }, /* @__PURE__ */ e.createElement("span", { style: E.corner }, "💡"), /* @__PURE__ */ e.createElement("p", { style: E.body }, /* @__PURE__ */ e.createElement("b", null, "Steep curve"), " → the ceiling falls a lot on cooling → crystallise by ", /* @__PURE__ */ e.createElement("b", null, "cooling"), ".", /* @__PURE__ */ e.createElement("br", null), /* @__PURE__ */ e.createElement("b", null, "Flat curve"), " → the ceiling barely moves → cooling does almost nothing → you must ", /* @__PURE__ */ e.createElement("b", null, "evaporate"), " the water instead.")), /* @__PURE__ */ e.createElement("div", { style: E.cardPitfall }, /* @__PURE__ */ e.createElement("span", { style: E.corner }, "⚠️"), /* @__PURE__ */ e.createElement("p", { style: E.body }, "Don't assume \"cooling always drops crystals out.\" It fails for common salt: its curve is nearly flat, so chilling a hot brine yields almost nothing. That is precisely why salt pans evaporate rather than chill."))), /* @__PURE__ */ e.createElement("div", {
		className: "slide-right",
		style: E.right
	}, /* @__PURE__ */ e.createElement("div", { style: E.panelTitle }, "Pick a substance, drag the point, predict the method"), /* @__PURE__ */ e.createElement("div", { style: E.tabs }, /* @__PURE__ */ e.createElement("button", {
		onClick: () => v("kno3"),
		style: {
			...E.tab,
			...n === "kno3" ? E.tabOn : {}
		}
	}, /* @__PURE__ */ e.createElement("img", {
		src: "https://starkhorn.nadilearning.com/files/slide-assets/b7953a8a-5277-46bd-aec3-8bc8576a1f49/7f0b3291-643b-48b1-b651-7e8dbe34c0d7.webp",
		alt: "Potassium nitrate crystals",
		style: {
			...E.tabImg,
			transform: "scale(1.18)"
		}
	}), /* @__PURE__ */ e.createElement("span", { style: E.tabOverlay }), /* @__PURE__ */ e.createElement("span", { style: E.tabText }, "Potassium nitrate")), /* @__PURE__ */ e.createElement("button", {
		onClick: () => v("nacl"),
		style: {
			...E.tab,
			...n === "nacl" ? E.tabOn : {}
		}
	}, /* @__PURE__ */ e.createElement("img", {
		src: "https://starkhorn.nadilearning.com/files/slide-assets/b7953a8a-5277-46bd-aec3-8bc8576a1f49/b07c7b17-250a-40fb-a5b0-cf75aeac8851.jpg",
		alt: "Common salt",
		style: E.tabImg
	}), /* @__PURE__ */ e.createElement("span", { style: E.tabOverlay }), /* @__PURE__ */ e.createElement("span", { style: E.tabText }, "Common salt"))), /* @__PURE__ */ e.createElement("canvas", {
		ref: u,
		style: E.canvas,
		onPointerDown: S,
		onPointerMove: ee,
		onPointerUp: te,
		onPointerLeave: te
	}), /* @__PURE__ */ e.createElement("div", { style: E.readPoint }, "Point on the curve: ", /* @__PURE__ */ e.createElement("b", null, c, " °C"), " → ceiling ", /* @__PURE__ */ e.createElement("b", null, _, " g"), " per 100 g water"), /* @__PURE__ */ e.createElement("div", { style: E.question }, "Your turn to reason like a chemist: to recover ", p.name, " from its hot saturated solution, would you cool it or boil the water off? Read the curve, then commit."), /* @__PURE__ */ e.createElement("div", { style: E.choices }, /* @__PURE__ */ e.createElement("button", {
		onClick: () => y("cool"),
		disabled: o,
		style: {
			...E.choice,
			...i === "cool" ? E.choiceSel : {},
			...o ? E.choiceLock : {}
		}
	}, "❄️ Cool it"), /* @__PURE__ */ e.createElement("button", {
		onClick: () => y("evaporate"),
		disabled: o,
		style: {
			...E.choice,
			...i === "evaporate" ? E.choiceSel : {},
			...o ? E.choiceLock : {}
		}
	}, "🔥 Evaporate")), o ? /* @__PURE__ */ e.createElement("div", { style: {
		...E.verdict,
		background: ne ? "var(--primary-softer)" : "var(--accent-soft)",
		borderColor: ne ? "var(--primary-soft)" : "var(--accent)"
	} }, /* @__PURE__ */ e.createElement("b", null, ne ? "Well reasoned!" : "Let's look again together."), " Here is the working: ", p.name, "'s ceiling goes ", p.hot, " g → ", p.cold, " g at 20 °C, so cooling forces out ", p.hot, " − ", p.cold, " = ", /* @__PURE__ */ e.createElement("b", null, m, " g"), ". ", p.steep ? "A large drop — cooling crystallises it efficiently." : "A tiny drop — cooling is effectively useless here, so you must evaporate water to push it over the ceiling.") : /* @__PURE__ */ e.createElement("div", { style: E.hint }, "🔒 Make your prediction above, then we'll work out how much falls out →")));
}
var ue = {
	background: "var(--surface-raised)",
	border: "1px solid var(--border-light)",
	borderRadius: 10,
	padding: "14px 18px",
	boxSizing: "border-box",
	position: "relative"
}, E = {
	title: {
		fontSize: 22,
		fontWeight: 700,
		color: "var(--text-primary)"
	},
	left: {
		display: "flex",
		flexDirection: "column",
		gap: 14,
		minWidth: 0
	},
	right: {
		display: "flex",
		flexDirection: "column",
		gap: 12,
		minWidth: 0
	},
	corner: {
		position: "absolute",
		top: 10,
		right: 12,
		fontSize: 16,
		lineHeight: 1
	},
	explain: {
		padding: "0 2px",
		minWidth: 0
	},
	card: { ...ue },
	cardHook: {
		...ue,
		background: "var(--hook-soft)",
		borderLeft: "2px solid var(--hook)",
		paddingRight: 36
	},
	cardInsight: {
		...ue,
		background: "var(--primary-softer)",
		borderColor: "var(--primary-soft)",
		borderLeft: "2px solid var(--primary)",
		paddingRight: 36
	},
	cardPitfall: {
		...ue,
		background: "var(--accent-soft)",
		borderLeft: "2px solid var(--accent)",
		paddingRight: 36
	},
	hCard: {
		fontSize: 14,
		fontWeight: 700,
		color: "var(--primary)",
		marginBottom: 8
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
	tabs: {
		display: "flex",
		gap: 10
	},
	tab: {
		position: "relative",
		flex: 1,
		minWidth: 0,
		aspectRatio: "16 / 9",
		padding: 0,
		cursor: "pointer",
		borderRadius: 10,
		border: "2px solid var(--border)",
		background: "var(--surface)",
		overflow: "hidden",
		fontFamily: "inherit"
	},
	tabOn: {
		borderColor: "var(--primary)",
		boxShadow: "0 0 0 2px var(--primary-soft)"
	},
	tabImg: {
		position: "absolute",
		inset: 0,
		width: "100%",
		height: "100%",
		objectFit: "cover",
		display: "block"
	},
	tabOverlay: {
		position: "absolute",
		inset: 0,
		background: "linear-gradient(to top, rgba(0,0,0,0.65) 0%, rgba(0,0,0,0.15) 55%, rgba(0,0,0,0) 100%)"
	},
	tabText: {
		position: "absolute",
		left: 0,
		right: 0,
		bottom: 6,
		padding: "0 6px",
		textAlign: "center",
		fontSize: 16,
		fontWeight: 700,
		color: "#ffffff",
		textShadow: "0 1px 3px rgba(0,0,0,0.8)"
	},
	canvas: {
		width: "100%",
		aspectRatio: "4 / 3",
		maxHeight: "34vh",
		display: "block",
		background: "var(--surface)",
		border: "1px solid var(--border-light)",
		borderRadius: 8,
		touchAction: "none",
		cursor: "pointer"
	},
	readPoint: {
		fontSize: 13,
		fontWeight: 600,
		color: "var(--text-secondary)",
		textAlign: "center"
	},
	question: {
		fontSize: 14,
		fontWeight: 600,
		color: "var(--text-primary)",
		lineHeight: 1.5
	},
	choices: {
		display: "flex",
		gap: 8
	},
	choice: {
		flex: 1,
		minWidth: 0,
		padding: "12px 10px",
		fontSize: 14,
		fontWeight: 700,
		fontFamily: "inherit",
		cursor: "pointer",
		borderRadius: 8,
		border: "1px solid var(--border)",
		background: "var(--surface)",
		color: "var(--text-primary)"
	},
	choiceSel: {
		borderColor: "var(--primary)",
		boxShadow: "0 0 0 2px var(--primary-soft)"
	},
	choiceLock: {
		cursor: "default",
		opacity: .9
	},
	verdict: {
		fontSize: 14,
		lineHeight: 1.55,
		color: "var(--text-primary)",
		border: "1px solid",
		borderRadius: 8,
		padding: "12px 14px"
	},
	hint: {
		fontSize: 13,
		color: "var(--text-muted)",
		textAlign: "center",
		padding: "8px 0"
	}
};
//#endregion
//#region ../tmp/nadi-slides-fd6e4518-99e0-414a-a92e-35da921944c5/Slide_t3-3_why_pure.jsx
function de({ studentName: t }) {
	let [n, r] = w(60), i = C(60), a = C(null), o = C(null), s = C(0), c = C(null), l = C(!1), u = (e) => {
		let t = c.current;
		if (!t) return;
		let n = t.getBoundingClientRect(), i = (n.bottom - e) / n.height;
		i = Math.max(0, Math.min(1, i)), r(Math.round(20 + i * 40));
	}, d = (e) => {
		l.current = !0, u(e.clientY);
	}, f = (e) => {
		l.current && u(e.clientY);
	}, p = () => {
		l.current = !1;
	}, m = Math.round(((e) => 180 + (e - 20) / 40 * 107)(n)), h = Math.max(0, 287 - m);
	return b(() => {
		i.current = n;
	}, [n]), b(() => {
		let e = [];
		for (let t = 0; t < 64; t++) e.push({
			nx: .14 + Math.random() * .72,
			ny: .18 + Math.random() * .5,
			ph: Math.random() * Math.PI * 2,
			x: 0,
			y: 0,
			init: !1
		});
		let t = [];
		for (let e = 0; e < 7; e++) t.push({
			nx: .06 + Math.random() * .88,
			ny: .04 + Math.random() * .92,
			ph: Math.random() * Math.PI * 2,
			x: 0,
			y: 0,
			init: !1
		});
		o.current = {
			sugar: e,
			imp: t,
			SUGAR: 64,
			IMP: 7
		};
	}, []), b(() => {
		let e = a.current;
		if (!e) return;
		let t = e.getContext("2d"), n = !1, r = () => {
			let n = e.getBoundingClientRect(), r = window.devicePixelRatio || 1;
			e.width = n.width * r, e.height = n.height * r, t.setTransform(r, 0, 0, r, 0, 0);
		};
		r();
		let c = new ResizeObserver(r);
		c.observe(e);
		let l = () => {
			if (n) return;
			let r = e.clientWidth, a = e.clientHeight, c = o.current;
			if (!r || !a || !c) {
				s.current = requestAnimationFrame(l);
				return;
			}
			let u = i.current;
			t.clearRect(0, 0, r, a);
			let d = r * .1, f = r * .8, p = a * .1, m = a * .92, h = a * .2, g = performance.now() / 1e3, _ = 180 + (u - 20) / 40 * 107, v = Math.max(0, 287 - _) / 287, y = Math.round(c.SUGAR * v);
			t.fillStyle = "#dff0fb", t.beginPath(), t.moveTo(d, h), t.lineTo(d + f, h), t.lineTo(d + f, m), t.lineTo(d, m), t.closePath(), t.fill();
			let b = f / 10, x = Math.min(b * .62, 9), S = (e) => {
				let t = Math.floor(e / 9);
				return {
					x: d + b * (e % 9 + 1) + (t % 2 ? b * .35 : 0),
					y: m - x * .9 - t * x * 1.35
				};
			}, ee = c.sugar;
			for (let e = 0; e < ee.length; e++) {
				let n = ee[e], r, i;
				if (e < y) {
					let t = S(e);
					r = t.x, i = t.y;
				} else r = d + n.nx * f, i = h + n.ny * (m - h) + Math.sin(g * 1.3 + n.ph) * 4;
				n.init ||= (n.x = d + n.nx * f, n.y = h + n.ny * (m - h), !0), n.x += (r - n.x) * .08, n.y += (i - n.y) * .08;
				let a = e < y;
				t.beginPath(), a ? (t.fillStyle = "#e6a417", t.fillRect(n.x - x / 2, n.y - x / 2, x, x), t.strokeStyle = "#b87d08", t.lineWidth = 1, t.strokeRect(n.x - x / 2, n.y - x / 2, x, x)) : (t.fillStyle = "rgba(230,164,23,0.85)", t.arc(n.x, n.y, 3.4, 0, Math.PI * 2), t.fill());
			}
			let te = c.imp;
			for (let e = 0; e < te.length; e++) {
				let n = te[e], r = d + (n.nx + Math.sin(g * .5 + n.ph) * .05) * f, i = h + n.ny * (m - h) + Math.cos(g * .9 + n.ph) * 8;
				r = Math.max(d + 6, Math.min(d + f - 6, r)), i = Math.max(h + 6, Math.min(m - 6, i)), n.init ||= (n.x = d + n.nx * f, n.y = h + n.ny * (m - h), !0), n.x += (r - n.x) * .05, n.y += (i - n.y) * .05, t.beginPath(), t.fillStyle = "#c0399b", t.arc(n.x, n.y, 4.2, 0, Math.PI * 2), t.fill();
			}
			t.strokeStyle = "#7a8aa0", t.lineWidth = 2.5, t.beginPath(), t.moveTo(d, p), t.lineTo(d, m), t.lineTo(d + f, m), t.lineTo(d + f, p), t.stroke(), s.current = requestAnimationFrame(l);
		};
		return s.current = requestAnimationFrame(l), () => {
			n = !0, cancelAnimationFrame(s.current), c.disconnect();
		};
	}, []), /* @__PURE__ */ e.createElement(e.Fragment, null, /* @__PURE__ */ e.createElement("div", {
		className: "slide-title",
		style: D.title
	}, "Why the Crystals Come Out Pure"), /* @__PURE__ */ e.createElement("div", {
		className: "slide-left",
		style: D.left
	}, /* @__PURE__ */ e.createElement("div", { style: D.cardHook }, /* @__PURE__ */ e.createElement("span", { style: D.corner }, "💭"), /* @__PURE__ */ e.createElement("p", { style: D.hookText }, "Here's a genuinely clever result, ", t, ". Macroscopically your sugar solution is dirty — a little coloured impurity is stirred through it. You cool it, crystals drop out... and they come out clean white, not stained. How can a dirty liquid hand you a pure solid? Let's reason it out.")), /* @__PURE__ */ e.createElement("div", { style: D.explain }, /* @__PURE__ */ e.createElement("div", { style: D.hCard }, "Step 1 — Ask: who is at their ceiling?"), /* @__PURE__ */ e.createElement("p", { style: D.body }, "The sugar is ", /* @__PURE__ */ e.createElement("b", null, "saturated"), " — packed right up to its ceiling. Cool it and the ceiling drops below what's held, so the excess has nowhere to stay and crystallises out."), /* @__PURE__ */ e.createElement("p", { style: D.body }, "The impurity is only a pinch — 5 g, where its own ceiling sits near 210 g. It is ", /* @__PURE__ */ e.createElement("b", null, "nowhere near"), " saturated, so cooling never forces it out. Microscopically, those particles keep drifting freely in the liquid.")), /* @__PURE__ */ e.createElement("div", { style: D.cardInsight }, /* @__PURE__ */ e.createElement("span", { style: D.corner }, "💡"), /* @__PURE__ */ e.createElement("p", { style: D.body }, "So crystallisation ", /* @__PURE__ */ e.createElement("b", null, "separates"), ": only the saturated component is pushed out, leaving the solid purer than the mixture you began with. The impurity stays behind, dissolved.")), /* @__PURE__ */ e.createElement("div", { style: D.cardSurprise }, /* @__PURE__ */ e.createElement("span", { style: D.corner }, "🤯"), /* @__PURE__ */ e.createElement("p", { style: D.body }, "Rock candy grows pure sugar crystals on a string. A sugar refinery cools its syrup to crystallise clean sugar and leaves the brown molasses behind. Same logic each time: only what is over its ceiling drops out.")), /* @__PURE__ */ e.createElement("div", { style: D.cardPitfall }, /* @__PURE__ */ e.createElement("span", { style: D.corner }, "⚠️"), /* @__PURE__ */ e.createElement("p", { style: D.body }, "To be rigorous: this purifies only while the impurity stays well ", /* @__PURE__ */ e.createElement("i", null, "below"), " its ceiling. An impurity that is itself saturated would crystallise alongside the sugar."))), /* @__PURE__ */ e.createElement("div", {
		className: "slide-right",
		style: D.right
	}, /* @__PURE__ */ e.createElement("div", { style: D.panelTitle }, "Cool the dirty solution"), /* @__PURE__ */ e.createElement("div", { style: D.stage }, /* @__PURE__ */ e.createElement("canvas", {
		ref: a,
		style: D.canvas
	}), /* @__PURE__ */ e.createElement("div", {
		style: D.thermo,
		onPointerDown: d,
		onPointerMove: f,
		onPointerUp: p,
		onPointerLeave: p
	}, /* @__PURE__ */ e.createElement("div", {
		ref: c,
		style: D.tube
	}, /* @__PURE__ */ e.createElement("div", { style: {
		...D.fill,
		height: (n - 20) / 40 * 100 + "%"
	} })), /* @__PURE__ */ e.createElement("div", { style: D.bulb }, /* @__PURE__ */ e.createElement("span", { style: D.bulbText }, n, "°")), /* @__PURE__ */ e.createElement("div", { style: D.thermoTicks }, /* @__PURE__ */ e.createElement("span", null, "60°"), /* @__PURE__ */ e.createElement("span", null, "40°"), /* @__PURE__ */ e.createElement("span", null, "20°")))), /* @__PURE__ */ e.createElement("div", { style: D.legend }, /* @__PURE__ */ e.createElement("span", { style: D.legItem }, /* @__PURE__ */ e.createElement("span", { style: {
		...D.dot,
		background: "#e6a417"
	} }), "Sugar (saturated, 287 g)"), /* @__PURE__ */ e.createElement("span", { style: D.legItem }, /* @__PURE__ */ e.createElement("span", { style: {
		...D.dot,
		background: "#c0399b"
	} }), "Impurity (5 g)")), /* @__PURE__ */ e.createElement("div", { style: D.thermoHint }, /* @__PURE__ */ e.createElement("b", null, "Drag the mercury"), " up or down to set the temperature. Cool it and watch which particles are forced out."), /* @__PURE__ */ e.createElement("div", { style: D.readGrid }, /* @__PURE__ */ e.createElement("div", { style: D.readBox }, /* @__PURE__ */ e.createElement("div", { style: D.readLabel }, "Sugar ceiling"), /* @__PURE__ */ e.createElement("div", { style: D.readVal }, m, " g"), /* @__PURE__ */ e.createElement("div", { style: D.readSub }, "holds 287 g → ", h, " g forced out")), /* @__PURE__ */ e.createElement("div", { style: D.readBox }, /* @__PURE__ */ e.createElement("div", { style: D.readLabel }, "Impurity ceiling"), /* @__PURE__ */ e.createElement("div", { style: D.readVal }, 210, " g"), /* @__PURE__ */ e.createElement("div", { style: D.readSub }, "only ", 5, " g present → 0 g out"))), /* @__PURE__ */ e.createElement("div", { style: {
		...D.verdict,
		background: h > 0 ? "var(--primary-softer)" : "var(--surface)",
		borderColor: h > 0 ? "var(--primary-soft)" : "var(--border-light)"
	} }, h > 0 ? "Watch closely: pure sugar crystals are dropping out while the coloured impurity keeps drifting, dissolved. That is separation in action." : "At 60 °C nothing sits above its ceiling yet. Cool it down step by step and watch which particles are forced out.")));
}
var fe = {
	background: "var(--surface-raised)",
	border: "1px solid var(--border-light)",
	borderRadius: 10,
	padding: "14px 18px",
	boxSizing: "border-box",
	position: "relative"
}, D = {
	title: {
		fontSize: 22,
		fontWeight: 700,
		color: "var(--text-primary)"
	},
	left: {
		display: "flex",
		flexDirection: "column",
		gap: 14,
		minWidth: 0
	},
	right: {
		display: "flex",
		flexDirection: "column",
		gap: 12,
		minWidth: 0
	},
	corner: {
		position: "absolute",
		top: 10,
		right: 12,
		fontSize: 16,
		lineHeight: 1
	},
	explain: {
		padding: "0 2px",
		minWidth: 0
	},
	card: { ...fe },
	cardHook: {
		...fe,
		background: "var(--hook-soft)",
		borderLeft: "2px solid var(--hook)",
		paddingRight: 36
	},
	cardInsight: {
		...fe,
		background: "var(--primary-softer)",
		borderColor: "var(--primary-soft)",
		borderLeft: "2px solid var(--primary)",
		paddingRight: 36
	},
	cardPitfall: {
		...fe,
		background: "var(--accent-soft)",
		borderLeft: "2px solid var(--accent)",
		paddingRight: 36
	},
	cardSurprise: {
		...fe,
		background: "var(--surprise-soft)",
		borderLeft: "2px solid var(--surprise)",
		paddingRight: 36
	},
	hCard: {
		fontSize: 14,
		fontWeight: 700,
		color: "var(--primary)",
		marginBottom: 8
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
		margin: "0 0 8px"
	},
	panelTitle: {
		fontSize: 16,
		fontWeight: 700,
		color: "var(--text-primary)"
	},
	stage: {
		display: "flex",
		gap: 14,
		alignItems: "center",
		minWidth: 0
	},
	canvas: {
		flex: 1,
		minWidth: 0,
		width: "100%",
		aspectRatio: "4 / 3",
		maxHeight: "40vh",
		display: "block",
		background: "var(--surface)",
		border: "1px solid var(--border-light)",
		borderRadius: 10
	},
	legend: {
		display: "flex",
		gap: 16,
		flexWrap: "wrap",
		justifyContent: "center",
		fontSize: 13,
		color: "var(--text-secondary)"
	},
	legItem: {
		display: "inline-flex",
		alignItems: "center",
		gap: 6
	},
	dot: {
		width: 12,
		height: 12,
		borderRadius: "50%",
		display: "inline-block"
	},
	thermoRow: {
		display: "flex",
		gap: 30,
		alignItems: "center",
		justifyContent: "center",
		padding: "6px 0 2px"
	},
	thermo: {
		position: "relative",
		flexShrink: 0,
		minWidth: 56,
		paddingRight: 24,
		display: "flex",
		flexDirection: "column",
		alignItems: "center",
		alignSelf: "center",
		cursor: "pointer",
		touchAction: "none",
		userSelect: "none"
	},
	tube: {
		position: "relative",
		width: 16,
		height: 150,
		background: "var(--surface)",
		border: "2px solid var(--border)",
		borderBottom: "none",
		borderRadius: "9px 9px 0 0",
		boxSizing: "border-box",
		overflow: "hidden"
	},
	fill: {
		position: "absolute",
		left: 0,
		right: 0,
		bottom: 0,
		background: "linear-gradient(to top, #e3342f, #ff7a6b)"
	},
	bulb: {
		width: 34,
		height: 34,
		borderRadius: "50%",
		background: "#e3342f",
		border: "2px solid #c1271f",
		marginTop: -4,
		display: "flex",
		alignItems: "center",
		justifyContent: "center",
		boxShadow: "0 1px 4px rgba(0,0,0,0.25)"
	},
	bulbText: {
		fontSize: 11,
		fontWeight: 700,
		color: "#fff"
	},
	thermoTicks: {
		position: "absolute",
		left: 28,
		top: 0,
		height: 150,
		display: "flex",
		flexDirection: "column",
		justifyContent: "space-between",
		fontSize: 11,
		color: "var(--text-muted)",
		fontWeight: 600
	},
	thermoHint: {
		fontSize: 13,
		color: "var(--text-secondary)",
		lineHeight: 1.5,
		textAlign: "center"
	},
	readGrid: {
		display: "flex",
		gap: 10
	},
	readBox: {
		flex: 1,
		minWidth: 0,
		background: "var(--surface)",
		border: "1px solid var(--border-light)",
		borderRadius: 8,
		padding: "10px 12px",
		textAlign: "center"
	},
	readLabel: {
		fontSize: 12,
		color: "var(--text-muted)",
		fontWeight: 600
	},
	readVal: {
		fontSize: 22,
		fontWeight: 700,
		color: "var(--text-primary)",
		fontFamily: "monospace"
	},
	readSub: {
		fontSize: 11.5,
		color: "var(--text-secondary)",
		marginTop: 2,
		lineHeight: 1.4
	},
	verdict: {
		fontSize: 14,
		fontWeight: 600,
		color: "var(--text-primary)",
		textAlign: "center",
		border: "1px solid",
		borderRadius: 8,
		padding: "10px 12px"
	}
}, pe = {
	label: "Crude oil",
	unit: "°C",
	tBottom: 400,
	tTop: 20,
	bands: [
		{
			name: "Refinery gases",
			tMin: -50,
			tMax: 40,
			col: "#7dd3fc"
		},
		{
			name: "Petrol",
			tMin: 40,
			tMax: 110,
			col: "#86efac"
		},
		{
			name: "Kerosene",
			tMin: 110,
			tMax: 250,
			col: "#fde68a"
		},
		{
			name: "Diesel",
			tMin: 250,
			tMax: 350,
			col: "#fdba74"
		},
		{
			name: "Bitumen",
			tMin: 350,
			tMax: 460,
			col: "#c8a07a"
		}
	]
}, me = {
	label: "Liquefied air",
	unit: "°C",
	tBottom: -181,
	tTop: -201,
	bands: [
		{
			name: "Nitrogen",
			tMin: -201,
			tMax: -191,
			col: "#93c5fd"
		},
		{
			name: "Argon",
			tMin: -191,
			tMax: -185,
			col: "#c4b5fd"
		},
		{
			name: "Oxygen",
			tMin: -185,
			tMax: -179,
			col: "#67e8f9"
		}
	]
};
function he(e, t) {
	for (let n = 0; n < e.bands.length; n++) {
		let r = e.bands[n];
		if (t >= r.tMin && t < r.tMax) return r;
	}
	return e.bands[e.bands.length - 1];
}
function ge({ studentName: t }) {
	let [n, r] = w("oil"), [i, a] = w(50), [o, s] = w(!1), [c, l] = w(!1), u = C(null), d = C(i), f = C(n), p = C([]), m = C(0);
	b(() => {
		d.current = i;
	}, [i]), b(() => {
		f.current = n;
	}, [n]);
	let h = n === "oil" ? pe : me, g = i / 100, _ = Math.round(h.tBottom + g * (h.tTop - h.tBottom)), v = he(h, _), y = o && c;
	function x(e) {
		a(e), e >= 88 && s(!0), e <= 12 && l(!0);
	}
	return b(() => {
		let e = u.current;
		if (!e) return;
		let t = e.getContext("2d"), n = performance.now();
		function r() {
			let n = e.getBoundingClientRect(), r = window.devicePixelRatio || 1;
			e.width = n.width * r, e.height = n.height * r, t.setTransform(r, 0, 0, r, 0, 0);
		}
		r();
		function i(r) {
			let a = Math.min(.05, (r - n) / 1e3);
			n = r;
			let o = e.clientWidth, s = e.clientHeight, c = f.current === "oil" ? pe : me, l = d.current / 100;
			t.clearRect(0, 0, o, s);
			let u = s - 26, h = u - 22, g = Math.round(o * .16), _ = Math.round(o * .26), v = t.createLinearGradient(0, u, 0, 22);
			v.addColorStop(0, "#7a2e12"), v.addColorStop(.5, "#a85a1e"), v.addColorStop(1, "#1e3a8a"), t.fillStyle = v, t.fillRect(g, 22, _, h);
			let y = c.tTop - c.tBottom;
			t.font = "600 11px Outfit, sans-serif", t.textBaseline = "middle", c.bands.forEach((e) => {
				let n = ((e.tMin + e.tMax) / 2 - c.tBottom) / y;
				n = Math.max(.04, Math.min(.96, n));
				let r = u - n * h;
				t.strokeStyle = e.col, t.lineWidth = 2, t.beginPath(), t.moveTo(g + _, r), t.lineTo(g + _ + 14, r), t.stroke(), t.fillStyle = e.col, t.beginPath(), t.arc(g + _ + 14, r, 3, 0, Math.PI * 2), t.fill(), t.fillStyle = "#e5e7eb", t.textAlign = "left", t.fillText(e.name, g + _ + 20, r);
			}), t.strokeStyle = "rgba(255,255,255,0.30)", t.lineWidth = 1;
			for (let e = 1; e < 7; e++) {
				let n = u - e / 7 * h;
				t.beginPath(), t.moveTo(g, n), t.lineTo(g + _, n), t.stroke();
			}
			t.fillStyle = "#9ca3af", t.font = "600 10px Outfit, sans-serif", t.textAlign = "right", [
				0,
				.5,
				1
			].forEach((e) => {
				let n = u - e * h, r = Math.round(c.tBottom + e * y);
				t.fillText(r + "°", g - 6, n);
			});
			let b = p.current;
			Math.random() < .45 && b.length < 36 && b.push({
				x: g + _ * (.3 + Math.random() * .4),
				y: u - 2,
				v: 18 + Math.random() * 14,
				ph: Math.random() * 6.28
			});
			for (let e = b.length - 1; e >= 0; e--) {
				let n = b[e];
				n.y -= n.v * a, n.x += Math.sin(n.y * .06 + n.ph) * .5;
				let r = (u - n.y) / h;
				if (r > 1 || n.y < 22) {
					b.splice(e, 1);
					continue;
				}
				t.fillStyle = "hsla(" + (12 + r * 200) + ",85%,65%,0.9)", t.beginPath(), t.arc(n.x, n.y, 2.4, 0, Math.PI * 2), t.fill();
			}
			let x = u - l * h;
			t.strokeStyle = "#fbbf24", t.lineWidth = 2, t.setLineDash([5, 4]), t.beginPath(), t.moveTo(g - 2, x), t.lineTo(g + _ + 2, x), t.stroke(), t.setLineDash([]), t.fillStyle = "#fbbf24", t.beginPath(), t.moveTo(g - 2, x), t.lineTo(g - 12, x - 5), t.lineTo(g - 12, x + 5), t.closePath(), t.fill(), t.strokeStyle = "rgba(255,255,255,0.55)", t.lineWidth = 1.5, t.strokeRect(g, 22, _, h), m.current = requestAnimationFrame(i);
		}
		m.current = requestAnimationFrame(i);
		let a = new ResizeObserver(() => r());
		return a.observe(e), () => {
			cancelAnimationFrame(m.current), a.disconnect();
		};
	}, []), /* @__PURE__ */ e.createElement(e.Fragment, null, /* @__PURE__ */ e.createElement("div", {
		className: "slide-title",
		style: O.title
	}, "Fractional Distillation: The Column"), /* @__PURE__ */ e.createElement("div", {
		className: "slide-left",
		style: O.left
	}, /* @__PURE__ */ e.createElement("div", { style: O.cardHook }, /* @__PURE__ */ e.createElement("span", { style: O.corner }, "💭"), /* @__PURE__ */ e.createElement("p", { style: O.hookText }, t, ", petrol boils at ~70°C and kerosene at ~180°C — comfortably far apart. But picture a pair just 8°C apart. One heat-and-condense gives a muddy mix of both, every single time. So how do we split them cleanly? The answer is genuinely clever — let's build it up together.")), /* @__PURE__ */ e.createElement("div", { style: O.plain }, /* @__PURE__ */ e.createElement("div", { style: O.plainHead }, "A tower of mini-distillations"), /* @__PURE__ */ e.createElement("p", { style: O.body }, "When Δbp < 25°C, send the vapour up a ", /* @__PURE__ */ e.createElement("b", null, "fractionating column"), " packed with trays or beads. On each obstruction it ", /* @__PURE__ */ e.createElement("b", null, "condenses, then re-vaporises"), " — over and over."), /* @__PURE__ */ e.createElement("p", { style: O.body }, "Think of it as a step-by-step ladder: each cycle is one more distillation. The lower-boiling component keeps climbing; the higher-boiling one keeps dripping back down. Many small steps, one clean separation.")), y ? /* @__PURE__ */ e.createElement("div", { style: O.cardInsight }, /* @__PURE__ */ e.createElement("span", { style: O.corner }, "💡"), /* @__PURE__ */ e.createElement("p", { style: O.body }, "Nicely uncovered! ", /* @__PURE__ */ e.createElement("b", null, "Temperature falls as you climb."), " So each height can only hold the fraction that condenses at that temperature — gases at the cool top, bitumen at the hot bottom. In one neat move, the column ", /* @__PURE__ */ e.createElement("i", null, "orders"), " the whole mixture by boiling point.")) : /* @__PURE__ */ e.createElement("div", { style: O.cardLocked }, /* @__PURE__ */ e.createElement("span", { style: O.corner }, "🔒"), /* @__PURE__ */ e.createElement("p", { style: O.bodyMuted }, "Here's your task: drag the tap-off to the very ", /* @__PURE__ */ e.createElement("b", null, "top"), ", then the very ", /* @__PURE__ */ e.createElement("b", null, "bottom"), " of the column. Watch closely — you'll discover for yourself what orders the fractions →")), /* @__PURE__ */ e.createElement("div", { style: O.cardPitfall }, /* @__PURE__ */ e.createElement("span", { style: O.corner }, "⚠️"), /* @__PURE__ */ e.createElement("p", { style: O.body }, "A common trap to sidestep: the column doesn't ", /* @__PURE__ */ e.createElement("i", null, "filter"), " and uses no membrane. Hold onto this — separation comes purely from ", /* @__PURE__ */ e.createElement("b", null, "repeated condensation & vaporisation"), " along a temperature gradient.")), /* @__PURE__ */ e.createElement("div", { style: O.cardSurprise }, /* @__PURE__ */ e.createElement("span", { style: O.corner }, "🤯"), /* @__PURE__ */ e.createElement("p", { style: O.body }, "Worth a pause: the oxygen in COVID cylinders was made in exactly this way — air is ", /* @__PURE__ */ e.createElement("b", null, "liquefied"), ", then warmed in a column. Nitrogen (bp −196°C) boils off first; oxygen (bp −183°C) is left behind. Switch the mode and watch it happen."))), /* @__PURE__ */ e.createElement("div", {
		className: "slide-right",
		style: O.right
	}, /* @__PURE__ */ e.createElement("div", { style: O.toggleRow }, /* @__PURE__ */ e.createElement("button", {
		style: n === "oil" ? O.tabOn : O.tab,
		onClick: () => {
			r("oil"), a(50);
		}
	}, "🛢️ Crude oil"), /* @__PURE__ */ e.createElement("button", {
		style: n === "air" ? O.tabOn : O.tab,
		onClick: () => {
			r("air"), a(50);
		}
	}, "💨 Liquefied air")), /* @__PURE__ */ e.createElement("canvas", {
		ref: u,
		style: O.canvas
	}), /* @__PURE__ */ e.createElement("div", { style: O.readout }, /* @__PURE__ */ e.createElement("span", { style: {
		...O.chip,
		background: v.col,
		color: "#1f2937"
	} }, v.name), /* @__PURE__ */ e.createElement("span", { style: O.readTxt }, "tapped off at ", i, "% up → ", _, h.unit)), /* @__PURE__ */ e.createElement("input", {
		type: "range",
		min: 0,
		max: 100,
		value: i,
		onChange: (e) => x(Number(e.target.value)),
		style: O.slider
	}), /* @__PURE__ */ e.createElement("div", { style: O.sliderLabel }, "Slide the tap-off point up & down the column — explore the cool top and the hot bottom for yourself"), /* @__PURE__ */ e.createElement("div", { style: {
		width: "100%",
		aspectRatio: "16 / 9",
		borderRadius: 10,
		overflow: "hidden",
		border: "1px solid var(--border-light)"
	} }, /* @__PURE__ */ e.createElement("iframe", {
		src: "https://www.youtube.com/embed/ZzVwWoexJf8",
		title: "Fractional distillation video",
		allow: "accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture",
		allowFullScreen: !0,
		style: {
			width: "100%",
			height: "100%",
			border: 0,
			display: "block"
		}
	}))));
}
var _e = {
	background: "var(--surface-raised)",
	border: "1px solid var(--border-light)",
	borderRadius: 10,
	padding: "14px 18px",
	position: "relative",
	paddingRight: 44
}, O = {
	title: {
		fontSize: 22,
		fontWeight: 700,
		color: "var(--text-primary)"
	},
	left: {
		display: "flex",
		flexDirection: "column",
		gap: 14,
		minWidth: 0
	},
	right: {
		display: "flex",
		flexDirection: "column",
		gap: 12,
		minWidth: 0
	},
	corner: {
		position: "absolute",
		top: 12,
		right: 14,
		fontSize: 16,
		lineHeight: 1
	},
	cardHook: {
		..._e,
		background: "var(--hook-soft)",
		borderLeft: "2px solid var(--hook)"
	},
	cardInsight: {
		..._e,
		background: "var(--primary-softer)",
		borderColor: "var(--primary-soft)",
		borderLeft: "2px solid var(--primary)"
	},
	cardLocked: {
		..._e,
		background: "var(--surface)",
		borderStyle: "dashed"
	},
	cardPitfall: {
		..._e,
		background: "var(--accent-soft)",
		borderLeft: "2px solid var(--accent)"
	},
	cardSurprise: {
		..._e,
		background: "var(--surprise-soft)",
		borderLeft: "2px solid var(--surprise)"
	},
	plain: {
		display: "flex",
		flexDirection: "column",
		gap: 8,
		padding: "0 2px"
	},
	plainHead: {
		fontSize: 15,
		fontWeight: 700,
		color: "var(--primary)"
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
		margin: 0
	},
	toggleRow: {
		display: "flex",
		gap: 8
	},
	tab: {
		flex: 1,
		padding: "9px 8px",
		borderRadius: 8,
		border: "1px solid var(--border)",
		background: "var(--surface)",
		color: "var(--text-secondary)",
		fontSize: 13,
		fontWeight: 600,
		fontFamily: "Outfit, sans-serif",
		cursor: "pointer"
	},
	tabOn: {
		flex: 1,
		padding: "9px 8px",
		borderRadius: 8,
		border: "1px solid var(--primary)",
		background: "var(--primary-softer)",
		color: "var(--primary)",
		fontSize: 13,
		fontWeight: 700,
		fontFamily: "Outfit, sans-serif",
		cursor: "pointer"
	},
	canvas: {
		width: "100%",
		aspectRatio: "3 / 4",
		maxHeight: "46vh",
		display: "block",
		background: "#0f172a",
		borderRadius: 10,
		border: "1px solid var(--border-light)"
	},
	readout: {
		display: "flex",
		alignItems: "center",
		gap: 10,
		flexWrap: "wrap",
		minWidth: 0
	},
	chip: {
		fontSize: 13,
		fontWeight: 700,
		padding: "4px 10px",
		borderRadius: 6
	},
	readTxt: {
		fontSize: 14,
		fontWeight: 600,
		color: "var(--text-secondary)"
	},
	slider: {
		width: "100%",
		accentColor: "var(--primary)"
	},
	sliderLabel: {
		fontSize: 12,
		color: "var(--text-muted)",
		textAlign: "center"
	}
};
//#endregion
//#region ../tmp/nadi-slides-fd6e4518-99e0-414a-a92e-35da921944c5/Slide_t5-5_centrifugation.jsx
function ve({ studentName: t }) {
	let [n, r] = w(0), i = Math.round(n / 4e3 * (n / 4e3) * 1800);
	return /* @__PURE__ */ e.createElement(e.Fragment, null, /* @__PURE__ */ e.createElement("div", {
		className: "slide-title",
		style: k.title
	}, "Centrifugation: Density on Fast-Forward"), /* @__PURE__ */ e.createElement("div", {
		className: "slide-left",
		style: k.left
	}, /* @__PURE__ */ e.createElement("div", { style: k.cardHook }, /* @__PURE__ */ e.createElement("span", { style: k.corner }, "💭"), /* @__PURE__ */ e.createElement("p", { style: k.hookText }, t, ", picture a tube of blood left standing all day — it barely settles, because the cells are far too fine for gravity to pull down quickly. So how does a lab split that same blood into clear plasma and packed red cells in just five minutes? Let’s reason it out together.")), /* @__PURE__ */ e.createElement("div", { style: k.plain }, /* @__PURE__ */ e.createElement("div", { style: k.hPlain }, "Start with the problem"), /* @__PURE__ */ e.createElement("p", { style: k.body }, "Every tiny particle in a suspension ", /* @__PURE__ */ e.createElement("i", null, "does"), " feel gravity — but the pull is so gentle that fluid drag keeps them drifting for hours. To separate them in minutes, we need a far bigger force.")), /* @__PURE__ */ e.createElement("div", { style: k.cardInsight }, /* @__PURE__ */ e.createElement("span", { style: k.corner }, "💡"), /* @__PURE__ */ e.createElement("p", { style: k.body }, "Spin the tube fast and each particle feels an outward force thousands of times stronger than gravity — call it ", /* @__PURE__ */ e.createElement("b", null, "super-gravity"), ". The denser particles are flung outward and down hardest, so they pack at the bottom while the lighter liquid stays on top. Notice the key point: ", /* @__PURE__ */ e.createElement("b", null, "density is still the property doing the work"), " — we have simply turbo-charged it.")), /* @__PURE__ */ e.createElement("div", { style: k.cardPitfall }, /* @__PURE__ */ e.createElement("span", { style: k.corner }, "⚠️"), /* @__PURE__ */ e.createElement("p", { style: k.body }, "A separating funnel needs two liquids that already form layers on their own. A centrifuge handles fine solids suspended in a liquid that ", /* @__PURE__ */ e.createElement("i", null, "won’t"), " settle by itself. Same underlying logic — density — applied at very different speeds.")), /* @__PURE__ */ e.createElement("div", { style: k.cardSurprise }, /* @__PURE__ */ e.createElement("span", { style: k.corner }, "🤯"), /* @__PURE__ */ e.createElement("p", { style: k.body }, "A spinning-button toy on a loop of string reaches 125,000 rpm by hand — enough super-gravity to separate blood and detect malaria, with no electricity at all."))), /* @__PURE__ */ e.createElement("div", {
		className: "slide-right",
		style: k.right
	}, /* @__PURE__ */ e.createElement("div", { style: k.panelTitle }, "Dial up the spin speed"), /* @__PURE__ */ e.createElement("p", { style: k.caption }, "Effective gravity grows with the ", /* @__PURE__ */ e.createElement("b", null, "square"), " of the spin speed: g = (rpm / 4000)² × 1800. Double the rpm and the force quadruples — that steep climb is why a centrifuge does in minutes what gravity can’t do in a day."), /* @__PURE__ */ e.createElement("input", {
		type: "range",
		min: 0,
		max: 4e3,
		step: 50,
		value: n,
		onChange: (e) => r(Number(e.target.value)),
		style: k.slider
	}), /* @__PURE__ */ e.createElement("div", { style: k.statRow }, /* @__PURE__ */ e.createElement("div", { style: k.stat }, /* @__PURE__ */ e.createElement("div", { style: k.statVal }, n), /* @__PURE__ */ e.createElement("div", { style: k.statLbl }, "rpm")), /* @__PURE__ */ e.createElement("div", { style: k.stat }, /* @__PURE__ */ e.createElement("div", { style: k.statVal }, i, "×"), /* @__PURE__ */ e.createElement("div", { style: k.statLbl }, "effective gravity"))), /* @__PURE__ */ e.createElement("div", { style: k.hint }, "Try this: at 0 rpm the effective gravity is just 0× the boost — gravity alone, far too weak to settle fine cells. Push past ~2000 rpm and watch the number rocket upward as super-gravity takes over."), /* @__PURE__ */ e.createElement("div", { style: k.videoTitle }, "Watch it happen"), /* @__PURE__ */ e.createElement("div", { style: k.videoWrap }, /* @__PURE__ */ e.createElement("iframe", {
		style: k.iframe,
		src: "https://www.youtube.com/embed/AH3lpuCm4rA",
		title: "Centrifuge separating blood",
		frameBorder: "0",
		allow: "accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share",
		allowFullScreen: !0
	})), /* @__PURE__ */ e.createElement("div", { style: k.videoWrap }, /* @__PURE__ */ e.createElement("iframe", {
		style: k.iframe,
		src: "https://www.youtube.com/embed/1MlZbld7iEU",
		title: "Paperfuge in action",
		frameBorder: "0",
		allow: "accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share",
		allowFullScreen: !0
	}))));
}
var ye = {
	background: "var(--surface-raised)",
	border: "1px solid var(--border-light)",
	borderRadius: 10,
	padding: "14px 18px",
	position: "relative",
	paddingRight: 42
}, k = {
	title: {
		fontSize: 22,
		fontWeight: 700,
		color: "var(--text-primary)"
	},
	left: {
		display: "flex",
		flexDirection: "column",
		gap: 14,
		minWidth: 0
	},
	right: {
		display: "flex",
		flexDirection: "column",
		gap: 12,
		minWidth: 0
	},
	corner: {
		position: "absolute",
		top: 12,
		right: 12,
		fontSize: 16,
		lineHeight: 1
	},
	plain: {
		padding: "0 2px",
		minWidth: 0
	},
	cardHook: {
		...ye,
		background: "var(--hook-soft)",
		borderLeft: "2px solid var(--hook)"
	},
	cardInsight: {
		...ye,
		background: "var(--primary-softer)",
		borderColor: "var(--primary-soft)",
		borderLeft: "2px solid var(--primary)"
	},
	cardPitfall: {
		...ye,
		background: "var(--accent-soft)",
		borderLeft: "2px solid var(--accent)"
	},
	cardSurprise: {
		...ye,
		background: "var(--surprise-soft)",
		borderLeft: "2px solid var(--surprise)"
	},
	hPlain: {
		fontSize: 14,
		fontWeight: 700,
		color: "var(--primary)",
		marginBottom: 6
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
	caption: {
		fontSize: 13,
		color: "var(--text-muted)",
		textAlign: "center",
		lineHeight: 1.5,
		margin: 0
	},
	slider: {
		width: "100%",
		accentColor: "var(--primary)"
	},
	statRow: {
		display: "flex",
		gap: 10
	},
	stat: {
		flex: 1,
		minWidth: 0,
		textAlign: "center",
		background: "var(--surface)",
		border: "1px solid var(--border-light)",
		borderRadius: 8,
		padding: "8px 6px"
	},
	statVal: {
		fontSize: 18,
		fontWeight: 700,
		color: "var(--text-primary)"
	},
	statLbl: {
		fontSize: 12,
		color: "var(--text-muted)"
	},
	hint: {
		fontSize: 13,
		color: "var(--text-muted)",
		textAlign: "center",
		lineHeight: 1.5
	}
};
//#endregion
//#region ../tmp/nadi-slides-fd6e4518-99e0-414a-a92e-35da921944c5/Slide_t1--law-of-definite-proportions-hgav.jsx
function be({ studentName: t }) {
	let [n, r] = w(8), [i, a] = w(2), [o, s] = w(!1), c = Math.min(i, Math.floor(n / 2)), l = c * 2, u = n - l, d = i - c, f = c, p = () => s(!1), m = ({ color: t, faded: n }) => /* @__PURE__ */ e.createElement("span", { style: {
		width: 16,
		height: 16,
		borderRadius: "50%",
		background: t,
		display: "inline-block",
		boxSizing: "border-box",
		opacity: n ? .16 : 1,
		transition: "opacity 0.45s ease"
	} }), h = () => /* @__PURE__ */ e.createElement("span", { style: A.waterUnit }, /* @__PURE__ */ e.createElement("span", { style: {
		...A.atom,
		background: "#1f8bff"
	} }), /* @__PURE__ */ e.createElement("span", { style: {
		...A.atom,
		background: "#ff2e1f"
	} }), /* @__PURE__ */ e.createElement("span", { style: {
		...A.atom,
		background: "#1f8bff"
	} }));
	return /* @__PURE__ */ e.createElement(e.Fragment, null, /* @__PURE__ */ e.createElement("div", {
		className: "slide-title",
		style: A.title
	}, "The Invisible Recipe"), /* @__PURE__ */ e.createElement("div", {
		className: "slide-left",
		style: A.left
	}, /* @__PURE__ */ e.createElement("div", { style: A.cardHook }, /* @__PURE__ */ e.createElement("div", { style: A.row }, /* @__PURE__ */ e.createElement("span", { style: A.badge }, "💭"), /* @__PURE__ */ e.createElement("span", { style: A.hHook }, "Think about this")), /* @__PURE__ */ e.createElement("p", { style: A.hookText }, t, ", chemistry comes with its own vocabulary — a bit like learning a new language — but this idea needs no jargon, just clear thinking, and you're more than ready for it. To make water, we react hydrogen gas with oxygen gas. So ask yourself: if you pour in far more hydrogen than oxygen, does all of that hydrogen get used up?")), /* @__PURE__ */ e.createElement("div", { style: A.card }, /* @__PURE__ */ e.createElement("div", { style: A.hCard }, "What you see — the macroscopic view"), /* @__PURE__ */ e.createElement("p", { style: A.body }, "It doesn't — and the outcome is completely reliable. Reason through it step by step:"), /* @__PURE__ */ e.createElement("div", { style: A.steps }, /* @__PURE__ */ e.createElement("div", { style: A.stepLine }, /* @__PURE__ */ e.createElement("span", { style: A.stepNum }, "1"), /* @__PURE__ */ e.createElement("span", null, "The gases combine in a strict ratio: ", /* @__PURE__ */ e.createElement("b", null, "2 volumes of hydrogen for every 1 volume of oxygen"), ".")), /* @__PURE__ */ e.createElement("div", { style: A.stepLine }, /* @__PURE__ */ e.createElement("span", { style: A.stepNum }, "2"), /* @__PURE__ */ e.createElement("span", null, "Once that ratio is met, the reaction simply ", /* @__PURE__ */ e.createElement("b", null, "stops"), ".")), /* @__PURE__ */ e.createElement("div", { style: A.stepLine }, /* @__PURE__ */ e.createElement("span", { style: A.stepNum }, "3"), /* @__PURE__ */ e.createElement("span", null, "Any gas beyond the recipe is ", /* @__PURE__ */ e.createElement("b", null, "left over"), " — untouched, exactly as it was.")))), /* @__PURE__ */ e.createElement("div", { style: A.cardInsight }, /* @__PURE__ */ e.createElement("div", { style: A.row }, /* @__PURE__ */ e.createElement("span", { style: A.badge }, "💡"), /* @__PURE__ */ e.createElement("span", { style: A.hInsight }, "Why it happens — the microscopic view")), /* @__PURE__ */ e.createElement("p", { style: A.body }, "Now zoom down to the tiny building blocks, and the rule makes sense: every oxygen unit bonds with ", /* @__PURE__ */ e.createElement("b", null, "exactly two"), " hydrogen units — no more, no less. That fixed ratio at the smallest scale is precisely why the large volumes you measure must obey the same 2 : 1 rule.")), /* @__PURE__ */ e.createElement("div", { style: A.cardPitfall }, /* @__PURE__ */ e.createElement("div", { style: A.row }, /* @__PURE__ */ e.createElement("span", { style: A.badge }, "⚠️"), /* @__PURE__ */ e.createElement("span", { style: A.hPitfall }, "A common mix-up")), /* @__PURE__ */ e.createElement("p", { style: A.body }, "Be careful not to treat this like a mixture. A ", /* @__PURE__ */ e.createElement("b", null, "mixture"), " is a \"variable ingredient list\" — a little salt or a lot of salt in water, entirely your choice; the parts simply share space. This new substance is different: it follows an ", /* @__PURE__ */ e.createElement("b", null, "\"invisible recipe\""), " whose composition you cannot adjust.")), /* @__PURE__ */ e.createElement("div", { style: A.cardSurprise }, /* @__PURE__ */ e.createElement("p", { style: A.body }, "Because the recipe never bends, water from a tap in India and ice from the polar caps of Mars share the ", /* @__PURE__ */ e.createElement("b", null, "exact same composition"), ". One recipe — identical everywhere in the universe.")), /* @__PURE__ */ e.createElement("div", { style: A.card }, /* @__PURE__ */ e.createElement("p", { style: A.body }, "You'll meet this kind of fixed-ratio combination again, in full detail, in ", /* @__PURE__ */ e.createElement("b", null, "Chapter 9: Atomic Foundations of Matter"), ". Hold on to this picture — it will pay off."))), /* @__PURE__ */ e.createElement("div", {
		className: "slide-right",
		style: A.right
	}, /* @__PURE__ */ e.createElement("div", { style: A.panelTitle }, "Set the amounts, then combine — and test your prediction"), /* @__PURE__ */ e.createElement("div", { style: {
		...A.stage,
		outline: o ? "2px solid var(--primary)" : "2px solid transparent"
	} }, /* @__PURE__ */ e.createElement("div", { style: A.stageInner }, /* @__PURE__ */ e.createElement("div", { style: A.topRow }, /* @__PURE__ */ e.createElement("div", { style: A.gasCol }, /* @__PURE__ */ e.createElement("div", { style: A.headerRow }, /* @__PURE__ */ e.createElement("span", { style: A.binLabel }, "Hydrogen — ", n), !o && /* @__PURE__ */ e.createElement("span", { style: A.stepGroup }, /* @__PURE__ */ e.createElement("button", {
		style: A.stepBtn,
		onClick: () => r((e) => Math.max(0, e - 1)),
		"aria-label": "less hydrogen"
	}, "−"), /* @__PURE__ */ e.createElement("button", {
		style: A.stepBtnPlus,
		onClick: () => r((e) => Math.min(12, e + 1)),
		"aria-label": "more hydrogen"
	}, "+"))), /* @__PURE__ */ e.createElement("div", { style: A.dotWrap }, Array.from({ length: n }).map((t, n) => /* @__PURE__ */ e.createElement(m, {
		key: "h" + n,
		color: "#1f8bff",
		faded: o && n < l
	})))), /* @__PURE__ */ e.createElement("div", { style: A.gasColRight }, /* @__PURE__ */ e.createElement("div", { style: A.headerRow }, !o && /* @__PURE__ */ e.createElement("span", { style: A.stepGroup }, /* @__PURE__ */ e.createElement("button", {
		style: A.stepBtn,
		onClick: () => a((e) => Math.max(0, e - 1)),
		"aria-label": "less oxygen"
	}, "−"), /* @__PURE__ */ e.createElement("button", {
		style: A.stepBtnPlus,
		onClick: () => a((e) => Math.min(6, e + 1)),
		"aria-label": "more oxygen"
	}, "+")), /* @__PURE__ */ e.createElement("span", { style: A.binLabel }, "Oxygen — ", i)), /* @__PURE__ */ e.createElement("div", { style: A.dotWrapRight }, Array.from({ length: i }).map((t, n) => /* @__PURE__ */ e.createElement(m, {
		key: "o" + n,
		color: "#ff2e1f",
		faded: o && n < c
	}))))), o && /* @__PURE__ */ e.createElement("div", { style: A.waterSection }, /* @__PURE__ */ e.createElement("div", { style: A.binLabel }, "Water made — ", f, " ", f === 1 ? "unit" : "units"), /* @__PURE__ */ e.createElement("div", { style: A.faintNote }, "each unit = 1 oxygen + 2 hydrogen joined"), /* @__PURE__ */ e.createElement("div", { style: A.waterWrap }, f === 0 ? /* @__PURE__ */ e.createElement("span", { style: A.noneTxt }, "none yet — there isn't enough of one gas to complete the recipe. Adjust the amounts and try again.") : Array.from({ length: f }).map((t, n) => /* @__PURE__ */ e.createElement(h, { key: "w" + n })))))), /* @__PURE__ */ e.createElement("div", { style: A.readout }, o ? "Result: " + l + " hydrogen + " + c + " oxygen joined at the 2 : 1 recipe. " + (u === 0 && d === 0 ? "A perfect match — nothing left behind. Nicely reasoned." : "Left over and untouched: " + (u > 0 ? u + " hydrogen " : "") + (d > 0 ? d + " oxygen " : "") + "— exactly as the fixed recipe predicts.") : "Strategy: the recipe is locked at 2 hydrogen : 1 oxygen. Set the amounts, predict what will have no partner, then combine to check your thinking."), /* @__PURE__ */ e.createElement("button", {
		style: A.btn,
		onClick: () => o ? p() : s(!0)
	}, o ? "↺ Pour in again" : "⚡ Combine")));
}
var xe = {
	background: "var(--surface-raised)",
	border: "1px solid var(--border-light)",
	borderRadius: 10,
	padding: "14px 18px"
}, A = {
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
	card: { ...xe },
	cardHook: {
		...xe,
		background: "var(--hook-soft)",
		borderLeft: "2px solid var(--hook)"
	},
	cardInsight: {
		...xe,
		background: "var(--primary-softer)",
		borderColor: "var(--primary-soft)",
		borderLeft: "2px solid var(--primary)"
	},
	cardPitfall: {
		...xe,
		background: "var(--accent-soft)",
		borderLeft: "2px solid var(--accent)"
	},
	cardSurprise: {
		...xe,
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
	hInsight: {
		fontSize: 14,
		fontWeight: 700,
		color: "var(--primary)"
	},
	hPitfall: {
		fontSize: 14,
		fontWeight: 700,
		color: "var(--accent-text)"
	},
	hSurprise: {
		fontSize: 14,
		fontWeight: 700,
		color: "var(--surprise-text)"
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
		lineHeight: 1.6,
		color: "var(--text-primary)",
		margin: 0
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
		padding: 14,
		minHeight: 190,
		boxSizing: "border-box",
		transition: "outline 0.2s"
	},
	stageInner: {
		display: "flex",
		flexDirection: "column",
		gap: 4
	},
	topRow: {
		display: "flex",
		alignItems: "flex-start",
		gap: 16
	},
	gasCol: {
		flex: 1,
		minWidth: 0,
		display: "flex",
		flexDirection: "column",
		gap: 6,
		alignItems: "flex-start"
	},
	gasColRight: {
		flex: 1,
		minWidth: 0,
		display: "flex",
		flexDirection: "column",
		gap: 6,
		alignItems: "flex-end"
	},
	headerRow: {
		display: "flex",
		alignItems: "center",
		gap: 8
	},
	binLabel: {
		fontSize: 13,
		fontWeight: 700,
		color: "var(--text-secondary)",
		minWidth: 0
	},
	steps: {
		display: "flex",
		flexDirection: "column",
		gap: 8,
		marginTop: 10
	},
	stepLine: {
		display: "flex",
		alignItems: "flex-start",
		gap: 10,
		fontSize: 15,
		lineHeight: 1.5,
		color: "var(--text-primary)"
	},
	stepNum: {
		flexShrink: 0,
		width: 22,
		height: 22,
		borderRadius: "50%",
		background: "var(--primary)",
		color: "var(--primary-text)",
		fontSize: 13,
		fontWeight: 700,
		display: "inline-flex",
		alignItems: "center",
		justifyContent: "center"
	},
	stepGroup: {
		display: "flex",
		gap: 6,
		flexShrink: 0
	},
	stepBtn: {
		width: 30,
		height: 30,
		fontSize: 18,
		fontWeight: 700,
		lineHeight: 1,
		fontFamily: "inherit",
		color: "var(--text-secondary)",
		background: "var(--surface-raised)",
		border: "1px solid var(--border)",
		borderRadius: 7,
		cursor: "pointer",
		display: "inline-flex",
		alignItems: "center",
		justifyContent: "center"
	},
	stepBtnPlus: {
		width: 30,
		height: 30,
		fontSize: 18,
		fontWeight: 700,
		lineHeight: 1,
		fontFamily: "inherit",
		color: "var(--primary-text)",
		background: "var(--primary)",
		border: "none",
		borderRadius: 7,
		cursor: "pointer",
		display: "inline-flex",
		alignItems: "center",
		justifyContent: "center"
	},
	dotWrap: {
		display: "flex",
		flexWrap: "wrap",
		gap: 6,
		minHeight: 20,
		alignItems: "center",
		justifyContent: "flex-start"
	},
	dotWrapRight: {
		display: "flex",
		flexWrap: "wrap",
		gap: 6,
		minHeight: 20,
		alignItems: "center",
		justifyContent: "flex-end"
	},
	waterSection: {
		marginTop: 16,
		paddingTop: 12,
		borderTop: "1px dashed var(--border)",
		display: "flex",
		flexDirection: "column",
		gap: 4,
		alignItems: "center",
		textAlign: "center"
	},
	waterWrap: {
		display: "flex",
		flexWrap: "wrap",
		gap: 8,
		minHeight: 20,
		alignItems: "center",
		justifyContent: "center",
		marginTop: 4
	},
	waterUnit: {
		display: "inline-flex",
		alignItems: "center"
	},
	atom: {
		width: 16,
		height: 16,
		borderRadius: "50%",
		boxSizing: "border-box"
	},
	faintNote: {
		fontSize: 12,
		fontWeight: 400,
		fontStyle: "italic",
		color: "var(--text-muted)"
	},
	noneTxt: {
		fontSize: 13,
		fontStyle: "italic",
		color: "var(--text-muted)"
	},
	readout: {
		fontSize: 14,
		fontWeight: 600,
		color: "var(--text-secondary)",
		textAlign: "center",
		lineHeight: 1.5,
		minHeight: 38
	},
	btn: {
		marginTop: 4,
		padding: "11px 16px",
		fontSize: 15,
		fontWeight: 700,
		fontFamily: "inherit",
		color: "var(--primary-text)",
		background: "var(--primary)",
		border: "none",
		borderRadius: 8,
		cursor: "pointer"
	}
}, Se = [
	{
		id: "salt",
		name: "Salt stirred into water",
		type: "homo",
		kind: "uniform",
		base: "#cfe6f5",
		note: "Nicely judged. Macroscopically it reads as one liquid — and here that is the truth. Microscopically, the salt has broken into single particles spread evenly, so the composition is identical top to bottom. Homogeneous."
	},
	{
		id: "sand",
		name: "Sand stirred into water",
		type: "hetero",
		kind: "sediment",
		base: "#bcdcf0",
		note: "Look closely and trust what you see: the grains stay whole and pile at the bottom. Different stuff sitting in different regions — clearly heterogeneous."
	},
	{
		id: "oil",
		name: "Oil poured onto water",
		type: "hetero",
		kind: "layers",
		base: "#bcdcf0",
		note: "Stay disciplined here — this is the classic trap. Both layers are perfectly clear, yet the composition differs region to region. \"See-through\" never made anything homogeneous."
	},
	{
		id: "sugar",
		name: "Sugar syrup",
		type: "homo",
		kind: "uniform",
		base: "#f1e2bf",
		note: "Exactly — one single phase. Sample it anywhere — top, middle or bottom — and you get the same sweet liquid. Uniform throughout, so homogeneous."
	},
	{
		id: "mud",
		name: "Muddy pond water",
		type: "hetero",
		kind: "cloud",
		base: "#b59a72",
		note: "Good eye. Cloudy, with particles spread unevenly and slowly settling — distinct regions you can point to. Heterogeneous."
	}
], Ce = [
	[20, 78],
	[38, 86],
	[55, 82],
	[70, 88],
	[30, 92],
	[60, 94],
	[45, 90],
	[78, 84],
	[15, 88],
	[85, 92]
], we = [
	[22, 30],
	[55, 22],
	[78, 40],
	[35, 52],
	[65, 60],
	[18, 66],
	[48, 72],
	[82, 70],
	[40, 38],
	[70, 28],
	[28, 80],
	[60, 84]
];
function Te({ sample: t }) {
	let { base: n, kind: r } = t;
	return /* @__PURE__ */ e.createElement("div", { style: Oe.wrap }, /* @__PURE__ */ e.createElement("div", { style: Oe.beaker }, r === "uniform" && /* @__PURE__ */ e.createElement("div", { style: {
		...Oe.fill,
		background: n
	} }), r === "sediment" && /* @__PURE__ */ e.createElement(e.Fragment, null, /* @__PURE__ */ e.createElement("div", { style: {
		...Oe.fill,
		background: n
	} }), /* @__PURE__ */ e.createElement("div", { style: Oe.sedimentBand }), Ce.map((t, n) => /* @__PURE__ */ e.createElement("span", {
		key: n,
		style: {
			...Oe.grain,
			left: t[0] + "%",
			top: t[1] + "%"
		}
	}))), r === "layers" && /* @__PURE__ */ e.createElement(e.Fragment, null, /* @__PURE__ */ e.createElement("div", { style: {
		...Oe.fill,
		background: n
	} }), /* @__PURE__ */ e.createElement("div", { style: Oe.oilLayer }), /* @__PURE__ */ e.createElement("div", { style: Oe.oilLine })), r === "cloud" && /* @__PURE__ */ e.createElement(e.Fragment, null, /* @__PURE__ */ e.createElement("div", { style: {
		...Oe.fill,
		background: n
	} }), we.map((t, n) => /* @__PURE__ */ e.createElement("span", {
		key: n,
		style: {
			...Oe.mote,
			left: t[0] + "%",
			top: t[1] + "%"
		}
	})))), /* @__PURE__ */ e.createElement("div", { style: Oe.base }));
}
function Ee({ studentName: t }) {
	let [n, r] = w(0), [i, a] = w(null), [o, s] = w(0), [c, l] = w(0), u = Se[n], d = i !== null, f = d && i === u.type, p = c >= Se.length, m = (e) => {
		d || (a(e), l((e) => e + 1), e === u.type && s((e) => e + 1));
	}, h = () => {
		a(null), r((e) => (e + 1) % Se.length);
	}, g = () => {
		a(null), r(0), s(0), l(0);
	};
	return /* @__PURE__ */ e.createElement(e.Fragment, null, /* @__PURE__ */ e.createElement("div", {
		className: "slide-title",
		style: j.title
	}, "The first cut: uniform or not?"), /* @__PURE__ */ e.createElement("div", {
		className: "slide-left",
		style: j.left
	}, /* @__PURE__ */ e.createElement("div", { style: j.cardHook }, /* @__PURE__ */ e.createElement("span", { style: j.corner }, "💭"), /* @__PURE__ */ e.createElement("p", { style: j.hookText }, t, ", start with one honest observation: stare at salt-water and you cannot point to \"the salt.\" Now stir in sand — the grains drift and settle. Same glass, two very different behaviours. So what is the line that separates them?")), /* @__PURE__ */ e.createElement("div", { style: j.plain }, /* @__PURE__ */ e.createElement("p", { style: j.body }, "Mixtures are either ", /* @__PURE__ */ e.createElement("b", null, "homogeneous"), " or ", /* @__PURE__ */ e.createElement("b", null, "heterogeneous"), ". When a spoonful of sugar dissolves in water we obtain a ", /* @__PURE__ */ e.createElement("b", null, "homogeneous"), " mixture, in which the composition of the mixture is the same throughout."), /* @__PURE__ */ e.createElement("p", { style: j.body }, "If sand is mixed with iron filings, however, the sand grains and the iron filings remain separate. This type of mixture is called a ", /* @__PURE__ */ e.createElement("b", null, "heterogeneous"), " mixture, because the composition is not uniform.")), /* @__PURE__ */ e.createElement("div", { style: j.cardInsight }, /* @__PURE__ */ e.createElement("span", { style: j.corner }, "💡"), /* @__PURE__ */ e.createElement("p", { style: j.body }, "One question decides it: ", /* @__PURE__ */ e.createElement("b", null, "is the composition uniform at the scale that matters?"), " Think of a crowd photo — from the back it's one mass; step closer and you see individuals. Your eye is a quick first check, not the definition itself.")), /* @__PURE__ */ e.createElement("div", { style: j.cardPitfall }, /* @__PURE__ */ e.createElement("span", { style: j.corner }, "⚠️"), /* @__PURE__ */ e.createElement("p", { style: j.body }, "Be precise here: \"clear\" and \"liquid\" are NOT the rule. Oil-on-water is crystal clear yet heterogeneous. Uniformity of composition is the one and only deciding factor."))), /* @__PURE__ */ e.createElement("div", {
		className: "slide-right",
		style: j.right
	}, /* @__PURE__ */ e.createElement("div", { style: j.panelHead }, /* @__PURE__ */ e.createElement("span", { style: j.panelTitle }, "Classify the sample"), /* @__PURE__ */ e.createElement("span", { style: j.scorePill }, o, " / ", c)), /* @__PURE__ */ e.createElement("div", { style: j.progress }, Se.map((t, r) => /* @__PURE__ */ e.createElement("span", {
		key: t.id,
		style: {
			...j.dot,
			background: r === n ? "var(--primary)" : r < n || p ? "var(--primary-soft)" : "var(--border)"
		}
	}))), /* @__PURE__ */ e.createElement("div", { style: j.stage }, /* @__PURE__ */ e.createElement(Te, { sample: u })), /* @__PURE__ */ e.createElement("div", { style: j.sampleName }, u.name), !d && /* @__PURE__ */ e.createElement(e.Fragment, null, /* @__PURE__ */ e.createElement("div", { style: j.prompt }, "Your call: uniform throughout, or distinct regions?"), /* @__PURE__ */ e.createElement("div", { style: j.btnRow }, /* @__PURE__ */ e.createElement("button", {
		style: {
			...j.choice,
			...j.choiceHomo
		},
		onClick: () => m("homo")
	}, "Homogeneous"), /* @__PURE__ */ e.createElement("button", {
		style: {
			...j.choice,
			...j.choiceHetero
		},
		onClick: () => m("hetero")
	}, "Heterogeneous"))), d && /* @__PURE__ */ e.createElement("div", { style: {
		...j.feedback,
		borderColor: f ? "var(--primary)" : "var(--accent)",
		background: f ? "var(--primary-softer)" : "var(--accent-soft)"
	} }, /* @__PURE__ */ e.createElement("div", { style: {
		...j.fbTag,
		color: f ? "var(--primary)" : "var(--accent-text)"
	} }, f ? "✓ Well spotted" : "✗ Let’s reconsider together", " — it’s ", /* @__PURE__ */ e.createElement("b", null, u.type === "homo" ? "homogeneous" : "heterogeneous")), /* @__PURE__ */ e.createElement("p", { style: j.fbBody }, u.note), p ? /* @__PURE__ */ e.createElement("div", { style: j.summary }, /* @__PURE__ */ e.createElement("p", { style: j.summaryText }, "Well done — all ", Se.length, " sorted. Notice your method: you never leaned on \"clear\" or \"liquid,\" only on ", /* @__PURE__ */ e.createElement("b", null, "uniform vs distinct regions."), " That discipline is the whole skill."), /* @__PURE__ */ e.createElement("button", {
		style: j.next,
		onClick: g
	}, "Run again ↻")) : /* @__PURE__ */ e.createElement("button", {
		style: j.next,
		onClick: h
	}, "Next sample →"))));
}
var De = {
	background: "var(--surface-raised)",
	border: "1px solid var(--border-light)",
	borderRadius: 10,
	padding: "14px 18px",
	position: "relative",
	paddingRight: 40
}, j = {
	title: {
		fontSize: 22,
		fontWeight: 700,
		color: "var(--text-primary)"
	},
	left: {
		display: "flex",
		flexDirection: "column",
		gap: 14,
		minWidth: 0
	},
	right: {
		display: "flex",
		flexDirection: "column",
		gap: 12,
		minWidth: 0
	},
	corner: {
		position: "absolute",
		top: 10,
		right: 12,
		fontSize: 16,
		lineHeight: 1
	},
	plain: { padding: "0 2px" },
	cardHook: {
		...De,
		background: "var(--hook-soft)",
		borderLeft: "2px solid var(--hook)"
	},
	cardInsight: {
		...De,
		background: "var(--primary-softer)",
		borderColor: "var(--primary-soft)",
		borderLeft: "2px solid var(--primary)"
	},
	cardPitfall: {
		...De,
		background: "var(--accent-soft)",
		borderLeft: "2px solid var(--accent)"
	},
	hCard: {
		fontSize: 14,
		fontWeight: 700,
		color: "var(--primary)",
		marginBottom: 8
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
		lineHeight: 1.6,
		color: "var(--text-primary)",
		margin: "0 0 8px"
	},
	panelHead: {
		display: "flex",
		alignItems: "center",
		justifyContent: "space-between"
	},
	panelTitle: {
		fontSize: 16,
		fontWeight: 700,
		color: "var(--text-primary)"
	},
	scorePill: {
		fontSize: 13,
		fontWeight: 700,
		color: "var(--primary)",
		background: "var(--primary-softer)",
		border: "1px solid var(--primary-soft)",
		borderRadius: 999,
		padding: "3px 12px"
	},
	progress: {
		display: "flex",
		gap: 6,
		justifyContent: "center"
	},
	dot: {
		width: 9,
		height: 9,
		borderRadius: "50%",
		transition: "background 0.2s"
	},
	stage: {
		display: "flex",
		justifyContent: "center",
		alignItems: "flex-end",
		background: "var(--surface)",
		border: "1px solid var(--border-light)",
		borderRadius: 10,
		padding: "18px 0 14px"
	},
	sampleName: {
		textAlign: "center",
		fontSize: 15,
		fontWeight: 700,
		color: "var(--text-primary)"
	},
	prompt: {
		textAlign: "center",
		fontSize: 14,
		color: "var(--text-secondary)"
	},
	btnRow: {
		display: "flex",
		gap: 10
	},
	choice: {
		flex: 1,
		minWidth: 0,
		padding: "14px 8px",
		borderRadius: 10,
		fontSize: 15,
		fontWeight: 700,
		cursor: "pointer",
		fontFamily: "inherit",
		border: "1.5px solid"
	},
	choiceHomo: {
		background: "var(--surface-raised)",
		borderColor: "var(--primary-soft)",
		color: "var(--primary)"
	},
	choiceHetero: {
		background: "var(--surface-raised)",
		borderColor: "var(--accent)",
		color: "var(--accent-text)"
	},
	feedback: {
		border: "1.5px solid",
		borderRadius: 10,
		padding: "14px 16px"
	},
	fbTag: {
		fontSize: 15,
		fontWeight: 700,
		marginBottom: 6
	},
	fbBody: {
		fontSize: 14,
		lineHeight: 1.55,
		color: "var(--text-primary)",
		margin: "0 0 12px"
	},
	next: {
		width: "100%",
		padding: "11px",
		borderRadius: 8,
		border: "none",
		background: "var(--primary)",
		color: "var(--primary-text)",
		fontSize: 15,
		fontWeight: 700,
		cursor: "pointer",
		fontFamily: "inherit"
	},
	summary: {
		display: "flex",
		flexDirection: "column",
		gap: 10
	},
	summaryText: {
		fontSize: 14,
		lineHeight: 1.55,
		color: "var(--text-primary)",
		margin: 0
	}
}, Oe = {
	wrap: {
		display: "flex",
		flexDirection: "column",
		alignItems: "center",
		width: "40%",
		maxWidth: 150,
		minWidth: 110
	},
	beaker: {
		position: "relative",
		width: "100%",
		aspectRatio: "3 / 4",
		borderRadius: "8px 8px 16px 16px",
		border: "3px solid #8aa0ad",
		borderTop: "3px solid #b7c6cf",
		overflow: "hidden",
		background: "#eef4f7",
		boxSizing: "border-box"
	},
	fill: {
		position: "absolute",
		left: 0,
		right: 0,
		bottom: 0,
		height: "82%"
	},
	sedimentBand: {
		position: "absolute",
		left: 0,
		right: 0,
		bottom: 0,
		height: "16%",
		background: "#c9a96a"
	},
	grain: {
		position: "absolute",
		width: 5,
		height: 5,
		borderRadius: "50%",
		background: "#9c7b44",
		transform: "translate(-50%,-50%)"
	},
	oilLayer: {
		position: "absolute",
		left: 0,
		right: 0,
		top: "18%",
		height: "28%",
		background: "#f0d96b"
	},
	oilLine: {
		position: "absolute",
		left: 0,
		right: 0,
		top: "46%",
		height: 2,
		background: "#c7a93f"
	},
	mote: {
		position: "absolute",
		width: 6,
		height: 6,
		borderRadius: "50%",
		background: "#6e5733",
		opacity: .7,
		transform: "translate(-50%,-50%)"
	},
	base: {
		width: "60%",
		height: 6,
		background: "#8aa0ad",
		borderRadius: 3,
		marginTop: 2
	}
};
//#endregion
//#region ../tmp/nadi-slides-fd6e4518-99e0-414a-a92e-35da921944c5/Slide_t2-1.jsx
function ke({ studentName: t }) {
	let [n, r] = w(8), [i, a] = w(100), o = C(null), s = C(n), c = C(i), l = C([]), u = C(0);
	if (b(() => {
		s.current = n;
	}, [n]), b(() => {
		c.current = i;
	}, [i]), l.current.length === 0) {
		let e = [];
		for (let t = 0; t < 60; t++) e.push({
			x: Math.random(),
			y: Math.random(),
			ph: Math.random() * Math.PI * 2
		});
		l.current = e;
	}
	let d = n + i, f = n / d * 100, p = f < 3 ? "weak" : f <= 10 ? "useful" : "danger", m = p === "weak" ? "Too dilute — not yet effective" : p === "useful" ? "Spot on — this proportion works" : "Too concentrated — now it harms", h = p === "weak" ? "#7c8a99" : p === "useful" ? "#1d9e63" : "#d2483f", g = () => r((e) => Math.max(0, e - 1)), _ = () => r((e) => Math.min(30, e + 1)), v = () => a((e) => Math.max(30, e - 10)), y = () => a((e) => Math.min(360, e + 10));
	return b(() => {
		let e = o.current;
		if (!e) return;
		let t = e.getContext("2d"), n = !0, r = () => {
			let n = e.getBoundingClientRect(), r = window.devicePixelRatio || 1;
			e.width = n.width * r, e.height = n.height * r, t.setTransform(r, 0, 0, r, 0, 0);
		};
		r();
		let i = (r) => {
			if (!n) return;
			let a = e.clientWidth, o = e.clientHeight;
			t.clearRect(0, 0, a, o);
			let d = s.current, f = c.current, p = d / (d + f) * 100, m = a * .4, h = (a - m) / 2, g = o * .05, _ = o * .66, v = Math.min((d + f) / 360, 1), y = _ - (_ - g) * Math.max(v, .05), b = Math.min(p / 12, 1), x = Math.round(180 + 44 * b), S = Math.round(215 + -47 * b), ee = Math.round(235 + -165 * b);
			t.fillStyle = "rgba(" + x + "," + S + "," + ee + ",0.9)", t.fillRect(h + 2, y, m - 4, _ - y - 1);
			let te = _ - y, ne = Math.min(Math.round(d * 2), l.current.length);
			t.fillStyle = "#9a5a08";
			for (let e = 0; e < ne; e++) {
				let n = l.current[e], i = h + 6 + n.x * (m - 12), a = y + 6 + n.y * (te - 12) + Math.sin(r / 650 + n.ph) * 2;
				a > _ - 4 && (a = _ - 4), t.beginPath(), t.arc(i, a, 2.2, 0, Math.PI * 2), t.fill();
			}
			t.strokeStyle = "#90a4b8", t.lineWidth = 2.5, t.beginPath(), t.moveTo(h, g), t.lineTo(h, _), t.lineTo(h + m, _), t.lineTo(h + m, g), t.stroke();
			let re = a * .1, C = re, w = a - 2 * re, ie = o * .8, ae = (e) => C + Math.min(Math.max(e, 0), 15) / 15 * w, oe = (e, n, r, i, a) => {
				t.beginPath(), t.moveTo(e + a, n), t.arcTo(e + r, n, e + r, n + i, a), t.arcTo(e + r, n + i, e, n + i, a), t.arcTo(e, n + i, e, n, a), t.arcTo(e, n, e + r, n, a), t.closePath();
			};
			oe(C, ie, w, 16, 16 / 2), t.save(), t.clip(), t.fillStyle = "#d3dae0", t.fillRect(ae(0), ie, ae(3) - ae(0), 16), t.fillStyle = "#86cf9f", t.fillRect(ae(3), ie, ae(10) - ae(3), 16), t.fillStyle = "#e3a09a", t.fillRect(ae(10), ie, ae(15) - ae(10), 16), t.restore(), oe(C, ie, w, 16, 16 / 2), t.strokeStyle = "#90a4b8", t.lineWidth = 1.5, t.stroke(), t.fillStyle = "#516170", t.font = "600 11px Outfit, sans-serif", t.textAlign = "center", t.fillText("weak", (ae(0) + ae(3)) / 2, ie + 16 + 16), t.fillText("works", (ae(3) + ae(10)) / 2, ie + 16 + 16), t.fillText("harm", (ae(10) + ae(15)) / 2, ie + 16 + 16), t.textAlign = "left";
			let se = ae(p), ce = p < 3 ? "#7c8a99" : p <= 10 ? "#1d9e63" : "#d2483f", T = ie - 4, le = ie - 15;
			t.fillStyle = ce, t.strokeStyle = ce, t.lineJoin = "round", t.lineWidth = 3.5, t.beginPath(), t.moveTo(se, T), t.lineTo(se - 6.5, le), t.lineTo(se + 6.5, le), t.closePath(), t.fill(), t.stroke(), u.current = requestAnimationFrame(i);
		};
		u.current = requestAnimationFrame(i);
		let a = new ResizeObserver(r);
		return a.observe(e), () => {
			n = !1, cancelAnimationFrame(u.current), a.disconnect();
		};
	}, []), /* @__PURE__ */ e.createElement(e.Fragment, null, /* @__PURE__ */ e.createElement("div", {
		className: "slide-title",
		style: M.title
	}, "Solute, Solvent & Why Proportion Rules"), /* @__PURE__ */ e.createElement("div", {
		className: "slide-left",
		style: M.left
	}, /* @__PURE__ */ e.createElement("div", { style: M.cardHook }, /* @__PURE__ */ e.createElement("span", { style: M.corner }, "💭"), /* @__PURE__ */ e.createElement("p", { style: M.hookText }, t, ", every new chemistry topic is a little like learning a language — and today's first words pay off for the whole chapter. Until now we have described a solution in plain words: \"sweet\", \"strong\", \"weak\". Ask a sharper question, though — is sugary water ", /* @__PURE__ */ e.createElement("em", null, "dangerous"), "? No single word can settle it. The honest answer is always a number: ", /* @__PURE__ */ e.createElement("strong", null, "how much?"), " That shift, from describing to measuring, is the move we make today.")), /* @__PURE__ */ e.createElement("p", { style: M.plainBody }, "A solution is a homogeneous mixture of two or more substances. The solute is the substance present in a smaller amount, and the solvent is the substance present in a larger amount. A solution may be gaseous (such as air), solid (such as an alloy), or liquid (seawater, for example)."), /* @__PURE__ */ e.createElement("div", { style: M.plainBlock }, /* @__PURE__ */ e.createElement("div", { style: M.plainHeading }, "The three words to lock in"), /* @__PURE__ */ e.createElement("div", { style: M.defRow }, /* @__PURE__ */ e.createElement("span", { style: M.term }, "Solute"), /* @__PURE__ */ e.createElement("span", { style: M.def }, "the substance that dissolves — the smaller amount (the sugar)")), /* @__PURE__ */ e.createElement("hr", { style: M.hr }), /* @__PURE__ */ e.createElement("div", { style: M.defRow }, /* @__PURE__ */ e.createElement("span", { style: M.term }, "Solvent"), /* @__PURE__ */ e.createElement("span", { style: M.def }, "the medium that does the dissolving — the larger amount (the water)")), /* @__PURE__ */ e.createElement("hr", { style: M.hr }), /* @__PURE__ */ e.createElement("div", { style: M.defRow }, /* @__PURE__ */ e.createElement("span", { style: M.term }, "Solution"), /* @__PURE__ */ e.createElement("span", { style: M.def }, "the single, even mixture they become together (sugar water)"))), /* @__PURE__ */ e.createElement("div", { style: M.plainBlock }, /* @__PURE__ */ e.createElement("div", { style: M.plainHeading }, "Concentration"), /* @__PURE__ */ e.createElement("p", { style: M.plainBody }, "The concentration of a solution is the amount of solute present in a given amount of solvent, or a given amount of solution. (For this discussion, we will assume the solute is a liquid or a solid and the solvent is a liquid.) The concentration of a solution can be expressed in many different ways."), /* @__PURE__ */ e.createElement("div", { style: M.formula }, "concentration = solute ÷ (solute + solvent)")), /* @__PURE__ */ e.createElement("div", { style: M.cardInsight }, /* @__PURE__ */ e.createElement("span", { style: M.corner }, "💡"), /* @__PURE__ */ e.createElement("p", { style: M.body }, "ORS — the drink that rescues a dehydrated child — is nothing but sugar, salt and water. Same three ingredients, every single time. Only the ", /* @__PURE__ */ e.createElement("strong", null, "right proportion"), " rehydrates. So hold on to this: the ingredient list never decides what a solution does — the amounts do.")), /* @__PURE__ */ e.createElement("div", { style: M.cardPitfall }, /* @__PURE__ */ e.createElement("span", { style: M.corner }, "⚠️"), /* @__PURE__ */ e.createElement("p", { style: M.body }, "Here is the trap worth dodging: safety, usefulness and danger are not glued to an ingredient — they belong to an ", /* @__PURE__ */ e.createElement("em", null, "amount"), ". Too little salt does nothing; too much harms; even plain water harms above some concentration. So retire the question \"is X dangerous?\" and ask the scientist's version instead — \"", /* @__PURE__ */ e.createElement("strong", null, "at what concentration?"), "\""))), /* @__PURE__ */ e.createElement("div", {
		className: "slide-right",
		style: M.right
	}, /* @__PURE__ */ e.createElement("div", { style: M.panelTitle }, "Build a solution — find the band that works"), /* @__PURE__ */ e.createElement("canvas", {
		ref: o,
		style: {
			width: "100%",
			aspectRatio: "5 / 4",
			maxHeight: "38vh",
			display: "block",
			borderRadius: 10,
			background: "var(--surface)",
			outline: "3px solid " + h,
			outlineOffset: -1,
			transition: "outline-color 0.3s"
		}
	}), /* @__PURE__ */ e.createElement("div", { style: {
		...M.zoneReadout,
		color: h
	} }, m), /* @__PURE__ */ e.createElement("div", { style: M.calcRow }, /* @__PURE__ */ e.createElement("div", { style: M.fraction }, /* @__PURE__ */ e.createElement("div", { style: M.fracLine }, /* @__PURE__ */ e.createElement("button", {
		onClick: g,
		style: M.step
	}, "−"), /* @__PURE__ */ e.createElement("div", { style: M.fracVal }, /* @__PURE__ */ e.createElement("strong", { style: M.fracNum }, n), /* @__PURE__ */ e.createElement("span", { style: M.fracUnit }, "g solute")), /* @__PURE__ */ e.createElement("button", {
		onClick: _,
		style: M.step
	}, "+")), /* @__PURE__ */ e.createElement("div", { style: M.fracBar }), /* @__PURE__ */ e.createElement("div", { style: M.fracLine }, /* @__PURE__ */ e.createElement("button", {
		onClick: v,
		style: M.step
	}, "−"), /* @__PURE__ */ e.createElement("div", { style: M.fracVal }, /* @__PURE__ */ e.createElement("strong", { style: M.fracNum }, d), /* @__PURE__ */ e.createElement("span", { style: M.fracUnit }, "g solution")), /* @__PURE__ */ e.createElement("button", {
		onClick: y,
		style: M.step
	}, "+"))), /* @__PURE__ */ e.createElement("div", { style: M.eq }, "="), /* @__PURE__ */ e.createElement("div", { style: {
		...M.concBig,
		color: h
	} }, /* @__PURE__ */ e.createElement("span", { style: M.concNum }, f.toFixed(1), "%"), /* @__PURE__ */ e.createElement("span", { style: M.concUnit }, "w/w"))), /* @__PURE__ */ e.createElement("div", { style: M.miniNote }, "The denominator is the whole solution (solute + solvent). Use the −/+ buttons to set how much solute and solvent go in."), /* @__PURE__ */ e.createElement("div", { style: M.note }, "Notice the key move (dilution): press + on the solution to add solvent only. The solute amount holds steady, yet the concentration falls — far enough to slip the solution out of its useful band.")));
}
var Ae = {
	background: "var(--surface-raised)",
	border: "1px solid var(--border-light)",
	borderRadius: 10,
	padding: "14px 18px",
	boxSizing: "border-box"
}, M = {
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
		gap: 16,
		minWidth: 0
	},
	corner: {
		position: "absolute",
		top: 10,
		right: 12,
		fontSize: 18,
		lineHeight: 1
	},
	cardHook: {
		...Ae,
		background: "var(--hook-soft)",
		borderLeft: "2px solid var(--hook)",
		position: "relative",
		paddingRight: 40
	},
	cardInsight: {
		...Ae,
		background: "var(--primary-softer)",
		borderColor: "var(--primary-soft)",
		borderLeft: "2px solid var(--primary)",
		position: "relative",
		paddingRight: 40
	},
	cardPitfall: {
		...Ae,
		background: "var(--accent-soft)",
		borderLeft: "2px solid var(--accent)",
		position: "relative",
		paddingRight: 40
	},
	hookText: {
		fontSize: 15,
		lineHeight: 1.6,
		color: "var(--text-primary)",
		margin: 0,
		fontStyle: "italic"
	},
	body: {
		fontSize: 15,
		lineHeight: 1.6,
		color: "var(--text-primary)",
		margin: 0
	},
	plainBlock: {
		display: "flex",
		flexDirection: "column",
		gap: 8,
		padding: "2px 4px"
	},
	plainHeading: {
		fontSize: 15,
		fontWeight: 700,
		color: "var(--text-primary)"
	},
	plainBody: {
		fontSize: 15,
		lineHeight: 1.6,
		color: "var(--text-primary)",
		margin: 0,
		padding: "0 4px"
	},
	defRow: {
		display: "flex",
		gap: 10,
		alignItems: "baseline",
		minWidth: 0
	},
	term: {
		fontSize: 14,
		fontWeight: 700,
		color: "var(--text-primary)",
		flexShrink: 0,
		width: 64
	},
	def: {
		fontSize: 14,
		lineHeight: 1.5,
		color: "var(--text-secondary)",
		minWidth: 0
	},
	hr: {
		border: "none",
		borderTop: "1px solid var(--border-light)",
		margin: "4px 0"
	},
	formula: {
		textAlign: "center",
		fontFamily: "monospace",
		fontWeight: 700,
		fontSize: 14,
		color: "var(--text-primary)",
		background: "var(--surface)",
		border: "1px solid var(--border-light)",
		borderRadius: 8,
		padding: "12px 10px",
		marginTop: 8
	},
	panelTitle: {
		fontSize: 16,
		fontWeight: 700,
		color: "var(--text-primary)"
	},
	zoneReadout: {
		fontSize: 18,
		fontWeight: 700,
		textAlign: "center"
	},
	calcRow: {
		display: "flex",
		alignItems: "center",
		justifyContent: "center",
		gap: 14,
		flexWrap: "wrap",
		background: "var(--surface)",
		border: "1px solid var(--border-light)",
		borderRadius: 10,
		padding: "14px 12px",
		boxSizing: "border-box"
	},
	fraction: {
		display: "flex",
		flexDirection: "column",
		alignItems: "center",
		gap: 6,
		minWidth: 0
	},
	fracLine: {
		display: "flex",
		alignItems: "center",
		gap: 8
	},
	step: {
		width: 32,
		height: 32,
		borderRadius: 8,
		border: "1px solid var(--primary-soft)",
		background: "var(--primary-softer)",
		color: "var(--primary)",
		fontWeight: 700,
		fontSize: 18,
		lineHeight: 1,
		cursor: "pointer",
		flexShrink: 0
	},
	fracVal: {
		display: "flex",
		flexDirection: "column",
		alignItems: "center",
		minWidth: 92
	},
	fracNum: {
		fontSize: 22,
		fontWeight: 700,
		color: "var(--text-primary)",
		lineHeight: 1.1
	},
	fracUnit: {
		fontSize: 11,
		color: "var(--text-muted)"
	},
	fracBar: {
		width: "100%",
		height: 2,
		background: "var(--text-secondary)",
		borderRadius: 2
	},
	eq: {
		fontSize: 26,
		fontWeight: 700,
		color: "var(--text-secondary)"
	},
	concBig: {
		display: "flex",
		flexDirection: "column",
		alignItems: "center",
		minWidth: 0
	},
	concNum: {
		fontSize: 30,
		fontWeight: 700,
		lineHeight: 1
	},
	concUnit: {
		fontSize: 12,
		color: "var(--text-muted)",
		fontWeight: 600
	},
	miniNote: {
		fontSize: 11.5,
		lineHeight: 1.5,
		color: "var(--text-muted)",
		textAlign: "center",
		margin: 0
	},
	btn: {
		width: "100%",
		padding: "11px 12px",
		borderRadius: 9,
		border: "1px solid var(--primary-soft)",
		background: "var(--primary-softer)",
		color: "var(--primary)",
		fontWeight: 700,
		fontSize: 14,
		cursor: "pointer",
		boxSizing: "border-box"
	},
	note: {
		fontSize: 12.5,
		lineHeight: 1.5,
		color: "var(--text-muted)",
		textAlign: "center",
		margin: 0
	}
}, je = [
	{
		id: "saltwater",
		label: "Salt water",
		eye: "#cfe4f2",
		layout: "even",
		seed: 11,
		types: {
			w: {
				color: "#7cbbe6",
				r: .011
			},
			na: {
				color: "#b27ad6",
				r: .014
			},
			cl: {
				color: "#5fc98a",
				r: .014
			}
		},
		probs: [
			["w", .7],
			["na", .85],
			["cl", 1]
		],
		composition: "Mixture",
		uniform: !0,
		note: "Lovely — see how the Na⁺ and Cl⁻ ions sit evenly between the water particles? Pan around: it is the same everywhere you look. Each kept its identity, so boil the water off and the salt comes straight back."
	},
	{
		id: "water",
		label: "Pure water",
		eye: "#cfe4f2",
		layout: "single",
		seed: 5,
		img: "https://starkhorn.nadilearning.com/files/slide-assets/b7953a8a-5277-46bd-aec3-8bc8576a1f49/864cf1a4-46a2-4333-ab22-403811c23c8b.jpg",
		types: { w: {
			color: "#5aa8e0",
			r: .012
		} },
		composition: "Compound",
		uniform: !0,
		note: "Notice every single particle is the same H₂O molecule — one brand-new substance. Hydrogen and oxygen gave up their identities to make it. That is a compound."
	},
	{
		id: "ironsulfur",
		label: "Iron + Sulfur",
		eye: "#b3a86a",
		layout: "regions",
		seed: 23,
		types: {
			fe: {
				color: "#9aa0a6",
				r: .02
			},
			s: {
				color: "#e6c84f",
				r: .02
			}
		},
		composition: "Mixture",
		uniform: !1,
		note: "Look closely and pan around — grey iron bits sit right beside yellow sulfur bits, just sharing space. That is why a magnet still grabs the iron straight out: each kept its own properties."
	},
	{
		id: "fes",
		label: "Iron sulfide",
		eye: "#7a7152",
		layout: "lattice",
		seed: 31,
		img: "https://starkhorn.nadilearning.com/files/slide-assets/b7953a8a-5277-46bd-aec3-8bc8576a1f49/a399e728-b127-4f2b-ac52-0e2af2f615f8.webp",
		types: {
			fe: {
				color: "#9aa0a6",
				r: .018
			},
			s: {
				color: "#e6c84f",
				r: .018
			}
		},
		composition: "Compound",
		uniform: !0,
		note: "Heated together, iron and sulfur lock into one ordered crystal — Fe and S atoms alternating in a fixed, repeating lattice. It is a single new substance (FeS), and the magnet does nothing now."
	},
	{
		id: "milk",
		label: "Milk",
		eye: "#f3f5f6",
		layout: "globules",
		seed: 42,
		types: {
			med: {
				color: "#dfe9ee",
				r: .007
			},
			fat: {
				color: "#f1e3b0",
				r: .017
			}
		},
		composition: "Mixture",
		uniform: !1,
		note: "Here is the surprise — it looked like one creamy uniform liquid, but pan around up close and fat globules float in watery fluid. NOT uniform at this scale, so milk is heterogeneous."
	}
];
function Me(e) {
	return function() {
		e |= 0, e = e + 1831565813 | 0;
		let t = Math.imul(e ^ e >>> 15, 1 | e);
		return t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t, ((t ^ t >>> 14) >>> 0) / 4294967296;
	};
}
function Ne(e) {
	let t = Me(e.seed), n = [];
	if (e.layout === "single") {
		let r = Object.keys(e.types)[0];
		for (let e = 0; e < 1300; e++) n.push({
			x: t(),
			y: t(),
			t: r
		});
	} else if (e.layout === "even") for (let r = 0; r < 1300; r++) {
		let r = t(), i = e.probs[0][0];
		for (let [t, n] of e.probs) if (r <= n) {
			i = t;
			break;
		}
		n.push({
			x: t(),
			y: t(),
			t: i
		});
	}
	else if (e.layout === "regions") {
		let e = [];
		for (let n = 0; n < 11; n++) e.push({
			x: t(),
			y: t(),
			t: n % 2 == 0 ? "fe" : "s"
		});
		for (let r = 0; r < 1e3; r++) {
			let r = t(), i = t(), a = 0, o = 9;
			for (let t = 0; t < e.length; t++) {
				let n = (r - e[t].x) ** 2 + (i - e[t].y) ** 2;
				n < o && (o = n, a = t);
			}
			n.push({
				x: r,
				y: i,
				t: e[a].t
			});
		}
	} else if (e.layout === "lattice") for (let e = 0; e < 24; e++) for (let r = 0; r < 24; r++) {
		let i = (e + .5) / 24 + (t() - .5) * .003, a = (r + .5) / 24 + (t() - .5) * .003;
		n.push({
			x: i,
			y: a,
			t: (e + r) % 2 == 0 ? "fe" : "s"
		});
	}
	else if (e.layout === "globules") {
		for (let e = 0; e < 1e3; e++) n.push({
			x: t(),
			y: t(),
			t: "med"
		});
		for (let e = 0; e < 7; e++) {
			let r = e === 0 ? .5 : .12 + t() * .76, i = e === 0 ? .5 : .12 + t() * .76, a = .06 + t() * .05;
			for (let e = 0; e < 55; e++) n.push({
				x: r + (t() - .5) * a * 2,
				y: i + (t() - .5) * a * 2,
				t: "fat"
			});
		}
	}
	return n;
}
var Pe = (e) => Math.max(0, Math.min(1, e));
function Fe({ studentName: t }) {
	let [n, r] = w("saltwater"), [i, a] = w(0), o = C(null), s = C(null), c = C({
		x: 0,
		y: 0
	}), l = C(null), u = C({}), d = je.find((e) => e.id === n), f = ne(() => Ne(d), [n]), p = i / 100, m = i >= 50, h = i >= 88;
	b(() => {
		je.forEach((e) => {
			if (e.img && !u.current[e.id]) {
				let t = new Image();
				t.onload = () => {
					u.current[e.id] = t, s.current && s.current();
				}, t.src = e.img;
			}
		});
	}, []);
	let g = (e) => {
		l.current = {
			x: e.clientX,
			y: e.clientY
		};
		try {
			e.currentTarget.setPointerCapture(e.pointerId);
		} catch {}
	}, _ = (e) => {
		if (!l.current) return;
		let t = o.current;
		if (!t) return;
		let n = t.clientWidth, r = t.clientHeight, a = 1 + i / 100 * 7, u = e.clientX - l.current.x, d = e.clientY - l.current.y;
		l.current = {
			x: e.clientX,
			y: e.clientY
		}, c.current.x -= u / (n * a), c.current.y -= d / (r * a), s.current && s.current();
	}, v = () => {
		l.current = null;
	};
	return b(() => {
		let e = o.current;
		if (!e) return;
		let t = () => {
			let t = e.getContext("2d"), n = e.getBoundingClientRect(), r = window.devicePixelRatio || 1;
			e.width = n.width * r, e.height = n.height * r, t.setTransform(r, 0, 0, r, 0, 0);
			let i = e.clientWidth, a = e.clientHeight, o = Math.min(i, a), s = 1 + p * 7, l = .5 / s, m = Math.min(1 - l, Math.max(l, .5 + c.current.x)), h = Math.min(1 - l, Math.max(l, .5 + c.current.y));
			t.fillStyle = d.eye, t.fillRect(0, 0, i, a);
			let g = u.current[d.id];
			if (g && g.naturalWidth) {
				let e = g.naturalWidth, n = g.naturalHeight, r = i / a, o, c;
				e / n > r ? (c = n, o = n * r) : (o = e, c = e / r);
				let l = (e - o) / 2, u = (n - c) / 2, d = o / s, f = c / s, _ = l + m * o - d / 2, v = u + h * c - f / 2;
				_ = Math.min(l + o - d, Math.max(l, _)), v = Math.min(u + c - f, Math.max(u, v));
				let y = Pe(1 - (p - .3) / .3);
				y > 0 && (t.globalAlpha = y, t.drawImage(g, _, v, d, f, 0, 0, i, a), t.globalAlpha = 1);
			}
			let _ = Pe(g ? (p - .35) / .3 : (p - .05) / .4);
			if (_ > 0) {
				t.globalAlpha = _;
				for (let e of f) {
					let n = i / 2 + (e.x - m) * i * s, r = a / 2 + (e.y - h) * a * s, c = d.types[e.t].r * o * s;
					n < -c || n > i + c || r < -c || r > a + c || (t.beginPath(), t.fillStyle = d.types[e.t].color, t.arc(n, r, c, 0, Math.PI * 2), t.fill());
				}
				t.globalAlpha = 1;
			}
		};
		s.current = t, t();
		let n = new ResizeObserver(() => s.current && s.current());
		return n.observe(e), () => n.disconnect();
	}, [
		n,
		i,
		f,
		d,
		p
	]), /* @__PURE__ */ e.createElement(e.Fragment, null, /* @__PURE__ */ e.createElement("div", {
		className: "slide-title",
		style: N.title
	}, "The Microscopic Level"), /* @__PURE__ */ e.createElement("div", {
		className: "slide-left",
		style: N.left
	}, /* @__PURE__ */ e.createElement("div", { style: N.cardHook }, /* @__PURE__ */ e.createElement("span", { style: N.corner }, "💭"), /* @__PURE__ */ e.createElement("p", { style: N.hookText }, t, ", salt water and milk both look like one smooth, even liquid — so the \"does it look uniform?\" eye-test calls them the same. Don't worry, that trap catches everyone. Let's zoom in and find what really tells them apart.")), /* @__PURE__ */ e.createElement("div", { style: N.block }, /* @__PURE__ */ e.createElement("div", { style: N.bHead }, "Stop trusting your eyes — zoom in"), /* @__PURE__ */ e.createElement("p", { style: N.body }, "The real story lives at the particle level. Two questions settle everything:"), /* @__PURE__ */ e.createElement("p", { style: N.qline }, /* @__PURE__ */ e.createElement("b", null, "1."), " Did the substances keep their identity, or make a new one?"), /* @__PURE__ */ e.createElement("p", { style: N.qline }, /* @__PURE__ */ e.createElement("b", null, "2."), " Is it the same all the way down — even at molecular scale?")), /* @__PURE__ */ e.createElement("div", { style: N.block }, /* @__PURE__ */ e.createElement("div", { style: N.bHead }, "Mixture vs Compound, up close"), /* @__PURE__ */ e.createElement("p", { style: N.body }, /* @__PURE__ */ e.createElement("b", null, "Mixture:"), " particles only ", /* @__PURE__ */ e.createElement("i", null, "share space"), ". Each keeps its own properties — a magnet still pulls the iron out."), /* @__PURE__ */ e.createElement("p", { style: N.body }, /* @__PURE__ */ e.createElement("b", null, "Compound:"), " particles ", /* @__PURE__ */ e.createElement("i", null, "chemically unite"), " into one brand-new substance with new properties. The originals are gone.")), /* @__PURE__ */ e.createElement("div", { style: N.cardInsight }, /* @__PURE__ */ e.createElement("span", { style: N.corner }, "💡"), /* @__PURE__ */ e.createElement("p", { style: N.body }, "True homogeneity means uniform ", /* @__PURE__ */ e.createElement("b", null, "at the molecular level"), " — identical no matter how far you zoom or pan.")), /* @__PURE__ */ e.createElement("div", { style: N.cardPitfall }, /* @__PURE__ */ e.createElement("span", { style: N.corner }, "⚠️"), /* @__PURE__ */ e.createElement("p", { style: N.body }, /* @__PURE__ */ e.createElement("b", null, "Looks uniform ≠ is uniform."), " Milk and blood seem perfectly even to the eye, but zoom in and you find fat globules and blood cells. They are ", /* @__PURE__ */ e.createElement("b", null, "heterogeneous"), "."))), /* @__PURE__ */ e.createElement("div", {
		className: "slide-right",
		style: N.right
	}, /* @__PURE__ */ e.createElement("div", { style: N.panelTitle }, "Microscope: zoom from photo to particles"), /* @__PURE__ */ e.createElement("div", { style: N.chips }, je.map((t) => /* @__PURE__ */ e.createElement("button", {
		key: t.id,
		style: {
			...N.chip,
			...t.id === n ? N.chipOn : {}
		},
		onClick: () => {
			r(t.id), a(0), c.current = {
				x: 0,
				y: 0
			};
		}
	}, t.label))), /* @__PURE__ */ e.createElement("canvas", {
		ref: o,
		style: N.canvas,
		onPointerDown: g,
		onPointerMove: _,
		onPointerUp: v,
		onPointerLeave: v
	}), /* @__PURE__ */ e.createElement("input", {
		type: "range",
		min: 0,
		max: 100,
		value: i,
		onChange: (e) => a(Number(e.target.value)),
		style: N.slider
	}), /* @__PURE__ */ e.createElement("div", { style: N.sliderRow }, /* @__PURE__ */ e.createElement("span", null, "👁 Naked eye"), /* @__PURE__ */ e.createElement("span", null, "Molecular 🔬")), /* @__PURE__ */ e.createElement("div", { style: N.hint }, "Tip: once zoomed in, drag the image to look left, right, up and down."), /* @__PURE__ */ e.createElement("div", { style: N.verdicts }, /* @__PURE__ */ e.createElement("div", { style: N.vCard }, /* @__PURE__ */ e.createElement("div", { style: N.vLabel }, "Composition"), m ? /* @__PURE__ */ e.createElement("div", { style: {
		...N.vValue,
		color: d.composition === "Compound" ? "var(--surprise-text)" : "var(--primary)"
	} }, d.composition) : /* @__PURE__ */ e.createElement("div", { style: N.vLock }, "🔒 zoom in to reveal →")), /* @__PURE__ */ e.createElement("div", { style: N.vCard }, /* @__PURE__ */ e.createElement("div", { style: N.vLabel }, "Uniform at molecular level?"), h ? /* @__PURE__ */ e.createElement("div", { style: {
		...N.vValue,
		color: d.uniform ? "var(--primary)" : "var(--accent-text)"
	} }, d.uniform ? "Homogeneous ✓" : "Heterogeneous ✗") : /* @__PURE__ */ e.createElement("div", { style: N.vLock }, "🔒 keep zooming →"))), /* @__PURE__ */ e.createElement("div", { style: N.caption }, p < .45 ? "This is the real thing at arm’s length — looks like one even substance, doesn’t it? Keep dragging right to dive past the surface into the particles." : d.note)));
}
var Ie = {
	background: "var(--surface-raised)",
	border: "1px solid var(--border-light)",
	borderRadius: 10,
	padding: "14px 18px",
	position: "relative",
	paddingRight: 40
}, N = {
	title: {
		fontSize: 22,
		fontWeight: 700,
		color: "var(--text-primary)"
	},
	left: {
		display: "flex",
		flexDirection: "column",
		gap: 14,
		minWidth: 0
	},
	right: {
		display: "flex",
		flexDirection: "column",
		gap: 12,
		minWidth: 0
	},
	corner: {
		position: "absolute",
		top: 10,
		right: 12,
		fontSize: 16,
		lineHeight: 1
	},
	cardHook: {
		...Ie,
		background: "var(--hook-soft)",
		borderLeft: "2px solid var(--hook)"
	},
	cardInsight: {
		...Ie,
		background: "var(--primary-softer)",
		borderColor: "var(--primary-soft)",
		borderLeft: "2px solid var(--primary)"
	},
	cardPitfall: {
		...Ie,
		background: "var(--accent-soft)",
		borderLeft: "2px solid var(--accent)"
	},
	block: {
		display: "flex",
		flexDirection: "column",
		gap: 6
	},
	bHead: {
		fontSize: 15,
		fontWeight: 700,
		color: "var(--primary)"
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
		lineHeight: 1.6,
		color: "var(--text-primary)",
		margin: 0
	},
	qline: {
		fontSize: 15,
		lineHeight: 1.55,
		color: "var(--text-primary)",
		margin: 0
	},
	panelTitle: {
		fontSize: 16,
		fontWeight: 700,
		color: "var(--text-primary)"
	},
	chips: {
		display: "flex",
		flexWrap: "wrap",
		gap: 6
	},
	chip: {
		fontFamily: "inherit",
		fontSize: 13,
		fontWeight: 600,
		padding: "6px 11px",
		borderRadius: 999,
		border: "1px solid var(--border)",
		background: "var(--surface)",
		color: "var(--text-secondary)",
		cursor: "pointer"
	},
	chipOn: {
		background: "var(--primary)",
		borderColor: "var(--primary)",
		color: "var(--primary-text)"
	},
	canvas: {
		width: "100%",
		aspectRatio: "4 / 3",
		maxHeight: "36vh",
		display: "block",
		borderRadius: 10,
		border: "1px solid var(--border)",
		cursor: "grab",
		touchAction: "none"
	},
	slider: {
		width: "100%",
		accentColor: "var(--primary)",
		marginTop: 2
	},
	sliderRow: {
		display: "flex",
		justifyContent: "space-between",
		fontSize: 12,
		color: "var(--text-muted)",
		marginTop: -4
	},
	hint: {
		fontSize: 12,
		color: "var(--text-muted)",
		textAlign: "center",
		marginTop: -2
	},
	verdicts: {
		display: "flex",
		gap: 10
	},
	vCard: {
		flex: 1,
		minWidth: 0,
		background: "var(--surface)",
		border: "1px solid var(--border-light)",
		borderRadius: 10,
		padding: "10px 12px",
		textAlign: "center"
	},
	vLabel: {
		fontSize: 12,
		fontWeight: 600,
		color: "var(--text-muted)",
		marginBottom: 6,
		lineHeight: 1.3
	},
	vValue: {
		fontSize: 16,
		fontWeight: 700
	},
	vLock: {
		fontSize: 13,
		fontWeight: 600,
		color: "var(--text-muted)"
	},
	caption: {
		fontSize: 13.5,
		lineHeight: 1.55,
		color: "var(--text-secondary)",
		background: "var(--surface)",
		border: "1px solid var(--border-light)",
		borderRadius: 8,
		padding: "10px 12px"
	}
}, Le = {
	mv: {
		key: "mv",
		tab: "🧂 Solid in liquid",
		tag: "% m/v",
		solute: "silver nitrate (solid)",
		soluteUnit: "g",
		wholeUnit: "mL",
		numLabel: "mass of solute",
		denLabel: "volume of SOLUTION",
		why: "Notice the logic: you weigh a solid (grams) but measure liquid by volume (mL) — so grams over millilitres. That is exactly why we tag it m/v.",
		exSolute: 5,
		exSolvent: 95,
		soluteStyle: "solid"
	},
	vv: {
		key: "vv",
		tab: "💧 Liquid in liquid",
		tag: "% v/v",
		solute: "methanol (liquid)",
		soluteUnit: "mL",
		wholeUnit: "mL",
		numLabel: "volume of solute",
		denLabel: "volume of SOLUTION",
		why: "Both components are liquids you pour, so both are in millilitres — millilitres over millilitres. That is the v/v tag, plain and simple.",
		exSolute: 5,
		exSolvent: 95,
		soluteStyle: "liquid"
	},
	mm: {
		key: "mm",
		tab: "⚖️ Whole weighed",
		tag: "% m/m",
		solute: "nitric acid (in reagent)",
		soluteUnit: "g",
		wholeUnit: "g",
		numLabel: "mass of solute",
		denLabel: "mass of SOLUTION",
		why: "Here the whole bottle sits on a balance, so everything is weighed — grams over grams. That is the m/m tag (you may also see it written w/w — same thing).",
		exSolute: 70,
		exSolvent: 30,
		soluteStyle: "liquid"
	}
};
function Re({ num: t, den: n }) {
	return /* @__PURE__ */ e.createElement("span", { style: P.fracWrap }, /* @__PURE__ */ e.createElement("span", { style: P.fracNum }, t), /* @__PURE__ */ e.createElement("span", { style: P.fracDen }, n));
}
function ze({ studentName: t }) {
	let [n, r] = w("mv"), [i, a] = w(5), [o, s] = w(95), [c, l] = w("mm"), u = Le[n], d = i + o, f = d > 0 ? Math.round(i / d * 1e3) / 10 : 0, p = C(null), m = C({
		fill: .05,
		target: .05,
		style: "solid",
		solTotal: 100,
		wholeUnit: "mL"
	});
	return b(() => {
		m.current.target = Math.max(0, Math.min(1, d > 0 ? i / d : 0)), m.current.style = u.soluteStyle, m.current.solTotal = d, m.current.wholeUnit = u.wholeUnit;
	}, [
		i,
		o,
		d,
		u.soluteStyle,
		u.wholeUnit
	]), b(() => {
		let e = p.current;
		if (!e) return;
		let t = e.getContext("2d"), n, r = () => {
			let n = e.getBoundingClientRect(), r = window.devicePixelRatio || 1;
			e.width = n.width * r, e.height = n.height * r, t.setTransform(r, 0, 0, r, 0, 0);
		};
		r();
		let i = new ResizeObserver(r);
		i.observe(e);
		let a = () => {
			let r = e.clientWidth, i = e.clientHeight, o = m.current;
			o.fill += (o.target - o.fill) * .15, t.clearRect(0, 0, r, i);
			let s = Math.min(r * .5, 160), c = r * .5 - s / 2, l = i * .74, d = i * .14, f = d + l * .12;
			t.fillStyle = "rgba(120,180,235,0.22)", t.fillRect(c, f, s, d + l - f);
			let p = o.fill;
			if (o.style === "solid") {
				let e = (e) => {
					let t = Math.sin(e * 127.1 + 311.7) * 43758.5453;
					return t - Math.floor(t);
				}, n = Math.round(6 + p * 110), r = d + l - 8 - (f + 8);
				t.fillStyle = "rgba(70,110,180,0.85)";
				for (let i = 0; i < n; i++) {
					let n = c + 6 + e(i * 2 + 1) * (s - 12), a = f + 8 + e(i * 2 + 2) * r, o = 1.5 + e(i * 2 + 3) * 1.4;
					t.beginPath(), t.arc(n, a, o, 0, Math.PI * 2), t.fill();
				}
			} else {
				let e = (d + l - f) * p;
				t.fillStyle = "rgba(150,90,205,0.4)", t.fillRect(c, d + l - e, s, e);
			}
			t.strokeStyle = "rgba(60,70,90,0.85)", t.lineWidth = 3, t.beginPath(), t.moveTo(c - 4, d), t.lineTo(c, d + 6), t.lineTo(c, d + l), t.lineTo(c + s, d + l), t.lineTo(c + s, d + 6), t.lineTo(c + s + 4, d), t.stroke(), t.fillStyle = "rgba(40,50,70,0.9)", t.font = "600 12px Outfit, sans-serif", t.textAlign = "center";
			let h = o.solTotal == null ? 100 : Math.round(o.solTotal), g = o.wholeUnit || u.wholeUnit;
			t.fillText(h + " " + g + " of SOLUTION", r * .5, d + l + 22), n = requestAnimationFrame(a);
		};
		return a(), () => {
			cancelAnimationFrame(n), i.disconnect();
		};
	}, [n, u.wholeUnit]), /* @__PURE__ */ e.createElement(e.Fragment, null, /* @__PURE__ */ e.createElement("div", {
		className: "slide-title",
		style: P.title
	}, "Three ways to say \"how much\""), /* @__PURE__ */ e.createElement("div", {
		className: "slide-left",
		style: P.left
	}, /* @__PURE__ */ e.createElement("div", { style: P.cardHook }, /* @__PURE__ */ e.createElement("span", { style: P.cornerEmoji }, "💭"), /* @__PURE__ */ e.createElement("p", { style: P.hookText }, t, ", chemistry has its own language, and these little tags — m/m, m/v, v/v — are its grammar. Don't let them rattle you. A bottle just says \"5%\". Five what — grams or millilitres? Per gram, or per millilitre? Stick with me: read the tag and it always makes sense.")), /* @__PURE__ */ e.createElement("div", { style: P.plain }, /* @__PURE__ */ e.createElement("p", { style: P.body }, "We sometimes express concentrations in terms of percent (parts per hundred). Unfortunately, this practice can be a source of ambiguity, because the percent composition of a solution can be written in several ways. Three common methods are:"), /* @__PURE__ */ e.createElement("div", { style: P.defs }, /* @__PURE__ */ e.createElement("div", { style: P.defRow }, /* @__PURE__ */ e.createElement("span", { style: P.defName }, "weight percent (w/w) ="), /* @__PURE__ */ e.createElement(Re, {
		num: "weight solute",
		den: "weight solution"
	}), /* @__PURE__ */ e.createElement("span", { style: P.defTail }, "× 100%")), /* @__PURE__ */ e.createElement("div", { style: P.defRow }, /* @__PURE__ */ e.createElement("span", { style: P.defName }, "volume percent (v/v) ="), /* @__PURE__ */ e.createElement(Re, {
		num: "volume solute",
		den: "volume solution"
	}), /* @__PURE__ */ e.createElement("span", { style: P.defTail }, "× 100%")), /* @__PURE__ */ e.createElement("div", { style: P.defRow }, /* @__PURE__ */ e.createElement("span", { style: P.defName }, "weight/volume percent (w/v) ="), /* @__PURE__ */ e.createElement(Re, {
		num: "weight solute, g",
		den: "volume solution, mL"
	}), /* @__PURE__ */ e.createElement("span", { style: P.defTail }, "× 100%"))), /* @__PURE__ */ e.createElement("p", { style: P.body }, "Note that the denominator in each expression is the mass or volume of ", /* @__PURE__ */ e.createElement("b", null, "solution"), ", not of solvent. Note also that the first two do not depend on the units chosen, as long as the numerator and denominator share the same unit. In the third expression the units must be stated, because grams and millilitres do not cancel. Of the three, only weight percent has the advantage of being temperature independent.")), /* @__PURE__ */ e.createElement("div", { style: P.plain }, /* @__PURE__ */ e.createElement("div", { style: P.leadHead }, "One formula, three honest uses"), /* @__PURE__ */ e.createElement("p", { style: P.body }, "Here is the reassuring part — it is always the same logic, worked in three steps:"), /* @__PURE__ */ e.createElement("div", { style: P.formulaPlain }, "(part ÷ whole) × 100"), /* @__PURE__ */ e.createElement("p", { style: P.body }, /* @__PURE__ */ e.createElement("b", null, "Step 1"), " — measure the part (the solute). ", /* @__PURE__ */ e.createElement("b", null, "Step 2"), " — measure the whole (the solution). ", /* @__PURE__ */ e.createElement("b", null, "Step 3"), " — divide, then ×100."), /* @__PURE__ */ e.createElement("p", { style: P.body }, "The only thing that changes is ", /* @__PURE__ */ e.createElement("b", null, "what you measured"), ": you weigh solids in grams and pour liquids in millilitres. So the units in the formula come straight from the bench (the ", /* @__PURE__ */ e.createElement("i", null, "macroscopic"), " level), not from the substance itself.")), /* @__PURE__ */ e.createElement("div", { style: P.cardInsight }, /* @__PURE__ */ e.createElement("span", { style: P.cornerEmoji }, "💡"), /* @__PURE__ */ e.createElement("p", { style: P.body }, "Hold onto this one: the denominator is always the ", /* @__PURE__ */ e.createElement("b", null, "whole solution"), " — solute included — never just the solvent. And the metric is a ", /* @__PURE__ */ e.createElement("b", null, "choice driven by how you measured"), ", not a fixed property of the substance. Master that, and every label becomes readable.")), /* @__PURE__ */ e.createElement("div", { style: P.cardPitfall }, /* @__PURE__ */ e.createElement("span", { style: P.cornerEmoji }, "⚠️"), /* @__PURE__ */ e.createElement("p", { style: P.body }, "Be precise here — it matters. The ", /* @__PURE__ */ e.createElement("b", null, "same"), " NaOH solution is 50% m/m ", /* @__PURE__ */ e.createElement("i", null, "and"), " 76.3% m/v at the same time. Strip the tag and the number misleads. So always write the tag: m/m, m/v or v/v. (Note: m/m = w/w — same thing, two names.)"))), /* @__PURE__ */ e.createElement("div", {
		className: "slide-right",
		style: P.right
	}, /* @__PURE__ */ e.createElement("div", { style: P.panelTitle }, "Your turn: build the percentage step by step"), /* @__PURE__ */ e.createElement("div", { style: P.tabs }, Object.values(Le).map((t) => /* @__PURE__ */ e.createElement("button", {
		key: t.key,
		onClick: () => {
			r(t.key), a(t.exSolute), s(t.exSolvent);
		},
		style: n === t.key ? P.tabOn : P.tab
	}, t.tab))), /* @__PURE__ */ e.createElement("canvas", {
		ref: p,
		style: P.canvas
	}), /* @__PURE__ */ e.createElement("div", { style: P.diagramNote }, "Picture the two levels: this ", /* @__PURE__ */ e.createElement("i", null, "macroscopic"), " diagram shows ", /* @__PURE__ */ e.createElement("b", null, "how much solute vs solvent"), " went in. At the ", /* @__PURE__ */ e.createElement("i", null, "microscopic"), " level the solute is fully dissolved, so the real solution is ", /* @__PURE__ */ e.createElement("b", null, "uniform throughout"), "."), /* @__PURE__ */ e.createElement("div", { style: P.tagRow }, /* @__PURE__ */ e.createElement("span", { style: P.tagBig }, u.tag), /* @__PURE__ */ e.createElement("span", { style: P.tagSolute }, u.solute)), /* @__PURE__ */ e.createElement("div", { style: P.builder }, /* @__PURE__ */ e.createElement("div", { style: P.fraction }, /* @__PURE__ */ e.createElement("div", { style: P.fracPart }, /* @__PURE__ */ e.createElement("div", { style: P.stepper }, /* @__PURE__ */ e.createElement("button", {
		style: P.stepBtn,
		onClick: () => a((e) => Math.max(0, e - 5))
	}, "−"), /* @__PURE__ */ e.createElement("span", { style: P.stepVal }, i, " ", u.soluteUnit), /* @__PURE__ */ e.createElement("button", {
		style: P.stepBtn,
		onClick: () => a((e) => Math.min(200, e + 5))
	}, "+")), /* @__PURE__ */ e.createElement("span", { style: P.fracLbl }, u.numLabel)), /* @__PURE__ */ e.createElement("div", { style: P.fracBar }), /* @__PURE__ */ e.createElement("div", { style: P.fracPart }, /* @__PURE__ */ e.createElement("span", { style: P.fracLbl }, u.denLabel, " (solute + solvent)"), /* @__PURE__ */ e.createElement("div", { style: P.stepper }, /* @__PURE__ */ e.createElement("button", {
		style: P.stepBtn,
		onClick: () => s((e) => Math.max(0, e - 5))
	}, "−"), /* @__PURE__ */ e.createElement("span", { style: P.stepVal }, d, " ", u.wholeUnit), /* @__PURE__ */ e.createElement("button", {
		style: P.stepBtn,
		onClick: () => s((e) => Math.min(400, e + 5))
	}, "+")), /* @__PURE__ */ e.createElement("span", { style: P.fracSub }, "± changes the solvent"))), /* @__PURE__ */ e.createElement("span", { style: P.eqSign }, "×100 ="), /* @__PURE__ */ e.createElement("div", { style: P.concBox }, /* @__PURE__ */ e.createElement("span", { style: P.concVal }, f, "%"), /* @__PURE__ */ e.createElement("span", { style: P.concTag }, u.tag.replace("% ", "")))), /* @__PURE__ */ e.createElement("div", { style: P.builderHint }, "Use ", /* @__PURE__ */ e.createElement("b", null, "+ / −"), " to set the solute (top) and solvent (bottom). The denominator is the whole ", /* @__PURE__ */ e.createElement("b", null, "solution"), ", so adding solute lifts the top ", /* @__PURE__ */ e.createElement("i", null, "and"), " the bottom together."), /* @__PURE__ */ e.createElement("div", { style: P.why }, u.why), /* @__PURE__ */ e.createElement("div", { style: P.dual }, /* @__PURE__ */ e.createElement("div", { style: P.dualHead }, "Try this — one bottle of NaOH, flip the tag"), /* @__PURE__ */ e.createElement("img", {
		src: "https://starkhorn.nadilearning.com/files/slide-assets/b7953a8a-5277-46bd-aec3-8bc8576a1f49/e8a92bf2-b837-4315-a39c-db0f09446d3c.jpg",
		alt: "A labelled bottle of sodium hydroxide (NaOH) with solid pellets",
		style: P.dualImg
	}), /* @__PURE__ */ e.createElement("div", { style: P.dualBtns }, /* @__PURE__ */ e.createElement("button", {
		onClick: () => l("mm"),
		style: c === "mm" ? P.dualOn : P.dualBtn
	}, "read as m/m"), /* @__PURE__ */ e.createElement("button", {
		onClick: () => l("mv"),
		style: c === "mv" ? P.dualOn : P.dualBtn
	}, "read as m/v")), /* @__PURE__ */ e.createElement("div", { style: P.dualOut }, c === "mm" ? /* @__PURE__ */ e.createElement(e.Fragment, null, "763 g NaOH per ", /* @__PURE__ */ e.createElement("b", null, "1000 g"), " of solution → ", /* @__PURE__ */ e.createElement("span", { style: P.dualPct }, "50% m/m")) : /* @__PURE__ */ e.createElement(e.Fragment, null, "763 g NaOH per ", /* @__PURE__ */ e.createElement("b", null, "1000 mL"), " of solution → ", /* @__PURE__ */ e.createElement("span", { style: P.dualPct }, "76.3% m/v"))), /* @__PURE__ */ e.createElement("div", { style: P.dualNote }, "Look closely: nothing in the bottle changed — only the denominator did. That is why the tag is never optional."))));
}
var Be = {
	borderRadius: 10,
	padding: "14px 18px",
	position: "relative"
}, P = {
	title: {
		fontSize: 22,
		fontWeight: 700,
		color: "var(--text-primary)"
	},
	left: {
		display: "flex",
		flexDirection: "column",
		gap: 14,
		minWidth: 0
	},
	right: {
		display: "flex",
		flexDirection: "column",
		gap: 12,
		minWidth: 0
	},
	cornerEmoji: {
		position: "absolute",
		top: 10,
		right: 12,
		fontSize: 16,
		lineHeight: 1
	},
	cardHook: {
		...Be,
		background: "var(--hook-soft)",
		borderLeft: "2px solid var(--hook)",
		paddingRight: 36
	},
	cardInsight: {
		...Be,
		background: "var(--primary-softer)",
		border: "1px solid var(--primary-soft)",
		borderLeft: "2px solid var(--primary)",
		paddingRight: 36
	},
	cardPitfall: {
		...Be,
		background: "var(--accent-soft)",
		borderLeft: "2px solid var(--accent)",
		paddingRight: 36
	},
	plain: { padding: "0 2px" },
	leadHead: {
		fontSize: 15,
		fontWeight: 700,
		color: "var(--primary)",
		marginBottom: 6
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
		lineHeight: 1.6,
		color: "var(--text-primary)",
		margin: "6px 0"
	},
	formulaPlain: {
		textAlign: "center",
		fontFamily: "monospace",
		fontWeight: 700,
		fontSize: 18,
		color: "var(--text-primary)",
		margin: "10px 0"
	},
	defs: {
		display: "flex",
		flexDirection: "column",
		gap: 10,
		margin: "10px 0"
	},
	defRow: {
		display: "flex",
		alignItems: "center",
		flexWrap: "wrap",
		gap: 8,
		minWidth: 0
	},
	defName: {
		fontSize: 13.5,
		fontWeight: 600,
		color: "var(--text-primary)"
	},
	defTail: {
		fontFamily: "monospace",
		fontSize: 13,
		fontWeight: 700,
		color: "var(--text-secondary)"
	},
	fracWrap: {
		display: "inline-flex",
		flexDirection: "column",
		alignItems: "center",
		fontFamily: "monospace",
		fontSize: 12.5,
		fontWeight: 700,
		color: "var(--primary)"
	},
	fracNum: { padding: "0 8px 2px" },
	fracDen: {
		padding: "2px 8px 0",
		borderTop: "1.5px solid var(--text-secondary)"
	},
	panelTitle: {
		fontSize: 16,
		fontWeight: 700,
		color: "var(--text-primary)"
	},
	tabs: {
		display: "flex",
		gap: 6,
		flexWrap: "wrap"
	},
	tab: {
		flex: "1 1 30%",
		minWidth: 0,
		padding: "8px 6px",
		fontSize: 12.5,
		fontWeight: 600,
		fontFamily: "Outfit, sans-serif",
		color: "var(--text-secondary)",
		background: "var(--surface)",
		border: "1px solid var(--border-light)",
		borderRadius: 8,
		cursor: "pointer"
	},
	tabOn: {
		flex: "1 1 30%",
		minWidth: 0,
		padding: "8px 6px",
		fontSize: 12.5,
		fontWeight: 700,
		fontFamily: "Outfit, sans-serif",
		color: "var(--primary-text)",
		background: "var(--primary)",
		border: "1px solid var(--primary)",
		borderRadius: 8,
		cursor: "pointer"
	},
	canvas: {
		width: "100%",
		aspectRatio: "5 / 3",
		maxHeight: "30vh",
		display: "block",
		background: "var(--surface)",
		border: "1px solid var(--border-light)",
		borderRadius: 8
	},
	diagramNote: {
		fontSize: 12,
		lineHeight: 1.5,
		color: "var(--text-muted)",
		textAlign: "center",
		fontStyle: "italic",
		margin: "-2px 0 0"
	},
	tagRow: {
		display: "flex",
		alignItems: "baseline",
		gap: 10,
		justifyContent: "center"
	},
	tagBig: {
		fontSize: 20,
		fontWeight: 700,
		color: "var(--primary)"
	},
	tagSolute: {
		fontSize: 13,
		color: "var(--text-muted)"
	},
	builder: {
		display: "flex",
		alignItems: "center",
		justifyContent: "center",
		gap: 14,
		flexWrap: "wrap",
		background: "var(--surface)",
		border: "1px solid var(--border-light)",
		borderRadius: 10,
		padding: "14px 12px"
	},
	fraction: {
		display: "flex",
		flexDirection: "column",
		alignItems: "stretch",
		gap: 5,
		minWidth: 0
	},
	fracPart: {
		display: "flex",
		flexDirection: "column",
		alignItems: "center",
		gap: 3
	},
	fracBar: {
		height: 2,
		background: "var(--text-secondary)",
		borderRadius: 2,
		margin: "3px 0"
	},
	stepper: {
		display: "flex",
		alignItems: "center",
		gap: 8
	},
	stepBtn: {
		width: 28,
		height: 28,
		borderRadius: 7,
		border: "1px solid var(--border)",
		background: "var(--surface-raised)",
		color: "var(--primary)",
		fontSize: 18,
		fontWeight: 700,
		lineHeight: 1,
		cursor: "pointer",
		fontFamily: "Outfit, sans-serif",
		display: "flex",
		alignItems: "center",
		justifyContent: "center",
		flexShrink: 0
	},
	stepVal: {
		fontFamily: "monospace",
		fontWeight: 700,
		fontSize: 16,
		color: "var(--text-primary)",
		minWidth: 70,
		textAlign: "center"
	},
	fracLbl: {
		fontSize: 10.5,
		color: "var(--text-muted)",
		textAlign: "center"
	},
	fracSub: {
		fontSize: 9.5,
		color: "var(--text-muted)",
		textAlign: "center",
		fontStyle: "italic"
	},
	eqSign: {
		fontFamily: "monospace",
		fontWeight: 700,
		fontSize: 16,
		color: "var(--text-secondary)"
	},
	concBox: {
		display: "flex",
		flexDirection: "column",
		alignItems: "center",
		gap: 2,
		background: "var(--primary-softer)",
		border: "1px solid var(--primary-soft)",
		borderRadius: 10,
		padding: "8px 16px"
	},
	concVal: {
		fontFamily: "monospace",
		fontWeight: 700,
		fontSize: 30,
		color: "var(--primary)",
		lineHeight: 1
	},
	concTag: {
		fontSize: 12,
		fontWeight: 700,
		color: "var(--primary)"
	},
	builderHint: {
		fontSize: 12.5,
		lineHeight: 1.5,
		color: "var(--text-muted)",
		textAlign: "center"
	},
	why: {
		fontSize: 13,
		lineHeight: 1.5,
		color: "var(--text-secondary)",
		textAlign: "center",
		fontStyle: "italic"
	},
	dual: {
		background: "var(--surprise-soft)",
		border: "1px solid var(--surprise)",
		borderRadius: 10,
		padding: "12px 14px",
		display: "flex",
		flexDirection: "column",
		gap: 8
	},
	dualHead: {
		fontSize: 13.5,
		fontWeight: 700,
		color: "var(--surprise-text)"
	},
	dualImg: {
		display: "block",
		width: "100%",
		maxWidth: 200,
		maxHeight: "24vh",
		objectFit: "contain",
		borderRadius: 8,
		margin: "0 auto",
		background: "var(--surface)",
		border: "1px solid var(--border-light)"
	},
	dualImg: {
		display: "block",
		width: "100%",
		maxWidth: 200,
		maxHeight: "24vh",
		objectFit: "contain",
		borderRadius: 8,
		margin: "0 auto",
		background: "var(--surface)",
		border: "1px solid var(--border-light)"
	},
	dualBtns: {
		display: "flex",
		gap: 8
	},
	dualBtn: {
		flex: 1,
		padding: "7px 6px",
		fontSize: 12.5,
		fontWeight: 600,
		fontFamily: "Outfit, sans-serif",
		color: "var(--text-secondary)",
		background: "var(--surface)",
		border: "1px solid var(--border-light)",
		borderRadius: 8,
		cursor: "pointer"
	},
	dualOn: {
		flex: 1,
		padding: "7px 6px",
		fontSize: 12.5,
		fontWeight: 700,
		fontFamily: "Outfit, sans-serif",
		color: "var(--surprise-text)",
		background: "var(--surface)",
		border: "1px solid var(--surprise)",
		borderRadius: 8,
		cursor: "pointer"
	},
	dualOut: {
		fontSize: 14,
		color: "var(--text-primary)",
		textAlign: "center"
	},
	dualPct: {
		fontWeight: 700,
		color: "var(--surprise-text)"
	},
	dualNote: {
		fontSize: 12,
		color: "var(--text-muted)",
		textAlign: "center",
		fontStyle: "italic"
	}
}, Ve = {
	acid: {
		img: "https://starkhorn.nadilearning.com/files/slide-assets/b7953a8a-5277-46bd-aec3-8bc8576a1f49/4bda4de7-d75b-4fd5-af01-758a514f3172.jpg",
		emoji: "🧪",
		tab: "Stock acid",
		title: "Hydrochloric acid",
		xLabel: "Concentration",
		unit: " M",
		min: 0,
		max: 12,
		step: .5,
		def: 2,
		band: [1, 3],
		real: 2,
		up: {
			name: "Reaction strength",
			val: (e) => .1 + e / 12 * .9
		},
		down: {
			name: "Safe to handle",
			val: (e) => 1 - e / 12 * .95
		},
		low: "Too dilute — it barely reacts. Strengthen it before you waste your time.",
		high: "Too concentrated — this is corrosive stockroom acid. Dilute it first; safety comes before convenience.",
		good: "Spot on — ~2 M working acid: strong enough to react, dilute enough to handle safely.",
		dilute: !0,
		stock: 12
	},
	gold: {
		img: "https://starkhorn.nadilearning.com/files/slide-assets/b7953a8a-5277-46bd-aec3-8bc8576a1f49/f65ee2fd-e967-4c30-b46a-9eb2842dfc8a.webp",
		emoji: "🥇",
		tab: "Gold ring",
		title: "Gold jewellery",
		xLabel: "Purity",
		unit: "K",
		min: 0,
		max: 24,
		step: 1,
		def: 22,
		band: [16, 22],
		real: 22,
		up: {
			name: "Shine & value",
			val: (e) => e / 24
		},
		down: {
			name: "Durability",
			val: (e) => 1 - e / 24 * .9
		},
		low: "Too little gold — loaded with copper, so it looks dull and cheap.",
		high: "Too pure — 24K is the purest gold made, yet so soft a ring bends, dents and scratches in daily wear.",
		good: "Well judged — 22K gleams like real gold, alloyed just enough to survive daily wear."
	},
	fuel: {
		img: "https://starkhorn.nadilearning.com/files/slide-assets/b7953a8a-5277-46bd-aec3-8bc8576a1f49/0e836a0e-7fa2-4acc-b2b7-b61ac5fba309.jpg",
		emoji: "⛽",
		tab: "Petrol",
		title: "Ethanol blend",
		xLabel: "Ethanol",
		unit: "%",
		min: 0,
		max: 100,
		step: 5,
		def: 10,
		band: [5, 15],
		real: 10,
		up: {
			name: "Octane (anti-knock)",
			val: (e) => .4 + e / 100 * .6
		},
		down: {
			name: "Mileage per litre",
			val: (e) => 1 - e / 100 * .45
		},
		low: "Too little ethanol — pure petrol gives great mileage, but it knocks and pings in high-compression engines.",
		high: "Too much ethanol — high octane, but it carries less energy, so you refuel far more often.",
		good: "Nicely balanced — E10 resists engine knock, and mileage barely drops."
	}
};
function He({ studentName: t }) {
	let [n, r] = w("acid"), i = Ve[n], [a, o] = w(i.def), s = (e) => {
		r(e), o(Ve[e].def);
	}, c = (e) => (e - i.min) / (i.max - i.min) * 100, l = C(null), u = C(!1), d = (e) => {
		let t = l.current;
		if (!t) return;
		let n = t.getBoundingClientRect(), r = (e - n.left) / n.width;
		r = Math.max(0, Math.min(1, r));
		let a = Math.round((i.min + r * (i.max - i.min)) / i.step) * i.step;
		a = Math.max(i.min, Math.min(i.max, a)), o(Number(a.toFixed(2)));
	}, f = (e) => {
		u.current = !0;
		try {
			e.currentTarget.setPointerCapture(e.pointerId);
		} catch {}
		d(e.clientX);
	}, p = (e) => {
		u.current && d(e.clientX);
	}, m = (e) => {
		u.current = !1;
		try {
			e.currentTarget.releasePointerCapture(e.pointerId);
		} catch {}
	}, h = (e) => {
		(e.key === "ArrowLeft" || e.key === "ArrowDown") && (o((e) => Math.max(i.min, Number((e - i.step).toFixed(2)))), e.preventDefault()), (e.key === "ArrowRight" || e.key === "ArrowUp") && (o((e) => Math.min(i.max, Number((e + i.step).toFixed(2)))), e.preventDefault());
	}, g = a >= i.band[0] && a <= i.band[1], _ = g ? "in" : a < i.band[0] ? "low" : "high", v = _ === "in" ? "#16a34a" : _ === "high" ? "#dc2626" : "#9ca3af", y = _ === "in" ? "rgba(22,163,74,0.18)" : _ === "high" ? "rgba(220,38,38,0.16)" : "rgba(156,163,175,0.18)", b = g ? i.good : a < i.band[0] ? i.low : i.high, x = Math.max(0, Math.min(1, i.up.val(a))) * 100, S = Math.max(0, Math.min(1, i.down.val(a))) * 100, ee = i.dilute && a > 0 ? i.stock / a : null, te = ee ? Math.max(0, Math.round(ee - 1)) : 0;
	return /* @__PURE__ */ e.createElement(e.Fragment, null, /* @__PURE__ */ e.createElement("div", {
		className: "slide-title",
		style: F.title
	}, "Composition is a trade-off, not a ranking"), /* @__PURE__ */ e.createElement("div", {
		className: "slide-left",
		style: F.left
	}, /* @__PURE__ */ e.createElement("div", { style: F.cardHook }, /* @__PURE__ */ e.createElement("span", { style: F.corner }, "💭"), /* @__PURE__ */ e.createElement("p", { style: F.hookText }, t, ", chemistry can feel like learning a new language — but you already read it every day. Three labels, three numbers: ", /* @__PURE__ */ e.createElement("b", null, "22 g"), " sugar (a Coke), ", /* @__PURE__ */ e.createElement("b", null, "22K"), " (a gold ring), ", /* @__PURE__ */ e.createElement("b", null, "E10"), " (a petrol pump). Each one is a decision in disguise. Let's learn to decode them.")), /* @__PURE__ */ e.createElement("div", { style: F.section }, /* @__PURE__ */ e.createElement("div", { style: F.plainHead }, "One number, two questions"), /* @__PURE__ */ e.createElement("p", { style: F.body }, "Build one reliable habit: whenever you meet a concentration, ask both questions."), /* @__PURE__ */ e.createElement("p", { style: F.body }, /* @__PURE__ */ e.createElement("b", null, "1. Consume — is it safe?"), " 0.9% saline matches blood; the AQI tells you whether to go outside."), /* @__PURE__ */ e.createElement("p", { style: F.body }, /* @__PURE__ */ e.createElement("b", null, "2. Perform — is it right for the job?"), " Under 1% carbon turns soft iron into knife-hard steel; E10 fuel resists engine knock.")), /* @__PURE__ */ e.createElement("div", { style: F.cardInsight }, /* @__PURE__ */ e.createElement("span", { style: F.corner }, "💡"), /* @__PURE__ */ e.createElement("p", { style: F.body }, "Here is the one idea worth mastering: raise the composition and one property improves while another gets worse. No ranking exists — only a ", /* @__PURE__ */ e.createElement("b", null, "usable window"), ". 24K is the purest gold made, yet it is useless for a ring.")), /* @__PURE__ */ e.createElement("div", { style: F.section }, /* @__PURE__ */ e.createElement("div", { style: F.plainHead }, "Dilution"), /* @__PURE__ */ e.createElement("p", { style: F.body }, "Dilution is the procedure for preparing a less concentrated solution from a more concentrated one.")), /* @__PURE__ */ e.createElement("div", { style: F.section }, /* @__PURE__ */ e.createElement("div", { style: F.plainHead }, "Worked example — diluting to the window"), /* @__PURE__ */ e.createElement("p", { style: F.body }, /* @__PURE__ */ e.createElement("b", null, "Strategy:"), " a stockroom keeps acid concentrated; before use you dilute (add solvent) to reach the safe band. Find how much water per part of acid."), /* @__PURE__ */ e.createElement("p", { style: F.body }, /* @__PURE__ */ e.createElement("b", null, "Solution."), " Make 2 M from a 12 M stock:"), /* @__PURE__ */ e.createElement("p", { style: F.step }, /* @__PURE__ */ e.createElement("b", null, "1."), " Dilution factor = 12 ÷ 2 = ", /* @__PURE__ */ e.createElement("b", null, "6"), " → the mixture is 6 parts in total."), /* @__PURE__ */ e.createElement("p", { style: F.step }, /* @__PURE__ */ e.createElement("b", null, "2."), " One part is acid, so water = 6 − 1 = ", /* @__PURE__ */ e.createElement("b", null, "5"), " parts."), /* @__PURE__ */ e.createElement("p", { style: F.step }, /* @__PURE__ */ e.createElement("b", null, "3."), " Mix ", /* @__PURE__ */ e.createElement("b", null, "1 part acid : 5 parts water"), ". ✓")), /* @__PURE__ */ e.createElement("div", { style: F.cardPitfall }, /* @__PURE__ */ e.createElement("span", { style: F.corner }, "⚠️"), /* @__PURE__ */ e.createElement("p", { style: F.body }, "Be precise: \"more concentrated\" does not mean \"better\" — often it just means more dangerous, or wrong for the job. And notice the link forward — reading what is in a mixture is step one of pulling it apart (the bridge to separation)."))), /* @__PURE__ */ e.createElement("div", {
		className: "slide-right",
		style: F.right
	}, /* @__PURE__ */ e.createElement("div", { style: F.tabs }, Object.keys(Ve).map((t) => {
		let r = Ve[t], i = t === n;
		return /* @__PURE__ */ e.createElement("button", {
			key: t,
			onClick: () => s(t),
			style: {
				...F.tab,
				...r.img ? F.tabImg : F.tabEmoji,
				...i ? F.tabOn : {}
			}
		}, r.img ? /* @__PURE__ */ e.createElement(e.Fragment, null, /* @__PURE__ */ e.createElement("img", {
			src: r.img,
			alt: r.tab,
			style: F.tabImgPic
		}), /* @__PURE__ */ e.createElement("span", { style: F.tabImgLabel }, r.tab), i && /* @__PURE__ */ e.createElement("span", { style: F.tabCheck }, "✓")) : /* @__PURE__ */ e.createElement("span", { style: F.tabEmojiInner }, /* @__PURE__ */ e.createElement("span", { style: { fontSize: 18 } }, r.emoji), " ", r.tab));
	})), /* @__PURE__ */ e.createElement("div", { style: {
		...F.stage,
		outline: "2px solid " + v,
		boxShadow: "0 0 0 4px " + y
	} }, /* @__PURE__ */ e.createElement("div", { style: F.stageHead }, /* @__PURE__ */ e.createElement("span", { style: { fontSize: 30 } }, i.emoji), /* @__PURE__ */ e.createElement("div", { style: { minWidth: 0 } }, /* @__PURE__ */ e.createElement("div", { style: F.stageTitle }, i.title), /* @__PURE__ */ e.createElement("div", { style: F.stageVal }, i.xLabel, ": ", /* @__PURE__ */ e.createElement("b", null, a, i.unit)))), /* @__PURE__ */ e.createElement("div", { style: F.trackWrap }, /* @__PURE__ */ e.createElement("div", {
		ref: l,
		style: F.track,
		onPointerDown: f,
		onPointerMove: p,
		onPointerUp: m,
		onKeyDown: h,
		tabIndex: 0,
		role: "slider",
		"aria-valuemin": i.min,
		"aria-valuemax": i.max,
		"aria-valuenow": a
	}, /* @__PURE__ */ e.createElement("div", { style: F.trackBase }), /* @__PURE__ */ e.createElement("div", { style: {
		...F.windowBand,
		left: c(i.band[0]) + "%",
		width: c(i.band[1]) - c(i.band[0]) + "%"
	} }), /* @__PURE__ */ e.createElement("div", { style: {
		...F.realMark,
		left: c(i.real) + "%"
	} }), /* @__PURE__ */ e.createElement("div", { style: {
		...F.thumb,
		left: c(a) + "%",
		background: v
	} })), /* @__PURE__ */ e.createElement("div", { style: F.bandLabels }, /* @__PURE__ */ e.createElement("span", null, i.min, i.unit), /* @__PURE__ */ e.createElement("span", { style: F.usedTag }, "green = usable window"), /* @__PURE__ */ e.createElement("span", null, i.max, i.unit))), /* @__PURE__ */ e.createElement("div", { style: F.bars }, /* @__PURE__ */ e.createElement("div", { style: F.barRow }, /* @__PURE__ */ e.createElement("span", { style: F.barName }, i.up.name), /* @__PURE__ */ e.createElement("div", { style: F.barTrack }, /* @__PURE__ */ e.createElement("div", { style: {
		...F.barFill,
		width: x + "%",
		background: "var(--primary)"
	} }))), /* @__PURE__ */ e.createElement("div", { style: F.barRow }, /* @__PURE__ */ e.createElement("span", { style: F.barName }, i.down.name), /* @__PURE__ */ e.createElement("div", { style: F.barTrack }, /* @__PURE__ */ e.createElement("div", { style: {
		...F.barFill,
		width: S + "%",
		background: "var(--accent)"
	} })))), i.dilute && /* @__PURE__ */ e.createElement("div", { style: F.dilute }, "💧 To get ", a, i.unit, " from ", i.stock, " M stock: ", /* @__PURE__ */ e.createElement("b", null, "1 part acid : ", te, " part", te === 1 ? "" : "s", " water")), /* @__PURE__ */ e.createElement("div", { style: {
		...F.verdict,
		...g ? F.verdictGood : F.verdictBad
	} }, g ? "✓ In the usable window — " : "✗ ", b)), /* @__PURE__ */ e.createElement("div", { style: F.hint }, "Try it yourself: tap a product, then drag the slider and watch the blue and amber bars pull in opposite directions. No single \"best\" exists — only a usable window.")));
}
var Ue = {
	background: "var(--surface-raised)",
	border: "1px solid var(--border-light)",
	borderRadius: 10,
	padding: "14px 38px 14px 18px",
	position: "relative"
}, F = {
	title: {
		fontSize: 22,
		fontWeight: 700,
		color: "var(--text-primary)"
	},
	left: {
		display: "flex",
		flexDirection: "column",
		gap: 14,
		minWidth: 0
	},
	right: {
		display: "flex",
		flexDirection: "column",
		gap: 12,
		minWidth: 0
	},
	corner: {
		position: "absolute",
		top: 12,
		right: 12,
		fontSize: 16,
		lineHeight: 1
	},
	cardHook: {
		...Ue,
		background: "var(--hook-soft)",
		borderLeft: "2px solid var(--hook)"
	},
	cardInsight: {
		...Ue,
		background: "var(--primary-softer)",
		borderColor: "var(--primary-soft)",
		borderLeft: "2px solid var(--primary)"
	},
	cardPitfall: {
		...Ue,
		background: "var(--accent-soft)",
		borderLeft: "2px solid var(--accent)"
	},
	section: {
		display: "flex",
		flexDirection: "column",
		gap: 6,
		minWidth: 0,
		padding: "0 2px"
	},
	plainHead: {
		fontSize: 15,
		fontWeight: 700,
		color: "var(--primary)",
		marginBottom: 2
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
		lineHeight: 1.6,
		color: "var(--text-primary)",
		margin: 0
	},
	step: {
		fontSize: 15,
		lineHeight: 1.55,
		color: "var(--text-primary)",
		margin: 0,
		paddingLeft: 10
	},
	tabs: {
		display: "flex",
		gap: 8,
		alignItems: "stretch"
	},
	tab: {
		flex: "1 1 0",
		minWidth: 0,
		position: "relative",
		fontFamily: "inherit",
		borderRadius: 10,
		cursor: "pointer",
		padding: 0,
		overflow: "hidden",
		border: "1px solid var(--border-light)",
		boxSizing: "border-box"
	},
	tabEmoji: {
		height: 76,
		display: "flex",
		alignItems: "center",
		justifyContent: "center",
		background: "var(--surface)"
	},
	tabEmojiInner: {
		display: "inline-flex",
		alignItems: "center",
		gap: 6,
		fontSize: 13,
		fontWeight: 700,
		color: "var(--text-secondary)"
	},
	tabImg: {
		height: 76,
		background: "var(--surface)"
	},
	tabImgPic: {
		width: "100%",
		height: "100%",
		objectFit: "cover",
		display: "block"
	},
	tabImgLabel: {
		position: "absolute",
		left: 0,
		right: 0,
		bottom: 0,
		padding: "4px 6px",
		fontSize: 12.5,
		fontWeight: 700,
		color: "#fff",
		textAlign: "center",
		background: "linear-gradient(to top, rgba(0,0,0,0.72), rgba(0,0,0,0))"
	},
	tabCheck: {
		position: "absolute",
		top: 4,
		right: 6,
		width: 20,
		height: 20,
		borderRadius: "50%",
		background: "var(--primary)",
		color: "var(--primary-text)",
		fontSize: 12,
		fontWeight: 800,
		display: "flex",
		alignItems: "center",
		justifyContent: "center"
	},
	tabOn: {
		borderColor: "var(--primary)",
		outline: "2px solid var(--primary)",
		outlineOffset: -1
	},
	stage: {
		display: "flex",
		flexDirection: "column",
		gap: 14,
		background: "var(--surface)",
		border: "1px solid var(--border-light)",
		borderRadius: 12,
		padding: 16,
		transition: "box-shadow 0.2s, outline-color 0.2s"
	},
	stageHead: {
		display: "flex",
		alignItems: "center",
		gap: 12
	},
	stageImg: {
		width: 52,
		height: 52,
		borderRadius: 10,
		objectFit: "cover",
		border: "1px solid var(--border-light)",
		flexShrink: 0
	},
	stageTitle: {
		fontSize: 15,
		fontWeight: 700,
		color: "var(--text-primary)"
	},
	stageVal: {
		fontSize: 13,
		color: "var(--text-secondary)"
	},
	trackWrap: {
		display: "flex",
		flexDirection: "column",
		gap: 4
	},
	track: {
		position: "relative",
		height: 34,
		cursor: "pointer",
		touchAction: "none",
		userSelect: "none",
		outline: "none"
	},
	trackBase: {
		position: "absolute",
		top: "50%",
		left: 0,
		right: 0,
		height: 8,
		marginTop: -4,
		borderRadius: 5,
		background: "var(--surface-raised)",
		border: "1px solid var(--border-light)"
	},
	windowBand: {
		position: "absolute",
		top: "50%",
		height: 16,
		marginTop: -8,
		borderRadius: 5,
		background: "rgba(22,163,74,0.22)",
		border: "1px solid rgba(22,163,74,0.6)",
		boxSizing: "border-box"
	},
	realMark: {
		position: "absolute",
		top: "50%",
		height: 22,
		marginTop: -11,
		width: 2,
		background: "#15803d",
		borderRadius: 1,
		transform: "translateX(-1px)"
	},
	thumb: {
		position: "absolute",
		top: "50%",
		width: 22,
		height: 22,
		borderRadius: "50%",
		border: "2px solid #fff",
		boxShadow: "0 1px 4px rgba(0,0,0,0.35)",
		transform: "translate(-50%, -50%)",
		pointerEvents: "none"
	},
	bandLabels: {
		display: "flex",
		justifyContent: "space-between",
		fontSize: 11,
		color: "var(--text-muted)"
	},
	usedTag: {
		color: "#16a34a",
		fontWeight: 700
	},
	bars: {
		display: "flex",
		flexDirection: "column",
		gap: 8
	},
	barRow: {
		display: "flex",
		alignItems: "center",
		gap: 10
	},
	barName: {
		flex: "0 0 38%",
		minWidth: 0,
		fontSize: 12.5,
		color: "var(--text-secondary)",
		fontWeight: 600
	},
	barTrack: {
		flex: "1 1 auto",
		height: 14,
		background: "var(--surface-raised)",
		border: "1px solid var(--border-light)",
		borderRadius: 7,
		overflow: "hidden"
	},
	barFill: {
		height: "100%",
		borderRadius: 7,
		transition: "width 0.18s ease"
	},
	dilute: {
		fontSize: 13,
		lineHeight: 1.5,
		color: "var(--text-primary)",
		background: "var(--surface-raised)",
		border: "1px dashed var(--border)",
		borderRadius: 8,
		padding: "8px 10px"
	},
	verdict: {
		fontSize: 14,
		lineHeight: 1.5,
		fontWeight: 500,
		borderRadius: 8,
		padding: "10px 12px"
	},
	verdictGood: {
		color: "var(--primary-text)",
		background: "var(--primary)"
	},
	verdictBad: {
		color: "var(--accent-text)",
		background: "var(--accent-soft)",
		border: "1px solid var(--accent)"
	},
	hint: {
		fontSize: 12.5,
		color: "var(--text-muted)",
		textAlign: "center",
		lineHeight: 1.5
	}
};
//#endregion
//#region ../tmp/nadi-slides-fd6e4518-99e0-414a-a92e-35da921944c5/Slide_t3-2.jsx
function We({ studentName: t }) {
	let [n, r] = w(20), [i, a] = w("solids"), o = C(null), s = C(null), c = C(!1), l = [
		180,
		190,
		204,
		219,
		238,
		260,
		287,
		320,
		362,
		415,
		487
	], u = (e) => 35.7 + .034 * e, d = [
		.335,
		.232,
		.169,
		.127,
		.097,
		.076,
		.058,
		.044,
		.032,
		.022,
		.014
	], f = (e, t) => {
		let n = Math.max(0, Math.min(100, t)), r = Math.min(9, Math.floor(n / 10)), i = (n - r * 10) / 10;
		return e[r] + (e[r + 1] - e[r]) * i;
	}, p = f(l, n), m = u(n), h = f(d, n), _ = g(() => {
		let e = o.current;
		if (!e) return;
		let t = e.getContext("2d"), r = e.getBoundingClientRect(), a = window.devicePixelRatio || 1;
		e.width = r.width * a, e.height = r.height * a, t.setTransform(a, 0, 0, a, 0, 0);
		let s = e.clientWidth, c = e.clientHeight;
		t.clearRect(0, 0, s, c);
		let p = (e) => 46 + e / 100 * (s - 46 - 14), m = i === "solids" ? 500 : .36, h = (e) => c - 34 - e / m * (c - 14 - 34), g = s - 14, _ = c - 34;
		t.fillStyle = "#f1f8f1", t.fillRect(46, 14, g - 46, _ - 14);
		let v = i === "solids" ? 25 : .05, y = i === "solids" ? 100 : .1, b = i === "solids" ? 500 : .35;
		for (let e = 0; e <= 100; e += 5) {
			let n = e % 20 == 0;
			t.strokeStyle = n ? "#8fc78f" : "#d8ecd8", t.lineWidth = n ? 1.1 : .7;
			let r = p(e);
			t.beginPath(), t.moveTo(r, 14), t.lineTo(r, _), t.stroke();
		}
		for (let e = 0; e <= b + 1e-6; e += v) {
			let n = Math.abs(e / y - Math.round(e / y)) < 1e-6;
			t.strokeStyle = n ? "#8fc78f" : "#d8ecd8", t.lineWidth = n ? 1.1 : .7;
			let r = h(e);
			t.beginPath(), t.moveTo(46, r), t.lineTo(g, r), t.stroke();
		}
		t.strokeStyle = "#5fa85f", t.lineWidth = 1.5, t.strokeRect(46, 14, g - 46, _ - 14), t.fillStyle = "#3f7a3f", t.font = "10px Outfit, sans-serif", t.textAlign = "right", t.textBaseline = "middle", (i === "solids" ? [
			0,
			100,
			200,
			300,
			400,
			500
		] : [
			0,
			.1,
			.2,
			.3
		]).forEach((e) => {
			t.fillText(String(e), 40, h(e));
		}), t.textAlign = "center", t.textBaseline = "top", [
			0,
			20,
			40,
			60,
			80,
			100
		].forEach((e) => {
			t.fillText(String(e), p(e), c - 34 + 6);
		}), t.fillStyle = "#2f6b2f", t.font = "11px Outfit, sans-serif", t.fillText("Temperature (°C)", (46 + s - 14) / 2, c - 14), t.save(), t.translate(12, (14 + c - 34) / 2), t.rotate(-Math.PI / 2), t.fillText("Solubility (g / 100 g water)", 0, 0), t.restore();
		let x = (e, n, r) => {
			t.strokeStyle = n, t.lineWidth = r, t.beginPath();
			for (let n = 0; n <= 100; n += 2) {
				let r = p(n), i = h(e(n));
				n === 0 ? t.moveTo(r, i) : t.lineTo(r, i);
			}
			t.stroke();
		};
		i === "solids" ? (x((e) => f(l, e), "#2563eb", 3), x((e) => u(e), "#d97706", 3)) : x((e) => f(d, e), "#0d9488", 3);
		let S = p(n);
		t.strokeStyle = "#94a3b8", t.lineWidth = 1.5, t.setLineDash([5, 4]), t.beginPath(), t.moveTo(S, 14), t.lineTo(S, c - 34), t.stroke(), t.setLineDash([]);
		let ee = (e, n) => {
			let r = h(e);
			t.fillStyle = n, t.beginPath(), t.arc(S, r, 5, 0, 7), t.fill(), t.strokeStyle = "#fff", t.lineWidth = 2, t.stroke();
		};
		i === "solids" ? (ee(f(l, n), "#2563eb"), ee(u(n), "#d97706")) : ee(f(d, n), "#0d9488"), t.fillStyle = "#334155", t.beginPath(), t.arc(S, c - 34, 6, 0, 7), t.fill();
	}, [n, i]);
	b(() => {
		s.current = _, _();
	}, [_]), b(() => {
		let e = o.current;
		if (!e) return;
		let t = new ResizeObserver(() => s.current && s.current());
		return t.observe(e), () => t.disconnect();
	}, []);
	let v = (e) => {
		let t = o.current;
		if (!t) return;
		let n = t.getBoundingClientRect(), i = (e - n.left - 46) / (n.width - 46 - 14);
		r(Math.max(0, Math.min(100, Math.round(i * 100))));
	}, y = (e) => e.toFixed(e < 1 ? 3 : 0);
	return /* @__PURE__ */ e.createElement(e.Fragment, null, /* @__PURE__ */ e.createElement("div", {
		className: "slide-title",
		style: I.title
	}, "The Ceiling Moves: Solubility vs Temperature"), /* @__PURE__ */ e.createElement("div", {
		className: "slide-left",
		style: I.left
	}, /* @__PURE__ */ e.createElement("div", { style: I.cardHook }, /* @__PURE__ */ e.createElement("span", { style: I.cornerEmoji }, "💭"), /* @__PURE__ */ e.createElement("p", { style: I.hookText }, t, ", let's begin with something from your own kitchen. Tip spoon after spoon of sugar into cold iced tea and — stir as long as you like — a gritty layer just sits at the bottom, refusing to go. Yet hot tea takes the same spoonfuls easily. The cold drink simply cannot hold that much. That limit is exactly what we'll master today — and like any new idea, it's just one clear rule once we name it.")), /* @__PURE__ */ e.createElement("div", { style: I.plain }, /* @__PURE__ */ e.createElement("div", { style: I.hCard }, "Solubility curve — the definition"), /* @__PURE__ */ e.createElement("p", { style: I.body }, "Let's define our key term precisely — terminology is the language of chemistry, and this one is worth getting exact. A ", /* @__PURE__ */ e.createElement("b", null, "solubility curve"), " is a graph of the maximum mass of solute that dissolves in a fixed mass of ", /* @__PURE__ */ e.createElement("b", null, "solvent"), " — usually ", /* @__PURE__ */ e.createElement("b", null, "100 g of water"), " — at each temperature. Read the denominator carefully: solubility is measured per 100 g of ", /* @__PURE__ */ e.createElement("i", null, "solvent"), ", never per 100 g of solution."), /* @__PURE__ */ e.createElement("hr", { style: I.hr }), /* @__PURE__ */ e.createElement("p", { style: I.body }, "⚖️ One precise distinction to carry forward: in ", /* @__PURE__ */ e.createElement("b", null, "concentration"), " we divided by the whole ", /* @__PURE__ */ e.createElement("b", null, "solution"), " (solute + solvent); here in ", /* @__PURE__ */ e.createElement("b", null, "solubility"), " we divide by the ", /* @__PURE__ */ e.createElement("b", null, "solvent"), " alone. Same idea of a ratio — different denominator."), /* @__PURE__ */ e.createElement("hr", { style: I.hr }), /* @__PURE__ */ e.createElement("p", { style: I.body }, "Use it as your decision tool for three states: on the curve = ", /* @__PURE__ */ e.createElement("b", null, "saturated"), ", below = ", /* @__PURE__ */ e.createElement("b", null, "unsaturated"), ", above = ", /* @__PURE__ */ e.createElement("b", null, "supersaturated"), ".")), /* @__PURE__ */ e.createElement("div", { style: I.plain }, /* @__PURE__ */ e.createElement("div", { style: I.hCard }, "How to read the ceiling — step by step"), /* @__PURE__ */ e.createElement("p", { style: I.body }, "Think of the curve as the saturation ceiling at ", /* @__PURE__ */ e.createElement("i", null, "every"), " temperature on one line. To read it off, follow a simple procedure:"), /* @__PURE__ */ e.createElement("p", { style: I.body }, /* @__PURE__ */ e.createElement("b", null, "1."), " Find your temperature on the bottom axis. \xA0", /* @__PURE__ */ e.createElement("b", null, "2."), " Go straight up to the curve. \xA0", /* @__PURE__ */ e.createElement("b", null, "3."), " Read left to the value — that's the most that can dissolve in 100 g of water there.")), /* @__PURE__ */ e.createElement("div", { style: I.cardInsight }, /* @__PURE__ */ e.createElement("span", { style: I.cornerEmoji }, "💡"), /* @__PURE__ */ e.createElement("p", { style: I.body }, "Here's the pattern to take away: a ", /* @__PURE__ */ e.createElement("b", null, "steep"), " curve (sugar) means temperature shifts the ceiling a great deal — that's why hot chai takes so much more sugar. A ", /* @__PURE__ */ e.createElement("b", null, "flat"), " curve (table salt) barely moves, so heating gives salt little extra room. Read the slope, and you've read the temperature-sensitivity.")), /* @__PURE__ */ e.createElement("div", { style: I.cardPitfall }, /* @__PURE__ */ e.createElement("span", { style: I.cornerEmoji }, "⚠️"), /* @__PURE__ */ e.createElement("p", { style: I.body }, "One exception is worth remembering carefully: solids mostly rise with heat, but ", /* @__PURE__ */ e.createElement("b", null, "gases fall"), ". Macroscopically you see it — warm Coke goes flat, and warm water holds less oxygen, which is why fish need cool water. Flip the graph to \"a gas\" and confirm it for yourself: the slope reverses."))), /* @__PURE__ */ e.createElement("div", {
		className: "slide-right",
		style: I.right
	}, /* @__PURE__ */ e.createElement("div", { style: I.panelTitle }, "Try it yourself — drag the temperature"), /* @__PURE__ */ e.createElement("div", { style: I.toggleRow }, /* @__PURE__ */ e.createElement("button", {
		style: i === "solids" ? I.tabOn : I.tab,
		onClick: () => a("solids")
	}, "Two solids"), /* @__PURE__ */ e.createElement("button", {
		style: i === "gas" ? I.tabOn : I.tab,
		onClick: () => a("gas")
	}, "A gas (CO₂)")), /* @__PURE__ */ e.createElement("canvas", {
		ref: o,
		style: {
			width: "100%",
			aspectRatio: "4 / 3",
			maxHeight: "40vh",
			display: "block",
			cursor: "ew-resize",
			touchAction: "none",
			borderRadius: 8,
			border: "1px solid var(--border-light)"
		},
		onPointerDown: (e) => {
			c.current = !0, e.currentTarget.setPointerCapture(e.pointerId), v(e.clientX);
		},
		onPointerMove: (e) => {
			c.current && v(e.clientX);
		},
		onPointerUp: () => {
			c.current = !1;
		}
	}), /* @__PURE__ */ e.createElement("div", { style: I.readoutWrap }, /* @__PURE__ */ e.createElement("div", { style: I.readHead }, "Reading the ceiling at ", n, "°C…"), i === "solids" ? /* @__PURE__ */ e.createElement("div", { style: I.chips }, /* @__PURE__ */ e.createElement("span", { style: {
		...I.chip,
		color: "#2563eb",
		borderColor: "#2563eb"
	} }, "Sugar \xA0", /* @__PURE__ */ e.createElement("b", null, y(p)), " g"), /* @__PURE__ */ e.createElement("span", { style: {
		...I.chip,
		color: "#d97706",
		borderColor: "#d97706"
	} }, "Table salt \xA0", /* @__PURE__ */ e.createElement("b", null, y(m)), " g")) : /* @__PURE__ */ e.createElement("div", { style: I.chips }, /* @__PURE__ */ e.createElement("span", { style: {
		...I.chip,
		color: "#0d9488",
		borderColor: "#0d9488"
	} }, "CO₂ \xA0", /* @__PURE__ */ e.createElement("b", null, y(h)), " g")), /* @__PURE__ */ e.createElement("div", { style: I.note }, i === "solids" ? `Notice it: sugar's ceiling is about ${(p / m).toFixed(0)}× salt's here. Now drag higher — watch sugar's steep curve climb fast while salt's stays almost flat.` : "Now drag higher and watch carefully — the gas ceiling drops, so the dissolved gas escapes as fizz. The opposite of a solid."))));
}
var Ge = {
	background: "var(--surface-raised)",
	border: "1px solid var(--border-light)",
	borderRadius: 10,
	padding: "14px 18px"
}, I = {
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
	card: { ...Ge },
	plain: { padding: 0 },
	cornerEmoji: {
		position: "absolute",
		top: 10,
		right: 12,
		fontSize: 18,
		lineHeight: 1
	},
	cardHook: {
		...Ge,
		position: "relative",
		paddingRight: 40,
		background: "var(--hook-soft)",
		borderLeft: "2px solid var(--hook)"
	},
	cardInsight: {
		...Ge,
		position: "relative",
		paddingRight: 40,
		background: "var(--primary-softer)",
		borderColor: "var(--primary-soft)",
		borderLeft: "2px solid var(--primary)"
	},
	cardPitfall: {
		...Ge,
		position: "relative",
		paddingRight: 40,
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
		lineHeight: 1.6,
		color: "var(--text-primary)",
		margin: 0
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
	toggleRow: {
		display: "flex",
		gap: 8
	},
	tab: {
		flex: 1,
		padding: "8px 10px",
		borderRadius: 8,
		border: "1px solid var(--border)",
		background: "var(--surface)",
		color: "var(--text-secondary)",
		fontWeight: 600,
		fontSize: 13,
		cursor: "pointer",
		fontFamily: "inherit"
	},
	tabOn: {
		flex: 1,
		padding: "8px 10px",
		borderRadius: 8,
		border: "1px solid var(--primary)",
		background: "var(--primary-softer)",
		color: "var(--primary)",
		fontWeight: 700,
		fontSize: 13,
		cursor: "pointer",
		fontFamily: "inherit"
	},
	slider: {
		width: "100%",
		accentColor: "var(--primary)"
	},
	readoutWrap: {
		background: "var(--surface)",
		border: "1px solid var(--border-light)",
		borderRadius: 8,
		padding: "12px 14px"
	},
	readHead: {
		fontSize: 13,
		fontWeight: 700,
		color: "var(--text-secondary)",
		marginBottom: 8
	},
	chips: {
		display: "flex",
		gap: 10,
		flexWrap: "wrap"
	},
	chip: {
		fontSize: 14,
		fontWeight: 600,
		background: "var(--surface-raised)",
		border: "1.5px solid",
		borderRadius: 8,
		padding: "6px 10px"
	},
	note: {
		fontSize: 13,
		color: "var(--text-muted)",
		marginTop: 10,
		lineHeight: 1.5
	}
};
//#endregion
//#region ../tmp/nadi-slides-fd6e4518-99e0-414a-a92e-35da921944c5/Slide_t3-1.jsx
function Ke({ studentName: t }) {
	let [n, r] = w(0), [i, a] = w(20), o = Math.round(20 + .4 * i), s = n * 10, c = Math.min(s, o), l = Math.max(0, s - o), u = s >= o && s > 0, d = C(null), f = C([]), p = C({
		dissolved: c,
		undissolved: l,
		ceiling: o
	});
	p.current = {
		dissolved: c,
		undissolved: l,
		ceiling: o
	}, b(() => {
		let e = d.current;
		if (!e) return;
		let t = e.getContext("2d"), n, r = () => {
			let n = e.getBoundingClientRect(), r = window.devicePixelRatio || 1;
			e.width = n.width * r, e.height = n.height * r, t.setTransform(r, 0, 0, r, 0, 0);
		};
		r();
		let i = new ResizeObserver(r);
		i.observe(e);
		let a = () => {
			let r = e.clientWidth, i = e.clientHeight;
			t.clearRect(0, 0, r, i);
			let o = r * .22, s = r * .56, c = i * .16, l = i * .92, u = c + (l - c) * .16;
			t.fillStyle = "rgba(90,160,220,0.18)", t.fillRect(o, u, s, l - u), t.strokeStyle = "rgba(120,140,160,0.9)", t.lineWidth = 3, t.beginPath(), t.moveTo(o, c), t.lineTo(o, l), t.lineTo(o + s, l), t.lineTo(o + s, c), t.stroke(), t.strokeStyle = "rgba(90,160,220,0.6)", t.lineWidth = 2, t.beginPath(), t.moveTo(o, u), t.lineTo(o + s, u), t.stroke();
			let d = p.current, m = Math.round(d.dissolved / 1.3), h = f.current;
			for (; h.length < m;) h.push({
				x: o + 6 + Math.random() * (s - 12),
				y: u + 6 + Math.random() * (l - u - 30),
				vx: (Math.random() - .5) * .5,
				vy: (Math.random() - .5) * .5
			});
			for (; h.length > m;) h.pop();
			for (let e of h) e.x += e.vx, e.y += e.vy, (e.x < o + 5 || e.x > o + s - 5) && (e.vx *= -1), (e.y < u + 5 || e.y > l - 18) && (e.vy *= -1), Math.random() < .04 && (e.vx += (Math.random() - .5) * .3, e.vy += (Math.random() - .5) * .3), e.vx = Math.max(-.7, Math.min(.7, e.vx)), e.vy = Math.max(-.7, Math.min(.7, e.vy)), t.beginPath(), t.arc(e.x, e.y, 2.6, 0, Math.PI * 2), t.fillStyle = "rgba(255,255,255,0.98)", t.fill(), t.strokeStyle = "rgba(140,160,180,0.7)", t.lineWidth = .5, t.stroke();
			let g = Math.round(d.undissolved / 2);
			if (g > 0) {
				let e = Math.max(1, Math.floor((s - 10) / 9)), n = o + (s - e * 9) / 2 + 1.5, r = (e - 1) / 2, i = Array.from({ length: e }, (e, t) => t).sort((e, t) => Math.abs(e - r) - Math.abs(t - r));
				for (let r = 0; r < g; r++) {
					let a = Math.floor(r / e), o = n + i[r % e] * 9, s = l - 7 - a * 6;
					t.fillStyle = "rgba(255,255,255,0.98)", t.fillRect(o, s, 6, 5), t.strokeStyle = "rgba(140,160,180,0.7)", t.lineWidth = .5, t.strokeRect(o, s, 6, 5);
				}
			}
			n = requestAnimationFrame(a);
		};
		return a(), () => {
			cancelAnimationFrame(n), i.disconnect();
		};
	}, []);
	let m = u ? "var(--accent-text)" : "var(--primary)";
	return /* @__PURE__ */ e.createElement(e.Fragment, null, /* @__PURE__ */ e.createElement("div", {
		className: "slide-title",
		style: L.title
	}, "Saturated vs Unsaturated: the Solvent Sets the Number"), /* @__PURE__ */ e.createElement("div", {
		className: "slide-left",
		style: L.left
	}, /* @__PURE__ */ e.createElement("div", { style: L.cardHook }, /* @__PURE__ */ e.createElement("span", { style: L.cornerEmoji }, "💭"), /* @__PURE__ */ e.createElement("p", { style: L.hookText }, t, ", chemistry comes with its own vocabulary — almost a new language — and today you'll add two key words to it. Last chapter, YOU decided how much sugar to stir in. Now let's test that freedom: keep adding salt, spoon by spoon, and watch closely. Does every spoonful vanish, or does a moment arrive when the water simply can't take any more?")), /* @__PURE__ */ e.createElement("div", { style: L.plain }, /* @__PURE__ */ e.createElement("p", { style: L.body }, "Solubility of the solute is defined as the maximum amount of solute that will dissolve in a given quantity of solvent at a specific temperature. Chemists refer to substances as soluble, slightly soluble, or insoluble in a qualitative sense. A substance is said to be soluble if a fair amount of it visibly dissolves when added to water. If not, the substance is described as slightly soluble or insoluble.")), /* @__PURE__ */ e.createElement("div", { style: L.plain }, /* @__PURE__ */ e.createElement("p", { style: L.body }, "Chemists also characterize solutions by their capacity to dissolve a solute. A saturated solution contains the maximum amount of a solute that will dissolve in a given solvent at a specific temperature. An unsaturated solution contains less solute than it has the capacity to dissolve. A third type, a supersaturated solution, contains more solute than is present in a saturated solution. Supersaturated solutions are not very stable. In time, some of the solute will come out of a supersaturated solution as crystals.")), /* @__PURE__ */ e.createElement("div", { style: L.plain }, /* @__PURE__ */ e.createElement("div", { style: L.hCard }, "Solubility — a precise definition"), /* @__PURE__ */ e.createElement("p", { style: L.body }, "Let's state it carefully. Solubility is the ", /* @__PURE__ */ e.createElement("b", null, "maximum"), " mass of solute that will dissolve in a ", /* @__PURE__ */ e.createElement("b", null, "given quantity of solvent"), " at a ", /* @__PURE__ */ e.createElement("b", null, "specific temperature"), ". Once that limit is reached the solvent is full — any extra solute can no longer disperse and settles at the bottom.")), /* @__PURE__ */ e.createElement("div", { style: L.plain }, /* @__PURE__ */ e.createElement("div", { style: L.hCard }, "Two words, two states"), /* @__PURE__ */ e.createElement("p", { style: L.body }, "Here are the new words, step by step. ", /* @__PURE__ */ e.createElement("b", null, "Unsaturated"), " — the solution is below its limit, so more solute can still dissolve. ", /* @__PURE__ */ e.createElement("b", null, "Saturated"), " — it is holding the maximum; the visible signature (the macroscopic clue) is undissolved solute resting on the floor."), /* @__PURE__ */ e.createElement("hr", { style: L.hr }), /* @__PURE__ */ e.createElement("p", { style: L.body }, "Chemists also describe a substance qualitatively: ", /* @__PURE__ */ e.createElement("b", null, "soluble"), " (a fair amount visibly dissolves), ", /* @__PURE__ */ e.createElement("b", null, "slightly soluble"), ", or ", /* @__PURE__ */ e.createElement("b", null, "insoluble"), ".")), /* @__PURE__ */ e.createElement("div", { style: L.cardInsight }, /* @__PURE__ */ e.createElement("span", { style: L.cornerEmoji }, "💡"), /* @__PURE__ */ e.createElement("p", { style: L.body }, "Here's the idea to hold onto: the number belongs to the ", /* @__PURE__ */ e.createElement("b", null, "solute–solvent–temperature"), " pairing — never to the experimenter. That is precisely why a solubility figure means nothing until you state the temperature alongside it.")), /* @__PURE__ */ e.createElement("div", { style: L.cardSurprise }, /* @__PURE__ */ e.createElement("span", { style: L.cornerEmoji }, "🤯"), /* @__PURE__ */ e.createElement("p", { style: L.body }, "With patience and care, a solution can be coaxed into holding ", /* @__PURE__ */ e.createElement("b", null, "more"), " than its saturated maximum — a ", /* @__PURE__ */ e.createElement("b", null, "supersaturated"), " solution. But it is living on borrowed time: the state is unstable, and the extra solute the solvent cannot truly hold at this temperature ", /* @__PURE__ */ e.createElement("b", null, "must"), " eventually drop back out as solid."), /* @__PURE__ */ e.createElement("p", { style: {
		...L.body,
		marginTop: 8,
		color: "var(--text-secondary)"
	} }, "Think of it this way: that excess has nowhere to go but solid — and that single idea is the very handle we'll grab later to pull a solute back out. We'll work through it carefully when we reach separation methods.")), /* @__PURE__ */ e.createElement("div", { style: L.cardPitfall }, /* @__PURE__ */ e.createElement("span", { style: L.cornerEmoji }, "⚠️"), /* @__PURE__ */ e.createElement("p", { style: L.body }, "These two words measure different things, so be careful not to let one imply the other. A barely-soluble salt can be ", /* @__PURE__ */ e.createElement("b", null, "saturated"), " (no more will dissolve) and yet remain very ", /* @__PURE__ */ e.createElement("b", null, "dilute"), " (only a tiny amount is actually in solution)."))), /* @__PURE__ */ e.createElement("div", {
		className: "slide-right",
		style: L.right
	}, /* @__PURE__ */ e.createElement("div", { style: L.panelTitle }, "Add solute, find the ceiling"), /* @__PURE__ */ e.createElement("button", {
		style: L.imgBtn,
		onClick: () => r(n + 1)
	}, /* @__PURE__ */ e.createElement("img", {
		src: "https://starkhorn.nadilearning.com/files/slide-assets/b7953a8a-5277-46bd-aec3-8bc8576a1f49/1e5ee8e6-5480-44ea-a8ed-7d886fdd8194.jpg",
		alt: "A spoon heaped with solute",
		style: L.imgBtnImg
	}), /* @__PURE__ */ e.createElement("span", { style: L.imgBtnText }, "+ Add a spoon (10 g)")), /* @__PURE__ */ e.createElement("canvas", {
		ref: d,
		style: {
			width: "100%",
			aspectRatio: "4 / 3",
			maxHeight: "38vh",
			display: "block",
			borderRadius: 10,
			outline: u ? "3px solid var(--accent)" : "1px solid var(--border-light)",
			background: "#000"
		}
	}), /* @__PURE__ */ e.createElement("div", { style: L.readouts }, /* @__PURE__ */ e.createElement("div", { style: L.stat }, /* @__PURE__ */ e.createElement("span", { style: L.statNum }, s), /* @__PURE__ */ e.createElement("span", { style: L.statLbl }, "g added")), /* @__PURE__ */ e.createElement("div", { style: L.stat }, /* @__PURE__ */ e.createElement("span", { style: {
		...L.statNum,
		color: "var(--primary)"
	} }, c), /* @__PURE__ */ e.createElement("span", { style: L.statLbl }, "g dissolved")), /* @__PURE__ */ e.createElement("div", { style: L.stat }, /* @__PURE__ */ e.createElement("span", { style: {
		...L.statNum,
		color: "var(--accent-text)"
	} }, l), /* @__PURE__ */ e.createElement("span", { style: L.statLbl }, "g undissolved"))), /* @__PURE__ */ e.createElement("div", { style: {
		...L.statusBar,
		color: m,
		borderColor: u ? "var(--accent)" : "var(--primary-soft)",
		background: u ? "var(--accent-soft)" : "var(--primary-softer)"
	} }, s === 0 ? "Pure solvent — add a spoonful of solute to begin" : u ? "● Saturated — the limit is reached; the excess now rests on the floor" : "○ Unsaturated — still below the limit, so more can dissolve"), /* @__PURE__ */ e.createElement("div", { style: L.controlsRow }, /* @__PURE__ */ e.createElement("button", {
		style: L.btnGhost,
		onClick: () => r(0)
	}, "Reset")), /* @__PURE__ */ e.createElement("div", { style: L.sliderWrap }, /* @__PURE__ */ e.createElement("div", { style: L.sliderLabel }, "Temperature: ", /* @__PURE__ */ e.createElement("b", null, i, " °C"), " \xA0→\xA0 ceiling = ", /* @__PURE__ */ e.createElement("b", null, o, " g"), " / 100 g water"), /* @__PURE__ */ e.createElement("input", {
		type: "range",
		min: 0,
		max: 100,
		value: i,
		onChange: (e) => a(Number(e.target.value)),
		style: L.slider
	}), /* @__PURE__ */ e.createElement("div", { style: L.hint }, "Try this: warm the water and the same solvent holds more. The number was never yours to set — temperature sets it."))));
}
var qe = {
	background: "var(--surface-raised)",
	border: "1px solid var(--border-light)",
	borderRadius: 10,
	padding: "14px 18px",
	boxSizing: "border-box",
	position: "relative"
}, L = {
	title: {
		fontSize: 22,
		fontWeight: 700,
		color: "var(--text-primary)"
	},
	left: {
		display: "flex",
		flexDirection: "column",
		gap: 14,
		minWidth: 0
	},
	right: {
		display: "flex",
		flexDirection: "column",
		gap: 12,
		minWidth: 0
	},
	cornerEmoji: {
		position: "absolute",
		top: 10,
		right: 12,
		fontSize: 16,
		lineHeight: 1
	},
	plain: { minWidth: 0 },
	cardHook: {
		...qe,
		background: "var(--hook-soft)",
		borderLeft: "2px solid var(--hook)",
		paddingRight: 38
	},
	cardInsight: {
		...qe,
		background: "var(--primary-softer)",
		borderColor: "var(--primary-soft)",
		borderLeft: "2px solid var(--primary)",
		paddingRight: 38
	},
	cardPitfall: {
		...qe,
		background: "var(--accent-soft)",
		borderLeft: "2px solid var(--accent)",
		paddingRight: 38
	},
	cardSurprise: {
		...qe,
		background: "var(--surprise-soft)",
		borderLeft: "2px solid var(--surprise)",
		paddingRight: 38
	},
	hCard: {
		fontSize: 14,
		fontWeight: 700,
		color: "var(--primary)",
		marginBottom: 6
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
		lineHeight: 1.6,
		color: "var(--text-primary)",
		margin: 0
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
	readouts: {
		display: "flex",
		gap: 8
	},
	stat: {
		flex: 1,
		minWidth: 0,
		display: "flex",
		flexDirection: "column",
		alignItems: "center",
		gap: 2,
		background: "var(--surface)",
		border: "1px solid var(--border-light)",
		borderRadius: 8,
		padding: "8px 4px"
	},
	statNum: {
		fontSize: 20,
		fontWeight: 700,
		color: "var(--text-primary)"
	},
	statLbl: {
		fontSize: 11,
		color: "var(--text-muted)",
		textAlign: "center"
	},
	statusBar: {
		textAlign: "center",
		fontWeight: 700,
		fontSize: 14,
		padding: "10px 12px",
		borderRadius: 8,
		border: "1px solid"
	},
	imgBtn: {
		position: "relative",
		width: "50%",
		alignSelf: "center",
		padding: 0,
		border: "1px solid var(--border)",
		borderRadius: 10,
		overflow: "hidden",
		cursor: "pointer",
		background: "#000",
		display: "block"
	},
	imgBtnImg: {
		width: "100%",
		maxHeight: 70,
		objectFit: "cover",
		display: "block"
	},
	imgBtnText: {
		position: "absolute",
		left: 0,
		right: 0,
		bottom: 0,
		padding: "6px 8px",
		fontFamily: "inherit",
		fontSize: 12,
		fontWeight: 700,
		color: "#fff",
		textAlign: "center",
		textShadow: "0 1px 4px rgba(0,0,0,0.9)",
		background: "linear-gradient(to top, rgba(0,0,0,0.75), rgba(0,0,0,0))"
	},
	controlsRow: {
		display: "flex",
		gap: 8
	},
	btn: {
		flex: 2,
		minWidth: 0,
		fontFamily: "inherit",
		fontSize: 14,
		fontWeight: 700,
		color: "var(--primary-text)",
		background: "var(--primary)",
		border: "none",
		borderRadius: 8,
		padding: "12px 10px",
		cursor: "pointer"
	},
	btnGhost: {
		flex: 1,
		minWidth: 0,
		fontFamily: "inherit",
		fontSize: 14,
		fontWeight: 700,
		color: "var(--text-secondary)",
		background: "var(--surface)",
		border: "1px solid var(--border)",
		borderRadius: 8,
		padding: "12px 10px",
		cursor: "pointer"
	},
	sliderWrap: {
		background: "var(--surface)",
		border: "1px solid var(--border-light)",
		borderRadius: 8,
		padding: "12px 14px",
		display: "flex",
		flexDirection: "column",
		gap: 8
	},
	sliderLabel: {
		fontSize: 13,
		color: "var(--text-primary)"
	},
	slider: {
		width: "100%",
		accentColor: "var(--primary)"
	},
	hint: {
		fontSize: 12,
		color: "var(--text-muted)",
		lineHeight: 1.5
	}
}, Je = {
	water: {
		name: "Water",
		d: 1,
		color: "#3b9ad6",
		pack: .5,
		img: "https://starkhorn.nadilearning.com/files/slide-assets/b7953a8a-5277-46bd-aec3-8bc8576a1f49/0c3e8e65-c2ad-49e2-92b6-6e4c62b961ef.jpg",
		pos: "center 62%"
	},
	oil: {
		name: "Cooking Oil",
		d: .91,
		color: "#d4b43c",
		pack: .42,
		img: "https://starkhorn.nadilearning.com/files/slide-assets/b7953a8a-5277-46bd-aec3-8bc8576a1f49/38f2a569-8254-4843-bedc-a98c30da526e.jpg",
		pos: "center 50%"
	},
	mercury: {
		name: "Mercury",
		d: 13.6,
		color: "#9aa3ab",
		pack: .92,
		img: "https://starkhorn.nadilearning.com/files/slide-assets/b7953a8a-5277-46bd-aec3-8bc8576a1f49/f74fd163-505b-4ae9-8b61-311db1f52745.webp",
		pos: "center 72%"
	}
};
function Ye({ studentName: t }) {
	let [n, r] = w("water"), [i, a] = w(100), o = C(null), s = C({
		fill: 0,
		liquid: "water",
		vol: 100
	}), c = Je[n], l = i * c.d, u = {
		water: "Notice the pattern: water reads almost exactly 1 g for every 1 mL — its density is 1.00 g/mL, the simplest case to anchor on.",
		oil: "Watch closely — 100 mL of oil settles below 100 g. Each millilitre carries a little less mass (0.91 g/mL), so it is lighter than water.",
		mercury: "Same volume, very different scale reading. Mercury packs 13.6 g into every single mL — that dramatic jump is density doing its work."
	};
	return b(() => {
		s.current.liquid = n, s.current.vol = i;
	}, [n, i]), b(() => {
		let e = o.current;
		if (!e) return;
		let t = e.getContext("2d"), n, r = () => {
			let n = e.getBoundingClientRect(), r = window.devicePixelRatio || 1;
			e.width = n.width * r, e.height = n.height * r, t.setTransform(r, 0, 0, r, 0, 0);
		};
		r();
		let i = new ResizeObserver(r);
		i.observe(e);
		let a = () => {
			let r = e.clientWidth, i = e.clientHeight, o = s.current, c = Je[o.liquid], l = o.vol / 100;
			o.fill += (l - o.fill) * .15, Math.abs(l - o.fill) < .002 && (o.fill = l), t.clearRect(0, 0, r, i);
			let u = Math.min(r * .66, 280), d = Math.max(i * .16, 58), f = (r - u) / 2, p = i - d - 6, m = Math.min(96, r * .3), h = (r - m) / 2, g = i * .06, _ = p - 2, v = _ - g;
			t.lineWidth = 3, t.strokeStyle = "#5b6670", t.fillStyle = "rgba(255,255,255,0.04)", t.beginPath(), t.moveTo(h, g), t.lineTo(h, _ - 10), t.quadraticCurveTo(h, _, h + 10, _), t.lineTo(h + m - 10, _), t.quadraticCurveTo(h + m, _, h + m, _ - 10), t.lineTo(h + m, g), t.stroke();
			let y = _ - v * o.fill;
			t.save(), t.beginPath(), t.moveTo(h + 2, Math.max(y, g)), t.lineTo(h + 2, _ - 10), t.quadraticCurveTo(h + 2, _ - 2, h + 12, _ - 2), t.lineTo(h + m - 12, _ - 2), t.quadraticCurveTo(h + m - 2, _ - 2, h + m - 2, _ - 10), t.lineTo(h + m - 2, Math.max(y, g)), t.closePath(), t.clip(), t.fillStyle = c.color, t.globalAlpha = .78, t.fillRect(h, g, m, v), t.globalAlpha = .5, t.fillStyle = "#ffffff";
			let b = 26 - c.pack * 16;
			for (let e = _ - 6; e > y; e -= b) for (let n = h + 8; n < h + m - 6; n += b) t.beginPath(), t.arc(n + (Math.floor(e) % 2 ? b / 2 : 0), e, 1.8, 0, Math.PI * 2), t.fill();
			t.restore(), t.fillStyle = "#8a939c", t.font = "11px Outfit, sans-serif", t.textAlign = "right";
			for (let e = 0; e <= 4; e++) {
				let n = _ - v * e / 4;
				t.fillRect(h, n, 8, 1), t.fillText(e * 25 + "", h - 4, n + 4);
			}
			t.fillStyle = "#4a535c", t.beginPath(), t.roundRect(f - 6, p, u + 12, d * .22, 4), t.fill(), t.fillStyle = "#3a424b", t.beginPath(), t.roundRect(f, p + d * .2, u, d * .8, 8), t.fill();
			let x = d * .46, S = p + d * .34;
			t.fillStyle = "#10171d", t.beginPath(), t.roundRect(f + u * .3, S, u * .4, x, 6), t.fill();
			let ee = o.fill * 100 * c.d;
			t.fillStyle = "#7CF29B", t.font = "700 " + Math.round(Math.min(u * .11, 24)) + "px Outfit, monospace", t.textAlign = "center", t.textBaseline = "middle", t.fillText(ee.toFixed(0) + " g", f + u * .5, S + x / 2), t.textBaseline = "alphabetic", n = requestAnimationFrame(a);
		};
		return a(), () => {
			cancelAnimationFrame(n), i.disconnect();
		};
	}, []), /* @__PURE__ */ e.createElement(e.Fragment, null, /* @__PURE__ */ e.createElement("div", {
		className: "slide-title",
		style: R.title
	}, "The Density Bridge: Linking Mass to Volume"), /* @__PURE__ */ e.createElement("div", {
		className: "slide-left",
		style: R.left
	}, /* @__PURE__ */ e.createElement("div", { style: R.cardHook }, /* @__PURE__ */ e.createElement("span", { style: R.corner }, "💭"), /* @__PURE__ */ e.createElement("p", { style: R.hookText }, t, ", let's start with something you can see. A bottle of cooking oil reads ", /* @__PURE__ */ e.createElement("b", null, "1 Litre"), " on the front, yet ", /* @__PURE__ */ e.createElement("b", null, "910 grams"), " in the small print. Two honest numbers for one bottle — your job today is simply to understand why. Take it step by step; it will make complete sense.")), /* @__PURE__ */ e.createElement("div", { style: R.plain }, /* @__PURE__ */ e.createElement("div", { style: R.hCard }, "What density actually is"), /* @__PURE__ */ e.createElement("p", { style: R.body }, /* @__PURE__ */ e.createElement("b", null, "Density, defined as the mass of an object divided by its volume,"), " tells you how much matter is packed into the space it occupies."), /* @__PURE__ */ e.createElement("p", { style: R.body }, /* @__PURE__ */ e.createElement("b", null, "Macroscopic (what you see):"), " fill the same space with two liquids and one weighs more on the scale."), /* @__PURE__ */ e.createElement("p", { style: R.body }, /* @__PURE__ */ e.createElement("b", null, "Microscopic (the molecules):"), " the heavier liquid simply packs more molecules — more mass — into that same space."), /* @__PURE__ */ e.createElement("p", { style: R.body }, /* @__PURE__ */ e.createElement("b", null, "Symbolic (the formula):"), " we write that idea precisely as mass per unit of volume."), /* @__PURE__ */ e.createElement("div", { style: R.formula }, "density = mass ÷ volume\xA0\xA0(d = m / V)")), /* @__PURE__ */ e.createElement("div", { style: R.cardBridge }, /* @__PURE__ */ e.createElement("span", { style: R.corner }, "🌉"), /* @__PURE__ */ e.createElement("p", { style: R.body }, /* @__PURE__ */ e.createElement("b", null, "Density is the concept that links mass-based and volume-based measurements."), " Think of it as a translator between two languages: grams (what the scale reads) and millilitres (what the cylinder reads). Master this one term and you can move freely between them.")), /* @__PURE__ */ e.createElement("div", { style: R.cardInsight }, /* @__PURE__ */ e.createElement("span", { style: R.corner }, "💡"), /* @__PURE__ */ e.createElement("p", { style: R.body }, "Density is a fixed ", /* @__PURE__ */ e.createElement("b", null, "signature"), " of a substance — a single drop of mercury and a whole barrel share the same 13.6 g/mL. Because it never changes with amount, you can use it as a reliable conversion factor: measure the ", /* @__PURE__ */ e.createElement("b", null, "volume"), ", multiply by density, and you have the ", /* @__PURE__ */ e.createElement("b", null, "mass"), " — no scale required.")), /* @__PURE__ */ e.createElement("div", { style: R.cardPitfall }, /* @__PURE__ */ e.createElement("span", { style: R.corner }, "⚠️"), /* @__PURE__ */ e.createElement("p", { style: R.body }, "Be careful here: equal ", /* @__PURE__ */ e.createElement("b", null, "volume"), " does not mean equal ", /* @__PURE__ */ e.createElement("b", null, "mass"), ". 100 mL of honey and 100 mL of water reach exactly the same line in the cylinder, yet the honey is far heavier. Always let density, not the eye, decide the weight."))), /* @__PURE__ */ e.createElement("div", {
		className: "slide-right",
		style: R.right
	}, /* @__PURE__ */ e.createElement("div", { style: R.panelTitle }, "Your turn: pour a liquid, then read the scale"), /* @__PURE__ */ e.createElement("div", { style: R.btnRow }, Object.keys(Je).map((t) => {
		let i = Je[t], a = n === t;
		return /* @__PURE__ */ e.createElement("button", {
			key: t,
			onClick: () => r(t),
			style: {
				...R.btn,
				...a ? R.btnOn : {}
			}
		}, i.img ? /* @__PURE__ */ e.createElement("img", {
			src: i.img,
			alt: i.name,
			style: {
				...R.btnImg,
				objectPosition: i.pos || "center"
			}
		}) : /* @__PURE__ */ e.createElement("div", { style: {
			...R.btnImg,
			background: i.color
		} }), /* @__PURE__ */ e.createElement("span", { style: R.btnLabel }, i.name));
	})), /* @__PURE__ */ e.createElement("canvas", {
		ref: o,
		style: R.canvas
	}), /* @__PURE__ */ e.createElement("div", { style: R.readout }, /* @__PURE__ */ e.createElement("span", { style: R.chip }, i, " mL"), /* @__PURE__ */ e.createElement("span", { style: R.times }, "×"), /* @__PURE__ */ e.createElement("span", { style: R.chip }, c.d.toFixed(2), " g/mL"), /* @__PURE__ */ e.createElement("span", { style: R.times }, "="), /* @__PURE__ */ e.createElement("span", { style: {
		...R.chip,
		...R.chipOut
	} }, l.toFixed(0), " g")), /* @__PURE__ */ e.createElement("div", { style: R.verdict }, u[n]), /* @__PURE__ */ e.createElement("input", {
		type: "range",
		min: 0,
		max: 100,
		value: i,
		onChange: (e) => a(Number(e.target.value)),
		style: R.slider
	}), /* @__PURE__ */ e.createElement("div", { style: R.sliderLabel }, "Strategy: same volume, different liquid — currently ", i, " mL of ", c.name, ". Compare the scale as you switch.")));
}
var Xe = {
	background: "var(--surface-raised)",
	border: "1px solid var(--border-light)",
	borderRadius: 10,
	padding: "14px 18px",
	position: "relative"
}, R = {
	title: {
		fontSize: 22,
		fontWeight: 700,
		color: "var(--text-primary)"
	},
	left: {
		display: "flex",
		flexDirection: "column",
		gap: 14,
		minWidth: 0
	},
	right: {
		display: "flex",
		flexDirection: "column",
		gap: 14,
		minWidth: 0
	},
	corner: {
		position: "absolute",
		top: 10,
		right: 12,
		fontSize: 16,
		lineHeight: 1
	},
	plain: {
		display: "flex",
		flexDirection: "column",
		gap: 8,
		padding: "0 2px"
	},
	cardHook: {
		...Xe,
		background: "var(--hook-soft)",
		borderLeft: "2px solid var(--hook)",
		paddingRight: 38
	},
	cardInsight: {
		...Xe,
		background: "var(--primary-softer)",
		borderColor: "var(--primary-soft)",
		borderLeft: "2px solid var(--primary)",
		paddingRight: 38
	},
	cardPitfall: {
		...Xe,
		background: "var(--accent-soft)",
		borderLeft: "2px solid var(--accent)",
		paddingRight: 38
	},
	cardBridge: {
		...Xe,
		background: "var(--surprise-soft)",
		borderLeft: "2px solid var(--surprise)",
		paddingRight: 38
	},
	hCard: {
		fontSize: 15,
		fontWeight: 700,
		color: "var(--primary)",
		marginBottom: 2
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
		lineHeight: 1.6,
		color: "var(--text-primary)",
		margin: 0
	},
	formula: {
		textAlign: "center",
		fontFamily: "monospace",
		fontWeight: 700,
		fontSize: 16,
		color: "var(--text-primary)",
		background: "var(--surface)",
		border: "1px solid var(--border-light)",
		borderRadius: 8,
		padding: "12px 14px",
		marginTop: 6
	},
	panelTitle: {
		fontSize: 16,
		fontWeight: 700,
		color: "var(--text-primary)"
	},
	canvas: {
		width: "100%",
		aspectRatio: "5 / 6",
		maxHeight: "46vh",
		display: "block",
		background: "var(--surface)",
		border: "1px solid var(--border-light)",
		borderRadius: 10
	},
	btnRow: {
		display: "flex",
		gap: 8
	},
	btn: {
		flex: "1 1 0",
		minWidth: 0,
		position: "relative",
		height: 112,
		borderRadius: 10,
		overflow: "hidden",
		border: "2px solid var(--border)",
		background: "var(--surface)",
		cursor: "pointer",
		padding: 0
	},
	btnOn: {
		borderColor: "var(--primary)",
		boxShadow: "0 0 0 2px var(--primary-soft)"
	},
	btnImg: {
		position: "absolute",
		top: 0,
		left: 0,
		right: 0,
		bottom: 0,
		width: "100%",
		height: "100%",
		objectFit: "cover",
		objectPosition: "center",
		display: "block"
	},
	btnLabel: {
		position: "absolute",
		left: 0,
		right: 0,
		bottom: 0,
		background: "linear-gradient(180deg, rgba(0,0,0,0) 0%, rgba(0,0,0,0.38) 100%)",
		color: "#fff",
		fontSize: 13,
		fontWeight: 700,
		padding: "16px 4px 6px",
		textAlign: "center",
		fontFamily: "inherit",
		textShadow: "0 1px 3px rgba(0,0,0,0.85)"
	},
	readout: {
		display: "flex",
		alignItems: "center",
		justifyContent: "center",
		gap: 8,
		flexWrap: "wrap"
	},
	chip: {
		fontFamily: "monospace",
		fontWeight: 700,
		fontSize: 15,
		color: "var(--text-primary)",
		background: "var(--surface)",
		border: "1px solid var(--border-light)",
		borderRadius: 6,
		padding: "6px 10px"
	},
	chipOut: {
		background: "var(--primary-softer)",
		borderColor: "var(--primary-soft)",
		color: "var(--primary)"
	},
	times: {
		fontWeight: 700,
		color: "var(--text-muted)"
	},
	verdict: {
		fontSize: 13.5,
		lineHeight: 1.55,
		color: "var(--text-secondary)",
		textAlign: "center",
		background: "var(--surface)",
		border: "1px solid var(--border-light)",
		borderRadius: 8,
		padding: "10px 12px"
	},
	slider: {
		width: "100%",
		accentColor: "var(--primary)"
	},
	sliderLabel: {
		fontSize: 13,
		color: "var(--text-muted)",
		textAlign: "center"
	}
};
//#endregion
//#region ../tmp/nadi-slides-fd6e4518-99e0-414a-a92e-35da921944c5/Slide_t3-3.jsx
function Ze({ studentName: t }) {
	let [n, r] = w(60), i = C(null), a = C(null), o = C(!1), s = C(0), c = (e) => 287 - 2.3 * (60 - e), l = c(n), u = Math.max(0, 287 - l), d = 287 - c(20), f = (e) => {
		let t = i.current, n = a.current;
		if (!t || !n) return;
		let o = e - t.getBoundingClientRect().left, s = n.Tmin + (o - n.gx0) / n.graphW * (n.Tmax - n.Tmin);
		s = Math.max(20, Math.min(60, Math.round(s))), r(s);
	}, p = (e) => {
		o.current = !0, f(e.clientX);
	}, m = (e) => {
		o.current && f(e.clientX);
	}, h = () => {
		o.current = !1;
	};
	return b(() => {
		let e = i.current;
		if (!e) return;
		let t, r = {}, o = (e) => {
			if (r[e]) return r[e];
			let t = (e - 1) / 2, n = [];
			for (let t = 0; t < e; t++) n.push(t);
			return n.sort((e, n) => Math.abs(e - t) - Math.abs(n - t) || e - n), r[e] = n, n;
		}, f = () => {
			let t = e.getBoundingClientRect(), r = window.devicePixelRatio || 1;
			e.width = t.width * r, e.height = t.height * r;
			let i = e.getContext("2d");
			i.setTransform(r, 0, 0, r, 0, 0);
			let f = e.clientWidth, p = e.clientHeight;
			i.clearRect(0, 0, f, p);
			let m = f * .6 - 44, h = p - 18 - 34, g = 44 + m, _ = 18 + h;
			a.current = {
				gx0: 44,
				graphW: m,
				Tmin: 20,
				Tmax: 60
			};
			let v = (e) => 44 + (e - 20) / 40 * m, y = (e) => _ - (e - 180) / 120 * h;
			i.fillStyle = "#f1f8f1", i.fillRect(44, 18, m, h), i.strokeStyle = "#d8ecd8", i.lineWidth = 1;
			for (let e = 180; e <= 300; e += 10) i.beginPath(), i.moveTo(44, y(e)), i.lineTo(g, y(e)), i.stroke();
			for (let e = 20; e <= 60; e += 5) i.beginPath(), i.moveTo(v(e), 18), i.lineTo(v(e), _), i.stroke();
			i.strokeStyle = "#b6dcb6", i.fillStyle = "#5e8a5e", i.font = "10px Outfit, sans-serif", i.textAlign = "right", i.textBaseline = "middle";
			for (let e = 200; e <= 280; e += 40) i.beginPath(), i.moveTo(44, y(e)), i.lineTo(g, y(e)), i.stroke(), i.fillText(String(e), 38, y(e));
			i.textAlign = "center", i.textBaseline = "top";
			for (let e = 20; e <= 60; e += 10) i.beginPath(), i.moveTo(v(e), 18), i.lineTo(v(e), _), i.stroke(), i.fillText(e + "°", v(e), _ + 6);
			i.strokeStyle = "#9ac79a", i.beginPath(), i.moveTo(44, 18), i.lineTo(44, _), i.lineTo(g, _), i.stroke(), i.strokeStyle = "#7c3aed", i.lineWidth = 2.5, i.beginPath();
			for (let e = 20; e <= 60; e += 1) {
				let t = v(e), n = y(c(e));
				e === 20 ? i.moveTo(t, n) : i.lineTo(t, n);
			}
			i.stroke(), i.fillStyle = "#7c3aed", i.textAlign = "left", i.font = "600 10px Outfit, sans-serif", i.fillText("ceiling", v(46) + 2, y(c(50)) - 8), i.strokeStyle = "#e0972b", i.lineWidth = 1.5, i.setLineDash([5, 4]), i.beginPath(), i.moveTo(44, y(287)), i.lineTo(g, y(287)), i.stroke(), i.setLineDash([]), i.fillStyle = "#e0972b", i.textAlign = "right", i.fillText("held 287 g", g - 2, y(287) - 8);
			let b = v(n), x = y(l), S = y(287);
			i.strokeStyle = "#c2c8d2", i.setLineDash([3, 3]), i.beginPath(), i.moveTo(b, x), i.lineTo(b, _), i.stroke(), i.beginPath(), i.moveTo(44, x), i.lineTo(b, x), i.stroke(), i.setLineDash([]), u > .5 && (i.strokeStyle = "#e0972b", i.lineWidth = 6, i.beginPath(), i.moveTo(b, S), i.lineTo(b, x), i.stroke(), i.fillStyle = "#e0972b", i.font = "700 11px Outfit, sans-serif", i.textAlign = "left", i.fillText("out " + Math.round(u) + " g", b + 8, (S + x) / 2)), i.fillStyle = "rgba(124,58,237,0.18)", i.beginPath(), i.arc(b, x, 11, 0, Math.PI * 2), i.fill(), i.fillStyle = "#7c3aed", i.beginPath(), i.arc(b, x, 6, 0, Math.PI * 2), i.fill(), i.strokeStyle = "#fff", i.lineWidth = 2, i.stroke(), n >= 59 && (i.fillStyle = "#5a6472", i.font = "600 10px Outfit, sans-serif", i.textAlign = "center", i.fillText("◄ drag me", b, x - 18));
			let ee = (e, t, n, r) => {
				i.font = "700 10px Outfit, sans-serif";
				let a = i.measureText(e).width + 10, o = t - a / 2, s = n - 16 / 2;
				r === "bottom" && (o = t - a / 2, s = n), r === "left" && (o = t - a, s = n - 16 / 2), i.fillStyle = "#7c3aed", i.beginPath(), i.roundRect ? i.roundRect(o, s, a, 16, 4) : i.rect(o, s, a, 16), i.fill(), i.fillStyle = "#ffffff", i.textAlign = "center", i.textBaseline = "middle", i.fillText(e, o + a / 2, s + 16 / 2 + .5);
			};
			ee(n + "°C", b, _ + 3, "bottom"), ee(Math.round(l) + " g", 41, x, "left"), i.textAlign = "left", i.textBaseline = "top";
			let te = g + 18, ne = _ - 26, re = ne + 8 + 1;
			i.fillStyle = "#eef1f6", i.strokeStyle = "#9aa3b2", i.lineWidth = 1.5, i.beginPath(), i.arc(te, 32, 4, Math.PI, 0), i.lineTo(te + 4, ne), i.lineTo(te - 4, ne), i.closePath(), i.fill(), i.stroke(), i.beginPath(), i.arc(te, re, 8, 0, Math.PI * 2), i.fillStyle = "#e3342f", i.fill(), i.strokeStyle = "#c1271f", i.stroke();
			let C = ne - (n - 20) / 40 * (ne - 32);
			i.fillStyle = "#e3342f", i.fillRect(te - 3, C, 6, ne - C), i.beginPath(), i.arc(te, re, 6, 0, Math.PI * 2), i.fill(), i.fillStyle = "#5a6472", i.font = "9px Outfit, sans-serif", i.textAlign = "left", i.textBaseline = "middle", [
				20,
				40,
				60
			].forEach((e) => {
				let t = ne - (e - 20) / 40 * (ne - 32);
				i.fillText(e + "°", te + 4 + 3, t);
			}), i.textBaseline = "top";
			let w = te + 22, ie = Math.min(f * .2, f - w - 6), ae = w + (f - w - ie) / 2, oe = h - 6;
			i.strokeStyle = "#9aa3b2", i.lineWidth = 2, i.beginPath(), i.moveTo(ae, 24), i.lineTo(ae, 24 + oe), i.lineTo(ae + ie, 24 + oe), i.lineTo(ae + ie, 24), i.stroke();
			let se = 24 + oe * .18;
			i.fillStyle = "rgba(108,165,237,0.22)", i.fillRect(ae + 1, se, ie - 2, 24 + oe - se - 1);
			let ce = ie - 6, T = Math.max(3, Math.floor(ce / 12)), le = ce / T, ue = T * Math.max(1, Math.floor(oe * .55 / le)), E = d > 0 ? Math.max(0, Math.min(1, u / d)) : 0, de = Math.round(E * ue), fe = s.current;
			fe < de ? s.current = Math.min(de, fe + .25) : fe > de && (s.current = Math.max(de, fe - .6));
			let D = Math.floor(s.current), pe = o(T), me = 24 + oe - 1, he = ae + (ie - T * le) / 2;
			for (let e = 0; e < D; e++) {
				let t = Math.floor(e / T), n = he + pe[e % T] * le, r = me - (t + 1) * le, a = (le - 2) * .9, o = n + 1 + (le - 2 - a) / 2, s = r + 1 + (le - 2 - a) / 2;
				i.fillStyle = "#7c3aed", i.fillRect(o, s, a, a), i.strokeStyle = "rgba(91,33,182,0.9)", i.lineWidth = 1, i.strokeRect(o, s, a, a);
			}
			i.fillStyle = "#5a6472", i.font = "600 10px Outfit, sans-serif", i.textAlign = "center", i.fillText(u > .5 ? Math.round(u) + " g solid" : "all dissolved", ae + ie / 2, 24 + oe + 8);
		}, p = () => {
			f(), t = requestAnimationFrame(p);
		};
		p();
		let m = new ResizeObserver(() => {});
		return m.observe(e), () => {
			m.disconnect(), cancelAnimationFrame(t);
		};
	}, [n]), /* @__PURE__ */ e.createElement(e.Fragment, null, /* @__PURE__ */ e.createElement("div", {
		className: "slide-title",
		style: z.title
	}, "The Falling Ceiling: Cooling Forces a Solid Out"), /* @__PURE__ */ e.createElement("div", {
		className: "slide-left",
		style: z.left
	}, /* @__PURE__ */ e.createElement("div", { style: z.cardHook }, /* @__PURE__ */ e.createElement("span", { style: z.corner }, "💭"), /* @__PURE__ */ e.createElement("p", { style: z.hookText }, "If words like \"saturated\" still feel like a new language, ", t, ", don't worry — we'll reason it out together. Macroscopically: hot water dissolved 287 g of solid and held it, perfectly clear, nothing left over. Now let it cool on the bench. Where does the solid go? Predict before you slide.")), /* @__PURE__ */ e.createElement("div", { style: z.explain }, /* @__PURE__ */ e.createElement("div", { style: z.hCard }, "Step 1 — Name the ceiling"), /* @__PURE__ */ e.createElement("p", { style: z.body }, "Think of ", /* @__PURE__ */ e.createElement("b", null, "solubility"), " as a ceiling: the most the water can hold at a given temperature. At 60 °C that ceiling is 287 g and the water is filled right to it — this is what we mean by ", /* @__PURE__ */ e.createElement("b", null, "saturated"), ". Cool the water and the ceiling ", /* @__PURE__ */ e.createElement("b", null, "drops"), ", because cold water simply offers less room.")), /* @__PURE__ */ e.createElement("div", { style: z.explain }, /* @__PURE__ */ e.createElement("div", { style: z.hCard }, "Step 2 — Compare, then subtract"), /* @__PURE__ */ e.createElement("p", { style: z.body }, /* @__PURE__ */ e.createElement("b", null, "Strategy:"), " set what the water is still holding against the new, lower ceiling.", /* @__PURE__ */ e.createElement("br", null), /* @__PURE__ */ e.createElement("b", null, "Solution:"), " it carries 287 g, but at 40 °C the ceiling has fallen to 241 g. Whatever no longer fits is forced out as solid crystals."), /* @__PURE__ */ e.createElement("div", { style: z.formula }, "out = held − new ceiling = 287 − 241 = 46 g")), /* @__PURE__ */ e.createElement("div", { style: z.cardInsight }, /* @__PURE__ */ e.createElement("span", { style: z.corner }, "💡"), /* @__PURE__ */ e.createElement("p", { style: z.body }, "Crystals stop forming the instant the held amount sits back on the ceiling. At that moment the cooler solution is ", /* @__PURE__ */ e.createElement("b", null, "saturated again"), " — the same rule, simply at a lower temperature.")), /* @__PURE__ */ e.createElement("div", { style: z.cardPitfall }, /* @__PURE__ */ e.createElement("span", { style: z.corner }, "⚠️"), /* @__PURE__ */ e.createElement("p", { style: z.body }, "Be precise: cooling does not \"make\" the solid. Microscopically, those particles were dissolved and moving freely all along — cooling only removes the room they had, so they lock together into crystals. No new matter is created."))), /* @__PURE__ */ e.createElement("div", {
		className: "slide-right",
		style: z.right
	}, /* @__PURE__ */ e.createElement("div", { style: z.panelTitle }, "Change the temperature"), /* @__PURE__ */ e.createElement("canvas", {
		ref: i,
		style: z.canvas,
		onPointerDown: p,
		onPointerMove: m,
		onPointerUp: h,
		onPointerLeave: h
	}), /* @__PURE__ */ e.createElement("div", { style: z.chips }, /* @__PURE__ */ e.createElement("div", { style: z.chip }, /* @__PURE__ */ e.createElement("span", { style: z.chipLabel }, "Temp"), /* @__PURE__ */ e.createElement("span", { style: z.chipVal }, n, "°C")), /* @__PURE__ */ e.createElement("div", { style: {
		...z.chip,
		borderColor: "var(--accent)"
	} }, /* @__PURE__ */ e.createElement("span", { style: z.chipLabel }, "Held"), /* @__PURE__ */ e.createElement("span", { style: z.chipVal }, "287 g")), /* @__PURE__ */ e.createElement("div", { style: {
		...z.chip,
		borderColor: "var(--surprise)"
	} }, /* @__PURE__ */ e.createElement("span", { style: z.chipLabel }, "Ceiling"), /* @__PURE__ */ e.createElement("span", { style: z.chipVal }, Math.round(l), " g")), /* @__PURE__ */ e.createElement("div", { style: {
		...z.chip,
		borderColor: "var(--surprise)",
		background: "var(--surprise-soft)"
	} }, /* @__PURE__ */ e.createElement("span", { style: z.chipLabel }, "Out"), /* @__PURE__ */ e.createElement("span", { style: {
		...z.chipVal,
		color: "var(--surprise-text)"
	} }, Math.round(u), " g"))), /* @__PURE__ */ e.createElement("div", { style: z.readout }, n >= 60 ? "Saturated at 60 °C — the held amount sits exactly on the ceiling, so nothing falls out yet. Drag the dot left to cool it and watch." : "Reasoning it through: ceiling has dropped to " + Math.round(l) + " g, so 287 − " + Math.round(l) + " = " + Math.round(u) + " g must crystallise out. The solution is saturated again at " + n + " °C.")));
}
var Qe = {
	background: "var(--surface-raised)",
	border: "1px solid var(--border-light)",
	borderRadius: 10,
	padding: "14px 18px",
	boxSizing: "border-box",
	position: "relative"
}, z = {
	title: {
		fontSize: 22,
		fontWeight: 700,
		color: "var(--text-primary)"
	},
	left: {
		display: "flex",
		flexDirection: "column",
		gap: 14,
		minWidth: 0
	},
	right: {
		display: "flex",
		flexDirection: "column",
		gap: 12,
		minWidth: 0
	},
	corner: {
		position: "absolute",
		top: 10,
		right: 12,
		fontSize: 16,
		lineHeight: 1
	},
	explain: {
		padding: "0 2px",
		minWidth: 0
	},
	cardHook: {
		...Qe,
		background: "var(--hook-soft)",
		borderLeft: "2px solid var(--hook)",
		paddingRight: 36
	},
	cardInsight: {
		...Qe,
		background: "var(--primary-softer)",
		borderColor: "var(--primary-soft)",
		borderLeft: "2px solid var(--primary)",
		paddingRight: 36
	},
	cardPitfall: {
		...Qe,
		background: "var(--accent-soft)",
		borderLeft: "2px solid var(--accent)",
		paddingRight: 36
	},
	hCard: {
		fontSize: 14,
		fontWeight: 700,
		color: "var(--primary)",
		marginBottom: 6
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
		lineHeight: 1.6,
		color: "var(--text-primary)",
		margin: 0
	},
	formula: {
		textAlign: "center",
		fontFamily: "monospace",
		fontWeight: 700,
		fontSize: 15,
		color: "var(--text-primary)",
		background: "var(--surface)",
		border: "1px solid var(--border-light)",
		borderRadius: 8,
		padding: "12px 14px",
		marginTop: 10
	},
	panelTitle: {
		fontSize: 16,
		fontWeight: 700,
		color: "var(--text-primary)"
	},
	canvas: {
		width: "100%",
		aspectRatio: "16 / 10",
		maxHeight: "40vh",
		display: "block",
		background: "var(--surface)",
		border: "1px solid var(--border-light)",
		borderRadius: 8,
		touchAction: "none",
		cursor: "pointer"
	},
	chips: {
		display: "flex",
		flexWrap: "wrap",
		gap: 8
	},
	chip: {
		flex: "1 1 0",
		minWidth: 64,
		display: "flex",
		flexDirection: "column",
		alignItems: "center",
		gap: 2,
		background: "var(--surface-raised)",
		border: "1px solid var(--border-light)",
		borderRadius: 8,
		padding: "6px 4px",
		boxSizing: "border-box"
	},
	chipLabel: {
		fontSize: 11,
		color: "var(--text-muted)",
		fontWeight: 600
	},
	chipVal: {
		fontSize: 16,
		fontWeight: 700,
		color: "var(--text-primary)"
	},
	readout: {
		fontSize: 14,
		fontWeight: 600,
		color: "var(--text-secondary)",
		textAlign: "center",
		lineHeight: 1.5
	}
}, $e = {
	salt: {
		label: "Salt",
		type: "polar",
		self: 9,
		color: "#e8edf5",
		img: "https://starkhorn.nadilearning.com/files/slide-assets/b7953a8a-5277-46bd-aec3-8bc8576a1f49/7c07c5bf-d100-48b4-ad9d-d2ccc2877686.jpg"
	},
	sugar: {
		label: "Sugar",
		type: "polar",
		self: 7,
		color: "#ffffff",
		shape: "square",
		img: "https://starkhorn.nadilearning.com/files/slide-assets/b7953a8a-5277-46bd-aec3-8bc8576a1f49/a7580a8b-b8a6-4e2e-8d8c-8a2ba3e81fd2.jpg"
	},
	wax: {
		label: "Wax",
		type: "nonpolar",
		self: 4,
		color: "#f4d35e",
		img: "https://starkhorn.nadilearning.com/files/slide-assets/b7953a8a-5277-46bd-aec3-8bc8576a1f49/4dbc9382-2f96-43cf-90c5-a1e69c56cb8e.jpg"
	}
}, et = {
	water: {
		label: "Water",
		type: "polar",
		self: 8,
		color: "#4a90e2",
		fill: "rgba(74,144,226,0.16)",
		img: "https://starkhorn.nadilearning.com/files/slide-assets/b7953a8a-5277-46bd-aec3-8bc8576a1f49/db4d20a0-831d-44d6-a79d-41bd9b7c1a74.jpg"
	},
	oil: {
		label: "Oil",
		type: "nonpolar",
		self: 3,
		color: "#caa23a",
		fill: "rgba(202,162,58,0.16)",
		img: "https://starkhorn.nadilearning.com/files/slide-assets/b7953a8a-5277-46bd-aec3-8bc8576a1f49/3bfa6756-c62f-471f-b2c3-11b270e39476.webp"
	}
};
function tt(e, t) {
	let n = $e[e], r = et[t], i = n.self + r.self, a = n.type === r.type ? Math.round(i * 1.05) : Math.round(i * .4);
	return {
		su: n,
		sv: r,
		breakSolute: n.self,
		breakSolvent: r.self,
		breakCost: i,
		newRelease: a,
		dissolves: a >= i
	};
}
function nt({ studentName: t }) {
	let [n, r] = w("salt"), [i, a] = w("water"), o = tt(n, i), s = C(null), c = C(o.dissolves), l = C(+!!o.dissolves), u = C(null), d = C(0);
	if (b(() => {
		c.current = o.dissolves;
	}, [o.dissolves]), !u.current) {
		let e = [];
		for (let t = 0; t < 46; t++) e.push({
			x: Math.random(),
			y: .18 + Math.random() * .78,
			ph: Math.random() * 6.28,
			sp: .4 + Math.random()
		});
		let t = [];
		for (let e = 0; e < 18; e++) {
			let n = Math.floor(e / 5), r = e % 5;
			t.push({
				cx: .4 + r * .045,
				cy: .1 + n * .05,
				dx: .1 + Math.random() * .8,
				dy: .24 + Math.random() * .7,
				ph: Math.random() * 6.28
			});
		}
		u.current = {
			solvent: e,
			solute: t
		};
	}
	b(() => {
		let e = s.current;
		if (!e) return;
		let t = e.getContext("2d"), r = !0, a = () => {
			let n = e.getBoundingClientRect(), r = window.devicePixelRatio || 1;
			e.width = n.width * r, e.height = n.height * r, t.setTransform(r, 0, 0, r, 0, 0);
		};
		a();
		let o = new ResizeObserver(a);
		o.observe(e);
		let f = 0, p = () => {
			if (!r) return;
			f += .016;
			let a = e.clientWidth, o = e.clientHeight, s = et[i], m = u.current, h = +!!c.current;
			l.current += (h - l.current) * .06;
			let g = l.current;
			t.clearRect(0, 0, a, o);
			let _ = a * .1, v = a * .8, y = o * .1, b = o * .82, x = y + b * .14;
			t.fillStyle = s.fill, t.fillRect(_, x, v, y + b - x);
			let S = (e) => _ + e * v, ee = (e) => y + e * b;
			t.fillStyle = s.color;
			for (let e of m.solvent) {
				let n = Math.sin(f * e.sp + e.ph) * .012, r = Math.cos(f * e.sp * .8 + e.ph) * .012, i = S(Math.min(.97, Math.max(.03, e.x + n))), a = ee(Math.min(.97, Math.max(.16, e.y + r)));
				t.beginPath(), t.arc(i, a, 4.2, 0, 6.283), t.fill();
			}
			let te = $e[n];
			for (let e of m.solute) {
				let n = Math.sin(f * 1.3 + e.ph) * .012 * g, r = Math.cos(f * 1.1 + e.ph) * .012 * g, i = e.cx + (e.dx - e.cx) * g + n, a = e.cy + (e.dy - e.cy) * g + r, o = S(i), s = ee(a);
				if (g > .5 && (t.fillStyle = "rgba(74,222,128," + .1 * (g - .5) + ")", t.beginPath(), t.arc(o, s, 9, 0, 6.283), t.fill()), t.fillStyle = te.color, t.strokeStyle = "rgba(0,0,0,0.30)", t.lineWidth = 1, te.shape === "square") {
					let e = 9.5;
					t.beginPath(), t.rect(o - e / 2, s - e / 2, e, e), t.fill(), t.stroke();
				} else t.beginPath(), t.arc(o, s, 5.4, 0, 6.283), t.fill(), t.stroke();
			}
			t.strokeStyle = "rgba(120,130,150,0.85)", t.lineWidth = 2.5, t.beginPath(), t.moveTo(_, y), t.lineTo(_, y + b), t.lineTo(_ + v, y + b), t.lineTo(_ + v, y), t.stroke(), d.current = requestAnimationFrame(p);
		};
		return d.current = requestAnimationFrame(p), () => {
			r = !1, cancelAnimationFrame(d.current), o.disconnect();
		};
	}, [n, i]);
	let f = (e) => Math.max(2, e / 20 * 100);
	return /* @__PURE__ */ e.createElement(e.Fragment, null, /* @__PURE__ */ e.createElement("div", {
		className: "slide-title",
		style: B.title
	}, "The Three Tugs: Why Some Things Mix and Others Don't"), /* @__PURE__ */ e.createElement("div", {
		className: "slide-left",
		style: B.left
	}, /* @__PURE__ */ e.createElement("div", { style: B.cardHook }, /* @__PURE__ */ e.createElement("span", { style: B.corner }, "💭"), /* @__PURE__ */ e.createElement("p", { style: B.hookText }, t, ", chemistry comes with its own vocabulary — learning it is a little like picking up a new language, and you're already asking the right questions. Look at what you can see: salt vanishes into water, yet oil sits stubbornly in its own layer. Same beaker, opposite outcomes. The particles aren't acting at random — they follow a rule. Let's reason it out together, step by step.")), /* @__PURE__ */ e.createElement("div", { style: B.plain }, /* @__PURE__ */ e.createElement("div", { style: B.hCard }, "Let's break dissolving into three clear steps"), /* @__PURE__ */ e.createElement("p", { style: B.body }, "Now zoom in to the particles — the microscopic view behind what you saw. For a solute to mix into a solvent, three sets of attractions are rearranged. Work through them in order:"), /* @__PURE__ */ e.createElement("div", { style: B.steps }, /* @__PURE__ */ e.createElement("div", { style: B.step }, /* @__PURE__ */ e.createElement("span", { style: B.num }, "1"), /* @__PURE__ */ e.createElement("span", null, /* @__PURE__ */ e.createElement("b", null, "Make room — pull the solvent apart."), " Water particles cling to one another, so easing some aside takes work. ", /* @__PURE__ */ e.createElement("i", null, "Costs energy."))), /* @__PURE__ */ e.createElement("div", { style: B.step }, /* @__PURE__ */ e.createElement("span", { style: B.num }, "2"), /* @__PURE__ */ e.createElement("span", null, /* @__PURE__ */ e.createElement("b", null, "Free the solute — pull its particles apart."), " The particles in the solid grip each other too, so lifting them off their group takes work. ", /* @__PURE__ */ e.createElement("i", null, "Costs energy."))), /* @__PURE__ */ e.createElement("div", { style: B.step }, /* @__PURE__ */ e.createElement("span", { style: B.num }, "3"), /* @__PURE__ */ e.createElement("span", null, /* @__PURE__ */ e.createElement("b", null, "Connect — form new attractions."), " Now solute and solvent particles reach for each other. ", /* @__PURE__ */ e.createElement("i", null, "This step gives energy back."))))), /* @__PURE__ */ e.createElement("div", { style: B.cardInsight }, /* @__PURE__ */ e.createElement("span", { style: B.corner }, "💡"), /* @__PURE__ */ e.createElement("p", { style: B.body }, "Here's the whole idea as a single test: do the ", /* @__PURE__ */ e.createElement("b", null, "new attractions (step 3)"), " give back enough to cover the ", /* @__PURE__ */ e.createElement("b", null, "cost of breaking apart (steps 1 + 2)"), "? Written symbolically, that's the rule:"), /* @__PURE__ */ e.createElement("div", { style: B.formula }, "dissolves when:  step 3  ≥  step 1 + step 2"), /* @__PURE__ */ e.createElement("p", { style: B.body }, "And step 3 is strong only when the two substances are ", /* @__PURE__ */ e.createElement("b", null, "similar"), " — both polar, or both non-polar. Similar substances mix; a mismatch stays apart. Notice what just happened: you turned a messy observation into a rule you can reuse.")), /* @__PURE__ */ e.createElement("div", { style: B.cardPitfall }, /* @__PURE__ */ e.createElement("span", { style: B.corner }, "⚠️"), /* @__PURE__ */ e.createElement("p", { style: B.body }, "It's tempting to say oil \"isn't strong enough\" to dissolve — but that's not it, and the precise word matters. Oil's particles attract each other perfectly well. The real issue is a ", /* @__PURE__ */ e.createElement("b", null, "mismatch"), ": the new oil–water attraction is too weak to pay for breaking water's strong grip, so each kind stays with its own. Not weakness — mismatch.")), /* @__PURE__ */ e.createElement("div", { style: B.plain }, /* @__PURE__ */ e.createElement("div", { style: B.hCard }, "Coming up later 🔭"), /* @__PURE__ */ e.createElement("p", { style: B.body }, "But ", /* @__PURE__ */ e.createElement("i", null, "why"), " is water \"polar\" and oil not? Why do solubilities differ so much from one solvent to another? That comes down to how the atoms themselves are built — we'll dig into the real reason in the chapter on the ", /* @__PURE__ */ e.createElement("b", null, "atomic foundations of matter"), "."))), /* @__PURE__ */ e.createElement("div", {
		className: "slide-right",
		style: B.right
	}, /* @__PURE__ */ e.createElement("div", { style: B.panelTitle }, "Test a pair for yourself"), /* @__PURE__ */ e.createElement("div", { style: B.hint }, /* @__PURE__ */ e.createElement("b", null, "Your strategy:"), " weigh what you must pay (break the two apart) against what you get back (new attractions). Pick a pair and read the balance below — let the particles show you."), /* @__PURE__ */ e.createElement("div", { style: B.pickRow }, /* @__PURE__ */ e.createElement("div", { style: B.pickGroup }, /* @__PURE__ */ e.createElement("div", { style: B.pickLabel }, "Solute"), /* @__PURE__ */ e.createElement("div", { style: B.btns }, Object.keys($e).map((t) => /* @__PURE__ */ e.createElement("button", {
		key: t,
		onClick: () => r(t),
		style: {
			...B.tile,
			...n === t ? B.tileOn : {}
		}
	}, $e[t].img ? /* @__PURE__ */ e.createElement("span", { style: B.thumbWrap }, /* @__PURE__ */ e.createElement("img", {
		src: $e[t].img,
		alt: $e[t].label,
		style: B.thumbImg
	}), /* @__PURE__ */ e.createElement("span", { style: B.thumbLabel }, $e[t].label)) : /* @__PURE__ */ e.createElement("span", { style: {
		...B.thumbWrap,
		background: $e[t].color
	} }, /* @__PURE__ */ e.createElement("span", { style: B.thumbLabelSolid }, $e[t].label)))))), /* @__PURE__ */ e.createElement("div", { style: B.pickGroup }, /* @__PURE__ */ e.createElement("div", { style: B.pickLabel }, "Solvent"), /* @__PURE__ */ e.createElement("div", { style: B.btns }, Object.keys(et).map((t) => /* @__PURE__ */ e.createElement("button", {
		key: t,
		onClick: () => a(t),
		style: {
			...B.tile,
			...i === t ? B.tileOn : {}
		}
	}, et[t].img ? /* @__PURE__ */ e.createElement("span", { style: B.thumbWrap }, /* @__PURE__ */ e.createElement("img", {
		src: et[t].img,
		alt: et[t].label,
		style: B.thumbImg
	}), /* @__PURE__ */ e.createElement("span", { style: B.thumbLabel }, et[t].label)) : /* @__PURE__ */ e.createElement("span", { style: {
		...B.thumbWrap,
		background: et[t].color
	} }, /* @__PURE__ */ e.createElement("span", { style: B.thumbLabelSolid }, et[t].label))))))), /* @__PURE__ */ e.createElement("canvas", {
		ref: s,
		style: {
			width: "100%",
			aspectRatio: "5 / 4",
			maxHeight: "34vh",
			display: "block",
			borderRadius: 10,
			background: "var(--surface)",
			outline: o.dissolves ? "2px solid #34c77b" : "2px solid var(--accent)"
		}
	}), /* @__PURE__ */ e.createElement("div", { style: B.balance }, /* @__PURE__ */ e.createElement("div", { style: B.balCol }, /* @__PURE__ */ e.createElement("div", { style: B.barWrap }, /* @__PURE__ */ e.createElement("div", {
		style: {
			...B.barSeg,
			height: f(o.breakSolvent) + "px",
			background: et[i].color
		},
		title: "break solvent apart"
	}), /* @__PURE__ */ e.createElement("div", {
		style: {
			...B.barSeg,
			height: f(o.breakSolute) + "px",
			background: $e[n].color,
			borderTop: "2px solid var(--surface)",
			boxShadow: "inset 0 0 0 1px rgba(0,0,0,0.18)"
		},
		title: "break solute apart"
	})), /* @__PURE__ */ e.createElement("div", { style: B.balNum }, o.breakCost), /* @__PURE__ */ e.createElement("div", { style: B.balCap }, "Cost to break apart", /* @__PURE__ */ e.createElement("br", null), "(solvent + solute)")), /* @__PURE__ */ e.createElement("div", { style: B.vs }, "vs"), /* @__PURE__ */ e.createElement("div", { style: B.balCol }, /* @__PURE__ */ e.createElement("div", { style: B.barWrap }, /* @__PURE__ */ e.createElement("div", {
		style: {
			...B.barSeg,
			height: f(o.newRelease) + "px",
			background: o.dissolves ? "#34c77b" : "var(--accent)"
		},
		title: "energy from new attractions"
	})), /* @__PURE__ */ e.createElement("div", { style: B.balNum }, o.newRelease), /* @__PURE__ */ e.createElement("div", { style: B.balCap }, "Energy from", /* @__PURE__ */ e.createElement("br", null), "new attractions"))), /* @__PURE__ */ e.createElement("div", { style: {
		...B.verdict,
		color: o.dissolves ? "#1f9d57" : "var(--accent-text)",
		borderColor: o.dissolves ? "#34c77b" : "var(--accent)",
		background: o.dissolves ? "rgba(52,199,123,0.10)" : "var(--accent-soft)"
	} }, o.dissolves ? "✓ It dissolves. Step 3 pays back the full cost of steps 1 + 2 — a good match (" + o.su.type + " + " + o.sv.type + "). Nicely reasoned." : "✗ It stays separate. Step 3 falls short of steps 1 + 2, so each particle keeps to its own kind — a mismatch (" + o.su.type + " + " + o.sv.type + ").")));
}
var rt = {
	background: "var(--surface-raised)",
	border: "1px solid var(--border-light)",
	borderRadius: 10,
	padding: "14px 18px",
	position: "relative",
	paddingRight: 42
}, B = {
	title: {
		fontSize: 21,
		fontWeight: 700,
		color: "var(--text-primary)"
	},
	left: {
		display: "flex",
		flexDirection: "column",
		gap: 14,
		minWidth: 0
	},
	right: {
		display: "flex",
		flexDirection: "column",
		gap: 12,
		minWidth: 0
	},
	corner: {
		position: "absolute",
		top: 10,
		right: 12,
		fontSize: 18,
		lineHeight: 1
	},
	plain: { padding: "0 2px" },
	cardHook: {
		...rt,
		background: "var(--hook-soft)",
		borderLeft: "2px solid var(--hook)"
	},
	cardInsight: {
		...rt,
		background: "var(--primary-softer)",
		borderColor: "var(--primary-soft)",
		borderLeft: "2px solid var(--primary)"
	},
	cardPitfall: {
		...rt,
		background: "var(--accent-soft)",
		borderLeft: "2px solid var(--accent)"
	},
	hCard: {
		fontSize: 14,
		fontWeight: 700,
		color: "var(--primary)",
		marginBottom: 8
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
		lineHeight: 1.6,
		color: "var(--text-primary)",
		margin: 0
	},
	formula: {
		textAlign: "center",
		fontFamily: "monospace",
		fontWeight: 700,
		fontSize: 15,
		color: "var(--text-primary)",
		background: "var(--surface)",
		border: "1px solid var(--border-light)",
		borderRadius: 8,
		padding: "12px 14px",
		margin: "10px 0"
	},
	hint: {
		fontSize: 13,
		lineHeight: 1.5,
		color: "var(--text-secondary)"
	},
	steps: {
		display: "flex",
		flexDirection: "column",
		gap: 8,
		marginTop: 10
	},
	step: {
		display: "flex",
		gap: 10,
		fontSize: 14.5,
		lineHeight: 1.5,
		color: "var(--text-primary)",
		alignItems: "flex-start"
	},
	num: {
		flexShrink: 0,
		width: 22,
		height: 22,
		borderRadius: 6,
		background: "var(--primary-soft)",
		color: "var(--primary-text)",
		fontWeight: 700,
		fontSize: 13,
		display: "inline-flex",
		alignItems: "center",
		justifyContent: "center"
	},
	panelTitle: {
		fontSize: 16,
		fontWeight: 700,
		color: "var(--text-primary)"
	},
	pickRow: {
		display: "flex",
		flexDirection: "column",
		gap: 12
	},
	pickGroup: { minWidth: 0 },
	tile: {
		padding: 0,
		border: "2px solid var(--border)",
		borderRadius: 10,
		background: "var(--surface)",
		cursor: "pointer",
		overflow: "hidden",
		fontFamily: "inherit"
	},
	tileOn: { border: "2px solid var(--primary)" },
	thumbWrap: {
		position: "relative",
		display: "block",
		width: 104,
		height: 58
	},
	thumbImg: {
		width: "100%",
		height: "100%",
		objectFit: "cover",
		display: "block"
	},
	thumbLabel: {
		position: "absolute",
		left: 0,
		right: 0,
		bottom: 0,
		textAlign: "center",
		fontSize: 13,
		fontWeight: 700,
		color: "#fff",
		background: "rgba(0,0,0,0.5)",
		padding: "3px 0",
		textShadow: "0 1px 2px rgba(0,0,0,0.7)"
	},
	thumbLabelSolid: {
		position: "absolute",
		top: 0,
		left: 0,
		right: 0,
		bottom: 0,
		display: "flex",
		alignItems: "center",
		justifyContent: "center",
		fontSize: 13,
		fontWeight: 700,
		color: "var(--text-primary)"
	},
	pickLabel: {
		fontSize: 12,
		fontWeight: 700,
		color: "var(--text-muted)",
		marginBottom: 6,
		textTransform: "uppercase",
		letterSpacing: .4
	},
	btns: {
		display: "flex",
		gap: 6,
		flexWrap: "wrap"
	},
	pill: {
		display: "inline-flex",
		alignItems: "center",
		gap: 7,
		padding: "5px 12px 5px 6px",
		borderRadius: 999,
		border: "1px solid var(--border)",
		background: "var(--surface)",
		color: "var(--text-secondary)",
		fontSize: 13.5,
		fontWeight: 600,
		cursor: "pointer",
		fontFamily: "inherit"
	},
	pillOn: {
		border: "1px solid var(--primary)",
		background: "var(--primary-softer)",
		color: "var(--primary-text)"
	},
	pillImg: {
		width: 26,
		height: 26,
		borderRadius: "50%",
		objectFit: "cover",
		flexShrink: 0,
		border: "1px solid var(--border-light)"
	},
	dot: {
		width: 14,
		height: 14,
		borderRadius: "50%",
		border: "1px solid rgba(0,0,0,0.2)",
		flexShrink: 0,
		marginLeft: 6
	},
	balance: {
		display: "flex",
		alignItems: "flex-end",
		justifyContent: "center",
		gap: 14
	},
	balCol: {
		display: "flex",
		flexDirection: "column",
		alignItems: "center",
		flex: "0 1 130px",
		minWidth: 0
	},
	barWrap: {
		display: "flex",
		flexDirection: "column-reverse",
		justifyContent: "flex-start",
		width: 46,
		height: 104,
		background: "var(--surface)",
		border: "1px solid var(--border-light)",
		borderRadius: 6,
		overflow: "hidden"
	},
	barSeg: {
		width: "100%",
		transition: "height 0.3s ease"
	},
	balNum: {
		fontSize: 17,
		fontWeight: 700,
		color: "var(--text-primary)",
		marginTop: 6
	},
	balCap: {
		fontSize: 11.5,
		color: "var(--text-muted)",
		textAlign: "center",
		lineHeight: 1.35,
		marginTop: 2
	},
	vs: {
		fontSize: 14,
		fontWeight: 700,
		color: "var(--text-muted)",
		paddingBottom: 44
	},
	verdict: {
		fontSize: 14.5,
		fontWeight: 700,
		textAlign: "center",
		padding: "10px 12px",
		borderRadius: 8,
		border: "1px solid",
		lineHeight: 1.45
	}
}, it = {
	CaCl2: {
		label: "Calcium chloride (CaCl₂)",
		short: "Calcium chloride",
		cost: 60,
		release: 90,
		img: "https://starkhorn.nadilearning.com/files/slide-assets/b7953a8a-5277-46bd-aec3-8bc8576a1f49/bd495467-5e76-498e-99cd-6dc0c915f8fc.jpg"
	},
	KNO3: {
		label: "Potassium nitrate (KNO₃)",
		short: "Potassium nitrate",
		cost: 72,
		release: 38,
		img: "https://starkhorn.nadilearning.com/files/slide-assets/b7953a8a-5277-46bd-aec3-8bc8576a1f49/dd3804f8-342b-41fe-85da-c3cbc27b1400.webp"
	},
	NH4NO3: {
		label: "Ammonium nitrate (NH₄NO₃)",
		short: "Ammonium nitrate",
		cost: 80,
		release: 55,
		img: "https://starkhorn.nadilearning.com/files/slide-assets/b7953a8a-5277-46bd-aec3-8bc8576a1f49/ee51081c-fc05-4b27-966f-a2ec249601d6.png"
	}
};
function at(e, t, n) {
	return e + (t - e) * n;
}
function ot(e, t, n) {
	return Math.max(t, Math.min(n, e));
}
function st({ studentName: t }) {
	let [n, r] = w("CaCl2"), [i, a] = w("ready"), o = it[n], s = o.release > o.cost, c = C(null), l = C(0), u = C(0), d = C(.5), f = C(null), p = C({
		stage: "ready",
		hot: !0
	});
	return b(() => {
		p.current = {
			stage: i,
			hot: s
		};
	}, [i, s]), b(() => {
		a("ready"), u.current = 0, d.current = .5;
	}, [n]), b(() => {
		let e = c.current;
		if (!e) return;
		let t = e.getContext("2d");
		f.current ||= Array.from({ length: 36 }, (e, t) => {
			let n = t % 6, r = Math.floor(t / 6);
			return {
				cryX: .5 + (n - 2.5) * .05,
				cryY: .8 + (r - 2.5) * .05,
				dispX: .08 + Math.random() * .84,
				dispY: .08 + Math.random() * .84,
				ph: Math.random() * Math.PI * 2
			};
		});
		function n() {
			let n = e.getBoundingClientRect(), r = window.devicePixelRatio || 1;
			e.width = n.width * r, e.height = n.height * r, t.setTransform(r, 0, 0, r, 0, 0);
		}
		n();
		let r = new ResizeObserver(n);
		r.observe(e);
		function i() {
			let n = e.clientWidth, r = e.clientHeight, a = p.current, o = performance.now() / 1e3, s = a.stage === "ready" ? 0 : 1;
			u.current = at(u.current, s, .05);
			let c = a.stage === "measured" ? a.hot ? .86 : .22 : .5;
			d.current = at(d.current, c, .07);
			let m = u.current, h = a.stage === "measured";
			t.clearRect(0, 0, n, r);
			let g = n * .07, _ = n * .42, v = r * .16, y = r * .88, b = r * .4, x = 80, S = 145, ee = 225;
			if (h) {
				let e = ot(d.current, 0, 1);
				a.hot ? (x = at(80, 232, (e - .5) * 2), S = at(145, 128, (e - .5) * 2), ee = at(225, 86, (e - .5) * 2)) : (x = at(80, 58, (.5 - e) * 2), S = at(145, 130, (.5 - e) * 2), ee = at(225, 240, (.5 - e) * 2));
			}
			t.fillStyle = `rgba(${x | 0},${S | 0},${ee | 0},0.85)`, t.beginPath(), t.moveTo(g, b), t.lineTo(g + _, b), t.lineTo(g + _, y), t.lineTo(g, y), t.closePath(), t.fill();
			let te = f.current;
			t.fillStyle = "rgba(255,255,255,0.9)";
			for (let e of te) {
				let n = m * .012 * Math.sin(o * 1.4 + e.ph), r = at(e.cryX, e.dispX, m) + n, i = at(e.cryY, e.dispY, m) + n * .7, a = g + ot(r, .03, .97) * _, s = b + ot(i, .03, .97) * (y - b);
				t.beginPath(), t.arc(a, s, m > .5 ? 2.6 : 3, 0, Math.PI * 2), t.fill();
			}
			t.strokeStyle = "rgba(40,55,75,0.55)", t.lineWidth = 2.5, t.beginPath(), t.moveTo(g - 3, v), t.lineTo(g, v + 6), t.lineTo(g, y), t.lineTo(g + _, y), t.lineTo(g + _, v + 6), t.lineTo(g + _ + 3, v), t.stroke();
			let ne = n * .74, re = r * .22, C = r * .74, w = n * .045, ie = n * .05;
			t.fillStyle = "rgba(235,240,248,0.95)", t.strokeStyle = "rgba(40,55,75,0.5)", t.lineWidth = 2, lt(t, ne - ie / 2, re, ie, C - re, ie / 2), t.fill(), t.stroke(), t.beginPath(), t.arc(ne, C + w * .4, w, 0, Math.PI * 2), t.fillStyle = "rgba(235,240,248,0.95)", t.fill(), t.stroke();
			let ae = ot(d.current, .06, 1), oe = at(C, re + ie * .4, ae);
			t.fillStyle = h ? a.hot ? "rgba(228,92,60,0.95)" : "rgba(70,130,220,0.95)" : "rgba(150,165,185,0.85)", t.beginPath(), t.arc(ne, C + w * .4, w - 3, 0, Math.PI * 2), t.fill(), lt(t, ne - (ie - 6) / 2, oe, ie - 6, C - oe, (ie - 6) / 2), t.fill(), t.textAlign = "center", t.font = `700 ${Math.max(13, n * .04)}px Outfit, sans-serif`, h ? (t.fillStyle = a.hot ? "rgba(210,80,50,1)" : "rgba(55,115,205,1)", t.fillText(a.hot ? "WARM" : "COLD", ne, re - 8)) : (t.fillStyle = "rgba(90,105,125,0.8)", t.fillText("—", ne, re - 8)), l.current = requestAnimationFrame(i);
		}
		return l.current = requestAnimationFrame(i), () => {
			cancelAnimationFrame(l.current), r.disconnect();
		};
	}, []), /* @__PURE__ */ e.createElement(e.Fragment, null, /* @__PURE__ */ e.createElement("div", {
		className: "slide-title",
		style: V.title
	}, "The Energy Tug-of-War: Why Dissolving Heats Up or Cools Down"), /* @__PURE__ */ e.createElement("div", {
		className: "slide-left",
		style: V.left
	}, /* @__PURE__ */ e.createElement("div", { style: V.cardHook }, /* @__PURE__ */ e.createElement("span", { style: V.emojiCorner }, "💭"), /* @__PURE__ */ e.createElement("p", { style: V.hookText }, "Chemistry has its own vocabulary — almost a new language — but the idea here is one you can feel, ", t, ". Stir a white powder into plain water: no flame, no burner. One beaker warms in your hand; another turns icy cold. Nothing was heated — so where did that warmth come from, and where did the cold go? Let's reason it out, step by step.")), /* @__PURE__ */ e.createElement("div", { style: V.plainBlock }, /* @__PURE__ */ e.createElement("div", { style: V.plainHeading }, "Zoom in: dissolving is a 3-step procedure"), /* @__PURE__ */ e.createElement("div", { style: V.steps }, /* @__PURE__ */ e.createElement("div", { style: V.step }, /* @__PURE__ */ e.createElement("span", { style: V.stepNum }, "1"), /* @__PURE__ */ e.createElement("span", null, /* @__PURE__ */ e.createElement("b", null, "Pull the water apart"), " to make room — this ", /* @__PURE__ */ e.createElement("b", null, "costs energy"), ".")), /* @__PURE__ */ e.createElement("div", { style: V.step }, /* @__PURE__ */ e.createElement("span", { style: V.stepNum }, "2"), /* @__PURE__ */ e.createElement("span", null, /* @__PURE__ */ e.createElement("b", null, "Pull the solid apart"), ", breaking the grip between its particles — also ", /* @__PURE__ */ e.createElement("b", null, "costs energy"), ".")), /* @__PURE__ */ e.createElement("div", { style: V.step }, /* @__PURE__ */ e.createElement("span", { style: V.stepNumRel }, "3"), /* @__PURE__ */ e.createElement("span", null, /* @__PURE__ */ e.createElement("b", null, "Snap together"), " — water and solute particles grab each other and ", /* @__PURE__ */ e.createElement("b", null, "give energy back"), ".")))), /* @__PURE__ */ e.createElement("div", { style: V.cardInsight }, /* @__PURE__ */ e.createElement("span", { style: V.emojiCorner }, "💡"), /* @__PURE__ */ e.createElement("p", { style: V.body }, "Here's how a chemist reasons it out — one clean comparison. Weigh the energy ", /* @__PURE__ */ e.createElement("b", null, "given back"), " in the snap against the energy ", /* @__PURE__ */ e.createElement("b", null, "spent"), " on the two pulls. Snap wins → leftover energy escapes as warmth (", /* @__PURE__ */ e.createElement("b", null, "beaker heats up"), "). Snap loses → the mix draws heat from your hand to cover the shortfall (", /* @__PURE__ */ e.createElement("b", null, "beaker cools down"), "). That single check settles every case.")), /* @__PURE__ */ e.createElement("div", { style: V.cardSurprise }, /* @__PURE__ */ e.createElement("span", { style: V.emojiCorner }, "🤯"), /* @__PURE__ */ e.createElement("p", { style: V.body }, "Stay with it — this same reasoning unlocks the whole curve. Most ", /* @__PURE__ */ e.createElement("b", null, "solids"), " need energy to be pulled apart, so warming the water hands their particles the currency to break free, and more dissolves: solubility climbs with temperature. ", /* @__PURE__ */ e.createElement("b", null, "Gases"), " are already free particles needing no pull — heat just gives them the kick to escape the liquid, so gas solubility ", /* @__PURE__ */ e.createElement("i", null, "falls"), " as it warms. Same logic, opposite outcome.")), /* @__PURE__ */ e.createElement("div", { style: V.cardPitfall }, /* @__PURE__ */ e.createElement("span", { style: V.emojiCorner }, "⚠️"), /* @__PURE__ */ e.createElement("p", { style: V.body }, "It's tempting to think \"no flame, so the temperature can't change\" — but the energy was never in a flame. It sits locked in the attractions between particles, and dissolving simply rearranges who is holding whom."))), /* @__PURE__ */ e.createElement("div", {
		className: "slide-right",
		style: V.right
	}, /* @__PURE__ */ e.createElement("div", { style: V.panelTitle }, "Mix & measure"), /* @__PURE__ */ e.createElement("div", { style: V.soluteRow }, Object.keys(it).map((t) => {
		let i = it[t], a = n === t;
		return i.img ? /* @__PURE__ */ e.createElement("button", {
			key: t,
			onClick: () => r(t),
			style: {
				...V.imgBtn,
				borderColor: a ? "var(--primary)" : "var(--border)",
				boxShadow: a ? "0 0 0 2px var(--primary-soft)" : "none"
			}
		}, /* @__PURE__ */ e.createElement("img", {
			src: i.img,
			alt: i.short,
			style: V.imgBtnImg
		}), /* @__PURE__ */ e.createElement("span", { style: V.imgBtnLabel }, i.short)) : /* @__PURE__ */ e.createElement("button", {
			key: t,
			onClick: () => r(t),
			style: {
				...V.textBtn,
				...a ? V.textBtnOn : {}
			}
		}, i.short);
	})), /* @__PURE__ */ e.createElement("canvas", {
		ref: c,
		style: V.canvas
	}), /* @__PURE__ */ e.createElement("div", { style: V.stepHint }, "Beaker of water + ", /* @__PURE__ */ e.createElement("b", null, o.short), ".\xA0", i === "ready" && "Step 1 — stir the solid in.", i === "mixed" && "Step 2 — read the thermometer.", i === "measured" && "Result — now let us interpret it ↓"), /* @__PURE__ */ e.createElement("div", { style: V.controlsRow }, /* @__PURE__ */ e.createElement("div", { style: V.controlHalf }, /* @__PURE__ */ e.createElement("button", {
		onClick: () => {
			i === "ready" && a("mixed");
		},
		disabled: i !== "ready",
		style: {
			...V.miniBtn,
			...i === "ready" ? {} : V.miniBtnDone
		}
	}, "🥄 Stir")), /* @__PURE__ */ e.createElement("div", { style: V.controlHalf }, /* @__PURE__ */ e.createElement("button", {
		onClick: () => {
			i === "mixed" && a("measured");
		},
		disabled: i !== "mixed",
		style: {
			...V.miniBtn,
			...i === "measured" ? V.miniBtnDone : i === "mixed" ? {} : V.miniBtnOff
		}
	}, "🌡️ Measure temp"))), i === "measured" && /* @__PURE__ */ e.createElement("div", { style: V.resultBox }, /* @__PURE__ */ e.createElement(ct, {
		label: "Energy spent pulling apart",
		frac: o.cost / 100,
		color: "#d64545"
	}), /* @__PURE__ */ e.createElement(ct, {
		label: "Energy given back in the snap",
		frac: o.release / 100,
		color: "#3aa657"
	}), /* @__PURE__ */ e.createElement("div", { style: {
		...V.verdict,
		background: s ? "var(--accent-soft)" : "var(--primary-softer)",
		color: s ? "var(--accent-text)" : "var(--primary)"
	} }, s ? "Solution: the snap gives back more than the two pulls cost — the leftover energy shows up as warmth, so the beaker WARMS UP. 🔥" : "Solution: the two pulls cost more than the snap gives back — the mix draws heat from your hand to cover the gap, so the beaker turns COLD. ❄️"), /* @__PURE__ */ e.createElement("button", {
		onClick: () => a("ready"),
		style: V.resetBtn
	}, "↺ pour fresh water & try again"))));
}
function ct({ label: t, frac: n, color: r }) {
	return /* @__PURE__ */ e.createElement("div", { style: V.barWrap }, /* @__PURE__ */ e.createElement("div", { style: V.barLabel }, t), /* @__PURE__ */ e.createElement("div", { style: V.barTrack }, /* @__PURE__ */ e.createElement("div", { style: {
		...V.barFill,
		width: `${Math.min(100, n * 100)}%`,
		background: r
	} })));
}
function lt(e, t, n, r, i, a) {
	if (i <= 0) return;
	let o = Math.min(a, r / 2, i / 2);
	e.beginPath(), e.moveTo(t + o, n), e.arcTo(t + r, n, t + r, n + i, o), e.arcTo(t + r, n + i, t, n + i, o), e.arcTo(t, n + i, t, n, o), e.arcTo(t, n, t + r, n, o), e.closePath();
}
var ut = {
	position: "relative",
	border: "1px solid var(--border-light)",
	borderRadius: 10,
	padding: "14px 34px 14px 18px"
}, V = {
	title: {
		fontSize: 21,
		fontWeight: 700,
		color: "var(--text-primary)"
	},
	left: {
		display: "flex",
		flexDirection: "column",
		gap: 14,
		minWidth: 0
	},
	right: {
		display: "flex",
		flexDirection: "column",
		gap: 12,
		minWidth: 0
	},
	emojiCorner: {
		position: "absolute",
		top: 10,
		right: 12,
		fontSize: 16,
		lineHeight: 1
	},
	cardHook: {
		...ut,
		background: "var(--hook-soft)",
		borderLeft: "2px solid var(--hook)"
	},
	cardInsight: {
		...ut,
		background: "var(--primary-softer)",
		borderColor: "var(--primary-soft)",
		borderLeft: "2px solid var(--primary)"
	},
	cardPitfall: {
		...ut,
		background: "var(--accent-soft)",
		borderLeft: "2px solid var(--accent)"
	},
	cardSurprise: {
		...ut,
		background: "var(--surprise-soft)",
		borderLeft: "2px solid var(--surprise)"
	},
	hookText: {
		fontSize: 15,
		lineHeight: 1.65,
		color: "var(--text-primary)",
		fontStyle: "italic",
		margin: 0
	},
	body: {
		fontSize: 14.5,
		lineHeight: 1.6,
		color: "var(--text-primary)",
		margin: 0
	},
	plainBlock: { padding: "0 2px" },
	plainHeading: {
		fontSize: 14.5,
		fontWeight: 700,
		color: "var(--primary)",
		marginBottom: 10
	},
	steps: {
		display: "flex",
		flexDirection: "column",
		gap: 10
	},
	step: {
		display: "flex",
		alignItems: "flex-start",
		gap: 10,
		fontSize: 14.5,
		lineHeight: 1.55,
		color: "var(--text-primary)"
	},
	stepNum: {
		display: "inline-flex",
		alignItems: "center",
		justifyContent: "center",
		width: 22,
		height: 22,
		borderRadius: "50%",
		background: "var(--accent-soft)",
		color: "var(--accent-text)",
		fontWeight: 700,
		fontSize: 13,
		flexShrink: 0
	},
	stepNumRel: {
		display: "inline-flex",
		alignItems: "center",
		justifyContent: "center",
		width: 22,
		height: 22,
		borderRadius: "50%",
		background: "var(--primary-softer)",
		color: "var(--primary)",
		fontWeight: 700,
		fontSize: 13,
		flexShrink: 0
	},
	panelTitle: {
		fontSize: 16,
		fontWeight: 700,
		color: "var(--text-primary)"
	},
	soluteRow: {
		display: "flex",
		gap: 8,
		alignItems: "stretch"
	},
	imgBtn: {
		flex: 1,
		minWidth: 0,
		position: "relative",
		height: 70,
		padding: 0,
		borderRadius: 8,
		border: "2px solid var(--border)",
		overflow: "hidden",
		cursor: "pointer",
		background: "var(--surface)"
	},
	imgBtnImg: {
		width: "100%",
		height: "100%",
		objectFit: "cover",
		display: "block"
	},
	imgBtnLabel: {
		position: "absolute",
		left: 0,
		right: 0,
		top: 0,
		padding: "4px",
		fontSize: 11.5,
		fontWeight: 700,
		color: "#fff",
		background: "transparent",
		textAlign: "center",
		fontFamily: "inherit",
		textShadow: "0 1px 3px rgba(0,0,0,0.95), 0 0 2px rgba(0,0,0,0.9)"
	},
	textBtn: {
		flex: 1,
		minWidth: 0,
		height: 70,
		padding: "6px",
		fontSize: 12.5,
		fontWeight: 700,
		fontFamily: "inherit",
		cursor: "pointer",
		borderRadius: 8,
		border: "2px solid var(--border)",
		background: "var(--surface)",
		color: "var(--text-secondary)"
	},
	textBtnOn: {
		background: "var(--primary-softer)",
		borderColor: "var(--primary)",
		color: "var(--primary)",
		boxShadow: "0 0 0 2px var(--primary-soft)"
	},
	canvas: {
		width: "100%",
		aspectRatio: "4 / 3",
		maxHeight: "34vh",
		display: "block",
		borderRadius: 10,
		background: "var(--surface)",
		border: "1px solid var(--border-light)",
		boxSizing: "border-box"
	},
	stepHint: {
		fontSize: 13,
		color: "var(--text-secondary)",
		lineHeight: 1.5,
		textAlign: "center"
	},
	controlsRow: {
		display: "flex",
		gap: 8
	},
	controlHalf: {
		flex: 1,
		display: "flex",
		justifyContent: "center"
	},
	miniBtn: {
		padding: "8px 16px",
		fontSize: 13,
		fontWeight: 700,
		fontFamily: "inherit",
		cursor: "pointer",
		borderRadius: 999,
		border: "none",
		background: "var(--hook)",
		color: "#fff",
		boxShadow: "0 1px 3px rgba(0,0,0,0.12)"
	},
	miniBtnOff: {
		background: "var(--surface)",
		color: "var(--text-muted)",
		border: "1px solid var(--border-light)",
		cursor: "not-allowed"
	},
	miniBtnDone: {
		background: "var(--primary-softer)",
		color: "var(--primary)",
		border: "1px solid var(--primary-soft)",
		cursor: "default"
	},
	resultBox: {
		display: "flex",
		flexDirection: "column",
		gap: 12,
		background: "var(--surface)",
		border: "1px solid var(--border-light)",
		borderRadius: 10,
		padding: 14
	},
	barWrap: {
		display: "flex",
		flexDirection: "column",
		gap: 5
	},
	barLabel: {
		fontSize: 12.5,
		fontWeight: 700,
		color: "var(--text-secondary)"
	},
	barTrack: {
		height: 16,
		borderRadius: 8,
		background: "var(--surface-raised)",
		border: "1px solid var(--border-light)",
		overflow: "hidden"
	},
	barFill: {
		height: "100%",
		borderRadius: 8,
		transition: "width 0.6s ease"
	},
	verdict: {
		fontSize: 14,
		fontWeight: 700,
		textAlign: "center",
		padding: "10px 12px",
		borderRadius: 8,
		lineHeight: 1.5
	},
	resetBtn: {
		alignSelf: "center",
		padding: "7px 14px",
		fontSize: 12.5,
		fontWeight: 700,
		fontFamily: "inherit",
		cursor: "pointer",
		borderRadius: 8,
		border: "1px solid var(--border)",
		background: "var(--surface-raised)",
		color: "var(--text-secondary)"
	}
};
//#endregion
//#region ../tmp/nadi-slides-fd6e4518-99e0-414a-a92e-35da921944c5/Slide_t4-1.jsx
function dt({ studentName: t }) {
	let [n, r] = w(120), i = (e) => 10 ** (-1 + e / 1e3 * 5), a = (e) => e < 1 ? "solution" : e <= 1e3 ? "colloid" : "suspension", o = i(n), s = a(o), c = o < 1 ? o.toFixed(2) + " nm" : o < 1e3 ? Math.round(o) + " nm" : Math.round(o) + " nm (" + (o / 1e3).toFixed(1) + " µm)", l = {
		solution: {
			name: "SOLUTION",
			tag: "the \"invisible\" level",
			looks: "Clear — uniform right down to the molecule",
			settles: "Never settles — too small for gravity to win",
			filter: "Slips straight through a filter",
			tyndall: "No beam — light passes clean through",
			col: "var(--primary)"
		},
		colloid: {
			name: "COLLOID",
			tag: "the \"trickster\" level",
			looks: "Looks uniform to the eye (faintly cloudy)",
			settles: "Stays up — kinetic stability holds it suspended",
			filter: "Still slips through a filter",
			tyndall: "Beam GLOWS — that is the Tyndall effect",
			col: "var(--hook-text)"
		},
		suspension: {
			name: "SUSPENSION",
			tag: "the \"giant\" level",
			looks: "Visibly jumbled — you can see the parts",
			settles: "Sinks to the bottom on standing",
			filter: "Caught by a simple filter",
			tyndall: "Scatters and blocks the beam",
			col: "var(--accent-text)"
		}
	}[s];
	return /* @__PURE__ */ e.createElement(e.Fragment, null, /* @__PURE__ */ e.createElement("div", {
		className: "slide-title",
		style: H.title
	}, "The Particle Ruler: One Scale to Rule Them All"), /* @__PURE__ */ e.createElement("div", {
		className: "slide-left",
		style: H.left
	}, /* @__PURE__ */ e.createElement("div", { style: H.cardHook }, /* @__PURE__ */ e.createElement("span", { style: H.cornerEmoji }, "💭"), /* @__PURE__ */ e.createElement("p", { style: H.hookText }, t, ", a reassuring truth first: this topic has its own vocabulary — solution, colloid, suspension — and picking it up is a bit like learning a new language. Take it one word at a time and you'll be fluent. Start with what you can SEE: salt water, milk and fog all look perfectly uniform — yet milk glows in a torch beam and fog scatters headlights. Same eye, different behaviour. Let's find the one idea that explains it.")), /* @__PURE__ */ e.createElement("div", { style: H.plain }, /* @__PURE__ */ e.createElement("p", { style: H.body }, "Here's the key move. ", /* @__PURE__ */ e.createElement("b", null, "Macroscopically"), " these mixtures look different, but the \"not-uniform\" world isn't three separate boxes — it's ", /* @__PURE__ */ e.createElement("b", null, "one continuous ruler"), ". ", /* @__PURE__ */ e.createElement("b", null, "Microscopically"), ", only ONE thing changes along it: how big the dispersed particles are. Master that single variable and everything else follows."), /* @__PURE__ */ e.createElement("div", { style: H.scale }, /* @__PURE__ */ e.createElement("div", { style: {
		...H.scaleSeg,
		background: "var(--primary-soft)"
	} }, /* @__PURE__ */ e.createElement("b", null, "Solution"), /* @__PURE__ */ e.createElement("span", null, "< 1 nm")), /* @__PURE__ */ e.createElement("div", { style: {
		...H.scaleSeg,
		background: "var(--hook-soft)"
	} }, /* @__PURE__ */ e.createElement("b", null, "Colloid"), /* @__PURE__ */ e.createElement("span", null, "1–1000 nm")), /* @__PURE__ */ e.createElement("div", { style: {
		...H.scaleSeg,
		background: "var(--accent-soft)"
	} }, /* @__PURE__ */ e.createElement("b", null, "Suspension"), /* @__PURE__ */ e.createElement("span", null, "> 1000 nm")))), /* @__PURE__ */ e.createElement("div", { style: H.plain }, /* @__PURE__ */ e.createElement("p", { style: {
		...H.body,
		marginBottom: 10
	} }, "Reason like a scientist: ", /* @__PURE__ */ e.createElement("b", null, "fix the particle size, and every behaviour below is forced"), ". Read each column top to bottom — one cause (size), three different results."), /* @__PURE__ */ e.createElement("div", { style: H.tableWrap }, /* @__PURE__ */ e.createElement("table", { style: H.table }, /* @__PURE__ */ e.createElement("thead", null, /* @__PURE__ */ e.createElement("tr", null, /* @__PURE__ */ e.createElement("th", { style: H.th }), /* @__PURE__ */ e.createElement("th", { style: H.th }, "Solution"), /* @__PURE__ */ e.createElement("th", { style: H.th }, "Colloid"), /* @__PURE__ */ e.createElement("th", { style: H.th }, "Susp."))), /* @__PURE__ */ e.createElement("tbody", null, /* @__PURE__ */ e.createElement("tr", null, /* @__PURE__ */ e.createElement("td", { style: H.tdL }, "Settles?"), /* @__PURE__ */ e.createElement("td", { style: H.td }, "no"), /* @__PURE__ */ e.createElement("td", { style: H.td }, "no"), /* @__PURE__ */ e.createElement("td", { style: H.td }, "yes")), /* @__PURE__ */ e.createElement("tr", null, /* @__PURE__ */ e.createElement("td", { style: H.tdL }, "Filterable?"), /* @__PURE__ */ e.createElement("td", { style: H.td }, "no"), /* @__PURE__ */ e.createElement("td", { style: H.td }, "no"), /* @__PURE__ */ e.createElement("td", { style: H.td }, "yes")), /* @__PURE__ */ e.createElement("tr", null, /* @__PURE__ */ e.createElement("td", { style: H.tdL }, "Tyndall?"), /* @__PURE__ */ e.createElement("td", { style: H.td }, "no"), /* @__PURE__ */ e.createElement("td", { style: H.td }, "yes"), /* @__PURE__ */ e.createElement("td", { style: H.td }, "yes")))))), /* @__PURE__ */ e.createElement("div", { style: H.cardInsight }, /* @__PURE__ */ e.createElement("span", { style: H.cornerEmoji }, "💡"), /* @__PURE__ */ e.createElement("p", { style: H.body }, "Let's pin down the precise definition: a ", /* @__PURE__ */ e.createElement("b", null, "colloid"), " is a dispersion of particles of one substance — the ", /* @__PURE__ */ e.createElement("i", null, "dispersed phase"), " — spread throughout a ", /* @__PURE__ */ e.createElement("i", null, "dispersing medium"), " made of another substance."), /* @__PURE__ */ e.createElement("p", { style: {
		...H.body,
		marginTop: 10
	} }, "That's why it's the trickster of the trio. ", /* @__PURE__ */ e.createElement("b", null, "Macroscopically"), " it looks homogeneous to your eye, yet ", /* @__PURE__ */ e.createElement("b", null, "microscopically"), " it behaves heterogeneously the moment you test it. It sits neatly between Topic 1's two boxes — that \"in-between\" feeling is exactly the point, so don't let it unsettle you.")), /* @__PURE__ */ e.createElement("div", { style: H.plain }, /* @__PURE__ */ e.createElement("p", { style: H.body }, "Here's the payoff, step by step. Bigger particle → each component ", /* @__PURE__ */ e.createElement("b", null, "keeps and shows its own identity"), " more openly → that visible identity becomes a physical ", /* @__PURE__ */ e.createElement("i", null, "handle"), ". A suspension's big particles are caught by a simple filter; a solution's molecules need molecular handles like boiling point or solubility. Size is the master key telling you which separation method to reach for next.")), /* @__PURE__ */ e.createElement("div", { style: H.cardPitfall }, /* @__PURE__ */ e.createElement("span", { style: H.cornerEmoji }, "⚠️"), /* @__PURE__ */ e.createElement("p", { style: H.body }, "A trap worth flagging gently: ", /* @__PURE__ */ e.createElement("b", null, "\"looks clear\" does NOT mean \"solution\""), ". A colloid can look just as clear. Never judge by appearance alone — run a test (laser, filter, or time) and let the evidence decide."))), /* @__PURE__ */ e.createElement("div", {
		className: "slide-right",
		style: H.right
	}, /* @__PURE__ */ e.createElement("div", { style: H.panelTitle }, "Slide along the ruler"), /* @__PURE__ */ e.createElement("div", { style: H.sliderLabel }, /* @__PURE__ */ e.createElement("span", null, "Particle size"), /* @__PURE__ */ e.createElement("span", { style: H.sizeChip }, c)), /* @__PURE__ */ e.createElement("input", {
		type: "range",
		min: 0,
		max: 1e3,
		value: n,
		onChange: (e) => r(Number(e.target.value)),
		style: H.slider
	}), /* @__PURE__ */ e.createElement("div", { style: H.ticks }, /* @__PURE__ */ e.createElement("span", null, "0.1 nm"), /* @__PURE__ */ e.createElement("span", null, "1 nm"), /* @__PURE__ */ e.createElement("span", null, "1000 nm"), /* @__PURE__ */ e.createElement("span", null, "10 µm")), /* @__PURE__ */ e.createElement("div", { style: {
		...H.readout,
		outline: "2px solid " + l.col,
		outlineOffset: -2
	} }, /* @__PURE__ */ e.createElement("div", { style: {
		...H.catName,
		color: l.col
	} }, l.name, " ", /* @__PURE__ */ e.createElement("span", { style: H.catTag }, "· ", l.tag)), /* @__PURE__ */ e.createElement("div", { style: H.descGrid }, /* @__PURE__ */ e.createElement("div", { style: H.descRow }, /* @__PURE__ */ e.createElement("span", { style: H.descK }, "Looks"), /* @__PURE__ */ e.createElement("span", { style: H.descV }, l.looks)), /* @__PURE__ */ e.createElement("div", { style: H.descRow }, /* @__PURE__ */ e.createElement("span", { style: H.descK }, "Gravity"), /* @__PURE__ */ e.createElement("span", { style: H.descV }, l.settles)), /* @__PURE__ */ e.createElement("div", { style: H.descRow }, /* @__PURE__ */ e.createElement("span", { style: H.descK }, "Filter"), /* @__PURE__ */ e.createElement("span", { style: H.descV }, l.filter)), /* @__PURE__ */ e.createElement("div", { style: H.descRow }, /* @__PURE__ */ e.createElement("span", { style: H.descK }, "Laser"), /* @__PURE__ */ e.createElement("span", { style: H.descV }, l.tyndall)))), /* @__PURE__ */ e.createElement("p", { style: H.hint }, "Let's reason it out, step by step: drag the ruler across the spectrum and watch the verdict shift. Notice how size alone decides every behaviour — settling, filtering and the Tyndall beam all follow from this one number.")));
}
var ft = {
	background: "var(--surface-raised)",
	border: "1px solid var(--border-light)",
	borderRadius: 10,
	padding: "14px 18px",
	boxSizing: "border-box",
	position: "relative"
}, H = {
	title: {
		fontSize: 22,
		fontWeight: 700,
		color: "var(--text-primary)"
	},
	left: {
		display: "flex",
		flexDirection: "column",
		gap: 14,
		minWidth: 0
	},
	right: {
		display: "flex",
		flexDirection: "column",
		gap: 12,
		minWidth: 0
	},
	plain: {
		padding: "0 2px",
		minWidth: 0
	},
	cornerEmoji: {
		position: "absolute",
		top: 10,
		right: 12,
		fontSize: 16,
		lineHeight: 1
	},
	cardHook: {
		...ft,
		background: "var(--hook-soft)",
		borderLeft: "2px solid var(--hook)"
	},
	cardInsight: {
		...ft,
		background: "var(--primary-softer)",
		borderColor: "var(--primary-soft)",
		borderLeft: "2px solid var(--primary)"
	},
	cardPitfall: {
		...ft,
		background: "var(--accent-soft)",
		borderLeft: "2px solid var(--accent)"
	},
	hookText: {
		fontSize: 15,
		lineHeight: 1.65,
		color: "var(--text-primary)",
		fontStyle: "italic",
		margin: 0,
		paddingRight: 18
	},
	body: {
		fontSize: 15,
		lineHeight: 1.6,
		color: "var(--text-primary)",
		margin: 0,
		paddingRight: 18
	},
	scale: {
		display: "flex",
		gap: 6,
		marginTop: 12
	},
	scaleSeg: {
		flex: 1,
		minWidth: 0,
		borderRadius: 8,
		padding: "8px 6px",
		display: "flex",
		flexDirection: "column",
		alignItems: "center",
		gap: 2,
		fontSize: 12.5,
		color: "var(--text-primary)",
		textAlign: "center"
	},
	tableWrap: {
		width: "100%",
		overflow: "hidden"
	},
	table: {
		width: "100%",
		borderCollapse: "collapse",
		fontSize: 13
	},
	th: {
		textAlign: "center",
		fontWeight: 700,
		color: "var(--text-secondary)",
		padding: "4px 4px",
		borderBottom: "1px solid var(--border-light)"
	},
	td: {
		textAlign: "center",
		color: "var(--text-primary)",
		padding: "6px 4px",
		borderBottom: "1px solid var(--border-light)"
	},
	tdL: {
		textAlign: "left",
		color: "var(--text-secondary)",
		fontWeight: 600,
		padding: "6px 4px",
		borderBottom: "1px solid var(--border-light)"
	},
	panelTitle: {
		fontSize: 16,
		fontWeight: 700,
		color: "var(--text-primary)"
	},
	readout: {
		background: "var(--surface)",
		border: "1px solid var(--border-light)",
		borderRadius: 10,
		padding: "12px 14px",
		boxSizing: "border-box",
		transition: "outline-color 0.2s"
	},
	catName: {
		fontSize: 17,
		fontWeight: 800,
		letterSpacing: .4
	},
	catTag: {
		fontSize: 12.5,
		fontWeight: 500,
		color: "var(--text-muted)",
		letterSpacing: 0
	},
	descGrid: {
		display: "grid",
		gridTemplateColumns: "1fr 1fr",
		gap: "6px 14px",
		marginTop: 10
	},
	descRow: {
		display: "flex",
		flexDirection: "column",
		gap: 2,
		minWidth: 0,
		fontSize: 12.5
	},
	descK: {
		fontWeight: 700,
		color: "var(--text-secondary)",
		flexShrink: 0
	},
	descV: {
		color: "var(--text-primary)",
		minWidth: 0
	},
	sliderLabel: {
		display: "flex",
		justifyContent: "space-between",
		alignItems: "center",
		fontSize: 13,
		fontWeight: 600,
		color: "var(--text-secondary)"
	},
	sizeChip: {
		fontFamily: "monospace",
		fontWeight: 700,
		fontSize: 14,
		color: "var(--primary)",
		background: "var(--primary-softer)",
		borderRadius: 6,
		padding: "2px 8px"
	},
	slider: {
		width: "100%",
		accentColor: "var(--primary)"
	},
	ticks: {
		display: "flex",
		justifyContent: "space-between",
		fontSize: 11,
		color: "var(--text-muted)",
		marginTop: -4
	},
	hint: {
		fontSize: 12.5,
		color: "var(--text-muted)",
		textAlign: "center",
		margin: 0,
		lineHeight: 1.5
	}
}, pt = {
	solution: {
		name: "Salt water",
		tag: "Solution · <1 nm",
		liquid: "rgba(135,190,248,0.42)",
		dot: null,
		sediment: null,
		settles: !1
	},
	colloid: {
		name: "Milk",
		tag: "Colloid · 1–1000 nm",
		liquid: "rgba(247,246,242,0.94)",
		dot: "rgba(255,255,255,0.95)",
		sediment: null,
		settles: !1
	},
	suspension: {
		name: "Chalk water",
		tag: "Suspension · >1000 nm",
		liquid: "rgba(168,140,98,0.42)",
		dot: "rgba(248,250,253,0.98)",
		sediment: "rgba(236,241,247,0.96)",
		settles: !0
	}
}, mt = [
	"solution",
	"colloid",
	"suspension"
], ht = [{
	key: "settles",
	label: "Forms a sediment layer"
}, {
	key: "stays",
	label: "Stays uniformly mixed"
}];
function gt(e) {
	let t = [];
	if (e === "suspension") {
		for (let e = 0; e < 64; e++) t.push({
			sx: (Math.random() * 2 - 1) * .82,
			sy: Math.random() * .92,
			r: 1.5 + Math.random() * 1.9
		});
		t.sort((e, t) => t.sy - e.sy);
		let e = 1e-4;
		t.forEach((t, n) => {
			t.rest = Math.max(t.sy, 1 - n / 63 * .34), t.fall = t.rest - t.sy, t.fall > e && (e = t.fall);
		}), t.forEach((t) => {
			t.v = e;
		});
	} else if (e === "colloid") for (let e = 0; e < 150; e++) t.push({
		nx: (Math.random() * 2 - 1) * .9,
		ny: Math.random(),
		r: .8 + Math.random() * 1,
		ph: Math.random() * Math.PI * 2
	});
	return t;
}
function _t(e, t, n, r, i) {
	let a = i * .16;
	e.lineJoin = "round", e.lineWidth = 2.4, e.strokeStyle = "rgba(200,216,232,0.85)", e.beginPath(), e.moveTo(t - i - 4, n - 4), e.lineTo(t - i, n + 4), e.lineTo(t - i, r - a), e.quadraticCurveTo(t - i, r, t - i + a, r), e.lineTo(t + i - a, r), e.quadraticCurveTo(t + i, r, t + i, r - a), e.lineTo(t + i, n + 4), e.lineTo(t + i + 4, n - 4), e.stroke(), e.strokeStyle = "rgba(185,200,214,0.50)", e.lineWidth = 1;
	for (let a = 1; a <= 4; a++) {
		let o = n + (r - n) * (a / 5.5);
		e.beginPath(), e.moveTo(t + i - i * .3, o), e.lineTo(t + i - 5, o), e.stroke();
	}
	e.strokeStyle = "rgba(255,255,255,0.16)", e.lineWidth = 4, e.beginPath(), e.moveTo(t - i * .55, n + 14), e.lineTo(t - i * .55, r - 14), e.stroke();
}
function vt(e, t, n, r, i, a) {
	let o = a ? n : n - i;
	e.fillStyle = "#8a6238", e.fillRect(t - r, o, r * 2, i), e.beginPath(), e.ellipse(t, a ? n + i : n - i, r, 7, 0, 0, Math.PI * 2), e.fillStyle = "#c79a5e", e.fill(), e.beginPath(), e.ellipse(t, a ? n + i : n - i, r, 7, 0, 0, Math.PI * 2), e.strokeStyle = "rgba(90,64,36,0.8)", e.lineWidth = 1.5, e.stroke(), e.beginPath(), e.ellipse(t - r * .25, (a ? n + i : n - i) - 1, r * .5, 7 * .45, 0, 0, Math.PI * 2), e.fillStyle = "rgba(255,240,210,0.35)", e.fill();
}
function yt(e, t, n, r, i, a) {
	performance.now() / 1e3;
	let o = (n + r) / 2, s = o - n, c = i * .78;
	function l() {
		e.beginPath(), e.moveTo(t - c, n), e.quadraticCurveTo(t - i * 1.05, n + s * .52, t - 5, o), e.quadraticCurveTo(t - i * 1.05, r - s * .52, t - c, r), e.lineTo(t + c, r), e.quadraticCurveTo(t + i * 1.05, r - s * .52, t + 5, o), e.quadraticCurveTo(t + i * 1.05, n + s * .52, t + c, n), e.closePath();
	}
	if (l(), e.fillStyle = "rgba(176,208,234,0.16)", e.fill(), e.save(), l(), e.clip(), a < .999) {
		let r = n + s * a ** .85, c = a > .001 && a < .999 ? 11 : 0;
		e.fillStyle = "#e3bc63", e.beginPath(), e.moveTo(t - i * 1.1, r), e.quadraticCurveTo(t, r + c, t + i * 1.1, r), e.lineTo(t + i * 1.1, o + 2), e.lineTo(t - i * 1.1, o + 2), e.closePath(), e.fill(), e.fillStyle = "rgba(150,108,40,0.30)", e.beginPath(), e.moveTo(t - i * .55, o - s * .32), e.lineTo(t + i * .55, o - s * .32), e.lineTo(t + 5 + 3, o + 2), e.lineTo(t - 5 - 3, o + 2), e.closePath(), e.fill();
	}
	if (a > .001) {
		let n = r - s * a ** .72;
		e.fillStyle = "#e3bc63", e.beginPath(), e.moveTo(t - i * 1.1, r), e.lineTo(t + i * 1.1, r), e.lineTo(t + i * 1.1, n + 8), e.quadraticCurveTo(t, n - 16, t - i * 1.1, n + 8), e.closePath(), e.fill(), e.fillStyle = "rgba(255,238,190,0.45)", e.beginPath(), e.ellipse(t, n - 2, i * .42, 6, 0, 0, Math.PI * 2), e.fill();
	}
	if (a > .001 && a < .999) {
		let n = r - s * a ** .72;
		e.fillStyle = "#e3bc63", e.fillRect(t - 1.6, o, 3.2, n - o), e.fillStyle = "#f0d488", e.fillRect(t - .6, o, 1.2, n - o);
	}
	e.restore(), e.save(), l(), e.clip(), e.fillStyle = "rgba(255,255,255,0.14)", e.beginPath(), e.ellipse(t - i * .45, n + s * .5, i * .18, s * .42, 0, 0, Math.PI * 2), e.fill(), e.beginPath(), e.ellipse(t - i * .45, r - s * .5, i * .18, s * .42, 0, 0, Math.PI * 2), e.fill(), e.restore(), l(), e.strokeStyle = "rgba(214,230,244,0.92)", e.lineWidth = 3, e.lineJoin = "round", e.stroke(), vt(e, t, n + 2, i + 12, 12, !1), vt(e, t, r - 2, i + 12, 12, !0);
}
function bt({ studentName: t }) {
	let n = C(null), r = C("suspension"), i = C(!1), a = C(0), o = C(4.2), s = C(gt("suspension")), c = C(0), l = C(-1), [u, d] = w("suspension"), [f, p] = w(null), [m, h] = w(!1), [g, _] = w(0), [v, y] = w(() => /* @__PURE__ */ new Set());
	function x(e) {
		r.current = e, s.current = gt(e), a.current = 0, i.current = !1, l.current = -1, d(e), p(null), h(!1), _(0);
	}
	function S(e) {
		m || (p(e), a.current = 0, l.current = -1, i.current = !0, h(!0));
	}
	b(() => {
		let e = n.current;
		if (!e) return;
		let t = e.getContext("2d"), u = performance.now();
		function d() {
			let n = e.getBoundingClientRect(), r = window.devicePixelRatio || 1;
			e.width = n.width * r, e.height = n.height * r, t.setTransform(r, 0, 0, r, 0, 0);
		}
		d();
		let f = new ResizeObserver(d);
		f.observe(e);
		function p() {
			let n = e.clientWidth, i = e.clientHeight, o = pt[r.current], c = a.current;
			t.clearRect(0, 0, n, i), t.fillStyle = "#0e1117", t.fillRect(0, 0, n, i);
			let l = n * .31, u = i * .12, d = i * .9, f = Math.min(n * .17, 92), p = i * .24, m = (d - p) * .3;
			d - (o.settles ? m * c : 0);
			let h = o.settles ? Math.max(.04, .34 * (1 - c)) : null;
			if (t.fillStyle = o.settles ? `rgba(236,242,249,${h})` : o.liquid, t.fillRect(l - f + 3, p, (f - 3) * 2, d - p - 3), o.dot) if (o.settles) {
				let e = p, n = d - 3, r = n - e, i = s.current, a = 0;
				for (let e of i) Math.min(e.rest, e.sy + e.v * c) >= e.rest - 1e-4 && a++;
				let u = e + (1 - .34 * (a / i.length)) * r;
				a > 0 && (t.fillStyle = o.sediment, t.fillRect(l - f + 3, u, (f - 3) * 2, n - u)), t.fillStyle = o.dot;
				for (let n of i) {
					let i = e + Math.min(n.rest, n.sy + n.v * c) * r, a = l + n.sx * (f - 8);
					t.beginPath(), t.arc(a, i, n.r, 0, Math.PI * 2), t.fill();
				}
			} else {
				t.fillStyle = o.dot;
				let e = performance.now() / 1e3;
				for (let n of s.current) {
					let r = Math.sin(e * 2.1 + n.ph) * 2.2, i = Math.cos(e * 1.7 + n.ph) * 2.2, a = l + n.nx * (f - 8) + r, o = p + 6 + n.ny * (d - p - 12) + i;
					t.beginPath(), t.arc(a, o, n.r, 0, Math.PI * 2), t.fill();
				}
			}
			t.strokeStyle = "rgba(255,255,255,0.30)", t.lineWidth = 1.5, t.beginPath(), t.ellipse(l, p, f - 4, 5, 0, 0, Math.PI * 2), t.stroke(), _t(t, l, u, d, f), t.fillStyle = "rgba(220,230,240,0.85)", t.font = "600 12px Outfit, sans-serif", t.textAlign = "center", t.fillText(o.name, l, i * .075);
			let g = n * .74;
			yt(t, g, i * .18, i * .84, Math.min(n * .12, 60), c), t.fillStyle = "rgba(220,230,240,0.85)", t.font = "700 13px Outfit, sans-serif", t.textAlign = "center", t.fillText(Math.round(c * 24) + " h", g, i * .95);
		}
		function m(e) {
			let t = Math.min(.05, (e - u) / 1e3);
			if (u = e, i.current) {
				a.current += t / o.current;
				let e = Math.round(a.current * 24);
				if (e !== l.current && (l.current = e, _(Math.min(24, e))), a.current >= 1) {
					a.current = 1, i.current = !1, h(!1), _(24);
					let e = r.current;
					y((t) => {
						let n = new Set(t);
						return n.add(e), n;
					});
				}
			}
			p(), c.current = requestAnimationFrame(m);
		}
		return c.current = requestAnimationFrame(m), () => {
			cancelAnimationFrame(c.current), f.disconnect();
		};
	}, []);
	let ee = pt[u], te = ee.settles ? "settles" : "stays", ne = v.has(u) && !m, re = f === te, ie = {
		solution: "Even after 24 hours the liquid stays perfectly clear. Particles smaller than 1 nm are far too light for gravity to overcome the constant push of surrounding water molecules, so nothing ever settles.",
		colloid: "Milk stays uniformly white — no layer forms. At 1–1000 nm the particles are still light enough that endless molecular bombardment (Brownian motion) keeps them suspended. That is kinetic stability, not zero size.",
		suspension: "A clear band of liquid grows on top while chalk stacks up as sediment below, layer by layer at equal intervals. Above 1000 nm the particles are heavy enough that gravity finally wins over the molecular jostling, so they settle out."
	}, ae = (e) => v.has(e);
	return /* @__PURE__ */ e.createElement(e.Fragment, null, /* @__PURE__ */ e.createElement("div", {
		className: "slide-title",
		style: U.title
	}, "Why Size Decides Everything: The Triple Threat"), /* @__PURE__ */ e.createElement("div", {
		className: "slide-left",
		style: U.left
	}, /* @__PURE__ */ e.createElement("div", { style: U.cardHook }, /* @__PURE__ */ e.createElement("span", { style: U.corner }, "💭"), /* @__PURE__ */ e.createElement("p", { style: U.hookText }, t, ", leave three jars on a shelf for a day — salt water, milk, chalk water. One grows a layer at the bottom; two look untouched. Same jar, same shelf, same 24 hours. What is quietly deciding the outcome?")), /* @__PURE__ */ e.createElement("div", { style: U.plain }, /* @__PURE__ */ e.createElement("p", { style: U.body }, "Start with what your eyes report (the ", /* @__PURE__ */ e.createElement("b", null, "macroscopic"), " observation), then reason down to what the particles are doing (the ", /* @__PURE__ */ e.createElement("b", null, "microscopic"), " cause). Settling is a tug-of-war: gravity pulling particles down versus the restless molecules of the liquid knocking them back up.")), /* @__PURE__ */ e.createElement("div", { style: U.cardInsight }, /* @__PURE__ */ e.createElement("span", { style: U.corner }, "💡"), /* @__PURE__ */ e.createElement("p", { style: U.body }, "One variable sets the winner — ", /* @__PURE__ */ e.createElement("b", null, "particle size"), ". Below ~1000 nm, molecular jostling keeps particles afloat indefinitely. Above it, particles are heavy enough that gravity drags them into a sediment.")), /* @__PURE__ */ e.createElement("div", { style: U.cardPitfall }, /* @__PURE__ */ e.createElement("span", { style: U.corner }, "⚠️"), /* @__PURE__ */ e.createElement("p", { style: U.body }, "Milk not settling does not mean its particles are weightless. It is ", /* @__PURE__ */ e.createElement("b", null, "kinetic stability"), " — the particles are simply small enough that Brownian motion keeps re-suspending them faster than gravity can pull them down.")), /* @__PURE__ */ e.createElement("div", { style: U.plain }, /* @__PURE__ */ e.createElement("p", { style: U.tableCap }, "Run each mixture to unlock its column."), /* @__PURE__ */ e.createElement("div", { style: U.tableWrap }, /* @__PURE__ */ e.createElement("table", { style: U.table }, /* @__PURE__ */ e.createElement("thead", null, /* @__PURE__ */ e.createElement("tr", null, /* @__PURE__ */ e.createElement("th", { style: U.thL }), mt.map((t) => /* @__PURE__ */ e.createElement("th", {
		key: t,
		style: U.th
	}, ae(t) ? pt[t].name.split(" ")[0] : "🔒")))), /* @__PURE__ */ e.createElement("tbody", null, [
		{
			h: "Nature",
			solution: "Homogeneous",
			colloid: "Heterogeneous*",
			suspension: "Heterogeneous"
		},
		{
			h: "Particle size",
			solution: "< 1 nm",
			colloid: "1–1000 nm",
			suspension: "> 1000 nm"
		},
		{
			h: "Visibility",
			solution: "Invisible",
			colloid: "Invisible",
			suspension: "Visible"
		},
		{
			h: "Settling",
			solution: "Never settles",
			colloid: "Never settles",
			suspension: "Settles out"
		},
		{
			h: "Filtration",
			solution: "Passes",
			colloid: "Passes",
			suspension: "Trapped"
		},
		{
			h: "Tyndall",
			solution: "No scatter",
			colloid: "Scatters",
			suspension: "Scatters"
		}
	].map((t, n) => /* @__PURE__ */ e.createElement("tr", {
		key: t.h,
		style: { background: n % 2 ? "var(--surface)" : "transparent" }
	}, /* @__PURE__ */ e.createElement("td", { style: U.tdH }, t.h), mt.map((n) => /* @__PURE__ */ e.createElement("td", {
		key: n,
		style: U.td
	}, ae(n) ? t[n] : "·"))))))), /* @__PURE__ */ e.createElement("p", { style: U.note }, "*A colloid is technically heterogeneous but appears uniform. Tyndall belongs to its own sub-topic — listed here only as a reference."))), /* @__PURE__ */ e.createElement("div", {
		className: "slide-right",
		style: U.right
	}, /* @__PURE__ */ e.createElement("div", { style: U.panelTitle }, "Let it stand for 24 hours"), /* @__PURE__ */ e.createElement("div", { style: U.famRow }, mt.map((t) => /* @__PURE__ */ e.createElement("button", {
		key: t,
		onClick: () => x(t),
		style: u === t ? U.famOn : U.famOff
	}, /* @__PURE__ */ e.createElement("span", { style: U.famName }, pt[t].name), /* @__PURE__ */ e.createElement("span", { style: U.famTag }, pt[t].tag)))), /* @__PURE__ */ e.createElement("canvas", {
		ref: n,
		style: {
			width: "100%",
			aspectRatio: "5 / 4",
			maxHeight: "40vh",
			display: "block",
			borderRadius: 10,
			background: "#0e1117",
			outline: ne ? "2px solid var(--primary)" : "1px solid var(--border-light)",
			boxShadow: ne ? "0 0 0 3px var(--primary-softer)" : "none"
		}
	}), !f && !m && /* @__PURE__ */ e.createElement(e.Fragment, null, /* @__PURE__ */ e.createElement("div", { style: U.hint }, "Predict first: after 24 hours, what does ", /* @__PURE__ */ e.createElement("b", null, ee.name), " do?"), /* @__PURE__ */ e.createElement("div", { style: U.chipRow }, ht.map((t) => /* @__PURE__ */ e.createElement("button", {
		key: t.key,
		onClick: () => S(t.key),
		style: U.chip
	}, t.label)))), m && /* @__PURE__ */ e.createElement("div", { style: U.hint }, "Watch the sand fall — the clock is running…"), ne && f && /* @__PURE__ */ e.createElement("div", { style: re ? U.verdictOk : U.verdictNo }, /* @__PURE__ */ e.createElement("div", { style: U.verdictTag }, re ? "✓ Nicely reasoned" : "Let us re-read the result"), /* @__PURE__ */ e.createElement("p", { style: U.verdictText }, ie[u]))));
}
var xt = {
	borderRadius: 10,
	padding: "14px 38px 14px 18px",
	boxSizing: "border-box",
	position: "relative"
}, U = {
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
	corner: {
		position: "absolute",
		top: 10,
		right: 12,
		fontSize: 16
	},
	cardHook: {
		...xt,
		background: "var(--hook-soft)",
		borderLeft: "2px solid var(--hook)"
	},
	cardInsight: {
		...xt,
		background: "var(--primary-softer)",
		border: "1px solid var(--primary-soft)",
		borderLeft: "2px solid var(--primary)"
	},
	cardPitfall: {
		...xt,
		background: "var(--accent-soft)",
		borderLeft: "2px solid var(--accent)"
	},
	plain: {
		padding: "2px 4px",
		boxSizing: "border-box"
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
	tableCap: {
		fontSize: 13,
		color: "var(--text-muted)",
		margin: "0 0 8px"
	},
	tableWrap: { overflowX: "hidden" },
	table: {
		width: "100%",
		borderCollapse: "collapse",
		fontSize: 12.5,
		tableLayout: "fixed"
	},
	th: {
		padding: "6px 4px",
		textAlign: "center",
		fontWeight: 700,
		color: "var(--primary)",
		borderBottom: "1px solid var(--border)"
	},
	thL: {
		width: "28%",
		borderBottom: "1px solid var(--border)"
	},
	td: {
		padding: "6px 4px",
		textAlign: "center",
		color: "var(--text-secondary)",
		borderBottom: "1px solid var(--border-light)"
	},
	tdH: {
		padding: "6px 4px",
		textAlign: "left",
		fontWeight: 600,
		color: "var(--text-primary)",
		borderBottom: "1px solid var(--border-light)"
	},
	note: {
		fontSize: 11.5,
		color: "var(--text-muted)",
		margin: "8px 0 0",
		lineHeight: 1.5
	},
	panelTitle: {
		fontSize: 16,
		fontWeight: 700,
		color: "var(--text-primary)"
	},
	famRow: {
		display: "flex",
		gap: 8
	},
	famOff: {
		flex: 1,
		minWidth: 0,
		display: "flex",
		flexDirection: "column",
		gap: 2,
		padding: "8px 6px",
		borderRadius: 8,
		border: "1px solid var(--border)",
		background: "var(--surface)",
		cursor: "pointer"
	},
	famOn: {
		flex: 1,
		minWidth: 0,
		display: "flex",
		flexDirection: "column",
		gap: 2,
		padding: "8px 6px",
		borderRadius: 8,
		border: "1px solid var(--primary)",
		background: "var(--primary-softer)",
		cursor: "pointer"
	},
	famName: {
		fontSize: 12.5,
		fontWeight: 700,
		color: "var(--text-primary)"
	},
	famTag: {
		fontSize: 10.5,
		color: "var(--text-muted)"
	},
	clockRow: {
		display: "flex",
		alignItems: "center",
		gap: 8
	},
	clockLabel: {
		fontSize: 12,
		color: "var(--text-muted)",
		flexShrink: 0
	},
	clockBar: {
		flex: 1,
		height: 7,
		borderRadius: 4,
		background: "var(--surface)",
		border: "1px solid var(--border-light)",
		overflow: "hidden"
	},
	clockFill: {
		height: "100%",
		background: "var(--primary)",
		transition: "width 0.2s"
	},
	clockVal: {
		fontSize: 12,
		fontWeight: 700,
		color: "var(--text-secondary)",
		flexShrink: 0
	},
	hint: {
		fontSize: 13.5,
		color: "var(--text-secondary)",
		textAlign: "center",
		lineHeight: 1.5
	},
	chipRow: {
		display: "flex",
		gap: 8
	},
	chip: {
		flex: 1,
		minWidth: 0,
		padding: "10px 8px",
		borderRadius: 8,
		border: "1px solid var(--border)",
		background: "var(--surface-raised)",
		color: "var(--text-primary)",
		fontSize: 13,
		fontWeight: 600,
		cursor: "pointer"
	},
	verdictOk: {
		borderRadius: 10,
		padding: "12px 14px",
		background: "var(--primary-softer)",
		border: "1px solid var(--primary-soft)",
		borderLeft: "2px solid var(--primary)"
	},
	verdictNo: {
		borderRadius: 10,
		padding: "12px 14px",
		background: "var(--accent-soft)",
		borderLeft: "2px solid var(--accent)"
	},
	verdictTag: {
		fontSize: 13,
		fontWeight: 700,
		color: "var(--text-primary)",
		marginBottom: 6
	},
	verdictText: {
		fontSize: 14,
		lineHeight: 1.6,
		color: "var(--text-primary)",
		margin: 0
	}
};
//#endregion
//#region ../tmp/nadi-slides-fd6e4518-99e0-414a-a92e-35da921944c5/Slide_t5-2.jsx
function St({ studentName: t }) {
	let n = C(null), r = C(!1), [i, a] = w(60), [o, s] = w(null), c = (e) => 195 + 2.3 * (e - 20), l = c(i), u = Math.max(0, 287 - l), d = ne(() => Array.from({ length: 322 }, () => Math.random() < .16), []);
	b(() => {
		let e = n.current;
		if (!e) return;
		let t = 0, r = () => {
			let t = e.getBoundingClientRect(), n = window.devicePixelRatio || 1;
			e.width = t.width * n, e.height = t.height * n;
			let r = e.getContext("2d");
			r.setTransform(n, 0, 0, n, 0, 0);
			let a = e.clientWidth, o = e.clientHeight;
			r.clearRect(0, 0, a, o);
			let s = a - 46 - 16, d = o - 18 - 34, f = (e) => 46 + (e - 20) / 40 * s, p = (e) => 18 + (1 - (e - 170) / 130) * d;
			r.fillStyle = "#f0fdf4", r.fillRect(46, 18, s, d), r.strokeStyle = "#cdeccf", r.lineWidth = 1;
			for (let e = 170; e <= 300; e += 10) {
				let t = p(e);
				r.beginPath(), r.moveTo(46, t), r.lineTo(46 + s, t), r.stroke();
			}
			for (let e = 20; e <= 60; e += 2) {
				let t = f(e);
				r.beginPath(), r.moveTo(t, 18), r.lineTo(t, 18 + d), r.stroke();
			}
			r.strokeStyle = "#86c98c", r.lineWidth = 1.25, r.font = "10px Outfit, sans-serif", r.fillStyle = "#3f8a46";
			for (let e = 180; e <= 300; e += 30) {
				let t = p(e);
				r.beginPath(), r.moveTo(46, t), r.lineTo(46 + s, t), r.stroke(), r.textAlign = "right", r.textBaseline = "middle", r.fillText(String(e), 40, t);
			}
			r.textAlign = "center", r.textBaseline = "top";
			for (let e = 20; e <= 60; e += 10) {
				let t = f(e);
				r.beginPath(), r.moveTo(t, 18), r.lineTo(t, 18 + d), r.stroke(), r.fillText(e + "°", t, 18 + d + 8);
			}
			r.fillStyle = "#3f8a46", r.fillText("temperature (°C)", 46 + s / 2, 18 + d + 20);
			let m = p(287);
			r.strokeStyle = "#0ea5e9", r.lineWidth = 2, r.setLineDash([6, 4]), r.beginPath(), r.moveTo(46, m), r.lineTo(46 + s, m), r.stroke(), r.setLineDash([]), r.strokeStyle = "#7c3aed", r.lineWidth = 3, r.beginPath();
			for (let e = 20; e <= 60; e += 1) {
				let t = f(e), n = p(c(e));
				e === 20 ? r.moveTo(t, n) : r.lineTo(t, n);
			}
			r.stroke();
			let h = f(i);
			if (r.strokeStyle = "#cbd5e1", r.lineWidth = 1, r.setLineDash([3, 3]), r.beginPath(), r.moveTo(h, 18), r.lineTo(h, 18 + d), r.stroke(), r.setLineDash([]), i < 60) {
				let e = p(l);
				r.strokeStyle = "#d97706", r.lineWidth = 2, r.beginPath(), r.moveTo(h, m), r.lineTo(h, e), r.stroke(), r.fillStyle = "#d97706", r.beginPath(), r.moveTo(h, e), r.lineTo(h - 4, e - 6), r.lineTo(h + 4, e - 6), r.closePath(), r.fill(), r.beginPath(), r.moveTo(h, m), r.lineTo(h - 4, m + 6), r.lineTo(h + 4, m + 6), r.closePath(), r.fill(), r.fillStyle = "#b45309", r.font = "700 11px Outfit, sans-serif", r.textAlign = h > 46 + s * .6 ? "right" : "left", r.textBaseline = "middle";
				let t = h > 46 + s * .6 ? h - 8 : h + 8;
				r.fillText("+" + Math.round(u) + " g out", t, (m + e) / 2);
			}
			r.fillStyle = "#7c3aed", r.strokeStyle = "#fff", r.lineWidth = 2, r.beginPath(), r.arc(h, p(l), 7, 0, Math.PI * 2), r.fill(), r.stroke(), r.fillStyle = "#0ea5e9", r.beginPath(), r.arc(f(60), m, 4, 0, Math.PI * 2), r.fill();
			let g = (e, t, n, r, i, a) => {
				e.beginPath(), e.moveTo(t + a, n), e.arcTo(t + r, n, t + r, n + i, a), e.arcTo(t + r, n + i, t, n + i, a), e.arcTo(t, n + i, t, n, a), e.arcTo(t, n, t + r, n, a), e.closePath();
			}, _ = p(l);
			r.strokeStyle = "#cbd5e1", r.lineWidth = 1, r.setLineDash([3, 3]), r.beginPath(), r.moveTo(46, _), r.lineTo(h, _), r.stroke(), r.setLineDash([]), r.font = "700 11px Outfit, sans-serif", r.textAlign = "center", r.textBaseline = "middle";
			let v = Math.round(l) + " g", y = r.measureText(v).width + 12;
			r.fillStyle = "#7c3aed", g(r, Math.max(0, 46 - y - 1), _ - 9, y, 18, 4), r.fill(), r.fillStyle = "#fff", r.fillText(v, Math.max(0, 46 - y - 1) + y / 2, _);
			let b = i + "°C", x = r.measureText(b).width + 12, S = h - x / 2;
			S = Math.max(46, Math.min(S, 46 + s - x)), r.fillStyle = "#7c3aed", g(r, S, 18 + d + 3, x, 18, 4), r.fill(), r.fillStyle = "#fff", r.fillText(b, S + x / 2, 18 + d + 12);
		};
		r();
		let a = new ResizeObserver(() => {
			cancelAnimationFrame(t), t = requestAnimationFrame(r);
		});
		return a.observe(e), () => {
			a.disconnect(), cancelAnimationFrame(t);
		};
	}, [i]);
	let f = (e) => {
		let t = n.current;
		if (!t) return;
		let r = t.getBoundingClientRect(), i = r.width - 46 - 16, o = (e - r.left - 46) / i;
		o = Math.max(0, Math.min(1, o)), a(Math.round((20 + o * 40) * 2) / 2);
	};
	return /* @__PURE__ */ e.createElement(e.Fragment, null, /* @__PURE__ */ e.createElement("div", {
		className: "slide-title",
		style: W.title
	}, "Crystallisation: Purity from a Cooling Solution"), /* @__PURE__ */ e.createElement("div", {
		className: "slide-left",
		style: W.left
	}, /* @__PURE__ */ e.createElement("div", { style: W.cardHook }, /* @__PURE__ */ e.createElement("span", { style: W.cornerBadge }, "💭"), /* @__PURE__ */ e.createElement("p", { style: W.hookText }, t, ", chemistry comes with its own vocabulary — learning it is a bit like learning a new language, and you're already doing it. Here's a friendly first idea: when a solid dissolves it doesn't disappear. It's still itself, still obeying its own rule for how much water can hold it. So ask yourself — what becomes of the \"extra\" when the water cools?")), /* @__PURE__ */ e.createElement("div", { style: W.plain }, /* @__PURE__ */ e.createElement("div", { style: W.cardHeadRow }, /* @__PURE__ */ e.createElement("span", { style: W.hCard }, "The solubility budget"), /* @__PURE__ */ e.createElement("span", { style: W.levelPill }, "macroscopic")), /* @__PURE__ */ e.createElement("p", { style: W.body }, "Start with what you can ", /* @__PURE__ */ e.createElement("i", null, "see"), ". Water can only hold so much solid at a given temperature — call it the ", /* @__PURE__ */ e.createElement("b", null, "budget"), ". Hot water = a big budget; cool water = a smaller one. Picture it like a bus: only so many passengers fit."), /* @__PURE__ */ e.createElement("div", { style: W.miniRow }, /* @__PURE__ */ e.createElement("span", { style: W.chip }, "60°C → 287 g"), /* @__PURE__ */ e.createElement("span", { style: W.arrow }, "cool to"), /* @__PURE__ */ e.createElement("span", { style: W.chip }, "40°C → 241 g")), /* @__PURE__ */ e.createElement("div", { style: W.cardHeadRow }, /* @__PURE__ */ e.createElement("span", { style: W.subHead }, "Now think symbolically"), /* @__PURE__ */ e.createElement("span", { style: W.levelPill }, "symbolic")), /* @__PURE__ */ e.createElement("div", { style: W.formula }, "excess out = dissolved − budget = 287 − 241 = 46 g"), /* @__PURE__ */ e.createElement("p", { style: W.body }, "The 287 g is already on board. Cool to 40°C and only 241 seats remain — so 46 g must step off. That's the whole method in one line.")), /* @__PURE__ */ e.createElement("div", { style: W.cardInsight }, /* @__PURE__ */ e.createElement("span", { style: W.cornerBadge }, "💡"), /* @__PURE__ */ e.createElement("span", { style: W.levelPillInline }, "microscopic"), /* @__PURE__ */ e.createElement("p", { style: W.body }, "Zoom in to the molecules. As the solution cools, the surplus particles slow down and lock into a regular, repeating ", /* @__PURE__ */ e.createElement("b", null, "lattice"), " — a tidy 3D jigsaw that only accepts pieces of the right shape. Impurity particles don't fit, so they're turned away and ", /* @__PURE__ */ e.createElement("b", null, "stay dissolved in the liquid"), ". That single fact is why the crystal comes out pure.")), /* @__PURE__ */ e.createElement("div", { style: W.plain }, /* @__PURE__ */ e.createElement("div", { style: W.hCard }, "Precipitation vs crystallisation"), /* @__PURE__ */ e.createElement("p", { style: W.body }, "A fair question to ask: aren't these the same? Both shed excess solid from a supersaturated solution — the difference is the ", /* @__PURE__ */ e.createElement("b", null, "pace"), ", and so the look."), /* @__PURE__ */ e.createElement("div", { style: W.cmpRow }, /* @__PURE__ */ e.createElement("div", { style: W.cmpCol }, /* @__PURE__ */ e.createElement("div", { style: W.cmpHead }, "Precipitation"), /* @__PURE__ */ e.createElement("div", { style: W.cmpBody }, "Fast drop-out → many ", /* @__PURE__ */ e.createElement("b", null, "small particles"), ", a cloudy powder.")), /* @__PURE__ */ e.createElement("div", { style: W.cmpCol }, /* @__PURE__ */ e.createElement("div", { style: W.cmpHead }, "Crystallisation"), /* @__PURE__ */ e.createElement("div", { style: W.cmpBody }, "Slow, orderly growth → ", /* @__PURE__ */ e.createElement("b", null, "large, well-formed crystals"), "."))), /* @__PURE__ */ e.createElement("p", { style: W.body }, "Here's the takeaway: cool ", /* @__PURE__ */ e.createElement("i", null, "slowly"), " and you give particles time to find their lattice spot — patience is what buys you bigger, purer crystals.")), /* @__PURE__ */ e.createElement("div", { style: W.cardPitfall }, /* @__PURE__ */ e.createElement("span", { style: W.cornerBadge }, "⚠️"), /* @__PURE__ */ e.createElement("p", { style: W.body }, "It's tempting to treat evaporation and crystallisation as interchangeable — don't. Evaporation boils the water off and ", /* @__PURE__ */ e.createElement("b", null, "traps"), " every dissolved impurity in the dried solid. Crystallisation keeps the water, so impurities have somewhere to stay. Same goal, very different purity.")), /* @__PURE__ */ e.createElement("div", { style: W.cardSurprise }, /* @__PURE__ */ e.createElement("span", { style: W.cornerBadge }, "🤯"), /* @__PURE__ */ e.createElement("p", { style: W.body }, "Once you hold this idea, you'll spot it constantly: rock candy & mishri, brown-to-white sugar refining, salt growing in sun-baked pans, even painful kidney stones — all the same logic, a supersaturated solution shedding its excess. (Taken to an extreme to purify silicon chips, it earns a name: ", /* @__PURE__ */ e.createElement("i", null, "zone refining"), ".)"))), /* @__PURE__ */ e.createElement("div", {
		className: "slide-right",
		style: W.right
	}, /* @__PURE__ */ e.createElement("div", { style: W.panelTitle }, "Your turn — cool the solution by dragging the temperature"), /* @__PURE__ */ e.createElement("canvas", {
		ref: n,
		style: W.canvas,
		onPointerDown: (e) => {
			r.current = !0, e.currentTarget.setPointerCapture(e.pointerId), f(e.clientX);
		},
		onPointerMove: (e) => {
			r.current && f(e.clientX);
		},
		onPointerUp: () => {
			r.current = !1;
		},
		onPointerLeave: () => {
			r.current = !1;
		}
	}), /* @__PURE__ */ e.createElement("div", { style: W.legendRow }, /* @__PURE__ */ e.createElement("span", { style: W.legend }, /* @__PURE__ */ e.createElement("span", { style: {
		...W.swatch,
		background: "#7c3aed"
	} }), "ceiling (budget)"), /* @__PURE__ */ e.createElement("span", { style: W.legend }, /* @__PURE__ */ e.createElement("span", { style: {
		...W.swatch,
		background: "#0ea5e9"
	} }), "dissolved (287 g)"), /* @__PURE__ */ e.createElement("span", { style: W.legend }, /* @__PURE__ */ e.createElement("span", { style: {
		...W.swatch,
		background: "#d97706"
	} }), "excess out (arrow)")), /* @__PURE__ */ e.createElement("div", { style: W.readout }, /* @__PURE__ */ e.createElement("span", null, "At ", /* @__PURE__ */ e.createElement("b", null, i, "°C"), " the water can hold ", /* @__PURE__ */ e.createElement("b", null, Math.round(l), " g"), "."), /* @__PURE__ */ e.createElement("span", { style: {
		color: u > 0 ? "var(--accent-text)" : "var(--text-muted)",
		fontWeight: 700
	} }, u > 0 ? `Nicely done — the ceiling dropped below 287 g, so ${Math.round(u)} g must step out as crystals.` : "Right where we started: ceiling = dissolved, so nothing leaves yet. Keep dragging left to cool it.")), /* @__PURE__ */ e.createElement("div", { style: W.toggleWrap }, /* @__PURE__ */ e.createElement("div", { style: W.toggleQ }, "Step 2 — recover the solid. Make a prediction first: which route gives the purer crystal?"), /* @__PURE__ */ e.createElement("div", { style: W.imgRow }, /* @__PURE__ */ e.createElement("button", {
		style: o === "evap" ? W.imgTileActive : W.imgTile,
		onClick: () => s("evap")
	}, /* @__PURE__ */ e.createElement("img", {
		src: "EVAPORATE_IMAGE_URL",
		alt: "Boil it dry",
		style: W.imgEl
	}), /* @__PURE__ */ e.createElement("span", { style: W.imgOverlay }, "Boil it dry (evaporate)"), o === "evap" && /* @__PURE__ */ e.createElement("span", { style: W.imgCheck }, "✓")), /* @__PURE__ */ e.createElement("button", {
		style: o === "cryst" ? W.imgTileActive : W.imgTile,
		onClick: () => s("cryst")
	}, /* @__PURE__ */ e.createElement("img", {
		src: "CRYSTALLISE_IMAGE_URL",
		alt: "Let it crystallise",
		style: W.imgEl
	}), /* @__PURE__ */ e.createElement("span", { style: W.imgOverlay }, "Let it crystallise"), o === "cryst" && /* @__PURE__ */ e.createElement("span", { style: W.imgCheck }, "✓"))), o === null && /* @__PURE__ */ e.createElement("div", { style: W.placeholder }, "🔒 Commit to one — then we'll compare them molecule by molecule →"), o === "evap" && /* @__PURE__ */ e.createElement("div", { style: W.resultEvap }, /* @__PURE__ */ e.createElement("div", { style: W.cubeField }, d.map((t, n) => /* @__PURE__ */ e.createElement("span", {
		key: n,
		style: {
			...W.cube,
			background: t ? "#dc2626" : "#64748b"
		}
	}))), /* @__PURE__ */ e.createElement("p", { style: W.resultText }, /* @__PURE__ */ e.createElement("b", null, "Less pure — and here's why."), " The water is gone entirely, so the impurities (red) had nowhere left to go but ", /* @__PURE__ */ e.createElement("b", null, "into"), " the solid — scattered right through it, trapped. A good reminder that \"recovering the solid\" and \"recovering it pure\" aren't the same thing.")), o === "cryst" && /* @__PURE__ */ e.createElement("div", { style: W.resultCryst }, /* @__PURE__ */ e.createElement("div", { style: W.cubeField }, Array.from({ length: 322 }).map((t, n) => /* @__PURE__ */ e.createElement("span", {
		key: n,
		style: {
			...W.cube,
			background: "#64748b"
		}
	}))), /* @__PURE__ */ e.createElement("p", { style: W.resultText }, /* @__PURE__ */ e.createElement("b", null, "Pure crystal — well predicted."), " Every cube is the same solid: the lattice accepted only the right particles, so the impurities stayed dissolved in the liquid you poured off. Keep the water, keep the purity.")))));
}
var Ct = {
	background: "var(--surface-raised)",
	border: "1px solid var(--border-light)",
	borderRadius: 10,
	padding: "14px 18px",
	boxSizing: "border-box",
	position: "relative",
	paddingRight: 42
}, W = {
	title: {
		fontSize: 22,
		fontWeight: 700,
		color: "var(--text-primary)"
	},
	left: {
		display: "flex",
		flexDirection: "column",
		gap: 14,
		minWidth: 0
	},
	right: {
		display: "flex",
		flexDirection: "column",
		gap: 12,
		minWidth: 0
	},
	plain: {
		minWidth: 0,
		padding: "0 2px"
	},
	cardHeadRow: {
		display: "flex",
		alignItems: "center",
		justifyContent: "space-between",
		gap: 8,
		marginBottom: 8,
		marginTop: 2
	},
	cornerBadge: {
		position: "absolute",
		top: 10,
		right: 10,
		display: "inline-flex",
		alignItems: "center",
		justifyContent: "center",
		width: 24,
		height: 24,
		borderRadius: 6,
		fontSize: 14,
		background: "var(--surface)"
	},
	levelPill: {
		fontSize: 10,
		fontWeight: 700,
		letterSpacing: .4,
		textTransform: "uppercase",
		color: "var(--text-muted)",
		background: "var(--surface)",
		border: "1px solid var(--border-light)",
		borderRadius: 999,
		padding: "2px 8px",
		flexShrink: 0
	},
	levelPillInline: {
		display: "inline-block",
		fontSize: 10,
		fontWeight: 700,
		letterSpacing: .4,
		textTransform: "uppercase",
		color: "var(--primary)",
		background: "var(--surface)",
		border: "1px solid var(--primary-soft)",
		borderRadius: 999,
		padding: "2px 8px",
		marginBottom: 8
	},
	cardHook: {
		...Ct,
		background: "var(--hook-soft)",
		borderLeft: "2px solid var(--hook)"
	},
	cardInsight: {
		...Ct,
		background: "var(--primary-softer)",
		borderColor: "var(--primary-soft)",
		borderLeft: "2px solid var(--primary)"
	},
	cardPitfall: {
		...Ct,
		background: "var(--accent-soft)",
		borderLeft: "2px solid var(--accent)"
	},
	cardSurprise: {
		...Ct,
		background: "var(--surprise-soft)",
		borderLeft: "2px solid var(--surprise)"
	},
	hCard: {
		fontSize: 14,
		fontWeight: 700,
		color: "var(--primary)"
	},
	subHead: {
		fontSize: 13,
		fontWeight: 700,
		color: "var(--text-secondary)"
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
		lineHeight: 1.6,
		color: "var(--text-primary)",
		margin: "6px 0 0"
	},
	miniRow: {
		display: "flex",
		alignItems: "center",
		gap: 8,
		flexWrap: "wrap",
		margin: "10px 0"
	},
	chip: {
		fontFamily: "monospace",
		fontWeight: 700,
		fontSize: 14,
		color: "var(--text-primary)",
		background: "var(--surface)",
		border: "1px solid var(--border-light)",
		borderRadius: 7,
		padding: "6px 10px"
	},
	arrow: {
		fontSize: 12,
		color: "var(--text-muted)"
	},
	formula: {
		textAlign: "center",
		fontFamily: "monospace",
		fontWeight: 700,
		fontSize: 15,
		color: "var(--text-primary)",
		background: "var(--surface)",
		border: "1px solid var(--border-light)",
		borderRadius: 8,
		padding: "12px 14px",
		margin: "4px 0 0"
	},
	cmpRow: {
		display: "flex",
		gap: 8,
		margin: "10px 0"
	},
	cmpCol: {
		flex: 1,
		minWidth: 0,
		background: "var(--surface)",
		border: "1px solid var(--border-light)",
		borderRadius: 8,
		padding: "8px 10px",
		boxSizing: "border-box"
	},
	cmpHead: {
		fontSize: 13,
		fontWeight: 700,
		color: "var(--text-primary)",
		marginBottom: 4
	},
	cmpBody: {
		fontSize: 13,
		lineHeight: 1.5,
		color: "var(--text-secondary)"
	},
	panelTitle: {
		fontSize: 16,
		fontWeight: 700,
		color: "var(--text-primary)"
	},
	canvas: {
		width: "100%",
		aspectRatio: "4 / 3",
		maxHeight: "40vh",
		display: "block",
		background: "var(--surface)",
		border: "1px solid var(--border-light)",
		borderRadius: 8,
		touchAction: "none",
		cursor: "ew-resize"
	},
	legendRow: {
		display: "flex",
		gap: 14,
		flexWrap: "wrap",
		justifyContent: "center"
	},
	legend: {
		display: "inline-flex",
		alignItems: "center",
		gap: 6,
		fontSize: 12,
		color: "var(--text-secondary)"
	},
	swatch: {
		width: 14,
		height: 4,
		borderRadius: 2,
		display: "inline-block"
	},
	readout: {
		display: "flex",
		flexDirection: "column",
		gap: 4,
		textAlign: "center",
		fontSize: 15,
		color: "var(--text-primary)"
	},
	toggleWrap: {
		display: "flex",
		flexDirection: "column",
		gap: 10,
		borderTop: "1px solid var(--border-light)",
		paddingTop: 12
	},
	toggleQ: {
		fontSize: 14,
		fontWeight: 700,
		color: "var(--text-primary)"
	},
	btnRow: {
		display: "flex",
		gap: 8,
		flexWrap: "wrap"
	},
	imgRow: {
		display: "flex",
		gap: 10,
		flexWrap: "wrap"
	},
	imgTile: {
		flex: 1,
		minWidth: 130,
		position: "relative",
		padding: 0,
		borderRadius: 10,
		border: "2px solid var(--border)",
		background: "var(--surface)",
		cursor: "pointer",
		overflow: "hidden",
		boxSizing: "border-box"
	},
	imgTileActive: {
		flex: 1,
		minWidth: 130,
		position: "relative",
		padding: 0,
		borderRadius: 10,
		border: "2px solid var(--primary)",
		background: "var(--surface)",
		cursor: "pointer",
		overflow: "hidden",
		boxShadow: "0 0 0 3px var(--primary-softer)",
		boxSizing: "border-box"
	},
	imgEl: {
		display: "block",
		width: "100%",
		aspectRatio: "4 / 3",
		objectFit: "cover"
	},
	imgOverlay: {
		position: "absolute",
		left: 0,
		right: 0,
		bottom: 0,
		padding: "8px 10px",
		fontSize: 13,
		fontWeight: 700,
		color: "#fff",
		textAlign: "center",
		background: "linear-gradient(to top, rgba(0,0,0,0.7), rgba(0,0,0,0))",
		fontFamily: "Outfit, sans-serif"
	},
	imgCheck: {
		position: "absolute",
		top: 6,
		right: 6,
		width: 22,
		height: 22,
		borderRadius: "50%",
		background: "var(--primary)",
		color: "#fff",
		fontSize: 13,
		fontWeight: 700,
		display: "flex",
		alignItems: "center",
		justifyContent: "center"
	},
	placeholder: {
		fontSize: 13,
		color: "var(--text-muted)",
		textAlign: "center",
		padding: "8px 0"
	},
	resultEvap: {
		display: "flex",
		flexDirection: "column",
		gap: 8,
		background: "var(--accent-soft)",
		borderRadius: 8,
		padding: 12
	},
	resultCryst: {
		display: "flex",
		flexDirection: "column",
		gap: 8,
		background: "var(--primary-softer)",
		borderRadius: 8,
		padding: 12
	},
	cubeField: {
		display: "grid",
		gridTemplateColumns: "repeat(46, 1fr)",
		gap: 1,
		padding: 8,
		background: "rgba(0,0,0,0.04)",
		borderRadius: 6
	},
	cube: {
		width: "100%",
		aspectRatio: "1",
		borderRadius: 0,
		display: "block"
	},
	resultText: {
		fontSize: 14,
		lineHeight: 1.55,
		color: "var(--text-primary)",
		margin: 0
	}
}, wt = {
	molecular: {
		label: "Molecular methods",
		sub: "differences at the microscopic, molecule level",
		icon: "🧬",
		fits: "homo",
		handles: [
			{
				id: "sol",
				name: "Solubility vs temperature",
				prop: "One solute stops dissolving when the temperature drops.",
				method: "Crystallisation",
				detail: "Cool the solution → that solute falls out as pure crystals while the rest stays dissolved."
			},
			{
				id: "bp",
				name: "Boiling point",
				prop: "Components boil at different temperatures.",
				method: "Distillation",
				detail: "Heat it → the lower-boiling part escapes as vapour first, then you catch and re-condense it."
			},
			{
				id: "aff",
				name: "Adsorption affinity",
				prop: "Some molecules cling to a surface more than others.",
				method: "Chromatography",
				detail: "Stickier molecules crawl along slower → components spread out by speed and separate."
			}
		]
	},
	bulk: {
		label: "Bulk methods",
		sub: "differences you can see — separate bits on the macroscopic scale",
		icon: "🛢️",
		fits: "hetero",
		handles: [
			{
				id: "size",
				name: "Size & clumping",
				prop: "Some bits are bigger — or can be made to clump.",
				method: "Filtration / coagulation / sedimentation",
				detail: "Big bits caught by a filter; tiny bits clumped together so they settle out."
			},
			{
				id: "dens",
				name: "Density",
				prop: "Some parts are heavier per volume.",
				method: "Centrifugation / decantation",
				detail: "Heavier part sinks (or is spun) to the bottom → pour the lighter layer off."
			},
			{
				id: "immis",
				name: "Immiscibility",
				prop: "Two liquids refuse to mix.",
				method: "Separating funnel",
				detail: "They sit in layers (oil on water) → open the tap and drain the bottom layer off."
			},
			{
				id: "subl",
				name: "Sublimability",
				prop: "One solid turns straight into gas when heated.",
				method: "Sublimation",
				detail: "Heat it → that solid \"jumps\" off as vapour and re-forms elsewhere, leaving the rest behind."
			},
			{
				id: "mag",
				name: "Magnetism",
				prop: "One part is magnetic (e.g. iron filings).",
				method: "Magnet",
				detail: "Hold a magnet over the mix → it lifts the magnetic part clean out."
			}
		]
	}
};
function Tt({ studentName: t }) {
	let [n, r] = w(null), [i, a] = w(null), o = (e) => {
		r(e), a(null);
	}, s = (t) => {
		let r = wt[t], o = n === r.fits, s = n && !o;
		return /* @__PURE__ */ e.createElement("div", { style: {
			...G.group,
			...o ? G.groupActive : s ? G.groupLocked : {}
		} }, /* @__PURE__ */ e.createElement("div", { style: G.groupHead }, /* @__PURE__ */ e.createElement("span", { style: G.groupIcon }, r.icon), /* @__PURE__ */ e.createElement("div", { style: { minWidth: 0 } }, /* @__PURE__ */ e.createElement("div", { style: {
			...G.groupTitle,
			color: o ? "var(--primary)" : s ? "var(--text-muted)" : "var(--text-secondary)"
		} }, r.label, o ? " 🔑" : s ? " 🔒" : ""), /* @__PURE__ */ e.createElement("div", { style: G.groupSub }, r.sub))), s && /* @__PURE__ */ e.createElement("div", { style: G.lockedNote }, t === "bulk" ? "Remember: a solution is uniform at the microscopic level, so no separate bits exist to grab. Bulk methods simply have nothing to work with here." : "These need molecules dissolved in a true solution. A heterogeneous mixture hands you bulk methods instead — that is the right toolkit to reach for."), /* @__PURE__ */ e.createElement("div", { style: G.chips }, r.handles.map((t) => {
			let n = i === t.id;
			return /* @__PURE__ */ e.createElement("button", {
				key: t.id,
				disabled: !o,
				onClick: () => a(n ? null : t.id),
				style: {
					...G.chip,
					...o ? G.chipActive : G.chipDim,
					...n ? G.chipOpen : {}
				}
			}, /* @__PURE__ */ e.createElement("span", { style: G.chipName }, t.name), o && /* @__PURE__ */ e.createElement("span", { style: G.chipArrow }, n ? "▾" : "▸"), n && /* @__PURE__ */ e.createElement("span", { style: G.chipBody }, /* @__PURE__ */ e.createElement("span", { style: G.chipProp }, t.prop), /* @__PURE__ */ e.createElement("span", { style: G.chipMethod }, "→ ", t.method), /* @__PURE__ */ e.createElement("span", { style: G.chipDetail }, t.detail)));
		})));
	};
	return /* @__PURE__ */ e.createElement(e.Fragment, null, /* @__PURE__ */ e.createElement("div", {
		className: "slide-title",
		style: G.title
	}, "The Separation Key: Finding the Right \"Method\""), /* @__PURE__ */ e.createElement("div", {
		className: "slide-left",
		style: G.left
	}, /* @__PURE__ */ e.createElement("div", { style: G.cardHook }, /* @__PURE__ */ e.createElement("span", { style: G.cornerEmoji }, "💭"), /* @__PURE__ */ e.createElement("p", { style: G.hookText }, t, ", separation chemistry comes with a lot of new vocabulary — treat it like learning a new language, one clear word at a time. Begin with this: a refinery splits crude oil into petrol, diesel and wax, and a kitchen sieve drains pasta from water. Different equipment entirely — yet it is the exact ", /* @__PURE__ */ e.createElement("b", null, "same logical move"), ". Can you name it?")), /* @__PURE__ */ e.createElement("div", { style: G.plain }, /* @__PURE__ */ e.createElement("div", { style: G.hCard }, "The single logical move"), /* @__PURE__ */ e.createElement("p", { style: G.body }, "Good news — no magic is involved here, just one rule applied with care. Nothing chemical happened when the parts mixed, so nothing chemical is needed to un-mix them. Every method follows the same step:"), /* @__PURE__ */ e.createElement("div", { style: G.moveLine }, "find a ", /* @__PURE__ */ e.createElement("b", null, "physical property where the parts differ"), " → then exploit that difference")), /* @__PURE__ */ e.createElement("div", { style: G.plain }, /* @__PURE__ */ e.createElement("div", { style: G.hCard }, "First classify — it sets your toolkit"), /* @__PURE__ */ e.createElement("p", { style: G.body }, "Before reaching for any equipment, ask one question: can I see separate bits? That ", /* @__PURE__ */ e.createElement("b", null, "macroscopic"), " clue reveals the ", /* @__PURE__ */ e.createElement("b", null, "microscopic"), " structure — and that decides which family of methods you actually own:"), /* @__PURE__ */ e.createElement("p", { style: G.body }, /* @__PURE__ */ e.createElement("b", null, "Homogeneous"), " (uniform solution) → ", /* @__PURE__ */ e.createElement("b", null, "molecular"), " methods.", /* @__PURE__ */ e.createElement("br", null), /* @__PURE__ */ e.createElement("b", null, "Heterogeneous"), " (visible separate bits) → ", /* @__PURE__ */ e.createElement("b", null, "bulk"), " methods.")), /* @__PURE__ */ e.createElement("div", { style: G.cardInsight }, /* @__PURE__ */ e.createElement("span", { style: G.cornerEmoji }, "💡"), /* @__PURE__ */ e.createElement("p", { style: G.body }, "A solution is uniform right down to the molecules (microscopic), so on the macroscopic scale no separate bits exist to filter, settle or lift out. That is precisely why a solution ", /* @__PURE__ */ e.createElement("b", null, "forbids bulk methods"), ". Always classify first — it tells you which tools even exist.")), /* @__PURE__ */ e.createElement("div", { style: G.cardPitfall }, /* @__PURE__ */ e.createElement("span", { style: G.cornerEmoji }, "⚠️"), /* @__PURE__ */ e.createElement("p", { style: G.body }, /* @__PURE__ */ e.createElement("b", null, "Strategy — pick the sharpest tool."), " When more than one method fits, think like a scientist: choose the property where the parts differ ", /* @__PURE__ */ e.createElement("b", null, "most"), ". The bigger the gap, the cleaner the cut — for instance, a larger difference in boiling point (Δbp) makes distillation far easier."))), /* @__PURE__ */ e.createElement("div", {
		className: "slide-right",
		style: G.right
	}, /* @__PURE__ */ e.createElement("div", { style: G.panelTitle }, "Turn the key: classify first, then see what unlocks"), /* @__PURE__ */ e.createElement("div", { style: G.toggleRow }, /* @__PURE__ */ e.createElement("button", {
		onClick: () => o("homo"),
		style: {
			...G.toggle,
			...n === "homo" ? G.toggleOn : {}
		}
	}, /* @__PURE__ */ e.createElement("span", { style: G.toggleTitle }, "Homogeneous"), /* @__PURE__ */ e.createElement("span", { style: G.toggleSub }, "uniform — e.g. salt water, ink, air")), /* @__PURE__ */ e.createElement("button", {
		onClick: () => o("hetero"),
		style: {
			...G.toggle,
			...n === "hetero" ? G.toggleOn : {}
		}
	}, /* @__PURE__ */ e.createElement("span", { style: G.toggleTitle }, "Heterogeneous"), /* @__PURE__ */ e.createElement("span", { style: G.toggleSub }, "visible bits — e.g. sand+iron, oil+water"))), /* @__PURE__ */ e.createElement("div", { style: G.caption }, n === null && "Take your first step — classify the mixture above, and exactly one toolkit will unlock.", n === "homo" && "Nicely done — molecular methods unlocked. Tap any method to walk through how it works.", n === "hetero" && "Nicely done — bulk methods unlocked. Tap any method to walk through how it works."), s("molecular"), s("bulk")));
}
var Et = {
	background: "var(--surface-raised)",
	border: "1px solid var(--border-light)",
	borderRadius: 10,
	padding: "14px 18px",
	position: "relative",
	paddingRight: 40
}, G = {
	title: {
		fontSize: 22,
		fontWeight: 700,
		color: "var(--text-primary)"
	},
	left: {
		display: "flex",
		flexDirection: "column",
		gap: 14,
		minWidth: 0
	},
	right: {
		display: "flex",
		flexDirection: "column",
		gap: 12,
		minWidth: 0
	},
	cornerEmoji: {
		position: "absolute",
		top: 12,
		right: 14,
		fontSize: 18,
		lineHeight: 1
	},
	plain: { padding: "0 2px" },
	cardHook: {
		...Et,
		background: "var(--hook-soft)",
		borderLeft: "2px solid var(--hook)"
	},
	cardInsight: {
		...Et,
		background: "var(--primary-softer)",
		borderColor: "var(--primary-soft)",
		borderLeft: "2px solid var(--primary)"
	},
	cardPitfall: {
		...Et,
		background: "var(--accent-soft)",
		borderLeft: "2px solid var(--accent)"
	},
	hCard: {
		fontSize: 14,
		fontWeight: 700,
		color: "var(--primary)",
		marginBottom: 6
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
		lineHeight: 1.6,
		color: "var(--text-primary)",
		margin: "0 0 4px"
	},
	moveLine: {
		textAlign: "center",
		fontSize: 15,
		color: "var(--text-primary)",
		padding: "8px 4px 0",
		lineHeight: 1.5
	},
	panelTitle: {
		fontSize: 16,
		fontWeight: 700,
		color: "var(--text-primary)"
	},
	toggleRow: {
		display: "flex",
		gap: 10
	},
	toggle: {
		flex: 1,
		minWidth: 0,
		display: "flex",
		flexDirection: "column",
		gap: 3,
		textAlign: "left",
		cursor: "pointer",
		background: "var(--surface)",
		border: "1px solid var(--border)",
		borderRadius: 10,
		padding: "12px 14px",
		font: "inherit",
		transition: "all 0.15s"
	},
	toggleOn: {
		background: "var(--primary-softer)",
		borderColor: "var(--primary)",
		boxShadow: "0 0 0 2px var(--primary-soft)"
	},
	toggleTitle: {
		fontSize: 15,
		fontWeight: 700,
		color: "var(--text-primary)"
	},
	toggleSub: {
		fontSize: 12,
		color: "var(--text-muted)"
	},
	caption: {
		fontSize: 13,
		color: "var(--text-secondary)",
		fontStyle: "italic",
		textAlign: "center",
		minHeight: 18
	},
	group: {
		border: "1px solid var(--border-light)",
		borderRadius: 10,
		padding: "12px 14px",
		background: "var(--surface)",
		transition: "all 0.2s",
		opacity: .55
	},
	groupActive: {
		opacity: 1,
		borderColor: "var(--primary)",
		background: "var(--primary-softer)",
		boxShadow: "0 0 0 1px var(--primary-soft)"
	},
	groupLocked: {
		opacity: .5,
		background: "var(--surface)"
	},
	groupHead: {
		display: "flex",
		alignItems: "center",
		gap: 10,
		marginBottom: 8
	},
	groupIcon: {
		fontSize: 20,
		flexShrink: 0
	},
	groupTitle: {
		fontSize: 15,
		fontWeight: 700
	},
	groupSub: {
		fontSize: 12,
		color: "var(--text-muted)"
	},
	lockedNote: {
		fontSize: 12.5,
		color: "var(--accent-text)",
		background: "var(--accent-soft)",
		border: "1px solid var(--accent-soft)",
		borderRadius: 8,
		padding: "8px 10px",
		marginBottom: 8,
		lineHeight: 1.5
	},
	chips: {
		display: "flex",
		flexDirection: "column",
		gap: 8
	},
	chip: {
		display: "flex",
		flexWrap: "wrap",
		alignItems: "center",
		gap: 6,
		width: "100%",
		textAlign: "left",
		font: "inherit",
		borderRadius: 8,
		padding: "10px 12px",
		border: "1px solid var(--border-light)",
		cursor: "pointer",
		boxSizing: "border-box",
		transition: "all 0.15s"
	},
	chipActive: {
		background: "var(--surface-raised)",
		color: "var(--text-primary)"
	},
	chipDim: {
		background: "var(--surface)",
		color: "var(--text-muted)",
		cursor: "not-allowed",
		borderStyle: "dashed"
	},
	chipOpen: {
		borderColor: "var(--primary)",
		background: "var(--surface-raised)",
		boxShadow: "0 0 0 1px var(--primary-soft)"
	},
	chipName: {
		fontSize: 14,
		fontWeight: 700,
		flex: 1,
		minWidth: 0
	},
	chipArrow: {
		fontSize: 12,
		color: "var(--primary)"
	},
	chipBody: {
		display: "flex",
		flexDirection: "column",
		gap: 4,
		width: "100%",
		marginTop: 4
	},
	chipProp: {
		fontSize: 13.5,
		color: "var(--text-secondary)",
		lineHeight: 1.5
	},
	chipMethod: {
		fontSize: 14,
		fontWeight: 700,
		color: "var(--primary)"
	},
	chipDetail: {
		fontSize: 13,
		color: "var(--text-muted)",
		lineHeight: 1.5
	}
};
//#endregion
//#region ../tmp/nadi-slides-fd6e4518-99e0-414a-a92e-35da921944c5/Slide_t4-4.jsx
function Dt({ studentName: t }) {
	let [n, r] = w(!1), [i, a] = w("Macroscopic view: oil rests on water in two clean layers."), [o, s] = w({
		active: !1,
		x: 0,
		y: 0
	}), c = C(null), l = C([]), u = C("sep"), d = C(!1), f = C(0), p = C(""), m = C(0), h = C([]), g = C([]), _ = C([]), v = (e) => {
		p.current !== e && (p.current = e, a(e));
	};
	return b(() => {
		let e = c.current;
		if (!e) return;
		let t = e.getContext("2d"), n, r = () => {
			let n = e.getBoundingClientRect(), r = window.devicePixelRatio || 1;
			e.width = n.width * r, e.height = n.height * r, t.setTransform(r, 0, 0, r, 0, 0);
		};
		r(), l.current.length === 0 && (() => {
			let t = e.clientWidth, n = e.clientHeight, r = [];
			for (let e = 0; e < 46; e++) r.push({
				x: .12 * t + Math.random() * .76 * t,
				y: .06 * n + Math.random() * .2 * n,
				vx: 0,
				vy: 0,
				r: 5 + Math.random() * 3,
				ti: e
			});
			l.current = r;
		})();
		let i = new ResizeObserver(() => {
			r();
		});
		i.observe(e);
		let a = () => {
			let n = e.clientWidth, r = e.clientHeight, i = l.current, a = u.current;
			m.current += .01, t.clearRect(0, 0, n, r);
			let o = n - 12, s = r - 12, c = 6 + s * .3;
			if (t.save(), t.beginPath(), t.moveTo(20, 6), t.arcTo(6 + o, 6, 6 + o, 6 + s, 14), t.arcTo(6 + o, 6 + s, 6, 6 + s, 14), t.arcTo(6, 6 + s, 6, 6, 14), t.arcTo(6, 6, 6 + o, 6, 14), t.closePath(), t.clip(), a === "sep") {
				let e = d.current, n = 6 + s * .82, r = e ? n : 6 + s;
				t.fillStyle = "#f4cd63", t.fillRect(6, 6, o, c - 6), t.fillStyle = "#bfe0f5", t.fillRect(6, c, o, r - c), t.strokeStyle = "rgba(120,90,20,0.35)", t.lineWidth = 1.5, t.beginPath(), t.moveTo(6, c), t.lineTo(6 + o, c), t.stroke(), t.fillStyle = "rgba(120,80,10,0.8)", t.font = "600 12px Outfit, sans-serif", t.fillText("oil", 16, 26), t.fillStyle = "rgba(40,90,140,0.8)", t.fillText("water", 16, c + 20), e && (t.fillStyle = "#e87fb0", t.fillRect(6, n, o, 6 + s - n), t.strokeStyle = "rgba(160,50,110,0.45)", t.lineWidth = 1.5, t.beginPath(), t.moveTo(6, n), t.lineTo(6 + o, n), t.stroke(), t.fillStyle = "rgba(120,20,80,0.95)", t.font = "600 12px Outfit, sans-serif", t.fillText("soap added", 16, n + 18));
			} else {
				let e = a === "stable", n = a === "shake";
				if (t.fillStyle = n ? "#eef3f7" : "#bfe0f5", t.fillRect(6, 6, o, s), n) {
					for (let e of g.current) t.beginPath(), t.arc(e.x, e.y, e.r, 0, Math.PI * 2), t.fillStyle = "#5aa9e6", t.fill();
					for (let e of i) t.beginPath(), t.arc(e.x, e.y, e.r, 0, Math.PI * 2), t.fillStyle = "#f4cd63", t.fill();
					for (let e of _.current) t.beginPath(), t.arc(e.x, e.y, e.r, 0, Math.PI * 2), t.fillStyle = "#e87fb0", t.fill();
				} else if (e) for (let e of h.current) {
					t.beginPath(), t.arc(e.x, e.y, e.r, 0, Math.PI * 2), t.fillStyle = "#f4cd63", t.fill();
					for (let n = 0; n < 8; n++) {
						let r = n / 8 * Math.PI * 2 + e.ph, i = e.x + Math.cos(r) * (e.r + 2.2), a = e.y + Math.sin(r) * (e.r + 2.2);
						t.beginPath(), t.arc(i, a, 1.8, 0, Math.PI * 2), t.fillStyle = "#e87fb0", t.fill();
					}
				}
				else for (let e of i) t.beginPath(), t.arc(e.x, e.y, e.r, 0, Math.PI * 2), t.fillStyle = "#f4cd63", t.fill(), t.strokeStyle = "rgba(150,110,20,0.4)", t.lineWidth = 1, t.stroke();
			}
			t.restore(), t.strokeStyle = "rgba(90,110,130,0.6)", t.lineWidth = 2, t.beginPath(), t.moveTo(20, 6), t.arcTo(6 + o, 6, 6 + o, 6 + s, 14), t.arcTo(6 + o, 6 + s, 6, 6 + s, 14), t.arcTo(6, 6 + s, 6, 6, 14), t.arcTo(6, 6, 6 + o, 6, 14), t.closePath(), t.stroke();
		}, o = () => {
			let t = e.clientWidth, r = e.clientHeight, i = l.current, s = u.current, c = t - 12, p = r - 12, m = 6 + p * .3;
			if (s === "shake") {
				for (let e of i) e.vx += (Math.random() - .5) * 1.4, e.vy += (Math.random() - .5) * 1.4, e.vx *= .92, e.vy *= .92, e.x += e.vx, e.y += e.vy, e.x < 6 + e.r && (e.x = 6 + e.r, e.vx *= -.6), e.x > 6 + c - e.r && (e.x = 6 + c - e.r, e.vx *= -.6), e.y < 6 + e.r && (e.y = 6 + e.r, e.vy *= -.6), e.y > 6 + p - e.r && (e.y = 6 + p - e.r, e.vy *= -.6);
				let e = (e) => {
					for (let t of e) t.vx += (Math.random() - .5) * 1.4, t.vy += (Math.random() - .5) * 1.4, t.vx *= .92, t.vy *= .92, t.x += t.vx, t.y += t.vy, t.x < 6 + t.r && (t.x = 6 + t.r, t.vx *= -.6), t.x > 6 + c - t.r && (t.x = 6 + c - t.r, t.vx *= -.6), t.y < 6 + t.r && (t.y = 6 + t.r, t.vy *= -.6), t.y > 6 + p - t.r && (t.y = 6 + p - t.r, t.vy *= -.6);
				};
				if (e(g.current), e(_.current), --f.current, f.current <= 0) if (d.current) {
					u.current = "stable";
					let e = [];
					for (let t = 0; t < 85; t++) {
						let t = Math.random() * Math.PI * 2, n = .5 + Math.random() * .45;
						e.push({
							x: 14 + Math.random() * (c - 16),
							y: 14 + Math.random() * (p - 16),
							vx: Math.cos(t) * n,
							vy: Math.sin(t) * n,
							r: 5.5 + Math.random() * 1.5,
							ph: Math.random() * Math.PI * 2
						});
					}
					h.current = e, g.current = [], _.current = [], v("Result: a stable, milky emulsion — well done, the soap is holding it together.");
				} else u.current = "settle", g.current = [], _.current = [], v("Observe carefully — with no stabiliser, the droplets merge and rise.");
			} else if (s === "stable") {
				let e = h.current;
				for (let t of e) t.x += t.vx, t.y += t.vy;
				for (let t = 0; t < e.length; t++) for (let n = t + 1; n < e.length; n++) {
					let r = e[t], i = e[n], a = i.x - r.x, o = i.y - r.y, s = Math.sqrt(a * a + o * o) || .01, c = r.r + i.r + 7;
					if (s < c) {
						let e = a / s, t = o / s, n = (c - s) / 2;
						r.x -= e * n, r.y -= t * n, i.x += e * n, i.y += t * n;
						let l = r.vx * e + r.vy * t, u = i.vx * e + i.vy * t - l;
						r.vx += u * e, r.vy += u * t, i.vx -= u * e, i.vy -= u * t;
					}
				}
				for (let t of e) t.x < 6 + t.r && (t.x = 6 + t.r, t.vx = Math.abs(t.vx)), t.x > 6 + c - t.r && (t.x = 6 + c - t.r, t.vx = -Math.abs(t.vx)), t.y < 6 + t.r && (t.y = 6 + t.r, t.vy = Math.abs(t.vy)), t.y > 6 + p - t.r && (t.y = 6 + p - t.r, t.vy = -Math.abs(t.vy));
			} else if (s === "settle") {
				let e = !0;
				for (let t of i) t.vy -= .06, t.vx += (Math.random() - .5) * .1, t.vx *= .95, t.vy *= .98, t.x += t.vx, t.y += t.vy, t.x < 6 + t.r && (t.x = 6 + t.r, t.vx *= -.5), t.x > 6 + c - t.r && (t.x = 6 + c - t.r, t.vx *= -.5), t.y < 6 + t.r * 1.5 && (t.y = 6 + t.r * 1.5, t.vy = 0), t.y > m - 4 && (e = !1);
				e && (u.current = "sep", v("Back to two layers — without help, oil and water simply will not stay mixed."));
			}
			a(), n = requestAnimationFrame(o);
		};
		return n = requestAnimationFrame(o), () => {
			cancelAnimationFrame(n), i.disconnect();
		};
	}, []), /* @__PURE__ */ e.createElement(e.Fragment, null, /* @__PURE__ */ e.createElement("div", {
		className: "slide-title",
		style: K.title
	}, "Colloids in the Real World: The Anatomy of a Mixture"), /* @__PURE__ */ e.createElement("div", {
		className: "slide-left",
		style: K.left
	}, /* @__PURE__ */ e.createElement("div", { style: K.cardHook }, /* @__PURE__ */ e.createElement("span", { style: K.corner }, "💭"), /* @__PURE__ */ e.createElement("p", { style: K.hookText }, t, ", this topic carries new vocabulary — treat it like learning a small new language, one term at a time, and it becomes simple. Notice first: milk, fog, paint, ice cream and your own blood are all the same kind of system — one substance spread through another, never fully dissolved, never settling out.")), /* @__PURE__ */ e.createElement("div", { style: K.plain }, /* @__PURE__ */ e.createElement("div", { style: K.plainHead }, "Step 1 — name the two parts"), /* @__PURE__ */ e.createElement("p", { style: K.body }, "Every colloid is built from exactly two components. We borrow the logic of a solution, but stay precise: here the particles are ", /* @__PURE__ */ e.createElement("i", null, "dispersed"), ", not dissolved."), /* @__PURE__ */ e.createElement("div", { style: K.defRow }, /* @__PURE__ */ e.createElement("span", { style: K.tag }, "Dispersed phase"), /* @__PURE__ */ e.createElement("span", { style: K.body }, "the tiny particles spread through (size: 1–1000 nm)")), /* @__PURE__ */ e.createElement("div", { style: K.defRow }, /* @__PURE__ */ e.createElement("span", { style: K.tag2 }, "Dispersion medium"), /* @__PURE__ */ e.createElement("span", { style: K.body }, "the carrier they are spread in")), /* @__PURE__ */ e.createElement("p", { style: K.body }, "Apply it consistently as ", /* @__PURE__ */ e.createElement("i", null, "phase in medium"), ": ", /* @__PURE__ */ e.createElement("b", null, "milk"), " = fat in water; ", /* @__PURE__ */ e.createElement("b", null, "fog"), " = water in air; ", /* @__PURE__ */ e.createElement("b", null, "smoke"), " = solid in air; ", /* @__PURE__ */ e.createElement("b", null, "paint"), " = solid in liquid.")), /* @__PURE__ */ e.createElement("div", { style: K.cardInsight }, /* @__PURE__ */ e.createElement("span", { style: K.corner }, "💡"), /* @__PURE__ */ e.createElement("p", { style: K.body }, /* @__PURE__ */ e.createElement("b", null, "Step 2 — the emulsion."), " When both phase and medium are liquids, the colloid earns its own name: an ", /* @__PURE__ */ e.createElement("b", null, "emulsion"), ". ", /* @__PURE__ */ e.createElement("b", null, "Macroscopic view:"), " oil and water are immiscible, so they split into layers. ", /* @__PURE__ */ e.createElement("b", null, "Microscopic fix:"), " an ", /* @__PURE__ */ e.createElement("b", null, "emulsifying agent"), " (soap, milk proteins) wraps each droplet so they cannot merge back — and the mixture holds. Watch this play out in the panel beside you.")), /* @__PURE__ */ e.createElement("div", { style: K.cardSurprise }, /* @__PURE__ */ e.createElement("span", { style: K.corner }, "🤯"), /* @__PURE__ */ e.createElement("p", { style: K.body }, /* @__PURE__ */ e.createElement("b", null, "Reason it through — why blood must be colloidal."), " If blood were a true suspension, the cells would settle to the bottom every time you sat still, and circulation could not work. Because it is colloidal, the cells stay evenly dispersed. So how do we separate them on demand? A ", /* @__PURE__ */ e.createElement("b", null, "centrifuge"), " spins the sample hard enough to overcome that stability and force the cells down, leaving clear plasma above."))), /* @__PURE__ */ e.createElement("div", {
		className: "slide-right",
		style: K.right
	}, /* @__PURE__ */ e.createElement("div", { style: K.panelTitle }, "The Stabilizer Switch"), /* @__PURE__ */ e.createElement("canvas", {
		ref: c,
		style: {
			width: "100%",
			aspectRatio: "5 / 4",
			maxHeight: "40vh",
			display: "block",
			borderRadius: 10,
			outline: n ? "2px solid var(--primary)" : "1px solid var(--border-light)"
		}
	}), /* @__PURE__ */ e.createElement("div", { style: K.readout }, i), /* @__PURE__ */ e.createElement("div", { style: K.controls }, n ? /* @__PURE__ */ e.createElement("div", { style: K.chipDone }, "✓ Soap added") : /* @__PURE__ */ e.createElement("div", {
		style: K.chip,
		onPointerDown: (e) => {
			e.currentTarget.setPointerCapture(e.pointerId), s({
				active: !0,
				x: e.clientX,
				y: e.clientY
			});
		},
		onPointerMove: (e) => {
			o.active && s({
				active: !0,
				x: e.clientX,
				y: e.clientY
			});
		},
		onPointerUp: (e) => {
			if (!o.active) return;
			let t = c.current;
			if (t) {
				let n = t.getBoundingClientRect();
				e.clientX >= n.left && e.clientX <= n.right && e.clientY >= n.top && e.clientY <= n.bottom && (d.current = !0, r(!0), v("Soap added. Good — now press Shake and watch closely."));
			}
			s({
				active: !1,
				x: 0,
				y: 0
			});
		}
	}, "🧼 Drag soap into the jar"), /* @__PURE__ */ e.createElement("button", {
		style: K.btn,
		onClick: () => {
			let e = c.current;
			if (e) {
				let t = e.clientWidth, n = e.clientHeight, r = t - 12, i = n - 12, a = (e) => {
					let t = [];
					for (let n = 0; n < e; n++) t.push({
						x: 14 + Math.random() * (r - 16),
						y: 14 + Math.random() * (i - 16),
						vx: (Math.random() - .5) * 4,
						vy: (Math.random() - .5) * 4,
						r: 5 + Math.random() * 2
					});
					return t;
				};
				g.current = a(34), _.current = d.current ? a(30) : [];
			}
			u.current = "shake", f.current = 120, v("Shaking — let us see what happens…");
		}
	}, "Shake"), /* @__PURE__ */ e.createElement("button", {
		style: K.btnGhost,
		onClick: () => {
			u.current = "sep", d.current = !1, h.current = [], g.current = [], _.current = [], r(!1), v("Macroscopic view: oil rests on water in two clean layers.");
		}
	}, "Reset")), /* @__PURE__ */ e.createElement("div", { style: K.hint }, "Run it as an experiment, in two steps: 1) Shake without soap and watch it re-separate. 2) Add soap, shake again, and see it hold.")));
}
var Ot = {
	borderRadius: 10,
	padding: "16px 40px 16px 18px",
	position: "relative"
}, K = {
	title: {
		fontSize: 22,
		fontWeight: 700,
		color: "var(--text-primary)"
	},
	left: {
		display: "flex",
		flexDirection: "column",
		gap: 14,
		minWidth: 0
	},
	right: {
		display: "flex",
		flexDirection: "column",
		gap: 12,
		minWidth: 0
	},
	corner: {
		position: "absolute",
		top: 10,
		right: 12,
		fontSize: 18,
		lineHeight: 1
	},
	plain: {
		padding: "2px 2px",
		minWidth: 0
	},
	plainHead: {
		fontSize: 16,
		fontWeight: 700,
		color: "var(--text-primary)",
		marginBottom: 8
	},
	cardHook: {
		...Ot,
		background: "var(--hook-soft)",
		borderLeft: "2px solid var(--hook)"
	},
	cardInsight: {
		...Ot,
		background: "var(--primary-softer)",
		border: "1px solid var(--primary-soft)",
		borderLeft: "2px solid var(--primary)"
	},
	cardSurprise: {
		...Ot,
		background: "var(--surprise-soft)",
		borderLeft: "2px solid var(--surprise)"
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
		lineHeight: 1.6,
		color: "var(--text-primary)",
		margin: "6px 0"
	},
	defRow: {
		display: "flex",
		alignItems: "baseline",
		gap: 10,
		margin: "8px 0",
		flexWrap: "wrap",
		minWidth: 0
	},
	tag: {
		fontSize: 12,
		fontWeight: 700,
		color: "var(--primary-text)",
		background: "var(--primary-soft)",
		borderRadius: 6,
		padding: "3px 8px",
		whiteSpace: "nowrap"
	},
	tag2: {
		fontSize: 12,
		fontWeight: 700,
		color: "var(--hook-text)",
		background: "var(--hook-soft)",
		borderRadius: 6,
		padding: "3px 8px",
		whiteSpace: "nowrap"
	},
	panelTitle: {
		fontSize: 16,
		fontWeight: 700,
		color: "var(--text-primary)"
	},
	readout: {
		fontWeight: 700,
		color: "var(--text-secondary)",
		textAlign: "center",
		fontSize: 14,
		minHeight: 20
	},
	controls: {
		display: "flex",
		gap: 10,
		flexWrap: "wrap",
		alignItems: "center",
		justifyContent: "center"
	},
	chip: {
		userSelect: "none",
		touchAction: "none",
		cursor: "grab",
		fontSize: 13,
		fontWeight: 700,
		color: "var(--accent-text)",
		background: "var(--accent-soft)",
		border: "1px dashed var(--accent)",
		borderRadius: 8,
		padding: "8px 12px"
	},
	soapBtn: {
		position: "relative",
		padding: 0,
		border: "1px solid var(--border)",
		borderRadius: 8,
		overflow: "hidden",
		cursor: "pointer",
		background: "transparent",
		width: 150,
		maxWidth: "100%",
		lineHeight: 0
	},
	soapImg: {
		display: "block",
		width: "100%",
		height: 84,
		objectFit: "cover"
	},
	soapLabel: {
		position: "absolute",
		top: 6,
		left: 8,
		color: "#fff",
		fontWeight: 700,
		fontSize: 14,
		textShadow: "0 1px 3px rgba(0,0,0,0.7)"
	},
	chipDone: {
		fontSize: 13,
		fontWeight: 700,
		color: "var(--primary-text)",
		background: "var(--primary-soft)",
		border: "1px solid var(--primary)",
		borderRadius: 8,
		padding: "8px 12px"
	},
	btn: {
		fontSize: 14,
		fontWeight: 700,
		color: "var(--primary-text)",
		background: "var(--primary)",
		border: "none",
		borderRadius: 8,
		padding: "8px 16px",
		cursor: "pointer"
	},
	btnGhost: {
		fontSize: 14,
		fontWeight: 700,
		color: "var(--text-secondary)",
		background: "var(--surface)",
		border: "1px solid var(--border-light)",
		borderRadius: 8,
		padding: "8px 14px",
		cursor: "pointer"
	},
	hint: {
		fontSize: 12,
		color: "var(--text-muted)",
		textAlign: "center",
		lineHeight: 1.5
	}
};
//#endregion
//#region ../tmp/nadi-slides-fd6e4518-99e0-414a-a92e-35da921944c5/Slide_t4-3.jsx
function kt({ studentName: t }) {
	let n = C(null), r = C(!1), i = C(0), [a, o] = w(!1), s = [
		{
			tag: "A",
			name: "Salt water",
			verdict: "Solution",
			note: "Nicely spotted: the path stays dark. The dissolved particles (< 1 nm) are too small to deflect light, so nothing scatters to your eye. Conclusion: solution.",
			kind: "solution"
		},
		{
			tag: "B",
			name: "Starch in water",
			verdict: "Colloid",
			note: "See that crisp glowing line? Mid-sized particles (1–1000 nm) scatter the light sideways toward you. Conclusion: colloid.",
			kind: "colloid"
		},
		{
			tag: "C",
			name: "Chalk in water",
			verdict: "Suspension",
			note: "A broad, cloudy, sparkly band tells the story: giant particles (> 1000 nm) scatter light strongly. Conclusion: suspension.",
			kind: "suspension"
		}
	];
	b(() => {
		let e = n.current;
		if (!e) return;
		let t = e.getContext("2d"), a;
		function o() {
			let n = e.getBoundingClientRect(), r = window.devicePixelRatio || 1;
			e.width = n.width * r, e.height = n.height * r, t.setTransform(r, 0, 0, r, 0, 0);
		}
		function c() {
			let n = e.clientWidth, o = e.clientHeight;
			t.clearRect(0, 0, n, o), t.fillStyle = "#0e1424", t.fillRect(0, 0, n, o);
			let d = performance.now(), f = r.current ? Math.min(1, (d - i.current) / 650) : 0, p = o / 3, m = n * .3, h = n * .8, g = h - m, _ = n * .13;
			for (let e = 0; e < 3; e++) {
				let n = p * (e + .5), i = n - p * .34, a = p * .68;
				if (t.fillStyle = "#444c63", t.fillRect(_ - 14, n - 7, 16, 14), t.fillStyle = r.current ? "#ff5a5a" : "#ff7070", t.beginPath(), t.arc(_ + 3, n, 4, 0, Math.PI * 2), t.fill(), u(t, _ + 3, n, m, n, 2, r.current ? "rgba(255,90,90,0.7)" : "rgba(255,90,90,0.4)"), t.strokeStyle = "rgba(180,200,230,0.5)", t.lineWidth = 2, t.strokeRect(m, i, g, a), t.fillStyle = s[e].kind === "suspension" && r.current ? "rgba(120,165,230,0.32)" : "rgba(120,165,230,0.18)", t.fillRect(m + 1, i + 1, g - 2, a - 2), r.current) {
					let r = m + g * f;
					if (s[e].kind === "solution") l(t, m, n, 5, "rgba(255,120,120,0.9)"), f >= 1 && l(t, h, n, 5, "rgba(255,150,150,0.7)"), u(t, _ + 3, n, m, n, 2, "rgba(255,90,90,0.55)");
					else if (s[e].kind === "colloid") {
						u(t, _ + 3, n, m, n, 2, "rgba(255,90,90,0.55)");
						let e = t.createLinearGradient(0, n - 4, 0, n + 4);
						e.addColorStop(0, "rgba(120,200,255,0)"), e.addColorStop(.5, "rgba(150,215,255,0.95)"), e.addColorStop(1, "rgba(120,200,255,0)"), t.fillStyle = e, t.fillRect(m, n - 4, r - m, 8), t.fillStyle = "rgba(220,245,255,0.95)", t.fillRect(m, n - 1, r - m, 2), l(t, r, n, 6, "rgba(180,225,255,0.9)");
					} else {
						u(t, _ + 3, n, m, n, 2, "rgba(255,90,90,0.55)");
						let e = t.createLinearGradient(0, n - 13, 0, n + 13);
						e.addColorStop(0, "rgba(180,210,255,0)"), e.addColorStop(.5, "rgba(190,215,255,0.55)"), e.addColorStop(1, "rgba(180,210,255,0)"), t.fillStyle = e, t.fillRect(m, n - 13, r - m, 26);
						let i = Math.floor((r - m) / 7);
						for (let e = 0; e < i; e++) {
							let e = m + Math.random() * (r - m), i = n + (Math.random() - .5) * 24;
							t.fillStyle = "rgba(235,245,255," + (.3 + Math.random() * .7).toFixed(2) + ")", t.beginPath(), t.arc(e, i, Math.random() * 1.6 + .5, 0, Math.PI * 2), t.fill();
						}
					}
				}
				t.fillStyle = "rgba(210,220,240,0.85)", t.font = "700 13px Outfit, sans-serif", t.textBaseline = "middle", t.fillText("Liquid " + s[e].tag, m + 6, i - 9 + 0);
			}
			a = requestAnimationFrame(c);
		}
		function l(e, t, n, r, i) {
			let a = e.createRadialGradient(t, n, 0, t, n, r);
			a.addColorStop(0, i), a.addColorStop(1, "rgba(0,0,0,0)"), e.fillStyle = a, e.beginPath(), e.arc(t, n, r, 0, Math.PI * 2), e.fill();
		}
		function u(e, t, n, r, i, a, o) {
			e.strokeStyle = o, e.lineWidth = a, e.beginPath(), e.moveTo(t, n), e.lineTo(r, i), e.stroke();
		}
		o(), c();
		let d = new ResizeObserver(() => o());
		return d.observe(e), () => {
			cancelAnimationFrame(a), d.disconnect();
		};
	}, []);
	function c() {
		r.current = !0, i.current = performance.now(), o(!0);
	}
	function l() {
		r.current = !1, o(!1);
	}
	return /* @__PURE__ */ e.createElement(e.Fragment, null, /* @__PURE__ */ e.createElement("div", {
		className: "slide-title",
		style: q.title
	}, "The Beam that Unmasks: The Tyndall Effect"), /* @__PURE__ */ e.createElement("div", {
		className: "slide-left",
		style: q.left
	}, /* @__PURE__ */ e.createElement("div", { style: q.cardHook }, /* @__PURE__ */ e.createElement("span", { style: q.corner }, "💭"), /* @__PURE__ */ e.createElement("p", { style: q.hookText }, t, ", don't worry if this feels slippery at first — telling these mixtures apart is a skill, and you're about to build it. A glass of dilute starch water and a glass of salt water can look exactly the same: clear and colourless. In C4.1 your eyes simply couldn't decide. So let's reason it out — how would you prove one is hiding particles?")), /* @__PURE__ */ e.createElement("div", { style: q.plain }, /* @__PURE__ */ e.createElement("div", { style: q.plainHead }, "The test: a clear, two-step procedure"), /* @__PURE__ */ e.createElement("p", { style: q.body }, "Let's be methodical. The Tyndall test is just two reliable steps:"), /* @__PURE__ */ e.createElement("ol", { style: q.ul }, /* @__PURE__ */ e.createElement("li", null, /* @__PURE__ */ e.createElement("b", null, "Step 1 —"), " shine a narrow, strong beam (a laser) through the liquid."), /* @__PURE__ */ e.createElement("li", null, /* @__PURE__ */ e.createElement("b", null, "Step 2 —"), " look from the ", /* @__PURE__ */ e.createElement("b", null, "side"), ", not down the beam.")), /* @__PURE__ */ e.createElement("p", { style: q.bodyGap }, "Now read the macroscopic result:"), /* @__PURE__ */ e.createElement("ul", { style: q.ul }, /* @__PURE__ */ e.createElement("li", null, /* @__PURE__ */ e.createElement("b", null, "Solution:"), " you see nothing — the beam's path is invisible."), /* @__PURE__ */ e.createElement("li", null, /* @__PURE__ */ e.createElement("b", null, "Colloid / suspension:"), " the path lights up — you can trace the beam straight through."))), /* @__PURE__ */ e.createElement("div", { style: q.cardInsight }, /* @__PURE__ */ e.createElement("span", { style: q.corner }, "💡"), /* @__PURE__ */ e.createElement("p", { style: q.body }, "From macro to micro, it all comes down to size: the beam only shows up when particles are big enough to bounce light sideways toward your eye."), /* @__PURE__ */ e.createElement("div", { style: q.ruler }, /* @__PURE__ */ e.createElement("div", { style: q.rcell }, /* @__PURE__ */ e.createElement("div", { style: q.rk }, "Solution"), /* @__PURE__ */ e.createElement("div", { style: q.rv }, "< 1 nm"), /* @__PURE__ */ e.createElement("div", { style: q.rn }, "too small — no scatter")), /* @__PURE__ */ e.createElement("div", { style: q.rcell }, /* @__PURE__ */ e.createElement("div", { style: q.rk }, "Colloid"), /* @__PURE__ */ e.createElement("div", { style: q.rv }, "1–1000 nm"), /* @__PURE__ */ e.createElement("div", { style: q.rn }, "scatters — beam shows")), /* @__PURE__ */ e.createElement("div", { style: q.rcell }, /* @__PURE__ */ e.createElement("div", { style: q.rk }, "Suspension"), /* @__PURE__ */ e.createElement("div", { style: q.rv }, "> 1000 nm"), /* @__PURE__ */ e.createElement("div", { style: q.rn }, "scatters strongly")))), /* @__PURE__ */ e.createElement("div", { style: q.plain }, /* @__PURE__ */ e.createElement("div", { style: q.plainHead }, "You already know this one"), /* @__PURE__ */ e.createElement("p", { style: q.body }, "You've met the Tyndall effect many times without naming it. Headlights in fog, a cinema projector beam, sunbeams through a dusty window — those visible \"rays\" are simply light scattering off tiny floating particles. Same physics, no laser required.")), /* @__PURE__ */ e.createElement("div", { style: q.cardSurprise }, /* @__PURE__ */ e.createElement("span", { style: q.corner }, "🤯"), /* @__PURE__ */ e.createElement("p", { style: q.body }, "Good critical question to ask: \"if molecules don't scatter, why is the sky blue?\" That's ", /* @__PURE__ */ e.createElement("b", null, "Rayleigh scattering"), " — air molecules scatter blue light most. Keep the terms precise: it's a ", /* @__PURE__ */ e.createElement("i", null, "cousin"), " of Tyndall, related but not identical (the full mechanism sits beyond our syllabus).")), /* @__PURE__ */ e.createElement("div", { style: q.cardPitfall }, /* @__PURE__ */ e.createElement("span", { style: q.corner }, "⚠️"), /* @__PURE__ */ e.createElement("p", { style: q.body }, "It's an easy trap, so flag it now: \"looks clear\" does ", /* @__PURE__ */ e.createElement("b", null, "not"), " mean \"solution\". A colloid can look perfectly clear too — trust the Tyndall test, not your first glance."))), /* @__PURE__ */ e.createElement("div", {
		className: "slide-right",
		style: q.right
	}, /* @__PURE__ */ e.createElement("div", { style: q.panelTitle }, "The Laser Probe"), /* @__PURE__ */ e.createElement("p", { style: q.caption }, "Three liquids, all looking equally clear. Run the test like a scientist: fire one laser through all three, observe carefully from the side, then decide."), /* @__PURE__ */ e.createElement("canvas", {
		ref: n,
		style: q.canvas
	}), /* @__PURE__ */ e.createElement("div", {
		style: {
			...q.fireImgWrap,
			...a ? q.fireImgWrapPressed : q.fireImgWrapRaised
		},
		onClick: a ? l : c,
		role: "button",
		tabIndex: 0,
		onKeyDown: (e) => {
			(e.key === "Enter" || e.key === " ") && (a ? l : c)();
		}
	}, /* @__PURE__ */ e.createElement("img", {
		src: "https://starkhorn.nadilearning.com/files/slide-assets/b7953a8a-5277-46bd-aec3-8bc8576a1f49/04bc150d-0de9-4672-ae13-65730c09b72d.jpg",
		alt: "Laser beams",
		style: {
			...q.fireImg,
			filter: a ? "brightness(0.55)" : "brightness(1)"
		}
	}), /* @__PURE__ */ e.createElement("span", { style: {
		...q.fireOverlay,
		opacity: a ? .6 : 1
	} }, "FIRE")), /* @__PURE__ */ e.createElement("div", { style: q.videoLabel }, "🎬 Watch it in action"), /* @__PURE__ */ e.createElement("iframe", {
		style: q.video,
		src: "https://www.youtube.com/embed/sZ0iFoJP4mo",
		title: "The Tyndall effect demonstration",
		allow: "accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture",
		allowFullScreen: !0
	}), a ? /* @__PURE__ */ e.createElement("div", { style: q.verdicts }, s.map((t) => /* @__PURE__ */ e.createElement("div", {
		key: t.tag,
		style: q.vcard
	}, /* @__PURE__ */ e.createElement("div", { style: q.vhead }, /* @__PURE__ */ e.createElement("span", { style: q.vtag }, t.tag), /* @__PURE__ */ e.createElement("span", { style: q.vname }, t.name), /* @__PURE__ */ e.createElement("span", { style: t.kind === "solution" ? q.vbadgeGrey : q.vbadge }, t.verdict)), /* @__PURE__ */ e.createElement("p", { style: q.vnote }, t.note)))) : /* @__PURE__ */ e.createElement("div", { style: q.lockRow }, /* @__PURE__ */ e.createElement("span", { style: q.lock }, "🔒"), /* @__PURE__ */ e.createElement("span", { style: q.lockText }, "Fire the beam, observe from the side, then classify each liquid →"))));
}
var At = {
	borderRadius: 10,
	padding: "14px 18px",
	position: "relative"
}, q = {
	title: {
		fontSize: 22,
		fontWeight: 700,
		color: "var(--text-primary)"
	},
	left: {
		display: "flex",
		flexDirection: "column",
		gap: 14,
		minWidth: 0
	},
	right: {
		display: "flex",
		flexDirection: "column",
		gap: 12,
		minWidth: 0
	},
	corner: {
		position: "absolute",
		top: 10,
		right: 12,
		fontSize: 16,
		lineHeight: 1
	},
	cardHook: {
		...At,
		background: "var(--hook-soft)",
		borderLeft: "2px solid var(--hook)"
	},
	cardInsight: {
		...At,
		background: "var(--primary-softer)",
		border: "1px solid var(--primary-soft)",
		borderLeft: "2px solid var(--primary)"
	},
	cardPitfall: {
		...At,
		background: "var(--accent-soft)",
		borderLeft: "2px solid var(--accent)"
	},
	cardSurprise: {
		...At,
		background: "var(--surprise-soft)",
		borderLeft: "2px solid var(--surprise)"
	},
	plain: { minWidth: 0 },
	plainHead: {
		fontSize: 15,
		fontWeight: 700,
		color: "var(--text-primary)",
		marginBottom: 6
	},
	hookText: {
		fontSize: 15,
		lineHeight: 1.65,
		color: "var(--text-primary)",
		fontStyle: "italic",
		margin: 0,
		paddingRight: 22
	},
	body: {
		fontSize: 15,
		lineHeight: 1.6,
		color: "var(--text-primary)",
		margin: 0,
		paddingRight: 22
	},
	bodyGap: {
		fontSize: 15,
		lineHeight: 1.6,
		color: "var(--text-primary)",
		margin: "10px 0 0"
	},
	ul: {
		fontSize: 15,
		lineHeight: 1.6,
		color: "var(--text-primary)",
		margin: "8px 0 0",
		paddingLeft: 20
	},
	ruler: {
		display: "flex",
		gap: 8,
		marginTop: 12
	},
	rcell: {
		flex: 1,
		minWidth: 0,
		background: "var(--surface)",
		border: "1px solid var(--border-light)",
		borderRadius: 8,
		padding: "8px 6px",
		textAlign: "center",
		boxSizing: "border-box"
	},
	rk: {
		fontSize: 12,
		fontWeight: 700,
		color: "var(--primary)"
	},
	rv: {
		fontSize: 13,
		fontWeight: 700,
		color: "var(--text-primary)",
		margin: "3px 0"
	},
	rn: {
		fontSize: 11,
		color: "var(--text-muted)",
		lineHeight: 1.3
	},
	panelTitle: {
		fontSize: 16,
		fontWeight: 700,
		color: "var(--text-primary)"
	},
	caption: {
		fontSize: 13,
		color: "var(--text-secondary)",
		margin: 0,
		lineHeight: 1.5
	},
	canvas: {
		width: "100%",
		aspectRatio: "4 / 3",
		maxHeight: "42vh",
		display: "block",
		borderRadius: 10,
		border: "1px solid var(--border-light)"
	},
	btn: {
		width: "100%",
		padding: "12px 16px",
		fontSize: 15,
		fontWeight: 700,
		fontFamily: "Outfit, sans-serif",
		color: "var(--primary-text)",
		background: "var(--primary)",
		border: "none",
		borderRadius: 10,
		cursor: "pointer"
	},
	btnReset: {
		width: "100%",
		padding: "12px 16px",
		fontSize: 15,
		fontWeight: 700,
		fontFamily: "Outfit, sans-serif",
		color: "var(--text-secondary)",
		background: "var(--surface)",
		border: "1px solid var(--border)",
		borderRadius: 10,
		cursor: "pointer"
	},
	lockRow: {
		display: "flex",
		alignItems: "center",
		gap: 8,
		justifyContent: "center",
		padding: "10px",
		color: "var(--text-muted)"
	},
	lock: { fontSize: 16 },
	lockText: {
		fontSize: 13,
		fontWeight: 600
	},
	verdicts: {
		display: "flex",
		flexDirection: "column",
		gap: 8
	},
	vcard: {
		background: "var(--surface)",
		border: "1px solid var(--border-light)",
		borderRadius: 8,
		padding: "10px 12px"
	},
	vhead: {
		display: "flex",
		alignItems: "center",
		gap: 8,
		flexWrap: "wrap"
	},
	vtag: {
		display: "inline-flex",
		alignItems: "center",
		justifyContent: "center",
		width: 22,
		height: 22,
		borderRadius: 5,
		fontSize: 12,
		fontWeight: 700,
		background: "var(--primary-softer)",
		color: "var(--primary)",
		flexShrink: 0
	},
	vname: {
		fontSize: 14,
		fontWeight: 700,
		color: "var(--text-primary)",
		flex: 1,
		minWidth: 0
	},
	vbadge: {
		fontSize: 12,
		fontWeight: 700,
		color: "var(--primary-text)",
		background: "var(--primary)",
		borderRadius: 6,
		padding: "2px 8px"
	},
	vbadgeGrey: {
		fontSize: 12,
		fontWeight: 700,
		color: "var(--text-secondary)",
		background: "var(--surface-raised)",
		border: "1px solid var(--border)",
		borderRadius: 6,
		padding: "2px 8px"
	},
	vnote: {
		fontSize: 13,
		lineHeight: 1.5,
		color: "var(--text-secondary)",
		margin: "6px 0 0"
	},
	fireImgWrap: {
		position: "relative",
		alignSelf: "center",
		width: 120,
		borderRadius: 8,
		overflow: "hidden",
		cursor: "pointer",
		border: "1px solid var(--border-light)",
		display: "block",
		transition: "transform 0.12s ease, box-shadow 0.12s ease, filter 0.12s ease"
	},
	fireImgWrapRaised: {
		transform: "translateY(0) scale(1)",
		boxShadow: "0 3px 6px rgba(0,0,0,0.35)"
	},
	fireImgWrapPressed: {
		transform: "translateY(2px) scale(0.97)",
		boxShadow: "inset 0 2px 6px rgba(0,0,0,0.7)"
	},
	fireImg: {
		width: "100%",
		height: 34,
		objectFit: "cover",
		display: "block"
	},
	fireOverlay: {
		position: "absolute",
		top: 0,
		left: 0,
		right: 0,
		bottom: 0,
		display: "flex",
		alignItems: "center",
		justifyContent: "center",
		textAlign: "center",
		color: "#ffffff",
		fontSize: 14,
		fontWeight: 800,
		letterSpacing: 1,
		fontFamily: "Outfit, sans-serif",
		textShadow: "0 1px 6px rgba(0,0,0,0.9)",
		boxSizing: "border-box"
	},
	videoLabel: {
		fontSize: 14,
		fontWeight: 700,
		color: "var(--text-primary)",
		marginTop: 4
	},
	video: {
		width: "100%",
		aspectRatio: "16 / 9",
		display: "block",
		border: "1px solid var(--border-light)",
		borderRadius: 10
	}
};
//#endregion
//#region ../tmp/nadi-slides-fd6e4518-99e0-414a-a92e-35da921944c5/Slide_t5-4.jsx
function jt({ studentName: t }) {
	let [n, r] = w([
		{
			name: "Yellow",
			color: "#e8b500",
			affinity: 25
		},
		{
			name: "Red",
			color: "#d2384f",
			affinity: 55
		},
		{
			name: "Blue",
			color: "#2f6fd0",
			affinity: 82
		}
	]), [i, a] = w("idle"), o = C(0), s = C(null), c = C(null), l = C(n), u = C(i);
	l.current = n, u.current = i;
	let d = (e, t) => {
		r((n) => n.map((n, r) => r === e ? {
			...n,
			affinity: 100 - t
		} : n));
	}, f = () => {
		u.current !== "running" && (o.current = 0, a("running"));
	}, p = () => {
		cancelAnimationFrame(s.current), o.current = 0, a("idle");
	}, m = (e) => Math.max(.04, 1 - e / 100), h = (e) => {
		let t = e.replace("#", "");
		return parseInt(t.slice(0, 2), 16) + "," + parseInt(t.slice(2, 4), 16) + "," + parseInt(t.slice(4, 6), 16);
	};
	b(() => {
		if (i !== "running") return;
		let e = performance.now(), t = (n) => {
			let r = (n - e) / 1e3;
			if (e = n, o.current = Math.min(1, o.current + r / 3.2), g(), o.current >= 1) {
				a("done");
				return;
			}
			s.current = requestAnimationFrame(t);
		};
		return s.current = requestAnimationFrame(t), () => cancelAnimationFrame(s.current);
	}, [i]);
	let g = () => {
		let e = c.current;
		if (!e) return;
		let t = e.getContext("2d"), n = e.getBoundingClientRect(), r = window.devicePixelRatio || 1;
		(e.width !== Math.round(n.width * r) || e.height !== Math.round(n.height * r)) && (e.width = n.width * r, e.height = n.height * r), t.setTransform(r, 0, 0, r, 0, 0);
		let i = e.clientWidth, a = e.clientHeight;
		t.clearRect(0, 0, i, a);
		let s = Math.min(150, i * .5), d = (i - s) / 2, f = a - 30, p = f - 18, g = f - 14, _ = (g - 18 - 6) * .75, v = u.current === "idle" ? 0 : o.current, y = g - _ * v;
		t.fillStyle = "#ffffff", t.fillRect(d, 18, s, p), t.fillStyle = "#eaf2fb", t.fillRect(d, y, s, g - y), t.fillStyle = "#bcdcf5", t.fillRect(d - 6, g, s + 12, f - g), t.strokeStyle = "#c2ccd8", t.lineWidth = 1.5, t.strokeRect(d, 18, s, p), t.strokeStyle = "rgba(45,111,208,0.85)", t.setLineDash([5, 4]), t.beginPath(), t.moveTo(d, y), t.lineTo(d + s, y), t.stroke(), t.setLineDash([]), t.strokeStyle = "#9aa6b4", t.beginPath(), t.moveTo(d, g), t.lineTo(d + s, g), t.stroke();
		let b = l.current, x = d + s / 2, S = (e, n, r, i, a) => {
			let o = t.createRadialGradient(e, n, 0, e, n, r);
			o.addColorStop(0, "rgba(" + a + ",0.95)"), o.addColorStop(.5, "rgba(" + a + ",0.5)"), o.addColorStop(1, "rgba(" + a + ",0)"), t.fillStyle = o, t.beginPath(), t.ellipse(e, n, r, i, 0, 0, Math.PI * 2), t.fill();
		};
		if (v === 0) S(x, g - 7, s * .24, 10, "26,30,38"), t.fillStyle = "#5a6b80", t.font = "600 12px Outfit, sans-serif", t.textAlign = "center", t.fillText("black spot", x, g + 20);
		else {
			let e = g - 7;
			b.forEach((n) => {
				let r = _ * m(n.affinity) * v, i = e - r, a = h(n.color);
				if (r > 1) {
					let n = s * .11, r = t.createLinearGradient(0, i, 0, e);
					r.addColorStop(0, "rgba(" + a + ",0.30)"), r.addColorStop(1, "rgba(" + a + ",0)"), t.fillStyle = r, t.fillRect(x - n, i, n * 2, e - i);
				}
				S(x, i, s * .22, 8, a);
			});
		}
		t.fillStyle = "#5a6b80", t.font = "600 11px Outfit, sans-serif", t.textAlign = "left", t.fillText("solvent front", d + 2, y - 5 > 26 ? y - 5 : 28);
	};
	b(() => {
		g();
		let e = new ResizeObserver(() => g());
		return c.current && e.observe(c.current), () => e.disconnect();
	}, []), b(() => {
		i !== "running" && g();
	}, [n, i]);
	let _ = [...n].sort((e, t) => e.affinity - t.affinity);
	return /* @__PURE__ */ e.createElement(e.Fragment, null, /* @__PURE__ */ e.createElement("div", {
		className: "slide-title",
		style: J.title
	}, "Chromatography: Separation by Speed & Stickiness"), /* @__PURE__ */ e.createElement("div", {
		className: "slide-left",
		style: J.left
	}, /* @__PURE__ */ e.createElement("div", { style: J.cardHook }, /* @__PURE__ */ e.createElement("span", { style: J.cornerBadge }, "💭"), /* @__PURE__ */ e.createElement("p", { style: J.hookText }, t, ", here's a fair question to sit with. Two substances can boil at nearly the same temperature and dissolve just as readily — so every handle we've trained on so far comes up empty. Don't worry: a chemist meets this exact wall all the time. Let's work out, step by step, how labs still pull them apart.")), /* @__PURE__ */ e.createElement("div", { style: J.plain }, /* @__PURE__ */ e.createElement("div", { style: J.hCard }, "The hidden handle: affinity"), /* @__PURE__ */ e.createElement("p", { style: J.body }, "When boiling point and solubility are too alike to grab, we reach for a subtler property — and precise vocabulary matters here. ", /* @__PURE__ */ e.createElement("b", null, "Affinity"), " is how strongly each component is attracted to, and clings to, a surface. ", /* @__PURE__ */ e.createElement("b", null, "Macroscopically"), " you see nothing; ", /* @__PURE__ */ e.createElement("b", null, "microscopically"), ", some molecules are gripped tightly by the surface while others slip back into the moving liquid. That molecular tug-of-war is our handle.")), /* @__PURE__ */ e.createElement("div", { style: J.plain }, /* @__PURE__ */ e.createElement("div", { style: J.hCard }, "Two phases set up a race"), /* @__PURE__ */ e.createElement("p", { style: J.body }, /* @__PURE__ */ e.createElement("b", null, "Stationary phase"), " — a phase fixed in place, either packed in a column or spread on a planar surface (e.g. paper). The \"sticky floor.\""), /* @__PURE__ */ e.createElement("hr", { style: J.hr }), /* @__PURE__ */ e.createElement("p", { style: J.body }, /* @__PURE__ */ e.createElement("b", null, "Mobile phase"), " — a phase that moves over or through the stationary phase, carrying the mixture with it. It may be a ", /* @__PURE__ */ e.createElement("b", null, "gas, a liquid, or a supercritical fluid"), ". The \"flowing stream.\"")), /* @__PURE__ */ e.createElement("div", { style: J.cardInsight }, /* @__PURE__ */ e.createElement("span", { style: J.cornerBadge }, "💡"), /* @__PURE__ */ e.createElement("p", { style: J.body }, "Master this one logical chain and the whole method falls into place. Read it as the ", /* @__PURE__ */ e.createElement("b", null, "symbolic"), " summary of the molecular story: different ", /* @__PURE__ */ e.createElement("b", null, "affinity"), " → different ", /* @__PURE__ */ e.createElement("b", null, "speed"), " → different ", /* @__PURE__ */ e.createElement("b", null, "position"), " → ", /* @__PURE__ */ e.createElement("b", null, "separated"), ". Step by step: a molecule that grips the surface keeps pausing and lags behind; one that prefers the solvent rides the stream and races ahead.")), /* @__PURE__ */ e.createElement("div", { style: J.cardSurprise }, /* @__PURE__ */ e.createElement("span", { style: J.cornerBadge }, "🤯"), /* @__PURE__ */ e.createElement("p", { style: J.body }, "In 1906 Mikhail Tswett poured a spinach extract through a glass tube packed with chalk — and watched it split into separate green and yellow bands. Same idea, vertical column: it now underpins modern medicine, biology and chemistry.")), /* @__PURE__ */ e.createElement("div", { style: J.cardPitfall }, /* @__PURE__ */ e.createElement("span", { style: J.cornerBadge }, "⚠️"), /* @__PURE__ */ e.createElement("p", { style: J.body }, "Here's where many slip, so lock it in carefully. Sticks to the floor (high affinity) → slowest → travels least → comes out ", /* @__PURE__ */ e.createElement("b", null, "last"), ". Stays in the stream (low affinity) → fastest → travels most → comes out ", /* @__PURE__ */ e.createElement("b", null, "first"), ". The trap: \"sticky = fast.\" It's the opposite — gripping the surface holds a molecule ", /* @__PURE__ */ e.createElement("b", null, "back"), "."))), /* @__PURE__ */ e.createElement("div", {
		className: "slide-right",
		style: J.right
	}, /* @__PURE__ */ e.createElement("style", null, "\n          .vSlider::-webkit-slider-runnable-track { width: 7px; height: 100%; border-radius: 4px; background: #c9ccd1; }\n          .vSlider::-moz-range-track { width: 7px; height: 100%; border-radius: 4px; background: #c9ccd1; }\n          .vSlider::-webkit-slider-thumb { -webkit-appearance: none; appearance: none; width: 18px; height: 18px; border-radius: 50%; background: var(--thumb); border: 2px solid #ffffff; box-shadow: 0 0 0 1px rgba(0,0,0,0.15); margin-left: -6px; }\n          .vSlider::-moz-range-thumb { width: 18px; height: 18px; border-radius: 50%; background: var(--thumb); border: 2px solid #ffffff; }\n          .vSlider:disabled { opacity: 0.55; cursor: default; }\n        "), /* @__PURE__ */ e.createElement("div", { style: J.panelTitle }, "Run the paper race"), /* @__PURE__ */ e.createElement("p", { style: J.caption }, "Let's reason it out before we run it. Slide each pigment up for more ", /* @__PURE__ */ e.createElement("b", null, "slippery"), " (low affinity) or down for more ", /* @__PURE__ */ e.createElement("b", null, "sticky"), " (high affinity), predict the order, then release the solvent. One black spot at the start (macroscopic) — three molecular speeds underneath."), /* @__PURE__ */ e.createElement("div", { style: J.stage }, /* @__PURE__ */ e.createElement("canvas", {
		ref: c,
		style: J.canvas
	}), /* @__PURE__ */ e.createElement("div", { style: J.sliderBank }, /* @__PURE__ */ e.createElement("div", { style: J.axisTop }, "↑ slippery"), /* @__PURE__ */ e.createElement("div", { style: J.bankRow }, n.map((t, n) => {
		let r = 100 - t.affinity, a = t.affinity < 40 ? "slippery" : t.affinity > 70 ? "sticky" : "medium";
		return /* @__PURE__ */ e.createElement("div", {
			key: t.name,
			style: J.vCol
		}, /* @__PURE__ */ e.createElement("input", {
			type: "range",
			min: 5,
			max: 95,
			value: r,
			onChange: (e) => d(n, Number(e.target.value)),
			disabled: i === "running",
			orient: "vertical",
			className: "vSlider",
			style: {
				...J.vSlider,
				"--thumb": t.name === "Yellow" ? "#d4a017" : t.color
			}
		}), /* @__PURE__ */ e.createElement("span", { style: J.vName }, t.name), /* @__PURE__ */ e.createElement("span", { style: J.vDesc }, a));
	})), /* @__PURE__ */ e.createElement("div", { style: J.axisBot }, "↓ sticky"))), /* @__PURE__ */ e.createElement("div", { style: J.btnRow }, /* @__PURE__ */ e.createElement("button", {
		onClick: f,
		disabled: i === "running",
		style: {
			...J.btn,
			...i === "running" ? J.btnOff : {}
		}
	}, i === "done" ? "Run again" : "▶ Run solvent"), /* @__PURE__ */ e.createElement("button", {
		onClick: p,
		style: J.btnGhost
	}, "Reset")), /* @__PURE__ */ e.createElement("div", { style: J.readout }, i === "done" ? /* @__PURE__ */ e.createElement(e.Fragment, null, "Nicely done. Finishing order (front → baseline): ", /* @__PURE__ */ e.createElement("b", null, _.map((e) => e.name).join(" · ")), ". Notice the logic held: the most slippery pigment travelled furthest, the stickiest lagged behind — exactly as the chain predicts.") : i === "running" ? "Watch closely — the molecules are sorting themselves by speed…" : "Think it through first: the most slippery (slider highest) should race to the front, the stickiest should hang back near the start line. Run it and check your prediction."), /* @__PURE__ */ e.createElement("div", { style: J.videoLabel }, "See it for real — black ink fanning into its hidden pigments:"), /* @__PURE__ */ e.createElement("div", { style: J.videoWrap }, /* @__PURE__ */ e.createElement("iframe", {
		style: J.video,
		src: "https://www.youtube.com/embed/XJYHKsURwGw",
		title: "Chromatography in action",
		frameBorder: "0",
		allow: "accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture",
		allowFullScreen: !0
	}))));
}
var Mt = {
	background: "var(--surface-raised)",
	border: "1px solid var(--border-light)",
	borderRadius: 10,
	padding: "14px 18px",
	boxSizing: "border-box"
}, J = {
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
	plain: {
		padding: "2px 2px",
		minWidth: 0
	},
	cornerBadge: {
		position: "absolute",
		top: 10,
		right: 12,
		fontSize: 16,
		lineHeight: 1,
		opacity: .8
	},
	cardHook: {
		...Mt,
		background: "var(--hook-soft)",
		borderLeft: "2px solid var(--hook)",
		position: "relative",
		paddingRight: 38
	},
	cardInsight: {
		...Mt,
		background: "var(--primary-softer)",
		borderColor: "var(--primary-soft)",
		borderLeft: "2px solid var(--primary)",
		position: "relative",
		paddingRight: 38
	},
	cardPitfall: {
		...Mt,
		background: "var(--accent-soft)",
		borderLeft: "2px solid var(--accent)",
		position: "relative",
		paddingRight: 38
	},
	cardSurprise: {
		...Mt,
		background: "var(--surprise-soft)",
		borderLeft: "2px solid var(--surprise)",
		position: "relative",
		paddingRight: 38
	},
	hCard: {
		fontSize: 14,
		fontWeight: 700,
		color: "var(--primary)",
		marginBottom: 8
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
		lineHeight: 1.6,
		color: "var(--text-primary)",
		margin: 0
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
	caption: {
		fontSize: 13,
		color: "var(--text-muted)",
		margin: 0,
		lineHeight: 1.5
	},
	stage: {
		display: "flex",
		gap: 14,
		alignItems: "center",
		minWidth: 0
	},
	canvas: {
		flex: 1,
		minWidth: 0,
		aspectRatio: "4 / 5",
		maxHeight: "46vh",
		display: "block",
		background: "#eef2f7",
		borderRadius: 10,
		border: "1px solid var(--border-light)"
	},
	sliderBank: {
		display: "flex",
		flexDirection: "column",
		alignItems: "center",
		gap: 6,
		flexShrink: 0
	},
	axisTop: {
		fontSize: 11,
		fontWeight: 700,
		color: "var(--text-muted)"
	},
	axisBot: {
		fontSize: 11,
		fontWeight: 700,
		color: "var(--text-muted)"
	},
	bankRow: {
		display: "flex",
		gap: 14,
		alignItems: "flex-start"
	},
	vCol: {
		display: "flex",
		flexDirection: "column",
		alignItems: "center",
		gap: 5,
		minWidth: 0
	},
	vSlider: {
		writingMode: "vertical-lr",
		direction: "rtl",
		width: 26,
		height: 200,
		margin: 0,
		cursor: "pointer",
		WebkitAppearance: "none",
		appearance: "none",
		background: "transparent"
	},
	dot: {
		width: 14,
		height: 14,
		borderRadius: "50%",
		flexShrink: 0
	},
	vName: {
		fontSize: 12,
		fontWeight: 700,
		color: "var(--text-primary)"
	},
	vDesc: {
		fontSize: 11,
		color: "var(--text-muted)",
		width: 56,
		textAlign: "center",
		whiteSpace: "nowrap"
	},
	btnRow: {
		display: "flex",
		gap: 10
	},
	btn: {
		flex: 1,
		padding: "10px 14px",
		borderRadius: 8,
		border: "none",
		background: "var(--primary)",
		color: "var(--primary-text)",
		fontWeight: 700,
		fontSize: 14,
		cursor: "pointer",
		fontFamily: "inherit"
	},
	btnOff: {
		opacity: .5,
		cursor: "default"
	},
	btnGhost: {
		padding: "10px 14px",
		borderRadius: 8,
		border: "1px solid var(--border)",
		background: "var(--surface)",
		color: "var(--text-secondary)",
		fontWeight: 600,
		fontSize: 14,
		cursor: "pointer",
		fontFamily: "inherit"
	},
	readout: {
		fontSize: 14,
		lineHeight: 1.5,
		color: "var(--text-secondary)",
		textAlign: "center",
		background: "var(--surface)",
		border: "1px solid var(--border-light)",
		borderRadius: 8,
		padding: "10px 12px"
	},
	videoLabel: {
		fontSize: 13,
		fontWeight: 600,
		color: "var(--text-secondary)",
		marginTop: 4
	},
	videoWrap: {
		position: "relative",
		width: "100%",
		aspectRatio: "16 / 9",
		borderRadius: 10,
		overflow: "hidden",
		border: "1px solid var(--border-light)"
	},
	video: {
		position: "absolute",
		inset: 0,
		width: "100%",
		height: "100%",
		border: "none"
	}
};
//#endregion
//#region ../tmp/nadi-slides-fd6e4518-99e0-414a-a92e-35da921944c5/Slide_t5-6.jsx
function Nt({ studentName: t }) {
	let [n, r] = w(null), [i, a] = w({
		macro: !1,
		micro: !1,
		strat: !1
	}), o = [
		{
			id: "a",
			text: "Both camphor and sand rise as vapour",
			ok: !1
		},
		{
			id: "b",
			text: "Camphor rises as vapour; sand stays in the dish",
			ok: !0
		},
		{
			id: "c",
			text: "The camphor first melts into a puddle, then boils away",
			ok: !1
		}
	], s = o.find((e) => e.id === n), c = (e) => a((t) => ({
		...t,
		[e]: !t[e]
	})), l = Object.values(i).filter(Boolean).length;
	return /* @__PURE__ */ e.createElement(e.Fragment, null, /* @__PURE__ */ e.createElement("div", {
		className: "slide-title",
		style: Y.title
	}, "Sublimation: The Great Escape from Solid to Vapour"), /* @__PURE__ */ e.createElement("div", {
		className: "slide-left",
		style: Y.left
	}, /* @__PURE__ */ e.createElement("div", { style: Y.cardHook }, /* @__PURE__ */ e.createElement("div", { style: Y.row }, /* @__PURE__ */ e.createElement("span", { style: Y.badge }, "💭"), /* @__PURE__ */ e.createElement("span", { style: Y.hHook }, "Think about this")), /* @__PURE__ */ e.createElement("p", { style: Y.hookText }, t, ", here's a genuine puzzle worth your curiosity: dry ice never leaves a puddle — it simply \"disappears\" into fog. Before we name it, think like a scientist: how can a solid leave without ever passing through the liquid stage?")), /* @__PURE__ */ e.createElement("div", { style: Y.card }, /* @__PURE__ */ e.createElement("div", { style: Y.hCard }, "The \"skip\" move"), /* @__PURE__ */ e.createElement("p", { style: Y.body }, "Stay with the new vocabulary — it pays off. ", /* @__PURE__ */ e.createElement("b", null, "Macroscopic view (what you see):"), " most solids take the long road. A select few skip the middle step entirely on gentle heating. ", /* @__PURE__ */ e.createElement("b", null, "Microscopic view (the molecules):"), " their particles gain enough energy to break free as vapour without first loosening into a liquid."), /* @__PURE__ */ e.createElement("div", { style: Y.phaseRow }, /* @__PURE__ */ e.createElement("span", { style: Y.chip }, "Solid"), /* @__PURE__ */ e.createElement("span", { style: Y.arrowMute }, "→"), /* @__PURE__ */ e.createElement("span", { style: Y.chipStruck }, "Liquid"), /* @__PURE__ */ e.createElement("span", { style: Y.arrowMute }, "→"), /* @__PURE__ */ e.createElement("span", { style: Y.chip }, "Vapour")), /* @__PURE__ */ e.createElement("div", { style: Y.phaseRow }, /* @__PURE__ */ e.createElement("span", { style: Y.chipOk }, "Solid"), /* @__PURE__ */ e.createElement("span", { style: Y.arrowGo }, "───── sublimation ─────▶"), /* @__PURE__ */ e.createElement("span", { style: Y.chipOk }, "Vapour"))), /* @__PURE__ */ e.createElement("div", { style: Y.card }, /* @__PURE__ */ e.createElement("div", { style: Y.hCard }, "The return trip: deposition"), /* @__PURE__ */ e.createElement("p", { style: Y.body }, "Now run the logic in reverse. Let the vapour meet a cool surface and it snaps straight back to solid — skipping the liquid again. Learn this term precisely: that reverse step is ", /* @__PURE__ */ e.createElement("b", null, "deposition"), ", and it is exactly what re-collects the pure solid on the funnel walls.")), /* @__PURE__ */ e.createElement("div", { style: Y.cardInsight }, /* @__PURE__ */ e.createElement("div", { style: Y.row }, /* @__PURE__ */ e.createElement("span", { style: Y.badge }, "💡"), /* @__PURE__ */ e.createElement("span", { style: Y.hInsight }, "The handle")), /* @__PURE__ */ e.createElement("p", { style: Y.body }, "Here is the core principle to lock in: sublimation separates a solid–solid mixture ", /* @__PURE__ */ e.createElement("b", null, "only when exactly one"), " part sublimes (camphor, naphthalene, dry ice) while the other stays solid (sand, salt). That single difference in property is your handle — the sublimer rises and re-deposits clean; the rest is left behind. Each component simply kept its own identity.")), /* @__PURE__ */ e.createElement("div", { style: Y.cardPitfall }, /* @__PURE__ */ e.createElement("div", { style: Y.row }, /* @__PURE__ */ e.createElement("span", { style: Y.badge }, "⚠️"), /* @__PURE__ */ e.createElement("span", { style: Y.hPitfall }, "Order matters")), /* @__PURE__ */ e.createElement("p", { style: Y.body }, "Think of this as a worked strategy, not a list to memorise. For sand + salt + naphthalene, follow the steps in order: ", /* @__PURE__ */ e.createElement("b", null, "(1)"), " sublime the naphthalene FIRST, ", /* @__PURE__ */ e.createElement("b", null, "(2)"), " dissolve the salt in water, ", /* @__PURE__ */ e.createElement("b", null, "(3)"), " filter off the sand, ", /* @__PURE__ */ e.createElement("b", null, "(4)"), " evaporate the water to recover the salt. The reasoning: remove the \"jumper\" while everything is still dry — sequencing is what makes the separation clean."))), /* @__PURE__ */ e.createElement("div", {
		className: "slide-right",
		style: Y.right
	}, /* @__PURE__ */ e.createElement("div", { style: Y.panelTitle }, "Predict first, then watch"), /* @__PURE__ */ e.createElement("div", { style: Y.predictBox }, /* @__PURE__ */ e.createElement("div", { style: Y.predictQ }, "Before you press play: you gently heat a ", /* @__PURE__ */ e.createElement("b", null, "camphor + sand"), " mixture. What happens?"), /* @__PURE__ */ e.createElement("div", { style: Y.optCol }, o.map((t) => {
		let i = n === t.id, a = n != null, o = a ? t.ok ? "var(--primary-softer)" : i ? "var(--accent-soft)" : "var(--surface)" : "var(--surface)", s = a ? t.ok ? "var(--primary)" : i ? "var(--accent)" : "var(--border-light)" : "var(--border-light)";
		return /* @__PURE__ */ e.createElement("button", {
			key: t.id,
			onClick: () => r(t.id),
			style: {
				...Y.opt,
				background: o,
				borderColor: s
			}
		}, /* @__PURE__ */ e.createElement("span", { style: Y.optMark }, a ? t.ok ? "✓" : i ? "✕" : "" : ""), /* @__PURE__ */ e.createElement("span", { style: { minWidth: 0 } }, t.text));
	})), s && /* @__PURE__ */ e.createElement("div", { style: Y.predictFb }, s.ok ? "Exactly the prediction to hold onto — camphor sublimes and rises, sand stays put. Now watch the real thing confirm it." : "Not quite — keep your eyes open in the video. Only the camphor sublimes (no melting, no puddle); the sand never leaves the dish.")), /* @__PURE__ */ e.createElement("div", { style: Y.videoWrap }, /* @__PURE__ */ e.createElement("iframe", {
		style: Y.video,
		src: "https://www.youtube.com/embed/xV4PdJT2UoA",
		title: "Sublimation — separating a solid–solid mixture",
		frameBorder: "0",
		allow: "accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture",
		allowFullScreen: !0
	})), /* @__PURE__ */ e.createElement("div", { style: Y.checkHead }, "Spot these three layers as you watch — tap each when you see it ", /* @__PURE__ */ e.createElement("span", { style: Y.countPill }, l, "/3")), /* @__PURE__ */ e.createElement("div", { style: Y.checkCol }, [
		{
			k: "macro",
			label: "MACROSCOPIC",
			text: "Solid vanishing from the dish; pure solid re-forming on the cool surface above."
		},
		{
			k: "micro",
			label: "MICROSCOPIC",
			text: "Particles escaping straight to vapour, then depositing back to solid — no liquid at any point."
		},
		{
			k: "strat",
			label: "STRATEGY",
			text: "One component sublimes, the other stays put — that single difference IS the separation."
		}
	].map((t) => {
		let n = i[t.k];
		return /* @__PURE__ */ e.createElement("button", {
			key: t.k,
			onClick: () => c(t.k),
			style: {
				...Y.checkItem,
				background: n ? "var(--primary-softer)" : "var(--surface)",
				borderColor: n ? "var(--primary)" : "var(--border-light)"
			}
		}, /* @__PURE__ */ e.createElement("span", { style: {
			...Y.checkBox,
			background: n ? "var(--primary)" : "transparent",
			borderColor: n ? "var(--primary)" : "var(--border)",
			color: n ? "var(--primary-text, #fff)" : "transparent"
		} }, "✓"), /* @__PURE__ */ e.createElement("span", { style: { minWidth: 0 } }, /* @__PURE__ */ e.createElement("span", { style: Y.checkLabel }, t.label), /* @__PURE__ */ e.createElement("span", { style: Y.checkText }, t.text)));
	})), l === 3 && /* @__PURE__ */ e.createElement("div", { style: Y.doneMsg }, "All three layers spotted — that's the scientist's habit: never just \"what happened\", always \"what the molecules did\" and \"why it separates\".")));
}
var Pt = {
	background: "var(--surface-raised)",
	border: "1px solid var(--border-light)",
	borderRadius: 10,
	padding: "14px 18px"
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
	card: { ...Pt },
	cardHook: {
		...Pt,
		background: "var(--hook-soft)",
		borderLeft: "2px solid var(--hook)"
	},
	cardInsight: {
		...Pt,
		background: "var(--primary-softer)",
		borderColor: "var(--primary-soft)",
		borderLeft: "2px solid var(--primary)"
	},
	cardPitfall: {
		...Pt,
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
		lineHeight: 1.6,
		color: "var(--text-primary)",
		margin: 0
	},
	phaseRow: {
		display: "flex",
		alignItems: "center",
		gap: 8,
		flexWrap: "wrap",
		marginTop: 10
	},
	chip: {
		fontSize: 13,
		fontWeight: 700,
		padding: "4px 10px",
		borderRadius: 6,
		background: "var(--surface)",
		border: "1px solid var(--border-light)",
		color: "var(--text-primary)"
	},
	chipOk: {
		fontSize: 13,
		fontWeight: 700,
		padding: "4px 10px",
		borderRadius: 6,
		background: "var(--primary-softer)",
		border: "1px solid var(--primary-soft)",
		color: "var(--primary)"
	},
	chipStruck: {
		fontSize: 13,
		fontWeight: 700,
		padding: "4px 10px",
		borderRadius: 6,
		background: "var(--surface)",
		border: "1px dashed var(--border)",
		color: "var(--text-muted)",
		textDecoration: "line-through"
	},
	arrowMute: {
		color: "var(--text-muted)",
		fontWeight: 700
	},
	arrowGo: {
		color: "var(--primary)",
		fontWeight: 700,
		fontSize: 12,
		letterSpacing: .5
	},
	panelTitle: {
		fontSize: 16,
		fontWeight: 700,
		color: "var(--text-primary)"
	},
	predictBox: {
		display: "flex",
		flexDirection: "column",
		gap: 10,
		background: "var(--surface-raised)",
		border: "1px solid var(--border-light)",
		borderRadius: 10,
		padding: "12px 14px"
	},
	predictQ: {
		fontSize: 14,
		lineHeight: 1.5,
		color: "var(--text-primary)"
	},
	optCol: {
		display: "flex",
		flexDirection: "column",
		gap: 8
	},
	opt: {
		display: "flex",
		alignItems: "center",
		gap: 10,
		textAlign: "left",
		padding: "9px 12px",
		borderRadius: 8,
		border: "1px solid var(--border-light)",
		background: "var(--surface)",
		color: "var(--text-primary)",
		fontSize: 13.5,
		fontWeight: 500,
		cursor: "pointer",
		fontFamily: "inherit"
	},
	optMark: {
		width: 16,
		fontWeight: 800,
		color: "var(--text-secondary)",
		flexShrink: 0
	},
	predictFb: {
		fontSize: 13,
		lineHeight: 1.55,
		color: "var(--text-secondary)",
		fontWeight: 600,
		borderTop: "1px solid var(--border-light)",
		paddingTop: 8
	},
	videoWrap: {
		position: "relative",
		width: "100%",
		aspectRatio: "16 / 9",
		borderRadius: 10,
		overflow: "hidden",
		border: "1px solid var(--border-light)",
		background: "#000"
	},
	video: {
		position: "absolute",
		top: 0,
		left: 0,
		width: "100%",
		height: "100%",
		border: "none",
		display: "block"
	},
	checkHead: {
		fontSize: 13.5,
		fontWeight: 700,
		color: "var(--text-primary)",
		display: "flex",
		alignItems: "center",
		gap: 8,
		flexWrap: "wrap"
	},
	countPill: {
		fontSize: 12,
		fontWeight: 700,
		color: "var(--primary)",
		background: "var(--primary-softer)",
		border: "1px solid var(--primary-soft)",
		borderRadius: 20,
		padding: "1px 9px"
	},
	checkCol: {
		display: "flex",
		flexDirection: "column",
		gap: 8
	},
	checkItem: {
		display: "flex",
		alignItems: "flex-start",
		gap: 10,
		textAlign: "left",
		padding: "10px 12px",
		borderRadius: 8,
		border: "1px solid var(--border-light)",
		background: "var(--surface)",
		cursor: "pointer",
		fontFamily: "inherit"
	},
	checkBox: {
		display: "inline-flex",
		alignItems: "center",
		justifyContent: "center",
		width: 18,
		height: 18,
		borderRadius: 5,
		border: "1.5px solid var(--border)",
		fontSize: 12,
		fontWeight: 800,
		flexShrink: 0,
		marginTop: 1
	},
	checkLabel: {
		display: "block",
		fontSize: 11,
		fontWeight: 800,
		letterSpacing: .5,
		color: "var(--primary)",
		marginBottom: 2
	},
	checkText: {
		display: "block",
		fontSize: 13,
		lineHeight: 1.5,
		color: "var(--text-primary)"
	},
	doneMsg: {
		fontSize: 13,
		lineHeight: 1.55,
		fontWeight: 600,
		color: "var(--primary)",
		background: "var(--primary-softer)",
		border: "1px solid var(--primary-soft)",
		borderRadius: 8,
		padding: "10px 12px"
	}
};
//#endregion
//#region ../tmp/nadi-slides-fd6e4518-99e0-414a-a92e-35da921944c5/Slide_t5-5.jsx
function Ft({ studentName: t }) {
	return /* @__PURE__ */ e.createElement(e.Fragment, null, /* @__PURE__ */ e.createElement("div", {
		className: "slide-title",
		style: Lt.title
	}, "The Separating Funnel: Draining the Lower Layer"), /* @__PURE__ */ e.createElement("div", {
		className: "slide-left",
		style: Lt.left
	}, /* @__PURE__ */ e.createElement("div", { style: Lt.cardHook }, /* @__PURE__ */ e.createElement("span", { style: Lt.corner }, "💭"), /* @__PURE__ */ e.createElement("p", { style: Lt.hookText }, t, ", here is something you can picture at home: shake oil and water together, then let them rest. They split back into two layers with a sharp line between. Don’t dismiss that line — it is your handle, the one feature a separating funnel grabs to pull them apart.")), /* @__PURE__ */ e.createElement("div", { style: Lt.plain }, /* @__PURE__ */ e.createElement("div", { style: Lt.hPlain }, "Let’s place this in the bigger picture"), /* @__PURE__ */ e.createElement("p", { style: Lt.body }, "So far we have separated ", /* @__PURE__ */ e.createElement("b", null, "homogeneous"), " mixtures — a single uniform phase, like salt dissolved in water. Now we step into ", /* @__PURE__ */ e.createElement("b", null, "heterogeneous"), " mixtures, where the parts stay visibly distinct. Our first case: two liquids that simply refuse to mix.")), /* @__PURE__ */ e.createElement("div", { style: Lt.plain }, /* @__PURE__ */ e.createElement("div", { style: Lt.hPlain }, "Why two layers? (seeing it on two levels)"), /* @__PURE__ */ e.createElement("p", { style: Lt.body }, /* @__PURE__ */ e.createElement("b", null, "What you see (macroscopic):"), " two stacked layers with a crisp boundary. ", /* @__PURE__ */ e.createElement("b", null, "Why (microscopic):"), " the molecules of immiscible liquids won’t intermingle, so each liquid keeps its own bulk — the ", /* @__PURE__ */ e.createElement("b", null, "denser"), " one settles to the bottom, the ", /* @__PURE__ */ e.createElement("b", null, "lighter"), " one floats on top."), /* @__PURE__ */ e.createElement("hr", { style: Lt.hr }), /* @__PURE__ */ e.createElement("p", { style: Lt.body }, "Compare this with ", /* @__PURE__ */ e.createElement("b", null, "miscible"), " liquids: when two liquids are completely soluble in each other in ", /* @__PURE__ */ e.createElement("b", null, "all proportions"), ", their molecules mix freely into one uniform phase — no boundary forms at all.")), /* @__PURE__ */ e.createElement("div", { style: Lt.cardInsight }, /* @__PURE__ */ e.createElement("span", { style: Lt.corner }, "💡"), /* @__PURE__ */ e.createElement("p", { style: Lt.body }, /* @__PURE__ */ e.createElement("b", null, "1."), " Let the layers settle fully. ", /* @__PURE__ */ e.createElement("b", null, "2."), " Open the stopcock and run the ", /* @__PURE__ */ e.createElement("b", null, "lower"), " (denser) layer into a beaker. ", /* @__PURE__ */ e.createElement("b", null, "3."), " The instant the boundary reaches the tap, ", /* @__PURE__ */ e.createElement("b", null, "close it"), ". Each liquid now sits in its own container.")), /* @__PURE__ */ e.createElement("div", { style: Lt.cardPitfall }, /* @__PURE__ */ e.createElement("span", { style: Lt.corner }, "⚠️"), /* @__PURE__ */ e.createElement("p", { style: Lt.body }, "Close too late and the lighter layer pours straight through behind the boundary — contaminating your sample. Precision at the boundary is what separates a clean result from a ruined one. Take it slowly; you will get the feel for it.")), /* @__PURE__ */ e.createElement("div", { style: Lt.cardSurprise }, /* @__PURE__ */ e.createElement("span", { style: Lt.corner }, "🤯"), /* @__PURE__ */ e.createElement("p", { style: Lt.body }, "No boundary, no separation. If the liquids are ", /* @__PURE__ */ e.createElement("b", null, "miscible"), " they dissolve into one phase — nothing to drain. And if two immiscible liquids happen to share the ", /* @__PURE__ */ e.createElement("b", null, "same density"), ", no layer settles either. The takeaway: this method only works when densities differ — otherwise, reach for a different property."))), /* @__PURE__ */ e.createElement("div", {
		className: "slide-right",
		style: Lt.right
	}, /* @__PURE__ */ e.createElement("div", { style: Lt.panelTitle }, "Watch: draining a separating funnel"), /* @__PURE__ */ e.createElement("div", { style: Lt.videoWrap }, /* @__PURE__ */ e.createElement("iframe", {
		style: Lt.iframe,
		src: "https://www.youtube.com/embed/AIbYAVrtt10",
		title: "Separating funnel in action",
		frameBorder: "0",
		allow: "accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share",
		allowFullScreen: !0
	})), /* @__PURE__ */ e.createElement("p", { style: Lt.caption }, "Watch the boundary fall toward the stopcock — the moment it reaches the tap is exactly when a chemist closes it for a clean cut.")));
}
var It = {
	background: "var(--surface-raised)",
	border: "1px solid var(--border-light)",
	borderRadius: 10,
	padding: "14px 18px",
	position: "relative",
	paddingRight: 42
}, Lt = {
	title: {
		fontSize: 22,
		fontWeight: 700,
		color: "var(--text-primary)"
	},
	left: {
		display: "flex",
		flexDirection: "column",
		gap: 14,
		minWidth: 0
	},
	right: {
		display: "flex",
		flexDirection: "column",
		gap: 12,
		minWidth: 0
	},
	corner: {
		position: "absolute",
		top: 12,
		right: 12,
		fontSize: 16,
		lineHeight: 1
	},
	plain: {
		padding: "0 2px",
		minWidth: 0
	},
	cardHook: {
		...It,
		background: "var(--hook-soft)",
		borderLeft: "2px solid var(--hook)"
	},
	cardInsight: {
		...It,
		background: "var(--primary-softer)",
		borderColor: "var(--primary-soft)",
		borderLeft: "2px solid var(--primary)"
	},
	cardPitfall: {
		...It,
		background: "var(--accent-soft)",
		borderLeft: "2px solid var(--accent)"
	},
	cardSurprise: {
		...It,
		background: "var(--surprise-soft)",
		borderLeft: "2px solid var(--surprise)"
	},
	hPlain: {
		fontSize: 14,
		fontWeight: 700,
		color: "var(--primary)",
		marginBottom: 6
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
		lineHeight: 1.6,
		color: "var(--text-primary)",
		margin: 0
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
	videoWrap: {
		position: "relative",
		width: "100%",
		maxWidth: 320,
		margin: "0 auto",
		aspectRatio: "9 / 16",
		maxHeight: "60vh",
		borderRadius: 10,
		overflow: "hidden",
		border: "1px solid var(--border-light)",
		background: "#000"
	},
	iframe: {
		position: "absolute",
		top: 0,
		left: 0,
		width: "100%",
		height: "100%",
		border: "none",
		display: "block"
	},
	caption: {
		fontSize: 13,
		color: "var(--text-muted)",
		textAlign: "center",
		lineHeight: 1.5,
		margin: 0
	}
};
//#endregion
//#region ../tmp/nadi-slides-fd6e4518-99e0-414a-a92e-35da921944c5/Slide_t5-3.jsx
function Rt({ studentName: t }) {
	return /* @__PURE__ */ e.createElement(e.Fragment, null, /* @__PURE__ */ e.createElement("div", {
		className: "slide-title",
		style: Bt.title
	}, "Distillation & the 25 °C Rule"), /* @__PURE__ */ e.createElement("div", {
		className: "slide-left",
		style: Bt.left
	}, /* @__PURE__ */ e.createElement("div", { style: Bt.cardHook }, /* @__PURE__ */ e.createElement("span", { style: Bt.corner }, "💭"), /* @__PURE__ */ e.createElement("p", { style: Bt.hookText }, t, ", here's a puzzle worth your patience: vodka looks like a single clear liquid, yet it's water and ethanol blended molecule-for-molecule. No filter, no settling will ever split them. So how do we separate two perfectly mixed liquids? Stay with me — the logic is more elegant than it looks.")), /* @__PURE__ */ e.createElement("div", { style: Bt.plain }, /* @__PURE__ */ e.createElement("div", { style: Bt.plainHead }, "Each liquid kept its boiling point"), /* @__PURE__ */ e.createElement("p", { style: Bt.body }, "Here's the anchoring idea: mixing changes nothing chemical, so (microscopically) every water molecule still boils at 100 °C and every ethanol molecule at 78 °C. Now follow the procedure, step by step: ", /* @__PURE__ */ e.createElement("b", null, "(1)"), " heat the mixture gently; ", /* @__PURE__ */ e.createElement("b", null, "(2)"), " the ", /* @__PURE__ */ e.createElement("b", null, "lower-boiling"), " liquid vaporises ", /* @__PURE__ */ e.createElement("b", null, "first"), "; ", /* @__PURE__ */ e.createElement("b", null, "(3)"), " its vapour enters a cooled ", /* @__PURE__ */ e.createElement("b", null, "condenser"), " and drips back as pure liquid into a ", /* @__PURE__ */ e.createElement("i", null, "separate"), " flask. That sequence is ", /* @__PURE__ */ e.createElement("b", null, "distillation"), ".")), /* @__PURE__ */ e.createElement("div", { style: Bt.cardInsight }, /* @__PURE__ */ e.createElement("span", { style: Bt.corner }, "💡"), /* @__PURE__ */ e.createElement("p", { style: Bt.body }, "Here's your decision rule — well worth committing to memory: simple distillation gives a clean split only when the two boiling points differ by ", /* @__PURE__ */ e.createElement("b", null, "about 25 °C or more"), ". Any closer and both liquids vaporise together, so you'd reach for a fractionating column (next slide).")), /* @__PURE__ */ e.createElement("div", { style: Bt.plain }, /* @__PURE__ */ e.createElement("p", { style: Bt.body }, "Chemists often want to separate mixtures into their components. Such separations can be easy or difficult, depending on the components in the mixture. In general, mixtures are separable because the different components have different properties. We can use various techniques that exploit these differences to achieve separation. For example, oil and water are immiscible (do not mix) and have different densities. For this reason, oil floats on top of water, and we can separate it from water by decanting—carefully pouring off—the oil into another container. We can separate mixtures of miscible liquids by distillation, in which we heat the mixture to boil off the more volatile—the more easily vaporizable—liquid. We then recondense the volatile liquid in a condenser and collect it in a separate flask. If a mixture is composed of a solid and a liquid, we can separate the two by filtration, in which we pour the mixture through filter paper usually held in a funnel.")), /* @__PURE__ */ e.createElement("div", { style: Bt.cardPitfall }, /* @__PURE__ */ e.createElement("span", { style: Bt.corner }, "⚠️"), /* @__PURE__ */ e.createElement("p", { style: Bt.body }, "It's tempting to crank the heat for speed — resist it. Push past the ", /* @__PURE__ */ e.createElement("i", null, "higher"), " bp and ", /* @__PURE__ */ e.createElement("b", null, "both"), " liquids boil, so your distillate gets contaminated. The disciplined move: heat gently, holding just above the lower bp."))), /* @__PURE__ */ e.createElement("div", {
		className: "slide-right",
		style: Bt.right
	}, /* @__PURE__ */ e.createElement("div", { style: {
		width: "100%",
		aspectRatio: "16 / 9",
		borderRadius: 10,
		overflow: "hidden",
		border: "1px solid var(--border-light)"
	} }, /* @__PURE__ */ e.createElement("iframe", {
		src: "https://www.youtube.com/embed/cw-Wc_KjHgc",
		title: "Distillation video",
		allow: "accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture",
		allowFullScreen: !0,
		style: {
			width: "100%",
			height: "100%",
			border: 0,
			display: "block"
		}
	}))));
}
var zt = {
	background: "var(--surface-raised)",
	border: "1px solid var(--border-light)",
	borderRadius: 10,
	padding: "14px 18px",
	position: "relative",
	paddingRight: 44
}, Bt = {
	title: {
		fontSize: 22,
		fontWeight: 700,
		color: "var(--text-primary)"
	},
	left: {
		display: "flex",
		flexDirection: "column",
		gap: 14,
		minWidth: 0
	},
	right: {
		display: "flex",
		flexDirection: "column",
		gap: 10,
		minWidth: 0
	},
	corner: {
		position: "absolute",
		top: 12,
		right: 14,
		fontSize: 16,
		lineHeight: 1
	},
	cardHook: {
		...zt,
		background: "var(--hook-soft)",
		borderLeft: "2px solid var(--hook)"
	},
	cardInsight: {
		...zt,
		background: "var(--primary-softer)",
		borderColor: "var(--primary-soft)",
		borderLeft: "2px solid var(--primary)"
	},
	cardPitfall: {
		...zt,
		background: "var(--accent-soft)",
		borderLeft: "2px solid var(--accent)"
	},
	plain: {
		display: "flex",
		flexDirection: "column",
		gap: 6,
		padding: "0 2px"
	},
	plainHead: {
		fontSize: 15,
		fontWeight: 700,
		color: "var(--primary)"
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
		lineHeight: 1.6,
		color: "var(--text-primary)",
		margin: 0
	}
};
//#endregion
//#region ../tmp/nadi-slides-fd6e4518-99e0-414a-a92e-35da921944c5/Slide_t5--mixing-is-free-unmixing-costs-energy-separation-fights-the-natur-19vt.jsx
function Vt({ studentName: t }) {
	let [n, r] = w(0), [i, a] = w(0), o = C(null), s = C([]), c = C(0), l = C({
		w: 0,
		h: 0
	}), u = C(0);
	if (s.current.length === 0) {
		let e = [];
		for (let t = 0; t < 2; t++) for (let n = 0; n < 18; n++) e.push({
			color: t,
			col: n % 3,
			row: Math.floor(n / 3),
			jx: Math.random() * 2 - 1,
			jy: Math.random() * 2 - 1,
			x: null,
			y: null
		});
		s.current = e;
	}
	b(() => {
		c.current = n / 100;
	}, [n]), b(() => {
		let e = o.current;
		if (!e) return;
		let t = e.getContext("2d"), n = () => {
			let n = e.getBoundingClientRect(), r = window.devicePixelRatio || 1;
			e.width = n.width * r, e.height = n.height * r, t.setTransform(r, 0, 0, r, 0, 0), l.current = {
				w: n.width,
				h: n.height
			};
		};
		n();
		let r = new ResizeObserver(n);
		r.observe(e);
		let i = (e, t) => {
			let n = .3 * Math.exp(-(((e - .5) / .22) ** 2)), r = .1 * Math.exp(-(((e - .17) / .13) ** 2)), i = .1 * Math.exp(-(((e - .83) / .13) ** 2));
			return t * (.5 + n - r - i);
		}, a = (e, t, n) => ({
			x: t * .5 + e.jx * t * .12,
			y: i(.5, n) - 10 + e.jy * n * .045
		}), d = (e, t, n) => {
			let r = e.color === 0 ? .17 : .83, a = t * r, o = Math.min(t, n) * .042, s = i(r, n) - o * .8;
			return {
				x: a + (e.col - 1) * o,
				y: s - e.row * o * .82
			};
		}, f = (e, n, r) => {
			t.fillStyle = "rgba(255,255,255,0.92)", t.beginPath(), t.arc(e, n, 14 * r, 0, Math.PI * 2), t.arc(e + 16 * r, n + 4 * r, 11 * r, 0, Math.PI * 2), t.arc(e - 16 * r, n + 4 * r, 10 * r, 0, Math.PI * 2), t.arc(e + 2 * r, n + 8 * r, 13 * r, 0, Math.PI * 2), t.fill();
		}, p = () => {
			let { w: e, h: n } = l.current;
			if (e === 0) {
				u.current = requestAnimationFrame(p);
				return;
			}
			let r = c.current, o = performance.now() / 1e3;
			t.clearRect(0, 0, e, n), t.fillStyle = "#ffffff", t.fillRect(0, 0, e, n);
			let m = t.createLinearGradient(0, 0, 0, n * .6);
			m.addColorStop(0, "#9ed8ff"), m.addColorStop(1, "#e9f7ff"), t.fillStyle = m, t.fillRect(0, 0, e, n * .62), t.fillStyle = "rgba(255,221,87,0.95)", t.beginPath(), t.arc(e * .86, n * .15, Math.min(e, n) * .05, 0, Math.PI * 2), t.fill(), t.fillStyle = "rgba(255,221,87,0.22)", t.beginPath(), t.arc(e * .86, n * .15, Math.min(e, n) * .075, 0, Math.PI * 2), t.fill();
			let h = e + 140, g = o * 9 % h - 70, _ = (o * 6 + h * .55) % h - 70;
			f(g, n * .16, 1), f(_, n * .3, .75), t.beginPath(), t.moveTo(0, n), t.lineTo(0, i(0, n));
			for (let r = 0; r <= 60; r++) {
				let a = r / 60;
				t.lineTo(a * e, i(a, n));
			}
			t.lineTo(e, n), t.closePath();
			let v = t.createLinearGradient(0, n * .4, 0, n);
			v.addColorStop(0, "#a9744a"), v.addColorStop(1, "#7c4f2e"), t.fillStyle = v, t.fill(), t.lineWidth = Math.max(5, n * .02), t.strokeStyle = "#8ed06a", t.beginPath();
			for (let r = 0; r <= 60; r++) {
				let a = r / 60, o = a * e, s = i(a, n);
				r === 0 ? t.moveTo(o, s) : t.lineTo(o, s);
			}
			t.stroke(), t.strokeStyle = "#7cc057", t.lineWidth = 2;
			let y = Math.max(12, e / 36);
			for (let r = y * .5; r < e; r += y) {
				let a = i(r / e, n), s = Math.sin(o * 2 + r * .05) * 3, c = Math.min(e, n) * .028;
				t.beginPath(), t.moveTo(r, a), t.quadraticCurveTo(r + s, a - c * .6, r + s * 1.6, a - c), t.stroke();
			}
			let b = (r, a, o) => {
				let s = e * r, c = Math.min(e, n) * .042, l = i(r, n) - c * .8, u = c * 3.6, d = c * 6.4, f = s - u / 2, p = l + c * .9 - d;
				t.fillStyle = a + "22", t.strokeStyle = a, t.lineWidth = 2, t.beginPath(), t.moveTo(f + 7, p), t.lineTo(f + u - 7, p), t.quadraticCurveTo(f + u, p, f + u, p + 7), t.lineTo(f + u, p + d - 7), t.quadraticCurveTo(f + u, p + d, f + u - 7, p + d), t.lineTo(f + 7, p + d), t.quadraticCurveTo(f, p + d, f, p + d - 7), t.lineTo(f, p + 7), t.quadraticCurveTo(f, p, f + 7, p), t.fill(), t.stroke(), t.fillStyle = a, t.font = "700 11px Outfit, sans-serif", t.textAlign = "center", t.fillText(o, s, p - 7);
			};
			b(.17, "#2f6fd0", "PURE"), b(.83, "#d8483f", "PURE"), t.fillStyle = "rgba(255,255,255,0.85)", t.font = "700 11px Outfit, sans-serif", t.textAlign = "center", t.fillText("MIXED", e * .5, i(.5, n) - Math.min(e, n) * .1);
			let x = s.current, S = Math.min(e, n) * .018;
			for (let i of x) {
				let o = a(i, e, n), s = d(i, e, n), c = o.x + (s.x - o.x) * r, l = o.y + (s.y - o.y) * r;
				i.x ?? (i.x = c, i.y = l), i.x += (c - i.x) * .16, i.y += (l - i.y) * .16, t.beginPath(), t.arc(i.x, i.y, S, 0, Math.PI * 2), t.fillStyle = i.color === 0 ? "#5b9bff" : "#ff6b6b", t.fill(), t.lineWidth = 1.5, t.strokeStyle = i.color === 0 ? "#2f6fd0" : "#d8483f", t.stroke();
			}
			u.current = requestAnimationFrame(p);
		};
		return u.current = requestAnimationFrame(p), () => {
			cancelAnimationFrame(u.current), r.disconnect();
		};
	}, []);
	let d = () => {
		r(0), a(0);
	}, f = (e) => {
		let t = Number(e.target.value);
		r((e) => (t > e && a((n) => n + (t - e)), t));
	}, p = n >= 99;
	return /* @__PURE__ */ e.createElement(e.Fragment, null, /* @__PURE__ */ e.createElement("div", {
		className: "slide-title",
		style: X.title
	}, "The Energy Price of Purity"), /* @__PURE__ */ e.createElement("div", {
		className: "slide-left",
		style: X.left
	}, /* @__PURE__ */ e.createElement("div", { style: X.cardHook }, /* @__PURE__ */ e.createElement("span", { style: X.corner }, "💭"), /* @__PURE__ */ e.createElement("p", { style: X.hookText }, t, ", here's a puzzle worth pausing on. Drop a sugar cube into hot tea (what we see — the macroscopic view) and it spreads out all by itself. Yet you'll never catch those particles gathering back into a cube. Same particles, one direction only. Let's reason out why — you've got this.")), /* @__PURE__ */ e.createElement("div", { style: X.plain }, /* @__PURE__ */ e.createElement("div", { style: X.hPlain }, "Mixing is the free downhill"), /* @__PURE__ */ e.createElement("p", { style: X.body }, /* @__PURE__ */ e.createElement("strong", null, "What we see (macro):"), " gases fill a room, a solute spreads through water, a fresh deck jumbles after a few shuffles. ", /* @__PURE__ */ e.createElement("strong", null, "What's happening (micro):"), " particles carry a built-in pull toward disorder, so they spread out on their own. The takeaway — mixing is spontaneous. It costs nothing, like rolling downhill.")), /* @__PURE__ */ e.createElement("div", { style: X.plain }, /* @__PURE__ */ e.createElement("div", { style: X.hPlain }, "Unmixing is the uphill"), /* @__PURE__ */ e.createElement("p", { style: X.body }, "Now reverse it, step by step. ", /* @__PURE__ */ e.createElement("strong", null, "Step 1:"), " to separate a mixture you must un-do the jumble — sorting particles back into neat piles. ", /* @__PURE__ */ e.createElement("strong", null, "Step 2:"), " that runs against the natural pull, so energy must be fed in every single time — heat to boil off a solvent, a spinning force to fling out blood cells. Unmixing is the uphill climb.")), /* @__PURE__ */ e.createElement("div", { style: X.cardInsight }, /* @__PURE__ */ e.createElement("span", { style: X.corner }, "💡"), /* @__PURE__ */ e.createElement("p", { style: X.body }, "Here's the principle to carry forward: every separation method — distillation, chromatography, filtration — is an engine built to overpower the natural tendency to stay mixed. Nothing chemical happened when they mixed, so nothing chemical is needed to un-mix — but purity always has to be bought with energy.")), /* @__PURE__ */ e.createElement("div", { style: X.cardPitfall }, /* @__PURE__ */ e.createElement("span", { style: X.corner }, "⚠️"), /* @__PURE__ */ e.createElement("p", { style: X.body }, "A common trap: thinking one push is enough. The energy can't be a quick nudge — stop supplying it and the particles drift straight back to mixed. You're not parking them apart, you're holding them apart against a pull that never switches off."))), /* @__PURE__ */ e.createElement("div", {
		className: "slide-right",
		style: X.right
	}, /* @__PURE__ */ e.createElement("div", { style: X.panelTitle }, "The Gravity Hill"), /* @__PURE__ */ e.createElement("canvas", {
		ref: o,
		style: {
			width: "100%",
			aspectRatio: "4 / 3",
			maxHeight: "40vh",
			display: "block",
			borderRadius: 10,
			outline: p ? "3px solid var(--primary)" : "1px solid var(--border-light)",
			boxShadow: p ? "0 0 0 4px var(--primary-softer)" : "none",
			transition: "outline 0.2s, box-shadow 0.2s"
		}
	}), /* @__PURE__ */ e.createElement("div", { style: X.readout }, n === 0 && "You find them already mixed — the natural, free state. Now feed energy in to pull them apart →", n > 0 && !p && "Keep feeding energy — they are climbing uphill, against the pull.", p && "✓ Pure again — nicely done. But it only holds while you keep paying."), /* @__PURE__ */ e.createElement("div", { style: X.controlBlock }, /* @__PURE__ */ e.createElement("div", { style: X.sliderLabel }, "Energy you're feeding in"), /* @__PURE__ */ e.createElement("input", {
		type: "range",
		min: 0,
		max: 100,
		value: n,
		onChange: f,
		style: X.slider
	}), /* @__PURE__ */ e.createElement("div", { style: X.sliderHint }, "Drag right to separate · ease off and watch them slide back — proof the pull never stops"), /* @__PURE__ */ e.createElement("button", {
		style: X.btnGhost,
		onClick: d
	}, "↺ Let them remix")), /* @__PURE__ */ e.createElement("div", { style: X.meterRow }, /* @__PURE__ */ e.createElement("span", { style: X.meterLabel }, "Energy spent unmixing"), /* @__PURE__ */ e.createElement("span", { style: {
		...X.meterValue,
		color: i > 0 ? "var(--accent-text)" : "var(--text-muted)"
	} }, i === 0 ? "0 — mixing was free" : i)), /* @__PURE__ */ e.createElement("div", { style: X.meterTrack }, /* @__PURE__ */ e.createElement("div", { style: {
		...X.meterFill,
		width: Math.min(100, i / 4) + "%"
	} }))));
}
var Ht = {
	background: "var(--surface-raised)",
	border: "1px solid var(--border-light)",
	borderRadius: 10,
	padding: "14px 18px",
	position: "relative",
	paddingRight: 40
}, X = {
	title: {
		fontSize: 22,
		fontWeight: 700,
		color: "var(--text-primary)"
	},
	left: {
		display: "flex",
		flexDirection: "column",
		gap: 14,
		minWidth: 0
	},
	right: {
		display: "flex",
		flexDirection: "column",
		gap: 12,
		minWidth: 0
	},
	corner: {
		position: "absolute",
		top: 10,
		right: 12,
		fontSize: 16,
		lineHeight: 1
	},
	plain: {
		padding: "0 2px",
		minWidth: 0
	},
	cardHook: {
		...Ht,
		background: "var(--hook-soft)",
		borderLeft: "2px solid var(--hook)"
	},
	cardInsight: {
		...Ht,
		background: "var(--primary-softer)",
		borderColor: "var(--primary-soft)",
		borderLeft: "2px solid var(--primary)"
	},
	cardPitfall: {
		...Ht,
		background: "var(--accent-soft)",
		borderLeft: "2px solid var(--accent)"
	},
	hPlain: {
		fontSize: 15,
		fontWeight: 700,
		color: "var(--text-primary)",
		marginBottom: 6
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
		lineHeight: 1.6,
		color: "var(--text-primary)",
		margin: 0
	},
	panelTitle: {
		fontSize: 16,
		fontWeight: 700,
		color: "var(--text-primary)"
	},
	readout: {
		fontWeight: 600,
		fontSize: 14,
		color: "var(--text-secondary)",
		textAlign: "center",
		minHeight: 20
	},
	btnGhost: {
		width: "100%",
		padding: "9px 16px",
		fontSize: 13,
		fontWeight: 600,
		fontFamily: "inherit",
		color: "var(--text-secondary)",
		background: "var(--surface)",
		border: "1px solid var(--border-light)",
		borderRadius: 8,
		cursor: "pointer"
	},
	controlBlock: {
		display: "flex",
		flexDirection: "column",
		gap: 8
	},
	sliderLabel: {
		fontSize: 14,
		fontWeight: 700,
		color: "var(--text-primary)",
		textAlign: "center"
	},
	slider: {
		width: "100%",
		accentColor: "var(--primary)"
	},
	sliderHint: {
		fontSize: 12,
		color: "var(--text-muted)",
		textAlign: "center"
	},
	meterRow: {
		display: "flex",
		justifyContent: "space-between",
		alignItems: "baseline",
		marginTop: 2
	},
	meterLabel: {
		fontSize: 13,
		color: "var(--text-secondary)",
		fontWeight: 600
	},
	meterValue: {
		fontSize: 15,
		fontWeight: 700,
		fontFamily: "monospace"
	},
	meterTrack: {
		height: 8,
		background: "var(--surface)",
		border: "1px solid var(--border-light)",
		borderRadius: 5,
		overflow: "hidden"
	},
	meterFill: {
		height: "100%",
		background: "var(--accent)",
		transition: "width 0.15s"
	}
};
//#endregion
//#region ../tmp/nadi-slides-fd6e4518-99e0-414a-a92e-35da921944c5/Slide_t5-7.jsx
function Ut({ studentName: t }) {
	return /* @__PURE__ */ e.createElement(e.Fragment, null, /* @__PURE__ */ e.createElement("div", {
		className: "slide-title",
		style: Z.title
	}, "Coagulation: Engineering Tiny Particles into \"Giants\""), /* @__PURE__ */ e.createElement("div", {
		className: "slide-left",
		style: Z.left
	}, /* @__PURE__ */ e.createElement("div", { style: Z.cardHook }, /* @__PURE__ */ e.createElement("span", { style: Z.cornerEmoji }, "💭"), /* @__PURE__ */ e.createElement("p", { style: Z.hookText }, t, ", here's an everyday puzzle worth reasoning through. Muddy river water stays cloudy for days, and pouring it through filter paper changes nothing — the dirt slips straight back in. Yet your local water plant turns that very same water crystal-clear. The science is perfectly logical, and you're about to reason your way to it.")), /* @__PURE__ */ e.createElement("div", { style: Z.plain }, /* @__PURE__ */ e.createElement("div", { style: Z.hCard }, "Step 1 — Diagnose the problem"), /* @__PURE__ */ e.createElement("p", { style: Z.body }, "Look at the ", /* @__PURE__ */ e.createElement("b", null, "microscopic"), " picture: in a fine suspension each particle is ", /* @__PURE__ */ e.createElement("b", null, "smaller than the filter's pores"), ", so it passes straight through. And because each particle is so light, water molecules constantly bump it — it never sinks. What you see at the ", /* @__PURE__ */ e.createElement("b", null, "macroscopic"), " level: filtration ", /* @__PURE__ */ e.createElement("i", null, "and"), " sedimentation both fail. Don't worry — naming the obstacle precisely is the first step to beating it.")), /* @__PURE__ */ e.createElement("div", { style: Z.plain }, /* @__PURE__ */ e.createElement("div", { style: Z.hCard }, "Step 2 — Change the variable you can"), /* @__PURE__ */ e.createElement("p", { style: Z.body }, "Here's the clever move: don't change the filter — change the ", /* @__PURE__ */ e.createElement("b", null, "particles"), ". Add a ", /* @__PURE__ */ e.createElement("b", null, "coagulant"), " (alum, also called fitkari). Microscopically, fine particles carry the ", /* @__PURE__ */ e.createElement("i", null, "same charge"), ", so they repel and stay apart. The coagulant cancels that charge, letting them touch and clump into large clusters we call ", /* @__PURE__ */ e.createElement("b", null, "flocs"), ". A new term, but a simple idea — like a scattered crowd finally allowed to link arms."), /* @__PURE__ */ e.createElement("div", { style: Z.scale }, /* @__PURE__ */ e.createElement("span", { style: Z.scaleChip }, "fine: slips through ❌"), /* @__PURE__ */ e.createElement("span", { style: Z.arrow }, "→ coagulate →"), /* @__PURE__ */ e.createElement("span", { style: Z.scaleChipBig }, "floc: settles & filters ✅"))), /* @__PURE__ */ e.createElement("div", { style: Z.plain }, /* @__PURE__ */ e.createElement("div", { style: Z.hCard }, "Step 3 — The procedure (order matters)"), /* @__PURE__ */ e.createElement("ol", { style: Z.ol }, /* @__PURE__ */ e.createElement("li", null, /* @__PURE__ */ e.createElement("b", null, "Coagulate"), " — add coagulant, particles clump into flocs."), /* @__PURE__ */ e.createElement("li", null, /* @__PURE__ */ e.createElement("b", null, "Sediment"), " — heavy flocs sink to the bottom."), /* @__PURE__ */ e.createElement("li", null, /* @__PURE__ */ e.createElement("b", null, "Decant / filter"), " — pour off or strain the clear liquid."))), /* @__PURE__ */ e.createElement("div", { style: Z.cardInsight }, /* @__PURE__ */ e.createElement("span", { style: Z.cornerEmoji }, "💡"), /* @__PURE__ */ e.createElement("p", { style: Z.body }, "Well reasoned. Coagulation is really a ", /* @__PURE__ */ e.createElement("b", null, "size-engineering step"), ": it pushes the particles up the size scale until gravity and the filter can finally grab them. The handle was always present — coagulation just made it big enough to hold. Own this logic and the whole method follows.")), /* @__PURE__ */ e.createElement("div", { style: Z.cardSurprise }, /* @__PURE__ */ e.createElement("span", { style: Z.cornerEmoji }, "🤯"), /* @__PURE__ */ e.createElement("p", { style: Z.body }, "The same logic turns up at dinner. Squeeze ", /* @__PURE__ */ e.createElement("b", null, "lemon or vinegar"), " into warm milk and the acid acts as a coagulant: the dispersed milk proteins clump into solid ", /* @__PURE__ */ e.createElement("b", null, "paneer"), ", leaving watery whey behind. Identical physics to clearing muddy water — once you own the principle, you start spotting it everywhere."))), /* @__PURE__ */ e.createElement("div", {
		className: "slide-right",
		style: Z.right
	}, /* @__PURE__ */ e.createElement("div", { style: Z.panelTitle }, "Watch: coagulation in action"), /* @__PURE__ */ e.createElement("p", { style: Z.watchNote }, "Three short clips to see the logic move — from clearing muddy water to the very same trick in your kitchen."), [
		{
			id: "hyC6JUrP7wk",
			label: "How coagulation clears muddy water"
		},
		{
			id: "xVAAwR50Ex8",
			label: "Coagulation in action — quick look"
		},
		{
			id: "90G6iXHZKTo",
			label: "Making paneer — the same clumping trick"
		}
	].map((t, n) => /* @__PURE__ */ e.createElement("div", {
		key: t.id,
		style: Z.videoBlock
	}, /* @__PURE__ */ e.createElement("div", { style: Z.videoLabel }, n + 1, ". ", t.label), /* @__PURE__ */ e.createElement("div", { style: Z.videoFrame }, /* @__PURE__ */ e.createElement("iframe", {
		style: Z.iframe,
		src: "https://www.youtube.com/embed/" + t.id,
		title: t.label,
		allow: "accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share",
		allowFullScreen: !0
	}))))));
}
var Wt = {
	background: "var(--surface-raised)",
	border: "1px solid var(--border-light)",
	borderRadius: 10,
	padding: "14px 18px"
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
	plain: {
		padding: "2px 0",
		minWidth: 0
	},
	cornerEmoji: {
		position: "absolute",
		top: 12,
		right: 14,
		fontSize: 18,
		lineHeight: 1
	},
	cardHook: {
		...Wt,
		position: "relative",
		background: "var(--hook-soft)",
		borderLeft: "2px solid var(--hook)",
		paddingRight: 40
	},
	cardInsight: {
		...Wt,
		position: "relative",
		background: "var(--primary-softer)",
		borderColor: "var(--primary-soft)",
		borderLeft: "2px solid var(--primary)",
		paddingRight: 40
	},
	cardSurprise: {
		...Wt,
		position: "relative",
		background: "var(--surprise-soft)",
		borderLeft: "2px solid var(--surprise)",
		paddingRight: 40
	},
	hCard: {
		fontSize: 14,
		fontWeight: 700,
		color: "var(--primary)",
		marginBottom: 8
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
		lineHeight: 1.6,
		color: "var(--text-primary)",
		margin: 0
	},
	ol: {
		fontSize: 15,
		lineHeight: 1.7,
		color: "var(--text-primary)",
		margin: 0,
		paddingLeft: 20
	},
	scale: {
		display: "flex",
		alignItems: "center",
		gap: 8,
		flexWrap: "wrap",
		marginTop: 12
	},
	scaleChip: {
		fontSize: 12,
		fontWeight: 700,
		background: "var(--surface)",
		border: "1px solid var(--border-light)",
		borderRadius: 6,
		padding: "5px 8px",
		color: "var(--text-secondary)"
	},
	scaleChipBig: {
		fontSize: 12,
		fontWeight: 700,
		background: "var(--primary-softer)",
		border: "1px solid var(--primary-soft)",
		borderRadius: 6,
		padding: "5px 8px",
		color: "var(--primary)"
	},
	arrow: {
		fontSize: 12,
		fontWeight: 700,
		color: "var(--text-muted)"
	},
	panelTitle: {
		fontSize: 16,
		fontWeight: 700,
		color: "var(--text-primary)"
	},
	watchNote: {
		fontSize: 13,
		color: "var(--text-secondary)",
		margin: 0,
		lineHeight: 1.5
	},
	videoBlock: {
		display: "flex",
		flexDirection: "column",
		gap: 6,
		minWidth: 0
	},
	videoLabel: {
		fontSize: 13,
		fontWeight: 700,
		color: "var(--text-secondary)"
	},
	videoFrame: {
		position: "relative",
		width: "100%",
		aspectRatio: "16 / 9",
		borderRadius: 8,
		overflow: "hidden",
		border: "1px solid var(--border-light)",
		background: "var(--surface)"
	},
	iframe: {
		position: "absolute",
		top: 0,
		left: 0,
		width: "100%",
		height: "100%",
		border: 0
	}
}, Gt = 7;
function Kt({ studentName: t }) {
	let [n, r] = w("milk"), [i, a] = w(0), [o, s] = w({}), c = C(null), l = C(0), u = C("milk"), d = C({
		x: .5,
		y: .5
	}), f = C(null), p = C(null);
	if (!p.current) {
		let e = 7, t = () => (e = e * 1103515245 + 12345 & 2147483647, e / 2147483647), n = [];
		for (let e = 0; e < 620; e++) n.push({
			x: t(),
			y: t(),
			r: .0024 + t() * .0034,
			water: !0
		});
		let r = [];
		for (let e = 0; e < 6; e++) r.push({
			cx: .12 + t() * .76,
			cy: .12 + t() * .76
		});
		for (let e = 0; e < 95; e++) {
			let e = r[Math.floor(t() * r.length)], i = t() * Math.PI * 2, a = t() ** .6 * .1, o = Math.min(.99, Math.max(.01, e.cx + Math.cos(i) * a)), s = Math.min(.99, Math.max(.01, e.cy + Math.sin(i) * a));
			n.push({
				x: o,
				y: s,
				r: .0042 + t() * .0052,
				water: !1
			});
		}
		let i = 1 / 34, a = [];
		for (let e = 0; e < 34; e++) for (let n = 0; n < 34; n++) a.push({
			x: (n + .5 + (t() - .5) * .25) * i,
			y: (e + .5 + (t() - .5) * .25) * i,
			type: +(t() > .6)
		});
		p.current = {
			drops: n,
			atoms: a,
			cell: i
		};
	}
	let m = g(() => {
		let e = c.current;
		if (!e) return;
		let t = e.getContext("2d"), n = e.getBoundingClientRect(), r = window.devicePixelRatio || 1;
		e.width = n.width * r, e.height = n.height * r, t.setTransform(r, 0, 0, r, 0, 0);
		let i = e.clientWidth, a = e.clientHeight, o = Math.min(i, a), s = 1 + l.current * (Gt - 1), f = .5 / s, m = d.current.x, h = d.current.y;
		if (m = Math.min(1 - f, Math.max(f, m)), h = Math.min(1 - f, Math.max(f, h)), d.current = {
			x: m,
			y: h
		}, t.clearRect(0, 0, i, a), u.current === "milk") {
			t.fillStyle = "#eaf4fd", t.fillRect(0, 0, i, a);
			for (let e of p.current.drops) {
				let n = (e.x - m) * s * i + i / 2, r = (e.y - h) * s * a + a / 2, c = e.r * s * o;
				n < -c || n > i + c || r < -c || r > a + c || (t.beginPath(), t.arc(n, r, c, 0, Math.PI * 2), e.water ? (t.fillStyle = "#9fcdeb", t.fill()) : (t.fillStyle = "#ffffff", t.fill(), t.lineWidth = Math.max(1, c * .18), t.strokeStyle = "rgba(120,130,140,0.45)", t.stroke()));
			}
		} else {
			t.fillStyle = "#c79a47", t.fillRect(0, 0, i, a);
			let { atoms: e, cell: n } = p.current, r = n * s * o * .34;
			for (let n of e) {
				let e = (n.x - m) * s * i + i / 2, o = (n.y - h) * s * a + a / 2;
				e < -r || e > i + r || o < -r || o > a + r || (t.beginPath(), t.arc(e, o, r, 0, Math.PI * 2), t.fillStyle = n.type ? "#cfd3da" : "#c1742f", t.fill(), r > 9 && (t.lineWidth = 1, t.strokeStyle = "rgba(70,55,30,0.35)", t.stroke()));
			}
		}
	}, []);
	b(() => {
		l.current = i, m();
	}, [i, m]), b(() => {
		u.current = n, d.current = {
			x: .5,
			y: .5
		}, m();
	}, [n, m]), b(() => {
		let e = c.current;
		if (!e) return;
		let t = new ResizeObserver(() => m());
		return t.observe(e), m(), () => t.disconnect();
	}, [m]);
	let h = (e) => {
		a(e), e > .9 && !o[n] && s((e) => ({
			...e,
			[n]: !0
		}));
	}, _ = (e) => {
		l.current <= .02 || (e.currentTarget.setPointerCapture && e.currentTarget.setPointerCapture(e.pointerId), f.current = {
			px: e.clientX,
			py: e.clientY,
			sx: d.current.x,
			sy: d.current.y
		});
	}, v = (e) => {
		if (!f.current) return;
		let t = c.current;
		if (!t) return;
		let n = t.clientWidth, r = t.clientHeight, i = 1 + l.current * (Gt - 1), a = (e.clientX - f.current.px) / (i * n), o = (e.clientY - f.current.py) / (i * r);
		d.current = {
			x: f.current.sx - a,
			y: f.current.sy - o
		}, m();
	}, y = () => {
		f.current = null;
	}, x = i < .34 ? "Naked eye" : i < .7 ? "Microscope" : "Atomic / nm scale", S = i > .9, ee = i > .08, te = o.milk && o.brass, ne, re;
	return n === "milk" ? (ne = S ? "There it is: distinct fat droplets in water → HETEROGENEOUS (a colloid)" : i < .34 ? "Macroscopically: one smooth white liquid. Hold your verdict — keep going." : "Something is hiding below eye-scale — keep zooming in.", re = S ? "hetero" : "neutral") : (ne = S ? "Now you see it: copper + zinc atoms evenly intermixed → HOMOGENEOUS (solid solution)" : i < .34 ? "Macroscopically: one shiny gold-coloured metal. Look deeper before you decide." : "Two kinds of atom emerging — but arranged how? Keep going.", re = S ? "homo" : "neutral"), /* @__PURE__ */ e.createElement(e.Fragment, null, /* @__PURE__ */ e.createElement("div", {
		className: "slide-title",
		style: Q.title
	}, "Where the Eye-Test Lies: Zoom In"), /* @__PURE__ */ e.createElement("div", {
		className: "slide-left",
		style: Q.left
	}, /* @__PURE__ */ e.createElement("div", { style: Q.cardHook }, /* @__PURE__ */ e.createElement("span", { style: Q.corner }, "💭"), /* @__PURE__ */ e.createElement("p", { style: Q.hookText }, t, ", a glass of milk and a brass doorknob both pass the eye-test for \"uniform\" — so both must be homogeneous, right? Resist the quick answer. A good scientist checks at more than one level before deciding. Let's zoom in first.")), /* @__PURE__ */ e.createElement("div", { style: Q.plain }, /* @__PURE__ */ e.createElement("div", { style: Q.hCard }, "The eye reads at ONE level only"), /* @__PURE__ */ e.createElement("p", { style: Q.body }, "\"Uniform\" is only ever true at the level you happen to be viewing. This is the heart of chemistry: what we see (macroscopic) and what's really there (microscopic — atoms and droplets) can disagree. Change the magnification and the verdict can flip. The definition rests on the scale that ", /* @__PURE__ */ e.createElement("em", null, "matters"), ", not on your bare eye.")), te ? /* @__PURE__ */ e.createElement("div", { style: Q.cardInsight }, /* @__PURE__ */ e.createElement("span", { style: Q.corner }, "💡"), /* @__PURE__ */ e.createElement("p", { style: Q.body }, "Macro vs micro in action: milk ", /* @__PURE__ */ e.createElement("strong", null, "looks"), " uniform yet is heterogeneous — fat droplets hide below eye-scale (a colloid). Brass ", /* @__PURE__ */ e.createElement("strong", null, "looks"), " like one substance yet is genuinely homogeneous — copper and zinc blended atom-by-atom. The rule to carry away: ", /* @__PURE__ */ e.createElement("strong", null, "homogeneity means uniform at the relevant scale."))) : /* @__PURE__ */ e.createElement("div", { style: Q.cardLocked }, /* @__PURE__ */ e.createElement("span", { style: Q.corner }, "🔒"), /* @__PURE__ */ e.createElement("p", { style: Q.bodyMuted }, "Your task: zoom BOTH milk and brass all the way to the atomic level — pan around to explore — to reveal what's really going on →")), /* @__PURE__ */ e.createElement("div", { style: Q.cardPitfall }, /* @__PURE__ */ e.createElement("span", { style: Q.corner }, "⚠️"), /* @__PURE__ */ e.createElement("p", { style: Q.body }, "Stay precise: homogeneous ≠ \"liquid\" and ≠ \"transparent.\" Brass is an opaque solid, yet homogeneous. Milk is a pourable liquid, yet heterogeneous. Appearance is not the criterion."))), /* @__PURE__ */ e.createElement("div", {
		className: "slide-right",
		style: Q.right
	}, /* @__PURE__ */ e.createElement("div", { style: Q.pickHint }, "Tap a sample to inspect it →"), /* @__PURE__ */ e.createElement("div", { style: Q.photoRow }, /* @__PURE__ */ e.createElement("figure", {
		style: n === "milk" ? {
			...Q.photoFig,
			...Q.photoFigOn
		} : Q.photoFig,
		onClick: () => r("milk"),
		role: "button",
		"aria-pressed": n === "milk",
		tabIndex: 0,
		onKeyDown: (e) => {
			(e.key === "Enter" || e.key === " ") && (e.preventDefault(), r("milk"));
		}
	}, /* @__PURE__ */ e.createElement("img", {
		src: "https://starkhorn.nadilearning.com/files/slide-assets/b7953a8a-5277-46bd-aec3-8bc8576a1f49/3c6f8156-a50a-413f-87d9-7850e35d65c8.webp",
		alt: "A glass of milk",
		style: n === "milk" ? {
			...Q.photo,
			...Q.photoOn
		} : Q.photo
	}), /* @__PURE__ */ e.createElement("figcaption", { style: n === "milk" ? {
		...Q.photoCap,
		...Q.photoCapOn
	} : Q.photoCap }, "Milk — looks uniform")), /* @__PURE__ */ e.createElement("figure", {
		style: n === "brass" ? {
			...Q.photoFig,
			...Q.photoFigOn
		} : Q.photoFig,
		onClick: () => r("brass"),
		role: "button",
		"aria-pressed": n === "brass",
		tabIndex: 0,
		onKeyDown: (e) => {
			(e.key === "Enter" || e.key === " ") && (e.preventDefault(), r("brass"));
		}
	}, /* @__PURE__ */ e.createElement("img", {
		src: "https://starkhorn.nadilearning.com/files/slide-assets/b7953a8a-5277-46bd-aec3-8bc8576a1f49/d097b0d1-b1b8-494c-824c-d4537de8675e.jpg",
		alt: "A brass fitting",
		style: n === "brass" ? {
			...Q.photo,
			...Q.photoOn
		} : Q.photo
	}), /* @__PURE__ */ e.createElement("figcaption", { style: n === "brass" ? {
		...Q.photoCap,
		...Q.photoCapOn
	} : Q.photoCap }, "Brass — looks like one metal"))), /* @__PURE__ */ e.createElement("div", { style: Q.viewWrap }, /* @__PURE__ */ e.createElement("canvas", {
		ref: c,
		style: {
			...Q.canvas,
			cursor: ee ? f.current ? "grabbing" : "grab" : "default",
			touchAction: "none"
		},
		onPointerDown: _,
		onPointerMove: v,
		onPointerUp: y,
		onPointerCancel: y,
		onPointerLeave: y
	}), /* @__PURE__ */ e.createElement("div", { style: Q.scaleTag }, x), o[n] && /* @__PURE__ */ e.createElement("div", { style: Q.seenTag }, "✓ inspected"), ee && /* @__PURE__ */ e.createElement("div", { style: Q.panTag }, "✛ drag to pan")), /* @__PURE__ */ e.createElement("input", {
		type: "range",
		min: 0,
		max: 1,
		step: .01,
		value: i,
		onChange: (e) => h(Number(e.target.value)),
		style: Q.slider
	}), /* @__PURE__ */ e.createElement("div", { style: Q.sliderLabel }, "← drag to magnify →"), /* @__PURE__ */ e.createElement("div", { style: {
		...Q.readout,
		...re === "hetero" ? Q.readHetero : re === "homo" ? Q.readHomo : {}
	} }, ne), /* @__PURE__ */ e.createElement("div", { style: Q.progressNote }, te ? "Both samples inspected — your insight is unlocked on the left." : `Inspect at atomic scale:  milk ${o.milk ? "✓" : "○"}   brass ${o.brass ? "✓" : "○"}`)));
}
var qt = {
	background: "var(--surface-raised)",
	border: "1px solid var(--border-light)",
	borderRadius: 10,
	padding: "14px 18px",
	position: "relative",
	paddingRight: 40
}, Q = {
	title: {
		fontSize: 22,
		fontWeight: 700,
		color: "var(--text-primary)"
	},
	left: {
		display: "flex",
		flexDirection: "column",
		gap: 14,
		minWidth: 0
	},
	right: {
		display: "flex",
		flexDirection: "column",
		gap: 12,
		minWidth: 0
	},
	corner: {
		position: "absolute",
		top: 10,
		right: 12,
		fontSize: 16,
		lineHeight: 1
	},
	plain: { padding: "0 2px" },
	cardHook: {
		...qt,
		background: "var(--hook-soft)",
		borderLeft: "2px solid var(--hook)"
	},
	cardInsight: {
		...qt,
		background: "var(--primary-softer)",
		borderColor: "var(--primary-soft)",
		borderLeft: "2px solid var(--primary)"
	},
	cardLocked: {
		...qt,
		background: "var(--surface)",
		borderStyle: "dashed"
	},
	cardPitfall: {
		...qt,
		background: "var(--accent-soft)",
		borderLeft: "2px solid var(--accent)"
	},
	hCard: {
		fontSize: 14,
		fontWeight: 700,
		color: "var(--primary)",
		marginBottom: 8
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
		lineHeight: 1.6,
		color: "var(--text-primary)",
		margin: 0
	},
	bodyMuted: {
		fontSize: 14,
		lineHeight: 1.6,
		color: "var(--text-muted)",
		margin: 0
	},
	pickHint: {
		fontSize: 12.5,
		color: "var(--text-muted)",
		textAlign: "center",
		fontWeight: 600
	},
	photoRow: {
		display: "flex",
		gap: 8
	},
	photoFig: {
		flex: 1,
		minWidth: 0,
		margin: 0,
		display: "flex",
		flexDirection: "column",
		gap: 6,
		padding: 6,
		borderRadius: 10,
		border: "2px solid transparent",
		background: "#0b1220",
		cursor: "pointer",
		outline: "none",
		transition: "border-color 0.15s"
	},
	photoFigOn: {
		border: "4px solid var(--primary)",
		padding: 4
	},
	photo: {
		width: "100%",
		maxHeight: "18vh",
		objectFit: "contain",
		display: "block",
		borderRadius: 8,
		background: "#0b1220",
		opacity: .7,
		transition: "opacity 0.15s"
	},
	photoOn: { opacity: 1 },
	photoCap: {
		fontSize: 13,
		fontWeight: 800,
		color: "#7dd3fc",
		textAlign: "center",
		background: "#0b1220",
		padding: "4px 0",
		borderRadius: 6
	},
	photoCapOn: { color: "#fcd34d" },
	viewWrap: {
		position: "relative",
		borderRadius: 10,
		overflow: "hidden",
		border: "1px solid var(--border-light)"
	},
	canvas: {
		width: "100%",
		aspectRatio: "4 / 3",
		maxHeight: "40vh",
		display: "block"
	},
	scaleTag: {
		position: "absolute",
		top: 8,
		left: 8,
		background: "rgba(20,20,28,0.72)",
		color: "#fff",
		fontSize: 12,
		fontWeight: 700,
		padding: "3px 9px",
		borderRadius: 6
	},
	seenTag: {
		position: "absolute",
		top: 8,
		right: 8,
		background: "rgba(34,120,70,0.85)",
		color: "#fff",
		fontSize: 12,
		fontWeight: 700,
		padding: "3px 9px",
		borderRadius: 6
	},
	panTag: {
		position: "absolute",
		bottom: 8,
		left: 8,
		background: "rgba(20,20,28,0.62)",
		color: "#fff",
		fontSize: 11.5,
		fontWeight: 700,
		padding: "3px 9px",
		borderRadius: 6
	},
	slider: {
		width: "100%",
		accentColor: "var(--primary)"
	},
	sliderLabel: {
		fontSize: 12,
		color: "var(--text-muted)",
		textAlign: "center",
		marginTop: -4
	},
	readout: {
		fontWeight: 700,
		fontSize: 14,
		lineHeight: 1.5,
		color: "var(--text-secondary)",
		textAlign: "center",
		background: "var(--surface)",
		border: "1px solid var(--border-light)",
		borderRadius: 8,
		padding: "12px 14px",
		minHeight: 20
	},
	readHetero: {
		background: "var(--accent-soft)",
		borderColor: "var(--accent)",
		color: "var(--accent-text)"
	},
	readHomo: {
		background: "var(--primary-softer)",
		borderColor: "var(--primary-soft)",
		color: "var(--primary)"
	},
	progressNote: {
		fontSize: 12.5,
		color: "var(--text-muted)",
		textAlign: "center",
		fontWeight: 600
	}
};
//#endregion
//#region ../tmp/nadi-slides-fd6e4518-99e0-414a-a92e-35da921944c5/Slide_t1-2_gases_and_handles.jsx
function Jt({ studentName: t }) {
	let n = [
		{
			id: "air",
			name: "Air",
			sub: "N₂ + O₂ (gas + gas)",
			kind: "gg",
			cols: ["#7dd3fc", "#fcd34d"]
		},
		{
			id: "lpg",
			name: "LPG",
			sub: "propane + butane (gas + gas)",
			kind: "gg",
			cols: ["#86efac", "#fb923c"]
		},
		{
			id: "smoke",
			name: "Smoke",
			sub: "soot specks in air (solid + gas)",
			kind: "sg",
			gasC: "#475569",
			bitC: "#0f1622"
		},
		{
			id: "fog",
			name: "Fog",
			sub: "water droplets in air (liquid + gas)",
			kind: "lg",
			gasC: "#475569",
			bitC: "#60a5fa"
		},
		{
			id: "dust",
			name: "Dust haze",
			sub: "dust in air (solid + gas)",
			kind: "sg",
			gasC: "#5b5043",
			bitC: "#c08a3e"
		},
		{
			id: "cloud",
			name: "Cloud",
			sub: "droplets in air (liquid + gas)",
			kind: "lg",
			gasC: "#64748b",
			bitC: "#e2e8f0"
		}
	], [r, i] = w(0), [a, o] = w({}), s = C(null), c = n[r], l = c.kind === "gg", u = l ? "homo" : "hetero", d = a[c.id], f = d != null, p = f && d === u, m = Object.keys(a).length > 0;
	b(() => {
		let e = s.current;
		if (!e) return;
		let t = e.getContext("2d"), i, a = [];
		function o() {
			let n = e.getBoundingClientRect(), r = window.devicePixelRatio || 1;
			e.width = n.width * r, e.height = n.height * r, t.setTransform(r, 0, 0, r, 0, 0);
		}
		function c() {
			let t = e.clientWidth, i = e.clientHeight;
			a = [];
			let o = n[r], s = o.kind;
			if (s === "gg") for (let e = 0; e < 150; e++) a.push({
				x: Math.random() * t,
				y: Math.random() * i,
				vx: (Math.random() - .5) * .45,
				vy: (Math.random() - .5) * .45,
				r: 2.1,
				c: e % 2 ? o.cols[0] : o.cols[1],
				big: !1
			});
			else {
				for (let e = 0; e < 95; e++) a.push({
					x: Math.random() * t,
					y: Math.random() * i,
					vx: (Math.random() - .5) * .3,
					vy: (Math.random() - .5) * .3,
					r: 1.4,
					c: o.gasC,
					big: !1
				});
				for (let e = 0; e < 16; e++) a.push({
					x: Math.random() * t,
					y: Math.random() * i,
					vx: (Math.random() - .5) * .55,
					vy: (Math.random() - .5) * .55,
					r: 5 + Math.random() * 4,
					c: o.bitC,
					big: !0,
					solid: s === "sg"
				});
			}
		}
		o(), c();
		function l() {
			let n = e.clientWidth, r = e.clientHeight;
			t.fillStyle = "#0b1220", t.fillRect(0, 0, n, r);
			for (let e of a) e.x += e.vx, e.y += e.vy, e.x < 0 && (e.x += n), e.x > n && (e.x -= n), e.y < 0 && (e.y += r), e.y > r && (e.y -= r), t.beginPath(), t.arc(e.x, e.y, e.r, 0, Math.PI * 2), t.globalAlpha = e.big && !e.solid ? .55 : 1, t.fillStyle = e.c, t.fill(), e.big && e.solid && (t.globalAlpha = 1, t.strokeStyle = "#334155", t.lineWidth = 1, t.stroke()), t.globalAlpha = 1;
			i = requestAnimationFrame(l);
		}
		l();
		let u = new ResizeObserver(() => {
			o(), c();
		});
		return u.observe(e), () => {
			cancelAnimationFrame(i), u.disconnect();
		};
	}, [r]);
	function h(e) {
		o((t) => ({
			...t,
			[c.id]: e
		}));
	}
	return /* @__PURE__ */ e.createElement(e.Fragment, null, /* @__PURE__ */ e.createElement("div", {
		className: "slide-title",
		style: $.title
	}, "Gases, and Why the Cut Matters"), /* @__PURE__ */ e.createElement("div", {
		className: "slide-left",
		style: $.left
	}, /* @__PURE__ */ e.createElement("div", { style: $.cardHook }, /* @__PURE__ */ e.createElement("span", { style: $.corner }, "💭"), /* @__PURE__ */ e.createElement("p", { style: $.hookText }, t, ", air is a mixture of gases — yet no filter on Earth can strain the oxygen out of it. A face-mask, though, DOES catch smoke. Both float in air, so what's truly different between them? The answer is hiding at the microscopic level.")), /* @__PURE__ */ e.createElement("div", { style: $.plain }, /* @__PURE__ */ e.createElement("p", { style: $.body }, "All substances, at least in principle, can exist in three states: ", /* @__PURE__ */ e.createElement("b", null, "solid"), ", ", /* @__PURE__ */ e.createElement("b", null, "liquid"), ", and ", /* @__PURE__ */ e.createElement("b", null, "gas"), ". Gases differ from liquids and solids in the distances between the molecules. In a solid, molecules are held close together in an orderly fashion with little freedom of motion. Molecules in a liquid are close together but are not held so rigidly in position and can move past one another. In a gas, the molecules are separated by distances that are large compared with the size of the molecules."), /* @__PURE__ */ e.createElement("p", { style: $.body }, "What's floating in the gas decides everything. Read each line as cause → category:"), /* @__PURE__ */ e.createElement("div", { style: $.miniTable }, /* @__PURE__ */ e.createElement("div", { style: $.mtRow }, /* @__PURE__ */ e.createElement("span", { style: $.mtL }, "gas + gas"), /* @__PURE__ */ e.createElement("span", { style: $.mtArrow }, "→"), /* @__PURE__ */ e.createElement("span", { style: $.mtHomo }, "homogeneous")), /* @__PURE__ */ e.createElement("div", { style: $.mtRow }, /* @__PURE__ */ e.createElement("span", { style: $.mtL }, "solid + gas"), /* @__PURE__ */ e.createElement("span", { style: $.mtArrow }, "→"), /* @__PURE__ */ e.createElement("span", { style: $.mtHet }, "heterogeneous")), /* @__PURE__ */ e.createElement("div", { style: $.mtRow }, /* @__PURE__ */ e.createElement("span", { style: $.mtL }, "liquid + gas"), /* @__PURE__ */ e.createElement("span", { style: $.mtArrow }, "→"), /* @__PURE__ */ e.createElement("span", { style: $.mtHet }, "heterogeneous"))), /* @__PURE__ */ e.createElement("p", { style: $.body }, "Microscopically: two gases blend molecule-to-molecule, so they are uniform everywhere. But a solid speck or a liquid droplet holds onto its own little region — so the mix has visibly distinct parts.")), /* @__PURE__ */ e.createElement("div", { style: $.cardPitfall }, /* @__PURE__ */ e.createElement("span", { style: $.corner }, "⚠️"), /* @__PURE__ */ e.createElement("p", { style: $.body }, "It's an easy slip: smoke and fog look like one hazy \"thing,\" so they get called homogeneous. They aren't — they're solid or liquid bits dispersed in gas. ", /* @__PURE__ */ e.createElement("b", null, "Only gas-in-gas is homogeneous."))), m ? /* @__PURE__ */ e.createElement("div", { style: $.cardInsight }, /* @__PURE__ */ e.createElement("span", { style: $.corner }, "💡"), /* @__PURE__ */ e.createElement("p", { style: $.body }, "Here's the payoff — the classification hands you your separation toolbox in C5:"), /* @__PURE__ */ e.createElement("div", { style: $.handleBox }, /* @__PURE__ */ e.createElement("div", { style: $.hHomoRow }, /* @__PURE__ */ e.createElement("b", null, "Homogeneous"), " → ", /* @__PURE__ */ e.createElement("span", { style: $.molTag }, "molecular handles"), /* @__PURE__ */ e.createElement("br", null), /* @__PURE__ */ e.createElement("span", { style: $.handleSub }, "distillation, chromatography — split by a molecular property")), /* @__PURE__ */ e.createElement("div", { style: $.hHetRow }, /* @__PURE__ */ e.createElement("b", null, "Heterogeneous"), " → ", /* @__PURE__ */ e.createElement("span", { style: $.bulkTag }, "bulk-physical handles"), /* @__PURE__ */ e.createElement("br", null), /* @__PURE__ */ e.createElement("span", { style: $.handleSub }, "filtering, settling, spinning — grab the distinct bits")))) : /* @__PURE__ */ e.createElement("div", { style: $.cardLocked }, /* @__PURE__ */ e.createElement("span", { style: $.corner }, "🔒"), /* @__PURE__ */ e.createElement("p", { style: $.bodyMuted }, "Classify a sample on the right to unlock what the label buys you →"))), /* @__PURE__ */ e.createElement("div", {
		className: "slide-right",
		style: $.right
	}, /* @__PURE__ */ e.createElement("div", { style: $.panelTitle }, "Classify the gas mixture"), /* @__PURE__ */ e.createElement("div", { style: $.chips }, n.map((t, n) => /* @__PURE__ */ e.createElement("button", {
		key: t.id,
		onClick: () => i(n),
		style: {
			...$.chip,
			...n === r ? $.chipOn : {},
			...a[t.id] ? $.chipDone : {}
		}
	}, a[t.id] ? a[t.id] === (t.kind === "gg" ? "homo" : "hetero") ? "✓ " : "✗ " : "", t.name))), /* @__PURE__ */ e.createElement("canvas", {
		ref: s,
		style: $.canvas
	}), /* @__PURE__ */ e.createElement("div", { style: $.caption }, l ? "Microscopically: two gases evenly intermingled — no clumps, no regions. Uniform everywhere." : c.kind === "sg" ? "Look closely: solid specks drifting through a faint gas — distinct dark regions you could trap." : "Look closely: liquid droplets suspended in a faint gas — distinct soft regions you could collect."), /* @__PURE__ */ e.createElement("div", { style: $.qLabel }, /* @__PURE__ */ e.createElement("b", null, c.name), " — ", c.sub, ". Uniform at the molecular scale?"), /* @__PURE__ */ e.createElement("div", { style: $.btnRow }, /* @__PURE__ */ e.createElement("button", {
		onClick: () => h("homo"),
		style: {
			...$.classBtn,
			...d === "homo" ? u === "homo" ? $.btnRight : $.btnWrong : {}
		}
	}, "Homogeneous"), /* @__PURE__ */ e.createElement("button", {
		onClick: () => h("hetero"),
		style: {
			...$.classBtn,
			...d === "hetero" ? u === "hetero" ? $.btnRight : $.btnWrong : {}
		}
	}, "Heterogeneous")), f && /* @__PURE__ */ e.createElement("div", { style: {
		...$.feedback,
		...p ? $.fbOk : $.fbNo
	} }, p ? "✓ Nicely reasoned. " : "✗ Let’s rethink this one. ", l ? "Gas + gas → homogeneous. It blends molecule-to-molecule, so it splits by molecular handles." : c.kind === "sg" ? "Solid in gas → heterogeneous. The specks are distinct bits — bulk handles (filter/settle) grab them." : "Liquid in gas → heterogeneous. Droplets are distinct regions — bulk handles (settle/spin) collect them.")));
}
var Yt = {
	background: "var(--surface-raised)",
	border: "1px solid var(--border-light)",
	borderRadius: 10,
	padding: "14px 18px",
	position: "relative",
	paddingRight: 40
}, $ = {
	title: {
		fontSize: 22,
		fontWeight: 700,
		color: "var(--text-primary)"
	},
	left: {
		display: "flex",
		flexDirection: "column",
		gap: 14,
		minWidth: 0
	},
	right: {
		display: "flex",
		flexDirection: "column",
		gap: 12,
		minWidth: 0
	},
	corner: {
		position: "absolute",
		top: 10,
		right: 12,
		fontSize: 16,
		lineHeight: 1
	},
	plain: { padding: "0 2px" },
	cardHook: {
		...Yt,
		background: "var(--hook-soft)",
		borderLeft: "2px solid var(--hook)"
	},
	cardInsight: {
		...Yt,
		background: "var(--primary-softer)",
		borderColor: "var(--primary-soft)",
		borderLeft: "2px solid var(--primary)"
	},
	cardPitfall: {
		...Yt,
		background: "var(--accent-soft)",
		borderLeft: "2px solid var(--accent)"
	},
	cardLocked: {
		...Yt,
		background: "var(--surface)",
		borderStyle: "dashed"
	},
	hCard: {
		fontSize: 14,
		fontWeight: 700,
		color: "var(--primary)",
		marginBottom: 8
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
		lineHeight: 1.6,
		color: "var(--text-primary)",
		margin: "0 0 8px"
	},
	bodyMuted: {
		fontSize: 15,
		lineHeight: 1.6,
		color: "var(--text-muted)",
		margin: 0
	},
	miniTable: {
		display: "flex",
		flexDirection: "column",
		gap: 6,
		margin: "4px 0 10px"
	},
	mtRow: {
		display: "flex",
		alignItems: "center",
		gap: 8,
		fontSize: 14,
		background: "var(--surface)",
		border: "1px solid var(--border-light)",
		borderRadius: 8,
		padding: "7px 12px"
	},
	mtL: {
		fontFamily: "monospace",
		fontWeight: 700,
		color: "var(--text-primary)",
		flex: 1,
		minWidth: 0
	},
	mtArrow: { color: "var(--text-muted)" },
	mtHomo: {
		fontWeight: 700,
		color: "var(--primary)"
	},
	mtHet: {
		fontWeight: 700,
		color: "var(--accent-text)"
	},
	handleBox: {
		display: "flex",
		flexDirection: "column",
		gap: 8
	},
	hHomoRow: {
		fontSize: 14,
		lineHeight: 1.55,
		color: "var(--text-primary)",
		background: "var(--surface)",
		border: "1px solid var(--border-light)",
		borderRadius: 8,
		padding: "8px 12px"
	},
	hHetRow: {
		fontSize: 14,
		lineHeight: 1.55,
		color: "var(--text-primary)",
		background: "var(--surface)",
		border: "1px solid var(--border-light)",
		borderRadius: 8,
		padding: "8px 12px"
	},
	molTag: {
		fontWeight: 700,
		color: "var(--primary)"
	},
	bulkTag: {
		fontWeight: 700,
		color: "var(--accent-text)"
	},
	handleSub: {
		fontSize: 13,
		color: "var(--text-secondary)"
	},
	panelTitle: {
		fontSize: 16,
		fontWeight: 700,
		color: "var(--text-primary)"
	},
	chips: {
		display: "flex",
		flexWrap: "wrap",
		gap: 8
	},
	chip: {
		fontFamily: "inherit",
		fontSize: 13,
		fontWeight: 600,
		padding: "6px 11px",
		borderRadius: 8,
		border: "1px solid var(--border)",
		background: "var(--surface-raised)",
		color: "var(--text-secondary)",
		cursor: "pointer"
	},
	chipOn: {
		background: "var(--primary-soft)",
		borderColor: "var(--primary)",
		color: "var(--primary-text)"
	},
	chipDone: { borderStyle: "solid" },
	canvas: {
		width: "100%",
		aspectRatio: "5 / 3",
		maxHeight: "34vh",
		display: "block",
		borderRadius: 10,
		border: "1px solid var(--border)"
	},
	caption: {
		fontSize: 13,
		color: "var(--text-muted)",
		textAlign: "center",
		margin: 0
	},
	qLabel: {
		fontSize: 14,
		color: "var(--text-primary)",
		textAlign: "center",
		lineHeight: 1.5
	},
	btnRow: {
		display: "flex",
		gap: 10
	},
	classBtn: {
		flex: 1,
		minWidth: 0,
		fontFamily: "inherit",
		fontSize: 15,
		fontWeight: 700,
		padding: "11px 8px",
		borderRadius: 9,
		border: "1px solid var(--border)",
		background: "var(--surface-raised)",
		color: "var(--text-primary)",
		cursor: "pointer"
	},
	btnRight: {
		background: "var(--primary-soft)",
		borderColor: "var(--primary)",
		color: "var(--primary-text)"
	},
	btnWrong: {
		background: "var(--accent-soft)",
		borderColor: "var(--accent)",
		color: "var(--accent-text)"
	},
	feedback: {
		fontSize: 14,
		lineHeight: 1.55,
		borderRadius: 9,
		padding: "10px 14px"
	},
	fbOk: {
		background: "var(--primary-softer)",
		border: "1px solid var(--primary-soft)",
		color: "var(--text-primary)"
	},
	fbNo: {
		background: "var(--accent-soft)",
		border: "1px solid var(--accent)",
		color: "var(--text-primary)"
	}
}, Xt = {
	contractVersion: 1,
	components: {
		"t1-1": se,
		"t3-3_cool_or_evaporate": le,
		"t3-3_why_pure": de,
		"t5-3_fractional_distillation": ge,
		"t5-5_centrifugation": ve,
		"t1--law-of-definite-proportions-hgav": be,
		"t1-2": Ee,
		"t2-1": ke,
		"t1--the-microscopic-level-4v63": Fe,
		"t2-2": ze,
		"t2-3": He,
		"t3-2": We,
		"t3-1": Ke,
		"t2--density-the-bridge-between-mass-based-and-volume-based-measureme-rgwq": Ye,
		"t3-3": Ze,
		"t3--like-dissolves-like-the-three-molecular-tugs-solvent-solvent-sol-2qnq": nt,
		"t3--dissolving-heats-up-or-cools-down-the-why-behind-the-solubility--mflo": st,
		"t4-1": dt,
		"t4-2": bt,
		"t5-2": St,
		"t5-1": Tt,
		"t4-4": Dt,
		"t4-3": kt,
		"t5-4": jt,
		"t5-6": Nt,
		"t5-5": Ft,
		"t5-3": Rt,
		"t5--mixing-is-free-unmixing-costs-energy-separation-fights-the-natur-19vt": Vt,
		"t5-7": Ut,
		"t1-2_where_the_eye_lies": Kt,
		"t1-2_gases_and_handles": Jt
	}
};
//#endregion
export { Xt as default };
