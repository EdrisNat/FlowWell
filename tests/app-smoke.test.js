const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");

const root = path.resolve(__dirname, "..");
const read = (file) => fs.readFileSync(path.join(root, file), "utf8");

function existingLocalReferences(html) {
  const references = [
    ...[...html.matchAll(/(?:src|href)=["']\.\/([^"'#?]+)["']/g)].map((match) => match[1])
  ];
  return references.filter((file) => !file.startsWith("http"));
}

test("the application shell references files that exist", () => {
  const html = read("index.html");
  for (const file of existingLocalReferences(html)) {
    assert.ok(fs.existsSync(path.join(root, file)), `${file} should exist`);
  }
});

test("HTML ids are unique", () => {
  const html = read("index.html");
  const ids = [...html.matchAll(/\sid=["']([^"']+)["']/g)].map((match) => match[1]);
  const duplicates = ids.filter((id, index) => ids.indexOf(id) !== index);
  assert.deepEqual([...new Set(duplicates)], []);
});

test("manifest icons and service-worker app shell are available", () => {
  const manifest = JSON.parse(read("manifest.webmanifest"));
  for (const icon of manifest.icons) assert.ok(fs.existsSync(path.join(root, icon.src)), `${icon.src} should exist`);

  const serviceWorker = read("sw.js");
  const shell = [...serviceWorker.matchAll(/"(\.\/[^"']+)"/g)].map((match) => match[1]);
  for (const file of shell.filter((file) => file !== "./")) {
    assert.ok(fs.existsSync(path.join(root, file.slice(2))), `${file} should exist`);
  }
});

test("privacy and offline hooks remain wired", () => {
  const app = read("app.js");
  const html = read("index.html");
  assert.match(app, /async function unlockWithPin/);
  assert.match(app, /async function exportEncryptedData/);
  assert.match(app, /navigator\.serviceWorker\.register/);
  assert.match(app, /window\.addEventListener\("offline"/);
  assert.match(html, /id="connectionStatus"/);
  assert.match(html, /id="privacyPinConfirm"/);
});
