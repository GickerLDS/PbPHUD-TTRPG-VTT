const REQUIRED_VERSIONS = [
  { major: 20, minor: 19, patch: 0 },
  { major: 22, minor: 12, patch: 0 }
];

function parseVersion(version) {
  const match = /^v?(\d+)\.(\d+)\.(\d+)$/.exec(version);
  if (!match) {
    return null;
  }

  return {
    major: Number.parseInt(match[1], 10),
    minor: Number.parseInt(match[2], 10),
    patch: Number.parseInt(match[3], 10)
  };
}

function compareVersions(left, right) {
  if (left.major !== right.major) return left.major - right.major;
  if (left.minor !== right.minor) return left.minor - right.minor;
  return left.patch - right.patch;
}

function isSupported(version) {
  if (version.major === REQUIRED_VERSIONS[0].major) {
    return compareVersions(version, REQUIRED_VERSIONS[0]) >= 0;
  }

  if (version.major === REQUIRED_VERSIONS[1].major) {
    return compareVersions(version, REQUIRED_VERSIONS[1]) >= 0;
  }

  return version.major > REQUIRED_VERSIONS[1].major;
}

const currentVersion = parseVersion(process.version);

if (!currentVersion || !isSupported(currentVersion)) {
  console.error(
    [
      `Unsupported Node.js version: ${process.version || 'unknown'}.`,
      'This project uses Vite 7 and @vitejs/plugin-react 5.',
      'Use Node.js 20.19.0+ or 22.12.0+ before running npm scripts.'
    ].join('\n')
  );
  process.exit(1);
}
