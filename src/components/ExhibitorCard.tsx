import { CheckCircleIcon } from '@heroicons/react/24/solid'

interface Props {
  id: string
  name: string
  booth_number: string
  hall: string
  visited: boolean
  subtle?: boolean
  onCheckIn: (id: string) => void
}

export default function ExhibitorCard({ id, name, booth_number, hall, visited, subtle, onCheckIn }: Props) {
  return (
    <div className={`rounded-xl border p-4 flex items-center justify-between ${visited ? 'border-green-300 bg-green-50' : subtle ? 'border-gray-200 bg-primary-subtle' : 'border-gray-200 bg-white'}`}>
      <div>
        <p className="font-semibold text-gray-900 text-sm">{name}</p>
        <p className="text-xs text-gray-500">{booth_number} · {hall}</p>
      </div>
      {visited ? (
        <CheckCircleIcon className="w-7 h-7 text-green-500 flex-shrink-0" />
      ) : (
        <button
          onClick={() => onCheckIn(id)}
          className="text-xs bg-primary text-white rounded-lg px-3 py-1.5 font-medium flex-shrink-0"
        >
          Check In
        </button>
      )}
    </div>
  )
}
