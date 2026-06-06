import { useState, useEffect, useCallback } from 'react';
import { apiV2, SalesOrder, OpticalJob } from '../services/apiV2';

interface UseSalesOrdersResult {
    orders: SalesOrder[];
    loading: boolean;
    error: string | null;
    refresh: () => Promise<void>;
    getOrder: (id: string) => SalesOrder | undefined;
}

export const useSalesOrdersV2 = (): UseSalesOrdersResult => {
    const [orders, setOrders] = useState<SalesOrder[]>([]);
    const [loading, setLoading] = useState<boolean>(true);
    const [error, setError] = useState<string | null>(null);

    const fetchOrders = useCallback(async () => {
        setLoading(true);
        setError(null);
        try {
            const data = await apiV2.getOrders();
            setOrders(data);
        } catch (err: any) {
            setError(err.message || 'Erreur lors du chargement des commandes');
            console.error('Erreur fetchOrders V2:', err);
        } finally {
            setLoading(false);
        }
    }, []);

    const getOrder = useCallback((id: string) => {
        return orders.find(order => order.id === id);
    }, [orders]);

    useEffect(() => {
        fetchOrders();
    }, [fetchOrders]);

    return {
        orders,
        loading,
        error,
        refresh: fetchOrders,
        getOrder,
    };
};

// Interface pour les jobs agrégés
interface AggregatedOpticalJob {
    sales_order_id: string;
    total_selling_price: number;
    total_cost_price: number;
    job_count: number;
    supplier_id?: string | null;
}

export const useOpticalJobsV2 = () => {
    const [jobs, setJobs] = useState<OpticalJob[]>([]);
    const [aggregatedJobs, setAggregatedJobs] = useState<AggregatedOpticalJob[]>([]);
    const [loading, setLoading] = useState<boolean>(true);
    const [error, setError] = useState<string | null>(null);

    const fetchJobs = useCallback(async () => {
        setLoading(true);
        setError(null);
        try {
            const data = await apiV2.getOpticalJobs();
            setJobs(data);
            
            // Agréger les jobs par commande
            const aggregated = data.reduce((acc: AggregatedOpticalJob[], job) => {
                const existing = acc.find(j => j.sales_order_id === job.sales_order_id);
                if (existing) {
                    existing.total_selling_price += job.selling_price;
                    existing.total_cost_price += job.cost_price;
                    existing.job_count += 1;
                } else {
                    acc.push({
                        sales_order_id: job.sales_order_id,
                        total_selling_price: job.selling_price,
                        total_cost_price: job.cost_price,
                        job_count: 1,
                        supplier_id: job.supplier_id
                    });
                }
                return acc;
            }, []);
            
            setAggregatedJobs(aggregated);
        } catch (err: any) {
            setError(err.message || 'Erreur lors du chargement des jobs optiques');
            console.error('Erreur fetchOpticalJobs V2:', err);
        } finally {
            setLoading(false);
        }
    }, []);

    useEffect(() => {
        fetchJobs();
    }, [fetchJobs]);

    return {
        jobs,
        aggregatedJobs,
        loading,
        error,
        refresh: fetchJobs,
        getJobsByOrderId: (orderId: string) => jobs.filter(job => job.sales_order_id === orderId),
        getAggregatedByOrderId: (orderId: string) => aggregatedJobs.find(job => job.sales_order_id === orderId),
    };
};