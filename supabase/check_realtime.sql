-- Realtime publication 등록 상태 확인
SELECT
  pt.schemaname,
  pt.tablename,
  pc.relreplident AS replica_identity
FROM pg_publication_tables pt
JOIN pg_class pc ON pc.relname = pt.tablename
  AND pc.relnamespace = (SELECT oid FROM pg_namespace WHERE nspname = pt.schemaname)
WHERE pt.pubname = 'supabase_realtime'
ORDER BY pt.tablename;
