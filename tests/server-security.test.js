const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs/promises");
const os = require("node:os");
const path = require("node:path");
const net = require("node:net");
const { spawn } = require("node:child_process");

test("static server exposes website files but not private or server files", async (t) => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "growify-server-test-"));
  t.after(() => fs.rm(root, { recursive: true, force: true }));
  await fs.copyFile(path.join(__dirname, "..", "server.js"), path.join(root, "server.js"));
  await fs.mkdir(path.join(root, "data"), { recursive: true });
  await fs.mkdir(path.join(root, "assets"), { recursive: true });
  await fs.mkdir(path.join(root, "planten"), { recursive: true });
  await fs.writeFile(path.join(root, "index.html"), "<main>Growify</main>");
  await fs.writeFile(path.join(root, "styles.css"), "body { color: green; }");
  await fs.writeFile(path.join(root, "script.js"), "console.log('Growify');");
  await fs.writeFile(path.join(root, "assets", "plant.svg"), "<svg />");
  await fs.writeFile(path.join(root, "planten", "index.html"), "<main>Planten</main>");
  await fs.writeFile(path.join(root, "data", "sproutly.json"), '{"users":[{"email":"private@example.test","passwordHash":"secret"}]}');
  await fs.writeFile(path.join(root, "data", "sproutly.json.bak"), "private backup");

  const listener = net.createServer();
  await new Promise((resolve) => listener.listen(0, "127.0.0.1", resolve));
  const port = listener.address().port;
  await new Promise((resolve, reject) => listener.close((error) => error ? reject(error) : resolve()));

  const server = spawn(process.execPath, [path.join(root, "server.js")], {
    env: { ...process.env, PORT: String(port) }, stdio: ["ignore", "pipe", "pipe"]
  });
  t.after(async () => {
    if (server.exitCode !== null) return;
    const exited = new Promise((resolve) => server.once("exit", resolve));
    server.kill();
    await exited;
  });
  await new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error("Testserver startte niet.")), 10000);
    server.stdout.once("data", () => { clearTimeout(timer); resolve(); });
    server.once("error", (error) => { clearTimeout(timer); reject(error); });
    server.once("exit", (code) => { clearTimeout(timer); reject(new Error(`Testserver gestopt: ${code}`)); });
  });

  const baseUrl = `http://127.0.0.1:${port}`;
  for (const pathname of ["/", "/styles.css", "/script.js", "/planten/", "/assets/plant.svg"]) {
    const response = await fetch(`${baseUrl}${pathname}`);
    assert.equal(response.status, 200, pathname);
  }
  for (const pathname of [
    "/data/sproutly.json",
    "/data/sproutly.json.bak",
    "/assets/../data/sproutly.json",
    "/server.js",
    "/package.json",
    "/supabase/setup.sql",
    "/.git/config"
  ]) {
    const response = await fetch(`${baseUrl}${pathname}`);
    assert.equal(response.status, 404, pathname);
  }
});
