// frontend/src/components/Documents/PDF/PurchaseOrderPDF.tsx
import React from 'react';
import { Document, Page, View, Text } from '@react-pdf/renderer';
import CompanyHeader from '../Templates/CompanyHeader';
import CompanyFooter from '../Templates/CompanyFooter';
import { documentStyles } from '../Templates/DocumentStyles';

interface PurchaseOrderPDFProps {
  data: {
    order_id: string;
    date: string;
    supplier_name: string;
    supplier_address?: string;
    items: Array<{
      reference: string;
      description: string;
      quantity: number;
      unit_price: number;
      total: number;
    }>;
    subtotal: number;
    tax_rate: number;
    tax_amount: number;
    total: number;
    notes?: string;
  };
  settings: any;
}

const PurchaseOrderPDF: React.FC<PurchaseOrderPDFProps> = ({ data, settings }) => {
  return (
    <Document>
      <Page size="A4" style={documentStyles.page}>
        <CompanyHeader
          settings={settings}
          documentType="BON DE COMMANDE FOURNISSEUR"
          documentNumber={data.order_id}
          date={data.date}
        />

        {/* Fournisseur */}
        <View style={documentStyles.customerSection}>
          <Text style={documentStyles.sectionTitle}>Fournisseur</Text>
          <Text>{data.supplier_name}</Text>
          {data.supplier_address && <Text>{data.supplier_address}</Text>}
        </View>

        {/* Tableau des articles */}
        <View style={documentStyles.table}>
          <View style={documentStyles.tableHeader}>
            <Text style={documentStyles.colRef}>Réf.</Text>
            <Text style={documentStyles.colDesc}>Désignation</Text>
            <Text style={documentStyles.colQty}>Qté</Text>
            <Text style={documentStyles.colPrice}>Prix HT</Text>
            <Text style={documentStyles.colTotal}>Total HT</Text>
          </View>
          
          {data.items.map((item, index) => (
            <View style={documentStyles.tableRow} key={index}>
              <Text style={documentStyles.colRef}>{item.reference || '-'}</Text>
              <Text style={documentStyles.colDesc}>{item.description}</Text>
              <Text style={documentStyles.colQty}>{item.quantity}</Text>
              <Text style={documentStyles.colPrice}>{(item.unit_price ?? 0).toFixed(2)} DH</Text>
              <Text style={documentStyles.colTotal}>{(item.total ?? ((item.unit_price ?? 0) * (item.quantity ?? 0))).toFixed(2)} DH</Text>
            </View>
          ))}
        </View>

        {/* Totaux */}
        <View style={documentStyles.totalsSection}>
          <View style={documentStyles.totalRow}>
            <Text style={documentStyles.totalLabel}>Total HT:</Text>
            <Text style={documentStyles.totalValue}>{data.subtotal.toFixed(2)} DH</Text>
          </View>
          <View style={documentStyles.totalRow}>
            <Text style={documentStyles.totalLabel}>TVA ({data.tax_rate}%):</Text>
            <Text style={documentStyles.totalValue}>{data.tax_amount.toFixed(2)} DH</Text>
          </View>
          <View style={[documentStyles.totalRow, documentStyles.grandTotal]}>
            <Text style={documentStyles.totalLabel}>Total TTC:</Text>
            <Text style={documentStyles.totalValue}>{data.total.toFixed(2)} DH</Text>
          </View>
        </View>

        {data.notes && (
          <View style={documentStyles.paymentInfo}>
            <Text style={documentStyles.sectionTitle}>Notes</Text>
            <Text>{data.notes}</Text>
          </View>
        )}

        {/* Signatures */}
        <View style={documentStyles.signatureSection}>
          <View style={documentStyles.signatureBox}>
            <Text>Bon de commande accepté</Text>
            <Text>Cachet et signature du fournisseur</Text>
          </View>
          <View style={documentStyles.signatureBox}>
            <Text>Cachet et signature</Text>
            <Text>{settings?.company_name || 'MARZOUK OPTIQUE'}</Text>
          </View>
        </View>

        <CompanyFooter documentNumber={data.order_id} showBarcode={true} />
      </Page>
    </Document>
  );
};

export default PurchaseOrderPDF;