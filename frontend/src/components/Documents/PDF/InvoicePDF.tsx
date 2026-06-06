// frontend/src/components/Documents/PDF/InvoicePDF.tsx
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
  eyeBox: { marginBottom: 15, padding: 8, borderWidth: 1, borderColor: '#ddd', borderRadius: 4, backgroundColor: '#fafafa' },
  eyeTitle: { fontWeight: 'bold', marginBottom: 5, backgroundColor: '#e6f7ff', padding: 5, fontSize: 11 },
  table: { marginTop: 10 },
  tableHeader: { flexDirection: 'row', backgroundColor: '#f0f0f0', padding: 5, fontWeight: 'bold' },
  tableRow: { flexDirection: 'row', borderBottomWidth: 1, borderBottomColor: '#ccc', padding: 5 },
  colRef: { width: '15%' },
  colDesc: { width: '40%' },
  colQty: { width: '10%', textAlign: 'center' },
  colPrice: { width: '15%', textAlign: 'right' },
  colTotal: { width: '20%', textAlign: 'right' },
  totalBox: { marginTop: 10, padding: 10, backgroundColor: '#f9f9f9', alignItems: 'flex-end' },
  amountInWordsSection: { marginTop: 15, padding: 8, backgroundColor: '#fef3c7', borderRadius: 4 },
  amountInWordsText: { fontSize: 9, fontStyle: 'italic', textAlign: 'center' },
  signatureSection: { flexDirection: 'row', justifyContent: 'space-between', marginTop: 30, paddingTop: 20, borderTopWidth: 1, borderTopColor: '#ccc' },
  signatureBox: { width: '45%', textAlign: 'center' },
  paymentInfo: { marginTop: 15, padding: 8, backgroundColor: '#f6ffed', borderRadius: 4 }
});

const montantEnLettres = (montant: number): string => {
  const unites = ['', 'UN', 'DEUX', 'TROIS', 'QUATRE', 'CINQ', 'SIX', 'SEPT', 'HUIT', 'NEUF'];
  const dizaines = ['', 'DIX', 'VINGT', 'TRENTE', 'QUARANTE', 'CINQUANTE', 'SOIXANTE'];

  const convertirMoinsDe100 = (n: number): string => {
    if (n < 10) return unites[n];
    if (n < 20) {
      const speciaux = ['DIX', 'ONZE', 'DOUZE', 'TREIZE', 'QUATORZE', 'QUINZE', 'SEIZE', 'DIX-SEPT', 'DIX-HUIT', 'DIX-NEUF'];
      return speciaux[n - 10];
    }
    if (n < 70) {
      const d = Math.floor(n / 10);
      const u = n % 10;
      if (u === 0) return dizaines[d];
      if (u === 1) return `${dizaines[d]} ET UN`;
      return `${dizaines[d]}-${unites[u]}`;
    }
    if (n < 80) return `SOIXANTE-${convertirMoinsDe100(n - 60)}`;
    if (n < 100) {
      if (n === 80) return 'QUATRE-VINGTS';
      return `QUATRE-VINGT-${convertirMoinsDe100(n - 80)}`;
    }
    return '';
  };

  const convertirMoinsDe1000 = (n: number): string => {
    if (n < 100) return convertirMoinsDe100(n);
    const c = Math.floor(n / 100);
    const reste = n % 100;
    let resultat = c === 1 ? 'CENT' : `${unites[c]} CENT`;
    if (reste > 0) resultat += ` ${convertirMoinsDe100(reste)}`;
    return resultat;
  };

  const convertir = (n: number): string => {
    if (n === 0) return 'ZERO';
    if (n < 1000) return convertirMoinsDe1000(n);
    if (n < 1000000) {
      const milliers = Math.floor(n / 1000);
      const reste = n % 1000;
      let resultat = milliers === 1 ? 'MILLE' : `${convertirMoinsDe1000(milliers)} MILLE`;
      if (reste > 0) resultat += ` ${convertirMoinsDe1000(reste)}`;
      return resultat;
    }
    return n.toString();
  };

  const dirhams = Math.floor(montant);
  const centimes = Math.round((montant - dirhams) * 100);
  let resultat = dirhams === 0 ? 'ZERO DIRHAM' : dirhams === 1 ? 'UN DIRHAM' : `${convertir(dirhams)} DIRHAMS`;
  if (centimes > 0) resultat += centimes === 1 ? ' ET UN CENTIME' : ` ET ${convertir(centimes)} CENTIMES`;
  return resultat;
};

interface InvoicePDFProps {
  data: {
    number: string;
    date: string;
    client_name: string;
    client_address?: string;
    client_phone?: string;
    client_email?: string;
    items: Array<{
      reference: string;
      description: string;
      quantity: number;
      unit_price: number;
      total: number;
    }>;
    right_eye?: {
      type?: string;
      index?: string;
      material?: string;
      coatings?: string[];
      tint?: { color: string; gradient: boolean; intensity: number };
    };
    left_eye?: {
      type?: string;
      index?: string;
      material?: string;
      coatings?: string[];
      tint?: { color: string; gradient: boolean; intensity: number };
    };
    subtotal: number;
    tax_rate: number;
    tax_amount: number;
    total: number;
    payment_method?: string;
    notes?: string;
  };
  settings: any;
}

