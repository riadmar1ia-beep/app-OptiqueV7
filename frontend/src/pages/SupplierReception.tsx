import React, { useState, useRef, useEffect } from 'react';
import { Card, Table, InputNumber, Button, message, Space, Typography } from 'antd';
import { CheckCircleOutlined, CameraOutlined, StopOutlined } from '@ant-design/icons';
import { BrowserMultiFormatReader } from '@zxing/library';
import { stockService } from '../services/api';

const { Title } = Typography;

/* ================= TYPES ================= */
type Item = {
  barcode: string;
  reference: string;
  name: string;
  quantity: number;
};

type HistoryItem = {
  id?: number;
  created_at: string;
  barcode: string;
  quantity: number;
  reference: string;
};

/* ================= HOOK SCAN ================= */
const useBarcodeScanner = (onScan: (code: string, qty: number) => void) => {
  const lastScanRef = useRef<{ code: string; time: number }>({
    code: '',
    time: 0,
  });

  const scan = (code: string, qty: number) => {
    const now = Date.now();

    if (
      lastScanRef.current.code === code &&
      now - lastScanRef.current.time < 1500
    ) {
      return;
    }

    lastScanRef.current = { code, time: now };

    if (!code) return;
    onScan(code, qty);
  };

  return { scan };
};

/* ================= HOOK CAMERA ================= */
const useCameraScanner = (onDetected: (code: string) => void) => {
  const codeReaderRef = useRef<BrowserMultiFormatReader | null>(null);
  const videoRef = useRef<HTMLVideoElement | null>(null);

  const start = () => {
    codeReaderRef.current = new BrowserMultiFormatReader();

    codeReaderRef.current.decodeFromVideoDevice(
      null,
      videoRef.current!,
      (result) => {
        if (result) {
          const code = result.getText();
          onDetected(code);
        }
      }
    );
  };

  const stop = () => {
    try {
      codeReaderRef.current?.reset();
    } catch {}
  };

  useEffect(() => {
    return () => stop();
  }, []);

  return { videoRef, start, stop };
};

/* ================= COMPONENT ================= */
const SupplierReception = () => {
  const [barcode, setBarcode] = useState('');
  const [quantity, setQuantity] = useState(1);
  const [items, setItems] = useState<Item[]>([]);
  const [history, setHistory] = useState<HistoryItem[]>([]);
  const [loading, setLoading] = useState(false);

  /* ================= SCAN LOGIC ================= */
  const handleScan = async (code: string, qty: number) => {
    try {
      const res = await stockService.getProductByBarcode(code);
      const product = res?.data?.data;

      if (!product) {
        message.error('Produit inconnu ❌');
        return;
      }

      setItems((prev) => {
        const existing = prev.find((i) => i.barcode === code);

        if (existing) {
          return prev.map((i) =>
            i.barcode === code
              ? { ...i, quantity: i.quantity + qty }
              : i
          );
        }

        return [
          ...prev,
          {
            barcode: code,
            reference: product.reference,
            name: product.name,
            quantity: qty,
          },
        ];
      });

      message.success('Produit ajouté ✔️');
    } catch {
      message.error('Erreur scan');
    } finally {
      setBarcode('');
      setQuantity(1);
    }
  };

  const { scan } = useBarcodeScanner(handleScan);

  const { videoRef, start, stop } = useCameraScanner((code) => {
    setBarcode(code);
    scan(code, quantity);
  });

  /* ================= HISTORY ================= */
  useEffect(() => {
    const fetchHistory = async () => {
      try {
        const res = await stockService.getReceptionHistory();
        setHistory(res.data?.data ?? []);
      } catch {
        message.error('Erreur chargement historique');
      }
    };

    fetchHistory();
  }, []);

  /* ================= VALIDATION ================= */
  const handleValidate = async () => {
    if (!items.length) {
      message.warning('Aucun article');
      return;
    }

    setLoading(true);

    try {
      await stockService.bulkReception({
        items: items.map((i) => ({
          barcode: i.barcode,
          qty: i.quantity,
          source: 'Fournisseur',
        })),
      });

      message.success('Réception validée 🎉');
      setItems([]);

      const res = await stockService.getReceptionHistory();
      setHistory(res.data?.data ?? []);
    } catch {
      message.error('Erreur validation');
    } finally {
      setLoading(false);
    }
  };

  /* ================= TABLES ================= */
  const itemColumns = [
    { title: 'Réf', dataIndex: 'reference' },
    { title: 'Nom', dataIndex: 'name' },
    { title: 'Code-barre', dataIndex: 'barcode' },
    { title: 'Qté', dataIndex: 'quantity' },
  ];

  const historyColumns = [
    { title: 'Date', dataIndex: 'created_at' },
    { title: 'Code-barre', dataIndex: 'barcode' },
    { title: 'Qté', dataIndex: 'quantity' },
    { title: 'Réf', dataIndex: 'reference' },
  ];

  /* ================= UI ================= */
  return (
    <Space direction="vertical" style={{ width: '100%' }} size="large">
      {/* ===== SCAN ===== */}
      <Card title={<Title level={4}>Réception fournisseur PRO</Title>}>
        <Space>
          <InputNumber
            min={1}
            value={quantity}
            onChange={(v) => setQuantity(v || 1)}
          />

          <input
            value={barcode}
            placeholder="Scan code-barre"
            autoFocus
            onChange={(e) => setBarcode(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') scan(barcode, quantity);
            }}
            style={{
              padding: 8,
              border: '1px solid #ccc',
              borderRadius: 4,
              width: 220,
            }}
          />

          <Button
            type="primary"
            icon={<CheckCircleOutlined />}
            loading={loading}
            onClick={handleValidate}
            disabled={!items.length}
          >
            Valider
          </Button>
        </Space>

        {/* ===== CAMERA ===== */}
        <div style={{ marginTop: 15 }}>
          <video
            ref={videoRef}
            style={{
              width: 300,
              borderRadius: 8,
              background: '#000',
            }}
          />

          <div style={{ marginTop: 10 }}>
            <Button
              icon={<CameraOutlined />}
              onClick={start}
              style={{ marginRight: 8 }}
            >
              Caméra
            </Button>

            <Button icon={<StopOutlined />} onClick={stop}>
              Stop
            </Button>
          </div>
        </div>

        {/* ===== ITEMS ===== */}
        {items.length > 0 && (
          <Table
            style={{ marginTop: 20 }}
            dataSource={items}
            columns={itemColumns}
            rowKey="barcode"
            pagination={false}
          />
        )}
      </Card>

      {/* ===== HISTORY ===== */}
      <Card title="Historique">
        <Table
          dataSource={history}
          columns={historyColumns}
          rowKey="id"
          pagination={{ pageSize: 8 }}
        />
      </Card>
    </Space>
  );
};

export default SupplierReception;