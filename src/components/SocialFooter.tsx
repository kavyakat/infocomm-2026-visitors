import { useAuth } from '../hooks/useAuth'
import { supabase, type Profile } from '../lib/supabase'

type Channel = 'linkedin' | 'instagram' | 'facebook' | 'youtube'

const CHANNELS: Array<{ key: Channel; label: string; url: string }> = [
  { key: 'linkedin', label: 'LinkedIn', url: 'https://www.linkedin.com/company/infocomm-india' },
  { key: 'instagram', label: 'Instagram', url: 'https://www.instagram.com/infocommindia' },
  { key: 'facebook', label: 'Facebook', url: 'https://www.facebook.com/InfoCommIndia' },
  { key: 'youtube', label: 'YouTube', url: 'https://www.youtube.com/@InfoCommIndia' },
]

function channelKey(key: Channel): keyof Profile {
  return `social_${key}` as keyof Profile
}

export default function SocialFooter() {
  const { profile, setProfile } = useAuth()

  async function handleChannel(channel: Channel, url: string) {
    if (profile && !profile[channelKey(channel)]) {
      const { data } = await supabase
        .from('profiles')
        .update({ [channelKey(channel)]: true })
        .eq('id', profile.id)
        .select('*')
        .single()
      if (data) setProfile(data as Profile)
    }
    window.open(url, '_blank', 'noopener,noreferrer')
  }

  return (
    <div className="fixed bottom-0 left-0 right-0 z-20 bg-white border-t border-gray-200 px-4 py-2">
      <p className="text-xs text-gray-500 text-center mb-1.5">Follow InfoComm India to complete your lucky-draw eligibility</p>
      <div className="flex justify-center gap-2">
        {CHANNELS.map(({ key, label, url }) => {
          const done = profile ? !!profile[channelKey(key)] : false
          return (
            <button
              key={key}
              onClick={() => handleChannel(key, url)}
              className={`text-xs font-medium px-3 py-1.5 rounded-lg border transition-colors ${
                done
                  ? 'bg-green-50 border-green-300 text-green-700'
                  : 'bg-white border-gray-300 text-gray-700 hover:bg-gray-50'
              }`}
            >
              {done ? `✓ ${label}` : label}
            </button>
          )
        })}
      </div>
    </div>
  )
}
