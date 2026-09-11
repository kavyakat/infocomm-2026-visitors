import { useState, useEffect, useRef } from 'react'
import { Link } from 'react-router-dom'
import { supabase, type Exhibitor } from '../../lib/supabase'
import { generatePin } from '../../lib/pins'
import { useAuth } from '../../hooks/useAuth'
import { parseExhibitorCsv } from '../../lib/exhibitors'
import { downloadExcel } from '../../lib/export'

export default function Exhibitors() {
  const { signOut } = useAuth()
  const [exhibitors, setExhibitors] = useState<Exhibitor[]>([])
  const [loading, setLoading] = useState(true)
  const [importing, setImporting] = useState(false)
  const [importError, setImportError] = useState('')
  const fileRef = useRef<HTMLInputElement>(null)
  const [showAddForm, setShowAddForm] = useState(false)
  const [addForm, setAddForm] = useState({ name: '', booth_number: '', hall: '' })
  const [addError, setAddError] = useState('')
  const [adding, setAdding] = useState(false)
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null)
  const [deleting, setDeleting] = useState(false)
  const [editId, setEditId] = useState<string | null>(null)
  const [editForm, setEditForm] = useState({ name: '', booth_number: '', hall: '' })
  const [editError, setEditError] = useState('')
  const [editSaving, setEditSaving] = useState(false)
  const [search, setSearch] = useState('')
  const [hallFilter, setHallFilter] = useState('')
  const [pendingCsvRows, setPendingCsvRows] = useState<Array<{ name: string; booth_number: string; hall: string; is_platinum: boolean }> | null>(null)
  const [regenId, setRegenId] = useState<string | null>(null)
  const [regenPinValue, setRegenPinValue] = useState('')
  const [regenError, setRegenError] = useState('')
  const [regenSaving, setRegenSaving] = useState(false)

  async function loadExhibitors() {
    const { data } = await supabase.from('exhibitors').select('*').order('name')
    setExhibitors(data ?? [])
    setLoading(false)
  }

  useEffect(() => {
    async function init() {
      const { data } = await supabase.from('exhibitors').select('*').order('name')
      setExhibitors(data ?? [])
      setLoading(false)
    }
    init()
  }, [])

  async function handleCsvPick(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return
    setImportError('')
    try {
      const text = await file.text()
      const rows = parseExhibitorCsv(text)
      if (rows.length === 0) { setImportError('No valid rows found in CSV'); return }
      setPendingCsvRows(rows)
    } catch {
      setImportError('Failed to parse CSV')
    }
    if (fileRef.current) fileRef.current.value = ''
  }

  async function confirmCsvImport() {
    if (!pendingCsvRows) return
    setImporting(true)
    setImportError('')
    setPendingCsvRows(null)
    try {
      const existingMap = new Map(exhibitors.map(ex => [`${ex.name}|${ex.booth_number}`, ex]))

      const usedPins = new Set<string>()
      const inserts = pendingCsvRows.map(row => {
        const existing = existingMap.get(`${row.name}|${row.booth_number}`)
        const pin = (existing && !usedPins.has(existing.pin))
          ? existing.pin
          : generatePin(usedPins)
        usedPins.add(pin)
        const is_platinum = existing ? (existing.is_platinum || row.is_platinum) : row.is_platinum
        return { ...row, pin, is_platinum }
      })

      const { error: delError } = await supabase.from('exhibitors').delete().gte('created_at', '1970-01-01')
      if (delError) { console.error('[csvImport] delete failed:', delError); setImportError(delError.message); setImporting(false); return }

      const { error } = await supabase.from('exhibitors').insert(inserts)
      if (error) { console.error('[csvImport] insert failed:', error); setImportError(error.message); setImporting(false); return }
      await loadExhibitors()
    } catch (e) {
      console.error('[csvImport] unexpected error:', e)
      setImportError('Failed to import CSV')
    }
    setImporting(false)
  }

  async function handleAdd() {
    if (!addForm.name.trim() || !addForm.booth_number.trim() || !addForm.hall.trim()) {
      setAddError('All fields are required')
      return
    }
    setAdding(true)
    setAddError('')
    const existingPins = new Set(exhibitors.map(ex => ex.pin))
    const pin = generatePin(existingPins)
    const { error } = await supabase.from('exhibitors').insert([{ ...addForm, pin }])
    if (error) { console.error('[handleAdd]', error); setAddError(error.message); setAdding(false); return }
    setAddForm({ name: '', booth_number: '', hall: '' })
    setShowAddForm(false)
    await loadExhibitors()
    setAdding(false)
  }

  async function handleDelete(id: string) {
    setDeleting(true)
    const { error } = await supabase.from('exhibitors').delete().eq('id', id)
    if (error) console.error('[handleDelete]', error)
    setConfirmDeleteId(null)
    await loadExhibitors()
    setDeleting(false)
  }

  async function handleEditSave() {
    if (!editForm.name.trim() || !editForm.booth_number.trim() || !editForm.hall.trim()) {
      setEditError('All fields are required')
      return
    }
    setEditSaving(true)
    setEditError('')
    const { error } = await supabase.from('exhibitors').update({
      name: editForm.name.trim(),
      booth_number: editForm.booth_number.trim(),
      hall: editForm.hall.trim(),
    }).eq('id', editId!)
    if (error) { console.error('[handleEditSave]', error); setEditError(error.message); setEditSaving(false); return }
    setEditId(null)
    await loadExhibitors()
    setEditSaving(false)
  }

  function startRegen(exhibitor: Exhibitor) {
    const otherPins = new Set(exhibitors.filter(ex => ex.id !== exhibitor.id).map(ex => ex.pin))
    setRegenId(exhibitor.id)
    setRegenPinValue(generatePin(otherPins))
    setRegenError('')
  }

  async function saveRegenPin(exhibitor: Exhibitor) {
    const pin = regenPinValue.trim()
    if (!/^\d{4}$/.test(pin)) { setRegenError('PIN must be 4 digits'); return }
    const duplicate = exhibitors.some(ex => ex.id !== exhibitor.id && ex.pin === pin)
    if (duplicate) { setRegenError('PIN already in use'); return }
    setRegenSaving(true)
    setRegenError('')
    const { error } = await supabase.from('exhibitors').update({ pin }).eq('id', exhibitor.id)
    if (error) { console.error('[saveRegenPin]', error); setRegenError(error.message); setRegenSaving(false); return }
    setRegenId(null)
    await loadExhibitors()
    setRegenSaving(false)
  }

  async function togglePlatinum(exhibitor: Exhibitor) {
    const { error } = await supabase
      .from('exhibitors')
      .update({ is_platinum: !exhibitor.is_platinum })
      .eq('id', exhibitor.id)
    if (error) { console.error('[togglePlatinum]', error); return }
    setExhibitors(prev => prev.map(ex => ex.id === exhibitor.id ? { ...ex, is_platinum: !ex.is_platinum } : ex))
  }

  const halls = Array.from(new Set(exhibitors.map(ex => ex.hall))).sort()

  function cardNameSize(name: string): string {
    const len = name.length
    if (len <= 18) return '0.9rem'
    if (len <= 26) return '0.8rem'
    if (len <= 34) return '0.7rem'
    if (len <= 44) return '0.6rem'
    return '0.52rem'
  }
  const filteredExhibitors = exhibitors.filter(ex => {
    const matchesSearch = ex.name.toLowerCase().includes(search.toLowerCase()) ||
      ex.booth_number.toLowerCase().includes(search.toLowerCase())
    const matchesHall = !hallFilter || ex.hall === hallFilter
    return matchesSearch && matchesHall
  })

  return (
    <div className="min-h-screen bg-gray-50">
      <style>{`
        @media print {
          .no-print { display: none !important; }
          .print-grid {
            display: grid !important;
            grid-template-columns: repeat(3, 1fr);
            grid-auto-rows: 150px;
            gap: 0.75rem;
            padding: 1rem;
          }
          .pin-card {
            border: 2px solid #000;
            padding: 0.75rem;
            text-align: center;
            page-break-inside: avoid;
            height: 150px;
            box-sizing: border-box;
            display: flex;
            flex-direction: column;
            align-items: center;
            justify-content: center;
            overflow: hidden;
          }
          .pin-card .card-name {
            font-weight: 600;
            word-break: break-word;
            line-height: 1.2;
            width: 100%;
          }
          .pin-card .card-sub {
            font-size: 0.7rem;
            color: #555;
            margin-top: 0.15rem;
            width: 100%;
          }
          .pin-card .pin {
            font-size: 2.25rem;
            font-weight: 700;
            letter-spacing: 0.3rem;
            margin-top: 0.4rem;
            line-height: 1;
          }
        }
        @media not print {
          .print-grid { display: none; }
        }
      `}</style>

      <nav className="no-print bg-primary text-white px-6 py-3 flex items-center justify-between">
        <span className="font-bold">InfoComm India 2026 — Organizer</span>
        <div className="flex items-center gap-4 text-sm">
          <Link to="/organizer" className="underline">Exhibitors</Link>
          <Link to="/organizer/feed" className="hover:underline">Feed</Link>
          <Link to="/organizer/analytics" className="hover:underline">Analytics</Link>
          <Link to="/organizer/draw" className="hover:underline">Lucky Draw</Link>
          <Link to="/organizer/users" className="hover:underline">Users</Link>
          <Link to="/organizer/settings" className="hover:underline">Settings</Link>
          <Link to="/leaderboard" className="hover:underline">Leaderboard</Link>
          <button onClick={signOut} className="bg-white text-primary font-semibold px-3 py-1 rounded">Sign Out</button>
        </div>
      </nav>

      <div className="no-print max-w-5xl mx-auto p-6 space-y-6">
        <div className="flex items-center justify-between">
          <h1 className="text-2xl font-bold text-gray-900">Exhibitors</h1>
          <div className="flex gap-3">
            <button
              onClick={() => { setShowAddForm(v => !v); setAddError('') }}
              className="bg-primary text-white px-4 py-2 rounded-lg text-sm font-medium hover:opacity-90"
            >
              {showAddForm ? 'Cancel' : '+ Add Exhibitor'}
            </button>
            <label className="cursor-pointer bg-white border border-gray-300 text-gray-700 px-4 py-2 rounded-lg text-sm font-medium hover:bg-gray-50">
              {importing ? 'Importing…' : 'Import CSV'}
              <input
                ref={fileRef}
                type="file"
                accept=".csv"
                className="hidden"
                onChange={handleCsvPick}
                disabled={importing}
              />
            </label>
            <button
              onClick={() => window.print()}
              className="bg-white border border-gray-300 text-gray-700 px-4 py-2 rounded-lg text-sm font-medium hover:bg-gray-50"
            >
              Print PIN Sheet
            </button>
            {exhibitors.length > 0 && (
              <button
                onClick={() => downloadExcel('exhibitors.xlsx', [{
                  name: 'Exhibitors',
                  rows: exhibitors.map(ex => ({
                    'Name': ex.name,
                    'Booth': ex.booth_number,
                    'Hall': ex.hall,
                    'PIN': ex.pin,
                    'Platinum': ex.is_platinum ? 'Yes' : 'No',
                  })),
                }])}
                className="bg-white border border-gray-300 text-gray-700 px-4 py-2 rounded-lg text-sm font-medium hover:bg-gray-50"
              >
                Export Excel
              </button>
            )}
          </div>
        </div>

        {showAddForm && (
          <div className="bg-white rounded-xl border border-gray-200 p-5 space-y-4">
            <h2 className="text-sm font-semibold text-gray-700">New Exhibitor</h2>
            <div className="grid grid-cols-3 gap-3">
              <input
                placeholder="Name"
                value={addForm.name}
                onChange={e => setAddForm(f => ({ ...f, name: e.target.value }))}
                className="border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary"
              />
              <input
                placeholder="Booth number"
                value={addForm.booth_number}
                onChange={e => setAddForm(f => ({ ...f, booth_number: e.target.value }))}
                className="border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary"
              />
              <input
                placeholder="Hall"
                value={addForm.hall}
                onChange={e => setAddForm(f => ({ ...f, hall: e.target.value }))}
                className="border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary"
              />
            </div>
            {addError && <p className="text-red-500 text-xs">{addError}</p>}
            <button
              onClick={handleAdd}
              disabled={adding}
              className="bg-primary text-white px-4 py-2 rounded-lg text-sm font-medium disabled:opacity-50 hover:opacity-90"
            >
              {adding ? 'Adding…' : 'Add Exhibitor'}
            </button>
          </div>
        )}

        {importError && <p className="text-red-500 text-sm">{importError}</p>}

        {!loading && exhibitors.length > 0 && (
          <div className="flex gap-3">
            <input
              type="search"
              placeholder="Search by name or booth…"
              value={search}
              onChange={e => setSearch(e.target.value)}
              className="flex-1 border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary"
            />
            <select
              value={hallFilter}
              onChange={e => setHallFilter(e.target.value)}
              className="border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary bg-white"
            >
              <option value="">All halls</option>
              {halls.map(h => <option key={h} value={h}>{h}</option>)}
            </select>
          </div>
        )}

        {loading ? (
          <div className="flex justify-center py-12">
            <div className="w-6 h-6 border-2 border-primary border-t-transparent rounded-full animate-spin" />
          </div>
        ) : exhibitors.length === 0 ? (
          <p className="text-gray-500 text-center py-12">No exhibitors yet. Add one or import a CSV to get started.</p>
        ) : filteredExhibitors.length === 0 ? (
          <p className="text-gray-500 text-center py-12">No exhibitors match your search.</p>
        ) : (
          <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
            <table className="w-full text-sm">
              <thead className="bg-gray-50 border-b border-gray-200">
                <tr>
                  <th className="text-left px-4 py-3 font-semibold text-gray-700">Name</th>
                  <th className="text-left px-4 py-3 font-semibold text-gray-700">Booth</th>
                  <th className="text-left px-4 py-3 font-semibold text-gray-700">Hall</th>
                  <th className="text-left px-4 py-3 font-semibold text-gray-700">PIN</th>
                  <th className="text-center px-4 py-3 font-semibold text-gray-700">Platinum</th>
                  <th className="px-4 py-3" />
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {filteredExhibitors.map(ex => (
                  <tr key={ex.id} className="odd:bg-primary-subtle">
                    {editId === ex.id ? (
                      <>
                        <td className="px-2 py-2">
                          <input
                            value={editForm.name}
                            onChange={e => setEditForm(f => ({ ...f, name: e.target.value }))}
                            className="w-full border border-gray-300 rounded px-2 py-1 text-sm focus:outline-none focus:ring-2 focus:ring-primary"
                          />
                        </td>
                        <td className="px-2 py-2">
                          <input
                            value={editForm.booth_number}
                            onChange={e => setEditForm(f => ({ ...f, booth_number: e.target.value }))}
                            className="w-full border border-gray-300 rounded px-2 py-1 text-sm focus:outline-none focus:ring-2 focus:ring-primary"
                          />
                        </td>
                        <td className="px-2 py-2">
                          <input
                            value={editForm.hall}
                            onChange={e => setEditForm(f => ({ ...f, hall: e.target.value }))}
                            className="w-full border border-gray-300 rounded px-2 py-1 text-sm focus:outline-none focus:ring-2 focus:ring-primary"
                          />
                        </td>
                        <td className="px-4 py-2 font-mono font-bold text-primary">{ex.pin}</td>
                        <td className="px-4 py-3 text-center">
                          <button
                            onClick={() => togglePlatinum(ex)}
                            className={`text-lg leading-none ${ex.is_platinum ? 'text-amber-500' : 'text-gray-300 hover:text-amber-300'}`}
                            title={ex.is_platinum ? 'Remove platinum' : 'Mark as platinum'}
                          >★</button>
                        </td>
                        <td className="px-2 py-2 text-right">
                          {editError && <p className="text-red-500 text-xs mb-1">{editError}</p>}
                          <div className="flex items-center justify-end gap-2">
                            <button
                              onClick={handleEditSave}
                              disabled={editSaving}
                              className="text-xs text-white bg-primary hover:opacity-90 rounded px-2 py-1 disabled:opacity-50"
                            >
                              {editSaving ? '…' : 'Save'}
                            </button>
                            <button
                              onClick={() => { setEditId(null); setEditError('') }}
                              className="text-xs text-gray-500 hover:text-gray-700 border border-gray-200 rounded px-2 py-1"
                            >
                              Cancel
                            </button>
                          </div>
                        </td>
                      </>
                    ) : (
                      <>
                        <td className="px-4 py-3 font-medium text-gray-900">{ex.name}</td>
                        <td className="px-4 py-3 text-gray-600">{ex.booth_number}</td>
                        <td className="px-4 py-3 text-gray-600">{ex.hall}</td>
                        <td className="px-2 py-2">
                          {regenId === ex.id ? (
                            <div className="flex flex-col gap-1">
                              <input
                                value={regenPinValue}
                                onChange={e => { setRegenPinValue(e.target.value.replace(/\D/g, '').slice(0, 4)); setRegenError('') }}
                                maxLength={4}
                                className="w-20 border border-primary rounded px-2 py-1 text-sm font-mono font-bold text-primary text-center focus:outline-none focus:ring-2 focus:ring-primary"
                              />
                              {regenError && <p className="text-red-500 text-xs">{regenError}</p>}
                            </div>
                          ) : (
                            <span className="px-2 font-mono font-bold text-primary">{ex.pin}</span>
                          )}
                        </td>
                        <td className="px-4 py-3 text-center">
                          <button
                            onClick={() => togglePlatinum(ex)}
                            className={`text-lg leading-none ${ex.is_platinum ? 'text-amber-500' : 'text-gray-300 hover:text-amber-300'}`}
                            title={ex.is_platinum ? 'Remove platinum' : 'Mark as platinum'}
                          >★</button>
                        </td>
                        <td className="px-4 py-3 text-right">
                          <div className="flex items-center justify-end gap-2">
                            {regenId === ex.id ? (
                              <>
                                <button
                                  onClick={() => saveRegenPin(ex)}
                                  disabled={regenSaving}
                                  className="text-xs text-white bg-primary hover:opacity-90 rounded px-2 py-1 disabled:opacity-50"
                                >
                                  {regenSaving ? '…' : 'Save'}
                                </button>
                                <button
                                  onClick={() => { setRegenId(null); setRegenError('') }}
                                  className="text-xs text-gray-500 hover:text-gray-700 border border-gray-200 rounded px-2 py-1"
                                >
                                  Cancel
                                </button>
                              </>
                            ) : (
                              <>
                                <button
                                  onClick={() => { setEditId(ex.id); setEditForm({ name: ex.name, booth_number: ex.booth_number, hall: ex.hall }); setEditError('') }}
                                  className="text-xs text-gray-500 hover:text-primary border border-gray-200 rounded px-2 py-1"
                                >
                                  Edit
                                </button>
                                <button
                                  onClick={() => startRegen(ex)}
                                  className="text-xs text-gray-500 hover:text-primary border border-gray-200 rounded px-2 py-1"
                                >
                                  Regen PIN
                                </button>
                                {confirmDeleteId === ex.id ? (
                                  <>
                                    <button
                                      onClick={() => handleDelete(ex.id)}
                                      disabled={deleting}
                                      className="text-xs text-white bg-red-500 hover:bg-red-600 rounded px-2 py-1 disabled:opacity-50"
                                    >
                                      {deleting ? '…' : 'Confirm'}
                                    </button>
                                    <button
                                      onClick={() => setConfirmDeleteId(null)}
                                      className="text-xs text-gray-500 hover:text-gray-700 border border-gray-200 rounded px-2 py-1"
                                    >
                                      Cancel
                                    </button>
                                  </>
                                ) : (
                                  <button
                                    onClick={() => setConfirmDeleteId(ex.id)}
                                    className="text-xs text-red-500 hover:text-red-700 border border-red-200 rounded px-2 py-1"
                                  >
                                    Delete
                                  </button>
                                )}
                              </>
                            )}
                          </div>
                        </td>
                      </>
                    )}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {pendingCsvRows && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-xl shadow-xl p-6 max-w-sm w-full space-y-4">
            <h2 className="text-base font-semibold text-gray-900">Replace exhibitor list?</h2>
            <p className="text-sm text-gray-600">
              This will <span className="font-medium text-red-600">delete all {exhibitors.length} current exhibitor{exhibitors.length !== 1 ? 's' : ''}</span> and replace them with the <span className="font-medium">{pendingCsvRows.length} row{pendingCsvRows.length !== 1 ? 's' : ''}</span> from your CSV.
            </p>
            <p className="text-xs text-gray-500">Platinum status and PINs are preserved for exhibitors whose booth number matches an existing one.</p>
            <div className="flex gap-3 justify-end">
              <button
                onClick={() => { setPendingCsvRows(null); if (fileRef.current) fileRef.current.value = '' }}
                className="text-sm text-gray-600 border border-gray-300 rounded-lg px-4 py-2 hover:bg-gray-50"
              >
                Cancel
              </button>
              <button
                onClick={confirmCsvImport}
                className="text-sm text-white bg-red-600 hover:bg-red-700 rounded-lg px-4 py-2 font-medium"
              >
                Replace list
              </button>
            </div>
          </div>
        </div>
      )}

      <div className="print-grid">
        {exhibitors.map(ex => (
          <div key={ex.id} className="pin-card">
            <div className="card-name" style={{ fontSize: cardNameSize(ex.name) }}>{ex.name}</div>
            <div className="card-sub">{ex.booth_number} · {ex.hall}</div>
            <div className="pin">{ex.pin}</div>
          </div>
        ))}
      </div>
    </div>
  )
}
