// T1 usage/inventory API calls
import axios from 'axios';

export const getUsageStats = () => axios.get('/api/usage');
