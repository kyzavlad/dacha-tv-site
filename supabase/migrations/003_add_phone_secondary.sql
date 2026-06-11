-- Add secondary phone number to site_settings
ALTER TABLE site_settings ADD COLUMN IF NOT EXISTS phone_secondary text;
