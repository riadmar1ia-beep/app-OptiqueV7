// frontend/src/hooks/useDocumentNumber.ts
import { useState } from 'react';
import { documentService } from '../services/api';

export const useDocumentNumber = (type: 'invoice' | 'credit_note' | 'delivery_note' | 'quote') => {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const generateNumber = async (): Promise<string | null> => {
    setLoading(true);
    setError(null);
    try {
      const res = await documentService.getNextDocumentNumber(type);
      return res.data.data.document_number;
    } catch (err: any) {
      setError(err.message);
      return null;
    } finally {
      setLoading(false);
    }
  };

  return { generateNumber, loading, error };
};