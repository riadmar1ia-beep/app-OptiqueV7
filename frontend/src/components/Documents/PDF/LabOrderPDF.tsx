// frontend/src/components/Documents/PDF/LabOrderPDF.tsx
import React from 'react';
import { Document, Page, View, Text, StyleSheet } from '@react-pdf/renderer';
import CompanyHeader from '../Templates/CompanyHeader';
import CompanyFooter from '../Templates/CompanyFooter';

const styles = StyleSheet.create({
  page: { padding: 30, fontSize: 10, fontFamily: 'Helvetica' },
  section: { marginBottom: 15 },
  sectionTitle: { fontSize: 12, fontWeight: 'bold', marginBottom: 8, backgroundColor: '#f0f0f0', padding: 4 },
  row: { flexDirection: 'row', marginBottom: 4 },
  label: { width: 100, fontWeight: 'bold' },
  value: { flex: 1 },
  eyeBox: { marginBottom: 15, padding: 8, borderWidth: 1, borderColor: '#ddd', borderRadius: 4 },
  eyeTitle: { fontWeight: 'bold', marginBottom: 5, backgroundColor: '#f5f5f5', padding: 5, fontSize: 11 },
  signatureSection: { flexDirection: 'row', justifyContent: 'space-between', marginTop: 30, paddingTop: 20, borderTopWidth: 1, borderTopColor: '#ccc' },
  signatureBox: { width: '45%', textAlign: 'center' }
});

interface LabOrderPDFProps {
  data: {
    order_number: string;
    date: string;
    client_name: string;
    supplier_name?: string;
    right_eye?: any;
    left_eye?: any;
    mounting?: any;
    notes?: string;
  };
  settings: any;
}

