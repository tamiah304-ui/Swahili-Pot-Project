import api from './axios';

export const getInquiries = () => api.get('/inquiries');
export const createInquiry = (data) => api.post('/inquiries', data);
export const getInquiry = (id) => api.get(`/inquiries/${id}`);
export const replyInquiry = (id, body) => api.post(`/inquiries/${id}/messages`, { body });
