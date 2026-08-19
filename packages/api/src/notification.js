// Notification API calls
import axios from 'axios';

export const sendAlert = (data) => axios.post('/api/notifications', data);
export const getNotifications = () => axios.get('/api/notifications');
