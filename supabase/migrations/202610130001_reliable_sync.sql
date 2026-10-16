-- Charisma Lab P1. Run once as the Supabase project database administrator.
-- Profiles are kind='profile' records, so there is one synchronization authority.
-- Private data, receipts and tombstones are retained; this is not encrypted storage.
BEGIN;

CREATE SCHEMA charisma_private;
REVOKE ALL ON SCHEMA charisma_private FROM PUBLIC, anon, authenticated;
GRANT USAGE ON SCHEMA charisma_private TO authenticated;

CREATE FUNCTION charisma_private.text_valid(value jsonb, minimum integer, maximum integer)
RETURNS boolean LANGUAGE sql IMMUTABLE SET search_path = pg_catalog, pg_temp AS $$
  SELECT coalesce(jsonb_typeof(value) = 'string'
    AND char_length(value #>> '{}') BETWEEN minimum AND maximum, false);
$$;

CREATE FUNCTION charisma_private.number_valid(value jsonb, minimum numeric, maximum numeric, whole boolean DEFAULT false)
RETURNS boolean LANGUAGE plpgsql IMMUTABLE SET search_path = pg_catalog, pg_temp AS $$
DECLARE n numeric;
BEGIN
  IF jsonb_typeof(value) IS DISTINCT FROM 'number' THEN RETURN false; END IF;
  n := (value #>> '{}')::numeric;
  RETURN n BETWEEN minimum AND maximum AND (NOT whole OR trunc(n) = n);
END;
$$;

CREATE FUNCTION charisma_private.strings_valid(value jsonb, maximum_items integer, minimum_length integer, maximum_length integer, allowed text[] DEFAULT NULL)
RETURNS boolean LANGUAGE plpgsql IMMUTABLE SET search_path = pg_catalog, pg_temp AS $$
DECLARE item jsonb;
BEGIN
  IF jsonb_typeof(value) IS DISTINCT FROM 'array' THEN RETURN false; END IF;
  IF jsonb_array_length(value) > maximum_items THEN RETURN false; END IF;
  FOR item IN SELECT * FROM jsonb_array_elements(value) LOOP
    IF NOT charisma_private.text_valid(item, minimum_length, maximum_length)
      OR (allowed IS NOT NULL AND NOT (item #>> '{}') = ANY(allowed)) THEN RETURN false; END IF;
  END LOOP;
  RETURN true;
END;
$$;

CREATE FUNCTION charisma_private.date_valid(value jsonb, allow_empty boolean DEFAULT false)
RETURNS boolean LANGUAGE plpgsql IMMUTABLE SET search_path = pg_catalog, pg_temp AS $$
DECLARE text_value text;
BEGIN
  IF jsonb_typeof(value) IS DISTINCT FROM 'string' THEN RETURN false; END IF;
  text_value := value #>> '{}';
  IF allow_empty AND text_value = '' THEN RETURN true; END IF;
  IF text_value !~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}$' THEN RETURN false; END IF;
  RETURN to_char(text_value::date, 'YYYY-MM-DD') = text_value;
EXCEPTION WHEN datetime_field_overflow OR invalid_datetime_format THEN RETURN false;
END;
$$;

CREATE FUNCTION charisma_private.keys_valid(value jsonb, required text[], optional text[] DEFAULT ARRAY[]::text[])
RETURNS boolean LANGUAGE sql IMMUTABLE SET search_path = pg_catalog, pg_temp AS $$
  SELECT value ?& required AND NOT EXISTS (
    SELECT 1 FROM jsonb_object_keys(value) AS keys(key)
    WHERE NOT key = ANY(required || optional)
  );
$$;

CREATE FUNCTION charisma_private.scores_valid(value jsonb, self_evaluation boolean)
RETURNS boolean LANGUAGE plpgsql IMMUTABLE SET search_path = pg_catalog, pg_temp AS $$
DECLARE item record; count_keys integer := 0;
BEGIN
  IF jsonb_typeof(value) IS DISTINCT FROM 'object' THEN RETURN false; END IF;
  FOR item IN SELECT key, val FROM jsonb_each(value) AS scores(key, val) LOOP
    count_keys := count_keys + 1;
    IF char_length(item.key) NOT BETWEEN 1 AND 160 THEN RETURN false; END IF;
    IF self_evaluation THEN
      IF item.key !~ '^M(0[1-9]|1[0-2])$'
        OR NOT charisma_private.number_valid(item.val, 1, 5) THEN RETURN false; END IF;
    ELSIF NOT charisma_private.number_valid(item.val, 0, 100) THEN RETURN false;
    END IF;
  END LOOP;
  RETURN NOT self_evaluation OR count_keys = 12;
END;
$$;

CREATE FUNCTION charisma_private.payload_is_valid(kind text, payload jsonb)
RETURNS boolean LANGUAGE plpgsql IMMUTABLE SECURITY DEFINER
SET search_path = pg_catalog, pg_temp AS $$
DECLARE item jsonb; i integer; module_id text;
BEGIN
  IF kind IS NULL OR jsonb_typeof(payload) IS DISTINCT FROM 'object'
    OR octet_length(payload::text) > 4194304 THEN RETURN false; END IF;
  CASE kind
  WHEN 'profile' THEN
    RETURN charisma_private.keys_valid(payload, ARRAY['name','focus','dailyMinutes','weeklyDays','scene','goal','startDate'])
      AND charisma_private.text_valid(payload->'name', 1, 80)
      AND charisma_private.strings_valid(payload->'focus', 3, 3, 3, ARRAY['M01','M02','M03','M04','M05','M06','M07','M08','M09','M10','M11','M12'])
      AND (SELECT count(*) = count(DISTINCT value) FROM jsonb_array_elements(payload->'focus'))
      AND charisma_private.number_valid(payload->'dailyMinutes', 1, 240, true)
      AND charisma_private.number_valid(payload->'weeklyDays', 1, 7, true)
      AND charisma_private.text_valid(payload->'scene', 0, 200)
      AND charisma_private.text_valid(payload->'goal', 0, 5000)
      AND charisma_private.date_valid(payload->'startDate');
  WHEN 'courseProgress' THEN
    RETURN charisma_private.keys_valid(payload, ARRAY['lessonId','stage','completed'], ARRAY['quizScore'])
      AND charisma_private.text_valid(payload->'lessonId', 1, 160)
      AND charisma_private.number_valid(payload->'stage', 0, 5, true)
      AND jsonb_typeof(payload->'completed') = 'boolean'
      AND (NOT payload ? 'quizScore' OR charisma_private.number_valid(payload->'quizScore', 0, 100));
  WHEN 'lessonNote' THEN
    RETURN charisma_private.keys_valid(payload, ARRAY['lessonId','text','bookmarked'])
      AND charisma_private.text_valid(payload->'lessonId', 1, 160)
      AND charisma_private.text_valid(payload->'text', 0, 1000000)
      AND jsonb_typeof(payload->'bookmarked') = 'boolean';
  WHEN 'trainingTask' THEN
    RETURN charisma_private.keys_valid(payload, ARRAY['title','minutes','moduleId','description'])
      AND charisma_private.text_valid(payload->'title', 1, 200)
      AND charisma_private.number_valid(payload->'minutes', 1, 240, true)
      AND charisma_private.text_valid(payload->'moduleId', 1, 160)
      AND charisma_private.text_valid(payload->'description', 0, 20000);
  WHEN 'trainingRecord' THEN
    RETURN charisma_private.keys_valid(payload, ARRAY['taskId','title','moduleId','minutes','date','difficulty','reflection','completed'])
      AND charisma_private.text_valid(payload->'taskId', 1, 160)
      AND charisma_private.text_valid(payload->'title', 1, 200)
      AND charisma_private.text_valid(payload->'moduleId', 1, 160)
      AND charisma_private.number_valid(payload->'minutes', 1, 240, true)
      AND charisma_private.date_valid(payload->'date')
      AND charisma_private.text_valid(payload->'difficulty', 0, 200)
      AND charisma_private.text_valid(payload->'reflection', 0, 20000)
      AND jsonb_typeof(payload->'completed') = 'boolean';
  WHEN 'scenarioAttempt' THEN
    RETURN charisma_private.keys_valid(payload, ARRAY['scenarioId','path','reflection'])
      AND charisma_private.text_valid(payload->'scenarioId', 1, 160)
      AND charisma_private.strings_valid(payload->'path', 100, 1, 160)
      AND charisma_private.text_valid(payload->'reflection', 0, 20000);
  WHEN 'assessmentResult' THEN
    IF NOT charisma_private.keys_valid(payload, ARRAY['type','answers','scores'])
      OR NOT charisma_private.text_valid(payload->'type', 1, 160)
      OR jsonb_typeof(payload->'answers') IS DISTINCT FROM 'array'
      OR NOT charisma_private.scores_valid(payload->'scores', false) THEN RETURN false; END IF;
    IF jsonb_array_length(payload->'answers') > 500 THEN RETURN false; END IF;
    FOR item IN SELECT * FROM jsonb_array_elements(payload->'answers') LOOP
      IF jsonb_typeof(item) IS DISTINCT FROM 'number' THEN RETURN false; END IF;
    END LOOP;
    IF payload->>'type' = 'initial-self' THEN
      IF jsonb_array_length(payload->'answers') <> 24
        OR NOT charisma_private.scores_valid(payload->'scores', true) THEN RETURN false; END IF;
      FOR item IN SELECT * FROM jsonb_array_elements(payload->'answers') LOOP
        IF NOT charisma_private.number_valid(item, 1, 5, true) THEN RETURN false; END IF;
      END LOOP;
      FOR i IN 0..11 LOOP
        module_id := 'M' || lpad((i + 1)::text, 2, '0');
        IF (payload->'scores'->>module_id)::numeric <>
          ((payload->'answers'->>(i * 2))::numeric + (payload->'answers'->>(i * 2 + 1))::numeric) / 2 THEN RETURN false; END IF;
      END LOOP;
    END IF;
    RETURN true;
  WHEN 'selfEvaluation' THEN
    RETURN charisma_private.keys_valid(payload, ARRAY['scores'])
      AND charisma_private.scores_valid(payload->'scores', true);
  WHEN 'journalEntry' THEN
    RETURN charisma_private.keys_valid(payload, ARRAY['title','body','tags','category','date'])
      AND charisma_private.text_valid(payload->'title', 1, 200)
      AND charisma_private.text_valid(payload->'body', 0, 1000000)
      AND charisma_private.strings_valid(payload->'tags', 20, 0, 40)
      AND charisma_private.text_valid(payload->'category', 0, 200)
      AND charisma_private.date_valid(payload->'date');
  WHEN 'growthGoal' THEN
    RETURN charisma_private.keys_valid(payload, ARRAY['title','deadline','priority','status'])
      AND charisma_private.text_valid(payload->'title', 1, 200)
      AND charisma_private.date_valid(payload->'deadline', true)
      AND charisma_private.text_valid(payload->'priority', 0, 200)
      AND charisma_private.text_valid(payload->'status', 0, 200);
  WHEN 'userInterest' THEN
    RETURN charisma_private.keys_valid(payload, ARRAY['name','note'])
      AND charisma_private.text_valid(payload->'name', 1, 160)
      AND charisma_private.text_valid(payload->'note', 0, 20000);
  WHEN 'appSettings' THEN
    RETURN charisma_private.keys_valid(payload, ARRAY['theme']) AND payload->>'theme' IN ('light','dark','warm');
  ELSE RETURN false;
  END CASE;
EXCEPTION WHEN invalid_parameter_value OR numeric_value_out_of_range THEN RETURN false;
END;
$$;

REVOKE ALL ON ALL FUNCTIONS IN SCHEMA charisma_private FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION charisma_private.payload_is_valid(text, jsonb) TO authenticated;

CREATE TABLE public.user_records (
  owner_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  id uuid NOT NULL,
  kind text NOT NULL CHECK (kind IN ('profile','courseProgress','lessonNote','trainingTask','trainingRecord','scenarioAttempt','assessmentResult','selfEvaluation','journalEntry','growthGoal','userInterest','appSettings')),
  payload jsonb NOT NULL CHECK (charisma_private.payload_is_valid(kind, payload)),
  version integer NOT NULL DEFAULT 1 CHECK (version > 0),
  created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  updated_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  deleted_at timestamptz,
  client_created_at timestamptz,
  client_updated_at timestamptz,
  imported_copy_of uuid,
  PRIMARY KEY (owner_id, id)
);
CREATE INDEX user_records_owner_updated_idx ON public.user_records(owner_id, updated_at, id);

CREATE TABLE charisma_private.sync_revisions (
  owner_id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  revision bigint NOT NULL DEFAULT 0 CHECK (revision >= 0)
);
CREATE TABLE charisma_private.mutation_receipts (
  owner_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  mutation_id uuid NOT NULL,
  request jsonb NOT NULL,
  result jsonb NOT NULL,
  created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  PRIMARY KEY (owner_id, mutation_id)
);

ALTER TABLE public.user_records ENABLE ROW LEVEL SECURITY;
ALTER TABLE charisma_private.sync_revisions ENABLE ROW LEVEL SECURITY;
ALTER TABLE charisma_private.mutation_receipts ENABLE ROW LEVEL SECURITY;

CREATE POLICY records_select ON public.user_records FOR SELECT TO authenticated USING ((SELECT auth.uid()) = owner_id);
CREATE POLICY records_insert ON public.user_records FOR INSERT TO authenticated WITH CHECK ((SELECT auth.uid()) = owner_id);
CREATE POLICY records_update ON public.user_records FOR UPDATE TO authenticated USING ((SELECT auth.uid()) = owner_id) WITH CHECK ((SELECT auth.uid()) = owner_id);
CREATE POLICY records_delete ON public.user_records FOR DELETE TO authenticated USING ((SELECT auth.uid()) = owner_id);
CREATE POLICY revisions_select ON charisma_private.sync_revisions FOR SELECT TO authenticated USING ((SELECT auth.uid()) = owner_id);
CREATE POLICY revisions_insert ON charisma_private.sync_revisions FOR INSERT TO authenticated WITH CHECK ((SELECT auth.uid()) = owner_id);
CREATE POLICY revisions_update ON charisma_private.sync_revisions FOR UPDATE TO authenticated USING ((SELECT auth.uid()) = owner_id) WITH CHECK ((SELECT auth.uid()) = owner_id);
CREATE POLICY revisions_delete ON charisma_private.sync_revisions FOR DELETE TO authenticated USING ((SELECT auth.uid()) = owner_id);
CREATE POLICY receipts_select ON charisma_private.mutation_receipts FOR SELECT TO authenticated USING ((SELECT auth.uid()) = owner_id);
CREATE POLICY receipts_insert ON charisma_private.mutation_receipts FOR INSERT TO authenticated WITH CHECK ((SELECT auth.uid()) = owner_id);
CREATE POLICY receipts_update ON charisma_private.mutation_receipts FOR UPDATE TO authenticated USING ((SELECT auth.uid()) = owner_id) WITH CHECK ((SELECT auth.uid()) = owner_id);
CREATE POLICY receipts_delete ON charisma_private.mutation_receipts FOR DELETE TO authenticated USING ((SELECT auth.uid()) = owner_id);

REVOKE ALL ON public.user_records FROM PUBLIC, anon, authenticated;
REVOKE ALL ON charisma_private.sync_revisions, charisma_private.mutation_receipts FROM PUBLIC, anon, authenticated;
GRANT USAGE ON SCHEMA public TO authenticated;
GRANT SELECT ON public.user_records TO authenticated;

CREATE FUNCTION public.apply_mutation(
  p_mutation_id uuid, p_entity_id uuid, p_kind text, p_payload jsonb,
  p_operation text, p_base_version integer,
  p_client_created_at timestamptz, p_client_updated_at timestamptz,
  p_imported_copy_of uuid DEFAULT NULL
) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER
SET search_path = pg_catalog, pg_temp SET timezone = 'UTC' AS $$
DECLARE
  owner uuid := auth.uid(); current_record public.user_records%ROWTYPE;
  receipt charisma_private.mutation_receipts%ROWTYPE; request_data jsonb; result_data jsonb;
  record_exists boolean; changed boolean := false; server_time timestamptz := clock_timestamp();
BEGIN
  IF owner IS NULL THEN RAISE EXCEPTION 'Authentication required' USING ERRCODE = '28000'; END IF;
  IF p_mutation_id IS NULL OR p_entity_id IS NULL OR p_base_version IS NULL OR p_base_version < 0
    OR p_operation IS NULL OR p_operation NOT IN ('upsert','delete')
    OR charisma_private.payload_is_valid(p_kind, p_payload) IS NOT TRUE THEN
    RAISE EXCEPTION 'Invalid mutation parameters or record payload' USING ERRCODE = '22023';
  END IF;
  PERFORM pg_advisory_xact_lock(hashtextextended('charisma-lab:' || owner::text, 0));
  request_data := jsonb_build_object('entity_id', p_entity_id, 'kind', p_kind, 'payload', p_payload,
    'operation', p_operation, 'base_version', p_base_version, 'client_created_at', p_client_created_at,
    'client_updated_at', p_client_updated_at, 'imported_copy_of', p_imported_copy_of);
  SELECT * INTO receipt FROM charisma_private.mutation_receipts WHERE owner_id = owner AND mutation_id = p_mutation_id;
  IF FOUND THEN
    IF receipt.request IS DISTINCT FROM request_data THEN
      RAISE EXCEPTION 'Mutation ID already used with different content' USING ERRCODE = '22023';
    END IF;
    RETURN receipt.result;
  END IF;
  INSERT INTO charisma_private.sync_revisions(owner_id) VALUES (owner) ON CONFLICT DO NOTHING;
  SELECT * INTO current_record FROM public.user_records WHERE owner_id = owner AND id = p_entity_id FOR UPDATE;
  record_exists := FOUND;
  IF (record_exists AND current_record.version <> p_base_version)
    OR (NOT record_exists AND p_base_version <> 0)
    OR (record_exists AND current_record.deleted_at IS NOT NULL AND p_operation = 'upsert') THEN
    result_data := jsonb_build_object('status','conflict','record',CASE WHEN record_exists THEN to_jsonb(current_record) ELSE NULL END);
  ELSE
    IF record_exists THEN
      IF current_record.kind <> p_kind OR current_record.imported_copy_of IS DISTINCT FROM p_imported_copy_of THEN
        RAISE EXCEPTION 'Record kind and imported-copy identity are immutable' USING ERRCODE = '22023';
      END IF;
      IF current_record.deleted_at IS NULL THEN
        UPDATE public.user_records SET payload = p_payload, version = version + 1, updated_at = server_time,
          deleted_at = CASE WHEN p_operation = 'delete' THEN server_time ELSE NULL END,
          client_updated_at = p_client_updated_at
        WHERE owner_id = owner AND id = p_entity_id RETURNING * INTO current_record;
        changed := true;
      END IF;
    ELSE
      INSERT INTO public.user_records(owner_id,id,kind,payload,version,created_at,updated_at,deleted_at,client_created_at,client_updated_at,imported_copy_of)
      VALUES(owner,p_entity_id,p_kind,p_payload,1,server_time,server_time,
        CASE WHEN p_operation = 'delete' THEN server_time ELSE NULL END,
        p_client_created_at,p_client_updated_at,p_imported_copy_of) RETURNING * INTO current_record;
      changed := true;
    END IF;
    IF changed THEN UPDATE charisma_private.sync_revisions SET revision = revision + 1 WHERE owner_id = owner; END IF;
    result_data := jsonb_build_object('status','applied','record',to_jsonb(current_record));
  END IF;
  -- Receipt and business write commit atomically. Conflict receipts are durable too.
  INSERT INTO charisma_private.mutation_receipts(owner_id,mutation_id,request,result) VALUES(owner,p_mutation_id,request_data,result_data);
  RETURN result_data;
END;
$$;

CREATE FUNCTION public.sync_snapshot(p_after_id uuid DEFAULT NULL, p_limit integer DEFAULT 200, p_expected_revision bigint DEFAULT NULL)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER
SET search_path = pg_catalog, pg_temp SET timezone = 'UTC' AS $$
DECLARE owner uuid := auth.uid(); current_revision bigint; rows_data jsonb; row_count integer; next_cursor uuid;
BEGIN
  IF owner IS NULL THEN RAISE EXCEPTION 'Authentication required' USING ERRCODE = '28000'; END IF;
  IF p_limit IS NULL OR p_limit NOT BETWEEN 1 AND 500 OR p_expected_revision < 0 THEN
    RAISE EXCEPTION 'Invalid snapshot limit or revision' USING ERRCODE = '22023'; END IF;
  PERFORM pg_advisory_xact_lock(hashtextextended('charisma-lab:' || owner::text, 0));
  INSERT INTO charisma_private.sync_revisions(owner_id) VALUES(owner) ON CONFLICT DO NOTHING;
  SELECT revision INTO current_revision FROM charisma_private.sync_revisions WHERE owner_id = owner;
  IF p_expected_revision IS NOT NULL AND p_expected_revision <> current_revision THEN
    RETURN jsonb_build_object('revision',current_revision,'changed',true,'records','[]'::jsonb,'nextCursor',NULL);
  END IF;
  SELECT coalesce(jsonb_agg(to_jsonb(page) ORDER BY page.id),'[]'::jsonb), count(*)::integer
  INTO rows_data, row_count FROM (
    SELECT * FROM public.user_records WHERE owner_id = owner AND (p_after_id IS NULL OR id > p_after_id)
    ORDER BY id LIMIT p_limit + 1
  ) AS page;
  IF row_count > p_limit THEN
    next_cursor := (rows_data->(p_limit - 1)->>'id')::uuid;
    rows_data := rows_data - p_limit;
  END IF;
  RETURN jsonb_build_object('revision',current_revision,'changed',false,'records',rows_data,'nextCursor',next_cursor);
END;
$$;

CREATE FUNCTION public.request_cloud_deletion()
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER
SET search_path = pg_catalog, pg_temp AS $$
DECLARE owner uuid := auth.uid(); deleted_count integer; current_revision bigint; server_time timestamptz := clock_timestamp();
BEGIN
  IF owner IS NULL THEN RAISE EXCEPTION 'Authentication required' USING ERRCODE = '28000'; END IF;
  PERFORM pg_advisory_xact_lock(hashtextextended('charisma-lab:' || owner::text, 0));
  INSERT INTO charisma_private.sync_revisions(owner_id) VALUES(owner) ON CONFLICT DO NOTHING;
  UPDATE public.user_records SET deleted_at = server_time, updated_at = server_time, version = version + 1
  WHERE owner_id = owner AND deleted_at IS NULL;
  GET DIAGNOSTICS deleted_count = ROW_COUNT;
  IF deleted_count > 0 THEN UPDATE charisma_private.sync_revisions SET revision = revision + 1 WHERE owner_id = owner; END IF;
  SELECT revision INTO current_revision FROM charisma_private.sync_revisions WHERE owner_id = owner;
  RETURN jsonb_build_object('deleted_count',deleted_count,'revision',current_revision);
END;
$$;

REVOKE ALL ON FUNCTION public.apply_mutation(uuid,uuid,text,jsonb,text,integer,timestamptz,timestamptz,uuid) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.sync_snapshot(uuid,integer,bigint) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.request_cloud_deletion() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.apply_mutation(uuid,uuid,text,jsonb,text,integer,timestamptz,timestamptz,uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.sync_snapshot(uuid,integer,bigint) TO authenticated;
GRANT EXECUTE ON FUNCTION public.request_cloud_deletion() TO authenticated;

COMMENT ON TABLE public.user_records IS 'Private records; profiles use kind=profile. Browser DML is revoked; use authenticated CAS RPC.';
COMMENT ON TABLE charisma_private.mutation_receipts IS 'Durable immutable idempotency results, including conflicts. Never expire blindly; contain private historical content.';
COMMENT ON FUNCTION public.request_cloud_deletion() IS 'Soft deletion of this authenticated account records; retained payload, receipts and tombstones are not physical erasure.';
COMMIT;
