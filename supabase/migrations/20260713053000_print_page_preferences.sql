CREATE TABLE account_preferences (
  account_id uuid PRIMARY KEY REFERENCES accounts(id) ON DELETE CASCADE,
  preferred_print_page_size text NOT NULL,
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT account_preferences_print_page_size_check
    CHECK (preferred_print_page_size IN ('letter', 'a4', 'legal'))
);

ALTER TABLE learning_years
  ADD COLUMN print_page_size text NOT NULL DEFAULT 'letter',
  ADD CONSTRAINT learning_years_print_page_size_check
    CHECK (print_page_size IN ('letter', 'a4', 'legal'));
