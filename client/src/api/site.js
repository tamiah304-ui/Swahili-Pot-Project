import api from './axios';

// Public
export const getSiteContent = () => api.get('/site/content');

// Admin
export const updateSection = (key, value) => api.put(`/site/content/${key}`, { value });
export const getPartnersAdmin = () => api.get('/site/partners');
export const createPartner = (formData) =>
  api.post('/site/partners', formData, { headers: { 'Content-Type': 'multipart/form-data' } });
export const updatePartner = (id, formData) =>
  api.patch(`/site/partners/${id}`, formData, { headers: { 'Content-Type': 'multipart/form-data' } });
export const deletePartner = (id) => api.delete(`/site/partners/${id}`);

export const partnerLogoUrl = (id) =>
  `${import.meta.env.VITE_API_URL || 'http://localhost:5000/api'}/site/partners/${id}/logo`;

export const uploadMedia = (key, formData) =>
  api.put(`/site/media/${key}`, formData, { headers: { 'Content-Type': 'multipart/form-data' } });
export const deleteMedia = (key) => api.delete(`/site/media/${key}`);
export const mediaUrl = (key) =>
  `${import.meta.env.VITE_API_URL || 'http://localhost:5000/api'}/site/media/${key}`;
