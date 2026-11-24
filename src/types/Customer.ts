export interface Customer {
    name: string;
    phone: string;
    assignedAt: string; // Görüşme tarihi
    status?: string; // Opsiyonel alan
    lastContactDate?: string; // Opsiyonel alan
} 