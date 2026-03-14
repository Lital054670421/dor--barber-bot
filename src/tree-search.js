function isObject(value) {
  return value !== null && typeof value === "object";
}

export function walkObjects(root, visitor) {
  const queue = [root];
  const seen = new Set();

  while (queue.length > 0) {
    const value = queue.shift();

    if (!isObject(value) || seen.has(value)) {
      continue;
    }

    seen.add(value);
    visitor(value);

    if (Array.isArray(value)) {
      for (const item of value) {
        queue.push(item);
      }
      continue;
    }

    for (const nested of Object.values(value)) {
      queue.push(nested);
    }
  }
}

export function collectObjects(root, predicate) {
  const matches = [];
  walkObjects(root, (value) => {
    if (predicate(value)) {
      matches.push(value);
    }
  });
  return matches;
}
