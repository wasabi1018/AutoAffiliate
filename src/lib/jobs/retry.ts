export function retryDelaySeconds(attemptNumber: number, baseSeconds = 60, maxSeconds = 3600) {
  const exponent = Math.max(0, Math.floor(attemptNumber) - 1);
  return Math.min(maxSeconds, baseSeconds * 2 ** exponent);
}

export function nextRetryStatus(attemptNumber: number, maxAttempts: number) {
  return attemptNumber >= maxAttempts ? "dead_letter" as const : "queued" as const;
}
