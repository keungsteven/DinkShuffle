-- Dink Shuffle: Avatar Storage Setup
-- Run this AFTER 002_rls_policies.sql in the Supabase SQL Editor

-- ─── Create avatars storage bucket ─────────────────────────────────
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'avatars',
  'avatars',
  true,
  1048576, -- 1MB limit
  ARRAY['image/jpeg', 'image/png', 'image/webp']
)
ON CONFLICT (id) DO NOTHING;

-- ─── Storage RLS Policies ──────────────────────────────────────────

-- Users can upload their own avatar (path: {user_id}/*)
CREATE POLICY "Users can upload own avatar"
  ON storage.objects FOR INSERT
  WITH CHECK (
    bucket_id = 'avatars'
    AND auth.uid()::text = (storage.foldername(name))[1]
  );

-- Users can update (overwrite) their own avatar
CREATE POLICY "Users can update own avatar"
  ON storage.objects FOR UPDATE
  USING (
    bucket_id = 'avatars'
    AND auth.uid()::text = (storage.foldername(name))[1]
  );

-- Users can delete their own avatar
CREATE POLICY "Users can delete own avatar"
  ON storage.objects FOR DELETE
  USING (
    bucket_id = 'avatars'
    AND auth.uid()::text = (storage.foldername(name))[1]
  );

-- Anyone can view avatars (public bucket)
CREATE POLICY "Avatars are publicly viewable"
  ON storage.objects FOR SELECT
  USING (bucket_id = 'avatars');
