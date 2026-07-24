CREATE TABLE IF NOT EXISTS public.native_workbook_bundles (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  slug text NOT NULL UNIQUE,
  title text NOT NULL,
  description text NOT NULL,
  price_in_cents integer NOT NULL CHECK (price_in_cents >= 0 AND price_in_cents <= 100000),
  currency_code varchar(3) NOT NULL REFERENCES public.currencies(code) ON DELETE RESTRICT,
  thumbnail_object_path text NOT NULL,
  stripe_product_id text,
  stripe_price_id text,
  active boolean NOT NULL DEFAULT true,
  created_by_user_id uuid REFERENCES public.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS native_workbook_bundles_active_idx
  ON public.native_workbook_bundles(active, created_at);

CREATE TABLE IF NOT EXISTS public.native_workbook_bundle_items (
  bundle_id uuid NOT NULL REFERENCES public.native_workbook_bundles(id) ON DELETE CASCADE,
  workbook_id uuid NOT NULL REFERENCES public.native_workbooks(id) ON DELETE RESTRICT,
  sort_order integer NOT NULL DEFAULT 0 CHECK (sort_order >= 0),
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT native_workbook_bundle_items_pk PRIMARY KEY (bundle_id, workbook_id),
  CONSTRAINT native_workbook_bundle_items_order_unique UNIQUE (bundle_id, sort_order)
);

CREATE INDEX IF NOT EXISTS native_workbook_bundle_items_workbook_idx
  ON public.native_workbook_bundle_items(workbook_id);
