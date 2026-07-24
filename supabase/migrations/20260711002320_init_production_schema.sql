drop extension if exists "pg_net";

drop extension if exists "pg_stat_statements";

drop extension if exists "pgcrypto";

drop extension if exists "uuid-ossp";

drop trigger if exists "tr_check_filters" on "realtime"."subscription";

drop trigger if exists "enforce_bucket_name_length_trigger" on "storage"."buckets";

drop trigger if exists "protect_buckets_delete" on "storage"."buckets";

drop trigger if exists "protect_objects_delete" on "storage"."objects";

drop trigger if exists "update_objects_updated_at" on "storage"."objects";