const InvoicePDF: React.FC<InvoicePDFProps> = ({ data, settings }) => {
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

  const renderEyeDetails = (eye: any, label: string) => {
    if (!eye) return null;
    
    const tintText = formatTint(eye.tint);
    
    return (
      <View style={styles.eyeBox}>
        <Text style={styles.eyeTitle}>{label}</Text>
        
        <View style={styles.row}>
          <Text style={styles.label}>Type:</Text>
          <Text style={styles.value}>{eye.type || '-'}</Text>
        </View>
        
        <View style={styles.row}>
          <Text style={styles.label}>Indice:</Text>
          <Text style={styles.value}>{eye.index || '-'}</Text>
        </View>
        
        <View style={styles.row}>
          <Text style={styles.label}>Matériau:</Text>
          <Text style={styles.value}>{eye.material || '-'}</Text>
        </View>
        
        {/* Traitements */}
        {eye.coatings && eye.coatings.length > 0 && (
          <View style={styles.row}>
            <Text style={styles.label}>Traitements:</Text>
            <Text style={styles.value}>{eye.coatings.map((c: string) => treatmentNames[c] || c).join(', ')}</Text>
          </View>
        )}
        
        {/* Teinte */}
        {tintText && (
          <View style={styles.row}>
            <Text style={styles.label}>Teinte:</Text>
            <Text style={styles.value}>{tintText}</Text>
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
          documentType="FACTURE"
          documentNumber={data.number}
          date={data.date}
        />

        {/* Client */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Client</Text>
          <Text>{data.client_name}</Text>
          {data.client_phone && <Text>Tél: {data.client_phone}</Text>}
          {data.client_email && <Text>Email: {data.client_email}</Text>}
          {data.client_address && <Text>Adresse: {data.client_address}</Text>}
        </View>

        {/* Détails des verres (avec traitements et teinte) */}
        {(data.right_eye || data.left_eye) && (
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Caractéristiques des verres</Text>
            {renderEyeDetails(data.right_eye, 'ŒIL DROIT (OD)')}
            {renderEyeDetails(data.left_eye, 'ŒIL GAUCHE (OG)')}
          </View>
        )}

        {/* Articles */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Articles</Text>
          <View style={styles.tableHeader}>
            <Text style={styles.colRef}>Réf.</Text>
            <Text style={styles.colDesc}>Désignation</Text>
            <Text style={styles.colQty}>Qté</Text>
            <Text style={styles.colPrice}>Prix HT</Text>
            <Text style={styles.colTotal}>Total HT</Text>
          </View>
          {data.items.map((item, idx) => (
            <View key={idx} style={styles.tableRow}>
              <Text style={styles.colRef}>{item.reference || '-'}</Text>
              <Text style={styles.colDesc}>{item.description}</Text>
              <Text style={styles.colQty}>{item.quantity}</Text>
              <Text style={styles.colPrice}>{item.unit_price.toFixed(2)} DH</Text>
              <Text style={styles.colTotal}>{item.total.toFixed(2)} DH</Text>
            </View>
          ))}
        </View>

        {/* Totaux */}
        <View style={styles.totalBox}>
          <Text>Sous-total HT: {data.subtotal.toFixed(2)} DH</Text>
          <Text>TVA ({data.tax_rate}%): {data.tax_amount.toFixed(2)} DH</Text>
          <Text style={{ fontSize: 14, fontWeight: 'bold', marginTop: 5 }}>
            TOTAL TTC: {data.total.toFixed(2)} DH
          </Text>
        </View>

        {/* Montant en lettres */}
        <View style={styles.amountInWordsSection}>
          <Text style={styles.amountInWordsText}>
            Arrêté la présente facture à la somme de : {montantEnLettres(data.total)}
          </Text>
        </View>

        {/* Paiement */}
        {data.payment_method && (
          <View style={styles.paymentInfo}>
            <Text>Mode de paiement: {data.payment_method}</Text>
          </View>
        )}

        {/* Notes */}
        {data.notes && (
          <View style={styles.paymentInfo}>
            <Text style={styles.sectionTitle}>Notes</Text>
            <Text>{data.notes}</Text>
          </View>
        )}

        {/* Signatures */}
        <View style={styles.signatureSection}>
          <View style={styles.signatureBox}>
            <Text>Signature du client</Text>
            <Text style={{ marginTop: 20 }}>Bon pour accord</Text>
          </View>
          <View style={styles.signatureBox}>
            <Text>Cachet et signature</Text>
            <Text style={{ marginTop: 20 }}>{settings?.company_name || 'MARZOUK OPTIQUE'}</Text>
          </View>
        </View>

        <CompanyFooter documentNumber={data.number} showBarcode={true} />
      </Page>
    </Document>
  );
};

export default InvoicePDF;