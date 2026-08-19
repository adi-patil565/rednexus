// T2–T5 threshold API calls
import axios from 'axios';

export const getThresholds = () => axios.get('/api/thresholds');
export const updateThreshold = (id, data) =>
  axios.put(`/api/thresholds/${id}`, data);
