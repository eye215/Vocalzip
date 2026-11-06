-- Additional migration for projects where song_text_cloud_sync was already applied.
-- Non-destructive. A deleted reference retains its key to block stale-device imports.
alter table public.vocal_song_texts add column if not exists deleted_at timestamptz;
