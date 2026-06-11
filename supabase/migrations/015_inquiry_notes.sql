-- Migration 015: Add internal notes field to inquiries
-- Allows admin to store follow-up notes (call outcome, agreed details, etc.)
ALTER TABLE inquiries
  ADD COLUMN IF NOT EXISTS notes text;
