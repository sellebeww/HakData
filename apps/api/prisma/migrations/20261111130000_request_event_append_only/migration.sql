-- Linimasa permintaan (RequestEvent = TimelineEvent) append-only: siapa (actorId), kapan, apa.
ALTER TABLE "TimelineEvent" ADD COLUMN "actorId" TEXT;
CREATE OR REPLACE FUNCTION timeline_append_only() RETURNS trigger AS $$
BEGIN
  -- hapus berantai dari PrivacyRequest (FK cascade) berjalan di kedalaman trigger > 1 dan tetap diizinkan
  IF TG_OP = 'DELETE' AND pg_trigger_depth() > 1 THEN RETURN OLD; END IF;
  RAISE EXCEPTION 'TimelineEvent bersifat append-only (% ditolak)', TG_OP;
END $$ LANGUAGE plpgsql;
CREATE TRIGGER timeline_no_update BEFORE UPDATE OR DELETE ON "TimelineEvent"
  FOR EACH ROW EXECUTE FUNCTION timeline_append_only();
