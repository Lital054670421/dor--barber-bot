import path from "node:path";
import { readTextFile } from "./json-file.js";

function parseLine(line) {
  const trimmed = line.trim();

  if (!trimmed || trimmed.startsWith("#")) {
    return null;
  }

  const separatorIndex = trimmed.indexOf("=");

  if (separatorIndex === -1) {
    return null;
  }

  const key = trimmed.slice(0, separatorIndex).trim();
  let value = trimmed.slice(separatorIndex + 1).trim();

  if (
    (value.startsWith("\"") && value.endsWith("\"")) ||
    (value.startsWith("'") && value.endsWith("'"))
  ) {
    value = value.slice(1, -1);
  }

  return { key, value };
}

export async function loadDotEnv(cwd) {
  const envPath = path.join(cwd, ".env");
  const raw = await readTextFile(envPath, null);

  if (raw === null) {
    return;
  }

  for (const line of raw.split(/\r?\n/)) {
    const entry = parseLine(line);

    if (!entry) {
      continue;
    }

    if (!(entry.key in process.env)) {
      process.env[entry.key] = entry.value;
    }
  }
}