const LabOrderPDF: React.FC<LabOrderPDFProps> = ({ data, settings }) => {
  const treatmentNames: Record<string, string> = {
    AR: 'Anti-reflet',
    BLUE: 'Anti-lumière bleue',
    UV: 'Protection UV',
    SCRATCH: 'Anti-rayure',
    FOG: 'Anti-buée',
    PHOTO: 'Photochromique'
  };

  const formatTint = (tint: any) => {
    if (!tint || tint.color === 'none') return null;
    const tintLabel = tint.color === 'gray' ? 'Gris' :
                      tint.color === 'brown' ? 'Brun' :
                      tint.color === 'green' ? 'Vert' : tint.color;
    const tintDetails = [];
    if (tint.gradient) tintDetails.push('dégradé');
    if (tint.intensity) tintDetails.push(`${tint.intensity}%`);
    return `${tintLabel}${tintDetails.length ? ` (${tintDetails.join(', ')})` : ''}`;
  };

  const formatPrescription = (prescription: any) => {
    if (!prescription) return null;
    const parts = [];
    if (prescription.sphere !== undefined && prescription.sphere !== 0)
      parts.push(`SPH: ${prescription.sphere > 0 ? `+${prescription.sphere}` : prescription.sphere}`);
    if (prescription.cylinder !== undefined && prescription.cylinder !== 0)
      parts.push(`CYL: ${prescription.cylinder}`);
    if (prescription.axis) parts.push(`AXE: ${prescription.axis}°`);
    if (prescription.addition) parts.push(`ADD: +${prescription.addition}`);
    if (prescription.prism) parts.push(`Prisme: ${prescription.prism} Δ`);
    if (prescription.prism_base) {
      const baseLabel = prescription.prism_base === 'up' ? 'Haut' :
                        prescription.prism_base === 'down' ? 'Bas' :
                        prescription.prism_base === 'in' ? 'Interne' : 'Externe';
      parts.push(`Base: ${baseLabel}`);
    }
    return parts.length > 0 ? parts.join(' | ') : null;
  };

  // ✅ Fonction pour normaliser les données d'un œil (peu importe d'où elles viennent)
  const normalizeEyeData = (eye: any) => {
    if (!eye) return null;
    
    // Cas 1: Les données sont directement dans eye (type, index, material)
    // Cas 2: Les données sont dans eye.lens_config
    // Cas 3: Les données sont dans eye.lens_details
    const lensConfig = eye.lens_config || eye.lens_details || {};
    
    return {
      type: eye.type || lensConfig.type || '-',
      index: eye.index || lensConfig.index || '-',
      material: eye.material || lensConfig.material || '-',
      prescription: eye.prescription || lensConfig.prescription || null,
      coatings: eye.coatings || lensConfig.coatings || [],
      coatings_detail: eye.coatings_detail || lensConfig.coatings_detail || [],
      tint: eye.tint || lensConfig.tint || null
    };
  };

  // ✅ Fonction pour normaliser les paramètres de montage
  const normalizeMounting = (mounting: any) => {
    if (!mounting) return null;
    
    return {
      pupillary_distance: mounting.pupillary_distance || mounting.pd || 0,
      mounting_height: mounting.mounting_height || mounting.height || 0,
      vertex_distance: mounting.vertex_distance || mounting.vertexDistance || 0,
      pantoscopic_angle: mounting.pantoscopic_angle || mounting.angle || 0,
      frame_wrap: mounting.frame_wrap || mounting.wrap || 0
    };
  };

  const renderEyeDetails = (eyeData: any, label: string) => {
    const eye = normalizeEyeData(eyeData);
    if (!eye) return null;
    
    const prescriptionText = formatPrescription(eye.prescription);
    const tintText = formatTint(eye.tint);
    
    // Utiliser coatings_detail si disponible, sinon coatings
    const coatings = eye.coatings_detail.length > 0 
      ? eye.coatings_detail.map((c: any) => c.name || treatmentNames[c.code] || c.code)
      : eye.coatings;
    
    return (
      <View style={styles.eyeBox}>
        <Text style={styles.eyeTitle}>{label}</Text>
        
        <View style={styles.row}>
          <Text style={styles.label}>Type:</Text>
          <Text style={styles.value}>{eye.type}</Text>
        </View>
        
        <View style={styles.row}>
          <Text style={styles.label}>Indice:</Text>
          <Text style={styles.value}>{eye.index}</Text>
        </View>
        
        <View style={styles.row}>
          <Text style={styles.label}>Matériau:</Text>
          <Text style={styles.value}>{eye.material}</Text>
        </View>
        
        {prescriptionText && (
          <View style={styles.row}>
            <Text style={styles.label}>Prescription:</Text>
            <Text style={styles.value}>{prescriptionText}</Text>
          </View>
        )}
        
        {coatings && coatings.length > 0 && (
          <View style={styles.row}>
            <Text style={styles.label}>Traitements:</Text>
            <Text style={styles.value}>
              {coatings.map((c: any) => typeof c === 'string' ? (treatmentNames[c] || c) : c).join(', ')}
            </Text>
          </View>
        )}
        
        {tintText && (
          <View style={styles.row}>
            <Text style={styles.label}>Teinte:</Text>
            <Text style={styles.value}>{tintText}</Text>
          </View>
        )}
      </View>
    );
  };

  const renderMountingDetails = (mountingData: any) => {
    const mounting = normalizeMounting(mountingData);
    if (!mounting) return null;
    
    const hasData = mounting.pupillary_distance > 0 || mounting.mounting_height > 0 || 
                    mounting.vertex_distance > 0 || mounting.pantoscopic_angle !== 0 || mounting.frame_wrap !== 0;
    if (!hasData) return null;
    
    return (
      <View style={styles.eyeBox}>
        <Text style={styles.eyeTitle}>Paramètres de montage</Text>
        
        {mounting.pupillary_distance > 0 && (
          <View style={styles.row}>
            <Text style={styles.label}>Écart pupillaire (PD):</Text>
            <Text style={styles.value}>{mounting.pupillary_distance} mm</Text>
          </View>
        )}
        {mounting.mounting_height > 0 && (
          <View style={styles.row}>
            <Text style={styles.label}>Hauteur de montage:</Text>
            <Text style={styles.value}>{mounting.mounting_height} mm</Text>
          </View>
        )}
        {mounting.vertex_distance > 0 && (
          <View style={styles.row}>
            <Text style={styles.label}>Distance verre-œil:</Text>
            <Text style={styles.value}>{mounting.vertex_distance} mm</Text>
          </View>
        )}
        {mounting.pantoscopic_angle !== 0 && (
          <View style={styles.row}>
            <Text style={styles.label}>Angle pantoscopique:</Text>
            <Text style={styles.value}>{mounting.pantoscopic_angle}°</Text>
          </View>
        )}
        {mounting.frame_wrap !== 0 && (
          <View style={styles.row}>
            <Text style={styles.label}>Galbe monture:</Text>
            <Text style={styles.value}>{mounting.frame_wrap}°</Text>
          </View>
        )}
      </View>
    );
  };

  return (
    <Document>
      <Page size="A4" style={styles.page}>
        <CompanyHeader
          settings={settings}
          documentType="BON DE COMMANDE FOURNISSEUR"
          documentNumber={data.order_number}
          date={data.date}
        />

        {/* Section Fournisseur */}
        {data.supplier_name && (
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Fournisseur</Text>
            <Text>{data.supplier_name}</Text>
          </View>
        )}



        {/* Détails des verres */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Détails des verres</Text>
          {renderEyeDetails(data.right_eye, 'ŒIL DROIT (OD)')}
          {renderEyeDetails(data.left_eye, 'ŒIL GAUCHE (OG)')}
        </View>

        {/* Paramètres de montage */}
        {renderMountingDetails(data.mounting)}

        {/* Notes */}
        {data.notes && (
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Instructions particulières</Text>
            <Text>{data.notes}</Text>
          </View>
        )}

        {/* Signatures */}
        <View style={styles.signatureSection}>
          <View style={styles.signatureBox}>
            <Text>Bon de commande accepté</Text>
            <Text style={{ marginTop: 20 }}>Cachet et signature du fournisseur</Text>
          </View>
          <View style={styles.signatureBox}>
            <Text>Cachet et signature</Text>
            <Text style={{ marginTop: 20 }}>{settings?.company_name || 'MARZOUK OPTIQUE'}</Text>
          </View>
        </View>

        <CompanyFooter documentNumber={data.order_number} showBarcode={true} />
      </Page>
    </Document>
  );
};

export default LabOrderPDF;