import { mkdir, readFile, writeFile } from "node:fs/promises";

const html = await readFile(new URL("../dist/index.html", import.meta.url), "utf8");
const template = await readFile(new URL("../src/worker-template.mjs", import.meta.url), "utf8");
const output = template.replace("__VOYAGER_HTML__", JSON.stringify(html));
await mkdir(new URL("../dist/server/", import.meta.url), { recursive: true });
await writeFile(new URL("../dist/server/index.js", import.meta.url), output);
console.log("Built dist/server/index.js");

