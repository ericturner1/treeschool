alter table public.student_point_bank_transactions
  drop constraint if exists student_point_bank_transactions_amount_nonzero;

alter table public.student_point_bank_transactions
  add constraint student_point_bank_transactions_amount_nonzero
    check (amount <> 0 or kind = 'interest');

comment on constraint student_point_bank_transactions_amount_nonzero
  on public.student_point_bank_transactions is
  'Transfers must change the whole-point balance. Interest rows may be zero when fractional interest is carried in metadata.';
