// Best effort only. Chrome and Brave on Android buzz; Safari on iOS has no
// vibration API at all, so this is a bonus where it exists, never a promise.
const buzz = (pattern) => {
  try {
    navigator.vibrate?.(pattern)
  } catch {
    /* unsupported or blocked - nothing to do */
  }
}

export const tapFeedback = () => buzz(12)
export const successFeedback = () => buzz([14, 40, 22])
export const undoFeedback = () => buzz([8, 30, 8])
