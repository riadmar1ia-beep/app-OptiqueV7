// Types pour la gestion des verres optiques

export interface Prescription {
  id: string;
  patient_name: string;
  doctor_name: string;
  date: string;
  expires_at: string;
  is_valid: boolean;
  document_url?: string;
  notes?: string;
}

export interface LensSpecification {
  type: 'unifocal' | 'progressive' | 'bifocal' | 'occupational';
  index: '1.5' | '1.6' | '1.67' | '1.74';
  material: 'organic' | 'mineral' | 'polycarbonate' | 'trivex';
  coatings: string[];
  color?: string;
  price_cents: number;
}

export interface EyePrescription {
  sphere: number;      // Sphère ( -12.00 à +12.00 )
  cylinder: number;    // Cylindre (0 à -6.00)
  axis: number;        // Axe (0 à 180)
  addition?: number;   // Addition pour progressifs (0.50 à 3.50)
  prism?: number;      // Prisme (optionnel)
  base?: string;       // Base du prisme
}

export interface LensOrder {
  id?: string;
  prescription_id: string;
  has_prescription: boolean;
  right_eye: {
    prescription: EyePrescription;
    lens: LensSpecification;
    price_cents: number;
  };
  left_eye: {
    prescription: EyePrescription;
    lens: LensSpecification;
    price_cents: number;
  };
  total_cents: number;
  status: 'pending' | 'in_production' | 'ready' | 'delivered' | 'cancelled';
  created_at: string;
  estimated_delivery: string;
  notes?: string;
}

export interface LensType {
  id: string;
  name: string;
  code: string;
  description: string;
  multiplier: number;  // Facteur de prix par rapport à la base
  available_indexes: string[];
  available_materials: string[];
}

export interface Coating {
  id: string;
  name: string;
  code: string;
  price_cents: number;
  description: string;
}