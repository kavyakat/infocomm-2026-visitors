export function parseExhibitorCsv(csv: string): Array<{ name: string; booth_number: string; hall: string; is_platinum: boolean }> {
  const lines = csv.trim().split('\n')
  const header = lines[0].split(',').map(c => c.trim().toLowerCase())
  const platinumIdx = header.indexOf('is_platinum')
  return lines.slice(1).flatMap(line => {
    const cols = line.split(',').map(c => c.trim())
    const [name, booth_number, hall] = cols
    if (!name || !booth_number || !hall) return []
    const rawPlatinum = platinumIdx >= 0 ? cols[platinumIdx] : ''
    const is_platinum = rawPlatinum === 'true' || rawPlatinum === '1'
    return [{ name, booth_number, hall, is_platinum }]
  })
}
