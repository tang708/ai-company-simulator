const { spawn } = require("child_process");
const path = require("path");

const cwd = path.resolve(__dirname, "..");
const nextBin = path.join(cwd, "node_modules", "next", "dist", "bin", "next");

const child = spawn("node", [nextBin, "build"], {
  stdio: "inherit",
  cwd,
});

child.on("close", (code) => process.exit(code));
