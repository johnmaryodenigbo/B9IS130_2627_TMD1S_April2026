// Decides a monitor's next status from the latest check. Pure function, easy to test.
//
// - Any successful check  -> "up", failure counter reset.
// - A failed check        -> counter + 1; only "down" once it reaches the threshold,
//                            so a single slow/blipped request doesn't page the on-call SRE.
export function nextState({ status, consecutiveFailures = 0 }, ok, threshold) {
  if (ok) return { status: 'up', consecutiveFailures: 0 };

  const failures = consecutiveFailures + 1;
  if (failures >= threshold) return { status: 'down', consecutiveFailures: failures };

  // Not enough failures yet: keep the current status ("up" stays up, "pending" stays pending).
  return { status, consecutiveFailures: failures };
}
