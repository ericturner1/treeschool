update public.funnel_steps
set
  route_path = '/first-grade-curriculum/choose',
  public_path = '/first-grade-curriculum/choose',
  preview_path = '/first-grade-curriculum/choose?preview=1',
  link_label = 'Preview purchase choice'
where source_ref = 'first_grade_curriculum_checkout_choice';
