-- Seed data: 1 instructor, 1 lesson, 5 financial literacy checkpoints
-- Note: The instructor profile references auth.users, so in a real setup
-- the auth user must be created first via Supabase Auth.
-- These UUIDs are deterministic for development/testing.

-- Sample instructor profile (assumes auth user exists with this ID)
INSERT INTO instructor_profiles (id, display_name)
VALUES ('00000000-0000-0000-0000-000000000001', 'Demo Instructor')
ON CONFLICT (id) DO NOTHING;

-- Sample lesson
INSERT INTO lessons (id, instructor_id, title, timer_seconds)
VALUES ('00000000-0000-0000-0000-000000000010', '00000000-0000-0000-0000-000000000001', 'Financial Wellness 101', 15);

-- Checkpoint 1
INSERT INTO checkpoints (id, lesson_id, sort_order, question, options, correct_index, fact)
VALUES (
  '00000000-0000-0000-0000-000000000101',
  '00000000-0000-0000-0000-000000000010',
  0,
  'What is one key advantage of contributing to a 401(k) through your employer?',
  '["Free stock options", "Tax-deferred growth on contributions", "Guaranteed 10% returns", "No withdrawal penalties ever"]',
  1,
  '401(k) contributions are made pre-tax, reducing your taxable income. Investments grow tax-deferred until retirement withdrawal.'
);

-- Checkpoint 2
INSERT INTO checkpoints (id, lesson_id, sort_order, question, options, correct_index, fact)
VALUES (
  '00000000-0000-0000-0000-000000000102',
  '00000000-0000-0000-0000-000000000010',
  1,
  'What does ESPP stand for?',
  '["Emergency Savings Protection Plan", "Employee Stock Purchase Plan", "Extended Service Pension Program", "Equity Shares Per Period"]',
  1,
  'An Employee Stock Purchase Plan lets you buy company stock at a discount, often 10-15% below market price.'
);

-- Checkpoint 3
INSERT INTO checkpoints (id, lesson_id, sort_order, question, options, correct_index, fact)
VALUES (
  '00000000-0000-0000-0000-000000000103',
  '00000000-0000-0000-0000-000000000010',
  2,
  'What makes an HSA unique compared to other accounts?',
  '["No withdrawal limit", "Triple tax advantage on contributions, growth, and qualified withdrawals", "Can only be used at hospitals", "Earns 5% guaranteed interest"]',
  1,
  'HSAs offer tax-deductible contributions, tax-free growth, and tax-free withdrawals for qualified medical expenses.'
);

-- Checkpoint 4
INSERT INTO checkpoints (id, lesson_id, sort_order, question, options, correct_index, fact)
VALUES (
  '00000000-0000-0000-0000-000000000104',
  '00000000-0000-0000-0000-000000000010',
  3,
  'Which credit score range is considered ''good'' by most lenders?',
  '["500-600", "600-669", "670-739", "Only 800+"]',
  2,
  '670-739 is considered good by FICO standards. Small improvements can save thousands in interest over a mortgage lifetime.'
);

-- Checkpoint 5
INSERT INTO checkpoints (id, lesson_id, sort_order, question, options, correct_index, fact)
VALUES (
  '00000000-0000-0000-0000-000000000105',
  '00000000-0000-0000-0000-000000000010',
  4,
  'What is the recommended emergency fund size?',
  '["1 month of expenses", "3-6 months of expenses", "Exactly $10,000", "1 year of salary"]',
  1,
  'Most advisors recommend 3-6 months of living expenses in an accessible high-yield savings account.'
);
