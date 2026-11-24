-- Seed data awal Pastel Ibu (idempoten, tidak menimpa perubahan admin).

INSERT INTO products (id, name, price, description, image_url, is_active, sort_order)
VALUES
  ('pastel-1000', 'Pastel Rp1.000', 1000, 'Pilihan ekonomis untuk camilan sehari-hari.', NULL, 1, 10),
  ('pastel-2000', 'Pastel Rp2.000', 2000, 'Pilihan lainnya untuk menemani berbagai acara.', NULL, 1, 20)
ON CONFLICT (id) DO NOTHING;

INSERT INTO production_settings (id, daily_capacity)
VALUES ('default', 300)
ON CONFLICT (id) DO NOTHING;
