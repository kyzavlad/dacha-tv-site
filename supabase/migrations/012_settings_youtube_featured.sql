-- Migration 012: Add featured_youtube_video_url to site_settings
-- This is separate from youtube_url (channel URL) — it points to a specific
-- video that is embedded on the homepage.
ALTER TABLE site_settings
  ADD COLUMN IF NOT EXISTS featured_youtube_video_url text;
