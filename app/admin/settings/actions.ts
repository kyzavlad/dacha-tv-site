'use server'
import { getAdminClient } from '@/lib/supabase/admin'
import { revalidatePath } from 'next/cache'

export async function saveSiteSettings(formData: FormData) {
  const client = getAdminClient()
  await client.from('site_settings').upsert({
    id: 1,
    phone: formData.get('phone') as string || null,
    phone_secondary: formData.get('phone_secondary') as string || null,
    address_full: formData.get('address_full') as string || null,
    address_display: formData.get('address_display') as string || null,
    telegram_url: formData.get('telegram_url') as string || null,
    youtube_url: formData.get('youtube_url') as string || null,
    featured_youtube_video_url: formData.get('featured_youtube_video_url') as string || null,
    instagram_url: formData.get('instagram_url') as string || null,
    facebook_url: formData.get('facebook_url') as string || null,
    tiktok_url: formData.get('tiktok_url') as string || null,
    hero_tagline: formData.get('hero_tagline') as string || null,
    hero_subtext: formData.get('hero_subtext') as string || null,
    updated_at: new Date().toISOString(),
  })
  revalidatePath('/', 'layout')
}
