const [, , releaseType] = process.argv;

if (!releaseType || !["patch", "minor", "major"].includes(releaseType)) {
  console.error("Usage: bun run scripts/bump-version.mjs <patch|minor|major>");
  process.exit(1);
}

const packageJsonPath = new URL("../../../package.json", import.meta.url);
const packageJson = await Bun.file(packageJsonPath).json();

const versionMatch = /^(\d+)\.(\d+)\.(\d+)$/.exec(packageJson.version);
if (!versionMatch) {
  console.error(`Unsupported version format: ${packageJson.version}`);
  process.exit(1);
}

const versionParts = versionMatch
  .slice(1)
  .map((part) => Number.parseInt(part, 10));

switch (releaseType) {
  case "major":
    versionParts[0] += 1;
    versionParts[1] = 0;
    versionParts[2] = 0;
    break;
  case "minor":
    versionParts[1] += 1;
    versionParts[2] = 0;
    break;
  default:
    versionParts[2] += 1;
    break;
}

packageJson.version = versionParts.join(".");

await Bun.write(packageJsonPath, `${JSON.stringify(packageJson, null, 2)}\n`);

console.log(packageJson.version);
