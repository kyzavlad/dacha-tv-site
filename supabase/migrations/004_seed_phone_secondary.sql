-- Seed the secondary phone number and confirm primary
UPDATE site_settings
SET
  phone            = '+380967657772',
  phone_secondary  = '+380934665801'
WHERE id = 1;
