export function formatPostingTime(time: string) {
  const match = time.match(/^(\d{2}:\d{2})/);
  return match?.[1] ?? time;
}

export function formatPostingTimes(times: string[]) {
  return times.map(formatPostingTime).join(",");
}
