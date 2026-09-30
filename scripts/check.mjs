import worker from "../dist/server/index.js";

const page = await worker.fetch(new Request("https://voyager.test/"), {}, {});
if (page.status !== 200 || !(await page.text()).includes("Voyager AI")) throw new Error("Homepage check failed");

const health = await worker.fetch(new Request("https://voyager.test/api/health"), {}, {});
const healthBody = await health.json();
if (health.status !== 200 || healthBody.configured !== false) throw new Error("Health check failed");

const chat = await worker.fetch(new Request("https://voyager.test/api/chat", {
  method: "POST",
  headers: { "content-type": "application/json" },
  body: JSON.stringify({ model: "Nemotron 3.5 Lightning", messages: [{ role: "user", content: "Hello" }] })
}), {}, {});
if (chat.status !== 503) throw new Error("Missing-key guard failed");
console.log("All checks passed");

