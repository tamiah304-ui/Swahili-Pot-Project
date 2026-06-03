import api from './axios';

export const getTasks = () => api.get('/tasks');
export const createTask = (data) => api.post('/tasks', data);
export const updateTaskStatus = (id, status) => api.patch(`/tasks/${id}/status`, { status });
