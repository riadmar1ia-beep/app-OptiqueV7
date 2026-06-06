// frontend/src/components/Documents/PrintButton.tsx
import React, { useState } from 'react';
import { Button, message } from 'antd';
import { PrinterOutlined } from '@ant-design/icons';
import { pdf } from '@react-pdf/renderer';
import InvoicePDF from './PDF/InvoicePDF';
import QuotePDF from './PDF/QuotePDF';
import LabOrderPDF from './PDF/LabOrderPDF';
import PurchaseOrderPDF from './PDF/PurchaseOrderPDF';
import CreditNotePDF from './PDF/CreditNotePDF';

interface PrintButtonProps {
  type: 'invoice' | 'quote' | 'lab_order' | 'purchase_order' | 'credit_note';
  data: any;
  settings?: any;
  buttonText?: string;
  buttonType?: 'primary' | 'default' | 'dashed';
}

const PrintButton: React.FC<PrintButtonProps> = ({ 
  type, 
  data, 
  settings, 
  buttonText = 'Imprimer',
  buttonType = 'primary'
}) => {
  const [loading, setLoading] = useState(false);

  const getPdfComponent = () => {
    switch (type) {
      case 'invoice':
        return <InvoicePDF data={data} settings={settings} />;
      case 'quote':
        return <QuotePDF data={data} settings={settings} />;
      case 'lab_order':
        return <LabOrderPDF data={data} settings={settings} />;
      case 'purchase_order':
        return <PurchaseOrderPDF data={data} settings={settings} />;
      case 'credit_note':
        return <CreditNotePDF data={data} settings={settings} />;
      default:
        return null;
    }
  };

  const handlePrint = async () => {
    setLoading(true);
    try {
      const pdfComponent = getPdfComponent();
      if (!pdfComponent) throw new Error('Composant PDF non trouvé');
      
      const blob = await pdf(pdfComponent).toBlob();
      const url = URL.createObjectURL(blob);
      
      const printWindow = window.open(url);
      if (printWindow) {
        printWindow.onload = () => {
          printWindow.print();
        };
      }
      
      setTimeout(() => {
        URL.revokeObjectURL(url);
      }, 1000);
      
    } catch (error) {
      console.error('Erreur:', error);
      message.error('Erreur lors de la génération du PDF');
    } finally {
      setLoading(false);
    }
  };

  return (
    <Button
      type={buttonType}
      icon={<PrinterOutlined />}
      onClick={handlePrint}
      loading={loading}
    >
      {buttonText}
    </Button>
  );
};

export default PrintButton;