// frontend/src/components/Documents/PDF/CreditNotePDF.tsx
import React from 'react';
import { Document, Page, View, Text } from '@react-pdf/renderer';
import CompanyHeader from '../Templates/CompanyHeader';
import CompanyFooter from '../Templates/CompanyFooter';
import { documentStyles } from '../Templates/DocumentStyles';

interface CreditNotePDFProps {
  data: {
    number: string;
    date: string;
    original_invoice: string;
    client_name: string;
    client_address?: string;
    reason: string;
    items: Array<{
      description: string;
      quantity: number;
      unit_price: number;
      total: number;
    }>;
    subtotal: number;
    tax_rate: number;
    tax_amount: number;
    total: number;
  };
  settings: any;
}

const CreditNotePDF: React.FC<CreditNotePDFProps> = ({ data, settings }) => {
  return (
    <Document>
      <Page size="A4" style={documentStyles.page}>
        <CompanyHeader
          settings={settings}
          documentType="AVOIR"
          documentNumber={data.number}
          date={data.date}
        />

        {/* Avis important */}
        <View style={{ ...documentStyles.customerSection, backgroundColor: '#fff7e6', marginBottom: 10 }}>
          <Text style={{ color: '#fa8c16', fontWeight: 'bold' }}>⚠️ DOCUMENT COMPTABLE</Text>
          <Text style={{ fontSize: 9, marginTop: 5 }}>
            Cet avoir annule et remplace la facture originale N° {data.original_invoice}
          </Text>
        </View>

        {/* Client */}
        <View style={documentStyles.customerSection}>
          <Text style={documentStyles.sectionTitle}>Client</Text>
          <Text>{data.client_name}</Text>
          {data.client_address && <Text>{data.client_address}</Text>}
        </View>

        {/* Motif */}
        <View style={{ ...documentStyles.customerSection, backgroundColor: '#fff2f0', marginBottom: 10 }}>
          <Text style={documentStyles.sectionTitle}>Motif de l'avoir</Text>
          <Text>{data.reason}</Text>
        </View>

        {/* Tableau des articles */}
        <View style={documentStyles.table}>
          <View style={documentStyles.tableHeader}>
            <Text style={documentStyles.colDesc}>Désignation</Text>
            <Text style={documentStyles.colQty}>Qté</Text>
            <Text style={documentStyles.colPrice}>Prix HT</Text>
            <Text style={documentStyles.colTotal}>Total HT</Text>
          </View>
          
          {data.items.map((item, index) => (
            <View style={documentStyles.tableRow} key={index}>
              <Text style={documentStyles.colDesc}>{item.description}</Text>
              <Text style={documentStyles.colQty}>{item.quantity}</Text>
              <Text style={documentStyles.colPrice}>{item.unit_price.toFixed(2)} DH</Text>
              <Text style={documentStyles.colTotal}>{item.total.toFixed(2)} DH</Text>
            </View>
          ))}
        </View>

        {/* Totaux */}
        <View style={documentStyles.totalsSection}>
          <View style={documentStyles.totalRow}>
            <Text style={documentStyles.totalLabel}>Total HT à créditer:</Text>
            <Text style={documentStyles.totalValue}>{data.subtotal.toFixed(2)} DH</Text>
          </View>
          <View style={documentStyles.totalRow}>
            <Text style={documentStyles.totalLabel}>TVA ({data.tax_rate}%):</Text>
            <Text style={documentStyles.totalValue}>{data.tax_amount.toFixed(2)} DH</Text>
          </View>
          <View style={[documentStyles.totalRow, documentStyles.grandTotal]}>
            <Text style={documentStyles.totalLabel}>Total TTC à créditer:</Text>
            <Text style={documentStyles.totalValue}>{data.total.toFixed(2)} DH</Text>
          </View>
        </View>

        {/* Validité */}
        <View style={documentStyles.paymentInfo}>
          <Text style={documentStyles.sectionTitle}>Validité de l'avoir</Text>
          <Text>✓ Cet avoir est valable pour déduction sur votre prochaine facture</Text>
          <Text>✓ Valable 12 mois à compter de la date d'émission</Text>
        </View>

        <CompanyFooter documentNumber={data.number} showBarcode={true} />
      </Page>
    </Document>
  );
};

export default CreditNotePDF;