const fs = require("fs");
const path = require("path");

const root = path.join(__dirname, "..");
const src = path.join(root, "src");
const dist = path.join(root, "dist");

fs.mkdirSync(path.join(dist, "popup"), { recursive: true });
fs.copyFileSync(path.join(src, "manifest.json"), path.join(dist, "manifest.json"));
fs.copyFileSync(path.join(src, "popup", "popup.html"), path.join(dist, "popup", "popup.html"));
fs.copyFileSync(path.join(src, "popup", "popup.css"), path.join(dist, "popup", "popup.css"));

const icons = path.join(src, "icons");
if (fs.existsSync(icons)) {
  fs.cpSync(icons, path.join(dist, "icons"), { recursive: true });
}
