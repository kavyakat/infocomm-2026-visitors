import { useState } from 'react'
import { Link } from 'react-router-dom'

type PresetWinner = {
  position: 1 | 2 | 3
  name: string
  designation: string
  company: string
}

function rankBadge(pos: number): string {
  if (pos === 1) return '🥇'
  if (pos === 2) return '🥈'
  return '🥉'
}

function rankLabel(pos: number): string {
  if (pos === 1) return '1st Prize'
  if (pos === 2) return '2nd Prize'
  return '3rd Prize'
}

function normalize(s: string): string {
  return s.toLowerCase().replace(/[\s_-]+/g, '')
}

export default function PresetDraw() {
  const [winners, setWinners] = useState<PresetWinner[]>([])
  const [error, setError] = useState('')

  function downloadSample() {
    import('xlsx').then(XLSX => {
      const rows = [
        { name: 'Priya Sharma', designation: 'Product Manager', company: 'Acme Tech', 'final-position': 1 },
        { name: 'Ravi Kumar', designation: 'CTO', company: 'Beta Solutions', 'final-position': 2 },
        { name: 'Anita Patel', designation: 'Director', company: 'Gamma Corp', 'final-position': '' },
      ]
      const ws = XLSX.utils.json_to_sheet(rows)
      const wb = XLSX.utils.book_new()
      XLSX.utils.book_append_sheet(wb, ws, 'PresetDraw')
      XLSX.writeFile(wb, 'preset-draw-sample.xlsx')
    })
  }

  function handleFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return
    setError('')
    setWinners([])

    const reader = new FileReader()
    reader.onload = async ev => {
      try {
        const XLSX = await import('xlsx')
        const data = new Uint8Array(ev.target!.result as ArrayBuffer)
        const wb = XLSX.read(data, { type: 'array' })
        const ws = wb.Sheets[wb.SheetNames[0]]
        if (!ws) { setError('No sheet found in the file.'); return }

        const raw = XLSX.utils.sheet_to_json<Record<string, unknown>>(ws, { defval: '' })
        if (raw.length === 0) { setError('The file has no data rows.'); return }

        const headerKeys = Object.keys(raw[0])
        const find = (target: string) =>
          headerKeys.find(k => normalize(k) === normalize(target))

        const nameKey = find('name')
        const desigKey = find('designation')
        const compKey = find('company')
        const posKey = find('final-position')

        if (!nameKey || !desigKey || !compKey || !posKey) {
          setError('Required columns not found. Expected: name, designation, company, final-position.')
          return
        }

        const parsed: PresetWinner[] = []
        for (const row of raw) {
          const pos = Number(row[posKey])
          if (pos === 1 || pos === 2 || pos === 3) {
            parsed.push({
              position: pos as 1 | 2 | 3,
              name: String(row[nameKey] ?? '').trim(),
              designation: String(row[desigKey] ?? '').trim(),
              company: String(row[compKey] ?? '').trim(),
            })
          }
        }

        if (parsed.length === 0) {
          setError('No rows with final-position 1, 2, or 3 found in the file.')
          return
        }

        setWinners(parsed.sort((a, b) => a.position - b.position))
      } catch {
        setError('Could not parse the file. Make sure it is a valid .xlsx file.')
      }
    }
    reader.readAsArrayBuffer(file)
    e.target.value = ''
  }

  return (
    <div className="min-h-screen bg-gray-50">
      <nav className="bg-primary text-white px-6 py-3 flex items-center justify-between">
        <span className="font-semibold text-sm">Preset Draw</span>
        <Link to="/organizer/draw" className="text-xs opacity-75 hover:opacity-100">← Live Draw</Link>
      </nav>

      <div className="max-w-xl mx-auto p-6 space-y-6">
        <div className="bg-white rounded-xl border border-gray-200 p-5 space-y-4">
          <h2 className="text-base font-semibold text-gray-800">Upload Winner List</h2>
          <p className="text-sm text-gray-500">
            Upload an Excel file with columns: <code className="text-xs bg-gray-100 px-1 rounded">name</code>, <code className="text-xs bg-gray-100 px-1 rounded">designation</code>, <code className="text-xs bg-gray-100 px-1 rounded">company</code>, <code className="text-xs bg-gray-100 px-1 rounded">final-position</code>.
            Rows with position 1, 2, or 3 are shown as winners.
          </p>
          <div className="flex flex-col gap-3 sm:flex-row">
            <button
              onClick={downloadSample}
              className="text-sm border border-gray-300 rounded-lg px-4 py-2 text-gray-700 hover:bg-gray-50 font-medium"
            >
              Download Sample Excel
            </button>
            <label className="text-sm bg-primary text-white rounded-lg px-4 py-2 font-medium cursor-pointer hover:opacity-90 text-center">
              Upload .xlsx
              <input type="file" accept=".xlsx" className="hidden" onChange={handleFile} />
            </label>
          </div>
          {error && <p className="text-sm text-red-600">{error}</p>}
        </div>

        {winners.length > 0 && (
          <div className="space-y-3">
            <h2 className="text-lg font-semibold text-gray-800">Winners</h2>
            {winners.map(w => (
              <div key={w.position} className="bg-white rounded-xl border border-gray-200 p-5 flex items-center gap-4">
                <span className="text-3xl">{rankBadge(w.position)}</span>
                <div className="flex-1 min-w-0">
                  <div className="font-semibold text-gray-900">{w.name}</div>
                  {w.company && (
                    <div className="text-xs text-gray-400">{w.company}{w.designation ? ` · ${w.designation}` : ''}</div>
                  )}
                </div>
                <div className="text-xs text-gray-400 text-right">{rankLabel(w.position)}</div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
