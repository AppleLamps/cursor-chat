const PATH_KEY_PATTERN =
  /^(path|file|filepath|file_path|target|uri|relative_path|absolute_path|filename|file_name)$/i;
const FILE_EXTENSION_PATTERN =
  /\.(tsx?|jsx?|py|go|rs|md|json|ya?ml|css|scss|html|sql|toml|java|kt|swift|rb|php|cs|cpp|c|h|hpp|vue|svelte)$/i;

function normalizeSourcePath(value: string) {
  return value.trim().replace(/\\/g, "/").replace(/^\.\/+/, "");
}

export function isLikelySourcePath(value: string) {
  const path = normalizeSourcePath(value);

  if (!path || path.length > 400) return false;
  if (path.includes("\n") || path.includes(" ")) return false;
  if (/^https?:\/\//i.test(path)) return false;
  if (path.startsWith("data:")) return false;

  if (FILE_EXTENSION_PATTERN.test(path)) return true;

  return path.includes("/") && !path.startsWith("{") && !path.startsWith("[");
}

function collectPaths(value: unknown, paths: Set<string>) {
  if (typeof value === "string") {
    if (isLikelySourcePath(value)) {
      paths.add(normalizeSourcePath(value));
    }
    return;
  }

  if (Array.isArray(value)) {
    for (const item of value) {
      collectPaths(item, paths);
    }
    return;
  }

  if (!value || typeof value !== "object") return;

  for (const [key, nested] of Object.entries(value)) {
    if (PATH_KEY_PATTERN.test(key) && typeof nested === "string") {
      if (isLikelySourcePath(nested)) {
        paths.add(normalizeSourcePath(nested));
      }
    }

    collectPaths(nested, paths);
  }
}

export function extractSourcePaths(
  _toolName: string,
  args?: unknown,
  result?: unknown
) {
  const paths = new Set<string>();
  collectPaths(args, paths);
  collectPaths(result, paths);
  return [...paths].sort((a, b) => a.localeCompare(b));
}

export function githubBlobUrl(repoUrl: string, branch: string, path: string) {
  try {
    const url = new URL(repoUrl);
    const repoPath = url.pathname.replace(/\/+$/, "").replace(/\.git$/, "");
    const cleanPath = normalizeSourcePath(path);
    return `${url.origin}${repoPath}/blob/${branch}/${cleanPath}`;
  } catch {
    return null;
  }
}

export function uniqueSortedSources(sources: string[]) {
  return [...new Set(sources.map(normalizeSourcePath))].sort((a, b) =>
    a.localeCompare(b)
  );
}
