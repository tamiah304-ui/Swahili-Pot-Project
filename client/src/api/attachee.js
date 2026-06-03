import api from './axios';

// Attachee self-service
export const getAttacheeDashboard = () => api.get('/attachee/dashboard');
export const getTodayCheckin = () => api.get('/attachee/checkin/today');
export const checkInNow = () => api.post('/attachee/checkin');
export const checkOutNow = () => api.patch('/attachee/checkout');

export const getReminders = () => api.get('/attachee/reminders');
export const createReminder = (data) => api.post('/attachee/reminders', data);
export const updateReminder = (id, data) => api.patch(`/attachee/reminders/${id}`, data);
export const deleteReminder = (id) => api.delete(`/attachee/reminders/${id}`);

// Staff views
export const getDeptAttachees = () => api.get('/attachee/list');
export const getDeptCheckins = () => api.get('/attachee/checkins/department');
