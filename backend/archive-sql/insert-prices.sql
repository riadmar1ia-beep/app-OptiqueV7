INSERT INTO lens_pricing (lens_type, index_type, material, purchase_price_cents, selling_price_cents) VALUES
('unifocal', '1.5', 'organic', 2000, 5000),
('unifocal', '1.6', 'organic', 3000, 7500),
('unifocal', '1.67', 'organic', 4500, 11250),
('unifocal', '1.74', 'organic', 7000, 17500),
('progressive', '1.6', 'organic', 6000, 15000),
('progressive', '1.67', 'organic', 8000, 20000),
('progressive', '1.74', 'organic', 12000, 30000),
('bifocal', '1.5', 'mineral', 3500, 8750),
('bifocal', '1.6', 'mineral', 5000, 12500),
('occupational', '1.6', 'polycarbonate', 5500, 13750)
ON CONFLICT (lens_type, index_type, material) DO NOTHING;

INSERT INTO coating_pricing (coating_code, coating_name, purchase_price_cents, selling_price_cents) VALUES
('AR', 'Antireflet', 1500, 3000),
('PHOTO', 'Photochromique', 2500, 5000),
('BLUE', 'Anti-lumiere bleue', 1000, 2000),
('SCRATCH', 'Anti-rayure', 800, 1500),
('FOG', 'Anti-buee', 1200, 2500),
('UV', 'Protection UV', 500, 1000)
ON CONFLICT (coating_code) DO NOTHING;