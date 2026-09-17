export function getCurrentEventDay(): 1 | 2 | 3 {
  const [y, m, d] = import.meta.env.VITE_EVENT_START_DATE.split('-').map(Number)
  const start = new Date(y, m - 1, d) // local midnight on event start date
  const today = new Date()
  today.setHours(0, 0, 0, 0) // local midnight today
  const diff = Math.round((today.getTime() - start.getTime()) / (1000 * 60 * 60 * 24))
  const day = diff + 1
  if (day <= 1) return 1
  if (day >= 3) return 3
  return day as 2
}
