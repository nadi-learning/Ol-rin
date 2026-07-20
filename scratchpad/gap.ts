const s = await Bun.file("frontend/src/components/AppShell.tsx").text();
const code = (x: string) => x.replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:])\/\/.*$/gm, "$1");
const c = code(s);
const a = c.indexOf('label="Crew"');
const b = c.indexOf('onClick={() => onNavigate("crew")}');
console.log("gap chars:", b - a);
console.log(JSON.stringify(c.slice(a, b + 40)));
