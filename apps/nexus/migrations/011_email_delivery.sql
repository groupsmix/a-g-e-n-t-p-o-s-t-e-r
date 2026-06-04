-- Real email delivery for scheduler output: a per-schedule destination
-- email, and the send status recorded on each delivery.

ALTER TABLE schedules ADD COLUMN email TEXT;
ALTER TABLE deliveries ADD COLUMN email_status TEXT;
