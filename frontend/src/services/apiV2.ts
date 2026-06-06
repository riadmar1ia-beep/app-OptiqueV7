import api from './api';

export interface SalesOrder {
    id: string;
    order_number: string;
    tenant_id: string;
    client_id: string;
    status: string;
    payment_status: string;
    total_ht: number;
    total_tva: number;
    total_ttc: number;
    order_date: string;
    created_at: string;
    notes: string | null;
}

export interface OpticalJob {
    id: string;
    job_number: string;
    tenant_id: string;
    client_id: string;
    prescription_id: string | null;
    sales_order_id: string;
    right_lens_config: any;
    left_lens_config: any;
    selling_price: number;
    cost_price: number;
    status: string;
    supplier_id: string | null;
    ordered_at: string | null;
    received_at: string | null;
    created_at: string;
}

export const apiV2 = {
    getOrders: async (): Promise<SalesOrder[]> => {
        const response = await api.get('/v2/orders');
        return response.data.data;
    },

    getOrderById: async (id: string): Promise<SalesOrder> => {
        const response = await api.get(`/v2/orders/${id}`);
        return response.data.data;
    },

    getOpticalJobs: async (): Promise<OpticalJob[]> => {
        const response = await api.get('/v2/optical/jobs');
        return response.data.data;
    },

    getOpticalJobById: async (id: string): Promise<OpticalJob> => {
        const response = await api.get(`/v2/optical/jobs/${id}`);
        return response.data.data;
    },

    getTVADeclaration: async (year: number, quarter: number): Promise<any> => {
       const response = await api.get(`/v2/tva/declaration?year=${year}&quarter=${quarter}`);
       return response.data.data;
    },
};