ALTER TABLE public.messages DROP CONSTRAINT messages_attachment_len;
ALTER TABLE public.messages ADD CONSTRAINT messages_attachment_len CHECK (
  (attachment_url IS NULL OR char_length(attachment_url) <= 2000)
  AND (attachment_type IS NULL OR char_length(attachment_type) <= 100)
  AND (attachment_name IS NULL OR char_length(attachment_name) <= 300)
  AND (attachment_size IS NULL OR attachment_size <= 1073741824)
);