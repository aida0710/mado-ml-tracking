// Runs a script's list of captures: all of them, or only the ones named on the command line.

/** Fails before anything runs when a name on the command line is not one of the captures. */
export function assertKnownCaptures(captures, names) {
  const unknown = names.filter((name) => !Object.hasOwn(captures, name));
  if (unknown.length) throw new Error(`unknown screenshot: ${unknown.join(', ')}`);
}

/**
 * Runs the named captures (all when `only` is empty) one after another. A failed capture is
 * reported and the rest still run; the exit code is 1 when any failed.
 */
export async function runCaptures(captures, only, capture) {
  assertKnownCaptures(captures, only);
  const failed = [];
  for (const [name, prepare] of Object.entries(captures)) {
    if (only.length && !only.includes(name)) continue;
    try {
      await capture(name, prepare);
    } catch (error) {
      failed.push(name);
      console.log('FAILED', name, error.message.split('\n')[0]);
    }
  }
  if (failed.length) process.exitCode = 1;
  return failed;
}
